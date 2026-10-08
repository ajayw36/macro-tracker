// Estimate macros from a meal photo and/or description.
//
// A Route Handler rather than a Server Function because of the image: Server
// Function bodies are capped at 1MB by default, Route Handler bodies are not.
// The client downscales before upload, so requests land around 150KB.

import { NextRequest, NextResponse } from "next/server";
import {
  analyzeMeal,
  isSupportedMediaType,
  type SupportedMediaType,
} from "@/lib/nutrition";
import { isAuthorized } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Generous ceiling for an already-downscaled image; a raw phone photo would be
// rejected here rather than silently truncated by the proxy body buffer.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const description = (form.get("description") as string | null)?.trim() ?? "";
    const file = form.get("image");

    let image: { data: string; mediaType: SupportedMediaType } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { ok: false, error: "Image is too large. Try a smaller photo." },
          { status: 413 },
        );
      }
      const mediaType = pickMediaType(file.type);
      if (!mediaType) {
        return NextResponse.json(
          { ok: false, error: `Unsupported image type: ${file.type || "unknown"}` },
          { status: 415 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      image = { data: buf.toString("base64"), mediaType };
    }

    if (!image && !description) {
      return NextResponse.json(
        { ok: false, error: "Add a photo or describe the meal." },
        { status: 400 },
      );
    }

    const estimate = await analyzeMeal({ image, description });
    return NextResponse.json({ ok: true, estimate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "analyze_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function pickMediaType(type: string): SupportedMediaType | null {
  const t = type.toLowerCase();
  return isSupportedMediaType(t) ? t : null;
}
