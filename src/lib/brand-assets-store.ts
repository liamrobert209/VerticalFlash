import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join, extname } from "path";
import { getDb } from "./db";
import { BRAND_ASSETS_DIR } from "./paths";
import { BrandAssetZ, type BrandAsset, type BrandAssetKind, type AdStyleTemplate } from "./brand-assets-schema";

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
  // "website" and the color-palette kinds have no *required* file —
  // filename/mimeType/buffer are only required together (all three or
  // none).
  filename?: string | null;
  mimeType?: string | null;
  buffer?: Buffer;
  description: string | null;
  url?: string | null;
  colors?: string[] | null;
  productLineId?: string | null;
  useCase?: string | null;
  styleTemplate?: AdStyleTemplate | null;
}): Promise<BrandAsset> {
  const id = randomUUID();
  if (opts.buffer && opts.filename) {
    await fs.mkdir(BRAND_ASSETS_DIR, { recursive: true });
    await fs.writeFile(brandAssetFilePath(id, opts.filename), opts.buffer);
  }

  const sql = getDb();
  const rows = await sql`
    insert into brand_assets (id, kind, filename, mime_type, description, url, colors, product_line_id, use_case, style_template, uploaded_at)
    values (
      ${id}, ${opts.kind}, ${opts.filename ?? null}, ${opts.mimeType ?? null}, ${opts.description},
      ${opts.url ?? null}, ${opts.colors ?? null}, ${opts.productLineId ?? null}, ${opts.useCase ?? null},
      ${opts.styleTemplate ?? null}, now()
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

// The most recently added primary/secondary color-palette assets — brand
// color is treated as one global identity, not per-product-line, so this is
// a flat "latest wins" lookup per kind rather than filtered by product
// line. Read by the static ad overlay compositor to style headline/CTA
// text on-brand instead of the hardcoded defaults. Returns null only when
// neither palette has been set yet.
export async function getLatestColorPalette(): Promise<{
  primaryColor: string | null;
  accentColor: string | null;
} | null> {
  const sql = getDb();
  const latest = async (kind: "color_palette_primary" | "color_palette_secondary") => {
    const rows = await sql`
      select colors from brand_assets
      where kind = ${kind} and colors is not null and array_length(colors, 1) > 0
      order by uploaded_at desc
      limit 1
    `;
    return rows[0] ? ((rows[0].colors as string[])[0] ?? null) : null;
  };
  const [primaryColor, accentColor] = await Promise.all([
    latest("color_palette_primary"),
    latest("color_palette_secondary"),
  ]);
  if (!primaryColor && !accentColor) return null;
  return { primaryColor, accentColor };
}

// Every hex code from the most recent primary + secondary palette assets
// (not just the first of each, unlike getLatestColorPalette) — the full
// candidate set for the smart-placement contrast picker (static-ad-
// placement.ts), which needs real options to choose the best-contrast one
// from, not just the two "headline/CTA" defaults.
export async function getFullColorPalette(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    select colors from brand_assets
    where kind in ('color_palette_primary', 'color_palette_secondary') and colors is not null and array_length(colors, 1) > 0
  `;
  const seen = new Set<string>();
  for (const row of rows) {
    for (const hex of row.colors as string[]) seen.add(hex);
  }
  return [...seen];
}

// The most recently added "logo"-kind asset — same "latest wins" pattern
// as getLatestColorPalette. Read by the static ad overlay compositor for
// the corner watermark (see static-ad-overlays.ts). Whichever logo variant
// this resolves to (full lockup, eye mark, white, or black) is composited
// onto a small light chip rather than directly on the photo, so it stays
// legible regardless of which variant happens to be "latest" or what's
// behind it in the photo.
export async function getLatestLogo(): Promise<{ path: string; mimeType: string } | null> {
  const sql = getDb();
  const rows = await sql`
    select id, filename, mime_type from brand_assets
    where kind = 'logo' and filename is not null
    order by uploaded_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    path: brandAssetFilePath(row.id as string, row.filename as string),
    mimeType: (row.mime_type as string | null) ?? "image/png",
  };
}

// Same "latest logo" lookup as getLatestLogo, but keeps id/filename apart
// instead of resolving straight to an on-disk path — needed by callers
// (e.g. the AI text-overlay path) that hand the file to an external API via
// a signed URL (see signed-url.ts) rather than reading it off disk directly.
export async function getLatestLogoAsset(): Promise<{ id: string; filename: string; mimeType: string } | null> {
  const sql = getDb();
  const rows = await sql`
    select id, filename, mime_type from brand_assets
    where kind = 'logo' and filename is not null
    order by uploaded_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    filename: row.filename as string,
    mimeType: (row.mime_type as string | null) ?? "image/png",
  };
}
