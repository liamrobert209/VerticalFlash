"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Ad } from "@/lib/ads-schema";
import { AD_INTENTS, AD_INTENT_LABELS, type AdIntent } from "@/lib/ad-analysis-schema";
import { GEMINI_IMAGE_PRICE_PER_IMAGE } from "@/lib/gemini-pricing";

const VERSIONS_PER_BATCH = 5;
const DEFAULT_BACKGROUND_BRIEF = "Match the reference ad's setting, lighting, and composition.";

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
            <img src={`/api/ads/${ad.id}/creative`} alt={ad.headline ?? "Reference ad"} className="w-full aspect-square object-cover bg-muted" />
          ) : (
            <div className="w-full aspect-square bg-muted" />
          )}
          <p className="p-2 text-xs text-foreground line-clamp-2">{ad.headline || ad.bodyText || "(no headline)"}</p>
        </button>
      ))}
    </div>
  );
}

interface ProductImageSlot {
  id: number;
  label: string;
  filename: string | null;
}

// No picker here anymore — every uploaded product photo for the product
// line is used automatically as generation context. This just confirms at
// least one exists and surfaces a warning + link if not, since generation
// would otherwise fail with nothing to show as "our product".
function ProductPhotoAvailability({ productLineId }: { productLineId: string }) {
  const [slots, setSlots] = useState<ProductImageSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/settings/product-images?productLineId=${encodeURIComponent(productLineId)}`)
      .then((res) => res.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [productLineId]);

  if (loading) return <p className="text-sm text-muted-foreground">Checking product photos…</p>;
  const filled = slots.filter((s) => s.filename);

  if (filled.length === 0) {
    return (
      <p className="text-sm text-destructive">
        No product photos uploaded for this product line yet — add some in{" "}
        <a href="/settings/product-images" className="underline-offset-4 hover:underline">
          Settings → Product images
        </a>{" "}
        before generating.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {filled.map((slot) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slot.id}
          src={`/api/settings/product-images/${encodeURIComponent(productLineId)}/${slot.id}`}
          alt={slot.label}
          title={slot.label}
          className="size-14 rounded-md border border-border object-cover bg-muted"
        />
      ))}
      <p className="w-full text-xs text-muted-foreground">
        All {filled.length} photo{filled.length === 1 ? "" : "s"} above will be used as context — no need to pick one.
      </p>
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
  const [angle, setAngle] = useState<AdIntent>("other");
  const [persona, setPersona] = useState("");
  const [headline, setHeadline] = useState("");
  const [ourUsp, setOurUsp] = useState("");
  const [backgroundInstruction, setBackgroundInstruction] = useState(DEFAULT_BACKGROUND_BRIEF);
  const [productPhotosKey, setProductPhotosKey] = useState(0);
  const [stage, setStage] = useState<"idle" | "creating" | "generating">("idle");
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

  // Pre-fill from a "Create static ad from this" link off a digest page.
  useEffect(() => {
    if (!preselectedAdId) return;
    fetch(`/api/ads/${preselectedAdId}`)
      .then((res) => res.json())
      .then((ad: Ad) => {
        if (!ad?.id) return;
        setReferenceAd(ad);
        if (ad.productLineId) setProductLineId(ad.productLineId);
        if (ad.analysis?.usp) setOurUsp(ad.analysis.usp);
        if (ad.analysis?.intent) setAngle(ad.analysis.intent);
        if (ad.analysis?.persona) setPersona(ad.analysis.persona);
        if (ad.headline) setHeadline(ad.headline);
      })
      .catch(() => {});
  }, [preselectedAdId]);

  const selectReference = useCallback((ad: Ad) => {
    setReferenceAd(ad);
    if (ad.analysis?.usp) setOurUsp(ad.analysis.usp);
    if (ad.analysis?.intent) setAngle(ad.analysis.intent);
    if (ad.analysis?.persona) setPersona(ad.analysis.persona);
    if (ad.headline) setHeadline(ad.headline);
  }, []);

  const canSubmit = !!productLineId && !!referenceAd && !!ourUsp.trim() && stage === "idle";
  const costHint =
    GEMINI_IMAGE_PRICE_PER_IMAGE != null
      ? `~$${(GEMINI_IMAGE_PRICE_PER_IMAGE * VERSIONS_PER_BATCH).toFixed(2)} for ${VERSIONS_PER_BATCH}`
      : null;

  const submit = async () => {
    if (!canSubmit || !referenceAd) return;
    setError(null);
    setStage("creating");
    try {
      const createRes = await fetch("/api/static-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceAdId: referenceAd.id,
          productLineId,
          ourUsp: ourUsp.trim(),
          angle,
          persona: persona.trim(),
          headline: headline.trim(),
          backgroundInstruction: backgroundInstruction.trim() || null,
        }),
      });
      const project = await createRes.json();
      if (!createRes.ok) throw new Error(project.error || "Could not create the project");

      setStage("generating");
      const generateRes = await fetch(`/api/static-ads/${project.id}/generate`, { method: "POST" });
      const generated = await generateRes.json();
      if (!generateRes.ok) throw new Error(generated.error || "Could not generate versions");

      router.push(`/static-ads/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("idle");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create a static ad</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pick a competitor&apos;s static ad as a visual reference, review and edit the angle/persona/copy it&apos;s
          built around, and generate {VERSIONS_PER_BATCH} new versions using our own product photos.
        </p>
      </header>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">1. Product line</label>
        <select
          value={productLineId}
          onChange={(e) => {
            setProductLineId(e.target.value);
            setReferenceAd(null);
            setProductPhotosKey((k) => k + 1);
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
                <img src={`/api/ads/${referenceAd.id}/creative`} alt="" className="size-16 rounded object-cover bg-muted" />
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
            <label className="text-sm font-semibold text-foreground">3. Angle</label>
            <select
              value={angle}
              onChange={(e) => setAngle(e.target.value as AdIntent)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {AD_INTENTS.map((intent) => (
                <option key={intent} value={intent}>
                  {AD_INTENT_LABELS[intent]}
                </option>
              ))}
            </select>
            {referenceAd.analysis && (
              <p className="text-xs text-muted-foreground">Pre-filled from the reference ad — change it freely.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">4. Persona</label>
            <input
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Who is this ad speaking to?"
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">5. Headline</label>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="A short headline for the overlay"
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">6. Copy / USP</label>
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
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">7. Background</label>
              <button
                onClick={() => setBackgroundInstruction("")}
                disabled={!backgroundInstruction}
                className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-40"
              >
                Clear suggestion
              </button>
            </div>
            <textarea
              value={backgroundInstruction}
              onChange={(e) => setBackgroundInstruction(e.target.value)}
              rows={2}
              placeholder="Describe the setting/backdrop, or clear it to let generation decide"
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">8. Product photos</label>
            <ProductPhotoAvailability key={productPhotosKey} productLineId={productLineId} />
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {stage === "creating" && "Creating project…"}
        {stage === "generating" && `Generating ${VERSIONS_PER_BATCH} versions… this can take a minute`}
        {stage === "idle" && (
          <>
            Generate {VERSIONS_PER_BATCH} versions ▸{costHint && <span className="ml-1 text-xs opacity-80">({costHint})</span>}
          </>
        )}
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
