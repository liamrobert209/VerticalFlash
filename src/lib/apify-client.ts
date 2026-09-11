// Thin wrapper around Apify's REST API — used to run ad-library scraper
// actors (Facebook Ads Library, TikTok Ad Library/Creative Center) rather
// than going through either platform's own developer APIs, since Meta's
// official Ad Library API only covers political/social-issue ads (not the
// general commercial ads we need), and TikTok's Commercial Content Library
// API requires its own separate developer approval. Async run+poll, not the
// sync run-sync-get-dataset-items endpoint, since that caps at 300s and a
// weekly multi-account sync can legitimately run longer.

const APIFY_BASE = "https://api.apify.com/v2";

type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMING-OUT"
  | "TIMED-OUT"
  | "ABORTING"
  | "ABORTED";

const TERMINAL_STATUSES: ApifyRunStatus[] = ["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"];

export function apifyConfigured(): boolean {
  return !!process.env.APIFY_API_TOKEN;
}

function requireToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  return token;
}

export async function startApifyRun(
  actorId: string,
  input: Record<string, unknown>
): Promise<{ runId: string; datasetId: string }> {
  const token = requireToken();
  const res = await fetch(
    `${APIFY_BASE}/actors/${encodeURIComponent(actorId)}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`Apify run start failed for ${actorId} (HTTP ${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return { runId: data.data.id, datasetId: data.data.defaultDatasetId };
}

export async function pollApifyRun(
  runId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<ApifyRunStatus> {
  const token = requireToken();
  const interval = opts.intervalMs ?? 5000;
  const timeout = opts.timeoutMs ?? 10 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!res.ok) throw new Error(`Apify run status check failed (HTTP ${res.status})`);
    const data = await res.json();
    const status: ApifyRunStatus = data.data.status;
    if (TERMINAL_STATUSES.includes(status)) return status;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Apify run ${runId} polling timed out after ${opts.timeoutMs ?? 600000}ms`);
}

export async function fetchApifyDatasetItems<T = Record<string, unknown>>(
  datasetId: string
): Promise<T[]> {
  const token = requireToken();
  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&clean=true`);
  if (!res.ok) throw new Error(`Apify dataset fetch failed (HTTP ${res.status})`);
  return res.json();
}

// Run an actor to completion and return its results — the one entry point
// callers should use; startApifyRun/pollApifyRun/fetchApifyDatasetItems are
// exported separately only for testing against real runs step by step.
export async function runApifyActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  pollOpts?: { intervalMs?: number; timeoutMs?: number }
): Promise<T[]> {
  const { runId, datasetId } = await startApifyRun(actorId, input);
  const status = await pollApifyRun(runId, pollOpts);
  if (status !== "SUCCEEDED") {
    throw new Error(`Apify actor ${actorId} run ${runId} ended with status ${status}`);
  }
  return fetchApifyDatasetItems<T>(datasetId);
}
