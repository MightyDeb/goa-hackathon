/**
 * Templates are data, not code paths (plan §2).
 *
 * Every visual difference between cards lives in a TemplateConfig object;
 * `renderCard(data, config)` is the only drawing entry point. Switching a
 * template re-runs the same composite against a different config — no
 * re-upload, no re-crop, no extra render path to maintain.
 *
 * Each template is backed by one of the three Goa illustrations, drawn at
 * partial opacity over a deep green base and then tinted, so the artwork reads
 * as atmosphere rather than competing with the photo and the type.
 */

export type FontRole = "display" | "body" | "mono";

/** Resolved at render time from next/font, so no webfont is fetched at runtime. */
export type FontBook = Record<FontRole, string>;

export type Rect = { x: number; y: number; w: number; h: number };

export type PhotoSlot = Rect & {
  shape: "rounded" | "circle" | "rect";
  radius?: number;
  ring?: { color: string; width: number };
  glow?: { color: string; blur: number };
  placeholder: string;
  wash?: { color: string; alpha: number; mode: GlobalCompositeOperation };
};

export type TextLayer = {
  key: "name" | "role" | "title" | "event" | "handleTag" | "literal";
  literal?: string;
  x: number;
  y: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  maxWidth: number;
  font: FontRole;
  weight: number;
  size: number;
  minSize?: number;
  letterSpacing?: number;
  lineHeight?: number;
  uppercase?: boolean;
  color: string;
  opacity?: number;
  pill?: { fill: string; stroke?: string; padX: number; padY: number; radius: number };
  shadow?: { color: string; blur: number; y?: number };
};

export type Decor =
  | { kind: "gridHorizon"; y: number; color: string; lines: number; accent: string }
  | { kind: "scanlines"; alpha: number; gap: number; color: string }
  | { kind: "sun"; cx: number; cy: number; r: number; from: string; to: string; slices?: number }
  | { kind: "hills"; y: number; colors: string[] }
  | { kind: "palms"; y: number; color: string; count: number }
  | { kind: "scrim"; from: number; to: number; color: string; y: number; h: number }
  | { kind: "rule"; x: number; y: number; w: number; h: number; color: string }
  | { kind: "perforation"; y: number; r: number; gap: number; color: string }
  | { kind: "cornerMarks"; inset: number; len: number; color: string; width: number }
  | { kind: "grain"; alpha: number }
  | { kind: "panel"; x: number; y: number; w: number; h: number; color: string; alpha: number; radius?: number }
  | { kind: "blob"; cx: number; cy: number; r: number; color: string; alpha: number }
  | { kind: "barcode"; x: number; y: number; w: number; h: number; color: string };

export type Backdrop =
  | { kind: "linear"; angle: number; stops: [number, string][] }
  | { kind: "radial"; cx: number; cy: number; r: number; stops: [number, string][] }
  | { kind: "solid"; color: string }
  | {
      kind: "image";
      src: string;
      /** Painted under the image, and shown alone until the image loads. */
      base: string;
      /** How much of the artwork shows through. Lower = more muted. */
      imageAlpha: number;
      /** Colour wash over the artwork, binding it to the palette. */
      tint: { color: string; alpha: number };
    };

/**
 * A static image drawn on the card — currently the event logo. Height is
 * derived from the asset's own aspect ratio so a replacement logo of different
 * proportions can't come out stretched.
 */
export type LogoLayer = {
  src: string;
  x: number;
  y: number;
  w: number;
  align?: "left" | "center" | "right";
  opacity?: number;
};

export type TemplateConfig = {
  id: string;
  label: string;
  blurb: string;
  swatch: [string, string];
  width: number;
  height: number;
  backdrop: Backdrop;
  decorBelow: Decor[];
  slot: PhotoSlot;
  decorAbove: Decor[];
  logos: LogoLayer[];
  layers: TextLayer[];
};

/** Shared event strings, so a date or tag change is a one-line edit. */
export const EVENT_DATES = "28–31 OCT 2026";
export const EVENT_TAG = "#BUILDING THE FUTURE — AIxCRYPTO";
/** Set in caps to match the cards' existing label typography. */
export const EVENT_WORDMARK = "HACKER HOUSE GOA";
const LOGO_SRC = "/templates/logo.webp";

const W = 1080;
const H = 1350;

/* -------------------------------------------------------------------------- *
 * Palette — kelly green surfaces, golden yellow type.
 *
 * Bright kelly green (#4CBB17) behind golden yellow text only reaches ~1.8:1
 * contrast, which is unreadable. So kelly green carries the accents, rings and
 * pills, while the surfaces are deep green — that puts the gold at ~13:1.
 * -------------------------------------------------------------------------- */
export const BRAND_GREEN = "#0B6839";
export const BRAND_GOLD = "#FFD84D";
/** Sandy card for text to sit on. */
export const BEIGE = "#EFE0C4";
const BEIGE_DEEP = "#E3D2B0";
/** Ink used on beige — 5.3:1 against it, comfortably past AA. */
const INK = "#0B6839";
const GOLD = BRAND_GOLD;
const DEEP = "#052E19";
const DEEP_2 = "#0A4527";

/**
 * Every string on a card sits in a sandy box with deep-green ink. Boxes are
 * sized from real glyph metrics in renderCard, so they hug whatever they hold.
 */
function boxed(
  layer: TextLayer,
  opts: { padX?: number; padY?: number; radius?: number; fill?: string; color?: string } = {},
): TextLayer {
  return {
    ...layer,
    color: opts.color ?? INK,
    // Boxes carry legibility now, so per-glyph shadows are just noise.
    shadow: undefined,
    opacity: undefined,
    pill: {
      fill: opts.fill ?? BEIGE,
      padX: opts.padX ?? 18,
      padY: opts.padY ?? 11,
      radius: opts.radius ?? 8,
    },
  };
}

/**
 * 1 — BEACH FLAT-LAY
 * Near-full-bleed rounded portrait, sandy labels, left-aligned display type.
 */
const beachFlatLay: TemplateConfig = {
  id: "neon-panjim",
  label: "Beach Flat-Lay",
  blurb: "Sun-bleached sand, sandy labels, bold left-aligned type",
  swatch: [BEIGE, BRAND_GREEN],
  width: W,
  height: H,
  backdrop: {
    kind: "image",
    src: "/templates/bg-1.webp",
    base: DEEP,
    // Full strength: the beige boxes carry legibility now, so the artwork no
    // longer has to be washed out to keep text readable.
    imageAlpha: 1,
    tint: { color: BRAND_GREEN, alpha: 0.1 },
  },
  decorBelow: [{ kind: "grain", alpha: 0.03 }],
  slot: {
    shape: "rounded",
    x: 130,
    y: 240,
    w: 820,
    h: 690,
    radius: 30,
    placeholder: DEEP_2,
    ring: { color: BEIGE, width: 9 },
    glow: { color: "rgba(5,46,25,0.55)", blur: 46 },
  },
  // The logo is yellow and pink; on pale sand it disappears. A deep panel
  // behind it does for the mark what the beige boxes do for the type.
  decorAbove: [
    { kind: "panel", x: 114, y: 28, w: 202, h: 172, color: DEEP, alpha: 0.82, radius: 14 },
  ],
  logos: [{ src: LOGO_SRC, x: 130, y: 40, w: 170, align: "left" }],
  layers: [
    boxed({
      key: "literal",
      literal: EVENT_WORDMARK,
      x: 318,
      y: 100,
      align: "left",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 700,
      size: 25,
      letterSpacing: 2,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: "BUILDER PASS",
      x: 318,
      y: 156,
      align: "left",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 500,
      size: 18,
      letterSpacing: 4,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: EVENT_DATES,
      x: 950,
      y: 100,
      align: "right",
      baseline: "middle",
      maxWidth: 320,
      font: "mono",
      weight: 700,
      size: 25,
      letterSpacing: 2,
      color: INK,
    }),
    boxed({
      key: "name",
      x: 130,
      y: 1040,
      align: "left",
      baseline: "alphabetic",
      maxWidth: 760,
      font: "display",
      weight: 700,
      size: 88,
      minSize: 48,
      letterSpacing: -2,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "title",
      x: 130,
      y: 1128,
      align: "left",
      baseline: "alphabetic",
      maxWidth: 760,
      font: "display",
      weight: 600,
      size: 40,
      minSize: 26,
      color: INK,
    }),
    boxed({
      key: "role",
      x: 130,
      y: 1204,
      align: "left",
      baseline: "middle",
      maxWidth: 700,
      font: "mono",
      weight: 600,
      size: 23,
      minSize: 15,
      letterSpacing: 3,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: EVENT_TAG,
      x: 130,
      y: 1282,
      align: "left",
      baseline: "middle",
      maxWidth: 560,
      font: "mono",
      weight: 600,
      size: 19,
      letterSpacing: 1,
      color: INK,
    }),
    boxed({
      key: "handleTag",
      literal: "#FrameInGoa",
      x: 950,
      y: 1282,
      align: "right",
      baseline: "middle",
      maxWidth: 260,
      font: "mono",
      weight: 600,
      size: 19,
      letterSpacing: 1,
      color: INK,
    }),
  ],
};

/**
 * 2 — PALM ROAD
 * Centred circular badge, symmetric lanyard-ID layout.
 */
const palmRoad: TemplateConfig = {
  id: "sunset-badge",
  label: "Palm Road",
  blurb: "Watercolour palms, circular crop, classic lanyard ID",
  swatch: [BRAND_GREEN, BEIGE],
  width: W,
  height: H,
  backdrop: {
    kind: "image",
    src: "/templates/bg-2.webp",
    base: DEEP,
    imageAlpha: 1,
    tint: { color: BRAND_GREEN, alpha: 0.08 },
  },
  decorBelow: [{ kind: "grain", alpha: 0.04 }],
  slot: {
    shape: "circle",
    x: 330,
    y: 396,
    w: 420,
    h: 420,
    placeholder: DEEP_2,
    ring: { color: BEIGE, width: 14 },
    glow: { color: "rgba(5,46,25,0.6)", blur: 46 },
  },
  decorAbove: [
    { kind: "panel", x: 409, y: 28, w: 262, h: 224, color: DEEP, alpha: 0.8, radius: 16 },
  ],
  logos: [{ src: LOGO_SRC, x: 540, y: 40, w: 230, align: "center" }],
  layers: [
    boxed({
      key: "literal",
      literal: EVENT_WORDMARK,
      x: 540,
      y: 288,
      align: "center",
      baseline: "middle",
      maxWidth: 860,
      font: "mono",
      weight: 700,
      size: 24,
      letterSpacing: 5,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: EVENT_DATES,
      x: 540,
      y: 346,
      align: "center",
      baseline: "middle",
      maxWidth: 820,
      font: "mono",
      weight: 700,
      size: 24,
      letterSpacing: 4,
      color: INK,
    }),
    boxed({
      key: "name",
      x: 540,
      y: 940,
      align: "center",
      baseline: "alphabetic",
      maxWidth: 860,
      font: "display",
      weight: 700,
      size: 82,
      minSize: 44,
      letterSpacing: -1,
      color: INK,
    }),
    boxed({
      key: "title",
      x: 540,
      y: 1024,
      align: "center",
      baseline: "alphabetic",
      maxWidth: 840,
      font: "display",
      weight: 600,
      size: 38,
      minSize: 24,
      color: INK,
    }),
    boxed({
      key: "role",
      x: 540,
      y: 1102,
      align: "center",
      baseline: "middle",
      maxWidth: 800,
      font: "mono",
      weight: 600,
      size: 23,
      minSize: 15,
      letterSpacing: 3,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: EVENT_TAG,
      x: 540,
      y: 1180,
      align: "center",
      baseline: "middle",
      maxWidth: 880,
      font: "mono",
      weight: 600,
      size: 19,
      letterSpacing: 1,
      color: INK,
    }),
    boxed({
      key: "handleTag",
      literal: "#FrameInGoa",
      x: 540,
      y: 1256,
      align: "center",
      baseline: "middle",
      maxWidth: 600,
      font: "mono",
      weight: 600,
      size: 21,
      letterSpacing: 2,
      color: INK,
    }),
  ],
};

/**
 * 3 — CHAPEL GREEN
 * Asymmetric hard-edged crop, ticket-stub typography.
 */
const chapelGreen: TemplateConfig = {
  id: "minimal-mono",
  label: "Chapel Green",
  blurb: "Painted chapel, hard crop, ticket-stub typography",
  swatch: [BEIGE, BRAND_GREEN],
  width: W,
  height: H,
  backdrop: {
    kind: "image",
    src: "/templates/bg-3.webp",
    base: DEEP,
    imageAlpha: 1,
    tint: { color: BRAND_GREEN, alpha: 0.12 },
  },
  decorBelow: [
    { kind: "cornerMarks", inset: 46, len: 46, color: BEIGE, width: 3 },
    { kind: "grain", alpha: 0.04 },
  ],
  slot: {
    shape: "rect",
    x: 90,
    y: 276,
    w: 620,
    h: 640,
    placeholder: DEEP_2,
    ring: { color: BEIGE, width: 3 },
  },
  decorAbove: [
    { kind: "panel", x: 74, y: 34, w: 192, h: 163, color: DEEP, alpha: 0.82, radius: 12 },
    { kind: "rule", x: 90, y: 232, w: 900, h: 3, color: BEIGE },
    { kind: "perforation", y: 962, r: 7, gap: 34, color: BEIGE_DEEP },
    { kind: "barcode", x: 762, y: 792, w: 226, h: 124, color: BEIGE },
  ],
  logos: [{ src: LOGO_SRC, x: 90, y: 46, w: 160, align: "left" }],
  layers: [
    boxed({
      key: "literal",
      literal: EVENT_WORDMARK,
      x: 272,
      y: 106,
      align: "left",
      baseline: "middle",
      maxWidth: 400,
      font: "display",
      weight: 700,
      size: 30,
      letterSpacing: 0,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: "BUILDER PASS",
      x: 272,
      y: 162,
      align: "left",
      baseline: "middle",
      maxWidth: 400,
      font: "mono",
      weight: 500,
      size: 17,
      letterSpacing: 4,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: EVENT_DATES,
      x: 990,
      y: 106,
      align: "right",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 700,
      size: 24,
      letterSpacing: 2,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: "GOA / INDIA",
      x: 990,
      y: 162,
      align: "right",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 500,
      size: 17,
      letterSpacing: 4,
      uppercase: true,
      color: INK,
    }),
    boxed(
      {
        key: "role",
        x: 762,
        y: 330,
        align: "left",
        baseline: "top",
        // Two skills never fit this column on one line, so let it wrap
        // instead of ellipsising away the second one.
        maxWidth: 202,
        lineHeight: 1.3,
        font: "mono",
        weight: 600,
        size: 18,
        minSize: 13,
        letterSpacing: 1,
        uppercase: true,
        color: INK,
      },
      { padX: 12, padY: 9 },
    ),
    boxed(
      {
        key: "title",
        x: 762,
        y: 424,
        align: "left",
        baseline: "top",
        maxWidth: 200,
        font: "display",
        weight: 600,
        size: 32,
        minSize: 20,
        lineHeight: 1.16,
        color: INK,
      },
      { padX: 12, padY: 10 },
    ),
    boxed({
      key: "name",
      x: 90,
      y: 1076,
      align: "left",
      baseline: "alphabetic",
      maxWidth: 860,
      font: "display",
      weight: 700,
      size: 84,
      minSize: 46,
      letterSpacing: -2,
      uppercase: true,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: EVENT_TAG,
      x: 90,
      y: 1162,
      align: "left",
      baseline: "middle",
      maxWidth: 620,
      font: "mono",
      weight: 600,
      size: 19,
      letterSpacing: 1,
      color: INK,
    }),
    boxed({
      key: "handleTag",
      literal: "#FrameInGoa",
      x: 90,
      y: 1244,
      align: "left",
      baseline: "middle",
      maxWidth: 400,
      font: "mono",
      weight: 600,
      size: 21,
      letterSpacing: 2,
      color: INK,
    }),
    boxed({
      key: "literal",
      literal: "HH-GOA-26",
      x: 990,
      y: 1244,
      align: "right",
      baseline: "middle",
      maxWidth: 300,
      font: "mono",
      weight: 600,
      size: 21,
      letterSpacing: 2,
      color: INK,
    }),
  ],
};

export const TEMPLATES: TemplateConfig[] = [beachFlatLay, palmRoad, chapelGreen];

export const DEFAULT_TEMPLATE_ID = TEMPLATES[0].id;

/** Every image the templates reference — backdrops and logos — for preloading. */
export const TEMPLATE_IMAGE_SOURCES: string[] = [
  ...new Set(
    TEMPLATES.flatMap((t) => [
      ...(t.backdrop.kind === "image" ? [t.backdrop.src] : []),
      ...t.logos.map((l) => l.src),
    ]),
  ),
];

/** Images a single template needs before it can be drawn complete. */
export function imageSourcesFor(config: TemplateConfig): string[] {
  return [
    ...(config.backdrop.kind === "image" ? [config.backdrop.src] : []),
    ...config.logos.map((l) => l.src),
  ];
}

export function getTemplate(id: string): TemplateConfig {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
