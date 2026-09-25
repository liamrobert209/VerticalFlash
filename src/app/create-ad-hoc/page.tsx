"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useActiveProduct } from "@/app/context/active-product";
import { PLATFORMS, DEFAULT_PLATFORM_ID } from "@/lib/platforms";
import type { ReferenceOrigin } from "@/lib/content-record-schema";

interface AngleOption {
  label: string;
  source: string;
}

function extractTikTokVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

const OTHER_VALUE = "__other__";

function AngleSelect({
  label,
  options,
  value,
  customValue,
  onChange,
  onCustomChange,
}: {
  label: string;
  options: AngleOption[];
  value: string;
  customValue: string;
  onChange: (value: string) => void;
  onCustomChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Select an angle...</option>
        {options.map((opt, i) => (
          <option key={i} value={opt.label}>{opt.label}</option>
        ))}
        <option value={OTHER_VALUE}>Other (type your own)</option>
      </select>
      {value === OTHER_VALUE && (
        <textarea
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          rows={2}
          placeholder="Describe the angle..."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}

function CreateAdHocInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referenceOrigin: ReferenceOrigin = searchParams.get("origin") === "ad" ? "ad" : "creator";

  const { options: productLineOptions, activeId } = useActiveProduct();
  // Weekly Ads' "Generate Ocushield version" link pre-fills these from the
  // specific ad the user clicked (see WeeklyAdsBoard) — all optional, so
  // navigating here directly (from the sidebar) still starts blank/default.
  const prefillProductLineId = searchParams.get("productLineId");
  const prefillPlatformId = searchParams.get("platformId");
  const prefillUrl = searchParams.get("url");
  const [productLineId, setProductLineId] = useState(
    prefillProductLineId && productLineOptions.some((p) => p.id === prefillProductLineId)
      ? prefillProductLineId
      : activeId
  );
  const [platformId, setPlatformId] = useState(prefillPlatformId || DEFAULT_PLATFORM_ID);

  const [sourceMode, setSourceMode] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState(prefillUrl ?? "");
  const [file, setFile] = useState<File | null>(null);

  const [angleOptions, setAngleOptions] = useState<AngleOption[]>([]);
  const [originalAngle, setOriginalAngle] = useState("");
  const [originalAngleCustom, setOriginalAngleCustom] = useState("");
  const [newAngle, setNewAngle] = useState("");
  const [newAngleCustom, setNewAngleCustom] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/product-line/${productLineId}/angles`)
      .then((res) => res.json())
      .then((data) => setAngleOptions(data.options ?? []))
      .catch(() => setAngleOptions([]));
  }, [productLineId]);

  const doorLabel = referenceOrigin === "ad" ? "ad content" : "creator content";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalOriginalAngle = originalAngle === OTHER_VALUE ? originalAngleCustom.trim() : originalAngle;
    const finalNewAngle = newAngle === OTHER_VALUE ? newAngleCustom.trim() : newAngle;
    const isCustom = originalAngle === OTHER_VALUE || newAngle === OTHER_VALUE;

    if (sourceMode === "url" && !url.trim()) {
      setError("Paste a link to the source video");
      return;
    }
    if (sourceMode === "upload" && !file) {
      setError("Choose a file to upload");
      return;
    }
    if (!finalNewAngle) {
      setError("Pick (or describe) the new angle you want this version to take");
      return;
    }

    setSubmitting(true);
    try {
      let videoId: string;

      if (sourceMode === "url") {
        const tiktokId = extractTikTokVideoId(url);
        if (!tiktokId) {
          throw new Error(
            "Couldn't find a TikTok video ID in that link. Paste a full tiktok.com/@user/video/... URL, or upload the file instead."
          );
        }
        const filename = `${tiktokId}.mp4`;
        const res = await fetch(
          `/api/proxy-video?videoId=${encodeURIComponent(tiktokId)}&filename=${encodeURIComponent(filename)}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Could not download that video");
        }
        videoId = res.headers.get("X-Saved-Filename")?.replace(/\.mp4$/, "") || tiktokId;
      } else {
        const form = new FormData();
        form.append("file", file!);
        const res = await fetch("/api/create-ad-hoc/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        videoId = data.videoId;
      }

      const briefRes = await fetch("/api/create-ad-hoc/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          productLineId,
          originalAngle: finalOriginalAngle || null,
          newAngle: finalNewAngle,
          angleSource: isCustom ? "custom" : "icp",
          isCustom,
          referenceOrigin,
          platformId,
        }),
      });
      const briefData = await briefRes.json();
      if (!briefRes.ok) throw new Error(briefData.error || "Could not save your brief");

      window.dispatchEvent(new Event("downloads-changed"));
      router.push(`/downloads/${encodeURIComponent(briefData.filename)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Iterate on {doorLabel}</h1>
          <p className="mt-2 text-muted-foreground">
            Reference someone else&apos;s {doorLabel === "ad content" ? "ad" : "post"}, swap in your product and a new angle, and let the usual editor take it from there.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Reference {doorLabel}</label>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setSourceMode("url")}
                className={`px-2.5 py-1 rounded-md border ${sourceMode === "url" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                Paste a link
              </button>
              <button type="button" onClick={() => setSourceMode("upload")}
                className={`px-2.5 py-1 rounded-md border ${sourceMode === "upload" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                Upload a file
              </button>
            </div>
            {sourceMode === "url" ? (
              <>
                <input
                  type="url"
                  placeholder="https://www.tiktok.com/@user/video/7123456789012345678"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  TikTok links only for now — for content from anywhere else, upload the file instead.
                </p>
              </>
            ) : (
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            )}
          </div>

          <AngleSelect
            label="What hook/angle is this original doing? (optional)"
            options={angleOptions}
            value={originalAngle}
            customValue={originalAngleCustom}
            onChange={setOriginalAngle}
            onCustomChange={setOriginalAngleCustom}
          />

          <AngleSelect
            label="New hook/angle for this version"
            options={angleOptions}
            value={newAngle}
            customValue={newAngleCustom}
            onChange={setNewAngle}
            onCustomChange={setNewAngleCustom}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">Product to swap in</label>
            <select
              value={productLineId}
              onChange={(e) => setProductLineId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {productLineOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Platform</label>
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Setting up...
              </span>
            ) : (
              "Continue to editor"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function CreateAdHocPage() {
  return (
    <Suspense>
      <CreateAdHocInner />
    </Suspense>
  );
}
