/* =========================================================================================
   B.L.A.M. ("Blast like a maniac!")  --  js/duck.js
   DEPUTY DUCK, the game's mascot: a round, fully volumetric voxel duck (SDF-voxelised parts with
   smooth normals), deputy sheriff hat with a star, silver badge on his chest, three black head
   feathers, stubby arms, flat orange feet (one mesh; the shader taps either foot).  No plinth: he stands on his own feet.
   Same "toy plastic" material as js/guns.js (palette toon tones + gloss highlight + void outline);
   output alpha 1.0 = the "object" dither class.  Faces +z, feet on y = 0, about 1.0 unit tall.
   API: BLAM.Duck.create(THREE, opts) -> duck  (see the bottom of this file)
     poses idle happy angry shot present cheer sad + 'laugh' (1.2 s miss taunt, then back to rest) + hover overlays scared relief; duck.setHover(bool) every frame
     (edge-triggered); duck.lookAt(ndcX, ndcY) turns the head toward that screen point (uses the camera that drew him).
   ========================================================================================= */
(function () {
'use strict';
const BLAM = (window.BLAM = window.BLAM || {});

// ---------- 1. PALETTE "BLAM-34" + toon ramps ----------
const PAL = {
  void:0x0b0b1a, midnight:0x1a1c3a, navy:0x2b2f5c, slate:0x3f4880, steel:0x5a6aa8, haze:0x8c9ccc, mist:0xc8d0e8, bone:0xf4f4f0,
  indigo:0x3a1a6a, umber:0x2e1c1c, walnut:0x4e2e24, chestnut:0x7a4a2c, tan:0xa8703a, sand:0xd4a060,
  oxblood:0x5c0f24, crimson:0xa01830, red:0xe82838, coral:0xff6a5a,
  plum:0x6a0f5a, magenta:0xc0187a, pink:0xff3aa0, bubblegum:0xff9ad0,
  rust:0xc84a10, orange:0xff7a1a, amber:0xffb020, yellow:0xffe040, lemon:0xfff8a0,
  deepblue:0x0a2a8a, blue:0x1a5aff, cyan:0x20d0ff, ice:0xa0f4ff,
  forest:0x0a4a2a, green:0x1a9a3a, lime:0x7ae830
};
// For every colour: [shadow tone, lit tone, gloss-band tone].  All palette entries, so the snap never muddies them.
const RAMP = {
  void:['void','midnight','slate'], midnight:['void','navy','steel'], navy:['midnight','slate','haze'], slate:['navy','steel','mist'],
  steel:['slate','haze','mist'], haze:['steel','mist','bone'], mist:['haze','bone','bone'], bone:['mist','bone','bone'],
  indigo:['midnight','plum','magenta'], umber:['void','walnut','chestnut'], walnut:['umber','chestnut','tan'],
  chestnut:['walnut','tan','sand'], tan:['chestnut','sand','lemon'], sand:['tan','lemon','bone'],
  oxblood:['umber','crimson','red'], crimson:['oxblood','red','coral'], red:['crimson','coral','bone'], coral:['red','bubblegum','bone'],
  plum:['oxblood','magenta','pink'], magenta:['plum','pink','bubblegum'], pink:['magenta','bubblegum','bone'], bubblegum:['pink','bone','bone'],
  rust:['oxblood','orange','amber'], orange:['rust','amber','lemon'], amber:['orange','yellow','lemon'], yellow:['amber','lemon','bone'],
  lemon:['yellow','bone','bone'], deepblue:['midnight','blue','cyan'], blue:['deepblue','cyan','ice'], cyan:['blue','ice','bone'],
  ice:['cyan','bone','bone'], forest:['void','green','lime'], green:['forest','lime','lemon'], lime:['green','lemon','bone']
};
// colour spec: 'name' (auto ramp) or 'base/shadow/lit/gloss' -> four [r,g,b] triples (cached)
const _specCache = new Map();
function hexRGB(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
function cspec(s) {
  let c = _specCache.get(s); if (c) return c;
  const p = s.split('/'), b = p[0], r = RAMP[b] || [b, b, b];
  const names = [b, p[1] || r[0], p[2] || r[1], p[3] || r[2]];
  for (const n of names) if (PAL[n] === undefined) throw new Error('BLAM.Duck: unknown palette colour ' + n);
  c = names.map(n => hexRGB(PAL[n])); _specCache.set(s, c); return c;
}

// ---------- 2. "TOY PLASTIC" MATERIAL ----------
// Per vertex: base / shadow / lit / gloss colours + info (x gloss 0..1, y flush mask, z emissive, w height for the flush line).
// Tone = lit if n.L > tHi, base if n.L > tLo, else shadow.  Gloss band = reflection vector crossing a strip light.
const TOON_VS = `
attribute vec3 cBase; attribute vec3 cLo; attribute vec3 cHi; attribute vec3 cSh; attribute vec4 aInfo; attribute float aFoot;
uniform vec2 uFoot; uniform vec2 uFootP;                       // per-foot tap angle (about x) + heel pivot (y, z): no extra meshes
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP;
#include <fog_pars_vertex>
void main() {
  vB = cBase; vL = cLo; vH = cHi; vS = cSh; vI = aInfo;
  vec3 pos = position, nor = normal;
  if (aFoot > 0.5) {
    float a = aFoot < 1.5 ? uFoot.x : uFoot.y, c = cos(a), s = sin(a); vec2 q = pos.yz - uFootP;
    pos.yz = uFootP + vec2(q.x * c - q.y * s, q.x * s + q.y * c); nor.yz = vec2(nor.y * c - nor.z * s, nor.y * s + nor.z * c);
  }
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vP = mvPosition.xyz; vN = normalize(normalMatrix * nor);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TOON_FS = `
uniform vec3 uLight; uniform vec3 uStrip; uniform float uStripOff; uniform float uStripW; uniform float uTHi; uniform float uTLo;
uniform float uStripP; uniform float uRim; uniform float uGloss; uniform float uFlush; uniform float uFlushY; uniform vec3 uFB; uniform vec3 uFL; uniform vec3 uFH;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP;
#include <fog_pars_fragment>
void main() {
  vec3 n = normalize(vN);
  float f = uFlush * vI.y * step(vI.w, uFlushY);
  vec3 b = mix(vB, uFB, f), l = mix(vL, uFL, f), h = mix(vH, uFH, f);
  float d = dot(n, uLight);
  vec3 c = d > uTHi ? h : (d > uTLo ? b : l);
  vec3 R = reflect(normalize(vP), n);
  float q = (dot(R, uStrip) - uStripOff) / uStripP;                 // repeating strip lights -> bands on flank and top
  float band = step(abs(q - floor(q + 0.5)) * uStripP, uStripW) * vI.x * uGloss * step(uTLo - 0.3, d);
  c = mix(c, vS, band);
  c = vI.z > 0.5 ? b : c;
  if (dot(n, normalize(-vP)) < uRim) c = vec3(0.0431, 0.0431, 0.1020);      // smooth-normal rim = void outline
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;
function toonMaterial(THREE, o) {
  o = o || {};
  const L = o.light || [-0.62, 0.78, 0.1], S = o.strip || [0.0, 0.3, 1.0];
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uLight: { value: new THREE.Vector3(L[0], L[1], L[2]).normalize() },
    uStrip: { value: new THREE.Vector3(S[0], S[1], S[2]).normalize() },
    uStripOff: { value: o.stripOff !== undefined ? o.stripOff : 0.0 }, uStripW: { value: o.stripW || 0.022 }, uStripP: { value: o.stripP || 0.6 },
    uTHi: { value: o.tHi !== undefined ? o.tHi : 0.66 }, uTLo: { value: o.tLo !== undefined ? o.tLo : 0.24 },
    uFoot: { value: new THREE.Vector2() }, uFootP: { value: new THREE.Vector2(o.footP ? o.footP[0] : 0, o.footP ? o.footP[1] : 0) },
    uGloss: { value: 1 }, uRim: { value: o.rim !== undefined ? o.rim : -2 }, uFlush: { value: 0 }, uFlushY: { value: 9 },
    uFB: { value: new THREE.Color(PAL.red) }, uFL: { value: new THREE.Color(PAL.crimson) }, uFH: { value: new THREE.Color(PAL.coral) }
  }]);
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: TOON_VS, fragmentShader: TOON_FS, fog: !!o.fog });
}

// ---------- 3. VOXEL GEOMETRY: faces between neighbours culled, smooth-normal option, inverted-hull outline ----------
const FACES = [ // normal + 4 corners of the unit cube (-1..1), counter-clockwise seen from outside
  [1,0,0, [1,-1,1, 1,-1,-1, 1,1,-1, 1,1,1]], [-1,0,0, [-1,-1,-1, -1,-1,1, -1,1,1, -1,1,-1]],
  [0,1,0, [-1,1,1, 1,1,1, 1,1,-1, -1,1,-1]], [0,-1,0, [-1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,1]],
  [0,0,1, [-1,-1,1, 1,-1,1, 1,1,1, -1,1,1]], [0,0,-1, [1,-1,-1, -1,-1,-1, -1,1,-1, 1,1,-1]]];
const VK = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);   // integer lattice key
const HULL_C = cspec('void');
class Geo {
  constructor(smooth) { this.p = []; this.n = []; this.cb = []; this.cl = []; this.ch = []; this.cs = []; this.inf = []; this.ft = []; this.idx = []; this.vc = 0; this.smooth = smooth || 0.75; this.foot = 0; }
  // one face (f = FACES index) of an axis box centred (x,y,z) with half sizes; C = cspec; I = [gloss, flush, emissive, height]
  face(x, y, z, hx, hy, hz, f, C, I, nrm, flip) {
    const F = FACES[f], q = F[3];
    let nx = F[0], ny = F[1], nz = F[2];
    if (nrm) { const k = this.smooth; nx = nx * (1 - k) + nrm[0] * k; ny = ny * (1 - k) + nrm[1] * k; nz = nz * (1 - k) + nrm[2] * k;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
    for (let v = 0; v < 12; v += 3) {
      this.p.push(x + q[v] * hx, y + q[v + 1] * hy, z + q[v + 2] * hz); this.n.push(nx, ny, nz);
      this.cb.push(C[0][0], C[0][1], C[0][2]); this.cl.push(C[1][0], C[1][1], C[1][2]);
      this.ch.push(C[2][0], C[2][1], C[2][2]); this.cs.push(C[3][0], C[3][1], C[3][2]); this.inf.push(I[0], I[1], I[2], I[3]); this.ft.push(this.foot);
    }
    const b = this.vc; this.vc += 4;
    if (flip) this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2); else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // voxel map (key -> {i,j,k,col,g,e,nrm,nh,fl,h}) on lattice size s; centre = ((i+.5)s - px, ...); e = outline thickness
  voxels(map, s, px, py, pz, e) {
    const h = s / 2, HI = [0, 0, 1, 0];
    for (const v of map.values()) {
      const x = (v.i + 0.5) * s - px, y = (v.j + 0.5) * s - py, z = (v.k + 0.5) * s - pz;
      const C = cspec(v.col), I = [v.g === undefined ? 1 : v.g, v.fl || 0, v.e ? 1 : 0, v.h || 0];
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        if (map.has(VK(v.i + F[0], v.j + F[1], v.k + F[2]))) continue;
        this.face(x, y, z, h, h, h, f, C, I, v.nrm, false);
        if (e > 0 && !v.nh) this.face(x, y, z, h + e, h + e, h + e, f, HULL_C, HI, null, true);
      }
    }
    return this;
  }
  geometry(THREE) {
    const g = new THREE.BufferGeometry(), F = (a, n) => new THREE.Float32BufferAttribute(a, n);
    g.setAttribute('position', F(this.p, 3)); g.setAttribute('normal', F(this.n, 3));
    g.setAttribute('cBase', F(this.cb, 3)); g.setAttribute('cLo', F(this.cl, 3)); g.setAttribute('cHi', F(this.ch, 3));
    g.setAttribute('cSh', F(this.cs, 3)); g.setAttribute('aInfo', F(this.inf, 4)); g.setAttribute('aFoot', F(this.ft, 1));
    g.setIndex(this.idx); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}


// ---------- 4. SDF VOXELISER: every part is a signed-distance shape sampled on the voxel lattice; normals = SDF gradient ----------
const DV = 0.025;                                   // duck voxel in world units: 40 voxels ~ 1.0 unit tall
const OUT_E = 0;                                    // no inverted hull on round voxel shapes (it streaks); the shader rim outlines
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {             // ellipsoid (bound-corrected approximation)
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz, k0 = len3(x, y, z), k1 = len3(x / rx, y / ry, z / rz);
  return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
function sdRBox(px, py, pz, cx, cy, cz, bx, by, bz, r) {         // rounded box
  const qx = Math.abs(px - cx) - bx + r, qy = Math.abs(py - cy) - by + r, qz = Math.abs(pz - cz) - bz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function sdCap(px, py, pz, ax, ay, az, bx, by, bz, r) {          // capsule
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
// cells centred on (i+.5, j+.5, k+.5) inside the box b = [x0,y0,z0,x1,y1,z1]; paint -> 'colour' | {col, g, fl, e, nh} | null
function voxelise(b, shape, paint, map, nshape) {
  map = map || new Map(); const e = 1.1, ns = nshape || shape;   // wide gradient step = smooth, stable normals; nshape = shape for normals
  for (let i = Math.floor(b[0]); i < Math.ceil(b[3]); i++) for (let j = Math.floor(b[1]); j < Math.ceil(b[4]); j++) for (let k = Math.floor(b[2]); k < Math.ceil(b[5]); k++) {
    const x = i + 0.5, y = j + 0.5, z = k + 0.5;
    if (shape(x, y, z) >= 0) continue;
    let p = paint(x, y, z); if (!p) continue; if (typeof p === 'string') p = { col: p };
    const gx = ns(x + e, y, z) - ns(x - e, y, z), gy = ns(x, y + e, z) - ns(x, y - e, z), gz = ns(x, y, z + e) - ns(x, y, z - e), gl = len3(gx, gy, gz) || 1;
    map.set(VK(i, j, k), { i, j, k, col: p.col, g: p.g === undefined ? 1 : p.g, e: p.e, fl: p.fl || 0, h: y / 40, nh: p.nh, nrm: [gx / gl, gy / gl, gz / gl] });
  }
  return map;
}
// first lattice cell (from the front) that is inside `shape` along the column (x, y): returns its k, or null
function frontK(shape, x, y, z0, z1) { for (let k = Math.ceil(z1); k >= Math.floor(z0); k--) if (shape(x, y, k + 0.5) < 0) return k; return null; }
// a flat pixel pattern stuck one voxel proud of a surface, facing +z (badge, hat star)
function stamp(map, shape, rows, cx, cy, key, z0, z1) {
  rows.forEach((row, v) => { for (let u = 0; u < row.length; u++) { const ch = row[u]; if (ch === '.') continue;
    const x = cx + u - (row.length - 1) / 2, y = cy + ((rows.length - 1) / 2 - v), i = Math.floor(x), j = Math.floor(y);
    const k = frontK(shape, i + 0.5, j + 0.5, z0, z1); if (k === null) continue;
    map.set(VK(i, j, k + 1), { i, j, k: k + 1, col: key[ch], g: 1, h: y / 40, nrm: [0, 0.25, 1] }); } });
}

// ---------- 5. DEPUTY DUCK MODEL (voxel units: x right, y up, z toward the viewer; feet on y = 0) ----------
const BILL = 'lemon/sand/bone/bone';
const PIV = { neck: [0, 17, 0.5], armL: [-8.3, 15.6, 0.8], armR: [8.3, 15.6, 0.8], jaw: [0, 21, 5.4], eyeL: [-3.9, 27.4, 7.5], eyeR: [3.9, 27.4, 7.5],
  lids: [0, 32.7, 8], browL: [-3.9, 31.8, 8.2], browR: [3.9, 31.8, 8.2], hat: [0, 32.8, 0], heel: [0, -0.6] };
const bodySh = (x, y, z) => smin(smin(sdEll(x, y, z, 0, 11.8, -0.4, 9.4, 9.0, 8.6), sdEll(x, y, z, 0, 9.6, 0.9, 9.0, 7.0, 8.4), 3),
  smin(sdEll(x, y, z, 0, 13.4, -8.8, 3.0, 2.6, 3.4), sdEll(x, y, z, 0, 15.4, -10.5, 1.5, 2.1, 1.5), 1.5), 2.5);
const headSh = (x, y, z) => sdEll(x, y, z, 0, 25.4, 0.4, 10.4, 9.6, 9.4);
const eyeSh = (x, y, z) => Math.min(sdEll(x, y, z, -3.9, 27.4, 7.5, 3.4, 4.1, 2.7), sdEll(x, y, z, 3.9, 27.4, 7.5, 3.4, 4.1, 2.7));
const billSh = (x, y, z) => y < 21 ? 1 : smin(sdEll(x, y, z, 0, 22.2, 10.2, 5.8, 1.9, 4.6), sdEll(x, y, z, 0, 22.6, 7.2, 4.4, 1.9, 3.0), 1.2);
const FEATHERS = [[-1.3, 34.0, 0.2, -3.2, 42.0, 1.4, -4.1, 42.3, 2.9], [0, 34.2, 0.4, 0.1, 43.3, 1.7, 0.2, 43.4, 3.4], [1.3, 34.0, 0.2, 3.3, 41.8, 1.3, 4.2, 42.0, 2.8]];
const tuftSh = (x, y, z) => { let d = 9; for (const f of FEATHERS) d = Math.min(d, sdCap(x, y, z, f[0], f[1], f[2], f[3], f[4], f[5], 0.72), sdCap(x, y, z, f[3], f[4], f[5], f[6], f[7], f[8], 0.62)); return d; };
const jawSh = (x, y, z) => y >= 21 ? 1 : sdEll(x, y, z, 0, 20.9, 9.4, 5.0, 1.7, 4.2);
const lidSh = (x, y, z) => Math.max(Math.min(sdEll(x, y, z, -3.9, 27.4, 7.5, 4.4, 5.1, 3.8), sdEll(x, y, z, 3.9, 27.4, 7.5, 4.4, 5.1, 3.8)), -eyeSh(x, y, z), 6.8 - z);
function hatSh(x, y, z) {
  const ax = Math.max(0, Math.abs(x) - 4.2), yb = 33.0 + 0.036 * ax * ax - 0.006 * z * z;
  const brim = Math.max((Math.hypot(x / 12.4, z / 11.2) - 1) * 10, Math.abs(y - yb) - 0.7);
  const crown = Math.max(sdRBox(x, y, z, 0, 36.3, -0.3, 6.6, 3.7, 5.9, 2.6), -sdCap(x, y, z, 0, 40.6, -6, 0, 40.6, 5, 2.0));
  return Math.min(brim, crown);
}
const footSh = s => (x, y, z) => {                                         // one foot + stubby leg (s = -1 left, +1 right)
  const a = s * 0.3, dx = x - s * 4.3, dz = z - 3.0, rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a);
  let f = sdRBox(rx, y, rz, 0, 0.9, 0.5, 3.0, 0.95, 4.4, 0.8);
  if (rz > 3.4 && Math.abs(Math.abs(rx) - 1.05) < 0.45) f = Math.max(f, 0.01);             // webbed toes
  return Math.min(f, sdCap(x, y, z, s * 3.9, 1.2, 0.6, s * 3.6, 4.6, 0.2, 1.45));
};
const armSh = s => (x, y, z) => Math.min(sdCap(x, y, z, s * 8.3, 15.6, 0.8, s * 9.5, 9.8, 1.8, 2.3), sdEll(x, y, z, s * 9.8, 8.4, 2.3, 2.6, 2.5, 2.6),
  sdEll(x, y, z, s * 8.5, 9.0, 4.1, 1.15, 1.15, 1.15));
function buildDuck(THREE, mat) {
  const M = {};
  const feetL = voxelise([-10, 0, -3, 0, 6, 9], footSh(-1), () => ({ col: 'orange', g: 0.7 }));   // one mesh; each foot tagged so
  const feetR = voxelise([0, 0, -3, 10, 6, 9], footSh(1), () => ({ col: 'orange', g: 0.7 }));     // the shader can tap it alone
  M.body = voxelise([-11, 2, -13, 11, 22, 10], bodySh, () => ({ col: 'yellow', fl: 1, g: 0.35 }));
  stamp(M.body, bodySh, ['...#...', '..###..', '#######', '.##o##.', '#######', '..###..', '...#...'], 3.9, 13.4, { '#': 'mist/haze/mist/bone', o: 'haze' }, 0, 11);   // silver sheriff badge
  const headAll = (x, y, z) => Math.min(headSh(x, y, z), eyeSh(x, y, z), billSh(x, y, z), tuftSh(x, y, z));
  M.head = voxelise([-11, 15, -10, 11, 45, 16], headAll, (x, y, z) => {
    const inSkull = headSh(x, y, z) < 0;
    if (tuftSh(x, y, z) < 0 && !inSkull && billSh(x, y, z) >= 0) return { col: 'void', g: 0.5 };
    if (eyeSh(x, y, z) < 0) return { col: 'bone', g: 1 };
    if (billSh(x, y, z) < 0 && !(inSkull && z < 6.5)) {
      if (y < 22 && z < 13.4 && Math.abs(x) < 4.6) return { col: 'oxblood', g: 0 };               // roof of the mouth
      if (y > 23.4 && Math.abs(Math.abs(x) - 1.7) < 0.6 && Math.abs(z - 11.4) < 0.7) return { col: 'tan', g: 0 };   // nostrils
      return { col: BILL, g: 0.9 };
    }
    return { col: 'yellow', fl: 1, g: 0.35 };
  });
  M.jaw = voxelise([-6, 18, 4, 6, 21, 15], jawSh, (x, y, z) => {
    if (y > 20 && Math.abs(x) < 3.8 && z < 12.6) return Math.abs(x) < 2.0 && z > 7.5 && z < 11.4 ? { col: 'coral', g: 0.6 } : { col: 'oxblood', g: 0 };
    return { col: BILL, g: 0.9 };
  });
  const pupil = s => (x, y, z) => len3(x - s * 3.9, y - 27.5, z - 10.3) - 1.35;
  M.pupilL = voxelise([-7, 24, 8, -1, 31, 13], pupil(-1), () => ({ col: 'void', g: 1 }));
  M.pupilR = voxelise([1, 24, 8, 7, 31, 13], pupil(1), () => ({ col: 'void', g: 1 }));
  const lidOut = (x, y, z) => Math.min(sdEll(x, y, z, -3.9, 27.4, 7.5, 4.4, 5.1, 3.8), sdEll(x, y, z, 3.9, 27.4, 7.5, 4.4, 5.1, 3.8));
  M.lids = voxelise([-9, 21, 5, 9, 33, 12], lidSh, (x, y) => y < 24.4 ? { col: 'void', g: 0 } : { col: 'yellow', fl: 1, g: 0.35 }, null, lidOut);
  M.happy = new Map();
  for (const s of [-1, 1]) for (let u = -2.6; u <= 2.61; u += 0.25) {                  // closed happy eyes: ^ ^
    const x = s * 3.9 + u, y = 26.8 + 1.5 - 0.3 * u * u, i = Math.floor(x), j = Math.floor(y), k = frontK(lidSh, i + 0.5, j + 0.5, 6, 12);
    if (k !== null) M.happy.set(VK(i, j, k + 1), { i, j, k: k + 1, col: 'void', g: 0, h: y / 40, nrm: [0, 0.3, 1] });
  }
  const brow = s => (x, y, z) => Math.min(sdCap(x, y, z, s * 1.3, 31.6, 9.0, s * 4.0, 32.1, 8.5, 0.95), sdCap(x, y, z, s * 4.0, 32.1, 8.5, s * 6.3, 31.7, 6.6, 0.95));
  M.browL = voxelise([-8, 29, 4, 1, 35, 11], brow(-1), () => ({ col: 'void', g: 0.3 }));
  M.browR = voxelise([-1, 29, 4, 8, 35, 11], brow(1), () => ({ col: 'void', g: 0.3 }));
  M.hat = voxelise([-13, 31, -12, 13, 43, 12], hatSh, (x, y, z) => {
    if (y < 34.5 && sdRBox(x, y, z, 0, 36.3, -0.3, 6.6, 3.7, 5.9, 2.6) < 0 && y > 32.7) return { col: 'walnut', g: 0 };   // hat band
    return { col: 'chestnut', g: 0 };                                               // felt: no gloss
  });
  stamp(M.hat, hatSh, ['..#..', '.###.', '#####', '.###.', '.#.#.'], 0, 36.8, { '#': 'yellow' }, 0, 8);   // deputy star
  M.armL = voxelise([-13, 5, -2, -5, 18, 7], armSh(-1), () => ({ col: 'yellow', fl: 1, g: 0.35 }));
  M.armR = voxelise([5, 5, -2, 13, 18, 7], armSh(1), () => ({ col: 'yellow', fl: 1, g: 0.35 }));
  const pivOf = { body: [0, 0, 0], head: PIV.neck, jaw: PIV.jaw, pupilL: [-3.9, 27.5, 10.3], pupilR: [3.9, 27.5, 10.3], lids: PIV.lids,
    happy: PIV.neck, browL: PIV.browL, browR: PIV.browR, hat: PIV.hat, armL: PIV.armL, armR: PIV.armR };
  const meshes = {}, fg = new Geo(0.94); fg.foot = 1; fg.voxels(feetL, DV, 0, 0, 0, OUT_E); fg.foot = 2; fg.voxels(feetR, DV, 0, 0, 0, OUT_E);
  meshes.feet = new THREE.Mesh(fg.geometry(THREE), mat); meshes.feet.name = 'duck-feet'; meshes.feet.userData.piv = [0, 0, 0];
  for (const k in M) {
    const p = pivOf[k], g = new Geo(0.94).voxels(M[k], DV, p[0] * DV, p[1] * DV, p[2] * DV, OUT_E).geometry(THREE);
    meshes[k] = new THREE.Mesh(g, mat); meshes[k].name = 'duck-' + k; meshes[k].userData.piv = p;
  }
  return meshes;
}

// ---------- 6. POSES: every frame a pose writes target values for a set of channels; channels ease toward them ----------
// 'scared' / 'relief' are the hover overlays (see setHover); 'relief' ends in the screen's resting pose (st.rest)
// 'laugh' is a one-shot taunt (the player missed): plays 1.2 s, then back to st.rest; it never becomes the rest pose
const POSES = ['idle', 'happy', 'angry', 'shot', 'present', 'cheer', 'sad', 'scared', 'relief', 'laugh'];
const OVERLAY = { scared: 1, relief: 1 };
const NEUTRAL = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sq: 1, hx: 0, hy: 0, hz: 0, jaw: 0, lid: 0, happy: 0, brow: 0, bOn: 0, by: 0,
  aLx: 0, aLy: 0, aLz: -0.24, aRx: 0, aRy: 0, aRz: 0.24, aLs: 1, aRs: 1, aRo: 0, px: 0, py: 0, pc: 0, pupil: 1, hatY: 0, hatRx: -0.24, hatRz: 0.07,
  flush: 0, feet: 0, fL: 0, fR: 0, steam: 0, sweat: 0, nb: 0 };
const RATE = { x: 40, y: 26, rx: 20, ry: 12, rz: 16, sq: 24, jaw: 28, lid: 36, flush: 5, hatY: 20, pupil: 20, feet: 30, fL: 40, fR: 40, aLs: 24, aRs: 24, aRo: 24, nb: 1e3, sweat: 1e3 };
const LAUGH_P = 2 / 6.5;                                                 // one belly-slap cycle = two HAs
const mix = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Look at the crosshair: st.lk = lagged head yaw/pitch (radians, duck space), st.look = raw target (the eyes lead).
// Head takes ~70 % of the turn, the body ~28 %, the pupils add the rest; w = how much the pose cares.
function lookHead(T, st, w) {
  const K = st.lk, L = st.look;
  T.hy += K.yaw * 0.72 * w; T.ry += K.yaw * 0.28 * w; T.hx += -K.pitch * 0.75 * w;
  T.px += clamp(L.yaw / 0.55, -1, 1) * 0.85 * w; T.py += clamp(L.pitch / 0.3, -1, 1) * 0.7 * w;
}
// Idle beats (arms stay down: hands-up belongs to 'scared'): impatient foot tap, suspicious glance, badge polish.
const BEATS = { tap: 2.3, glance: 2.3, badge: 2.6 }, BEAT_ORDER = ['tap', 'glance', 'badge'];
function idleBeat(T, st, dt) {
  st.beatNext -= dt;
  if (!st.beat && st.beatNext <= 0) { st.beat = BEAT_ORDER[st.beatI++ % 3]; st.bt = 0; }
  if (!st.beat) return 1;
  const bt = (st.bt += dt), D = BEATS[st.beat], h = sstep(0, 0.25, bt) * (1 - sstep(D - 0.3, D, bt));
  let lookW = 1 - h;
  if (st.beat === 'tap') {                                       // hands on hips, rolls his eyes, taps a foot: "well?"
    const tap = Math.max(0, Math.sin((bt - 0.3) * 12.5)) * sstep(0.3, 0.4, bt) * (1 - sstep(D - 0.45, D - 0.3, bt));
    T.fR = -0.42 * tap; T.y += 0.35 * tap * h; T.rz += 0.04 * h;
    T.aLz = mix(T.aLz, -0.78, h); T.aRz = mix(T.aRz, 0.78, h); T.aLx = T.aRx = 0.55 * h; T.aLy = -0.25 * h; T.aRy = 0.25 * h;
    T.hz += 0.12 * h; T.hx += -0.08 * h; T.px = 0.55 * h; T.py = 0.85 * h; T.lid = 0.38 * h; T.bOn = h; T.by = 0.3; T.brow = 0.25 * h;
    T.jaw = 0.16 * h * Math.abs(Math.sin(bt * 7));                // mutters, bill clacking
  } else if (st.beat === 'glance') {                             // shifty look left, right, back: anyone watching?
    const g = -sstep(0.15, 0.3, bt) * (1 - sstep(0.85, 1.0, bt)) + sstep(0.95, 1.1, bt) * (1 - sstep(1.7, 1.85, bt));
    T.hy = mix(T.hy, g * 0.62, h); T.ry += g * 0.12 * h; T.px = g * 1.0; T.py = -0.1 * h;
    T.y -= 0.8 * h; T.sq = 1 - 0.03 * h; T.aLz = mix(T.aLz, -0.08, h); T.aRz = mix(T.aRz, 0.08, h);
    T.bOn = h; T.by = 0.2; T.brow = 0.45 * h; T.lid = 0.3 * h; T.hatRx -= 0.12 * h; lookW = 0;
  } else {                                                       // polishes his badge with his cuff, then puffs his chest
    const rub = sstep(0.2, 0.45, bt) * (1 - sstep(1.35, 1.6, bt)), proud = sstep(1.5, 1.75, bt) * h;
    T.aRz = mix(T.aRz, -0.5, rub) + Math.sin(bt * 24) * 0.14 * rub; T.aRx = -1.2 * rub; T.aRs = 1 + 0.12 * rub;   // cuff on the badge
    T.hx += 0.14 * rub - 0.22 * proud; T.hy = mix(T.hy, 0.25, rub); T.px = 0.6 * rub; T.py = -0.9 * rub;
    T.rx = -0.12 * proud; T.sq = 1 + 0.05 * proud; T.happy = proud > 0.4 ? 1 : 0; T.jaw = 0.25 * proud;
    T.aLz = mix(T.aLz, -0.55, proud); T.aLx = 0.5 * proud;
    if (st.lastBt < 1.55 && bt >= 1.55) st.glint = 1;
  }
  st.lastBt = bt;
  if (bt >= D) { st.beat = null; st.beatNext = 4.5 + Math.random() * 3.5; }
  return lookW;
}
function poseTargets(T, st, dt) {
  Object.assign(T, NEUTRAL); T.fast = 0;
  const pt = st.pt, t = st.t;
  switch (st.pose) {
    case 'idle': {
      T.y = Math.sin(t * 2.4) * 0.35; T.rz = Math.sin(t * 1.2) * 0.035; T.hz = Math.sin(t * 1.2 + 0.7) * 0.05;
      T.aLz = -0.24 - Math.sin(t * 2.4) * 0.05; T.aRz = 0.24 + Math.sin(t * 2.4) * 0.05;
      lookHead(T, st, idleBeat(T, st, dt));
      break;
    }
    case 'happy': {
      const per = 0.56, p = (pt % per) / per, hop = Math.sin(Math.PI * p);
      T.y = hop * 5.5; T.sq = p < 0.08 || p > 0.93 ? 0.84 : 1 + 0.08 * hop; T.fast = 1;
      const f = Math.abs(Math.sin(pt * 15)); T.aLz = -0.7 - f * 1.15; T.aRz = 0.7 + f * 1.15;
      T.happy = 1; T.jaw = 0.42; T.hz = Math.sin(pt * 6) * 0.12; T.rz = Math.sin(pt * 5.6) * 0.06; lookHead(T, st, 0.5);
      T.hatY = Math.max(0, Math.sin(Math.PI * (((pt + 0.5) - 0.08) % per) / per)) * 1.4;
      break;
    }
    case 'angry': {
      T.flush = 1; T.brow = 1; T.lid = 0.3; T.pupil = 0.75; T.fast = 1;
      T.jaw = 0.55 + Math.sin(pt * 23) * 0.22; T.x = Math.sin(pt * 70) * 0.55; T.y = Math.abs(Math.sin(pt * 12)) * 1.1; T.rz = -0.06 + Math.sin(pt * 35) * 0.02;
      T.aLz = -2.2 + Math.sin(pt * 31) * 0.28; T.aRz = 2.2 - Math.sin(pt * 31 + 1.3) * 0.28; T.aLx = T.aRx = 0.5;
      T.hatY = Math.abs(Math.sin(pt * 24)) * 0.8; T.hx = -0.1; T.steam = 16; lookHead(T, st, 0.55);
      break;
    }
    case 'shot': {   // yelp, fall STRAIGHT BACK (feet toward the camera, belly + face up), seeing stars, pop up fuming; 1.6 s
      const fall = sstep(0.06, 0.3, pt) * (1 - sstep(1.0, 1.2, pt)), up = pt > 1.0 && pt < 1.5 ? Math.sin((pt - 1.0) / 0.5 * Math.PI) : 0;
      const land = pt > 0.3 && pt < 0.6 ? Math.sin((pt - 0.3) / 0.3 * Math.PI) * (1 - (pt - 0.3) / 0.3) : 0;
      const cy = st.camYaw * sstep(0.0, 0.2, pt) * (1 - sstep(1.05, 1.3, pt));   // square up to the camera, then fall away from it
      const fwd = 7 * fall;                                     // slide toward the camera so he lies on his own spot
      T.fast = 1; T.ry = cy; T.rx = -1.5 * fall + up * 0.25 - land * 0.12; T.y = 9.4 * fall + land * 2.6 + up * 3.5;
      T.x = Math.sin(cy) * fwd; T.z = Math.cos(cy) * fwd;
      T.sq = pt < 0.08 ? 1.18 : (pt > 0.3 && pt < 0.38) ? 0.82 : (up > 0.3 ? 1.12 : 1);
      if (pt < 0.3) { T.pupil = 0.5; T.jaw = 1; T.aLz = -2.6; T.aRz = 2.6; T.hatY = pt < 0.2 ? 4 : 1; T.lid = 0; T.hx = -0.35 * fall; T.nb = 1; }
      else if (pt < 1.0) {                                      // flat on his back: chin tucked so his dizzy face looks at the player
        T.hx = 0.62; T.aLz = -1.45; T.aRz = 1.45; T.aLx = T.aRx = 0.25; T.jaw = 0.3 + Math.sin(pt * 9) * 0.1;
        T.fL = Math.sin(pt * 21) * 0.45; T.fR = Math.sin(pt * 21 + 2.2) * 0.45;   // legs in the air, twitching
        T.px = Math.cos(pt * 11) * 0.9; T.py = Math.sin(pt * 11) * 0.9; T.hatRz = 0.45; T.hatRx = 0.2; T.flush = 1; st.stars = 1;
        if (pt > 0.6) { T.brow = 1; T.steam = 10; }
      } else { T.flush = 1; T.brow = 1; T.steam = 16; T.jaw = 0.6 + Math.sin(pt * 23) * 0.2; T.aLz = -2.2 + Math.sin(pt * 31) * 0.28; T.aRz = 2.2 - Math.sin(pt * 31 + 1.3) * 0.28; T.aLx = T.aRx = 0.5; T.x += pt > 1.2 ? Math.sin(pt * 70) * 0.5 : 0; T.lid = 0.3; T.hx = 0.62 * fall; }
      if (pt >= 1.6) { st.pose = st.hover ? 'scared' : st.after; st.pt = 0; st.hoverT0 = st.t; st.beat = null; st.beatNext = 3; }
      break;
    }
    case 'present': {                                           // ta-da: points at something (dir +1 = his +x side)
      const d = st.dir, a = sstep(0, 0.2, pt), ov = pt < 0.45 ? Math.sin(pt / 0.45 * Math.PI) * 0.25 : 0;
      T.ry = d * 0.28; T.y = pt < 0.28 ? Math.sin(pt / 0.28 * Math.PI) * 2.5 : Math.sin(t * 2.2) * 0.3; T.fast = pt < 0.3 ? 1 : 0;
      if (d > 0) { T.aRz = mix(0.24, 1.45 + ov, a); T.aRy = -0.45 * a; T.aLz = -0.6; T.aLx = -0.2; }
      else { T.aLz = mix(-0.24, -1.45 - ov, a); T.aLy = 0.45 * a; T.aRz = 0.6; T.aRx = -0.2; }
      const lw = sstep(0.7, 1.2, pt) * 0.75;                     // after the ta-da the head follows the crosshair, the arm keeps pointing
      T.hy = d * mix(0.55, 0.1, sstep(0.6, 1.0, pt)); T.px = d * (pt < 0.8 ? 0.9 : 0.2) * (1 - lw); T.hz = -d * 0.06; lookHead(T, st, lw);
      T.jaw = pt < 1.5 ? 0.12 + 0.28 * Math.abs(Math.sin(pt * 11)) : 0.16; T.bOn = 1; T.by = 0.9;
      break;
    }
    case 'cheer': {
      const per = 0.5, p = (pt % per) / per, hop = Math.sin(Math.PI * p);
      T.y = hop * 7; T.sq = p < 0.08 || p > 0.93 ? 0.82 : 1 + 0.1 * hop; T.fast = 1;
      T.aLz = -2.7 + Math.sin(pt * 13) * 0.3; T.aRz = 2.7 + Math.sin(pt * 13 + Math.PI) * 0.3; T.aLx = T.aRx = 0.2;
      T.happy = 1; T.jaw = 0.8; T.hatY = Math.max(0, Math.sin(Math.PI * Math.min(1, ((pt + 0.07) % per) / per * 1.15))) * 4.5;
      T.hatRz = Math.sin(pt * 9) * 0.25; T.ry = Math.sin(pt * 2.6) * 0.3; T.hz = Math.sin(pt * 7) * 0.08;
      if (st.lastP > 0.8 && p < 0.2) st.confetti = 1; st.lastP = p;
      break;
    }
    case 'sad': {
      const sp = (t % 3.2) / 3.2, sigh = sp < 0.35 ? Math.sin(sp / 0.35 * Math.PI) : 0;
      T.sq = 0.94 + sigh * 0.04; T.rz = Math.sin(t * 0.8) * 0.05; T.hx = 0.24 - sigh * 0.12; T.hz = 0.1; T.lid = 0.5; T.py = -0.9; T.brow = -1;
      T.aLz = -0.1; T.aRz = 0.1; T.aLx = T.aRx = -0.3; T.jaw = 0.06 + sigh * 0.2; T.hatRx = 0.02; T.hatRz = 0.16; T.y = -0.4 + sigh * 0.8;
      if (st.lastSigh < 0.35 && sp >= 0.35) st.sighPuff = 1; st.lastSigh = sp;
      st.tearT -= dt; if (st.tearT <= 0) { st.tear = 1; st.tearT = 1.6 + Math.random() * 1.2; }
      break;
    }
    case 'scared': {   // crosshair on him: startle hop, hands UP, eyes wide, pinprick pupils, sweat, shaking, hat lifts
      const e = sstep(0, 0.1, pt), hop = pt < 0.24 ? Math.sin(pt / 0.24 * Math.PI) : 0, sh = e * (1 - hop * 0.6);
      T.fast = 1; T.nb = 1; T.sweat = pt > 0.12 ? 7 : 0;
      T.y = hop * 3.4 - 0.7 * e + Math.abs(Math.sin(pt * 31)) * 0.25 * sh; T.sq = pt < 0.05 ? 0.86 : 1 + hop * 0.1 - 0.035 * e;
      T.x = Math.sin(pt * 63) * 0.42 * sh; T.rz = Math.sin(pt * 47) * 0.03 * sh; T.rx = -0.13 * e;
      T.aLz = -2.72 + Math.sin(pt * 53) * 0.08; T.aRz = 2.72 + Math.sin(pt * 57 + 1) * 0.08; T.aLx = T.aRx = 0.22;   // "don't shoot!"
      T.aLs = T.aRs = 1.15;
      T.lid = 0; T.pupil = 0.4; T.bOn = 1; T.by = 1.9; T.brow = -0.6;
      T.jaw = 0.28 + Math.sin(pt * 38) * 0.12;                   // teeth (bill) chattering
      T.hatY = 3.2 * e + Math.abs(Math.sin(pt * 29)) * 0.9; T.hatRz = 0.07 + Math.sin(pt * 21) * 0.07;
      T.fL = Math.sin(pt * 45) * 0.09; T.fR = Math.sin(pt * 45 + 2) * 0.09;   // knocking knees
      lookHead(T, st, 0.7); T.hx -= 0.08 * e; T.px += Math.sin(pt * 13) * 0.2;
      break;
    }
    case 'relief': {   // crosshair gone: slump + sigh (puff and a wavy line), wipe the brow, flick the sweat, back to rest
      const slump = sstep(0.04, 0.3, pt) * (1 - sstep(1.2, 1.5, pt)), ex = sstep(0.1, 0.22, pt) * (1 - sstep(0.5, 0.68, pt));
      const w = sstep(0.5, 0.66, pt) * (1 - sstep(1.0, 1.18, pt)), sw = sstep(0.66, 0.96, pt);
      T.sq = 1 - 0.09 * slump + ex * 0.03; T.y = -1.3 * slump; T.rx = 0.06 * slump;
      T.hx = 0.16 * slump + 0.1 * w; T.hz = -0.3 * w;
      T.lid = Math.max(0.5 * slump, 0.85 * w); T.jaw = 0.4 * ex; T.py = -0.5 * slump;
      T.aLz = -0.1; T.aRz = 0.1; T.aLx = T.aRx = -0.12;                                   // arms dangle
      T.aRz = mix(0.1, 2.6, w); T.aRx = mix(-0.12, 0.6, w); T.aRy = w * mix(-0.15, -1.0, sw); T.aRs = 1 + 0.5 * w; T.aRo = 4 * w;   // hand across the brow
      T.hatY = 0.6 * w; T.hatRz = 0.07 + 0.1 * w;
      if (st.lastRt < 0.16 && pt >= 0.16) st.sighWave = 1;
      if (st.lastRt < 0.95 && pt >= 0.95) st.flick = 1;
      st.lastRt = pt;
      if (pt >= 1.5) { st.pose = st.rest; st.pt = 0; st.pop = 0; st.beat = null; st.beatNext = 2.5 + Math.random() * 2; }
      break;
    }
    case 'laugh': {    // the player MISSED: eyes squeezed ^ ^, bill clacking HA-HA-HA, belly bob, points at you, slaps his belly; 1.2 s
      const a = sstep(0, 0.12, pt) * (1 - sstep(1.0, 1.2, pt)), env = sstep(0.1, 0.22, pt) * (1 - sstep(0.9, 1.15, pt));
      const u = pt - 0.15, ph = u * 6.5, hr = u > 0 ? Math.max(0, Math.sin(ph * 2 * Math.PI)) : 0, hk = hr * env;   // 6.5 "HA"s a second
      const sl = u > 0 ? (0.5 + 0.5 * Math.cos(Math.PI * (ph + 0.05))) * env : 0;     // belly slap on every other HA (leads: the arm eases in ~50 ms)
      T.fast = 1; T.nb = 1; T.happy = pt < 1.1 ? 1 : 0;
      T.sq = 1 + 0.06 * Math.max(0, a - env) - 0.1 * hk; T.y = 0.9 * hk; T.rx = -0.05 * a - 0.03 * hk; T.rz = Math.sin(pt * 8) * 0.04 * env;
      lookHead(T, st, 0.4); T.hx += -0.1 * a - 0.04 * hk; T.hz += Math.sin(ph * Math.PI) * 0.07 * env;    // head tipped back a touch, wobbling
      T.jaw = a * mix(0.36, 0.22 + 0.2 * hr, env);                                // "HA" on every pulse, never wider than 'happy' (0.42)
      // finger at the player: arm level, swung forward to ~55 deg off the camera line so the hand clears his silhouette
      // (a point straight down the lens vanishes into his yellow body at 60 px); jabs with every HA (right-arm sign)
      const pZ = mix(0.24, 1.5 + 0.12 * hk, a), pY = (clamp(st.lside * st.camYaw + 0.95, 0.45, 1.3) - Math.PI / 2) * a;
      const sX = mix(0, mix(-0.3, -0.58, sl), a), sZ = mix(-0.24, mix(0.05, 0.6, sl), a);                               // hand onto the belly (left-arm sign)
      if (st.lside > 0) { T.aRz = pZ; T.aRy = pY; T.aRs = 1 + 0.1 * a; T.aLx = sX; T.aLz = sZ; }
      else { T.aLz = -pZ; T.aLy = -pY; T.aLs = 1 + 0.1 * a; T.aRx = sX; T.aRz = -sZ; }
      T.hatY = 0.4 * a + 1.3 * hk; T.hatRx = -0.24 - 0.1 * hk; T.hatRz = 0.07 + Math.sin(pt * 9) * 0.08 * env;
      T.sweat = pt > 0.35 && pt < 0.95 ? 4 : 0;                                   // tears of laughter squirting off his temples
      if (pt >= 1.2) { st.pose = st.rest; st.pt = 0; st.pop = 0; st.beat = null; st.beatNext = 2.5 + Math.random() * 2; }
      break;
    }
  }
}

// ---------- 7. THE DUCK OBJECT ----------
function create(THREE, opts) {
  opts = opts || {};
  const mat = toonMaterial(THREE, { light: [-0.45, 0.62, 0.64], tHi: 0.72, tLo: 0.12, strip: [-0.35, 0.62, 0.7], stripOff: 1.0, stripW: 0.045, stripP: 100, rim: 0.2, fog: opts.fog !== false, footP: [PIV.heel[0] * DV, PIV.heel[1] * DV] });
  const parts = buildDuck(THREE, mat);
  const group = new THREE.Group(); group.name = 'BLAM.duck';
  const node = (parent, piv, ppiv) => { const g = new THREE.Group(); g.position.set((piv[0] - ppiv[0]) * DV, (piv[1] - ppiv[1]) * DV, (piv[2] - ppiv[2]) * DV); g.userData.p0 = g.position.clone(); parent.add(g); return g; };
  const O = [0, 0, 0], root = new THREE.Group(), squash = new THREE.Group();
  root.rotation.order = 'YXZ';                                               // fall about his own x, then yaw: lies in profile
  group.add(root); root.add(parts.feet); root.add(squash); squash.add(parts.body);
  const armL = node(squash, PIV.armL, O), armR = node(squash, PIV.armR, O), neck = node(squash, PIV.neck, O);
  armL.add(parts.armL); armR.add(parts.armR); neck.add(parts.head); neck.add(parts.happy);
  const jaw = node(neck, PIV.jaw, PIV.neck), eyeL = node(neck, PIV.eyeL, PIV.neck), eyeR = node(neck, PIV.eyeR, PIV.neck);
  const lids = node(neck, PIV.lids, PIV.neck), browL = node(neck, PIV.browL, PIV.neck), browR = node(neck, PIV.browR, PIV.neck), hat = node(neck, PIV.hat, PIV.neck);
  jaw.add(parts.jaw); lids.add(parts.lids); browL.add(parts.browL); browR.add(parts.browR); hat.add(parts.hat);
  for (const [eye, pu, ec] of [[eyeL, parts.pupilL, PIV.eyeL], [eyeR, parts.pupilR, PIV.eyeR]]) {   // pupils: own pivot on the eye front, swivel with the eye
    const p = pu.userData.piv; eye.add(pu); pu.position.set((p[0] - ec[0]) * DV, (p[1] - ec[1]) * DV, (p[2] - ec[2]) * DV);
  }
  // particles: steam, confetti, tears, sighs, sweat, glints + the three dizzy stars (last 3 slots): ONE InstancedMesh = 1 draw call
  const PN = 64, pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), PN + 3);
  pm.frustumCulled = false; pm.visible = false; group.add(pm);
  pm.geometry.boundingBox = new THREE.Box3();                                 // effects never count toward the duck's bounds
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), pd = [];
  for (let i = 0; i < PN; i++) { pd.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1, g: 0, drag: 0, grow: 0, r: 0, w: 0 }); pm.setMatrixAt(i, ZERO); pm.setColorAt(i, _c.set(0xffffff)); }
  for (let i = 0; i < 3; i++) { pm.setMatrixAt(PN + i, ZERO); pm.setColorAt(PN + i, _c.setHex(i === 1 ? PAL.lemon : PAL.yellow)); }
  // the camera that last drew him (for an honest screen-space look-at and a camera-facing fall); no engine change needed
  let cam = null; const grabCam = (r, s, c) => { cam = c; };
  parts.body.onBeforeRender = grabCam; parts.head.onBeforeRender = grabCam;
  const _hl = new THREE.Vector3(0, 25.4 * DV, 0.4 * DV), _hw = new THREE.Vector3(), _cw = new THREE.Vector3(), _tw = new THREE.Vector3(), _inv = new THREE.Matrix4();
  let pNext = 0;
  function spawn(p, v, s, col, life, g, drag, grow, spin) {
    const i = pNext, d = pd[i]; pNext = (pNext + 1) % PN;
    d.p.copy(p); d.v.copy(v); d.s = s; d.life = d.max = life; d.g = g; d.drag = drag || 0; d.grow = grow || 0; d.r = Math.random() * 6; d.w = spin || 0;
    pm.setColorAt(i, _c.setHex(PAL[col])); pm.instanceColor.needsUpdate = true;
  }
  // node-relative voxel point -> group space (default node: the neck)
  const at = (x, y, z, out, nd) => { group.updateMatrixWorld(true); (nd || neck).localToWorld(out.set(x * DV, y * DV, z * DV)); return group.worldToLocal(out); };
  const st = { pose: 'idle', after: 'idle', rest: 'idle', pt: 0, t: 0, dir: 1, blinkT: 2.2, blink: 0,
    look: { nx: 0, ny: 0, yaw: 0, pitch: 0 }, lk: { yaw: 0, pitch: 0 }, camYaw: 0, hover: false, hoverT0: 0,
    beat: null, beatI: 0, bt: 0, lastBt: 0, beatNext: 3 + Math.random() * 2, lastRt: 0, sweatAcc: 0, sighWave: 0, flick: 0, glint: 0,
    lside: 1, pop: 0, flushLine: 0, steamAcc: 0, lastP: 0, lastSigh: 0, tearT: 1.2, stars: 0, starsOn: 0, confetti: 0, sighPuff: 0, tear: 0, mirror: 1 };
  // where is the crosshair, seen from his head?  NDC -> a point on the camera ray, a bit in front of him -> duck-space yaw/pitch.
  // Works for any holder transform, including the mirrored (negative x scale) right-hand spots and the camera-child mini duck.
  function computeLook() {
    const L = st.look; let yaw, pitch;
    if (cam && cam.isPerspectiveCamera) {
      _hw.copy(_hl).applyMatrix4(group.matrixWorld); _cw.setFromMatrixPosition(cam.matrixWorld);
      const d = _hw.distanceTo(_cw);
      _tw.set(L.nx, L.ny, 0.5).unproject(cam).sub(_cw).normalize().multiplyScalar(d * 0.62).add(_cw);
      _inv.copy(group.matrixWorld).invert(); _tw.applyMatrix4(_inv).sub(_hl);
      yaw = Math.atan2(_tw.x, _tw.z); pitch = Math.atan2(_tw.y, Math.hypot(_tw.x, _tw.z));
      _cw.applyMatrix4(_inv); st.camYaw = clamp(Math.atan2(_cw.x - _hl.x, _cw.z - _hl.z), -1.2, 1.2);
    } else { yaw = L.nx * st.mirror * 0.8; pitch = L.ny * 0.3; st.camYaw = 0; }       // not drawn yet: screen-centre guess
    yaw = clamp(yaw, st.camYaw - 1.15, st.camYaw + 1.15);                       // never turns further than ~65 deg off the player
    L.yaw = clamp(yaw, -1.0, 1.0); L.pitch = clamp(pitch, -0.4, 0.45);
  }
  const C = Object.assign({}, NEUTRAL), T = Object.assign({}, NEUTRAL);
  const browBase = [browL.userData.p0.y, browR.userData.p0.y], hatBase = hat.userData.p0.y;
  function apply() {
    root.position.set(C.x * DV, C.y * DV, C.z * DV); root.rotation.set(C.rx, C.ry, C.rz);
    const pop = st.pop > 0 ? Math.sin(st.pop / 0.16 * Math.PI) * 0.1 : 0, side = 1 + (1 - C.sq) * 0.6 - pop * 0.5;
    squash.scale.set(side, C.sq + pop, side);
    parts.feet.rotation.x = C.feet; mat.uniforms.uFoot.value.set(C.fL, C.fR);
    neck.rotation.set(C.hx, C.hy, C.hz); jaw.rotation.x = C.jaw * 0.55;
    armL.rotation.set(C.aLx, C.aLy, C.aLz); armR.rotation.set(C.aRx, C.aRy, C.aRz);
    armL.scale.set(1 + (C.aLs - 1) * 0.3, C.aLs, 1 + (C.aLs - 1) * 0.3); armR.scale.set(1 + (C.aRs - 1) * 0.3, C.aRs, 1 + (C.aRs - 1) * 0.3);
    armR.position.set(armR.userData.p0.x - C.aRo * 0.4 * DV, armR.userData.p0.y + C.aRo * DV, armR.userData.p0.z + C.aRo * DV);   // shoulder shrug (relief wipe)
    const lid = Math.max(C.lid, st.blink > 0 && T.nb < 0.5 ? 1 : 0, C.happy > 0.5 ? 1 : 0);
    lids.scale.y = Math.max(0.001, lid); parts.lids.visible = lid > 0.05; parts.happy.visible = C.happy > 0.5;
    parts.pupilL.visible = parts.pupilR.visible = C.happy <= 0.5;
    parts.pupilL.scale.setScalar(C.pupil); parts.pupilR.scale.setScalar(C.pupil);
    eyeL.rotation.set(-C.py * 0.32, C.px * 0.4 + C.pc * 0.4, 0); eyeR.rotation.set(-C.py * 0.32, C.px * 0.4 - C.pc * 0.4, 0);
    parts.browL.visible = parts.browR.visible = Math.abs(C.brow) > 0.15 || C.bOn > 0.5;
    browL.rotation.z = -C.brow * 0.42; browR.rotation.z = C.brow * 0.42;
    browL.position.y = browBase[0] + (C.by - Math.max(0, C.brow) * 0.7) * DV; browR.position.y = browBase[1] + (C.by - Math.max(0, C.brow) * 0.7) * DV;
    hat.position.y = hatBase + C.hatY * DV; hat.rotation.set(C.hatRx, 0, C.hatRz);
    mat.uniforms.uFlush.value = C.flush; mat.uniforms.uFlushY.value = st.flushLine;
  }
  function effects(dt) {
    if (C.steam > 1) {                                                         // steam puffs out of both sides of the hat
      st.steamAcc += dt * C.steam;
      while (st.steamAcc >= 1) { st.steamAcc -= 1; const s = Math.random() < 0.5 ? -1 : 1;
        at(s * (6 + Math.random() * 2), 17 + Math.random() * 2, Math.random() * 2, _p);
        spawn(_p, _v.set(s * (0.15 + Math.random() * 0.25), 0.55 + Math.random() * 0.4, 0.05), 0.045 + Math.random() * 0.025, Math.random() < 0.5 ? 'mist' : 'bone', 0.7, -0.05, 1.6, 1.2); }
    }
    if (st.confetti) { st.confetti = 0; at(0, 22, 2, _p);
      for (let i = 0; i < 10; i++) spawn(_p, _v.set((Math.random() - 0.5) * 2.2, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2), 0.03, ['pink', 'cyan', 'lemon', 'lime', 'orange'][i % 5], 1.0, 0.45, 0.6, 0, 12); }
    if (st.sighPuff) { st.sighPuff = 0; at(0, 5, 14, _p); spawn(_p, _v.set(0, 0.15, 0.35), 0.04, 'mist', 0.6, -0.03, 1.5, 1.3); }
    if (st.tear) { st.tear = 0; at(st.mirror * (Math.random() < 0.5 ? -6.2 : 6.2), 9, 8, _p); spawn(_p, _v.set(0, -0.1, 0.25), 0.028, 'ice', 0.9, 0.35, 0.3, 0, 0); }
    if (T.sweat > 0) {                                                         // nervous sweat beads flying off his temples
      st.sweatAcc += dt * T.sweat;
      while (st.sweatAcc >= 1) { st.sweatAcc -= 1; const s = Math.random() < 0.5 ? -1 : 1;
        at(s * (8.6 + Math.random()), 10 + Math.random() * 4, 3 + Math.random() * 3, _p);
        spawn(_p, _v.set(s * (0.35 + Math.random() * 0.3), 0.45 + Math.random() * 0.35, 0.2), 0.03, Math.random() < 0.6 ? 'ice' : 'cyan', 0.65, 0.32, 0.2, 0, 0); }
    } else st.sweatAcc = 0;
    if (st.sighWave) { st.sighWave = 0; at(0, 5.4, 15.5, _p);                // "phew": a puff + a wavy ~~~ line drifting off the bill
      spawn(_p, _v.set(-0.28, 0.06, 0.2), 0.045, 'bone', 0.7, -0.03, 1.4, 1.2, 1);
      const ox = _p.x - 0.05, oy = _p.y - 0.01, oz = _p.z;                      // trail off to his side so it never covers the face
      for (let i = 0; i < 7; i++) spawn(_p.set(ox - i * 0.04, oy + Math.sin(i * 1.6) * 0.028, oz + i * 0.01), _v.set(-0.3, 0.1, 0.12), 0.032, i % 2 ? 'mist' : 'bone', 1.0 - i * 0.04, -0.02, 0.9, 0, 0);
    }
    if (st.flick) { st.flick = 0; at(1.5, -7.6, 1.5, _p, armR);              // flicks the brow sweat off his hand
      for (let i = 0; i < 4; i++) spawn(_p, _v.set(0.7 + Math.random() * 0.5, 0.5 + Math.random() * 0.5, 0.2 + Math.random() * 0.2), 0.026, i % 2 ? 'ice' : 'cyan', 0.6, 0.4, 0.3, 0, 0); }
    if (st.glint) { st.glint = 0; at(3.9, 14.2, 11.5, _p, squash);           // badge sparkle after the polish
      spawn(_p, _v.set(0, 0, 0.05), 0.045, 'bone', 0.4, 0, 0, 1.4, 8); spawn(_p, _v.set(0, 0, 0.05), 0.03, 'lemon', 0.5, 0, 0, 2.2, -6); }
    let live = 0;
    for (let i = 0; i < PN; i++) {
      const d = pd[i]; if (d.life <= 0) continue;
      d.life -= dt; if (d.life <= 0) { pm.setMatrixAt(i, ZERO); continue; }
      live++; d.v.y -= 9.8 * d.g * dt; if (d.drag) d.v.multiplyScalar(Math.max(0, 1 - d.drag * dt)); d.p.addScaledVector(d.v, dt); d.r += d.w * dt;
      const k = d.s * (1 + d.grow * (1 - d.life / d.max)) * Math.min(1, d.life / 0.1);
      pm.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(_e.set(d.r, d.r * 0.7, 0)), _s.set(k, k, k)));
    }
    st.starsOn += ((st.stars ? 1 : 0) - st.starsOn) * Math.min(1, dt * 12); st.stars = 0;
    const starsOn = st.starsOn > 0.05;
    for (let i = 0; i < 3; i++) {                                              // dizzy stars circling his head (last 3 instances)
      if (!starsOn) { pm.setMatrixAt(PN + i, ZERO); continue; }
      const a = st.t * 5 + i * 2.094; at(0, 9, 1, _p); _p.x += Math.cos(a) * 0.2; _p.z += Math.sin(a) * 0.2; _p.y += 0.26 + Math.sin(a * 2) * 0.02;
      pm.setMatrixAt(PN + i, _m.compose(_p, _q.setFromEuler(_e.set(0.6, st.t * 6 + i, 0.6)), _s.setScalar(0.05 * st.starsOn)));
    }
    pm.visible = live > 0 || starsOn; pm.instanceMatrix.needsUpdate = true;
  }
  function update(dt, t) {
    dt = Math.min(0.05, Math.max(0, +dt || 0)); st.t = t !== undefined ? +t : st.t + dt; st.pt += dt;
    st.pop = Math.max(0, st.pop - dt);
    st.blinkT -= dt; if (st.blinkT <= 0) { st.blink = 0.12; st.blinkT = 1.8 + Math.random() * 3; } st.blink = Math.max(0, st.blink - dt);
    st.mirror = group.matrixWorld.determinant() < 0 ? -1 : 1;
    computeLook();
    const lr = 1 - Math.exp(-6 * dt);                                          // soft lag: the head follows, the eyes lead
    st.lk.yaw += (st.look.yaw - st.lk.yaw) * lr; st.lk.pitch += (st.look.pitch - st.lk.pitch) * lr;
    poseTargets(T, st, dt);
    if (duck.debugPose) Object.assign(T, duck.debugPose);                      // review hook (viewer tuning); null in the game
    for (const k in C) { const r = T.fast && (k === 'x' || k === 'y' || k === 'z' || k === 'sq' || k === 'rx') ? 60 : (RATE[k] || 18); C[k] += (T[k] - C[k]) * (1 - Math.exp(-r * dt)); }
    if (T.flush > 0.5) st.flushLine = Math.min(1.25, st.flushLine + dt * 2.6); else if (C.flush < 0.03) st.flushLine = 0;
    apply(); effects(dt);
  }
  function enter(name) {
    st.pose = name; st.pt = 0; st.pop = name === 'scared' || name === 'shot' ? 0 : 0.16; st.lastP = 0; st.lastRt = 0; st.beat = null;
    if (name === 'idle') st.beatNext = 3 + Math.random() * 3;
  }
  // setPose: resting / reaction poses become the "rest" pose.  While the crosshair is on him (hover) he stays scared and
  // only remembers the new rest pose; relief is interrupted by any real pose.  'scared' / 'relief' can be forced directly.
  function setPose(name, o) {
    if (POSES.indexOf(name) < 0) return;
    if (o && o.dir) st.dir = o.dir < 0 ? -1 : 1;
    if (name === 'shot') { if (st.pose !== 'shot') { st.after = 'angry'; enter('shot'); } return; }
    if (name === 'laugh') {                                                   // one-shot taunt: leaves st.rest alone, returns to it by itself
      if (st.pose === 'shot' || (st.hover && st.pose === 'scared')) return;   // never cuts the hit gag; stays scared under the crosshair
      if (st.pose === 'laugh') { if (st.pt > 0.5) st.pt -= Math.floor((st.pt - 0.2) / LAUGH_P) * LAUGH_P; return; }   // missed again: keep laughing, same rhythm
      enter('laugh'); st.lside = st.camYaw > 0.1 ? -1 : 1; return;            // point with the far-side arm (it swings out clear of his body), slap with the near one
    }
    if (!OVERLAY[name]) { st.rest = name; if (st.hover && st.pose === 'scared') return; }
    if (name === st.pose) return;
    enter(name);
  }
  // setHover(isHovered): call every frame (or on change); only the edges do anything.
  //   rising edge  -> 'scared' (ignored while 'shot' plays; he goes scared after the gag if still hovered)
  //   falling edge -> 'relief' if he was scared for >= 0.25 s, else straight back to the rest pose; nothing if not scared
  function setHover(on) {
    on = !!on; if (on === st.hover) return;
    st.hover = on;
    if (on) { st.hoverT0 = st.t; if (st.pose !== 'shot' && st.pose !== 'scared') enter('scared'); return; }
    if (st.pose === 'scared') enter(st.t - st.hoverT0 >= 0.25 ? 'relief' : st.rest);       // st.t = the t given to update()
  }
  const hitList = [parts.body, parts.head, parts.hat, parts.armL, parts.armR, parts.feet, parts.jaw];
  const duck = {
    group, POSES,
    get pose() { return st.pose; },
    get hovered() { return st.hover; },
    setPose, setHover,
    hit() { st.after = 'idle'; enter('shot'); },
    update,
    debugPose: null,
    playBeat(name) { if (BEATS[name]) { if (st.pose !== 'idle') enter('idle'); st.beat = name; st.bt = 0; st.lastBt = 0; } },   // review hook
    lookAt(x, y) { st.look.nx = clamp(+x || 0, -1, 1); st.look.ny = clamp(+y || 0, -1, 1); },
    hitTest(raycaster) {
      if (!raycaster || !group.visible) return false;
      group.updateMatrixWorld(true);
      const hits = raycaster.intersectObjects(hitList.filter(m => m.visible), false);
      duck.lastHit = hits[0] || null;
      return hits.length > 0;
    },
    lastHit: null,
    dispose() {
      if (group.parent) group.parent.remove(group);
      for (const k in parts) parts[k].geometry.dispose();
      mat.dispose(); pm.geometry.dispose(); pm.material.dispose();
    }
  };
  update(0, 0);
  return duck;
}
BLAM.Duck = { create, POSES };
})();
