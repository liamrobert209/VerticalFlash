"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { TikTokTrendingVideo } from "@/lib/tiktok-trends-schema";
import { TIKTOK_TREND_INDUSTRIES } from "@/lib/tiktok-trends-schema";
import { MediaThumb, HorizontalCardRow, DockedDetailPanel } from "@/components/weekly-digest/shared";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";

interface TrendingSection {
  industry: string;
  country: string;
  videos: TikTokTrendingVideo[];
}

function industryLabel(id: string): string {
  return TIKTOK_TREND_INDUSTRIES.find((i) => i.id === id)?.label ?? id;
}

function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatPercent(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function VideoCard({
  video,
  onSelect,
  selected,
}: {
  video: TikTokTrendingVideo;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-80 shrink-0 rounded-lg border p-3 text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <div className="flex gap-3">
        <MediaThumb url={video.coverImageUrl} className="h-24 w-24 shrink-0 rounded-md" showControls={false} />
        <div className="min-w-0 flex-1 space-y-1 text-xs">
          {video.rank != null && (
            <span className="inline-block rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              #{video.rank}
            </span>
          )}
          <p className="text-sm font-medium text-foreground line-clamp-2">{video.caption || "(no caption)"}</p>
          <p className="font-semibold text-foreground">{video.creatorHandle ?? video.creatorName ?? "Unknown creator"}</p>
          <div className="flex flex-wrap gap-2 text-muted-foreground">
            <span>👁 {formatCount(video.viewCount)}</span>
            <span>Eng. {formatPercent(video.engagementRate)}</span>
          </div>
          {video.publishedAt && (
            <p className="text-muted-foreground">{new Date(video.publishedAt).toLocaleDateString()}</p>
          )}
        </div>
      </div>
      {video.contentTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {video.contentTags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function VideoDetail({ video }: { video: TikTokTrendingVideo }) {
  const generateHref = useMemo(() => {
    const params = new URLSearchParams({ origin: "creator" });
    if (video.tiktokUrl) params.set("url", video.tiktokUrl);
    return `/create-ad-hoc?${params.toString()}`;
  }, [video]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <MediaThumb url={video.videoFileUrl ?? video.coverImageUrl} className="h-48 w-full rounded-md" />
      <div>
        <p className="text-sm text-foreground">{video.caption || "(no caption)"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {video.creatorHandle ?? video.creatorName ?? "Unknown creator"}
          {video.creatorFollowerCount != null && ` · ${formatCount(video.creatorFollowerCount)} followers`}
        </p>
      </div>
      {video.tiktokUrl && (
        <a
          href={video.tiktokUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-primary underline-offset-4 hover:underline"
        >
          Watch on TikTok ▸
        </a>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Views</p>
          <p className="mt-0.5 text-foreground">{formatCount(video.viewCount)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Published</p>
          <p className="mt-0.5 text-foreground">
            {video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : "unknown"}
          </p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Engagement rate</p>
          <p className="mt-0.5 text-foreground">{formatPercent(video.engagementRate)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">6s view-through</p>
          <p className="mt-0.5 text-foreground">{formatPercent(video.viewThroughRate)}</p>
        </div>
      </div>
      {video.contentTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {video.contentTags.map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      <Link
        href={generateHref}
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Generate Ocushield version ▸
      </Link>
    </div>
  );
}

// All 6 content tags refresh automatically every weekday via the daily-sync
// cron — this button is just a manual "don't want to wait for tonight's
// run" escape hatch, looping the same per-tag sync endpoint the cron uses
// instead of making the user pick one category/country/period at a time.
function RefreshAllButton({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAll = async () => {
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: TIKTOK_TREND_INDUSTRIES.length });
    let sawError = false;
    for (let i = 0; i < TIKTOK_TREND_INDUSTRIES.length; i++) {
      try {
        const res = await fetch("/api/weekly-trending-content/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ industry: TIKTOK_TREND_INDUSTRIES[i].id, country: "US", period: "7", maxItems: 10 }),
        });
        if (!res.ok) sawError = true;
      } catch {
        sawError = true;
      }
      setProgress({ done: i + 1, total: TIKTOK_TREND_INDUSTRIES.length });
    }
    setRunning(false);
    if (sawError) setError("Some categories failed to refresh — try again in a bit.");
    onDone();
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={runAll}
        disabled={running}
        className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
      >
        {running ? `Refreshing… (${progress?.done ?? 0}/${progress?.total ?? 0})` : "Refresh all now"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function WeeklyTrendingContentPage() {
  const [sections, setSections] = useState<TrendingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TikTokTrendingVideo | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/weekly-trending-content", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setSections(data.sections ?? []))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Weekly trending content</h1>
            <p className="max-w-2xl text-muted-foreground">
              Top 5 TikTok-wide videos (US, last 7 days) for every tracked content tag — kept fresh automatically
              by the daily sync, no need to pull each one in yourself.
            </p>
          </div>
          <RefreshAllButton onDone={load} />
        </div>
      </header>

      {loading && <SkeletonCardGrid />}

      {!loading &&
        sections.map((section) => (
          <section key={`${section.industry}::${section.country}`} className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {industryLabel(section.industry)}
            </h2>
            {section.videos.length > 0 ? (
              <HorizontalCardRow>
                {section.videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    selected={selected?.id === video.id}
                    onSelect={() => setSelected(video)}
                  />
                ))}
              </HorizontalCardRow>
            ) : (
              <p className="text-xs text-muted-foreground">Not synced yet — covered by tonight&apos;s daily sync.</p>
            )}
          </section>
        ))}

      {selected && (
        <DockedDetailPanel title="Video details" onClose={() => setSelected(null)}>
          <VideoDetail video={selected} />
        </DockedDetailPanel>
      )}
    </div>
  );
}
