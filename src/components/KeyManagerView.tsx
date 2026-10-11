'use client';

import React, { useState, useEffect } from 'react';
import { KeyRound, Plus, Trash2, CheckCircle2, XCircle, RotateCw, ShieldCheck, Zap, Coins, Eye, EyeOff } from 'lucide-react';

interface KeyRecord {
  id: number;
  name: string;
  key_val: string;
  display_key: string;
  note?: string;
  is_active: boolean;
  total_calls: number;
  total_tokens: number;
  last_used_at?: string;
  created_at: string;
}

export function KeyManagerView() {
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  // New Key Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Test ping state
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; msg: string } | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/keys?reveal=${revealed}`);
      const data = await res.json();
      if (data.success) {
        setKeys(data.keys);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [revealed]);

  const handleToggleActive = async (key: KeyRecord) => {
    try {
      await fetch('/api/keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: key.id,
          name: key.name,
          note: key.note,
          is_active: !key.is_active,
        }),
      });
      setKeys((prev) =>
        prev.map((k) => (k.id === key.id ? { ...k, is_active: !k.is_active } : k))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這組 API Key 嗎？')) return;
    try {
      await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestKey = async (key: KeyRecord) => {
    setTestingId(key.id);
    setTestResult(null);
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_val: key.key_val }),
      });
      const data = await res.json();
      setTestResult({
        id: key.id,
        success: data.valid,
        msg: data.message || data.error,
      });
    } catch (err: any) {
      setTestResult({
        id: key.id,
        success: false,
        msg: `連線異常: ${err.message}`,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newKey.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          key_val: newKey.trim(),
          note: newNote.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setNewName('');
        setNewKey('');
        setNewNote('');
        fetchKeys();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(`新增失敗: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-main)' }}>
            Google API Key 金鑰池管理
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            管理多組 Google Gemini Free / Paid API Key，支援免費額度超限 (429) 自動切換與負載分流
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRevealed(!revealed)}
            className="px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-main)',
            }}
          >
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {revealed ? '隱藏金鑰' : '顯示完整金鑰'}
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all hover:opacity-90"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-fg)',
            }}
          >
            <Plus className="w-4 h-4" />
            新增 API Key
          </button>
        </div>
      </div>

      {/* Auto-failover banner */}
      <div
        className="p-4 rounded-2xl border flex items-center gap-3 text-xs"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--primary)' }}
        >
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="space-y-0.5">
          <div className="font-bold" style={{ color: 'var(--text-main)' }}>
            智慧容錯與自動輪替機制 (Multi-Key Failover)
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            當某組 Free API Key 觸發每分鐘轉錄頻率限制 (429 Rate Limit) 或每日配額耗盡時，系統將自動無縫切換至下一組啟用的 API Key，確保長音檔辨識完全不中斷。
          </div>
        </div>
      </div>

      {/* Keys List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs opacity-60">載入金鑰列表中...</div>
        ) : keys.length === 0 ? (
          <div
            className="p-12 rounded-2xl border text-center space-y-3"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <KeyRound className="w-10 h-10 mx-auto opacity-30" style={{ color: 'var(--text-muted)' }} />
            <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              尚未設定任何 API Key
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              請點擊右上角「新增 API Key」加入您的 Google API 金鑰
            </div>
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="p-5 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-all hover:shadow-sm"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                opacity: k.is_active ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-3.5 min-w-[300px]">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: k.is_active ? 'var(--badge-bg)' : 'var(--bg-input)',
                    color: k.is_active ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                      {k.name}
                    </h3>
                    {k.note && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
                      >
                        {k.note}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {k.display_key}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="space-y-0.5">
                  <div className="text-[11px] opacity-70">調用次數</div>
                  <div className="font-bold flex items-center gap-1" style={{ color: 'var(--text-main)' }}>
                    <Zap className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                    {k.total_calls} 次
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[11px] opacity-70">消耗 Tokens</div>
                  <div className="font-bold flex items-center gap-1" style={{ color: 'var(--text-main)' }}>
                    <Coins className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                    {k.total_tokens.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTestKey(k)}
                  disabled={testingId === k.id}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-main)',
                  }}
                >
                  <RotateCw className={`w-3.5 h-3.5 ${testingId === k.id ? 'animate-spin' : ''}`} />
                  測試連線
                </button>

                <button
                  onClick={() => handleToggleActive(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    k.is_active ? 'opacity-90' : 'border'
                  }`}
                  style={{
                    backgroundColor: k.is_active ? 'var(--badge-bg)' : 'transparent',
                    borderColor: 'var(--border)',
                    color: k.is_active ? 'var(--success)' : 'var(--text-muted)',
                  }}
                >
                  {k.is_active ? '● 啟用中' : '○ 已停用'}
                </button>

                <button
                  onClick={() => handleDelete(k.id)}
                  className="p-1.5 rounded-lg border hover:opacity-80 text-red-500"
                  title="刪除 Key"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Test Result Message */}
              {testResult && testResult.id === k.id && (
                <div
                  className={`w-full text-xs p-2.5 rounded-xl flex items-center gap-2 border ${
                    testResult.success ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}
                >
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                  <span>{testResult.msg}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Key Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setShowAddModal(false)}
        >
          <form
            onSubmit={handleAddKey}
            className="w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl cursor-default"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold text-base" style={{ color: 'var(--text-main)' }}>
                新增 Google API Key
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-xs px-2.5 py-1 rounded-lg border hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                金鑰名稱 (Label)
              </label>
              <input
                type="text"
                required
                placeholder="例如: Google Free API 2"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                API Key 數值 (AIzaSy...)
              </label>
              <input
                type="text"
                required
                placeholder="AIzaSy..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                備註說明 (選填)
              </label>
              <input
                type="text"
                placeholder="例如: 帳號 A 免費額度"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:opacity-90"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-fg)',
                }}
              >
                {isSubmitting ? '儲存中...' : '確認新增'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
