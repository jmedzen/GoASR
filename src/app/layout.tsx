import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GoASR - Google Gemini 語音辨識系統',
  description: '前沿技術 Google Gemini ASR 語音轉錄平台，支援自動靜音斷句、多金鑰管理與四色美學主題',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
