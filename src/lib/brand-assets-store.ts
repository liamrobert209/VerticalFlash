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
  // "website" and "color_palette" assets have no uploaded file — filename/
  // mimeType/buffer are only required together (all three or none).
  filename?: string | null;
  mimeType?: string | null;
  buffer?: Buffer;
  description: string | null;
  url?: string | null;
  colors?: string[] | null;
  productLineId?: string | null;
}): Promise<BrandAsset> {
  const id = randomUUID();
  if (opts.buffer && opts.filename) {
    await fs.mkdir(BRAND_ASSETS_DIR, { recursive: true });
    await fs.writeFile(brandAssetFilePath(id, opts.filename), opts.buffer);
  }

  const sql = getDb();
  const rows = await sql`
    insert into brand_assets (id, kind, filename, mime_type, description, url, colors, product_line_id, uploaded_at)
    values (
      ${id}, ${opts.kind}, ${opts.filename ?? null}, ${opts.mimeType ?? null}, ${opts.description},
      ${opts.url ?? null}, ${opts.colors ?? null}, ${opts.productLineId ?? null}, now()
    )
    returning *
  `;
  return BrandAssetZ.parse(rows[0]);
}

export async function deleteBrandAsset(id: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`select filename from brand_assets where id = ${id}`;
  if (!rows[0]) return false;
  if (rows[0].filename) {
    await fs.unlink(brandAssetFilePath(id, rows[0].filename as string)).catch(() => {});
  }
  const result = await sql`delete from brand_assets where id = ${id}`;
  return result.count > 0;
}

export async function getBrandAsset(id: string): Promise<BrandAsset | null> {
  const sql = getDb();
  const rows = await sql`select * from brand_assets where id = ${id}`;
  return rows[0] ? BrandAssetZ.parse(rows[0]) : null;
}

// The most recently added color-palette asset — brand color is treated as
// one global identity, not per-product-line, so this is a flat "latest
// wins" lookup rather than filtered by product line. Read by the static ad
// overlay compositor to style headline/CTA text on-brand instead of the
// hardcoded defaults.
export async function getLatestColorPalette(): Promise<string[] | null> {
  const sql = getDb();
  const rows = await sql`
    select colors from brand_assets
    where kind = 'color_palette' and colors is not null and array_length(colors, 1) > 0
    order by uploaded_at desc
    limit 1
  `;
  return rows[0] ? (rows[0].colors as string[]) : null;
}
