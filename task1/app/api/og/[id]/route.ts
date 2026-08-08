import { getOgImage } from "@/lib/shareStore";

export const runtime = "nodejs";

/**
 * The 1200x630 link-preview image X and friends actually fetch. Kept separate
 * from /api/card/[id] so the share page can still show the full 4:5 card.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await getOgImage(id);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(image, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
