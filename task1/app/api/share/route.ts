import { NextResponse } from "next/server";
import { newShareId, putShare } from "@/lib/shareStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Fallback-share upload. Only reached on desktop / browsers without file-level
 * Web Share — mobile never calls this, so the common path stays fully local.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }
  if (image.type && image.type !== "image/png") {
    return NextResponse.json({ error: "Expected a PNG" }, { status: 415 });
  }

  const clip = (v: FormDataEntryValue | null, max: number) =>
    typeof v === "string" ? v.slice(0, max) : "";

  const og = form.get("og");
  const ogBuffer =
    og instanceof File && og.size > 0 && og.size <= MAX_BYTES ? await og.arrayBuffer() : null;

  try {
    const record = await putShare(
      {
        id: newShareId(),
        name: clip(form.get("name"), 40),
        title: clip(form.get("title"), 80),
        template: clip(form.get("template"), 40),
      },
      await image.arrayBuffer(),
      ogBuffer,
    );

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      id: record.id,
      shareUrl: `${origin}/share/${record.id}`,
      imageUrl: record.imageUrl,
    });
  } catch (error) {
    console.error("share upload failed", error);
    // Report the actual cause. A bare "Upload failed" forces a trip through the
    // Vercel logs to answer the only question that matters here: did the Blob
    // token reach the function, or did Blob itself reject the write?
    return NextResponse.json(
      {
        error: "Upload failed",
        reason: error instanceof Error ? error.message : String(error),
        // Presence only — never the value.
        blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      },
      { status: 500 },
    );
  }
}
