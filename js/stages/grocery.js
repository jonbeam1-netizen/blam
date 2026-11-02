'use strict';
/* =========================================================================================
   B.L.A.M. stages/grocery.js -- Stage 11: GROCERY RUN (DESIGN-STAGES.md section 12, Jon's idea, Fable 2026-11-01).
   SIMPLE on purpose: one mechanic, three variants that differ in AMMO ONLY.
   THE SET: a supermarket aisle seen from behind your own shopping cart (the engine's fixed camera). Shelves on both
   sides, stocked with PLAIN muted boxes and cans (fixed per shelf bay, seeded once at build), grouped under aisle
   headers (CHIPS, SODA, CEREAL, CANDY, BAKERY, HOT FOOD, FROZEN), tile floor, fluorescent tubes. YOU ARE ALWAYS
   ROLLING: the shelves scroll toward the camera (one recycled group, offset = D(t) mod one pattern period). The aisle
   ENDS: at the far end the shelf runs stop at their end panels and the store's front opens up: a row of checkout
   lanes and the end wall with the big B.L.A.M. MART sign over them; it creeps closer all round (you ride toward it).
   ONE BIG CART (wire basket, red handle, kid seat) sits bottom-middle.
   PART 1, JUNK IN THE CART: live products (3D toon voxels, saturated, no outline) appear on a shelf at the far end
   (left / right x low / middle / top), SIT on the board, turn slowly (+-20 deg) and bob a little, and ride toward the
   camera with the shelves; the ride IS the pop window. The product's kind matches the header of the bay it is on.
   Shot: it pops off the shelf, arcs into the cart (cosmetic, 0.5 s, cartClunk) and the PILE grows (the last 24
   products stay visible on a junk heap that rises with the count; one merged mesh). HIT +1.
   PART 2, VEGGIES CLIMBING IN (round 3): fruit, veg and a steak with stick legs and arms come at the cart in WAVES
   (a few over a few seconds, then a breather) and climb its LEFT / RIGHT side (the outer face, toward you), its front
   corners or its front face, hand over hand: every GRASP jolts the cart (the cart and the pile shake, a wire clink; the
   camera never shakes). Patterns: LADDER, SPRINTER (fast, then a stop under the rim), PEEKER (ducks back down, comes
   again), PAIR (two on one side a beat apart), ROPE SWINGER (swings in from off the screen edge on a rope, lands on the
   rim, a beat, jumps in; shot mid-swing = +100 more) and from Very Hard the ZIPLINE (slides down a line from the top
   shelf to the rim). Always drawn in front of the cart (scaled toward the camera: same projection, wins every depth
   test). Shot: veg bits, +200 POINTS (not a snack: HITS count snacks only).
   IN THE CART (round 3 rule): a veggie that gets in costs no life; it stands on the pile and THROWS SNACKS OUT (one every
   ~0.8 s .. 0.5 s by tier) until it is shot (+200): each thrown snack leaves the pile and takes one HIT off the player
   whose snack it was (pure in the shared hit record). No life is lost anywhere in this stage.
   FINALE (a real ride out): the aisle ends; the cart rolls out past the end panels, swings round into checkout lane 3
   where the cashier duck already stands at the register; the scanner beeps over the pile and a receipt prints up
   reading B.L.A.M. MART with the round's score as the TOTAL (HUD-drawn so it reads), the HUD duck cheers. About 6 s.
   Every product ride, climber, the set's motion and the pile are pure functions of (seed, tier, variant), the stage
   clock and the SHARED hit times points() records / run.taken -> versus-safe.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets, P = B.Props;
const clamp = E.clamp, ID = 'grocery';
const CAMP = R.CAM_POS, PCS = Math.cos(-R.CAM_PITCH), PSN = Math.sin(-R.CAM_PITCH);
const hash1 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hash3 = (i, j, k) => hash1(Math.imul(i | 0, 73856093) ^ Math.imul(j | 0, 19349663) ^ Math.imul(k | 0, 83492791));
const inPlay = () => !!(B.G && B.G.screenName === 'play');
const slowK = () => { const G = B.G; return G && G.screenName === 'play' && G.slow < 1 && !(G.run && G.run.versus) ? G.slow : 1; };
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const lerp = (a, b, k) => a + (b - a) * k;
const shared = (g, m) => { const x = new THREE.Mesh(g, m || MAT.obj); x.userData.sharedGeo = true; return x; };
const noRay = m => { m.raycast = () => {}; return m; };
function scr(x, y, z) {                                       // world -> game px [x, y, px per world unit, view depth]
  const vx = x - CAMP.x, vy = y - CAMP.y, vz = z - CAMP.z, yc = vy * PCS - vz * PSN, d = -(vy * PSN + vz * PCS);
  const k = (R.RH / 2) / (Math.max(0.1, d) * R.TAN_H);
  return [R.RW / 2 + vx * k, R.RH / 2 - yc * k, k, d];
}
const uOfPx = px => clamp(px / R.RW, 0, 1);
const faceCam = (x, z) => Math.atan2(CAMP.x - x, CAMP.z - z);   // yaw that turns +z toward the camera

// =========================================================================================
// LAYOUT (world units; 1 unit ~ 1 m, camera eye at y 1.9, z 5)
// =========================================================================================
const LIP = 1.72, BACKX = 2.66, XP = 2.0, STK = XP + 0.3;     // shelf front edge, back panel, a product's centre x, stock front
const LEV = [0.62, 1.25, 1.88];                                 // the boards a product rides on: low / middle / top (board top y)
const DECK = 0.18, UNIT_TOP = 2.5;
const H_MAX = 0.5, LANE_HW = 0.255, BOB = 0.012, YAW_A = 0.35, YAW_W = 1.15;   // product fit (height, lane half depth), bob, turntable
// the aisle headers (one per shelf bay, the pattern repeats every NBP bays; the right run is offset by RSH bays) and the
// product LOOKS each one stocks (indices into PRODUCTS, filled in below)
// stock colours (round 3, Jon: round 2 read grey): muted but real supermarket colours, the dark / dusty palette tones
// (oxblood, rust, sand, navy, forest, plum ...) so the saturated, lit, turning live snacks still pop out of it
const HEADERS = [
  { label: 'CHIPS', bd: 'red', tx: 'yellow', kinds: ['CHIPS'], stock: 'bag', cols: ['oxblood', 'rust', 'sand', 'navy', 'tan'] },
  { label: 'SODA', bd: 'blue', tx: 'bone', kinds: ['SODA'], stock: 'can', cols: ['oxblood', 'navy', 'forest', 'chestnut', 'slate'] },
  { label: 'CEREAL', bd: 'orange', tx: 'bone', kinds: ['CEREAL'], stock: 'tall', cols: ['rust', 'sand', 'oxblood', 'tan', 'navy'] },
  { label: 'CANDY', bd: 'magenta', tx: 'lemon', kinds: ['CANDY'], stock: 'small', cols: ['plum', 'oxblood', 'indigo', 'chestnut', 'tan'] },
  { label: 'BAKERY', bd: 'pink', tx: 'bone', kinds: ['DONUT', 'CUPCAKE', 'COOKIES'], stock: 'box', cols: ['sand', 'plum', 'chestnut', 'tan', 'oxblood'] },
  { label: 'HOT FOOD', bd: 'crimson', tx: 'yellow', kinds: ['HOTDOG', 'CORNDOG', 'PIZZA'], stock: 'box', cols: ['oxblood', 'sand', 'rust', 'chestnut', 'tan'] },
  { label: 'FROZEN', bd: 'cyan', tx: 'navy', kinds: ['ICECREAM'], stock: 'box', cols: ['steel', 'navy', 'slate', 'haze', 'indigo'] }
];
const BAY = 2.4, NBP = HEADERS.length, PERIOD = BAY * NBP, RSH = 3;
const patOf = (b, sd) => (((b % NBP) + NBP) % NBP + (sd > 0 ? RSH : 0)) % NBP;
// THE AISLE END (end frame: z 0 = the end panels, the front of the store toward -z). It creeps from E_Z0 (t 0) to E_Z1
// (the director's last item); the shelf group is clipped at the end frame's z 0
const E_Z0 = -24, E_Z1 = -12;
const ZS0 = -BAY * Math.ceil((PERIOD - E_Z0 + 1) / BAY), ZS1 = 7.2;   // the aisle group spans ZS0..ZS1 (shifted 0..PERIOD)
const NBAYS = Math.ceil((ZS1 - ZS0) / BAY);
const Z0 = -9.4, POP_T = 0.2, PROD_RA = 0.1;                    // a product appears here (the far end); pop-in; shootable from
const CX = -0.1, CZ = 0.95, RIM = 1.02, BOT = 0.46, CHW = 0.8, CHL = 0.95;   // THE CART: centre, rim / basket floor y, half sizes
const PILE_Z1 = 0.8;                                            // cart-local z: the pile fills -CHL..PILE_Z1
const FLY = 0.5, PILE_N = 24, PILE_SC = 0.72;
const HANG_Y = 0.36, DROP_T = 0.3, KN = 0.45;                  // climber hang (feet y, nominal); the drop into the cart; near-scale
// climbers (round 3): side spots on the OUTER side faces (cart-local z), the climb's start (feet y), the hop onto the cart,
// a grasp's pull, a peeker's duck, the mantle over the rim; rope (pivot out / up), zipline anchor (top shelf, cart frame);
// in the cart: the wind-up before a throw, the thrown snack's flight; pools: live-snack slots, rope lines, thrown snacks
const SIDE_XL = CHW + 0.18, SIDE_XR = CHW + 0.12, Y0C = 0.05, HOP = 0.22, PULL = 0.2, DUCK_T = 0.25, MANTLE = 0.2;
const ROPE_OUT = 0.8, ROPE_PY = 4.6, RIM_PAUSE = 0.6, ZIP_X = 1.95, ZIP_Y = 2.62, ZIP_DZ = -3.2, ZIP_PAUSE = 0.35;
const THROW_UP = 0.3, TOSS_T = 0.6, LOOK = 0.35, ROPE_N = 10, TOSS_N = 4;
const NSLOT = (() => { try { const u = R.renderer.capabilities.maxVertexUniforms | 0; return clamp(Math.floor((u - 40) / 2), 0, 64); } catch (e) { return 40; } })();
const PAT = ['LADDER', 'SPRINTER', 'PEEKER', 'ROPE', 'ZIPLINE'];
// the finale: the ride out (FIN_RIDE s along the path below), the scan, the receipt; the stage holds FIN_HOLD after the last item
const FIN_RIDE = 2.4, SCAN_T = 2.75, SCAN_N = 8, SCAN_DT = 0.17, RCPT_T = 4.2, FIN_HOLD = 6.2, FIN_SLOT = 6.6;
// the front of the store (end frame): the camera's path out of the aisle, the lanes, the end wall
const XL = 2.0, Z_TURN = 0.8, Z_STOP = -4.6;                    // straight to Z_TURN, an S-curve to lane x XL, stop at Z_STOP
const LANE_W = 3.2, FW_Z = -14.5, FE_X = 16, FE_TOP = 5.4, OUR_LANE = 3;
const SO_X = XL - 1.7, SO_Z = Z_STOP - 5.5;                     // our checkout counter's near-left corner (end frame): left of the cart

// the end of a product's ride on each track (side, level): its centre leaves the screen at the side edge, or drops into the
// HUD band (row 192); the visible end a little later. Pure (camera fixed).
const EXIT = [0, 1, 2].map(lv => [-1, 1].map(sd => {
  let zs = null, zg = null;
  for (let z = Z0; z < 6; z += 0.01) {
    const p = scr(sd * XP, LEV[lv] + 0.26, z);
    if (zs == null && (p[0] < 10 || p[0] > R.RW - 10 || p[1] > 192)) zs = z;
    if (zs != null && (p[0] < -40 || p[0] > R.RW + 40 || p[1] > 270 || p[3] < 1.2)) { zg = z; break; }
  }
  return { zs: +(zs || 2.4).toFixed(3), zg: +(zg || 4).toFixed(3) };
}));
const zEnd = (lv, sd) => EXIT[lv][sd > 0 ? 1 : 0];
const RIDE_REF = (EXIT[1][0].zs + EXIT[1][1].zs) / 2 - Z0;       // the middle board's ride length (the tier's ride dial is on it)

// =========================================================================================
// MATERIALS: the set is unlit with baked vertex light (bright, symmetric left / right, no fog: a lit store to the far
// wall). ENV class (alpha 0.5) for the set, object class for the cart's wires, glow for the tubes and the sign letters.
// The aisle's own copies discard everything past the aisle end (end-frame z < 0: uAZ = the aisle group's offset in it).
// =========================================================================================
const M_ENV = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.NoBlending, fog: false });
const M_OBJ = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
// the cart's wire basket writes no depth and draws after the pile (the side walls are seen nearly edge-on from behind)
const M_WIRE = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, transparent: true, opacity: 1, blending: THREE.NoBlending });
const M_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const TOON = P.mat;                                             // the shared toon material (products, veggies, cart plastic)
const M_BEAM = new THREE.MeshBasicMaterial({ color: PAL.red, fog: false, transparent: true, blending: THREE.NoBlending, depthTest: false, depthWrite: false });   // the scan laser: drawn over the pile
const AZ = { value: 0 };
function clipped(m) {
  const c = m.clone();
  c.onBeforeCompile = sh => {
    sh.uniforms.uAZ = AZ;
    sh.vertexShader = 'uniform float uAZ;\nvarying float vGrFz;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGrFz = transformed.z + uAZ;');
    sh.fragmentShader = 'varying float vGrFz;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vGrFz < 0.0) discard;');
  };
  c.customProgramCacheKey = () => 'grocery-aisle-clip';
  return c;
}
const MA_ENV = clipped(M_ENV), MA_OBJ = clipped(M_OBJ), MA_GLOW = clipped(M_GLOW);

// =========================================================================================
// TOON VOXEL ART (Props.sdf + Props.Geo: palette tones, one lit / one shadow side). Products: full volumes, NO outline
// (no hull, no rim). Climbers keep the outline.
// =========================================================================================
const LS = 0.034, VS = 0.039;                                   // product / veggie lattice (world units per cell)
const len2 = (x, y) => Math.sqrt(x * x + y * y), len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const boxD = (x, y, z, x0, y0, z0, x1, y1, z1) => Math.max(x0 - x, x - x1, y0 - y, y - y1, z0 - z, z - z1);
const rbox = (x, y, z, cx, cy, cz, hx, hy, hz, r) => { const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; };
const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => { const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz; return (Math.sqrt(a * a + b * b + c * c) - 1) * Math.min(rx, ry, rz); };
const cylY = (x, y, z, cx, cz, r, y0, y1) => Math.max(len2(x - cx, z - cz) - r, y0 - y, y - y1);
const capD = (x, y, z, a, b, r) => P.sdf.capsule(x, y, z, a, b, r);
const slab = (d2, z, z0, z1) => Math.max(d2, z0 - z, z - z1);          // a 2D shape extruded along z (relief on a front)
const hsh = (x, y, z, s) => hash3(Math.floor(x + 64), Math.floor(y + 64), Math.floor(z + 64) * 7 + (s | 0));
function glyphs(str) { const g = R.small(str), s = new Set(); for (const [x, y] of g.px) s.add(x + ',' + y); return { has: (x, y) => s.has(x + ',' + y), w: g.w }; }
const GB = glyphs('B!');
// the "B!" house-brand mark: 7 x 5 cells, centred on (cx, cy) (cell space, y up)
const brandAt = (x, y, cx, cy) => GB.has(Math.floor(x - cx + 3.5), Math.floor(cy + 2.5 - y));
function vmap(b, shape, paint, plain) {
  const m = new Map();
  P.sdf.voxelise(m, b, shape, plain ? (x, y, z) => { const c = paint(x, y, z); return c ? { col: c, nh: true, noHull: true } : null; } : paint);
  return m;
}
function toonGeo(map, s, extra) { const g = new P.Geo(0.75); g.voxels(map, s, 0, 0, 0, false); if (extra) extra(g); return g.geometry(); }

// ---------- the product LOOKS (cells of LS; base on y 0, centred on x / z, front +z, ~15 cells tall; fitted to H_MAX) ----------
// soda cans: one body, six looks (original designs only: no real brands)
const canR = (y, R0, H) => y < 0.8 ? R0 - 0.6 + 0.75 * y : y < H - 1.4 ? R0 : y < H - 0.5 ? R0 - (y - H + 1.4) * 0.75 : R0 - 0.7;
const canShape = (R0, H) => (x, y, z) => Math.max(len2(x, z) - canR(y, R0, H), -y, y - H);
function canPaint(R0, H, body) {
  return (x, y, z) => {
    if (y > H - 1.4) { if (y > H - 0.5) { if (Math.abs(x) < 0.8 && z > 0.2 && z < 1.9) return 'steel'; return len2(x, z) > R0 - 1.3 ? 'mist' : 'haze'; } return 'mist'; }
    if (y < 0.8) return 'haze';
    return body(x, y, z, Math.atan2(x, z));
  };
}
const SODA = [
  ['RED COLA', 3.7, 13.6, (x, y, z, a) => {                     // red, a bone ribbon wrapping round, the B! on the front
    if (Math.abs(y - (6.0 + 1.5 * Math.sin(a * 1.6))) < 0.8) return 'bone';
    if (z > 0 && brandAt(x, y, 0, 9.6)) return 'bone';
    return 'red'; }],
  ['BLUE COLA', 3.7, 13.6, (x, y, z, a) => {                    // blue, a round red / cyan globe split by a bone wave
    const r = len2(x, y - 6.8);
    if (z > 0 && r < 3.0) { const w = y - 6.8 - 0.7 * Math.sin(x * 1.2); return Math.abs(w) < 0.55 ? 'bone' : w > 0 ? 'red' : 'cyan'; }
    if (z > 0 && r < 3.5) return 'bone';
    if (y > 10.6 && y < 11.5) return 'red';
    return 'blue'; }],
  ['LEMON-LIME', 3.7, 13.6, (x, y, z, a) => {                   // green, a lemon slice and a lime slice, bubbles
    if (z > 0) {
      const r1 = len2(x + 0.9, (y - 6.0) * 1.05), r2 = len2(x - 1.5, y - 9.3);
      if (r1 < 2.5) return r1 > 1.9 ? 'yellow' : (Math.abs(Math.sin(Math.atan2(y - 6, x + 0.9) * 3)) < 0.25 ? 'bone' : 'lemon');
      if (r2 < 1.9) return r2 > 1.4 ? 'forest' : (Math.abs(Math.sin(Math.atan2(y - 9.3, x - 1.5) * 3)) < 0.3 ? 'bone' : 'lime');
    }
    if (hsh(x, y, z, 3) < 0.05) return 'lime';
    return 'green'; }],
  ['CITRUS', 3.7, 13.6, (x, y, z, a) => {                       // yellow-green: a jagged forest band, a red splash
    const q = ((a * 2.4 / Math.PI) % 2 + 2) % 2, zz = 6.2 + 1.1 * (2 * Math.abs(q - 1) - 1);
    if (Math.abs(y - zz) < 0.95) return 'forest';
    if (z > 0 && len2(x, y - 9.4) < 1.5) return 'red';
    if (y > 10.6) return 'yellow';
    return 'lime'; }],
  ['PEPPER', 3.7, 13.6, (x, y, z, a) => {                       // maroon: dark bands, a bone oval label
    if ((y > 1.1 && y < 2.1) || (y > 10.5 && y < 11.5)) return 'oxblood';
    if (z > 0) { const e = (x / 2.7) ** 2 + ((y - 6.4) / 2.5) ** 2; if (e < 1) return (x / 1.8) ** 2 + ((y - 6.4) / 1.2) ** 2 < 1 ? 'crimson' : 'bone'; }
    return 'crimson'; }],
  ['ENERGY', 3.1, 15.4, (x, y, z, a) => {                       // a tall slim can: cyan, blue bands, a yellow lightning bolt
    if ((y > 12.4 && y < 13.4) || (y > 1.0 && y < 1.7)) return 'blue';
    if (z > 0.6) { const bx = x - (y > 7.5 ? (y - 7.5) * 0.4 : (7.5 - y) * 0.4 - 1.5); if (y > 2.4 && y < 12.2 && Math.abs(bx) < 1.0) return 'yellow'; }
    return 'cyan'; }]
];
// chip bags: a puffy pillow (crimped ends), a big chip / puff on the front in relief
const bagS = (x, y, z) => { const ax = Math.abs(x), yy = (y - 8) / 8, xx = ax / 6.7; return Math.max(ax - 6.5, Math.abs(y - 8) - 8, Math.abs(z) - (0.9 + 2.7 * Math.sqrt(Math.max(0, 1 - yy * yy * yy * yy) * Math.max(0, 1 - xx * xx * xx * xx)))); };
const triD = (x, y) => Math.max(3.0 - y, y - 10.0, Math.abs(x) - (10.0 - y) * 0.62);                    // a nacho triangle (2D)
const chipD = (x, y) => { const a = Math.atan2(y - 6.2, x); return len2(x / 4.3, (y - 6.2) / 3.1) - 1 + 0.06 * Math.sin(a * 5); };
const puffD = (x, y) => Math.min(len2(x + 1.9, y - 5.2) - 1.7, len2(x - 1.6, y - 4.4) - 1.6, len2(x - 0.4, y - 8.3) - 1.7, len2(x + 2.6, y - 8.6) - 1.2, len2(x - 2.9, y - 7.4) - 1.2);
function bagLook(name, bag, crimp, band, mark, icon, iconPaint) {
  const relief = (x, y, z) => slab(icon(x, y), z, 0, 4.5);
  return { name, kind: 'CHIPS', b: [-7, 0, -5, 7, 16, 5],
    shape: (x, y, z) => Math.min(bagS(x, y, z), relief(x, y, z)),
    paint: (x, y, z) => {
      if (y > 14.7 || y < 1.3) return (Math.floor(x + 20) & 1) ? crimp[0] : crimp[1];
      if (z > 0.8 && icon(x, y) < 0) return iconPaint(x, y, z);
      if (y > 11.4) return z > 0.8 && brandAt(x, y, 0, 13.0) ? mark : band;
      return bag;
    } };
}
// cereal boxes: a deep box, a bowl in relief at the bottom of the front
const bowlD = (x, y) => y < 5.8 ? len2(x / 4.6, (y - 5.8) / 4.4) - 1 : 9;
const heapD = (x, y) => y >= 5.4 ? len2(x / 4.1, (y - 5.6) / 1.7) - 1 : 9;
function cerealLook(name, box, top, band, mark, extra, flakes) {
  return { name, kind: 'CEREAL', b: [-6, 0, -4, 6, 17, 4],
    shape: (x, y, z) => Math.min(rbox(x, y, z, 0, 8, 0, 5.4, 8, 2.5, 0.35), slab(Math.min(bowlD(x, y), heapD(x, y)), z, 0, 3.4)),
    paint: (x, y, z) => {
      if (z > 1.2) {
        if (heapD(x, y) < 0) return flakes(x, y, z);
        if (bowlD(x, y) < 0) return y > 5.0 ? 'mist' : 'bone';
        if (y > 12.4 && y < 15.4) return brandAt(x, y, 0, 13.9) ? mark : band;
        const e = extra(x, y, z); if (e) return e;
      }
      return y > 15.6 ? top : box;
    } };
}
const PRODUCTS = [
  ...SODA.map(([name, R0, H, body]) => ({ name, kind: 'SODA', b: [-5, 0, -5, 5, Math.ceil(H), 5], shape: canShape(R0, H), paint: canPaint(R0, H, body) })),
  bagLook('CLASSIC CHIPS', 'yellow', ['red', 'crimson'], 'red', 'bone', chipD,
    (x, y, z) => chipD(x, y) > -0.16 ? 'orange' : (((x * 0.7 + y) % 2 + 2) % 2 < 0.6 ? 'sand' : 'amber')),
  bagLook('NACHO CHIPS', 'red', ['crimson', 'red'], 'yellow', 'red', triD,
    (x, y, z) => triD(x, y) > -0.6 ? 'amber' : hsh(x, y, z, 5) < 0.22 ? 'amber' : 'orange'),
  bagLook('CHEESY PUFFS', 'orange', ['rust', 'orange'], 'blue', 'bone', puffD,
    (x, y, z) => hsh(x, y, z, 6) < 0.25 ? 'lemon' : 'yellow'),
  bagLook('COOL RANCH', 'blue', ['deepblue', 'blue'], 'cyan', 'bone', triD,
    (x, y, z) => { const h = hsh(x, y, z, 7); return h < 0.12 ? 'green' : h < 0.2 ? 'lime' : triD(x, y) > -0.6 ? 'amber' : 'yellow'; }),
  cerealLook('RAINBOW LOOPS', 'pink', 'bubblegum', 'lemon', 'magenta',
    (x, y) => { for (const [cx, cy] of [[-2.6, 8.8], [2.2, 9.9], [-0.2, 11.2]]) { const r = len2(x - cx, y - cy); if (r < 1.5 && r > 0.6) return ['cyan', 'yellow', 'lime'][Math.round(cx + 3) % 3]; } return null; },
    (x, y, z) => ['red', 'yellow', 'lime', 'cyan', 'orange', 'bone'][Math.floor(hsh(x, y, z, 8) * 6)]),
  cerealLook('FROSTED FLAKES', 'blue', 'cyan', 'cyan', 'bone',
    (x, y) => {                                                // the mascot: a grinning duck head (the house duck)
      if (len2((x) / 1.9, (y - 8.9) / 0.75) < 1 && y < 9.2) return 'orange';
      if (len2(x, y - 9.8) < 2.7) { if ((Math.abs(x + 0.9) < 0.5 || Math.abs(x - 0.9) < 0.5) && Math.abs(y - 10.5) < 0.5) return 'void'; return 'yellow'; }
      return null; },
    (x, y, z) => hsh(x, y, z, 9) < 0.35 ? 'sand' : 'amber'),
  cerealLook('OAT RINGS', 'yellow', 'lemon', 'red', 'bone',
    (x, y) => { for (const [cx, cy] of [[-2.4, 9.0], [2.4, 10.0]]) { const r = len2(x - cx, y - cy); if (r < 1.4 && r > 0.6) return 'tan'; } return null; },
    (x, y, z) => { const h = hsh(x, y, z, 10); return h < 0.18 ? 'chestnut' : h < 0.55 ? 'tan' : 'sand'; }),
  { name: 'SWIRL POP', kind: 'CANDY', b: [-6, 0, -3, 6, 16, 3],    // a swirl lollipop on a stick in a little red stand
    shape: (x, y, z) => Math.min(cylY(x, y, z, 0, 0, 2.6, 0, 1.5), cylY(x, y, z, 0, 0, 0.75, 1.5, 6), Math.max(len2(x, y - 10.2) - 5.2, Math.abs(z) - 1.8)),
    paint: (x, y, z) => {
      if (y < 1.5) return y > 1.1 ? 'coral' : 'red';
      if (y < 5.0 && len2(x, z) < 1) return 'bone';
      const r = len2(x, y - 10.2), a = Math.atan2(y - 10.2, x), q = Math.floor(a / (2 * Math.PI) * 3 + r / 1.35 + 30) % 3;
      return ['pink', 'bone', 'cyan'][q];
    } },
  { name: 'CHOCO BAR', kind: 'CANDY', b: [-5, 0, -3, 5, 16, 3],    // a wrapped chocolate bar standing up, the top end torn open
    shape: (x, y, z) => { const yw = 12.6 + ((Math.floor(x + 20) & 1) ? 0.7 : -0.1);
      return Math.min(Math.max(rbox(x, y, z, 0, 7, 0, 4.2, 7, 1.7, 0.4), y - yw), rbox(x, y, z, 0, 13, 0, 3.6, 2.4, 1.25, 0.3)); },
    paint: (x, y, z) => {
      const yw = 12.6 + ((Math.floor(x + 20) & 1) ? 0.7 : -0.1);
      if (y > yw - 0.1 || (Math.abs(x) < 3.7 && Math.abs(z) < 1.3 && y > 12.1)) return (Math.abs(x) < 0.45 || Math.abs(y - 14.0) < 0.4) ? 'walnut' : 'chestnut';
      if (y > yw - 0.9) return 'mist';
      if (y < 1.0) return (Math.floor(x + 20) & 1) ? 'plum' : 'magenta';
      if (z > 1.0 && brandAt(x, y, 0, 9.6)) return 'bone';
      if (Math.abs(x * 0.5 + y - 5.6) < 1.4) return 'yellow';
      return 'magenta';
    } },
  { name: 'GUMMIES', kind: 'CANDY', b: [-6, 0, -4, 6, 15, 4],      // a stand-up pouch with a window full of gummy bears
    shape: (x, y, z) => { const dz = y > 12.6 ? 0.6 : 0.8 + 2.0 * clamp((11.5 - y) / 9, 0, 1);
      return Math.min(Math.max(Math.abs(x) - 5.0, -y, y - 14.4, Math.abs(z) - dz),
        ...[[-1.6, 4.4, 'red'], [1.4, 5.0, 'yellow'], [-0.6, 7.6, 'orange'], [1.8, 8.2, 'lime'], [-2.0, 9.6, 'yellow'], [0.6, 10.2, 'red']].map(([gx, gy]) => len3(x - gx, (y - gy) * 0.9, z - (0.8 + 2.0 * clamp((11.5 - gy) / 9, 0, 1))) - 1.15)); },
    paint: (x, y, z) => {
      if (z > 0.4) for (const [gx, gy, c] of [[-1.6, 4.4, 'red'], [1.4, 5.0, 'yellow'], [-0.6, 7.6, 'orange'], [1.8, 8.2, 'lime'], [-2.0, 9.6, 'yellow'], [0.6, 10.2, 'red']])
        if (len2(x - gx, (y - gy) * 0.9) < 1.25) return c;
      if (y > 12.6) return (Math.floor(x + 20) & 1) ? 'green' : 'lime';
      if (z > 0.4 && (x / 3.6) ** 2 + ((y - 7.2) / 4.4) ** 2 < 1) return 'bone';
      return 'lime';
    } },
  { name: 'DONUT', kind: 'DONUT', b: [-8, 0, -3, 8, 15, 3],        // a pink-frosted ring donut standing on edge, sprinkles
    shape: (x, y, z) => { const q = len2(x, y - 7.0) - 4.4; return len2(q, z * 1.0) - 2.6; },
    paint: (x, y, z) => {
      if (z > 0.1 || (z > -0.7 && hsh(x, y, z, 11) < 0.5)) {
        const h = hsh(x, y, z, 12); if (z > 1.2) { if (h < 0.07) return 'cyan'; if (h < 0.13) return 'yellow'; if (h < 0.18) return 'bone'; if (h < 0.22) return 'lime'; }
        return 'pink';
      }
      return y < 3 ? 'tan' : 'sand';
    } },
  { name: 'HOT DOG', kind: 'HOTDOG', b: [-10, 0, -4, 10, 10, 4],   // a hot dog lying in a paper boat: bun, dog, mustard zigzag
    shape: (x, y, z) => Math.min(
      Math.max(rbox(x, y, z, 0, 1.2, 0, 6.6, 1.2, 3.1, 0.3), -rbox(x, y, z, 0, 2.6, 0, 6.0, 1.2, 2.5, 0.1)),
      Math.max(capD(x, y, z, [-5.0, 4.2, 0], [5.0, 4.2, 0], 3.1), -Math.max(Math.abs(z) - 1.0, 5.6 - y)),
      capD(x, y, z, [-7.6, 5.2, 0], [7.6, 5.2, 0], 1.9)),
    paint: (x, y, z) => {
      if (capD(x, y, z, [-7.6, 5.2, 0], [7.6, 5.2, 0], 1.9) < 0.3) return (y > 6.2 && Math.abs(z - 0.8 * Math.sin(x * 1.3)) < 0.6) ? 'yellow' : 'red';
      if (y < 2.5 && capD(x, y, z, [-5.0, 4.2, 0], [5.0, 4.2, 0], 3.1) > 0) return ((Math.floor(x + 20) >> 1) & 1) ? 'red' : 'bone';
      return y > 5.6 ? 'tan' : 'sand';
    } },
  { name: 'CORN DOG', kind: 'CORNDOG', b: [-4, 0, -4, 4, 17, 4],   // a golden battered dog on a wooden stick (a little holder), a mustard zigzag
    shape: (x, y, z) => Math.min(cylY(x, y, z, 0, 0, 2.1, 0, 0.9), cylY(x, y, z, 0, 0, 0.75, 0.9, 5.4), capD(x, y, z, [0, 7.3, 0], [0, 11.6, 0], 3.0 - Math.max(0, y - 10.2) * 0.12)),
    paint: (x, y, z) => {
      if (y < 0.9) return y > 0.5 ? 'mist' : 'haze';
      if (y < 4.6 && len2(x, z) < 1.1) return y < 3.4 ? 'sand' : 'tan';
      if (z > 1.0 && Math.abs(x - 1.1 * Math.sin(y * 1.25)) < 0.7) return 'lemon';
      const h = hsh(x, y, z, 13); return h < 0.18 ? 'orange' : h < 0.3 ? 'sand' : 'amber';
    } },
  { name: 'PIZZA', kind: 'PIZZA', b: [-9, 0, -3, 9, 16, 3],        // a slice standing on its crust: cheese, pepperoni in relief
    shape: (x, y, z) => {
      const pep = Math.min(...[[-2.2, 6.0], [2.0, 7.4], [-0.2, 10.8], [0.4, 4.4]].map(([px, py]) => len2(x - px, y - py) - 1.5));
      return Math.min(Math.max(capD(x, y, z, [-6.3, 2.0, 0], [6.3, 2.0, 0], 2.0), -y),
        Math.max(2.4 - y, y - 15.2, Math.abs(x) - 6.1 * (15.2 - y) / 12.8, Math.abs(z) - 1.2),
        Math.max(pep, Math.abs(x) - 6.1 * (15.2 - y) / 12.8 + 0.6, -z, z - 1.9));
    },
    paint: (x, y, z) => {
      if (capD(x, y, z, [-6.3, 2.0, 0], [6.3, 2.0, 0], 2.0) < 0.2) return y > 2.8 ? 'sand' : 'tan';
      if (z < -0.4) return 'sand';
      for (const [px, py] of [[-2.2, 6.0], [2.0, 7.4], [-0.2, 10.8], [0.4, 4.4]]) if (len2(x - px, y - py) < 1.6) return hsh(x, y, z, 14) < 0.18 ? 'crimson' : 'red';
      const h = hsh(x, y, z, 15); return h < 0.1 ? 'lemon' : h < 0.16 ? 'amber' : 'yellow';
    } },
  { name: 'COOKIES', kind: 'COOKIES', b: [-8, 0, -4, 8, 11, 4],    // a cyan box, a window with round chocolate-chip cookies
    shape: (x, y, z) => Math.min(rbox(x, y, z, 0, 5.4, 0, 6.6, 5.4, 2.6, 0.35),
      ...[-3.8, 0, 3.8].map(cx => slab(len2(x - cx, y - 4.8) - 1.75, z, 0, 3.4))),
    paint: (x, y, z) => {
      if (z > 2.1) {
        for (const cx of [-3.8, 0, 3.8]) { const r = len2(x - cx, y - 4.8); if (r < 1.8 && z > 2.3) return r > 1.3 ? 'tan' : hsh(x, y, z, 16) < 0.3 ? 'walnut' : 'sand'; }
        if (y > 8.6) return brandAt(x, y, 0, 9.7) ? 'bone' : 'red';
        if (Math.abs(x) < 5.9 && y > 1.8 && y < 7.8) return 'navy';
      }
      return 'cyan';
    } },
  { name: 'ICE CREAM', kind: 'ICECREAM', b: [-5, 0, -5, 5, 19, 5], // a waffle cone in a little stand, a pink scoop, a cherry
    shape: (x, y, z) => Math.min(cylY(x, y, z, 0, 0, 2.5, 0, 2.0), Math.max(len2(x, z) - (1.1 + (y - 1.4) * 0.29), 1.4 - y, y - 9.4),
      ell(x, y, z, 0, 11.6, 0, 3.9, 3.5, 3.9), ...[0, 1, 2, 3, 4].map(i => len3(x - 3.3 * Math.cos(i * 1.3 + 0.4), y - 9.7, z - 3.3 * Math.sin(i * 1.3 + 0.4)) - 1.0),
      len3(x - 0.3, y - 15.7, z - 0.4) - 1.35, capD(x, y, z, [0.3, 16.6, 0.4], [1.3, 18.2, 0.1], 0.4)),
    paint: (x, y, z) => {
      if (y < 2.0 && len2(x, z) > 1.4 + (y - 1.4) * 0.29) return y > 1.6 ? 'ice' : 'cyan';
      if (y > 16.7) return 'green';
      if (len3(x - 0.3, y - 15.7, z - 0.4) < 1.6) return 'red';
      if (y > 9.2) return hsh(x, y, z, 17) < 0.1 ? 'bubblegum' : 'pink';
      if (y > 8.6) return 'sand';
      return ((Math.floor(x + y + 40) % 3) === 0 || (Math.floor(x - y + 40) % 3) === 0) ? 'chestnut' : 'tan';
    } },
  { name: 'CUPCAKE', kind: 'CUPCAKE', b: [-6, 0, -6, 6, 16, 6],    // a ridged cup, a pink frosting swirl with sprinkles, a cherry
    shape: (x, y, z) => Math.min(Math.max(len2(x, z) - (3.3 + y * 0.13), -y, y - 5.4),
      ell(x, y, z, 0, 6.6, 0, 4.6, 1.8, 4.6), ell(x, y, z, 0, 8.4, 0, 3.6, 1.6, 3.6), ell(x, y, z, 0, 10.0, 0, 2.4, 1.5, 2.4),
      len3(x, y - 12.6, z) - 1.45, capD(x, y, z, [0, 13.6, 0], [0.8, 15.2, 0], 0.4)),
    paint: (x, y, z) => {
      if (y > 13.8) return 'green';
      if (y > 11.2) return 'red';
      if (y > 5.3) { const h = hsh(x, y, z, 18); if (h < 0.05) return 'yellow'; if (h < 0.1) return 'cyan'; if (h < 0.14) return 'lime'; return 'pink'; }
      return (Math.floor(Math.atan2(z, x) * 5 + 20) & 1) ? 'cyan' : 'blue';
    } }
];
// the kinds (11) and each header's looks
const KINDS = ['SODA', 'CHIPS', 'CEREAL', 'CANDY', 'DONUT', 'HOTDOG', 'CORNDOG', 'PIZZA', 'COOKIES', 'ICECREAM', 'CUPCAKE'];
for (const H of HEADERS) H.looks = PRODUCTS.map((p, i) => H.kinds.includes(p.kind) ? i : -1).filter(i => i >= 0);

// ---------- the climbers (cells of VS; body above the legs, facing +z): chunky full volumes with eyes ----------
const LEGL = 0.14;                                              // stick legs below the body (world)
const L0 = LEGL / VS;                                           // body base in cells
const STEAK_BONE = (x, y, z) => { let d = 99; const N = 6, c = [-0.4, L0 + 7.2], RB = 8.9;
  for (let i = 0; i < N; i++) { const a0 = 2.5 + i * 0.17, a1 = a0 + 0.17; d = Math.min(d, capD(x, y, z, [c[0] + RB * Math.cos(a0), c[1] + RB * Math.sin(a0), 0], [c[0] + RB * Math.cos(a1), c[1] + RB * Math.sin(a1), 0], 1.3)); }
  return Math.min(d, len3(x - (c[0] + RB * Math.cos(2.5)), y - (c[1] + RB * Math.sin(2.5)), z) - 1.9); };
const STEAK_2D = (x, y) => (len2((x - 0.6) / 8.2, (y - L0 - 7.2) / 6.9) - 1) * 6.9 + 0.35 * Math.sin(x * 0.7 + y * 0.3);
const VEGGIES = [
  { name: 'BROCCOLI', b: [-9, L0 - 1, -7, 9, L0 + 19, 7], eyeY: L0 + 11.2,
    shape: (x, y, z) => Math.min(cylY(x, y, z, 0, 0, 2.9, L0, L0 + 8.5), len3(x, y - L0 - 12.2, z) - 4.6, len3(x + 4.1, y - L0 - 10.4, z - 0.3) - 3.6, len3(x - 4.1, y - L0 - 10.4, z - 0.3) - 3.6,
      len3(x + 2.2, y - L0 - 14.8, z + 0.4) - 3.4, len3(x - 2.4, y - L0 - 14.6, z) - 3.4, len3(x, y - L0 - 11, z - 2.8) - 3.2),
    paint: (x, y, z) => { if (y < L0 + 7.2 && len2(x, z) < 3.1) return 'lime'; const h = hsh(x, y, z, 21); return h < 0.28 ? 'forest' : h < 0.4 ? 'lime' : 'green'; } },
  { name: 'CARROT', b: [-7, L0 - 1, -6, 7, L0 + 21, 6], eyeY: L0 + 9.6,
    shape: (x, y, z) => Math.min(Math.max(len2(x, z) - (1.0 + (y - L0) * 0.27), L0 - y, y - L0 - 13.2), ell(x, y, z, 0, L0 + 13.0, 0, 4.5, 1.2, 4.5),
      capD(x, y, z, [0, L0 + 13.5, 0], [-2.6, L0 + 19, 0.4], 1.25), capD(x, y, z, [0, L0 + 13.5, 0], [0.4, L0 + 20.4, -0.4], 1.25), capD(x, y, z, [0, L0 + 13.5, 0], [2.8, L0 + 18.6, 0.2], 1.25)),
    paint: (x, y, z) => y > L0 + 14 ? (hsh(x, y, z, 22) < 0.3 ? 'forest' : 'green') : (Math.floor(y) % 3 === 0 && hsh(x, y, z, 23) < 0.6 ? 'rust' : 'orange') },
  { name: 'SPUD', b: [-7, L0 - 1, -6, 7, L0 + 15, 6], eyeY: L0 + 8.2,
    shape: (x, y, z) => ell(x, y, z, 0, L0 + 6.8, 0, 5.9, 6.8, 4.9) + 0.25 * Math.sin(x * 0.9 + y * 0.7),
    paint: (x, y, z) => { const h = hsh(x, y, z, 24); return h < 0.06 ? 'chestnut' : h < 0.22 ? 'tan' : 'sand'; } },
  { name: 'STEAK', b: [-12, L0 - 1, -4, 10, L0 + 16, 4], eyeY: L0 + 10.0,
    // a thick oval slab of marbled red meat standing up: a fat rim all round, the white fat eye, a curved rib bone down the left
    shape: (x, y, z) => { const d2 = STEAK_2D(x, y); return Math.min(len2(Math.max(d2 + 0.9, 0), Math.max(Math.abs(z) - 1.7, 0)) + Math.min(Math.max(d2 + 0.9, Math.abs(z) - 1.7), 0) - 0.9, STEAK_BONE(x, y, z)); },
    paint: (x, y, z) => {
      if (STEAK_BONE(x, y, z) < 0.35) return 'bone';
      const d2 = STEAK_2D(x, y), a = Math.atan2(y - L0 - 7.2, x - 0.6);
      if (d2 > -1.3 && a > -0.9 && a < 1.9) return 'lemon';                      // the fat cap round the top and the right side
      if (Math.abs(z) < 1.4 && d2 > -0.6) return 'crimson';                      // the cut edge (the slab's thickness)
      if (z < -1.0) return 'crimson';
      if (len2((x - 1.2) / 2.0, (y - L0 - 4.4) / 1.3) < 1) return 'lemon';      // the fat eye in the middle
      if (z > 0 && Math.abs(Math.sin(x * 0.9 + y * 0.5) + Math.sin(y * 1.3 - x * 0.4)) < 0.08) return 'bubblegum';   // marbling streaks
      return 'red';
    } },
  { name: 'APPLE', b: [-7, L0 - 1, -7, 7, L0 + 16, 7], eyeY: L0 + 7.4,
    shape: (x, y, z) => Math.min(Math.max(ell(x, y, z, 0, L0 + 6.2, 0, 6.1, 5.7, 5.9), -(len3(x, y - L0 - 12.0, z) - 1.8)), capD(x, y, z, [0, L0 + 10.2, 0], [0.7, L0 + 13.4, 0], 0.7), ell(x, y, z, 2.5, L0 + 12.6, 0, 2.3, 1.0, 0.8)),
    paint: (x, y, z) => { if (y > L0 + 10.6) return x > 1.2 ? 'green' : 'walnut'; if (x < -2 && y > L0 + 7 && z > 1) return 'coral'; return y < L0 + 1.6 ? 'crimson' : 'red'; } },
  { name: 'BANANA', b: [-8, L0 - 1, -4, 8, L0 + 20, 4], eyeY: L0 + 8.4,
    shape: (x, y, z) => { const c = [[2.0, L0 + 0.8], [-0.7, L0 + 4.6], [-1.4, L0 + 9.2], [-0.4, L0 + 13.6], [1.9, L0 + 17.2]]; let d = 99;
      for (let i = 0; i < 4; i++) d = Math.min(d, capD(x, y, z, [c[i][0], c[i][1], 0], [c[i + 1][0], c[i + 1][1], 0], i === 0 || i === 3 ? 2.4 : 3.1)); return d; },
    paint: (x, y, z) => { if (y < L0 + 1.4 || y > L0 + 17.4) return 'walnut'; return x > 1.4 && z < 1 ? 'amber' : 'yellow'; } },
  { name: 'CORN', b: [-7, L0 - 1, -5, 7, L0 + 18, 5], eyeY: L0 + 9.8,
    shape: (x, y, z) => Math.min(capD(x, y, z, [0, L0 + 3.8, 0], [0, L0 + 14.2, 0], 3.4), capD(x, y, z, [-2.8, L0 + 1, 0.6], [-4.9, L0 + 10, -0.8], 1.3), capD(x, y, z, [2.8, L0 + 1, 0.6], [4.9, L0 + 10, -0.8], 1.3)),
    paint: (x, y, z) => { if (len2(x, z) > 3.1 && (Math.abs(x) > 2.8 || y < L0 + 2)) return hsh(x, y, z, 25) < 0.3 ? 'lime' : 'green'; return ((Math.floor(x + 20) + Math.floor(y)) & 1) ? 'yellow' : 'lemon'; } }
];
// eyes: two bone discs + void pupils painted on the front of any veggie body (looking at you, a bit worried)
function withEyes(V) {
  const front = (x, y) => { for (let z = 8; z > -8; z -= 0.25) if (V.shape(x, y, z) < 0) return z; return -99; };
  const E0 = [[-2.0, V.eyeY], [2.0, V.eyeY]], fz = E0.map(([x, y]) => front(x, y));
  return (x, y, z) => {
    for (let e = 0; e < 2; e++) {
      const [ex, ey] = E0[e];
      if (len2(x - ex, (y - ey) * 0.85) < 1.75 && z > fz[e] - 1.6) return (len2(x - ex - 0.3, y - ey + 0.2) < 0.8) ? { col: 'void', nh: true } : { col: 'bone', nh: true };
    }
    return V.paint(x, y, z);
  };
}
// stick limbs (void, no hull), bone glove hands and red shoes (outlined): a straight voxel line of cubes
function stick(g, a, b, col = 'void') {
  const n = Math.max(2, Math.ceil(len3(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.024)), h = 0.017;
  for (let i = 0; i <= n; i++) { const k = i / n, x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k), z = lerp(a[2], b[2], k); g.bx(x - h, y - h, z - h, x + h, y + h, z + h, col, false); }
}
// poses: arms [l, r] hand points and legs [l, r] foot points, relative to the shoulders / hips (world units)
const POSES = {
  run0: { a: [[-0.13, -0.13, 0.04], [0.12, 0.03, -0.03]], l: [[-0.1, -0.13, 0.04], [0.09, -0.1, -0.04]] },
  run1: { a: [[-0.12, 0.03, -0.03], [0.13, -0.13, 0.04]], l: [[-0.09, -0.1, -0.04], [0.1, -0.13, 0.04]] },
  clb0: { a: [[-0.03, 0.26, 0.05], [0.14, 0.0, 0.05]], l: [[-0.08, -0.07, 0.06], [0.05, -0.14, 0.03]] },
  clb1: { a: [[-0.14, 0.0, 0.05], [0.03, 0.26, 0.05]], l: [[-0.05, -0.14, 0.03], [0.08, -0.07, 0.06]] },
  hng0: { a: [[-0.04, 0.28, 0.03], [0.04, 0.28, 0.03]], l: [[-0.06, -0.14, 0.0], [0.09, -0.12, 0.05]] },
  hng1: { a: [[-0.04, 0.27, 0.03], [0.04, 0.28, 0.03]], l: [[-0.09, -0.12, 0.05], [0.06, -0.14, 0.0]] },
  fall: { a: [[-0.15, 0.16, 0.03], [0.15, 0.16, 0.03]], l: [[-0.13, -0.06, 0.03], [0.13, -0.06, 0.03]] },
  stand: { a: [[-0.13, -0.1, 0.04], [0.13, -0.1, 0.04]], l: [[-0.05, -0.14, 0.01], [0.05, -0.14, 0.01]] },   // round 3: on the rim / in the cart
  thr: { a: [[-0.05, 0.27, -0.02], [0.05, 0.27, -0.02]], l: [[-0.07, -0.14, 0.02], [0.07, -0.14, 0.02]] }    // a snack held over the head
};
const POSE_K = Object.keys(POSES);
let ART = null;
// a product look's fit: the largest scale (<= 1.15) whose height <= H_MAX and whose footprint, turned up to 0.75 rad
// (faceCam + the turntable), stays inside the lane between the shelf lip and the stock
function fitOf(bb) {
  const hx = Math.max(-bb.min.x, bb.max.x), hz = Math.max(-bb.min.z, bb.max.z), h = bb.max.y;
  let ext = 0; for (let a = 0; a <= 0.76; a += 0.04) ext = Math.max(ext, hx * Math.sin(a) + hz * Math.cos(a));
  return Math.min(1.15, H_MAX / h, LANE_HW / ext);
}
function buildArt() {
  if (ART) return ART;
  const t0 = performance.now();
  ART = { prod: [], veg: [] };
  for (const Pd of PRODUCTS) {
    const geo = toonGeo(vmap(Pd.b, Pd.shape, Pd.paint, true), LS);
    geo.computeBoundingBox(); const bb = geo.boundingBox, fit = fitOf(bb);
    ART.prod.push({ geo, fit, name: Pd.name, kind: Pd.kind, hw: Math.max(-bb.min.x, bb.max.x) * fit, hh: (bb.max.y - Math.max(0, bb.min.y)) / 2 * fit, cy: (bb.max.y + Math.max(0, bb.min.y)) / 2 * fit,
      verts: geo.attributes.position.count, idx: geo.index.count });
  }
  for (const V of VEGGIES) {
    const map = vmap(V.b, V.shape, withEyes(V));
    let x0 = 99, x1 = -99, y1 = -99; for (const c of map.values()) { x0 = Math.min(x0, c.i); x1 = Math.max(x1, c.i + 1); y1 = Math.max(y1, c.j + 1); }
    const sx = Math.max(Math.abs(x0), x1) * VS * 0.8, top = y1 * VS, sy = LEGL + (top - LEGL) * 0.52;
    const chips = []; for (const c of map.values()) if (hash3(c.i, c.j, c.k) < 0.3) chips.push([c.i, c.j, c.k, PAL[c.col] != null ? PAL[c.col] : PAL.green]);
    const poses = {};
    for (const k of POSE_K) {
      const Q = POSES[k];
      poses[k] = toonGeo(map, VS, g => {
        for (const s of [0, 1]) {
          const sh = [s ? sx : -sx, sy, 0.03], hd = [sh[0] + Q.a[s][0], sh[1] + Q.a[s][1], sh[2] + Q.a[s][2]];
          stick(g, sh, hd); g.bx(hd[0] - 0.037, hd[1] - 0.037, hd[2] - 0.03, hd[0] + 0.037, hd[1] + 0.037, hd[2] + 0.03, 'bone', true);
          const hp = [s ? 0.06 : -0.06, LEGL + 0.01, 0], ft = [hp[0] + Q.l[s][0], hp[1] + Q.l[s][1], hp[2] + Q.l[s][2]];
          stick(g, hp, ft); g.bx(ft[0] - 0.042, ft[1] - 0.024, ft[2] - 0.03, ft[0] + 0.042, ft[1] + 0.024, ft[2] + 0.06, 'red', true);
        }
      });
    }
    ART.veg.push({ poses, chips, top: top + 0.1, sx, sy, name: V.name, hw: sx + 0.06, hh: (top - LEGL) * 0.5 + 0.05, mid: LEGL + (top - LEGL) * 0.5,
      hangY: RIM + 0.05 - (sy + 0.28) });
  }
  ART.ms = +(performance.now() - t0).toFixed(1);
  return ART;
}

// =========================================================================================
// THE SET
// =========================================================================================
// baked light: tube pools along the aisle (bay-local, so the pools ride with their tubes), brighter up high
function bakeAisle(x, y, z) {
  const zb = ((z - ZS0) % BAY + BAY) % BAY, c = Math.cos(Math.PI * (zb - BAY / 2) / BAY);
  return Math.min(1.12, 0.84 + 0.06 * clamp(y / 2.5, 0, 1) + 0.16 * c * c - 0.05 * clamp(Math.abs(x) - 2.0, 0, 1));
}
// an axis box mirrored to side sd (-1 left / +1 right): x0..x1 are distances from the aisle centre
function sbx(v, sd, x0, y0, z0, x1, y1, z1, col, mask) { const a = sd * x0, b = sd * x1; v.bx(Math.min(a, b), y0, z0, Math.max(a, b), y1, z1, col, null, mask); }
// the shelf STOCK of one board in one bay: plain muted boxes / cans in blocks of 2-5 facings, no labels, no motion.
// Seeded by (bay pattern, side, board) ONLY: every bay with the same header holds the same stock, so nothing changes when
// the recycled group wraps (#106)
function stockRun(env, sd, pat, li, y, yTop, z0, z1, aisle) {
  const H = HEADERS[pat], rr = q => hash3(pat * 7 + 3, li * 13 + (sd > 0 ? 1 : 0), q), avail = yTop - y;
  let z = z0 + 0.1, q = 0, blk = 0, col = null, w = 0, h = 0;
  while (z < z1 - 0.12) {
    if (blk <= 0) {
      blk = 2 + Math.floor(rr(q * 3 + 11) * 5); col = PAL[H.cols[Math.floor(rr(q * 3 + 2) * H.cols.length) % H.cols.length]];
      const s = H.stock;                                        // round 3: fuller boards (taller facings, longer blocks)
      w = s === 'can' ? 0.13 : s === 'small' ? 0.1 + rr(q * 3) * 0.05 : s === 'tall' ? 0.2 + rr(q * 3) * 0.06 : s === 'bag' ? 0.24 + rr(q * 3) * 0.06 : 0.15 + rr(q * 3) * 0.12;
      h = s === 'can' ? 0 : s === 'tall' ? avail * (0.88 + rr(q * 3 + 1) * 0.09) : s === 'small' ? avail * (0.55 + rr(q * 3 + 1) * 0.25) : avail * (0.74 + rr(q * 3 + 1) * 0.22);
    }
    blk--;
    const ze = Math.min(z + w, z1 - 0.08), dx0 = STK + rr(q * 5 + 7) * 0.03, dx1 = BACKX - 0.06;
    if (H.stock === 'can') {                                    // cans: plus-section columns, stacked two high where they fit
      const ch = 0.21, n = Math.max(1, Math.min(2, Math.floor((avail - 0.02) / (ch + 0.01))));
      for (let k = 0; k < n; k++) {
        const y0 = y + k * (ch + 0.005), y1 = y0 + ch;
        for (let r = dx0; r < dx1 - 0.1; r += 0.13) {
          sbx(env, sd, r + 0.02, y0, z + 0.005, r + 0.11, y1, ze - 0.015, col, 1 | 2 | 4 | 16 | 32);
          sbx(env, sd, r, y0, z + 0.025, r + 0.13, y1, ze - 0.035, col, 1 | 2 | 4);
        }
      }
    } else sbx(env, sd, dx0, y, z, dx1, y + h, ze - 0.015, col, aisle | 4 | 16);
    z = ze + 0.012; q++;
  }
}
function buildAisle(env, glow, obj) {
  // FLOOR: big vinyl checker (bone / mist) with a coloured accent run along each shelf base
  for (let z = ZS0; z < ZS1 - 0.01; z += 0.6) for (let x = -2.7; x < 2.69; x += 0.6) {
    const i = Math.round((x + 2.7) / 0.6), j = Math.round((z - ZS0) / 0.6), edge = Math.abs(x + 0.3) > 1.45;
    const c = edge ? ((j & 1) ? 'red' : 'bone') : ((i + j) & 1) ? 'bone' : 'mist';
    env.bx(x, -0.1, z, x + 0.6, 0, z + 0.6, PAL[c], null, 4);
    if (!edge) env.bx(x, 0, z, x + 0.6, 0.002, z + 0.025, PAL.haze, null, 4);
  }
  // CEILING: mist tiles, haze grid; fixture rows along the aisle (steel housings, glowing diffusers)
  for (let z = ZS0; z < ZS1 - 0.01; z += 1.2) {
    env.bx(-2.8, 3.62, z, 2.8, 3.7, z + 1.2, PAL.mist, null, 8);
    env.bx(-2.8, 3.6, z, 2.8, 3.62, z + 0.04, PAL.haze, null, 8);
  }
  for (let b = 0; b < NBAYS; b++) {
    const z0 = ZS0 + b * BAY;
    for (const fx of [-0.75, 0.75]) {
      obj.bx(fx - 0.17, 3.5, z0 + 0.25, fx + 0.17, 3.6, z0 + BAY - 0.25, PAL.steel, null, 1 | 2 | 8 | 16);
      glow.bx(fx - 0.13, 3.48, z0 + 0.3, fx + 0.13, 3.5, z0 + BAY - 0.3, PAL.bone, null, 8 | 16);
      glow.bx(fx - 0.04, 3.475, z0 + 0.32, fx + 0.04, 3.48, z0 + BAY - 0.32, PAL.lemon, null, 8);
    }
  }
  // SHELVES: two gondola runs, bays of BAY with an upright at each start; NBP bay patterns (headers + stock) repeat
  for (let b = 0; b < NBAYS; b++) {
    const z0 = ZS0 + b * BAY, z1 = z0 + BAY;
    for (const sd of [-1, 1]) {
      const aisle = sd < 0 ? 1 : 2, pat = patOf(b, sd);        // the face mask bit that looks at the aisle
      sbx(env, sd, LIP - 0.02, 0, z0, BACKX, DECK, z1, PAL.slate, aisle | 4 | 16);       // kick plate
      sbx(env, sd, BACKX - 0.04, DECK, z0, BACKX, UNIT_TOP, z1, PAL.haze, aisle | 16);   // back panel (pegboard)
      for (let y = DECK + 0.12; y < UNIT_TOP - 0.05; y += 0.12) for (let z = z0 + 0.1; z < z1 - 0.05; z += 0.2) sbx(env, sd, BACKX - 0.045, y, z, BACKX - 0.04, y + 0.03, z + 0.03, PAL.steel, aisle);
      sbx(env, sd, LIP - 0.07, 0, z0, LIP + 0.01, UNIT_TOP + 0.05, z0 + 0.08, PAL.steel, aisle | 16 | 4);   // the upright (front post)
      sbx(env, sd, BACKX - 0.1, 0, z0, BACKX - 0.04, UNIT_TOP + 0.05, z0 + 0.06, PAL.slate, aisle | 16);
      // header on top facing the aisle (the bay's aisle sign), lettered in 3x5 pixels
      const H = HEADERS[pat], hy0 = UNIT_TOP + 0.05, hy1 = hy0 + 0.42;
      sbx(env, sd, LIP + 0.04, hy0, z0 + 0.2, LIP + 0.1, hy1, z1 - 0.2, PAL[H.bd], aisle | 4 | 16);
      const tx = R.small(H.label), s = 0.055, tw = tx.w * s, zc = (z0 + z1) / 2;
      for (const [px, py] of tx.px) {
        const zz = sd < 0 ? zc + tw / 2 - (px + 1) * s : zc - tw / 2 + px * s, yy = hy1 - 0.08 - (py + 1) * s;
        sbx(env, sd, LIP + 0.035, yy, zz, LIP + 0.04, yy + s, zz + s, PAL[H.tx], aisle);
      }
      // the boards: deck + three riding boards (a lemon price channel on the lip with bone price tags) + stock
      const boards = [DECK, LEV[0], LEV[1], LEV[2]];
      boards.forEach((y, li) => {
        if (li) sbx(env, sd, LIP, y - 0.05, z0 + 0.07, BACKX - 0.04, y, z1, PAL.mist, 4 | aisle);
        sbx(env, sd, LIP - 0.03, y - 0.065, z0 + 0.07, LIP, y + 0.01, z1, PAL.yellow, aisle | 4 | 16 | 8);   // (a slim channel: products fit under the next board)
        for (let z = z0 + 0.25; z < z1 - 0.2; z += 0.42) {
          sbx(env, sd, LIP - 0.035, y - 0.055, z, LIP - 0.03, y - 0.005, z + 0.13, PAL.bone, aisle);
          sbx(env, sd, LIP - 0.04, y - 0.042, z + 0.03, LIP - 0.035, y - 0.02, z + 0.1, PAL.red, aisle);
        }
        stockRun(env, sd, pat, li, y, li < 3 ? boards[li + 1] - 0.1 : UNIT_TOP - 0.06, z0, z1, aisle);
      });
    }
  }
}
// ---------- the front of the store (end frame, static): the gondola end panels, the floor, the high ceiling, the end
// wall with the BIG B.L.A.M. MART sign over a row of checkout lanes (ours: lane 3, the cashier duck at the register) ----------
function buildStand(v, g, ox, oz, open, num) {                 // a checkout counter: origin = its near-left corner (x0, z 0)
  const x0 = ox, x1 = ox + 0.62, zN = oz, zF = oz - 2.0, RZw = oz + RZ;
  v.bx(x0, 0, zF, x1, 0.86, zN, PAL.crimson); v.bx(x0 - 0.01, 0.1, zF, x0, 0.8, zN, PAL.red, null, 2);
  v.bx(x0 - 0.02, 0.86, zF - 0.02, x1 + 0.02, 0.92, zN + 0.02, PAL.bone);
  v.bx(x0 + 0.06, 0.92, RZw + 0.35, x1 - 0.06, 0.94, zN - 0.08, PAL.void);              // the belt (runs toward the register)
  for (let z = RZw + 0.45; z < zN - 0.1; z += 0.2) v.bx(x0 + 0.06, 0.94, z, x1 - 0.06, 0.945, z + 0.03, PAL.midnight);
  v.bx(x0 + 0.08, 0.92, RZw + 0.08, x1 - 0.08, 0.935, RZw + 0.3, PAL.deepblue);         // the scanner glass
  // the register: a slate box, a display on a stalk, the receipt slot on top
  const z = RZw;
  v.bx(x0 + 0.1, 0.92, z - 0.25, x1 - 0.06, 1.14, z + 0.02, PAL.slate); v.bx(x0 + 0.08, 1.14, z - 0.27, x1 - 0.04, 1.18, z + 0.04, PAL.steel);
  v.bx(x0 + 0.2, 1.18, z - 0.2, x0 + 0.46, 1.2, z - 0.05, PAL.void);
  v.bx(x0 + 0.08, 0.97, z + 0.02, x1 - 0.12, 1.1, z + 0.03, PAL.midnight);
  v.bx(x0 + 0.28, 1.18, z - 0.02, x0 + 0.33, 1.42, z + 0.02, PAL.steel); v.bx(x0 + 0.04, 1.4, z - 0.03, x0 + 0.48, 1.6, z + 0.03, PAL.slate);
  v.bx(x0 + 0.07, 1.43, z + 0.03, x0 + 0.45, 1.57, z + 0.035, PAL.midnight);
  // the lane light at the far end: a pole, a box with the lane number (lit lemon on the open lane)
  v.bx(x1 - 0.12, 0.92, zF + 0.05, x1 - 0.06, 2.3, zF + 0.11, PAL.steel);
  v.bx(x1 - 0.3, 2.3, zF - 0.02, x1 + 0.12, 2.62, zF + 0.18, PAL.slate);
  (open ? g : v).bx(x1 - 0.27, 2.33, zF + 0.18, x1 + 0.09, 2.59, zF + 0.19, open ? PAL.lemon : PAL.haze, null, 16);
  for (const [px, py] of R.small(String(num)).px) (open ? g : v).bx(x1 - 0.17 + px * 0.05, 2.54 - (py + 1) * 0.045, zF + 0.19, x1 - 0.17 + (px + 1) * 0.05, 2.54 - py * 0.045, zF + 0.2, open ? PAL.red : PAL.slate, null, 16);
  if (open) {
    g.bx(x0 + 0.1, 0.936, RZw + 0.1, x1 - 0.1, 0.94, RZw + 0.28, PAL.red, null, 4);     // the scanner's red cross
    for (const [px, py] of R.small('$7.99').px) g.bx(x0 + 0.08 + px * 0.022, 1.53 - py * 0.022, z + 0.036, x0 + 0.1 + px * 0.022, 1.552 - py * 0.022, z + 0.04, PAL.lime, null, 16);
  }
}
function buildFar(env, glow, obj) {
  // the gondola end panels closing the aisle's two shelf runs (a red band, a small B! tag), and the bulkhead above
  for (const sd of [-1, 1]) {
    sbx(obj, sd, LIP - 0.09, 0, -0.12, BACKX + 0.2, UNIT_TOP + 0.5, 0.0, PAL.steel, 63);
    sbx(obj, sd, LIP - 0.1, 0.95, -0.13, BACKX + 0.21, 1.15, 0.01, PAL.red, 63);
    sbx(obj, sd, LIP - 0.1, UNIT_TOP + 0.3, -0.13, BACKX + 0.21, UNIT_TOP + 0.5, 0.01, PAL.red, 63);
  }
  env.bx(-FE_X, 3.7, -0.1, FE_X, FE_TOP, 0, PAL.mist, null, 32 | 8);
  for (const sd of [-1, 1]) sbx(env, sd, BACKX + 0.2, 0, -0.1, FE_X, 3.7, 0, PAL.haze, 32);
  // floor (big checker, a red runway into each lane), ceiling (tiles + light panels), side walls
  for (let z = 0; z > FW_Z + 0.01; z -= 1.0) for (let x = -FE_X; x < FE_X - 0.01; x += 1.0) {
    const i = Math.round(x + FE_X), j = Math.round(-z);
    env.bx(x, -0.1, z - 1.0, x + 1.0, 0, z, PAL[((i + j) & 1) ? 'bone' : 'mist'], null, 4);
  }
  for (let z = 0; z > FW_Z + 0.01; z -= 2.0) for (let x = -FE_X; x < FE_X - 0.01; x += 2.0) env.bx(x, FE_TOP, z - 2.0, x + 2.0, FE_TOP + 0.1, z, PAL.mist, null, 8);
  for (let z = -1.5; z > FW_Z + 1; z -= 3.0) for (let x = -FE_X + 1.5; x < FE_X - 1; x += 4.0) glow.bx(x - 0.9, FE_TOP - 0.02, z - 0.3, x + 0.9, FE_TOP, z + 0.3, PAL.bone, null, 8);
  for (const sx of [-1, 1]) { env.bx(sx < 0 ? -FE_X - 0.1 : FE_X, 0, FW_Z, sx < 0 ? -FE_X : FE_X + 0.1, FE_TOP, 0, PAL.bone, null, sx < 0 ? 1 : 2);
    env.bx(sx < 0 ? -FE_X - 0.11 : FE_X - 0.01, 1.4, FW_Z, sx < 0 ? -FE_X + 0.01 : FE_X + 0.11, 1.74, 0, PAL.red, null, sx < 0 ? 1 : 2); }
  // the end wall: bone, glass windows (ice / haze mullions) over a crimson skirting, a red + yellow band
  const z = FW_Z;
  env.bx(-FE_X, 0, z - 0.2, FE_X, FE_TOP, z, PAL.bone, null, 16);
  env.bx(-FE_X, 0, z, FE_X, 0.25, z + 0.02, PAL.crimson, null, 16);
  for (let x = -FE_X + 0.5; x < FE_X - 0.5; x += 2.0) { env.bx(x, 0.4, z, x + 1.7, 1.25, z + 0.02, PAL.ice, null, 16); env.bx(x + 0.83, 0.4, z + 0.02, x + 0.87, 1.25, z + 0.03, PAL.haze, null, 16); }
  env.bx(-FE_X, 1.4, z, FE_X, 1.62, z + 0.02, PAL.red, null, 16); env.bx(-FE_X, 1.62, z, FE_X, 1.74, z + 0.02, PAL.yellow, null, 16);
  // THE SIGN: a big red board with a bone frame, "B.L.A.M." over "MART" in the bold font (lemon / yellow / amber rows,
  // a void drop shadow), centred on the aisle: you ride toward it all round and arrive under it
  const s = 0.13, L1 = R.bold('B.L.A.M.'), L2 = R.bold('MART'), gap = 3, Hs = (14 + gap) * s, W = Math.max(L1.w, L2.w) * s, yb = 2.3, zz = z + 0.06;
  const x0 = -W / 2, pad = 0.3;
  obj.bx(x0 - pad, yb - pad, zz - 0.06, -x0 + pad, yb + Hs + pad, zz, PAL.red, null, 16 | 8 | 4 | 1 | 2);
  for (const [a, b2, c, d] of [[x0 - pad - 0.08, yb - pad - 0.08, -x0 + pad + 0.08, yb - pad], [x0 - pad - 0.08, yb + Hs + pad, -x0 + pad + 0.08, yb + Hs + pad + 0.08],
    [x0 - pad - 0.08, yb - pad, x0 - pad, yb + Hs + pad], [-x0 + pad, yb - pad, -x0 + pad + 0.08, yb + Hs + pad]]) obj.bx(a, b2, zz - 0.07, c, d, zz + 0.02, PAL.bone, null, 16 | 8 | 4);
  const ROWC = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
  for (const [L, row] of [[L1, 0], [L2, 1]]) {
    const lx = -L.w * s / 2, ly = yb + (row ? 0 : 7 + gap) * s;
    for (const [px, py] of L.px) {
      const x = lx + px * s, y = ly + (6 - py) * s;
      glow.bx(x, y, zz, x + s, y + s, zz + 0.05, ROWC[py], null, 16 | 4 | 1 | 2 | 8);
      obj.bx(x + s * 0.4, y - s * 0.4, zz - 0.005, x + s * 1.4, y + s * 0.6, zz + 0.01, PAL.oxblood, null, 16);
    }
  }
  // the checkout lanes (lane 3 is ours: open, lit, the cashier duck)
  for (let k = -2; k <= 2; k++) buildStand(obj, glow, SO_X + k * LANE_W, SO_Z, k === 0, OUR_LANE + k);
}
const RZ = -1.5;                                                 // the register's spot on the counter (stand-local z)
// ---------- THE CART: wire basket (object class, unlit, baked), red plastic handle / kid seat / bumpers (toon), wheels ----------
function buildCartWires(v) {
  // round 3: thinner wire (0.011 -> 0.008) and SPARSE side walls (an upright every 0.63, one mid rail): the climbers on the
  // sides read clearly (they are drawn in front of the cart anyway)
  const w = 0.008, X = CHW, L = CHL, rail = (x0, y0, z0, x1, y1, z1, c) => v.bx(x0 - w, y0 - w, z0 - w, x1 + w, y1 + w, z1 + w, PAL[c]);
  for (const z of [-L, L]) { rail(-X, RIM, z, X, RIM, z, 'mist'); v.bx(-X, RIM - 0.02, z - 0.02, X, RIM + 0.02, z + 0.02, PAL.haze); }
  for (const x of [-X, X]) { rail(x, RIM, -L, x, RIM, L, 'mist'); v.bx(x - 0.02, RIM - 0.02, -L, x + 0.02, RIM + 0.02, L, PAL.haze); }
  for (let z = -L + 0.63; z < L - 0.2; z += 0.63) for (const x of [-X, X]) rail(x, BOT, z, x, RIM, z, 'steel');
  for (const y of [BOT + 0.28]) for (const x of [-X, X]) rail(x, y, -L, x, y, L, 'haze');
  for (let x = -X + 0.11; x < X - 0.05; x += 0.12) for (const z of [-L, L]) rail(x, BOT, z, x, RIM, z, 'steel');
  for (let y = BOT; y < RIM - 0.05; y += 0.14) for (const z of [-L, L]) rail(-X, y, z, X, y, z, 'haze');
  for (const x of [-X, X]) for (const z of [-L, L]) v.bx(x - 0.02, BOT, z - 0.02, x + 0.02, RIM, z + 0.02, PAL.haze);
  for (let x = -X; x <= X + 0.01; x += 0.16) rail(x, BOT, -L, x, BOT, L, 'steel');
  for (let z = -L; z <= L + 0.01; z += 0.16) rail(-X, BOT, z, X, BOT, z, 'steel');
  for (const x of [-X + 0.08, X - 0.08]) for (const z of [-L + 0.1, L - 0.06]) v.bx(x - 0.022, 0.12, z - 0.022, x + 0.022, BOT, z + 0.022, PAL.haze);
  for (const x of [-X + 0.08, X - 0.08]) v.bx(x - 0.025, 0.16, -L + 0.08, x + 0.025, 0.21, L - 0.04, PAL.haze);
  for (let z = -L + 0.2; z < L - 0.1; z += 0.14) v.bx(-X + 0.1, 0.2, z - w, X - 0.1, 0.22, z + w, PAL.steel);
}
// the cart's plastic + chrome trim: unlit baked boxes, drawn like the wires (no depth write, after the pile). Outline by
// draw order inside the one mesh: every part's void box (1 px bigger) first, then every coloured box over it.
function buildCartPlastic() {
  const X = CHW, L = CHL, parts = [], P2 = (x0, y0, z0, x1, y1, z1, c, o = 0.013) => parts.push([x0, y0, z0, x1, y1, z1, c, o]);
  for (const sx of [-1, 1]) { const x = sx * (X - 0.03); for (let k = 0; k <= 7; k++) { const q = k / 7, y = RIM - 0.01 - 0.17 * q, z = L + 0.03 + 0.22 * q; P2(x - 0.025, y - 0.025, z - 0.025, x + 0.025, y + 0.025, z + 0.025, 'haze', 0.008); } }
  P2(-X - 0.02, RIM - 0.23, L + 0.21, X + 0.02, RIM - 0.16, L + 0.29, 'red');
  P2(-X + 0.06, RIM - 0.165, L + 0.22, X - 0.06, RIM - 0.155, L + 0.26, 'coral', 0);
  const kz = L - 0.035, ky0 = RIM - 0.34, ky1 = RIM - 0.03, kx = 0.36;
  P2(-kx, ky1 - 0.05, kz - 0.025, kx, ky1, kz + 0.025, 'red'); P2(-kx, ky0, kz - 0.025, kx, ky0 + 0.05, kz + 0.025, 'red');
  for (const x of [-kx, -0.025, kx - 0.05]) P2(x, ky0, kz - 0.025, x + 0.05, ky1, kz + 0.025, 'red');
  P2(-0.05, ky1 - 0.02, kz + 0.025, 0.05, ky1 + 0.03, kz + 0.04, 'yellow', 0.008);
  for (const sx of [-1, 1]) P2(sx * X - 0.05, RIM - 0.08, -L - 0.05, sx * X + 0.05, RIM + 0.04, -L + 0.07, 'red');
  for (const sx of [-1, 1]) P2(sx * (X - 0.08) - 0.03, 0.0, L - 0.16, sx * (X - 0.08) + 0.03, 0.12, L + 0.0, 'void', 0);
  const v = new Vox(); v.shade = [0.82, 0.82, 1.0, 0.6, 0.92, 0.7];
  for (const [x0, y0, z0, x1, y1, z1, , o] of parts) if (o > 0) v.bx(x0 - o, y0 - o, z0 - o, x1 + o, y1 + o, z1 + o, PAL.void);
  for (const [x0, y0, z0, x1, y1, z1, c] of parts) v.bx(x0, y0, z0, x1, y1, z1, PAL[c]);
  return v.geo();
}
function casterGeo() {                                          // a front caster: fork + wheel (origin at the swivel)
  const g = new P.Geo(0.75);
  g.bx(-0.03, 0.06, -0.02, 0.03, 0.13, 0.02, 'haze', false);
  g.bx(-0.03, 0.0, -0.075, 0.03, 0.12, 0.035, 'void');
  g.bx(-0.034, 0.045, -0.035, 0.034, 0.075, -0.005, 'steel', false);
  return g.geometry();
}
// the junk heap under the visible pile (normalised height 0..1; scaled in y by the fill level)
function heapGeo() {
  const v = new Vox(); v.shade = [0.9, 0.9, 1.0, 0.6, 0.82, 0.7];
  const cols = ['tan', 'sand', 'chestnut', 'tan', 'walnut', 'sand', 'bone', 'amber', 'tan', 'steel'];
  for (let x = -0.7; x < 0.69; x += 0.14) for (let z = -CHL + 0.08; z < PILE_Z1 - 0.05; z += 0.14) {
    const hx = 1 - Math.pow(Math.abs(x + 0.07) / 0.78, 2), hz = 1 - Math.pow(Math.abs(z + 0.05) / 0.95, 2), top = clamp(0.35 + 0.65 * hx * hz, 0.25, 1);
    for (let k = 0; k < 2; k++) {
      const h = hash3(Math.round(x * 50), Math.round(z * 50), k), c = cols[Math.floor(h * cols.length)];
      const y0 = k ? top * 0.55 : 0, y1 = k ? top : top * 0.6 + h * 0.15;
      v.bx(x + 0.01, y0, z + 0.01, x + 0.13 + h * 0.03, y1, z + 0.12, PAL[c]);
    }
  }
  return v.geo();
}
const heapTop = (n, x, z) => {                                   // the heap's top surface (cart-local x, z) for n products in
  const f = Math.pow(Math.min(1, n / 30), 0.8), H = 0.03 + 0.6 * f;
  const hx = 1 - Math.pow(Math.abs(x + 0.07) / 0.78, 2), hz = 1 - Math.pow(Math.abs(z + 0.05) / 0.95, 2);
  return BOT + H * clamp(0.35 + 0.65 * hx * hz, 0.25, 1);
};
// the cashier duck: range.js's placeholder voxel duck, re-made with a green VISOR instead of the hat and a NAME TAG
const DS = 0.06;
function duckLists() {
  const M = new Map(), key = (i, j, k) => i + ',' + j + ',' + k, put = (i, j, k, c) => M.set(key(i, j, k), [i, j, k, PAL[c]]);
  for (let i = -5; i <= 5; i++) for (let j = -1; j <= 12; j++) for (let k = -4; k <= 4; k++) {
    const bx = i / 4.6, by = (j - 2.6) / 3.0, bz = k / 3.6, hx = (i - 0.3) / 2.6, hy = (j - 7.3) / 2.6, hz = (k - 0.4) / 2.5;
    if (hx * hx + hy * hy + hz * hz <= 1) put(i, j, k, 'yellow');
    else if (bx * bx + by * by + bz * bz <= 1) put(i, j, k, Math.abs(i) >= 4 && j >= 2 && j <= 4 ? 'amber' : j <= 0 ? 'amber' : 'yellow');
  }
  const front = (i, j) => { for (let k = 6; k >= -6; k--) if (M.has(key(i, j, k))) return k; return null; };
  for (const [i, j] of [[-1, 8], [2, 8]]) { const k = front(i, j); if (k != null) put(i, j, k, 'void'); }
  for (let i = -1; i <= 1; i++) for (const j of [6, 7]) { const k = front(i, j); if (k != null) { put(i, j, k + 1, 'orange'); if (j === 6) put(i, j, k + 2, 'orange'); } }
  for (let i = -3; i <= 0; i++) for (const j of [2, 3, 4]) { const k = front(i, j); if (k != null) put(i, j, k + 1, j === 4 ? 'red' : (j === 3 && (i === -2 || i === 0)) ? 'void' : 'bone'); }
  for (let i = -3; i <= 4; i++) for (let k = -3; k <= 4; k++) { const d = ((i - 0.3) / 2.7) ** 2 + ((k - 0.4) / 2.6) ** 2; if (d <= 1.25 && d >= 0.6) put(i, 9, k, 'green'); }
  for (let i = -2; i <= 3; i++) for (let k = 3; k <= 5; k++) put(i, 9, k, 'lime');
  for (const i of [-2, -1, 1, 2]) for (const k of [0, 1, 2]) put(i, -2, k, 'orange');
  return [...M.values()];
}
function scannerArmGeo() {                                      // the wing holding a handheld scanner (origin = the shoulder)
  const v = new Vox(); v.shade = [0.85, 0.85, 1, 0.6, 0.95, 0.7];
  v.bx(-0.06, -0.26, -0.05, 0.06, 0.02, 0.06, PAL.amber);
  v.bx(-0.04, -0.3, 0.0, 0.04, -0.22, 0.2, PAL.void); v.bx(-0.05, -0.3, 0.18, 0.05, -0.2, 0.24, PAL.slate);
  v.bx(-0.035, -0.28, 0.24, 0.035, -0.22, 0.245, PAL.red);
  return v.geo();
}

// ---------- the PILE as ONE merged mesh (rebuilt only when what lies in the cart changes) ----------
const PILE_ATTR = [['position', 3], ['normal', 3], ['cBase', 3], ['cLo', 3], ['cHi', 3], ['cSp', 3], ['aInfo', 4], ['aOff', 3], ['aLod', 4]];
function pileMesh(maxV, maxI) {
  const g = new THREE.BufferGeometry();
  for (const [n, k] of PILE_ATTR) { const a = new THREE.BufferAttribute(new Float32Array(maxV * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); }
  const ix = new THREE.BufferAttribute(new Uint32Array(maxI), 1); ix.setUsage(THREE.DynamicDrawUsage); g.setIndex(ix); g.setDrawRange(0, 0);
  const m = noRay(new THREE.Mesh(g, TOON)); m.frustumCulled = false; m.userData.sharedGeo = true; m.visible = false;
  return m;
}
const _n3 = new THREE.Matrix3(), _pv = new THREE.Vector3();
function pileWrite(mesh, list) {                                 // list: [[geometry, Matrix4, scale]...] -> one geometry
  const G = mesh.geometry, A = {}; for (const [n] of PILE_ATTR) A[n] = G.attributes[n];
  const out = G.index.array, cap = A.position.count;
  let vo = 0, io = 0;
  for (const [geo, m, sc] of list) {
    const n = geo.attributes.position.count; if (vo + n > cap || io + geo.index.count > out.length) break;
    _n3.setFromMatrix4(m);
    const sp = geo.attributes.position.array, sn = geo.attributes.normal.array, so = geo.attributes.aOff.array, si = geo.attributes.aInfo.array;
    const dp = A.position.array, dn = A.normal.array, dO = A.aOff.array, e = m.elements, f = _n3.elements;
    for (let i = 0; i < n; i++) {
      const x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2], o = (vo + i) * 3;
      dp[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; dp[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; dp[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = sn[i * 3], b = sn[i * 3 + 1], c = sn[i * 3 + 2];
      dn[o] = (f[0] * a + f[3] * b + f[6] * c) / sc; dn[o + 1] = (f[1] * a + f[4] * b + f[7] * c) / sc; dn[o + 2] = (f[2] * a + f[5] * b + f[8] * c) / sc;
      const u = so[i * 3], v = so[i * 3 + 1], w = so[i * 3 + 2];
      if (si[i * 4 + 1] > 0.5) { dO[o] = (f[0] * u + f[3] * v + f[6] * w) / sc; dO[o + 1] = (f[1] * u + f[4] * v + f[7] * w) / sc; dO[o + 2] = (f[2] * u + f[5] * v + f[8] * w) / sc; }
      else { dO[o] = u; dO[o + 1] = v; dO[o + 2] = w; }
    }
    for (const [nm, k] of PILE_ATTR) if (nm !== 'position' && nm !== 'normal' && nm !== 'aOff') A[nm].array.set(geo.attributes[nm].array, vo * k);
    const si2 = geo.index.array; for (let i = 0; i < si2.length; i++) out[io + i] = si2[i] + vo;
    vo += n; io += si2.length;
  }
  for (const [n] of PILE_ATTR) A[n].needsUpdate = true;
  G.index.needsUpdate = true; G.setDrawRange(0, io); mesh.visible = io > 0;
}

// ---------- round 3: ALL the live snacks on the shelves in ONE draw call ----------
// NSLOT fixed slots; a slot's vertex / index region holds one look's geometry (written only when the slot takes a new look,
// uploaded as a sub-range), its pose is two uniforms (x, y, z, yaw) + (scale x, y, z): the toon shader is the shared
// Props.mat with its vertex transform swapped for the slot's (so the look is identical; a free slot has scale 0).
// A product that finds no free slot draws its own mesh (fallback).
function batchMat() {
  const a = 'vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);', b = 'vC = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;', c = 'vec3 nor = normal, sn = position;';
  const vs0 = TOON.vertexShader; if (!vs0.includes(a) || !vs0.includes(b) || !vs0.includes(c)) return null;
  const vs = 'attribute float aSlot;\nuniform vec4 uSl[' + (NSLOT * 2) + '];\n' + vs0
    .replace(a, 'int si = int(aSlot + 0.5); vec4 sA = uSl[si * 2], sB = uSl[si * 2 + 1]; float cq = cos(sA.w), sq = sin(sA.w);\n  vec3 lp = position * sB.xyz;\n' +
      '  vec4 mvPosition = modelViewMatrix * vec4(cq * lp.x + sq * lp.z + sA.x, lp.y + sA.y, -sq * lp.x + cq * lp.z + sA.z, 1.0);')
    .replace(b, 'vC = (modelViewMatrix * vec4(sA.xyz, 1.0)).xyz;')
    .replace(c, 'vec3 nor = vec3(cq * normal.x + sq * normal.z, normal.y, -sq * normal.x + cq * normal.z), sn = nor;');
  const u = Object.assign({}, TOON.uniforms, { uSl: { value: Array.from({ length: NSLOT * 2 }, () => new THREE.Vector4(0, 0, 0, 0)) } });
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: TOON.fragmentShader, fog: TOON.fog });
}
function makeBatch(A) {
  if (NSLOT < 8) return null;                                    // a tiny uniform budget: every product draws its own mesh
  const mat = batchMat(); if (!mat) return null;
  const maxV = Math.max(...A.prod.map(p => p.verts)), maxI = Math.max(...A.prod.map(p => p.idx)), N = NSLOT, g = new THREE.BufferGeometry();
  for (const [n, k] of PILE_ATTR) { const at = new THREE.BufferAttribute(new Float32Array(N * maxV * k), k); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, at); }
  const sl = new Float32Array(N * maxV); for (let s = 0; s < N; s++) sl.fill(s, s * maxV, (s + 1) * maxV); g.setAttribute('aSlot', new THREE.BufferAttribute(sl, 1));
  const ix = new THREE.BufferAttribute(new Uint32Array(N * maxI), 1); ix.setUsage(THREE.DynamicDrawUsage);
  for (let s = 0; s < N; s++) ix.array.fill(s * maxV, s * maxI, (s + 1) * maxI);
  g.setIndex(ix);
  const mesh = noRay(new THREE.Mesh(g, mat)); mesh.frustumCulled = false; mesh.userData.sharedGeo = true;
  return { mesh, maxV, maxI, used: new Array(N).fill(null), look: new Array(N).fill(-1), u: mat.uniforms.uSl.value, mat, lo: 0, hi: -1, writes: 0 };
}
function slotDirty(Bt, s) {
  const G = Bt.mesh.geometry, pos = G.attributes.position;
  if (pos.updateRange.count === -1 || Bt.hi < 0) { Bt.lo = s; Bt.hi = s; } else { Bt.lo = Math.min(Bt.lo, s); Bt.hi = Math.max(Bt.hi, s); }
  for (const [n, k] of PILE_ATTR) { const at = G.attributes[n]; at.updateRange.offset = Bt.lo * Bt.maxV * k; at.updateRange.count = (Bt.hi - Bt.lo + 1) * Bt.maxV * k; at.needsUpdate = true; }
  G.index.updateRange.offset = Bt.lo * Bt.maxI; G.index.updateRange.count = (Bt.hi - Bt.lo + 1) * Bt.maxI; G.index.needsUpdate = true;
}
function slotClaim(owner, pk) {
  const Bt = PARTS && PARTS.batch; if (!Bt) return -1;
  let s = -1; for (let i = 0; i < NSLOT; i++) if (!Bt.used[i]) { if (Bt.look[i] === pk) { s = i; break; } if (s < 0) s = i; }
  if (s < 0) return -1;
  Bt.used[s] = owner;
  if (Bt.look[s] !== pk) {                                       // write the look into the slot's region
    const src = buildArt().prod[pk].geo, G = Bt.mesh.geometry, n = src.attributes.position.count;
    for (const [nm, k] of PILE_ATTR) G.attributes[nm].array.set(src.attributes[nm].array.subarray(0, n * k), s * Bt.maxV * k);
    const si = src.index.array, di = G.index.array, o = s * Bt.maxI, base = s * Bt.maxV;
    for (let i = 0; i < si.length; i++) di[o + i] = si[i] + base;
    di.fill(base, o + si.length, o + Bt.maxI);
    Bt.look[s] = pk; Bt.writes++; slotDirty(Bt, s);
  }
  Bt.u[s * 2 + 1].set(0, 0, 0, 0); Bt.mat.uniformsNeedUpdate = true;
  return s;
}
function slotPose(s, x, y, z, yaw, sx, sy, sz) { const Bt = PARTS.batch; Bt.u[s * 2].set(x, y, z, yaw); Bt.u[s * 2 + 1].set(sx, sy, sz, 0); Bt.mat.uniformsNeedUpdate = true; }
function slotFree(owner) {
  const Bt = PARTS && PARTS.batch; if (!Bt || !owner || owner.slot < 0) return;
  const s = owner.slot; owner.slot = -1;
  if (Bt.used[s] === owner) { Bt.used[s] = null; Bt.u[s * 2 + 1].set(0, 0, 0, 0); Bt.mat.uniformsNeedUpdate = true; }
}
function slotsReset() { const Bt = PARTS && PARTS.batch; if (!Bt) return; for (let s = 0; s < NSLOT; s++) { if (Bt.used[s]) Bt.used[s].slot = -1; Bt.used[s] = null; Bt.u[s * 2 + 1].set(0, 0, 0, 0); } Bt.mat.uniformsNeedUpdate = true; }
// ---------- round 3: rope / zipline lines (one LineSegments, ROPE_N segments, drawn over the set, under the climbers) ----------
const _rc = new THREE.Color();
function ropeSet(i, a, b, col) {                                 // a rope = 2 segments: the line + a darker one 1 px over (2 px thick)
  const L = PARTS && PARTS.ropes; if (!L || i < 0) return;
  const p = L.geometry.attributes.position, c = L.geometry.attributes.color, o = i * 4;
  if (!a) { for (let k = 0; k < 4; k++) p.setXYZ(o + k, 0, -9, 0); }
  else {
    const px = (x, y, z) => 1.05 / scr(x, y, z)[2];             // one game px in world units at that depth
    p.setXYZ(o, a[0], a[1], a[2]); p.setXYZ(o + 1, b[0], b[1], b[2]);
    p.setXYZ(o + 2, a[0] + px(a[0], a[1], a[2]), a[1], a[2]); p.setXYZ(o + 3, b[0] + px(b[0], b[1], b[2]), b[1], b[2]);
    _rc.set(col); for (let k = 0; k < 2; k++) c.setXYZ(o + k, _rc.r, _rc.g, _rc.b);
    _rc.multiplyScalar(0.6); for (let k = 2; k < 4; k++) c.setXYZ(o + k, _rc.r, _rc.g, _rc.b);
    c.needsUpdate = true;
  }
  p.needsUpdate = true;
}
const ROPES = new Array(ROPE_N).fill(null);
function ropeClaim(owner) { const i = ROPES.indexOf(null); if (i >= 0) ROPES[i] = owner; return i; }
function ropeFree(owner) { const i = owner ? owner.rope : -1; if (i >= 0 && ROPES[i] === owner) { ROPES[i] = null; ropeSet(i, null); } if (owner) owner.rope = -1; }

let PARTS = null;
function buildEnv() {
  const A = buildArt();
  const group = new THREE.Group();
  // THE WORLD (the end frame, moved as one: during play it sits at the aisle end's z; in the finale it is the inverse of the
  // cart's ride out of the aisle). The rolling aisle is its child (shifted D mod PERIOD in the world).
  const world = new THREE.Group(), aisle = new THREE.Group();
  const env = new Vox(), glow = new Vox(), obj = new Vox();
  env.bake = bakeAisle; env.shade = [0.92, 0.92, 1.0, 0.62, 0.8, 0.7]; obj.shade = [0.85, 0.85, 1, 0.55, 0.9, 0.7];
  buildAisle(env, glow, obj);
  const envMesh = env.mesh(MA_ENV), glowMesh = noRay(glow.mesh(MA_GLOW)), objMesh = obj.mesh(MA_OBJ);
  for (const m of [envMesh, glowMesh, objMesh]) { m.frustumCulled = false; aisle.add(m); }
  glowMesh.onBeforeRender = envStep; glowMesh.renderOrder = -10;   // opaque + first: moves the parts below before they are drawn
  // the front of the store (static in the end frame)
  const fe = new Vox(), fg = new Vox(), fo = new Vox(); fe.shade = [0.9, 0.9, 1, 0.6, 0.92, 0.7]; fo.shade = [0.9, 0.9, 1, 0.6, 1, 0.7];
  buildFar(fe, fg, fo);
  const farEnv = fe.mesh(M_ENV), farGlow = noRay(fg.mesh(M_GLOW)), farObj = fo.mesh(M_OBJ);
  for (const m of [farEnv, farGlow, farObj]) m.frustumCulled = false;
  // the cashier duck at our register (always there; animated in the finale)
  const DL = duckLists(), duck = new THREE.Group(), dBody = noRay(new Vox().vox(DL, DS, -0.5 * DS, -6 * DS, 0).mesh(MAT.obj));
  duck.add(dBody);
  const arm = noRay(new THREE.Mesh(scannerArmGeo(), MAT.obj)); arm.position.set(0.3, -0.05, 0.05); duck.add(arm);
  duck.scale.setScalar(2.0); duck.position.set(SO_X - 0.38, 1.0, SO_Z + RZ + 0.1);
  world.add(aisle, farEnv, farGlow, farObj, duck);
  // the cart (rides with the camera)
  const cart = new THREE.Group(); cart.position.set(CX, 0, CZ);
  const cw = new Vox(); cw.shade = [0.9, 0.9, 1, 0.65, 1, 0.75];
  buildCartWires(cw);
  const wires = cw.mesh(M_WIRE), plastic = shared(buildCartPlastic(), M_WIRE); wires.renderOrder = 5; plastic.renderOrder = 5.5;
  const cg = casterGeo(), wl = shared(cg, TOON), wr = shared(cg, TOON);
  wl.position.set(-CHW + 0.08, 0, -CHL + 0.1); wr.position.set(CHW - 0.08, 0, -CHL + 0.1);
  const heap = noRay(shared(heapGeo(), MAT.obj)); heap.position.y = BOT; heap.visible = false;
  // the pile: ONE merged mesh (the last 24 products; round 3: the veggies in the cart are live targets, not pile items)
  // + the scanned item's flash copy
  const maxPV = Math.max(...A.prod.map(p => p.verts)), maxPI = Math.max(...A.prod.map(p => p.idx));
  const pile = pileMesh(PILE_N * maxPV, PILE_N * maxPI);
  const flash = noRay(new THREE.Mesh(A.prod[0].geo, TOON)); flash.userData.sharedGeo = true; flash.visible = false; flash.frustumCulled = false;
  cart.add(wires, plastic, wl, wr, heap, pile, flash);
  const beam = noRay(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M_BEAM)); beam.visible = false; beam.frustumCulled = false; beam.renderOrder = 7;
  group.add(world, cart, beam);
  // round 3: the live snacks' batch (one draw call), the rope / zipline lines, the thrown-out snacks (drawn near)
  const batch = makeBatch(A); if (batch) group.add(batch.mesh);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE_N * 12).fill(-9), 3)); rg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ROPE_N * 12), 3));
  rg.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const ropes = noRay(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ vertexColors: true, fog: false, depthTest: false, depthWrite: false, transparent: true, blending: THREE.NoBlending })));
  ropes.frustumCulled = false; ropes.renderOrder = 5.9; ropes.userData.sharedGeo = true; group.add(ropes);
  const toss = []; for (let i = 0; i < TOSS_N; i++) { const m = noRay(new THREE.Mesh(A.prod[0].geo, TOON)); m.userData.sharedGeo = true; m.visible = false; m.frustumCulled = false; toss.push(m); group.add(m); }
  // misses: the set's only shootable is a proxy that hits the set's meshes (the tracer / ricochet land there); the engine's
  // square bullet hole is wiped by a microtask (the shelves roll: a hole would hang in the air)
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.userData.sharedGeo = true; proxy.frustumCulled = false;
  const hitList = [envMesh, objMesh, farEnv, farObj, wires];
  proxy.raycast = (rc, out) => {
    for (const m of hitList) {
      const n0 = out.length; THREE.Mesh.prototype.raycast.call(m, rc, out);
      if (m === envMesh || m === objMesh) for (let i = out.length - 1; i >= n0; i--) { _pv.copy(out[i].point); m.worldToLocal(_pv); if (_pv.z + AZ.value < 0) out.splice(i, 1); }
    }
    if (B.G && B.G.run && B.G.run.stage === ID) Promise.resolve().then(() => T.clearDecals());
  };
  group.add(proxy);
  PARTS = { world, aisle, cart, wl, wr, heap, pile, flash, duck, arm, beam, envMesh, pileSig: '', batch, ropes, toss, jolt: { x: 0, y: 0, rx: 0, rz: 0, pile: 0 } };
  group.userData.shootables = [proxy];
  return group;
}

// =========================================================================================
// THE AISLE CLOCK + THE RIDE OUT. D(t) = v t (the shelves' displacement toward you). The aisle end creeps from E_Z0 to
// E_Z1 over the director's stream (aisleEnd). In the finale (ft = the last item) the cart rides out along a path in the end
// frame: straight past the end panels, an S-curve into lane 3, stopped at the register (s(f): a cubic Hermite from speed v
// to rest over FIN_RIDE). All pure in the stage clock + the finale time.
// =========================================================================================
const FIN = { run: null, t: -1 };
const DIRS = new WeakMap();
function dirOf(run) {
  if (!run || run.stage !== ID || !run.timeline) return null;
  let d = DIRS.get(run.timeline); if (d) return d;
  d = run.timeline.find(s => s.kind === 'aisle') || null; if (d) DIRS.set(run.timeline, d); return d;
}
const aisleEnd = (t, last) => lerp(E_Z0, E_Z1, clamp(t / Math.max(1, last), 0, 1));
const S_N = 64, S_TAB = (() => { const tab = [0]; let px = 0, pz = Z_TURN, L = 0;
  for (let i = 1; i <= S_N; i++) { const u = i / S_N, x = XL * (3 * u * u - 2 * u * u * u), z = Z_TURN - (Z_TURN - Z_STOP) * u; L += Math.hypot(x - px, z - pz); tab.push(L); px = x; pz = z; }
  return tab; })();
const S_LEN = S_TAB[S_N];
function rigAt(s, zc0, o) {                                       // the camera point (x, z) + heading psi in the end frame, s along the path
  const LA = zc0 - Z_TURN;
  if (s <= LA) { o.x = 0; o.z = zc0 - s; o.psi = 0; return o; }
  const q = Math.min(s - LA, S_LEN); let i = 1; while (i < S_N && S_TAB[i] < q) i++;
  const u = clamp((i - 1 + (q - S_TAB[i - 1]) / Math.max(1e-6, S_TAB[i] - S_TAB[i - 1])) / S_N, 0, 1);
  o.x = XL * (3 * u * u - 2 * u * u * u); o.z = Z_TURN - (Z_TURN - Z_STOP) * u; o.psi = Math.atan2(-XL * 6 * u * (1 - u), Z_TURN - Z_STOP);
  return o;
}
// the set's pose at stage time t: the end frame's world transform (x, z, psi of the camera in it) + the aisle offset in it
function setPose(dir, t, ft, o) {
  if (!dir) { o.ex = 0; o.ez = 5 - E_Z0; o.psi = 0; o.az = ((t * 2.2) % PERIOD) - E_Z0; o.f = -1; return o; }
  const v = dir.v, Dm = D => ((D % PERIOD) + PERIOD) % PERIOD;
  if (ft == null || ft < 0 || t <= ft) { const zE = aisleEnd(t, dir.last); o.ex = 0; o.ez = 5 - zE; o.psi = 0; o.az = Dm(v * t) - zE; o.f = -1; return o; }
  const zE = aisleEnd(ft, dir.last), zc0 = 5 - zE, S = zc0 - Z_TURN + S_LEN, f = Math.min(1, (t - ft) / FIN_RIDE);
  const s = (f * f * f - 2 * f * f + f) * v * FIN_RIDE + (-2 * f * f * f + 3 * f * f) * S;
  rigAt(s, zc0, o); o.ex = o.x; o.ez = o.z; o.az = Dm(v * ft) - zE; o.f = t - ft;
  return o;
}
const finT = run => (FIN.run === run && FIN.t >= 0 ? FIN.t : -1);
const _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _sp = {};
function envStep() {
  if (!PARTS) return;
  const run = B.G && B.G.run, dir = dirOf(run), now = performance.now() / 1000;
  if (run !== PILE.run) { PILE.run = run; clearPile(); }
  const t = dir ? run.t : now * slowK(), ft = dir ? finT(run) : -1, sp = setPose(dir, t, ft, _sp);
  // the world = the inverse of the camera's pose in the end frame (camera at world (0, 1.9, 5))
  const W = PARTS.world, c = Math.cos(-sp.psi), s = Math.sin(-sp.psi);
  W.rotation.set(0, -sp.psi, 0); W.position.set(-(sp.ex * c + sp.ez * s), 0, 5 - (-sp.ex * s + sp.ez * c));
  PARTS.aisle.position.z = sp.az; AZ.value = sp.az;
  // the front casters wobble (shimmy, faster at speed; settle when the cart stops)
  const moving = !(sp.f >= 0 && sp.f > FIN_RIDE), spd = dir ? dir.v : 2.2, w = moving ? 0.22 + 0.04 * spd : 0.02;
  PARTS.wl.rotation.y = w * Math.sin(t * (7 + spd) + 0.3) + 0.1 * Math.sin(t * 2.3);
  PARTS.wr.rotation.y = w * Math.sin(t * (7.6 + spd) + 1.9) - 0.1 * Math.sin(t * 1.9);
  // round 3: the GRASP JOLTS (the director sums them, pure in the stage clock): the cart mesh shakes, the pile jiggles
  const J = PARTS.jolt, jon = dir && run.state !== 'end';
  PARTS.cart.position.set(CX + (jon ? J.x : 0), jon ? J.y : 0, CZ); PARTS.cart.rotation.set(jon ? J.rx : 0, 0, jon ? J.rz : 0);
  PARTS.pile.position.y = jon ? J.pile : 0;
  // the cashier: idles at the register; waves while you roll in, scans, hops when the receipt prints
  const f = sp.f, scan = f - SCAN_T, wave = f > FIN_RIDE * 0.5 && f < SCAN_T;
  PARTS.duck.rotation.y = (f >= 0 ? 0.95 : 0.5) + (wave ? 0.15 * Math.sin(f * 14) : 0.05 * Math.sin(t * 1.3));
  PARTS.duck.position.y = 1.0 + (f > RCPT_T + 0.3 ? 0.06 * Math.abs(Math.sin(f * 9)) : 0);
  PARTS.arm.rotation.x = f >= 0 && scan > 0 && scan < SCAN_N * SCAN_DT + 0.2 ? -1.1 + 0.25 * Math.sin(scan * 30) : wave ? -2.2 + 0.4 * Math.sin(f * 16) : -0.2;
  W.updateMatrixWorld(true); PARTS.wl.updateMatrixWorld(true); PARTS.wr.updateMatrixWorld(true);
  const bi = f >= 0 && scan >= 0 ? Math.floor(scan / SCAN_DT) : -1, on = bi >= 0 && bi < SCAN_N && (scan - bi * SCAN_DT) < 0.1;
  PARTS.beam.visible = on;
  if (on) {                                                   // the scanner's red beam to the beeped item in the pile
    _v3.set(0, -0.25, 0.245).applyMatrix4(PARTS.arm.matrixWorld);
    const q = scanPoint(bi, _v4); const L = _v3.distanceTo(q);
    PARTS.beam.position.copy(_v3).lerp(q, 0.5); PARTS.beam.lookAt(q); PARTS.beam.scale.set(0.055, 0.055, L); PARTS.beam.updateMatrixWorld(true);
  }
}
const SCAN_PTS = [[-0.3, -0.5], [0.25, -0.35], [-0.05, -0.15], [0.4, -0.6], [-0.45, -0.25], [0.1, -0.7], [0.3, 0.05], [-0.2, 0.1]];
function scanPoint(i, o) { const p = SCAN_PTS[i % SCAN_PTS.length]; return o.set(CX + p[0], heapTop(PILE.nProd, p[0], p[1]) + 0.32, CZ + p[1]); }

// =========================================================================================
// THE CART'S CONTENTS (round 3). cartState(run, t): the shot products in the cart (by the SHARED hit time + the flight),
// the veggies that got in, their THROWS (each takes the snack that landed last; none in the cart: it finds nothing) and
// each player's HITS = their snacks still in the cart. A pure function of the timeline, run.taken and the shared hit times
// points() records (versus-safe), memoised per (run, t, taken count). The pile, the HITS, the thrown snacks read it.
// =========================================================================================
const HIT = new WeakMap();
const PILE = { nProd: 0, n: 0, run: null };
const hitT = s => (HIT.has(s) ? HIT.get(s) : s.t0);
const VEGL = new WeakMap();
function vegsOf(run) { let l = VEGL.get(run.timeline); if (!l) { l = run.timeline.filter(s => s.kind === 'veg'); VEGL.set(run.timeline, l); } return l; }
// a veggie in the cart throws at land + th0, then every thd, while it is in the cart and the stream runs
function throwTimes(s, shot, last, upto, out) {
  const L = s.t0 + s.land, end = Math.min(shot, last, upto);
  for (let k = 0; k < 400; k++) { const tt = +(L + s.th0 + k * s.thd).toFixed(4); if (tt >= end) break; out.push([tt, s.id]); }
}
const CS = { run: null, t: NaN, n: -1, out: null };
function cartState(run, t) {
  if (CS.out && CS.run === run && CS.t === t && CS.n === run.taken.size) return CS.out;
  const tl = run.timeline, dir = dirOf(run), last = dir ? dir.last : Infinity, prods = [], throws = [], inCart = [];
  for (const [id, by] of run.taken) { if (by < 0) continue; const s = tl[id]; if (s && s.kind === 'prod') prods.push([hitT(s) + FLY, id, by]); }
  prods.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const s of vegsOf(run)) {
    const L = s.t0 + s.land; if (L > last) continue;
    const shot = run.taken.has(s.id) ? hitT(s) : Infinity;
    if (shot < L) continue;                                         // shot before it got in
    if (L <= t && shot > t) inCart.push(s.id);
    throwTimes(s, shot, last, t + LOOK, throws);
  }
  throws.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const toss = [], gone = new Map(), stack = []; let qi = 0;
  for (const [tt, vid] of throws) {
    while (qi < prods.length && prods[qi][0] <= tt - THROW_UP) stack.push(prods[qi++]);   // in the cart when the wind-up starts
    const p = stack.pop(); toss.push([tt, vid, p ? p[1] : -1]); if (p) gone.set(p[1], tt);
  }
  const hits = run.players.map(() => 0); let out = 0;
  for (const p of prods) { const g = gone.get(p[1]); if (g != null && g <= t) out++; else hits[p[2]]++; }
  CS.run = run; CS.t = t; CS.n = run.taken.size;
  return (CS.out = { prods, toss, gone, hits, inCart, out, last });
}
// the products lying in the cart now (land order; a snack being wound up for a throw has left the pile)
function pileList(run, t) {
  const cs = cartState(run, t), out = [];
  for (const p of cs.prods) { if (p[0] > t) break; const g = cs.gone.get(p[1]); if (g != null && g - THROW_UP <= t) continue; out.push(p); }
  return out;
}
function prodSlot(k, n, o) {                                     // the k-th product in (n in the cart) -> cart-local pose
  const slot = k % PILE_N, col = slot % 6, row = Math.floor(slot / 6) % 4, h = q => hash3(k, slot, q);
  const order = [0, 2, 1, 3][row];                             // the front rows fill first (they show best over the kid seat)
  const x = -0.6 + col * 0.24 + (h(1) - 0.5) * 0.08, z = -CHL + 0.22 + order * 0.42 + (h(2) - 0.5) * 0.1;
  o.x = x; o.z = z; o.y = heapTop(n, x, z) - 0.02 + (k >= PILE_N ? 0.03 : 0);
  o.ry = (h(3) - 0.5) * 1.6; o.rx = -0.35 - h(4) * 0.6; o.rz = (h(5) - 0.5) * 0.9;
  return o;
}
// where a veggie in the cart stands (on the heap, its spot by its index among the round's climbers)
const VSLOT = [[-0.32, -0.42], [0.3, -0.2], [-0.04, 0.08], [-0.5, 0.02], [0.44, -0.62], [0.06, -0.72]];
function cartSpot(sp, n, o) { const p = VSLOT[sp.cs % VSLOT.length]; o.cx = CX + p[0]; o.cz = CZ + p[1]; o.cy = heapTop(n, p[0], p[1]) + 0.01; o.dx = p[0] >= 0 ? 1 : -1; return o; }
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _sl = {};
function updatePile(run, t, flash) {
  if (!PARTS) return;
  const A = buildArt(), landed = pileList(run, t), n = landed.length, tl = run.timeline;
  PILE.nProd = n; PILE.n = n; PILE.run = run;
  const k0 = Math.max(0, n - PILE_N);
  let sig = n + '|'; for (let k = k0; k < n; k++) sig += tl[landed[k][1]].pk + ',';
  if (sig !== PARTS.pileSig) {
    PARTS.pileSig = sig;
    const list = [];
    for (let k = k0; k < n; k++) {
      const s = tl[landed[k][1]], a = A.prod[s.pk]; if (!a) continue;
      prodSlot(k, n, _sl); const sc = a.fit * PILE_SC;
      list.push([a.geo, new THREE.Matrix4().compose(_p.set(_sl.x, _sl.y, _sl.z), _q.setFromEuler(_e.set(_sl.rx, _sl.ry, _sl.rz)), _s.setScalar(sc)), sc]);
    }
    pileWrite(PARTS.pile, list);
  }
  // the scanned item pops: a bigger copy over its pile slot
  const F = PARTS.flash;
  if (flash && flash.k >= k0 && flash.k < n) {
    const s = tl[landed[flash.k][1]], a = A.prod[s.pk];
    prodSlot(flash.k, n, _sl); F.geometry = a.geo; F.position.set(_sl.x, _sl.y, _sl.z); F.rotation.set(_sl.rx, _sl.ry, _sl.rz);
    F.scale.setScalar(a.fit * PILE_SC * (1 + 0.35 * flash.a)); F.visible = true;
  } else F.visible = false;
  const f = Math.pow(Math.min(1, n / 30), 0.8);
  PARTS.heap.visible = n > 0; PARTS.heap.scale.y = 0.03 + 0.6 * f;
}
function clearPile() {
  if (!PARTS) return;
  PARTS.pile.visible = false; PARTS.pile.geometry.setDrawRange(0, 0); PARTS.pileSig = ''; PARTS.flash.visible = false;
  PARTS.heap.visible = false; PILE.nProd = 0; PILE.n = 0;
  for (const m of PARTS.toss) m.visible = false;
  const J = PARTS.jolt; J.x = J.y = J.rx = J.rz = J.pile = 0;
}

// =========================================================================================
// TARGETS
// =========================================================================================
const HIT_PX = { mouse: 5.5, touch: 8 };
const _hp = new THREE.Vector3(), _cp = new THREE.Vector3();
// a screen-space box hit test round a target's centre (half sizes hw / hh world units, never smaller than HIT_PX); the
// reported distance is the view depth, so the nearest thing on the ray wins
function boxRaycast(rc, out) {
  const tg = this.userData.target; if (!tg || !tg.alive || !tg.shootable) return;
  this.updateWorldMatrix(true, false); this.getWorldPosition(_hp);
  const d = _hp.distanceTo(rc.ray.origin), perPx = 2 * d * R.TAN_H / R.RH, mn = (B.Input && B.Input.touch ? HIT_PX.touch : HIT_PX.mouse) * perPx;
  rc.ray.closestPointToPoint(_hp, _cp);
  const dx = _cp.x - _hp.x, dy = _cp.y - _hp.y, dz = _cp.z - _hp.z, ox = dx, oy = dy * PCS + dz * PSN;
  const W = Math.max(tg.hw * tg.sc, mn), H = Math.max(tg.hh * tg.sc, mn);
  if (Math.abs(ox) > W || Math.abs(oy) > H) return;
  out.push({ distance: d, point: _cp.clone(), object: this });
}
const PROXY_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01), PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
function proxyFor(tg, parent) { const m = new THREE.Mesh(PROXY_GEO, PROXY_MAT); m.userData.sharedGeo = true; m.userData.target = tg; m.raycast = boxRaycast; parent.add(m); return m; }

// ---------- a product sitting on its shelf ----------
// pose (pure in lt): z = Z0 + v lt on its track (side, level), its base ON the board, faced to you and turning +-20 deg
// (a display turntable), bobbing a little (never below the board); a pop-in at the far end; shootable from PROD_RA to the
// end of its ride (span). Shot: it pops off the shelf and flies into the cart. Round 3: drawn by the shelf BATCH (one draw
// call for every live snack: its slot takes the pose); its own mesh only shows in flight (or when no slot is free).
class Product extends T.Target {
  constructor(sp, run) {
    super('target');
    this.sp = sp; this.run = run; this.flyT = -1; this.lastT = sp.t0; this.slot = -1;
    const A = buildArt().prod[sp.pk];
    this.A = A; this.hw = A.hw; this.hh = A.hh; this.sc = 1;
    this.body = new THREE.Group(); this.group.add(this.body);
    this.mesh = shared(A.geo, TOON); this.mesh.scale.setScalar(A.fit); this.body.add(this.mesh);
    this.mesh.userData.target = this;
    this.proxy = proxyFor(this, this.body); this.proxy.position.y = A.cy;
    this.ph = hash1(sp.id * 31 + 7) * 6.283;
    this.group.visible = false;
  }
  meshes() { return [this.proxy]; }
  pos(lt, o) { const sp = this.sp; o.x = sp.side * XP; o.y = LEV[sp.lv]; o.z = Z0 + sp.v * lt; return o; }
  update(lt, run) {
    const sp = this.sp, t = sp.t0 + lt; this.run = run; this.lastT = t;
    if (this.flyT >= 0) return this.updateFly(t);
    const p = this.pos(lt, _sl);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.set(0, faceCam(p.x, p.z) + YAW_A * Math.sin(lt * YAW_W + this.ph), 0);
    const pop = lt < POP_T ? E.outBack(clamp(lt / POP_T, 0, 1)) : 1;
    this.sc = Math.max(0.01, pop); this.body.scale.set(this.sc, Math.max(0.01, Math.min(1, pop)), this.sc);
    this.body.position.y = BOB * (0.5 - 0.5 * Math.cos(lt * 3.3 + this.ph));
    this.group.visible = lt < sp.gone;
    this.shootable = lt >= sp.ra && lt < sp.ra + sp.span;
    if (this.slot < 0 && this.group.visible) this.slot = slotClaim(this, sp.pk);
    this.mesh.visible = this.slot < 0;
    if (this.slot >= 0) {
      const g = this.group.position, f = this.group.visible ? this.A.fit : 0, bs = this.body.scale;
      slotPose(this.slot, g.x, g.y + this.body.position.y, g.z, this.group.rotation.y, bs.x * f, bs.y * f, bs.z * f);
    }
    return lt >= sp.gone;
  }
  // shot (applyHit / a versus optimistic hit): a pop and a few sparks; it flies on an arc into its pile slot in the cart
  shatter(point) {
    if (this.flyT >= 0) return;
    slotFree(this); this.mesh.visible = true;
    this.alive = false; this.shootable = false; this.flyT = this.lastT; this.deadT = this.lastT;
    this.group.updateMatrixWorld(true); this.from = this.group.position.clone(); this.fromRy = this.group.rotation.y;
    const c = this.mesh.getWorldPosition(new THREE.Vector3()); c.y += this.hh;
    T.sparks(c, 7, ['lemon', 'yellow', 'bone', 'orange'], 1.3, 0.035);
    const px = scr(c.x, c.y, c.z); B.SFX.play('shelfPop', { u: uOfPx(px[0]) });
  }
  updateFly(t) {
    const q = (t - this.flyT) / FLY, run = this.run;
    if (q >= 1) { this.group.visible = false; if (!this.clunked) { this.clunked = true; if (q < 1.25) B.SFX.play('cartClunk', { u: 0.48 }); } return true; }
    // the destination: on top of the pile (the next slot)
    const n = pileList(run, t).length;
    prodSlot(n, n + 1, _sl);
    const tx = CX + _sl.x, ty = _sl.y, tz = CZ + _sl.z, e = E.inOut(q), F = this.from;
    const h = 0.55 + 0.12 * Math.hypot(tx - F.x, tz - F.z);
    this.group.position.set(lerp(F.x, tx, e), lerp(F.y, ty, e) + h * 4 * q * (1 - q), lerp(F.z, tz, e));
    this.group.rotation.set(-q * Math.PI * 2.2, lerp(this.fromRy, _sl.ry, q), q * 1.3);
    this.body.position.y = 0; this.body.scale.setScalar(lerp(1, PILE_SC, e));
    this.group.visible = true;
    return false;
  }
  dispose() { slotFree(this); super.dispose(); }
}
// ---------- a veggie climbing the cart (round 3) ----------
// spots: 'L' / 'R' = the OUTER face of the left / right side (cart-local z = sp.zl, the front half of the side), 'FL' /
// 'FR' = a front corner, 'F' = the front face left or right of its middle. Patterns (sp.pat): 0 LADDER / 1 SPRINTER /
// 2 PEEKER: HOP onto the cart (from below / outside), CLIMB by the grasp keyframes sp.g ([lt, climb fraction, 0 grasp | 1
// duck, pull s] x n), HANG at the rim (legs kicking), MANTLE onto the rim; 3 ROPE: SWING in from off the screen edge on a
// rope (a pendulum from a pivot above and outside the landing spot), land on the rim, a beat (RIM_PAUSE); 4 ZIPLINE: SLIDE
// down a line from the top shelf to the rim, a beat. Then (all) DROP into the cart (DROP_T) and stand on the pile, THROWING
// SNACKS OUT until shot. Shootable from 0.08 s to the drop and in the cart (until the stream ends). DRAWN NEAR (scaled KN
// toward the camera: same projection, nearer than the whole cart), so nothing of the cart ever covers one.
function vegSpot(sp, o) {
  const s = sp.side;
  o.ho = 0.4;                                                    // the hop's outward start (the right side: mostly from below, the gun is there)
  if (sp.face === 'L' || sp.face === 'R') { o.x = CX + (s < 0 ? -SIDE_XL : SIDE_XR); o.z = CZ + sp.zl; o.ox = s; o.oz = 0; o.rx = CX + s * (CHW - 0.02); o.rz = o.z; if (s > 0) o.ho = 0.12; }
  else if (sp.face === 'F') { o.x = CX + s * 0.3; o.z = CZ - CHL - 0.14; o.ox = 0.3 * s; o.oz = -1; o.rx = o.x; o.rz = CZ - CHL + 0.04; }
  else { o.x = CX + s * (CHW + 0.04); o.z = CZ - CHL - 0.14; o.ox = 0.6 * s; o.oz = -0.8; o.rx = CX + s * (CHW - 0.06); o.rz = CZ - CHL + 0.04; }
  return o;
}
const _cl = { y: 0, k: -1, duck: false };
function climbAt(sp, lt) {                                       // the climb fraction (0 start .. 1 hands at the rim) at lt
  const g = sp.g; let y = 0, k = -1, duck = false;
  for (let i = 0; i < g.length; i += 4) {
    if (lt < g[i]) break;
    const q = clamp((lt - g[i]) / g[i + 3], 0, 1), y0 = i ? g[i - 3] : 0;
    y = lerp(y0, g[i + 1], g[i + 2] ? q * q : E.outCubic(q)); k = i / 4; duck = g[i + 2] === 1 && q < 1;
  }
  _cl.y = y; _cl.k = k; _cl.duck = duck; return _cl;
}
const handOf = vk => (ART ? ART.veg[vk].sy + 0.28 : 0.75);       // feet -> hands up (the hang poses)
function ropeGeom(sp, o, hand, R) {
  const s = sp.side, lx = o.rx, ly = RIM + 0.01 + hand, px = lx + s * ROPE_OUT;
  R.px = px; R.L = hyp(lx - px, ROPE_PY - ly); R.th1 = Math.atan2(lx - px, ROPE_PY - ly); R.th0 = s * 1.4; return R;
}
const _rg = {};
// the pose of a climber before it drops in (pure in lt): feet (px, py, pz), pose, tilt, squash; o.line = a rope / zipline
function vegPose(sp, lt, o) {
  vegSpot(sp, o);
  const hy = ART ? ART.veg[sp.vk].hangY : HANG_Y, hand = handOf(sp.vk);
  o.tilt = 0; o.sq = 1; o.line = null; o.lcol = 0;
  if (sp.pat <= 2) {
    if (lt < HOP) {
      const k = clamp(lt / HOP, 0, 1); o.ph = 'hop';
      o.px = o.x + o.ox * o.ho * (1 - k); o.pz = o.z + o.oz * o.ho * (1 - k); o.py = lerp(-0.1, Y0C, k) + 0.16 * Math.sin(Math.PI * k); o.pose = 'run1';
    } else if (lt < sp.hg) {
      const c = climbAt(sp, lt); o.ph = 'climb'; o.px = o.x; o.pz = o.z; o.py = lerp(Y0C, hy, c.y);
      o.pose = c.duck ? 'hng0' : (c.k & 1) ? 'clb1' : 'clb0'; o.tilt = 0.05 * Math.sin(lt * 13);
    } else if (lt < sp.win - MANTLE) {
      o.ph = 'hang'; o.px = o.x + 0.012 * Math.sin(lt * 31); o.pz = o.z; o.py = hy + 0.012 * Math.sin(lt * 19); o.pose = (Math.floor(lt * 9) & 1) ? 'hng1' : 'hng0';
    } else {
      const k = E.outCubic(clamp((lt - sp.win + MANTLE) / MANTLE, 0, 1)); o.ph = 'mantle';
      o.px = lerp(o.x, o.rx, k); o.pz = lerp(o.z, o.rz, k); o.py = lerp(hy, RIM + 0.01, k); o.pose = 'clb0';
    }
  } else if (sp.pat === 3) {                                     // ROPE SWINGER
    const Rg = ropeGeom(sp, o, hand, _rg);
    if (lt < sp.sw) {
      const k = clamp(lt / sp.sw, 0, 1), e = k * k * (3 - 2 * k), th = lerp(Rg.th0, Rg.th1, e), phi = 0.7 * th;
      const hx = Rg.px + Rg.L * Math.sin(th), hyy = ROPE_PY - Rg.L * Math.cos(th);
      o.ph = 'swing'; o.px = hx + hand * Math.sin(phi); o.py = hyy - hand * Math.cos(phi); o.pz = o.rz; o.pose = 'hng0'; o.tilt = phi;
      o.line = [Rg.px, ROPE_PY, o.rz, hx, hyy, o.rz]; o.lcol = PAL.tan;
    } else {
      const k = lt - sp.sw; o.ph = 'rim'; o.px = o.rx; o.pz = o.rz; o.py = RIM + 0.01; o.pose = k < 0.1 ? 'fall' : 'stand';
      o.sq = 1 - 0.2 * Math.exp(-k * 12) * Math.cos(k * 26);
      const q = clamp(k / 0.45, 0, 1);                           // the empty rope swings back out and is pulled up
      if (q < 1) { const th = lerp(Rg.th1, Rg.th0 * 0.5, q), Lq = Rg.L * (1 - q * q); o.line = [Rg.px, ROPE_PY, o.rz, Rg.px + Lq * Math.sin(th), ROPE_PY - Lq * Math.cos(th), o.rz]; o.lcol = PAL.tan; }
    }
  } else {                                                       // ZIPLINE
    const s = sp.side, a0 = CX + s * ZIP_X, a1 = ZIP_Y, a2 = CZ + ZIP_DZ, b0 = o.rx, b1 = RIM + 0.01 + hand, b2 = o.rz;
    o.line = [a0, a1, a2, b0, b1, b2]; o.lcol = PAL.steel;
    if (lt < sp.sw) {
      const k = clamp(lt / sp.sw, 0, 1), e = k * k; o.ph = 'zip';
      o.px = lerp(a0, b0, e); o.py = lerp(a1, b1, e) - hand; o.pz = lerp(a2, b2, e); o.pose = 'hng1'; o.tilt = -s * 0.22 + 0.06 * Math.sin(lt * 23);
    } else {
      const k = lt - sp.sw; o.ph = 'rim'; o.px = o.rx; o.pz = o.rz; o.py = RIM + 0.01; o.pose = k < 0.1 ? 'fall' : 'stand';
      o.sq = 1 - 0.2 * Math.exp(-k * 12) * Math.cos(k * 26);
    }
  }
  return o;
}
const _vp = {}, _cq = {}, _cq2 = {};
function placeNear(g, x, y, z) {                                // put a group at (x, y, z) drawn KN of the way from the camera
  g.position.set(CAMP.x + (x - CAMP.x) * KN, CAMP.y + (y - CAMP.y) * KN, CAMP.z + (z - CAMP.z) * KN); g.scale.setScalar(KN);
}
// this veggie's throw phase at t (the cart's shared state): 'thr' = winding up a snack over its head, 'fall' = the release
function throwPose(cs, id, t) {
  for (const e of cs.toss) { if (e[1] !== id || e[0] < t - 0.18) continue; if (t >= e[0]) return 'fall'; if (t >= e[0] - THROW_UP) return e[2] >= 0 ? 'thr' : 'hng0'; return null; }
  return null;
}
class Veg extends T.Target {
  constructor(sp, run) {
    super('target');
    this.sp = sp; this.run = run; this.lastT = sp.t0; this.thud = false; this.climbing = false; this.rope = -1; this.lastLine = null; this.cue = false;
    const A = buildArt().veg[sp.vk];
    this.A = A; this.hw = A.hw; this.hh = A.hh; this.sc = KN;
    this.mesh = shared(A.poses.run0, TOON); this.group.add(this.mesh); this.curPose = 'run0';
    this.part(this.mesh, A.chips, VS, 0.5 * VS, 0.5 * VS, 0.5 * VS);
    this.proxy = proxyFor(this, this.group); this.proxy.position.y = A.mid;
    this.tp = new THREE.Vector3();                              // its true (unscaled) position
    this.group.visible = false;
  }
  meshes() { return [this.proxy]; }
  setPose(k) { if (k !== this.curPose) { this.curPose = k; this.mesh.geometry = this.A.poses[k]; } }
  show(x, y, z, yaw, tilt, sq, pose) {
    this.tp.set(x, y, z); placeNear(this.group, x, y, z);
    const w = sq < 1 ? 1 + (1 - sq) * 0.6 : 1; this.group.scale.set(KN * w, KN * sq, KN * w);
    this.group.rotation.set(0, yaw, tilt); this.setPose(pose); this.group.visible = true;
  }
  update(lt, run) {
    const sp = this.sp, t = sp.t0 + lt, dir = dirOf(run), last = dir ? dir.last : 1e9, play = run.state === 'play';
    this.run = run; this.lastT = t;
    if (!this.alive) {                                          // shot: a swinger's rope is pulled back up, empty
      const L = this.deadLine;
      if (L && this.rope >= 0) { const q = clamp((lt - this.deadLt) / 0.4, 0, 1); if (q < 1) { ropeSet(this.rope, [L[0], L[1], L[2]], [lerp(L[3], L[0], q), lerp(L[4], L[1], q), L[5]], PAL.tan); return false; } }
      ropeFree(this); return true;
    }
    if (!this.cue && play) { this.cue = true; const u = uOfPx(scr(vegSpot(sp, _cq2).x, 0.5, _cq2.z)[0]); if (sp.pat === 3) B.SFX.play('ropeSwing', { u }); else if (sp.pat === 4) B.SFX.play('zipLine', { u }); }
    if (lt < sp.win) {
      const o = vegPose(sp, lt, _vp);
      this.show(o.px, o.py, o.pz, faceCam(o.px, o.pz), o.tilt, o.sq, o.pose);
      this.shootable = lt >= 0.08;
      if (o.line) { if (this.rope < 0) this.rope = ropeClaim(this); ropeSet(this.rope, [o.line[0], o.line[1], o.line[2]], [o.line[3], o.line[4], o.line[5]], o.lcol); this.lastLine = o.line; }
      else { this.lastLine = null; if (this.rope >= 0) ropeFree(this); }
      if (sp.pat <= 2 && lt >= HOP && !this.climbing) { this.climbing = true; if (play) B.SFX.play('veggieClimb', { u: uOfPx(scr(o.px, 0.3, o.pz)[0]) }); }
      return false;
    }
    if (this.rope >= 0) ropeFree(this);
    this.lastLine = null;
    const n = PILE.nProd, c = cartSpot(sp, n, _cq);
    if (lt < sp.land) {                                          // over the rim and onto the pile
      const q = clamp((lt - sp.win) / DROP_T, 0, 1), e = E.inOut(q), r = vegSpot(sp, _cq2);
      const x = lerp(r.rx, c.cx, e), y = lerp(RIM + 0.01, c.cy, e) + 0.45 * 4 * q * (1 - q), z = lerp(r.rz, c.cz, e);
      this.show(x, y, z, faceCam(x, z), -c.dx * Math.sin(q * Math.PI) * 0.9, 1, 'fall');
      this.shootable = false;
      return false;
    }
    // IN THE CART: it stands on the pile and throws snacks out until it is shot (the director spawn plays the throws)
    if (!this.thud) { this.thud = true; if (play && !run.taken.has(sp.id)) B.SFX.play('veggieIn', { u: uOfPx(scr(c.cx, c.cy, c.cz)[0]) }); }
    const k = lt - sp.land, live = t < last && run.state !== 'end';
    const tp = live ? throwPose(cartState(run, t), sp.id, t) : null;
    const sq = k < 0.3 ? 1 - 0.22 * Math.exp(-k * 10) * Math.cos(k * 22) : 1;
    this.show(c.cx, c.cy + (tp ? 0 : 0.012 * Math.abs(Math.sin(t * 6 + sp.id))), c.cz, faceCam(c.cx, c.cz) + (tp === 'fall' ? c.dx * 0.5 : 0), tp ? 0 : 0.05 * Math.sin(t * 5 + sp.id), sq, tp || (k < 0.15 ? 'fall' : 'stand'));
    this.shootable = live && k >= 0.05;
    return t >= sp.t1;
  }
  // shot: veg bits burst off (its own chips, a few leafy flecks), a squelch. The chips fly from its TRUE pose. Shot while
  // swinging on its rope: a bonus ding (+100 in points())
  shatter(point, opts) {
    if (!this.alive) return;
    const lt = this.lastT - this.sp.t0;
    this.deadLt = lt; this.deadLine = this.sp.pat === 3 && lt < this.sp.sw ? this.lastLine : null;
    if (!this.deadLine && this.rope >= 0) ropeFree(this);
    this.group.position.copy(this.tp); this.group.scale.setScalar(1); this.group.updateMatrixWorld(true);
    const c = this.group.position.clone(); c.y += this.A.mid;
    super.shatter(c, Object.assign({ max: 110, power: 0.9 }, opts || {}));
    T.sparks(c, 5, ['lime', 'bone', 'yellow'], 1.1, 0.03);
    const u = uOfPx(scr(c.x, c.y, c.z)[0]);
    B.SFX.play('veggiePop', { u });
    if (this.sp.pat === 3 && lt < this.sp.sw) { B.SFX.play('swingShot', { u }); T.sparks(c, 8, ['yellow', 'lemon', 'bone'], 1.6, 0.04); }
  }
  dispose() { ropeFree(this); super.dispose(); }
}
// ---------- the director spawn: the HITS, the grasp jolts, the thrown snacks, the wave cue, the pile, the finale ----------
// the grasp JOLTS of a timeline: [stage time, veggie spawn, weight, dir x, dir z, u] (a climber's grab onto the cart, each
// grasp, the mantle; a rope / zipline landing on the rim; the drop into the cart), sorted by time
const JOLTS = new WeakMap(), WAVES = new WeakMap();
function joltsOf(run) {
  let l = JOLTS.get(run.timeline); if (l) return l;
  l = [];
  for (const s of vegsOf(run)) {
    const o = vegSpot(s, {}), u = uOfPx(scr(o.x, 0.5, o.z)[0]), add = (lt, w, dx = o.ox, dz = o.oz) => l.push([s.t0 + lt, s, w, dx, dz, u]);
    if (s.pat <= 2) { add(HOP, 0.8); for (let i = 0; i < s.g.length; i += 4) if (!s.g[i + 2]) add(s.g[i], 1); add(s.win - MANTLE, 1.2); }
    else add(s.sw, s.pat === 3 ? 1.6 : 1.3);
    add(s.land, 1.5, 0, 0);
  }
  l.sort((a, b) => a[0] - b[0]); JOLTS.set(run.timeline, l); return l;
}
function wavesOf(run) {
  let l = WAVES.get(run.timeline); if (l) return l;
  const m = new Map(); for (const s of vegsOf(run)) if (!m.has(s.wv) || m.get(s.wv).t0 > s.t0) m.set(s.wv, s);
  l = [...m.values()].map(s => { const o = vegSpot(s, {}); return [Math.max(0.05, s.t0 - 0.45), uOfPx(scr(o.x, 0.5, o.z)[0])]; }).sort((a, b) => a[0] - b[0]);
  WAVES.set(run.timeline, l); return l;
}
class Aisle extends T.Target {
  constructor(sp, run) {
    super('fx'); this.sp = sp; this.run = run; this.pt = -99; this.fin = -1; if (FIN.run !== run) { FIN.run = run; FIN.t = -1; }
    clearPile(); slotsReset(); for (let i = 0; i < ROPE_N; i++) { if (ROPES[i]) ROPES[i].rope = -1; ROPES[i] = null; ropeSet(i, null); }
  }
  meshes() { return []; }
  update(lt, run) {
    const sp = this.sp, t = sp.t0 + lt, a = this.pt, live = run.state === 'play';
    // round 3: every player's HITS = their snacks in the cart (snacks shot - snacks the veggies threw out); a climber shot
    // is points only
    const cs = cartState(run, t);
    run.players.forEach((P, i) => { P.hits = cs.hits[i]; });
    if (this.fin < 0 && t >= sp.last && live && (run.versus || (run.me.hits >= run.cfg.quota && run.me.lives > 0))) { this.fin = sp.last; FIN.run = run; FIN.t = sp.last; }
    let flash = null;
    if (this.fin >= 0) {
      const f0 = a - this.fin, f1 = t - this.fin;
      for (let i = 0; i < SCAN_N; i++) { const at = SCAN_T + i * SCAN_DT; if (f0 < at && f1 >= at) B.SFX.play('scanBeep', { u: 0.55, n: i }); }
      const sc = f1 - SCAN_T, bi = Math.floor(sc / SCAN_DT);
      if (sc >= 0 && bi < SCAN_N && PILE.nProd) { const n = PILE.nProd, k = n - 1 - ((bi * 5) % Math.min(n, PILE_N)); flash = { k, a: 1 - (sc - bi * SCAN_DT) / SCAN_DT }; }
      if (f0 < RCPT_T && f1 >= RCPT_T) { B.SFX.play('receiptPrint', { u: 0.6 }); B.SFX.play('finale'); if (B.G && B.G.duckReact && inPlay()) B.G.duckReact('cheer', 2.2); }
    }
    updatePile(run, t, flash);
    this.jolts(run, t, a, live);
    this.tosses(run, t, a, cs, live);
    if (live) for (const w of wavesOf(run)) if (w[0] > a && w[0] <= t) { B.SFX.play('waveIn', { u: w[1] }); if (B.G && B.G.duckReact && inPlay()) B.G.duckReact('angry', 0.8); }
    this.pt = t;
    return t >= sp.last + (this.fin >= 0 ? FIN_HOLD : 1.0);
  }
  // every grasp jolts the cart (summed: two at once = a bigger jolt); a grasp after the climber was shot never happens
  jolts(run, t, a, live) {
    const L = joltsOf(run), J = PARTS && PARTS.jolt; if (!J) return;
    let lo = 0, hi = L.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m][0] < t - 0.5) lo = m + 1; else hi = m; }
    let jx = 0, jz = 0, jy = 0, jp = 0, nNew = 0, uS = 0, near = 0;
    for (let i = lo; i < L.length && L[i][0] <= t; i++) {
      const [T0, s, w, dx, dz, u] = L[i];
      if (run.taken.has(s.id) && hitT(s) < T0) continue;
      const tau = t - T0, f = Math.exp(-9 * tau) * Math.sin(42 * tau), g = Math.exp(-8 * tau) * Math.abs(Math.sin(34 * tau));
      jx += w * f * dx; jz += w * f * dz; jy += w * g; jp += w * Math.exp(-6 * tau) * Math.abs(Math.sin(26 * tau));
      if (T0 > a) { nNew++; uS += u; } if (tau < 0.12) near++;
    }
    J.x = 0.016 * jx; J.rz = -0.045 * jx; J.rx = 0.03 * jz; J.y = 0.012 * jy; J.pile = 0.025 * jp;
    if (nNew && live) B.SFX.play('cartJolt', { u: uS / nNew, big: near > 1 ? 1 : 0 });
  }
  // the thrown snacks: held over the thrower's head through the wind-up, then an arc out of the cart, gone (drawn near)
  tosses(run, t, a, cs, live) {
    const P = PARTS && PARTS.toss; if (!P) return;
    let k = 0;
    for (const [tt, vid, pid] of cs.toss) {
      if (pid < 0) continue;
      if (live && tt > a && tt <= t) B.SFX.play('snackOut', { u: 0.5 });
      if (t < tt - THROW_UP || t >= tt + TOSS_T || k >= P.length) continue;
      const s = run.timeline[vid], p = run.timeline[pid], A = buildArt().prod[p.pk], m = P[k++], c = cartSpot(s, PILE.nProd, _cq2);
      const hx = c.cx, hy = c.cy + handOf(s.vk) + 0.1, hz = c.cz;      // held up between its hands
      let x = hx, y = hy, z = hz, sc = A.fit * 0.85, spin = 0;
      if (t >= tt) { const q = (t - tt) / TOSS_T; x = hx + c.dx * 1.7 * q; z = hz + 0.6 * q; y = lerp(hy, 0.7, q) + 1.0 * 4 * q * (1 - q); spin = q * 10; if (q > 0.7) sc *= (1 - q) / 0.3; }
      m.geometry = A.geo; placeNear(m, x, y, z); m.scale.setScalar(KN * sc); m.rotation.set(spin, faceCam(x, z), spin * 0.4); m.visible = true;
    }
    for (; k < P.length; k++) P[k].visible = false;
  }
}
function makeTarget(sp, run) { return sp.kind === 'aisle' ? new Aisle(sp, run) : sp.kind === 'veg' ? new Veg(sp, run) : new Product(sp, run); }

// =========================================================================================
// The dials per tier (variant 0). Round 3 (Jon 2026-11-01: "every grocery level should be pretty packed with groceries
// and enemies", "complete chaos but not impossible").
// time = the director's stream s (the clock = the last item + FIN_SLOT) | ride = s a product rides the MIDDLE board from
// the far end to the edge of the screen (the pop window; the aisle speed follows)
// THE STREAM (round 2's director; = THE QUOTA POOL): live = stream products shootable at once | gap / burst (b3: a burst
// of 3) / bgap / pause | hop / alt / adj = AIM TRAVEL (#90) | top = top-shelf share
// fill = THE PACKED SHELVES: every board (6 tracks) gets another live snack every ~fill s (x0.55-1.45), >= 1 unit clear of
// the others on its track. Real snacks (same points, they count as HITS) but not in the quota pool: a share of EVERY live
// snack would be 70 (Beginner) to 300 (Insane) snacks, beyond a person; the quota stays a share of the stream
// CLIMBERS: climbers per round in WAVES of wave [min, max], spread s between a wave's climbers, breathe = the least s
// between waves (the rest of the stream is shared out between them), cap = climbers on the cart at once, win = the climb
// window s (x0.9-1.1), pair = the next one climbs the same side a beat later, thd = s between a veggie's throws in the cart
// spare / share / rel (the reload trip s): quota = share x the stream's snacks (+2 % a variant), <= stream - spare
// Round 3 tuning: Insane's stream gap 0.55-0.85 / burst 28 % -> 0.74-1.1 / 22 % (its quota ~32 -> ~27): with 36 climbers a
// slow bot (0.32 s reaction, 0.3 s between shots) missed the quota in 30 of 30 runs (worst -10); the snacks on the shelves
// are as packed as before (the fill does not depend on the stream)
// =========================================================================================
const TIER_P = [
  { time: 44, ride: 3.2, live: 4, gap: [0.75, 1.15], burst: 0.2, b3: 0.2, bgap: [0.35, 0.5], pause: [0.8, 1.2], hop: [0.12, 0.35], alt: 0.25, adj: 0.12, top: 0.14,
    fill: 1.5, climbers: 14, wave: [2, 4], spread: [0.7, 1.2], breathe: 3.0, cap: 3, win: 4.0, pair: 0.15, thd: 0.8, spare: 8, share: 0.55, rel: 0.75 },
  { time: 40, ride: 2.5, live: 5, gap: [0.62, 0.98], burst: 0.25, b3: 0.25, bgap: [0.3, 0.45], pause: [0.85, 1.25], hop: [0.25, 0.5], alt: 0.45, adj: 0.15, top: 0.17,
    fill: 0.95, climbers: 20, wave: [3, 5], spread: [0.5, 0.9], breathe: 2.4, cap: 4, win: 3.0, pair: 0.2, thd: 0.7, spare: 5, share: 0.6, rel: 0.7 },
  { time: 36, ride: 1.8, live: 6, gap: [0.5, 0.82], burst: 0.3, b3: 0.3, bgap: [0.25, 0.38], pause: [0.9, 1.35], hop: [0.4, 0.7], alt: 0.65, adj: 0.17, top: 0.19,
    fill: 0.55, climbers: 28, wave: [4, 7], spread: [0.35, 0.65], breathe: 1.7, cap: 5, win: 2.2, pair: 0.25, thd: 0.6, spare: 3, share: 0.64, rel: 0.62 },
  { time: 32, ride: 1.2, live: 7, gap: [0.74, 1.1], burst: 0.22, b3: 0.35, bgap: [0.26, 0.36], pause: [1.0, 1.45], hop: [0.55, 0.95], alt: 0.85, adj: 0.2, top: 0.21,
    fill: 0.3, climbers: 36, wave: [5, 8], spread: [0.25, 0.5], breathe: 1.2, cap: 6, win: 1.6, pair: 0.3, thd: 0.5, spare: 2, share: 0.68, rel: 0.55 }
];
// climbing pattern weights [LADDER, SPRINTER, PEEKER, ROPE, ZIPLINE (Very Hard and Insane only)] by variant: SNACK AISLE the
// standard mix, 12 ITEMS OR LESS more rope swingers and peekers, FAMILY SIZE the standard mix in BIGGER waves (+1 / +2)
// with LONGER breathers (x1.35)
const PAT_W = [[4, 2, 2, 1.6, 1.2], [2.6, 1.4, 3.6, 3.4, 1.4], [4, 2, 2, 1.6, 1.2]];
const VARIANT_NAMES = ['SNACK AISLE', '12 ITEMS OR LESS', 'FAMILY SIZE'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.v = +(RIDE_REF / b.ride).toFixed(4);                         // the aisle speed (world units / s)
  c.share = Math.min(0.9, b.share + 0.02 * v);
  c.patW = PAT_W[v].map((w, i) => (i === 4 && tier < 2 ? 0 : w));
  c.wave = v === 2 ? [b.wave[0] + 1, b.wave[1] + 2] : b.wave.slice();
  c.breathe = v === 2 ? +(b.breathe * 1.35).toFixed(2) : b.breathe;
  c.stream = b.time; c.time = b.time + b.ride + FIN_SLOT; c.finSlot = FIN_SLOT;
  c.quota = 8;
  c.ammo = ['unlimited', { mag: 12, reloadTime: b.rel, autoReload: false }, { mag: 16, reloadTime: b.rel, autoReload: false }][v];
  c.tier = tier; c.variant = v; c.title = 'GROCERY RUN'; c.subtitle = VARIANT_NAMES[v];
  return c;
}
const pickW = (w, r) => { let s = r * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((s -= w[i]) < 0) return i; return w.length - 1; };
const r3 = x => +x.toFixed(3);
const isReq = s => s.kind === 'prod' || s.kind === 'veg';
// the header of the shelf bay a product spawned at t0 sits on (it rides with the shelves: the same bay all its ride)
function bayHeader(sd, t0, v) {
  const Dm = (((v * t0) % PERIOD) + PERIOD) % PERIOD, b = Math.floor((Z0 - Dm - ZS0) / BAY);
  return patOf(b, sd);
}
// the screen point the player is "made to aim at" for a spawn (aim travel): a product 45 % into its ride, a climber's body
function aimPt(s) {
  if (s.kind === 'prod') { const lt = s.ra + 0.45 * s.span; return scr(s.side * XP, LEV[s.lv] + 0.26, Z0 + s.v * lt); }
  const o = vegSpot(s, {}); return scr(o.x, 0.5, o.z);
}
const AIM_D = 440;                                              // the play rect's diagonal-ish reference (px) for the hop dial
// the climb spots: [face, side, cart-local z of a side spot]; ROPE swingers take a side (they swing in from that edge),
// ZIPLINE riders a front corner or the front end of a side
// The right side's spots sit further forward and a little closer in than the left's: the gun and the HITS pill are at the
// bottom right (the widest climber's right edge stays <= x 277, its feet <= row 197); a zipline lands on spot flag 1
const SPOTS = [['L', -1, -0.8, 1], ['L', -1, -0.5], ['L', -1, -0.22], ['R', 1, -0.9, 1], ['R', 1, -0.75], ['R', 1, -0.6], ['FL', -1, 0, 1], ['FR', 1, 0, 1], ['F', -1, 0], ['F', 1, 0]];
const SPOT_W = [1.3, 1.3, 1.1, 1.3, 1.3, 1.1, 0.9, 0.9, 0.45, 0.45];   // the sides first; the front face least (it sits behind the pile on screen)
const isSide = i => SPOTS[i][0] === 'L' || SPOTS[i][0] === 'R';
// a climbing pattern's grasp keyframes in its window: [lt, climb fraction, 0 grasp | 1 duck, pull s] x n
function climbPlan(pat, win, rng) {
  const hg = win - MANTLE - clamp(0.12 * win, 0.18, 0.4), c0 = HOP, D = hg - c0, ev = [];
  const add = (lt, y, ty) => ev.push([lt, y, ty]);
  if (pat === 0) { const n = rng() < 0.5 ? 3 : 4; for (let i = 0; i < n; i++) add(c0 + D * (i + 0.1) / n, (i + 1) / n, 0); }        // LADDER: steady
  else if (pat === 1) { const n = rng() < 0.5 ? 3 : 4, F = 0.4 * D; for (let i = 0; i < n; i++) add(c0 + F * (i + 0.05) / n, 0.86 * (i + 1) / n, 0); add(c0 + D * 0.84, 1, 0); }   // SPRINTER: fast, a stop under the rim
  else { add(c0 + D * 0.03, 0.4, 0); add(c0 + D * 0.2, 0.75, 0); add(c0 + D * 0.38, 0, 1); add(c0 + D * 0.62, 0.5, 0); add(c0 + D * 0.8, 1, 0); }   // PEEKER: up, ducks back down, up again
  const g = [];
  ev.forEach((e, i) => { const nx = i + 1 < ev.length ? ev[i + 1][0] : hg, d = Math.max(0.06, Math.min(e[2] ? DUCK_T : PULL, 0.85 * (nx - e[0]))); g.push(r3(e[0]), r3(e[1]), e[2], r3(d)); });
  return { g, hg: r3(hg), win: r3(win) };
}

// ---------- timeline: the DIRECTOR. Every spawn from the seeded rng only. ----------
// THE STREAM (the quota pool): beats of a single product, a burst of 2-3 (different tracks), anticipation pauses after
// bursts. A product's TRACK (left / right x low / middle / top) comes from AIM TRAVEL: the track whose aim point is
// closest to the wanted hop (tier dial x AIM_D) from the last thing you were made to aim at, other side / height
// preferred, +2 near a product already up there; the top shelf gets its share by a roll first. Tracks keep their products
// >= 0.9 units apart. Stream products shootable at once <= live. Its LOOK: one of the looks its bay's header stocks.
// RELOAD-AWARE (12 / 16 per magazine): the stream product after every full magazine is shootable >= rel + 0.3 s after
// the one before it.
// THE PACKED SHELVES (fill): every track another live snack every ~fill s, >= 1 unit clear of the others on its track.
// THE CLIMBERS, in WAVES: wave sizes drawn until the round's count is reached; the waves are laid out from 2.4 s with
// breathers >= breathe (the stream's spare time shared out between them); inside a wave a climber every spread s (a PAIR:
// the next one on the same side 0.35-0.6 s later); never more than cap climbers on the cart at once (a later one waits);
// a spot is free again 0.25 s after its climber dropped in. Pattern by the variant's weights.
// Spawn fields: prod { side, lv, pk, v, ra, span, gone, f (1 = fill) }; veg { face, side, zl, pat, vk, wv (wave), cs (cart
// spot), win (drop starts), land, th0 / thd (its throws in the cart), g / hg (climbs) or sw (swing / slide ends) };
// aisle { v, last }.
function timeline(c, rng) {
  rng(); rng(); rng();
  const TIME = c.stream, v = c.v, magN = c.ammo && c.ammo.mag && !c.ammo.autoReload ? c.ammo.mag : 0;
  const items = [];
  let lastAim = null, reqN = 0, lastReqIn = -9, lastPk = -1;
  const trackSpan = (lv, sd) => (zEnd(lv, sd).zs - Z0) / v;
  const prodsUp = t => items.filter(s => s.kind === 'prod' && s.t0 + s.ra <= t && s.t0 + s.ra + s.span > t);
  function note(s) { reqN++; lastReqIn = s.t0 + s.ra; lastAim = aimPt(s); }
  function gateAt(t, ra) {                                        // the reload rule: the earliest start for the next stream item
    if (!magN || reqN === 0 || reqN % magN !== 0) return t;
    return Math.max(t, lastReqIn + c.rel + 0.3 - ra);
  }
  function lookAt(sd, t) {
    const looks = HEADERS[bayHeader(sd, t, v)].looks, nl = looks.length;
    let li = Math.floor(rng() * nl) % nl; if (looks[li] === lastPk && nl > 1) li = (li + 1 + Math.floor(rng() * (nl - 1))) % nl;
    return (lastPk = looks[li]);
  }
  function prodSpawn(t, lv, sd, f) {
    const span = trackSpan(lv, sd) - PROD_RA, gone = (zEnd(lv, sd).zg - Z0) / v;
    const sp = { id: 0, t0: r3(t), t1: r3(t + gone + 0.1), kind: 'prod', side: sd, lv, pk: lookAt(sd, t), v, ra: PROD_RA, span: r3(span), gone: r3(gone) };
    if (f) sp.f = 1;
    items.push(sp); return sp;
  }
  function product(t) {
    t = gateAt(t, PROD_RA);
    const D = rng.range(c.hop[0], c.hop[1]) * AIM_D, top = rng() < c.top, noise = rng();
    const cands = [];
    for (const lv of top ? [2] : [0, 1]) for (const sd of [-1, 1]) {
      if (items.some(s => s.kind === 'prod' && s.lv === lv && s.side === sd && Math.abs(s.t0 - t) * v < 0.9)) continue;
      const span = trackSpan(lv, sd) - PROD_RA, sp = { kind: 'prod', side: sd, lv, v, ra: PROD_RA, span, t0: t }, p = aimPt(sp);
      let sc = 0;
      if (lastAim) {
        sc = Math.abs(hyp(p[0] - lastAim[0], 1.6 * (p[1] - lastAim[1])) - D) / AIM_D;
        if ((p[0] < R.RW / 2) === (lastAim[0] < R.RW / 2)) sc += 0.35 * c.alt;
        if (Math.abs(p[1] - lastAim[1]) < 18) sc += 0.2 * c.alt;
        for (const q of prodsUp(t + PROD_RA + 0.45 * span)) { const qa = aimPt(q); if (hyp(qa[0] - p[0], qa[1] - p[1]) < c.adj * AIM_D) sc += 2; }
      }
      sc += 0.08 * ((noise * 7.13 + sd * 0.37 + lv * 0.61 + 3) % 1);
      cands.push({ sc, lv, sd });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.sc - b.sc || a.lv - b.lv || a.sd - b.sd);
    const sp = prodSpawn(t, cands[0].lv, cands[0].sd, 0); note(sp);
    return sp;
  }
  // THE STREAM
  let t = 0.6, guard = 0;
  while (guard++ < 4000 && t < TIME) {
    const up = prodsUp(t + PROD_RA);
    if (up.length >= c.live) { t = Math.min(...up.map(s => s.t0 + s.ra + s.span)) + 0.02; continue; }
    const n = rng() < c.burst ? 2 + (rng() < c.b3 ? 1 : 0) : 1;
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const sp = product(t);
      if (!sp) break;
      placed++; t = sp.t0;
      if (i < n - 1) t += rng.range(c.bgap[0], c.bgap[1]);
    }
    if (!placed) { t += 0.15; continue; }
    t += placed > 1 ? rng.range(c.pause[0], c.pause[1]) : rng.range(c.gap[0], c.gap[1]);
  }
  const nStream = items.length;
  // THE PACKED SHELVES
  const occ = {};
  for (const s of items) (occ[s.lv * 2 + (s.side > 0 ? 1 : 0)] = occ[s.lv * 2 + (s.side > 0 ? 1 : 0)] || []).push(s.t0);
  for (const lv of [0, 1, 2]) for (const sd of [-1, 1]) {
    const o = occ[lv * 2 + (sd > 0 ? 1 : 0)] || [];
    for (let tf = 0.3 + rng() * c.fill; tf < TIME; tf += c.fill * rng.range(0.55, 1.45)) {
      if (o.some(x => Math.abs(x - tf) * v < 1.0)) continue;
      prodSpawn(tf, lv, sd, 1); o.push(tf);
    }
  }
  // THE CLIMBERS
  // W = climbers / the mean wave size; each wave starts at the minimum size and the rest are dealt out at random
  const W = Math.max(1, Math.round(c.climbers / ((c.wave[0] + c.wave[1]) / 2))), waves = new Array(W).fill(c.wave[0]);
  let left = c.climbers - W * c.wave[0];
  for (let g = 0; left > 0 && g < 2000; g++) { const i = Math.floor(rng() * W); if (waves[i] < c.wave[1]) { waves[i]++; left--; } }
  for (let i = 0; left > 0; i = (i + 1) % W) { waves[i]++; left--; }
  const spM = (c.spread[0] + c.spread[1]) / 2, busyS = waves.reduce((a, n) => a + (n - 1) * spM + c.win + DROP_T, 0);
  // the breathers share the stream's spare time; never under 80 % of the dial (a round may then run a little long)
  const T0 = 2.4, br = W > 1 ? Math.max(0.8 * c.breathe, (TIME - T0 - 0.6 - busyS) / (W - 1)) : 0;
  const busy = SPOTS.map(() => -9), act = [];
  let tw = T0, ci = 0;
  for (let wi = 0; wi < W; wi++) {
    let ts = tw, wEnd = tw, pairSide = 0;
    for (let k = 0; k < waves[wi]; k++) {
      if (k) ts += pairSide ? rng.range(0.35, 0.6) : rng.range(c.spread[0], c.spread[1]);
      for (let g = 0; g < 50; g++) { const on = act.filter(e => e[0] <= ts && e[1] > ts); if (on.length < c.cap) break; ts = Math.min(...on.map(e => e[1])) + 0.05; }
      const pat = pairSide ? (rng() < 0.6 ? 0 : 1) : pickW(c.patW, rng());
      let cand = SPOTS.map((s, i) => i).filter(i => pat === 3 ? isSide(i) : pat === 4 ? !!SPOTS[i][3] : true);
      if (pairSide) { const ps = cand.filter(i => isSide(i) && SPOTS[i][1] === pairSide); if (ps.length) cand = ps; }
      let free = cand.filter(i => busy[i] <= ts);
      if (!free.length) { const i0 = cand.reduce((b2, i) => (busy[i] < busy[b2] ? i : b2), cand[0]); ts = busy[i0] + 0.05; free = [i0]; }
      const si = free[pickW(free.map(i => SPOT_W[i]), rng())], S = SPOTS[si], winB = c.win * rng.range(0.9, 1.1);
      const sp = { id: 0, t0: r3(ts), t1: 0, kind: 'veg', face: S[0], side: S[1], zl: S[2], pat, vk: Math.floor(rng() * VEGGIES.length) % VEGGIES.length,
        wv: wi, cs: ci++, th0: r3(Math.max(0.55, c.thd)), thd: c.thd };
      if (pat <= 2) Object.assign(sp, climbPlan(pat, winB, rng));
      else if (pat === 3) { const sw = clamp(0.55 * winB, 0.85, 2.0); sp.sw = r3(sw); sp.win = r3(sw + RIM_PAUSE); }
      else { const sw = clamp(0.45 * winB, 0.6, 1.3); sp.sw = r3(sw); sp.win = r3(sw + ZIP_PAUSE); }
      sp.land = r3(sp.win + DROP_T);
      busy[si] = sp.t0 + sp.land + 0.25; act.push([sp.t0, sp.t0 + sp.win]); wEnd = Math.max(wEnd, sp.t0 + sp.land);
      items.push(sp);
      pairSide = !pairSide && isSide(si) && k < waves[wi] - 1 && rng() < c.pair ? S[1] : 0;
    }
    tw = wEnd + br * rng.range(0.9, 1.15);
  }
  items.sort((a, b) => a.t0 - b.t0);
  const last = r3(items.reduce((m, s) => Math.max(m, s.kind === 'prod' ? s.t0 + s.ra + s.span : s.t0 + s.land + 0.2), 0) + 0.3);
  for (const s of items) if (s.kind === 'veg') s.t1 = r3(last + FIN_HOLD);
  const dir = { id: 0, t0: 0, t1: r3(last + FIN_HOLD), kind: 'aisle', v, last };
  const out = [dir, ...items];
  out.sort((a, b) => a.t0 - b.t0 || (a.kind === 'aisle' ? -1 : b.kind === 'aisle' ? 1 : 0));
  out.forEach((s, i) => { s.id = i; });
  const nP = items.filter(s => s.kind === 'prod').length, nV = items.filter(s => s.kind === 'veg').length;
  c.prodCount = nP; c.streamCount = nStream; c.fillCount = nP - nStream; c.vegCount = nV; c.waveCount = W; c.goodCount = nP;
  c.topCount = items.filter(s => s.kind === 'prod' && s.lv === 2).length;
  c.time = Math.ceil(last + FIN_SLOT);
  c.quota = Math.max(4, Math.min(nStream - c.spare, Math.round(nStream * c.share)));
  return out;
}
// points: a product 100, +50 on the top shelf, +50 shot in the far third of its ride; a climber 200 POINTS (+100 for a
// rope swinger shot mid-swing), in the cart too. points() is the engine's only call on an awarded hit: it records the
// SHARED hit stage time (the pile, the throws and the HITS read it). A climber is NOT a snack: in solo the engine's HITS
// +1 (and the shot: accuracy counts snack shots) is undone here, before applyHit's quota check; the director spawn
// rewrites every player's HITS from the cart's state each frame anyway (versus is settled there)
function points(sp, lt) {
  const st = +(sp.t0 + lt).toFixed(4);
  HIT.set(sp, st);
  if (sp.kind === 'veg') {
    const run = B.G && B.G.run;
    if (run && !run.versus && run.timeline && run.timeline[sp.id] === sp) { run.me.hits--; run.me.shots = Math.max(0, run.me.shots - 1); }
    return 200 + (sp.pat === 3 && lt < sp.sw ? 100 : 0);
  }
  if (sp.kind !== 'prod') return 0;
  const f = (lt - sp.ra) / Math.max(0.05, sp.span);
  return 100 + (sp.lv === 2 ? 50 : 0) + (f < 1 / 3 ? 50 : 0);
}
function briefing(c) {
  const HINTS = ['SHOOT THEM FAR AWAY FOR +50!', 'ROPE SWINGER MID-SWING: +100!', 'EVERY GRASP SHAKES THE CART!', 'WAVES OF VEGGIES: BE QUICK!'];
  return { rule: [['SHOOT ', 'void'], [c.quota + ' SNACKS', 'red'], [' OR MORE!', 'void']], icon: 'chips', unit: 'SNACKS',
    dont: null, tip: 'VEGGIES IN THE CART THROW SNACKS OUT. SHOOT THEM!', hint: HINTS[clamp(c.tier | 0, 0, 3)] };
}
// briefing card icon: a bag of BLAM! chips (a red pillow bag bulging in the middle, crimped silver ends with a sawtooth
// edge, a yellow starburst with a red B!, chips peeking at the bottom, a coral shine down the left)
function drawIcon(cx, cy, r, t = 0) {
  const H = B.HUD, hw = Math.max(5, Math.round(0.66 * r)), hh = Math.max(8, Math.round(r)), cr = Math.max(1, Math.round(r * 0.13)), bodyH = hh - cr - 1;
  const gs = Math.max(1, Math.floor(r / 9)), G = R.small('B!'), set = new Set(G.px.map(p => p[0] + ',' + p[1])), gw = G.w * gs, gh = 5 * gs;
  const ph = Math.floor(t * 3) & 1;
  const wAt = ay => { if (ay > bodyH) return Math.round(hw * 0.8); const k = ay / bodyH; return Math.round(hw * (0.78 + 0.22 * Math.sqrt(Math.max(0, 1 - k * k * k * k)))); };
  const img = H.pixImg('chips2_' + r + '_' + ph, 2 * hw + 3, 2 * hh + 3, (x, y) => {
    const px = x - hw - 1, py = y - hh - 1, ax = Math.abs(px), ay = Math.abs(py), w = wAt(ay);
    if (ay === hh + 1) return ax <= w + 1 && (px & 1) === 0 ? 'void' : null;          // the crimp's sawtooth edge
    if (ax > w + 1 || ay > hh + 1) return null;
    if (ax === w + 1) return 'void';
    if (ay > bodyH) return (px & 1) ? 'mist' : 'bone';                                 // the crimped ends (silver pleats)
    if (ay === bodyH) return 'crimson';
    const by = py + Math.round(hh * 0.1), bx0 = px + Math.floor(gw / 2), by0 = by + Math.floor(gh / 2);
    if (bx0 >= 0 && by0 >= 0 && bx0 < gw && by0 < gh && set.has(Math.floor(bx0 / gs) + ',' + Math.floor(by0 / gs))) return 'red';
    const ang = Math.atan2(by, px), rb = hw * (0.66 + 0.13 * Math.cos(ang * 8 + ph * 0.4)), d = Math.hypot(px, by);
    if (d < rb) return 'yellow'; if (d < rb + 1.1) return 'orange';
    if (py > bodyH * 0.55 && (Math.hypot(px + hw * 0.38, (py - bodyH * 0.78) * 1.5) < hw * 0.26 || Math.hypot(px - hw * 0.34, (py - bodyH * 0.8) * 1.5) < hw * 0.24)) return 'amber';
    if (px < -w + Math.max(1, Math.round(hw * 0.2))) return 'coral';
    if (px > w - Math.max(1, Math.round(hw * 0.14))) return 'crimson';
    return 'red';
  });
  H.draw(img, cx - hw - 1, cy - hh - 1);
}
// the stage's HUD layer: the RECEIPT printing up out of our register in the finale (drawn on the 426x240 grid so the
// score reads): B.L.A.M. MART, the snacks count, the TOTAL = the round's score, a barcode
function drawHud(run) {
  if (!run || run.stage !== ID || !PARTS) return;
  const ft = finT(run); if (ft < 0) return;
  const f = run.t - ft - RCPT_T; if (f < 0) return;
  const H = B.HUD, k = Math.min(1, f / 1.0);
  PARTS.world.updateMatrixWorld(true);
  _v3.set(SO_X + 0.33, 1.2, SO_Z + RZ - 0.12).applyMatrix4(PARTS.world.matrixWorld);
  const p = scr(_v3.x, _v3.y, _v3.z);
  const W = 54, FULL = 74, h = Math.max(1, Math.round(FULL * E.outCubic(k))), x = Math.round(p[0] - W / 2), y0 = Math.round(p[1]) - h;
  const snacks = run.me.hits;                                   // round 3: the snacks in the cart (shot - thrown out)
  const lines = [['B.L.A.M. MART', 'crimson'], ['- - - - - - -', 'steel'], ['SNACKS  X' + snacks, 'void'], ['- - - - - - -', 'steel'], ['TOTAL', 'void'], [String(run.me.score).padStart(6, '0'), 'red'], ['THANK YOU!', 'blue']];
  const cv = H.pixImg('rcpt' + W + 'x' + FULL + '|' + snacks + '|' + run.me.score, W, FULL, (px, py) => {
    if (px === 0 || px === W - 1) return 'void';
    if (py === 0) return (px & 2) ? 'void' : null;                       // the torn top
    if (py === 1) return (px & 2) ? 'mist' : 'void';
    if (py > FULL - 10 && py < FULL - 3 && px > 6 && px < W - 7) return hash1(px * 13) < 0.5 ? 'void' : 'bone';   // barcode
    return ((py >> 2) & 7) === 3 && (px & 7) === 0 ? 'mist' : 'bone';
  });
  const ctxDraw = (img, sx, sy, sh) => { if (sh > 0) { const g = R.hx; g.drawImage(img, 0, 0, W, sh, sx, sy, W, sh); } };
  ctxDraw(cv, x, y0, h);
  // text lines (printed from the top of the paper down; only the part that has come out shows)
  let ly = y0 + 5;
  for (const [s, c] of lines) {
    if (ly + 5 > y0 + h - 1) break;
    if (ly >= y0 + 2) H.text3c(s, x + W / 2, ly, c, 1);
    ly += s === 'TOTAL' ? 7 : 9;
  }
  if (k >= 1 && ((run.t * 4) | 0) % 2 === 0) H.text3c('TOTAL!', x + W / 2, y0 - 9, 'yellow', 1, 'void');
}
// the miss ricochet colours (core/fx.js reads B.FX.ricochetColors[stageId]): bright paint flecks off shelves and tiles
if (B.FX && B.FX.ricochetColors) B.FX.ricochetColors[ID] = { hot: ['lemon', 'bone', 'yellow', 'orange'], flakes: ['mist', 'haze', 'red', 'cyan'], pop: 'bone', speed: 1.0, grav: 1 };

// =========================================================================================
// SOUNDS (recipes defined here with B.SFXKit.def; nothing appended to sfx-stage.js) + the 'market' ambience bed
// =========================================================================================
{
  const K = B.SFXKit;
  if (K && K.def) {
    const tone = (v, o) => K.tone(v, o), noise = (v, o) => K.noise(v, o);
    const clank = (v, f, at, g, d = 0.2) => K.bell(v, { f, at, d, g, ratios: [1, 2.31, 3.87, 5.12], amps: [1, 0.6, 0.35, 0.2], damp: 1.2 });
    K.def('shelfPop', { max: 3, gap: 0.04, pv: 0.9, dv: 0.1, verb: 0.08, pri: 2, gain: 6.6 },
      v => {                                 // a product pops off its shelf: a cartoon POP, a bag crinkle, a little whoosh up
        tone(v, { f: 760, f2: 240, ft: 0.07, a: 0.002, d: 0.08, g: 0.12 });
        noise(v, { ft: 'bandpass', ff: 3000, q: 1.2, a: 0.002, d: 0.05, g: 0.05 });
        K.grains(v, { n: 7, span: 0.16, at: 0.02, f: [2500, 6000], q: 3, d: [0.004, 0.012], g: [0.02, 0.05] });
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 900, ff2: 2600, fft: 0.25, q: 1.2, at: 0.05, a: 0.03, d: 0.18, g: 0.025 });
        return 0.4;
      });
    K.def('cartClunk', { max: 3, gap: 0.05, pv: 0.6, dv: 0.1, verb: 0.1, pri: 1, gain: 7.0 },
      v => {                                 // it lands in the cart: a wire-basket clank and a soft package thump
        tone(v, { f: 150, f2: 70, ft: 0.06, a: 0.002, d: 0.08, g: 0.1 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 700, a: 0.002, d: 0.07, g: 0.08 });
        clank(v, 920, 0.004, 0.025, 0.22); clank(v, 1370, 0.012, 0.012, 0.16);
        K.grains(v, { n: 4, span: 0.08, at: 0.01, f: [3000, 5200], q: 6, d: [0.004, 0.01], g: [0.015, 0.03] });
        return 0.4;
      });
    K.def('veggieClimb', { max: 2, gap: 0.08, pv: 0.7, dv: 0.1, verb: 0.08, pri: 1, gain: 9.6 },
      v => {                                 // a veggie starts climbing: little scrambling footsteps on the wire, a tiny "hup!"
        for (let k = 0; k < 8; k++) noise(v, { ft: 'bandpass', ff: v.r(1600, 2600), q: 4, at: k * 0.065 + v.r(0, 0.02), a: 0.001, d: 0.018, g: v.r(0.035, 0.06), nd: true });
        for (let k = 0; k < 3; k++) clank(v, v.r(2400, 3200), 0.04 + k * 0.13, 0.006, 0.08);
        tone(v, { type: 'triangle', f: 620, fs: [[0.05, 980]], at: 0.02, a: 0.005, d: 0.06, g: 0.035 });
        return 0.65;
      });
    K.def('veggiePop', { max: 3, gap: 0.04, pv: 0.8, dv: 0.1, verb: 0.08, pri: 2, gain: 12 },
      v => {                                 // a veggie shot: a squelchy crunch, a wet plop, a few bits pattering down
        noise(v, { ft: 'bandpass', ff: 1400, ff2: 500, fft: 0.08, q: 1.5, a: 0.002, d: 0.09, g: 0.12 });
        tone(v, { f: 420, f2: 140, ft: 0.09, a: 0.002, d: 0.1, g: 0.09 });
        K.grains(v, { n: 9, span: 0.12, f: [1800, 4200], q: 3, d: [0.006, 0.02], g: [0.03, 0.06], curve: 1.6 });
        for (let k = 0; k < 4; k++) noise(v, { ft: 'bandpass', ff: v.r(800, 1500), q: 3, at: 0.18 + k * v.r(0.05, 0.09), a: 0.001, d: 0.02, g: 0.02, nd: true });
        return 0.5;
      });
    K.def('veggieIn', { max: 2, gap: 0.08, pv: 0.25, dv: 0.06, verb: 0.15, pri: 4, gain: 4.0 },
      v => {                                 // a veggie dropped in unshot: the THUD (low body, a basket rattle, a squish)
        tone(v, { f: 115, f2: 46, ft: 0.16, a: 0.002, d: 0.26, g: 0.32, drive: 1.4 });
        noise(v, { kind: 'brown', ft: 'lowpass', ff: 600, ff2: 160, fft: 0.2, a: 0.002, d: 0.22, g: 0.26 });
        clank(v, 610, 0.01, 0.03, 0.3); clank(v, 830, 0.03, 0.02, 0.25);
        noise(v, { ft: 'bandpass', ff: 900, q: 2, at: 0.02, a: 0.004, d: 0.08, g: 0.05 });
        return 0.6;
      });
    K.def('scanBeep', { max: 2, gap: 0.05, pv: 0, dv: 0.02, verb: 0.06, pri: 3, gain: 3.7 },
      v => {                                 // the checkout scanner: BEEP (a square wave, the classic register pitch)
        tone(v, { type: 'square', f: 1760 * (1 + 0.004 * ((v.o.n | 0) % 3)), a: 0.003, hold: 0.07, d: 0.03, g: 0.035, lp: 4200, np: true });
        return 0.15;
      });
    K.def('receiptPrint', { max: 1, pv: 0, dv: 0.03, verb: 0.08, pri: 3, gain: 4.9 },
      v => {                                 // the receipt: a dot-matrix printer buzzing in short lines, then a paper tear
        for (let ln = 0; ln < 6; ln++) {
          const at = ln * 0.15;
          for (let k = 0; k < 9; k++) noise(v, { ft: 'bandpass', ff: 2600 + (k % 3) * 400, q: 5, at: at + k * 0.012, a: 0.001, d: 0.008, g: 0.05, nd: true });
          tone(v, { type: 'square', f: 180 + (ln % 2) * 30, at, a: 0.004, hold: 0.09, d: 0.02, g: 0.012, lp: 900, np: true });
        }
        noise(v, { kind: 'pink', ft: 'highpass', ff: 2200, at: 0.95, a: 0.01, d: 0.14, g: 0.05 });
        return 1.2;
      });
    // ---- round 3 ----
    K.def('cartJolt', { max: 3, gap: 0.05, pv: 0.5, dv: 0.12, verb: 0.08, pri: 1, gain: 8.0 },
      v => {                                 // a grasp jolts the cart: a wire clink + a short basket rattle (big: two at once, a knock under it)
        const big = !!(v.o && v.o.big);
        clank(v, v.r(1700, 2300), 0.0, big ? 0.026 : 0.018, 0.12); clank(v, v.r(2600, 3300), 0.008, 0.009, 0.08);
        K.grains(v, { n: big ? 7 : 4, span: big ? 0.11 : 0.07, at: 0.006, f: [2600, 5200], q: 6, d: [0.003, 0.008], g: [0.008, 0.02] });
        if (big) { tone(v, { f: 170, f2: 90, ft: 0.05, a: 0.002, d: 0.06, g: 0.05 }); clank(v, 760, 0.004, 0.014, 0.16); }
        return 0.25;
      });
    K.def('snackOut', { max: 3, gap: 0.05, pv: 0.7, dv: 0.1, verb: 0.08, pri: 2, gain: 6.0 },
      v => {                                 // a veggie flings a snack out of the cart: a bag crinkle, a WHOOSH up and away, a cheeky "hup"
        K.grains(v, { n: 6, span: 0.08, f: [2400, 5600], q: 3, d: [0.004, 0.01], g: [0.02, 0.04] });
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 700, ff2: 2600, fft: 0.22, q: 1.4, at: 0.03, a: 0.05, d: 0.2, g: 0.06 });
        tone(v, { type: 'triangle', f: 520, fs: [[0.06, 760], [0.13, 600]], at: 0.0, a: 0.005, d: 0.08, g: 0.03 });
        return 0.4;
      });
    K.def('swingShot', { max: 2, gap: 0.05, pv: 0, dv: 0.03, verb: 0.12, pri: 3, gain: 3.0 },
      v => {                                 // a rope swinger shot mid-swing: the +100 bonus ding (two bright bell notes up)
        K.bell(v, { f: 1318, at: 0.0, d: 0.25, g: 0.05, ratios: [1, 2.0, 3.01], amps: [1, 0.35, 0.15], damp: 1.4 });
        K.bell(v, { f: 1976, at: 0.08, d: 0.35, g: 0.05, ratios: [1, 2.0, 3.01], amps: [1, 0.35, 0.15], damp: 1.2 });
        return 0.5;
      });
    K.def('waveIn', { max: 1, gap: 0.3, pv: 0.4, dv: 0.06, verb: 0.1, pri: 2, gain: 5.0 },
      v => {                                 // a wave is coming: a scurry of little feet on the tiles + two squeaky "hup! hup!"s
        for (let k = 0; k < 14; k++) noise(v, { ft: 'bandpass', ff: v.r(1300, 2300), q: 4, at: k * 0.035 + v.r(0, 0.012), a: 0.001, d: 0.014, g: v.r(0.02, 0.045) * (0.5 + 0.5 * Math.sin(Math.PI * k / 13)), nd: true });
        tone(v, { type: 'triangle', f: 700, fs: [[0.05, 1050]], at: 0.12, a: 0.005, d: 0.05, g: 0.03 });
        tone(v, { type: 'triangle', f: 780, fs: [[0.05, 1180]], at: 0.3, a: 0.005, d: 0.05, g: 0.03 });
        return 0.6;
      });
    K.def('ropeSwing', { max: 2, gap: 0.1, pv: 0.5, dv: 0.08, verb: 0.12, pri: 2, gain: 3.5 },
      v => {                                 // a rope swinger: a rope creak, a long whoosh down, a tiny "wheee"
        tone(v, { type: 'triangle', f: 380, f2: 330, ft: 0.08, a: 0.004, d: 0.06, g: 0.012, lp: 1500 });
        noise(v, { kind: 'pink', ft: 'bandpass', ff: 500, ff2: 1600, fft: 0.5, q: 1.1, at: 0.05, a: 0.25, d: 0.35, g: 0.05 });
        tone(v, { type: 'triangle', f: 900, fs: [[0.18, 1300], [0.45, 820]], at: 0.08, a: 0.03, hold: 0.25, d: 0.15, g: 0.022 });
        return 0.9;
      });
    K.def('zipLine', { max: 2, gap: 0.1, pv: 0.4, dv: 0.08, verb: 0.1, pri: 2, gain: 6.0 },
      v => {                                 // a zipline rider: a metallic ZZZZIP down the line (a buzzing trolley, a rising whine)
        noise(v, { ft: 'bandpass', ff: 1800, ff2: 3400, fft: 0.6, q: 6, a: 0.03, d: 0.6, g: 0.04 });
        tone(v, { type: 'sawtooth', f: 160, f2: 240, ft: 0.6, a: 0.02, hold: 0.4, d: 0.2, g: 0.012, lp: 1400 });
        return 0.8;
      });
    // the market bed: a freezer compressor hum, the fluorescent tubes' faint buzz, room tone, a far cart's wheels rattling
    // past now and then (a squeaky wheel sometimes). No PA chimes. Hooked into K.beds as 'grocery' (the stage id).
    K.stageBeds = K.stageBeds || {};
    K.stageBeds.market = (ctx, bus) => {
      const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
      out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 2.5); out.connect(bus);
      const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; param.value = base; o.connect(gn).connect(param); o.start(now); srcs.push(o); };
      const loop = (kind, type, f, q, g) => { const s = ctx.createBufferSource(), fl = K.filt(ctx, type, f, q), gn = K.gain(ctx, g); s.buffer = K.noiseBuf(ctx, kind); s.loop = true; s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s); return { f: fl, g: gn }; };
      const hum = K.filt(ctx, 'lowpass', 260, 0.8); hum.connect(out);
      [[50, 0.007], [100, 0.004], [150, 0.0015]].forEach(([f, g]) => { const o = ctx.createOscillator(), gn = K.gain(ctx, g); o.type = 'sawtooth'; o.frequency.value = f; o.connect(gn).connect(hum); o.start(now); srcs.push(o); lfo(0.07 + f * 0.0006, g * 0.25, gn.gain, g); });
      const bz = K.filt(ctx, 'bandpass', 2400, 6); bz.connect(out);
      [[120, 0.003], [240, 0.002]].forEach(([f, g]) => { const o = ctx.createOscillator(), gn = K.gain(ctx, g); o.type = 'square'; o.frequency.value = f; o.connect(gn).connect(bz); o.start(now); srcs.push(o); });
      loop('pink', 'lowpass', 520, 0.7, 0.03);
      const rattle = t => {                  // a far cart rolling past: a burst of wheel ticks, sometimes a squeak
        const n = 10 + Math.floor(Math.random() * 10), rate = 0.045 + Math.random() * 0.02;
        for (let k = 0; k < n; k++) {
          const a = t + k * rate + Math.random() * 0.01, s = ctx.createBufferSource(), fl = K.filt(ctx, 'bandpass', 1500 + Math.random() * 900, 4), gn = ctx.createGain();
          const pk = 0.006 * Math.sin(Math.PI * (k + 0.5) / n);
          gn.gain.setValueAtTime(0, a); gn.gain.linearRampToValueAtTime(pk, a + 0.001); gn.gain.exponentialRampToValueAtTime(0.0001, a + 0.02);
          s.buffer = K.noiseBuf(ctx, 'white'); s.connect(fl).connect(gn).connect(out); s.start(a, Math.random()); s.stop(a + 0.03);
        }
        if (Math.random() < 0.35) { const o = ctx.createOscillator(), og = ctx.createGain(), a = t + n * rate * 0.4; o.type = 'triangle'; o.frequency.setValueAtTime(2100, a); o.frequency.linearRampToValueAtTime(2500, a + 0.12); og.gain.setValueAtTime(0, a); og.gain.linearRampToValueAtTime(0.0025, a + 0.02); og.gain.linearRampToValueAtTime(0, a + 0.14); o.connect(og).connect(out); o.start(a); o.stop(a + 0.16); }
      };
      let stopped = false, next = now + 2;
      return {
        tick(until) { if (stopped) return; if (next < ctx.currentTime - 0.5) next = ctx.currentTime + 1; while (next < until) { try { rattle(next); } catch (e) {} next += 3 + Math.random() * 6; } },
        stop(fade = 1.5) {
          if (stopped) return; stopped = true;
          const t = ctx.currentTime, gp = out.gain;
          gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
          for (const x of srcs) { try { x.stop(t + fade + 0.1); } catch (e) {} }
          setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
        }
      };
    };
    if (K.beds && !K.beds.grocery) K.beds.grocery = K.stageBeds.market;
  }
}
// (no penalty: round 3 costs no life anywhere; the field stays 0 in case anything ever calls penaltyNow here)
B.Stage.register({ id: ID, name: 'GROCERY RUN', short: 'MART', variants: 3, variantNames: VARIANT_NAMES, penalty: 0,
  buildEnv, config, timeline, makeTarget, points, briefing, drawIcon, drawHud,
  TIER_P, PAT_W, PAT, SPOTS, EXIT, RIDE_REF, scr, aimPt, isReq, vegPose, vegSpot, cartSpot, cartState, pileList, joltsOf, HIT, FIN, PILE, PRODUCTS, VEGGIES, KINDS, HEADERS, POSE_K,
  buildArt, setPose, aisleEnd, bayHeader, HOP, MANTLE, DROP_T, THROW_UP, LOOK,
  Z0, XP, LEV, LIP, STK, CX, CZ, RIM, KN, H_MAX, FIN_RIDE, SCAN_T, RCPT_T, NSLOT, parts: () => PARTS });
})(window.BLAM);
