import { promises as fs } from "fs";
import { join, extname } from "path";
import { z } from "zod";
import { PRODUCT_IMAGES_DIR } from "./paths";

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Exactly 5 fixed, always-present slots per product line — not a freeform
// gallery. Each slot has a user-editable label (e.g. "Front view") and an
// optional uploaded image. The manifest (slots.json) is the source of
// truth; filenames are deterministic (slot-<id>.<ext>) so a re-upload just
// replaces the slot's file instead of accumulating orphans.
export const PRODUCT_IMAGE_SLOT_COUNT = 5;

const ProductImageSlotZ = z.object({
  id: z.number().int().min(1).max(PRODUCT_IMAGE_SLOT_COUNT),
  label: z.string(),
  filename: z.string().nullable(),
});

export type ProductImageSlot = z.infer<typeof ProductImageSlotZ>;

const ProductImageSlotsZ = z.array(ProductImageSlotZ).length(PRODUCT_IMAGE_SLOT_COUNT);

function productDir(productLineId: string): string {
  return join(PRODUCT_IMAGES_DIR, productLineId);
}

function manifestPath(productLineId: string): string {
  return join(productDir(productLineId), "slots.json");
}

function defaultSlots(): ProductImageSlot[] {
  return Array.from({ length: PRODUCT_IMAGE_SLOT_COUNT }, (_, i) => ({
    id: i + 1,
    label: `Image ${i + 1}`,
    filename: null,
  }));
}

export async function getProductImageSlots(productLineId: string): Promise<ProductImageSlot[]> {
  try {
    const raw = await fs.readFile(manifestPath(productLineId), "utf8");
    return ProductImageSlotsZ.parse(JSON.parse(raw));
  } catch {
    return defaultSlots();
  }
}

async function saveManifest(productLineId: string, slots: ProductImageSlot[]): Promise<void> {
  const dir = productDir(productLineId);
  await fs.mkdir(dir, { recursive: true });
  const path = manifestPath(productLineId);
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(ProductImageSlotsZ.parse(slots), null, 2));
  await fs.rename(tmp, path);
}

export async function setSlotLabel(
  productLineId: string,
  slotId: number,
  label: string
): Promise<ProductImageSlot[]> {
  const slots = await getProductImageSlots(productLineId);
  if (!slots.some((s) => s.id === slotId)) throw new Error("Invalid slot");
  const updated = slots.map((s) => (s.id === slotId ? { ...s, label } : s));
  await saveManifest(productLineId, updated);
  return updated;
}

export async function setSlotImage(
  productLineId: string,
  slotId: number,
  originalName: string,
  buffer: Buffer
): Promise<ProductImageSlot[]> {
  const ext = extname(originalName).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}`);
  }
  const slots = await getProductImageSlots(productLineId);
  const current = slots.find((s) => s.id === slotId);
  if (!current) throw new Error("Invalid slot");

  const dir = productDir(productLineId);
  await fs.mkdir(dir, { recursive: true });
  // Clear any previous file for this slot first — its extension may differ
  // from the new upload's, so a fixed "slot-<id>.<ext>" name alone can't
  // guarantee the old file gets overwritten.
  if (current.filename) await fs.unlink(join(dir, current.filename)).catch(() => {});

  const filename = `slot-${slotId}${ext}`;
  await fs.writeFile(join(dir, filename), buffer);
  const updated = slots.map((s) => (s.id === slotId ? { ...s, filename } : s));
  await saveManifest(productLineId, updated);
  return updated;
}

export async function clearSlotImage(productLineId: string, slotId: number): Promise<ProductImageSlot[]> {
  const slots = await getProductImageSlots(productLineId);
  const current = slots.find((s) => s.id === slotId);
  if (!current) throw new Error("Invalid slot");
  if (current.filename) {
    await fs.unlink(join(productDir(productLineId), current.filename)).catch(() => {});
  }
  const updated = slots.map((s) => (s.id === slotId ? { ...s, filename: null } : s));
  await saveManifest(productLineId, updated);
  return updated;
}

export function productImagePath(productLineId: string, filename: string): string {
  return join(productDir(productLineId), filename);
}
