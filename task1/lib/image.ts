/**
 * Photo intake. The whole point of this file is that nothing here touches the
 * network and nothing blocks the main thread longer than it has to:
 *
 *  - `createImageBitmap(File)` decodes off the main thread, so a 12MP photo
 *    doesn't freeze the UI the way `new Image()` + onload does.
 *  - We downscale once, up front, to a working bitmap. Every later drag frame,
 *    zoom and template switch redraws from that small bitmap, not the original.
 *  - heic2any (~1MB) is dynamically imported and only when native decoding has
 *    actually failed — the 95% of users on JPEG/PNG never download it.
 */

/** Working resolution. 1600px still oversamples a 820px slot at 2x export. */
const MAX_WORKING_DIM = 1600;

export type PhotoLoadResult = {
  bitmap: ImageBitmap;
  /** Wall-clock decode time, surfaced in the UI's timing readout. */
  ms: number;
  usedHeicFallback: boolean;
};

function isProbablyHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

async function decodeNative(blob: Blob): Promise<ImageBitmap> {
  // `from-image` honours EXIF orientation — without it, portrait iPhone shots
  // land sideways in the slot.
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

/** Last-resort decode path for browsers that reject Blobs in createImageBitmap. */
async function decodeViaImgElement(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0] : (out as Blob);
}

async function downscale(src: ImageBitmap, maxDim: number): Promise<ImageBitmap> {
  const longest = Math.max(src.width, src.height);
  if (longest <= maxDim) return src;

  const ratio = maxDim / longest;
  const w = Math.round(src.width * ratio);
  const h = Math.round(src.height * ratio);

  try {
    // Fast path: the browser resamples during bitmap creation, off-thread.
    const scaled = await createImageBitmap(src, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "high",
    });
    src.close?.();
    return scaled;
  } catch {
    // Safari historically ignores/rejects resize options — do it on a canvas.
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext("2d");
    if (!ctx) return src;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    const scaled = await createImageBitmap(canvas as CanvasImageSource);
    src.close?.();
    return scaled;
  }
}

export async function loadPhoto(file: File): Promise<PhotoLoadResult> {
  const started = performance.now();
  let usedHeicFallback = false;
  let raw: ImageBitmap;

  try {
    raw = await decodeNative(file);
  } catch {
    if (isProbablyHeic(file)) {
      // iOS Safari can usually decode HEIC natively, which is why this is a
      // fallback and not the first thing we try.
      usedHeicFallback = true;
      raw = await decodeNative(await decodeHeic(file));
    } else {
      raw = await decodeViaImgElement(file);
    }
  }

  const bitmap = await downscale(raw, MAX_WORKING_DIM);
  return { bitmap, ms: performance.now() - started, usedHeicFallback };
}

export const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/*";

/** Canvas → File, for `navigator.share({ files })` and for the download anchor. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Card export failed"))),
      type,
      quality,
    );
  });
}
