"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND_ASSET_KINDS, type BrandAsset, type BrandAssetKind } from "@/lib/brand-assets-schema";

const KIND_LABELS: Record<BrandAssetKind, string> = {
  guideline: "Branding guideline",
  logo: "Logo",
  icp_source: "ICP source document",
  competitor_source: "Competitor source document",
};

export function BrandAssetsBoard() {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<BrandAssetKind>("guideline");
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
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const res = await fetch("/api/settings/brand-assets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/settings/brand-assets/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <section aria-labelledby="brand-assets" className="rounded-lg border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="brand-assets" className="text-lg font-semibold">Brand assets</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Branding guidelines, logo, and the source ICP/competitor documents themselves — reference material for your team, not fed into generation.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as BrandAssetKind)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {BRAND_ASSET_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          disabled={uploading}
          className="text-sm"
        />
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && assets.length === 0 && <p className="text-sm text-muted-foreground">No assets uploaded yet.</p>}
        {assets.map((asset) => (
          <div key={asset.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{asset.filename}</p>
                <p className="text-xs text-muted-foreground">{KIND_LABELS[asset.kind]}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button asChild variant="ghost" size="icon-sm">
                <a href={`/api/settings/brand-assets/${asset.id}`} download aria-label="Download">
                  <Upload className="size-3.5 rotate-180" />
                </a>
              </Button>
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
