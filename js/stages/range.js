'use strict';
/* =========================================================================================
   B.L.A.M. stages/range.js -- Stage 1: THE SHOOTING RANGE.
   Bullseye paddles on carriages start FAR at the end of a lane, swing up in from the side,
   SCOOT FORWARD in steps toward the player while they hold, then drop. Far = more points.
   Higher tiers: bomb paddles (skull, don't shoot), faster scoots, shorter holds, more at once.
   Everything is a pure function of (seed, tier, variant) and the stage clock.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets;
const LANES = [-4.8, -2.4, 0, 2.4, 4.8];
const Z_FAR = -10.6, Z_NEAR = -2.3;

// ---------- the room (static set: one baked env mesh + one unlit glow mesh) ----------
const FIXTURES = [1.0, -3.5, -8.0];
function bakeLight(x, y, z) {
  let L = 0.58;
  for (const fz of FIXTURES) { const dz = z - fz; L += 0.9 * Math.exp(-(dz * dz * 0.22 + x * x * 0.010 + (5 - y) * (5 - y) * 0.035)); }
  if (z < -11.5) L += 0.4 * Math.exp(-(y - 2.6) * (y - 2.6) * 0.12 - x * x * 0.012);
  return Math.min(L, 1.3);
}
function buildEnv() {
  const group = new THREE.Group();
  const room = new Vox(); room.bake = bakeLight;
  const glow = new Vox();
  const strip = (x0, x1, y0, y1, z0, z1, col, mask) => { for (let x = x0; x < x1 - 1e-6; x += 1) room.bx(x, y0, z0, Math.min(x + 1, x1), y1, z1, col, null, mask); };
  // floor: navy concrete tiles, a steel track slot down every lane, tan distance marks at each scoot stop
  for (let x = -7; x < 7; x++) for (let z = -12; z < 6; z++) room.bx(x, -0.2, z, x + 1, 0, z + 1, PAL.navy, null, 4);
  for (const lx of LANES) {
    for (let z = -11.6; z < -1.4; z += 1) room.bx(lx - 0.07, -0.01, z, lx + 0.07, 0.005, Math.min(z + 1, -1.4), PAL.void, null, 4);
    for (let k = 0; k < 5; k++) { const z = Z_FAR + k * (Z_NEAR - Z_FAR) / 4; room.bx(lx - 0.55, -0.01, z - 0.04, lx - 0.25, 0.008, z + 0.04, PAL.tan, null, 4); room.bx(lx + 0.25, -0.01, z - 0.04, lx + 0.55, 0.008, z + 0.04, PAL.tan, null, 4); }
  }
  // back wall: navy tiles, indigo skirting, slate ribs
  for (let x = -7; x < 7; x++) for (let y = 0; y < 5; y++) room.bx(x, y, -12.2, x + 1, y + 1, -12, y < 1 ? PAL.indigo : PAL.navy, null, 16);
  for (const rx of [-6.5, -5, 5, 6.5]) room.bx(rx - 0.08, 1, -12.05, rx + 0.08, 4.9, -11.92, PAL.slate);
  strip(-7, 7, 0, 0.3, -12, -11.85, PAL.walnut);
  // EMBOSSED LOGO: "B.L.A.M." raised out of a recessed panel on the back wall (lit like the wall, so it dithers)
  {
    const t = R.bold('B.L.A.M.'), s = 0.14, w = t.w * s, x0 = -w / 2, y0 = 3.55, z = -12;
    room.bx(x0 - 0.45, y0 - 7 * s - 0.4, z, x0 + w + 0.45, y0 + 0.45, z + 0.05, PAL.slate);       // panel bevel
    room.bx(x0 - 0.32, y0 - 7 * s - 0.27, z + 0.05, x0 + w + 0.32, y0 + 0.32, z + 0.07, PAL.midnight);
    for (const [px, py] of t.px) {
      const c = py === 0 ? PAL.haze : py >= 5 ? PAL.slate : PAL.steel;
      room.bx(x0 + px * s, y0 - (py + 1) * s, z + 0.07, x0 + (px + 1) * s, y0 - py * s, z + 0.07 + s * 1.4, c);
    }
    glow.bx(x0 - 0.45, y0 - 7 * s - 0.55, z + 0.08, x0 + w + 0.45, y0 - 7 * s - 0.49, z + 0.1, PAL.pink);   // neon underline
    glow.bx(x0 - 0.45, y0 + 0.52, z + 0.08, x0 + w + 0.45, y0 + 0.56, z + 0.1, PAL.cyan);
  }
  // side walls: walnut wainscot, navy above, slate ribs, chestnut chair rail
  for (const sx of [-1, 1]) {
    const mask = sx < 0 ? 1 : 2, wx = sx * 7;
    for (let z = -12; z < 6; z++) for (let y = 0; y < 5; y++) room.bx(sx < 0 ? wx - 0.2 : wx, y, z, sx < 0 ? wx : wx + 0.2, y + 1, z + 1, y < 1 ? PAL.walnut : PAL.navy, null, mask);
    for (let z = -11; z < 6; z += 2) room.bx(wx - 0.08, 1, z - 0.08, wx + 0.08, 4.9, z + 0.08, PAL.slate);
    room.bx(wx - 0.06, 1.0, -12, wx + 0.06, 1.12, 6, PAL.chestnut);
  }
  // ceiling + beams + light fixtures
  for (let x = -7; x < 7; x++) for (let z = -12; z < 6; z++) room.bx(x, 5, z, x + 1, 5.2, z + 1, PAL.midnight, null, 8);
  for (let z = -11; z < 6; z += 2) strip(-7, 7, 4.78, 5, z - 0.12, z + 0.12, PAL.navy);
  for (const fz of FIXTURES) { strip(-5, 5, 4.6, 4.78, fz - 0.32, fz + 0.32, PAL.slate); glow.bx(-4.8, 4.56, fz - 0.2, 4.8, 4.6, fz + 0.2, PAL.lemon); }
  // lane numbers 1-5 high on the back wall + neon stripes either side of the logo
  LANES.forEach((lx, i) => {
    const t = R.small(String(i + 1)), s = 0.11;
    for (const [px, py] of t.px) glow.box(lx + (px - 1) * s, 4.5 - py * s, -11.9, s, s, 0.04, PAL.lemon);
  });
  glow.bx(-7, 4.0, -11.95, -3.2, 4.08, -11.9, PAL.pink); glow.bx(3.2, 4.0, -11.95, 7, 4.08, -11.9, PAL.pink);
  glow.bx(-7, 3.86, -11.95, -3.2, 3.9, -11.9, PAL.cyan); glow.bx(3.2, 3.86, -11.95, 7, 3.9, -11.9, PAL.cyan);
  // lane dividers: low walls with yellow caps and steel posts
  for (const dx of [-3.6, -1.2, 1.2, 3.6]) {
    room.bx(dx - 0.05, 0, -11.9, dx + 0.05, 0.4, -0.95, PAL.slate);
    room.bx(dx - 0.06, 0.4, -11.9, dx + 0.06, 0.45, -0.95, PAL.yellow);
    for (let z = -1.0; z > -11.9; z -= 2.6) room.bx(dx - 0.07, 0, z - 0.07, dx + 0.07, 0.75, z + 0.07, PAL.steel);
  }
  // near barrier: wooden planks with a tan cap
  strip(-7, 7, 0, 0.16, -0.85, -0.6, PAL.walnut);
  strip(-7, 7, 0.16, 0.32, -0.85, -0.6, PAL.chestnut);
  strip(-7, 7, 0.32, 0.47, -0.85, -0.6, PAL.walnut);
  strip(-7, 7, 0.47, 0.52, -0.9, -0.55, PAL.tan);
  // foreground counter (shooter's bench)
  [3.5, 3.65, 3.8].forEach((z, i) => strip(-7, 7, 0.95, 1.05, z, z + 0.15, i & 1 ? PAL.chestnut : PAL.tan, 4));
  strip(-7, 7, 1.05, 1.12, 3.43, 3.52, PAL.crimson);
  strip(-7, 7, 0.9, 1.06, 3.95, 4.04, PAL.amber);
  const roomMesh = room.mesh(MAT.env); roomMesh.userData.env = true;
  group.add(roomMesh, glow.mesh(MAT.glow));
  group.userData.shootables = [roomMesh];          // env meshes that take bullet holes
  return group;
}

// ---------- paddle models (shared geometry, built once) ----------
const DS = 0.085, DR = 5.5 * DS;                  // disc voxel, disc radius
const PIVOT_Y = 0.13, POST_H = 0.95, DISC_Y = POST_H + DR;   // in pivot space
function discList(bomb) {
  const list = [];
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const d = Math.hypot(i, j); if (d > 5.45) continue;
    let c;
    if (bomb) c = d > 4.5 ? PAL.red : PAL.void;
    else c = d <= 1.5 ? PAL.yellow : d <= 2.6 ? PAL.red : d <= 3.6 ? PAL.bone : d <= 4.6 ? PAL.red : PAL.bone;
    list.push([i, j, 0, c], [i, j, -1, bomb ? PAL.void : PAL.walnut]);
    if (d <= 4.5) list.push([i, j, 1, c], [i, j, -2, bomb ? PAL.slate : PAL.umber]);   // bevelled: thick middle, stepped faces
  }
  if (bomb) {                                     // skull on the raised face + fuse stub on top
    const SK = B.HUD.SKULL;
    SK.forEach((row, r) => { for (let x = 0; x < row.length; x++) if (row[x] === 'X') { const v = list.find(e => e[0] === x - 3 && e[1] === 2 - r && e[2] === 1); if (v) v[3] = PAL.bone; } });
    list.push([0, 6, 0, PAL.walnut], [0, 7, 0, PAL.walnut], [1, 7, 0, PAL.chestnut]);
  }
  return list;
}
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const base = new Vox();
  base.bx(-0.3, 0, -0.22, 0.3, 0.1, 0.22, PAL.chestnut); base.bx(-0.32, 0.1, -0.24, 0.32, 0.13, 0.24, PAL.tan);
  base.bx(-0.26, -0.02, -0.25, -0.18, 0.04, 0.25, PAL.void); base.bx(0.18, -0.02, -0.25, 0.26, 0.04, 0.25, PAL.void);
  base.bx(-0.1, 0.13, -0.08, 0.1, 0.19, 0.08, PAL.slate);                        // hinge block
  const post = new Vox();
  post.bx(-0.045, 0, -0.045, 0.045, POST_H + 0.1, 0.045, PAL.steel); post.bx(-0.075, 0, -0.075, 0.075, 0.1, 0.075, PAL.slate);
  post.bx(-0.06, POST_H - 0.05, -0.2, 0.06, POST_H + 0.08, -0.04, PAL.steel);   // clamp behind the disc
  const PL = discList(false), BL = discList(true);
  GEO = { base: base.geo(), post: post.geo(), paddle: new Vox().vox(PL, DS, 0, DISC_Y, 0).geo(), bomb: new Vox().vox(BL, DS, 0, DISC_Y, 0).geo(), PL, BL };
  const sp = new Vox(); sp.bx(-0.05, 0, -0.05, 0.05, 0.1, 0.05, PAL.lemon); sp.bx(-0.03, 0.1, -0.03, 0.03, 0.16, 0.03, PAL.orange);
  GEO.spark = sp.geo();
  return GEO;
}
const shared = (g, m) => { const x = new THREE.Mesh(g, m); x.userData.sharedGeo = true; return x; };

// pure pose of a paddle at local time lt (seconds since its spawn)
function pose(sp, lt, out) {
  const o = out || {};
  o.x = LANES[sp.lane]; o.z = sp.z0; o.rx = 0; o.rz = 0; o.step = 0; o.visible = lt >= 0; o.shootable = false; o.done = false;
  if (lt < 0) return o;
  if (lt < sp.swing) {                                                      // swing up in from the side
    const p = lt / sp.swing;
    o.rz = sp.side * (Math.PI / 2) * (1 - E.outBack(p));
    o.x += sp.side * 1.4 * (1 - E.outCubic(p));
    o.shootable = lt >= sp.readyAt; return o;
  }
  let tau = lt - sp.swing;
  for (let k = 0; k < sp.steps; k++) {
    if (tau < sp.hold) {                                                    // hold (wobbling after a scoot)
      o.z = sp.z0 + k * sp.sd; o.step = k; o.shootable = true;
      o.rx = k ? 0.16 * Math.exp(-7 * tau) * Math.sin(20 * tau) : 0;
      if (!k) o.rz = sp.side * -0.1 * Math.exp(-6 * tau) * Math.sin(16 * tau);
      return o;
    }
    tau -= sp.hold;
    if (k < sp.steps - 1) {
      if (tau < sp.scoot) {                                                 // scoot forward one step
        const p = tau / sp.scoot;
        o.z = sp.z0 + (k + E.inOut(p)) * sp.sd; o.step = k; o.shootable = true;
        o.rx = -0.14 * Math.sin(Math.PI * p);
        return o;
      }
      tau -= sp.scoot;
    }
  }
  o.z = sp.z0 + (sp.steps - 1) * sp.sd; o.step = sp.steps - 1;
  // drop: still hittable while the disc faces you (until ~30 deg back), so a visible target never eats a MISS
  if (tau < 0.35) { const p = tau / 0.35; o.rx = -(Math.PI / 2) * E.inCubic(p); o.shootable = p < 0.7; return o; }
  o.visible = false; o.done = true; return o;
}
class Paddle extends T.Target {
  constructor(sp) {
    super(sp.bomb ? 'bomb' : 'target');
    const G = geos(); this.sp = sp;
    this.pivot = new THREE.Group(); this.pivot.position.y = PIVOT_Y;
    this.base = shared(G.base, MAT.obj); this.post = shared(G.post, MAT.obj);
    this.disc = shared(sp.bomb ? G.bomb : G.paddle, MAT.obj);
    this.pivot.add(this.post, this.disc); this.group.add(this.base, this.pivot);
    this.part(this.disc, sp.bomb ? G.BL : G.PL, DS, 0, DISC_Y, 0);
    if (sp.bomb) { this.spark = shared(G.spark, MAT.glow); this.spark.position.set(0.04, DISC_Y + 7.5 * DS, 0); this.pivot.add(this.spark); }
    this.step = 0; this.lastLt = 0; this.deadLt = -1; this.P = {}; this.announced = false;
  }
  update(lt) {
    const P = pose(this.sp, lt, this.P); this.lastLt = lt;
    this.group.position.set(P.x, 0, P.z);
    if (!this.alive) {                                                      // shot: the post folds down behind
      if (this.deadLt < 0) this.deadLt = lt;
      const p = Math.min(1, (lt - this.deadLt) / 0.4);
      this.group.visible = true; this.disc.visible = false; if (this.spark) this.spark.visible = false;
      this.pivot.rotation.set(-(Math.PI / 2) * E.inCubic(p), 0, P.rz);
      return p >= 1 || P.done;
    }
    this.group.visible = P.visible;
    this.pivot.rotation.set(P.rx, 0, P.rz);
    this.shootable = P.shootable;
    if (P.step !== this.step) { this.step = P.step; B.SFX.play('targetStep', { step: this.step }); }
    if (!this.announced && P.visible) { this.announced = true; B.SFX.play('targetIn', { u: (R.toPx(this.group.position)[0]) / R.RW }); }
    if (this.spark) { const f = ((lt * 14) | 0) % 3; this.spark.visible = f !== 2; this.spark.scale.setScalar(f ? 1 : 1.5); }
    return P.done;
  }
  shatter(point, opts) {
    super.shatter(point, opts);
    this.group.visible = true; this.disc.visible = false;                   // keep the carriage, it folds away
    this.deadLt = this.lastLt;
  }
  explode(point) {
    this.disc.updateMatrixWorld(true);
    const c = new THREE.Vector3(0, DISC_Y, 0).applyMatrix4(this.pivot.matrixWorld);
    T.puff(c, 46, 1.1);
    this.shatter(point || c, { power: 1.7, max: 90 });
  }
}

// ---------- rules per tier and variant ----------
const TIER_P = [
  { quota: 8,  time: 45, hold: 1.7,  swing: 0.85, scoot: 0.38, steps: 3, live: 3, bomb: 0,    gap: [1.4, 2.4], rel: 1.2, slack: 12 },
  { quota: 12, time: 42, hold: 1.25, swing: 0.7,  scoot: 0.3,  steps: 4, live: 4, bomb: 0.14, gap: [1.0, 1.8], rel: 1.1, slack: 9 },
  { quota: 16, time: 40, hold: 0.95, swing: 0.6,  scoot: 0.24, steps: 4, live: 5, bomb: 0.2,  gap: [0.6, 1.2], rel: 1.0, slack: 7 },
  { quota: 20, time: 36, hold: 0.7,  swing: 0.5,  scoot: 0.2,  steps: 5, live: 5, bomb: 0.26, gap: [0.45, 0.95], rel: 0.9, slack: 5 }
];
const QUOTA_SHARE = [0.45, 0.52, 0.58, 0.64];
const VARIANT_NAMES = ['FREE FIRE', 'RELOAD DRILL', 'COUNT YOUR SHOTS', 'FINAL ROUND'];
function config(tier, v) {
  const b = TIER_P[Math.max(0, Math.min(3, tier | 0))]; v = Math.max(0, Math.min(3, v | 0));
  const c = Object.assign({}, b);
  c.hold = +(b.hold * (1 - 0.06 * v)).toFixed(3); c.scoot = +(b.scoot * (1 - 0.05 * v)).toFixed(3);
  c.quota = b.quota + v * 2; c.live = b.live + (v >= 3 ? 1 : 0);
  c.bomb = v >= 2 ? Math.max(b.bomb + 0.04, 0.1) : b.bomb;
  c.ammo = [
    'unlimited',
    { mag: 6, autoReload: true, reloadTime: b.rel },
    { cap: c.quota + b.slack },
    { mag: 8, autoReload: true, reloadTime: +(b.rel * 0.85).toFixed(2) }
  ][v];
  c.variant = v; c.tier = tier | 0; c.title = 'SHOOTING RANGE'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
function timeline(c, rng) {
  const out = [], laneFree = LANES.map(() => 0), ends = [];
  const sd = +((Z_NEAR - Z_FAR) / (c.steps - 1)).toFixed(3);
  const life = c.swing + c.steps * c.hold + (c.steps - 1) * c.scoot + 0.35;
  let t = 0.4, guard = 0;
  while (guard++ < 500) {
    const active = ends.filter(e => e > t).sort((a, b) => a - b);
    if (active.length >= c.live) { t = active[active.length - c.live] + 0.05; continue; }
    const free = []; LANES.forEach((_, l) => { if (laneFree[l] <= t) free.push(l); });
    if (!free.length) { t = Math.min(...laneFree) + 0.05; continue; }
    if (t + life > c.time - 0.2) break;
    const lane = rng.pick(free), side = lane < 2 ? -1 : lane > 2 ? 1 : (rng() < 0.5 ? -1 : 1);
    const bomb = out.length > 1 && rng() < c.bomb;
    const t0 = +t.toFixed(3);
    out.push({ id: out.length, t0, t1: +(t + life).toFixed(3), lane, side, bomb, swing: c.swing, hold: c.hold, scoot: c.scoot,
      steps: c.steps, sd, z0: Z_FAR, readyAt: +(c.swing * 0.15).toFixed(3) });   // shootable once it is swinging up into view
    laneFree[lane] = t + life + 0.25; ends.push(t + life);
    t += rng.range(c.gap[0], c.gap[1]);
  }
  // the quota is a share of the good targets this seed actually produced (so it is always fair);
  // a hard ammo cap follows the quota
  const good = out.filter(s => !s.bomb).length;
  c.quota = Math.max(4, Math.round(good * (QUOTA_SHARE[c.tier] + 0.03 * c.variant)));
  if (c.ammo && c.ammo.cap) c.ammo = { cap: c.quota + c.slack };
  return out;
}
const STEP_PTS = [300, 200, 150, 120, 100];
function points(sp, lt) { return STEP_PTS[Math.min(STEP_PTS.length - 1, pose(sp, lt).step)] || 100; }
function briefing(c) {
  return { rule: [['SHOOT ', 'void'], [c.quota + ' TARGETS', 'red'], [' OR MORE!', 'void']], icon: 'bullseye', unit: 'TARGETS',
    dont: c.bomb > 0 ? 'bomb' : null, tip: 'FAR AWAY = MORE POINTS' };
}
// title-screen decoration: paddles cycling forever in the back lanes (shootable for fun)
function decor() {
  const items = [0, 1, 3, 4].map((lane, i) => {
    const sp = { id: -1 - i, t0: 0, lane, side: lane < 2 ? -1 : 1, bomb: false, swing: 0.8, hold: 1.6, scoot: 0.4, steps: 3, sd: 1.6, z0: -10.6, readyAt: 0.12 };
    const tg = new Paddle(sp); tg.spawn = sp; tg.off = i * 2.1;
    return tg;
  });
  const period = 0.8 + 3 * 1.6 + 2 * 0.4 + 0.35 + 1.2;
  return {
    targets: items,
    update(t) {
      for (const tg of items) {
        const lt = (t + tg.off) % period, cyc = Math.floor((t + tg.off) / period);
        if (cyc !== tg.cyc) { tg.cyc = cyc; tg.alive = true; tg.deadLt = -1; tg.disc.visible = true; tg.group.visible = true; }
        if (!tg.alive && tg.deadLt >= 0 && lt < tg.deadLt) tg.deadLt = lt;
        tg.update(lt);
      }
    }
  };
}
B.Stage.register({ id: 'range', name: 'SHOOTING RANGE', short: 'RANGE', variants: 4, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget: sp => new Paddle(sp), points, briefing, decor, pose, LANES });
})(window.BLAM);
