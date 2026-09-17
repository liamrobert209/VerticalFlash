import postgres from "postgres";

// Read-only connection to a third, separate Postgres database — Ocushield's
// own account performance (facebook_posts/instagram_posts/*_daily_insights),
// refreshed daily by an external sheet-sync process this app doesn't
// control. Same posture as adnova-db.ts's connection: nothing here ever
// writes to it. Confirmed via direct introspection: 4 tables, no id column
// on either post table (display-only usage, no deep-linkable single-post
// page needed).

let socialMetricsDb: ReturnType<typeof postgres> | null = null;

export function getSocialMetricsDb() {
  if (!socialMetricsDb) {
    const url = process.env.SOCIAL_METRICS_DATABASE_URL;
    if (!url) {
      throw new Error(
        "SOCIAL_METRICS_DATABASE_URL is not set — add it to .env.local to enable Content Insights' Facebook/Instagram post data"
      );
    }
    socialMetricsDb = postgres(url, { max: 5, idle_timeout: 20, transform: postgres.camel });
  }
  return socialMetricsDb;
}

export function socialMetricsConfigured(): boolean {
  return !!process.env.SOCIAL_METRICS_DATABASE_URL;
}
