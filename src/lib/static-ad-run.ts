import { promises as fs } from "fs";
import { join } from "path";
import { STATIC_ADS_DIR } from "./paths";
import { GEMINI_IMAGE_MODEL } from "./gemini";
import { loadStaticAdProject, saveStaticAdProject } from "./static-ad-store";
import { staticAdAttemptName, type StaticAdProject } from "./static-ad-schema";
import type { GeneratedImage } from "./static-ad-generate";

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
