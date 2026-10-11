'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab, Theme } from '@/components/Sidebar';
import { TranscribeView } from '@/components/TranscribeView';
import { HistoryView } from '@/components/HistoryView';
import { KeyManagerView } from '@/components/KeyManagerView';
import { ModelsView } from '@/components/ModelsView';
import { SettingsView } from '@/components/SettingsView';
import { LogsView } from '@/components/LogsView';

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState<NavTab>('transcribe');
  const [currentTheme, setCurrentTheme] = useState<Theme>('zen-dark');
  const [activeKeyCount, setActiveKeyCount] = useState<number>(1);

  // Load theme and key count on mount
  useEffect(() => {
    let savedTheme = localStorage.getItem('goasr_theme') as Theme;
    if (savedTheme === 'sakura') savedTheme = 'gruvbox';
    if (savedTheme) {
      setCurrentTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'zen-dark');
    }

    fetch('/api/keys')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.keys) {
          const activeCount = data.keys.filter((k: any) => k.is_active).length;
          setActiveKeyCount(activeCount);
        }
      })
      .catch(console.error);
  }, []);

  const handleSelectTheme = (theme: Theme) => {
    setCurrentTheme(theme);
    localStorage.setItem('goasr_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);

    // Persist to backend settings
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    }).catch(console.error);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentTheme={currentTheme}
        onSelectTheme={handleSelectTheme}
        activeKeyCount={activeKeyCount}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 h-screen overflow-y-auto">
        {currentTab === 'transcribe' && <TranscribeView />}
        {currentTab === 'history' && <HistoryView />}
        {currentTab === 'keys' && <KeyManagerView />}
        {currentTab === 'models' && <ModelsView />}
        {currentTab === 'settings' && <SettingsView />}
        {currentTab === 'logs' && <LogsView />}
      </main>
    </div>
  );
}
