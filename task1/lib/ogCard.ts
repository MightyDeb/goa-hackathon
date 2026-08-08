import { getBackground } from "./backgrounds";
import { roundRectPath, withAlpha, type Ctx2D } from "./decor";
import { EVENT_DATES, EVENT_TAG, EVENT_WORDMARK, type FontBook, type TemplateConfig } from "./templates";

/**
 * Link-preview image, 1200x630 (1.91:1).
 *
 * The card itself is 4:5. Handing that straight to X means the crawler
 * centre-crops it and the preview shows nothing but the middle of the photo
 * slot — no logo, no name, no dates. So the preview is composed separately:
 * the whole card sits on the left at full aspect, and the details it would
 * otherwise lose are set beside it.
 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const GOLD = "#FFD230";
const GOLD_SOFT = "#FFE9A8";
const KELLY_BRIGHT = "#7BE83A";
const DEEP = "#04170A";

function fitText(
  ctx: Ctx2D,
  text: string,
  family: string,
  weight: number,
  startSize: number,
  minSize: number,
  maxWidth: number,
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function ellipsise(ctx: Ctx2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

export function renderOgImage(
  ctx: Ctx2D,
  card: CanvasImageSource,
  data: { name: string; title: string },
  config: TemplateConfig,
  fonts: FontBook,
) {
  ctx.clearRect(0, 0, OG_WIDTH, OG_HEIGHT);

  // Backdrop: the template's own artwork, heavily darkened so the type on top
  // stays readable at thumbnail size.
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  const art = config.backdrop.kind === "image" ? getBackground(config.backdrop.src) : null;
  if (art) {
    const scale = Math.max(OG_WIDTH / art.width, OG_HEIGHT / art.height);
    const dw = art.width * scale;
    const dh = art.height * scale;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(art, (OG_WIDTH - dw) / 2, (OG_HEIGHT - dh) / 2, dw, dh);
    ctx.restore();
    ctx.fillStyle = withAlpha(DEEP, 0.72);
    ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
  }

  // The card, whole and uncropped, at its real 4:5 aspect.
  const cardH = 548;
  const cardW = Math.round((cardH * config.width) / config.height);
  const cardX = 64;
  const cardY = Math.round((OG_HEIGHT - cardH) / 2);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.fillStyle = DEEP;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.clip();
  ctx.drawImage(card, cardX, cardY, cardW, cardH);
  ctx.restore();

  ctx.strokeStyle = withAlpha(GOLD, 0.35);
  ctx.lineWidth = 2;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.stroke();

  // Details column.
  const colX = cardX + cardW + 56;
  const colW = OG_WIDTH - colX - 64;
  ctx.textAlign = "left";

  ctx.textBaseline = "middle";
  ctx.fillStyle = GOLD_SOFT;
  ctx.font = `700 26px ${fonts.mono}`;
  ctx.fillText(ellipsise(ctx, EVENT_WORDMARK, colW), colX, 132);

  ctx.fillStyle = KELLY_BRIGHT;
  ctx.font = `500 22px ${fonts.mono}`;
  ctx.fillText(ellipsise(ctx, EVENT_DATES, colW), colX, 176);

  const name = (data.name || "Your Name").toUpperCase();
  const nameSize = fitText(ctx, name, fonts.display, 700, 62, 34, colW);
  ctx.fillStyle = GOLD;
  ctx.font = `700 ${nameSize}px ${fonts.display}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(ellipsise(ctx, name, colW), colX, 300);

  if (data.title) {
    const titleSize = fitText(ctx, data.title, fonts.display, 500, 36, 22, colW);
    ctx.fillStyle = KELLY_BRIGHT;
    ctx.font = `500 ${titleSize}px ${fonts.display}`;
    ctx.fillText(ellipsise(ctx, data.title, colW), colX, 352);
  }

  ctx.textBaseline = "middle";
  ctx.fillStyle = GOLD_SOFT;
  ctx.font = `600 19px ${fonts.mono}`;
  ctx.fillText(ellipsise(ctx, EVENT_TAG, colW), colX, 452);

  ctx.fillStyle = KELLY_BRIGHT;
  ctx.font = `500 22px ${fonts.mono}`;
  ctx.fillText("#FrameInGoa", colX, 500);
}
