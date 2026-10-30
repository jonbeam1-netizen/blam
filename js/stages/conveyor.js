'use strict';
/* =========================================================================================
   B.L.A.M. stages/conveyor.js -- Stage 9: CONVEYOR (DESIGN-STAGES.md section 10, Fable, Jon approved 2026-10-30).
   A TOY FACTORY at night: THREE conveyor belts at different heights and depths (front belt low and near, middle belt
   waist high, back belt up on stilts and far), tunnel housings at both ends of every belt (rubber flaps, hazard frames,
   an amber beacon), a big C-frame STAMPING PRESS over the middle belt, the SORTER arm hanging from the roof, racks of
   toy parts, crates, two robot arms, sodium lamps, brick walls with night windows and the fixed sign "B.L.A.M. TOY WORKS".
   THE MECHANIC: hex PLATES, BOMBS, DECOYS and plate + HIDDEN BOMB pairs (BLAM.Props) ride the belts standing up, out of
   one tunnel and into the other. Each belt has its own speed and direction per wave (a lull between waves while they
   change). An item is shootable the whole ride: the ride IS the pop window. Every item's position is a pure function of
   (its belt coordinate, the belt's displacement D(t)); D integrates the belt's piecewise-linear velocity schedule.
   THE PRESS slams over the middle belt for a beat and hides what is under it; a plate can come out the other side
   ticking (the turncoat: telegraph, unshootable mid-flip, then a bomb). BELT REVERSE: klaxon + spinning amber beacons
   0.5 s, then that belt runs backwards. THE SORTER: the arm swings in, plucks an item off one belt and drops it on
   another (unshootable in the claw). PATTERNS: ROW on one belt (shot-driven #88), STACK across the three belts, SNAKE
   between the belts via the sorter, PING-PONG front / back (shot-driven) then a bomb, THE WALL.
   Everything that decides a spawn is a pure function of (seed, tier, variant) and the stage clock; the only play-
   dependent things (shot-driven releases) read the SHARED hit stage times that points() records -> versus-safe.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets, P = B.Props;
const clamp = E.clamp, ID = 'conveyor';
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const inPlay = () => !!(B.G && B.G.screenName === 'play');
const slowK = () => { const G = B.G; return G && G.screenName === 'play' && G.slow < 1 && !(G.run && G.run.versus) ? G.slow : 1; };
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const shared = (g, m) => { const x = new THREE.Mesh(g, m || MAT.obj); x.userData.sharedGeo = true; return x; };
const noRay = m => { m.raycast = () => {}; return m; };
function scr(x, y, z) {
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (R.RH / 2) / (Math.max(0.1, d) * R.TAN_H);
  return [R.RW / 2 + vx * k, R.RH / 2 - yc * k, k];
}
const uOf = x => clamp(0.5 + x / 16, 0, 1);

// =========================================================================================
// LAYOUT (world units). Belt b: surface height y, depth z, visible half length X (the tunnel mouths), prop scale sz.
// =========================================================================================
const STAND0 = 0.16, PA0 = P.PLATE_A, FACE_H0 = P.PIVOT_Y + P.FACE_Y;
const BELT = [
  { y: 0.35, z: -2.6, X: 5.0, sz: 0.72 },
  { y: 1.55, z: -5.6, X: 6.2, sz: 0.85 },
  { y: 4.6, z: -9.4, X: 8.2, sz: 1.0 }
];
for (const b of BELT) {
  b.pa = PA0 * b.sz; b.fy = b.y + b.sz * (STAND0 + PA0); b.top = b.y + b.sz * (STAND0 + 2 * PA0);
  b.mouth = b.X + b.pa * 1.25; b.shootX = b.X - b.pa * 0.4; b.visX = b.X + b.pa * 1.1; b.gap = 2 * b.pa + 0.3;
  b.hTop = b.top + 0.4; b.len = b.X + 3.6;
}
const PX = 0, PHW = 1.05, PZF = BELT[1].z + 0.55, PZB = BELT[1].z - 0.65, HEAD_H = 1.05, HEAD_UP = 1.15;   // the press
const PD = 0.09, PU = 0.25;                                     // press slam / rise s
const REV_T = 0.5, REV_R = 0.3, WRAMP = 0.6;                    // reverse telegraph / ramp, wave change ramp
const SW_IN = 0.5, SW_OUT = 0.45, LIFT = 0.9, PIV_Y = 8.6, PIV_Z = -5.6;   // the sorter
const FLIP_T = 0.12, HB_GRACE = 0.15, HB_BEAT = 0.6, HB_LV = 0.28, DECOY_ARM = 0.3, DECOY_UNMASK = 0.16, REL_LEAD = 0.1;
const FIN_HOLD = 4.4, FIN_SLOT = 5.0, F_IN = 1.1;
const SPD = [1.4, 1.0, 0.72];                                   // slow / mid / fast: x the tier's ride
const AIM_PTS = BELT.map(b => [scr(-b.shootX, b.fy, b.z), scr(b.shootX, b.fy, b.z)]);
const CD = hyp(AIM_PTS[0][1][0] - AIM_PTS[0][0][0], (AIM_PTS[0][0][1] - AIM_PTS[2][0][1])), CX = R.RW / 2, CY = (AIM_PTS[0][0][1] + AIM_PTS[2][0][1]) / 2;

// ---------- the belt schedule: velocity keys [t, v, type] (linear between keys; type 0 start, 1 wave, 2 reverse) ----------
function kIdx(k, t) { let lo = 0, hi = k.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (k[m][0] <= t) lo = m; else hi = m - 1; } return lo; }
function vAt(bk, t) {
  const k = bk.k; if (t <= k[0][0]) return k[0][1];
  const i = kIdx(k, t); if (i >= k.length - 1) return k[i][1];
  const a = k[i], b = k[i + 1]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
}
function Dof(bk, t) {
  const k = bk.k, c = bk.c; if (t <= k[0][0]) return k[0][1] * (t - k[0][0]);
  const i = kIdx(k, t), a = k[i]; if (i >= k.length - 1) return c[i] + a[1] * (t - a[0]);
  const b = k[i + 1], v = a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
  return c[i] + (t - a[0]) * (a[1] + v) / 2;
}
function pressK(sch, t) {
  for (const p of sch.press) { if (t < p.t) return 0; const r = t - p.t; if (r < PD) return r / PD; if (r < PD + p.h) return 1; if (r < PD + p.h + PU) return 1 - (r - PD - p.h) / PU; }
  return 0;
}
// the claw's carry path (q 0..1) from belt a at x to belt b2: origin of the item (its belt-surface point) + its scale
function carry(a, b2, x, q, o) {
  const A = BELT[a], Bb = BELT[b2], e = E.inOut(q);
  o.x = x; o.y = A.y + (Bb.y - A.y) * e + LIFT * Math.sin(Math.PI * q); o.z = A.z + (Bb.z - A.z) * e; o.sz = A.sz + (Bb.sz - A.sz) * e;
  return o;
}
// an item's pose: a pure function of (spawn, stage time, release time, schedule)
function posAt(sp, t, rel, sch, o) {
  o = o || {};
  let b = sp.b, s = sp.chD ? sp.m - Dof(sch.belts[b], rel) : sp.s;
  o.claw = -1; o.hid = false;
  const so = sp.so;
  if (so && t >= so.tp) {
    if (t < so.tp + so.tm) {
      carry(b, so.b2, s + Dof(sch.belts[b], so.tp), (t - so.tp) / so.tm, o);
      o.b = so.b2; o.claw = (t - so.tp) / so.tm; o.vis = true; o.shoot = false; o.done = false; return o;
    }
    b = so.b2; s = so.s2;
  }
  const Bb = BELT[b], x = s + Dof(sch.belts[b], t), ax = Math.abs(x);
  o.b = b; o.x = x; o.y = Bb.y; o.z = Bb.z; o.sz = Bb.sz;
  o.hid = b === 1 && Math.abs(x - PX) < PHW && pressK(sch, t) > 0.5;
  o.vis = ax < Bb.visX; o.shoot = ax <= Bb.shootX && !o.hid; o.done = t >= rel + sp.gone;
  return o;
}
const TLOF = new WeakMap(), HIT = new WeakMap(), RELT = new WeakMap();
const hitOf = s => HIT.get(s);
// #88 shot-driven release (the range's rule): member i rides out chX s after the hit on member i-1, never later than its
// clock schedule (t0 + chR), never earlier than t0 (the earliest possible). Pure in the timeline + the shared hit times.
function releaseAt(sp, get, hitT) {
  const ch = [sp];
  for (let q = sp; q.chD; ) { q = get(q.id - q.chD); if (!q) break; ch.unshift(q); }
  const A = [ch[0].t0 + (ch[0].chD ? ch[0].chR || 0 : 0)];
  for (let j = 1; j < ch.length; j++) {
    const m = ch[j], h = hitT(ch[j - 1]);
    let a = A[j - 1] + m.chS;
    if (h != null) a = Math.min(a, h + m.chX);
    A.push(Math.max(m.t0, Math.min(a, m.t0 + m.chR)));
  }
  return A[A.length - 1];
}

// =========================================================================================
// THE SET
// =========================================================================================
const FIN = { run: null, t: -1 };
const LAMPS = [[-10, -11.5], [-4, -11.5], [4, -11.5], [10, -11.5], [-6, -5], [6, -5], [0, -1]];
function envBake(x, y, z) {
  let L = 0.74 + 0.1 * clamp(y / 8, 0, 1);
  for (const [lx, lz] of LAMPS) L += 0.3 * Math.exp(-((x - lx) * (x - lx) + (z - lz) * (z - lz)) / 10);
  return Math.min(L, 1.2);
}
// diagonal hazard stripes on a front-facing (+z) band
function hazard(v, x0, y0, x1, y1, z, cs = 0.08) {
  const ni = Math.round((x1 - x0) / cs), nj = Math.max(1, Math.round((y1 - y0) / cs)), w = (x1 - x0) / ni, h = (y1 - y0) / nj;
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) v.bx(x0 + i * w, y0 + j * h, z, x0 + (i + 1) * w, y0 + (j + 1) * h, z + 0.02, ((i + j) & 3) < 2 ? PAL.yellow : PAL.void, null, 16);
}
function buildRoom(v, o, g) {
  // concrete floor: navy slabs, oil stains, a hazard band in front of the front belt, painted lane lines
  for (let x = -16; x < 16; x += 1) for (let z = -13; z < 4; z += 1) {
    const h = hash1(x * 131 + z * 17), c = h < 0.08 ? PAL.midnight : ((x + z) & 1) ? PAL.navy : (h < 0.5 ? PAL.navy : PAL.slate);
    v.bx(x, -0.1, z, x + 1, 0, z + 1, c, null, 4);
  }
  for (let x = -12; x < 12; x += 0.25) v.bx(x, 0, -1.15, x + 0.25, 0.01, -0.85, (Math.floor(x * 4) & 2) ? PAL.yellow : PAL.void, null, 4);
  for (const z of [-4.15, -7.6]) v.bx(-14, 0, z, 14, 0.008, z + 0.1, PAL.amber, null, 4);
  // the brick back wall (two-tone, staggered), a steel girder on top, pipes
  const WZ = -13;
  for (let y = 0, r = 0; y < 10.5; y += 0.3, r++) for (let x = -16 - (r & 1) * 0.3; x < 16; x += 0.6) {
    const h = hash1(Math.round(x * 10) * 7 + r * 131), c = h < 0.12 ? PAL.umber : h < 0.55 ? PAL.oxblood : PAL.crimson;
    v.bx(x + 0.02, y + 0.02, WZ - 0.1, x + 0.58, y + 0.28, WZ, c, null, 16);
    v.bx(x, y, WZ - 0.12, x + 0.6, y + 0.3, WZ - 0.1, PAL.walnut, null, 16);
  }
  v.bx(-16, 9.7, WZ, 16, 10.3, WZ + 0.3, PAL.slate, null, 16 | 8); v.bx(-16, 9.62, WZ + 0.3, 16, 9.72, WZ + 0.35, PAL.steel, null, 16 | 8);
  for (const y of [0.7, 9.1]) { v.bx(-16, y, WZ + 0.1, 16, y + 0.22, WZ + 0.32, PAL.steel, null, 16 | 4 | 8); for (let x = -15; x < 16; x += 3) v.bx(x, y - 0.04, WZ + 0.08, x + 0.14, y + 0.26, WZ + 0.36, PAL.haze, null, 16 | 4); }
  for (const x of [-12.5, 12.5]) v.bx(x, 0, WZ + 0.1, x + 0.22, 9.1, WZ + 0.32, PAL.steel, null, 16 | 1 | 2);
  // tall factory windows onto the night (glow class: dim in the NIGHT SHIFT), mullions, a moon in one
  for (const wx of [-10.6, -6.4, 6.4, 10.6]) {
    const x0 = wx - 1.25, x1 = wx + 1.25, y0 = 1.4, y1 = 6.6;
    o.bx(x0 - 0.15, y0 - 0.2, WZ, x1 + 0.15, y0, WZ + 0.12, PAL.steel); o.bx(x0 - 0.15, y1, WZ, x1 + 0.15, y1 + 0.15, WZ + 0.12, PAL.slate);
    for (let x = x0; x < x1 - 0.01; x += 0.625) for (let y = y0; y < y1 - 0.01; y += 0.65) {
      const k = (y - y0) / (y1 - y0), c = k > 0.75 ? PAL.void : k > 0.45 ? PAL.midnight : k > 0.18 ? PAL.indigo : PAL.deepblue;
      g.bx(x + 0.04, y + 0.04, WZ + 0.01, x + 0.585, y + 0.61, WZ + 0.02, c, null, 16);
      o.bx(x, y, WZ + 0.02, x + 0.625, y + 0.04, WZ + 0.06, PAL.slate, null, 16); o.bx(x, y, WZ + 0.02, x + 0.04, y + 0.65, WZ + 0.06, PAL.slate, null, 16);
    }
    for (let k = 0; k < 9; k++) { const sx = x0 + 0.1 + hash1(k * 9 + wx * 3) * 2.3, sy = y0 + 2.8 + hash1(k * 5 + wx) * 2.2; g.bx(sx, sy, WZ + 0.025, sx + 0.06, sy + 0.06, WZ + 0.03, hash1(k + wx) < 0.4 ? PAL.ice : PAL.mist, null, 16); }
    if (wx === 10.6) for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const d = Math.hypot(i, j); if (d > 4.2) continue; g.bx(wx + 0.3 + i * 0.08, 5.3 + j * 0.08, WZ + 0.03, wx + 0.38 + i * 0.08, 5.38 + j * 0.08, WZ + 0.035, d > 3.4 ? PAL.mist : PAL.bone, null, 16); }
  }
  // sodium lamps (housings + glowing undersides)
  for (const [lx, lz] of LAMPS) {
    if (lz > -10) continue;
    o.bx(lx - 0.03, 9.1, lz - 0.03, lx + 0.03, 9.7, lz + 0.03, PAL.steel);
    o.bx(lx - 0.45, 8.85, lz - 0.35, lx + 0.45, 9.1, lz + 0.35, PAL.slate); o.bx(lx - 0.5, 8.78, lz - 0.4, lx + 0.5, 8.86, lz + 0.4, PAL.navy);
    g.bx(lx - 0.36, 8.72, lz - 0.28, lx + 0.36, 8.79, lz + 0.28, PAL.amber, null, 8 | 16); g.bx(lx - 0.18, 8.7, lz - 0.14, lx + 0.18, 8.73, lz + 0.14, PAL.lemon, null, 8 | 16);
  }
}
// the sign "B.L.A.M. TOY WORKS": bold letters (lemon / yellow / amber rows, glow) on a midnight board in a crimson frame
const SG = { z: -12.6, y: 7.55, s: 0.085 };
function buildSign(o, g) {
  const t = R.bold('B.L.A.M. TOY WORKS'), s = SG.s, W = t.w * s, H = 7 * s, x0 = -W / 2, y0 = SG.y - H / 2, z = SG.z;
  o.bx(x0 - 0.4, y0 - 0.3, z - 0.1, -x0 + 0.4, y0 + H + 0.3, z, PAL.midnight, null, 16 | 4 | 8 | 1 | 2);
  o.bx(x0 - 0.5, y0 - 0.4, z - 0.12, -x0 + 0.5, y0 - 0.3, z + 0.03, PAL.crimson); o.bx(x0 - 0.5, y0 + H + 0.3, z - 0.12, -x0 + 0.5, y0 + H + 0.4, z + 0.03, PAL.crimson);
  o.bx(x0 - 0.5, y0 - 0.3, z - 0.12, x0 - 0.4, y0 + H + 0.3, z + 0.03, PAL.crimson); o.bx(-x0 + 0.4, y0 - 0.3, z - 0.12, -x0 + 0.5, y0 + H + 0.3, z + 0.03, PAL.crimson);
  for (const sx of [-3, 3]) o.bx(sx - 0.03, y0 + H + 0.4, z - 0.08, sx + 0.03, 9.7, z - 0.03, PAL.steel);
  const ROWC = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
  for (const [px, py] of t.px) {
    const x = x0 + px * s, y = y0 + (6 - py) * s;
    g.bx(x, y, z, x + s, y + s, z + 0.06, ROWC[py], null, 16 | 4 | 1);
    o.bx(x + s * 0.5, y - s * 0.5, z - 0.01, x + s * 1.5, y + s * 0.5, z + 0.02, PAL.void, null, 16);
  }
  for (let x = x0 - 0.3; x < -x0 + 0.3; x += 0.42) { g.bx(x, y0 + H + 0.33, z + 0.03, x + 0.07, y0 + H + 0.38, z + 0.06, PAL.amber, null, 16); g.bx(x, y0 - 0.37, z + 0.03, x + 0.07, y0 - 0.32, z + 0.06, PAL.amber, null, 16); }
}
// racks of toy parts under the back belt, crates, bins of tin ducks, two robot arms, the press body
function toyBin(o, x, z, kind) {
  o.bx(x - 0.45, 0, z - 0.3, x + 0.45, 0.45, z + 0.3, kind ? PAL.crimson : PAL.blue); o.bx(x - 0.47, 0.45, z - 0.32, x + 0.47, 0.5, z + 0.32, PAL.steel);
  for (let i = 0; i < 7; i++) {
    const px = x - 0.32 + hash1(i * 13 + x * 7) * 0.6, pz = z - 0.18 + hash1(i * 7 + z * 3) * 0.3, c = [PAL.yellow, PAL.cyan, PAL.red, PAL.lime, PAL.pink, PAL.orange][(i + kind) % 6];
    o.bx(px - 0.07, 0.48, pz - 0.07, px + 0.07, 0.62, pz + 0.07, c);
    if (c === PAL.yellow) o.bx(px + 0.07, 0.53, pz - 0.03, px + 0.11, 0.57, pz + 0.03, PAL.orange);   // a tin duck's bill
  }
}
function crate(o, x, y, z, w, h, d) {
  o.bx(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, PAL.tan);
  for (const yy of [y + 0.04, y + h - 0.1]) o.bx(x - w / 2 - 0.01, yy, z - d / 2 - 0.01, x + w / 2 + 0.01, yy + 0.06, z + d / 2 + 0.01, PAL.chestnut);
  o.bx(x - w / 2 - 0.01, y, z + d / 2, x - w / 2 + 0.07, y + h, z + d / 2 + 0.01, PAL.chestnut); o.bx(x + w / 2 - 0.07, y, z + d / 2, x + w / 2 + 0.01, y + h, z + d / 2 + 0.01, PAL.chestnut);
  o.bx(x - 0.18, y + h * 0.4, z + d / 2, x + 0.18, y + h * 0.55, z + d / 2 + 0.012, PAL.red, null, 16);
}
function robot(o, x, z, sd) {
  o.bx(x - 0.4, 0, z - 0.4, x + 0.4, 0.3, z + 0.4, PAL.slate); o.bx(x - 0.28, 0.3, z - 0.28, x + 0.28, 0.75, z + 0.28, PAL.amber);
  o.bx(x - 0.3, 0.75, z - 0.3, x + 0.3, 0.9, z + 0.3, PAL.void);
  const seg = (ax, ay, bx, by, w, c) => { const n = 8; for (let i = 0; i <= n; i++) { const k = i / n, px = ax + (bx - ax) * k, py = ay + (by - ay) * k; o.bx(px - w, py - w, z - w, px + w, py + w, z + w, c); } };
  seg(x, 0.9, x - sd * 0.5, 2.0, 0.17, PAL.yellow); o.bx(x - sd * 0.5 - 0.2, 1.85, z - 0.22, x - sd * 0.5 + 0.2, 2.15, z + 0.22, PAL.void);
  seg(x - sd * 0.5, 2.0, x - sd * 1.4, 2.35, 0.13, PAL.yellow); o.bx(x - sd * 1.4 - 0.12, 2.2, z - 0.15, x - sd * 1.4 + 0.12, 2.48, z + 0.15, PAL.slate);
  o.bx(x - sd * 1.62 - 0.05, 2.0, z - 0.12, x - sd * 1.48, 2.25, z + 0.12, PAL.steel); o.bx(x - sd * 1.62 - 0.05, 2.0, z - 0.04, x - sd * 1.38, 2.06, z + 0.04, PAL.steel);
  o.bx(x - 0.12, 0.45, z + 0.28, x + 0.12, 0.6, z + 0.3, PAL.void, null, 16);
}
function buildDecor(o) {
  // racks under the back belt with bins of parts
  for (const rx of [-7.2, -3.6, 3.6, 7.2]) {
    const z0 = -11.6, z1 = -10.6;
    for (const x of [rx - 1.5, rx + 1.5]) o.bx(x - 0.06, 0, z0, x + 0.06, 3.6, z0 + 0.12, PAL.slate);
    for (const y of [0.9, 2.0, 3.1]) {
      o.bx(rx - 1.55, y - 0.08, z0, rx + 1.55, y, z1, PAL.steel);
      for (let i = 0; i < 4; i++) { const bx = rx - 1.3 + i * 0.75, c = [PAL.crimson, PAL.blue, PAL.amber, PAL.plum][(i + Math.round(y * 3) + Math.round(rx)) & 3];
        o.bx(bx - 0.3, y, z1 - 0.5, bx + 0.3, y + 0.42, z1 - 0.05, c);
        for (let k = 0; k < 3; k++) o.bx(bx - 0.22 + k * 0.17, y + 0.4, z1 - 0.35, bx - 0.1 + k * 0.17, y + 0.52, z1 - 0.2, [PAL.yellow, PAL.cyan, PAL.pink, PAL.lime, PAL.bone][(i * 3 + k + Math.round(y)) % 5]); }
    }
  }
  // crates: front corners + a stack beside the press, bins of tin ducks between the belts
  crate(o, -4.6, 0, -0.4, 1.0, 0.8, 0.9); crate(o, -3.6, 0, 0.1, 0.8, 0.6, 0.8); crate(o, -4.5, 0.8, -0.4, 0.8, 0.6, 0.7);
  crate(o, 4.7, 0, -0.3, 1.0, 0.8, 0.9); crate(o, 4.6, 0.8, -0.3, 0.7, 0.55, 0.7);
  crate(o, 3.1, 0, -7.4, 1.1, 0.9, 0.9); crate(o, 4.3, 0, -7.6, 0.9, 0.7, 0.8); crate(o, 3.2, 0.9, -7.4, 0.8, 0.6, 0.7);
  crate(o, -3.4, 0, -7.5, 1.0, 0.85, 0.9);
  toyBin(o, -2.6, -4.2, 0); toyBin(o, 2.4, -4.3, 1); toyBin(o, -1.4, -8.0, 1);
  robot(o, -7.9, -4.1, -1); robot(o, 7.9, -4.1, 1);
}
// the press body: a squat C-frame machine behind the middle belt (deepblue paint, steel guides, a flywheel, hazard base)
function buildPressBody(o) {
  const z0 = -7.3, z1 = PZB, x0 = -1.5, x1 = 1.5, top = 3.7;
  o.bx(x0, 0, z0, x1, top, z1, PAL.deepblue);
  o.bx(x0 - 0.05, top - 0.25, z0 - 0.05, x1 + 0.05, top, z1 + 0.05, PAL.slate); o.bx(x0 - 0.05, top, z0, x1 + 0.05, top + 0.08, z1, PAL.steel);
  for (const x of [-1.2, 1.12]) o.bx(x, 0.4, z1, x + 0.08, top - 0.25, z1 + 0.06, PAL.steel);   // guide rails on the front
  hazard(o, x0, 0.05, x1, 0.45, z1 + 0.005);
  o.bx(-0.35, 3.1, z1, 0.35, 3.35, z1 + 0.03, PAL.bone, null, 16); o.bx(-0.3, 3.15, z1 + 0.03, 0.3, 3.3, z1 + 0.04, PAL.crimson, null, 16);   // a plate: red stencil
  // flywheel on the right side (spokes + rim)
  const cx = x1 + 0.12, cy = 2.6, cz = (z0 + z1) / 2;
  for (let a = 0; a < 24; a++) { const an = a / 24 * Math.PI * 2, y = cy + Math.cos(an) * 0.75, z = cz + Math.sin(an) * 0.75; o.bx(cx, y - 0.1, z - 0.1, cx + 0.14, y + 0.1, z + 0.1, a & 1 ? PAL.steel : PAL.haze); }
  for (let a = 0; a < 4; a++) { const an = a / 4 * Math.PI; for (let r = -0.7; r <= 0.7; r += 0.1) o.bx(cx + 0.02, cy + Math.cos(an) * r - 0.04, cz + Math.sin(an) * r - 0.04, cx + 0.12, cy + Math.cos(an) * r + 0.04, cz + Math.sin(an) * r + 0.04, PAL.slate); }
  o.bx(-1.3, 1.9, z1, -0.8, 2.4, z1 + 0.04, PAL.bone, null, 16); o.bx(-1.08, 2.0, z1 + 0.04, -1.02, 2.3, z1 + 0.05, PAL.red, null, 16);   // a gauge
}
// a belt: legs, frame rails, the return box, the hazard stripes under the press (belt env: stays lit in the NIGHT SHIFT)
function buildBelt(v, b) {
  const Bb = BELT[b], L = Bb.len, y = Bb.y, z = Bb.z;
  for (const sz of [-1, 1]) {
    v.bx(-L, y - 0.24, z + sz * 0.5 - 0.04, L, y + 0.07, z + sz * 0.5 + 0.04, PAL.slate, null, 63);
    v.bx(-L, y + 0.04, z + sz * 0.5 - 0.05, L, y + 0.09, z + sz * 0.5 + 0.05, PAL.steel, null, 4 | 16);
  }
  v.bx(-L, y - 0.38, z - 0.4, L, y - 0.24, z + 0.4, PAL.navy, null, 16 | 8);
  const thick = b === 2 ? 0.1 : 0.06;
  for (let x = -L + 0.4; x < L; x += 1.6) for (const sz of [-1, 1]) v.bx(x - thick, 0, z + sz * 0.42 - thick, x + thick, y - 0.24, z + sz * 0.42 + thick, PAL.slate, null, 1 | 2 | 16 | 32);
  if (b === 2) for (let x = -L + 0.4; x < L - 1.6; x += 1.6) for (let k = 0; k < 10; k++) { const px = x + k * 0.16, py = 0.5 + k * 0.36; v.bx(px - 0.05, py - 0.05, z + 0.38, px + 0.05, py + 0.05, z + 0.44, PAL.navy, null, 16); }
  if (b === 1) hazard(v, -PHW, y - 0.24, PHW, y - 0.135, z + 0.545, 0.05);
}
// tunnel housings at both ends of a belt (factory: dim in the NIGHT SHIFT): body, a hazard frame round the mouth, rubber flaps
function buildHousings(o, b) {
  const Bb = BELT[b], y0 = Bb.y - 0.4, y1 = Bb.hTop, z0 = Bb.z - 0.75, z1 = Bb.z + 0.75;
  for (const sd of [-1, 1]) {
    const xa = sd * Bb.X, xb = sd * (Bb.X + 3.6), lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    o.bx(lo, y0, z0, hi, y1, z1, PAL.slate, null, 16 | 4 | 8);
    o.bx(lo, y1, z0, hi, y1 + 0.08, z1, PAL.steel, null, 16 | 4);
    for (let x = lo + 0.3; x < hi; x += 0.6) o.bx(x, y0 + 0.08, z1, x + 0.05, y0 + 0.13, z1 + 0.01, PAL.void, null, 16);
    // the inner face (toward the middle) around the mouth
    const fx = xa, my0 = Bb.y - 0.05, my1 = Bb.top + 0.18, mask = sd > 0 ? 2 : 1, fz0 = Bb.z - 0.55, fz1 = Bb.z + 0.55;
    o.bx(fx - 0.04, y0, z0, fx + 0.04, my0, z1, PAL.navy, null, mask); o.bx(fx - 0.04, my1, z0, fx + 0.04, y1, z1, PAL.navy, null, mask);
    o.bx(fx - 0.04, my0, fz1, fx + 0.04, my1, z1, PAL.navy, null, mask); o.bx(fx - 0.04, my0, z0, fx + 0.04, my1, fz0, PAL.navy, null, mask);
    o.bx(fx + sd * 0.3, my0, fz0, fx + sd * 0.32, my1, fz1, PAL.void, null, mask);   // the dark inside
    for (let zz = fz0; zz < fz1 - 0.01; zz += 0.11) o.bx(fx + sd * 0.02, my0 + 0.12, zz + 0.01, fx + sd * 0.03, my1, zz + 0.08, ((zz * 100) | 0) & 1 ? PAL.midnight : PAL.navy, null, mask);   // rubber flaps
    // a hazard frame on the front face at the mouth end + a number plate
    const hx0 = sd > 0 ? xa : xa - 0.35, hx1 = hx0 + 0.35;
    hazard(o, hx0, y0, hx1, y1, z1 + 0.005, 0.07);
    const nx = sd * (Bb.X + 1.8);
    o.bx(nx - 0.32, (y0 + y1) / 2 - 0.2, z1, nx + 0.32, (y0 + y1) / 2 + 0.2, z1 + 0.02, PAL.bone, null, 16);
    for (let k = 0; k <= b; k++) o.bx(nx - 0.2 + k * 0.16, (y0 + y1) / 2 - 0.12, z1 + 0.02, nx - 0.12 + k * 0.16, (y0 + y1) / 2 + 0.12, z1 + 0.03, PAL.void, null, 16);
    if (b > 0) for (const x of [lo + 0.3, hi - 0.3]) o.bx(x - 0.08, 0, z1 - 0.3, x + 0.08, y0, z1 - 0.15, PAL.slate);   // feet
  }
}
// ---------- the moving belt surface: slats in one mesh, offset per belt in the vertex shader ----------
const SLAT_P = 0.4;
const slatMat = new THREE.ShaderMaterial({
  uniforms: { uOff: { value: [0, 0, 0] } },
  vertexShader: `attribute float aB; attribute vec3 color; uniform float uOff[3]; varying vec3 vC;
    void main(){ vec3 p = position; float o = aB < 0.5 ? uOff[0] : (aB < 1.5 ? uOff[1] : uOff[2]); p.x += o; vC = color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }'
});
function attrMesh(v, attrs, mat) {
  const g = v.geo(); for (const k in attrs) g.setAttribute(k, new THREE.Float32BufferAttribute(attrs[k], 1));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.raycast = () => {}; return m;
}
function slatMesh() {
  const v = new Vox(), aB = []; v.shade = [0.7, 0.7, 1, 0.5, 0.85, 0.6];
  for (let b = 0; b < 3; b++) {
    const Bb = BELT[b], n0 = v.vc;
    for (let x = -Bb.len - SLAT_P; x < Bb.len; x += SLAT_P) {
      v.bx(x, Bb.y - 0.05, Bb.z - 0.44, x + SLAT_P - 0.07, Bb.y, Bb.z + 0.44, PAL.midnight, null, 4 | 16);
      v.bx(x + SLAT_P - 0.07, Bb.y - 0.05, Bb.z - 0.44, x + SLAT_P, Bb.y + 0.02, Bb.z + 0.44, PAL.slate, null, 4 | 16);
    }
    for (let q = n0; q < v.vc; q++) aB.push(b);
  }
  return attrMesh(v, { aB }, slatMat);
}
// ---------- the lights: chevrons on every belt's front rail (they chase with the belt; amber blink = REVERSE telegraph) and
// the spinning amber beacons on the housings ----------
const lightMat = new THREE.ShaderMaterial({
  uniforms: { uOff: { value: [0, 0, 0] }, uWarn: { value: [0, 0, 0] }, uT: { value: 0 }, uSpin: { value: 0 },
    cOn: { value: new THREE.Color(PAL.cyan) }, cOff: { value: new THREE.Color(PAL.navy) }, cAmb: { value: new THREE.Color(PAL.amber) },
    cRust: { value: new THREE.Color(PAL.rust) }, cLem: { value: new THREE.Color(PAL.lemon) }, cBase: { value: new THREE.Color(PAL.oxblood) } },
  vertexShader: `attribute float aB; attribute float aX; attribute float aK; attribute vec3 color;
    uniform float uOff[3]; uniform float uWarn[3]; uniform float uT, uSpin; uniform vec3 cOn, cOff, cAmb, cRust, cLem, cBase; varying vec3 vC;
    void main(){
      float o = aB < 0.5 ? uOff[0] : (aB < 1.5 ? uOff[1] : uOff[2]);
      float w = aB < 0.5 ? uWarn[0] : (aB < 1.5 ? uWarn[1] : uWarn[2]);
      vec3 c;
      if (aK < 0.5) { float ph = fract((aX - o) / 1.2); c = ph < 0.3 ? cOn : cOff; if (w > 0.5) c = fract(uT * 7.0) < 0.5 ? cAmb : cRust; }
      else if (aK < 1.5) { float on = cos(aX - uSpin); c = w > 0.5 && on > 0.3 ? (on > 0.8 ? cLem : cAmb) : cRust; }
      else c = cBase;
      vC = c * color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }'
});
function lightMesh() {
  const v = new Vox(), aB = [], aX = [], aK = []; v.shade = [0.8, 0.8, 1, 0.6, 1, 0.6];
  const put = (b, x, k, fn) => { const n0 = v.vc; fn(); for (let q = n0; q < v.vc; q++) { aB.push(b); aX.push(x); aK.push(k); } };
  for (let b = 0; b < 3; b++) {
    const Bb = BELT[b];
    for (let x = -Bb.X + 0.1; x < Bb.X; x += 0.3) put(b, x, 0, () => v.bx(x - 0.08, Bb.y - 0.12, Bb.z + 0.54, x + 0.08, Bb.y - 0.03, Bb.z + 0.56, 0xffffff, null, 16));
    for (const sd of [-1, 1]) {
      const cx = sd * (Bb.X + 0.45), cy = Bb.hTop + 0.08, cz = Bb.z + 0.2;
      put(b, 0, 2, () => v.bx(cx - 0.16, cy, cz - 0.16, cx + 0.16, cy + 0.08, cz + 0.16, 0xffffff));
      for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2, px = cx + Math.cos(an) * 0.1, pz = cz + Math.sin(an) * 0.1; put(b, an, 1, () => v.bx(px - 0.06, cy + 0.08, pz - 0.06, px + 0.06, cy + 0.3, pz + 0.06, 0xffffff)); }
      put(b, 0, 2, () => v.bx(cx - 0.12, cy + 0.3, cz - 0.12, cx + 0.12, cy + 0.34, cz + 0.12, 0xffffff));
    }
  }
  return attrMesh(v, { aB, aX, aK }, lightMat);
}
// ---------- moving parts: the press head, the sorter arm (rod + claw), the finale's steel sheet ----------
const MF = MAT.env.clone(), MO = MAT.obj.clone(), MG = MAT.glow.clone(), MP = MAT.obj.clone(), MS = MAT.glow.clone();
let PARTS = null;
function headGeo() {
  const v = new Vox(), x0 = -PHW, x1 = PHW, z0 = PZB + 0.02, z1 = PZF;
  v.bx(x0, 0, z0, x1, HEAD_H, z1, PAL.steel); v.bx(x0 + 0.08, 0.25, z1, x1 - 0.08, HEAD_H - 0.12, z1 + 0.02, PAL.haze, null, 16);
  v.bx(-0.55, 0.38, z1 + 0.02, 0.55, HEAD_H - 0.25, z1 + 0.04, PAL.slate, null, 16);
  for (const x of [-0.85, -0.3, 0.3, 0.85]) v.bx(x - 0.05, HEAD_H - 0.1, z1 + 0.02, x + 0.05, HEAD_H - 0.02, z1 + 0.04, PAL.navy, null, 16);
  hazard(v, x0, 0.02, x1, 0.22, z1 + 0.005);
  v.bx(x0 - 0.02, 0, z0, x1 + 0.02, 0.03, z1 + 0.02, PAL.void, null, 8 | 16);
  for (const x of [-0.6, 0.6]) v.bx(x - 0.07, HEAD_H, z0 + 0.25, x + 0.07, HEAD_H + 1.3, z0 + 0.39, PAL.haze);   // piston rods
  return v.geo();
}
function armGeos() {
  const r = new Vox(); r.bx(-0.1, -1, -0.1, 0.1, 0, 0.1, PAL.yellow); for (const y of [-0.85, -0.55, -0.25]) r.bx(-0.105, y - 0.06, -0.105, 0.105, y, 0.105, PAL.void);
  const hub = new Vox(); hub.bx(-0.18, -0.12, -0.14, 0.18, 0.05, 0.14, PAL.slate); hub.bx(-0.12, -0.18, -0.1, 0.12, -0.12, 0.1, PAL.void);
  hub.bx(-0.03, 0.05, -0.03, 0.03, 0.1, 0.03, PAL.amber);
  const f = new Vox(); f.bx(-0.035, -0.32, -0.05, 0.035, 0, 0.05, PAL.amber); f.bx(-0.035, -0.36, -0.05, 0.06, -0.3, 0.05, PAL.yellow);
  return { rod: r.geo(), hub: hub.geo(), finger: f.geo() };
}
const SHEET = { w: 1.0, h: 0.95 };
function sheetGeos() {
  const v = new Vox(), w = SHEET.w, h = SHEET.h, y0 = 0.14;
  v.bx(-w - 0.08, 0, -0.25, w + 0.08, 0.12, 0.25, PAL.slate); v.bx(-w - 0.04, 0.12, -0.05, w + 0.04, y0, 0.05, PAL.navy);
  v.bx(-w, y0, -0.03, w, y0 + h, 0.03, PAL.steel); v.bx(-w + 0.06, y0 + 0.06, 0.03, w - 0.06, y0 + h - 0.06, 0.04, PAL.navy, null, 16);
  for (const x of [-w + 0.1, w - 0.1]) for (const y of [y0 + 0.1, y0 + h - 0.1]) v.bx(x - 0.03, y - 0.03, 0.04, x + 0.03, y + 0.03, 0.055, PAL.slate, null, 16);
  const t = R.bold('B.L.A.M.'), s = 1.8 / t.w, L = new Vox(), ROWC = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
  const lx0 = -t.w * s / 2, ly0 = y0 + h / 2 - 3.5 * s;
  for (const [px, py] of t.px) { const x = lx0 + px * s, y = ly0 + (6 - py) * s; L.bx(x, y, 0.04, x + s, y + s, 0.09, ROWC[py], null, 16 | 4 | 1); v.bx(x + s * 0.4, y - s * 0.4, 0.04, x + s * 1.4, y + s * 0.6, 0.05, PAL.slate, null, 16); }
  return { sheet: v.geo(), letters: L.geo() };
}
function buildEnv() {
  const group = new THREE.Group();
  const env = new Vox(), obj = new Vox(), glow = new Vox(), belt = new Vox();
  env.bake = envBake; belt.bake = envBake; obj.bake = (x, y, z) => 0.85 + 0.15 * envBake(x, y, z);
  buildRoom(env, obj, glow);
  buildSign(obj, glow);
  buildDecor(obj);
  buildPressBody(obj);
  for (let b = 0; b < 3; b++) { buildBelt(belt, b); buildHousings(obj, b); }
  const envMesh = env.mesh(MF), objMesh = obj.mesh(MO), glowMesh = glow.mesh(MG), beltMesh = belt.mesh(MAT.env);
  envMesh.userData.env = true; noRay(glowMesh);
  const slats = slatMesh(), lights = lightMesh();
  slats.onBeforeRender = envStep; slats.renderOrder = -10;   // first: it moves the parts below before they are drawn
  const A = armGeos(), S = sheetGeos();
  const head = noRay(new THREE.Mesh(headGeo(), MP));
  const rod = noRay(new THREE.Mesh(A.rod, MAT.obj)), claw = new THREE.Group(), hub = noRay(new THREE.Mesh(A.hub, MAT.obj));
  const f1 = noRay(new THREE.Mesh(A.finger, MAT.obj)), f2 = noRay(new THREE.Mesh(A.finger, MAT.obj)); f2.scale.x = -1;
  claw.add(hub, f1, f2);
  const sheet = new THREE.Group(), sm = noRay(new THREE.Mesh(S.sheet, MAT.obj)), sl = noRay(new THREE.Mesh(S.letters, MS)); sheet.add(sm, sl); sheet.visible = false;
  rod.visible = false; claw.visible = false;
  group.add(envMesh, objMesh, glowMesh, beltMesh, slats, lights, head, rod, claw, sheet);
  PARTS = { head, rod, claw, f1, f2, sheet, letters: sl };
  group.userData.shootables = [envMesh, objMesh, beltMesh];
  return group;
}
// ---------- per-frame animation of the set (pure in the stage clock + the schedule; cosmetic when no conveyor run) ----------
const _q = new THREE.Quaternion(), _dn = new THREE.Vector3(0, -1, 0), _d = new THREE.Vector3(), _cp = {};
let lastStep = 0;
function schOf(run) { return run && run.stage === ID && run.timeline && run.timeline.sch ? run.timeline.sch : null; }
function nightOn(run) { return !!(run && run.stage === ID && run.variant === 2 && B.G && B.G.screenName === 'play' && run.state !== 'end'); }
function sorterPose(sch, t, o) {
  for (const e of sch.sort) {
    if (t < e.tp - SW_IN || t > e.tp + e.tm + SW_OUT) continue;
    const A = BELT[e.b];
    if (t < e.tp) {
      const k = E.outCubic(clamp((t - (e.tp - SW_IN)) / SW_IN, 0, 1)), x = e.s + Dof(sch.belts[e.b], t), gy = A.top + 0.1;
      o.x = x; o.y = PIV_Y - 0.3 + (gy - PIV_Y + 0.3) * k; o.z = PIV_Z + (A.z - PIV_Z) * k; o.open = 1; return o;
    }
    if (t < e.tp + e.tm) { carry(e.b, e.b2, e.s + Dof(sch.belts[e.b], e.tp), (t - e.tp) / e.tm, _cp); o.x = _cp.x; o.y = _cp.y + _cp.sz * (STAND0 + 2 * PA0) + 0.1; o.z = _cp.z; o.open = 0; return o; }
    const Bb = BELT[e.b2], k = E.inCubic(clamp((t - e.tp - e.tm) / SW_OUT, 0, 1)), x = e.s2 + Dof(sch.belts[e.b2], e.tp + e.tm);
    o.x = x; o.y = Bb.top + 0.1 + (PIV_Y - 0.3 - Bb.top - 0.1) * k; o.z = Bb.z + (PIV_Z - Bb.z) * k; o.open = 1; return o;
  }
  return null;
}
function finK(f) {                                             // the finale's slam (f = s since the finale began)
  const a = f - F_IN; if (a < 0) return 0; if (a < 0.08) return a / 0.08; if (a < 0.45) return 1; if (a < 0.75) return 1 - (a - 0.45) / 0.3; return 0;
}
function envStep() {
  if (!PARTS) return;
  const run = B.G && B.G.run, sch = schOf(run), now = performance.now() / 1000, t = sch ? run.t : now * slowK();
  const U = slatMat.uniforms.uOff.value, L = lightMat.uniforms;
  for (let b = 0; b < 3; b++) {
    const D = sch ? Dof(sch.belts[b], t) : t * [1.6, -1.3, 1.1][b];
    U[b] = ((D % SLAT_P) + SLAT_P) % SLAT_P; L.uOff.value[b] = ((D % 1.2) + 1.2) % 1.2;
    let w = 0; if (sch) for (const r of sch.rev) if (r.b === b && t >= r.t - REV_T && t < r.t + 0.15) w = 1;
    L.uWarn.value[b] = w;
  }
  L.uT.value = now; L.uSpin.value = now * 14;
  // the press head
  let k = sch ? pressK(sch, t) : 0;
  const fin = FIN.run === run && FIN.t >= 0 && sch ? t - FIN.t : -1;
  if (fin >= 0) k = Math.max(k, finK(fin));
  const ke = k >= 1 ? 1 : k > 0 && sch && pressRising(sch, t, fin) ? E.inOut(k) : k;
  PARTS.head.position.set(PX, BELT[1].y + 0.03 + HEAD_UP * (1 - ke), 0);
  // the sorter arm
  const sp = sch ? sorterPose(sch, t, {}) : null;
  if (sp) {
    _d.set(0, sp.y - PIV_Y, sp.z - PIV_Z); const len = _d.length();
    PARTS.rod.visible = PARTS.claw.visible = len > 0.25;
    _q.setFromUnitVectors(_dn, _d.normalize());
    PARTS.rod.position.set(sp.x, PIV_Y, PIV_Z); PARTS.rod.quaternion.copy(_q); PARTS.rod.scale.set(1, len, 1);
    PARTS.claw.position.set(sp.x, sp.y, sp.z); PARTS.claw.quaternion.copy(_q);
    const op = 0.15 + 0.45 * sp.open; PARTS.f1.position.x = 0.12; PARTS.f2.position.x = -0.12; PARTS.f1.rotation.z = op; PARTS.f2.rotation.z = -op;
    PARTS.f1.position.y = PARTS.f2.position.y = -0.12;
  } else { PARTS.rod.visible = PARTS.claw.visible = false; }
  // the finale's sheet
  if (fin >= 0) {
    const Bb = BELT[1], x0 = -(Bb.X + 1.6);
    let x = fin < F_IN ? x0 * (1 - E.outCubic(fin / F_IN)) : fin < 3.3 ? 0 : (Bb.X + 2.5) * E.inCubic(Math.min(1, (fin - 3.3) / 1.1));
    PARTS.sheet.visible = true; PARTS.sheet.position.set(x, Bb.y, Bb.z);
    PARTS.letters.visible = fin >= F_IN + 0.08;
    const fl = fin - F_IN - 0.45; MS.color.setScalar(fl > 0 && fl < 1.4 && (Math.floor(fl * 8) & 1) ? 1.35 : 1);
  } else PARTS.sheet.visible = false;
  // NIGHT SHIFT: the factory goes dark, only the belts and the items stay lit; the dark flag gives the muzzle its glow
  const night = nightOn(run) && !(fin >= 0 && fin > F_IN + 0.75);   // the shift is over: the lights come back on for the sheet
  MF.color.setScalar(night ? 0.2 : 1); MO.color.setScalar(night ? 0.24 : 1); MG.color.setScalar(night ? 0.32 : 1); MP.color.setScalar(night ? 0.55 : 1);
  if (night && B.FX && B.FX.setDark) B.FX.setDark(ID, true);
  for (const k of ['head', 'rod', 'claw', 'sheet']) PARTS[k].updateMatrixWorld(true);
  lastStep = now;
}
function pressRising(sch, t, fin) { for (const p of sch.press) { const r = t - p.t; if (r >= PD + p.h && r < PD + p.h + PU) return true; } return fin >= 0 && fin - F_IN > 0.45; }

// =========================================================================================
// THE ITEMS: a plate / bomb / decoy / plate + hidden bomb / turncoat standing on a stand on a belt shoe
// =========================================================================================
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const s = new Vox(); s.bx(-0.04, 0, -0.04, 0.04, STAND0 + 0.12, 0.04, PAL.steel); s.bx(-0.16, 0, -0.12, 0.16, 0.06, 0.12, PAL.slate); s.bx(-0.17, 0, 0.1, 0.17, 0.03, 0.13, PAL.amber);
  return (GEO = { stand: s.geo() });
}
function mountProp(prop, hinge) {
  if (prop.base) prop.base.visible = false;
  if (prop.arm) prop.arm.visible = false;
  prop.group.position.y = STAND0 + PA0 - FACE_H0;
  hinge.add(prop.group);
}
function decoyPick(id) {
  const V = P.DECOY_VARIANTS || ['a'], h = (Math.imul((id | 0) + 1, 2654435761) >>> 0) / 4294967296;
  return V[Math.min(V.length - 1, Math.floor(h * V.length))];
}
P.warm();
const _w = new THREE.Vector3();
class Item extends T.Target {
  constructor(sp, run) {
    super(sp.bomb && !sp.hidden ? 'bomb' : 'target');
    this.sp = sp; this.run = run; this.P = {}; this.lastT = sp.t0; this.deadT = -1; this.revealT = -1; this.armT = -1; this.announced = false;
    this.hinge = new THREE.Group(); this.group.add(this.hinge);
    this.stand = noRay(shared(geos().stand)); this.hinge.add(this.stand);
    const o = {}; if (sp.decoy) o.variant = decoyPick(sp.id);
    this.prop = sp.turn ? P.flipbomb(o) : sp.decoy ? P.decoy(o) : sp.bomb && !sp.hidden ? P.bomb(o) : P.paddle(o);
    mountProp(this.prop, this.hinge);
    const pp = this.prop.register(this); this.pBomb = pp[0]; this.pGood = pp[1] || null; this.cur = this.prop;
    if (sp.turn) {                                   // a turncoat starts plate side up, with a spare fuse spark for the tell
      this.prop.setFlip(1); this.parts[0] = this.pGood;
      if (this.prop.spark && this.prop.face2) { this.tick = noRay(this.prop.spark.clone()); this.tick.visible = false; this.tick.position.set(0.33, 0.56, 0.05); this.prop.face2.add(this.tick); }
    }
    if (sp.hidden) {                                 // the bomb behind: built now, out of sight, NOT a hit part yet
      this.hinge2 = new THREE.Group(); this.hinge2.position.z = -0.32; this.hinge.add(this.hinge2);
      this.hb = P.bomb({}); mountProp(this.hb, this.hinge2); this.pHidden = this.hb.register(this)[0]; this.parts.pop(); this.hinge2.visible = false;
    }
    this.group.visible = false;
  }
  place(Pz, t) {
    this.group.position.set(Pz.x, Pz.y, Pz.z); this.hinge.scale.setScalar(Pz.sz);
    const rattle = Pz.claw >= 0 ? 0.25 * Math.sin(Pz.claw * Math.PI * 3) * (1 - Pz.claw) : 0.018 * Math.sin(t * 37 + this.sp.id);
    this.hinge.rotation.set(Pz.claw >= 0 ? 0.12 * Math.sin(Pz.claw * Math.PI) : 0, 0, rattle);
  }
  update(lt, run) {
    const sp = this.sp, tl = run.timeline, sch = tl.sch, t = sp.t0 + lt; this.run = run;
    const rel = sp.chD ? releaseAt(sp, id => tl[id], hitOf) : sp.t0;
    RELT.set(sp, rel - sp.t0);
    if (t < rel && this.alive) { this.group.visible = false; this.shootable = false; this.lastT = t; return false; }
    const Pz = posAt(sp, t, rel, sch, this.P); this.lastT = t;
    if (this.revealT >= 0) return this.updateReveal(t, Pz);
    if (this.armT >= 0 && this.alive) return this.updateArm(t, Pz);
    this.place(Pz, t);
    if (!this.alive) {                               // shot: the empty stand tips over on the belt and is gone
      if (this.deadT < 0) this.deadT = t;
      const p = Math.min(1, (t - this.deadT) / 0.35);
      this.group.visible = Pz.vis && p < 1; this.cur.hide(); this.hinge.rotation.x = -(Math.PI / 2) * E.inCubic(p);
      return p >= 1 || Pz.done;
    }
    this.group.visible = Pz.vis; this.shootable = Pz.shoot;
    if (sp.turn) this.updateTurn(t, Pz);
    if (sp.decoy) this.prop.wobble(t - sp.t0);
    if (this.kind === 'bomb') this.prop.sparkle(t - sp.t0, !!sp.turn);
    if (!this.announced && Pz.vis && Pz.shoot) { this.announced = true; B.SFX.play('itemIn', { u: uOf(Pz.x), belt: Pz.b }); }
    return Pz.done;
  }
  // turncoat (the press stamped it): it comes out ticking (telegraph tel s: shake + fuse tick + sound), then flips (NOT
  // shootable during the flip), then a plain bomb; all from the stage time
  updateTurn(t, Pz) {
    const sp = this.sp, pr = this.prop, f = t - sp.turn, g = f < 0 ? 0 : f >= FLIP_T ? 1 : f / FLIP_T;
    pr.setFlip(1 - g);
    const plate = f < 0;
    this.kind = plate ? 'target' : 'bomb'; this.parts[0] = g < 0.5 ? this.pGood : this.pBomb;
    if (f >= 0 && f < FLIP_T) this.shootable = false;
    const w = t - (sp.turn - sp.tel), a = clamp(w / sp.tel, 0, 1);
    if (pr.face2) { pr.face2.rotation.z = plate && w >= 0 ? (0.06 + 0.13 * a) * Math.sin(w * (16 + 20 * a)) : 0; pr.face2.position.x = plate && w >= 0 ? 0.025 * a * Math.sin(w * 41) : 0; }
    if (this.tick) { const on = plate && w >= 0 && !Pz.hid && (a > 0.7 || ((w * (8 + 22 * a)) | 0) % 2 === 0); this.tick.visible = on; if (on) this.tick.scale.setScalar(1.1 + 0.9 * a); }
    if (plate && w >= 0 && !Pz.hid && Pz.vis) {
      const n = Math.min(2, Math.floor(a * 3)), u = uOf(Pz.x);
      if (!this.telAnn) {
        this.telAnn = true; this.telN = 0;
        if (this.tick) { this.group.updateMatrixWorld(true); T.sparks(new THREE.Vector3().setFromMatrixPosition(this.tick.matrixWorld), 5, ['lemon', 'yellow', 'orange'], 1.1, 0.03); }
        B.SFX.play('bombReveal', { u }); B.SFX.play('turnTick', { u, n: 0 });
      } else if (n > this.telN) { this.telN = n; B.SFX.play('turnTick', { u, n }); }
    }
    if (!plate) pr.setFuse(0.45);
  }
  // decoy build-up: it keeps riding, the disguise falls away, the bare bomb swells with a flaring fuse, then the bang
  updateArm(t, Pz) {
    const q = t - this.armT, k = Math.min(1, q / DECOY_UNMASK);
    this.shootable = false; this.group.visible = true; this.place(Pz, t);
    if (this.prop.unmask) this.prop.unmask(E.outCubic(k));
    this.prop.pivot.scale.setScalar(1 + 0.16 * E.inCubic(Math.min(1, q / DECOY_ARM)));
    this.prop.sparkle(t - this.sp.t0, true); if (this.prop.spark) this.prop.spark.scale.multiplyScalar(1.3 + 1.1 * Math.min(1, q / DECOY_ARM));
    if ((this.autoBoom && q >= DECOY_ARM - 1e-3) || q >= DECOY_ARM + 0.4) this.explode(this.boomPoint);
    return false;
  }
  arm(point, st) {
    if (!this.sp.decoy || this.revealT >= 0 || !this.alive) return -1;
    if (this.armT < 0) {
      this.armT = st != null ? st : this.lastT; this.shootable = false; this.boomPoint = point || null;
      this.group.updateMatrixWorld(true);
      if (this.prop.spark) T.sparks(new THREE.Vector3().setFromMatrixPosition(this.prop.spark.matrixWorld), 8, ['lemon', 'yellow', 'orange'], 1.5, 0.035);
      B.SFX.play('bombReveal', { u: uOf(this.group.position.x) });
    }
    return +(this.armT + DECOY_ARM).toFixed(4);
  }
  // the hidden bomb: the plate broke, the bomb behind springs up and rides on, sparking hot, for the beat; then tips over
  updateReveal(t, Pz) {
    const r = t - this.revealT; this.group.visible = Pz.vis; this.place(Pz, t);
    if (!this.alive) { if (this.deadT < 0) this.deadT = t; const p = Math.min(1, (t - this.deadT) / 0.35); this.hinge2.rotation.x = -(Math.PI / 2) * E.inCubic(p); this.hb.hide(); return p >= 1 || Pz.done; }
    const g = Math.min(1, r / HB_GRACE), d = Math.max(0, (r - HB_BEAT) / HB_LV);
    this.hinge2.position.z = -0.32 * (1 - E.outCubic(g));
    this.hinge2.rotation.x = -(Math.PI / 2) * E.inCubic(Math.min(1, d));
    this.hinge2.scale.setScalar(0.4 + 0.6 * E.outBack(g));
    this.shootable = r >= HB_GRACE && d < 0.7 && Pz.shoot;
    this.hb.sparkle(t, true); this.hb.spark.scale.multiplyScalar(1.45);
    return d >= 1 || Pz.done;
  }
  reveal() {
    this.revealT = this.lastT; this.alive = true; this.kind = 'bomb'; this.shootable = false; this.deadT = -1;
    this.parts = [this.pHidden]; this.hinge2.visible = true; this.hb.show(); this.cur = this.hb; this.stand.visible = true;
    this.group.visible = true; this.group.updateMatrixWorld(true);
    T.sparks(new THREE.Vector3().setFromMatrixPosition(this.hb.spark.matrixWorld), 7, ['lemon', 'yellow', 'orange'], 1.4, 0.035);
    B.SFX.play('bombReveal', { u: uOf(this.group.position.x) });
  }
  shatter(point, opts) {
    if (this.revealT >= 0 && !this.boom) return;     // a late hit confirmation for the plate (versus): the bomb stays
    super.shatter(point, opts);
    this.group.visible = true; this.cur.hide(); this.deadT = this.lastT;
    if (this.hb && this.revealT < 0) this.reveal();
  }
  explode(point) {
    if (this.sp.decoy && this.revealT < 0 && this.alive) {
      if (this.armT < 0) this.arm(point, null);
      if (this.lastT - this.armT < DECOY_ARM - 1e-3) { this.autoBoom = true; if (point) this.boomPoint = point; return; }
    }
    if (this.hb && this.revealT < 0) this.shatter(point);
    this.boom = true;
    const f = this.parts[0].mesh; f.updateMatrixWorld(true);
    const c = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    T.burst(c, 0.85);
    this.shatter(point || c, { power: 1.7, max: 60 });
    this.cur.pivot.scale.setScalar(1);
  }
}
// the director spawn: the klaxons, press slams and sorter swings (sounds + sparks), the FINALE (the press punches B.L.A.M.
// into a steel sheet that rolls out on the middle belt) and the stage's hold after the last item
class Floor extends T.Target {
  constructor(sp, run) { super('fx'); this.sp = sp; this.run = run; this.pt = -99; this.fin = -1; if (FIN.run !== run) { FIN.run = run; FIN.t = -1; } }
  meshes() { return []; }
  update(lt, run) {
    const sp = this.sp, sch = sp.sch, t = sp.t0 + lt, a = this.pt, live = run.state === 'play';
    if (live) {
      for (const r of sch.rev) if (a < r.t - REV_T && t >= r.t - REV_T) B.SFX.play('beltReverse', { u: 0.5, belt: r.b });
      for (const p of sch.press) if (a < p.t + PD && t >= p.t + PD) {
        B.SFX.play('pressDown', { u: 0.5 });
        if (inPlay()) { T.sparks(_w.set(PX - PHW, BELT[1].y + 0.1, PZF), 4, ['lemon', 'yellow', 'bone'], 1.2, 0.03); T.sparks(_w.set(PX + PHW, BELT[1].y + 0.1, PZF), 4, ['lemon', 'yellow', 'bone'], 1.2, 0.03); }
      }
      for (const e of sch.sort) if (a < e.tp - SW_IN && t >= e.tp - SW_IN) B.SFX.play('sorterArm', { u: uOf(e.s + Dof(sch.belts[e.b], e.tp)) });
    }
    if (this.fin < 0 && t >= sp.last && live && (run.versus || (run.me.hits >= run.cfg.quota && run.me.lives > 0))) { this.fin = t; FIN.run = run; FIN.t = t; }
    if (this.fin >= 0) {
      const f0 = a - this.fin, f1 = t - this.fin;
      if (f0 < F_IN + 0.08 && f1 >= F_IN + 0.08) {
        B.SFX.play('sheetStamp', { u: 0.5 });
        if (inPlay()) { for (const x of [-1, -0.3, 0.3, 1]) T.sparks(_w.set(x, BELT[1].y + 0.2, PZF), 5, ['lemon', 'yellow', 'orange', 'bone'], 1.8, 0.035); if (B.G && B.G.shakeIt) B.G.shakeIt(0.25); }
      }
      if (f0 < F_IN + 0.75 && f1 >= F_IN + 0.75) B.SFX.play('finale');
    }
    this.pt = t;
    return t >= sp.last + (this.fin >= 0 ? FIN_HOLD : 1.0);
  }
}
function makeTarget(sp, run) { return sp.kind === 'floor' ? new Floor(sp, run) : new Item(sp, run); }

// =========================================================================================
// The dials per tier (variant 0). time = the director's stream (the clock adds FIN_SLOT) | ride = s for an item to cross the
// visible belt at the MID speed (slow x1.4, fast x0.72: the pop window) | live = items shootable at once | gap / burst / bgap
// / pause = the stream | hop / alt / adj = AIM TRAVEL | decep = a single is a bomb, kinds [plain, decoy, hidden], bombCap |
// trick = a beat is a pattern; beat (row), snake, pp (ping-pong) s | waves = belt speed / direction changes | rev = belt
// reversals per round | press = s between slams, hold = s down, turnP = a press item comes out a turncoat, tel = its
// telegraph | sorts = sorter moves per round, sortT = s in the claw | spare / share / rel
// =========================================================================================
// Insane ride 0.72 -> 0.83 (fast belt 0.52 -> 0.60 s) by the manager after the solver: a slow bot failed 42 of 90 Insane runs at 0.52 (Jon to confirm)
const TIER_P = [
  { time: 46, ride: 1.95, live: 4, gap: [0.5, 0.9], burst: 0.22, bgap: [0.32, 0.48], pause: [0.7, 1.1], hop: [0.12, 0.38], alt: 0.25, adj: 0.12,
    decep: 0.15, kinds: [0.45, 0.35, 0.2], bombCap: 0.2, trick: 0.28, beat: 0.62, snake: 0.7, pp: 0.75,
    waves: 3, rev: [1, 1], press: [5.5, 7.5], hold: 0.9, turnP: 0.35, tel: 0.4, sorts: [2, 3], sortT: 0.62, spare: 8, share: 0.55, rel: 0.75 },
  { time: 42, ride: 1.5, live: 4, gap: [0.5, 0.85], burst: 0.26, bgap: [0.3, 0.45], pause: [0.75, 1.1], hop: [0.28, 0.52], alt: 0.45, adj: 0.15,
    decep: 0.2, kinds: [0.4, 0.38, 0.22], bombCap: 0.27, trick: 0.31, beat: 0.5, snake: 0.56, pp: 0.6,
    waves: 3, rev: [1, 2], press: [4.6, 6.2], hold: 0.8, turnP: 0.42, tel: 0.35, sorts: [3, 3], sortT: 0.56, spare: 5, share: 0.6, rel: 0.7 },
  { time: 38, ride: 1.1, live: 3, gap: [0.55, 0.9], burst: 0.3, bgap: [0.28, 0.4], pause: [0.75, 1.1], hop: [0.42, 0.72], alt: 0.65, adj: 0.17,
    decep: 0.26, kinds: [0.36, 0.4, 0.24], bombCap: 0.33, trick: 0.34, beat: 0.42, snake: 0.46, pp: 0.5,
    waves: 4, rev: [2, 2], press: [3.8, 5.2], hold: 0.7, turnP: 0.5, tel: 0.3, sorts: [3, 4], sortT: 0.5, spare: 3, share: 0.64, rel: 0.62 },
  { time: 34, ride: 0.83, live: 3, gap: [0.75, 1.15], burst: 0.3, bgap: [0.26, 0.36], pause: [0.85, 1.25], hop: [0.58, 0.95], alt: 0.85, adj: 0.2,
    decep: 0.32, kinds: [0.32, 0.42, 0.26], bombCap: 0.38, trick: 0.37, beat: 0.36, snake: 0.38, pp: 0.42,
    waves: 4, rev: [2, 3], press: [3.2, 4.4], hold: 0.6, turnP: 0.6, tel: 0.25, sorts: [4, 5], sortT: 0.45, spare: 2, share: 0.62, rel: 0.55 }
];
const VARIANT_NAMES = ['ASSEMBLY', 'OVERTIME', 'NIGHT SHIFT'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.ride = +(b.ride * [1, 0.85, 0.95][v]).toFixed(3);          // OVERTIME: faster belts
  c.decep = +(b.decep + 0.02 * v).toFixed(3); c.trick = +(b.trick + 0.02 * v).toFixed(3);
  c.share = Math.min(0.9, b.share + 0.02 * v - (v ? 0.05 : 0));
  c.time = b.time + FIN_SLOT; c.finSlot = FIN_SLOT;
  c.quota = 8; c.autoReload = false; c.decoy = true; c.hiddenBomb = true; c.turncoat = true; c.patterns = true; c.reverse = true; c.sorter = true; c.stamp = true;
  c.ammo = ['unlimited', { mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: false }][v];
  c.tier = tier; c.variant = v; c.title = 'CONVEYOR'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
const AIM_KY = 1.8, SIDE_DZ = 20;
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
const isReq = s => s.kind === 'item' && (!s.bomb || !!s.hidden);
const isReal = s => s.kind === 'item' && !s.bomb;
const r3 = x => +x.toFixed(3), r4 = x => +x.toFixed(4);

// ---------- the belt schedule (pure in the rng) ----------
function buildSched(c, rng, TIME) {
  const nW = c.waves, wl = TIME / nW, waves = [];
  for (let w = 1; w < nW; w++) waves.push(r3(w * wl + rng.range(-0.5, 0.5)));
  const W = [];
  for (let w = 0; w < nW; w++) {
    const f = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = rng.int(0, i); const x = f[i]; f[i] = f[j]; f[j] = x; }
    const d = [0, 1, 2].map(() => rng() < 0.5 ? -1 : 1);
    if (d[0] === d[1] && d[1] === d[2]) d[rng.int(0, 2)] *= -1;
    W.push({ f, d });
  }
  const nr = rng.int(c.rev[0], c.rev[1]), rev = [];
  for (let tries = 0; rev.length < nr && tries < 80; tries++) {
    const t = r3(rng.range(5, TIME - 3)), b = rng.int(0, 2);
    if (waves.some(tw => t > tw - 2.4 && t < tw + 1.6)) continue;
    if (rev.some(r => Math.abs(r.t - t) < 5)) continue;
    rev.push({ t, b });
  }
  rev.sort((a, b) => a.t - b.t);
  const belts = [];
  for (let b = 0; b < 3; b++) {
    const vOf = w => r4(W[w].d[b] * 2 * BELT[b].shootX / (c.ride * SPD[W[w].f[b]]));
    let v = vOf(0); const k = [[-6, v, 0]];
    const ev = waves.map((t, i) => ({ t, w: i + 1 })).concat(rev.filter(r => r.b === b).map(r => ({ t: r.t }))).sort((a, q) => a.t - q.t);
    for (const e of ev) {
      if (e.w) { const nv = vOf(e.w); k.push([e.t, v, 1], [r3(e.t + WRAMP), nv, 1]); v = nv; }
      else { k.push([e.t, v, 2], [r3(e.t + REV_R), -v, 2]); v = -v; }
    }
    const cum = [0]; for (let i = 1; i < k.length; i++) cum.push(cum[i - 1] + (k[i][0] - k[i - 1][0]) * (k[i][1] + k[i - 1][1]) / 2);
    belts.push({ k, c: cum });
  }
  const press = [];
  for (let t = rng.range(3, 5); t < TIME - 1.5; t += rng.range(c.press[0], c.press[1])) press.push({ t: r3(t), h: r3(c.hold * rng.range(0.9, 1.1)) });
  return { belts, press, rev, waves, sort: [] };
}

// ---------- timeline: the DIRECTOR. Every spawn from the seeded rng only. ----------
// 1. The schedule: per wave each belt's speed (slow / mid / fast, shuffled) and direction (never all one way); reversals
//    (tier count, never near a wave change, >= 5 s apart); press slams. Belts are empty through a wave change (the lull).
// 2. Beats: a single, a burst of 2-3, or a pattern; anticipation pauses. A single: the fair bomb rules pick its kind, the
//    AIM rule picks its belt (the mouth it rides out of, by the wanted hop from the last plate you were made to aim at;
//    belt heights count as vertical travel x1.8). Items never overlap on a belt (rigid belt coordinates). Forced beats:
//    a plate timed to be leading across a belt when it reverses, a middle-belt item timed under each press slam (it may
//    come out a turncoat), the planned sorter moves.
// 3. Patterns take the belts to themselves: ROW (R, shot-driven), STACK (K), SNAKE via the sorter (S), PING-PONG (P,
//    shot-driven), THE WALL (W). Reload-aware entries on the magazine variants.
// Spawn fields: item { b, s (belt coord: x = s + D(t)), m (entry x), dir, ra / span (shootable from / for, s), gone (s
//    from release to inside the far housing), bomb, decoy, hidden, turn / tel, so { tp, tm, b2, s2 }, pat, patKind, pi,
//    trick, chD / chS / chX / chR }; floor { last, sch }. The array carries the schedule as a non-enumerable .sch.
function timeline(c, rng) {
  rng(); rng(); rng();
  const out = [], TIME = c.time - (c.finSlot || 0), tier = c.tier | 0;
  const sch = buildSched(c, rng, TIME);
  const Dt = (b, t) => Dof(sch.belts[b], t), Vt = (b, t) => vAt(sch.belts[b], t);
  const items = [], occ = [];
  const magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0;
  let bombs = 0, lastAim = null, xUntil = 0, nTrick = 0, lastTrick = '', reqN = 0, lastReqIn = -9;
  const count = {}, used = k => count[k] || 0;
  const free = (b, s, a, e) => !occ.some(o => o.b === b && o.a < e + 0.05 && o.e > a - 0.05 && (o.all || Math.abs(o.s - s) < BELT[b].gap));
  const keyIn = (b, a, e, types) => sch.belts[b].k.some(k => k[0] > a - 0.7 && k[0] < e + 0.15 && types.includes(k[2]));
  const revNear = (b, t) => sch.rev.some(r => r.b === b && t > r.t - REV_T - 0.15 && t < r.t + REV_R + 0.15);
  const nomRide = b => 2 * BELT[b].shootX / Math.abs(Vt(b, 0) || 1);
  const minSpan = () => 0.5 * c.ride;
  // the shootable window of an item at belt coord s from t0: { tIn, tOut, gone } (null: never comes out)
  function rideOf(b, s, t0) {
    const Bb = BELT[b]; let tIn = -1, tOut = -1;
    for (let i = 0; i < 1500; i++) {
      const t = t0 + i * 0.01, ax = Math.abs(s + Dt(b, t));
      if (tIn < 0) { if (ax <= Bb.shootX) tIn = t; else if (ax > Bb.mouth + 0.05) return null; continue; }
      if (tOut < 0) { if (ax > Bb.shootX) tOut = t; continue; }
      if (ax >= Bb.mouth) return { tIn, tOut, gone: t };
    }
    return null;
  }
  // where a committed item is at t (belt, x) or null
  function whereAt(it, t) {
    if (t < it.t0 || t > it._gone) return null;
    if (it.so && t >= it.so.tp) { if (t < it.so.tp + it.so.tm) return null; return [it.so.b2, it.so.s2 + Dt(it.so.b2, t)]; }
    return [it.b, it.s + Dt(it.b, t)];
  }
  const upAt = t => items.filter(i => i._in <= t && i._out > t);
  const trailing = () => { let n = 0; for (let i = items.length - 1; i >= 0 && items[i].bomb && !items[i].hidden; i--) n++; return n; };
  const lastPlain = () => { const s = items[items.length - 1]; return !!s && s.bomb && !s.hidden && !s.decoy; };
  const pressHideAt = (x, t) => Math.abs(x - PX) < PHW && pressK(sch, t) > 0.5;
  // the sorter: pick the item at tp (early in its ride) and drop it on another belt where it fits and rides clear
  function trySort(b, s, t, r) {
    const tm = c.sortT;
    for (const fr of [0.3, 0.45, 0.2]) {
      const tp = r3(r.tIn + fr * (r.tOut - r.tIn));
      if (tp - r.tIn < 0.22) continue;
      if (sch.sort.some(e => tp - SW_IN - 0.15 < e.tp + e.tm + SW_OUT && e.tp - SW_IN - 0.15 < tp + tm + SW_OUT)) continue;
      const xp = s + Dt(b, tp);
      if (b === 1 && pressHideAt(xp, tp)) continue;
      const dests = [0, 1, 2].filter(q => q !== b && Math.abs(xp) <= BELT[q].shootX - 0.6);
      if (dests.length > 1 && rng() < 0.5) dests.reverse();
      for (const b2 of dests) {
        const t2 = r3(tp + tm), s2 = r4(xp - Dt(b2, t2));
        if (Math.abs(Vt(b2, t2)) < 1) continue;
        const r2 = rideOf(b2, s2, t2); if (!r2 || r2.tOut - t2 < 0.35 || r2.gone > TIME + 0.4) continue;
        if (keyIn(b2, t2, r2.gone, [1])) continue;
        if (!free(b2, s2, t2, r2.gone)) continue;
        return { tp, tm, b2, s2, r2 };
      }
    }
    return null;
  }
  // build + commit ONE item entering at t (o: belt, kind, sort, press, steady, noGate, D (wanted hop), single). null: no room
  function place(t, o = {}) {
    let kind = o.kind || 'plate';
    const req = kind === 'plate' || kind === 'hidden';
    const gate = magN && req && !o.noGate && reqN > 0 && reqN % magN === 0;
    const cands = [];
    for (let b = 0; b < 3; b++) {
      if (o.belt != null && b !== o.belt) continue;
      if (kind === 'hidden' && b !== 2) continue;
      if (!o.force && revNear(b, t)) continue;
      const v = Vt(b, t); if (Math.abs(v) < 1) continue;
      const dir = v > 0 ? 1 : -1, m = -dir * BELT[b].mouth, s = r4(m - Dt(b, t));
      const r = rideOf(b, s, t); if (!r) continue;
      if (req && r.tOut - r.tIn < minSpan()) continue;
      if (r.gone > TIME + 0.4) continue;
      if (keyIn(b, t, r.gone, o.steady ? [1, 2] : [1])) continue;
      if (!free(b, s, t, r.gone)) continue;
      if (gate && r.tIn < lastReqIn + c.rel + 0.3) continue;
      const ta = Math.min(r.tIn + 0.25, r.tOut), x = s + Dt(b, ta), p = scr(x, BELT[b].fy, BELT[b].z);
      let sc = 0;
      if (o.D != null && lastAim) {
        sc = Math.abs(hyp(p[0] - lastAim[0], AIM_KY * (p[1] - lastAim[1])) - o.D) / CD;
        const sd = q => q < CX - SIDE_DZ ? -1 : q > CX + SIDE_DZ ? 1 : 0;
        if (sd(p[0]) * sd(lastAim[0]) > 0) sc += 0.35 * c.alt;
        if ((p[1] < CY) === (lastAim[1] < CY)) sc += 0.2 * c.alt;
        for (const it of items) { const w = whereAt(it, ta); if (!w || w[0] === b) continue; const q = scr(w[1], BELT[w[0]].fy, BELT[w[0]].z); if (hyp(q[0] - p[0], q[1] - p[1]) < c.adj * CD) sc += 2; }
        if (gate) sc -= 0.3 * (r.tOut - r.tIn);
        sc += rng() * 0.1;
      }
      cands.push({ sc, b, dir, m, s, r, p });
    }
    if (!cands.length) return null;
    cands.sort((x, y) => x.sc - y.sc || x.b - y.b);
    const C = cands[0], r = C.r;
    const sp = { id: 0, t0: r3(t), t1: 0, kind: 'item', b: C.b, s: C.s, m: r4(C.m), dir: C.dir, ra: r3(r.tIn - t), span: r3(r.tOut - r.tIn), gone: r3(r.gone - t), bomb: false };
    if (kind === 'bomb') sp.bomb = true; else if (kind === 'decoy') { sp.bomb = true; sp.decoy = true; } else if (kind === 'hidden') { sp.bomb = true; sp.hidden = true; }
    let gone = r.gone, out = r.tOut;
    // the PRESS: a plate passing under a slam may come out ticking (the turncoat)
    if (kind === 'plate' && C.b === 1 && !o.noTurn) {
      // it ticks on its way in (the telegraph, still a plate: +50), flips UNDER the head (hidden: nothing to hit) and rides
      // out the other side a lit bomb
      let th = -1, te = -1;
      for (let q = r.tIn; q < r.tOut; q += 0.01) { const h = pressHideAt(C.s + Dt(1, q), q); if (h && th < 0) th = q; if (!h && th >= 0) { te = q; break; } }
      const tel = c.tel;
      if (th > 0 && te > 0 && rng() < (o.press ? c.turnP : c.turnP * 0.3) && th - tel >= r.tIn - 0.05 && te + 0.2 <= r.tOut) { sp.turn = r3(th + 0.01); sp.tel = tel; out = sp.turn; }
    }
    // the SORTER
    let so = null;
    if (o.sort && kind !== 'hidden' && !sp.turn) so = trySort(C.b, C.s, t, r);
    if (so) {
      sp.so = { tp: so.tp, tm: so.tm, b2: so.b2, s2: so.s2 }; gone = so.r2.gone; out = so.r2.tOut;
      sp.gone = r3(gone - t); sp.span = r3(so.r2.tOut - r.tIn);
      occ.push({ b: C.b, s: C.s, a: t, e: so.tp + 0.05 }, { b: so.b2, s: so.s2, a: so.tp + so.tm, e: gone });
      sch.sort.push({ tp: so.tp, tm: so.tm, b: C.b, s: C.s, b2: so.b2, s2: so.s2 });
    } else occ.push({ b: C.b, s: C.s, a: t, e: gone });
    sp.t1 = r3(gone + 0.4);
    Object.defineProperty(sp, '_in', { value: r.tIn, writable: true }); Object.defineProperty(sp, '_out', { value: out, writable: true }); Object.defineProperty(sp, '_gone', { value: gone, writable: true });
    if (gate || (magN && req && reqN > 0 && reqN % magN === 0)) sp._relB = true;
    items.push(sp);
    if (sp.bomb && !sp.hidden) bombs++;
    if (req) { reqN++; lastReqIn = r.tIn; const w = so ? [so.b2, so.s2 + Dt(so.b2, so.tp + so.tm + 0.25)] : [C.b, C.s + Dt(C.b, r.tIn + 0.25)]; lastAim = scr(w[1], BELT[w[0]].fy, BELT[w[0]].z); }
    return sp;
  }
  // a single at t: the fair-bomb rules pick the kind
  function single(t, o = {}) {
    const roll = rng(), tyR = rng(), D = rng.range(c.hop[0], c.hop[1]) * CD;
    let kind = o.kind || 'plate';
    if (!o.kind && items.length > 1 && roll < c.decep && trailing() < 2 && bombs + 1 <= c.bombCap * (items.length + 1) + 0.5) {
      const up = upAt(t + 0.3), goodUp = up.filter(s => !s.bomb || s.hidden).length, bombsUp = up.length - goodUp;
      if (bombsUp <= goodUp) { let ty = pickW(c.kinds, tyR); if (ty === 0 && lastPlain()) ty = 1; kind = ['bomb', 'decoy', 'hidden'][ty]; }
    }
    let sp = place(t, Object.assign({ D }, o, { kind }));
    if (!sp && kind === 'hidden') sp = place(t, Object.assign({ D }, o, { kind: 'decoy' }));
    if (sp) count['single_' + kind] = used('single_' + kind) + 1;
    return sp;
  }
  // ---- transactions for the patterns (roll back the partial commits on failure)
  const mark = () => ({ i: items.length, o: occ.length, s: sch.sort.length, bombs, lastAim, reqN, lastReqIn });
  const undo = M => { items.length = M.i; occ.length = M.o; sch.sort.length = M.s; bombs = M.bombs; lastAim = M.lastAim; reqN = M.reqN; lastReqIn = M.lastReqIn; return 0; };
  function finish(mem, kind, sub) {
    const pi = nTrick++;
    mem.forEach((m, j) => { m.pat = pi; m.patKind = kind; m.pi = j; if (sub) m.trick = sub; });
    count[kind] = used(kind) + 1; count[kind + ':' + sub] = used(kind + ':' + sub) + 1; lastTrick = kind;
    return Math.max(...mem.map(m => m._gone));
  }
  // steady entry time on belt b so the item is at x at time tx (null if the belt is not steady / moving away)
  function entryFor(b, x, tx) {
    const v = Vt(b, tx); if (Math.abs(v) < 1) return null;
    const m = -(v > 0 ? 1 : -1) * BELT[b].mouth, te = tx - (x - m) / v;
    return te;
  }
  // ROW on one belt: 3-5 out of the same tunnel on a beat (shot-driven); first clean; later a decoy on the beat / off beat
  function row(s0) {
    const M = mark(), N = rng.int(3, 5), b = rng.int(0, 2), sr = rng();
    const sub = !used('R') ? 'beat' : sr < 0.3 ? 'beat' : sr < 0.65 ? 'decoy' : 'off';
    const v = Math.abs(Vt(b, s0)); if (v < 1) return 0;
    const beat = Math.max(c.beat, BELT[b].gap / v + 0.03), dm = sub === 'decoy' ? rng.int(2, N - 1) : -1, early = rng() < 0.5;
    const mem = []; let t = s0;
    for (let i = 0; i < N; i++) {
      if (i && sub === 'off' && i === 3) t += early ? Math.max(beat * 0.55, BELT[b].gap / v + 0.03) : beat * 1.9; else if (i) t += beat;
      const sp = place(t, { belt: b, kind: i === dm ? 'decoy' : 'plate', steady: true, noGate: true, noTurn: true }); if (!sp) return undo(M);
      mem.push(sp);
    }
    mem.seq = true; return finish(mem, 'R', sub === 'off' && N < 4 ? 'beat' : sub);
  }
  // STACK: one column across the three belts (front, middle, back) at the same x and moment; later the top one may be a decoy
  function stack(s0) {
    const M = mark(), x = rng.range(-0.45, 0.45) * BELT[0].shootX, bad = used('K') && rng() < 0.35 + 0.08 * tier;
    let tx = 0; for (let b = 0; b < 3; b++) { const te = entryFor(b, x, s0 + 2.5); if (te == null) return 0; tx = Math.max(tx, s0 + 2.5 - te); }
    tx = s0 + tx + 0.05;
    const mem = [];
    for (let b = 0; b < 3; b++) {
      const te = entryFor(b, x, tx); if (te == null || te < s0 - 0.01) return undo(M);
      const sp = place(te, { belt: b, kind: b === 2 && bad ? (rng() < 0.6 ? 'decoy' : 'bomb') : 'plate', steady: true, noGate: true, noTurn: true }); if (!sp) return undo(M);
      mem.push(sp);
    }
    return finish(mem, 'K', bad ? '+' + (mem[2].decoy ? 'decoy' : 'bomb') : 'clean');
  }
  // SNAKE: one after another, belt to belt (front, middle, back, middle, front...), the sorter lifts one of them across to
  // the next belt mid-ride; the last one a bomb / decoy sometimes
  function snake(s0) {
    const M = mark(), n = tier >= 3 ? 6 : tier === 2 && rng() < 0.5 ? 6 : 5, up = rng() < 0.5, path = [];
    for (let i = 0; i < n; i++) { const k = i % 4; path.push(up ? [0, 1, 2, 1][k] : [2, 1, 0, 1][k]); }
    const lastBad = rng() < 0.3 + 0.08 * tier, lastDecoy = rng() < 0.6, si = rng.int(1, n - 2);
    const mem = []; let t = s0;
    for (let i = 0; i < n; i++) {
      const bad = i === n - 1 && lastBad;
      let sp = null;
      for (let d = 0; !sp && d < 6; d++) sp = place(t + d * 0.12, { belt: path[i], kind: bad ? (lastDecoy ? 'decoy' : 'bomb') : 'plate', sort: i === si, noGate: true, noTurn: true });
      if (!sp) return undo(M);
      mem.push(sp); t = sp.t0 + c.snake;
    }
    const L = mem[n - 1];
    return finish(mem, 'S', (mem.some(m => m.so) ? 'sort' : 'plain') + (L.bomb ? (L.decoy ? '+decoy' : '+bomb') : ''));
  }
  // PING-PONG: front and back belt by turns (shot-driven), then a bomb on the belt whose turn it is (a decoy sometimes)
  function pingpong(s0) {
    const M = mark(), N = rng.int(4, 6), first = rng() < 0.5 ? 0 : 2, dec = rng() < 0.2 + 0.07 * tier, mem = [];
    for (let i = 0; i <= N; i++) {
      const b = i & 1 ? 2 - first : first, last = i === N;
      const sp = place(s0 + i * c.pp, { belt: b, kind: last ? (dec ? 'decoy' : 'bomb') : 'plate', steady: true, noGate: true, noTurn: true }); if (!sp) return undo(M);
      mem.push(sp);
    }
    mem.seq = true; return finish(mem, 'P', dec ? 'decoy' : 'bomb');
  }
  // THE WALL: 6-8 at once across the three belts (2-3 per belt riding in as a train), 1-3 decoys among them
  function wall(s0) {
    const M = mark(), n = [2 + (rng() < 0.4 ? 1 : 0), 2 + (rng() < 0.5 ? 1 : 0), 2 + (rng() < 0.6 ? 1 : 0)];
    for (let b = 0; b < 3; b++) { const sp = 2 * BELT[b].shootX / Math.max(1, Math.abs(Vt(b, s0 + 2))); n[b] = Math.max(1, Math.min(n[b], Math.round(sp / 0.42))); }   // a fast belt carries fewer
    const tot = n[0] + n[1] + n[2]; if (tot < 5) return 0;
    const nd = Math.max(1, Math.min(tot - 4, rng.int(1, tier >= 2 ? 3 : 2))), dset = new Set(); while (dset.size < nd) dset.add(rng.int(0, tot - 1));
    let tx = 0; const want = [];
    for (let b = 0; b < 3; b++) for (let j = 0; j < n[b]; j++) {
      const v = Vt(b, s0 + 2), dir = v > 0 ? 1 : -1, x = dir * BELT[b].shootX * (0.72 - 1.44 * j / Math.max(1, n[b] - 1));
      want.push([b, x]); const te = entryFor(b, x, s0 + 3); if (te == null) return 0; tx = Math.max(tx, s0 + 3 - te);
    }
    tx = s0 + tx + 0.05;
    const mem = [];
    const ord = want.map((w, i) => [entryFor(w[0], w[1], tx), i]).sort((a, b) => a[0] - b[0]);
    for (const [te, i] of ord) {
      if (te == null) return undo(M);
      const sp = place(te, { belt: want[i][0], kind: dset.has(i) ? 'decoy' : 'plate', steady: true, noGate: true, noTurn: true }); if (!sp) return undo(M);
      mem.push(sp);
    }
    return finish(mem, 'W', nd + 'decoy');
  }
  const TRICKS = { R: row, K: stack, S: snake, P: pingpong, W: wall };
  const TW = { R: 1.5, K: 0.9, S: 0.9, P: 1.0, W: 0.55 }, CAP = { W: tier < 2 ? 1 : 2 };
  const pause = () => rng.range(c.pause[0], c.pause[1]);
  // forced beats
  const revQ = sch.rev.slice(), pressQ = sch.press.filter(p => p.t > 2), sortQ = [];
  { const n = rng.int(c.sorts[0], c.sorts[1]); for (let j = 0; j < n; j++) sortQ.push(TIME * (j + 0.3 + rng.range(0, 0.4)) / n); }
  const nSortGoal = sortQ.length;
  let t = 0.6, guard = 0;
  while (guard++ < 3000 && t < TIME - 0.6) {
    if (t < xUntil) { t = xUntil; continue; }
    // a plate leading across a belt as it reverses
    if (revQ.length) {
      const rv = revQ[0], b = rv.b, te = entryFor(b, -0.15 * Math.sign(Vt(b, rv.t - REV_T - 0.2) || 1) * BELT[b].shootX, rv.t);
      if (te == null || te < t - 0.8) { revQ.shift(); continue; }
      if (te <= t + 0.2) { revQ.shift(); const sp = single(te, { belt: b, force: true, kind: rng() < 0.75 ? 'plate' : undefined }); if (sp) { count.revItem = used('revItem') + 1; t = Math.max(t, sp.t0) + rng.range(c.gap[0], c.gap[1]); } continue; }
    }
    // an item timed under a press slam (a plate may come out a turncoat)
    if (pressQ.length) {
      const pe = pressQ[0], te = entryFor(1, PX, pe.t + PD + pe.h * 0.5);
      if (te == null || te < t - 0.8) { pressQ.shift(); continue; }
      if (te <= t + 0.2) { pressQ.shift(); const sp = single(te, { belt: 1, press: true }); if (sp) { count.pressItem = used('pressItem') + 1; if (sp.turn) count.turn = used('turn') + 1; t = Math.max(t, sp.t0) + rng.range(c.gap[0], c.gap[1]); } continue; }
    }
    const up = upAt(t + 0.3);
    if (up.length >= c.live) { t = up.map(s => s._out).sort((a, b) => a - b)[up.length - c.live] + 0.02; continue; }
    const trR = rng(), burR = rng();
    if (items.length >= 2 && trR < c.trick && t < TIME - 5) {
      let s0 = t; for (const it of items) s0 = Math.max(s0, it._gone - 0.6);   // the belts to themselves (an anticipation pause)
      const W = Object.assign({}, TW); if (lastTrick) W[lastTrick] *= 0.15;
      for (const k in CAP) if (used(k) >= CAP[k]) W[k] = 0;
      let e = 0;
      for (let tries = 0; !e && tries < 3; tries++) { const keys = Object.keys(W), k = keys[pickW(keys.map(q => W[q]), rng())]; if (!W[k]) break; e = TRICKS[k](s0); W[k] = 0; }
      if (e) { xUntil = e - 0.4; t = Math.max(t, e - 0.4) + pause(); continue; }
    }
    const n = burR < c.burst ? 2 + (rng() < 0.4 ? 1 : 0) : 1;
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const wantSort = sortQ.length && t >= sortQ[0];
      const sp = single(t, { sort: wantSort });
      if (!sp) break;
      if (sp.so) sortQ.shift();
      placed++; if (i < n - 1) t += rng.range(c.bgap[0], c.bgap[1]);
    }
    if (!placed) { t += 0.2; continue; }
    t += placed > 1 ? pause() : rng.range(c.gap[0], c.gap[1]);
  }
  // ---- #88 SHOT-DRIVEN rows / ping-pongs: the clock schedule becomes the fallback (chR); t0 = the earliest release
  const seqs = new Map(); for (const s of items) if (s.pat != null && (s.patKind === 'R' || s.patKind === 'P')) { if (!seqs.has(s.pat)) seqs.set(s.pat, []); seqs.get(s.pat).push(s); }
  for (const mem of seqs.values()) {
    mem.sort((a, b) => a.pi - b.pi);
    const S0 = mem.map(m => m.t0); let early = S0[0];
    for (let i = 1; i < mem.length; i++) {
      const m = mem[i], p = mem[i - 1], v = Math.abs(Vt(m.b, S0[i])), dS = r3(S0[i] - S0[i - 1]);
      const lead = m.b === p.b ? Math.max(REL_LEAD, (BELT[m.b].gap - p.ra * Math.abs(Vt(p.b, S0[i - 1]))) / v + 0.03) : REL_LEAD;
      m.chS = dS; m.chX = r3(lead + (m._relB ? c.rel : 0));
      early = Math.min(S0[i], early + p.ra + m.chX);
      m._chP = p; m.chR = r3(S0[i] - early); m.t0 = r3(early);
      m.t1 = r3(S0[i] + m.gone + 0.4);
    }
    // the belts are booked for the whole pattern (members may ride out earlier than scheduled)
  }
  // ---- the director spawn
  const last = items.reduce((a, s) => Math.max(a, s._gone), 0);
  const floor = { id: 0, t0: 0, t1: r3(last + 0.3 + FIN_HOLD), kind: 'floor', last: r3(last + 0.3), sch };
  out.push(...items, floor);
  out.sort((a, b) => a.t0 - b.t0 || (a.kind === 'floor' ? -1 : b.kind === 'floor' ? 1 : 0));
  out.forEach((s, i) => { s.id = i; });
  for (const s of out) if (s._chP) { s.chD = s.id - s._chP.id; delete s._chP; }
  for (const s of out) { delete s._relB; TLOF.set(s, out); }
  Object.defineProperty(out, 'sch', { value: sch, enumerable: false });
  const good = items.filter(isReal).length;
  c.goodCount = good; c.bombCount = items.filter(s => s.bomb && !s.hidden).length; c.itemCount = items.length;
  c.tricks = count; c.sorts = sch.sort.length; c.sortGoal = nSortGoal; c.revs = sch.rev.length; c.presses = sch.press.length;
  c.quota = Math.max(4, Math.min(good - c.spare, Math.round(good * c.share)));
  return out;
}
// points: by how early in its ride you hit it (300 / 200 / 150 / 100 by quarters of the shootable ride), +50 for a plate
// shot in the press's shadow (under the head on the middle belt), +50 a turncoat before it turns. points() is the engine's
// only call on an awarded hit: it records the SHARED hit stage time (the shot-driven releases read it)
function points(sp, lt) {
  const st = +(sp.t0 + lt).toFixed(4);
  HIT.set(sp, st);
  if (sp.kind !== 'item') return 0;
  const tl = TLOF.get(sp), rel = sp.chD && tl ? releaseAt(sp, id => tl[id], hitOf) : sp.t0;
  const f = (st - rel - sp.ra) / Math.max(0.05, sp.span);
  let pts = f < 0.25 ? 300 : f < 0.5 ? 200 : f < 0.75 ? 150 : 100;
  if (sp.turn && st < sp.turn) pts += 50;
  if (tl && tl.sch) { const Pz = posAt(sp, st, rel, tl.sch, {}); if (Pz.b === 1 && Pz.claw < 0 && Math.abs(Pz.x - PX) < PHW + 0.05 && !Pz.hid) pts += 50; }
  return pts;
}
function briefing(c) {
  const HINTS = ['THE TUNNELS TELL YOU WHERE THEY COME OUT!', 'KLAXON = THAT BELT RUNS BACKWARDS!', 'TICKING OUT OF THE PRESS = A BOMB!', 'THE CLAW CAN DROP A BOMB IN YOUR ROW!'];
  const spare = Math.max(0, (c.goodCount || c.quota) - c.quota);
  const room = spare <= 0 ? 'NO ROOM FOR ERROR!' : 'ROOM FOR ERROR: ' + spare + (spare === 1 ? ' PLATE' : ' PLATES');
  return { rule: [['SHOOT ', 'void'], [c.quota + ' PLATES', 'red'], [' OR MORE!', 'void']], icon: 'belt', unit: 'PLATES',
    dont: 'bomb', tip: 'WATCH THE BELTS. THEY REVERSE!', room, spare, spareUnit: 'plates', hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}
// briefing card icon: a plate standing on a running belt (the slats roll under it)
function drawIcon(cx, cy, r, t = 0) {
  const H = B.HUD, k = Math.ceil(r) + 2, ph = Math.floor(((t * 1.5) % 1) * 4);
  H.draw(H.pixImg('belt' + r + '_' + ph, 2 * k + 1, 2 * k + 1, (x, y) => {
    const px = x - k, py = y - k, by0 = Math.round(0.55 * r), by1 = Math.round(0.88 * r);
    if (py >= by0 && py <= by1 && Math.abs(px) <= r) { if (py === by0 || py === by1 || Math.abs(px) === Math.round(r)) return 'void'; if (py === by0 + 1) return 'steel'; return (((px + 64 - ph) >> 1) & 1) ? 'slate' : 'navy'; }
    const a = 0.6 * r, hy = py + 0.22 * r, hx = Math.abs(px), hv = Math.max(Math.abs(hy), hx * 0.866 + Math.abs(hy) * 0.5);
    if (hx <= 0.7 && hy > a && py < by0) return 'steel';
    if (hv <= a + 1) {
      if (hv > a - 0.4) return 'void';
      const d = Math.hypot(px, hy) / a;
      return d < 0.22 ? 'yellow' : d < 0.38 ? 'void' : d < 0.52 ? 'lime' : d < 0.66 ? 'void' : 'lime';
    }
    return null;
  }), cx - k, cy - k);
}
// the miss ricochet colours (core/fx.js reads B.FX.ricochetColors[stageId]): steel sparks off machinery
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors[ID] = { hot: ['lemon', 'amber', 'bone', 'yellow'], flakes: ['steel', 'haze', 'slate'], pop: 'lemon', speed: 1.1, grav: 1 };
// the factory bed lives in sfx-stage.js (K.stageBeds); hook it into the ambience beds (sfx-music.js owns K.beds)
{ const K = B.SFXKit; if (K && K.beds && K.stageBeds && K.stageBeds.conveyor && !K.beds.conveyor) K.beds.conveyor = K.stageBeds.conveyor; }
B.Stage.register({ id: ID, name: 'CONVEYOR', short: 'BELT', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon,
  TIER_P, BELT, scr, posAt, releaseAt, pressK, Dof, vAt, isReal, isReq, HIT, TLOF, FIN, PX, PHW, sorterPose });
})(window.BLAM);
