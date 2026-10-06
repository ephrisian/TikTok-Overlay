// Shared backend and frontend types for TikTok Stream Overlay Orchestrator

export type AspectRatio = '9:16' | '16:9';

export type AnchorQuadrant = 
  | 'TOP_LEFT'
  | 'TOP_CENTER'
  | 'TOP_RIGHT'
  | 'MIDDLE_LEFT'
  | 'MIDDLE_CENTER'
  | 'MIDDLE_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_CENTER'
  | 'BOTTOM_RIGHT';

export type BuddyType = 'circle' | 'square' | 'hexagon' | 'shield' | 'star' | 'heart';

export type RarityTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface TikTokUser {
  id: string;
  username: string;
  nickname?: string;
  pfp_url: string;
  first_seen: number;
  last_seen: number;
  total_watch_time_ms: number;
  streams_attended: number;
  total_chat_messages: number;
  total_likes: number;
  total_gifts: number;
  rarity_tier?: RarityTier;
  glow_color?: string;
  buddy_type?: BuddyType;
  seat_index?: number;
}

export interface StreamSession {
  id: string;
  started_at: number;
  ended_at: number | null;
  title: string;
  total_viewers: number;
  total_likes: number;
  total_gifts: number;
  total_chats: number;
  is_active: boolean;
}

export interface StreamUserStats {
  stream_id: string;
  user_id: string;
  first_join_at: number;
  last_seen_at: number;
  watch_time_ms: number;
  likes: number;
  gifts: number;
  chats: number;
  shares: number;
}

// Normalized Stream Events
export type StreamEventType = 
  | 'join'
  | 'chat'
  | 'like_burst'
  | 'gift'
  | 'share'
  | 'follow'
  | 'viewer_leave';

export interface StreamEventBase {
  type: StreamEventType;
  userId: string;
  username: string;
  pfpUrl: string;
  timestamp: number;
  streamId: string;
}

export interface JoinEvent extends StreamEventBase {
  type: 'join';
  firstTime: boolean;
  firstTimeThisStream: boolean;
  returningFromBreak: boolean;
  timeAwayMs?: number;
}

export interface ChatEvent extends StreamEventBase {
  type: 'chat';
  message: string;
}

export interface LikeBurstEvent extends StreamEventBase {
  type: 'like_burst';
  count: number;
  totalLikesThisStream: number;
}

export interface GiftEvent extends StreamEventBase {
  type: 'gift';
  giftId: number | string;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  iconUrl?: string;
}

export interface ShareEvent extends StreamEventBase {
  type: 'share';
}

export interface FollowEvent extends StreamEventBase {
  type: 'follow';
}

export type NormalizedStreamEvent = 
  | JoinEvent 
  | ChatEvent 
  | LikeBurstEvent 
  | GiftEvent 
  | ShareEvent 
  | FollowEvent;

// IFTTT Rule Engine Definitions
export type ConditionOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'greater_than' 
  | 'less_than' 
  | 'greater_or_equal' 
  | 'less_or_equal' 
  | 'contains';

export interface SingleCondition {
  field: string;
  op: ConditionOperator;
  value: any;
}

export interface TriggerCondition {
  all?: SingleCondition[];
  any?: SingleCondition[];
}

export type ActionType = 
  | 'show_group'
  | 'hide_group'
  | 'play_media'
  | 'spawn_buddy'
  | 'tween_buddy'
  | 'update_leaderboard'
  | 'trigger_pachinko'
  | 'boss_damage';

export interface TriggerAction {
  type: ActionType;
  groupId?: string;
  durationMs?: number;
  textOverrides?: Record<string, string>;
  buddyType?: BuddyType;
  entryAnimation?: 'drop_from_top' | 'zoom_in' | 'fade_in' | 'pop_and_fall';
  tweenType?: 'bounce' | 'shake' | 'grow' | 'emote_popup';
  leaderboardType?: 'likes' | 'gifts' | 'watch_time' | 'streams_attended' | 'chat_messages';
  mediaUrl?: string;
  soundName?: string;
  pachinkoRarity?: RarityTier;
  // Buddy overrides (fall back to settings.buddies defaults)
  buddyLifetimeMs?: number;
  exitAnimation?: BuddyExitAnimation;
}

export type BuddyExitAnimation = 'fade' | 'slide' | 'shrink';

// Provenance + lifetime attached by the rule engine to every spawn_buddy action
export interface BuddySpawnInfo {
  instanceId: string;
  ruleId: string;
  ruleName: string;
  eventType: StreamEventType;
  lifetimeMs: number;
  exitAnimation: BuddyExitAnimation;
}

export interface BuddySettings {
  defaultLifetimeMs: number;
  defaultExitAnimation: BuddyExitAnimation;
  overflowBehavior: 'queue' | 'replace_oldest';
  maxQueue: number;
}

export type SupporterCriteria = 'tips' | 'gifted_subs' | 'bits' | 'support_score';
export type SupporterWindow = 'last_stream' | 'last_7_days' | 'last_30_days' | 'all_time';

export interface TopSupportersConfig {
  enabled: boolean;
  criteria: SupporterCriteria;
  window: SupporterWindow;
  minValue: number; // a viewer must reach this value to qualify
  maxEntries: number;
  // support_score = tips*tipWeight + subs*subWeight + cheers*bitWeight + chats*chatWeight
  weights: { tip: number; sub: number; bit: number; chat: number };
}

export interface SupporterEntry {
  userId: string;
  username: string;
  pfpUrl: string;
  value: number;
  tier: RarityTier;
}

export interface SupportersPayload {
  enabled: boolean;
  criteria: SupporterCriteria;
  window: SupporterWindow;
  entries: SupporterEntry[];
}

// Hourly per-viewer support totals, so time windows can be evaluated later
export interface SupportBucket {
  hour: number; // epoch ms floored to the hour
  streamId: string;
  userId: string;
  tips: number; // gift diamonds
  subs: number; // gifted subs / memberships
  bits: number; // cheers (likes taps) - TikTok's bits equivalent
  chats: number;
}

// Settings & Supporter Types
export type SupporterCriteria = 'diamonds' | 'likes' | 'chats' | 'support_score';
export type SupporterTimeWindow = 'current_stream' | 'last_7_days' | 'last_30_days' | 'all_time';
export type BuddyExitAnimation = 'fade' | 'slide_down' | 'shrink';

export interface OverlaySettings {
  overlayAspect: '9:16' | '16:9';
  bossFightEnabled: boolean;
  bossFightScheduleMinutes: number;
  pachinkoEnabled: boolean;
  maxBuddiesOnScreen: number;
  streamerTiktokUsername: string;
  tiktokSessionId?: string;
  // Top Stream Supporters Box Config
  showTopSupporters: boolean;
  topSupportersCriteria: SupporterCriteria;
  topSupportersTimeWindow: SupporterTimeWindow;
  topSupportersMinThreshold: number;
  topSupportersMaxDisplay: number;
  // Buddy Lifecycle & Movement Config
  buddyLifetimeSeconds: number;
  buddyExitAnimation: BuddyExitAnimation;
}

export interface TopSupporterEntry {
  username: string;
  pfpUrl: string;
  value: number;
  tier: string;
  metricLabel: string;
}

export interface IFTTTRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: TriggerCondition;
  actions: TriggerAction[];
}

// Boss Fight Types
export type BossPhase = 'incoming' | 'prep' | 'battle' | 'ended';
export type BossOutcome = 'victory' | 'defeat' | null;
export type BossAttackTriggerType = 'taps_only' | 'gifts_only' | 'both';
export type BossAttackPattern = 'random' | 'lowest_first';

export interface BossModel {
  id: string;
  name: string;
  title: string;
  type: 'fire_dragon' | 'cyber_mech' | 'slime_king' | 'void_titan';
  maxHp: number;
  currentHp: number;
  glowColor: string;
  durationSeconds: number;
}

export interface BossFightState {
  active: boolean;
  phase: BossPhase;
  outcome: BossOutcome;
  boss: BossModel;
  timeRemaining: number;
  triggerType: BossAttackTriggerType;
  attackPattern: BossAttackPattern;
  incomingText: string;
  prepText: string;
  battleHypeText: string;
  victoryText: string;
  defeatText: string;
  glowColor: string;
  participants: Record<string, { username: string; pfpUrl: string; damage: number; lastAttackAt: number }>;
  finalStriker?: { userId: string; username: string; pfpUrl: string };
  scalingCount: number;
}

// Pachinko Drop Definition
export interface PachinkoSlot {
  index: number;
  label: string;
  tier: RarityTier;
  color: string;
  glow: string;
  probability: number;
}

export interface PachinkoDropEvent {
  userId: string;
  username: string;
  pfpUrl: string;
  slotIndex: number;
  tier: RarityTier;
  glowColor: string;
  dropPathX: number[];
}

// Connector Status
export type ConnectorStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'offline';

export interface ConnectorState {
  status: ConnectorStatus;
  username: string;
  roomInfo?: any;
  errorMessage?: string;
  viewerCount: number;
  lastEventAt: number;
  sessionId?: string;
}

// WebSocket Message Types
export type WsClientType = 'overlay' | 'admin';

export interface WsMessage {
  type: 
    | 'init'
    | 'event'
    | 'action'
    | 'boss_update'
    | 'boss_attack_vfx'
    | 'pachinko_drop'
    | 'buddy_update'
    | 'supporters_update'
    | 'settings_update'
    | 'leaderboard_update'
    | 'connector_status'
    | 'stats_update'
    | 'toast_alert';
  payload: any;
  timestamp: number;
}
