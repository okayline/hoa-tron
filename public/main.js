// HOA Wars page: the clock, the connection, the controls and the panels.
// The round runs on this screen's own clock: step n is at startAt + n * TICK on the server's clock. The screen never
// waits for the server. Your own turns happen on the next step right away; other riders' turns arrive a moment later
// and the game rewinds the few steps they missed and plays them again.
import * as G from './sim.js';
import { draw, tok, CUP_SVG, repaint } from './view.js';
const { TICK, N, MAX_STEPS, riders, S } = G;

// ---------- screen ----------
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const upright = matchMedia('(max-width: 720px) and (orientation: portrait)');
const CELL = 24;
let VW = 40, VH = 26; // cells on screen: wide on a computer, tall and closer in on a phone held upright
function fitView() { VW = upright.matches ? 20 : 40; VH = upright.matches ? 36 : 26; canvas.width = VW * CELL; canvas.height = VH * CELL; }
fitView(); upright.addEventListener('change', fitView);
let chipPad = 0; // upright phone: the rider boxes cover the bottom of the game screen, so the minimap sits above them
function fitChips() { const c = document.getElementById('chips'); chipPad = upright.matches && canvas.clientWidth ? (c.offsetHeight + 10) * canvas.width / canvas.clientWidth : 0; }
new ResizeObserver(fitChips).observe(document.getElementById('chips')); new ResizeObserver(fitChips).observe(canvas); upright.addEventListener('change', fitChips);

// ---------- round ----------
let state = 'ready'; // ready | play | over
let online = false, net = null, seed = 1, startAt = 0, offset = 0, bestRtt = Infinity;
let me = -1, claim = -1, wins = 0, heldVal = 0, liveOver = false, ending = false, idleRounds = 0, overlayTimer = 0, reloadTimer = 0, pingTimer = 0;
const karen = () => riders[me >= 0 ? me : 0];
// this screen's clock: performance.now() moves smoothly and never jumps (Date.now() is coarse in Firefox and jumps when the computer's clock is set)
const wall = () => performance.timeOrigin + performance.now();
const serverNow = () => wall() + offset;
const target = () => Math.max(0, Math.min(MAX_STEPS, Math.floor((serverNow() - startAt) / TICK)));

// your own turns: { n, d, id }; the server may move one to a later step, and says so
const mine = [];
let nextId = 1, dirtyFrom = Infinity;
const changed = n => { if (n < dirtyFrom) dirtyFrom = n; };

// play the round up to now: first rewind to the earliest step whose turns changed
function catchUp() {
  if (dirtyFrom <= S.n && !G.rewind(dirtyFrom)) G.reset(seed); // too far back to rewind: play the round again from the start
  dirtyFrom = Infinity;
  const goal = target();
  for (let k = 0; S.n < goal && k < 2000; k++) G.step();
}

function onEvent([n, type, seat, d], id) {
  if (type === 1) { G.addJoin(n, seat); return changed(n); }
  const own = id !== undefined && mine.find(t => t.id === id);
  if (own) {
    if (own.n === n) return; // already played here at this step
    G.dropTurn(own.n, seat); changed(Math.min(own.n, n)); own.n = n;
  } else changed(n);
  G.addTurn(n, seat, d);
}

// ---------- names: you are Karen (pink), other players Karen 2, Karen 3... in seat order ----------
const names = new Array(N), colors = new Array(N);
let nameKey = '', news = null;
function nameRiders() {
  let key = String(me);
  riders.forEach(r => { if (r.human) key += ',' + r.id; });
  if (key === nameKey) return;
  nameKey = key; news = null;
  let k = 1;
  riders.forEach(r => {
    names[r.id] = r.id === me ? 'Karen' : r.human ? `Karen ${++k}` : r.baseName;
    colors[r.id] = r.id === me ? tok('--karen') : r.baseColor;
  });
}
const THINGS = { fence: 'the fence', house: "a neighbor's house", hoa: 'the HOA clubhouse', tree: 'a tree', bush: 'a bush',
  pond: 'the pond', water: 'the river', pool: 'the HOA pool', tower: 'a cooling tower', bldg: 'a building', shop: 'the strip mall',
  car: 'a parked car', statue: 'the statue', play: 'the playground', bleach: 'the bleachers', chain: 'a chain-link fence', barrel: 'a barrel' };
function note(r) {
  const c = r.crash, nm = names[r.id];
  const what = c.head !== undefined ? `a head-on with ${names[c.head]}`
    : c.trail !== undefined ? (c.trail === r.id ? `${nm}'s own trail` : `${names[c.trail]}'s trail`)
    : THINGS[c.what] || 'something';
  return `${nm} crashed into ${what}.`;
}

// ---------- the end of a round ----------
const pick = a => a[Math.floor(Math.random() * a.length)];
const othersAlive = () => riders.filter(r => r !== karen() && r.alive).length;
function finish() {
  const k = karen();
  state = 'over';
  heldVal = G.riderValue(k);
  liveOver = online && !k.alive; // after a crash you keep watching the round under the window
  const others = othersAlive();
  let title, text;
  if (k.alive) { wins++; title = 'Karen wins'; text = pick(['The board has been notified. Everyone else is in violation.', 'Karen takes the cul-de-sac and the last word.', 'Nobody left on the street. Quiet at last.']); }
  else if (others === 0) { title = 'Nobody wins'; text = 'Everyone crashed at once. The board will be hearing about this.'; }
  else { title = 'Karen crashed'; text = note(k) + ' ' + pick(['Karen would like to speak to whoever is in charge.', 'This is going in the next HOA newsletter.', 'A formal complaint has been filed about the placement of that.']); }
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    // a late turn from someone else can undo a crash (the trail you hit was never there): carry on
    if (karen().alive && othersAlive() > 0 && S.n < MAX_STEPS) { state = 'play'; liveOver = false; return; }
    showOverlay(title, text, 'Manager!!!', true);
  }, 800);
  if (others === 0) endRound();
}
// nobody left riding: the server is told, and a new round starts by itself
function endRound() {
  if (ending) return;
  ending = true;
  if (online && net) send({ t: 'done' });
  autoReload();
}
// after 3 rounds in a row that started by themselves with no key press or tap, it waits for the button
function autoReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => { if (state === 'over' && idleRounds < 3) { idleRounds++; startRound(); } }, 0);
}

// ---------- overlay ----------
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ovTitle');
const ovText = document.getElementById('ovText');
const ovBoard = document.getElementById('ovBoard');
const go = document.getElementById('go');
let overlayShownAt = 0;
function showOverlay(t, p, label, board) {
  ovTitle.textContent = t; ovText.textContent = p; go.textContent = label;
  overlay.classList.toggle('win', !!board); ovBoard.hidden = !board;
  if (board) { fillBoard(); ovBoard.scrollTop = 0; }
  overlay.hidden = false; overlayShownAt = performance.now();
  go.focus({ preventScroll: true });
}
const standings = () => riders.slice().sort((a, b) => (G.riderValue(b) - G.riderValue(a)) || (a.id - b.id));
const money = r => '$' + G.riderValue(r).toLocaleString('en-US');
// the rows are made once and only their text changes, every 2 s while the window is up
const BOARD_EVERY = 2000;
let boardRows = null, boardTimer = 0;
function fillBoard() {
  if (!boardRows) boardRows = riders.map(() => {
    const li = document.createElement('li');
    const cells = ['lbr', 'lbn', 'lbv'].map(c => { const sp = document.createElement('span'); sp.className = c; li.appendChild(sp); return sp; });
    return { li, cells };
  });
  standings().forEach((r, i) => {
    const row = boardRows[i], cls = r === karen() && me >= 0 ? 'me' : !r.alive ? 'out' : '';
    if (row.li.className !== cls) row.li.className = cls;
    [String(i + 1), names[r.id], money(r)].forEach((t, k) => { if (row.cells[k].textContent !== t) row.cells[k].textContent = t; });
  });
  if (ovBoard.children.length !== boardRows.length) ovBoard.replaceChildren(...boardRows.map(r => r.li));
  clearTimeout(boardTimer);
  boardTimer = setTimeout(() => { if (!overlay.hidden && !ovBoard.hidden) fillBoard(); }, BOARD_EVERY);
}
// the HOA Newsletter: the top 5, and your own row under them when you are further down (worked out every 2 s, and when names change)
const NEWS_EVERY = 2000;
let newsAt = 0;
function newsRows() {
  if (news && performance.now() - newsAt < NEWS_EVERY) return news;
  newsAt = performance.now();
  const all = standings(), k = karen(), at = me >= 0 ? all.indexOf(k) : -1;
  const rows = all.slice(0, 5).map((r, i) => [i + 1, r]);
  if (at >= 5) rows.push([at + 1, k]);
  news = rows.map(([rank, r]) => [rank, names[r.id], money(r), r === k && me >= 0 ? colors[r.id] : r.alive ? '#ffffff' : 'rgba(255, 255, 255, 0.45)']);
  news.gap = at >= 5;
  return news;
}

// ---------- connection ----------
function send(m) { try { net && net.readyState === 1 && net.send(JSON.stringify(m)); } catch (e) {} }
function playerId() {
  try {
    const got = document.cookie.match(/(?:^|; )hoa_id=([\w-]+)/);
    if (got) return got[1];
    const id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^\w-]/g, '');
    document.cookie = `hoa_id=${id}; max-age=31536000; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    return id;
  } catch (e) { return ''; }
}
function begin(s, at) {
  seed = s; startAt = at; mine.length = 0; dirtyFrom = Infinity;
  G.reset(seed); nameKey = ''; news = null;
  state = 'play'; liveOver = false; ending = false;
}
// the granny with the longest clear road ahead
function pickGranny() {
  let best = -1, run = 2;
  riders.forEach(r => { if (r.alive && !r.human) { const f = G.freeRun(r.x, r.y, r.dir, 12); if (f > run) { run = f; best = r.id; } } });
  claim = best;
  if (best >= 0) return send({ t: 'claim', seat: best });
  // no granny left to take over: the next round is a new one
  send({ t: 'none' });
  if (net) { net.onclose = null; net.close(); net = null; }
  setTimeout(startRound, 300);
}
function startRound() {
  clearTimeout(overlayTimer); clearTimeout(reloadTimer); clearInterval(pingTimer);
  if (net) { net.onclose = null; net.close(); net = null; }
  online = false; me = -1; claim = -1; bestRtt = Infinity;
  let opened = false;
  const solo = () => { net = null; online = false; offset = 0; G.clearEvents(); me = 0; begin((Math.random() * 4294967296) >>> 0, wall()); G.addJoin(1, 0); overlay.hidden = true; };
  try { net = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' + (playerId() ? '?p=' + playerId() : '')); } catch (e) { net = null; }
  if (!net) return solo(); // no server here: a round on this screen only, against 99 grannies
  const ws = net;
  ws.onopen = () => {
    opened = true;
    const ping = () => send({ t: 'ping', c: wall() });
    ping(); setTimeout(ping, 250); setTimeout(ping, 500);
    pingTimer = setInterval(ping, 5000);
  };
  ws.onerror = () => { if (!opened && net === ws) solo(); };
  ws.onclose = () => {
    if (!opened || net !== ws) return;
    net = null; clearInterval(pingTimer);
    if (state !== 'over') { state = 'over'; online = false; showOverlay('Ready to complain...', '', 'Manager!!!'); }
    else autoReload();
  };
  ws.onmessage = e => {
    if (net !== ws) return;
    const m = JSON.parse(e.data);
    if (m.t === 'start') {
      online = true; offset = m.now - wall();
      G.clearEvents(); m.events.forEach(ev => onEvent(ev));
      begin(m.seed, m.startAt); catchUp();
      // a player who has been here before asks for their own granny back first
      if (m.mine !== null && riders[m.mine] && riders[m.mine].alive) { claim = m.mine; send({ t: 'claim', seat: m.mine }); }
      else pickGranny();
    } else if (m.t === 'pong') {
      // the server's clock: keep the sample with the shortest round trip
      const rtt = wall() - m.c;
      if (rtt <= bestRtt) { bestRtt = rtt; offset = m.s - (m.c + rtt / 2); }
    } else if (m.t === 'ev') onEvent(m.e, m.id);
    else if (m.t === 'won' && state === 'play') {
      me = m.seat; claim = -1; mine.length = 0; nameKey = ''; overlay.hidden = true;
    } else if (m.t === 'lost' && state === 'play') pickGranny();
  };
}
go.addEventListener('click', startRound);
document.addEventListener('click', e => {
  if (state !== 'over' || overlay.hidden) return;
  if (e.target.closest('.card')) return; // the button starts the round itself, and taps on the leaderboard should not
  if (performance.now() - overlayShownAt < 500) return;
  startRound();
});

// ---------- chips ----------
const chipsEl = document.getElementById('chips');
function makeChip(color, name) {
  const li = document.createElement('li');
  li.className = 'chip'; li.style.setProperty('--c', color);
  li.innerHTML = '<span class="dot"></span><span class="nm"></span><span class="meta"></span><span class="val"></span>';
  li.querySelector('.nm').textContent = name;
  chipsEl.appendChild(li);
  return { li, meta: li.querySelector('.meta'), val: li.querySelector('.val'), key: '', shown: '' };
}
const kChip = makeChip(tok('--karen'), "Karen's Property Value");
const gChip = makeChip(tok('--gladys'), 'Others still riding');
function renderChips() {
  const k = karen();
  const status = state === 'ready' ? 'on the line' : !k.alive ? 'crashed' : state === 'over' ? 'winner' : 'riding';
  const cups = k.alive ? k.coffee : 0, key = status + '|' + wins + '|' + cups;
  if (key !== kChip.key) {
    kChip.key = key;
    kChip.meta.textContent = `${status} · ${wins} ${wins === 1 ? 'win' : 'wins'}${cups ? ' · ' : ''}`;
    if (cups) kChip.meta.insertAdjacentHTML('beforeend', CUP_SVG.repeat(cups));
  }
  kChip.li.classList.toggle('out', !k.alive && state !== 'ready');
  kChip.li.classList.toggle('win', k.alive && state === 'over');
  const left = othersAlive();
  const gv = `${left} / ${N - 1}`, gm = state === 'ready' ? 'on the line' : `${N - 1 - left} crashed`;
  if (gv !== gChip.key) { gChip.key = gv; gChip.val.textContent = gv; }
  if (gm !== gChip.shown) { gChip.shown = gm; gChip.meta.textContent = gm; }
  // with no granny of your own yet, you see the number you ended on; it does not go up
  const txt = '$' + (me < 0 ? heldVal : G.riderValue(k)).toLocaleString('en-US');
  if (txt !== kChip.shown) { kChip.shown = txt; kChip.val.textContent = txt; }
}

// ---------- input: turn left or right from the way you are heading ----------
function heading() {
  const next = mine.filter(t => t.n > S.n);
  return next.length ? next[next.length - 1].d : karen().dir;
}
function turn(side) {
  if (state !== 'play' || me < 0 || !karen().alive) return;
  const d = (heading() + (side < 0 ? 3 : 1)) % 4;
  if (mine.filter(t => t.n > S.n).length >= 2) return; // at most 2 turns waiting
  const n = Math.max(S.n + 1, mine.length ? mine[mine.length - 1].n + 1 : 0);
  const t = { n, d, id: nextId++ };
  mine.push(t); if (mine.length > 8) mine.shift();
  G.addTurn(n, me, d);
  if (online) send({ t: 'turn', n, d, id: t.id });
}
const KEYS = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
addEventListener('keydown', e => {
  if (KEYS[e.key] !== undefined) { e.preventDefault(); turn(KEYS[e.key]); return; }
  if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') {
    if (e.target && e.target.tagName === 'BUTTON') return;
    e.preventDefault(); startRound();
  }
});
['keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { idleRounds = 0; }, true)); // any key or tap: you are here
const stage = document.getElementById('stage');
stage.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  const r = stage.getBoundingClientRect();
  turn(e.clientX < r.left + r.width / 2 ? -1 : 1);
});

// ---------- every frame ----------
const play = document.querySelector('.play');
function frame() {
  play.classList.toggle('playing', state === 'play' && me >= 0);
  const running = state === 'play' || (state === 'over' && liveOver);
  if (running) {
    catchUp();
    if (me >= 0 && state === 'play' && (!karen().alive || othersAlive() === 0)) finish();
    if (state === 'over' && liveOver && !riders.some(r => r.alive)) endRound();
    if (S.n >= MAX_STEPS && !ending) { // the time ran out
      ending = true;
      if (state === 'play') { state = 'over'; showOverlay('Ready to complain...', '', 'Manager!!!'); } else autoReload();
    }
    if (me < 0 && claim >= 0 && !riders[claim].alive) pickGranny(); // the granny picked crashed before the takeover
  }
  nameRiders();
  renderChips();
  const secs = Math.floor(S.n * TICK / 1000);
  draw(ctx, {
    vw: VW, vh: VH, small: upright.matches, chipPad, me: karen(), names, colors, news: newsRows(),
    moving: running, t: Math.max(0, Math.min(1, (serverNow() - (startAt + S.n * TICK)) / TICK)),
    age: n => serverNow() - (startAt + n * TICK),
    items: [['clock', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`], ['rider', String(riders.filter(r => r.alive).length)], ['cup', String(karen().coffee)]]
  });
  requestAnimationFrame(frame);
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(repaint);
G.reset(1);
requestAnimationFrame(frame);
