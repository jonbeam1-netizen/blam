'use strict';
/* =========================================================================================
   B.L.A.M. stages/skeeball.js -- Stage 8: SKEE BALL (DESIGN-STAGES.md section 9, Jon + Fable 2026-10-30).
   A boardwalk arcade at night: FIVE skee-ball lanes fan out toward their ring boards (nested rings 10 / 20 / 30 / 40 /
   50 + the two 100 pockets top-left / top-right), carnival bulbs chase round every board, ticket dispensers on the lane
   dividers, a prize wall (plush toys, a lava lamp, a giant teddy, a bulb sign), the night sea through two arches, the
   fixed marquee "B.L.A.M. SKEE-BALL".
   THE MECHANIC: BALLS roll up the lanes (a clack at the release), jump the ramp and drop into a ring POCKET; a hex PLATE
   (target) or a BOMB pops out of that pocket on a little stand. The RING LIGHTS tell you which: GREEN-lit pockets pop
   targets (plates, decoys, plates with a hidden bomb behind), RED-lit pockets pop bombs, the 100s are GOLD (a gold
   plate +500, or the Deputy Duck cameo). The colours show before the ball lands, so a player who reads the arc is aimed.
   BALL SHOT: a ball IN THE AIR is shootable (+50, a wooden clonk): it KICKS to the nearest pocket of another colour on
   its board (a 50-bound ball goes into the 100: the bonus). The kick is a pure function of (ball spawn, the SHARED hit
   time, the colour schedule): the ball's original pop never comes, its latent 'kick' spawn pops instead.
   LIGHTS SHUFFLE: between waves (and mid-wave from Advanced up; constantly on the LIGHTS SHUFFLE variant) green and red
   swap pockets after a bell and a 0.5 s blink telegraph; balls in the air land under the NEW colours.
   PATTERNS (the director, the range's rules): lane VOLLEY (a column up the rings, shot-driven), cross-lane ROW (five
   balls at once, pops across the boards on a beat, shot-driven #88), SNAKE across the boards, PING-PONG between two
   boards then a red pocket takes the slot (shot-driven), JACKPOT RAIN (a line of balls into the 100s; mixed with reds
   from Advanced). Anticipation pauses, aim travel, fair bombs, reload-aware pacing on the magazine variants.
   Everything that decides a spawn is a pure function of (seed, tier, variant) and the stage clock; the kick and the
   shot-driven releases read only the shared hit stage times (points() records them) -> versus-safe.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets, P = B.Props;
const clamp = E.clamp, ID = 'skeeball';
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const inPlay = () => !!(B.G && B.G.screenName === 'play');
const slowK = () => { const G = B.G; return G && G.screenName === 'play' && G.slow < 1 && !(G.run && G.run.versus) ? G.slow : 1; };
const hyp = (x, y) => Math.sqrt(x * x + y * y);                // plain sqrt: exactly rounded in every JIT tier (versus)
const shared = (g, m) => { const x = new THREE.Mesh(g, m || MAT.obj); x.userData.sharedGeo = true; return x; };
// world point -> [px, py, game px per world unit] on the 426 x 240 grid (steady camera; pure)
function scr(x, y, z) {
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (R.RH / 2) / (Math.max(0.1, d) * R.TAN_H);
  return [R.RW / 2 + vx * k, R.RH / 2 - yc * k, k];
}

// =========================================================================================
// LAYOUT (world units). Board = a ring board tilted back by TH; local (u, v, n): u right, v up the board, n out of it.
// =========================================================================================
const NL = 5, LX = 3.1, NPK = 7, NP = NL * NPK;
const laneX = L => (L - 2) * LX;
const BZ = -8.2, BY = 2.0, TH = 0.7, CT = Math.cos(TH), STH = Math.sin(TH);
const RR = [1.3, 1.02, 0.76, 0.52, 0.3], RCV = [0, 0.2, 0.42, 0.62, 0.8];   // ring radii / centres (v): the classic nest, smaller rings higher
const BWH = 1.5, BTOP = 1.55, BBOT = -1.5;                      // the backboard: half width, top, bottom (v)
const PKUV = [[0, -1.06], [0, -0.58], [0, -0.12], [0, 0.3], [0, 0.8], [-1.13, 1.22], [1.13, 1.22]];   // pockets 10..50, 100 L, 100 R
const RING = [10, 20, 30, 40, 50, 100, 100], HOLE_R = 0.15;
const NRM = new THREE.Vector3(0, STH, CT);                      // the board's normal (out, toward you and up)
function bw(L, u, v, n, o) { o = o || new THREE.Vector3(); return o.set(laneX(L) + u, BY + v * CT + (n || 0) * STH, BZ - v * STH + (n || 0) * CT); }
// lanes FAN toward you (the near ends close together) so every roll is on screen; incline up to the ramp, the ramp kicks up
const ZN = 1.6, ZE = -5.4, RAMP = 0.55, YR = 0.26, YE = 0.5, KN = 0.5, LANE_W = 0.5;
const LANES = [];
for (let L = 0; L < NL; L++) {
  const fx = laneX(L), nx = fx * KN, dx = nx - fx, dz = ZN - ZE, len = Math.hypot(dx, dz);
  LANES.push({ fx, nx, len, ux: dx / len, uz: dz / len, yaw: Math.atan2(dx, dz), sR: 1 - RAMP / len });
}
// a point on lane L at s (0 near end .. 1 ramp lip): [x, y, z] of the surface
function laneAt(L, s, o) {
  const A = LANES[L], d = (1 - s) * A.len;
  const y = s < A.sR ? YR * s / A.sR : YR + (YE - YR) * Math.pow((s - A.sR) / (1 - A.sR), 2);
  o = o || [0, 0, 0]; o[0] = A.fx + A.ux * d; o[1] = y; o[2] = ZE + A.uz * d; return o;
}
// the plates: prop size PS on a short stand out of the pocket
const PS = 0.85, PA = P.PLATE_A * PS, FACE_H = (P.PIVOT_Y + P.FACE_Y) * PS, STAND = 0.1;
const BR = 0.19;                                                // the ball's radius
const POCKETS = [];                                             // { i, L, k, w (surface point), s (screen point of the plate centre) }
for (let L = 0; L < NL; L++) for (let k = 0; k < NPK; k++) {
  const w = bw(L, PKUV[k][0], PKUV[k][1], 0);
  POCKETS.push({ i: L * NPK + k, L, k, w, s: scr(w.x, w.y + STAND + PA, w.z) });
}
const PLATE_PX = POCKETS[2 * NPK + 2].s[2] * PA;                // a plate's apothem in game px (~9)
const AIMX = POCKETS.map(p => p.s[0]), AIMY = POCKETS.map(p => p.s[1]);
const CD = hyp(Math.max(...AIMX) - Math.min(...AIMX), Math.max(...AIMY) - Math.min(...AIMY)), CX = R.RW / 2, CY = (Math.max(...AIMY) + Math.min(...AIMY)) / 2;

// timings (s)
const DROP = 0.12, POP_LAG = 0.06, KICK_T = 0.3, KICK_H = 0.45, VS_LAG = 0.3, BLINK = 0.5;
const REL_LEAD = 0.1, FOLD_T = 0.2, HB_GRACE = 0.15, HB_BEAT = 0.6, DECOY_ARM = 0.3, DECOY_UNMASK = 0.16;
const FIN_HOLD = 3.9, FIN_SLOT = 4.4, FIN_SPRAY = 2.6;
// the kick: from pocket k, the candidates by ring distance (the 100 counts as ring 5 on the ball's side; ties: the 100,
// then inward, then outward). kickResult takes the first whose colour differs at the kicked landing time.
const KICK_ORDER = [];
for (let k = 0; k < NPK; k++) {
  KICK_ORDER.push([0, 1].map(side => {
    const rk = k >= 5 ? 5 : k, cand = [];
    for (let j = 0; j < 5; j++) if (j !== k) cand.push([Math.abs(j - rk), j > rk ? 1 : 2, j]);
    if (k < 5) cand.push([5 - rk, 0, side ? 6 : 5]);
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return cand.map(c => c[2]);
  }));
}
// the colour schedule: sk = { m0: [NL * 5] (0 green / 1 red), s: [{ t, m, wave }] }; 100s are gold (2)
function colAt(sk, L, k, t) {
  if (k >= 5) return 2;
  let m = sk.m0; for (const s of sk.s) { if (s.t <= t) m = s.m; else break; }
  return m[L * 5 + k];
}
function kickResult(ball, hitT, sk) {
  const tL = +(hitT + KICK_T).toFixed(4), c0 = colAt(sk, ball.L, ball.pk, tL), order = KICK_ORDER[ball.pk][ball.side > 0 ? 1 : 0];
  for (const k of order) { const c = colAt(sk, ball.L, k, tL); if (c !== c0) return { pk: k, kind: c === 2 ? 'gold' : c === 1 ? 'bomb' : 'plate', tL }; }
  const k = order[0], c = colAt(sk, ball.L, k, tL);
  return { pk: k, kind: c === 2 ? 'gold' : c === 1 ? 'bomb' : 'plate', tL };
}
// spawn -> its timeline array (points() and the targets find the ball / the schedule through it)
const TLOF = new WeakMap(), HIT = new WeakMap(), RELT = new WeakMap();
const hitOf = s => HIT.get(s);

// =========================================================================================
// THE SET
// =========================================================================================
const FLASH = new Float64Array(NP).fill(-9), PULSE = new Float64Array(NP).fill(-9);   // cosmetic: a ball just dropped / a ball waiting
const FIN = { run: null, t: -1 };                               // the finale's start (stage s) for the run that owns it
function envBake(x, y, z) {
  let L = 0.86 + 0.14 * clamp((y + 0.5) / 6, 0, 1);
  L += 0.18 * Math.exp(-((z - BZ) * (z - BZ)) * 0.18) * clamp((y - 0.3) / 3, 0, 1);   // the boards' bulbs warm the backboards
  L *= 1 - 0.25 * clamp((z + 12) / -2, 0, 1);
  return L;
}
const BACK_Z = -12.4;
function buildRoom(v, far) {
  // carpet: a boardwalk-arcade pattern (plum / indigo with cyan and pink confetti), a 0.5 grid
  for (let x = -16; x < 16; x += 0.5) for (let z = -13; z < 4; z += 0.5) {
    if (z > ZE - 0.6 && z < 3.6 && Math.abs(x + 0.25) < 8.6) { v.bx(x, -0.1, z, x + 0.5, -0.02, z + 0.5, ((Math.round(x * 2) + Math.round(z * 2)) & 1) ? PAL.midnight : PAL.navy, null, 4); continue; }   // the dark walkway between the lanes
    const h = hash1(Math.round(x * 2) * 131 + Math.round(z * 2) * 17), c = h < 0.06 ? PAL.cyan : h < 0.11 ? PAL.pink : h < 0.14 ? PAL.yellow : ((Math.round(x * 2) + Math.round(z * 2)) & 3) === 0 ? PAL.indigo : PAL.plum;
    v.bx(x, -0.1, z, x + 0.5, 0, z + 0.5, c, null, 4);
  }
  // the back wall: dark wood panelling with two arches onto the night sea (left / right)
  const ARCH = [[-13.6, -10.4], [10.4, 13.6]];
  for (let x = -16; x < 16; x += 1) for (let y = 0; y < 10; y += 1) {
    const arch = ARCH.some(([a, b]) => x + 0.5 > a && x + 0.5 < b && y < 6 + Math.sqrt(Math.max(0, 2.56 - Math.pow(x + 0.5 - (a + b) / 2, 2))) * 0.6);
    if (arch) continue;
    v.bx(x, y, BACK_Z - 0.1, x + 1, y + 1, BACK_Z, (x & 1) ? PAL.walnut : PAL.umber, null, 16);
  }
  for (const [a, b] of ARCH) {                                   // the arch frames (bulb-studded later), a boardwalk rail
    v.bx(a - 0.25, 0, BACK_Z - 0.05, a, 6.9, BACK_Z + 0.15, PAL.chestnut); v.bx(b, 0, BACK_Z - 0.05, b + 0.25, 6.9, BACK_Z + 0.15, PAL.chestnut);
    v.bx(a - 0.25, 6.9, BACK_Z - 0.05, b + 0.25, 7.2, BACK_Z + 0.15, PAL.chestnut);
    v.bx(a, 0.9, BACK_Z - 1.6, b, 1.0, BACK_Z - 1.5, PAL.tan); for (let x = a + 0.3; x < b; x += 0.7) v.bx(x, 0, BACK_Z - 1.6, x + 0.08, 0.95, BACK_Z - 1.52, PAL.walnut);
    v.bx(a, -0.1, BACK_Z - 3, b, 0, BACK_Z, PAL.tan, null, 4);   // the boardwalk planks
  }
  // the far night: sky, stars, the moon, the sea with a moon path, a pier with lights (fog-free, env class)
  const FZ = -30;
  for (let y = -2; y < 16; y += 0.5) {
    const c = y < 1.6 ? (y < 0.4 ? PAL.navy : PAL.deepblue) : y < 3 ? PAL.indigo : y < 7 ? PAL.midnight : PAL.void;
    far.bx(-30, y, FZ, 30, y + 0.5, FZ + 0.01, c, null, 16);
  }
  for (let k = 0; k < 120; k++) { const x = (hash1(k * 7) - 0.5) * 60, y = 3.5 + hash1(k * 13 + 1) * 12; far.bx(x, y, FZ + 0.05, x + 0.09, y + 0.09, FZ + 0.06, hash1(k) < 0.3 ? PAL.ice : PAL.mist, null, 16); }
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) { const d = Math.hypot(i, j); if (d > 6) continue; far.bx(-22 + i * 0.2, 7.5 + j * 0.2, FZ + 0.08, -21.8 + i * 0.2, 7.7 + j * 0.2, FZ + 0.09, d > 5 ? PAL.mist : PAL.bone, null, 16); }
  for (let k = 0; k < 40; k++) { const y = -1.5 + k * 0.07, w = 0.4 + k * 0.05; far.bx(-22 - w * (0.5 + hash1(k) * 0.5), y, FZ + 0.1, -22 + w * hash1(k + 9), y + 0.03, FZ + 0.11, hash1(k * 3) < 0.5 ? PAL.mist : PAL.haze, null, 16); }
  far.bx(14, 0.2, FZ + 0.12, 30, 0.45, FZ + 0.13, PAL.umber, null, 16);            // the pier
  for (let x = 14.5; x < 30; x += 1.8) { far.bx(x, 0.45, FZ + 0.12, x + 0.08, 1.3, FZ + 0.13, PAL.umber, null, 16); far.bx(x - 0.06, 1.3, FZ + 0.14, x + 0.14, 1.5, FZ + 0.15, PAL.lemon, null, 16); }
}
// the prize wall: shelves of plush, a lava lamp, the giant teddy on the floor right; a bulb sign over it (bulbs: later)
function plush(o, x, y, z, kind, c1, c2) {
  const s = 0.07, list = [], put = (i, j, k, c) => list.push([i, j, k, c]);
  const ball = (cx, cy, cz, r, c) => { for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) if (i * i + j * j + k * k <= r * r + 1) put(cx + i, cy + j, cz + k, c); };
  if (kind === 0) {                                              // a bear: body, head, ears, snout, eyes
    ball(0, 3, 0, 3, c1); ball(0, 8, 0, 3, c1); ball(-3, 11, 0, 1, c1); ball(3, 11, 0, 1, c1); ball(0, 7, 3, 1, c2);
    put(-1, 9, 3, PAL.void); put(1, 9, 3, PAL.void); put(0, 7, 4, PAL.void);
  } else if (kind === 1) {                                       // a round critter with big eyes and a tuft
    ball(0, 4, 0, 4, c1); put(-2, 5, 4, PAL.bone); put(2, 5, 4, PAL.bone); put(-2, 5, 5, PAL.void); put(2, 5, 5, PAL.void); put(0, 9, 0, c2); put(0, 10, 1, c2); put(0, 3, 4, c2);
  } else if (kind === 2) {                                       // an alien: green head, antennae
    ball(0, 3, 0, 2, c1); ball(0, 7, 0, 3, c1); put(-2, 11, 0, c2); put(2, 11, 0, c2); put(-2, 10, 0, c1); put(2, 10, 0, c1);
    put(-1, 8, 3, PAL.void); put(1, 8, 3, PAL.void);
  } else {                                                       // a striped snake coiled up
    for (let a = 0; a < 18; a++) { const r = 3 - a * 0.1, an = a * 0.9; put(Math.round(Math.cos(an) * r), Math.floor(a / 6) * 2, Math.round(Math.sin(an) * r), a % 3 ? c1 : c2); }
    ball(0, 7, 0, 1, c1); put(0, 7, 2, PAL.void);
  }
  o.vox(list, s, x, y, z);
}
function buildPrizes(o, glow) {
  const Z = BACK_Z + 0.5;
  for (const y of [2.4, 3.95, 5.5]) { o.bx(-9.6, y - 0.12, Z - 0.4, 9.6, y, Z + 0.35, PAL.tan); o.bx(-9.6, y - 0.16, Z + 0.33, 9.6, y - 0.12, Z + 0.36, PAL.chestnut); }
  const COLS = [[PAL.pink, PAL.bubblegum], [PAL.cyan, PAL.ice], [PAL.yellow, PAL.bone], [PAL.lime, PAL.green], [PAL.orange, PAL.lemon], [PAL.magenta, PAL.pink], [PAL.tan, PAL.sand], [PAL.blue, PAL.cyan]];
  let n = 0;
  for (const y of [2.4, 3.95, 5.5]) for (let x = -9.1; x < 9.2; x += 0.95) {
    if (y === 5.5 && x > -8 && x < -6.6) continue;               // the lava lamp's spot
    const h = hash1(n * 37 + 5), kind = h < 0.45 ? 0 : h < 0.7 ? 1 : h < 0.88 ? 2 : 3, C = COLS[(n * 5 + 3) % COLS.length];
    plush(o, x + (hash1(n) - 0.5) * 0.2, y + 0.04, Z, kind, kind === 2 ? PAL.lime : C[0], kind === 2 ? PAL.pink : C[1]); n++;
  }
  // the lava lamp: a steel cone base and cap, glowing blobs (glow class)
  { const x = -7.3, y = 5.5; o.bx(x - 0.25, y, Z - 0.2, x + 0.25, y + 0.3, Z + 0.2, PAL.steel); o.bx(x - 0.18, y + 1.35, Z - 0.15, x + 0.18, y + 1.5, Z + 0.15, PAL.steel);
    glow.bx(x - 0.2, y + 0.3, Z - 0.16, x + 0.2, y + 1.35, Z + 0.16, PAL.magenta);
    for (const [bx, by, r, c] of [[0.02, 0.5, 0.11, PAL.orange], [-0.05, 0.85, 0.09, PAL.amber], [0.04, 1.15, 0.07, PAL.orange]]) glow.bx(x + bx - r, y + by - r, Z + 0.15, x + bx + r, y + by + r, Z + 0.18, c); }
  // the giant teddy, sitting on the floor right of the boards
  { const list = [], put = (i, j, k, c) => list.push([i, j, k, c]), s = 0.16;
    const ball = (cx, cy, cz, rx, ry, rz, c) => { for (let i = -rx; i <= rx; i++) for (let j = -ry; j <= ry; j++) for (let k = -rz; k <= rz; k++) if ((i / rx) ** 2 + (j / ry) ** 2 + (k / rz) ** 2 <= 1.05) put(cx + i, cy + j, cz + k, c); };
    ball(0, 6, 0, 6, 7, 5, PAL.chestnut); ball(0, 4, 3, 4, 4, 3, PAL.tan);           // body, tummy
    ball(0, 16, 0, 5, 5, 4, PAL.chestnut); ball(0, 14, 4, 2, 2, 1, PAL.sand);       // head, snout
    ball(-4, 21, 0, 2, 2, 1, PAL.chestnut); ball(4, 21, 0, 2, 2, 1, PAL.chestnut); put(-4, 21, 1, PAL.tan); put(4, 21, 1, PAL.tan);
    ball(-6, 8, 2, 2, 4, 2, PAL.chestnut); ball(6, 8, 2, 2, 4, 2, PAL.chestnut);     // arms
    ball(-3, 0, 4, 2, 2, 3, PAL.chestnut); ball(3, 0, 4, 2, 2, 3, PAL.chestnut); put(-3, 0, 7, PAL.tan); put(3, 0, 7, PAL.tan);
    put(-2, 17, 4, PAL.void); put(2, 17, 4, PAL.void); put(0, 15, 6, PAL.void); put(0, 15, 5, PAL.void);
    for (let i = -3; i <= 3; i++) put(i, 11, 5, i & 1 ? PAL.red : PAL.crimson);       // a bow tie
    o.vox(list, s, 9.3, 0.3, -10.6); }
  // the redemption counter at the left (glass case + a ticket slot) that spits a strip of tickets now and then
  { const x0 = -10.2, x1 = -7.6, z0 = -10.8, z1 = -9.4; o.bx(x0, 0, z0, x1, 1.0, z1, PAL.crimson); o.bx(x0 - 0.05, 1.0, z0 - 0.05, x1 + 0.05, 1.08, z1 + 0.05, PAL.tan);
    o.bx(x0 + 0.1, 1.08, z0 + 0.1, x1 - 0.1, 1.6, z1 - 0.1, PAL.ice); o.bx(x0, 1.6, z0, x1, 1.7, z1, PAL.chestnut);
    glow.bx(x0 + 0.3, 0.6, z1, x0 + 1.1, 0.75, z1 + 0.02, PAL.lime); }
}
// one lane: the incline, side rails, the ramp lip (in the lane's own frame, then turned onto its fan angle)
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function buildLane(v, L) {
  // (Jon 2026-10-30: no tall slanted slabs) a long flat wooden alley tilting up to the ramp: a walnut playfield with three
  // lengthwise maple strips, LOW side rails (umber wood, a steel chrome top, ~0.12 high), the ramp HUMP at the top end in
  // light maple curving up to a steel lip. Narrow enough (1.0 + rails) that no lane ever crosses its neighbour.
  const A = LANES[L], N = 20, NR = 6;
  const seg = (s0, s1, ramp, k) => {
    const p0 = laneAt(L, s0), p1 = laneAt(L, s1), pm = laneAt(L, (s0 + s1) / 2);
    const len = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), pitch = Math.atan2(p1[1] - p0[1], len), sl = Math.hypot(len, p1[1] - p0[1]) + 0.02;
    _m.compose(_v.set(pm[0], pm[1] - 0.04, pm[2]), _q.setFromEuler(_e.set(pitch, A.yaw, 0, 'YXZ')), _s.set(1, 1, 1));
    v.box(0, 0, 0, LANE_W * 2, 0.08, sl, ramp ? ((k & 1) ? PAL.sand : PAL.tan) : PAL.walnut, _m, 4 | 16 | 1 | 2);   // the playfield
    if (!ramp) for (const x of [-0.6, 0, 0.6]) v.box(x * LANE_W, 0.041, 0, 0.035, 0.004, sl, PAL.chestnut, _m, 4);   // maple strips
    for (const sd of [-1, 1]) {                                                                                       // low side rails
      v.box(sd * (LANE_W + 0.035), 0.1, 0, 0.07, 0.12, sl, PAL.umber, _m, 1 | 2 | 4);
      v.box(sd * (LANE_W + 0.035), 0.165, 0, 0.075, 0.015, sl, PAL.steel, _m, 4);
    }
  };
  for (let i = 0; i < N; i++) seg(A.sR * i / N, A.sR * (i + 1) / N, false, i);
  for (let i = 0; i < NR; i++) seg(A.sR + (1 - A.sR) * i / NR, A.sR + (1 - A.sR) * (i + 1) / NR, true, i);
  // the ramp lip: a steel kicker at the top end
  const pe = laneAt(L, 1);
  _m.compose(_v.set(pe[0], pe[1] - 0.04, pe[2]), _q.setFromEuler(_e.set(0.6, A.yaw, 0, 'YXZ')), _s);
  v.box(0, 0, 0.05, LANE_W * 2 + 0.14, 0.08, 0.2, PAL.steel, _m, 4 | 16);
  // the gutter between the ramp and the board (a dark net box) + the cabinet under the board
  const x = A.fx;
  v.bx(x - BWH, -0.1, BZ + 0.95, x + BWH, 0.32, ZE - 0.1, PAL.midnight, null, 4 | 16);
  v.bx(x - BWH - 0.05, -0.1, BZ - 0.6, x + BWH + 0.05, 0.9, BZ + 0.95, PAL.crimson, null, 4 | 16 | 1 | 2);
}
// a ring board: the backboard face rastered in (u, v) cells (bands alternate walnut / umber, the 50 cup midnight, holes
// void with an umber lip, the field outside the rings crimson, a chestnut frame), a thickness at the bottom, the back box
function buildBoard(v, L) {
  _m2.makeRotationX(-TH).setPosition(laneX(L), BY, BZ);
  const CS = 0.05, nu = Math.round(2 * BWH / CS), nv = Math.round((BTOP - BBOT) / CS);
  const colUV = (u, w) => {
    for (let k = 0; k < NPK; k++) { const r = k >= 5 ? HOLE_R * 1.2 : HOLE_R, d = hyp(u - PKUV[k][0], w - PKUV[k][1]); if (d < r) return d > r - 0.045 ? PAL.umber : PAL.void; }
    let n = 0; for (let k = 0; k < 5; k++) if (hyp(u, w - RCV[k]) < RR[k]) n++;
    if (!n) {
      if (Math.abs(u) > BWH - 0.13 || w > BTOP - 0.13 || w < BBOT + 0.13) return Math.abs(u) > BWH - 0.06 || w > BTOP - 0.06 ? PAL.tan : PAL.chestnut;
      return w < -0.3 ? PAL.oxblood : PAL.crimson;
    }
    return n === 5 ? PAL.midnight : (n & 1) ? PAL.walnut : PAL.umber;
  };
  for (let j = 0; j < nv; j++) {
    const w = BBOT + (j + 0.5) * CS;
    let run = -1, rc = null;
    for (let i = 0; i <= nu; i++) {
      const c = i < nu ? colUV(-BWH + (i + 0.5) * CS, w) : null;
      if (c !== rc) {
        if (rc != null) { const u0 = -BWH + run * CS, u1 = -BWH + i * CS; _m.multiplyMatrices(_m2, new THREE.Matrix4().makeTranslation((u0 + u1) / 2, w, rc === PAL.void ? -0.012 : 0)); v.box(0, 0, 0, u1 - u0, CS, 0.02, rc, _m, 16); }
        run = i; rc = c;
      }
    }
  }
  _m.multiplyMatrices(_m2, new THREE.Matrix4().makeTranslation(0, BBOT - 0.06, -0.1)); v.box(0, 0, 0, 2 * BWH, 0.12, 0.22, PAL.chestnut, _m, 4 | 8 | 16);   // bottom lip
  _m.multiplyMatrices(_m2, new THREE.Matrix4().makeTranslation(0, (BTOP + BBOT) / 2, -0.32)); v.box(0, 0, 0, 2 * BWH + 0.1, BTOP - BBOT + 0.1, 0.6, PAL.walnut, _m, 1 | 2 | 4);   // the back box
  // the machine's header above the board: a small crimson arch with the lane number in bulbs (the bulbs: bulbGeo)
  const top = bw(L, 0, BTOP);
  v.bx(top.x - BWH, top.y, top.z - 0.4, top.x + BWH, top.y + 0.55, top.z - 0.2, PAL.plum, null, 16 | 4 | 1 | 2);
}
// the dividers between lanes (low cabinet walls) with a ticket dispenser each near the front
const DISP = [];
function buildCabinets(v, o, glow) {
  for (let d = 0; d < NL + 1; d++) {
    const s = 0.62, p = (L, side) => { const q = laneAt(L, s); return [q[0] + side * (LANE_W + 0.25) * LANES[L].uz, q[1], q[2] - side * (LANE_W + 0.25) * LANES[L].ux]; };
    const a = d > 0 ? p(d - 1, 1) : null, b = d < NL ? p(d, -1) : null, q = a && b ? [(a[0] + b[0]) / 2, Math.max(a[1], b[1]), (a[2] + b[2]) / 2] : a || b;
    const x = q[0] + (a && b ? 0 : d ? 0.45 : -0.45), z = q[2];
    o.bx(x - 0.18, 0, z - 0.16, x + 0.18, 0.55, z + 0.16, PAL.slate); o.bx(x - 0.2, 0.55, z - 0.18, x + 0.2, 0.6, z + 0.18, PAL.steel);   // a low ticket box in the walkway
    o.bx(x - 0.09, 0.36, z + 0.16, x + 0.09, 0.39, z + 0.17, PAL.void);                  // the ticket slot
    o.bx(x - 0.05, 0.18, z + 0.165, x + 0.05, 0.36, z + 0.175, PAL.tan);                 // a strip of tickets hanging out
    glow.bx(x - 0.1, 0.44, z + 0.16, x + 0.1, 0.5, z + 0.175, PAL.red);                  // "TICKETS" light
    DISP.push([x, 0.4, z + 0.22]);
  }
}
// the marquee "B.L.A.M. SKEE-BALL": bold voxel letters (lemon / yellow / amber rows) on a plum board, crimson frame
const MQ = { z: -9.6, y: 4.55, s: 0.075 };
function buildMarquee(o, glow) {
  const t = R.bold('B.L.A.M. SKEE-BALL'), s = MQ.s, W = t.w * s, H = 7 * s;
  const x0 = -W / 2, y0 = MQ.y - H / 2, z = MQ.z;
  o.bx(x0 - 0.45, y0 - 0.32, z - 0.12, -x0 + 0.45, y0 + H + 0.32, z, PAL.plum, null, 16 | 4 | 8 | 1 | 2);
  o.bx(x0 - 0.55, y0 - 0.42, z - 0.14, -x0 + 0.55, y0 - 0.32, z + 0.02, PAL.crimson); o.bx(x0 - 0.55, y0 + H + 0.32, z - 0.14, -x0 + 0.55, y0 + H + 0.42, z + 0.02, PAL.crimson);
  o.bx(x0 - 0.55, y0 - 0.32, z - 0.14, x0 - 0.45, y0 + H + 0.32, z + 0.02, PAL.crimson); o.bx(-x0 + 0.45, y0 - 0.32, z - 0.14, -x0 + 0.55, y0 + H + 0.32, z + 0.02, PAL.crimson);
  for (const sx of [-1, 1]) o.bx(sx * 3.2 - 0.02, y0 + H + 0.42, z - 0.08, sx * 3.2 + 0.02, 9, z - 0.04, PAL.steel);   // hanging rods
  const ROWC = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
  for (const [px, py] of t.px) {
    const x = x0 + px * s, y = y0 + (6 - py) * s;
    glow.bx(x, y, z, x + s, y + s, z + 0.08, ROWC[py], null, 16 | 4 | 1);
    o.bx(x + s * 0.5, y - s * 0.5, z - 0.02, x + s * 1.5, y + s * 0.5, z + 0.04, PAL.void, null, 16);   // drop shadow
  }
}
// ---------- the ring LIGHTS: one mesh, colour per pocket from a uniform array (no per-frame geometry work) ----------
const ringMat = new THREE.ShaderMaterial({
  uniforms: { uCol: { value: Array.from({ length: NP }, () => new THREE.Color(PAL.slate)) } },
  vertexShader: `attribute float aP; attribute vec3 color; uniform vec3 uCol[${NP}]; varying vec3 vC;
    void main(){ vC = uCol[int(aP + 0.5)] * color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }'
});
function attrMesh(v, attrs, mat) {
  const g = v.geo(); for (const k in attrs) g.setAttribute(k, new THREE.Float32BufferAttribute(attrs[k], 1));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.raycast = () => {}; return m;
}
function ringMesh() {
  const v = new Vox(), aP = []; v.shade = [0.72, 0.72, 0.85, 0.6, 1, 0.5];
  const seg = (L, pk, u, w, ang, len) => {
    const n0 = v.vc;
    _m2.makeRotationX(-TH).setPosition(laneX(L), BY, BZ);
    _m.multiplyMatrices(_m2, new THREE.Matrix4().makeTranslation(u, w, 0.03)).multiply(new THREE.Matrix4().makeRotationZ(ang));
    v.box(0, 0, 0, len, 0.065, 0.05, 0xffffff, _m, 1 | 2 | 4 | 8 | 16);
    for (let q = n0; q < v.vc; q++) aP.push(L * NPK + pk);
  };
  for (let L = 0; L < NL; L++) {
    for (let k = 0; k < 5; k++) { const N = Math.ceil(2 * Math.PI * RR[k] / 0.08); for (let i = 0; i < N; i++) { const a = i / N * 2 * Math.PI; seg(L, k, RR[k] * Math.sin(a), RCV[k] + RR[k] * Math.cos(a), -a, 2 * Math.PI * RR[k] / N + 0.012); } }
    for (const k of [5, 6]) { const r = 0.25, N = 16; for (let i = 0; i < N; i++) { const a = i / N * 2 * Math.PI; seg(L, k, PKUV[k][0] + r * Math.sin(a), PKUV[k][1] + r * Math.cos(a), -a, 2 * Math.PI * r / N + 0.012); } }
  }
  const m = attrMesh(v, { aP }, ringMat);
  m.onBeforeRender = ringStep;
  return m;
}
const COL = { g: [new THREE.Color(PAL.lime), new THREE.Color(PAL.green)], r: [new THREE.Color(PAL.red), new THREE.Color(PAL.coral)], y: [new THREE.Color(PAL.yellow), new THREE.Color(PAL.lemon)], off: new THREE.Color(PAL.slate) };
function ringStep() {
  const run = B.G && B.G.run, ok = !!(run && run.stage === ID && run.timeline && run.timeline.sk);
  const U = ringMat.uniforms.uCol.value, now = performance.now() / 1000;
  if (!ok) { for (let i = 0; i < NP; i++) U[i].copy(i % NPK >= 5 ? COL.y[0] : (i % 3) ? COL.g[0] : COL.r[0]); return; }
  const sk = run.timeline.sk, t = Math.max(0, run.t);
  let next = null; for (const s of sk.s) if (s.t > t - 1e-6) { next = s; break; }
  const blink = next && t >= next.t - BLINK, bk = blink && (Math.floor((t - next.t + BLINK) * 8) & 1);
  for (let L = 0; L < NL; L++) for (let k = 0; k < NPK; k++) {
    const i = L * NPK + k, c = colAt(sk, L, k, t);
    let cc = c === 2 ? COL.y : c === 1 ? COL.r : COL.g;
    if (blink && k < 5) { const c2 = colAt(sk, L, k, next.t); if (c2 !== c && bk) cc = c2 === 1 ? COL.r : COL.g; }
    const fl = now - FLASH[i], pu = now - PULSE[i];
    U[i].copy(cc[0]);
    if (fl < 0.25) U[i].copy(cc[1]);
    else if (pu < 0.1 && Math.sin(now * 18) > 0.2) U[i].copy(cc[1]);
  }
}
// ---------- BULBS (one mesh, a shader: chase round the boards and the marquee, the prize wall sign twinkles; the finale
// lights B.L.A.M. on the prize wall left to right, the boards' bulbs go wild; the shuffle telegraph flashes them all) ----------
const bulbMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uFin: { value: 0 }, uFlash: { value: 0 },
    cLit: { value: new THREE.Color(PAL.lemon) }, cMid: { value: new THREE.Color(PAL.amber) }, cOff: { value: new THREE.Color(PAL.rust) },
    cFin: { value: new THREE.Color(PAL.yellow) }, cDim: { value: new THREE.Color(PAL.walnut) }, cHot: { value: new THREE.Color(PAL.bone) } },
  vertexShader: `attribute float aPh; attribute float aL; attribute vec3 color; uniform float uT, uFin, uFlash; uniform vec3 cLit, cMid, cOff, cFin, cDim, cHot;
    varying vec3 vC;
    void main(){
      float ph = fract(aPh - uT);
      vec3 c = ph < 0.25 ? cLit : (ph < 0.5 ? cMid : cOff);
      if (aL > -0.5) {
        c = fract(aPh * 7.31 + uT * 0.37) < 0.07 ? cOff : cDim;
        if (uFin > 0.0) { float on = step(aL, uFin); c = on > 0.5 ? (fract(uT * 2.5 + aL) < 0.5 ? cLit : cFin) : cDim * 0.6; }
      } else if (uFin > 0.0) c = fract(aPh * 2.0 - uT * 4.0) < 0.5 ? cLit : cOff;
      if (uFlash > 0.5 && aL < -0.5) c = cHot;
      vC = c * color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }'
});
const SIGN = { z: BACK_Z + 0.9, y0: 6.32, p: 0.19 };   // the prize wall's bulb sign: rows ~8-36 of the screen, over the marquee
function bulbMesh() {
  const v = new Vox(), aPh = [], aL = []; v.shade = [0.75, 0.75, 1, 0.6, 1, 0.6];
  const bulb = (x, y, z, ph, l, sz = 0.09) => { const n0 = v.vc; v.box(x, y, z, sz, sz, sz, 0xffffff, null, 1 | 2 | 4 | 8 | 16); for (let q = n0; q < v.vc; q++) { aPh.push(ph); aL.push(l); } };
  // round every backboard (+ the header arch)
  for (let L = 0; L < NL; L++) {
    const per = [], add = (u, w) => per.push(bw(L, u, w, 0.06));
    for (let u = -BWH; u < BWH; u += 0.25) add(u, BTOP + 0.02);
    for (let w = BTOP; w > BBOT; w -= 0.25) add(BWH + 0.02, w);
    for (let u = BWH; u > -BWH; u -= 0.25) add(u, BBOT - 0.02);
    for (let w = BBOT; w < BTOP; w += 0.25) add(-BWH - 0.02, w);
    per.forEach((p, i) => bulb(p.x, p.y, p.z, i / 8 + L * 0.37, -1));
    const top = bw(L, 0, BTOP); for (let i = 0; i < 11; i++) bulb(top.x - BWH + 0.15 + i * 0.27, top.y + 0.5, top.z - 0.19, i / 6, -1, 0.08);
  }
  // the marquee frame
  { const t = R.bold('B.L.A.M. SKEE-BALL'), W = t.w * MQ.s, H = 7 * MQ.s, x0 = -W / 2 - 0.5, x1 = W / 2 + 0.5, y0 = MQ.y - H / 2 - 0.37, y1 = MQ.y + H / 2 + 0.37, z = MQ.z + 0.04;
    let i = 0; for (let x = x0; x < x1; x += 0.3) { bulb(x, y1, z, i / 10, -1); bulb(x1 - (x - x0), y0, z, (i + 40) / 10, -1); i++; }
    bulb(x0, MQ.y, z, 0.5, -1); bulb(x1, MQ.y, z, 0.0, -1); }
  // the arches onto the sea
  for (const [a, b] of [[-13.6, -10.4], [10.4, 13.6]]) { let i = 0; for (let y = 0.4; y < 6.9; y += 0.4) { bulb(a - 0.12, y, BACK_Z + 0.2, i / 7, -1); bulb(b + 0.12, y, BACK_Z + 0.2, i / 7 + 0.5, -1); i++; } }
  // the prize wall SIGN: a 43 x 9 grid; the bulbs inside B.L.A.M. carry their column (0..1) for the finale reveal
  { const t = R.bold('B.L.A.M.'), on = new Map(); for (const [x, y] of t.px) on.set((x + 2) + ',' + (y + 1), (x + 0.5) / t.w);
    const NX = t.w + 4, NY = 9, x0 = -(NX - 1) / 2 * SIGN.p;
    for (let gx = 0; gx < NX; gx++) for (let gy = 0; gy < NY; gy++) {
      const l = on.has(gx + ',' + gy) ? on.get(gx + ',' + gy) : 9;
      bulb(x0 + gx * SIGN.p, SIGN.y0 + (NY - 1 - gy) * SIGN.p, SIGN.z, hash1(gx * 31 + gy * 7), l, 0.11);
    } }
  const m = attrMesh(v, { aPh, aL }, bulbMat);
  m.onBeforeRender = bulbStep;
  return m;
}
function bulbStep() {
  const run = B.G && B.G.run, ok = !!(run && run.stage === ID && run.timeline && run.timeline.sk), U = bulbMat.uniforms;
  U.uT.value = (performance.now() / 1000) * 1.6 * slowK();
  U.uFin.value = 0; U.uFlash.value = 0;
  if (!ok) return;
  const t = Math.max(0, run.t);
  for (const s of run.timeline.sk.s) if (t >= s.t - BLINK && t < s.t) { U.uFlash.value = (Math.floor((t - s.t) * 8) & 1) ? 1 : 0; break; }
  if (FIN.run === run && FIN.t >= 0 && t >= FIN.t) U.uFin.value = Math.max(0.001, Math.min(1.5, (t - FIN.t) / 0.8));
}
function buildEnv() {
  const group = new THREE.Group();
  const env = new Vox(), obj = new Vox(), glow = new Vox(), far = new Vox();
  env.bake = envBake;
  buildRoom(env, far);
  buildPrizes(obj, glow);
  for (let L = 0; L < NL; L++) { buildLane(env, L); buildBoard(env, L); }
  buildCabinets(env, obj, glow);
  buildMarquee(obj, glow);
  const envMesh = env.mesh(MAT.env), objMesh = obj.mesh(MAT.obj), glowMesh = glow.mesh(MAT.glow);
  envMesh.userData.env = true;
  const farMesh = far.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.5, blending: THREE.NoBlending }));
  farMesh.frustumCulled = false; farMesh.raycast = () => {};
  glowMesh.raycast = () => {};
  glowMesh.onBeforeRender = ambient;
  group.add(farMesh, envMesh, objMesh, glowMesh, ringMesh(), bulbMesh());
  group.userData.shootables = [envMesh, objMesh];
  return group;
}
// cosmetic: the redemption counter spits a ticket strip now and then (wall clock)
let tickT = 0;
const _tp = new THREE.Vector3(), _tv = new THREE.Vector3();
function ambient() {
  const t = performance.now() / 1000; if (t - tickT < 0.09) return; tickT = t;
  if (((t * 0.4) % 1) < 0.12) T.spawnChip(_tp.set(-9.8 + 0.4, 0.68, -9.35), _tv.set(R.rnd(0.1, 0.4), R.rnd(0.3, 0.8), R.rnd(0.3, 0.7)), 0.06, Math.random() < 0.5 ? PAL.tan : PAL.sand, 1.2, 0.7);
}
// the finale's ticket spray out of every dispenser
function spray(k) {
  for (const d of DISP) for (let n = 0; n < 2; n++) {
    const c = [PAL.tan, PAL.sand, PAL.orange, PAL.red, PAL.lemon][(Math.random() * 5) | 0];
    T.spawnChip(_tp.set(d[0], d[1], d[2]), _tv.set(R.rnd(-1.2, 1.2), R.rnd(3.2, 5.6) * (0.7 + 0.3 * k), R.rnd(0.4, 1.8)), R.rnd(0.06, 0.1), c, R.rnd(1.2, 2.0), 0.55);
  }
}

// =========================================================================================
// GEOMETRY: the ball (a varnished maple skee ball with a walnut band so the spin shows), the stand, the duck cameo
// =========================================================================================
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const s = 0.048, list = [], RV = BR / s;
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) for (let k = -4; k <= 4; k++) {
    const d = Math.hypot(i, j, k); if (d > RV + 0.15) continue;
    const l = (-i * 0.45 + j * 0.65 + k * 0.6) / RV;
    const c = j === 0 ? (l > 0.3 ? PAL.rust : PAL.chestnut) : l > 0.7 ? PAL.bone : l > 0.35 ? PAL.lemon : l > -0.1 ? PAL.sand : l > -0.5 ? PAL.tan : PAL.chestnut;   // varnished maple, a hot highlight (it must read over the rings)
    list.push([i, j, k, c]);
  }
  const ball = new Vox().vox(list, s, 0, 0, 0).geo();
  const st = new Vox(); st.bx(-0.035, -0.05, -0.035, 0.035, STAND + 0.12, 0.035, PAL.steel); st.bx(-0.09, -0.05, -0.06, 0.09, 0.0, 0.06, PAL.slate);
  return (GEO = { ball, ballList: list, ballS: s, stand: st.geo() });
}
// DEPUTY DUCK cameo (the range's placeholder voxel duck, copied; duck.js untouched)
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
  { const k = front(-2, 3); if (k != null) { put(-2, 3, k, 'lemon'); put(-2, 4, front(-2, 4), 'lemon'); } }
  for (let i = -3; i <= 4; i++) for (let k = -2; k <= 3; k++) put(i, 10, k, 'tan');
  for (let i = -1; i <= 2; i++) for (let k = -1; k <= 2; k++) { put(i, 11, k, 'chestnut'); put(i, 12, k, 'chestnut'); }
  for (const i of [-2, -1, 1, 2]) for (const k of [0, 1, 2]) put(i, -2, k, 'orange');
  const list = [...M.values()], ox = -0.5 * DUCK_S, oy = -6 * DUCK_S;
  return { list, ox, oy, geo: new Vox().vox(list, DUCK_S, ox, oy, 0).geo() };
})();
function duckProp() {
  const group = new THREE.Group(), pivot = new THREE.Group(); group.add(pivot);
  const face = shared(DUCK.geo, MAT.obj); face.scale.setScalar(1.4); face.position.y = FACE_H + 0.055 * 1.4 + 0.05; pivot.add(face);   // a bit bigger than the range's: he stands in a far pocket
  return { kind: 'target', group, pivot, face, duck: true,
    register(t) { t.part(face, DUCK.list, DUCK_S, DUCK.ox, DUCK.oy, 0); return [t.parts[t.parts.length - 1]]; },
    show() { face.visible = true; }, hide() { face.visible = false; }, sparkle() {}, setFuse() {}, wobble() {} };
}
function mountProp(prop, hinge) {
  if (prop.base) prop.base.visible = false;
  if (prop.arm) prop.arm.visible = false;
  prop.group.position.y = STAND + PA - FACE_H;
  hinge.add(prop.group);
}
function decoyPick(id) {                                        // a pure function of the spawn id (versus-safe)
  const V = P.DECOY_VARIANTS || ['a'], h = (Math.imul((id | 0) + 1, 2654435761) >>> 0) / 4294967296;
  return V[Math.min(V.length - 1, Math.floor(h * V.length))];
}
P.warm();
const uOf = x => clamp(0.5 + x / 14, 0, 1);

// =========================================================================================
// THE BALL: a pure path of (spawn, local time, the shared hit time). Roll up the fanned lane (decelerating), the ramp
// lip, an arc onto the pocket, a short drop into the hole. Shot in the air: the kick arc to kickResult()'s pocket.
// =========================================================================================
const _a = [0, 0, 0], _b = new THREE.Vector3(), _c = new THREE.Vector3();
function airPos(sp, a, o) {                                     // a 0..1 over the air phase
  laneAt(sp.L, 1, _a); bw(sp.L, PKUV[sp.pk][0], PKUV[sp.pk][1], BR, _b);
  const ax = _a[0], ay = _a[1] + BR, az = _a[2];
  o.x = ax + (_b.x - ax) * a; o.y = ay + (_b.y - ay) * a + 4 * sp.h * a * (1 - a); o.z = az + (_b.z - az) * a;
  return o;
}
function ballPose(sp, lt, hitLt, kick, o) {
  o.vis = lt >= 0; o.shootable = false; o.done = false; o.phase = 'wait'; o.spin = 0; o.sc = 1;
  if (lt < 0) return o;
  const Tr = sp.Tr, Ta = sp.Ta;
  if (hitLt != null && kick && lt >= hitLt) {                   // KICKED: from where it was hit to the kick pocket
    const h0 = ballPose(sp, hitLt, null, null, {}), q = (lt - hitLt) / KICK_T;
    bw(sp.L, PKUV[kick.pk][0], PKUV[kick.pk][1], BR, _c);
    if (q < 1) { o.phase = 'kick'; o.x = h0.x + (_c.x - h0.x) * q; o.y = h0.y + (_c.y - h0.y) * q + 4 * KICK_H * q * (1 - q); o.z = h0.z + (_c.z - h0.z) * q; o.spin = lt * 30; return o; }
    const r = (lt - hitLt - KICK_T) / DROP;
    bw(sp.L, PKUV[kick.pk][0], PKUV[kick.pk][1], -0.04 + (BR + 0.04) * (1 - Math.min(1, r)), _c);
    o.phase = 'drop'; o.x = _c.x; o.y = _c.y; o.z = _c.z; o.sc = 1 - 0.1 * Math.min(1, r);
    o.done = lt >= hitLt + KICK_T + DROP + POP_LAG; return o;
  }
  if (lt < Tr) {                                                // ROLL: decelerating up the incline
    const q = lt / Tr, s = 0.12 + 0.88 * (1 - Math.pow(1 - q, 1.35));   // released a little up the lane (not in your lap)
    laneAt(sp.L, s, _a); o.phase = 'roll'; o.x = _a[0]; o.y = _a[1] + BR; o.z = _a[2]; o.spin = -s * LANES[sp.L].len / BR; return o;
  }
  if (lt < Tr + Ta) {                                           // AIR: shootable
    airPos(sp, (lt - Tr) / Ta, o); o.phase = 'air'; o.spin = -LANES[sp.L].len / BR - (lt - Tr) * 14;
    o.shootable = lt - Tr >= 0.03 && Tr + Ta - lt >= 0.02; return o;
  }
  const r = Math.min(1, (lt - Tr - Ta) / DROP);                 // DROP into the hole, then sit
  bw(sp.L, PKUV[sp.pk][0], PKUV[sp.pk][1], -0.04 + (BR + 0.04) * (1 - r), _c);
  o.phase = 'drop'; o.x = _c.x; o.y = _c.y; o.z = _c.z; o.sc = 1 - 0.1 * r;
  o.done = lt >= Tr + Ta + DROP + POP_LAG; return o;
}
// hit test: a screen-space circle round the ball (never under HIT_PX game px; more on touch); the true sphere reports its
// real distance, the inflated ring a little farther (a plate / bomb precisely under the crosshair wins over a near ball)
const HIT_PX = { mouse: 7, touch: 11 };
const _hp = new THREE.Vector3(), _cp = new THREE.Vector3();
function ballRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable) return;
  this.getWorldPosition(_hp);
  const d = _hp.distanceTo(rc.ray.origin), perPx = 2 * d * R.TAN_H / R.RH, rpx = BR / perPx;
  const reff = Math.max(rpx, B.Input && B.Input.touch ? HIT_PX.touch : HIT_PX.mouse);
  rc.ray.closestPointToPoint(_hp, _cp);
  const dd = _cp.distanceTo(_hp);
  if (dd > reff * perPx) return;
  out.push({ distance: dd <= BR * 1.05 ? d - BR : d + 0.6, point: _cp.clone(), object: this });
}
class Ball extends T.Target {
  constructor(sp, run) {
    super('target');
    const G = geos(); this.sp = sp; this.run = run; this.P = {}; this.provT = null; this.kick = null; this.snd = 0; this.lastLt = 0;
    this.mesh = shared(G.ball, MAT.obj); this.mesh.userData.target = this; this.mesh.userData.zone = 'ball'; this.mesh.raycast = ballRaycast;
    this.group.add(this.mesh); this.group.visible = false;
  }
  meshes() { return [this.mesh]; }
  update(lt, run) {
    this.run = run; this.lastLt = lt;
    const sp = this.sp, h = HIT.get(sp), tl = run.timeline;
    if (h == null && this.provT != null && run.t - this.provT > 0.8) this.provT = null;   // a versus claim that never came back
    const hitT = h != null ? h : this.provT;
    if (hitT != null && (!this.kick || this.kickT !== hitT)) { this.kick = kickResult(sp, hitT, tl.sk); this.kickT = hitT; }
    const Pz = ballPose(sp, lt, hitT != null ? hitT - sp.t0 : null, hitT != null ? this.kick : null, this.P);
    this.group.visible = Pz.vis;
    if (Pz.vis) {
      this.group.position.set(Pz.x, Pz.y, Pz.z); this.mesh.rotation.x = Pz.spin; this.mesh.scale.setScalar(Pz.sc);
      // sounds / pocket lights as it goes (cosmetic)
      if (this.snd < 1) { this.snd = 1; B.SFX.play('ballRoll', { u: uOf(laneX(sp.L)), d: sp.Tr }); }
      if (this.snd < 2 && Pz.phase === 'air') { this.snd = 2; B.SFX.play('ballJump', { u: uOf(laneX(sp.L)) }); }
      if (this.snd < 3 && Pz.phase === 'drop') {
        this.snd = 3; const pk = hitT != null ? this.kick.pk : sp.pk;
        FLASH[sp.L * NPK + pk] = performance.now() / 1000;
        B.SFX.play('pocket', { u: uOf(laneX(sp.L)), ring: RING[pk] });
      }
    }
    this.shootable = this.alive && Pz.shootable;
    if (Pz.done && hitT == null && sp.popD) { const pp = tl[sp.id + sp.popD]; if (pp && run.t < pp.t0) return false; }   // sit in the hole until the pop takes over
    return Pz.done;
  }
  // a hit is no shatter: the ball KICKS (the clonk, wood chips, sparks); the engine marks it taken
  shatter(point) {
    if (!this.alive) return;
    this.alive = false; this.shootable = false;
    if (HIT.get(this.sp) == null) this.provT = this.run ? this.run.t : null;   // versus: optimistic until the host says so
    this.group.updateMatrixWorld(true);
    const p = point || this.group.getWorldPosition(new THREE.Vector3());
    T.sparks(p, 6, ['lemon', 'yellow', 'bone'], 1.4, 0.035);
    for (let k = 0; k < 6; k++) T.spawnChip(p, _tv.set(R.rnd(-1.5, 1.5), R.rnd(0.5, 2.5), R.rnd(0, 1.5)), R.rnd(0.03, 0.05), [PAL.sand, PAL.tan, PAL.chestnut][k % 3], R.rnd(0.6, 1.0));
    B.SFX.play('ballKick', { u: uOf(p.x) });
  }
}

// =========================================================================================
// THE POP: a plate / bomb / decoy / gold plate / the duck rising out of a pocket on its stand. Pose: a pure function of
// (spawn, local time - its release offset). The ball waits in the hole (the pocket pulses) until the pop rises.
// =========================================================================================
function popPose(sp, q, o) {
  o.vis = q >= 0; o.shootable = false; o.done = false; o.rx = -TH; o.sc = 0.3; o.sink = 0.3; o.phase = 'wait';
  if (q < 0) return o;
  const sw = sp.swing, st = sp.stay, lv = sp.lv;
  if (q < sw) { const k = E.outBack(q / sw), k1 = Math.min(1, q / sw * 1.6); o.phase = 'in'; o.rx = -TH * (1 - k); o.sc = 0.3 + 0.7 * k1; o.sink = 0.3 * (1 - k1); o.shootable = q >= sp.ra; return o; }
  if (q < sw + st) { const tau = q - sw; o.phase = 'up'; o.rx = 0.12 * Math.exp(-5 * tau) * Math.sin(15 * tau); o.sc = 1; o.sink = 0; o.shootable = true; return o; }
  const r = q - sw - st;
  if (r < lv) { const k = E.inCubic(r / lv); o.phase = 'out'; o.rx = -TH * k; o.sc = 1 - 0.7 * k; o.sink = 0.3 * k; o.shootable = r / lv < 0.7; return o; }
  o.done = true; o.vis = false; return o;
}
const lifeOf = sp => sp.swing + sp.stay + sp.lv;
const spanOf = sp => sp.swing - sp.ra + sp.stay + 0.7 * sp.lv;
// #88 shot-driven member release (the hive's rule): pure in the timeline + the shared hit stage times
function releaseAt(sp, get, hitT) {
  const ch = [sp];
  for (let q = sp; q.chD; ) { q = get(q.id - q.chD); if (!q) break; ch.unshift(q); }
  const A = [ch[0].t0 + (ch[0].chD ? ch[0].chR || 0 : 0)];
  for (let j = 1; j < ch.length; j++) {
    const m = ch[j], h = hitT(ch[j - 1]);
    let a = A[j - 1] + m.chS;
    if (h != null) a = Math.min(a, h + m.chX);
    if (m.chF && j >= m.chF) { const o = ch[j - m.chF], ho = hitT(o), gone = A[j - m.chF] + lifeOf(o); a = Math.max(a, ho != null ? Math.min(ho + FOLD_T, gone) : gone); }
    A.push(Math.max(m.t0, Math.min(a, m.t0 + m.chR)));
  }
  return A[A.length - 1];
}
const _pw = new THREE.Vector3();
class Pop extends T.Target {
  constructor(sp, run) {
    super(sp.kind === 'kick' ? 'target' : sp.bomb && !sp.hidden ? 'bomb' : 'target');
    const G = geos(); this.sp = sp; this.run = run; this.P = {}; this.lastLt = 0; this.deadLt = -1; this.revealLt = -1; this.armLt = -1;
    this.announced = false; this.off = 0; this.res = null; this.prop = null; this.pk = sp.pk != null ? sp.pk : 0;
    this.hinge = new THREE.Group(); this.group.add(this.hinge);
    this.stand = shared(G.stand); this.stand.raycast = () => {}; this.hinge.add(this.stand);
    this.wball = shared(G.ball); this.wball.raycast = () => {}; this.group.add(this.wball); this.wball.visible = false;
    if (sp.kind !== 'kick') this.build(sp.duck ? 'duck' : sp.gold ? 'gold' : sp.decoy ? 'decoy' : sp.bomb && !sp.hidden ? 'bomb' : 'plate', sp.pk);
    this.group.visible = false;
  }
  build(kind, pk) {
    const sp = this.sp, o = { size: PS };
    this.ptype = kind; this.pk = pk;
    if (kind === 'decoy') o.variant = decoyPick(sp.id);
    this.prop = kind === 'duck' ? duckProp() : kind === 'decoy' ? P.decoy(o) : kind === 'bomb' ? P.bomb(o) : P.paddle(kind === 'gold' ? { size: PS, color: 'amber' } : o);
    mountProp(this.prop, this.hinge); this.prop.register(this); this.cur = this.prop;
    if (kind === 'decoy') this.prop.floor = -1.6;
    this.prop.group.visible = false;
    this.kind = kind === 'bomb' || kind === 'decoy' ? 'bomb' : 'target';
    if (sp.hidden) {                                    // the bomb behind the plate: built now, out of sight, not a hit part yet
      this.hinge2 = new THREE.Group(); this.hinge2.rotation.x = -TH; this.group.add(this.hinge2);
      this.hb = P.bomb({ size: PS }); mountProp(this.hb, this.hinge2); this.pHidden = this.hb.register(this)[0]; this.parts.pop(); this.hinge2.visible = false;
    }
    bw(sp.L, PKUV[pk][0], PKUV[pk][1], 0, this.hinge.position); this.base = this.hinge.position.clone();
    if (this.hinge2) this.hinge2.position.copy(this.base);
    bw(sp.L, PKUV[pk][0], PKUV[pk][1], -0.04, this.wball.position); this.wball.scale.setScalar(0.9);
  }
  update(lt, run) {
    const sp = this.sp, tl = run.timeline;
    if (sp.kind === 'kick') {                          // a latent kick pop: only if its ball was shot (the shared hit)
      const ball = tl[sp.id - sp.ballD], h = ball ? HIT.get(ball) : null;
      if (h == null) { this.group.visible = false; this.shootable = false; return sp.t0 + lt > ball.t0 + ball.Tr + ball.Ta + (run.versus ? 1.0 : 0.05); }
      if (!this.res) {
        this.res = kickResult(ball, h, tl.sk); this.build(this.res.kind, this.res.pk);
        if (this.res.kind === 'gold') B.SFX.play('jackpot', { u: uOf(laneX(sp.L)) });
      }
      this.off = this.res.tL + DROP + POP_LAG - sp.t0;
    } else {
      const ball = tl[sp.id - sp.ballD];
      if (ball && HIT.get(ball) != null && this.armLt < 0 && this.revealLt < 0) { this.group.visible = false; this.shootable = false; return true; }   // kicked away: never pops
      this.off = sp.chD ? releaseAt(sp, id => tl[id], hitOf) - sp.t0 : 0;
    }
    if (run.versus) this.off += VS_LAG;
    RELT.set(sp, this.off);
    const q = lt - this.off;
    if (this.revealLt >= 0) return this.updateReveal(q);
    if (this.armLt >= 0 && this.alive) return this.updateArm(q);
    const Pz = popPose(sp, q, this.P); this.lastLt = q;
    if (!this.alive) { if (this.deadLt < 0) this.deadLt = q; this.wball.visible = false; return q - this.deadLt > 0.6 || Pz.done; }
    this.group.visible = true;
    const pi = sp.L * NPK + this.pk;
    this.wball.visible = (sp.kind !== 'kick' || q >= -POP_LAG) && q < sp.swing * 0.35;
    if (q < 0) { if (this.wball.visible) PULSE[pi] = performance.now() / 1000; this.prop.group.visible = false; this.stand.visible = false; this.shootable = false; return false; }
    this.prop.group.visible = Pz.vis; this.stand.visible = Pz.vis;
    this.hinge.position.copy(this.base).addScaledVector(NRM, -Pz.sink); this.hinge.rotation.x = Pz.rx; this.hinge.scale.setScalar(Pz.sc);
    this.shootable = Pz.shootable;
    if (Pz.vis) {
      if (this.ptype === 'decoy') this.prop.wobble(q);
      if (this.kind === 'bomb') this.prop.sparkle(q, false);
      if (!this.announced) {
        this.announced = true; const u = uOf(laneX(sp.L));
        if (this.ptype === 'duck') B.SFX.play('duckCameo', { u });
        else if (this.ptype === 'gold' && sp.pi === 0 && sp.patKind === 'J') B.SFX.play('jackpot', { u });
        B.SFX.play('targetIn', { u });
      }
    }
    return Pz.done;
  }
  // decoy build-up: frozen where it was hit, the disguise falls away, the bare bomb swells with a flaring fuse
  updateArm(q) {
    const k = Math.min(1, (q - this.armLt) / DECOY_UNMASK), Pz = popPose(this.sp, this.armLt, {});
    this.lastLt = q; this.shootable = false; this.group.visible = true; this.prop.group.visible = true;
    this.prop.unmask(E.outCubic(k));
    this.hinge.rotation.x = Pz.rx * (1 - k);
    this.prop.pivot.scale.setScalar(1 + 0.16 * E.inCubic(Math.min(1, (q - this.armLt) / DECOY_ARM)));
    this.prop.sparkle(q, true); if (this.prop.spark) this.prop.spark.scale.multiplyScalar(1.3 + 1.1 * Math.min(1, (q - this.armLt) / DECOY_ARM));
    if ((this.autoBoom && q - this.armLt >= DECOY_ARM - 1e-3) || q - this.armLt >= DECOY_ARM + 0.4) this.explode(this.boomPoint);
    return false;
  }
  // Run.applyPenalty hook (stage.js deferred penalty): a decoy arms and returns its bang time; anything else blows now
  arm(point, st) {
    if (this.ptype !== 'decoy' || this.revealLt >= 0 || !this.alive) return -1;
    if (this.armLt < 0) {
      this.armLt = st != null ? st - this.sp.t0 - this.off : this.lastLt; this.shootable = false; this.boomPoint = point || null;
      this.group.updateMatrixWorld(true);
      if (this.prop.spark) T.sparks(new THREE.Vector3().setFromMatrixPosition(this.prop.spark.matrixWorld), 8, ['lemon', 'yellow', 'orange'], 1.5, 0.035);
      B.SFX.play('bombReveal', { u: uOf(laneX(this.sp.L)) });
    }
    return +(this.sp.t0 + this.off + this.armLt + DECOY_ARM).toFixed(4);
  }
  // the hidden bomb: springs up out of the pocket where the plate stood, sparks hot for the beat, goes back down
  updateReveal(q) {
    const r = q - this.revealLt; this.lastLt = q; this.group.visible = true;
    if (!this.alive) { if (this.deadLt < 0) this.deadLt = q; return q - this.deadLt > 0.5; }
    const g = Math.min(1, r / HB_GRACE), d = Math.max(0, (r - HB_BEAT) / this.sp.lv);
    this.hinge2.rotation.x = d > 0 ? -TH * E.inCubic(Math.min(1, d)) : -TH * (1 - E.outBack(g));
    this.hinge2.scale.setScalar(d > 0 ? 1 - 0.7 * E.inCubic(Math.min(1, d)) : 0.4 + 0.6 * g);
    this.shootable = r >= HB_GRACE && d < 0.7;
    this.hb.sparkle(q, true); this.hb.spark.scale.multiplyScalar(1.45);
    return d >= 1;
  }
  reveal() {
    this.revealLt = this.lastLt; this.alive = true; this.kind = 'bomb'; this.shootable = false; this.deadLt = -1;
    this.parts = [this.pHidden]; this.hinge2.visible = true; this.hb.show(); this.cur = this.hb; this.stand.visible = true; this.hinge.scale.setScalar(1);
    this.group.visible = true; this.group.updateMatrixWorld(true);
    T.sparks(_pw.copy(this.base).add(new THREE.Vector3(0, 0.5, 0.3)), 7, ['lemon', 'yellow', 'orange'], 1.4, 0.035);
    B.SFX.play('bombReveal', { u: uOf(laneX(this.sp.L)) });
  }
  shatter(point, opts) {
    if (this.revealLt >= 0 && !this.boom) return;      // a late hit confirmation for the plate (versus): the bomb stays
    super.shatter(point, opts);
    this.group.visible = true; if (this.cur) this.cur.hide();
    this.deadLt = this.lastLt; this.wball.visible = false;
    if (this.ptype === 'duck') B.SFX.play('duckCameoHit', { u: uOf(laneX(this.sp.L)) });
    if (this.hb && this.revealLt < 0) this.reveal();
  }
  explode(point) {
    if (this.ptype === 'decoy' && this.revealLt < 0 && this.alive) {   // a decoy: build up first, then the bang
      if (this.armLt < 0) this.arm(point, null);
      if (this.lastLt - this.armLt < DECOY_ARM - 1e-3) { this.autoBoom = true; if (point) this.boomPoint = point; return; }
    }
    if (this.hb && this.revealLt < 0) this.shatter(point);
    this.boom = true;
    const f = this.parts[0].mesh; f.updateMatrixWorld(true);
    const c = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    T.burst(c, 0.8);
    this.shatter(point || c, { power: 1.7, max: 60 });
    this.cur.pivot.scale.setScalar(1);
  }
}
// the director spawn: owns the shuffle bells, the FINALE (quota met, versus always: the ticket dispensers spray, the prize
// wall's bulbs spell B.L.A.M.) and holds the stage FIN_HOLD s after the last pop
class Board extends T.Target {
  constructor(sp, run) { super('fx'); this.sp = sp; this.run = run; this.rung = new Set(); this.fin = -1; if (FIN.run !== run) { FIN.run = run; FIN.t = -1; } }
  meshes() { return []; }
  update(lt, run) {
    const sp = this.sp, t = sp.t0 + lt;
    for (const s of sp.shuf.s) if (!this.rung.has(s.t) && t >= s.t - BLINK && t < s.t + 0.2) { this.rung.add(s.t); B.SFX.play('shuffleBell', { wave: s.wave ? 1 : 0 }); }
    if (this.fin < 0 && t >= sp.last && run.state === 'play' && (run.versus || (run.me.hits >= run.cfg.quota && run.me.lives > 0))) {
      this.fin = t; FIN.run = run; FIN.t = t;
      B.SFX.play('ticketSpray'); B.SFX.play('finale');
    }
    if (this.fin >= 0 && t - this.fin < FIN_SPRAY && inPlay() && (((t * 30) | 0) & 1)) spray(1 - (t - this.fin) / FIN_SPRAY);
    return t >= sp.last + (this.fin >= 0 ? FIN_HOLD : 1.0);
  }
}
function makeTarget(sp, run) {
  if (sp.kind === 'board') return new Board(sp, run);
  if (sp.kind === 'ball') return new Ball(sp, run);
  return new Pop(sp, run);
}

// =========================================================================================
// The dials per tier (variant 0). time = the director's stream (the clock adds FIN_SLOT) | roll / air = BALL SPEED (s up the
// lane / in the air), apex = the arc's height | win / swing / lv = the POP WINDOW / rise / sink | fly = balls in flight at
// once | live = pops up at once | gap / burst / bgap / pause = the stream | hop / alt / adj = AIM TRAVEL (x the pocket
// field's diagonal) | decep = a single is a bomb, kinds [red-pocket bomb, hidden, decoy], bombCap | trick = a beat is a
// pattern; beat (row), vbeat (volley releases), snake, pp (ping-pong) s; vRed = red pockets a volley may climb into |
// waves = shuffles between them, mid = chance of a mid-wave shuffle, reds = red pockets per board, swapB = boards that
// swap a pair in a shuffle, swapP = pairs per board, every = the LIGHTS SHUFFLE variant's spacing | spare / share / rel
// =========================================================================================
const TIER_P = [
  { time: 46, roll: 1.55, air: 0.95, apex: 1.15, win: 1.3, swing: 0.5, lv: 0.32, fly: 2, live: 4, gap: [0.45, 0.85], burst: 0.22, bgap: [0.35, 0.5], pause: [0.7, 1.1],
    hop: [0.12, 0.38], alt: 0.25, adj: 0.12, decep: 0.16, kinds: [0.5, 0.2, 0.3], bombCap: 0.2, trick: 0.3, beat: 0.62, vbeat: 0.45, snake: 0.7, pp: 0.75, vRed: 1,
    waves: 4, mid: 0, reds: [1, 2], swapB: [2, 3], swapP: [1, 1], every: [5.0, 6.5], spare: 8, share: 0.55, rel: 0.75 },
  { time: 42, roll: 1.25, air: 0.82, apex: 1.0, win: 1.0, swing: 0.4, lv: 0.28, fly: 3, live: 4, gap: [0.4, 0.75], burst: 0.26, bgap: [0.3, 0.45], pause: [0.75, 1.1],
    hop: [0.3, 0.55], alt: 0.45, adj: 0.15, decep: 0.22, kinds: [0.45, 0.22, 0.33], bombCap: 0.27, trick: 0.33, beat: 0.5, vbeat: 0.38, snake: 0.55, pp: 0.6, vRed: 1,
    waves: 4, mid: 0.3, reds: [2, 2], swapB: [3, 4], swapP: [1, 1], every: [4.4, 5.6], spare: 5, share: 0.6, rel: 0.7 },
  { time: 38, roll: 1.0, air: 0.68, apex: 0.85, win: 0.7, swing: 0.3, lv: 0.24, fly: 3, live: 3, gap: [0.35, 0.65], burst: 0.3, bgap: [0.26, 0.38], pause: [0.7, 1.0],
    hop: [0.45, 0.75], alt: 0.65, adj: 0.17, decep: 0.28, kinds: [0.4, 0.23, 0.37], bombCap: 0.33, trick: 0.35, beat: 0.4, vbeat: 0.32, snake: 0.42, pp: 0.48, vRed: 1,
    waves: 5, mid: 0.6, reds: [2, 2], swapB: [4, 5], swapP: [1, 1], every: [3.8, 4.8], spare: 3, share: 0.64, rel: 0.62 },
  { time: 34, roll: 0.8, air: 0.55, apex: 0.72, win: 0.45, swing: 0.22, lv: 0.2, fly: 4, live: 3, gap: [0.25, 0.5], burst: 0.34, bgap: [0.22, 0.3], pause: [0.6, 0.9],
    hop: [0.6, 1.0], alt: 0.85, adj: 0.2, decep: 0.34, kinds: [0.35, 0.24, 0.41], bombCap: 0.38, trick: 0.37, beat: 0.32, vbeat: 0.26, snake: 0.34, pp: 0.4, vRed: 2,
    waves: 5, mid: 1.0, reds: [2, 3], swapB: [5, 5], swapP: [1, 2], every: [3.2, 4.2], spare: 2, share: 0.68, rel: 0.55 }
];
const VARIANT_NAMES = ['BOARDWALK', 'TICKET RUSH', 'LIGHTS SHUFFLE'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.win = +(b.win * (1 - 0.05 * v)).toFixed(3);
  c.decep = +(b.decep + 0.02 * v).toFixed(3); c.trick = +(b.trick + 0.02 * v).toFixed(3);
  c.share = Math.min(0.9, b.share + 0.02 * v - (v ? 0.05 : 0));   // the magazine variants pay for the reach to reload
  if (v === 1) { c.fly = b.fly + 1; c.gap = [+(b.gap[0] * 0.85).toFixed(3), +(b.gap[1] * 0.85).toFixed(3)]; c.burst = b.burst + 0.08; }   // TICKET RUSH: more balls in flight
  c.constant = v === 2;                                 // LIGHTS SHUFFLE: shuffles all round
  c.time = b.time + FIN_SLOT; c.finSlot = FIN_SLOT;
  c.slack = c.spare; c.quota = 8;                       // placeholder: timeline() derives the real quota
  c.autoReload = false; c.decoy = true; c.hiddenBomb = true; c.patterns = true; c.shuffle = true; c.kick = true;   // every mechanic at every tier
  c.ammo = ['unlimited', { mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: false }][v];
  c.tier = tier; c.variant = v; c.title = 'SKEE BALL'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
const AIM_KY = 1.8, SIDE_DZ = 20, OUTER_MAX = 2, MID_SHARE = 0.25;
const SEQ_BASE = { R: c => c.beat, V: c => c.vbeat, P: c => c.pp }, SEQ_F = { R: 0, V: 1, P: 2 };
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
const isPop = s => s.kind === 'pop';
const isReq = s => isPop(s) && (!s.bomb || !!s.hidden) && !s.duck;   // a shot a perfect player spends
const isReal = s => isPop(s) && !s.bomb && !s.duck;                  // counts toward the quota's base (gold plates too)
const landOf = b => b.t0 + b.Tr + b.Ta, holeOf = b => landOf(b) + DROP;

// ---------- timeline: the DIRECTOR. Every spawn from the seeded rng only. ----------
// 1. The colour schedule (sk): pockets per board red / green, shuffles at the wave breaks (+ mid-wave by tier; LIGHTS
//    SHUFFLE all round), each swapping green / red pairs on some boards. A pocket a ball is sent to keeps its colour from
//    0.12 s before the landing until its pop is gone (+ the next telegraph): a swap may catch a ball IN THE AIR (it lands
//    under the new colours), never a waiting ball or a standing pop; nothing is in the air through a WAVE shuffle.
// 2. Beats: a single (one ball), a burst of 2-3, or a pattern, with anticipation pauses. A single: the fair bomb rules
//    pick its kind (red-pocket bomb / plate / plate with a hidden bomb / decoy), the AIM rule picks the board + a pocket of
//    the right colour at its landing time (closest to the wanted hop from the last plate you were made to aim at, the
//    other side / height preferred, +2 next to a pop already up, at most OUTER_MAX singles in a row on an outer board).
//    One pop per board at a time (a board is booked from the ball's take-off to its pop's end, kick included).
// 3. Patterns take the boards to themselves: ROW (R), VOLLEY (V), SNAKE (S), PING-PONG (P), JACKPOT RAIN (J).
// 4. Reload-aware pass (magazine variants), shot-driven conversion (R / V / P, #88), a latent KICK spawn per ball.
// Spawn fields: ball { L, pk, Tr, Ta, h, side, ra, readyAt, popD }; pop { L, pk, ballD, swing, stay, lv, ra, readyAt,
// bomb, hidden, decoy, gold, duck, pat, patKind, pi, trick, chD / chS / chX / chF / chR }; kick { L, ballD, swing, stay,
// lv, ra }; board { last, shuf }. The array carries the schedule as a non-enumerable .sk (not in the hash: it is the
// board spawn's shuf).
function timeline(c, rng) {
  rng(); rng(); rng();                                  // (mulberry32's first draws barely mix nearby seeds)
  const out = [], TIME = c.time - (c.finSlot || 0), tier = c.tier | 0;
  // ---- 1. colours + shuffles
  const m0 = [];
  for (let L = 0; L < NL; L++) { const nr = rng.int(c.reds[0], c.reds[1]), red = new Set(); while (red.size < nr) red.add(rng.int(0, 4)); for (let k = 0; k < 5; k++) m0.push(red.has(k) ? 1 : 0); }
  const ST = [];
  if (c.constant) { for (let s = rng.range(3.4, 4.6); s < TIME - 2.5; s += rng.range(c.every[0], c.every[1])) ST.push({ t: s, wave: false }); }
  else {
    const wl = TIME / c.waves;
    for (let w = 0; w < c.waves; w++) {
      if (w > 0) ST.push({ t: w * wl + rng.range(-0.6, 0.6), wave: true });
      if (rng() < c.mid) ST.push({ t: w * wl + wl * rng.range(0.4, 0.7), wave: false });
    }
  }
  ST.sort((a, b) => a.t - b.t);
  const SS = []; for (const s of ST) if (s.t > 3 && s.t < TIME - 2 && (!SS.length || s.t - SS[SS.length - 1].t > 2.4)) SS.push(s);
  let mm = m0;
  for (const s of SS) {
    mm = mm.slice();
    const nb = rng.int(c.swapB[0], c.swapB[1]), boards = [0, 1, 2, 3, 4];
    for (let i = 0; i < nb; i++) {
      const L = boards.splice(rng.int(0, boards.length - 1), 1)[0], np = rng.int(c.swapP[0], c.swapP[1]);
      for (let p = 0; p < np; p++) {
        const g = [], r = []; for (let k = 0; k < 5; k++) (mm[L * 5 + k] ? r : g).push(k);
        if (!g.length || !r.length) break;
        const a = g[rng.int(0, g.length - 1)], b = r[rng.int(0, r.length - 1)];
        mm[L * 5 + a] = 1; mm[L * 5 + b] = 0;
      }
    }
    s.t = +s.t.toFixed(3); s.m = mm;
  }
  const sk = { m0, s: SS.map(s => ({ t: s.t, m: s.m, wave: s.wave })) };
  const col = (L, k, t) => colAt(sk, L, k, t);
  // a pocket must keep its colour from 0.12 s before its ball lands (a swap while the ball is in the air is the point:
  // it lands under the NEW colours) until its pop is gone + the next telegraph (no swap under a waiting ball / a standing pop)
  const stable = (L, k, land, end) => { for (const s of sk.s) { if (s.t <= land - 0.12 || s.t - BLINK > end) continue; if (col(L, k, s.t - 1e-4) !== col(L, k, s.t + 1e-4)) return false; } return true; };
  // ---- bookkeeping
  const balls = [], pops = [], occ = [];
  const MARG = c.ammo && c.ammo.mag ? c.rel + 0.8 : 0;
  const ra = +(c.swing * 0.15).toFixed(3);
  let bombs = 0, lastAim = null, xUntil = 0, nTrick = 0, lastTrick = '', outerRun = 0, nSingle = 0, nMid = 0;
  const hasDuck = rng() < 0.2; let duckPlaced = false;
  const count = {}, used = k => count[k] || 0;
  const busy = (L, a, b) => occ.some(o => o.L === L && o.a < b + 0.1 && o.b + 0.1 > a);
  const upAt = t => occ.filter(o => o.ua <= t && o.ub > t);
  const flying = t => balls.filter(b => b.t0 + b.Tr <= t && landOf(b) > t);   // IN THE AIR (take-off .. landing)
  function mkBall(t, L, pk, o = {}) {
    const Tr = +(o.Tr != null ? o.Tr : c.roll * rng.range(0.95, 1.05)).toFixed(3), Ta = +(o.Ta != null ? o.Ta : c.air * rng.range(0.95, 1.05)).toFixed(3), sd = rng() < 0.5 ? -1 : 1;
    return { id: 0, t0: +t.toFixed(3), t1: 0, kind: 'ball', L, pk, Tr, Ta, h: +(o.h || c.apex).toFixed(3), side: pk === 5 ? -1 : pk === 6 ? 1 : sd, ra: +(Tr + 0.03).toFixed(3), readyAt: +(Tr + 0.03).toFixed(3) };
  }
  function mkPop(b, o = {}) {
    return { id: 0, t0: +(holeOf(b) + POP_LAG).toFixed(3), t1: 0, kind: 'pop', L: b.L, pk: b.pk, swing: c.swing, stay: +(o.stay != null ? o.stay : c.win).toFixed(3), lv: c.lv, ra, readyAt: ra, bomb: false, _ball: b };
  }
  const popEnd = p => p.t0 + lifeOf(p) + (p.hidden ? HB_BEAT + p.lv : 0);
  const finPop = p => { p.t1 = +(popEnd(p) + VS_LAG).toFixed(3); return p; };
  const finBall = b => { b.t1 = +(landOf(b) + KICK_T + DROP + POP_LAG + 0.05).toFixed(3); return b; };
  function book(b, p, ghost) {
    const a = landOf(b) - 0.1, e = Math.max(popEnd(p), landOf(b) + KICK_T + DROP + POP_LAG + lifeOf(p));
    occ.push({ L: b.L, a, b: e + MARG, ua: p.t0, ub: popEnd(p), bomb: !!p.bomb && !p.hidden, ghost: !!ghost });
  }
  function commit(b, p) {
    finBall(b); finPop(p); balls.push(b); pops.push(p); out.push(b, p);
    if (p.bomb && !p.hidden) bombs++;
  }
  const aimed = p => { lastAim = POCKETS[p.L * NPK + p.pk].s; };
  const trailing = () => { let n = 0; for (let i = pops.length - 1; i >= 0 && pops[i].bomb && !pops[i].hidden; i--) n++; return n; };
  const lastPlain = () => { const s = pops[pops.length - 1]; return !!s && s.bomb && !s.hidden && !s.decoy; };
  // the aim rule: the best (board, pocket) for a ball taking off at ta, landing at tl, popping at tp for `life` s
  function slot(ta, tl, tp, life, want, o = {}) {
    const D = o.D, cands = [];
    for (let L = 0; L < NL; L++) {
      if (busy(L, tl - 0.1, tp + life + KICK_T + 0.1 + MARG)) continue;   // the board is free from the landing (a ball may fly in over a pop going down)
      for (let k = 0; k < (want === 2 ? NPK : 5); k++) {
        if (want === 2 ? k < 5 : col(L, k, tl) !== want) continue;
        if (!stable(L, k, tl, tp + life)) continue;
        const p = POCKETS[L * NPK + k].s; let s = 0;
        if (lastAim && D != null) {
          s = Math.abs(hyp(p[0] - lastAim[0], AIM_KY * (p[1] - lastAim[1])) - D) / CD;
          const sd = x => x < CX - SIDE_DZ ? -1 : x > CX + SIDE_DZ ? 1 : 0;
          if (sd(p[0]) * sd(lastAim[0]) > 0) s += 0.35 * c.alt;
          if ((p[1] < CY) === (lastAim[1] < CY)) s += 0.2 * c.alt;
        }
        if (o.single) {
          if ((L === 0 || L === NL - 1) && outerRun >= OUTER_MAX) s += 2.5;
          if (L === 2 && nSingle >= 2 && nMid < MID_SHARE * (nSingle + 1)) s -= 0.3;
        }
        for (const q of occ) if (q.ua <= tp + 0.3 && q.ub > tp) { const Q = POCKETS[q.L * NPK].s; if (Math.abs(Q[0] - p[0]) < c.adj * CD + 2 * PLATE_PX + 20) s += 2; }
        cands.push([s, L, k]);
      }
    }
    if (!cands.length) return null;
    for (const cd of cands) cd[0] += rng() * 0.1;
    cands.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    return { L: cands[0][1], k: cands[0][2] };
  }
  // ---- one single ball released at t: returns its pop's end, or -1 (no room)
  function single(t, force) {
    const roll = rng(), tyR = rng(), Tr = +(c.roll * rng.range(0.95, 1.05)).toFixed(3), Ta = +(c.air * rng.range(0.95, 1.05)).toFixed(3);
    const tl = t + Tr + Ta, tp = tl + DROP + POP_LAG;
    const up = upAt(tp), goodUp = up.filter(o => !o.bomb && o.ub > tp + 0.5).length, bombsUp = up.filter(o => o.bomb).length;
    let kind = force || 'plate';
    if (!force && pops.length > 1 && roll < c.decep && trailing() < 2 && bombs + 1 <= c.bombCap * (pops.length + 1) + 0.5 && bombsUp <= goodUp) {
      let ty = pickW(c.kinds, tyR); if (ty === 0 && lastPlain()) ty = 2;
      kind = ['bomb', 'hidden', 'decoy'][ty];
    }
    const stay = kind === 'duck' ? Math.max(c.win * 1.4, 0.8) : c.win, life = c.swing + stay + c.lv + (kind === 'hidden' ? HB_BEAT + c.lv : 0);
    if (tp + life > TIME - 0.2) return -1;
    const S = slot(t + Tr, tl, tp, life, kind === 'bomb' ? 1 : kind === 'duck' ? 2 : 0, { D: rng.range(c.hop[0], c.hop[1]) * CD, single: !force });
    if (!S) return -1;
    const b = mkBall(t, S.L, S.k, { Tr, Ta }), p = mkPop(b, { stay });
    if (kind === 'bomb') p.bomb = true; else if (kind === 'hidden') { p.bomb = true; p.hidden = true; } else if (kind === 'decoy') { p.bomb = true; p.decoy = true; } else if (kind === 'duck') p.duck = true;
    commit(b, p); book(b, p);
    if (!force) { nSingle++; if (S.L === 2) nMid++; outerRun = S.L === 0 || S.L === NL - 1 ? outerRun + 1 : 0; }
    if (kind === 'plate' || kind === 'hidden') aimed(p);
    count['single_' + kind] = used('single_' + kind) + 1;
    return popEnd(p);
  }
  // nearest pocket of colour `want` to ring index `ring` on board L at time t (-1: none)
  function nearestCol(L, ring, want, t) {
    for (let d = 0; d < 5; d++) for (const k of [ring + d, ring - d]) if (k >= 0 && k < 5 && col(L, k, t) === want) return k;
    return -1;
  }
  // ---- PATTERNS: mem = [{ b, p }], finish() checks room (time, boards, no shuffle inside), commits and books
  function finish(mem, kind, sub) {
    let end = 0, first = 1e9;
    for (const m of mem) { end = Math.max(end, popEnd(m.p)); first = Math.min(first, landOf(m.b)); }
    if (end > TIME - 0.2) return 0;
    for (const m of mem) if (!stable(m.b.L, m.b.pk, landOf(m.b), popEnd(m.p))) return 0;
    const byL = new Map();
    for (const m of mem) { const w = byL.get(m.b.L) || [1e9, 0]; w[0] = Math.min(w[0], landOf(m.b) - 0.1); w[1] = Math.max(w[1], popEnd(m.p), landOf(m.b) + KICK_T + DROP + POP_LAG + lifeOf(m.p)); byL.set(m.b.L, w); }
    for (const [L, w] of byL) if (busy(L, w[0], w[1] + MARG)) return 0;
    const pi = nTrick++;
    mem.forEach((m, j) => { m.p.pat = pi; m.p.patKind = kind; m.p.pi = j; if (sub) m.p.trick = sub; commit(m.b, m.p); });
    for (const [L, w] of byL) occ.push({ L, a: w[0], b: w[1] + MARG, ua: Math.min(...mem.filter(m => m.b.L === L).map(m => m.p.t0)), ub: w[1], bomb: false });
    for (const m of mem.slice().sort((a, b) => a.p.t0 - b.p.t0)) if (isReq(m.p)) aimed(m.p);
    xUntil = Math.max(xUntil, end - c.roll * 0.6);
    count[kind] = used(kind) + 1; lastTrick = kind; count[kind + ':' + sub] = used(kind + ':' + sub) + 1;
    return end;
  }
  const flight = () => c.roll + c.air + DROP + POP_LAG;
  // ROW: N balls across adjacent lanes at once; they land in a ripple and wait in their holes; the pops come across the
  // boards on the beat (shot-driven). First row clean; later clean / a DECOY on the beat / OFF BEAT / a RED pocket in the row
  function row(s) {
    const N = rng.int(3, 5), L0 = rng.int(0, NL - N), dir = rng() < 0.5 ? 1 : -1, ring = rng.int(0, 4);
    const sr = rng(), sub = !used('R') ? 'beat' : sr < 0.2 ? 'beat' : sr < 0.45 ? 'decoy' : sr < 0.75 ? 'off' : 'red';
    const dm = sub === 'decoy' || sub === 'red' ? rng.int(2, N - 1) : -1, early = rng() < 0.5, beat = c.beat, stay = Math.max(c.win, beat * 1.2);
    const mem = [];
    for (let i = 0; i < N; i++) {
      const L = dir > 0 ? L0 + i : L0 + N - 1 - i, b = mkBall(s, L, 0, { Tr: c.roll + i * 0.07, Ta: c.air });
      const k = nearestCol(L, ring, i === dm && sub === 'red' ? 1 : 0, landOf(b)); if (k < 0) return 0;
      b.pk = k; mem.push({ b, p: null });
    }
    let tt = Math.max(...mem.map(m => holeOf(m.b))) + POP_LAG + 0.12;
    mem.forEach((m, i) => {
      if (i && sub === 'off' && i === 3) tt += early ? beat * 0.45 : beat * 1.9; else if (i) tt += beat;
      const p = mkPop(m.b, { stay }); p.t0 = +tt.toFixed(3);
      if (i === dm) { p.bomb = true; if (sub === 'decoy') p.decoy = true; }
      m.p = p;
    });
    return finish(mem, 'R', sub === 'off' && N < 4 ? 'beat' : sub);
  }
  // VOLLEY: 3-5 balls up ONE lane on a beat into a column of rings climbing up the board; they wait in their holes and pop
  // one after another (shot-driven, each after the one before is gone); a red ring in the column pops a bomb
  function volley(s) {
    const N = rng.int(3, 4), L = rng.int(0, NL - 1), r0 = rng.int(0, 5 - N), vb = c.vbeat;
    const mem = []; let reds = 0;
    for (let i = 0; i < N; i++) {
      const b = mkBall(s + i * vb, L, r0 + i, { Tr: c.roll, Ta: c.air });
      if (col(L, r0 + i, landOf(b)) === 1) { if (i === 0) return 0; reds++; }
      mem.push({ b, p: null });
    }
    if (reds > c.vRed) return 0;
    let tt = holeOf(mem[0].b) + POP_LAG; const vst = +Math.max(0.4, c.win * 0.75).toFixed(3);   // a volley pop stays a bit shorter (the column keeps moving)
    mem.forEach((m, i) => {
      if (i) tt = Math.max(tt + c.swing + vst + c.lv + 0.05, holeOf(m.b) + POP_LAG);
      const p = mkPop(m.b, { stay: vst }); p.t0 = +tt.toFixed(3); if (col(L, m.b.pk, landOf(m.b)) === 1) p.bomb = true; m.p = p;
    });
    const last = mem[N - 1].p;
    if (used('V') && !last.bomb && rng() < 0.25 + 0.08 * tier) { last.bomb = true; last.decoy = true; }
    return finish(mem, 'V', reds ? 'red' + reds : last.decoy ? 'decoy' : 'clean');
  }
  // SNAKE: across the boards one after another (2-3 lit at once), up one ring, down the next; 6 at Very Hard / Insane
  // (back to the middle board); the last one a red-pocket bomb or a decoy sometimes
  function snake(s) {
    const n = tier >= 3 ? 6 : tier === 2 && rng() < 0.5 ? 6 : 5, dir = rng() < 0.5 ? 1 : -1, dt = c.snake;
    const path = []; for (let i = 0; i < 5; i++) path.push(dir > 0 ? i : 4 - i); if (n > 5) path.push(2);
    const stay = +Math.max(0.3, Math.min(c.win, 2.6 * dt - c.swing - c.lv, n > 5 ? 3 * dt - c.swing - c.lv - 0.05 : 9)).toFixed(3);
    let up = rng() < 0.5; const lastBad = rng() < 0.3 + 0.08 * tier, lastDecoy = rng() < 0.6;
    const mem = [], f = flight();
    for (let i = 0; i < n; i++) {
      const L = path[i], tp = s + f + 0.15 + i * dt, b = mkBall(tp - f, L, 0, { Tr: c.roll, Ta: c.air });
      const ring = up ? rng.int(2, 4) : rng.int(0, 2); up = !up;
      const bad = i === n - 1 && lastBad, k = nearestCol(L, ring, bad && !lastDecoy ? 1 : 0, landOf(b)); if (k < 0) return 0;
      b.pk = k; const p = mkPop(b, { stay });
      if (bad) { p.bomb = true; if (lastDecoy) p.decoy = true; }
      mem.push({ b, p });
    }
    const L = mem[n - 1].p;
    return finish(mem, 'S', L.bomb ? (L.decoy ? '+decoy' : '+bomb') : 'clean');
  }
  // PING-PONG: two neighbouring boards, alternating (two green pockets per board, used in turn), shot-driven; then the
  // next ball drops into a RED pocket on the board whose turn it is (a decoy in a green one sometimes)
  function pingpong(s) {
    const A0 = rng.int(0, NL - 2), sw = rng() < 0.5, LA = sw ? A0 + 1 : A0, LB = sw ? A0 : A0 + 1;
    const N = rng.int(4, 6), dt = c.pp, stay = +Math.max(0.25, 2 * dt - 0.06 - c.swing - c.lv).toFixed(3), f = flight(), T0 = s + f + 0.3;
    const greens = L => { const g = []; for (let k = 0; k < 5; k++) if (col(L, k, T0) === 0) g.push(k); return g; };
    const GA = greens(LA), GB = greens(LB); if (GA.length < 2 || GB.length < 2) return 0;
    const pa = [GA[rng.int(0, GA.length - 1)]]; pa.push(GA.filter(k => k !== pa[0])[rng.int(0, GA.length - 2)]);
    const pb = [GB[rng.int(0, GB.length - 1)]]; pb.push(GB.filter(k => k !== pb[0])[rng.int(0, GB.length - 2)]);
    const dec = rng() < 0.2 + 0.07 * tier, mem = [];
    for (let i = 0; i <= N; i++) {
      const L = i & 1 ? LB : LA, tp = T0 + 0.5 * dt + i * dt, last = i === N;
      let k = (i & 1 ? pb : pa)[(i >> 1) & 1];
      if (last && !dec) { k = nearestCol(L, k, 1, T0); if (k < 0) return 0; }
      const b = mkBall(tp - f - 0.5 * dt, L, k, { Tr: c.roll, Ta: c.air }), p = mkPop(b, { stay }); p.t0 = +tp.toFixed(3);
      if (last) { p.bomb = true; if (dec) p.decoy = true; }
      mem.push({ b, p });
    }
    return finish(mem, 'P', dec ? 'decoy' : 'bomb');
  }
  // JACKPOT RAIN: a line of balls lobbed into the 100s of neighbouring boards (all on one side, so no two gold plates
  // touch): gold plates +500. Mixed from Advanced: some balls drop into a red pocket instead. The duck rides one sometimes.
  function jackpot(s) {
    const N = rng.int(3, 5), L0 = rng.int(0, NL - N), side = rng() < 0.5 ? 5 : 6, dir = rng() < 0.5 ? 1 : -1;
    const nRed = tier === 0 ? 0 : tier === 1 ? (rng() < 0.35 ? 1 : 0) : tier === 2 ? 1 : rng.int(1, 2);
    const reds = new Set(); while (reds.size < Math.min(nRed, N - 2)) reds.add(rng.int(1, N - 1));
    const duckI = hasDuck && !duckPlaced && rng() < 0.7 ? rng.int(0, N - 1) : -1;
    const stay = Math.max(c.win * 1.25, 0.6), mem = [];
    for (let i = 0; i < N; i++) {
      const L = dir > 0 ? L0 + i : L0 + N - 1 - i, b = mkBall(s + i * 0.2, L, side, { Tr: c.roll, Ta: +(c.air * 1.1).toFixed(3), h: c.apex * 1.3 });
      if (reds.has(i)) { const k = nearestCol(L, 4, 1, landOf(b)); if (k < 0) return 0; b.pk = k; }
      const p = mkPop(b, { stay }); if (reds.has(i)) p.bomb = true; else if (i === duckI && !reds.has(i)) p.duck = true; else p.gold = true;
      mem.push({ b, p });
    }
    const e = finish(mem, 'J', nRed ? 'mixed' + nRed : 'gold');
    if (e && mem.some(m => m.p.duck)) duckPlaced = true;
    return e;
  }
  const TRICKS = { R: row, V: volley, S: snake, P: pingpong, J: jackpot };
  const TW = { R: 1.5, V: 1.2, S: 1.0, P: 0.9, J: 0.55 }, CAP = { J: tier < 2 ? 1 : 2 };
  const pause = () => rng.range(c.pause[0], c.pause[1]);
  // ---- the loop (t = the next ball's release)
  let t = 0.8, guard = 0;
  while (guard++ < 2000 && t < TIME - 0.6) {
    if (t < xUntil) { t = xUntil; continue; }
    const f = flight();
    const ws = sk.s.find(s => s.wave && t + f > s.t - BLINK - 0.35 && t + c.roll < s.t + 0.25);   // the wave break: nothing in the AIR through a wave shuffle (balls may roll up during the bell)
    if (ws) { t = ws.t + 0.25 - c.roll * 0.7; continue; }
    const fl = flying(t + c.roll);                    // airborne when this ball would take off
    if (fl.length >= c.fly) { t = Math.max(t + 0.02, Math.min(...fl.map(landOf)) - c.roll + 0.02); continue; }
    const up = upAt(t + f);
    if (up.length >= c.live) { t = up.map(o => o.ub).sort((a, b) => a - b)[up.length - c.live] - f + 0.05; continue; }
    if (hasDuck && !duckPlaced && t > TIME * 0.72 && t < TIME - 4) { if (single(t, 'duck') > 0) { duckPlaced = true; t += pause(); continue; } }
    const trR = rng(), burR = rng();
    if (pops.length >= 2 && trR < c.trick && t < TIME - 4) {
      let s0 = t; for (const o of occ) s0 = Math.max(s0, o.b - c.roll - c.air + 0.25);   // the pattern's balls land as the boards come free for (const b of balls) s0 = Math.max(s0, landOf(b) - c.roll * 0.5);
      const W = Object.assign({}, TW); if (lastTrick) W[lastTrick] *= 0.15;
      for (const k in CAP) if (used(k) >= CAP[k]) W[k] = 0;
      let e = 0;
      for (let tries = 0; !e && tries < 3; tries++) { const keys = Object.keys(W), k = keys[pickW(keys.map(q => W[q]), rng())]; if (!W[k]) break; e = TRICKS[k](s0); W[k] = 0; }
      if (e) { t = Math.max(t, e - f - c.roll * 0.4) + pause(); continue; }
    }
    const n = burR < c.burst ? 2 + (rng() < 0.4 ? 1 : 0) : 1;
    let placed = 0;
    for (let i = 0; i < n; i++) { const r = single(t); if (r < 0) break; placed++; if (i < n - 1) t += rng.range(c.bgap[0], c.bgap[1]); }
    if (!placed) { t += 0.25; continue; }
    t += placed > 1 ? pause() : rng.range(c.gap[0], c.gap[1]);
  }
  // ---- RELOAD-AWARE (magazine variants): a perfect player's shots in ready order; the one after a full magazine waits
  // rel and must stay up >= rel + 0.45 past that (its stay grows, inside the MARG every booking carries)
  let relExt = 0;
  const magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0;
  if (magN) {
    const req = pops.filter(isReq).sort((a, b) => (a.t0 + a.readyAt) - (b.t0 + b.readyAt));
    let prev = -9, prevP = null;
    req.forEach((s, k) => {
      const Pp = POCKETS[s.L * NPK + s.pk].s, aim = 0.06 + 0.32 * (prevP ? hyp(Pp[0] - prevP[0], Pp[1] - prevP[1]) : 0) / 489; prevP = Pp;
      const rdy = s.t0 + s.readyAt + 0.22, boundary = k > 0 && k % magN === 0;
      const shot = (boundary ? Math.max(rdy, prev + c.rel) : Math.max(rdy, prev + 0.2)) + aim;
      if (boundary && SEQ_BASE[s.patKind]) s._relB = true;
      if (boundary) { const end = s.t0 + s.swing + s.stay + 0.7 * s.lv, need = Math.min(MARG - 0.05, (shot - aim + 0.45) - end + 0.001); if (need > 0) { s.stay = +(s.stay + need).toFixed(3); finPop(s); relExt++; } }
      prev = shot;
    });
  }
  // ---- #88 SHOT-DRIVEN rows / volleys / ping-pongs: the clock schedule becomes the fallback (chR); t0 = the ball in its hole
  const seqs = new Map(); for (const s of pops) if (s.pat != null && SEQ_BASE[s.patKind]) { if (!seqs.has(s.pat)) seqs.set(s.pat, []); seqs.get(s.pat).push(s); }
  for (const mem of seqs.values()) {
    mem.sort((a, b) => a.pi - b.pi);
    const kf = SEQ_F[mem[0].patKind], base = SEQ_BASE[mem[0].patKind](c);
    for (let i = 1; i < mem.length; i++) if (kf && i >= kf) mem[i].t0 = +Math.max(mem[i].t0, mem[i - kf].t0 + lifeOf(mem[i - kf]) + 0.02).toFixed(3);   // the slot is free by the schedule too
    const S0 = mem.map(m => m.t0);
    for (let i = 1; i < mem.length; i++) {
      const m = mem[i], p = mem[i - 1], dS = +(S0[i] - S0[i - 1]).toFixed(3);
      m.chS = dS; m.chX = +(REL_LEAD + (kf === 1 ? 0 : Math.max(0, dS - base)) + (m._relB ? c.rel : 0)).toFixed(3);
      m.chF = kf; m._chP = p;   // a volley: hit + lead (+ the slot's fold, chF)
      const e = +(holeOf(m._ball) + POP_LAG).toFixed(3);
      m.chR = +(S0[i] - e).toFixed(3); m.t0 = e; finPop(m); m.t1 = +(S0[i] + lifeOf(m) + (m.hidden ? HB_BEAT + m.lv : 0) + VS_LAG).toFixed(3);
    }
    for (const m of mem) delete m._relB;
  }
  for (const p of pops) { delete p._relB; const b = p._ball; b.t1 = +Math.max(b.t1, p.t0 + 0.05).toFixed(3); }   // a ball sits in its hole until its pop target exists
  // ---- the latent KICK spawn of every ball (pops only if the ball is shot in the air)
  const kicks = [];
  for (const b of balls) {
    const stay = +Math.max(c.win * 1.25, 0.6).toFixed(3), t0 = b.t0 + b.Tr + 0.03 + KICK_T + DROP + POP_LAG;
    kicks.push({ id: 0, t0: +t0.toFixed(3), t1: +(landOf(b) + KICK_T + DROP + POP_LAG + c.swing + stay + c.lv + VS_LAG + 0.1).toFixed(3), kind: 'kick', L: b.L, swing: c.swing, stay, lv: c.lv, ra, readyAt: ra, _ball: b });
  }
  const last = pops.reduce((a, s) => Math.max(a, s.t1), 0);
  const board = { id: 0, t0: 0, t1: +(last + 0.3 + FIN_HOLD).toFixed(3), kind: 'board', last: +(last + 0.3).toFixed(3), shuf: sk };
  out.push(...kicks, board);
  const ORD = { board: 0, ball: 1, pop: 2, kick: 3 };
  out.sort((a, b) => a.t0 - b.t0 || ORD[a.kind] - ORD[b.kind]);
  out.forEach((s, i) => { s.id = i; });
  for (const s of out) {
    if (s._ball) { s.ballD = s.id - s._ball.id; if (s.kind === 'pop') s._ball.popD = s.id - s._ball.id; }
    if (s._chP) { s.chD = s.id - s._chP.id; }
  }
  for (const s of out) { delete s._ball; delete s._chP; TLOF.set(s, out); }
  Object.defineProperty(out, 'sk', { value: sk, enumerable: false });
  const good = pops.filter(isReal).length;
  c.goodCount = good; c.bombCount = pops.filter(s => s.bomb && !s.hidden).length; c.ballCount = balls.length;
  c.tricks = count; c.relExt = relExt; c.shuffles = sk.s.length; c.duck = pops.some(s => s.duck);
  c.quota = Math.max(4, Math.min(good - c.spare, Math.round(good * c.share)));
  return out;
}
// points: a pop by how early in its shootable window you hit it (300 / 200 / 150 / 100 by quarters) + the ring (+10..+50),
// a 100 pocket's gold plate +500 instead of the ring, the duck 500; a ball shot +50 (it kicks). points() is the engine's only
// call on an awarded hit: it records the SHARED hit stage time (kicks + shot-driven releases read it)
function points(sp, lt) {
  const st = +(sp.t0 + lt).toFixed(4);
  if (sp.kind === 'ball') { HIT.set(sp, st); return 50; }
  if (sp.kind !== 'pop' && sp.kind !== 'kick') return 0;
  HIT.set(sp, st);
  let pk = sp.pk, gold = !!sp.gold;
  if (sp.kind === 'kick') {
    const tl = TLOF.get(sp), ball = tl && tl[sp.id - sp.ballD], h = ball && HIT.get(ball);
    if (ball && h != null) { const r = kickResult(ball, h, tl.sk); pk = r.pk; gold = r.kind === 'gold'; }
  }
  if (sp.duck) return 500;
  lt -= RELT.get(sp) || 0;
  const f = (lt - sp.ra) / Math.max(0.05, spanOf(sp));
  return (f < 0.25 ? 300 : f < 0.5 ? 200 : f < 0.75 ? 150 : 100) + (gold ? 500 : RING[pk] || 0);
}
function briefing(c) {
  const HINTS = ['WATCH THE BALL: IT TELLS YOU WHERE!', 'SHOOT A BALL IN THE AIR TO KICK IT!', 'THE BELL RINGS: THE LIGHTS SHUFFLE!', 'BUMP A 50 BALL INTO THE 100!'];
  const spare = Math.max(0, (c.goodCount || c.quota) - c.quota);
  const room = spare <= 0 ? 'NO ROOM FOR ERROR!' : 'ROOM FOR ERROR: ' + spare + (spare === 1 ? ' TARGET' : ' TARGETS');
  return { rule: [['SHOOT ', 'void'], [c.quota + ' TARGETS', 'red'], [' OR MORE!', 'void']], icon: 'skee', unit: 'TARGETS',
    dont: 'bomb', tip: 'GREEN POCKETS POP TARGETS. RED ONES POP BOMBS!', room, spare, spareUnit: 'targets', hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}
// briefing card icon: a skee ball dropping into a green-lit ring (it flashes as the ball goes in)
function drawIcon(cx, cy, r, t = 0) {
  const H = B.HUD, k = Math.ceil(r) + 2, ph = Math.floor(((t * 0.9) % 1) * 8);
  H.draw(H.pixImg('skee' + r + '_' + ph, 2 * k + 1, 2 * k + 1, (x, y) => {
    const px = x - k, py = y - k, ey = 0.38 * r;
    const by = ph < 6 ? -0.95 * r + (ph / 5) * (ey + 0.95 * r - 0.12 * r) : ey - 0.05 * r, bR = 0.32 * r, db = Math.hypot(px, py - by) / bR;
    const e = Math.hypot(px / (0.95 * r), (py - ey) / (0.44 * r)), eh = Math.hypot(px / (0.36 * r), (py - ey) / (0.17 * r));
    const lit = ph >= 6 ? 'lemon' : 'lime';
    if (ph < 6 && db <= 1 && !(py > ey && e < 0.78)) return db > 0.82 ? 'void' : (px < -0.15 * bR && py < by - 0.15 * bR) ? 'lemon' : db > 0.55 ? 'tan' : 'sand';
    if (e <= 1.0 && e > 0.76) return e > 0.9 ? (ph >= 6 ? 'yellow' : 'green') : lit;
    if (e > 1 && e <= 1.14) return 'void';
    if (e <= 0.76) { if (eh <= 1) return ph >= 6 && eh < 0.75 ? 'tan' : 'void'; return e > 0.66 ? 'umber' : 'walnut'; }
    return null;
  }), cx - k, cy - k);
}
// the miss ricochet colours for this stage (core/fx.js reads B.FX.ricochetColors[stageId]): wood chips + bulb sparks
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors[ID] = { hot: ['lemon', 'amber', 'bone', 'yellow'], flakes: ['tan', 'chestnut', 'sand'], pop: 'lemon', speed: 1, grav: 1 };
// the boardwalk bed lives in sfx-stage.js (K.stageBeds); hook it into the ambience beds (sfx-music.js owns K.beds)
{ const K = B.SFXKit; if (K && K.beds && K.stageBeds && K.stageBeds.skeeball && !K.beds.skeeball) K.beds.skeeball = K.stageBeds.skeeball; }
B.Stage.register({ id: ID, name: 'SKEE BALL', short: 'SKEE', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon,
  TIER_P, POCKETS, LANES, scr, ballPose, popPose, kickResult, colAt, releaseAt, lifeOf, spanOf, isReal, isReq, HIT, TLOF, bw, PKUV, laneX, FIN });
})(window.BLAM);
