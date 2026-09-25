import type { ProductLinesConfig } from "./product-lines";
import { listStaticAdProjects } from "./static-ad-store";
import type { StaticAdStatus } from "./static-ad-schema";

// Every image the Static Ad Generator has ever produced, split into the two
// distinct things a user actually thinks of as different — a raw generated
// base image (product swapped in, no text yet) vs. a finished ad (text/CTA
// baked in via either the deterministic compositor or the AI overlay path)
// — and grouped by product line. Pure aggregation over static-ad
// project.json files already on disk (see static-ad-store.ts); no new data.

export interface BaseImageEntry {
  projectId: string;
  attempt: number;
  file: string;
  createdAt: string;
  prompt: string;
  isAccepted: boolean;
}

export interface FinalImageEntry {
  projectId: string;
  file: string;
  updatedAt: string;
  headline: string;
  status: StaticAdStatus;
}

export interface ProductLineGenerationHistory {
  productLineId: string;
  productLineLabel: string;
  baseImages: BaseImageEntry[];
  finalImages: FinalImageEntry[];
}

export async function getGenerationHistory(cfg: ProductLinesConfig): Promise<ProductLineGenerationHistory[]> {
  const projects = await listStaticAdProjects({});

  const byLine = new Map<string, ProductLineGenerationHistory>();
  for (const line of cfg.productLines) {
    byLine.set(line.id, { productLineId: line.id, productLineLabel: line.label, baseImages: [], finalImages: [] });
  }

  for (const project of projects) {
    const bucket = byLine.get(project.productLineId);
    if (!bucket) continue; // reference ad's product line was since removed from config

    for (const attempt of project.baseImage.attempts) {
      if (attempt.status === "ready" && attempt.file) {
        bucket.baseImages.push({
          projectId: project.id,
          attempt: attempt.attempt,
          file: attempt.file,
          createdAt: attempt.createdAt,
          prompt: attempt.prompt,
          isAccepted: project.baseImage.acceptedAttempt === attempt.attempt,
        });
      }
    }

    if (project.finalImage) {
      bucket.finalImages.push({
        projectId: project.id,
        file: project.finalImage,
        updatedAt: project.updatedAt,
        headline: project.headline,
        status: project.status,
      });
    }
  }

  for (const bucket of byLine.values()) {
    bucket.baseImages.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    bucket.finalImages.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  return Array.from(byLine.values()).filter((b) => b.baseImages.length > 0 || b.finalImages.length > 0);
}
