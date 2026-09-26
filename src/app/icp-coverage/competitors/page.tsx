"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useActiveProduct } from "@/app/context/active-product";
import { ANGLE_SOURCE_LABELS } from "@/lib/icp-angles";
import type { CompetitorCoverage } from "@/lib/icp-coverage";
import { Skeleton, SkeletonChart } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductLinePicker } from "@/components/ui/ProductLinePicker";
import { Building2 } from "lucide-react";

const ROW_HEIGHT_PX = 32;
const CHART_MARGIN_PX = 40;

function CategoryChart({ title, items, customCount }: { title: string; items: { label: string; count: number }[]; customCount: number }) {
  const data = [...items, ...(customCount > 0 ? [{ label: "(other)", count: customCount }] : [])];
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ICP items configured for this product line yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT_PX + CHART_MARGIN_PX}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
            <XAxis type="number" allowDecimals={false} domain={[0, maxCount]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={220} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${value} ad${value === 1 ? "" : "s"}`, "Coverage"]} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.count === 0 ? "var(--muted-foreground)" : "var(--primary)"} fillOpacity={d.count === 0 ? 0.25 : 0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function IcpCompetitorsPage() {
  const { activeId, options } = useActiveProduct();
  const [productLineId, setProductLineId] = useState(activeId);
  const [competitors, setCompetitors] = useState<CompetitorCoverage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/icp-coverage/competitors?productLineId=${encodeURIComponent(productLineId)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to load coverage");
        return res.json();
      })
      .then((data: { competitors: CompetitorCoverage[] }) => {
        if (cancelled) return;
        setCompetitors(data.competitors);
        setSelectedId(data.competitors[0]?.accountId ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load coverage");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productLineId]);

  const selected = competitors.find((c) => c.accountId === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/icp-coverage/portfolio" className="hover:underline">Our ad portfolio</Link>
          <span>·</span>
          <Link href="/icp-coverage/competitors" className="font-semibold text-primary">Competitor analysis</Link>
          <span>·</span>
          <Link href="/icp-coverage/summary" className="hover:underline">Summary</Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Competitor analysis</h1>
        <p className="max-w-2xl text-muted-foreground">
          How many of each competitor&apos;s ads map to our own ICP pain points and solutions —
          pick a competitor on the left to see their coverage.
        </p>
        <ProductLinePicker options={options} value={productLineId} onChange={setProductLineId} />
      </header>

      {loading && (
        <div className="grid grid-cols-[220px_1fr] gap-6">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
          <SkeletonChart rows={5} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && competitors.length === 0 && (
        <EmptyState icon={Building2} title="No competitors linked to this product line yet" />
      )}

      {!loading && !error && competitors.length > 0 && (
        <div className="grid grid-cols-[220px_1fr] gap-6">
          <div className="space-y-1">
            {competitors.map((c) => (
              <button
                key={c.accountId}
                onClick={() => setSelectedId(c.accountId)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                  c.accountId === selectedId ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"
                }`}
              >
                {c.accountName}
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.totalClassifiedAds} classified
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-4">
              {selected.categories.map((cat) => (
                <CategoryChart
                  key={cat.category}
                  title={ANGLE_SOURCE_LABELS[cat.category]}
                  items={cat.items}
                  customCount={cat.customCount}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
