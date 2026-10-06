import { 
  NormalizedStreamEvent, 
  JoinEvent, 
  ChatEvent, 
  LikeBurstEvent, 
  GiftEvent, 
  ShareEvent, 
  FollowEvent,
  TikTokUser
} from './types.ts';
import { db } from './db.ts';
import { ruleEngine } from './ruleEngine.ts';
import { bossManager } from './bossFightManager.ts';
import { pachinkoManager } from './pachinkoManager.ts';
import { streamStatsEngine } from './streamStatsEngine.ts';

const MIN_WATCH_BEFORE_SAVE_MS = 2 * 60 * 1000;
const STAGED_TTL_MS = 30 * 60 * 1000;

interface StagedViewer {
  firstSeen: number;
  lastSeen: number;
  user: TikTokUser;
}

export class EventsRouter {
  // Viewers seen for less than 2 minutes live only in memory, never in the database
  private staged = new Map<string, StagedViewer>();

  private resolveUser(raw: { userId: string; username: string; nickname?: string; pfpUrl?: string }): { user: TikTokUser; persisted: boolean } {
    const now = Date.now();
    const pfp = raw.pfpUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${raw.username}`;
    const existing = db.getUser(raw.userId);
    if (existing) {
      this.staged.delete(raw.userId);
      return { user: db.upsertUser({ id: raw.userId, username: raw.username, ...(raw.nickname ? { nickname: raw.nickname } : {}), pfp_url: raw.pfpUrl }), persisted: true };
    }

    for (const [id, v] of this.staged) {
      if (now - v.lastSeen > STAGED_TTL_MS) this.staged.delete(id);
    }

    let entry = this.staged.get(raw.userId);
    if (!entry) {
      entry = {
        firstSeen: now,
        lastSeen: now,
        user: {
          id: raw.userId,
          username: raw.username,
          nickname: raw.nickname || raw.username,
          pfp_url: pfp,
          first_seen: now,
          last_seen: now,
          total_watch_time_ms: 0,
          streams_attended: 1,
          total_chat_messages: 0,
          total_likes: 0,
          total_gifts: 0,
          rarity_tier: 'common',
          glow_color: '#10b981',
          buddy_type: 'circle'
        }
      };
      this.staged.set(raw.userId, entry);
    }
    entry.lastSeen = now;
    entry.user.last_seen = now;
    if (raw.pfpUrl) entry.user.pfp_url = raw.pfpUrl;

    if (now - entry.firstSeen >= MIN_WATCH_BEFORE_SAVE_MS) {
      this.staged.delete(raw.userId);
      const saved = db.upsertUser({
        ...entry.user,
        id: raw.userId,
        username: raw.username,
        total_watch_time_ms: now - entry.firstSeen
      });
      // Carry over what was counted while staged
      saved.total_chat_messages = entry.user.total_chat_messages;
      saved.total_likes = entry.user.total_likes;
      saved.total_gifts = entry.user.total_gifts;
      return { user: saved, persisted: true };
    }
    return { user: entry.user, persisted: false };
  }

  private onBroadcastEvent: ((event: NormalizedStreamEvent) => void) | null = null;

  public setCallbacks(
    onBroadcastEvent: (event: NormalizedStreamEvent) => void
  ) {
    this.onBroadcastEvent = onBroadcastEvent;
  }

  // Handle Join Event
  public handleJoin(raw: {
    userId: string;
    username: string;
    nickname?: string;
    pfpUrl?: string;
  }): JoinEvent {
    const currentStream = db.getCurrentStream();
    const existingUser = db.getUser(raw.userId);
    const existingStreamStats = db.getUserStreamStats(currentStream.id, raw.userId);
    const resolved = this.resolveUser(raw);

    const firstTime = !existingUser;
    const firstTimeThisStream = !existingStreamStats;
    const now = Date.now();

    let returningFromBreak = false;
    let timeAwayMs = 0;

    if (existingStreamStats) {
      timeAwayMs = now - existingStreamStats.last_seen_at;
      if (timeAwayMs > 120000) { // away for more than 2 minutes
        returningFromBreak = true;
      }
    }

    // Upsert user into CRM
    const user = resolved.user;
    if (resolved.persisted && firstTimeThisStream && existingUser) {
      user.streams_attended = existingUser.streams_attended + 1;
    }

    // Upsert stream stats (persisted viewers only)
    if (resolved.persisted) db.upsertUserStreamStats(currentStream.id, raw.userId, {});
    streamStatsEngine.onMemberJoin(raw.userId, { nickname: raw.nickname, pfpUrl: raw.pfpUrl });

    const joinEvent: JoinEvent = {
      type: 'join',
      userId: user.id,
      username: user.username,
      pfpUrl: user.pfp_url,
      timestamp: now,
      streamId: currentStream.id,
      firstTime,
      firstTimeThisStream,
      returningFromBreak,
      timeAwayMs
    };

    this.processEvent(joinEvent, user);
    return joinEvent;
  }

  // Handle Chat Event
  public handleChat(raw: {
    userId: string;
    username: string;
    comment: string;
    pfpUrl?: string;
  }): ChatEvent {
    const currentStream = db.getCurrentStream();
    const resolved = this.resolveUser(raw);
    const user = resolved.user;

    user.total_chat_messages += 1;
    if (resolved.persisted) {
      db.upsertUserStreamStats(currentStream.id, raw.userId, { chats: 1 });
      db.recordSupport(currentStream.id, raw.userId, { chats: 1 });
    }
    streamStatsEngine.onChat(raw.userId, { comment: raw.comment, nickname: raw.username, pfpUrl: raw.pfpUrl });

    const chatEvent: ChatEvent = {
      type: 'chat',
      userId: user.id,
      username: user.username,
      pfpUrl: user.pfp_url,
      timestamp: Date.now(),
      streamId: currentStream.id,
      message: raw.comment
    };

    this.processEvent(chatEvent, user);
    return chatEvent;
  }

  // Handle Like Burst
  public handleLike(raw: {
    userId: string;
    username: string;
    likeCount: number;
    totalLikes?: number;
    pfpUrl?: string;
  }): LikeBurstEvent {
    const currentStream = db.getCurrentStream();
    const resolved = this.resolveUser(raw);
    const user = resolved.user;

    const burstCount = Math.max(1, raw.likeCount || 1);
    user.total_likes += burstCount;
    let likesThisStream = burstCount;
    if (resolved.persisted) {
      likesThisStream = db.upsertUserStreamStats(currentStream.id, raw.userId, { likes: burstCount }).likes;
      db.recordSupport(currentStream.id, raw.userId, { bits: burstCount });
    }
    streamStatsEngine.onLike(raw.userId, { likeCount: burstCount, nickname: raw.username, pfpUrl: raw.pfpUrl, totalLikes: raw.totalLikes });

    // In Boss Fight mode, register tap attack!
    if (bossManager.getState().active && bossManager.getState().phase === 'battle') {
      bossManager.registerAttack(user.id, user.username, user.pfp_url, 'tap', burstCount);
    }

    const likeEvent: LikeBurstEvent = {
      type: 'like_burst',
      userId: user.id,
      username: user.username,
      pfpUrl: user.pfp_url,
      timestamp: Date.now(),
      streamId: currentStream.id,
      count: burstCount,
      totalLikesThisStream: likesThisStream
    };

    this.processEvent(likeEvent, user);
    return likeEvent;
  }

  // Handle Gift Event
  public handleGift(raw: {
    userId: string;
    username: string;
    giftId: number | string;
    giftName: string;
    diamondCount: number;
    repeatCount: number;
    pfpUrl?: string;
    iconUrl?: string;
  }): GiftEvent {
    const currentStream = db.getCurrentStream();
    const resolved = this.resolveUser(raw);
    const user = resolved.user;

    const count = raw.repeatCount || 1;
    user.total_gifts += count;
    if (resolved.persisted) {
      db.upsertUserStreamStats(currentStream.id, raw.userId, { gifts: count });
      db.recordSupport(currentStream.id, raw.userId, {
        tips: count * (raw.diamondCount || 1),
        subs: /\b(sub|subscription|member|membership)\b/i.test(raw.giftName || '') ? count : 0
      });
    }
    streamStatsEngine.onGift(raw.userId, {
      giftId: Number(raw.giftId) || 1,
      giftName: raw.giftName,
      diamondCount: raw.diamondCount || 1,
      repeatCount: count,
      nickname: raw.username,
      pfpUrl: raw.pfpUrl
    });

    // In Boss Fight mode, register gift attack!
    if (bossManager.getState().active && bossManager.getState().phase === 'battle') {
      bossManager.registerAttack(user.id, user.username, user.pfp_url, 'gift', count * (raw.diamondCount || 5));
    }

    const giftEvent: GiftEvent = {
      type: 'gift',
      userId: user.id,
      username: user.username,
      pfpUrl: user.pfp_url,
      timestamp: Date.now(),
      streamId: currentStream.id,
      giftId: raw.giftId,
      giftName: raw.giftName,
      diamondCount: raw.diamondCount,
      repeatCount: count,
      iconUrl: raw.iconUrl
    };

    this.processEvent(giftEvent, user);
    return giftEvent;
  }

  // Handle Share / Repost
  public handleShare(raw: {
    userId: string;
    username: string;
    pfpUrl?: string;
  }): ShareEvent {
    const currentStream = db.getCurrentStream();
    const resolved = this.resolveUser(raw);
    const user = resolved.user;

    if (resolved.persisted) db.upsertUserStreamStats(currentStream.id, raw.userId, { shares: 1 });
    streamStatsEngine.onShare(raw.userId, { nickname: raw.username, pfpUrl: raw.pfpUrl });

    const shareEvent: ShareEvent = {
      type: 'share',
      userId: user.id,
      username: user.username,
      pfpUrl: user.pfp_url,
      timestamp: Date.now(),
      streamId: currentStream.id
    };

    this.processEvent(shareEvent, user);
    return shareEvent;
  }

  // Handle Follow
  public handleFollow(raw: {
    userId: string;
    username: string;
    pfpUrl?: string;
  }): FollowEvent {
    const currentStream = db.getCurrentStream();
    const resolved = this.resolveUser(raw);
    const user = resolved.user;

    streamStatsEngine.onFollow(raw.userId, { nickname: raw.username, pfpUrl: raw.pfpUrl });

    const followEvent: FollowEvent = {
      type: 'follow',
      userId: user.id,
      username: user.username,
      pfpUrl: user.pfp_url,
      timestamp: Date.now(),
      streamId: currentStream.id
    };

    this.processEvent(followEvent, user);
    return followEvent;
  }

  private processEvent(event: NormalizedStreamEvent, user: any) {
    if (this.onBroadcastEvent) {
      this.onBroadcastEvent(event);
    }
    // Evaluate IFTTT triggers
    ruleEngine.evaluate(event, user);
  }
}

export const eventsRouter = new EventsRouter();
