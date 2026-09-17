"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Ad } from "@/lib/ads-schema";

interface ProductLineOption {
  id: string;
  label: string;
}

function ReferencePicker({
  productLineId,
  selected,
  onSelect,
}: {
  productLineId: string;
  selected: Ad | null;
  onSelect: (ad: Ad) => void;
}) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ads?productLineId=${encodeURIComponent(productLineId)}&isStaticEligible=true&limit=30`)
      .then((res) => res.json())
      .then((data) => setAds(data.ads ?? []))
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  }, [productLineId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading eligible ads…</p>;
  if (ads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No static-eligible competitor ads for this product line yet — sync some from Weekly ads first.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {ads.map((ad) => (
        <button
          key={ad.id}
          onClick={() => onSelect(ad)}
          className={`text-left rounded-lg border overflow-hidden transition-colors ${
            selected?.id === ad.id ? "border-primary" : "border-border hover:border-primary/60"
          }`}
        >
          {ad.creativeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.creativeUrl} alt={ad.headline ?? "Reference ad"} className="w-full aspect-square object-cover bg-muted" />
          ) : (
            <div className="w-full aspect-square bg-muted" />
          )}
          <p className="p-2 text-xs text-foreground line-clamp-2">{ad.headline || ad.bodyText || "(no headline)"}</p>
        </button>
      ))}
    </div>
  );
}

function ProductImagePicker({
  productLineId,
  selected,
  onSelect,
}: {
  productLineId: string;
  selected: string | null;
  onSelect: (filename: string) => void;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/settings/product-images?productLineId=${encodeURIComponent(productLineId)}`)
      .then((res) => res.json())
      .then((data) => setImages(data.images ?? []))
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, [productLineId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading product photos…</p>;
  if (images.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No product photos uploaded for this product line yet — add some in Settings → Product images.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {images.map((filename) => (
        <button
          key={filename}
          onClick={() => onSelect(filename)}
          className={`rounded-lg border overflow-hidden transition-colors ${
            selected === filename ? "border-primary" : "border-border hover:border-primary/60"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/settings/product-images/${encodeURIComponent(productLineId)}/${encodeURIComponent(filename)}`}
            alt={filename}
            className="w-full aspect-square object-cover bg-muted"
          />
        </button>
      ))}
    </div>
  );
}

function CreateStaticAdForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAdId = searchParams.get("referenceAdId");

  const [productLines, setProductLines] = useState<ProductLineOption[]>([]);
  const [productLineId, setProductLineId] = useState<string>(searchParams.get("productLineId") ?? "");
  const [referenceAd, setReferenceAd] = useState<Ad | null>(null);
  const [ourUsp, setOurUsp] = useState("");
  const [ourProductImage, setOurProductImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/product-line")
      .then((res) => res.json())
      .then((data) => {
        setProductLines(data.options ?? []);
        if (!productLineId && data.active) setProductLineId(data.active);
      })
      .catch(() => {});
    // Only on mount — productLineId is intentionally excluded so a later
    // manual change doesn't get clobbered by this same effect re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill from a "Create static ad from this" link off the digest page.
  useEffect(() => {
    if (!preselectedAdId) return;
    fetch(`/api/ads/${preselectedAdId}`)
      .then((res) => res.json())
      .then((ad: Ad) => {
        if (!ad?.id) return;
        setReferenceAd(ad);
        if (ad.productLineId) setProductLineId(ad.productLineId);
        if (ad.analysis?.usp) setOurUsp(ad.analysis.usp);
      })
      .catch(() => {});
  }, [preselectedAdId]);

  const selectReference = useCallback((ad: Ad) => {
    setReferenceAd(ad);
    if (ad.analysis?.usp) setOurUsp(ad.analysis.usp);
  }, []);

  const canSubmit = !!productLineId && !!referenceAd && !!ourUsp.trim() && !!ourProductImage;

  const submit = async () => {
    if (!canSubmit || !referenceAd || !ourProductImage) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/static-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceAdId: referenceAd.id,
          productLineId,
          ourUsp: ourUsp.trim(),
          ourProductImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the project");
      router.push(`/static-ads/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create a static ad</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pick a competitor&apos;s static ad as a visual reference, swap in your own product and USP, and generate a
          new creative.
        </p>
      </header>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">1. Product line</label>
        <select
          value={productLineId}
          onChange={(e) => {
            setProductLineId(e.target.value);
            setReferenceAd(null);
            setOurProductImage(null);
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="" disabled>
            Select a product line…
          </option>
          {productLines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {productLineId && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">2. Reference ad</label>
          {referenceAd ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary p-3">
              {referenceAd.creativeUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={referenceAd.creativeUrl} alt="" className="size-16 rounded object-cover bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground line-clamp-1">
                  {referenceAd.headline || referenceAd.bodyText || "(no headline)"}
                </p>
                <button
                  onClick={() => setReferenceAd(null)}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Choose a different ad
                </button>
              </div>
            </div>
          ) : (
            <ReferencePicker productLineId={productLineId} selected={referenceAd} onSelect={selectReference} />
          )}
        </div>
      )}

      {referenceAd && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">3. Our USP</label>
            <textarea
              value={ourUsp}
              onChange={(e) => setOurUsp(e.target.value)}
              rows={2}
              placeholder="What are we leading with?"
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            />
            {referenceAd.analysis && (
              <p className="text-xs text-muted-foreground">
                Pre-filled from the reference ad&apos;s USP — edit freely to say what our product actually offers.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">4. Our product photo</label>
            <ProductImagePicker productLineId={productLineId} selected={ourProductImage} onSelect={setOurProductImage} />
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit || submitting}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create project"}
      </button>
    </div>
  );
}

export default function CreateStaticAdPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted-foreground">Loading…</div>}>
      <CreateStaticAdForm />
    </Suspense>
  );
}
