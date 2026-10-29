'use strict';
/* =========================================================================================
   B.L.A.M. stages/skyshow.js -- Stage 4: SKY SHOW.
   A city rooftop at night beside a water tower (B.L.A.M. painted on its tank). Across the river a
   skyline of lit windows; the river reflects the lights (wobbling streaks) and every burst (a flash).
   ROCKETS launch from five barges on the river and arc up with a glowing head and a sparkling tail.
   Shoot the HEAD while it climbs: it bursts into a big dithered firework (peony / ring / willow /
   crackle, one colour family each). Points by height at the moment of the hit: low 100, mid 200,
   apex 300, +50 for a hit in the last 0.3 s before it fizzles. Let it go and it fizzles at the apex
   and falls dark. CHAINS: a burst sets off every other live rocket head within CHAIN_R (+50 per link).
   BOMB ROCKETS (Very Hard / Insane): a dark skull head with a BLACK SMOKE trail that puffs skulls.
   Shooting one costs a life (engine penalty). Chains never set a bomb off.
   FINALE: once the quota is met, the last seconds launch four shells that burst into B.L.A.M.
   Distraction: a hot-air balloon drifting along the skyline (env decoration, never shootable).
   Every rocket pose is a pure function of (spawn, local time); chains are a pure function of
   (timeline, hit time, taken set): versus-safe (see "Chains" below).
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets;
const clamp = E.clamp;
const CAM = R.CAM_POS, TAN_H = R.TAN_H, RH = R.RH;
const rgb = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mixc = (a, b, k) => { const A = rgb(a), Bc = rgb(b); return new THREE.Color(A[0] + (Bc[0] - A[0]) * k, A[1] + (Bc[1] - A[1]) * k, A[2] + (Bc[2] - A[2]) * k).getHex(); };
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// ---------- layout ----------
const WATER_Y = -4.0;                                     // river surface
const BARGES = [[-8.2, -21.0], [-4.1, -17.6], [0.3, -22.6], [4.4, -17.8], [8.4, -20.6]];   // [x, z] barge centres
const TUBE_DX = [-0.62, 0, 0.62], LAUNCH_Y = WATER_Y + 0.95;                                // three mortar tubes per barge
const CHAIN_R = 2.6, CHAIN_DT = 0.11;                    // chain radius (world units, head to head) / delay per link (s)
const FALL = 1.0;                                         // a fizzled head falls dark for this long
const FIN_SLOT = 4.4;                                     // the last seconds of a stage are kept for the finale
const FIN_HOLD = 3.9;                                     // finale length (launch -> letters fade)
// head hit radius in game pixels (screen space, so far rockets are as fair as near ones); touch adds slop
const HIT_PX = { mouse: 9, touch: 13, bomb: 5.5 };
const HEAD_SC = 1.5;                                     // rocket heads drawn 1.5x (they are 25 units away)

// =========================================================================================
// FAR SET material: unlit vertex colour (no fog: the skyline is 40-55 units away), env dither class
// (alpha 0.5), plus up to 4 burst FLASHES lighting the sky / skyline around them, star twinkle, and
// on the river a wobble on the reflection streaks + the flashes mirrored onto the water.
// aW > 0: wobble amplitude (water); aW < 0: twinkle seed (stars, aircraft lights).
// =========================================================================================
const FAR_VS = `
attribute vec3 aCol; attribute float aW;
uniform float uTime;
varying vec3 vC; varying vec3 vP; varying float vT;
void main() {
  vec3 p = position;
  if (aW > 0.0) p.x += aW * (0.55 * sin(p.z * 2.1 + uTime * 2.7) + 0.3 * sin(p.z * 5.3 - uTime * 4.1 + p.x * 0.7));
  vC = aCol; vT = aW < 0.0 ? 0.62 + 0.38 * sin(uTime * (2.0 + fract(-aW * 7.31) * 3.0) - aW * 13.7) : 1.0;
  vec4 wp = modelMatrix * vec4(p, 1.0); vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FAR_FS = `
uniform vec4 uF[4]; uniform vec3 uFC[4]; uniform vec4 uFW[4]; uniform float uWater;
varying vec3 vC; varying vec3 vP; varying float vT;
void main() {
  vec3 c = vC * vT;
  for (int i = 0; i < 4; i++) {
    if (uWater > 0.5) {
      vec4 f = uFW[i]; if (f.z <= 0.0) continue;
      vec2 d = vec2((vP.x - f.x) / 5.5, (vP.z - f.y) / 9.0);
      c += uFC[i] * f.z * exp(-dot(d, d));
    } else {
      vec4 f = uF[i]; if (f.w <= 0.0) continue;
      vec2 d = (vP.xy - f.xy) / (9.0 + 0.12 * max(0.0, f.z - vP.z));
      c += uFC[i] * f.w * exp(-dot(d, d) * 1.4);
    }
  }
  gl_FragColor = vec4(c, 0.5);
}`;
const FU = { uTime: { value: 0 }, uF: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
  uFC: { value: [0, 1, 2, 3].map(() => new THREE.Color()) }, uFW: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) } };
function farMat(water) {
  return new THREE.ShaderMaterial({ uniforms: { uTime: FU.uTime, uF: FU.uF, uFC: FU.uFC, uFW: FU.uFW, uWater: { value: water ? 1 : 0 } },
    vertexShader: FAR_VS, fragmentShader: FAR_FS });
}
// a Vox that also records a per-vertex aW (wobble / twinkle) -> geometry with aCol + aW
class FarVox extends Vox {
  constructor() { super(); this.w = []; this.wv = 0; }
  box(x, y, z, w, h, d, col, m, mask = 63) { const n0 = this.vc; super.box(x, y, z, w, h, d, col, m, mask); for (let i = n0; i < this.vc; i++) this.w.push(this.wv); return this; }
  geo() {
    const g = super.geo(); g.setAttribute('aCol', g.attributes.color); g.deleteAttribute('color'); g.deleteAttribute('normal');
    g.setAttribute('aW', new THREE.Float32BufferAttribute(this.w, 1)); return g;
  }
}
// where the reflection of world point P lands on the river (camera fixed): mirror P in the water plane and
// intersect the camera ray toward the mirror image with the plane. -> [x, z] or null (behind / too near)
function onWater(x, y, z) {
  const my = 2 * WATER_Y - y, s = (CAM.y - WATER_Y) / (CAM.y - my);
  if (!(s > 0 && s < 1)) return null;
  return [CAM.x + (x - CAM.x) * s, CAM.z + (z - CAM.z) * s];
}

// =========================================================================================
// FX: the firework particle system. One InstancedMesh of unlit cubes (one draw call), stepped in its own
// onBeforeRender with wall-clock dt (x the ?slow factor in play). Purely cosmetic (Math.random is fine):
// nothing here feeds scoring. Shapes: peony, ring, willow, crackle, the bomb's black blast, rocket trails,
// skull puffs, launch flashes, chain sparks, and the finale letters.
// =========================================================================================
const FXN = 2200, F_CRACKLE = 1, F_TWINKLE = 2, F_TRAIL = 4;
const FX = { mesh: null, P: new Float32Array(FXN * 3), V: new Float32Array(FXN * 3), A: new Float32Array(FXN * 8),
  C: new Uint32Array(FXN), C2: new Uint32Array(FXN), next: 0, last: 0, shells: [], flashI: 0, t: 0, live: 0 };
const _col = new THREE.Color();
function fxInit() {
  if (FX.mesh) return FX.mesh;
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), FXN);
  m.frustumCulled = false; m.userData.sharedGeo = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const a = m.instanceMatrix.array; a.fill(0);
  for (let i = 0; i < FXN; i++) m.setColorAt(i, _col.set(0xffffff));
  m.onBeforeRender = fxStep;
  return (FX.mesh = m);
}
// spawn one particle. grav: x FX gravity (negative rises); drag: velocity decay per second; grow: size growth per
// second (x size); flags: F_CRACKLE pops at death, F_TWINKLE flickers to col2, F_TRAIL drips a dim trail; gdel: no
// gravity / drag change before this age (finale letters hold their shape)
function spark(x, y, z, vx, vy, vz, size, col, life, grav = 1, drag = 0, grow = 0, flags = 0, col2 = 0, gdel = 0) {
  const i = FX.next; FX.next = (FX.next + 1) % FXN;
  const p = i * 3, a = i * 8;
  FX.P[p] = x; FX.P[p + 1] = y; FX.P[p + 2] = z; FX.V[p] = vx; FX.V[p + 1] = vy; FX.V[p + 2] = vz;
  FX.A[a] = 0; FX.A[a + 1] = life; FX.A[a + 2] = size; FX.A[a + 3] = grav; FX.A[a + 4] = drag; FX.A[a + 5] = grow; FX.A[a + 6] = flags; FX.A[a + 7] = gdel;
  FX.C[i] = col; FX.C2[i] = col2 || PAL.lemon;
  if (FX.mesh) { _col.set(col); FX.mesh.instanceColor.setXYZ(i, _col.r, _col.g, _col.b); FX.mesh.instanceColor.needsUpdate = true; }
}
function fxClear() { FX.A.fill(0); FX.shells.length = 0; for (const f of FU.uF.value) f.w = 0; for (const f of FU.uFW.value) f.z = 0; if (FX.mesh) FX.mesh.instanceMatrix.array.fill(0); }
const GRAV = 3.2;
function fxStep() {
  const now = performance.now(), G = B.G;
  let dt = FX.last ? Math.min(0.05, (now - FX.last) / 1000) : 0.016; FX.last = now;
  if (G && G.screenName === 'play' && G.slow < 1 && !(G.run && G.run.versus)) dt *= G.slow;
  FX.t += dt; FU.uTime.value = FX.t;
  for (let k = 0; k < 4; k++) { FU.uF.value[k].w *= Math.exp(-dt * 6.5); FU.uFW.value[k].z *= Math.exp(-dt * 6.5); }
  shellStep(dt);
  const M = FX.mesh.instanceMatrix.array, IC = FX.mesh.instanceColor; let live = 0, colDirty = false;
  for (let i = 0; i < FXN; i++) {
    const a = i * 8, o = i * 16;
    if (FX.A[a + 1] <= 0) { if (M[o] !== 0) { M[o] = M[o + 5] = M[o + 10] = 0; } continue; }
    const age = FX.A[a] += dt, life = FX.A[a + 1];
    const p = i * 3, fl = FX.A[a + 6];
    if (age >= life) {
      FX.A[a + 1] = 0; M[o] = M[o + 5] = M[o + 10] = 0;
      if (fl & F_CRACKLE) for (let k = 0; k < 3; k++) spark(FX.P[p], FX.P[p + 1], FX.P[p + 2], R.rnd(-1.4, 1.4), R.rnd(-1.4, 1.4), R.rnd(-0.5, 0.5), 0.13, k ? PAL.bone : PAL.lemon, R.rnd(0.08, 0.16), 0, 3, 0, F_TWINKLE, PAL.mist);
      continue;
    }
    live++;
    const dr = Math.exp(-FX.A[a + 4] * dt);                  // drag always; gravity only after gdel
    FX.V[p] *= dr; FX.V[p + 1] = FX.V[p + 1] * dr - (age >= FX.A[a + 7] ? GRAV * FX.A[a + 3] * dt : 0); FX.V[p + 2] *= dr;
    FX.P[p] += FX.V[p] * dt; FX.P[p + 1] += FX.V[p + 1] * dt; FX.P[p + 2] += FX.V[p + 2] * dt;
    if ((fl & F_TRAIL) && Math.random() < dt * 14) spark(FX.P[p], FX.P[p + 1], FX.P[p + 2], 0, -0.2, 0, FX.A[a + 2] * 0.7, Math.random() < 0.5 ? PAL.rust : PAL.amber, R.rnd(0.35, 0.6), 0.35, 1.5);
    if (fl & F_TWINKLE) { _col.set(((age * 17 + i) | 0) & 1 ? FX.C2[i] : FX.C[i]); IC.setXYZ(i, _col.r, _col.g, _col.b); colDirty = true; }
    const left = life - age, s = FX.A[a + 2] * (1 + FX.A[a + 5] * age) * (left < 0.3 ? Math.max(0.15, left / 0.3) : 1);
    M[o] = s; M[o + 1] = 0; M[o + 2] = 0; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = s; M[o + 6] = 0; M[o + 7] = 0;
    M[o + 8] = 0; M[o + 9] = 0; M[o + 10] = s; M[o + 11] = 0; M[o + 12] = FX.P[p]; M[o + 13] = FX.P[p + 1]; M[o + 14] = FX.P[p + 2]; M[o + 15] = 1;
  }
  FX.live = live;
  FX.mesh.instanceMatrix.needsUpdate = true; if (colDirty) IC.needsUpdate = true;
}
// a burst flash: lights the sky / skyline around (x, y) and its mirror image on the river
function flash(x, y, z, col, k = 0.42) {
  const i = FX.flashI = (FX.flashI + 1) % 4;
  FU.uF.value[i].set(x, y, z, k); FU.uFC.value[i].set(col);
  const q = onWater(x, y, z) || [x, -30];
  FU.uFW.value[i].set(q[0], q[1], k * 0.9, 0);
}
// ---------- the four firework types: head colours, burst colours, flash tint ----------
const TYPES = [
  { id: 'peony',   head: [PAL.red, PAL.coral],  cols: [PAL.red, PAL.coral, PAL.pink, PAL.red],     inner: PAL.bubblegum, flash: PAL.coral },
  { id: 'ring',    head: [PAL.cyan, PAL.ice],   cols: [PAL.cyan, PAL.ice, PAL.cyan, PAL.blue],     inner: PAL.ice,       flash: PAL.cyan },
  { id: 'willow',  head: [PAL.amber, PAL.yellow], cols: [PAL.amber, PAL.yellow, PAL.orange, PAL.amber], inner: PAL.lemon, flash: PAL.amber },
  { id: 'crackle', head: [PAL.lime, PAL.green], cols: [PAL.lime, PAL.green, PAL.lime, PAL.bone],   inner: PAL.bone,      flash: PAL.lime }
];
const rndDir = () => { const u = R.rnd(-1, 1), a = R.rnd(0, 6.2832), s = Math.sqrt(1 - u * u); return [s * Math.cos(a), s * Math.sin(a), u * 0.55]; };
// a burst at (x, y, z), size s (~1; apex bursts are bigger). Spread radius ~ speed / drag ~ 3 s world units.
function burstFX(type, x, y, z, s = 1) {
  const Ty = TYPES[type] || TYPES[0];
  for (let k = 0; k < 12; k++) { const d = rndDir(); spark(x, y, z, d[0] * 1.2, d[1] * 1.2, d[2], R.rnd(0.24, 0.36) * s, k & 1 ? PAL.bone : PAL.lemon, R.rnd(0.1, 0.2), 0, 2); }
  if (Ty.id === 'peony') {
    for (let k = 0, n = Math.round(110 * s); k < n; k++) {
      const d = rndDir(), v = 7.0 * s * R.rnd(0.88, 1.08);
      spark(x, y, z, d[0] * v, d[1] * v, d[2] * v, R.rnd(0.2, 0.27), Ty.cols[k & 3], R.rnd(1.15, 1.5), 0.28, 1.5, 0, k % 3 ? 0 : F_TWINKLE, PAL.bubblegum);
    }
    for (let k = 0; k < 22; k++) { const d = rndDir(), v = 3.4 * s; spark(x, y, z, d[0] * v, d[1] * v, d[2] * v, 0.2, k & 1 ? PAL.lemon : Ty.inner, R.rnd(0.7, 0.95), 0.2, 1.6); }
  } else if (Ty.id === 'ring') {
    const n = new THREE.Vector3(R.rnd(-0.35, 0.35), R.rnd(-0.55, 0.55), 1).normalize();
    const e1 = new THREE.Vector3(-n.z, 0, n.x).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1);
    const ring = (cnt, v, col, size, life) => { for (let k = 0; k < cnt; k++) { const a = k / cnt * 6.2832 + R.rnd(-0.03, 0.03), c = Math.cos(a) * v, si = Math.sin(a) * v;
      spark(x, y, z, e1.x * c + e2.x * si, e1.y * c + e2.y * si, e1.z * c + e2.z * si, size, col(k), life * R.rnd(0.92, 1.05), 0.14, 1.5, 0, k % 4 ? 0 : F_TWINKLE, PAL.bone); } };
    ring(Math.round(76 * s), 7.2 * s, k => Ty.cols[k & 3], 0.24, 1.35);
    ring(40, 3.8 * s, k => k & 1 ? PAL.ice : PAL.lemon, 0.2, 1.0);
  } else if (Ty.id === 'willow') {
    for (let k = 0, n = Math.round(84 * s); k < n; k++) {
      const d = rndDir(), v = 5.6 * s * R.rnd(0.85, 1.08);
      spark(x, y, z, d[0] * v, d[1] * v + 0.9, d[2] * v, R.rnd(0.2, 0.26), Ty.cols[k & 3], R.rnd(2.0, 2.6), 0.85, 1.9, 0, k % 5 ? F_TRAIL : F_TRAIL | F_TWINKLE, PAL.lemon);
    }
  } else {                                                                      // crackle: pops into white specks
    for (let k = 0, n = Math.round(84 * s); k < n; k++) {
      const d = rndDir(), v = 6.4 * s * R.rnd(0.85, 1.08);
      spark(x, y, z, d[0] * v, d[1] * v, d[2] * v, R.rnd(0.2, 0.26), Ty.cols[k & 3], R.rnd(0.75, 1.05), 0.4, 1.6, 0, F_CRACKLE | (k & 1 ? F_TWINKLE : 0), PAL.bone);
    }
  }
  flash(x, y, z, Ty.flash, 0.36 + 0.12 * s);
}
// the bomb rocket's blast: a black cloud, red embers, one big skull puff
function blastFX(x, y, z) {
  const smoke = [PAL.void, PAL.void, PAL.midnight, PAL.navy];
  for (let k = 0; k < 48; k++) { const d = rndDir(), v = R.rnd(1, 3.4); spark(x, y, z, d[0] * v, d[1] * v, d[2] * v, R.rnd(0.3, 0.5), smoke[k & 3], R.rnd(0.9, 1.4), -0.1, 2.2, 0.7); }
  for (let k = 0; k < 26; k++) { const d = rndDir(), v = R.rnd(3, 5); spark(x, y, z, d[0] * v, d[1] * v, d[2] * v, 0.16, [PAL.red, PAL.orange, PAL.crimson][k % 3], R.rnd(0.4, 0.7), 0.7, 1.8); }
  skullPuff(x, y + 0.3, z + 0.3, 2.2, 0, 0.5);
  flash(x, y, z, PAL.crimson, 0.5);
}
// a skull of black smoke cubes (eye / nose holes show the sky). All cubes share a base velocity plus an
// outward drift proportional to their offset, and grow together, so the face holds while it puffs up.
const SKULL_PUFF = ['.XXXXX.', 'XXXXXXX', 'X..X..X', 'X..X..X', 'XXX.XXX', '.XXXXX.', '.X.X.X.'];
function skullPuff(x, y, z, s, vx, vy) {
  const g = 0.15 * s;
  SKULL_PUFF.forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] === 'X') {
    const ox = (i - 3) * g, oy = (3 - j) * g;
    spark(x + ox, y + oy, z, vx + ox * 0.9, vy + oy * 0.9, 0, g * 1.05, PAL.void, 1.05, -0.04, 0.6, 0.75);
  } });
}
// rocket tail sparks / bomb smoke for one frame of dt seconds at the head
function trailFX(sp, x, y, z, dt) {
  const n = Math.min(6, Math.floor(dt * (sp.bomb ? 30 : 46) + Math.random()));
  if (sp.bomb) {
    for (let k = 0; k < n; k++) spark(x + R.rnd(-0.06, 0.06), y - 0.15, z, R.rnd(-0.25, 0.25), R.rnd(-0.35, 0.05), 0, R.rnd(0.2, 0.3), k % 3 ? PAL.void : PAL.midnight, R.rnd(0.7, 1.0), -0.05, 1.1, 1.0);
    if (Math.random() < dt * 9) spark(x, y, z, R.rnd(-0.6, 0.6), R.rnd(-0.6, 0.4), 0, 0.1, Math.random() < 0.5 ? PAL.red : PAL.crimson, R.rnd(0.15, 0.3), 0.5, 1);
    return;
  }
  const Ty = TYPES[sp.type];
  for (let k = 0; k < n; k++) spark(x + R.rnd(-0.05, 0.05), y - 0.12, z, R.rnd(-0.35, 0.35), R.rnd(-1.0, -0.2), R.rnd(-0.2, 0.2), R.rnd(0.13, 0.2),
    [PAL.lemon, PAL.yellow, Ty.head[0], PAL.orange][(Math.random() * 4) | 0], R.rnd(0.22, 0.5), 0.6, 1.2, 0, Math.random() < 0.3 ? F_TWINKLE : 0, PAL.bone);
}
function launchFX(x, y, z) {
  for (let k = 0; k < 12; k++) spark(x, y, z, R.rnd(-0.7, 0.7), R.rnd(1, 3.2), R.rnd(-0.3, 0.3), R.rnd(0.12, 0.2), k & 1 ? PAL.lemon : PAL.orange, R.rnd(0.15, 0.35), 0.8, 1);
  for (let k = 0; k < 6; k++) spark(x + R.rnd(-0.2, 0.2), y, z, R.rnd(-0.3, 0.3), R.rnd(0.3, 0.8), 0, R.rnd(0.22, 0.32), k & 1 ? PAL.slate : PAL.steel, R.rnd(0.6, 0.9), -0.05, 1.2, 0.8);
}
function fizzleFX(x, y, z) {
  for (let k = 0; k < 7; k++) spark(x, y, z, R.rnd(-0.4, 0.4), R.rnd(-0.1, 0.4), 0, R.rnd(0.18, 0.26), k & 1 ? PAL.slate : PAL.navy, R.rnd(0.6, 0.9), -0.05, 1.2, 0.7);
  for (let k = 0; k < 4; k++) spark(x, y, z, R.rnd(-0.6, 0.6), R.rnd(-0.6, 0.3), 0, 0.1, PAL.rust, R.rnd(0.2, 0.35), 0.6, 1);
}
// chain link: a quick fuse of sparks from the burst that set it off to the next head
function chainFX(a, b) {
  for (let k = 0; k < 12; k++) { const f = k / 11; spark(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f, R.rnd(-0.2, 0.2), R.rnd(-0.2, 0.2), 0, 0.17, k & 1 ? PAL.lemon : PAL.bone, 0.18 + f * 0.12, 0, 1); }
}

// ---------- finale: four shells burst into the letters B / L / A / M (the dots ride with the letter before) ----------
const FIN = { S: 0.82, cx: 0, cy: 6.4, z: -24 };
let FIN_LETTERS = null;
function finLetters() {
  if (FIN_LETTERS) return FIN_LETTERS;
  const t = R.bold('B.L.A.M.'), groups = [[], [], [], []], S = FIN.S, x0 = FIN.cx - t.w * S / 2, y0 = FIN.cy + 3 * S;
  for (const [px, py, ci] of t.px) groups[Math.min(3, ci >> 1)].push({ x: x0 + (px + 0.5) * S, y: y0 - py * S, row: py });
  return (FIN_LETTERS = groups.map(g => ({ pts: g, cx: g.reduce((a, p) => a + p.x, 0) / g.length, cy: g.reduce((a, p) => a + p.y, 0) / g.length })));
}
const ROW_COL = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
function finale() {
  finLetters().forEach((L, i) => {
    const b = BARGES[[0, 1, 3, 4][i]];
    FX.shells.push({ t: -i * 0.3, dur: 1.0, x0: b[0], y0: LAUNCH_Y, z0: b[1], x1: L.cx, y1: L.cy, z1: FIN.z, L, burst: false });
  });
  B.SFX.play('finale');
}
function shellStep(dt) {
  for (let i = FX.shells.length - 1; i >= 0; i--) {
    const s = FX.shells[i], prev = s.t; s.t += dt;
    if (s.t < 0) continue;
    if (prev < 0) { launchFX(s.x0, s.y0, s.z0); B.SFX.play('rocketLaunch', { u: 0.5 + s.x0 / 30 }); }
    const p = Math.min(1, s.t / s.dur), f = 1 - (1 - p) * (1 - p);
    const x = s.x0 + (s.x1 - s.x0) * p, y = s.y0 + (s.y1 - s.y0) * f, z = s.z0 + (s.z1 - s.z0) * p;
    if (!s.burst) {
      spark(x, y, z, 0, 0, 0, 0.34, PAL.lemon, 0.05, 0);
      trailFX({ type: 2 }, x, y, z, dt);
    }
    if (p >= 1 && !s.burst) {
      s.burst = true; FX.shells.splice(i, 1);
      const D = 4.2, hold = 1.9;
      for (const q of s.L.pts) for (let k = 0; k < 2; k++) {
        const tx = q.x + R.rnd(-0.12, 0.12), ty = q.y + R.rnd(-0.12, 0.12);
        spark(x, y, z, (tx - x) * D, (ty - y) * D, (s.z1 - z) * D, R.rnd(0.42, 0.52), ROW_COL[q.row], hold + R.rnd(0.9, 1.3), 0.5, D, 0, k ? F_TWINKLE : 0, PAL.bone, hold + R.rnd(0, 0.4));
      }
      for (let k = 0; k < 26; k++) { const d = rndDir(), v = 5.5; spark(x, y, z, d[0] * v, d[1] * v, d[2] * v, 0.2, [PAL.pink, PAL.cyan, PAL.lime, PAL.amber][k & 3], R.rnd(0.6, 0.9), 0.3, 1.6); }
      flash(x, y, z, PAL.yellow, 0.55);
      B.SFX.play('rocketBurst', { u: 0.5 + x / 32, type: 'letter' });
    }
  }
}
// =========================================================================================
// THE SET. Near rooftop (lit env + unlit glow), far set (sky, moon, stars, skyline, far quay, barges),
// the river (wobbling reflections), the balloon, the firework particles: 6 draw calls.
// =========================================================================================
const NEAR = { parY: 0.55, parZ: 2.1, lx: -4.3, lz: -4.6, ly: 0.6, rx: 3.6, rz: -4.6, tower: [-5.6, -3.4], tankY: [1.95, 4.0], tankR: 1.1 };
function nearBake(x, y, z) {
  let L = 0.86 - 0.05 * Math.max(0, -z - 2) / 4;
  if (y < 0) L *= Math.max(0.45, 1 + 0.12 * y);                            // the wing walls darken down toward the water
  L += 0.22 * Math.exp(-((x - 0.0) ** 2 + (y - 0.9) ** 2 + (z - 2.1) ** 2) * 0.25);   // festoon bulbs along the parapet
  return L;
}
function brickWall(v, axis, a0, a1, y0, y1, plane, dir, cols, mortar) {   // a brick face on the x (axis 'x') or z plane
  const face = axis === 'x' ? (dir > 0 ? 1 : 2) : (dir > 0 ? 16 : 32);
  const t0 = Math.min(plane, plane - dir * 0.08), t1 = Math.max(plane, plane - dir * 0.08);
  if (axis === 'x') v.bx(t0 - dir * 0.02, y0, a0, t1, y1, a1, mortar, null, face); else v.bx(a0, y0, t0 - dir * 0.02, a1, y1, t1, mortar, null, face);
  for (let r = 0, y = y0; y < y1 - 0.05; r++, y += 0.22) {
    const off = (r & 1) * 0.22;
    for (let a = a0 - off; a < a1; a += 0.44) {
      const b0 = Math.max(a0, a) + 0.025, b1 = Math.min(a1, a + 0.44) - 0.025, yy = Math.min(y1, y + 0.22) - 0.025;
      if (b1 - b0 < 0.06) continue;
      const c = cols[(hash1(r * 131 + Math.round(a * 10)) * cols.length) | 0];
      if (axis === 'x') v.bx(t0, y + 0.025, b0, t1 + dir * 0.03, yy, b1, c, null, face); else v.bx(b0, y + 0.025, t0, b1, yy, t1 + dir * 0.03, c, null, face);
    }
  }
}
const BRICK = [PAL.chestnut, PAL.chestnut, PAL.walnut, PAL.tan], BRICK_D = [PAL.walnut, PAL.walnut, PAL.umber, PAL.chestnut];
function buildNear(room, glow) {
  const N = NEAR, rng = B.Stage.mulberry32(0x5c75);
  // ---- our parapet (the ledge in front of us) with a concrete cap and a string of festoon bulbs ----
  brickWall(room, 'z', N.lx, N.rx, -0.6, N.parY, N.parZ, 1, BRICK, PAL.umber);
  room.bx(N.lx - 0.05, N.parY, N.parZ - 0.12, N.rx + 0.05, N.parY + 0.1, N.parZ + 0.16, PAL.haze);
  room.bx(N.lx - 0.05, N.parY + 0.1, N.parZ - 0.12, N.rx + 0.05, N.parY + 0.12, N.parZ + 0.16, PAL.mist, null, 4);
  const BULBS = [PAL.red, PAL.yellow, PAL.cyan, PAL.lime, PAL.pink];
  for (let x = N.lx + 0.2, k = 0; x < N.rx; x += 0.38, k++) {
    const y = N.parY + 0.12;
    room.bx(x - 0.19, y + 0.005, N.parZ + 0.1, x + 0.19, y + 0.012, N.parZ + 0.115, PAL.void);
    glow.bx(x - 0.022, y, N.parZ + 0.1, x + 0.022, y + 0.04, N.parZ + 0.14, BULBS[k % 5]);
  }
  // ---- left wing: a taller roof (the water tower stands on it); its inner wall drops to the river ----
  room.bx(-13, N.ly - 0.15, N.lz, N.lx, N.ly, 4, PAL.slate, null, 4);
  for (let x = -13; x < N.lx; x += 1) for (let z = N.lz; z < 4; z += 1) if (hash1(x * 7 + z * 13) > 0.6) room.bx(x + 0.05, N.ly, z + 0.05, x + 0.95, N.ly + 0.005, z + 0.95, PAL.steel, null, 4);
  brickWall(room, 'x', N.lz, N.parZ - 0.1, -4.6, N.ly, N.lx, 1, BRICK_D, PAL.umber);
  room.bx(N.lx - 0.3, N.ly, N.lz, N.lx, N.ly + 0.35, 4, PAL.haze);                       // its parapet cap
  room.bx(-13, N.ly, N.lz, N.lx, N.ly + 0.35, N.lz + 0.3, PAL.haze);
  for (const [z, y] of []) {                     // a few windows down the wall
    room.bx(N.lx + 0.02, y - 0.05, z - 0.4, N.lx + 0.08, y + 0.75, z + 0.4, PAL.steel, null, 1);
    glow.bx(N.lx + 0.06, y, z - 0.33, N.lx + 0.1, y + 0.7, z + 0.33, y > -2 ? PAL.amber : PAL.lemon);
    room.bx(N.lx + 0.08, y + 0.33, z - 0.33, N.lx + 0.12, y + 0.37, z + 0.33, PAL.walnut, null, 1);
  }
  // ---- the water tower: four stilts with braces, a stave tank with hoops, a cone roof, B.L.A.M. painted on ----
  {
    const [cx, cz] = N.tower, [ty0, ty1] = N.tankY, r = N.tankR, m = new THREE.Matrix4();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * 0.78, z = cz + sz * 0.78;
      room.bx(x - 0.07, N.ly, z - 0.07, x + 0.07, ty0, z + 0.07, PAL.steel);
      room.bx(x - 0.14, N.ly, z - 0.14, x + 0.14, N.ly + 0.12, z + 0.14, PAL.slate);
    }
    for (const yb of [N.ly + 0.45, N.ly + 1.0]) for (const s of [-1, 1]) {
      room.bx(cx - 0.78, yb - 0.03, cz + s * 0.78 - 0.03, cx + 0.78, yb + 0.03, cz + s * 0.78 + 0.03, PAL.slate);
      room.bx(cx + s * 0.78 - 0.03, yb - 0.03, cz - 0.78, cx + s * 0.78 + 0.03, yb + 0.03, cz + 0.78, PAL.slate);
    }
    m.makeRotationZ(0.55).setPosition(cx, N.ly + 0.72, cz + 0.8); room.box(0, 0, 0, 1.8, 0.05, 0.05, PAL.slate, m);   // a cross brace
    room.bx(cx - 1.0, ty0 - 0.12, cz - 1.0, cx + 1.0, ty0, cz + 1.0, PAL.walnut);                   // the deck
    const NS = 22;
    for (let k = 0; k < NS; k++) {                                                                   // staves
      const a = (k + 0.5) / NS * Math.PI * 2;
      m.makeRotationY(a).setPosition(cx + Math.sin(a) * r, (ty0 + ty1) / 2, cz + Math.cos(a) * r);
      room.box(0, 0, 0, 2 * Math.PI * r / NS + 0.02, ty1 - ty0, 0.1, k & 1 ? PAL.chestnut : PAL.tan, m);
      for (const yh of [ty0 + 0.25, (ty0 + ty1) / 2, ty1 - 0.25]) room.box(0, yh - (ty0 + ty1) / 2, 0.06, 2 * Math.PI * r / NS + 0.03, 0.07, 0.04, PAL.slate, m);
    }
    for (let k = 0; k < 7; k++) {                                                                    // cone roof in rings
      const rr = (r + 0.12) * (1 - k / 7), y = ty1 + k * 0.11;
      room.bx(cx - rr, y, cz - rr * 0.95, cx + rr, y + 0.11, cz + rr * 0.95, k & 1 ? PAL.walnut : PAL.umber, null, 63 ^ 8);
    }
    room.bx(cx - 0.04, ty1 + 0.77, cz - 0.04, cx + 0.04, ty1 + 1.05, cz + 0.04, PAL.steel);
    glow.bx(cx - 0.06, ty1 + 1.05, cz - 0.06, cx + 0.06, ty1 + 1.15, cz + 0.06, PAL.red);          // aircraft warning lamp
    // the logo: bold B.L.A.M. painted on the front staves (logo row gradient, void outline), wrapped on the curve
    const t = R.bold('B.L.A.M.'), s = 0.052, x0 = cx - t.w * s / 2, yTop = (ty0 + ty1) / 2 + 3.5 * s + 0.1;
    const cell = new Set(t.px.map(([x, y]) => x + ',' + y)), ROWS = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
    const a0 = Math.atan2(CAM.x - cx, CAM.z - cz);                                               // face the camera
    const paint = (px, py, col, d) => {
      const a = a0 + (x0 + (px + 0.5) * s - cx) / r, rr = r + 0.075 + d;
      m.makeRotationY(a).setPosition(cx + Math.sin(a) * rr, yTop - (py + 0.5) * s, cz + Math.cos(a) * rr);
      room.box(0, 0, 0, s * 1.02, s, 0.02, col, m, 16);
    };
    for (let py = -1; py <= 7; py++) for (let px = -1; px <= t.w; px++) {
      if (cell.has(px + ',' + py)) { paint(px, py, ROWS[py], 0.012); continue; }
      let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (cell.has((px + dx) + ',' + (py + dy))) { near = true; break; }
      if (near) paint(px, py, PAL.void, 0.006);
    }
  }
  // ---- right wing: our roof continues; a pigeon coop, a turbine vent, a brick chimney ----
  room.bx(N.rx, -0.15, N.rz, 13, 0, 4, PAL.navy, null, 4);
  for (let x = Math.ceil(N.rx); x < 13; x += 1) for (let z = N.rz; z < 4; z += 1) if (hash1(x * 11 + z * 5) > 0.55) room.bx(x + 0.05, 0, z + 0.05, x + 0.95, 0.005, z + 0.95, PAL.slate, null, 4);
  brickWall(room, 'x', N.rz, N.parZ - 0.1, -4.6, 0, N.rx, -1, BRICK, PAL.umber);
  room.bx(N.rx, 0, N.rz, N.rx + 0.3, 0.45, 4, PAL.haze);
  room.bx(N.rx, 0, N.rz, 13, 0.45, N.rz + 0.3, PAL.haze);
  for (const [z, y] of [[-2.2, -1.2], [-0.4, -2.4]]) {
    room.bx(N.rx - 0.08, y - 0.05, z - 0.4, N.rx - 0.02, y + 0.75, z + 0.4, PAL.steel, null, 2);
    glow.bx(N.rx - 0.1, y, z - 0.33, N.rx - 0.06, y + 0.7, z + 0.33, y > -2 ? PAL.lemon : PAL.amber);
  }
  {                                                                                                  // pigeon coop (empty: the birds are out)
    const x0 = 3.95, x1 = 5.7, z0 = -1.5, z1 = -0.2, h = 1.05;
    room.bx(x0, 0, z0, x1, 0.12, z1, PAL.walnut);
    for (const x of [x0, x1 - 0.1]) room.bx(x, 0.12, z0, x + 0.1, h, z1, PAL.chestnut);
    room.bx(x0, 0.12, z0, x1, h, z0 + 0.1, PAL.chestnut);
    room.bx(x0 + 0.1, 0.12, z1 - 0.06, x1 - 0.1, h - 0.05, z1 - 0.02, PAL.midnight, null, 16);
    for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.18) room.bx(x - 0.015, 0.12, z1 - 0.02, x + 0.015, h - 0.05, z1, PAL.haze, null, 16);
    for (let y = 0.3; y < h - 0.05; y += 0.18) room.bx(x0 + 0.1, y - 0.015, z1 - 0.02, x1 - 0.1, y + 0.015, z1, PAL.haze, null, 16);
    const m = new THREE.Matrix4();
    for (const s of [-1, 1]) { m.makeRotationX(s * 0.5).setPosition((x0 + x1) / 2, h + 0.18, (z0 + z1) / 2 + s * 0.36); room.box(0, 0, 0, x1 - x0 + 0.3, 0.07, 0.86, PAL.crimson, m); }
    room.bx((x0 + x1) / 2 - 0.3, h - 0.25, z1, (x0 + x1) / 2 + 0.3, h - 0.08, z1 + 0.03, PAL.bone, null, 16);
  }
  {                                                                                                  // turbine vent
    const x = 4.35, z = -2.7;
    room.bx(x - 0.16, 0, z - 0.16, x + 0.16, 0.7, z + 0.16, PAL.steel);
    for (let k = 0; k < 4; k++) { const w = 0.42 - Math.abs(k - 1.5) * 0.1; room.bx(x - w, 0.7 + k * 0.12, z - w, x + w, 0.82 + k * 0.12, z + w, k & 1 ? PAL.haze : PAL.steel); }
  }
  {                                                                                                  // chimney with two clay pots
    const x = 5.3, z = -3.9;
    brickWall(room, 'z', x - 0.5, x + 0.5, 0, 2.2, z + 0.5, 1, BRICK, PAL.umber);
    room.bx(x - 0.5, 0, z - 0.5, x + 0.5, 2.2, z + 0.42, PAL.walnut);
    room.bx(x - 0.58, 2.2, z - 0.58, x + 0.58, 2.34, z + 0.58, PAL.haze);
    for (const dx of [-0.24, 0.24]) { room.bx(x + dx - 0.13, 2.34, z - 0.13, x + dx + 0.13, 2.7, z + 0.13, PAL.rust); room.bx(x + dx - 0.16, 2.62, z - 0.16, x + dx + 0.16, 2.7, z + 0.16, PAL.tan); }
  }
  void rng;
}
// sky gradient: deep royal blue overhead, indigo, a plum city glow at the horizon (never black)
const SKY_STOPS = [[-6, mixc(PAL.plum, PAL.indigo, 0.35)], [0, mixc(PAL.indigo, PAL.plum, 0.3)], [5, PAL.indigo], [10, mixc(PAL.indigo, PAL.deepblue, 0.55)],
  [17, PAL.deepblue], [27, mixc(PAL.deepblue, PAL.midnight, 0.45)]];
function skyCol(y) {
  for (let i = 1; i < SKY_STOPS.length; i++) if (y <= SKY_STOPS[i][0]) { const [y0, c0] = SKY_STOPS[i - 1], [y1, c1] = SKY_STOPS[i]; return mixc(c0, c1, clamp((y - y0) / (y1 - y0), 0, 1)); }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}
const SKY_Z = -52, SHORE_Z = -31.5, SHORE_Y = -3.25;
const LIGHTS = [];                                        // lit points that get a river reflection: [x, y, z, col, w]
function buildFar(far) {
  const rng = B.Stage.mulberry32(0x5ca7), SH = [0.72, 0.72, 0.85, 0.5, 1, 0.6];
  // ---- sky + stars + moon ----
  for (let y = -6; y < 27; y += 1) for (let x = -50; x < 50; x += 10) far.bx(x, y, SKY_Z, x + 10, y + 1, SKY_Z + 0.01, skyCol(y + 0.5), null, 16);
  for (let k = 0; k < 150; k++) {
    const x = rng.range(-48, 48), y = rng.range(6, 26), s = rng() < 0.2 ? 0.34 : 0.22;
    far.wv = -(0.02 + rng()); far.bx(x, y, SKY_Z + 0.03, x + s, y + s, SKY_Z + 0.04, [PAL.bone, PAL.mist, PAL.lemon, PAL.ice][(rng() * 4) | 0], null, 16);
  }
  far.wv = 0;
  { const mx = 25, my = 16.5, mr = 2.3, g = 0.2;
    for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
      const d = Math.hypot(i, j) * g; if (d > mr) continue;
      const crater = Math.hypot(i + 4, j - 3) < 2.6 || Math.hypot(i - 3, j + 4) < 2 || Math.hypot(i - 5, j - 5) < 1.3;
      far.bx(mx + i * g, my + j * g, SKY_Z + 0.05, mx + (i + 1) * g, my + (j + 1) * g, SKY_Z + 0.06, crater ? PAL.mist : d > mr - 0.3 ? PAL.lemon : PAL.bone, null, 16);
    }
    LIGHTS.push([mx, my - 1, SKY_Z, PAL.mist, 1.6]);
  }
  // ---- skyline: a back row (taller, darker) and a front row with lit windows, roof gear, two neon signs ----
  const WIN = [PAL.lemon, PAL.lemon, PAL.amber, PAL.amber, PAL.yellow, PAL.ice];
  const building = (x0, x1, h, z, body, lit, back) => {
    const y0 = SHORE_Y - 0.2;
    far.shade = SH; far.bx(x0, y0, z - 2.5, x1, y0 + h, z, body, null, 1 | 2 | 4 | 16); far.shade = null;
    const top = rng();
    if (top < 0.22) far.bx(x0 + 0.3, y0 + h, z - 1.8, x1 - 0.3, y0 + h + 0.6, z - 0.3, mixc(body, PAL.void, 0.25), null, 4 | 16);          // stepped top
    else if (top < 0.38) { const ax = (x0 + x1) / 2; far.bx(ax - 0.06, y0 + h, z - 1, ax + 0.06, y0 + h + 2.2, z - 0.9, PAL.slate, null, 16);   // antenna + red lamp
      far.wv = -(0.1 + rng()); far.bx(ax - 0.14, y0 + h + 2.2, z - 0.95, ax + 0.14, y0 + h + 2.45, z - 0.85, PAL.red, null, 16); far.wv = 0; }
    else if (top < 0.5) { const ax = x0 + 0.8; far.bx(ax - 0.5, y0 + h + 0.5, z - 1.4, ax + 0.5, y0 + h + 1.4, z - 0.5, PAL.walnut, null, 16 | 4);   // roof water tank
      far.bx(ax - 0.45, y0 + h, z - 1.3, ax + 0.45, y0 + h + 0.5, z - 0.6, PAL.navy, null, 16); }
    for (let wy = y0 + 0.6; wy < y0 + h - 0.6; wy += back ? 1.1 : 0.95) for (let wx = x0 + 0.35; wx < x1 - 0.5; wx += back ? 0.9 : 0.75) {
      if (rng() > lit) continue;
      const c = back ? (rng() < 0.6 ? PAL.amber : PAL.rust) : WIN[(rng() * WIN.length) | 0];
      far.bx(wx, wy, z + 0.01, wx + 0.32, wy + 0.45, z + 0.02, c, null, 16);
      if (!back && wy < y0 + 7 && rng() < 0.35) LIGHTS.push([wx + 0.16, wy + 0.2, z, c, 0.45]);
    }
  };
  for (let x = -50; x < 50;) { const w = rng.range(3, 6.5), h = rng.range(4.5, 10.5); building(x, x + w, h, -43 - rng() * 3, rng() < 0.5 ? PAL.midnight : PAL.navy, 0.18, true); x += w + rng.range(-0.5, 0.8); }
  for (let x = -48; x < 48;) {
    const w = rng.range(2.4, 5.6), mid = 1 - Math.min(1, Math.abs(x) / 40), h = rng.range(2.2, 5.2) + mid * rng.range(0, 3.2);
    building(x, x + w, h, -34.5 - rng() * 2.5, [PAL.navy, PAL.navy, PAL.indigo, PAL.slate][(rng() * 4) | 0], 0.42, false);
    x += w + rng.range(0.1, 0.9);
  }
  const neon = (text, x, y, z, col, s) => { const t = R.small(text); for (const [px, py] of t.px) far.bx(x + px * s, y - (py + 1) * s, z + 0.03, x + (px + 1) * s, y - py * s, z + 0.05, col, null, 16); LIGHTS.push([x + t.w * s / 2, y - 0.4, z, col, t.w * s * 0.6]); };
  neon('HOTEL', -17.5, 5.6, -34.4, PAL.pink, 0.2);
  neon('EAT', 11.2, 3.4, -34.4, PAL.cyan, 0.24);
  // ---- far quay: a stone wall, a promenade rail and lamps ----
  far.shade = SH; far.bx(-50, WATER_Y - 0.3, SHORE_Z - 2, 50, SHORE_Y, SHORE_Z, PAL.slate, null, 4 | 16); far.shade = null;
  far.bx(-50, SHORE_Y + 0.3, SHORE_Z + 0.02, 50, SHORE_Y + 0.36, SHORE_Z + 0.05, PAL.steel, null, 16);
  for (let x = -46; x <= 46; x += 3.6) {
    far.bx(x - 0.05, SHORE_Y, SHORE_Z, x + 0.05, SHORE_Y + 1.3, SHORE_Z + 0.04, PAL.steel, null, 16);
    far.bx(x - 0.16, SHORE_Y + 1.3, SHORE_Z, x + 0.16, SHORE_Y + 1.55, SHORE_Z + 0.06, PAL.lemon, null, 16);
    LIGHTS.push([x, SHORE_Y + 1.4, SHORE_Z, PAL.lemon, 0.4]);
  }
  // ---- the barges: red hull with a bone stripe, a cabin, a rack of three mortar tubes, lamps ----
  for (const [bx, bz] of BARGES) {
    const y0 = WATER_Y - 0.12, y1 = WATER_Y + 0.4;
    far.shade = SH;
    far.bx(bx - 1.6, y0, bz - 0.7, bx + 1.6, y1, bz + 0.7, PAL.crimson, null, 63 ^ 8);
    far.bx(bx - 1.75, y1 - 0.06, bz - 0.78, bx + 1.75, y1 + 0.02, bz + 0.78, PAL.bone, null, 63 ^ 8);
    far.bx(bx - 1.6, y0 + 0.16, bz + 0.7, bx + 1.6, y0 + 0.26, bz + 0.72, PAL.bone, null, 16);
    far.bx(bx + 0.95, y1, bz - 0.5, bx + 1.5, y1 + 0.5, bz + 0.2, PAL.slate, null, 63 ^ 8);
    far.bx(bx - 1.0, y1, bz - 0.4, bx + 0.9, y1 + 0.12, bz + 0.4, PAL.walnut, null, 63 ^ 8);
    for (const dx of TUBE_DX) far.bx(bx + dx - 0.12, y1 + 0.12, bz - 0.12, bx + dx + 0.12, LAUNCH_Y - 0.05, bz + 0.12, PAL.steel, null, 63 ^ 8);
    far.shade = null;
    for (const dx of TUBE_DX) far.bx(bx + dx - 0.08, LAUNCH_Y - 0.06, bz - 0.08, bx + dx + 0.08, LAUNCH_Y - 0.04, bz + 0.08, PAL.void, null, 4);
    far.bx(bx + 1.1, y1 + 0.2, bz + 0.21, bx + 1.35, y1 + 0.38, bz + 0.22, PAL.lemon, null, 16);
    far.bx(bx - 1.6, y1 + 0.02, bz + 0.6, bx - 1.45, y1 + 0.16, bz + 0.72, PAL.red, null, 16 | 4);
    far.bx(bx + 1.45, y1 + 0.02, bz + 0.6, bx + 1.6, y1 + 0.16, bz + 0.72, PAL.lime, null, 16 | 4);
    LIGHTS.push([bx + 1.22, y1 + 0.3, bz, PAL.lemon, 0.3], [bx - 1.52, y1 + 0.1, bz, PAL.red, 0.2], [bx + 1.52, y1 + 0.1, bz, PAL.lime, 0.2]);
  }
}
// the river: a gradient plane (dark near us, catching the horizon glow far off), drifting ripple dashes and the
// broken, wobbling reflection streaks of every light in LIGHTS (built after the far set)
function buildRiver(w) {
  const rng = B.Stage.mulberry32(0x71fe), Y = WATER_Y + 0.001;
  for (let z = -3; z > SHORE_Z - 1; z -= 1) { const k = clamp((-z - 4) / 26, 0, 1); w.bx(-50, WATER_Y - 0.1, z - 1, 50, WATER_Y, z, mixc(mixc(PAL.midnight, PAL.deepblue, 0.55), mixc(PAL.indigo, PAL.plum, 0.25), k * k), null, 4); }
  w.wv = 0.22;
  for (let k = 0; k < 160; k++) { const z = rng.range(SHORE_Z, -5), x = rng.range(-30, 30), l = rng.range(0.6, 2.2) * (1 + (-z) / 20);
    w.bx(x, Y + 0.02, z, x + l, Y + 0.025, z + 0.06 + (-z) * 0.002, rng() < 0.5 ? PAL.navy : mixc(PAL.slate, PAL.navy, 0.4), null, 4); }
  for (const [x, y, z, col, wd] of LIGHTS) {
    const a = onWater(x, y, z), b = onWater(x, y + (wd > 1 ? 5 : 2.4), z); if (!a || !b) continue;
    if (wd < 1 && rng() < 0.45) continue;
    const n = wd > 1 ? 9 : 4, dz = (b[1] - a[1]) / n, dim = mixc(col, PAL.deepblue, 0.5);
    w.wv = wd > 1 ? 0.3 : 0.18;
    for (let k = 0; k < n; k++) {
      if (rng() < 0.25) continue;
      const z0 = a[1] + dz * k, z1 = z0 + dz * 0.6, ww = wd * (1 + k * 0.08) * rng.range(0.7, 1.3), xc = a[0] + (b[0] - a[0]) * k / n;
      w.bx(xc - ww / 2, Y + 0.04, Math.min(z0, z1), xc + ww / 2, Y + 0.045, Math.max(z0, z1), k ? dim : col, null, 4);
    }
  }
  w.wv = 0;
}
// ---------- the balloon (distraction): a striped hot-air balloon drifting along the skyline. Env decoration,
// moved by wall-clock time: never shootable, never counted, not part of the timeline ----------
function buildBalloon() {
  const v = new Vox(), g = 0.13, L = [-0.5, 0.62, 0.6], list = [];
  const ll = Math.hypot(...L), lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const rad = y => y >= 0 ? 1.12 * Math.sqrt(Math.max(0, 1 - (y / 1.45) ** 2)) : Math.max(0.28, 1.12 * (1 + y / 1.75));
  for (let i = -9; i <= 9; i++) for (let j = -12; j <= 11; j++) for (let k = -9; k <= 9; k++) {
    const x = i * g, y = j * g, z = k * g, r = Math.hypot(x, z);
    if (r > rad(y) || y < -1.2) continue;
    const nl = Math.hypot(x, y * 0.8, z) || 1, d = (x * lx + y * 0.8 * ly + z * lz) / nl;
    const st = Math.floor((Math.atan2(x, z) + Math.PI) / (Math.PI * 2) * 10) & 1;
    let c = st ? PAL.red : PAL.yellow; if (j > 9) c = PAL.crimson;
    if (d < -0.15) c = st ? PAL.crimson : PAL.amber; else if (d > 0.65) c = st ? PAL.coral : PAL.lemon;
    list.push([i, j, k, c]);
  }
  v.vox(list, g);
  v.bx(-0.32, -2.3, -0.32, 0.32, -1.9, 0.32, PAL.chestnut); v.bx(-0.34, -1.95, -0.34, 0.34, -1.9, 0.34, PAL.tan);
  for (const s of [-1, 1]) v.bx(s * 0.3 - 0.02, -1.9, -0.02, s * 0.3 + 0.02, -1.25, 0.02, PAL.walnut);
  const m = v.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.onBeforeRender = () => {
    const tt = performance.now() / 1000, X = ((tt * 0.85) % 110) - 50;
    m.position.set(X, 5.2 + 0.5 * Math.sin(tt * 0.37), -29); m.rotation.z = 0.06 * Math.sin(tt * 0.6); m.updateMatrixWorld();
  };
  m.frustumCulled = false;
  return m;
}
function buildEnv() {
  const group = new THREE.Group();
  const room = new Vox(), glow = new Vox(), far = new FarVox(), river = new FarVox();
  room.bake = nearBake;
  buildNear(room, glow);
  LIGHTS.length = 0; buildFar(far); buildRiver(river);
  const roomMesh = room.mesh(MAT.env); roomMesh.userData.env = true;
  const farMesh = new THREE.Mesh(far.geo(), farMat(false)), riverMesh = new THREE.Mesh(river.geo(), farMat(true));
  farMesh.frustumCulled = riverMesh.frustumCulled = false;
  group.add(farMesh, riverMesh, roomMesh, glow.mesh(MAT.glow), buildBalloon(), fxInit());
  group.userData.shootables = [roomMesh];
  return group;
}

// =========================================================================================
// Rockets. Unlit voxel heads (one draw call per rocket: head + stick merged); the tail is FX particles.
// =========================================================================================
let GEO = null;
const BOMB_FACE = ['.SSSSS.', 'SMMMMMS', 'MRRMRRM', 'MRRMRRM', 'MMMXMMM', '.MMMMM.', '.MXMXM.'];
function geos() {
  if (GEO) return GEO;
  const stick = (v, col) => { v.bx(-0.035, -0.72, -0.035, 0.035, -0.12, 0.035, col); v.bx(-0.05, -0.3, -0.05, 0.05, -0.24, 0.05, PAL.walnut); };
  GEO = { head: TYPES.map(Ty => {
    const v = new Vox();
    v.bx(-0.11, -0.11, -0.11, 0.11, 0.11, 0.11, PAL.lemon);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) v.box(x * 0.18, y * 0.18, 0, 0.13, 0.13, 0.13, Ty.head[0]);
    for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) v.box(x * 0.14, y * 0.14, 0, 0.08, 0.08, 0.08, Ty.head[1]);
    v.box(0, 0, 0.12, 0.12, 0.12, 0.06, PAL.bone);
    stick(v, PAL.tan); return v.geo();
  }) };
  { const v = new Vox(), g = 0.075, K = { S: PAL.slate, M: PAL.midnight, R: PAL.red, X: PAL.void };
    BOMB_FACE.forEach((row, j) => { for (let i = 0; i < 7; i++) { const c = K[row[i]]; if (!c) continue;
      v.box((i - 3) * g, (3 - j) * g, g, g, g, g, c); v.box((i - 3) * g, (3 - j) * g, 0, g, g, g, c === PAL.red ? PAL.oxblood : PAL.void); v.box((i - 3) * g, (3 - j) * g, -g, g, g, g, PAL.void); } });
    v.box(0, 4 * g, 0, g, g * 0.8, g, PAL.orange);
    stick(v, PAL.umber); GEO.bomb = v.geo(); }
  { const v = new Vox(); v.bx(-0.08, -0.08, -0.08, 0.08, 0.08, 0.08, PAL.umber); v.box(0, 0, 0.06, 0.06, 0.06, 0.06, PAL.rust); stick(v, PAL.walnut); GEO.dead = v.geo(); }
  GEO.proxy = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  GEO.proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  return GEO;
}
// ---------- the pose: a pure function of (spawn, local time) ----------
//  climb   ballistic: height fraction f = 1 - (1 - p)^2 (fast off the barge, slowing near the top), drifting sideways
//  hang    a short hover at the apex (still shootable; the last 0.3 s before the fizzle score +50)
//  fall    fizzled: the head goes dark and drops (not shootable)
function rocketPose(sp, lt, o) {
  o = o || {};
  o.visible = lt >= 0; o.shootable = false; o.done = false; o.f = 0; o.phase = 'wait'; o.vx = 0; o.vy = 1;
  o.x = sp.lx; o.y = sp.ly; o.z = sp.lz;
  if (lt < 0) return o;
  const Tc = sp.climb, vx = sp.dx / Tc;
  if (lt < Tc) {
    const p = lt / Tc, f = 1 - (1 - p) * (1 - p);
    o.phase = 'climb'; o.f = f; o.x = sp.lx + sp.dx * p; o.y = sp.ly + sp.h * f; o.z = sp.lz + sp.dz * p;
    o.vx = vx; o.vy = 2 * sp.h * (1 - p) / Tc + 0.6; o.shootable = lt >= sp.readyAt;
    return o;
  }
  const ax = sp.lx + sp.dx, ay = sp.ly + sp.h, az = sp.lz + sp.dz, q = lt - Tc;
  if (q < sp.hang) { o.phase = 'hang'; o.f = 1; o.x = ax + vx * 0.4 * q; o.y = ay - 0.5 * q * q; o.z = az; o.vx = vx * 0.4; o.vy = 0.6 - q; o.shootable = true; return o; }
  const r = q - sp.hang;
  if (r < FALL) {
    o.phase = 'fall'; o.f = 1; o.x = ax + vx * 0.4 * sp.hang + vx * 0.3 * r; o.y = ay - 0.5 * sp.hang * sp.hang - sp.hang * r - 3.5 * r * r; o.z = az;
    o.vx = vx * 0.3; o.vy = -sp.hang - 7 * r; return o;
  }
  o.phase = 'gone'; o.visible = false; o.done = true; return o;
}
// scoring by height at the moment of the hit: f < 0.4 low 100, < 0.75 mid 200, else apex 300
const PTS = { low: 100, mid: 200, apex: 300, late: 50, link: 50 };
const _pp = {};
function heightPts(sp, lt) { const f = rocketPose(sp, lt, _pp).f; return f < 0.4 ? PTS.low : f < 0.75 ? PTS.mid : PTS.apex; }
// head hit test: a screen-space circle around the head (HIT_PX game px, more on touch, a tight one for bombs). The
// reported distance is the pixel distance from the ray, so the head nearest the crosshair wins an overlap.
const _hp = new THREE.Vector3(), _cp = new THREE.Vector3();
function headRaycast(rc, out) {
  this.getWorldPosition(_hp);
  const tg = this.userData.target, d = _hp.distanceTo(rc.ray.origin), perPx = 2 * d * TAN_H / RH;
  const px = tg && tg.kind === 'bomb' ? HIT_PX.bomb : (B.Input && B.Input.touch ? HIT_PX.touch : HIT_PX.mouse);
  rc.ray.closestPointToPoint(_hp, _cp);
  const dd = _cp.distanceTo(_hp);
  if (dd > px * perPx) return;
  out.push({ distance: dd / perPx + d * 1e-4, point: _hp.clone(), object: this });
}

// =========================================================================================
// Chains (deterministic). points() is the engine's only call into the stage on an awarded hit
// (Run.applyHit: points -> taken.set -> shatter, on the host AND on every client as it applies the hit);
// it records the hit's stage time T and its chain link in HIT_AT. The rocket that burst then, in its own
// update once run.t >= T + (link + 1) * CHAIN_DT, finds every other REAL rocket head that was live and
// not yet taken at time T within CHAIN_R of its own head at time T (all positions from rocketPose: pure),
// and calls run.applyHit(by, id, T, null, 'chain' + (link + 1)) for each: same hit time, so each scores its
// own height at T + 50 per link, counts as a firework, and chains on in turn. Inputs: the shared timeline,
// T (the adjudicated hit time, identical on both versus tabs) and the taken set, so host and guest chain the
// same rockets. Chain hits are not sent over the network; both sides derive them. Bombs never chain.
// =========================================================================================
const HIT_AT = new WeakMap();
function points(sp, lt, zone) {
  if (sp.kind !== 'rocket' || sp.bomb) return 0;
  const m = /^chain(\d{1,2})$/.exec(zone || ''), link = m ? +m[1] : 0;
  HIT_AT.set(sp, { T: sp.t0 + lt, link });
  const late = lt >= sp.tf - 0.3 && lt < sp.tf + 0.05 ? PTS.late : 0;
  return heightPts(sp, lt) + late + PTS.link * link;
}
// the rockets a burst at time T sets off (pure: timeline + T + taken)
function chainTargets(sp, T, timeline, taken) {
  const A = rocketPose(sp, T - sp.t0, {}), out = [];
  for (const s of timeline) {
    if (s === sp || s.kind !== 'rocket' || s.bomb || taken.has(s.id)) continue;
    const lt = T - s.t0; if (lt < s.readyAt || lt >= s.tf) continue;
    const P = rocketPose(s, lt, _pp), dx = P.x - A.x, dy = P.y - A.y, dz = P.z - A.z;
    if (dx * dx + dy * dy + dz * dz < CHAIN_R * CHAIN_R) out.push(s);
  }
  return out;
}

const uOf = (x, y, z) => R.toPx(_hp.set(x, y, z))[0] / R.RW;
class Rocket extends T.Target {
  constructor(sp, run) {
    super(sp.bomb ? 'bomb' : 'target');
    const G = geos(); this.sp = sp; this.run = run; this.P = {}; this.lastLt = 0; this.phase = 'wait'; this.puffK = -1;
    this.body = new THREE.Mesh(sp.bomb ? G.bomb : G.head[sp.type], MAT.glow); this.body.userData.sharedGeo = true; this.body.scale.setScalar(HEAD_SC); this.group.add(this.body);
    this.hit = new THREE.Mesh(G.proxy, G.proxyMat); this.hit.userData.sharedGeo = true; this.hit.raycast = headRaycast;
    this.hit.userData.target = this; this.hit.userData.zone = 'head'; this.group.add(this.hit);
    this.launched = false; this.chained = false; this.group.visible = false;
  }
  meshes() { return [this.hit]; }
  update(lt, run) {
    const sp = this.sp, P = rocketPose(sp, lt, this.P), dt = clamp(lt - this.lastLt, 0, 0.1); this.lastLt = lt;
    if (!this.alive) return this.afterBurst(lt, run || this.run);
    if (P.done) { this.group.visible = false; return true; }
    this.group.visible = P.visible;
    if (!P.visible) return false;
    this.group.position.set(P.x, P.y, P.z);
    this.body.rotation.z = -Math.atan2(P.vx, P.vy);
    if (!this.launched) { this.launched = true; launchFX(sp.lx, sp.ly, sp.lz); B.SFX.play('rocketLaunch', { u: uOf(sp.lx, sp.ly, sp.lz), bomb: !!sp.bomb }); }
    if (P.phase !== this.phase) {
      this.phase = P.phase;
      if (P.phase === 'fall') { this.body.geometry = geos().dead; fizzleFX(P.x, P.y, P.z); B.SFX.play('rocketFizzle', { u: uOf(P.x, P.y, P.z) }); }
    }
    if (P.phase === 'climb' || P.phase === 'hang') {
      trailFX(sp, P.x, P.y, P.z, dt);
      if (!sp.bomb) this.body.scale.setScalar(HEAD_SC * (1 + 0.2 * (((lt * 22) | 0) & 1)));
      else { const k = Math.floor(lt / 0.24); if (k !== this.puffK) { this.puffK = k; skullPuff(P.x, P.y - 0.45, P.z, 1, R.rnd(-0.12, 0.12), 0.15); } }
    } else if (P.phase === 'fall' && Math.random() < dt * 8) spark(P.x, P.y, P.z, 0, 0.2, 0, 0.16, PAL.navy, 0.5, -0.05, 1, 0.6);
    this.shootable = P.shootable;
    return false;
  }
  // after a burst: wait for this rocket's chain step (see "Chains"), then finish
  afterBurst(lt, run) {
    const h = HIT_AT.get(this.sp), by = run.taken.get(this.sp.id);
    if (h && by != null && by >= 0 && !this.chained) {
      if (run.t < h.T + (h.link + 1) * CHAIN_DT) return false;
      this.chained = true;
      const A = rocketPose(this.sp, h.T - this.sp.t0, {});
      for (const s of chainTargets(this.sp, h.T, run.timeline, run.taken)) {
        const tg = run.byId(s.id), Q = rocketPose(s, run.t - s.t0, {});
        if (tg && tg.alive) chainFX(A, Q);
        if (run.applyHit(by, s.id, h.T, null, 'chain' + (h.link + 1))) B.SFX.play('chain', { n: h.link + 1, u: uOf(Q.x, Q.y, Q.z) });
      }
      return true;
    }
    if (this.chained) return true;
    return lt > this.sp.tf + FALL + 0.6;                    // versus: an optimistic burst the host never awarded
  }
  shatter(point, opts) {
    if (!this.alive) return;
    const P = rocketPose(this.sp, this.lastLt, {});
    burstFX(this.sp.type, P.x, P.y, P.z, 0.85 + 0.4 * P.f);
    if (opts && opts.tint != null) for (let k = 0; k < 14; k++) { const d = rndDir(); spark(P.x, P.y, P.z, d[0] * 3, d[1] * 3, d[2], 0.22, opts.tint, 0.6, 0.3, 1.5); }
    B.SFX.play('rocketBurst', { u: uOf(P.x, P.y, P.z), type: TYPES[this.sp.type].id, height: P.f });
    this.alive = false; this.shootable = false; this.group.visible = false;
  }
  explode() {
    const P = rocketPose(this.sp, this.lastLt, {});
    blastFX(P.x, P.y, P.z);
    this.alive = false; this.shootable = false; this.group.visible = false;
  }
}
// the show director (not shootable): once the quota is met (versus: always), when the last real rocket is
// fizzling (or the stage ends early), launch the finale; hold the stage open until it is done. Quota missed:
// it bows out with the last rocket so the stage ends.
class Show extends T.Target {
  constructor(sp) { super('decor'); this.sp = sp; this.fin = null; this.shootable = false; fxClear(); }
  meshes() { return []; }
  update(lt, run) {
    const t = this.sp.t0 + lt, met = run.versus || run.quotaMet;
    if (this.fin == null) {
      if (met && (t >= this.sp.last - 0.5 || run.state === 'end')) { this.fin = t; finale(); }
      else return !met && t >= this.sp.last;
      return false;
    }
    return t >= this.fin + FIN_HOLD;
  }
}

// =========================================================================================
// Rules per tier and variant.
//   climb = seconds from the barge to the apex; fast + mix = top tiers: about half the rockets (seeded per
//   rocket) streak up in `fast` s instead; hang = apex hover before the fizzle; live = most shootable heads
//   up at once; salvo / s3 = chance a launch is a pair / a triple from one barge (chain bait); gap = s between
//   launches; bomb / bombCap = bomb roll + hard bomb share (range rules); share = quota share of the real
//   rockets; slack = spare shots on a hard cap; rel = magazine reload s.
// Variants: 0 hard shot cap; 1 a 6-round magazine (shoot the frame to reload); 2 hard cap, faster rockets, +1 live.
// =========================================================================================
const TIER_P = [
  { time: 42, climb: 2.7,  fast: 0,    mix: 0,   hang: 0.5,  live: 4, salvo: 0.2,  s3: 0,    gap: [1.0, 1.6],   bomb: 0,    bombCap: 0,    rel: 0.75, slack: 10, share: 0.55 },
  { time: 38, climb: 2.05, fast: 0,    mix: 0,   hang: 0.38, live: 4, salvo: 0.24, s3: 0.06, gap: [0.72, 1.2],  bomb: 0,    bombCap: 0,    rel: 0.7,  slack: 8,  share: 0.58 },
  { time: 35, climb: 1.85, fast: 1.05, mix: 0.5, hang: 0.3,  live: 5, salvo: 0.26, s3: 0.1,  gap: [0.48, 0.88], bomb: 0.36, bombCap: 0.24, rel: 0.62, slack: 6,  share: 0.6  },
  { time: 32, climb: 1.65, fast: 0.9,  mix: 0.5, hang: 0.26, live: 6, salvo: 0.28, s3: 0.14, gap: [0.36, 0.72], bomb: 0.44, bombCap: 0.3,  rel: 0.55, slack: 4,  share: 0.62 }
];
const VARIANT_NAMES = ['OPENING NIGHT', 'RAPID RELOAD', 'GRAND FINALE'];
const capEst = {};
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  if (v === 2) { c.climb = +(b.climb * 0.84).toFixed(3); c.fast = +(b.fast * 0.88).toFixed(3); c.hang = +(b.hang * 0.9).toFixed(3); c.live = b.live + 1; c.gap = b.gap.map(g => +(g * 0.86).toFixed(3)); }
  c.share = Math.min(0.75, b.share + 0.02 * v);
  c.quota = 8;                                       // placeholder: timeline() derives the real quota
  c.autoReload = false;
  c.tier = tier; c.variant = v; c.title = 'SKY SHOW'; c.subtitle = VARIANT_NAMES[v];
  c.ammo = [{ cap: 0 }, { mag: 6, reloadTime: b.rel, autoReload: false }, { cap: 0 }][v];
  const key = tier + '|' + v;                        // menus: a fixed-seed estimate of the quota / cap
  if (!capEst[key]) { const est = Object.assign({ estimate: true }, c); timeline(est, B.Stage.mulberry32(0x5eed)); capEst[key] = [est.ammo, est.quota]; }
  if (c.ammo.cap === 0) c.ammo = capEst[key][0];
  c.quota = capEst[key][1];
  return c;
}
// timeline: every spawn from the seeded rng only. Mix rules copied from the range (#24): bombs <= bombCap share of
// the rockets so far, never two bombs in a row, a bomb only while at least as many real heads are up (and staying
// >= 0.6 s) as bombs. Bombs only launch alone (never in a salvo). Real launches stop FIN_SLOT s before the end.
function timeline(c, rng) {
  const out = [], tubeFree = BARGES.map(() => [0, 0, 0]), end = c.time - FIN_SLOT;
  let t = 0.6, guard = 0, bombs = 0, rockets = 0, prevBomb = false;
  const shootEnd = s => s.t0 + s.tf;
  while (guard++ < 2000) {
    const up = out.filter(s => shootEnd(s) > t);
    if (up.length >= c.live) { t = up.map(shootEnd).sort((a, b) => a - b)[up.length - c.live] + 0.05; continue; }
    const gr = rng(), want = gr < c.s3 ? 3 : gr < c.s3 + c.salvo ? 2 : 1, n = Math.min(want, c.live - up.length);
    const fast = c.mix > 0 && rng() < c.mix, climb = fast ? c.fast : c.climb;
    const bi = rng.int(0, BARGES.length - 1), [bx, bz] = BARGES[bi], type0 = rng.int(0, 3);
    const h0 = rng.range(8.6, 11.2), dx0 = rng.range(-2.0, 2.0) - bx * 0.14, ph = +(rng() * 6.283).toFixed(3);
    const tube0 = n === 3 ? 0 : rng.int(0, 3 - n), r1 = rng();
    if (t + climb + c.hang + FALL > end) break;
    if (tubeFree[bi][tube0] > t) { t += 0.1; continue; }
    const goodUp = up.filter(s => !s.bomb && shootEnd(s) > t + 0.6).length, bombsUp = up.filter(s => s.bomb).length;
    const bomb = n === 1 && rockets > 1 && r1 < c.bomb && !prevBomb && (bombs + 1) <= c.bombCap * (rockets + 1) && goodUp >= 1 && bombsUp + 1 <= goodUp;
    for (let g = 0; g < n; g++) {
      const tube = tube0 + g, tt = +(t + g * 0.08).toFixed(3);
      const sp = { id: 0, t0: tt, t1: 0, kind: 'rocket', type: bomb ? 0 : (type0 + g) % 4, bomb, fast, salvo: n > 1 ? n : 0, barge: bi, tube,
        lx: +(bx + TUBE_DX[tube]).toFixed(3), ly: LAUNCH_Y, lz: bz,
        dx: +(dx0 + (tube - 1) * 0.3 + rng.range(-0.15, 0.15)).toFixed(3), dz: +rng.range(-0.5, 0.5).toFixed(3),
        h: +(h0 + rng.range(-0.3, 0.3)).toFixed(3), climb, hang: c.hang, ph };
      sp.tf = +(climb + c.hang).toFixed(3); sp.readyAt = +(climb * 0.08).toFixed(3); sp.t1 = +(tt + sp.tf + FALL).toFixed(3);
      out.push(sp); tubeFree[bi][tube] = tt + 0.5; rockets++;
    }
    if (bomb) bombs++;
    prevBomb = bomb;
    t += rng.range(c.gap[0], c.gap[1]) * (1 + 0.5 * (n - 1));
  }
  const real = out.filter(s => !s.bomb), last = out.reduce((a, s) => Math.max(a, s.t1), 0);
  out.push({ id: 0, t0: 0, t1: +(c.time - 0.05).toFixed(3), kind: 'show', last: +last.toFixed(3) });
  out.sort((a, b) => a.t0 - b.t0); out.forEach((s, i) => { s.id = i; });
  c.goodCount = real.length; c.bombCount = out.filter(s => s.bomb).length; c.salvoCount = out.filter(s => s.salvo).length;
  c.quota = Math.max(4, Math.round(real.length * c.share));
  if (c.ammo && c.ammo.cap != null) c.ammo = { cap: c.quota + c.slack };
  return out;
}
function briefing(c) {
  const tip = c.ammo && c.ammo.mag ? 'SHOOT THE FRAME (OR R) TO RELOAD!' : c.bomb > 0 ? 'SKULL SMOKE = BOMB. HOLD FIRE!' : 'HIGHER BURST = MORE POINTS';
  return { rule: [['MAKE ', 'void'], [c.quota + ' FIREWORKS', 'red'], [' EXPLODE!', 'void']], icon: 'rocket', unit: 'FIREWORKS',
    dont: c.bomb > 0 ? 'bomb' : null, tip };
}
// ---------- briefing card icons: a firework bursting over its rocket; the skull-smoke bomb rocket ----------
const FW_ICON = ['......Y.......', '..R...Y...R...', '...R..L..R....', '.....LWL......', 'YYLLLWWWLLLYY.', '.....LWL......', '...R..L..R....',
  '..R...Y...R...', '......Y.......', '......O.......', '......S.......', '.....OSO......', '......S.......', '......S.......'];
const FW_KEY = { Y: 'yellow', R: 'pink', L: 'lemon', W: 'bone', O: 'orange', S: 'tan' };
const BOMB_ICON = ['....XXXXX.....', '...XMMMMMX....', '..XMMMMMMMX...', '..XRRMMMRRX...', '..XRRMMMRRX...', '..XMMMXMMMX...', '...XMMMMMX....', '...XMXMXMX....',
  '....XXXXX.....', '......S.......', '...VV.S.VV....', '..VVVVVVVVV...', '.VV.VVVVV.VV..', '..V..VVV..V...'];
const BOMB_KEY = { X: 'void', M: 'slate', R: 'red', S: 'umber', V: 'midnight' };
function drawIcon(cx, cy, r, t = 0) {
  const sc = Math.max(1, Math.round(2 * r / 14)), f = ((t * 6) | 0) & 1;
  B.HUD.sprite(FW_ICON, cx - 7 * sc, cy - 7 * sc, sc, f ? FW_KEY : Object.assign({}, FW_KEY, { Y: 'cyan', R: 'lime' }), 'skyFw' + f);
}
function drawDont(cx, cy, r) {
  const sc = Math.max(1, Math.round(2 * r / 14));
  B.HUD.sprite(BOMB_ICON, cx - 7 * sc, cy - 7 * sc, sc, BOMB_KEY, 'skyBomb');
}
function makeTarget(sp, run) { return sp.kind === 'show' ? new Show(sp, run) : new Rocket(sp, run); }
B.Stage.register({ id: 'skyshow', name: 'SKY SHOW', short: 'SKY', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv() { geos(); return buildEnv(); }, config, timeline, makeTarget, points, briefing, drawIcon, drawDont,
  pose: rocketPose, chainTargets, BARGES, PTS, TYPES, FX, finale });
})(window.BLAM);
