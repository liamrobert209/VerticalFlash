import { NextRequest, NextResponse } from "next/server";
import { createUploadedReferenceAd } from "@/lib/ads-store";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// PNG/JPEG only, matching what the Static Ad Generator's Gemini call
// actually accepts as an inline image reference — same restriction the
// user asked for explicitly, not an arbitrary narrowing.
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
};

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (15MB max)" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  const productLineId = form.get("productLineId");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!(file.type in ALLOWED_MIME_TYPES)) {
    return NextResponse.json({ error: "Only PNG or JPEG images are supported" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ad = await createUploadedReferenceAd({
      productLineId: typeof productLineId === "string" && productLineId.trim() ? productLineId.trim() : null,
      originalFilename: file.name,
      mimeType: file.type,
      buffer,
    });
    return NextResponse.json({ ad }, { status: 201 });
  } catch (error) {
    console.error("Failed to save uploaded reference image:", error);
    return NextResponse.json({ error: "Could not save the uploaded image" }, { status: 500 });
  }
}
