"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useActiveProduct } from "@/app/context/active-product";

export function ProductImagesBoard() {
  const { options: productLineOptions } = useActiveProduct();
  const [productLineId, setProductLineId] = useState(productLineOptions[0]?.id ?? "");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/product-images?productLineId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      setImages(data.images ?? []);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(productLineId);
  }, [productLineId]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("productLineId", productLineId);
      const res = await fetch("/api/settings/product-images", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load(productLineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (filename: string) => {
    await fetch(`/api/settings/product-images/${encodeURIComponent(productLineId)}/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    await load(productLineId);
  };

  return (
    <section aria-labelledby="product-images" className="rounded-lg border border-border bg-card p-5 sm:p-7">
      <div>
        <h2 id="product-images" className="text-lg font-semibold">Product images</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Real reference photos per product — used automatically when generating AI shots, so the output looks like your actual product instead of a generic guess.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={productLineId}
          onChange={(e) => setProductLineId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {productLineOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          disabled={uploading}
          className="text-sm"
        />
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {loading && <p className="col-span-full text-sm text-muted-foreground">Loading...</p>}
        {!loading && images.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No reference photos for this product yet.</p>
        )}
        {images.map((filename) => (
          <div key={filename} className="group relative aspect-square overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/settings/product-images/${encodeURIComponent(productLineId)}/${encodeURIComponent(filename)}`}
              alt={filename}
              className="size-full object-cover"
            />
            <button
              onClick={() => remove(filename)}
              aria-label={`Delete ${filename}`}
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
