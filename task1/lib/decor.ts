import type { Decor } from "./templates";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** OffscreenCanvas where available (Safari 16.4+), DOM canvas otherwise. */
export function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctxOf(c: OffscreenCanvas | HTMLCanvasElement): Ctx2D {
  const ctx = (c as HTMLCanvasElement).getContext("2d", { alpha: true });
  if (!ctx) throw new Error("2D context unavailable");
  return ctx as Ctx2D;
}

/**
 * Deterministic PRNG. Grain and barcodes must look identical in the preview and
 * in the exported file — Math.random() would make the download differ from what
 * the user approved on screen.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function paintDecor(ctx: Ctx2D, d: Decor, W: number, H: number, scale: number) {
  ctx.save();
  switch (d.kind) {
    case "gridHorizon": {
      const vpX = W / 2;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      // Verticals converging on the vanishing point.
      for (let i = -d.lines; i <= d.lines; i++) {
        const spread = (i / d.lines) * W * 2.4;
        ctx.beginPath();
        ctx.moveTo(vpX, d.y);
        ctx.lineTo(vpX + spread, H);
        ctx.stroke();
      }
      // Horizontals with perspective spacing.
      ctx.strokeStyle = d.accent;
      for (let i = 1; i <= d.lines; i++) {
        const t = i / d.lines;
        const y = d.y + (H - d.y) * t * t;
        ctx.globalAlpha = 0.16 + 0.4 * t;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      break;
    }
    case "scanlines": {
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = d.color;
      for (let y = 0; y < H; y += d.gap) ctx.fillRect(0, y, W, 1);
      break;
    }
    case "sun": {
      // Punch the retro slices out on a scratch layer so the backdrop shows
      // through, rather than painting bars in an assumed background colour.
      const size = Math.ceil(d.r * 2 * scale);
      const tmp = makeCanvas(size, size);
      const t = ctxOf(tmp);
      t.scale(scale, scale);
      const g = t.createRadialGradient(d.r, d.r * 0.7, d.r * 0.1, d.r, d.r, d.r);
      g.addColorStop(0, d.from);
      g.addColorStop(1, d.to);
      t.fillStyle = g;
      t.beginPath();
      t.arc(d.r, d.r, d.r, 0, Math.PI * 2);
      t.fill();
      if (d.slices) {
        t.globalCompositeOperation = "destination-out";
        for (let i = 0; i < d.slices; i++) {
          const y = d.r + (i / d.slices) * d.r * 1.15;
          const h = 6 + i * 3.5;
          t.fillRect(0, y, d.r * 2, h);
        }
      }
      ctx.drawImage(tmp as CanvasImageSource, d.cx - d.r, d.cy - d.r, d.r * 2, d.r * 2);
      break;
    }
    case "hills": {
      d.colors.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        const lift = 90 - i * 34;
        ctx.moveTo(-40, H);
        ctx.lineTo(-40, d.y + i * 26);
        ctx.bezierCurveTo(
          W * 0.24,
          d.y - lift + i * 26,
          W * 0.62,
          d.y + lift * 0.7 + i * 26,
          W + 40,
          d.y - 24 + i * 26,
        );
        ctx.lineTo(W + 40, H);
        ctx.closePath();
        ctx.fill();
      });
      break;
    }
    case "palms": {
      ctx.fillStyle = d.color;
      ctx.strokeStyle = d.color;
      const rand = mulberry32(9137);
      for (let i = 0; i < d.count; i++) {
        const x = 70 + (i / Math.max(1, d.count - 1)) * (W - 140) + (rand() - 0.5) * 60;
        const hgt = 150 + rand() * 90;
        const lean = (rand() - 0.5) * 46;
        ctx.lineWidth = 9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, d.y);
        ctx.quadraticCurveTo(x + lean * 0.4, d.y - hgt * 0.6, x + lean, d.y - hgt);
        ctx.stroke();
        // Fronds.
        for (let f = 0; f < 6; f++) {
          const a = Math.PI + (f / 5) * Math.PI;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(x + lean, d.y - hgt);
          ctx.quadraticCurveTo(
            x + lean + Math.cos(a) * 52,
            d.y - hgt + Math.sin(a) * 34 - 18,
            x + lean + Math.cos(a) * 92,
            d.y - hgt + Math.sin(a) * 60 + 10,
          );
          ctx.stroke();
        }
      }
      break;
    }
    case "scrim": {
      const g = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
      g.addColorStop(0, withAlpha(d.color, d.from));
      g.addColorStop(1, withAlpha(d.color, d.to));
      ctx.fillStyle = g;
      ctx.fillRect(0, d.y, W, d.h);
      break;
    }
    case "rule": {
      ctx.fillStyle = d.color;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      break;
    }
    case "perforation": {
      ctx.fillStyle = d.color;
      for (let x = d.gap; x < W; x += d.gap) {
        ctx.beginPath();
        ctx.arc(x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "cornerMarks": {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.width;
      const corners: [number, number, number, number][] = [
        [d.inset, d.inset, 1, 1],
        [W - d.inset, d.inset, -1, 1],
        [d.inset, H - d.inset, 1, -1],
        [W - d.inset, H - d.inset, -1, -1],
      ];
      for (const [x, y, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x + sx * d.len, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + sy * d.len);
        ctx.stroke();
      }
      break;
    }
    case "grain": {
      // Render one small noise tile and repeat it — a full-size ImageData at
      // export resolution would cost tens of milliseconds for no visual gain.
      const N = 128;
      const tile = makeCanvas(N, N);
      const t = ctxOf(tile);
      const img = t.createImageData(N, N);
      const rand = mulberry32(4242);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (rand() - 0.5) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      t.putImageData(img, 0, 0);
      const pattern = ctx.createPattern(tile as CanvasImageSource, "repeat");
      if (pattern) {
        ctx.globalAlpha = d.alpha;
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case "panel": {
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = d.color;
      if (d.radius) roundRectPath(ctx, d.x, d.y, d.w, d.h, d.radius);
      else {
        ctx.beginPath();
        ctx.rect(d.x, d.y, d.w, d.h);
      }
      ctx.fill();
      break;
    }
    case "blob": {
      const g = ctx.createRadialGradient(d.cx, d.cy, 0, d.cx, d.cy, d.r);
      g.addColorStop(0, withAlpha(d.color, d.alpha));
      g.addColorStop(1, withAlpha(d.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(d.cx - d.r, d.cy - d.r, d.r * 2, d.r * 2);
      break;
    }
    case "barcode": {
      const rand = mulberry32(20260813);
      ctx.fillStyle = d.color;
      let x = d.x;
      while (x < d.x + d.w - 4) {
        const bw = 2 + Math.floor(rand() * 6);
        if (rand() > 0.34) ctx.fillRect(x, d.y, bw, d.h);
        x += bw + 2 + Math.floor(rand() * 5);
      }
      break;
    }
  }
  ctx.restore();
}

/** Accepts #rgb/#rrggbb/rgb()/rgba() and returns the colour at a given alpha. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
