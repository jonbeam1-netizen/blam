'use strict';
/* =========================================================================================
   B.L.A.M. stages/dock.js -- Stage 13: THE DOCK (DESIGN-STAGES.md section 13, Fable; Jon answered 2026-11-01).
   SIMPLE on purpose: one mechanic (shoot the cannonballs before they hit the boat), three variants that differ in
   AMMO ONLY.
   THE SET: a harbour at sunset (the engine's fixed camera). A sunset sky with streaks of cloud that darkens over the
   round (the post pass dithers it), the sun low between the ships, open water that mirrors it (swell bands, the sun's
   glitter column), a far town on the left hills and a headland with a LIGHTHOUSE on the right (its lamp turns), a stone
   quay on the left with a boathouse wearing the "B.L.A.M." / "HARBOUR" sign, a pier on pilings with a lamp post at its
   end (barrels, a crate, a rope coil, two gulls perched), a red-and-bone BUOY with a light, gulls wheeling (one
   instanced draw call).
   TWO OR THREE PIRATE SHIPS on the horizon (broadside, a row of five red-lidded gun ports each, square sails, Jolly
   Rogers, lanterns). DEPUTY DUCK sits in a little red ROWBOAT in the lower middle (stern to the camera, "DEPUTY" on the
   transom, oars out), range.js's placeholder voxel duck style (sheriff hat, star; js/duck.js untouched).
   THE MECHANIC: the ships FIRE CANNONBALLS at the boat (a port glows, flashes, smoke, cannonFire). EVERY ball is aimed
   at the boat on a pure arc in lt (ballAt(sp, lt)): small on the horizon, growing as it comes, a smoke trail, a faint
   whistle. Shot: it bursts into iron bits over the water (ballPop, then a splash), HIT +100 (+50 in the first third of
   its flight). Unshot: a THUD on the hull (hullThud + splash), the boat rocks, LIFE -1 and -300 through the engine's
   own penalty path exactly as INVASION's landing hook (run.penaltyNow(i, 'bomb', ...), read from run.taken, so a ball
   shattered locally but never awarded still lands). The duck DUCKS AND COVERS when a ball is 0.6 s from the boat
   (wings over his head), peeks out after, and shakes a fist at the ships after a hit (cosmetic only).
   FINALE (quota met): the ships run up WHITE FLAGS spelling B.L.A.M. up the masts and the duck rows off toward the pier
   waving.
   Every ball, its port, arc and impact, the duck's poses and the boat's rocking are pure functions of (seed, tier,
   variant), the stage clock and run.taken -> versus-safe.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets;
const clamp = E.clamp, ID = 'dock', RW = R.RW, RH = R.RH;
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
// LAYOUT (world units, ~1 m; camera eye y 1.9, z 5; horizon at row ~99)
// =========================================================================================
const HZ = scr(0, CAMP.y, CAMP.z - 1e5)[1];                     // the horizon row
const SKY_Z = -50, FAR_Z = -44, SHIP_Z = -24, BEAM = 1.05;
const SHIP_X = { 2: [-8, 8], 3: [-10.5, 0.5, 11.5] };            // ship centres by ship count (left .. right)
const SHIP_MIR = { 2: [false, true], 3: [false, false, true] };   // mirrored = bow to the left
const PORT_X = [-2.0, -1.0, 0, 1.0, 2.0], PORT_Y = 0.62, PORT_Z = SHIP_Z + BEAM + 0.14;
const MAST_X = [-0.4, 1.7], MAST_TOP = [9.0, 8.2];               // main, fore (ship-local, bow +x)
const BOAT = { x: 0, z: -2.0, yaw: 0.7 };                        // the rowboat's centre; yaw: the bow points back-left (3/4 view)
const BL = 2.3, BHW = 0.55, GUN = 0.38, DS = 0.068;              // boat length, half beam, gunwale height; duck voxel
// aim points on the boat [dx, y, dz] (bow, the bow quarters, the gunwales beside the duck)
const AIMS = [[0, 0.56, -1.02], [-0.3, 0.5, -0.72], [0.3, 0.5, -0.72], [-0.46, 0.46, -0.18], [0.46, 0.46, -0.18]];
const BALL_R = 0.27, MIN_PX = 3.2, RA = 0.12, COVER = 0.6, FIST = 1.5, PEEK = 0.5, PRE = 0.38, GRACE_V = 1.0;
const FIN_HOLD = 5.0, FIN_SLOT = 5.4, FLAG_T0 = 0.5, FLAG_DT = 0.32, FLAG_UP = 0.9;
const AIM_D = 440;
const PIER = { x0: -11.6, x1: -4.6, z0: -14.8, z1: -13.0, y: 0.78 }, SHED = { x0: -15.4, x1: -11.9, z0: -17.0, z1: -14.2, y: 0.72 };
const BUOY = { x: 5.4, z: -5.2 }, LIGHT = { x: 29, z: -39.4 };
const FIN_TO = { x: -2.9, z: -7.8, yaw: 1.05 };                  // the finale: he rows off toward the pier

// =========================================================================================
// MATERIALS (unlit set with baked colours; env dither class = alpha 0.5, objects = 1)
// =========================================================================================
const M_ENV = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.NoBlending, fog: false });
const M_OBJ = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const M_GLOW = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const glc = n => 'vec3(' + [16, 8, 0].map(s => (((PAL[n] >> s) & 255) / 255).toFixed(4)).join(', ') + ')';
const SKY_U = { uDusk: { value: 0 }, uHz: { value: HZ }, uSun: { value: new THREE.Vector3(252, 88, 10) }, uT: { value: 0 } };
const SKY_GLSL = `
uniform float uDusk; uniform float uHz; uniform vec3 uSun; uniform float uT;
vec3 ramp6(float k, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, vec3 f) {
  if (k < 0.28) return mix(a, b, k / 0.28);
  if (k < 0.5) return mix(b, c, (k - 0.28) / 0.22);
  if (k < 0.7) return mix(c, d, (k - 0.5) / 0.2);
  if (k < 0.87) return mix(d, e, (k - 0.7) / 0.17);
  return mix(e, f, (k - 0.87) / 0.13);
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
float band(vec2 px, float c, float h, float ph) {     // a streak of stratus: < 0 = outside, else 0 top .. 1 underside
  float x = px.x + uT * 1.6 + ph * 40.0;
  float w = h * clamp(0.45 + 0.7 * sin(x * 0.019 + ph) + 0.45 * sin(x * 0.057 + ph * 1.7), 0.0, 1.0);
  float d = px.y - (c + 1.6 * sin(x * 0.043 + ph));
  return abs(d) < w ? (d + w) / (2.0 * w) : -1.0;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, ${RH.toFixed(1)} - gl_FragCoord.y);
  vec3 c = skyAt(px.y);
  if (px.y > uHz) { gl_FragColor = vec4(skyAt(max(0.0, uHz - (px.y - uHz) * 1.5)) * 0.7 + ${glc('navy')} * 0.14, 0.5); return; }
  float d = length(px - uSun.xy);
  if (d < uSun.z) c = d < uSun.z * 0.62 ? ${glc('lemon')} : ${glc('yellow')};
  else if (d < uSun.z + 2.5) c = mix(c, ${glc('orange')}, 0.75);
  else if (d < uSun.z * 3.4) c = mix(c, ${glc('amber')}, 0.38 * (1.0 - uDusk) * (1.0 - (d - uSun.z) / (uSun.z * 2.4)));
  float st = hsh(floor(px));
  if (uDusk > 0.3 && px.y < uHz - 30.0 && st > 0.9975 - 0.002 * uDusk) c = mix(c, ${glc('bone')}, clamp((uDusk - 0.3) * 2.5, 0.0, 1.0) * (0.6 + 0.4 * sin(uT * 3.0 + st * 90.0)));
  for (int i = 0; i < 3; i++) {
    float fi = float(i), b = band(px, 26.0 + fi * 21.0 + fi * fi * 2.0, 2.6 + fi * 0.9, fi * 2.3 + 0.7);
    if (b >= 0.0) {
      vec3 body = mix(mix(${glc('plum')}, ${glc('magenta')}, fi * 0.45), ${glc('indigo')}, uDusk * 0.8);
      vec3 lit = mix(mix(${glc('coral')}, ${glc('orange')}, fi * 0.5), ${glc('magenta')}, uDusk * 0.8);
      c = b > 0.62 ? lit : body;
    }
  }
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
  vec3 c = skyAt(max(0.0, uHz - below * 1.5)) * 0.7 + ${glc('navy')} * 0.14;
  float sw = sin(vW.z * 1.6 + sin(vW.x * 0.28 + uT * 0.45) * 1.3 + uT * 1.05);
  float rip = sin(vW.z * 5.2 + vW.x * 0.6 + sin(vW.x * 1.2 - uT * 0.7) * 0.9 + uT * 1.7);
  if (sw > 0.72 && rip > 0.1) c = mix(c, skyAt(uHz * 0.86), 0.42 * clamp(1.4 - below / 90.0, 0.25, 1.0));
  else if (sw < -0.55) c *= 0.8;
  if (rip > 0.93) c = mix(c, skyAt(uHz * 0.7), 0.3);
  float gw = 3.0 + below * 0.2;
  if (abs(px.x - uSun.x) < gw * (0.55 + 0.45 * sin(vW.z * 2.7 + uT * 1.3)) && rip > 0.3 && uSun.y < uHz + 6.0) c = mix(c, ${glc('yellow')}, 0.8 * (1.0 - uDusk * 0.6) * clamp(1.2 - below / 80.0, 0.0, 1.0));
  gl_FragColor = vec4(c, 0.5);
}`
});
// the cannonball: cast iron toon-shaded from its true normal, a sunset rim on the sun side, a void outline; drawn over
// the set (depthTest off) so the boat or the duck never hides a ball in its last moment
const BALL_MAT = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
  fragmentShader: `varying vec3 vN; varying vec3 vP;
void main() {
  vec3 n = normalize(vN), v = normalize(-vP);
  float d = dot(n, normalize(vec3(-0.45, 0.62, 0.65))), rv = dot(n, v), s = dot(n, normalize(vec3(0.75, 0.25, -0.4)));
  vec3 c = d > 0.93 ? ${glc('haze')} : d > 0.66 ? ${glc('slate')} : d > 0.18 ? ${glc('navy')} : ${glc('midnight')};
  if (s > 0.35 && rv < 0.62) c = ${glc('orange')};
  if (rv < 0.34) c = ${glc('void')};
  gl_FragColor = vec4(c, 1.0);
}`
});
BALL_MAT.transparent = false;
const BALL_GEO = new THREE.IcosahedronGeometry(1, 2);

// =========================================================================================
// THE SHIPS (ship-local: bow +x, the camera side +z; waterline y 0)
// =========================================================================================
const SHIP_S = [
  { sail: 'sand', sail2: 'tan', seam: 'chestnut', hi: 'bone', band: 'oxblood', patch: 'walnut', skull: false },
  { sail: 'bone', sail2: 'mist', seam: 'haze', hi: 'bone', band: 'crimson', patch: null, skull: true },
  { sail: 'tan', sail2: 'chestnut', seam: 'walnut', hi: 'sand', band: 'oxblood', patch: 'umber', skull: false }
];
const SKULL = ['.###.', '#####', '#.#.#', '#####', '.#.#.'];
function rot(v, x0, y0, z0, x1, y1, z1, w, col) {             // a spar / line from point a to b (thickness w), xy-plane angle
  const dx = x1 - x0, dy = y1 - y0, L = hyp(dx, dy), m = new THREE.Matrix4().makeRotationZ(Math.atan2(dy, dx));
  m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); v.box(0, 0, 0, L, w, w, PAL[col], m);
}
function buildShip(si) {
  const S = SHIP_S[si % SHIP_S.length], v = new Vox(), Z = BEAM;
  // hull: columns along x; sheer rises to the stern castle and the forecastle; the hull narrows to the bow
  for (let x = -3.6; x < 3.6 - 1e-6; x += 0.2) {
    const xc = x + 0.1, u = xc / 3.6, bot = -0.55 + 0.45 * u * u, top = 1.22 + 0.25 * u * u, hz = Z * (u > 0.45 ? 1 - 0.85 * ((u - 0.45) / 0.55) ** 2 : u < -0.9 ? 0.86 : 1);
    v.bx(x, bot, -hz, x + 0.2, 0.3, hz, PAL[((x * 5) | 0) % 2 ? 'umber' : 'walnut']);
    v.bx(x, 0.3, -hz, x + 0.2, 0.92, hz, PAL[S.band]);                                       // the gun deck band
    v.bx(x, 0.92, -hz - 0.02, x + 0.2, 1.02, hz + 0.02, PAL.amber);                          // the gilt trim
    v.bx(x, 1.02, -hz, x + 0.2, top, hz, PAL[((x * 5) | 0) % 2 ? 'walnut' : 'chestnut']);
    v.bx(x, top, hz - 0.08, x + 0.2, top + 0.08, hz, PAL.tan);                                // the rail cap (camera side)
    if ((((x + 3.6) * 5) | 0) % 3 === 0) v.bx(x + 0.07, top, hz - 0.07, x + 0.13, top + 0.3, hz - 0.01, PAL.walnut);   // rail posts
  }
  v.bx(-3.6, 0.3, Z - 0.1, -3.4, 1.2, Z + 0.03, PAL.amber);                                   // stern post trim
  // gun ports on the camera side: a void port, a red lid propped up above it, a steel muzzle peeking out
  for (const px of PORT_X) {
    v.bx(px - 0.17, 0.46, Z - 0.02, px + 0.17, 0.8, Z + 0.03, PAL.void);
    v.bx(px - 0.19, 0.84, Z + 0.02, px + 0.19, 0.9, Z + 0.3, PAL.crimson);
    v.bx(px - 0.07, 0.56, Z, px + 0.07, 0.7, Z + 0.16, PAL.slate);
    v.bx(px - 0.05, 0.6, Z + 0.16, px + 0.05, 0.66, Z + 0.17, PAL.void);
  }
  // stern castle (aft) with lit windows and a lantern; a forecastle
  v.bx(-3.6, 1.2, -Z * 0.86, -2.2, 2.25, Z * 0.86, PAL.walnut);
  v.bx(-3.62, 2.1, -Z * 0.88, -2.18, 2.25, Z * 0.88, PAL.amber);
  for (const wx of [-3.35, -2.85]) v.bx(wx - 0.12, 1.5, Z * 0.86, wx + 0.12, 1.85, Z * 0.86 + 0.02, PAL.lemon);
  v.bx(-3.55, 2.25, -0.05, -3.47, 2.85, 0.05, PAL.void); v.bx(-3.62, 2.85, -0.1, -3.4, 3.12, 0.1, PAL.lemon); v.bx(-3.64, 3.12, -0.12, -3.38, 3.18, 0.12, PAL.void);
  v.bx(2.55, 1.4, -Z * 0.7, 3.45, 1.78, Z * 0.7, PAL.walnut); v.bx(2.53, 1.7, -Z * 0.72, 3.47, 1.78, Z * 0.72, PAL.amber);
  rot(v, 3.4, 1.55, 0, 5.3, 2.55, 0, 0.13, 'walnut');                                         // bowsprit
  v.bx(3.75, 1.3, -0.08, 3.95, 1.75, 0.08, PAL.amber);                                        // a gilt figurehead
  // masts with tan bands, a crow's nest on the main, the Jolly Rogers on top
  MAST_X.forEach((mx, i) => {
    const top = MAST_TOP[i];
    v.bx(mx - 0.09, 1.1, -0.09, mx + 0.09, top, 0.09, PAL.walnut);
    for (let y = 2; y < top; y += 1.6) v.bx(mx - 0.1, y, -0.1, mx + 0.1, y + 0.08, 0.1, PAL.tan);
    v.bx(mx - 0.03, top, -0.03, mx + 0.03, top + 0.85, 0.03, PAL.void);
    const fw = i === 0 ? 1.0 : 0.6, fh = i === 0 ? 0.62 : 0.32;                                // the black flag (main) / a red pennant (fore)
    if (i === 0) {
      v.bx(mx + 0.03, top + 0.2, -0.02, mx + 0.03 + fw, top + 0.2 + fh, 0.02, PAL.void);
      SKULL.forEach((row, j) => { for (let k = 0; k < 5; k++) if (row[k] === '#') v.bx(mx + 0.3 + k * 0.09, top + 0.68 - j * 0.09, 0.02, mx + 0.39 + k * 0.09, top + 0.77 - j * 0.09, 0.04, PAL.bone); });
    } else for (let k = 0; k < 5; k++) v.bx(mx + 0.03 + k * 0.12, top + 0.62 - fh + k * 0.03, -0.02, mx + 0.15 + k * 0.12, top + 0.62 - k * 0.03, 0.02, PAL.red);
    if (i === 0) { v.bx(mx - 0.42, 6.75, -0.42, mx + 0.42, 7.05, 0.42, PAL.walnut); v.bx(mx - 0.44, 7.05, -0.44, mx + 0.44, 7.12, 0.44, PAL.tan); }
  });
  // square sails (face-on to the camera, billowed toward it), two per mast, on yards
  const sail = (mx, w, y0, y1, skull) => {
    v.bx(mx - w - 0.15, y1, 0.05, mx + w + 0.15, y1 + 0.11, 0.18, PAL.walnut);              // the yard
    const nx = Math.round(2 * w / 0.2), ny = Math.round((y1 - y0) / 0.2);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x0 = mx - w + i * 0.2, yy = y1 - (j + 1) * 0.2, fx = (i + 0.5) / nx, fy = (j + 0.5) / ny;
      const bul = 0.28 + 0.5 * Math.sin(Math.PI * fx) * Math.sin(Math.PI * Math.min(1, fy * 0.85 + 0.1));
      let col = (j % 3 === 2) ? S.seam : fx < 0.12 || fx > 0.88 ? S.sail2 : S.sail;
      if (fx > 0.35 && fx < 0.62 && fy < 0.45 && j % 3 !== 2) col = S.hi;
      if (j === ny - 1) col = S.sail2;
      if (S.patch && i === Math.round(nx * 0.7) && j === Math.round(ny * 0.55)) col = S.patch;
      if (skull) { const sx = i - Math.round(nx / 2 - 2.5), sy = j - Math.round(ny * 0.3); if (sx >= 0 && sx < 5 && sy >= 0 && sy < 5 && SKULL[sy][sx] === '#') col = 'void'; }
      v.bx(x0, yy, bul, x0 + 0.2, yy + 0.2, bul + 0.08, PAL[col]);
    }
  };
  sail(MAST_X[0], 1.3, 2.25, 4.75, S.skull); sail(MAST_X[0], 1.0, 4.95, 6.65, false);
  sail(MAST_X[1], 1.05, 2.15, 4.25, false); sail(MAST_X[1], 0.82, 4.45, 6.05, false);
  // rigging: stays from the mast heads to the bowsprit and the stern
  rot(v, MAST_X[1], MAST_TOP[1] - 0.1, 0, 5.2, 2.5, 0, 0.06, 'void');
  rot(v, MAST_X[0], MAST_TOP[0] - 0.1, -0.05, MAST_X[1], MAST_TOP[1] - 1.3, -0.05, 0.06, 'void');
  rot(v, -3.5, 2.3, -0.05, MAST_X[0], MAST_TOP[0] - 0.2, -0.05, 0.06, 'void');
  return v.geo();
}
// a big WHITE FLAG with a letter (3x5) and a dot (B. L. A. M.); origin = its top-left corner (the halyard), 2 flutter frames
const FLAG_C = 0.26, FLAG_W = 7, FLAG_H = 7;
function flagGeo(ch, f) {
  const v = new Vox(), t = ch ? R.small(ch) : null, on = new Set();
  if (t) for (const [i, j] of t.px) on.add((i + 1) + ',' + (j + 1));
  if (ch) on.add('5,5');
  for (let i = 0; i < FLAG_W; i++) for (let j = 0; j < FLAG_H; j++) {
    const z = 0.12 * Math.sin(i * 0.9 + f * Math.PI) * (i / FLAG_W), col = on.has(i + ',' + j) ? 'void' : (i + j + f) % 5 === 0 ? 'mist' : 'bone';
    v.bx(i * FLAG_C, -(j + 1) * FLAG_C, z, (i + 1) * FLAG_C, -j * FLAG_C, z + 0.05, PAL[col]);
  }
  v.bx(-0.02, -FLAG_H * FLAG_C, 0.06, 0.04, 0, 0.1, PAL.haze);                                // the hoist edge
  return v.geo();
}

// =========================================================================================
// THE ROWBOAT (boat-local: bow -z, stern +z toward the camera; waterline y 0) + the oars
// =========================================================================================
const bS = z => (z + BL / 2) / BL;                                  // 0 bow .. 1 stern
const bHW = z => { const s = bS(z); return s < 0.4 ? BHW * Math.sqrt(Math.max(0, s) / 0.4) * 0.97 + 0.02 : BHW * (1 - 0.22 * ((s - 0.4) / 0.6) ** 2); };
const bTop = z => { const s = bS(z); return GUN + 0.18 * (1 - s) ** 3 + 0.03 * s * s; };
function boatGeo() {
  const v = new Vox(), DZ = 0.05;
  for (let z = -BL / 2; z < BL / 2 - 1e-6; z += DZ) {
    const zc = z + DZ / 2, w = bHW(zc), top = bTop(zc);
    for (const sd of [-1, 1]) {
      const x0 = sd * w - 0.035, x1 = sd * w + 0.035;
      v.bx(x0, -0.22, z, x1, 0.05, z + DZ, PAL.oxblood);
      v.bx(x0, 0.05, z, x1, top - 0.13, z + DZ, PAL.red);
      v.bx(x0, top - 0.13, z, x1, top - 0.07, z + DZ, PAL.bone);
      v.bx(x0 - (sd > 0 ? 0 : 0.015), top - 0.07, z, x1 + (sd > 0 ? 0.015 : 0), top, z + DZ, PAL.tan);
    }
    for (let x = -w + 0.035; x < w - 0.035 - 1e-6; x += 0.11) v.bx(x, -0.06, z, Math.min(w - 0.035, x + 0.11), 0.04, z + DZ, PAL[((x + 1) * 9 | 0) % 2 ? 'sand' : 'tan']);   // floor planks
  }
  v.bx(-0.04, -0.15, -BL / 2 - 0.05, 0.04, bTop(-BL / 2) + 0.06, -BL / 2 + 0.06, PAL.tan);       // the stem post
  // the transom (faces the camera): red with a bone band, a tan cap and "DEPUTY" in bone
  const zt = BL / 2, wt = bHW(zt - 0.01), tt = bTop(zt - 0.01);
  v.bx(-wt - 0.03, -0.22, zt - 0.06, wt + 0.03, tt - 0.13, zt, PAL.red);
  v.bx(-wt - 0.03, tt - 0.13, zt - 0.06, wt + 0.03, tt - 0.07, zt, PAL.bone);
  v.bx(-wt - 0.04, tt - 0.07, zt - 0.07, wt + 0.04, tt, zt + 0.01, PAL.tan);
  const name = R.small('DEPUTY'), cs = 0.028, nx0 = -name.w * cs / 2, ny0 = tt - 0.17;
  for (const [i, j] of name.px) v.bx(nx0 + i * cs, ny0 - (j + 1) * cs, zt, nx0 + (i + 1) * cs, ny0 - j * cs, zt + 0.012, PAL.bone);
  // thwarts (seats), oarlocks, a rope coil in the bow, a tin bucket
  for (const z of [-0.62, 0.0, 0.78]) { const w = bHW(z); v.bx(-w, 0.22, z - 0.09, w, 0.28, z + 0.09, PAL.chestnut); v.bx(-w, 0.2, z + 0.08, w, 0.22, z + 0.1, PAL.walnut); }
  for (const sd of [-1, 1]) { const w = bHW(0.18); v.bx(sd * w - 0.03, bTop(0.18), 0.15, sd * w + 0.03, bTop(0.18) + 0.08, 0.21, PAL.steel); }
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283, r = 0.11; v.bx(Math.cos(a) * r - 0.03, 0.05, -0.85 + Math.sin(a) * r * 0.8 - 0.03, Math.cos(a) * r + 0.03, 0.1, -0.85 + Math.sin(a) * r * 0.8 + 0.03, PAL[k % 2 ? 'sand' : 'tan']); }
  v.bx(0.18, 0.05, 0.42, 0.34, 0.24, 0.56, PAL.steel); v.bx(0.17, 0.22, 0.41, 0.35, 0.25, 0.57, PAL.haze);
  return v.geo();
}
function oarGeo() {                                                  // pivot = the oarlock; out along +x
  const v = new Vox();
  v.bx(-0.48, -0.025, -0.025, -0.32, 0.025, 0.025, PAL.chestnut);
  v.bx(-0.32, -0.022, -0.022, 1.12, 0.022, 0.022, PAL.tan);
  v.bx(1.05, -0.018, -0.08, 1.48, 0.018, 0.08, PAL.sand);
  v.bx(1.48, -0.018, -0.085, 1.6, 0.018, 0.085, PAL.red);
  return v.geo();
}
// Deputy Duck re-made in range.js's placeholder style (sheriff hat, star); faces: 0 idle, 1 scared (eyes squeezed, beak
// open), 2 angry (red brows, beak open). Separate wings. js/duck.js untouched.
function duckList(face) {
  const M = new Map(), key = (i, j, k) => i + ',' + j + ',' + k, put = (i, j, k, c) => M.set(key(i, j, k), [i, j, k, PAL[c]]);
  for (let i = -5; i <= 5; i++) for (let j = -1; j <= 12; j++) for (let k = -4; k <= 4; k++) {
    const bx = i / 4.6, by = (j - 2.6) / 3.0, bz = k / 3.6, hx = (i - 0.3) / 2.6, hy = (j - 7.3) / 2.6, hz = (k - 0.4) / 2.5;
    if (hx * hx + hy * hy + hz * hz <= 1) put(i, j, k, 'yellow');
    else if (bx * bx + by * by + bz * bz <= 1) put(i, j, k, Math.abs(i) >= 4 && j >= 2 && j <= 4 ? 'amber' : j <= 0 ? 'amber' : 'yellow');
  }
  const front = (i, j) => { for (let k = 6; k >= -6; k--) if (M.has(key(i, j, k))) return k; return null; };
  const at = (i, j, c, dk = 0) => { const k = front(i, j); if (k != null) put(i, j, k + dk, c); };
  if (face === 0) { at(-1, 8, 'void'); at(2, 8, 'void'); at(-1, 9, 'bone'); at(2, 9, 'bone'); }
  else if (face === 1) { at(-2, 8, 'void'); at(-1, 8, 'void'); at(2, 8, 'void'); at(3, 8, 'void'); at(-1, 9, 'amber'); at(2, 9, 'amber'); }
  else { at(-1, 8, 'void'); at(2, 8, 'void'); at(-2, 9, 'red'); at(-1, 9, 'red'); at(2, 9, 'red'); at(3, 9, 'red'); }
  if (face === 0) { for (let i = -1; i <= 1; i++) for (const j of [6, 7]) { const k = front(i, j); if (k != null) { put(i, j, k + 1, 'orange'); if (j === 6) put(i, j, k + 2, 'orange'); } } }
  else {                                                         // the beak open: upper jaw, a void mouth, the lower jaw
    for (let i = -1; i <= 1; i++) { const k7 = front(i, 7), k6 = front(i, 6); if (k7 != null) { put(i, 7, k7 + 1, 'orange'); put(i, 7, k7 + 2, 'orange'); } if (k6 != null) { put(i, 6, k6 + 1, 'oxblood'); put(i, 5, front(i, 5) + 1, 'orange'); put(i, 5, front(i, 5) + 2, 'orange'); } }
  }
  { const k = front(-2, 3); if (k != null) { put(-2, 3, k, 'lemon'); const k4 = front(-2, 4); if (k4 != null) put(-2, 4, k4, 'lemon'); } }   // the deputy star
  for (let i = -3; i <= 4; i++) for (let k = -2; k <= 3; k++) put(i, 10, k, 'tan');                            // hat brim
  for (let i = -1; i <= 2; i++) for (let k = -1; k <= 2; k++) { put(i, 11, k, 'chestnut'); put(i, 12, k, i === 0 && k === 2 ? 'walnut' : 'chestnut'); }
  return [...M.values()];
}
function wingList() {                                               // a wing hanging down from the shoulder (origin)
  const L = [];
  for (let j = -5; j <= 0; j++) for (let i = 0; i <= 1; i++) for (let k = -1; k <= 1; k++) if (!(j === -5 && (i === 1 || Math.abs(k) === 1))) L.push([i, j, k, PAL[j <= -4 ? 'amber' : 'yellow']]);
  return L;
}

// =========================================================================================
// THE HARBOUR SET
// =========================================================================================
let PARTS = null;
function buildFar(v) {                                              // far hills + a town (left), a headland (right), env class
  const z = FAR_Z;
  for (let x = -75; x < -12; x += 0.8) {
    const h = 2.2 + 2.0 * Math.sin(x * 0.11) + 1.2 * Math.sin(x * 0.29 + 1) + 0.6 * H32(Math.floor(x * 2), 1) + (x > -24 ? (x + 24) * -0.18 : 0);
    v.bx(x, -0.2, z, x + 0.82, Math.max(0.4, h), z + 1, PAL[x % 3.2 < 1.6 ? 'midnight' : 'void']);
  }
  for (let x = -60; x < -18; x += 1.4) {                            // the town: houses with lit windows
    const k = Math.floor(x * 3), h = 1.0 + 1.6 * H32(k, 2), w = 0.8 + 0.5 * H32(k, 3), y0 = Math.max(0.2, 1.4 + 1.5 * Math.sin(x * 0.11) + 0.8 * Math.sin(x * 0.29 + 1) - 0.6);
    v.bx(x, y0 - 0.5, z + 1.1, x + w, y0 + h, z + 1.6, PAL.indigo);
    v.bx(x - 0.1, y0 + h, z + 1.1, x + w + 0.1, y0 + h + 0.25, z + 1.6, PAL.void);
    if (H32(k, 4) < 0.7) v.bx(x + w * 0.3, y0 + h * 0.4, z + 1.61, x + w * 0.3 + 0.28, y0 + h * 0.4 + 0.32, z + 1.62, PAL[H32(k, 5) < 0.5 ? 'lemon' : 'amber']);
    if (H32(k, 6) < 0.35) v.bx(x + w * 0.65, y0 + h * 0.62, z + 1.61, x + w * 0.65 + 0.24, y0 + h * 0.62 + 0.28, z + 1.62, PAL.amber);
  }
  for (let x = 14; x < 80; x += 0.7) {                              // the headland: cliffs rising to the right
    const h = 1.0 + (x - 14) * 0.16 + 1.2 * Math.sin(x * 0.21) + 0.5 * H32(Math.floor(x * 3), 7);
    v.bx(x, -0.2, z + 4, x + 0.72, Math.max(0.3, h), z + 5, PAL[(Math.floor(x * 1.4)) % 4 === 0 ? 'indigo' : 'midnight']);
    v.bx(x, Math.max(0.3, h) - 0.25, z + 5, x + 0.72, Math.max(0.3, h), z + 5.05, PAL.plum);
  }
}
function buildQuay(v) {                                             // the stone quay (left) and the boathouse with the sign
  for (let x = -40; x < -11.4; x += 0.6) for (let y = 0; y < 0.72; y += 0.24) v.bx(x, y - 0.24 * 0.5 + 0.06, -40, x + 0.6, y + 0.24, -13.4, PAL[((x / 0.6 + y / 0.24 * 7) | 0) % 3 === 0 ? 'slate' : 'navy']);
  for (let z = -40; z < -13.4; z += 0.6) v.bx(-11.6, -0.2, z, -11.4, 0.72, z + 0.58, PAL[((z / 0.6) | 0) % 2 ? 'slate' : 'steel']);
  v.bx(-40, 0.72, -40, -11.4, 0.78, -13.4, PAL.steel);
  const { x0, x1, z0, z1, y } = SHED, wh = 2.1;
  for (let x = x0; x < x1 - 1e-6; x += 0.25) v.bx(x, y, z1 - 0.06, Math.min(x1, x + 0.25), y + wh, z1, PAL[(((x - x0) / 0.25) | 0) % 2 ? 'chestnut' : 'walnut']);
  v.bx(x1 - 0.06, y, z0, x1, y + wh, z1, PAL.walnut);
  v.bx(x0 + 0.5, y, z1, x0 + 1.4, y + 1.5, z1 + 0.02, PAL.umber);                                 // the door
  v.bx(x1 - 1.3, y + 0.8, z1, x1 - 0.5, y + 1.4, z1 + 0.02, PAL.lemon);                          // a lit window
  v.bx(x1 - 0.92, y + 0.8, z1 + 0.02, x1 - 0.88, y + 1.4, z1 + 0.03, PAL.walnut); v.bx(x1 - 1.3, y + 1.08, z1 + 0.02, x1 - 0.5, y + 1.12, z1 + 0.03, PAL.walnut);
  for (let k = 0; k < 6; k++) v.bx(x0 - 0.25 + k * 0.05, y + wh + k * 0.13, z0 - 0.2, x1 + 0.25 - k * 0.05, y + wh + 0.13 + k * 0.13, z1 + 0.35 - k * 0.12, PAL[k === 0 ? 'umber' : k % 2 ? 'oxblood' : 'crimson']);
  // a life ring on the wall: red / bone quarters
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283, cx = x0 + 2.0, cy = y + 1.05; v.bx(cx + Math.cos(a) * 0.3 - 0.06, cy + Math.sin(a) * 0.3 - 0.06, z1, cx + Math.cos(a) * 0.3 + 0.06, cy + Math.sin(a) * 0.3 + 0.06, z1 + 0.06, PAL[(k / 3 | 0) % 2 ? 'bone' : 'red']); }
  // the sign on the roof: "B.L.A.M." / "HARBOUR" (3x5 letters), an oxblood board with a bone frame, two posts
  const l1 = R.small('B.L.A.M.'), l2 = R.small('HARBOUR'), cs = 0.11, bw = (Math.max(l1.w, l2.w) + 4) * cs, bh = 15 * cs, cx = (x0 + x1) / 2, sy = y + wh + 0.85, sz = z1 - 0.6;
  for (const sx of [-1.1, 1.1]) v.bx(cx + sx - 0.05, y + wh + 0.3, sz - 0.05, cx + sx + 0.05, sy + 0.2, sz + 0.05, PAL.walnut);
  v.bx(cx - bw / 2 - 0.07, sy - 0.07, sz + 0.05, cx + bw / 2 + 0.07, sy + bh + 0.07, sz + 0.1, PAL.bone);
  v.bx(cx - bw / 2, sy, sz + 0.1, cx + bw / 2, sy + bh, sz + 0.11, PAL.oxblood);
  const letters = (t, row, col) => { const lx = cx - t.w * cs / 2; for (const [i, j] of t.px) v.bx(lx + i * cs, sy + bh - (row + j + 1) * cs, sz + 0.11, lx + (i + 1) * cs, sy + bh - (row + j) * cs, sz + 0.14, PAL[col]); };
  letters(l1, 2, 'lemon'); letters(l2, 8, 'yellow');
  // the pier: planks on pilings, bollards, barrels, a crate, a rope coil, the lamp post at its end
  const P = PIER;
  for (let x = P.x0; x < P.x1 - 1e-6; x += 0.22) v.bx(x, P.y - 0.1, P.z0, x + 0.2, P.y, P.z1, PAL[(((x - P.x0) / 0.22) | 0) % 3 === 0 ? 'chestnut' : 'tan']);
  v.bx(P.x0, P.y - 0.2, P.z1 - 0.02, P.x1, P.y - 0.1, P.z1 + 0.02, PAL.walnut);
  for (let x = P.x0 + 0.4; x <= P.x1; x += 1.3) for (const z of [P.z0 + 0.1, P.z1 - 0.1]) v.bx(x - 0.1, -0.3, z - 0.1, x + 0.1, P.y + (z > P.z0 + 0.5 ? 0.18 : 0), z + 0.1, PAL.walnut);
  for (const x of [P.x0 + 1.0, P.x0 + 3.6]) { v.bx(x - 0.1, P.y, P.z1 - 0.3, x + 0.1, P.y + 0.25, P.z1 - 0.1, PAL.void); v.bx(x - 0.14, P.y + 0.25, P.z1 - 0.34, x + 0.14, P.y + 0.31, P.z1 - 0.06, PAL.slate); }
  for (const [x, c] of [[P.x0 + 2.0, 'chestnut'], [P.x0 + 2.45, 'walnut']]) { v.bx(x - 0.2, P.y, P.z0 + 0.3, x + 0.2, P.y + 0.5, P.z0 + 0.7, PAL[c]); v.bx(x - 0.21, P.y + 0.12, P.z0 + 0.29, x + 0.21, P.y + 0.16, P.z0 + 0.71, PAL.slate); v.bx(x - 0.21, P.y + 0.36, P.z0 + 0.29, x + 0.21, P.y + 0.4, P.z0 + 0.71, PAL.slate); }
  v.bx(P.x0 + 2.8, P.y, P.z0 + 0.2, P.x0 + 3.3, P.y + 0.45, P.z0 + 0.65, PAL.tan); v.bx(P.x0 + 2.8, P.y + 0.2, P.z0 + 0.64, P.x0 + 3.3, P.y + 0.24, P.z0 + 0.66, PAL.chestnut);
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; v.bx(P.x0 + 4.6 + Math.cos(a) * 0.18 - 0.04, P.y, P.z1 - 0.4 + Math.sin(a) * 0.12 - 0.04, P.x0 + 4.6 + Math.cos(a) * 0.18 + 0.04, P.y + 0.07, P.z1 - 0.4 + Math.sin(a) * 0.12 + 0.04, PAL[k % 2 ? 'sand' : 'tan']); }
  const lx = P.x0 + 0.45, lz = P.z1 - 0.25;
  v.bx(lx - 0.06, P.y, lz - 0.06, lx + 0.06, P.y + 2.4, lz + 0.06, PAL.void);
  v.bx(lx - 0.12, P.y, lz - 0.12, lx + 0.12, P.y + 0.3, lz + 0.12, PAL.slate);
  v.bx(lx - 0.02, P.y + 2.4, lz - 0.02, lx + 0.45, P.y + 2.46, lz + 0.02, PAL.void);
  v.bx(lx + 0.27, P.y + 2.08, lz - 0.12, lx + 0.51, P.y + 2.14, lz + 0.12, PAL.void); v.bx(lx + 0.25, P.y + 2.46, lz - 0.14, lx + 0.53, P.y + 2.52, lz + 0.14, PAL.void);
  // two gulls perched on pilings
  for (const x of [P.x0 + 1.7, P.x0 + 5.6]) { const z = P.z1 - 0.1, yy = P.y + 0.18; v.bx(x - 0.13, yy, z - 0.06, x + 0.1, yy + 0.13, z + 0.06, PAL.bone); v.bx(x + 0.06, yy + 0.1, z - 0.05, x + 0.16, yy + 0.2, z + 0.05, PAL.bone); v.bx(x + 0.16, yy + 0.13, z - 0.02, x + 0.22, yy + 0.16, z + 0.02, PAL.amber); v.bx(x - 0.15, yy + 0.06, z - 0.05, x + 0.04, yy + 0.12, z + 0.07, PAL.haze); }
  return { lamp: [lx + 0.39, P.y + 2.3, lz] };
}
function buildLighthouse(v) {                                       // on the headland (right): bone / red bands, a gallery
  const { x, z } = LIGHT, base = 0.8 + (x - 14) * 0.16 + 1.2 * Math.sin(x * 0.21);
  for (let k = 0; k < 6; k++) { const w = 0.7 - k * 0.05; v.bx(x - w, base + k * 0.55, z - w, x + w, base + (k + 1) * 0.55, z + w, PAL[k % 2 ? 'red' : 'bone']); }
  const top = base + 6 * 0.55;
  v.bx(x - 0.7, top, z - 0.7, x + 0.7, top + 0.12, z + 0.7, PAL.void);
  v.bx(x - 0.36, top + 0.12, z - 0.36, x + 0.36, top + 0.9, z + 0.36, PAL.midnight);
  v.bx(x - 0.48, top + 0.9, z - 0.48, x + 0.48, top + 1.1, z + 0.48, PAL.crimson); v.bx(x - 0.12, top + 1.1, z - 0.12, x + 0.12, top + 1.4, z + 0.12, PAL.void);
  return [x, top + 0.5, z + 0.2];
}
function buoyGeo() {
  const v = new Vox();
  for (let k = 0; k < 5; k++) { const w = 0.42 - k * 0.07; v.bx(-w, -0.2 + k * 0.22, -w, w, 0.02 + k * 0.22, w, PAL[k % 2 ? 'bone' : 'red']); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) v.bx(sx * 0.13 - 0.025, 0.9, sz * 0.13 - 0.025, sx * 0.13 + 0.025, 1.4, sz * 0.13 + 0.025, PAL.void);
  v.bx(-0.17, 1.4, -0.17, 0.17, 1.46, 0.17, PAL.void); v.bx(-0.09, 1.0, -0.09, 0.09, 1.2, 0.09, PAL.amber);   // the bell
  return v.geo();
}
function gullGeo() {
  const v = new Vox();
  v.bx(-0.16, -0.04, -0.05, 0.18, 0.05, 0.05, PAL.bone); v.bx(0.18, -0.01, -0.02, 0.25, 0.03, 0.02, PAL.amber);
  for (const sd of [-1, 1]) { v.bx(-0.06, 0.0, sd * 0.05, 0.08, 0.03, sd * 0.32, PAL.bone); v.bx(-0.04, 0.03, sd * 0.3, 0.06, 0.08, sd * 0.52, PAL.mist); v.bx(-0.03, 0.08, sd * 0.5, 0.05, 0.12, sd * 0.6, PAL.void); }
  return v.geo();
}
const N_GLOW = 14, N_GULL = 7, PORT_SLOTS = 8;
function buildEnv() {
  const env = new THREE.Group();
  const sky = noRay(new THREE.Mesh(new THREE.PlaneGeometry(240, 80), SKY_MAT)); sky.position.set(0, 20, SKY_Z); sky.renderOrder = -10; env.add(sky);
  const water = noRay(new THREE.Mesh(new THREE.PlaneGeometry(240, 76), WATER_MAT)); water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -31); env.add(water);
  const ve = new Vox(); buildFar(ve); env.add(noRay(new THREE.Mesh(ve.geo(), M_ENV)));
  const vo = new Vox(); const q = buildQuay(vo), lh = buildLighthouse(vo); env.add(noRay(new THREE.Mesh(vo.geo(), M_OBJ)));
  // the ships (3 slots; a run shows 2 or 3), each a group (never mirrored) holding the hull (maybe mirrored) + flags
  const flagG = {}; for (const ch of ['B', 'L', 'A', 'M', '']) flagG[ch] = [flagGeo(ch, 0), flagGeo(ch, 1)];
  const ships = [0, 1, 2].map(i => {
    const g = new THREE.Group(), hull = noRay(new THREE.Mesh(buildShip(i), M_OBJ)); g.add(hull);
    const flags = [0, 1].map(() => { const f = noRay(shared(flagG[''][0], M_OBJ)); f.visible = false; g.add(f); return f; });
    g.position.z = SHIP_Z; env.add(g); return { g, hull, flags };
  });
  const buoy = noRay(new THREE.Mesh(buoyGeo(), M_OBJ)); buoy.position.set(BUOY.x, 0, BUOY.z); buoy.scale.setScalar(0.72); env.add(buoy);
  // glows (one instanced draw call): port glows / flashes, the pier lamp, the lighthouse, the buoy light, ship lanterns
  const glow = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M_GLOW, N_GLOW); glow.frustumCulled = false; noRay(glow); env.add(glow);
  env.add(puffs());
  const gulls = new THREE.InstancedMesh(gullGeo(), M_OBJ, N_GULL); gulls.frustumCulled = false; noRay(gulls); env.add(gulls);
  // the rowboat: hull, the duck (3 faces + 2 wings), 2 oars
  const boat = new THREE.Group(); boat.rotation.order = 'YXZ'; env.add(boat);
  const hullB = noRay(new THREE.Mesh(boatGeo(), MAT.obj)); boat.add(hullB);
  const duck = new THREE.Group(); duck.rotation.order = 'YXZ'; duck.position.set(0, 0.3, 0.02); boat.add(duck);
  const oy = 2 * DS, faces = [0, 1, 2].map(f => { const m = noRay(new THREE.Mesh(new Vox().vox(duckList(f), DS, 0, oy, 0).geo(), MAT.obj)); m.visible = f === 0; duck.add(m); return m; });
  const wg = new Vox().vox(wingList(), DS, -0.5 * DS, 0, 0).geo(), wings = [];
  for (const sd of [-1, 1]) { const p = new THREE.Group(); p.position.set(sd * 4.6 * DS, 6.2 * DS, 0.3 * DS); const m = noRay(shared(wg, MAT.obj)); if (sd < 0) m.scale.x = -1; p.add(m); duck.add(p); wings.push(p); }
  const og = oarGeo(), oars = [];
  for (const sd of [-1, 1]) {
    const piv = new THREE.Group(), w = bHW(0.18); piv.position.set(sd * w, bTop(0.18) + 0.06, 0.18); piv.rotation.y = sd < 0 ? Math.PI : 0;
    const inner = new THREE.Group(); inner.add(noRay(shared(og, MAT.obj))); piv.add(inner); boat.add(piv); oars.push({ piv, inner, sd });
  }
  // misses: a proxy that finds the water under the ray and throws a splash; it never reports a hit (no square bullet
  // hole hangs over the water; the tracer flies on)
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.raycast = missSplash; env.add(proxy);
  env.userData.shootables = [proxy];
  sky.onBeforeRender = () => envStep();
  PARTS = { env, sky, water, ships, flagG, buoy, glow, gulls, boat, hullB, duck, faces, wings, oars, lamp: q.lamp, lh };
  return env;
}
const _sp = new THREE.Vector3();
function missSplash(rc) {
  if (!inPlay()) return;
  const o = rc.ray.origin, d = rc.ray.direction; if (d.y >= -0.005) return;
  const s = -o.y / d.y; _sp.copy(o).addScaledVector(d, s); if (_sp.z > 2.5 || _sp.z < SHIP_Z - 2) return;
  const sz = 0.02 + 0.006 * (CAMP.z - _sp.z);
  for (let k = 0; k < 8; k++) puff(_sp, new THREE.Vector3(R.rnd(-0.6, 0.6), R.rnd(1.6, 3.4), R.rnd(-0.3, 0.6)), R.rnd(sz, sz * 1.7), PAL[['ice', 'mist', 'bone', 'cyan'][k % 4]], R.rnd(0.35, 0.6), 1, -0.3);
}

// =========================================================================================
// THE PUFFS: the stage's own debris / smoke particles (one instanced draw call, fog-free so the far ships' smoke and a
// far ball's trail keep their colours; the engine's chips fog toward midnight past 13 m). Cosmetic, Math.random allowed.
// Ticked by the director on the stage clock (and by the set step on the wall clock when no director runs).
const NP = 320, PD = [], _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _ps = new THREE.Vector3(), ZM = new THREE.Matrix4().makeScale(0, 0, 0);
let puffMesh = null, pNext = 0, pWall = 0;
function puffs() {
  if (puffMesh) return puffMesh;
  puffMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), NP);
  puffMesh.frustumCulled = false; noRay(puffMesh);
  for (let i = 0; i < NP; i++) { PD.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), s: 0, g: 1, floor: 0 }); puffMesh.setMatrixAt(i, ZM); puffMesh.setColorAt(i, _c0.set(0xffffff)); }
  return puffMesh;
}
const _c0 = new THREE.Color();
function puff(p, v, size, col, life, grav = 1, floor = -0.4) {     // the engine's spawnChip signature
  if (!puffMesh) return;
  const i = pNext; pNext = (pNext + 1) % NP; const d = PD[i];
  d.p.copy(p); d.v.copy(v); d.s = size; d.life = d.max = life; d.g = grav; d.floor = floor;
  if (grav > 0) { d.r.set(R.rnd(0, 6), R.rnd(0, 6), R.rnd(0, 6)); d.w.set(R.rnd(-12, 12), R.rnd(-12, 12), R.rnd(-12, 12)); } else { d.r.set(0, 0, 0); d.w.set(0, 0, 0); }
  puffMesh.setColorAt(i, _c0.set(col)); puffMesh.instanceColor.needsUpdate = true;
}
function puffTick(dt) {
  if (!puffMesh || dt <= 0) return;
  dt = Math.min(dt, 0.1);
  for (let i = 0; i < NP; i++) {
    const d = PD[i]; if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) { puffMesh.setMatrixAt(i, ZM); continue; }
    if (d.g > 0) { d.v.y -= 9.8 * d.g * dt; } else d.v.multiplyScalar(1 - 2.5 * dt);
    d.p.addScaledVector(d.v, dt);
    if (d.g > 0 && d.p.y < d.floor) { d.life = 0; puffMesh.setMatrixAt(i, ZM); continue; }
    d.r.addScaledVector(d.w, dt);
    const k = Math.min(1, d.life / 0.3) * d.s * (d.g <= 0 ? 1 + 0.6 * (1 - d.life / d.max) : 1);
    puffMesh.setMatrixAt(i, _pm.compose(d.p, _pq.setFromEuler(_pe.set(d.r.x, d.r.y, d.r.z)), _ps.set(k, k, k)));
  }
  puffMesh.instanceMatrix.needsUpdate = true;
}

// =========================================================================================
// THE ARC (pure): port -> the boat, a parabola of height H, flight F s
// =========================================================================================
function ballAt(sp, lt, o) {
  const f = clamp(lt / sp.F, 0, 1); o = o || {};
  o.x = lerp(sp.p0[0], sp.p1[0], f); o.z = lerp(sp.p0[2], sp.p1[2], f); o.y = lerp(sp.p0[1], sp.p1[1], f) + sp.H * 4 * f * (1 - f);
  return o;
}
const ballPx = (sp, lt) => { const p = ballAt(sp, lt, {}); return scr(p.x, p.y, p.z); };
const portPos = (n, s, j) => { const X = SHIP_X[n][s], mir = SHIP_MIR[n][s]; return [X + (mir ? -1 : 1) * PORT_X[j], PORT_Y, PORT_Z]; };

// =========================================================================================
// TARGETS
// =========================================================================================
const HIT_PX = { mouse: 6, touch: 9 };
const PROXY_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
const _hp = new THREE.Vector3(), _cp = new THREE.Vector3();
// a screen-space disc round the ball (never under HIT_PX); distance = px from the crosshair, so the ball nearest the
// crosshair wins an overlap (a volley)
function ballRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable) return;
  this.updateWorldMatrix(true, false); this.getWorldPosition(_hp);
  const d = _hp.distanceTo(rc.ray.origin), perPx = 2 * d * R.TAN_H / RH;
  rc.ray.closestPointToPoint(_hp, _cp);
  const off = _cp.distanceTo(_hp) / perPx, lim = Math.max(tg.rpx * 1.25 + 0.5, B.Input && B.Input.touch ? HIT_PX.touch : HIT_PX.mouse);
  if (off > lim) return;
  out.push({ distance: off + d * 1e-4, point: _cp.clone(), object: this });
}
const tk = (run, id) => run.taken.has(id) && run.taken.get(id) >= 0;
// the hull hook: an UNSHOT ball that reached the boat costs every player still standing a life, through the engine's own
// penalty (Run.penaltyNow: LIFE -1, the shake / duck scare / 'bomb' + 'lifeLost' sounds, -300) -- INVASION's landing
// hook. Called by the ball itself at its impact (+ GRACE_V in versus), only if run.taken has no claim on it (both versus
// tabs see the same taken set, so both charge the same balls).
function chargeHull(run) {
  if (!run || run.state !== 'play') return;
  run.players.forEach((P, i) => { if (P.lives > 0) run.penaltyNow(i, 'bomb', null, null); });
}
const chargeAt = (sp, run) => sp.F + (run && run.versus ? GRACE_V : 0);
const depthSz = (d, px) => px * d / FPX;                            // world size that shows px game pixels at depth d
const _bp = {}, _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
class Ball extends T.Target {
  constructor(sp, run) {
    super('target');
    this.sp = sp; this.lastLt = 0; this.deadLt = -1; this.impacted = false; this.charged = false; this.fired = false; this.whist = false;
    this.trail = 0; this.popAt = -1; this.splashed = false; this.rpx = MIN_PX;
    this.mesh = noRay(shared(BALL_GEO, BALL_MAT)); this.mesh.renderOrder = 6; this.group.add(this.mesh);
    this.proxy = new THREE.Mesh(PROXY_GEO, PROXY_MAT); this.proxy.userData.sharedGeo = true; this.proxy.userData.target = this; this.proxy.raycast = ballRaycast; this.group.add(this.proxy);
    this.group.visible = false;
  }
  meshes() { return [this.proxy]; }
  update(lt, run) {
    const sp = this.sp, live = inPlay() && run.state === 'play', ca = chargeAt(sp, run);
    this.lastLt = lt;
    if (!this.fired) { this.fired = true; if (lt < 0.4 && inPlay()) { fireFx(sp); if (live) B.SFX.play('cannonFire', { u: uOfPx(scr(sp.p0[0], sp.p0[1], sp.p0[2])[0]) }); } }
    if (!this.alive) {                                         // shot (solo / awarded / a versus optimistic hit)
      if (this.popAt >= 0 && !this.splashed && lt >= this.popAt) { this.splashed = true; if (inPlay()) B.SFX.play('splash', { u: this.u || 0.5, small: 1 }); }
      if (tk(run, sp.id)) return lt >= this.deadLt + 1.0;
      if (lt >= ca) { if (!this.charged) { this.charged = true; if (!run.taken.has(sp.id)) { chargeHull(run); if (inPlay()) impactFx(sp, run); } } return true; }
      return false;
    }
    if (lt >= sp.F) {                                          // it reached the boat
      this.group.visible = false; this.shootable = false;
      if (!this.impacted) { this.impacted = true; if (!run.taken.has(sp.id) && inPlay()) impactFx(sp, run); }
      if (lt >= ca) { if (!this.charged) { this.charged = true; if (!run.taken.has(sp.id)) chargeHull(run); } return true; }
      return false;
    }
    const p = ballAt(sp, lt, _bp), s = scr(p.x, p.y, p.z), rpx = BALL_R * s[2];
    this.rpx = Math.max(rpx, MIN_PX); this.u = uOfPx(s[0]);
    this.group.position.set(p.x, p.y, p.z);
    this.mesh.scale.setScalar(BALL_R * Math.max(1, MIN_PX / rpx));
    this.mesh.rotation.set(lt * 7, lt * 3, 0);
    this.group.visible = lt >= 0;
    this.shootable = lt >= sp.ra && lt < sp.F - 0.03;
    // the smoke trail (cosmetic chips): a puff every 0.035 s of flight, sized to ~2-4 game px
    if (inPlay()) {
      const step = 0.035, n = Math.floor(lt / step);
      for (let k = Math.max(this.trail, n - 2); k < n; k++) {
        const q = ballAt(sp, k * step, {}), d = scr(q.x, q.y, q.z)[3];
        puff(_v3.set(q.x, q.y, q.z), _v4.set(R.rnd(-0.05, 0.05), R.rnd(0.05, 0.25), 0), depthSz(d, k % 3 ? 2.2 : 3.2), PAL[k % 3 === 0 ? 'bone' : 'mist'], R.rnd(0.28, 0.42), -0.02);
      }
      this.trail = Math.max(this.trail, n);
    }
    if (!this.whist && lt >= sp.F * 0.42) { this.whist = true; if (live) B.SFX.play('ballWhistle', { u: this.u }); }
    return false;
  }
  // shot (applyHit / a versus optimistic hit): it bursts into iron bits that drop into the water (then a splash)
  shatter(point, opts = {}) {
    if (!this.alive) return;
    this.alive = false; this.shootable = false; this.group.visible = false; this.deadLt = this.lastLt; this.deadT = this.lastLt;
    const p = ballAt(this.sp, this.lastLt, {}), c = new THREE.Vector3(p.x, p.y, p.z), d = scr(p.x, p.y, p.z)[3], sz = depthSz(d, 2.2), sp = 0.35 + 0.08 * d;
    for (let k = 0; k < 7; k++) puff(c, new THREE.Vector3(R.rnd(-1, 1) * sp, R.rnd(0.5, 1.8) * sp, R.rnd(-0.2, 1) * sp), sz * 0.8, PAL[['lemon', 'bone', 'orange'][k % 3]], R.rnd(0.25, 0.5), 0.6, -0.4);
    for (let k = 0; k < 12; k++) puff(c, new THREE.Vector3(R.rnd(-1.4, 1.4) * sp, R.rnd(0.2, 1.6) * sp, R.rnd(-0.4, 0.6) * sp), R.rnd(sz, sz * 1.8), opts.tint != null && k % 4 === 0 ? opts.tint : PAL[['void', 'navy', 'slate', 'midnight', 'steel'][k % 5]], R.rnd(0.8, 1.4), 1, -0.4);
    for (let k = 0; k < 4; k++) puff(c, new THREE.Vector3(R.rnd(-0.3, 0.3), R.rnd(0.1, 0.4), 0), sz * 2.4, PAL[k % 2 ? 'mist' : 'bone'], R.rnd(0.35, 0.55), -0.02);
    this.popAt = this.lastLt + clamp(Math.sqrt(2 * Math.max(0.2, p.y) / 9.8), 0.25, 1.1);
    B.SFX.play('ballPop', { u: uOfPx(scr(p.x, p.y, p.z)[0]) });
  }
}
// a port fires: a flash of sparks toward the camera + a puff of smoke rising off the hull
function fireFx(sp) {
  const c = _v3.set(sp.p0[0], sp.p0[1], sp.p0[2] + 0.1), d = CAMP.z - c.z, sz = depthSz(d, 2.6);
  for (let k = 0; k < 6; k++) puff(c, _v4.set(R.rnd(-1, 1), R.rnd(0, 1.2), R.rnd(1.5, 3)), sz, PAL[['lemon', 'yellow', 'orange'][k % 3]], R.rnd(0.12, 0.22), 0.2);
  for (let k = 0; k < 14; k++) puff(c, _v4.set(R.rnd(-0.7, 0.7), R.rnd(0.1, 0.8), R.rnd(0.3, 1.4)), R.rnd(sz * 0.6, sz * 1.15), PAL[['mist', 'bone', 'haze', 'mist'][k % 4]], R.rnd(0.9, 1.5), -0.03);
}
// a ball hit the boat: a THUD, wood chips and a splash at the hull (cosmetic; the life is chargeHull's)
function impactFx(sp, run) {
  const c = _v3.set(sp.p1[0], sp.p1[1], sp.p1[2]);
  for (let k = 0; k < 9; k++) puff(c, _v4.set(R.rnd(-1.6, 1.6), R.rnd(1.4, 3.4), R.rnd(-0.6, 1.4)), R.rnd(0.04, 0.07), PAL[['tan', 'chestnut', 'sand', 'red'][k % 4]], R.rnd(0.7, 1.1), 1, -0.4);
  for (let k = 0; k < 22; k++) puff(c, _v4.set(R.rnd(-1.0, 1.0), R.rnd(2.6, 5.4), R.rnd(-0.8, 0.8)), R.rnd(0.06, 0.12), PAL[['ice', 'bone', 'mist', 'cyan', 'bone'][k % 5]], R.rnd(0.6, 1.0), 1, -0.4);
  for (let k = 0; k < 6; k++) puff(c, _v4.set(R.rnd(-0.4, 0.4), R.rnd(0.2, 0.6), R.rnd(-0.2, 0.4)), R.rnd(0.12, 0.2), PAL[k % 2 ? 'mist' : 'bone'], R.rnd(0.4, 0.6), -0.02);
  const u = uOfPx(scr(c.x, c.y, c.z)[0]);
  B.SFX.play('hullThud', { u }); B.SFX.play('splash', { u });
}

// ---------- the DIRECTOR (kind 'fx', t0 0 of its chunk): the finale + its sounds; it holds the stage open ----------
const ST = { run: null, fin: -1, dir: null, coverEnd: -9, wasCover: false };
class Director extends T.Target {
  constructor(sp, run) {
    super('fx'); this.sp = sp; this.pt = -99; this.shootable = false;
    if (ST.run !== run) { ST.run = run; ST.fin = -1; ST.coverEnd = -9; ST.wasCover = false; }
    ST.dir = this;
  }
  meshes() { return []; }
  update(lt, run) {
    if (ST.dir !== this) return true;                             // practice: a newer chunk's director took over
    const sp = this.sp, t = Math.max(0, run.t), a = this.pt, live = run.state === 'play' && inPlay();
    if (a > -90) { puffTick(t - a); pWall = performance.now(); }
    if (ST.fin < 0 && !run.practice && t >= sp.last && run.state === 'play' && (run.versus || (run.me.hits >= run.cfg.quota && run.me.lives > 0))) {
      ST.fin = sp.last;
      if (live) { B.SFX.play('finale'); if (B.G && B.G.duckReact) B.G.duckReact('cheer', 2.6); }
    }
    if (ST.fin >= 0 && inPlay()) for (let k = 0; k < 4; k++) { const s = ST.fin + FLAG_T0 + k * FLAG_DT; if (s > a && s <= t) B.SFX.play('flagUp', { n: k }); }
    this.pt = t;
    return t >= sp.last + (ST.fin >= 0 ? FIN_HOLD : 1.0);
  }
}
function makeTarget(sp, run) { return sp.kind === 'dir' ? new Director(sp, run) : new Ball(sp, run); }

// =========================================================================================
// per-frame set step (the sky mesh's onBeforeRender): dusk, sun, ships, glows, gulls, buoy, the boat + the duck, flags
// =========================================================================================
const stageT = () => { const G = B.G, run = G && G.run; return run && run.stage === ID ? { run, t: Math.max(0, run.t) } : { run: null, t: 0 }; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function envStep() {
  if (!PARTS) return;
  const { run, t } = stageT(), wall = performance.now() / 1000, D = PARTS;
  { const now = performance.now(); if (now - pWall > 250) { puffTick(Math.min(0.05, (now - (D.pLast || now)) / 1000)); } D.pLast = now; }
  const clock = run && isFinite(run.cfg.time) ? run.cfg.time : 60, ft = run && ST.run === run && ST.fin >= 0 ? t - ST.fin : -1;
  const dusk = ft >= 0 ? Math.min(0.85, 0.62 + ft * 0.05) : clamp(t / clock, 0, 1) * 0.62;
  SKY_U.uDusk.value = dusk; SKY_U.uT.value = wall;
  SKY_U.uSun.value.set(252 + dusk * 4, 86 + dusk * 22, 10);
  M_ENV.color.setScalar(1 - 0.2 * dusk); M_OBJ.color.setScalar(1 - 0.2 * dusk);
  const n = run ? (run.cfg.ships || 3) : 3, balls = run ? run.timeline : [];
  // the ships: placed by the run's ship count, a gentle bob, a heel away from each shot
  for (let i = 0; i < 3; i++) {
    const S = D.ships[i], on = i < n; S.g.visible = on; if (!on) continue;
    const mir = SHIP_MIR[n][i];
    S.g.position.set(SHIP_X[n][i], 0.05 * Math.sin(wall * 0.9 + i * 2), SHIP_Z);
    S.hull.scale.x = mir ? -1 : 1;
    let heel = 0.012 * Math.sin(wall * 0.7 + i);
    for (let k = 1; k < balls.length; k++) { const b = balls[k]; if (b.kind !== 'ball' || b.sh !== i || b.n !== n) continue; const e = t - b.t0; if (e >= 0 && e < 1.6) heel -= 0.03 * Math.exp(-2.8 * e) * Math.sin(7 * e + 0.6); }
    S.g.rotation.set(heel, 0, 0.01 * Math.sin(wall * 0.6 + i * 1.3));
    // the finale's white flags: B L A M up the masts in screen order (3 ships: plain white flags on the outer masts)
    const letters = n === 2 ? ['B', 'L', 'A', 'M'] : ['', 'B', 'L', 'A', 'M', ''];
    for (let m = 0; m < 2; m++) {
      const F = S.flags[m], mx = (mir ? -1 : 1) * MAST_X[m], order = [...MAST_X.map((x, mm) => [(mir ? -1 : 1) * x, mm])].sort((p, q) => p[0] - q[0]).findIndex(e => e[1] === m);
      const slot = i * 2 + order, ch = letters[slot], li = ['B', 'L', 'A', 'M'].indexOf(ch);
      const st = FLAG_T0 + (li >= 0 ? li : slot === 0 ? -0.5 : 4.5) * FLAG_DT * (li >= 0 ? 1 : 0.6), k = ft >= 0 ? E.outCubic(clamp((ft - st) / FLAG_UP, 0, 1)) : 0;
      F.visible = k > 0.001;
      if (!F.visible) continue;
      const fr = ((wall * 6 + slot) | 0) & 1;
      F.geometry = D.flagG[ch][fr];
      const top = MAST_TOP[m] - 0.15;
      F.position.set(mx + 0.1, lerp(1.6 + FLAG_H * FLAG_C, top, k), 0.45);
    }
  }
  // glows: the port about to fire (an amber glint, PRE s) then its flash; lamps; the lighthouse; the buoy; ship lanterns
  const G = D.glow, put = (i, x, y, z, s, col) => { G.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q.identity(), _s.setScalar(Math.max(1e-4, s)))); G.setColorAt(i, _c.set(PAL[col])); };
  let gi = 0;
  for (let k = 1; k < balls.length && gi < PORT_SLOTS; k++) {
    const b = balls[k]; if (b.kind !== 'ball') continue;
    const e = t - b.t0; if (e < -PRE || e > 0.14 || b.n !== n) continue;
    const pp = portPos(n, b.sh, b.pt);
    if (e < 0) put(gi++, pp[0], pp[1], pp[2], 0.16 + 0.1 * (((t * 18) | 0) & 1), ((t * 18) | 0) & 1 ? 'amber' : 'orange');
    else put(gi++, pp[0], pp[1], pp[2] + 0.2, 0.9 * (1 - e / 0.14) + 0.2, e < 0.06 ? 'lemon' : 'yellow');
  }
  while (gi < PORT_SLOTS) put(gi++, 0, -50, 0, 1e-4, 'void');
  put(gi++, D.lamp[0], D.lamp[1], D.lamp[2], 0.26, 'lemon');
  const lb = Math.max(0, Math.sin(wall * 2.1)); put(gi++, D.lh[0], D.lh[1], D.lh[2], 0.35 + 0.9 * lb * lb, lb > 0.6 ? 'bone' : 'lemon');
  const by = 0.06 * Math.sin(wall * 1.5);
  put(gi++, BUOY.x, 1.12 + by, BUOY.z, ((wall * 1.2) | 0) % 2 ? 0.2 : 0.08, 'red');
  for (let i = 0; i < 3; i++) { const S = D.ships[i]; if (i >= n) { put(gi++, 0, -50, 0, 1e-4, 'void'); continue; } const mir = SHIP_MIR[n][i]; put(gi++, S.g.position.x + (mir ? 1 : -1) * 3.51, S.g.position.y + 2.98, SHIP_Z, 0.3 + 0.05 * Math.sin(wall * 5 + i), 'lemon'); }
  while (gi < N_GLOW) put(gi++, 0, -50, 0, 1e-4, 'void');
  G.instanceMatrix.needsUpdate = true; if (G.instanceColor) G.instanceColor.needsUpdate = true;
  D.buoy.position.y = by; D.buoy.rotation.set(0.06 * Math.sin(wall * 1.1), 0, 0.08 * Math.sin(wall * 1.5 + 1));
  // gulls wheeling over the bay (wall clock, cosmetic), kept clear of the top-left corner (MENU / SCORE)
  for (let i = 0; i < N_GULL; i++) {
    const cx = -4 + i * 3.4, cy = 7.5 + 2.2 * hash1(i * 7), cz = -18 - 6 * hash1(i * 3), r = 2.0 + 1.5 * hash1(i * 5), w = (0.25 + 0.2 * hash1(i * 11)) * (i % 2 ? 1 : -1), a = wall * w + i * 2.1;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.6, y = cy + 0.3 * Math.sin(wall * 0.8 + i);
    D.gulls.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, -a - (w > 0 ? Math.PI / 2 : -Math.PI / 2), 0.15 * Math.sin(a))), _s.set(1, 1 + 0.9 * Math.sin(wall * 7 + i * 1.7), 1)));
  }
  D.gulls.instanceMatrix.needsUpdate = true;
  poseBoat(run, t, ft, wall);
}
const _c = new THREE.Color();
// the duck's state at stage time t (pure in the timeline + run.taken + t, except the short peek after a cover, which
// remembers when the last cover ended): 'cover' (a ball is <= COVER s from the boat), 'fist' (a ball hit the hull in
// the last FIST s; e = time since), 'peek', 'idle'; look = screen x of the ship that fires next
function duckState(run, t) {
  const out = { mode: 'idle', e: 0, look: RW / 2, rock: [0, 0, 0] };
  if (!run) return out;
  let cover = false, hitAt = -9, hitX = 0, next = 9e9;
  for (let k = 1; k < run.timeline.length; k++) {
    const b = run.timeline[k]; if (b.kind !== 'ball') continue;
    const I = b.t0 + b.F, taken = tk(run, b.id);
    if (!taken && t >= b.t0 && I > t && I - t <= COVER) cover = true;
    if (!taken && I <= t && t - I < 2.4) {                       // the boat rocks from each hull hit (damped)
      const e = t - I, k1 = Math.exp(-2.4 * e) * Math.sin(10 * e);
      out.rock[0] -= 0.11 * k1; out.rock[1] += 0.07 * k1 * Math.sign(b.ax || 0.001); out.rock[2] -= 0.06 * Math.exp(-7 * e);
      if (I > hitAt) { hitAt = I; hitX = b.ax; }
    }
    if (b.t0 >= t - 0.2 && b.t0 < next && b.n === (run.cfg.ships || 3)) { next = b.t0; out.look = scr(b.p0[0], 1, b.p0[2])[0]; }
  }
  if (ST.run === run) { if (ST.wasCover && !cover) ST.coverEnd = t; ST.wasCover = cover; }
  if (cover) out.mode = 'cover';
  else if (t - hitAt < FIST) { out.mode = 'fist'; out.e = t - hitAt; }
  else if (ST.run === run && t - ST.coverEnd < PEEK && t >= ST.coverEnd) { out.mode = 'peek'; out.e = t - ST.coverEnd; }
  return out;
}
function poseBoat(run, t, ft, wall) {
  const D = PARTS, bt = run ? t : wall, st = duckState(run, t);
  let x = BOAT.x, z = BOAT.z, yaw = BOAT.yaw;
  const y = 0.035 * Math.sin(bt * 1.7) + 0.018 * Math.sin(bt * 2.9 + 1) + st.rock[2];
  let pitch = 0.03 * Math.sin(bt * 1.3 + 0.5) + st.rock[0], roll = 0.035 * Math.sin(bt * 1.1) + st.rock[1];
  const fin = ft >= 0;
  if (fin) {                                                     // he rows off toward the pier, waving
    const k = E.inOut(clamp((ft - 0.6) / (FIN_HOLD - 0.6), 0, 1)), ky = E.inOut(clamp((ft - 0.3) / 1.4, 0, 1));
    x = lerp(BOAT.x, FIN_TO.x, k); z = lerp(BOAT.z, FIN_TO.z, k); yaw = lerp(BOAT.yaw, FIN_TO.yaw, ky);
  }
  D.boat.position.set(x, y, z); D.boat.rotation.set(pitch, yaw, roll);
  // the oars: resting with the blades in the water; the finale: a rowing stroke
  for (const O of D.oars) {
    let sweep = 0.12 * Math.sin(bt * 0.8), droop = -0.3;
    if (fin) { const ph = (ft * 1.1) % 1, a = ph * Math.PI * 2; sweep = 0.5 * Math.sin(a); droop = -0.3 + 0.16 * Math.max(0, Math.cos(a)); }
    else if (st.mode === 'cover' || st.mode === 'fist') { sweep = 0.05; droop = -0.12; }
    O.inner.rotation.set(0, O.sd > 0 ? sweep : -sweep, droop);
  }
  // the duck
  const W = D.wings, du = D.duck;
  let face = 0, dy = 0, lean = 0, turn = clamp((st.look - RW / 2) / (RW / 2), -1, 1) * 0.35, wl = -0.35, wr = 0.35, wlx = -0.55, wrx = -0.55, sx = 0;
  if (fin) { face = 0; turn = 0.1 * Math.sin(ft * 2); wl = -2.6 + 0.4 * Math.sin(ft * 9); wlx = 0; wr = 0.4 + 0.25 * Math.sin(ft * 1.1 * 6.283); wrx = -0.7; dy = 0.02 * Math.abs(Math.sin(ft * 3.5)); }
  else if (st.mode === 'cover') { face = 1; dy = -0.12; lean = 0.22; turn = 0; wl = -3.0; wr = 3.0; wlx = 0.45; wrx = 0.45; sx = 0.01 * Math.sin(wall * 55); }
  else if (st.mode === 'peek') { const k = E.outCubic(clamp(st.e / PEEK, 0, 1)); face = 0; dy = -0.12 * (1 - k); lean = 0.22 * (1 - k); wl = lerp(-3.0, -0.35, k); wr = lerp(3.0, 0.35, k); wlx = lerp(0.45, -0.55, k); wrx = wlx; turn *= k; }
  else if (st.mode === 'fist') {
    const e = st.e;
    if (e < 0.2) { face = 1; dy = -0.08 * Math.sin(e / 0.2 * Math.PI); lean = 0.2; }
    else { face = 2; wr = 2.75 + 0.35 * Math.sin(wall * 26); wrx = -0.2; wl = -0.7; wlx = -0.1; turn = clamp((st.look - RW / 2) / (RW / 2), -1, 1) * 0.25; dy = 0.03 * Math.abs(Math.sin(e * 9)); }
  } else { dy = 0.008 * Math.sin(bt * 2.3); }
  du.position.set(sx, 0.3 + dy, 0.02); du.rotation.set(lean, turn - yaw * 0.85, 0);
  D.faces.forEach((m, i) => { m.visible = i === face; });
  W[0].rotation.set(wlx, 0, wl); W[1].rotation.set(wrx, 0, wr);
}

// =========================================================================================
// The dials per tier (variant 0; the variants change the AMMO ONLY; quota share +2 % a variant, cap 90 %)
// ships = pirate ships (2 / 3) | F = flight time s (fire to the hull) | balls = cannonballs a round (the clock follows) |
// live [lo, hi] = balls in the air at once (a beat's cap is hi with chance l2) | gap / burst / bgap / pause = the range
// director's beats | volley = share of beats that are a VOLLEY (2, or 3 with chance v3, from ONE ship vbeat s apart,
// alternating arc heights and aim points) | hop / alt = AIM TRAVEL (#90) from the last ball you were made to aim at
// (alt: prefer another ship) | Hlo / Hhi = the low / high arc heights (world units over the chord) | share = quota share
// =========================================================================================
const TIER_P = [
  { ships: 2, F: 3.6, balls: 20, live: [1, 2], l2: 0.5, gap: [1.35, 1.8], burst: 0.15, bgap: [0.75, 0.95], pause: [1.4, 1.8], volley: 0.08, v3: 0, vbeat: [0.75, 0.9], hop: [0.12, 0.3], alt: 0.5, Hlo: [2.4, 3.2], Hhi: [4.3, 5.2], share: 0.55 },
  { ships: 2, F: 2.8, balls: 32, live: [2, 2], l2: 1, gap: [1.0, 1.35], burst: 0.2, bgap: [0.55, 0.72], pause: [1.15, 1.45], volley: 0.15, v3: 0, vbeat: [0.55, 0.7], hop: [0.2, 0.42], alt: 0.6, Hlo: [2.4, 3.2], Hhi: [4.4, 5.4], share: 0.6 },
  { ships: 3, F: 2.1, balls: 48, live: [2, 3], l2: 0.5, gap: [0.7, 0.95], burst: 0.25, bgap: [0.45, 0.6], pause: [1.0, 1.3], volley: 0.3, v3: 0.3, vbeat: [0.4, 0.5], hop: [0.32, 0.56], alt: 0.75, Hlo: [2.3, 3.1], Hhi: [4.5, 5.6], share: 0.64 },
  { ships: 3, F: 1.6, balls: 70, live: [3, 4], l2: 0.5, gap: [0.48, 0.66], burst: 0.3, bgap: [0.32, 0.42], pause: [0.9, 1.15], volley: 0.4, v3: 0.5, vbeat: [0.32, 0.42], hop: [0.45, 0.75], alt: 0.85, Hlo: [2.2, 3.0], Hhi: [4.6, 5.8], share: 0.68 }
];
const VARIANT_NAMES = ['HARBOUR', 'BROADSIDE', 'ARMADA'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.share = Math.min(0.9, b.share + 0.02 * v);
  c.live = b.live.slice(); c.time = 60; c.quota = 10;
  c.ammo = ['unlimited', { mag: 8, autoReload: false }, { mag: 12, autoReload: false }][v];
  c.tier = tier; c.variant = v; c.title = 'THE DOCK'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
// ---------- timeline: the DIRECTOR. Every spawn from the seeded rng only. ----------
// Beats from t 1.2: a SINGLE (gap after; a BURST = a quick follow-up at bgap, then a pause) or a VOLLEY (2-3 balls from
// one ship vbeat apart, arc heights alternating low / high, aim points alternating, a pause after). A beat waits while
// the balls already in the air + its own would exceed the beat's cap (live). AIM TRAVEL: every ship x {low, high arc}
// (seeded port + aim point) scored by how close its point 40 % into the flight lands to the wanted hop (hop x 440 px)
// from the last ball you were made to aim at, + 0.35 alt for the same ship. Spawn fields: ball { sh (ship), n (ships in
// the layout), pt (port 0-4), p0 (port, world), p1 (aim point on the boat), ax (aim x on the boat), H (arc height), F,
// ra, vo (volley id or -1), k (index in the volley) }; dir { last (the last impact + GRACE_V + 0.3), balls }.
// Practice (c.practice): balls until c.time (the chunk window); c.prior carries the balls still in the air.
function timeline(c, rng) {
  rng(); rng(); rng();
  const balls = [], n = c.ships, prior = (c.prior || []).filter(s => s.kind === 'ball'), all = () => prior.concat(balls);
  const inAir = T0 => all().filter(b => b.t0 <= T0 && b.t0 + b.F > T0);
  const mk = (t, s, pt, ai, H, vo, k) => {
    const p0 = portPos(n, s, pt), A = AIMS[ai], cy = Math.cos(BOAT.yaw), sy = Math.sin(BOAT.yaw), p1 = [BOAT.x + A[0] * cy + A[2] * sy, A[1], BOAT.z - A[0] * sy + A[2] * cy];
    return { id: 0, t0: r3(t), t1: r3(t + c.F), kind: 'ball', sh: s, n, pt, ai, ax: A[0], p0: p0.map(r3), p1: p1.map(r3), H: r3(H), F: c.F, ra: RA, readyAt: RA, vo, k };
  };
  const aimOf = b => { const s = ballPx(b, 0.4 * b.F); return [s[0], s[1]]; };
  let t = c.practice ? 0.6 : 1.2, lastAim = null, lastShip = -1, quick = false, nV = 0, lastAi = -1;
  const target = c.practice ? Infinity : c.balls;
  for (let guard = 0; guard < 4000 && balls.length < target && (!c.practice || t < c.time); guard++) {
    const vol = rng() < c.volley, cnt = Math.max(1, Math.min(vol ? (rng() < c.v3 ? 3 : 2) : 1, target - balls.length));
    const cap = Math.max(cnt, rng() < c.l2 ? c.live[1] : c.live[0]), vb = rng.range(c.vbeat[0], c.vbeat[1]);
    for (let g = 0; g < 60; g++) { const up = inAir(t); if (up.length + cnt <= cap) break; t = Math.min(...up.map(b => b.t0 + b.F)) + 0.05; }
    // aim travel: pick the ship / arc
    const D = rng.range(c.hop[0], c.hop[1]) * AIM_D, cands = [];
    for (let s = 0; s < n; s++) for (let hi = 0; hi < 2; hi++) {
      const H = rng.range(...(hi ? c.Hhi : c.Hlo)), pt = Math.floor(rng() * 5) % 5;
      let ai = Math.floor(rng() * AIMS.length) % AIMS.length; if (ai === lastAi) ai = (ai + 1) % AIMS.length;
      const b = mk(t, s, pt, ai, H, -1, 0), p = aimOf(b);
      let sc = 0.05 * rng();
      if (lastAim) sc += Math.abs(hyp(p[0] - lastAim[0], 1.4 * (p[1] - lastAim[1])) - D) / AIM_D;
      if (s === lastShip) sc += 0.35 * c.alt;
      cands.push([sc, s, hi, H, pt, ai]);
    }
    let best = cands[0]; for (const q of cands) if (q[0] < best[0]) best = q;
    const [, s, hi0, H0, pt0, ai0] = best, vo = cnt > 1 ? nV++ : -1;
    let last = null;
    for (let k = 0; k < cnt; k++) {
      const hi = (hi0 + k) % 2, H = k === 0 ? H0 : rng.range(...(hi ? c.Hhi : c.Hlo)), pt = (pt0 + k * 2) % 5, ai = (ai0 + k * 2) % AIMS.length;
      last = mk(t + k * vb, s, pt, ai, H, vo, k); balls.push(last);
    }
    lastAim = aimOf(last); lastShip = s; lastAi = last.ai;
    if (cnt > 1) { t += (cnt - 1) * vb + rng.range(c.pause[0], c.pause[1]); quick = false; }
    else if (!quick && rng() < c.burst) { t += rng.range(c.bgap[0], c.bgap[1]); quick = true; }
    else { t += quick ? rng.range(c.pause[0], c.pause[1]) : rng.range(c.gap[0], c.gap[1]); quick = false; }
  }
  balls.sort((a, b) => a.t0 - b.t0 || a.k - b.k);
  const lastI = balls.length ? Math.max(...balls.map(b => b.t0 + b.F)) : 1, last = r3(lastI + GRACE_V + 0.3);
  const dir = { id: 0, t0: 0, t1: r3(last + FIN_HOLD), kind: 'dir', last, balls: balls.length };
  const out = [dir, ...balls];
  out.forEach((s, i) => { s.id = i; });
  const nB = balls.length;
  c.ballCount = nB; c.volleyCount = nV;
  if (!c.practice) { c.time = Math.ceil(last + FIN_SLOT); c.quota = Math.max(4, Math.round(nB * c.share)); }
  return out;
}
// points: a ball 100, +50 in the first third of its flight. Pure in (spawn, lt).
function points(sp, lt) {
  if (sp.kind !== 'ball') return 0;
  return 100 + (lt <= sp.F / 3 ? 50 : 0);
}
function briefing(c) {
  const HINTS = ['SHOOT THEM EARLY: +50!', 'TWO SHIPS, FASTER BALLS!', 'VOLLEYS: HIGH, THEN LOW!', 'THREE SHIPS. NO MERCY!'];
  return { rule: [['SHOOT ', 'void'], [c.quota + ' CANNONBALLS', 'red'], [' OR MORE!', 'void']], icon: 'cannonball', unit: 'CANNONBALLS',
    dont: null, tip: "DON'T LET THEM HIT THE BOAT!", hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}

// =========================================================================================
// HUD: the briefing icon + the level card
// =========================================================================================
// a cannonball in pixels: r = radius; returns a palette name or null (x, y relative to the centre)
function ballPix(r) {
  return (x, y) => {
    const d = Math.hypot(x, y) / r; if (d > 1) return null;
    const nz = Math.sqrt(Math.max(0, 1 - d * d)), nx = x / r, ny = y / r, l = -0.5 * nx - 0.6 * ny + 0.62 * nz, s = 0.75 * nx + 0.3 * ny - 0.3 * nz;
    if (Math.hypot(x + r * 0.36, y + r * 0.36) < r * 0.2) return 'bone';
    if (s > 0.55 && d > 0.7) return 'orange';
    return l > 0.72 ? 'steel' : l > 0.4 ? 'slate' : l > 0.0 ? 'navy' : 'midnight';
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
// briefing card icon: a cannonball flying right with a motion whoosh and smoke puffs behind it (2 frames)
function drawIcon(cx, cy, r, t = 0) {
  const H = B.HUD, f = Math.floor(t * 4) & 1, W = Math.round(r * 2.6), Hh = Math.round(r * 2.1), ox = W * 0.62, oy = Hh * 0.5, br = r * 0.62, px = ballPix(br);
  const img = outlined('dk_icon_' + r, W, Hh, (x, y) => (x < 0 || y < 0 || x >= W || y >= Hh) ? null : px(x - ox + 0.5, y - oy + 0.5));
  const wk = H.pixImg('dk_whoosh_' + r + '_' + f, W, Hh, (x, y) => {
    const lines = [[-0.42, 0.55], [0.0, 0.85], [0.42, 0.6]];
    for (let i = 0; i < 3; i++) { const [ly, len] = lines[i], yy = oy + ly * br, x1 = ox - br * 0.7, x0 = x1 - len * r * (f ? 1.15 : 0.95); if (Math.abs(y - yy) < 0.6 + (i === 1 ? 0.5 : 0) && x > x0 && x < x1 && ((x + i + f) % 5) !== 0) return x < x0 + len * r * 0.35 ? 'mist' : 'bone'; }
    for (const [px0, py0, rr] of [[ox - br * 2.1, oy + br * 0.75, r * 0.16], [ox - br * 2.6, oy - br * 0.85, r * 0.12]]) if (Math.hypot(x - px0 - (f ? -1 : 0), y - py0) < rr) return 'mist';
    return null;
  });
  H.draw(wk, cx - ox, cy - oy); H.draw(img, cx - ox, cy - oy);
}
// the level card (56 x 32, centred): the sunset over the water, a pirate ship with sails, a cannonball arcing with its
// trail, the red rowboat with the duck, the sun's glitter
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const CARD_SHIP = [
  '........#..........',
  '........##.........',
  '.....#..#....#.....',
  '....sss.#...ss.....',
  '...sssss#..ssss....',
  '...sssss#..ssss....',
  '....sss.#...ss.....',
  '...sssss#..ssss....',
  '..ssssss#.sssss....',
  '..ssssss#.sssss....',
  '...ssss.#..sss.....',
  'hh......#.......=..',
  'hhhhhhhhhhhhhhhhh..',
  '.hpppppppppppppph..',
  '..hhhhhhhhhhhhhh...'
];
function drawCard(cx, cy, t = 0) {
  const H = B.HUD, W = 56, Hc = 32, x0 = Math.round(cx - W / 2), y0 = Math.round(cy - Hc / 2), f = Math.floor(t * 3) & 1;
  const SKY = ['indigo', 'plum', 'magenta', 'coral', 'orange', 'amber'];
  const bg = H.pixImg('dk_card_bg', W, Hc, (x, y) => {
    if (y >= 17) {                                              // the water: the sky mirrored, darker; swell; the sun's glitter
      if (Math.abs(x - 39) < 1 + (y - 17) * 0.35 && (x + y) % 2 === 0) return 'yellow';
      if ((x * 3 + y * 5) % 13 === 0) return 'coral';
      return ['magenta', 'plum', 'plum', 'indigo', 'indigo'][clamp(Math.floor((y - 17) / 3 + bay(x, y) * 1.2 - 0.3), 0, 4)];
    }
    if (Math.hypot(x - 39, y - 15) < 3.6) return Math.hypot(x - 39, y - 15) < 2.2 ? 'lemon' : 'yellow';
    if (y === 16) return x < 14 ? 'void' : 'orange';
    if (Math.abs(y - 6 - Math.sin(x * 0.3)) < 0.8 * clamp(Math.sin(x * 0.17 + 1), 0, 1) + 0.2 && x > 26) return 'plum';
    const k = y / 16, v = k * 5 + bay(x, y) * 0.9 - 0.45, s = clamp(Math.floor(v), 0, 5);
    return SKY[s];
  });
  H.draw(bg, x0, y0);
  const ship = H.pixImg('dk_card_ship', 19, 15, (x, y) => { const c = (CARD_SHIP[y] || '')[x]; return c === '#' ? 'void' : c === 's' ? (x + y) % 4 === 0 ? 'tan' : 'sand' : c === 'h' ? 'walnut' : c === 'p' ? (x % 3 === 1 ? 'void' : 'oxblood') : c === '=' ? 'chestnut' : null; });
  H.draw(ship, x0 + 3, y0 + 3);
  // the arc: smoke dots from the ship to the ball, the ball (2 frames along the arc)
  const bx = f ? 34 : 31, by = f ? 8 : 6;
  const trail = H.pixImg('dk_card_trail_' + f, W, Hc, (x, y) => {
    const ex = bx - 4, ey = by + 1;                              // a smoke trail from the ship's port up to the ball
    for (let i = 0; i <= 12; i++) { const u = i / 12, tx = 21 + u * (ex - 21), ty = 13 + (ey - 13) * (2 * u - u * u); if (Math.abs(x - tx) < 0.7 && Math.abs(y - ty) < (i > 8 ? 1.2 : 0.7) && (i + f) % 2 === 0) return i < 5 ? 'mist' : 'bone'; }
    return null;
  });
  H.draw(trail, x0, y0);
  const bp = ballPix(3.2), ball = outlined('dk_card_ball', 9, 9, (x, y) => (x < 0 || y < 0 || x >= 9 || y >= 9) ? null : bp(x - 4, y - 4));
  H.draw(ball, x0 + bx - 4, y0 + by - 4);
  // the rowboat (stern view) with the duck and its oars, bobbing
  const boat = outlined('dk_card_boat', 26, 13, (x, y) => {
    const X = x - 13;
    if (y >= 9 && y <= 11 && Math.abs(X) <= 6 - (y - 9)) return y === 9 ? 'bone' : 'red';
    if (y === 8 && Math.abs(X) <= 6) return 'tan';
    if (y === 7 && Math.abs(X) > 2 && Math.abs(X) <= 11 && Math.abs(X) > 5 && (Math.abs(X) - 5) <= 6) return Math.abs(X) > 9 ? 'sand' : 'tan';
    if (Math.hypot(X, y - 4.5) < 2.6 && y >= 2) return Math.abs(X - 1) <= 1 && y === 5 ? 'orange' : (X === -1 || X === 2) && y === 4 ? 'void' : 'yellow';
    if (y === 1 && Math.abs(X) <= 3) return 'tan';
    if (y === 0 && Math.abs(X) <= 1) return 'chestnut';
    if (y >= 6 && y <= 8 && Math.abs(X) <= 3) return 'yellow';
    return null;
  });
  H.draw(boat, x0 + 15, y0 + 19 + (f ? 0 : 1));
}

// =========================================================================================
// SOUNDS (recipes defined here with B.SFXKit.def; nothing appended to sfx-stage.js) + the 'harbour' ambience bed
// =========================================================================================
{
  const K = B.SFXKit;
  if (K && K.def) {
    const tone = (v, o) => K.tone(v, o), noise = (v, o) => K.noise(v, o);
    K.def('cannonFire', { max: 3, gap: 0.06, pv: 1.0, dv: 0.12, verb: 0.3, pri: 2, gain: 0.85 },
      v => {                                 // a ship's cannon across the water: a deep boom, a crack, the roll off the bay
        tone(v, { f: 72, f2: 38, ft: 0.35, a: 0.004, hold: 0.05, d: 0.55, g: 0.22 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 420, ff2: 140, fft: 0.5, q: 0.8, a: 0.003, d: 0.7, g: 0.3 });
        noise(v, { kind: 'white', ft: 'bandpass', ff: 1400, q: 0.8, a: 0.001, d: 0.06, g: 0.06 });
        noise(v, { kind: 'pink', ft: 'lowpass', ff: 700, at: 0.08, a: 0.05, d: 0.8, g: 0.05 });
        return 1.1;
      });
    K.def('ballWhistle', { max: 2, gap: 0.12, pv: 0.8, dv: 0.1, verb: 0.12, pri: 1, gain: 2.6 },
      v => {                                 // the ball on its way down: a faint falling whistle with a little air
        tone(v, { type: 'sine', f: 1900, f2: 700, ft: 0.7, a: 0.05, hold: 0.45, d: 0.25, g: 0.025, vib: [9, 0.01] });
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 2600, ff2: 1100, fft: 0.7, q: 3, a: 0.06, hold: 0.4, d: 0.2, g: 0.015 });
        return 0.8;
      });
    K.def('ballPop', { max: 3, gap: 0.04, pv: 0.6, dv: 0.08, verb: 0.12, pri: 3, gain: 6.0 },
      v => {                                 // a ball shot: an iron CLANG, a crunch, a shower of iron bits
        K.fm(v, { f: 420, ratio: 2.76, index: 3, id: 0.08, d: 0.35, g: 0.12 });
        K.fm(v, { f: 980, ratio: 1.41, index: 2, id: 0.05, d: 0.2, g: 0.05, at: 0.004 });
        noise(v, { kind: 'white', ft: 'bandpass', ff: 2400, q: 1.2, a: 0.001, d: 0.08, g: 0.1 });
        K.grains(v, { n: 9, span: 0.25, at: 0.05, f: [2500, 6500], q: 5, d: [0.01, 0.03], g: [0.04, 0.09], curve: 1.6, fade: true });
        return 0.5;
      });
    K.def('hullThud', { max: 2, gap: 0.08, pv: 0.4, dv: 0.06, verb: 0.12, pri: 3, gain: 4.0 },
      v => {                                 // a ball hits the boat: a hollow wooden THUD, a crack of planks, a creak
        tone(v, { f: 130, f2: 62, ft: 0.18, a: 0.002, d: 0.35, g: 0.25 });
        K.fm(v, { f: 210, ratio: 1.6, index: 1.4, id: 0.05, d: 0.22, g: 0.12 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 600, a: 0.002, d: 0.25, g: 0.25 });
        noise(v, { kind: 'white', ft: 'bandpass', ff: 1800, q: 1.5, at: 0.01, a: 0.001, d: 0.05, g: 0.07 });
        tone(v, { type: 'sawtooth', f: 180, f2: 140, ft: 0.3, at: 0.18, a: 0.04, d: 0.25, g: 0.012, lp: 900 });
        return 0.6;
      });
    K.def('splash', { max: 3, gap: 0.05, pv: 0.5, dv: 0.1, verb: 0.12, pri: 1, gain: 3.0 },
      v => {                                 // water: a sweep of spray + drips (opts.small: iron bits, quieter and shorter)
        const s = v.o && v.o.small ? 0.5 : 1;
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 2600, ff2: 700, fft: 0.3 * s + 0.1, q: 0.9, a: 0.006, d: 0.35 * s + 0.1, g: 0.09 * s });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 500, a: 0.003, d: 0.18, g: 0.08 * s });
        K.pings(v, { n: s < 1 ? 3 : 6, span: 0.4 * s, at: 0.08, f: [900, 2200], drop: 1.5, gmax: 0.04 });
        return 0.6 * s + 0.2;
      });
    K.def('flagUp', { max: 2, gap: 0.12, pv: 0.3, dv: 0.06, verb: 0.15, pri: 3, gain: 3.0 },
      v => {                                 // the finale: a white flag runs up the mast: a rope zip + two cloth flaps + a ding
        const n = (v.o && v.o.n) | 0;
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 700, ff2: 2600, fft: 0.45, q: 2.5, a: 0.02, hold: 0.3, d: 0.1, g: 0.05 });
        for (const at of [0.45, 0.58]) noise(v, { kind: 'pink', ft: 'lowpass', ff: 1500, at, a: 0.003, d: 0.06, g: 0.08, nd: true });
        K.bell(v, { f: [784, 880, 988, 1175][n % 4], at: 0.5, d: 0.4, g: 0.035, ratios: [1, 2.0, 3.01], amps: [1, 0.35, 0.15], damp: 1.3 });
        return 0.9;
      });
    // the harbour bed: waves on the quay, gulls now and then, a rope creaking, a far buoy bell. Hooked into K.beds as 'dock'.
    K.stageBeds = K.stageBeds || {};
    K.stageBeds.harbour = (ctx, bus) => {
      const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
      out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(0.6, now + 2.5); out.connect(bus);
      const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; param.value = base; o.connect(gn).connect(param); o.start(now); srcs.push(o); };
      const loop = (kind, type, f, q, g) => { const s = ctx.createBufferSource(), fl = K.filt(ctx, type, f, q), gn = K.gain(ctx, g); s.buffer = K.noiseBuf(ctx, kind); s.loop = true; s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s); return { f: fl, g: gn }; };
      const sea = loop('brown', 'lowpass', 420, 0.7, 0.03); lfo(0.11, 0.022, sea.g.gain, 0.026); lfo(0.07, 180, sea.f.frequency, 420);
      const wash = loop('pink', 'bandpass', 1300, 0.6, 0.006); lfo(0.11, 0.005, wash.g.gain, 0.006);
      const gull = t => {                    // a gull: "kee-ow", two or three falling cries
        const n = 2 + Math.floor(Math.random() * 2), f0 = 1500 + Math.random() * 400;
        for (let k = 0; k < n; k++) { const a = t + k * 0.28, o = ctx.createOscillator(), fl = K.filt(ctx, 'bandpass', 2200, 1.5), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, a); o.frequency.linearRampToValueAtTime(f0 * 1.15, a + 0.04); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, a + 0.22); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.0035, a + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.24); o.connect(fl).connect(g).connect(out); o.start(a); o.stop(a + 0.26); }
      };
      const creak = t => {                   // a mooring rope creaking: a slow resonant rub
        const s = ctx.createBufferSource(), fl = K.filt(ctx, 'bandpass', 380, 12), g = ctx.createGain(); s.buffer = K.noiseBuf(ctx, 'crackle');
        fl.frequency.setValueAtTime(320, t); fl.frequency.linearRampToValueAtTime(520, t + 0.6); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15); g.gain.linearRampToValueAtTime(0, t + 0.7);
        s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + 0.75);
      };
      const bell = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 660; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.002, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(g).connect(out); o.start(t); o.stop(t + 1.7); };
      let stopped = false, ng = now + 2.0, nc = now + 4.0, nb = now + 7.0;
      return {
        tick(until) {
          if (stopped) return; const c = ctx.currentTime;
          if (ng < c - 0.5) ng = c + 1; if (nc < c - 0.5) nc = c + 1; if (nb < c - 0.5) nb = c + 2;
          while (ng < until) { try { gull(ng); } catch (e) {} ng += 4 + Math.random() * 7; }
          while (nc < until) { try { creak(nc); } catch (e) {} nc += 3 + Math.random() * 5; }
          while (nb < until) { try { bell(nb); } catch (e) {} nb += 9 + Math.random() * 8; }
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
    if (K.beds && !K.beds.dock) K.beds.dock = K.stageBeds.harbour;
  }
}
// the miss ricochet colours (core/fx.js reads B.FX.ricochetColors[stageId]; the set reports no hit, so it is a fallback)
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors[ID] = { hot: ['bone', 'ice', 'mist'], flakes: ['ice', 'mist', 'cyan'], pop: 'bone', speed: 0.9, grav: 1 };
B.Stage.register({ id: ID, name: 'THE DOCK', short: 'DOCK', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon, drawCard,
  TIER_P, ballAt, ballPx, portPos, scr, duckState, chargeAt, ST, HZ, BOAT, AIMS, SHIP_X, RA, COVER, GRACE_V, FIN_HOLD, FIN_SLOT, parts: () => PARTS });
})(window.BLAM);
