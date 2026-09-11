"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DownloadEntry } from "@/lib/download-types";
import { formatRelativeTime } from "@/lib/utils";
import { useBrand } from "@/app/context/brand";

interface TrackCard {
  title: string;
  description: string;
  href: string;
  enabled: boolean;
}

const TRACKS: TrackCard[] = [
  {
    title: "Get Inspired",
    description:
      "Scan TikTok niches for winning videos, then remake one with your own clips",
    href: "/scan",
    enabled: true,
  },
  {
    title: "Iterate on a top video",
    description:
      "Pick one of your best-performing published videos and build an alternate version",
    href: "/iterate",
    enabled: true,
  },
  {
    title: "Custom video from a prompt",
    description:
      "Describe the video you want — build it from library clips or full AI generation",
    href: "/create",
    enabled: true,
  },
  {
    title: "Storyboard shorts from your own footage",
    description:
      "Upload a talking-head or product recording, get hook → main → end storyboards, cut shorts from it",
    href: "/storyboard",
    enabled: true,
  },
];

interface GuideGroup {
  title: string;
  items: { label: string; description: string }[];
}

const GUIDE_GROUPS: GuideGroup[] = [
  {
    title: "Create",
    items: [
      { label: "New scan", description: "search a niche/hashtag or your saved competitor accounts for videos worth remaking" },
      { label: "Iterate on a top video", description: "build an alternate version of one of your own best-performing published videos" },
      { label: "Iterate creator content", description: "swap the hook and product on an affiliate's, influencer's, or other creator's video" },
      { label: "Iterate ad content", description: "same tool as above, tagged as coming from a competitor or your own past ad" },
      { label: "Custom from a prompt", description: "describe a video and build it from library clips or full AI generation" },
      { label: "Start from a song", description: "build a video around a chosen track" },
      { label: "Storyboard from your own footage", description: "upload raw footage and get hook → main → end storyboards to cut shorts from" },
    ],
  },
  {
    title: "Library & projects",
    items: [
      { label: "Clip library", description: "your uploaded B-roll, tagged by which of your products each clip can represent" },
      { label: "Downloads / Editing / Storyboards", description: "everything currently in progress or already rendered" },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Content history", description: "every video generated so far — filter by product, platform, date, or hook/angle" },
      { label: "TikTok analytics", description: "live performance of your posted TikTok videos" },
      { label: "Benchmarks", description: "compare AI providers on tagging, matching, storyboarding, editing, and B-roll" },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Saved accounts", description: "your competitor/reference account list, usable directly from New scan" },
      { label: "Brand assets", description: "branding guidelines, logo, and the source ICP/competitor documents for reference" },
      { label: "Product images", description: "reference photos per product, used automatically when AI-generating footage" },
    ],
  },
];

export default function StartPage() {
  const router = useRouter();
  const brand = useBrand();
  const [recent, setRecent] = useState<DownloadEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/downloads")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const files: DownloadEntry[] = data?.files ?? [];
        setRecent(
          [...files]
            .sort(
              (a, b) =>
                (b.lastEditedAt ?? b.modified) - (a.lastEditedAt ?? a.modified)
            )
            .slice(0, 3)
        );
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen p-8">
      <div className="w-full max-w-2xl space-y-10 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Start a new video</h1>
          <p className="mt-2 text-muted-foreground">
            Four ways to kick off a {brand.name} video
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {TRACKS.map((track) => (
            <button
              key={track.title}
              onClick={() => track.enabled && router.push(track.href)}
              disabled={!track.enabled}
              className={
                track.enabled
                  ? "text-left p-5 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-muted/40 transition-colors"
                  : "text-left p-5 rounded-xl border border-border bg-card opacity-50 cursor-not-allowed"
              }
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {track.title}
                </span>
                {!track.enabled && (
                  <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-semibold">
                    Soon
                  </span>
                )}
              </span>
              <span className="mt-1.5 block text-sm text-muted-foreground">
                {track.description}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-xl border border-dashed border-border p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              How to use {brand.name}&apos;s tools
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A quick summary of what each part of the sidebar does.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {GUIDE_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {group.title}
                </h3>
                <ul className="space-y-1.5">
                  {group.items.map((item) => (
                    <li key={item.label} className="text-sm">
                      <span className="font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {item.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            Editing a video always follows the same four steps: Analyze → Add
            footage (library match or AI-generate) → Render → Finish &amp;
            post. The Active product selector at the top of the sidebar
            controls which product gets matched/generated and written into
            captions — set it first.
          </p>
        </div>

        {loaded && recent.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Continue working
              </h2>
              <button
                onClick={() => router.push("/downloads")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                All working files →
              </button>
            </div>
            <div className="space-y-2">
              {recent.map((file) => (
                <button
                  key={file.name}
                  onClick={() =>
                    router.push(`/downloads/${encodeURIComponent(file.name)}`)
                  }
                  className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {file.displayName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {file.name}
                      {file.render ? " · rendered" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Edited{" "}
                    {formatRelativeTime(file.lastEditedAt ?? file.modified)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
