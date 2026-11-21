// The Catalogue Photo of an Impossible Gadget — entry program (Node 22, stdlib only).
// Writes one image to /output/entry.png: a studio catalogue photograph of an
// impossible gadget — a smooth river stone being charged on a wireless pad.
// The picture is drawn entirely by this program: a small RGB rasterizer,
// a pure PNG encoder (node:zlib), and a hand-written 5x7 bitmap font.
// No network, no downloaded assets, no server. Exits immediately.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

function idx(x: number, y: number): number {
  return (y * W + x) * 3;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Blend one pixel toward (r,g,b) by alpha 0..1.
function blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = idx(xi, yi);
  buf[i] = clamp255(buf[i] * (1 - a) + r * a);
  buf[i + 1] = clamp255(buf[i + 1] * (1 - a) + g * a);
  buf[i + 2] = clamp255(buf[i + 2] * (1 - a) + b * a);
}

function setPx(x: number, y: number, r: number, g: number, b: number): void {
  blend(x, y, r, g, b, 1);
}

// Deterministic PRNG (mulberry32) so the picture is identical every run.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261121);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fillCircle(cx: number, cy: number, rad: number, r: number, g: number, b: number, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) blend(x, y, r, g, b, a);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) blend(x, y, r, g, b, a);
    }
  }
}

// Ellipse outline, angles in radians.
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, r: number, g: number, b: number, a: number): void {
  const steps = Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry));
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    fillCircle(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, w / 2, r, g, b, a);
  }
}

// Signed distance to a rounded rect; fill where d <= 0.
function roundRectSdf(x: number, y: number, cx: number, cy: number, hw: number, hh: number, rad: number): number {
  const qx = Math.abs(x - cx) - (hw - rad);
  const qy = Math.abs(y - cy) - (hh - rad);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rad;
}

function fillRoundRect(x0: number, y0: number, x1: number, y1: number, rad: number, r: number, g: number, b: number, a: number): void {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2;
  const hh = (y1 - y0) / 2;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      if (roundRectSdf(x + 0.5, y + 0.5, cx, cy, hw, hh, rad) <= 0) blend(x, y, r, g, b, a);
    }
  }
}

function fillPolygon(pts: Array<[number, number]>, r: number, g: number, b: number, a: number): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.max(0, Math.ceil(xs[i])); x <= Math.min(W - 1, Math.floor(xs[i + 1])); x++) {
        blend(x, y, r, g, b, a);
      }
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, r: number, g: number, b: number, a: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(lerp(x0, x1, t), lerp(y0, y1, t), w / 2, r, g, b, a);
  }
}

function cubic(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number] {
  const u = 1 - t;
  const x =
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
  const y =
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
  return [x, y];
}

function thickBezier(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], w: number, r: number, g: number, b: number, a: number): void {
  const steps = 120;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const cur = cubic(p0, p1, p2, p3, i / steps);
    thickLine(prev[0], prev[1], cur[0], cur[1], w, r, g, b, a);
    prev = cur;
  }
}

// ---- 5x7 bitmap font (hand-written) ----
const FONT: Record<string, string[]> = {
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "%": ["#...#", "#..#.", "...#.", "..#..", ".#...", "#..#.", "#...#"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

function drawText(str: string, cx: number, y: number, scale: number, r: number, g: number, b: number, a: number): void {
  const adv = 6 * scale;
  const width = str.length * adv - scale;
  let x = Math.round(cx - width / 2);
  for (const ch of str) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] === "#") {
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                blend(x + col * scale + dx, y + row * scale + dy, r, g, b, a);
              }
            }
          }
        }
      }
    }
    x += adv;
  }
}

// ---- Scene: studio catalogue shot ----

// 1. Seamless studio backdrop: vertical gradient + soft radial key light + vignette.
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const baseR = lerp(238, 199, t);
  const baseG = lerp(238, 199, t);
  const baseB = lerp(242, 205, t);
  for (let x = 0; x < W; x++) {
    const dx = (x - 512) / 460;
    const dy = (y - 400) / 460;
    const d2 = dx * dx + dy * dy;
    const glow = d2 < 1 ? (1 - d2) * (1 - d2) * 14 : 0;
    const vx = (x - 512) / 724;
    const vy = (y - 512) / 724;
    const vig = 1 - 0.09 * (vx * vx + vy * vy);
    const i = idx(x, y);
    buf[i] = clamp255((baseR + glow) * vig);
    buf[i + 1] = clamp255((baseG + glow) * vig);
    buf[i + 2] = clamp255((baseB + glow) * vig);
  }
}

// 2. Soft floor shadow under the pad.
fillEllipse(512, 804, 350, 52, 40, 40, 48, 0.1);
fillEllipse(512, 802, 300, 42, 40, 40, 48, 0.1);
fillEllipse(512, 800, 240, 32, 40, 40, 48, 0.08);

// 3. The charging pad (the gadget): matte black slab, rounded corners.
fillRoundRect(212, 600, 812, 790, 36, 34, 34, 40, 1);
fillRoundRect(212, 600, 812, 776, 36, 22, 22, 26, 1);
// Top edge highlight.
thickLine(252, 602, 772, 602, 3, 74, 74, 84, 0.7);
// Bottom edge thickness.
fillRoundRect(216, 776, 808, 790, 12, 12, 12, 14, 1);

// 4. Contact shadow + glowing charge ring under the stone.
fillEllipse(512, 688, 165, 20, 0, 0, 0, 0.3);
arc(512, 688, 208, 40, 0, Math.PI * 2, 4, 70, 224, 106, 0.55);

// 5. LED indicator on the pad.
fillCircle(745, 640, 16, 70, 224, 106, 0.15);
fillCircle(745, 640, 5, 70, 224, 106, 1);
fillCircle(744, 639, 2, 220, 255, 225, 0.9);

// 6. The stone: irregular blob, vertical granite gradient, speckles, highlight.
const rockCx = 512;
const rockCy = 500;
function rockRadius(theta: number): number {
  return (
    168 +
    12 * Math.sin(3 * theta + 0.7) +
    7 * Math.sin(7 * theta + 2.1) +
    5 * Math.sin(11 * theta + 0.3)
  );
}
for (let y = 310; y <= 700; y++) {
  for (let x = 320; x <= 705; x++) {
    const dx = x - rockCx;
    const dy = y - rockCy;
    const theta = Math.atan2(dy, dx);
    const rr = Math.hypot(dx, dy);
    if (rr <= rockRadius(theta)) {
      const t = (y - 330) / 360;
      const r = lerp(158, 82, t);
      const g = lerp(161, 84, t);
      const b = lerp(168, 92, t);
      setPx(x, y, r, g, b);
    }
  }
}
// Speckles: small darker and lighter mineral flecks inside the stone.
for (let i = 0; i < 420; i++) {
  const a = rand() * Math.PI * 2;
  const rr = Math.sqrt(rand()) * (rockRadius(a) - 12);
  const x = rockCx + Math.cos(a) * rr;
  const y = rockCy + Math.sin(a) * rr * 0.96;
  const dark = rand() < 0.6;
  const rad = 1 + rand() * 1.6;
  if (dark) fillCircle(x, y, rad, 70, 72, 78, 0.5);
  else fillCircle(x, y, rad, 185, 188, 195, 0.45);
}
// Key-light highlight, top-left of the stone.
fillEllipse(445, 412, 74, 46, 255, 255, 255, 0.16);
fillEllipse(428, 396, 38, 24, 255, 255, 255, 0.1);
// Rim light on the right edge.
arc(rockCx, rockCy, 166, 163, -1.0, 1.0, 5, 223, 226, 232, 0.22);

// 7. The one accessory: a cable snaking from the pad to a USB-C plug.
const cableStart: [number, number] = [812, 700];
const cableC1: [number, number] = [872, 706];
const cableC2: [number, number] = [926, 828];
const cableEnd: [number, number] = [884, 920];
// Cable shadow on the floor.
thickBezier([812, 708], [872, 714], [926, 836], [884, 928], 15, 40, 40, 48, 0.1);
// Cable body + lighter core line.
thickBezier(cableStart, cableC1, cableC2, cableEnd, 13, 28, 28, 33, 1);
thickBezier(cableStart, cableC1, cableC2, cableEnd, 4, 66, 66, 76, 0.8);
// USB-C plug: rotated silver shell + dark tip, lying at the cable end.
const plugCx = 908;
const plugCy = 906;
const ang = -0.6;
const cosA = Math.cos(ang);
const sinA = Math.sin(ang);
function rotPt(lx: number, ly: number): [number, number] {
  return [plugCx + lx * cosA - ly * sinA, plugCy + lx * sinA + ly * cosA];
}
fillPolygon(
  [rotPt(-26, -11), rotPt(26, -11), rotPt(26, 11), rotPt(-26, 11)],
  201, 206, 214, 1,
);
fillPolygon(
  [rotPt(-26, 2), rotPt(26, 2), rotPt(26, 11), rotPt(-26, 11)],
  150, 155, 163, 1,
);
fillPolygon(
  [rotPt(-38, -6), rotPt(-26, -6), rotPt(-26, 6), rotPt(-38, 6)],
  34, 36, 42, 1,
);
thickLine(rotPt(-26, -11)[0], rotPt(-26, -11)[1], rotPt(26, -11)[0], rotPt(26, -11)[1], 2, 143, 149, 158, 0.9);

// 8. Brand text printed on the pad (text belongs to the product).
drawText("ROCKCHARGE", 512, 740, 2, 185, 185, 194, 0.95);
drawText("STONE CHARGER", 512, 766, 1, 126, 126, 136, 0.9);

// ---- Pure PNG encoder ----
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, Buffer.from(data)])), 0);
  return Buffer.concat([len, typeBuf, Buffer.from(data), crc]);
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter: none
  Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", deflateSync(raw, { level: 9 })),
  pngChunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "./output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), png);
console.log(`wrote entry.png ${png.length} bytes ${W}x${H}`);
process.exit(0);
