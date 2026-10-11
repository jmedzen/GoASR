'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileAudio,
  Play,
  RotateCw,
  Copy,
  Download,
  Terminal,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Coins,
  CheckCircle2,
  AlertCircle,
  ListOrdered,
  X,
  Clock,
  PauseCircle,
  PlayCircle,
  ArrowUp,
  ArrowDown,
  BookmarkPlus,
  RotateCcw,
  SlidersHorizontal,
  BookOpen,
} from 'lucide-react';
import { InteractiveAudioPlayer } from './InteractiveAudioPlayer';
import { InteractiveTranscript } from './InteractiveTranscript';
import { PromptTemplatesModal, PromptTemplate } from './PromptTemplatesModal';

interface ModelItem {
  id: number;
  name: string;
  display_name: string;
  is_enabled: boolean;
  is_default: boolean;
  input_token_limit: number;
}

interface KeyItem {
  id: number;
  name: string;
  display_key: string;
  is_active: boolean;
}

interface ChunkStatus {
  index: number;
  start: number;
  end: number;
  status: 'pending' | 'uploading' | 'transcribing' | 'completed' | 'failed';
  tokens?: number;
  text?: string;
}

interface TaskState {
  id: string;
  fileName: string;
  status: 'pending' | 'splitting' | 'transcribing' | 'merging' | 'completed' | 'failed';
  totalChunks: number;
  completedChunks: number;
  progressPercent: number;
  durationSeconds?: number;
  fullText?: string;
  srtContent?: string;
  tokens?: number;
  error?: string;
}

interface QueueStatus {
  isProcessing: boolean;
  isPaused: boolean;
  currentTaskId: string | null;
  pendingCount: number;
  pendingTasks: Array<{
    id: string;
    file_name: string;
    file_size: number;
    model_name: string;
    created_at: string;
  }>;
}

export function TranscribeView() {
  // Config state
  const [models, setModels] = useState<ModelItem[]>([]);
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-transcribe');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('auto');
  const [defaultPrompt, setDefaultPrompt] = useState<string>(
    '請將這段音檔完整轉錄為繁體中文逐字稿，保留講者的講述內容，語意通順，自然添加適當標點符號。'
  );
  const [prompt, setPrompt] = useState<string>('');
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [modalPrefillContent, setModalPrefillContent] = useState<string | undefined>(undefined);

  // Selected files for batch/single queue
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Queue state
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    isProcessing: false,
    isPaused: false,
    currentTaskId: null,
    pendingCount: 0,
    pendingTasks: [],
  });

  // Active Task state
  const [isStarting, setIsStarting] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskState | null>(null);
  const [chunks, setChunks] = useState<Record<number, ChunkStatus>>({});
  const [logs, setLogs] = useState<Array<{ time: string; msg: string }>>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [resultTab, setResultTab] = useState<'text' | 'srt'>('text');
  const [copied, setCopied] = useState(false);

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch queue status
  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      if (data.success) {
        setQueueStatus({
          isProcessing: data.isProcessing,
          isPaused: !!data.isPaused,
          currentTaskId: data.currentTaskId,
          pendingCount: data.pendingCount,
          pendingTasks: data.pendingTasks || [],
        });

        // If we don't have an active task or current task switched, auto-bind to currentTaskId
        if (data.currentTaskId && (!activeTask || activeTask.id !== data.currentTaskId)) {
          loadTaskInfo(data.currentTaskId);
        }
      }
    } catch (e) {
      console.error('Error fetching queue:', e);
    }
  };

  const handlePauseQueue = async () => {
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
      const data = await res.json();
      if (data.success) fetchQueue();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResumeQueue = async () => {
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      const data = await res.json();
      if (data.success) fetchQueue();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMoveQueueItem = async (taskId: string, direction: 'up' | 'down') => {
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', taskId, direction }),
      });
      const data = await res.json();
      if (data.success) fetchQueue();
    } catch (e) {
      console.error(e);
    }
  };

  const loadTaskInfo = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      if (data.success && data.task) {
        const t = data.task;
        setActiveTask({
          id: t.id,
          fileName: t.file_name,
          status: t.status,
          totalChunks: t.total_chunks,
          completedChunks: t.completed_chunks,
          progressPercent: t.status === 'completed' ? 100 : Math.round((t.completed_chunks / Math.max(1, t.total_chunks)) * 80),
          fullText: t.full_text,
          srtContent: t.srt_content,
          tokens: t.token_usage,
        });

        connectEventStream(t.id);
      }
    } catch (e) {
      console.error('Error loading task:', e);
    }
  };

  const fetchPromptTemplates = async () => {
    try {
      const res = await fetch('/api/prompts');
      const data = await res.json();
      const list = data.prompts || data.templates;
      if (data.success && Array.isArray(list)) {
        setPromptTemplates(list);
        const def = list.find((t: PromptTemplate) => t.is_default);
        if (def) {
          setDefaultPrompt(def.content);
          setPrompt((prev) => (!prev || prev === defaultPrompt ? def.content : prev));
          setSelectedTemplateId((prev) => (prev === null ? def.id : prev));
        }
      }
    } catch (e) {
      console.error('Error fetching prompt templates:', e);
    }
  };

  // Load models, keys, templates, and queue on mount
  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.models) {
          const enabled = data.models.filter((m: ModelItem) => m.is_enabled);
          setModels(enabled);
          const def = enabled.find((m: ModelItem) => m.is_default);
          if (def) setSelectedModel(def.name);
        }
      })
      .catch(console.error);

    fetch('/api/keys')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.keys) {
          setKeys(data.keys.filter((k: KeyItem) => k.is_active));
        }
      })
      .catch(console.error);

    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.settings?.default_prompt) {
          setDefaultPrompt(data.settings.default_prompt);
          setPrompt((prev) => (!prev ? data.settings.default_prompt : prev));
        }
      })
      .catch(console.error);

    fetchPromptTemplates();

    fetchQueue();
    const interval = setInterval(fetchQueue, 3500);
    return () => clearInterval(interval);
  }, []);

  // Scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleCancelPending = async (taskId: string) => {
    try {
      const res = await fetch(`/api/queue?id=${taskId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchQueue();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Start transcription task (Single or Batch Queue)
  const handleStartTranscribe = async () => {
    if (selectedFiles.length === 0) {
      alert('請先選擇或拖放音檔！');
      return;
    }

    setIsStarting(true);
    setLogs([]);
    setChunks({});

    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append('files', file);
      }
      formData.append('model_name', selectedModel);
      formData.append('prompt', prompt);
      if (selectedKeyId !== 'auto') {
        formData.append('api_key_id', selectedKeyId);
      }

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '啟動任務失敗');
      }

      // Refresh queue status
      await fetchQueue();

      const targetId = data.taskId || (data.taskIds && data.taskIds[0]);
      if (targetId) {
        loadTaskInfo(targetId);
      }

      // Clear selected files input
      setSelectedFiles([]);
    } catch (err: any) {
      alert(`錯誤: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const connectEventStream = (taskId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);

        if (ev.type === 'log') {
          setLogs((prev) => [...prev, { time: ev.timestamp, msg: ev.message }]);
        } else if (ev.type === 'progress') {
          if (ev.message === 'QUEUE_STATUS_UPDATED') {
            fetchQueue();
            return;
          }
          setActiveTask((prev) => {
            if (!prev || prev.id !== taskId) return prev;
            return {
              ...prev,
              progressPercent: ev.progressPercent ?? prev.progressPercent,
              completedChunks: ev.completedChunks ?? prev.completedChunks,
              totalChunks: ev.totalChunks ?? prev.totalChunks,
              status: ev.progressPercent >= 100 ? 'completed' : 'transcribing',
            };
          });
        } else if (ev.type === 'chunk_update') {
          if (ev.chunk) {
            setChunks((prev) => ({
              ...prev,
              [ev.chunk.index]: {
                ...(prev[ev.chunk.index] || {
                  index: ev.chunk.index,
                  start: 0,
                  end: 0,
                  status: 'pending',
                }),
                ...ev.chunk,
              },
            }));
          }
        } else if (ev.type === 'completed') {
          setActiveTask((prev) => {
            if (!prev || prev.id !== taskId) return prev;
            return {
              ...prev,
              status: 'completed',
              progressPercent: 100,
              fullText: ev.result?.fullText,
              srtContent: ev.result?.srtContent,
              tokens: ev.result?.tokens,
            };
          });
          es.close();
          // Fetch queue to see if next file starts
          fetchQueue();
        } else if (ev.type === 'failed') {
          setActiveTask((prev) => {
            if (!prev || prev.id !== taskId) return prev;
            return {
              ...prev,
              status: 'failed',
              error: ev.message,
            };
          });
          es.close();
          fetchQueue();
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    es.onerror = () => {
      es.close();
    };
  };

  const handleCopy = () => {
    const textToCopy =
      resultTab === 'text' ? activeTask?.fullText || '' : activeTask?.srtContent || '';
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-7">
      {/* Top Banner / Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-main)' }}>
            Google Gemini 語音轉錄 (ASR)
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            支援批次佇列 (Batch Queue 順序處理)・超長錄音自動靜音斷句・並行極速轉錄・多金鑰智慧切換
          </p>
        </div>

        {/* Quick model badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
          <span style={{ color: 'var(--text-muted)' }}>當前模型:</span>
          <span className="font-semibold" style={{ color: 'var(--primary)' }}>
            {selectedModel}
          </span>
        </div>
      </div>

      {/* Main Input Configuration Card */}
      <div
        className="rounded-2xl border p-6 shadow-sm space-y-6 transition-all"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Single Exclusive Input Mode: Drag & Drop / File Selector */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all hover:opacity-90 flex flex-col items-center justify-center gap-3"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                setSelectedFiles(Array.from(e.target.files));
              }
            }}
          />
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm"
            style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
          >
            <UploadCloud className="w-7 h-7" />
          </div>
          {selectedFiles.length > 0 ? (
            <div className="space-y-2 w-full max-w-lg">
              <div className="flex items-center justify-between font-semibold text-sm" style={{ color: 'var(--text-main)' }}>
                <span>已選取 {selectedFiles.length} 個音訊檔案：</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFiles([]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-red-400 hover:underline flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> 清除重選
                </button>
              </div>
              <div
                className="text-xs opacity-80 max-h-32 overflow-y-auto px-4 py-2.5 rounded-xl text-left space-y-1.5"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}
              >
                {selectedFiles.map((f, i) => (
                  <div key={i} className="truncate flex items-center justify-between">
                    <span className="truncate">{i + 1}. {f.name}</span>
                    <span className="shrink-0 opacity-60 ml-2">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--primary)' }}>
                點擊下方按鈕加入批次佇列，系統將一次處理一個檔案
              </div>
            </div>
          ) : (
            <div>
              <div className="font-bold text-base flex items-center justify-center gap-2" style={{ color: 'var(--text-main)' }}>
                <span>拖放 / 選擇多個檔案上傳</span>
              </div>
              <div className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                點擊此處或將音訊檔案拖放至此框內（支援一次選取多個檔案，系統將自動依序排入批次佇列處理）
              </div>
              <div className="text-[11px] mt-1 opacity-70 font-mono" style={{ color: 'var(--text-muted)' }}>
                支援格式：MP3, M4A, WAV, AAC, FLAC, OGG, OPUS
              </div>
            </div>
          )}
        </div>

        {/* Model, Key, and Parameter Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              轉錄模型 (Model)
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-main)',
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.display_name} {m.is_default ? '(預設)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              API 金鑰池 (Key Selection)
            </label>
            <select
              value={selectedKeyId}
              onChange={(e) => setSelectedKeyId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-main)',
              }}
            >
              <option value="auto">⚡ 自動輪替 & Rate Limit 智慧切換 ({keys.length} 組可用)</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.display_key})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Prompt Section with Templates Hub */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                轉錄指示詞 (Prompt / 提示詞)
              </label>
              {selectedTemplateId && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {promptTemplates.find((t) => t.id === selectedTemplateId)?.title || '使用中'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalPrefillContent(prompt);
                  setIsPromptModalOpen(true);
                }}
                title="將目前輸入框內容另存為新範本"
                className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all hover:opacity-85 font-medium"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              >
                <BookmarkPlus className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                另存為範本
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalPrefillContent(undefined);
                  setIsPromptModalOpen(true);
                }}
                className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all hover:opacity-85 font-medium"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                範本庫管理 ({promptTemplates.length})
              </button>

              <button
                type="button"
                onClick={() => {
                  setPrompt(defaultPrompt);
                  const def = promptTemplates.find((t) => t.is_default);
                  if (def) setSelectedTemplateId(def.id);
                }}
                className="text-xs px-2 py-1 rounded-lg border flex items-center gap-1 transition-all hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'transparent',
                  color: 'var(--text-muted)',
                }}
                title="重設為預設提示詞"
              >
                <RotateCcw className="w-3 h-3" />
                恢復預設
              </button>
            </div>
          </div>

          {/* Prompt Templates Quick Switch Pills */}
          {promptTemplates.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
              {promptTemplates.map((t) => {
                const isActive = prompt === t.content || selectedTemplateId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setPrompt(t.content);
                      setSelectedTemplateId(t.id);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border"
                    style={{
                      backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-card)',
                      color: isActive ? 'var(--primary-fg)' : 'var(--text-muted)',
                      borderColor: isActive ? 'var(--primary)' : 'var(--border)',
                    }}
                    title={t.description || t.content.slice(0, 80)}
                  >
                    {t.is_default && <span className="text-[10px]">⭐</span>}
                    <span>{t.title}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Custom Prompt Textarea */}
          <div className="relative">
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                const match = promptTemplates.find((t) => t.content === e.target.value);
                setSelectedTemplateId(match ? match.id : null);
              }}
              placeholder={defaultPrompt || '請輸入轉錄指示詞 (Prompt)...'}
              className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none transition-all font-mono text-[13px] leading-relaxed resize-y min-h-[72px]"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-main)',
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>💡 支援任意指示詞自訂，模型將依此結構斷句、加註時間戳或專業詞彙</span>
            <span>{prompt.length} 字</span>
          </div>
        </div>

        {/* Start Action Button */}
        <button
          onClick={handleStartTranscribe}
          disabled={isStarting}
          className="w-full py-4 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all hover:opacity-95 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-fg)',
          }}
        >
          {isStarting ? (
            <>
              <RotateCw className="w-4 h-4 animate-spin" />
              正在排入批次佇列...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              加入批次排程並開始轉錄 (一次處理一個檔案)
            </>
          )}
        </button>
      </div>

      {/* Batch Queue Status Box */}
      {queueStatus.pendingTasks.length > 0 && (
        <div
          className="rounded-2xl border p-5 space-y-3 transition-all"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                批次排程佇列 (Batch Queue)
              </h3>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
              >
                {queueStatus.pendingCount} 個檔案排隊等待中 (一次處理一個)
              </span>
              {queueStatus.isPaused && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
                  ⏸ 佇列已暫停
                </span>
              )}
            </div>

            {/* Queue Pause / Resume button */}
            <div>
              {queueStatus.isPaused ? (
                <button
                  type="button"
                  onClick={handleResumeQueue}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 active:scale-95"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  繼續處理佇列
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePauseQueue}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  暫停排程佇列
                </button>
              )}
            </div>
          </div>

          {/* Pause notice banner */}
          {queueStatus.isPaused && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 flex items-center gap-2">
              <PauseCircle className="w-4 h-4 shrink-0" />
              <span>佇列目前處於暫停狀態：當前任務處理完畢後將不會自動開始下一個，直到您點擊「繼續處理佇列」。</span>
            </div>
          )}

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {queueStatus.pendingTasks.map((t, index) => (
              <div
                key={t.id}
                className="p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="font-bold opacity-60 w-5">#{index + 1}</span>
                  <FileAudio className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="truncate font-medium" style={{ color: 'var(--text-main)' }}>
                    {t.file_name}
                  </span>
                  <span className="opacity-60 text-[11px] shrink-0">
                    ({(t.file_size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-semibold flex items-center gap-1 mr-1">
                    <Clock className="w-3 h-3" /> 等待中
                  </span>

                  {/* Reorder Up */}
                  <button
                    type="button"
                    onClick={() => handleMoveQueueItem(t.id, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded border hover:opacity-80 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-main)' }}
                    title="優先處理（上移順序）"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Reorder Down */}
                  <button
                    type="button"
                    onClick={() => handleMoveQueueItem(t.id, 'down')}
                    disabled={index === queueStatus.pendingTasks.length - 1}
                    className="p-1 rounded border hover:opacity-80 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-main)' }}
                    title="延後處理（下移順序）"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Cancel */}
                  <button
                    type="button"
                    onClick={() => handleCancelPending(t.id)}
                    className="p-1 rounded border text-red-400 hover:bg-red-500/10 border-red-500/20 transition-all ml-1"
                    title="取消排隊並移除"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Task Dashboard */}
      {activeTask && (
        <div
          className="rounded-2xl border p-6 space-y-6 shadow-sm transition-all"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {/* Header & Status */}
          <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
              >
                <FileAudio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base truncate max-w-md" style={{ color: 'var(--text-main)' }}>
                  {activeTask.fileName}
                </h3>
                <div className="text-xs flex items-center gap-2 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <span>任務 ID: {activeTask.id.slice(0, 8)}...</span>
                  <span>•</span>
                  <span>進度: {activeTask.completedChunks} / {activeTask.totalChunks} 段落</span>
                </div>
              </div>
            </div>

            {/* Status Pill */}
            <div>
              {activeTask.status === 'completed' ? (
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--success)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> 已完成 (Completed)
                </span>
              ) : activeTask.status === 'failed' ? (
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"
                  style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5" /> 失敗 (Failed)
                </span>
              ) : (
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
                >
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  {activeTask.status === 'splitting' ? '靜音切割中...' : activeTask.status === 'merging' ? '智慧合併中...' : '並行轉錄中...'}
                </span>
              )}
            </div>
          </div>

          {/* Master Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span style={{ color: 'var(--text-muted)' }}>當前檔案處理進度</span>
              <span style={{ color: 'var(--primary)' }}>{activeTask.progressPercent}%</span>
            </div>
            <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-input)' }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${activeTask.progressPercent}%`,
                  backgroundColor: 'var(--primary)',
                }}
              />
            </div>
          </div>

          {/* Chunks Progress Grid */}
          {Object.keys(chunks).length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                音訊片段狀態 (Audio Chunks)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {Object.values(chunks).map((c) => (
                  <div
                    key={c.index}
                    className="p-3 rounded-xl border text-xs space-y-1 transition-all"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between font-bold" style={{ color: 'var(--text-main)' }}>
                      <span>段落 #{c.index}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor:
                            c.status === 'completed'
                              ? 'var(--badge-bg)'
                              : c.status === 'failed'
                              ? 'rgba(239,68,68,0.1)'
                              : 'transparent',
                          color:
                            c.status === 'completed'
                              ? 'var(--success)'
                              : c.status === 'failed'
                              ? 'var(--danger)'
                              : 'var(--primary)',
                        }}
                      >
                        {c.status}
                      </span>
                    </div>
                    {c.tokens ? (
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Tokens: {c.tokens}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Real-time Terminal Logs (Collapsible) */}
          <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
            >
              <span className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" /> 即時日誌流 (Live Log Stream) - {logs.length} 則事件
              </span>
              {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showLogs && (
              <div
                ref={logContainerRef}
                className="p-4 font-mono text-xs max-h-48 overflow-y-auto space-y-1"
                style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
              >
                {logs.length === 0 ? (
                  <div className="opacity-40 italic">等待任務事件輸出...</div>
                ) : (
                  logs.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="opacity-40 shrink-0">[{l.time}]</span>
                      <span className="break-all">{l.msg}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Final Completed Result Viewer */}
          {activeTask.status === 'completed' && activeTask.fullText && (
            <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--border)' }}>
              {/* Interactive Audio Player */}
              <InteractiveAudioPlayer
                taskId={activeTask.id}
                fileName={activeTask.fileName}
                audioRef={audioRef}
                onTimeUpdate={(t) => setPlayerCurrentTime(t)}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Statistics Cards */}
                <div className="flex items-center gap-4 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                    <span>總字數: <strong style={{ color: 'var(--text-main)' }}>{activeTask.fullText.length}</strong> 字</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                    <span>Token: <strong style={{ color: 'var(--text-main)' }}>{activeTask.tokens || 0}</strong></span>
                  </div>
                </div>

                {/* Actions: Copy & Downloads */}
                <div className="flex items-center gap-2">
                  <div className="flex border rounded-lg p-0.5" style={{ borderColor: 'var(--border)' }}>
                    <button
                      onClick={() => setResultTab('text')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                        resultTab === 'text' ? 'shadow-sm' : 'opacity-70'
                      }`}
                      style={{
                        backgroundColor: resultTab === 'text' ? 'var(--primary)' : 'transparent',
                        color: resultTab === 'text' ? 'var(--primary-fg)' : 'var(--text-main)',
                      }}
                    >
                      逐字稿全文 (TXT)
                    </button>
                    <button
                      onClick={() => setResultTab('srt')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                        resultTab === 'srt' ? 'shadow-sm' : 'opacity-70'
                      }`}
                      style={{
                        backgroundColor: resultTab === 'srt' ? 'var(--primary)' : 'transparent',
                        color: resultTab === 'srt' ? 'var(--primary-fg)' : 'var(--text-main)',
                      }}
                    >
                      SRT 字幕
                    </button>
                  </div>

                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-main)',
                    }}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '已複製！' : '一鍵複製'}
                  </button>

                  <a
                    href={`/api/tasks/${activeTask.id}/download?format=txt`}
                    download
                    className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-main)',
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    下載 TXT
                  </a>

                  <a
                    href={`/api/tasks/${activeTask.id}/download?format=srt`}
                    download
                    className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-main)',
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    下載 SRT
                  </a>
                </div>
              </div>

              {/* Interactive Text / SRT Display Box */}
              <div
                className="p-5 rounded-xl border max-h-[500px] overflow-y-auto"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                }}
              >
                <InteractiveTranscript
                  content={resultTab === 'text' ? activeTask.fullText : activeTask.srtContent || ''}
                  rawText={activeTask.fullText}
                  type={resultTab}
                  currentTime={playerCurrentTime}
                  taskId={activeTask.id}
                  duration={activeTask.durationSeconds}
                  onSeek={handleSeekAudio}
                  onContentUpdate={(newSrt) => {
                    setActiveTask((prev: any) => (prev ? { ...prev, srtContent: newSrt } : null));
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prompt Templates Modal */}
      <PromptTemplatesModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        initialCreateContent={modalPrefillContent}
        onSelectTemplate={(tpl) => {
          setPrompt(tpl.content);
          setSelectedTemplateId(tpl.id);
        }}
        onTemplatesUpdated={fetchPromptTemplates}
      />
    </div>
  );
}
