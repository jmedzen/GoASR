'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  History,
  FileAudio,
  Trash2,
  Copy,
  Check,
  Coins,
  Eye,
  RotateCw,
  FileText,
  Subtitles,
  AlertCircle,
  CheckCircle2,
  Clock,
  Scissors,
  Mic,
  Layers,
  Sparkles,
  MessageSquareQuote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { InteractiveAudioPlayer } from './InteractiveAudioPlayer';
import { InteractiveTranscript } from './InteractiveTranscript';

interface TaskRecord {
  id: string;
  file_name: string;
  file_size: number;
  duration_seconds: number;
  model_name: string;
  api_key_name: string;
  status: 'pending' | 'splitting' | 'transcribing' | 'merging' | 'completed' | 'failed';
  total_chunks: number;
  completed_chunks: number;
  prompt?: string;
  token_usage: number;
  created_at: string;
  completed_at: string;
  error_message?: string;
}

interface ChunkRecord {
  id: number;
  chunk_index: number;
  start_seconds: number;
  end_seconds: number;
  status: string;
  text_result?: string;
  tokens?: number;
  api_key_used?: string;
  error_message?: string;
}

export function HistoryView() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'srt'>('text');
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Prompt display states
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
  const [modalPromptExpanded, setModalPromptExpanded] = useState<boolean>(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const toggleExpandPrompt = (taskId: string) => {
    setExpandedPrompts((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleCopyPrompt = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedPromptId(id);
      setTimeout(() => setCopiedPromptId(null), 2000);
    });
  };

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);

  const handleSeekAudio = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setPlayerCurrentTime(seconds);
      audioRef.current.play().catch(console.error);
    }
  };

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTask) {
        setSelectedTask(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTask]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    // Auto refresh while any task is in progress
    const timer = setInterval(() => {
      fetch('/api/tasks')
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setTasks(d.tasks);
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleViewDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedTask(data.task);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆歷史記錄嗎？系統將一併徹底清除其所有關聯的實體檔案。')) return;
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTask?.id === id) setSelectedTask(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetryTask = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchTasks();
        if (selectedTask?.id === id) {
          handleViewDetail(id);
        }
      } else {
        alert(`重試失敗: ${data.error}`);
      }
    } catch (err: any) {
      alert(`網路錯誤: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleCleanOrphans = async () => {
    if (!confirm('將會深度掃描並清除所有無主孤兒暫存音檔與殘留片段，是否執行？')) return;
    setCleaningOrphans(true);
    try {
      const res = await fetch('/api/cleanup', { method: 'POST' });
      const data = await res.json();
      alert(data.message);
    } catch (e: any) {
      alert(`清理失敗: ${e.message}`);
    } finally {
      setCleaningOrphans(false);
    }
  };

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string, completedChunks: number, totalChunks: number) => {
    switch (status) {
      case 'completed':
        return (
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
            style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--success)' }}
          >
            <CheckCircle2 className="w-3 h-3" /> 已完成
          </span>
        );
      case 'failed':
        return (
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-red-500/10 text-red-400"
          >
            <AlertCircle className="w-3 h-3" /> 轉錄失敗
          </span>
        );
      case 'splitting':
        return (
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
            style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
          >
            <Scissors className="w-3 h-3 animate-pulse" /> 靜音切割中
          </span>
        );
      case 'transcribing':
        return (
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
            style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
          >
            <Mic className="w-3 h-3 animate-spin" /> 轉錄中 ({completedChunks}/{totalChunks})
          </span>
        );
      case 'merging':
        return (
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
            style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
          >
            <Layers className="w-3 h-3 animate-bounce" /> 智慧合併中
          </span>
        );
      case 'pending':
      default:
        return (
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-amber-500/10 text-amber-500"
          >
            <Clock className="w-3 h-3" /> 排隊等待中
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-main)' }}>
            轉錄歷史記錄 (History)
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            查看過往所有轉錄成果、即時進度與失敗診斷資訊（刪除任務自動清除關聯實體檔案）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCleanOrphans}
            disabled={cleaningOrphans}
            className="px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
            title="掃描並清除任何殘留的孤兒暫存音檔與片段"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-500" />
            {cleaningOrphans ? '清理中...' : '清理孤兒檔案'}
          </button>

          <button
            onClick={fetchTasks}
            className="px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-main)',
            }}
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            重新整理
          </button>
        </div>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="p-12 text-center text-xs opacity-60">載入歷史記錄中...</div>
      ) : tasks.length === 0 ? (
        <div
          className="p-12 rounded-2xl border text-center space-y-3"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <History className="w-10 h-10 mx-auto opacity-30" style={{ color: 'var(--text-muted)' }} />
          <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
            目前尚無歷史記錄
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            請切換至「語音轉錄」分頁開始您的第一次音檔辨識！
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const isFailed = task.status === 'failed';
            const progressPercent = Math.min(
              100,
              Math.max(
                5,
                isCompleted
                  ? 100
                  : task.total_chunks > 0
                  ? Math.round((task.completed_chunks / task.total_chunks) * 80)
                  : 10
              )
            );

            return (
              <div
                key={task.id}
                className="p-5 rounded-2xl border flex flex-col gap-3 transition-all hover:shadow-md"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: isFailed ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-[280px]">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                      style={{
                        backgroundColor: isFailed ? 'rgba(239,68,68,0.1)' : 'var(--badge-bg)',
                        color: isFailed ? 'var(--danger)' : 'var(--primary)',
                      }}
                    >
                      <FileAudio className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm truncate max-w-md" style={{ color: 'var(--text-main)' }}>
                        {task.file_name}
                      </h3>
                      <div className="text-[11px] flex items-center gap-2 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        <span>模型: {task.model_name}</span>
                        <span>•</span>
                        <span>時長: {task.duration_seconds ? `${(task.duration_seconds / 60).toFixed(1)} 分鐘` : '-'}</span>
                        <span>•</span>
                        <span>{task.created_at}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats & status */}
                  <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div className="flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                      <span>{task.token_usage || 0} Tokens</span>
                    </div>
                    {getStatusBadge(task.status, task.completed_chunks, task.total_chunks)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewDetail(task.id)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-main)',
                      }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isCompleted ? '檢視逐字稿' : isFailed ? '查看失敗詳情' : '查看即時進度'}
                    </button>

                    {isFailed && (
                      <button
                        onClick={() => handleRetryTask(task.id)}
                        disabled={retryingId === task.id}
                        className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 hover:opacity-80 bg-amber-500/10 text-amber-500 border-amber-500/20"
                        title="重設並重新排入處理佇列"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${retryingId === task.id ? 'animate-spin' : ''}`} />
                        重試
                      </button>
                    )}

                    {isCompleted && (
                      <>
                        <a
                          href={`/api/tasks/${task.id}/download?format=txt`}
                          download
                          className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
                          title="下載逐字稿 TXT 檔案"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-main)',
                          }}
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-400" />
                          <span>TXT</span>
                        </a>
                        <a
                          href={`/api/tasks/${task.id}/download?format=srt`}
                          download
                          className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
                          title="下載字幕 SRT 檔案"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-main)',
                          }}
                        >
                          <Subtitles className="w-3.5 h-3.5 text-amber-400" />
                          <span>SRT</span>
                        </a>
                      </>
                    )}

                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-1.5 rounded-lg border hover:opacity-80 text-red-500"
                      title="刪除任務與所有實體檔案"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Task Prompt Display */}
                {task.prompt && (
                  <div
                    className="text-xs px-3.5 py-2.5 rounded-xl border flex flex-col gap-1.5 transition-all"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <MessageSquareQuote className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                        <span>轉錄指示詞 (Prompt)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPrompt(task.prompt!, task.id);
                          }}
                          className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-md border hover:opacity-80 transition-all font-medium"
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            borderColor: 'var(--border)',
                            color: copiedPromptId === task.id ? 'var(--success)' : 'var(--text-main)',
                          }}
                          title="複製提示詞"
                        >
                          {copiedPromptId === task.id ? (
                            <>
                              <Check className="w-3 h-3 text-green-500" />
                              <span>已複製</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>複製</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpandPrompt(task.id);
                          }}
                          className="text-[11px] underline opacity-75 hover:opacity-100 flex items-center gap-0.5"
                          style={{ color: 'var(--primary)' }}
                        >
                          <span>{expandedPrompts[task.id] ? '收合' : '展開完整'}</span>
                          {expandedPrompts[task.id] ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div
                      className={`text-[12px] font-mono leading-relaxed transition-all ${
                        expandedPrompts[task.id] ? 'whitespace-pre-wrap max-h-48 overflow-y-auto' : 'line-clamp-2'
                      }`}
                      style={{ color: 'var(--text-main)', opacity: 0.9 }}
                    >
                      {task.prompt}
                    </div>
                  </div>
                )}

                {/* In-progress mini progress bar */}
                {!isCompleted && !isFailed && (
                  <div className="space-y-1.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex justify-between text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      <span>
                        處理進度: 已完成 {task.completed_chunks} / {task.total_chunks} 個音訊片段
                      </span>
                      <span style={{ color: 'var(--primary)' }}>{progressPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-input)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${progressPercent}%`,
                          backgroundColor: 'var(--primary)',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Failed error banner */}
                {isFailed && task.error_message && (
                  <div className="text-xs p-2.5 rounded-xl border bg-red-500/10 text-red-400 border-red-500/20 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 break-all font-mono text-[11px]">
                      <strong>失敗原因: </strong> {task.error_message}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Task Detail & Diagnostic Modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[88vh] rounded-2xl border p-6 flex flex-col space-y-4 shadow-2xl overflow-hidden cursor-default"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base" style={{ color: 'var(--text-main)' }}>
                    {selectedTask.file_name}
                  </h3>
                  {getStatusBadge(selectedTask.status, selectedTask.completed_chunks, selectedTask.total_chunks)}
                </div>
                <div className="text-xs mt-1 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span>任務 ID: {selectedTask.id}</span>
                  <span>•</span>
                  <span>模型: {selectedTask.model_name}</span>
                  <span>•</span>
                  <span>消耗 Tokens: {selectedTask.token_usage || 0}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-xs px-2.5 py-1 rounded-lg border hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                關閉 ✕
              </button>
            </div>

            {/* Modal Prompt Card */}
            {selectedTask.prompt && (
              <div
                className="p-3.5 rounded-xl border text-xs space-y-2 shrink-0 transition-all"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs" style={{ color: 'var(--text-main)' }}>
                    <MessageSquareQuote className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                    <span>轉錄指示詞 (Prompt / 提示詞)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(selectedTask.prompt, 'modal')}
                      className="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:opacity-80 transition-all"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border)',
                        color: copiedPromptId === 'modal' ? 'var(--success)' : 'var(--text-main)',
                      }}
                      title="複製此任務的指示詞"
                    >
                      {copiedPromptId === 'modal' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-500" />
                          <span>已複製</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>複製指示詞</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalPromptExpanded((prev) => !prev)}
                      className="text-xs underline opacity-75 hover:opacity-100 flex items-center gap-0.5"
                      style={{ color: 'var(--primary)' }}
                    >
                      <span>{modalPromptExpanded ? '收合' : '展開完整'}</span>
                      {modalPromptExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div
                  className={`text-[12px] font-mono leading-relaxed p-2.5 rounded-lg border transition-all ${
                    modalPromptExpanded ? 'max-h-48 overflow-y-auto whitespace-pre-wrap' : 'line-clamp-2'
                  }`}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-main)',
                  }}
                >
                  {selectedTask.prompt}
                </div>
              </div>
            )}

            {/* If task is completed: Show Text / SRT Viewer */}
            {selectedTask.status === 'completed' ? (
              <div className="flex-1 flex flex-col space-y-4 min-h-0">
                {/* Embedded Audio Player */}
                <InteractiveAudioPlayer
                  taskId={selectedTask.id}
                  fileName={selectedTask.file_name}
                  audioRef={audioRef}
                  onTimeUpdate={(t) => setPlayerCurrentTime(t)}
                />

                <div className="flex items-center justify-between">
                  <div className="flex border rounded-lg p-0.5" style={{ borderColor: 'var(--border)' }}>
                    <button
                      onClick={() => setActiveTab('text')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        activeTab === 'text' ? 'shadow-sm' : 'opacity-70'
                      }`}
                      style={{
                        backgroundColor: activeTab === 'text' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'text' ? 'var(--primary-fg)' : 'var(--text-main)',
                      }}
                    >
                      逐字稿全文 (TXT)
                    </button>
                    <button
                      onClick={() => setActiveTab('srt')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        activeTab === 'srt' ? 'shadow-sm' : 'opacity-70'
                      }`}
                      style={{
                        backgroundColor: activeTab === 'srt' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'srt' ? 'var(--primary-fg)' : 'var(--text-main)',
                      }}
                    >
                      SRT 字幕
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(activeTab === 'text' ? selectedTask.full_text : selectedTask.srt_content)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-main)',
                      }}
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? '已複製！' : '複製內容'}
                    </button>

                    <a
                      href={`/api/tasks/${selectedTask.id}/download?format=txt`}
                      download
                      className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-main)',
                      }}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      下載 TXT
                    </a>

                    <a
                      href={`/api/tasks/${selectedTask.id}/download?format=srt`}
                      download
                      className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-main)',
                      }}
                    >
                      <Subtitles className="w-3.5 h-3.5 text-amber-400" />
                      下載 SRT
                    </a>
                  </div>
                </div>

                <div
                  className="flex-1 p-4 rounded-xl border overflow-y-auto"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <InteractiveTranscript
                    content={activeTab === 'text' ? selectedTask.full_text : selectedTask.srt_content || ''}
                    rawText={selectedTask.full_text}
                    type={activeTab}
                    currentTime={playerCurrentTime}
                    taskId={selectedTask.id}
                    duration={selectedTask.duration_seconds}
                    onSeek={handleSeekAudio}
                    onContentUpdate={(newSrt) => {
                      setSelectedTask((prev: any) => ({ ...prev, srt_content: newSrt }));
                      setTasks((prev: any[]) => prev.map((t) => (t.id === selectedTask.id ? { ...t, srt_content: newSrt } : t)));
                    }}
                  />
                </div>
              </div>
            ) : (
              /* If task is NOT completed: Show Comprehensive Diagnostic & Progress Dashboard */
              <div className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-1">
                {/* Pipeline Stepper */}
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
                >
                  <div className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>
                    處理流程狀態 (Pipeline Progress)
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div
                      className={`p-2.5 rounded-lg border ${
                        selectedTask.status !== 'pending' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'border-dashed'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1">
                        {selectedTask.status !== 'pending' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        1. 建立與排入佇列
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">{selectedTask.created_at}</div>
                    </div>

                    <div
                      className={`p-2.5 rounded-lg border ${
                        ['transcribing', 'merging', 'completed'].includes(selectedTask.status)
                          ? 'bg-green-500/10 border-green-500/30 text-green-400'
                          : selectedTask.status === 'splitting'
                          ? 'border-amber-500/40 text-amber-400 animate-pulse'
                          : 'border-dashed opacity-50'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1">
                        <Scissors className="w-3.5 h-3.5" />
                        2. 靜音分析與切割
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {selectedTask.total_chunks > 1 ? `已切為 ${selectedTask.total_chunks} 片段` : '單段直接辨識'}
                      </div>
                    </div>

                    <div
                      className={`p-2.5 rounded-lg border ${
                        ['merging', 'completed'].includes(selectedTask.status)
                          ? 'bg-green-500/10 border-green-500/30 text-green-400'
                          : selectedTask.status === 'transcribing'
                          ? 'border-blue-500/40 text-blue-400 animate-pulse'
                          : 'border-dashed opacity-50'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1">
                        <Mic className="w-3.5 h-3.5" />
                        3. 多片段並行轉錄
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">
                        進度: {selectedTask.completed_chunks} / {selectedTask.total_chunks} 段落
                      </div>
                    </div>

                    <div
                      className={`p-2.5 rounded-lg border ${
                        selectedTask.status === 'completed'
                          ? 'bg-green-500/10 border-green-500/30 text-green-400'
                          : selectedTask.status === 'merging'
                          ? 'border-purple-500/40 text-purple-400 animate-pulse'
                          : 'border-dashed opacity-50'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        4. 智慧合併與字幕
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {selectedTask.completed_at ? selectedTask.completed_at : '等待完成'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* If failed: Display Error Diagnostic Box */}
                {selectedTask.status === 'failed' && (
                  <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/25 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                        <AlertCircle className="w-4 h-4" />
                        轉錄失敗詳細診斷 (Error Diagnostics)
                      </div>
                      <button
                        onClick={() => handleRetryTask(selectedTask.id)}
                        disabled={retryingId === selectedTask.id}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 flex items-center gap-1"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${retryingId === selectedTask.id ? 'animate-spin' : ''}`} />
                        重設並重新排入佇列重試
                      </button>
                    </div>

                    <div className="p-3 rounded-lg bg-black/40 font-mono text-xs text-red-300 break-all leading-relaxed">
                      {selectedTask.error_message || '未知錯誤'}
                    </div>

                    <div className="text-[11px] opacity-80 text-red-300/80">
                      💡 建議排查方針：若錯誤包含 429 或配額超限，請至「API Key 管理」新增或啟用更多金鑰；若為音檔讀取問題，請確認音檔存在且完整。
                    </div>
                  </div>
                )}

                {/* Chunks Progress / Inspector Table */}
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>
                      音訊分段明細與狀態 ({selectedTask.chunks?.length || 0} 個片段)
                    </div>
                  </div>

                  {(!selectedTask.chunks || selectedTask.chunks.length === 0) ? (
                    <div className="text-xs p-4 text-center opacity-60 italic">
                      音訊尚未完成切割，正在分析中...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedTask.chunks.map((chunk: ChunkRecord) => (
                        <div
                          key={chunk.id}
                          className="p-3 rounded-lg border text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            borderColor:
                              chunk.status === 'completed'
                                ? 'var(--border)'
                                : chunk.status === 'failed'
                                ? 'rgba(239, 68, 68, 0.4)'
                                : 'var(--primary)',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold w-12" style={{ color: 'var(--primary)' }}>
                              #{chunk.chunk_index}
                            </span>
                            <span className="font-mono" style={{ color: 'var(--text-main)' }}>
                              【{formatSeconds(chunk.start_seconds)} - {formatSeconds(chunk.end_seconds)}】
                            </span>
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                              style={{
                                backgroundColor:
                                  chunk.status === 'completed'
                                    ? 'var(--badge-bg)'
                                    : chunk.status === 'failed'
                                    ? 'rgba(239, 68, 68, 0.1)'
                                    : 'var(--bg-input)',
                                color:
                                  chunk.status === 'completed'
                                    ? 'var(--success)'
                                    : chunk.status === 'failed'
                                    ? 'var(--danger)'
                                    : 'var(--primary)',
                              }}
                            >
                              {chunk.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {chunk.api_key_used && (
                              <span>金鑰: <strong style={{ color: 'var(--text-main)' }}>{chunk.api_key_used}</strong></span>
                            )}
                            {chunk.tokens ? (
                              <span>Tokens: <strong style={{ color: 'var(--text-main)' }}>{chunk.tokens}</strong></span>
                            ) : null}
                          </div>

                          {chunk.text_result && (
                            <div className="w-full md:w-auto text-[11px] truncate max-w-xs opacity-70" style={{ color: 'var(--text-muted)' }}>
                              &ldquo;{chunk.text_result.slice(0, 35)}...&rdquo;
                            </div>
                          )}

                          {chunk.error_message && (
                            <div className="w-full text-[11px] text-red-400 font-mono">
                              片段錯誤: {chunk.error_message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
