import postgres from "postgres";

// One Postgres connection pool per process, created lazily and reused —
// same "cache the expensive setup, not the data" pattern as
// getBrandConfig()/getProductLinesConfig(). Holds competitor/saved-accounts
// data, content records, and brand-asset metadata: the only relational data
// in this app, and deliberately the only part meant to be reachable by
// other services (scrapers, BI tools) beyond this Next.js app itself.
//
// Schema lives in supabase/migrations/, not here — this file only connects.
// Use the Supabase pooled connection string (Supavisor, transaction mode)
// for DATABASE_URL; a long-lived Node server making frequent short queries
// should not use the direct connection, which has a much lower connection
// limit.

let sql: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (sql) return sql;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "[db] DATABASE_URL is not set. Copy your Supabase project's pooled connection string into .env.local (see .env.example)."
    );
  }

  sql = postgres(connectionString, {
    // Supavisor's pooler is already pooling connections server-side; keep
    // this process's own pool small so many dev-server/API-route instances
    // don't each open a large pool against it.
    max: 10,
    idle_timeout: 20,
    // snake_case columns in, camelCase objects out — every store built on
    // getDb() works with plain camelCase TS objects, never raw column names.
    transform: postgres.camel,
  });
  return sql;
}
