import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { db } from './backend/db.ts';
import { eventsRouter } from './backend/eventsRouter.ts';
import { ruleEngine } from './backend/ruleEngine.ts';
import { bossManager } from './backend/bossFightManager.ts';
import { tiktokClient } from './backend/tiktokClient.ts';
import { pachinkoManager } from './backend/pachinkoManager.ts';
import { streamStatsEngine } from './backend/streamStatsEngine.ts';
import { WsMessage } from './backend/types.ts';

const PORT = 3000;
const app = express();
app.use(express.json());

const httpServer = createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function broadcastWs(type: WsMessage['type'], payload: any) {
  const message: WsMessage = {
    type,
    payload,
    timestamp: Date.now()
  };
  const serialized = JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  });
}

// Hook up event callbacks to broadcast over WebSocket
eventsRouter.setCallbacks(
  (event) => {
    broadcastWs('event', event);
    // Also push updated stream session info
    broadcastWs('leaderboard_update', {
      likes: db.getLeaderboard('likes'),
      gifts: db.getLeaderboard('gifts'),
      chat_messages: db.getLeaderboard('chat_messages')
    });
  },
  (drop) => {
    broadcastWs('pachinko_drop', drop);
  }
);

ruleEngine.setCallback((action) => {
  broadcastWs('action', action);
});

bossManager.setCallbacks(
  (state) => {
    broadcastWs('boss_update', state);
  },
  (vfx) => {
    broadcastWs('boss_attack_vfx', vfx);
  }
);

tiktokClient.setCallback((status) => {
  broadcastWs('connector_status', status);
});

// llamaXc Stream Stats Engine Broadcast
streamStatsEngine.setBroadcastCallback((summary) => {
  broadcastWs('stats_update', {
    summary,
    timeSeries: streamStatsEngine.getTimeSeries(),
    topGifters: streamStatsEngine.getTopGifters(5)
  });
});

// Periodic watch time counter for active users
setInterval(() => {
  const stream = db.getCurrentStream();
  if (stream && stream.is_active) {
    const users = db.getAllUsers();
    const now = Date.now();
    for (const u of users) {
      // Active in the last 4 minutes
      if (now - u.last_seen < 240000) {
        u.total_watch_time_ms += 15000;
        db.upsertUserStreamStats(stream.id, u.id, { watchTimeMs: 15000 });
      }
    }
  }
}, 15000);

// WebSocket Client Connection Handler
wss.on('connection', (ws: WebSocket) => {
  // Send initial snapshot
  const initialPayload = {
    users: db.getAllUsers(),
    currentStream: db.getCurrentStream(),
    settings: db.getSettings(),
    triggers: db.getTriggers(),
    bossState: bossManager.getState(),
    connectorState: tiktokClient.getState(),
    isAutoSimActive: tiktokClient.isAutoSimActive(),
    streamStats: streamStatsEngine.getSummary(),
    streamStatsTimeline: streamStatsEngine.getTimeSeries(),
    leaderboards: {
      likes: db.getLeaderboard('likes'),
      gifts: db.getLeaderboard('gifts'),
      chat_messages: db.getLeaderboard('chat_messages'),
      watch_time: db.getLeaderboard('watch_time'),
      streams_attended: db.getLeaderboard('streams_attended')
    }
  };

  ws.send(JSON.stringify({
    type: 'init',
    payload: initialPayload,
    timestamp: Date.now()
  }));

  ws.on('message', (data: string) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (_) {}
  });
});

// REST API Endpoints
app.get('/api/state', (req, res) => {
  res.json({
    users: db.getAllUsers(),
    currentStream: db.getCurrentStream(),
    settings: db.getSettings(),
    triggers: db.getTriggers(),
    bossState: bossManager.getState(),
    connectorState: tiktokClient.getState(),
    isAutoSimActive: tiktokClient.isAutoSimActive(),
    streamStats: streamStatsEngine.getSummary(),
    streamStatsTimeline: streamStatsEngine.getTimeSeries(),
    leaderboards: {
      likes: db.getLeaderboard('likes'),
      gifts: db.getLeaderboard('gifts'),
      chat_messages: db.getLeaderboard('chat_messages')
    }
  });
});

// TikTok Live Stream Stats (llamaXc/tiktok-live-stream-stats integration)
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    summary: streamStatsEngine.getSummary(),
    timeSeries: streamStatsEngine.getTimeSeries(),
    topGifters: streamStatsEngine.getTopGifters(20),
    topChatters: streamStatsEngine.getTopChatters(20),
    topLikers: streamStatsEngine.getTopLikers(20),
    topSharers: streamStatsEngine.getTopSharers(20)
  });
});

app.get('/api/stats/export', (req, res) => {
  const { format } = req.query;
  if (format === 'csv') {
    const csvData = streamStatsEngine.exportAsCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok_stream_stats.csv"');
    return res.send(csvData);
  }
  const jsonData = streamStatsEngine.exportAsJson();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="tiktok_stream_stats.json"');
  return res.json(jsonData);
});

app.post('/api/stats/reset', (req, res) => {
  streamStatsEngine.resetStats();
  broadcastWs('stats_update', {
    summary: streamStatsEngine.getSummary(),
    timeSeries: streamStatsEngine.getTimeSeries(),
    topGifters: streamStatsEngine.getTopGifters(5)
  });
  res.json({ success: true, summary: streamStatsEngine.getSummary() });
});

app.post('/api/connector/connect', async (req, res) => {
  const { username, sessionId } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  db.updateSettings({ streamerTiktokUsername: username });
  tiktokClient.connect(username, { sessionId });
  res.json({ success: true, status: tiktokClient.getState() });
});

app.post('/api/connector/disconnect', (req, res) => {
  tiktokClient.disconnect();
  res.json({ success: true, status: tiktokClient.getState() });
});

// Simulator API
app.post('/api/simulate', (req, res) => {
  const { action, username, message, count, giftName, isReturning } = req.body;

  let result: any = null;
  switch (action) {
    case 'join':
      result = tiktokClient.simulateJoin(username, isReturning);
      break;
    case 'chat':
      result = tiktokClient.simulateChat(message, username);
      break;
    case 'like':
      result = tiktokClient.simulateLike(count || 50, username);
      break;
    case 'gift':
      result = tiktokClient.simulateGift(giftName || 'Galaxy 🌌', count || 1, username);
      break;
    case 'pachinko':
      const user = db.getAllUsers()[0] || db.upsertUser({ id: 'sim_test', username: 'TestVoyager' });
      const drop = pachinkoManager.generateDrop(user.id, user.username, user.pfp_url);
      broadcastWs('pachinko_drop', drop);
      result = drop;
      break;
    case 'toggle_auto':
      const active = tiktokClient.toggleAutoSimulator();
      return res.json({ success: true, autoActive: active });
    default:
      return res.status(400).json({ error: 'Unknown simulation action' });
  }

  res.json({ success: true, result });
});

// Boss Fight Endpoints
app.post('/api/boss/start', (req, res) => {
  const { bossTypeIndex, triggerType, attackPattern } = req.body;
  bossManager.startBoss(bossTypeIndex || 0, {
    triggerType: triggerType || 'both',
    attackPattern: attackPattern || 'lowest_first'
  });
  res.json({ success: true, bossState: bossManager.getState() });
});

app.post('/api/boss/stop', (req, res) => {
  bossManager.stopBossManually();
  res.json({ success: true, bossState: bossManager.getState() });
});

app.post('/api/boss/config', (req, res) => {
  const { triggerType, attackPattern } = req.body;
  if (triggerType) bossManager.setTriggerType(triggerType);
  if (attackPattern) bossManager.setAttackPattern(attackPattern);
  res.json({ success: true, bossState: bossManager.getState() });
});

app.post('/api/boss/damage', (req, res) => {
  const { source, multiplier, username } = req.body;
  const user = username ? (db.getUser(username) || db.upsertUser({ id: username, username })) : db.getAllUsers()[0];
  bossManager.registerAttack(
    user.id,
    user.username,
    user.pfp_url,
    source || 'tap',
    multiplier || 10
  );
  res.json({ success: true, bossState: bossManager.getState() });
});

// Triggers Endpoints
app.get('/api/triggers', (req, res) => {
  res.json(db.getTriggers());
});

app.post('/api/triggers', (req, res) => {
  const rule = req.body;
  if (!rule.id) rule.id = 'rule_' + Date.now();
  db.saveTrigger(rule);
  broadcastWs('toast_alert', { message: `Rule "${rule.name}" saved` });
  res.json({ success: true, triggers: db.getTriggers() });
});

app.post('/api/triggers/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;
  db.toggleTrigger(id, enabled);
  res.json({ success: true, triggers: db.getTriggers() });
});

app.delete('/api/triggers/:id', (req, res) => {
  const { id } = req.params;
  db.deleteTrigger(id);
  res.json({ success: true, triggers: db.getTriggers() });
});

// Users / CRM Endpoints
app.get('/api/users', (req, res) => {
  res.json(db.getAllUsers());
});

// Wipe Sample & Stream CRM Data
app.post('/api/data/wipe', (req, res) => {
  const { resetRules } = req.body || {};
  const freshState = db.wipeData({ resetRules: !!resetRules });

  // Broadcast fresh state to overlay clients to reset avatars and leaderboards
  broadcastWs('init', {
    users: [],
    currentStream: freshState.currentStream,
    settings: freshState.settings,
    triggers: freshState.triggers,
    bossState: bossManager.getState(),
    connectorState: tiktokClient.getState(),
    isAutoSimActive: tiktokClient.isAutoSimActive(),
    leaderboards: {
      likes: [],
      gifts: [],
      chat_messages: [],
      watch_time: [],
      streams_attended: []
    }
  });

  broadcastWs('toast_alert', { message: 'Sample and CRM data successfully wiped' });
  res.json({ success: true, ...freshState });
});

app.post('/api/users/:id/buddy', (req, res) => {
  const { id } = req.params;
  const { buddyType, rarity, glowColor } = req.body;
  if (buddyType) db.updateUserBuddy(id, buddyType);
  if (rarity && glowColor) db.updateUserRarity(id, rarity, glowColor);
  const updated = db.getUser(id);
  broadcastWs('buddy_update', updated);
  res.json({ success: true, user: updated });
});

// Settings & Stream Session
app.post('/api/settings', (req, res) => {
  db.updateSettings(req.body);
  res.json({ success: true, settings: db.getSettings() });
});

app.post('/api/stream/new', (req, res) => {
  const { title } = req.body;
  const session = db.startNewStream(title || 'New TikTok Live');
  broadcastWs('init', {
    currentStream: session,
    leaderboards: {
      likes: db.getLeaderboard('likes'),
      gifts: db.getLeaderboard('gifts'),
      chat_messages: db.getLeaderboard('chat_messages')
    }
  });
  res.json({ success: true, session });
});

// Mount Vite in development mode or serve static build
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[TikTok Overlay Server] Running at http://localhost:${PORT}`);
    console.log(`[OBS Browser Source] Overlay URL: http://localhost:${PORT}/overlay?aspect=9x16`);
  });
}

startServer().catch((err) => {
  console.error('[Server Error]', err);
});
