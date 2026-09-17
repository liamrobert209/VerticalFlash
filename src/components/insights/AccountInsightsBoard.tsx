"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { findAnalyticsChannel } from "@/lib/analytics-channels";

interface ScrapedContentLike {
  id: string;
  caption: string | null;
  postedAt: string | Date | null;
  viewCount: number | null;
}

interface AccountInsights {
  accountId: string;
  accountName: string;
  postCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  avgViews: number;
  topPost: ScrapedContentLike | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function AccountInsightsBoard({
  title,
  description,
  backHref,
  emptyStateHint,
  channelHints,
}: {
  title: string;
  description: string;
  backHref: string;
  emptyStateHint: string;
  // Per-channel override for emptyStateHint — for channels that actually
  // have real backing data (e.g. Content Insights' Facebook/Instagram,
  // read from the social-metrics DB) the generic "no content synced yet"
  // blurb is simply wrong. Channels not listed here keep emptyStateHint.
  channelHints?: Partial<Record<string, string>>;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-muted-foreground">{description}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {["tiktok", "facebook", "instagram", "reddit", "twitter", "youtube"].map((id) => {
          const channel = findAnalyticsChannel(id);
          return (
            <Link
              key={id}
              href={`${backHref}/${id}`}
              className="rounded-lg border border-border p-4 transition-colors hover:border-primary/60 hover:bg-muted/40"
            >
              <p className="font-semibold text-foreground">{channel?.label ?? id}</p>
              <p className="mt-1 text-sm text-muted-foreground">{channelHints?.[id] ?? emptyStateHint}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AccountInsightsChannelPage({
  platform,
  apiPath,
  backHref,
  title,
}: {
  platform: string;
  apiPath: string;
  backHref: string;
  title: string;
}) {
  const channel = findAnalyticsChannel(platform);
  const [accounts, setAccounts] = useState<AccountInsights[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(apiPath, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [apiPath]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← {title}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          {channel?.label ?? platform} {title.toLowerCase()}
        </h1>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!loading && accounts && accounts.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No accounts have synced content for this channel yet.
        </p>
      )}

      {!loading && accounts && accounts.length > 0 && (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.accountId} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground">{a.accountName}</p>
                <p className="text-xs text-muted-foreground">{a.postCount} posts</p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total views</p>
                  <p className="font-medium text-foreground">{formatCount(a.totalViews)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total likes</p>
                  <p className="font-medium text-foreground">{formatCount(a.totalLikes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg views/post</p>
                  <p className="font-medium text-foreground">{formatCount(a.avgViews)}</p>
                </div>
              </div>
              {a.topPost && (
                <p className="mt-2 truncate text-xs text-muted-foreground" title={a.topPost.caption ?? undefined}>
                  Top post: {a.topPost.caption || "(no caption)"} · {formatCount(a.topPost.viewCount ?? 0)} views
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
