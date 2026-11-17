import { moonPath } from "./body-render";
import type { Scene, SceneBody } from "./scene";

const PLANET_COLORS: Record<string, string> = {
  mercury: "#c9c3b8",
  venus: "#fff4d6",
  mars: "#ff8a5c",
  jupiter: "#f3d9b1",
  saturn: "#e8d18f",
};

/** Background layer: sky gradient, constellation lines, stars, ground. */
export function drawSky(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  colors: { top: string; bottom: string },
  w: number,
  h: number,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, colors.top);
  g.addColorStop(1, colors.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.lineWidth = 1;
  for (const l of scene.lines) {
    ctx.strokeStyle = `rgba(120,150,255,${0.35 * l.a})`;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }

  for (const s of scene.stars) {
    if (s.r > 1.8) {
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
      glow.addColorStop(0, `rgba(200,220,255,${0.35 * s.a})`);
      glow.addColorStop(1, "rgba(200,220,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (scene.ground.length >= 3) {
    ctx.fillStyle = "rgba(10,12,20,0.92)";
    ctx.beginPath();
    scene.ground.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
  if (scene.horizon.length >= 2) {
    ctx.strokeStyle = "rgba(80,200,150,0.55)";
    ctx.beginPath();
    scene.horizon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}

/** Top layer: obstructions, constellation names, bodies with labels. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  highlight: Set<string>,
  hover: string | null,
  moon: { ill: number; phase: number } | null,
  w: number,
  h: number,
): void {
  ctx.clearRect(0, 0, w, h);
  for (const poly of scene.obstructions) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.strokeStyle = "rgba(255,110,110,0.7)";
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.font = "italic 12px system-ui, sans-serif";
  for (const l of scene.labels) {
    ctx.fillStyle = `rgba(170,185,255,${0.6 * l.a})`;
    ctx.fillText(l.text, l.x, l.y);
  }

  ctx.textAlign = "left";
  ctx.font = "13px system-ui, sans-serif";
  for (const b of scene.bodies) drawBody(ctx, b, highlight.has(b.id), hover === b.id, moon);
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  b: SceneBody,
  highlighted: boolean,
  hovered: boolean,
  moon: { ill: number; phase: number } | null,
): void {
  ctx.globalAlpha = b.a;
  if (b.kind === "sun") {
    const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 34);
    glow.addColorStop(0, "rgba(255,240,170,0.9)");
    glow.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff3b0";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.kind === "moon") {
    const r = 11;
    ctx.fillStyle = "#2a2f45";
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    const d = moon ? moonPath(moon.ill, moon.phase) : "";
    if (d && typeof Path2D !== "undefined") {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(r, r);
      ctx.fillStyle = "#f4f1e6";
      ctx.fill(new Path2D(d));
      ctx.restore();
    }
  } else {
    const r = b.kind === "planet" ? 4.5 : 3.5;
    ctx.fillStyle = PLANET_COLORS[b.id] ?? "#ffe7b0";
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (highlighted || hovered) {
    ctx.strokeStyle = hovered ? "#ffffff" : "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.kind === "sun" ? 15 : b.kind === "moon" ? 15 : 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(b.name, b.x + 12, b.y + 4);
  ctx.globalAlpha = 1;
}

/** Id of the body nearest to (x, y) within `radius` pixels. */
export function hitTest(scene: Scene, x: number, y: number, radius = 14): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const b of scene.bodies) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= bestD) {
      best = b.id;
      bestD = d;
    }
  }
  return best;
}
