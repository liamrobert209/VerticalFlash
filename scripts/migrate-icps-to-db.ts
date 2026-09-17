// One-off migration: copies product-lines.config.json's `icps` array (the
// old storage location) into the icp_profiles table (the new one) — run
// manually once per environment, same convention as
// scripts/import-competitors.ts. Safe to re-run: upsertIcpProfile() is a
// plain `insert ... on conflict (id) do update`, so running this twice
// just re-writes the same rows from the same source file.
//
// NOTE: can't use getProductLinesConfig() (src/lib/config.ts) for this —
// now that `icps` has been removed from ProductLinesConfigZ (ICP content
// lives in the DB going forward), Zod's default "strip unknown keys"
// behavior means the parsed config no longer carries `icps` even though
// it's still present in the JSON file on disk. So this script reads the
// file directly, but mirrors config.ts's exact path-resolution rules
// (DATA_DIR / PRODUCT_LINES_CONFIG env vars) so it points at the same file
// the app itself would load.
import { readFileSync } from "fs";
import { isAbsolute, join, resolve } from "path";
import { upsertIcpProfile } from "../src/lib/icp-store";

const DATA_ROOT = resolve(process.env.DATA_DIR ?? process.cwd());
const PRODUCT_LINES_CONFIG_FILENAME = "product-lines.config.json";

function productLinesConfigPath(): string {
  const fromEnv = process.env.PRODUCT_LINES_CONFIG;
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  }
  return join(DATA_ROOT, PRODUCT_LINES_CONFIG_FILENAME);
}

async function main() {
  const path = productLinesConfigPath();
  const raw = JSON.parse(readFileSync(path, "utf8")) as { icps?: unknown };
  const icps = raw.icps;
  if (!Array.isArray(icps) || icps.length === 0) {
    console.log(`No \`icps\` array found in ${path} — nothing to migrate.`);
    process.exit(0);
  }

  let migrated = 0;
  for (const icp of icps as Array<Record<string, unknown>>) {
    const { id, ...data } = icp;
    if (typeof id !== "string") {
      console.warn("Skipping icp entry with no string id:", icp);
      continue;
    }
    await upsertIcpProfile(id, data as Parameters<typeof upsertIcpProfile>[1]);
    migrated++;
  }

  console.log(`Migrated ${migrated} ICP profile(s) from ${path} into icp_profiles.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("ICP migration failed:", error);
  process.exit(1);
});
