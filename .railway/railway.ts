import { defineRailway, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const verticalflashVolume = volume("verticalflash-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "ams", sizeMB: 50000 });
  const VerticalFlash = service("VerticalFlash", {
    replicas: { "ams": 1 },
    networking: { privateNetworkEndpoint: "verticalflash" },
    volumeMounts: { "/data": verticalflashVolume },
    env: { ADNOVA_DATABASE_URL: preserve(), APIFY_API_TOKEN: preserve(), BASIC_AUTH_PASSWORD: preserve(), BASIC_AUTH_USER: preserve(), DATABASE_URL: preserve(), DATA_DIR: preserve(), GEMINI_API_KEY: preserve(), RAILPACK_DEPLOY_APT_PACKAGES: preserve(), SOCIAL_METRICS_DATABASE_URL: preserve(), TIKHUB_API_KEY: preserve() },
  });

  // Weekly refresh of Weekly Ads/Static Ads (+ Ad Insights category pages,
  // same `ads` table), Weekly Trending Content, and Search by Hashtag —
  // see scripts/weekly-sync.ts. A separate service (not a route on the
  // main app) since a full run makes 300+ sequential Apify calls and can
  // run for hours, far past the main app's request-level timeouts. Mounts
  // the same volume as the main service so Facebook ad creative it
  // downloads locally is visible to the main app's image-serving route.
  const weeklySync = service("weekly-sync", {
    replicas: { "ams": 1 },
    start: "npm run cron:weekly-sync",
    deploy: { cronSchedule: "30 23 * * 0", restartPolicyType: "NEVER" },
    volumeMounts: { "/data": verticalflashVolume },
    env: { APIFY_API_TOKEN: preserve(), DATABASE_URL: preserve(), DATA_DIR: preserve() },
  });

  return project("VerticalFlash", {
    resources: [VerticalFlash, weeklySync, verticalflashVolume],
  });
});
