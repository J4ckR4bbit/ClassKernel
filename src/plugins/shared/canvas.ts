// Small canvas helpers the simulations share (photoelectric effect, collisions,
// reaction rates): sizing a canvas to its box at a fixed scene shape, and the
// lines, arrows and labels their drawings are made of. Everything is drawn in
// "scene units" — a fixed coordinate system per picture — so the same drawing
// code paints the screen and the 300 dpi PNG.

export const FONT = "Arial, Helvetica, sans-serif";
export const INK = "#000";

/**
 * Size a canvas to its box at the scene's shape (as wide as the box, or as big
 * as fits it both ways), clear it to white and set the transform so drawing
 * is in scene units.
 */
export function sizeCanvas(canvas: HTMLCanvasElement, sceneW: number, sceneH: number, fitHeight: boolean): CanvasRenderingContext2D | null {
  const box = canvas.parentElement?.getBoundingClientRect();
  if (!box || box.width < 2) return null;
  let cssW = box.width;
  if (fitHeight && box.height > 2) cssW = Math.min(cssW, (box.height * sceneW) / sceneH);
  const cssH = (cssW * sceneH) / sceneW;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(w / sceneW, 0, 0, h / sceneH, 0, 0);
  return ctx;
}

/** A white canvas of `sceneW × sceneH` scene units at `scale` pixels a unit, for saving. */
export function printCanvas(sceneW: number, sceneH: number, scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sceneW * scale);
  canvas.height = Math.round(sceneH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { canvas, ctx };
}

export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** A filled arrowhead with its tip at (x, y), pointing along `angle`. */
export function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(angle) * size - Math.sin(angle) * size * 0.45, y - Math.sin(angle) * size + Math.cos(angle) * size * 0.45);
  ctx.lineTo(x - Math.cos(angle) * size + Math.sin(angle) * size * 0.45, y - Math.sin(angle) * size - Math.cos(angle) * size * 0.45);
  ctx.closePath();
  ctx.fill();
}

/** A line from (x1, y1) to (x2, y2) with an arrowhead at the far end. */
export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, head = 12) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const back = Math.min(head * 0.8, len);
  line(ctx, x1, y1, x2 - Math.cos(a) * back, y2 - Math.sin(a) * back);
  arrowHead(ctx, x2, y2, a, Math.min(head, len));
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, align: CanvasTextAlign = "center", size = 18, colour = INK, weight = "400") {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}

/**
 * Text with subscripts written `E_K` or `E_{K(max)}`, drawn left to right from
 * a centre, left or right anchor. Returns the width drawn.
 */
export function richText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, align: CanvasTextAlign = "center", size = 18, colour = INK, weight = "400"): number {
  const runs = subscriptRuns(s);
  const widths = runs.map(([t, sub]) => {
    ctx.font = `${weight} ${sub ? Math.round(size * 0.7) : size}px ${FONT}`;
    return ctx.measureText(t).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let left = align === "center" ? x - total / 2 : align === "right" || align === "end" ? x - total : x;
  runs.forEach(([t, sub], i) => {
    text(ctx, t, left, sub ? y + size * 0.28 : y, "left", sub ? Math.round(size * 0.7) : size, colour, weight);
    left += widths[i];
  });
  return total;
}

/** "E_{K(max)} = 3" → [["E", false], ["K(max)", true], [" = 3", false]]. */
export function subscriptRuns(s: string): Array<[string, boolean]> {
  const out: Array<[string, boolean]> = [];
  let plainText = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "_" && i > 0 && i + 1 < s.length) {
      if (plainText) out.push([plainText, false]);
      plainText = "";
      if (s[i + 1] === "{") {
        const end = s.indexOf("}", i + 2);
        out.push([s.slice(i + 2, end < 0 ? undefined : end), true]);
        i = end < 0 ? s.length : end + 1;
      } else {
        out.push([s[i + 1], true]);
        i += 2;
      }
    } else plainText += s[i++];
  }
  if (plainText) out.push([plainText, false]);
  return out;
}

/** A seeded random number generator (mulberry32), so a run can be repeated and tested. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
