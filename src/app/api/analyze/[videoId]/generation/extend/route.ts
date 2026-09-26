import { NextRequest, NextResponse } from "next/server";

// Extending an existing clip was an Omni-only capability (continue the
// final seconds of a real source clip) — Seedance (see generate-clip.ts's
// runGeneration) is text-to-video only, with no source-clip input at all,
// so there's no way to fulfill this anymore. Kept as a route (rather than
// deleted) so the existing "Extend" UI action gets a clear, immediate
// explanation instead of a 404 or — worse — silently doing the ffmpeg
// scratch-cut work first and only failing deep inside generation.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  if (!/^[\w-]+$/.test(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }
  return NextResponse.json(
    {
      error:
        "Extending an existing clip isn't supported with Seedance (text-to-video only) — use Generate instead",
    },
    { status: 400 }
  );
}
