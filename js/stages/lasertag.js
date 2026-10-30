'use strict';
/* =========================================================================================
   B.L.A.M. stages/lasertag.js -- Stage 7: LASER TAG (DESIGN-STAGES.md section 8, Jon + Fable 2026-10-30).
   A 90s BLACK-LIGHT ARENA seen from behind a waist-high barrier: dark maze walls edged in neon tape, a grinning-alien
   splatter mural, biohazard barrels, crates, a catwalk with an orange tube rail, a window wall with a neon skyline roof,
   a confetti-print carpet, UV tubes, the "B.L.A.M. LASER TAG" neon sign, an LED dot-matrix SCOREBOARD and the enemy BASE.
   Every other stage punishes a WRONG shot; this one punishes a SLOW one.
   TAGGERS (red vests, helmet + red visor, a white phaser with a lit tip) pop from cover; a RED AIMING DOT slides in from
   the screen edge on their side to YOUR crosshair (drawn on the HUD: def.drawHud, in front of everything, readable in
   the fog; it grows and brightens as it closes); when it arrives they FIRE: a red beam at you, a red flash, the hearts
   buzz dark for a beat, LIFE -1. Tag them first: a lit vest SENSOR 300, anywhere else on them 100, +50 QUICK DRAW in the
   first 30 % of the dot's slide. TEAMMATES (green vests, no helmet, an empty waving hand) and the rare REFEREE are
   bystanders: FRIENDLY FIRE = LIFE -1. Fakes pop and duck back (no dot, or a dot that cancels): free.
   Patterns: a ROW of windows / catwalk spots on a beat (shot-driven like the range's #88), a VAULT line over the barrels,
   HIGH GROUND on the catwalk, the FLANKER from the screen edge, a DROP off the catwalk, a WALL of 4-5 with greens in it,
   PING-PONG between the two sides of a wall then a green takes the slot. FOG BURSTS (bodies go to silhouettes, vests and
   dots still glow, tracers light the haze; BLACKOUT = fog most of the round), the BASE (opens with a siren, +500) and the
   finale (the scoreboard scrolls B.L.A.M., every vest blinks the letters back, the neon sign flares).
   THE FIRE is a pure function of the timeline (+ the shared hit times of a shot-driven chain): a tagger whose dot lands
   unshot charges every player still standing through the engine's own penalty (run.penaltyNow 'bomb'), stage-side, after
   checking run.taken, as INVASION's landings do (versus: the dot sits locked on for VS_GRACE s, then both tabs charge
   alike). The scene is dark the whole run: B.FX.setDark('lasertag') (#92 muzzle glow). No shot cap on any variant.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, E = R.E, Vox = R.Vox, T = B.Targets;
const clamp = E.clamp, RW = R.RW, RH = R.RH, TAN_H = R.TAN_H, TAU = Math.PI * 2;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
const DIAG = Math.sqrt(RW * RW + RH * RH);
const ID = 'lasertag';
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hash2 = (x, y) => hash1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));
const inPlay = () => !!(B.G && B.G.screenName === 'play');
const isMine = () => { const g = B.G; return !!(g && g.run && g.run.stage === ID); };
const slowK = () => { const G = B.G; return G && G.screenName === 'play' && G.slow < 1 && !(G.run && G.run.versus) ? G.slow : 1; };
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const sstep = x => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const glc = h => `vec3(${(((h >> 16) & 255) / 255).toFixed(4)},${(((h >> 8) & 255) / 255).toFixed(4)},${((h & 255) / 255).toFixed(4)})`;
const F3 = x => +x.toFixed(3);
const NOHIT_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), NOHIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _cp = new THREE.Vector3();
function scr(x, y, z) {                                       // world -> [px, py, game px per world unit] (steady camera; pure)
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (RH / 2) / (Math.max(0.1, d) * TAN_H);
  return [RW / 2 + vx * k, RH / 2 - yc * k, k];
}
const uOfX = x => clamp(x / RW, 0, 1);

// =========================================================================================
// SHADERS. Everything here is unlit (the black light IS the art): the env (vertex colours, env dither class), the neon
// (object class, letter flicker, UV tube shimmer, the base's chasing ring), the confetti carpet (procedural), the figures
// (per-figure vest / tip / dim / flash uniforms; bodies go to silhouettes in the haze, vests keep glowing). Shared: uHaze
// (the fog burst: a rolling violet haze that thickens with depth), uGunP / uGunC (#92: the muzzle glow lights what is
// near the gun for a frame), uTime.
// =========================================================================================
const U = { uTime: { value: 0 }, uHaze: { value: 0 }, uGunP: { value: new THREE.Vector3(0, -50, 0) }, uGunC: { value: new THREE.Vector4(0, 0, 0, 0) },
  uSign: { value: 0 }, uBase: { value: 0 } };
const NOISE = `float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0,0.0,0.0)), f.x), mix(h3(i + vec3(0.0,1.0,0.0)), h3(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0,0.0,1.0)), h3(i + vec3(1.0,0.0,1.0)), f.x), mix(h3(i + vec3(0.0,1.0,1.0)), h3(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z); }`;
const FUNCS = `uniform float uTime; uniform float uHaze; uniform vec3 uGunP; uniform vec4 uGunC;
${NOISE}
vec3 haze(vec3 c, vec3 w, float d, float s){
  if (uHaze <= 0.001) return c;
  float n = vn(w * 0.42 + vec3(uTime * 0.23, -uTime * 0.05, uTime * 0.11)) * 0.65 + vn(w * 1.15 - vec3(uTime * 0.31, 0.0, -uTime * 0.07)) * 0.35;
  float k = uHaze * s * (0.3 + 0.58 * smoothstep(2.5, 17.0, d)) * (0.45 + 0.85 * n);
  vec3 hc = mix(${glc(PAL.indigo)}, ${glc(PAL.slate)}, clamp(w.y / 4.5 + 0.35 * n - 0.15, 0.0, 1.0));
  return mix(c, hc, clamp(k, 0.0, 0.88)); }
vec3 gunlit(vec3 c, vec3 w){
  if (uGunC.w <= 0.002) return c;
  float g = max(0.0, 1.0 - distance(w, uGunP) / 4.2);
  return c + uGunC.rgb * uGunC.w * g * g * (0.3 + 1.4 * c); }`;
const W_VS = `varying vec3 vC; varying vec3 vW; varying float vD;
void main(){ vC = color; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const MAT_ENV = new THREE.ShaderMaterial({ uniforms: U, vertexShader: W_VS, vertexColors: true,
  fragmentShader: `varying vec3 vC; varying vec3 vW; varying float vD; ${FUNCS}
void main(){ gl_FragColor = vec4(haze(gunlit(vC, vW), vW, vD, 1.0), 0.5); }` });
// neon: aF = flicker group (1-59 sign letters, 100+ UV tubes, 200+ base ring lamps); aF < 0 = the soft halo (env dither class)
const MAT_GLOW = new THREE.ShaderMaterial({ uniforms: U, vertexColors: true,
  vertexShader: `attribute float aF; uniform float uTime; uniform float uSign; uniform float uBase; varying vec3 vC; varying float vA; varying vec3 vW; varying float vD;
void main(){
  vC = color; vA = aF < 0.0 ? 0.5 : 1.0; float g = abs(aF);
  if (g >= 1.0 && g < 60.0) {
    float s = floor(uTime * 13.0), r = fract(sin(g * 91.7 + s * 12.9898) * 43758.5);
    if (r < 0.014) vC *= 0.22;
    vC = mix(vC, vec3(1.0, 0.97, 0.88), uSign * (0.45 + 0.3 * sin(uTime * 31.0 + g * 2.1)));
  } else if (g >= 100.0 && g < 140.0) {
    vC *= 0.88 + 0.12 * sin(uTime * 5.3 + g * 1.7);
  } else if (g >= 200.0 && g < 260.0) {
    float on = step(0.5, fract((g - 200.0) / 4.0 - uTime * 2.6));
    vC *= mix(0.3, mix(0.45, 1.2, on), uBase);
  }
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vC; varying float vA; varying vec3 vW; varying float vD; ${FUNCS}
void main(){ gl_FragColor = vec4(haze(vC, vW, vD, 0.3), vA); }` });
// the confetti-print carpet: squiggles and flecks from world xz (crisp object-class squiggles on a dithered dark base)
const MAT_FLOOR = new THREE.ShaderMaterial({ uniforms: U, vertexShader: W_VS, vertexColors: true,
  fragmentShader: `varying vec3 vC; varying vec3 vW; varying float vD; ${FUNCS}
float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 p = vW.xz * 1.1, cl = floor(p), f = fract(p) - 0.5;
  float r = hs(cl), r2 = hs(cl + 7.31), a = r * 6.2832;
  vec2 q = vec2(cos(a) * f.x + sin(a) * f.y, -sin(a) * f.x + cos(a) * f.y);
  float wv = q.y - 0.1 * sin(q.x * 14.0 + r2 * 6.0);
  float sq = step(abs(wv), 0.055) * step(abs(q.x), 0.34) * step(0.45, r2);
  float fl = step(0.972, hs(floor(vW.xz * 8.0)));
  float far = smoothstep(8.0, 18.0, vD), near = 1.0 - smoothstep(4.0, 9.0, vD);
  vec3 col = mix(${glc(PAL.void)}, ${glc(PAL.midnight)}, 0.55 + 0.35 * hs(floor(vW.xz * 3.0)) - 0.3 * far);
  float al = 0.5;
  float ci = floor(fract(r * 7.13) * 5.0);
  vec3 cc = ci < 1.0 ? ${glc(PAL.pink)} : ci < 2.0 ? ${glc(PAL.lime)} : ci < 3.0 ? ${glc(PAL.cyan)} : ci < 4.0 ? ${glc(PAL.magenta)} : ${glc(PAL.yellow)};
  if (sq > 0.5) { col = cc * (1.0 - 0.5 * far) * (0.8 + 0.2 * near); al = far > 0.55 ? 0.5 : 1.0; }
  else if (fl > 0.5) { col = (fract(r2 * 13.0) < 0.5 ? ${glc(PAL.cyan)} : ${glc(PAL.pink)}) * 0.7; }
  gl_FragColor = vec4(haze(gunlit(col, vW), vW, vD, 1.0), al); }` });
// figures: aK = class (0 body, 1 vest trim, 2 sensor, 3 phaser tip, 4 UV-bright bits, 5 torch beam)
const FIG_VS = `attribute float aK; varying vec3 vC; varying float vK; varying vec3 vW; varying float vD;
void main(){ vC = color; vK = aK; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const FIG_FS = `uniform float uVest; uniform float uTip; uniform float uDim; uniform float uFlash; varying vec3 vC; varying float vK; varying vec3 vW; varying float vD; ${FUNCS}
void main(){
  vec3 c = vC; float a = 1.0;
  if (vK < 0.5) { c = mix(gunlit(c * uDim, vW), ${glc(PAL.void)}, uHaze * 0.86); }
  else if (vK < 2.5) { c = mix(c * 0.09, c, uVest); }
  else if (vK < 3.5) { c *= uTip; }
  else if (vK < 4.5) { c = mix(gunlit(c * uDim, vW), ${glc(PAL.midnight)}, uHaze * 0.72); }
  else { c = mix(c, ${glc(PAL.slate)}, uHaze * 0.35); a = 0.5; }
  gl_FragColor = vec4(mix(c, vec3(1.0), uFlash), a); }`;
const FIG_POOL = [];
function figMat() {
  const m = FIG_POOL.pop() || new THREE.ShaderMaterial({ vertexShader: FIG_VS, fragmentShader: FIG_FS, vertexColors: true,
    uniforms: { uTime: U.uTime, uHaze: U.uHaze, uGunP: U.uGunP, uGunC: U.uGunC, uVest: { value: 1 }, uTip: { value: 1 }, uDim: { value: 1 }, uFlash: { value: 0 } } });
  const u = m.uniforms; u.uVest.value = 1; u.uTip.value = 0.8; u.uDim.value = 1; u.uFlash.value = 0;
  return m;
}
function figMatBack(m) { if (m && FIG_POOL.length < 32) FIG_POOL.push(m); }   // pooled: never dispose (the program would go)

// =========================================================================================
// FX: one InstancedMesh of unlit cubes (sparks, vest chirps, fog machine blasts, the base going up). Wall clock x ?slow.
// =========================================================================================
const FXN = 1400;
const PX = { mesh: null, P: new Float32Array(FXN * 3), V: new Float32Array(FXN * 3), A: new Float32Array(FXN * 6), next: 0, last: 0 };
const _col = new THREE.Color();
function pxInit() {
  if (PX.mesh) return PX.mesh;
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), FXN);
  m.frustumCulled = false; m.userData.sharedGeo = true; m.raycast = () => {};
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceMatrix.array.fill(0);
  for (let i = 0; i < FXN; i++) m.setColorAt(i, _col.set(0xffffff));
  m.onBeforeRender = pxStep;
  return (PX.mesh = m);
}
// A: age, life, size, grav, drag, grow
function spark(x, y, z, vx, vy, vz, size, col, life, grav = 0, drag = 0, grow = 0) {
  const i = PX.next = (PX.next + 1) % FXN, p = i * 3, a = i * 6;
  PX.P[p] = x; PX.P[p + 1] = y; PX.P[p + 2] = z; PX.V[p] = vx; PX.V[p + 1] = vy; PX.V[p + 2] = vz;
  PX.A[a] = 0; PX.A[a + 1] = life; PX.A[a + 2] = size; PX.A[a + 3] = grav; PX.A[a + 4] = drag; PX.A[a + 5] = grow;
  if (PX.mesh) { _col.set(col); PX.mesh.instanceColor.setXYZ(i, _col.r, _col.g, _col.b); PX.mesh.instanceColor.needsUpdate = true; }
}
function pxClear() { PX.A.fill(0); if (PX.mesh) { PX.mesh.instanceMatrix.array.fill(0); PX.mesh.instanceMatrix.needsUpdate = true; } }
function pxStep() {
  const now = performance.now();
  let dt = PX.last ? Math.min(0.05, (now - PX.last) / 1000) : 0.016; PX.last = now; dt *= slowK();
  const M = PX.mesh.instanceMatrix.array;
  for (let i = 0; i < FXN; i++) {
    const a = i * 6, o = i * 16;
    if (PX.A[a + 1] <= 0) { if (M[o] !== 0) M[o] = M[o + 5] = M[o + 10] = 0; continue; }
    const age = PX.A[a] += dt, life = PX.A[a + 1], p = i * 3;
    if (age >= life) { PX.A[a + 1] = 0; M[o] = M[o + 5] = M[o + 10] = 0; continue; }
    const dr = Math.exp(-PX.A[a + 4] * dt);
    PX.V[p] *= dr; PX.V[p + 1] = PX.V[p + 1] * dr - 9.8 * PX.A[a + 3] * dt; PX.V[p + 2] *= dr;
    PX.P[p] += PX.V[p] * dt; PX.P[p + 1] += PX.V[p + 1] * dt; PX.P[p + 2] += PX.V[p + 2] * dt;
    if (PX.P[p + 1] < 0.02 && PX.A[a + 3] > 0) { PX.P[p + 1] = 0.02; PX.V[p + 1] *= -0.3; PX.V[p] *= 0.6; PX.V[p + 2] *= 0.6; }
    const left = life - age, s = PX.A[a + 2] * (1 + PX.A[a + 5] * age) * (left < 0.2 ? Math.max(0.1, left / 0.2) : 1);
    M[o] = s; M[o + 1] = 0; M[o + 2] = 0; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = s; M[o + 6] = 0; M[o + 7] = 0;
    M[o + 8] = 0; M[o + 9] = 0; M[o + 10] = s; M[o + 11] = 0; M[o + 12] = PX.P[p]; M[o + 13] = PX.P[p + 1]; M[o + 14] = PX.P[p + 2]; M[o + 15] = 1;
  }
  PX.mesh.instanceMatrix.needsUpdate = true;
}
const rnd = R.rnd;
const rndDir = () => { const u = rnd(-1, 1), a = rnd(0, TAU), s = Math.sqrt(1 - u * u); return [s * Math.cos(a), s * Math.sin(a), u]; };
function burstAt(p, cols, n, sp, size, life, grav = 0.25) {
  for (let k = 0; k < n; k++) { const d = rndDir(), v = sp * rnd(0.5, 1.2); spark(p.x, p.y, p.z, d[0] * v, d[1] * v + 0.4 * sp, Math.abs(d[2]) * v * 0.8, size * rnd(0.7, 1.2), PAL[cols[k % cols.length]], life * rnd(0.7, 1.2), grav, 1.2); }
}

// =========================================================================================
// THE ARENA (all world units; camera at (0, 1.9, 5) looking -z). Front to back: the player's barrier (z 3), the near-left
// maze wall W1 with the alien mural (z -1.6), two barrels near-right (z -2.5), the barrel row (z -5.1), the crates
// (z -6), the window wall W2 with its skyline roof (z -7.1), the centre panel W3 (z -8.45), the catwalk platform with the
// parapet, the rail and the ramp (front z -9.6, deck 2.5), the back wall (z -13: neon sign, skyline, the BASE); the
// scoreboard hangs under the ceiling at z -8.5; UV tubes on the ceiling (6.2); a fog machine in the back-left corner.
// =========================================================================================
class AVox extends Vox {                                       // + one float attribute per vertex (this.av)
  constructor(name) { super(); this.an = name; this.ad = []; this.av = 0; }
  box(x, y, z, w, h, d, col, m, mask = 63) { const n0 = this.vc; super.box(x, y, z, w, h, d, col, m, mask); for (let i = n0; i < this.vc; i++) this.ad.push(this.av); return this; }
  geo() { const g = super.geo(); g.setAttribute(this.an, new THREE.Float32BufferAttribute(this.ad, 1)); return g; }
}
const SH_ENV = [0.7, 0.7, 0.82, 0.45, 1.0, 0.6];
const bakeUV = (x, y, z) => 0.6 + 0.36 * clamp(y / 5.6, 0, 1) + 0.08 * clamp((z + 4) / 6, 0, 1);
const HALO_OF = { orange: 'rust', lime: 'forest', pink: 'plum', cyan: 'deepblue', red: 'oxblood', yellow: 'rust', lemon: 'amber', ice: 'blue', magenta: 'plum',
  green: 'forest', bone: 'slate', amber: 'rust', coral: 'crimson', blue: 'deepblue', bubblegum: 'magenta', mist: 'slate' };
// a flat front-facing quad (mask: +z face only) on the plane z
const faceZ = (v, x0, y0, x1, y1, z, col) => v.bx(x0, y0, z - 0.004, x1, y1, z, PAL[col] != null ? PAL[col] : col, null, 16);
// paint a pixel picture on the plane z (fn(i, j) -> palette name | null), runs of a colour merged into one quad
function paintZ(v, x0, y0, z, cw, ch, s, fn) {
  for (let j = 0; j < ch; j++) {
    let run = null, i0 = 0;
    for (let i = 0; i <= cw; i++) {
      const c = i < cw ? fn(i, j) : null;
      if (c !== run) { if (run) faceZ(v, x0 + i0 * s, y0 + j * s, x0 + i * s, y0 + (j + 1) * s, z, run); run = c; i0 = i; }
    }
  }
}
// neon tube (axis-aligned box) with a soft halo behind it (env dither class), on the glow mesh
function neon(g, x0, y0, z0, x1, y1, z1, col, f = 0, halo = 0.06) {
  g.av = f; g.bx(x0, y0, z0, x1, y1, z1, PAL[col]);
  if (halo > 0) { g.av = f ? -Math.abs(f) : -0.5; g.bx(x0 - halo, y0 - halo, z0 - 0.02, x1 + halo, y1 + halo, Math.min(z1, z0 + 0.01), PAL[HALO_OF[col] || 'indigo']); }
  g.av = 0;
}
// tape on a wall face (z plane): a line from (x0, y0) to (x1, y1), axis-aligned
const tapeH = (g, x0, x1, y, z, col, w = 0.05, f = 0, halo = 0.05) => neon(g, x0, y - w / 2, z, x1, y + w / 2, z + 0.03, col, f, halo);
const tapeV = (g, x, y0, y1, z, col, w = 0.05, f = 0, halo = 0.05) => neon(g, x - w / 2, y0, z, x + w / 2, y1, z + 0.03, col, f, halo);
// a pixel line on the glow mesh (diagonal tape: a staircase of squares)
function tapeLine(g, x0, y0, x1, y1, z, col, s = 0.06) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / s));
  for (let i = 0; i <= n; i++) { const q = i / n, x = x0 + (x1 - x0) * q, y = y0 + (y1 - y0) * q; g.bx(x - s / 2, y - s / 2, z, x + s / 2, y + s / 2, z + 0.03, PAL[col]); }
}
const OCC = [];                                               // world boxes that stop bullets (figRaycast)
const occ = (x0, y0, z0, x1, y1, z1) => OCC.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));

// ---------- murals (pixel functions; world coords of the cell centre come in) ----------
function alienMural(x, y) {                                   // the grinning alien on W1 (centre -4.55, 1.45)
  const ax = (x + 4.55) / 0.78, ay = (y - 1.38) / 0.98, hd = ax * ax + ay * ay;
  const eye = (ex, side) => { const u = (x - ex) * 0.94 - (y - 1.6) * side * 0.5, w = (y - 1.6) * 0.94 + (x - ex) * side * 0.5; return (u / 0.24) * (u / 0.24) + (w / 0.13) * (w / 0.13); };
  // antennae with yellow knobs
  for (const [bx, kx] of [[-4.85, -5.15], [-4.25, -3.95]]) {
    const t = (y - 2.25) / 0.4; if (t >= 0 && t <= 1 && Math.abs(x - (bx + (kx - bx) * t)) < 0.05) return 'lime';
    if (hyp(x - kx, y - 2.72) < 0.1) return y > 2.74 && x < kx ? 'lemon' : 'yellow';
  }
  if (hd <= 1) {
    const e1 = eye(-4.85, 1), e2 = eye(-4.25, -1);
    if (e1 <= 1 || e2 <= 1) return (hyp(x + 4.92, y - 1.66) < 0.05 || hyp(x + 4.32, y - 1.66) < 0.05) ? 'bone' : 'void';
    const gx = (x + 4.55) / 0.48, gy = (y - 1.02) / 0.2;      // the grin: a wide arc with teeth
    if (gx * gx + gy * gy <= 1 && y < 1.06) return Math.abs(y - 1.0) < 0.05 && ((x * 20) | 0) % 2 === 0 ? 'bone' : y > 0.96 ? 'bone' : 'pink';
    if (hd > 0.82) return 'green';
    if (ax < -0.2 && ay > 0.25 && hd < 0.6) return 'lemon';
    return ax > 0.35 ? 'green' : 'lime';
  }
  // splatter: drips + flecks
  const hsh = hash2(Math.floor(x * 16), Math.floor(y * 16));
  if (hd < 1.6 && hsh < 0.08) return hsh < 0.04 ? 'cyan' : 'pink';
  if (y < 0.65 && Math.abs(Math.sin(x * 9.3) * 0.5) < 0.03 && hash1(Math.floor(x * 9.3 / Math.PI)) < 0.5) return 'pink';
  if (hash2(Math.floor(x * 7), Math.floor(y * 7)) < 0.012) return 'bone';
  return null;
}
function platformMural(x, y) {                                // planets, stars and lime splatter on the catwalk front
  const p1 = hyp((x + 7.1) / 0.85, (y - 1.62) / 0.85), ring = Math.abs(((x + 7.1) * 0.35 - (y - 1.62) * 0.94) / 1.55) < 1 && Math.abs((y - 1.62) * 0.35 + (x + 7.1) * 0.94) < 1.55 && Math.abs((x + 7.1) * 0.34 - (y - 1.62)) < 0.1;
  if (ring && p1 > 0.85) return ((x * 12) | 0) % 3 ? 'orange' : 'amber';
  if (p1 <= 1) { if (ring) return 'orange'; return p1 > 0.88 ? 'plum' : (x + 7.1) - (y - 1.62) < -0.45 ? 'bubblegum' : (Math.sin(y * 9) > 0.6 ? 'magenta' : 'pink'); }
  const p2 = hyp((x + 1.9) / 0.48, (y - 2.25) / 0.48);
  if (p2 <= 1) return p2 > 0.85 ? 'blue' : (x + 1.9) + (y - 2.25) > 0.2 ? 'ice' : 'cyan';
  const sw = Math.sin(x * 1.3 + 0.6) * 0.55 + 0.85;           // a lime splatter streak across the middle
  if (Math.abs(y - sw) < 0.06 + 0.05 * Math.sin(x * 7.0) && x > -5.5 && x < -2.6) return 'lime';
  if (x > -5.4 && x < -2.7 && y < sw && y > sw - 0.55 && Math.abs(Math.sin(x * 23)) < 0.06) return 'lime';      // drips
  const h = hash2(Math.floor(x * 13), Math.floor(y * 13));
  if (h < 0.018) return h < 0.006 ? 'bone' : h < 0.012 ? 'ice' : 'pink';
  return null;
}
function hazardMural(x, y) {                                  // W3: a lime biohazard trefoil + a yellow / void hazard band
  if (y < 0.36) return ((Math.floor((x - y) * 6)) & 1) ? 'yellow' : null;
  const cx = -0.2, cy = 1.38, dx = x - cx, dy = y - cy, d = hyp(dx, dy), a = Math.atan2(dy, dx);
  if (d < 0.09) return 'lime';
  if (d > 0.3 && d < 0.36) { const s = ((a / TAU * 3 + 3.25) % 1); if (s > 0.18 && s < 0.82) return 'lime'; }
  for (let k = 0; k < 3; k++) { const ta = Math.PI / 2 + k * TAU / 3, ox = Math.cos(ta) * 0.34, oy = Math.sin(ta) * 0.34, dd = hyp(dx - ox, dy - oy);
    if (dd < 0.3 && dd > 0.13 && d > 0.16) return 'lime'; }
  if (hash2(Math.floor(x * 11), Math.floor(y * 11)) < 0.02) return 'pink';
  return null;
}
function brickMural(x, y) {                                   // W2: glowing brick outlines (UV paint), dithered by the env class
  const row = Math.floor(y / 0.21), off = (row & 1) * 0.21, bx = (x + off) / 0.42;
  if (y - row * 0.21 < 0.035 || bx - Math.floor(bx) < 0.08) return hash2(Math.floor(bx), row) < 0.3 ? 'rust' : 'oxblood';
  return null;
}
// ---------- the pieces ----------
const W2_ROOF = [[1.2, 2.7, 2.75], [2.7, 4.9, 2.4], [4.9, 6.2, 3.0], [6.2, 7.4, 2.6], [7.4, 8.6, 3.2]];
const WINS = [[2.75, 3.85], [4.45, 5.55], [6.15, 7.25]], WIN_Y = [0.95, 2.15];
const BASE_C = [5.6, 4.0, -12.95], BASE_R = 0.9;
const SB_P = { x0: -2.05, y0: 5.85, z: -8.43, pitch: 0.1, W: 48, H: 12 };
function barrel(v, g, cx, cz, seed) {
  const r = 0.42, h = 0.9, side = 2 * r * Math.cos(Math.PI / 16);
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Matrix4().makeRotationY(k * Math.PI / 8).setPosition(cx, 0, cz);
    v.box(0, h / 2, 0, side, h, side, PAL[k & 1 ? 'deepblue' : 'blue'], m);
    v.box(0, h + 0.02, 0, side * 0.94, 0.04, side * 0.94, PAL.steel, m);
    g.av = 0; g.box(0, 0.7, 0, side * 1.02, 0.13, side * 1.02, PAL.lime, m);           // fluorescent hazard band
    g.box(0, 0.12, 0, side * 1.02, 0.05, side * 1.02, PAL.green, m);
  }
  const zf = cz + r * 1.03;
  // diagonal void stripes over the band's front + the biohazard mark + lime ooze dripping over the lip
  for (let i = -3; i <= 3; i++) g.bx(cx + i * 0.11 - 0.025, 0.64, zf, cx + i * 0.11 + 0.025, 0.76, zf + 0.012, PAL.void);
  const mk = [[0, 0.42, 0.05], [-0.07, 0.36, 0.045], [0.07, 0.36, 0.045], [0, 0.31, 0.03]];
  for (const [dx, y, s] of mk) g.bx(cx + dx - s, y - s, zf, cx + dx + s, y + s, zf + 0.012, PAL.lime);
  g.bx(cx - 0.015, 0.395, zf + 0.012, cx + 0.015, 0.425, zf + 0.02, PAL.void);
  for (let d = 0; d < 3; d++) { const x = cx + (hash1(seed * 7 + d) - 0.5) * 0.5, L = 0.08 + hash1(seed * 13 + d) * 0.2; g.bx(x - 0.025, h - L, zf - 0.01, x + 0.025, h + 0.04, zf + 0.005, PAL.lime); }
}
function crate(v, g, x0, y0, z0, x1, y1, z1) {
  v.bx(x0, y0, z0, x1, y1, z1, PAL.navy);
  v.bx(x0 + 0.04, y1, z0 + 0.04, x1 - 0.04, y1 + 0.02, z1 - 0.04, PAL.slate);
  const z = z1 + 0.002, w = 0.06;
  tapeH(g, x0, x1, y0 + w / 2, z, 'orange', w, 0, 0.03); tapeH(g, x0, x1, y1 - w / 2, z, 'orange', w, 0, 0.03);
  tapeV(g, x0 + w / 2, y0, y1, z, 'orange', w, 0, 0.03); tapeV(g, x1 - w / 2, y0, y1, z, 'orange', w, 0, 0.03);
  tapeLine(g, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, z, 'orange', 0.055); tapeLine(g, x0 + 0.08, y1 - 0.08, x1 - 0.08, y0 + 0.08, z, 'orange', 0.055);
}
// bold-font neon letters: each font pixel a lit square with a soft halo; f = flicker group base
function neonText(g, str, x0, yTop, z, s, colOf, f0) {
  const t = R.bold(str);
  for (const [px, py, ci] of t.px) {
    const col = colOf(ci), x = x0 + px * s, y = yTop - py * s;
    g.av = f0 + ci; g.bx(x + s * 0.08, y - s * 0.92, z, x + s * 0.92, y - s * 0.08, z + 0.04, PAL[col]);
    g.av = -(f0 + ci); g.bx(x - s * 0.18, y - s * 1.18, z - 0.015, x + s * 1.18, y + s * 0.18, z - 0.005, PAL[HALO_OF[col] || 'plum']);
  }
  g.av = 0;
  return t.w * s;
}
function ringArc(g, cx, cy, z, r, col, f, gaps) {
  const n = Math.ceil(TAU * r / 0.055);
  for (let i = 0; i < n; i++) { const a = i / n * TAU, s = ((a / (TAU / 4)) % 1); if (gaps && (s < 0.1 || s > 0.9)) continue;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; g.av = f; g.bx(x - 0.035, y - 0.035, z, x + 0.035, y + 0.035, z + 0.03, PAL[col]);
    g.av = -f; g.bx(x - 0.07, y - 0.07, z - 0.015, x + 0.07, y + 0.07, z - 0.005, PAL[HALO_OF[col]]); }
  g.av = 0;
}
function buildArena() {
  const v = new Vox(), g = new AVox('aF'); v.shade = SH_ENV; v.bake = bakeUV;
  OCC.length = 0;
  // ROOM
  v.bx(-10.9, 0, -13.4, 10.9, 6.3, -13.0, PAL.midnight);
  v.bx(-10.9, 0, -13.2, -10.5, 6.3, 2.0, PAL.midnight); v.bx(10.5, 0, -13.2, 10.9, 6.3, 2.0, PAL.midnight);
  v.bx(-10.9, 6.2, -13.4, 10.9, 6.5, 3.5, PAL.void);
  for (const z of [-5.6, -8.0, -10.6]) v.bx(-10.5, 5.98, z - 0.1, 10.5, 6.2, z + 0.1, PAL.navy);
  for (let x = -10.2; x < 10.5; x += 1.4) faceZ(v, x, 0, x + 0.04, 6.2, -12.995, 'navy');                  // panel seams
  paintZ(v, -10.5, 0, -12.99, 105, 31, 0.2, (i, j) => { const h = hash2(i, j + 77); return h < 0.03 ? (h < 0.01 ? 'bone' : h < 0.02 ? 'ice' : 'pink') : null; });   // star speckle
  // side walls: a galaxy swirl in the back corners (cyan / blue / pink brush strokes)
  for (const sx of [-1, 1]) for (let i = 0; i < 70; i++) {
    const z = -12.8 + i * 0.12, y = 2.6 + 1.3 * Math.sin(i * 0.17 + (sx > 0 ? 1.5 : 0)) + 0.4 * Math.sin(i * 0.43), w = 0.14 + 0.12 * Math.sin(i * 0.31);
    v.bx(sx * 10.49 - 0.005, y - w, z, sx * 10.49 + 0.005, y + w, z + 0.12, PAL[i % 9 < 4 ? 'cyan' : i % 9 < 7 ? 'blue' : 'pink']);
  }
  // SIGN on the back wall: a dark backing, a target-ring logo, B.L.A.M. in pink over LASER TAG in rainbow tubes
  v.bx(-10.15, 4.32, -13.0, -1.55, 6.12, -12.97, PAL.void);
  ringArc(g, -9.2, 5.22, -12.95, 0.6, 'lime', 50, true); ringArc(g, -9.2, 5.22, -12.95, 0.42, 'blue', 50, true); ringArc(g, -9.2, 5.22, -12.95, 0.25, 'yellow', 50, true);
  neon(g, -9.42, 5.19, -12.95, -8.98, 5.25, -12.91, 'red', 51, 0.04); neon(g, -9.23, 5.0, -12.95, -9.17, 5.44, -12.91, 'red', 51, 0.04);
  const RAIN = ['yellow', 'pink', 'lime', 'orange', 'cyan', null, 'lime', 'magenta', 'red'];
  const lw = R.bold('LASER TAG').w * 0.1;
  neonText(g, 'LASER TAG', -5.6 - lw / 2, 5.32, -12.95, 0.1, ci => RAIN[ci] || 'pink', 1);
  const bw = R.bold('B.L.A.M.').w * 0.075;
  neonText(g, 'B.L.A.M.', -5.6 - bw / 2, 6.0, -12.95, 0.075, () => 'pink', 20);
  // SKYLINE neon (back wall, either side of the base): building outlines with a few lit windows
  const sky = (x0, x1, seed) => {
    let x = x0, k = 0;
    while (x < x1 - 0.3) {
      const w = 0.5 + hash1(seed + k * 3) * 0.7, top = 3.15 + hash1(seed + k * 5 + 1) * 1.3, xe = Math.min(x1, x + w), col = ['cyan', 'pink', 'lime', 'magenta'][(seed + k) % 4];
      tapeH(g, x, xe, top, -12.96, col, 0.045, 0, 0.04); tapeV(g, x, 2.7, top, -12.96, col, 0.045, 0, 0.04); tapeV(g, xe, 2.7, top, -12.96, col, 0.045, 0, 0.04);
      if (hash1(seed + k * 7) < 0.5) tapeV(g, (x + xe) / 2, top, top + 0.35, -12.96, col, 0.03, 0, 0.02);          // an antenna
      for (let wy = 2.95; wy < top - 0.2; wy += 0.3) for (let wx = x + 0.12; wx < xe - 0.12; wx += 0.22) if (hash2(Math.round(wx * 10), Math.round(wy * 10) + seed) < 0.35) faceZ(g, wx, wy, wx + 0.08, wy + 0.1, -12.955, 'lemon');
      x = xe + 0.05; k++;
    }
  };
  sky(0.9, 4.2, 3); sky(7.1, 10.4, 11);
  // THE BASE: housing (shutter rides up into it), a hex frame of chasing lamps, the dark core recess
  v.bx(4.35, 5.05, -12.98, 6.85, 6.2, -12.62, PAL.navy);
  paintZ(v, 4.35, 5.05, -12.615, 25, 4, 0.1, (i, j) => (j === 0 || j === 3) ? ((i + j) & 2 ? 'yellow' : 'void') : null);
  { const L = R.small('BASE'), s = 0.07, x0 = 5.6 - (L.w * s) / 2; for (const [px, py] of L.px) faceZ(g, x0 + px * s, 5.78 - py * s, x0 + (px + 1) * s, 5.78 - (py - 1) * s, -12.6, 'red'); }
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, x = BASE_C[0] + Math.cos(a) * 1.3, y = BASE_C[1] + Math.sin(a) * 1.3;
    v.bx(x - 0.09, y - 0.09, -12.98, x + 0.09, y + 0.09, -12.9, PAL.slate);
    g.av = 200 + i; g.bx(x - 0.075, y - 0.075, -12.9, x + 0.075, y + 0.075, -12.87, PAL.red);
    g.av = -(200 + i); g.bx(x - 0.1, y - 0.1, -12.91, x + 0.1, y + 0.1, -12.905, PAL.oxblood);
  }
  g.av = 0;
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) { const d = hyp(i, j) * 0.09; if (d < 1.12) faceZ(v, BASE_C[0] + i * 0.09 - 0.045, BASE_C[1] + j * 0.09 - 0.045, BASE_C[0] + i * 0.09 + 0.045, BASE_C[1] + j * 0.09 + 0.045, -12.975, d > 1.0 ? 'slate' : 'void'); }
  // UV TUBES on the ceiling (ice cores, blue halos, steel end caps)
  const tubes = [[-9.5, -6.5, -6.3], [-4.2, -1.2, -6.1], [2.6, 5.6, -6.4], [6.8, 9.6, -6.0], [-8.4, -5.4, -11.4], [-2.6, 0.4, -11.7], [3.4, 6.4, -11.2]];
  tubes.forEach(([x0, x1, z], i) => { neon(g, x0, 6.03, z - 0.035, x1, 6.1, z + 0.035, 'ice', 100 + i, 0.07); v.bx(x0 - 0.08, 6.02, z - 0.06, x0, 6.12, z + 0.06, PAL.steel); v.bx(x1, 6.02, z - 0.06, x1 + 0.08, 6.12, z + 0.06, PAL.steel); });
  // THE CATWALK: a solid platform (front face z -9.6 = a mural), deck 2.5, parapet to 3.25, posts, two orange tube rails, a ramp
  v.bx(-10.5, 0, -11.6, 1.0, 2.5, -9.75, PAL.indigo);
  v.bx(-10.5, 0, -9.75, 1.0, 3.25, -9.6, PAL.midnight); occ(-10.5, 0, -9.75, 1.0, 3.25, -9.6);
  paintZ(v, -10.5, 0, -9.595, 144, 40, 0.08, (i, j) => platformMural(-10.5 + (i + 0.5) * 0.08, (j + 0.5) * 0.08));
  tapeH(g, -10.5, 1.0, 3.22, -9.6, 'lime', 0.06); tapeH(g, -10.5, 1.0, 2.48, -9.6, 'pink', 0.05);
  tapeV(g, 0.97, 0, 3.25, -9.6, 'lime', 0.06);
  for (let x = -10.0; x <= 0.6; x += 1.5) v.bx(x - 0.04, 3.25, -9.72, x + 0.04, 3.5, -9.64, PAL.slate);   // a low kick rail: the vests stay clear above it
  neon(g, -10.5, 3.44, -9.71, 1.0, 3.5, -9.65, 'orange', 0, 0.05);
  for (let i = 0; i < 12; i++) { const xa = 1.0 + i * 0.32, h = 2.5 * (1 - (i + 1) / 12); if (h > 0.01) v.bx(xa, 0, -11.6, xa + 0.32, h, -9.75, PAL.indigo); neon(g, xa, h - 0.03, -9.75, xa + 0.32, h + 0.02, -9.71, 'lime', 0, 0.03); }
  // W1 near-left maze wall + the alien mural; orange tape on its top and open edge
  v.bx(-7.2, 0, -1.9, -4.3, 2.7, -1.6, PAL.midnight); occ(-7.2, 0, -1.9, -4.3, 2.7, -1.6);
  paintZ(v, -7.2, 0, -1.595, 49, 45, 0.06, (i, j) => alienMural(-7.2 + (i + 0.5) * 0.06 + 0.95, (j + 0.5) * 0.06));
  { const s = R.small('ZAP!'), q = 0.05; for (const [px, py] of s.px) faceZ(v, -4.95 + px * q, 0.5 - py * q, -4.95 + (px + 1) * q, 0.5 - (py - 1) * q, -1.59, 'yellow'); }
  tapeH(g, -7.2, -4.3, 2.67, -1.6, 'orange', 0.06); tapeV(g, -4.33, 0, 2.7, -1.6, 'orange', 0.06);
  // near-right barrels + the barrel row
  barrel(v, g, 3.25, -2.5, 1); barrel(v, g, 4.1, -2.5, 2); occ(2.83, 0, -2.92, 4.52, 0.9, -2.08);
  for (let i = 0; i < 8; i++) barrel(v, g, -3.8 + i * 0.84, -5.1, 10 + i);
  occ(-4.22, 0, -5.52, 2.5, 0.9, -4.68);
  // crates (left middle)
  crate(v, g, -7.7, 0, -6.6, -6.6, 1.1, -5.6); crate(v, g, -6.6, 0, -6.6, -5.5, 1.1, -5.6); crate(v, g, -7.5, 1.1, -6.5, -6.4, 2.1, -5.7);
  occ(-7.7, 0, -6.6, -5.5, 1.1, -5.6); occ(-7.5, 1.1, -6.5, -6.4, 2.1, -5.7);
  v.bx(-6.7, 0, -7.4, -5.5, 0.1, -6.7, PAL.slate);                                                        // a pallet behind
  // W2 the window wall: a city facade (glowing bricks) with a neon skyline roof and three windows framed in green tape
  const W2Z0 = -7.4, W2Z = -7.1;
  const wb = (x0, y0, x1, y1) => { if (x1 - x0 > 0.01 && y1 - y0 > 0.01) { v.bx(x0, y0, W2Z0, x1, y1, W2Z, PAL.midnight); occ(x0, y0, W2Z0, x1, y1, W2Z); } };
  wb(1.2, 0, 8.6, WIN_Y[0]);
  let xp = 1.2; for (const [a, b] of WINS) { wb(xp, WIN_Y[0], a, WIN_Y[1]); xp = b; } wb(xp, WIN_Y[0], 8.6, WIN_Y[1]);
  for (const [a, b, top] of W2_ROOF) wb(a, WIN_Y[1], b, top);
  paintZ(v, 1.2, 0, -7.095, 106, 50, 0.07, (i, j) => {
    const x = 1.2 + (i + 0.5) * 0.07, y = (j + 0.5) * 0.07;
    if (y > (W2_ROOF.find(r => x >= r[0] && x < r[1]) || [0, 0, 0])[2]) return null;
    if (y > WIN_Y[0] && y < WIN_Y[1] && WINS.some(([a, b]) => x > a && x < b)) return null;
    return brickMural(x, y);
  });
  W2_ROOF.forEach(([a, b, top], i) => {
    tapeH(g, a, b, top - 0.03, W2Z, i & 1 ? 'pink' : 'cyan', 0.06);
    const nt = i + 1 < W2_ROOF.length ? W2_ROOF[i + 1][2] : 0; tapeV(g, b, Math.min(top, nt || 0), Math.max(top, nt || 0), W2Z, 'cyan', 0.06);
    if (i === 0) tapeV(g, a, 0, top, W2Z, 'cyan', 0.06);
    for (let wy = top - 0.4; wy > WIN_Y[1] + 0.15; wy -= 0.32) for (let wx = a + 0.15; wx < b - 0.15; wx += 0.3) if (hash2(Math.round(wx * 10), Math.round(wy * 10)) < 0.4) faceZ(g, wx, wy, wx + 0.12, wy + 0.14, W2Z + 0.004, 'lemon');
  });
  WINS.forEach(([a, b]) => { tapeH(g, a, b, WIN_Y[0], W2Z, 'lime', 0.05); tapeH(g, a, b, WIN_Y[1], W2Z, 'lime', 0.05); tapeV(g, a, WIN_Y[0], WIN_Y[1], W2Z, 'lime', 0.05); tapeV(g, b, WIN_Y[0], WIN_Y[1], W2Z, 'lime', 0.05); });
  v.bx(1.2, 0, -12.9, 8.6, 0.02, -7.4, PAL.void);                                                         // the dark behind the windows
  // W3 the centre panel: biohazard mural, pink tape
  v.bx(-1.8, 0, -8.75, 0.2, 2.4, -8.45, PAL.midnight); occ(-1.8, 0, -8.75, 0.2, 2.4, -8.45);
  paintZ(v, -1.8, 0, -8.445, 40, 48, 0.05, (i, j) => hazardMural(-1.8 + (i + 0.5) * 0.05 + 0.6, (j + 0.5) * 0.05));
  tapeH(g, -1.8, 0.2, 2.37, -8.45, 'pink', 0.06); tapeV(g, -1.77, 0, 2.4, -8.45, 'pink', 0.06); tapeV(g, 0.17, 0, 2.4, -8.45, 'pink', 0.06);
  // the fog machine (back-left corner) with its lime power LED
  v.bx(-8.3, 0, -8.7, -7.4, 0.55, -8.0, PAL.slate); v.bx(-7.45, 0.2, -8.45, -7.25, 0.38, -8.25, PAL.void);
  neon(g, -8.15, 0.42, -8.0, -8.05, 0.48, -7.97, 'lime', 0, 0.03);
  // the player's barrier (bottom of the screen): orange tape along its top
  v.bx(-3.0, 0, 2.9, 3.0, 1.22, 3.25, PAL.navy); v.bx(-3.0, 1.22, 2.9, 3.0, 1.26, 3.25, PAL.slate); occ(-3.0, 0, 2.9, 3.0, 1.26, 3.25);
  neon(g, -3.0, 1.195, 3.25, 3.0, 1.215, 3.262, 'orange', 0, 0.012);
  // the SCOREBOARD's box, frame and cables (the LEDs are their own instanced mesh)
  v.bx(-2.25, 4.62, -8.6, 2.85, 5.98, -8.45, PAL.void);
  tapeH(g, -2.25, 2.85, 5.96, -8.45, 'cyan', 0.04, 0, 0.03); tapeH(g, -2.25, 2.85, 4.64, -8.45, 'cyan', 0.04, 0, 0.03);
  tapeV(g, -2.23, 4.62, 5.98, -8.45, 'cyan', 0.04, 0, 0.03); tapeV(g, 2.83, 4.62, 5.98, -8.45, 'cyan', 0.04, 0, 0.03);
  v.bx(-1.82, 5.98, -8.54, -1.78, 6.2, -8.5, PAL.slate); v.bx(2.38, 5.98, -8.54, 2.42, 6.2, -8.5, PAL.slate);
  const env = new THREE.Mesh(v.geo(), MAT_ENV), glow = new THREE.Mesh(g.geo(), MAT_GLOW);
  glow.raycast = () => {};
  return { env, glow };
}
function buildFloor() {
  const geo = new THREE.PlaneGeometry(21.8, 16.6, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -4.9);
  const n = geo.attributes.position.count, c = new Float32Array(n * 3); _col.set(PAL.midnight); for (let i = 0; i < n; i++) c.set([_col.r, _col.g, _col.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return new THREE.Mesh(geo, MAT_FLOOR);
}
// ---------- the base's moving parts (persistent: the shutter is down whenever the base is shut) ----------
const BASE_OBJ = { shutter: null, core: null, beacon: null, open: 0, coreMat: null };
function buildBaseParts(group) {
  const sv = new Vox(); sv.shade = SH_ENV;
  sv.bx(-1.1, -1.1, 0, 1.1, 1.1, 0.06, PAL.navy);
  for (let i = -5; i <= 5; i++) sv.bx(i * 0.2 - 0.05, -1.1, 0.06, i * 0.2 + 0.05, 1.1, 0.075, PAL[(i & 1) ? 'yellow' : 'void']);   // hazard stripes
  sv.bx(-0.6, -0.12, 0.075, 0.6, 0.12, 0.09, PAL.red); sv.bx(-0.12, -0.6, 0.075, 0.12, 0.6, 0.09, PAL.red);                    // a red cross: KEEP OUT
  const sh = new THREE.Mesh(sv.geo(), MAT_ENV); sh.position.set(BASE_C[0], BASE_C[1], -12.86); sh.raycast = () => {};
  const cv = new Vox();
  for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
    const d = hyp(i, j) / 10; if (d > 1) continue;
    const col = d < 0.18 ? 'bone' : d < 0.32 ? 'lemon' : d < 0.5 ? 'coral' : d < 0.72 ? 'red' : d < 0.86 ? 'crimson' : 'red';
    cv.bx(i * 0.09 - 0.045, j * 0.09 - 0.045, 0, i * 0.09 + 0.045, j * 0.09 + 0.045, 0.05 + (1 - d) * 0.12, PAL[col]);
  }
  BASE_OBJ.coreMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const core = new THREE.Mesh(cv.geo(), BASE_OBJ.coreMat); core.position.set(BASE_C[0], BASE_C[1], -12.97); core.raycast = () => {};
  const bv = new Vox();
  bv.bx(-0.12, 0, -0.12, 0.12, 0.2, 0.12, PAL.red); bv.bx(-0.07, 0.2, -0.07, 0.07, 0.26, 0.07, PAL.coral);
  for (const s of [-1, 1]) for (let k = 1; k <= 10; k++) bv.bx(s * (0.12 + k * 0.16) - 0.08, 0.1 - k * 0.02, -0.03 - k * 0.02, s * (0.12 + k * 0.16) + 0.08, 0.12 + k * 0.02, 0.03 + k * 0.02, PAL[k < 3 ? 'coral' : k < 6 ? 'red' : 'crimson']);
  const beacon = new THREE.Mesh(bv.geo(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); beacon.position.set(7.35, 4.95, -12.75); beacon.raycast = () => {}; beacon.visible = false;
  group.add(sh, core, beacon);
  Object.assign(BASE_OBJ, { shutter: sh, core, beacon });
  baseSet(0, 0, true);
}
function baseSet(open, t, alive) {
  const B0 = BASE_OBJ; if (!B0.shutter) return;
  B0.open = open;
  B0.shutter.position.y = BASE_C[1] + 2.25 * E.inOut(clamp(open, 0, 1));
  const pulse = alive ? 1.05 + 0.3 * Math.sin(t * 14) : 0.25;
  B0.coreMat.color.setScalar(open > 0.02 ? pulse : 0.3);
  B0.beacon.visible = open > 0.02 && alive; B0.beacon.rotation.y = t * 9;
  U.uBase.value = open > 0.05 ? 1 : 0;
}

// ---------- the SCOREBOARD: 48 x 12 LED dots (one InstancedMesh), text from the 3x5 / bold fonts ----------
const SB = { mesh: null, key: '', code: new Uint8Array(48 * 12), alert: null, alertUntil: 0, msg: null, msgUntil: 0 };
const SB_COLS = [PAL.navy, PAL.lemon, PAL.amber, PAL.red, PAL.lime, PAL.cyan, PAL.pink, PAL.orange, PAL.bone, PAL.midnight];
function buildBoard() {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.075, 0.03), new THREE.MeshBasicMaterial({ fog: false }), SB_P.W * SB_P.H);
  const mt = new THREE.Matrix4();
  for (let j = 0; j < SB_P.H; j++) for (let i = 0; i < SB_P.W; i++) { mt.makeTranslation(SB_P.x0 + i * SB_P.pitch, SB_P.y0 - j * SB_P.pitch, SB_P.z); m.setMatrixAt(j * SB_P.W + i, mt); m.setColorAt(j * SB_P.W + i, _col.set(PAL.navy)); }
  m.frustumCulled = false; m.raycast = () => {}; m.userData.sharedGeo = true;
  SB.mesh = m; SB.key = '';
  return m;
}
function sbText(code, str, x0, y0, c) {                       // 3x5 text into the LED code grid
  const t = R.small(str);
  for (const [px, py] of t.px) { const x = x0 + px, y = y0 + py; if (x >= 0 && x < SB_P.W && y >= 0 && y < SB_P.H) code[y * SB_P.W + x] = c; }
}
function sbBold(code, str, x0, y0, colOf) {
  const t = R.bold(str);
  for (const [px, py, ci] of t.px) { const x = x0 + px, y = y0 + py; if (x >= 0 && x < SB_P.W && y >= 0 && y < SB_P.H) code[y * SB_P.W + x] = colOf(ci); }
  return t.w;
}
const pad2 = n => String(Math.max(0, Math.min(99, n | 0))).padStart(2, '0');
function sbStep(now) {
  if (!SB.mesh) return;
  const run = B.G && B.G.run, mine = run && run.stage === ID, code = SB.code;
  let key;
  const fin = STAGE.fin;
  if (mine && fin >= 0) {
    const q = STAGE.finT, off = Math.round(SB_P.W - q * 18), sh = ((q * 6) | 0);
    key = 'fin|' + Math.max(off, 4) + '|' + (q > 2.8 ? sh : 0);
  } else if (mine && run.state !== 'count') {
    const a = SB.alert && now < SB.alertUntil ? SB.alert : null, blink = ((now / 220) | 0) & 1;
    key = 'p|' + pad2(run.me.hits) + '|' + pad2(Math.ceil(run.timeLeft)) + '|' + (a ? a + blink : '') + '|' + (SB.msg && now < SB.msgUntil ? SB.msg : '');
  } else key = mine ? 'ready|' + (((now / 400) | 0) & 1) : 'idle';
  if (key === SB.key) return;
  SB.key = key; code.fill(0);
  if (key.startsWith('fin')) {
    const q = STAGE.finT, off = Math.max(4, Math.round(SB_P.W - q * 18)), sh = q > 2.8 ? ((q * 6) | 0) : 0;
    sbBold(code, 'B.L.A.M.', off, 2, ci => [1, 6, 4, 5, 7, 6, 3, 1][(ci + sh) % 8]);
  } else if (key.startsWith('p|')) {
    const hits = +key.split('|')[1], secs = +key.split('|')[2], a = SB.alert && now < SB.alertUntil ? SB.alert : null, msg = SB.msg && now < SB.msgUntil ? SB.msg : null;
    if (msg) { sbText(code, msg, Math.round((SB_P.W - R.small(msg).w) / 2), 3, 4); }
    else {
      sbText(code, 'TAGS', 2, 0, 2); sbText(code, pad2(hits), 21, 0, 1);
      if (a) { if (((now / 220) | 0) & 1) sbText(code, a, Math.round((SB_P.W - R.small(a).w) / 2), 6, 3); }
      else { sbText(code, 'TIME', 2, 6, 2); sbText(code, pad2(secs), 21, 6, secs <= 5 ? 3 : 1); }
      for (let y = 0; y < 11; y++) code[y * SB_P.W + 31] = 9;                // a divider, then a little vest that lights with your hits
      for (let i = 0; i < Math.min(12, hits); i++) code[(1 + (i % 4) * 2 + 1) * SB_P.W + 34 + Math.floor(i / 4) * 4] = 4;
    }
  } else if (key.startsWith('ready')) {
    sbText(code, 'READY', Math.round((SB_P.W - R.small('READY').w) / 2), 3, key.endsWith('1') ? 1 : 2);
  } else { sbText(code, 'LASER', 4, 0, 6); sbText(code, 'TAG', 26, 0, 4); sbText(code, 'B.L.A.M.', 8, 6, 1); }
  for (let i = 0; i < code.length; i++) SB.mesh.setColorAt(i, _col.set(SB_COLS[code[i]]));
  SB.mesh.instanceColor.needsUpdate = true;
}
const sbAlert = (txt, secs) => { SB.alert = txt; SB.alertUntil = performance.now() + secs * 1000; };
const sbMsg = (txt, secs) => { SB.msg = txt; SB.msgUntil = performance.now() + secs * 1000; };

// ---------- the red FLASH when you are tagged (one camera-space quad, additive, keeps the dither class) ----------
const FLASH = { mesh: null, k: 0 };
function buildFlash() {
  const D = 0.3, h = 2 * D * TAN_H, w = h * R.ASPECT;
  const mat = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uK; varying vec2 vUv; void main(){ vec2 d = (vUv - 0.5) * vec2(1.6, 1.0); float e = smoothstep(0.15, 0.62, length(d));
      gl_FragColor = vec4(${glc(PAL.red)} * uK * (0.16 + 0.85 * e), 1.0); }`,
    transparent: true, depthTest: false, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(0, 0, -D); m.renderOrder = 1005; m.frustumCulled = false; m.visible = false; m.name = 'lasertag-flash';
  R.camera.add(m); FLASH.mesh = m;
}
function flashStep(dt) {
  if (!FLASH.mesh) return;
  if (!isMine()) FLASH.k = 0;
  if (!(B.FX && B.FX.timeScale === 0)) FLASH.k = Math.max(0, FLASH.k - dt * 4.5);   // (dev: FX.timeScale 0 holds it for a still)
  FLASH.mesh.visible = FLASH.k > 0.01; FLASH.mesh.material.uniforms.uK.value = FLASH.k;
}

// =========================================================================================
// ENV (built once; onBeforeRender of the env mesh runs the per-frame cosmetics: clock, haze, the dark claim, the muzzle
// light, the scoreboard, the flash, the fog machine's hiss). Wall clock x ?slow.
// =========================================================================================
const ENV = { last: 0, t: 0 };
const STAGE = { haze: 0, fin: -1, finT: 0, blasts: 0 };
function envStep() {
  const nowMs = performance.now(), now = nowMs / 1000, dt0 = ENV.last ? Math.min(0.05, now - ENV.last) : 0.016; ENV.last = now;
  const dt = dt0 * slowK(); ENV.t += dt; U.uTime.value = ENV.t;
  const mine = isMine(), hz = mine ? STAGE.haze : 0;
  // #92: this whole stage is a dark scene, but ONLY while it is being played: the title / results keep the last env on
  // display, and a claim made there put the muzzle glow on every menu shot (Jon, 2026-10-30; it lapses in 0.3 s now)
  if (mine && B.G.run.state !== 'end' && B.FX && B.FX.setDark) B.FX.setDark(ID, true);   // not on the results screen either
  U.uHaze.value = hz; if (hz > 0.01 && B.FX && B.FX.setHaze) B.FX.setHaze(hz);
  const gn = B.FX && B.FX.glowNow;
  if (gn && gn.k > 0.01) { U.uGunP.value.copy(gn.world); U.uGunC.value.set(gn.col.r, gn.col.g, gn.col.b, gn.k); } else U.uGunC.value.w = 0;
  if (!mine) { STAGE.fin = -1; U.uSign.value = 0; if (!BASE_LIVE.size) baseSet(0, ENV.t, true); }
  flashStep(dt0); sbStep(nowMs);
}
function buildEnv() {
  const group = new THREE.Group();
  const { env, glow } = buildArena(), floor = buildFloor();
  env.onBeforeRender = envStep;
  group.add(env, glow, floor, buildBoard(), pxInit());
  buildBaseParts(group);
  if (!FLASH.mesh) buildFlash();
  group.userData.shootables = [env, floor];
  figGeos();
  return group;
}

// =========================================================================================
// FIGURES: painted on a grid (y up), extruded into voxels (alley.js style cutouts), unlit. Class per cell (aK): 0 body
// (dark clothes with a UV rim on the silhouette), 1 vest trim, 2 sensor, 3 phaser tip, 4 UV-bright bits (white phaser,
// sneakers, visor, whistle), 5 the ref's torch beam. Taggers: helmet + red visor, red vest, phaser up or AT YOU (end-on,
// the lit tip in the middle). Teammates: hair + a green headband, green vest, an empty hand waving / thumbs up, the
// phaser hanging down with a GREEN tip. The referee: striped shirt (his "vest", glows), cap, whistle, a torch with a beam.
// =========================================================================================
const FS = 0.071, FCX = 9.5, FW_M = 1.36, FH_M = 2.3;            // a touch bigger than life (cartoon gallery figures, readable far off)
const RIM = { midnight: 'navy', navy: 'slate', indigo: 'plum', void: 'midnight', chestnut: 'tan', tan: 'sand', umber: 'walnut', walnut: 'chestnut', slate: 'steel', sand: 'lemon' };
class Paint {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); this.d = new Array(w * h).fill(0); this.k = new Array(w * h).fill(0); }
  set(x, y, c, d, k) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this; const i = y * this.w + x; this.c[i] = c; if (d != null) this.d[i] = d; this.k[i] = k || 0; return this; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.c[y * this.w + x]; }
  rect(x0, y0, x1, y1, c, d, k) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c, d, k); return this; }
  ell(cx, cy, rx, ry, c, d, k, bulge = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (q <= 1) this.set(x, y, c, d + Math.round(bulge * Math.sqrt(1 - q)), k);
    }
    return this;
  }
}
function legs(p, pants, stride) {
  const L = stride ? [[4, 7], [12, 15]] : [[5, 8], [11, 14]];
  for (const [a, b] of L) { p.rect(a, 0, b, 1, 'bone', 2, 4).set(a, 0, 'ice', 2, 4); p.rect(a + 1, 2, b, 10, pants, 1); }
  p.rect(6, 10, 13, 11, pants, 1);
}
function vest(p, team) {
  const T0 = team === 'tag' ? { trim: 'red', hi: 'coral', sen: ['red', 'coral', 'bone'] } : { trim: 'green', hi: 'lime', sen: ['green', 'lime', 'bone'] };
  p.rect(5, 12, 14, 21, 'void', 2);
  for (let y = 12; y <= 20; y++) { p.set(5, y, T0.trim, 3, 1); p.set(14, y, T0.trim, 3, 1); }
  p.rect(5, 12, 14, 12, T0.trim, 3, 1).rect(6, 15, 13, 15, T0.hi, 3, 1);
  p.rect(9, 13, 10, 14, 'midnight', 2);
  p.rect(8, 17, 11, 19, T0.sen[0], 4, 2).rect(9, 17, 10, 19, T0.sen[1], 4, 2).rect(8, 18, 11, 18, T0.sen[1], 4, 2).rect(9, 18, 10, 18, T0.sen[2], 5, 2);
  p.set(8, 17, 'void', 2).set(11, 17, 'void', 2).set(8, 19, 'void', 2).set(11, 19, 'void', 2);
  p.rect(3, 20, 6, 21, T0.sen[0], 3, 2).rect(4, 21, 5, 21, T0.sen[1], 4, 2);
  p.rect(13, 20, 16, 21, T0.sen[0], 3, 2).rect(14, 21, 15, 21, T0.sen[1], 4, 2);
}
function paintTagger(pose) {
  const p = new Paint(22, 33);
  legs(p, 'midnight');
  p.rect(5, 12, 14, 21, 'navy', 1);
  vest(p, 'tag');
  p.rect(8, 22, 11, 22, 'chestnut', 1);
  p.ell(9.5, 24.4, 3.0, 2.2, 'chestnut', 2, 0, 1).set(9, 23, 'umber', 3).set(10, 23, 'umber', 3);
  p.ell(9.5, 28.2, 4.1, 3.5, 'navy', 2, 0, 1.4);
  p.rect(5, 25, 14, 26, 'crimson', 3, 4).rect(6, 26, 13, 26, 'red', 4, 4).set(12, 26, 'coral', 4, 4);
  p.rect(9, 29, 10, 31, 'red', 3, 1);
  p.rect(16, 22, 16, 26, 'slate', 1).set(16, 27, 'red', 2, 1);
  if (pose === 'aim') {
    // shouldered, pointed AT YOU from the right shoulder: the chest sensor and the visor stay clear
    p.rect(3, 13, 4, 20, 'navy', 1).rect(4, 12, 6, 13, 'navy', 2).rect(6, 12, 7, 13, 'chestnut', 3);   // left arm down
    p.rect(15, 15, 16, 19, 'navy', 1).rect(13, 15, 15, 16, 'navy', 2).rect(12, 16, 13, 18, 'chestnut', 4);   // right arm up to the grip
    p.rect(11, 18, 16, 22, 'mist', 5, 4).rect(12, 19, 15, 21, 'bone', 6, 4).set(11, 22, 'slate', 5, 4).set(16, 22, 'slate', 5, 4);
    p.rect(13, 19, 14, 21, 'red', 7, 3).set(13, 20, 'coral', 8, 3).set(14, 20, 'coral', 8, 3);
  } else {
    p.rect(3, 13, 4, 20, 'navy', 1).rect(15, 13, 16, 20, 'navy', 1);
    p.rect(4, 12, 7, 13, 'navy', 2).rect(12, 12, 15, 13, 'navy', 2);
    p.rect(6, 12, 7, 13, 'chestnut', 3).rect(13, 13, 14, 14, 'chestnut', 3);
    p.rect(5, 13, 17, 14, 'mist', 3, 4).rect(6, 14, 16, 14, 'bone', 3, 4).rect(14, 12, 15, 12, 'slate', 3, 4);
    p.rect(18, 13, 19, 14, 'red', 3, 3);
  }
  return p;
}
function paintMate(pose, hair) {
  const p = new Paint(22, 33);
  legs(p, 'navy');
  p.rect(5, 12, 14, 21, 'indigo', 1);
  vest(p, 'mate');
  p.rect(8, 22, 11, 22, 'tan', 1);
  p.ell(9.5, 25.8, 3.4, 3.5, 'tan', 2, 0, 1.4);
  p.ell(9.5, 29.4, 3.9, 2.3, hair, 2, 0, 1).rect(6, 26, 6, 28, hair, 2).rect(13, 26, 13, 28, hair, 2);
  p.rect(6, 27, 13, 27, 'lime', 3, 1);
  p.set(8, 25, 'void', 3).set(11, 25, 'void', 3);
  p.rect(8, 23, 11, 23, 'umber', 3).set(7, 24, 'umber', 3).set(12, 24, 'umber', 3);
  p.rect(3, 13, 4, 20, 'indigo', 1).rect(3, 11, 4, 12, 'tan', 2);
  p.rect(3, 5, 4, 10, 'mist', 3, 4).rect(3, 4, 4, 4, 'lime', 3, 3);
  if (pose === 'wave1' || pose === 'wave2') {
    const w = pose === 'wave2' ? 1 : 0;
    p.rect(15, 18, 16, 21, 'indigo', 1);
    p.rect(16 + w, 22, 17 + w, 25, 'tan', 2);
    p.rect(15 + 2 * w, 26, 18 + 2 * w, 28, 'tan', 3);
    p.set(15 + 2 * w, 29, 'tan', 3).set(16 + 2 * w, 30, 'tan', 3).set(17 + 2 * w, 29, 'tan', 3).set(18 + 2 * w, 29, 'tan', 3);
  } else {
    p.rect(15, 15, 16, 20, 'indigo', 1);
    p.rect(12, 15, 16, 16, 'tan', 3);
    p.rect(12, 17, 13, 18, 'tan', 4).rect(12, 19, 12, 21, 'tan', 4);
  }
  return p;
}
function paintRef(step) {
  const p = new Paint(34, 33);
  legs(p, 'void', step);
  for (let x = 5; x <= 14; x++) for (let y = 12; y <= 21; y++) p.set(x, y, (x & 1) ? 'bone' : 'void', 2, (x & 1) ? 1 : 0);
  p.rect(8, 22, 11, 22, 'chestnut', 1).ell(9.5, 25.3, 3.2, 3.2, 'chestnut', 2, 0, 1.2);
  p.rect(6, 28, 13, 30, 'void', 2).rect(12, 28, 16, 28, 'void', 3).set(9, 31, 'void', 2).set(10, 31, 'void', 2);
  p.set(8, 26, 'void', 3).set(11, 26, 'void', 3);
  p.rect(10, 23, 12, 24, 'lemon', 4, 4).set(13, 23, 'yellow', 4, 4);
  p.rect(3, 13 + (step ? 1 : 0), 4, 20, 'bone', 1, 1).rect(3, 11 + (step ? 1 : 0), 4, 12 + (step ? 1 : 0), 'chestnut', 2);
  p.rect(15, 17, 17, 19, 'bone', 2, 1).rect(18, 17, 18, 18, 'chestnut', 3);
  p.rect(19, 17, 21, 18, 'steel', 3, 4).rect(22, 17, 22, 18, 'lemon', 3, 3);
  for (let i = 0; i < 11; i++) { const hw = Math.floor(i / 3); p.rect(23 + i, 17 - hw, 23 + i, 18 + hw, i < 5 ? 'lemon' : 'yellow', 1, 5); }
  return p;
}
function figList(p) {
  const list = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const c = p.get(x, y); if (!c) continue;
    const i = y * p.w + x, cls = p.k[i], dep = p.d[i];
    const edge = !p.get(x - 1, y) || !p.get(x + 1, y) || !p.get(x, y + 1);
    for (let k = -1; k <= dep; k++) list.push([x, y, k, (cls === 0 && edge && k === dep && RIM[c]) ? RIM[c] : c, cls]);
  }
  return list;
}
const SH_BODY = [0.72, 0.72, 0.88, 0.5, 1.0, 0.6], SH_GLOW = [0.9, 0.9, 1, 0.8, 1, 0.85];
function figGeo(p) {
  const list = figList(p), S = new Set(list.map(q => q[0] + ',' + q[1] + ',' + q[2])), v = new AVox('aK');
  const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], ox = -FCX * FS, oy = FS / 2;
  for (const [i, j, k, col, cls] of list) {
    let mask = 0; for (let f = 0; f < 6; f++) if (!S.has((i + N[f][0]) + ',' + (j + N[f][1]) + ',' + (k + N[f][2]))) mask |= 1 << f;
    if (!mask) continue;
    v.shade = cls === 0 ? SH_BODY : SH_GLOW; v.av = cls;
    v.box(ox + i * FS, oy + j * FS, k * FS, FS, FS, FS, PAL[col], null, mask);
  }
  return v.geo();
}
let FIGS = null;
function figGeos() {
  if (FIGS) return FIGS;
  FIGS = { tag_up: figGeo(paintTagger('up')), tag_aim: figGeo(paintTagger('aim')), ref0: figGeo(paintRef(0)), ref1: figGeo(paintRef(1)) };
  ['umber', 'sand'].forEach((h, i) => ['wave1', 'wave2', 'thumb'].forEach(ps => { FIGS['mate_' + ps + '_' + i] = figGeo(paintMate(ps, h)); }));
  return FIGS;
}
// local points (cell coords -> figure space): sensors [x, y, z, r cells], phaser tips, torso
const cellPt = (x, y, z, out) => out.set((x - FCX) * FS, y * FS + FS / 2, z * FS);
const SENS = [[9.5, 18, 4.6, 2.1], [4.5, 20.5, 3.6, 1.6], [14.5, 20.5, 3.6, 1.6]];
const TIPS = { up: [18.5, 13.5, 3.5], aim: [13.5, 20, 8.5] };

// =========================================================================================
// SPOTS: where a figure pops (type: rise = straight up from behind low cover / win = up into a window / lean = sideways
// out from behind a wall edge (dir +1 = to the right) / slide = in from the screen edge / drop = over the catwalk parapet
// and down). x, y, z = the "up" feet position; hy / hx = the hidden offset (rise, win: down; lean, slide: the hidden x).
// Each spot's screen rect (up pose; a slide / drop's whole path) and the CONF matrix (rects that overlap) are pure.
// =========================================================================================
const SPOTS = [
  { id: 'w1', type: 'lean', x: -3.85, y: 0, z: -2.3, dir: 1, hx: -5.35 },
  { id: 'b1', type: 'rise', x: 3.65, y: 0, z: -3.05, hy: -1.65 },
  { id: 'v1', type: 'rise', x: -3.2, y: 0, z: -5.75, hy: -1.65, row: 'v' },
  { id: 'v2', type: 'rise', x: -1.55, y: 0, z: -5.75, hy: -1.65, row: 'v' },
  { id: 'v3', type: 'rise', x: 0.1, y: 0, z: -5.75, hy: -1.65, row: 'v' },
  { id: 'v4', type: 'rise', x: 1.75, y: 0, z: -5.75, hy: -1.65, row: 'v' },
  { id: 'n1', type: 'win', x: 3.3, y: 0, z: -7.8, hy: -1.45, row: 'n' },
  { id: 'n2', type: 'win', x: 5.0, y: 0, z: -7.8, hy: -1.45, row: 'n' },
  { id: 'n3', type: 'win', x: 6.7, y: 0, z: -7.8, hy: -1.45, row: 'n' },
  { id: 'w2', type: 'lean', x: 0.72, y: 0, z: -7.8, dir: -1, hx: 1.95 },
  { id: 'c1', type: 'rise', x: -6.2, y: 0.1, z: -7.05, hy: -1.7 },
  { id: 'w3l', type: 'lean', x: -2.22, y: 0, z: -9.05, dir: -1, hx: -0.8, pair: 'w3r' },
  { id: 'w3r', type: 'lean', x: 0.62, y: 0, z: -9.05, dir: 1, hx: -0.8, pair: 'w3l' },
  { id: 'h1', type: 'rise', x: -8.0, y: 2.5, z: -10.35, hy: -1.62, row: 'h' },
  { id: 'h2', type: 'rise', x: -6.0, y: 2.5, z: -10.35, hy: -1.62, row: 'h' },
  { id: 'h3', type: 'rise', x: -4.0, y: 2.5, z: -10.35, hy: -1.62, row: 'h' },
  { id: 'h4', type: 'rise', x: -2.0, y: 2.5, z: -10.35, hy: -1.62, row: 'h' },
  { id: 'h5', type: 'rise', x: 0.0, y: 2.5, z: -10.35, hy: -1.62, row: 'h' },
  { id: 'fl', type: 'slide', x: -3.3, y: 0, z: -0.4, dir: 1, hx: -6.3, trick: true },
  { id: 'fr', type: 'slide', x: 3.3, y: 0, z: -0.4, dir: -1, hx: 6.3, trick: true },
  { id: 'dp', type: 'drop', x: -3.3, y: 0, z: -8.95, fx: -3.3, fy: 2.5, fz: -10.35, ox: -0.85, trick: true }
];
const SPOT_I = {}; SPOTS.forEach((S, i) => { SPOT_I[S.id] = i; });
SPOTS.forEach(S => { if (S.pair) S.pairI = SPOT_I[S.pair]; });
function figRect(x, y, z) { const a = scr(x - FW_M / 2, y + FH_M, z), b = scr(x + FW_M / 2, y, z); return [a[0], a[1], b[0], b[1]]; }
const rUnion = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
SPOTS.forEach(S => {
  S.rect = figRect(S.x, S.y, S.z);
  if (S.type === 'slide') S.rect = rUnion(S.rect, figRect((S.x + S.hx) / 2, S.y, S.z));
  if (S.type === 'drop') { S.rect = rUnion(rUnion(S.rect, figRect(S.fx, S.fy, S.fz)), figRect(S.ox, S.y, S.z)); }
  const a = scr(S.x, S.y + 1.12, S.z); S.aimPt = [a[0], a[1]];
});
const ovl = (A, Bq, m) => A[0] < Bq[2] + m && Bq[0] < A[2] + m && A[1] < Bq[3] + m && Bq[1] < A[3] + m;
const CONF = SPOTS.map(A => SPOTS.map(Bq => A === Bq || ovl(A.rect, Bq.rect, 2)));
const PAIRS = [['w3l', 'w3r'], ['v1', 'v2'], ['v2', 'v3'], ['v3', 'v4'], ['n1', 'n2'], ['n2', 'n3'], ['h1', 'h2'], ['h2', 'h3'], ['h3', 'h4'], ['h4', 'h5']].map(p => p.map(id => SPOT_I[id]));
const ENTER_K = { rise: 1, win: 1, lean: 1.1, slide: 1.7, drop: 3.4 }, EXIT_K = { rise: 1, win: 1, lean: 1, slide: 1.5, drop: 2.2 };
const REF_Z = -3.4, READY = 0.1, SHOOT_T = 0.3, VS_GRACE = 0.6, FOLD_T = 0.6, REL_LEAD = 0.1;

// ---------- the pose: a pure function of the spawn and its local time (l = lt minus a shot-driven release) ----------
function figPose(sp, l, o) {
  o.vis = false; o.shoot = false; o.done = false; o.rz = 0; o.rx = 0; o.sy = 1; o.dot = -1; o.cancelled = false;
  if (sp.who === 'ref') return refPose(sp, l, o);
  const S = SPOTS[sp.spot];
  o.x = S.x; o.y = S.y; o.z = S.z; o.mir = sp.mir ? -1 : 1;
  o.frame = sp.who === 'tag' ? 'up' : sp.act;
  if (l < 0) return o;
  const end = sp.out + sp.ex;
  if (l >= end) { o.done = true; return o; }
  o.vis = true;
  const phase = l < sp.up ? 0 : l < sp.out ? 1 : 2, k = phase === 0 ? l / sp.up : phase === 2 ? (l - sp.out) / sp.ex : 1;
  const e = phase === 0 ? (S.type === 'slide' ? E.outCubic(k) : E.outBack(k)) : phase === 2 ? 1 - sstep(k) : 1;
  const bob = phase === 1 ? 0.018 * Math.sin(l * 8.5 + sp.id) : 0;
  if (S.type === 'rise' || S.type === 'win') {
    o.y = S.y + S.hy * (1 - e) + bob;
    if (sp.vault && phase === 0) { o.y += 0.55 * Math.sin(Math.PI * k); o.sy = k > 0.85 ? 1 - 0.25 * Math.sin((k - 0.85) / 0.15 * Math.PI) : 1; }
  } else if (S.type === 'lean') {
    o.x = S.hx + (S.x - S.hx) * e; o.rz = -S.dir * 0.13 * clamp(e, 0, 1.15); o.y += bob;
  } else if (S.type === 'slide') {
    o.x = S.hx + (S.x - S.hx) * e; o.y += bob;
    o.rz = phase === 0 ? S.dir * 0.24 * (1 - k) : phase === 2 ? -S.dir * 0.12 * k : 0;
  } else if (S.type === 'drop') {
    if (phase === 0) {
      if (k < 0.3) { const q = k / 0.3; o.x = S.fx; o.z = S.fz; o.y = S.fy - 1.62 * (1 - E.outCubic(q)); }
      else if (k < 0.58) { const q = (k - 0.3) / 0.28; o.x = S.fx; o.z = S.fz + (-9.35 - S.fz) * q; o.y = S.fy + 1.0 * Math.sin(Math.PI * q * 0.75); }
      else { const q = (k - 0.58) / 0.42, y0 = S.fy + 1.0 * Math.sin(Math.PI * 0.75); o.x = S.x; o.z = -9.35 + (S.z + 9.35) * q; o.y = Math.max(0, y0 * (1 - q * q)); if (q > 0.85) o.sy = 1 - 0.3 * Math.sin((q - 0.85) / 0.15 * Math.PI); }
    } else if (phase === 2) { o.x = S.x + (S.ox - S.x) * sstep(k); o.rz = -0.18 * Math.sin(Math.PI * Math.min(1, k * 1.4)); o.y = 0.04 * Math.abs(Math.sin(k * 14)); }
    else o.y += bob;
  }
  if (sp.who === 'tag') {
    const aimOn = sp.fake === 'duck' ? false : sp.fake === 'cancel' ? (l >= sp.aim - 0.1 && l < sp.cancel + 0.05) : l >= sp.aim - 0.1;
    if (aimOn && phase !== 2) o.frame = 'aim';
    if (!sp.fake && l >= sp.aim && l < sp.fire) o.dot = (l - sp.aim) / sp.slide;
    if (sp.fake === 'cancel' && l >= sp.aim && l < sp.cancel) o.dot = (l - sp.aim) / sp.slide;
    if (sp.fake === 'cancel' && l >= sp.cancel) o.cancelled = true;
    if (!sp.fake && l >= sp.fire && l < sp.out) o.rx = -0.16 * (1 - (l - sp.fire) / SHOOT_T);
    o.shoot = l >= READY && l < (sp.fake ? sp.out + 0.4 * sp.ex : sp.fire);
  } else {
    if (sp.act === 'wave1' && phase === 1 && ((l * 5) | 0) & 1) o.frame = 'wave2';
    o.shoot = l >= 0.08 && l < sp.out + 0.5 * sp.ex;
  }
  return o;
}
function refPose(sp, l, o) {
  o.x = sp.xa; o.y = 0; o.z = REF_Z; o.mir = sp.xb < sp.xa ? -1 : 1; o.frame = 'ref0';
  if (l < 0) return o;
  if (l >= sp.dur) { o.done = true; return o; }
  const q = l / sp.dur; o.vis = true; o.shoot = true;
  o.x = sp.xa + (sp.xb - sp.xa) * q; o.y = 0.035 * Math.abs(Math.sin(l * 10.5)); o.frame = ((l * 5.25) | 0) & 1 ? 'ref1' : 'ref0';
  o.rz = 0.03 * Math.sin(l * 10.5) * -o.mir;
  return o;
}
const _pr = {};
function rectAt(sp, t) {                                      // screen rect of a figure at stage time t (null if not up)
  if (sp.who !== 'ref') { const l = t - sp.t0; return l >= 0 && t < sp.t1 ? SPOTS[sp.spot].rect : null; }
  const P = figPose(sp, t - sp.t0, _pr); if (!P.vis) return null;
  return figRect(P.x, P.y, P.z);
}

// =========================================================================================
// HIT TEST: the figure's own voxels (the face's class says sensor or body), cut by the cover (OCC boxes: a hit behind a
// wall / barrel / the parapet doesn't count). Taggers only: a sensor is never smaller than SENS_PX game px round its
// centre (fair far away), and a far tagger's torso never smaller than BODY_PX. Bystanders take precise hits only.
// =========================================================================================
const SENS_PX = { mouse: 3.5, touch: 6 }, BODY_PX = 5;
const _hits = [], _bv = new THREE.Vector3(), _sw = new THREE.Vector3(), _m3 = new THREE.Matrix4();
function blocked(ray, dist) { for (const b of OCC) if (ray.intersectBox(b, _bv) && ray.origin.distanceTo(_bv) < dist - 0.05) return true; return false; }
function figRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable || !this.visible) return;
  this.updateWorldMatrix(true, false);                      // a figure spawned this frame has no rendered matrix yet
  _hits.length = 0; THREE.Mesh.prototype.raycast.call(this, rc, _hits);
  let best = null;
  for (const h of _hits) if (!blocked(rc.ray, h.distance) && (!best || h.distance < best.distance)) best = h;
  let zone = null, dist = 0, point = null;
  if (best) { const ak = this.geometry.attributes.aK; zone = ak && best.face && ak.getX(best.face.a) === 2 ? 'sensor' : 'body'; dist = best.distance; point = best.point.clone(); }
  if (tg.kind === 'target') {
    const touch = B.Input && B.Input.touch, minPx = touch ? SENS_PX.touch : SENS_PX.mouse;
    for (const s of SENS) {
      cellPt(s[0], s[1], s[2], _sw).applyMatrix4(this.matrixWorld);
      const d = _sw.distanceTo(rc.ray.origin), perPx = 2 * d * TAN_H / RH, rad = Math.max(s[3] * FS, minPx * perPx);
      if (rc.ray.distanceSqToPoint(_sw) > rad * rad || blocked(rc.ray, d - 0.1)) continue;
      if (!best || zone !== 'sensor' || d < dist) { zone = 'sensor'; dist = Math.min(d - 0.05, best ? best.distance : d); rc.ray.closestPointToPoint(_sw, _cp); point = _cp.clone(); }
      break;
    }
    if (!zone) {
      cellPt(9.5, 16, 1, _sw).applyMatrix4(this.matrixWorld);
      const d = _sw.distanceTo(rc.ray.origin), perPx = 2 * d * TAN_H / RH, rad = BODY_PX * perPx;
      if (rc.ray.distanceSqToPoint(_sw) <= rad * rad && !blocked(rc.ray, d - 0.1)) { zone = 'body'; dist = d; rc.ray.closestPointToPoint(_sw, _cp); point = _cp.clone(); }
    }
  }
  if (!zone) return;
  this.userData.zone = zone;
  out.push({ distance: dist, point, object: this, face: best ? best.face : null });
}

// =========================================================================================
// HUD LAYER (def.drawHud, hud.js calls it after the play HUD, under the crosshair): the AIMING DOTS (each slides from the
// screen edge on its tagger's side to YOUR crosshair: the mouse crosshair, else the centre; it grows 1 -> 4 px, its core
// whitens, it blinks faster, lock-on brackets close round the crosshair in the last 30 %, a dotted laser sight runs back
// to the phaser's tip) + STAMPS (FRIENDLY FIRE!, FOUL!, QUICK DRAW!, BASE +500!).
// =========================================================================================
const LIVE_TAGS = new Set(), ALL_FIGS = new Set(), BASE_LIVE = new Set();
const STAMPS = [];
function stamp(text, x, y, rows, sc = 2, secs = 0.9) { STAMPS.push({ text, x: clamp(x, 60, RW - 60), y: clamp(y, 18, RH - 70), rows, sc, t0: performance.now(), secs }); if (STAMPS.length > 6) STAMPS.shift(); }
function disc(H, x, y, r, col) {
  x = Math.round(x); y = Math.round(y);
  if (r <= 0) { H.rect(x, y, 1, 1, col); return; }
  for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8)); H.rect(x - w, y + dy, 2 * w + 1, 1, col); }
}
function aimTarget() {
  const I = B.Input, mouse = I && I.mouseIn && !I.touch;
  return [(mouse ? I.aim.u : 0.5) * RW, (mouse ? I.aim.v : 0.5) * RH, mouse ? I.aim.u : 0.5, mouse ? I.aim.v : 0.5];
}
function drawDot(H, d, tx, ty, t) {
  const k = clamp(d.k, 0, 1), e = k * (0.55 + 0.45 * k);
  const x = d.sx + (tx - d.sx) * e, y = d.sy + (ty - d.sy) * e;
  if (d.tip && !d.lock) {                                     // the laser sight: every 4th pixel, back to the phaser tip
    const dx = x - d.tip[0], dy = y - d.tip[1], L = hyp(dx, dy), n = Math.floor(L / 4);
    for (let i = 1; i < n; i++) { const q = i / n; H.rect(Math.round(d.tip[0] + dx * q), Math.round(d.tip[1] + dy * q), 1, 1, (i + ((t * 20) | 0)) % 3 ? 'crimson' : 'red'); }
  }
  if (k < 0.3 && !d.lock && ((t * 10) | 0) & 1) {             // a warning chevron at the edge it comes from
    const ex = d.sx < RW / 2 ? 2 : RW - 7, sy = Math.round(d.sy);
    for (let i = 0; i < 4; i++) H.rect(ex + (d.sx < RW / 2 ? 3 - i : i), sy - 3 + i, 2, 1, 'red'), H.rect(ex + (d.sx < RW / 2 ? 3 - i : i), sy + 3 - i, 2, 1, 'red');
  }
  for (const [b, col] of [[0.12, 'oxblood'], [0.06, 'crimson']]) { const e2 = Math.max(0, e - b); disc(H, d.sx + (tx - d.sx) * e2, d.sy + (ty - d.sy) * e2, k > 0.4 ? 2 : 1, col); }
  const r = d.lock ? 6 + (((t * 16) | 0) & 1) : Math.round(2 + 3.4 * k), blink = (k > 0.65 || d.lock) && ((t * (9 + 16 * k)) | 0) % 2;
  if (k > 0.35 || d.lock) { const rr = r + 3 + (((t * 12) | 0) & 1); for (let a = 0; a < 24; a++) H.rect(Math.round(x + Math.cos(a / 24 * TAU) * rr), Math.round(y + Math.sin(a / 24 * TAU) * rr), 1, 1, a & 1 ? 'crimson' : 'red'); }
  disc(H, x, y, r + 1, 'void'); disc(H, x, y, r, blink ? 'coral' : 'red');
  if (r >= 2) disc(H, x, y, r - 1, k > 0.5 ? 'coral' : 'red');
  if (r >= 3) disc(H, x, y, r - 2, k > 0.3 ? 'bone' : 'coral');
  if (k > 0.7 || d.lock) {                                    // lock-on brackets closing on your crosshair
    const g = d.lock ? 4 : Math.round(4 + 9 * (1 - (k - 0.7) / 0.3)), cx = Math.round(tx), cy = Math.round(ty);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bx = cx + sx * g, by = cy + sy * g;
      H.rect(Math.min(bx, bx - sx * 3) - 1, by - 1, 5, 3, 'void'); H.rect(bx - 1, Math.min(by, by - sy * 3) - 1, 3, 5, 'void');
      H.rect(Math.min(bx, bx - sx * 3), by, 4, 1, 'red'); H.rect(bx, Math.min(by, by - sy * 3), 1, 4, 'red');
    }
  }
}
function drawHud(run, hs, t) {
  const H = B.HUD; if (!H) return;
  const [tx, ty] = aimTarget();
  for (const tg of LIVE_TAGS) {
    if (tg.dot) drawDot(H, tg.dot, tx, ty, t);
    else if (tg.poof) {                                        // a fake's dot cancels: a small ring pops where it was
      const q = (performance.now() - tg.poof.at) / 160; if (q > 1) { tg.poof = null; continue; }
      const r = Math.round(2 + 4 * q); for (let a = 0; a < 12; a++) H.rect(Math.round(tg.poof.x + Math.cos(a / 12 * TAU) * r), Math.round(tg.poof.y + Math.sin(a / 12 * TAU) * r), 1, 1, a & 1 ? 'crimson' : 'red');
    }
  }
  const now = performance.now();
  for (let i = STAMPS.length - 1; i >= 0; i--) {
    const s = STAMPS[i], q = (now - s.t0) / (s.secs * 1000);
    if (q >= 1) { STAMPS.splice(i, 1); continue; }
    if (q > 0.7 && ((now / 60) | 0) & 1) continue;
    H.text7c(s.text, s.x, Math.round(s.y - 6 * q), s.sc, s.rows, 'void', 2);
  }
}

// =========================================================================================
// TARGETS
// =========================================================================================
// THE CHARGE: a dot that landed unshot costs every player still standing a life through the engine's own penalty
// (Run.penaltyNow 'bomb': LIFE -1, -300, the 'bomb' event = shake + LIFE -1 pop + the duck's scared face, 'lifeLost').
// The engine's 'bomb' SOUND is an explosion; for a laser hit it is swapped for 'vestDown' (the vest's power-down buzz)
// for the length of this one synchronous call. Both versus tabs read the same run.taken at the same stage time.
function chargeTag(run) {
  if (!run || run.state !== 'play') return;
  const S = B.SFX, P0 = S && S.play;
  if (P0) S.play = function (n, o) { return P0.call(this, n === 'bomb' ? 'vestDown' : n, o); };
  try { run.players.forEach((P, i) => { if (P.lives > 0) run.penaltyNow(i, 'bomb', null, null); }); }
  finally { if (P0) S.play = P0; }
}
// shot-driven chains (#88 as the range): member i pops REL after the hit on member i-1, the clock schedule as the fallback
const HIT = new WeakMap(), ZONE = new WeakMap(), QUICK = new WeakMap(), SPTL = new WeakMap();
const hitOf = s => HIT.get(s);
function releaseAt(sp, get, hitT) {
  const ch = [sp];
  for (let q = sp; q.chD; ) { q = get(q.id - q.chD); if (!q) break; ch.unshift(q); }
  const A = [ch[0].t0 + (ch[0].chD ? ch[0].chR || 0 : 0)];
  for (let j = 1; j < ch.length; j++) {
    const m = ch[j], h = hitT(ch[j - 1]);
    let a = A[j - 1] + m.chS;
    if (h != null) a = Math.min(a, h + m.chX);
    if (m.chF && j >= m.chF) { const o = ch[j - m.chF], ho = hitT(o), gone = A[j - m.chF] + o.out + o.ex; a = Math.max(a, ho != null ? Math.min(ho + FOLD_T, gone) : gone); }
    A.push(Math.max(m.t0, Math.min(a, m.t0 + m.chR)));
  }
  return A[A.length - 1];
}
const relOffOf = (sp, tl) => sp.chD && tl ? releaseAt(sp, id => tl[id], hitOf) - sp.t0 : 0;
const FIG_SND = { tag: 'red', mate: 'green' };
class Fig extends T.Target {
  constructor(sp, run) {
    super(sp.who === 'tag' ? 'target' : 'bystander');
    this.sp = sp; this.run = run; this.P = {}; this.l = -1; this.deadL = -1; this.fired = false; this.charged = false; this.said = false; this.beeps = -1;
    this.dot = null; this.poof = null;
    const G = figGeos();
    this.mat = figMat();
    this.mesh = new THREE.Mesh(G[this.geoKey(sp.who === 'tag' ? 'up' : sp.who === 'ref' ? 'ref0' : sp.act)], this.mat);
    this.mesh.userData.sharedGeo = true; this.mesh.userData.target = this; this.mesh.raycast = figRaycast;
    this.pivot = new THREE.Group(); this.group.add(this.pivot); this.pivot.add(this.mesh);
    this.group.visible = false;
    if (sp.who === 'tag') LIVE_TAGS.add(this); ALL_FIGS.add(this);
  }
  geoKey(fr) { const sp = this.sp; return sp.who === 'mate' ? 'mate_' + fr + '_' + (sp.look | 0) : sp.who === 'ref' ? fr : 'tag_' + fr; }
  meshes() { return [this.mesh]; }
  worldOf(x, y, z, out) { this.mesh.updateWorldMatrix(true, false); return cellPt(x, y, z, out).applyMatrix4(this.mesh.matrixWorld); }
  screenOf(x, y, z) { const p = R.toPx(this.worldOf(x, y, z, _v3)); return p; }
  update(lt, run) {
    this.run = run;
    const sp = this.sp, l = lt - relOffOf(sp, run.timeline); this.l = l;
    if (!this.alive) return this.after(l, run);
    const P = figPose(sp, l, this.P);
    if (P.done) { this.group.visible = false; this.shootable = false; this.dot = null; return true; }
    this.group.visible = P.vis; this.group.position.set(P.x, P.y, P.z);
    this.pivot.rotation.set(P.rx, 0, P.rz); this.pivot.scale.set(P.mir, P.sy, 1);
    const g = figGeos()[this.geoKey(P.frame)]; if (g && this.mesh.geometry !== g) this.mesh.geometry = g;
    const u = this.mat.uniforms;
    if (P.vis && !this.said) {
      this.said = true; const ux = uOfX(scr(P.x, P.y + 1, P.z)[0]);
      if (sp.who === 'ref') { B.SFX.play('refWhistle', { u: ux }); }
      else B.SFX.play('taggerIn', { u: ux, team: FIG_SND[sp.who] });
    }
    if (sp.who === 'tag') this.updateTag(l, run, P, u);
    this.shootable = P.shoot && P.vis && !this.fired;
    return false;
  }
  updateTag(l, run, P, u) {
    const sp = this.sp;
    u.uTip.value = P.dot >= 0 ? 1 + 0.9 * P.dot * (0.6 + 0.4 * Math.sin(l * 40)) : (this.fired ? 0.6 + 2.0 * Math.max(0, 1 - (l - sp.fire) / 0.15) : P.frame === 'aim' ? 0.95 : 0.7);
    if (P.dot >= 0) {
      if (!this.dot) {
        // it comes in from the screen edge on the tagger's side, at the height whose path to the middle stays clearest of
        // the tagger itself (the dot is drawn over everything: it must never sit on the sensor you need to shoot)
        const c = this.screenOf(9.5, 18, 4.6), side = c[0] < RW / 2 ? -1 : 1, sx = side < 0 ? 3 : RW - 4;
        let sy = c[1], best = -1;
        for (let y = 16; y <= RH - 56; y += 8) {
          const dx = RW / 2 - sx, dy = RH / 2 - y, L2 = dx * dx + dy * dy, q = clamp(((c[0] - sx) * dx + (c[1] - y) * dy) / L2, 0, 1);
          const dist = hyp(sx + dx * q - c[0], y + dy * q - c[1]), sc = Math.min(dist, 42) - Math.abs(y - c[1]) * 0.05;
          if (sc > best) { best = sc; sy = y; }
        }
        this.dot = { sx, sy, k: 0, tip: null, lock: false };
      }
      this.dot.k = P.dot; const tp = TIPS.aim; this.dot.tip = this.screenOf(tp[0], tp[1], tp[2]);
      const n = Math.min(5, Math.floor(P.dot * 6));
      if (n > this.beeps) { this.beeps = n; B.SFX.play('dotCharge', { u: uOfX(this.dot.sx), k: n }); }
    } else if (this.fired && !this.charged) { if (this.dot) { this.dot.k = 1; this.dot.lock = true; } }
    else if (this.dot) {
      if (P.cancelled) { const [tx, ty] = aimTarget(), e = this.dot.k * (0.55 + 0.45 * this.dot.k); this.poof = { x: this.dot.sx + (tx - this.dot.sx) * e, y: this.dot.sy + (ty - this.dot.sy) * e, at: performance.now() }; }
      this.dot = null;
    }
    if (!sp.fake && !this.fired && l >= sp.fire) { this.fired = true; this.fireL = sp.fire + (run.versus ? VS_GRACE : 0); this.shootable = false; }
    if (this.fired && !this.charged && l >= this.fireL) { this.charged = true; this.dot = null; if (!run.taken.has(sp.id)) this.zap(run, true); }
  }
  // the dot landed: the red beam at you, the flash, the hearts go dark, the life
  zap(run, beam) {
    const sp = this.sp, [, , u, v] = aimTarget();
    if (beam) {
      const tp = TIPS.aim, w = this.worldOf(tp[0], tp[1], tp[2], new THREE.Vector3());
      if (B.FX && B.FX.beam) B.FX.beam(w, u, v, ENEMY_BEAM, 0.55);
      for (let k = 0; k < 8; k++) spark(w.x, w.y, w.z, rnd(-1.2, 1.2), rnd(-0.4, 1.4), rnd(0, 1.5), 0.04, PAL[['red', 'coral', 'bone'][k % 3]], 0.25, 0.2, 2);
      B.SFX.play('taggerFire', { u: uOfX(this.screenOf(tp[0], tp[1], tp[2])[0]) });
    }
    FLASH.k = 0.78; if (B.HUD) B.HUD.heartsOff = performance.now() + 520;
    chargeTag(run);
  }
  // tagged: the vest chirps off and blinks out, the tagger slumps back behind the cover
  shatter(point, opts) {
    if (!this.alive) return;
    const sp = this.sp, zone = ZONE.get(sp) || 'body';
    this.alive = false; this.shootable = false; this.deadL = this.l; this.dot = null; this.deadP = Object.assign({}, this.P);
    const p = point || this.worldOf(9.5, 18, 4.6, new THREE.Vector3()), sc = R.toPx(p);
    burstAt(p, zone === 'sensor' ? ['coral', 'red', 'bone', 'lemon'] : ['red', 'crimson', 'coral'], zone === 'sensor' ? 16 : 10, 2.2, 0.035, 0.45);
    if (opts && opts.tint != null) for (let k = 0; k < 6; k++) spark(p.x, p.y, p.z, rnd(-1.5, 1.5), rnd(0, 2), rnd(0, 1), 0.04, opts.tint, 0.4, 0.3, 1);
    B.SFX.play('tagHit', { u: uOfX(sc[0]), zone });
    if (QUICK.get(sp)) stamp('QUICK DRAW!', sc[0], sc[1] - 26, 'gold', 1, 0.8);
    this.group.visible = true;
  }
  // a teammate / the ref was shot (Run.penaltyNow -> explode): FRIENDLY FIRE! (or FOUL!), a hop, the vest buzzes, gone
  explode(point) {
    if (!this.alive) return;
    const sp = this.sp, ref = sp.who === 'ref';
    this.alive = false; this.shootable = false; this.deadL = this.l; this.deadP = Object.assign({}, this.P); this.ff = true;
    const p = point || this.worldOf(9.5, 18, 4.6, new THREE.Vector3()), sc = R.toPx(p);
    burstAt(p, ref ? ['bone', 'lemon', 'mist'] : ['lime', 'green', 'bone'], 14, 2.0, 0.035, 0.5);
    B.SFX.play(ref ? 'refWhistle' : 'friendlyFire', { u: uOfX(sc[0]), foul: ref });
    if (ref) B.SFX.play('friendlyFire', { u: uOfX(sc[0]) });
    stamp(ref ? 'FOUL!' : 'FRIENDLY FIRE!', RW / 2, 64, 'red', 2, 1.1);
    this.group.visible = true;
  }
  after(l, run) {
    const sp = this.sp, u = this.mat.uniforms, q = l - this.deadL, D = this.deadP || this.P;
    // versus: a tagger shattered here but never awarded (the host gave it to nobody) still fires: run.taken decides
    if (sp.who === 'tag' && !sp.fake && !this.charged && l >= sp.fire + (run.versus ? VS_GRACE : 0)) { this.charged = true; if (!run.taken.has(sp.id)) this.zap(run, false); }
    u.uVest.value = q < 0.32 ? ((((q * 34) | 0) & 1) ? 1.25 : 0.1) : 0.06;
    u.uTip.value = 0; u.uDim.value = 1 - 0.3 * clamp(q / 0.4, 0, 1);
    u.uFlash.value = q < 0.06 ? 0.55 : 0;
    const S = sp.who === 'ref' ? null : SPOTS[sp.spot], down = sstep((q - 0.18) / 0.4);
    let x = D.x, y = D.y, z = D.z;
    if (this.ff) y += 0.32 * Math.sin(Math.PI * clamp(q / 0.36, 0, 1));
    if (!S) { this.pivot.scale.set(D.mir, 1 - 0.85 * down, 1); }
    else if (S.type === 'rise' || S.type === 'win') y += (S.y + S.hy - D.y) * down;
    else if (S.type === 'lean' || S.type === 'slide') x += (S.hx - D.x) * down;
    else if (S.type === 'drop') { this.pivot.scale.set(D.mir, 1 - 0.85 * down, 1); }
    this.group.position.set(x, y, z);
    this.pivot.rotation.set(this.ff ? 0 : -0.55 * E.outCubic(clamp(q / 0.35, 0, 1)), 0, (D.rz || 0) + (this.ff ? 0.2 * Math.sin(q * 30) * (1 - clamp(q / 0.4, 0, 1)) : 0.12));
    return q > FOLD_T;
  }
  dispose() { LIVE_TAGS.delete(this); ALL_FIGS.delete(this); figMatBack(this.mat); this.mat = null; super.dispose(); }
}
const ENEMY_BEAM = { T: 0.07, fade: 0.16, layers: [{ len: Infinity, w: 5, cols: ['crimson', 'oxblood'] }, { len: Infinity, w: 3, cols: ['red', 'crimson'] }, { len: Infinity, w: 1.2, cols: ['bone', 'coral', 'red'] }] };

// ---------- THE BASE: the shutter rides up (siren, beacon, the ring lamps chase), hit the core = +500 ----------
const BASE_IN = 0.3, BASE_OUT = 0.3, BASE_PX = 9;
function baseRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable) return;
  _sw.set(BASE_C[0], BASE_C[1], BASE_C[2] + 0.1);
  const d = _sw.distanceTo(rc.ray.origin), perPx = 2 * d * TAN_H / RH, rad = Math.max(BASE_R, BASE_PX * perPx);
  if (rc.ray.distanceSqToPoint(_sw) > rad * rad) return;
  rc.ray.closestPointToPoint(_sw, _cp); this.userData.zone = 'core';
  out.push({ distance: d, point: _cp.clone(), object: this });
}
class Base extends T.Target {
  constructor(sp) {
    super('target'); this.sp = sp; this.l = 0; this.deadL = -1; this.said = false;
    this.proxy = new THREE.Mesh(NOHIT_GEO, NOHIT_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this; this.proxy.raycast = baseRaycast;
    this.group.add(this.proxy); BASE_LIVE.add(this);
  }
  meshes() { return [this.proxy]; }
  update(lt) {
    const sp = this.sp, st = sp.stay; this.l = lt;
    if (!this.said && lt >= 0) { this.said = true; B.SFX.play('baseOpen', { u: uOfX(scr(BASE_C[0], BASE_C[1], BASE_C[2])[0]) }); sbAlert('BASE OPEN', st + 0.5); }
    let open = lt < 0 ? 0 : lt < BASE_IN ? lt / BASE_IN : lt < BASE_IN + st ? 1 : Math.max(0, 1 - (lt - BASE_IN - st) / BASE_OUT);
    if (!this.alive) open = Math.max(0, this.openAt - (lt - this.deadL) / 0.12);
    baseSet(open, lt, this.alive);
    if (this.alive && open > 0.3 && Math.random() < 0.3) spark(7.35 + rnd(-0.2, 0.2), 5.0, -12.7, rnd(-0.5, 0.5), rnd(0.2, 0.8), 0.5, 0.04, PAL.red, 0.3, 0.2);
    this.shootable = this.alive && lt >= BASE_IN * 0.6 && lt < BASE_IN + st;
    return this.alive ? lt >= BASE_IN + st + BASE_OUT : lt - this.deadL > 0.7;
  }
  shatter(point) {
    if (!this.alive) return;
    this.alive = false; this.shootable = false; this.deadL = this.l; this.openAt = BASE_OBJ.open;
    const p = new THREE.Vector3(BASE_C[0], BASE_C[1], BASE_C[2] + 0.3), sc = R.toPx(p);
    burstAt(p, ['bone', 'lemon', 'coral', 'red', 'orange'], 46, 4.5, 0.09, 0.8, 0.15);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; spark(p.x, p.y, p.z, Math.cos(a) * 4, Math.sin(a) * 4, 0.6, 0.07, PAL.red, 0.5, 0, 1.5); }
    B.SFX.play('baseHit', { u: uOfX(sc[0]) }); sbMsg('BASE +500', 1.6);
    stamp('BASE +500!', sc[0], sc[1] + 34, 'gold', 2, 1.1);
    if (B.G && B.G.shakeIt) B.G.shakeIt(0.2);
  }
  dispose() { BASE_LIVE.delete(this); if (!BASE_LIVE.size) baseSet(0, 0, true); super.dispose(); }
}

// ---------- THE DIRECTOR (kind 'fx', t0 0): GAME ON, the fog (a pure function of the clock), the finale, holds the stage ----------
const FIN_HOLD = 4.2, FIN_SLOT = 4.6, FOG_IN = 0.7, FOG_OUT = 1.1;
function hazeAt(fogs, t) {
  let h = 0;
  for (const [a, b] of fogs) { if (t < a || t > b + FOG_OUT) continue; h = Math.max(h, t < a + FOG_IN ? (t - a) / FOG_IN : t <= b ? 1 : 1 - (t - b) / FOG_OUT); }
  return sstep(h);
}
const FIN_CAST = [['h1', 'tag'], ['h3', 'tag'], ['h5', 'tag'], ['n1', 'tag'], ['n3', 'tag'], ['v1', 'mate'], ['v2', 'mate'], ['v3', 'mate'], ['v4', 'mate'], ['ref', 'ref']];
class Director extends T.Target {
  constructor(sp) {
    super('fx'); this.sp = sp; this.said = false; this.fin = -1; this.blast = 0; this.cast = null; this.shootable = false;
    pxClear(); STAMPS.length = 0; STAGE.fin = -1; STAGE.haze = 0; U.uSign.value = 0;
  }
  meshes() { return []; }
  update(lt, run) {
    const sp = this.sp;
    if (!this.said && lt >= 0) { this.said = true; B.SFX.play('gameOn'); sbMsg('GAME ON!', 1.3); }
    STAGE.haze = hazeAt(sp.fogs, lt);
    while (this.blast < sp.fogs.length && lt >= sp.fogs[this.blast][0]) {
      const f = sp.fogs[this.blast++];
      if (lt - f[0] < 0.5) { fogBlast(); B.SFX.play('fogBurst', { u: 0.1 }); sbAlert('FOG!', 2.2); }
    }
    if (this.fin < 0 && lt >= sp.last && run.state === 'play' && (run.versus || run.quotaMet)) { this.fin = lt; this.startFinale(); B.SFX.play('finale'); }
    if (this.fin >= 0) { this.stepFinale(lt - this.fin); return lt >= this.fin + FIN_HOLD; }
    return lt >= sp.last;
  }
  startFinale() {
    STAGE.fin = 0; STAGE.finT = 0; const G = figGeos();
    this.cast = FIN_CAST.map(([sid, who], i) => {
      const m = new THREE.Mesh(G[who === 'tag' ? 'tag_up' : who === 'ref' ? 'ref0' : 'mate_wave1_' + (i & 1)], figMat()); m.userData.sharedGeo = true; m.raycast = () => {};
      const S = who === 'ref' ? { x: 2.7, y: 0, z: REF_Z, hy: -2.2, type: 'ref' } : SPOTS[SPOT_I[sid]];
      R.scene.add(m); return { m, S, who, d: i * 0.07 };
    });
  }
  stepFinale(q) {
    STAGE.finT = q; U.uSign.value = q < 0.3 ? q / 0.3 : q > FIN_HOLD - 0.6 ? Math.max(0, (FIN_HOLD - q) / 0.6) : 0.65 + 0.35 * Math.sin(q * 9);
    // each glyph of B.L.A.M. entering the board = a beat: every vest flashes and hops on it
    const t = R.bold('B.L.A.M.'), beats = [];
    { let last = -1; for (const [px, , ci] of t.px) if (ci !== last) { last = ci; beats.push((SB_P.W - 47 + px) / 18); } }
    let beat = 0; for (const b of beats) { const d = q - b; if (d >= 0 && d < 0.18) beat = Math.max(beat, 1 - d / 0.18); }
    if (q > 3.0 && q < FIN_HOLD - 0.6) beat = Math.max(beat, ((q * 4) | 0) & 1 ? 0.8 : 0);
    for (const c of this.cast) {
      const k = clamp((q - c.d) / 0.3, 0, 1), out = sstep((q - (FIN_HOLD - 0.55)) / 0.4), e = E.outBack(k) * (1 - out), S = c.S;
      let x = S.x, y = S.y, z = S.z;
      if (S.type === 'lean' || S.type === 'slide') x = S.hx + (S.x - S.hx) * e; else y = S.y + (S.hy || -1.3) * (1 - e);
      y += 0.18 * beat * e;
      c.m.position.set(x, y, z); c.m.visible = k > 0;
      if (c.who === 'mate') c.m.geometry = figGeos()[(((q * 5) | 0) & 1 ? 'mate_wave2_' : 'mate_wave1_') + (FIN_CAST.indexOf(FIN_CAST.find(f => f[0] === S.id)) & 1)] || c.m.geometry;
      const u = c.m.material.uniforms; u.uVest.value = 0.35 + 1.1 * beat; u.uFlash.value = 0.3 * beat; u.uTip.value = c.who === 'tag' ? 0.6 + beat : 0.8;
    }
  }
  dispose() {
    if (this.cast) for (const c of this.cast) { R.scene.remove(c.m); figMatBack(c.m.material); }
    this.cast = null; STAGE.fin = -1; STAGE.haze = 0; U.uSign.value = 0; super.dispose();
  }
}
// the fog machine blasts: puffs from the back-left machine + off-screen right, rolling toward the middle
function fogBlast() {
  for (let k = 0; k < 40; k++) spark(-7.3, 0.32, -8.35, rnd(1.5, 5), rnd(0.2, 1.2), rnd(-0.6, 1.2), rnd(0.1, 0.22), PAL[['mist', 'haze', 'steel', 'slate'][k % 4]], rnd(0.8, 1.5), -0.02, 1.4, 1.4);
  for (let k = 0; k < 30; k++) spark(10.2, 0.4, rnd(-7, -3), rnd(-5, -1.5), rnd(0.2, 1.0), rnd(-0.5, 0.5), rnd(0.1, 0.22), PAL[['mist', 'haze', 'steel'][k % 3]], rnd(0.8, 1.4), -0.02, 1.4, 1.4);
}
function makeTarget(sp, run) {
  if (sp.kind === 'dir') return new Director(sp, run);
  if (sp.kind === 'base') return new Base(sp, run);
  return new Fig(sp, run);
}

// =========================================================================================
// The dials per tier (variant 0). time = the director's stream s | slide = THE DIAL: s the aiming dot takes from the
// screen edge to your crosshair | raise = s from fully up to the dot appearing | up = the pop-up s (x ENTER_K per spot
// type) | live = taggers with a dot (or about to) at once | gap / burst / bgap / pause = the beat stream | hop / alt /
// adj = AIM TRAVEL (share of the screen diagonal, other-side weight, keep-off radius) | green = a single is a teammate,
// fake = a single is a fake, same = a teammate takes the spot a tagger just used (x green), other = the next one leans
// out of the other side of the same wall, pair = two pops at once where one is green | trick, beat, pp (s between pops
// in a row / ping-pong), wallG = greens in a wall [min, max] | refP = the referee strolls (once) / refDur s | fogs = fog
// bursts, fogDur [s] | bases = base openings [min, max], baseStay s | mateStay / fakeStay [s] | share = quota share of
// the firing taggers | rel = the reach-for-reload the pacing allows (magazine variants).
// =========================================================================================
const TIER_P = [
  { time: 44, slide: 1.6, raise: 0.42, up: 0.3, live: 3, gap: [0.8, 1.3], burst: 0.22, bgap: [0.4, 0.6], pause: [0.8, 1.2], hop: [0.1, 0.28], alt: 0.25, adj: 0.1,
    green: 0.13, fake: 0.08, same: 0.25, other: 0.25, pair: 0.12, trick: 0.24, beat: 0.9, pp: 0.95, wallG: [1, 1], refP: 0.55, refDur: 5.0,
    fogs: 2, fogDur: [3.4, 4.4], bases: [1, 1], baseStay: 2.6, mateStay: [1.1, 1.5], fakeStay: [0.55, 0.75], share: 0.55, rel: 0.75 },
  { time: 40, slide: 1.2, raise: 0.36, up: 0.27, live: 3, gap: [0.95, 1.45], burst: 0.26, bgap: [0.35, 0.52], pause: [0.8, 1.2], hop: [0.22, 0.42], alt: 0.45, adj: 0.12,
    green: 0.17, fake: 0.1, same: 0.32, other: 0.3, pair: 0.16, trick: 0.3, beat: 0.78, pp: 0.8, wallG: [1, 1], refP: 0.6, refDur: 4.6,
    fogs: 2, fogDur: [3.4, 4.6], bases: [1, 2], baseStay: 2.3, mateStay: [1.0, 1.35], fakeStay: [0.5, 0.7], share: 0.6, rel: 0.7 },
  { time: 36, slide: 0.9, raise: 0.3, up: 0.24, live: 3, gap: [1.05, 1.55], burst: 0.3, bgap: [0.3, 0.45], pause: [0.75, 1.1], hop: [0.36, 0.6], alt: 0.65, adj: 0.14,
    green: 0.21, fake: 0.12, same: 0.4, other: 0.35, pair: 0.2, trick: 0.35, beat: 0.66, pp: 0.68, wallG: [1, 2], refP: 0.65, refDur: 4.2,
    fogs: 3, fogDur: [3.2, 4.6], bases: [1, 2], baseStay: 2.0, mateStay: [0.9, 1.2], fakeStay: [0.45, 0.62], share: 0.64, rel: 0.62 },
  { time: 32, slide: 0.6, raise: 0.24, up: 0.2, live: 3, gap: [1.25, 1.75], burst: 0.34, bgap: [0.24, 0.36], pause: [0.7, 1.0], hop: [0.5, 0.82], alt: 0.85, adj: 0.16,
    green: 0.26, fake: 0.14, same: 0.48, other: 0.4, pair: 0.26, trick: 0.4, beat: 0.56, pp: 0.58, wallG: [2, 2], refP: 0.7, refDur: 3.8,
    fogs: 3, fogDur: [3.0, 4.4], bases: [2, 2], baseStay: 1.8, mateStay: [0.8, 1.05], fakeStay: [0.4, 0.55], share: 0.68, rel: 0.55 }
];
const VARIANT_NAMES = ['TEAM GREEN', 'QUICK DRAW', 'BLACKOUT'];
const PTS_SENSOR = 300, PTS_BODY = 100, PTS_QUICK = 50, PTS_BASE = 500;
const estCache = {};
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  if (v === 1) c.slide = +(b.slide * 0.8).toFixed(3);            // QUICK DRAW: the dots come 25 % faster
  if (v === 2) c.blackout = true;                                // BLACKOUT: fog most of the round
  c.ammo = ['unlimited', { mag: 8, reloadTime: b.rel, autoReload: false }, { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: false }][v];
  c.autoReload = false; c.patterns = true; c.fog = true; c.base = true; c.ref = true; c.fakes = true;   // every mechanic at every tier
  c.tier = tier; c.variant = v; c.title = 'LASER TAG'; c.subtitle = VARIANT_NAMES[v];
  c.stream = c.time; c.quota = 8;
  const key = tier + '|' + v;
  if (!estCache[key]) { const est = Object.assign({ estimate: true }, c); timeline(est, B.Stage.mulberry32(0x5eed)); estCache[key] = [est.time, est.quota]; }
  c.time = estCache[key][0]; c.quota = estCache[key][1];
  return c;
}

// ---------- THE DIRECTOR (timeline): every spawn from the seeded rng only ----------
// Figure spawn ('fig'): id, t0, t1, who 'tag' | 'mate' | 'ref', spot (SPOTS index), mir, up (enter s), out (exit starts),
// ex (exit s), readyAt; taggers: aim (the dot appears), slide, fire (the dot lands = THE FIRE, local time), fake ('duck' =
// no dot, 'cancel' = a dot that cancels at `cancel`); teammates: act ('wave1' | 'thumb'), look (hair); vault; patterns:
// fm (id), fk ('R' row, 'V' vault, 'H' high ground, 'F' flanker, 'X' wall, 'P' ping-pong, 'D' drop), fi; shot-driven
// members: chD / chS / chX / chF / chR (see releaseAt). The ref: xa -> xb along z REF_Z in dur s. 'base': stay.
// 'dir' (t0 0): fogs [[start, end]...], last.
const isReq = s => s.kind === 'fig' && s.who === 'tag' && !s.fake;
function timeline(c, rng) {
  const out = [], tier = c.tier | 0, TIME = c.stream;
  rng(); rng(); rng();
  const dir = { id: 0, t0: 0, t1: 0, kind: 'dir', fogs: [], last: 0 };
  out.push(dir);
  const figs = [], recent = [], magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0;
  let lastAim = [RW / 2, RH * 0.55], lastTagSpot = -1, fmN = 0, trickN = 0, lastTrick = '', firstRow = true;
  const tricks = { R: 0, V: 0, H: 0, F: 0, X: 0, P: 0, D: 0 };
  function mkFig(t, who, spot, o = {}) {
    const S = SPOTS[spot], up = F3(c.up * (ENTER_K[S.type] || 1));
    const sp = { id: 0, t0: F3(t), t1: 0, kind: 'fig', who, spot, mir: S.dir < 0 ? 1 : 0, up, readyAt: READY };
    if (who === 'tag') {
      sp.aim = F3(up + c.raise + (o.aimX || 0)); sp.slide = F3(c.slide * (o.slideK || 1));
      if (o.fake) {
        sp.fake = o.fake;
        if (o.fake === 'cancel') { sp.cancel = F3(sp.aim + sp.slide * 0.38); sp.out = F3(sp.cancel + 0.1); }
        else sp.out = F3(up + rng.range(c.fakeStay[0], c.fakeStay[1]));
      } else { sp.fire = F3(sp.aim + sp.slide); sp.out = F3(sp.fire + SHOOT_T); }
    } else { sp.act = o.act || (rng() < 0.62 ? 'wave1' : 'thumb'); sp.look = o.look != null ? o.look : rng.int(0, 1); sp.out = F3(up + (o.stay || rng.range(c.mateStay[0], c.mateStay[1]))); }
    if (o.vault) sp.vault = 1;
    sp.ex = F3(EXIT_K[S.type] * c.up + 0.1);
    if (o.fm) { sp.fm = o.fm; sp.fk = o.fk; sp.fi = o.fi; }
    sp.t1 = F3(sp.t0 + sp.out + sp.ex + 0.05);
    return sp;
  }
  const retime = sp => { sp.fire = F3(sp.aim + sp.slide); sp.out = F3(sp.fire + SHOOT_T); sp.t1 = F3(sp.t0 + sp.out + sp.ex + 0.05); };
  function fits(sp) {
    for (const o of figs) {
      if (o === sp) continue;
      const a0 = Math.max(sp.t0, o.t0), a1 = Math.min(sp.t1, o.t1); if (a1 <= a0) continue;
      if (sp.who !== 'ref' && o.who !== 'ref') { if (CONF[sp.spot][o.spot]) return false; continue; }
      for (let t = a0; t < a1; t += 0.1) { const A = rectAt(sp, t), Bq = rectAt(o, t); if (A && Bq && ovl(A, Bq, 3)) return false; }
    }
    return true;
  }
  function book(sp) {
    figs.push(sp); out.push(sp);
    if (sp.who !== 'ref') { recent.push(sp.spot); if (recent.length > 3) recent.shift(); }
    if (sp.who === 'tag') { lastTagSpot = sp.spot; lastAim = SPOTS[sp.spot].aimPt; }
  }
  const popAt = f => f.t0 + (f.chR || 0);
  const tagsUp = t => figs.filter(f => f.who === 'tag' && popAt(f) <= t && t < popAt(f) + (f.fake ? f.out : f.fire));
  const upAt = t => figs.filter(f => f.t0 <= t && t < f.t1);
  // AIM TRAVEL single: the free spot whose aim point is closest to the wanted hop from the last tagger you were made to
  // aim at, preferring the other side, never next to a figure already up (+2), not the last few spots (variety)
  function single(t, o = {}) {
    const want = rng.range(c.hop[0], c.hop[1]) * DIAG, r = rng(), r2 = rng();
    let who = o.who || 'tag', fake = '', force = -1;
    if (!o.who) {
      if (lastTagSpot >= 0 && r < c.green * c.same * 2.2) { who = 'mate'; force = lastTagSpot; }                       // green in the spot a tagger just used
      else if (lastTagSpot >= 0 && SPOTS[lastTagSpot].pairI != null && r2 < c.other) force = SPOTS[lastTagSpot].pairI;  // the other side of the same wall
      else if (r < c.green) who = 'mate';
      else if (r < c.green + c.fake) fake = r2 < 0.55 ? 'duck' : 'cancel';
    }
    const up = upAt(t + 0.2), cands = [];
    for (let i = 0; i < SPOTS.length; i++) {
      const S = SPOTS[i]; if (S.trick || (force >= 0 && i !== force)) continue;
      const sp = mkFig(t, who, i, { fake });
      if (!fits(sp)) continue;
      const q = S.aimPt, d = hyp(q[0] - lastAim[0], q[1] - lastAim[1]);
      let sc = Math.abs(d - want) / DIAG + rng() * 0.05;
      if (Math.abs(q[0] - RW / 2) > 20 && (q[0] - RW / 2) * (lastAim[0] - RW / 2) > 0) sc += c.alt * 0.35;
      for (const f of up) { const A = rectAt(f, t + 0.3); if (A && ovl(A, S.rect, c.adj * DIAG)) sc += 2; }
      if (force < 0 && recent.includes(i)) sc += 0.3;
      cands.push([sc, i, sp]);
    }
    if (!cands.length) return force >= 0 && !o.retry ? single(t, { who: who === 'mate' && force >= 0 ? 'tag' : who, retry: true }) : null;
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const sp = cands[0][2]; book(sp); return sp;
  }
  // a pattern: members built with their clock schedule; all fit or none is booked
  const commit = mem => {
    for (let i = 0; i < mem.length; i++) {
      const s = mem[i]; if (!fits(s)) return false;
      for (let j = 0; j < i; j++) { const o = mem[j]; if (Math.min(s.t1, o.t1) > Math.max(s.t0, o.t0) && CONF[s.spot][o.spot]) return false; }   // members never share a slot at once
    }
    mem.forEach(book); return true;
  };
  // #88 SHOT-DRIVEN: member i keeps its schedule as the fallback (chR) and pops REL_LEAD (+ an off beat's extra) after the
  // hit on member i-1 at the earliest; chF = slot reuse (ping-pong: the member two back must be gone first)
  const chains = [];
  function shotDriven(mem, base, slotBack) { chains.push({ mem, base, slotBack }); }
  function trick(t) {
    const K = ['R', 'V', 'H', 'F', 'X', 'P', 'D'], W = [1.4, 1.0, 1.0, 0.8, 0.6, 0.8, 0.6].map((w, i) => w * (K[i] === lastTrick ? 0.2 : 1) * (tricks[K[i]] >= 2 ? 0.3 : 1));
    let x = rng() * W.reduce((a, b) => a + b, 0), k = 'R'; for (let i = 0; i < K.length; i++) { if ((x -= W[i]) < 0) { k = K[i]; break; } }
    const fm = ++fmN, rs = [rng(), rng(), rng(), rng(), rng()], mem = [];
    let base = c.beat, sd = false, slotBack = 0;
    if (k === 'R') {                                         // a ROW of windows (or catwalk spots) on a beat; later rows: a green on the beat / off beat
      const win = rs[0] < 0.55, ids = win ? ['n1', 'n2', 'n3'] : (() => { const n = rng.int(3, 4), s0 = rng.int(0, 5 - n); return ['h1', 'h2', 'h3', 'h4', 'h5'].slice(s0, s0 + n); })();
      const order = rs[1] < 0.5 ? ids : ids.slice().reverse(), kind = firstRow ? 'clean' : rs[2] < 0.3 ? 'clean' : rs[2] < 0.7 ? 'green' : 'off';
      const bad = kind === 'green' ? rng.int(1, order.length - 1) : -1, off = kind === 'off' ? rng.int(1, order.length - 1) : -1, offK = rs[3] < 0.5 ? 0.45 : 1.8;
      let tt = t;
      order.forEach((id, i) => { if (i) tt += i === off ? c.beat * offK : c.beat; mem.push(mkFig(tt, i === bad ? 'mate' : 'tag', SPOT_I[id], { fm, fk: 'R', fi: i })); });
      firstRow = false; sd = true;
    } else if (k === 'V') {                                  // the VAULT line over the barrels, a hop each; the last one green sometimes
      const order = rs[0] < 0.5 ? ['v1', 'v2', 'v3', 'v4'] : ['v4', 'v3', 'v2', 'v1'], bad = rs[1] < 0.25 + 0.05 * tier ? 3 : -1;
      base = c.beat * 0.85;
      order.forEach((id, i) => mem.push(mkFig(t + i * base, i === bad ? 'mate' : 'tag', SPOT_I[id], { fm, fk: 'V', fi: i, vault: true })));
      sd = true;
    } else if (k === 'H') {                                  // HIGH GROUND: 2-3 on the catwalk, staggered dots; one green among 3 sometimes
      const n = rs[0] < 0.5 ? 2 : 3, pool = ['h1', 'h2', 'h3', 'h4', 'h5'], pick = [];
      while (pick.length < n) { const id = pool.splice(rng.int(0, pool.length - 1), 1)[0]; pick.push(id); }
      pick.sort();
      const green = n === 3 && rs[1] < 0.3 + 0.08 * tier ? rng.int(0, 2) : -1;
      pick.forEach((id, i) => mem.push(mkFig(t + i * rng.range(0.15, 0.3), i === green ? 'mate' : 'tag', SPOT_I[id], { fm, fk: 'H', fi: i, aimX: i * 0.4 })));
    } else if (k === 'F') {                                  // the FLANKER from the screen edge (a second one from the other edge at Very Hard+)
      const s0 = rs[0] < 0.5 ? 'fl' : 'fr', s1 = s0 === 'fl' ? 'fr' : 'fl';
      mem.push(mkFig(t, rs[1] < 0.15 ? 'mate' : 'tag', SPOT_I[s0], { fm, fk: 'F', fi: 0 }));
      if (tier >= 2 && rs[2] < 0.35) mem.push(mkFig(t + 0.35, 'tag', SPOT_I[s1], { fm, fk: 'F', fi: 1, aimX: 0.25 }));
    } else if (k === 'X') {                                  // THE WALL: 4-5 at once, greens among them, the dots one after another
      const n = rs[0] < 0.5 ? 4 : 5, order = SPOTS.map((S, i) => i).filter(i => !SPOTS[i].trick);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
      const pick = [];
      for (const i of order) { if (pick.length >= n) break; if (pick.every(j => !CONF[i][j] && !ovl(SPOTS[i].rect, SPOTS[j].rect, 8))) pick.push(i); }
      if (pick.length < 4) return 0;
      pick.sort((a, b) => SPOTS[a].aimPt[0] - SPOTS[b].aimPt[0]);
      const ng = rng.int(c.wallG[0], c.wallG[1]), greens = new Set(); while (greens.size < ng) greens.add(rng.int(0, pick.length - 1));
      const stag = 0.52 - 0.02 * tier; let a = 0;     // the dots one after another: a perfect player can take them in turn
      pick.forEach((i, q) => { const g = greens.has(q); mem.push(mkFig(t + rng.range(0, 0.08), g ? 'mate' : 'tag', i, { fm, fk: 'X', fi: q, aimX: g ? 0 : a * stag, stay: 1.2 + 0.3 * pick.length })); if (!g) a++; });
    } else if (k === 'P') {                                  // PING-PONG between two cover spots, then a green takes the next slot
      const pr = PAIRS[rng.int(0, PAIRS.length - 1)], n = rng.int(4, 6);
      base = c.pp;
      let tt = t;                                            // the clock schedule: on the beat, but a slot only once its last occupant is gone
      for (let i = 0; i <= n; i++) {
        if (i) tt = Math.max(tt + c.pp, i >= 2 ? mem[i - 2].t1 + 0.02 : 0);
        mem.push(mkFig(tt, i === n ? 'mate' : 'tag', pr[i & 1], { fm, fk: 'P', fi: i }));
      }
      sd = true; slotBack = 2;
    } else {                                                 // the DROP off the catwalk (+ a high-ground buddy sometimes)
      mem.push(mkFig(t, rs[0] < 0.12 ? 'mate' : 'tag', SPOT_I.dp, { fm, fk: 'D', fi: 0 }));
      if (rs[1] < 0.4) mem.push(mkFig(t + 0.3, 'tag', SPOT_I[['h1', 'h4', 'h5'][rng.int(0, 2)]], { fm, fk: 'D', fi: 1, aimX: 0.45 }));
    }
    if (!commit(mem)) { fmN--; return 0; }
    if (sd) shotDriven(mem, base, slotBack);
    const lastT = mem.filter(s => s.who === 'tag').pop(); if (lastT) lastAim = SPOTS[lastT.spot].aimPt;
    tricks[k]++; trickN++; lastTrick = k;
    return Math.max(...mem.map(s => s.t0 + s.out)) - t;
  }
  // ---- the referee strolls across once (planned first: the stream works round him) ----
  if (rng() < c.refP) { const tr = TIME * rng.range(0.3, 0.7), dn = rng() < 0.5 ? 1 : -1, dur = F3(c.refDur * (0.95 + 0.1 * rng())); const sp = { id: 0, t0: F3(tr), t1: F3(tr + dur + 0.05), kind: 'fig', who: 'ref', dur, xa: dn > 0 ? -8.4 : 8.4, xb: dn > 0 ? 8.4 : -8.4, readyAt: 0.05 }; figs.push(sp); out.push(sp); }
  // ---- the stream: singles / bursts / pairs / tricks with anticipation pauses ----
  let t = 1.3, guard = 0, pend = false;
  while (t < TIME && guard++ < 600) {
    const tags = tagsUp(t);
    if (tags.length >= c.live) { t = Math.min(...tags.map(f => popAt(f) + (f.fake ? f.out : f.fire))) + 0.05; continue; }
    // a trick takes the arena to itself: once one is due, the stream holds until the arena is clear (an anticipation pause)
    if ((pend || rng() < c.trick || (trickN === 0 && t > 7)) && t > 3.5 && t < TIME - 3) {
      const busy = upAt(t).filter(f => f.who !== 'ref');
      if (busy.length) { pend = true; t = Math.max(...busy.map(f => f.t1)) + 0.05; continue; }
      pend = false;
      const d = trick(t); if (d > 0) { t += d + rng.range(c.pause[0], c.pause[1]); continue; }
    }
    const s = single(t);
    if (!s) { t += 0.25; continue; }
    const rb = rng();
    if (s.who === 'tag' && rb < c.pair) single(t + rng.range(0, 0.1), { who: 'mate' });                 // two pops at once, one green
    else if (rb < c.pair + c.burst && tagsUp(t).length < c.live) single(t + rng.range(c.bgap[0], c.bgap[1]));
    t += rng.range(c.gap[0], c.gap[1]) * (s.who === 'tag' ? 1 : 0.7);
  }
  // ---- FAIRNESS + RELOAD-AWARE PACING: a perfect player (0.22 s reaction, 0.2 s between shots, aim 0.06 + 0.32 x travel
  // / diagonal, `rel` after a full magazine) must reach every firing tagger before its dot lands. A single it can't is
  // popped later (if it still fits) or its dot slowed; a pattern member's dot is slowed. ----
  let fixes = 0;
  for (let it = 0; it < (c.noFix ? 0 : 8); it++) {
    const res = solve(out, c);
    if (!res.missed.length) break;
    for (const m of res.missed) {
      const s = m.sp;
      if (!s.fm && it < 5) {
        const t0 = s.t0, i0 = figs.indexOf(s); let ok = false; figs.splice(i0, 1);
        for (let dd = m.late + 0.25; dd < 2.6 && !ok; dd += 0.25) { s.t0 = F3(t0 + dd); s.t1 = F3(s.t0 + s.out + s.ex + 0.05); ok = fits(s); }
        if (!ok) { s.t0 = t0; s.slide = F3(s.slide + m.late + 0.12); retime(s); }
        figs.push(s);
      } else if (s.fm && it < 5) {                         // a pattern member: it and the rest of its pattern come a beat later
        const grp = figs.filter(f => f.fm === s.fm && f.fi >= s.fi), d = F3(m.late + 0.12);
        grp.forEach(f => { f.t0 = F3(f.t0 + d); f.t1 = F3(f.t1 + d); });
        if (!grp.every(f => fits(f))) { grp.forEach(f => { f.t0 = F3(f.t0 - d); f.t1 = F3(f.t1 - d); }); s.slide = F3(s.slide + m.late + 0.12); retime(s); }
      } else { s.slide = F3(s.slide + m.late + 0.12); retime(s); }
      fixes++;
    }
  }
  const sol = solve(out, c), shotN = new Map(sol.order.map(([s, , n]) => [s, n]));
  // ---- shot-driven conversion (after the pacing: the clock schedule stays the fallback). A member after the perfect
  // player's last round of a magazine waits the reload allowance too. ----
  for (const { mem, base, slotBack } of chains) {
    const S0 = mem.map(m => m.t0);
    for (let i = 1; i < mem.length; i++) {
      const m = mem[i], p = mem[i - 1], dS = F3(S0[i] - S0[i - 1]);
      const relX = magN && shotN.get(p) && shotN.get(p) % magN === 0 ? c.rel : 0;
      m.chS = dS; m.chX = F3(REL_LEAD + Math.max(0, dS - base) + relX); m.chF = slotBack; m._chP = p;
      const e = Math.floor((p.t0 + Math.min(dS, p.readyAt + m.chX)) * 1000) / 1000;
      m.chR = F3(S0[i] - e); m.t0 = e;
    }
  }
  // ---- the FOG BURSTS and the BASE: never in the first seconds, never as a perfect player reaches for a reload ----
  const last0 = out.reduce((a, s) => s.kind === 'dir' ? a : Math.max(a, s.t1), 0);
  const nearRel = (a, b) => sol.relAt.some(r => r > a - 0.3 && r < b);
  if (c.blackout) {
    const g1 = TIME * rng.range(0.32, 0.42), g2 = TIME * rng.range(0.66, 0.76);
    dir.fogs = [[2.5, g1], [g1 + 2.2, g2], [g2 + 2.2, last0 + 1]].map(f => f.map(F3));
  } else {
    let tf = 6 + rng.range(0, 2);
    for (let k = 0; k < c.fogs; k++) {
      const target = Math.max(tf, TIME * (k + 0.55) / (c.fogs + 0.25) + rng.range(-2, 2)), dur = rng.range(c.fogDur[0], c.fogDur[1]);
      let a = target; for (let g = 0; g < 12 && nearRel(a, a + 1.0); g++) a += 0.4;
      if (a + 1 > last0) break;
      dir.fogs.push([F3(a), F3(Math.min(a + dur, last0))]); tf = a + dur + 4;
    }
  }
  const nb = rng.int(c.bases[0], c.bases[1]), bases = [];
  for (let k = 0; k < nb; k++) {
    let a = Math.max(5, TIME * (k + 0.5) / nb + rng.range(-3, 3)); const st = c.baseStay;
    for (let g = 0; g < 12 && (nearRel(a, a + st) || bases.some(b => a < b.t1 + 1.5 && b.t0 < a + st + 1.5)); g++) a += 0.6;
    if (a + st > last0) continue;
    const sp = { id: 0, t0: F3(a), t1: F3(a + BASE_IN + st + BASE_OUT + 0.05), kind: 'base', stay: st, readyAt: BASE_IN * 0.6 };
    bases.push(sp); out.push(sp);
  }
  out.sort((a, b) => a.t0 - b.t0);
  out.forEach((s, i) => { s.id = i; });
  for (const s of out) if (s._chP) { s.chD = s.id - s._chP.id; delete s._chP; }
  for (const s of out) SPTL.set(s, out);
  const last = out.reduce((a, s) => s.kind === 'dir' ? a : Math.max(a, s.t1), 0);
  dir.last = F3(last); dir.t1 = F3(last + FIN_HOLD + 1.2);
  const req = out.filter(isReq).length;
  c.reqCount = req; c.tagCount = out.filter(s => s.who === 'tag').length; c.fakeCount = out.filter(s => s.fake).length;
  c.mateCount = out.filter(s => s.who === 'mate').length; c.refCount = out.filter(s => s.who === 'ref').length; c.baseCount = bases.length;
  c.fogCount = dir.fogs.length; c.trickN = trickN; c.tricks = tricks; c.fixes = fixes; c.solveShots = sol.shots; c.reloads = sol.relAt.length;
  c.quota = Math.max(4, Math.round(req * c.share));
  c.time = Math.ceil(last + FIN_SLOT);
  return out;
}
// the greedy earliest-deadline player (pacing + measurement) -> { missed: [{ sp, late }], shots, relAt, order: [[sp, t, n]] }
function solve(tl, c, o = {}) {
  const react = o.react || 0.22, between = o.between || 0.2, aimA = o.aimA || 0.06, aimB = o.aimB || 0.32, rel = c.rel;
  const magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0;
  const items = [];
  for (const s of tl) if (isReq(s)) { const pop = s.t0 + (s.chR || 0); items.push({ sp: s, ready: pop + READY + react, dl: pop + s.fire - 0.06 }); }
  let now = 0, shots = 0, aim = [RW / 2, RH / 2]; const done = new Set(), missed = [], relAt = [], order = [];
  for (let guard = 0; guard < 4000; guard++) {
    const avail = items.filter(it => !done.has(it) && !it.dead);
    if (!avail.length) break;
    for (const it of avail) if (it.dl < now) { it.dead = true; missed.push({ sp: it.sp, late: now - it.dl }); }
    const ready = avail.filter(it => !it.dead && it.ready <= now);
    if (!ready.length) { const nx = avail.filter(it => !it.dead).map(it => it.ready); if (!nx.length) break; now = Math.max(now, Math.min(...nx)); continue; }
    ready.sort((a, b) => a.dl - b.dl || a.sp.t0 - b.sp.t0);
    const it = ready[0], q = SPOTS[it.sp.spot].aimPt, d = hyp(q[0] - aim[0], q[1] - aim[1]);
    const st = now + aimA + aimB * d / DIAG;
    if (st > it.dl) { it.dead = true; missed.push({ sp: it.sp, late: st - it.dl }); continue; }
    done.add(it); shots++; aim = q; now = st + between; order.push([it.sp, st, shots]);
    if (magN && shots % magN === 0) { relAt.push(now); now += rel; }       // the magazine is dry: the reach for the reload
  }
  return { missed, shots, relAt, order };
}
// points: a lit vest SENSOR 300, anywhere else on a tagger 100, +50 QUICK DRAW in the first 30 % of the dot's slide; the
// base 500. Records the hit's stage time for the shot-driven chains (only Run.applyHit calls this: the host's time on both
// tabs in versus).
function points(sp, lt, zone) {
  if (sp.kind === 'base') return PTS_BASE;
  if (sp.kind !== 'fig' || sp.who !== 'tag') return 0;
  HIT.set(sp, sp.t0 + lt); ZONE.set(sp, zone || 'body');
  const l = lt - relOffOf(sp, SPTL.get(sp)), quick = l < sp.aim + 0.3 * sp.slide;
  QUICK.set(sp, quick);
  return (zone === 'sensor' ? PTS_SENSOR : PTS_BODY) + (quick ? PTS_QUICK : 0);
}
function briefing(c) {
  const HINTS = ['THE RED DOT IS THEIR AIM. BEAT IT!', 'GREEN VESTS ARE YOUR TEAM. HOLD FIRE!', 'THE LIT SENSORS SCORE 300!', 'FOG? WATCH THE VESTS!'];
  return { rule: [['TAG ', 'void'], [c.quota + ' PLAYERS', 'red'], [' OR MORE!', 'void']], icon: 'tagger', unit: 'PLAYERS', dont: 'mate',
    tip: c.variant === 2 ? 'FOG ALL ROUND! WATCH THE VESTS!' : 'TAG THEM BEFORE THEY TAG YOU!', hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}
// ---------- briefing card icons: a tagger (helmet, red visor, red vest, lit sensor); a green-vest teammate ----------
const TAG_ICON = ['....NNNNNN....', '...NNNRRNNN...', '..NNNNRRNNNN..', '..NNNNNNNNNN..', '..VVVVVVVVVV..', '..vvvvvvvvvv..', '...SSSSSSSS...', '....SSMMSS....',
  '..RRR.SS.RRR..', '.RRRXXXXXXRRR.', '.RXXXOOOOXXXR.', '.RXXOOWWOOXXR.', '.RXXXOOOOXXXR.', '.RRRRRRRRRRRR.'];
const TAG_KEY = { N: 'navy', R: 'red', V: 'red', v: 'crimson', S: 'chestnut', M: 'umber', X: 'void', O: 'coral', W: 'bone' };
const MATE_ICON = ['....HHHHHH....', '...HHHHHHHH...', '..HHHHHHHHHH..', '..LLLLLLLLLL..', '..HSSSSSSSSH..', '..SSXSSSSXSS..', '..SSSSSSSSSS..', '...SMSSSSMS...',
  '....SMMMMS....', '..GGG.SS.GGG..', '.GGGXXXXXXGGG.', '.GXXXLLLLXXXG.', '.GXXLLWWLLXXG.', '.GGGGGGGGGGGG.'];
const MATE_KEY = { H: 'umber', L: 'lime', S: 'tan', X: 'void', M: 'umber', G: 'green', W: 'bone' };
function drawIcon(cx, cy, r, t = 0) {
  const sc = Math.max(1, Math.round(2 * r / 14)), f = ((t * 6) | 0) & 1;
  B.HUD.sprite(TAG_ICON, cx - 7 * sc, cy - 7 * sc, sc, f ? TAG_KEY : Object.assign({}, TAG_KEY, { O: 'red', W: 'coral' }), 'ltTag' + f);
}
function drawDont(cx, cy, r) {
  const sc = Math.max(1, Math.round(2 * r / 14));
  B.HUD.sprite(MATE_ICON, cx - 7 * sc, cy - 7 * sc, sc, MATE_KEY, 'ltMate');
}
// the miss ricochet colours for this stage (core/fx.js reads B.FX.ricochetColors[stageId]): neon sparks
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors[ID] = { hot: ['pink', 'cyan', 'lime', 'bone'], flakes: ['magenta', 'plum', 'indigo'], pop: 'bone', speed: 1, grav: 0.6 };
// the arena bed lives in sfx-stage.js (K.stageBeds); hook it into the ambience beds (sfx-music.js owns K.beds)
{ const K = B.SFXKit; if (K && K.beds && K.stageBeds && K.stageBeds.lasertag && !K.beds.lasertag) K.beds.lasertag = K.stageBeds.lasertag; }
B.Stage.register({ id: ID, name: 'LASER TAG', short: 'TAG', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon, drawDont, drawHud,
  pose: figPose, solve, isReq, releaseAt, hazeAt, TIER_P, SPOTS, CONF, scr, STAGE, U, OCC, LIVE_TAGS, FLASH, chargeTag, VS_GRACE });
})(window.BLAM);
