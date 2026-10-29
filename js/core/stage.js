'use strict';
/* =========================================================================================
   B.L.A.M. core/stage.js -- stage framework.
   A stage is fully deterministic from (seed, tier, variant): config() gives the rules, timeline()
   lays out every spawn with the seeded RNG, and each target's pose is a pure function of its
   local time. That is what lets versus clients render the same stage without streaming it.
   Stage definition interface: see ENGINE.md ("How to add a stage").
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL;
const TIERS = [
  { id: 0, name: 'BEGINNER', lives: 5, sign: 'green' },
  { id: 1, name: 'ADVANCED', lives: 4, sign: 'amber' },
  { id: 2, name: 'VERY HARD', lives: 3, sign: 'crimson' },
  { id: 3, name: 'INSANE', lives: 3, sign: 'plum' }
];
const COUNTDOWN = 3.2;            // seconds of READY / 3-2-1 before t = 0
const PCOLS = [PAL.red, PAL.blue];
// mulberry32: tiny seeded PRNG, returns floats in [0, 1)
function mulberry32(a) {
  a >>>= 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const defs = {}, order = [];
function register(def) { defs[def.id] = def; if (!order.includes(def.id)) order.push(def.id); def.variants = def.variants || 1; return def; }
function get(id) { return defs[id] || defs[order[0]]; }
const envCache = {};
function env(id) {                 // the stage's static set, built once and cached
  const d = get(id);
  if (!envCache[d.id]) { envCache[d.id] = d.buildEnv(); envCache[d.id].visible = false; R.scene.add(envCache[d.id]); }
  return envCache[d.id];
}
function showEnv(id) { for (const k in envCache) envCache[k].visible = false; env(id).visible = true; }

// ---------- Run: one stage being played ----------
// o: { stage, tier, variant, seed, versus, local (0/1), names: [..], lives: [..], gun }
class Run {
  constructor(o) {
    this.o = o; this.def = get(o.stage); this.stage = this.def.id; this.tier = o.tier | 0; this.variant = o.variant | 0;
    this.seed = (o.seed >>> 0) || 1;
    this.cfg = this.def.config(this.tier, this.variant);
    this.timeline = this.def.timeline(this.cfg, mulberry32(hashStr(this.stage + '|' + this.tier + '|' + this.variant) ^ this.seed));
    this.timelineHash = hashStr(JSON.stringify(this.timeline)).toString(16);
    this.versus = !!o.versus; this.local = o.local | 0;
    this.t = -COUNTDOWN; this.state = 'count'; this.endReason = ''; this.endT = 0;
    this.live = []; this.next = 0; this.events = []; this.taken = new Map(); this.pending = new Map();
    const n = this.versus ? 2 : 1, names = o.names || ['P1', 'P2'];
    this.players = [];
    for (let i = 0; i < n; i++) {
      const lives = (o.lives && o.lives[i] != null) ? o.lives[i] : TIERS[this.tier].lives;
      this.players.push({ name: names[i] || 'P' + (i + 1), lives, maxLives: Math.max(lives, (o.maxLives && o.maxLives[i]) || lives),
        hits: 0, shots: 0, score: 0, fastest: Infinity, bombs: 0, hitAge: 9,
        ammo: new B.Ammo(this.cfg.ammo, i === this.local ? o.gun : null) });   // the remote one is display-only (synced by snapshots)
    }
    this.ammo = this.players[this.local].ammo;
    this.quotaMet = false; this.lastTick = 99;
    // versus: the stage clock follows the wall clock from an agreed start (briefing delay), so a slow or
    // background tab can't fall behind; single player uses frame time (a hitch doesn't eat your seconds)
    this.wall0 = performance.now() + (o.delay || 0) * 1000;
    showEnv(this.stage);
  }
  get me() { return this.players[this.local]; }
  get timeLeft() { return Math.max(0, this.cfg.time - Math.max(0, this.t)); }
  canShoot() { return this.state === 'play' && this.me.lives > 0 && this.t < this.cfg.time; }
  update(dt) {
    if (this.state === 'end') { this.endT += dt; this.updateTargets(); return; }
    if (this.versus) dt = Math.max(0, Math.min(1, -COUNTDOWN + (performance.now() - this.wall0) / 1000 - this.t));
    const prev = this.t; this.t += dt;
    if (this.state === 'count') {
      for (const k of [3, 2, 1]) if (prev < -k + 0.2 && this.t >= -k + 0.2) B.SFX.play('countdown', { n: k });
      if (this.t >= 0) { this.state = 'play'; B.SFX.play('go'); B.SFX.play('stageStart'); }
    }
    for (const p of this.players) p.hitAge += dt;
    this.ammo.update && this.ammo.update(dt);
    if (this.state !== 'play') return;
    // spawn everything whose time has come (deterministic order)
    while (this.next < this.timeline.length && this.timeline[this.next].t0 <= this.t) {
      const sp = this.timeline[this.next++];
      if (this.taken.has(sp.id)) continue;
      const tg = this.def.makeTarget(sp, this); tg.id = sp.id; tg.spawn = sp;
      R.scene.add(tg.group); this.live.push(tg);
    }
    this.updateTargets();
    if (B.Net && this.versus && B.Net.isHost) this.resolveClaims();
    const left = Math.ceil(this.timeLeft);
    if (left <= 5 && left < this.lastTick && left > 0) { this.lastTick = left; B.SFX.play('tick', { n: left }); }
    // end conditions: time up / timeline exhausted / out of ammo / out of lives
    let why = '';
    if (this.t >= this.cfg.time) why = 'time';
    else if (this.next >= this.timeline.length && !this.live.length) why = 'done';
    else if (!this.versus && this.ammo.empty) { this.dryT = (this.dryT || 0) + dt; if (this.dryT > 1.2) why = 'ammo'; }
    else if (this.versus && this.players.every(p => p.lives <= 0)) why = 'lives';
    if (why) this.end(why);
  }
  updateTargets() {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const tg = this.live[i], lt = this.t - tg.spawn.t0;
      const done = tg.update(lt, this);
      if (done) { tg.dispose(); this.live.splice(i, 1); }
    }
  }
  byId(id) { return this.live.find(t => t.id === id) || null; }
  end(why) {
    if (this.state === 'end') return;
    this.state = 'end'; this.endReason = why; this.endT = 0;
    const p = this.me;
    this.cleared = this.versus ? false : p.hits >= this.cfg.quota && p.lives > 0;
  }
  // ---------- scoring ----------
  // apply an awarded hit (single player: immediately; versus: when the host says so)
  applyHit(by, tid, st, point) {
    if (this.taken.has(tid)) return false;
    const sp = this.timeline[tid]; if (!sp) return false;
    const lt = st - sp.t0, pts = this.def.points(sp, lt), P = this.players[by];
    this.taken.set(tid, by);
    P.hits++; P.score += pts; P.hitAge = 0; P.fastest = Math.min(P.fastest, Math.max(0, lt - (sp.readyAt || 0)));
    const tg = this.byId(tid);
    if (tg && tg.alive) { tg.shatter(point || null, { tint: this.versus ? PCOLS[by] : null }); tg.deadT = this.t; }
    this.events.push({ type: 'hit', by, tid, pts, step: tg && tg.step });
    if (by === this.local) B.SFX.play('hit', { pts, step: tg && tg.step, by });
    else B.SFX.play('vsTaken', { by });
    if (!this.versus && !this.quotaMet && P.hits >= this.cfg.quota) { this.quotaMet = true; B.SFX.play('quota'); this.events.push({ type: 'quota' }); }
    return true;
  }
  // a bomb / bystander was shot by player `by`
  applyPenalty(by, kind, tid, point) {
    const P = this.players[by];
    P.lives = Math.max(0, P.lives - 1); P.bombs++; P.score = Math.max(0, P.score + (this.def.penalty || -300));
    if (tid != null) { this.taken.set(tid, -1); const tg = this.byId(tid); if (tg && tg.alive) { if (tg.explode) tg.explode(point); else tg.shatter(point); tg.deadT = this.t; } }
    this.events.push({ type: kind, by });
    if (by === this.local) { B.SFX.play(kind); B.SFX.play('lifeLost'); }
    if (!this.versus && P.lives <= 0) this.end('lives');
  }
  // ---------- versus adjudication (host only) ----------
  // claims for the same target that arrive within CLAIM_WINDOW are compared by stage-clock time
  hostClaim(by, tid, st) {
    const sp = this.timeline[tid];
    if (!sp || this.taken.has(tid)) return;
    if (st < sp.t0 - 0.25 || st > sp.t1 + 0.4) return;                      // not on screen at that time: ignore
    const c = this.pending.get(tid) || { claims: [], due: this.t + 0.12 };
    c.claims.push({ by, st }); this.pending.set(tid, c);
  }
  resolveClaims(force) {
    for (const [tid, c] of this.pending) {
      if (!force && this.t < c.due) continue;
      this.pending.delete(tid);
      c.claims.sort((a, b) => a.st - b.st || a.by - b.by);
      const win = c.claims[0];
      if (this.applyHit(win.by, tid, win.st, null)) B.Net.broadcastHit(tid, win.by, win.st);
    }
  }
  // display-only ammo for the other player in versus (synced by shots / 'am' / snapshots; reloading is theirs)
  remoteAmmo(a, ar) {
    const mag = !!(this.cfg.ammo && this.cfg.ammo.mag), n = Math.max(0, a | 0);
    return { infinite: a < 0, count: n, reloading: !!ar, empty: !mag && a >= 0 && n <= 0 && this.cfg.ammo !== 'unlimited', magEmpty: mag && n <= 0 && !ar, flash: 0 };
  }
  snapshot() { return this.players.map(p => [p.hits, p.shots, p.score, p.lives, isFinite(p.fastest) ? +p.fastest.toFixed(3) : -1, p.ammo.infinite ? -1 : p.ammo.count, p.ammo.reloading ? 1 : 0]); }
  applySnapshot(s) {
    if (!Array.isArray(s)) return;
    s.forEach((a, i) => {
      const p = this.players[i]; if (!p || !Array.isArray(a)) return;
      p.hits = a[0] | 0; p.shots = a[1] | 0; p.score = a[2] | 0;
      if (i !== this.local) { p.lives = a[3] | 0; p.ammo = this.remoteAmmo(a[5], a[6]); }
      p.fastest = a[4] >= 0 ? a[4] : Infinity;
    });
  }
  // results for the results screen
  results() {
    const p = this.me, shots = Math.max(p.shots, p.hits);
    const pct = shots ? Math.round(p.hits / shots * 100) : 0;
    const cleared = this.versus ? false : (p.hits >= this.cfg.quota && p.lives > 0);
    const bonus = cleared ? 500 + pct * 10 + Math.round(this.timeLeft) * 20 : 0;
    return { cleared, hits: p.hits, quota: this.cfg.quota, shots, pct, fastest: p.fastest, base: p.score, bonus, score: p.score + bonus };
  }
  dispose() { for (const t of this.live) t.dispose(); this.live.length = 0; }
}

// ---------- Course: 4 stages by tier ----------
class Course {
  constructor(tier, seed) {
    this.tier = tier; this.seed = seed >>> 0; this.index = 0; this.total = 0; this.log = [];
    this.lives = TIERS[tier].lives; this.maxLives = this.lives;
    // with one stage in the pool, the course repeats it with escalating variants (0..3)
    const pool = order.slice(), r = mulberry32(this.seed ^ 0x9e3779b9);
    this.stages = [];
    for (let i = 0; i < 4; i++) {
      const id = pool.length > 1 ? pool.splice(Math.floor(r() * pool.length), 1)[0] || order[i % order.length] : order[0];
      this.stages.push({ id, variant: Math.min(i, get(id).variants - 1) });
    }
  }
  get current() { return this.stages[this.index]; }
  get done() { return this.index >= this.stages.length; }
  stageSeed() { return (this.seed + this.index * 7919) >>> 0; }
}
B.Stage = { TIERS, COUNTDOWN, PCOLS, mulberry32, hashStr, register, get, defs, order, env, showEnv, Run, Course };
})(window.BLAM);
