import { getBackground } from "./backgrounds";
import { makeCanvas, paintDecor, roundRectPath, withAlpha, type Ctx2D } from "./decor";
import { imageSourcesFor, type FontBook, type LogoLayer, type PhotoSlot, type TemplateConfig, type TextLayer } from "./templates";

export type PhotoTransform = {
  /** Offset from slot centre, in fractions of slot width/height. */
  x: number;
  y: number;
  /** Multiplier on top of the cover-fit scale. 1 = fills the slot exactly. */
  zoom: number;
};

export type CardData = {
  name: string;
  role: string;
  title: string;
  photo: ImageBitmap | HTMLImageElement | null;
  transform: PhotoTransform;
};

export const IDENTITY_TRANSFORM: PhotoTransform = { x: 0, y: 0, zoom: 1 };

/* ------------------------------------------------------------------ *
 * Cached static layers
 *
 * A template's backdrop, decorations and overlays never change once the
 * template is chosen. Baking them into two canvases per (template, scale)
 * turns a template switch — and every drag frame — into two drawImage
 * blits instead of re-running gradients, palm curves and grain noise.
 * ------------------------------------------------------------------ */

type LayerPair = { below: CanvasImageSource; above: CanvasImageSource };

/**
 * LRU-bounded: three preview layers plus the export-scale pair is the working
 * set, and a full-size pair is ~11MB. Without a cap, exporting after a couple
 * of orientation changes would quietly pin >100MB on a mid-range phone.
 */
const MAX_CACHED_LAYERS = 8;
const layerCache = new Map<string, LayerPair>();

function bakeLayers(config: TemplateConfig, scale: number): LayerPair {
  const key = `${config.id}@${scale}`;
  const hit = layerCache.get(key);
  if (hit) {
    // Refresh recency.
    layerCache.delete(key);
    layerCache.set(key, hit);
    return hit;
  }

  // If this template wants an image that hasn't arrived yet, we still bake and
  // draw — with the fallback colour — but we must not cache the result, or the
  // card would stay imageless for the rest of the session.
  const awaitingImage = imageSourcesFor(config).some((src) => getBackground(src) === null);

  const w = Math.round(config.width * scale);
  const h = Math.round(config.height * scale);

  const belowC = makeCanvas(w, h);
  const below = (belowC as HTMLCanvasElement).getContext("2d") as Ctx2D;
  below.scale(scale, scale);
  paintBackdrop(below, config);
  for (const d of config.decorBelow) paintDecor(below, d, config.width, config.height, scale);

  const aboveC = makeCanvas(w, h);
  const above = (aboveC as HTMLCanvasElement).getContext("2d") as Ctx2D;
  above.scale(scale, scale);
  for (const d of config.decorAbove) paintDecor(above, d, config.width, config.height, scale);
  // Logos are static per template, so they bake into the same cached layer as
  // the decorations — a frame stays two blits regardless of how many marks the
  // card carries.
  for (const logo of config.logos) paintLogo(above, logo);

  const pair: LayerPair = { below: belowC as CanvasImageSource, above: aboveC as CanvasImageSource };
  if (awaitingImage) return pair;

  layerCache.set(key, pair);
  while (layerCache.size > MAX_CACHED_LAYERS) {
    const oldest = layerCache.keys().next().value;
    if (oldest === undefined) break;
    layerCache.delete(oldest);
  }
  return pair;
}

/** Warm the cache for every template before the user touches the picker. */
export function prewarmTemplates(configs: TemplateConfig[], scale: number) {
  for (const c of configs) bakeLayers(c, scale);
}

export function clearLayerCache() {
  layerCache.clear();
}

function paintLogo(ctx: Ctx2D, logo: LogoLayer) {
  const art = getBackground(logo.src);
  if (!art) return;

  // Height from the asset's own aspect ratio — never stretched.
  const h = (logo.w * art.height) / art.width;
  let x = logo.x;
  if (logo.align === "center") x = logo.x - logo.w / 2;
  else if (logo.align === "right") x = logo.x - logo.w;

  ctx.save();
  ctx.globalAlpha = logo.opacity ?? 1;
  ctx.drawImage(art, x, logo.y, logo.w, h);
  ctx.restore();
}

function paintBackdrop(ctx: Ctx2D, config: TemplateConfig) {
  const { width: W, height: H, backdrop } = config;
  if (backdrop.kind === "solid") {
    ctx.fillStyle = backdrop.color;
  } else if (backdrop.kind === "linear") {
    const rad = (backdrop.angle * Math.PI) / 180;
    const cx = W / 2;
    const cy = H / 2;
    const len = Math.abs(W * Math.cos(rad)) + Math.abs(H * Math.sin(rad));
    const g = ctx.createLinearGradient(
      cx - (Math.cos(rad) * len) / 2,
      cy - (Math.sin(rad) * len) / 2,
      cx + (Math.cos(rad) * len) / 2,
      cy + (Math.sin(rad) * len) / 2,
    );
    for (const [o, c] of backdrop.stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
  } else if (backdrop.kind === "radial") {
    const g = ctx.createRadialGradient(backdrop.cx, backdrop.cy, 0, backdrop.cx, backdrop.cy, backdrop.r);
    for (const [o, c] of backdrop.stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
  } else {
    // Image backdrop: base colour, artwork at partial opacity, then a colour
    // wash. The result is muted enough that the photo and the type stay the
    // subject, and the base colour alone is a usable card if the image is
    // still in flight.
    ctx.fillStyle = backdrop.base;
    ctx.fillRect(0, 0, W, H);

    const art = getBackground(backdrop.src);
    if (art) {
      ctx.save();
      ctx.globalAlpha = backdrop.imageAlpha;
      // Pre-cropped to the card's aspect ratio, but cover-fit anyway so a
      // replacement asset of any size still fills the card without distortion.
      const scale = Math.max(W / art.width, H / art.height);
      const dw = art.width * scale;
      const dh = art.height * scale;
      ctx.drawImage(art, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = backdrop.tint.alpha;
    ctx.fillStyle = backdrop.tint.color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  ctx.fillRect(0, 0, W, H);
}

/* ------------------------------------------------------------------ *
 * Photo geometry
 * ------------------------------------------------------------------ */

export type PhotoSize = { width: number; height: number };

/** Cover-fit scale: the smallest scale at which the photo fully covers the slot. */
export function coverScale(slot: PhotoSlot, photo: PhotoSize): number {
  return Math.max(slot.w / photo.width, slot.h / photo.height);
}

/**
 * Clamp the pan so the slot can never expose empty space. Shared by the drag
 * handler and the renderer so on-screen and exported cards agree exactly.
 */
export function clampTransform(t: PhotoTransform, slot: PhotoSlot, photo: PhotoSize): PhotoTransform {
  const zoom = Math.min(4, Math.max(1, t.zoom));
  const s = coverScale(slot, photo) * zoom;
  const dw = photo.width * s;
  const dh = photo.height * s;
  const maxX = Math.max(0, (dw - slot.w) / 2) / slot.w;
  const maxY = Math.max(0, (dh - slot.h) / 2) / slot.h;
  return {
    zoom,
    x: Math.min(maxX, Math.max(-maxX, t.x)),
    y: Math.min(maxY, Math.max(-maxY, t.y)),
  };
}

function slotPath(ctx: Ctx2D, slot: PhotoSlot) {
  if (slot.shape === "circle") {
    ctx.beginPath();
    ctx.arc(slot.x + slot.w / 2, slot.y + slot.h / 2, Math.min(slot.w, slot.h) / 2, 0, Math.PI * 2);
    ctx.closePath();
  } else if (slot.shape === "rounded") {
    roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, slot.radius ?? 24);
  } else {
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
    ctx.closePath();
  }
}

function drawPhoto(ctx: Ctx2D, config: TemplateConfig, data: CardData) {
  const slot = config.slot;

  if (slot.glow) {
    ctx.save();
    ctx.shadowColor = slot.glow.color;
    ctx.shadowBlur = slot.glow.blur;
    ctx.fillStyle = slot.placeholder;
    slotPath(ctx, slot);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  slotPath(ctx, slot);
  ctx.clip();

  ctx.fillStyle = slot.placeholder;
  ctx.fillRect(slot.x, slot.y, slot.w, slot.h);

  if (data.photo) {
    const pw = data.photo.width;
    const ph = data.photo.height;
    const t = clampTransform(data.transform, slot, { width: pw, height: ph });
    const s = coverScale(slot, { width: pw, height: ph }) * t.zoom;
    const dw = pw * s;
    const dh = ph * s;
    const cx = slot.x + slot.w / 2 + t.x * slot.w;
    const cy = slot.y + slot.h / 2 + t.y * slot.h;
    ctx.drawImage(data.photo as CanvasImageSource, cx - dw / 2, cy - dh / 2, dw, dh);

    if (slot.wash) {
      ctx.globalCompositeOperation = slot.wash.mode;
      ctx.globalAlpha = slot.wash.alpha;
      ctx.fillStyle = slot.wash.color;
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
  ctx.restore();

  if (slot.ring) {
    ctx.save();
    ctx.strokeStyle = slot.ring.color;
    ctx.lineWidth = slot.ring.width;
    slotPath(ctx, slot);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

let letterSpacingSupport: boolean | null = null;
function supportsLetterSpacing(ctx: Ctx2D): boolean {
  if (letterSpacingSupport === null) {
    letterSpacingSupport = "letterSpacing" in ctx;
  }
  return letterSpacingSupport;
}

function applyFont(ctx: Ctx2D, layer: TextLayer, size: number, fonts: FontBook) {
  ctx.font = `${layer.weight} ${size}px ${fonts[layer.font]}`;
  if (supportsLetterSpacing(ctx)) {
    (ctx as CanvasRenderingContext2D).letterSpacing = `${layer.letterSpacing ?? 0}px`;
  }
}

function measure(ctx: Ctx2D, text: string, layer: TextLayer): number {
  const base = ctx.measureText(text).width;
  if (supportsLetterSpacing(ctx) || !layer.letterSpacing) return base;
  return base + layer.letterSpacing * Math.max(0, text.length - 1);
}

/** Manual tracking fallback for browsers without ctx.letterSpacing. */
function drawTracked(ctx: Ctx2D, text: string, x: number, y: number, layer: TextLayer, width: number) {
  const spacing = layer.letterSpacing ?? 0;
  let cursor = x;
  if (layer.align === "center") cursor = x - width / 2;
  else if (layer.align === "right") cursor = x - width;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = prevAlign;
}

function wrapLines(ctx: Ctx2D, text: string, layer: TextLayer, size: number, fonts: FontBook, maxLines: number): string[] {
  applyFont(ctx, layer, size, fonts);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(ctx, candidate, layer) <= layer.maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length ? lines : [text];
}

function ellipsise(ctx: Ctx2D, text: string, layer: TextLayer): string {
  if (measure(ctx, text, layer) <= layer.maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(ctx, `${text.slice(0, mid).trimEnd()}…`, layer) <= layer.maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

function textFor(layer: TextLayer, data: CardData): string {
  switch (layer.key) {
    case "name":
      return data.name || "YOUR NAME";
    case "role":
      return data.role || "Builder";
    case "title":
      return data.title || "";
    case "literal":
    case "handleTag":
    case "event":
      return layer.literal ?? "";
  }
}

function drawTextLayer(ctx: Ctx2D, layer: TextLayer, data: CardData, fonts: FontBook) {
  let text = textFor(layer, data);
  if (!text) return;
  if (layer.uppercase) text = text.toUpperCase();

  ctx.save();
  ctx.textAlign = layer.align;
  ctx.textBaseline = layer.baseline;
  ctx.globalAlpha = layer.opacity ?? 1;
  ctx.fillStyle = layer.color;

  const isMultiline = !!layer.lineHeight;
  const minSize = layer.minSize ?? layer.size;

  // Auto-shrink until it fits, then ellipsise as a last resort. Combined with
  // the input-level character cap this means no name can break the layout.
  let size = layer.size;
  let lines: string[] = [text];
  if (isMultiline) {
    lines = wrapLines(ctx, text, layer, size, fonts, 3);
    while (size > minSize && lines.some((l) => measure(ctx, l, layer) > layer.maxWidth)) {
      size -= 2;
      lines = wrapLines(ctx, text, layer, size, fonts, 3);
    }
  } else {
    applyFont(ctx, layer, size, fonts);
    while (size > minSize && measure(ctx, text, layer) > layer.maxWidth) {
      size -= 2;
      applyFont(ctx, layer, size, fonts);
    }
    lines = [ellipsise(ctx, text, layer)];
  }
  applyFont(ctx, layer, size, fonts);

  const lineStep = size * (layer.lineHeight ?? 1);

  if (layer.pill) {
    const w = measure(ctx, lines[0], layer);
    const { padX, padY, radius, fill, stroke } = layer.pill;
    const boxW = w + padX * 2;
    const boxH = size + padY * 2;
    let bx = layer.x - padX;
    if (layer.align === "center") bx = layer.x - boxW / 2;
    else if (layer.align === "right") bx = layer.x - boxW + padX;
    const by = layer.baseline === "middle" ? layer.y - boxH / 2 : layer.y - boxH + padY;
    ctx.save();
    ctx.fillStyle = fill;
    roundRectPath(ctx, bx, by, boxW, boxH, radius);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = layer.color;
  }

  if (layer.shadow) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetY = layer.shadow.y ?? 0;
  }

  lines.forEach((line, i) => {
    const y = layer.y + i * lineStep;
    if (layer.letterSpacing && !supportsLetterSpacing(ctx)) {
      drawTracked(ctx, line, layer.x, y, layer, measure(ctx, line, layer));
    } else {
      ctx.fillText(line, layer.x, y);
    }
  });

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * The single render entry point
 * ------------------------------------------------------------------ */

/**
 * Draw a complete card. `scale` is relative to the template's design size:
 * the preview uses a fraction, the export uses 1 (or more). All coordinates
 * inside the config stay in design units at every scale, so what you see is
 * exactly what downloads.
 */
export function renderCard(
  ctx: Ctx2D,
  data: CardData,
  config: TemplateConfig,
  fonts: FontBook,
  scale: number,
) {
  const { below, above } = bakeLayers(config, scale);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, config.width, config.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  ctx.drawImage(below, 0, 0, config.width, config.height);
  drawPhoto(ctx, config, data);
  ctx.drawImage(above, 0, 0, config.width, config.height);

  for (const layer of config.layers) drawTextLayer(ctx, layer, data, fonts);
}

/** Explicitly load every weight the templates draw with, then wait for readiness. */
export async function ensureFontsReady(fonts: FontBook, configs: TemplateConfig[]) {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = new Set<string>();
  for (const config of configs) {
    for (const layer of config.layers) {
      specs.add(`${layer.weight} ${layer.size}px ${fonts[layer.font]}`);
    }
  }
  await Promise.all(
    [...specs].map((spec) => document.fonts.load(spec).catch(() => undefined)),
  );
  await document.fonts.ready;
}

export { withAlpha };
