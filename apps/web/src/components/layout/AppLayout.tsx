import type { PropsWithChildren } from "react";

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <strong>CAD-WEB Engenharia SaaS</strong>
          <span>Editor CAD MVP</span>
        </div>
        <small>Local MVP</small>
      </header>
      {children}
    </main>
  );
}
