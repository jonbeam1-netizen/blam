'use strict';
/* =========================================================================================
   B.L.A.M. stages/doppelducks.js -- Stage 10: DOPPELDUCKS (DESIGN-STAGES.md section 11, Fable + Jon 2026-10-30).
   The sheriff's office LINEUP ROOM, seen through the one-way mirror: a height-chart back wall, the "B.L.A.M. COUNTY
   SHERIFF" plaque, a wall clock, a corkboard (top-left, in our room) with the desk lamp clamped on it and a big poster of
   the REAL Deputy Duck (the always-visible reference), a coffee shelf (top-right). A lineup of voxel Deputy Ducks
   (12 / 16 / 20) stands in a LINE, two ROWS, a V or a CROWD on risers. SHOOT THE FAKES: a fake differs from the poster
   by ONE TELL (hat, glasses, moustache, badge, boots, bill colour, tail; obvious -> subtle by tier). A real duck shot =
   FRIENDLY FIRE (kind 'bystander': LIFE -1, he stays in line, dazed). WAVES: a curtain drops and rises, the lineup is
   shuffled with new tells; a wave's fakes must be shot before its window runs out, else they MAKE A BREAK FOR IT
   (shootable 0.5 s as they run, +100). Shoot every fake of a wave and the curtain drops early (shared hit times).
   NERVOUS FAKES give themselves away now and then (a sideways glance, a sweat drop, a gulp). THE SWAP: a whistle, then a
   fake and its neighbour swap hats / glasses on a visible hand-over: the tell (and the fake) moves to the neighbour.
   SHUFFLE: ducks trade places all wave long. CROWD: ducks half hidden behind others step out on a beat (the duck in
   front stops your bullet: occlusion by the duck shapes, as the alley's cover).
   Versus-safe: the lineup, tells, swaps, place trades, nervous tells and curtains are pure functions of (seed, tier,
   variant) and the stage clock; play enters only through the SHARED hit times points() records (early curtains, runners,
   swaps cancelled because the fake was shot first) and run.taken. No shot cap on any variant.
   Ducks: Props' toon voxel style (SDF voxels, palette tones, void outline), one InstancedMesh per part / look variant,
   so the whole lineup is ~16-22 draw calls whatever its size. js/duck.js is untouched.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, E = R.E, Vox = R.Vox, T = B.Targets, PR = B.Props;
if (!PR || !PR.Geo) { console.warn('[BLAM] doppelducks needs core/props.js'); return; }
const clamp = E.clamp, RW = R.RW, RH = R.RH, TAN_H = R.TAN_H, TAU = Math.PI * 2;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
const ID = 'doppelducks';
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hash2 = (x, y) => hash1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));
const sstep = x => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const F3 = x => +x.toFixed(3);
const rnd = R.rnd;
const NOHIT_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), NOHIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
function scr(x, y, z) {                                       // world -> [px, py, game px per world unit] (steady camera; pure)
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (RH / 2) / (Math.max(0.1, d) * TAN_H);
  return [RW / 2 + vx * k, RH / 2 - yc * k, k];
}
const depthOf = (y, z) => -((y - CAMP.y) * PSN + (z - CAMP.z) * PCS);
// screen (px, py) at view depth d -> world point (steady camera)
function worldAt(px, py, d, out) {
  const k = (RH / 2) / (d * TAN_H), xc = (px - RW / 2) / k, yc = (RH / 2 - py) / k;
  return out.set(CAMP.x + xc, CAMP.y + yc * PCS - d * PSN, CAMP.z - yc * PSN - d * PCS);
}
const uOfX = x => clamp(x / RW, 0, 1);

// =========================================================================================
// THE DUCK. Built in lattice cells (S world units each at duck scale 1; feet at y 0, facing +z), voxelised from SDFs
// with Props.sdf and meshed by Props.Geo (toon tones + a constant-width void outline: the tells read at 426x240).
// Parts: body, head (+ eyes, pupils, bill, hat, glasses, moustache ride on the head), badge, tail, two wings, two boots.
// Looks (the tells): hat / glasses / stache / badge / boots / bill / tail, each with the REAL value and fakes at three
// levels (1 obvious, 2 medium, 3 subtle).
// =========================================================================================
const S = 0.05;
const VK = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);   // Props.Geo's voxel key
const len2 = (x, y) => Math.sqrt(x * x + y * y);
const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => { const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz; return (Math.sqrt(a * a + b * b + c * c) - 1) * Math.min(rx, ry, rz); };
const boxD = (x, y, z, x0, y0, z0, x1, y1, z1) => Math.max(x0 - x, x - x1, y0 - y, y - y1, z0 - z, z - z1);
const capD = (x, y, z, a, b, r) => PR.sdf.capsule(x, y, z, a, b, r);
// a 5-point star (tip up), outer radius r, inner ri: straight edges
const STAR_B = TAU / 10;
function inStar(x, y, r, ri = 0.45 * r) {
  const d = len2(x, y); if (d < 1e-6) return true;
  let a = Math.atan2(x, y) % (TAU / 5); if (a < 0) a += TAU / 5;
  const f = a > STAR_B ? TAU / 5 - a : a;
  return d <= r * ri * Math.sin(STAR_B) / (r * Math.sin(f) + ri * Math.sin(STAR_B - f));
}
// body + head surfaces (for things painted on them)
const BODY = [0, 11, -0.3, 8.4, 7.6, 7.4], HEAD = [0, 22.6, 0.8, 6.1, 5.9, 5.7];
const surfZ = (E6, x, y) => { const a = (x - E6[0]) / E6[3], b = (y - E6[1]) / E6[4], q = 1 - a * a - b * b; return q > 0 ? E6[2] + E6[5] * Math.sqrt(q) : -99; };
const NECK = [0, 17.5, 0.6], EYE_C = [0, 23.9, 5.4], HAT_A = [0, 27.4, 0.8], GL_A = [0, 23.8, 7], SH_L = [-7.6, 15.8, 0.8], SH_R = [7.6, 15.8, 0.8];
const BOOT_X = 3.8;

// the looks. REAL = the poster. Each tell: [variant id, level]
const REAL = { hat: 'sheriff', glasses: 'none', stache: 'none', badge: 'star', boots: 'chestnut', bill: 'orange', tail: 'curl' };
const TELLS = {
  hat: [['none', 1], ['bowler', 1], ['tophat', 1], ['cap', 2], ['white', 2], ['dark', 3], ['nostar', 3]],
  glasses: [['shades', 1], ['round', 2], ['specs', 3]],
  stache: [['handlebar', 1], ['chevron', 2], ['pencil', 3]],
  badge: [['redcircle', 1], ['gold', 2], ['circle', 3]],
  boots: [['red', 1], ['midnight', 2], ['tan', 3]],
  bill: [['pink', 1], ['red', 2], ['amber', 3]],
  tail: [['fan', 1], ['left', 2], ['spike', 3]]
};
const CATS = ['hat', 'glasses', 'stache', 'badge', 'boots', 'bill', 'tail'];
const HEAD_CATS = { hat: 1, glasses: 1, stache: 1, bill: 1 };     // tells on the head (never hidden by a crowd)

function voxMap(bounds, shape, paint) { const m = new Map(); PR.sdf.voxelise(m, bounds, shape, paint); return m; }
function geoOf(map, cull = -0.55, smooth = 0.75) { return new PR.Geo(smooth).voxels(map, S, 0, 0, 0, false, cull).geometry(); }
const hatCrownH = (x, z, y) => Math.max(Math.abs(x) - (4.5 - 0.17 * (y - 27.4)), Math.abs(z - 0.8) - (3.9 - 0.1 * (y - 27.4)));
// the sheriff hat (real, white, dark, no star): brim curling up at the sides, a pinched crown with a centre crease,
// a band, a star on the front
function sheriffHat(col, band, star) {
  const brimY = (x, z) => 27.0 + 0.045 * x * x - 0.012 * (z - 0.8) * (z - 0.8);
  const top = x => 33.0 - 0.9 * Math.exp(-x * x / 3);
  const brim = (x, y, z) => { const e = len2(x / 9.0, (z - 0.8) / 7.2) - 1, b = brimY(x, z); return Math.max(e * 7.2, Math.abs(y - b - 0.55) - 0.6); };
  const crown = (x, y, z) => Math.max(hatCrownH(x, z, y), y - top(x), 27.3 - y);
  const front = (x, y) => 0.8 + 3.9 - 0.1 * (y - 27.4);
  const starS = (x, y, z) => star && inStar(x, y - 30.4, 2.0) && z > front(x, y) - 0.6 && z < front(x, y) + 0.9 ? -1 : 1;
  return voxMap([-11, 26, -8, 11, 34, 7], (x, y, z) => Math.min(brim(x, y, z), crown(x, y, z), starS(x, y, z)),
    (x, y, z) => starS(x, y, z) < 0 ? 'yellow' : crown(x, y, z) < 0 && y < 28.9 && y > 27.6 ? band : col);
}
const ART = {};
function buildArt() {
  if (ART.ok) return ART;
  const G = {};
  // BODY: an egg, yellow (the toon ramp shades it amber / lemon)
  G.body = geoOf(voxMap([-9, 3, -8, 9, 19, 8], (x, y, z) => ell(x, y, z, ...BODY), () => 'yellow'));
  // HEAD: round, three black head feathers on top (they show when the hat is off or in the air)
  const feath = (x, y, z) => Math.min(capD(x, y, z, [-1.3, 27.6, 0.4], [-2.6, 30.4, -0.4], 0.62), capD(x, y, z, [0, 28.2, 0.4], [0.2, 31.2, -0.2], 0.62), capD(x, y, z, [1.3, 27.6, 0.4], [2.6, 30.4, -0.4], 0.62));
  G.head = geoOf(voxMap([-7, 16, -6, 7, 32, 8], (x, y, z) => Math.min(ell(x, y, z, ...HEAD), feath(x, y, z)), (x, y, z) => feath(x, y, z) < 0 && ell(x, y, z, ...HEAD) > 0 ? 'void' : 'yellow'));
  G.eyes = geoOf(voxMap([-5, 21, 3, 5, 27, 8], (x, y, z) => Math.min(ell(x, y, z, -2.35, 23.9, 5.6, 1.8, 2.35, 1.3), ell(x, y, z, 2.35, 23.9, 5.6, 1.8, 2.35, 1.3)), () => ({ col: 'bone', noHull: true, nh: true })), -2, 0.5);
  { const m = new Map();                                        // pupils: 1x2 cells each
    for (const i of [-3, 2]) for (const j of [23, 24]) m.set(VK(i, j, 7), { i, j, k: 7, col: 'void', nrm: null });
    G.pupils = new PR.Geo(0).voxels(m, S, 0, 0, 0, false).geometry(); }
  // BILL: upper + lower, colour = the tell
  for (const [id] of [['orange'], ...TELLS.bill]) {
    const col = id === 'orange' ? 'orange' : id;
    G['bill_' + id] = geoOf(voxMap([-5, 18, 3, 5, 23, 10], (x, y, z) => Math.min(ell(x, y, z, 0, 21.15, 6.3, 3.8, 1.3, 2.8), ell(x, y, z, 0, 19.95, 5.8, 3.1, 1.0, 2.3)), () => col), -2);
  }
  // HATS
  G.hat_sheriff = geoOf(sheriffHat('chestnut', 'walnut', true), -0.7);
  G.hat_white = geoOf(sheriffHat('bone', 'navy', true), -0.7);
  G.hat_dark = geoOf(sheriffHat('walnut', 'umber', true), -0.7);
  G.hat_nostar = geoOf(sheriffHat('chestnut', 'walnut', false), -0.7);
  G.hat_bowler = geoOf(voxMap([-8, 26, -7, 8, 34, 8], (x, y, z) => Math.min(Math.max(ell(x, y, z, 0, 27.6, 0.8, 5.0, 4.6, 4.6), 27.3 - y),
    Math.max(len2(x / 6.8, (z - 0.8) / 6.0) * 6 - 6, Math.abs(y - (27.4 + 0.03 * x * x)) - 0.55)),
    (x, y, z) => y > 28.0 && y < 29.0 && ell(x, y, z, 0, 27.6, 0.8, 5.0, 4.6, 4.6) < 0 ? 'oxblood' : 'midnight'), -0.7);
  G.hat_tophat = geoOf(voxMap([-8, 26, -7, 8, 37, 8], (x, y, z) => Math.min(Math.max(len2(x, z - 0.8) - 3.7, 27.2 - y, y - 36.2),
    Math.max(len2(x / 6.6, (z - 0.8) / 5.8) * 5.8 - 5.8, Math.abs(y - (27.3 + 0.025 * x * x)) - 0.55)),
    (x, y, z) => y > 28.0 && y < 29.4 && len2(x, z - 0.8) < 3.7 ? 'crimson' : 'void'), -0.7);
  G.hat_cap = geoOf(voxMap([-7, 25, -6, 7, 33, 11], (x, y, z) => Math.min(Math.max(ell(x, y, z, 0, 26.6, 0.4, 5.6, 4.6, 5.6), 26.4 - y),
    boxD(x, y, z, -3.8, 26.2, 4.2, 3.8, 27.1, 9.6) + 0.0 * x),
    (x, y, z) => len2(x, y - 31.0) < 0.9 && z < 2 ? 'bone' : (z > 4.0 && y < 27.3) ? 'crimson' : 'red'), -0.7);
  // GLASSES (in front of the eyes)
  G.gl_shades = geoOf(voxMap([-6, 21, 5, 6, 27, 10], (x, y, z) => Math.min(
      boxD(Math.abs(x), y, z, 0.7, 22.3, 7.3, 4.5, 25.0, 8.3), boxD(x, y, z, -4.9, 24.6, 7.3, 4.9, 25.6, 8.3)),
    (x, y, z) => y > 24.6 ? 'navy' : (x < -3.4 && x > -4.3 && y > 23.8 ? 'bone' : 'void')), -2);
  G.gl_round = geoOf(voxMap([-6, 20, 5, 6, 27, 10], (x, y, z) => Math.min(
      Math.max(len2(Math.abs(x) - 2.4, y - 23.7) - 2.0, Math.abs(z - 7.8) - 0.5), boxD(x, y, z, -0.8, 24.3, 7.4, 0.8, 24.9, 8.2)),
    (x, y, z) => len2(Math.abs(x) - 2.4, y - 23.7) > 1.45 ? 'steel' : 'void'), -2);
  G.gl_specs = geoOf(voxMap([-6, 20, 5, 6, 27, 10], (x, y, z) => Math.min(
      Math.max(Math.abs(len2(Math.abs(x) - 2.4, y - 23.8) - 2.15) - 0.45, Math.abs(z - 7.8) - 0.45), boxD(x, y, z, -0.6, 24.0, 7.4, 0.6, 24.7, 8.1)),
    () => ({ col: 'mist', noHull: true, nh: true })), -2);
  // MOUSTACHES (on the bill, just under the eyes)
  const onBill = (x, y) => Math.max(surfZ([0, 21.15, 6.3, 3.8, 1.3, 2.8], x, y), surfZ(HEAD, x, y));
  G.st_handlebar = geoOf(voxMap([-7, 20, 4, 7, 26, 11], (x, y, z) => {
    const ax = Math.abs(x), yc = ax < 3.6 ? 22.0 + 0.04 * ax * ax : 22.5 + 0.45 * (ax - 3.6) * (ax - 3.6), th = ax < 4.6 ? 0.85 - 0.06 * ax : 0.55;
    const zs = onBill(Math.min(ax, 3.0), 22.0); return Math.max(Math.abs(y - yc) - th, ax - 5.8, Math.abs(z - zs - 0.3) - 0.8);
  }, () => 'walnut'), -2);
  G.st_chevron = geoOf(voxMap([-5, 20, 4, 5, 25, 11], (x, y, z) => {
    const ax = Math.abs(x), zs = onBill(Math.min(ax, 3.0), 22.1); return Math.max(Math.abs(y - (22.3 - 0.12 * ax)) - 0.85, ax - 3.4, Math.abs(z - zs - 0.3) - 0.8);
  }, () => 'walnut'), -2);
  G.st_pencil = geoOf(voxMap([-5, 20, 4, 5, 25, 11], (x, y, z) => {
    const ax = Math.abs(x), zs = onBill(Math.min(ax, 3.0), 22.3); return Math.max(Math.abs(y - 22.4) - 0.5, ax - 2.9, Math.abs(z - zs - 0.25) - 0.7);
  }, () => 'umber'), -2);
  // BADGES (on the chest, screen left)
  const BX = -3.5, BY = 12.8;
  const onChest = (x, y, z, inside, th = 0.85) => inside ? Math.abs(z - surfZ(BODY, x, y) - 0.25) - th : 1;
  G.bd_star = geoOf(voxMap([-9, 8, 2, 1, 18, 9], (x, y, z) => onChest(x, y, z, inStar(x - BX, y - BY, 3.6)),
    (x, y) => len2(x - BX, y - BY) < 1.0 ? 'haze' : 'mist'), -2);
  G.bd_gold = geoOf(voxMap([-9, 8, 2, 1, 18, 9], (x, y, z) => onChest(x, y, z, inStar(x - BX, y - BY, 3.6)),
    (x, y) => len2(x - BX, y - BY) < 1.0 ? 'orange' : 'amber'), -2);
  G.bd_circle = geoOf(voxMap([-9, 8, 2, 1, 18, 9], (x, y, z) => onChest(x, y, z, len2(x - BX, y - BY) < 2.9),
    (x, y) => len2(x - BX, y - BY) < 1.2 ? 'haze' : 'mist'), -2);
  G.bd_redcircle = geoOf(voxMap([-9, 8, 2, 1, 18, 9], (x, y, z) => onChest(x, y, z, len2(x - BX, y - BY) < 3.1),
    (x, y) => len2(x - BX, y - BY) < 1.3 ? 'bone' : 'red'), -2);
  // BOOTS (one boot, centred on x 0): a cowboy boot, sole + heel walnut, a tan cuff, a stitch, a little spur
  const bootShape = (x, y, z) => Math.min(boxD(x, y, z, -1.95, 1.0, -1.8, 1.95, 6.6, 1.7), Math.max(len2(x / 1.95, (z - 2.0) / 2.6) - 1, -z + 0.5, Math.abs(y - 0.95) - 0.95),
    boxD(x, y, z, -1.95, 0, -2.0, 1.95, 1.9, 1.2), capD(x, y, z, [0, 1.2, -2.3], [0, 1.2, -2.9], 0.55));
  for (const id of ['chestnut', 'red', 'midnight', 'tan']) {
    G['bt_' + id] = geoOf(voxMap([-3, 0, -4, 3, 7, 5], bootShape, (x, y, z) => z < -2.1 ? 'mist' : y < 0.65 || (z < -0.6 && y < 1.2) ? 'walnut' : y > 5.75 ? (id === 'tan' ? 'sand' : 'tan') : (Math.abs(x) < 0.5 && z > 1.2 && y > 2.6 && y < 4.6 ? (id === 'midnight' ? 'slate' : 'amber') : id)), -0.9);
  }
  // TAILS (sticking out at the duck's left = screen right, behind the body)
  const curl = sx => (x, y, z) => { const X = x * sx; return Math.min(capD(X, y, z, [6.0, 9.6, -4.4], [10.6, 10.8, -5.0], 1.9), capD(X, y, z, [10.6, 10.8, -5.0], [13.4, 13.4, -4.6], 1.65), capD(X, y, z, [13.4, 13.4, -4.6], [13.2, 16.4, -3.6], 1.35), capD(X, y, z, [13.2, 16.4, -3.6], [11.4, 17.3, -3.0], 1.1)); };
  G.tl_curl = geoOf(voxMap([4, 7, -8, 16, 19, -1], curl(1), () => 'amber'), -2);
  G.tl_left = geoOf(voxMap([-16, 7, -8, -4, 19, -1], curl(-1), () => 'amber'), -2);
  G.tl_spike = geoOf(voxMap([4, 7, -8, 17, 15, -1], (x, y, z) => { const h = clamp((x - 6.0) / 8.8, 0, 1); return capD(x, y, z, [6.0, 9.6, -4.4], [14.8, 12.6, -4.8], 1.9 - 1.3 * h); }, () => 'amber'), -2);
  G.tl_fan = geoOf(voxMap([-17, 10, -9, 17, 40, -4], (x, y, z) => {
    let d = 9;
    for (const [cx, cy, a] of [[-9.6, 20.5, 0.78], [0, 31.5, 0], [9.6, 20.5, -0.78]]) {
      const c = Math.cos(a), s = Math.sin(a), u = (x - cx) * c - (y - cy) * s, v = (x - cx) * s + (y - cy) * c;
      d = Math.min(d, ell(u, v, z, 0, 0, -6.4, 2.7, 7.8, 1.0));
    }
    return d;
  }, (x, y) => (Math.abs(x) < 0.6 || ((x * x + (y - 12) * (y - 12)) % 9 < 1.2)) ? 'mist' : 'bone'), -2);
  // WINGS (stubby, amber)
  G.wingL = geoOf(voxMap([-11, 6, -3, -5, 18, 5], (x, y, z) => ell(x, y, z, -8.4, 12.2, 0.8, 2.1, 4.9, 3.4), (x, y) => y < 8.6 ? 'orange' : 'amber'), -0.9);
  G.wingR = geoOf(voxMap([5, 6, -3, 11, 18, 5], (x, y, z) => ell(x, y, z, 8.4, 12.2, 0.8, 2.1, 4.9, 3.4), (x, y) => y < 8.6 ? 'orange' : 'amber'), -0.9);
  // extras: the sweat drop, a dizzy star, a crate (riser), the finale cards
  G.sweat = geoOf(voxMap([-2, -3, -2, 2, 3, 2], (x, y, z) => Math.min(ell(x, y, z, 0, -0.4, 0, 1.2, 1.3, 1.0), capD(x, y, z, [0, -0.4, 0], [0, 1.6, 0], 0.45)), (x, y) => y > 0.4 ? 'ice' : 'cyan'), -2, 0.5);
  G.dizzy = geoOf(voxMap([-3, -3, -1, 3, 3, 1], (x, y, z) => inStar(x, y, 2.4) && Math.abs(z) < 0.6 ? -1 : 1, () => 'lemon'), -2, 0);
  ART.G = G;
  // chips for a shattered duck: a thinned sample of the body / head / wing voxels (lattice coords + colour)
  ART.chips = [];
  const addChips = (m, every, dy = 0) => { let n = 0; for (const v of m.values()) if ((n++ % every) === 0) ART.chips.push([v.i + 0.5, v.j + 0.5 + dy, v.k + 0.5, PAL[v.col.split('/')[0]]]); };
  addChips(voxMap([-9, 3, -8, 9, 19, 8], (x, y, z) => ell(x, y, z, ...BODY) + 0.0, () => 'yellow'), 23);
  addChips(voxMap([-7, 16, -6, 7, 29, 8], (x, y, z) => ell(x, y, z, ...HEAD), (x, y, z) => z > 5 && y < 22.4 && Math.abs(x) < 3.5 ? 'orange' : 'yellow'), 17);
  ART.ok = true;
  return ART;
}

// ---------- instancing: one InstancedMesh per part / look; a duck owns one instance index in each ----------
// index 0 = the poster; boots take 2 per index, crates and dizzy stars 3. A mesh is drawn only while an instance uses it.
const CAP = 34;
const PART = {};
const MUL = { boot: 2, crate: 3, dizzy: 3 };
const OWN = [];
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
// each part keeps its instances by owner slot (mats / used); pack() copies the used ones to the front of the
// InstancedMesh (the director at the end of each frame's updates, before the render uploads them; a freed index and the
// poster pack at once) so a look worn by one duck draws one instance
function makePart(name, geo, mat, mul = 1) {
  const m = new THREE.InstancedMesh(geo, mat, CAP * mul);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.raycast = () => {}; m.visible = false; m.count = 0;
  PART[name] = { mesh: m, ref: 0, mul, mats: new Float32Array(CAP * mul * 16), used: new Uint8Array(CAP * mul), dirty: true };
  return m;
}
function pack() {
  for (const k in PART) {
    const p = PART[k]; if (!p.dirty) continue; p.dirty = false;
    const a = p.mesh.instanceMatrix.array; let n = 0;
    for (let i = 0; i < p.used.length; i++) if (p.used[i]) { for (let j = 0; j < 16; j++) a[n * 16 + j] = p.mats[i * 16 + j]; n++; }
    p.mesh.count = n; p.mesh.instanceMatrix.needsUpdate = true;
  }
}
function allocIdx() { for (let i = 1; i < CAP; i++) if (!OWN[i]) { OWN[i] = {}; return i; } return -1; }
function freeIdx(i) { if (i < 1) return; offAll(i); OWN[i] = null; pack(); }
// write part `name` (null = none) as the instance of index i in slot `key` (sub = 0..mul-1)
function put(i, key, name, M, sub = 0) {
  const own = OWN[i]; if (!own) return;
  const k = key + sub, cur = own[k];
  if (cur && cur !== name) { const p = PART[cur]; p.used[i * p.mul + sub] = 0; p.dirty = true; if (--p.ref <= 0) { p.ref = 0; p.mesh.visible = false; } own[k] = null; }
  if (!name) return;
  const p = PART[name]; if (!p) return;
  if (own[k] !== name) { own[k] = name; p.ref++; p.mesh.visible = true; p.used[i * p.mul + sub] = 1; }
  M.toArray(p.mats, (i * p.mul + sub) * 16); p.dirty = true;
}
function offAll(i) { const own = OWN[i]; if (!own) return; for (const k in own) if (own[k]) { const sub = +k.slice(-1); put(i, k.slice(0, -1), null, null, sub); } }
const PART_OF = { hat: v => v === 'none' ? null : 'hat_' + (v === 'sheriff' ? 'sheriff' : v), glasses: v => v === 'none' ? null : 'gl_' + v, stache: v => v === 'none' ? null : 'st_' + v,
  badge: v => 'bd_' + v, boots: v => 'bt_' + v, bill: v => 'bill_' + v, tail: v => 'tl_' + v };

// =========================================================================================
// THE POSE -> the instances. pose: { x, y, z, ds (duck scale), yaw, roll, sx, sy (squash), hy, hp, hr (head yaw / pitch /
// roll), blink (0 open .. 1 shut), pdx (pupils, cells), wl, wr (wing raise rad), bl, br ([lift, stride] cells), sweat
// (-1 none, 0..1 the drop's slide), dizzy (0 none), flat (z squash: the poster), items: { hat: matrix override, glasses }
// =========================================================================================
const _mD = new THREE.Matrix4(), _mH = new THREE.Matrix4(), _mT = new THREE.Matrix4(), _v = new THREE.Vector3();
const tr = (x, y, z) => _mT.makeTranslation(x, y, z);
function drawDuck(i, P, look) {
  _e.set(P.pitch || 0, P.yaw || 0, P.roll || 0, 'YXZ'); _q.setFromEuler(_e);
  _mD.compose(_p.set(P.x, P.y, P.z), _q, _s.set(P.ds * (P.sx || 1), P.ds * (P.sy || 1), P.ds * (P.flat || 1)));
  put(i, 'body', 'body', _mD);
  put(i, 'badge', PART_OF.badge(look.badge), _mD);
  put(i, 'tail', PART_OF.tail(look.tail), _mD);
  // head about the neck
  _mH.copy(_mD).multiply(tr(NECK[0] * S, NECK[1] * S, NECK[2] * S));
  _e.set(P.hp || 0, P.hy || 0, P.hr || 0, 'YXZ'); _m.makeRotationFromEuler(_e); _mH.multiply(_m).multiply(tr(-NECK[0] * S, -NECK[1] * S, -NECK[2] * S));
  put(i, 'head', 'head', _mH);
  put(i, 'bill', PART_OF.bill(look.bill), _mH);
  put(i, 'stache', PART_OF.stache(look.stache), _mH);
  const bl = clamp(P.blink || 0, 0, 0.92);
  _m.copy(_mH).multiply(tr(0, EYE_C[1] * S, 0)).multiply(_m2.makeScale(1, 1 - bl, 1)).multiply(tr(0, -EYE_C[1] * S, 0));
  put(i, 'eyes', 'eyes', _m);
  _m.multiply(tr((P.pdx || 0) * S, (P.pdy || 0) * S, 0)); put(i, 'pupils', 'pupils', _m);
  const it = P.items || {};
  if (it.hat) put(i, 'hat', it.hat.name, it.hat.M); else { _m.copy(_mH).multiply(tr(0, (P.hatLift || 0) * S, 0)); if (P.hatTilt) _m.multiply(_m2.makeRotationZ(P.hatTilt)); put(i, 'hat', PART_OF.hat(look.hat), _m); }
  if (it.glasses) put(i, 'glasses', it.glasses.name, it.glasses.M); else put(i, 'glasses', PART_OF.glasses(look.glasses), _mH);
  // wings about the shoulders
  for (const [key, sh, a, sgn] of [['wingL', SH_L, P.wl || 0, -1], ['wingR', SH_R, P.wr || 0, 1]]) {
    _m.copy(_mD).multiply(tr(sh[0] * S, sh[1] * S, sh[2] * S)).multiply(_m2.makeRotationZ(sgn * a)).multiply(tr(-sh[0] * S, -sh[1] * S, -sh[2] * S));
    put(i, key, key, _m);
  }
  const bn = PART_OF.boots(look.boots), bL = P.bl || [0, 0], bR = P.br || [0, 0];
  _m.copy(_mD).multiply(tr(-BOOT_X * S, bL[0] * S, bL[1] * S)); put(i, 'boot', bn, _m, 0);
  _m.copy(_mD).multiply(tr(BOOT_X * S, bR[0] * S, bR[1] * S)); put(i, 'boot', bn, _m, 1);
  if (P.sweat >= 0) { _m.copy(_mH).multiply(tr(-6.0 * S, (26 - 6 * P.sweat) * S, 4.4 * S)).multiply(_m2.makeScale(0.9, 0.9 + 0.3 * P.sweat, 0.9)); put(i, 'sweat', 'sweat', _m); }
  else put(i, 'sweat', null);
  for (let k = 0; k < 3; k++) {
    if (P.dizzy > 0) { const a = P.dizzyA + k * TAU / 3; _m.copy(_mH).multiply(tr(Math.cos(a) * 6.5 * S, (31 + Math.sin(a * 2) * 0.6) * S, Math.sin(a) * 4 * S)); _m.multiply(_m2.makeRotationY(a * 2)); put(i, 'dizzy', 'dizzy', _m, k); }
    else put(i, 'dizzy', null, null, k);
  }
}
// a carried item's matrix (the swap hand-over): the hat / glasses anchor of the giver's head -> the taker's, on an arc
function headM(P, out) {
  _e.set(P.pitch || 0, P.yaw || 0, P.roll || 0, 'YXZ'); _q.setFromEuler(_e);
  out.compose(_p.set(P.x, P.y, P.z), _q, _s.set(P.ds, P.ds * (P.sy || 1), P.ds));
  out.multiply(tr(NECK[0] * S, NECK[1] * S, NECK[2] * S)); _e.set(P.hp || 0, P.hy || 0, P.hr || 0, 'YXZ'); out.multiply(_m2.makeRotationFromEuler(_e)).multiply(tr(-NECK[0] * S, -NECK[1] * S, -NECK[2] * S));
  return out;
}
const _hA = new THREE.Matrix4(), _hB = new THREE.Matrix4(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _sa = new THREE.Vector3();
function flightM(PA, PB, k, anchor, arc, spin, out) {
  headM(PA, _hA); headM(PB, _hB);
  _hA.decompose(_pa, _qa, _sa); _hB.decompose(_pb, _qb, _s);
  _v.set(anchor[0] * S, anchor[1] * S, anchor[2] * S);
  const e = E.inOut(clamp(k, 0, 1));
  _pa.add(_v.clone().applyQuaternion(_qa).multiplyScalar(PA.ds)); _pb.add(_v.clone().applyQuaternion(_qb).multiplyScalar(PB.ds));
  _p.lerpVectors(_pa, _pb, e); _p.y += arc * Math.sin(Math.PI * e);
  _qa.slerp(_qb, e); _q.setFromAxisAngle(_v.set(0, 0, 1), spin * Math.sin(Math.PI * e)); _qa.multiply(_q);
  out.compose(_p, _qa, _s.set(PA.ds, PA.ds, PA.ds)).multiply(tr(-anchor[0] * S, -anchor[1] * S, -anchor[2] * S));
  return out;
}

// =========================================================================================
// THE SET. The camera looks through the one-way mirror into the lineup room.
// =========================================================================================
const BACK_Z = -5.2, CUR_Z = 0.95, SILL_Y = -0.25;
const OCC = [];                                               // foreground boxes that stop bullets (corkboard, shelf)
const occ = (x0, y0, z0, x1, y1, z1) => OCC.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
const POSTER = { px: [6, 76], py: [12, 108], d: 2.6 };          // the corkboard's screen rect (game px) + its view depth
const SET = { curtain: null, clockHands: null, lamp: null, cards: [], posterM: new THREE.Matrix4(), posterP: null };
function envBake(x, y, z) {                                   // soft light pools from the strip lights + a darker floor far back
  const top = 0.82 + 0.2 * clamp(y / 5.5, 0, 1), side = 1 - 0.1 * clamp((Math.abs(x) - 4) / 4, 0, 1);
  return top * side;
}
function text3(v, str, x0, y0, z, px, col, dz = 0.02) {       // 3x5 voxel text, top-left at (x0, y0), pixel size px
  const t = R.small(str);
  for (const [x, y] of t.px) v.bx(x0 + x * px, y0 - (y + 1) * px, z, x0 + (x + 1) * px, y0 - y * px, z + dz, PAL[col]);
  return t.w * px;
}
function textBold(v, str, cx, y0, z, px, colOf, dz = 0.03, shadow = 'void') {
  const t = R.bold(str), x0 = cx - t.w * px / 2;
  if (shadow) for (const [x, y] of t.px) v.bx(x0 + (x + 0.6) * px, y0 - (y + 1.6) * px, z, x0 + (x + 1.6) * px, y0 - (y + 0.6) * px, z + dz * 0.5, PAL[shadow]);
  for (const [x, y] of t.px) v.bx(x0 + x * px, y0 - (y + 1) * px, z + dz * 0.5, x0 + (x + 1) * px, y0 - y * px, z + dz, PAL[colOf(y)]);
}
const ROW_GOLD = y => ['lemon', 'lemon', 'yellow', 'yellow', 'yellow', 'amber', 'orange'][y] || 'amber';
function buildRoom(env, obj, glow) {
  // floor: big checker tiles (navy / slate), a lemon "stand here" line under the front row
  for (let z = BACK_Z; z < 3.4; z += 0.8) for (let x = -9.6; x < 9.6; x += 0.8) {
    const c = ((Math.round(x / 0.8) + Math.round(z / 0.8)) & 1) ? PAL.navy : PAL.slate;
    env.bx(x, -0.2, z, x + 0.8, 0, z + 0.8, c);
  }
  env.bx(-9.6, 0, -0.35, 9.6, 0.012, -0.28, PAL.yellow);
  // back wall: pale height-chart wall, lines every 0.15 (bold every 0.45 = "1 FT"), numbers on both sides + middle
  for (let y = 0; y < 7.2; y += 0.45) for (let x = -10; x < 10; x += 1) env.bx(x, y, BACK_Z - 0.2, x + 1, y + 0.45, BACK_Z, y < 0.3 ? PAL.slate : PAL.mist);
  for (let n = 0; n * 0.15 <= 4.6; n++) {
    const y = n * 0.15, major = n % 3 === 0, w = major ? 0.035 : 0.016;
    if (major) env.bx(-10, y - w, BACK_Z, 10, y + w, BACK_Z + 0.012, PAL.navy);
    else for (const [a, b] of [[-10, -6.6], [-0.5, 0.5], [6.6, 10]]) env.bx(a, y - w, BACK_Z, b, y + w, BACK_Z + 0.01, PAL.haze);
    if (major && n > 0) for (const x of [-6.5, 6.0]) text3(env, (n / 3) + "'", x, y + 0.2, BACK_Z + 0.012, 0.042, 'navy');
  }
  env.bx(-10, 4.75, BACK_Z, 10, 4.83, BACK_Z + 0.03, PAL.slate);                 // picture rail
  // side walls (slate, a darker dado), ceiling strip lights
  for (const sx of [-1, 1]) for (let z = BACK_Z; z < 2; z += 0.8) for (let y = 0; y < 7; y += 0.7) env.bx(sx * 8.6 - 0.1, y, z, sx * 8.6 + 0.1, y + 0.7, z + 0.8, y < 1.4 ? PAL.navy : PAL.slate);
  for (const x of [-5.5, -1.8, 1.8, 5.5]) { glow.bx(x - 1.3, 5.95, BACK_Z + 0.2, x + 1.3, 6.08, BACK_Z + 0.5, PAL.lemon); env.bx(x - 1.4, 6.08, BACK_Z + 0.15, x + 1.4, 6.2, BACK_Z + 0.55, PAL.steel); }
  // the B.L.A.M. COUNTY SHERIFF plaque (walnut board, a big silver star, gold B.L.A.M., bone small caps)
  { const z = BACK_Z + 0.04, cx = 0.6, top = 5.5;
    obj.bx(cx - 2.75, top - 1.5, z, cx + 2.75, top, z + 0.08, PAL.chestnut);
    obj.bx(cx - 2.6, top - 1.38, z + 0.08, cx + 2.6, top - 0.12, z + 0.1, PAL.walnut);
    for (let i = -14; i <= 14; i++) for (let j = -14; j <= 14; j++) if (inStar(i, j, 13.5)) obj.bx(cx - 2.2 + i * 0.024 - 0.012, top - 0.75 + j * 0.024 - 0.012, z + 0.1, cx - 2.2 + i * 0.024 + 0.012, top - 0.75 + j * 0.024 + 0.012, z + 0.14, len2(i, j) < 4 ? PAL.haze : PAL.mist);
    textBold(obj, 'B.L.A.M.', cx + 0.35, top - 0.22, z + 0.1, 0.068, ROW_GOLD);
    const w = R.small('COUNTY SHERIFF').w * 0.042; text3(obj, 'COUNTY SHERIFF', cx + 0.35 - w / 2, top - 0.93, z + 0.1, 0.042, 'bone', 0.03);
  }
  // the wall clock (ticks: the hands are their own little mesh)
  { const cx = 4.7, cy = 5.25, z = BACK_Z + 0.04, r = 0.5;
    for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) { const d = len2(i, j); if (d > 12.4) continue; obj.bx(cx + i * 0.042 - 0.021, cy + j * 0.042 - 0.021, z, cx + i * 0.042 + 0.021, cy + j * 0.042 + 0.021, z + (d > 10.6 ? 0.12 : 0.05), d > 10.6 ? PAL.walnut : PAL.bone); }
    for (let h = 0; h < 12; h++) { const a = h / 12 * TAU, rr = r * 0.78; obj.bx(cx + Math.sin(a) * rr - 0.022, cy + Math.cos(a) * rr - 0.022, z + 0.05, cx + Math.sin(a) * rr + 0.022, cy + Math.cos(a) * rr + 0.022, z + 0.07, PAL.navy); }
  }
  // the one-way mirror's frame: a steel top rail and the sill (with a stencil) under the lineup
  for (const sx of [-1, 1]) obj.bx(sx * 6.0 - 0.18, -1.2, 2.6, sx * 6.0 + 0.18, 6, 2.9, PAL.slate);
}
// the corkboard (our side of the glass, top-left): a chestnut frame, cork, notes, red pins, the poster of the REAL deputy,
// the clamp lamp shining on it. The poster duck is the lineup's own instanced meshes (instance 0): it can't drift.
function buildCorkboard(obj, glow) {
  const d = POSTER.d, a = worldAt(POSTER.px[0], POSTER.py[0], d, new THREE.Vector3()), b = worldAt(POSTER.px[1], POSTER.py[1], d, new THREE.Vector3());
  const z = (a.z + b.z) / 2, x0 = a.x, x1 = b.x, y0 = b.y, y1 = a.y, fw = 0.05;
  obj.bx(x0, y0, z - 0.06, x1, y1, z, PAL.chestnut);                                         // frame
  obj.bx(x0 + fw, y0 + fw, z, x1 - fw, y1 - fw, z + 0.008, PAL.tan);                          // cork
  for (let i = 0; i < 70; i++) { const u = hash1(i * 3 + 1), v = hash1(i * 3 + 2), xx = x0 + fw + u * (x1 - x0 - 2 * fw), yy = y0 + fw + v * (y1 - y0 - 2 * fw); obj.bx(xx, yy, z + 0.008, xx + 0.012, yy + 0.012, z + 0.011, i & 1 ? PAL.sand : PAL.chestnut); }
  obj.bx(x0 - 0.02, y1 - 0.02, z - 0.07, x1 + 0.02, y1 + 0.03, z + 0.03, PAL.walnut);           // top rail
  // the poster: sand paper, a ruled border, THE REAL DEPUTY on top, ACCEPT NO FAKES under, a red pin each corner
  const pm = 0.035, px0 = x0 + fw + pm, px1 = x1 - fw - pm, py0 = y0 + fw + pm + 0.02, py1 = y1 - fw - pm;
  obj.bx(px0, py0, z + 0.011, px1, py1, z + 0.016, PAL.lemon);
  obj.bx(px0 + 0.02, py0 + 0.02, z + 0.016, px1 - 0.02, py1 - 0.02, z + 0.018, PAL.sand);
  obj.bx(px0 + 0.032, py0 + 0.032, z + 0.018, px1 - 0.032, py1 - 0.032, z + 0.019, PAL.lemon);
  const pxs = (px1 - px0) / 66, cxp = (px0 + px1) / 2;
  { const w = R.small('THE REAL').w * pxs; text3(obj, 'THE REAL', cxp - w / 2, py1 - 0.055, z + 0.019, pxs, 'crimson', 0.004); }
  { const w = R.small('DEPUTY').w * pxs * 1.4; text3(obj, 'DEPUTY', cxp - w / 2, py1 - 0.055 - 7 * pxs, z + 0.019, pxs * 1.4, 'walnut', 0.004); }
  { const w = R.small('NO FAKES!').w * pxs; text3(obj, 'NO FAKES!', cxp - w / 2, py0 + 0.03 + 6 * pxs, z + 0.019, pxs, 'crimson', 0.004); }
  for (const [px, py] of [[px0 + 0.03, py1 - 0.03], [px1 - 0.03, py1 - 0.03], [px0 + 0.03, py0 + 0.03], [px1 - 0.03, py0 + 0.03]]) { obj.bx(px - 0.016, py - 0.016, z + 0.019, px + 0.016, py + 0.016, z + 0.04, PAL.red); obj.bx(px - 0.007, py + 0.002, z + 0.04, px + 0.002, py + 0.011, z + 0.044, PAL.coral); }
  // the poster duck: instance 0, standing out of the paper between the title and the footer, turned a little so the tail shows
  const dh = (py1 - 0.055 - 14 * pxs) - (py0 + 0.03 + 8 * pxs), ds = dh / (33 * S), fy = py0 + 0.03 + 8 * pxs;
  const pds = ds * 0.8, pz = z + 0.02 + 6.5 * S * pds;
  SET.posterP = { x: cxp - 0.03, y: fy + 0.3 * (dh - 33 * S * pds), z: pz, ds: pds, flat: 1, yaw: Math.atan2(CAMP.x - cxp, CAMP.z - pz) - 0.3, roll: 0, pitch: Math.atan2(fy - CAMP.y, CAMP.z - pz) * 0.8, sx: 1, sy: 1 };
  // the clamp lamp: a clamp on the top rail, two steel arms, a green shade aimed at the poster, a lemon bulb glow
  const lx = x1 - 0.12, ly = y1 + 0.03;
  obj.bx(lx - 0.05, ly - 0.06, z - 0.08, lx + 0.05, ly + 0.05, z + 0.05, PAL.steel);
  for (let k = 0; k <= 10; k++) { const t = k / 10, ax = lx + 0.02 * t, ay = ly + 0.05 + 0.32 * t, az = z + 0.02 + 0.14 * t; obj.bx(ax - 0.018, ay - 0.018, az - 0.018, ax + 0.018, ay + 0.018, az + 0.018, PAL.steel); }
  for (let k = 0; k <= 10; k++) { const t = k / 10, ax = lx + 0.02 - 0.2 * t, ay = ly + 0.37 - 0.08 * t, az = z + 0.16 + 0.08 * t; obj.bx(ax - 0.016, ay - 0.016, az - 0.016, ax + 0.016, ay + 0.016, az + 0.016, PAL.haze); }
  const sx = lx - 0.24, sy = ly + 0.24, sz = z + 0.26;
  for (let k = 0; k < 6; k++) { const r = 0.05 + k * 0.022; obj.bx(sx - r, sy - 0.03 - k * 0.026, sz - r * 0.7, sx + r, sy - k * 0.026, sz + r * 0.7, k < 5 ? PAL.green : PAL.forest); }
  glow.bx(sx - 0.1, sy - 0.2, sz - 0.07, sx + 0.1, sy - 0.15, sz + 0.07, PAL.lemon);
  // a note card + a mugshot scrap pinned beside nothing (the board is the poster's), chains up to the ceiling
  for (const cx of [x0 + 0.12, x1 - 0.12]) for (let y = y1 + 0.03; y < y1 + 1.2; y += 0.06) obj.bx(cx - 0.012, y, z - 0.03, cx + 0.012, y + 0.04, z - 0.01, PAL.steel);
  occ(Math.min(x0, x1) - 0.05, y0, z - 0.1, Math.max(x0, x1) + 0.05, y1 + 0.5, z + 0.35);
}
// the coffee shelf (our side, top-right): a bracket shelf, the glass pot on its warmer (red light), two mugs, a donut box
function buildShelf(obj, glow) {
  const d = 2.9, a = worldAt(352, 46, d, new THREE.Vector3()), b = worldAt(424, 46, d, new THREE.Vector3());
  const z = a.z, x0 = a.x, x1 = b.x + 0.2, y = a.y;
  obj.bx(x0, y - 0.05, z - 0.25, x1, y, z + 0.12, PAL.chestnut); obj.bx(x0, y - 0.065, z + 0.1, x1, y - 0.035, z + 0.13, PAL.walnut);
  for (const bx of [x0 + 0.12, x1 - 0.35]) obj.bx(bx, y - 0.14, z - 0.25, bx + 0.04, y - 0.05, z - 0.18, PAL.steel);
  // warmer + pot
  const px = x0 + 0.32;
  obj.bx(px - 0.17, y, z - 0.16, px + 0.17, y + 0.06, z + 0.08, PAL.void); glow.bx(px + 0.08, y + 0.015, z + 0.08, px + 0.13, y + 0.045, z + 0.085, PAL.red);
  for (let k = 0; k < 9; k++) { const t = k / 8, r = 0.13 * Math.sin(0.4 + t * 2.4) + 0.03, yy = y + 0.06 + t * 0.32; obj.bx(px - r, yy, z - 0.04 - r * 0.8, px + r, yy + 0.04, z - 0.04 + r * 0.8, t < 0.5 ? PAL.walnut : t < 0.85 ? PAL.mist : PAL.void); }
  obj.bx(px + 0.12, y + 0.16, z - 0.06, px + 0.2, y + 0.3, z - 0.02, PAL.void);
  // mugs: a crimson one (DEPUTY), a bone one
  for (const [mx, col] of [[px + 0.42, PAL.crimson], [px + 0.68, PAL.bone]]) { obj.bx(mx - 0.08, y, z - 0.1, mx + 0.08, y + 0.17, z + 0.04, col); obj.bx(mx + 0.08, y + 0.04, z - 0.05, mx + 0.13, y + 0.13, z - 0.01, col); obj.bx(mx - 0.065, y + 0.165, z - 0.085, mx + 0.065, y + 0.172, z + 0.025, PAL.walnut); }
  // the donut box, lid up: two pink-iced donuts
  const dx = px + 1.0; obj.bx(dx - 0.2, y, z - 0.18, dx + 0.2, y + 0.08, z + 0.06, PAL.bone); obj.bx(dx - 0.2, y + 0.08, z - 0.2, dx + 0.2, y + 0.36, z - 0.17, PAL.bone); obj.bx(dx - 0.12, y + 0.18, z - 0.17, dx + 0.12, y + 0.24, z - 0.165, PAL.pink);
  for (const ox of [-0.09, 0.09]) { obj.bx(dx + ox - 0.07, y + 0.08, z - 0.1, dx + ox + 0.07, y + 0.12, z + 0.0, PAL.pink); obj.bx(dx + ox - 0.02, y + 0.115, z - 0.06, dx + ox + 0.02, y + 0.125, z - 0.04, PAL.chestnut); }
  occ(x0, y - 0.15, z - 0.3, x1, y + 0.45, z + 0.15);
}
// the curtain: crimson velvet folds (light / dark stripes), a gold fringe, a walnut pelmet bar; one mesh that rides up
function buildCurtain() {
  const v = new Vox(), W = 9.6, H = 6.4;
  for (let x = -W; x < W; x += 0.2) {
    const f = Math.sin(x / 0.6 * Math.PI), z = f * 0.07, c = f > 0.55 ? PAL.red : f > -0.2 ? PAL.crimson : PAL.oxblood;
    v.bx(x, 0.12, z - 0.05, x + 0.2, H, z + 0.05, c);
    v.bx(x, 0, z + 0.03, x + 0.2, 0.12, z + 0.09, ((x / 0.2) | 0) & 1 ? PAL.amber : PAL.yellow);
    if ((((x / 0.2) | 0) % 3) === 0) v.bx(x + 0.06, -0.08, z + 0.05, x + 0.14, 0, z + 0.09, PAL.amber);
  }
  v.bx(-W, H - 0.25, 0.08, W, H, 0.2, PAL.amber);
  const m = v.mesh(R.MAT.obj); m.raycast = () => {}; m.position.set(0, 0, CUR_Z);
  return m;
}
const CARD_L = ['B', 'L', 'A', 'M'];
function buildCards(group) {
  for (const L of CARD_L) {
    const v = new Vox(), px = 0.052, w = 0.62, h = 0.72;
    v.bx(-w / 2, -h / 2, -0.02, w / 2, h / 2, 0.02, PAL.bone); v.bx(-w / 2 + 0.03, -h / 2 + 0.03, 0.02, w / 2 - 0.03, h / 2 - 0.03, 0.025, PAL.lemon);
    v.bx(-0.03, -h / 2 - 0.25, -0.03, 0.03, -h / 2, 0.01, PAL.chestnut);
    textBold(v, L + '.', 0.02, 0.2, 0.025, px, () => 'crimson', 0.02, 'oxblood');
    const m = v.mesh(R.MAT.obj); m.raycast = () => {}; m.visible = false; group.add(m); SET.cards.push(m);
  }
}
function buildEnv() {
  buildArt();
  const group = new THREE.Group(), env = new Vox(), obj = new Vox(), glow = new Vox();
  env.bake = envBake;
  buildRoom(env, obj, glow); buildCorkboard(obj, glow); buildShelf(obj, glow);
  const envMesh = env.mesh(R.MAT.env), objMesh = obj.mesh(R.MAT.obj), glowMesh = glow.mesh(R.MAT.glow);
  envMesh.userData.env = true; glowMesh.raycast = () => {};
  envMesh.onBeforeRender = ambient;
  // clock hands
  { const v = new Vox(); v.bx(-0.018, 0, 0, 0.018, 0.34, 0.02, PAL.void); v.bx(-0.03, -0.03, 0, 0.03, 0.03, 0.025, PAL.red);
    const h = v.mesh(R.MAT.obj); h.position.set(4.7, 5.25, BACK_Z + 0.1); h.raycast = () => {};
    const v2 = new Vox(); v2.bx(-0.008, -0.06, 0, 0.008, 0.42, 0.012, PAL.red); const s2 = v2.mesh(R.MAT.obj); s2.position.set(4.7, 5.25, BACK_Z + 0.12); s2.raycast = () => {};
    SET.clockHands = [h, s2]; group.add(h, s2); }
  SET.curtain = buildCurtain(); group.add(SET.curtain);
  group.add(envMesh, objMesh, glowMesh);
  // the duck parts (Props' toon material; instanced)
  const G = ART.G;
  for (const name in G) {
    const mul = name.startsWith('bt_') ? 2 : name === 'dizzy' ? 3 : 1;
    group.add(makePart(name, G[name], PR.mat, mul));
  }
  group.add(makePart('crate', crateGeo(), R.MAT.obj, 3));
  buildCards(group);
  // the poster duck = instance 0, fixed
  OWN[0] = {}; drawDuck(0, Object.assign({ blink: 0, pdx: 0, bl: [0, 0], br: [0, 0], sweat: -1, dizzy: 0 }, SET.posterP), REAL);
  pack();
  group.userData.shootables = [envMesh, objMesh];
  return group;
}
function crateGeo() {                                          // an apple box (riser): 1.05 x 0.42 x 0.8, tan planks, a stencil
  const v = new Vox(), w = 0.525, h = 0.42, d = 0.4;
  v.bx(-w, 0, -d, w, h, d, PAL.tan);
  for (const y of [0.14, 0.28]) v.bx(-w - 0.005, y - 0.01, d, w + 0.005, y + 0.01, d + 0.006, PAL.chestnut);
  v.bx(-w, h - 0.02, -d, w, h, d, PAL.sand);
  v.bx(-0.18, 0.05, d + 0.004, 0.18, 0.09, d + 0.008, PAL.walnut);
  return v.geo();
}
// cosmetic per frame (wall clock): the clock ticks
function ambient() {
  if (!SET.clockHands) return;
  const now = Date.now() / 1000, sec = Math.floor(now % 60), min = (now / 60) % 60;
  SET.clockHands[0].rotation.z = -min / 60 * TAU; SET.clockHands[1].rotation.z = -sec / 60 * TAU;
}

// =========================================================================================
// LAYOUTS: slots in screen terms (px across, a world depth z, a riser height h), so a lineup fills the room whatever
// its size. row = the row / tier (neighbours share a row); tier >= 1 in a CROWD steps out on a beat.
// =========================================================================================
// the riser height that puts a duck's feet at screen row py at depth z (bisection on the pure camera model)
function hAt(py, z) { let lo = -0.5, hi = 4; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (scr(0, m, z)[1] > py) lo = m; else hi = m; } return Math.max(0, F3((lo + hi) / 2)); }
function rowSlots(out, n, z, footPy, px0, px1, row, ds, tier = 0) {
  const h = hAt(footPy, z);
  for (let i = 0; i < n; i++) {
    const px = n === 1 ? (px0 + px1) / 2 : px0 + (px1 - px0) * i / (n - 1), d = depthOf(h + 0.8, z);
    out.push({ x: F3(CAMP.x + (px - RW / 2) * d * TAN_H / (RH / 2)), z, h, row, col: i, ds, tier, gap: (px1 - px0) / Math.max(1, n - 1) * d * TAN_H / (RH / 2) });
  }
}
// LINE (12 only), ROWS (two rows, the back one on risers, nothing hidden), V (12: the point in front, two arms climbing
// up and out), STAIRS (16 / 20: three staggered tiers, nothing hidden), CROWD (three tiers in COLUMNS: the heads peek
// over, the bodies hide behind the duck in front until the tier steps out half a slot on a beat)
const LAYOUTS = {
  12: {
    LINE: o => rowSlots(o, 12, -2.6, 172, 32, 396, 0, 0.92),
    ROWS: o => { rowSlots(o, 6, -0.9, 182, 84, 364, 0, 1.08); rowSlots(o, 6, -3.2, 110, 112, 392, 1, 1.08); },
    V: o => vSlots(o, 12, 1.05),
    CROWD: o => { rowSlots(o, 4, -0.8, 182, 120, 360, 0, 1.1); rowSlots(o, 4, -1.9, 144, 120, 360, 1, 1.1, 1); rowSlots(o, 4, -3.0, 106, 128, 364, 2, 1.1, 2); }
  },
  16: {
    ROWS: o => { rowSlots(o, 8, -1.3, 182, 44, 372, 0, 1.0); rowSlots(o, 8, -3.4, 112, 96, 394, 1, 1.0); },
    STAIRS: o => { rowSlots(o, 6, -1.0, 182, 70, 390, 0, 1.0); rowSlots(o, 5, -2.6, 132, 118, 390, 1, 1.0); rowSlots(o, 5, -4.0, 86, 104, 398, 2, 1.0); },
    CROWD: o => { rowSlots(o, 6, -1.0, 182, 80, 380, 0, 1.02); rowSlots(o, 5, -2.1, 146, 110, 370, 1, 1.02, 1); rowSlots(o, 5, -3.2, 108, 110, 372, 2, 1.02, 2); }
  },
  20: {
    ROWS: o => { rowSlots(o, 10, -1.8, 180, 30, 380, 0, 0.98); rowSlots(o, 10, -3.8, 114, 112, 396, 1, 0.98); },
    STAIRS: o => { rowSlots(o, 7, -1.1, 182, 50, 392, 0, 0.98); rowSlots(o, 7, -2.7, 132, 106, 398, 1, 0.98); rowSlots(o, 6, -4.2, 84, 104, 398, 2, 0.98); },
    CROWD: o => { rowSlots(o, 7, -1.2, 182, 40, 388, 0, 1.0); rowSlots(o, 7, -2.3, 146, 100, 372, 1, 1.0, 1); rowSlots(o, 6, -3.4, 110, 112, 372, 2, 1.0, 2); }
  }
};
// the V: the point in front (middle bottom), the arms climbing up and out; row 0 = the left arm, 1 = the right arm
function vSlots(o, n, ds) {
  const half = n / 2;
  for (let s = 0; s < 2; s++) for (let j = 0; j < half; j++) {
    const side = s ? 1 : -1, z = F3(-0.7 - 0.62 * j), py = 182 - 19 * j, px = 213 + side * (26 + 30 * j);
    const h = hAt(py, z), d = depthOf(h + 0.8, z);
    o.push({ x: F3(CAMP.x + (px - RW / 2) * d * TAN_H / (RH / 2)), z, h, row: s, col: j, ds, tier: 0, gap: 30 * d * TAN_H / (RH / 2) });
  }
}
function layoutSlots(n, name) { const o = []; LAYOUTS[n][name](o); return o; }

// the risers under a raised duck: a stack of apple boxes scaled to the height
function drawCrates(i, x, z, h, ds = 1) {
  const n = h > 0.05 ? Math.min(3, Math.ceil(h / 0.46)) : 0, k = n ? h / (n * 0.42) : 1;
  for (let c = 0; c < 3; c++) { if (c < n) { _m.compose(_p.set(x, c * 0.42 * k, z), _q.identity(), _s.set(ds, k, ds)); put(i, 'crate', 'crate', _m, c); } else put(i, 'crate', null, null, c); }
}
// dev: show a static lineup (no run) to judge the art: def.preview(n, layout, looks?) / def.preview(0) clears it
let PREV = [];
function preview(n, name = 'LINE', looks = null, t = 0) {
  for (const i of PREV) freeIdx(i); PREV = [];
  if (!n) return 'cleared';
  B.Stage.showEnv(ID);
  const slots = layoutSlots(n, name);
  slots.forEach((sl, k) => {
    const i = allocIdx(); PREV.push(i);
    const look = Object.assign({}, REAL, looks && looks[k] || {});
    drawDuck(i, { x: sl.x, y: sl.h, z: sl.z, ds: sl.ds, blink: 0, pdx: 0, sweat: -1, dizzy: 0, bl: [0, 0], br: [0, 0] }, look);
    drawCrates(i, sl.x, sl.z, sl.h, sl.ds);
  });
  SET.curtain.position.y = 6.6; pack();
  return slots.length;
}

// =========================================================================================
// THE CLOCK OF A WAVE: curtain up (CUR_UP) -> the window (W) -> THE BREAK (runners) -> curtain down (CUR_DN) -> the
// shuffle behind it (HOLD) -> the next wave. A wave whose every fake is shot drops its curtain early (CLEAR_LAG after
// the last hit, never before MINW of open curtain). Only SHARED hit times go in (points() records them; only Run.applyHit
// calls it: the host's time on both versus tabs), so both tabs run the same clock. Spawns are created at the EARLIEST
// possible wave start (every earlier wave cleared at once) and wait invisible behind the curtain.
// =========================================================================================
const START = 0.8, CUR_UP = 0.7, CUR_DN = 0.5, HOLD = 1.0, BRK = 0.6, MINW = 1.6, CLEAR_LAG = 0.7, CUR_TOP = 6.9;
const READY_Q = 0.45, QUICK_T = 1.0, RUN_HOP = 0.22, RUN_SHOOT = 0.5, RUN_GONE = 1.15, RUN_V = 9.5;
const SWAP_TEL = 0.75, HAND = 0.9, PLACE_T = 1.0, FIN_HOLD = 4.4, FIN_SLOT = 1.0;
const PTS_FAKE = 300, PTS_QUICK = 100, PTS_RUN = 100;
const HIT = new WeakMap(), QUICK = new WeakMap(), FF = new WeakMap(), TLOF = new WeakMap(), FIN = new WeakMap(), CLOCK = new WeakMap();
let VER = 0;                                                   // bumps on every recorded hit / friendly fire (clock memo)
const hitOf = sp => HIT.get(sp);
// a swap happens unless its fake was shot first, or its real partner was shot (friendly fire) before the hand-over
function swapOn(tk, S, tl) {
  if (tk.b < 0) return false;
  const hA = hitOf(tl[tk.a]); if (hA != null && hA < S + tk.qs) return false;
  const fb = FF.get(tl[tk.b]); return !(fb != null && fb < S + tk.qs);
}
// who carries the tell at wave time q: A, B after the hand-over, -1 during it
function carrierAt(tk, q, S, tl, on = swapOn(tk, S, tl)) { return on && q >= tk.qs ? (q < tk.qs + HAND ? -1 : tk.b) : tk.a; }
function tokenHitT(tk, S, tl) {
  const on = swapOn(tk, S, tl), hA = hitOf(tl[tk.a]);
  if (!on) return hA != null ? hA : null;
  const hB = hitOf(tl[tk.b]); return hB != null && hB >= S + tk.qs + HAND ? hB : null;
}
function waveClock(tl) {
  const m = CLOCK.get(tl); if (m && m.v === VER) return m.w;
  const dir = tl[0], w = []; let S = START;
  for (const wv of dir.waves) {
    const E = S + CUR_UP + wv.W; let C = -1, all = true;
    for (const tk of wv.tokens) { const h = tokenHitT(tk, S, tl); if (h == null) { all = false; break; } C = Math.max(C, h); }
    const D = all ? Math.min(E + BRK, Math.max(C + CLEAR_LAG, S + CUR_UP + MINW)) : E + BRK;
    w.push({ S, E, D, early: all && D < E + BRK - 1e-6 });
    S = D + CUR_DN + HOLD;
  }
  CLOCK.set(tl, { v: VER, w });
  return w;
}
// the curtain's height (0 down .. 1 up) at stage time t (pure in the clock + the finale start)
function curtainAt(clk, t, fin) {
  for (let w = clk.length - 1; w >= 0; w--) {
    const c = clk[w]; if (t < c.S) continue;
    const D = c.D + (w === clk.length - 1 && fin != null ? FIN_HOLD : 0);
    return t < c.S + CUR_UP ? sstep((t - c.S) / CUR_UP) : t < D ? 1 : 1 - sstep((t - D) / CUR_DN);
  }
  return 0;
}
const LAYC = {};
const slotsOf = (n, lay) => LAYC[n + lay] || (LAYC[n + lay] = layoutSlots(n, lay));
const lookOf = sp => Object.assign({}, REAL, sp.lk);
// where a duck stands at wave time q (pure): its slot after the place trades so far (walking during one: one passes in
// front, one behind, a little hop-step), the CROWD tier's step-out on the beat. -> out { x, y, z, ds, sx0 (crate x), sz0, h0, tier, walk }
function placeAt(sp, wv, q, out) {
  const SL = slotsOf(wv.n, wv.lay);
  let s = sp.slot, a = -1, b = -1, k = 0, side = 0;
  for (const mv of wv.moves) {
    if (q < mv.q) break;
    const me = mv.a === sp.id ? 0 : mv.b === sp.id ? 1 : -1; if (me < 0) continue;
    const from = me ? mv.sb : mv.sa, to = me ? mv.sa : mv.sb;
    if (q < mv.q + PLACE_T) { a = from; b = to; k = (q - mv.q) / PLACE_T; side = me ? -1 : 1; break; }
    s = to;
  }
  let sl = SL[s];
  if (a >= 0) {
    const A = SL[a], Bq = SL[b], e = sstep(k);
    out.x = A.x + (Bq.x - A.x) * e; out.z = A.z + (Bq.z - A.z) * e + side * 0.42 * Math.sin(Math.PI * k);
    out.y = A.h + (Bq.h - A.h) * e + 0.1 * Math.abs(Math.sin(TAU * k * 1.5)) + (Math.abs(A.h - Bq.h) > 0.05 ? 0.35 * Math.sin(Math.PI * k) : 0);
    out.ds = A.ds + (Bq.ds - A.ds) * e; out.walk = k; sl = k < 0.5 ? A : Bq;
    out.sx0 = sl.x; out.sz0 = sl.z; out.h0 = sl.h;
  } else { out.x = sl.x; out.y = sl.h; out.z = sl.z; out.ds = sl.ds; out.walk = -1; out.sx0 = sl.x; out.sz0 = sl.z; out.h0 = sl.h; }
  out.tier = sl.tier; out.row = sl.row; out.col = sl.col; out.gap = sl.gap; out.slot = a >= 0 ? (k < 0.5 ? a : b) : s;
  if (sl.tier && q > CUR_UP) out.x += stepOut(sl, q - CUR_UP, wv);
  return out;
}
// CROWD: a tier >= 1 steps half a slot out to one side on the beat, holds, steps back; the next beat the other side;
// tier 2 runs half a beat behind tier 1 (the row moves as one: nobody bumps)
function stepOut(sl, q, wv) {
  const per = wv.beat, ph = (q + (sl.tier === 2 ? per / 2 : 0)) / per, n = Math.floor(ph), f = (ph - n) * per, o = wv.out;
  const k = f < 0.25 ? sstep(f / 0.25) : f < 0.25 + o ? 1 : f < 0.5 + o ? 1 - sstep((f - 0.25 - o) / 0.25) : 0;
  return (n & 1 ? 1 : -1) * k * sl.gap * 0.55;
}

// =========================================================================================
// HIT TESTS: the duck's own shapes (lattice cells, in its frame), cut by every duck nearer the camera along the ray
// (a duck half hidden in the crowd can only be hit on what shows), the curtain while it is down, the corkboard / shelf.
// =========================================================================================
const SHAPES = [['e', ...BODY], ['e', ...HEAD], ['e', -8.4, 12.2, 0.8, 2.1, 4.9, 3.4], ['e', 8.4, 12.2, 0.8, 2.1, 4.9, 3.4],
  ['b', -5.8, 0, -2, -1.8, 6.6, 4.4], ['b', 1.8, 0, -2, 5.8, 6.6, 4.4], ['e', 0, 20.6, 6.1, 3.8, 1.9, 2.8]];
const HAT_BOX = ['b', -6.8, 26.4, -4.5, 6.8, 33.4, 5.6];
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3(), _bx = new THREE.Box3(), _bv = new THREE.Vector3();
function rayEll(o, d, cx, cy, cz, rx, ry, rz) {
  const ox = (o.x - cx) / rx, oy = (o.y - cy) / ry, oz = (o.z - cz) / rz, dx = d.x / rx, dy = d.y / ry, dz = d.z / rz;
  const A = dx * dx + dy * dy + dz * dz, Bq = 2 * (ox * dx + oy * dy + oz * dz), C = ox * ox + oy * oy + oz * oz - 1, disc = Bq * Bq - 4 * A * C;
  if (disc < 0) return null; const t = (-Bq - Math.sqrt(disc)) / (2 * A); return t > 0 ? t : null;
}
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = 1e9;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let ta = (a - oo) / dd, tb = (b - oo) / dd; if (ta > tb) { const x = ta; ta = tb; tb = x; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
  }
  return t0 > 0 ? t0 : null;
}
// world ray -> nearest t on this duck's shapes (t in world units: the affine map keeps the ray parameter)
function shapeHit(tg, ray) {
  _ro.copy(ray.origin).applyMatrix4(tg.Minv); _rd.copy(ray.origin).add(ray.direction).applyMatrix4(tg.Minv).sub(_ro);
  let best = null;
  const test = s => { const t = s[0] === 'e' ? rayEll(_ro, _rd, s[1], s[2], s[3], s[4], s[5], s[6]) : rayBox(_ro, _rd, s[1], s[2], s[3], s[4], s[5], s[6]); if (t != null && (best == null || t < best)) best = t; };
  for (const s of SHAPES) test(s);
  if (tg.hatOn) test(HAT_BOX);
  return best;
}
function blockedFg(ray, dist) {
  for (const b of OCC) if (ray.intersectBox(b, _bv) && ray.origin.distanceTo(_bv) < dist - 0.05) return true;
  if (SET.curY < CUR_TOP - 0.05 && Math.abs(ray.direction.z) > 1e-6) {
    const t = (CUR_Z - ray.origin.z) / ray.direction.z;
    if (t > 0 && t < dist && ray.origin.y + ray.direction.y * t > SET.curY - 0.1) return true;
  }
  return false;
}
function duckRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable || !tg.vis) return;
  const d = shapeHit(tg, rc.ray); if (d == null) return;
  for (const o of DUCKS) if (o !== tg && o.vis && o.run === tg.run) { const e = shapeHit(o, rc.ray); if (e != null && e < d - 0.03) return; }
  if (blockedFg(rc.ray, d)) return;
  out.push({ distance: d, point: rc.ray.at(d, new THREE.Vector3()), object: this });
}

// =========================================================================================
// HUD: stamps (FAKE! / QUICK EYE! / CAUGHT! / FRIENDLY FIRE! / BREAK FOR IT! / SWAP!), the wave plaque (top centre:
// WAVE n/N, a pip per fake, lit as it is shot, the window running out under it)
// =========================================================================================
const STAMPS = [];
function stamp(text, x, y, rows, sc = 2, secs = 0.9) { STAMPS.push({ text, x: clamp(x, 50, RW - 50), y: clamp(y, 18, RH - 70), rows, sc, t0: performance.now(), secs }); if (STAMPS.length > 6) STAMPS.shift(); }
function drawHud(run, hs, t) {
  const H = B.HUD; if (!H || !run || run.stage !== ID) return;
  const tl = run.timeline, dir = tl[0]; if (!dir || !dir.waves) return;
  const clk = waveClock(tl), now = run.t;
  let w = -1; for (let i = 0; i < clk.length; i++) if (now >= clk[i].S - HOLD - CUR_DN) w = i;
  if (w >= 0 && run.state === 'play') {
    const c = clk[w], wv = dir.waves[w], n = wv.tokens.length, label = 'WAVE ' + (w + 1) + '/' + clk.length;
    const pw = n * 6 - 1, tw = H.text3w(label) + 5 + pw, x0 = 84, y0 = 3;
    H.text3(label, x0, y0, 'bone', 1, 'void');
    for (let k = 0; k < n; k++) {
      const done = now >= c.S && tokenHitT(wv.tokens[k], c.S, tl) != null, px = x0 + H.text3w(label) + 5 + k * 6;
      H.rect(px - 1, y0 - 1, 7, 7, 'void'); H.rect(px, y0, 5, 5, done ? 'lime' : 'navy'); if (!done) H.rect(px + 1, y0 + 1, 3, 3, 'red');
    }
    if (now >= c.S && now < c.E && !c.early) {
      const k = clamp((c.E - now) / wv.W, 0, 1), bw = Math.max(1, Math.round(tw * k));
      H.rect(x0 - 1, y0 + 7, tw + 2, 4, 'void'); H.rect(x0, y0 + 8, bw, 2, k > 0.5 ? 'lime' : k > 0.25 ? 'amber' : (((t * 8) | 0) & 1 ? 'red' : 'coral'));
    }
  }
  const pn = performance.now();
  for (let i = STAMPS.length - 1; i >= 0; i--) {
    const s = STAMPS[i], q = (pn - s.t0) / (s.secs * 1000);
    if (q >= 1) { STAMPS.splice(i, 1); continue; }
    if (q > 0.7 && ((pn / 60) | 0) & 1) continue;
    H.text7c(s.text, s.x, Math.round(s.y - 6 * q), s.sc, s.rows, 'void', 2);
  }
}

// =========================================================================================
// THE DUCK (kind 'target' while it carries a tell, else 'bystander'). One spawn per duck per wave.
// =========================================================================================
const DUCKS = new Set();
const _pp = {}, _cv = new THREE.Vector3();
const NERV_K = { glance: 1, sweat: 1.7, gulp: 1 };
class Duck extends T.Target {
  constructor(sp, run) {
    super('bystander');
    this.sp = sp; this.run = run; this.idx = -1; this.P = {}; this.q = -1; this.ffd = false; this.ffQ = 0; this.gone = false; this.said = {}; this.card = -1; this.vis = false;
    this.M = new THREE.Matrix4(); this.Minv = new THREE.Matrix4(); this.hatOn = true; this.base = lookOf(sp);
    this.proxy = new THREE.Mesh(NOHIT_GEO, NOHIT_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this; this.proxy.raycast = duckRaycast;
    this.group.add(this.proxy); this.group.visible = false;
    DUCKS.add(this);
  }
  meshes() { return [this.proxy]; }
  hide() { this.vis = false; this.group.visible = false; this.shootable = false; if (this.idx >= 0) { freeIdx(this.idx); this.idx = -1; } if (this.card >= 0) SET.cards[this.card].visible = false; }
  update(lt, run) {
    this.run = run;
    const sp = this.sp, tl = run.timeline, clk = waveClock(tl), C = clk[sp.w], wv = tl[0].waves[sp.w], q = run.t - C.S; this.q = q;
    const last = sp.w === clk.length - 1, fin = last ? FIN.get(run) : null, qD = C.D - C.S, qB = CUR_UP + wv.W;
    const qEnd = qD + CUR_DN + (fin != null ? FIN_HOLD : 0) + 0.05;
    if (q < 0) { this.hide(); return false; }
    if (q >= qEnd) { this.hide(); return true; }
    const P = this.P, look = Object.assign(this.look || (this.look = {}), this.base);
    placeAt(sp, wv, q, P);
    P.yaw = 0; P.pitch = 0; P.roll = 0.025 * Math.sin(q * 1.3 + sp.ph * 9); P.sx = 1; P.sy = 1 + 0.018 * Math.sin(q * 2.4 + sp.ph * 6.3); P.flat = 1;
    P.hy = 0; P.hp = 0; P.hr = 0; P.pdx = 0; P.pdy = 0; P.wl = 0.12; P.wr = 0.12; P.bl = P.bl || [0, 0]; P.br = P.br || [0, 0]; P.bl[0] = P.bl[1] = P.br[0] = P.br[1] = 0;
    P.sweat = -1; P.dizzy = 0; P.items = {}; P.hatLift = 0; P.hatTilt = 0;
    { const per = 2.6 + 2.2 * sp.ph, f = (q + sp.ph * 7) % per; P.blink = f < 0.11 ? 0.92 : 0; }
    if (P.walk >= 0) { const ph = P.walk * TAU * 2; P.bl[0] = Math.max(0, Math.sin(ph)) * 1.4; P.br[0] = Math.max(0, -Math.sin(ph)) * 1.4; P.bl[1] = Math.sin(ph) * 1.5; P.br[1] = -Math.sin(ph) * 1.5; P.wl = P.wr = 0.3 + 0.2 * Math.sin(ph * 2); }
    // the tells this duck carries / hands over
    let carrier = null, inHand = false, running = -1;
    for (const ti of sp.tok) {
      const tk = wv.tokens[ti], on = swapOn(tk, C.S, tl), car = carrierAt(tk, q, C.S, tl, on);
      if (car === sp.id) carrier = tk;
      const meA = tk.a === sp.id;
      // the runner: still carrying it when the window ran out
      if (this.alive && q >= qB && carrierAt(tk, qB, C.S, tl, on) === sp.id && !C.early) running = q - qB;
      // NERVOUS: the carrier gives itself away for a beat (only while the window is open)
      if (this.alive && q < qB) for (const [qe, kind] of tk.nerv) {
        const dur = wv.nd * NERV_K[kind], k = q - qe; if (k < 0 || k > dur || carrierAt(tk, qe, C.S, tl, on) !== sp.id) continue;
        if (!this.said['n' + qe]) { this.said['n' + qe] = 1; B.SFX.play('tellGlance', { u: uOfX(scr(P.x, P.y + 1, P.z)[0]), kind }); }
        const e = Math.sin(Math.PI * k / dur), sd = hash1(sp.id * 7 + Math.round(qe * 10)) < 0.5 ? -1 : 1;
        if (kind === 'glance') { P.hy += sd * 0.55 * e; P.pdx = sd * (e > 0.25 ? 1 : 0); P.hp -= 0.06 * e; }
        else if (kind === 'sweat') { P.sweat = k / dur; P.hr += 0.05 * Math.sin(k * 40) * e; P.pdy = e > 0.3 ? 1 : 0; }
        else { P.sy *= 1 - 0.09 * Math.sin(TAU * k / dur); P.hp += 0.2 * e; P.blink = e > 0.4 ? 0.6 : P.blink; }
      }
      // THE SWAP: the whistle, both look at each other, the hand-over (the giver's item flies to the partner's head)
      if (on && q >= tk.qs - SWAP_TEL && q < tk.qs + HAND && this.alive) {
        const ps = tl[meA ? tk.b : tk.a], pP = placeAt(ps, wv, q, _pp), dirx = pP.x > P.x ? 1 : -1;
        if (meA && !this.said['w' + ti]) { this.said['w' + ti] = 1; B.SFX.play('swapWhistle', { u: uOfX(scr(P.x, P.y + 1.4, P.z)[0]) }); }
        if (q < tk.qs) { const e = sstep((q - tk.qs + SWAP_TEL) / 0.25); P.hy += dirx * 0.45 * e; P.pdx = dirx; }
        else {
          inHand = true;
          const e = (q - tk.qs) / HAND, s = Math.sin(Math.PI * e);
          P.roll += -dirx * 0.12 * s; P.hy += dirx * 0.3 * s; if (dirx > 0) P.wr = 0.12 + 1.9 * s; else P.wl = 0.12 + 1.9 * s;
          const mine = this.base[tk.cat], part = PART_OF[tk.cat](mine), k = sstep((e - 0.1) / 0.78);
          if (!this.said['s' + ti] && meA) { this.said['s' + ti] = 1; const p = scr(P.x, P.y + 1.9, P.z); stamp('SWAP!', p[0], p[1] - 10, 'gold', 1, 0.7); }
          pP.yaw = 0; pP.pitch = 0; pP.roll = dirx * 0.12 * s; pP.sy = 1; pP.hy = -dirx * 0.3 * s; pP.hp = 0; pP.hr = 0;
          if (part) P.items[tk.cat] = { name: part, M: flightM(P, pP, k, tk.cat === 'hat' ? HAT_A : GL_A, meA ? 0.55 : 0.9, meA ? 0.6 : -0.6, new THREE.Matrix4()) };
          look[tk.cat] = 'none';
          if (e > 0.88) { look[tk.cat] = lookOf(ps)[tk.cat]; delete P.items[tk.cat]; }
        }
      } else if (on && q >= tk.qs + HAND) look[tk.cat] = lookOf(tl[meA ? tk.b : tk.a])[tk.cat];
    }
    this.kind = carrier && this.alive ? 'target' : 'bystander';
    // THE BREAK: the runners hop down to the floor in front and scramble off to the nearer side in a puff of feathers
    if (running >= 0) {
      const r = running, side = this.runSide != null ? this.runSide : (this.runSide = P.sx0 >= 0 ? 1 : -1);
      if (!this.said.run) { this.said.run = 1; B.SFX.play('fakeRun', { u: uOfX(scr(P.x, P.y + 1, P.z)[0]) }); this.feathers(16); }
      const h = clamp(r / RUN_HOP, 0, 1), x0 = P.x, y0 = P.y, z0 = P.z;
      P.z = z0 + (0.35 - z0) * sstep(h); P.y = y0 * (1 - h) + 0.5 * Math.sin(Math.PI * h) * (h < 1 ? 1 : 0);
      P.x = x0 + side * Math.max(0, r - RUN_HOP) * RUN_V;
      const ph = r * 26; P.bl[0] = Math.max(0, Math.sin(ph)) * 2.6; P.br[0] = Math.max(0, -Math.sin(ph)) * 2.6; P.bl[1] = Math.sin(ph) * 2.6; P.br[1] = -Math.sin(ph) * 2.6;
      P.wl = P.wr = 0.9 + 0.7 * Math.sin(r * 34); P.yaw = side * 0.45 * h; P.roll = -side * 0.18 * h; P.hy = side * 0.3; P.pdx = side;
      P.sweat = (r * 2.2) % 1; P.hatLift = 1.5 * Math.abs(Math.sin(r * 20));
      if (r > RUN_GONE) { this.vis = false; }
    }
    // FRIENDLY FIRE: the real one wobbles, stars round his head, hat askew, and stays in line (can't be shot again)
    if (this.ffd) {
      const k = q - this.ffQ, dk = Math.exp(-k * 2.2);
      P.roll += 0.25 * Math.sin(k * 14) * dk + 0.06 * Math.sin(k * 3); P.hr += 0.12 * Math.sin(k * 5); P.y += 0.18 * Math.max(0, Math.sin(Math.min(k, 0.4) / 0.4 * Math.PI));
      P.dizzy = 1; P.dizzyA = k * 5; P.blink = Math.max(P.blink, 0.5); P.hatTilt = 0.28; P.hatLift = 0.6; P.pdy = 0;
    }
    // THE FINALE: the cast holds up B. L. A. M. and hops on the beat; the other real ones wave
    if (fin != null && q >= qD && !this.gone) {
      const fk = run.t - fin, beat = Math.max(0, Math.sin(fk * TAU * 1.6)), hop = beat > 0.7 ? (beat - 0.7) / 0.3 : 0;
      if (this.card >= 0) { P.wl = P.wr = 2.5; P.y += 0.16 * hop; P.hp = -0.08; }
      else if (!this.ffd && this.alive) { const wv2 = Math.sin(fk * 9 + sp.ph * 5); if (sp.ph < 0.5) P.wr = 1.6 + 0.6 * wv2; else P.wl = 1.6 + 0.6 * wv2; P.y += 0.08 * hop; }
    }
    // visible / shootable
    const runGone = running >= 0 && running > RUN_GONE;
    this.vis = !this.gone && !runGone;
    this.group.visible = this.vis;
    this.hatOn = look.hat !== 'none' && !P.items.hat;
    this.shootable = this.vis && this.alive && q >= READY_Q && q < qD && !inHand && (running < 0 || running < RUN_SHOOT);
    // draw
    if (this.idx < 0) { this.idx = allocIdx(); if (this.idx < 0) return false; }
    if (this.vis) {
      drawDuck(this.idx, P, look);
      _e.set(P.pitch, P.yaw, P.roll, 'YXZ'); _q.setFromEuler(_e);
      this.M.compose(_p.set(P.x, P.y, P.z), _q, _s.set(P.ds * S * P.sx, P.ds * S * P.sy, P.ds * S)); this.Minv.copy(this.M).invert();
      this.group.position.set(P.x, P.y + 0.8 * P.ds, P.z);
    } else offAll(this.idx);
    drawCrates(this.idx, P.sx0, P.sz0, P.h0, P.ds);
    if (this.card >= 0) {
      const cm = SET.cards[this.card]; cm.visible = this.vis;
      cm.position.set(P.x, P.y + (33 * S + 0.55) * P.ds, P.z + 0.45 * P.ds); cm.rotation.set(-0.08, 0, P.roll); cm.scale.setScalar(P.ds);
    }
    return false;
  }
  feathers(n, p) {
    const P = this.P, c = p || _cv.set(P.x, P.y + 0.85 * P.ds, P.z);
    for (let k = 0; k < n; k++) T.spawnChip(c, _v.set(rnd(-2.2, 2.2), rnd(0.4, 2.6), rnd(-0.6, 1.8)), rnd(0.035, 0.07), PAL[['bone', 'lemon', 'yellow', 'mist'][k % 4]], rnd(0.8, 1.5), 0.12);
  }
  // a FAKE shot: a burst of yellow chips and feathers, its tell flies off (the duck is gone; its riser stays)
  shatter(point, opts) {
    if (!this.alive) return;
    const P = this.P, sp = this.sp;
    this.alive = false; this.shootable = false; this.gone = true;
    this.Mc = this.Mc || new THREE.Matrix4(); this.Mc.copy(this.M);
    for (const [x, y, z, col] of ART.chips) {
      _v.set(x, y, z).applyMatrix4(this.Mc); _cv.copy(_v).sub(point || _v).setZ(0);
      if (_cv.lengthSq() < 1e-6) _cv.set(rnd(-1, 1), 1, 0);
      _cv.normalize().multiplyScalar(rnd(1.2, 3.2)); _cv.y += rnd(1, 3); _cv.z += rnd(0.4, 2.2);
      T.spawnChip(_v, _cv, rnd(0.05, 0.08) * P.ds, opts && opts.tint != null && Math.random() < 0.4 ? opts.tint : col, rnd(0.9, 1.6));
    }
    this.feathers(22, point);
    const sc = point ? R.toPx(point) : scr(P.x, P.y + 1, P.z);
    const runner = this.q >= CUR_UP + this.run.timeline[0].waves[sp.w].W;
    stamp(runner ? 'CAUGHT!' : 'FAKE!', sc[0], sc[1] - 22, 'gold', 1, 0.8);
    if (!runner && QUICK.get(sp)) stamp('QUICK EYE!', sc[0], sc[1] - 34, 'gold', 1, 0.9);
    B.SFX.play('fakePop', { u: uOfX(sc[0]) });
    if (this.idx >= 0) offAll(this.idx);
  }
  // a REAL one shot (Run.penaltyNow -> explode): FRIENDLY FIRE!, the HUD duck fumes; he stays in line, dazed
  explode(point) {
    if (!this.alive) return;
    this.alive = false; this.shootable = false; this.ffd = true; this.ffQ = this.q; FF.set(this.sp, this.run ? this.run.t : 0); VER++;
    this.feathers(10, point);
    stamp('FRIENDLY FIRE!', RW / 2, 60, 'red', 2, 1.1);
    const G = B.G; if (G && G.duckReact && this.run && !this.run.versus) { G.duckReact('angry', 1.4); B.SFX.play('duckAngry'); }
  }
  dispose() { this.hide(); DUCKS.delete(this); super.dispose(); }
}

// ---------- THE DIRECTOR (kind 'fx', t0 0): the curtain, its sounds, the finale; holds the stage ----------
class Director extends T.Target {
  constructor(sp, run) {
    super('fx'); this.sp = sp; this.run = run; this.said = {}; this.shootable = false; this.fin = -1;
    STAMPS.length = 0; SET.curY = 0; if (SET.curtain) SET.curtain.position.y = 0; for (const c of SET.cards) c.visible = false;
    if (PREV.length) preview(0);                               // a dev showcase left standing goes
  }
  meshes() { return []; }
  update(lt, run) {
    const tl = run.timeline, clk = waveClock(tl), t = run.t, n = clk.length, lastW = clk[n - 1];
    let fin = FIN.get(run);
    if (fin == null && t >= lastW.D && run.state === 'play' && (run.versus || run.quotaMet)) { FIN.set(run, fin = lastW.D); this.startFinale(run); }
    const up = curtainAt(clk, t, fin);
    SET.curY = up * CUR_TOP; if (SET.curtain) SET.curtain.position.y = SET.curY;
    for (let w = 0; w < n; w++) {
      const c = clk[w], D = c.D + (w === n - 1 && fin != null ? FIN_HOLD : 0);
      this.once('u' + w, t >= c.S && t < c.S + 0.5, () => B.SFX.play('curtain', { up: 1 }));
      this.once('d' + w, t >= D && t < D + 0.5, () => B.SFX.play('curtain', { up: 0 }));
      if (w < n - 1) this.once('s' + w, t >= D + CUR_DN && t < D + CUR_DN + 0.5, () => B.SFX.play('lineupShuffle'));
      if (!c.early) this.once('b' + w, t >= c.E && t < c.E + 0.3, () => {
        const wv = tl[0].waves[w]; if (wv.tokens.some(tk => tokenHitT(tk, c.S, tl) == null)) stamp('BREAK FOR IT!', RW / 2, 54, 'red', 2, 1.0);
      });
    }
    const endT = lastW.D + CUR_DN + (fin != null ? FIN_HOLD : 0) + 0.15;
    pack();                                                    // the director updates last in a frame: every duck has drawn
    return t >= endT;
  }
  once(k, cond, fn) { if (cond && !this.said[k]) { this.said[k] = 1; fn(); } }
  // the last wave's real ducks still standing: the four nearest the middle hold up B. L. A. M. (left to right)
  startFinale(run) {
    const w = run.timeline[0].waves.length - 1, cast = [...DUCKS].filter(d => d.run === run && d.sp.w === w && d.alive && !d.ffd && d.kind === 'bystander' && d.vis);
    // one row if it can (the front-most row with four standing), four neighbours nearest the middle, left to right on screen
    const sx = d => scr(d.P.x, d.P.y + 1, d.P.z)[0], rows = {};
    for (const d of cast) (rows[d.P.row + '|' + d.P.tier] = rows[d.P.row + '|' + d.P.tier] || []).push(d);
    let pool = cast;
    const full = Object.values(rows).filter(r => r.length >= 4).sort((a, b) => b[0].P.z - a[0].P.z);
    if (full.length && run.timeline[0].waves[w].lay !== 'V') pool = full[0];   // the V: the four nearest its point
    pool.sort((a, b) => sx(a) - sx(b));
    let best = 0, bd = 1e9; for (let i = 0; i + 4 <= pool.length; i++) { const m = (sx(pool[i]) + sx(pool[i + 3])) / 2; if (Math.abs(m - RW / 2) < bd) { bd = Math.abs(m - RW / 2); best = i; } }
    const four = pool.slice(best, best + 4);
    four.forEach((d, k) => { d.card = k; });
    B.SFX.play('cardsUp'); B.SFX.play('finale');
    const G = B.G; if (G && G.duckReact) { G.duckReact('cheer', 3.6); B.SFX.play('duckHappy'); }
  }
  dispose() { SET.curY = 0; if (SET.curtain) SET.curtain.position.y = 0; for (const c of SET.cards) c.visible = false; pack(); super.dispose(); }
}
function makeTarget(sp, run) { return sp.kind === 'dir' ? new Director(sp, run) : new Duck(sp, run); }

// =========================================================================================
// The dials per tier (variant 0). n = ducks in the lineup | waves | fk = fakes per wave [min, max] | win = the wave window
// s (CROWD +crowdX) | lv = the tells' level weights [obvious, medium, subtle] | tw = tell type weights [hat, glasses,
// stache, badge, boots, bill, tail] | swapP = a wave has THE SWAP | nerv = s between a fake's nervous tells [min, max] /
// nd = how long one lasts | beat / out = the CROWD's step-out cycle / hold s | place = s between SHUFFLE's place trades |
// share = the quota's share of the fakes | rel = reload reach (magazine variants; for the record)
// =========================================================================================
const TIER_P = [
  { n: 12, waves: 5, fk: [2, 3], win: 13.0, crowdX: 1.5, lv: [0.72, 0.24, 0.04], tw: [3, 3, 2.4, 1, 1, 1, 1], swapP: 0.4, nerv: [2.2, 3.2], nd: 0.62, beat: 2.8, out: 1.3, place: 3.0, share: 0.55, rel: 0.75 },
  { n: 12, waves: 5, fk: [3, 3], win: 11.0, crowdX: 1.5, lv: [0.45, 0.4, 0.15], tw: [2.4, 2, 2, 1.5, 1.5, 1.5, 1.5], swapP: 0.55, nerv: [2.6, 3.8], nd: 0.52, beat: 2.5, out: 1.15, place: 2.6, share: 0.6, rel: 0.7 },
  { n: 16, waves: 6, fk: [3, 4], win: 10.0, crowdX: 1.5, lv: [0.2, 0.45, 0.35], tw: [1.5, 1.2, 1.2, 2, 2, 2, 2], swapP: 0.7, nerv: [3.2, 4.6], nd: 0.44, beat: 2.2, out: 1.0, place: 2.2, share: 0.64, rel: 0.62 },
  { n: 20, waves: 6, fk: [4, 5], win: 9.4, crowdX: 1.5, lv: [0.06, 0.36, 0.58], tw: [1, 0.8, 0.8, 2.2, 2.2, 2.2, 2.2], swapP: 0.9, nerv: [3.8, 5.6], nd: 0.36, beat: 1.9, out: 0.85, place: 1.9, share: 0.68, rel: 0.55 }
];
const VARIANT_NAMES = ['LINEUP', 'CROWD', 'SHUFFLE'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = JSON.parse(JSON.stringify(b));
  c.n = v === 1 ? 20 : b.n;
  c.share = Math.min(0.9, b.share + 0.02 * v);
  c.shuffle = v === 2;                                           // SHUFFLE: place trades all wave + 2-3 swaps a wave
  c.ammo = ['unlimited', { mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: false }][v];
  c.nervous = true; c.swaps = true; c.runners = true; c.crowd = true;   // every mechanic at every tier
  c.tier = tier; c.variant = v; c.title = 'DOPPELDUCKS'; c.subtitle = VARIANT_NAMES[v];
  c.quota = 4; c.time = 60;                                      // placeholders: timeline() derives them
  return c;
}
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
const LAY_W = {
  12: { LINE: 1.2, ROWS: 1, V: 1, CROWD: 1 },
  16: { ROWS: 1, STAIRS: 1, CROWD: 1 },
  20: { ROWS: 1, STAIRS: 1, CROWD: 1 }
};
// neighbours in a layout (the same row, next column; the V's point pair)
function neighbours(SL, s) {
  const a = SL[s], o = [];
  SL.forEach((b, j) => { if (j !== s && b.row === a.row && Math.abs(b.col - a.col) === 1) o.push(j); });
  if (a.tier === 0 && SL.length && !SL.some(q => q.tier) && a.col === 0 && SL.some(q => q.row === 1 && q.z === a.z && q !== a)) {
    const j = SL.findIndex(q => q.row !== a.row && q.col === 0 && Math.abs(q.z - a.z) < 1e-6); if (j >= 0 && !o.includes(j)) o.push(j);
  }
  return o;
}

// ---------- timeline: every wave, every duck, every tell, swap, trade and nervous tell from the seeded rng only ----------
function timeline(c, rng) {
  const out = [], dir = { id: 0, t0: 0, t1: 0, kind: 'dir', waves: [] };
  out.push(dir);
  const n = c.n, LW = LAY_W[n], lays = Object.keys(LW), typeUsed = {}, lvN = [0, 0, 0], typeN = {};
  for (const k of CATS) typeN[k] = 0;
  let Smin = START, Smax = START, lastLay = '', crowdDone = false, nSwaps = 0, nMoves = 0, nNerv = 0, hidden = 0;
  for (let w = 0; w < c.waves; w++) {
    // the layout: never the same twice in a row; a CROWD at least once; LINE (12) opens LINEUP
    let lay;
    if (w === 0 && n === 12 && c.variant === 0) lay = 'LINE';
    else if (!crowdDone && w === c.waves - 2 && lastLay !== 'CROWD') lay = 'CROWD';
    else { const cand = lays.filter(l => l !== lastLay), wts = cand.map(l => LW[l] * (c.variant === 1 && l === 'CROWD' ? 2 : 1) * (l === 'LINE' ? 0.6 : 1)); lay = cand[pickW(wts, rng())]; }
    if (lay === 'CROWD') crowdDone = true;
    lastLay = lay;
    const SL = slotsOf(n, lay), W = F3(c.win + (lay === 'CROWD' ? c.crowdX : 0));
    const wv = { lay, n, W, tokens: [], moves: [], beat: c.beat, out: c.out, nd: c.nd, first: out.length };
    // the ducks: slot i -> a duck; pick the fakes (spread out: at most two in a row of neighbours)
    const nf = rng.int(c.fk[0], c.fk[1]), fakes = [];
    for (let g = 0; fakes.length < nf && g < 200; g++) {
      const s = Math.floor(rng() * SL.length); if (fakes.includes(s)) continue;
      const nb = neighbours(SL, s).filter(j => fakes.includes(j)); if (nb.length > 1 && g < 150) continue;
      fakes.push(s);
    }
    // swaps this wave (SHUFFLE: 2-3), the first fakes then wear a hat / glasses tell so the swap has something to hand over
    const swapsWanted = c.shuffle ? rng.int(2, 3) : (rng() < c.swapP ? 1 : 0), forced = Math.min(swapsWanted, Math.max(1, nf - 2)), forcedMin = c.shuffle ? Math.min(2, Math.max(1, c.fk[0] - 2)) : 0;
    const ducks = SL.map((sl, s) => ({ id: out.length + s, t0: F3(Smin), t1: 0, kind: 'duck', w, slot: s, lk: {}, tok: [], ph: F3(rng()) }));
    const remainingW = c.waves - w;
    fakes.forEach((s, f) => {
      // the tell's type: by the tier's weights, repeats in a wave discouraged, every type used in the round (late waves
      // pick the unused types first)
      let type;
      const unused = CATS.filter(k => !typeUsed[k]);
      const capLeft = (nf - f) + (remainingW - 1) * Math.max(1, c.fk[0] - forcedMin);
      if (f < forced && !(unused.length >= capLeft)) type = rng() < c.tw[0] / (c.tw[0] + c.tw[1]) ? 'hat' : 'glasses';
      else if (unused.length && (unused.length >= capLeft - (f < forced ? 0 : 1) || rng() < 0.35)) type = unused[Math.floor(rng() * unused.length)];
      else { const inWave = wv.tokens.map(tk => tk.cat); type = CATS[pickW(CATS.map((k, i) => c.tw[i] * (inWave.includes(k) ? 0.25 : 1)), rng())]; }
      typeUsed[type] = 1; typeN[type]++;
      const lvl = pickW(c.lv, rng()) + 1, opts = TELLS[type].filter(t => t[1] === lvl), pick = (opts.length ? opts : TELLS[type])[Math.floor(rng() * (opts.length || TELLS[type].length))];
      lvN[pick[1] - 1]++;
      ducks[s].lk[type] = pick[0];
      ducks[s].tok.push(wv.tokens.length);
      if (lay === 'CROWD' && SL[s].tier && !HEAD_CATS[type]) hidden++;
      wv.tokens.push({ a: ducks[s].id, b: -1, cat: type, qs: -1, lvl: pick[1], nerv: [] });
    });
    // SHUFFLE: place trades on a grid through the wave (neighbours trade places; one pair at a time)
    const occ0 = SL.map((sl, s) => s), busy = [];               // occ0[slot] = duck index; busy = [duck, q0, q1]
    const occAt = q => { const o = occ0.slice(); for (const mv of wv.moves) if (mv.q + PLACE_T <= q) { const da = o[mv.sa]; o[mv.sa] = o[mv.sb]; o[mv.sb] = da; } return o; };
    const isBusy = (d, a, b) => busy.some(([x, q0, q1]) => x === d && a < q1 && q0 < b);
    if (c.shuffle) {
      for (let q = CUR_UP + 1.0 + rng.range(0, 0.6); q < CUR_UP + W - 1.6; q += c.place * rng.range(0.8, 1.2)) {
        const o = occAt(q), s = Math.floor(rng() * SL.length), nb = neighbours(SL, s); if (!nb.length) continue;
        const s2 = nb[Math.floor(rng() * nb.length)], da = o[s], db = o[s2];
        wv.moves.push({ q: F3(q), a: ducks[da].id, b: ducks[db].id, sa: s, sb: s2 }); busy.push([da, q, q + PLACE_T], [db, q, q + PLACE_T]); nMoves++;
      }
    }
    // THE SWAP: a hat / glasses fake and a real neighbour (at that moment), whistle SWAP_TEL before, hand-over HAND long
    const swapTk = wv.tokens.filter(tk => tk.cat === 'hat' || tk.cat === 'glasses');
    let qNext = CUR_UP + 2.2 + rng.range(0, 1.0);
    for (const tk of swapTk.slice(0, swapsWanted)) {
      for (let g = 0; g < 12; g++) {
        const qs = F3(qNext + g * 0.35); if (qs > CUR_UP + W - HAND - 1.4) break;
        const o = occAt(qs - SWAP_TEL), da = tk.a - wv.first, sa = o.indexOf(da);
        if (isBusy(da, qs - SWAP_TEL - 0.1, qs + HAND + 0.1)) continue;
        const cand = neighbours(SL, sa).map(j => o[j]).filter(db => !ducks[db].tok.length && !isBusy(db, qs - SWAP_TEL - 0.1, qs + HAND + 0.1));
        if (!cand.length) continue;
        const db = cand[Math.floor(rng() * cand.length)];
        tk.b = ducks[db].id; tk.qs = qs; ducks[db].tok.push(wv.tokens.indexOf(tk));
        busy.push([da, qs - SWAP_TEL, qs + HAND], [db, qs - SWAP_TEL, qs + HAND]); nSwaps++;
        qNext = qs + HAND + SWAP_TEL + 0.8 + rng.range(0, 1.2);
        break;
      }
    }
    // NERVOUS tells: each fake's schedule (whoever carries the tell then shows it; none during a hand-over)
    for (const tk of wv.tokens) {
      for (let q = CUR_UP + rng.range(0.6, 1.5); q < CUR_UP + W - 0.4; q += rng.range(c.nerv[0], c.nerv[1])) {
        if (tk.qs >= 0 && q > tk.qs - SWAP_TEL - 0.9 && q < tk.qs + HAND + 0.2) continue;
        tk.nerv.push([F3(q), ['glance', 'sweat', 'gulp'][Math.floor(rng() * 3)]]); nNerv++;
      }
    }
    // the wave's spawns: created at the earliest possible start (invisible until the curtain rises), t1 = the latest end
    const last = w === c.waves - 1, t1 = F3(Smax + CUR_UP + W + BRK + CUR_DN + 0.1 + (last ? FIN_HOLD : 0));
    for (const d of ducks) { d.t1 = t1; out.push(d); }
    dir.waves.push(wv);
    Smin += CUR_UP + MINW + CUR_DN + HOLD; Smax += CUR_UP + W + BRK + CUR_DN + HOLD;
    dir.last = F3(Smax - HOLD - CUR_DN);
  }
  dir.t1 = F3(Smax - HOLD + FIN_HOLD + 0.3);
  for (const s of out) TLOF.set(s, out);
  const fakes = dir.waves.reduce((a, wv) => a + wv.tokens.length, 0);
  c.fakeCount = fakes; c.typeN = typeN; c.lvN = lvN; c.swapN = nSwaps; c.moveN = nMoves; c.nervN = nNerv; c.hiddenN = hidden;
  c.layouts = dir.waves.map(wv => wv.lay).join(' ');
  c.quota = Math.max(3, Math.round(fakes * c.share));
  c.time = Math.ceil(dir.t1 + FIN_SLOT);
  return out;
}
// points: a fake 300 (+100 QUICK EYE within 1 s of the curtain), a runner 100. Records the hit's stage time (shared: only
// Run.applyHit calls this) for the wave clock, the swaps and the runners.
function points(sp, lt) {
  if (sp.kind !== 'duck') return 0;
  const tl = TLOF.get(sp); if (!tl) return 0;
  const C = waveClock(tl)[sp.w], wv = tl[0].waves[sp.w], st = sp.t0 + lt, q = st - C.S;
  let pts = 0;
  for (const ti of sp.tok) {
    const tk = wv.tokens[ti]; if (carrierAt(tk, q, C.S, tl) !== sp.id) continue;
    if (q >= CUR_UP + wv.W) pts = PTS_RUN;
    else { const quick = q - CUR_UP < QUICK_T; QUICK.set(sp, quick); pts = PTS_FAKE + (quick ? PTS_QUICK : 0); }
    break;
  }
  HIT.set(sp, st); VER++;
  return pts;
}
function briefing(c) {
  const HINTS = ['LOOK FOR THE HAT. LOOK FOR THE SHADES!', 'WATCH THEM SWEAT. FAKES GET NERVOUS!', 'THE BADGE, THE BOOTS, THE BILL, THE TAIL...', 'ONE THING IS OFF. EVERY TIME!'];
  return { rule: [['SHOOT THE ', 'void'], [c.quota + ' FAKES', 'red'], ['!', 'void']], icon: 'doppel', unit: 'FAKES', dont: 'deputy',
    tip: 'CHECK THE POSTER. ONE THING IS OFF!', hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}
// ---------- briefing card icons: a deputy duck with a question mark; the REAL deputy's face (don't shoot) ----------
const FACE = ['....CCCCCC....', '...CCCSSCCC...', '...WWWWWWWW...', 'BBBBBBBBBBBBBB', '..YYYYYYYYYY..', '.YYEEYYYYEEYY.', '.YYEPYYYYEPYY.', '.YYYYYYYYYYYY.',
  '.YOOOOOOOOOOY.', '.YYOOOOOOOOYY.', '..YYYYYYYYYY..', '...AAAAAAAA...'];
const FACE_KEY = { C: 'chestnut', S: 'yellow', W: 'walnut', B: 'chestnut', Y: 'yellow', E: 'bone', P: 'void', O: 'orange', A: 'amber' };
function drawIcon(cx, cy, r, t = 0) {
  const sc = Math.max(1, Math.round(2 * r / 16)), H = B.HUD, f = ((t * 3) | 0) & 1;
  H.sprite(FACE, cx - 9 * sc, cy - 6 * sc, sc, f ? FACE_KEY : Object.assign({}, FACE_KEY, { P: 'bone', E: 'void' }), 'ddFace' + f);
  H.text7('?', cx + 4 * sc, cy - 8 * sc, Math.max(1, sc - (sc > 1 ? 1 : 0)), 'red', 'void', 1);
}
function drawDont(cx, cy, r) {
  const sc = Math.max(1, Math.round(2 * r / 14));
  B.HUD.sprite(FACE, cx - 7 * sc, cy - 6 * sc, sc, FACE_KEY, 'ddReal');
}
// the miss ricochet colours for this stage (core/fx.js reads B.FX.ricochetColors[stageId]): plaster dust off the chart wall
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors[ID] = { hot: ['bone', 'mist', 'lemon'], flakes: ['mist', 'haze', 'bone', 'steel'], pop: 'bone', speed: 0.8, grav: 0.9 };
// the office bed lives in sfx-stage.js (K.stageBeds); hook it into the ambience beds (sfx-music.js owns K.beds)
{ const K = B.SFXKit; if (K && K.beds && K.stageBeds && K.stageBeds.lineup && !K.beds.doppelducks) K.beds.doppelducks = K.stageBeds.lineup; }
B.Stage.register({ id: ID, name: 'DOPPELDUCKS', short: 'DUCKS', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon, drawDont, drawHud,
  preview, layoutSlots, slotsOf, placeAt, waveClock, tokenHitT, carrierAt, swapOn, curtainAt, lookOf, TELLS, REAL, CATS, HEAD_CATS, TIER_P, scr, PART, SET, DUCKS, HIT, FF, FIN,
  K: { START, CUR_UP, CUR_DN, HOLD, BRK, MINW, CLEAR_LAG, READY_Q, QUICK_T, RUN_SHOOT, RUN_HOP, RUN_GONE, SWAP_TEL, HAND, PLACE_T, FIN_HOLD } });
})(window.BLAM);
