'use strict';
/* =========================================================================================
   B.L.A.M. stages/alley.js -- Stage 2: THE ALLEY (criminals and bystanders).
   Night alley behind the B.L.A.M. DINER. Cardboard-cutout CRIMINALS (dark coat, hat, mask, gun,
   scowl) pop out from behind the dumpsters, the back door, a window and the scooter, or drop down
   the fire escape. BYSTANDERS (the cook, the pizza kid, an old lady with a tiny dog) walk through
   with their hands up. Shoot the crooks, never the bystanders (kind 'bystander' = life -1).
   Higher tiers: the two overlap, swap places, pop in the same spot back to back, a crook peeks out
   from BEHIND a bystander (only his exposed part can be hit), mixed hold times.
   Readability rule (owner): a crook is ALWAYS a crook (dark coat, hat, gun drawn) and a bystander is
   ALWAYS a bystander (bright clothes, hands up). No fake surrenders, no disguises.
   Distractions: two pigeons that flap off (not shootable) + the duck's heckling (engine).
   Everything is a pure function of (seed, tier, variant) and the stage clock (versus-safe).
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets;
const hash1 = n => { let h = (n * 374761393) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hash2 = (x, y) => hash1((x * 73856093) ^ (y * 19349663));

// ---------- toon material for the cutout figures (exact palette tones, NO gloss) ----------
// Each colour gets [shadow, lit] partners (the same ramp as guns.js / duck.js). Tone by n.L in view space:
// top + left faces lit, front faces their base colour, right + bottom faces shadow. 'ink' = the void outline.
const RAMP = {
  void: ['void', 'midnight'], midnight: ['void', 'navy'], navy: ['midnight', 'slate'], slate: ['navy', 'steel'], steel: ['slate', 'haze'],
  haze: ['steel', 'mist'], mist: ['haze', 'bone'], bone: ['mist', 'bone'], indigo: ['midnight', 'plum'], umber: ['void', 'walnut'],
  walnut: ['umber', 'chestnut'], chestnut: ['walnut', 'tan'], tan: ['chestnut', 'sand'], sand: ['tan', 'lemon'],
  oxblood: ['umber', 'crimson'], crimson: ['oxblood', 'red'], red: ['crimson', 'coral'], coral: ['red', 'bubblegum'],
  plum: ['oxblood', 'magenta'], magenta: ['plum', 'pink'], pink: ['magenta', 'bubblegum'], bubblegum: ['pink', 'bone'],
  rust: ['oxblood', 'orange'], orange: ['rust', 'amber'], amber: ['orange', 'yellow'], yellow: ['amber', 'lemon'], lemon: ['yellow', 'bone'],
  deepblue: ['midnight', 'blue'], blue: ['deepblue', 'cyan'], cyan: ['blue', 'ice'], ice: ['cyan', 'bone'],
  forest: ['void', 'green'], green: ['forest', 'lime'], lime: ['green', 'lemon'], ink: ['void', 'void']
};
const hexOf = n => PAL[n === 'ink' ? 'void' : n];
const rgbOf = n => { const h = hexOf(n); return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; };
const TOON_VS = `
attribute vec3 cB; attribute vec3 cL; attribute vec3 cH;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vN;
#include <fog_pars_vertex>
void main() {
  vB = cB; vL = cL; vH = cH; vN = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TOON_FS = `
uniform vec3 uLight; uniform float uHi; uniform float uLo;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vN;
#include <fog_pars_fragment>
void main() {
  float d = dot(normalize(vN), uLight);
  gl_FragColor = vec4(d > uHi ? vH : (d > uLo ? vB : vL), 1.0);
  #include <fog_fragment>
}`;
let TOON = null;
function toonMat() {
  if (TOON) return TOON;
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uLight: { value: new THREE.Vector3(-0.62, 0.62, 0.48).normalize() }, uHi: { value: 0.55 }, uLo: { value: 0.1 } }]);
  TOON = new THREE.ShaderMaterial({ uniforms: u, vertexShader: TOON_VS, fragmentShader: TOON_FS, fog: true });
  return TOON;
}
const FACES = [
  [1,0,0, [1,-1,1, 1,-1,-1, 1,1,-1, 1,1,1]], [-1,0,0, [-1,-1,-1, -1,-1,1, -1,1,1, -1,1,-1]],
  [0,1,0, [-1,1,1, 1,1,1, 1,1,-1, -1,1,-1]], [0,-1,0, [-1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,1]],
  [0,0,1, [-1,-1,1, 1,-1,1, 1,1,1, -1,1,1]], [0,0,-1, [1,-1,-1, -1,-1,-1, -1,1,-1, 1,1,-1]]];
// voxel list [[i, j, k, hex, name]...] -> one BufferGeometry with toon colour attributes (inner faces culled)
function toonGeo(list, s, ox = 0, oy = 0, oz = 0) {
  const S = new Set(list.map(v => v[0] + ',' + v[1] + ',' + v[2]));
  const P = [], N = [], CB = [], CL = [], CH = [], I = [], cache = {}; let vc = 0;
  for (const v of list) {
    const [i, j, k] = v, name = v[4];
    const C = cache[name] || (cache[name] = [rgbOf(name), rgbOf((RAMP[name] || [name])[0]), rgbOf((RAMP[name] || [name, name])[1])]);
    const x = ox + i * s, y = oy + j * s, z = oz + k * s, h = s / 2;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f]; if (S.has((i + F[0]) + ',' + (j + F[1]) + ',' + (k + F[2]))) continue;
      const q = F[3];
      for (let n = 0; n < 12; n += 3) {
        P.push(x + q[n] * h, y + q[n + 1] * h, z + q[n + 2] * h); N.push(F[0], F[1], F[2]);
        CB.push(C[0][0], C[0][1], C[0][2]); CL.push(C[1][0], C[1][1], C[1][2]); CH.push(C[2][0], C[2][1], C[2][2]);
      }
      I.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3); vc += 4;
    }
  }
  const g = new THREE.BufferGeometry(), A = (a, n) => new THREE.Float32BufferAttribute(a, n);
  g.setAttribute('position', A(P, 3)); g.setAttribute('normal', A(N, 3));
  g.setAttribute('cB', A(CB, 3)); g.setAttribute('cL', A(CL, 3)); g.setAttribute('cH', A(CH, 3));
  g.setIndex(I); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// ---------- 2D painter -> volumetric cutout ----------
// A figure is painted on a grid (y up) as colour + front depth per cell; it is extruded from k = -1 (back)
// to k = depth (front), so heads, noses, brims and guns stand out of the board. A one-voxel ink ring around
// the silhouette (at the back layer) is the outline.
class Paint {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); this.d = new Array(w * h).fill(0); }
  set(x, y, c, d) {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = y * this.w + x; this.c[i] = c; if (d != null) this.d[i] = d; return this;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.c[y * this.w + x]; }
  rect(x0, y0, x1, y1, c, d) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c, d); return this; }
  // colour only (keeps depth) where something is already painted
  tint(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.get(x, y)) this.c[y * this.w + x] = c; return this; }
  ell(cx, cy, rx, ry, c, d, bulge = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (q <= 1) this.set(x, y, c, d + Math.round(bulge * Math.sqrt(1 - q)));
    }
    return this;
  }
  px(list, c, d) { for (const [x, y] of list) this.set(x, y, c, d); return this; }
  // -> { list, ox, w, h } (list for toonGeo + Target.part; ox centres the board on x = 0, feet at y = 0)
  voxels(s) {
    const list = [], w = this.w, h = this.h;
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
      const c = this.get(x, y);
      if (c) { for (let k = -1; k <= this.d[y * w + x]; k++) list.push([x, y, k, hexOf(c), c]); continue; }
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (this.get(x + dx, y + dy)) { edge = true; break; }
      if (edge && y >= 0) list.push([x, y, -1, PAL.void, 'ink']);
    }
    return { list, ox: -(w - 1) / 2 * s, oy: s / 2, w: w * s, h: h * s };
  }
}

// ---------- the cast (34 x 54 cells, comedic proportions: the head is ~45 % of the figure) ----------
const FS = 0.047, FW = 34, FH = 54, CX = 17;
function headAt(p, cy, skin = 'sand') {
  p.ell(7.6, cy, 1.6, 2.2, skin, 1).ell(26.4, cy, 1.6, 2.2, skin, 1);           // ears
  p.ell(CX, cy, 9.5, 8.5, skin, 1, 2.2);                                          // big round head, bulging forward
}
function armsUp(p, col, cuff, top = 38) {                                         // both hands up (bystanders only)
  p.rect(4, 24, 7, top, col, 1).rect(27, 24, 30, top, col, 1).rect(7, 22, 9, 26, col, 1).rect(25, 22, 27, 26, col, 1);
  if (cuff) p.rect(4, top, 7, top, cuff, 1).rect(27, top, 30, top, cuff, 1);
  p.ell(5.5, top + 2.5, 2.1, 2.2, 'sand', 2).ell(28.5, top + 2.5, 2.1, 2.2, 'sand', 2);
  p.px([[4, top + 4], [6, top + 5], [27, top + 5], [29, top + 4]], 'sand', 2);  // fingers
}
// CRIMINAL: dark coat, hat, domino mask, angry brows, gritted teeth, stubble, revolver drawn
function crook(look) {
  const p = new Paint(FW, FH), fed = look === 'fedora', coat = fed ? 'navy' : 'slate', trim = fed ? 'midnight' : 'navy';
  p.rect(9, 0, 14, 1, 'void', 2).rect(20, 0, 25, 1, 'void', 2);                  // shoes
  p.rect(11, 2, 14, 8, 'midnight', 1).rect(20, 2, 23, 8, 'midnight', 1);          // trousers
  if (fed) {                                                                      // long trench coat
    p.rect(9, 8, 25, 26, coat, 1).rect(8, 7, 26, 12, coat, 1).rect(17, 7, 17, 11, trim, 1);
    for (let y = 19; y <= 26; y++) { const w = Math.floor((y - 18) / 1.5); p.rect(17 - w, y, 17 + w, y, 'bone', 1).set(16 - w, y, 'steel', 2).set(18 + w, y, 'steel', 2); }
    p.rect(16, 18, 18, 23, 'red', 2).rect(16, 24, 18, 25, 'crimson', 2);         // tie
    p.rect(9, 15, 25, 16, trim, 2).rect(16, 15, 18, 16, 'amber', 2);              // belt + buckle
    p.px([[12, 10], [22, 10], [12, 13], [22, 13]], 'void', 2);
  } else {                                                                        // short jacket, striped shirt, bandana
    p.rect(9, 9, 25, 26, coat, 1).rect(9, 9, 25, 10, trim, 1);
    for (let y = 11; y <= 23; y++) p.rect(14, y, 20, y, y % 3 === 0 ? 'void' : 'haze', 1);
    p.rect(11, 24, 23, 27, 'crimson', 2).rect(16, 20, 18, 23, 'crimson', 2);
  }
  {
    p.rect(5, 13, 8, 25, coat, 1).rect(5, 13, 8, 13, trim, 1).ell(6.5, 11, 2.1, 2, 'sand', 2);   // left arm down, fist
    p.rect(24, 19, 27, 24, coat, 1).rect(27, 19, 27, 24, trim, 1).rect(28, 19, 29, 23, 'sand', 2);   // gun arm out
    p.rect(27, 24, 30, 27, 'steel', 3).rect(28, 27, 29, 27, 'haze', 3).rect(31, 24, 33, 26, 'steel', 3).rect(31, 26, 33, 26, 'mist', 3).set(33, 25, 'void', 3);   // revolver
    p.set(26, 26, 'void', 3).set(33, 26, 'void', 3).set(30, 22, 'void', 3);
  }
  if (fed) p.rect(10, 25, 24, 27, coat, 2).set(10, 27, 'slate', 2).set(24, 27, 'slate', 2);   // turned-up collar
  const hy = 35; headAt(p, hy);
  for (let x = 10; x <= 24; x++) for (let y = 27; y <= 30; y++) if (hash2(x, y) > 0.58) p.tint(x, y, x, y, 'tan');   // stubble
  p.tint(8, 34, 26, 36, 'void');                                                  // domino mask
  p.tint(11, 34, 13, 35, 'bone').tint(21, 34, 23, 35, 'bone').tint(12, 34, 12, 35, 'void').tint(22, 34, 22, 35, 'void');
  const brow = [[9, 40], [10, 40], [11, 39], [12, 39], [13, 38], [14, 38]];
  p.px(brow, 'void', 3).px(brow.map(([x, y]) => [x, y - 1]), 'void', 3);
  p.px(brow.map(([x, y]) => [34 - x, y]), 'void', 3).px(brow.map(([x, y]) => [34 - x, y - 1]), 'void', 3);
  p.ell(CX, 31.5, 2.3, 1.7, 'tan', 4);                                            // nose
  p.rect(12, 27, 22, 29, 'void', 3).rect(13, 28, 21, 28, 'bone', 3);             // gritted teeth
  p.set(11, 26, 'void', 3).set(23, 26, 'void', 3);                               // mouth corners down
  if (!fed) p.set(19, 28, 'yellow', 3);                                          // gold tooth
  if (fed) {                                                                      // fedora, worn low
    p.rect(9, 44, 25, 50, 'midnight', 2).rect(9, 44, 25, 45, 'crimson', 3).rect(5, 42, 29, 43, 'midnight', 4);
    p.set(9, 50, null).set(25, 50, null).set(17, 50, null).set(16, 50, 'void', 2).set(18, 50, 'void', 2);
  } else {                                                                        // beanie
    p.ell(CX, 45, 9.5, 5.5, 'void', 2, 1).rect(7, 41, 27, 43, 'navy', 3).rect(7, 43, 27, 43, 'slate', 3);
  }
  return p;
}
// THE COOK: whites, check trousers, tall toque, spatula, handlebar moustache
function cook() {
  const p = new Paint(FW, FH);
  p.rect(9, 0, 14, 1, 'mist', 2).rect(20, 0, 25, 1, 'mist', 2);
  for (let y = 2; y <= 9; y++) for (const x0 of [10, 20]) for (let x = x0; x < x0 + 5; x++) p.set(x, y, (x + y) % 2 ? 'bone' : 'slate', 1);
  p.rect(9, 9, 25, 26, 'bone', 1).rect(10, 6, 24, 17, 'mist', 2).rect(10, 17, 24, 17, 'haze', 2);   // jacket + apron
  p.px([[14, 20], [20, 20], [14, 23], [20, 23]], 'haze', 2);
  armsUp(p, 'bone', 'mist');
  p.rect(28, 42, 28, 46, 'walnut', 3).rect(26, 47, 30, 50, 'steel', 3).rect(26, 50, 30, 50, 'haze', 3);   // spatula
  p.rect(12, 24, 22, 27, 'red', 2).rect(16, 21, 18, 23, 'red', 2);              // neckerchief
  headAt(p, 34);
  p.tint(11, 33, 13, 36, 'bone').tint(21, 33, 23, 36, 'bone').tint(12, 34, 12, 35, 'void').tint(22, 34, 22, 35, 'void');   // wide eyes
  p.px([[10, 38], [11, 39], [12, 39], [13, 39]], 'walnut', 3).px([[21, 39], [22, 39], [23, 39], [24, 38]], 'walnut', 3);
  p.tint(9, 30, 10, 31, 'coral').tint(24, 30, 25, 31, 'coral');
  p.ell(CX, 31.5, 2.2, 1.8, 'tan', 4);
  p.rect(11, 28, 23, 29, 'walnut', 4).px([[10, 29], [9, 30], [24, 29], [25, 30]], 'walnut', 4);   // moustache
  p.rect(16, 25, 18, 27, 'void', 3).set(17, 26, 'oxblood', 3);                  // "oh!"
  p.rect(9, 41, 25, 44, 'mist', 2).ell(CX, 48, 9, 4.8, 'bone', 2, 1.4);          // toque
  return p;
}
// THE PIZZA KID: sideways cap, yellow jacket, a pizza box held up high
function kid() {
  const p = new Paint(FW, FH);
  p.rect(10, 0, 14, 1, 'bone', 2).rect(20, 0, 24, 1, 'bone', 2).rect(10, 1, 14, 1, 'red', 2).rect(20, 1, 24, 1, 'red', 2);
  p.rect(11, 2, 14, 10, 'blue', 1).rect(20, 2, 23, 10, 'blue', 1);
  p.rect(9, 10, 25, 25, 'amber', 1).rect(9, 18, 25, 19, 'red', 2).rect(17, 10, 17, 17, 'orange', 2);
  armsUp(p, 'amber', 'red', 37);
  p.rect(1, 43, 33, 46, 'sand', 2).rect(1, 43, 33, 43, 'tan', 2).rect(1, 46, 33, 46, 'lemon', 2).ell(CX, 44.6, 2.6, 1.2, 'red', 3);   // pizza box
  headAt(p, 32);
  p.tint(11, 31, 13, 34, 'bone').tint(21, 31, 23, 34, 'bone').tint(12, 32, 12, 33, 'void').tint(22, 32, 22, 33, 'void');
  for (const [x, y] of [[10, 29], [12, 28], [22, 28], [24, 29], [11, 27], [23, 27]]) p.tint(x, y, x, y, 'tan');   // freckles
  p.ell(CX, 29.5, 1.8, 1.4, 'tan', 4);
  p.rect(14, 24, 20, 27, 'void', 3).rect(15, 24, 19, 25, 'red', 3).rect(15, 27, 19, 27, 'bone', 3);   // "aah!"
  p.rect(9, 38, 25, 40, 'red', 2).ell(CX, 40.5, 8, 2, 'red', 2).rect(2, 38, 10, 39, 'crimson', 4).rect(15, 40, 19, 41, 'bone', 3);   // cap
  return p;
}
// THE OLD LADY: lilac curls + bun, cat-eye glasses, pink coat, pearls, handbag (+ a tiny dog, its own mesh)
function lady() {
  const p = new Paint(FW, FH);
  p.rect(11, 0, 14, 1, 'oxblood', 2).rect(20, 0, 23, 1, 'oxblood', 2).rect(12, 2, 13, 6, 'tan', 1).rect(21, 2, 22, 6, 'tan', 1);
  p.rect(9, 6, 25, 13, 'plum', 1).rect(9, 12, 25, 26, 'pink', 1).rect(11, 24, 23, 27, 'bubblegum', 2);
  p.px([[17, 15], [17, 18], [17, 21]], 'magenta', 2);
  armsUp(p, 'pink', 'bubblegum', 36);
  p.rect(29, 31, 33, 35, 'crimson', 2).rect(29, 35, 33, 35, 'red', 2).px([[29, 36], [30, 37], [31, 38]], 'void', 2);   // handbag
  headAt(p, 33);
  p.ell(CX, 40, 10.5, 4.4, 'mist', 2, 1).ell(7.6, 35.5, 2.4, 3, 'mist', 2).ell(26.4, 35.5, 2.4, 3, 'mist', 2).ell(CX, 46, 4, 3, 'haze', 2, 1);   // curls + bun
  p.rect(9, 30, 15, 34, 'void', 4).rect(19, 30, 25, 34, 'void', 4).rect(15, 32, 19, 32, 'void', 4);   // cat-eye glasses
  p.rect(10, 31, 14, 33, 'ice', 4).rect(20, 31, 24, 33, 'ice', 4).rect(12, 31, 12, 32, 'void', 4).rect(22, 31, 22, 32, 'void', 4);
  p.set(8, 35, 'void', 4).set(26, 35, 'void', 4);
  p.tint(9, 27, 10, 28, 'coral').tint(24, 27, 25, 28, 'coral');
  p.ell(CX, 29, 1.5, 1.2, 'tan', 4).rect(16, 25, 18, 26, 'oxblood', 3);
  p.px([[12, 25], [14, 24], [16, 24], [18, 24], [20, 24], [22, 25]], 'bone', 3);   // pearls
  return p;
}
function dog() {
  const p = new Paint(16, 11);
  p.ell(7.5, 4.5, 5, 2.4, 'bone', 1, 1).ell(12.5, 7, 2.8, 2.5, 'bone', 1, 1);
  p.px([[11, 10], [11, 9], [14, 10], [14, 9]], 'tan', 2).set(13, 7, 'void', 3).set(15, 6, 'void', 3).rect(10, 4, 10, 7, 'red', 2);
  p.rect(4, 0, 4, 2, 'bone', 1).rect(6, 0, 6, 2, 'bone', 1).rect(9, 0, 9, 2, 'bone', 1).rect(11, 0, 11, 2, 'bone', 1);
  p.px([[2, 6], [1, 7], [1, 8]], 'bone', 1);
  return p;
}
let CH = null;
function chars() {
  if (CH) return CH;
  const mk = p => { const v = p.voxels(FS); v.geo = toonGeo(v.list, FS, v.ox, v.oy, 0); return v; };
  CH = { fedora: mk(crook('fedora')), beanie: mk(crook('beanie')), cook: mk(cook()), kid: mk(kid()), lady: mk(lady()), dog: mk(dog()) };
  return CH;
}

// ---------- pigeon (distraction, never shootable): sit / wings up / wings down ----------
let PG = null;
function pigeonGeos() {
  if (PG) return PG;
  const s = 0.034, body = [];
  for (let i = -7; i <= 7; i++) for (let j = -4; j <= 9; j++) for (let k = -3; k <= 3; k++) {
    const b = (i / 5) ** 2 + ((j - 0.5) / 3.2) ** 2 + (k / 3) ** 2, h = ((i - 4.5) / 2.3) ** 2 + ((j - 5) / 2.3) ** 2 + (k / 2.2) ** 2;
    if (b <= 1) body.push([i, j, k, j < -0.5 ? PAL.haze : PAL.slate]);
    else if (h <= 1) body.push([i, j, k, j < 4 && Math.abs(k) >= 1 ? ((i + j) % 2 ? PAL.cyan : PAL.lime) : PAL.steel]);
  }
  body.push([7, 5, 0, PAL.tan], [8, 5, 0, PAL.tan], [5, 6, 2, PAL.orange], [5, 6, -2, PAL.orange], [6, 6, 2, PAL.void], [6, 6, -2, PAL.void]);
  for (let i = -9; i <= -5; i++) body.push([i, 1, 0, PAL.navy], [i, 1, 1, PAL.navy], [i, 1, -1, PAL.navy]);
  body.push([0, -4, 1, PAL.coral], [0, -5, 1, PAL.coral], [1, -5, 1, PAL.coral], [0, -4, -1, PAL.coral], [0, -5, -1, PAL.coral], [1, -5, -1, PAL.coral]);
  const wing = lift => {                                     // lift: 0 folded, 1 up, -1 down
    const L = body.slice();
    for (const sg of [-1, 1]) for (let i = -4; i <= 3; i++) for (let w = 1; w <= 5; w++) {
      if (lift === 0 && w > 1) break;
      const j = lift > 0 ? 2 + w : lift < 0 ? 2 - w : 2, k = lift === 0 ? sg * 4 : sg * (3 + (w >> 1));
      L.push([i, j, k, w > 3 ? PAL.navy : PAL.steel]);
    }
    return new Vox().vox(L, s).geo();
  };
  PG = { sit: wing(0), up: wing(1), down: wing(-1) };
  return PG;
}

// =========================================================================================
// The set: back wall of the diner (brick, back door, a lit window, fire escape, neon sign),
// two dumpsters, a delivery scooter, trash bags, milk crates, a steam grate, puddles.
// Static: one baked env mesh, one props mesh (object dither class), one glow mesh,
// two tiny flicker meshes (the buzzing letters), two perched pigeons.
// =========================================================================================
const WALL_Z = -6.5, WALL_T = 0.3, WALL_H = 6.8;
const DOOR = [1.4, 2.8, 0, 2.9], WIN = [4.0, 5.4, 2.9, 4.6], FEWIN = [-5.35, -3.85, 3.3, 4.8];
const WALL_RECTS = [[-7, 1.4, 0, WALL_H], [2.8, 4.0, 0, WALL_H], [5.4, 7, 0, WALL_H], [1.4, 2.8, 2.9, WALL_H], [4.0, 5.4, 0, 2.9], [4.0, 5.4, 4.6, WALL_H]];
const DUMP_L = { cx: -4.1, cz: -4.85, w: 2.2, d: 1.1 }, DUMP_R = { cx: 4.7, cz: -4.45, w: 2.2, d: 1.1 };
const FE = { x0: -6.4, x1: -2.4, y: 2.8, z0: WALL_Z, z1: -5.35 };
const PERCH = [[-2.85, 3.98, -5.37, 0.5], [5.25, 1.42, -4.35, -0.6]];   // x, y (feet), z, yaw
const OCC = [];                                   // world boxes that stop bullets (see occRaycast)
const occ = (x0, y0, z0, x1, y1, z1) => OCC.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
let ENV_BIRDS = [];

function bakeLight(x, y, z) {
  let L = 0.5 + 0.05 * y / 6;                                                                       // night + a little moonlight up high
  L += 0.8 * Math.exp(-((x - 2.1) ** 2 * 0.09 + (y - 3.3) ** 2 * 0.05 + (z + 6.3) ** 2 * 0.05));   // lamp over the back door
  L += 0.35 * Math.exp(-((x + 0.1) ** 2 * 0.07 + (y - 4.6) ** 2 * 0.1 + (z + 6.3) ** 2 * 0.08));   // neon sign
  L += 0.3 * Math.exp(-((x - 4.7) ** 2 * 0.25 + (y - 3.7) ** 2 * 0.2 + (z + 6.4) ** 2 * 0.2));     // kitchen window
  L += 0.22 * Math.exp(-((x + 4.6) ** 2 * 0.25 + (y - 4.0) ** 2 * 0.2 + (z + 6.4) ** 2 * 0.2));    // fire-escape window
  L += 0.2 * Math.exp(-((x - 3) ** 2 * 0.02 + (z - 2) ** 2 * 0.04));                                // street spill at the open end
  return Math.min(L, 1.3);
}
// coloured spill added to the baked vertex colours: pink + cyan under the neon, warm under the door lamp
function spill(geo) {
  const p = geo.attributes.position, c = geo.attributes.color;
  const pk = new THREE.Color(PAL.pink), cy = new THREE.Color(PAL.cyan), am = new THREE.Color(PAL.amber);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), dz = (z + 6.3) ** 2;
    const wp = 0.42 * Math.exp(-((x + 0.1) ** 2 * 0.1 + (y - 5.0) ** 2 * 0.3 + dz * 0.25));
    const wc = 0.32 * Math.exp(-((x + 0.1) ** 2 * 0.1 + (y - 3.9) ** 2 * 0.3 + dz * 0.25)) + 0.12 * Math.exp(-((x + 0.1) ** 2 * 0.12 + y * y * 2 + (z + 5) ** 2 * 0.3));
    const wa = 0.18 * Math.exp(-((x - 2.1) ** 2 * 0.15 + (y - 2.5) ** 2 * 0.1 + dz * 0.08));
    c.setXYZ(i, c.getX(i) + pk.r * wp + cy.r * wc + am.r * wa, c.getY(i) + pk.g * wp + cy.g * wc + am.g * wa, c.getZ(i) + pk.b * wp + cy.b * wc + am.b * wa);
  }
  return geo;
}
const brickCol = h => h < 0.55 ? PAL.crimson : h < 0.85 ? PAL.oxblood : h < 0.95 ? PAL.rust : PAL.chestnut;
function dumpster(V, D, label) {
  const x0 = D.cx - D.w / 2, x1 = D.cx + D.w / 2, z0 = D.cz - D.d / 2, z1 = D.cz + D.d / 2;
  V.bx(x0, 0.16, z0, x1, 1.3, z1, PAL.forest);
  for (const y of [0.42, 0.78]) V.bx(x0 - 0.03, y, z1, x1 + 0.03, y + 0.08, z1 + 0.04, PAL.green);   // ribs
  for (const x of [x0 + 0.08, x1 - 0.14]) V.bx(x, 0.16, z1, x + 0.06, 1.3, z1 + 0.05, PAL.green);
  V.bx(x0 - 0.06, 1.3, z0 - 0.04, x1 + 0.06, 1.42, z1 + 0.1, PAL.green);                            // lid
  V.bx(x0 - 0.1, 1.0, z0 + 0.15, x0, 1.1, z1 - 0.15, PAL.slate); V.bx(x1, 1.0, z0 + 0.15, x1 + 0.1, 1.1, z1 - 0.15, PAL.slate);
  for (const x of [x0 + 0.15, x1 - 0.35]) V.bx(x, 0, z1 - 0.3, x + 0.2, 0.18, z1 - 0.08, PAL.void);   // wheels
  const t = R.small(label), s = 0.06, lx = D.cx - t.w * s / 2;
  for (const [px, py] of t.px) V.bx(lx + px * s, 1.2 - (py + 1) * s, z1 + 0.04, lx + (px + 1) * s, 1.2 - py * s, z1 + 0.07, PAL.mist);
  occ(x0 - 0.1, 0.1, z0 - 0.04, x1 + 0.1, 1.42, z1 + 0.1);
}
function bag(V, cx, cy, cz, r, seed) {           // black bin bag: a squashed voxel ball + knot
  const s = 0.08, L = [], n = Math.ceil(r / s) + 1;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) {
    if ((i * i + (j * 1.25) ** 2 + k * k) * s * s > r * r || cy + j * s < 0) continue;
    L.push([i, j, k, (i + j < -n * 0.5 && k > 0) ? PAL.slate : hash1(seed + i * 7 + j * 131 + k * 17) > 0.8 ? PAL.navy : PAL.midnight]);
  }
  const top = Math.floor(r / s / 1.25); L.push([0, top + 1, 0, PAL.void], [1, top + 2, 0, PAL.void], [-1, top + 2, 0, PAL.void]);
  V.vox(L, s, cx, cy, cz);
}
function buildEnv() {
  chars(); const PGs = pigeonGeos();
  OCC.length = 0;
  const group = new THREE.Group();
  const room = new Vox(); room.bake = bakeLight;
  const props = new Vox(); props.bake = bakeLight;
  const glow = new Vox(), flick = [new Vox(), new Vox()];
  // ---- floor: wet asphalt, cracks, a gutter, NO PARKING hatch in front of the door
  for (let x = -12; x < 12; x++) for (let z = -8; z < 5; z++) room.bx(x, -0.2, z, x + 1, 0, z + 1, PAL.navy, null, 4);
  for (let k = 0; k < 28; k++) { const x = -6.5 + hash1(k) * 13, z = -6.2 + hash1(k + 99) * 7.8, w = 0.2 + hash1(k + 7) * 0.6; room.bx(x, 0, z, x + w, 0.006, z + 0.05, PAL.midnight, null, 4); }
  room.bx(-0.18, 0, -6.4, 0.18, 0.005, 5, PAL.midnight, null, 4);
  for (let i = 0; i < 5; i++) room.bx(DOOR[0] - 0.05 + i * 0.32, 0, -6.4, DOOR[0] + 0.1 + i * 0.32, 0.007, -5.75, PAL.yellow, null, 4);
  room.bx(DOOR[0] - 0.2, 0, -5.78, DOOR[1] + 0.2, 0.008, -5.7, PAL.yellow, null, 4);
  occ(-14, -1, -9, 14, 0, 6);
  // ---- back wall: mortar backing + raised bricks (openings: door, kitchen window; a lit pane behind the fire escape)
  for (const [x0, x1, y0, y1] of WALL_RECTS) {
    for (let x = x0; x < x1 - 1e-6; x += 1) for (let y = y0; y < y1 - 1e-6; y += 1)
      room.bx(x, y, WALL_Z - WALL_T, Math.min(x + 1, x1), Math.min(y + 1, y1), WALL_Z, PAL.umber, null, 16);
    occ(x0, y0, WALL_Z - WALL_T, x1, y1, WALL_Z);
  }
  const skip = (x0, x1, y0, y1) => x1 > FEWIN[0] - 0.1 && x0 < FEWIN[1] + 0.1 && y1 > FEWIN[2] - 0.1 && y0 < FEWIN[3] + 0.1;
  for (let r = 0; r * 0.25 < 6.4; r++) {
    const y = r * 0.25; if (y < 0.35) continue;
    for (let bx = -7 - (r % 2) * 0.25; bx < 7; bx += 0.5) for (const [x0, x1, y0, y1] of WALL_RECTS) {
      const a = Math.max(bx, x0), b = Math.min(bx + 0.5, x1), c = Math.max(y, y0), d = Math.min(y + 0.25, y1);
      if (b - a < 0.08 || d - c < 0.08 || skip(a, b, c, d)) continue;
      room.bx(a + 0.02, c + 0.02, WALL_Z, b - 0.02, d - 0.02, WALL_Z + 0.035, brickCol(hash2(r, Math.round(bx * 2))), null, 31);
    }
  }
  room.bx(-7, 0, WALL_Z, DOOR[0], 0.35, WALL_Z + 0.06, PAL.slate, null, 31); room.bx(DOOR[1], 0, WALL_Z, 7, 0.35, WALL_Z + 0.06, PAL.slate, null, 31);
  // ---- back door: open, a warm kitchen inside, steel frame, a step, the door leaf swung out, a caged lamp
  {
    const [x0, x1, , y1] = DOOR, IZ = -7.7;
    room.bx(x0 - 0.05, 0, IZ, x0, y1, WALL_Z, PAL.slate, null, 1); room.bx(x1, 0, IZ, x1 + 0.05, y1, WALL_Z, PAL.slate, null, 2);
    room.bx(x0, y1, IZ, x1, y1 + 0.05, WALL_Z, PAL.navy, null, 8);
    glow.bx(x0, 0, IZ - 0.05, x1, 1.45, IZ, PAL.amber); glow.bx(x0, 1.45, IZ - 0.05, x1, y1, IZ, PAL.sand);
    for (let y = 1.75; y < y1; y += 0.3) glow.bx(x0, y, IZ, x1, y + 0.025, IZ + 0.01, PAL.tan);
    room.bx(x0, 1.42, IZ, x1, 1.5, IZ + 0.3, PAL.walnut);                                            // shelf + pots
    for (const [px, w, h] of [[1.55, 0.3, 0.22], [2.0, 0.22, 0.3], [2.35, 0.3, 0.18]]) room.bx(px, 1.5, IZ + 0.04, px + w, 1.5 + h, IZ + 0.24, PAL.slate);
    props.bx(x0 - 0.14, 0, WALL_Z, x0, y1 + 0.14, WALL_Z + 0.1, PAL.steel); props.bx(x1, 0, WALL_Z, x1 + 0.14, y1 + 0.14, WALL_Z + 0.1, PAL.steel);
    props.bx(x0 - 0.14, y1, WALL_Z, x1 + 0.14, y1 + 0.14, WALL_Z + 0.1, PAL.steel);
    props.bx(x0 - 0.2, 0, WALL_Z, x1 + 0.2, 0.12, WALL_Z + 0.35, PAL.slate); occ(x0 - 0.2, 0, WALL_Z, x1 + 0.2, 0.12, WALL_Z + 0.35);
    props.bx(x1 + 0.04, 0.02, WALL_Z + 0.02, x1 + 0.12, y1 - 0.04, WALL_Z + 1.36, PAL.deepblue);      // door leaf (open)
    props.bx(x1 + 0.02, 0.35, WALL_Z + 0.2, x1 + 0.04, 1.3, WALL_Z + 1.16, PAL.blue, null, 2);
    props.bx(x1 + 0.02, 1.5, WALL_Z + 0.2, x1 + 0.04, 2.6, WALL_Z + 1.16, PAL.blue, null, 2);
    props.bx(x1 - 0.02, 1.3, WALL_Z + 1.1, x1 + 0.04, 1.4, WALL_Z + 1.25, PAL.haze);
    occ(x1 + 0.02, 0, WALL_Z, x1 + 0.12, y1, WALL_Z + 1.36);
    props.bx(1.95, 3.2, WALL_Z, 2.25, 3.27, WALL_Z + 0.3, PAL.slate); props.bx(1.88, 3.27, WALL_Z + 0.1, 2.32, 3.4, WALL_Z + 0.42, PAL.slate);
    glow.bx(2.0, 3.12, WALL_Z + 0.18, 2.2, 3.27, WALL_Z + 0.34, PAL.lemon);
  }
  // ---- kitchen window (a crook can pop up in it): sill, frame, warm room, blinds
  {
    const [x0, x1, y0, y1] = WIN, IZ = -7.5;
    room.bx(x0 - 0.05, y0, IZ, x0, y1, WALL_Z, PAL.slate, null, 1); room.bx(x1, y0, IZ, x1 + 0.05, y1, WALL_Z, PAL.slate, null, 2);
    room.bx(x0, y1, IZ, x1, y1 + 0.05, WALL_Z, PAL.navy, null, 8); room.bx(x0, y0 - 0.05, IZ, x1, y0, WALL_Z, PAL.slate, null, 4);
    glow.bx(x0, y0, IZ - 0.05, x1, y1, IZ, PAL.amber);
    for (let y = y1 - 0.55; y < y1 - 0.02; y += 0.1) glow.bx(x0, y, IZ + 0.04, x1, y + 0.05, IZ + 0.06, PAL.tan);
    props.bx(x0 - 0.15, y0 - 0.1, WALL_Z, x1 + 0.15, y0, WALL_Z + 0.18, PAL.haze);
    props.bx(x0 - 0.1, y1, WALL_Z, x1 + 0.1, y1 + 0.1, WALL_Z + 0.08, PAL.steel);
    for (const x of [x0 - 0.1, x1]) props.bx(x, y0, WALL_Z, x + 0.1, y1, WALL_Z + 0.08, PAL.steel);
  }
  // ---- the lit pane behind the fire escape (red curtains)
  {
    const [x0, x1, y0, y1] = FEWIN, z = WALL_Z + 0.005;
    glow.bx(x0 + 0.3, y0, z, x1 - 0.3, y1, z + 0.02, PAL.amber);
    glow.bx(x0, y0, z, x0 + 0.3, y1, z + 0.02, PAL.crimson); glow.bx(x1 - 0.3, y0, z, x1, y1, z + 0.02, PAL.crimson);
    props.bx(x0 - 0.12, y0 - 0.1, WALL_Z, x1 + 0.12, y0, WALL_Z + 0.16, PAL.haze); props.bx(x0 - 0.1, y1, WALL_Z, x1 + 0.1, y1 + 0.1, WALL_Z + 0.06, PAL.steel);
    for (const x of [x0 - 0.1, x1]) props.bx(x, y0, WALL_Z, x + 0.1, y1, WALL_Z + 0.06, PAL.steel);
  }
  // ---- the logo: neon "B.L.A.M. / DINER" on a dark board; the M and the N buzz (their own tiny meshes)
  {
    const s = 0.09, z = WALL_Z + 0.07, cx = -0.1;
    props.bx(cx - 2.05, 3.7, WALL_Z, cx + 2.05, 5.47, WALL_Z + 0.06, PAL.midnight);
    for (const bx of [cx - 1.6, cx + 1.6]) props.bx(bx - 0.04, 5.47, WALL_Z, bx + 0.04, 5.75, WALL_Z + 0.04, PAL.steel);
    const put = (t, y0, col, buzzCi, fi) => {
      const x0 = cx - t.w * s / 2;
      for (const [px, py, ci] of t.px) (ci === buzzCi ? flick[fi] : glow).bx(x0 + px * s, y0 - (py + 1) * s, z, x0 + (px + 1) * s, y0 - py * s, z + 0.05, PAL[col]);
    };
    put(R.bold('B.L.A.M.'), 5.33, 'pink', 6, 0);
    put(R.bold('DINER'), 4.5, 'cyan', 2, 1);
    glow.bx(cx - 1.95, 5.4, z, cx + 1.95, 5.43, z + 0.03, PAL.yellow); glow.bx(cx - 1.95, 3.74, z, cx + 1.95, 3.77, z + 0.03, PAL.yellow);
    glow.bx(cx - 1.98, 3.74, z, cx - 1.95, 5.43, z + 0.03, PAL.yellow); glow.bx(cx + 1.95, 3.74, z, cx + 1.98, 5.43, z + 0.03, PAL.yellow);
  }
  // ---- fire escape: landing, kick plate, railings, brackets, drop ladder, a bit of the upper landing + stair
  {
    const { x0, x1, y, z0, z1 } = FE;
    props.bx(x0, y, z0, x1, y + 0.12, z1, PAL.slate);
    for (let x = x0 + 0.3; x < x1; x += 0.6) props.bx(x - 0.03, y - 0.14, z0, x + 0.03, y, z1, PAL.navy);
    props.bx(x0, y + 0.12, z1 - 0.05, x1, y + 0.37, z1, PAL.steel);
    for (const ry of [y + 0.72, y + 1.12]) props.bx(x0, ry, z1 - 0.05, x1, ry + 0.06, z1 + 0.01, PAL.steel);
    for (let x = x0; x <= x1 + 1e-6; x += 0.4) props.bx(x - 0.025, y + 0.37, z1 - 0.045, x + 0.025, y + 1.12, z1 - 0.005, PAL.steel);
    for (const sx of [x0, x1]) { props.bx(sx - 0.03, y + 1.12, z0, sx + 0.03, y + 1.18, z1, PAL.steel); props.bx(sx - 0.03, y + 0.12, z0, sx + 0.03, y + 0.37, z1, PAL.steel); }
    for (const bx of [x0 + 0.4, x1 - 0.4]) for (let k = 0; k < 5; k++) props.bx(bx - 0.03, y - 0.2 - k * 0.14, z0, bx + 0.03, y - 0.06 - k * 0.14, z0 + 0.9 - k * 0.18, PAL.navy);
    const lx0 = -2.95, lx1 = -2.6, lz = z1 + 0.04;
    for (const lx of [lx0, lx1]) props.bx(lx - 0.03, 0.95, lz, lx + 0.03, y, lz + 0.05, PAL.steel);
    for (let ly = 1.1; ly < y; ly += 0.28) props.bx(lx0, ly, lz + 0.01, lx1, ly + 0.04, lz + 0.04, PAL.haze);
    props.bx(x0, 5.55, z0, -5.0, 5.67, z1, PAL.slate); props.bx(x0, 5.67, z1 - 0.05, -5.0, 5.92, z1, PAL.steel);
    for (let k = 0; k < 9; k++) { const sx = -5.25 - k * 0.11, sy = y + 0.12 + k * 0.3; props.bx(sx - 0.3, sy, z0 + 0.15, sx, sy + 0.05, z0 + 0.75, PAL.steel); }
    occ(x0, y - 0.15, z0, x1, y + 0.37, z1);
  }
  // ---- dumpsters, scooter, bags, crates
  dumpster(props, DUMP_L, 'DINER'); dumpster(props, DUMP_R, 'TRASH');
  {
    const z0 = -3.52, z1 = -3.08, C = PAL.cyan, D = PAL.deepblue;
    for (const wx of [-1.05, 0.5]) { props.bx(wx - 0.22, 0, z0 + 0.1, wx + 0.22, 0.44, z1 - 0.1, PAL.void); props.bx(wx - 0.08, 0.14, z1 - 0.1, wx + 0.08, 0.3, z1 - 0.06, PAL.haze); }
    props.bx(-0.95, 0.3, z0 + 0.05, 0.85, 0.42, z1 - 0.05, D);
    props.bx(-0.2, 0.42, z0, 0.85, 0.95, z1, C); props.bx(-0.2, 0.42, z1, 0.85, 0.5, z1 + 0.02, PAL.ice);
    props.bx(-0.1, 0.95, z0 + 0.04, 0.7, 1.06, z1 - 0.04, PAL.walnut);
    props.bx(-1.3, 0.3, z0 + 0.02, -0.95, 1.35, z1 - 0.02, C); props.bx(-1.33, 0.3, z0 + 0.06, -1.3, 1.35, z1 - 0.06, PAL.ice);
    props.bx(-1.22, 1.35, -3.36, -1.08, 1.62, -3.24, D); props.bx(-1.22, 1.62, z0 - 0.15, -1.08, 1.68, z1 + 0.15, PAL.void);
    glow.bx(-1.38, 1.42, -3.36, -1.32, 1.56, -3.24, PAL.lemon);
    props.bx(0.2, 1.06, z0 - 0.02, 0.8, 1.5, z1 + 0.02, PAL.red); props.bx(0.2, 1.24, z1 + 0.02, 0.8, 1.3, z1 + 0.04, PAL.bone);
    occ(-1.33, 0.3, z0, 0.85, 0.95, z1); occ(-1.33, 0.3, z0, -0.95, 1.35, z1); occ(0.2, 0.95, z0, 0.8, 1.5, z1);
    for (const wx of [-1.05, 0.5]) occ(wx - 0.22, 0, z0 + 0.1, wx + 0.22, 0.44, z1 - 0.1);
  }
  bag(props, -6.35, 0.3, -6.3, 0.34, 1); bag(props, -5.75, 0.26, -6.32, 0.28, 2); bag(props, -6.45, 0.3, -5.35, 0.34, 3);
  bag(props, 6.35, 0.32, -5.45, 0.38, 4); bag(props, 6.2, 0.26, -3.4, 0.3, 5);
  for (const [x, y, w] of [[2.95, 0, 0.5], [3.0, 0.42, 0.48]]) {                                        // milk crates
    props.bx(x, y, -5.75, x + w, y + 0.4, -5.3, PAL.red);
    for (let k = 0; k < 3; k++) props.bx(x + 0.07 + k * 0.14, y + 0.1, -5.3, x + 0.14 + k * 0.14, y + 0.3, -5.29, PAL.oxblood);
    occ(x, y, -5.75, x + w, y + 0.4, -5.3);
  }
  props.bx(0.45, 0, WALL_Z, 1.2, 0.9, WALL_Z + 0.06, PAL.tan); props.bx(0.45, 0.4, WALL_Z + 0.06, 1.2, 0.46, WALL_Z + 0.07, PAL.sand);   // flattened box
  // ---- steam grate, puddles (with neon reflections)
  room.bx(2.5, 0, -2.5, 3.5, 0.02, -1.9, PAL.slate, null, 4);
  for (let i = 0; i < 7; i++) room.bx(2.58 + i * 0.13, 0.02, -2.42, 2.64 + i * 0.13, 0.025, -1.98, PAL.void, null, 4);
  for (const [x0, x1, z0, z1] of [[-4.2, -2.4, -2.3, -1.3], [0.1, 1.6, -5.25, -4.6], [4.5, 5.6, -2.9, -2.3]]) {
    room.bx(x0, 0, z0, x1, 0.008, z1, PAL.deepblue, null, 4);
    room.bx(x0 + 0.2, 0, z0 - 0.12, x1 - 0.2, 0.008, z0, PAL.deepblue, null, 4);
    glow.bx(x0 + 0.3, 0.009, z0 + 0.2, x0 + (x1 - x0) * 0.6, 0.011, z0 + 0.25, PAL.pink, null, 4);
    glow.bx(x0 + (x1 - x0) * 0.35, 0.009, z1 - 0.3, x1 - 0.25, 0.011, z1 - 0.26, PAL.cyan, null, 4);
  }
  // ---- side walls (lower than the back wall: the sky shows in the top corners), drainpipe, fuse box
  for (const sx of [-1, 1]) {
    const wx = sx * 7, a = sx < 0 ? wx - 0.3 : wx, b = sx < 0 ? wx : wx + 0.3, mask = sx < 0 ? 1 : 2, top = 4.2;
    for (let z = -6.8; z < 3; z += 1) for (let y = 0; y < top; y += 1) room.bx(a, y, z, b, Math.min(y + 1, top), Math.min(z + 1, 3), PAL.umber, null, mask);
    for (let r = 0; r * 0.25 < top - 0.1; r++) for (let z = -6.8 + (r % 2) * 0.25; z < -1; z += 0.5) {
      const y = r * 0.25, f = sx < 0 ? wx : wx - 0.035;
      room.bx(f, y + 0.02, z + 0.02, f + 0.035, y + 0.23, z + 0.48, hash2(r + 50 * sx, Math.round(z * 2)) < 0.6 ? PAL.oxblood : PAL.crimson, null, 63 - (sx < 0 ? 2 : 1));
    }
    room.bx(wx - 0.35, top, -6.8, wx + 0.35, top + 0.12, 3, PAL.slate);
    occ(Math.min(a, b) - 0.04, 0, -6.8, Math.max(a, b) + 0.04, top + 0.12, 3);
  }
  props.bx(-6.97, 0, -4.2, -6.87, 4.2, -4.1, PAL.steel); props.bx(-6.97, 0, -4.35, -6.8, 0.1, -3.95, PAL.steel);
  props.bx(6.82, 1.6, -4.0, 6.97, 2.4, -3.4, PAL.slate); props.bx(6.8, 1.9, -3.8, 6.82, 2.1, -3.6, PAL.yellow);
  // ---- sky in the top corners: distant blocks with lit windows, the moon, stars
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const xa = sx * (8 + i * 3.2), w = 2.6 + hash1(i * 5 + sx + 9) * 1.2, h = 5.8 + hash1(i * 11 + sx * 3 + 4) * 3;
    const x0 = Math.min(xa, xa + sx * w), x1 = Math.max(xa, xa + sx * w);
    room.bx(x0, 0, -14.2, x1, h, -14, PAL.navy, null, 16); room.bx(x0 - 0.1, h, -14.25, x1 + 0.1, h + 0.15, -13.95, PAL.slate, null, 16 | 4);
    for (let wy = 1; wy < h - 0.6; wy += 0.9) for (let wxx = x0 + 0.35; wxx < x1 - 0.4; wxx += 0.75) {
      const q = hash2(Math.round(wxx * 10), Math.round(wy * 10)); if (q > 0.7) glow.bx(wxx, wy, -13.99, wxx + 0.3, wy + 0.4, -13.97, q > 0.9 ? PAL.lemon : PAL.amber);
    }
  }
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) if (i * i + j * j <= 36) glow.box(-14.6 + i * 0.15, 8.1 + j * 0.15, -15, 0.15, 0.15, 0.05, (i + 2) ** 2 + (j - 1) ** 2 < 5 || (i - 2) ** 2 + (j + 2) ** 2 < 3 ? PAL.mist : PAL.bone);
  for (let k = 0; k < 22; k++) { const sx = k % 2 ? 1 : -1; glow.box(sx * (8.5 + hash1(k * 3) * 9), 6.6 + hash1(k * 7 + 1) * 4, -16, 0.08, 0.08, 0.02, hash1(k + 40) > 0.7 ? PAL.lemon : PAL.mist); }
  // ---- meshes
  const roomMesh = new THREE.Mesh(spill(room.geo()), MAT.env); roomMesh.userData.env = true;
  const propMesh = new THREE.Mesh(spill(props.geo()), MAT.obj);
  const glowMesh = glow.mesh(MAT.glow); glowMesh.onBeforeRender = steam;
  const buzzMeshes = flick.map((v, i) => {
    const m = v.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    m.onBeforeRender = () => m.material.color.setScalar(buzz(performance.now() / 1000, i));
    return m;
  });
  ENV_BIRDS = PERCH.map(p => { const m = new THREE.Mesh(PGs.sit, MAT.obj); m.userData.sharedGeo = true; m.position.set(p[0], p[1] + 0.17, p[2]); m.rotation.y = p[3]; group.add(m); return m; });
  group.add(roomMesh, propMesh, glowMesh, ...buzzMeshes);
  group.userData.shootables = [roomMesh, propMesh];
  return group;
}
// buzzing neon: lit almost all the time; about every 6 s a letter stutters for ~half a second (dim, never black)
function buzz(t, i) {
  const P = 2.9 + i * 0.8, k = Math.floor(t / P), f = t / P - k;
  if (hash1(k * 7 + i * 131) > 0.55 || f > 0.17) return 1;
  return hash1(Math.floor(t * 13) + i * 977) < 0.5 ? 0.32 : 1;
}
// steam from the grate (chips that rise and fade); driven by the glow mesh being drawn
let steamT = 0, steamAcc = 0;
const _sp = new THREE.Vector3(), _sv = new THREE.Vector3();
function steam() {
  const now = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, now - steamT)); steamT = now;
  steamAcc += dt * 7;
  while (steamAcc >= 1) {
    steamAcc -= 1;
    T.spawnChip(_sp.set(R.rnd(2.6, 3.4), 0.05, R.rnd(-2.4, -2.0)), _sv.set(R.rnd(-0.15, 0.15), R.rnd(1.1, 1.6), R.rnd(-0.05, 0.12)),
      R.rnd(0.09, 0.16), Math.random() < 0.65 ? PAL.mist : PAL.haze, R.rnd(1.1, 1.8), -0.06);
  }
}

// =========================================================================================
// Spots, lanes and motions. Every pose is a pure function of the spawn and its local time lt.
//   pop    rises from behind cover (dumpsters, scooter, the window sill), sinks back
//   slide  slides out of the doorway from inside the wall, slides back
//   drop   falls from the upper fire escape onto the landing (squash), jumps back up
//   walk   bystander slides in along a lane with a waddle, stops with hands up, walks on out
//   lean   a crook crouched BEHIND a stopped bystander leans out to one side, then back
// =========================================================================================
const SPOTS = {
  door:    { mo: 'slide', x: 2.1,   y: 0,    z: -7.15, dx: 1.6, ef: 1.0, ready: 0.35, exit: 0.3 },
  window:  { mo: 'pop',   x: 4.7,   y: 2.05, z: -7.05, d: 1.75, ef: 1.0, ready: 0.35, exit: 0.28 },
  dumpL:   { mo: 'pop',   x: -4.1,  y: 0,    z: -5.8,  d: 1.6,  ef: 1.0, ready: 0.35, exit: 0.28 },
  dumpR:   { mo: 'pop',   x: 4.7,   y: 0,    z: -5.4,  d: 1.6,  ef: 1.0, ready: 0.35, exit: 0.28 },
  escape:  { mo: 'drop',  x: -4.4,  y: 2.92, z: -5.95, h: 3.6,  ef: 1.5, ready: 0.45, exit: 0.4 },
  scooter: { mo: 'pop',   x: -0.25, y: 0,    z: -3.95, d: 2.2,  ef: 1.1, ready: 0.4,  exit: 0.3 }
};
const CROOK_SPOTS = ['door', 'window', 'dumpL', 'dumpR', 'escape', 'scooter'];
const SWAP_SPOTS = ['door', 'window', 'dumpL', 'dumpR', 'scooter'];
const LANES = {
  F: { z: -2.0,  stops: [-3.7, -2.1, 1.5, 3.3], hard: [-0.3], edge: 7.4 },
  B: { z: -6.05, stops: [-1.7, 0.3], hard: [2.1, -4.1, 4.7], edge: 8.2 }
};
const WALK_SPEED = { cook: 6, kid: 7, lady: 4.2 };
const PEEK_Z = 0.5, PEEK_LX = 0.95, FAST = 0.55;
function pose(sp, lt, o) {
  o = o || {};
  o.x = sp.x; o.y = sp.y; o.z = sp.z; o.rz = 0; o.sx = sp.mirror ? -1 : 1; o.sy = 1; o.moving = false;
  o.visible = lt >= 0; o.shootable = false; o.done = false;
  if (lt < 0) return o;
  const en = sp.enter, ho = sp.hold, ex = sp.exit;
  let ph, p;
  if (lt < en) { ph = 0; p = lt / en; } else if (lt < en + ho) { ph = 1; p = (lt - en) / ho; }
  else if (lt < en + ho + ex) { ph = 2; p = (lt - en - ho) / ex; } else { o.visible = false; o.done = true; return o; }
  const tau = lt - en, sg = sp.dx < 0 || sp.lx < 0 ? -1 : 1;
  switch (sp.mo) {
    case 'pop':
      if (ph === 0) o.y = sp.y - sp.d * (1 - E.outBack(p));
      else if (ph === 1) o.rz = 0.07 * Math.exp(-6 * tau) * Math.sin(18 * tau);
      else o.y = sp.y - sp.d * E.inCubic(p);
      break;
    case 'slide':
      if (ph === 0) { o.x = sp.x + sp.dx * (1 - E.outBack(p)); o.rz = sg * 0.14 * Math.sin(Math.PI * p); }
      else if (ph === 1) o.rz = -sg * 0.08 * Math.exp(-6 * tau) * Math.sin(16 * tau);
      else { o.x = sp.x + sp.dx * E.inCubic(p); o.rz = sg * 0.1 * p; }
      break;
    case 'drop':
      if (ph === 0) {
        if (p < 0.7) { const q = p / 0.7; o.y = sp.y + sp.h * (1 - q * q); o.sy = 1.06; }
        else { const q = (p - 0.7) / 0.3; o.sy = 1 - 0.24 * Math.sin(Math.PI * q); }
      } else if (ph === 1) o.rz = 0.06 * Math.exp(-5 * tau) * Math.sin(14 * tau);
      else { const q = Math.max(0, (p - 0.15) / 0.85); o.y = sp.y + sp.h * E.outCubic(q); o.sy = p < 0.15 ? 1 - 0.2 * Math.sin(Math.PI * p / 0.15) : 1.06; }
      break;
    case 'walk': {
      if (ph === 0) { o.x = sp.xs + (sp.xm - sp.xs) * (1 - (1 - p) * (1 - p)); o.moving = p < 0.92; }
      else if (ph === 1) o.x = sp.xm;
      else { o.x = sp.xm + (sp.xe - sp.xm) * p * p; o.moving = true; }
      if (o.moving) { o.y += 0.08 * Math.abs(Math.sin(lt * 13)); o.rz = 0.07 * Math.sin(lt * 13); }
      else if (ph === 1) o.rz = 0.05 * Math.exp(-6 * tau) * Math.sin(15 * tau);
      break;
    }
    case 'lean': {
      const e = ph === 0 ? E.outBack(p) : ph === 1 ? 1 : 1 - E.inCubic(p);
      o.x = sp.x + sp.lx * e; o.rz = -sg * 0.24 * e;
      if (ph === 1) o.rz -= sg * 0.05 * Math.exp(-5 * tau) * Math.sin(15 * tau);
      break;
    }
  }
  // crooks: from readyAt until 70 % through the exit; bystanders: whenever they are up (a penalty is a penalty)
  o.shootable = sp.civ ? true : lt >= sp.readyAt && (ph < 2 || p < 0.7);
  return o;
}

// ---------- bullets stop at cover: a figure's hit only counts if nothing static (and, for a crook,
// no bystander) is between the camera and the hit point. Matters for half-hidden figures and for the
// touch slop ring (main.js only offers it good targets, so it would otherwise reach through a bystander).
const LIVE = new Set();
const _rc = [], _ri = [], _bv = new THREE.Vector3();
function blocked(raycaster, dist, me) {
  const ray = raycaster.ray;
  for (const b of OCC) if (ray.intersectBox(b, _bv) && ray.origin.distanceTo(_bv) < dist - 0.02) return true;
  if (me && me.kind === 'target') for (const f of LIVE) {
    if (f === me || f.kind !== 'bystander' || !f.alive || !f.group.visible) continue;
    for (const m of f.meshes()) {
      if (!m.visible) continue;
      _ri.length = 0; THREE.Mesh.prototype.raycast.call(m, raycaster, _ri);
      if (_ri.length && _ri[0].distance < dist) return true;
    }
  }
  return false;
}
function occRaycast(raycaster, intersects) {
  _rc.length = 0;
  THREE.Mesh.prototype.raycast.call(this, raycaster, _rc);
  if (!_rc.length) return;
  const hits = _rc.slice(), me = this.userData.target;
  for (const h of hits) if (!blocked(raycaster, h.distance, me)) intersects.push(h);
}

// ---------- a cardboard figure (crook or bystander) ----------
class Figure extends T.Target {
  constructor(sp) {
    super(sp.civ ? 'bystander' : 'target');
    const C = chars(), look = C[sp.who];
    this.sp = sp; this.P = {}; this.lastLt = 0; this.deadLt = -1; this.announced = false;
    this.pivot = new THREE.Group(); this.group.add(this.pivot);
    const mk = L => { const m = new THREE.Mesh(L.geo, toonMat()); m.userData.sharedGeo = true; m.raycast = occRaycast; this.pivot.add(m); return m; };
    this.mesh = mk(look); this.part(this.mesh, look.list, FS, look.ox, look.oy, 0);
    if (sp.who === 'lady') { this.dog = mk(C.dog); this.part(this.dog, C.dog.list, FS, C.dog.ox, C.dog.oy, 0); }
    this.group.visible = false;
    LIVE.add(this);
  }
  update(lt) {
    const sp = this.sp; this.lastLt = lt;
    if (!this.alive) return this.react(lt);
    const P = pose(sp, lt, this.P);
    this.group.position.set(P.x, P.y, P.z); this.group.visible = P.visible;
    this.pivot.rotation.set(0, 0, P.rz); this.pivot.scale.set(P.sx, P.sy, 1);
    this.shootable = P.shootable && P.visible;
    if (this.dog) { this.dog.position.set(sp.dir * 0.8, P.moving ? Math.abs(Math.sin(lt * 19)) * 0.06 : 0, 0.22); this.dog.scale.x = sp.dir; }
    if (!this.announced && P.visible) {
      this.announced = true;
      B.SFX.play(sp.civ ? 'bystanderIn' : 'targetIn', { u: R.toPx(this.group.position)[0] / R.RW, who: sp.who });
    }
    return P.done;
  }
  // shot: a crook spins round and flops over backwards; a bystander hops and keels over stiff (both with chips)
  react(lt) {
    if (this.deadLt < 0) this.deadLt = lt;
    const crook = this.deadKind === 'target', p = Math.min(1, (lt - this.deadLt) / (crook ? 0.6 : 0.8)), dp = this.deadP || this.group.position;
    this.group.visible = true;
    if (crook) {
      this.pivot.rotation.set(-(Math.PI / 2) * E.inCubic(p), this.spin * 3 * Math.PI * E.outCubic(p), 0);
      this.group.position.set(dp.x, dp.y - 0.25 * p, dp.z);
    } else {
      this.pivot.rotation.set(-(Math.PI / 2) * E.inCubic(Math.max(0, p * 1.3 - 0.3)), 0, 0.25 * Math.sin(p * 20) * (1 - p));
      this.group.position.set(dp.x, dp.y + 0.45 * Math.sin(Math.PI * Math.min(1, p * 1.8)), dp.z);
    }
    return p >= 1;
  }
  shatter(point, opts = {}) {
    this.deadKind = this.kind; this.spin = this.sp.id % 2 ? 1 : -1; this.deadP = this.group.position.clone();
    super.shatter(point, Object.assign({ max: 44, power: 0.75 }, opts));
    this.group.visible = true; this.deadLt = this.lastLt;
    if (point) T.sparks(point, 7, this.deadKind === 'target' ? ['lemon', 'yellow', 'bone'] : ['red', 'coral', 'bone'], 1.3, 0.04);
  }
  dispose() { LIVE.delete(this); super.dispose(); }
}

// ---------- a pigeon that sits, pecks, then flaps off (a distraction: never shootable) ----------
const FLY = 2.6;
class Pigeon extends T.Target {
  constructor(sp) {
    super('decor'); this.sp = sp; this.G = pigeonGeos(); this.home = PERCH[sp.perch]; this.flew = false;
    this.mesh = new THREE.Mesh(this.G.sit, MAT.obj); this.mesh.userData.sharedGeo = true; this.group.add(this.mesh);
    if (ENV_BIRDS[sp.perch]) ENV_BIRDS[sp.perch].visible = false;
  }
  meshes() { return []; }
  update(lt) {
    const sp = this.sp, H = this.home, f = lt - sp.fly; this.shootable = false;
    if (f < 0) {
      const pk = Math.max(0, Math.sin(lt * 2.3 + sp.perch * 2)) ** 8;
      this.group.position.set(H[0], H[1] + 0.17, H[2]); this.group.rotation.set(0, H[3], -0.5 * pk);
      this.mesh.geometry = this.G.sit; return false;
    }
    if (!this.flew) { this.flew = true; B.SFX.play('pigeon', { u: R.toPx(this.group.position)[0] / R.RW }); }
    const q = f / FLY, d = sp.side;
    this.group.position.set(H[0] + d * (6.5 * q * q + 0.6 * q), H[1] + 0.17 + 3.4 * q + 0.15 * Math.sin(f * 9), H[2] + 1.6 * q);
    this.group.rotation.set(0, d > 0 ? 0 : Math.PI, 0.35 - 0.2 * q);
    this.mesh.geometry = ((f * 14) | 0) % 2 ? this.G.up : this.G.down;
    return f >= FLY;
  }
}

// =========================================================================================
// Rules per tier and variant.
//   hold = how long a figure stays up; quick + mix = top tiers: about half snap away after `quick`
//   enter = pop / slide time; live = most figures up at once; civ = bystander roll, civCap = ceiling on
//   the bystander share; overlap = chance a crook and a bystander may share the screen (Beginner: rarely);
//   peek / swap = specials (a crook behind a bystander / a crook + bystander pair that swap spots);
//   civPop = bystanders may also pop from the crook spots; share = quota share of the guaranteed crooks.
// =========================================================================================
const TIER_P = [
  { time: 40, hold: 1.7,  quick: 0,    mix: 0,   enter: 0.42, live: 3, civ: 0.38, civCap: 0.36, gap: [0.85, 1.4],  overlap: 0.12, peek: 0,    swap: 0,    civPop: 0,    rel: 0.75, slack: 10, share: 0.6  },
  { time: 37, hold: 1.15, quick: 0,    mix: 0,   enter: 0.34, live: 4, civ: 0.38, civCap: 0.4 , gap: [0.6, 1.1],   overlap: 0.45, peek: 0,    swap: 0,    civPop: 0,    rel: 0.7,  slack: 8,  share: 0.62 },
  { time: 35, hold: 1.0,  quick: 0.38, mix: 0.5, enter: 0.28, live: 4, civ: 0.38, civCap: 0.42, gap: [0.45, 0.9],  overlap: 1,    peek: 0.16, swap: 0.14, civPop: 0.3,  rel: 0.62, slack: 6,  share: 0.64 },
  { time: 32, hold: 0.9,  quick: 0.3,  mix: 0.5, enter: 0.24, live: 5, civ: 0.42, civCap: 0.45, gap: [0.32, 0.72], overlap: 1,    peek: 0.2,  swap: 0.18, civPop: 0.35, rel: 0.55, slack: 4,  share: 0.66 }
];
const VARIANT_NAMES = ['EIGHT SHOOTER', 'COUNT YOUR SHOTS', 'LAST CALL'];
const CROOKS = ['fedora', 'beanie'], CIVS = ['cook', 'kid', 'lady'], POPPERS = ['cook', 'kid'];
const capEst = {};
function config(tier, v) {
  tier = Math.max(0, Math.min(3, tier | 0)); v = Math.max(0, Math.min(2, v | 0));
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.hold = +(b.hold * (1 - 0.05 * v)).toFixed(3); c.quick = +(b.quick * (1 - 0.04 * v)).toFixed(3);
  c.live = b.live + (v >= 2 ? 1 : 0); c.share = Math.min(0.75, b.share + 0.02 * v);
  c.quota = 8;                                       // placeholder: timeline() derives the real quota
  c.autoReload = false;
  c.tier = tier; c.variant = v; c.title = 'THE ALLEY'; c.subtitle = VARIANT_NAMES[v];
  c.ammo = [
    { mag: 8, reloadTime: b.rel, autoReload: c.autoReload },
    { cap: 0 },                                      // = quota + slack, set by timeline() (estimate below for menus)
    { mag: 12, reloadTime: +(b.rel * 0.9).toFixed(2), autoReload: c.autoReload }
  ][v];
  if (c.ammo.cap === 0) {
    const key = tier + '|' + v;
    if (!capEst[key]) { const est = Object.assign({ estimate: true }, c); timeline(est, B.Stage.mulberry32(0x5eed)); capEst[key] = [est.ammo, est.quota]; }
    c.ammo = capEst[key][0]; c.quota = capEst[key][1];
  }
  return c;
}
function place(sp, t) { sp.t0 = +t.toFixed(3); sp.t1 = +(t + sp.enter + sp.hold + sp.exit).toFixed(3); return sp; }
function mkSpot(c, rng, spot, civ, who, t, hold) {
  const S = SPOTS[spot], quick = hold == null && c.mix > 0 && rng() < c.mix;
  const sp = { id: 0, t0: 0, t1: 0, spot, civ, who, mo: S.mo, x: S.x, y: S.y, z: S.z, enter: +(c.enter * S.ef).toFixed(3), exit: S.exit, hold: 0, readyAt: 0, quick: quick && !civ };
  if (S.d) sp.d = S.d; if (S.dx) sp.dx = S.dx; if (S.h) sp.h = S.h;
  sp.hold = +(hold != null ? hold : quick ? c.quick : civ ? c.hold * 0.9 : c.hold).toFixed(3);
  sp.readyAt = +(sp.enter * S.ready).toFixed(3);
  return place(sp, t);
}
function mkWalk(c, rng, ln, who, t, hold) {
  const L = LANES[ln], stops = c.tier >= 2 ? L.stops.concat(L.hard) : L.stops, quick = hold == null && c.mix > 0 && rng() < c.mix;
  const xm = rng.pick(stops), dir = rng() < 0.5 ? 1 : -1, v = WALK_SPEED[who] * (c.tier >= 2 ? 1.15 : 1);
  const sp = { id: 0, t0: 0, t1: 0, lane: ln, civ: true, who, mo: 'walk', x: xm, y: 0, z: L.z, xs: -dir * L.edge, xm, xe: dir * L.edge, dir,
    enter: +(Math.abs(xm + dir * L.edge) / v).toFixed(3), exit: +(Math.abs(L.edge - dir * xm) / (v * 1.3)).toFixed(3), hold: 0, readyAt: 0 };
  sp.hold = +(hold != null ? hold : quick ? c.quick * 1.6 : c.hold).toFixed(3);
  return place(sp, t);
}
// timeline: every spawn from the seeded rng only.
function timeline(c, rng) {
  if (!c.estimate) for (const m of ENV_BIRDS) m.visible = true;
  const out = [], free = {}, lane = { F: 0, B: 0 }, end = c.time - 0.25;
  for (const k in SPOTS) free[k] = 0;
  const add = sp => { out.push(sp); if (sp.spot) free[sp.spot] = Math.max(free[sp.spot], sp.t1 + 0.2); if (sp.lane) lane[sp.lane] = Math.max(lane[sp.lane], sp.t1 + 0.15); };
  const gap = () => rng.range(c.gap[0], c.gap[1]);
  let t = 0.6, guard = 0, civRun = 0, held = null;            // held: a kind decision waiting for the screen to clear
  while (guard++ < 900 && t < end - 1) {
    const up = out.filter(s => s.t1 > t);
    if (up.length >= c.live) { t = up.map(s => s.t1).sort((a, b) => a - b)[up.length - c.live] + 0.05; continue; }
    const kindRoll = rng(), specRoll = rng(), overRoll = rng(), room = c.live - up.length;
    // special: a crook crouched behind a stopped bystander leans out (only his exposed part can be hit)
    if (c.peek && specRoll < c.peek && lane.F <= t && room >= 2) {
      const civ = mkWalk(c, rng, 'F', rng.pick(POPPERS), t, 0), side = rng() < 0.5 ? -1 : 1, quick = c.mix > 0 && rng() < c.mix;
      const k = { id: 0, t0: 0, t1: 0, civ: false, who: rng.pick(CROOKS), mo: 'lean', x: civ.xm, y: -0.3, z: LANES.F.z - PEEK_Z, lx: side * PEEK_LX,
        mirror: side < 0, peek: true, quick, enter: +(c.enter * 1.2).toFixed(3), exit: 0.3, hold: +(quick ? c.quick + 0.1 : c.hold).toFixed(3), readyAt: 0 };
      k.readyAt = +(k.enter * 0.3).toFixed(3);
      place(k, civ.t0 + civ.enter + 0.35);
      civ.hold = +(k.t1 - (civ.t0 + civ.enter) + 0.35).toFixed(3); place(civ, civ.t0);
      if (civ.t1 <= end) { add(civ); add(k); civRun = 0; t += gap() + 0.4; continue; }
    }
    // special: a crook and a bystander pop up side by side, duck, and come back up in each other's spot
    if (c.swap && specRoll > 1 - c.swap && room >= 2) {
      const ok = SWAP_SPOTS.filter(s => free[s] <= t);
      if (ok.length >= 2) {
        const a = rng.pick(ok), b2 = rng.pick(ok.filter(s => s !== a)), H = +(c.hold * 0.8).toFixed(3), kw = rng.pick(CROOKS), cw = rng.pick(POPPERS);
        const s1 = mkSpot(c, rng, a, false, kw, t, H), s2 = mkSpot(c, rng, b2, true, cw, t, H), t2 = Math.max(s1.t1, s2.t1) - 0.08;
        const s3 = mkSpot(c, rng, a, true, cw, t2, H), s4 = mkSpot(c, rng, b2, false, kw, t2, H);
        if (Math.max(s3.t1, s4.t1) <= end) { for (const s of [s1, s2, s3, s4]) { s.swap = true; add(s); } civRun = 0; t += gap() + 0.3; continue; }
      }
    }
    let civ = held != null ? held : out.length > 1 && kindRoll < c.civ && civRun < 2 && out.filter(s => s.civ).length + 1 <= c.civCap * (out.length + 1);
    // Beginner / Advanced: a crook and a bystander only rarely share the screen
    // (a figure already leaving -- the last 80 % of its exit -- does not count)
    const busy = s => s.t1 - 0.8 * s.exit, other = up.filter(s => !!s.civ !== civ && busy(s) > t);
    if (other.length && overRoll > c.overlap) { held = civ; t = Math.max(...other.map(busy)) + 0.15; continue; }
    held = null;
    let sp = null;
    if (civ) {
      const lanesFree = ['F', 'B'].filter(l => lane[l] <= t), popFree = c.civPop ? SWAP_SPOTS.filter(s => free[s] <= t && s !== 'door') : [], r = rng();
      if (popFree.length && r < c.civPop) sp = mkSpot(c, rng, rng.pick(popFree), true, rng.pick(POPPERS), t);
      else if (free.door <= t && r < c.civPop + 0.2) sp = mkSpot(c, rng, 'door', true, 'cook', t);
      else if (lanesFree.length) sp = mkWalk(c, rng, rng.pick(lanesFree), rng.pick(CIVS), t);
      else if (free.door <= t) sp = mkSpot(c, rng, 'door', true, 'cook', t);
      else civ = false;
      if (sp && sp.t1 > end) { t += 0.3; continue; }                   // a long walk that would not finish: try again
    }
    if (!civ) {
      const ok = CROOK_SPOTS.filter(s => free[s] <= t);
      if (!ok.length) { t = Math.min(...CROOK_SPOTS.map(s => free[s])) + 0.05; continue; }
      sp = mkSpot(c, rng, rng.pick(ok), false, rng.pick(CROOKS), t);
      if (sp.t1 > end) break;
    }
    add(sp); civRun = civ ? civRun + 1 : 0;
    t += gap();
  }
  // two pigeons (distractions): one on the fire-escape rail, one on the dumpster lid; each flaps off once
  const birds = [0, 1].map(i => {
    const fly = +(i === 0 ? rng.range(5, c.time * 0.55) : rng.range(c.time * 0.45, c.time - 4)).toFixed(3);
    return { id: 0, t0: 0, t1: +(fly + FLY).toFixed(3), bird: true, perch: i, fly, side: rng() < 0.5 ? -1 : 1 };
  });
  const all = birds.concat(out.sort((a, b) => a.t0 - b.t0));
  all.forEach((s, i) => { s.id = i; });
  // the quota is a share of the crooks this seed produced (every one is guaranteed to be up and hittable);
  // a hard ammo cap follows the quota
  const crooks = out.filter(s => !s.civ).length;
  c.crookCount = crooks; c.civCount = out.filter(s => s.civ).length;
  c.peekCount = out.filter(s => s.peek).length; c.swapCount = out.filter(s => s.swap).length / 4;
  c.quota = Math.max(4, Math.round(crooks * c.share));
  if (c.ammo && c.ammo.cap != null) c.ammo = { cap: c.quota + c.slack };
  return all;
}
// score: 100, +100 if shot within FAST s of being ready, +50 quick (snap-away), +100 peeking, +50 swap
function points(sp, lt) {
  if (sp.civ || sp.bird) return 0;
  return 100 + (lt - sp.readyAt <= FAST ? 100 : 0) + (sp.quick ? 50 : 0) + (sp.peek ? 100 : 0) + (sp.swap ? 50 : 0);
}
function briefing(c) {
  const tip = c.ammo && c.ammo.mag ? 'SHOOT THE FRAME (OR R) TO RELOAD!' : 'HANDS UP = BYSTANDER. HOLD FIRE!';
  return { rule: [['SHOOT ', 'void'], [c.quota + ' CRIMINALS', 'red'], [". DON'T SHOOT ", 'void'], ['BYSTANDERS', 'crimson'], ['!', 'void']],
    icon: 'criminal', unit: 'CRIMINALS', dont: 'bystander', tip };
}

// ---------- briefing card icons (stage hooks drawIcon / drawDont, called by ui.js / portrait.js in place of
// the default bullseye / bomb): a crook head to shoot, a cook head on the don't-shoot sticker.
const CROOK_ICON = ['....XXXXXX....', '...XHHHHHHX...', '...XHHHHHHX...', '...XBBBBBBX...', '.XXXXXXXXXXXX.', '.XNNNNNNNNNNX.',
  '.XSXXSSSSXXSX.', '.XXXXXXXXXXXX.', '.XXWXXXXXXWXX.', '.XSSSSTTSSSSX.', '.XSXXXXXXXXSX.', '.XSXWWWWWWXSX.', '..XSXXXXXXSX..', '...XXXXXXXX...'];
const CROOK_KEY = { X: 'void', H: 'slate', N: 'navy', B: 'crimson', S: 'sand', T: 'tan', W: 'bone' };
const COOK_ICON = ['...XXXXXXXX...', '..XWWWWWWWWX..', '.XWWWWWWWWWWX.', '.XWWWWWWWWWWX.', '..XMMMMMMMMX..', '..XSSSSSSSSX..', '.XSWXSSSSWXSX.',
  '.XSSSSTTSSSSX.', '.XSNNNSSNNNSX.', '.XSSSSXXSSSSX.', '..XSSSXXSSSX..', '...XXSSSSXX...', '....XXXXXX....', '..............'];
const COOK_KEY = { X: 'void', W: 'bone', M: 'mist', S: 'sand', T: 'tan', N: 'walnut' };
function headIcon(rows, key, id, cx, cy, r) {
  const sc = Math.max(1, Math.round(2 * r / 14));
  B.HUD.sprite(rows, cx - 7 * sc, cy - 7 * sc, sc, key, id);
}
const drawIcon = (cx, cy, r) => headIcon(CROOK_ICON, CROOK_KEY, 'alleyCrook', cx, cy, r);
const drawDont = (cx, cy, r) => headIcon(COOK_ICON, COOK_KEY, 'alleyCook', cx, cy, r);

B.Stage.register({ id: 'alley', name: 'THE ALLEY', short: 'ALLEY', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv, config, timeline, makeTarget: sp => sp.bird ? new Pigeon(sp) : new Figure(sp), points, briefing, drawIcon, drawDont, pose, SPOTS, LANES });
})(window.BLAM);
