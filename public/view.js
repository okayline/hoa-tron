// HOA Wars drawing: the town, the SUVs and trails, the coffees, the HOA Newsletter, the minimap and the stats row.
import { TW, TH, TX, TY, W, H, N, TILES, solid, trail, stepAt, coffee, riders } from './sim.js';

export const CELL = 24;
const cs = getComputedStyle(document.documentElement);
export const tok = n => cs.getPropertyValue(n).trim();
const C = {};
['bg', 'ink', 'grass', 'grass-stripe', 'road', 'walk', 'walk-line', 'stripe', 'lawn', 'drive', 'hoa', 'window', 'leaf', 'leaf-hi',
  'mail', 'fence', 'fence-base', 'doris', 'gladys', 'peggy', 'line', 'water', 'water-hi', 'asphalt', 'field', 'concrete', 'brick',
  'roof-d'].forEach(k => { C[k] = tok('--' + k); });
const tone = t => t.startsWith('--') ? tok(t) : t;

const rr = (g, x, y, w, h, r) => {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

// ---------- the town: each block is painted once into its own picture (the 24 most recent are kept) ----------
let b = null; // the block picture being painted
const fill = (x0, y0, x1, y1, color) => { b.fillStyle = color; b.fillRect(x0 * CELL, y0 * CELL, (x1 - x0 + 1) * CELL, (y1 - y0 + 1) * CELL); };
function walk(x0, y0, x1, y1) {
  fill(x0, y0, x1, y1, C.walk);
  b.strokeStyle = C['walk-line']; b.lineWidth = 1; b.beginPath();
  if (x1 - x0 >= y1 - y0) for (let x = x0; x <= x1 + 1; x++) { b.moveTo(x * CELL + 0.5, y0 * CELL); b.lineTo(x * CELL + 0.5, (y1 + 1) * CELL); }
  else for (let y = y0; y <= y1 + 1; y++) { b.moveTo(x0 * CELL, y * CELL + 0.5); b.lineTo((x1 + 1) * CELL, y * CELL + 0.5); }
  b.stroke();
}
const disc = (cx, cy, r, color) => { b.fillStyle = color; b.beginPath(); b.arc(cx * CELL, cy * CELL, r * CELL, 0, Math.PI * 2); b.fill(); };
const lot = (x0, y0, x1, y1, color) => { b.fillStyle = color || C.asphalt; rr(b, x0 * CELL, y0 * CELL, (x1 - x0 + 1) * CELL, (y1 - y0 + 1) * CELL, 6); b.fill(); };
function lines(x0, y0, x1, y1) {
  b.strokeStyle = C.ink; b.globalAlpha = 0.45; b.lineWidth = 2;
  b.strokeRect(x0 * CELL + 4, y0 * CELL + 4, (x1 - x0 + 1) * CELL - 8, (y1 - y0 + 1) * CELL - 8);
  b.beginPath(); b.moveTo(((x0 + x1 + 1) / 2) * CELL, y0 * CELL + 4); b.lineTo(((x0 + x1 + 1) / 2) * CELL, (y1 + 1) * CELL - 4); b.stroke();
  b.globalAlpha = 1;
}
function field(x0, y0, x1, y1) {
  fill(x0, y0, x1, y1, C.field); lines(x0, y0, x1, y1);
  b.strokeStyle = C.ink; b.globalAlpha = 0.45; b.beginPath(); b.arc(((x0 + x1 + 1) / 2) * CELL, ((y0 + y1 + 1) / 2) * CELL, 2.5 * CELL, 0, Math.PI * 2); b.stroke(); b.globalAlpha = 1;
}
const court = (x0, y0, x1, y1) => { fill(x0, y0, x1, y1, C['roof-d']); lines(x0, y0, x1, y1); };
function water(px, py, pw, ph, round) {
  b.fillStyle = C.water; rr(b, px, py, pw, ph, round); b.fill();
  b.strokeStyle = C['water-hi']; b.globalAlpha = 0.5; b.lineWidth = 1.5; b.beginPath();
  for (let y = py + 10; y < py + ph - 6; y += 14) for (let x = px + 8 + (y % 28); x < px + pw - 14; x += 34) { b.moveTo(x, y); b.quadraticCurveTo(x + 4, y - 3, x + 8, y); }
  b.stroke(); b.globalAlpha = 1;
}
function streets() {
  fill(6, 6, 33, 9, C.road); fill(6, 16, 33, 19, C.road);
  fill(6, 10, 9, 15, C.road); fill(30, 10, 33, 15, C.road);
  walk(0, 5, 39, 5); walk(0, 20, 39, 20);
  walk(5, 6, 5, 19); walk(34, 6, 34, 19);
  walk(10, 10, 29, 10); walk(10, 15, 29, 15);
  walk(10, 11, 10, 14); walk(29, 11, 29, 14);
  b.save(); b.strokeStyle = C.stripe; b.lineWidth = 2; b.setLineDash([12, 10]); b.beginPath();
  b.moveTo(10 * CELL, 8 * CELL); b.lineTo(30 * CELL, 8 * CELL);
  b.moveTo(10 * CELL, 18 * CELL); b.lineTo(30 * CELL, 18 * CELL);
  b.moveTo(8 * CELL, 10 * CELL); b.lineTo(8 * CELL, 16 * CELL);
  b.moveTo(32 * CELL, 10 * CELL); b.lineTo(32 * CELL, 16 * CELL);
  b.stroke(); b.restore();
}
// the ground of each kind of block, drawn under its things
const GROUND = {
  street: streets, bright: streets,
  culdesac: () => { fill(0, 11, 29, 14, C.road); disc(33.5, 12.5, 5.3, C.road); disc(33.5, 12.5, 1.7, C.lawn); walk(0, 10, 28, 10); walk(0, 15, 28, 15); },
  park: () => { walk(0, 12, 39, 13); walk(19, 0, 20, 25); },
  mall: () => {
    lot(1, 8, 38, 23);
    b.strokeStyle = C.hoa; b.globalAlpha = 0.35; b.lineWidth = 1.5; b.beginPath();
    for (let x = 2; x <= 38; x += 2) { b.moveTo(x * CELL, 9.6 * CELL); b.lineTo(x * CELL, 11 * CELL); b.moveTo(x * CELL, 20 * CELL); b.lineTo(x * CELL, 21.4 * CELL); }
    b.stroke(); b.globalAlpha = 1;
  },
  school: () => { lot(9, 10, 17, 21); field(21, 3, 37, 22); },
  hoa: () => { walk(0, 5, 39, 5); walk(0, 20, 39, 20); court(2, 8, 10, 17); },
  plant: () => { lot(19, 16, 37, 23); lot(2, 11, 16, 16); },
  square: () => {
    fill(0, 6, 39, 9, C.road); fill(0, 16, 39, 19, C.road); fill(6, 0, 9, 25, C.road); fill(30, 0, 33, 25, C.road);
    lot(11, 10, 28, 15, C.walk);
  },
  river: () => { fill(0, 11, 39, 14, C.road); fill(17, 11, 22, 14, C.concrete); }
};

function house(h) {
  const x = h.x * CELL, y = h.y * CELL, w = h.w * CELL, hh = h.h * CELL;
  const rot = { down: 0, left: Math.PI / 2, up: Math.PI, right: -Math.PI / 2 }[h.face];
  const side = h.face === 'left' || h.face === 'right';
  const lw = side ? hh : w, lh = side ? w : hh;
  b.save(); b.translate(x + w / 2, y + hh / 2); b.rotate(rot);
  b.fillStyle = C.lawn; rr(b, -lw / 2 + 1, -lh / 2 + 1, lw - 2, lh - 2, 5); b.fill();
  const m = CELL * 0.3, dw = CELL * 1.5;
  b.fillStyle = C.drive; b.fillRect(lw * 0.2 - dw / 2, lh / 2 - m * 1.6 - 1, dw, m * 1.6 + 1 + CELL);
  const rx = -lw / 2 + m, ry = -lh / 2 + m, rw = lw - 2 * m, rh = lh - m - m * 1.6;
  b.fillStyle = tone(h.tone); rr(b, rx, ry, rw, rh, 3); b.fill();
  b.globalAlpha = 0.25; b.strokeStyle = h.hoa ? C.bg : C.ink; b.lineWidth = 2; b.beginPath();
  if (rw >= rh) { b.moveTo(rx + 4, ry + rh / 2); b.lineTo(rx + rw - 4, ry + rh / 2); } else { b.moveTo(rx + rw / 2, ry + 4); b.lineTo(rx + rw / 2, ry + rh - 4); }
  b.stroke(); b.globalAlpha = 1;
  b.fillStyle = C.bg; b.fillRect(rx + rw * 0.2, ry + rh * 0.2, 5, 5);
  const lx = lw * 0.2 - dw / 2 - 5, ly = lh / 2 - 6, gl = b.createRadialGradient(lx, ly, 0, lx, ly, 9);
  gl.addColorStop(0, C.window); gl.addColorStop(0.27, C.window); gl.addColorStop(0.3, 'rgba(255,210,122,0.45)'); gl.addColorStop(1, 'rgba(255,210,122,0)');
  b.fillStyle = gl; b.beginPath(); b.arc(lx, ly, 9, 0, Math.PI * 2); b.fill();
  if (h.hoa) {
    b.fillStyle = C.bg; b.font = '600 13px "IBM Plex Mono", monospace'; b.textAlign = 'center'; b.textBaseline = 'middle';
    b.fillText('HOA', rx + rw / 2, ry + rh / 2 + 1);
  }
  b.restore();
}
function greenery(t, puffs, his) {
  const cx = (t.x + 0.5) * CELL, cy = (t.y + 0.5) * CELL;
  b.fillStyle = C.lawn; rr(b, t.x * CELL + 1, t.y * CELL + 1, CELL - 2, CELL - 2, 6); b.fill();
  b.fillStyle = C.leaf; puffs.forEach(([dx, dy, r]) => { b.beginPath(); b.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); b.fill(); });
  b.fillStyle = C['leaf-hi']; his.forEach(([dx, dy, r]) => { b.beginPath(); b.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); b.fill(); });
}
function flatRoof(t) {
  const x = t.x * CELL + 2, y = t.y * CELL + 2, w = t.w * CELL - 4, h = t.h * CELL - 4;
  b.fillStyle = tone(t.tone); rr(b, x, y, w, h, 3); b.fill();
  b.fillStyle = 'rgba(0, 0, 0, 0.22)'; b.fillRect(x + 6, y + 6, Math.min(18, w / 4), Math.min(12, h / 4));
  b.strokeStyle = C.ink; b.globalAlpha = 0.18; b.lineWidth = 2; b.strokeRect(x + 4, y + 4, w - 8, h - 8); b.globalAlpha = 1;
}
function thing(t) {
  const x = (t.x || 0) * CELL, y = (t.y || 0) * CELL, w = (t.w || 0) * CELL, h = (t.h || 0) * CELL;
  switch (t.k) {
    case 'house': case 'hoa': return house(t);
    case 'tree': return greenery(t, [[0, 0, CELL * 0.46]], [[-3, -3, CELL * 0.22]]);
    case 'bush': return greenery(t, [[-5, 3, 7], [5, 3, 7], [0, -4, 8]], [[-6, 1, 2.6], [4, 1, 2.6], [-1, -6, 3]]);
    case 'water': return water(x, y, w, h, 2);
    case 'pond':
      b.save(); b.beginPath(); b.ellipse(t.cx * CELL, t.cy * CELL, t.rx * CELL, t.ry * CELL, 0, 0, Math.PI * 2); b.clip();
      water((t.cx - t.rx) * CELL, (t.cy - t.ry) * CELL, t.rx * 2 * CELL, t.ry * 2 * CELL, 0); b.restore(); return;
    case 'pool': b.fillStyle = C.walk; rr(b, x, y, w, h, 4); b.fill(); return water(x + 5, y + 5, w - 10, h - 10, 3);
    case 'tower': {
      const cx = t.cx * CELL, cy = t.cy * CELL, r = t.rx * CELL;
      b.fillStyle = C.concrete; b.beginPath(); b.arc(cx, cy, r - 2, 0, Math.PI * 2); b.fill();
      b.fillStyle = 'rgba(0, 0, 0, 0.35)'; b.beginPath(); b.arc(cx, cy, r * 0.62, 0, Math.PI * 2); b.fill();
      b.fillStyle = C.bg; b.beginPath(); b.arc(cx, cy, r * 0.5, 0, Math.PI * 2); b.fill();
      b.fillStyle = C.peggy; b.globalAlpha = 0.18; b.beginPath(); b.arc(cx, cy, r * 0.42, 0, Math.PI * 2); b.fill(); b.globalAlpha = 1;
      return;
    }
    case 'bldg': case 'shop':
      flatRoof(t);
      if (t.k === 'shop') {
        b.strokeStyle = C.bg; b.lineWidth = 2; b.beginPath();
        for (let i = 1; i < t.parts; i++) { const sx = x + w * i / t.parts; b.moveTo(sx, y + 2); b.lineTo(sx, y + h - 2); }
        b.stroke();
        b.fillStyle = C.window; b.globalAlpha = 0.8;
        for (let i = 0; i < t.parts; i++) b.fillRect(x + w * i / t.parts + 8, y + h - 5, w / t.parts - 16, 3);
        b.globalAlpha = 1;
      }
      if (t.stacks) { b.fillStyle = C.bg; [0.25, 0.5, 0.75].forEach(f => { b.beginPath(); b.arc(x + w * f, y + h * 0.5, 7, 0, Math.PI * 2); b.fill(); }); }
      if (t.dome) { b.fillStyle = C.hoa; b.globalAlpha = 0.7; b.beginPath(); b.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2); b.fill(); b.globalAlpha = 1; }
      if (t.steeple) { b.fillStyle = C.hoa; b.beginPath(); b.moveTo(x + w / 2, y + 6); b.lineTo(x + w / 2 + 12, y + h / 2); b.lineTo(x + w / 2, y + h - 6); b.lineTo(x + w / 2 - 12, y + h / 2); b.closePath(); b.fill(); }
      return;
    case 'car':
      b.fillStyle = tone(t.tone); rr(b, x + 6, y + 2, w - 12, h - 4, 3); b.fill();
      b.fillStyle = 'rgba(0, 0, 0, 0.35)'; b.fillRect(x + 8, y + 7, w - 16, 4); return;
    case 'statue':
      b.fillStyle = C.concrete; rr(b, x + 4, y + 4, w - 8, h - 8, 6); b.fill();
      b.fillStyle = C.ink; b.globalAlpha = 0.7; b.beginPath(); b.arc(x + w / 2, y + h / 2, 7, 0, Math.PI * 2); b.fill(); b.globalAlpha = 1; return;
    case 'play':
      b.fillStyle = C.lawn; rr(b, x, y, w, h, 5); b.fill();
      b.strokeStyle = C.doris; b.lineWidth = 3; b.beginPath(); b.moveTo(x + 8, y + h - 6); b.lineTo(x + 8, y + 6); b.lineTo(x + w - 8, y + 6); b.lineTo(x + w - 8, y + h - 6); b.stroke();
      b.fillStyle = C.mail; b.fillRect(x + w / 2 - 6, y + h / 2, 12, 6); return;
    case 'bleach': b.fillStyle = C.concrete; b.fillRect(x + 3, y, w - 6, h); b.fillStyle = C.bg; for (let k = y + 6; k < y + h; k += 8) b.fillRect(x + 3, k, w - 6, 2); return;
    case 'chain': b.strokeStyle = C.concrete; b.lineWidth = 2; b.setLineDash([3, 3]); b.beginPath(); b.moveTo(x, y + h / 2); b.lineTo(x + w, y + h / 2); b.stroke(); b.setLineDash([]); return;
    case 'barrel': b.fillStyle = C.doris; b.beginPath(); b.arc(x + w / 2, y + h / 2, 7, 0, Math.PI * 2); b.fill(); b.fillStyle = C.peggy; b.beginPath(); b.arc(x + w / 2, y + h / 2, 3.5, 0, Math.PI * 2); b.fill();
  }
}

const pics = new Map(), spare = [];
let paintedNow = 0;
function tilePic(ti) {
  let pic = pics.get(ti);
  if (pic) { pics.delete(ti); pics.set(ti, pic); return pic; }
  paintedNow++;
  pic = spare.pop();
  if (!pic) { pic = document.createElement('canvas'); pic.width = TW * CELL; pic.height = TH * CELL; }
  b = pic.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = 1;
  b.fillStyle = C.grass; b.fillRect(0, 0, pic.width, pic.height);
  b.fillStyle = C['grass-stripe']; for (let x = 0; x < TW; x += 2) b.fillRect(x * CELL, 0, CELL, TH * CELL);
  const t = TILES[ti];
  if (GROUND[t.kind]) GROUND[t.kind]();
  t.T.forEach(thing);
  pics.set(ti, pic);
  if (pics.size > 24) { const old = pics.keys().next().value; spare.push(pics.get(old)); pics.delete(old); }
  return pic;
}
export function repaint() { pics.forEach(p => spare.push(p)); pics.clear(); }
// one block near the camera is painted ahead of time per quiet frame, so none is painted the moment it comes into view
function warm(camX, camY, vw, vh) {
  const cx = Math.floor((camX + vw / 2) / (TW * CELL)), cy = Math.floor((camY + vh / 2) / (TH * CELL));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const tx = cx + dx, ty = cy + dy;
    if (tx < 0 || ty < 0 || tx >= TX || ty >= TY) continue;
    if (!pics.has(ty * TX + tx)) { tilePic(ty * TX + tx); return; }
  }
}
function fence(g, x0, y0, x1, y1) {
  const lo = v => Math.max(0, Math.floor(v / 6) * 6);
  g.fillStyle = C['fence-base'];
  g.fillRect(0, 0, W * CELL, CELL); g.fillRect(0, (H - 1) * CELL, W * CELL, CELL);
  g.fillRect(0, 0, CELL, H * CELL); g.fillRect((W - 1) * CELL, 0, CELL, H * CELL);
  g.fillStyle = C.fence; g.globalAlpha = 0.8;
  const top = y0 < CELL, bot = y1 > (H - 1) * CELL, left = x0 < CELL, right = x1 > (W - 1) * CELL;
  if (top || bot) for (let px = lo(x0); px < Math.min(x1, W * CELL); px += 6) {
    if (top) g.fillRect(px + 1, 4, 3, CELL - 8);
    if (bot) g.fillRect(px + 1, (H - 1) * CELL + 4, 3, CELL - 8);
  }
  if (left || right) for (let py = lo(y0); py < Math.min(y1, H * CELL); py += 6) {
    if (left) g.fillRect(4, py + 1, CELL - 8, 3);
    if (right) g.fillRect((W - 1) * CELL + 4, py + 1, CELL - 8, 3);
  }
  g.globalAlpha = 1;
}

// ---------- glows are painted once into small pictures and copied (canvas shadowBlur is slow, above all on iPhones) ----------
const sprites = new Map();
function sprite(key, w, h, paint) {
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d'); g.scale(2, 2); g.translate(w / 2, h / 2); paint(g);
    sprites.set(key, c);
  }
  return c;
}
function paintCup(g, outline) {
  g.save();
  if (outline) {
    g.strokeStyle = C.bg; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-6, -5); g.lineTo(6, -5); g.lineTo(4, 9); g.lineTo(-4, 9); g.closePath(); g.stroke();
    g.strokeRect(-7, -7, 14, 3); g.strokeRect(1, -13, 2, 7);
  }
  g.shadowColor = C.window; g.shadowBlur = 8;
  g.fillStyle = 'rgba(236, 233, 251, 0.35)';
  g.beginPath(); g.moveTo(-6, -5); g.lineTo(6, -5); g.lineTo(4, 9); g.lineTo(-4, 9); g.closePath(); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#8a5a34';
  g.beginPath(); g.moveTo(-5.4, -1); g.lineTo(5.4, -1); g.lineTo(4, 8); g.lineTo(-4, 8); g.closePath(); g.fill();
  g.fillStyle = C.ink; g.fillRect(-7, -7, 14, 3);
  g.fillStyle = C.peggy; g.fillRect(1, -13, 2, 7);
  g.restore();
}
function cup(ctx, cx, cy, size = 1, outline = false) {
  ctx.drawImage(sprite('cup' + outline, 40, 44, g => paintCup(g, outline)), cx - 20 * size, cy - 22 * size, 40 * size, 44 * size);
}
function suv(ctx, r, color, cx, cy) {
  const a = r.alive ? 1 : 0.45;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(r.dir * Math.PI / 2); ctx.scale(1.3, 1.3);
  ctx.globalAlpha = a;
  ctx.fillStyle = C.bg;
  [[-8, -10], [8, -10], [-8, 10], [8, 10]].forEach(([wx, wy]) => ctx.fillRect(wx - 2, wy - 4, 4, 8));
  if (r.alive) ctx.drawImage(sprite('suv' + color, 60, 76, g => { g.shadowColor = color; g.shadowBlur = 14 * 1.3 * 2; g.fillStyle = color; rr(g, -7.5, -16, 15, 32, 4); g.fill(); }), -30, -38, 60, 76);
  else { ctx.fillStyle = color; rr(ctx, -7.5, -16, 15, 32, 4); ctx.fill(); }
  ctx.fillStyle = '#14102a';
  rr(ctx, -5.5, -10, 11, 5, 1.5); ctx.fill();
  rr(ctx, -5.5, 10, 11, 3.5, 1.5); ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'; rr(ctx, -5.5, -3.5, 11, 12.5, 2); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.globalAlpha = a * 0.7;
  ctx.beginPath(); ctx.moveTo(-4.5, -2); ctx.lineTo(-4.5, 8); ctx.moveTo(4.5, -2); ctx.lineTo(4.5, 8); ctx.stroke();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#fff6c9'; ctx.fillRect(-6, -16, 3, 2); ctx.fillRect(3, -16, 3, 2);
  ctx.fillStyle = C.mail; ctx.fillRect(-6, 14, 3, 2); ctx.fillRect(3, 14, 3, 2);
  ctx.restore();
}
export const CUP_SVG = '<svg class="cup" viewBox="-8 -14 16 24" aria-label="iced coffee"><path d="M-6 -5H6L4 9H-4Z" fill="rgba(236,233,251,0.35)" stroke="#0b0a1a" stroke-width="1.5"/><path d="M-5.4 -1H5.4L4 8H-4Z" fill="#8a5a34"/><rect x="-7" y="-7" width="14" height="3" fill="#ece9fb"/><rect x="1" y="-13" width="2" height="7" fill="#7dff6a"/></svg>';

// ---------- trails: two cells join when the same rider drove from one to the other ----------
const SEGS = Array.from({ length: N }, () => []);
function trails(ctx, x0, y0, x1, y1, colors) {
  for (let k = 0; k < N; k++) SEGS[k].length = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x, o = trail[i];
    if (o < 0) continue;
    if (x < W - 1 && trail[i + 1] === o && Math.abs(stepAt[i + 1] - stepAt[i]) === 1) SEGS[o].push(x, y, x + 1, y);
    if (y < H - 1 && trail[i + W] === o && Math.abs(stepAt[i + W] - stepAt[i]) === 1) SEGS[o].push(x, y, x, y + 1);
  }
  const path = l => {
    ctx.beginPath();
    for (let k = 0; k < l.length; k += 4) { ctx.moveTo((l[k] + 0.5) * CELL, (l[k + 1] + 0.5) * CELL); ctx.lineTo((l[k + 2] + 0.5) * CELL, (l[k + 3] + 0.5) * CELL); }
  };
  ctx.save(); ctx.lineCap = 'round';
  SEGS.forEach((l, o) => {
    if (!l.length) return;
    ctx.strokeStyle = colors[o];
    ctx.globalAlpha = 0.3; ctx.lineWidth = 14; path(l); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 6; path(l); ctx.stroke();
  });
  ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
  SEGS.forEach(l => { if (l.length) { path(l); ctx.stroke(); } });
  ctx.restore();
}

// ---------- minimap: the walls once, then each round's trails as single pixels ----------
const mini = document.createElement('canvas'); mini.width = W; mini.height = H;
const mg = mini.getContext('2d');
let miniBase = null;
const miniPx = new Uint8Array(W * H); // what the minimap shows: rider id + 1, 0 for nothing
function miniSync(colors) {
  if (!miniBase) {
    miniBase = document.createElement('canvas'); miniBase.width = W; miniBase.height = H;
    const g = miniBase.getContext('2d');
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = C.line;
    for (let i = 0; i < W * H; i++) if (solid[i]) g.fillRect(i % W, Math.floor(i / W), 1, 1);
    mg.drawImage(miniBase, 0, 0);
  }
  // only the cells that changed are redrawn (a rewind can take some away)
  for (let i = 0; i < W * H; i++) {
    const v = trail[i] + 1;
    if (v === miniPx[i]) continue;
    miniPx[i] = v;
    const x = i % W, y = (i / W) | 0;
    if (v) { mg.fillStyle = colors[v - 1]; mg.fillRect(x, y, 1, 1); } else { mg.clearRect(x, y, 1, 1); mg.drawImage(miniBase, x, y, 1, 1, x, y, 1, 1); }
  }
}

function newsletter(ctx, rows, small) {
  const gap = rows.gap;
  const X = 14, Y = 10, BW = 236, RH = 21, P = 8, BH = P * 2 + 18 + rows.length * RH + (gap ? 6 : 0);
  ctx.save();
  if (small) ctx.scale(0.78, 0.78);
  ctx.fillStyle = 'rgba(11, 10, 26, 0.72)'; rr(ctx, X, Y, BW, BH, 8); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '700 12px "Figtree", system-ui, sans-serif'; ctx.fillStyle = '#b9b5dd';
  ctx.fillText('HOA NEWSLETTER', X + P, Y + P + 7);
  ctx.font = '600 14px "Figtree", system-ui, sans-serif';
  rows.forEach(([rank, name, value, color], i) => {
    const y = Y + P + 18 + i * RH + RH / 2 + (gap && i === rows.length - 1 ? 6 : 0);
    ctx.fillStyle = color;
    ctx.textAlign = 'left'; ctx.fillText(String(rank), X + P, y); ctx.fillText(name, X + P + 26, y);
    ctx.textAlign = 'right'; ctx.fillText(value, X + BW - P, y);
  });
  ctx.restore();
}

const STAT_FONT = '700 17px "Figtree", system-ui, sans-serif';
function statWidths(ctx) {
  ctx.save(); ctx.font = STAT_FONT;
  const widths = ['10:00', '100', '2'].map(t => 24 + ctx.measureText(t).width + 12); // fixed, so nothing moves as numbers change
  ctx.restore();
  return widths;
}
function stats(ctx, right, bottom, items, widths) {
  const total = widths.reduce((a, c) => a + c, 0) + 8;
  ctx.save();
  ctx.font = STAT_FONT; ctx.textBaseline = 'middle';
  let x = right - total;
  const y = bottom - 15;
  ctx.fillStyle = 'rgba(11, 10, 26, 0.72)'; rr(ctx, x, y - 15, total, 30, 8); ctx.fill();
  x += 8;
  items.forEach(([icon, text], i) => {
    const cx = x + 10;
    ctx.fillStyle = C.gladys; ctx.beginPath(); ctx.arc(cx, y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.bg; ctx.fillStyle = C.bg; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (icon === 'clock') { ctx.beginPath(); ctx.arc(cx, y, 6, 0, Math.PI * 2); ctx.moveTo(cx, y); ctx.lineTo(cx, y - 4); ctx.moveTo(cx, y); ctx.lineTo(cx + 3, y + 2); ctx.stroke(); }
    if (icon === 'rider') { ctx.beginPath(); ctx.arc(cx, y - 3, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, y + 7, 6, Math.PI, 0); ctx.fill(); }
    if (icon === 'cup') cup(ctx, cx, y + 1, 0.62);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, x + 24, y + 1);
    x += widths[i];
  });
  ctx.restore();
}

// ---------- one frame ----------
// v: { vw, vh, small, chipPad, t (0..1 between the last step and the next), moving, me (rider followed), names, colors,
//      news (newsletter rows), items (stats row), age (n => ms since step n) }
const lerp = (a, c, t) => a + (c - a) * t;
export function draw(ctx, v) {
  paintedNow = 0;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  ctx.clearRect(0, 0, cw, ch);
  const pos = r => r.alive && v.moving ? [lerp(r.px, r.x, v.t), lerp(r.py, r.y, v.t)] : [r.x, r.y];
  const [kx, ky] = pos(v.me);
  const camX = Math.max(0, Math.min(W - v.vw, kx + 0.5 - v.vw / 2)) * CELL;
  const camY = Math.max(0, Math.min(H - v.vh, ky + 0.5 - v.vh / 2)) * CELL;
  ctx.save(); ctx.translate(-camX, -camY);
  for (let ty = Math.floor(camY / (TH * CELL)); ty <= Math.min(TY - 1, Math.floor((camY + ch) / (TH * CELL))); ty++)
    for (let tx = Math.floor(camX / (TW * CELL)); tx <= Math.min(TX - 1, Math.floor((camX + cw) / (TW * CELL))); tx++)
      ctx.drawImage(tilePic(ty * TX + tx), tx * TW * CELL, ty * TH * CELL);
  if (!paintedNow) warm(camX, camY, cw, ch);
  fence(ctx, camX, camY, camX + cw, camY + ch);

  const x0 = Math.max(0, Math.floor(camX / CELL) - 1), y0 = Math.max(0, Math.floor(camY / CELL) - 1);
  const x1 = Math.min(W - 1, x0 + v.vw + 2), y1 = Math.min(H - 1, y0 + v.vh + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (coffee[y * W + x]) cup(ctx, (x + 0.5) * CELL, (y + 0.5) * CELL);
  trails(ctx, x0, y0, x1, y1, v.colors);

  const seen = (x, y) => x * CELL > camX - 60 && x * CELL < camX + cw + 60 && y * CELL > camY - 60 && y * CELL < camY + ch + 60;
  riders.forEach(r => {
    const [px, py] = pos(r);
    if (!seen(px, py)) return;
    if (r.alive && v.moving) {
      // the last bit of trail, from the cell left behind to where the SUV is now
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = v.colors[r.id]; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo((r.px + 0.5) * CELL, (r.py + 0.5) * CELL); ctx.lineTo((px + 0.5) * CELL, (py + 0.5) * CELL); ctx.stroke();
      ctx.restore();
    }
    suv(ctx, r, v.colors[r.id], (px + 0.5) * CELL, (py + 0.5) * CELL);
    if (r.alive) for (let i = 0; i < r.coffee; i++) cup(ctx, (px + 0.5) * CELL + (r.coffee === 2 ? (i ? 7 : -7) : 0), (py + 0.5) * CELL, 0.75, true);
  });
  ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = C.bg;
  riders.forEach(r => {
    if (!r.alive) return;
    const [px, py] = pos(r);
    if (!seen(px, py)) return;
    const tx = (px + 0.5) * CELL, ty = (py + 0.5) * CELL - 28;
    ctx.strokeText(v.names[r.id], tx, ty); ctx.fillStyle = v.colors[r.id]; ctx.fillText(v.names[r.id], tx, ty);
  });
  // a crash: a ring and sparks for 0.7 s, timed from the crash's own step
  riders.forEach(r => {
    if (!r.crash) return;
    const age = v.age(r.crash.n);
    if (age > 700 || age < 0) return;
    const k = age / 700, bx = (r.crash.x + 0.5) * CELL, by = (r.crash.y + 0.5) * CELL;
    ctx.save(); ctx.strokeStyle = v.colors[r.id];
    ctx.lineWidth = 9; ctx.globalAlpha = (1 - k) * 0.3; ctx.beginPath(); ctx.arc(bx, by, 6 + k * 34, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, 6 + k * 34, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + r.spark, r0 = 4 + k * 14, r1 = 10 + k * 40;
      ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * r0, by + Math.sin(a) * r0); ctx.lineTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1); ctx.stroke();
    }
    ctx.restore();
  });
  ctx.restore();

  newsletter(ctx, v.news, v.small);

  // minimap and stats row, bottom right (smaller on an upright phone, above the rider boxes)
  miniSync(v.colors);
  const widths = statWidths(ctx), total = widths.reduce((a, c) => a + c, 0) + 8;
  const k = v.small ? 0.7 : 1, cx = cw - 10, cy = ch - 10 - v.chipPad;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
  const MS = total / W, mw = W * MS, mh = H * MS, mx = cw - mw - 10, my = ch - mh - 10 - v.chipPad;
  ctx.save();
  ctx.globalAlpha = 0.85; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mini, mx, my, mw, mh);
  ctx.globalAlpha = 1; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  ctx.strokeRect(mx + camX / CELL * MS, my + camY / CELL * MS, v.vw * MS, v.vh * MS);
  ctx.fillStyle = v.colors[v.me.id]; ctx.beginPath(); ctx.arc(mx + (kx + 0.5) * MS, my + (ky + 0.5) * MS, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  stats(ctx, mx + mw, my - 8, v.items, widths);
  ctx.restore();
}
