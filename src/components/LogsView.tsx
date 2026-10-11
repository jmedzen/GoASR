'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  RotateCw,
  Trash2,
  Download,
  Search,
  Radio,
  ChevronDown,
  ChevronUp,
  Filter,
  Copy,
  Check,
  Cpu,
  Layers,
  KeyRound,
  Scissors,
  Server,
  FileCode,
} from 'lucide-react';

interface LogItem {
  id: number;
  level: 'info' | 'warn' | 'error' | 'success';
  category: 'transcribe' | 'gemini' | 'queue' | 'keys' | 'models' | 'cleanup' | 'system';
  task_id?: string | null;
  title: string;
  message: string;
  metadata?: any;
  created_at: string;
}

interface LogStats {
  total: number;
  errors: number;
  warnings: number;
  successes: number;
  infos: number;
  today: number;
}

export function LogsView() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<LogStats>({
    total: 0,
    errors: 0,
    warnings: 0,
    successes: 0,
    infos: 0,
    today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial logs and stats
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedLevel !== 'all') params.set('level', selectedLevel);
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', '100');

      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (e) {
      console.error('Error fetching logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedLevel, selectedCategory]);

  // Connect SSE live stream for tailing
  useEffect(() => {
    if (!isLive) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const es = new EventSource('/api/logs/stream');
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const newLog: LogItem = JSON.parse(e.data);
        if (!newLog.id) return;

        // Check if matches current filters
        const matchesLevel = selectedLevel === 'all' || newLog.level === selectedLevel;
        const matchesCategory = selectedCategory === 'all' || newLog.category === selectedCategory;
        const matchesSearch =
          !searchQuery.trim() ||
          newLog.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          newLog.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (newLog.task_id && newLog.task_id.toLowerCase().includes(searchQuery.toLowerCase()));

        if (matchesLevel && matchesCategory && matchesSearch) {
          setLogs((prev) => [newLog, ...prev.slice(0, 199)]);
        }

        // Update stats
        setStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          today: prev.today + 1,
          errors: newLog.level === 'error' ? prev.errors + 1 : prev.errors,
          warnings: newLog.level === 'warn' ? prev.warnings + 1 : prev.warnings,
          successes: newLog.level === 'success' ? prev.successes + 1 : prev.successes,
          infos: newLog.level === 'info' ? prev.infos + 1 : prev.infos,
        }));
      } catch (err) {
        // Heartbeat or malformed
      }
    };

    es.onerror = () => {
      // Reconnection handled automatically by browser EventSource
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isLive, selectedLevel, selectedCategory, searchQuery]);

  const handleClearLogs = async () => {
    if (!confirm('確定要清空所有全站系統日誌嗎？此操作不可撤銷。')) return;
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        setStats({ total: 0, errors: 0, warnings: 0, successes: 0, infos: 0, today: 0 });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyLog = (item: LogItem) => {
    const text = `[${item.created_at}] [${item.level.toUpperCase()}] [${item.category}] ${item.title}: ${item.message} ${
      item.metadata ? '\n' + JSON.stringify(item.metadata, null, 2) : ''
    }`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const getLevelBadge = (level: LogItem['level']) => {
    switch (level) {
      case 'error':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Error
          </span>
        );
      case 'warn':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Warn
          </span>
        );
      case 'success':
        return (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1"
            style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--success)', borderColor: 'var(--border)' }}
          >
            <CheckCircle2 className="w-3 h-3" /> Success
          </span>
        );
      case 'info':
      default:
        return (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1"
            style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)', borderColor: 'var(--border)' }}
          >
            <Info className="w-3 h-3" /> Info
          </span>
        );
    }
  };

  const getCategoryBadge = (cat: LogItem['category']) => {
    const map: Record<string, { label: string; icon: any }> = {
      transcribe: { label: '轉錄核心', icon: Scissors },
      gemini: { label: 'Gemini API', icon: Cpu },
      queue: { label: '批次佇列', icon: Layers },
      keys: { label: '金鑰管理', icon: KeyRound },
      models: { label: '模型同步', icon: Cpu },
      cleanup: { label: '孤兒清理', icon: Trash2 },
      system: { label: '系統', icon: Server },
    };
    const c = map[cat] || { label: cat, icon: Activity };
    const Icon = c.icon;
    return (
      <span
        className="px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 opacity-90"
        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        <Icon className="w-3 h-3" />
        {c.label}
      </span>
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-7">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5" style={{ color: 'var(--text-main)' }}>
            <Activity className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            全站系統日誌 (System Logs)
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            即時監控 Gemini API 請求、429 配額輪替、批次佇列調度、轉錄切分進度與全站異常審計
          </p>
        </div>

        {/* Live Controls & Actions */}
        <div className="flex items-center gap-2">
          {/* Live Tail Toggle */}
          <button
            type="button"
            onClick={() => setIsLive(!isLive)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
              isLive ? 'ring-1' : 'opacity-70'
            }`}
            style={{
              backgroundColor: isLive ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-card)',
              color: isLive ? '#22c55e' : 'var(--text-muted)',
              borderColor: isLive ? 'rgba(34, 197, 94, 0.3)' : 'var(--border)',
            }}
            title={isLive ? '點擊暫停即時串流' : '點擊開啟即時串流'}
          >
            <Radio className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse' : ''}`} />
            {isLive ? '即時串流中 (Live)' : '即時串流已暫停'}
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-xl border text-xs hover:opacity-80 transition-all shadow-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
            title="重新整理日誌"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Export JSON */}
          <a
            href="/api/logs/export?format=json"
            download
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 hover:opacity-80 transition-all shadow-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
            title="匯出 JSON 格式日誌"
          >
            <Download className="w-3.5 h-3.5" />
            匯出 JSON
          </a>

          {/* Export TXT */}
          <a
            href="/api/logs/export?format=txt"
            download
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 hover:opacity-80 transition-all shadow-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
            title="匯出文字格式日誌檔"
          >
            <Download className="w-3.5 h-3.5" />
            匯出 TXT
          </a>

          {/* Clear */}
          <button
            type="button"
            onClick={handleClearLogs}
            className="p-2 rounded-xl border text-xs text-red-400 hover:bg-red-500/10 border-red-500/20 transition-all shadow-sm"
            title="清空所有日誌"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
        <div
          className="p-4 rounded-2xl border space-y-1 transition-all"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="text-[11px] font-semibold opacity-70" style={{ color: 'var(--text-muted)' }}>
            總事件記錄
          </div>
          <div className="text-xl font-black font-mono" style={{ color: 'var(--text-main)' }}>
            {stats.total.toLocaleString()}
          </div>
          <div className="text-[10px] opacity-60" style={{ color: 'var(--text-muted)' }}>
            今日產生: {stats.today} 筆
          </div>
        </div>

        <div
          className="p-4 rounded-2xl border space-y-1 bg-red-500/5 border-red-500/20 transition-all"
        >
          <div className="text-[11px] font-semibold text-red-400">
            異常錯誤 (Errors)
          </div>
          <div className="text-xl font-black font-mono text-red-400">
            {stats.errors}
          </div>
          <div className="text-[10px] opacity-70 text-red-400/80">
            API 失敗、轉錄中斷
          </div>
        </div>

        <div
          className="p-4 rounded-2xl border space-y-1 bg-amber-500/5 border-amber-500/20 transition-all"
        >
          <div className="text-[11px] font-semibold text-amber-500">
            警告 (Warnings)
          </div>
          <div className="text-xl font-black font-mono text-amber-500">
            {stats.warnings}
          </div>
          <div className="text-[10px] opacity-70 text-amber-500/80">
            429 觸發、金鑰輪替
          </div>
        </div>

        <div
          className="p-4 rounded-2xl border space-y-1 transition-all"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="text-[11px] font-semibold" style={{ color: 'var(--success)' }}>
            成功事件 (Success)
          </div>
          <div className="text-xl font-black font-mono" style={{ color: 'var(--success)' }}>
            {stats.successes}
          </div>
          <div className="text-[10px] opacity-60" style={{ color: 'var(--text-muted)' }}>
            任務完成、模型調用
          </div>
        </div>

        <div
          className="p-4 rounded-2xl border space-y-1 transition-all"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>
            資訊訊息 (Infos)
          </div>
          <div className="text-xl font-black font-mono" style={{ color: 'var(--primary)' }}>
            {stats.infos}
          </div>
          <div className="text-[10px] opacity-60" style={{ color: 'var(--text-muted)' }}>
            分段、佇列、設定
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 shadow-sm transition-all"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Level Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="opacity-60 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              層級:
            </span>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-main)',
              }}
            >
              <option value="all">全部層級 (All)</option>
              <option value="error">僅看 錯誤 (Error)</option>
              <option value="warn">僅看 警告 (Warn)</option>
              <option value="success">僅看 成功 (Success)</option>
              <option value="info">僅看 資訊 (Info)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="opacity-60 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              分類:
            </span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-main)',
              }}
            >
              <option value="all">全部分類 (All)</option>
              <option value="gemini">Gemini API / 輪替</option>
              <option value="transcribe">轉錄任務 (Transcribe)</option>
              <option value="queue">批次佇列 (Queue)</option>
              <option value="keys">金鑰管理 (Keys)</option>
              <option value="cleanup">孤兒清理 (Cleanup)</option>
              <option value="system">系統核心 (System)</option>
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 opacity-50" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋標題、訊息或任務 ID..."
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border text-xs focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border)',
              color: 'var(--text-main)',
            }}
          />
        </div>
      </div>

      {/* Logs Feed Container */}
      <div
        className="rounded-2xl border overflow-hidden shadow-sm transition-all"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="p-3.5 border-b flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
            <span>日誌記錄列表</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}>
              {logs.length} 則事件
            </span>
          </div>
          {isLive && (
            <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Live Tail 即時跟隨中
            </span>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <Activity className="w-8 h-8 mx-auto opacity-30" style={{ color: 'var(--text-muted)' }} />
            <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              查無符合條件的系統日誌
            </div>
            <div className="text-xs opacity-60" style={{ color: 'var(--text-muted)' }}>
              目前尚未產生任何符合篩選條件的記錄，系統運行產生新事件時將即時顯示。
            </div>
          </div>
        ) : (
          <div className="divide-y max-h-[620px] overflow-y-auto font-mono text-xs" style={{ borderColor: 'var(--border)' }}>
            {logs.map((item) => {
              const isExpanded = expandedLogId === item.id;
              const hasMetadata = item.metadata && Object.keys(item.metadata).length > 0;

              return (
                <div
                  key={item.id}
                  className="p-3.5 transition-colors hover:opacity-95"
                  style={{
                    backgroundColor:
                      item.level === 'error'
                        ? 'rgba(239, 68, 68, 0.04)'
                        : item.level === 'warn'
                        ? 'rgba(245, 158, 11, 0.03)'
                        : 'transparent',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="opacity-50 text-[11px] shrink-0 font-sans">{item.created_at}</span>
                      {getLevelBadge(item.level)}
                      {getCategoryBadge(item.category)}
                      {item.task_id && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            borderColor: 'var(--border)',
                            color: 'var(--primary)',
                          }}
                        >
                          Task: {item.task_id.slice(0, 8)}...
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 font-sans">
                      <button
                        type="button"
                        onClick={() => handleCopyLog(item)}
                        className="p-1 rounded hover:opacity-80 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                        title="複製這則日誌"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {hasMetadata && (
                        <button
                          type="button"
                          onClick={() => setExpandedLogId(isExpanded ? null : item.id)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 hover:opacity-80 transition-all"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-main)',
                          }}
                        >
                          <FileCode className="w-3 h-3" />
                          <span>{isExpanded ? '收合 JSON' : '查看 JSON'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title & Message */}
                  <div className="space-y-0.5 pl-0.5">
                    <div className="font-bold font-sans text-sm tracking-tight" style={{ color: 'var(--text-main)' }}>
                      {item.title}
                    </div>
                    {item.message && (
                      <div className="text-xs break-all leading-relaxed font-sans opacity-85" style={{ color: 'var(--text-muted)' }}>
                        {item.message}
                      </div>
                    )}
                  </div>

                  {/* Collapsible Metadata JSON Box */}
                  {isExpanded && hasMetadata && (
                    <div
                      className="mt-2.5 p-3 rounded-xl border text-[11px] overflow-x-auto"
                      style={{
                        backgroundColor: 'var(--bg-app)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-main)',
                      }}
                    >
                      <pre className="font-mono whitespace-pre-wrap">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
