"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Ad } from "@/lib/ads-schema";
import type { CompetitorAccount } from "@/lib/competitor-schema";

// The creative URL can point at either a still image or an mp4 (Facebook's
// CDN uses opaque paths with no reliable extension to branch on ahead of
// time), so this renders optimistically as an image and swaps to a native
// <video> on load failure rather than guessing from the URL shape.
function AdThumb({
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

interface ProductLineSection {
  productLineId: string;
  label: string;
  newest: Ad[];
  longestRunning: Ad[];
}

const SYNC_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
];

function runningDays(ad: Ad): number | null {
  const start = ad.launchDate ?? ad.firstSeenAt;
  if (!start) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(ad.lastSeenAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
}

function AdCard({ ad, onSelect, selected }: { ad: Ad; onSelect: () => void; selected: boolean }) {
  const days = runningDays(ad);
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <div className="flex gap-3">
        <AdThumb url={ad.creativeUrl} className="h-16 w-16 shrink-0 rounded-md" showControls={false} />
        <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-foreground line-clamp-2">
        {ad.headline || ad.bodyText || "(no headline)"}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {ad.launchDate && <span>launched {new Date(ad.launchDate).toLocaleDateString()}</span>}
        {days != null && <span>· running {days}d</span>}
        {!ad.isActive && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold uppercase text-muted-foreground">
            stopped
          </span>
        )}
      </div>
      {ad.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ad.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
        </div>
      </div>
    </button>
  );
}

function AdDetail({ ad, productLineId }: { ad: Ad; productLineId: string }) {
  const days = runningDays(ad);
  const generateHref = useMemo(() => {
    const params = new URLSearchParams({ origin: "ad", productLineId });
    if (ad.creativeUrl) params.set("url", ad.creativeUrl);
    else if (ad.landingUrl) params.set("url", ad.landingUrl);
    return `/create-ad-hoc?${params.toString()}`;
  }, [ad, productLineId]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <AdThumb url={ad.creativeUrl} className="h-48 w-full rounded-md" />
      <div>
        <p className="text-sm font-semibold text-foreground">{ad.headline || "(no headline)"}</p>
        {ad.bodyText && <p className="mt-1 text-sm text-muted-foreground">{ad.bodyText}</p>}
      </div>
      {ad.creativeUrl && (
        <a
          href={ad.creativeUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-primary underline-offset-4 hover:underline"
        >
          View creative ▸
        </a>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Launch date</p>
          <p className="mt-0.5 text-foreground">
            {ad.launchDate ? new Date(ad.launchDate).toLocaleDateString() : "unknown"}
          </p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Running for</p>
          <p className="mt-0.5 text-foreground">{days != null ? `${days} days` : "—"}{!ad.isActive && " (stopped)"}</p>
        </div>
      </div>
      {ad.tags.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ad.tags.map((tag) => (
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
  const [accounts, setAccounts] = useState<CompetitorAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [platformId, setPlatformId] = useState("facebook");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/competitors?accountType=brand")
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runSync = async () => {
    if (!selected.size) return;
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/weekly-ads/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId, accountIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const summary = (data.results ?? [])
        .map((r: { platformId: string; adsSeen: number; markedInactive: number }) =>
          `${r.platformId}: ${r.adsSeen} ads seen, ${r.markedInactive} marked inactive`
        )
        .join(" · ");
      setResult(summary || "Sync completed");
      onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <details className="rounded-lg border border-dashed border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Sync ads from saved accounts
      </summary>
      <div className="mt-3 space-y-3">
        <select
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {SYNC_PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.has(a.id)}
                onChange={() => toggle(a.id)}
                className="size-3.5 rounded border-input accent-primary"
              />
              {a.name} <span className="text-muted-foreground">({a.region.toUpperCase()})</span>
            </label>
          ))}
        </div>
        <button
          onClick={runSync}
          disabled={syncing || !selected.size}
          className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {syncing ? "Syncing… (this can take a few minutes)" : `Sync ${selected.size} account(s)`}
        </button>
        {result && <p className="text-xs text-muted-foreground">{result}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </details>
  );
}

export default function WeeklyAdsPage() {
  const [sections, setSections] = useState<ProductLineSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAd, setSelectedAd] = useState<{ ad: Ad; productLineId: string } | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/weekly-ads", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setSections(data.productLines ?? []))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Weekly ads</h1>
        <p className="max-w-2xl text-muted-foreground">
          Competitor ad creative from your saved accounts, pulled via the Facebook Ad Library and TikTok Ad Library. One section per product, newest and longest-running.
        </p>
      </header>

      <SyncPanel onSynced={load} />

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!loading && sections.every((s) => s.newest.length === 0 && s.longestRunning.length === 0) && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No ads synced yet — expand &quot;Sync ads from saved accounts&quot; above to pull some in.
        </p>
      )}

      {!loading &&
        sections
          .filter((s) => s.newest.length > 0 || s.longestRunning.length > 0)
          .map((section) => (
            <section key={section.productLineId} className="space-y-3 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Newest ads</p>
                  <div className="space-y-2">
                    {section.newest.map((ad) => (
                      <AdCard
                        key={ad.id}
                        ad={ad}
                        selected={selectedAd?.ad.id === ad.id}
                        onSelect={() => setSelectedAd({ ad, productLineId: section.productLineId })}
                      />
                    ))}
                    {section.newest.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nothing yet.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Longest-running ads</p>
                  <div className="space-y-2">
                    {section.longestRunning.map((ad) => (
                      <AdCard
                        key={ad.id}
                        ad={ad}
                        selected={selectedAd?.ad.id === ad.id}
                        onSelect={() => setSelectedAd({ ad, productLineId: section.productLineId })}
                      />
                    ))}
                    {section.longestRunning.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nothing yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ))}

      {selectedAd && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:rounded-lg sm:border">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ad details</p>
            <button onClick={() => setSelectedAd(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Close ✕
            </button>
          </div>
          <AdDetail ad={selectedAd.ad} productLineId={selectedAd.productLineId} />
        </div>
      )}
    </div>
  );
}
