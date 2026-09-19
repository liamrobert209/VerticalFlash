import { promises as fs } from "fs";
import { join, extname } from "path";
import { z } from "zod";
import { ACTOR_IMAGES_DIR } from "./paths";

// Mirrors product-images-store.ts exactly (same slot/manifest pattern),
// scoped per product line: reference photos of a real person, used as the
// "swap in our own person" reference when a competitor ad shows one — see
// static-ad-generate.ts. Per-product-line (not one global actor) per the
// user's explicit ask: whichever product is selected/identified should
// determine which actor's photos get used.

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export const ACTOR_IMAGE_SLOT_COUNT = 3;

const ActorImageSlotZ = z.object({
  id: z.number().int().min(1).max(ACTOR_IMAGE_SLOT_COUNT),
  label: z.string(),
  filename: z.string().nullable(),
});

export type ActorImageSlot = z.infer<typeof ActorImageSlotZ>;

const ActorImageSlotsZ = z.array(ActorImageSlotZ).length(ACTOR_IMAGE_SLOT_COUNT);

const DEFAULT_LABELS = ["Portrait", "Full body", "Using a device"];

function actorDir(productLineId: string): string {
  return join(ACTOR_IMAGES_DIR, productLineId);
}

function manifestPath(productLineId: string): string {
  return join(actorDir(productLineId), "slots.json");
}

function defaultSlots(): ActorImageSlot[] {
  return Array.from({ length: ACTOR_IMAGE_SLOT_COUNT }, (_, i) => ({
    id: i + 1,
    label: DEFAULT_LABELS[i] ?? `Image ${i + 1}`,
    filename: null,
  }));
}

export async function getActorImageSlots(productLineId: string): Promise<ActorImageSlot[]> {
  try {
    const raw = await fs.readFile(manifestPath(productLineId), "utf8");
    return ActorImageSlotsZ.parse(JSON.parse(raw));
  } catch {
    return defaultSlots();
  }
}

async function saveManifest(productLineId: string, slots: ActorImageSlot[]): Promise<void> {
  const dir = actorDir(productLineId);
  await fs.mkdir(dir, { recursive: true });
  const path = manifestPath(productLineId);
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(ActorImageSlotsZ.parse(slots), null, 2));
  await fs.rename(tmp, path);
}

export async function setActorSlotLabel(
  productLineId: string,
  slotId: number,
  label: string
): Promise<ActorImageSlot[]> {
  const slots = await getActorImageSlots(productLineId);
  if (!slots.some((s) => s.id === slotId)) throw new Error("Invalid slot");
  const updated = slots.map((s) => (s.id === slotId ? { ...s, label } : s));
  await saveManifest(productLineId, updated);
  return updated;
}

export async function setActorSlotImage(
  productLineId: string,
  slotId: number,
  originalName: string,
  buffer: Buffer
): Promise<ActorImageSlot[]> {
  const ext = extname(originalName).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}`);
  }
  const slots = await getActorImageSlots(productLineId);
  const current = slots.find((s) => s.id === slotId);
  if (!current) throw new Error("Invalid slot");

  const dir = actorDir(productLineId);
  await fs.mkdir(dir, { recursive: true });
  if (current.filename) await fs.unlink(join(dir, current.filename)).catch(() => {});

  const filename = `slot-${slotId}${ext}`;
  await fs.writeFile(join(dir, filename), buffer);
  const updated = slots.map((s) => (s.id === slotId ? { ...s, filename } : s));
  await saveManifest(productLineId, updated);
  return updated;
}

export async function clearActorSlotImage(productLineId: string, slotId: number): Promise<ActorImageSlot[]> {
  const slots = await getActorImageSlots(productLineId);
  const current = slots.find((s) => s.id === slotId);
  if (!current) throw new Error("Invalid slot");
  if (current.filename) {
    await fs.unlink(join(actorDir(productLineId), current.filename)).catch(() => {});
  }
  const updated = slots.map((s) => (s.id === slotId ? { ...s, filename: null } : s));
  await saveManifest(productLineId, updated);
  return updated;
}

export function actorImagePath(productLineId: string, filename: string): string {
  return join(actorDir(productLineId), filename);
}
