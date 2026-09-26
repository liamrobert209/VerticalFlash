"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ANGLE_SOURCE_LABELS } from "@/lib/icp-angles";
import type { ProductLineSummary, SpendAllocationItem } from "@/lib/icp-coverage";
import { Skeleton, SkeletonChart } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Lightbulb } from "lucide-react";

const SPEND_ROW_HEIGHT_PX = 32;
const SPEND_CHART_MARGIN_PX = 40;

function formatMoney(n: number): string {
  return `£${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SpendAllocationChart({ items }: { items: SpendAllocationItem[] }) {
  if (items.length === 0) return null;
  const data = items.map((i) => ({ label: i.productLineLabel, spend: i.spend, pct: i.percentOfTotal }));

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Spend by product line</h2>
      <p className="text-xs text-muted-foreground">
        Our own real ad spend (Adnova), not a proxy — only product lines with a mapped spend category are shown.
      </p>
      <ResponsiveContainer width="100%" height={data.length * SPEND_ROW_HEIGHT_PX + SPEND_CHART_MARGIN_PX}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
          <XAxis type="number" tickFormatter={formatMoney} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name, props) => [
              `${formatMoney(props.payload.spend)} (${(props.payload.pct * 100).toFixed(1)}%)`,
              "Spend",
            ]}
          />
          <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill="var(--primary)" fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CoverageBar({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{pct === null ? "—" : `${Math.round(pct * 100)}%`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct === null ? 0 : pct * 100}%` }} />
      </div>
    </div>
  );
}

function formatFollowers(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ProductLineCard({ summary }: { summary: ProductLineSummary }) {
  return (
    <div className="space-y-4 rounded-lg border border-border p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-foreground">{summary.productLineLabel}</h2>
        <p className="text-sm text-muted-foreground">
          {summary.ourTotalAds} of ours · {summary.competitorActiveAdTotal} active competitor ads
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CoverageBar label="Pain points covered" pct={summary.painPointCoveragePct} />
        <CoverageBar label="Solutions covered" pct={summary.solutionCoveragePct} />
      </div>

      {summary.gaps.length === 0 && summary.overIndexed.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clear gaps or over-indexing detected here.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {summary.gaps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                Gaps — competitors cover this, we don&apos;t
              </p>
              <ul className="space-y-1 text-sm">
                {summary.gaps.map((g) => (
                  <li key={`${g.category}-${g.label}`} className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground">{g.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ANGLE_SOURCE_LABELS[g.category]} · {g.competitorCount} competitor ad{g.competitorCount === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.overIndexed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Possibly over-indexed — we&apos;ve built several, no competitor activity
              </p>
              <ul className="space-y-1 text-sm">
                {summary.overIndexed.map((o) => (
                  <li key={`${o.category}-${o.label}`} className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground">{o.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ANGLE_SOURCE_LABELS[o.category]} · {o.ourCount} of ours
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {summary.topCompetitorsByIntensity.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Leaning in hardest right now
          </p>
          <ul className="space-y-1 text-sm">
            {summary.topCompetitorsByIntensity.map((c) => (
              <li key={c.accountId} className="flex items-baseline justify-between gap-2">
                <span className="text-foreground">{c.accountName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.activeAdCount} active ad{c.activeAdCount === 1 ? "" : "s"}
                  {c.avgDaysRunning !== null && ` · avg ${c.avgDaysRunning}d running`}
                  {c.maxFollowerCount !== null && ` · ${formatFollowers(c.maxFollowerCount)} followers`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function IcpSummaryPage() {
  const [summaries, setSummaries] = useState<ProductLineSummary[]>([]);
  const [spendAllocation, setSpendAllocation] = useState<SpendAllocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/icp-coverage/summary", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to load summary");
        return res.json();
      })
      .then((data: { summaries: ProductLineSummary[]; spendAllocation: SpendAllocationItem[] }) => {
        if (!cancelled) {
          setSummaries(data.summaries);
          setSpendAllocation(data.spendAllocation ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load summary");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/icp-coverage/portfolio" className="hover:underline">Our ad portfolio</Link>
          <span>·</span>
          <Link href="/icp-coverage/competitors" className="hover:underline">Competitor analysis</Link>
          <span>·</span>
          <Link href="/icp-coverage/summary" className="font-semibold text-primary">Summary</Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Summary</h1>
        <p className="max-w-2xl text-muted-foreground">
          Every product line with an ICP profile, sorted by how many clear gaps it has — where
          competitors are covering a pain point we aren&apos;t. Competitive intensity is estimated
          from active ad count, how long ads have run, and follower count — we don&apos;t have
          access to real competitor spend data.
        </p>
      </header>

      {loading && <SkeletonChart rows={5} />}
      {loading &&
        Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-lg border border-border p-5">
            <div className="flex items-baseline justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ))}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && <SpendAllocationChart items={spendAllocation} />}

      {!loading && !error && summaries.length === 0 && (
        <EmptyState icon={Lightbulb} title="No product lines with an ICP profile configured yet" />
      )}

      {!loading && !error && summaries.map((s) => <ProductLineCard key={s.productLineId} summary={s} />)}
    </div>
  );
}
