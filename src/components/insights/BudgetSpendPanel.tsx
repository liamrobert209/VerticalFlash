"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CategorySpend {
  productCategory: string;
  totalSpend: number;
  totalPurchases: number;
  avgCostPerPurchase: number | null;
}

interface Suggestion {
  id: string;
  label: string;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const SUGGESTION_PLATFORMS = ["Facebook", "Instagram", "TikTok"];

export function BudgetSpendPanel() {
  const [categorySpend, setCategorySpend] = useState<CategorySpend[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ad-insights/budget", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setCategorySpend(data.categorySpend ?? []);
        setSuggestions(data.suggestions ?? []);
      })
      .catch(() => setError("Failed to load budget data"));
  }, []);

  if (error) return null;
  if (!categorySpend || !suggestions) return <p className="text-sm text-muted-foreground">Loading budget data...</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Budget &amp; spend by category
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-1.5">Category</th>
                <th className="px-2 py-1.5">Spend</th>
                <th className="px-2 py-1.5">Purchases</th>
                <th className="px-2 py-1.5">Cost / purchase</th>
              </tr>
            </thead>
            <tbody>
              {categorySpend.map((c) => (
                <tr key={c.productCategory} className="border-t border-border">
                  <td className="px-2 py-1.5 font-medium text-foreground">{c.productCategory}</td>
                  <td className="px-2 py-1.5">{formatMoney(c.totalSpend)}</td>
                  <td className="px-2 py-1.5">{c.totalPurchases.toLocaleString()}</td>
                  <td className="px-2 py-1.5">
                    {c.avgCostPerPurchase != null ? formatMoney(c.avgCostPerPurchase) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested actions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestions.map((s) => (
              <Link
                key={s.id}
                href={`/ad-insights/category/${s.id}`}
                className="rounded-lg border border-dashed border-border p-3 transition-colors hover:border-primary/60 hover:bg-muted/40"
              >
                <p className="text-sm font-medium text-foreground">
                  No active ad spend for {s.label} — build ads or content for this category
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {SUGGESTION_PLATFORMS.map((platform) => (
                    <span key={platform} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {platform}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
