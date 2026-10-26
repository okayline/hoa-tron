// HOA Wars server. The page is static (public/); /ws joins the live round.
// One Durable Object (Room) holds the round: its seed, its start time and every takeover and turn. It has no game
// loop and never runs the game. Every screen runs the round on its own clock (step n is at startAt + n * TICK), so
// nothing waits for the server. A turn is stamped with the step it happens on and passed to everyone straight away;
// a screen that hears about it a little late rewinds those few steps and plays them again.
import { DurableObject } from 'cloudflare:workers';

const TICK = 95, SEATS = 100, MAX_STEPS = 6000; // 6000 steps is about 9.5 minutes
const BACK = 30, AHEAD = 20; // a turn may be stamped up to 30 steps in the past (a slow phone) or 20 ahead
const JOIN_LEAD = 2; // a takeover happens 2 steps after the server hears it, so most screens hear it in time
const CHUNK = 500;

export default {
  async fetch(req, env) {
    if (new URL(req.url).pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName('hoa')).fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};

const now = r => Math.floor((Date.now() - r.startAt) / TICK);
const freshRound = () => ({
  seed: crypto.getRandomValues(new Uint32Array(1))[0], startAt: Date.now(), over: false,
  events: [], taken: new Set(), owners: new Map(), last: new Map(), socks: new Set()
});

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.round = null; this.conns = new Map(); this.saveTimer = 0;
    ctx.blockConcurrencyWhile(async () => { try { await this.load(); } catch (e) { console.warn('HOA Wars: could not load the round', e); } });
  }

  async load() {
    const meta = await this.ctx.storage.get('meta');
    if (!meta || !Number.isFinite(meta.startAt) || !Number.isFinite(meta.seed)) return;
    const r = freshRound();
    Object.assign(r, { seed: meta.seed, startAt: meta.startAt, over: meta.over, owners: new Map(Object.entries(meta.owners || {})) });
    const parts = await this.ctx.storage.list({ prefix: 'e' });
    r.events = [].concat(...[...parts.values()].filter(Array.isArray));
    r.events.forEach(([n, type, seat]) => { if (type === 1) r.taken.add(seat); r.last.set(seat, Math.max(r.last.get(seat) || 0, n)); });
    this.round = r;
  }

  // only the current round is kept; a save is at most every 2 s and never holds messages back
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = 0;
      const r = this.round;
      if (!r) return;
      const rec = { meta: { seed: r.seed, startAt: r.startAt, over: r.over, owners: Object.fromEntries(r.owners) } };
      for (let k = 0; k * CHUNK < r.events.length; k++) rec['e' + String(k).padStart(4, '0')] = r.events.slice(k * CHUNK, (k + 1) * CHUNK);
      this.ctx.storage.put(rec, { allowUnconfirmed: true }).catch(() => {});
    }, 2000);
  }

  async newRound() {
    this.round = freshRound();
    await this.ctx.storage.deleteAll();
    this.save();
  }

  async fetch(req) {
    const pid = new URL(req.url).searchParams.get('p');
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const r0 = this.round;
    if (!r0 || r0.over || now(r0) >= MAX_STEPS || r0.taken.size >= SEATS) await this.newRound();
    const r = this.round;
    const c = { ws: server, round: r, pid: pid && /^[\w-]{8,64}$/.test(pid) ? pid : null, seat: undefined };
    this.conns.set(server, c); r.socks.add(c);
    server.addEventListener('message', e => this.onMessage(c, e.data));
    server.addEventListener('close', () => this.drop(c));
    server.addEventListener('error', () => this.drop(c));
    const mine = c.pid ? r.owners.get(c.pid) : undefined;
    this.send(c, { t: 'start', seed: r.seed, startAt: r.startAt, now: Date.now(), events: r.events, mine: mine === undefined ? null : mine });
    return new Response(null, { status: 101, webSocket: client });
  }

  send(c, m) { try { c.ws.send(JSON.stringify(m)); } catch (e) { this.drop(c); } }
  sendAll(r, m, except, extra) {
    const txt = JSON.stringify(m);
    r.socks.forEach(c => { if (c === except) this.send(c, Object.assign({}, m, extra)); else try { c.ws.send(txt); } catch (e) { this.drop(c); } });
  }

  onMessage(c, data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    const r = c.round;
    if (m.t === 'ping') return this.send(c, { t: 'pong', c: m.c, s: Date.now() });
    if (m.t === 'claim' && c.seat === undefined && Number.isInteger(m.seat) && m.seat >= 0 && m.seat < SEATS) {
      if (c.pid && r.owners.get(c.pid) === m.seat) {
        // a returning player gets their own granny back: no new takeover; an older connection of theirs stops steering her
        r.socks.forEach(o => { if (o !== c && o.seat === m.seat) o.seat = undefined; });
        c.seat = m.seat; return this.send(c, { t: 'won', seat: m.seat });
      }
      if (r.taken.has(m.seat)) return this.send(c, { t: 'lost' });
      const n = now(r) + JOIN_LEAD, ev = [n, 1, m.seat];
      r.taken.add(m.seat); r.last.set(m.seat, n); c.seat = m.seat;
      if (c.pid) r.owners.set(c.pid, m.seat);
      r.events.push(ev); this.save();
      this.sendAll(r, { t: 'ev', e: ev });
      return this.send(c, { t: 'won', seat: m.seat });
    }
    if (m.t === 'turn' && c.seat !== undefined && Number.isInteger(m.d) && m.d >= 0 && m.d < 4) {
      const cur = now(r);
      let n = Number.isInteger(m.n) && m.n >= cur - BACK && m.n <= cur + AHEAD ? m.n : cur + 1;
      n = Math.max(n, (r.last.get(c.seat) || 0) + 1); // one turn per rider per step, in order
      r.last.set(c.seat, n);
      const ev = [n, 0, c.seat, m.d];
      r.events.push(ev); this.save();
      return this.sendAll(r, { t: 'ev', e: ev }, c, { id: m.id });
    }
    // a screen saw the last granny crash, or found no granny to take over: the next rider gets a new round
    if ((m.t === 'done' || m.t === 'none') && r === this.round) { r.over = true; this.save(); }
  }

  drop(c) {
    if (!this.conns.has(c.ws)) return;
    this.conns.delete(c.ws); c.round.socks.delete(c);
    try { c.ws.close(1000, 'bye'); } catch (e) {}
  }
}
