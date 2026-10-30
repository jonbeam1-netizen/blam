'use strict';
/* =========================================================================================
   B.L.A.M. stages/beehive.js -- Stage 5: BEE HIVE (DESIGN-STAGES.md section 6 + 'BEE HIVE round 2', Fable + Jon 2026-10-30).
   A giant honeycomb in a wooden hive frame fills the range (beekeeper's yard at dusk: a hive box, a smoker on a
   post; no sign, round 2 #83). The comb is a 7 x 4 grid of live CELLS (dark mouths; Beginner uses the middle
   5 columns) inside a ring of honey-filled cells. A cell is a FLIP-IN SLOT: a hex plate / bomb / decoy (BLAM.Props,
   Jon's DECOY_VARIANTS, picked from the spawn id) rotates up out of the cell on its bottom edge, stays, flips back.
   Every range rule carries over (section 5): pop windows per tier, aim travel across the comb, decoys with the
   0.3 s build-up then the bang (stage.js deferred penalty via arm()), hidden bombs behind plates, reload-aware
   pacing on the magazine variants, anticipation pauses, nothing gated by tier.
   LARVA CYCLE (#81): a larva cell is WAX-CAPPED first (bees build the cap; right after the cell's last hatch when the
   director reuses it), then the cap turns translucent as the larva inside grows and wriggles (the readable timer, ripen
   +-35 % per larva), then the cap and the larva EXPLODE and the TARGET (+150) / BOMB (some in a decoy disguise) bursts
   out standing, or a BEE flies off; the kind is hidden until the hatch.
   BEES (#80): 30-60 big detailed bees crawl and hop over the comb and whatever stands in it, plus 6-12 tiny ones (looks
   only). They never block a shot. A shot that finds a BIG bee and nothing else = no points, no penalty, a 2 s FRENZY.
   MISS MARKS (#82): the stage's own wax dents / honey splashes (the env's shootable is a proxy that marks the spot; the
   engine's square bullet hole is wiped). FINALE (#83): when the comb is done the bees spell B.L.A.M. in the air, then scatter (FIN_SLOT s added).
   PATTERNS (the director): ROW on a beat (decoy on the beat / off beat), COLUMN bottom to top, SNAKE through
   neighbouring cells, PING-PONG then a bomb, DEEP CELL (the range's #71 column: plates stacked invisibly in one
   cell, shoot the front and the next is standing there), THE WALL (6-8 cells at once, decoys).
   Everything that decides a spawn is a pure function of (seed, tier, variant) and the stage clock (the wax caps too);
   bees, honey drips, marks and smoke are cosmetic (wall clock) and never touch scoring.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets, P = B.Props;
const clamp = E.clamp, HALF = Math.PI / 2;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
const NOHIT_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), NOHIT_MAT = new THREE.MeshBasicMaterial({ visible: false });   // invisible proxies
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const inPlay = () => !!(B.G && B.G.screenName === 'play');
const slowK = () => { const G = B.G; return G && G.screenName === 'play' && G.slow < 1 && !(G.run && G.run.versus) ? G.slow : 1; };

// ---------- layout (world units). The comb's mouth plane sits at view depth ~11.6: past the props' LOD band
// (9.9-11.0), so bombs and decoys wear their FAR look (a decoy passes for a plate at a glance, Jon's rule) ----------
const ZM = -6.6, DEPTH = 1.35;                                 // cell mouth plane, tube depth
const PS = 1.2;                                                // prop size (plate apothem 0.636)
const PA = P.PLATE_A * PS, FACE_H = (P.PIVOT_Y + P.FACE_Y) * PS;
const A = 0.86, RC = A / 0.8660254, HP = 1.5 * RC, VP = 2 * A, WALL = 0.13, AI = A - WALL / 2, YC = 1.3;
const GROUND_Y = -3.9, FX_ = 7.15, FTOP = 5.95, FBOT = -2.75, FBAR = 0.7;  // ground, frame half width / top / bottom
const COLS = 7, ROWS = 4;
const cellXY = (c, r) => [(c - 3) * HP, YC + (r - 1.5) * VP + ((c & 1) ? 1 : -1) * VP / 4];
// world point -> [px, py, game px per world unit] on the 426 x 240 grid (steady camera; pure)
function scr(x, y, z) {
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (R.RH / 2) / (Math.max(0.1, d) * R.TAN_H);
  return [R.RW / 2 + vx * k, R.RH / 2 - yc * k, k];
}
const CELLS = [];                                              // the live cells: { i, c, r, x, y, s: [px, py, k], nb: [i...] }
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const [x, y] = cellXY(c, r); CELLS.push({ i: CELLS.length, c, r, x, y, s: scr(x, y, ZM), nb: [] }); }
for (const a of CELLS) for (const b of CELLS) if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < VP * 1.1) a.nb.push(b.i);
const cellAt = (c, r) => CELLS.find(q => q.c === c && q.r === r);
const CELL_PX = CELLS[0].s[2] * PA;                            // a plate's apothem in game px

// =========================================================================================
// THE SET: comb (env), wooden frame, yard (ground, hive box, smoker post), dusk sky (fog-free, env class)
// =========================================================================================
function combBake(x, y, z) {
  const d = clamp((ZM - z) / DEPTH, 0, 1);
  let L = 1.0 - 0.55 * d;                                      // deeper in a cell = darker
  L *= 0.92 + 0.1 * clamp((y + 3) / 9, 0, 1);                  // dusk light from above
  L += 0.08 * Math.exp(-((x + 8) * (x + 8)) * 0.02);           // the low sun on the left
  return L;
}
function yardBake(x, y, z) {
  let L = 0.78 + 0.12 * clamp((y + 3.6) / 4, 0, 1);
  L += 0.12 * Math.exp(-((x + 9) * (x + 9) + (z + 6) * (z + 6)) * 0.01);
  return L;
}
// a flat-top hex area at depth z, built from horizontal strips (inside a tube, so the stepped edge never shows)
function hexFill(v, x, y, a, z, col, mask = 16, strips = 6, thick = 0.04) {
  const rr = a / 0.8660254, h = 2 * a / strips;
  for (let k = 0; k < strips; k++) {
    const y0 = y - a + k * h, ym = Math.abs(y0 + h / 2 - y), hw = rr - ym / 1.7320508;
    v.bx(x - hw, y0, z - thick, x + hw, y0 + h, z, typeof col === 'function' ? col(k) : col, null, mask);
  }
}
// the six walls of a cell (shared walls deduped), deep part (inner faces) + a front rim cap
const _m = new THREE.Matrix4();
function cellWalls(v, x, y, seen, rimCol) {
  for (let k = 0; k < 6; k++) {
    const phi = (30 + 60 * k) * Math.PI / 180, mx = x + A * Math.cos(phi), my = y + A * Math.sin(phi);
    const key = Math.round(mx * 50) + ',' + Math.round(my * 50);
    if (seen.has(key)) continue; seen.add(key);
    _m.makeRotationZ(phi - HALF).setPosition(mx, my, ZM - DEPTH / 2 - 0.03);
    v.box(0, 0, 0, RC + 0.03, WALL, DEPTH - 0.06, PAL.tan, _m, 4 | 8);
    _m.makeRotationZ(phi - HALF).setPosition(mx, my, ZM - 0.03);
    v.box(0, 0, 0, RC + 0.06, WALL + 0.02, 0.06, rimCol(k, mx, my), _m, 16 | 4 | 8);
  }
}
const SMOKER = { x: 7.95, y: 2.15, z: -5.3 };
function buildComb(v) {
  const seen = new Set(), rng = B.Stage.mulberry32(0xbee5);
  const rimCol = (k, mx, my) => { const h = hash1(Math.round(mx * 31) * 7 + Math.round(my * 17)); return h < 0.18 ? PAL.lemon : h < 0.8 ? PAL.sand : PAL.tan; };
  // the live cells: dark mouths (umber floor, walnut ring part way in)
  for (const C of CELLS) {
    cellWalls(v, C.x, C.y, seen, rimCol);
    hexFill(v, C.x, C.y, AI + 0.02, ZM - DEPTH + 0.02, PAL.umber);
    hexFill(v, C.x, C.y, AI * 0.55, ZM - DEPTH + 0.05, PAL.walnut, 16, 4, 0.02);
  }
  // the ring of honey cells round them (and a few empty ones), irregular outline like a real comb
  const HONEY = [PAL.amber, PAL.amber, PAL.orange, PAL.yellow];
  for (let c = -1; c <= COLS; c++) for (let r = -1; r <= ROWS; r++) {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) continue;
    const [x, y] = cellXY(c, r);
    if (y - A < FBOT - FBAR - 0.05 || y + A > FTOP + 0.5) continue;   // only what the frame bars can hide may poke behind them
    if (r === -1 && hash1(c * 13 + 5) < 0.35) continue;        // a bite out of the bottom edge
    cellWalls(v, x, y, seen, rimCol);
    const h = hash1(c * 101 + r * 37 + 11);
    if (h < 0.16) { hexFill(v, x, y, AI + 0.02, ZM - DEPTH * 0.6, PAL.walnut); continue; }   // an empty cell
    const hz = ZM - 0.22 - 0.18 * hash1(c * 7 + r * 3);       // the honey surface, near the mouth
    const hc = HONEY[(c * 3 + r * 5 + 9) % 4];
    hexFill(v, x, y, AI + 0.02, hz, k => (k >= 4 ? (hc === PAL.yellow ? PAL.lemon : PAL.yellow) : k >= 2 ? hc : hc === PAL.orange ? PAL.rust : PAL.orange));
    if (h > 0.55) v.bx(x - 0.34, y + 0.18, hz, x - 0.14, y + 0.3, hz + 0.01, PAL.lemon, null, 16);   // a glint
    hexFill(v, x, y, AI * 0.7, hz - 0.25, PAL.rust, 16, 4);
  }
  // the comb's backing (dark foundation) and the gaps beyond the cells
  v.bx(-FX_, FBOT - FBAR, ZM - DEPTH - 0.08, FX_, FTOP, ZM - DEPTH, PAL.umber, null, 16);
  // ---- the wooden hive frame: uprights, top bar with lugs, bottom bar, legs into the grass ----
  const wood = (x0, y0, x1, y1, z0, z1, col) => {
    for (let y = y0; y < y1 - 1e-6; y += 1) for (let x = x0; x < x1 - 1e-6; x += 1) v.bx(x, y, z0, Math.min(x + 1, x1), Math.min(y + 1, y1), z1, col);
  };
  const FZ0 = ZM - DEPTH - 0.1, FZ1 = ZM + 0.28;
  for (const s of [-1, 1]) {
    wood(s < 0 ? -FX_ - 0.5 : FX_, FBOT - FBAR, s < 0 ? -FX_ : FX_ + 0.5, FTOP + 0.45, FZ0, FZ1, PAL.chestnut);
    v.bx(s < 0 ? -FX_ - 0.52 : FX_ + 0.38, FBOT - FBAR, s < 0 ? -FX_ - 0.38 : FX_ + 0.52, FTOP + 0.45, FZ1 - 0.01, FZ1 + 0.01, PAL.tan, null, 16);   // a lit edge
    for (let y = FBOT + 0.5; y < FTOP; y += 1.7) v.bx(s < 0 ? -FX_ - 0.42 : FX_ + 0.1, y, FZ1, s < 0 ? -FX_ - 0.1 : FX_ + 0.42, y + 0.05, FZ1 + 0.01, PAL.walnut, null, 16);   // grain
    wood(s < 0 ? -FX_ - 0.3 : FX_ + 0.05, GROUND_Y, s < 0 ? -FX_ - 0.05 : FX_ + 0.3, FBOT - FBAR, FZ0 + 0.2, FZ0 + 0.6, PAL.walnut);   // legs
  }
  wood(-FX_ - 1.1, FTOP, FX_ + 1.1, FTOP + 0.45, FZ0, FZ1, PAL.walnut);
  v.bx(-FX_ - 1.1, FTOP - 0.04, FX_ + 1.1, FTOP, FZ0, FZ1, PAL.umber, null, 8);
  v.bx(-FX_ - 1.1, FTOP + 0.38, FX_ + 1.1, FTOP + 0.45, FZ1 - 0.01, FZ1 + 0.01, PAL.chestnut, null, 16);
  wood(-FX_, FBOT - FBAR, FX_, FBOT, FZ0, FZ1, PAL.walnut);
  v.bx(-FX_, FBOT - 0.07, FX_, FBOT, FZ1 - 0.01, FZ1 + 0.01, PAL.tan, null, 16);
  void rng;
}
function buildYard(v, glow) {
  const rng = B.Stage.mulberry32(0xa917);
  // grass: two greens on a 1 unit grid (the env dither mixes them), a dirt patch in front of the frame
  for (let x = -16; x < 16; x++) for (let z = -16; z < 4; z++) {
    const h = hash1(x * 31 + z * 7), dirt = Math.abs(x) < 3.5 && z > -6.2 && z < 0 && h < 0.6;
    v.bx(x, GROUND_Y - 0.2, z, x + 1, GROUND_Y, z + 1, dirt ? (h < 0.3 ? PAL.tan : PAL.chestnut) : h < 0.5 ? PAL.green : PAL.forest, null, 4);
  }
  for (let k = 0; k < 160; k++) {                              // tufts and clover flowers
    const x = rng.range(-14, 14), z = rng.range(-14, 1), f = rng() < 0.22;
    if (Math.abs(x) < FX_ + 0.6 && z > ZM - 1.8 && z < ZM + 0.6) continue;
    if (f) v.bx(x, GROUND_Y, z, x + 0.12, GROUND_Y + 0.12, z + 0.12, [PAL.pink, PAL.lemon, PAL.bone, PAL.ice][(rng() * 4) | 0]);
    else v.bx(x, GROUND_Y, z, x + 0.07, GROUND_Y + rng.range(0.12, 0.3), z + 0.07, rng() < 0.5 ? PAL.lime : PAL.green);
  }
  // ---- a hive box on a stand, front left (stacked supers, a roof, the entrance slot + landing board) ----
  {
    const x0 = -9.2, x1 = -6.6, z0 = -4.6, z1 = -2.6, y0 = GROUND_Y + 0.5;
    for (const [x, z] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.2, z0 + 0.1], [x0 + 0.1, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) v.bx(x, GROUND_Y, z, x + 0.1, y0, z + 0.1, PAL.walnut);
    v.bx(x0 - 0.1, y0, z0 - 0.1, x1 + 0.1, y0 + 0.12, z1 + 0.1, PAL.chestnut);
    const BODY = [PAL.mist, PAL.bone, PAL.mist];
    for (let k = 0; k < 3; k++) {
      const ya = y0 + 0.12 + k * 0.78, yb = ya + 0.74;
      v.bx(x0, ya, z0, x1, yb, z1, BODY[k]);
      v.bx(x0 - 0.01, yb, z0 - 0.01, x1 + 0.01, yb + 0.04, z1 + 0.01, PAL.haze);
      v.bx(x0 + 0.9, ya + 0.36, z1, x1 - 0.9, ya + 0.44, z1 + 0.06, PAL.sand);   // hand hold
    }
    v.bx(x0 + 0.4, y0 + 0.14, z1, x1 - 0.4, y0 + 0.24, z1 + 0.01, PAL.void, null, 16);   // entrance
    v.bx(x0 + 0.3, y0 + 0.08, z1, x1 - 0.3, y0 + 0.12, z1 + 0.35, PAL.tan);
    const yr = y0 + 0.12 + 3 * 0.78;
    v.bx(x0 - 0.18, yr, z0 - 0.18, x1 + 0.18, yr + 0.18, z1 + 0.18, PAL.crimson);
    v.bx(x0 - 0.2, yr + 0.18, z0 - 0.2, x1 + 0.2, yr + 0.24, z1 + 0.2, PAL.red, null, 4 | 16);
    v.bx(x0 + 0.6, yr + 0.24, z0 + 0.4, x0 + 1.0, yr + 0.34, z0 + 0.8, PAL.steel);   // a brick on the lid
  }
  // ---- the smoker on a post, right of the frame ----
  {
    const { x, y, z } = SMOKER;
    v.bx(x - 0.09, GROUND_Y, z - 0.09, x + 0.09, y - 0.48, z + 0.09, PAL.walnut);
    v.bx(x - 0.3, y - 0.5, z - 0.3, x + 0.3, y - 0.42, z + 0.3, PAL.chestnut);
    v.bx(x - 0.2, y - 0.42, z - 0.2, x + 0.2, y + 0.3, z + 0.2, PAL.steel);
    v.bx(x - 0.21, y - 0.1, z - 0.21, x + 0.21, y - 0.02, z + 0.21, PAL.haze);
    v.bx(x - 0.15, y + 0.3, z - 0.15, x + 0.15, y + 0.42, z + 0.15, PAL.haze);
    _m.makeRotationZ(-0.5).setPosition(x + 0.12, y + 0.5, z); v.box(0, 0, 0, 0.12, 0.26, 0.12, PAL.slate, _m);   // spout
    _m.makeRotationZ(0.25).setPosition(x - 0.36, y - 0.08, z); v.box(0, 0, 0, 0.1, 0.62, 0.42, PAL.chestnut, _m);   // bellows
    glow.bx(x - 0.06, y - 0.36, z + 0.2, x + 0.06, y - 0.26, z + 0.21, PAL.orange);   // embers through the grate
  }
  void rng;
}
// sky: plum overhead, magenta, a coral / orange dusk band, a low sun on the left; a tree line and a fence
const SKY = [[-4, PAL.rust], [-1, PAL.orange], [1.5, PAL.coral], [4, PAL.magenta], [8, PAL.plum], [13, PAL.indigo], [22, PAL.midnight]];
function skyCol(y) { for (let i = 1; i < SKY.length; i++) if (y < SKY[i][0]) return (y - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]) < 0.5 ? SKY[i - 1][1] : SKY[i][1]; return SKY[SKY.length - 1][1]; }
function buildFar(f) {
  const rng = B.Stage.mulberry32(0x5a17), Z = -34;
  for (let y = -6; y < 24; y += 0.5) for (let x = -40; x < 40; x += 8) {
    const c0 = skyCol(y), c1 = skyCol(y + 0.25 + (hash1(x * 3 + y * 17) - 0.5) * 0.8);
    f.bx(x, y, Z, x + 8, y + 0.5, Z + 0.01, hash1(x + y * 41) < 0.5 ? c0 : c1, null, 16);
  }
  { const sx = -15, sy = 1.6, r = 2.4;                          // the sun, half behind the trees
    for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) { const d = Math.hypot(i, j) * 0.2; if (d > r) continue; f.bx(sx + i * 0.2, sy + j * 0.2, Z + 0.05, sx + (i + 1) * 0.2, sy + (j + 1) * 0.2, Z + 0.06, d > r - 0.35 ? PAL.yellow : PAL.lemon, null, 16); } }
  for (let x = -40; x < 40;) {                                  // tree line: round crowns in two dark greens
    const w = rng.range(1.6, 3.6), h = rng.range(2.2, 5.0), cx = x + w / 2, zz = Z + 2 + rng() * 2;
    for (let j = 0; j < 8; j++) { const yy = GROUND_Y + h * (0.35 + j / 8 * 0.65), ww = w * Math.sin(Math.PI * (0.2 + 0.8 * j / 8)) * 0.62; f.bx(cx - ww, yy, zz, cx + ww, yy + h * 0.65 / 8 + 0.05, zz + 0.02, j > 5 ? PAL.green : PAL.forest, null, 16); }
    f.bx(cx - 0.12, GROUND_Y - 1, zz + 0.03, cx + 0.12, GROUND_Y + h * 0.38, zz + 0.04, PAL.umber, null, 16);
    x += w * rng.range(0.6, 0.95);
  }
  f.bx(-40, GROUND_Y - 3, Z + 4.2, 40, GROUND_Y + 0.3, Z + 4.21, PAL.forest, null, 16);   // the far meadow
  for (let x = -40; x < 40; x += 1.6) f.bx(x, GROUND_Y + 0.3, Z + 4.3, x + 0.12, GROUND_Y + 1.1, Z + 4.31, PAL.walnut, null, 16);   // fence
  f.bx(-40, GROUND_Y + 0.75, Z + 4.32, 40, GROUND_Y + 0.85, Z + 4.33, PAL.chestnut, null, 16);
}
// ---------- honey drips (looks only): one InstancedMesh, wall clock; a drop falls now and then (honeyDrip, rare) ----------
const DRIPS = [];
let dripMesh = null, lastDripSfx = -1e9;
function buildDrips() {
  const spots = [[-1, 2], [7, 1], [-1, 0], [3, 4], [7, 3]];
  for (const [c, r] of spots) { const [x, y] = cellXY(c, r); DRIPS.push({ x: x + 0.1, y: y - A + 0.04, z: ZM + 0.06, period: 6 + hash1(c * 9 + r) * 6, ph: hash1(c + r * 5) * 10 }); }
  const g = new THREE.BoxGeometry(1, 1, 1), m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial(), DRIPS.length * 3);
  m.frustumCulled = false; m.userData.sharedGeo = true;
  const c = new THREE.Color();
  for (let i = 0; i < DRIPS.length * 3; i++) m.setColorAt(i, c.set(i % 3 === 0 ? PAL.amber : i % 3 === 1 ? PAL.orange : PAL.yellow));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3();
  m.onBeforeRender = () => {
    const t = performance.now() / 1000;
    DRIPS.forEach((d, i) => {
      const q = ((t + d.ph) % d.period) / d.period, grow = Math.min(1, q / 0.72), len = 0.08 + 0.55 * grow * grow;
      m.setMatrixAt(i * 3, M.compose(V.set(d.x, d.y - len / 2, d.z), Q, S.set(0.07, len, 0.07)));
      const blob = 0.11 + 0.06 * grow;
      if (q < 0.72) m.setMatrixAt(i * 3 + 1, M.compose(V.set(d.x, d.y - len, d.z), Q, S.set(blob, blob * 1.15, blob)));
      else m.setMatrixAt(i * 3 + 1, M.compose(V.set(d.x, d.y - 0.1, d.z), Q, S.set(0.1, 0.1, 0.1)));
      const fq = (q - 0.72) / 0.28;
      if (q >= 0.72) {
        const yy = d.y - 0.63 - 14 * fq * fq;
        m.setMatrixAt(i * 3 + 2, M.compose(V.set(d.x, Math.max(GROUND_Y + 0.05, yy), d.z), Q, S.set(0.12, 0.17, 0.12)));
        if (!d.fell) { d.fell = true; if (inPlay() && t - lastDripSfx > 7) { lastDripSfx = t; B.SFX.play('honeyDrip', { u: 0.5 + d.x / 16 }); } }
      } else { d.fell = false; m.setMatrixAt(i * 3 + 2, M.compose(V.set(0, -99, 0), Q, S.set(0, 0, 0))); }
    });
    m.instanceMatrix.needsUpdate = true;
  };
  return (dripMesh = m);
}
// smoke curling from the smoker (chips that rise and fade), driven by the glow mesh being drawn
let smokeT = 0;
const _sp = new THREE.Vector3(), _sv = new THREE.Vector3();
function smoke() {
  const t = performance.now() / 1000; if (t - smokeT < 0.28) return; smokeT = t;
  T.spawnChip(_sp.set(SMOKER.x + 0.28, SMOKER.y + 0.6, SMOKER.z), _sv.set(R.rnd(0.1, 0.3), R.rnd(0.5, 0.8), R.rnd(-0.05, 0.05)), R.rnd(0.12, 0.2), [PAL.mist, PAL.haze, PAL.bone][(Math.random() * 3) | 0], R.rnd(1.4, 2.1), -0.02);
}
function buildEnv() {
  const group = new THREE.Group();
  const comb = new Vox(), yard = new Vox(), glow = new Vox(), far = new Vox();
  comb.bake = combBake; yard.bake = yardBake;
  buildComb(comb); buildYard(yard, glow); buildFar(far);
  const combMesh = comb.mesh(MAT.env), yardMesh = yard.mesh(MAT.env); combMesh.userData.env = yardMesh.userData.env = true;
  // one env mesh would do, but the comb's bake is its own: two meshes (2 calls)
  const farMesh = far.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.5, blending: THREE.NoBlending }));
  farMesh.frustumCulled = false;
  const glowMesh = glow.mesh(MAT.glow);
  glowMesh.onBeforeRender = smoke;
  group.add(farMesh, combMesh, yardMesh, glowMesh, buildDrips(), BEES.init(), buildMarks());
  // the env's only shootable: a proxy that hit-tests the comb and the yard and leaves the stage's own miss mark (#82). It
  // reports the real hit (the engine lands the shot's tracer / ricochet there), and the engine's square bullet hole
  // that envShot adds right after is wiped before the next frame (a microtask): no green squares on the comb
  const proxy = new THREE.Mesh(NOHIT_GEO, NOHIT_MAT); proxy.userData.sharedGeo = true;
  proxy.raycast = (rc, out) => {
    const h = rc.intersectObjects([combMesh, yardMesh], false)[0]; if (!h) return;
    envMark(h, h.object === combMesh); out.push(h);
    queueMicrotask(() => { if (group.visible) T.clearDecals(); });
  };
  group.userData.shootables = [proxy];
  return group;
}

// =========================================================================================
// BEES (cosmetic; round 2, Jon 2026-10-30). Two swarms on one clock (wall time x the ?slow factor x the FRENZY boost),
// never part of the timeline, never in the way of a shot (every bee mesh has a no-op raycast):
//  BIG BEES (#80): 30-60 detailed voxel bees (banded fuzzy abdomen, fuzzy thorax, big dark eyes, elbowed antennae, six
//    legs, a stinger, translucent veined wings; a quarter carry yellow pollen baskets on the hind legs). They crawl busy
//    random paths over the comb AND over whatever stands in a cell (plates, bombs, wax caps: they climb onto its front),
//    hop on short flights (wings blur: 3 wing poses flickered), a few are always airborne. Three InstancedMeshes: bodies,
//    wings (two instances a bee, alpha 0.5), pollen. ONLY the big bees take a bee shot (the frenzy).
//  TINY BEES (round 1): 6-12 small bees on top as extra mayhem. LOOKS ONLY (Jon): no hit test at all.
// Extra big-bee slots: a larva's hatched bee flying off, the two worker bees that re-cap a cell, and the finale's
// latecomers (the bees spell B.L.A.M. in the air when the comb is done, #83).
// =========================================================================================
const BEE_MAX = 14, BS = 0.055;                                // tiny bees, their voxel size
const BV = 0.075, BIG_MAX = 64, BIG_X = 10, BIG_N = BIG_MAX + BIG_X;   // big bee voxel; swarm slots; extras (hatchlings, workers)
const FRENZY_T = 2.0, FRENZY_K = 1.7;                          // frenzy length (s) and extra speed (x1 + 1.7 at full)
const CAP_N = 16, CAP_Z = ZM - 0.12, CAP_LIFT = 0.2;           // pre-larva wax caps drawn by the swarm; cap base z; a bee's climb onto a cap
const FIN_P = 0.54, FIN_Y = 1.75, FIN_Z = ZM + 1.4, FIN_SC = 0.62;   // finale letters: pitch, centre height, plane, bee scale
const FIN_HOLD = 3.7, FIN_END = 6.0, FIN_SLOT = 4;           // stage s from the comb's end to the stage's end; the finale's own length; s added to the clock
const POLLEN = i => hash1(i * 97 + 13) < 0.25;                 // a quarter of the big bees carry pollen (seeded per slot)
const lerpAng = (a, b, t) => a + ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * t;
const BEES = { n: 7, nBig: 30, legs: [], big: [], clock: 0, last: 0, f: -1, fin: -1, finFrom: [], finTo: [], mesh: null, wings: null,
  bigMesh: null, bigWings: null, pollen: null, capMesh: null, bp: new Float32Array(BIG_N * 4).fill(-99), bsc: new Float32Array(BIG_N).fill(1),
  bz: new Float32Array(BIG_N).fill(NaN), hitB: new Float64Array(BIG_N).fill(-99), lastBig: new Int32Array(BIG_N).fill(-1),
  extra: new Map(), passT: -9, hopBias: 0, run: null, caps: [], lift: new Float32Array(CELLS.length) };
// ---------- geometry ----------
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function voxGeo(list, s, skip = 32) {                          // Vox.vox without the faces in `skip` (default: the back face, never seen)
  const S = new Set(list.map(v => v[0] + ',' + v[1] + ',' + v[2])), v = new Vox();
  for (const [i, j, k, col] of list) {
    let mask = 0;
    for (let f = 0; f < 6; f++) { if ((skip >> f) & 1) continue; const F = NB6[f]; if (!S.has((i + F[0]) + ',' + (j + F[1]) + ',' + (k + F[2]))) mask |= 1 << f; }
    if (mask) v.box(i * s, j * s, k * s, s, s, s, col, null, mask);
  }
  return v.geo();
}
const vh = (i, j, k) => hash1(i * 7349 + j * 1931 + k * 337 + 17);
const el = (i, j, k, cx, cy, cz, ax, ay, az) => ((i - cx) / ax) ** 2 + ((j - cy) / ay) ** 2 + ((k - cz) / az) ** 2;
// the big bee, seen from above (local +x = forward, +z = its back, toward you), 0.07 voxels: ~1.2 long, 0.85 across the legs
function bigBeeGeo() {
  const M = new Map(), put = (i, j, k, c) => M.set(i + ',' + j + ',' + k, [i, j, k, PAL[c]]);
  const BAND = { 1: 'amber', 0: 'amber', '-1': 'amber', '-2': 'umber', '-3': 'umber', '-4': 'sand', '-5': 'amber', '-6': 'umber', '-7': 'umber', '-8': 'sand', '-9': 'umber', '-10': 'umber' };
  const DARK = { amber: 'tan', tan: 'chestnut', sand: 'tan', walnut: 'umber', umber: 'void' };
  for (let i = -10; i <= 8; i++) for (let j = -4; j <= 4; j++) for (let k = -1; k <= 3; k++) {
    if (el(i, j, k, -4.6, 0, 0.3, 5.0, 3.1, 2.4) <= 1) {                      // abdomen: dark bands with golden ones and pale hair bands
      let c = BAND[Math.max(-10, Math.min(1, i))];
      if (j * j / 9.6 + (k - 0.3) * (k - 0.3) / 5.8 > 0.62) c = DARK[c];     // rounder: the flanks a shade darker
      else if (c === 'amber' && (k >= 2 || vh(i, j, k) < 0.15)) c = 'yellow';    // the golden bands catch the light on top
      put(i, j, k, c); continue;
    }
    if (el(i, j, k, 2.3, 0, 0.6, 2.4, 2.4, 2.3) <= 1) {                       // thorax: fuzzy, a bare dark patch on top
      const r = vh(i, j, k);
      put(i, j, k, k >= 2 && Math.abs(j) <= 1 && i >= 2 && i <= 3 ? 'chestnut' : r < 0.45 ? 'sand' : r < 0.8 ? 'tan' : 'amber'); continue;
    }
    if (el(i, j, k, 5.6, 0, 0.3, 1.5, 2.0, 1.6) <= 1) put(i, j, k, k >= 1 ? 'walnut' : 'umber');   // head
  }
  put(7, 0, 0, 'tan'); put(7, 0, 1, 'tan');                                    // a fuzzy face
  for (const s of [-1, 1]) {
    for (let i = 4; i <= 7; i++) for (let j = 1; j <= 3; j++) for (let k = -1; k <= 2; k++) if (el(i, j, k, 5.4, 1.9, 0.6, 1.4, 0.9, 1.2) <= 1) put(i, j * s, k, 'void');   // big eyes
    put(6, 2 * s, 2, 'steel');                                                   // eye glint
    for (const [i, j] of [[7, 1], [8, 1], [9, 1], [9, 2], [10, 2], [11, 3]]) put(i, j * s, 1, 'umber');   // elbowed antennae
    for (const L of [[[4, 3], [5, 3], [5, 4], [6, 4], [6, 5], [7, 5]], [[2, 3], [2, 4], [1, 4], [1, 5], [0, 5], [0, 6]],
      [[0, 3], [-1, 4], [-2, 4], [-3, 5], [-4, 5], [-5, 6], [-6, 6]]]) L.forEach(([i, j], n) => put(i, j * s, -1, n === 2 ? 'walnut' : 'umber'));   // six legs
  }
  put(-10, 0, 0, 'walnut'); put(-11, 0, 0, 'void');                            // stinger
  return voxGeo([...M.values()], BV);
}
function pollenGeo() {                                         // chunky pollen baskets on the hind legs
  const list = [];
  for (const s of [-1, 1]) for (let i = -4; i <= -2; i++) for (let j = 5; j <= 6; j++) for (let k = -1; k <= 0; k++) {
    if (i === -4 && j === 6) continue;
    list.push([i, j * s, k, PAL[k === 0 ? (vh(i, j, k) < 0.45 ? 'yellow' : 'amber') : 'orange']]);
  }
  return voxGeo(list, BV);
}
// a right forewing + hindwing, one layer, root at the origin, lying back (-x) and out (+y): the membrane (bone, drawn at
// alpha 0.35: the stripes show through) and the leading edge (opaque mist: the vein hint) as two geometries on the same poses
function bigWingGeos() {
  const fill = [], lines = [], inW = (i, j) => el(i, j, 0, -3.4, 1.2, 0, 3.6, 1.4, 1) <= 1 || el(i, j, 0, -2.2, 0.2, 0, 2.2, 0.9, 1) <= 1;
  for (let i = -9; i <= 0; i++) for (let j = -1; j <= 3; j++) {
    if (!inW(i, j)) continue;
    const edge = !inW(i + 1, j) || !inW(i - 1, j) || !inW(i, j + 1) || !inW(i, j - 1);
    fill.push([i, j, 0, PAL.bone]);
    if (!inW(i, j + 1) || (i <= -6 && edge)) lines.push([i, j, 0.4, PAL.mist]);   // the leading edge and the tip: a vein hint
  }
  return { fill: voxGeo(fill, BV, 0), lines: voxGeo(lines, BV, 0) };
}
function beeGeo() {                                            // the tiny bee (side view)
  const list = [], put = (i, j, k, c) => list.push([i, j, k, PAL[c]]);
  for (let i = -3; i <= 2; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    if (Math.abs(j) === 1 && Math.abs(k) === 1) continue;
    if ((i === -3 || i === 2) && (Math.abs(j) + Math.abs(k) > 1)) continue;
    put(i, j, k, i === 2 ? 'void' : i === 1 ? 'amber' : i === -1 || i === -3 ? 'void' : 'yellow');
  }
  put(-4, 0, 0, 'void'); put(3, 0, 1, 'bone'); put(3, 0, -1, 'bone');       // stinger, eyes
  put(1, -2, 0, 'void'); put(0, -2, 0, 'void');                                // legs
  return new Vox().vox(list, BS).geo();
}
function wingGeo() {                                           // tiny bee wings: origin at the wing root (top of the thorax): scale y flaps it
  const v = new Vox();
  for (const k of [-1, 1]) { v.box(-0.03, 0.06, k * 0.035, 0.1, 0.11, 0.04, PAL.mist); v.box(-0.07, 0.11, k * 0.035, 0.08, 0.06, 0.04, PAL.ice); }
  return v.geo();
}
// ---------- paths ----------
// tiny bee legs: { t0, t1, ty 0 pause / 1 crawl / 2 hop, a [x, y], b [x, y], z (hop bulge), arc }
function beeLegs(i) {
  const rng = B.Stage.mulberry32(0xbee0 + i * 7919), legs = [], air = i % 4 === 3;
  const X0 = -6.4, X1 = 6.4, Y0 = -2.5, Y1 = 5.5;
  let x = rng.range(X0, X1), y = rng.range(Y0, Y1), t = 0;
  while (t < 420) {
    const r = rng(), hop = air ? r < 0.75 : r < 0.3, pause = !hop && r < (air ? 0.85 : 0.55);
    if (pause) { const d = rng.range(0.3, 1.4); legs.push({ t0: t, t1: t + d, ty: 0, a: [x, y], b: [x, y] }); t += d; continue; }
    if (hop) {
      const L = rng.range(1.6, air ? 6 : 4.2), th = rng() * Math.PI * 2;
      const bx = clamp(x + Math.cos(th) * L, X0, X1), by = clamp(y + Math.sin(th) * L * 0.7, Y0, Y1);
      const d = Math.max(0.45, Math.hypot(bx - x, by - y) / rng.range(3.0, 4.6));
      legs.push({ t0: t, t1: t + d, ty: 2, a: [x, y], b: [bx, by], z: rng.range(air ? 1.0 : 0.5, air ? 2.4 : 1.6), arc: rng.range(0.2, 0.7) });
      x = bx; y = by; t += d; continue;
    }
    const L = rng.range(0.3, 0.9), th = rng() * Math.PI * 2, bx = clamp(x + Math.cos(th) * L, X0, X1), by = clamp(y + Math.sin(th) * L, Y0, Y1);
    const d = Math.max(0.3, Math.hypot(bx - x, by - y) / rng.range(0.3, 0.5));
    legs.push({ t0: t, t1: t + d, ty: 1, a: [x, y], b: [bx, by] }); x = bx; y = by; t += d;
  }
  return legs;
}
// big bee legs (a closed 300 s loop): ty 0 pause (grooming), 1 crawl (meandering turns), 2 hop (a short flight off the
// comb), 3 airborne (the always-flying few: loops in front of the comb). h = the leg's heading, hp = the one before
function bigLegs(i) {
  const rng = B.Stage.mulberry32(0xb16b + i * 7919), legs = [], air = i % 9 === 4;
  const X0 = -7.3, X1 = 7.3, Y0 = -3.1, Y1 = 5.7;
  const x0 = air ? rng.range(-8, 8) : rng.range(X0, X1), y0 = air ? rng.range(-2, 6) : rng.range(Y0, Y1), z0 = rng.range(1, 3);
  let x = x0, y = y0, z = z0, h = rng() * 6.283, t = 0;
  const fly = (bx, by, bz, sp) => { const d = Math.max(0.6, Math.hypot(bx - x, by - y, bz - z) / sp), nh = Math.atan2(by - y, bx - x);
    legs.push({ t0: t, t1: t + d, ty: 3, a: [x, y, z], b: [bx, by, bz], h: nh, hp: h, arc: rng.range(-0.8, 0.8) }); x = bx; y = by; z = bz; h = nh; t += d; };
  const hop = (bx, by) => { const d = Math.max(0.5, Math.hypot(bx - x, by - y) / rng.range(2.6, 4.2)), nh = Math.atan2(by - y, bx - x);
    legs.push({ t0: t, t1: t + d, ty: 2, a: [x, y], b: [bx, by], z: rng.range(0.5, 1.7), arc: rng.range(0.1, 0.6), h: nh, hp: h }); x = bx; y = by; h = nh; t += d; };
  while (t < 300) {
    if (air) { fly(rng.range(-9, 9), rng.range(-2.5, 6.5), rng.range(0.8, 3.2), rng.range(1.6, 3.2)); continue; }
    const r = rng();
    if (r < 0.14) { const L = rng.range(1.4, 4.6), th = rng() * 6.283; hop(clamp(x + Math.cos(th) * L, X0, X1), clamp(y + Math.sin(th) * L * 0.75, Y0, Y1)); continue; }
    if (r < 0.4) { const d = rng.range(0.25, 1.3); legs.push({ t0: t, t1: t + d, ty: 0, a: [x, y], b: [x, y], h, hp: h }); t += d; continue; }
    const L = rng.range(0.3, 1.3), th = h + rng.range(-1.6, 1.6), bx = clamp(x + Math.cos(th) * L, X0, X1), by = clamp(y + Math.sin(th) * L, Y0, Y1);
    const d = Math.max(0.3, Math.hypot(bx - x, by - y) / rng.range(0.45, 1.0)), nh = Math.hypot(bx - x, by - y) > 0.05 ? Math.atan2(by - y, bx - x) : h;
    legs.push({ t0: t, t1: t + d, ty: 1, a: [x, y], b: [bx, by], h: nh, hp: h }); x = bx; y = by; h = nh; t += d;
  }
  if (air) fly(x0, y0, z0, 2.4); else hop(x0, y0);              // close the loop
  return legs;
}
const _bm = new THREE.Matrix4(), _wm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _bv = new THREE.Vector3(), _be = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _ws = new THREE.Matrix4(), _wt = new THREE.Matrix4(), _wr = new THREE.Matrix4(), _we = new THREE.Euler();
function beeAt(legs, tau, o) {                                 // tiny bee pose at its own time tau -> o { x, y, z, h (heading), fly }
  const T_ = legs[legs.length - 1].t1; tau = ((tau % T_) + T_) % T_;
  let lo = 0, hi = legs.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (legs[m].t1 <= tau) lo = m + 1; else hi = m; }
  const L = legs[lo], p = clamp((tau - L.t0) / Math.max(1e-3, L.t1 - L.t0), 0, 1), dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1];
  o.leg = lo;
  if (L.ty === 0) { o.x = L.a[0]; o.y = L.a[1]; o.z = ZM + 0.08; o.h = (hash1(lo) - 0.5) * 6 + 0.15 * Math.sin(tau * 9); o.fly = 0; return o; }
  if (L.ty === 1) { o.x = L.a[0] + dx * p + 0.03 * Math.sin(tau * 23); o.y = L.a[1] + dy * p; o.z = ZM + 0.08; o.h = Math.atan2(dy, dx) + 0.2 * Math.sin(tau * 11); o.fly = 0; return o; }
  const e = E.inOut(p);
  o.x = L.a[0] + dx * e; o.y = L.a[1] + dy * e + L.arc * Math.sin(Math.PI * p) + 0.05 * Math.sin(tau * 31); o.z = ZM + 0.1 + L.z * Math.sin(Math.PI * p);
  o.h = Math.atan2(dy + L.arc * Math.PI * Math.cos(Math.PI * p) * 0.3, dx); o.fly = 1; o.hop = L;
  return o;
}
function bigAt(legs, tau, o) {                                 // big bee pose -> o { x, y, dz (above the comb, or above ZM when airborne), h, pitch, fly 0 / 1 hop / 2 air }
  const T_ = legs[legs.length - 1].t1; tau = ((tau % T_) + T_) % T_;
  let lo = 0, hi = legs.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (legs[m].t1 <= tau) lo = m + 1; else hi = m; }
  const L = legs[lo], q = tau - L.t0, p = clamp(q / Math.max(1e-3, L.t1 - L.t0), 0, 1), dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1];
  o.leg = lo; o.L = L; o.pitch = 0;
  if (L.ty === 0) { o.x = L.a[0]; o.y = L.a[1]; o.dz = 0; o.fly = 0; o.h = L.h + 0.3 * Math.sin(Math.PI * p) * Math.sin(tau * 3.1 + lo); return o; }
  const turn = Math.min(1, q / 0.22);
  if (L.ty === 1) { o.x = L.a[0] + dx * p; o.y = L.a[1] + dy * p; o.dz = 0; o.fly = 0; o.h = lerpAng(L.hp, L.h, turn) + 0.1 * Math.sin(tau * 13); return o; }
  const e = E.inOut(p);
  if (L.ty === 2) {
    o.x = L.a[0] + dx * e; o.y = L.a[1] + dy * e + L.arc * Math.sin(Math.PI * p); o.dz = L.z * Math.sin(Math.PI * p);
    o.fly = 1; o.h = lerpAng(L.hp, L.h, turn); o.pitch = 0.35 * Math.cos(Math.PI * p); return o;
  }
  const s = L.arc * Math.sin(Math.PI * p);
  o.x = L.a[0] + dx * e + s * Math.sin(L.h); o.y = L.a[1] + dy * e - s * Math.cos(L.h) + 0.06 * Math.sin(tau * 7);
  o.dz = L.a[2] + (L.b[2] - L.a[2]) * e; o.fly = 2; o.h = lerpAng(L.hp, L.h, Math.min(1, q / 0.4)); o.pitch = 0.3; return o;
}
// ---------- the meshes ----------
BEES.init = function () {
  if (this.mesh) return this.group;
  for (let i = 0; i < BEE_MAX; i++) this.legs.push(beeLegs(i));
  for (let i = 0; i < BIG_MAX; i++) this.big.push(bigLegs(i));
  this.mesh = new THREE.InstancedMesh(beeGeo(), new THREE.MeshLambertMaterial({ vertexColors: true }), BEE_MAX);
  this.wings = new THREE.InstancedMesh(wingGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), BEE_MAX);
  this.bigMesh = new THREE.InstancedMesh(bigBeeGeo(), new THREE.MeshLambertMaterial({ vertexColors: true }), BIG_N);
  const wg = bigWingGeos();
  this.bigWings = new THREE.InstancedMesh(wg.fill, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false }), BIG_N * 2);
  this.bigVeins = new THREE.InstancedMesh(wg.lines, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }), BIG_N * 2);
  this.bigVeins.instanceMatrix = this.bigWings.instanceMatrix;   // the same poses (one buffer, two meshes)
  this.pollen = new THREE.InstancedMesh(pollenGeo(), new THREE.MeshLambertMaterial({ vertexColors: true }), BIG_N);
  this.capMesh = new THREE.InstancedMesh(larvaGeos().cap, MAT.obj, CAP_N);
  const all = [this.mesh, this.wings, this.bigMesh, this.bigWings, this.bigVeins, this.pollen, this.capMesh];
  for (const m of all) { m.frustumCulled = false; m.userData.sharedGeo = true; m.raycast = () => {}; for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO); }
  this.bigMesh.onBeforeRender = () => this.step();
  this.group = new THREE.Group(); this.group.add(...all);
  return this.group;
};
// a new run (or the briefing of one): swarm sizes from its 'swarm' spawn, the wax-cap schedule from its larvae
BEES.reset = function (run) {
  const sw = run.timeline.find(s => s.kind === 'swarm') || {};
  this.run = run; this.n = sw.bees || 7; this.nBig = Math.min(BIG_MAX, sw.big || 30); this.hopBias = sw.fast || 0;
  this.f = -1; this.fin = -1; this.extra.clear(); this.bz.fill(NaN); this.hitB.fill(-99);
  this.caps = run.timeline.filter(s => s.larva && s.cap != null).map(s => ({ cell: s.cell, a: s.cap, f: s.capF || 0, t0: s.t0 }));
  clearMarks();
};
BEES.boost = function () {                                     // frenzy speed boost 0..1 (ramps in 0.15 s, out over the last 0.4 s)
  if (this.f < 0) return 0;
  const q = this.f; return q < 0.15 ? q / 0.15 : q > FRENZY_T - 0.4 ? Math.max(0, (FRENZY_T - q) / 0.4) : 1;
};
BEES.frenzy = function (u) {                                   // start (or restart) the frenzy: no stacking, no escalation
  const was = this.f >= 0 && this.f < FRENZY_T - 0.4;
  this.f = was ? Math.min(this.f, 0.15) : 0;
  if (!was) B.SFX.play('beeFrenzy', { u: u == null ? 0.5 : u });
};
BEES.capGrow = (c, T) => c.f > 0 ? clamp((T - c.a) / c.f, 0, 1) : 1;
const _bo = {};
BEES.step = function () {
  const now = performance.now() / 1000, rdt = this.last ? Math.min(0.05, now - this.last) : 0.016; this.last = now;
  const dt = rdt * slowK(), G = B.G;
  if (G && G.run && G.run.stage === 'beehive' && G.run !== this.run && G.run.timeline) this.reset(G.run);
  if (this.f >= 0) { this.f += dt; if (this.f >= FRENZY_T) this.f = -1; }
  if (this.fin >= 0) { this.fin += dt; if (this.fin > FIN_END) this.fin = -1; }
  const k = this.boost();
  this.clock += dt * (1 + FRENZY_K * k + this.hopBias);
  const run = this.run && G && this.run === G.run ? this.run : null, T = run ? run.t : -99;
  // what stands in each cell right now (the big bees climb onto it): items (Cell.liftZ) and the swarm's wax caps
  const lf = this.lift; lf.fill(0);
  if (run) {
    for (const t of run.live) if (t.liftZ > 0 && t.C) lf[t.C.i] = Math.max(lf[t.C.i], t.liftZ);
    for (const c of this.caps) if (T >= c.a && T < c.t0) lf[c.cell] = Math.max(lf[c.cell], CAP_LIFT * this.capGrow(c, T));
  }
  this.stepTiny(now, k);
  this.stepBig(now, rdt, k, run, T);
  this.stepCaps(run, T);
};
BEES.stepTiny = function (now, k) {
  const M = this.mesh, W = this.wings, fin = this.fin;
  for (let i = 0; i < BEE_MAX; i++) {
    if (i >= this.n) { M.setMatrixAt(i, ZERO); W.setMatrixAt(i, ZERO); continue; }
    const tau = this.clock * (0.85 + 0.3 * hash1(i * 3 + 1)) + i * 37.1, o = beeAt(this.legs[i], tau, _bo);
    let x = o.x, y = o.y, z = o.z, h = o.h, fly = o.fly;
    if (fin >= 0) {                                            // the finale: they swirl round the letters
      const a = fin * 1.4 + i * 6.283 / this.n, e = E.inOut(clamp(fin / 0.9, 0, 1)) * (1 - E.inOut(clamp((fin - 3.6) / 1.2, 0, 1)));
      x += (Math.cos(a) * 8.4 - x) * e; y += (FIN_Y + Math.sin(a) * 2.7 - y) * e; z += (FIN_Z + 0.3 * Math.sin(a * 2) - z) * e;
      if (e > 0.05) { fly = 1; h = a + HALF; }
    }
    if (k > 0) { x += 0.06 * k * Math.sin(now * 37 + i); y += 0.06 * k * Math.cos(now * 41 + i * 2); }
    this.draw(i, x, y, z, h, fly || k > 0 ? 1 : 0, now, k);
  }
  M.instanceMatrix.needsUpdate = true; W.instanceMatrix.needsUpdate = true;
};
BEES.draw = function (i, x, y, z, h, fly, now, k) {           // a tiny bee (side view, mirrored when heading left)
  const left = Math.cos(h) < 0, s = 1.35;
  _be.set(0, 0, left ? h - Math.PI : h); _bq.setFromEuler(_be);
  _bm.compose(_bv.set(x, y, z), _bq, _bs.set(left ? -s : s, s, s));
  this.mesh.setMatrixAt(i, _bm);
  const fr = fly ? ((now * (k > 0 ? 46 : 30) + i * 0.37) | 0) % 3 : 0, fl = [1, 0.25, -0.8][fr];
  _wm.makeTranslation(0, BS * 1.5, 0).premultiply(_bm); _wm.multiply(_ws.makeScale(1, fl, 1));
  this.wings.setMatrixAt(i, _wm);
};
BEES.liftAt = function (x, y) {                                // the height of whatever stands in the cell under (x, y)
  let best = 0, bd = A * A * 1.05;
  for (const C of CELLS) { const dx = x - C.x, dy = y - C.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = this.lift[C.i]; } }
  return best;
};
const _fo = {};
BEES.stepBig = function (now, rdt, k, run, T) {
  const fin = this.fin, zs = Math.min(1, rdt * 12);
  for (let i = 0; i < BIG_MAX; i++) {
    const vis = i < this.nBig;
    let x = 0, y = 0, z = 0, h = 0, fly = 0, pitch = 0, sc = 1;
    if (vis) {
      const tau = this.clock * (0.8 + 0.4 * hash1(i * 5 + 3)) + hash1(i * 11 + 7) * 300, o = bigAt(this.big[i], tau, _bo);
      x = o.x; y = o.y; h = o.h; fly = o.fly; pitch = o.pitch;
      if (fly === 2) z = ZM + o.dz;
      else {
        const base = ZM + 0.1 + this.liftAt(x, y);
        this.bz[i] = this.bz[i] > ZM - 1 ? this.bz[i] + (base - this.bz[i]) * zs : base;
        z = this.bz[i] + o.dz;
      }
      if (fly === 1 && o.L.z > 1.2 && o.leg !== this.lastBig[i] && inPlay()) {   // a close fly-by: beePass (throttled)
        this.lastBig[i] = o.leg;
        if (now - this.passT > (k > 0 ? 0.35 : 1.6)) { this.passT = now; B.SFX.play('beePass', { u: clamp(0.5 + x / 16, 0, 1) }); }
      }
    }
    if (fin >= 0) {
      const r = this.finPose(i, fin, vis, x, y, z, h);
      if (r === null) { this.hideBig(i); continue; }
      if (r) { x = r.x; y = r.y; z = r.z; h = r.h; fly = r.fly; pitch = r.pitch; sc = r.sc; }
    } else if (!vis) { this.hideBig(i); continue; }
    if (k > 0) { x += 0.05 * k * Math.sin(now * 37 + i); y += 0.05 * k * Math.cos(now * 41 + i * 2); }
    let roll = 0; const ht = now - this.hitB[i];               // a shot bee tumbles for a moment
    if (ht < 0.6) { roll = ht * 25; z += 0.4 * Math.sin(Math.PI * ht / 0.6); }
    this.drawBig(i, x, y, z, h, pitch, roll, sc, fly || (k > 0 ? 1 : 0), now, k);
  }
  // extras right after the swarm's slots; only the slots in use are drawn (mesh.count), the rest drop out of the hit test
  let j = fin >= 0 ? Math.min(BIG_MAX, Math.max(this.nBig, this.finFrom.length)) : this.nBig;
  for (const e of this.extra.values()) { if (j >= BIG_N) break; this.drawBig(j++, e.x, e.y, e.z, e.h, e.pitch || 0, 0, e.sc || 1, e.fly, now, k); }
  if (run) j = this.workers(j, T, now, k);
  for (let q = j; q < BIG_N; q++) this.bp[q * 4 + 2] = -99;
  this.bigMesh.count = this.pollen.count = j; this.bigWings.count = this.bigVeins.count = j * 2;
  this.bigMesh.instanceMatrix.needsUpdate = true; this.bigWings.instanceMatrix.needsUpdate = true; this.pollen.instanceMatrix.needsUpdate = true;
};
const WROOT = [2.2 * BV, 0.7 * BV, 3.4 * BV], WFOLD = [-0.42, 0], WFLY = [[-1.35, 0], [-1.05, 1.05], [-1.5, -0.95]], WHOV = [[-0.42, 0], [-0.7, 1.0]];   // wing root; [yaw, roll] poses (WHOV: hovering in a letter, wings kept close: cleaner letters)
BEES.drawBig = function (i, x, y, z, h, pitch, roll, sc, wings, now, k) {
  _be.set(roll, -pitch, h, 'ZYX'); _bq.setFromEuler(_be);
  _bm.compose(_bv.set(x, y, z), _bq, _bs.set(sc, sc, sc));
  this.bigMesh.setMatrixAt(i, _bm);
  this.pollen.setMatrixAt(i, POLLEN(i) ? _bm : ZERO);
  const fr = wings === 3 ? WHOV[((now * 33 + i * 0.41) | 0) & 1] : wings ? WFLY[((now * (k > 0 ? 47 : 33) + i * 0.41) | 0) % 3] : WFOLD;
  for (let s = 0; s < 2; s++) {                                // the left wing is the right one mirrored
    _wm.copy(_bm).multiply(_ws.makeScale(1, s ? -1 : 1, 1)).multiply(_wt.makeTranslation(WROOT[0], WROOT[1], WROOT[2]))
      .multiply(_wr.makeRotationFromEuler(_we.set(fr[1], 0, fr[0], 'ZYX')));
    this.bigWings.setMatrixAt(i * 2 + s, _wm);
  }
  const b = i * 4; this.bp[b] = x; this.bp[b + 1] = y; this.bp[b + 2] = z; this.bp[b + 3] = h; this.bsc[i] = sc;
};
BEES.hideBig = function (i) {
  this.bigMesh.setMatrixAt(i, ZERO); this.pollen.setMatrixAt(i, ZERO); this.bigWings.setMatrixAt(i * 2, ZERO); this.bigWings.setMatrixAt(i * 2 + 1, ZERO);
  this.bp[i * 4 + 2] = -99;
};
// the wax caps on cells waiting for a larva (pure function of the run's larva schedule + the stage clock): a cap forms
// over capF s from cap (the stage time it is laid), stands until the larva's spawn takes it over (Cell: it thins out)
BEES.stepCaps = function (run, T) {
  const M = this.capMesh; let j = 0;
  if (run) for (const c of this.caps) {
    if (j >= CAP_N) break;
    if (T < c.a || T >= c.t0) continue;
    const g = this.capGrow(c, T), C = CELLS[c.cell], s = 0.35 + 0.65 * g;
    _bq.identity(); M.setMatrixAt(j++, _bm.compose(_bv.set(C.x, C.y, CAP_Z), _bq, _bs.set(s, s, Math.max(0.05, g))));
  }
  M.count = j; M.instanceMatrix.needsUpdate = true;
};
// two worker bees fly in, work the wax while the cap grows under them, then walk off (stage clock: they match the cap)
BEES.workers = function (j, T, now, k) {
  for (const c of this.caps) {
    if (c.f <= 0 || T < c.a - 1.0 || T > c.a + c.f + 1.0) continue;
    const C = CELLS[c.cell], g = this.capGrow(c, T);
    for (let w = 0; w < 2 && j < BIG_N; w++) {
      const th = hash1(c.cell * 31 + w * 7 + Math.round(c.a * 10)) * 6.283, th2 = th + 2.2 + w;
      const sx = C.x + Math.cos(th) * 2.4, sy = C.y + Math.sin(th) * 2.0, ex = C.x + Math.cos(th2) * 2.2, ey = C.y + Math.sin(th2) * 1.8;
      const ox = C.x + (w ? 0.3 : -0.3), oy = C.y + (w ? -0.14 : 0.16);
      let x, y, h, dz = 0, sc = 1, fly = 0;
      if (T < c.a) { const q = clamp(T - (c.a - 1.0), 0, 1), p = E.inOut(q); x = sx + (ox - sx) * p; y = sy + (oy - sy) * p; h = Math.atan2(oy - sy, ox - sx); dz = 1.2 * (1 - p) * (1 - p); fly = q < 0.75 ? 1 : 0; sc = Math.min(1, 0.3 + q * 3); }
      else if (T < c.a + c.f) { x = ox + 0.04 * Math.sin(T * 17 + w); y = oy + 0.04 * Math.cos(T * 13 + w); h = (w ? Math.PI : 0) + 0.6 * Math.sin(T * 6 + w * 2); }
      else { const p = E.inOut(clamp(T - c.a - c.f, 0, 1)); x = ox + (ex - ox) * p; y = oy + (ey - oy) * p; h = Math.atan2(ey - oy, ex - ox); }
      this.drawBig(j++, x, y, ZM + 0.12 + CAP_LIFT * g * 0.9 + dz, h, 0, 0, sc, fly || k > 0, now, k);
    }
  }
  return j;
};
// ---------- the finale (#83): the bees lift off and spell B.L.A.M. in the air (one bee a letter pixel), hold it, scatter, settle back ----------
let FINPX = null;
// 'B.L.A.M.' in thin hand-made glyphs, 6 rows (one bee a pixel, 57 bees): rows as bit masks, `w` columns wide
const FIN_GLYPHS = [{ w: 4, r: [14, 9, 14, 9, 9, 14] }, { w: 4, r: [8, 8, 8, 8, 8, 15] }, { w: 4, r: [6, 9, 9, 15, 9, 9] }, { w: 5, r: [17, 27, 21, 17, 17, 17] }];
function finPixels() {                                         // -> [x, y, heading] per bee
  if (FINPX) return FINPX;
  const out = [];
  let x = 0;
  for (const g of FIN_GLYPHS) {
    for (let y = 0; y < 6; y++) for (let i = 0; i < g.w; i++) if ((g.r[y] >> (g.w - 1 - i)) & 1) out.push([x + i, y]);
    x += g.w + 1; out.push([x, 5]); x += 2;                       // the dot
  }
  const W = x - 2, has = new Set(out.map(p => p[0] + ',' + p[1]));
  return (FINPX = out.map(([px, py]) => {
    const hz = has.has((px - 1) + ',' + py) || has.has((px + 1) + ',' + py), vt = has.has(px + ',' + (py - 1)) || has.has(px + ',' + (py + 1));
    return [(px - W / 2) * FIN_P, FIN_Y + (2.5 - py) * FIN_P, hz && !vt ? 0 : HALF];   // a bee lies along its stroke
  }));
}
BEES.startFinale = function () {
  const P = finPixels(), n = P.length, N = Math.min(BIG_MAX, Math.max(n, this.nBig)), slots = [];
  this.fin = 0; this.finFrom = []; this.finTo = [];
  for (let i = 0; i < N; i++) {
    const b = i * 4, on = i < this.nBig && this.bp[b + 2] > -50;
    this.finFrom[i] = on ? [this.bp[b], this.bp[b + 1], this.bp[b + 2], this.bp[b + 3]] : [-7.9 + 1.6 * (hash1(i * 13) - 0.5), GROUND_Y + 0.7, -2.4, 0];   // latecomers: out of the hive box
    if (i < n) slots.push(i);
  }
  slots.sort((a, b) => this.finFrom[a][0] - this.finFrom[b][0]);   // left bees take the left letters (few crossings)
  const order = P.map((p, k) => k).sort((a, b) => P[a][0] - P[b][0] || P[a][1] - P[b][1]);
  slots.forEach((s, k) => { const p = P[order[k]]; this.finTo[s] = [p[0], p[1], FIN_Z, p[2]]; });
  B.SFX.play('beeFrenzy', { u: 0.5 });
};
// a bee's finale pose (f = s since the start): undefined = its normal pose, null = hidden
BEES.finPose = function (i, f, vis, x, y, z, h) {
  const fr = this.finFrom[i]; if (!fr) return vis ? undefined : null;
  let to = this.finTo[i];
  if (!to) { const a = f * 1.2 + i * 2.39; to = [Math.cos(a) * 8.8, FIN_Y + Math.sin(a) * 2.9, FIN_Z - 0.4, a + HALF]; }   // extra bees: a cloud round the letters
  const o = _fo, d0 = 0.35 * hash1(i * 3 + 1), p = clamp((f - d0) / 0.95, 0, 1), e = E.inOut(p), ts = 3.45 + 0.25 * hash1(i * 7 + 2);
  o.fly = 1; o.pitch = 0; o.sc = 1;
  if (f < ts) {                                                // lift off, fly to the letter, hover there
    o.x = fr[0] + (to[0] - fr[0]) * e; o.y = fr[1] + (to[1] - fr[1]) * e; o.z = fr[2] + (to[2] - fr[2]) * e + 1.0 * Math.sin(Math.PI * p);
    const travel = Math.atan2(to[1] - fr[1], to[0] - fr[0]);
    o.h = p < 1 ? lerpAng(travel, to[3], clamp((p - 0.7) / 0.3, 0, 1)) : to[3] + 0.07 * Math.sin(f * 5 + i);
    if (p >= 1) { o.x += 0.025 * Math.sin(f * 9 + i); o.y += 0.025 * Math.cos(f * 7 + i * 1.7); o.fly = 3; }   // hovering: wings kept close (cleaner letters)
    o.sc = 1 - (1 - (this.finTo[i] ? FIN_SC : 0.8)) * e; o.pitch = p < 1 ? 0.3 : 0; return o;
  }
  const q = (f - ts) / 0.9, qq = Math.min(1, q), dx = to[0] + 0.5 * (hash1(i) - 0.5), dy = to[1] - FIN_Y + (hash1(i * 5) - 0.5) * 2, dl = Math.hypot(dx, dy) || 1;
  const ox = to[0] + dx / dl * 13 * qq * qq, oy = to[1] + dy / dl * 9 * qq * qq, oz = to[2] + 2.5 * qq;   // scatter outward
  if (q < 1) { o.x = ox; o.y = oy; o.z = oz; o.h = Math.atan2(dy, dx); o.sc = FIN_SC + (1 - FIN_SC) * q; o.pitch = 0.3; return o; }
  if (!vis) return null;
  const r = E.inOut(clamp((q - 1) / 1.3, 0, 1));               // and back to the comb
  o.x = ox + (x - ox) * r; o.y = oy + (y - oy) * r; o.z = oz + (z - oz) * r; o.h = r < 0.85 ? Math.atan2(y - oy, x - ox) : h; o.fly = r < 1 ? 1 : 0; return o;
};
// the swarm's hit test (Targets.pick calls it with the shot's raycaster). Only the BIG bees count (the tiny ones are
// looks only): a big bee whose body axis passes within BIG_PX game px of the ray, with NO live cell target on the ray,
// starts the frenzy. It never reports an intersection, so the engine sees no target: a plate or bomb behind a bee is hit
// as usual, and a shot that only finds a bee is a plain miss for the stats. No hit test during the finale.
const BIG_PX = 5, BODY_U = [-0.58, -0.32, -0.06, 0.2, 0.42], _hp = new THREE.Vector3(), _cp = new THREE.Vector3();
function beeRaycast(rc) {
  const sw = this.userData.target, run = sw && sw.run; if (!run || BEES.fin >= 0) return;
  let best = -1, bd = 1e9;
  for (let i = 0; i < BIG_N; i++) {
    const b = i * 4; if (BEES.bp[b + 2] < -50) continue;
    const x = BEES.bp[b], y = BEES.bp[b + 1], z = BEES.bp[b + 2], s = BEES.bsc[i], ch = Math.cos(BEES.bp[b + 3]) * s, sh = Math.sin(BEES.bp[b + 3]) * s;
    for (const u of BODY_U) {
      _hp.set(x + ch * u, y + sh * u, z + 0.12 * s);
      const perPx = 2 * _hp.distanceTo(rc.ray.origin) * R.TAN_H / R.RH;
      rc.ray.closestPointToPoint(_hp, _cp); const dd = _cp.distanceTo(_hp) / perPx;
      if (dd < BIG_PX && dd < bd) { bd = dd; best = i; }
    }
  }
  if (best < 0) return;
  const ms = [];
  for (const t of run.live) if (t !== sw && t.alive && t.shootable && t.group.visible) for (const m of t.meshes()) if (m.visible) ms.push(m);
  if (ms.length && rc.intersectObjects(ms, false).length) return;   // the target takes the shot
  const i = best, now = performance.now() / 1000;
  BEES.hitB[i] = now;
  _hp.set(BEES.bp[i * 4], BEES.bp[i * 4 + 1], BEES.bp[i * 4 + 2]);
  const u = clamp(R.toPx(_hp)[0] / R.RW, 0, 1);
  for (let q = 0; q < 8; q++) T.spawnChip(_hp, _sv.set(R.rnd(-1, 1), R.rnd(0.2, 1.4), R.rnd(0, 1)), 0.045, [PAL.amber, PAL.umber, PAL.sand, PAL.mist][q & 3], R.rnd(0.25, 0.45), 0.6, GROUND_Y);
  B.SFX.play('beeHit', { u });
  BEES.frenzy(u);
}

// =========================================================================================
// MISS MARKS (#82): the comb and the yard are hit-tested by an invisible proxy (the env's only shootable) that marks the
// spot itself (buildEnv: the engine's square bullet hole is wiped, its tracer / ricochet still land on the real hit).
// Wax / wood / grass: a small dent in a darker shade of the surface + chipped flecks in a lighter one; a honey cell: a
// honey splash with a drip. Subtle, shrinking away after 5 s (gone at 9 s). One InstancedMesh (4 boxes a mark), wall
// clock, looks only.
// =========================================================================================
const MARK_N = 36, MARK_K = 4, MARK_LIFE = 9, MARKS = new Array(MARK_N).fill(null);
let markMesh = null, markNext = 0;
const _mq = new THREE.Vector3(), _ms = new THREE.Vector3(), _mm = new THREE.Matrix4(), _mc = new THREE.Color(), _zA = new THREE.Vector3(0, 0, 1);
function buildMarks() {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), MARK_N * MARK_K);
  m.frustumCulled = false; m.raycast = () => {};
  for (let i = 0; i < m.count; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, _mc.set(0xffffff)); }
  m.onBeforeRender = stepMarks;
  return (markMesh = m);
}
function clearMarks() {
  MARKS.fill(null); if (!markMesh) return;
  for (let i = 0; i < markMesh.count; i++) markMesh.setMatrixAt(i, ZERO);
  markMesh.instanceMatrix.needsUpdate = true;
}
function envMark(h, comb) {
  const p = h.point, n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : _zA.clone();
  const col = new THREE.Color(T.surfaceColor(h)), q = p.distanceTo(CAMP) * 2 * R.TAN_H / R.RH;   // world units per game px
  const honey = comb && n.z > 0.7 && p.z < ZM - 0.12 && p.z > ZM - 0.8 && col.r > 0.55 && col.b < 0.45;
  const sh = f => _mc.setRGB(Math.min(1, col.r * f), Math.min(1, col.g * f), Math.min(1, col.b * f)).getHex();   // clamped (getHex wraps past 1)
  const parts = honey
    ? [[0, 0, 3.2, 2.2, PAL.orange], [0.8, 0.5, 1.4, 1, PAL.yellow], [0.7, -2.1, 1, 2.4, PAL.orange], [-2.3, 1.1, 1, 1, PAL.amber]]
    : [[0, 0, 2.4, 2.2, sh(0.5)], [1.7, 1.3, 1, 1, sh(1.25)], [-1.6, -1.2, 1, 1, sh(1.12)], [0.4, -1.9, 1.2, 1, sh(0.72)]];
  MARKS[markNext] = { t: performance.now() / 1000, p: p.clone().addScaledVector(n, 0.012), quat: new THREE.Quaternion().setFromUnitVectors(_zA, n), q, parts, fresh: true };
  markNext = (markNext + 1) % MARK_N;
  // a few drops / chips that fall to the yard (the engine adds its own surface chips and the ricochet burst)
  if (honey) for (let k = 0; k < 3; k++) T.spawnChip(p, _sv.set(R.rnd(-0.8, 0.8), R.rnd(0.5, 1.6), R.rnd(0.6, 1.4)), R.rnd(0.03, 0.05), k & 1 ? PAL.orange : PAL.amber, R.rnd(0.6, 1.0), 1, GROUND_Y);
  else for (let k = 0; k < 2; k++) T.spawnChip(p, _sv.set(n.x * R.rnd(0.6, 1.6) + R.rnd(-0.8, 0.8), n.y * R.rnd(0.6, 1.6) + R.rnd(0.3, 1.5), n.z * R.rnd(0.6, 1.6) + R.rnd(-0.5, 0.5)), R.rnd(0.025, 0.04), k & 1 ? sh(1.15) : sh(0.8), R.rnd(0.5, 0.9), 1, GROUND_Y);
}
function stepMarks() {
  const now = performance.now() / 1000; let any = false, col = false;
  for (let i = 0; i < MARK_N; i++) {
    const mk = MARKS[i]; if (!mk) continue;
    const age = now - mk.t, k = age < 5 ? 1 : 1 - (age - 5) / (MARK_LIFE - 5);
    for (let j = 0; j < MARK_K; j++) {
      const id = i * MARK_K + j, pt = mk.parts[j];
      if (k <= 0) { markMesh.setMatrixAt(id, ZERO); continue; }
      _mq.set(pt[0] * mk.q, pt[1] * mk.q, 0).applyQuaternion(mk.quat).add(mk.p);
      markMesh.setMatrixAt(id, _mm.compose(_mq, mk.quat, _ms.set(pt[2] * mk.q * k, pt[3] * mk.q * k, 0.01)));
      if (mk.fresh) markMesh.setColorAt(id, _mc.set(pt[4]));
    }
    if (mk.fresh) { mk.fresh = false; col = true; }
    if (k <= 0) MARKS[i] = null;
    any = true;
  }
  if (any) markMesh.instanceMatrix.needsUpdate = true;
  if (col) markMesh.instanceColor.needsUpdate = true;
}

// =========================================================================================
// CELL TARGETS
// =========================================================================================
P.warm();
const HATCH_GAP = 0.1, BEE_OUT = 1.3;                          // larva burst -> item entrance; a hatched bee's fly-out
const HB_GRACE = 0.15, HB_BEAT = 0.6;                          // hidden bomb: spring-up grace, live beat
const DECOY_ARM = 0.3, DECOY_UNMASK = 0.16;                    // the decoy build-up (as the range)
// the pose of a cell's item: a pure function of (spawn, local time, ext = the extra stay a deep-cell member earned)
//   larva (lt < ripen) -> hatch burst -> [bee fly-out | the item BURSTS out standing: pop = its scale, 0.15 -> 1
//   easeOutBack, no flip] / a plain item's entrance: flips up out of the cell on its bottom edge -> stay (settling
//   wobble) -> exit (flips back in). rx = the hinge angle (-pi/2 lying in the cell, 0 standing).
function cellPose(sp, lt, o, ext) {
  o = o || {};
  o.rx = -HALF; o.visible = lt >= 0; o.shootable = false; o.done = false; o.phase = 'wait'; o.f = 0; o.pop = 1;
  if (lt < 0) return o;
  const at = sp.at || 0, Lv = sp.larva;
  if (Lv) {
    if (lt < Lv.ripen) { o.phase = 'larva'; o.f = lt / Lv.ripen; return o; }
    if (lt < at) { o.phase = 'hatch'; return o; }
    if (Lv.hatch === 'bee') { o.phase = 'bee'; o.f = Math.min(1, (lt - at) / BEE_OUT); o.done = lt - at >= BEE_OUT; return o; }
  }
  const q = lt - at, sw = sp.swing, stay = sp.stay + (ext || 0), lv = sp.lv;
  if (q < sw) { o.phase = 'in'; if (Lv) { o.rx = 0; o.pop = 0.15 + 0.85 * E.outBack(q / sw); } else o.rx = -HALF * (1 - E.outBack(q / sw)); o.shootable = q >= sp.ra; return o; }
  if (q < sw + stay) { const tau = q - sw; o.phase = 'up'; o.rx = 0.13 * Math.exp(-5 * tau) * Math.sin(15 * tau); o.shootable = true; return o; }
  const r = q - sw - stay;
  if (r < lv) { o.phase = 'out'; o.rx = -HALF * E.inCubic(r / lv); o.shootable = r / lv < 0.7; return o; }
  o.done = true; o.visible = false; return o;
}
const lifeOf = sp => (sp.at || 0) + (sp.larva && sp.larva.hatch === 'bee' ? BEE_OUT : sp.swing + sp.stay + sp.lv);
const spanOf = sp => sp.swing - sp.ra + sp.stay + 0.7 * sp.lv;   // shootable seconds of the item
// ---------- larva visuals: shared geometries (the wax cap, the grub, the glow hex) ----------
let LG = null;
function larvaGeos() {
  if (LG) return LG;
  // the WAX CAP (#81): a bumpy tan dome filling the cell mouth (like the photo's capped brood): terraced voxels, sand
  // highlights, chestnut pits and a darker rim where it meets the walls; no back faces (it turns translucent)
  const cap = [], cs = 0.075, RA = (AI + 0.03) / cs;
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
    const hx = Math.max(Math.abs(j), 0.866 * Math.abs(i) + 0.5 * Math.abs(j)) / RA;
    if (hx > 1) continue;
    const H = Math.max(0, Math.round(3.4 * (1 - hx * hx) + (vh(i, j, 5) - 0.5) * 0.9 + 0.45 * Math.sin(i * 0.9 + j * 0.55)));
    const lit = (-i * 0.6 + j) / 12 + (vh(i, j, 9) - 0.5) * 0.5;               // a dome lit from the upper left, a little mottled
    for (let k = 0; k <= H; k++) {
      const r = vh(i, j, k);
      cap.push([i, j, k, PAL[hx > 0.88 ? (r < 0.5 ? 'chestnut' : 'tan') : k < H ? 'tan' : r < 0.05 ? 'chestnut' : lit > 0.35 ? 'sand' : lit < -0.45 ? 'chestnut' : r < 0.12 ? 'amber' : 'tan']]);
    }
  }
  // the LARVA: a big chunky C-curled grub, 0.06 voxels: a round tube (head end fat, tail thinner), glossy white on top,
  // mist flanks, warm sand creases between the segments, a lemon head with a dark mouth
  const grub = [], s = 0.06;
  for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
    const r = Math.hypot(i, j), a = Math.atan2(j, i);
    if (a > -0.62 && a < 0.2) continue;                                      // the gap of the C (head meets tail)
    const t = (((a - 0.2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI - 0.82);   // 0 head .. 1 tail
    const rw = 3.5 - 1.3 * t, dr = r - 6.2;
    if (Math.abs(dr) > rw) continue;
    const top = Math.round(Math.sqrt(rw * rw - dr * dr)), ph = (t * 11) % 1, head = t < 0.09;
    for (let k = -1; k <= top; k++) {
      const surf = k === top;
      grub.push([i, j, k, PAL[head ? (surf && t < 0.03 && Math.abs(dr) < 1 ? 'chestnut' : surf ? 'lemon' : 'sand')
        : surf && ph < 0.13 ? 'sand' : Math.abs(dr) > rw * 0.85 ? 'mist' : 'bone']]);
    }
  }
  const glow = new Vox(); hexFill(glow, 0, 0, AI - 0.02, 0, PAL.bone, 16, 8, 0.01);
  return (LG = { cap: voxGeo(cap, cs), grub: voxGeo(grub, s), glow: glow.geo() });
}
const FRONT = {};                                              // item kind -> front z above the comb (measured)
const RIPE_COL = ['umber', 'walnut', 'chestnut', 'rust', 'orange', 'amber', 'yellow', 'lemon'].map(n => PAL[n]);
// chip shatter that falls to the yard (the engine's Target.shatter bounces chips on y = 0, which is mid-comb here)
function chipShatter(tg, point, opts = {}) {
  const total = tg.parts.reduce((a, p) => a + p.list.length, 0) || 1, keep = Math.min(1, (opts.max || 150) / total), pw = opts.power || 1;
  tg.group.updateMatrixWorld(true);
  const hit = point ? point.clone() : tg.group.getWorldPosition(new THREE.Vector3()), v = new THREE.Vector3(), w = new THREE.Vector3(), s3 = new THREE.Vector3();
  for (const p of tg.parts) {
    const sc = s3.setFromMatrixScale(p.mesh.matrixWorld).x * p.s;
    for (const [i, j, k, col, mul] of p.list) {
      if (Math.random() > keep) continue;
      v.set(p.ox + i * p.s, p.oy + j * p.s, p.oz + k * p.s).applyMatrix4(p.mesh.matrixWorld);
      w.copy(v).sub(hit); w.z = 0; if (w.lengthSq() < 1e-6) w.set(R.rnd(-1, 1), 1, 0);
      w.normalize().multiplyScalar(R.rnd(1.5, 4.2) * pw); w.x += R.rnd(-0.5, 0.5); w.y += R.rnd(1.2, 3.6); w.z += R.rnd(0.6, 2.8);
      const c = opts.tint != null && Math.random() < 0.45 ? opts.tint : col, big = mul || 1;
      if (big > 1.2) w.multiplyScalar(0.8);
      T.spawnChip(v, w, sc * R.rnd(0.75, 1.0) * big, c, R.rnd(1.0, 1.9), 1, GROUND_Y);
    }
  }
  tg.alive = false; tg.shootable = false; tg.group.visible = false;
}
// the bomb flower burst with its soot specks landing on the yard (Targets.burst's specks bounce on y = 0)
function bombBurst(p) {
  T.burst(p, 1);
  for (let k = 0; k < 6; k++) T.spawnChip(p, _sv.set(R.rnd(-2.2, 2.2), R.rnd(1, 4), R.rnd(-1, 2)), 0.05, PAL.void, R.rnd(0.8, 1.4), 1, GROUND_Y);
}
function mount(prop, hinge) {
  if (prop.base) prop.base.visible = false;
  if (prop.arm) prop.arm.visible = false;
  prop.group.position.y = PA - FACE_H;
  hinge.add(prop.group);
}
function decoyPick(id) {                                       // a pure function of the spawn id (versus-safe)
  const V = P.DECOY_VARIANTS || ['a'], h = (Math.imul((id | 0) + 1, 2654435761) >>> 0) / 4294967296;
  return V[Math.min(V.length - 1, Math.floor(h * V.length))];
}
const uOf = (x, y, z) => clamp(R.toPx(_hp.set(x, y, z))[0] / R.RW, 0, 1);
class Cell extends T.Target {
  constructor(sp, run) {
    const L = sp.larva, hk = L ? L.hatch : null;
    super(hk === 'bee' ? 'fx' : (sp.bomb && !sp.hidden) || hk === 'bomb' ? 'bomb' : 'target');
    this.sp = sp; this.run = run; const C = this.C = CELLS[sp.cell];
    this.P = {}; this.lastLt = 0; this.deadLt = -1; this.revealLt = -1; this.armLt = -1; this.ext = 0; this.colRev = false; this.announced = false; this.hatched = false;
    this.hinge = new THREE.Group(); this.hinge.position.set(C.x, C.y - PA, ZM + 0.03); this.hinge.rotation.x = -HALF; this.group.add(this.hinge);
    const o = { size: PS };
    if (sp.decoy) o.variant = decoyPick(sp.id);
    if (hk !== 'bee') {
      this.prop = sp.decoy ? P.decoy(o) : this.kind === 'bomb' ? P.bomb(o) : P.paddle(o);
      mount(this.prop, this.hinge); this.prop.register(this); this.cur = this.prop;
      if (sp.decoy) this.prop.floor = -1.6;
      this.prop.group.visible = false;
    }
    if (sp.hidden) {                                    // the bomb behind the plate: built now, out of sight, not a hit part yet
      this.hinge2 = new THREE.Group(); this.hinge2.position.copy(this.hinge.position); this.hinge2.rotation.x = -HALF; this.group.add(this.hinge2);
      this.hb = P.bomb(o); mount(this.hb, this.hinge2); this.pHidden = this.hb.register(this)[0]; this.parts.pop(); this.hinge2.visible = false;
    }
    if (L) {
      const G = larvaGeos();
      this.lg = new THREE.Group(); this.lg.position.set(C.x, C.y, ZM - 0.42); this.group.add(this.lg);
      this.grub = new THREE.Mesh(G.grub, MAT.obj); this.grub.userData.sharedGeo = true; this.grub.raycast = () => {}; this.lg.add(this.grub);
      this.glowMat = new THREE.MeshBasicMaterial({ color: RIPE_COL[0] });
      this.glow = new THREE.Mesh(G.glow, this.glowMat); this.glow.userData.sharedGeo = true; this.glow.raycast = () => {};
      this.glow.position.set(C.x, C.y, ZM - DEPTH + 0.08); this.group.add(this.glow);
      // the wax cap over it (its own material: it thins out to translucent as the larva ripens, #81)
      this.capMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
      this.cap = new THREE.Mesh(G.cap, this.capMat); this.cap.userData.sharedGeo = true; this.cap.raycast = () => {};
      this.cap.position.set(C.x, C.y, CAP_Z); this.group.add(this.cap);
    }
    this.liftZ = 0;                                     // how far whatever stands in the cell sticks out (the big bees climb onto it)
    this.group.visible = false;
  }
  update(lt, run) {
    if (this.revealLt >= 0) return this.updateReveal(lt);
    if (this.armLt >= 0 && this.alive) return this.updateArm(lt);
    const sp = this.sp;
    if (sp.aheadD && this.alive && !this.colRev) {     // a deep-cell member: hidden while the one in front stands
      const fid = sp.id - sp.aheadD, f = run && run.byId ? run.byId(fid) : null;
      this.lastLt = lt; this.group.visible = false; this.shootable = false;
      if (f && f.alive) { this.ext = f.ext || 0; return false; }
      if (!f && !(run && run.taken && run.taken.has(fid))) return true;   // it went in unshot: so do we, unseen
      this.colRev = true;                               // it was shot: I am just standing there now
      this.ext = Math.max(f ? f.ext || 0 : this.ext, lt + (sp.revW || 0.6) - ((sp.at || 0) + sp.swing + sp.stay));
    }
    const Pz = cellPose(sp, lt, this.P, this.ext); this.lastLt = lt;
    this.liftZ = 0;
    if (sp.larva) this.updateLarva(lt, Pz);
    if (!this.alive) { this.liftZ = 0; if (this.deadLt < 0) this.deadLt = lt; return lt - this.deadLt > 0.6 || Pz.done; }
    this.group.visible = Pz.visible;
    if (Pz.phase === 'bee') { this.updateBee(Pz.f); this.shootable = false; return Pz.done; }
    const shown = Pz.phase === 'in' || Pz.phase === 'up' || Pz.phase === 'out';
    if (this.prop) this.prop.group.visible = shown;
    this.hinge.rotation.x = Pz.rx;
    if (sp.larva) { this.hinge.scale.setScalar(Pz.pop); this.hinge.position.y = this.C.y - PA * Pz.pop; }   // bursts out round the cell's middle
    this.shootable = Pz.shootable;
    if (!shown) return Pz.done;
    this.liftZ = this.front() * Math.cos(Pz.rx) * Pz.pop;
    if (sp.decoy) this.prop.wobble(lt);
    if (this.kind === 'bomb') this.prop.sparkle(lt, false);
    if (!this.announced) { this.announced = true; B.SFX.play('targetIn', { u: uOf(this.C.x, this.C.y, ZM) }); }
    return Pz.done;
  }
  // how far the standing item sticks out of the comb (measured once per kind, standing at full size)
  front() {
    if (this.frontZ == null) {
      const key = this.sp.decoy ? 'decoy' : this.kind === 'bomb' ? 'bomb' : 'plate';
      if (FRONT[key] == null) {
        const rx = this.hinge.rotation.x, sc = this.hinge.scale.x, py = this.hinge.position.y;
        this.hinge.rotation.x = 0; this.hinge.scale.setScalar(1); this.hinge.position.y = this.C.y - PA; this.group.updateMatrixWorld(true);
        FRONT[key] = clamp(new THREE.Box3().setFromObject(this.prop.pivot || this.prop.group).max.z - ZM, 0.05, 0.8);
        this.hinge.rotation.x = rx; this.hinge.scale.setScalar(sc); this.hinge.position.y = py; this.group.updateMatrixWorld(true);
      }
      this.frontZ = FRONT[key];
    }
    return this.frontZ;
  }
  // THE LARVA CYCLE (#81). The readable timer is the WAX: the cap starts opaque and turns more and more translucent
  // (material alpha 1 -> 0.34, warming in tint, settling flatter) so the larva shows through, growing and wriggling,
  // the glow behind it stepping warmer; the last half second the cap shakes and spits wax flakes, then the cap and
  // the larva EXPLODE (wax chunks + goo) and the item bursts out standing (cellPose 'in' with pop).
  updateLarva(lt, Pz) {
    const L = this.sp.larva, C = this.C;
    if (Pz.phase === 'larva') {
      const f = Pz.f, left = L.ripen - lt, late = left < 0.5, th = E.inOut(clamp((f - 0.06) / 0.86, 0, 1)), sh = late ? 1 - left / 0.5 : 0;
      this.cap.visible = true;
      this.capMat.opacity = 1 - 0.66 * th;
      this.capMat.color.setRGB(1 + 0.25 * th, 1 + 0.1 * th, 1 - 0.1 * th);
      this.cap.scale.set(1 + 0.04 * sh, 1 + 0.04 * sh, 1 - 0.3 * th + 0.3 * sh);
      this.cap.position.set(C.x + 0.025 * sh * Math.sin(lt * 83), C.y + 0.02 * sh * Math.cos(lt * 97), CAP_Z);
      this.liftZ = CAP_LIFT * (1 - 0.3 * th);
      const s = 0.5 + 0.5 * f, w = Math.sin(lt * (3 + 9 * f * f));
      this.lg.visible = true; this.lg.scale.set(s * (1 + 0.07 * w), s * (1 - 0.07 * w), s);
      this.lg.rotation.z = (0.08 + 0.28 * f * f) * Math.sin(lt * (2.2 + 8 * f * f)) + (late ? 0.14 * Math.sin(lt * 60) : 0);
      this.lg.position.x = C.x + (late ? 0.03 * Math.sin(lt * 71) : 0);
      const ci = Math.min(RIPE_COL.length - 1, Math.floor(f * RIPE_COL.length));
      this.glowMat.color.setHex(late && ((lt * 14) | 0) & 1 ? PAL.lemon : RIPE_COL[ci]);
      this.glow.scale.setScalar(0.75 + 0.25 * f); this.glow.visible = true;
      if (late && this.group.visible && lt - (this.flakeT == null ? -9 : this.flakeT) > 0.1) {   // the cap cracks: wax flakes spit off
        this.flakeT = lt;
        T.spawnChip(_hp.set(C.x + R.rnd(-0.45, 0.45), C.y + R.rnd(-0.4, 0.4), ZM + 0.15), _sv.set(R.rnd(-0.7, 0.7), R.rnd(0.3, 1.3), R.rnd(0.5, 1.5)), R.rnd(0.03, 0.05), Math.random() < 0.5 ? PAL.sand : PAL.tan, 0.6, 1, GROUND_Y);
      }
      return;
    }
    if (!this.hatched) {                                // the hatch: the cap and the larva explode, the larvaHatch pop
      this.hatched = true; this.lg.visible = false; this.cap.visible = false;
      const p = new THREE.Vector3(C.x, C.y, ZM + 0.15);
      for (let k = 0; k < 16; k++) T.spawnChip(p, _sv.set(R.rnd(-2.2, 2.2), R.rnd(0, 3), R.rnd(0.8, 2.6)), R.rnd(0.07, 0.13), PAL[['tan', 'sand', 'chestnut', 'amber'][k % 4]], R.rnd(0.7, 1.2), 1, GROUND_Y);   // wax chunks
      for (let k = 0; k < 24; k++) T.spawnChip(p, _sv.set(R.rnd(-2.6, 2.6), R.rnd(-0.6, 2.6), R.rnd(0.5, 3)), R.rnd(0.06, 0.12), PAL[['bone', 'bone', 'mist', 'lemon'][k % 4]], R.rnd(0.6, 1.0), 1.2, GROUND_Y);   // larva goo
      T.sparks(p, 8, ['lemon', 'bone', 'yellow'], 1.6, 0.04);
      B.SFX.play('larvaHatch', { u: uOf(C.x, C.y, ZM), kind: L.hatch });
    }
    const q = lt - L.ripen, k = clamp(1 - q / 0.45, 0, 1);  // the glow fades out after the hatch
    this.glow.visible = k > 0; this.glowMat.color.setHex(k > 0.6 ? PAL.lemon : k > 0.3 ? PAL.amber : PAL.rust);
  }
  // a hatched bee (a big bee, BEES extra slot) flies out of the cell toward you, then up and off the comb
  updateBee(f) {
    const C = this.C, side = (this.sp.id & 1) ? 1 : -1, at = g => [C.x + side * 3.2 * E.inOut(g), C.y + 0.4 * Math.sin(Math.PI * g) + 6 * g * g];
    if (f >= 1) { BEES.extra.delete(this.id); return; }
    const [x, y] = at(f), [x2, y2] = at(Math.min(1, f + 0.03));
    BEES.extra.set(this.id, { x, y, z: ZM + 0.2 + 2.2 * Math.sin(Math.PI * Math.min(1, f * 1.3)), h: Math.atan2(y2 - y, x2 - x), pitch: 0.35, fly: 1, sc: Math.min(1, 0.4 + f * 3) });
  }
  dispose() { BEES.extra.delete(this.id); if (this.capMat) this.capMat.dispose(); if (this.glowMat) this.glowMat.dispose(); super.dispose(); }
  // decoy build-up: frozen where it was hit, the disguise falls away, the bare bomb swells with a flaring fuse
  updateArm(lt) {
    const q = lt - this.armLt, Pz = cellPose(this.sp, this.armLt, {}, this.ext), k = Math.min(1, q / DECOY_UNMASK);
    this.lastLt = lt; this.shootable = false; this.group.visible = true; this.prop.group.visible = true;
    this.prop.unmask(E.outCubic(k));
    this.hinge.rotation.x = Pz.rx * (1 - k);
    this.prop.pivot.scale.setScalar(1 + 0.16 * E.inCubic(Math.min(1, q / DECOY_ARM)));
    this.prop.sparkle(lt, true); if (this.prop.spark) this.prop.spark.scale.multiplyScalar(1.3 + 1.1 * Math.min(1, q / DECOY_ARM));
    if ((this.autoBoom && q >= DECOY_ARM - 1e-3) || q >= DECOY_ARM + 0.4) this.explode(this.boomPoint);   // (+0.4: a lost deferral)
    return false;
  }
  // Run.applyPenalty hook (stage.js deferred penalty): a decoy arms and returns its bang time; anything else blows now
  arm(point, st) {
    if (!this.sp.decoy || this.revealLt >= 0 || !this.alive) return -1;
    if (this.armLt < 0) {
      this.armLt = st != null ? st - this.sp.t0 : this.lastLt; this.shootable = false; this.boomPoint = point || null;
      this.group.updateMatrixWorld(true);
      if (this.prop.spark) T.sparks(new THREE.Vector3().setFromMatrixPosition(this.prop.spark.matrixWorld), 8, ['lemon', 'yellow', 'orange'], 1.5, 0.035);
      B.SFX.play('bombReveal', { u: uOf(this.C.x, this.C.y, ZM) });
    }
    return +(this.sp.t0 + this.armLt + DECOY_ARM).toFixed(4);
  }
  // the hidden bomb: springs up in the cell where the plate stood, sparks hot for the beat, flips back in
  updateReveal(lt) {
    const q = lt - this.revealLt; this.lastLt = lt; this.group.visible = true; this.liftZ = this.alive ? 0.55 : 0;
    if (!this.alive) { if (this.deadLt < 0) this.deadLt = lt; return lt - this.deadLt > 0.5; }
    const g = Math.min(1, q / HB_GRACE), d = Math.max(0, (q - HB_BEAT) / this.sp.lv);
    this.hinge2.rotation.x = d > 0 ? -HALF * E.inCubic(Math.min(1, d)) : -HALF * (1 - E.outBack(g));
    this.shootable = q >= HB_GRACE && d < 0.7;
    this.hb.sparkle(lt, true); this.hb.spark.scale.multiplyScalar(1.45);
    return d >= 1;
  }
  reveal() {
    this.revealLt = this.lastLt; this.alive = true; this.kind = 'bomb'; this.shootable = false; this.deadLt = -1;
    this.parts = [this.pHidden]; this.hinge2.visible = true; this.hb.show(); this.cur = this.hb;
    this.group.visible = true; this.group.updateMatrixWorld(true);
    T.sparks(new THREE.Vector3(this.C.x, this.C.y + 0.5, ZM + 0.4), 7, ['lemon', 'yellow', 'orange'], 1.4, 0.035);
    B.SFX.play('bombReveal', { u: uOf(this.C.x, this.C.y, ZM) });
  }
  shatter(point, opts) {
    if (this.revealLt >= 0 && !this.boom) return;      // a late hit confirmation for the plate (versus): the bomb stays
    chipShatter(this, point, opts);
    this.group.visible = true; if (this.cur) this.cur.hide();
    this.deadLt = this.lastLt;
    if (this.hb && this.revealLt < 0) this.reveal();   // a hidden bomb: the plate broke, the bomb is standing there
  }
  explode(point) {
    if (this.sp.decoy && this.revealLt < 0 && this.alive) {   // a decoy: build up first, then the bang
      if (this.armLt < 0) this.arm(point, null);
      if (this.lastLt - this.armLt < DECOY_ARM - 1e-3) { this.autoBoom = true; if (point) this.boomPoint = point; return; }
    }
    if (this.hb && this.revealLt < 0) this.shatter(point);    // (versus: the rival shot the revealed bomb first) the plate goes too
    this.boom = true;
    const f = this.parts[0].mesh; f.updateMatrixWorld(true);
    const c = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    bombBurst(c);
    this.shatter(point || c, { power: 1.7, max: 60 });
    this.cur.pivot.scale.setScalar(1);
  }
}
// the swarm: one timeline spawn (kind 'fx', t0 0) that owns the big-bee hit test for the run and holds the stage open
// for the FINALE: when the comb is done (stage time sp.last, a pure function of the timeline; or the stage ends first)
// the bees spell B.L.A.M., and the stage ends FIN_HOLD s later (config adds FIN_SLOT s to the clock for it)
class Swarm extends T.Target {
  constructor(sp, run) {
    super('fx'); this.sp = sp; this.run = run; this.shootable = true; this.fin = false;
    if (BEES.run !== run) BEES.reset(run);
    this.proxy = new THREE.Mesh(NOHIT_GEO, NOHIT_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this;
    this.proxy.raycast = beeRaycast; this.group.add(this.proxy);
  }
  meshes() { return [this.proxy]; }
  update(lt, run) {
    this.run = run;
    if (!this.fin && (this.sp.t0 + lt >= this.sp.last || run.state === 'end')) { this.fin = true; BEES.startFinale(); }
    return this.sp.t0 + lt >= this.sp.last + FIN_HOLD;
  }
  dispose() { super.dispose(); BEES.hopBias = 0; }
}
// a scheduled frenzy (SWARM variant): the bees go wild for 2 s on their own (cosmetic)
class FrenzyFx extends T.Target {
  constructor(sp) { super('fx'); this.sp = sp; this.done = false; }
  meshes() { return []; }
  update(lt) { if (!this.done && lt >= 0) { this.done = true; BEES.frenzy(0.5); } return true; }
}
function makeTarget(sp, run) {
  if (sp.kind === 'swarm') return new Swarm(sp, run);
  if (sp.kind === 'frenzy') return new FrenzyFx(sp, run);
  return new Cell(sp, run);
}

// =========================================================================================
// The dials per tier (DESIGN-STAGES.md section 5, the range's numbers where they carry over; variant 0):
// time | win = POP WINDOW (s fully up) | swing / lv = flip in / flip back s | live = items up at once (singles) |
// gap / burst / bgap / pause = the beat stream | hop = AIM TRAVEL (share of the comb's diagonal, ~240 game px) from the
// last plate you were made to aim at, alt = weight on alternating side and height, adj = keep-off radius round items
// up | decep = chance a single is a bomb, kinds [plain, hidden, decoy], bombCap | trick = chance a beat is a pattern,
// beat (row / column), snake, pp (ping-pong) s between pops, wall = THE WALL's stay, col4 = chance a later deep cell
// hides a decoy 4th | larva = chance a beat also lays a larva, ripen = its base timer s (x0.65-1.35 per larva), hatch = [bee, target, bomb]
// weights, maxL = larvae ripening at once | spare = misses the clear must survive (the solver's margin) | share =
// quota share of the real targets | rel = the reach-for-reload the pacing allows on the magazine variants (s) |
// cols = live comb columns (Beginner: the middle five) | bees = tiny bees (big ones: config)
// =========================================================================================
const TIER_P = [
  { time: 45, win: 1.3,  swing: 0.5,  lv: 0.32, live: 4, gap: [0.5, 0.95], burst: 0.25, bgap: [0.3, 0.45], pause: [0.6, 1.0],
    hop: [0.12, 0.38], alt: 0.25, adj: 0.12, decep: 0.18, kinds: [0.45, 0.2, 0.35], bombCap: 0.2,
    trick: 0.15, beat: 0.62, snake: 0.7, pp: 0.75, wall: 1.7, col4: 0.45, larva: 0.16, ripen: 3.6, hatch: [0.3, 0.55, 0.15], maxL: 3,
    spare: 8, share: 0.55, rel: 0.75, cols: [1, 5], bees: 6 },
  { time: 40, win: 1.0,  swing: 0.4,  lv: 0.28, live: 3, gap: [0.55, 0.95], burst: 0.28, bgap: [0.28, 0.4], pause: [0.75, 1.2],
    hop: [0.3, 0.55], alt: 0.45, adj: 0.15, decep: 0.25, kinds: [0.4, 0.22, 0.38], bombCap: 0.27,
    trick: 0.18, beat: 0.5, snake: 0.55, pp: 0.6, wall: 1.35, col4: 0.55, larva: 0.18, ripen: 3.1, hatch: [0.3, 0.5, 0.2], maxL: 3,
    spare: 5, share: 0.6, rel: 0.7, cols: [0, 6], bees: 7 },
  { time: 36, win: 0.7,  swing: 0.3,  lv: 0.24, live: 3, gap: [0.5, 0.9], burst: 0.32, bgap: [0.25, 0.35], pause: [0.9, 1.4],
    hop: [0.45, 0.75], alt: 0.65, adj: 0.17, decep: 0.32, kinds: [0.35, 0.23, 0.42], bombCap: 0.33,
    trick: 0.21, beat: 0.4, snake: 0.42, pp: 0.48, wall: 1.05, col4: 0.65, larva: 0.2, ripen: 2.6, hatch: [0.28, 0.46, 0.26], maxL: 3,
    spare: 3, share: 0.64, rel: 0.62, cols: [0, 6], bees: 7 },
  { time: 32, win: 0.45, swing: 0.22, lv: 0.2,  live: 2, gap: [0.45, 0.8], burst: 0.35, bgap: [0.22, 0.3], pause: [1.0, 1.5],
    hop: [0.6, 1.0], alt: 0.85, adj: 0.2, decep: 0.38, kinds: [0.3, 0.24, 0.46], bombCap: 0.38,
    trick: 0.24, beat: 0.32, snake: 0.34, pp: 0.4, wall: 0.85, col4: 0.75, larva: 0.22, ripen: 2.2, hatch: [0.25, 0.45, 0.3], maxL: 3,
    spare: 2, share: 0.68, rel: 0.55, cols: [0, 6], bees: 8 }
];
const VARIANT_NAMES = ['HONEYCOMB', 'ROYAL JELLY', 'SWARM'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.win = +(b.win * (1 - 0.05 * v)).toFixed(3);
  c.decep = +(b.decep + 0.02 * v).toFixed(3); c.trick = +(b.trick + 0.02 * v).toFixed(3);
  c.share = Math.min(0.9, b.share + 0.02 * v - (v ? 0.05 : 0));   // the magazine variants pay for the reach to reload
  if (v === 1) { c.larva = +(b.larva * 1.9).toFixed(3); c.maxL = b.maxL + 1; c.hatch = [b.hatch[0] * 0.8, b.hatch[1] * 1.15, b.hatch[2]]; }
  c.bees = v === 2 ? 11 + (tier >= 2 ? 1 : 0) : v === 1 ? b.bees + 1 : b.bees;   // tiny bees (looks only)
  c.big = [[30, 34, 38, 42], [34, 38, 42, 46], [50, 54, 58, 60]][v][tier];   // big bees (the ones a shot can find)
  c.time = b.time + FIN_SLOT; c.finSlot = FIN_SLOT;   // the director fills b.time; the last FIN_SLOT s are the bees' B.L.A.M. finale
  c.frenzy = v === 2 ? [7, 11] : null;                // SWARM: a frenzy now and then on its own, besides the shot bees
  c.fast = v === 2 ? 0.25 : 0;                        // SWARM bees are busier
  c.slack = c.spare; c.quota = 8;                     // placeholder: timeline() derives the real quota
  c.autoReload = false; c.decoy = true; c.hiddenBomb = true; c.patterns = true; c.larvae = true;   // every mechanic at every tier
  c.ammo = ['unlimited', { mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: false }][v];
  c.tier = tier; c.variant = v; c.title = 'BEE HIVE'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
// the director's distance: plain sqrt (exactly rounded in every JIT tier; Math.hypot's last bit is not specified)
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
const isItem = s => s.kind === 'cell';
const isReq = s => isItem(s) && (!s.bomb || !!s.hidden) && !(s.larva && s.larva.hatch !== 'target');   // a shot a perfect player spends
const isReal = s => isItem(s) && !s.bomb && !(s.larva && s.larva.hatch !== 'target');                 // counts toward the quota's base

// ---------- timeline: the DIRECTOR (the range's, on the comb). Every spawn from the seeded rng only. ----------
// Beats: a single, a burst of 2-3 singles, or a pattern, with anticipation pauses; a beat may also lay a LARVA in a free
// cell (announced: it ripens for `ripen` x0.65-1.35 s in plain sight, runs alongside the stream; it prefers a cell whose
// last item was a hatch, so the bees re-cap it and the cycle starts over there; a hatched bomb may be a decoy). Rules:
//  - AIM TRAVEL: a single takes the free cell whose screen point is closest to the wanted hop from the last plate the
//    player was made to aim at, preferring the other side / height (alt), never next to an item already up (adj).
//  - FAIR BOMBS: bombs <= bombCap share; never two plain bombs in a row, never three bombs in a row; a single bomb only
//    while bombs up <= real items up. A larva's bomb counts toward the cap.
//  - PATTERNS take the comb to themselves (they start when it is clear; a deep cell only until its front goes in).
//  - RELOAD-AWARE (magazine variants), a pass after the layout: the required shots in ready order, a perfect player's
//    shot times; the shot after a full magazine waits `rel`, and that item stays up >= rel + 0.45 s past the reach
//    (its stay / reveal window is extended; every cell is booked `rel + 0.8` s longer on these variants for room).
// Spawn fields: id, t0, t1, kind 'cell', cell (CELLS index), swing, stay, lv, ra (ready, relative to at), readyAt, at
// (item start: 0, or ripen + HATCH_GAP for a larva), bomb (+ hidden / decoy), larva { ripen, hatch 'bee' | 'target' |
// 'bomb' }, pat (pattern index), patKind 'R' row | 'V' column | 'S' snake | 'P' ping-pong | 'C' deep cell | 'X' the wall,
// pi, trick; deep cell: aheadD (id distance to the one in front), col (place behind), revW; larva: cap / capF (the wax
// cap's stage time, -99 = from the start, and how long it takes to form). Plus one 'swarm' spawn (t0 0: the bee hit test,
// bees (tiny), big, last = the comb is done and the finale starts, t1 = last + FIN_HOLD) and, on SWARM, 'frenzy' spawns.
function timeline(c, rng) {
  const out = [], occ = [], TIME = c.time - (c.finSlot || 0), tier = c.tier | 0, lastIn = {};
  rng(); rng(); rng();                               // (mulberry32's first draws barely mix nearby seeds)
  const live = CELLS.filter(q => q.c >= c.cols[0] && q.c <= c.cols[1]);
  const xs = live.map(q => q.s[0]), ys = live.map(q => q.s[1]);
  const CD = hyp(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), CX = (Math.max(...xs) + Math.min(...xs)) / 2, CY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0, MARG = magN ? c.rel + 0.8 : 0;
  const ra = +(c.swing * 0.15).toFixed(3);
  let bombs = 0, lastAim = null, xUntil = 0, nTrick = 0, lastTrick = '', nLarva = 0;
  const count = {}, used = k => count[k] || 0;
  // ---- occupancy: per cell, booked [a, b]; up (shown) [ua, ub]
  const upAt = t => occ.filter(o => !o.ghost && o.ua <= t && o.ub > t);
  const clearAt = t => { let e = Math.max(t, xUntil); for (const o of occ) if (o.ub > t && !o.ghost) e = Math.max(e, o.ub + 0.2); return e; };
  const busy = (cell, a, b) => occ.some(o => o.cell === cell && o.a < b + 0.15 && o.b + 0.15 > a);
  const ripening = t => occ.filter(o => o.larva && o.a <= t && o.ua > t).length;
  function mk(t, cell, o = {}) {
    const sp = { id: 0, t0: +t.toFixed(3), t1: 0, kind: 'cell', cell, swing: c.swing, lv: c.lv, stay: +(o.stay != null ? o.stay : c.win).toFixed(3), ra, at: 0, readyAt: ra, bomb: false };
    return sp;
  }
  const fin = sp => { sp.readyAt = +((sp.at || 0) + sp.ra).toFixed(3); sp.t1 = +(sp.t0 + lifeOf(sp)).toFixed(3); return sp; };
  // the aim rule: best free cell at t for a spawn of this life (null: none)
  function slot(t, life, o = {}) {
    const D = o.D, cands = [];
    for (const C of live) {
      if (o.not && o.not.includes(C.i)) continue;
      if (busy(C.i, t, t + life + MARG)) continue;
      if (t + life > TIME - 0.2) continue;
      const p = C.s; let s = 0;
      if (lastAim && D != null) {
        s = Math.abs(hyp(p[0] - lastAim[0], p[1] - lastAim[1]) - D) / CD;
        if ((p[0] < CX) === (lastAim[0] < CX)) s += 0.35 * c.alt;
        if ((p[1] < CY) === (lastAim[1] < CY)) s += 0.2 * c.alt;
      }
      if (o.pref && o.pref.has(C.i)) s -= 0.45;
      const ua = t + (o.at || 0);
      for (const q of occ) if (!q.ghost && q.ua <= ua + 0.3 && q.ub > ua) { const Q = CELLS[q.cell].s; if (hyp(p[0] - Q[0], p[1] - Q[1]) < c.adj * CD + 2 * CELL_PX) s += 2; }
      cands.push([s, C]);
    }
    if (!cands.length) return null;
    for (const cd of cands) cd[0] += rng() * 0.1;
    cands.sort((x, y) => x[0] - y[0]);
    return cands[0][1];
  }
  function commit(sp, ghost) {
    out.push(sp);
    occ.push({ a: sp.t0, b: sp.t1 + MARG + (sp.hidden ? HB_BEAT + sp.lv : 0), ua: sp.t0 + (sp.at || 0), ub: sp.t1 + (sp.hidden ? HB_BEAT + sp.lv : 0), cell: sp.cell,
      bomb: !!sp.bomb && !sp.hidden || (sp.larva && sp.larva.hatch === 'bomb'), ghost: !!ghost, larva: !!sp.larva });
    if (sp.bomb || (sp.larva && sp.larva.hatch === 'bomb')) bombs++;
    if (!lastIn[sp.cell] || sp.t1 >= lastIn[sp.cell].t1) lastIn[sp.cell] = sp;
  }
  const aimed = sp => { lastAim = CELLS[sp.cell].s; };
  const trailing = () => { let n = 0; for (let i = out.length - 1; i >= 0 && out[i].bomb && !out[i].hidden; i--) n++; return n; };
  const lastPlain = () => { const s = out[out.length - 1]; return !!s && s.bomb && !s.hidden && !s.decoy; };
  const items = () => out.length;
  // ---- one single at t; returns its end or -1
  function single(t) {
    const roll = rng(), tyR = rng();
    const up = upAt(t), goodUp = up.filter(o => !o.bomb && o.ub > t + 0.6).length, bombsUp = up.filter(o => o.bomb).length;
    let kind = null;
    if (items() > 1 && roll < c.decep && trailing() < 2 && bombs + 1 <= c.bombCap * (items() + 1) + 0.5 && bombsUp <= goodUp) {
      let ty = pickW(c.kinds, tyR); if (ty === 0 && lastPlain()) ty = 2;
      kind = ['plain', 'hidden', 'decoy'][ty];
    }
    const sp0 = mk(t, 0); const life = lifeOf(sp0) + (kind === 'hidden' ? HB_BEAT + c.lv : 0);
    const C = slot(t, life, { D: rng.range(c.hop[0], c.hop[1]) * CD });
    if (!C) return -1;
    const sp = mk(t, C.i);
    if (kind) { sp.bomb = true; if (kind === 'hidden') sp.hidden = true; else if (kind === 'decoy') sp.decoy = true; }
    fin(sp); commit(sp);
    if (!kind || kind === 'hidden') aimed(sp);
    count.single = used('single') + 1;
    return sp.t1;
  }
  // ---- a larva at t: ripens in plain sight, then hatches; returns true if laid
  function larva(t) {
    if (ripening(t) >= c.maxL) return false;
    const ripen = +(c.ripen * rng.range(0.65, 1.35)).toFixed(3), hatch = ['bee', 'target', 'bomb'][pickW(c.hatch, rng())];
    const at = +(ripen + HATCH_GAP).toFixed(3);
    const stay = hatch === 'bomb' ? Math.max(0.6, c.win * 1.2) : Math.max(c.win, 0.5);
    const sp = mk(t, 0, { stay }); sp.at = at; sp.larva = { ripen, hatch };
    if (hatch === 'bomb' && bombs + 1 > c.bombCap * (items() + 1) + 1) sp.larva.hatch = 'bee';
    const brood = new Set(Object.values(lastIn).filter(s => s.larva).map(s => s.cell));   // a hatched cell's re-cap: the cycle starts over there
    const C = slot(t, lifeOf(sp), { D: rng.range(c.hop[0], c.hop[1]) * CD, at, pref: brood });
    if (!C) return false;
    sp.cell = C.i; fin(sp);
    if (sp.larva.hatch === 'bomb' && hash1(Math.round(t * 1000) * 7 + C.i * 131) < c.kinds[2]) sp.decoy = true;   // a hatched bomb may wear a decoy disguise
    if (sp.t1 > TIME - 0.2) return false;
    commit(sp); nLarva++; count.larva = nLarva; count['larva_' + sp.larva.hatch] = used('larva_' + sp.larva.hatch) + 1;
    return true;
  }
  // ---- PATTERNS: build members, then finish() checks room, commits and books the comb
  function finish(mem, kind, sub, hold) {
    for (const s of mem) fin(s);
    if (mem.some(s => s.col)) { const base = lifeOf(mem[0]); let ext = 0; mem.forEach((s, j) => { if (j) ext += s.revW + 0.7 * c.lv; s.t1 = +(s.t0 + base + ext).toFixed(3); }); }
    let end = 0; for (const s of mem) end = Math.max(end, s.t1);
    if (end > TIME - 0.2) return 0;
    const seen = new Map();
    for (const s of mem) {
      if (s.col) continue;
      if (busy(s.cell, s.t0, (s.patKind === 'C' || mem[1] && mem[1].col ? end : s.t1) + MARG)) return 0;
      const pr = seen.get(s.cell); if (pr && pr > s.t0 - 0.15) return 0; seen.set(s.cell, s.t1 + MARG);
    }
    const pi = nTrick++;
    mem.forEach((s, j) => { s.pat = pi; s.patKind = kind; s.pi = j; if (sub) s.trick = sub; commit(s, !!s.col); });
    for (const s of mem.filter(isReq).sort((a, b) => a.t0 - b.t0 || (a.col || 0) - (b.col || 0))) aimed(s);
    const book = hold != null ? hold : end;
    xUntil = Math.max(xUntil, book);
    count[kind] = used(kind) + 1; lastTrick = kind; count[kind + ':' + sub] = used(kind + ':' + sub) + 1;
    return book;
  }
  // ROW on a beat: 3-5 neighbouring columns along one comb row, popping across every `beat` s. The first row of a round
  // teaches the rhythm clean; later: clean, a DECOY on the beat, or OFF BEAT (the 4th comes early or late)
  function row(t) {
    const cols = c.cols[1] - c.cols[0] + 1, N = Math.min(cols, rng.int(3, 5)), r = rng.int(0, ROWS - 1), dir = rng() < 0.5 ? 1 : -1;
    const c0 = c.cols[0] + rng.int(0, cols - N), sr = rng(), sub = !used('R') ? 'beat' : sr < 0.2 ? 'beat' : sr < 0.6 ? 'decoy' : 'off';
    const beat = c.beat, stay = Math.max(c.win, beat * 1.2), dm = sub === 'decoy' ? rng.int(2, N - 1) : -1, early = rng() < 0.5;
    const mem = []; let tt = t;
    for (let i = 0; i < N; i++) {
      const cc = dir > 0 ? c0 + i : c0 + N - 1 - i;
      if (i && sub === 'off' && i === 3) tt += early ? beat * 0.45 : beat * 1.9; else if (i) tt += beat;
      const s = mk(tt, cellAt(cc, r).i, { stay });
      if (i === dm) { s.bomb = true; s.decoy = true; }
      mem.push(s);
    }
    return finish(mem, 'R', sub === 'off' && N < 4 ? 'beat' : sub);
  }
  // COLUMN: up one comb column, bottom to top, on the beat; the top one sometimes a decoy / a bomb
  function column(t) {
    const cc = rng.int(c.cols[0], c.cols[1]), N = rng.int(3, 4), r0 = rng.int(0, ROWS - N), beat = c.beat * 1.05, stay = Math.max(c.win, beat * 1.2);
    const mem = [];
    for (let i = 0; i < N; i++) mem.push(mk(t + i * beat, cellAt(cc, r0 + i).i, { stay }));
    const last = mem[N - 1], rr = rng();
    if (used('V') && rr < 0.3 + 0.08 * tier) { last.bomb = true; if (rng() < 0.6) last.decoy = true; }
    return finish(mem, 'V', last.bomb ? (last.decoy ? 'decoy' : 'bomb') : 'clean');
  }
  // SNAKE: a chain through neighbouring cells (no cell twice), one pop every `snake` s; the last sometimes a bomb / decoy
  function snake(t) {
    const L = rng.int(5, 7) + (tier >= 3 ? 1 : 0), dt = c.snake, stay = Math.max(0.3, Math.min(c.win, 2.6 * dt - c.swing - c.lv));   // ~2-3 lit at once
    const ok = q => q.c >= c.cols[0] && q.c <= c.cols[1];
    let cur = live[rng.int(0, live.length - 1)], dx = 0, dy = 0; const path = [cur.i];
    for (let k = 1; k < L; k++) {
      const nb = cur.nb.map(i => CELLS[i]).filter(q => ok(q) && !path.includes(q.i));
      if (!nb.length) break;
      // keep going the same way (+ noise). The noise is drawn per cell BEFORE the sort: a comparator that draws from the
      // rng gets called a different number of times as V8 warms up, so the same seed gave other timelines (versus!)
      const key = nb.map(q => (q.x - cur.x) * dx + (q.y - cur.y) * dy + (rng() - 0.5) * 2);
      const nx = nb[key.indexOf(Math.max(...key))]; dx = nx.x - cur.x; dy = nx.y - cur.y; cur = nx; path.push(cur.i);
    }
    if (path.length < 4) return 0;
    const mem = path.map((ci, i) => mk(t + i * dt, ci, { stay }));
    const last = mem[mem.length - 1];
    if (rng() < 0.3 + 0.08 * tier) { last.bomb = true; if (rng() < 0.6) last.decoy = true; }
    return finish(mem, 'S', last.bomb ? (last.decoy ? '+decoy' : '+bomb') : 'clean');
  }
  // PING-PONG: two neighbouring cells, left-right-left-right, then a bomb takes the next slot on the beat
  function pingpong(t) {
    const a = live[rng.int(0, live.length - 1)], nbs = a.nb.filter(i => live.includes(CELLS[i]) && Math.abs(CELLS[i].y - a.y) < A * 1.2);
    if (!nbs.length) return 0;
    const b = CELLS[nbs[rng.int(0, nbs.length - 1)]], N = rng.int(4, 6), dt = c.pp, stay = Math.max(0.2, 2 * dt - 0.06 - c.swing - c.lv), mem = [];
    for (let i = 0; i <= N; i++) {
      const s = mk(t + i * dt, (i & 1 ? b : a).i, { stay });
      if (i === N) { s.bomb = true; if (rng() < 0.2 + 0.07 * tier) s.decoy = true; }
      mem.push(s);
    }
    return finish(mem, 'P', mem[N].decoy ? 'decoy' : 'bomb');
  }
  // DEEP CELL (#71 on the comb): 4-5 plates in ONE cell, the ones behind invisible; shoot the front and the next is just
  // standing there. First of a round: a clean 4; later: clean 4-5, or (col4) a 4th that is a decoy
  function deep(t) {
    const dec = used('C') > 0 && rng() < c.col4, N = dec ? 4 : used('C') ? (rng() < 0.5 ? 4 : 5) : 4, revW = +Math.max(0.5, c.win).toFixed(3);
    const f0 = mk(t, 0, { stay: c.win * 1.15 }), extra = N * (revW + c.lv);
    const C = slot(t, lifeOf(f0) + extra, { D: rng.range(c.hop[0], c.hop[1]) * CD });
    if (!C) return 0;
    const f = mk(t, C.i, { stay: c.win * 1.15 }), mem = [f];
    for (let j = 1; j < N; j++) { const s = Object.assign({}, f); s.col = j; s.revW = revW; s._ahead = mem[j - 1]; if (dec && j === 3) { s.bomb = true; s.decoy = true; } mem.push(s); }
    return finish(mem, 'C', dec ? 'decoy4' : 'clean' + N, f.t0 + lifeOf(f) + 0.25);   // the comb is booked until the front goes in
  }
  // THE WALL: 6-8 cells at once, a couple of decoys; pick fast
  function wall(t) {
    const n = rng.int(6, 8), pool = live.slice(), mem = [];
    for (let i = 0; i < n && pool.length; i++) { const C = pool.splice(rng.int(0, pool.length - 1), 1)[0]; mem.push(mk(t + 0.04 * i, C.i, { stay: c.wall })); }
    const nd = 1 + (rng() < 0.25 + 0.2 * tier ? 1 : 0) + (tier >= 3 && rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < nd; i++) { const fr = mem.filter(s => !s.bomb); const s = fr[rng.int(0, fr.length - 1)]; s.bomb = true; s.decoy = true; }
    return finish(mem, 'X', nd + ' decoys');
  }
  const TRICKS = { R: row, V: column, S: snake, P: pingpong, C: deep, X: wall };
  const TW = { R: 1.5, V: 1.1, S: 1.0, P: 0.8, C: 1.4, X: 0.4 }, CAP = { X: tier < 2 ? 1 : 2 };
  const pause = () => rng.range(c.pause[0], c.pause[1]);
  // ---- the loop
  let t = 0.6, guard = 0;
  while (guard++ < 900 && t < TIME - 0.6) {
    if (t < xUntil) { t = xUntil; continue; }
    const larvaR = rng();
    if (items() >= 1 && larvaR < c.larva && t < TIME - c.ripen - 2) larva(t);
    const up = upAt(t);
    if (up.length >= c.live) { t = up.map(o => o.ub).sort((a, b) => a - b)[up.length - c.live] + 0.05; continue; }
    const trR = rng(), burR = rng();
    if (items() >= 2 && trR < c.trick && t < TIME - 3) {
      const s = clearAt(t), W = Object.assign({}, TW);
      if (lastTrick) W[lastTrick] *= 0.15;
      for (const k in CAP) if (used(k) >= CAP[k]) W[k] = 0;
      let e = 0;
      for (let tries = 0; !e && tries < 3; tries++) {
        const keys = Object.keys(W), k = keys[pickW(keys.map(q => W[q]), rng())];
        if (!W[k]) break;
        e = TRICKS[k](s); W[k] = 0;
      }
      if (e) { t = e + pause(); continue; }
    }
    const n = burR < c.burst ? 2 + (rng() < 0.4 ? 1 : 0) : 1;
    let placed = 0;
    for (let i = 0; i < n; i++) { if (single(t) < 0) break; placed++; if (i < n - 1) t += rng.range(c.bgap[0], c.bgap[1]); }
    if (!placed) { const u = upAt(t); t = u.length ? Math.min(...u.map(o => o.ub)) + 0.05 : t + 0.25; continue; }
    t += placed > 1 ? pause() : rng.range(c.gap[0], c.gap[1]);
  }
  // ---- RELOAD-AWARE pass (magazine variants): a perfect player's shots in ready order; the one after a full
  // magazine waits rel and must stay up >= rel + 0.45 past that (extend its stay / reveal window, within the margin)
  let relExt = 0;
  if (magN) {
    const req = out.filter(isReq).sort((a, b) => (a.t0 + a.readyAt) - (b.t0 + b.readyAt) || (a.col || 0) - (b.col || 0));
    let prev = -9, prevP = null;
    req.forEach((s, k) => {
      const P = CELLS[s.cell].s, aim = 0.06 + 0.32 * (prevP ? hyp(P[0] - prevP[0], P[1] - prevP[1]) : 0) / 489; prevP = P;
      const rdy = s.col ? prev + 0.05 : s.t0 + s.readyAt + 0.22, boundary = k > 0 && k % magN === 0;
      const shot = (boundary ? Math.max(rdy, prev + c.rel) : Math.max(rdy, prev + 0.2)) + aim;
      if (boundary) {
        const end = s.col ? prev + (s.revW || 0) : s.t0 + (s.at || 0) + s.swing + s.stay + 0.7 * s.lv;
        const need = Math.min(MARG - 0.05, (shot - aim + 0.45) - end + 0.001);
        if (need > 0) { if (s.col) s.revW = +(s.revW + need).toFixed(3); else { s.stay = +(s.stay + need).toFixed(3); fin(s); } relExt++; }
      }
      prev = shot;
    });
    // deep cells: re-derive the members' latest end from the (maybe longer) reveal windows
    const byPat = new Map(); for (const s of out) if (s.patKind === 'C') { if (!byPat.has(s.pat)) byPat.set(s.pat, []); byPat.get(s.pat).push(s); }
    for (const mem of byPat.values()) { mem.sort((a, b) => (a.col || 0) - (b.col || 0)); const base = lifeOf(mem[0]); let ext = 0; mem.forEach((s, j) => { if (j) ext += s.revW + 0.7 * c.lv; s.t1 = +(s.t0 + base + ext).toFixed(3); }); }
  }
  // ---- the swarm, scheduled frenzies, order, ids, relative links
  const last = out.reduce((a, s) => Math.max(a, s.t1), 0);
  out.push({ id: 0, t0: 0, t1: +(last + 0.3 + FIN_HOLD).toFixed(3), kind: 'swarm', last: +(last + 0.3).toFixed(3), bees: c.bees, big: c.big, fast: c.fast || 0 });
  // ---- the WAX CAPS (#81, cosmetic but a pure function of the schedule): a larva's cell is capped from `cap` (stage s; -99 =
  // from the start) and the cap forms over capF s under two worker bees. Right after the cell's previous item if that
  // was a hatch (bees re-cap the empty cell, the cycle starts over), else 2.5-8 s before the larva (hashed). The cell is
  // free in that gap by construction (the director books every cell's items apart)
  for (const L of out) {
    if (!L.larva) continue;
    let prev = null, pe = 0;
    for (const s of out) {
      if (s === L || s.kind !== 'cell' || s.cell !== L.cell || s.t0 >= L.t0) continue;
      const e = s.t1 + (s.hidden ? HB_BEAT + s.lv : 0); if (e <= L.t0 + 1e-3 && e >= pe) { pe = e; prev = s; }
    }
    const lead = 2.5 + 5.5 * hash1(L.cell * 131 + Math.round(L.t0 * 100));
    let a = prev ? (prev.larva ? pe + 0.3 : Math.max(pe + 0.3, L.t0 - lead)) : L.t0 - lead;
    a = Math.min(a, L.t0 - 0.05);
    if (!prev && a < 0.4) { L.cap = -99; L.capF = 0; } else { L.cap = +a.toFixed(3); L.capF = +Math.min(1, L.t0 - a).toFixed(3); }
  }
  if (c.frenzy) for (let ft = rng.range(5, 8); ft < last - 1; ft += rng.range(c.frenzy[0], c.frenzy[1])) out.push({ id: 0, t0: +ft.toFixed(3), t1: +(ft + 0.05).toFixed(3), kind: 'frenzy' });
  out.sort((a, b) => a.t0 - b.t0 || (a.kind === 'swarm' ? -1 : b.kind === 'swarm' ? 1 : 0));
  out.forEach((s, i) => { s.id = i; });
  for (const s of out) if (s._ahead) { s.aheadD = s.id - s._ahead.id; delete s._ahead; }
  const good = out.filter(isReal).length;
  c.goodCount = good; c.bombCount = out.filter(s => (s.bomb && !s.hidden) || (s.larva && s.larva.hatch === 'bomb')).length;
  c.tricks = count; c.larvaCount = nLarva; c.relExt = relExt;
  c.quota = Math.max(4, Math.min(good - c.spare, Math.round(good * c.share)));
  return out;
}
// points: by how early in its stay you hit it (300 / 200 / 150 / 100 by quarters of the shootable window; a deep-cell
// member behind the front 200), a larva's hatched plate +150 on top
function points(sp, lt) {
  if (sp.kind !== 'cell') return 0;
  let base = 200;
  if (!sp.col) { const f = (lt - (sp.at || 0) - sp.ra) / Math.max(0.05, spanOf(sp)); base = f < 0.25 ? 300 : f < 0.5 ? 200 : f < 0.75 ? 150 : 100; }
  return base + (sp.larva ? 150 : 0);
}
// briefing: the ROOM FOR ERROR line is the tip (its own line on both cards); the tier's teaching tip is `hint`
function briefing(c) {
  const TIPS = ['GLOWING CELL = SOMETHING IS HATCHING!', 'HATCHED PLATE = +150!', 'A HATCH CAN BE A BOMB. LOOK FIRST!', 'SHOOT THE FRONT PLATE FIRST!'];
  const spare = Math.max(0, (c.goodCount || c.quota) - c.quota);
  const room = spare <= 0 ? 'NO ROOM FOR ERROR!' : 'ROOM FOR ERROR: ' + spare + (spare === 1 ? ' TARGET' : ' TARGETS');
  return { rule: [['SHOOT ', 'void'], [c.quota + ' TARGETS', 'red'], [' OR MORE!', 'void']], icon: 'cell', unit: 'TARGETS',
    dont: 'bomb', tip: room, room, spare, spareUnit: 'targets', hint: TIPS[clamp(c.tier | 0, 0, 3)] };
}
// briefing card icon: a wax hex cell with a lime plate flipping up out of it (~2r across)
function drawIcon(cx, cy, r, t = 0) {
  const H = B.HUD, k = Math.ceil(r) + 2, a = 0.9 * r, up = ((t * 1.2) % 2) < 1.4 ? 1 : 0;
  H.draw(H.pixImg('hiveCell' + r + up, 2 * k + 1, 2 * k + 1, (x, y) => {
    const px = x - k, py = y - k, hex = (u, v, s) => Math.max(Math.abs(v), 0.866 * Math.abs(u) + 0.5 * Math.abs(v)) / s;
    const h = hex(px, py, a);
    if (h > 1.08) return null; if (h > 1.0) return 'void';
    if (h > 0.84) return py < -0.2 * a ? 'lemon' : py > 0.4 * a ? 'tan' : 'sand';     // the wax rim
    const pa = 0.62 * a, oy = up ? 0.12 * a : 0.5 * a, ph = hex(px, (py - oy) / (up ? 1 : 0.45), pa);   // the plate (squashed while it flips)
    if (ph <= 1.0 && py > -0.62 * a) { if (ph > 0.9) return 'void'; const d = Math.hypot(px, (py - oy) / (up ? 1 : 0.45)) / pa; return d < 0.22 ? 'yellow' : d < 0.4 ? 'void' : d < 0.6 ? 'lime' : d < 0.76 ? 'void' : 'lime'; }
    return h > 0.7 ? 'walnut' : 'umber';
  }), cx - k, cy - k);
}
// the honeycomb hive bed lives in sfx-stage.js (K.stageBeds); hook it into the ambience beds (sfx-music.js owns K.beds)
{ const K = B.SFXKit; if (K && K.beds && K.stageBeds && K.stageBeds.beehive && !K.beds.beehive) K.beds.beehive = K.stageBeds.beehive; }
B.Stage.register({ id: 'beehive', name: 'BEE HIVE', short: 'HIVE', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon,
  pose: cellPose, CELLS, TIER_P, lifeOf, spanOf, isReal, isReq, scr, BEES, ZM });
})(window.BLAM);
