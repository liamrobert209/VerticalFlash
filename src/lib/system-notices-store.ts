import { getDb } from "./db";

export interface SystemNotice {
  id: string;
  source: string;
  message: string;
  createdAt: string;
}

// Best-effort by design, same reasoning as recordQaOutcome (qa-outcomes-
// store.ts) — a notice failing to persist should never mask or throw over
// the real error it's trying to surface. Callers should catch around this
// themselves rather than let it interrupt their own error handling.
export async function recordSystemNotice(source: string, message: string): Promise<void> {
  const sql = getDb();
  await sql`insert into system_notices (source, message) values (${source}, ${message})`;
}

export async function listUndismissedNotices(): Promise<SystemNotice[]> {
  const sql = getDb();
  const rows = await sql`
    select id, source, message, created_at
    from system_notices
    where dismissed_at is null
    order by created_at desc
    limit 20
  `;
  return rows.map((r) => ({
    id: r.id as string,
    source: r.source as string,
    message: r.message as string,
    createdAt: r.createdAt as string,
  }));
}

export async function dismissSystemNotice(id: string): Promise<boolean> {
  const sql = getDb();
  const result = await sql`update system_notices set dismissed_at = now() where id = ${id} and dismissed_at is null`;
  return result.count > 0;
}
