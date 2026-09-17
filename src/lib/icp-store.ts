import type postgres from "postgres";
import { getDb } from "./db";
import { IcpProfileZ, emptyIcpProfile, type IcpProfile } from "./product-lines";

// icp_profiles: direct user-edited content (the Settings → Product Lines
// board), so writes here are plain last-write-wins upserts — no
// sighting/merge semantics like ads-store.ts's recordAdSighting needs for
// data arriving from repeated external scrapes.

// postgres.js does not auto-decode jsonb columns — same convention as
// ads-store.ts's parseAd: the 5 ranked-list columns come back as raw JSON
// text and need an explicit parse before they reach IcpProfileZ's checks.
function parseIcpProfile(row: Record<string, unknown>): IcpProfile {
  const parseJsonb = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);
  return IcpProfileZ.parse({
    id: row.id,
    label: row.label,
    problemsSolved: parseJsonb(row.problemsSolved),
    loves: parseJsonb(row.loves),
    hates: parseJsonb(row.hates),
    purchaseDrivers: parseJsonb(row.purchaseDrivers),
    nearMissObjections: parseJsonb(row.nearMissObjections),
    demographic: row.demographic,
    representativeQuote: row.representativeQuote,
  });
}

// Returns emptyIcpProfile(id) rather than null when no row exists yet, so
// a fresh checkout with zero icp_profiles rows still renders a usable
// (empty) form instead of crashing — see product-lines.ts's resolveIcp.
export async function getIcpProfile(id: string): Promise<IcpProfile | null> {
  const sql = getDb();
  const rows = await sql`select * from icp_profiles where id = ${id}`;
  if (!rows[0]) return emptyIcpProfile(id);
  return parseIcpProfile(rows[0]);
}

export async function listIcpProfiles(): Promise<IcpProfile[]> {
  const sql = getDb();
  const rows = await sql`select * from icp_profiles order by id`;
  return rows.map(parseIcpProfile);
}

export async function upsertIcpProfile(id: string, data: Omit<IcpProfile, "id">): Promise<IcpProfile> {
  const sql = getDb();
  const rows = await sql`
    insert into icp_profiles (
      id, label, problems_solved, loves, hates, purchase_drivers, near_miss_objections,
      demographic, representative_quote
    ) values (
      ${id}, ${data.label},
      ${sql.json(data.problemsSolved as unknown as postgres.JSONValue)},
      ${sql.json(data.loves as unknown as postgres.JSONValue)},
      ${sql.json(data.hates as unknown as postgres.JSONValue)},
      ${sql.json(data.purchaseDrivers as unknown as postgres.JSONValue)},
      ${sql.json(data.nearMissObjections as unknown as postgres.JSONValue)},
      ${data.demographic}, ${data.representativeQuote}
    )
    on conflict (id) do update set
      label = excluded.label,
      problems_solved = excluded.problems_solved,
      loves = excluded.loves,
      hates = excluded.hates,
      purchase_drivers = excluded.purchase_drivers,
      near_miss_objections = excluded.near_miss_objections,
      demographic = excluded.demographic,
      representative_quote = excluded.representative_quote,
      updated_at = now()
    returning *
  `;
  return parseIcpProfile(rows[0]);
}
