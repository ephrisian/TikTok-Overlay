import { 
  TikTokLiveConnection, 
  RouteConfig, 
  RoomIdRouteConfig, 
  IsLiveRouteConfig 
} from 'tiktok-live-connector';
import { eventsRouter } from './eventsRouter.ts';
import { streamStatsEngine } from './streamStatsEngine.ts';
import { ConnectorState, ConnectorStatus } from './types.ts';

// 100% Free Direct Mode: Disable external provider fallbacks and signing server routes
try {
  if (RoomIdRouteConfig) {
    (RoomIdRouteConfig as any).skipFetchRoomIdFromEulerRoute = true;
  }
  if (IsLiveRouteConfig) {
    (IsLiveRouteConfig as any).skipFetchRoomIdFromEulerRoute = true;
  }
  if (RouteConfig) {
    (RouteConfig as any).fetchWebcastSignatureFromProvider = async () => ({
      response: {}
    });
    (RouteConfig as any).fetchSignedWebSocketFromProvider = async () => ({
      response: {}
    });
    (RouteConfig as any).fetchRoomIdFromProvider = async () => {
      throw new Error('External provider disabled');
    };
    (RouteConfig as any).fetchRoomInfoFromProvider = async () => {
      throw new Error('External provider disabled');
    };
    (RouteConfig as any).fetchRoomGiftsFromProvider = async () => {
      throw new Error('External provider disabled');
    };
  }
} catch (_) {}

const MOCK_NAMES = [
  'ValkyrieQueen', 'GlitchGamer', 'ShadowWolf99', 'CosmicRider',
  'TokyoDrifter', 'NovaPulse', 'HyperSpeed', 'LunaEclipse',
  'ZenMaster', 'PixelSamurai', 'MysticBlade', 'CyberGhost'
];

const MOCK_CHATS = [
  'LETS GOOOO! 🔥🔥🔥',
  'Nice overlay setup!!',
  'Boss incoming grab your gear!',
  'Double tap the screen guys! ❤️',
  'Sending Galaxy gift right now 🌌',
  'Drop into the Pachinko board!!',
  'Who is top of the leaderboard?',
  'First time here, loving the vibes!',
  'GG WP everyone!',
  'Hit the like button fast!!'
];

const MOCK_GIFTS = [
  { id: 1, name: 'Rose 🌹', diamonds: 1 },
  { id: 2, name: 'TikTok Donut 🍩', diamonds: 10 },
  { id: 3, name: 'Cap & Moustache 🎩', diamonds: 99 },
  { id: 4, name: 'Galaxy 🌌', diamonds: 1000 },
  { id: 5, name: 'Lion 🦁', diamonds: 29999 }
];

export class TikTokClientManager {
  private tiktokConnection: TikTokLiveConnection | null = null;
  private state: ConnectorState = {
    status: 'disconnected',
    username: '',
    viewerCount: 18,
    lastEventAt: Date.now()
  };
  private onStateChange: ((state: ConnectorState) => void) | null = null;
  private autoSimInterval: NodeJS.Timeout | null = null;

  public setCallback(callback: (state: ConnectorState) => void) {
    this.onStateChange = callback;
  }

  public getState(): ConnectorState {
    return this.state;
  }

  public async connect(rawUsername: string, options?: { sessionId?: string }) {
    if (!rawUsername) return;
    const username = rawUsername.replace(/^@/, '').trim();
    streamStatsEngine.setStreamer(username);

    if (this.tiktokConnection) {
      try {
        this.tiktokConnection.disconnect();
      } catch (_) {}
      this.tiktokConnection = null;
    }

    this.state = {
      status: 'connecting',
      username,
      viewerCount: this.state.viewerCount,
      lastEventAt: Date.now(),
      errorMessage: undefined,
      sessionId: options?.sessionId
    };
    this.notify();

    try {
      const connConfig: any = {
        processInitialData: true,
        enableExtendedGiftInfo: false,
        enableRequestPolling: true,
        requestPollingIntervalMs: 1000
      };

      if (options?.sessionId) {
        connConfig.sessionId = options.sessionId;
      }

      this.tiktokConnection = new TikTokLiveConnection(username, connConfig);

      this.bindEvents(this.tiktokConnection, username);

      const state = await this.tiktokConnection.connect();

      this.state = {
        status: 'connected',
        username,
        roomInfo: state?.roomInfo,
        viewerCount: state?.roomInfo?.user_count || 25,
        lastEventAt: Date.now(),
        sessionId: options?.sessionId
      };
      if (state?.roomInfo?.user_count) {
        streamStatsEngine.onViewerCount(state.roomInfo.user_count);
      }
      this.notify();
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      let cleanStatus: ConnectorStatus = 'error';
      let userFriendlyMessage = 'Unable to connect to live TikTok room.';

      if (
        msg.includes("isn't online") || 
        msg.includes('not online') || 
        msg.includes('offline') || 
        msg.includes('LIVE has ended') ||
        msg.includes('Failed to retrieve Room ID')
      ) {
        cleanStatus = 'offline';
        userFriendlyMessage = `@${username} is not currently live on TikTok. Switch to the built-in Offline Live Simulator below to test all overlay interactions!`;
      } else {
        userFriendlyMessage = msg || 'Could not connect to live room. Use the Offline Live Simulator below!';
      }

      this.state = {
        status: cleanStatus,
        username,
        viewerCount: this.state.viewerCount,
        lastEventAt: Date.now(),
        errorMessage: userFriendlyMessage,
        sessionId: options?.sessionId
      };
      this.notify();
    }
  }

  public disconnect() {
    if (this.tiktokConnection) {
      try {
        this.tiktokConnection.disconnect();
      } catch (_) {}
      this.tiktokConnection = null;
    }
    this.state = {
      status: 'disconnected',
      username: this.state.username,
      viewerCount: 0,
      lastEventAt: Date.now(),
      sessionId: this.state.sessionId
    };
    this.notify();
  }

  private bindEvents(connection: TikTokLiveConnection, username: string) {
    const conn = connection as any;
    conn.on('connected', () => {
      this.state.status = 'connected';
      this.state.lastEventAt = Date.now();
      this.notify();
    });

    conn.on('chat', (data: any) => {
      this.state.lastEventAt = Date.now();
      eventsRouter.handleChat({
        userId: String(data.userId || data.uniqueId || 'viewer'),
        username: data.uniqueId || data.nickname || 'Viewer',
        comment: data.comment || '',
        pfpUrl: data.profilePictureUrl
      });
      this.notify();
    });

    conn.on('like', (data: any) => {
      this.state.lastEventAt = Date.now();
      eventsRouter.handleLike({
        userId: String(data.userId || data.uniqueId || 'viewer'),
        username: data.uniqueId || data.nickname || 'Viewer',
        likeCount: data.likeCount || 1,
        totalLikes: data.totalLikeCount,
        pfpUrl: data.profilePictureUrl
      });
      this.notify();
    });

    conn.on('gift', (data: any) => {
      this.state.lastEventAt = Date.now();
      eventsRouter.handleGift({
        userId: String(data.userId || data.uniqueId || 'viewer'),
        username: data.uniqueId || data.nickname || 'Viewer',
        giftId: data.giftId || 1,
        giftName: data.giftName || 'Gift',
        diamondCount: data.diamondCount || 1,
        repeatCount: data.repeatCount || 1,
        pfpUrl: data.profilePictureUrl
      });
      this.notify();
    });

    conn.on('member', (data: any) => {
      this.state.lastEventAt = Date.now();
      eventsRouter.handleJoin({
        userId: String(data.userId || data.uniqueId || 'viewer'),
        username: data.uniqueId || data.nickname || 'Viewer',
        nickname: data.nickname,
        pfpUrl: data.profilePictureUrl
      });
      this.notify();
    });

    conn.on('follow', (data: any) => {
      this.state.lastEventAt = Date.now();
      eventsRouter.handleFollow({
        userId: String(data.userId || data.uniqueId || 'viewer'),
        username: data.uniqueId || data.nickname || 'Viewer',
        pfpUrl: data.profilePictureUrl
      });
    });

    conn.on('share', (data: any) => {
      this.state.lastEventAt = Date.now();
      eventsRouter.handleShare({
        userId: String(data.userId || data.uniqueId || 'viewer'),
        username: data.uniqueId || data.nickname || 'Viewer',
        pfpUrl: data.profilePictureUrl
      });
    });

    conn.on('roomUser', (data: any) => {
      if (data?.viewerCount) {
        this.state.viewerCount = data.viewerCount;
        streamStatsEngine.onViewerCount(data.viewerCount);
        this.notify();
      }
    });

    conn.on('streamEnd', () => {
      this.state.status = 'offline';
      this.state.errorMessage = `@${username} is no longer live.`;
      this.notify();
    });

    conn.on('disconnected', () => {
      this.state.status = 'disconnected';
      this.notify();
    });

    conn.on('error', (err: any) => {
      console.log('[TikTok-Live-Connector] Notice:', err?.message || err);
      if (this.state.status === 'connected') {
        this.state.errorMessage = err?.message || 'Connection notice from TikTok';
        this.notify();
      }
    });
  }

  // --- OFFLINE EVENT SIMULATOR METHODS (Full localhost operation) ---
  public simulateJoin(customUsername?: string, isReturning = false) {
    const username = customUsername || MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)] + (isReturning ? '' : Math.floor(Math.random() * 89 + 10));
    const userId = 'sim_' + username.toLowerCase();
    const pfpUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

    return eventsRouter.handleJoin({
      userId,
      username,
      nickname: username,
      pfpUrl
    });
  }

  public simulateChat(customMessage?: string, customUsername?: string) {
    const username = customUsername || MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
    const userId = 'sim_' + username.toLowerCase();
    const comment = customMessage || MOCK_CHATS[Math.floor(Math.random() * MOCK_CHATS.length)];
    const pfpUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

    return eventsRouter.handleChat({
      userId,
      username,
      comment,
      pfpUrl
    });
  }

  public simulateLike(count = 50, customUsername?: string) {
    const username = customUsername || MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
    const userId = 'sim_' + username.toLowerCase();
    const pfpUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

    return eventsRouter.handleLike({
      userId,
      username,
      likeCount: count,
      pfpUrl
    });
  }

  public simulateGift(giftName?: string, count = 1, customUsername?: string) {
    const username = customUsername || MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
    const userId = 'sim_' + username.toLowerCase();
    const pfpUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;
    const gift = MOCK_GIFTS.find(g => g.name.toLowerCase().includes((giftName || '').toLowerCase())) || MOCK_GIFTS[Math.floor(Math.random() * MOCK_GIFTS.length)];

    return eventsRouter.handleGift({
      userId,
      username,
      giftId: gift.id,
      giftName: gift.name,
      diamondCount: gift.diamonds,
      repeatCount: count,
      pfpUrl
    });
  }

  public toggleAutoSimulator(enable?: boolean): boolean {
    if (enable === undefined) {
      enable = !this.autoSimInterval;
    }

    if (enable) {
      if (this.autoSimInterval) clearInterval(this.autoSimInterval);
      this.autoSimInterval = setInterval(() => {
        const rand = Math.random();
        if (rand < 0.35) {
          this.simulateLike(Math.floor(Math.random() * 25 + 5));
        } else if (rand < 0.70) {
          this.simulateChat();
        } else if (rand < 0.88) {
          this.simulateJoin();
        } else {
          this.simulateGift();
        }
      }, 3500);
      return true;
    } else {
      if (this.autoSimInterval) {
        clearInterval(this.autoSimInterval);
        this.autoSimInterval = null;
      }
      return false;
    }
  }

  public isAutoSimActive(): boolean {
    return !!this.autoSimInterval;
  }

  private notify() {
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }
}

export const tiktokClient = new TikTokClientManager();
