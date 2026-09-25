"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Megaphone, Newspaper, Users } from "lucide-react";
import { formatCount } from "@/lib/utils";
import { ANALYTICS_CHANNELS } from "@/lib/analytics-channels";
import type { TikTokVideoStats } from "@/lib/tiktok-display";
import { BudgetSpendPanel } from "@/components/insights/BudgetSpendPanel";
import { AccountInsightsBoard } from "@/components/insights/AccountInsightsBoard";

// Merges what used to be four separate sidebar destinations (Analytics, Ad
// Insights, Content Insights, Creator Insights) — each just a channel grid
// keyed by a different data source — into one page with a tab switcher.
// Per-channel drill-down routes (/analytics/[platform], /ad-insights/...,
// etc.) are untouched; only the four landing/summary screens are merged.

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "ads", label: "Ads", icon: Megaphone },
  { id: "content", label: "Content", icon: Newspaper },
  { id: "creators", label: "Creators", icon: Users },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ADNOVA_PLATFORMS = new Set(["facebook", "instagram"]);

interface TikTokSummary {
  status: "connected" | "not_connected" | "error";
  videoCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
}

function OverviewTab() {
  const [tiktok, setTiktok] = useState<TikTokSummary | null>(null);

  useEffect(() => {
    fetch("/api/tiktok/videos")
      .then(async (res) => {
        if (res.status === 401) return { status: "not_connected" as const };
        if (!res.ok) return { status: "error" as const };
        const data = await res.json();
        const videos: TikTokVideoStats[] = data.videos || [];
        return {
          status: "connected" as const,
          videoCount: videos.length,
          totalViews: videos.reduce((sum, v) => sum + (v.viewCount || 0), 0),
          totalLikes: videos.reduce((sum, v) => sum + (v.likeCount || 0), 0),
          totalComments: videos.reduce((sum, v) => sum + (v.commentCount || 0), 0),
        };
      })
      .then((summary) =>
        setTiktok({
          status: summary.status,
          videoCount: "videoCount" in summary ? (summary.videoCount ?? 0) : 0,
          totalViews: "totalViews" in summary ? (summary.totalViews ?? 0) : 0,
          totalLikes: "totalLikes" in summary ? (summary.totalLikes ?? 0) : 0,
          totalComments: "totalComments" in summary ? (summary.totalComments ?? 0) : 0,
        })
      )
      .catch(() => setTiktok({ status: "error", videoCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 }));
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      {ANALYTICS_CHANNELS.map((channel) => (
        <Link
          key={channel.id}
          href={`/analytics/${channel.id}`}
          className="rounded-lg border border-border p-4 transition-colors hover:border-primary/60 hover:bg-muted/40"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">{channel.label}</p>
            {!channel.connected && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                Not connected
              </span>
            )}
          </div>
          {channel.id === "tiktok" ? (
            <div className="mt-2 text-sm text-muted-foreground">
              {tiktok === null ? (
                "Loading..."
              ) : tiktok.status === "not_connected" ? (
                "Not connected"
              ) : tiktok.status === "error" ? (
                "Couldn't load"
              ) : (
                <>
                  {tiktok.videoCount} posts · {formatCount(tiktok.totalViews)} views ·{" "}
                  {formatCount(tiktok.totalLikes)} likes
                </>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No integration yet</p>
          )}
        </Link>
      ))}
    </div>
  );
}

function AdsTab() {
  return (
    <div className="space-y-6">
      <BudgetSpendPanel />
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {ANALYTICS_CHANNELS.map((channel) => (
          <Link
            key={channel.id}
            href={`/ad-insights/${channel.id}`}
            className="rounded-lg border border-border p-4 transition-colors hover:border-primary/60 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{channel.label}</p>
              {!ADNOVA_PLATFORMS.has(channel.id) && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  Competitor ads only
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {ADNOVA_PLATFORMS.has(channel.id)
                ? "Our own tagged ad performance + competitor activity"
                : "No tagged performance data — competitor activity only"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

const TAB_META: Record<TabId, { description: string }> = {
  overview: { description: "A summary across every owned channel. Click a channel for its full breakdown." },
  ads: {
    description:
      "Best-performing hooks, USPs, and formats from our own ad campaigns, plus what competitors are currently running.",
  },
  content: {
    description: "Per-account performance for your saved competitor brand accounts' organic content.",
  },
  creators: {
    description: "Per-account performance for your saved creator/affiliate accounts' organic content.",
  },
};

function InsightsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "overview";

  const setTab = (id: TabId) => {
    router.replace(id === "overview" ? "/insights" : `/insights?tab=${id}`, { scroll: false });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
        <p className="max-w-2xl text-muted-foreground">{TAB_META[tab].description}</p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "ads" && <AdsTab />}
      {tab === "content" && (
        <AccountInsightsBoard
          bare
          title="Content insights"
          description={TAB_META.content.description}
          backHref="/content-insights"
          emptyStateHint="No content synced yet"
          channelHints={{ facebook: "Real post + daily performance data", instagram: "Real post + daily performance data" }}
        />
      )}
      {tab === "creators" && (
        <AccountInsightsBoard
          bare
          title="Creator insights"
          description={TAB_META.creators.description}
          backHref="/creator-insights"
          emptyStateHint="No content synced yet"
        />
      )}
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted-foreground">Loading...</div>}>
      <InsightsPageInner />
    </Suspense>
  );
}
