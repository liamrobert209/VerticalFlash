// TikTok's own CDN signs media URLs with a built-in `x-expires` query
// param (a Unix timestamp, in seconds) — once that passes, the CDN starts
// returning a real 403 for the URL, permanently (confirmed via a direct
// fetch, not an assumption). Scraped cover images/avatars go dead this way
// within days of being synced; the underlying video keeps working since
// `tiktokUrl` is a plain permalink, not a signed asset URL.
export function isTiktokCdnUrlExpired(url: string | null | undefined): boolean {
  if (!url) return false;
  const match = url.match(/[?&]x-expires=(\d+)/);
  if (!match) return false;
  const expiresAtMs = Number(match[1]) * 1000;
  return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
}
