"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Image as ImageIcon } from "lucide-react";
import type { AdWithAccount } from "@/lib/ads-schema";
import { AD_INTENT_LABELS } from "@/lib/ad-analysis-schema";
import type { CompetitorAccount } from "@/lib/competitor-schema";
import { MediaThumb, HorizontalCardRow, DockedDetailPanel, adCreativeSrc } from "@/components/weekly-digest/shared";
import { CompetitorAdRow, type CompetitorAdGroup } from "@/components/weekly-digest/CompetitorAdRow";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

// Weekly Ads and Weekly Static Ads used to be two separate sidebar entries
// over the same underlying ad dataset (static ads is just the subset with
// a genuine static image) — merged here into one page with a tab.
const TABS = [
  { id: "all", label: "All ads" },
  { id: "static", label: "Static ads" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Ad = AdWithAccount;

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

function adAngle(ad: Ad): string {
  if (ad.analysis) return AD_INTENT_LABELS[ad.analysis.intent];
  return ad.tags[0] ?? "—";
}

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
      className={`w-80 shrink-0 rounded-lg border p-3 text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <div className="flex gap-3">
        <MediaThumb url={adCreativeSrc(ad)} className="h-24 w-24 shrink-0 rounded-md" showControls={false} />
        <div className="min-w-0 flex-1 space-y-1 text-xs">
          <p className="text-sm font-medium text-foreground line-clamp-2">
            {ad.headline || ad.bodyText || "(no headline)"}
          </p>
          <p className="font-semibold text-foreground">{ad.accountName ?? "Unknown brand"}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span className="rounded-full bg-muted px-1.5 py-0.5 uppercase">{ad.platformId}</span>
            {days != null && <span>· running {days}d</span>}
            {!ad.isActive && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold uppercase">stopped</span>
            )}
          </div>
          <p className="truncate text-muted-foreground">
            <span className="font-semibold text-foreground">Angle:</span> {adAngle(ad)}
          </p>
          {ad.analysis?.productShown && (
            <p className="truncate text-muted-foreground">
              <span className="font-semibold text-foreground">Product:</span> {ad.analysis.productShown}
            </p>
          )}
        </div>
      </div>
      {ad.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ad.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function AdDetail({ ad, productLineId }: { ad: Ad; productLineId: string }) {
  const days = runningDays(ad);
  const generateHref = useMemo(() => {
    // Static-image ads get the real editor (angle/persona/copy/background,
    // 5-way batch generation) — video-sourced ads keep the existing
    // create-ad-hoc flow, which has no equivalent for a static image.
    if (ad.isStaticEligible) {
      const params = new URLSearchParams({ referenceAdId: ad.id, productLineId });
      return `/create-static-ad?${params.toString()}`;
    }
    const params = new URLSearchParams({ origin: "ad", productLineId });
    if (ad.creativeUrl) params.set("url", ad.creativeUrl);
    else if (ad.landingUrl) params.set("url", ad.landingUrl);
    return `/create-ad-hoc?${params.toString()}`;
  }, [ad, productLineId]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <MediaThumb url={adCreativeSrc(ad)} className="h-48 w-full rounded-md" />
      <div>
        <p className="text-sm font-semibold text-foreground">{ad.headline || "(no headline)"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {ad.accountName ?? "Unknown brand"} · <span className="uppercase">{ad.platformId}</span>
        </p>
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
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Angle</p>
          <p className="mt-0.5 text-foreground">{adAngle(ad)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Product</p>
          <p className="mt-0.5 text-foreground">{ad.analysis?.productShown ?? "—"}</p>
        </div>
      </div>
      {ad.analysis?.usp && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">USP:</span> {ad.analysis.usp}
        </p>
      )}
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
    <div className="rounded-lg border border-dashed border-border p-4">
      <p className="text-sm font-semibold text-foreground">Sync ads from saved accounts</p>
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
    </div>
  );
}

function AllAdsTab() {
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
      <SyncPanel onSynced={load} />

      {loading && <SkeletonCardGrid />}

      {!loading && sections.every((s) => s.newest.length === 0 && s.longestRunning.length === 0) && (
        <EmptyState icon={CalendarClock} title="No ads synced yet" description={'Expand "Sync ads from saved accounts" above to pull some in.'} />
      )}

      {!loading &&
        sections
          .filter((s) => s.newest.length > 0 || s.longestRunning.length > 0)
          .map((section) => (
            <section key={section.productLineId} className="space-y-3 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </h2>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Newest ads</p>
                {section.newest.length > 0 ? (
                  <HorizontalCardRow>
                    {section.newest.map((ad) => (
                      <AdCard
                        key={ad.id}
                        ad={ad}
                        selected={selectedAd?.ad.id === ad.id}
                        onSelect={() => setSelectedAd({ ad, productLineId: section.productLineId })}
                      />
                    ))}
                  </HorizontalCardRow>
                ) : (
                  <p className="text-xs text-muted-foreground">Nothing yet.</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Longest-running ads</p>
                {section.longestRunning.length > 0 ? (
                  <HorizontalCardRow>
                    {section.longestRunning.map((ad) => (
                      <AdCard
                        key={ad.id}
                        ad={ad}
                        selected={selectedAd?.ad.id === ad.id}
                        onSelect={() => setSelectedAd({ ad, productLineId: section.productLineId })}
                      />
                    ))}
                  </HorizontalCardRow>
                ) : (
                  <p className="text-xs text-muted-foreground">Nothing yet.</p>
                )}
              </div>
            </section>
          ))}

      {selectedAd && (
        <DockedDetailPanel title="Ad details" onClose={() => setSelectedAd(null)}>
          <AdDetail ad={selectedAd.ad} productLineId={selectedAd.productLineId} />
        </DockedDetailPanel>
      )}
    </div>
  );
}

interface StaticAdsSection {
  productLineId: string;
  label: string;
  competitors: CompetitorAdGroup[];
}

interface StaticAdsResponse {
  productLines: StaticAdsSection[];
  ourAds: { accepted: unknown[]; discarded: unknown[]; drafts: unknown[] };
}

function StaticAdsTab() {
  const [sections, setSections] = useState<StaticAdsSection[]>([]);
  const [ourAds, setOurAds] = useState<StaticAdsResponse["ourAds"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weekly-static-ads", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: StaticAdsResponse) => {
        setSections(data.productLines ?? []);
        setOurAds(data.ourAds ?? null);
      })
      .catch(() => {
        setSections([]);
        setOurAds(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <p className="max-w-2xl text-muted-foreground">
        Competitor static-image ad creative, one row per competitor, plus the static ads you&apos;ve generated in
        response. Only genuine static-image ads show here — video ads (even with a poster-frame thumbnail) live on
        the All ads tab instead.
      </p>

      {loading && <SkeletonCardGrid />}

      {!loading && sections.every((s) => s.competitors.length === 0) && (
        <EmptyState
          icon={ImageIcon}
          title="No static competitor ads yet"
          description="Sync some from the All ads tab. Only ads with a genuine static image (not a video) will show up here."
        />
      )}

      {!loading &&
        sections
          .filter((s) => s.competitors.length > 0)
          .map((section) => (
            <section key={section.productLineId} className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </h2>
              {section.competitors.map((group) => (
                <CompetitorAdRow key={group.accountId ?? "unknown"} group={group} />
              ))}
            </section>
          ))}

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Our static ads this week
        </h2>
        {ourAds && ourAds.accepted.length + ourAds.discarded.length + ourAds.drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Coming soon — generate a static ad from a competitor reference above and it&apos;ll show up here.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        )}
      </section>
    </div>
  );
}

function WeeklyAdsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "all";

  const setTab = (id: TabId) => {
    router.replace(id === "all" ? "/weekly-ads" : `/weekly-ads?tab=${id}`, { scroll: false });
  };

  return (
    <div>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-5 pt-8 sm:px-10 sm:pt-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Weekly ads</h1>
          <p className="max-w-2xl text-muted-foreground">
            Competitor ad creative from your saved accounts, pulled via the Facebook Ad Library and TikTok Ad
            Library, plus the ads you&apos;ve generated in response.
          </p>
        </header>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "all" ? <AllAdsTab /> : <StaticAdsTab />}
    </div>
  );
}

export default function WeeklyAdsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted-foreground">Loading...</div>}>
      <WeeklyAdsPageInner />
    </Suspense>
  );
}
