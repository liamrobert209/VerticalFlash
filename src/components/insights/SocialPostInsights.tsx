"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { FacebookPost, InstagramPost, FacebookDailyMetric, InstagramDailyMetric } from "@/lib/social-metrics-schema";

// Ocushield's own Facebook/Instagram account performance — read from a
// separate social-metrics database (social-metrics-store.ts), not the
// scraped_content-backed AccountInsightsChannelPage every other channel
// still uses. Two tabs on one shared component (rather than one page per
// platform) so switching between "Facebook Post Insights" and "Instagram
// Post Insights" doesn't require a full navigation.

type Platform = "facebook" | "instagram";

const TABS: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook Post Insights" },
  { id: "instagram", label: "Instagram Post Insights" },
];

function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type SortDir = "asc" | "desc";

function useSort<T>(rows: T[], defaultKey: keyof T, defaultDir: SortDir = "desc") {
  const [key, setKey] = useState<keyof T>(defaultKey);
  const [dir, setDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, key, dir]);

  const toggle = (nextKey: keyof T) => {
    if (nextKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(nextKey);
      setDir("desc");
    }
  };

  return { sorted, sortKey: key, sortDir: dir, toggle };
}

function SortHeader<T>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: keyof T;
  sortKey: keyof T;
  sortDir: SortDir;
  onSort: (col: keyof T) => void;
}) {
  const active = sortKey === column;
  return (
    <th
      onClick={() => onSort(column)}
      className="cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-semibold text-muted-foreground hover:text-foreground"
    >
      {label} {active && (sortDir === "asc" ? "▲" : "▼")}
    </th>
  );
}

function FacebookDailyChart({ metrics }: { metrics: FacebookDailyMetric[] }) {
  const data = metrics.map((m) => ({
    date: formatDate(m.date),
    "Post engagements": m.pagePostEngagements,
    "Media views": m.pageMediaViews,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Post engagements" stroke="#e8482c" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Media views" stroke="#2563eb" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function InstagramDailyChart({ metrics }: { metrics: InstagramDailyMetric[] }) {
  const data = metrics.map((m) => ({
    date: formatDate(m.date),
    Reach: m.reach,
    Followers: m.followerCount,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Reach" stroke="#e8482c" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Followers" stroke="#2563eb" dot={false} strokeWidth={2} yAxisId={0} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function FacebookPostsTable({ posts }: { posts: FacebookPost[] }) {
  const { sorted, sortKey, sortDir, toggle } = useSort(posts, "createdTime" as keyof FacebookPost);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <SortHeader label="Date" column="createdTime" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Post" column="content" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Media views" column="postMediaViews" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Reactions" column="totalReactions" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Clicks" column="postClicks" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((post, i) => (
            <tr key={i} className="border-t border-border">
              <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{formatDate(post.createdTime)}</td>
              <td className="max-w-xs truncate px-2 py-1.5" title={post.content ?? undefined}>
                {post.content || "(no caption)"}
              </td>
              <td className="px-2 py-1.5">{formatCount(post.postMediaViews)}</td>
              <td className="px-2 py-1.5">{formatCount(post.totalReactions)}</td>
              <td className="px-2 py-1.5">{formatCount(post.postClicks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InstagramPostsTable({ posts }: { posts: InstagramPost[] }) {
  const { sorted, sortKey, sortDir, toggle } = useSort(posts, "creationDate" as keyof InstagramPost);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <SortHeader label="Date" column="creationDate" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Caption" column="caption" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Type" column="mediaProductType" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Likes" column="likes" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Comments" column="comments" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Saved" column="saved" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortHeader label="Reach" column="reach" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((post, i) => (
            <tr key={i} className="border-t border-border">
              <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{formatDate(post.creationDate)}</td>
              <td className="max-w-xs truncate px-2 py-1.5" title={post.caption ?? undefined}>
                {post.permanentLink ? (
                  <a href={post.permanentLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {post.caption || "(no caption)"}
                  </a>
                ) : (
                  post.caption || "(no caption)"
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5">{post.mediaProductType ?? "—"}</td>
              <td className="px-2 py-1.5">{formatCount(post.likes)}</td>
              <td className="px-2 py-1.5">{formatCount(post.comments)}</td>
              <td className="px-2 py-1.5">{formatCount(post.saved)}</td>
              <td className="px-2 py-1.5">{formatCount(post.reach)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SocialPostInsights({ initialPlatform }: { initialPlatform: Platform }) {
  const [activeTab, setActiveTab] = useState<Platform>(initialPlatform);
  const [facebookPosts, setFacebookPosts] = useState<FacebookPost[] | null>(null);
  const [facebookDaily, setFacebookDaily] = useState<FacebookDailyMetric[] | null>(null);
  const [instagramPosts, setInstagramPosts] = useState<InstagramPost[] | null>(null);
  const [instagramDaily, setInstagramDaily] = useState<InstagramDailyMetric[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/content-insights/${activeTab}/posts`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/content-insights/${activeTab}/daily`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([postsData, dailyData]) => {
        if (postsData.error || dailyData.error) {
          setError(postsData.error || dailyData.error);
          return;
        }
        if (activeTab === "facebook") {
          setFacebookPosts(postsData.posts ?? []);
          setFacebookDaily(dailyData.metrics ?? []);
        } else {
          setInstagramPosts(postsData.posts ?? []);
          setInstagramDaily(dailyData.metrics ?? []);
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && activeTab === "facebook" && facebookDaily && facebookPosts && (
        <>
          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">Daily performance</p>
            {facebookDaily.length === 0 ? (
              <p className="text-sm text-muted-foreground">No daily metrics yet.</p>
            ) : (
              <FacebookDailyChart metrics={facebookDaily} />
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Posts ({facebookPosts.length})</p>
            {facebookPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts yet.</p>
            ) : (
              <FacebookPostsTable posts={facebookPosts} />
            )}
          </div>
        </>
      )}

      {!loading && !error && activeTab === "instagram" && instagramDaily && instagramPosts && (
        <>
          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">Daily performance</p>
            {instagramDaily.length === 0 ? (
              <p className="text-sm text-muted-foreground">No daily metrics yet.</p>
            ) : (
              <InstagramDailyChart metrics={instagramDaily} />
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Posts ({instagramPosts.length})</p>
            {instagramPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts yet.</p>
            ) : (
              <InstagramPostsTable posts={instagramPosts} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
