'use strict';
/* =========================================================================================
   B.L.A.M. stages/moles.js -- Stage 14: MOLE HOLES (DESIGN-STAGES.md section 14, Fable; Jon answered 2026-11-01).
   SIMPLE on purpose: whack-a-mole with a gun. One mechanic, three variants that differ in AMMO ONLY.
   THE SET: a sunny backyard lawn that rises gently to a white picket fence (the engine's fixed camera), mowed in
   stripes, a GRID of 3 rows x 4 MOLE HOLES (dirt mounds round a dark pit; the far row smaller), a red shed on a stone
   footing with the "B.L.A.M." / "LAWN CARE" sign on its roof, a garden gnome, an impulse SPRINKLER ticking in the far
   corner (its jet sweeps, steps and swings back), flower beds, butterflies, round trees and a neighbour's roof over the
   fence, a blue sky with drifting clouds and the sun.
   THE MECHANIC: MOLES pop up out of the holes (a dirt puff, molePop), hold for the tier's window, look about and duck
   back down (moleDown). Shot: it spins and flops with stars round its head (moleBonk), +100, +50 QUICK WHACK if shot
   within 0.5 s of its pop. REGULAR IRON BOMBS (BLAM.Props.bomb, fuse lit, bombUp) pop up out of the same holes on the
   same timing and sink back down: the don't-shoot, LIFE -1, -300 through the engine's bomb path (kind 'bomb'); a bomb
   that sinks unshot costs nothing. Nothing else comes out of the holes.
   PATTERNS (plain moles, cheap and instantly read): a ROW of three on a beat, a DIAGONAL, a COLUMN.
   FINALE (quota met): four moles come up together in the front row holding cards that spell B. L. A. M. and bob.
   Every pop, its hole, its timing and the finale are pure functions of (seed, tier, variant) and the stage clock;
   awards go through the engine's hit record (run.applyHit / run.taken) -> versus-safe.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets;
const clamp = E.clamp, ID = 'moles', RW = R.RW, RH = R.RH;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH), FPX = (RH / 2) / R.TAN_H;
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const H32 = (i, j) => hash1(Math.imul(i | 0, 73856093) ^ Math.imul(j | 0, 19349663));
const inPlay = () => !!(B.G && B.G.screenName === 'play');
const lerp = (a, b, k) => a + (b - a) * k;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const r3 = x => +x.toFixed(3);
const shared = (g, m) => { const x = new THREE.Mesh(g, m); x.userData.sharedGeo = true; return x; };
const noRay = m => { m.raycast = () => {}; return m; };
// world -> game px [x, y, px per world unit, view depth] (the steady camera)
function scr(x, y, z) {
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = FPX / Math.max(0.1, d);
  return [RW / 2 + vx * k, RH / 2 - yc * k, k, d];
}
const uOfPx = px => clamp(px / RW, 0, 1);

// =========================================================================================
// LAYOUT (world units ~1 m; camera eye y 1.9, z 5; horizon row ~99). The lawn is flat to z LZ0, then rises SLOPE per m
// up to the fence (a backyard on a gentle hill: the three hole rows sit at rows ~142 / ~120 / ~105 on screen).
// =========================================================================================
const LZ0 = -1.5, SLOPE = 0.25, FENCE_Z = -9.4;
const lawnY = z => SLOPE * clamp(LZ0 - z, 0, LZ0 - FENCE_Z);
const RIM = 0.1;                                                    // a hole's rim stands this far over the lawn at its centre
const ROW_Z = [-3.2, -5.4, -7.6], ROW_DX = [1.75, 1.87, 1.96];       // near .. far; column spacing (screen ~54 / 46 / 40 px)
const R_IN = 0.34, R_OUT = 0.56;                                    // the pit, the mound
const HOLES = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
  const x = (c - 1.5) * ROW_DX[r], z = ROW_Z[r], y = lawnY(z) + RIM;
  const s = scr(x, y + 0.42, z), base = scr(x, y, z);
  HOLES.push({ i: HOLES.length, r, c, x, y, z, s: [s[0], s[1]], base: [base[0], base[1]], k: s[2] });
}
const holeAt = (r, c) => HOLES[r * 4 + c];
const AIM_KY = 1.8;
const GRID_D = (() => { const xs = HOLES.map(h => h.s[0]), ys = HOLES.map(h => h.s[1]); return hyp(Math.max(...xs) - Math.min(...xs), AIM_KY * (Math.max(...ys) - Math.min(...ys))); })();
// timing (s): the pop up, the sink, the gap a hole keeps after a pop, shootable from RA; QUICK WHACK window from the pop
const RISE = 0.16, SINK = 0.2, REST = 0.45, RA = 0.05, QUICK = 0.5, DOWN = 1.02;
const FIN_HOLD = 4.6, FIN_SLOT = 5.0;
const MS = 0.05;                                                    // the mole's voxel
const BOMB_S = 0.62, BOMB_UP = 0.3;                                 // the bomb prop's size; its ball centre over the lift
const SHED = { x0: -8.3, x1: -4.7, z0: -8.6, z1: -6.2 };
const GNOME = { x: -4.15, z: -3.7 }, SPRINK = { x: 4.7, z: -6.9 };

// =========================================================================================
// MATERIALS (unlit set with baked colours; env dither class = alpha 0.5, objects = 1)
// =========================================================================================
const M_ENV = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.NoBlending, fog: false });
const M_OBJ = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const glc = n => 'vec3(' + [16, 8, 0].map(s => (((PAL[n] >> s) & 255) / 255).toFixed(4)).join(', ') + ')';
const HZ = scr(0, CAMP.y, CAMP.z - 1e5)[1];
const SKY_U = { uT: { value: 0 }, uHz: { value: HZ } };
const SKY_MAT = new THREE.ShaderMaterial({
  uniforms: SKY_U, depthWrite: true, fog: false,
  vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform float uT; uniform float uHz;
float blob(vec2 p, vec2 c, float s) {                  // a cumulus: four puffs, a flat bottom; <0 outside, else depth 0 top .. 1 bottom
  float bot = c.y + 6.0 * s;
  if (p.y > bot) return -1.0;
  float d = 9.0;
  d = min(d, length(p - c - vec2(-15.0, 2.0) * s) / (8.0 * s));
  d = min(d, length(p - c - vec2(-3.0, -3.0) * s) / (11.0 * s));
  d = min(d, length(p - c - vec2(10.0, -1.0) * s) / (9.0 * s));
  d = min(d, length(p - c - vec2(21.0, 3.0) * s) / (6.0 * s));
  return d < 1.0 ? clamp((p.y - (c.y - 12.0 * s)) / (18.0 * s), 0.0, 1.0) : -1.0;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, ${RH.toFixed(1)} - gl_FragCoord.y);
  float k = clamp(px.y / uHz, 0.0, 1.0);
  vec3 c = k < 0.42 ? mix(${glc('blue')}, ${glc('cyan')}, k / 0.42) : k < 0.86 ? mix(${glc('cyan')}, ${glc('ice')}, (k - 0.42) / 0.44) : mix(${glc('ice')}, ${glc('bone')}, (k - 0.86) / 0.14 * 0.6);
  vec2 sun = vec2(352.0, 24.0); float sd = length(px - sun);
  if (sd < 6.5) c = ${glc('lemon')}; else if (sd < 9.5) c = ${glc('yellow')}; else if (sd < 17.0) c = mix(c, ${glc('lemon')}, 0.32 * (1.0 - (sd - 9.5) / 7.5));
  for (int i = 0; i < 5; i++) {
    float fi = float(i), s = 0.8 + 0.35 * fract(fi * 0.618 + 0.3);
    float x = mod(fi * 131.0 + 40.0 + uT * (1.1 + 0.35 * fi), 560.0) - 70.0;
    float b = blob(px, vec2(x, 20.0 + fi * 10.0 + 3.0 * sin(fi * 2.1)), s);
    if (b >= 0.0) c = b > 0.82 ? ${glc('haze')} : b > 0.6 ? ${glc('mist')} : ${glc('bone')};
  }
  gl_FragColor = vec4(c, 0.5);
}`
});
// the lawn: mowing stripes up the hill, grass specks, soft shade round each hole and under the fence
const LAWN_U = { uH: { value: HOLES.map(h => new THREE.Vector3(h.x, h.y, h.z)) } };
const LAWN_MAT = new THREE.ShaderMaterial({
  uniforms: LAWN_U, fog: false,
  vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform vec3 uH[12]; varying vec3 vW;
float hsh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float band = mod(floor((vW.x + 40.7) / 1.45), 2.0);
  vec3 a = ${glc('green')}, b = mix(${glc('green')}, ${glc('lime')}, 0.3);
  vec3 c = band > 0.5 ? b : a;
  float n = hsh(floor(vW.xz * vec2(9.0, 7.0)));
  if (n > 0.93) c = mix(c, ${glc('lime')}, 0.45); else if (n < 0.06) c = mix(c, ${glc('forest')}, 0.5);
  float sh = 0.0;
  for (int i = 0; i < 12; i++) { vec2 d = vW.xz - uH[i].xz; d.y *= 1.15; float r = length(d - vec2(0.12, -0.18)); sh = max(sh, 1.0 - smoothstep(0.5, 0.86, r)); }
  sh = max(sh, smoothstep(${(-FENCE_Z - 1.1).toFixed(2)}, ${(-FENCE_Z - 0.15).toFixed(2)}, -vW.z) * 0.85);
  c = mix(c, ${glc('forest')}, 0.55 * sh);
  float fz = clamp((-vW.z - 2.0) / 9.0, 0.0, 1.0);
  c = mix(c, mix(c, ${glc('forest')}, 0.18), fz);
  gl_FragColor = vec4(c, 0.5);
}`
});

// =========================================================================================
// THE MOLE (voxel list; origin = the rim, mole-local +z toward the camera). Schemes: COCOA, VELVET, GINGER.
// faces: 0 idle (bead eyes with a glint), 1 bonked (X eyes, tongue out), 2 happy (^ ^, open smile). pose 'up' = paws
// on the rim; 'card' = paws up holding a card over the head (the finale), ch = its letter
// =========================================================================================
const SCH = [
  { F: 'walnut', Fd: 'umber', L: 'chestnut', Mz: 'sand' },
  { F: 'slate', Fd: 'navy', L: 'steel', Mz: 'steel' },
  { F: 'tan', Fd: 'chestnut', L: 'sand', Mz: 'bone' }
];
const SCH_N = ['COCOA', 'VELVET', 'GINGER'];
function moleList(si, face, pose, ch) {
  const S = SCH[si], M = new Map(), key = (i, j, k) => i + ',' + j + ',' + k, put = (i, j, k, c) => M.set(key(i, j, k), [i, j, k, PAL[c]]);
  const RX = 6.2, RZ = 5.2, J0 = -14, JD = 5, HD = 10.6;
  for (let j = J0; j <= JD + HD; j++) {
    const sc = j <= JD ? 1 : Math.sqrt(Math.max(0, 1 - ((j - JD) / HD) ** 2));
    const rx = RX * sc + 0.35, rz = RZ * sc + 0.35;
    for (let i = -7; i <= 7; i++) for (let k = -6; k <= 6; k++) {
      if ((i / rx) ** 2 + (k / rz) ** 2 > 1) continue;
      let c = S.F;
      if (Math.abs(i) >= rx - 1.1 || k <= -rz + 1.4) c = S.Fd;
      else if (j >= JD + HD - 3.2 && k >= -1 && i <= 1) c = S.L;                                   // a lit crown (top-left)
      if (k >= rz - 1.4 && j >= -4 && j <= 0 && Math.abs(i) <= 3) c = S.Mz;                        // the belly patch
      put(i, j, k, c);
    }
  }
  const front = (i, j) => { for (let k = 9; k >= -9; k--) if (M.has(key(i, j, k))) return k; return null; };
  const at = (i, j, c, dk = 0) => { const k = front(i, j); if (k != null) put(i, j, k + dk, c); };
  // the snout: a sand muzzle sticking out, a big pink nose on it, two buck teeth under it
  for (let i = -2; i <= 2; i++) for (let j = 4; j <= 7; j++) { if (Math.abs(i) === 2 && (j === 4 || j === 7)) continue; const k = front(i, j); if (k != null) put(i, j, k + 1, S.Mz); }
  for (let i = -1; i <= 1; i++) for (let j = 6; j <= 8; j++) { if (j === 8 && i !== 0) continue; const k = front(i, j); if (k != null) put(i, j, k + 1, j === 8 ? 'pink' : 'pink'); }
  { const k = front(-1, 7); if (k != null) put(-1, 7, k, 'bubblegum'); }
  if (face === 2) {                                                                             // happy: an open smile under the teeth
    for (let i = -2; i <= 2; i++) { const k = front(i, 3); if (k != null) put(i, 3, k + 1, 'oxblood'); }
    for (const i of [-1, 1]) { const k = front(i, 3); if (k != null) put(i, 3, k, 'bone'); }
  } else {
    for (const [i, j] of [[0, 2], [0, 3], [-2, 3], [2, 3]]) { const k = front(i, j); if (k != null) put(i, j, k + 1, 'oxblood'); }
    for (const i of [-1, 1]) for (const j of [1, 2, 3]) { const k = front(i, j); if (k != null) put(i, j, k + 1, j === 1 ? 'mist' : 'bone'); }
    if (face === 1) { for (const [i, j] of [[0, 1], [1, 1], [0, 0]]) { const k = front(i, j); if (k != null) put(i, j, k + 1, j === 0 ? 'red' : 'pink'); } }
  }
  // eyes
  if (face === 0) {
    for (const s of [-1, 1]) for (const di of [2, 3]) for (const j of [9, 10]) at(s * di, j, (j === 10 && di === (s > 0 ? 2 : 3)) ? 'bone' : 'void');
  } else if (face === 1) {
    for (const s of [-1, 1]) for (const [di, j] of [[1, 8], [3, 8], [2, 9], [1, 10], [3, 10]]) at(s * di, j, 'void');
  } else {
    for (const s of [-1, 1]) for (const [di, j] of [[1, 9], [2, 10], [3, 10], [4, 9]]) at(s * di, j, 'void');
  }
  for (const s of [-1, 1]) at(s * 4, 6, face === 1 ? S.F : 'bubblegum');                       // blush
  for (const s of [-1, 1]) at(s * 3, 12, S.Fd);                                                 // brows
  if (pose === 'up') {                                                                          // paws on the rim, claws out
    for (const s of [-1, 1]) for (let di = 2; di <= 4; di++) for (let j = -1; j <= 0; j++) for (let k = 5; k <= 6; k++) put(s * di, j, k, j === 0 ? 'bubblegum' : 'pink');
    for (const s of [-1, 1]) for (const di of [2, 3, 4]) put(s * di, 0, 7, 'bone');
  } else if (pose === 'card') {                                                                 // arms up, a card held over the head
    for (const s of [-1, 1]) {
      for (let j = 8; j <= 17; j++) for (let di = 6; di <= 7; di++) for (let k = 0; k <= 1; k++) put(s * di, j, k, di === 7 ? S.Fd : S.F);
      for (let j = 17; j <= 19; j++) for (let di = 5; di <= 7; di++) put(s * di, j, 2, j === 19 ? 'bubblegum' : 'pink');
    }
    const t = R.small(ch || 'B'), CW = 13, CH = 14, cx0 = -6, cy0 = 18;
    const on = new Set(); for (const [i, j] of t.px) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) on.add((2 + i * 2 + a) + ',' + (2 + j * 2 + b));
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) on.add((9 + a) + ',' + (10 + b));       // the dot
    for (let i = 0; i < CW; i++) for (let j = 0; j < CH; j++) {
      const edge = i === 0 || j === 0 || i === CW - 1 || j === CH - 1;
      put(cx0 + i, cy0 + CH - 1 - j, 1, edge ? 'mist' : on.has(i + ',' + j) ? 'red' : 'bone');
      put(cx0 + i, cy0 + CH - 1 - j, 0, 'haze');
    }
  }
  // the outline trick: a void plate one voxel behind the back, the silhouette dilated by one (a dark rim round the head)
  if (pose !== 'card') {
    const sil = new Set(); for (const [i, j] of M.values()) sil.add(i + ',' + j);
    for (const q of sil) { const [i, j] = q.split(',').map(Number); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1]]) { const n = (i + di) + ',' + (j + dj); if (!sil.has(n) && j + dj > 0) put(i + di, j + dj, -1, 'void'); } }
  }
  return [...M.values()];
}
const GEO = {};
const moleGeo = (si, face) => GEO['m' + si + face] || (GEO['m' + si + face] = new Vox().vox(moleList(si, face, 'up'), MS).geo());
const cardGeo = (si, ch) => GEO['c' + si + ch] || (GEO['c' + si + ch] = new Vox().vox(moleList(si, 2, 'card', ch), MS).geo());
// four little stars that circle a bonked mole's head (one mesh, rotated)
function starsGeo() {
  if (GEO.stars) return GEO.stars;
  const v = new Vox(), s = 0.06;
  for (let n = 0; n < 5; n++) {
    const a = n / 5 * Math.PI * 2, cx = Math.cos(a) * 0.42, cz = Math.sin(a) * 0.34, cy = 0.05 * Math.sin(a * 2), col = PAL[n % 2 ? 'lemon' : 'yellow'];
    for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) v.box(cx + i * s, cy + j * s, cz, s, s, s, j === 1 || i === -1 ? PAL.lemon : col);
  }
  return (GEO.stars = v.geo());
}

// =========================================================================================
// THE YARD SET
// =========================================================================================
let PARTS = null;
const shadeOf = (v, s) => { v.shade = s; return v; };
const SH_BOX = [0.82, 0.9, 1.0, 0.6, 1.0, 0.72];                    // +x, -x, +y, -y, +z (toward you), -z
function buildFar(v) {                                              // over the fence: round trees, a neighbour's roof (env class)
  // the neighbour's house (behind the trees, centre-left): bone wall, a rust roof with shingle rows, a chimney
  const hx0 = -3.4, hx1 = 4.6, hz = -24, hy = lawnY(FENCE_Z);
  for (let x = hx0; x < hx1; x += 0.5) v.bx(x, hy, hz, x + 0.5, hy + 4.2, hz + 0.4, PAL[((x * 2) | 0) % 2 ? 'mist' : 'bone']);
  for (let k = 0; k < 9; k++) { const y = hy + 4.2 + k * 0.42, w = (hx1 - hx0) / 2 + 0.5 - k * 0.55; if (w <= 0.2) break; v.bx((hx0 + hx1) / 2 - w, y, hz - 1, (hx0 + hx1) / 2 + w, y + 0.42, hz + 0.9, PAL[k % 2 ? 'rust' : 'crimson']); }
  v.bx(1.8, hy + 5.4, hz - 0.4, 2.6, hy + 7.6, hz + 0.4, PAL.red); v.bx(1.7, hy + 7.6, hz - 0.5, 2.7, hy + 7.9, hz + 0.5, PAL.oxblood);
  for (const wx of [-2.2, 2.6]) { v.bx(wx, hy + 2.2, hz + 0.41, wx + 1.1, hy + 3.3, hz + 0.45, PAL.haze); v.bx(wx + 0.52, hy + 2.2, hz + 0.45, wx + 0.58, hy + 3.3, hz + 0.47, PAL.bone); }
  // trees: a shell of 0.5 m voxels round each crown, lit from the top-left; a walnut trunk
  const TREES = [[-16, -15, 3.2, 5.6], [-10.5, -13.5, 2.6, 4.6], [-6.5, -17, 2.9, 5.8], [8, -15.5, 3.0, 5.2], [13.5, -13.2, 2.8, 4.4], [18.5, -17, 3.4, 6.2], [-21, -19, 3.6, 6.4], [24, -20, 3.4, 6.0], [3.5, -30, 3.8, 7.4], [-3.5, -31, 3.4, 6.9]];
  const C = 0.5, list = [];
  TREES.forEach(([tx, tz, cr, ch], ti) => {
    const base = lawnY(FENCE_Z) - 0.2;
    for (let y = base; y < base + ch - cr * 0.6; y += C) list.push([Math.round(tx / C), Math.round(y / C), Math.round(tz / C), PAL[(Math.round(y / C) % 3) ? 'walnut' : 'umber']]);
    const cy = base + ch, n = Math.ceil(cr / C) + 1;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) {
      const d = hyp(hyp(i, j * 1.08), k) * C; if (d > cr || d < cr - 1.1) continue;
      const nx = i / n, ny = j / n, nz = k / n, l = -0.55 * nx + 0.75 * ny + 0.35 * nz + 0.35 * (H32(i * 7 + ti, j * 13 + k) - 0.5);
      list.push([Math.round(tx / C) + i, Math.round(cy / C) + j, Math.round(tz / C) + k, PAL[l > 0.45 ? 'lime' : l > -0.1 ? 'green' : 'forest']]);
    }
  });
  v.vox(list, C);
}
function buildFence(v) {                                            // white pickets with pointed tops, two rails, posts
  const y0 = lawnY(FENCE_Z) - 0.25, z = FENCE_Z, PW = 0.16, GAP = 0.13, H = 1.05;
  for (let x = -16; x < 16; x += PW + GAP) {
    const tall = H + 0.04 * Math.sin(x * 3.1);
    v.bx(x, y0, z - 0.03, x + PW, y0 + 0.25 + tall, z + 0.03, PAL.bone);
    v.bx(x + 0.03, y0 + 0.25 + tall, z - 0.03, x + PW - 0.03, y0 + 0.25 + tall + 0.07, z + 0.03, PAL.bone);
    v.bx(x + 0.06, y0 + 0.25 + tall + 0.07, z - 0.03, x + PW - 0.06, y0 + 0.25 + tall + 0.12, z + 0.03, PAL.mist);
  }
  for (const ry of [0.55, 1.0]) v.bx(-16, y0 + ry, z - 0.12, 16, y0 + ry + 0.09, z - 0.03, PAL.haze);
  for (let x = -16; x <= 16; x += 2.9) { v.bx(x - 0.07, y0, z - 0.2, x + 0.11, y0 + 1.48, z - 0.03, PAL.mist); v.bx(x - 0.09, y0 + 1.48, z - 0.22, x + 0.13, y0 + 1.56, z - 0.01, PAL.bone); }
}
function buildShed(v) {                                             // a red shed on a stone footing, the sign on its roof
  const { x0, x1, z0, z1 } = SHED, top = lawnY(z0) + 0.05, wh = 2.8, zf = z1;
  // the stone footing levels it on the slope: its front face shows courses of stone
  for (let y = lawnY(z1) - 0.25; y < top; y += 0.2) for (let x = x0 - 0.15; x < x1 + 0.15 - 1e-6; x += 0.45) {
    const off = ((((y + 1) / 0.2) | 0) % 2) * 0.22, xa = Math.max(x0 - 0.15, x - off), xb = Math.min(x1 + 0.15, x + 0.45 - off);
    v.bx(xa, y, z0, xb - 0.02, Math.min(top, y + 0.19), zf + 0.15, PAL[H32(x * 10 | 0, y * 10 | 0) < 0.3 ? 'steel' : H32(x * 7 | 0, y * 13 | 0) < 0.6 ? 'haze' : 'slate']);
  }
  // walls: vertical red boards, bone corner trims
  for (let x = x0; x < x1 - 1e-6; x += 0.18) v.bx(x, top, zf - 0.06, x + 0.18, top + wh, zf, PAL[(((x - x0) / 0.18) | 0) % 2 ? 'crimson' : 'red']);
  v.bx(x1 - 0.06, top, z0, x1, top + wh, zf, PAL.crimson);
  v.bx(x0, top, z0, x0 + 0.06, top + wh, zf, PAL.crimson);
  for (const cx of [x0, x1 - 0.12]) v.bx(cx, top, zf - 0.02, cx + 0.12, top + wh, zf + 0.02, PAL.bone);
  v.bx(x0, top + wh - 0.1, zf - 0.02, x1, top + wh, zf + 0.02, PAL.bone);
  // the door: double, bone frame, a bone X brace on each leaf; a little window with four panes
  const dx0 = x0 + 0.45, dx1 = dx0 + 1.45, dh = 1.66;
  v.bx(dx0 - 0.06, top, zf, dx1 + 0.06, top + dh + 0.06, zf + 0.02, PAL.bone);
  v.bx(dx0, top, zf + 0.01, dx1, top + dh, zf + 0.03, PAL.oxblood);
  for (const [a, b] of [[dx0, (dx0 + dx1) / 2], [(dx0 + dx1) / 2, dx1]]) {
    const w = b - a, n = 9;
    for (let s = 0; s < n; s++) { const f = s / (n - 1); v.bx(a + 0.04 + f * (w - 0.16), top + 0.06 + f * (dh - 0.2), zf + 0.03, a + 0.12 + f * (w - 0.16), top + 0.14 + f * (dh - 0.2), zf + 0.05, PAL.bone); v.bx(a + 0.04 + f * (w - 0.16), top + dh - 0.14 - f * (dh - 0.2), zf + 0.03, a + 0.12 + f * (w - 0.16), top + dh - 0.06 - f * (dh - 0.2), zf + 0.05, PAL.bone); }
    v.bx(a + 0.02, top + dh / 2 - 0.04, zf + 0.03, b - 0.02, top + dh / 2 + 0.04, zf + 0.05, PAL.bone);
  }
  v.bx((dx0 + dx1) / 2 - 0.02, top, zf + 0.03, (dx0 + dx1) / 2 + 0.02, top + dh, zf + 0.05, PAL.walnut);
  const wx0 = x1 - 1.05, wx1 = x1 - 0.35, wy0 = top + 1.0, wy1 = top + 1.6;
  v.bx(wx0 - 0.06, wy0 - 0.06, zf, wx1 + 0.06, wy1 + 0.06, zf + 0.03, PAL.bone);
  v.bx(wx0, wy0, zf + 0.01, wx1, wy1, zf + 0.04, PAL.ice); v.bx(wx0, wy1 - 0.15, zf + 0.04, wx0 + 0.25, wy1, zf + 0.05, PAL.bone);
  v.bx((wx0 + wx1) / 2 - 0.025, wy0, zf + 0.04, (wx0 + wx1) / 2 + 0.025, wy1, zf + 0.06, PAL.bone); v.bx(wx0, (wy0 + wy1) / 2 - 0.025, zf + 0.04, wx1, (wy0 + wy1) / 2 + 0.025, zf + 0.06, PAL.bone);
  v.bx(wx0 - 0.1, wy0 - 0.2, zf, wx1 + 0.1, wy0 - 0.06, zf + 0.2, PAL.tan);                       // a window box with flowers
  for (let k = 0; k < 6; k++) v.bx(wx0 - 0.05 + k * 0.14, wy0 - 0.06, zf + 0.06, wx0 + 0.05 + k * 0.14, wy0 + 0.06, zf + 0.16, PAL[['pink', 'yellow', 'red', 'bubblegum', 'lemon', 'magenta'][k]]);
  // the roof: two slopes of slate shingles, the ridge running front to back (gable toward you), a bone fascia
  const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2 + 0.25, rh = 1.05, ry = top + wh;
  for (let k = 0; k < 7; k++) {
    const f = k / 7, w = hw * (1 - f), y = ry + rh * f;
    v.bx(cx - w - 0.02, y, z0 - 0.25, cx - w + hw / 7 + 0.02, y + rh / 7 + 0.06, zf + 0.25, PAL[k % 2 ? 'slate' : 'navy']);
    v.bx(cx + w - hw / 7 - 0.02, y, z0 - 0.25, cx + w + 0.02, y + rh / 7 + 0.06, zf + 0.25, PAL[k % 2 ? 'slate' : 'navy']);
    v.bx(cx - w + hw / 7, y, zf - 0.06, cx + w - hw / 7, y + rh / 7, zf, PAL[k % 2 ? 'red' : 'crimson']);    // the gable
  }
  for (let k = 0; k < 7; k++) { const f = k / 7, w = hw * (1 - f), y = ry + rh * f; v.bx(cx - w - 0.05, y - 0.02, zf + 0.25, cx - w + 0.12, y + 0.1, zf + 0.3, PAL.bone); v.bx(cx + w - 0.12, y - 0.02, zf + 0.25, cx + w + 0.05, y + 0.1, zf + 0.3, PAL.bone); }
  // the sign over the door, under the eaves: "B.L.A.M." / "LAWN CARE" (3x5 letters), lemon / yellow on oxblood, bone frame
  const l1 = R.small('B.L.A.M.'), l2 = R.small('LAWN CARE'), cs = 0.076, bw = (Math.max(l1.w, l2.w) + 4) * cs, bh = 13 * cs, sy = top + wh - 0.14 - bh, sz = zf - 0.02;
  v.bx(cx - bw / 2 - 0.06, sy - 0.06, sz + 0.05, cx + bw / 2 + 0.06, sy + bh + 0.06, sz + 0.1, PAL.bone);
  v.bx(cx - bw / 2, sy, sz + 0.1, cx + bw / 2, sy + bh, sz + 0.11, PAL.oxblood);
  const letters = (t, row, col) => { const lx = cx - t.w * cs / 2; for (const [i, j] of t.px) v.bx(lx + i * cs, sy + bh - (row + j + 1) * cs, sz + 0.11, lx + (i + 1) * cs, sy + bh - (row + j) * cs, sz + 0.14, PAL[col]); };
  letters(l1, 1, 'lemon'); letters(l2, 7, 'yellow');
  // a rake and a shovel leaning on the wall, right of the door
  const lx = x1 - 0.25;
  for (let s = 0; s < 10; s++) v.bx(lx + 0.08 - s * 0.016, top + s * 0.16, zf + 0.06, lx + 0.13 - s * 0.016, top + (s + 1) * 0.16, zf + 0.11, PAL.tan);
  v.bx(lx - 0.24, top + 1.58, zf + 0.06, lx + 0.12, top + 1.64, zf + 0.12, PAL.steel); for (let k = 0; k < 6; k++) v.bx(lx - 0.23 + k * 0.065, top + 1.48, zf + 0.07, lx - 0.2 + k * 0.065, top + 1.58, zf + 0.11, PAL.steel);
}
function buildGnome(v) {                                            // a garden gnome: red hat, bone beard, blue coat, a lantern
  const L = [], put = (i, j, k, c) => L.push([i, j, k, PAL[c]]);
  for (let j = 0; j <= 18; j++) for (let i = -5; i <= 5; i++) for (let k = -4; k <= 4; k++) {
    if (j <= 1) { if (Math.abs(i) >= 1 && Math.abs(i) <= 4 && k >= -2 && k <= 3 && !(i === 0)) put(i, j, k, 'walnut'); continue; }      // boots
    if (j <= 8) { const r = 4.3 - (j - 2) * 0.12; if (i * i + k * k * 1.3 <= r * r) put(i, j, k, j === 4 ? 'walnut' : 'blue'); continue; }   // coat + belt
    if (j <= 11) { if (i * i + k * k * 1.2 <= 3.4 * 3.4) put(i, j, k, 'sand'); continue; }                // the face
    const r = 3.8 * (1 - (j - 12) / 7.5); if (r > 0.4 && i * i + (k + (j - 12) * 0.35) ** 2 <= r * r) put(i, j, Math.round(k), 'red');   // the hat, tipping back
  }
  for (let j = 5; j <= 10; j++) for (let i = -3; i <= 3; i++) { const w = 3 - Math.max(0, 8 - j) * 0.9; if (Math.abs(i) <= w) put(i, j, 4, j >= 10 && Math.abs(i) <= 1 ? 'sand' : 'bone'); }   // the beard
  put(0, 10, 5, 'coral'); put(0, 9, 5, 'coral'); put(-2, 11, 3, 'void'); put(2, 11, 3, 'void'); put(0, 4, 4, 'amber');
  for (const s of [-1, 1]) for (let j = 5; j <= 7; j++) put(s * 5, j, 1, 'blue');
  put(-5, 4, 2, 'sand'); put(5, 4, 2, 'sand');
  for (let j = 1; j <= 3; j++) put(6, j, 2, j === 3 ? 'void' : 'lemon'); put(6, 4, 2, 'void');          // a little lantern in his hand
  const s = 0.034, y = lawnY(GNOME.z) - 0.02;
  v.vox(L, s, GNOME.x, y, GNOME.z);
}
function buildHoles(v) {                                            // dirt mounds round dark pits (bx columns on a 0.06 grid)
  const C = 0.06;
  for (const Hh of HOLES) {
    for (let a = -R_OUT; a <= R_OUT + 1e-6; a += C) for (let b = -R_OUT; b <= R_OUT + 1e-6; b += C) {
      const r = hyp(a, b * 1.05); if (r > R_OUT) continue;
      const x = Hh.x + a, z = Hh.z + b, ly = lawnY(z) - 0.12, n = H32(Math.round(x * 50), Math.round(z * 50));
      if (r < R_IN - C) { v.bx(x, Hh.y - 0.09, z, x + C, Hh.y - 0.035, z + C, PAL[r < R_IN - 0.15 ? 'void' : 'umber']); continue; }
      if (r < R_IN) { v.bx(x, Hh.y - 0.4, z, x + C, Hh.y - 0.01, z + C, PAL.umber); continue; }
      const f = (r - R_IN) / (R_OUT - R_IN), topY = Hh.y - 0.015 - 0.13 * f * f - 0.03 * n;
      const col = f < 0.22 ? (n < 0.5 ? 'walnut' : 'chestnut') : n > 0.9 ? 'sand' : n > 0.55 ? 'tan' : 'chestnut';
      v.bx(x, Math.min(ly, topY - 0.05), z, x + C, Math.max(topY, ly + 0.02), z + C, PAL[col]);
      if (n > 0.965) v.bx(x + 0.01, topY, z + 0.01, x + C - 0.01, topY + 0.035, z + C - 0.01, PAL.haze);   // a pebble
    }
  }
}
function buildFlowers(v) {                                          // beds along the fence, by the shed, round the gnome, right side
  const beds = [[-15, -2.2, FENCE_Z + 0.35, FENCE_Z + 0.85, 0.36], [3.6, 15, FENCE_Z + 0.35, FENCE_Z + 0.85, 0.36], [-4.6, -3.2, -4.6, -3.0, 0.32], [5.6, 8.4, -5.8, -2.6, 0.34], [-9.5, -8.5, -6.2, -3.5, 0.34]];
  const cols = ['red', 'yellow', 'pink', 'magenta', 'bubblegum', 'lemon', 'coral', 'bone'];
  let n = 0;
  for (const [xa, xb, za, zb, st] of beds) for (let x = xa; x < xb; x += st) for (let z = za; z < zb; z += st) {
    n++; const h = H32(n, 71); if (h < 0.18) continue;
    const fx = x + 0.12 * (H32(n, 3) - 0.5), fz = z + 0.12 * (H32(n, 5) - 0.5), y = lawnY(fz), sh = 0.18 + 0.2 * H32(n, 9), col = cols[(H32(n, 11) * cols.length) | 0];
    v.bx(fx - 0.018, y, fz - 0.018, fx + 0.018, y + sh, fz + 0.018, PAL.forest);
    v.bx(fx - 0.07, y + sh * 0.45, fz, fx - 0.018, y + sh * 0.45 + 0.04, fz + 0.03, PAL.green);
    v.bx(fx - 0.075, y + sh, fz - 0.06, fx + 0.075, y + sh + 0.1, fz + 0.06, PAL[col]);
    v.bx(fx - 0.03, y + sh + 0.03, fz + 0.06, fx + 0.03, y + sh + 0.08, fz + 0.075, PAL[col === 'yellow' || col === 'lemon' ? 'amber' : 'yellow']);
  }
  // the foreground: dandelions, a few clocks gone to seed, darker tufts of uncut grass
  for (let q = 0; q < 70; q++) {
    const x = -7 + 14 * H32(q, 21), z = 1.2 - 3.6 * H32(q, 23), y = lawnY(z), kind = H32(q, 25);
    if (kind < 0.5) { for (let b = 0; b < 4; b++) { const bx = x + 0.05 * (b - 1.5), bh = 0.07 + 0.08 * H32(q, 30 + b); v.bx(bx - 0.02, y, z - 0.02, bx + 0.02, y + bh, z + 0.02, PAL[b % 2 ? 'forest' : 'green']); } continue; }
    v.bx(x - 0.012, y, z - 0.012, x + 0.012, y + 0.12, z + 0.012, PAL.green);
    v.bx(x - 0.045, y + 0.11, z - 0.03, x + 0.045, y + 0.16, z + 0.03, PAL[kind < 0.88 ? 'yellow' : 'bone']);
    if (kind < 0.88) v.bx(x - 0.02, y + 0.15, z + 0.03, x + 0.02, y + 0.17, z + 0.035, PAL.amber);
  }
}
function buildSprinklerBase(v) {                                    // the spike + body (static); the hose snaking off to the right
  const { x, z } = SPRINK, y = lawnY(z);
  v.bx(x - 0.12, y - 0.05, z - 0.12, x + 0.12, y + 0.06, z + 0.12, PAL.slate);
  v.bx(x - 0.04, y + 0.06, z - 0.04, x + 0.04, y + 0.36, z + 0.04, PAL.steel);
  v.bx(x - 0.06, y + 0.3, z - 0.06, x + 0.06, y + 0.38, z + 0.06, PAL.haze);
  for (let k = 0; k < 60; k++) { const f = k / 60, hx = x + 0.1 + f * 7.5, hz = z + 0.15 + 2.4 * f + 0.55 * Math.sin(f * 9), hy = lawnY(hz) + 0.02; v.bx(hx - 0.07, hy, hz - 0.05, hx + 0.07, hy + 0.07, hz + 0.05, PAL[k % 7 ? 'green' : 'lime']); }
}
function sprinklerHeadGeo() {                                       // the turning head: an arm, the nozzle, the bone deflector
  const v = new Vox();
  v.bx(-0.05, 0, -0.05, 0.05, 0.08, 0.05, PAL.steel);
  v.bx(-0.03, 0.06, -0.03, 0.26, 0.11, 0.03, PAL.haze);
  v.bx(0.22, 0.08, -0.04, 0.32, 0.16, 0.04, PAL.steel);
  v.bx(-0.16, 0.08, -0.025, 0.02, 0.12, 0.025, PAL.slate); v.bx(-0.2, 0.06, -0.06, -0.14, 0.16, 0.06, PAL.bone);
  return v.geo();
}
function butterflyGeo() {
  const v = new Vox();
  v.bx(-0.02, -0.02, -0.07, 0.02, 0.02, 0.07, PAL.void);
  for (const s of [-1, 1]) { v.bx(s > 0 ? 0.02 : -0.13, -0.01, -0.07, s > 0 ? 0.13 : -0.02, 0.01, 0.03, PAL.bubblegum); v.bx(s > 0 ? 0.04 : -0.1, 0.0, -0.05, s > 0 ? 0.1 : -0.04, 0.015, -0.0, PAL.lemon); v.bx(s > 0 ? 0.02 : -0.1, -0.01, 0.02, s > 0 ? 0.1 : -0.02, 0.01, 0.08, PAL.pink); }
  return v.geo();
}
const N_DROP = 42, N_FLY = 4;
function buildEnv() {
  const env = new THREE.Group();
  const sky = noRay(new THREE.Mesh(new THREE.PlaneGeometry(260, 90), SKY_MAT)); sky.position.set(0, 20, -52); sky.renderOrder = -10; env.add(sky);
  // the lawn: a grid bent over the hill profile
  const lg = new THREE.PlaneGeometry(80, 22, 40, 88); lg.rotateX(-Math.PI / 2); lg.translate(0, 0, -5);
  const pa = lg.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, lawnY(pa.getZ(i))); pa.needsUpdate = true; lg.computeBoundingSphere();
  const lawn = noRay(new THREE.Mesh(lg, LAWN_MAT)); env.add(lawn);
  const ve = new Vox(); buildFar(ve); env.add(noRay(new THREE.Mesh(ve.geo(), M_ENV)));
  // shootable scenery (bullet holes): the fence, the shed, the gnome
  const vs = shadeOf(new Vox(), SH_BOX); buildFence(vs); buildShed(vs); buildGnome(vs);
  const solid = new THREE.Mesh(vs.geo(), M_OBJ); env.add(solid);
  const vo = shadeOf(new Vox(), SH_BOX); buildHoles(vo); buildFlowers(vo); buildSprinklerBase(vo);
  env.add(noRay(new THREE.Mesh(vo.geo(), M_OBJ)));
  const head = noRay(new THREE.Mesh(sprinklerHeadGeo(), M_OBJ)); head.position.set(SPRINK.x, lawnY(SPRINK.z) + 0.36, SPRINK.z); env.add(head);
  const drops = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), N_DROP);
  drops.frustumCulled = false; noRay(drops); env.add(drops);
  for (let i = 0; i < N_DROP; i++) drops.setColorAt(i, new THREE.Color(PAL[['cyan', 'ice', 'cyan', 'blue', 'ice'][i % 5]]));
  const flies = new THREE.InstancedMesh(butterflyGeo(), M_OBJ, N_FLY); flies.frustumCulled = false; noRay(flies); env.add(flies);
  // the finale: four card moles in the front row (hidden until the finale)
  const cards = ['B', 'L', 'A', 'M'].map((ch, i) => {
    const Hh = holeAt(0, i), m = noRay(new THREE.Mesh(cardGeo([0, 1, 2, 0][i], ch), MAT.obj)); m.userData.sharedGeo = true;
    m.position.set(Hh.x, Hh.y - DOWN, Hh.z); m.visible = false; env.add(m); return m;
  });
  // misses on the grass: a proxy finds the lawn under the ray and kicks up grass + dirt; it never reports a hit
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.raycast = missTurf; env.add(proxy);
  env.userData.shootables = [solid, proxy];
  sky.onBeforeRender = () => envStep();
  if (B.Props && B.Props.bomb) { const p = B.Props.bomb({ size: BOMB_S }); void p; }      // build the bomb's shared geometry now
  moleGeo(0, 0); moleGeo(1, 0); moleGeo(2, 0); for (let s = 0; s < 3; s++) { moleGeo(s, 1); } starsGeo();
  PARTS = { env, sky, lawn, head, drops, flies, cards, solid };
  return env;
}
// where a ray meets the lawn (flat, the hill, the top), or null
function lawnHit(o, d, out) {
  if (d.y >= -0.002 && d.y + SLOPE * d.z >= -0.002) return null;
  let t = (SLOPE * (LZ0 - o.z) - o.y) / (d.y + SLOPE * d.z), z = o.z + t * d.z;
  if (!(t > 0 && z <= LZ0 && z >= FENCE_Z)) { t = -o.y / d.y; z = o.z + t * d.z; if (!(t > 0 && z > LZ0)) return null; }
  return out.set(o.x + t * d.x, lawnY(z), z);
}
const _tp = new THREE.Vector3(), _tv = new THREE.Vector3();
function missTurf(rc) {
  if (!inPlay()) return;
  const p = lawnHit(rc.ray.origin, rc.ray.direction, _tp); if (!p || p.z > 1.5) return;
  for (let k = 0; k < 9; k++) T.spawnChip(p, _tv.set(R.rnd(-1, 1), R.rnd(1.5, 3.2), R.rnd(-0.4, 1.2)), R.rnd(0.03, 0.055), PAL[['green', 'lime', 'chestnut', 'forest', 'tan'][k % 5]], R.rnd(0.4, 0.7), 1, p.y);
}

// =========================================================================================
// TARGETS: a pop (mole or bomb) in a hole. The lift is a pure function of lt; the bonk after a shot is a local cosmetic.
// =========================================================================================
const lifeOf = sp => RISE + sp.win + SINK;
// the lift (0 = fully up, -DOWN = out of sight) at local time lt
function liftAt(sp, lt) {
  if (lt < 0) return -DOWN;
  if (lt < RISE) return -DOWN * (1 - E.outBack(lt / RISE));
  const s = lt - RISE - sp.win;
  if (s <= 0) return 0;
  return -DOWN * E.inCubic(Math.min(1, s / SINK));
}
const shootUntil = sp => RISE + sp.win + SINK * 0.55;
const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _bp = new THREE.Vector3();
const MOLE_BOX = new THREE.Box3(new THREE.Vector3(-0.37, -1.2, -0.33), new THREE.Vector3(0.37, 0.86, 0.38));
// the mole's hit box (a touch generous), clipped at its hole's rim: a ray that meets the box under the rim plane is in the
// dirt in front of it
function moleRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable) return;
  this.updateWorldMatrix(true, false);
  _inv.copy(this.matrixWorld).invert(); _ray.copy(rc.ray).applyMatrix4(_inv);
  if (!_ray.intersectBox(MOLE_BOX, _bp)) return;
  _bp.applyMatrix4(this.matrixWorld);
  if (_bp.y < tg.H.y - 0.02) return;
  out.push({ distance: rc.ray.origin.distanceTo(_bp), point: _bp.clone(), object: this });
}
// the bomb's own (precise) mesh, clipped at the rim the same way
function clipRaycast(rc, out) {
  const n = out.length; THREE.Mesh.prototype.raycast.call(this, rc, out);
  for (let i = out.length - 1; i >= n; i--) if (out[i].point.y < this.userData.clipY) out.splice(i, 1);
}
// chips that land on the hill (the engine's shatter bounces chips on y = 0)
function chipShatter(tg, point, opts = {}, floor = 0) {
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
      T.spawnChip(v, w, sc * R.rnd(0.75, 1.0) * big, c, R.rnd(1.0, 1.9), 1, floor);
    }
  }
  tg.alive = false; tg.shootable = false;
}
function dirtPuff(Hh, n, big) {
  const p = _tp.set(Hh.x, Hh.y + 0.04, Hh.z);
  for (let k = 0; k < n; k++) { const a = R.rnd(0, 6.283), s = R.rnd(0.5, 1.4) * (big ? 1.3 : 1); T.spawnChip(p, _tv.set(Math.cos(a) * s, R.rnd(1.2, 2.8), Math.sin(a) * s * 0.6 + 0.3), R.rnd(0.03, 0.06), PAL[['chestnut', 'tan', 'walnut', 'sand'][k % 4]], R.rnd(0.35, 0.6), 1, Hh.y - 0.12); }
}
class Pop extends T.Target {
  constructor(sp, run) {
    super(sp.kind === 'bomb' ? 'bomb' : 'target');
    this.sp = sp; const Hh = this.H = HOLES[sp.h];
    this.group.position.set(Hh.x, Hh.y, Hh.z);
    this.lift = new THREE.Group(); this.lift.position.y = -DOWN; this.group.add(this.lift);
    this.lastLt = 0; this.deadLt = -1; this.popped = false; this.downed = false; this.ph = hash1(sp.id * 31 + sp.h) * 6.283;
    if (sp.kind === 'bomb') {
      const P = B.Props, p = this.prop = P.bomb({ size: BOMB_S });
      if (p.base) p.base.visible = false; if (p.arm) p.arm.visible = false;
      p.group.position.y = BOMB_UP - BOMB_S * (P.FACE_Y + P.PIVOT_Y);
      p.group.rotation.y = 0.35 * (hash1(sp.id) - 0.5);
      this.lift.add(p.group); p.register(this);
      p.face.userData.clipY = Hh.y - 0.02; p.face.raycast = clipRaycast;
    } else {
      this.body = noRay(shared(moleGeo(sp.sch, 0), MAT.obj)); this.lift.add(this.body);
      this.proxy = new THREE.Mesh(PROXY_GEO, PROXY_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this; this.proxy.raycast = moleRaycast;
      this.lift.add(this.proxy);
    }
    this.group.visible = false;
  }
  meshes() { return this.proxy ? [this.proxy] : super.meshes(); }
  update(lt, run) {
    const sp = this.sp, L = lifeOf(sp), Hh = this.H, live = inPlay() && run.state === 'play';
    this.lastLt = lt;
    if (!this.alive) return this.kind === 'bomb' || this.boom ? lt - this.deadLt > 0.5 : this.updateBonk(lt);
    const y = liftAt(sp, lt);
    this.lift.position.y = y;
    this.group.visible = lt >= 0 && lt < L;
    this.shootable = lt >= RA && lt < shootUntil(sp);
    if (!this.popped && lt >= 0) {
      this.popped = true;
      if (live && lt < 0.3) { dirtPuff(Hh, sp.kind === 'bomb' ? 7 : 10, false); B.SFX.play(sp.kind === 'bomb' ? 'bombUp' : 'molePop', { u: uOfPx(Hh.s[0]) }); }
    }
    if (!this.downed && lt >= RISE + sp.win) { this.downed = true; if (live && sp.kind !== 'bomb') B.SFX.play('moleDown', { u: uOfPx(Hh.s[0]) }); }
    if (sp.kind === 'bomb') {
      this.prop.sparkle(lt, false);
      this.lift.rotation.z = 0.05 * Math.sin(lt * 9 + this.ph);
    } else {                                                       // looks about, sniffs
      const up = clamp(lt / RISE, 0, 1);
      this.body.rotation.set(0, 0.22 * Math.sin(lt * 2.6 + this.ph) * up, 0.06 * Math.sin(lt * 4.1 + this.ph));
      const sn = 1 + 0.025 * Math.sin(lt * 22 + this.ph) * up;
      this.body.scale.set(1, sn, 1);
    }
    return lt >= L;
  }
  // bonked: the face goes X-eyed, it spins once and flops back with stars round its head, then sinks (a local cosmetic;
  // compressed so it is gone before its hole can pop again)
  updateBonk(lt) {
    const q = lt - this.deadLt, len = this.bonkLen, a = clamp(q / (len * 0.62), 0, 1), s = clamp((q - len * 0.62) / (len * 0.38), 0, 1);
    this.group.visible = true;
    this.lift.position.y = Math.max(-DOWN, this.y0 + 0.07 * Math.sin(Math.PI * Math.min(1, a * 1.6)) - DOWN * E.inCubic(s));
    this.body.rotation.set(-0.55 * E.outCubic(a), this.r0 + Math.PI * 2 * E.outCubic(Math.min(1, a * 1.25)), 0.18 * Math.sin(q * 20) * (1 - a));
    this.body.scale.set(1, 1, 1);
    if (this.stars) { this.stars.visible = s < 0.6; this.stars.rotation.y = q * 9; this.stars.position.y = 0.95 - 0.1 * a; }
    return q >= len;
  }
  shatter(point, opts = {}) {
    if (!this.alive) return;
    if (this.kind === 'bomb') { chipShatter(this, point, opts, this.H.y - 0.1); this.group.visible = false; this.deadLt = this.lastLt; return; }
    this.alive = false; this.shootable = false; this.deadLt = this.lastLt;
    this.y0 = this.lift.position.y; this.r0 = this.body.rotation.y;
    this.bonkLen = clamp(lifeOf(this.sp) + REST - 0.06 - this.deadLt, 0.36, 0.8);
    this.body.geometry = moleGeo(this.sp.sch, 1);
    this.stars = noRay(shared(starsGeo(), MAT.glow)); this.stars.position.y = 0.95; this.body.add(this.stars);
    const Hh = this.H, p = point ? point.clone() : new THREE.Vector3(Hh.x, Hh.y + 0.5, Hh.z);
    T.sparks(p, 6, ['lemon', 'yellow', 'bone'], 1.3, 0.035);
    const S = SCH[this.sp.sch];
    for (let k = 0; k < 7; k++) T.spawnChip(p, _tv.set(R.rnd(-1.6, 1.6), R.rnd(1, 2.6), R.rnd(0, 1.4)), R.rnd(0.035, 0.06), opts.tint != null && k % 3 === 0 ? opts.tint : PAL[[S.F, S.Fd, S.Mz][k % 3]], R.rnd(0.5, 0.9), 1, Hh.y - 0.1);
    dirtPuff(Hh, 5, false);
    B.SFX.play('moleBonk', { u: uOfPx(Hh.s[0]) });
  }
  // the engine's bomb path (Run.penaltyNow): the cartoon burst + the iron in chips onto the dirt
  explode(point) {
    if (this.boom) return;
    this.boom = true;
    const f = this.prop.face; f.updateMatrixWorld(true);
    const c = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    T.burst(c, 0.8);
    for (let k = 0; k < 6; k++) T.spawnChip(c, _tv.set(R.rnd(-2.2, 2.2), R.rnd(1, 4), R.rnd(-1, 2)), 0.05, PAL.void, R.rnd(0.8, 1.4), 1, this.H.y - 0.1);
    dirtPuff(this.H, 12, true);
    chipShatter(this, point || c, { power: 1.7, max: 60 }, this.H.y - 0.1);
    this.prop.hide(); this.group.visible = false; this.deadLt = this.lastLt;
  }
}
const PROXY_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });

// ---------- the DIRECTOR (kind 'fx', t0 0): the finale + its sounds; it holds the stage open ----------
const ST = { run: null, fin: -1, dir: null, puffed: 0 };
class Director extends T.Target {
  constructor(sp, run) {
    super('fx'); this.sp = sp; this.shootable = false;
    if (ST.run !== run) { ST.run = run; ST.fin = -1; ST.puffed = 0; }
    ST.dir = this;
  }
  meshes() { return []; }
  update(lt, run) {
    if (ST.dir !== this) return true;                             // practice: a newer chunk's director took over
    const sp = this.sp, t = Math.max(0, run.t), live = run.state === 'play' && inPlay();
    if (ST.fin < 0 && !run.practice && t >= sp.last && run.state === 'play' && (run.versus || (run.me.hits >= run.cfg.quota && run.me.lives > 0))) {
      ST.fin = sp.last; ST.puffed = 0;
      if (live) { B.SFX.play('moleCards'); B.SFX.play('finale'); if (B.G && B.G.duckReact) B.G.duckReact('cheer', 2.6); }
    }
    if (ST.fin >= 0 && inPlay()) for (let i = 0; i < 4; i++) if (!(ST.puffed & (1 << i)) && t - ST.fin >= FIN_T0 + i * FIN_DT) { ST.puffed |= 1 << i; dirtPuff(holeAt(0, i), 9, false); }
    return t >= sp.last + (ST.fin >= 0 ? FIN_HOLD : 1.0);
  }
}
const FIN_T0 = 0.25, FIN_DT = 0.16;
function makeTarget(sp, run) { return sp.kind === 'dir' ? new Director(sp, run) : new Pop(sp, run); }

// =========================================================================================
// per-frame set step (the sky mesh's onBeforeRender): clouds, the sprinkler, butterflies, the finale's card moles
// =========================================================================================
const stageT = () => { const G = B.G, run = G && G.run; return run && run.stage === ID ? { run, t: Math.max(0, run.t) } : { run: null, t: 0 }; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// the impulse sprinkler's yaw (wall clock): 18 ticks of 0.11 rad every 0.2 s, a quick ratchet back over 0.7 s, a rest
const SPR_A0 = -1.45, SPR_N = 18, SPR_STEP = 0.072, SPR_TICK = 0.2;
function sprinklerYaw(w) {
  const cyc = SPR_N * SPR_TICK + 0.9, f = w % cyc;
  if (f < SPR_N * SPR_TICK) { const n = Math.floor(f / SPR_TICK), e = (f - n * SPR_TICK) / SPR_TICK; return SPR_A0 + SPR_STEP * (n + Math.min(1, e * 5)); }
  const k = clamp((f - SPR_N * SPR_TICK) / 0.7, 0, 1); return SPR_A0 + SPR_STEP * SPR_N * (1 - E.inOut(k));
}
function envStep() {
  if (!PARTS) return;
  const { run, t } = stageT(), wall = performance.now() / 1000, D = PARTS;
  SKY_U.uT.value = wall;
  // the sprinkler: the head turns in ticks; the jet is a stream of droplets on a parabola along its yaw
  const yaw = sprinklerYaw(wall); D.head.rotation.y = yaw;
  const nx = D.head.position.x, ny = D.head.position.y + 0.12, nz = D.head.position.z, dx = Math.cos(yaw), dz = -Math.sin(yaw);
  for (let i = 0; i < N_DROP; i++) {
    const f = ((i / N_DROP) + wall * 0.9) % 1, j = hash1(i * 7), L = 2.6 + 0.5 * j, H = 1.1 + 0.25 * hash1(i * 3);
    const x = nx + dx * L * f + 0.08 * (j - 0.5), z = nz + dz * L * f + 0.08 * (hash1(i * 5) - 0.5), y = ny + H * 4 * f * (1 - f) * 0.9 + 0.25 * f * f * -1;
    const s = 0.06 + 0.045 * f;
    D.drops.setMatrixAt(i, _m.compose(_v.set(x, Math.max(lawnY(z), y), z), _q.identity(), _s.set(s, s, s)));
  }
  D.drops.instanceMatrix.needsUpdate = true;
  // butterflies over the flower beds (wall clock, cosmetic)
  const FL = [[-8.9, -4.5, 0.9], [6.8, -4.2, 0.9], [-9, -8.6, 1.0], [9.5, -8.6, 1.0]];
  for (let i = 0; i < N_FLY; i++) {
    const [cx, cz, r] = FL[i], a = wall * (0.6 + 0.2 * i) + i * 1.7, x = cx + Math.cos(a) * r, z = cz + Math.sin(a * 1.3) * r * 0.5, y = lawnY(z) + 0.55 + 0.25 * Math.sin(wall * 2.1 + i);
    const flap = 0.25 + 0.75 * Math.abs(Math.sin(wall * 14 + i * 2));
    D.flies.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0.3, a + Math.PI / 2, 0)), _s.set(flap, 1, 1)));
  }
  D.flies.instanceMatrix.needsUpdate = true;
  // the finale: four moles up in the front row with B. L. A. M. cards, bobbing in a wave
  const ft = run && ST.run === run && ST.fin >= 0 ? t - ST.fin : -1;
  D.cards.forEach((m, i) => {
    if (ft < 0) { m.visible = false; return; }
    const Hh = holeAt(0, i), k = clamp((ft - FIN_T0 - i * FIN_DT) / 0.32, 0, 1), up = k <= 0 ? 0 : E.outBack(k);
    m.visible = k > 0;
    const bob = k >= 1 ? 0.06 * Math.sin((ft - 0.9) * 6 - i * 0.9) : 0;
    m.position.set(Hh.x, Hh.y - DOWN * (1 - up) + bob, Hh.z);
    m.rotation.set(0, 0.12 * Math.sin(ft * 2.2 + i), 0.06 * Math.sin(ft * 5 - i * 0.9));
  });
}

// =========================================================================================
// The dials per tier (variant 0; the variants change the AMMO ONLY; quota share +2 % a variant, cap 90 %)
// pops = moles + bombs a round (the clock follows) | win = HOLD window s (fully up) | live [lo, hi] = up at once (a beat's cap
// is hi with chance l2) | gap / pause = the range director's beats; burst = chance a beat is a CLUSTER of 2 (4 with chance bn4, 3 with chance
// bn3) pops bgap s apart, a pause after | trick = chance a beat is a PATTERN (ROW / DIAGONAL / COLUMN of three on `beat`)
// | decep = chance a pop is a bomb, bombCap = ceiling on the bomb share (range rules: never two bombs in a row, a bomb only
// while bombs up <= moles up) | hop / alt = AIM TRAVEL (#90) from the last mole you were made to aim at (share of the grid's
// diagonal, ~200 px; alt: prefer the other side / row) | adj = keep-off px round pops already up | rowW = row weights
// near / mid / far (the far row more at the high tiers) | share = quota share of the moles
// =========================================================================================
const TIER_P = [
  { pops: 46, win: 1.6, live: [2, 3], l2: 0.35, gap: [0.85, 1.2], burst: 0.15, bn3: 0, bn4: 0, bgap: [0.22, 0.36], pause: [1.0, 1.35], trick: 0.1, beat: 0.5,
    decep: 0.26, bombCap: 0.2, hop: [0.15, 0.4], alt: 0.3, adj: 36, rowW: [1, 0.8, 0.7], share: 0.55 },
  { pops: 66, win: 1.15, live: [3, 4], l2: 0.4, gap: [0.62, 0.88], burst: 0.2, bn3: 0.25, bn4: 0, bgap: [0.16, 0.28], pause: [0.85, 1.15], trick: 0.13, beat: 0.4,
    decep: 0.34, bombCap: 0.27, hop: [0.25, 0.5], alt: 0.45, adj: 32, rowW: [1, 0.9, 0.75], share: 0.6 },
  { pops: 88, win: 0.8, live: [4, 5], l2: 0.5, gap: [0.44, 0.62], burst: 0.25, bn3: 0.45, bn4: 0.12, bgap: [0.12, 0.22], pause: [0.8, 1.05], trick: 0.16, beat: 0.32,
    decep: 0.45, bombCap: 0.33, hop: [0.35, 0.65], alt: 0.65, adj: 28, rowW: [0.9, 1, 0.95], share: 0.64 },
  { pops: 100, win: 0.65, live: [5, 6], l2: 0.5, gap: [0.4, 0.54], burst: 0.3, bn3: 0.5, bn4: 0.25, bgap: [0.08, 0.16], pause: [0.75, 1.0], trick: 0.18, beat: 0.28,
    decep: 0.56, bombCap: 0.38, hop: [0.45, 0.8], alt: 0.85, adj: 24, rowW: [0.8, 0.95, 1], share: 0.68 }
];
const VARIANT_NAMES = ['BACKYARD', 'WHACK RUSH', 'DIRT NAP'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.share = Math.min(0.9, b.share + 0.02 * v);
  c.live = b.live.slice(); c.time = 60; c.quota = 10;
  c.ammo = ['unlimited', { mag: 8, autoReload: false }, { mag: 12, autoReload: false }][v];
  c.tier = tier; c.variant = v; c.title = 'MOLE HOLES'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
// ---------- timeline: the DIRECTOR. Every spawn from the seeded rng only. ----------
// Beats from t 1.0: a SINGLE (gap after), a CLUSTER (2-3 pops bgap apart at different holes, a pause after) or a PATTERN
// (three plain moles on the beat: ROW = three neighbouring holes along a row, DIAGONAL = one per row stepping a column,
// COLUMN = one column front to back or back to front; the first pattern of a round is a row; never two in a row; a
// pattern waits until the board has room for all three). A beat waits while the pops up + its own would exceed its cap.
// A hole is never used twice in a row and is booked from its pop to REST s after it sinks. AIM TRAVEL: every free hole
// scored by how close its screen point (vertical x AIM_KY) lands to the wanted hop from the last mole you were made to
// aim at, + alt for the same side / row, + the row weight, + adj round the pops up (and the hole right behind / in front
// of one, which it would hide). FAIR BOMBS: a pop is a bomb with chance decep, never two in a row, bombs <= bombCap of
// the pops, and only while the bombs up <= the moles up.
// Spawn fields: pop { kind 'mole' | 'bomb', h (hole), win, sch (mole paint), ra, readyAt, pat (pattern id or -1), pk
// ('R' | 'D' | 'C'), pi }; dir { last (the last sink + 0.3), pops, moles, bombs, pats } (kind 'dir', t0 0, id 0).
// Practice (c.practice): pops until c.time (the chunk window); c.prior carries the pops still up.
function timeline(c, rng) {
  rng(); rng(); rng();
  const pops = [], prior = (c.prior || []).filter(s => s.kind === 'mole' || s.kind === 'bomb');
  const all = () => prior.length ? prior.concat(pops) : pops;
  const lifeW = w => RISE + w + SINK;
  const busy = (h, a, b) => { for (const s of all()) if (s.h === h && s.t0 < b + REST && s.t1 + REST > a) return true; return false; };
  const upAt = T => all().filter(s => s.t0 <= T + 0.05 && s.t1 > T);
  let t = c.practice ? 0.6 : 1.0, lastH = -1, lastAim = null, lastRow = -1, lastSch = -1, bombs = 0, trail = 0, nPat = 0, lastPat = false;
  const target = c.practice ? Infinity : c.pops, T_END = c.practice ? c.time : Infinity;
  const mk = (T, h, kind, win, o = {}) => {
    let sch = -1;
    if (kind === 'mole') { sch = Math.floor(rng() * 3) % 3; if (sch === lastSch) sch = (sch + 1) % 3; lastSch = sch; }
    return { id: 0, t0: r3(T), t1: r3(T + lifeW(win)), kind, h, win: r3(win), sch, ra: RA, readyAt: RA, pat: o.pat != null ? o.pat : -1, pk: o.pk || '', pi: o.pi || 0 };
  };
  const add = sp => { pops.push(sp); lastH = sp.h; if (sp.kind === 'bomb') { bombs++; trail++; } else { trail = 0; lastAim = HOLES[sp.h].s; lastRow = HOLES[sp.h].r; } };
  function pickHole(T, life, D) {
    const up = upAt(T); let best = -1, bs = 1e9;
    for (const Hh of HOLES) {
      const s0 = 0.12 * rng();
      if (Hh.i === lastH || busy(Hh.i, T, T + life)) continue;
      let s = s0;
      if (lastAim) {
        s += Math.abs(hyp(Hh.s[0] - lastAim[0], AIM_KY * (Hh.s[1] - lastAim[1])) - D) / GRID_D;
        const sd = x => x < RW / 2 - 12 ? -1 : x > RW / 2 + 12 ? 1 : 0;
        if (sd(Hh.s[0]) * sd(lastAim[0]) > 0) s += 0.35 * c.alt;
        if (Hh.r === lastRow) s += 0.2 * c.alt;
      }
      s += 0.5 * (1 - c.rowW[Hh.r]);
      for (const u of up) { const U = HOLES[u.h]; if (U.c === Hh.c && Math.abs(U.r - Hh.r) === 1) s += 1.2; else if (hyp(U.s[0] - Hh.s[0], U.s[1] - Hh.s[1]) < c.adj) s += 0.6; }
      if (s < bs) { bs = s; best = Hh.i; }
    }
    return best;
  }
  const canBomb = T => {
    if (trail >= 1 || bombs + 1 > c.bombCap * (pops.length + 1) + 0.5) return false;
    const up = upAt(T), bu = up.filter(s => s.kind === 'bomb').length, mu = up.length - bu;
    return bu <= mu;
  };
  function pattern(T) {
    const kr = rng(), K = nPat === 0 ? 'R' : kr < 0.4 ? 'R' : kr < 0.72 ? 'D' : 'C', fwd = rng() < 0.5, beat = c.beat, win = Math.max(c.win, beat * 1.4);
    let hs;
    if (K === 'R') { const r = pickW(c.rowW, rng()), c0 = rng() < 0.5 ? 0 : 1; hs = [0, 1, 2].map(i => holeAt(r, c0 + i).i); }
    else if (K === 'D') { const d = rng() < 0.5 ? 1 : -1, c0 = d > 0 ? (rng() < 0.5 ? 0 : 1) : (rng() < 0.5 ? 2 : 3); hs = [0, 1, 2].map(i => holeAt(i, c0 + d * i).i); }
    else { const cc = Math.floor(rng() * 4) % 4; hs = [0, 1, 2].map(i => holeAt(i, cc).i); }
    if (!fwd) hs.reverse();
    let t0 = T;
    for (let g = 0; g < 80; g++) { const up = upAt(t0); if (up.length + 3 <= Math.max(3, c.live[1])) break; t0 = Math.min(...up.map(s => s.t1)) + 0.05; }
    if (c.practice && t0 + 2 * beat > T_END) return -1;
    if (hs[0] === lastH) return -1;
    for (let i = 0; i < 3; i++) if (busy(hs[i], t0 + i * beat, t0 + i * beat + lifeW(win))) return -1;
    const pi = nPat++;
    hs.forEach((h, i) => add(mk(t0 + i * beat, h, 'mole', win, { pat: pi, pk: K, pi: i })));
    return t0 + 2 * beat;
  }
  for (let guard = 0; guard < 6000 && pops.length < target && t < T_END; guard++) {
    if (!lastPat && pops.length >= 3 && target - pops.length >= 3 && rng() < c.trick) {
      const e = pattern(t);
      if (e > 0) { t = e + rng.range(c.pause[0], c.pause[1]); lastPat = true; continue; }
    }
    lastPat = false;
    const cl = rng() < c.burst, cr = rng(), cnt = Math.min(target - pops.length, cl ? (cr < c.bn4 ? 4 : cr < c.bn4 + c.bn3 ? 3 : 2) : 1);
    const cap = Math.max(cnt, rng() < c.l2 ? c.live[1] : c.live[0]);
    for (let g = 0; g < 80; g++) { const up = upAt(t); if (up.length + cnt <= cap) break; t = Math.min(...up.map(s => s.t1)) + 0.05; }
    if (t >= T_END) break;
    let tt = t, n = 0;
    for (let k = 0; k < cnt; k++) {
      const D = rng.range(c.hop[0], c.hop[1]) * GRID_D, br = rng();
      const kind = pops.length > 1 && br < c.decep && canBomb(tt) ? 'bomb' : 'mole';
      const h = pickHole(tt, lifeW(c.win), D);
      if (h < 0) break;
      add(mk(tt, h, kind, c.win)); n++;
      if (k < cnt - 1) tt += rng.range(c.bgap[0], c.bgap[1]);
    }
    if (!n) { t += 0.15; continue; }
    t = tt + (cnt > 1 ? rng.range(c.pause[0], c.pause[1]) : rng.range(c.gap[0], c.gap[1]));
  }
  pops.sort((a, b) => a.t0 - b.t0 || a.h - b.h);
  const lastE = pops.length ? Math.max(...pops.map(s => s.t1)) : 1, last = r3(lastE + 0.3);
  const moles = pops.filter(s => s.kind === 'mole').length;
  const dir = { id: 0, t0: 0, t1: r3(last + FIN_HOLD), kind: 'dir', last, pops: pops.length, moles, bombs, pats: nPat };
  const out = [dir, ...pops];
  out.forEach((s, i) => { s.id = i; });
  c.popCount = pops.length; c.moleCount = moles; c.bombCount = bombs; c.patCount = nPat;
  if (!c.practice) { c.time = Math.ceil(last + FIN_SLOT); c.quota = Math.max(4, Math.round(moles * c.share)); }
  return out;
}
// points: a mole 100, +50 QUICK WHACK within QUICK s of its pop. Pure in (spawn, lt).
function points(sp, lt) {
  if (sp.kind !== 'mole') return 0;
  return 100 + (lt <= QUICK ? 50 : 0);
}
function briefing(c) {
  const HINTS = ['QUICK WHACK: +50 IN THE FIRST HALF SECOND!', 'WATCH THE BACK ROW TOO!', 'ROWS AND DIAGONALS ON A BEAT!', 'SIX HOLES AT ONCE. NO MERCY!'];
  return { rule: [['SHOOT ', 'void'], [c.quota + ' MOLES', 'red'], [' OR MORE!', 'void']], icon: 'mole', unit: 'MOLES',
    dont: 'bomb', tip: 'BOMBS POP UP TOO. LET THEM SINK!', hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}

// =========================================================================================
// HUD: the briefing icon + the level card
// =========================================================================================
function outlined(key, w, h, f) {                               // pixImg with a 1 px void outline round whatever f draws
  const H = B.HUD;
  return H.pixImg(key, w, h, (x, y) => {
    const c = f(x, y); if (c) return c;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && f(x + dx, y + dy)) return 'void';
    return null;
  });
}
// a mole's head in pixels, radius r, centred; returns a palette name or null (x, y relative to the head's centre)
function molePix(r, blink) {
  return (x, y) => {
    const nx = x / r, ny = y / r;
    if (nx * nx / 0.62 + (ny - 0.05) * (ny - 0.05) / 0.82 > 1) return null;
    const d = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    if (d(nx, ny, 0, 0.12, 0.15, 0.11)) return nx < -0.04 && ny < 0.1 ? 'bubblegum' : 'pink';                       // the nose
    if (Math.abs(nx) >= 0.035 && Math.abs(nx) < 0.17 && ny > 0.31 && ny < 0.52) return 'bone';                       // two teeth
    if (Math.abs(nx) < 0.035 && ny > 0.31 && ny < 0.42) return 'oxblood';
    for (const s of [-1, 1]) if (d(nx, ny, s * 0.27, -0.2, 0.09, blink ? 0.03 : 0.1)) return !blink && nx * s < 0.27 - 0.02 && ny < -0.24 ? 'bone' : 'void';
    for (const s of [-1, 1]) if (d(nx, ny, s * 0.48, 0.12, 0.09, 0.06)) return 'bubblegum';
    if (d(nx, ny, 0, 0.2, 0.36, 0.25)) return 'sand';                                                              // the muzzle
    if (ny < -0.55 && nx < 0.15) return 'tan';
    return nx > 0.5 || ny > 0.7 ? 'walnut' : 'chestnut';
  };
}
// briefing card icon: a mole popping up out of its dirt mound (2 frames: up / a little higher)
function drawIcon(cx, cy, r, t = 0) {
  const H = B.HUD, f = Math.floor(t * 3) & 1, W = Math.round(r * 2.3), Hh = Math.round(r * 2.3), mr = r * 0.82, ox = W / 2, oy = Hh * 0.47 - (f ? 1 : 0), px = molePix(mr, false);
  const img = outlined('mo_icon_' + r + '_' + f, W, Hh, (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= Hh) return null;
    const mx = (x - ox + 0.5) / (r * 1.05), my = (y - Hh * 0.86 + 0.5) / (r * 0.24);
    if (mx * mx + my * my <= 1 && y >= Hh * 0.78) return my < -0.2 ? 'tan' : (x + y) % 5 === 0 ? 'sand' : 'chestnut';     // the mound
    if (y < Hh * 0.82) { const c = px(x - ox + 0.5, y - oy + 0.5); if (c) return c; }
    if (y >= Hh * 0.78 && y < Hh * 0.84) { for (const s of [-1, 1]) if (Math.abs(x - ox - s * r * 0.42) < r * 0.2) return 'pink'; }   // paws on the rim
    return null;
  });
  H.draw(img, cx - ox, cy - Hh / 2);
}
// the level card (56 x 32, centred): a blue sky, the picket fence, the striped lawn on its hill, a mole up in the middle,
// a lit bomb up in a hole on the right, two empty holes
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
function drawCard(cx, cy, t = 0) {
  const H = B.HUD, W = 56, Hc = 32, x0 = Math.round(cx - W / 2), y0 = Math.round(cy - Hc / 2), f = Math.floor(t * 3) & 1;
  const HOLE = [[14, 20, 5], [42, 21, 5], [28, 27, 6], [8, 28, 6], [49, 29, 6]];
  const bg = H.pixImg('mo_card_bg', W, Hc, (x, y) => {
    if (y < 12) {                                                // sky + a cloud + the sun
      if (Math.hypot(x - 47, y - 4) < 2.6) return 'lemon';
      if (Math.hypot(x - 47, y - 4) < 3.8) return 'yellow';
      if ((Math.hypot(x - 12, y - 5) < 3 || Math.hypot(x - 16, y - 4) < 3.6 || Math.hypot(x - 20, y - 5.5) < 2.4) && y < 7) return y > 5 ? 'mist' : 'bone';
      if (y <= 9 && ((x < 8 && y > 6 - Math.sin(x)) || (x > 30 && x < 41 && y > 5 + Math.abs(x - 35.5) * 0.6))) return x < 8 ? 'green' : 'forest';   // trees over the fence
      const v = y / 12 * 2.2 + bay(x, y) * 0.9 - 0.45;
      return ['blue', 'cyan', 'ice'][clamp(Math.floor(v), 0, 2)];
    }
    if (y <= 15) {                                               // the picket fence
      if (y === 12 && x % 3 !== 1) return null;
      if (x % 3 === 2) return y === 15 ? 'forest' : 'green';
      return y === 14 ? 'mist' : 'bone';
    }
    for (const [hx, hy, hr] of HOLE) {                           // holes: a dark pit in a dirt mound
      const dx = (x - hx) / hr, dy = (y - hy) / (hr * 0.42);
      if (dx * dx + dy * dy <= 0.42) return 'void';
      if (dx * dx + dy * dy <= 1) return dy < 0 ? 'tan' : 'chestnut';
    }
    const band = Math.floor((x - 28) / (3 + (y - 16) * 0.4) + 50) % 2;
    return band ? 'green' : ((x * 7 + y * 3) % 11 === 0 ? 'lime' : 'forest');
  });
  H.draw(bg, x0, y0);
  // the mole, up in the middle hole (bobbing a pixel), and a lit bomb in the right one
  const mr = 7.2, mp = molePix(mr, f === 1 && Math.floor(t * 1.5) % 4 === 0);
  const mole = outlined('mo_card_mole_' + f, 18, 17, (x, y) => (x < 0 || y < 0 || x >= 18 || y >= 17 || y > 14) ? null : mp(x - 9 + 0.5, y - 8 + 0.5) || (y >= 13 && (Math.abs(x - 5) <= 1 || Math.abs(x - 12) <= 1) ? 'pink' : null));
  H.draw(mole, x0 + 19, y0 + 11 + (f ? 0 : 1));
  const bomb = outlined('mo_card_bomb_' + f, 13, 14, (x, y) => {
    if (x < 0 || y < 0 || x >= 13 || y >= 14) return null;
    const dx = x - 6, dy = y - 8.5, d = Math.hypot(dx, dy);
    if (d < 4.6 && y < 13) { if (y === 9 && (x === 5 || x === 7)) return 'void'; if ((x >= 5 && x <= 7 && y >= 8 && y <= 10) && !(y === 10 && x === 6)) return 'bone'; if (Math.hypot(dx + 2, dy + 2) < 1.1) return 'haze'; return d > 3.6 ? 'midnight' : 'navy'; }
    if (x >= 6 && x <= 7 && y >= 2 && y <= 4) return 'tan';
    if (y <= 2 && Math.hypot(x - 8, y - 1) < (f ? 1.6 : 1.1)) return f ? 'yellow' : 'lemon';
    return null;
  });
  H.draw(bomb, x0 + 36, y0 + 9);
}

// =========================================================================================
// SOUNDS (recipes defined here with B.SFXKit.def; nothing appended to sfx-stage.js) + the 'lawn' ambience bed
// =========================================================================================
{
  const K = B.SFXKit;
  if (K && K.def) {
    const tone = (v, o) => K.tone(v, o), noise = (v, o) => K.noise(v, o);
    K.def('molePop', { max: 4, gap: 0.03, pv: 1.2, dv: 0.1, verb: 0.08, pri: 2, gain: 6.0 },
      v => {                                 // a mole pops up: a cartoon "pop!" + a dirt thump + crumbs
        tone(v, { type: 'sine', f: 360, f2: 980, ft: 0.07, a: 0.002, d: 0.09, g: 0.12 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 900, a: 0.002, d: 0.12, g: 0.12 });
        K.grains(v, { n: 6, span: 0.18, at: 0.02, f: [500, 1600], q: 2, d: [0.01, 0.03], g: [0.02, 0.05], fade: true });
        return 0.3;
      });
    K.def('moleDown', { max: 3, gap: 0.05, pv: 1.0, dv: 0.1, verb: 0.06, pri: 1, gain: 4.0 },
      v => {                                 // a mole ducks back down: a short slide-whistle drop + a soft dirt scuff
        tone(v, { type: 'triangle', f: 880, f2: 300, ft: 0.15, a: 0.005, d: 0.16, g: 0.05 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 600, at: 0.11, a: 0.004, d: 0.08, g: 0.05 });
        return 0.3;
      });
    K.def('moleBonk', { max: 3, gap: 0.04, pv: 0.7, dv: 0.08, verb: 0.1, pri: 3, gain: 6.0 },
      v => {                                 // a mole shot: a wooden BONK, a squeaky "eek", stars twinkling
        K.fm(v, { f: 320, ratio: 1.5, index: 2.2, id: 0.04, d: 0.16, g: 0.2 });
        tone(v, { type: 'square', f: 150, f2: 90, ft: 0.08, a: 0.001, d: 0.1, g: 0.06, lp: 1200 });
        tone(v, { type: 'sine', f: 1400, f2: 2300, ft: 0.08, at: 0.06, a: 0.005, d: 0.12, g: 0.04, vib: [30, 0.05] });
        K.pings(v, { n: 4, span: 0.35, at: 0.12, f: [2600, 4200], gmax: 0.035 });
        return 0.6;
      });
    K.def('bombUp', { max: 3, gap: 0.05, pv: 0.6, dv: 0.08, verb: 0.08, pri: 2, gain: 4.5 },
      v => {                                 // a bomb pops up: an iron clunk on the rim + the fuse fizzing
        K.fm(v, { f: 210, ratio: 2.4, index: 1.6, id: 0.05, d: 0.18, g: 0.1 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 700, a: 0.002, d: 0.1, g: 0.08 });
        noise(v, { kind: 'white', ft: 'bandpass', ff: 5200, q: 1.4, at: 0.04, a: 0.02, hold: 0.25, d: 0.15, g: 0.035 });
        K.grains(v, { n: 8, span: 0.35, at: 0.05, f: [3000, 7000], q: 6, d: [0.004, 0.012], g: [0.02, 0.05] });
        return 0.6;
      });
    K.def('moleCards', { max: 1, gap: 0.5, pv: 0, dv: 0.04, verb: 0.15, pri: 3, gain: 3.0 },
      v => {                                 // the finale: four quick rising pops (the moles), then a little ta-daa
        for (let i = 0; i < 4; i++) tone(v, { type: 'sine', f: 420 + i * 90, f2: 1000 + i * 160, ft: 0.06, at: 0.25 + i * 0.16, d: 0.08, g: 0.08, np: true });
        for (const [at, f, d] of [[0.95, 523, 0.12], [1.1, 784, 0.42]]) tone(v, { type: 'square', f, at, a: 0.01, d, hold: 0.05, g: 0.05, lp: 2200, np: true });
        return 1.7;
      });
    // the lawn bed: a breeze, birds chirping now and then, the sprinkler ticking round and ratcheting back. Hooked into
    // K.beds as 'moles'.
    K.stageBeds = K.stageBeds || {};
    K.stageBeds.lawn = (ctx, bus) => {
      const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
      out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(0.6, now + 2.5); out.connect(bus);
      const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; param.value = base; o.connect(gn).connect(param); o.start(now); srcs.push(o); };
      const loop = (kind, type, f, q, g) => { const s = ctx.createBufferSource(), fl = K.filt(ctx, type, f, q), gn = K.gain(ctx, g); s.buffer = K.noiseBuf(ctx, kind); s.loop = true; s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s); return { f: fl, g: gn }; };
      const air = loop('pink', 'lowpass', 650, 0.6, 0.016); lfo(0.07, 0.011, air.g.gain, 0.016); lfo(0.05, 220, air.f.frequency, 650);
      const leaves = loop('white', 'bandpass', 3800, 0.8, 0.0015); lfo(0.09, 0.0012, leaves.g.gain, 0.0015);
      const chirp = t => {                   // a bird: two to five quick chirps
        const n = 2 + Math.floor(Math.random() * 4), f0 = 2600 + Math.random() * 1600;
        for (let k = 0; k < n; k++) { const a = t + k * (0.09 + Math.random() * 0.05), o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.2), a); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, a + 0.04); o.frequency.exponentialRampToValueAtTime(f0 * 0.85, a + 0.07); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.004, a + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.08); o.connect(g).connect(out); o.start(a); o.stop(a + 0.09); }
      };
      const tick = (t, g) => { const s = ctx.createBufferSource(), fl = K.filt(ctx, 'bandpass', 2800, 3), gn = ctx.createGain(); s.buffer = K.noiseBuf(ctx, 'white'); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + 0.002); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); s.connect(fl).connect(gn).connect(out); s.start(t, Math.random()); s.stop(t + 0.04); };
      const spray = t => { for (let k = 0; k < 18; k++) tick(t + k * 0.2, 0.008); for (let k = 0; k < 12; k++) tick(t + 3.6 + k * 0.055, 0.004); return 4.5; };
      let stopped = false, nb = now + 1.5, ns = now + 1.0;
      return {
        tick(until) {
          if (stopped) return; const c = ctx.currentTime;
          if (nb < c - 0.5) nb = c + 1; if (ns < c - 0.5) ns = c + 0.5;
          while (nb < until) { try { chirp(nb); } catch (e) {} nb += 2.5 + Math.random() * 5; }
          while (ns < until) { let d = 4.5; try { d = spray(ns); } catch (e) {} ns += d + 0.4 + Math.random() * 1.2; }
        },
        stop(fade = 1.5) {
          if (stopped) return; stopped = true;
          const t = ctx.currentTime, gp = out.gain;
          gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
          for (const x of srcs) { try { x.stop(t + fade + 0.1); } catch (e) {} }
          setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
        }
      };
    };
    if (K.beds && !K.beds.moles) K.beds.moles = K.stageBeds.lawn;
  }
}
// the miss ricochet colours (core/fx.js reads B.FX.ricochetColors[stageId]): white paint + wood off the fence and the shed
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors[ID] = { hot: ['bone', 'lemon', 'sand'], flakes: ['bone', 'tan', 'red'], pop: 'bone', speed: 1, grav: 1 };
B.Stage.register({ id: ID, name: 'MOLE HOLES', short: 'MOLE', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon, drawCard,
  TIER_P, HOLES, holeAt, liftAt, lifeOf, shootUntil, scr, lawnY, ST, HZ, GRID_D, RISE, SINK, REST, RA, QUICK, DOWN, FIN_HOLD, FIN_SLOT, parts: () => PARTS });
})(window.BLAM);
