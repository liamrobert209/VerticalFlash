"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload, Link as LinkIcon, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND_ASSET_KINDS, type BrandAsset, type BrandAssetKind } from "@/lib/brand-assets-schema";

const KIND_LABELS: Record<BrandAssetKind, string> = {
  guideline: "Branding guideline",
  logo: "Logo",
  color_palette: "Color palette",
  website: "Website",
  social_example: "Social media example image",
  ad_example: "Ad example image",
  product_image: "Product image",
  icp_source: "ICP source document",
  competitor_source: "Competitor source document",
};

const FILELESS_KINDS = new Set<BrandAssetKind>(["website", "color_palette"]);

interface ProductLineOption {
  id: string;
  label: string;
}

export function BrandAssetsBoard() {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [productLines, setProductLines] = useState<ProductLineOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [kind, setKind] = useState<BrandAssetKind>("guideline");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [colorsText, setColorsText] = useState("");
  const [productLineId, setProductLineId] = useState("");
  const [hasFile, setHasFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/brand-assets", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAssets(data.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load brand assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetch("/api/product-line")
      .then((res) => res.json())
      .then((data) => setProductLines(data.options ?? []))
      .catch(() => {});
  }, []);

  const resetForm = () => {
    setDescription("");
    setUrl("");
    setColorsText("");
    setProductLineId("");
    setHasFile(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("kind", kind);
      if (description.trim()) form.append("description", description.trim());
      if (kind === "website") form.append("url", url.trim());
      if (kind === "color_palette") form.append("colors", colorsText.trim());
      if (kind === "product_image") form.append("productLineId", productLineId);
      const file = fileRef.current?.files?.[0];
      if (file) form.append("file", file);

      const res = await fetch("/api/settings/brand-assets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the asset");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this asset?")) return;
    await fetch(`/api/settings/brand-assets/${id}`, { method: "DELETE" });
    await load();
  };

  const needsFile = !FILELESS_KINDS.has(kind);
  const canSubmit =
    !submitting &&
    (kind === "website"
      ? url.trim().length > 0
      : kind === "color_palette"
        ? colorsText.trim().length > 0
        : hasFile) &&
    (kind !== "product_image" || !!productLineId);

  return (
    <section aria-labelledby="brand-assets" className="rounded-lg border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="brand-assets" className="text-lg font-semibold">Brand assets</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Branding guidelines, logo, color palette, reference sites, example creative, product photos, and the
            source ICP/competitor documents themselves.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as BrandAssetKind);
              resetForm();
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {BRAND_ASSET_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description — e.g. &quot;Our business site&quot;, &quot;Competitor X ad style&quot;"
            className="h-9 min-w-64 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>

        {kind === "website" && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        )}

        {kind === "color_palette" && (
          <input
            value={colorsText}
            onChange={(e) => setColorsText(e.target.value)}
            placeholder="#111827, #e8482c, #ffffff (comma-separated hex codes)"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        )}

        {kind === "product_image" && (
          <select
            value={productLineId}
            onChange={(e) => setProductLineId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="" disabled>Which product?</option>
            {productLines.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        )}

        {needsFile && (
          <input
            ref={fileRef}
            type="file"
            disabled={submitting}
            onChange={(e) => setHasFile(!!e.target.files?.length)}
            className="text-sm"
          />
        )}

        <div>
          <Button onClick={submit} disabled={!canSubmit} size="sm">
            {submitting ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && assets.length === 0 && <p className="text-sm text-muted-foreground">No assets added yet.</p>}
        {assets.map((asset) => (
          <div key={asset.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {asset.kind === "website" ? (
                <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : asset.kind === "color_palette" ? (
                <Palette className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {asset.kind === "website" ? asset.url : asset.kind === "color_palette" ? asset.colors?.join(", ") : asset.filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABELS[asset.kind]}
                  {asset.description ? ` · ${asset.description}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {asset.filename && (
                <Button asChild variant="ghost" size="icon-sm">
                  <a href={`/api/settings/brand-assets/${asset.id}`} download aria-label="Download">
                    <Upload className="size-3.5 rotate-180" />
                  </a>
                </Button>
              )}
              <Button onClick={() => remove(asset.id)} variant="ghost" size="icon-sm" className="text-destructive" aria-label="Delete">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
