import { promises as fs } from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
import { STATIC_ADS_DIR } from "./paths";
import {
  StaticAdProjectZ,
  emptyBaseImage,
  type StaticAdProject,
  type StaticAdStatus,
} from "./static-ad-schema";
import type { AngleSourceList } from "./icp-angles";

function projectPath(id: string): string {
  return join(STATIC_ADS_DIR, id, "project.json");
}

export async function loadStaticAdProject(id: string): Promise<StaticAdProject | null> {
  try {
    const raw = await fs.readFile(projectPath(id), "utf8");
    return StaticAdProjectZ.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Temp-file + rename so a crash mid-write can't truncate the file — same
// convention as generation-store.ts's saveGenerations.
export async function saveStaticAdProject(project: StaticAdProject): Promise<void> {
  const path = projectPath(project.id);
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(StaticAdProjectZ.parse(project), null, 2));
  await fs.rename(tmp, path);
}

export async function createStaticAdProject(input: {
  referenceAdId: string;
  productLineId: string;
  ourUsp: string;
  angleCategory: AngleSourceList | null;
  angleLabel: string;
  persona: string;
  backgroundInstruction: string | null;
}): Promise<StaticAdProject> {
  const now = new Date().toISOString();
  const project: StaticAdProject = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "draft",
    referenceAdId: input.referenceAdId,
    productLineId: input.productLineId,
    ourUsp: input.ourUsp,
    angle: "other",
    angleCategory: input.angleCategory,
    angleLabel: input.angleLabel,
    persona: input.persona,
    // Written by generateAdCopy right after creation (see the /copy
    // route) — starts blank so the project is always immediately valid
    // even if that call hasn't run yet or fails.
    headline: "",
    subhead: "",
    cta: "",
    backgroundInstruction: input.backgroundInstruction,
    baseImage: emptyBaseImage(),
    textOverlay: null,
    finalImage: null,
    feedback: null,
  };
  await saveStaticAdProject(project);
  return project;
}

// Discards one generation attempt from a project's grid — the "delete this
// version" action. Best-effort file cleanup (a missing file is not an
// error worth surfacing); clears acceptedAttempt if it pointed at the
// attempt being removed, so the workspace doesn't keep referencing a
// deleted image.
export async function deleteStaticAdAttempt(
  projectId: string,
  attempt: number
): Promise<StaticAdProject | null> {
  const project = await loadStaticAdProject(projectId);
  if (!project) return null;

  const target = project.baseImage.attempts.find((a) => a.attempt === attempt);
  if (!target) return project;

  if (target.file) {
    try {
      await fs.unlink(join(STATIC_ADS_DIR, projectId, target.file));
    } catch {
      // Missing file is fine — nothing left to clean up.
    }
  }

  project.baseImage.attempts = project.baseImage.attempts.filter((a) => a.attempt !== attempt);
  if (project.baseImage.acceptedAttempt === attempt) {
    project.baseImage.acceptedAttempt = null;
    // Same staleness reasoning as the accept route: a composited final
    // image rendered against the now-deleted accepted photo shouldn't
    // stick around as if it were still valid.
    if (project.finalImage) {
      project.finalImage = null;
      if (project.status === "accepted") project.status = "draft";
    }
  }
  project.updatedAt = new Date().toISOString();
  await saveStaticAdProject(project);
  return project;
}

// Reading every project.json under STATIC_ADS_DIR is fine at today's
// volume, but scales linearly forever with no cap — this bounds how many
// directory entries a single call will ever read, so the route degrades
// gracefully (fewer, still-correct, most-recent results) instead of
// getting slower on every call as more projects accumulate. Revisit with a
// real index file if this ceiling ever needs raising.
const MAX_PROJECTS_SCANNED = 500;

// Lists project.json files under STATIC_ADS_DIR, most-recently-updated
// first, same directory-scan approach the video-project history sidebar
// already uses for /api/downloads. `limit` trims the final result (default:
// no trim beyond MAX_PROJECTS_SCANNED); the scan ceiling above is separate
// and always applies.
export async function listStaticAdProjects(filter?: {
  status?: StaticAdStatus;
  since?: string;
  limit?: number;
}): Promise<StaticAdProject[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(STATIC_ADS_DIR);
  } catch {
    return [];
  }
  const projects: StaticAdProject[] = [];
  for (const id of entries.slice(0, MAX_PROJECTS_SCANNED)) {
    const project = await loadStaticAdProject(id);
    if (!project) continue;
    if (filter?.status && project.status !== filter.status) continue;
    if (filter?.since && project.updatedAt < filter.since) continue;
    projects.push(project);
  }
  projects.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return filter?.limit ? projects.slice(0, filter.limit) : projects;
}
