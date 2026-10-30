'use strict';
/* =========================================================================================
   B.L.A.M. stages/beehive.js -- Stage 5: BEE HIVE (DESIGN-STAGES.md section 6, Fable + Jon 2026-10-30).
   A giant honeycomb in a wooden hive frame fills the range (beekeeper's yard at dusk: a hive box, a smoker on a
   post, a "B.L.A.M. APIARY" sign). The comb is a 7 x 4 grid of live CELLS (dark mouths; Beginner uses the middle
   5 columns) inside a ring of honey-filled cells. A cell is a FLIP-IN SLOT: a hex plate / bomb / decoy (BLAM.Props,
   Jon's DECOY_VARIANTS, picked from the spawn id) rotates up out of the cell on its bottom edge, stays, flips back.
   Every range rule carries over (section 5): pop windows per tier, aim travel across the comb, decoys with the
   0.3 s build-up then the bang (stage.js deferred penalty via arm()), hidden bombs behind plates, reload-aware
   pacing on the magazine variants, anticipation pauses, nothing gated by tier.
   LARVAE: a grub curls in a cell and RIPENS on a readable timer (it grows, the cell glows warmer, six rim lights
   come on round the mouth one by one, the last half second it wriggles and the rim blinks), then HATCHES into a
   BEE (flies off), a TARGET plate (+150) or a BOMB; the kind is hidden until the hatch.
   BEES: 6-12 cosmetic bees crawl and hop across the comb (over plates and bombs). They never block a shot. A shot
   that hits a bee and nothing else = no points, no penalty, a 2 s FRENZY (all bees fly faster, loud buzz).
   PATTERNS (the director): ROW on a beat (decoy on the beat / off beat), COLUMN bottom to top, SNAKE through
   neighbouring cells, PING-PONG then a bomb, DEEP CELL (the range's #71 column: plates stacked invisibly in one
   cell, shoot the front and the next is standing there), THE WALL (6-8 cells at once, decoys).
   Everything that decides a spawn is a pure function of (seed, tier, variant) and the stage clock; bees, honey drips
   and smoke are cosmetic (wall clock) and never touch scoring.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets, P = B.Props;
const clamp = E.clamp, HALF = Math.PI / 2;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
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
// THE SET: comb (env), wooden frame, yard (ground, hive box, smoker post, sign), dusk sky (fog-free, env class)
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
const SIGN = { x: -6.95, y: 0.55, z: ZM + 0.42 };
const SMOKER = { x: 7.95, y: 2.15, z: -5.3 };
function buildComb(v, glow) {
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
  // ---- the sign on the left upright: "B.L.A.M." in bold, "APIARY" under it ----
  {
    const { x, y, z } = SIGN, w = 2.9, h = 1.4;
    v.bx(x - w / 2 - 0.06, y - h / 2 - 0.06, z - 0.12, x + w / 2 + 0.06, y + h / 2 + 0.06, z - 0.06, PAL.umber);
    for (let k = 0; k < 3; k++) v.bx(x - w / 2, y - h / 2 + k * h / 3, z - 0.06, x + w / 2, y - h / 2 + (k + 1) * h / 3 - 0.02, z, k & 1 ? PAL.chestnut : PAL.walnut);
    for (const sx of [-1, 1]) v.bx(x + sx * (w / 2 - 0.15) - 0.04, y + h / 2 - 0.2, z, x + sx * (w / 2 - 0.15) + 0.04, y + h / 2 - 0.12, z + 0.01, PAL.steel, null, 16);   // nails
    const t = R.bold('B.L.A.M.'), s = 0.065, x0 = x - t.w * s / 2, yT = y + 0.6;
    const ROWC = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
    const cell = new Set(t.px.map(([px, py]) => px + ',' + py));
    for (let py = -1; py <= 7; py++) for (let px = -1; px <= t.w; px++) {
      const on = cell.has(px + ',' + py);
      let near = false; if (!on) for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (cell.has((px + dx) + ',' + (py + dy))) { near = true; break; }
      if (on || near) v.bx(x0 + px * s, yT - (py + 1) * s, z, x0 + (px + 1) * s, yT - py * s, z + (on ? 0.02 : 0.012), on ? ROWC[py] : PAL.void, null, 16);
    }
    const a = R.small('APIARY'), s2 = 0.085, xa = x - a.w * s2 / 2, ya = y - 0.12;
    for (const [px, py] of a.px) v.bx(xa + px * s2, ya - (py + 1) * s2, z, xa + (px + 1) * s2, ya - py * s2, z + 0.015, PAL.bone, null, 16);
    // a little bee painted beside it
    glow.bx(x + w / 2 - 0.36, y - 0.5, z + 0.01, x + w / 2 - 0.14, y - 0.36, z + 0.02, PAL.yellow);
    glow.bx(x + w / 2 - 0.3, y - 0.5, z + 0.021, x + w / 2 - 0.25, y - 0.36, z + 0.022, PAL.void);
  }
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
  buildComb(comb, glow); buildYard(yard, glow); buildFar(far);
  const combMesh = comb.mesh(MAT.env), yardMesh = yard.mesh(MAT.env); combMesh.userData.env = yardMesh.userData.env = true;
  // one env mesh would do, but the comb's bake is its own: two meshes (2 calls)
  const farMesh = far.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.5, blending: THREE.NoBlending }));
  farMesh.frustumCulled = false;
  const glowMesh = glow.mesh(MAT.glow);
  glowMesh.onBeforeRender = smoke;
  group.add(farMesh, combMesh, yardMesh, glowMesh, buildDrips(), BEES.init());
  group.userData.shootables = [combMesh, yardMesh];
  return group;
}

// =========================================================================================
// BEES (cosmetic): two InstancedMeshes (bodies, wings: 2 draw calls for the whole swarm + hatchlings). Each bee
// walks a precomputed list of legs (crawl / pause on the comb, hop: a short flight in front of it), on its own
// clock: wall time x the ?slow factor x the FRENZY boost. Never part of the timeline, never blocks a shot.
// =========================================================================================
const BEE_MAX = 14, BEE_X = 6, BS = 0.055;                    // swarm bees, hatchling slots, voxel size
const FRENZY_T = 2.0, FRENZY_K = 1.7;                          // frenzy length (s) and extra speed (x1 + 1.7 at full)
const BEES = { n: 7, legs: [], clock: 0, last: 0, f: -1, mesh: null, wings: null, pos: new Float32Array((BEE_MAX + BEE_X) * 3), hit: new Float64Array(BEE_MAX).fill(-99),
  extra: new Map(), passT: -9, hopBias: 0 };
function beeGeo() {
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
function wingGeo() {                                           // origin at the wing root (top of the thorax): scale y flaps it
  const v = new Vox();
  for (const k of [-1, 1]) { v.box(-0.03, 0.06, k * 0.035, 0.1, 0.11, 0.04, PAL.mist); v.box(-0.07, 0.11, k * 0.035, 0.08, 0.06, 0.04, PAL.ice); }
  return v.geo();
}
// legs per bee: { t0, t1, ty 0 pause / 1 crawl / 2 hop, a [x, y], b [x, y], z (hop bulge), arc }
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
const _bm = new THREE.Matrix4(), _wm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _bv = new THREE.Vector3(), _be = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _ws = new THREE.Matrix4();
function beeAt(legs, tau, o) {                                 // pose of one bee at its own time tau -> o { x, y, z, h (heading), fly }
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
BEES.init = function () {
  if (this.mesh) return this.group;
  for (let i = 0; i < BEE_MAX; i++) this.legs.push(beeLegs(i));
  const N = BEE_MAX + BEE_X;
  this.mesh = new THREE.InstancedMesh(beeGeo(), new THREE.MeshLambertMaterial({ vertexColors: true }), N);
  this.wings = new THREE.InstancedMesh(wingGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), N);
  for (const m of [this.mesh, this.wings]) { m.frustumCulled = false; m.userData.sharedGeo = true; m.raycast = () => {}; for (let i = 0; i < N; i++) m.setMatrixAt(i, ZERO); }
  this.mesh.onBeforeRender = () => this.step();
  this.group = new THREE.Group(); this.group.add(this.mesh, this.wings);
  return this.group;
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
const _bo = {};
BEES.step = function () {
  const now = performance.now() / 1000;
  let dt = this.last ? Math.min(0.05, now - this.last) : 0.016; this.last = now;
  dt *= slowK();
  if (this.f >= 0) { this.f += dt; if (this.f >= FRENZY_T) this.f = -1; }
  const k = this.boost(), sp = 1 + FRENZY_K * k + this.hopBias;
  this.clock += dt * sp;
  const M = this.mesh, W = this.wings, play = inPlay();
  for (let i = 0; i < BEE_MAX; i++) {
    if (i >= this.n) { M.setMatrixAt(i, ZERO); W.setMatrixAt(i, ZERO); this.pos[i * 3 + 2] = -99; continue; }
    const tau = this.clock * (0.85 + 0.3 * hash1(i * 3 + 1)) + i * 37.1, o = beeAt(this.legs[i], tau, _bo);
    let x = o.x, y = o.y, z = o.z, h = o.h, spin = 0;
    if (k > 0) { x += 0.06 * k * Math.sin(now * 37 + i); y += 0.06 * k * Math.cos(now * 41 + i * 2); }
    const ht = now - this.hit[i];                                // a shot bee tumbles for half a second
    if (ht < 0.5) { spin = ht * 22; y -= 0.5 * Math.sin(Math.PI * ht / 0.5); z += 0.3; }
    if (play && o.fly && o.hop && o.hop.z > 1.2 && o.leg !== this.lastLeg[i]) {    // a close fly-by: beePass (throttled)
      this.lastLeg[i] = o.leg;
      if (now - this.passT > (k > 0 ? 0.35 : 1.6)) { this.passT = now; B.SFX.play('beePass', { u: clamp(0.5 + x / 16, 0, 1) }); }
    }
    this.draw(i, x, y, z, h, o.fly || k > 0 ? 1 : 0, now, spin, k);
  }
  let j = BEE_MAX;
  for (const e of this.extra.values()) { if (j >= BEE_MAX + BEE_X) break; this.draw(j++, e.x, e.y, e.z, e.h, 1, now, 0, 0); }
  for (; j < BEE_MAX + BEE_X; j++) { M.setMatrixAt(j, ZERO); W.setMatrixAt(j, ZERO); this.pos[j * 3 + 2] = -99; }
  M.instanceMatrix.needsUpdate = true; W.instanceMatrix.needsUpdate = true;
};
BEES.lastLeg = new Int32Array(BEE_MAX).fill(-1);
BEES.draw = function (i, x, y, z, h, fly, now, spin, k) {
  const left = Math.cos(h) < 0, s = 1.35;
  _be.set(spin, 0, left ? h - Math.PI : h); _bq.setFromEuler(_be);
  _bm.compose(_bv.set(x, y, z), _bq, _bs.set(left ? -s : s, s, s));
  this.mesh.setMatrixAt(i, _bm);
  const fr = fly ? ((now * (k > 0 ? 46 : 30) + i * 0.37) | 0) % 3 : 0, fl = [1, 0.25, -0.8][fr];
  _wm.makeTranslation(0, BS * 1.5, 0).premultiply(_bm); _wm.multiply(_ws.makeScale(1, fl, 1));
  this.wings.setMatrixAt(i, _wm);
  this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
};
// the swarm's hit test (Targets.pick calls it with the shot's raycaster). A bee within BEE_PX game px of the ray, with
// NO live cell target on the ray, starts the frenzy. It never reports an intersection, so the engine sees no target:
// a plate or bomb behind a bee is hit as usual, and a shot that only finds a bee is a plain miss for the stats.
const BEE_PX = 5.5, _hp = new THREE.Vector3(), _cp = new THREE.Vector3();
function beeRaycast(rc) {
  const sw = this.userData.target, run = sw && sw.run; if (!run) return;
  let best = -1, bd = 1e9;
  for (let i = 0; i < BEE_MAX + BEE_X; i++) {
    if (this.n === 0 || BEES.pos[i * 3 + 2] < -50) continue;
    _hp.set(BEES.pos[i * 3], BEES.pos[i * 3 + 1], BEES.pos[i * 3 + 2]);
    const d = _hp.distanceTo(rc.ray.origin), perPx = 2 * d * R.TAN_H / R.RH;
    rc.ray.closestPointToPoint(_hp, _cp); const dd = _cp.distanceTo(_hp) / perPx;
    if (dd < BEE_PX && dd < bd) { bd = dd; best = i; }
  }
  if (best < 0) return;
  const ms = [];
  for (const t of run.live) if (t !== sw && t.alive && t.shootable && t.group.visible) for (const m of t.meshes()) if (m.visible) ms.push(m);
  if (ms.length && rc.intersectObjects(ms, false).length) return;   // the target takes the shot
  const i = best, now = performance.now() / 1000;
  if (i < BEE_MAX) BEES.hit[i] = now;
  _hp.set(BEES.pos[i * 3], BEES.pos[i * 3 + 1], BEES.pos[i * 3 + 2]);
  const u = clamp(R.toPx(_hp)[0] / R.RW, 0, 1);
  for (let q = 0; q < 6; q++) T.spawnChip(_hp, _sv.set(R.rnd(-1, 1), R.rnd(0.2, 1.4), R.rnd(0, 1)), 0.04, q & 1 ? PAL.yellow : PAL.void, R.rnd(0.25, 0.45), 0.6, GROUND_Y);
  B.SFX.play('beeHit', { u });
  BEES.frenzy(u);
}

// =========================================================================================
// CELL TARGETS
// =========================================================================================
P.warm();
const HATCH_GAP = 0.1, BEE_OUT = 1.3;                          // larva burst -> item entrance; a hatched bee's fly-out
const HB_GRACE = 0.15, HB_BEAT = 0.6;                          // hidden bomb: spring-up grace, live beat
const DECOY_ARM = 0.3, DECOY_UNMASK = 0.16;                    // the decoy build-up (as the range)
// the pose of a cell's item: a pure function of (spawn, local time, ext = the extra stay a deep-cell member earned)
//   larva (lt < ripen) -> hatch burst -> [bee fly-out | entrance: flips up out of the cell on its bottom edge] ->
//   stay (settling wobble) -> exit (flips back in). rx = the hinge angle (-pi/2 lying in the cell, 0 standing).
function cellPose(sp, lt, o, ext) {
  o = o || {};
  o.rx = -HALF; o.visible = lt >= 0; o.shootable = false; o.done = false; o.phase = 'wait'; o.f = 0;
  if (lt < 0) return o;
  const at = sp.at || 0, Lv = sp.larva;
  if (Lv) {
    if (lt < Lv.ripen) { o.phase = 'larva'; o.f = lt / Lv.ripen; return o; }
    if (lt < at) { o.phase = 'hatch'; return o; }
    if (Lv.hatch === 'bee') { o.phase = 'bee'; o.f = Math.min(1, (lt - at) / BEE_OUT); o.done = lt - at >= BEE_OUT; return o; }
  }
  const q = lt - at, sw = sp.swing, stay = sp.stay + (ext || 0), lv = sp.lv;
  if (q < sw) { o.phase = 'in'; o.rx = -HALF * (1 - E.outBack(q / sw)); o.shootable = q >= sp.ra; return o; }
  if (q < sw + stay) { const tau = q - sw; o.phase = 'up'; o.rx = 0.13 * Math.exp(-5 * tau) * Math.sin(15 * tau); o.shootable = true; return o; }
  const r = q - sw - stay;
  if (r < lv) { o.phase = 'out'; o.rx = -HALF * E.inCubic(r / lv); o.shootable = r / lv < 0.7; return o; }
  o.done = true; o.visible = false; return o;
}
const lifeOf = sp => (sp.at || 0) + (sp.larva && sp.larva.hatch === 'bee' ? BEE_OUT : sp.swing + sp.stay + sp.lv);
const spanOf = sp => sp.swing - sp.ra + sp.stay + 0.7 * sp.lv;   // shootable seconds of the item
// ---------- larva visuals: shared geometries (the grub, the 7 rim-timer states, the glow hex) ----------
let LG = null;
function larvaGeos() {
  if (LG) return LG;
  const list = [], s = 0.064;
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) {      // a curled grub: a thick C, bone with mist segment lines
    const r = Math.hypot(i, j), a = Math.atan2(j, i);
    if (r < 3.2 || r > 6.4 || (a > -0.75 && a < 0.15)) continue;
    const seg = Math.floor((a + Math.PI) / 0.5) & 1, head = a > 0.15 && a < 0.75;
    for (let k = -1; k <= 1; k++) { if (Math.abs(k) === 1 && (r < 3.8 || r > 5.8)) continue; list.push([i, j, k, PAL[head ? 'lemon' : seg ? 'bone' : r > 5.6 ? 'mist' : 'bone']]); }
  }
  list.push([5, 2, 2, PAL.void]);                                    // an eye on the head
  const rim = [];
  for (let n = 0; n <= 6; n++) {                                     // n of the six rim lights on, clockwise from the top
    const v = new Vox();
    for (let k = 0; k < 6; k++) {
      const phi = (90 - 60 * k) * Math.PI / 180, mx = (A - 0.02) * Math.cos(phi), my = (A - 0.02) * Math.sin(phi);
      _m.makeRotationZ(phi - HALF).setPosition(mx, my, 0);
      v.box(0, 0, 0, RC + 0.06, WALL + 0.09, 0.03, PAL.void, _m);                       // a dark ring: this cell has a larva
      v.box(0, 0, 0.02, RC * 0.66, WALL + 0.02, 0.03, k < n ? PAL.lemon : PAL.oxblood, _m);
    }
    rim.push(v.geo());
  }
  const glow = new Vox(); hexFill(glow, 0, 0, AI - 0.02, 0, PAL.bone, 16, 8, 0.01);
  return (LG = { grub: new Vox().vox(list, s, 0, 0, 0).geo(), rim, glow: glow.geo(), bee: beeGeo(), wing: wingGeo() });
}
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
      this.rim = new THREE.Mesh(G.rim[0], MAT.glow); this.rim.userData.sharedGeo = true; this.rim.raycast = () => {};
      this.rim.position.set(C.x, C.y, ZM + 0.02); this.group.add(this.rim);
      if (hk === 'bee') {
        this.bee = new THREE.Group(); this.bee.visible = false; this.group.add(this.bee);
        const b = new THREE.Mesh(G.bee, MAT.obj), w = new THREE.Mesh(G.wing, MAT.glow); b.userData.sharedGeo = w.userData.sharedGeo = true; b.raycast = w.raycast = () => {};
        w.position.y = BS * 1.5; this.bee.add(b, w); this.beeW = w; this.bee.scale.setScalar(1.35);
      }
    }
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
    if (sp.larva) this.updateLarva(lt, Pz);
    if (!this.alive) { if (this.deadLt < 0) this.deadLt = lt; return lt - this.deadLt > 0.6 || Pz.done; }
    this.group.visible = Pz.visible;
    if (Pz.phase === 'bee') { this.updateBee(Pz.f); this.shootable = false; return Pz.done; }
    const shown = Pz.phase === 'in' || Pz.phase === 'up' || Pz.phase === 'out';
    if (this.prop) this.prop.group.visible = shown;
    this.hinge.rotation.x = Pz.rx;
    this.shootable = Pz.shootable;
    if (!shown) return Pz.done;
    if (sp.decoy) this.prop.wobble(lt);
    if (this.kind === 'bomb') this.prop.sparkle(lt, false);
    if (!this.announced) { this.announced = true; B.SFX.play('targetIn', { u: uOf(this.C.x, this.C.y, ZM) }); }
    return Pz.done;
  }
  // the larva: grows, the cell glows warmer, the rim timer fills; the last 0.5 s it wriggles and the rim blinks; hatch burst
  updateLarva(lt, Pz) {
    const L = this.sp.larva;
    if (Pz.phase === 'larva') {
      const f = Pz.f, left = L.ripen - lt, late = left < 0.5;
      this.grub.visible = true; this.lg.visible = true;
      this.lg.scale.setScalar(0.42 + 0.58 * f);
      this.lg.rotation.z = (0.1 + 0.25 * f * f) * Math.sin(lt * (2.5 + 12 * f * f)) + (late ? 0.12 * Math.sin(lt * 60) : 0);
      this.lg.position.x = this.C.x + (late ? 0.03 * Math.sin(lt * 71) : 0);
      const ci = Math.min(RIPE_COL.length - 1, Math.floor(f * RIPE_COL.length));
      this.glowMat.color.setHex(late && ((lt * 14) | 0) & 1 ? PAL.lemon : RIPE_COL[ci]);
      this.glow.scale.setScalar(0.75 + 0.25 * f);
      const n = late ? (((lt * 10) | 0) & 1 ? 6 : 0) : Math.min(6, Math.floor(f * 6 + 1e-6));
      this.rim.geometry = larvaGeos().rim[n]; this.rim.visible = true;
      this.glow.visible = true;
      return;
    }
    if (!this.hatched) {                                // the hatch: wax and skin burst out, the larvaHatch pop
      this.hatched = true; this.lg.visible = false;
      const p = new THREE.Vector3(this.C.x, this.C.y, ZM + 0.1);
      for (let k = 0; k < 12; k++) T.spawnChip(p, _sv.set(R.rnd(-1.6, 1.6), R.rnd(0.4, 2.6), R.rnd(0.4, 2)), R.rnd(0.05, 0.09), PAL[['bone', 'mist', 'lemon', 'sand'][k % 4]], R.rnd(0.5, 0.9), 1, GROUND_Y);
      B.SFX.play('larvaHatch', { u: uOf(this.C.x, this.C.y, ZM), kind: L.hatch });
    }
    const q = lt - L.ripen, k = clamp(1 - q / 0.45, 0, 1);  // the glow fades out after the hatch
    this.glow.visible = k > 0; this.glowMat.color.setHex(k > 0.6 ? PAL.lemon : k > 0.3 ? PAL.amber : PAL.rust);
    this.rim.visible = k > 0; this.rim.geometry = larvaGeos().rim[k > 0.5 ? 6 : 0];
  }
  // a hatched bee flies out of the cell (toward you, then up and off the comb): cosmetic, never shootable
  updateBee(f) {
    const C = this.C, side = (this.sp.id & 1) ? 1 : -1, e = E.inOut(f);
    const x = C.x + side * 3.2 * e, y = C.y + 0.4 * Math.sin(Math.PI * f) + 6 * f * f, z = ZM + 0.2 + 2.2 * Math.sin(Math.PI * Math.min(1, f * 1.3));
    this.bee.visible = f < 1; this.bee.position.set(x, y, z);
    this.bee.scale.set(side < 0 ? -1.35 : 1.35, 1.35, 1.35); this.bee.rotation.z = side * 0.5 * f;
    this.beeW.scale.y = [1, 0.25, -0.8][((performance.now() / 33) | 0) % 3];
  }
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
    const q = lt - this.revealLt; this.lastLt = lt; this.group.visible = true;
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
// the swarm: one timeline spawn (kind 'fx') that owns the bee hit test for the run and sets the swarm size
const PROXY_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
class Swarm extends T.Target {
  constructor(sp, run) {
    super('fx'); this.sp = sp; this.run = run; this.shootable = true;
    BEES.n = sp.bees; BEES.hopBias = sp.fast || 0;
    this.proxy = new THREE.Mesh(PROXY_GEO, PROXY_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this;
    this.proxy.raycast = beeRaycast; this.proxy.n = sp.bees; this.group.add(this.proxy);
  }
  meshes() { return [this.proxy]; }
  update(lt, run) { this.run = run; return this.sp.t0 + lt >= this.sp.last; }
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
// hides a decoy 4th | larva = chance a beat also lays a larva, ripen = its timer s, hatch = [bee, target, bomb]
// weights, maxL = larvae ripening at once | spare = misses the clear must survive (the solver's margin) | share =
// quota share of the real targets | rel = the reach-for-reload the pacing allows on the magazine variants (s) |
// cols = live comb columns (Beginner: the middle five) | bees = swarm size
// =========================================================================================
const TIER_P = [
  { time: 45, win: 1.3,  swing: 0.5,  lv: 0.32, live: 4, gap: [0.5, 0.95], burst: 0.25, bgap: [0.3, 0.45], pause: [0.6, 1.0],
    hop: [0.12, 0.38], alt: 0.25, adj: 0.12, decep: 0.18, kinds: [0.45, 0.2, 0.35], bombCap: 0.2,
    trick: 0.15, beat: 0.62, snake: 0.7, pp: 0.75, wall: 1.7, col4: 0.45, larva: 0.16, ripen: 3.6, hatch: [0.3, 0.55, 0.15], maxL: 2,
    spare: 8, share: 0.55, rel: 0.75, cols: [1, 5], bees: 6 },
  { time: 40, win: 1.0,  swing: 0.4,  lv: 0.28, live: 3, gap: [0.55, 0.95], burst: 0.28, bgap: [0.28, 0.4], pause: [0.75, 1.2],
    hop: [0.3, 0.55], alt: 0.45, adj: 0.15, decep: 0.25, kinds: [0.4, 0.22, 0.38], bombCap: 0.27,
    trick: 0.18, beat: 0.5, snake: 0.55, pp: 0.6, wall: 1.35, col4: 0.55, larva: 0.18, ripen: 3.1, hatch: [0.3, 0.5, 0.2], maxL: 2,
    spare: 5, share: 0.6, rel: 0.7, cols: [0, 6], bees: 7 },
  { time: 36, win: 0.7,  swing: 0.3,  lv: 0.24, live: 3, gap: [0.5, 0.9], burst: 0.32, bgap: [0.25, 0.35], pause: [0.9, 1.4],
    hop: [0.45, 0.75], alt: 0.65, adj: 0.17, decep: 0.32, kinds: [0.35, 0.23, 0.42], bombCap: 0.33,
    trick: 0.21, beat: 0.4, snake: 0.42, pp: 0.48, wall: 1.05, col4: 0.65, larva: 0.2, ripen: 2.6, hatch: [0.28, 0.46, 0.26], maxL: 2,
    spare: 3, share: 0.64, rel: 0.62, cols: [0, 6], bees: 7 },
  { time: 32, win: 0.45, swing: 0.22, lv: 0.2,  live: 2, gap: [0.45, 0.8], burst: 0.35, bgap: [0.22, 0.3], pause: [1.0, 1.5],
    hop: [0.6, 1.0], alt: 0.85, adj: 0.2, decep: 0.38, kinds: [0.3, 0.24, 0.46], bombCap: 0.38,
    trick: 0.24, beat: 0.32, snake: 0.34, pp: 0.4, wall: 0.85, col4: 0.75, larva: 0.22, ripen: 2.2, hatch: [0.25, 0.45, 0.3], maxL: 2,
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
  c.bees = v === 2 ? 11 + (tier >= 2 ? 1 : 0) : v === 1 ? b.bees + 1 : b.bees;
  c.frenzy = v === 2 ? [7, 11] : null;                // SWARM: a frenzy now and then on its own, besides the shot bees
  c.fast = v === 2 ? 0.25 : 0;                        // SWARM bees are busier
  c.slack = c.spare; c.quota = 8;                     // placeholder: timeline() derives the real quota
  c.autoReload = false; c.decoy = true; c.hiddenBomb = true; c.patterns = true; c.larvae = true;   // every mechanic at every tier
  c.ammo = ['unlimited', { mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: false }][v];
  c.tier = tier; c.variant = v; c.title = 'BEE HIVE'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
const isItem = s => s.kind === 'cell';
const isReq = s => isItem(s) && (!s.bomb || !!s.hidden) && !(s.larva && s.larva.hatch !== 'target');   // a shot a perfect player spends
const isReal = s => isItem(s) && !s.bomb && !(s.larva && s.larva.hatch !== 'target');                 // counts toward the quota's base

// ---------- timeline: the DIRECTOR (the range's, on the comb). Every spawn from the seeded rng only. ----------
// Beats: a single, a burst of 2-3 singles, or a pattern, with anticipation pauses; a beat may also lay a LARVA in a free
// cell (announced: it ripens for `ripen` s in plain sight, runs alongside the stream). Rules:
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
// pi, trick; deep cell: aheadD (id distance to the one in front), col (place behind), revW. Plus one 'swarm' spawn
// (t0 0: the bee hit test, bees, last) and, on SWARM, 'frenzy' spawns.
function timeline(c, rng) {
  const out = [], occ = [], TIME = c.time, tier = c.tier | 0;
  rng(); rng(); rng();                               // (mulberry32's first draws barely mix nearby seeds)
  const live = CELLS.filter(q => q.c >= c.cols[0] && q.c <= c.cols[1]);
  const xs = live.map(q => q.s[0]), ys = live.map(q => q.s[1]);
  const CD = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), CX = (Math.max(...xs) + Math.min(...xs)) / 2, CY = (Math.max(...ys) + Math.min(...ys)) / 2;
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
        s = Math.abs(Math.hypot(p[0] - lastAim[0], p[1] - lastAim[1]) - D) / CD;
        if ((p[0] < CX) === (lastAim[0] < CX)) s += 0.35 * c.alt;
        if ((p[1] < CY) === (lastAim[1] < CY)) s += 0.2 * c.alt;
      }
      const ua = t + (o.at || 0);
      for (const q of occ) if (!q.ghost && q.ua <= ua + 0.3 && q.ub > ua) { const Q = CELLS[q.cell].s; if (Math.hypot(p[0] - Q[0], p[1] - Q[1]) < c.adj * CD + 2 * CELL_PX) s += 2; }
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
    const ripen = +(c.ripen * rng.range(0.9, 1.1)).toFixed(3), hatch = ['bee', 'target', 'bomb'][pickW(c.hatch, rng())];
    const at = +(ripen + HATCH_GAP).toFixed(3);
    const stay = hatch === 'bomb' ? Math.max(0.6, c.win * 1.2) : Math.max(c.win, 0.5);
    const sp = mk(t, 0, { stay }); sp.at = at; sp.larva = { ripen, hatch };
    if (hatch === 'bomb' && bombs + 1 > c.bombCap * (items() + 1) + 1) sp.larva.hatch = 'bee';
    const C = slot(t, lifeOf(sp), { D: rng.range(c.hop[0], c.hop[1]) * CD, at });
    if (!C) return false;
    sp.cell = C.i; fin(sp);
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
      nb.sort((a, b) => ((b.x - cur.x) * dx + (b.y - cur.y) * dy) - ((a.x - cur.x) * dx + (a.y - cur.y) * dy) + (rng() - 0.5) * 2);
      const nx = nb[0]; dx = nx.x - cur.x; dy = nx.y - cur.y; cur = nx; path.push(cur.i);
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
      const P = CELLS[s.cell].s, aim = 0.06 + 0.32 * (prevP ? Math.hypot(P[0] - prevP[0], P[1] - prevP[1]) : 0) / 489; prevP = P;
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
  out.push({ id: 0, t0: 0, t1: +(Math.min(TIME - 0.05, last + 0.3)).toFixed(3), kind: 'swarm', last: +(last + 0.3).toFixed(3), bees: c.bees, fast: c.fast || 0 });
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
