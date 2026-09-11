import { promises as fs } from "fs";
import { z } from "zod";
import { sidecarPath } from "./paths";
import { REFERENCE_ORIGINS } from "./content-record-schema";

// Written once by the iterate-on-content tool (creator or ad door), read
// by recordContentFromRender() to tag the resulting content_records row,
// and by the caption/matching/generation prompts as a directive override —
// the same pattern captions/route.ts's existing `concept` field already
// uses, just persisted instead of passed per-request.
export const AdhocBriefZ = z.object({
  originalAngle: z.string().nullable(),
  newAngle: z.string().nullable(),
  angleSource: z.string().nullable(),
  isCustom: z.boolean(),
  referenceOrigin: z.enum(REFERENCE_ORIGINS),
  platformId: z.string(),
  createdAt: z.string(),
});

export type AdhocBrief = z.infer<typeof AdhocBriefZ>;

export function adhocBriefPath(videoId: string): string {
  return sidecarPath(videoId, "adhoc-brief");
}

// Turns the ad-hoc brief into a plain-text directive other prompt builders
// can drop into their existing "creator's concept" override slot. Silent
// null for any project that didn't come through the iterate-on-content tool.
export async function readAdhocBriefConcept(videoId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(adhocBriefPath(videoId), "utf8");
    const brief = AdhocBriefZ.parse(JSON.parse(raw));
    if (!brief.newAngle) return null;
    return brief.originalAngle
      ? `Make this about: ${brief.newAngle} (the original was about: ${brief.originalAngle})`
      : `Make this about: ${brief.newAngle}`;
  } catch {
    return null;
  }
}
