"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Shared building blocks for the "weekly digest" pages (Weekly Ads, Weekly
// Content, Weekly Creators, Weekly Trending Content) — extracted because
// those pages were independently hand-rolling identical scroll rows,
// thumbnail-with-fallback logic, and detail panels.

// One stable creative URL for a competitor ad, regardless of whether it's
// cached locally — /api/ads/[id]/creative serves the local copy when one
// exists and redirects to the remote CDN URL otherwise, so display code
// never needs its own local-file-or-remote branching (and never breaks
// when a remote CDN URL that was live at sync time later goes dead).
export function adCreativeSrc(ad: { id: string; creativeUrl: string | null }): string | null {
  return ad.creativeUrl ? `/api/ads/${ad.id}/creative` : null;
}

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
// no carousel library, children expected to be shrink-0. Adds always-visible
// (not hover-gated — the point is to make the scroll affordance obvious,
// not hide it behind another discovery step) left/right arrow buttons,
// shown only on the side(s) there's actually more to scroll to.
export function HorizontalCardRow({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const childCount = Children.count(children);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateScrollState = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
    // childCount: re-measure when cards are added/removed (e.g. async load
    // after mount) — the container's own box size doesn't change then, so
    // ResizeObserver alone won't catch the resulting overflow change.
  }, [childCount]);

  const scrollByAmount = (delta: number) => scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });

  return (
    <div className="relative">
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2">
        {children}
      </div>
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-320)}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-background p-1.5 shadow-md hover:bg-muted sm:flex"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(320)}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-background p-1.5 shadow-md hover:bg-muted sm:flex"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
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
