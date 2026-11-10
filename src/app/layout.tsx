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
  width: 'device-width',
  initialScale: 1,
  // draw under notches / the home indicator; the top bar, tab bar and sheets add env(safe-area-inset-*) padding
  viewportFit: 'cover',
  // Android Chrome: the on-screen keyboard shrinks the layout (100dvh), so sheets and dialogs stay above it
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
