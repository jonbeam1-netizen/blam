/* =========================================================================================
   B.L.A.M. ("Blast like a maniac!")  --  js/duck.js
   DEPUTY DUCK, the game's mascot: a round, fully volumetric voxel duck (SDF-voxelised parts with
   smooth normals), deputy sheriff hat with a star, silver badge on his chest, three black head
   feathers, stubby arms that can hold his head, flat orange feet.  No plinth: he stands on his own feet.
   Same "toy plastic" material as js/guns.js (palette toon tones + gloss highlight + void outline);
   output alpha 1.0 = the "object" dither class.  Faces +z, feet on y = 0, about 1.0 unit tall.
   API: BLAM.Duck.create(THREE, opts) -> duck  (see the bottom of this file)
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
attribute vec3 cBase; attribute vec3 cLo; attribute vec3 cHi; attribute vec3 cSh; attribute vec4 aInfo;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP;
#include <fog_pars_vertex>
void main() {
  vB = cBase; vL = cLo; vH = cHi; vS = cSh; vI = aInfo;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vP = mvPosition.xyz; vN = normalize(normalMatrix * normal);
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
  constructor(smooth) { this.p = []; this.n = []; this.cb = []; this.cl = []; this.ch = []; this.cs = []; this.inf = []; this.idx = []; this.vc = 0; this.smooth = smooth || 0.75; }
  // one face (f = FACES index) of an axis box centred (x,y,z) with half sizes; C = cspec; I = [gloss, flush, emissive, height]
  face(x, y, z, hx, hy, hz, f, C, I, nrm, flip) {
    const F = FACES[f], q = F[3];
    let nx = F[0], ny = F[1], nz = F[2];
    if (nrm) { const k = this.smooth; nx = nx * (1 - k) + nrm[0] * k; ny = ny * (1 - k) + nrm[1] * k; nz = nz * (1 - k) + nrm[2] * k;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
    for (let v = 0; v < 12; v += 3) {
      this.p.push(x + q[v] * hx, y + q[v + 1] * hy, z + q[v + 2] * hz); this.n.push(nx, ny, nz);
      this.cb.push(C[0][0], C[0][1], C[0][2]); this.cl.push(C[1][0], C[1][1], C[1][2]);
      this.ch.push(C[2][0], C[2][1], C[2][2]); this.cs.push(C[3][0], C[3][1], C[3][2]); this.inf.push(I[0], I[1], I[2], I[3]);
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
    g.setAttribute('cSh', F(this.cs, 3)); g.setAttribute('aInfo', F(this.inf, 4));
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
  lids: [0, 32.7, 8], browL: [-3.9, 31.8, 8.2], browR: [3.9, 31.8, 8.2], hat: [0, 32.8, 0] };
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
function footSh(x, y, z) {
  let d = 9;
  for (const s of [-1, 1]) {
    const a = s * 0.3, dx = x - s * 4.3, dz = z - 3.0, rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a);
    let f = sdRBox(rx, y, rz, 0, 0.9, 0.5, 3.0, 0.95, 4.4, 0.8);
    if (rz > 3.4 && Math.abs(Math.abs(rx) - 1.05) < 0.45) f = Math.max(f, 0.01);           // webbed toes
    d = Math.min(d, f, sdCap(x, y, z, s * 3.9, 1.2, 0.6, s * 3.6, 4.6, 0.2, 1.45));       // stubby legs
  }
  return d;
}
const armSh = s => (x, y, z) => Math.min(sdCap(x, y, z, s * 8.3, 15.6, 0.8, s * 9.5, 9.8, 1.8, 2.3), sdEll(x, y, z, s * 9.8, 8.4, 2.3, 2.6, 2.5, 2.6),
  sdEll(x, y, z, s * 8.5, 9.0, 4.1, 1.15, 1.15, 1.15));
function buildDuck(THREE, mat) {
  const M = {};
  M.feet = voxelise([-9, 0, -3, 9, 6, 9], footSh, () => ({ col: 'orange', g: 0.7 }));
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
  const pivOf = { feet: [0, 0, 0], body: [0, 0, 0], head: PIV.neck, jaw: PIV.jaw, pupilL: [-3.9, 27.5, 10.3], pupilR: [3.9, 27.5, 10.3], lids: PIV.lids,
    happy: PIV.neck, browL: PIV.browL, browR: PIV.browR, hat: PIV.hat, armL: PIV.armL, armR: PIV.armR };
  const meshes = {};
  for (const k in M) {
    const p = pivOf[k], g = new Geo(0.94).voxels(M[k], DV, p[0] * DV, p[1] * DV, p[2] * DV, OUT_E).geometry(THREE);
    meshes[k] = new THREE.Mesh(g, mat); meshes[k].name = 'duck-' + k; meshes[k].userData.piv = p;
  }
  return meshes;
}

// ---------- 6. POSES: every frame a pose writes target values for a set of channels; channels ease toward them ----------
const POSES = ['idle', 'happy', 'angry', 'shot', 'present', 'cheer', 'sad'];
const NEUTRAL = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sq: 1, hx: 0, hy: 0, hz: 0, jaw: 0, lid: 0, happy: 0, brow: 0, bOn: 0, by: 0,
  aLx: 0, aLy: 0, aLz: -0.24, aRx: 0, aRy: 0, aRz: 0.24, px: 0, py: 0, pc: 0, pupil: 1, hatY: 0, hatRx: -0.24, hatRz: 0.07, flush: 0, feet: 0, steam: 0 };
const RATE = { x: 40, y: 26, rx: 20, ry: 12, rz: 16, sq: 24, jaw: 28, lid: 36, flush: 5, hatY: 20, pupil: 20, feet: 30 };
const mix = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function poseTargets(T, st, dt) {
  Object.assign(T, NEUTRAL); T.fast = 0;
  const pt = st.pt, t = st.t, L = st.look;
  switch (st.pose) {
    case 'idle': {
      T.y = Math.sin(t * 2.4) * 0.35; T.rz = Math.sin(t * 1.2) * 0.035; T.hz = Math.sin(t * 1.2 + 0.7) * 0.05;
      T.hy = L.x * 0.45; T.hx = -L.y * 0.2; T.px = L.x; T.py = L.y;
      T.aLz = -0.24 - Math.sin(t * 2.4) * 0.05; T.aRz = 0.24 + Math.sin(t * 2.4) * 0.05;
      st.holdNext -= dt;                                        // now and then: clutches his head with both stubby arms
      if (st.holdT < 0 && st.holdNext <= 0) st.holdT = 0;
      if (st.holdT >= 0) {
        st.holdT += dt; const h = sstep(0, 0.22, st.holdT) * (1 - sstep(1.65, 1.95, st.holdT));
        T.aLz = mix(T.aLz, -2.8, h); T.aRz = mix(T.aRz, 2.8, h); T.aLx = T.aRx = 0.35 * h;
        T.hz += Math.sin(st.holdT * 8) * 0.08 * h; T.hx += 0.06 * h; T.pc = 0.7 * h; T.jaw = 0.22 * h; T.lid = 0.2 * h; T.y -= 0.6 * h;
        if (st.holdT > 1.95) { st.holdT = -1; st.holdNext = 6 + Math.random() * 5; }
      }
      break;
    }
    case 'happy': {
      const per = 0.56, p = (pt % per) / per, hop = Math.sin(Math.PI * p);
      T.y = hop * 5.5; T.sq = p < 0.08 || p > 0.93 ? 0.84 : 1 + 0.08 * hop; T.fast = 1;
      const f = Math.abs(Math.sin(pt * 15)); T.aLz = -0.7 - f * 1.15; T.aRz = 0.7 + f * 1.15;
      T.happy = 1; T.jaw = 0.42; T.hz = Math.sin(pt * 6) * 0.12; T.rz = Math.sin(pt * 5.6) * 0.06; T.hy = L.x * 0.3;
      T.hatY = Math.max(0, Math.sin(Math.PI * (((pt + 0.5) - 0.08) % per) / per)) * 1.4;
      break;
    }
    case 'angry': {
      T.flush = 1; T.brow = 1; T.lid = 0.3; T.pupil = 0.75; T.fast = 1;
      T.jaw = 0.55 + Math.sin(pt * 23) * 0.22; T.x = Math.sin(pt * 70) * 0.55; T.y = Math.abs(Math.sin(pt * 12)) * 1.1; T.rz = -0.06 + Math.sin(pt * 35) * 0.02;
      T.aLz = -2.2 + Math.sin(pt * 31) * 0.28; T.aRz = 2.2 - Math.sin(pt * 31 + 1.3) * 0.28; T.aLx = T.aRx = 0.5;
      T.hatY = Math.abs(Math.sin(pt * 24)) * 0.8; T.hy = L.x * 0.25; T.hx = -0.1; T.px = L.x * 0.6; T.steam = 16;
      break;
    }
    case 'shot': {                                              // flop on his back, lie there seeing stars, pop up fuming
      const fall = sstep(0.06, 0.32, pt) * (1 - sstep(1.0, 1.2, pt)), up = pt > 1.0 && pt < 1.5 ? Math.sin((pt - 1.0) / 0.5 * Math.PI) : 0;
      const land = pt > 0.32 && pt < 0.62 ? Math.sin((pt - 0.32) / 0.3 * Math.PI) * (1 - (pt - 0.32) / 0.3) : 0;
      T.fast = 1; T.rx = -1.42 * fall + up * 0.28; T.ry = 1.45 * fall; T.y = 8.2 * fall + land * 2.2 + up * 3.5; T.x = 10 * fall; T.hx = -0.3 * fall;
      T.sq = pt < 0.08 ? 1.18 : (pt > 0.32 && pt < 0.4) ? 0.8 : (up > 0.3 ? 1.12 : 1);
      if (pt < 0.32) { T.pupil = 0.5; T.jaw = 1; T.aLz = -2.6; T.aRz = 2.6; T.hatY = pt < 0.2 ? 4 : 1; T.lid = 0; }
      else if (pt < 1.0) {
        T.aLz = -1.35; T.aRz = 1.35; T.aLx = T.aRx = -0.3; T.feet = Math.sin(pt * 22) * 0.35; T.jaw = 0.3 + Math.sin(pt * 9) * 0.1;
        T.px = Math.cos(pt * 11) * 0.9; T.py = Math.sin(pt * 11) * 0.9; T.hatRz = 0.45; T.flush = 1; st.stars = 1;
        if (pt > 0.6) { T.brow = 1; T.steam = 10; }
      } else { T.flush = 1; T.brow = 1; T.steam = 16; T.jaw = 0.6 + Math.sin(pt * 23) * 0.2; T.aLz = -2.2 + Math.sin(pt * 31) * 0.28; T.aRz = 2.2 - Math.sin(pt * 31 + 1.3) * 0.28; T.aLx = T.aRx = 0.5; T.x = pt > 1.2 ? Math.sin(pt * 70) * 0.5 : 0; T.lid = 0.3; }
      if (pt >= 1.6) { st.pose = st.after; st.pt = 0; }
      break;
    }
    case 'present': {                                           // ta-da: points at something (dir +1 = his +x side)
      const d = st.dir, a = sstep(0, 0.2, pt), ov = pt < 0.45 ? Math.sin(pt / 0.45 * Math.PI) * 0.25 : 0;
      T.ry = d * 0.28; T.y = pt < 0.28 ? Math.sin(pt / 0.28 * Math.PI) * 2.5 : Math.sin(t * 2.2) * 0.3; T.fast = pt < 0.3 ? 1 : 0;
      if (d > 0) { T.aRz = mix(0.24, 1.45 + ov, a); T.aRy = -0.45 * a; T.aLz = -0.6; T.aLx = -0.2; }
      else { T.aLz = mix(-0.24, -1.45 - ov, a); T.aLy = 0.45 * a; T.aRz = 0.6; T.aRx = -0.2; }
      T.hy = d * (pt < 0.8 ? 0.55 : 0.12) + L.x * 0.1; T.px = d * (pt < 0.8 ? 0.9 : 0.2); T.hz = -d * 0.06;
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
  }
}

// ---------- 7. THE DUCK OBJECT ----------
function create(THREE, opts) {
  opts = opts || {};
  const mat = toonMaterial(THREE, { light: [-0.45, 0.62, 0.64], tHi: 0.72, tLo: 0.12, strip: [-0.35, 0.62, 0.7], stripOff: 1.0, stripW: 0.045, stripP: 100, rim: 0.2, fog: opts.fog !== false });
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
  // particles: steam, confetti, tears, sigh puffs (one InstancedMesh of unit cubes) + three dizzy stars
  const PN = 64, pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), PN);
  const stars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), 3);
  pm.frustumCulled = stars.frustumCulled = false; pm.visible = stars.visible = false; group.add(pm, stars);
  for (const m of [pm, stars]) m.geometry.boundingBox = new THREE.Box3();     // effects never count toward the duck's bounds
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), pd = [];
  for (let i = 0; i < PN; i++) { pd.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1, g: 0, drag: 0, grow: 0, r: 0, w: 0 }); pm.setMatrixAt(i, ZERO); pm.setColorAt(i, _c.set(0xffffff)); }
  for (let i = 0; i < 3; i++) { stars.setMatrixAt(i, ZERO); stars.setColorAt(i, _c.setHex(i === 1 ? PAL.lemon : PAL.yellow)); }
  let pNext = 0;
  function spawn(p, v, s, col, life, g, drag, grow, spin) {
    const i = pNext, d = pd[i]; pNext = (pNext + 1) % PN;
    d.p.copy(p); d.v.copy(v); d.s = s; d.life = d.max = life; d.g = g; d.drag = drag || 0; d.grow = grow || 0; d.r = Math.random() * 6; d.w = spin || 0;
    pm.setColorAt(i, _c.setHex(PAL[col])); pm.instanceColor.needsUpdate = true;
  }
  const at = (x, y, z, out) => { group.updateMatrixWorld(true); neck.localToWorld(out.set(x * DV, y * DV, z * DV)); return group.worldToLocal(out); };   // neck-relative voxel point -> group space
  const st = { pose: 'idle', after: 'idle', pt: 0, t: 0, dir: 1, look: { x: 0, y: 0 }, blinkT: 2.2, blink: 0, holdNext: 5 + Math.random() * 4, holdT: -1,
    pop: 0, flushLine: 0, steamAcc: 0, lastP: 0, lastSigh: 0, tearT: 1.2, stars: 0, starsOn: 0, confetti: 0, sighPuff: 0, tear: 0, mirror: 1 };
  const C = Object.assign({}, NEUTRAL), T = Object.assign({}, NEUTRAL);
  const browBase = [browL.userData.p0.y, browR.userData.p0.y], hatBase = hat.userData.p0.y;
  function apply() {
    root.position.set(C.x * DV, C.y * DV, C.z * DV); root.rotation.set(C.rx, C.ry, C.rz);
    const pop = st.pop > 0 ? Math.sin(st.pop / 0.16 * Math.PI) * 0.1 : 0, side = 1 + (1 - C.sq) * 0.6 - pop * 0.5;
    squash.scale.set(side, C.sq + pop, side);
    parts.feet.rotation.x = C.feet;
    neck.rotation.set(C.hx, C.hy, C.hz); jaw.rotation.x = C.jaw * 0.55;
    armL.rotation.set(C.aLx, C.aLy, C.aLz); armR.rotation.set(C.aRx, C.aRy, C.aRz);
    const lid = Math.max(C.lid, st.blink > 0 ? 1 : 0, C.happy > 0.5 ? 1 : 0);
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
    let live = 0;
    for (let i = 0; i < PN; i++) {
      const d = pd[i]; if (d.life <= 0) continue;
      d.life -= dt; if (d.life <= 0) { pm.setMatrixAt(i, ZERO); continue; }
      live++; d.v.y -= 9.8 * d.g * dt; if (d.drag) d.v.multiplyScalar(Math.max(0, 1 - d.drag * dt)); d.p.addScaledVector(d.v, dt); d.r += d.w * dt;
      const k = d.s * (1 + d.grow * (1 - d.life / d.max)) * Math.min(1, d.life / 0.1);
      pm.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(_e.set(d.r, d.r * 0.7, 0)), _s.set(k, k, k)));
    }
    pm.visible = live > 0; pm.instanceMatrix.needsUpdate = true;
    st.starsOn += ((st.stars ? 1 : 0) - st.starsOn) * Math.min(1, dt * 12); st.stars = 0;
    stars.visible = st.starsOn > 0.05;
    if (stars.visible) for (let i = 0; i < 3; i++) {                             // dizzy stars circling his head
      const a = st.t * 5 + i * 2.094; at(0, 9, 1, _p); _p.x += Math.cos(a) * 0.2; _p.z += Math.sin(a) * 0.2; _p.y += 0.26 + Math.sin(a * 2) * 0.02;
      stars.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e.set(0.6, st.t * 6 + i, 0.6)), _s.setScalar(0.05 * st.starsOn)));
    }
    stars.instanceMatrix.needsUpdate = true;
  }
  function update(dt, t) {
    dt = Math.min(0.05, Math.max(0, +dt || 0)); st.t = t !== undefined ? +t : st.t + dt; st.pt += dt;
    st.pop = Math.max(0, st.pop - dt);
    st.blinkT -= dt; if (st.blinkT <= 0) { st.blink = 0.12; st.blinkT = 1.8 + Math.random() * 3; } st.blink = Math.max(0, st.blink - dt);
    st.mirror = group.matrixWorld.determinant() < 0 ? -1 : 1;
    poseTargets(T, st, dt);
    for (const k in C) { const r = T.fast && (k === 'x' || k === 'y' || k === 'z' || k === 'sq' || k === 'rx') ? 60 : (RATE[k] || 18); C[k] += (T[k] - C[k]) * (1 - Math.exp(-r * dt)); }
    if (T.flush > 0.5) st.flushLine = Math.min(1.25, st.flushLine + dt * 2.6); else if (C.flush < 0.03) st.flushLine = 0;
    apply(); effects(dt);
  }
  function setPose(name, o) {
    if (POSES.indexOf(name) < 0) return;
    if (o && o.dir) st.dir = o.dir < 0 ? -1 : 1;
    if (name === 'shot') { if (st.pose !== 'shot') { st.after = 'angry'; st.pose = 'shot'; st.pt = 0; } return; }
    if (name === st.pose) return;
    st.pose = name; st.pt = 0; st.pop = 0.16; st.lastP = 0; st.holdT = -1;
  }
  const hitList = [parts.body, parts.head, parts.hat, parts.armL, parts.armR, parts.feet, parts.jaw];
  const duck = {
    group, POSES,
    get pose() { return st.pose; },
    setPose,
    hit() { st.after = 'idle'; st.pose = 'shot'; st.pt = 0; },
    update,
    lookAt(x, y) { st.look.x = Math.max(-1, Math.min(1, +x || 0)) * st.mirror; st.look.y = Math.max(-1, Math.min(1, +y || 0)); },
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
      mat.dispose(); for (const m of [pm, stars]) { m.geometry.dispose(); m.material.dispose(); }
    }
  };
  update(0, 0);
  return duck;
}
BLAM.Duck = { create, POSES };
})();
