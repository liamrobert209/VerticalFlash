import { defineRailway, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const verticalflashVolume = volume("verticalflash-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "ams", sizeMB: 50000 });
  const VerticalFlash = service("VerticalFlash", {
    replicas: { "ams": 1 },
    networking: { privateNetworkEndpoint: "verticalflash" },
    volumeMounts: { "/data": verticalflashVolume },
    env: { ADNOVA_DATABASE_URL: preserve(), APIFY_API_TOKEN: preserve(), BASIC_AUTH_PASSWORD: preserve(), BASIC_AUTH_USER: preserve(), DATABASE_URL: preserve(), DATA_DIR: preserve(), GEMINI_API_KEY: preserve(), RAILPACK_DEPLOY_APT_PACKAGES: preserve(), SOCIAL_METRICS_DATABASE_URL: preserve(), TIKHUB_API_KEY: preserve() },
  });

  // Refresh of Weekly Ads/Static Ads (+ Ad Insights category pages, same
  // `ads` table), Weekly Trending Content, and Search by Hashtag — see
  // scripts/weekly-sync.ts. Runs every weekday at 2am UTC. A separate
  // service (not a route on the main app) since a full run makes 300+
  // sequential Apify calls and can run for hours, far past the main app's
  // request-level timeouts.
  //
  // Deliberately NOT mounting verticalflash-volume here: this Railway
  // volume only supports being attached to one service's live deployment
  // at a time (confirmed empirically — attaching it to this service
  // detached it from the main VerticalFlash service, breaking its
  // product-lines.config.json/product-images/static-ads storage). The
  // main app keeping the volume is far more important than this cron
  // job's local ad-creative cache — without it, ad creative it downloads
  // just isn't locally cached (the main app's image-serving route falls
  // back to redirecting at the remote CDN URL instead), which is a minor
  // perf/reliability regression, not a correctness one. No DATA_DIR env
  // var either, so file writes land on this container's own ephemeral
  // disk rather than silently degrading DATA_ROOT elsewhere.
  const weeklySync = service("weekly-sync", {
    replicas: { "ams": 1 },
    start: "npm run cron:weekly-sync",
    deploy: { cronSchedule: "0 2 * * 1-5", restartPolicyType: "NEVER" },
    env: { APIFY_API_TOKEN: preserve(), DATABASE_URL: preserve() },
  });

  return project("VerticalFlash", {
    resources: [VerticalFlash, weeklySync, verticalflashVolume],
  });
});
