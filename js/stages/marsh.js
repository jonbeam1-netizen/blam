'use strict';
/* =========================================================================================
   B.L.A.M. stages/marsh.js -- Stage 12: MARSH HUNT (DESIGN-STAGES.md section 17, Jon's idea, Fable 2026-11-08).
   SIMPLE on purpose: one mechanic (shoot the birds before they fly off), three variants that differ in AMMO ONLY.
   THE SET: a marsh at sunset (the engine's fixed camera). An orange-to-violet sky that darkens over the round (the post
   pass dithers it), a low sun sinking behind a far treeline, the moon rising on the left, still water reflecting the
   sky, a wall of REEDS and cattails across the lower third of the play rect (one instanced draw call each, swaying; the
   reeds shiver where a bird bursts out), a DUCK BLIND on stilts on the left wearing the "B.L.A.M. MARSH" sign with a box
   of shells on its porch (LAST BOX: it counts down), a heron statue standing in the water, a canoe pulled up on the near
   bank, three dragonflies, fireflies (one instanced draw call) that come out as the light fades.
   THE BIRDS: wind-up TIN birds (enamel paint, button eyes, a key in the back that turns, stiff wings that beat in three
   steps). A bird BURSTS up out of the reeds at a seeded spot (the reeds shiver, a feather puff, birdBurst), climbs,
   flies a seeded zig-zag (2-3 heading changes, birdFlap at each), and after the tier's AIR TIME it dashes off the top or
   a side edge (birdAway), gone for good. Shot: it FREEZES 0.3 s in the hit pose (X eyes, wings up, birdHit), then drops
   straight down into the reeds (birdFall). HIT +100, +50 QUICK SHOT within 0.6 s of clearing the reeds, +100 PAIR (both
   birds of a pair, same player), +500 PERFECT ROUND (10 of 10, same player). No life is ever lost here.
   ROUNDS of 10 birds (a ROUND n banner); a TALLY STRIP of 10 bird silhouettes over the timer (HUD) fills red / grey.
   THE DOG (Deputy Duck in a blaze-orange hunter's cap and a bandana; range.js's placeholder voxel duck style, js/duck.js
   untouched): after each round he pops up out of the reeds holding up the round's birds by the feet (1, 2 or a
   fistful), grins and drops back; a DOUBLE MISS (both birds of a pair flew away) = he pops up at once and LAUGHS; 10 of
   10 = he cheers. Never shootable (no hit parts; he never blocks a shot).
   FINALE (quota met): the dog hops out of the reeds with the whole bag, the moon is up and the fireflies drift together
   to spell B.L.A.M. over the water.
   Every bird path, round, the dog's events and the sky are pure functions of (seed, tier, variant), the stage clock and
   run.taken -> versus-safe.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets, P = B.Props;
const clamp = E.clamp, ID = 'marsh', RW = R.RW, RH = R.RH;
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH), FPX = (RH / 2) / R.TAN_H;
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
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
// game px (px, py) -> the world point on the plane z = Z under it (the steady camera)
function worldAt(px, py, Z, o) {
  const xc = (px - RW / 2) / FPX, yc = (RH / 2 - py) / FPX, dy = yc * PCS - PSN, dz = -yc * PSN - PCS, s = (Z - CAMP.z) / dz;
  o = o || {}; o.x = CAMP.x + xc * s; o.y = CAMP.y + dy * s; o.z = Z; return o;
}
const uOfPx = px => clamp(px / RW, 0, 1);

// =========================================================================================
// LAYOUT (world units, ~1 m; camera eye y 1.9, z 5; horizon at row ~99)
// =========================================================================================
const HZ = scr(0, CAMP.y, CAMP.z - 1e5)[1];                     // the horizon row
const SKY_Z = -45, TREE_Z = -31, MASS_Z = -4.2, BANK_Z = 0.6;
const BLIND = { x: -7.2, z: -11.5, floor: 1.3 };
const HERON = { x: 6.0, z: -13.5 };
const DOG_Z = -2.6, DOG_S = 0.13, DOG_Y0 = -2.2, DOG_Y1 = 0.05;
const BIRD_Z = [-5.3, -8.6];                                     // the birds' flight planes (behind the reed mass)
const START_ROW = 186, BOX = [30, 396, 34, 102];                 // a bird starts hidden under the reed line; its flight box (px)
const EXIT_T = 0.5, FREEZE = 0.3, QUICK = 0.6, BANNER_T = 1.3, DOG_T = 1.9, GRACE_V = 1.0, GRACE_S = 0.05;
const FIN_HOLD = 4.6, FIN_SLOT = 5.0, N_FF = 150, N_SHELL = 25, N_DF = 3;
const LS = 0.047;                                                // bird lattice (world units per cell)

// =========================================================================================
// MATERIALS (unlit set with baked colours; env dither class = alpha 0.5, objects = 1)
// =========================================================================================
const M_ENV = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.NoBlending, fog: false });
const M_OBJ = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const M_FF = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const TOON = P.mat;
const SW = { uT: { value: 0 }, uB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(-999, 0, 0, 0)) } };
function swayMat(base) {                                         // reeds: wind sway + the shiver where a bird bursts out
  const m = base.clone();
  m.onBeforeCompile = sh => {
    sh.uniforms.uT = SW.uT; sh.uniforms.uB = SW.uB;
    sh.vertexShader = 'uniform float uT; uniform vec4 uB[4];\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float hk = clamp(position.y, 0.0, 1.0); hk *= hk;
  float sx = ${(RW / 2).toFixed(1)} + ip.x * ${FPX.toFixed(2)} / max(1.0, ${CAMP.z.toFixed(1)} - ip.z);
  float shv = 0.0;
  for (int i = 0; i < 4; i++) { float d = abs(sx - uB[i].x); shv += uB[i].y * exp(-d * d / 260.0) * sin(uT * 41.0 + ip.x * 9.0 + float(i) * 1.7); }
  transformed.x += hk * (0.05 * sin(uT * 1.25 + ip.x * 0.8 + ip.z * 1.7) + 0.018 * sin(uT * 3.3 + ip.x * 2.3) + 0.1 * shv);
#endif`);
  };
  m.customProgramCacheKey = () => 'marshSway';
  return m;
}
const M_REED = swayMat(M_ENV);

// sky + water: one GLSL sky ramp (sunset -> dusk by uDusk), the sun disc, stars at dusk; the water mirrors it
const glc = n => 'vec3(' + [16, 8, 0].map(s => (((PAL[n] >> s) & 255) / 255).toFixed(4)).join(', ') + ')';
const SKY_U = { uDusk: { value: 0 }, uHz: { value: HZ }, uSun: { value: new THREE.Vector3(330, 86, 9) }, uT: { value: 0 } };
const SKY_GLSL = `
uniform float uDusk; uniform float uHz; uniform vec3 uSun; uniform float uT;
vec3 ramp6(float k, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, vec3 f) {
  if (k < 0.3) return mix(a, b, k / 0.3);
  if (k < 0.52) return mix(b, c, (k - 0.3) / 0.22);
  if (k < 0.7) return mix(c, d, (k - 0.52) / 0.18);
  if (k < 0.86) return mix(d, e, (k - 0.7) / 0.16);
  return mix(e, f, (k - 0.86) / 0.14);
}
vec3 skyAt(float row) {
  float k = clamp(row / uHz, 0.0, 1.0);
  vec3 s0 = ramp6(k, ${glc('indigo')}, ${glc('plum')}, ${glc('magenta')}, ${glc('coral')}, ${glc('orange')}, ${glc('amber')});
  vec3 s1 = ramp6(k, ${glc('void')}, ${glc('midnight')}, ${glc('indigo')}, ${glc('plum')}, ${glc('magenta')}, ${glc('rust')});
  return mix(s0, s1, uDusk);
}
float hsh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
const SKY_MAT = new THREE.ShaderMaterial({
  uniforms: SKY_U, depthWrite: true, fog: false,
  vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: SKY_GLSL + `
void main() {
  vec2 px = vec2(gl_FragCoord.x, ${RH.toFixed(1)} - gl_FragCoord.y);
  vec3 c = skyAt(px.y);
  float d = length(px - uSun.xy);
  if (d < uSun.z) c = d < uSun.z * 0.62 ? ${glc('lemon')} : ${glc('yellow')};
  else if (d < uSun.z + 2.5) c = mix(c, ${glc('orange')}, 0.75);
  else if (d < uSun.z * 3.2) c = mix(c, ${glc('amber')}, 0.35 * (1.0 - uDusk) * (1.0 - (d - uSun.z) / (uSun.z * 2.2)));
  float st = hsh(floor(px));
  if (uDusk > 0.35 && px.y < uHz - 14.0 && st > 0.9975 - 0.002 * uDusk) c = mix(c, ${glc('bone')}, clamp((uDusk - 0.35) * 2.5, 0.0, 1.0) * (0.6 + 0.4 * sin(uT * 3.0 + st * 90.0)));
  gl_FragColor = vec4(c, 0.5);
}`
});
const WATER_MAT = new THREE.ShaderMaterial({
  uniforms: SKY_U, fog: false,
  vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: SKY_GLSL + `
varying vec3 vW;
void main() {
  vec2 px = vec2(gl_FragCoord.x, ${RH.toFixed(1)} - gl_FragCoord.y);
  float below = max(0.0, px.y - uHz);
  vec3 c = skyAt(max(0.0, uHz - below * 1.9)) * 0.72 + ${glc('navy')} * 0.12;
  float rip = sin(vW.z * 5.5 + sin(vW.x * 0.6 + uT * 0.7) * 1.6 + uT * 0.5);
  if (rip > 0.93) c = mix(c, skyAt(uHz * 0.85), 0.35);
  if (rip < -0.93) c *= 0.8;
  float sw = 3.0 + below * 0.35;
  if (abs(px.x - uSun.x) < sw && rip > 0.35 && uSun.y < uHz + 4.0) c = mix(c, ${glc('yellow')}, 0.8 * (1.0 - uDusk * 0.7));
  gl_FragColor = vec4(c, 0.5);
}`
});

// =========================================================================================
// THE TIN BIRDS (toon voxels, Props.Geo; lattice LS; facing +x, up +y, its right side +z toward you)
// =========================================================================================
const SCHEMES = [
  { name: 'ROBIN', body: 'red', belly: 'bone', wing: 'crimson', edge: 'lemon', tail: 'amber', beak: 'amber' },
  { name: 'JAY', body: 'blue', belly: 'ice', wing: 'deepblue', edge: 'cyan', tail: 'cyan', beak: 'yellow' },
  { name: 'CANARY', body: 'yellow', belly: 'lemon', wing: 'amber', edge: 'orange', tail: 'orange', beak: 'red' },
  { name: 'FINCH', body: 'green', belly: 'lemon', wing: 'forest', edge: 'lime', tail: 'lime', beak: 'orange' }
];
const len2 = (x, y) => Math.sqrt(x * x + y * y), len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => { const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz; return (Math.sqrt(a * a + b * b + c * c) - 1) * Math.min(rx, ry, rz); };
const capD = (x, y, z, a, b, r) => P.sdf.capsule(x, y, z, a, b, r);
function vmap(b, shape, paint) { const m = new Map(); P.sdf.voxelise(m, b, shape, paint); return m; }
function toonGeo(map, s) { const g = new P.Geo(0.75); g.voxels(map, s, 0, 0, 0, true); return g.geometry(); }
const EYE = [7.0, 4.0];
function birdBodyGeo(S, xeyes) {
  const tailLo = x => 0.7 - 0.18 * (-x - 5), tailHi = x => 2.3 + 0.32 * (-x - 5);
  const shape = (x, y, z) => Math.min(
    ell(x, y, z, 0, 0, 0, 7, 4.3, 3.9), ell(x, y, z, 6.0, 3.0, 0, 3.4, 3.3, 3.1),
    capD(x, y, z, [8.6, 2.8, 0], [11.4, 2.3, 0], 1.0),
    x < -4.6 && x > -11.4 && Math.abs(z) < 1.0 && y > tailLo(x) && y < tailHi(x) ? -0.5 : 1,
    capD(x, y, z, [-0.6, -4.0, 1.3], [1.6, -5.1, 1.3], 0.55), capD(x, y, z, [-0.6, -4.0, -1.3], [1.6, -5.1, -1.3], 0.55));
  const paint = (x, y, z) => {
    const ex = x - EYE[0], ey = y - EYE[1];
    if (Math.abs(z) > 1.4 && x > 4.5 && len2(ex, ey) < 1.75) {
      if (xeyes) return Math.abs(Math.abs(ex) - Math.abs(ey)) < 0.62 ? 'void' : 'bone';
      return len2(ex - 0.15, ey) < 0.85 ? 'void' : 'bone';
    }
    if (x > 8.3) return { col: S.beak };
    if (x < -4.7) return { col: S.tail };
    if (y < -3.9 && Math.abs(z) > 0.6) return 'steel';
    if (Math.abs(x + 0.6) < 0.55 && y > -3.6) return (((y + 9) | 0) % 2 === 0) ? 'haze' : 'steel';     // the tin seam + rivets
    if (y < -1.3 && x > -4.4) return S.belly;
    return S.body;
  };
  return toonGeo(vmap([-12, -6, -5, 13, 8, 5], shape, paint), LS);
}
function birdWingGeo(S) {                                       // a stiff tin wing, root at the origin, out along +z
  const cx = z => -0.6 - 0.2 * z, hw = z => 4.0 - 0.3 * z;
  const shape = (x, y, z) => Math.max(Math.abs(y) - 0.7, -z, z - 9.4, Math.abs(x - cx(z)) - hw(z));
  const paint = (x, y, z) => {
    if (z > 7.9 || Math.abs(x - cx(z)) > hw(z) - 1.1) return S.edge;
    return (((x + 20) | 0) % 3 === 0) ? S.body : S.wing;
  };
  return toonGeo(vmap([-6, -1, 0, 4, 1, 10], shape, paint), LS);
}
function birdKeyGeo() {                                         // the wind-up key: a shaft up from the back + a two-lobed bow
  const shape = (x, y, z) => Math.min(
    P.sdf.cyl(x, y, z, [0, 1.4, 0], [0, 1, 0], 1.4, 0.55),
    Math.max(Math.abs(z) - 0.55, Math.min(len2((x - 1.8) / 1.6, (y - 4.1) / 1.35) - 1, len2((x + 1.8) / 1.6, (y - 4.1) / 1.35) - 1), -(Math.min(len2(x - 1.9, y - 4.1), len2(x + 1.9, y - 4.1)) - 0.55)));
  return toonGeo(vmap([-4, 0, -1, 4, 6, 1], shape, (x, y) => y < 2.6 ? 'steel' : 'haze/steel/mist/bone'), LS);
}
let ART = null;
function buildArt() {
  if (ART) return ART;
  ART = { body: SCHEMES.map(S => birdBodyGeo(S, false)), bodyX: SCHEMES.map(S => birdBodyGeo(S, true)), wing: SCHEMES.map(birdWingGeo), key: birdKeyGeo() };
  return ART;
}

// =========================================================================================
// THE DOG: Deputy Duck, range.js's placeholder voxel duck re-made (blaze-orange hunter's cap with ear flaps, a red
// bandana with bone dots), separate wings; a normal and a LAUGHING body (^ ^ eyes, the beak open). js/duck.js untouched.
// =========================================================================================
function dogList(laugh) {
  const M = new Map(), key = (i, j, k) => i + ',' + j + ',' + k, put = (i, j, k, c) => M.set(key(i, j, k), [i, j, k, PAL[c]]);
  for (let i = -5; i <= 5; i++) for (let j = -1; j <= 10; j++) for (let k = -4; k <= 4; k++) {
    const bx = i / 4.6, by = (j - 2.6) / 3.0, bz = k / 3.6, hx = (i - 0.3) / 2.6, hy = (j - 7.3) / 2.6, hz = (k - 0.4) / 2.5;
    if (hx * hx + hy * hy + hz * hz <= 1) put(i, j, k, 'yellow');
    else if (bx * bx + by * by + bz * bz <= 1) put(i, j, k, j <= 0 ? 'amber' : 'yellow');
  }
  const front = (i, j) => { for (let k = 6; k >= -6; k--) if (M.has(key(i, j, k))) return k; return null; };
  const at = (i, j, c, dk = 0) => { const k = front(i, j); if (k != null) put(i, j, k + dk, c); };
  // the bandana round the neck: rows 4-5 on the surface, red with bone dots, a knot in front
  for (const [kk, v] of M) { const [i, j, k] = v; if (j !== 4 && j !== 5) continue;
    const out = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => !M.has(key(i + a, j + b, k + c)));
    if (out) M.set(kk, [i, j, k, PAL[(i + k + j) % 3 === 0 ? 'bone' : 'red']]); }
  for (const i of [-1, 0, 1]) at(i, 4, 'red', 1); at(0, 3, 'red', 1); at(-1, 3, 'crimson', 1); at(1, 3, 'crimson', 1); at(0, 2, 'crimson', 1);
  if (!laugh) {
    for (const [i, j] of [[-1, 8], [2, 8]]) at(i, j, 'void');
    at(-1, 9, 'bone'); at(2, 9, 'bone');
    for (let i = -1; i <= 1; i++) for (const j of [6, 7]) { const k = front(i, j); if (k != null) { put(i, j, k + 1, 'orange'); if (j === 6) put(i, j, k + 2, 'orange'); } }
    at(-2, 6, 'void'); at(2, 6, 'void');                                    // the grin's corners
  } else {
    at(-1, 8, 'void'); at(2, 8, 'void'); at(-1, 9, 'amber'); at(2, 9, 'amber'); at(-2, 9, 'amber'); at(3, 9, 'amber');   // squinting: lids down
    for (let i = -1; i <= 1; i++) { const k = front(i, 7); if (k != null) { put(i, 7, k + 1, 'orange'); put(i, 7, k + 2, 'orange'); } }
    for (let i = -1; i <= 1; i++) { const k = front(i, 6); if (k != null) { put(i, 6, k + 1, 'void'); put(i, 5, k + 1, 'orange'); put(i, 5, k + 2, 'orange'); } }
  }
  // the hunter's cap: blaze-orange crown, a rust band, a brim forward, ear flaps down both sides
  for (let i = -2; i <= 3; i++) for (let k = -2; k <= 3; k++) { put(i, 10, k, Math.abs(k - 0.5) > 2 || i === -2 || i === 3 ? 'rust' : 'orange'); }
  for (let i = -1; i <= 2; i++) for (let k = -1; k <= 2; k++) put(i, 11, k, 'orange');
  put(0, 12, 0, 'orange'); put(1, 12, 1, 'orange'); put(0, 12, 1, 'amber');
  for (let i = -2; i <= 3; i++) for (const k of [4, 5]) put(i, 10, k, 'rust');
  for (const i of [-3, 4]) for (const j of [7, 8, 9]) for (const k of [0, 1]) put(i, j, k, j === 7 ? 'rust' : 'orange');
  for (const i of [-2, -1, 1, 2]) for (const k of [0, 1, 2]) put(i, -2, k, 'orange');                    // feet
  return [...M.values()];
}
function dogWingList() {                                        // a wing hanging down from the shoulder (origin)
  const L = [];
  for (let j = -5; j <= 0; j++) for (let i = 0; i <= 1; i++) for (let k = -1; k <= 1; k++) if (!(j === -5 && (i === 1 || Math.abs(k) === 1))) L.push([i, j, k, PAL[j <= -4 ? 'amber' : 'yellow']]);
  return L;
}
function bagGeo() {                                             // the finale: a burlap bag with bird tails poking out
  const v = new Vox(), s = 0.07;
  for (let i = -4; i <= 4; i++) for (let j = 0; j <= 9; j++) for (let k = -3; k <= 3; k++) {
    const r = (i / 4.4) ** 2 + ((j - 4) / 5.2) ** 2 + (k / 3.4) ** 2; if (r > 1) continue;
    v.box(i * s, j * s, k * s, s, s, s, PAL[j === 8 ? 'walnut' : ((i + j * 3 + k) % 5 === 0 ? 'chestnut' : 'tan')]);
  }
  for (const [x, c] of [[-0.15, 'red'], [0.02, 'blue'], [0.17, 'yellow']]) { v.bx(x - 0.04, 0.68, -0.05, x + 0.04, 0.95, 0.05, PAL[c]); v.bx(x - 0.07, 0.9, -0.03, x + 0.07, 0.98, 0.03, PAL[c]); }
  v.bx(-0.2, 0.55, -0.22, 0.2, 0.6, 0.22, PAL.sand);              // the rope tie
  return v.geo();
}

// =========================================================================================
// THE SET
// =========================================================================================
let PARTS = null;
const H32 = (i, j) => hash1(Math.imul(i | 0, 73856093) ^ Math.imul(j | 0, 19349663));
// the reed line: the row the reeds' tips reach at screen column px (back rows); lower at the HUD duck's corner
function reedRow(px) {
  let r = 133 + 4 * Math.sin(px * 0.045) + 3 * Math.sin(px * 0.13 + 1.3) + 2 * Math.sin(px * 0.31);
  if (px < 64) r += (64 - px) * 0.45;
  return r;
}
function clumpGeo() {                                           // a reed clump, height 1 (instances scale it)
  const v = new Vox(), m = new THREE.Matrix4(), seg = (x, z, h, w, lean, cols) => {
    const n = cols.length;
    for (let i = 0; i < n; i++) { m.makeRotationZ(lean); m.setPosition(x + Math.sin(-lean) * h * (i + 0.5) / n, h * (i + 0.5) / n, z); v.box(0, 0, 0, w, h / n + 0.002, w, PAL[cols[i]], m, 55); }
  };
  seg(-0.05, 0.02, 0.78, 0.045, 0.06, ['void', 'forest']);
  seg(0.0, -0.02, 1.0, 0.05, -0.02, ['void', 'forest', 'green']);
  seg(0.06, 0.03, 0.86, 0.045, -0.08, ['void', 'forest']);
  seg(-0.08, 0.0, 0.62, 0.05, 0.38, ['void', 'forest', 'green']);
  seg(0.09, 0.0, 0.55, 0.05, -0.42, ['void', 'forest']);
  return v.geo();
}
function cattailGeo() {
  const v = new Vox();
  v.bx(-0.022, 0, -0.022, 0.022, 0.25, 0.022, PAL.void); v.bx(-0.022, 0.25, -0.022, 0.022, 0.74, 0.022, PAL.forest);
  v.bx(-0.05, 0.72, -0.05, 0.0, 0.92, 0.05, PAL.walnut); v.bx(0.0, 0.72, -0.05, 0.05, 0.92, 0.05, PAL.chestnut);
  v.bx(-0.012, 0.92, -0.012, 0.012, 1.04, 0.012, PAL.tan);
  v.bx(0.0, 0.3, -0.02, 0.14, 0.33, 0.02, PAL.green);
  return v.geo();
}
function buildReeds(env) {
  const clumps = [], tails = [], w = {};
  const add = (list, x, z, h, sx, b) => list.push([x, z, h, sx, b]);
  let n = 0;
  for (let z = -4.0; z <= 0.55; z += 0.3) {
    const zf = (z + 4) / 4.55;                                  // 0 back .. 1 near
    const half = (CAMP.z - z) * R.TAN_H * R.ASPECT + 0.6;
    const sp = lerp(0.1, 0.42, zf);
    for (let x = -half; x <= half; x += sp * (0.6 + 0.8 * H32(n++, 3))) {
      const px = scr(x, 0, z)[0];
      if (zf > 0.45 && H32(n, 7) < 0.25 + 0.5 * (px > 140 && px < 300 ? 1 : 0)) continue;   // near rows sparse, the middle sparser
      const rowT = zf < 0.3 ? reedRow(px) - 6 + 10 * H32(n, 9) : reedRow(px) + lerp(8, 44, zf) + 14 * H32(n, 9) + (px < 64 ? 12 : 0);
      const top = worldAt(px, rowT, z).y;
      if (top < 0.08) continue;
      const b = 0.62 + 0.38 * H32(n, 11) + (px > 260 ? 0.1 : 0) - 0.12 * zf;
      if (zf < 0.55 && H32(n, 13) < 0.11) add(tails, x + 0.03, z, top + 0.12 + 0.18 * H32(n, 17), 1, b);
      else add(clumps, x, z + 0.1 * (H32(n, 19) - 0.5), top, 0.8 + 0.6 * H32(n, 23), b);
    }
  }
  const inst = (geo, list) => {
    const im = new THREE.InstancedMesh(geo, M_REED, list.length), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    list.forEach(([x, z, h, sx, b], i) => {
      im.setMatrixAt(i, mm.compose(new THREE.Vector3(x, -0.05, z), q.setFromEuler(e.set(0, (H32(i, 31) - 0.5) * 2, (H32(i, 37) - 0.5) * 0.12)), new THREE.Vector3(sx, h + 0.05, sx)));
      im.setColorAt(i, c.setRGB(b * 1.04, b, b * 0.9));
    });
    im.frustumCulled = false; noRay(im); env.add(im); return im;
  };
  w.clumps = inst(clumpGeo(), clumps); w.tails = inst(cattailGeo(), tails);
  w.n = clumps.length + tails.length;
  return w;
}
function buildFar(v) {                                          // the far bank + treeline silhouette (env class)
  const z = TREE_Z;
  v.bx(-40, -0.05, z - 1, 40, 0.22, z + 1.5, PAL.void);
  for (let x = -38; x < 38;) {
    const t = H32(Math.floor(x * 10), 1), w = 0.8 + 1.0 * H32(Math.floor(x * 10), 2), h = 1.3 + 2.1 * H32(Math.floor(x * 10), 3), lit = x > 6;
    if (t < 0.55) {                                             // a pine: stacked tiers
      for (let k = 0; k < 9; k++) { const f = k / 9, ww = w * (1 - f) * (k % 2 ? 0.8 : 1) + 0.12; v.bx(x - ww / 2, h * f, z, x + ww / 2, h * (f + 1 / 9) + 0.04, z + 0.4, PAL[k > 6 ? 'midnight' : 'void']);
        if (lit && k < 6) v.bx(x + ww / 2 - 0.12, h * f, z + 0.41, x + ww / 2, h * (f + 1 / 9), z + 0.42, PAL.plum); }
    } else if (t < 0.9) {                                       // a round tree on a trunk
      v.bx(x - 0.1, 0, z, x + 0.1, h * 0.4, z + 0.3, PAL.void);
      for (let k = 0; k < 5; k++) { const a = k / 4, ww = w * (0.6 + 0.6 * Math.sin(a * Math.PI)); v.bx(x - ww / 2, h * (0.35 + 0.13 * k), z, x + ww / 2, h * (0.48 + 0.13 * k), z + 0.4, PAL[k > 2 ? 'midnight' : 'void']); }
      if (lit) v.bx(x + w * 0.45, h * 0.5, z + 0.41, x + w * 0.55, h * 0.8, z + 0.42, PAL.plum);
    } else {                                                    // a dead snag
      v.bx(x - 0.08, 0, z, x + 0.08, h * 1.1, z + 0.2, PAL.void); v.bx(x, h * 0.7, z, x + 0.7, h * 0.76, z + 0.2, PAL.void); v.bx(x - 0.5, h * 0.85, z, x, h * 0.9, z + 0.2, PAL.void);
    }
    x += w * (0.55 + 0.4 * H32(Math.floor(x * 10), 4));
  }
}
function buildMass(v) {                                         // the reed mass in the water: hides the birds' start
  for (let x = -9; x < 9; x += 0.08) {
    const px = scr(x, 0, MASS_Z)[0], top = Math.max(0.2, worldAt(px, reedRow(px) + 3 + 3 * H32(Math.floor(x * 50), 5), MASS_Z).y);
    v.bx(x, -0.3, MASS_Z, x + 0.085, top * 0.45, MASS_Z + 0.06, PAL.void);
    v.bx(x, top * 0.45, MASS_Z, x + 0.085, top * 0.85, MASS_Z + 0.06, PAL.forest);
    v.bx(x, top * 0.85, MASS_Z, x + 0.085, top, MASS_Z + 0.06, PAL[H32(Math.floor(x * 50), 6) < 0.3 ? 'tan' : 'green']);
  }
}
function buildBank(v) {                                         // the near muddy bank under the HUD strip (dark, quiet)
  for (let z = BANK_Z; z < 3.2; z += 0.25) for (let x = -5; x < 5; x += 0.25) {
    const h = H32(Math.floor(x * 4) + 99, Math.floor(z * 4));
    v.bx(x, 0, z, x + 0.25, 0.02 + 0.02 * h, z + 0.25, PAL[h < 0.6 ? 'umber' : h < 0.9 ? 'walnut' : 'void']);
  }
}
function buildBlind(v) {                                        // the duck blind: stilts, a planked shed, roof, porch, ladder, sign
  const { x: X, z: Z, floor: F } = BLIND, W = 1.15, D = 0.8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) v.bx(X + sx * W - 0.06, -0.4, Z + sz * D - 0.06, X + sx * W + 0.06, F, Z + sz * D + 0.06, PAL.walnut);
  v.bx(X - W - 0.1, F - 0.1, Z - D - 0.1, X + W + 0.1, F, Z + D + 0.75, PAL.chestnut);          // floor + porch
  v.bx(X - W - 0.1, F - 0.12, Z + D + 0.65, X + W + 0.1, F - 0.08, Z + D + 0.76, PAL.walnut);
  for (let i = 0; i < 12; i++) { const x0 = X - W + i * (2 * W / 12); v.bx(x0, F, Z + D - 0.04, x0 + 2 * W / 12 - 0.01, F + 1.25, Z + D + 0.02, PAL[i % 2 ? 'tan' : 'chestnut']); }
  v.bx(X - W, F + 0.72, Z + D + 0.02, X + W, F + 0.86, Z + D + 0.04, PAL.void);                  // the viewing slot
  v.bx(X - W - 0.02, F, Z - D, X - W + 0.02, F + 1.25, Z + D, PAL.walnut); v.bx(X + W - 0.02, F, Z - D, X + W + 0.02, F + 1.25, Z + D, PAL.chestnut);
  for (let k = 0; k < 4; k++) v.bx(X - W - 0.25 + k * 0.03, F + 1.25 + k * 0.09, Z - D - 0.2, X + W + 0.25 - k * 0.03, F + 1.34 + k * 0.09, Z + D + 0.35 - k * 0.12, PAL[k === 0 ? 'umber' : k % 2 ? 'walnut' : 'chestnut']);
  for (let k = 0; k < 5; k++) v.bx(X + W - 0.5, F - 0.25 - k * 0.3, Z + D + 0.74, X + W - 0.1, F - 0.21 - k * 0.3, Z + D + 0.8, PAL.tan);   // ladder rungs
  for (const sx of [W - 0.5, W - 0.1]) v.bx(X + sx - 0.03, -0.3, Z + D + 0.74, X + sx + 0.03, F, Z + D + 0.8, PAL.walnut);
  // the box of shells on the porch (front left): a crimson box with a bone label; the shells are instanced in it
  const bx = X - 0.75, bz = Z + D + 0.4;
  v.bx(bx - 0.36, F, bz - 0.22, bx + 0.36, F + 0.16, bz + 0.22, PAL.crimson);
  v.bx(bx - 0.37, F + 0.02, bz + 0.21, bx + 0.37, F + 0.13, bz + 0.23, PAL.red);
  v.bx(bx - 0.18, F + 0.04, bz + 0.231, bx + 0.18, F + 0.11, bz + 0.24, PAL.bone);
  // the sign over the roof: "B.L.A.M." / "MARSH" (3x5 letters), an oxblood board with a bone frame, two posts
  const l1 = R.small('B.L.A.M.'), l2 = R.small('MARSH'), cs = 0.068, bw = (Math.max(l1.w, l2.w) + 4) * cs, bh = 15 * cs, sy = F + 1.75;
  for (const sx of [-0.7, 0.7]) v.bx(X + sx - 0.04, F + 1.4, Z + 0.2, X + sx + 0.04, sy + 0.2, Z + 0.28, PAL.walnut);
  v.bx(X - bw / 2 - 0.05, sy - 0.05, Z + 0.28, X + bw / 2 + 0.05, sy + bh + 0.05, Z + 0.33, PAL.bone);
  v.bx(X - bw / 2, sy, Z + 0.33, X + bw / 2, sy + bh, Z + 0.34, PAL.oxblood);
  const letters = (t, row, col) => { const x0 = X - t.w * cs / 2; for (const [i, j] of t.px) v.bx(x0 + i * cs, sy + bh - (row + j + 1) * cs, Z + 0.34, x0 + (i + 1) * cs, sy + bh - (row + j) * cs, Z + 0.37, PAL[col]); };
  letters(l1, 2, 'lemon'); letters(l2, 8, 'yellow');
  return { bx, by: F + 0.02, bz };
}
function buildHeron(v) {                                        // a painted wooden heron decoy standing in the water
  const { x: X, z: Z } = HERON;
  v.bx(X - 0.05, -0.2, Z - 0.03, X - 0.01, 0.85, Z + 0.01, PAL.steel); v.bx(X + 0.06, -0.2, Z - 0.03, X + 0.1, 0.85, Z + 0.01, PAL.slate);
  v.bx(X - 0.25, 0.8, Z - 0.15, X + 0.3, 1.15, Z + 0.15, PAL.haze); v.bx(X - 0.2, 1.15, Z - 0.13, X + 0.2, 1.22, Z + 0.13, PAL.mist);
  v.bx(X + 0.3, 0.85, Z - 0.1, X + 0.55, 0.98, Z + 0.1, PAL.steel);               // tail
  v.bx(X - 0.3, 1.0, Z - 0.06, X - 0.18, 1.45, Z + 0.06, PAL.mist);                // neck (S)
  v.bx(X - 0.4, 1.4, Z - 0.06, X - 0.26, 1.62, Z + 0.06, PAL.bone);
  v.bx(X - 0.5, 1.58, Z - 0.08, X - 0.28, 1.74, Z + 0.08, PAL.bone);               // head
  v.bx(X - 0.86, 1.62, Z - 0.03, X - 0.5, 1.68, Z + 0.03, PAL.amber);              // beak
  v.bx(X - 0.3, 1.7, Z - 0.03, X - 0.12, 1.74, Z + 0.03, PAL.void);                // crest
  v.bx(X - 0.44, 1.66, Z + 0.081, X - 0.4, 1.7, Z + 0.09, PAL.void);               // eye
}
function buildCanoe(v) {                                        // a canoe pulled up on the near bank, bow into the reeds
  const m = new THREE.Matrix4(), q = new THREE.Matrix4();
  m.makeRotationY(0.5); q.makeTranslation(-3.3, -0.06, -2.3); m.premultiply(q); m.multiply(new THREE.Matrix4().makeScale(0.7, 0.75, 0.75));
  for (let i = -12; i <= 12; i++) {
    const f = Math.abs(i) / 12.5, hw = 0.28 * Math.sqrt(1 - f * f), x = i * 0.1, rise = 0.12 * f * f * f;
    v.box(x, 0.12 + rise / 2, 0, 0.1, 0.24 + rise, 2 * hw, PAL[i % 2 ? 'red' : 'crimson'], m);
    v.box(x, 0.25 + rise, hw - 0.015, 0.1, 0.03, 0.04, PAL.bone, m); v.box(x, 0.25 + rise, -hw + 0.015, 0.1, 0.03, 0.04, PAL.bone, m);
    if (Math.abs(i) < 10) v.box(x, 0.245, 0, 0.1, 0.01, 2 * hw - 0.08, PAL.walnut, m);
  }
  for (const i of [-4, 4]) v.box(i * 0.1, 0.25, 0, 0.08, 0.03, 0.5, PAL.tan, m);        // seats
  v.box(0.1, 0.29, 0, 0.9, 0.025, 0.05, PAL.tan, m); v.box(0.62, 0.29, 0, 0.22, 0.03, 0.14, PAL.sand, m);   // a paddle across
}
function moonGeo() {
  const v = new Vox(), g = 0.32, r = 3.2;
  for (let i = -11; i <= 11; i++) for (let j = -11; j <= 11; j++) {
    const x = (i + 0.5) * g, y = (j + 0.5) * g, d = hyp(x, y); if (d > r) continue;
    const crater = hyp(x + 0.9, y - 0.8) < 0.7 || hyp(x - 1.1, y + 0.5) < 0.5 || hyp(x - 0.2, y + 1.6) < 0.45;
    const c = d > r - 0.3 ? (x > 0 ? 'haze' : 'mist') : crater ? 'mist' : x > 1.8 ? 'mist' : 'bone';
    v.bx(x - g / 2, y - g / 2, 0, x + g / 2, y + g / 2, 0.05, PAL[c]);
  }
  return v.geo();
}
function dragonflyGeo() {
  const v = new Vox();
  v.bx(-0.16, -0.012, -0.012, 0.06, 0.012, 0.012, PAL.blue); v.bx(0.06, -0.02, -0.02, 0.1, 0.02, 0.02, PAL.cyan);
  v.bx(-0.02, 0.0, -0.13, 0.03, 0.006, 0.13, PAL.ice); v.bx(0.035, 0.0, -0.11, 0.075, 0.006, 0.11, PAL.bone);
  return v.geo();
}
function shellGeo() {
  const v = new Vox();
  v.bx(-0.045, 0, -0.045, 0.045, 0.08, 0.045, PAL.amber); v.bx(-0.045, 0.08, -0.045, 0.045, 0.1, 0.045, PAL.lemon);   // brass heads up (the open box)
  return v.geo();
}
function buildEnv() {
  const env = new THREE.Group();
  buildArt();
  // the sky (z -45) and the water (y 0); the sky's onBeforeRender steps the set (sun, moon, dusk, fireflies)
  const sky = noRay(new THREE.Mesh(new THREE.PlaneGeometry(110, 46), SKY_MAT)); sky.position.set(0, 14, SKY_Z); sky.renderOrder = -10; env.add(sky);
  const water = noRay(new THREE.Mesh(new THREE.PlaneGeometry(90, TREE_Z * -1 + 2), WATER_MAT)); water.rotation.x = -Math.PI / 2; water.position.set(0, 0, (TREE_Z + 1.2) / 2 + 0.3); env.add(water);
  const ve = new Vox(); buildFar(ve); buildMass(ve); buildBank(ve);
  env.add(noRay(new THREE.Mesh(ve.geo(), M_ENV)));
  const vo = new Vox(); const box = buildBlind(vo); buildHeron(vo); buildCanoe(vo);
  env.add(noRay(new THREE.Mesh(vo.geo(), M_OBJ)));
  const reeds = buildReeds(env);
  const moon = noRay(new THREE.Mesh(moonGeo(), M_OBJ)); env.add(moon);
  // fireflies (one draw call), dragonflies (one), the shells in the box (one)
  const ff = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), M_FF, N_FF); ff.frustumCulled = false; noRay(ff);
  const cc = new THREE.Color(); for (let i = 0; i < N_FF; i++) ff.setColorAt(i, cc.set(PAL[['lemon', 'lime', 'yellow', 'lemon'][i % 4]]));
  env.add(ff);
  const df = new THREE.InstancedMesh(dragonflyGeo(), M_OBJ, N_DF); df.frustumCulled = false; noRay(df); env.add(df);
  const sh = new THREE.InstancedMesh(shellGeo(), M_OBJ, N_SHELL); sh.frustumCulled = false; noRay(sh); env.add(sh);
  { const mm = new THREE.Matrix4(); for (let i = 0; i < N_SHELL; i++) sh.setMatrixAt(i, mm.makeTranslation(box.bx - 0.28 + (i % 5) * 0.14, box.by + 0.1, box.bz - 0.16 + Math.floor(i / 5) * 0.08)); }
  // the dog (hidden until he pops up): body (normal / laughing), two wings, held birds, the bag
  const dog = new THREE.Group(); dog.visible = false; env.add(dog);
  const dl = dogList(false), dll = dogList(true), ox = 0, oy = 2 * DOG_S;
  const dBody = noRay(new THREE.Mesh(new Vox().vox(dl, DOG_S, ox, oy, 0).geo(), MAT.obj)), dLaugh = noRay(new THREE.Mesh(new Vox().vox(dll, DOG_S, ox, oy, 0).geo(), MAT.obj));
  dog.add(dBody, dLaugh);
  const wl = dogWingList(), wingG = new Vox().vox(wl, DOG_S, -0.5 * DOG_S, 0, 0).geo(), wings = [];
  for (const sd of [-1, 1]) { const p = new THREE.Group(); p.position.set(sd * 4.6 * DOG_S, 6.2 * DOG_S, 0.3 * DOG_S); const m = noRay(shared(wingG, MAT.obj)); if (sd < 0) m.scale.x = -1; p.add(m); dog.add(p); wings.push(p); }
  const held = [];
  for (let i = 0; i < 5; i++) { const g = new THREE.Group(), b = noRay(shared(ART.body[0], TOON)); g.add(b); g.visible = false; wings[1].add(g); held.push({ g, b }); }
  const bag = noRay(shared(bagGeo(), MAT.obj)); bag.visible = false; bag.position.set(-3.5 * DOG_S, 8.5 * DOG_S, -1.5 * DOG_S); bag.rotation.z = 0.5; dog.add(bag);
  // misses: a proxy that finds the water (or the reeds) under the ray and throws a splash; it never reports a hit,
  // so no square bullet hole hangs over the water (the tracer flies on)
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.raycast = missSplash; env.add(proxy);
  env.userData.shootables = [proxy];
  sky.onBeforeRender = () => envStep();
  PARTS = { env, sky, water, moon, ff, df, sh, dog, dBody, dLaugh, wings, held, bag, reeds, ffP: ffPlan() };
  return env;
}
const _sp = new THREE.Vector3();
function missSplash(rc) {
  if (!inPlay()) return;
  const o = rc.ray.origin, d = rc.ray.direction; if (d.y >= -0.01) return;
  const s = -o.y / d.y; _sp.copy(o).addScaledVector(d, s); if (_sp.z > 1.2 || _sp.z < TREE_Z) return;
  const n = 7;
  for (let k = 0; k < n; k++) T.spawnChip(_sp, new THREE.Vector3(R.rnd(-0.6, 0.6), R.rnd(1.6, 3.2), R.rnd(-0.3, 0.6)), R.rnd(0.03, 0.055), PAL[['ice', 'mist', 'bone', 'cyan'][k % 4]], R.rnd(0.35, 0.6), 1, -0.02);
}
// fireflies: a seeded wander spot each + the B.L.A.M. letter dots of the finale (centred over the water)
function ffPlan() {
  const rng = B.Stage.mulberry32(0xf1ef1e), L = [];
  for (let i = 0; i < N_FF; i++) L.push({ x: rng.range(-7, 7), y: rng.range(0.4, 2.6), z: rng.range(-6.5, -2.6), a: rng() * 6.28, w: rng.range(0.4, 0.9), b: rng() * 6.28 });
  const t = R.bold('B.L.A.M.'), S = 3, x0 = RW / 2 - t.w * S / 2, y0 = 50, dots = [];
  for (const [px, py] of t.px) dots.push(worldAt(x0 + (px + 0.5) * S, y0 + (py + 0.5) * S, -9.5));
  return { L, dots };
}

// =========================================================================================
// per-frame set step (the sky mesh's onBeforeRender): dusk, sun, moon, stars, fireflies, dragonflies, shells
// =========================================================================================
const ST = { run: null, fin: -1, bursts: [] };
const stageT = () => { const G = B.G, run = G && G.run; return run && run.stage === ID ? { run, t: Math.max(0, run.t) } : { run: null, t: 0 }; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _w = {};
function envStep() {
  if (!PARTS) return;
  const { run, t } = stageT(), wall = performance.now() / 1000;
  const clock = run ? run.cfg.time : 60, ft = run && ST.run === run && ST.fin >= 0 ? t - ST.fin : -1;
  const dusk = ft >= 0 ? Math.min(1, 0.82 + ft * 0.1) : clamp(t / clock, 0, 1) * 0.82;
  SKY_U.uDusk.value = dusk; SKY_U.uT.value = wall;
  SKY_U.uSun.value.set(332 + dusk * 6, 84 + dusk * 30, 9);
  M_ENV.color.setScalar(1 - 0.22 * dusk); M_OBJ.color.setScalar(1 - 0.25 * dusk); M_REED.color.setScalar(1 - 0.22 * dusk);
  SW.uT.value = wall;
  // the moon rises over the round (pure in the stage clock); in the finale it is up
  const mk = ft >= 0 ? 1 : E.inOut(clamp(t / clock, 0, 1)) * 0.85;
  worldAt(lerp(150, 172, mk), lerp(112, 34, mk), SKY_Z + 1, _w); PARTS.moon.position.set(_w.x, _w.y, _w.z);
  // reed shiver where birds burst (the director fills ST.bursts: [px, stage time])
  const U = SW.uB.value; for (let i = 0; i < 4; i++) { const b = ST.bursts[i], age = b && run ? t - b[1] : 9; U[i].set(b ? b[0] : -999, age >= 0 && age < 0.7 ? 1 - age / 0.7 : 0, 0, 0); }
  // fireflies: they come out as the light fades; in the finale they drift into B.L.A.M. over the water
  const F = PARTS.ffP, ff = PARTS.ff, nVis = Math.round(N_FF * 0.5 * clamp((dusk - 0.3) / 0.5, 0, 1));
  for (let i = 0; i < N_FF; i++) {
    const f = F.L[i], blink = 0.5 + 0.5 * Math.sin(wall * (1.2 + f.w) + f.b);
    let x = f.x + 0.35 * Math.sin(wall * f.w + f.a), y = f.y + 0.2 * Math.sin(wall * f.w * 1.3 + f.b), z = f.z + 0.2 * Math.cos(wall * f.w * 0.7 + f.a), sc = i < nVis && blink > 0.25 ? 1 : 0;
    if (ft >= 0 && i < F.dots.length) {
      const k = E.inOut(clamp((ft - 0.4 - (i % 23) * 0.025) / 1.6, 0, 1)), d = F.dots[i];
      x = lerp(x, d.x, k); y = lerp(y, d.y + 0.02 * Math.sin(wall * 2 + i), k); z = lerp(z, d.z, k); sc = Math.max(sc, k > 0.02 ? lerp(1, 2.4 + 0.25 * blink, k) : 0);
    }
    ff.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q.identity(), _s.setScalar(sc || 1e-4)));
  }
  ff.instanceMatrix.needsUpdate = true;
  // dragonflies: darting hover over the reed tips (wall clock, cosmetic)
  for (let i = 0; i < N_DF; i++) {
    const ph = i * 2.1, seg = Math.floor(wall * 0.8 + ph), fr = wall * 0.8 + ph - seg, a = (k) => [-4 + 8 * hash1(k * 7 + i), 0.75 + 0.5 * hash1(k * 13 + i), -2.6 - 1.2 * hash1(k * 5 + i)];
    const p0 = a(seg), p1 = a(seg + 1), k = E.inOut(clamp((fr - 0.55) / 0.3, 0, 1));
    const x = lerp(p0[0], p1[0], k), y = lerp(p0[1], p1[1], k) + 0.02 * Math.sin(wall * 9 + i), z = lerp(p0[2], p1[2], k);
    PARTS.df.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, p1[0] > p0[0] ? 0 : Math.PI, 0)), _s.set(1, 1 + 0.4 * Math.sin(wall * 60 + i), 1)));
  }
  PARTS.df.instanceMatrix.needsUpdate = true;
  // the box of shells: LAST BOX counts down with the hard cap; the other variants keep it full
  const am = run && run.ammo; PARTS.sh.count = am && am.type === 'cap' ? clamp(am.count, 0, N_SHELL) : N_SHELL;
}

// =========================================================================================
// FLIGHT PATHS (pure): waypoints in game px on the bird's plane; [lt, px, py] x n, then the getaway to `ex`
// =========================================================================================
function posPx(sp, lt, o) {
  const w = sp.w;
  o = o || {};
  if (lt >= sp.air) {                                            // the getaway: off the top or a side edge
    const L = w[w.length - 1], k = clamp((lt - sp.air) / EXIT_T, 0, 1), kk = k * k;
    o.x = lerp(L[1], sp.ex[0], kk); o.y = lerp(L[2], sp.ex[1], kk); o.dx = sp.ex[0] - L[1]; o.dy = sp.ex[1] - L[2]; o.seg = w.length; return o;
  }
  if (lt <= 0) { o.x = w[0][1]; o.y = w[0][2]; o.dx = w[1][1] - w[0][1]; o.dy = w[1][2] - w[0][2]; o.seg = 0; return o; }
  let i = 0; while (i < w.length - 2 && lt >= w[i + 1][0]) i++;
  const a = w[i], b = w[i + 1], k = clamp((lt - a[0]) / Math.max(0.01, b[0] - a[0]), 0, 1), kk = i === 0 ? 1 - (1 - k) * (1 - k) : k;
  o.x = lerp(a[1], b[1], kk); o.y = lerp(a[2], b[2], kk); o.dx = b[1] - a[1]; o.dy = b[2] - a[2]; o.seg = i; return o;
}
function makePath(x0, c, rng) {
  const air = c.air, climb = clamp(0.15 * air, 0.3, 0.55), w = [[0, x0, START_ROW]];
  const y1 = rng.range(78, 102), x1 = clamp(x0 + rng.range(-28, 28), BOX[0], BOX[1]);
  w.push([climb, x1, y1]);
  let s = x1 < RW / 2 ? 1 : -1; if (rng() < 0.3) s = -s;
  let x = x1, y = y1;
  const pts = [];
  for (let i = 0; i <= c.turns; i++) {
    const L = rng.range(c.leg[0], c.leg[1]), ang = rng.range(0.12, 0.7), up = i === 0 ? -1 : rng() < 0.55 ? -1 : 1;
    let nx = x + s * L * Math.cos(ang), ny = y + up * L * Math.sin(ang);
    if (nx < BOX[0]) nx = BOX[0] + (BOX[0] - nx) * 0.5; if (nx > BOX[1]) nx = BOX[1] - (nx - BOX[1]) * 0.5;
    ny = clamp(ny, BOX[2], BOX[3]);
    pts.push([nx, ny]); x = nx; y = ny; s = -s;
  }
  let tot = 0, px = x1, py = y1; const lens = pts.map(([a, b]) => { const l = hyp(a - px, b - py) + 8; px = a; py = b; tot += l; return l; });
  let tt = climb;
  pts.forEach(([a, b], i) => { tt += (air - climb) * lens[i] / tot; w.push([r3(i === pts.length - 1 ? air : tt), Math.round(a), Math.round(b)]); });
  const L = pts[pts.length - 1], top = rng() < 0.6, side = L[0] < RW / 2 ? -1 : 1;
  const ex = top ? [Math.round(L[0] + side * rng.range(20, 60)), -36] : [side < 0 ? -40 : RW + 40, Math.round(L[1] - rng.range(20, 50))];
  const ra = r3(climb * clamp((START_ROW - reedRow(x0) + 6) / (START_ROW - y1), 0.2, 1));
  return { w, ex, ra };
}

// =========================================================================================
// TARGETS
// =========================================================================================
const HIT_PX = { mouse: 5.5, touch: 8 };
const PROXY_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
const _hp = new THREE.Vector3(), _cp = new THREE.Vector3();
function boxRaycast(rc, out) {                                  // a screen-space box round the bird's body (never under HIT_PX)
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable) return;
  this.updateWorldMatrix(true, false); this.getWorldPosition(_hp);
  const d = _hp.distanceTo(rc.ray.origin), perPx = 2 * d * R.TAN_H / RH, mn = (B.Input && B.Input.touch ? HIT_PX.touch : HIT_PX.mouse) * perPx;
  rc.ray.closestPointToPoint(_hp, _cp);
  const dx = _cp.x - _hp.x, dy = _cp.y - _hp.y, dz = _cp.z - _hp.z, oy = dy * PCS + dz * PSN;
  if (Math.abs(dx) > Math.max(tg.hw, mn) || Math.abs(oy) > Math.max(tg.hh, mn)) return;
  out.push({ distance: d, point: _cp.clone(), object: this });
}
// the applyHit hook: points() needs the player (pair / perfect round go to the player who hit them); installed on the
// Run instance (no engine change), so the host's adjudication, the guest's replay and solo all pass through it
const CUR = { run: null, by: -1 };
function hook(run) {
  if (!run || run.__marsh) return; run.__marsh = 1;
  const ah = run.applyHit;
  run.applyHit = function (by, tid, st, point, zone) { const pr = CUR.run, pb = CUR.by; CUR.run = this; CUR.by = by; try { return ah.call(this, by, tid, st, point, zone); } finally { CUR.run = pr; CUR.by = pb; } };
}
const _pp = {}, _wp = {};
class Bird extends T.Target {
  constructor(sp, run) {
    super('target');
    const A = buildArt();
    this.sp = sp; this.hitLt = -1; this.lastLt = 0; this.seg = -1; this.away = false; this.puffed = false; this.hw = 0.46; this.hh = 0.34;
    this.roll = new THREE.Group(); this.group.add(this.roll);
    this.face = new THREE.Group(); this.roll.add(this.face);
    this.body = shared(A.body[sp.sch], TOON); this.bodyX = shared(A.bodyX[sp.sch], TOON); this.bodyX.visible = false;
    this.face.add(this.body, this.bodyX);
    this.wings = [1, -1].map(sd => { const p = new THREE.Group(); p.position.set(-0.5 * LS, 3.0 * LS, sd * 1.9 * LS); const m = shared(A.wing[sp.sch], TOON); if (sd < 0) m.scale.z = -1; p.add(m); this.face.add(p); return p; });
    this.key = shared(A.key, TOON); this.key.position.set(-1.2 * LS, 3.9 * LS, 0); this.face.add(this.key);
    for (const m of [this.body, this.bodyX, this.key, ...this.wings.map(w => w.children[0])]) noRay(m);
    this.proxy = new THREE.Mesh(PROXY_GEO, PROXY_MAT); this.proxy.userData.sharedGeo = true;
    this.proxy.userData.target = this; this.proxy.raycast = boxRaycast; this.proxy.position.y = 0.4 * LS; this.face.add(this.proxy);
    this.group.visible = false; hook(run);
  }
  meshes() { return [this.proxy]; }
  place(px, py, o) { worldAt(px, py, this.sp.z, o); this.group.position.set(o.x, o.y, o.z); }
  update(lt, run) {
    const sp = this.sp; this.lastLt = lt;
    if (this.hitLt >= 0) return this.updateHit(lt);
    const p = posPx(sp, lt, _pp);
    this.place(p.x, p.y, _wp);
    const dir = p.dx >= 0 ? 1 : -1;
    this.face.scale.x = dir;
    this.face.rotation.z = dir * clamp(-Math.atan2(p.dy, Math.abs(p.dx) + 1e-3) * 0.5, -0.45, 0.6);
    this.roll.rotation.set(0.38, -dir * 0.32, 0);
    const fl = Math.floor(lt * (lt >= sp.air ? 16 : 11)) % 4, ang = [0.95, 0.15, -0.6, 0.15][fl];   // stiff tin wings: 3 steps
    this.wings[0].rotation.x = -ang; this.wings[1].rotation.x = ang;
    this.key.rotation.y = lt * 9;
    this.group.visible = lt > 0.02 && !(lt >= sp.air && p.y < -20);
    this.shootable = lt >= sp.ra && lt < sp.air;
    if (!this.puffed && lt >= sp.ra) { this.puffed = true; if (inPlay()) this.puff(); }
    if (p.seg !== this.seg) { if (this.seg >= 1 && p.seg <= sp.w.length - 1 && inPlay() && run.state === 'play') B.SFX.play('birdFlap', { u: uOfPx(p.x) }); this.seg = p.seg; }
    if (lt >= sp.air && !this.away) { this.away = true; if (inPlay() && run.state === 'play') B.SFX.play('birdAway', { u: uOfPx(p.x) }); }
    return lt >= sp.air + EXIT_T;
  }
  puff() {                                                      // a feather puff as it clears the reeds
    this.group.updateMatrixWorld(true); const c = this.group.getWorldPosition(new THREE.Vector3()); c.y -= 0.15;
    const S = SCHEMES[this.sp.sch];
    for (let k = 0; k < 6; k++) T.spawnChip(c, new THREE.Vector3(R.rnd(-0.8, 0.8), R.rnd(0.2, 1.2), R.rnd(-0.2, 0.4)), R.rnd(0.03, 0.05), PAL[[S.belly, 'bone', S.body][k % 3]], R.rnd(0.4, 0.7), 0.15);
  }
  // shot (applyHit / a versus optimistic hit): freeze 0.3 s in the hit pose (X eyes, wings up), then drop into the reeds
  shatter(point, opts = {}) {
    if (this.hitLt >= 0) return;
    this.hitLt = this.lastLt; this.alive = false; this.shootable = false; this.deadT = this.lastLt;
    this.group.updateMatrixWorld(true); this.hitPos = this.group.position.clone();
    this.body.visible = false; this.bodyX.visible = true;
    const c = this.hitPos.clone(), S = SCHEMES[this.sp.sch];
    T.sparks(c, 7, ['lemon', 'bone', 'yellow'], 1.3, 0.032);
    for (let k = 0; k < 8; k++) T.spawnChip(c, new THREE.Vector3(R.rnd(-1.5, 1.5), R.rnd(0.5, 2.2), R.rnd(-0.3, 1)), R.rnd(0.03, 0.05), opts.tint != null && k % 3 === 0 ? opts.tint : PAL[[S.body, S.wing, 'bone', S.belly][k % 4]], R.rnd(0.5, 0.9), 0.8);
    B.SFX.play('birdHit', { u: uOfPx(scr(c.x, c.y, c.z)[0]) });
  }
  updateHit(lt) {
    const f = lt - this.hitLt, p = this.hitPos;
    this.wings[0].rotation.x = -1.1; this.wings[1].rotation.x = 1.1; this.key.rotation.y = this.hitLt * 9;
    if (f < FREEZE) { this.group.position.copy(p); this.roll.rotation.set(0.25, 0, 0); this.face.rotation.z = 0; const sq = 1 + 0.12 * Math.sin(f * 60) * (1 - f / FREEZE); this.face.scale.y = sq; return false; }
    if (!this.fell) { this.fell = true; if (inPlay()) B.SFX.play('birdFall', { u: uOfPx(scr(p.x, p.y, p.z)[0]) }); }
    const g = f - FREEZE, y = p.y - 0.5 * 10 * g * g;
    this.group.position.set(p.x, y, p.z); this.face.scale.y = 1;
    this.face.rotation.z = this.face.scale.x * (-Math.PI / 2 * clamp(g / 0.18, 0, 1) + 0.25 * Math.sin(g * 20));
    this.roll.rotation.set(0.25, 0, 0);
    if (y < -0.4) { this.group.visible = false; return true; }
    return false;
  }
}

// ---------- the round / dog bookkeeping (pure in the timeline, run.taken and the stage clock) ----------
const tk = (run, id) => run.taken.has(id) && run.taken.get(id) >= 0;
const grace = run => (run.versus ? GRACE_V : GRACE_S);
// the dog's events up to stage time t: [start, kind 'show' | 'laugh' | 'cheer', screen x, birds held (ids)]. A double miss
// (both birds of a pair flew away) = a laugh at once (except the round's last pair: the round's own show covers it); each
// round's end = a show (no bird: a laugh, 10 of 10: a cheer). Events queue: one starts when the last one has sunk.
function dogEvents(run, d, t) {
  const g = grace(run), raw = [];
  for (const [a, b, e, last] of d.pairs) if (!last && e + g <= t && !tk(run, a) && !tk(run, b)) raw.push([e + g, 'laugh', run.timeline[a].x0, null, 0]);
  for (const Rd of d.rounds) if (Rd.e + g <= t) {
    const hit = Rd.ids.filter(id => tk(run, id)), n = hit.length;
    raw.push([Rd.e + g, n === 0 ? 'laugh' : n === Rd.ids.length ? 'cheer' : 'show', n ? run.timeline[hit[n - 1]].x0 : RW / 2, hit, 1]);
  }
  raw.sort((p, q) => p[0] - q[0] || p[4] - q[4]);
  let end = -9; const out = [];
  for (const e of raw) { const s = Math.max(e[0], end); out.push([s, e[1], e[2], e[3]]); end = s + DOG_T; }
  return out;
}
function roundAt(d, t) { let r = d.rounds[0]; for (const Rd of d.rounds) if (Rd.t <= t) r = Rd; return r; }

// the DIRECTOR (kind 'fx', t0 0): banners, the reed shiver list, the dog, the finale; it holds the stage open
class Director extends T.Target {
  constructor(sp, run) {
    super('fx'); this.sp = sp; this.pt = -99; this.fin = -1; this.shootable = false;
    ST.run = run; ST.fin = -1; ST.bursts = []; hook(run);
    if (PARTS) { PARTS.dog.visible = false; }
  }
  meshes() { return []; }
  update(lt, run) {
    const sp = this.sp, t = lt, a = this.pt, live = run.state === 'play' && inPlay();
    for (const Rd of sp.rounds) if (Rd.t > a && Rd.t <= t && live) B.SFX.play('roundBanner', { n: Rd.n });
    // the reed shiver: the last 4 bursts (screen x, stage time)
    const bs = []; for (let i = 1; i < run.timeline.length && bs.length < 4; i++) { const s = run.timeline[i]; if (s.kind === 'bird' && s.t0 <= t && t - s.t0 < 1.2) bs.push([s.x0, s.t0 + s.ra * 0.4]); }
    ST.bursts = bs;
    for (let i = 1; i < run.timeline.length; i++) { const s = run.timeline[i]; if (s.kind === 'bird' && live && s.t0 + s.ra * 0.4 > a && s.t0 + s.ra * 0.4 <= t) B.SFX.play('birdBurst', { u: uOfPx(s.x0) }); }
    if (this.fin < 0 && t >= sp.last && run.state === 'play' && (run.versus || (run.me.hits >= run.cfg.quota && run.me.lives > 0))) {
      this.fin = sp.last; ST.fin = sp.last; ST.run = run;
      if (live) { B.SFX.play('dogCheer'); B.SFX.play('finale'); if (B.G && B.G.duckReact) B.G.duckReact('cheer', 2.4); }
    }
    // LAST BOX: the box is empty with the quota already met -> the finale now (the engine would end the run 1.2 s after
    // the last shell; the stage holds that dry timer through the finale, then ends the run itself; birds still to come
    // stay in the reeds)
    if (this.fin < 0 && !run.versus && !run.practice && run.state === 'play' && run.ammo.type === 'cap' && run.ammo.empty && run.me.hits >= run.cfg.quota && run.me.lives > 0) {
      this.fin = t; this.early = true; ST.fin = t; ST.run = run;
      if (live) { B.SFX.play('dogCheer'); B.SFX.play('finale'); if (B.G && B.G.duckReact) B.G.duckReact('cheer', 2.4); }
    }
    if (this.early && run.state === 'play') { run.dryT = 0; if (t >= this.fin + FIN_HOLD) { run.end('ammo'); return true; } }
    const ev = dogEvents(run, sp, t);
    for (const e of ev) if (e[0] > a && e[0] <= t && live && this.fin < 0) {
      B.SFX.play('dogUp');
      if (e[1] === 'laugh') B.SFX.play('dogLaugh', { u: uOfPx(e[2]) });
      else if (e[1] === 'cheer') { B.SFX.play('dogCheer'); if (B.G && B.G.duckReact) B.G.duckReact('cheer', 1.6); }
    }
    let cur = null; for (const e of ev) if (e[0] <= t && t < e[0] + DOG_T) cur = e;
    ST.dog = cur; ST.dogFin = this.fin >= 0 ? t - this.fin : -1;
    poseDog(run, cur, t, this.fin >= 0 ? t - this.fin : -1);
    this.pt = t;
    return t >= sp.last + (this.fin >= 0 ? FIN_HOLD : 1.0);
  }
}
const _dw = {};
function poseDog(run, ev, t, ft) {
  if (!PARTS) return;
  const D = PARTS, dog = D.dog;
  D.bag.visible = false;
  if (ft >= 0) {                                                // the finale: he hops out of the reeds with the whole bag
    const k = clamp(ft / 0.55, 0, 1), hop = Math.abs(Math.sin(Math.max(0, ft - 0.55) * 5.5)) * 0.12;
    worldAt(RW / 2 - 40, 0, DOG_Z, _dw);
    dog.visible = true; dog.position.set(_dw.x, lerp(DOG_Y0, DOG_Y1 + 0.32, E.outBack(k)) + hop, DOG_Z); dog.rotation.set(0, 0.15, 0);
    D.dBody.visible = true; D.dLaugh.visible = false; D.bag.visible = true;
    D.wings[0].rotation.z = -2.4 + 0.2 * Math.sin(ft * 8); D.wings[1].rotation.z = 2.6 + 0.25 * Math.sin(ft * 8 + 1);
    for (const h of D.held) h.g.visible = false;
    return;
  }
  if (!ev) { dog.visible = false; return; }
  const f = t - ev[0], kind = ev[1];
  const up = f < 0.3 ? E.outBack(f / 0.3) : f < DOG_T - 0.35 ? 1 : 1 - E.inCubic(clamp((f - (DOG_T - 0.35)) / 0.35, 0, 1));
  worldAt(clamp(ev[2], 120, 290), 0, DOG_Z, _dw);
  let y = lerp(DOG_Y0, DOG_Y1, up), wl = 0.25, wr = 0.25;
  const laugh = kind === 'laugh';
  if (laugh) { const s = Math.abs(Math.sin(f * 13)); y += s * 0.05; wl = -0.55 - 0.45 * s; wr = 0.55 + 0.45 * s; }
  else if (kind === 'cheer') { y += Math.abs(Math.sin(f * 7)) * 0.12; wl = -2.5 + 0.2 * Math.sin(f * 12); wr = 2.7 + 0.2 * Math.sin(f * 12 + 1); }
  else { y += 0.02 * Math.sin(f * 6); wr = 2.75; wl = 0.2; }
  dog.visible = up > 0.001; dog.position.set(_dw.x, y, DOG_Z); dog.rotation.set(0, (RW / 2 - ev[2]) * 0.0015, 0);
  D.dBody.visible = !laugh; D.dLaugh.visible = laugh;
  D.wings[0].rotation.z = wl; D.wings[1].rotation.z = wr;
  // the round's birds held up by the feet: 1, 2 or a fistful (up to 5), in their own paint
  const ids = ev[3] || [], n = kind === 'laugh' ? 0 : Math.min(5, ids.length);
  for (let i = 0; i < 5; i++) {
    const h = D.held[i]; h.g.visible = i < n; if (i >= n) continue;
    const sp = run.timeline[ids[ids.length - 1 - i]];
    h.b.geometry = buildArt().body[sp.sch];
    const off = n === 1 ? 0 : (i / (n - 1) - 0.5);
    h.g.position.set(0.5 * DOG_S + off * 0.18, -5.6 * DOG_S, 0.25 + i * 0.01);
    h.g.rotation.set(0.15, 0.35, Math.PI + 0.25 + off * 0.7 - wr);   // hung by the feet: upside down in the world
    h.g.scale.setScalar(0.72);
    h.b.position.set(-0.5 * LS, 5.2 * LS, 0);
  }
}
class Gone extends T.Target { constructor() { super('fx'); } meshes() { return []; } update() { return true; } }
function makeTarget(sp, run) {
  hook(run);
  if (sp.kind === 'dir') return new Director(sp, run);
  if (ST.run === run && ST.fin >= 0 && sp.t0 > ST.fin) return new Gone();   // after an early (LAST BOX) finale
  return new Bird(sp, run);
}

// =========================================================================================
// The dials per tier (variant 0; the variants change the AMMO ONLY; quota share +2 % a variant, cap 90 %)
// rounds = whole ROUNDS of 10 birds (the clock = the last round's dog + FIN_SLOT: ~60-70 s at every tier) | air = AIR TIME s (shootable from clearing the reeds to the getaway) | live [lo, hi] = birds
// in the air at once (a beat's cap is hi with chance l2) | gap / burst / bgap / pause = the range director's beats |
// pair = share of beats that are a PAIR (two bursts pbeat s apart from different spots) | turns = heading changes |
// leg = px per zig-zag leg | hop / alt / adj = AIM TRAVEL (#90) from the last bird you were made to aim at | spare =
// shots over the quota (LAST BOX cap = quota + spare) | share = quota share of the birds
// =========================================================================================
const TIER_P = [
  { rounds: 2, air: 4.0, live: [1, 2], l2: 0.7, gap: [1.15, 1.6], burst: 0.15, bgap: [0.6, 0.8], pause: [0.9, 1.3], pair: 0.2, pbeat: [0.45, 0.65], turns: 2, leg: [85, 150], hop: [0.12, 0.32], alt: 0.25, adj: 0.12, spare: 8, share: 0.55 },
  { rounds: 2, air: 3.2, live: [2, 2], l2: 1, gap: [0.7, 1.0], burst: 0.2, bgap: [0.5, 0.7], pause: [0.7, 1.0], pair: 0.3, pbeat: [0.4, 0.55], turns: 2, leg: [85, 150], hop: [0.22, 0.42], alt: 0.45, adj: 0.15, spare: 5, share: 0.6 },
  { rounds: 3, air: 2.5, live: [2, 3], l2: 0.5, gap: [0.8, 1.15], burst: 0.25, bgap: [0.42, 0.58], pause: [0.8, 1.15], pair: 0.4, pbeat: [0.35, 0.5], turns: 3, leg: [75, 135], hop: [0.35, 0.6], alt: 0.65, adj: 0.17, spare: 3, share: 0.64 },
  { rounds: 4, air: 2.0, live: [3, 3], l2: 1, gap: [0.68, 0.98], burst: 0.3, bgap: [0.36, 0.5], pause: [0.75, 1.05], pair: 0.5, pbeat: [0.3, 0.45], turns: 3, leg: [65, 120], hop: [0.5, 0.8], alt: 0.85, adj: 0.2, spare: 2, share: 0.68 }
];
const VARIANT_NAMES = ['OPEN SEASON', 'THREE SHELLS', 'LAST BOX'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.share = Math.min(0.9, b.share + 0.02 * v);
  c.live = b.live.slice(); c.leg = b.leg.slice();
  c.time = 60; c.quota = 10;
  c.ammo = ['unlimited', { mag: 3, autoReload: true }, { cap: 0 }][v];
  c.tier = tier; c.variant = v; c.title = 'MARSH HUNT'; c.subtitle = VARIANT_NAMES[v];
  if (v === 2) { const est = Object.assign({}, c); timeline(est, B.Stage.mulberry32(0x5eed)); c.ammo = est.ammo; c.quota = est.quota; c.time = est.time; }
  return c;
}
const AIM_D = 440;
// ---------- timeline: the DIRECTOR. Every spawn from the seeded rng only. ----------
// ROUNDS of 10 birds: a ROUND n banner, then beats from BANNER_T: a single (gap after; a burst: a quick follow-up at
// bgap, then a pause) or a PAIR (two bursts pbeat apart from spots >= 90 px apart, a pause after). A beat waits while the
// birds already in the air would exceed the beat's cap (live). AIM TRAVEL: the burst spot (12 seeded candidates x a
// seeded plane depth) closest to the wanted hop from the last bird you were made to aim at (its point 35 % into its air
// time), other side preferred (alt), +2 near a bird already up (adj). The round ends when its last bird is gone; the
// next banner comes while the dog sinks. `rounds` whole rounds (a round is always 10 birds: PERFECT and the dog need it).
// Spawn fields: bird { x0, z, sch, air, ra, w ([lt, px, py] waypoints), ex (getaway point), rd (round), k (index in the
// round), pr (partner id or -1) }; dir { rounds [{ n, t (banner), e (last bird gone), ids }], pairs [[a, b, e, last]], last }.
function timeline(c, rng) {
  rng(); rng(); rng();
  const birds = [], rounds = [], pairsT = [];
  let tR = 0.6, lastAim = null, lastSch = -1;
  const upAt = t => birds.filter(b => b.t0 <= t && b.t0 + b.air > t);
  const aimOf = b => { const p = posPx(b, b.ra + 0.35 * (b.air - b.ra), {}); return [p.x, p.y]; };
  function bird(t, rd, k, avoid) {
    const D = rng.range(c.hop[0], c.hop[1]) * AIM_D, z = rng.range(BIRD_Z[1], BIRD_Z[0]), cands = [];
    for (let i = 0; i < 12; i++) {
      const x = Math.round(72 + (i + 0.15 + 0.7 * rng()) / 12 * 282), p = [x, 108];
      let sc = 0.05 * rng();
      if (lastAim) {
        sc += Math.abs(hyp(p[0] - lastAim[0], 1.6 * (p[1] - lastAim[1])) - D) / AIM_D;
        if ((p[0] < RW / 2) === (lastAim[0] < RW / 2)) sc += 0.35 * c.alt;
      }
      for (const q of upAt(t + 0.4)) { const qp = posPx(q, t + 0.4 - q.t0, {}); if (Math.abs(qp.x - x) < c.adj * AIM_D) sc += 2; }
      if (avoid != null && Math.abs(x - avoid) < 90) sc += 3;
      cands.push([sc, x]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const x0 = cands[0][1], path = makePath(x0, c, rng);
    let sch = Math.floor(rng() * SCHEMES.length) % SCHEMES.length; if (sch === lastSch) sch = (sch + 1) % SCHEMES.length; lastSch = sch;
    const b = { id: 0, t0: r3(t), t1: r3(t + c.air), kind: 'bird', x0, z: r3(z), sch, air: c.air, ra: path.ra, w: path.w, ex: path.ex, rd, k, pr: -1 };
    birds.push(b); lastAim = aimOf(b);
    return b;
  }
  for (let r = 0; r < c.rounds; r++) {
    const Rd = { n: r + 1, t: r3(tR), list: [] };
    let t = tR + BANNER_T, n = 0, quick = false;
    while (n < 10) {
      const pair = n <= 8 && rng() < c.pair, cap = Math.max(pair ? 2 : 1, rng() < c.l2 ? c.live[1] : c.live[0]), need = pair ? 2 : 1;
      for (let g = 0; g < 60; g++) { const up = upAt(t); if (up.length + need <= cap) break; t = Math.min(...up.map(b => b.t0 + b.air)) + 0.05; }
      const b1 = bird(t, r, n++); Rd.list.push(b1);
      if (pair) {
        const t2 = t + rng.range(c.pbeat[0], c.pbeat[1]), b2 = bird(t2, r, n++, b1.x0); Rd.list.push(b2);
        pairsT.push([b1, b2]); t = t2 + rng.range(c.pause[0], c.pause[1]); quick = false;
      } else if (!quick && n < 10 && rng() < c.burst) { t += rng.range(c.bgap[0], c.bgap[1]); quick = true; }
      else { t += quick ? rng.range(c.pause[0], c.pause[1]) : rng.range(c.gap[0], c.gap[1]); quick = false; }
    }
    Rd.e = r3(Math.max(...Rd.list.map(b => b.t0 + b.air + EXIT_T)));
    rounds.push(Rd);
    tR = Rd.e + GRACE_V + DOG_T - 0.4;
  }
  const lastR = rounds[rounds.length - 1], last = r3(lastR.e + GRACE_V + DOG_T + 0.15);
  const dir = { id: 0, t0: 0, t1: r3(last + FIN_HOLD), kind: 'dir', rounds: [], pairs: [], last };
  const out = [dir, ...birds.sort((a, b) => a.t0 - b.t0)];
  out.forEach((s, i) => { s.id = i; });
  for (const [a, b] of pairsT) { a.pr = b.id; b.pr = a.id; }
  dir.rounds = rounds.map(Rd => ({ n: Rd.n, t: Rd.t, e: Rd.e, ids: Rd.list.map(b => b.id) }));
  dir.pairs = pairsT.map(([a, b]) => { const e = r3(Math.max(a.t0 + a.air, b.t0 + b.air) + EXIT_T), Rd = rounds[a.rd]; return [a.id, b.id, e, e >= Rd.e - 1e-6 ? 1 : 0]; });
  const nB = birds.length;
  c.birdCount = nB; c.roundCount = rounds.length; c.pairCount = pairsT.length; c.goodCount = nB;
  c.time = Math.ceil(last + FIN_SLOT);
  c.quota = Math.max(4, Math.min(nB - c.spare, Math.round(nB * c.share)));
  if (c.ammo && c.ammo.cap != null) c.ammo = { cap: c.quota + c.spare };
  return out;
}
// points: a bird 100, +50 QUICK SHOT (within 0.6 s of clearing the reeds), +100 PAIR (its partner already taken by the
// same player), +500 PERFECT ROUND (this hit makes 10 of 10 in its round for one player). Pure in run.taken + the player
// (the applyHit hook), so versus scores the same on both tabs (the guest replays the host's awards in order).
function points(sp, lt) {
  if (sp.kind !== 'bird') return 0;
  let p = 100 + (lt - sp.ra <= QUICK ? 50 : 0);
  const run = CUR.run, by = CUR.by;
  if (run && by >= 0 && run.timeline[sp.id] === sp) {
    if (sp.pr >= 0 && run.taken.get(sp.pr) === by) p += 100;
    const Rd = run.timeline[0].rounds && run.timeline[0].rounds[sp.rd];
    if (Rd && Rd.ids.length === 10 && Rd.ids.every(id => id === sp.id || run.taken.get(id) === by)) p += 500;
  }
  return p;
}
function briefing(c) {
  const HINTS = ['SHOOT THEM AS THEY CLEAR THE REEDS: +50!', 'BOTH BIRDS OF A PAIR: +100!', '10 OF 10 IN A ROUND: +500!', 'THEY ZIG-ZAG: LEAD THEM!'];
  return { rule: [['SHOOT ', 'void'], [c.quota + ' BIRDS', 'red'], [' OR MORE!', 'void']], icon: 'bird', unit: 'BIRDS',
    dont: null, tip: 'SHOOT THEM BEFORE THEY FLY AWAY!', hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}

// =========================================================================================
// HUD: the briefing icon, the level card, the tally strip, the ROUND n banner, PERFECT!
// =========================================================================================
// a tin bird mid-flap (side view, flying right) in pixels: r = the icon radius; f = flap frame (0 up, 1 down)
function birdPix(r, f, S) {
  S = S || SCHEMES[0];
  const bw = r * 0.62, bh = r * 0.4, hx = r * 0.48, hy = -r * 0.22, hr = r * 0.27;
  return (x, y) => {                                            // x, y relative to the centre; returns a palette name or null
    const eb = ((x / bw) ** 2 + (y / bh) ** 2), eh = Math.hypot(x - hx, y - hy) / hr;
    const wy = f ? y - r * 0.05 : y + r * 0.05, wx = x + r * 0.08;
    const wing = f ? (wy > 0 && wy < r * 0.6 && Math.abs(wx + wy * 0.3) < r * 0.3 * (1 - wy / (r * 0.62)))
                   : (wy < 0 && wy > -r * 0.72 && Math.abs(wx - wy * 0.35) < r * 0.3 * (1 + wy / (r * 0.75)));
    const beak = x > hx + hr * 0.7 && x < hx + hr * 1.8 && Math.abs(y - hy - r * 0.04) < r * 0.09 * (1 - (x - hx - hr * 0.7) / (hr * 1.2));
    const tail = x < -bw * 0.75 && x > -bw * 1.45 && y > -r * 0.05 - (-x - bw * 0.75) * 0.55 && y < r * 0.08;
    const key = Math.abs(x + r * 0.08) < r * 0.05 && y < -bh * 0.85 && y > -bh * 1.35 || (Math.hypot(x + r * 0.2, y + bh * 1.5) < r * 0.1 || Math.hypot(x + r * -0.04, y + bh * 1.5) < r * 0.1);
    if (wing) { const e = Math.abs(f ? wy - r * 0.55 : wy + r * 0.66) < r * 0.12; return e ? S.edge : S.wing; }
    if (eh < 1) { const ex = x - hx - hr * 0.25, ey = y - hy + hr * 0.1, ed = Math.hypot(ex, ey); return ed < hr * 0.28 ? 'void' : ed < hr * 0.5 ? 'bone' : S.body; }
    if (beak) return S.beak;
    if (eb < 1) { if (Math.abs(x + r * 0.05) < r * 0.05) return 'steel'; return y > bh * 0.3 ? S.belly : S.body; }
    if (tail) return S.tail;
    if (key) return 'haze';
    return null;
  };
}
function outlined(key, w, h, f) {                               // pixImg with a 1 px void outline round whatever f draws
  const H = B.HUD;
  return H.pixImg(key, w, h, (x, y) => {
    const c = f(x, y); if (c) return c;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && f(x + dx, y + dy)) return 'void';
    return null;
  });
}
// briefing card icon: a tin bird mid-flap with a motion whoosh behind it
function drawIcon(cx, cy, r, t = 0) {
  const H = B.HUD, f = Math.floor(t * 4) & 1, W = Math.round(r * 2.6), Hh = Math.round(r * 2.1), ox = W * 0.58, oy = Hh * 0.5, px = birdPix(r * 0.95, f);
  const img = outlined('mh_icon_' + r + '_' + f, W, Hh, (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= Hh) return null;
    const c = px(x - ox, y - oy); if (c) return c;
    return null;
  });
  // the whoosh: three mist / bone streaks behind (not outlined)
  const wk = H.pixImg('mh_whoosh_' + r + '_' + f, W, Hh, (x, y) => {
    const lines = [[-0.28, 0.5], [0.0, 0.62], [0.24, 0.45]];
    for (let i = 0; i < 3; i++) { const [ly, len] = lines[i], yy = oy + ly * r, x1 = ox - r * 0.75, x0 = x1 - len * r * (f ? 1.1 : 0.9); if (Math.abs(y - yy) < 0.6 + (i === 1 ? 0.5 : 0) && x > x0 && x < x1 && ((x + i) % 5) !== 0) return x < x0 + len * r * 0.35 ? 'mist' : 'bone'; }
    return null;
  });
  H.draw(wk, cx - ox, cy - oy); H.draw(img, cx - ox, cy - oy);
}
// the level card (56 x 32, centred): the sunset sky over the treeline, the moon, a tin bird, water, the reed line
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
function drawCard(cx, cy, t = 0) {
  const H = B.HUD, W = 56, Hc = 32, x0 = Math.round(cx - W / 2), y0 = Math.round(cy - Hc / 2), f = Math.floor(t * 3) & 1;
  const SKY = ['indigo', 'plum', 'magenta', 'coral', 'orange', 'amber'];
  const bg = H.pixImg('mh_card_bg', W, Hc, (x, y) => {
    const tree = 17 - Math.round(2.5 * Math.abs(Math.sin(x * 0.9)) + 2 * H32(x, 3) + (x % 7 === 3 ? 2 : 0));
    if (y >= 25) {                                              // the reed line + cattails
      return (x * 7 + y * 3) % 5 === 0 ? 'green' : y === 25 && x % 3 === 0 ? 'tan' : y > 28 ? 'void' : 'forest';
    }
    if (y >= 23 - ((x * 5) % 3 === 0 ? 2 : 0) && x % 4 !== 1) return x % 9 === 0 && y < 24 ? 'chestnut' : 'forest';
    if (y >= 19) {                                              // the water: the sky mirrored, darker; the sun's glitter
      if (x > 40 && x < 46 && (y + x) % 2 === 0) return 'yellow';
      if ((x * 3 + y * 7) % 11 === 0) return 'coral';
      return ['magenta', 'plum', 'plum', 'indigo'][clamp(Math.floor((y - 19) + bay(x, y) * 1.2 - 0.3), 0, 3)];
    }
    if (y >= tree) return 'void';
    if (Math.hypot(x - 43, y - 14) < 3.3) return Math.hypot(x - 43, y - 14) < 2 ? 'lemon' : 'yellow';
    const k = y / 18, v = k * 5 + bay(x, y) * 0.9 - 0.45, s = clamp(Math.floor(v), 0, 5);
    if (Math.hypot(x - 10, y - 7) < 3.6) return Math.hypot(x - 9, y - 6.5) < 1.2 ? 'mist' : x > 11 ? 'mist' : 'bone';
    return SKY[s];
  });
  H.draw(bg, x0, y0);
  const bp = birdPix(8, f, SCHEMES[0]);
  const bird = outlined('mh_card_bird_' + f, 22, 18, (x, y) => (x < 0 || y < 0 || x >= 22 || y >= 18) ? null : bp(x - 11, y - 9));
  H.draw(bird, x0 + 18 + (f ? 0 : 1), y0 + 3);
}
// the tally strip: 10 small bird silhouettes over the timer, between the HUD duck and the gun
const TALLY = ['...##......', '....##.....', '##...##.##.', '###########', '.########..', '....#.#....'];
function tallyImg(col) {
  const H = B.HUD, w = TALLY[0].length, h = TALLY.length;
  return outlined('mh_tally_' + col, w + 2, h + 2, (x, y) => { const r = TALLY[y - 1]; return r && r[x - 1] === '#' ? col : null; });
}
function drawHud(run, hs, t) {
  if (!run || run.stage !== ID || !run.timeline || !run.timeline[0] || run.practice) return;
  const H = B.HUD, d = run.timeline[0], st = Math.max(0, run.t), Rd = roundAt(d, st);
  if (!Rd) return;
  // the strip: a dark plate, ROUND n, ten birds (red / blue = hit by P1 / P2, grey = flew away, blinking = in the air)
  const n = Rd.ids.length, x0 = Math.round(RW / 2 - n * 12 / 2) + 1, y0 = 190;
  H.draw(H.pixImg('mh_plate' + n, n * 12 + 4, 12, (x, y) => { const cx = Math.min(x, n * 12 + 3 - x), cy = Math.min(y, 11 - y); if (cx + cy < 2) return null; return cx === 0 || cy === 0 ? 'void' : 'midnight'; }), x0 - 3, y0 - 2);
  H.text3r('R' + Rd.n, x0 - 5, y0 + 1, 'lemon', 1, 'void');
  const g = grace(run);
  for (let i = 0; i < n; i++) {
    const id = Rd.ids[i], sp = run.timeline[id], by = run.taken.has(id) ? run.taken.get(id) : -9;
    let col = 'navy';
    if (by >= 0) col = by === 1 ? 'blue' : 'red';
    else if (st >= sp.t0 + sp.air + (run.versus ? g : 0)) col = 'steel';
    else if (st >= sp.t0) col = ((st * 6) | 0) % 2 ? 'bone' : 'mist';
    H.draw(tallyImg(col), x0 + i * 12, y0);
  }
  // ROUND n banner (bold, x2) at its banner time
  const bt = st - Rd.t;
  if (run.state === 'play' && bt >= 0 && bt < BANNER_T) {
    const y = Math.round(44 - 10 * Math.max(0, 1 - bt / 0.15));
    if (bt < BANNER_T - 0.25 || ((bt * 12) | 0) % 2) { H.textBc('ROUND ' + Rd.n, RW / 2 + 1, y + 1, 'rust', 2); H.textBc('ROUND ' + Rd.n, RW / 2, y, 'lemon', 2, 'void'); }
  }
  // PERFECT! with the dog's cheer
  const ev = ST.run === run ? ST.dog : null;
  if (ev && ev[1] === 'cheer') {
    const f = st - ev[0];
    if (f < DOG_T - 0.2 && ((f * 8) | 0) % 4 !== 3) { H.textBc('PERFECT!', RW / 2, 40, 'yellow', 2, 'void'); H.text3c('+500', RW / 2, 58, 'lemon', 2, 'void'); }
  }
}

// =========================================================================================
// SOUNDS (recipes defined here with B.SFXKit.def; nothing appended to sfx-stage.js) + the 'marsh' ambience bed
// =========================================================================================
{
  const K = B.SFXKit;
  if (K && K.def) {
    const tone = (v, o) => K.tone(v, o), noise = (v, o) => K.noise(v, o);
    const tin = (v, f, at, g, d = 0.18) => K.bell(v, { f, at, d, g, ratios: [1, 2.76, 5.4, 8.9], amps: [1, 0.5, 0.3, 0.15], damp: 1.3 });
    K.def('birdBurst', { max: 3, gap: 0.05, pv: 0.8, dv: 0.1, verb: 0.08, pri: 2, gain: 5.0 },
      v => {                                 // a bird bursts out of the reeds: a reed rustle, a flurry of tin wings, a toy chirp
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 1400, ff2: 3200, fft: 0.25, q: 1.1, a: 0.02, d: 0.25, g: 0.06 });
        for (let k = 0; k < 6; k++) noise(v, { ft: 'bandpass', ff: v.r(900, 1600), q: 2.5, at: 0.05 + k * 0.045, a: 0.002, d: 0.03, g: 0.05, nd: true });
        tin(v, v.r(2600, 3100), 0.06, 0.012, 0.08);
        tone(v, { type: 'triangle', f: 1900, fs: [[0.05, 2700], [0.1, 2200]], at: 0.12, a: 0.004, d: 0.08, g: 0.03 });
        return 0.5;
      });
    K.def('birdFlap', { max: 3, gap: 0.08, pv: 0.6, dv: 0.1, verb: 0.06, pri: 1, gain: 5.0 },
      v => {                                 // a heading change: three stiff tin flaps (a clatter + a wind-up tick)
        for (let k = 0; k < 3; k++) { noise(v, { ft: 'bandpass', ff: 1200, q: 2, at: k * 0.065, a: 0.002, d: 0.035, g: 0.045, nd: true }); tin(v, 2400 + k * 140, k * 0.065, 0.008, 0.06); }
        tone(v, { type: 'square', f: 3200, at: 0.2, a: 0.001, d: 0.012, g: 0.008, lp: 5000, np: true });
        return 0.32;
      });
    K.def('birdHit', { max: 2, gap: 0.04, pv: 0.5, dv: 0.08, verb: 0.1, pri: 3, gain: 2.0 },
      v => {                                 // a bird shot: a tin CLANK, a squawk, a little spring boing
        tin(v, 880, 0, 0.06, 0.35); tin(v, 1320, 0.005, 0.03, 0.22);
        K.voice(v, { f: 760, fs: [[0.05, 980], [0.16, 520]], at: 0.02, a: 0.006, hold: 0.06, d: 0.1, g: 0.09, formants: [[900, 5, 1], [1700, 8, 0.6], [3000, 10, 0.25]] });
        tone(v, { f: 260, f2: 620, ft: 0.18, at: 0.14, a: 0.004, d: 0.16, g: 0.04, vib: [22, 0.08] });
        return 0.5;
      });
    K.def('birdFall', { max: 3, gap: 0.05, pv: 0.4, dv: 0.08, verb: 0.1, pri: 1, gain: 3.5 },
      v => {                                 // it drops into the reeds: a falling whistle, then a swish and a little splash
        tone(v, { f: 1700, f2: 420, ft: 0.62, a: 0.01, hold: 0.45, d: 0.15, g: 0.03 });
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 2200, ff2: 900, fft: 0.2, q: 1.2, at: 0.6, a: 0.01, d: 0.18, g: 0.05 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 700, at: 0.66, a: 0.004, d: 0.14, g: 0.08 });
        return 0.9;
      });
    K.def('birdAway', { max: 2, gap: 0.1, pv: 0.4, dv: 0.08, verb: 0.15, pri: 1, gain: 3.5 },
      v => {                                 // it got away: a fading flutter of tin wings + two receding chirps
        for (let k = 0; k < 9; k++) noise(v, { ft: 'bandpass', ff: 1300 - k * 50, q: 2.5, at: k * 0.06, a: 0.002, d: 0.03, g: 0.045 * (1 - k / 9), nd: true });
        tone(v, { type: 'triangle', f: 2300, fs: [[0.05, 2900]], at: 0.08, a: 0.004, d: 0.06, g: 0.022 });
        tone(v, { type: 'triangle', f: 2100, fs: [[0.05, 2700]], at: 0.3, a: 0.004, d: 0.06, g: 0.011 });
        return 0.65;
      });
    K.def('dogUp', { max: 1, gap: 0.2, pv: 0.3, dv: 0.06, verb: 0.08, pri: 2, gain: 4.0 },
      v => {                                 // the dog pops up out of the reeds: a reed swish + a short "hup!"
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 900, ff2: 2600, fft: 0.18, q: 1, a: 0.02, d: 0.2, g: 0.07 });
        K.voice(v, { f: 330, fs: [[0.06, 420]], at: 0.06, a: 0.008, hold: 0.04, d: 0.07, g: 0.07, formants: [[650, 5, 1], [1100, 7, 0.6], [2500, 10, 0.2]] });
        return 0.4;
      });
    K.def('dogLaugh', { max: 1, gap: 0.3, pv: 0.2, dv: 0.04, verb: 0.1, pri: 3, gain: 3.0 },
      v => {                                 // the double miss: "heh-heh-heh-heh" on a belly-slap rhythm (slap, heh, slap, heh)
        for (let k = 0; k < 7; k++) {
          const at = 0.04 + k * 0.15;
          K.voice(v, { f: 300 + (k % 2) * 40, fs: [[0.05, 250]], at, a: 0.005, hold: 0.03, d: 0.06, g: 0.08, formants: [[700, 5, 1], [1200, 7, 0.7], [2600, 10, 0.25]], np: true });
          if (k % 2 === 0) noise(v, { kind: 'brown', ft: 'lowpass', ff: 500, at: at - 0.02, a: 0.002, d: 0.05, g: 0.12, nd: true });
        }
        return 1.2;
      });
    K.def('dogCheer', { max: 1, gap: 0.3, pv: 0.2, dv: 0.04, verb: 0.15, pri: 3, gain: 2.2 },
      v => {                                 // a perfect round / the finale: a rising "yahoo!" over a three-note toot
        K.voice(v, { f: 330, fs: [[0.12, 420], [0.3, 640], [0.45, 560]], at: 0.0, a: 0.01, hold: 0.32, d: 0.15, g: 0.08, formants: [[750, 5, 1], [1250, 7, 0.6], [2700, 10, 0.25]] });
        [523, 659, 784].forEach((f, i) => tone(v, { type: 'square', f, at: 0.1 + i * 0.1, a: 0.004, hold: 0.06, d: 0.12, g: 0.02, lp: 2600, np: true }));
        return 0.8;
      });
    K.def('roundBanner', { max: 1, gap: 0.5, pv: 0, dv: 0.03, verb: 0.15, pri: 3, gain: 4.0 },
      v => {                                 // ROUND n: a duck-call toot (two nasal honks) and a bright ding
        for (const [at, f] of [[0, 440], [0.2, 520]]) K.voice(v, { type: 'sawtooth', f, fs: [[0.06, f * 0.88]], at, a: 0.01, hold: 0.08, d: 0.06, g: 0.06, formants: [[1100, 6, 1], [2300, 9, 0.5]], np: true });
        K.bell(v, { f: 1568, at: 0.42, d: 0.35, g: 0.03, ratios: [1, 2.0, 3.01], amps: [1, 0.35, 0.15], damp: 1.3 });
        return 0.8;
      });
    // the marsh bed: crickets, a frog now and then, water lapping, wind in the reeds. Hooked into K.beds as 'marsh'.
    K.stageBeds = K.stageBeds || {};
    K.stageBeds.marsh = (ctx, bus) => {
      const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
      out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 2.5); out.connect(bus);
      const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; param.value = base; o.connect(gn).connect(param); o.start(now); srcs.push(o); };
      const loop = (kind, type, f, q, g) => { const s = ctx.createBufferSource(), fl = K.filt(ctx, type, f, q), gn = K.gain(ctx, g); s.buffer = K.noiseBuf(ctx, kind); s.loop = true; s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s); return { f: fl, g: gn }; };
      const wind = loop('pink', 'bandpass', 700, 0.6, 0.012); lfo(0.09, 0.008, wind.g.gain, 0.012); lfo(0.05, 260, wind.f.frequency, 700);
      const lap = loop('brown', 'lowpass', 380, 0.7, 0.022); lfo(0.32, 0.012, lap.g.gain, 0.016);
      const chirp = t => {                   // a cricket: a short burst of 3-5 high pulses
        const n = 3 + Math.floor(Math.random() * 3), f = 4200 + Math.random() * 600;
        for (let k = 0; k < n; k++) { const a = t + k * 0.045, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.0016, a + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.03); o.connect(g).connect(out); o.start(a); o.stop(a + 0.04); }
      };
      const croak = t => {                   // a frog: "rib-bit", two low buzzy pulses
        for (const [dt, f] of [[0, 120], [0.17, 150]]) { const a = t + dt, o = ctx.createOscillator(), fl = K.filt(ctx, 'lowpass', 600, 2), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, a); o.frequency.linearRampToValueAtTime(f * 0.85, a + 0.11); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.006, a + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.12); o.connect(fl).connect(g).connect(out); o.start(a); o.stop(a + 0.14); }
      };
      let stopped = false, nc = now + 0.6, nf = now + 2.5;
      return {
        tick(until) {
          if (stopped) return; const c = ctx.currentTime;
          if (nc < c - 0.5) nc = c + 0.3; if (nf < c - 0.5) nf = c + 1;
          while (nc < until) { try { chirp(nc); } catch (e) {} nc += 0.35 + Math.random() * 0.9; }
          while (nf < until) { try { croak(nf); } catch (e) {} nf += 2.5 + Math.random() * 5; }
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
    if (K.beds && !K.beds.marsh) K.beds.marsh = K.stageBeds.marsh;
  }
}
// (no life is ever lost in this stage; penalty is the engine's field for a bomb / bystander, which never exist here)
B.Stage.register({ id: ID, name: 'MARSH HUNT', short: 'MARSH', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon, drawCard, drawHud,
  TIER_P, SCHEMES, posPx, worldAt, scr, reedRow, dogEvents, roundAt, buildArt, ST, HZ,
  EXIT_T, FREEZE, QUICK, BANNER_T, DOG_T, GRACE_V, GRACE_S, FIN_HOLD, FIN_SLOT, DOG_Z, BIRD_Z, parts: () => PARTS });
})(window.BLAM);
