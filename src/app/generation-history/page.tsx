"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useActiveProduct } from "@/app/context/active-product";
import { HorizontalCardRow } from "@/components/weekly-digest/shared";
import type { ProductLineGenerationHistory, BaseImageEntry, FinalImageEntry } from "@/lib/generation-history";

// Same lesson learned from CompetitorAdRow: cap what mounts at once
// regardless of how much history exists, reveal the rest via "Load More"
// rather than rendering every generated image in the DOM up front.
const INITIAL_VISIBLE = 10;
const LOAD_MORE_BATCH = 10;

function BaseImageCard({ entry }: { entry: BaseImageEntry }) {
  return (
    <Link
      href={`/static-ads/${entry.projectId}`}
      className="block w-48 shrink-0 rounded-lg border border-border overflow-hidden hover:border-primary/50"
      title={entry.prompt}
    >
      <div className="relative aspect-square w-full bg-muted">
        <Image
          src={`/api/static-ads/${entry.projectId}/image/${entry.file}`}
          alt=""
          fill
          unoptimized
          sizes="192px"
          className="object-cover"
        />
      </div>
      <div className="space-y-1 p-2.5">
        <p className="text-xs text-muted-foreground">Attempt {entry.attempt}</p>
        <p className="line-clamp-2 text-xs text-foreground">{entry.prompt}</p>
        {entry.isAccepted && (
          <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Accepted
          </span>
        )}
      </div>
    </Link>
  );
}

function FinalImageCard({ entry }: { entry: FinalImageEntry }) {
  return (
    <Link
      href={`/static-ads/${entry.projectId}`}
      className="block w-48 shrink-0 rounded-lg border border-border overflow-hidden hover:border-primary/50"
    >
      <div className="relative aspect-square w-full bg-muted">
        <Image
          src={`/api/static-ads/${entry.projectId}/image/${entry.file}`}
          alt=""
          fill
          unoptimized
          sizes="192px"
          className="object-cover"
        />
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 text-xs font-medium text-foreground">{entry.headline || "(no headline)"}</p>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            entry.status === "accepted"
              ? "bg-primary/15 text-primary"
              : entry.status === "discarded"
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {entry.status}
        </span>
      </div>
    </Link>
  );
}

function PaginatedRow<T>({ items, renderItem, keyFor }: { items: T[]; renderItem: (item: T) => React.ReactNode; keyFor: (item: T) => string }) {
  const [visibleCount, setVisibleCount] = useState(Math.min(items.length, INITIAL_VISIBLE));
  const visible = items.slice(0, visibleCount);
  const remaining = items.length - visibleCount;

  return (
    <div className="space-y-2">
      <HorizontalCardRow>
        {visible.map((item) => (
          <div key={keyFor(item)}>{renderItem(item)}</div>
        ))}
      </HorizontalCardRow>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + LOAD_MORE_BATCH)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Load more ({remaining} more)
        </button>
      )}
    </div>
  );
}

export default function GenerationHistoryPage() {
  const { activeId, options } = useActiveProduct();
  const [productLineId, setProductLineId] = useState(activeId);
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Generation history</h1>
        <p className="max-w-2xl text-muted-foreground">
          Every image the Static Ad Generator has produced — base images (product swapped in, no
          text yet) and finished ads (text/CTA baked in) — kept separate, one product line at a time.
        </p>
        <select
          value={productLineId}
          onChange={(e) => setProductLineId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          {options.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && (!selected || (selected.baseImages.length === 0 && selected.finalImages.length === 0)) && (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No generated images for this product line yet.
        </p>
      )}

      {!loading && !error && selected && (
        <>
          {selected.baseImages.length > 0 && (
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Base images ({selected.baseImages.length})
              </h2>
              <PaginatedRow
                items={selected.baseImages}
                keyFor={(e) => `${e.projectId}-${e.attempt}`}
                renderItem={(e) => <BaseImageCard entry={e} />}
              />
            </section>
          )}

          {selected.finalImages.length > 0 && (
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Finished ads ({selected.finalImages.length})
              </h2>
              <PaginatedRow
                items={selected.finalImages}
                keyFor={(e) => e.projectId}
                renderItem={(e) => <FinalImageCard entry={e} />}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
