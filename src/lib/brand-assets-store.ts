import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join, extname } from "path";
import { getDb } from "./db";
import { BRAND_ASSETS_DIR } from "./paths";
import { BrandAssetZ, type BrandAsset, type BrandAssetKind } from "./brand-assets-schema";

export async function listBrandAssets(): Promise<BrandAsset[]> {
  const sql = getDb();
  const rows = await sql`select * from brand_assets order by uploaded_at desc`;
  return rows.map((r) => BrandAssetZ.parse(r));
}

export function brandAssetFilePath(id: string, filename: string): string {
  return join(BRAND_ASSETS_DIR, `${id}${extname(filename)}`);
}

export async function createBrandAsset(opts: {
  kind: BrandAssetKind;
  filename: string;
  mimeType: string | null;
  description: string | null;
  buffer: Buffer;
}): Promise<BrandAsset> {
  const id = randomUUID();
  await fs.mkdir(BRAND_ASSETS_DIR, { recursive: true });
  await fs.writeFile(brandAssetFilePath(id, opts.filename), opts.buffer);

  const sql = getDb();
  const rows = await sql`
    insert into brand_assets (id, kind, filename, mime_type, description, uploaded_at)
    values (${id}, ${opts.kind}, ${opts.filename}, ${opts.mimeType}, ${opts.description}, now())
    returning *
  `;
  return BrandAssetZ.parse(rows[0]);
}

export async function deleteBrandAsset(id: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`select filename from brand_assets where id = ${id}`;
  if (!rows[0]) return false;
  await fs.unlink(brandAssetFilePath(id, rows[0].filename as string)).catch(() => {});
  const result = await sql`delete from brand_assets where id = ${id}`;
  return result.count > 0;
}

export async function getBrandAsset(id: string): Promise<BrandAsset | null> {
  const sql = getDb();
  const rows = await sql`select * from brand_assets where id = ${id}`;
  return rows[0] ? BrandAssetZ.parse(rows[0]) : null;
}
