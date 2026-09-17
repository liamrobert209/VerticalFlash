"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { TikTokTrendingVideo } from "@/lib/tiktok-trends-schema";
import { TIKTOK_TREND_VIDEO_COUNTRIES, TIKTOK_TREND_INDUSTRIES } from "@/lib/tiktok-trends-schema";
import { MediaThumb, HorizontalCardRow, DockedDetailPanel } from "@/components/weekly-digest/shared";

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

function SyncPanel({ onSynced }: { onSynced: () => void }) {
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState<(typeof TIKTOK_TREND_VIDEO_COUNTRIES)[number]>("US");
  const [period, setPeriod] = useState<"7" | "30">("7");
  const [organicOnly, setOrganicOnly] = useState(false);
  const [maxItems, setMaxItems] = useState(20);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/weekly-trending-content/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, country, period, organicOnly, maxItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setResult(`${data.videosSeen} videos seen${data.errors?.length ? ` · ${data.errors.length} errors` : ""}`);
      onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-border p-4">
      <p className="text-sm font-semibold text-foreground">Sync trending videos</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">Content tag</span>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {TIKTOK_TREND_INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">Country</span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as (typeof TIKTOK_TREND_VIDEO_COUNTRIES)[number])}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {TIKTOK_TREND_VIDEO_COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">Period</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "7" | "30")}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">Max items</span>
          <input
            type="number"
            min={1}
            max={100}
            value={maxItems}
            onChange={(e) => setMaxItems(Number(e.target.value))}
            className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={organicOnly}
            onChange={(e) => setOrganicOnly(e.target.checked)}
            className="size-3.5 rounded border-input accent-primary"
          />
          Organic only
        </label>
        <button
          onClick={runSync}
          disabled={syncing}
          className="h-9 rounded-md bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>
      {result && <p className="mt-2 text-xs text-muted-foreground">{result}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
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
        <h1 className="text-3xl font-semibold tracking-tight">Weekly trending content</h1>
        <p className="max-w-2xl text-muted-foreground">
          TikTok-wide top videos (not tied to any saved account), pulled by content tag and country. One section per synced combination.
        </p>
      </header>

      <SyncPanel onSynced={load} />

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!loading && sections.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing synced yet — expand &quot;Sync trending videos&quot; above to pull some in.
        </p>
      )}

      {!loading &&
        sections.map((section) => (
          <section key={`${section.industry}::${section.country}`} className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {industryLabel(section.industry)} · {section.country}
            </h2>
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
