"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScrapedContent } from "@/lib/scraped-content-schema";

interface ProductLineSection {
  productLineId: string;
  label: string;
  newest: ScrapedContent[];
  topPerforming: ScrapedContent[];
}

function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ContentCard({
  item,
  onSelect,
  selected,
}: {
  item: ScrapedContent;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <p className="text-sm font-medium text-foreground line-clamp-2">
        {item.caption || "(no caption)"}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {item.postedAt && <span>{new Date(item.postedAt).toLocaleDateString()}</span>}
        <span>👁 {formatCount(item.viewCount)}</span>
        <span>♥ {formatCount(item.likeCount)}</span>
        <span>💬 {formatCount(item.commentCount)}</span>
      </div>
      {item.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function ContentDetail({
  item,
  productLineId,
  origin,
}: {
  item: ScrapedContent;
  productLineId: string;
  origin: "creator" | "ad";
}) {
  const generateHref = useMemo(() => {
    const params = new URLSearchParams({ origin, productLineId });
    if (item.mediaUrl) params.set("url", item.mediaUrl);
    return `/create-ad-hoc?${params.toString()}`;
  }, [item, productLineId, origin]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <p className="text-sm text-foreground">{item.caption || "(no caption)"}</p>
      {item.mediaUrl && (
        <a
          href={item.mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-primary underline-offset-4 hover:underline"
        >
          View post ▸
        </a>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Posted</p>
          <p className="mt-0.5 text-foreground">
            {item.postedAt ? new Date(item.postedAt).toLocaleDateString() : "unknown"}
          </p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Engagement</p>
          <p className="mt-0.5 text-foreground">
            {formatCount(item.viewCount)} views · {formatCount(item.likeCount)} likes · {formatCount(item.commentCount)} comments
          </p>
        </div>
      </div>
      {item.tags.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
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

export function WeeklyContentBoard({
  title,
  description,
  apiPath,
  origin,
  emptyStateHint,
}: {
  title: string;
  description: string;
  apiPath: string;
  origin: "creator" | "ad";
  emptyStateHint: string;
}) {
  const [sections, setSections] = useState<ProductLineSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ item: ScrapedContent; productLineId: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(apiPath, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setSections(data.productLines ?? []))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, [apiPath]);

  const nonEmptySections = sections.filter((s) => s.newest.length > 0 || s.topPerforming.length > 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-muted-foreground">{description}</p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!loading && nonEmptySections.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {emptyStateHint}
        </p>
      )}

      {!loading &&
        nonEmptySections.map((section) => (
          <section key={section.productLineId} className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Newest</p>
                <div className="space-y-2">
                  {section.newest.map((item) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      selected={selected?.item.id === item.id}
                      onSelect={() => setSelected({ item, productLineId: section.productLineId })}
                    />
                  ))}
                  {section.newest.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet.</p>}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Top performing</p>
                <div className="space-y-2">
                  {section.topPerforming.map((item) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      selected={selected?.item.id === item.id}
                      onSelect={() => setSelected({ item, productLineId: section.productLineId })}
                    />
                  ))}
                  {section.topPerforming.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet.</p>}
                </div>
              </div>
            </div>
          </section>
        ))}

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:rounded-lg sm:border">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
            <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Close ✕
            </button>
          </div>
          <ContentDetail item={selected.item} productLineId={selected.productLineId} origin={origin} />
        </div>
      )}
    </div>
  );
}
