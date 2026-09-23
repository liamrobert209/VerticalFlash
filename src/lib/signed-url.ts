import { createHmac, timingSafeEqual } from "crypto";

// Lets us hand a short-lived, unauthenticated URL to an external API
// (Higgsfield) that needs to fetch one of our own images over HTTP —
// everything else in this app sits behind Basic Auth (see middleware.ts),
// and external services can't supply those credentials. The token is a
// self-contained HMAC-signed {resource, expiry} pair, so verifying it needs
// no server-side state (works across restarts/instances) — same idea as an
// S3 presigned URL. `resource` is never a filesystem path itself; the
// serving route (api/public/asset/[token]) maps it to a real path through
// its own allowlist.

function secret(): string {
  const s = process.env.PUBLIC_ASSET_SECRET;
  if (!s) {
    throw new Error(
      "PUBLIC_ASSET_SECRET is not configured — add it to .env.local (openssl rand -hex 32)"
    );
  }
  return s;
}

function publicBaseUrl(): string {
  const base = process.env.APP_PUBLIC_URL;
  if (!base) {
    throw new Error(
      "APP_PUBLIC_URL is not configured — add it to .env.local (e.g. https://verticalflash-production.up.railway.app)"
    );
  }
  return base;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export interface SignedAsset {
  token: string;
  url: string;
  expiresAt: number;
}

export function signAssetUrl(resource: string, ttlSeconds: number): SignedAsset {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payloadB64 = Buffer.from(`${resource}|${expiresAt}`, "utf8").toString("base64url");
  const token = `${payloadB64}.${sign(payloadB64)}`;
  return { token, url: `${publicBaseUrl()}/api/public/asset/${token}`, expiresAt };
}

export function verifyAssetToken(token: string): { resource: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;

  const payloadB64 = token.slice(0, dot);
  const suppliedSig = Buffer.from(token.slice(dot + 1));
  const expectedSig = Buffer.from(sign(payloadB64));
  if (suppliedSig.length !== expectedSig.length || !timingSafeEqual(suppliedSig, expectedSig)) {
    return null;
  }

  const [resource, expStr] = Buffer.from(payloadB64, "base64url").toString("utf8").split("|");
  const expiresAt = Number(expStr);
  if (!resource || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { resource };
}
