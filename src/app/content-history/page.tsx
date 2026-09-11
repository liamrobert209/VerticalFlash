"use client";

import { useEffect, useState } from "react";
import type { ContentRecord } from "@/lib/content-record-schema";
import { useActiveProduct } from "@/app/context/active-product";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  remake: "Remake",
  adhoc: "Iterate on content",
  prompt: "Custom prompt",
  music: "From a song",
  master_cutdown: "Storyboard short",
};

export default function ContentHistoryPage() {
  const { options: productLineOptions } = useActiveProduct();
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [productLineFilter, setProductLineFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hookSearch, setHookSearch] = useState("");
  const PAGE_SIZE = 50;
  const [cursor, setCursor] = useState(0);

  const load = async (atCursor: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (productLineFilter) params.set("productLineId", productLineFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (hookSearch.trim()) params.set("hook", hookSearch.trim());
      params.set("cursor", String(atCursor));
      params.set("limit", String(PAGE_SIZE));
      const res = await fetch(`/api/content-history?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load content history");
      setRecords(data.records);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load content history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCursor(0);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productLineFilter, from, to]);

  const productLineLabel = (id: string | null) =>
    id ? productLineOptions.find((p) => p.id === id)?.label ?? id : "—";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Content history</h1>
        <p className="max-w-2xl text-muted-foreground">
          Everything generated so far — filter by product, date, or hook/angle to see what&apos;s already been made.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-4">
        <select
          value={productLineFilter}
          onChange={(e) => setProductLineFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All products</option>
          {productLineOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="From date"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="To date"
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCursor(0);
            load(0);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Search hook/angle..."
            value={hookSearch}
            onChange={(e) => setHookSearch(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <button type="submit" className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted">
            Search
          </button>
        </form>
        <span className="ml-auto text-sm text-muted-foreground">{total} total</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Video</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Product</th>
              <th className="px-4 py-2.5 font-semibold">Format</th>
              <th className="px-4 py-2.5 font-semibold">Hook / angle</th>
              <th className="px-4 py-2.5 font-semibold">Reference</th>
              <th className="px-4 py-2.5 font-semibold">Last rendered</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!loading && records.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Nothing matches these filters yet.</td></tr>
            )}
            {records.map((record) => (
              <tr key={record.videoId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">{record.videoId}</td>
                <td className="px-4 py-3 align-top">{CONTENT_TYPE_LABELS[record.contentType] ?? record.contentType}</td>
                <td className="px-4 py-3 align-top">{productLineLabel(record.productLineId)}</td>
                <td className="px-4 py-3 align-top text-muted-foreground">{record.format ?? "—"}</td>
                <td className="px-4 py-3 align-top">
                  {record.originalAngle || record.newAngle ? (
                    <div className="space-y-0.5 text-xs">
                      {record.originalAngle && <div><span className="text-muted-foreground">from:</span> {record.originalAngle}</div>}
                      {record.newAngle && <div><span className="text-muted-foreground">to:</span> {record.newAngle}</div>}
                    </div>
                  ) : (
                    <span className="max-w-xs truncate text-xs text-muted-foreground" title={record.hook ?? undefined}>
                      {record.hook ?? "—"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                  {record.referenceAccountHandle ? (
                    <div>
                      @{record.referenceAccountHandle}
                      {record.referenceAccountFollowerCount != null && (
                        <div>{record.referenceAccountFollowerCount.toLocaleString()} followers</div>
                      )}
                      {record.referenceContentLikeCount != null && (
                        <div>{record.referenceContentLikeCount.toLocaleString()} likes</div>
                      )}
                    </div>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                  {new Date(record.lastRenderedAt).toLocaleString()}
                  {record.renderCount > 1 && <div>{record.renderCount} renders</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total === 0 ? 0 : cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={cursor === 0 || loading}
              onClick={() => {
                const next = Math.max(0, cursor - PAGE_SIZE);
                setCursor(next);
                load(next);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={cursor + PAGE_SIZE >= total || loading}
              onClick={() => {
                const next = cursor + PAGE_SIZE;
                setCursor(next);
                load(next);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
