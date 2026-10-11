'use client';

import React from 'react';
import { Mic, History, KeyRound, Cpu, Settings, Sparkles, CheckCircle2, Activity } from 'lucide-react';

export type NavTab = 'transcribe' | 'history' | 'keys' | 'models' | 'settings' | 'logs';
export type Theme = 'zen-dark' | 'lotus-light' | 'gruvbox' | 'ocean' | 'sakura';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentTheme: Theme;
  onSelectTheme: (theme: Theme) => void;
  activeKeyCount: number;
}

const THEMES: { id: Theme; name: string; iconColor: string; desc: string }[] = [
  { id: 'zen-dark', name: '禪意深黑', iconColor: '#cda262', desc: '清淨禁欲・佛光金' },
  { id: 'lotus-light', name: '白蓮青金', iconColor: '#2d6a4f', desc: '淡雅素潔・翠竹青' },
  { id: 'gruvbox', name: 'Gruvbox', iconColor: '#fe8019', desc: '經典復古・極客橙' },
  { id: 'ocean', name: '深海青嵐', iconColor: '#06b6d4', desc: '深海浩瀚・碧青嵐' },
];

export function Sidebar({
  currentTab,
  onSelectTab,
  currentTheme,
  onSelectTheme,
  activeKeyCount,
}: SidebarProps) {
  const navItems = [
    { id: 'transcribe' as NavTab, label: '語音轉錄', icon: Mic, desc: '即時 ASR & 分段合併' },
    { id: 'history' as NavTab, label: '歷史記錄', icon: History, desc: '轉錄成果與逐字稿' },
    { id: 'keys' as NavTab, label: 'API Key 管理', icon: KeyRound, desc: '多組金鑰 & 自動切換' },
    { id: 'models' as NavTab, label: '模型管理', icon: Cpu, desc: 'Google 最新模型同步' },
    { id: 'settings' as NavTab, label: '系統設定', icon: Settings, desc: '靜音偵測 & 並行參數' },
    { id: 'logs' as NavTab, label: '系統日誌', icon: Activity, desc: 'API 輪替 & 異常審計' },
  ];

  return (
    <aside
      className="w-72 shrink-0 border-r flex flex-col justify-between h-screen p-5 transition-colors"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Brand Header */}
      <div>
        <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg font-bold text-lg"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-fg)',
            }}
          >
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="font-extrabold text-lg tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-main)' }}>
              GoASR
              <span
                className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--badge-fg)' }}
              >
                PRO
              </span>
              <span
                className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--primary)',
                }}
              >
                build 009
              </span>
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Google Gemini 語音辨識系統
            </div>
          </div>
        </div>

        {/* Active Key Status Pill */}
        <div
          className="mx-1 mb-5 p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--success)' }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--success)' }}></span>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>金鑰池狀態:</span>
          </div>
          <span className="font-semibold" style={{ color: 'var(--text-main)' }}>
            {activeKeyCount} 組可用
          </span>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-left transition-all group ${
                  isActive ? 'shadow-sm font-medium' : 'hover:opacity-90'
                }`}
                style={{
                  backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                  border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                }}
              >
                <div
                  className="p-1.5 rounded-lg transition-transform group-hover:scale-110"
                  style={{
                    backgroundColor: isActive ? 'var(--badge-bg)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: isActive ? 'var(--text-main)' : 'inherit' }}>
                    {item.label}
                  </div>
                  <div className="text-[11px] truncate opacity-70" style={{ color: 'var(--text-muted)' }}>
                    {item.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Theme Picker Footer */}
      <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
          美學主題風格 (Themes)
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {THEMES.map((t) => {
            const isSelected = currentTheme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onSelectTheme(t.id)}
                className="flex items-center gap-2 p-2 rounded-lg text-xs text-left border transition-all"
                style={{
                  backgroundColor: isSelected ? 'var(--bg-card)' : 'transparent',
                  borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                }}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 border"
                  style={{ backgroundColor: t.iconColor, borderColor: 'var(--border)' }}
                />
                <span className="truncate text-[11px] font-medium">{t.name}</span>
                {isSelected && <CheckCircle2 className="w-3 h-3 ml-auto shrink-0" style={{ color: 'var(--primary)' }} />}
              </button>
            );
          })}
        </div>

        {/* Version Badge Footer */}
        <div className="mt-3 text-[10px] text-center font-mono opacity-50 tracking-wider" style={{ color: 'var(--text-muted)' }}>
          GoASR v0.1.0 · Build 009
        </div>
      </div>
    </aside>
  );
}
