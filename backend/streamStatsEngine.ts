/**
 * TikTok Live Stream Stats Engine
 * Integrated from llamaXc/tiktok-live-stream-stats
 * 
 * Provides real-time user database tracking, time-series interval metrics,
 * velocity calculations (likes/min, chats/min, diamonds/min), scoreboards,
 * and session report exports.
 */

export interface TikTokAccountInformation {
  displayName: string;
  uniqueId: string;
  followers?: number;
  followsHost?: boolean;
  topGifterRank?: number;
  profilePictureUrl?: string;
}

export interface StreamUserData {
  likes: number;
  comments: number;
  shares: number;
  giftValue: number; // In TikTok Diamonds
  accountInfo: TikTokAccountInformation;
  latestInteraction: number;
}

export interface StreamDataPoint {
  timestamp: number;
  timeFormatted: string;
  viewers: number;
  likes: number;
  chats: number;
  diamonds: number;
  shares: number;
  membersJoined: number;
}

export interface StreamStatsSummary {
  streamId: string;
  streamerUsername: string;
  startTime: number;
  durationSeconds: number;
  currentViewers: number;
  peakViewers: number;
  totalLikes: number;
  totalChats: number;
  totalDiamonds: number;
  estimatedRevenueUsd: number;
  totalShares: number;
  totalFollowersGained: number;
  totalUniqueUsers: number;
  velocities: {
    likesPerMin: number;
    chatsPerMin: number;
    diamondsPerMin: number;
    joinsPerMin: number;
  };
}

export class LlamaXcStreamStatsEngine {
  private userStoreMap: Map<string, StreamUserData> = new Map();
  private streamId: string = 'stream_' + Date.now();
  private streamerUsername: string = 'babyboss.theshadow';
  private startTime: number = Date.now();

  // Cumulative room counters
  private currentViewers: number = 24;
  private peakViewers: number = 24;
  private totalLikes: number = 0;
  private totalChats: number = 0;
  private totalDiamonds: number = 0;
  private totalShares: number = 0;
  private totalFollowersGained: number = 0;

  // Windowed interval counters for velocity (per minute metrics)
  private windowedViewValues: number[] = [];
  private windowedLikes: number = 0;
  private windowedChats: number = 0;
  private windowedDiamonds: number = 0;
  private windowedJoins: number = 0;
  private windowedShares: number = 0;

  // Real-time velocities
  private likesPerMin: number = 0;
  private chatsPerMin: number = 0;
  private diamondsPerMin: number = 0;
  private joinsPerMin: number = 0;

  // Rolling time series data points (last 60 intervals)
  private timeSeries: StreamDataPoint[] = [];
  private metricIntervalId: NodeJS.Timeout | null = null;
  private onBroadcastStats: ((summary: StreamStatsSummary) => void) | null = null;

  constructor() {
    this.initSampleUsers();
    this.startIntervals();
  }

  public setBroadcastCallback(cb: (summary: StreamStatsSummary) => void) {
    this.onBroadcastStats = cb;
  }

  public setStreamer(username: string) {
    this.streamerUsername = username;
  }

  private initSampleUsers() {
    // Populate initial benchmark data so stats dashboard is immediately active
    const sampleUsers = [
      { id: 'NeonStreamer', name: 'Neon', likes: 450, comments: 28, shares: 6, diamonds: 1200, pfp: 'https://api.dicebear.com/7.x/bottts/svg?seed=NeonStreamer', rank: 1 },
      { id: 'CyberKitten', name: 'Kitten', likes: 320, comments: 42, shares: 3, diamonds: 450, pfp: 'https://api.dicebear.com/7.x/bottts/svg?seed=CyberKitten', rank: 2 },
      { id: 'PixelNinja', name: 'Ninja', likes: 210, comments: 15, shares: 1, diamonds: 150, pfp: 'https://api.dicebear.com/7.x/bottts/svg?seed=PixelNinja', rank: 3 },
      { id: 'ValkyrieQueen', name: 'Valkyrie', likes: 180, comments: 19, shares: 4, diamonds: 80, pfp: 'https://api.dicebear.com/7.x/bottts/svg?seed=ValkyrieQueen', rank: 4 }
    ];

    for (const u of sampleUsers) {
      this.userStoreMap.set(u.id, {
        likes: u.likes,
        comments: u.comments,
        shares: u.shares,
        giftValue: u.diamonds,
        accountInfo: {
          uniqueId: u.id,
          displayName: u.name,
          followers: 1240,
          followsHost: true,
          topGifterRank: u.rank,
          profilePictureUrl: u.pfp
        },
        latestInteraction: Date.now() - Math.floor(Math.random() * 60000)
      });
      this.totalLikes += u.likes;
      this.totalChats += u.comments;
      this.totalDiamonds += u.diamonds;
      this.totalShares += u.shares;
    }

    // Seed initial time series history points
    const now = Date.now();
    for (let i = 12; i >= 0; i--) {
      const t = now - i * 5000;
      const d = new Date(t);
      this.timeSeries.push({
        timestamp: t,
        timeFormatted: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`,
        viewers: Math.max(12, Math.round(24 + Math.sin(i) * 6)),
        likes: Math.max(10, Math.round(this.totalLikes - i * 35)),
        chats: Math.max(5, Math.round(this.totalChats - i * 4)),
        diamonds: Math.max(0, Math.round(this.totalDiamonds - i * 90)),
        shares: Math.max(0, Math.round(this.totalShares - Math.floor(i / 3))),
        membersJoined: Math.floor(Math.random() * 3 + 1)
      });
    }
  }

  private startIntervals() {
    if (this.metricIntervalId) clearInterval(this.metricIntervalId);

    // Collect interval snapshots every 5 seconds (matching llamaXc emitMetrics)
    this.metricIntervalId = setInterval(() => {
      this.recordIntervalSnapshot();
    }, 5000);
  }

  private recordIntervalSnapshot() {
    const avgViewers = this.windowedViewValues.length > 0 
      ? Math.round(this.windowedViewValues.reduce((a, b) => a + b, 0) / this.windowedViewValues.length)
      : this.currentViewers;
    this.windowedViewValues = [];

    // Calculate velocities (scaled to per-minute rates)
    // 5s interval multiplier = 12 (60s / 5s)
    this.likesPerMin = this.windowedLikes * 12;
    this.chatsPerMin = this.windowedChats * 12;
    this.diamondsPerMin = this.windowedDiamonds * 12;
    this.joinsPerMin = this.windowedJoins * 12;

    // Reset windowed counters
    this.windowedLikes = 0;
    this.windowedChats = 0;
    this.windowedDiamonds = 0;
    this.windowedJoins = 0;
    this.windowedShares = 0;

    const now = Date.now();
    const d = new Date(now);
    const point: StreamDataPoint = {
      timestamp: now,
      timeFormatted: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`,
      viewers: avgViewers,
      likes: this.totalLikes,
      chats: this.totalChats,
      diamonds: this.totalDiamonds,
      shares: this.totalShares,
      membersJoined: this.windowedJoins
    };

    this.timeSeries.push(point);
    // Keep last 60 points (5 minutes of high-resolution live history)
    if (this.timeSeries.length > 60) {
      this.timeSeries.shift();
    }

    if (this.onBroadcastStats) {
      this.onBroadcastStats(this.getSummary());
    }
  }

  // --- Real-Time Event Ingestion (Direct from TikTok LIVE or Simulator) ---

  public onViewerCount(count: number) {
    this.currentViewers = count;
    this.windowedViewValues.push(count);
    if (count > this.peakViewers) {
      this.peakViewers = count;
    }
  }

  public onLike(uniqueId: string, data: { likeCount: number; nickname?: string; pfpUrl?: string; totalLikes?: number }) {
    const count = data.likeCount || 1;
    this.totalLikes += count;
    this.windowedLikes += count;

    if (data.totalLikes && data.totalLikes > this.totalLikes) {
      this.totalLikes = data.totalLikes;
    }

    const existing = this.userStoreMap.get(uniqueId);
    if (existing) {
      existing.likes += count;
      existing.latestInteraction = Date.now();
      if (data.nickname) existing.accountInfo.displayName = data.nickname;
      if (data.pfpUrl) existing.accountInfo.profilePictureUrl = data.pfpUrl;
    } else {
      this.userStoreMap.set(uniqueId, {
        likes: count,
        comments: 0,
        shares: 0,
        giftValue: 0,
        accountInfo: {
          uniqueId,
          displayName: data.nickname || uniqueId,
          profilePictureUrl: data.pfpUrl
        },
        latestInteraction: Date.now()
      });
    }
  }

  public onChat(uniqueId: string, data: { comment: string; nickname?: string; pfpUrl?: string }) {
    this.totalChats += 1;
    this.windowedChats += 1;

    const existing = this.userStoreMap.get(uniqueId);
    if (existing) {
      existing.comments += 1;
      existing.latestInteraction = Date.now();
      if (data.nickname) existing.accountInfo.displayName = data.nickname;
      if (data.pfpUrl) existing.accountInfo.profilePictureUrl = data.pfpUrl;
    } else {
      this.userStoreMap.set(uniqueId, {
        likes: 0,
        comments: 1,
        shares: 0,
        giftValue: 0,
        accountInfo: {
          uniqueId,
          displayName: data.nickname || uniqueId,
          profilePictureUrl: data.pfpUrl
        },
        latestInteraction: Date.now()
      });
    }
  }

  public onGift(uniqueId: string, data: { giftId: number; giftName: string; diamondCount: number; repeatCount: number; nickname?: string; pfpUrl?: string }) {
    const diamondsGained = (data.diamondCount || 1) * (data.repeatCount || 1);
    this.totalDiamonds += diamondsGained;
    this.windowedDiamonds += diamondsGained;

    const existing = this.userStoreMap.get(uniqueId);
    if (existing) {
      existing.giftValue += diamondsGained;
      existing.latestInteraction = Date.now();
      if (data.nickname) existing.accountInfo.displayName = data.nickname;
      if (data.pfpUrl) existing.accountInfo.profilePictureUrl = data.pfpUrl;
    } else {
      this.userStoreMap.set(uniqueId, {
        likes: 0,
        comments: 0,
        shares: 0,
        giftValue: diamondsGained,
        accountInfo: {
          uniqueId,
          displayName: data.nickname || uniqueId,
          profilePictureUrl: data.pfpUrl
        },
        latestInteraction: Date.now()
      });
    }
  }

  public onMemberJoin(uniqueId: string, data: { nickname?: string; pfpUrl?: string }) {
    this.windowedJoins += 1;
    const existing = this.userStoreMap.get(uniqueId);
    if (existing) {
      existing.latestInteraction = Date.now();
    } else {
      this.userStoreMap.set(uniqueId, {
        likes: 0,
        comments: 0,
        shares: 0,
        giftValue: 0,
        accountInfo: {
          uniqueId,
          displayName: data.nickname || uniqueId,
          profilePictureUrl: data.pfpUrl
        },
        latestInteraction: Date.now()
      });
    }
  }

  public onShare(uniqueId: string, data: { nickname?: string; pfpUrl?: string }) {
    this.totalShares += 1;
    this.windowedShares += 1;
    const existing = this.userStoreMap.get(uniqueId);
    if (existing) {
      existing.shares += 1;
      existing.latestInteraction = Date.now();
    } else {
      this.userStoreMap.set(uniqueId, {
        likes: 0,
        comments: 0,
        shares: 1,
        giftValue: 0,
        accountInfo: {
          uniqueId,
          displayName: data.nickname || uniqueId,
          profilePictureUrl: data.pfpUrl
        },
        latestInteraction: Date.now()
      });
    }
  }

  public onFollow(uniqueId: string, data: { nickname?: string; pfpUrl?: string }) {
    this.totalFollowersGained += 1;
    const existing = this.userStoreMap.get(uniqueId);
    if (existing) {
      existing.accountInfo.followsHost = true;
      existing.latestInteraction = Date.now();
    }
  }

  // --- Scoreboard & Analytics Retrieval ---

  public getSummary(): StreamStatsSummary {
    const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    // 1 diamond = ~$0.005 USD payout (TikTok standard creator conversion)
    const estimatedRevenueUsd = Number((this.totalDiamonds * 0.005).toFixed(2));

    return {
      streamId: this.streamId,
      streamerUsername: this.streamerUsername,
      startTime: this.startTime,
      durationSeconds: elapsedSec,
      currentViewers: this.currentViewers,
      peakViewers: this.peakViewers,
      totalLikes: this.totalLikes,
      totalChats: this.totalChats,
      totalDiamonds: this.totalDiamonds,
      estimatedRevenueUsd,
      totalShares: this.totalShares,
      totalFollowersGained: this.totalFollowersGained,
      totalUniqueUsers: this.userStoreMap.size,
      velocities: {
        likesPerMin: this.likesPerMin,
        chatsPerMin: this.chatsPerMin,
        diamondsPerMin: this.diamondsPerMin,
        joinsPerMin: this.joinsPerMin
      }
    };
  }

  public getTimeSeries(): StreamDataPoint[] {
    return this.timeSeries;
  }

  public getTopGifters(limit = 10) {
    return Array.from(this.userStoreMap.values())
      .filter(u => u.giftValue > 0)
      .sort((a, b) => b.giftValue - a.giftValue)
      .slice(0, limit)
      .map((u, i) => ({
        rank: i + 1,
        uniqueId: u.accountInfo.uniqueId,
        displayName: u.accountInfo.displayName,
        profilePictureUrl: u.accountInfo.profilePictureUrl,
        diamonds: u.giftValue,
        estimatedUsd: Number((u.giftValue * 0.005).toFixed(2))
      }));
  }

  public getTopChatters(limit = 10) {
    return Array.from(this.userStoreMap.values())
      .filter(u => u.comments > 0)
      .sort((a, b) => b.comments - a.comments)
      .slice(0, limit)
      .map((u, i) => ({
        rank: i + 1,
        uniqueId: u.accountInfo.uniqueId,
        displayName: u.accountInfo.displayName,
        profilePictureUrl: u.accountInfo.profilePictureUrl,
        comments: u.comments
      }));
  }

  public getTopLikers(limit = 10) {
    return Array.from(this.userStoreMap.values())
      .filter(u => u.likes > 0)
      .sort((a, b) => b.likes - a.likes)
      .slice(0, limit)
      .map((u, i) => ({
        rank: i + 1,
        uniqueId: u.accountInfo.uniqueId,
        displayName: u.accountInfo.displayName,
        profilePictureUrl: u.accountInfo.profilePictureUrl,
        likes: u.likes
      }));
  }

  public getTopSharers(limit = 10) {
    return Array.from(this.userStoreMap.values())
      .filter(u => u.shares > 0)
      .sort((a, b) => b.shares - a.shares)
      .slice(0, limit)
      .map((u, i) => ({
        rank: i + 1,
        uniqueId: u.accountInfo.uniqueId,
        displayName: u.accountInfo.displayName,
        profilePictureUrl: u.accountInfo.profilePictureUrl,
        shares: u.shares
      }));
  }

  public getAllUsers(): StreamUserData[] {
    return Array.from(this.userStoreMap.values());
  }

  // --- Export Functionality (llamaXc Stats Export) ---

  public exportAsJson() {
    return {
      summary: this.getSummary(),
      timeSeries: this.getTimeSeries(),
      scoreboards: {
        topGifters: this.getTopGifters(50),
        topChatters: this.getTopChatters(50),
        topLikers: this.getTopLikers(50),
        topSharers: this.getTopSharers(50)
      },
      allUsers: this.getAllUsers()
    };
  }

  public exportAsCsv(): string {
    const summary = this.getSummary();
    const headers = 'UniqueId,DisplayName,Diamonds,EstimatedUSD,Likes,Comments,Shares,LastInteraction\n';
    const rows = Array.from(this.userStoreMap.values())
      .map(u => {
        const est = (u.giftValue * 0.005).toFixed(2);
        const last = new Date(u.latestInteraction).toISOString();
        return `"${u.accountInfo.uniqueId}","${u.accountInfo.displayName.replace(/"/g, '""')}",${u.giftValue},${est},${u.likes},${u.comments},${u.shares},"${last}"`;
      })
      .join('\n');

    return `# TikTok Live Stream Stats Export (llamaXc)\n# Streamer: @${summary.streamerUsername}\n# Start: ${new Date(summary.startTime).toISOString()}\n# Duration: ${summary.durationSeconds}s | Peak Viewers: ${summary.peakViewers} | Total Likes: ${summary.totalLikes} | Total Diamonds: ${summary.totalDiamonds}\n\n` + headers + rows;
  }

  public resetStats() {
    this.userStoreMap.clear();
    this.streamId = 'stream_' + Date.now();
    this.startTime = Date.now();
    this.currentViewers = 0;
    this.peakViewers = 0;
    this.totalLikes = 0;
    this.totalChats = 0;
    this.totalDiamonds = 0;
    this.totalShares = 0;
    this.totalFollowersGained = 0;
    this.windowedViewValues = [];
    this.windowedLikes = 0;
    this.windowedChats = 0;
    this.windowedDiamonds = 0;
    this.windowedJoins = 0;
    this.windowedShares = 0;
    this.timeSeries = [];
  }
}

export const streamStatsEngine = new LlamaXcStreamStatsEngine();
