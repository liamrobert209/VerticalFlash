"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload, Link as LinkIcon, Palette, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/ui/Skeleton";
import {
  BRAND_ASSET_KINDS,
  AD_STYLE_TEMPLATES,
  AD_STYLE_TEMPLATE_LABELS,
  type BrandAsset,
  type BrandAssetKind,
  type AdStyleTemplate,
} from "@/lib/brand-assets-schema";

const KIND_LABELS: Record<BrandAssetKind, string> = {
  guideline: "Branding guideline",
  logo: "Logo",
  illustration: "Illustration",
  typography: "Typography",
  color_palette_primary: "Primary color palette",
  color_palette_secondary: "Secondary color palette",
  website: "Website",
  social_example: "Social media example image",
  ad_example: "Ad example image",
  product_image: "Product image",
  icp_source: "ICP source document",
  competitor_source: "Competitor source document",
};

const KIND_HINTS: Record<BrandAssetKind, string> = {
  guideline: "Style guide, tone-of-voice doc, or any other branding reference file.",
  logo: "The brand mark, in whatever formats you have on hand.",
  illustration: "A brand illustration or an example of one in use. Real source files may live in an external asset library — these can be reference crops.",
  typography: "A typeface used in brand communications — name/weight/license go in the description, tagged by use case, with an optional specimen image.",
  color_palette_primary: "Hex codes for the primary palette — read by the static-ad overlay compositor for on-brand text.",
  color_palette_secondary: "Hex codes for the secondary/accent palette.",
  website: "Our business site, a competitor's site, an uploaded mockup image, or any combination.",
  social_example: "A reference screenshot of a social post worth emulating.",
  ad_example: "A reference screenshot of an ad worth emulating.",
  product_image: "A reference photo of the product, tied to a specific product line.",
  icp_source: "The source survey/research document an ICP profile was built from.",
  competitor_source: "The source document a competitor's seed data was built from.",
};

// Kinds whose file is never required — some (website, typography) can
// still take one optionally, handled via NO_FILE_KINDS below.
const FILELESS_KINDS = new Set<BrandAssetKind>([
  "website",
  "color_palette_primary",
  "color_palette_secondary",
  "typography",
]);
// Kinds that never show a file input at all — pure data, no image.
const NO_FILE_KINDS = new Set<BrandAssetKind>(["color_palette_primary", "color_palette_secondary"]);
const COLOR_PALETTE_KINDS = new Set<BrandAssetKind>(["color_palette_primary", "color_palette_secondary"]);

interface ProductLineOption {
  id: string;
  label: string;
}

export function BrandAssetsBoard() {
  const confirm = useConfirm();
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [productLines, setProductLines] = useState<ProductLineOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const [selectedKind, setSelectedKind] = useState<BrandAssetKind>(BRAND_ASSET_KINDS[0]);
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [colorsText, setColorsText] = useState("");
  const [productLineId, setProductLineId] = useState("");
  const [useCase, setUseCase] = useState("");
  const [styleTemplate, setStyleTemplate] = useState<AdStyleTemplate | "">("");
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
    setUseCase("");
    setStyleTemplate("");
    setHasFile(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const selectKind = (kind: BrandAssetKind) => {
    setSelectedKind(kind);
    setError(null);
    resetForm();
  };

  const uploadOne = async (file: File | undefined) => {
    const form = new FormData();
    form.append("kind", selectedKind);
    if (description.trim()) form.append("description", description.trim());
    if (selectedKind === "website" && url.trim()) form.append("url", url.trim());
    if (COLOR_PALETTE_KINDS.has(selectedKind)) form.append("colors", colorsText.trim());
    if (selectedKind === "product_image") form.append("productLineId", productLineId);
    if (selectedKind === "typography" && useCase.trim()) form.append("useCase", useCase.trim());
    if (selectedKind === "ad_example" && styleTemplate) form.append("styleTemplate", styleTemplate);
    if (file) form.append("file", file);

    const res = await fetch("/api/settings/brand-assets", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const files = fileRef.current?.files;
      if (files && files.length > 1) {
        let succeeded = 0;
        const failures: string[] = [];
        for (let i = 0; i < files.length; i++) {
          setProgressLabel(`Adding ${i + 1} of ${files.length}…`);
          try {
            await uploadOne(files[i]);
            succeeded++;
          } catch (err) {
            failures.push(err instanceof Error ? err.message : "Could not save the asset");
          }
        }
        if (failures.length > 0) {
          setError(`${succeeded} of ${files.length} added — ${failures.length} failed: ${failures.join("; ")}`);
        }
      } else {
        await uploadOne(files?.[0]);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the asset");
    } finally {
      setProgressLabel(null);
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this asset?", { destructive: true }))) return;
    await fetch(`/api/settings/brand-assets/${id}`, { method: "DELETE" });
    await load();
  };

  const productLineLabel = (id: string | null) =>
    (id && productLines.find((p) => p.id === id)?.label) || id || "Unknown product";

  const showFileInput = !NO_FILE_KINDS.has(selectedKind);
  const fileRequired = showFileInput && !FILELESS_KINDS.has(selectedKind);
  const canSubmit =
    !submitting &&
    (selectedKind === "website"
      ? url.trim().length > 0 || hasFile
      : COLOR_PALETTE_KINDS.has(selectedKind)
        ? colorsText.trim().length > 0
        : fileRequired
          ? hasFile
          : true) &&
    (selectedKind !== "product_image" || !!productLineId);

  return (
    <section aria-labelledby="brand-assets" className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="size-4" aria-hidden="true" />
            Brand assets
          </div>
          <h2 id="brand-assets" className="text-lg font-semibold">Brand assets</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Branding guidelines, logo, color palette, reference sites, example creative, product photos, and the
            source ICP/competitor documents themselves.
          </p>
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-[16rem_1fr]">
        <div className="border-b border-border sm:border-b-0 sm:border-r">
          {BRAND_ASSET_KINDS.map((k) => {
            const count = assets.filter((a) => a.kind === k).length;
            return (
              <button
                key={k}
                onClick={() => selectKind(k)}
                className={`flex w-full items-center justify-between border-b border-border px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/40 ${
                  k === selectedKind ? "bg-muted/60 font-medium" : ""
                }`}
              >
                <span>{KIND_LABELS[k]}</span>
                <span className="text-xs text-muted-foreground">{count > 0 ? count : ""}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4 p-5">
          <p className="text-xs text-muted-foreground">{KIND_HINTS[selectedKind]}</p>

          <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description — e.g. &quot;Our business site&quot;, &quot;Competitor X ad style&quot;"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />

            {selectedKind === "website" && (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://... (optional if you're uploading an image instead)"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            )}

            {COLOR_PALETTE_KINDS.has(selectedKind) && (
              <input
                value={colorsText}
                onChange={(e) => setColorsText(e.target.value)}
                placeholder="#111827, #e8482c, #ffffff (comma-separated hex codes)"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            )}

            {selectedKind === "product_image" && (
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

            {selectedKind === "typography" && (
              <input
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="Use case — e.g. &quot;Headlines&quot;, &quot;Body copy&quot;"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            )}

            {selectedKind === "ad_example" && (
              <select
                value={styleTemplate}
                onChange={(e) => setStyleTemplate(e.target.value as AdStyleTemplate | "")}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Which ad style is this? (optional)</option>
                {AD_STYLE_TEMPLATES.map((t) => (
                  <option key={t} value={t}>{AD_STYLE_TEMPLATE_LABELS[t]}</option>
                ))}
              </select>
            )}

            {showFileInput && (
              <input
                ref={fileRef}
                type="file"
                multiple
                disabled={submitting}
                onChange={(e) => setHasFile(!!e.target.files?.length)}
                className="text-sm"
              />
            )}

            <div>
              <Button onClick={submit} disabled={!canSubmit} size="sm">
                {submitting ? progressLabel ?? "Adding…" : "Add"}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading && <SkeletonRows count={3} />}

          {!loading && (
            <div className="space-y-6">
              {BRAND_ASSET_KINDS.map((kind) => {
                const kindAssets = assets.filter((a) => a.kind === kind);
                if (kindAssets.length === 0) return null;
                return (
                  <div key={kind} className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      {KIND_LABELS[kind]} <span className="font-normal text-muted-foreground">({kindAssets.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {kindAssets.map((asset) => (
                        <div key={asset.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {asset.kind === "website" && !asset.filename ? (
                              <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
                            ) : COLOR_PALETTE_KINDS.has(asset.kind) ? (
                              <Palette className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <FileText className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {COLOR_PALETTE_KINDS.has(asset.kind)
                                  ? asset.colors?.join(", ")
                                  : asset.filename ?? asset.url ?? "Untitled"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {asset.kind === "product_image" ? productLineLabel(asset.productLineId) : null}
                                {asset.kind === "product_image" && asset.description ? " · " : ""}
                                {asset.kind === "typography" && asset.useCase ? asset.useCase : null}
                                {asset.kind === "typography" && asset.useCase && asset.description ? " · " : ""}
                                {asset.kind === "ad_example" && asset.styleTemplate
                                  ? AD_STYLE_TEMPLATE_LABELS[asset.styleTemplate]
                                  : null}
                                {asset.kind === "ad_example" && asset.styleTemplate && asset.description ? " · " : ""}
                                {asset.kind === "website" && asset.filename && asset.url ? `${asset.url} · ` : ""}
                                {asset.description ?? ""}
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
                  </div>
                );
              })}
              {assets.length === 0 && (
                <p className="text-sm text-muted-foreground">No brand assets added yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
