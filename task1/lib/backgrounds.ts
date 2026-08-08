/**
 * Template background images.
 *
 * These are the one thing in the render path that needs the network, so they
 * are handled carefully:
 *
 *  - Pre-cropped and re-encoded to WebP at exactly the card's design size
 *    (1080x1350), so there is no runtime resampling and no wasted bytes.
 *  - The card paints immediately using each template's fallback colour; the
 *    image is swapped in on arrival. A slow image never blocks first paint.
 *  - Decoded once into an ImageBitmap, then baked into the cached static layer
 *    like every other backdrop — so per-frame cost stays unchanged.
 */

const loaded = new Map<string, ImageBitmap>();
const inflight = new Map<string, Promise<ImageBitmap | null>>();

/** Synchronous accessor for the renderer — null until the image has landed. */
export function getBackground(src: string): ImageBitmap | null {
  return loaded.get(src) ?? null;
}

export function loadBackground(src: string): Promise<ImageBitmap | null> {
  const hit = loaded.get(src);
  if (hit) return Promise.resolve(hit);

  const pending = inflight.get(src);
  if (pending) return pending;

  const task = (async () => {
    try {
      // An <img> load, not fetch(): the document preloads these with
      // `as="image"`, and only a matching request destination reuses the
      // preloaded response instead of issuing a second download.
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      await img.decode();
      const bitmap = await createImageBitmap(img);
      loaded.set(src, bitmap);
      return bitmap;
    } catch (error) {
      console.error("background load failed", src, error);
      return null;
    } finally {
      inflight.delete(src);
    }
  })();

  inflight.set(src, task);
  return task;
}
