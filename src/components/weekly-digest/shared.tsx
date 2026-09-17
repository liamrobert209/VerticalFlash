"use client";

import { useState, type ReactNode } from "react";

// Shared building blocks for the "weekly digest" pages (Weekly Ads, Weekly
// Content, Weekly Creators, Weekly Trending Content) — extracted because
// those pages were independently hand-rolling identical scroll rows,
// thumbnail-with-fallback logic, and detail panels.

// The creative URL can point at either a still image or an mp4 (CDN paths
// from Meta/TikTok are opaque, no reliable extension to branch on ahead of
// time), so this renders optimistically as an image and swaps to a native
// <video> on load failure rather than guessing from the URL shape.
export function MediaThumb({
  url,
  className,
  showControls = true,
}: {
  url: string | null;
  className?: string;
  showControls?: boolean;
}) {
  const [failedAsImage, setFailedAsImage] = useState(false);

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-muted text-[10px] text-muted-foreground ${className ?? ""}`}>
        No preview
      </div>
    );
  }

  if (failedAsImage) {
    return (
      <video
        src={url}
        controls={showControls}
        muted
        playsInline
        preload="metadata"
        className={`bg-black object-contain ${className ?? ""}`}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- creative comes from Meta/TikTok CDNs, not a local/optimizable asset
  return <img src={url} alt="" onError={() => setFailedAsImage(true)} className={`object-cover ${className ?? ""}`} />;
}

// Matches the app's existing horizontal-scroll convention (library/page.tsx,
// ClipLibraryModal.tsx, StoryboardFootagePanel.tsx) — plain overflow-x-auto,
// no carousel library, children expected to be shrink-0.
export function HorizontalCardRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 overflow-x-auto pb-2">{children}</div>;
}

// The fixed bottom-sheet/corner-panel shell every weekly-digest page already
// hand-rolled identically: full-width bottom sheet on mobile, floating card
// pinned bottom-right on desktop.
export function DockedDetailPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:rounded-lg sm:border">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close ✕
        </button>
      </div>
      {children}
    </div>
  );
}
