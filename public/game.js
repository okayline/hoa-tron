// Game rules shared by the server (Durable Object) and the browser.
// The server runs step(); the browser only uses the map to draw.
export const W = 40, H = 26, TICK = 95;
export const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]; // 0 up, 1 right, 2 down, 3 left

export const RIDERS = [
  { name: 'Karen', col: '--karen', sx: 8, sy: 7, sdir: 1 },
  { name: 'Gladys', col: '--gladys', sx: 31, sy: 18, sdir: 3 },
  { name: 'Doris', col: '--doris', sx: 33, sy: 7, sdir: 2 },
  { name: 'Peggy', col: '--peggy', sx: 6, sy: 18, sdir: 0 }
];

export function buildMap() {
  const solid = new Uint8Array(W * H);
  const kind = new Array(W * H).fill('');
  const houses = [], trees = [], boxes = [], bushes = [];
  const block = (x, y, w, h, k) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { solid[j * W + i] = 1; kind[j * W + i] = k; }
  };
  const addHouse = (x, y, w, h, tone, face, hoa) => {
    block(x, y, w, h, hoa ? 'hoa' : 'house');
    houses.push({ x, y, w, h, tone, face, hoa: !!hoa });
  };
  block(0, 0, W, 1, 'fence'); block(0, H - 1, W, 1, 'fence');
  block(0, 0, 1, H, 'fence'); block(W - 1, 0, 1, H, 'fence');
  [3, 12, 22, 31].forEach((x, i) => {
    addHouse(x, 2, 6, 3, i % 4, 'down');
    addHouse(x, 21, 6, 3, (i + 2) % 4, 'up');
  });
  addHouse(2, 9, 3, 6, 1, 'right');
  addHouse(35, 9, 3, 6, 3, 'left');
  addHouse(15, 11, 10, 4, -1, 'down', true);
  [[10, 8], [29, 8], [10, 17], [29, 17], [20, 8], [20, 17], [10, 12], [30, 12]].forEach(([x, y]) => {
    block(x, y, 1, 1, 'tree'); trees.push({ x, y });
  });
  [[6, 5], [15, 5], [25, 5], [34, 5], [6, 20], [15, 20], [25, 20], [34, 20]].forEach(([x, y]) => {
    block(x, y, 1, 1, 'mail'); boxes.push({ x, y });
  });
  [[4, 5], [9, 5], [12, 5], [18, 5], [22, 5], [28, 5], [31, 5], [37, 5],
   [4, 20], [9, 20], [12, 20], [18, 20], [22, 20], [28, 20], [31, 20], [37, 20],
   [14, 11], [14, 14], [25, 11], [25, 14], [8, 10], [8, 15], [32, 10], [32, 15]].forEach(([x, y]) => {
    block(x, y, 1, 1, 'bush'); bushes.push({ x, y });
  });
  return { solid, kind, houses, trees, boxes, bushes };
}

const NAMES = { fence: 'the fence', house: "a neighbor's house", hoa: 'the HOA clubhouse', tree: 'a tree', mail: 'a mailbox', bush: 'a bush' };

// One match: the neighborhood, four riders and the trails they leave.
export function createGame() {
  const map = buildMap();
  const trail = new Int8Array(W * H).fill(-1);
  const riders = RIDERS.map((r, id) => ({
    id, name: r.name, sx: r.sx, sy: r.sy, sdir: r.sdir,
    x: r.sx, y: r.sy, dir: r.sdir, alive: true, human: false, turnQ: [], note: '', wins: 0
  }));
  const blocked = (x, y) => x < 0 || y < 0 || x >= W || y >= H || map.solid[y * W + x] === 1 || trail[y * W + x] >= 0;
  const freeRun = (x, y, d, max) => {
    let n = 0;
    for (let k = 1; k <= max; k++) { if (blocked(x + DIRS[d].x * k, y + DIRS[d].y * k)) break; n++; }
    return n;
  };
  const whatIs = (x, y, r) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 'the fence';
    const k = map.kind[y * W + x];
    if (k) return NAMES[k];
    const o = trail[y * W + x];
    if (o >= 0) return o === r.id ? `${r.name}'s own trail` : `${riders[o].name}'s trail`;
    return 'something';
  };

  function reset() {
    trail.fill(-1);
    for (const r of riders) {
      r.x = r.sx; r.y = r.sy; r.dir = r.sdir; r.alive = true; r.note = ''; r.turnQ.length = 0;
      trail[r.y * W + r.x] = r.id;
    }
  }

  // Grandma driving, used for every seat no player has taken.
  function ai(r) {
    const ahead = freeRun(r.x, r.y, r.dir, 8);
    const l = (r.dir + 3) % 4, rt = (r.dir + 1) % 4;
    const fl = freeRun(r.x, r.y, l, 12), fr = freeRun(r.x, r.y, rt, 12);
    if (ahead >= 3) {
      if (Math.random() < 0.03) {
        const best = fl > fr ? { d: l, s: fl } : { d: rt, s: fr };
        if (best.s >= 5) r.dir = best.d;
      }
      return;
    }
    const opts = [{ d: r.dir, s: ahead + Math.random() }, { d: l, s: fl + Math.random() }, { d: rt, s: fr + Math.random() }];
    opts.sort((a, b) => b.s - a.s);
    r.dir = opts[0].d;
  }

  function queueTurn(id, d) {
    const r = riders[id];
    if (!r || !r.alive || !(d >= 0 && d <= 3)) return;
    const last = r.turnQ.length ? r.turnQ[r.turnQ.length - 1] : r.dir;
    if (d === last || d === (last + 2) % 4) return;
    if (r.turnQ.length < 2) r.turnQ.push(d);
  }

  // Moves everyone one cell. Returns the ids that crashed this step.
  function step() {
    for (const r of riders) {
      if (!r.alive) continue;
      if (r.human) { const d = r.turnQ.shift(); if (d !== undefined) r.dir = d; }
      else ai(r);
    }
    const targets = riders.map(r => r.alive ? { x: r.x + DIRS[r.dir].x, y: r.y + DIRS[r.dir].y } : null);
    const dead = new Set(), reason = {};
    riders.forEach((r, i) => { const t = targets[i]; if (t && blocked(t.x, t.y)) dead.add(i); });
    for (let i = 0; i < riders.length; i++) for (let j = i + 1; j < riders.length; j++) {
      const a = targets[i], b = targets[j];
      if (a && b && a.x === b.x && a.y === b.y) {
        dead.add(i); dead.add(j);
        reason[i] = `a head-on with ${riders[j].name}`; reason[j] = `a head-on with ${riders[i].name}`;
      }
    }
    riders.forEach((r, i) => {
      const t = targets[i]; if (!t) return;
      if (dead.has(i)) { r.alive = false; r.note = `${r.name} crashed into ${reason[i] || whatIs(t.x, t.y, r)}.`; }
      else { r.x = t.x; r.y = t.y; trail[r.y * W + r.x] = r.id; }
    });
    return [...dead];
  }

  return { map, riders, reset, step, queueTurn };
}
