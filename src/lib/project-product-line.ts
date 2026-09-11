import { promises as fs } from "fs";
import { z } from "zod";
import { sidecarPath } from "./paths";

// A project is pinned to one product line for its whole lifecycle, the
// first time any matching/generation step runs for it. Switching the
// ambient sidebar product selector mid-project must not retroactively
// change an in-progress match, so this is read-once-written-once, not
// re-derived from the cookie on every call.
export const ProjectProductLineZ = z.object({
  productLineId: z.string(),
  pinnedAt: z.string(),
});

export type ProjectProductLine = z.infer<typeof ProjectProductLineZ>;

function path(videoId: string): string {
  return sidecarPath(videoId, "product-line");
}

export async function readProjectProductLine(videoId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path(videoId), "utf8");
    return ProjectProductLineZ.parse(JSON.parse(raw)).productLineId;
  } catch {
    return null;
  }
}

// First-write-wins: if a pin already exists, returns it unchanged instead of
// overwriting with whatever the caller passed.
export async function writeProjectProductLineIfAbsent(
  videoId: string,
  productLineId: string
): Promise<string> {
  const existing = await readProjectProductLine(videoId);
  if (existing) return existing;

  const record: ProjectProductLine = { productLineId, pinnedAt: new Date().toISOString() };
  const p = path(videoId);
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(ProjectProductLineZ.parse(record), null, 2));
  await fs.rename(tmp, p);
  return productLineId;
}
