import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Heart, 
  Gift, 
  MessageSquare, 
  Share2, 
  Download, 
  RotateCcw, 
  DollarSign, 
  Activity, 
  Zap, 
  Flame,
  Award
} from 'lucide-react';
import { StreamDataPoint, StreamStatsSummary } from '../../backend/streamStatsEngine.ts';

interface TopUserRank {
  rank: number;
  uniqueId: string;
  displayName: string;
  profilePictureUrl?: string;
  diamonds?: number;
  comments?: number;
  likes?: number;
  shares?: number;
  estimatedUsd?: number;
}

export const LiveStreamStatsPanel: React.FC = () => {
  const [summary, setSummary] = useState<StreamStatsSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<StreamDataPoint[]>([]);
  const [topGifters, setTopGifters] = useState<TopUserRank[]>([]);
  const [topChatters, setTopChatters] = useState<TopUserRank[]>([]);
  const [topLikers, setTopLikers] = useState<TopUserRank[]>([]);
  const [topSharers, setTopSharers] = useState<TopUserRank[]>([]);
  const [selectedScoreboard, setSelectedScoreboard] = useState<'gifters' | 'chatters' | 'likers' | 'sharers'>('gifters');
  const [selectedMetricCurve, setSelectedMetricCurve] = useState<'viewers' | 'likes' | 'chats' | 'diamonds'>('viewers');
  const [isExporting, setIsExporting] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.summary) setSummary(data.summary);
        if (data.timeSeries) setTimeSeries(data.timeSeries);
        if (data.topGifters) setTopGifters(data.topGifters);
        if (data.topChatters) setTopChatters(data.topChatters);
        if (data.topLikers) setTopLikers(data.topLikers);
        if (data.topSharers) setTopSharers(data.topSharers);
      }
    } catch (e) {
      console.error('[Stats] Error fetching llamaXc stats:', e);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    if (!window.confirm('Reset all live stream stats session metrics?')) return;
    try {
      await fetch('/api/stats/reset', { method: 'POST' });
      fetchStats();
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    setIsExporting(true);
    window.open(`/api/stats/export?format=${format}`, '_blank');
    setTimeout(() => setIsExporting(false), 1500);
  };

  // Helper to format large numbers
  const fmt = (n?: number) => {
    if (n === undefined || n === null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  // Format stream duration
  const fmtDuration = (sec?: number) => {
    if (!sec) return '00:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${s}s`;
    return `${mins}m ${s}s`;
  };

  // Compute SVG sparkline points
  const renderChart = () => {
    if (timeSeries.length < 2) {
      return (
        <div className="h-44 flex items-center justify-center text-slate-500 text-xs">
          Gathering time-series data points...
        </div>
      );
    }

    const values = timeSeries.map((p) => {
      switch (selectedMetricCurve) {
        case 'viewers': return p.viewers;
        case 'likes': return p.likes;
        case 'chats': return p.chats;
        case 'diamonds': return p.diamonds;
      }
    });

    const max = Math.max(...values, 10);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const width = 600;
    const height = 150;
    const padding = 20;

    const points = values.map((val, idx) => {
      const x = padding + (idx / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const strokeColor = 
      selectedMetricCurve === 'viewers' ? '#06b6d4' :
      selectedMetricCurve === 'likes' ? '#f43f5e' :
      selectedMetricCurve === 'chats' ? '#10b981' : '#f59e0b';

    return (
      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 drop-shadow-md">
          {/* Subtle grid lines */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />

          {/* Area fill */}
          <polygon
            points={`${padding},${height - padding} ${points.join(' ')} ${width - padding},${height - padding}`}
            fill={strokeColor}
            fillOpacity="0.12"
          />

          {/* Line path */}
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.join(' ')}
          />

          {/* Current latest point dot */}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].split(',')[0]}
              cy={points[points.length - 1].split(',')[1]}
              r="4.5"
              fill={strokeColor}
              className="animate-pulse"
            />
          )}
        </svg>

        {/* Min / Max Labels */}
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono px-2 -mt-3">
          <span>{timeSeries[0]?.timeFormatted || 'Start'}</span>
          <span>Range: {fmt(min)} - {fmt(max)} {selectedMetricCurve}</span>
          <span>{timeSeries[timeSeries.length - 1]?.timeFormatted || 'Now'}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 text-slate-100">
      {/* Header with Title and llamaXc Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h2 className="text-base font-extrabold text-slate-100">
              TikTok Live Stream Stats
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              llamaXc/tiktok-live-stream-stats
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time analytics engine, velocity meters, diamond payout calculations, and session scoreboards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition"
            title="Download CSV session export"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            Export CSV
          </button>

          <button
            onClick={() => handleExport('json')}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition"
            title="Download JSON session data"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            Export JSON
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold border border-rose-500/30 transition"
            title="Reset stats session"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Main KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Viewers & Peak */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-cyan-400" /> Viewers
            </span>
            <span className="text-[10px] text-cyan-400/90 font-mono">
              Peak: {summary?.peakViewers || 0}
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-cyan-400">
            {summary?.currentViewers || 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Avg: {summary?.currentViewers || 0} concurrent
          </div>
        </div>

        {/* Total Likes & Velocity */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Heart className="w-3.5 h-3.5 text-rose-400" /> Likes
            </span>
            <span className="text-[10px] text-rose-400/90 font-mono">
              +{summary?.velocities.likesPerMin || 0}/m
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-400">
            {fmt(summary?.totalLikes)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Velocity: {summary?.velocities.likesPerMin || 0} likes/min
          </div>
        </div>

        {/* Total Diamonds & Revenue ($ USD) */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Gift className="w-3.5 h-3.5 text-amber-400" /> Diamonds
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold">
              ${summary?.estimatedRevenueUsd || '0.00'}
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-400">
            {fmt(summary?.totalDiamonds)} 💎
          </div>
          <div className="text-[10px] text-emerald-400/90 mt-1 font-semibold flex items-center gap-0.5">
            <DollarSign className="w-3 h-3" /> Est. Payout: ${summary?.estimatedRevenueUsd || '0.00'}
          </div>
        </div>

        {/* Chat Comments & Velocity */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> Comments
            </span>
            <span className="text-[10px] text-emerald-400/90 font-mono">
              +{summary?.velocities.chatsPerMin || 0}/m
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-400">
            {fmt(summary?.totalChats)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Velocity: {summary?.velocities.chatsPerMin || 0} msgs/min
          </div>
        </div>

        {/* Shares & Followers */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5 text-purple-400" /> Shares
            </span>
            <span className="text-[10px] text-purple-400/90 font-mono">
              +{summary?.totalFollowersGained || 0} follows
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-purple-400">
            {fmt(summary?.totalShares)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Follows gained: {summary?.totalFollowersGained || 0}
          </div>
        </div>

        {/* Duration & Unique Viewers */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-indigo-400" /> Duration
            </span>
            <span className="text-[10px] text-indigo-400/90 font-mono">
              {summary?.totalUniqueUsers || 0} unique
            </span>
          </div>
          <div className="mt-2 text-xl font-black text-slate-200 font-mono">
            {fmtDuration(summary?.durationSeconds)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Audience: {summary?.totalUniqueUsers || 0} users tracked
          </div>
        </div>
      </div>

      {/* Real-Time Live Activity Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200">
              Live Activity Timeline (5-Second Intervals)
            </h3>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setSelectedMetricCurve('viewers')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                selectedMetricCurve === 'viewers'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Viewers
            </button>
            <button
              onClick={() => setSelectedMetricCurve('likes')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                selectedMetricCurve === 'likes'
                  ? 'bg-rose-500 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Likes
            </button>
            <button
              onClick={() => setSelectedMetricCurve('chats')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                selectedMetricCurve === 'chats'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Chats
            </button>
            <button
              onClick={() => setSelectedMetricCurve('diamonds')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                selectedMetricCurve === 'diamonds'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Diamonds
            </button>
          </div>
        </div>

        {renderChart()}
      </div>

      {/* llamaXc Scoreboard Views */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-200">
              Audience Scoreboards (llamaXc Database)
            </h3>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedScoreboard('gifters')}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                selectedScoreboard === 'gifters'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Top Gifters ({topGifters.length})
            </button>
            <button
              onClick={() => setSelectedScoreboard('chatters')}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                selectedScoreboard === 'chatters'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Top Chatters ({topChatters.length})
            </button>
            <button
              onClick={() => setSelectedScoreboard('likers')}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                selectedScoreboard === 'likers'
                  ? 'bg-rose-500 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Top Likers ({topLikers.length})
            </button>
            <button
              onClick={() => setSelectedScoreboard('sharers')}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                selectedScoreboard === 'sharers'
                  ? 'bg-purple-500 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Top Sharers ({topSharers.length})
            </button>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="pb-2 font-semibold w-12 text-center">Rank</th>
                <th className="pb-2 font-semibold">User</th>
                <th className="pb-2 font-semibold text-right">
                  {selectedScoreboard === 'gifters' ? 'Gift Diamonds' :
                   selectedScoreboard === 'chatters' ? 'Total Comments' :
                   selectedScoreboard === 'likers' ? 'Total Likes' : 'Total Shares'}
                </th>
                {selectedScoreboard === 'gifters' && (
                  <th className="pb-2 font-semibold text-right text-emerald-400">Est. USD Payout</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {(() => {
                const list = 
                  selectedScoreboard === 'gifters' ? topGifters :
                  selectedScoreboard === 'chatters' ? topChatters :
                  selectedScoreboard === 'likers' ? topLikers : topSharers;

                if (list.length === 0) {
                  return (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">
                        No activity recorded yet for this scoreboard category.
                      </td>
                    </tr>
                  );
                }

                return list.map((user) => (
                  <tr key={user.uniqueId} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 text-center font-bold font-mono">
                      {user.rank === 1 ? '🥇' : user.rank === 2 ? '🥈' : user.rank === 3 ? '🥉' : `#${user.rank}`}
                    </td>

                    <td className="py-2.5 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-700">
                        {user.profilePictureUrl ? (
                          <img src={user.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">{user.uniqueId.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-slate-200">@{user.uniqueId}</div>
                        {user.displayName && user.displayName !== user.uniqueId && (
                          <div className="text-[10px] text-slate-400">{user.displayName}</div>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 text-right font-mono font-bold">
                      {selectedScoreboard === 'gifters' && (
                        <span className="text-amber-400">{fmt(user.diamonds)} 💎</span>
                      )}
                      {selectedScoreboard === 'chatters' && (
                        <span className="text-emerald-400">{fmt(user.comments)}</span>
                      )}
                      {selectedScoreboard === 'likers' && (
                        <span className="text-rose-400">{fmt(user.likes)}</span>
                      )}
                      {selectedScoreboard === 'sharers' && (
                        <span className="text-purple-400">{fmt(user.shares)}</span>
                      )}
                    </td>

                    {selectedScoreboard === 'gifters' && (
                      <td className="py-2.5 text-right font-mono font-semibold text-emerald-400">
                        ${user.estimatedUsd?.toFixed(2) || '0.00'}
                      </td>
                    )}
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
