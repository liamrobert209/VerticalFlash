// One-off seed: loads scripts/data/competitor-seed-data.json (produced by
// scripts/parse-competitors.ts from your competitor doc) into the
// competitor_accounts table. Safe to re-run — skips any (name, region)
// pair that's already there.
import { readFileSync } from "fs";
import { join } from "path";
import { createCompetitor, listCompetitors } from "../src/lib/competitor-store";
import { CATEGORY_TO_PRODUCT_LINES, type CompetitorCategoryId } from "../src/lib/competitor-schema";

interface SeedRow {
  name: string;
  region: "uk" | "eu" | "us";
  website: string | null;
  instagramHandle: string | null;
  instagramFollowers: number | null;
  facebookHandle: string | null;
  facebookFollowers: number | null;
  tiktokHandle: string | null;
  tiktokStatus: "confirmed" | "present_unconfirmed" | "not_found";
  positioning: string;
  crossCategoryFlag: boolean;
  categories: CompetitorCategoryId[];
  notes: string;
}

async function main() {
  const seedPath = join(__dirname, "data/competitor-seed-data.json");
  const rows: SeedRow[] = JSON.parse(readFileSync(seedPath, "utf8"));

  const existing = await listCompetitors({});
  const existingKeys = new Set(existing.map((a) => `${a.name}::${a.region}`));

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const key = `${row.name}::${row.region}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    const productLineIds = Array.from(
      new Set(row.categories.flatMap((c) => CATEGORY_TO_PRODUCT_LINES[c] ?? []))
    );
    await createCompetitor({
      name: row.name,
      region: row.region,
      website: row.website,
      instagramHandle: row.instagramHandle,
      instagramFollowers: row.instagramFollowers,
      facebookHandle: row.facebookHandle,
      facebookFollowers: row.facebookFollowers,
      tiktokHandle: row.tiktokHandle,
      tiktokStatus: row.tiktokStatus,
      positioning: row.positioning,
      crossCategoryFlag: row.crossCategoryFlag,
      notes: row.notes,
      categories: row.categories,
      productLineIds,
    });
    created++;
  }

  console.log(`Imported ${created} competitors, skipped ${skipped} already present.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
