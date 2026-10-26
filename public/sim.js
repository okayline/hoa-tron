// HOA Wars game rules. Pure and seeded: the same seed and the same events give the same round on every screen.
// Nothing here waits on the network. A late event rewinds a few steps (undo log) and plays them again.

export const TW = 40, TH = 26, TX = 13, TY = 20, W = TW * TX, H = TH * TY, TICK = 95, N = 100, COFFEES = 120, MAX_STEPS = 6000;
export const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]; // 0 up, 1 right, 2 down, 3 left
export const HIST = 64; // steps that can be rewound (about 6 s)

export const mulberry32 = a => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------- the town (fixed map seed, same on every screen) ----------
export const solid = new Uint8Array(W * H);
export const kind = new Array(W * H).fill('');
function block(x, y, w, h, k) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { solid[j * W + i] = 1; kind[j * W + i] = k; }
}
block(0, 0, W, 1, 'fence'); block(0, H - 1, W, 1, 'fence');
block(0, 0, 1, H, 'fence'); block(W - 1, 0, 1, H, 'fence');

const ROOFS = ['--roof-a', '--roof-b', '--roof-c', '--roof-d'];
const BRIGHT = ['#e58fb8', '#7fb4e8', '#f0c75e', '#8fd18a'];

// one 40x26 block: the solid things in it, in the block's own cells (tones are CSS token names or colours)
function gen(k, rng) {
  const T = [];
  const R = (a, c) => a + Math.floor(rng() * (c - a + 1));
  const roof = () => ROOFS[R(0, 3)];
  const house = (x, y, w, h, face, tone, hoa) => T.push({ k: hoa ? 'hoa' : 'house', x, y, w, h, face, tone: tone || roof(), hoa });
  const one = (k, x, y) => T.push({ k, x, y, w: 1, h: 1 });
  const rect = (k, x, y, w, h, more) => T.push(Object.assign({ k, x, y, w, h }, more));
  const oval = (k, cx, cy, rx, ry) => {
    const cells = [];
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (x >= 0 && y >= 0 && x < TW && y < TH && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) cells.push([x, y]);
    T.push({ k, cx, cy, rx, ry, cells });
  };
  const yardTrees = () => { for (let i = R(2, 5); i > 0; i--) one('tree', R(1, 38), rng() < 0.5 ? 0 : 25); };
  const row = (y, h, face, from, to) => {
    for (let x = from; x <= to;) {
      const w = R(4, 6);
      if (x + w - 1 > to) break;
      if (rng() < 0.15) one('tree', x + 1, y + 1); else house(x, y, w, h, face);
      x += w + R(1, 2);
    }
  };
  const cars = (x0, x1, y, p) => { for (let x = x0; x <= x1; x += 2) if (rng() < p) rect('car', x, y, 1, 1, { tone: ROOFS[R(0, 3)] }); };
  if (k === 'street' || k === 'bright') {
    row(2, 3, 'down', 2, 38); row(21, 3, 'up', 2, 38);
    if (rng() < 0.8) house(2, 9, 3, 6, 'right'); else one('tree', 3, 12);
    if (rng() < 0.8) house(35, 9, 3, 6, 'left'); else one('tree', 36, 12);
    const m = rng();
    if (m < 0.4) house(15, 11, 10, 4, 'down');
    else if (m < 0.7) { house(12, 11, 7, 4, 'down'); house(21, 11, 7, 4, 'down'); }
    else [[13, 12], [16, 11], [19, 13], [22, 11], [25, 12]].forEach(([x, y]) => one('tree', x, y));
    [[4, 5], [37, 5], [4, 20], [37, 20]].forEach(([x, y]) => one('bush', x, y));
    if (k === 'bright') T.forEach(t => { if (t.k === 'house') t.tone = BRIGHT[R(0, 3)]; });
    yardTrees();
  } else if (k === 'culdesac') {
    for (let x = 2; x <= 23; x += 7) { house(x, 4, 6, 4, 'down'); house(x, 18, 6, 4, 'up'); }
    house(30, 2, 6, 3, 'down'); house(30, 21, 6, 3, 'up');
    one('tree', 33, 12);
    yardTrees();
  } else if (k === 'park') {
    const left = rng() < 0.5, top = rng() < 0.5;
    oval('pond', left ? 9 : 30, top ? 6 : 19.5, R(4, 6), 3);
    rect('play', left ? 28 : 8, top ? 18 : 4, 4, 2);
    for (let i = 0; i < 18; i++) {
      const x = R(1, 38), y = R(1, 24);
      if (y === 12 || y === 13 || x === 19 || x === 20) continue;
      if (Math.abs(x - (left ? 9 : 30)) < 8 && Math.abs(y - (top ? 6 : 19.5)) < 5) continue;
      one('tree', x, y);
    }
  } else if (k === 'mall') {
    rect('shop', 2, 1, 36, 5, { parts: R(3, 5), tone: roof() });
    cars(3, 37, 10, 0.4); cars(3, 37, 20, 0.4);
    one('tree', 1, 15); one('tree', 38, 15); one('bush', 20, 15);
  } else if (k === 'school') {
    rect('bldg', 2, 2, 16, 6, { tone: '--brick' }); rect('bldg', 2, 8, 5, 9, { tone: '--brick' });
    rect('bleach', 19, 7, 1, 12);
    cars(10, 16, 12, 0.5); cars(10, 16, 18, 0.5);
    for (let x = 2; x <= 17; x += 3) one('tree', x, 24);
  } else if (k === 'hoa') {
    house(15, 7, 10, 4, 'down', '--hoa', true);
    rect('pool', 15, 13, 10, 4);
    [[13, 8], [26, 8], [13, 15], [26, 15], [31, 10], [34, 14]].forEach(([x, y]) => one('tree', x, y));
    [[4, 5], [37, 5], [4, 20], [37, 20]].forEach(([x, y]) => one('bush', x, y));
  } else if (k === 'plant') {
    rect('bldg', 3, 3, 13, 7, { tone: '--concrete', stacks: true });
    oval('tower', 24, 8, 4, 4); oval('tower', 33.5, 8, 4, 4);
    rect('chain', 2, 19, 15, 1);
    [[5, 13], [8, 14], [12, 12]].forEach(([x, y]) => one('barrel', x, y));
    cars(20, 36, 17, 0.35); cars(20, 36, 22, 0.35);
  } else if (k === 'square') {
    rect('statue', 19, 12, 2, 2);
    rect('bldg', 11, 1, 8, 4, { tone: '--concrete', dome: true }); rect('bldg', 21, 1, 7, 4, { tone: '--brick', steeple: true });
    rect('bldg', 11, 21, 8, 4, { tone: '--roof-c' }); rect('bldg', 21, 21, 8, 4, { tone: '--roof-d' });
    [[1, 1], [35, 1], [1, 21], [35, 21]].forEach(([x, y]) => rect('bldg', x, y, 4, 4, { tone: roof() }));
    [[12, 10], [27, 10], [12, 15], [27, 15]].forEach(([x, y]) => one('tree', x, y));
  } else if (k === 'river') {
    rect('water', 17, 0, 6, 11); rect('water', 17, 15, 6, 11);
    row(2, 4, 'down', 2, 15); row(2, 4, 'down', 24, 38); row(19, 4, 'up', 2, 15); row(19, 4, 'up', 24, 38);
    [[16, 4], [23, 7], [16, 20], [23, 22]].forEach(([x, y]) => one('tree', x, y));
  }
  return T;
}

// 13 by 20 blocks: one is the HOA club, six make the old town
const HOA_TI = 9 * TX + 6;
const OLD_TOWN = { '1,1': 'plant', '2,1': 'square', '3,1': 'school', '1,2': 'river', '2,2': 'bright', '3,2': 'mall' };
export const TILES = [];
{
  const mapRand = mulberry32(19891217);
  for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
    const ti = TILES.length, roll = mapRand();
    const k = ti === HOA_TI ? 'hoa' : OLD_TOWN[`${tx},${ty}`] ||
      (roll < 0.45 ? 'street' : roll < 0.7 ? 'culdesac' : roll < 0.85 ? 'park' : roll < 0.93 ? 'mall' : 'school');
    TILES.push({ ox: tx * TW, oy: ty * TH, kind: k, T: gen(k, mulberry32((mapRand() * 4294967296) >>> 0)) });
  }
  TILES.forEach(({ ox, oy, T }) => T.forEach(t => {
    if (t.cells) t.cells.forEach(([x, y]) => block(ox + x, oy + y, 1, 1, t.k));
    else block(ox + t.x, oy + t.y, t.w, t.h, t.k);
  }));
}

// ---------- riders ----------
const GRANNY = ['Gladys', 'Doris', 'Peggy', 'Mildred', 'Edna', 'Bev', 'Marge', 'Agnes', 'Ethel', 'Dot', 'Lorraine',
  'Phyllis', 'Bernice', 'Myrtle', 'Hazel', 'Irene', 'Shirley', 'Bunny', 'Opal', 'Wanda'];
export const riders = [];
for (let i = 0; i < N; i++) {
  const nm = GRANNY[i % GRANNY.length], k = Math.floor(i / GRANNY.length);
  riders.push({ id: i, baseName: k ? `${nm} ${k + 1}` : nm, baseColor: `hsl(${(150 + i * 137.508) % 360} 90% 62%)`,
    human: false, x: 1, y: 1, px: 1, py: 1, dir: 0, alive: true, coffee: 0, steps: 0, base: 0, moves: 0, crash: null, spark: 0 });
}
const RF = ['human', 'x', 'y', 'px', 'py', 'dir', 'alive', 'coffee', 'steps', 'base', 'moves', 'crash'];

// ---------- round state ----------
export const trail = new Int16Array(W * H).fill(-1);
export const stepAt = new Int32Array(W * H); // which of its own moves a rider made into this cell (joins trail pieces)
export const coffee = new Uint8Array(W * H);
export const S = { n: 0, seed: 1 };
let rs = 1; // the round's random state
const rand = () => {
  rs = (rs + 0x6D2B79F5) | 0;
  let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// events: turns.get(n).get(seat) = dir, joins.get(n) = [seats]
export const turns = new Map(), joins = new Map();
export function addTurn(n, seat, d) { let m = turns.get(n); if (!m) turns.set(n, m = new Map()); m.set(seat, d); }
export function dropTurn(n, seat) { const m = turns.get(n); if (m) { m.delete(seat); if (!m.size) turns.delete(n); } }
export function addJoin(n, seat) { let a = joins.get(n); if (!a) joins.set(n, a = []); if (!a.includes(seat)) a.push(seat); }

// ---------- undo log: one record per step ----------
const hist = [];
let log = null;
function setTrail(i, o, s) { if (log) log.push(0, i, trail[i], stepAt[i]); trail[i] = o; stepAt[i] = s; }
function setCoffee(i, v) { if (log) log.push(1, i, coffee[i], 0); coffee[i] = v; }
export const oldest = () => hist.length ? hist[0].n : S.n + 1; // the earliest step that can still be played again

// rewind so that step n is the next one to play
export function rewind(n) {
  if (n > S.n) return true;
  if (n < oldest()) return false;
  while (S.n >= n) {
    const h = hist.pop();
    for (let k = h.log.length - 4; k >= 0; k -= 4) {
      const i = h.log[k + 1];
      if (h.log[k] === 0) { trail[i] = h.log[k + 2]; stepAt[i] = h.log[k + 3]; } else coffee[i] = h.log[k + 2];
    }
    h.rs.forEach((o, i) => { const r = riders[i]; RF.forEach(f => r[f] = o[f]); });
    rs = h.rand; S.n = h.n - 1;
  }
  return true;
}

// ---------- map helpers ----------
export function blocked(x, y) {
  return x < 0 || y < 0 || x >= W || y >= H || solid[y * W + x] === 1 || trail[y * W + x] >= 0;
}
export function freeRun(x, y, d, max) {
  let n = 0;
  for (let k = 1; k <= max; k++) { if (blocked(x + DIRS[d].x * k, y + DIRS[d].y * k)) break; n++; }
  return n;
}

// open cells with a long clear run ahead (worked out once, the map never changes)
let cand = null;
function pickStarts() {
  if (!cand) {
    cand = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (solid[y * W + x]) continue;
      let best = -1, bs = 5;
      for (let d = 0; d < 4; d++) { const f = freeRun(x, y, d, 10); if (f > bs) { bs = f; best = d; } }
      if (best >= 0) cand.push({ x, y, d: best });
    }
  }
  const c = cand.slice();
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  // at least gap cells apart: start wide and close in until all 100 fit
  for (let gap = 10; gap >= 1; gap--) {
    const picked = [];
    for (const p of c) {
      if (picked.every(q => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) >= gap)) picked.push(p);
      if (picked.length === N) return picked;
    }
  }
  return c.slice(0, N);
}

// a fresh round from its seed (events are kept: they belong to the round)
export function reset(seed) {
  S.seed = seed; S.n = 0; rs = seed | 0; hist.length = 0; log = null;
  trail.fill(-1); coffee.fill(0);
  const starts = pickStarts();
  riders.forEach((r, i) => {
    const p = starts[i];
    Object.assign(r, { human: false, x: p.x, y: p.y, px: p.x, py: p.y, dir: p.d, alive: true, coffee: 0, steps: 0, base: 0, moves: 0, crash: null, spark: rand() * 6 });
    trail[p.y * W + p.x] = r.id; stepAt[p.y * W + p.x] = 0;
  });
  for (let n = 0, tries = 0; n < COFFEES && tries < COFFEES * 50; tries++) {
    const i = Math.floor(rand() * W * H);
    if (solid[i] || trail[i] >= 0 || coffee[i]) continue;
    coffee[i] = 1; n++;
  }
}
export function clearEvents() { turns.clear(); joins.clear(); }

// ---------- grandma driving ----------
function ai(r) {
  const ahead = freeRun(r.x, r.y, r.dir, 8);
  const l = (r.dir + 3) % 4, rt = (r.dir + 1) % 4;
  const fl = freeRun(r.x, r.y, l, 12), fr = freeRun(r.x, r.y, rt, 12);
  if (ahead >= 3) {
    if (rand() < 0.03) {
      const best = fl > fr ? { d: l, s: fl } : { d: rt, s: fr };
      if (best.s >= 5) r.dir = best.d;
    }
    return;
  }
  const opts = [{ d: r.dir, s: ahead + rand() }, { d: l, s: fl + rand() }, { d: rt, s: fr + rand() }];
  opts.sort((a, b) => b.s - a.s);
  r.dir = opts[0].d;
}

// ---------- one step ----------
// crash: { n, x, y, what } where what is a thing's kind, or { trail: rider id } or { head: rider id }
export function step() {
  const n = S.n + 1;
  log = [];
  hist.push({ n, rand: rs, log, rs: riders.map(r => { const o = {}; RF.forEach(f => o[f] = r[f]); return o; }) });
  if (hist.length > HIST) hist.shift();

  (joins.get(n) || []).forEach(seat => { const r = riders[seat]; if (!r.human) { r.human = true; r.base = r.steps; } });
  const tm = turns.get(n);
  const movers = [];
  for (const r of riders) {
    if (!r.alive) continue;
    if (r.human) { const d = tm && tm.get(r.id); if (d !== undefined && d !== (r.dir + 2) % 4) r.dir = d; }
    else ai(r);
    r.px = r.x; r.py = r.y;
    movers.push(r);
  }

  const targets = movers.map(r => ({ x: r.x + DIRS[r.dir].x, y: r.y + DIRS[r.dir].y }));
  const dead = new Map(), saved = new Set();
  movers.forEach((r, i) => {
    const t = targets[i];
    if (!blocked(t.x, t.y)) return;
    const ti = t.y * W + t.x;
    // an iced coffee breaks through one cell of trail and the rider drives on
    if (r.coffee > 0 && !solid[ti] && trail[ti] >= 0) { r.coffee--; setTrail(ti, -1, 0); return; }
    // against a house, a tree or the fence it takes the hit: stay put and turn to the side with more room
    const l = (r.dir + 3) % 4, rt = (r.dir + 1) % 4;
    const fl = freeRun(r.x, r.y, l, 12), fr = freeRun(r.x, r.y, rt, 12);
    if (r.coffee > 0 && (fl > 0 || fr > 0)) { r.coffee--; r.dir = fl >= fr ? l : rt; saved.add(i); }
    else {
      const o = t.x >= 0 && t.y >= 0 && t.x < W && t.y < H ? trail[ti] : -1;
      dead.set(i, solid[ti] || o < 0 ? { what: kind[ti] || 'fence' } : { trail: o });
    }
  });
  const at = new Map();
  targets.forEach((t, i) => { if (saved.has(i)) return; const k = t.y * W + t.x; if (at.has(k)) at.get(k).push(i); else at.set(k, [i]); });
  at.forEach(ids => {
    if (ids.length < 2) return;
    ids.forEach(i => dead.set(i, { head: movers[ids.find(j => j !== i)].id }));
  });
  movers.forEach((r, i) => {
    if (saved.has(i)) return;
    const t = targets[i];
    if (dead.has(i)) { r.alive = false; r.crash = Object.assign({ n, x: t.x, y: t.y }, dead.get(i)); return; }
    r.x = t.x; r.y = t.y;
    const c = r.y * W + r.x;
    setTrail(c, r.id, ++r.moves);
    if (coffee[c] && r.coffee < 2) { setCoffee(c, 0); r.coffee++; } // holding 2: drive over it and it stays
  });
  movers.forEach(r => { if (r.alive) r.steps++; });
  log = null;
  S.n = n;
}

// property value: $19,000 for every step alive since the rider took their granny over
export const riderValue = r => (r.steps - r.base) * 19000;
