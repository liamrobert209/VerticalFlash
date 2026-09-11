import postgres from "postgres";

// Read-only connection to the separate creative-analytics Postgres database
// (not the app's own Supabase project — see ADNOVA_DATABASE_URL in
// .env.example) that already holds currently-running ads with performance
// tags. Ad Insights (phase 6) reads from here in addition to this app's own
// `ads` table; nothing in this app ever writes to it.

let adnovaDb: ReturnType<typeof postgres> | null = null;

export function getAdnovaDb() {
  if (!adnovaDb) {
    const url = process.env.ADNOVA_DATABASE_URL;
    if (!url) {
      throw new Error(
        "ADNOVA_DATABASE_URL is not set — add it to .env.local to enable Ad Insights' creative-analytics data"
      );
    }
    adnovaDb = postgres(url, { max: 5, idle_timeout: 20, transform: postgres.camel });
  }
  return adnovaDb;
}

export function adnovaConfigured(): boolean {
  return !!process.env.ADNOVA_DATABASE_URL;
}
