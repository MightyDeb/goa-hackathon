import { getCardImage } from "@/lib/shareStore";

export const runtime = "nodejs";

/**
 * The public URL for a generated card, and the one X's crawler fetches as the
 * OG image. Reads from Vercel Blob (in either access mode) using the server's
 * token, or from local disk in development — so a private Blob store still
 * yields a publicly viewable preview.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await getCardImage(id);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
