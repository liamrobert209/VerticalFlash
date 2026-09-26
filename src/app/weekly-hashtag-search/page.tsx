"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Hash } from "lucide-react";
import type { TikTokHashtagVideo } from "@/lib/tiktok-hashtag-schema";
import { HASHTAG_CATEGORIES } from "@/lib/tiktok-hashtag-categories";
import { MediaThumb, HorizontalCardRow, DockedDetailPanel } from "@/components/weekly-digest/shared";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const CATEGORY_NAMES = Object.keys(HASHTAG_CATEGORIES);

interface HashtagSection {
  hashtag: string;
  videos: TikTokHashtagVideo[];
}

function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function VideoCard({
  video,
  onSelect,
  selected,
}: {
  video: TikTokHashtagVideo;
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
          {video.isAd && (
            <span className="inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              Ad
            </span>
          )}
          <p className="text-sm font-medium text-foreground line-clamp-2">{video.caption || "(no caption)"}</p>
          <p className="font-semibold text-foreground">{video.creatorHandle ?? video.creatorName ?? "Unknown creator"}</p>
          <div className="flex flex-wrap gap-2 text-muted-foreground">
            <span>👁 {formatCount(video.viewCount)}</span>
            <span>♥ {formatCount(video.likeCount)}</span>
            <span>💬 {formatCount(video.commentCount)}</span>
          </div>
          {video.publishedAt && (
            <p className="text-muted-foreground">{new Date(video.publishedAt).toLocaleDateString()}</p>
          )}
        </div>
      </div>
    </button>
  );
}

function VideoDetail({ video }: { video: TikTokHashtagVideo }) {
  const generateHref = useMemo(() => {
    const params = new URLSearchParams({ origin: "creator" });
    if (video.tiktokUrl) params.set("url", video.tiktokUrl);
    return `/create-ad-hoc?${params.toString()}`;
  }, [video]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <MediaThumb url={video.coverImageUrl} className="h-48 w-full rounded-md" />
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
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Likes</p>
          <p className="mt-0.5 text-foreground">{formatCount(video.likeCount)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Comments</p>
          <p className="mt-0.5 text-foreground">{formatCount(video.commentCount)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Shares</p>
          <p className="mt-0.5 text-foreground">{formatCount(video.shareCount)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Saves</p>
          <p className="mt-0.5 text-foreground">{formatCount(video.collectCount)}</p>
        </div>
      </div>
      {video.contentHashtags.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hashtags</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {video.contentHashtags.map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                #{tag}
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

function SearchPanel({ onSynced }: { onSynced: () => void }) {
  const [category, setCategory] = useState(CATEGORY_NAMES[0]);
  const [customHashtag, setCustomHashtag] = useState("");
  const [maxItems, setMaxItems] = useState(20);
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (tag: string) => {
    if (!tag.trim() || pendingTag) return;
    setPendingTag(tag);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/weekly-hashtag-search/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashtag: tag, maxItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResult(`#${tag}: ${data.videosSeen} videos found${data.errors?.length ? ` · ${data.errors.length} errors` : ""}`);
      onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setPendingTag(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Search by hashtag</p>
          <p className="text-xs text-muted-foreground">Pick a tracked hashtag below, or search a custom one.</p>
        </div>
        <div className="flex items-end gap-3">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {CATEGORY_NAMES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
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
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {HASHTAG_CATEGORIES[category].map((tag) => (
          <button
            key={tag}
            onClick={() => runSearch(tag)}
            disabled={!!pendingTag}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              pendingTag === tag
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-foreground hover:border-primary/60 hover:bg-muted/40"
            }`}
          >
            {pendingTag === tag ? "Searching…" : `#${tag}`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">Or search a custom hashtag</span>
          <input
            value={customHashtag}
            onChange={(e) => setCustomHashtag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch(customHashtag)}
            placeholder="e.g. bluelight"
            className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <button
          onClick={() => runSearch(customHashtag)}
          disabled={!!pendingTag || !customHashtag.trim()}
          className="h-9 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Search
        </button>
      </div>

      {result && <p className="text-xs text-muted-foreground">{result}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function WeeklyHashtagSearchPage() {
  const [sections, setSections] = useState<HashtagSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TikTokHashtagVideo | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/weekly-hashtag-search", { cache: "no-store" })
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
        <h1 className="text-3xl font-semibold tracking-tight">Search by hashtag</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pull top TikTok videos for any hashtag on demand. One section per hashtag you&apos;ve searched, most recent first.
        </p>
      </header>

      <SearchPanel onSynced={load} />

      {loading && <SkeletonCardGrid />}

      {!loading && sections.length === 0 && (
        <EmptyState icon={Hash} title="Nothing searched yet" description="Enter a hashtag above to pull some in." />
      )}

      {!loading &&
        sections.map((section) => (
          <section key={section.hashtag} className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              #{section.hashtag}
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
