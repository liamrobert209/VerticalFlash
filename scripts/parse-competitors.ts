// One-off parser: turns the docx-converted competitor doc (scripts/data/competitor-source.txt)
// into structured JSON (scripts/data/competitor-seed-data.json). Run once;
// the output is what scripts/import-competitors.ts actually loads.
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { CompetitorCategoryId, CompetitorRegion } from "../src/lib/competitor-schema";

const SOURCE = join(__dirname, "data/competitor-source.txt");
const OUT = join(__dirname, "data/competitor-seed-data.json");

const SECTION_TO_CATEGORY: Record<string, CompetitorCategoryId> = {
  "Anti-Blue Light Glasses / Eyewear": "glasses",
  "Anti-Blue Light Screen Protectors": "screen_protectors",
  "Privacy Filters for Monitors & Laptops": "privacy_filters",
  "Supplements (Eye Health & Sleep)": "supplements",
  "Anti-Blue Light Bulbs": "bulbs",
  "Red Light Therapy Devices": "red_light_therapy",
};

const REGION_MAP: Record<string, CompetitorRegion> = {
  "United Kingdom": "uk",
  Europe: "eu",
  "United States": "us",
};

interface RawRow {
  rank: number;
  name: string;
  website: string;
  instagram: string;
  facebook: string;
  otherSocial: string;
  positioning: string;
  category: CompetitorCategoryId;
  region: CompetitorRegion;
}

// "@barnerbrand · ~147k" / "@spigen ~0.8-1M*; @spigenuk ~27.6k" -> best-effort handle + follower count
function parseHandleAndFollowers(text: string): { handle: string | null; followers: number | null } {
  if (!text || /not found/i.test(text)) return { handle: null, followers: null };
  const handleMatch = text.match(/@[\w.]+/);
  const handle = handleMatch ? handleMatch[0].replace(/^@/, "") : null;
  const numMatch = text.match(/([\d.]+)\s*([kKmM])/);
  let followers: number | null = null;
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    const mult = numMatch[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
    followers = Math.round(n * mult);
  }
  return { handle, followers };
}

// TikTok status from the "Other social" column: "TikTok @handle ~1.5k" (confirmed),
// "TikTok present" / "TikTok active" (present_unconfirmed), blank/other (not_found).
// Handles never contain dots on TikTok — a few source rows wrote the website
// domain into the handle by mistake (e.g. "@barnerbrand.com"); strip from
// the first dot so scan-readiness reflects a real, usable handle.
function parseTikTok(otherSocial: string): { handle: string | null; status: "confirmed" | "present_unconfirmed" | "not_found" } {
  const tiktokMatch = otherSocial.match(/TikTok\s*@([\w.]+)/i);
  if (tiktokMatch) return { handle: tiktokMatch[1].split(".")[0], status: "confirmed" };
  if (/tiktok/i.test(otherSocial)) return { handle: null, status: "present_unconfirmed" };
  return { handle: null, status: "not_found" };
}

function parse(): RawRow[] {
  const lines = readFileSync(SOURCE, "utf8").split("\n").map((l) => l.trim());
  const rows: RawRow[] = [];
  let currentCategory: CompetitorCategoryId | null = null;
  let currentRegion: CompetitorRegion | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const sectionMatch = line.match(/^\d+\.\s+(.+)$/);
    if (sectionMatch && SECTION_TO_CATEGORY[sectionMatch[1]]) {
      currentCategory = SECTION_TO_CATEGORY[sectionMatch[1]];
      i++;
      continue;
    }
    const regionMatch = line.match(/^(United Kingdom|Europe|United States)\s*—\s*top\s*\d+$/);
    if (regionMatch) {
      currentRegion = REGION_MAP[regionMatch[1]];
      // Skip the region header + the 7 column-label lines that follow
      i += 8;
      continue;
    }
    // A row starts with a bare rank number (1-10) on its own line
    if (currentCategory && currentRegion && /^\d{1,2}$/.test(line) && Number(line) <= 10) {
      const rank = Number(line);
      const [name, website, instagram, facebook, otherSocial, positioning] = lines.slice(i + 1, i + 7);
      if (name && positioning) {
        rows.push({
          rank,
          name,
          website: website === "—" || website === "not found" ? "" : website,
          instagram,
          facebook,
          otherSocial,
          positioning,
          category: currentCategory,
          region: currentRegion,
        });
      }
      i += 7;
      continue;
    }
    if (line === "Cross-category direct competitors") break;
    i++;
  }
  return rows;
}

const rawRows = parse();
console.log(`Parsed ${rawRows.length} rows`);

const CROSS_CATEGORY_NAMES = new Set([
  "BlockBlueLight",
  "Bon Charge",
  "CurrentBody",
  "CurrentBody Skin",
  "PanzerGlass",
  "Vitabiotics (Visionace)",
  "MacuShield",
  "Nutrof Total (Théa)",
]);

const singleRows = rawRows.map((r) => {
  const ig = parseHandleAndFollowers(r.instagram);
  const fb = parseHandleAndFollowers(r.facebook);
  const tiktok = parseTikTok(r.otherSocial);
  return {
    name: r.name,
    region: r.region,
    website: r.website ? (r.website.startsWith("http") ? r.website : `https://${r.website}`) : null,
    instagramHandle: ig.handle,
    instagramFollowers: ig.followers,
    facebookHandle: fb.handle,
    facebookFollowers: fb.followers,
    tiktokHandle: tiktok.handle,
    tiktokStatus: tiktok.status,
    positioning: r.positioning,
    crossCategoryFlag: CROSS_CATEGORY_NAMES.has(r.name),
    note: `Rank #${r.rank} in ${r.region.toUpperCase()} for ${r.category} (source doc, ${new Date().getFullYear()}).`,
    category: r.category,
  };
});

// The same brand can rank in more than one category within the same region
// (e.g. PanzerGlass UK: both screen_protectors and privacy_filters) — that's
// one real competitor account, not two. Merge by (name, region), union the
// categories, and keep every rank note.
const merged = new Map<string, (typeof singleRows)[number] & { categories: CompetitorCategoryId[]; notes: string[] }>();
for (const r of singleRows) {
  const key = `${r.name}::${r.region}`;
  const existing = merged.get(key);
  if (existing) {
    if (!existing.categories.includes(r.category)) existing.categories.push(r.category);
    existing.notes.push(r.note);
    existing.crossCategoryFlag = existing.crossCategoryFlag || r.crossCategoryFlag || existing.categories.length > 1;
  } else {
    merged.set(key, { ...r, categories: [r.category], notes: [r.note], crossCategoryFlag: r.crossCategoryFlag });
  }
}

const seedData = Array.from(merged.values()).map((row) => ({
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
  categories: row.categories,
  notes: row.notes.join(" "),
}));

writeFileSync(OUT, JSON.stringify(seedData, null, 2));
console.log(`Wrote ${seedData.length} rows (from ${rawRows.length} raw category rows) to ${OUT}`);

const byStatus = seedData.reduce<Record<string, number>>((acc, r) => {
  acc[r.tiktokStatus] = (acc[r.tiktokStatus] ?? 0) + 1;
  return acc;
}, {});
console.log("TikTok status breakdown:", byStatus);
