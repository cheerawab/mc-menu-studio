import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: '選單工坊 MC Menu Studio',
  description: '用拖拉的方式設計 Minecraft 原版對話框選單，匯出資源包與資料包。',
};

export const viewport: Viewport = {
  themeColor: '#0b0c10',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
