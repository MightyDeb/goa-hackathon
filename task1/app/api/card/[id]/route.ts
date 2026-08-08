import { getLocalImage } from "@/lib/shareStore";

export const runtime = "nodejs";

/** Serves locally-stored share images in dev. In production Vercel Blob serves them directly. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await getLocalImage(id);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
