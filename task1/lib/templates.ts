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
const KELLY = "#4CBB17";
const KELLY_BRIGHT = "#7BE83A";
const GOLD = "#FFD230";
const GOLD_SOFT = "#FFE9A8";
const DEEP = "#06240D";
const DEEP_2 = "#0B3D14";

/**
 * 1 — BEACH FLAT-LAY
 * Near-full-bleed rounded portrait, kelly ring, left-aligned display type.
 */
const beachFlatLay: TemplateConfig = {
  id: "neon-panjim",
  label: "Beach Flat-Lay",
  blurb: "Sun-bleached sand, kelly ring, bold left-aligned type",
  swatch: [KELLY, GOLD],
  width: W,
  height: H,
  backdrop: {
    kind: "image",
    src: "/templates/bg-1.webp",
    base: DEEP,
    // The artwork carries the card; legibility is bought with the scrims
    // below, not by washing the illustration out until it's unrecognisable.
    imageAlpha: 0.92,
    tint: { color: DEEP_2, alpha: 0.3 },
  },
  decorBelow: [{ kind: "grain", alpha: 0.04 }],
  slot: {
    shape: "rounded",
    x: 130,
    y: 252,
    w: 820,
    h: 700,
    radius: 36,
    placeholder: DEEP_2,
    ring: { color: KELLY, width: 9 },
    glow: { color: "rgba(255,210,48,0.55)", blur: 60 },
  },
  decorAbove: [
    { kind: "scrim", y: 0, h: 240, from: 0.86, to: 0, color: "#03170A" },
    { kind: "scrim", y: 930, h: 420, from: 0, to: 0.95, color: "#03170A" },
  ],
  logos: [{ src: LOGO_SRC, x: 130, y: 40, w: 170, align: "left" }],
  layers: [
    // Wordmark set beside the logo so the two read as one lockup.
    {
      key: "literal",
      literal: EVENT_WORDMARK,
      x: 318,
      y: 92,
      align: "left",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 700,
      size: 26,
      letterSpacing: 3,
      uppercase: true,
      color: GOLD,
    },
    {
      key: "literal",
      literal: "BUILDER PASS",
      x: 318,
      y: 138,
      align: "left",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 500,
      size: 20,
      letterSpacing: 4,
      uppercase: true,
      color: KELLY_BRIGHT,
      opacity: 0.92,
    },
    {
      key: "literal",
      literal: EVENT_DATES,
      x: 950,
      y: 112,
      align: "right",
      baseline: "middle",
      maxWidth: 300,
      font: "mono",
      weight: 700,
      size: 28,
      letterSpacing: 3,
      color: GOLD,
    },
    {
      key: "name",
      x: 130,
      y: 1072,
      align: "left",
      baseline: "alphabetic",
      maxWidth: 820,
      font: "display",
      weight: 700,
      size: 100,
      minSize: 54,
      letterSpacing: -2,
      uppercase: true,
      color: GOLD,
      shadow: { color: "rgba(3,23,10,0.85)", blur: 22, y: 2 },
    },
    {
      key: "title",
      x: 130,
      y: 1142,
      align: "left",
      baseline: "alphabetic",
      maxWidth: 820,
      font: "display",
      weight: 500,
      size: 44,
      minSize: 28,
      color: KELLY_BRIGHT,
    },
    {
      key: "role",
      x: 130,
      y: 1212,
      align: "left",
      baseline: "middle",
      maxWidth: 500,
      font: "mono",
      weight: 600,
      size: 26,
      letterSpacing: 4,
      uppercase: true,
      color: DEEP,
      pill: { fill: GOLD, padX: 24, padY: 16, radius: 999 },
    },
    {
      key: "literal",
      literal: EVENT_TAG,
      x: 130,
      y: 1294,
      align: "left",
      baseline: "middle",
      maxWidth: 600,
      font: "mono",
      weight: 600,
      size: 21,
      letterSpacing: 1,
      color: GOLD_SOFT,
      opacity: 0.92,
    },
    {
      key: "handleTag",
      literal: "#FrameInGoa",
      x: 950,
      y: 1294,
      align: "right",
      baseline: "middle",
      maxWidth: 260,
      font: "mono",
      weight: 500,
      size: 21,
      letterSpacing: 1,
      color: KELLY_BRIGHT,
    },
  ],
};

/**
 * 2 — PALM ROAD
 * Centred circular badge, gold ring, symmetric lanyard-ID layout.
 */
const palmRoad: TemplateConfig = {
  id: "sunset-badge",
  label: "Palm Road",
  blurb: "Watercolour palms, circular crop, classic lanyard ID",
  swatch: [DEEP_2, GOLD],
  width: W,
  height: H,
  backdrop: {
    kind: "image",
    src: "/templates/bg-2.webp",
    base: DEEP,
    imageAlpha: 0.94,
    tint: { color: DEEP_2, alpha: 0.22 },
  },
  decorBelow: [{ kind: "grain", alpha: 0.05 }],
  slot: {
    shape: "circle",
    x: 330,
    y: 382,
    w: 420,
    h: 420,
    placeholder: DEEP_2,
    ring: { color: GOLD, width: 14 },
    glow: { color: "rgba(76,187,23,0.75)", blur: 55 },
  },
  decorAbove: [
    { kind: "scrim", y: 0, h: 420, from: 0.9, to: 0, color: "#03170A" },
    { kind: "scrim", y: 800, h: 550, from: 0, to: 0.95, color: "#03170A" },
  ],
  logos: [{ src: LOGO_SRC, x: 540, y: 40, w: 230, align: "center" }],
  layers: [
    {
      key: "literal",
      literal: EVENT_WORDMARK,
      x: 540,
      y: 276,
      align: "center",
      baseline: "middle",
      maxWidth: 860,
      font: "mono",
      weight: 700,
      size: 26,
      letterSpacing: 6,
      uppercase: true,
      color: GOLD_SOFT,
      // Centred text crosses both the pale wall and the dark fronds here.
      shadow: { color: "rgba(3,23,10,0.95)", blur: 20 },
    },
    {
      key: "literal",
      literal: EVENT_DATES,
      x: 540,
      y: 332,
      align: "center",
      baseline: "middle",
      maxWidth: 820,
      font: "mono",
      weight: 700,
      size: 30,
      letterSpacing: 6,
      color: GOLD,
      // This lands where the top scrim has faded to nothing, over the bright
      // painted wall — a chip guarantees contrast where a shadow wouldn't.
      pill: { fill: "rgba(3,23,10,0.72)", padX: 26, padY: 14, radius: 999 },
    },
    {
      key: "name",
      x: 540,
      y: 928,
      align: "center",
      baseline: "alphabetic",
      maxWidth: 900,
      font: "display",
      weight: 700,
      size: 92,
      minSize: 50,
      letterSpacing: -1,
      color: GOLD,
      shadow: { color: "rgba(3,23,10,0.8)", blur: 22, y: 4 },
    },
    {
      key: "title",
      x: 540,
      y: 1002,
      align: "center",
      baseline: "alphabetic",
      maxWidth: 880,
      font: "display",
      weight: 500,
      size: 42,
      minSize: 28,
      color: KELLY_BRIGHT,
    },
    {
      key: "role",
      x: 540,
      y: 1086,
      align: "center",
      baseline: "middle",
      maxWidth: 520,
      font: "mono",
      weight: 600,
      size: 26,
      letterSpacing: 4,
      uppercase: true,
      color: DEEP,
      pill: { fill: KELLY, padX: 28, padY: 16, radius: 999 },
    },
    {
      key: "literal",
      literal: EVENT_TAG,
      x: 540,
      y: 1188,
      align: "center",
      baseline: "middle",
      maxWidth: 900,
      font: "mono",
      weight: 600,
      size: 23,
      letterSpacing: 1,
      color: GOLD_SOFT,
      opacity: 0.94,
    },
    {
      key: "handleTag",
      literal: "#FrameInGoa",
      x: 540,
      y: 1268,
      align: "center",
      baseline: "middle",
      maxWidth: 600,
      font: "mono",
      weight: 500,
      size: 28,
      letterSpacing: 3,
      color: KELLY_BRIGHT,
    },
  ],
};

/**
 * 3 — CHAPEL GREEN
 * Asymmetric hard-edged crop, ticket-stub typography. Deliberately the most
 * structural of the three: rules, corner marks, perforation, barcode.
 */
const chapelGreen: TemplateConfig = {
  id: "minimal-mono",
  label: "Chapel Green",
  blurb: "Painted chapel, hard crop, ticket-stub typography",
  swatch: [GOLD, KELLY],
  width: W,
  height: H,
  backdrop: {
    kind: "image",
    src: "/templates/bg-3.webp",
    base: DEEP,
    imageAlpha: 0.9,
    tint: { color: DEEP_2, alpha: 0.3 },
  },
  decorBelow: [
    { kind: "rule", x: 90, y: 232, w: 900, h: 3, color: GOLD },
    { kind: "cornerMarks", inset: 46, len: 46, color: GOLD, width: 3 },
    { kind: "grain", alpha: 0.05 },
  ],
  slot: {
    shape: "rect",
    x: 90,
    y: 276,
    w: 620,
    h: 646,
    placeholder: DEEP_2,
    ring: { color: GOLD, width: 3 },
  },
  decorAbove: [
    // This layout puts type over open artwork on three sides, so it needs a
    // top band and a right-hand column veil as well as the usual bottom scrim.
    { kind: "scrim", y: 0, h: 250, from: 0.88, to: 0, color: "#03170A" },
    { kind: "panel", x: 745, y: 276, w: 260, h: 646, color: "#03170A", alpha: 0.62, radius: 6 },
    { kind: "scrim", y: 940, h: 410, from: 0, to: 0.93, color: "#03170A" },
    { kind: "perforation", y: 976, r: 7, gap: 34, color: "rgba(255,210,48,0.45)" },
    { kind: "barcode", x: 762, y: 762, w: 226, h: 140, color: GOLD },
    { kind: "rule", x: 762, y: 318, w: 226, h: 2, color: GOLD },
  ],
  logos: [{ src: LOGO_SRC, x: 90, y: 46, w: 160, align: "left" }],
  layers: [
    // Wordmark set in the display face here, matching this template's more
    // typographic character.
    {
      key: "literal",
      literal: EVENT_WORDMARK,
      x: 272,
      y: 108,
      align: "left",
      baseline: "middle",
      maxWidth: 400,
      font: "display",
      weight: 700,
      size: 34,
      letterSpacing: 0,
      uppercase: true,
      color: GOLD,
    },
    {
      key: "literal",
      literal: "BUILDER PASS",
      x: 272,
      y: 152,
      align: "left",
      baseline: "middle",
      maxWidth: 400,
      font: "mono",
      weight: 500,
      size: 20,
      letterSpacing: 4,
      uppercase: true,
      color: KELLY_BRIGHT,
    },
    {
      key: "literal",
      literal: EVENT_DATES,
      x: 990,
      y: 108,
      align: "right",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 700,
      size: 28,
      letterSpacing: 3,
      color: GOLD,
    },
    {
      key: "literal",
      literal: "GOA / INDIA",
      x: 990,
      y: 154,
      align: "right",
      baseline: "middle",
      maxWidth: 330,
      font: "mono",
      weight: 500,
      size: 20,
      letterSpacing: 4,
      uppercase: true,
      color: KELLY_BRIGHT,
    },
    {
      key: "role",
      x: 762,
      y: 356,
      align: "left",
      baseline: "middle",
      maxWidth: 226,
      font: "mono",
      weight: 600,
      size: 24,
      letterSpacing: 2,
      uppercase: true,
      color: KELLY_BRIGHT,
    },
    {
      key: "title",
      x: 762,
      y: 424,
      align: "left",
      baseline: "top",
      maxWidth: 232,
      font: "display",
      weight: 600,
      size: 38,
      minSize: 24,
      lineHeight: 1.14,
      color: GOLD,
    },
    {
      key: "name",
      x: 90,
      y: 1092,
      align: "left",
      baseline: "alphabetic",
      maxWidth: 900,
      font: "display",
      weight: 700,
      size: 96,
      minSize: 52,
      letterSpacing: -3,
      uppercase: true,
      color: GOLD,
      shadow: { color: "rgba(3,23,10,0.8)", blur: 18, y: 2 },
    },
    {
      key: "literal",
      literal: EVENT_TAG,
      x: 90,
      y: 1172,
      align: "left",
      baseline: "middle",
      maxWidth: 900,
      font: "mono",
      weight: 600,
      size: 23,
      letterSpacing: 1,
      color: GOLD_SOFT,
      opacity: 0.94,
    },
    {
      key: "handleTag",
      literal: "#FrameInGoa",
      x: 90,
      y: 1252,
      align: "left",
      baseline: "middle",
      maxWidth: 520,
      font: "mono",
      weight: 500,
      size: 26,
      letterSpacing: 3,
      color: KELLY_BRIGHT,
    },
    {
      key: "literal",
      literal: "HH-GOA-26",
      x: 990,
      y: 1252,
      align: "right",
      baseline: "middle",
      maxWidth: 300,
      font: "mono",
      weight: 500,
      size: 26,
      letterSpacing: 3,
      color: GOLD_SOFT,
      opacity: 0.8,
    },
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
