import { readFileSync } from "fs";
import { isAbsolute, join, resolve } from "path";
import {
  BrandConfigZ,
  DEFAULT_BRAND,
  toPublicBrand,
  type BrandConfig,
  type PublicBrandConfig,
} from "./brand";
import {
  ProductLinesConfigZ,
  DEFAULT_PRODUCT_LINES_CONFIG,
  toPublicProductLines,
  type ProductLinesConfig,
  type PublicProductLine,
} from "./product-lines";

// NOTE: server-side only (reads the filesystem); client components may
// import types from ./brand but must never import this module.
// Where all runtime data lives (downloads, analysis, renders, the clip
// library, JSON stores). Defaults to the repo root; set DATA_DIR to keep
// data outside the checkout.
export const DATA_ROOT = resolve(process.env.DATA_DIR ?? process.cwd());

const BRAND_CONFIG_FILENAME = "brand.config.json";

function brandConfigPath(): string {
  const fromEnv = process.env.BRAND_CONFIG;
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  }
  return join(DATA_ROOT, BRAND_CONFIG_FILENAME);
}

let cached: BrandConfig | undefined;

// Read once per process. Restart `next dev` after editing the file.
export function getBrandConfig(): BrandConfig {
  if (cached) return cached;

  const path = brandConfigPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // Dev mode evaluates this module once per bundle; warn once per process
    const g = globalThis as { __brandWarned?: boolean };
    if (!g.__brandWarned) console.warn(
      `[brand] No ${BRAND_CONFIG_FILENAME} found at ${path} — using a generic placeholder brand. ` +
        `Copy brand.config.example.json to ${BRAND_CONFIG_FILENAME} and describe your product.`
    );
    g.__brandWarned = true;
    cached = DEFAULT_BRAND;
    return cached;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `[brand] ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const parsed = BrandConfigZ.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`[brand] ${path} failed validation:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

export function getPublicBrand(): PublicBrandConfig {
  return toPublicBrand(getBrandConfig());
}

const PRODUCT_LINES_CONFIG_FILENAME = "product-lines.config.json";

function productLinesConfigPath(): string {
  const fromEnv = process.env.PRODUCT_LINES_CONFIG;
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  }
  return join(DATA_ROOT, PRODUCT_LINES_CONFIG_FILENAME);
}

let cachedProductLines: ProductLinesConfig | undefined;

// Read once per process, same idiom as getBrandConfig(). Restart the server
// after editing product-lines.config.json.
export function getProductLinesConfig(): ProductLinesConfig {
  if (cachedProductLines) return cachedProductLines;

  const path = productLinesConfigPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    const g = globalThis as { __productLinesWarned?: boolean };
    if (!g.__productLinesWarned) console.warn(
      `[product-lines] No ${PRODUCT_LINES_CONFIG_FILENAME} found at ${path} — using a generic placeholder product line. ` +
        `Copy product-lines.config.example.json to ${PRODUCT_LINES_CONFIG_FILENAME} and describe your products.`
    );
    g.__productLinesWarned = true;
    cachedProductLines = DEFAULT_PRODUCT_LINES_CONFIG;
    return cachedProductLines;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `[product-lines] ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const parsed = ProductLinesConfigZ.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`[product-lines] ${path} failed validation:\n${issues}`);
  }

  cachedProductLines = parsed.data;
  return cachedProductLines;
}

export function getPublicProductLines(): PublicProductLine[] {
  return toPublicProductLines(getProductLinesConfig());
}
