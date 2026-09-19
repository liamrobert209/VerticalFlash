import { promises as fs } from "fs";
import { join } from "path";
import { STATIC_ADS_DIR } from "./paths";
import { GEMINI_IMAGE_MODEL } from "./gemini";
import { loadStaticAdProject, saveStaticAdProject } from "./static-ad-store";
import { staticAdAttemptName, type StaticAdProject } from "./static-ad-schema";
import type { GeneratedImage } from "./static-ad-generate";
import { recordQaOutcome } from "./qa-outcomes-store";

// Best-effort — a QA-history write failing should never affect the
// generation flow it's observing.
async function recordQaOutcomes(projectId: string, attempt: number, result: GeneratedImage): Promise<void> {
  const writes: Promise<void>[] = [];
  if (result.qa) {
    writes.push(
      recordQaOutcome({ projectId, attempt, kind: "product_placement", passed: result.qa.passed, issues: result.qa.issues })
    );
  }
  if (result.personQa) {
    writes.push(
      recordQaOutcome({ projectId, attempt, kind: "person_placement", passed: result.personQa.passed, issues: result.personQa.issues })
    );
  }
  await Promise.allSettled(writes).then((settled) => {
    for (const s of settled) {
      if (s.status === "rejected") console.error(`Failed to record QA outcome (${projectId}, attempt ${attempt}):`, s.reason);
    }
  });
}

// One base-image slot per project (unlike video's per-shot keying) — a
// static ad project has exactly one photographic base image to work on.
const inFlight = new Set<string>();

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

function extFor(mimeType: string): string {
  return MIME_EXT[mimeType] ?? ".png";
}

export interface StaticAdAttemptSpec {
  projectId: string;
  kind: "generate" | "refine";
  prompt: string;
  parentAttempt: number | null;
  // Runs the actual Gemini call once the attempt slot is reserved
  run: (attempt: number) => Promise<GeneratedImage>;
}

// Reserve the project's base-image slot, persist the in-flight marker,
// run, and record the attempt (success or failure). Mirrors
// generation-run.ts's executeGenerationAttempt.
export async function executeStaticAdAttempt(
  spec: StaticAdAttemptSpec
): Promise<{ project: StaticAdProject } | { busy: true } | { notFound: true }> {
  const key = spec.projectId;
  if (inFlight.has(key)) return { busy: true };
  inFlight.add(key);
  try {
    let project = await loadStaticAdProject(spec.projectId);
    if (!project) return { notFound: true };
    if (project.baseImage.status === "generating") return { busy: true };

    const attemptNumber = project.baseImage.attempts.length + 1;
    project.baseImage.status = "generating";
    project.baseImage.startedAt = new Date().toISOString();
    project.updatedAt = new Date().toISOString();
    await saveStaticAdProject(project);

    let result: GeneratedImage | null = null;
    let failure: unknown = null;
    try {
      result = await spec.run(attemptNumber);
    } catch (error) {
      failure = error;
    }

    let file: string | null = null;
    if (result) {
      const ext = extFor(result.mimeType);
      file = staticAdAttemptName(attemptNumber, ext);
      await fs.mkdir(join(STATIC_ADS_DIR, spec.projectId), { recursive: true });
      await fs.writeFile(
        join(STATIC_ADS_DIR, spec.projectId, file),
        Buffer.from(result.base64, "base64")
      );
      await recordQaOutcomes(spec.projectId, attemptNumber, result);
    }

    // Reload in case something else touched the project while generating
    project = await loadStaticAdProject(spec.projectId);
    if (!project) return { notFound: true };
    project.baseImage.attempts.push({
      attempt: attemptNumber,
      kind: spec.kind,
      prompt: spec.prompt,
      parentAttempt: spec.parentAttempt,
      file,
      status: result ? "ready" : "failed",
      error: failure == null ? null : failure instanceof Error ? failure.message : String(failure),
      ...(result?.usage ? { usage: result.usage } : {}),
      model: GEMINI_IMAGE_MODEL,
      createdAt: new Date().toISOString(),
    });
    project.baseImage.status = result ? "ready" : "failed";
    project.baseImage.startedAt = null;
    project.updatedAt = new Date().toISOString();
    await saveStaticAdProject(project);

    if (failure != null) throw failure;
    return { project };
  } finally {
    inFlight.delete(key);
  }
}

export function staticAdAttemptImagePath(projectId: string, file: string): string {
  return join(STATIC_ADS_DIR, projectId, file);
}

export interface StaticAdBatchSpec {
  projectId: string;
  count: number;
  prompt: string;
  // Runs one Gemini call for the given attempt number — called `count`
  // times concurrently, each independent (same inputs, relying on
  // Gemini's own sampling variation for the 5 different results).
  run: (attempt: number) => Promise<GeneratedImage>;
}

// Reserves the project's base-image slot ONCE (not once per attempt), runs
// `count` generations concurrently, and appends every result (success or
// failure) in a single save. Used for the initial "Generate 5 versions"
// action; executeStaticAdAttempt (single-attempt) still powers refine.
export async function executeStaticAdBatchGenerate(
  spec: StaticAdBatchSpec
): Promise<{ project: StaticAdProject } | { busy: true } | { notFound: true }> {
  const key = spec.projectId;
  if (inFlight.has(key)) return { busy: true };
  inFlight.add(key);
  try {
    let project = await loadStaticAdProject(spec.projectId);
    if (!project) return { notFound: true };
    if (project.baseImage.status === "generating") return { busy: true };

    const startAttempt = project.baseImage.attempts.length + 1;
    project.baseImage.status = "generating";
    project.baseImage.startedAt = new Date().toISOString();
    project.updatedAt = new Date().toISOString();
    await saveStaticAdProject(project);

    const outcomes = await Promise.allSettled(
      Array.from({ length: spec.count }, (_, i) => spec.run(startAttempt + i))
    );

    // Reload in case something else touched the project while generating
    project = await loadStaticAdProject(spec.projectId);
    if (!project) return { notFound: true };

    await fs.mkdir(join(STATIC_ADS_DIR, spec.projectId), { recursive: true });
    for (let i = 0; i < outcomes.length; i++) {
      const attemptNumber = startAttempt + i;
      const outcome = outcomes[i];
      let file: string | null = null;
      let error: string | null = null;
      if (outcome.status === "fulfilled") {
        const ext = extFor(outcome.value.mimeType);
        file = staticAdAttemptName(attemptNumber, ext);
        await fs.writeFile(
          join(STATIC_ADS_DIR, spec.projectId, file),
          Buffer.from(outcome.value.base64, "base64")
        );
        await recordQaOutcomes(spec.projectId, attemptNumber, outcome.value);
      } else {
        error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      }
      project.baseImage.attempts.push({
        attempt: attemptNumber,
        kind: "generate",
        prompt: spec.prompt,
        parentAttempt: null,
        file,
        status: file ? "ready" : "failed",
        error,
        ...(outcome.status === "fulfilled" && outcome.value.qa ? { qa: outcome.value.qa } : {}),
        ...(outcome.status === "fulfilled" && outcome.value.personQa ? { personQa: outcome.value.personQa } : {}),
        model: GEMINI_IMAGE_MODEL,
        createdAt: new Date().toISOString(),
      });
    }

    const anyReady = outcomes.some((o) => o.status === "fulfilled");
    project.baseImage.status = anyReady ? "ready" : "failed";
    project.baseImage.startedAt = null;
    project.updatedAt = new Date().toISOString();
    await saveStaticAdProject(project);

    return { project };
  } finally {
    inFlight.delete(key);
  }
}
