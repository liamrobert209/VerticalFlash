"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp } from "lucide-react";
import type { AdPerformanceReport, BestWeek, ProductLineCreativeMakeup } from "@/lib/ad-performance";
import { SkeletonChart } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const ATTR_LABELS: Record<string, string> = {
  adAngle: "Ad angle",
  desire: "Desire",
  emotion: "Emotion",
  theme: "Theme",
  usp: "USP",
  headlineTactic: "Headline tactic",
  assetType: "Asset type",
  persona: "Persona",
};

const WEEK_ROW_HEIGHT_PX = 32;
const WEEK_CHART_MARGIN_PX = 40;

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPct(n: number | null, digits = 1): string {
  return n === null ? "—" : `${n.toFixed(digits)}%`;
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function WeeklySpendChart({ weeks, selected, onSelect }: { weeks: BestWeek[]; selected: string | null; onSelect: (weekStart: string) => void }) {
  const data = weeks.map((w) => ({ label: formatWeekLabel(w.weekStart), weekStart: w.weekStart, spend: w.spend }));
  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Weekly spend — highest first</h2>
      <p className="text-xs text-muted-foreground">
        Click a week to see its top ads and creative makeup. Weeks are the primary &quot;best week&quot;
        signal (highest spend); MER/ROAS for each is in the table below so you can judge the tradeoff
        yourself.
      </p>
      <ResponsiveContainer width="100%" height={data.length * WEEK_ROW_HEIGHT_PX + WEEK_CHART_MARGIN_PX}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
          <XAxis type="number" tickFormatter={formatMoney} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [formatMoney(value as number), "Spend"]} />
          <Bar dataKey="spend" radius={[0, 4, 4, 0]} cursor="pointer">
            {data.map((d) => (
              <Cell
                key={d.weekStart}
                fill="var(--primary)"
                fillOpacity={d.weekStart === selected ? 1 : 0.5}
                onClick={() => onSelect(d.weekStart)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeeksTable({ weeks, selected, onSelect, yoyAvailable }: { weeks: BestWeek[]; selected: string | null; onSelect: (weekStart: string) => void; yoyAvailable: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Week of</th>
            <th className="px-3 py-2 font-medium">Spend</th>
            <th className="px-3 py-2 font-medium">Revenue</th>
            <th className="px-3 py-2 font-medium">ROAS</th>
            <th className="px-3 py-2 font-medium">MER</th>
            <th className="px-3 py-2 font-medium">vs. last year</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr
              key={w.weekStart}
              onClick={() => onSelect(w.weekStart)}
              className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${
                w.weekStart === selected ? "bg-muted/70" : ""
              }`}
            >
              <td className="px-3 py-2 font-medium text-foreground">
                {formatWeekLabel(w.weekStart)}
                {w.qualifiesAltCriterion && (
                  <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    beats last year · MER&lt;30%
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{formatMoney(w.spend)}</td>
              <td className="px-3 py-2">{formatMoney(w.revenue)}</td>
              <td className="px-3 py-2">{w.roas != null ? `${w.roas.toFixed(2)}x` : "—"}</td>
              <td className="px-3 py-2">{formatPct(w.merPct)}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {yoyAvailable ? formatPct(w.revenueYoyPct) : "not enough history yet"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopAdsList({ week }: { week: BestWeek }) {
  if (week.topAds.length === 0) {
    return <p className="text-sm text-muted-foreground">No ads met the minimum spend threshold this week.</p>;
  }
  return (
    <div className="space-y-2">
      {week.topAds.map((ad) => (
        <div key={ad.adId} className="rounded-lg border border-border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground" title={ad.adName ?? ad.adId}>
              {ad.adName ?? ad.adId}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {ad.roas != null ? `${ad.roas.toFixed(2)}x ROAS` : "—"} · {formatMoney(ad.spend)} spend
            </span>
          </div>
          {ad.productCategory && (
            <p className="mt-1 text-xs text-muted-foreground">{ad.productCategory}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function CreativeMakeupCard({ makeup }: { makeup: ProductLineCreativeMakeup }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">{makeup.productLineLabel}</h3>
        <p className="text-xs text-muted-foreground">
          {makeup.adCount} ad{makeup.adCount === 1 ? "" : "s"} · {formatMoney(makeup.totalSpend)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {makeup.breakdown.map((b) => (
          <div key={b.attribute} className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ATTR_LABELS[b.attribute] ?? b.attribute}
            </p>
            <div className="space-y-1">
              {b.values.map((v) => (
                <div key={v.value} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate text-foreground" title={v.value}>{v.value}</span>
                    <span className="shrink-0 text-muted-foreground">{Math.round(v.spendShare * 100)}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${v.spendShare * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdPerformancePage() {
  const [report, setReport] = useState<AdPerformanceReport | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ad-performance", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: AdPerformanceReport) => {
        setReport(data);
        setSelectedWeek(data.weeks[0]?.weekStart ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = report?.weeks.find((w) => w.weekStart === selectedWeek) ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ad performance</h1>
        <p className="max-w-2xl text-muted-foreground">
          Your best weeks by spend, the specific ads driving them, and the creative makeup — angle,
          desire, emotion, USP — those winning ads share, per product line.
        </p>
      </header>

      {loading && <SkeletonChart rows={6} />}

      {!loading && report && !report.available && (
        <EmptyState icon={TrendingUp} title={report.reason ?? "Ad performance data isn't available"} />
      )}

      {!loading && report?.available && (
        <>
          {!report.yoyAvailable && report.dateRange && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Only {report.dateRange.spanDays} days of ad data exist so far ({formatWeekLabel(report.dateRange.minDate)}
              {" – "}
              {formatWeekLabel(report.dateRange.maxDate)}) — less than a year, so the &quot;beat last year&quot;
              criterion can&apos;t be computed yet. It&apos;ll switch on automatically once a year of history
              has accumulated.
            </div>
          )}

          {report.weeks.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No weeks with spend yet" />
          ) : (
            <>
              <WeeklySpendChart weeks={report.weeks} selected={selectedWeek} onSelect={setSelectedWeek} />
              <WeeksTable
                weeks={report.weeks}
                selected={selectedWeek}
                onSelect={setSelectedWeek}
                yoyAvailable={report.yoyAvailable}
              />

              {selected && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Top ads — week of {formatWeekLabel(selected.weekStart)}
                    </h2>
                    <TopAdsList week={selected} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Creative makeup by product line
                    </h2>
                    {selected.creativeMakeup.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No tagged ads to build a breakdown from.</p>
                    ) : (
                      <div className="space-y-3">
                        {selected.creativeMakeup.map((m) => (
                          <CreativeMakeupCard key={m.productLineId} makeup={m} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
