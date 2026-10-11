'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  CheckCircle2,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Star,
  Check,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import { PromptTemplatesModal, PromptTemplate } from './PromptTemplatesModal';

export function SettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  const [silenceDuration, setSilenceDuration] = useState('0.6');
  const [silenceNoiseDb, setSilenceNoiseDb] = useState('-30');
  const [chunkMaxMinutes, setChunkMaxMinutes] = useState('20');
  const [maxConcurrency, setMaxConcurrency] = useState('3');
  const [keepTimestamps, setKeepTimestamps] = useState(true);
  const [apiMaxRetries, setApiMaxRetries] = useState('10');
  const [apiRetryDelayStep, setApiRetryDelayStep] = useState('2');
  const [defaultPrompt, setDefaultPrompt] = useState('');

  // Prompt Templates state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [modalPrefillContent, setModalPrefillContent] = useState<string | undefined>(undefined);

  const fetchSettingsAndTemplates = async () => {
    try {
      const [settingsRes, promptsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/prompts'),
      ]);

      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.settings) {
        const s = settingsData.settings;
        if (s.silence_duration) setSilenceDuration(s.silence_duration);
        if (s.silence_noise_db) setSilenceNoiseDb(s.silence_noise_db);
        if (s.chunk_max_minutes) setChunkMaxMinutes(s.chunk_max_minutes);
        if (s.max_concurrency) setMaxConcurrency(s.max_concurrency);
        if (s.keep_timestamps !== undefined) setKeepTimestamps(s.keep_timestamps === 'true');
        if (s.api_max_retries) setApiMaxRetries(s.api_max_retries);
        if (s.api_retry_delay_step) setApiRetryDelayStep(s.api_retry_delay_step);
        if (s.default_prompt) setDefaultPrompt(s.default_prompt);
      }

      const promptsData = await promptsRes.json();
      if (promptsData.success && promptsData.prompts) {
        setTemplates(promptsData.prompts);
        const def = promptsData.prompts.find((p: PromptTemplate) => p.is_default);
        if (def) setDefaultPrompt(def.content);
      }
    } catch (err) {
      console.error('Error fetching settings/prompts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndTemplates();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMessage(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          silence_duration: silenceDuration,
          silence_noise_db: silenceNoiseDb,
          chunk_max_minutes: chunkMaxMinutes,
          max_concurrency: maxConcurrency,
          keep_timestamps: keepTimestamps ? 'true' : 'false',
          api_max_retries: apiMaxRetries,
          api_retry_delay_step: apiRetryDelayStep,
          default_prompt: defaultPrompt,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSavedMessage(true);
        setTimeout(() => setSavedMessage(false), 3000);
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(`儲存失敗: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultTemplate = async (t: PromptTemplate) => {
    try {
      const res = await fetch(`/api/prompts/${t.id}/default`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setDefaultPrompt(t.content);
        await fetchSettingsAndTemplates();
      } else {
        alert(data.error || '設定失敗');
      }
    } catch (err: any) {
      alert(`錯誤: ${err.message}`);
    }
  };

  const handleDeleteTemplate = async (t: PromptTemplate) => {
    if (!confirm(`確定要刪除提示詞範本「${t.title}」嗎？`)) return;
    try {
      const res = await fetch(`/api/prompts/${t.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchSettingsAndTemplates();
      } else {
        alert(data.error || '刪除失敗');
      }
    } catch (err: any) {
      alert(`錯誤: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-xs opacity-60">載入設定與範本中...</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-150">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-main)' }}>
              系統參數設定 (Settings)
            </h1>
            <span
              className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--primary)',
              }}
            >
              Build 009
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            微調音訊 ffmpeg 靜音斷句門檻、單段時長、並行數，與全面管理轉錄提示詞範本庫
          </p>
        </div>
      </div>

      {savedMessage && (
        <div
          className="p-3.5 rounded-xl border text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'var(--badge-bg)',
            borderColor: 'var(--border)',
            color: 'var(--success)',
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>設定已成功儲存並即時生效！</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Audio Splitting Parameters */}
        <div
          className="p-6 rounded-2xl border space-y-5"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <Settings className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
              音訊靜音切分與轉錄並行設定 (FFmpeg Segmentation)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                靜音長度閾值 (秒)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.2"
                max="10"
                value={silenceDuration}
                onChange={(e) => setSilenceDuration(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
              <span className="text-[11px] opacity-60 block mt-1" style={{ color: 'var(--text-muted)' }}>
                長度大於此秒數之靜音區間將作為優先斷句切割點（預設: 0.6 秒）
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                靜音音量閾值 (dB)
              </label>
              <input
                type="number"
                step="1"
                max="0"
                min="-60"
                value={silenceNoiseDb}
                onChange={(e) => setSilenceNoiseDb(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
              <span className="text-[11px] opacity-60 block mt-1" style={{ color: 'var(--text-muted)' }}>
                低於此分貝數之聲音將被視為靜音（預設: -30 dB）
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                單一片段最大分鐘數 (分鐘)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="60"
                value={chunkMaxMinutes}
                onChange={(e) => setChunkMaxMinutes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
              <span className="text-[11px] opacity-60 block mt-1" style={{ color: 'var(--text-muted)' }}>
                超過此長度的長音檔將自動啟動斷句分割（預設: 20 分鐘）
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                最大並行處理數 (Concurrency)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="8"
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
              <span className="text-[11px] opacity-60 block mt-1" style={{ color: 'var(--text-muted)' }}>
                切割後同時上傳與轉錄的段落數量（預設: 3）
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Merge & Output Settings */}
        <div
          className="p-6 rounded-2xl border space-y-4"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
              合併與導出格式設定
            </h2>
          </div>

          <div
            className="flex items-center justify-between p-3.5 rounded-xl border"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>
                在合併後的逐字稿保留時間戳標記
              </div>
              <div className="text-[11px] opacity-60 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                開啟時將在各段開頭標示【00:00:00 - 00:20:00】時間區間標籤
              </div>
            </div>
            <input
              type="checkbox"
              checked={keepTimestamps}
              onChange={(e) => setKeepTimestamps(e.target.checked)}
              className="w-5 h-5 rounded cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Section 3: API Fault Tolerance & Retry Strategy */}
        <div
          className="p-6 rounded-2xl border space-y-4"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
              API 容錯重試與金鑰輪替 (Fault Tolerance & Failover)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                呼叫失敗重試上限 (次數)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="30"
                value={apiMaxRetries}
                onChange={(e) => setApiMaxRetries(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
              <span className="text-[11px] opacity-60 block mt-1" style={{ color: 'var(--text-muted)' }}>
                當遭遇 429 配額超限或網路中斷時的最大重試次數（預設: 10 次）
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                重試等差延遲步長 (秒)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="10"
                value={apiRetryDelayStep}
                onChange={(e) => setApiRetryDelayStep(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
              <span className="text-[11px] opacity-60 block mt-1" style={{ color: 'var(--text-muted)' }}>
                每次重試等待時間依等差數列加大：例如 2s, 4s, 6s... 第 10 次 20s（預設步長: 2 秒）
              </span>
            </div>
          </div>

          <div
            className="p-3.5 rounded-xl border text-xs flex items-center justify-between"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
          >
            <div className="space-y-0.5">
              <span className="font-semibold block" style={{ color: 'var(--text-main)' }}>
                🔄 智慧金鑰輪替 (API Key Rotation)
              </span>
              <span className="text-[11px] opacity-70 block" style={{ color: 'var(--text-muted)' }}>
                重試期間將自動切換下一組可用金鑰；10 次等差重試約需 110 秒內恢復，大幅防禦短暫 Rate Limit。
              </span>
            </div>
            <span
              className="text-[11px] px-2.5 py-1 rounded-full font-bold"
              style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
            >
              已啟用全自動輪替
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md hover:opacity-90 disabled:opacity-50 cursor-pointer"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-fg)',
            }}
          >
            <Save className="w-4 h-4" />
            {saving ? '儲存中...' : '儲存系統基本設定'}
          </button>
        </div>
      </form>

      {/* Section 3: Prompt Templates Management Hub */}
      <div
        className="p-6 rounded-2xl border space-y-5"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-fg)' }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-main)' }}>
                轉錄指示詞範本庫 (Prompt Templates)
              </h2>
              <p className="text-[11px] opacity-70" style={{ color: 'var(--text-muted)' }}>
                可自由新增、編輯、複製、刪除提示詞，或一鍵將任一範本設為系統預設
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setModalPrefillContent(undefined);
              setIsPromptModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-fg)',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增提示詞範本</span>
          </button>
        </div>

        {/* Template Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all hover:shadow-md"
              style={{
                backgroundColor: t.is_default ? 'var(--badge-bg)' : 'var(--bg-input)',
                borderColor: t.is_default ? 'var(--primary)' : 'var(--border)',
              }}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-main)' }}>
                    {t.title}
                  </h3>
                  {t.is_default && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0"
                      style={{
                        backgroundColor: 'var(--primary)',
                        color: 'var(--primary-fg)',
                      }}
                    >
                      <Star className="w-2.5 h-2.5 fill-current" />
                      系統預設
                    </span>
                  )}
                </div>

                {t.description && (
                  <p className="text-[11px] opacity-70 line-clamp-1 mb-2" style={{ color: 'var(--text-muted)' }}>
                    {t.description}
                  </p>
                )}

                <div
                  className="p-2.5 rounded-lg border text-[11px] leading-relaxed line-clamp-3 font-mono opacity-85 select-none"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-main)',
                  }}
                >
                  {t.content}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
                <div>
                  {!t.is_default ? (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultTemplate(t)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium border opacity-70 hover:opacity-100 transition-all flex items-center gap-1 cursor-pointer"
                      style={{
                        borderColor: 'var(--border)',
                        color: 'var(--text-main)',
                        backgroundColor: 'var(--bg-card)',
                      }}
                    >
                      <Star className="w-3 h-3" />
                      <span>設為預設</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold opacity-70 flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                      <Check className="w-3 h-3" />
                      目前預設提示詞
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setModalPrefillContent(undefined);
                      setIsPromptModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg border text-xs opacity-70 hover:opacity-100 transition-all cursor-pointer"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-main)',
                      backgroundColor: 'var(--bg-card)',
                    }}
                    title="編輯此範本"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(t)}
                    disabled={templates.length <= 1}
                    className="p-1.5 rounded-lg border text-xs text-rose-500 opacity-70 hover:opacity-100 transition-all cursor-pointer disabled:opacity-30"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--bg-card)',
                    }}
                    title="刪除此範本"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shared Prompt Templates Management Modal */}
      <PromptTemplatesModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        initialCreateContent={modalPrefillContent}
        onTemplatesUpdated={fetchSettingsAndTemplates}
      />
    </div>
  );
}
