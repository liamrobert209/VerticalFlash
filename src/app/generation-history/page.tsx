"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useActiveProduct } from "@/app/context/active-product";
import type { ProductLineGenerationHistory, BaseImageEntry, FinalImageEntry } from "@/lib/generation-history";

// Redesigned away from "dropdown + horizontal scroll row + Load more":
// product lines are now pills (all visible at once, no dropdown chevron),
// Base/Finished is a segmented toggle instead of two stacked sections you
// have to scroll past, images lay out in a responsive grid instead of a
// single scrolling row, and paging through a large set uses real page
// numbers instead of ever-growing "Load more" batches.
const PAGE_SIZE = 24;

function BaseImageCard({ entry }: { entry: BaseImageEntry }) {
  return (
    <Link
      href={`/static-ads/${entry.projectId}`}
      className="block overflow-hidden rounded-lg border border-border hover:border-primary/50"
      title={entry.prompt}
    >
      <div className="relative aspect-square w-full bg-muted">
        <Image
          src={`/api/static-ads/${entry.projectId}/image/${entry.file}`}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          className="object-cover"
        />
        {entry.isAccepted && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            Accepted
          </span>
        )}
      </div>
      <div className="space-y-1 p-2.5">
        <p className="text-xs text-muted-foreground">Attempt {entry.attempt}</p>
        <p className="line-clamp-2 text-xs text-foreground">{entry.prompt}</p>
      </div>
    </Link>
  );
}

function FinalImageCard({ entry }: { entry: FinalImageEntry }) {
  return (
    <Link
      href={`/static-ads/${entry.projectId}`}
      className="block overflow-hidden rounded-lg border border-border hover:border-primary/50"
    >
      <div className="relative aspect-square w-full bg-muted">
        <Image
          src={`/api/static-ads/${entry.projectId}/image/${entry.file}`}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          className="object-cover"
        />
        <span
          className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            entry.status === "accepted"
              ? "bg-primary text-primary-foreground"
              : entry.status === "discarded"
                ? "bg-destructive text-white"
                : "bg-card text-muted-foreground"
          }`}
        >
          {entry.status}
        </span>
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 text-xs font-medium text-foreground">{entry.headline || "(no headline)"}</p>
      </div>
    </Link>
  );
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;

  // Keeps the strip short even with dozens of pages: always show the
  // first/last page, a window around the current page, and collapse the
  // rest behind an ellipsis rather than rendering every page number.
  const pages: (number | "ellipsis")[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "ellipsis") pages.push("ellipsis");
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className="rounded-md border border-border px-2.5 py-1 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className="px-1 text-sm text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`min-w-8 rounded-md px-2.5 py-1 text-sm font-semibold ${
              p === page ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
        className="rounded-md border border-border px-2.5 py-1 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}

function ImageGrid<T>({ items, keyFor, renderItem }: { items: T[]; keyFor: (item: T) => string; renderItem: (item: T) => React.ReactNode }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const visible = items.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((item) => (
          <div key={keyFor(item)}>{renderItem(item)}</div>
        ))}
      </div>
      <Pagination page={clampedPage} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}

export default function GenerationHistoryPage() {
  const { activeId, options } = useActiveProduct();
  const [productLineId, setProductLineId] = useState(activeId);
  const [view, setView] = useState<"base" | "finished">("base");
  const [acceptedOnly, setAcceptedOnly] = useState(false);
  const [history, setHistory] = useState<ProductLineGenerationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/generation-history", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to load generation history");
        return res.json();
      })
      .then((data: { productLines: ProductLineGenerationHistory[] }) => {
        if (!cancelled) setHistory(data.productLines);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load generation history");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = history.find((h) => h.productLineId === productLineId) ?? null;
  const baseImages = useMemo(
    () => (acceptedOnly ? (selected?.baseImages ?? []).filter((e) => e.isAccepted) : selected?.baseImages ?? []),
    [selected, acceptedOnly]
  );
  const finalImages = selected?.finalImages ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Generation history</h1>
        <p className="max-w-2xl text-muted-foreground">
          Every image the Static Ad Generator has produced — base images (product swapped in, no
          text yet) and finished ads (text/CTA baked in) — kept separate, one product line at a time.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {options.map((p) => {
          const entry = history.find((h) => h.productLineId === p.id);
          const count = (entry?.baseImages.length ?? 0) + (entry?.finalImages.length ?? 0);
          const active = p.id === productLineId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setProductLineId(p.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              {p.label} <span className={active ? "opacity-80" : "text-muted-foreground"}>({count})</span>
            </button>
          );
        })}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && (!selected || (selected.baseImages.length === 0 && selected.finalImages.length === 0)) && (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No generated images for this product line yet.
        </p>
      )}

      {!loading && !error && selected && (selected.baseImages.length > 0 || selected.finalImages.length > 0) && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setView("base")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  view === "base" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Base images ({selected.baseImages.length})
              </button>
              <button
                type="button"
                onClick={() => setView("finished")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  view === "finished" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Finished ads ({selected.finalImages.length})
              </button>
            </div>
            {view === "base" && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={acceptedOnly}
                  onChange={(e) => setAcceptedOnly(e.target.checked)}
                  className="size-3.5 rounded border-input accent-primary"
                />
                Accepted only
              </label>
            )}
          </div>

          {view === "base" &&
            (baseImages.length > 0 ? (
              <ImageGrid
                items={baseImages}
                keyFor={(e) => `${e.projectId}-${e.attempt}`}
                renderItem={(e) => <BaseImageCard entry={e} />}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                No accepted base images yet.
              </p>
            ))}

          {view === "finished" &&
            (finalImages.length > 0 ? (
              <ImageGrid items={finalImages} keyFor={(e) => e.projectId} renderItem={(e) => <FinalImageCard entry={e} />} />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                No finished ads for this product line yet.
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
