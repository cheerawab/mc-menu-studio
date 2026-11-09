'use client';

import dynamic from 'next/dynamic';

function Splash() {
  return (
    <div className="flex h-screen items-center justify-center bg-ink-950 text-fg-muted">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 animate-pulse rounded-sm bg-accent" />
        <span>選單工坊載入中…</span>
      </div>
    </div>
  );
}

const Editor = dynamic(() => import('./Editor'), { ssr: false, loading: Splash });

export default function EditorLoader() {
  return <Editor />;
}
