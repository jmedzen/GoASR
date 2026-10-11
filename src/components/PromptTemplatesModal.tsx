'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Star,
  Check,
  X,
  RotateCw,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

export interface PromptTemplate {
  id: number;
  title: string;
  content: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface PromptTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (template: PromptTemplate) => void;
  onTemplatesUpdated?: () => void;
  initialCreateContent?: string;
}

export function PromptTemplatesModal({
  isOpen,
  onClose,
  onSelectTemplate,
  onTemplatesUpdated,
  initialCreateContent,
}: PromptTemplatesModalProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit/Create Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formId, setFormId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompts');
      const data = await res.json();
      if (data.success && data.prompts) {
        setTemplates(data.prompts);
      }
    } catch (err: any) {
      console.error('Error fetching prompt templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setNotification(null);
      if (initialCreateContent) {
        openCreateForm(initialCreateContent);
      } else {
        setIsFormOpen(false);
      }
    }
  }, [isOpen, initialCreateContent]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const openCreateForm = (contentPrefill = '') => {
    setFormId(null);
    setFormTitle('');
    setFormDescription('');
    setFormContent(contentPrefill);
    setFormIsDefault(templates.length === 0);
    setIsFormOpen(true);
  };

  const openEditForm = (t: PromptTemplate) => {
    setFormId(t.id);
    setFormTitle(t.title);
    setFormDescription(t.description || '');
    setFormContent(t.content);
    setFormIsDefault(t.is_default);
    setIsFormOpen(true);
  };

  const handleDuplicate = (t: PromptTemplate) => {
    setFormId(null);
    setFormTitle(`${t.title} (副本)`);
    setFormDescription(t.description ? `${t.description} (副本)` : '');
    setFormContent(t.content);
    setFormIsDefault(false);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('error', '請輸入範本名稱');
      return;
    }
    if (!formContent.trim()) {
      showToast('error', '請輸入提示詞內容');
      return;
    }

    setSubmitting(true);
    try {
      if (formId) {
        // Edit existing
        const res = await fetch(`/api/prompts/${formId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim(),
            content: formContent.trim(),
            is_default: formIsDefault,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('success', `已成功更新範本「${formTitle}」`);
          setIsFormOpen(false);
          await fetchTemplates();
          onTemplatesUpdated?.();
        } else {
          showToast('error', data.error || '更新失敗');
        }
      } else {
        // Create new
        const res = await fetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim(),
            content: formContent.trim(),
            is_default: formIsDefault,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('success', `已成功建立範本「${formTitle}」`);
          setIsFormOpen(false);
          await fetchTemplates();
          onTemplatesUpdated?.();
          if (onSelectTemplate && data.prompt) {
            onSelectTemplate(data.prompt);
          }
        } else {
          showToast('error', data.error || '建立失敗');
        }
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (t: PromptTemplate) => {
    try {
      const res = await fetch(`/api/prompts/${t.id}/default`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `已將「${t.title}」設為全域預設提示詞！`);
        await fetchTemplates();
        onTemplatesUpdated?.();
      } else {
        showToast('error', data.error || '操作失敗');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleDelete = async (t: PromptTemplate) => {
    if (!confirm(`確定要刪除範本「${t.title}」嗎？${t.is_default ? '\n此範本為目前預設，刪除後將自動將其他範本設為預設。' : ''}`)) {
      return;
    }

    try {
      const res = await fetch(`/api/prompts/${t.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message || `已刪除「${t.title}」`);
        await fetchTemplates();
        onTemplatesUpdated?.();
      } else {
        showToast('error', data.error || '刪除失敗');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  if (!isOpen) return null;

  const filteredTemplates = templates.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      t.content.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Modal Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-input)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-fg)' }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                轉錄指示詞範本庫 (Prompt Templates)
              </h2>
              <p className="text-[11px] opacity-70" style={{ color: 'var(--text-muted)' }}>
                自訂、新增、編輯或刪除提示詞，並可一鍵套用或設為系統預設
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isFormOpen && (
              <button
                type="button"
                onClick={() => openCreateForm()}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:brightness-110 active:scale-95 cursor-pointer"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-fg)',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增範本</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-all cursor-pointer hover:bg-black/10"
              style={{ color: 'var(--text-main)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast / Notification Banner */}
        {notification && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all ${
              notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-b border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-b border-rose-500/20'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isFormOpen ? (
            /* Add / Edit Form */
            <form onSubmit={handleFormSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                  <FileText className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  {formId ? '編輯提示詞範本' : '新增提示詞範本'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-xs opacity-70 hover:opacity-100 underline cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  返回清單
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                    範本名稱 (Title) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="例: 佛學開示錄（含原生時間戳）"
                    className="w-full px-3.5 py-2 rounded-xl border text-sm focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-main)',
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                    使用說明或標籤備註 (Description)
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="例: 適用開示、演講音檔，自動依實際語音標記時間"
                    className="w-full px-3.5 py-2 rounded-xl border text-sm focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-main)',
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                    提示詞內容 (Prompt Content) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] opacity-60" style={{ color: 'var(--text-muted)' }}>
                    {formContent.length} 字元
                  </span>
                </div>
                <textarea
                  rows={6}
                  required
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="請在此輸入要發送給 Gemini 模型的指令..."
                  className="w-full px-3.5 py-2.5 rounded-xl border font-sans text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-1 resize-y"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-main)',
                  }}
                />
              </div>

              <div
                className="flex items-center justify-between p-3.5 rounded-xl border"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <Star className={`w-4 h-4 ${formIsDefault ? 'fill-amber-400 text-amber-400' : 'text-zinc-500'}`} />
                  <div>
                    <div className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>
                      設為全系統預設範本
                    </div>
                    <div className="text-[11px] opacity-70" style={{ color: 'var(--text-muted)' }}>
                      建立新任務與上傳頁面時將自動套用此範本內容
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formIsDefault}
                  onChange={(e) => setFormIsDefault(e.target.checked)}
                  className="w-5 h-5 rounded cursor-pointer accent-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer opacity-70 hover:opacity-100"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-main)' }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all hover:brightness-110 active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-fg)',
                  }}
                >
                  {submitting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{formId ? '儲存變更' : '建立範本'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Templates List */
            <>
              {/* Search Bar */}
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
                >
                  <Search className="w-3.5 h-3.5 opacity-50 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜尋範本名稱、說明或內容關鍵字..."
                    className="w-full bg-transparent focus:outline-none text-xs"
                    style={{ color: 'var(--text-main)' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="opacity-50 hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-xs opacity-60 font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                  共 {filteredTemplates.length} 個範本
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs opacity-60 flex items-center justify-center gap-2">
                  <RotateCw className="w-4 h-4 animate-spin" />
                  載入範本庫中...
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div
                  className="py-12 text-center rounded-2xl border border-dashed flex flex-col items-center justify-center space-y-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <Sparkles className="w-8 h-8 opacity-30" style={{ color: 'var(--primary)' }} />
                  <div className="text-xs opacity-60" style={{ color: 'var(--text-muted)' }}>
                    {searchQuery ? '沒有找到相符的範本' : '目前尚無提示詞範本'}
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreateForm()}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer"
                    style={{
                      backgroundColor: 'var(--primary)',
                      color: 'var(--primary-fg)',
                    }}
                  >
                    建立第一個範本
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all hover:shadow-md group"
                      style={{
                        backgroundColor: t.is_default ? 'var(--badge-bg)' : 'var(--bg-input)',
                        borderColor: t.is_default ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      <div>
                        {/* Header with Title and Default Badge */}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm tracking-tight line-clamp-1" style={{ color: 'var(--text-main)' }}>
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
                        </div>

                        {t.description && (
                          <p className="text-[11px] opacity-70 line-clamp-1 mb-2" style={{ color: 'var(--text-muted)' }}>
                            {t.description}
                          </p>
                        )}

                        {/* Content Preview */}
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

                      {/* Card Footer Actions */}
                      <div className="pt-2 border-t flex items-center justify-between gap-2 flex-wrap" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-1">
                          {onSelectTemplate && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectTemplate(t);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95"
                              style={{
                                backgroundColor: 'var(--primary)',
                                color: 'var(--primary-fg)',
                              }}
                              title="立即填入轉錄輸入框"
                            >
                              <Check className="w-3 h-3" />
                              <span>套用</span>
                            </button>
                          )}

                          {!t.is_default && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(t)}
                              className="px-2 py-1 rounded-lg text-[11px] font-medium border opacity-70 hover:opacity-100 transition-all flex items-center gap-1 cursor-pointer"
                              style={{
                                borderColor: 'var(--border)',
                                color: 'var(--text-main)',
                                backgroundColor: 'var(--bg-card)',
                              }}
                              title="設為全系統預設轉錄提示詞"
                            >
                              <Star className="w-3 h-3" />
                              <span>設為預設</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditForm(t)}
                            className="p-1.5 rounded-lg border text-xs opacity-70 hover:opacity-100 transition-all cursor-pointer"
                            style={{
                              borderColor: 'var(--border)',
                              color: 'var(--text-main)',
                              backgroundColor: 'var(--bg-card)',
                            }}
                            title="編輯範本"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(t)}
                            className="p-1.5 rounded-lg border text-xs opacity-70 hover:opacity-100 transition-all cursor-pointer"
                            style={{
                              borderColor: 'var(--border)',
                              color: 'var(--text-main)',
                              backgroundColor: 'var(--bg-card)',
                            }}
                            title="以此為範本複製建立"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(t)}
                            className="p-1.5 rounded-lg border text-xs text-rose-500 opacity-70 hover:opacity-100 transition-all cursor-pointer"
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
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="px-6 py-3 border-t flex items-center justify-between text-xs shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-input)' }}
        >
          <div className="flex items-center gap-1 opacity-60 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <Sparkles className="w-3 h-3" />
            <span>提示：設為預設的範本將自動同步為全站預設 System Prompt</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl font-bold border text-xs opacity-80 hover:opacity-100 transition-all cursor-pointer"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
            }}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
