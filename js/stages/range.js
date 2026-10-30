'use strict';
/* =========================================================================================
   B.L.A.M. stages/range.js -- Stage 1: THE SHOOTING RANGE.
   Hex plates (BLAM.Props) on carriages swing / pop / drop / slide into five lanes; far = more points.
   DIFFICULTY (DESIGN-STAGES.md section 5, Jon 2026-10-29): hard = PACE, PLACEMENT and DECEPTION, not count.
   The dials per tier (TIER_P): the pop window (how long a plate stays up), aim travel (the next plate is placed far
   from the last one you were made to aim at, alternating side and height), spare shots over the quota, reload-aware
   pacing (after a magazine runs dry the next must-have plate waits or stays up longer), anticipation pauses, and the
   deception rate. Every mechanic at every tier. TRICKS (a director in timeline()): COLUMN (#71, plates hidden
   perfectly behind the front one), ROW on a beat (decoy on the beat / off beat), SNAKE chains, PING-PONG then a bomb,
   WEAVING WALLS, THE WALL (8 at once), BALLOONS (+ the rare Deputy Duck cameo) and LIGHTS OUT (#73, a spotlight event).
   Bombs: plain, decoys (P.decoy, build-up on hit), flip bombs, fair TURNCOATS, hidden bombs.
   Everything that decides a spawn is a pure function of (seed, tier, variant) and the stage clock.
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

// ---------- layout + a pure screen projection (steady camera; the director plans placement in screen px) ----------
const SD = (Z_NEAR - Z_FAR) / 4;                       // five depth stops 0 (far) .. 4 (near)
const LEAVE = 0.35, HANG_Y = 4.3, POP_D = 1.95, SIDE_DX = 2.2;
const FACE_H = B.Props.PIVOT_Y + B.Props.FACE_Y;       // a standing plate's face centre above its carriage
const zOf = k => Z_FAR + k * SD;
const faceYOf = mo => mo === 'drop' ? HANG_Y - FACE_H : FACE_H;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
// world point -> [px, py, game px per world unit] on the 426 x 240 grid
function scr(x, y, z) {
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (R.RH / 2) / (Math.max(0.1, d) * R.TAN_H);
  return [R.RW / 2 + vx * k, R.RH / 2 - yc * k, k];
}
const halfW = z => (CAMP.z - z) * PCS * R.TAN_H * R.ASPECT;   // half the view width (world) at depth z, roughly
const PLATE_R = 0.62;                                  // a plate's circumradius (hex, apothem 0.53)

// ---------- motions (#34) ----------
// every paddle's pose is a pure function of its local time lt (versus-safe) and, for a column member, the extra stay
// `ext` it earned when the plate in front of it was shot. sp.mo:
//   'scoot'   swing up in from the side, SCOOT FORWARD in steps while it holds, drop back (the classic)
//   'drop'    hangs from a ceiling rail: swings DOWN from above, holds, swings back up
//   'pop'     pops UP out of the floor slot, holds, sinks back down
//   'side'    swings in from the side on a vertical hinge (edge-on -> face-on) while sliding in, then drops back
//   'wall'    WEAVING WALLS: a hanger on a rod rack; swings down far, travels down its lane, crosses to the other side
//   'balloon' hangs under a balloon and floats across the range
// Shootable: from readyAt (15 % into the entrance) until 70 % through the exit (sp.lv s, per tier).
function pose(sp, lt, out, ext) {
  const o = out || {}, mo = sp.mo || 'scoot', lv = sp.lv || LEAVE, e = ext || 0;
  o.x = LANES[sp.lane] || 0; o.y = 0; o.gy = null; o.z = sp.z0; o.rx = 0; o.ry = 0; o.rz = 0; o.step = sp.k || 0;
  o.visible = lt >= 0; o.shootable = false; o.done = false;
  if (lt < 0) return o;
  if (mo === 'wall') return poseWall(sp, lt, o, lv);
  if (mo === 'balloon') return poseBalloon(sp, lt, o);
  if (mo !== 'scoot') {
    const sw = sp.swing, stay = sp.stay + e;
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
    if (q < lv) {                                                           // exit
      const p = q / lv, ee = E.inCubic(p);
      if (mo === 'pop') o.y = -POP_D * ee;
      else o.rx = -(Math.PI / 2) * ee;                                      // drop: swings back up; side: falls back
      o.shootable = p < 0.7; return o;
    }
    o.visible = false; o.done = true; return o;
  }
  const k0 = sp.k || 0;
  if (lt < sp.swing) {                                                      // swing up in from the side
    const p = lt / sp.swing;
    o.rz = sp.side * (Math.PI / 2) * (1 - E.outBack(p));
    o.x += sp.side * 1.4 * (1 - E.outCubic(p));
    o.shootable = lt >= sp.readyAt; return o;
  }
  let tau = lt - sp.swing;
  for (let k = 0; k < sp.steps; k++) {
    const hold = sp.hold + (k === sp.steps - 1 ? e : 0);
    if (tau < hold) {                                                       // hold (wobbling after a scoot)
      o.z = sp.z0 + k * sp.sd; o.step = k0 + k; o.shootable = true;
      o.rx = k ? 0.16 * Math.exp(-7 * tau) * Math.sin(20 * tau) : 0;
      if (!k) o.rz = sp.side * -0.1 * Math.exp(-6 * tau) * Math.sin(16 * tau);
      return o;
    }
    tau -= hold;
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
  if (tau < lv) { const p = tau / lv; o.rx = -(Math.PI / 2) * E.inCubic(p); o.shootable = p < 0.7; return o; }
  o.visible = false; o.done = true; return o;
}
// WEAVING WALLS: sp.w = { x0 start x, y face height, z0 far depth, zM weave depth, bz depth bulge while crossing (wall A
// goes back, wall B comes forward, so they pass each other), tin swing-down, td travel down the lane, tc the crossing }
function poseWall(sp, lt, o, lv) {
  const w = sp.w, t1 = w.tin, t2 = t1 + w.td, t3 = t2 + w.tc;
  o.gy = w.y + FACE_H; o.x = w.x0; o.z = w.z0; o.step = 1;
  if (lt < t1) { o.rx = -(Math.PI / 2) * (1 - E.outBack(lt / t1)); o.shootable = lt >= sp.readyAt; return o; }
  if (lt < t2) { const p = (lt - t1) / w.td; o.z = w.z0 + (w.zM - w.z0) * E.inOut(p); o.rz = 0.05 * Math.sin(lt * 7 + w.y); o.shootable = true; return o; }
  if (lt < t3) {
    const p = (lt - t2) / w.tc, e = E.inOut(p);
    o.x = w.x0 * (1 - 2 * e); o.z = w.zM + w.bz * Math.sin(Math.PI * e); o.rz = -0.08 * Math.sign(w.x0) * Math.sin(Math.PI * p);
    o.shootable = true; return o;
  }
  const q = lt - t3; o.x = -w.x0; o.z = w.zM;
  if (q < lv) { o.rx = -(Math.PI / 2) * E.inCubic(q / lv); o.shootable = q / lv < 0.7; return o; }
  o.visible = false; o.done = true; return o;
}
// BALLOON: sp.b = { x0, dx (start x, travel), z, y face height, T crossing time, ph bob phase, se shootable until }
function poseBalloon(sp, lt, o) {
  const b = sp.b;
  o.x = b.x0 + b.dx * (lt / b.T); o.z = b.z; o.gy = b.y + FACE_H + 0.12 * Math.sin(lt * 2.2 + b.ph);
  o.rz = 0.08 * Math.sin(lt * 1.6 + b.ph); o.step = 2;
  o.shootable = lt >= sp.readyAt && lt <= b.se; o.done = lt >= b.T; o.visible = !o.done;
  return o;
}
// total on-screen life of a spawn (t1 - t0, without a column member's reveal extension)
function lifeOf(sp) {
  const mo = sp.mo || 'scoot', lv = sp.lv || LEAVE;
  if (mo === 'wall') return sp.w.tin + sp.w.td + sp.w.tc + lv;
  if (mo === 'balloon') return sp.b.T;
  return mo === 'scoot' ? sp.swing + sp.steps * sp.hold + (sp.steps - 1) * sp.scoot + lv : sp.swing + sp.stay + lv;
}
// shootable seconds (the pop window as the player gets it: entrance from readyAt + hold + 70 % of the exit)
function spanOf(sp) { return sp.mo === 'balloon' ? sp.b.se - sp.readyAt : lifeOf(sp) - sp.readyAt - 0.3 * (sp.lv || LEAVE); }
// the face centre (world) for a pose
function faceAt(sp, P) {
  const mo = sp.mo || 'scoot';
  if (mo === 'drop') return [P.x, HANG_Y - FACE_H, P.z];
  if (P.gy != null) return [P.x, P.gy - FACE_H, P.z];
  return [P.x, P.y + FACE_H, P.z];
}
// FLIP BOMB (#24): a bomb whose fuse burns down; at sp.flip it turns over (FLIP_T s, NOT shootable while it turns) and is
// a real plate for its last moments. TURNCOAT (sp.turn, made fair 2026-10-29): a real plate; at sp.turn - sp.tel the
// TELEGRAPH starts (fuse spark lights and ticks on its top corner, the plate shakes harder and harder, 'bombReveal' then
// 'turnTick' ticks), still a plate you may shoot (+50); at sp.turn it flips over FLIP_T s and is NOT shootable at all
// during the flip (no hit, no bomb); after the flip it is a plain lit bomb.
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
// COLUMN (#71, 2026-10-29 rework): 4-5 plates in ONE slot (same lane, same height, same pose), the ones behind the front
// INVISIBLE (group hidden, not shootable) and tucked 0.05 world units behind each other along the view ray (no z
// fight with the front's folding carriage). When the plate in front is SHOT, the next one is just standing there: it shows
// at once, shootable, and its stay runs on for sp.revW s from that moment (this.ext, pure in the reveal time). If the
// front drops unshot, the whole column drops with it, unseen. No tell: the first reveal is a surprise every time.
const COL_GAP = 0.05;
// balloons + Deputy Duck cameo (bonus target) + the weave rack rods: small voxel meshes built here, shared geometry
const GLOW_T = MAT.glow.clone(); GLOW_T.transparent = true;            // fuse sparks drawn AFTER the lights-out overlay
function glowUp(m) { if (m) { m.material = GLOW_T; m.renderOrder = 1001; } }
const BAL_COLS = [['red', 'coral', 'crimson'], ['cyan', 'ice', 'blue'], ['pink', 'bubblegum', 'magenta'], ['amber', 'lemon', 'rust']];
const GEO = {};
const sharedMesh = (g, m) => { const x = new THREE.Mesh(g, m); x.userData.sharedGeo = true; x.raycast = () => {}; return x; };
function balloonGeo(ci) {
  return GEO['bal' + ci] || (GEO['bal' + ci] = (() => {
    const [c0, c1, c2] = BAL_COLS[ci], list = [];
    for (let i = -6; i <= 6; i++) for (let j = -7; j <= 7; j++) for (let k = -6; k <= 6; k++) {
      const x = i / 6.2, y = j / (j < 0 ? 6.6 : 7.4), z = k / 6.2, rr = x * x + y * y * (1 + 0.25 * Math.max(0, -y)) + z * z;
      if (rr > 1) continue;
      const col = (x < -0.1 && y > 0.25 && z > 0.25 && rr > 0.55) ? c1 : (x > 0.45 || y < -0.6) ? c2 : c0;
      list.push([i, j, k, PAL[col]]);
    }
    list.push([0, -8, 0, PAL[c2]], [-1, -8, 0, PAL[c2]], [1, -8, 0, PAL[c2]], [0, -9, 0, PAL[c2]]);   // the knot
    return new Vox().vox(list, 0.06).geo();
  })());
}
function stringGeo(len) {
  const key = 'str' + len.toFixed(2);
  return GEO[key] || (GEO[key] = new Vox().bx(-0.014, 0, -0.014, 0.014, len, 0.014, PAL.bone).geo());
}
function rodGeo(len) {
  const key = 'rod' + len.toFixed(2);
  return GEO[key] || (GEO[key] = (() => { const v = new Vox(); v.bx(-0.035, 0, -0.035, 0.035, len, 0.035, PAL.steel); v.bx(-0.09, len - 0.06, -0.09, 0.09, len, 0.09, PAL.slate); return v.geo(); })());
}
// DEPUTY DUCK cameo (placeholder voxel duck, duck.js untouched): yellow, orange beak and feet, sheriff hat, a star
const DUCK_S = 0.055;
const DUCK = (() => {
  const M = new Map(), key = (i, j, k) => i + ',' + j + ',' + k, put = (i, j, k, c) => M.set(key(i, j, k), [i, j, k, PAL[c]]);
  for (let i = -5; i <= 5; i++) for (let j = -1; j <= 12; j++) for (let k = -4; k <= 4; k++) {
    const bx = i / 4.6, by = (j - 2.6) / 3.0, bz = k / 3.6, hx = (i - 0.3) / 2.6, hy = (j - 7.3) / 2.6, hz = (k - 0.4) / 2.5;
    if (hx * hx + hy * hy + hz * hz <= 1) put(i, j, k, 'yellow');
    else if (bx * bx + by * by + bz * bz <= 1) put(i, j, k, Math.abs(i) >= 4 && j >= 2 && j <= 4 ? 'amber' : j <= 0 ? 'amber' : 'yellow');
  }
  const front = (i, j) => { for (let k = 6; k >= -6; k--) if (M.has(key(i, j, k))) return k; return null; };
  for (const [i, j] of [[-1, 8], [2, 8]]) { const k = front(i, j); if (k != null) put(i, j, k, 'void'); }
  for (let i = -1; i <= 1; i++) for (const j of [6, 7]) { const k = front(i, j); if (k != null) { put(i, j, k + 1, 'orange'); if (j === 6) put(i, j, k + 2, 'orange'); } }
  { const k = front(-2, 3); if (k != null) { put(-2, 3, k, 'lemon'); put(-2, 4, front(-2, 4), 'lemon'); } }   // the deputy star
  for (let i = -3; i <= 4; i++) for (let k = -2; k <= 3; k++) put(i, 10, k, 'tan');                       // hat brim
  for (let i = -1; i <= 2; i++) for (let k = -1; k <= 2; k++) { put(i, 11, k, 'chestnut'); put(i, 12, k, 'chestnut'); }
  for (const i of [-2, -1, 1, 2]) for (const k of [0, 1, 2]) put(i, -2, k, 'orange');                    // feet
  const list = [...M.values()], ox = -0.5 * DUCK_S, oy = -6 * DUCK_S;
  return { list, ox, oy, geo: new Vox().vox(list, DUCK_S, ox, oy, 0).geo() };
})();
// a prop-shaped wrapper so Paddle can carry the duck like any plate (hangs under a balloon: hang layout)
function duckProp() {
  const group = new THREE.Group(), pivot = new THREE.Group(); pivot.position.y = -B.Props.PIVOT_Y; group.add(pivot);
  const face = new THREE.Mesh(DUCK.geo, MAT.obj); face.userData.sharedGeo = true; face.position.y = -B.Props.FACE_Y + 0.1; pivot.add(face);
  return { kind: 'target', group, pivot, face, duck: true,
    register(t) { t.part(face, DUCK.list, DUCK_S, DUCK.ox, DUCK.oy, 0); return [t.parts[t.parts.length - 1]]; },
    show() { face.visible = true; }, hide() { face.visible = false; }, sparkle() {}, setFuse() {}, setFlip() { return false; }, wobble() {} };
}

class Paddle extends T.Target {
  constructor(sp) {
    super(sp.bomb && !sp.hidden ? 'bomb' : 'target');
    const mo = sp.mo || 'scoot';
    this.sp = sp; this.hang = mo === 'drop' || mo === 'wall' || mo === 'balloon';
    const P = B.Props, o = { hang: this.hang };
    if (sp.decoy) {                                   // decoy variant: a pure function of the spawn id (versus-safe; P.decoy alone would roll Math.random)
      const V = P.DECOY_VARIANTS || ['a'], h = (Math.imul((sp.id | 0) + 1, 2654435761) >>> 0) / 4294967296;
      o.variant = V[Math.min(V.length - 1, Math.floor(h * V.length))];
    }
    this.prop = sp.duck ? duckProp() : sp.flip || sp.turn ? P.flipbomb(o) : sp.decoy ? P.decoy(o) : sp.bomb && !sp.hidden ? P.bomb(o) : P.paddle(o);
    this.pivot = this.prop.pivot; this.disc = this.prop.face; this.disc2 = this.prop.face2 || null;
    this.group.add(this.prop.group);
    const pp = this.prop.register(this); this.pBomb = pp[0]; this.pGood = pp[1] || null;
    this.cur = this.prop; this.revealLt = -1; this.boom = false; this.armLt = -1; this.ext = 0; this.colRev = false;
    glowUp(this.prop.spark);
    if (sp.hidden) {                                  // the bomb behind: built now, out of sight, NOT a hit part yet
      this.hb = P.bomb(o); this.hb.group.visible = false; this.group.add(this.hb.group); glowUp(this.hb.spark);
      this.pHidden = this.hb.register(this)[0]; this.parts.pop();
    }
    if (sp.turn) {                                    // a turncoat starts plate side up, with a spare fuse spark for the tell
      this.prop.setFlip(1); this.parts[0] = this.pGood;
      if (this.prop.spark && this.prop.face2) {
        this.tick = this.prop.spark.clone(); this.tick.raycast = () => {}; this.tick.visible = false;
        this.tick.position.set(0.33, 0.56, 0.05); this.prop.face2.add(this.tick);
      }
    }
    if (mo === 'balloon') {                           // a balloon on a string instead of the hanger
      if (this.prop.base) this.prop.base.visible = false;
      if (this.prop.arm) this.prop.arm.visible = false;
      const top = sp.duck ? -B.Props.FACE_Y + 0.1 + 6.6 * DUCK_S : -B.Props.FACE_Y + 0.5;
      const st = sharedMesh(stringGeo(0.25 - top), MAT.obj); st.position.y = top; this.prop.pivot.add(st);
      this.bal = sharedMesh(balloonGeo((sp.b && sp.b.ci) | 0), MAT.obj); this.bal.position.y = 0.25 + 9 * 0.06; this.prop.pivot.add(this.bal);
    }
    if (mo === 'wall' && sp.w) {                      // a rod from the hanger clamp up into the ceiling
      const len = 5.05 - (sp.w.y + FACE_H);
      if (len > 0.05) this.group.add(sharedMesh(rodGeo(len), MAT.obj));
    }
    this.step = mo === 'scoot' ? (sp.k || 0) : 0;
    this.lastLt = 0; this.deadLt = -1; this.P = {}; this.announced = false;
  }
  // the hanger is built hanging (not a flipped floor paddle): mirror the pivot's x / y turns
  turn(rx, ry, rz) { const m = this.hang ? -1 : 1; this.cur.pivot.rotation.set(m * rx, m * ry, rz); }
  // the carriage (post + base) leaves WITH the paddle: it sinks out of sight (hangers: up into the ceiling)
  sink(k) { this.group.position.y += (this.hang ? 1.2 : -0.5) * E.inCubic(Math.max(0, Math.min(1, k))); }
  place(P) {
    this.group.position.set(P.x, P.gy != null ? P.gy : this.hang ? HANG_Y : P.y, P.z);
    if (this.sp.col) {                                // a column member: tucked behind along the view ray
      const g = this.group.position, dx = g.x - CAMP.x, dy = g.y + FACE_H - CAMP.y, dz = g.z - CAMP.z, l = Math.hypot(dx, dy, dz) || 1, s = COL_GAP * this.sp.col / l;
      g.x += dx * s; g.y += dy * s; g.z += dz * s;
    }
  }
  update(lt, run) {
    if (this.revealLt >= 0) return this.updateReveal(lt);
    if (this.armLt >= 0 && this.alive) return this.updateArm(lt);
    const sp = this.sp, pr = this.prop;
    if (sp.aheadD && this.alive && !this.colRev) {   // a column member: hidden while the one in front stands
      const fid = sp.id - sp.aheadD, f = run && run.byId ? run.byId(fid) : null;
      this.lastLt = lt; this.group.visible = false; this.shootable = false;
      if (f && f.alive) { this.ext = f.ext || 0; return false; }
      if (!f && !(run && run.taken && run.taken.has(fid))) return true;   // it dropped unshot: so do we, unseen
      this.colRev = true;                             // it was shot: I am just standing there now
      this.ext = Math.max(f ? f.ext || 0 : this.ext, lt + (sp.revW || 0.6) - (lifeOf(sp) - (sp.lv || LEAVE)));
    }
    const P = pose(sp, lt, this.P, this.ext); this.lastLt = lt;
    this.place(P);
    if (!this.alive) {                                                      // shot: the post folds down behind
      if (this.deadLt < 0) this.deadLt = lt;
      if (this.bal) {                                                       // a balloon payload: the balloon floats off
        const p = Math.min(1, (lt - this.deadLt) / 0.9);
        this.group.visible = true; pr.hide(); this.group.position.y += 2.4 * p * p;
        return p >= 1 || P.done;
      }
      const p = Math.min(1, (lt - this.deadLt) / 0.4);
      this.group.visible = true; pr.hide(); if (this.fb) this.fb.hide(); this.sink((p - 0.55) / 0.45);
      this.turn(-(Math.PI / 2) * E.inCubic(p), P.ry, P.rz);
      return p >= 1 || P.done;
    }
    this.group.visible = P.visible;
    if (!P.shootable && lt > sp.swing && !this.bal) this.sink((lt - (lifeOf(sp) + this.ext - 0.1)) / 0.1);
    this.turn(P.rx, P.ry, P.rz);
    this.shootable = P.shootable;
    let fuse = 1;
    if (sp.flip) {                                                          // flip bomb: kind is a pure function of lt
      const f = lt - sp.flip, flipped = pr.setFlip(f < 0 ? 0 : f >= FLIP_T ? 1 : f / FLIP_T);
      this.kind = flipped ? 'target' : 'bomb';
      this.parts[0] = flipped ? this.pGood : this.pBomb;
      if (f >= 0 && f < FLIP_T) this.shootable = false;                    // mid-flip: nothing to hit
      fuse = Math.max(0, Math.min(1, 1 - lt / sp.flip));
      pr.setFuse(0.12 + 0.88 * fuse);
    }
    if (sp.turn) this.updateTurn(lt);
    if (sp.decoy) pr.wobble(lt);                                            // the tell: a painted bomb can't keep still
    if (P.step !== this.step) { this.step = P.step; if ((sp.mo || 'scoot') === 'scoot') B.SFX.play('targetStep', { step: this.step }); }
    if (!this.announced && P.visible) {
      this.announced = true; const u = R.toPx(this.group.position)[0] / R.RW;
      B.SFX.play('targetIn', { u }); if (sp.duck) B.SFX.play('duckCameo', { u });
    }
    if (this.kind === 'bomb') pr.sparkle(lt, fuse < 0.35 || !!sp.turn);
    return P.done;
  }
  // turncoat: telegraph (shake + fuse tick + sound), then the flip (not shootable), then a plain bomb; all from lt
  updateTurn(lt) {
    const sp = this.sp, pr = this.prop, f = lt - sp.turn, g = f < 0 ? 0 : f >= FLIP_T ? 1 : f / FLIP_T;
    pr.setFlip(1 - g);
    const plate = f < 0;
    this.kind = plate ? 'target' : 'bomb'; this.parts[0] = g < 0.5 ? this.pGood : this.pBomb;
    if (f >= 0 && f < FLIP_T) this.shootable = false;                      // the flip itself: no hit, no bomb
    const w = lt - (sp.turn - sp.tel), a = Math.max(0, Math.min(1, w / sp.tel));
    if (pr.face2) pr.face2.rotation.z = plate && w >= 0 ? (0.06 + 0.13 * a) * Math.sin(w * (16 + 20 * a)) : 0;
    if (pr.face2) pr.face2.position.x = plate && w >= 0 ? 0.025 * a * Math.sin(w * 41) : 0;
    if (this.tick) {
      const on = plate && w >= 0 && (a > 0.7 || ((w * (8 + 22 * a)) | 0) % 2 === 0);
      this.tick.visible = on; if (on) this.tick.scale.setScalar(1.1 + 0.9 * a);
    }
    if (plate && w >= 0 && this.shootable) {
      const n = Math.min(2, Math.floor(a * 3)), u = R.toPx(this.group.position)[0] / R.RW;
      if (!this.telAnn) {                                                   // the fuse catches: spit + the fuse sound
        this.telAnn = true; this.telN = 0;
        if (this.tick) { this.group.updateMatrixWorld(true); T.sparks(new THREE.Vector3().setFromMatrixPosition(this.tick.matrixWorld), 5, ['lemon', 'yellow', 'orange'], 1.1, 0.03); }
        B.SFX.play('bombReveal', { u }); B.SFX.play('turnTick', { u, n: 0 });
      } else if (n > this.telN) { this.telN = n; B.SFX.play('turnTick', { u, n }); }
    }
    if (!plate) pr.setFuse(0.45);
  }
  // decoy build-up: frozen where it was hit, the disguise falls away, the bare bomb swells with a flaring fuse
  updateArm(lt) {
    const sp = this.sp, q = lt - this.armLt, P = pose(sp, this.armLt, this.P, this.ext), k = Math.min(1, q / DECOY_UNMASK);
    this.lastLt = lt; this.shootable = false; this.group.visible = true;
    this.place(P);
    if (this.prop.unmask) this.prop.unmask(E.outCubic(k));
    else if (!this.fb) {                                                    // no unmask(): swap a plain bomb in
      this.fb = B.Props.bomb({ hang: this.hang }); this.group.add(this.fb.group); glowUp(this.fb.spark);
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
    if (this.sp.duck) B.SFX.play('duckCameoHit', { u: R.toPx(this.group.position)[0] / R.RW });
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

// ---------- LIGHTS OUT (#73): the room goes dark, a spotlight shows the plates ----------
// Drawn with ONE camera-space quad at 1.55 units (in front of the range, behind the gun at 1.0 and the mini duck at 1.4)
// that MULTIPLIES what is behind it: dark (uDark) everywhere, a hard-edged disc of light (1.0, a 1.5 px rim) round the
// spot and a dimmer beam (0.5) from the ceiling down to it. Custom blending keeps the destination alpha (the post pass's
// dither class), the quad never writes depth, the HUD is composited later so it stays bright, and fuse sparks (GLOW_T,
// renderOrder 1001) draw after it so bombs still spark in the dark. No renderer change: the quad is a camera child.
// The event itself is a timeline spawn (sp.fx 'lights', makeTarget -> LightsFx, no hit parts, kind 'fx'); its pops are
// ordinary spawns. The spot's path is a pure function of the event's schedule + the hits on its pops (run.taken,
// shared in versus), so only the spotlight, never a spawn, depends on what happens.
let LO = null;
function lightsOverlay() {
  if (LO) return LO;
  const D = 1.55, h = 2 * D * R.TAN_H, w = h * R.ASPECT;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uS: { value: 0 }, uR: { value: 12 }, uDark: { value: 0.3 }, uC: { value: new THREE.Vector2(-99, -99) }, uT: { value: new THREE.Vector2(-99, -199) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uOn; uniform float uS; uniform float uR; uniform float uDark; uniform vec2 uC; uniform vec2 uT; varying vec2 vUv;
      void main(){
        vec2 p = floor(vec2(vUv.x * ${R.RW}.0, (1.0 - vUv.y) * ${R.RH}.0)) + 0.5;
        float d = length(p - uC), lit = d < uR ? 1.0 : (d < uR + 1.5 ? 0.7 : 0.0);
        vec2 ax = uC - uT; float L2 = max(dot(ax, ax), 1.0), s = dot(p - uT, ax) / L2;
        float pd = length(p - (uT + ax * clamp(s, 0.0, 1.0))), bw = mix(uR * 0.22, uR * 0.85, clamp(s, 0.0, 1.0));
        float beam = (s > 0.0 && s < 1.0 && pd < bw) ? 0.56 : 0.0;
        float m = mix(uDark, 1.0, max(lit, beam) * uS);
        gl_FragColor = vec4(vec3(mix(1.0, m, uOn)), 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(0, 0, -D); m.renderOrder = 1000; m.frustumCulled = false; m.visible = false;
  R.camera.add(m);
  LO = { mesh: m, u: mat.uniforms, stamp: 0 };
  m.onBeforeRender = () => { if (performance.now() - LO.stamp > 300) { LO.u.uOn.value = 0; m.visible = false; } };   // a run that went away
  return LO;
}
const _lv = new THREE.Vector3();
class LightsFx extends T.Target {
  constructor(sp) { super('fx'); this.sp = sp; this.hits = sp.pops.map(() => -1); this.said = 0; this.lo = lightsOverlay(); }
  // where the light is and whether it is on, at local time lt (pure in lt + the hit times seen so far)
  spot(lt) {
    const S = this.sp, pops = S.pops, n = pops.length, A = [], Rl = [];
    for (let i = 0; i < n; i++) {
      const p = pops[i], hit = this.hits[i] >= 0 && this.hits[i] < p.end;
      Rl.push(hit ? this.hits[i] : p.end);
      let a = p.arr === 'empty' ? p.at - p.lead : p.at - 0.08;
      if (i) {
        const q = pops[i - 1], hq = this.hits[i - 1] >= 0 && this.hits[i - 1] < q.end;
        if (hq && q.aft === 'next') a = Math.min(a, Rl[i - 1] + 0.05);
        else if (hq && q.aft === 'stay') a = Math.max(a, p.at + 0.3);
        else if (hq && q.aft === 'away') a = Math.max(a, p.at + 0.45);
        else if (!hq) a = Math.max(a, q.at + q.up + (S.minLit || 0.5));   // an unshot plate keeps the light a while
        a = Math.max(a, A[i - 1] + 0.1);
      }
      A.push(a);
    }
    let k = -1; for (let i = 0; i < n; i++) if (A[i] <= lt) k = i;
    if (k < 0) return null;
    const p = pops[k], dt = lt - A[k], hitK = this.hits[k] >= 0 && this.hits[k] < p.end;
    let from = null;
    if (k) { const q = pops[k - 1], hq = this.hits[k - 1] >= 0 && this.hits[k - 1] < q.end; from = hq && q.aft === 'away' && A[k] > Rl[k - 1] ? q.aw : q.pos; }
    let pos = p.pos, on = 1;
    if (p.arr === 'snap' || !from) on = dt < 0.14 ? 0 : 1;
    else { const e = E.inOut(Math.min(1, dt / 0.22)); pos = [from[0] + (p.pos[0] - from[0]) * e, from[1] + (p.pos[1] - from[1]) * e, from[2] + (p.pos[2] - from[2]) * e]; }
    if (p.cut >= 0 && lt >= p.cut && !(hitK && lt >= Rl[k])) on = 0;   // the light cuts: the plate stands in the dark
    if (hitK && p.aft === 'away' && lt >= Rl[k]) {                     // after the hit it wanders off to an empty spot
      const e = E.inOut(Math.min(1, (lt - Rl[k]) / 0.25)); pos = [p.pos[0] + (p.aw[0] - p.pos[0]) * e, p.pos[1] + (p.aw[1] - p.pos[1]) * e, p.pos[2] + (p.aw[2] - p.pos[2]) * e]; on = 1;
    }
    return { pos, on };
  }
  update(lt, run) {
    const S = this.sp, L = this.lo;
    if ((run && run.state === 'end') || lt >= S.dur + 0.32) { L.u.uOn.value = 0; L.mesh.visible = false; return true; }
    if (run && run.taken) S.pops.forEach((p, i) => { if (this.hits[i] < 0 && run.taken.has(S.id + p.d)) this.hits[i] = lt; });
    const amt = lt < 0.16 ? lt / 0.16 : lt > S.dur ? Math.max(0, 1 - (lt - S.dur) / 0.3) : 1;
    if (!this.said && lt >= 0) { this.said = 1; B.SFX.play('lightsOut'); }
    if (this.said === 1 && lt >= S.dur) { this.said = 2; B.SFX.play('lightsOn'); }
    const sp = lt <= S.dur ? this.spot(lt) : null;
    L.stamp = performance.now(); L.mesh.visible = true; L.u.uOn.value = amt; L.u.uDark.value = S.dark || 0.3;
    if (sp && sp.on) {
      const P = sp.pos, k = scr(P[0], P[1], P[2])[2];
      _lv.set(P[0], P[1], P[2]).project(R.camera);
      L.u.uC.value.set((_lv.x + 1) / 2 * R.RW, (1 - _lv.y) / 2 * R.RH);
      _lv.set(P[0], 4.75, P[2]).project(R.camera);
      L.u.uT.value.set((_lv.x + 1) / 2 * R.RW, (1 - _lv.y) / 2 * R.RH);
      L.u.uR.value = Math.max(6, 0.92 * k); L.u.uS.value = 1;
    } else L.u.uS.value = 0;
    return false;
  }
  dispose() { super.dispose(); if (LO) { LO.u.uOn.value = 0; LO.mesh.visible = false; } }
}

// ---------- the dials per tier (DESIGN-STAGES.md section 5; variant 0, see config() for the variant shifts) ----------
// time s | win = POP WINDOW: s a plate holds fully up (scoot: across its stops; + entrance / exit, see spanOf) |
// swing / lv = entrance / exit s (pop up and down fast at the top) | steps / scoot = scoot stops and s per scoot |
// live = max plates up at once (singles) | gap = s between singles, burst = chance of a burst of 2-3, bgap = s inside a
// burst, pause = anticipation pause after a burst or a trick | hop = AIM TRAVEL: wanted distance from the last plate you
// were made to aim at (share of the screen diagonal), alt = weight on alternating side and height, adj = keep-off
// radius round the plates already up | decep = chance a single is a bomb, kinds = its kind [plain, flip, hidden, decoy],
// bombCap = ceiling on the bomb share, turn / tel = turncoat chance / telegraph s | trick = chance a beat is a trick,
// beat (row), snake, pp (ping-pong) = s between pops, wall8 = THE WALL's stay, weave = weaving-wall speed, ball =
// balloon crossing s, col4 = chance a later column hides a decoy 4th, lights = [chance of one LIGHTS OUT, chance of a
// second], loWin = a pop's stay under the light | spare = SPARE SHOTS over the quota (cap variant) | share = quota share
// of the real targets | rel = the reload the pacing allows for (s; the reload itself is instant since 0.005, this is the
// player's reach for it)
const TIER_P = [
  { time: 45, win: 1.3,  swing: 0.5,  lv: 0.32, steps: 2, scoot: 0.2,  live: 4, gap: [0.5, 0.95], burst: 0.25, bgap: [0.3, 0.45], pause: [0.6, 1.0],
    hop: [0.08, 0.26], alt: 0.25, adj: 0.12, decep: 0.13, kinds: [0.42, 0.2, 0.16, 0.22], bombCap: 0.2, turn: 0.05, tel: 0.4,
    trick: 0.24, beat: 0.62, snake: 0.7, pp: 0.75, wall8: 1.7, weave: 1.0, ball: 4.4, col4: 0.45, lights: [0.25, 0], loWin: 1.4,
    spare: 8, share: 0.55, rel: 0.75 },
  { time: 40, win: 1.0,  swing: 0.4,  lv: 0.28, steps: 2, scoot: 0.17, live: 3, gap: [0.55, 0.95], burst: 0.28, bgap: [0.28, 0.4], pause: [0.75, 1.2],
    hop: [0.22, 0.42], alt: 0.45, adj: 0.15, decep: 0.19, kinds: [0.36, 0.22, 0.18, 0.24], bombCap: 0.27, turn: 0.08, tel: 0.35,
    trick: 0.3, beat: 0.5, snake: 0.55, pp: 0.6, wall8: 1.35, weave: 1.2, ball: 3.8, col4: 0.55, lights: [0.5, 0], loWin: 1.1,
    spare: 5, share: 0.6, rel: 0.7 },
  { time: 36, win: 0.7,  swing: 0.3,  lv: 0.24, steps: 2, scoot: 0.13, live: 3, gap: [0.5, 0.9], burst: 0.32, bgap: [0.25, 0.35], pause: [0.9, 1.4],
    hop: [0.38, 0.6], alt: 0.65, adj: 0.17, decep: 0.25, kinds: [0.3, 0.24, 0.2, 0.26], bombCap: 0.33, turn: 0.11, tel: 0.3,
    trick: 0.35, beat: 0.4, snake: 0.42, pp: 0.48, wall8: 1.05, weave: 1.45, ball: 3.2, col4: 0.65, lights: [0.85, 0.35], loWin: 0.85,
    spare: 3, share: 0.64, rel: 0.62 },
  { time: 32, win: 0.45, swing: 0.22, lv: 0.2,  steps: 2, scoot: 0.1,  live: 2, gap: [0.45, 0.8], burst: 0.35, bgap: [0.22, 0.3], pause: [1.0, 1.5],
    hop: [0.52, 0.85], alt: 0.85, adj: 0.2, decep: 0.31, kinds: [0.26, 0.26, 0.2, 0.28], bombCap: 0.38, turn: 0.15, tel: 0.25,
    trick: 0.4, beat: 0.32, snake: 0.34, pp: 0.4, wall8: 0.85, weave: 1.7, ball: 2.6, col4: 0.75, lights: [1, 0.6], loWin: 0.65,
    spare: 2, share: 0.68, rel: 0.55 }
];
// motion mix for singles (#34): swing-ins from the side (side + the scoot's swing-up) stay a good half of it
const MOTIONS = [['scoot', 0.28], ['side', 0.26], ['drop', 0.23], ['pop', 0.23]];
const VARIANT_NAMES = ['FREE FIRE', 'RELOAD DRILL', 'COUNT YOUR SHOTS', 'FINAL ROUND'];
function config(tier, v) {
  const b = TIER_P[Math.max(0, Math.min(3, tier | 0))]; v = Math.max(0, Math.min(3, v | 0));
  const c = Object.assign({}, b);
  c.win = +(b.win * (1 - 0.05 * v)).toFixed(3); c.scoot = +(b.scoot * (1 - 0.05 * v)).toFixed(3);
  c.live = b.live + (v >= 3 ? 1 : 0);
  c.decep = +(b.decep + 0.02 * v).toFixed(3); c.trick = +(b.trick + 0.02 * v).toFixed(3);
  c.share = Math.min(0.9, b.share + 0.02 * v);
  c.slack = c.spare;                                 // (old name)
  c.quota = 8;                                       // placeholder: timeline() derives the real quota
  c.autoReload = false;                              // per-stage option: true = the old automatic reload
  // every mechanic at EVERY tier (Jon 2026-10-29: no tier gates), rarer / slower low down
  c.flipbomb = true; c.decoy = true; c.hiddenBomb = true; c.turncoat = true; c.patterns = true;
  c.ammo = [
    'unlimited',
    { mag: 8, reloadTime: b.rel, autoReload: c.autoReload },
    { cap: 0 },                                      // = quota + spare, set by timeline() (estimate below for menus)
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
const isReq = s => !s.fx && (!s.bomb || !!s.hidden);                    // a plate the player has to spend a shot on
const isReal = s => !s.fx && !s.bomb && !s.duck;                        // counts toward the quota's base

// ---------- timeline: the DIRECTOR. Every spawn from the seeded rng only. ----------
// The stream is a run of BEATS: a single, a BURST of 2-3 singles in quick succession, or a TRICK, with an anticipation
// pause after a burst or a trick and LIGHTS OUT events at seeded times. Rules:
//  - AIM TRAVEL: a single takes the free slot (motion, lane, depth stop) whose screen point lies closest to the wanted
//    hop (c.hop x the screen diagonal) from the last plate the player was made to aim at, preferring the other side and
//    the other height (c.alt), never near a plate already up (c.adj); a plate never overlaps another on screen.
//  - FAIR BOMBS: bombs <= bombCap share; never two PLAIN bombs in a row, never three bombs in a row; a bomb only while
//    bombs up <= real plates up. Bombs are placed by the same aim rule (they sit where your next target should be).
//  - RELOAD-AWARE (magazine variants): the director counts the shots a perfect player spends; the plate after a full
//    magazine waits c.rel s past the last shot and stays up >= c.rel + 0.45 s (a column member gets the longer reveal,
//    a sequenced trick shifts its later pops back); a LIGHTS OUT starts only with >= 5 rounds left in the magazine.
//  - TRICKS take the range to themselves (they start when it is empty; a column only until its front's drop, its
//    hidden members keep their lane). Lights out never in the first 6 s, never back to back.
// Spawn fields: id, t0, t1, mo, lane, side, k (depth stop), z0, sd, steps, hold, scoot, stay, swing, lv, readyAt;
// bomb (+ flip / hidden / decoy), turn + tel, duck; pat (trick index), patKind 'C' column | 'R' row | 'S' snake |
// 'P' ping-pong | 'W' weave | 'X' the wall | 'B' balloons | 'L' lights pop, pi (place in it), trick (its sub-kind);
// column: aheadD (id distance to the one in front, relative so practice's id shift keeps it), col (place behind),
// revW; lights: lo (event index); the event spawn: fx 'lights', dur, dark, pops [{ d (id delta), at, end, pos, arr,
// lead, cut, aft, aw }].
// PRACTICE (c.prior): the still-running spawns of the previous chunk, already in this chunk's local time; they hold
// their lanes and their screen spots, never returned, never counted.
function timeline(c, rng) {
  const out = [], occ = [], prior = c.prior || [], TIME = c.time, tier = c.tier | 0;
  rng(); rng(); rng();                               // (mulberry32's first draws barely mix nearby seeds)
  const DIAG = Math.hypot(R.RW, R.RH), CX = R.RW / 2, HY = scr(0, 2.15, zOf(2))[1];
  const magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0;
  const readyAt = +(c.swing * 0.15).toFixed(3), kinds = c.kinds || [1, 0, 0, 0];
  let bombs = 0, req = 0, lastShot = -9, lastAim = null, xUntil = 0, nTrick = 0, lastTrick = '', nLights = 0;
  const count = {}, used = k => count[k] || 0;
  const magLeft = () => magN ? magN - (req % magN || (req ? magN : 0)) : Infinity;
  const boundary = g => magN && g > 0 && g % magN === 0;
  // ---- occupancy: who stands where on screen, when
  const ptsOf = sp => {
    const mo = sp.mo || 'scoot', y = faceYOf(mo), L = LANES[sp.lane], n = mo === 'scoot' ? sp.steps : 1, P = [];
    for (let i = 0; i < n; i++) { const s = scr(L, y, sp.z0 + i * sp.sd); s[2] = PLATE_R * s[2]; P.push(s); }
    return P;
  };
  const occOf = (sp, a, b, ghost) => ({ a, b, layer: sp.mo === 'drop' ? 'h' : 'f', lane: sp.lane, pts: ptsOf(sp), bomb: !!sp.bomb && !sp.hidden, ghost: !!ghost });
  for (const s of prior) {
    if (s.fx || s.mo === 'wall' || s.mo === 'balloon') { xUntil = Math.max(xUntil, s.t1 + 0.2); continue; }
    occ.push(occOf(s, s.t0, s.t1 + (s.hidden ? HB_HOLD : 0), !!s.aheadD));
  }
  const upAt = t => occ.filter(o => !o.ghost && o.a <= t && o.b > t);
  const clearAt = t => { let e = Math.max(t, xUntil); for (const o of occ) if (o.b > t && !o.ghost) e = Math.max(e, o.b + 0.2); return e; };
  const laneBusy = (layer, lane, a, b) => occ.some(o => o.layer === layer && o.lane === lane && o.a < b + 0.15 && o.b + 0.15 > a);
  const overlap = (pts, a, b) => occ.some(o => o.a < b && o.b > a && o.pts.some(q => pts.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < p[2] + q[2] + 1.5)));
  // ---- a spawn record (no rng)
  function mk(t, mo, lane, k, o) {
    const steps = mo === 'scoot' && !o.stat ? c.steps : 1, stay = o.stay != null ? o.stay : c.win;
    const sp = { id: 0, t0: +t.toFixed(3), t1: 0, mo, lane, side: o.fside || (lane < 2 ? -1 : lane > 2 ? 1 : (o.side || 1)), bomb: false, swing: c.swing, lv: c.lv,
      readyAt, k, z0: +zOf(k).toFixed(3), sd: +SD.toFixed(3), steps, hold: 0, scoot: c.scoot, stay: 0 };
    if (mo === 'scoot') sp.hold = +(steps > 1 ? Math.max(0.12, (stay - (steps - 1) * c.scoot) / steps) : stay).toFixed(3);
    else sp.stay = +stay.toFixed(3);
    return sp;
  }
  // ---- the aim rule: best free slot for motion mo at time t (null: none)
  function slot(t, mo, o) {
    const steps = mo === 'scoot' && !o.stat ? c.steps : 1, kmax = 4 - (steps - 1), D = o.D, cands = [];
    for (let lane = 0; lane < 5; lane++) for (let k = o.kmin || 0; k <= Math.min(kmax, o.kmax != null ? o.kmax : 4); k++) {
      const sp = mk(t, mo, lane, k, o), a = t, b = t + lifeOf(sp) + (o.hidden ? HB_HOLD : 0);
      if (b > (o.until || TIME - 0.2)) continue;
      const layer = mo === 'drop' ? 'h' : 'f';
      if (laneBusy(layer, lane, a, b)) continue;
      const pts = ptsOf(sp); if (overlap(pts, a, b)) continue;
      const p = pts[0]; let s = 0;
      if (lastAim) {
        s = Math.abs(Math.hypot(p[0] - lastAim[0], p[1] - lastAim[1]) - D) / DIAG;
        if ((p[0] < CX) === (lastAim[0] < CX)) s += 0.35 * c.alt;
        if ((p[1] < HY) === (lastAim[1] < HY)) s += 0.2 * c.alt;
      }
      for (const q of occ) if (!q.ghost && q.a <= t + 0.3 && q.b > t) for (const r of q.pts) if (Math.hypot(p[0] - r[0], p[1] - r[1]) < c.adj * DIAG + r[2]) s += 2;
      cands.push([s, sp, pts, a, b]);
    }
    if (!cands.length) return null;
    for (const cd of cands) cd[0] += rng() * 0.1;
    cands.sort((x, y) => x[0] - y[0]);
    return cands[0];
  }
  function commit(sp, pts, a, b, ghost) {
    out.push(sp); occ.push({ a, b, layer: sp.mo === 'drop' ? 'h' : 'f', lane: sp.lane, pts, bomb: !!sp.bomb && !sp.hidden, ghost: !!ghost });
    if (sp.bomb) bombs++;
  }
  const aimed = (sp, pts) => { req++; lastAim = (pts || ptsOf(sp))[0]; lastShot = sp.t0 + sp.readyAt + 0.3; };
  const trailing = () => { let n = 0; for (let i = out.length - 1; i >= 0 && out[i].bomb && !out[i].hidden; i--) n++; return n; };
  const lastPlain = () => { const s = out[out.length - 1]; return !!s && s.bomb && !s.flip && !s.hidden && !s.decoy; };
  // ---- one single at t (bomb roll + mix rules, turncoats, the reload rule); returns the end time or -1
  function single(t) {
    const roll = rng(), tyR = rng(), turnR = rng(), sideR = rng();
    const up = upAt(t), goodUp = up.filter(o => !o.bomb && o.b > t + 0.6).length, bombsUp = up.filter(o => o.bomb).length;
    let kind = null, turn = false;
    if (out.length > 1 && roll < c.decep && trailing() < 2 && bombs + 1 <= c.bombCap * (out.length + 1) + 0.5 && bombsUp <= goodUp) {
      let ty = pickW(kinds, tyR); if (ty === 0 && lastPlain()) ty = 3;
      kind = ['plain', 'flip', 'hidden', 'decoy'][ty];
    } else if (turnR < (c.turn || 0)) turn = true;
    const o = { D: rng.range(c.hop[0], c.hop[1]) * DIAG, side: sideR < 0.5 ? -1 : 1 };
    const willReq = !kind || kind === 'hidden';
    if (willReq && boundary(req)) {                  // a full magazine went: wait for the reload, then stay up long enough
      t = Math.max(t, lastShot + c.rel);
      o.stat = true; o.stay = Math.max(c.win, c.rel + 0.45 - 0.85 * c.swing - 0.7 * c.lv);
    }
    let bombPhase = 0;
    if (kind === 'flip') { bombPhase = Math.max(0.5, c.win * 0.6); o.stat = true; o.stay = bombPhase + FLIP_T + Math.max(0.45, c.win * 0.8); }
    if (turn) { o.stat = true; o.tp = Math.max(0.3, c.win * 0.75); o.stay = o.tp + c.tel + FLIP_T + 0.35; }
    if (kind === 'hidden') o.hidden = true;
    const first = pickMotion(rng), order = [first].concat(MOTIONS.map(m => m[0]).filter(m => m !== first));
    let cd = null;
    for (const mo of order) { if (kind === 'hidden' && !(mo === 'scoot' || mo === 'pop')) continue; if ((cd = slot(t, mo, o))) break; }
    if (!cd) return -1;
    const sp = cd[1];
    if (kind) { sp.bomb = true; if (kind === 'flip') sp.flip = +(sp.swing + bombPhase).toFixed(3); else if (kind === 'hidden') sp.hidden = true; else if (kind === 'decoy') sp.decoy = true; }
    if (turn) { sp.turn = +(sp.swing + o.tp + c.tel).toFixed(3); sp.tel = c.tel; }
    sp.t1 = +(sp.t0 + lifeOf(sp)).toFixed(3);
    commit(sp, cd[2], cd[3], cd[4]);
    if (willReq) aimed(sp, cd[2]);
    count.single = used('single') + 1; if (sp.mo === 'side' || sp.mo === 'scoot') count.swingIn = used('swingIn') + 1;
    return sp.t1;
  }
  // ---- TRICKS. Each builds its members (t0 / timing), then finish() runs the reload rule, commits them and books the range.
  //   mode 'seq': pops in time order (a magazine boundary shifts that pop and every later one back by rel + 0.1)
  //   mode 'col': a column (the boundary member gets a reveal window >= rel + 0.45)
  //   mode 'sim': all up together (a boundary inside: every member stays rel longer)
  function finish(mem, mode, kind, sub, hold) {
    const reqM = mem.filter(isReq);
    if (magN) {
      if (mode === 'seq') {
        const byT = mem.slice().sort((a, b) => a.t0 - b.t0);
        reqM.slice().sort((a, b) => a.t0 - b.t0).forEach((s, i) => {
          if (!boundary(req + i)) return;
          const from = s.t0, dt = c.rel + 0.1;
          for (const m of byT) if (m.t0 >= from - 1e-6) m.t0 = +(m.t0 + dt).toFixed(3);
        });
      } else if (mode === 'col') {                   // (the front is a boundary: the whole column stays longer, it shares one pose)
        reqM.forEach((s, i) => { if (!boundary(req + i)) return; if (s.col) s.revW = +Math.max(s.revW, c.rel + 0.45).toFixed(3); else for (const m of mem) { m.stay = +(m.stay + c.rel).toFixed(3); m.hold = +(m.hold + c.rel).toFixed(3); } });
      } else if (reqM.some((s, i) => boundary(req + i))) for (const s of mem) { if (s.mo === 'wall') s.w.tc = +(s.w.tc + c.rel).toFixed(3); else if (s.mo !== 'balloon') s.stay = +(s.stay + c.rel).toFixed(3); }
    }
    let end = 0;
    if (mode === 'col') { const base = lifeOf(mem[0]); let ext = 0; mem.forEach((s, j) => { if (j) ext += s.revW + 0.7 * c.lv; s.t1 = +(s.t0 + base + ext).toFixed(3); }); }
    else for (const s of mem) s.t1 = +(s.t0 + lifeOf(s)).toFixed(3);
    for (const s of mem) end = Math.max(end, s.t1);
    if (end > TIME - 0.2) return 0;
    for (const s of mem) {                           // room on the range (hidden column members keep their lane; practice's prior)
      if (s.mo === 'wall' || s.mo === 'balloon') { if (occ.some(o => o.b > s.t0 && o.a < s.t1)) return 0; continue; }
      if (laneBusy(s.mo === 'drop' ? 'h' : 'f', s.lane, s.t0, s.t1) || overlap(ptsOf(s), s.t0, s.t1)) return 0;
    }
    const pi = nTrick++;
    mem.forEach((s, j) => {
      s.pat = pi; s.patKind = kind; s.pi = j; if (sub) s.trick = sub;
      const a = s.t0, b = s.t1 + (s.hidden ? HB_HOLD : 0);
      if (s.mo === 'wall' || s.mo === 'balloon') { out.push(s); if (s.bomb) bombs++; }
      else commit(s, ptsOf(s), a, b, !!s.col);
    });
    for (const s of reqM.slice().sort((a, b) => a.t0 - b.t0 || (a.col || 0) - (b.col || 0))) aimed(s);
    const book = hold != null ? hold : end;
    xUntil = Math.max(xUntil, book);
    count[kind] = used(kind) + 1; lastTrick = kind;
    return book;
  }
  // COLUMN (#71): N plates in one slot, the ones behind hidden. First column of the round: a clean 4. Later ones: a
  // clean 4-5, or (col4) a column whose 4th is a decoy.
  function column(t) {
    const mo = ['pop', 'drop', 'scoot'][rng.int(0, 2)], dec = used('C') > 0 && rng() < c.col4, N = dec ? 4 : used('C') ? (rng() < 0.5 ? 4 : 5) : 4;
    const revW = +Math.max(0.5, c.win).toFixed(3), side = rng() < 0.5 ? -1 : 1;
    const cd = slot(t, mo, { D: rng.range(c.hop[0], c.hop[1]) * DIAG, stat: true, stay: c.win * 1.15, kmin: 1, kmax: 3, side, until: TIME - 0.2 - N * (revW + c.lv) });
    if (!cd) return 0;
    const f = cd[1], mem = [f], base = lifeOf(f);
    for (let j = 1; j < N; j++) {
      const s = Object.assign({}, f); s.col = j; s.revW = revW; s._ahead = mem[j - 1];
      if (dec && j === 3) { s.bomb = true; s.decoy = true; }
      mem.push(s);
    }
    return finish(mem, 'col', 'C', dec ? 'decoy4' : 'clean' + N, f.t0 + base + 0.25);
  }
  // ROW on a beat: 3-5 across adjacent lanes, one depth, popping left to right (or back) every c.beat s. The first row of a
  // round teaches the rhythm clean; later rows: clean, a DECOY on the beat, or OFF BEAT (the 4th comes early or late).
  function row(t) {
    const mo = ['pop', 'drop', 'side', 'scoot'][rng.int(0, 3)], k = rng.int(1, 3), dir = rng() < 0.5 ? 1 : -1;
    const r = rng(), sub = !used('R') ? 'beat' : r < 0.2 ? 'beat' : r < 0.6 ? 'decoy' : 'off';
    const N = sub === 'off' ? rng.int(4, 5) : rng.int(3, 5), l0 = rng.int(0, 5 - N), beat = c.beat;
    const stay = Math.max(c.win, beat * 1.2), dm = sub === 'decoy' ? rng.int(2, N - 1) : -1, early = rng() < 0.5;
    const mem = []; let tt = t;
    for (let i = 0; i < N; i++) {
      const lane = dir > 0 ? l0 + i : l0 + N - 1 - i;
      if (i && sub === 'off' && i === 3) tt += early ? beat * 0.45 : beat * 1.9; else if (i) tt += beat;
      const s = mk(tt, mo, lane, k, { stat: true, stay, fside: dir > 0 ? -1 : 1 });
      if (i === dm) { s.bomb = true; s.decoy = true; }
      mem.push(s);
    }
    return finish(mem, 'seq', 'R', sub);
  }
  // SNAKE: a chain along a path; 'loop' = across the floor row and back along the ceiling rail, 'zig' = across the lanes
  // up one depth and down the next. The last one is sometimes a decoy or a plain bomb.
  function snake(t) {
    const L = rng.int(5, 7) + (tier >= 3 ? 1 : 0), dt = c.snake, loop = rng() < 0.55, dir = rng() < 0.5 ? 1 : -1;
    const stay = Math.max(0.2, Math.min(c.win, 2 * dt - 0.05 - c.swing - c.lv)), kA = rng.int(1, 3), kB = rng.int(0, 1);
    const cells = [];
    if (loop) { const fl = dir > 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0]; for (const l of fl) cells.push(['pop', l, kA]); for (const l of fl.slice().reverse()) cells.push(['drop', l, kA]); }
    else { const ls = dir > 0 ? [0, 1, 2, 3, 4, 3, 2, 1, 0] : [4, 3, 2, 1, 0, 1, 2, 3, 4]; ls.forEach((l, i) => cells.push(['pop', l, i % 2 ? kB + 2 : kB])); }
    const mem = [];
    for (let i = 0; i < Math.min(L, cells.length); i++) {
      let [mo, lane, k] = cells[i];
      const s = mk(t + i * dt, mo, lane, k, { stat: true, stay, fside: dir > 0 ? -1 : 1 });
      const prev = mem[i - 1];
      if (prev && !loop) {                           // keep a co-visible neighbour clear on screen: flatten the zig there
        const p = ptsOf(s)[0], q = ptsOf(prev)[0];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < p[2] + q[2] + 2) { s.k = prev.k; s.z0 = prev.z0; }
      }
      mem.push(s);
    }
    const r = rng(), last = mem[mem.length - 1];
    if (r < 0.3 + 0.08 * tier) { last.bomb = true; if (rng() < 0.6) last.decoy = true; }
    return finish(mem, 'seq', 'S', (loop ? 'loop' : 'zig') + (last.bomb ? (last.decoy ? '+decoy' : '+bomb') : ''));
  }
  // PING-PONG: two slots right next to each other, left-right-left-right, then a bomb takes the next slot on the beat.
  function pingpong(t) {
    const mo = rng() < 0.6 ? 'pop' : 'drop', l = rng.int(0, 3), k = rng.int(1, 3), N = rng.int(4, 6), dt = c.pp, s0 = rng() < 0.5 ? 0 : 1;
    const stay = Math.max(0.2, 2 * dt - 0.06 - c.swing - c.lv), mem = [];
    for (let i = 0; i <= N; i++) {
      const s = mk(t + i * dt, mo, l + ((i + s0) & 1), k, { stat: true, stay, fside: ((i + s0) & 1) ? 1 : -1 });
      if (i === N) { s.bomb = true; if (rng() < 0.2 + 0.07 * tier) s.decoy = true; }
      mem.push(s);
    }
    return finish(mem, 'seq', 'P', mem[N].decoy ? 'decoy' : 'bomb');
  }
  // WEAVING WALLS: two racks of three plates come down the outer lanes, then cross to the other side, passing each other
  // (A a little behind, B a little in front, their plates at offset heights so they weave through).
  function weave(t) {
    const f = c.weave, sA = rng() < 0.5 ? -1 : 1, zM = -7.6 + rng.range(-0.5, 0.5), dec = tier > 0 && rng() < 0.2 + 0.15 * tier ? rng.int(0, 5) : -1;
    const tin = 0.5, td = +(1.3 / f).toFixed(3), tc = +(1.6 / f).toFixed(3), mem = [];
    const H = [[0.95, 2.25, 3.55], [1.6, 2.9, 4.2]];
    for (let wI = 0; wI < 2; wI++) for (let j = 0; j < 3; j++) {
      const x0 = (wI ? -sA : sA) * 4.8, s = { id: 0, t0: +(t + 0.08 * j).toFixed(3), t1: 0, mo: 'wall', lane: x0 < 0 ? 0 : 4, side: x0 < 0 ? -1 : 1, bomb: false,
        swing: tin, lv: c.lv, readyAt: +(tin * 0.15).toFixed(3), k: 1, z0: Z_FAR + 0.3, sd: SD, steps: 1, hold: 0, scoot: 0, stay: 0,
        w: { x0, y: H[wI][j], z0: +(Z_FAR + 0.3).toFixed(3), zM: +zM.toFixed(3), bz: wI ? 0.8 : -0.8, tin, td, tc } };
      if (wI * 3 + j === dec) { s.bomb = true; s.decoy = true; }
      mem.push(s);
    }
    return finish(mem, 'sim', 'W', dec >= 0 ? 'decoy' : 'clean');
  }
  // THE WALL: 8 plates pop at once (5 on the floor, 3 hanging), a couple of decoys; pick fast.
  function wall8(t) {
    const k = rng.int(2, 3), hl = rng() < 0.5 ? [0, 2, 4] : [1, 2, 3], mem = [];
    for (let l = 0; l < 5; l++) mem.push(mk(t, 'pop', l, k, { stat: true, stay: c.wall8 }));
    for (const l of hl) mem.push(mk(t, 'drop', l, k, { stat: true, stay: c.wall8 }));
    const nd = 1 + (rng() < 0.25 + 0.2 * tier ? 1 : 0) + (tier >= 3 && rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < nd; i++) { const free = mem.filter(s => !s.bomb); const s = free[rng.int(0, free.length - 1)]; s.bomb = true; s.decoy = true; }
    return finish(mem, 'sim', 'X', nd + ' decoys');
  }
  // BALLOONS: one, or a line of 3-4, floating across near the front; payload a plate, sometimes a bomb / decoy, rarely
  // Deputy Duck (the bonus pick-up, +500, never in the quota's base).
  function balloons(t, forceDuck) {
    const line = !forceDuck && rng() < 0.65 + 0.05 * tier, n = line ? rng.int(3, 4) : 1, s0 = rng() < 0.5 ? -1 : 1;
    const z = +rng.range(-3.9, -2.9).toFixed(3), T = c.ball, dt = T * 0.2, y0 = rng.range(1.45, 1.95), x0 = s0 * 7.4;
    const hw = halfW(z), ra = Math.max(0.05, T * (Math.abs(x0) - hw + 0.5) / (2 * Math.abs(x0)));
    const bad = line ? (rng() < 0.3 + 0.1 * tier ? rng.int(1, n - 1) : -1) : (rng() < 0.15 + 0.05 * tier ? 0 : -1);
    const duck = (forceDuck || (duckPlan && !duckDone)) ? (line ? rng.int(0, n - 1) : 0) : -1;
    const mem = [];
    for (let i = 0; i < n; i++) {
      const y = +(y0 + (line ? 0.3 * Math.sin(i * 1.4) : 0)).toFixed(3);
      const s = { id: 0, t0: +(t + i * dt).toFixed(3), t1: 0, mo: 'balloon', lane: 2, side: s0, bomb: false, swing: 0.3, lv: c.lv, readyAt: +ra.toFixed(3),
        k: 3, z0: z, sd: SD, steps: 1, hold: 0, scoot: 0, stay: 0, b: { x0, dx: -2 * x0, z, y, T, ph: +rng.range(0, 6).toFixed(3), se: +(T - ra).toFixed(3), ci: rng.int(0, 3) } };
      if (i === duck) s.duck = true;
      else if (i === bad) { s.bomb = true; if (rng() < 0.55) s.decoy = true; }
      mem.push(s);
    }
    const e = finish(mem, 'sim', 'B', (line ? 'line' + n : 'single') + (duck >= 0 ? '+duck' : '') + (bad >= 0 && duck !== bad ? '+bomb' : ''));
    if (e && duck >= 0) duckDone = true;
    return e;
  }
  // LIGHTS OUT (#73): 2-4 pops under a spotlight, 2-4 s; see LightsFx for how the light moves
  function lightsOut(t) {
    const nMax = [3, 3, 4, 4][tier], nMin = [2, 2, 3, 3][tier], st = c.loWin, gap = Math.max(0.55, st * 0.8);
    let n = rng.int(nMin, nMax);
    while (n > 2 && 0.5 + (n - 1) * gap + st + 0.9 > 4.2) n--;
    const ev = { id: 0, t0: +t.toFixed(3), t1: 0, fx: 'lights', lane: 2, lo: nLights, dur: 0, dark: tier >= 3 ? 0.24 : 0.3, minLit: [0.75, 0.6, 0.5, 0.4][tier], pops: [], _pops: [] };
    const mem = [], decI = rng() < 0.25 + 0.1 * tier ? rng.int(1, n - 1) : -1;
    const W = { arr: tier >= 3 ? [0.4, 0.25, 0.35] : [0.45, 0.3, 0.25], aft: tier >= 3 ? [0.5, 0.2, 0.3] : [0.7, 0.15, 0.15] };
    for (let i = 0; i < n; i++) {
      const at = t + 0.5 + i * gap, mo = ['pop', 'drop', 'side', 'scoot'][rng.int(0, 3)];
      const cd = slot(at, mo, { D: rng.range(c.hop[0], c.hop[1]) * DIAG, stat: true, stay: st }) || slot(at, 'pop', { D: 0, stat: true, stay: st });
      if (!cd) { occ.splice(occ.length - mem.length, mem.length); return 0; }
      const s = cd[1]; s.lo = nLights; s.t1 = +(s.t0 + lifeOf(s)).toFixed(3);
      if (i === decI) { s.bomb = true; s.decoy = true; }
      occ.push({ a: cd[3], b: cd[4], layer: s.mo === 'drop' ? 'h' : 'f', lane: s.lane, pts: cd[2], bomb: s.bomb, ghost: false });   // (for the next pop's overlap test; finish() books it for good)
      mem.push(s);
      const arr = i === 0 ? (rng() < 0.5 ? 'snap' : 'empty') : ['glide', 'snap', 'empty'][pickW(W.arr, rng())];
      const pos = faceAt(s, pose(s, s.swing + 0.01)), awL = (s.lane + 2 + rng.int(0, 1)) % 5, awK = rng.int(0, 4);
      ev.pops.push({ d: 0, at: +(s.t0 - t).toFixed(3), up: +s.swing.toFixed(3), end: +(s.t0 - t + s.readyAt + spanOf(s)).toFixed(3), pos: pos.map(v => +v.toFixed(3)),
        arr, lead: +rng.range(0.35, 0.6).toFixed(3), cut: arr === 'empty' && rng() < 0.3 + 0.1 * tier ? +(s.t0 - t + s.swing + rng.range(0.2, 0.35)).toFixed(3) : -1,
        aft: ['next', 'stay', 'away'][pickW(W.aft, rng())], aw: [LANES[awL], faceYOf(rng() < 0.5 ? 'pop' : 'drop'), +zOf(awK).toFixed(3)] });
      ev._pops.push(s);
    }
    occ.splice(occ.length - n, n);
    ev.dur = +Math.max(...ev.pops.map(p => p.end)).toFixed(3) + 0.15;
    ev.t1 = +(t + ev.dur + 0.35).toFixed(3);
    if (ev.t1 > TIME - 0.5) return 0;
    out.push(ev);
    const e = finish(mem, 'seq', 'L', n + ' pops');
    if (!e) { out.splice(out.indexOf(ev), 1); return 0; }
    xUntil = Math.max(xUntil, ev.t1);
    nLights++; count.lights = nLights;
    return ev.t1;
  }
  // ---- plan: lights-out times, the duck cameo
  const lightsAt = [];
  { const L = c.lights || [0, 0], one = rng() < L[0], two = one && rng() < L[1];
    if (two) { const a = Math.max(6.5, rng.range(0.2, 0.38) * TIME), b = Math.min(TIME - 7, a + rng.range(8.5, 12)); lightsAt.push(a); if (b >= a + 7.5) lightsAt.push(b); }
    else if (one) lightsAt.push(Math.max(6.5, rng.range(0.28, 0.55) * TIME)); }
  const duckPlan = rng() < 0.25; let duckDone = false;
  const TRICKS = { C: column, R: row, S: snake, P: pingpong, W: weave, X: wall8, B: balloons };
  const TW = { C: 1.6, R: 1.5, S: 0.9, P: 0.8, W: 0.5, X: 0.35, B: 0.6 }, CAP = { W: 2, X: tier < 2 ? 1 : 2, B: 2 };
  const pause = () => rng.range(c.pause[0], c.pause[1]);
  // ---- the loop
  let t = 0.6, guard = 0;
  while (guard++ < 900 && t < TIME - 0.6) {
    if (t < xUntil) { t = xUntil; continue; }
    if (lightsAt.length && t >= lightsAt[0] && magLeft() >= 5) {
      const s = clearAt(t);
      if (s > TIME - 5) { lightsAt.shift(); continue; }
      const e = lightsOut(s); lightsAt.shift();
      if (e) { t = e + pause(); continue; }
    }
    const up = upAt(t);
    if (up.length >= c.live) { t = up.map(o => o.b).sort((a, b) => a - b)[up.length - c.live] + 0.05; continue; }
    const trR = rng(), burR = rng();
    const duckLate = duckPlan && !duckDone && t > TIME * 0.72 && t < TIME - c.ball - 1.5;
    if (duckLate || (out.length >= 2 && trR < c.trick && t < TIME - 3)) {
      const s = clearAt(t), W = Object.assign({}, TW);
      if (lastTrick) W[lastTrick] *= 0.15;
      for (const k in CAP) if (used(k) >= CAP[k]) W[k] = 0;
      let e = 0;
      if (duckLate) e = balloons(s, true);
      for (let tries = 0; !e && tries < 3; tries++) {
        const keys = Object.keys(W), k = keys[pickW(keys.map(q => W[q]), rng())];
        if (!W[k]) break;
        e = TRICKS[k](s); W[k] = 0;
      }
      if (e) { t = e + pause(); continue; }
    }
    const n = burR < c.burst ? 2 + (rng() < 0.4 ? 1 : 0) : 1;
    let placed = 0;
    for (let i = 0; i < n; i++) {
      if (single(t) < 0) break;
      placed++; if (i < n - 1) t += rng.range(c.bgap[0], c.bgap[1]);
    }
    if (!placed) { const u = upAt(t); t = u.length ? Math.min(...u.map(o => o.b)) + 0.05 : t + 0.25; continue; }
    t += placed > 1 ? pause() : rng.range(c.gap[0], c.gap[1]);
  }
  // ---- order, ids, relative links
  out.sort((a, b) => a.t0 - b.t0);
  out.forEach((s, i) => { s.id = i; });
  for (const s of out) {
    if (s._ahead) { s.aheadD = s.id - s._ahead.id; delete s._ahead; }
    if (s._pops) { s.pops.forEach((p, i) => { p.d = s._pops[i].id - s.id; }); delete s._pops; }
  }
  // the quota is a share of the REAL targets (turncoats and column members count; flip / hidden bombs and the duck are
  // a bonus, never counted); the cap variant gets quota + spare shots
  const good = out.filter(isReal).length;
  c.goodCount = good; c.bombCount = out.filter(s => s.bomb && !s.hidden).length; c.tricks = count; c.lightsCount = nLights;
  c.quota = Math.max(4, Math.round(good * c.share));
  if (c.ammo && c.ammo.cap != null) c.ammo = { cap: c.quota + c.spare };
  return out;
}

const STEP_PTS = [300, 200, 150, 120, 100];
// step points by the stop it was hit at (a column member counts its stop), +100 a flipped flip bomb, +50 a turncoat hit
// before it turned; balloons 200, weaving walls 150, Deputy Duck 500
function points(sp, lt) {
  if (sp.duck) return 500;
  if (sp.mo === 'balloon') return 200;
  if (sp.mo === 'wall') return 150;
  return (STEP_PTS[Math.min(STEP_PTS.length - 1, pose(sp, lt).step)] || 100) + (sp.flip ? 100 : 0) + (sp.turn ? 50 : 0);
}
// briefing card: the room for error is the TIP line (its own line on both cards; ui.js / portrait.js draw rule + tip).
// cap variant: spare shots over the quota; the others: real targets you may let go. `hint` keeps the tier's teaching tip.
function briefing(c) {
  const TIPS = ['FAR AWAY = MORE POINTS', 'BURNT FUSE = BOMB FLIPS: SHOOT IT!', 'SPARKING PLATE = TURNING BOMB!', 'SHOOT THE FRONT PLATE FIRST!'];
  const cap = c.ammo && c.ammo.cap != null, spare = cap ? c.ammo.cap - c.quota : Math.max(0, (c.goodCount || c.quota) - c.quota);
  const room = spare <= 0 ? 'NO ROOM FOR ERROR!' : 'ROOM FOR ERROR: ' + spare + (cap ? (spare === 1 ? ' SHOT' : ' SHOTS') : (spare === 1 ? ' TARGET' : ' TARGETS'));
  return { rule: [['SHOOT ', 'void'], [c.quota + ' TARGETS', 'red'], [' OR MORE!', 'void']], icon: 'bullseye', unit: 'TARGETS',
    dont: 'bomb', tip: room, room, spare, spareUnit: cap ? 'shots' : 'targets', hint: TIPS[Math.max(0, Math.min(3, c.tier | 0))] };
}
// PRACTICE (free play, ENGINE.md "Practice"): the variant 0 rules of the tier (every trick, lights out included) with a
// 12-round magazine that reloads itself (R / the frame still work). window = seconds of schedule per chunk.
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
  buildEnv, config, practiceConfig, timeline, makeTarget: sp => sp.fx === 'lights' ? new LightsFx(sp) : new Paddle(sp), points, briefing, drawIcon, decor,
  pose, LANES, TIER_P, lifeOf, spanOf, faceAt, scr, isReal, isReq, FLIP_T });
})(window.BLAM);
