import fs from 'fs';
import path from 'path';
import { 
  TikTokUser, 
  StreamSession, 
  StreamUserStats, 
  IFTTTRule, 
  RarityTier,
  BuddyType
} from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface DatabaseSchema {
  users: Record<string, TikTokUser>;
  currentStreamId: string;
  streams: Record<string, StreamSession>;
  streamUserStats: Record<string, Record<string, StreamUserStats>>; // streamId -> userId -> stats
  triggers: IFTTTRule[];
  settings: {
    overlayAspect: '9:16' | '16:9';
    bossFightEnabled: boolean;
    bossFightScheduleMinutes: number;
    pachinkoEnabled: boolean;
    maxBuddiesOnScreen: number;
    streamerTiktokUsername: string;
  };
}

const DEFAULT_PRESET_TRIGGERS: IFTTTRule[] = [
  {
    id: 'rule_first_time_join',
    name: 'First-Time Viewer Welcome + Pachinko Drop',
    enabled: true,
    condition: {
      all: [
        { field: 'event.type', op: 'equals', value: 'join' },
        { field: 'user.firstTime', op: 'equals', value: true }
      ]
    },
    actions: [
      {
        type: 'show_group',
        groupId: 'welcome_first_time',
        durationMs: 6000,
        textOverrides: {
          title: 'NEW VIEWER ARRIVED!',
          username: '{{user.username}}'
        }
      },
      {
        type: 'trigger_pachinko',
        durationMs: 4000
      },
      {
        type: 'spawn_buddy',
        buddyType: 'circle',
        entryAnimation: 'drop_from_top'
      }
    ]
  },
  {
    id: 'rule_returning_stream_join',
    name: 'Returning Viewer (New Stream)',
    enabled: true,
    condition: {
      all: [
        { field: 'event.type', op: 'equals', value: 'join' },
        { field: 'user.firstTime', op: 'equals', value: false },
        { field: 'user.firstTimeThisStream', op: 'equals', value: true }
      ]
    },
    actions: [
      {
        type: 'show_group',
        groupId: 'welcome_back_stream',
        durationMs: 4500,
        textOverrides: {
          title: 'WELCOME BACK!',
          username: '{{user.username}}'
        }
      },
      {
        type: 'spawn_buddy',
        buddyType: 'shield',
        entryAnimation: 'zoom_in'
      }
    ]
  },
  {
    id: 'rule_returning_from_break',
    name: 'Returning From Break (> 5 min away)',
    enabled: true,
    condition: {
      all: [
        { field: 'event.type', op: 'equals', value: 'join' },
        { field: 'user.returningFromBreak', op: 'equals', value: true },
        { field: 'event.timeAwayMs', op: 'greater_than', value: 300000 }
      ]
    },
    actions: [
      {
        type: 'show_group',
        groupId: 'bathroom_break_joke',
        durationMs: 5000,
        textOverrides: {
          title: 'BRB SURVIVED!',
          username: '{{user.username}} has returned!'
        }
      },
      {
        type: 'tween_buddy',
        tweenType: 'bounce'
      }
    ]
  },
  {
    id: 'rule_like_burst_milestone',
    name: 'Like Burst Milestone (50+ likes)',
    enabled: true,
    condition: {
      all: [
        { field: 'event.type', op: 'equals', value: 'like_burst' },
        { field: 'event.count', op: 'greater_or_equal', value: 50 }
      ]
    },
    actions: [
      {
        type: 'tween_buddy',
        tweenType: 'grow'
      },
      {
        type: 'show_group',
        groupId: 'thanks_for_likes',
        durationMs: 3000,
        textOverrides: {
          title: 'LIKE STORM!',
          username: '+{{event.count}} LIKES from {{user.username}}'
        }
      },
      {
        type: 'update_leaderboard',
        leaderboardType: 'likes'
      }
    ]
  },
  {
    id: 'rule_gift_celebration',
    name: 'Gift Shower Hype Alert',
    enabled: true,
    condition: {
      all: [
        { field: 'event.type', op: 'equals', value: 'gift' }
      ]
    },
    actions: [
      {
        type: 'tween_buddy',
        tweenType: 'emote_popup'
      },
      {
        type: 'show_group',
        groupId: 'gift_alert',
        durationMs: 5000,
        textOverrides: {
          title: 'GIFT DROP!',
          username: '{{user.username}} sent {{event.giftName}} x{{event.repeatCount}}'
        }
      },
      {
        type: 'update_leaderboard',
        leaderboardType: 'gifts'
      }
    ]
  },
  {
    id: 'rule_chat_animation',
    name: 'Chatter Bounce & Speech Bubble',
    enabled: true,
    condition: {
      all: [
        { field: 'event.type', op: 'equals', value: 'chat' }
      ]
    },
    actions: [
      {
        type: 'tween_buddy',
        tweenType: 'bounce'
      }
    ]
  }
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private initDefaults(): DatabaseSchema {
    const streamId = 'stream_' + Date.now();
    return {
      users: {
        'demo_user_1': {
          id: 'demo_user_1',
          username: 'NeonStreamer',
          nickname: 'Neon',
          pfp_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NeonStreamer',
          first_seen: Date.now() - 3600000 * 24 * 7,
          last_seen: Date.now(),
          total_watch_time_ms: 12000000,
          streams_attended: 5,
          total_chat_messages: 84,
          total_likes: 920,
          total_gifts: 15,
          rarity_tier: 'legendary',
          glow_color: '#f59e0b',
          buddy_type: 'hexagon',
          seat_index: 0
        },
        'demo_user_2': {
          id: 'demo_user_2',
          username: 'CyberKitten',
          nickname: 'Kitten',
          pfp_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=CyberKitten',
          first_seen: Date.now() - 3600000 * 24 * 3,
          last_seen: Date.now() - 10000,
          total_watch_time_ms: 7200000,
          streams_attended: 3,
          total_chat_messages: 52,
          total_likes: 450,
          total_gifts: 8,
          rarity_tier: 'epic',
          glow_color: '#8b5cf6',
          buddy_type: 'shield',
          seat_index: 1
        },
        'demo_user_3': {
          id: 'demo_user_3',
          username: 'PixelNinja',
          nickname: 'Ninja',
          pfp_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=PixelNinja',
          first_seen: Date.now() - 3600000,
          last_seen: Date.now(),
          total_watch_time_ms: 3600000,
          streams_attended: 1,
          total_chat_messages: 19,
          total_likes: 310,
          total_gifts: 2,
          rarity_tier: 'rare',
          glow_color: '#06b6d4',
          buddy_type: 'circle',
          seat_index: 2
        }
      },
      currentStreamId: streamId,
      streams: {
        [streamId]: {
          id: streamId,
          started_at: Date.now() - 1800000,
          ended_at: null,
          title: '🔥 Live Interactive TikTok Gaming & Boss Battles',
          total_viewers: 3,
          total_likes: 1680,
          total_gifts: 25,
          total_chats: 155,
          is_active: true
        }
      },
      streamUserStats: {
        [streamId]: {
          'demo_user_1': {
            stream_id: streamId,
            user_id: 'demo_user_1',
            first_join_at: Date.now() - 1800000,
            last_seen_at: Date.now(),
            watch_time_ms: 1800000,
            likes: 350,
            gifts: 10,
            chats: 42,
            shares: 2
          },
          'demo_user_2': {
            stream_id: streamId,
            user_id: 'demo_user_2',
            first_join_at: Date.now() - 1500000,
            last_seen_at: Date.now(),
            watch_time_ms: 1500000,
            likes: 210,
            gifts: 5,
            chats: 28,
            shares: 1
          },
          'demo_user_3': {
            stream_id: streamId,
            user_id: 'demo_user_3',
            first_join_at: Date.now() - 800000,
            last_seen_at: Date.now(),
            watch_time_ms: 800000,
            likes: 90,
            gifts: 1,
            chats: 12,
            shares: 0
          }
        }
      },
      triggers: DEFAULT_PRESET_TRIGGERS,
      settings: {
        overlayAspect: '9:16',
        bossFightEnabled: true,
        bossFightScheduleMinutes: 15,
        pachinkoEnabled: true,
        maxBuddiesOnScreen: 20,
        streamerTiktokUsername: 'gaminglive'
      }
    };
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Ensure default triggers are populated if empty
        if (!parsed.triggers || parsed.triggers.length === 0) {
          parsed.triggers = DEFAULT_PRESET_TRIGGERS;
        }
        return parsed;
      }
    } catch (err) {
      console.error('[DB] Failed to read db.json, initializing defaults:', err);
    }
    const initial = this.initDefaults();
    this.save(initial);
    return initial;
  }

  private save(data = this.data) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Error saving db.json:', err);
    }
  }

  // User CRM Queries
  getUser(userId: string): TikTokUser | undefined {
    return this.data.users[userId];
  }

  getAllUsers(): TikTokUser[] {
    return Object.values(this.data.users);
  }

  upsertUser(user: Partial<TikTokUser> & { id: string; username: string }): TikTokUser {
    const existing = this.data.users[user.id];
    const now = Date.now();
    if (existing) {
      const updated: TikTokUser = {
        ...existing,
        ...user,
        last_seen: now,
        pfp_url: user.pfp_url || existing.pfp_url
      };
      this.data.users[user.id] = updated;
      this.save();
      return updated;
    } else {
      const newUser: TikTokUser = {
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        pfp_url: user.pfp_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`,
        first_seen: now,
        last_seen: now,
        total_watch_time_ms: 0,
        streams_attended: 1,
        total_chat_messages: 0,
        total_likes: 0,
        total_gifts: 0,
        rarity_tier: user.rarity_tier || 'common',
        glow_color: user.glow_color || '#10b981',
        buddy_type: user.buddy_type || 'circle',
        seat_index: Object.keys(this.data.users).length
      };
      this.data.users[user.id] = newUser;
      this.save();
      return newUser;
    }
  }

  updateUserRarity(userId: string, tier: RarityTier, glowColor: string) {
    const user = this.data.users[userId];
    if (user) {
      user.rarity_tier = tier;
      user.glow_color = glowColor;
      this.save();
    }
  }

  updateUserBuddy(userId: string, buddyType: BuddyType) {
    const user = this.data.users[userId];
    if (user) {
      user.buddy_type = buddyType;
      this.save();
    }
  }

  // Stream Session Tracking
  getCurrentStream(): StreamSession {
    const curId = this.data.currentStreamId;
    if (!this.data.streams[curId]) {
      this.startNewStream('New Live Session');
    }
    return this.data.streams[this.data.currentStreamId];
  }

  startNewStream(title = 'TikTok Live Stream'): StreamSession {
    const newId = 'stream_' + Date.now();
    const session: StreamSession = {
      id: newId,
      started_at: Date.now(),
      ended_at: null,
      title,
      total_viewers: 0,
      total_likes: 0,
      total_gifts: 0,
      total_chats: 0,
      is_active: true
    };
    // Close prior stream if active
    if (this.data.currentStreamId && this.data.streams[this.data.currentStreamId]) {
      this.data.streams[this.data.currentStreamId].ended_at = Date.now();
      this.data.streams[this.data.currentStreamId].is_active = false;
    }
    this.data.currentStreamId = newId;
    this.data.streams[newId] = session;
    this.data.streamUserStats[newId] = {};
    this.save();
    return session;
  }

  getUserStreamStats(streamId: string, userId: string): StreamUserStats | undefined {
    return this.data.streamUserStats[streamId]?.[userId];
  }

  upsertUserStreamStats(
    streamId: string, 
    userId: string, 
    delta: { likes?: number; gifts?: number; chats?: number; shares?: number; watchTimeMs?: number }
  ): StreamUserStats {
    if (!this.data.streamUserStats[streamId]) {
      this.data.streamUserStats[streamId] = {};
    }
    const current = this.data.streamUserStats[streamId][userId];
    const now = Date.now();
    if (!current) {
      const created: StreamUserStats = {
        stream_id: streamId,
        user_id: userId,
        first_join_at: now,
        last_seen_at: now,
        watch_time_ms: delta.watchTimeMs || 0,
        likes: delta.likes || 0,
        gifts: delta.gifts || 0,
        chats: delta.chats || 0,
        shares: delta.shares || 0
      };
      this.data.streamUserStats[streamId][userId] = created;
      // Increment stream session totals
      const stream = this.data.streams[streamId];
      if (stream) {
        stream.total_viewers += 1;
        stream.total_likes += delta.likes || 0;
        stream.total_gifts += delta.gifts || 0;
        stream.total_chats += delta.chats || 0;
      }
      this.save();
      return created;
    } else {
      current.last_seen_at = now;
      current.watch_time_ms += delta.watchTimeMs || 0;
      current.likes += delta.likes || 0;
      current.gifts += delta.gifts || 0;
      current.chats += delta.chats || 0;
      current.shares += delta.shares || 0;

      const stream = this.data.streams[streamId];
      if (stream) {
        stream.total_likes += delta.likes || 0;
        stream.total_gifts += delta.gifts || 0;
        stream.total_chats += delta.chats || 0;
      }
      this.save();
      return current;
    }
  }

  // Leaderboard Aggregates
  getLeaderboard(type: 'likes' | 'gifts' | 'watch_time' | 'streams_attended' | 'chat_messages', limit = 5) {
    const users = Object.values(this.data.users);
    let sorted: Array<{ username: string; pfpUrl: string; value: number; tier: RarityTier }> = [];

    switch (type) {
      case 'likes':
        sorted = users
          .map(u => ({ username: u.username, pfpUrl: u.pfp_url, value: u.total_likes, tier: u.rarity_tier || 'common' }))
          .sort((a, b) => b.value - a.value);
        break;
      case 'gifts':
        sorted = users
          .map(u => ({ username: u.username, pfpUrl: u.pfp_url, value: u.total_gifts, tier: u.rarity_tier || 'common' }))
          .sort((a, b) => b.value - a.value);
        break;
      case 'watch_time':
        sorted = users
          .map(u => ({ username: u.username, pfpUrl: u.pfp_url, value: Math.round(u.total_watch_time_ms / 60000), tier: u.rarity_tier || 'common' }))
          .sort((a, b) => b.value - a.value);
        break;
      case 'streams_attended':
        sorted = users
          .map(u => ({ username: u.username, pfpUrl: u.pfp_url, value: u.streams_attended, tier: u.rarity_tier || 'common' }))
          .sort((a, b) => b.value - a.value);
        break;
      case 'chat_messages':
        sorted = users
          .map(u => ({ username: u.username, pfpUrl: u.pfp_url, value: u.total_chat_messages, tier: u.rarity_tier || 'common' }))
          .sort((a, b) => b.value - a.value);
        break;
    }

    return sorted.slice(0, limit);
  }

  // IFTTT Rules Management
  getTriggers(): IFTTTRule[] {
    return this.data.triggers;
  }

  updateTriggers(triggers: IFTTTRule[]) {
    this.data.triggers = triggers;
    this.save();
  }

  toggleTrigger(id: string, enabled: boolean) {
    const rule = this.data.triggers.find(r => r.id === id);
    if (rule) {
      rule.enabled = enabled;
      this.save();
    }
  }

  saveTrigger(rule: IFTTTRule) {
    const idx = this.data.triggers.findIndex(r => r.id === rule.id);
    if (idx >= 0) {
      this.data.triggers[idx] = rule;
    } else {
      this.data.triggers.push(rule);
    }
    this.save();
  }

  deleteTrigger(id: string) {
    this.data.triggers = this.data.triggers.filter(r => r.id !== id);
    this.save();
  }

  // Settings
  getSettings() {
    return this.data.settings;
  }

  updateSettings(settings: Partial<DatabaseSchema['settings']>) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }

  // Wipe Data: clears sample users, resets stream session and counters
  wipeData(options?: { resetRules?: boolean }) {
    this.data.users = {};
    const streamId = 'stream_' + Date.now();
    this.data.currentStreamId = streamId;
    this.data.streams = {
      [streamId]: {
        id: streamId,
        started_at: Date.now(),
        ended_at: null,
        title: 'New Clean Live Session',
        total_viewers: 0,
        total_likes: 0,
        total_gifts: 0,
        total_chats: 0,
        is_active: true
      }
    };
    this.data.streamUserStats = {
      [streamId]: {}
    };
    if (options?.resetRules) {
      this.data.triggers = DEFAULT_PRESET_TRIGGERS;
    }
    this.save();
    try {
      // Reset llamaXc stats engine
      const { streamStatsEngine } = require('./streamStatsEngine.ts');
      streamStatsEngine.resetStats();
    } catch (_) {}
    return this.getFullState();
  }

  getFullState() {
    return {
      users: this.data.users,
      currentStream: this.getCurrentStream(),
      triggers: this.data.triggers,
      settings: this.data.settings
    };
  }
}

export const db = new Database();
