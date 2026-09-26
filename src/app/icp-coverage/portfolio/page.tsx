"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useActiveProduct } from "@/app/context/active-product";
import { ANGLE_SOURCE_LABELS } from "@/lib/icp-angles";
import type { PortfolioCoverage } from "@/lib/icp-coverage";
import { SkeletonChart } from "@/components/ui/Skeleton";
import { ProductLinePicker } from "@/components/ui/ProductLinePicker";

// Bar height is proportional to label count, not fixed — a category with
// 8 ICP items needs visibly more vertical room than one with 3, or labels
// start overlapping.
const ROW_HEIGHT_PX = 32;
const CHART_MARGIN_PX = 40;

function CategoryChart({ title, items, customCount }: { title: string; items: { label: string; count: number }[]; customCount: number }) {
  const data = [...items, ...(customCount > 0 ? [{ label: "(custom, not on the ICP list)", count: customCount }] : [])];
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
                <Cell key={i} fill={d.count === 0 ? "var(--destructive)" : "var(--primary)"} fillOpacity={d.count === 0 ? 0.3 : 0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function IcpPortfolioPage() {
  const { activeId, options } = useActiveProduct();
  const [productLineId, setProductLineId] = useState(activeId);
  const [coverage, setCoverage] = useState<PortfolioCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/icp-coverage/portfolio?productLineId=${encodeURIComponent(productLineId)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to load coverage");
        return res.json();
      })
      .then((data: PortfolioCoverage) => {
        if (!cancelled) setCoverage(data);
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

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/icp-coverage/portfolio" className="font-semibold text-primary">Our ad portfolio</Link>
          <span>·</span>
          <Link href="/icp-coverage/competitors" className="hover:underline">Competitor analysis</Link>
          <span>·</span>
          <Link href="/icp-coverage/summary" className="hover:underline">Summary</Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Our ad portfolio</h1>
        <p className="max-w-2xl text-muted-foreground">
          How many of our own generated static ads exist for each real ICP pain point and solution —
          a coverage/gap view, so you can see what&apos;s over- or under-represented at a glance.
        </p>
        <ProductLinePicker options={options} value={productLineId} onChange={setProductLineId} />
      </header>

      {loading && (
        <div className="space-y-4">
          <SkeletonChart rows={5} />
          <SkeletonChart rows={3} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {coverage && !loading && !error && (
        <>
          <p className="text-sm text-muted-foreground">
            {coverage.totalAds} static ad{coverage.totalAds === 1 ? "" : "s"} generated for this product line
            {coverage.uncategorizedCount > 0 && ` (${coverage.uncategorizedCount} with no angle set at all)`}.
            {!coverage.icpLabel && " No ICP profile is configured for this product line yet."}
          </p>
          {coverage.categories.map((cat) => (
            <CategoryChart
              key={cat.category}
              title={ANGLE_SOURCE_LABELS[cat.category]}
              items={cat.items}
              customCount={cat.customCount}
            />
          ))}
        </>
      )}
    </div>
  );
}
