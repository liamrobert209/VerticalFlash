import { promises as fs } from "fs";
import { join, extname, basename } from "path";
import { PRODUCT_IMAGES_DIR } from "./paths";

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function productDir(productLineId: string): string {
  return join(PRODUCT_IMAGES_DIR, productLineId);
}

export async function listProductImages(productLineId: string): Promise<string[]> {
  try {
    const files = await fs.readdir(productDir(productLineId));
    return files.filter((f) => !f.startsWith(".") && IMAGE_EXTENSIONS.includes(extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

export async function saveProductImage(
  productLineId: string,
  originalName: string,
  buffer: Buffer
): Promise<string> {
  const ext = extname(originalName).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}`);
  }
  const dir = productDir(productLineId);
  await fs.mkdir(dir, { recursive: true });
  const stem = basename(originalName, ext).replace(/[^\w.-]/g, "_").slice(0, 60) || "image";
  let filename = `${stem}${ext}`;
  let n = 2;
  while (
    await fs
      .access(join(dir, filename))
      .then(() => true)
      .catch(() => false)
  ) {
    filename = `${stem}-${n}${ext}`;
    n++;
  }
  await fs.writeFile(join(dir, filename), buffer);
  return filename;
}

export async function deleteProductImage(productLineId: string, filename: string): Promise<void> {
  await fs.unlink(join(productDir(productLineId), filename)).catch(() => {});
}

export function productImagePath(productLineId: string, filename: string): string {
  return join(productDir(productLineId), filename);
}
