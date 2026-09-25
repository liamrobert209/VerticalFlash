"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { CompetitorAdRow, type CompetitorAdGroup } from "@/components/weekly-digest/CompetitorAdRow";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface CategoryResponse {
  productLine: { id: string; label: string };
  competitors: CompetitorAdGroup[];
}

export default function AdInsightsCategoryPage({ params }: { params: Promise<{ productLineId: string }> }) {
  const { productLineId } = use(params);
  const [data, setData] = useState<CategoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ad-insights/category/${productLineId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        if (body.error) setError(body.error);
        else setData(body);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [productLineId]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <Link href="/ad-insights" className="text-sm text-muted-foreground hover:text-foreground">
          ← Ad insights
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          {data?.productLine.label ?? "Category"} — competitor ads
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Every active competitor ad (static and video) for this product line, one row per competitor — the same
          shell as{" "}
          <Link href="/weekly-static-ads" className="text-primary underline-offset-4 hover:underline">
            Weekly static ads
          </Link>
          , scoped to this category.
        </p>
      </header>

      {loading && <SkeletonCardGrid />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && data && data.competitors.length === 0 && (
        <EmptyState icon={Megaphone} title="No competitor ads synced for this product line yet" />
      )}

      {!loading &&
        !error &&
        data &&
        data.competitors.length > 0 && (
          <section className="space-y-4 rounded-lg border border-border p-4">
            {data.competitors.map((group) => (
              <CompetitorAdRow key={group.accountId ?? "unknown"} group={group} />
            ))}
          </section>
        )}
    </div>
  );
}
