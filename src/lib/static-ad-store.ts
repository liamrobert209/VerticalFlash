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
  ourProductImage: string;
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
    ourProductImage: input.ourProductImage,
    baseImage: emptyBaseImage(),
    textOverlay: null,
    finalImage: null,
  };
  await saveStaticAdProject(project);
  return project;
}

// Lists every project by reading each project.json under STATIC_ADS_DIR —
// fine at this data volume (one small JSON file per project, same
// directory-scan approach the video-project history sidebar already uses
// for /api/downloads); revisit with an index file if volume grows.
export async function listStaticAdProjects(filter?: {
  status?: StaticAdStatus;
  since?: string;
}): Promise<StaticAdProject[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(STATIC_ADS_DIR);
  } catch {
    return [];
  }
  const projects: StaticAdProject[] = [];
  for (const id of entries) {
    const project = await loadStaticAdProject(id);
    if (!project) continue;
    if (filter?.status && project.status !== filter.status) continue;
    if (filter?.since && project.updatedAt < filter.since) continue;
    projects.push(project);
  }
  projects.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return projects;
}
