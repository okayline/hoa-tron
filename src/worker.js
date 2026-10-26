// HOA Wars server. Each room is one Durable Object that runs the match and
// sends every player the same positions every step. The page itself is served from /public.
import { createGame, TICK } from '../public/game.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const room = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!room) return new Response('Missing room', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};

const pick = a => a[Math.floor(Math.random() * a.length)];

export class Room {
  constructor() {
    this.game = createGame();
    this.phase = 'ready'; // ready | play | over
    this.paths = this.game.riders.map(() => []);
    this.seats = [null, null, null, null]; // WebSocket per seat, null = granny bot
    this.watchers = new Set();
    this.timer = null;
    this.title = ''; this.text = '';
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.join(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  join(server) {
    const seat = this.seats.indexOf(null);
    if (seat >= 0) this.seats[seat] = server; else this.watchers.add(server);
    this.send(server, { t: 'hello', seat });
    this.sync(true);
    server.addEventListener('message', e => this.onMessage(server, e.data));
    const leave = () => this.leave(server);
    server.addEventListener('close', leave);
    server.addEventListener('error', leave);
  }

  onMessage(ws, data) {
    let m; try { m = JSON.parse(data); } catch { return; }
    const seat = this.seats.indexOf(ws);
    if (m.t === 'turn' && seat >= 0 && this.phase === 'play') this.game.queueTurn(seat, m.d);
    else if (m.t === 'start' && seat >= 0 && this.phase !== 'play') this.start();
  }

  leave(ws) {
    const seat = this.seats.indexOf(ws);
    if (seat >= 0) { this.seats[seat] = null; this.game.riders[seat].human = false; } // a granny takes over
    this.watchers.delete(ws);
    if (this.seats.every(s => !s)) this.stop();
    this.sync(false);
  }

  start() {
    const g = this.game;
    g.reset();
    g.riders.forEach((r, i) => { r.human = !!this.seats[i]; this.paths[i] = [[r.x, r.y]]; });
    this.phase = 'play'; this.title = ''; this.text = '';
    this.sync(true);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK);
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  tick() {
    const g = this.game;
    const dead = g.step();
    g.riders.forEach((r, i) => { if (r.alive) this.paths[i].push([r.x, r.y]); });
    this.broadcast({ t: 'tick', p: g.riders.map(r => [r.x, r.y, r.dir, r.alive ? 1 : 0]) });
    const alive = g.riders.filter(r => r.alive);
    const humansAlive = alive.filter(r => r.human).length;
    if (alive.length <= 1 || humansAlive === 0) this.finish(alive);
    else if (dead.length) this.sync(false);
  }

  finish(alive) {
    this.stop();
    this.phase = 'over';
    if (alive.length === 1) {
      const w = alive[0]; w.wins++;
      this.title = `${w.name} wins`;
      this.text = pick([
        'The board has been notified. Everyone else is in violation.',
        `${w.name} takes the cul-de-sac and the last word.`,
        'Nobody left on the street. Quiet at last.'
      ]);
    } else if (alive.length === 0) {
      this.title = 'Nobody wins';
      this.text = 'Everyone crashed at once. The board will be hearing about this.';
    } else {
      this.title = 'The grannies win';
      this.text = pick([
        'This is going in the next HOA newsletter.',
        'A formal complaint has been filed about the placement of that.'
      ]);
    }
    this.sync(false);
  }

  // Full picture of the room. Trails are included for new joiners and round starts.
  sync(withPaths) {
    const g = this.game;
    const msg = {
      t: 'state', phase: this.phase, title: this.title, text: this.text,
      seats: this.seats.map(s => !!s),
      riders: g.riders.map(r => ({ x: r.x, y: r.y, dir: r.dir, alive: r.alive, note: r.note, wins: r.wins, human: r.human }))
    };
    if (withPaths) msg.paths = this.paths;
    this.broadcast(msg);
  }

  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* socket already gone */ } }
  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const ws of [...this.seats, ...this.watchers]) if (ws) { try { ws.send(s); } catch { /* closed */ } }
  }
}
