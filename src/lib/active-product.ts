import type { NextRequest } from "next/server";
import { getProductLinesConfig } from "./config";
import { readProjectProductLine } from "./project-product-line";

// Which product line is "active" is per-request state, resolved fresh every
// time from a cookie against the static product-lines config — it must
// NEVER be cached in a module-level variable the way getProductLinesConfig()
// itself is, or two sessions with different active products would race on
// the same server process.

export const ACTIVE_PRODUCT_COOKIE = "vf_active_product";

export function resolveActiveProductLineId(idFromCookie: string | undefined): string {
  const cfg = getProductLinesConfig();
  if (idFromCookie && cfg.productLines.some((p) => p.id === idFromCookie)) {
    return idFromCookie;
  }
  return cfg.defaultProductLineId;
}

// Server components: `cookies()` from next/headers.
export function getActiveProductLineIdFromCookieStore(cookieStore: {
  get(name: string): { value: string } | undefined;
}): string {
  return resolveActiveProductLineId(cookieStore.get(ACTIVE_PRODUCT_COOKIE)?.value);
}

// Route handlers: NextRequest's cookie jar.
export function getActiveProductLineIdFromRequest(request: NextRequest): string {
  return resolveActiveProductLineId(request.cookies.get(ACTIVE_PRODUCT_COOKIE)?.value);
}

// The one precedence rule used by every pipeline route that needs "which
// product line is this video for": an explicit override in the request body
// wins, then the project's own pinned product line (once matching has
// started for it), then the ambient sidebar cookie, then the config default.
// Async because reading the project's pin touches disk.
export async function resolveProductLineForVideo(
  videoId: string,
  request: NextRequest,
  explicitProductLineId?: string | null
): Promise<string> {
  const cfg = getProductLinesConfig();
  if (explicitProductLineId && cfg.productLines.some((p) => p.id === explicitProductLineId)) {
    return explicitProductLineId;
  }
  const pinned = await readProjectProductLine(videoId);
  if (pinned && cfg.productLines.some((p) => p.id === pinned)) {
    return pinned;
  }
  return getActiveProductLineIdFromRequest(request);
}
