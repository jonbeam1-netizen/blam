'use strict';
/* =========================================================================================
   B.L.A.M. stages/range.js -- Stage 1: THE SHOOTING RANGE.
   Bullseye paddles on carriages start FAR at the end of a lane, swing up in from the side,
   SCOOT FORWARD in steps toward the player while they hold, then drop. Far = more points.
   The targets are BLAM.Props hex plates (lime, black rings, yellow bull). Bombs (skull, don't shoot) and every
   trick come at EVERY tier (2026-10-29 rework, no tier gates): decoys (bombs painted like a plate; shot, they unmask
   for DECOY_ARM s before the bang), flip bombs (a bomb that burns down and flips into a plate), TURNCOATS (a plate
   that wobbles, grows a fuse tick and flips into a bomb), hidden bombs (a plate with a bomb tucked behind it, #41)
   and PATTERN ROWS (a column of 4-5 in one lane, front first; or a row of 3-5 across adjacent lanes, in step).
   The curve runs the other way from the old one: higher tiers = FEWER targets at once, bigger gaps, shorter holds,
   a higher bomb share, more patterns, a higher quota share and less spare ammo, so Insane wants every shot.
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
  const k0 = sp.k || 0;                                                     // a column member starts at stop k0
  o.step = k0;
  if (lt < sp.swing) {                                                      // swing up in from the side
    const p = lt / sp.swing;
    o.rz = sp.side * (Math.PI / 2) * (1 - E.outBack(p));
    o.x += sp.side * 1.4 * (1 - E.outCubic(p));
    o.shootable = lt >= sp.readyAt; return o;
  }
  let tau = lt - sp.swing;
  for (let k = 0; k < sp.steps; k++) {
    if (tau < sp.hold) {                                                    // hold (wobbling after a scoot)
      o.z = sp.z0 + k * sp.sd; o.step = k0 + k; o.shootable = true;
      o.rx = k ? 0.16 * Math.exp(-7 * tau) * Math.sin(20 * tau) : 0;
      if (!k) o.rz = sp.side * -0.1 * Math.exp(-6 * tau) * Math.sin(16 * tau);
      return o;
    }
    tau -= sp.hold;
    if (k < sp.steps - 1) {
      if (tau < sp.scoot) {                                                 // scoot forward one step
        const p = tau / sp.scoot;
        o.z = sp.z0 + (k + E.inOut(p)) * sp.sd; o.step = k0 + k; o.shootable = true;
        o.rx = -0.14 * Math.sin(Math.PI * p);
        return o;
      }
      tau -= sp.scoot;
    }
  }
  o.z = sp.z0 + (sp.steps - 1) * sp.sd; o.step = k0 + sp.steps - 1;
  // drop: still hittable while the disc faces you (until ~30 deg back), so a visible target never eats a MISS
  if (tau < LEAVE) { const p = tau / LEAVE; o.rx = -(Math.PI / 2) * E.inCubic(p); o.shootable = p < 0.7; return o; }
  o.visible = false; o.done = true; return o;
}
// total on-screen life of a spawn (t1 - t0)
function lifeOf(sp) {
  return (sp.mo || 'scoot') === 'scoot' ? sp.swing + sp.steps * sp.hold + (sp.steps - 1) * sp.scoot + LEAVE : sp.swing + sp.stay + LEAVE;
}
// FLIP BOMB (#24, every tier): the fuse burns down; FLIP_T s of turning, then it is a real target for its last moments.
// TURNCOAT (sp.turn, every tier, 2026-10-29): the other way round. A real plate (flipbomb prop shown plate side) that
// at lt = sp.turn - sp.tel starts its TELEGRAPH (the plate wobbles harder and harder, a fuse spark ticks on its top
// corner, the fuse-catch sound), then flips over FLIP_T into a lit bomb and stays one for the rest of its life. Kind is
// a pure function of lt (target until the flip is half way), so both versus tabs agree. Hit before the turn: +50.
const FLIP_T = 0.12;
// hidden bomb (#41, every tier): a plate with a bomb tucked right behind it. The first shot breaks the plate as
// usual (points); the bomb is revealed where the plate stood, its fuse lit and sparking. It springs to attention for HB_GRACE s
// (not hittable yet: an already queued double tap hits nothing), stays live until HB_BEAT, then drops (shootable for the
// first 70 % of the drop, like any exit). It is never hittable through the plate: its ball only becomes a hit part at the
// reveal. Everything after the reveal is a pure function of (lt, the local time the plate broke).
const HB_GRACE = 0.15, HB_BEAT = 0.6, HB_SPAN = HB_BEAT + LEAVE;
const HB_HOLD = +(HB_SPAN - LEAVE * 0.3).toFixed(3);   // a lane holding a hidden bomb stays reserved this much longer
// DECOY BUILD-UP (2026-10-29): a shot decoy does not blow at once. Run.applyPenalty asks target.arm() for the bang
// time: the paddle freezes where it was hit, the disguise falls away over DECOY_UNMASK s (prop.unmask(k), or without it
// a plain bomb swapped in), the bare bomb swells with its fuse flaring, and at DECOY_ARM s it explodes; the life, the
// points, the 'bomb' event (screen shake, LIFE -1) and the boom land THEN (stage.js Run.deferred). 'bombReveal' plays
// at the shot. A rival's decoy (versus 'pen' -> explode()) runs the same build-up on its own and blows at the same delay.
const DECOY_ARM = 0.3, DECOY_UNMASK = 0.16;
// COLUMN (vertical pattern): a member stands tilted back COL_TILT rad (not shootable) while the one in front of it is
// up; once that one is shot or starts its drop, it stands up over STAND_T s (shootable from 60 % of it).
const COL_TILT = 0.95, STAND_T = 0.16;
class Paddle extends T.Target {
  constructor(sp) {
    super(sp.bomb && !sp.hidden ? 'bomb' : 'target');
    this.sp = sp; this.hang = sp.mo === 'drop';
    const P = B.Props, o = { hang: this.hang };
    if (sp.decoy) {                                   // decoy variant: a pure function of the spawn id (versus-safe; P.decoy alone would roll Math.random)
      const V = P.DECOY_VARIANTS || ['a'], h = (Math.imul((sp.id | 0) + 1, 2654435761) >>> 0) / 4294967296;
      o.variant = V[Math.min(V.length - 1, Math.floor(h * V.length))];
    }
    this.prop = sp.flip || sp.turn ? P.flipbomb(o) : sp.decoy ? P.decoy(o) : sp.bomb && !sp.hidden ? P.bomb(o) : P.paddle(o);
    this.pivot = this.prop.pivot; this.disc = this.prop.face; this.disc2 = this.prop.face2 || null;
    this.group.add(this.prop.group);
    const pp = this.prop.register(this); this.pBomb = pp[0]; this.pGood = pp[1] || null;
    this.cur = this.prop; this.revealLt = -1; this.boom = false; this.armLt = -1; this.upLt = -1;
    if (sp.hidden) {                                  // the bomb behind: built now, out of sight, NOT a hit part yet
      this.hb = P.bomb(o); this.hb.group.visible = false; this.group.add(this.hb.group);   // 4 draw calls, like the bomb slot it took
      this.pHidden = this.hb.register(this)[0]; this.parts.pop();
    }
    if (sp.turn) {                                    // a turncoat starts plate side up, with a spare fuse spark for the tell
      this.prop.setFlip(1); this.parts[0] = this.pGood;
      if (this.prop.spark && this.prop.face2) {
        this.tick = this.prop.spark.clone(); this.tick.raycast = () => {}; this.tick.visible = false;
        this.tick.position.set(0.33, 0.56, 0.05); this.prop.face2.add(this.tick);
      }
    }
    this.step = (sp.mo || 'scoot') === 'scoot' ? (sp.k || 0) : 0;
    this.lastLt = 0; this.deadLt = -1; this.P = {}; this.announced = false;
  }
  // the hanger is built hanging (not a flipped floor paddle): mirror the pivot's x / y turns
  turn(rx, ry, rz) { const m = this.hang ? -1 : 1; this.cur.pivot.rotation.set(m * rx, m * ry, rz); }
  // the carriage (post + base) leaves WITH the paddle: it sinks out of sight (hangers: up into the ceiling)
  sink(k) { this.group.position.y += (this.hang ? 1.2 : -0.5) * E.inCubic(Math.max(0, Math.min(1, k))); }
  update(lt, run) {
    if (this.revealLt >= 0) return this.updateReveal(lt);
    if (this.armLt >= 0 && this.alive) return this.updateArm(lt);
    const sp = this.sp, pr = this.prop, P = pose(sp, this.armLt >= 0 ? this.armLt : lt, this.P); this.lastLt = lt;
    // the carriage sinks in the last 0.1 s of its life, which is past the shootable window (70 % of the exit), or at
    // the end of the shot fold
    this.group.position.set(P.x, this.hang ? HANG_Y : P.y, P.z);
    if (!this.alive) {                                                      // shot: the post folds down behind
      if (this.deadLt < 0) this.deadLt = lt;
      const p = Math.min(1, (lt - this.deadLt) / 0.4);
      this.group.visible = true; pr.hide(); if (this.fb) this.fb.hide(); this.sink((p - 0.55) / 0.45);
      this.turn(-(Math.PI / 2) * E.inCubic(p), P.ry, P.rz);
      return p >= 1 || P.done;
    }
    this.group.visible = P.visible;
    if (!P.shootable && lt > sp.swing) this.sink((lt - (lifeOf(sp) - 0.1)) / 0.1);
    let tilt = 0;
    if (sp.aheadD) {                                                        // a column member: wait for the one in front
      const f = run && run.byId ? run.byId(sp.id - sp.aheadD) : null;
      const blocked = !!(f && f.alive && f.sp && lt < lifeOf(f.sp) - LEAVE);
      if (blocked) this.upLt = -1; else if (this.upLt < 0) this.upLt = lt;
      const g = this.upLt < 0 ? 0 : Math.min(1, (lt - this.upLt) / STAND_T);
      tilt = COL_TILT * (1 - E.outBack(g));
      if (g < 0.6) P.shootable = false;
    }
    this.turn(P.rx - tilt, P.ry, P.rz);
    this.shootable = P.shootable;
    let fuse = 1;
    if (sp.flip) {                                                          // flip bomb: kind is a pure function of lt
      const f = lt - sp.flip, flipped = pr.setFlip(f < 0 ? 0 : f >= FLIP_T ? 1 : f / FLIP_T);
      this.kind = flipped ? 'target' : 'bomb';
      this.parts[0] = flipped ? this.pGood : this.pBomb;
      fuse = Math.max(0, Math.min(1, 1 - lt / sp.flip));
      pr.setFuse(0.12 + 0.88 * fuse);
    }
    if (sp.turn) this.updateTurn(lt);
    if (sp.decoy) pr.wobble(lt);                                            // the tell: a painted bomb can't keep still
    if (P.step !== this.step) { this.step = P.step; B.SFX.play('targetStep', { step: this.step }); }
    if (!this.announced && P.visible) { this.announced = true; B.SFX.play('targetIn', { u: (R.toPx(this.group.position)[0]) / R.RW }); }
    if (this.kind === 'bomb') pr.sparkle(lt, fuse < 0.35 || !!sp.turn);
    return P.done;
  }
  // turncoat: telegraph (wobble + fuse tick) then the flip from plate to bomb; all from lt
  updateTurn(lt) {
    const sp = this.sp, pr = this.prop, f = lt - sp.turn, g = f < 0 ? 0 : f >= FLIP_T ? 1 : f / FLIP_T;
    const plate = pr.setFlip(1 - g);
    this.kind = plate ? 'target' : 'bomb'; this.parts[0] = plate ? this.pGood : this.pBomb;
    const w = lt - (sp.turn - sp.tel), a = Math.max(0, Math.min(1, w / sp.tel));
    if (pr.face2) pr.face2.rotation.z = plate && w >= 0 ? (0.05 + 0.11 * a) * Math.sin(w * (15 + 18 * a)) : 0;
    if (this.tick) {
      const on = plate && w >= 0 && (a > 0.75 || ((w * (7 + 22 * a)) | 0) % 2 === 0);
      this.tick.visible = on; if (on) this.tick.scale.setScalar(1 + 0.8 * a);
    }
    if (w >= 0 && plate && !this.telAnn && this.shootable) {               // the fuse catches: spit + the fuse sound
      this.telAnn = true;
      if (this.tick) { this.group.updateMatrixWorld(true); T.sparks(new THREE.Vector3().setFromMatrixPosition(this.tick.matrixWorld), 5, ['lemon', 'yellow', 'orange'], 1.1, 0.03); }
      B.SFX.play('bombReveal', { u: R.toPx(this.group.position)[0] / R.RW });
    }
    if (!plate) pr.setFuse(0.45);
  }
  // decoy build-up: frozen where it was hit, the disguise falls away, the bare bomb swells with a flaring fuse
  updateArm(lt) {
    const sp = this.sp, q = lt - this.armLt, P = pose(sp, this.armLt, this.P), k = Math.min(1, q / DECOY_UNMASK);
    this.lastLt = lt; this.shootable = false; this.group.visible = true;
    this.group.position.set(P.x, this.hang ? HANG_Y : P.y, P.z);
    if (this.prop.unmask) this.prop.unmask(E.outCubic(k));
    else if (!this.fb) {                                                    // no unmask(): swap a plain bomb in
      this.fb = B.Props.bomb({ hang: this.hang }); this.group.add(this.fb.group);
      this.prop.group.visible = false; this.cur = this.fb;
    }
    const b = this.cur, sw = 1 + 0.16 * E.inCubic(Math.min(1, q / DECOY_ARM));
    b.pivot.scale.setScalar(sw);
    this.turn(P.rx * (1 - k), P.ry * (1 - k), P.rz * (1 - k));             // settles square to you while it unmasks
    b.sparkle(lt, true); if (b.spark) b.spark.scale.multiplyScalar(1.3 + 1.1 * Math.min(1, q / DECOY_ARM));
    if ((this.autoBoom && q >= DECOY_ARM - 1e-3) || q >= DECOY_ARM + 0.4) this.explode(this.boomPoint);   // (+0.4: a lost deferral)
    return false;
  }
  // Run.applyPenalty hook: a decoy arms and returns the stage time of its bang; anything else blows now (-1)
  arm(point, st) {
    if (!this.sp.decoy || this.revealLt >= 0 || !this.alive) return -1;
    if (this.armLt < 0) {
      this.armLt = st != null ? st - this.sp.t0 : this.lastLt; this.shootable = false; this.boomPoint = point || null;
      this.group.updateMatrixWorld(true);
      if (this.prop.spark) T.sparks(new THREE.Vector3().setFromMatrixPosition(this.prop.spark.matrixWorld), 8, ['lemon', 'yellow', 'orange'], 1.5, 0.035);
      B.SFX.play('bombReveal', { u: R.toPx(this.group.position)[0] / R.RW });
    }
    return +(this.sp.t0 + this.armLt + DECOY_ARM).toFixed(4);
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
    if (this.sp.decoy && this.revealLt < 0 && this.alive) {                 // a decoy: build up first, then the bang
      if (this.armLt < 0) this.arm(point, null);
      if (this.lastLt - this.armLt < DECOY_ARM - 1e-3) { this.autoBoom = true; if (point) this.boomPoint = point; return; }
    }
    if (this.hb && this.revealLt < 0) this.shatter(point); // (versus: the rival shot the revealed bomb first) the plate goes too
    this.boom = true;
    const f = this.parts[0].mesh; f.updateMatrixWorld(true);
    const c = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    T.burst(c, 1);
    this.shatter(point || c, { power: 1.7, max: 60 });
    this.cur.pivot.scale.setScalar(1);
  }
}

// ---------- rules per tier and variant (2026-10-29 rework: FEWER targets and LESS leeway as the tiers rise) ----------
// hold = linger per stop; quick + mix = share of single targets that drop almost at once (hold `quick`, 2 stops, +50);
// live = max up at once (a pattern row may overshoot it, see timeline); gap = s between spawns;
// bomb = bomb roll per single spawn, bombCap = ceiling on the bomb share of ALL spawns (rows included);
// kinds = weights of a single bomb slot [plain, flip bomb, hidden bomb, decoy]; turn = chance a single real target is a
// TURNCOAT (plate -> bomb), tel = its telegraph s; pat = share of spawns that come in pattern rows, patMix = weights of a
// row's mix [all targets, 1-2 decoys, 1 plain bomb]; share = quota share of the real targets; slack = spare shots over
// the quota (COUNT YOUR SHOTS); rel = reload seconds (ignored since build 0.005)
const TIER_P = [
  { time: 42, hold: 1.1,  quick: 0.4,  mix: 0,    swing: 0.62, scoot: 0.27, steps: 4, live: 4, gap: [0.95, 1.6],
    bomb: 0.3,  bombCap: 0.18, kinds: [0.5, 0.18, 0.15, 0.17], turn: 0.06, tel: 0.6,  pat: 0.15, patMix: [0.5, 0.25, 0.25], rel: 0.75, slack: 10, share: 0.52 },
  { time: 38, hold: 0.8,  quick: 0.3,  mix: 0.1,  swing: 0.5,  scoot: 0.2,  steps: 5, live: 4, gap: [1.1, 1.75],
    bomb: 0.44, bombCap: 0.26, kinds: [0.42, 0.2, 0.17, 0.21], turn: 0.1,  tel: 0.5,  pat: 0.22, patMix: [0.4, 0.3, 0.3],   rel: 0.7,  slack: 6,  share: 0.64 },
  { time: 35, hold: 0.62, quick: 0.24, mix: 0.25, swing: 0.4,  scoot: 0.15, steps: 5, live: 3, gap: [1.25, 1.95],
    bomb: 0.6,  bombCap: 0.35, kinds: [0.34, 0.24, 0.18, 0.24], turn: 0.18, tel: 0.42, pat: 0.32, patMix: [0.3, 0.35, 0.35], rel: 0.62, slack: 3,  share: 0.74 },
  { time: 32, hold: 0.5,  quick: 0.2,  mix: 0.3,  swing: 0.32, scoot: 0.12, steps: 5, live: 3, gap: [1.4, 2.2],
    bomb: 0.8,  bombCap: 0.48, kinds: [0.28, 0.26, 0.2, 0.26], turn: 0.3,  tel: 0.36, pat: 0.40, patMix: [0.2, 0.4, 0.4],   rel: 0.55, slack: 1,  share: 0.82 }
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
  c.share = Math.min(0.9, b.share + 0.02 * v);
  c.quota = 8;                                       // placeholder: timeline() derives the real quota
  c.autoReload = false;                              // per-stage option: true = the old automatic reload
  // every trick at EVERY tier (Jon 2026-10-29: no tier gates), just rarer and slower low down (kinds / turn / pat)
  c.flipbomb = true; c.decoy = true; c.hiddenBomb = true; c.turncoat = true; c.patterns = true;
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
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
const COL_N = 5;                                     // a column rides all five floor marks (stops 0..4), whatever the tier
// timeline: every spawn from the seeded rng only. Mix rules (#24, 2026-10-29):
//  - bombs <= bombCap share of all spawns so far (rows included, checked as they are made), never two PLAIN bombs in a
//    row and never three bombs of any kind in a row (a decoy / flip / hidden bomb may follow a bomb),
//  - a single bomb only while bombs up <= real targets up (staying >= 0.6 s): a lone bomb on an empty range is fine
//    (hold fire), two bombs need a real target beside them,
//  - so real targets keep flowing and the quota (a share of the REAL targets) is always reachable.
// A single bomb slot is plain, a flip bomb, a hidden bomb (a real plate with a bomb behind it; scoot / pop only; it
// takes the bomb share and is a bonus, never counted toward the quota) or a decoy, by `kinds`. A single real target may
// be a TURNCOAT (sp.turn: local time it flips to a bomb, sp.tel: the telegraph before it); it counts as a real target.
// PATTERN ROWS (sp.pat = row index, sp.patKind 'V' | 'H', sp.pi = place in the row; all members share t0):
//  - V, a COLUMN: 4-5 scooting paddles in ONE floor lane at successive stops (front = pi 0 at stop N-1, the back one at
//    stop 0), all on the same beat, each drops when it has held at the near stop. sp.aheadD = id distance to the one in
//    front (relative, so practice's id shift keeps it): a member stands tilted back, not shootable, until that one is
//    shot or starts its drop. The front is always a real target.
//  - H, a ROW: 3-5 across ADJACENT free lanes (floor, or the ceiling rail for 'drop'), one motion, one side, one depth,
//    in step.
//  - mix (patMix): all targets / 1-2 decoys / 1 plain bomb (a column never puts them in front).
//  A row starts only when at most live - 2 spawns are up; its members count toward `live` (so the stream waits for the
//  row to thin out) and toward the quota like any spawn. Row share is held near `pat` of all spawns.
// PRACTICE (c.prior): the spawns of the previous chunk that are still running, already shifted to this chunk's local
// time. They hold their lanes and count toward `live`, so a new chunk (or a live tier switch) joins the stream without
// two paddles sharing a lane. They are never returned and never counted for the quota.
function timeline(c, rng) {
  const out = [], floorFree = LANES.map(() => 0), hangFree = LANES.map(() => 0), prior = c.prior || [];
  for (const s of prior) { const arr = s.mo === 'drop' ? hangFree : floorFree; arr[s.lane] = Math.max(arr[s.lane], s.t1 + 0.25 + (s.hidden ? HB_HOLD : 0)); }
  const sd = +((Z_NEAR - Z_FAR) / (c.steps - 1)).toFixed(3), sd5 = +((Z_NEAR - Z_FAR) / (COL_N - 1)).toFixed(3);
  const kinds = c.kinds || [1, 0, 0, 0], patMix = c.patMix || [1, 0, 0];
  const readyAt = +(c.swing * 0.15).toFixed(3);      // shootable once it is swinging / popping into view
  const isPlain = s => !!s && s.bomb && !s.flip && !s.hidden && !s.decoy;
  const trailingBombs = () => { let n = 0; for (let i = out.length - 1; i >= 0 && out[i].bomb; i--) n++; return n; };
  const freeOf = (arr, t) => { const f = []; arr.forEach((e, l) => { if (e <= t) f.push(l); }); return f; };
  const base = (t, mo, lane, side) => ({ id: 0, t0: +t.toFixed(3), t1: 0, mo, lane, side, bomb: false, swing: c.swing,
    hold: c.hold, scoot: c.scoot, steps: mo === 'scoot' ? c.steps : 1, sd, z0: Z_FAR, k: 0, stay: 0, quick: false, readyAt });
  const stationary = (s, k) => { s.k = k; s.z0 = +(Z_FAR + k * sd).toFixed(3); s.stay = +(c.hold * 1.8).toFixed(3); };
  // a pattern row at time t, or null when it does not fit (lanes, clock)
  function pattern(t, vertical, rN, rLane, rSide, rMix) {
    const mem = [];
    let slots;                                       // places a bomb / decoy may take
    if (vertical) {
      const free = freeOf(floorFree, t); if (!free.length) return null;
      const lane = free[Math.floor(rLane * free.length)], side = lane < 2 ? -1 : lane > 2 ? 1 : (rSide < 0.5 ? -1 : 1);
      const N = rN < 0.5 ? 4 : 5;
      for (let j = 0; j < N; j++) {                  // j 0 = the front
        const st = N - 1 - j, s = base(t, 'scoot', lane, side);
        s.k = st; s.z0 = +(Z_FAR + st * sd5).toFixed(3); s.sd = sd5; s.steps = COL_N - st;
        if (j) s.aheadD = 1;
        mem.push(s);
      }
      slots = mem.slice(1);
    } else {
      const mo = pickMotion(rng), arr = mo === 'drop' ? hangFree : floorFree, starts = [];
      for (let l = 0; l + 3 <= LANES.length; l++) { let n = 0; while (l + n < LANES.length && arr[l + n] <= t) n++; if (n >= 3) starts.push([l, n]); }
      if (!starts.length) return null;
      const [l0, room] = starts[Math.floor(rLane * starts.length)], N = Math.min(room, 3 + Math.floor(rN * 3));
      const side = rSide < 0.5 ? -1 : 1, k = rng.int(0, c.steps - 1);
      for (let j = 0; j < N; j++) { const s = base(t, mo, l0 + j, side); if (mo !== 'scoot') stationary(s, k); mem.push(s); }
      slots = mem.slice();
    }
    const end = Math.max(...mem.map(lifeOf));
    if (t + end > c.time - 0.2) return null;
    let m = pickW(patMix, rMix), nb = m === 1 ? (rng() < 0.4 ? 2 : 1) : m === 2 ? 1 : 0;
    if (m === 2 && isPlain(out[out.length - 1])) m = 1;                     // never two plain bombs in a row
    if (nb && bombs + nb > c.bombCap * (out.length + mem.length) + 0.5) { m = 0; nb = 0; }
    for (let i = 0; i < nb; i++) {
      const s = slots.splice(Math.floor(rng() * slots.length), 1)[0];
      s.bomb = true; if (m === 1) s.decoy = true;
    }
    bombs += nb;
    return { mem, end, mix: m, kind: vertical ? 'V' : 'H' };
  }
  let t = 0.4, guard = 0, bombs = 0, rows = 0, rowSpawns = 0;
  while (guard++ < 800) {
    const up = prior.length ? prior.concat(out).filter(s => s.t1 > t) : out.filter(s => s.t1 > t);
    if (up.length >= c.live) { t = up.map(s => s.t1).sort((a, b) => a - b)[up.length - c.live] + 0.05; continue; }
    // ---- a pattern row?
    const pRoll = rng(), pShape = rng(), pN = rng(), pLane = rng(), pSide = rng(), pMix = rng();
    if (c.patterns !== false && (c.pat || 0) > 0 && out.length >= 2 && up.length <= c.live - 2 && pRoll < 0.55
        && rowSpawns + 4.5 <= c.pat * (out.length + 4.5) + 2.5) {
      const row = pattern(t, pShape < 0.5, pN, pLane, pSide, pMix);
      if (row) {
        row.mem.forEach((s, j) => {
          s.id = out.length; s.t1 = +(t + lifeOf(s)).toFixed(3); s.pat = rows; s.patKind = row.kind; s.pi = j; s.patMix = row.mix;
          out.push(s);
          (s.mo === 'drop' ? hangFree : floorFree)[s.lane] = Math.max((s.mo === 'drop' ? hangFree : floorFree)[s.lane], t + lifeOf(s) + 0.25);
        });
        rows++; rowSpawns += row.mem.length;
        t += rng.range(c.gap[0], c.gap[1]) * 1.3;
        continue;
      }
    }
    // ---- a single spawn
    let mo = pickMotion(rng);
    let free = freeOf(mo === 'drop' ? hangFree : floorFree, t);
    if (!free.length) { mo = mo === 'drop' ? 'scoot' : 'drop'; free = freeOf(mo === 'drop' ? hangFree : floorFree, t); }
    if (!free.length) { t = Math.min(...floorFree, ...hangFree) + 0.05; continue; }
    const lane = rng.pick(free), side = lane < 2 ? -1 : lane > 2 ? 1 : (rng() < 0.5 ? -1 : 1);
    const quick = c.mix > 0 && rng() < c.mix;                    // drops almost at once
    const sp = base(t, mo, lane, side);
    sp.id = out.length; sp.quick = quick; sp.hold = quick ? c.quick : c.hold; sp.steps = mo === 'scoot' ? (quick ? 2 : c.steps) : 1;
    if (mo !== 'scoot') { stationary(sp, rng.int(0, c.steps - 1)); if (quick) sp.stay = c.quick; }
    const life = lifeOf(sp);
    if (t + life > c.time - 0.2) break;
    sp.t1 = +(t + life).toFixed(3);
    // bomb roll + the mix rules
    const roll = rng(), typeRoll = rng(), turnRoll = rng();
    const goodUp = up.filter(s => !s.bomb && s.t1 > t + 0.6).length, bombsUp = up.filter(s => s.bomb).length;
    if (out.length > 1 && roll < c.bomb && trailingBombs() < 2 && (bombs + 1) <= c.bombCap * (out.length + 1) && bombsUp <= goodUp) {
      let ty = pickW(kinds, typeRoll);                          // 0 plain, 1 flip, 2 hidden, 3 decoy
      const flipAt = life - LEAVE - 0.4;                        // a flip bomb is a real target for its last ~0.4 s on screen
      if (ty === 1 && !(flipAt > sp.swing + 0.25)) ty = 3;
      if (ty === 2 && !(mo === 'scoot' || mo === 'pop')) ty = flipAt > sp.swing + 0.25 ? 1 : 3;   // #41: a hidden bomb needs a floor plate
      if (ty === 0 && isPlain(out[out.length - 1])) ty = 3;      // never two plain bombs in a row
      sp.bomb = true; bombs++;
      if (ty === 1) sp.flip = +flipAt.toFixed(3); else if (ty === 2) sp.hidden = true; else if (ty === 3) sp.decoy = true;
    } else if (c.turncoat !== false && !quick && turnRoll < (c.turn || 0)) {
      // turncoat: a real plate for the first half of its stay (>= tel + 0.15 s), then the telegraph, then a bomb for >= 0.25 s
      const tel = c.tel || 0.45, end = life - LEAVE, turnAt = sp.swing + Math.max(tel + 0.15, 0.5 * (end - sp.swing));
      if (turnAt + FLIP_T + 0.25 <= end) { sp.turn = +turnAt.toFixed(3); sp.tel = tel; }
    }
    out.push(sp);
    // a hidden bomb can outlive its plate by HB_HOLD (shot at the last moment + the beat + the drop): keep its lane clear
    (mo === 'drop' ? hangFree : floorFree)[lane] = t + life + 0.25 + (sp.hidden ? HB_HOLD : 0);
    t += rng.range(c.gap[0], c.gap[1]);
  }
  // the quota is a share of the REAL targets this seed produced (turncoats count, flip / hidden bombs are a bonus,
  // never counted); a hard ammo cap follows the quota
  const good = out.filter(s => !s.bomb).length;
  c.goodCount = good; c.bombCount = out.length - good; c.rowCount = rows;
  c.quota = Math.max(4, Math.round(good * c.share));
  if (c.ammo && c.ammo.cap != null) c.ammo = { cap: c.quota + c.slack };
  return out;
}

const STEP_PTS = [300, 200, 150, 120, 100];
// step points by the stop it was hit at (a column member counts its real stop), +100 a flipped flip bomb, +50 a quick
// target, +50 a turncoat hit before it turned
function points(sp, lt) { return (STEP_PTS[Math.min(STEP_PTS.length - 1, pose(sp, lt).step)] || 100) + (sp.flip ? 100 : 0) + (sp.quick ? 50 : 0) + (sp.turn ? 50 : 0); }
function briefing(c) {
  // one tip per tier (every trick shows up everywhere now): the tier picks which one the card teaches
  const TIPS = ['FAR AWAY = MORE POINTS', 'BURNT FUSE = BOMB FLIPS: SHOOT IT!', 'SPARKING PLATE = TURNING BOMB!', 'COLUMN? SHOOT THE FRONT ONE FIRST!'];
  const tip = c.ammo && c.ammo.mag ? 'SHOOT THE FRAME (OR R) TO RELOAD!' : c.hiddenBomb && c.variant === 2 ? 'BOMB BEHIND THE PLATE? HOLD FIRE!'
    : TIPS[Math.max(0, Math.min(3, c.tier | 0))];
  return { rule: [['SHOOT ', 'void'], [c.quota + ' TARGETS', 'red'], [' OR MORE!', 'void']], icon: 'bullseye', unit: 'TARGETS',
    dont: c.bomb > 0 ? 'bomb' : null, tip };
}
// PRACTICE (free play, ENGINE.md "Practice"): the variant 0 rules of the tier (hold, scoot, mix, live, bomb share,
// decoys / flip bombs / turncoats / hidden bombs / pattern rows, all tiers) with a 12-round magazine that reloads itself (R / the frame still work)
// and the sound / rack animation still play. window = seconds of schedule per chunk; Run keeps appending chunks.
function practiceConfig(tier) {
  const c = config(tier, 0);
  c.autoReload = true; c.ammo = { mag: 12, reloadTime: c.rel, autoReload: true };
  c.window = 40; c.title = 'SHOOTING RANGE'; c.subtitle = 'PRACTICE';
  return c;
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
  buildEnv, config, practiceConfig, timeline, makeTarget: sp => new Paddle(sp), points, briefing, drawIcon, decor, pose, LANES });
})(window.BLAM);
