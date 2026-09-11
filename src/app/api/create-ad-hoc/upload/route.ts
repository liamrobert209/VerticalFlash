import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { DOWNLOADS_DIR } from "@/lib/paths";

// Uploads an arbitrary creator/ad video file as a new "reference" project —
// treated exactly like a downloaded TikTok video from here on (no .kind in
// its metadata, so readProjectMeta() returns null and the normal analyze
// pipeline runs the real Gemini pass on it, same as any scanned video).
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (500MB max)" }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!VIDEO_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 });
  }

  // adhoc-<timestamp>-<random> avoids the authorHandle_<digits> pattern
  // extractVideoId expects for TikTok downloads, and the pure-numeric ids
  // TikTok posts use — both would otherwise be misread by downstream
  // id-parsing helpers. The random suffix (matching cutdown's own
  // short-<timestamp>-<random> convention) prevents two uploads landing in
  // the same millisecond from clobbering each other's file.
  const videoId = `adhoc-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const filename = `${videoId}.mp4`;

  try {
    await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(join(DOWNLOADS_DIR, filename), buffer);

    const namesPath = join(DOWNLOADS_DIR, ".names.json");
    let names: Record<string, string> = {};
    try {
      names = JSON.parse(await fs.readFile(namesPath, "utf8"));
    } catch {
      // no names file yet
    }
    names[filename] = `Iterate: ${file.name}`.slice(0, 100);
    await fs.writeFile(namesPath, JSON.stringify(names, null, 2));

    return NextResponse.json({ videoId, filename });
  } catch (error) {
    console.error("ad-hoc upload failed:", error);
    return NextResponse.json({ error: "Could not save the uploaded file" }, { status: 500 });
  }
}
