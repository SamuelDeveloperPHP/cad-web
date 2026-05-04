import type { PropsWithChildren } from "react";

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <main className="app-shell">
      {children}
    </main>
  );
}
