"use client";

import { useEffect, useState } from "react";

interface SystemNotice {
  id: string;
  source: string;
  message: string;
  createdAt: string;
}

// Surfaces background-job failures (e.g. a weekly-sync crash) that
// happened when no one was looking at a page tied to that action — see
// system-notices-store.ts for why these need to be persisted rather than
// just logged. Polls rather than pushes: simple, and these are rare/
// low-urgency enough that a up-to-60s delay is fine.
const POLL_INTERVAL_MS = 60_000;

export function SystemNoticesToaster() {
  const [notices, setNotices] = useState<SystemNotice[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/notices", { cache: "no-store" });
        if (!res.ok) return;
        const data: { notices: SystemNotice[] } = await res.json();
        if (!cancelled) setNotices(data.notices ?? []);
      } catch {
        // Best-effort — a failed poll just tries again next interval.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function dismiss(id: string) {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    fetch(`/api/notices/${id}/dismiss`, { method: "POST" }).catch(() => {
      // Best-effort — if this fails, the notice just reappears on the next
      // poll rather than being lost silently either way.
    });
  }

  if (notices.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm shadow-lg backdrop-blur"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">{notice.source}</p>
            <p className="mt-0.5 text-foreground">{notice.message}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(notice.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
