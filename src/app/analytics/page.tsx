"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCount } from "@/lib/utils";
import { ANALYTICS_CHANNELS } from "@/lib/analytics-channels";
import type { TikTokVideoStats } from "@/lib/tiktok-display";

interface TikTokSummary {
  status: "connected" | "not_connected" | "error";
  videoCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
}

export default function AnalyticsSummaryPage() {
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
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="max-w-2xl text-muted-foreground">
          A summary across every channel. Click a channel below for its full breakdown.
        </p>
      </header>

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
            {channel.id === "tiktok" && (
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
            )}
            {channel.id !== "tiktok" && (
              <p className="mt-2 text-sm text-muted-foreground">No integration yet</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
