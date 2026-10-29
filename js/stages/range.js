'use strict';
/* =========================================================================================
   B.L.A.M. stages/range.js -- Stage 1: THE SHOOTING RANGE.
   Bullseye paddles on carriages start FAR at the end of a lane, swing up in from the side,
   SCOOT FORWARD in steps toward the player while they hold, then drop. Far = more points.
   Higher tiers: bomb paddles (skull, don't shoot), faster scoots, shorter holds, more at once.
   The targets are BLAM.Props hex plates (lime, black rings, yellow bull); Very Hard / Insane add decoys, flip
   bombs and hidden bombs (a plate with a bomb tucked behind it, #41).
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
  // lane dividers: low walls with yellow caps (no free-standing posts: a paddle brings its own post and takes it away)
  for (const dx of [-3.6, -1.2, 1.2, 3.6]) {
    room.bx(dx - 0.05, 0, -11.9, dx + 0.05, 0.4, -0.95, PAL.slate);
    room.bx(dx - 0.06, 0.4, -11.9, dx + 0.06, 0.45, -0.95, PAL.yellow);
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

// ---------- paddle models: BLAM.Props (core/props.js) builds and shares them (hex target plates since the 3rd props pass) ----------
// (pivot at y 0.13, face centre 1.4175 above it: Props.PIVOT_Y / Props.FACE_Y, unchanged from the slab paddles)
B.Props.warm();

// ---------- motions (#34) ----------
// every paddle's pose is a pure function of its local time lt (versus-safe). sp.mo picks the motion:
//   'scoot' swing up in from the side, SCOOT FORWARD in steps while it holds, drop back (the classic)
//   'drop'  hangs from a ceiling rail: swings DOWN from above (pivot at the top), holds, swings back up
//   'pop'   pops UP out of the floor slot, holds, sinks back down
//   'side'  swings in from the side on a vertical hinge (edge-on -> face-on) while sliding in, then drops back
// Shootable windows (check pass 0.002): from readyAt (15 % into the entrance) until 70 % through the exit,
// so a target you can see can be hit.
const LEAVE = 0.35, HANG_Y = 4.3, POP_D = 1.95, SIDE_DX = 2.2;
function pose(sp, lt, out) {
  const o = out || {}, mo = sp.mo || 'scoot';
  o.x = LANES[sp.lane]; o.y = 0; o.z = sp.z0; o.rx = 0; o.ry = 0; o.rz = 0; o.step = sp.k || 0;
  o.visible = lt >= 0; o.shootable = false; o.done = false;
  if (lt < 0) return o;
  if (mo !== 'scoot') {
    const sw = sp.swing, stay = sp.stay;
    if (lt < sw) {                                                          // entrance
      const p = lt / sw, b = 1 - E.outBack(p);
      if (mo === 'drop') o.rx = -(Math.PI / 2) * b;
      else if (mo === 'pop') o.y = -POP_D * b;
      else { o.ry = sp.side * (Math.PI / 2) * b; o.x += sp.side * SIDE_DX * (1 - E.outCubic(p)); }
      o.shootable = lt >= sp.readyAt; return o;
    }
    const tau = lt - sw;
    if (tau < stay) {                                                       // hold, settling
      const w = Math.exp(-4.5 * tau);
      if (mo === 'drop') o.rx = 0.22 * w * Math.sin(9 * tau);              // pendulum
      else if (mo === 'pop') o.rx = 0.1 * w * Math.sin(18 * tau);
      else o.ry = sp.side * -0.18 * w * Math.sin(14 * tau);
      o.shootable = true; return o;
    }
    const q = tau - stay;
    if (q < LEAVE) {                                                        // exit
      const p = q / LEAVE, e = E.inCubic(p);
      if (mo === 'pop') o.y = -POP_D * e;
      else o.rx = -(Math.PI / 2) * e;                                       // drop: swings back up; side: falls back
      o.shootable = p < 0.7; return o;
    }
    o.visible = false; o.done = true; return o;
  }
  o.step = 0;
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
  if (tau < LEAVE) { const p = tau / LEAVE; o.rx = -(Math.PI / 2) * E.inCubic(p); o.shootable = p < 0.7; return o; }
  o.visible = false; o.done = true; return o;
}
// total on-screen life of a spawn (t1 - t0)
function lifeOf(sp) {
  return (sp.mo || 'scoot') === 'scoot' ? sp.swing + sp.steps * sp.hold + (sp.steps - 1) * sp.scoot + LEAVE : sp.swing + sp.stay + LEAVE;
}
// flip bomb (#24, optional): the fuse burns down; FLIP_T s of turning, then it is a real target for its last moments
const FLIP_T = 0.12;
// hidden bomb (#41, Very Hard / Insane): a plate with a bomb tucked right behind it. The first shot breaks the plate as
// usual (points); the bomb is revealed where the plate stood, its fuse lit and sparking. It springs to attention for HB_GRACE s
// (not hittable yet: an already queued double tap hits nothing), stays live until HB_BEAT, then drops (shootable for the
// first 70 % of the drop, like any exit). It is never hittable through the plate: its ball only becomes a hit part at the
// reveal. Everything after the reveal is a pure function of (lt, the local time the plate broke).
const HB_GRACE = 0.15, HB_BEAT = 0.6, HB_SPAN = HB_BEAT + LEAVE;
const HB_HOLD = +(HB_SPAN - LEAVE * 0.3).toFixed(3);   // a lane holding a hidden bomb stays reserved this much longer
class Paddle extends T.Target {
  constructor(sp) {
    super(sp.bomb && !sp.hidden ? 'bomb' : 'target');
    this.sp = sp; this.hang = sp.mo === 'drop';
    const P = B.Props, o = { hang: this.hang };
    this.prop = sp.flip ? P.flipbomb(o) : sp.decoy ? P.decoy(o) : sp.bomb && !sp.hidden ? P.bomb(o) : P.paddle(o);
    this.pivot = this.prop.pivot; this.disc = this.prop.face; this.disc2 = this.prop.face2 || null;
    this.group.add(this.prop.group);
    const pp = this.prop.register(this); this.pBomb = pp[0]; this.pGood = pp[1] || null;
    this.cur = this.prop; this.revealLt = -1; this.boom = false;
    if (sp.hidden) {                                  // the bomb behind: built now, out of sight, NOT a hit part yet
      this.hb = P.bomb(o); this.hb.group.visible = false; this.group.add(this.hb.group);   // 4 draw calls, like the bomb slot it took
      this.pHidden = this.hb.register(this)[0]; this.parts.pop();
    }
    this.step = 0; this.lastLt = 0; this.deadLt = -1; this.P = {}; this.announced = false;
  }
  // the hanger is built hanging (not a flipped floor paddle): mirror the pivot's x / y turns
  turn(rx, ry, rz) { const m = this.hang ? -1 : 1; this.cur.pivot.rotation.set(m * rx, m * ry, rz); }
  // the carriage (post + base) leaves WITH the paddle: it sinks out of sight (hangers: up into the ceiling)
  sink(k) { this.group.position.y += (this.hang ? 1.2 : -0.5) * E.inCubic(Math.max(0, Math.min(1, k))); }
  update(lt) {
    if (this.revealLt >= 0) return this.updateReveal(lt);
    const P = pose(this.sp, lt, this.P), sp = this.sp, pr = this.prop; this.lastLt = lt;
    // the carriage sinks in the last 0.1 s of its life, which is past the shootable window (70 % of the exit), or at
    // the end of the shot fold
    this.group.position.set(P.x, this.hang ? HANG_Y : P.y, P.z);
    if (!this.alive) {                                                      // shot: the post folds down behind
      if (this.deadLt < 0) this.deadLt = lt;
      const p = Math.min(1, (lt - this.deadLt) / 0.4);
      this.group.visible = true; pr.hide(); this.sink((p - 0.55) / 0.45);
      this.turn(-(Math.PI / 2) * E.inCubic(p), P.ry, P.rz);
      return p >= 1 || P.done;
    }
    this.group.visible = P.visible;
    if (!P.shootable && lt > sp.swing) this.sink((lt - (lifeOf(sp) - 0.1)) / 0.1);
    this.turn(P.rx, P.ry, P.rz);
    this.shootable = P.shootable;
    let fuse = 1;
    if (sp.flip) {                                                          // flip bomb: kind is a pure function of lt
      const f = lt - sp.flip, flipped = pr.setFlip(f < 0 ? 0 : f >= FLIP_T ? 1 : f / FLIP_T);
      this.kind = flipped ? 'target' : 'bomb';
      this.parts[0] = flipped ? this.pGood : this.pBomb;
      fuse = Math.max(0, Math.min(1, 1 - lt / sp.flip));
      pr.setFuse(0.12 + 0.88 * fuse);
    }
    if (sp.decoy) pr.wobble(lt);                                            // the tell: a painted bomb can't keep still
    if (P.step !== this.step) { this.step = P.step; B.SFX.play('targetStep', { step: this.step }); }
    if (!this.announced && P.visible) { this.announced = true; B.SFX.play('targetIn', { u: (R.toPx(this.group.position)[0]) / R.RW }); }
    if (this.kind === 'bomb') pr.sparkle(lt, fuse < 0.35);
    return P.done;
  }
  // the revealed bomb: springs to attention where the plate stood (lane centre, floor height, the stop it was scooting
  // to; an outBack hop over HB_GRACE), its lit fuse sparking hot and big for the beat, drops. Shot: it folds away like
  // any hit target.
  updateReveal(lt) {
    const hb = this.hb, q = lt - this.revealLt, A = this.R0; this.lastLt = lt;
    const g = Math.min(1, q / HB_GRACE), e = E.outBack(g), s = 1 - e;
    this.group.visible = true;
    this.group.position.set(A.x * s + A.xl * e, this.hang ? HANG_Y : A.y * s, A.z + (A.zt - A.z) * E.outCubic(g));
    if (!this.alive) {
      const p = Math.min(1, (lt - this.deadLt) / 0.4);
      hb.hide(); this.sink((p - 0.55) / 0.45); this.turn(-(Math.PI / 2) * E.inCubic(p), 0, 0);
      return p >= 1;
    }
    const d = Math.max(0, (q - HB_BEAT) / LEAVE);                           // the drop after the beat
    this.turn(A.rx * s - (Math.PI / 2) * E.inCubic(Math.min(1, d)), A.ry * s, A.rz * s);
    this.shootable = q >= HB_GRACE && d < 0.7;
    hb.sparkle(lt, true); hb.spark.scale.multiplyScalar(1.45);              // a hot, big spark
    if (d >= 1) { this.group.visible = false; return true; }
    this.sink((q - (HB_SPAN - 0.1)) / 0.1);
    return false;
  }
  reveal() {
    const sp = this.sp, lt = this.lastLt, P0 = pose(sp, lt), k = Math.ceil((P0.z - sp.z0) / sp.sd - 1e-6);
    this.R0 = { x: P0.x, y: P0.y, z: P0.z, rx: P0.rx, ry: P0.ry, rz: P0.rz, xl: LANES[sp.lane],
      zt: sp.mo === 'scoot' ? sp.z0 + Math.max(0, Math.min(sp.steps - 1, k)) * sp.sd : P0.z };
    this.revealLt = lt; this.alive = true; this.kind = 'bomb'; this.shootable = false; this.deadLt = -1;
    this.parts = [this.pHidden];
    this.prop.group.visible = false; this.hb.group.visible = true; this.hb.show(); this.cur = this.hb; this.pivot = this.hb.pivot;
    this.hb.sparkle(lt, true);
    this.group.updateMatrixWorld(true);                    // the fuse catches: a spit of sparks where it burns
    T.sparks(new THREE.Vector3().setFromMatrixPosition(this.hb.spark.matrixWorld), 7, ['lemon', 'yellow', 'orange'], 1.4, 0.035);
    B.SFX.play('bombReveal', { u: R.toPx(this.group.position)[0] / R.RW });
  }
  shatter(point, opts) {
    if (this.revealLt >= 0 && !this.boom) return;          // a late hit confirmation for the plate (versus): the bomb stays
    super.shatter(point, opts);
    this.group.visible = true; this.cur.hide();                             // keep the carriage, it folds away
    this.deadLt = this.lastLt;
    if (this.hb && this.revealLt < 0) this.reveal();       // a hidden bomb: the plate broke, the bomb stands there
  }
  explode(point) {
    if (this.hb && this.revealLt < 0) this.shatter(point); // (versus: the rival shot the revealed bomb first) the plate goes too
    this.boom = true;
    const f = this.parts[0].mesh; f.updateMatrixWorld(true);
    const c = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    T.burst(c, 1);
    this.shatter(point || c, { power: 1.7, max: 60 });
  }
}

// ---------- rules per tier and variant (build 0.003: the whole curve moved up two notches, #22) ----------
// hold = linger time per stop; quick + mix = the top two tiers mix in targets that drop almost at once
// (rng per target); bomb = bomb roll per spawn, bombCap = hard ceiling on the bomb share (#24); share = quota
// share of the real targets; rel = reload seconds; mag = rounds per magazine (variants 1 and 3)
const TIER_P = [
  { time: 42, hold: 1.1,  quick: 0,    mix: 0,    swing: 0.62, scoot: 0.27, steps: 4, live: 4, bomb: 0.12, bombCap: 0.10, gap: [0.95, 1.6],  rel: 0.75, slack: 10, share: 0.52 },
  { time: 38, hold: 0.72, quick: 0,    mix: 0,    swing: 0.5,  scoot: 0.2,  steps: 5, live: 5, bomb: 0.22, bombCap: 0.20, gap: [0.6, 1.15],  rel: 0.7,  slack: 8,  share: 0.56 },
  { time: 35, hold: 0.7,  quick: 0.26, mix: 0.5,  swing: 0.4,  scoot: 0.15, steps: 5, live: 6, bomb: 0.34, bombCap: 0.30, gap: [0.3, 0.68],  rel: 0.62, slack: 6,  share: 0.58 },
  { time: 32, hold: 0.6,  quick: 0.2,  mix: 0.5,  swing: 0.32, scoot: 0.12, steps: 5, live: 7, bomb: 0.42, bombCap: 0.35, gap: [0.22, 0.52], rel: 0.55, slack: 4,  share: 0.6  }
];
// motion mix (#34): weights per spawn, from the seeded rng
const MOTIONS = [['scoot', 0.4], ['drop', 0.2], ['pop', 0.2], ['side', 0.2]];
const VARIANT_NAMES = ['FREE FIRE', 'RELOAD DRILL', 'COUNT YOUR SHOTS', 'FINAL ROUND'];
function config(tier, v) {
  const b = TIER_P[Math.max(0, Math.min(3, tier | 0))]; v = Math.max(0, Math.min(3, v | 0));
  const c = Object.assign({}, b);
  c.hold = +(b.hold * (1 - 0.06 * v)).toFixed(3); c.scoot = +(b.scoot * (1 - 0.05 * v)).toFixed(3);
  c.quick = +(b.quick * (1 - 0.04 * v)).toFixed(3);
  c.live = b.live + (v >= 3 ? 1 : 0);
  c.bomb = v >= 2 ? b.bomb + 0.04 : b.bomb;
  c.share = Math.min(0.75, b.share + 0.02 * v);
  c.quota = 8;                                       // placeholder: timeline() derives the real quota
  c.autoReload = false;                              // per-stage option: true = the old automatic reload
  c.flipbomb = (tier | 0) >= 2;                      // flip bombs (#24 optional), Very Hard / Insane only
  c.decoy = (tier | 0) >= 2;                         // decoys (bombs painted like targets, #35), Very Hard / Insane only
  c.hiddenBomb = (tier | 0) >= 2;                    // a bomb tucked behind a plate (#41), Very Hard / Insane only
  c.ammo = [
    'unlimited',
    { mag: 8, reloadTime: b.rel, autoReload: c.autoReload },
    { cap: 0 },                                      // = quota + slack, set by timeline() (estimate below for menus)
    { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: c.autoReload }
  ][v];
  c.variant = v; c.tier = tier | 0; c.title = 'SHOOTING RANGE'; c.subtitle = VARIANT_NAMES[v];
  if (c.ammo.cap === 0) { const est = Object.assign({}, c); timeline(est, B.Stage.mulberry32(0x5eed)); c.ammo = est.ammo; c.quota = est.quota; }
  return c;
}
function pickMotion(rng) {
  let r = rng() * MOTIONS.reduce((a, m) => a + m[1], 0);
  for (const [m, w] of MOTIONS) { if ((r -= w) < 0) return m; }
  return 'scoot';
}
// timeline: every spawn from the seeded rng only. Target mix rules (#24):
//  - bombs <= bombCap share of all spawns so far (checked as they are made), never two bombs in a row,
//  - a bomb only appears while at least as many real targets are up (and staying a while) as bombs,
//  - so real targets keep flowing and the quota (a share of the REAL targets) is always reachable.
// A bomb slot becomes a flip bomb, a decoy or (Very Hard / Insane, #41) a HIDDEN bomb: a real plate with a bomb behind it
// (sp.bomb stays true: it takes the bomb share and is a bonus like a flip bomb, never counted toward the quota). The hidden
// roll reuses flipRoll, so a seed that never rolls one keeps the exact same timeline.
function timeline(c, rng) {
  const out = [], floorFree = LANES.map(() => 0), hangFree = LANES.map(() => 0);
  const sd = +((Z_NEAR - Z_FAR) / (c.steps - 1)).toFixed(3);
  let t = 0.4, guard = 0, bombs = 0;
  while (guard++ < 800) {
    const up = out.filter(s => s.t1 > t);
    if (up.length >= c.live) { t = up.map(s => s.t1).sort((a, b) => a - b)[up.length - c.live] + 0.05; continue; }
    let mo = pickMotion(rng);
    const freeOf = arr => { const f = []; arr.forEach((e, l) => { if (e <= t) f.push(l); }); return f; };
    let free = freeOf(mo === 'drop' ? hangFree : floorFree);
    if (!free.length) { mo = mo === 'drop' ? 'scoot' : 'drop'; free = freeOf(mo === 'drop' ? hangFree : floorFree); }
    if (!free.length) { t = Math.min(...floorFree, ...hangFree) + 0.05; continue; }
    const lane = rng.pick(free), side = lane < 2 ? -1 : lane > 2 ? 1 : (rng() < 0.5 ? -1 : 1);
    const quick = c.mix > 0 && rng() < c.mix;                    // top tiers: about half drop almost at once
    const sp = { id: out.length, t0: +t.toFixed(3), t1: 0, mo, lane, side, bomb: false, swing: c.swing,
      hold: quick ? c.quick : c.hold, scoot: c.scoot, steps: mo === 'scoot' ? (quick ? 2 : c.steps) : 1, sd, z0: Z_FAR, k: 0, stay: 0,
      quick, readyAt: +(c.swing * 0.15).toFixed(3) };           // shootable once it is swinging / popping into view
    if (mo !== 'scoot') {
      sp.k = rng.int(0, c.steps - 1); sp.z0 = +(Z_FAR + sp.k * sd).toFixed(3);
      sp.stay = +(quick ? c.quick : c.hold * 1.8).toFixed(3);
    }
    const life = lifeOf(sp);
    if (t + life > c.time - 0.2) break;
    sp.t1 = +(t + life).toFixed(3);
    // bomb roll + the mix rules
    const roll = rng(), flipRoll = rng();
    const goodUp = up.filter(s => !s.bomb && s.t1 > t + 0.6).length, bombsUp = up.filter(s => s.bomb).length;
    const prevBomb = out.length && out[out.length - 1].bomb;
    if (out.length > 1 && roll < c.bomb && !prevBomb && (bombs + 1) <= c.bombCap * (out.length + 1) && goodUp >= 1 && bombsUp + 1 <= goodUp) {
      sp.bomb = true; bombs++;
      const flipAt = life - LEAVE - 0.4;                        // real target for its last ~0.4 s on screen
      if (c.flipbomb && flipRoll < 0.45 && flipAt > sp.swing + 0.25) sp.flip = +flipAt.toFixed(3);
      else if (c.hiddenBomb && flipRoll >= 0.6 && flipRoll < 0.8 && (mo === 'scoot' || mo === 'pop')) sp.hidden = true;   // #41
      else if (c.decoy && flipRoll >= 0.8) sp.decoy = true;          // painted like a target: still a bomb (~1 in 5 bombs)
    }
    out.push(sp);
    // a hidden bomb can outlive its plate by HB_HOLD (shot at the last moment + the beat + the drop): keep its lane clear
    (mo === 'drop' ? hangFree : floorFree)[lane] = t + life + 0.25 + (sp.hidden ? HB_HOLD : 0);
    t += rng.range(c.gap[0], c.gap[1]);
  }
  // the quota is a share of the REAL targets this seed produced (flip bombs are a bonus, never counted);
  // a hard ammo cap follows the quota
  const good = out.filter(s => !s.bomb).length;
  c.goodCount = good; c.bombCount = out.length - good;
  c.quota = Math.max(4, Math.round(good * c.share));
  if (c.ammo && c.ammo.cap != null) c.ammo = { cap: c.quota + c.slack };
  return out;
}
const STEP_PTS = [300, 200, 150, 120, 100];
function points(sp, lt) { return (STEP_PTS[Math.min(STEP_PTS.length - 1, pose(sp, lt).step)] || 100) + (sp.flip ? 100 : 0) + (sp.quick ? 50 : 0); }
function briefing(c) {
  const tip = c.ammo && c.ammo.mag ? 'SHOOT THE FRAME (OR R) TO RELOAD!' : c.hiddenBomb && c.variant === 2 ? 'BOMB BEHIND THE PLATE? HOLD FIRE!'
    : c.flipbomb ? 'BURNT FUSE = BOMB FLIPS: SHOOT IT!' : 'FAR AWAY = MORE POINTS';
  return { rule: [['SHOOT ', 'void'], [c.quota + ' TARGETS', 'red'], [' OR MORE!', 'void']], icon: 'bullseye', unit: 'TARGETS',
    dont: c.bomb > 0 ? 'bomb' : null, tip };
}
// briefing card icon (stage hook, ENGINE.md "Briefing icons"): the lime hex plate, ~2r across (the HUD default is the old
// red bullseye). The don't-shoot sticker keeps the HUD's bomb.
function drawIcon(cx, cy, r) {
  const H = B.HUD, k = Math.ceil(r) + 2, a = 0.88 * r;
  H.draw(H.pixImg('rangePlate' + r, 2 * k + 1, 2 * k + 1, (x, y) => {
    const px = x - k, py = y - k, h = Math.max(Math.abs(py), 0.866 * Math.abs(px) + 0.5 * Math.abs(py));
    if (h > a + 1.2) return null; if (h > a) return 'void';
    if (h > a - 1.2) return py < -0.3 * a ? 'lemon' : py > 0.3 * a ? 'green' : 'lime';   // the chamfer: lit top, shaded bottom
    const d = Math.hypot(px, py) / a;
    return d < 0.21 ? 'yellow' : d < 0.38 ? 'void' : d < 0.57 ? 'lime' : d < 0.74 ? 'void' : 'lime';
  }), cx - k, cy - k);
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
        if (cyc !== tg.cyc) { tg.cyc = cyc; tg.alive = true; tg.deadLt = -1; tg.prop.show(); tg.group.visible = true; }
        if (!tg.alive && tg.deadLt >= 0 && lt < tg.deadLt) tg.deadLt = lt;
        tg.update(lt);
      }
    }
  };
}
B.Stage.register({ id: 'range', name: 'SHOOTING RANGE', short: 'RANGE', variants: 4, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget: sp => new Paddle(sp), points, briefing, drawIcon, decor, pose, LANES });
})(window.BLAM);
