"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Ad } from "@/lib/ads-schema";
import { ANGLE_SOURCE_LABELS, type AngleOption, type AngleSourceList } from "@/lib/icp-angles";

const CUSTOM_CATEGORY = "custom" as const;
const CUSTOM_DETAIL = "__custom__";

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

// Two-step category → detailed-angle picker, drawn from the product
// line's ICP (the same closed vocabulary create-ad-hoc already uses via
// angleOptionsForIcp/the /angles endpoint) instead of the old AD_INTENTS
// dropdown, which had nothing to do with our actual ICP pain points.
function AnglePicker({
  productLineId,
  category,
  label,
  onChange,
}: {
  productLineId: string;
  category: AngleSourceList | null;
  label: string;
  onChange: (category: AngleSourceList | null, label: string) => void;
}) {
  const [options, setOptions] = useState<AngleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailChoice, setDetailChoice] = useState<string>(label ? label : CUSTOM_DETAIL);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/product-line/${encodeURIComponent(productLineId)}/angles`)
      .then((res) => res.json())
      .then((data) => setOptions(data.options ?? []))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [productLineId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading angle options…</p>;

  const categories = Array.from(new Set(options.map((o) => o.source)));
  const categoryValue: string = category ?? CUSTOM_CATEGORY;
  const detailOptions = category ? options.filter((o) => o.source === category) : [];

  return (
    <div className="space-y-2">
      <select
        value={categoryValue}
        onChange={(e) => {
          const next = e.target.value === CUSTOM_CATEGORY ? null : (e.target.value as AngleSourceList);
          setDetailChoice(CUSTOM_DETAIL);
          onChange(next, "");
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {ANGLE_SOURCE_LABELS[c]}
          </option>
        ))}
        <option value={CUSTOM_CATEGORY}>Custom (not tied to an ICP category)</option>
      </select>

      {category && detailOptions.length > 0 ? (
        <select
          value={detailChoice}
          onChange={(e) => {
            setDetailChoice(e.target.value);
            onChange(category, e.target.value === CUSTOM_DETAIL ? "" : e.target.value);
          }}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value={CUSTOM_DETAIL} disabled>
            Pick a specific angle…
          </option>
          {detailOptions.map((o) => (
            <option key={o.label} value={o.label}>
              {o.label}
            </option>
          ))}
          <option value={CUSTOM_DETAIL}>Other (type my own)</option>
        </select>
      ) : null}

      {(!category || detailOptions.length === 0 || detailChoice === CUSTOM_DETAIL) && (
        <input
          value={label}
          onChange={(e) => onChange(category, e.target.value)}
          placeholder="The specific angle this ad should lead with"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        />
      )}
    </div>
  );
}

interface ProductImageSlot {
  id: number;
  label: string;
  filename: string | null;
}

// Every uploaded product photo for the product line is used automatically
// as generation context — no picker needed. This is inline validation, not
// a wizard step: it renders right under the product-line select (as soon
// as it's actually knowable) and blocks submit via hasProductPhotos, rather
// than sitting as its own numbered step at the end of the form with no
// real input of its own.
function useProductPhotos(productLineId: string) {
  const [slots, setSlots] = useState<ProductImageSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productLineId) {
      setSlots([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/settings/product-images?productLineId=${encodeURIComponent(productLineId)}`)
      .then((res) => res.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [productLineId]);

  return { loading, filled: slots.filter((s) => s.filename) };
}

function ProductPhotoWarning({ productLineId, filled }: { productLineId: string; filled: ProductImageSlot[] }) {
  if (filled.length > 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {filled.length} product photo{filled.length === 1 ? "" : "s"} on file — used automatically as context.
      </p>
    );
  }
  return (
    <p className="text-sm text-destructive">
      No product photos uploaded for this product line yet — add some in{" "}
      <a href={`/settings/product-images?productLineId=${encodeURIComponent(productLineId)}`} className="underline-offset-4 hover:underline">
        Settings → Product images
      </a>{" "}
      before generating.
    </p>
  );
}

function CreateStaticAdForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAdId = searchParams.get("referenceAdId");

  const [productLines, setProductLines] = useState<ProductLineOption[]>([]);
  const [productLineId, setProductLineId] = useState<string>(searchParams.get("productLineId") ?? "");
  const [referenceAd, setReferenceAd] = useState<Ad | null>(null);
  const [angleCategory, setAngleCategory] = useState<AngleSourceList | null>(null);
  const [angleLabel, setAngleLabel] = useState("");
  const [persona, setPersona] = useState("");
  const [ourUsp, setOurUsp] = useState("");
  const [backgroundInstruction, setBackgroundInstruction] = useState(DEFAULT_BACKGROUND_BRIEF);
  const [stage, setStage] = useState<"idle" | "creating" | "writing_copy">("idle");
  const [error, setError] = useState<string | null>(null);
  const { loading: productPhotosLoading, filled: productPhotos } = useProductPhotos(productLineId);

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
        if (ad.analysis?.persona) setPersona(ad.analysis.persona);
      })
      .catch(() => {});
  }, [preselectedAdId]);

  const selectReference = useCallback((ad: Ad) => {
    setReferenceAd(ad);
    if (ad.analysis?.usp) setOurUsp(ad.analysis.usp);
    if (ad.analysis?.persona) setPersona(ad.analysis.persona);
  }, []);

  const canSubmit =
    !!productLineId &&
    !!referenceAd &&
    !!ourUsp.trim() &&
    !!angleLabel.trim() &&
    !productPhotosLoading &&
    productPhotos.length > 0 &&
    stage === "idle";

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
          angleCategory,
          angleLabel: angleLabel.trim(),
          persona: persona.trim(),
          backgroundInstruction: backgroundInstruction.trim() || null,
        }),
      });
      const project = await createRes.json();
      if (!createRes.ok) throw new Error(project.error || "Could not create the project");

      // Best-effort: a copy-generation failure shouldn't block moving on —
      // the wizard's copy step offers its own "Generate copy"/"Regenerate"
      // action, and the overlay step's text stays editable regardless.
      // Photo generation is a separate, explicit step from there (its own
      // real AI cost) rather than firing automatically here.
      setStage("writing_copy");
      await fetch(`/api/static-ads/${project.id}/copy`, { method: "POST" }).catch(() => {});

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
            setAngleCategory(null);
            setAngleLabel("");
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
        {productLineId && !productPhotosLoading && (
          <ProductPhotoWarning productLineId={productLineId} filled={productPhotos} />
        )}
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
                {referenceAd.analysis && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {referenceAd.analysis.productShown}
                    {referenceAd.analysis.summary ? ` — ${referenceAd.analysis.summary}` : ""}
                  </p>
                )}
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
            <p className="text-xs text-muted-foreground">
              What&apos;s the goal of this ad — pick the ICP category it&apos;s targeting, then the specific angle
              within it.
            </p>
            <AnglePicker
              key={productLineId}
              productLineId={productLineId}
              category={angleCategory}
              label={angleLabel}
              onChange={(nextCategory, nextLabel) => {
                setAngleCategory(nextCategory);
                setAngleLabel(nextLabel);
              }}
            />
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
            <label className="text-sm font-semibold text-foreground">5. USP</label>
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
            <p className="text-xs text-muted-foreground">
              This is the strategic input, not the final copy — the actual headline/subhead/CTA gets written from
              your angle and USP once you generate, and you&apos;ll review and edit that on the next screen.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">6. Background</label>
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
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {stage === "creating" && "Creating project…"}
        {stage === "writing_copy" && "Writing headline/subhead/CTA copy…"}
        {stage === "idle" && "Continue to copy review ▸"}
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
