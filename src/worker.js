// HOA Wars server: the page is static (public/); /ws drops you into the live round.
// Lobby (one) points every new rider at the round now running. Match (one per round) starts the moment its first rider
// arrives: it picks a random seed and every TICK ms sends everyone that step's turns and takeovers. A rider who joins
// gets the seed and every step so far, catches up on their own screen, then claims a granny who is still riding; the
// takeover goes out as part of the next step. The server never runs the game: every screen runs the same round.
// The round is saved (seed, start time, every turn and takeover) and runs on the clock, so it keeps going when nobody
// is connected: whoever arrives next gets the saved steps plus the empty steps that passed, and catches up on their screen.
import { DurableObject } from 'cloudflare:workers';

const TICK = 95, SEATS = 100, MAX_STEPS = 6000; // 6000 steps is about 9.5 minutes
const CHUNK = 100, SAVE_EVERY = 15000; // saved history goes in pieces of 100 steps; saved at most every 15 s while riders are connected

const lobby = env => env.LOBBY.get(env.LOBBY.idFromName('lobby'));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      const name = await lobby(env).place();
      const match = env.MATCH.get(env.MATCH.idFromName(name));
      await match.setName(name);
      return match.fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // the round now running is saved, so it is still the round after the server has been switched off for a while
    this.cur = null;
    ctx.blockConcurrencyWhile(async () => { try { this.cur = (await ctx.storage.get('cur')) || null; } catch (e) { this.cur = null; } });
  }
  async place() {
    if (!this.cur) {
      this.cur = `m${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
      await this.ctx.storage.put('cur', this.cur);
    }
    return this.cur;
  }
  // a round that ended or is full: the next rider gets a new one
  async release(name) {
    if (this.cur !== name) return;
    this.cur = null;
    await this.ctx.storage.delete('cur');
  }
}

export class Match extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.socks = new Map(); this.seat = new Map(); this.claims = new Map(); this.queue = new Map();
    this.phase = 'new'; this.n = 0; this.history = []; this.hashes = new Map();
    this.taken = new Set(); this.released = false; this.timer = null;
    this.owners = new Map(); this.pid = new Map(); // which seat each remembered player took (saved), and which player each connection is
    this.dirty = false; this.lastSave = 0; this.flushed = 0;
    // after the server has been switched off for a while, pick the round up again from what was saved
    ctx.blockConcurrencyWhile(async () => { try { await this.load(); } catch (e) { console.warn('HOA Wars: could not load the saved round', e); } });
  }

  setName(name) { this.name = name; }

  async load() {
    const meta = await this.ctx.storage.get('meta');
    if (!meta) return;
    this.seed = meta.seed; this.startedAt = meta.startedAt; this.n = meta.n; this.name = meta.name; this.released = meta.released;
    this.owners = new Map(Object.entries(meta.owners || {}));
    const parts = await this.ctx.storage.list({ prefix: 'h' });
    this.history = [].concat(...parts.values());
    this.taken = new Set(this.history.flatMap(h => h[2]));
    this.flushed = this.history.length - (this.history.length % CHUNK);
    this.phase = 'play';
  }

  // the seed, the start time and every turn and takeover so far; only the last piece of history is written again
  async save() {
    if (this.phase !== 'play') return;
    this.dirty = false; this.lastSave = Date.now();
    const rec = { meta: { seed: this.seed, startedAt: this.startedAt, n: this.n, name: this.name, released: this.released, owners: Object.fromEntries(this.owners) } };
    for (let k = Math.floor(this.flushed / CHUNK); k * CHUNK < this.history.length; k++)
      rec['h' + String(k).padStart(4, '0')] = this.history.slice(k * CHUNK, (k + 1) * CHUNK);
    this.flushed = this.history.length - (this.history.length % CHUNK);
    // allowUnconfirmed: by default the server holds back every message to the riders until a save is confirmed, which made the game jerk each time it saved
    await this.ctx.storage.put(rec, { allowUnconfirmed: true });
  }

  async fetch(req) {
    // the player's id (kept in a cookie on their device) is how a returning player is recognised
    const pid = new URL(req.url).searchParams.get('p');
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    // a round nobody was connected to: the clock kept running, so the empty steps that passed count
    if (this.phase === 'play' && !this.socks.size) this.n = Math.max(this.n, Math.floor((Date.now() - this.startedAt) / TICK));
    if (this.phase === 'play' && this.n >= MAX_STEPS) await this.end();
    if (this.phase === 'done' || this.taken.size >= SEATS) {
      this.release();
      if (this.phase !== 'done' && !this.socks.size) await this.end();
      server.send(JSON.stringify({ t: 'late' })); server.close(1000, 'late');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.phase === 'new') {
      this.phase = 'play';
      this.seed = crypto.getRandomValues(new Uint32Array(1))[0];
      this.startedAt = Date.now();
      await this.save();
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK);
    const id = crypto.randomUUID();
    this.socks.set(id, server);
    if (pid && /^[\w-]{8,64}$/.test(pid)) this.pid.set(id, pid);
    server.addEventListener('message', e => this.onMessage(id, e.data));
    server.addEventListener('close', () => this.onClose(id));
    server.addEventListener('error', () => this.onClose(id));
    const mine = this.owners.get(this.pid.get(id)); // the granny this player took before, if they took one in this round
    server.send(JSON.stringify({ t: 'start', seed: this.seed, n: this.n, history: this.history, mine: mine === undefined ? null : mine }));
    return new Response(null, { status: 101, webSocket: client });
  }

  sendAll(m) {
    const txt = JSON.stringify(m);
    this.socks.forEach((s, id) => { try { s.send(txt); } catch (e) { this.onClose(id); } });
  }

  tick() {
    this.n++;
    // takeovers first: a granny seat nobody else holds becomes this rider's
    // a rider who asked for a seat someone else already holds (or got in the same step) is told so and asks again
    const joins = [], won = [], lost = [], taken = this.taken;
    this.claims.forEach((seat, id) => {
      if (!this.socks.has(id)) return;
      const pid = this.pid.get(id);
      if (pid && this.owners.get(pid) === seat) {
        // a returning player gets their own granny back: no new takeover, just this connection steering her (an older connection of theirs stops)
        this.seat.forEach((s, other) => { if (s === seat && other !== id) this.seat.delete(other); });
        this.seat.set(id, seat); won.push([id, seat]);
      } else if (!taken.has(seat)) { this.seat.set(id, seat); taken.add(seat); joins.push(seat); won.push([id, seat]); if (pid) { this.owners.set(pid, seat); this.dirty = true; } }
      else lost.push(id);
    });
    this.claims.clear();
    const turns = [];
    this.queue.forEach((q, seat) => { if (q.length) turns.push([seat, q.shift()]); });
    if (joins.length || turns.length) { this.history.push([this.n, turns, joins]); this.dirty = true; }
    this.sendAll({ t: 'step', n: this.n, turns, joins });
    // sent after the step, so each screen has already seated the new rider when it hears who got the seat
    won.forEach(([id, seat]) => this.sendTo(id, { t: 'won', seat }));
    lost.forEach(id => this.sendTo(id, { t: 'lost' }));
    if (this.n >= MAX_STEPS) this.end();
    else if (this.dirty && Date.now() - this.lastSave > SAVE_EVERY) this.save().catch(() => {});
  }

  sendTo(id, m) {
    const s = this.socks.get(id);
    try { s && s.send(JSON.stringify(m)); } catch (e) { this.onClose(id); }
  }

  onMessage(id, data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    const seat = this.seat.get(id);
    if (m.t === 'claim' && seat === undefined && Number.isInteger(m.seat) && m.seat >= 0 && m.seat < SEATS) this.claims.set(id, m.seat);
    else if (m.t === 'none') { this.release(); this.drop(id, 'late'); }
    else if (m.t === 'turn' && seat !== undefined && Number.isInteger(m.d) && m.d >= 0 && m.d < 4) {
      const q = this.queue.get(seat) || [];
      if (q.length < 2) q.push(m.d);
      this.queue.set(seat, q);
    } else if (m.t === 'done' && seat !== undefined) this.end(); // a rider's screen saw the last granny crash: the round is over
    else if (m.t === 'hash' && Number.isInteger(m.n)) {
      const seen = this.hashes.get(m.n);
      if (seen === undefined) this.hashes.set(m.n, m.h);
      else if (seen !== m.h) console.warn(`HOA Wars: screens drifted apart at step ${m.n}`);
      this.hashes.delete(m.n - 500);
    }
  }

  drop(id, why) {
    const s = this.socks.get(id);
    this.socks.delete(id); this.claims.delete(id); this.pid.delete(id);
    try { s && s.send(JSON.stringify({ t: why })); s && s.close(1000, why); } catch (e) {}
    if (!this.socks.size) this.empty();
  }

  onClose(id) {
    if (!this.socks.has(id)) return;
    this.socks.delete(id); this.claims.delete(id); this.pid.delete(id);
    if (!this.socks.size) this.empty();
  }

  // the last rider left: the round is not over, it keeps running on the clock; save it and stop the ticking until someone comes back
  // (a round the lobby has already moved on from is cleared away instead)
  empty() {
    if (this.phase !== 'play') return;
    if (this.released) { this.end(); return; }
    clearInterval(this.timer); this.timer = null;
    this.save().catch(() => {});
  }

  release() {
    this.released = true;
    if (this.name) lobby(this.env).release(this.name).catch(() => {});
  }

  // the round ends at MAX_STEPS, or when the lobby has moved on and the last rider has left; its saved data is cleared away
  async end() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    clearInterval(this.timer); this.timer = null;
    this.release();
    this.sendAll({ t: 'end' });
    this.socks.forEach(s => { try { s.close(1000, 'round over'); } catch (e) {} });
    this.socks.clear();
    try { await this.ctx.storage.deleteAll(); } catch (e) {}
  }
}
