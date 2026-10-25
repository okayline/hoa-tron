// HOA Wars server: the page is static (public/); /ws drops you into the live round.
// Lobby (one) points every new rider at the round now running. Match (one per round) starts the moment its first rider
// arrives: it picks a random seed and every TICK ms sends everyone that step's turns and takeovers. A rider who joins
// gets the seed and every step so far, catches up on their own screen, then claims a granny who is still riding; the
// takeover goes out as part of the next step. The server never runs the game: every screen runs the same round.
import { DurableObject } from 'cloudflare:workers';

const TICK = 95, SEATS = 100, MAX_STEPS = 6000; // 6000 steps is about 9.5 minutes

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
  // the round now running; kept in memory only (if the Lobby restarts, the next rider just opens a new round)
  place() {
    if (!this.cur) this.cur = `m${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
    return this.cur;
  }
  // a round that ended or is full: the next rider gets a new one
  release(name) { if (this.cur === name) this.cur = null; }
}

export class Match extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.socks = new Map(); this.seat = new Map(); this.claims = new Map(); this.queue = new Map();
    this.phase = 'new'; this.n = 0; this.history = []; this.overs = new Set(); this.hashes = new Map();
  }

  setName(name) { this.name = name; }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (this.phase === 'done' || this.seat.size >= SEATS) {
      if (this.phase !== 'done') this.release();
      server.send(JSON.stringify({ t: 'late' })); server.close(1000, 'late');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.phase === 'new') {
      this.phase = 'play';
      this.seed = crypto.getRandomValues(new Uint32Array(1))[0];
      this.timer = setInterval(() => this.tick(), TICK);
    }
    const id = crypto.randomUUID();
    this.socks.set(id, server);
    server.addEventListener('message', e => this.onMessage(id, e.data));
    server.addEventListener('close', () => this.onClose(id));
    server.addEventListener('error', () => this.onClose(id));
    server.send(JSON.stringify({ t: 'start', seed: this.seed, n: this.n, history: this.history }));
    return new Response(null, { status: 101, webSocket: client });
  }

  sendAll(m) {
    const txt = JSON.stringify(m);
    this.socks.forEach((s, id) => { try { s.send(txt); } catch (e) { this.onClose(id); } });
  }

  tick() {
    this.n++;
    // takeovers first: a granny seat nobody else holds becomes this rider's
    const joins = [], taken = new Set(this.seat.values());
    this.claims.forEach((seat, id) => {
      if (!taken.has(seat) && this.socks.has(id)) { this.seat.set(id, seat); taken.add(seat); joins.push(seat); }
    });
    this.claims.clear();
    const turns = [];
    this.queue.forEach((q, seat) => { if (q.length) turns.push([seat, q.shift()]); });
    if (joins.length || turns.length) this.history.push([this.n, turns, joins]);
    this.sendAll({ t: 'step', n: this.n, turns, joins });
    if (this.n >= MAX_STEPS) this.end();
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
    } else if (m.t === 'over' && seat !== undefined) { this.overs.add(id); this.drop(id, 'end'); }
    else if (m.t === 'hash' && Number.isInteger(m.n)) {
      const seen = this.hashes.get(m.n);
      if (seen === undefined) this.hashes.set(m.n, m.h);
      else if (seen !== m.h) console.warn(`HOA Wars: screens drifted apart at step ${m.n}`);
      this.hashes.delete(m.n - 500);
    }
  }

  drop(id, why) {
    const s = this.socks.get(id);
    this.socks.delete(id); this.claims.delete(id);
    try { s && s.send(JSON.stringify({ t: why })); s && s.close(1000, why); } catch (e) {}
    if (!this.socks.size) this.end();
  }

  onClose(id) {
    if (!this.socks.has(id)) return;
    this.socks.delete(id); this.claims.delete(id);
    if (!this.socks.size) this.end();
  }

  release() { if (this.name) lobby(this.env).release(this.name).catch(() => {}); }

  // the round ends when nobody is left watching it, or at MAX_STEPS
  end() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    clearInterval(this.timer);
    this.release();
    this.sendAll({ t: 'end' });
    this.socks.forEach(s => { try { s.close(1000, 'round over'); } catch (e) {} });
    this.socks.clear();
  }
}
