import { defineRailway, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const verticalflashVolume = volume("verticalflash-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "ams", sizeMB: 50000 });
  const VerticalFlash = service("VerticalFlash", {
    replicas: { "ams": 1 },
    networking: { privateNetworkEndpoint: "verticalflash" },
    volumeMounts: { "/data": verticalflashVolume },
    // APP_PUBLIC_URL, HF_CREDENTIALS, and PUBLIC_ASSET_SECRET were live on
    // this service but missing here -- discovered because `railway config
    // plan` was about to delete all three as "unmanaged." All three are real
    // and load-bearing (src/lib/signed-url.ts, src/lib/higgsfield.ts): the
    // signed-URL HMAC secret + this app's own public base URL (used to hand
    // Higgsfield a fetchable image URL despite everything else sitting
    // behind Basic Auth), and the Higgsfield API key itself for the Static
    // Ad Generator's AI text-overlay path.
    env: { ADNOVA_DATABASE_URL: preserve(), APIFY_API_TOKEN: preserve(), APP_PUBLIC_URL: preserve(), BASIC_AUTH_PASSWORD: preserve(), BASIC_AUTH_USER: preserve(), DATABASE_URL: preserve(), DATA_DIR: preserve(), GEMINI_API_KEY: preserve(), HF_CREDENTIALS: preserve(), PUBLIC_ASSET_SECRET: preserve(), RAILPACK_DEPLOY_APT_PACKAGES: preserve(), SOCIAL_METRICS_DATABASE_URL: preserve(), TIKHUB_API_KEY: preserve() },
  });

  // Triggers the weekly refresh of Weekly Ads/Static Ads (+ Ad Insights
  // category pages, same `ads` table), Weekly Trending Content, and Search
  // by Hashtag — the actual sync logic lives in src/lib/weekly-sync-run.ts
  // and runs inside the MAIN app process (see /api/cron/weekly-sync), not
  // here. This service is now just the cron trigger: one authenticated
  // curl to that route.
  //
  // Previously ran the sync itself as its own standalone script, with its
  // own copy of every credential the logic needs (DB, Apify) and no access
  // to the main app's persistent volume — Railway volumes only attach to
  // one service's live deployment at a time (confirmed empirically: a
  // prior attempt to also mount verticalflash-volume here detached it from
  // the main VerticalFlash service instead, breaking its
  // product-lines.config.json/product-images/static-ads storage). That
  // second, independently-configured environment silently drifted out of
  // sync with the main one — DATABASE_URL went missing here at some point,
  // crashing every run with nothing to catch it. Routing through the main
  // app instead means there's only one place with real credentials and
  // volume access, so nothing to keep in sync a second time.
  //
  // The curl itself returns almost immediately (the route kicks the run
  // off in the background rather than blocking the response — see its
  // header comment) — restartPolicyType stays NEVER since this container's
  // job is done the moment curl exits, regardless of how long the actual
  // sync takes in the main service.
  const weeklySync = service("weekly-sync", {
    replicas: { "ams": 1 },
    start:
      'curl -sf -X POST -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASSWORD" https://verticalflash-production.up.railway.app/api/cron/weekly-sync',
    deploy: { cronSchedule: "0 2 * * 1-5", restartPolicyType: "NEVER" },
    env: { BASIC_AUTH_USER: preserve(), BASIC_AUTH_PASSWORD: preserve() },
  });

  // This app had zero staleness monitoring -- weekly-sync crashing (as it
  // did, see the comment above) was only ever visible by opening the app.
  // Same curl-trigger architecture as weekly-sync itself, checked daily
  // (not just weekdays) since a weekend gap is exactly what the route's own
  // 78h default threshold is sized to tolerate.
  const deadmanCheck = service("deadman-check", {
    replicas: { "ams": 1 },
    start:
      'curl -sf -X POST -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASSWORD" https://verticalflash-production.up.railway.app/api/cron/deadman-check',
    deploy: { cronSchedule: "30 2 * * *", restartPolicyType: "NEVER" },
    env: { BASIC_AUTH_USER: preserve(), BASIC_AUTH_PASSWORD: preserve() },
  });

  return project("VerticalFlash", {
    resources: [VerticalFlash, weeklySync, deadmanCheck, verticalflashVolume],
  });
});
