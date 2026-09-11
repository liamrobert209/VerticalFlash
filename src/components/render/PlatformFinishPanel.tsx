"use client";

import { useState } from "react";
import { PLATFORMS } from "@/lib/platforms";

interface FinishResponse {
  platform: { id: string; label: string; publishSupported: boolean };
  durationSeconds: number | null;
  caption: string | null;
  downloadUrl: string;
}

// The unified multi-platform "finish" experience: pick a platform, prepare
// its export, get a platform-formatted caption, then either send straight
// to TikTok drafts (the only platform with a real publish integration
// today) or download the file to post manually elsewhere. Every platform
// gets the same panel shape — only the primary action differs.
export function PlatformFinishPanel({ videoId }: { videoId: string }) {
  const [platformId, setPlatformId] = useState("tiktok");
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<FinishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const prepare = async (nextPlatformId: string) => {
    setPlatformId(nextPlatformId);
    setPreparing(true);
    setError(null);
    setResult(null);
    setPublishResult(null);
    try {
      const res = await fetch(`/api/analyze/${videoId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId: nextPlatformId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not prepare this export");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare this export");
    } finally {
      setPreparing(false);
    }
  };

  const publishToTikTok = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch("/api/tiktok/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "not_connected") {
          throw new Error("Connect your TikTok account first (see the section above)");
        }
        throw new Error(data.error || "Upload failed");
      }
      setPublishResult({
        ok: true,
        message: "Sent to your TikTok inbox — open the TikTok app, paste the caption, and post.",
      });
    } catch (err) {
      setPublishResult({ ok: false, message: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setPublishing(false);
    }
  };

  const copyCaption = () => {
    if (!result?.caption) return;
    navigator.clipboard.writeText(result.caption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
      <p className="text-xs font-bold text-foreground uppercase tracking-wide">
        🎯 Finish for a platform
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={platformId}
          onChange={(e) => prepare(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {!result && (
          <button
            onClick={() => prepare(platformId)}
            disabled={preparing}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
          >
            {preparing ? "Preparing..." : "Prepare"}
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}

      {result && (
        <div className="flex flex-col gap-1.5 items-start">
          <p className="text-[11px] text-muted-foreground">
            Ready for {result.platform.label}
            {result.durationSeconds ? ` · ${result.durationSeconds.toFixed(1)}s` : ""}.
          </p>

          {result.caption && (
            <button
              onClick={copyCaption}
              className="px-2 py-1 rounded-md border border-border text-[10px] font-semibold text-foreground hover:bg-muted/40"
            >
              {copied ? "✓ Caption copied" : "Copy caption"}
            </button>
          )}

          {result.platform.publishSupported ? (
            <button
              onClick={publishToTikTok}
              disabled={publishing}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
            >
              {publishing ? "Sending..." : `Send to ${result.platform.label} drafts`}
            </button>
          ) : (
            <a
              href={result.downloadUrl}
              download
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold"
            >
              Download for {result.platform.label}
            </a>
          )}

          {!result.platform.publishSupported && (
            <p className="text-[11px] text-muted-foreground">
              {result.platform.label} doesn&apos;t have an automatic publish connection yet — download the file and post it yourself.
            </p>
          )}

          {publishResult && (
            <p className={`text-[11px] break-words ${publishResult.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
              {publishResult.ok ? "✓ " : "✗ "}
              {publishResult.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
