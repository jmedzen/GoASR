'use client';

import React, { useState, useEffect } from 'react';
import { Cpu, RotateCw, CheckCircle2, Sparkles, Star, ShieldCheck, ArrowUpDown } from 'lucide-react';

interface ModelRecord {
  id: number;
  name: string;
  display_name: string;
  description: string;
  input_token_limit: number;
  output_token_limit: number;
  is_audio_supported: boolean;
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
  updated_at: string;
}

export function ModelsView() {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.success) {
        setModels(data.models);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleSyncModels = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/models', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message || '模型同步成功！');
        fetchModels();
      } else {
        alert(`同步失敗: ${data.error}`);
      }
    } catch (err: any) {
      alert(`網路錯誤: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleEnable = async (model: ModelRecord) => {
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: model.id,
          is_enabled: !model.is_enabled,
        }),
      });
      setModels((prev) =>
        prev.map((m) => (m.id === model.id ? { ...m, is_enabled: !m.is_enabled } : m))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetDefault = async (model: ModelRecord) => {
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: model.id,
          is_default: true,
        }),
      });
      setModels((prev) =>
        prev.map((m) => ({
          ...m,
          is_default: m.id === model.id,
          is_enabled: m.id === model.id ? true : m.is_enabled,
        }))
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-main)' }}>
            Google Gemini 模型管理 (Models)
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            支援從 Google API 自動抓取與更新官方最新多模態語音辨識模型（如 gemini-3.5-transcribe 等）
          </p>
        </div>

        <button
          onClick={handleSyncModels}
          disabled={syncing}
          className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-fg)',
          }}
        >
          <RotateCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? '正在自 Google API 同步...' : '從 Google API 同步最新模型'}
        </button>
      </div>

      {message && (
        <div
          className="p-3 rounded-xl border text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'var(--badge-bg)',
            borderColor: 'var(--border)',
            color: 'var(--primary)',
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Model Cards List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs opacity-60">載入模型列表中...</div>
        ) : models.length === 0 ? (
          <div
            className="p-12 rounded-2xl border text-center space-y-3"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <Cpu className="w-10 h-10 mx-auto opacity-30" style={{ color: 'var(--text-muted)' }} />
            <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              尚未偵測到模型
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              請點擊上方按鈕自 Google API 即時同步
            </div>
          </div>
        ) : (
          models.map((m) => (
            <div
              key={m.id}
              className="p-5 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-all hover:shadow-sm"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: m.is_default ? 'var(--primary)' : 'var(--border)',
                opacity: m.is_enabled ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-3.5 min-w-[320px]">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: m.is_default ? 'var(--primary)' : 'var(--badge-bg)',
                    color: m.is_default ? 'var(--primary-fg)' : 'var(--primary)',
                  }}
                >
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                      {m.display_name}
                    </h3>
                    {m.is_default && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                        style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
                      >
                        系統預設
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {m.name}
                  </div>
                  {m.description && (
                    <div className="text-[11px] mt-1 max-w-md line-clamp-1 opacity-70" style={{ color: 'var(--text-muted)' }}>
                      {m.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Token Limits */}
              <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="space-y-0.5">
                  <div className="text-[11px] opacity-70">輸入上限 (Context)</div>
                  <div className="font-bold" style={{ color: 'var(--text-main)' }}>
                    {m.input_token_limit ? m.input_token_limit.toLocaleString() : '-'} tokens
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[11px] opacity-70">輸出上限 (Output)</div>
                  <div className="font-bold" style={{ color: 'var(--text-main)' }}>
                    {m.output_token_limit ? m.output_token_limit.toLocaleString() : '-'} tokens
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {!m.is_default && (
                  <button
                    onClick={() => handleSetDefault(m)}
                    className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-main)',
                    }}
                  >
                    <Star className="w-3.5 h-3.5" />
                    設為預設
                  </button>
                )}

                <button
                  onClick={() => handleToggleEnable(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    m.is_enabled ? 'opacity-90' : 'border'
                  }`}
                  style={{
                    backgroundColor: m.is_enabled ? 'var(--badge-bg)' : 'transparent',
                    borderColor: 'var(--border)',
                    color: m.is_enabled ? 'var(--success)' : 'var(--text-muted)',
                  }}
                >
                  {m.is_enabled ? '● 啟用中' : '○ 已停用'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
