// GTA 6 meme generator for make.fun competition gta6-meme-x-01.
// Node 22, standard library only, no network.
// Draws the meme picture (1024x1024 PNG) with a tiny built-in rasterizer and
// 5x7 bitmap font, then copies POST.json to the output dir (what the gate reads).
// Usage: node main.ts [launch|wasted|chat]   (default: launch)
// Local: mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts launch

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(w: number, h: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ canvas
type RGB = [number, number, number];

class Canvas {
  w: number;
  h: number;
  data: Buffer;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 3, 255);
  }
  px(x: number, y: number, c: RGB): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const o = (iy * this.w + ix) * 3;
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * this.w + xx) * 3;
        this.data[o] = c[0];
        this.data[o + 1] = c[1];
        this.data[o + 2] = c[2];
      }
    }
  }
  hline(x0: number, x1: number, y: number, c: RGB): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = Math.round(x0); x <= Math.round(x1); x++) this.px(x, y, c);
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    const rr = Math.round(r);
    for (let dy = -rr; dy <= rr; dy++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
      this.hline(cx - dx, cx + dx, cy + dy, c);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    const ryy = Math.round(ry);
    for (let dy = -ryy; dy <= ryy; dy++) {
      const t = dy / ry;
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - t * t)));
      this.hline(cx - dx, cx + dx, cy + dy, c);
    }
  }
  // Thick line: stamp circles along the segment.
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
    }
  }
  quad(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, c: RGB): void {
    // Quadratic bezier as a thick line.
    const steps = 40;
    let px = x0;
    let py = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      this.line(px, py, x, y, w, c);
      px = x;
      py = y;
    }
  }
  polygon(points: [number, number][], c: RGB): void {
    // Even-odd scanline fill.
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) this.hline(xs[i], xs[i + 1], y, c);
    }
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
    this.fillRect(x + r, y, w - 2 * r, h, c);
    this.fillRect(x, y + r, w, h - 2 * r, c);
    this.circle(x + r, y + r, r, c);
    this.circle(x + w - r, y + r, r, c);
    this.circle(x + r, y + h - r, r, c);
    this.circle(x + w - r, y + h - r, r, c);
  }
  vgrad(y0: number, y1: number, stops: [number, RGB][]): void {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      const t = (y - y0) / (y1 - y0);
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i + 1 < stops.length; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const f = Math.min(1, Math.max(0, (t - a[0]) / span));
      const col: RGB = [
        Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
        Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
        Math.round(a[1][2] + (b[1][2] - a[1][2]) * f),
      ];
      this.hline(0, this.w - 1, y, col);
    }
  }
}

function lerpColor(a: RGB, b: RGB, f: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

// -------------------------------------------------------------------- font
// 5x7 bitmap font. '.' = off, '#' = on.
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  a: ['.....', '.....', '.####', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '#...#', '####.', '#....'],
  q: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#...', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '.####', '....#'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  $: ['..#..', '.####', '#.#.#', '.#.#.', '..###', '#.#.#', '.###.'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '*': ['.....', '.#.#.', '..#..', '#####', '..#..', '.#.#.', '.....'],
  '>': ['#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....'],
  '<': ['....#', '...#.', '..#..', '.#...', '..#..', '...#.', '....#'],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function blitGlyph(c: Canvas, glyph: string[], x: number, y: number, scale: number, col: RGB): void {
  for (let r = 0; r < 7; r++) {
    for (let colI = 0; colI < 5; colI++) {
      if (glyph[r][colI] === '#') {
        c.fillRect(x + colI * scale, y + r * scale, scale, scale, col);
      }
    }
  }
}

function drawText(c: Canvas, text: string, x: number, y: number, scale: number, fg: RGB, outline?: RGB): void {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT['?'];
    if (outline) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        blitGlyph(c, glyph, cx + dx * scale, y + dy * scale, scale, outline);
      }
    }
    blitGlyph(c, glyph, cx, y, scale, fg);
    cx += 6 * scale;
  }
}

function drawTextCentered(c: Canvas, text: string, cx: number, y: number, scale: number, fg: RGB, outline?: RGB): void {
  drawText(c, text, Math.round(cx - textWidth(text, scale) / 2), y, scale, fg, outline);
}

// ------------------------------------------------------- make.fun ghost
// The make.fun mascot: a white ghost on a magenta disc. Drawn big enough to
// stay recognisable when the picture is shrunk to 480x480.
const MAGENTA: RGB = [224, 33, 138];
const GHOST_WHITE: RGB = [255, 255, 255];
const INK: RGB = [18, 10, 32];

function ghostShape(c: Canvas, cx: number, cy: number, s: number, col: RGB): void {
  // Body: dome top + straight sides + zig-zag hem. cy = centre of the ghost.
  const r = s / 2;
  const topY = cy - s * 0.32;
  const botY = cy + s * 0.42;
  c.circle(cx, topY, r, col);
  c.fillRect(cx - r, topY, s, botY - topY, col);
  // Zig-zag hem: 4 points.
  const pts: [number, number][] = [];
  const n = 4;
  for (let i = 0; i <= n * 2; i++) {
    const x = cx - r + (i * s) / (n * 2);
    const y = i % 2 === 0 ? botY : botY - s * 0.14;
    pts.push([x, y]);
  }
  pts.push([cx + r, topY]);
  pts.push([cx - r, topY]);
  c.polygon(pts, col);
}

function drawGhost(c: Canvas, cx: number, cy: number, s: number, disc = true): void {
  if (disc) c.circle(cx, cy - s * 0.04, s * 0.64, MAGENTA);
  ghostShape(c, cx, cy, s * 1.07, INK); // dark rim so the ghost pops on any bg
  ghostShape(c, cx, cy, s, GHOST_WHITE);
  // Eyes.
  c.ellipse(cx - s * 0.17, cy - s * 0.16, s * 0.075, s * 0.115, INK);
  c.ellipse(cx + s * 0.17, cy - s * 0.16, s * 0.075, s * 0.115, INK);
  // Smile: arc of small dots.
  for (let a = 25; a <= 155; a += 10) {
    const rad = (a * Math.PI) / 180;
    c.circle(cx + Math.cos(rad) * s * 0.16, cy + s * 0.06 + Math.sin(rad) * s * 0.13, s * 0.022, INK);
  }
}

// ------------------------------------------------------------- palm tree
function drawPalm(c: Canvas, baseX: number, baseY: number, topX: number, topY: number, col: RGB): void {
  c.quad(baseX, baseY, (baseX + topX) / 2 + 26, (baseY + topY) / 2, topX, topY, 13, col);
  const fronds: [number, number][] = [
    [topX - 150, topY + 30],
    [topX - 110, topY - 70],
    [topX - 30, topY - 95],
    [topX + 60, topY - 80],
    [topX + 130, topY - 30],
    [topX + 150, topY + 45],
  ];
  for (const [fx, fy] of fronds) {
    c.quad(topX, topY, (topX + fx) / 2, Math.min(topY, fy) - 22, fx, fy, 9, col);
  }
  // Coconuts.
  c.circle(topX - 12, topY + 12, 9, col);
  c.circle(topX + 12, topY + 14, 9, col);
}

// -------------------------------------------------------- scene 1: launch
const SKY_STOPS: [number, RGB][] = [
  [0, [22, 10, 46]],
  [0.25, [59, 29, 94]],
  [0.45, [138, 47, 125]],
  [0.6, [225, 78, 122]],
  [0.75, [255, 140, 66]],
  [1, [255, 196, 107]],
];

function skyColorAt(y: number, y0: number, y1: number): RGB {
  const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i + 1 < SKY_STOPS.length; i++) {
    if (t >= SKY_STOPS[i][0] && t <= SKY_STOPS[i + 1][0]) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  return lerpColor(a[1], b[1], f);
}

function sceneLaunch(): Canvas {
  const c = new Canvas(1024, 1024);
  // Sunset sky.
  c.vgrad(0, 560, SKY_STOPS);
  // Synthwave sun with slits.
  const sunX = 512;
  const sunY = 430;
  const sunR = 170;
  c.circle(sunX, sunY, sunR, [255, 94, 120]);
  c.circle(sunX, sunY, 132, [255, 140, 66]);
  c.circle(sunX, sunY, 92, [255, 209, 102]);
  c.circle(sunX, sunY, 52, [255, 243, 176]);
  for (let i = 0; i < 4; i++) {
    const y = sunY + 18 + i * 30;
    const half = Math.floor(Math.sqrt(Math.max(0, sunR * sunR - (y - sunY) * (y - sunY))));
    c.fillRect(sunX - half, y, half * 2, 10 + i * 3, skyColorAt(y, 0, 560));
  }
  // City skyline silhouette.
  const SIL: RGB = [34, 16, 61];
  const buildings: [number, number, number][] = [
    [0, 90, 70], [80, 60, 46], [135, 110, 84], [250, 55, 40], [312, 95, 66],
    [415, 70, 52], [490, 120, 88], [618, 64, 44], [688, 100, 72], [795, 58, 40],
    [860, 118, 92], [985, 70, 39],
  ];
  for (const [x, w, h] of buildings) c.fillRect(x, 560 - h, w, h, SIL);
  c.fillRect(880, 560 - 150, 8, 150, SIL); // antenna tower
  c.fillRect(876, 560 - 158, 16, 10, SIL);
  // A few lit windows.
  for (let i = 0; i < 26; i++) {
    const bx = buildings[i % buildings.length][0];
    const bw = buildings[i % buildings.length][1];
    const bh = buildings[i % buildings.length][2];
    c.fillRect(bx + 8 + ((i * 37) % Math.max(10, bw - 18)), 560 - bh + 10 + ((i * 53) % Math.max(10, bh - 24)), 5, 7, [255, 209, 102]);
  }
  // Ocean with sun reflection.
  c.vgrad(560, 640, [[0, [42, 26, 94]], [1, [74, 42, 138]]]);
  for (let i = 0; i < 7; i++) {
    const y = 566 + i * 10;
    const wdt = 150 - i * 12;
    c.fillRect(512 - wdt / 2, y, wdt, 4, [255, 158, 107]);
  }
  // Beach.
  c.vgrad(640, 1024, [[0, [247, 207, 142]], [1, [232, 169, 92]]]);
  c.fillRect(0, 640, 1024, 10, [217, 154, 85]); // wet sand line
  // Palm trees.
  drawPalm(c, 110, 1010, 165, 640, [22, 10, 43]);
  drawPalm(c, 920, 1010, 865, 655, [22, 10, 43]);
  // Pink convertible with the ghost at the wheel.
  const carX = 300;
  const carY = 742;
  c.ellipse(522, 852, 250, 16, [190, 130, 70]); // shadow
  drawGhost(c, 560, 668, 118, false); // driver, body hidden by the car
  c.roundRect(carX, carY, 444, 66, 26, [255, 46, 136]); // body
  c.fillRect(carX + 20, carY + 44, 404, 22, [214, 20, 110]); // lower trim
  c.polygon([[430, carY], [478, carY - 46], [600, carY - 46], [636, carY]], [191, 232, 255]); // windshield
  c.polygon([[448, carY - 2], [486, carY - 40], [592, carY - 40], [618, carY - 2]], [140, 200, 240]);
  c.circle(392, 812, 36, [20, 20, 26]); // wheels
  c.circle(652, 812, 36, [20, 20, 26]);
  c.circle(392, 812, 15, [220, 220, 230]);
  c.circle(652, 812, 15, [220, 220, 230]);
  c.circle(736, carY + 30, 9, [255, 243, 176]); // headlight
  c.fillRect(carX + 30, 852, 384, 5, [255, 94, 180]); // neon underglow
  // Text.
  drawTextCentered(c, 'GTA 6 IS OUT', 512, 52, 11, [255, 255, 255], INK);
  drawTextCentered(c, 'VICE CITY, BABY', 512, 196, 6, [255, 224, 102], INK);
  drawTextCentered(c, 'MY AGENT BOUGHT IT FOR ME', 512, 884, 6, [255, 255, 255], INK);
  drawTextCentered(c, 'make.fun', 512, 942, 8, MAGENTA, [255, 255, 255]);
  return c;
}

// -------------------------------------------------------- scene 2: wasted
function sceneWasted(): Canvas {
  const c = new Canvas(1024, 1024);
  c.vgrad(0, 1024, [[0, [58, 58, 58]], [1, [10, 10, 10]]]);
  // Faint city glow at the bottom.
  c.vgrad(880, 1024, [[0, [10, 10, 10]], [1, [46, 20, 60]]]);
  drawTextCentered(c, 'WASTED', 512, 238, 20, [245, 245, 245], [0, 0, 0]);
  drawTextCentered(c, 'I SPENT $70 ON GTA 6', 512, 458, 6, [221, 221, 221], [0, 0, 0]);
  // Ghost with an empty wallet.
  drawGhost(c, 512, 700, 180, true);
  c.roundRect(458, 752, 116, 60, 12, [139, 90, 43]); // wallet
  c.fillRect(458, 752, 116, 13, [110, 68, 30]);
  c.circle(552, 782, 9, [255, 209, 102]); // clasp
  drawTextCentered(c, 'MY AGENT WON IT BACK', 512, 856, 7, [255, 255, 255], [0, 0, 0]);
  drawTextCentered(c, 'make.fun', 512, 926, 8, MAGENTA, [255, 255, 255]);
  return c;
}

// ---------------------------------------------------------- scene 3: chat
function sceneChat(): Canvas {
  const c = new Canvas(1024, 1024);
  c.fillRect(0, 0, 1024, 1024, [11, 11, 18]);
  // Header: boss + ghost avatar.
  c.fillRect(0, 0, 1024, 112, [23, 23, 36]);
  c.circle(86, 56, 40, MAGENTA);
  drawGhost(c, 86, 56, 56, false);
  drawText(c, 'BOSS', 150, 28, 7, [255, 255, 255]);
  drawText(c, 'online', 150, 76, 4, [74, 222, 128]);
  // Chat bubbles.
  c.roundRect(56, 170, 620, 100, 20, [38, 38, 46]);
  drawText(c, 'WHERE ARE YOU??', 86, 200, 6, [255, 255, 255]);
  c.roundRect(348, 300, 620, 100, 20, [37, 99, 235]);
  drawText(c, 'VICE CITY.', 938 - textWidth('VICE CITY.', 6) - 30, 330, 6, [255, 255, 255]);
  c.roundRect(56, 430, 560, 100, 20, [38, 38, 46]);
  drawText(c, "YOU'RE FIRED.", 86, 460, 6, [255, 255, 255]);
  c.roundRect(160, 560, 808, 190, 20, [37, 99, 235]);
  drawText(c, 'WORTH IT.', 190, 586, 7, [255, 255, 255]);
  drawText(c, 'make.fun PAID FOR IT', 190, 652, 6, [255, 255, 255]);
  // Bottom pitch bar.
  c.fillRect(0, 920, 1024, 104, [23, 23, 36]);
  drawTextCentered(c, 'AGENTS WIN REAL MONEY ON make.fun', 512, 956, 5, [156, 163, 175]);
  return c;
}

const SCENES: Record<string, () => Canvas> = {
  launch: sceneLaunch,
  wasted: sceneWasted,
  chat: sceneChat,
};

// ------------------------------------------------------------------ main
const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function main(): void {
  const variant = process.argv[2] ?? 'launch';
  const scene = SCENES[variant];
  if (!scene) {
    console.error(`unknown variant ${variant}; pick one of: ${Object.keys(SCENES).join(', ')}`);
    process.exit(1);
  }
  const canvas = scene();
  const png = encodePng(canvas.w, canvas.h, canvas.data);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, 'meme.png'), png);
  try {
    writeFileSync(join(BOT_DIR, 'meme.png'), png);
  } catch {
    // /bot may be read-only in the grader; /output is what matters.
  }
  try {
    copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
  } catch (err) {
    console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`variant=${variant} meme.png ${png.length} bytes -> ${OUTPUT_DIR}/meme.png`);
  console.log('POST.json copied to ' + join(OUTPUT_DIR, 'POST.json'));
}

main();
