'use strict';
/* =========================================================================================
   B.L.A.M. stages/invasion.js -- Stage 6: INVASION (DESIGN-STAGES.md section 7, Fable + Jon 2026-10-30).
   ORBIT VIEW: the gun rides a satellite. The bottom third of the screen is Earth's curve (a voxel cap of a big globe:
   seas, continents, clouds and ice turn slowly under a fixed sun, the night side's cities glow, a thin atmosphere rim);
   above it black space, a dense twinkling star field, the moon; now and then a shooting star streaks across and the
   B.L.A.M. satellite drifts past (looks only, never shootable, wall clock).
   SAUCERS (tin toys, 3 sizes, 4 paint schemes) warp in far out and small at the top and descend toward the planet,
   wobbling side to side and growing as they come. A real saucer that reaches the atmosphere unshot flares orange on the
   globe: a LANDING = LIFE -1 (stage-side hook, see "Landing" below). Hit zones: DOME full points, RIM half.
   BOMB saucers (skull-painted iron hull, red dome, lit fuse), DECOY saucers (a bomb in a cardboard disguise: painted
   cardboard disc and a crayon dome; the fuse pokes out of the top, the skull jaw shows under the rim; shot: the 0.3 s
   build-up via arm(), then the bang) and TURNCOATS (a real saucer: fuse pops out + ticks + shakes, an unshootable flip,
   then a bomb) NEVER land: they veer off before the atmosphere.
   THREE WAVES per round (a WAVE n banner of star dust each), the director's beats: singles / bursts with aim travel,
   formations (V, ROW on a beat, SNAKE spiral, PING-PONG pairs then a bomb), fair-bomb rules, no co-visible overlap on
   screen outside formations. The MOTHERSHIP closes wave 3 (variant 3: one more closes wave 2): its SHIELD plates sit in
   front of the core like a range COLUMN (shoot the front one, the next is standing there; members are hidden while
   the one in front stands, revealed by run.taken), then the CORE; escorts drop out of its bay. ABDUCTION (~1 round in
   4): a saucer stops, beams Deputy Duck (range.js's placeholder voxel duck, copied; duck.js untouched) up off the
   planet; shoot it before he is aboard = +500 (duckCameo / duckCameoHit); taken = no penalty, it flies off with him.
   FINALE (the last mothership's core shot with the quota met, versus always): it blows, night sweeps over the globe and
   the city lights spell B.L.A.M., then day comes back (FIN_SLOT s added to the clock).
   Every spawn and pose is a pure function of (seed, tier, variant) and the stage clock; play-dependent things (column
   reveals, landings, the finale) read run.taken only. Stars, shooting stars, satellite, Earth's turn and all FX are
   cosmetic (wall clock x ?slow) and never touch scoring. No shot cap on any variant (magazine + reload).
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, E = R.E, Vox = R.Vox, T = B.Targets;
const clamp = E.clamp, RW = R.RW, RH = R.RH, TAN_H = R.TAN_H, ASP = R.ASPECT, TAU = Math.PI * 2;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH), CPc = Math.cos(R.CAM_PITCH), CPs = Math.sin(R.CAM_PITCH);
const DIAG = Math.sqrt(RW * RW + RH * RH);
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const inPlay = () => !!(B.G && B.G.screenName === 'play');
const slowK = () => { const G = B.G; return G && G.screenName === 'play' && G.slow < 1 && !(G.run && G.run.versus) ? G.slow : 1; };
const NOHIT_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), NOHIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const SHARED_RAY = R.rayAt(0.5, 0.5);          // the engine's shared raycaster (G.shoot -> envShot uses this object)
const MAT_B = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });                 // unlit, baked shade (object class)
const MAT_L = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });               // lit (the duck)
const MAT_ENV = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.5, blending: THREE.NoBlending });
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const _hp = new THREE.Vector3(), _cp = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

// ---------- screen <-> world (steady camera; pure) ----------
function scr(x, y, z) {                                       // world -> [px, py, game px per world unit]
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (RH / 2) / (Math.max(0.1, d) * TAN_H);
  return [RW / 2 + vx * k, RH / 2 - yc * k, k];
}
function dirAt(px, py) {                                      // screen px -> world direction with camera depth 1
  const x = (px / RW * 2 - 1) * TAN_H * ASP, y = (1 - py / RH * 2) * TAN_H;
  return [x, y * CPc + CPs, y * CPs - CPc];
}
function worldAt(px, py, D) { const d = dirAt(px, py); return [CAMP.x + d[0] * D, CAMP.y + d[1] * D, CAMP.z + d[2] * D]; }
const uOf = p => clamp(scr(p[0] != null ? p[0] : p.x, p[1] != null ? p[1] : p.y, p[2] != null ? p[2] : p.z)[0] / RW, 0, 1);

// ---------- EARTH: a big globe; only the visible cap is built ----------
const EC = [0, -84, -25], ER = 80;
function earthD(px, py) {                                     // camera depth of the first hit of the view ray, -1 = sky
  const d = dirAt(px, py), ox = CAMP.x - EC[0], oy = CAMP.y - EC[1], oz = CAMP.z - EC[2];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = ox * d[0] + oy * d[1] + oz * d[2], c = ox * ox + oy * oy + oz * oz - ER * ER;
  const q = b * b - a * c; if (q < 0) return -1;
  const t = (-b - Math.sqrt(q)) / a; return t > 0 ? t : -1;
}
const LIMB = [];                                              // limb row (game px) per screen column
for (let px = 0; px <= RW; px++) { let lo = 0, hi = RH + 40; if (earthD(px, hi) < 0) { LIMB.push(RH + 40); continue; }
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (earthD(px, m) > 0) hi = m; else lo = m; } LIMB.push(hi); }
const limbAt = px => LIMB[clamp(Math.round(px), 0, RW)];
const earthAt = (px, py) => { const D = earthD(px, py); return D > 0 ? worldAt(px, py, D) : null; };

// =========================================================================================
// FX: one InstancedMesh of unlit cubes (one draw call), wall clock x ?slow. Cosmetic only.
// =========================================================================================
const FXN = 2400, F_TW = 1;
const FX = { mesh: null, P: new Float32Array(FXN * 3), V: new Float32Array(FXN * 3), A: new Float32Array(FXN * 8), C: new Uint32Array(FXN), C2: new Uint32Array(FXN), next: 0, last: 0, t: 0, later: [] };
const _col = new THREE.Color();
function fxInit() {
  if (FX.mesh) return FX.mesh;
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), FXN);
  m.frustumCulled = false; m.userData.sharedGeo = true; m.raycast = () => {};
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceMatrix.array.fill(0);
  for (let i = 0; i < FXN; i++) m.setColorAt(i, _col.set(0xffffff));
  m.onBeforeRender = fxStep;
  return (FX.mesh = m);
}
// A: age, life, size, grav, drag, grow, flags, del (frozen until this age: letters hold their shape)
function spark(x, y, z, vx, vy, vz, size, col, life, grav = 0, drag = 0, grow = 0, flags = 0, col2 = 0, del = 0) {
  const i = FX.next = (FX.next + 1) % FXN, p = i * 3, a = i * 8;
  FX.P[p] = x; FX.P[p + 1] = y; FX.P[p + 2] = z; FX.V[p] = vx; FX.V[p + 1] = vy; FX.V[p + 2] = vz;
  FX.A[a] = 0; FX.A[a + 1] = life; FX.A[a + 2] = size; FX.A[a + 3] = grav; FX.A[a + 4] = drag; FX.A[a + 5] = grow; FX.A[a + 6] = flags; FX.A[a + 7] = del;
  FX.C[i] = col; FX.C2[i] = col2 || col;
  if (FX.mesh) { _col.set(col); FX.mesh.instanceColor.setXYZ(i, _col.r, _col.g, _col.b); FX.mesh.instanceColor.needsUpdate = true; }
}
function fxClear() { FX.A.fill(0); FX.later.length = 0; if (FX.mesh) { FX.mesh.instanceMatrix.array.fill(0); FX.mesh.instanceMatrix.needsUpdate = true; } }
const later = (d, fn) => FX.later.push({ at: FX.t + d, fn });
function fxStep() {
  const now = performance.now();
  let dt = FX.last ? Math.min(0.05, (now - FX.last) / 1000) : 0.016; FX.last = now; dt *= slowK();
  FX.t += dt;
  for (let i = FX.later.length - 1; i >= 0; i--) if (FX.t >= FX.later[i].at) { const f = FX.later[i].fn; FX.later.splice(i, 1); try { f(); } catch (e) {} }
  const M = FX.mesh.instanceMatrix.array, IC = FX.mesh.instanceColor; let cd = false;
  for (let i = 0; i < FXN; i++) {
    const a = i * 8, o = i * 16;
    if (FX.A[a + 1] <= 0) { if (M[o] !== 0) M[o] = M[o + 5] = M[o + 10] = 0; continue; }
    const age = FX.A[a] += dt, life = FX.A[a + 1], p = i * 3;
    if (age >= life) { FX.A[a + 1] = 0; M[o] = M[o + 5] = M[o + 10] = 0; continue; }
    if (age >= FX.A[a + 7]) {
      const dr = Math.exp(-FX.A[a + 4] * dt);
      FX.V[p] *= dr; FX.V[p + 1] = FX.V[p + 1] * dr - 3 * FX.A[a + 3] * dt; FX.V[p + 2] *= dr;
      FX.P[p] += FX.V[p] * dt; FX.P[p + 1] += FX.V[p + 1] * dt; FX.P[p + 2] += FX.V[p + 2] * dt;
    }
    if (FX.A[a + 6] & F_TW) { _col.set(((age * 15 + i) | 0) & 1 ? FX.C2[i] : FX.C[i]); IC.setXYZ(i, _col.r, _col.g, _col.b); cd = true; }
    const left = life - age, s = FX.A[a + 2] * (1 + FX.A[a + 5] * age) * (left < 0.25 ? Math.max(0.1, left / 0.25) : 1);
    M[o] = s; M[o + 1] = 0; M[o + 2] = 0; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = s; M[o + 6] = 0; M[o + 7] = 0;
    M[o + 8] = 0; M[o + 9] = 0; M[o + 10] = s; M[o + 11] = 0; M[o + 12] = FX.P[p]; M[o + 13] = FX.P[p + 1]; M[o + 14] = FX.P[p + 2]; M[o + 15] = 1;
  }
  FX.mesh.instanceMatrix.needsUpdate = true; if (cd) IC.needsUpdate = true;
}
const rndDir = () => { const u = R.rnd(-1, 1), a = R.rnd(0, TAU), s = Math.sqrt(1 - u * u); return [s * Math.cos(a), s * Math.sin(a), u]; };
// a saucer breaks: hull chunks in its paint, dome glass, a hot flash, rim-light sparks; space: no gravity, a little drag
function saucerBurst(p, S, sc, tint) {
  const hull = [S.hull, S.hull, S.rim, S.hi, S.under, S.stripe].map(n => PAL[n]), glass = S.dome.map(n => PAL[n]);
  for (let k = 0; k < 8; k++) { const d = rndDir(); spark(p.x, p.y, p.z, d[0] * 1.4 * sc, d[1] * 1.4 * sc, d[2] * sc, R.rnd(0.18, 0.3) * sc, k & 1 ? PAL.bone : PAL.lemon, R.rnd(0.08, 0.16), 0, 3); }
  for (let k = 0; k < 22; k++) { const d = rndDir(), v = R.rnd(2.2, 5.2) * sc; spark(p.x, p.y, p.z, d[0] * v, d[1] * v + 0.4, d[2] * v * 0.6, R.rnd(0.08, 0.16) * sc, tint != null && k % 3 === 0 ? tint : hull[k % hull.length], R.rnd(0.6, 1.1), 0.25, 0.9); }
  for (let k = 0; k < 10; k++) { const d = rndDir(), v = R.rnd(2.5, 4.5) * sc; spark(p.x, p.y + 0.15 * sc, p.z, d[0] * v, Math.abs(d[1]) * v + 0.8, d[2] * v * 0.6, R.rnd(0.05, 0.1) * sc, glass[k % glass.length], R.rnd(0.4, 0.75), 0.15, 1.2, 0, F_TW, PAL.bone); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, v = 3.2 * sc; spark(p.x, p.y, p.z, Math.cos(a) * v, Math.sin(a) * v * 0.4, Math.sin(a) * v * 0.3, 0.07 * sc, PAL[S.lit], 0.35, 0, 2, 0, F_TW, PAL.bone); }
}
// a bomb saucer blows: hot core, fat orange / rust lobes, smoke, soot (the range's flower burst, weightless)
function bombBlast(p, sc = 1) {
  for (let k = 0; k < 8; k++) spark(p.x, p.y, p.z + 0.2, R.rnd(-0.5, 0.5), R.rnd(-0.4, 0.6), R.rnd(0.2, 0.6), R.rnd(0.3, 0.45) * sc, PAL[['lemon', 'bone', 'yellow'][k % 3]], R.rnd(0.2, 0.32), 0, 2);
  const n = 8, a0 = Math.random() * TAU;
  for (let q = 0; q < n; q++) { const a = a0 + q * TAU / n, ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < 7; k++) { const f = R.rnd(0.65, 1), side = R.rnd(-0.25, 0.25), v = 5 * sc * f;
      spark(p.x, p.y, p.z, (ca - sa * side) * v, (sa + ca * side) * v, R.rnd(0.2, 0.8), R.rnd(0.16, 0.24) * sc, f > 0.9 ? (k & 1 ? PAL.orange : PAL.rust) : PAL.yellow, R.rnd(0.55, 0.8), 0, 2.4); } }
  for (let k = 0; k < 10; k++) { const a = k * 0.628; spark(p.x, p.y, p.z - 0.2, Math.cos(a) * 3 * sc, Math.sin(a) * 3 * sc, 0, R.rnd(0.18, 0.26) * sc, PAL[k % 3 ? 'mist' : 'haze'], R.rnd(0.8, 1.0), 0, 2, 0.6); }
  for (let k = 0; k < 10; k++) { const d = rndDir(); spark(p.x, p.y, p.z, d[0] * 3, d[1] * 3, d[2], 0.07 * sc, PAL.void, R.rnd(0.8, 1.3), 0, 0.8); }
}
// a landing: a fireball where it hits the atmosphere, sparks thrown up, a smoke ring
function landFlare(p) {
  for (let k = 0; k < 14; k++) { const d = rndDir(); spark(p[0], p[1] + 0.2, p[2], d[0] * 1.2, Math.abs(d[1]) * 1.6, d[2] * 0.8, R.rnd(0.3, 0.55), PAL[['lemon', 'yellow', 'orange', 'bone'][k % 4]], R.rnd(0.25, 0.5), 0, 2.5, 0.8); }
  for (let k = 0; k < 26; k++) { const d = rndDir(), v = R.rnd(2, 5); spark(p[0], p[1] + 0.2, p[2], d[0] * v, Math.abs(d[1]) * v + 1, d[2] * v * 0.6, R.rnd(0.1, 0.18), PAL[['orange', 'rust', 'amber', 'red'][k % 4]], R.rnd(0.5, 1.0), 0.6, 1.4); }
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; spark(p[0], p[1] + 0.1, p[2], Math.cos(a) * 3, 0.3, Math.sin(a) * 1.5, 0.22, PAL[k & 1 ? 'mist' : 'haze'], R.rnd(0.7, 1.0), -0.05, 1.8, 0.8); }
}
// a miss ricochet on the globe / the mothership hull (B.FX.ricochetColors.invasion, this file): weightless, no floor
function ricochetFx(p, n, dir, metal) {
  const C = (B.FX && B.FX.ricochetColors && B.FX.ricochetColors.invasion) || { hot: ['ice', 'bone', 'cyan', 'lemon'], flakes: ['steel', 'haze'], pop: 'bone', speed: 0.8 };
  const D = p.distanceTo(CAMP), k = Math.max(0.5, D / 9), sp = (C.speed || 1) * 1.9 * k;
  _v1.copy(dir).normalize(); _v1.addScaledVector(n, -2 * _v1.dot(n));
  for (let i = 0; i < 12; i++) { _v2.copy(_v1).multiplyScalar(0.7).addScaledVector(n, 0.6).add(_cp.set(R.rnd(-0.55, 0.55), R.rnd(-0.3, 0.7), R.rnd(-0.55, 0.55))).normalize().multiplyScalar(sp * R.rnd(0.55, 1.35));
    spark(p.x, p.y, p.z, _v2.x, _v2.y, _v2.z, R.rnd(0.026, 0.036) * k, PAL[C.hot[i % C.hot.length]], R.rnd(0.22, 0.45), 0, 1.5, 0, F_TW, PAL.bone); }
  const fl = metal ? C.flakes : ['mist', 'ice', 'bone'];
  for (let i = 0; i < 5; i++) spark(p.x, p.y, p.z, n.x * k + R.rnd(-0.6, 0.6) * k, n.y * k + R.rnd(0.2, 0.9) * k, n.z * k, R.rnd(0.036, 0.05) * k, PAL[fl[i % fl.length]], R.rnd(0.4, 0.8), 0, 1.6);
  if (C.pop) spark(p.x + n.x * 0.03 * k, p.y + n.y * 0.03 * k, p.z + n.z * 0.03 * k, 0, 0, 0, 0.07 * k, PAL[C.pop], 0.07);
}
// star-dust letters (WAVE n): one cube per bold-font pixel, held, then they scatter
function dustText(str, py, D, cols) {
  const t = R.bold(str), cx = RW / 2, perPx = 2 * D * TAN_H / RH, S = 4.2 * perPx;
  const x0 = -t.w * S / 2, c0 = worldAt(cx, py, D);
  for (const [px, ry] of t.px) {
    const x = c0[0] + x0 + (px + 0.5) * S, y = c0[1] + (3 - ry) * S * CPc, z = c0[2] + (3 - ry) * S * CPs, d = rndDir(), hold = 1.15 + R.rnd(0, 0.25);
    spark(x, y, z, d[0] * 2.4, d[1] * 2.4, d[2], S * 0.92, PAL[cols[Math.min(cols.length - 1, ry)]], hold + R.rnd(0.5, 0.8), 0, 1.6, 0, ry < 2 ? F_TW : 0, PAL.bone, hold);
  }
}
const WAVE_COLS = ['lemon', 'lemon', 'yellow', 'yellow', 'amber', 'orange', 'orange'];

// =========================================================================================
// THE SET. Far set (void backdrop, nebula wash, 760 stars that twinkle, the moon), Earth (custom shader), the
// atmosphere rim, the B.L.A.M. satellite, the FX particles, the env proxy (miss sparks). 6-7 draw calls.
// =========================================================================================
const FAR_VS = `attribute vec3 aCol; attribute float aW; uniform float uTime; varying vec3 vC; varying float vA;
void main(){ vC = aCol; vA = 0.5;
  if (aW < 0.0) { float tw = 0.55 + 0.45 * sin(uTime * (1.5 + fract(-aW * 7.31) * 3.0) - aW * 13.7); vC *= tw; vA = 1.0; }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FAR_FS = `varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, vA); }`;
const FU = { uTime: { value: 0 } };
class FarVox extends Vox {
  constructor() { super(); this.w = []; this.wv = 0; }
  box(x, y, z, w, h, d, col, m, mask = 63) { const n0 = this.vc; super.box(x, y, z, w, h, d, col, m, mask); for (let i = n0; i < this.vc; i++) this.w.push(this.wv); return this; }
  geo() { const g = super.geo(); g.setAttribute('aCol', g.attributes.color); g.deleteAttribute('color'); g.deleteAttribute('normal'); g.setAttribute('aW', new THREE.Float32BufferAttribute(this.w, 1)); return g; }
}
const SKY_Z = -52, MOON = { x: -31, y: 16.2, r: 3.1 };
function buildFar() {
  const v = new FarVox(), rng = B.Stage.mulberry32(0x0b17a), F = 16;
  for (let y = -10; y < 34; y += 2) for (let x = -56; x < 56; x += 8) v.bx(x, y, SKY_Z - 0.5, x + 8, y + 2, SKY_Z - 0.49, PAL.void, null, F);
  // a faint diagonal band of nebula (dithered midnight / indigo / plum patches) and the dim stars of the galaxy
  for (let k = 0; k < 150; k++) { const f = rng(), x = -50 + f * 100 + rng.range(-2, 2), y = 26 - f * 22 + rng.range(-3, 3) * (0.4 + rng()), s = rng.range(0.5, 1.5);
    v.bx(x, y, SKY_Z - 0.45 + k * 0.001, x + s, y + s * 0.5, SKY_Z - 0.44 + k * 0.001, [PAL.midnight, PAL.midnight, PAL.midnight, PAL.indigo, PAL.navy][(rng() * 5) | 0], null, F); }
  for (let k = 0; k < 260; k++) { const f = rng(), x = -50 + f * 100 + rng.range(-2, 2), y = 26 - f * 22 + rng.range(-4, 4), s = 0.22;
    v.wv = -(0.02 + rng()); v.bx(x, y, SKY_Z, x + s, y + s, SKY_Z + 0.01, [PAL.steel, PAL.haze, PAL.slate, PAL.mist][(rng() * 4) | 0], null, F); }
  for (let k = 0; k < 500; k++) {
    const x = rng.range(-52, 52), y = rng.range(-8, 32), big = rng() < 0.12, s = big ? 0.44 : 0.22;
    v.wv = -(0.02 + rng()); v.bx(x, y, SKY_Z + 0.02, x + s, y + s, SKY_Z + 0.03, [PAL.bone, PAL.mist, PAL.lemon, PAL.ice, PAL.bone, PAL.coral][(rng() * 6) | 0], null, F);
    if (big && rng() < 0.5) { v.bx(x - s * 0.5, y + s * 0.25, SKY_Z + 0.025, x + s * 1.5, y + s * 0.75, SKY_Z + 0.035, PAL.haze, null, F); v.bx(x + s * 0.25, y - s * 0.5, SKY_Z + 0.025, x + s * 0.75, y + s * 1.5, SKY_Z + 0.035, PAL.haze, null, F); }
  }
  v.wv = 0;
  // the moon: a pixel disc, lit from the left, craters, a dark limb on the right
  { const g = 0.21, r = MOON.r;
    for (let i = -16; i <= 16; i++) for (let j = -16; j <= 16; j++) {
      const x = (i + 0.5) * g, y = (j + 0.5) * g, d = hyp(x, y); if (d > r) continue;
      const lit = (-x * 0.75 + y * 0.35) / r, cr = hyp(x + 0.9, y - 0.7) < 0.75 || hyp(x - 0.8, y + 1.0) < 0.55 || hyp(x - 1.4, y - 1.2) < 0.35 || hyp(x + 0.2, y + 1.9) < 0.4;
      const c = d > r - 0.25 && lit < -0.2 ? PAL.slate : lit < -0.45 ? PAL.haze : cr ? (lit > 0.2 ? PAL.mist : PAL.haze) : lit > 0.35 ? PAL.bone : PAL.mist;
      v.bx(MOON.x + i * g, MOON.y + j * g, SKY_Z + 0.2, MOON.x + (i + 1) * g, MOON.y + (j + 1) * g, SKY_Z + 0.21, c, null, F);
    } }
  const m = new THREE.Mesh(v.geo(), new THREE.ShaderMaterial({ uniforms: FU, vertexShader: FAR_VS, fragmentShader: FAR_FS }));
  m.frustumCulled = false; m.raycast = () => {};
  return m;
}
// ---------- the globe: a heightfield of voxel columns over the visible cap (tops + the risers facing us) ----------
// Its colours come from the vertex shader: per cell (aC = the cell's surface point) a continent / cloud / ice field on
// the globe turned by uRot, lit by uSun (day / dusk / night), city lights on the night side's land (object dither
// class), landing flares (uFl), and the finale's night sweep (uNight; the letters are their own mesh, buildLetters).
const glc = h => `vec3(${(((h >> 16) & 255) / 255).toFixed(4)},${(((h >> 8) & 255) / 255).toFixed(4)},${((h & 255) / 255).toFixed(4)})`;
const EARTH_VS = `
attribute vec3 aC; attribute float aS;
uniform float uRot, uTime, uFinT, uFinA, uNight; uniform vec3 uSun, uAxis; uniform vec4 uFl[4];
varying vec3 vC; varying float vA;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0,0.0,0.0)), f.x), mix(h3(i + vec3(0.0,1.0,0.0)), h3(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0,0.0,1.0)), h3(i + vec3(1.0,0.0,1.0)), f.x), mix(h3(i + vec3(0.0,1.0,1.0)), h3(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z); }
float fbm(vec3 p){ return 0.55 * vn(p) + 0.3 * vn(p * 2.03 + 3.1) + 0.15 * vn(p * 4.1 + 7.7); }
vec3 rotA(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
void main(){
  vec3 n = normalize(aC - vec3(${EC[0].toFixed(1)}, ${EC[1].toFixed(1)}, ${EC[2].toFixed(1)}));
  vec3 q = rotA(n, uAxis, uRot);
  float l = fbm(q * 3.6 + 1.7) + 0.07 * vn(q * 13.0);
  float land = step(0.52, l), coast = step(0.49, l) * (1.0 - land);
  float lat = abs(dot(q, uAxis));
  float ice = step(0.8, lat + 0.07 * vn(q * 8.0));
  float cl = fbm(rotA(n, uAxis, uRot * 1.6 + 1.3) * 4.4 + vec3(0.0, uTime * 0.006, 0.0));
  float cloud = step(0.6, cl);
  float day = dot(n, uSun) - uNight;
  vec3 cd = land > 0.5 ? (l > 0.67 ? ${glc(PAL.sand)} : l > 0.6 ? ${glc(PAL.forest)} : ${glc(PAL.green)}) : (coast > 0.5 ? ${glc(PAL.blue)} : ${glc(PAL.deepblue)});
  if (ice > 0.5) cd = land > 0.5 ? ${glc(PAL.bone)} : ${glc(PAL.mist)};
  if (cloud > 0.5) cd = cl > 0.69 ? ${glc(PAL.bone)} : ${glc(PAL.mist)};
  vec3 vd = normalize(cameraPosition - aC);
  float graze = 1.0 - max(0.0, dot(n, vd));
  vec3 col = cd * clamp(0.74 + 0.4 * day, 0.0, 1.06) * aS;
  col = mix(col, ${glc(PAL.ice)}, smoothstep(0.8, 0.985, graze) * 0.5);          // the day side's haze at the limb
  vec3 cn = land > 0.5 ? ${glc(PAL.midnight)} : ${glc(PAL.void)};
  if (cloud > 0.5) cn = ${glc(PAL.navy)};
  cn = mix(cn, ${glc(PAL.deepblue)}, smoothstep(0.82, 0.985, graze) * 0.6);
  float dk = smoothstep(0.02, -0.02, day);
  col = mix(col, cn * aS, dk);
  float dusk = 1.0 - smoothstep(0.0, 0.028, abs(day));
  col = mix(col, ${glc(PAL.rust)} * aS, dusk * 0.4 * (1.0 - 0.5 * cloud));
  float al = 0.5;
  if (land * (1.0 - cloud) * dk > 0.5 && vn(q * 24.0) > 0.66 && vn(q * 5.0 + 2.0) > 0.42) { col = vn(q * 43.0) > 0.5 ? ${glc(PAL.lemon)} : ${glc(PAL.amber)}; al = 1.0; }
  for (int i = 0; i < 4; i++) { vec4 f = uFl[i]; if (f.w <= 0.0) continue;
    float d = distance(aC, f.xyz), k = f.w * (1.0 - d / (0.9 + 2.2 * (1.0 - f.w)));
    if (k > 0.0) { col = k > 0.55 ? ${glc(PAL.lemon)} : k > 0.3 ? ${glc(PAL.orange)} : k > 0.12 ? ${glc(PAL.rust)} : mix(col, ${glc(PAL.crimson)}, 0.6); al = 1.0; } }
  vC = col; vA = al;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const EARTH_FS = `varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, vA); }`;
const SUN0 = new THREE.Vector3(-1, 0.075, -0.32).normalize();
const EU = { uRot: { value: 0.4 }, uTime: { value: 0 }, uFinT: { value: 0 }, uFinA: { value: 0 }, uNight: { value: 0 }, uSun: { value: SUN0.clone() },
  uAxis: { value: new THREE.Vector3(0.12, 0.34, 0.93).normalize() }, uFl: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) } };
const EARTH = { fin: -1, flI: 0, last: 0, t: 0 };
const CS = 0.42;                                             // column size (world)
const LET = { pw: 6, ph: 5, cx: 178, cy: 169 };              // finale letters: game px per letter pixel, centre (clear of the HUD pill and the gun)
function buildEarth() {
  const pos = [], ac = [], as = [], idx = []; let vc = 0;
  const surfY = (x, z) => { const q = ER * ER - x * x - (z - EC[2]) * (z - EC[2]); return q > 0 ? EC[1] + Math.sqrt(q) : -1e9; };
  const hq = (x, z) => Math.round(surfY(x, z) / CS) * CS;
  const quad = (v, c, f, s) => { for (const p of v) { pos.push(p[0], p[1], p[2]); ac.push(c[0], c[1], c[2]); as.push(s); } idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3); vc += 4; };
  for (let gx = -112; gx < 112; gx++) for (let gz = -100; gz < -12; gz++) {
    const x0 = gx * CS, x1 = x0 + CS, z0 = gz * CS, z1 = z0 + CS, cx = x0 + CS / 2, cz = z0 + CS / 2, y = hq(cx, cz);
    if (y < -60) continue;
    const yt = y, s = scr(cx, yt, cz);
    if (s[0] < -14 || s[0] > RW + 14 || s[1] > RH + 14 || s[1] < limbAt(clamp(s[0], 0, RW)) - 10) continue;
    const sy = surfY(cx, cz), nx = cx - EC[0], ny = sy - EC[1], nz = cz - EC[2];
    if (nx * (CAMP.x - cx) + ny * (CAMP.y - sy) + nz * (CAMP.z - cz) <= 0) continue;   // facing away (behind the limb)
    const c = [cx, sy, cz];
    const f = 0;
    quad([[x0, yt, z1], [x1, yt, z1], [x1, yt, z0], [x0, yt, z0]], c, f, 1.0);
    const yf = hq(cx, cz + CS);                                 // the riser toward us, where the next column down is lower
    if (yf < yt - 1e-6 && cz > EC[2]) quad([[x0, yf, z1], [x1, yf, z1], [x1, yt, z1], [x0, yt, z1]], c, f, 0.9);
    const ys = hq(cx + (cx > 0 ? -CS : CS), cz);                // the side riser toward the middle (silhouette steps)
    if (ys < yt - 1e-6) { if (cx > 0) quad([[x0, ys, z0], [x0, ys, z1], [x0, yt, z1], [x0, yt, z0]], c, f, 0.86); else quad([[x1, ys, z1], [x1, ys, z0], [x1, yt, z0], [x1, yt, z1]], c, f, 0.86); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aC', new THREE.Float32BufferAttribute(ac, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(as, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: EU, vertexShader: EARTH_VS, fragmentShader: EARTH_FS }));
  m.frustumCulled = false; m.raycast = () => {}; m.onBeforeRender = envStep;
  EARTH.quads = vc / 4;
  return m;
}
// the finale's city lights: 2 x 2 light dots per letter pixel of B.L.A.M., laid on the globe under their screen spots
// (crisp at every depth: each dot ~2 game px), revealed left to right by the same uniforms as the night sweep
const LET_VS = `attribute vec3 aCol; attribute float aR; uniform float uFinT, uFinA, uTime; varying vec3 vC; varying float vK;
void main(){ vK = (uFinA > 0.0 && uFinT > 0.5 + aR * 0.9) ? uFinA : 0.0;
  float tw = fract(sin(aR * 917.0 + position.x * 13.1 + floor(uTime * 7.0)) * 43758.5);
  vC = tw > 0.82 ? ${glc(PAL.bone)} : aCol;
  gl_Position = vK > 0.0 ? projectionMatrix * modelViewMatrix * vec4(position, 1.0) : vec4(2.0, 2.0, 2.0, 1.0); }`;
const LET_FS = `varying vec3 vC; varying float vK; void main(){ if (vK < 0.5) discard; gl_FragColor = vec4(vC, 1.0); }`;
function buildLetters() {
  const L = R.bold('B.L.A.M.'), LX0 = LET.cx - L.w * LET.pw / 2, LY0 = LET.cy - 3.5 * LET.ph, v = new Vox(), ar = [];
  for (const [lx, ly] of L.px) for (const [dx, dy] of [[0.27, 0.3], [0.73, 0.3], [0.27, 0.75], [0.73, 0.75]]) {
    const px = LX0 + (lx + dx) * LET.pw, py = LY0 + (ly + dy) * LET.ph, D = earthD(px, py); if (D <= 0) continue;
    const P = worldAt(px, py, D), s = 2.3 * 2 * D * TAN_H / RH, n0 = v.vc;
    v.box(P[0], P[1] + s * 0.75, P[2], s, s, s, PAL[hash1(lx * 31 + ly * 7 + Math.round(dx * 10)) < 0.3 ? 'amber' : 'lemon']);
    for (let i = n0; i < v.vc; i++) ar.push(lx / L.w);
  }
  const g = v.geo(); g.setAttribute('aCol', g.attributes.color); g.deleteAttribute('color'); g.deleteAttribute('normal'); g.setAttribute('aR', new THREE.Float32BufferAttribute(ar, 1));
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uFinT: EU.uFinT, uFinA: EU.uFinA, uTime: EU.uTime }, vertexShader: LET_VS, fragmentShader: LET_FS }));
  m.frustumCulled = false; m.raycast = () => {}; m.renderOrder = 2;
  return m;
}
// the atmosphere rim: three thin glowing layers just above the limb (cyan / blue / deep blue; dimmer on the night side)
function buildAtmo() {
  const v = new Vox();
  for (let px = 0; px <= RW; px += 2) {
    const py = limbAt(px); if (py <= 0 || py >= RH + 4) continue;
    const P = earthAt(px, Math.min(RH - 0.5, py + 0.25)); if (!P) continue;
    const n = [(P[0] - EC[0]) / ER, (P[1] - EC[1]) / ER, (P[2] - EC[2]) / ER], k = scr(P[0], P[1], P[2])[2], w = 2.6 / k;
    const day = n[0] * SUN0.x + n[1] * SUN0.y + n[2] * SUN0.z;
    const cols = day > 0.02 ? ['ice', 'cyan', 'blue', 'deepblue'] : day > -0.04 ? ['coral', 'magenta', 'plum', 'indigo'] : ['blue', 'deepblue', 'indigo', 'midnight'];
    [0.12, 0.42, 0.78, 1.2].forEach((h, i) => v.box(P[0] + n[0] * h, P[1] + n[1] * h, P[2] + n[2] * h, w, 0.34 + i * 0.06, w, PAL[cols[i]]));
  }
  const m = new THREE.Mesh(v.geo(), MAT_B); m.frustumCulled = false; m.raycast = () => {};
  return m;
}
// ---------- the B.L.A.M. satellite (looks only): body, gold foil, two solar panels with B.L. / A.M. on them, a dish ----------
const SAT = { group: null, dish: null, next: 0, t0: -1, dur: 26, side: 1, y: 11, z: -30 };
function buildSat() {
  const g = new THREE.Group(), v = new Vox(), sh = [0.75, 0.75, 1, 0.55, 0.92, 0.6], s = 0.17;
  v.shade = sh;
  v.bx(-0.55, -0.45, -0.45, 0.55, 0.45, 0.45, PAL.mist); v.bx(-0.56, -0.2, 0.46, 0.56, 0.3, 0.47, PAL.amber); v.bx(-0.2, -0.38, 0.46, 0.2, -0.24, 0.48, PAL.rust);
  v.bx(-0.12, 0.45, -0.12, 0.12, 0.75, 0.12, PAL.steel);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -0.55 : 0.55, txt = R.small(side < 0 ? 'B.L.' : 'A.M.'), L = txt.w * s + 0.5;
    v.bx(Math.min(x0, x0 + side * 0.55), -0.05, -0.05, Math.max(x0, x0 + side * 0.55), 0.05, 0.05, PAL.haze);       // the strut
    const px0 = x0 + side * 0.55, xa = side < 0 ? px0 - L : px0;
    v.bx(xa, -0.62, -0.06, xa + L, 0.62, 0.06, PAL.deepblue);
    for (let gx = xa + 0.42; gx < xa + L - 0.1; gx += 0.42) v.bx(gx - 0.015, -0.6, 0.06, gx + 0.015, 0.6, 0.075, PAL.blue);
    v.bx(xa, -0.64, 0.06, xa + L, -0.6, 0.08, PAL.steel); v.bx(xa, 0.6, 0.06, xa + L, 0.64, 0.08, PAL.steel);
    for (const [px, py] of txt.px) v.bx(xa + 0.25 + px * s, 0.42 - (py + 1) * s, 0.07, xa + 0.25 + (px + 1) * s, 0.42 - py * s, 0.1, PAL.bone);
  }
  v.shade = null;
  v.bx(-0.06, 0.75, -0.06, 0.06, 0.82, 0.06, PAL.red);
  const body = new THREE.Mesh(v.geo(), MAT_B); body.raycast = () => {}; g.add(body);
  const dv = new Vox(); dv.shade = sh;
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) { const d = hyp(i, k); if (d > 3.3) continue; dv.box(i * 0.09, 0.1 + d * d * 0.012, k * 0.09, 0.09, 0.05, 0.09, d > 2.4 ? PAL.haze : PAL.bone); }
  dv.box(0, 0.25, 0, 0.04, 0.3, 0.04, PAL.steel); dv.box(0, 0.42, 0, 0.07, 0.07, 0.07, PAL.lemon);
  const dish = new THREE.Mesh(dv.geo(), MAT_B); dish.raycast = () => {}; dish.position.y = 0.75; dish.rotation.x = 0.5; g.add(dish);
  g.visible = false; SAT.group = g; SAT.dish = dish;
  return g;
}
function satStep(now, dt) {
  if (!SAT.next) SAT.next = now + R.rnd(5, 9);
  if (SAT.t0 < 0) {
    if (now < SAT.next) { SAT.group.visible = false; return; }
    SAT.t0 = now; SAT.side = Math.random() < 0.5 ? -1 : 1; SAT.y = R.rnd(10.5, 13.5); SAT.z = R.rnd(-34, -28); SAT.dur = R.rnd(24, 32); SAT.spin = R.rnd(-0.12, 0.12);
  }
  const f = (now - SAT.t0) / SAT.dur;
  if (f >= 1) { SAT.t0 = -1; SAT.next = now + R.rnd(38, 64); SAT.group.visible = false; return; }
  const g = SAT.group; g.visible = true;
  g.position.set(SAT.side * (-38 + 76 * f), SAT.y + 1.6 * Math.sin(f * 3.1), SAT.z);
  g.rotation.set(0.25, -0.35 * SAT.side + 0.2 * Math.sin(f * 4), 0.18 * Math.sin(f * 2.3) + SAT.spin);
  SAT.dish.rotation.y += dt * 1.4;
}
// ---------- shooting stars (looks only): a quick streak somewhere in the star field every 10-20 s ----------
const STARS = { next: 0, live: [] };
function starStep(now, dt) {
  if (!STARS.next) STARS.next = now + R.rnd(3, 8);
  if (now >= STARS.next) {
    STARS.next = now + R.rnd(10, 20);
    const px = R.rnd(30, RW - 30), py = R.rnd(8, Math.max(20, limbAt(px) - 40)), p = worldAt(px, py, 50), a = R.rnd(-2.6, -0.5) + (Math.random() < 0.5 ? 0 : Math.PI * 0.0);
    const dir = Math.random() < 0.5 ? 1 : -1, sp = R.rnd(26, 40);
    STARS.live.push({ x: p[0], y: p[1], z: Math.max(SKY_Z + 2, p[2]), vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp * 0.6, t: 0, life: R.rnd(0.35, 0.6) });
    if (inPlay()) B.SFX.play('shootingStar', { u: px / RW });
  }
  for (let i = STARS.live.length - 1; i >= 0; i--) {
    const s = STARS.live[i]; s.t += dt;
    if (s.t >= s.life) { STARS.live.splice(i, 1); continue; }
    const n = Math.max(1, Math.round(dt * 90));
    for (let k = 0; k < n; k++) {
      const f = k / n; s.x += s.vx * dt / n; s.y += s.vy * dt / n;
      spark(s.x, s.y, s.z, 0, 0, 0, 0.32, f < 0.5 ? PAL.bone : PAL.mist, 0.05, 0);
      spark(s.x, s.y, s.z - 0.02, 0, 0, 0, 0.2, Math.random() < 0.5 ? PAL.ice : PAL.haze, R.rnd(0.18, 0.32), 0, 0);
    }
  }
}
// the env's per-frame step (the globe's onBeforeRender): Earth's turn, landing flares, the finale's night + letters,
// the satellite, shooting stars. Wall clock x ?slow, cosmetic.
function envStep() {
  const now = performance.now() / 1000, dt0 = EARTH.last ? Math.min(0.05, now - EARTH.last) : 0.016; EARTH.last = now;
  const dt = dt0 * slowK(); EARTH.t += dt;
  EU.uRot.value += dt * 0.012; EU.uTime.value = EARTH.t; FU.uTime.value = EARTH.t;
  for (const f of EU.uFl.value) if (f.w > 0) f.w = Math.max(0, f.w - dt * 0.55);
  if (EARTH.fin >= 0) {
    const q = EARTH.t - EARTH.fin;
    EU.uFinT.value = q;
    EU.uNight.value = 1.25 * (q < 0.9 ? E.inOut(q / 0.9) : q < 3.5 ? 1 : Math.max(0, 1 - E.inOut((q - 3.5) / 1.0)));
    EU.uFinA.value = q < 3.1 ? 1 : Math.max(0, 1 - (q - 3.1) / 0.6);
    if (q > 4.6) { EARTH.fin = -1; EU.uNight.value = 0; EU.uFinA.value = 0; }
  }
  satStep(now, dt); starStep(now, dt);
}
function earthFlare(p) { const f = EU.uFl.value[EARTH.flI = (EARTH.flI + 1) % 4]; f.set(p[0], p[1], p[2], 1); }
function earthReset() { EARTH.fin = -1; EU.uNight.value = 0; EU.uFinA.value = 0; EU.uFinT.value = 0; for (const f of EU.uFl.value) f.w = 0; }
// the env's only shootable: a proxy that finds the globe / a mothership hull under a missed shot and throws the stage's
// own sparks there. It never reports an intersection: the engine's square bullet hole and floor-bouncing chips would
// sit wrong in orbit (chips bounce on y = 0, which is in mid space here); the tracer flies on and the globe hides it.
const MS_HULLS = new Set();
function envRaycast(rc) {
  if (rc !== SHARED_RAY || !inPlay()) return;
  let best = null;
  for (const m of MS_HULLS) { if (!m.visible || !m.parent || !m.parent.visible) continue; const h = rc.intersectObject(m, false)[0]; if (h && (!best || h.distance < best.distance)) best = { p: h.point.clone(), n: h.face ? h.face.normal.clone().transformDirection(m.matrixWorld) : new THREE.Vector3(0, 0, 1), metal: true, distance: h.distance }; }
  if (!best) {
    const o = rc.ray.origin, d = rc.ray.direction, ox = o.x - EC[0], oy = o.y - EC[1], oz = o.z - EC[2];
    const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - ER * ER, q = b * b - c;
    if (q >= 0) { const t = -b - Math.sqrt(q); if (t > 0) { const p = new THREE.Vector3().copy(d).multiplyScalar(t).add(o); best = { p, n: new THREE.Vector3(p.x - EC[0], p.y - EC[1], p.z - EC[2]).normalize(), metal: false }; } }
  }
  if (best) ricochetFx(best.p, best.n, rc.ray.direction, best.metal);
}
function buildEnv() {
  const group = new THREE.Group();
  group.add(buildFar(), buildEarth(), buildLetters(), buildAtmo(), buildSat(), fxInit());
  const proxy = new THREE.Mesh(NOHIT_GEO, NOHIT_MAT); proxy.userData.sharedGeo = true; proxy.raycast = envRaycast;
  group.add(proxy);
  group.userData.shootables = [proxy];
  return group;
}

// =========================================================================================
// SAUCER ART: tin-toy voxel lenses, one unlit mesh with baked face shade each (1 draw call a saucer); two geometries
// per look (the rim lights chase by swapping them). Sizes S / M / L; four paint schemes; the bomb (skull-painted iron,
// red dome, fuse); the decoy's cardboard disguise (its own mesh, it flies off in the build-up).
// =========================================================================================
const SZ_V = [0.084, 0.11, 0.142];                           // voxel size per size (hull radius 7 voxels)
const SR = SZ_V.map(s => s * 7.3);                           // world radius
const SCHEMES = [
  { hull: 'red', hi: 'coral', rim: 'crimson', under: 'oxblood', stripe: 'bone', collar: 'steel', dome: ['cyan', 'ice', 'bone'], lit: 'lemon', dim: 'amber' },
  { hull: 'blue', hi: 'cyan', rim: 'deepblue', under: 'navy', stripe: 'yellow', collar: 'haze', dome: ['lime', 'lemon', 'bone'], lit: 'lemon', dim: 'orange' },
  { hull: 'mist', hi: 'bone', rim: 'steel', under: 'slate', stripe: 'red', collar: 'haze', dome: ['pink', 'bubblegum', 'bone'], lit: 'red', dim: 'coral' },
  { hull: 'yellow', hi: 'lemon', rim: 'amber', under: 'rust', stripe: 'red', collar: 'steel', dome: ['cyan', 'ice', 'bone'], lit: 'cyan', dim: 'blue' }
];
const BOMB_S = { hull: 'navy', hi: 'slate', rim: 'midnight', under: 'void', stripe: 'crimson', collar: 'slate', dome: ['red', 'coral', 'lemon'], lit: 'orange', dim: 'red' };
const SH = [0.78, 0.78, 1.0, 0.52, 0.92, 0.62], SHG = [0.94, 0.94, 1.0, 0.85, 1.0, 0.9];
const PROF = [[-1, 5], [0, 7], [1, 6], [2, 4.4]], DOMEP = [[3, 3.1], [4, 2.7], [5, 1.7]];
const SKULL = { 2: '.XXXXX.', 1: 'XVVXVVX', 0: 'XXXVXXX', '-1': '.XVXVX.' };
const kmax = (i, r) => Math.floor(Math.sqrt(Math.max(0, (r + 0.35) * (r + 0.35) - i * i)));
const lightAt = (i, k, ph) => { const a = Math.atan2(k, i), idx = ((Math.round((a / TAU + 1) * 16) % 16) + 16) % 16; return (idx & 1) === ph; };
function saucerGeo(S, s, ph, bomb) {
  const hull = [], glow = [];
  for (const [j, r] of PROF) for (let i = -8; i <= 8; i++) for (let k = -8; k <= 8; k++) {
    const d = hyp(i, k); if (d > r + 0.35) continue;
    let c = j === -1 ? S.under : j === 0 ? S.rim : j === 1 ? ((i < 0 && k > 0 && d > 2.4 && d < 4.8) || (k > 0 && d > r - 0.9 && i < 2) ? S.hi : S.hull) : (d > r - 1 ? S.stripe : S.collar);
    if (j === 0 && d > r - 1.1 && lightAt(i, k, 0) && !(bomb && Math.abs(i) <= 3 && k > 0)) { glow.push([i, j, k, PAL[ph ? S.lit : S.dim]]); continue; }
    if (j === 0 && d > r - 1.1 && !(bomb && Math.abs(i) <= 3 && k > 0)) { glow.push([i, j, k, PAL[ph ? S.dim : S.lit]]); continue; }
    if (bomb && k > 0 && k === kmax(i, r) && Math.abs(i) <= 3) { const ch = (SKULL[j] || '')[i + 3]; if (ch === 'X') c = 'bone'; else if (ch === 'V') c = 'void'; }
    hull.push([i, j, k, PAL[c]]);
  }
  for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) { const d = hyp(i, k); if (d <= 2.3) glow.push([i, -2, k, PAL[d < 1.2 ? (ph ? 'lemon' : 'bone') : S.dim]]); }
  for (const [j, r] of DOMEP) for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) {
    const d = hyp(i, k); if (d > r + 0.3) continue;
    glow.push([i, j, k, PAL[(i <= -1 && k >= 0 && j >= 4) || (i === -2 && k === 1) ? S.dome[2] : (i < 0 || j === 5) ? S.dome[1] : S.dome[0]]]);
  }
  if (bomb) { hull.push([0, 6, 0, PAL.umber], [0, 7, 0, PAL.walnut]); }
  const v = new Vox(); v.shade = SH; v.vox(hull, s); v.shade = SHG; v.vox(glow, s);
  return v.geo();
}
// the decoy disguise: a cardboard disc painted like the red tin scheme (sloppy, corrugated tan edge, crayon lights),
// a cardboard dome scribbled cyan in crayon, a strip of tape; drawn a hair bigger than the bomb hull under it
function decoyGeo(s) {
  const list = [], vh = (i, j, k) => hash1(i * 73 + j * 151 + k * 31 + 7);
  for (let i = -8; i <= 8; i++) for (let k = -8; k <= 8; k++) {
    const d = hyp(i, k); if (d > 7.55) continue;
    const r = vh(i, 1, k), edge = d > 6.6;
    list.push([i, 1, k, PAL[edge ? (((i + k) & 1) ? 'tan' : 'sand') : r < 0.13 ? 'tan' : (Math.round(Math.atan2(k, i) / TAU * 14) & 1) && d > 5.2 ? 'lemon' : r < 0.45 ? 'crimson' : 'red']]);
    if (d <= 4.7) list.push([i, 2, k, PAL[d > 3.7 ? (vh(i, 2, k) < 0.25 ? 'tan' : 'bone') : vh(i, 2, k) < 0.4 ? 'sand' : 'tan']]);
  }
  for (const [j, r] of [[3, 3.4], [4, 3.0], [5, 2.0]]) for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) {
    const d = hyp(i, k); if (d > r + 0.3) continue;
    const q = vh(i, j, k);
    list.push([i, j, k, PAL[j === 3 && k >= 2 && Math.abs(i) <= 3 ? (q < 0.3 ? 'haze' : 'mist') : q < 0.22 ? 'tan' : q < 0.3 ? 'sand' : (i < 0 && j >= 4 && q < 0.5) ? 'ice' : 'cyan']]);
  }
  const v = new Vox(); v.shade = SH; v.vox(list, s * 1.06, 0, s * 0.18, 0);
  return v.geo();
}
function sparkGeo() {
  const v = new Vox();
  v.box(0, 0, 0, 0.1, 0.1, 0.1, PAL.lemon);
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) v.box(x * 0.09, y * 0.09, 0, 0.07, 0.07, 0.07, x + y > 0 ? PAL.orange : PAL.yellow);
  return v.geo();
}
let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = { real: SCHEMES.map(S => SZ_V.map(s => [saucerGeo(S, s, 0), saucerGeo(S, s, 1)])), bomb: SZ_V.map(s => [saucerGeo(BOMB_S, s, 0, true), saucerGeo(BOMB_S, s, 1, true)]),
    decoy: SZ_V.map(s => decoyGeo(s)), spark: sparkGeo() };
  GEO.ms = [msGeo(0), msGeo(1)]; GEO.shield = shieldGeo(); GEO.core = coreGeo(); GEO.duck = DUCK.geo; GEO.beam = [0, 1, 2].map(beamGeo);
  return GEO;
}
// ---------- the MOTHERSHIP: a big plum tin saucer, a ring of chasing lights, a lime dome, a core bay in the front of
// the rim (the core glows dimly in it; the CORE target and the SHIELD plates sit there) ----------
const MS_V = 0.22, MS_R = 15 * MS_V, MS_S = { hull: 'plum', hi: 'magenta', rim: 'magenta', under: 'indigo', stripe: 'pink', collar: 'steel', dome: ['lime', 'lemon', 'bone'], lit: 'lemon', dim: 'amber' };
const BAY_Z = (15 - 1.6) * MS_V, SHIELD_Z = 15 * MS_V + 0.16, BAY_Y = -3.2 * MS_V, MS_TILT = 0.28, MTc = Math.cos(MS_TILT), MTs = Math.sin(MS_TILT);
function msGeo(ph) {
  const S = MS_S, hull = [], glow = [];
  const P = [[-3, 6], [-2, 10], [-1, 13], [0, 15], [1, 14], [2, 11], [3, 7.5]];
  for (const [j, r] of P) for (let i = -16; i <= 16; i++) for (let k = -16; k <= 16; k++) {
    const d = hyp(i, k); if (d > r + 0.35) continue;
    const bay = Math.abs(i) <= 3 && j >= -1 && j <= 1 && k > 0;
    if (bay && k > kmax(i, 15) - 3) continue;                           // the core bay: a hole in the front of the rim
    if (bay && k === kmax(i, 15) - 3) { hull.push([i, j, k, PAL.void]); continue; }
    if (j === -3) { if (d < 3.2) glow.push([i, j, k, PAL[d < 2 ? 'void' : ph ? 'amber' : 'orange']]); else hull.push([i, j, k, PAL.under === undefined ? PAL.indigo : PAL[S.under]]); continue; }
    if (j === 0 && d > r - 1.1) { glow.push([i, j, k, PAL[lightAt(i, k, ph) ? S.lit : S.dim]]); continue; }
    const c = j < 0 ? (d > r - 1.2 ? S.hull : S.under) : j === 1 ? ((i < 0 && k > 0 && d > 5 && d < 10) ? S.hi : S.hull) : j === 2 ? (d > r - 1.2 ? S.stripe : S.hull) : S.collar;
    hull.push([i, j, k, PAL[c]]);
  }
  for (const [j, r] of [[4, 6.4], [5, 5.9], [6, 4.8], [7, 3.0]]) for (let i = -7; i <= 7; i++) for (let k = -7; k <= 7; k++) {
    const d = hyp(i, k); if (d > r + 0.3) continue;
    glow.push([i, j, k, PAL[(i <= -2 && k >= 1 && j >= 5 && d > 1.5) ? S.dome[2] : (i < 0 || j >= 6) ? S.dome[1] : S.dome[0]]]);
  }
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) glow.push([i, j, kmax(0, 15) - 4, PAL.oxblood]);   // the dim core in the bay
  hull.push([0, 8, 0, PAL.steel], [0, 9, 0, PAL.steel]); glow.push([0, 10, 0, PAL[ph ? 'red' : 'coral']]);
  const v = new Vox(); v.shade = SH; v.vox(hull, MS_V); v.shade = SHG; v.vox(glow, MS_V);
  return v.geo();
}
function shieldGeo() {
  const list = [], s = 0.075, A = 10;
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
    const h = Math.max(Math.abs(j), 0.866 * Math.abs(i) + 0.5 * Math.abs(j)) / A; if (h > 1) continue;
    const corner = h > 0.72 && Math.abs(Math.atan2(j, i) / (Math.PI / 3) - Math.round(Math.atan2(j, i) / (Math.PI / 3))) < 0.12;
    const c = h > 0.9 ? 'slate' : corner ? 'bone' : h > 0.62 && h < 0.72 ? 'haze' : (i < 0 && j > 0 && h < 0.55) ? 'mist' : 'steel';
    list.push([i, j, 1, PAL[c]], [i, j, 0, PAL[h > 0.9 ? 'void' : 'slate']]);
    if (h <= 0.25 && Math.abs(i) <= 1) list.push([i, j, 2, PAL.crimson]);
  }
  const v = new Vox(); v.shade = SH; v.vox(list, s); return v.geo();
}
function coreGeo() {
  const list = [], s = 0.085;
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) for (let k = -7; k <= 7; k++) {
    const d = Math.sqrt(i * i + j * j + k * k); if (d > 6.6 || d < 5.2) continue;
    const lit = (-i * 0.4 + j * 0.5 + k * 0.8) / d;
    list.push([i, j, k, PAL[lit > 0.75 ? 'lemon' : lit > 0.45 ? 'yellow' : lit > 0.1 ? 'orange' : lit > -0.3 ? 'red' : 'crimson']]);
  }
  const v = new Vox(); v.shade = SHG; v.vox(list, s); return v.geo();
}
// the abduction beam: a cone of light rings under the saucer (three phases, swapped: the rings travel up)
const BEAM_L = 3.2;
function beamGeo(ph) {
  const v = new Vox(), N = 11;
  for (let r = 0; r < N; r++) {
    const f = (r + ph / 3) / N, y = -0.12 - f * BEAM_L, rad = 0.36 + 0.95 * f, n = Math.ceil(rad * 26);
    for (let a = 0; a < n; a++) { const q = a / n * TAU; v.box(Math.cos(q) * rad, y, Math.sin(q) * rad, 0.1, 0.07, 0.1, PAL[a % 3 === 0 ? 'bone' : f < 0.5 ? 'lemon' : 'ice']); }
  }
  for (let e = 0; e < 8; e++) { const q = e / 8 * TAU + 0.3; for (let st = 0; st < 16; st++) { const f = st / 16; v.box(Math.cos(q) * (0.36 + 0.95 * f), -0.12 - f * BEAM_L, Math.sin(q) * (0.36 + 0.95 * f), 0.05, 0.14, 0.05, PAL[e & 1 ? 'ice' : 'cyan']); } }
  return v.geo();
}
// DEPUTY DUCK cameo: the range's placeholder voxel duck (copied from range.js; duck.js untouched)
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
const shared = (g, m) => { const x = new THREE.Mesh(g, m || MAT_B); x.userData.sharedGeo = true; x.raycast = () => {}; return x; };

// =========================================================================================
// POSES (pure functions of the spawn and its local time)
// =========================================================================================
const ENTER = 0.3, FLIP = 0.14, VEER = 1.1, LEAVE_A = 1.0;
const chargeAt = (sp, run) => sp.desc + (run && run.versus ? 1.0 : 0.45);   // a landing costs its life this long after touchdown
function pathAt(sp, lt, o) {                                  // the descent path (start -> end), wobble, banking
  const f = sp.abd ? 1 - (1 - clamp(lt / sp.desc, 0, 1)) * (1 - clamp(lt / sp.desc, 0, 1)) : clamp(lt / sp.desc, 0, 1);
  const env = clamp(4 * f, 0, 1) * (1 - f * f), ph = TAU * sp.wf * lt + sp.wp, w = sp.wa * env * Math.sin(ph);
  o.x = sp.s[0] + (sp.e[0] - sp.s[0]) * f + w; o.y = sp.s[1] + (sp.e[1] - sp.s[1]) * f; o.z = sp.s[2] + (sp.e[2] - sp.s[2]) * f;
  if (sp.sp) {                                                // snake spiral: circling round the line, the circle shrinking
    const a = sp.sp.w * lt + sp.sp.p, r = sp.sp.r * (1 - 0.75 * f) * clamp(lt / 0.6, 0, 1);
    o.x += r * Math.cos(a); o.y += r * Math.sin(a) * 0.55; o.z += r * Math.sin(a) * 0.3;
  }
  o.roll = -0.4 * env * Math.cos(ph) * Math.min(1, sp.wa) + (sp.sp ? -0.25 * Math.sin(sp.sp.w * lt + sp.sp.p) : 0);
  o.f = f; return o;
}
const _pa = {}, _pb = {}, _pc = {};
function saucerPose(sp, lt, o) {
  o = o || {};
  o.phase = 'wait'; o.visible = false; o.shootable = false; o.done = false; o.sc = 1; o.roll = 0; o.flip = 0;
  if (lt < 0) return o;
  o.visible = true; o.sc = lt < ENTER ? 0.15 + 0.85 * E.outBack(lt / ENTER) : 1;
  const veer = sp.veer || 0;
  if (sp.abd) {
    if (lt < sp.desc) { pathAt(sp, lt, o); o.phase = 'fly'; o.shootable = lt >= sp.readyAt; return o; }
    const hb = lt - sp.desc;
    if (hb < sp.abd.beam) { o.x = sp.e[0] + 0.05 * Math.sin(hb * 3); o.y = sp.e[1] + 0.06 * Math.sin(hb * 2.2); o.z = sp.e[2]; o.f = 1; o.phase = 'beam'; o.shootable = true; o.beam = hb / sp.abd.beam; return o; }
    const q = hb - sp.abd.beam;
    if (q < LEAVE_A) { o.x = sp.e[0] + sp.abd.side * 9 * q * q; o.y = sp.e[1] + 1.2 * q + 9 * q * q; o.z = sp.e[2] - 6 * q * q; o.roll = -sp.abd.side * 0.6 * q; o.phase = 'leave'; return o; }
    o.phase = 'gone'; o.visible = false; o.done = true; return o;
  }
  if (veer && lt >= veer) {                                   // bombs / decoys / turned turncoats veer off before Earth
    const q = lt - veer;
    if (q >= VEER) { o.phase = 'gone'; o.visible = false; o.done = true; return o; }
    pathAt(sp, veer, _pa); pathAt(sp, veer - 0.06, _pb);
    const vx = (_pa.x - _pb.x) / 0.06, vy = (_pa.y - _pb.y) / 0.06, vz = (_pa.z - _pb.z) / 0.06, sd = sp.vs;
    o.x = _pa.x + vx * q * 0.6 + sd * 7 * q * q; o.y = _pa.y + vy * q * 0.4 + 5.5 * q * q; o.z = _pa.z + vz * q * 0.5 - 3 * q * q;
    o.roll = _pa.roll - sd * 1.2 * q; o.f = _pa.f; o.phase = 'veer'; o.shootable = q < 0.35; return o;
  }
  if (lt < sp.desc) {
    pathAt(sp, lt, o); o.phase = 'fly'; o.shootable = lt >= sp.readyAt;
    if (sp.turn && lt >= sp.turn && lt < sp.turn + FLIP) { o.phase = 'flip'; o.flip = (lt - sp.turn) / FLIP; o.shootable = false; }
    return o;
  }
  o.x = sp.e[0]; o.y = sp.e[1]; o.z = sp.e[2]; o.f = 1; o.visible = false; o.phase = 'land';
  return o;
}
// the mothership: arrives from above, hovers swaying, leaves upward (pure in its local time)
function msPose(ms, lt, o) {
  o = o || {};
  const A = ms.arrive, S = ms.stay, tau = lt - A, sw = ms.swA * Math.sin(ms.swW * Math.max(0, tau) + ms.ph), bob = 0.28 * Math.sin(1.3 * ms.swW * Math.max(0, tau) + 1.1);
  o.x = ms.m[0] + sw; o.y = ms.m[1] + bob; o.z = ms.m[2]; o.roll = -0.05 * Math.cos(ms.swW * Math.max(0, tau) + ms.ph) * ms.swA; o.phase = 'hover';
  if (lt < 0) { o.phase = 'wait'; return o; }
  if (lt < A) { const k = E.outCubic(lt / A); o.y = ms.m[1] + 11 * (1 - k); o.z = ms.m[2] - 6 * (1 - k); o.x = ms.m[0] + ms.swA * Math.sin(ms.ph); o.phase = 'arrive'; return o; }
  if (tau >= S) { const q = (tau - S) / ms.leave; if (q >= 1) { o.phase = 'gone'; return o; } o.y += 13 * q * q; o.z -= 7 * q * q; o.phase = 'leave'; }
  return o;
}
const msOf = sp => sp.ms;                                    // member / escort -> its mothership's params (copied in)
function bayAt(ms, t, o) { msPose(ms, t - ms.t0, o); o.y += BAY_Y * MTc; o.z += BAY_Y * MTs; return o; }

// =========================================================================================
// HIT TEST: a screen-space shape round the saucer (far ones fair: a real saucer is never smaller than HIT_PX.min game px;
// bombs / decoys take only a precise hit, no inflation). Zone: the dome (upper middle) = 'dome', the rest = 'rim'.
// The reported distance is the pixel distance from the ray, so the saucer nearest the crosshair wins an overlap.
// =========================================================================================
const HIT_PX = { mouse: 7.5, touch: 11 };
function hitRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable) return;
  this.updateWorldMatrix(true, false); this.getWorldPosition(_hp);
  const d = _hp.distanceTo(rc.ray.origin), perPx = 2 * d * TAN_H / RH;
  const rpx = tg.radW * tg.curScale / perPx, bad = tg.kind === 'bomb';
  const reff = bad ? rpx * 0.92 : Math.max(rpx, B.Input && B.Input.touch ? HIT_PX.touch : HIT_PX.mouse);
  rc.ray.closestPointToPoint(_hp, _cp);
  const dx = _cp.x - _hp.x, dy = _cp.y - _hp.y, dz = _cp.z - _hp.z;
  let ox = dx, oy = dy * CPc + dz * CPs;                     // onto the camera's right / up
  const cr = Math.cos(-tg.roll), sr = Math.sin(-tg.roll), W = reff * perPx;
  const nx = (ox * cr - oy * sr) / W, ny = (ox * sr + oy * cr) / W;
  let ok, dome;
  if (tg.shape === 'disc') { ok = nx * nx + ny * ny <= 1; dome = false; }
  else if (!bad && reff > rpx * 1.05) { ok = nx * nx + ny * ny <= 1; const k = reff / Math.max(1, rpx); dome = ny * k > 0.12 && Math.abs(nx * k) < 0.6; }   // inflated: the upper middle of the true shape and above it = dome
  else { const hull = nx * nx + (ny / 0.36) * (ny / 0.36) <= 1, dm = nx * nx + ((ny - 0.38) / 0.44) * ((ny - 0.38) / 0.44) <= 0.2 && ny > 0.1; ok = hull || dm; dome = dm && ny > 0.18; }
  if (!ok) return;
  this.userData.zone = tg.shape === 'disc' ? tg.zoneName : dome ? 'dome' : 'rim';
  out.push({ distance: hyp(ox, oy) / perPx + d * 1e-4, point: _cp.clone(), object: this });
}

// =========================================================================================
// TARGETS
// =========================================================================================
const DECOY_ARM = 0.3, DECOY_UNMASK = 0.16;
// the toy is turned a little toward the camera so its dome always shows (more when it is above you)
const tiltAt = (y, z) => clamp(0.22 + 0.9 * Math.atan2(y - CAMP.y, CAMP.z - z), 0.12, 0.75);
const schemeOf = sp => sp.bomb ? BOMB_S : SCHEMES[sp.sch | 0];
// the landing hook: an UNSHOT real saucer that touched down costs every player still standing a life, through the
// engine's own penalty (Run.penaltyNow: LIFE -1, the bomb shake / duck scare / 'bomb' + 'lifeLost' sounds, -300).
// Called by the saucer itself chargeAt() s after touchdown, only if run.taken has no claim on it (both versus tabs
// see the same taken set, so both charge the same landings).
function chargeLanding(run) {
  if (!run || run.state !== 'play') return;
  run.players.forEach((P, i) => { if (P.lives > 0) run.penaltyNow(i, 'bomb', null, null); });
}
class Saucer extends T.Target {
  constructor(sp, run) {
    super(sp.bomb ? 'bomb' : 'target');
    const G = geos();
    this.sp = sp; this.run = run; this.P = {}; this.lastLt = 0; this.deadLt = -1; this.armLt = -1; this.announced = false; this.flared = false; this.charged = false;
    this.radW = SR[sp.size]; this.curScale = 1; this.roll = 0; this.shape = 'saucer'; this.turned = false; this.telN = -1;
    this.pivot = new THREE.Group(); this.group.add(this.pivot);
    this.set = sp.bomb ? G.bomb[sp.size] : G.real[sp.sch][sp.size];
    this.body = shared(this.set[0]); this.pivot.add(this.body);
    if (sp.turn) this.bset = G.bomb[sp.size];
    if (sp.decoy) { this.disg = shared(G.decoy[sp.size]); this.pivot.add(this.disg); }
    if (sp.bomb || sp.turn) { this.spark = shared(G.spark); this.spark.position.y = 8.2 * SZ_V[sp.size]; this.spark.scale.setScalar(SZ_V[sp.size] / 0.09); this.pivot.add(this.spark); this.spark.visible = !!sp.bomb; }
    this.proxy = new THREE.Mesh(NOHIT_GEO, NOHIT_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this; this.proxy.raycast = hitRaycast; this.pivot.add(this.proxy);
    if (sp.abd) {
      this.beam = shared(G.beam[0]); this.beam.visible = false; this.group.add(this.beam);
      this.duck = shared(G.duck, MAT_L); this.duck.visible = false; this.duck.scale.setScalar(1.9); this.group.add(this.duck);
    }
    this.group.visible = false;
  }
  meshes() { return [this.proxy]; }
  update(lt, run) {
    this.run = run;
    const sp = this.sp;
    if (this.armLt >= 0 && this.alive) return this.updateArm(lt);
    const P = saucerPose(sp, lt, this.P); this.lastLt = lt;
    if (!this.alive) return this.afterDeath(lt, run, P);
    if (P.phase === 'wait') { this.group.visible = false; this.shootable = false; return false; }
    if (P.phase === 'land') return this.updateLand(lt, run, P);
    if (P.done) { this.group.visible = false; this.shootable = false; return true; }
    this.group.visible = true; this.pivot.visible = P.visible;
    this.pivot.position.set(P.x, P.y, P.z); this.roll = P.roll; this.curScale = P.sc;
    this.tilt = tiltAt(P.y, P.z); this.pivot.rotation.set(this.tilt, 0, P.roll); this.pivot.scale.setScalar(P.sc);
    const ph = ((lt * 7) | 0) & 1;
    let set = this.set;
    if (sp.turn) this.updateTurn(lt, P);
    if (this.turned) set = this.bset;
    this.body.geometry = set[ph];
    if (this.spark && this.spark.visible) this.spark.scale.setScalar(SZ_V[sp.size] / 0.09 * (0.8 + 0.5 * (((lt * 23) | 0) & 1)));
    if (sp.decoy) { this.disg.rotation.z = 0.05 * Math.sin(lt * 9.3) + 0.03 * Math.sin(lt * 23); this.disg.position.x = 0.012 * Math.sin(lt * 17); }   // the nervous cardboard
    if (lt < ENTER && !this.warped) { this.warped = true; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; spark(P.x, P.y, P.z, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0, 0.12, k & 1 ? PAL.ice : PAL.bone, 0.3, 0, 3); } }
    if (!this.announced) { this.announced = true; B.SFX.play('saucerIn', { u: uOf([P.x, P.y, P.z]), size: sp.size }); }
    if (sp.abd) this.updateBeam(lt, P);
    this.shootable = P.shootable;
    return false;
  }
  // turncoat: telegraph (the fuse pops out of the dome and ticks, the saucer shakes harder), the flip (not shootable), a bomb
  updateTurn(lt, P) {
    const sp = this.sp, w = lt - (sp.turn - sp.tel), a = clamp(w / sp.tel, 0, 1);
    if (P.phase === 'flip') {
      const g = P.flip; this.pivot.rotation.x = this.tilt + (g < 0.5 ? Math.PI * g : -Math.PI * (1 - g));
      if (g >= 0.5 && !this.turned) { this.turned = true; this.kind = 'bomb'; this.spark.visible = true; }
      return;
    }
    if (lt >= sp.turn + FLIP) { if (!this.turned) { this.turned = true; this.kind = 'bomb'; } this.spark.visible = true; return; }
    if (w >= 0) {
      this.pivot.rotation.z += (0.05 + 0.14 * a) * Math.sin(w * (16 + 22 * a));
      this.pivot.position.x += 0.03 * a * Math.sin(w * 41);
      this.spark.visible = a > 0.7 || ((w * (8 + 22 * a)) | 0) % 2 === 0;
      const n = Math.min(2, Math.floor(a * 3)), u = uOf([P.x, P.y, P.z]);
      if (this.telN < 0) { this.telN = 0; B.SFX.play('bombReveal', { u }); B.SFX.play('turnTick', { u, n: 0 }); }
      else if (n > this.telN) { this.telN = n; B.SFX.play('turnTick', { u, n }); }
    }
  }
  updateBeam(lt, P) {
    const sp = this.sp, bm = this.beam, dk = this.duck;
    if (P.phase === 'beam') {
      bm.visible = true; bm.position.set(P.x, P.y - 0.05, P.z); bm.geometry = geos().beam[((lt * 12) | 0) % 3];
      const k = E.inOut(clamp(P.beam, 0, 1)), gy = sp.e[1] - BEAM_L - 0.1;
      dk.visible = k < 0.97; dk.position.set(P.x + 0.08 * Math.sin(lt * 5), gy + (P.y - 0.3 - gy) * k - 0.3, P.z);
      dk.rotation.set(0.25 * Math.sin(lt * 3.1), lt * 2.2, 0.3 * Math.sin(lt * 4.3)); dk.scale.setScalar(1.9 * (1 - 0.45 * k));
      if (!this.beamOn) { this.beamOn = true; const u = uOf([P.x, P.y, P.z]); B.SFX.play('beamOn', { u }); B.SFX.play('duckCameo', { u }); }
      if (Math.random() < 0.3) spark(P.x + R.rnd(-0.6, 0.6), gy + R.rnd(0, BEAM_L), P.z + R.rnd(-0.3, 0.3), 0, R.rnd(0.6, 1.6), 0, 0.05, Math.random() < 0.5 ? PAL.lemon : PAL.bone, 0.4);
    } else {
      bm.visible = false; dk.visible = false;
      if (this.beamOn && !this.beamOff) { this.beamOff = true; B.SFX.play('beamOff', { u: uOf([P.x, P.y, P.z]) }); }
    }
  }
  // touchdown: the fireball on the globe, then (unshot) the life
  updateLand(lt, run, P) {
    this.shootable = false; this.pivot.visible = false;
    if (!this.flared) {
      this.flared = true; landFlare(this.sp.e); earthFlare(this.sp.e);
      B.SFX.play('landing', { u: uOf(this.sp.e) });
    }
    if (lt >= chargeAt(this.sp, run)) { if (!this.charged) { this.charged = true; if (!run.taken.has(this.sp.id)) chargeLanding(run); } return true; }
    return false;
  }
  // after a hit (or a bang): wait out the cosmetic tail. A real saucer shattered here but never awarded (versus: the host
  // gave it to nobody) still lands: it is charged like any other, from run.taken only.
  afterDeath(lt, run, P) {
    this.shootable = false; this.pivot.visible = false;
    const sp = this.sp, taken = run.taken.has(sp.id);
    if (this.duckFall) {
      const q = lt - this.deadLt, k = clamp(q / 0.9, 0, 1), d = this.duck;
      d.visible = k < 1; d.position.set(this.duckFall[0], this.duckFall[1] + (this.duckFall[2] - this.duckFall[1]) * E.inCubic(k), this.duckFall[3]);
      d.rotation.z = q * 8; this.beam.visible = q < 0.12;
    }
    if (taken || sp.bomb || sp.abd || sp.turn) return lt - this.deadLt > (this.duckFall ? 1.0 : 0.3) || P.done;
    if (lt >= chargeAt(sp, run)) { if (!this.charged) { this.charged = true; chargeLanding(run); } return true; }
    return false;
  }
  shatter(point, opts) {
    if (!this.alive) return;
    const P = saucerPose(this.sp, this.lastLt, {}), p = new THREE.Vector3(P.x, P.y, P.z);
    saucerBurst(p, this.turned ? BOMB_S : schemeOf(this.sp), SZ_V[this.sp.size] / 0.093, opts && opts.tint);
    B.SFX.play('saucerHit', { u: uOf(p), size: this.sp.size });
    if (this.sp.abd) {
      B.SFX.play('duckCameoHit', { u: uOf(p) });
      if (this.beamOn && !this.beamOff) { this.beamOff = true; B.SFX.play('beamOff', { u: uOf(p) }); }
      if (this.duck.visible) this.duckFall = [this.duck.position.x, this.duck.position.y, this.sp.e[1] - BEAM_L - 0.3, this.duck.position.z];
      else { this.duck.visible = true; this.duckFall = [P.x, P.y - 0.3, P.y - BEAM_L - 0.3, P.z]; }   // he was on the way up: he drops home
    }
    this.alive = false; this.shootable = false; this.deadLt = this.lastLt; this.pivot.visible = false;
  }
  explode(point) {
    if (!this.alive) return;
    if (this.sp.decoy && !this.bang) {                        // a decoy: build up first, then the bang
      if (this.armLt < 0) this.arm(point, null);
      if (this.lastLt - this.armLt < DECOY_ARM - 1e-3) { this.autoBoom = true; return; }
    }
    const P = this.pivot.position;
    bombBlast(P, SZ_V[this.sp.size] / 0.093 * 1.2);
    this.alive = false; this.shootable = false; this.deadLt = this.lastLt; this.pivot.visible = false;
  }
  // Run.applyPenalty hook (stage.js deferred penalty): a decoy arms and returns its bang time; a plain bomb blows now
  arm(point, st) {
    if (!this.sp.decoy || !this.alive) return -1;
    if (this.armLt < 0) {
      this.armLt = st != null ? st - this.sp.t0 : this.lastLt; this.shootable = false;
      const p = this.pivot.position; for (let k = 0; k < 8; k++) spark(p.x, p.y + 0.6 * SZ_V[this.sp.size] * 10, p.z, R.rnd(-1.5, 1.5), R.rnd(0.5, 2), R.rnd(0, 1), 0.06, PAL[['lemon', 'yellow', 'orange'][k % 3]], 0.4);
      B.SFX.play('bombReveal', { u: uOf(p) });
    }
    return +(this.sp.t0 + this.armLt + DECOY_ARM).toFixed(4);
  }
  // decoy build-up: frozen where it was hit, the cardboard disguise flies off, the bare skull saucer swells, fuse flaring
  updateArm(lt) {
    const q = lt - this.armLt, k = Math.min(1, q / DECOY_UNMASK), s = SZ_V[this.sp.size];
    this.lastLt = lt; this.shootable = false;
    const P = saucerPose(this.sp, this.armLt, this.P);
    this.pivot.visible = true; this.pivot.position.set(P.x, P.y, P.z); this.pivot.rotation.set(tiltAt(P.y, P.z), 0, P.roll * (1 - k));
    this.disg.visible = k < 1; this.disg.position.set(-1.8 * s * 10 * E.outCubic(k), 3 * s * 10 * E.outCubic(k), 0); this.disg.rotation.set(-1.2 * k, 0, 1.6 * k);
    this.pivot.scale.setScalar(1 + 0.16 * E.inCubic(Math.min(1, q / DECOY_ARM)));
    this.body.geometry = this.set[((lt * 30) | 0) & 1];
    this.spark.visible = true; this.spark.scale.setScalar(s / 0.09 * (1.3 + 1.4 * Math.min(1, q / DECOY_ARM)) * (0.8 + 0.4 * (((lt * 30) | 0) & 1)));
    if ((this.autoBoom && q >= DECOY_ARM - 1e-3) || q >= DECOY_ARM + 0.4) { this.bang = true; this.explode(); }   // (+0.4: a lost deferral)
    return false;
  }
}
// THE MOTHERSHIP hull (kind 'fx', not shootable itself): it arrives, sways, drops escorts from its bay, and blows when its
// core is taken (run.taken), or leaves at the end of its stay
class Mother extends T.Target {
  constructor(sp) {
    super('fx'); const G = geos(); this.sp = sp; this.P = {}; this.boomLt = -1;
    this.body = shared(G.ms[0]); this.group.add(this.body); MS_HULLS.add(this.body);
    this.group.visible = false;
  }
  meshes() { return []; }
  update(lt, run) {
    const sp = this.sp, P = msPose(sp, lt, this.P);
    if (this.boomLt >= 0) return this.updateBoom(lt);
    if (P.phase === 'wait') { this.group.visible = false; return false; }
    if (P.phase === 'gone') { this.group.visible = false; return true; }
    if (run.taken.has(sp.core) && P.phase !== 'arrive') { this.boom(lt, run); return false; }
    this.group.visible = true; this.group.position.set(P.x, P.y, P.z); this.group.rotation.set(MS_TILT, 0, P.roll);
    this.body.geometry = geos().ms[((lt * 6) | 0) & 1];
    if (!this.announced) { this.announced = true; B.SFX.play('mothershipIn', { u: uOf([P.x, P.y, P.z]) }); }
    if (Math.random() < 0.25) { const a = Math.random() * TAU; spark(P.x + Math.cos(a) * 1.0, P.y + BAY_Y - 0.1, P.z + Math.sin(a) * 0.6, 0, -R.rnd(0.5, 1.2), 0, 0.08, Math.random() < 0.5 ? PAL.amber : PAL.lemon, 0.45); }
    return false;
  }
  boom(lt, run) {
    this.boomLt = lt; const p = this.group.position.clone();
    for (let k = 0; k < 7; k++) later(k * 0.13, () => { const q = new THREE.Vector3(p.x + R.rnd(-2.6, 2.6), p.y + R.rnd(-0.5, 0.9), p.z + R.rnd(-1, 1.5)); bombBlast(q, 1.1); });
    later(0.95, () => { bombBlast(p, 2.6); saucerBurst(p, MS_S, 3.2); for (let k = 0; k < 40; k++) { const d = rndDir(), v = R.rnd(3, 9); spark(p.x, p.y, p.z, d[0] * v, d[1] * v, d[2] * v * 0.5, R.rnd(0.15, 0.32), PAL[['plum', 'magenta', 'pink', 'steel', 'lime'][k % 5]], R.rnd(0.9, 1.6), 0, 0.6); } });
    if (B.G && B.G.shakeIt) { B.G.shakeIt(0.25); later(0.95, () => B.G.shakeIt && B.G.shakeIt(0.45)); }
  }
  updateBoom(lt) {
    const q = lt - this.boomLt;
    this.group.visible = q < 0.95; this.group.rotation.z = 0.05 * Math.sin(q * 60) * q; this.group.position.y += 0.002;
    return q > 1.6;
  }
  dispose() { MS_HULLS.delete(this.body); super.dispose(); }
}
// a SHIELD plate / the CORE: the column mechanic. A member stays hidden while the one in front of it stands; once that one
// is shot (gone and in run.taken, or shattered here) it is just standing there. The ship left: the rest go with it.
class MsPart extends T.Target {
  constructor(sp) {
    super('target'); const G = geos(); this.sp = sp; this.P = {}; this.deadLt = -1; this.lastLt = 0; this.rev = !sp.aheadD;
    this.shape = 'disc'; this.zoneName = sp.kind; this.roll = 0; this.curScale = 1;
    this.radW = sp.kind === 'core' ? 0.6 : 0.76;
    this.body = shared(sp.kind === 'core' ? G.core : G.shield); this.group.add(this.body);
    this.proxy = new THREE.Mesh(NOHIT_GEO, NOHIT_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this; this.proxy.raycast = hitRaycast; this.group.add(this.proxy);
    this.group.visible = false;
  }
  meshes() { return [this.proxy]; }
  place(P) { const z = this.sp.kind === 'core' ? BAY_Z : SHIELD_Z; this.group.position.set(P.x, P.y - z * MTs, P.z + z * MTc); this.group.rotation.x = MS_TILT; }
  update(lt, run) {
    const sp = this.sp, ms = msOf(sp), P = msPose(ms, sp.t0 - ms.t0 + lt, this.P); this.lastLt = lt;
    if (!this.alive) return this.updateDead(lt, P);
    if (P.phase === 'leave' || P.phase === 'gone') { this.group.visible = false; this.shootable = false; return true; }
    if (!this.rev) {
      const fid = sp.id - sp.aheadD, f = run.byId(fid);
      this.group.visible = false; this.shootable = false;
      if (f && f.alive) return false;
      if (!f && !run.taken.has(fid)) return true;
      this.rev = true;
    }
    this.place(P); this.group.visible = true; this.shootable = P.phase === 'hover';
    if (sp.kind === 'core') { const s = 1 + 0.12 * Math.sin(lt * 11); this.body.scale.setScalar(s); this.body.rotation.y = lt * 1.5; }
    else this.body.rotation.z = 0.04 * Math.sin(lt * 3 + sp.k);
    return false;
  }
  updateDead(lt, P) {
    const q = lt - this.deadLt;
    if (this.sp.kind === 'shield' && q < 0.55) {                // the plate pops off, tumbling away
      this.group.visible = true; this.place(P);
      const sd = this.sp.k & 1 ? 1 : -1;
      this.group.position.x += sd * 3.2 * q; this.group.position.y += 2.4 * q - 5 * q * q; this.group.position.z += 2.5 * q;
      this.body.rotation.set(q * 9, q * 4 * sd, q * 7 * sd);
      return false;
    }
    this.group.visible = false; return q > 0.6;
  }
  shatter(point, opts) {
    if (!this.alive) return;
    const p = this.group.position.clone(), u = uOf(p), tint = opts && opts.tint;
    if (this.sp.kind === 'core') {
      bombBlast(p, 1.4); for (let k = 0; k < 24; k++) { const d = rndDir(), v = R.rnd(2, 6); spark(p.x, p.y, p.z, d[0] * v, d[1] * v, d[2] * v, 0.12, PAL[['lemon', 'orange', 'red', 'bone'][k % 4]], R.rnd(0.5, 1), 0, 1.2, 0, F_TW, PAL.bone); }
      B.SFX.play('coreHit', { u }); this.group.visible = false;
    } else {
      for (let k = 0; k < 14; k++) { const d = rndDir(), v = R.rnd(1.5, 4); spark(p.x, p.y, p.z + 0.1, d[0] * v, d[1] * v, Math.abs(d[2]) * v, R.rnd(0.06, 0.12), tint != null && k % 3 === 0 ? tint : PAL[['steel', 'haze', 'bone', 'lemon'][k % 4]], R.rnd(0.4, 0.8), 0.2, 1.2); }
      B.SFX.play('shieldPop', { u, n: this.sp.n - this.sp.k - 1 });
    }
    this.alive = false; this.shootable = false; this.deadLt = this.lastLt;
  }
}
// the DIRECTOR (kind 'fx', t0 0): WAVE n banners, the finale (the last mothership's core taken + the quota met; versus
// always), and it holds the stage open until everything is done
const FIN_HOLD = 3.7, FIN_SLOT = 4.2;
class Director extends T.Target {
  constructor(sp) { super('fx'); this.sp = sp; this.wi = 0; this.fin = -1; this.coreT = -1; this.shootable = false; fxClear(); earthReset(); }
  meshes() { return []; }
  update(lt, run) {
    const sp = this.sp;
    while (this.wi < sp.waves.length && lt >= sp.waves[this.wi].t) {
      const w = sp.waves[this.wi++];
      if (lt - w.t < 1) { dustText('WAVE ' + w.n, 92, 24, WAVE_COLS); B.SFX.play('waveStart', { n: w.n }); }
    }
    if (sp.core >= 0 && this.coreT < 0 && run.taken.has(sp.core)) {
      this.coreT = lt;
      if (run.versus || run.quotaMet) { this.fin = lt; later(1.0, () => { EARTH.fin = EARTH.t; B.SFX.play('finale'); }); }
    }
    if (this.fin >= 0) return lt >= this.fin + 1.0 + FIN_HOLD;
    if (this.coreT >= 0) return lt >= this.coreT + 2.0;
    return lt >= sp.last;
  }
}
function makeTarget(sp, run) {
  if (sp.kind === 'dir') return new Director(sp, run);
  if (sp.kind === 'ms') return new Mother(sp, run);
  if (sp.kind === 'shield' || sp.kind === 'core') return new MsPart(sp, run);
  if (sp.esc) { const ms = msOf(sp); if (run && run.taken && run.taken.has(ms.core)) return new Gone(); }   // the ship blew before this escort dropped
  return new Saucer(sp, run);
}
class Gone extends T.Target { constructor() { super('fx'); } meshes() { return []; } update() { return true; } }

// =========================================================================================
// The dials per tier (variant 0; DESIGN-STAGES.md section 5's "what hard means" + section 7):
// time = the director's stream (three waves; the clock adds the breaks, the mothership and FIN_SLOT) | desc = the
// DESCENT (s from warp-in to touchdown; the landing threat: slow at Beginner, fast at Insane; S x0.85, L x1.12) |
// live = saucers descending at once | gap / burst / bgap / pause = the beat stream | hop / alt / adj = AIM TRAVEL
// (share of the screen diagonal from the last saucer you were made to aim at, alternate side weight, keep-off radius) |
// wob = wobble amplitude (world) / frequency (Hz) | decep = chance a single is a bomb, kinds [plain, decoy], bombCap |
// turn / tel = turncoat chance / telegraph s | trick = chance a beat is a formation; beat (row), snake (spiral), pp
// (ping-pong) s between members; spV = formation spacing in saucer diameters (tight = small) | shields = mothership
// shield plates; msStay / sway [amp, rad/s] / esc = escorts dropped | beam = abduction lift s | share = quota share of
// the required hits (real saucers + escorts + shields + cores) | rel = reach-for-reload the pacing allows (s).
// =========================================================================================
const TIER_P = [
  { time: 38, desc: 7.0, live: 5, gap: [1.0, 1.6], burst: 0.2, bgap: [0.4, 0.6], pause: [0.9, 1.3], hop: [0.12, 0.3], alt: 0.25, adj: 0.1,
    wob: [0.55, 0.32], decep: 0.12, kinds: [0.55, 0.45], bombCap: 0.18, turn: 0.05, tel: 0.4, trick: 0.24, beat: 0.62, snake: 0.7, pp: 0.75, spV: 2.9,
    shields: 3, msStay: 12, sway: [1.1, 0.5], esc: 2, beam: 3.6, share: 0.6, rel: 0.75 },
  { time: 34, desc: 5.6, live: 5, gap: [0.95, 1.5], burst: 0.24, bgap: [0.35, 0.55], pause: [0.9, 1.3], hop: [0.24, 0.44], alt: 0.45, adj: 0.13,
    wob: [0.7, 0.38], decep: 0.17, kinds: [0.5, 0.5], bombCap: 0.24, turn: 0.08, tel: 0.35, trick: 0.28, beat: 0.52, snake: 0.56, pp: 0.6, spV: 2.6,
    shields: 4, msStay: 11, sway: [1.5, 0.6], esc: 2, beam: 3.2, share: 0.64, rel: 0.7 },
  { time: 30, desc: 4.4, live: 4, gap: [0.95, 1.45], burst: 0.28, bgap: [0.3, 0.48], pause: [0.8, 1.2], hop: [0.38, 0.62], alt: 0.65, adj: 0.15,
    wob: [0.85, 0.45], decep: 0.22, kinds: [0.45, 0.55], bombCap: 0.3, turn: 0.11, tel: 0.3, trick: 0.32, beat: 0.42, snake: 0.44, pp: 0.48, spV: 2.3,
    shields: 5, msStay: 9.5, sway: [1.9, 0.72], esc: 3, beam: 2.7, share: 0.68, rel: 0.62 },
  { time: 26, desc: 3.4, live: 3, gap: [1.0, 1.5], burst: 0.32, bgap: [0.26, 0.4], pause: [0.7, 1.0], hop: [0.52, 0.85], alt: 0.85, adj: 0.18,
    wob: [1.05, 0.55], decep: 0.27, kinds: [0.4, 0.6], bombCap: 0.34, turn: 0.14, tel: 0.25, trick: 0.36, beat: 0.34, snake: 0.36, pp: 0.4, spV: 2.05,
    shields: 6, msStay: 8.5, sway: [2.3, 0.88], esc: 3, beam: 2.3, share: 0.72, rel: 0.55 }
];
const VARIANT_NAMES = ['FIRST WAVE', 'BLITZ', 'MOTHERSHIP'];
const PTS = [[300, 150], [200, 100], [150, 75]];              // [dome, rim] by size S / M / L
const PTS_EARLY = 50, PTS_SHIELD = 150, PTS_CORE = 1000, PTS_DUCK = 500;
const estCache = {};
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  if (v === 1) {                                              // BLITZ: shorter, faster, more at once
    c.time = +(b.time * 0.8).toFixed(2); c.desc = +(b.desc * 0.85).toFixed(3); c.live = b.live + 1;
    c.gap = b.gap.map(g => +(g * 0.78).toFixed(3)); c.trick = +(b.trick + 0.06).toFixed(3); c.msStay = +(b.msStay * 0.9).toFixed(2);
  }
  if (v === 2) { c.shields = b.shields + 2; c.time = +(b.time * 0.88).toFixed(2); c.ships = 2; }   // MOTHERSHIP: two bosses, bigger shields
  c.ships = c.ships || 1;
  c.decep = +(c.decep + 0.02 * v).toFixed(3);
  c.ammo = [{ mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: false }][v];
  c.autoReload = false; c.decoy = true; c.turncoat = true; c.patterns = true; c.mothership = true; c.abduction = true;   // every mechanic at every tier
  c.tier = tier; c.variant = v; c.title = 'INVASION'; c.subtitle = VARIANT_NAMES[v];
  c.stream = c.time; c.quota = 8;
  const key = tier + '|' + v;                                // menus / the briefing: a fixed-seed estimate of the clock + quota
  if (!estCache[key]) { const est = Object.assign({ estimate: true }, c); timeline(est, B.Stage.mulberry32(0x5eed)); estCache[key] = [est.time, est.quota]; }
  c.time = estCache[key][0]; c.quota = estCache[key][1];
  return c;
}

// ---------- the DIRECTOR (timeline): every spawn from the seeded rng only ----------
// Spawn fields (saucer): id, t0, t1, kind 'saucer', size 0-2, sch (paint), s / e (start / end world points: e is the
// touchdown on the globe, or the hover point of an abductor), desc, wa / wf / wp (wobble), readyAt, bomb (+ decoy),
// turn / tel (turncoat flip lt), veer / vs (bombs: the lt they veer off, side), fm (formation id), fk 'V' | 'R' | 'S' |
// 'P', fi, sp (spiral params), abd { beam, side }, esc (dropped by a mothership; ms = its params). Mothership 'ms':
// arrive / stay / leave, m (hover centre), swA / swW / ph, n, core (id). Members 'shield' (k, n) / 'core': ms, aheadD.
// 'dir' (t0 0): waves [{ n, t }], core (the last ship's core id), last.
const isSaucer = s => s.kind === 'saucer';
const isReq = s => (isSaucer(s) && !s.bomb && !s.turn && !s.abd) || s.kind === 'shield' || s.kind === 'core';
const lifeOf = s => s.abd ? s.desc + s.abd.beam + LEAVE_A : s.veer ? s.veer + VEER : s.desc + 1.1;
function timeline(c, rng) {
  const out = [], tier = c.tier | 0, desc0 = c.desc, est = !!c.estimate;
  rng(); rng(); rng();
  const dir = { id: 0, t0: 0, t1: 0, kind: 'dir', waves: [], core: -1, last: 0 };
  out.push(dir);
  const fly = [];                                            // every saucer spawn so far (overlap / live / aim tests)
  let fmN = 0, bombs = 0, total = 0, prevB = 0, prevB2 = 0, firstRow = true, lastAim = [RW / 2, RH * 0.45], formsDone = 0;
  const descOf = size => +(desc0 * [0.85, 1, 1.12][size]).toFixed(3);
  const posAt = (s, t, o) => { const P = saucerPose(s, t - s.t0, o || {}); return P; };
  // screen circle of a saucer at stage time t (null when not on screen)
  const circ = (s, t) => { const P = saucerPose(s, t - s.t0, _pc); if (!P.visible || P.phase === 'land' || P.phase === 'gone' || P.phase === 'wait') return null; const q = scr(P.x, P.y, P.z); return [q[0], q[1], SR[s.size] * q[2] * P.sc, P.phase === 'veer' || P.phase === 'leave']; };
  const upAt = t => fly.filter(s => s.t0 <= t && t < s.t0 + (s.veer || s.desc));
  // FITS: no screen overlap with any co-visible saucer outside the same formation, sampled every 0.1 s
  function fits(sp, skipFm) {
    const a0 = sp.t0, a1 = sp.t0 + lifeOf(sp);
    for (const o of fly) {
      if (o === sp || (skipFm && o.fm && o.fm === sp.fm)) continue;
      const b0 = Math.max(a0, o.t0), b1 = Math.min(a1, o.t0 + lifeOf(o)); if (b1 <= b0) continue;
      for (let t = b0, dt = 0.1; t <= b1; t += dt) {       // fast phases (a veer, a getaway) are sampled finer
        const A = circ(sp, t), Bc = A && circ(o, t); dt = 0.1; if (!A || !Bc) continue;
        if (A[3] || Bc[3]) dt = 0.02;
        if (hyp(A[0] - Bc[0], A[1] - Bc[1]) < A[2] + Bc[2] + 3) return false;
      }
    }
    return true;
  }
  // a saucer from screen points: start (px, py) at camera depth D0 (or a world start), touchdown at (ex, ey) on the globe
  function mk(t0, o) {
    const size = o.size, desc = o.desc || descOf(size);
    const s = o.s || worldAt(o.px, o.py, o.D || 40);
    let e = o.e;
    if (!e) { e = earthAt(o.ex, o.ey) || earthAt(RW / 2, RH - 20); }
    if (o.hover) e = [e[0], e[1] + o.hover, e[2]];
    const sp = { id: 0, t0: +t0.toFixed(3), t1: 0, kind: 'saucer', size, sch: o.sch != null ? o.sch : 0, s: s.map(x => +x.toFixed(3)), e: e.map(x => +x.toFixed(3)), desc,
      wa: o.wa != null ? o.wa : +(c.wob[0] * (0.7 + 0.6 * o.r1)).toFixed(3), wf: +(c.wob[1] * (0.8 + 0.4 * o.r2)).toFixed(3), wp: +(o.r3 * TAU).toFixed(3), readyAt: 0.18 };
    if (o.bomb) { sp.bomb = true; if (o.decoy) sp.decoy = true; }
    if (o.fm) { sp.fm = o.fm; sp.fk = o.fk; sp.fi = o.fi; }
    if (o.spiral) sp.sp = o.spiral;
    if (o.abd) sp.abd = o.abd;
    if (o.esc) { sp.esc = true; sp.ms = o.esc; }
    if (sp.bomb) { sp.veer = +(desc * (0.7 + 0.08 * o.r2)).toFixed(3); sp.vs = sp.s[0] + (sp.e[0] - sp.s[0]) * 0.7 > 0 ? 1 : -1; }
    if (o.turn) { sp.turn = +(desc * (0.3 + 0.18 * o.r1)).toFixed(3); sp.tel = c.tel; sp.veer = +Math.max(sp.turn + FLIP + 0.45, desc * 0.74).toFixed(3); sp.vs = sp.e[0] > 0 ? 1 : -1; if (sp.veer >= desc - 0.05) sp.veer = +(desc - 0.05).toFixed(3); }
    sp.t1 = +(sp.t0 + lifeOf(sp) + 0.05).toFixed(3);
    return sp;
  }
  const scrStart = sp => { const q = scr(sp.s[0], sp.s[1], sp.s[2]); return [q[0], q[1]]; };
  // FAIR BOMBS (the range's rules): bomb share <= bombCap, never two plain bombs in a row, never three bombs in a row, a
  // bomb only while the bombs up <= the real saucers up
  function bombOk(t) {
    const up = upAt(t), bu = up.filter(s => s.bomb).length, ru = up.length - bu;
    return total > 1 && !(prevB && prevB2) && (bombs + 1) <= c.bombCap * (total + 1) && bu + 1 <= ru;
  }
  function book(sp, isAim) {
    fly.push(sp); out.push(sp); total++;
    if (sp.bomb) bombs++;
    prevB2 = prevB; prevB = sp.bomb ? (sp.decoy ? 2 : 1) : 0;
    if (isAim && !sp.bomb) { const P = posAt(sp, sp.t0 + 0.5); const q = scr(P.x, P.y, P.z); lastAim = [q[0], q[1]]; }
  }
  // AIM TRAVEL single: the free start point whose distance from the last saucer you were made to aim at is closest to the
  // wanted hop, preferring the other side; never next to a saucer already up (+2); no overlap (rejected)
  function single(t, extra) {
    const want = rng.range(c.hop[0], c.hop[1]) * DIAG, size = rng() < 0.3 ? 0 : rng() < 0.65 ? 1 : 2, sch = rng.int(0, 3), rb = rng(), rk = rng(), rt = rng();
    let bomb = false, decoy = false, turn = false;
    if (!extra || !extra.noBomb) { if (rb < c.decep && bombOk(t)) { bomb = true; decoy = rk < c.kinds[1]; } else if (rt < c.turn) turn = true; }
    if (extra && extra.forceBomb) { bomb = true; decoy = extra.decoy; turn = false; }
    let best = null, bs = 1e9;
    const up = upAt(t + 0.3);
    for (let k = 0; k < 14; k++) {
      const px = rng.range(34, RW - 34), py = rng.range(14, 62), ex = clamp(px + rng.range(-95, 95), 40, RW - 40), ey = rng.range(limbAt(ex) + 20, RH - 14);
      const r1 = rng(), r2 = rng(), r3 = rng();
      const sp = mk(t, { size, sch, px, py, ex, ey, bomb, decoy, turn, r1, r2, r3 });
      if (!fits(sp)) continue;
      const q = scrStart(sp), d = hyp(q[0] - lastAim[0], q[1] - lastAim[1]);
      let sc = Math.abs(d - want) / DIAG;
      if ((q[0] - RW / 2) * (lastAim[0] - RW / 2) > 0) sc += c.alt * 0.35;
      for (const o of up) { const A = circ(o, t + 0.3); if (A && hyp(A[0] - q[0], A[1] - q[1]) < c.adj * DIAG) sc += 2; }
      if (sc < bs) { bs = sc; best = sp; }
    }
    if (!best) return null;
    book(best, true);
    return best;
  }
  // FORMATIONS (take the sky to themselves: they start with at most one saucer up). Members are exempt from the overlap
  // test among themselves (their spacing is designed), never against the others.
  function formation(t) {
    const kinds = ['V', 'R', 'S', 'P'], w = [1.5, 1.3, 1.0, 0.9];
    let x = rng() * w.reduce((a, b) => a + b, 0), fk = 'V'; for (let i = 0; i < 4; i++) { if ((x -= w[i]) < 0) { fk = kinds[i]; break; } }
    const fm = ++fmN, mem = [], trick = formsDone > 0 && rng() < 0.3 + 0.1 * tier, rs = [rng(), rng(), rng(), rng(), rng(), rng()];
    const size = rs[0] < 0.5 ? 1 : 0, sch = rng.int(0, 3), D = 40, perPx = 2 * D * TAN_H / RH;
    if (fk === 'V') {                                        // a V flying together, the leader lowest; a later V may hide a bomb / decoy on a wing tip
      const n = tier === 0 ? 3 : rs[1] < 0.5 ? 3 : 5, sp = c.spV * SR[size] * 2, cx = rng.range(130, RW - 130), cy = rng.range(26, 48), ex = clamp(cx + rng.range(-70, 70), 90, RW - 90), ey = rng.range(limbAt(ex) + 34, RH - 30);
      const L0 = worldAt(cx, cy, D), L1 = earthAt(ex, ey); if (!L1) return 0;
      const bad = trick ? (rs[2] < 0.5 ? n - 1 : n - 2) : -1, wa = +(c.wob[0] * 0.8).toFixed(3);
      for (let i = 0; i < n; i++) {
        const rank = Math.ceil(i / 2), side = i === 0 ? 0 : (i & 1 ? -1 : 1), ox = side * rank * sp, oy = rank * sp * 0.75;
        const s = [L0[0] + ox, L0[1] + oy * CPc, L0[2] + oy * CPs], q = scr(L1[0] + ox, L1[1] + oy, L1[2]);
        const e = earthAt(clamp(q[0], 24, RW - 24), clamp(q[1], limbAt(clamp(q[0], 0, RW)) + 12, RH - 6)) || L1;
        mem.push(mk(t, { size, sch, s, e, wa, r1: 0.5, r2: rs[3], r3: rs[4], fm, fk, fi: i, bomb: i === bad, decoy: i === bad && rs[5] < 0.6 }));
      }
    } else if (fk === 'R') {                                 // a ROW on a beat across the top; later rows: a decoy on the beat or off beat
      const n = rng.int(3, tier === 0 ? 4 : 5), gapPx = c.spV * SR[size] * 2 / perPx * 1.15, x0 = RW / 2 - (n - 1) * gapPx / 2, dirn = rs[1] < 0.5 ? 1 : -1, py = rng.range(22, 44);
      const kind = firstRow ? 'clean' : rs[2] < 0.25 ? 'clean' : rs[2] < 0.65 ? 'decoy' : 'off';
      const bad = kind === 'decoy' ? rng.int(2, n - 1) : -1, off = kind === 'off' ? rng.int(2, n - 1) : -1, offK = rs[3] < 0.5 ? 0.45 : 1.9;
      let tt = t;
      for (let i = 0; i < n; i++) {
        const k = dirn > 0 ? i : n - 1 - i, px = x0 + k * gapPx, ex = clamp(px + rng.range(-25, 25), 30, RW - 30), ey = rng.range(limbAt(ex) + 18, RH - 12);
        if (i > 0) tt += i === off ? c.beat * offK : c.beat;
        mem.push(mk(tt, { size, sch, px, py, ex, ey, wa: +(c.wob[0] * 0.4).toFixed(3), r1: 0.5, r2: rng(), r3: rng(), fm, fk, fi: i, bomb: i === bad, decoy: i === bad }));
      }
      firstRow = false;
    } else if (fk === 'S') {                                 // a SNAKE SPIRAL: 5-7 on one circling path, `snake` s apart; the last one sometimes a bomb
      const n = rng.int(5, 7) + (tier >= 3 ? 1 : 0), cx = rng.range(150, RW - 150), ex = clamp(cx + rng.range(-60, 60), 100, RW - 100), ey = rng.range(limbAt(ex) + 30, RH - 26);
      const s = worldAt(cx, 30, 40), e = earthAt(ex, ey); if (!e) return 0;
      const spiral = { r: +(1.7 + 0.3 * rs[1]).toFixed(3), w: +((rs[2] < 0.5 ? 1 : -1) * (2.2 + 0.5 * tier)).toFixed(3), p: +(rs[3] * TAU).toFixed(3) };
      const bad = rs[4] < 0.3 + 0.08 * tier ? n - 1 : -1;
      for (let i = 0; i < n; i++) mem.push(mk(t + i * c.snake, { size: 0, sch, s, e, wa: 0.15, r1: 0.5, r2: 0.5, r3: 0.25, spiral, fm, fk, fi: i, bomb: i === bad, decoy: i === bad && rs[5] < 0.6, desc: descOf(0) }));
    } else {                                                 // PING-PONG: two slots side by side, alternating, then a bomb in the next slot on the beat
      const n = rng.int(4, 6), gapPx = c.spV * SR[size] * 2 / perPx * 1.05, cx = rng.range(120, RW - 120), py = rng.range(20, 40);
      const exs = [clamp(cx - 70 + rng.range(-20, 20), 40, RW - 40), clamp(cx + 70 + rng.range(-20, 20), 40, RW - 40)];
      for (let i = 0; i <= n; i++) {
        const k = i & 1, px = cx + (k ? 1 : -1) * gapPx / 2, ex = exs[k], ey = rng.range(limbAt(ex) + 18, RH - 12), bad = i === n;
        mem.push(mk(t + i * c.pp, { size, sch, px, py, ex, ey, wa: 0.12, r1: 0.5, r2: rng(), r3: rng(), fm, fk, fi: i, bomb: bad, decoy: bad && rs[1] < 0.2 + 0.07 * tier }));
      }
    }
    for (const s of mem) if (!fits(s, true)) return 0;      // never across a saucer outside the formation
    for (const s of mem) book(s, false);
    const lastS = mem[mem.length - 1], q = posAt(lastS, lastS.t0 + 0.6), sq = scr(q.x, q.y, q.z); lastAim = [sq[0], sq[1]];
    formsDone++;
    return mem.reduce((a, s) => Math.max(a, s.t0), t) - t;
  }
  // the ABDUCTION: a saucer stops above the planet and beams Deputy Duck up (planned ~1 round in 4)
  function abduction(t) {
    for (let k = 0; k < 8; k++) {
      const sch = rng.int(0, 3), ex = rng.range(110, RW - 110), ey = rng.range(limbAt(ex) + 56, RH - 26), px = clamp(ex + rng.range(-80, 80), 40, RW - 40), py = rng.range(18, 50), r2 = rng(), r3 = rng();
      const sp = mk(t, { size: 2, sch, px, py, ex, ey, hover: BEAM_L + 0.15, desc: +(desc0 * 0.8).toFixed(3), abd: { beam: c.beam, side: ex > RW / 2 ? 1 : -1 }, r1: 0.3, r2, r3 });
      if (fits(sp)) { fly.push(sp); out.push(sp); return sp; }
    }
    return null;
  }
  // the MOTHERSHIP: arrives, its shields (a column) and core; escorts drop out of its bay
  // the ship never sways across a saucer still descending: a few seeded spots / later arrivals are tried
  function msClear(ms) {
    const a = ms.t0, b = ms.t0 + ms.arrive + ms.stay + ms.leave;
    for (const o of fly) {
      const t0 = Math.max(a, o.t0), t1 = Math.min(b, o.t0 + lifeOf(o)); if (t1 <= t0) continue;
      for (let t = t0; t <= t1; t += 0.05) { const A = circ(o, t); if (!A) continue; const M = msPose(ms, t - ms.t0, {}); if (M.phase === 'gone') continue;
        const q = scr(M.x, M.y, M.z); if (hyp(A[0] - q[0], A[1] - q[1]) < A[2] + MS_R * 1.05 * q[2] + 3) return false; }
    }
    return true;
  }
  function mothership(t) {
    const swW = +(c.sway[1] * (0.9 + 0.2 * rng())).toFixed(3), ph = +(rng() * TAU).toFixed(3), mxs = [0, 1, 2, 3, 4, 5].map(() => +rng.range(-2.5, 2.5).toFixed(3));
    const ms = { id: 0, t0: +t.toFixed(3), t1: 0, kind: 'ms', arrive: 1.8, stay: c.msStay, leave: 1.5, m: [mxs[0], 4.9, -15], swA: c.sway[0], swW, ph, n: c.shields, core: -1 };
    search: for (let dt = 0; dt <= 2.4; dt += 0.6) for (const mx of mxs) { ms.t0 = +(t + dt).toFixed(3); ms.m = [mx, 4.9, -15]; if (msClear(ms)) break search; }
    ms.t1 = +(ms.t0 + ms.arrive + ms.stay + ms.leave).toFixed(3);
    out.push(ms);
    const msRef = { t0: ms.t0, arrive: ms.arrive, stay: ms.stay, leave: ms.leave, m: ms.m, swA: ms.swA, swW, ph, core: -1 };
    const tm = ms.t0 + ms.arrive, mem = [];
    for (let k = 0; k <= c.shields; k++) {
      const core = k === c.shields;
      const s = { id: 0, t0: +tm.toFixed(3), t1: +(tm + ms.stay).toFixed(3), kind: core ? 'core' : 'shield', k, n: c.shields, ms: msRef, readyAt: 0 };
      if (k) s._ahead = mem[k - 1];
      mem.push(s); out.push(s);
    }
    ms._core = mem[mem.length - 1]; msRef._core = ms._core;
    // escorts: small saucers dropped from the bay, spread over the stay
    const ne = c.esc, span = ms.stay - descOf(0) * 0.5 - 1.2;
    for (let i = 0; i < ne; i++) {
      const te = tm + 0.9 + span * (i + 0.3 + 0.4 * rng()) / ne, B0 = bayAt(msRef, te, {}), ex = rng.range(50, RW - 50), ey = rng.range(limbAt(ex) + 20, RH - 14);
      const sp = mk(te, { size: 0, sch: rng.int(0, 3), s: [B0.x, B0.y, B0.z], ex, ey, r1: rng(), r2: rng(), r3: rng(), esc: msRef, desc: +(descOf(0) * 0.9).toFixed(3) });
      if (fits(sp)) book(sp, false);
    }
    return ms;
  }
  // ---- the round: three waves (variant 3: a mothership closes wave 2 too), the last one closed by the mothership ----
  const TW = c.stream, shares = [0.3, 0.33, 0.37], abdPlan = rng() < 0.25, abdWave = 1;
  let abdDone = false, t = 0.4, last = 0, ships = [];
  for (let w = 0; w < 3; w++) {
    const ws = t, we = ws + TW * shares[w];
    dir.waves.push({ n: w + 1, t: +ws.toFixed(3) });
    t = ws + 1.2;
    let guard = 0, formW = false;
    while (t < we && guard++ < 400) {
      const up = upAt(t);
      if (up.length >= c.live) { t = Math.min(...up.map(s => s.t0 + (s.veer || s.desc))) + 0.05; continue; }
      if (abdPlan && !abdDone && w === abdWave && t > ws + (we - ws) * 0.4 && up.length <= 2) {
        if (abduction(t)) { abdDone = true; t += rng.range(c.gap[0], c.gap[1]); continue; }
      }
      const rf = rng();                                       // a formation: one per wave (from 2.5 s in), more by `trick`
      if ((rf < c.trick || !formW) && up.length <= 2 && t > ws + 2.5 && t < we - 2) {
        const dur = formation(t);
        if (dur > 0) { formW = true; t += dur + rng.range(c.pause[0], c.pause[1]) + desc0 * 0.2; continue; }
      }
      const s1 = single(t);
      if (!s1) { t += 0.2; continue; }
      if (rng() < c.burst && upAt(t).length < c.live) single(t + rng.range(c.bgap[0], c.bgap[1]));
      t += rng.range(c.gap[0], c.gap[1]) * (s1.bomb ? 0.8 : 1);
    }
    const wEnd = fly.reduce((a, s) => Math.max(a, s.t0 + (s.veer || s.desc) * 0.55), we);
    if (w === 2 || (w === 1 && c.ships >= 2)) {
      const ms = mothership(Math.max(we + 0.6, wEnd));
      ships.push(ms);
      t = ms.t1 + 0.8;
    } else t = wEnd + 1.0;
    for (let k = 0; k < 6 && abdPlan && !abdDone && w === abdWave; k++) if (abduction(we - desc0 * 0.3 - k * 0.8)) abdDone = true;
  }
  // ---- reload-aware pacing (a perfect player: 0.22 s reaction, 0.2 s between shots, aim 0.06 + 0.32 x distance /
  // diagonal; after a full magazine the next shot waits `rel`). A saucer this player could not reach in time is delayed
  // (singles only, if it still fits); formation members / escorts are left as they are (measured). ----
  const magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0;
  let relFix = 0;
  for (let it = 0; it < 3 && magN; it++) {
    const miss = solve(out, c, magN).missed;
    let changed = false;
    for (const m of miss) {
      const sp = m.sp; if (!isSaucer(sp) || sp.fm || sp.esc) continue;
      const t0 = sp.t0; let ok = false;
      for (let dd = m.late + 0.3; dd < 2.6; dd += 0.2) { sp.t0 = +(t0 + dd).toFixed(3); sp.t1 = +(sp.t0 + lifeOf(sp) + 0.05).toFixed(3); if (fits(sp)) { ok = true; break; } }
      if (!ok) { sp.t0 = t0; sp.t1 = +(sp.t0 + lifeOf(sp) + 0.05).toFixed(3); } else { relFix++; changed = true; }
    }
    if (!changed) break;
  }
  out.sort((a, b) => a.t0 - b.t0);
  out.forEach((s, i) => { s.id = i; });
  for (const s of out) if (s._ahead) { s.aheadD = s.id - s._ahead.id; delete s._ahead; }
  for (const s of out) if (s.kind === 'ms') { s.core = s._core.id; delete s._core; }
  for (const s of out) if (s.ms && s.ms._core) { s.ms.core = s.ms._core.id; }
  for (const s of out) if (s.ms && s.ms._core) delete s.ms._core;
  last = out.reduce((a, s) => s.kind === 'dir' ? a : Math.max(a, s.t1), 0);
  dir.last = +last.toFixed(3); dir.t1 = +(last + FIN_HOLD + 1.2).toFixed(3);
  dir.core = ships.length ? ships[ships.length - 1].core : -1;
  const req = out.filter(isReq).length;
  c.reqCount = req; c.realCount = out.filter(s => isSaucer(s) && !s.bomb && !s.turn && !s.abd).length; c.bombCount = out.filter(s => s.bomb).length;
  c.turnCount = out.filter(s => s.turn).length; c.formCount = formsDone; c.abd = abdDone; c.relFix = relFix;
  c.quota = Math.max(4, Math.round(req * c.share));
  c.time = Math.ceil(last + FIN_SLOT);
  return out;
}
// the greedy earliest-deadline player (pacing + measurement): -> { missed: [{ sp, late }], shots, reloads }
function solve(tl, c, magN, o = {}) {
  const react = o.react || 0.22, between = o.between || 0.2, aimA = o.aimA || 0.06, aimB = o.aimB || 0.32, rel = c.rel;
  const items = [];
  for (const s of tl) {
    if (isSaucer(s) && !s.bomb && !s.turn) {
      const dl = s.t0 + (s.abd ? s.desc + s.abd.beam : s.desc) - 0.08;
      items.push({ sp: s, ready: s.t0 + s.readyAt + react, dl, opt: !!s.abd });
    } else if (s.kind === 'shield' || s.kind === 'core') items.push({ sp: s, ready: s.t0 + react, dl: s.t1 - 0.05, col: true });
  }
  const done = new Set(), missed = []; let now = 0, shots = 0, reloads = 0, aim = [RW / 2, RH / 2];
  const ahead = s => s._ahead || (s.aheadD ? tl[s.id - s.aheadD] : null);
  const posOf = (s, t) => {
    if (s.kind === 'shield' || s.kind === 'core') { const ms = s.ms, P = msPose(ms, t - ms.t0, {}); const q = scr(P.x, P.y - SHIELD_Z * MTs, P.z + SHIELD_Z * MTc); return q; }
    const P = saucerPose(s, t - s.t0, {}); return P.visible ? scr(P.x, P.y, P.z) : scr(s.e[0], s.e[1], s.e[2]);
  };
  const colReady = it => { if (!it.col) return true; const f = ahead(it.sp); return !f || done.has(f); };
  for (let guard = 0; guard < 4000; guard++) {
    const avail = items.filter(it => !done.has(it.sp) && !it.dead && colReady(it));
    if (!avail.length) break;
    for (const it of avail) if (it.dl < now) { it.dead = true; if (!it.opt) missed.push({ sp: it.sp, late: now - it.dl }); }
    const ready = avail.filter(it => !it.dead && it.ready <= now);
    if (!ready.length) { const nx = avail.filter(it => !it.dead).map(it => it.ready); if (!nx.length) break; now = Math.max(now, Math.min(...nx)); continue; }
    ready.sort((a, b) => a.dl - b.dl || a.sp.t0 - b.sp.t0);
    const it = ready[0], q = posOf(it.sp, now), d = hyp(q[0] - aim[0], q[1] - aim[1]);
    let st = now + aimA + aimB * d / DIAG;
    if (magN && shots > 0 && shots % magN === 0) { st += rel; reloads++; }
    if (st > it.dl) { it.dead = true; if (!it.opt) missed.push({ sp: it.sp, late: st - it.dl }); continue; }
    done.add(it.sp); shots++; aim = [q[0], q[1]]; now = st + between;
    if (it.col) for (const o2 of items) if (o2.col && ahead(o2.sp) === it.sp) o2.ready = now;
  }
  return { missed, shots, reloads, done: done.size };
}
// points: DOME full, RIM half (by size), +50 picked off far out (the first 35 % of the descent), +50 a turncoat before it
// turned; the abductor 500 (the duck cameo bonus); shields 150, the core 1000
function points(sp, lt, zone) {
  if (sp.kind === 'shield') return PTS_SHIELD;
  if (sp.kind === 'core') return PTS_CORE;
  if (sp.kind !== 'saucer' || sp.bomb) return 0;
  if (sp.abd) return PTS_DUCK;
  const P = PTS[sp.size | 0];
  let p = zone === 'dome' ? P[0] : P[1];
  if (lt < sp.desc * 0.35) p += PTS_EARLY;
  if (sp.turn) p += 50;
  return p;
}
function briefing(c) {
  const HINTS = ['SHOOT THE DOME FOR FULL POINTS!', 'CARDBOARD DOME = DECOY. LOOK FIRST!', 'A FUSE ON A SAUCER = IT TURNS. HOLD FIRE!', 'SHIELDS FIRST, THEN THE CORE!'];
  return { rule: [['SHOOT ', 'void'], [c.quota + ' SAUCERS', 'red'], [' OR MORE!', 'void']], icon: 'saucer', unit: 'SAUCERS',
    dont: 'bomb', tip: "DON'T LET THEM LAND!", hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}
// ---------- briefing card icons: a tin saucer with a glowing dome; the skull-hulled bomb saucer ----------
const SAUCER_ICON = ['.....CCCC.....', '....CIIWCC....', '....CIICCC....', '...SSSSSSSS...', '.RRRRRRRRRRRR.', 'KLKKLKKLKKLKKL', '.OOOOOOOOOOOO.', '...OOOYYOOO...', '.....Y..Y.....', '....Y....Y....'];
const SAUCER_KEY = { C: 'cyan', I: 'ice', W: 'bone', S: 'steel', R: 'red', K: 'crimson', L: 'lemon', O: 'oxblood', Y: 'yellow' };
const BOMB_ICON = ['......F.......', '......U.......', '.....RRRR.....', '....RCRRRR....', '...SSSSSSSS...', '.NNBBBBBBBNNN.', 'MMMBVVBVVBMMMM', 'MMMBBBVBBBMMMM', '.XXXBXBXBXXXX.', '...XXXXXXXX...'];
const BOMB_KEY = { F: 'orange', U: 'umber', R: 'red', C: 'coral', S: 'slate', N: 'navy', B: 'bone', V: 'void', M: 'midnight', X: 'void' };
function drawIcon(cx, cy, r, t = 0) {
  const sc = Math.max(1, Math.round(2 * r / 14)), f = ((t * 5) | 0) & 1;
  B.HUD.sprite(SAUCER_ICON, cx - 7 * sc, cy - 5 * sc, sc, f ? SAUCER_KEY : Object.assign({}, SAUCER_KEY, { L: 'amber', I: 'cyan' }), 'invUfo' + f);
}
function drawDont(cx, cy, r) {
  const sc = Math.max(1, Math.round(2 * r / 14));
  B.HUD.sprite(BOMB_ICON, cx - 7 * sc, cy - 5 * sc, sc, BOMB_KEY, 'invBomb');
}
// the miss ricochet colours for this stage (core/fx.js reads B.FX.ricochetColors[stageId]; this stage throws its own
// weightless version from envRaycast): hull-metal sparks and star dust
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors.invasion = { hot: ['ice', 'bone', 'cyan', 'lemon'], flakes: ['steel', 'haze', 'slate'], pop: 'bone', speed: 0.8, grav: 0 };
// the space hum bed lives in sfx-stage.js (K.stageBeds); hook it into the ambience beds (sfx-music.js owns K.beds)
{ const K = B.SFXKit; if (K && K.beds && K.stageBeds && K.stageBeds.invasion && !K.beds.invasion) K.beds.invasion = K.stageBeds.invasion; }
B.Stage.register({ id: 'invasion', name: 'INVASION', short: 'UFO', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv() { geos(); return buildEnv(); }, config, timeline, makeTarget, points, briefing, drawIcon, drawDont,
  pose: saucerPose, msPose, solve, isReq, lifeOf, TIER_P, SR, scr, earthAt, limbAt, EARTH, EU, FX, chargeAt });
})(window.BLAM);
