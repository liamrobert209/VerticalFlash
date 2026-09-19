"use client";

import { useState } from "react";
import { GEMINI_IMAGE_PRICE_PER_IMAGE } from "@/lib/gemini-pricing";

// Mirrors StaticAdAttemptZ/StaticAdBaseImageZ in src/lib/static-ad-schema.ts
// (kept local, matching GenerationPanel.tsx's convention for this kind of
// component, so the client bundle never depends on the schema module).
export interface StaticAdAttempt {
  attempt: number;
  kind: "generate" | "refine";
  prompt: string;
  parentAttempt: number | null;
  file: string | null;
  status: "ready" | "failed";
  error: string | null;
  // Automated product-placement compositing check (shadow/color/edges/
  // scale) — absent for "refine" attempts and any "generate" attempt made
  // before this existed.
  qa?: { passed: boolean; issues: string[] };
  // Same shape, for a swapped-in person — only present when an actor swap
  // was actually attempted (reference ad had a person AND actor photos
  // exist for the product line).
  personQa?: { passed: boolean; issues: string[] };
  model: string;
  createdAt: string;
}

export interface StaticAdBaseImage {
  status: "idle" | "generating" | "ready" | "failed";
  startedAt: string | null;
  acceptedAttempt: number | null;
  attempts: StaticAdAttempt[];
}

// Accepting a different photo than whatever finalImage was last composited
// against invalidates that final image server-side (see the accept
// route) — finalImage/status are only ever present (and only ever
// meaningful) on that response, so the parent knows to clear its own
// stale copies of them too instead of silently keeping a final image that
// no longer matches the accepted photo.
export interface BaseImagePanelProps {
  projectId: string;
  baseImage: StaticAdBaseImage;
  onUpdated: (update: { baseImage: StaticAdBaseImage; finalImage?: string | null; status?: string }) => void;
}

const VERSIONS_PER_BATCH = 5;

function costLine(): string | null {
  if (GEMINI_IMAGE_PRICE_PER_IMAGE == null) return null;
  return `~$${GEMINI_IMAGE_PRICE_PER_IMAGE.toFixed(3)}`;
}

// Each attempt now includes an automatic placement-QA check and, if it
// flags something, one fix-up image edit — so actual cost can run up to
// ~2x the base image count, not a fixed multiple. "up to" makes that
// honest without pretending to compute the exact figure.
function batchCostLine(): string | null {
  if (GEMINI_IMAGE_PRICE_PER_IMAGE == null) return null;
  return `~$${(GEMINI_IMAGE_PRICE_PER_IMAGE * VERSIONS_PER_BATCH).toFixed(2)}-$${(
    GEMINI_IMAGE_PRICE_PER_IMAGE *
    VERSIONS_PER_BATCH *
    2
  ).toFixed(2)} for ${VERSIONS_PER_BATCH}`;
}

export function BaseImagePanel({ projectId, baseImage, onUpdated }: BaseImagePanelProps) {
  const [refineText, setRefineText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingAttempt, setDeletingAttempt] = useState<number | null>(null);

  const generating = baseImage.status === "generating" || busy;
  const hasAttempts = baseImage.attempts.length > 0;
  const price = costLine();
  const batchPrice = batchCostLine();

  const runGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      onUpdated({ baseImage: data.baseImage, finalImage: data.finalImage, status: data.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteAttempt = async (attempt: number) => {
    setDeletingAttempt(attempt);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}/attempts/${attempt}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onUpdated({ baseImage: data.baseImage, finalImage: data.finalImage, status: data.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingAttempt(null);
    }
  };

  const runRefine = async () => {
    if (!refineText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: refineText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refine failed");
      onUpdated({ baseImage: data.baseImage, finalImage: data.finalImage, status: data.status });
      setRefineText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine failed");
    } finally {
      setBusy(false);
    }
  };

  const accept = async (attempt: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/static-ads/${projectId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Accept failed");
      onUpdated({ baseImage: data.baseImage, finalImage: data.finalImage, status: data.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!hasAttempts && (
        <button
          onClick={runGenerate}
          disabled={generating}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {generating ? "Generating 5 versions…" : "Generate 5 versions"}
          {batchPrice && !generating && <span className="ml-1 text-xs opacity-80">({batchPrice})</span>}
        </button>
      )}

      {hasAttempts && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...baseImage.attempts].reverse().map((attempt) => (
            <div
              key={attempt.attempt}
              className={`rounded-lg border overflow-hidden ${
                baseImage.acceptedAttempt === attempt.attempt ? "border-primary" : "border-border"
              }`}
            >
              {attempt.status === "ready" && attempt.file ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/static-ads/${projectId}/image/${attempt.file}`}
                  alt={`Attempt ${attempt.attempt}`}
                  className="w-full aspect-square object-cover bg-muted"
                />
              ) : (
                <div className="w-full aspect-square bg-muted flex items-center justify-center text-xs text-destructive p-2 text-center">
                  {attempt.error || "Failed"}
                </div>
              )}
              {attempt.qa && (
                <div
                  className={`px-2 py-1 text-[11px] ${
                    attempt.qa.passed ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500"
                  }`}
                  title={attempt.qa.issues.join("; ") || undefined}
                >
                  {attempt.qa.passed
                    ? "✓ Product placement QA passed"
                    : `⚠ Product placement flagged: ${attempt.qa.issues.join("; ")}`}
                </div>
              )}
              {attempt.personQa && (
                <div
                  className={`px-2 py-1 text-[11px] ${
                    attempt.personQa.passed ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500"
                  }`}
                  title={attempt.personQa.issues.join("; ") || undefined}
                >
                  {attempt.personQa.passed
                    ? "✓ Person placement QA passed"
                    : `⚠ Person placement flagged: ${attempt.personQa.issues.join("; ")}`}
                </div>
              )}
              <div className="p-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {attempt.kind} #{attempt.attempt}
                </span>
                <div className="flex items-center gap-1.5">
                  {attempt.status === "ready" && (
                    <button
                      onClick={() => accept(attempt.attempt)}
                      disabled={generating}
                      className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                        baseImage.acceptedAttempt === attempt.attempt
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {baseImage.acceptedAttempt === attempt.attempt ? "✓ Accepted" : "Use this"}
                    </button>
                  )}
                  <button
                    onClick={() => deleteAttempt(attempt.attempt)}
                    disabled={generating || deletingAttempt === attempt.attempt}
                    className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {deletingAttempt === attempt.attempt ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasAttempts && (
        <button
          onClick={runGenerate}
          disabled={generating}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate 5 more"}
          {batchPrice && !generating && <span className="ml-1 text-xs opacity-80">({batchPrice})</span>}
        </button>
      )}

      {hasAttempts && (
        <div className="flex gap-2">
          <input
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            placeholder="Refine the accepted version — e.g. “make the lighting warmer”"
            disabled={generating}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
          <button
            onClick={runRefine}
            disabled={generating || !refineText.trim()}
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? "Working…" : "Refine"}
            {price && !generating && <span className="ml-1 text-xs opacity-80">({price})</span>}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
