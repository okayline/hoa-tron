// HOA Wars server: the page is static (public/); /ws joins a live round.
// Lobby (one) sends each new rider to the match that is filling up. Match (one per round) seats up to 100 riders,
// starts FILL_MS after the first one joins, sends a random seed, then every TICK ms sends everyone that step's turns.
// The server never runs the game: every screen runs the same round from the seed and the turns.
import { DurableObject } from 'cloudflare:workers';

const FILL_MS = 20000, TICK = 95, SEATS = 100, MAX_STEPS = 6000; // 6000 steps is about 9.5 minutes

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      const name = await env.LOBBY.get(env.LOBBY.idFromName('lobby')).place();
      return env.MATCH.get(env.MATCH.idFromName(name)).fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};

export class Lobby extends DurableObject {
  // the match now filling; kept in memory only (if the Lobby restarts, the next rider just opens a new match)
  place() {
    const now = Date.now();
    if (!this.cur || now - this.cur.since > FILL_MS - 1000 || this.cur.n >= SEATS) {
      this.cur = { name: `m${now}-${crypto.getRandomValues(new Uint32Array(1))[0]}`, since: now, n: 0 };
    }
    this.cur.n++;
    return this.cur.name;
  }
}

export class Match extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.socks = []; this.phase = 'fill'; this.queue = new Map(); this.n = 0; this.overs = new Set(); this.hashes = new Map();
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (this.phase !== 'fill' || this.socks.length >= SEATS) {
      server.send(JSON.stringify({ t: 'late' })); server.close(1000, 'late');
      return new Response(null, { status: 101, webSocket: client });
    }
    const seat = this.socks.length;
    this.socks.push(server);
    if (!this.startAt) { this.startAt = Date.now() + FILL_MS; this.fillTimer = setTimeout(() => this.start(), FILL_MS); }
    server.addEventListener('message', e => this.onMessage(seat, e.data));
    server.addEventListener('close', () => this.onClose(seat));
    server.addEventListener('error', () => this.onClose(seat));
    this.sendAll({ t: 'wait', n: this.open().length, ms: this.startAt - Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  open() { return this.socks.map((s, i) => s ? i : -1).filter(i => i >= 0); }
  send(i, m) { try { this.socks[i] && this.socks[i].send(JSON.stringify(m)); } catch (e) { this.socks[i] = null; } }
  sendAll(m) { const txt = JSON.stringify(m); this.socks.forEach((s, i) => { if (!s) return; try { s.send(txt); } catch (e) { this.socks[i] = null; } }); }

  start() {
    const humans = this.open();
    if (!humans.length) return this.end();
    this.phase = 'play';
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    humans.forEach(i => this.send(i, { t: 'start', seed, humans, you: i }));
    this.timer = setInterval(() => this.tick(), TICK);
  }

  tick() {
    this.n++;
    const turns = [];
    this.queue.forEach((q, seat) => { if (q.length) turns.push([seat, q.shift()]); });
    this.sendAll({ t: 'step', n: this.n, turns });
    if (this.n >= MAX_STEPS) this.end();
  }

  onMessage(seat, data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'turn' && this.phase === 'play' && Number.isInteger(m.d) && m.d >= 0 && m.d < 4) {
      const q = this.queue.get(seat) || [];
      if (q.length < 2) q.push(m.d);
      this.queue.set(seat, q);
    } else if (m.t === 'over') {
      this.overs.add(seat);
      this.checkDone();
    } else if (m.t === 'hash' && Number.isInteger(m.n)) {
      const seen = this.hashes.get(m.n);
      if (seen === undefined) this.hashes.set(m.n, m.h);
      else if (seen !== m.h) console.warn(`HOA Wars: screens drifted apart at step ${m.n} (seat ${seat})`);
      this.hashes.delete(m.n - 500);
    }
  }

  onClose(seat) {
    this.socks[seat] = null;
    if (this.phase === 'fill' && !this.open().length) { clearTimeout(this.fillTimer); this.end(); }
    else this.checkDone();
  }

  // the round is over once every rider still connected has finished (crashed or won)
  checkDone() {
    if (this.phase === 'play' && this.open().every(i => this.overs.has(i))) this.end();
  }

  end() {
    this.phase = 'done';
    clearInterval(this.timer); clearTimeout(this.fillTimer);
    this.sendAll({ t: 'end' });
    this.socks.forEach(s => { try { s && s.close(1000, 'round over'); } catch (e) {} });
    this.socks = [];
  }
}
