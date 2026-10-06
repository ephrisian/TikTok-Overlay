import React, { useEffect, useRef, useState } from 'react';
import type { TikTokUser, WsMessage, ChatEvent } from '../../backend/types.ts';

interface Props {
  viewerCount: number;
  users: TikTokUser[];
  showChat: boolean;
  onToggleShowChat: (next: boolean) => void;
}

interface ChatLine {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

const MAX_LINES = 150;
const ACTIVE_WINDOW_MS = 4 * 60 * 1000;

export const ChatMonitor: React.FC<Props> = ({ viewerCount, users, showChat, onToggleShowChat }) => {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    let destroyed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onmessage = (e) => {
        try {
          const msg: WsMessage = JSON.parse(e.data);
          if (msg.type === 'event' && msg.payload?.type === 'chat') {
            const c = msg.payload as ChatEvent;
            setLines(prev => [
              ...prev.slice(-(MAX_LINES - 1)),
              { id: `${c.timestamp}_${Math.random()}`, username: c.username, message: c.message, timestamp: c.timestamp }
            ]);
          }
        } catch {}
      };
      ws.onclose = () => {
        if (!destroyed) timer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      destroyed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const now = Date.now();
  const active = users.filter(u => now - u.last_seen < ACTIVE_WINDOW_MS);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300">👀 Current Viewers</span>
          <span className="text-lg font-black text-white">{viewerCount}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 max-h-16 overflow-y-auto">
          {active.length === 0 ? (
            <span className="text-[11px] text-slate-500">No tracked viewers yet (saved after 2 min of watching)</span>
          ) : (
            active.slice(0, 40).map(u => (
              <span key={u.id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">@{u.username}</span>
            ))
          )}
        </div>
      </div>

      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800 mb-2">
          <span className="font-bold text-slate-300">💬 Chat Monitor</span>
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={showChat} onChange={e => onToggleShowChat(e.target.checked)} />
            Show Chat on overlay
          </label>
        </div>
        <div
          ref={listRef}
          onScroll={e => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="h-56 overflow-y-auto flex flex-col gap-1 text-xs"
        >
          {lines.length === 0 ? (
            <span className="text-slate-500">Waiting for live chat messages...</span>
          ) : (
            lines.map(l => (
              <div key={l.id} className="leading-snug">
                <span className="text-slate-500 font-mono mr-1.5">{new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-bold text-cyan-400">{l.username}</span>
                <span className="text-slate-200">: {l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
