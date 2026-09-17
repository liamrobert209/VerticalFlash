import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { extname, join } from "path";
import { getAd } from "@/lib/ads-store";
import { ADS_MEDIA_DIR } from "@/lib/paths";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// One stable URL for an ad's creative regardless of whether it's cached
// locally: serves the local file directly (fast, never expires) when one
// exists, otherwise redirects to the original remote CDN URL (which may
// itself be dead for an ad synced before local caching existed, or one
// whose download failed) rather than every caller needing its own
// local-file-or-remote-url branching logic.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await getAd(id);
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });

  if (ad.creativeLocalFile) {
    const buffer = await fs.readFile(join(ADS_MEDIA_DIR, ad.creativeLocalFile)).catch(() => null);
    if (buffer) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": MIME_TYPES[extname(ad.creativeLocalFile).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }

  if (ad.creativeUrl) {
    return NextResponse.redirect(ad.creativeUrl);
  }

  return NextResponse.json({ error: "No creative available" }, { status: 404 });
}
