"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveProduct } from "@/app/context/active-product";
import type { IcpProfile, RankedItem } from "@/lib/product-lines";

// Settings → Product Lines: moves ICP editing off hand-edited JSON
// (product-lines.config.json's old `icps` array) into a proper board, the
// same Board-component pattern CompetitorsBoard uses. Product-line
// *structure* (label/shortName/etc) still lives in the config file and
// isn't editable here — only ICP *content*, joined through icpRef.

const SECTIONS: { key: keyof Pick<IcpProfile, "problemsSolved" | "loves" | "hates" | "purchaseDrivers" | "nearMissObjections">; title: string; hint: string }[] = [
  { key: "problemsSolved", title: "Problems solved", hint: "What this ICP is trying to fix by buying." },
  { key: "loves", title: "Loves", hint: "What this ICP likes most once they own the product." },
  { key: "hates", title: "Hates", hint: "Pain points / frustrations with the category generally." },
  { key: "purchaseDrivers", title: "Purchase drivers", hint: "What tips this ICP into actually buying." },
  { key: "nearMissObjections", title: "Near-miss objections", hint: "Reasons this ICP almost didn't buy." },
];

function emptyRankedItem(): RankedItem {
  return { label: "" };
}

function RankedListEditor({
  title,
  hint,
  items,
  onChange,
}: {
  title: string;
  hint: string;
  items: RankedItem[];
  onChange: (items: RankedItem[]) => void;
}) {
  const update = (index: number, patch: Partial<RankedItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </div>

      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              value={item.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="Label"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              value={item.surveyPct ?? ""}
              onChange={(e) => update(index, { surveyPct: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Survey %"
              title="Survey %"
              className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              value={item.reviewsPct ?? ""}
              onChange={(e) => update(index, { reviewsPct: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Reviews %"
              title="Reviews %"
              className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <Button onClick={() => move(index, -1)} disabled={index === 0} variant="ghost" size="icon-sm" aria-label="Move up">
              <ArrowUp className="size-3.5" />
            </Button>
            <Button onClick={() => move(index, 1)} disabled={index === items.length - 1} variant="ghost" size="icon-sm" aria-label="Move down">
              <ArrowDown className="size-3.5" />
            </Button>
            <Button onClick={() => remove(index)} variant="ghost" size="icon-sm" aria-label="Remove" className="text-destructive">
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">No entries yet.</p>
        )}
      </div>

      <Button onClick={() => onChange([...items, emptyRankedItem()])} variant="outline" size="sm">
        <Plus className="size-3.5" aria-hidden="true" />
        Add row
      </Button>
    </div>
  );
}

export function ProductLinesBoard() {
  const { options: productLineOptions } = useActiveProduct();
  const [selectedId, setSelectedId] = useState<string>(productLineOptions[0]?.id ?? "");
  const [icp, setIcp] = useState<IcpProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selectedProduct = useMemo(
    () => productLineOptions.find((p) => p.id === selectedId) ?? null,
    [productLineOptions, selectedId]
  );

  const sharedWith = useMemo(() => {
    if (!selectedProduct) return [];
    return productLineOptions.filter((p) => p.id !== selectedProduct.id && p.icpRef === selectedProduct.icpRef);
  }, [productLineOptions, selectedProduct]);

  const load = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/product-lines/${id}/icp`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load ICP");
      setIcp(data.icp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load ICP");
      setIcp(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(selectedId);
  }, [selectedId]);

  const save = async () => {
    if (!icp || !selectedId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Omit<IcpProfile, "id"> = {
        label: icp.label,
        problemsSolved: icp.problemsSolved,
        loves: icp.loves,
        hates: icp.hates,
        purchaseDrivers: icp.purchaseDrivers,
        nearMissObjections: icp.nearMissObjections,
        demographic: icp.demographic,
        representativeQuote: icp.representativeQuote,
      };
      const res = await fetch(`/api/product-lines/${selectedId}/icp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save ICP");
      setIcp(data.icp);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save ICP");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="product-lines" className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="size-4" aria-hidden="true" />
            Ideal customer profiles
          </div>
          <h2 id="product-lines" className="text-lg font-semibold">Product lines</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Edit each product line&apos;s ICP content — problems solved, loves, hates, purchase drivers, near-miss
            objections, demographic, and representative quote. Product-line structure itself (name, description) is
            still set in the config file.
          </p>
        </div>
        <Button onClick={() => load(selectedId)} disabled={loading} variant="outline" size="sm">
          <RotateCcw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-0 sm:grid-cols-[16rem_1fr]">
        <div className="border-b border-border sm:border-b-0 sm:border-r">
          {productLineOptions.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`block w-full border-b border-border px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/40 ${
                p.id === selectedId ? "bg-muted/60 font-medium" : ""
              }`}
            >
              {p.label}
            </button>
          ))}
          {productLineOptions.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">No product lines configured.</p>
          )}
        </div>

        <div className="space-y-4 p-5">
          {sharedWith.length > 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Also used by: {sharedWith.map((p) => p.label).join(", ")} — saving edits the same underlying profile
              for all of them.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

          {!loading && icp && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Demographic</span>
                  <textarea
                    value={icp.demographic}
                    onChange={(e) => setIcp({ ...icp, demographic: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Representative quote</span>
                  <textarea
                    value={icp.representativeQuote}
                    onChange={(e) => setIcp({ ...icp, representativeQuote: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
              </div>

              {SECTIONS.map((section) => (
                <RankedListEditor
                  key={section.key}
                  title={section.title}
                  hint={section.hint}
                  items={icp[section.key]}
                  onChange={(items) => setIcp({ ...icp, [section.key]: items })}
                />
              ))}

              <div className="flex items-center gap-3">
                <Button onClick={save} disabled={saving} size="sm">
                  <Save className="size-4" aria-hidden="true" />
                  {saving ? "Saving..." : "Save"}
                </Button>
                {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
