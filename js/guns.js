/* =========================================================================================
   B.L.A.M. ("Blast like a maniac!")  --  js/guns.js
   First-person voxel light guns: four skins, one shared rig (aim lag, recoil, flash, shells,
   reload, empty state, coiled cable).  Mount with  camera.add(gun.group).
   Look: voxels on the BLAM-34 palette.  One custom "toy plastic" material does three-tone
   toon shading (shadow / base / lit tone, each a palette colour), a gloss band that slides
   over the plastic as the gun turns (reflection of a strip light), and a void inverted-hull
   outline.  Output alpha is 1.0, i.e. the "object" dither class of the post pass.
   API (contract with the engine):  BLAM.Guns.SKINS, BLAM.Guns.create(THREE, opts) -> gun
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
  for (const n of names) if (PAL[n] === undefined) throw new Error('BLAM.Guns: unknown palette colour ' + n);
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
uniform float uStripP; uniform float uGloss; uniform float uFlush; uniform float uFlushY; uniform vec3 uFB; uniform vec3 uFL; uniform vec3 uFH;
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
    uGloss: { value: 1 }, uFlush: { value: 0 }, uFlushY: { value: 9 },
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

// ---------- 4. SIDE-PROFILE RASTER: a gun is drawn as a 2D side view (col = z, muzzle at col 0; row = y, row 0 on top) ----------
function inPoly(x, y, pts) {
  let ins = false;
  for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
    const xa = pts[a][0], ya = pts[a][1], xb = pts[b][0], yb = pts[b][1];
    if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) ins = !ins;
  }
  return ins;
}
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
class Prof {
  constructor(w, h) { this.w = w; this.h = h; this.g = new Array(w * h).fill(null); }
  get(c, r) { return c < 0 || r < 0 || c >= this.w || r >= this.h ? null : this.g[r * this.w + c]; }
  set(c, r, k) { if (c >= 0 && r >= 0 && c < this.w && r < this.h) this.g[r * this.w + c] = k; return this; }
  rect(c0, r0, c1, r1, k) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(c, r, k); return this; }
  poly(pts, k) {                                   // fill every cell whose centre is inside the polygon
    let c0 = 1e9, c1 = -1e9, r0 = 1e9, r1 = -1e9;
    for (const p of pts) { c0 = Math.min(c0, p[0]); c1 = Math.max(c1, p[0]); r0 = Math.min(r0, p[1]); r1 = Math.max(r1, p[1]); }
    for (let r = Math.floor(r0); r <= Math.ceil(r1); r++) for (let c = Math.floor(c0); c <= Math.ceil(c1); c++)
      if (inPoly(c + 0.5, r + 0.5, pts)) this.set(c, r, k);
    return this;
  }
  disc(cx, cy, rad, k, inner, keep) {              // disc, or ring when inner > 0; keep(c, r) filters cells
    for (let r = Math.floor(cy - rad); r <= Math.ceil(cy + rad); r++) for (let c = Math.floor(cx - rad); c <= Math.ceil(cx + rad); c++) {
      const d = Math.hypot(c + 0.5 - cx, r + 0.5 - cy);
      if (d <= rad && d >= (inner || 0) && (!keep || keep(c, r))) this.set(c, r, k);
    }
    return this;
  }
  art(c0, r0, rows, map) {                         // ASCII stamp ('.' = leave as is, '_' = clear)
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch === '.') continue;
      this.set(c0 + i, r0 + j, ch === '_' ? null : ((map && map[ch]) || ch)); } });
    return this;
  }
  each(fn) { for (let r = 0; r < this.h; r++) for (let c = 0; c < this.w; c++) { const k = this.g[r * this.w + c]; if (k) fn(c, r, k); } }
}
// 3x5 pixel font for decals (rows as octal digits, 4 = left pixel)
const F3 = {A:'25755',B:'65656',C:'34443',D:'65556',E:'74647',F:'74644',G:'34553',H:'55755',I:'72227',J:'11152',K:'55655',
  L:'44447',M:'57755',N:'65555',O:'25552',P:'65644',Q:'25563',R:'65655',S:'34216',T:'72222',U:'55557',V:'55552',W:'55775',
  X:'55255',Y:'55222',Z:'71247','0':'75557','1':'26227','2':'61247','3':'61216','4':'55711','5':'74616','6':'34652','7':'71222',
  '8':'25252','9':'25316','-':'00700','.':'00002',' ':'00000','!':'22202'};

// ---------- 5. GUN MODEL: profile cells + a part table -> voxels per mesh (static body / moving parts) ----------
// Part spec: { col, w (even width in voxels), mesh ('body'), R + cy (round cross-section along z), x0/x1 (asymmetric),
//              gap [a,b] (skip x range), inset (bevel edges, default on), g (gloss 0..1), e (emissive), nh (no outline) }
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
class GunModel {
  constructor(w, h, oc, or, s) { this.P = new Prof(w, h); this.oc = oc; this.or = or; this.s = s; this.specs = {}; this.meshes = {}; this.cells = new Map(); this.decals = new Map(); }
  spec(k, o) { this.specs[k] = o; return this; }
  M(name) { return this.meshes[name] || (this.meshes[name] = { vox: new Map(), pivot: [0, 0, 0] }); }
  add(mesh, i, j, k, col, o) { o = o || {}; this.M(mesh).vox.set(VK(i, j, k), { i, j, k, col, g: o.g, e: o.e, nrm: o.nrm || null, nh: o.nh, fl: o.fl, h: o.h }); }
  get(mesh, i, r, c) { return this.M(mesh).vox.get(VK(i, -(r + 1), c)); }
  del(mesh, i, r, c) { this.M(mesh).vox.delete(VK(i, -(r + 1), c)); }
  pt(c, r, x) { return [(x || 0) * this.s, (this.or - r) * this.s, (c - this.oc) * this.s]; }   // profile coords -> gun space
  pivot(mesh, c, r, x) { this.M(mesh).pivot = this.pt(c, r, x); return this; }
  edge(c, r, sp) {
    const me = sp.mesh || 'body';
    for (const d of N4) {
      const k2 = this.P.get(c + d[0], r + d[1]), s2 = k2 && this.specs[k2];
      if (!s2 || (s2.mesh || 'body') !== me || s2.R || s2.gap || s2.w < sp.w) return true;
    }
    return false;
  }
  extrude() {
    this.P.each((c, r, key) => {
      const sp = this.specs[key]; if (!sp) return;
      let w = sp.w;
      if (sp.R) { const dy = r + 0.5 - sp.cy; w = 2 * Math.round(Math.sqrt(Math.max(0, sp.R * sp.R - dy * dy))); if (w < 2) return; }
      else if (sp.inset !== false && w >= 4 && this.edge(c, r, sp)) w -= 2;
      const x0 = sp.x0 !== undefined ? sp.x0 : -w / 2, x1 = sp.x1 !== undefined ? sp.x1 : w / 2, mesh = sp.mesh || 'body';
      this.cells.set(c + ',' + r, { mesh, x0, x1, key });
      for (let i = x0; i < x1; i++) {
        if (sp.gap && i >= sp.gap[0] && i < sp.gap[1]) continue;
        const nrm = sp.R ? norm3([i + 0.5, sp.cy - r - 0.5, 0]) : null;
        this.add(mesh, i, -(r + 1), c, sp.col, { g: sp.g, e: sp.e, nrm, nh: sp.nh, fl: sp.fl, h: sp.h });
      }
    });
    return this;
  }
  // decal on the outermost voxel of a cell: side 'L' (left flank, faces the player), 'R' or 'B' (both); '!col' = emissive
  dec(c, r, col, side) { const s = side || 'B'; if (s !== 'R') this.decals.set(c + ',' + r + ',L', col); if (s !== 'L') this.decals.set(c + ',' + r + ',R', col); return this; }
  text(c, r, str, col, side) {
    let x = c;
    for (const ch of str) { const g = F3[ch] || F3[' '];
      for (let y = 0; y < 5; y++) { const row = +g[y]; for (let k = 0; k < 3; k++) if ((row >> (2 - k)) & 1) this.dec(x + k, r + y, col, side || 'L'); }
      x += 4; }
    return this;
  }
  applyDecals() {
    for (const [key, col0] of this.decals) {
      const p = key.split(','), c = +p[0], r = +p[1], cell = this.cells.get(c + ',' + r); if (!cell) continue;
      const v = this.get(cell.mesh, p[2] === 'L' ? cell.x0 : cell.x1 - 1, r, c); if (!v) continue;
      const em = col0[0] === '!'; v.col = em ? col0.slice(1) : col0; if (em) v.e = 1;
    }
    return this;
  }
  // voxel(s) standing proud of a flank: depth layers outward from the outermost voxel of the cell
  stud(c, r, col, side, depth, o) {
    const cell = this.cells.get(c + ',' + r); if (!cell) return this;
    for (let d = 1; d <= (depth || 1); d++) {
      const i = side === 'R' ? cell.x1 - 1 + d : cell.x0 - d, em = col[0] === '!';
      this.add((o && o.mesh) || cell.mesh, i, -(r + 1), c, em ? col.slice(1) : col, Object.assign({ e: em }, o));
    }
    return this;
  }
  // free-form 3D voxels: fn(x, rowCentre, colCentre) -> 'col' | {col, nrm, g, e, nh} | null
  solid(mesh, c0, c1, r0, r1, x0, x1, fn) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (let i = x0; i < x1; i++) {
      const o = fn(i + 0.5, r + 0.5, c + 0.5); if (!o) continue;
      if (typeof o === 'string') this.add(mesh, i, -(r + 1), c, o); else this.add(mesh, i, -(r + 1), c, o.col, o);
    }
    return this;
  }
  build(THREE, mat, e) {
    const out = {}, s = this.s;
    for (const name in this.meshes) {
      const m = this.meshes[name]; if (!m.vox.size) continue;
      const p = m.pivot, geo = new Geo(0.7).voxels(m.vox, s, p[0], p[1] - this.or * s, p[2] + this.oc * s, e).geometry(THREE);
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(p[0], p[1], p[2]); mesh.name = name; out[name] = mesh;
    }
    return out;
  }
}

// ---------- 6. SKINS ----------
// Every builder returns { meshes, muzzle, port, portDir, cable, cableDir, wrist, coil, flash, shells, anim(S, fx) }.
// Gun space: barrel along -z, y up, the player looks at the LEFT flank (-x).  Points come from the profile via G.pt().
const GU = 0.0078;                                   // gun voxel size in camera-space units
const OUTLINE = 0.42 * GU;                           // inverted-hull outline thickness
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V3 = (THREE, p) => new THREE.Vector3(p[0], p[1], p[2]);

// ---- 6.1 HOT ROD (justifier): long blue enforcer, pump front grip, chrome muzzle, hot-rod flames, gauge, lucky 7 ----
function buildHotRod(THREE, mat) {
  const G = new GunModel(58, 42, 41, 16, GU), P = G.P;
  G.spec('B', { col: 'deepblue', w: 8 }).spec('R', { col: 'void', w: 4, g: 0.6 }).spec('P', { col: 'void', w: 2, g: 0 })
   .spec('Q', { col: 'void', w: 6, gap: [-1, 1], g: 0 }).spec('K', { col: 'slate', w: 10 })
   .spec('M', { col: 'haze', R: 6.4, cy: 10.5 }).spec('m', { col: 'haze', R: 5.5, cy: 10.5 }).spec('N', { col: 'void', R: 7.0, cy: 10.5, g: 0.5 })
   .spec('E', { col: 'void', w: 6, g: 0 }).spec('U', { col: 'deepblue', w: 4 }).spec('T', { col: 'red', w: 2, mesh: 'trigger' })
   .spec('F', { col: 'deepblue', w: 8, mesh: 'pump' }).spec('f', { col: 'void', w: 8, mesh: 'pump', g: 0.3 })
   .spec('G', { col: 'deepblue', w: 8 }).spec('g', { col: 'void', w: 10, g: 0.25 }).spec('k', { col: 'void', w: 10, g: 0.4 })
   .spec('C', { col: 'slate', w: 4, g: 0.3 });
  // --- side profile ---
  P.rect(7, 6, 34, 15, 'B');                                           // forebody / barrel shroud
  P.poly([[30, 16], [30, 6], [36, 3], [51, 3], [51, 16]], 'B');         // tall rear receiver, raked front
  P.rect(8, 5, 32, 5, 'R');                                            // ventilated top rib
  P.rect(9, 3, 10, 4, 'P');                                            // front sight
  P.rect(44, 1, 47, 2, 'Q');                                           // rear sight posts
  P.rect(51, 3, 52, 16, 'K');                                          // slate back plate (LED lives here)
  P.rect(0, 3, 1, 18, 'm'); P.rect(2, 3, 6, 18, 'M'); P.rect(4, 3, 4, 18, 'N');   // chunky chrome muzzle + band
  P.rect(36, 6, 40, 8, 'E');                                           // ejection port slot
  P.disc(27.5, 19.2, 5.7, 'U', 3.7, (c, r) => r >= 16);                // big round trigger guard
  P.art(26, 16, ['.TT', '.T.', '.T.', 'T..', 'TT.']);                  // trigger blade (curls forward)
  P.poly([[11, 17], [19, 17], [18.4, 30], [9.4, 30]], 'F');             // vertical front grip (pump)
  P.poly([[9.3, 30], [18.5, 30], [18.3, 33], [8.8, 33]], 'f');          // front grip foot
  P.poly([[36, 16], [46, 16], [51, 35], [40.5, 35]], 'G');              // main grip, raked back
  P.poly([[45, 16], [52, 16], [52.6, 20], [47, 20]], 'G');              // beavertail hump
  for (const r of [21, 22, 26, 27]) P.set(Math.floor(36 + (r - 16) * 4.5 / 19), r, null);   // finger grooves
  P.poly([[38.4, 19], [45.6, 19], [49.2, 33], [42, 33]], 'g');          // rubber grip panel
  P.poly([[40.3, 35], [51, 35], [51.4, 37], [40.7, 37]], 'k');          // butt cap
  P.rect(44, 37, 47, 38, 'C');                                         // cable boot
  G.extrude();
  // pump sleeve wrapping the lower barrel (its own mesh, slides along the body)
  G.solid('pump', 10, 21, 13, 16, -5, 5, (x, r) => (Math.abs(x) > 4 || r > 16) ? { col: 'deepblue', g: 1 } : null);
  // --- livery: hot-rod flames licking back from the muzzle (orange/yellow, red edge) ---
  const T = [[7.4, 1.1, 0.36, 0.0, 27, 2.6], [9.9, 1.0, 0.31, 2.0, 21, 2.3], [12.1, 0.8, 0.44, 4.1, 14.5, 1.8]];
  for (let c = 7; c <= 34; c++) for (let r = 6; r <= 15; r++) {
    const x = c + 0.5 - 6.6, y = r + 0.5; let v = 3.6 - x * 1.15;
    for (const t of T) { if (x > t[4]) continue;
      const cy = t[0] + t[1] * Math.sin(x * t[2] + t[3]), hw = t[5] * Math.pow(1 - x / t[4], 0.7); v = Math.max(v, hw - Math.abs(y - cy)); }
    if (v > 0) G.dec(c, r, v < 0.75 ? 'red' : v < 1.45 ? 'orange' : v < 2.1 ? 'yellow' : 'lemon');
  }
  for (let c = 36; c <= 49; c++) G.dec(c, 4, 'cyan');                  // pinstripe on the receiver
  for (let c = 22; c <= 33; c++) G.dec(c, 6, 'cyan');
  for (let r = 19; r <= 28; r += 2) for (let c = 9; c <= 19; c++) G.dec(c, r, 'void');   // front grip grooves
  for (let r = 27; r <= 32; r += 2) for (let c = 40; c <= 50; c++) if (P.get(c, r) === 'g') G.dec(c, r, 'navy');
  // racing roundel with a bold lucky 7 on the left of the receiver
  for (let r = 4; r <= 15; r++) for (let c = 41; c <= 51; c++) {
    const d = Math.hypot(c + 0.5 - 46.2, r + 0.5 - 9.8); if (d <= 4.8) G.dec(c, r, d > 3.95 ? 'red' : 'bone', 'L'); }
  ['#####', '#####', '....#', '...#.', '..##.', '..#..', '.##..'].forEach((row, j) => {
    for (let i = 0; i < 5; i++) if (row[i] === '#') G.dec(44 + i, 6 + j, 'void', 'L'); });
  for (const [c, r] of [[33, 14], [48, 14], [49, 33], [14, 28], [12, 15]]) G.dec(c, r, 'void');   // screws
  G.dec(38, 7, 'amber', 'L').dec(39, 7, 'amber', 'L');                 // brass peeking out of the port
  G.applyDecals();
  // lens + bore on the muzzle face
  for (const v of G.M('body').vox.values()) if (v.k === 0) {
    const d = Math.hypot(v.i + 0.5, v.j + 0.5 + 10.5); if (d < 3.3) { v.col = d < 1.6 ? 'void' : 'ice'; v.e = d >= 1.6 ? 1 : 0; } }
  G.solid('led', 53, 53, 6, 7, -1, 1, () => ({ col: 'lime', e: 1, nh: true }));
  G.pivot('trigger', 27.5, 16).pivot('pump', 15, 16);
  return {
    meshes: G.build(THREE, mat, OUTLINE), muzzle: G.pt(-1.5, 10.5), port: G.pt(39.5, 2.5, 0), portDir: [1.3, 1.9, 0.5],
    cable: G.pt(45.5, 38.6), cableDir: [0, -1, 0.25], wrist: G.pt(44, 26), coil: ['slate', 'navy', 'void'], flash: 'fire', shells: true,
    anim(S, P2, fx) {
      P2.trigger.rotation.x = -S.trig * 0.55;
      let pz = S.kick * 0.9;                                                  // pump: jolts on fire, racks on reload
      if (S.rp >= 0) pz = 7 * (smooth01(0.24, 0.42, S.rp) - smooth01(0.56, 0.68, S.rp));
      else if (S.empty) pz = 5.5;
      P2.pump.position.z = P2.pump.userData.z0 + pz * GU;
      if (S.cross(0.38)) fx.shell();
    }
  };
}

// status LED cells right behind the rear-most profile cell of each row (own mesh, own colour-changing material)
function ledAt(G, rows) {
  for (const r of rows) { let c = G.P.w - 1; while (c > 0 && !G.P.get(c, r)) c--; G.solid('led', c + 1, c + 1, r, r, -1, 1, () => ({ col: 'lime', e: 1, nh: true })); }
}

// ---- 6.2 AQUA PRO (guncon): hefty two-tone pistol, aqua frame, navy slide with serrations, yellow racing stripe ----
function buildAquaPro(THREE, mat) {
  const G = new GunModel(54, 44, 38, 15, GU), P = G.P;
  G.spec('S', { col: 'navy', w: 8, mesh: 'slide' }).spec('s', { col: 'navy', w: 2, mesh: 'slide', g: 0 })
   .spec('q', { col: 'navy', w: 6, gap: [-1, 1], mesh: 'slide', g: 0 })
   .spec('L', { col: 'cyan', w: 8 }).spec('A', { col: 'cyan', w: 8 }).spec('U', { col: 'cyan', w: 4 })
   .spec('T', { col: 'orange', w: 2, mesh: 'trigger' }).spec('G', { col: 'cyan', w: 8 }).spec('g', { col: 'blue', w: 10, g: 0.35 })
   .spec('K', { col: 'navy', w: 10 }).spec('C', { col: 'slate', w: 4, g: 0.3 });
  P.rect(1, 4, 45, 10, 'S'); P.set(1, 4, null); P.set(45, 4, null);        // slide (moving), softened corners
  P.rect(3, 3, 4, 3, 's'); P.rect(41, 3, 44, 3, 'q');                      // front sight, rear sight posts
  P.rect(2, 11, 24, 16, 'L'); P.set(2, 16, null);                          // boxy under-barrel block
  P.rect(25, 11, 44, 14, 'A');                                             // frame
  P.rect(20, 17, 21, 22, 'U'); P.rect(20, 21, 34, 22, 'U');                // squared trigger guard
  P.art(26, 15, ['.TT', '.TT', '.T.', 'T..', 'TT.']);                      // trigger
  P.poly([[33, 15], [45, 15], [50, 37], [37, 37]], 'G');                    // big grip
  P.poly([[44, 11], [47.5, 10.5], [49.5, 15], [46, 16.5], [44, 15]], 'G');  // backstrap hump
  P.poly([[35.6, 18], [45.2, 18], [48.2, 34], [38.6, 34]], 'g');           // grip panel
  P.poly([[37, 37], [50, 37], [50.4, 39], [37.4, 39]], 'K');               // magazine base plate
  P.rect(42, 39, 45, 40, 'C');                                             // cable boot
  G.extrude();
  G.solid('body', 2, 12, 5, 8, -2, 2, () => 'steel');                     // barrel: hidden in the slide until it opens
  for (let c = 3; c <= 47; c++) { G.dec(c, 12, 'yellow').dec(c, 13, 'yellow'); if (c <= 44) G.dec(c, 14, 'orange'); }   // racing stripe
  for (let c = 35; c <= 43; c += 2) for (let r = 5; r <= 9; r++) G.dec(c, r, 'void');           // slide serrations
  G.text(15, 5, 'BLAM', 'cyan', 'L');                                      // our own logo on the slide
  P.each((c, r, k) => { if (k === 'g' && (c + 2 * r) % 4 === 0) G.dec(c, r, 'deepblue'); });     // stippled grip
  for (const [c, r] of [[5, 15], [22, 15], [28, 11], [40, 21], [45, 33]]) G.dec(c, r, 'void');   // screws
  G.applyDecals();
  for (const v of G.M('slide').vox.values()) if (v.k === 1) {                // lens + bore on the slide face
    const d = Math.hypot(v.i + 0.5, -v.j - 0.5 - 7.5); if (d < 2.3) { v.col = d < 1.0 ? 'void' : 'ice'; v.e = d >= 1.0 ? 1 : 0; } }
  ledAt(G, [12, 13]);
  G.pivot('trigger', 27, 15).pivot('slide', 23, 7);
  return {
    meshes: G.build(THREE, mat, OUTLINE), muzzle: G.pt(-1.2, 7.5), port: G.pt(32, 3, 0.5), portDir: [1.4, 1.8, 0.4],
    cable: G.pt(43.5, 40.6), cableDir: [0, -1, 0.2], wrist: G.pt(41, 25), coil: ['haze', 'steel', 'slate'], flash: 'fire', shells: true,
    anim(S, M, fx) {
      M.trigger.rotation.x = -S.trig * 0.5;
      let sz = 6.5 * Math.max(0, S.fireAge < 0.02 ? S.fireAge / 0.02 : 1 - (S.fireAge - 0.02) / 0.07);   // blow-back
      if (S.rp >= 0) sz = 7 * (smooth01(0.25, 0.4, S.rp) - smooth01(0.6, 0.66, S.rp));               // rack
      else if (S.empty) sz = Math.max(sz, 6);                                                         // locked back
      M.slide.position.z = M.slide.userData.z0 + sz * GU;
      if (S.cross(0.4)) fx.shell();
    },
    onFire(S, M, fx) { fx.smoke(3, null, ['slate', 'steel', 'navy'], 0.22); }   // #76: a short dark puff at the muzzle
  };
}

// ---- 6.3 RAY-85 (zapper homage): cream + orange ray gun, ringed barrel, emitter bell, ribbed vent block, charge meter ----
function buildRay85(THREE, mat) {
  const G = new GunModel(54, 40, 38, 14, GU), P = G.P, CREAM = 'lemon/sand/bone/bone';
  G.spec('e0', { col: 'orange', R: 4.8, cy: 9.5 }).spec('e1', { col: 'orange', R: 4.4, cy: 9.5 }).spec('e2', { col: 'orange', R: 3.8, cy: 9.5 })
   .spec('e3', { col: 'orange', R: 3.2, cy: 9.5 }).spec('Z', { col: 'orange', R: 2.6, cy: 9.5 }).spec('N', { col: CREAM, R: 3.3, cy: 9.5 })
   .spec('V', { col: CREAM, w: 8 }).spec('v', { col: 'navy', w: 6, g: 0, fl: 1, h: 9 }).spec('Y', { col: CREAM, w: 8 })
   .spec('w', { col: 'void', w: 6, g: 0 }).spec('G', { col: CREAM, w: 8 }).spec('g', { col: 'navy', w: 10, g: 0.3 })
   .spec('U', { col: 'orange', w: 4 }).spec('T', { col: 'lime', w: 2, mesh: 'trigger' });
  P.rect(0, 4, 0, 15, 'e0'); P.rect(1, 4, 1, 15, 'e1'); P.rect(2, 4, 2, 15, 'e2'); P.rect(3, 4, 3, 15, 'e3');   // emitter bell
  P.rect(4, 6, 25, 13, 'Z');                                               // long thin barrel
  for (const c of [7, 8, 13, 14, 19, 20]) P.rect(c, 5, c, 14, 'N');        // cream rings
  P.rect(16, 3, 28, 6, 'V'); for (let c = 17; c <= 27; c += 2) P.rect(c, 3, c, 5, 'v');   // ribbed vent block
  P.poly([[24, 6], [29.5, 3], [46, 7], [47, 15], [24, 14]], 'Y');           // angled rear body
  P.rect(30, 8, 41, 10, 'w');                                              // charge window
  P.poly([[34, 14], [43, 14], [45.5, 30], [37, 30]], 'G');                  // grip, more upright than the classic
  P.poly([[36.2, 16.5], [42.6, 16.5], [44, 28], [38.2, 28]], 'g');          // rubber panel
  P.art(26, 14, ['UU.......', 'UU.......', 'UU.......', 'UU.......', 'UUU......', '.UUUUUUUUU']);   // angular guard
  P.art(30, 14, ['TTT', '.TT', '.TT', '.T.', 'TT.']);                      // chunky trigger
  G.extrude();
  for (let s = 0; s < 4; s++) for (let r = 8; r <= 10; r++) for (const c of [30 + 3 * s, 31 + 3 * s])   // meter segments (shader flush channel)
    G.add('body', -4, -(r + 1), c, 'void', { e: 1, fl: 1, h: s + 0.5, nh: true, g: 0 });
  G.solid('body', 37, 46, 29, 36, -4, 4, (x, r, c) => Math.hypot(x, r - 32.4, c - 41.6) < 3.6 ? { col: 'orange', nrm: norm3([x, 32.4 - r, c - 41.6]) } : null);   // pommel
  G.solid('body', 41, 42, 36, 37, -1, 1, () => ({ col: 'slate', g: 0.3 }));                  // cable boot
  G.solid('knob', 46, 47, 7, 8, -1, 1, () => 'navy');                                         // cocking rod + ball
  G.solid('knob', 47, 52, 5, 10, -3, 3, (x, r, c) => Math.hypot(x, r - 7.5, c - 49.6) < 2.4 ? { col: 'orange', nrm: norm3([x, 7.5 - r, c - 49.6]) } : null);
  for (let c = 29; c <= 45; c++) G.dec(c, Math.round(4.6 + (c - 29.5) * 4 / 16.5), 'orange');  // pinstripe along the top edge
  P.each((c, r, k) => { if (k === 'g' && (c - r) % 3 === 0) G.dec(c, r, 'slate'); });          // diagonal grip ribs
  for (const [c, r] of [[26, 12], [44, 12], [41, 26], [10, 9]]) G.dec(c, r, 'void');
  G.applyDecals();
  for (const v of G.M('body').vox.values()) if (v.k === 0) {                 // emitter: lime core, ice ring
    const d = Math.hypot(v.i + 0.5, -v.j - 0.5 - 9.5); if (d < 3.4) { v.col = d < 1.3 ? 'lime' : 'ice'; v.e = 1; } }
  ledAt(G, [11, 12]);
  G.pivot('trigger', 31, 14).pivot('knob', 46, 7.5);
  return {
    meshes: G.build(THREE, mat, OUTLINE), muzzle: G.pt(-1.5, 9.5), port: G.pt(22, 2.5), portDir: [1, 2, 0.3],
    cable: G.pt(42, 38.2), cableDir: [0, -1, 0.1], wrist: G.pt(40.5, 22), coil: ['amber', 'orange', 'rust'], flash: 'ray', shells: false,
    anim(S, M) {
      M.trigger.rotation.x = -S.trig * 0.55;
      let kz = S.kick * 1.4;                                                   // knob: jolts, pulled on reload, back when empty
      if (S.rp >= 0) kz = 5 * (smooth01(0.22, 0.36, S.rp) - smooth01(0.52, 0.56, S.rp));
      else if (S.empty) kz = 4;
      M.knob.position.z = M.knob.userData.z0 + kz * GU;
      let n = 4;                                                               // lit meter segments; 99 = vents flare too
      if (S.rp >= 0) n = Math.floor(4.999 * smooth01(0.42, 0.86, S.rp));
      else if (S.empty) n = 0;
      else if (S.fireAge < 0.08) n = 99;
      else if (S.fireAge < 0.32) n = 3;
      mat.uniforms.uFlushY.value = n;
    }
  };
}

// ---- 6.4 CANDY SIX (revolver): candy-green toy snub revolver, fluted swing-out cylinder, hammer, checkered grip, orange tip ----
function buildCandySix(THREE, mat) {
  const G = new GunModel(48, 44, 31, 18, GU), P = G.P, CY = 10.5, CR = 6.0;
  G.spec('o', { col: 'orange', R: 2.9, cy: 8.5 }).spec('r', { col: 'green', R: 2.7, cy: 8.5 }).spec('s', { col: 'green', w: 2 })
   .spec('u', { col: 'green', w: 4 }).spec('F', { col: 'green', w: 8 }).spec('H', { col: 'lime', w: 4, mesh: 'hammer' })
   .spec('T', { col: 'lime', w: 2, mesh: 'trigger' }).spec('U', { col: 'green', w: 4 }).spec('G', { col: 'green', w: 8 })
   .spec('g', { col: 'green', w: 10, g: 0.4 }).spec('K', { col: 'forest', w: 10 }).spec('C', { col: 'slate', w: 4, g: 0.3 });
  P.rect(0, 5, 2, 12, 'o'); P.rect(3, 5, 14, 12, 'r'); P.rect(3, 4, 5, 5, 's');   // orange safety tip, short barrel, front blade
  P.rect(4, 11, 14, 12, 'u');                                              // ejector-rod shroud
  P.rect(14, 3, 29, 4, 'F'); P.rect(14, 3, 16, 15, 'F');                   // top strap + front of the window
  P.rect(14, 16, 30, 18, 'F'); P.rect(28, 3, 32, 18, 'F');                 // bottom + recoil shield
  P.art(28, 0, ['..HHH', '.HHH.', 'HHH..', 'HH...', 'HH...', 'HH...', 'HH...']);   // exposed hammer, spur curls back
  P.disc(22.5, 21.6, 5.0, 'U', 3.2, (c, r) => r >= 19);                    // round trigger guard
  P.art(21, 19, ['.TT', '.T.', 'T..', 'T..', 'TT.']);                      // trigger
  P.poly([[25, 18], [32, 16], [35, 19], [39.5, 28], [42.5, 35], [41.5, 38.5], [34, 38.5], [32.5, 33], [28.5, 25], [25.5, 21]], 'G');   // plough-handle grip
  P.poly([[28.3, 21.5], [33.2, 19.5], [38.8, 29], [40, 35.5], [35.2, 36], [33.6, 31], [30.2, 25]], 'g');   // checkered panel
  P.poly([[33.5, 37.5], [42, 37.5], [41.6, 39.5], [34, 39.5]], 'K');       // butt
  P.rect(36, 40, 39, 41, 'C');                                             // cable boot
  G.extrude();
  // the cylinder: fluted, six chambers (brass at the bottom of each hole), radial normals for a round read
  const STEP = Math.PI / 3;
  G.solid('cyl', 17, 27, 4, 16, -6, 6, (x, rr, cc) => {
    const dx = x, dy = CY - rr, rad = Math.hypot(dx, dy); if (rad > CR) return null;
    const a = Math.atan2(dy, dx);
    let flute = false;
    if (cc > 19 && cc < 26 && rad > 3.9) { const fa = (((a - STEP / 2) % STEP) + STEP) % STEP; if (Math.min(fa, STEP - fa) < 0.24) { if (rad > 4.9) return null; flute = true; } }
    for (let k = 0; k < 6; k++) {
      if (Math.hypot(dx - 3.4 * Math.cos(k * STEP), dy - 3.4 * Math.sin(k * STEP)) < 1.3) { if (cc < 19) return null; if (cc < 20) return { col: 'amber', g: 0.5 }; }
    }
    return { col: flute ? 'green' : (rad > 5.5 && (cc === 17 || cc === 27)) ? 'green' : 'lime', nrm: norm3([dx, dy, 0]) };
  });
  P.each((c, r, k) => { if (k === 'g' && (c + r) % 2) G.dec(c, r, 'forest'); });                 // checkering
  for (const [c, r] of [[31, 22], [30, 23], [31, 23], [32, 23], [31, 24]]) G.dec(c, r, 'yellow');   // little deputy star medallion
  for (const [c, r] of [[17, 17], [25, 17], [30, 15]]) G.dec(c, r, 'forest');                     // pins
  G.applyDecals();
  for (const v of G.M('body').vox.values()) if (v.k === 0) {                 // light-gun lens in the orange tip
    const d = Math.hypot(v.i + 0.5, -v.j - 0.5 - 8.5); if (d < 1.7) { v.col = d < 0.8 ? 'void' : 'ice'; v.e = d >= 0.8 ? 1 : 0; } }
  for (const v of G.M('body').vox.values()) if (v.col === 'green' && ((v.i * 7 + v.j * 13 + v.k * 5) % 23 === 0)) v.col = 'lime/green/lemon/bone';   // candy glints
  ledAt(G, [7, 8]);
  G.pivot('trigger', 22.5, 19).pivot('hammer', 29, 7).pivot('cyl', 22.5, CY);
  const craneP = G.pt(22.5, 15.6, -4.6), chambers = [];
  for (let k = 0; k < 6; k++) chambers.push([3.4 * GU * Math.cos(k * STEP), 3.4 * GU * Math.sin(k * STEP), 5.6 * GU]);
  return {
    meshes: G.build(THREE, mat, OUTLINE), muzzle: G.pt(-1.2, 8.5), port: G.pt(24, 2), portDir: [1, 2, 0.3],
    cable: G.pt(37.5, 41.6), cableDir: [0, -1, 0.3], wrist: G.pt(34, 28), coil: ['lime', 'green', 'forest'], flash: 'cap', flashScale: 0.6, shells: false,
    sparkN: 3, sparkCols: ['red', 'orange', 'coral'],                       // #76: toy cap gun, a tiny orange-red cap pop
    reload: { roll: 0.85, pitch: 0.35, yaw: 0.3, dip: 0.05 }, view: 0.24, size: 1.18,
    setup(root, M) {                                                         // cylinder hangs on a crane that swings out to the left
      const crane = new THREE.Group(); crane.position.set(craneP[0], craneP[1], craneP[2]); root.add(crane);
      crane.add(M.cyl); M.cyl.position.sub(crane.position); M.cyl.userData.crane = crane;
    },
    anim(S, M, fx, st, dt) {
      M.trigger.rotation.x = -S.trig * 0.5;
      if (st.spin === undefined) { st.spin = 0; st.target = 0; }
      const cyl = M.cyl, crane = cyl.userData.crane;
      // hammer: cocked at rest, falls on the shot, re-cocks while the cylinder turns one chamber; down when empty
      let ham = S.empty ? 0 : 0.62;
      if (!S.empty && S.fireAge < 0.3) ham = S.fireAge < 0.035 ? 0 : 0.62 * smooth01(0.1, 0.26, S.fireAge);
      let swing = 0;
      if (S.rp >= 0) {
        swing = smooth01(0.14, 0.28, S.rp) * (1 - smooth01(0.72, 0.8, S.rp));
        ham = S.rp < 0.84 ? 0 : 0.62 * smooth01(0.84, 0.96, S.rp);
        if (S.cross(0.34)) fx.dropFrom(cyl, chambers, 'amber');
        if (S.rp > 0.3 && S.rp < 0.72) st.spin += dt * 26 * (1 - smooth01(0.48, 0.72, S.rp));
        if (S.rp >= 0.6) st.target = Math.round(st.spin / STEP) * STEP;
      }
      if (!(S.rp > 0.3 && S.rp < 0.72)) st.spin += (st.target - st.spin) * Math.min(1, dt * 16);
      crane.rotation.z = swing * 1.55; cyl.rotation.z = st.spin; M.hammer.rotation.x = ham;
    },
    onFire(S, M, fx, st) { st.target = (st.target || 0) + STEP; fx.smoke(4, null, ['bone', 'mist', 'haze'], 0.5); },   // white-grey cap smoke
    dry(S, M, fx, st) { st.target = (st.target || 0) + STEP; }
  };
}

// ---------- 7. RUNTIME PIECES: flash frames, particles, coiled cable ----------
const CSS = k => '#' + PAL[k].toString(16).padStart(6, '0');
// #96 MUZZLE FLASH (Jon 2026-10-30, ref review/refs/guns/muzzle-flash-ref.png): a TONGUE of flame out of the barrel along
// the bore, not a camera-facing sprite pasted over the gun body. Two 24x8 pixel-art frames per style, drawn with the base
// (u = 0) at the muzzle and the tip at u = 1: 'fire' (white-hot core, yellow, orange fringe, jagged tip; frame 2 shorter and
// more orange), 'ray' (lime bolt with a pale core), 'cap' (a small orange pop, then a wisp of smoke). Sizes per skin: FLASH_SIZE.
function tongueFrames(THREE, style) {
  const out = [], W = 24, Hh = 8;
  const COLS = style === 'ray' ? ['bone', 'lime', 'green', 'forest'] : style === 'cap' ? ['lemon', 'orange', 'rust', 'rust'] : ['bone', 'lemon', 'yellow', 'orange'];
  for (let f = 0; f < 2; f++) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
    const g = cv.getContext('2d'), R = (x, y, k) => { g.fillStyle = CSS(k); g.fillRect(x, y, 1, 1); };
    const len = f ? W * 0.62 : W, pw = style === 'ray' ? 0.9 : 1.5;
    for (let x = 0; x < len; x++) {
      const q = x / len, jag = ((x * 7 + f * 3) % 3 - 1) * 0.45;
      let hh = 3.6 * (1 - Math.pow(q, pw)) + (q > 0.3 ? jag : 0);          // half height of the tongue at this column
      if (style === 'cap') hh *= 0.75;
      if (f && style === 'cap') { if ((x + 1) % 3 === 0) { R(x, 3, 'mist'); R(x, 4, 'haze'); } continue; }   // smoke wisp
      for (let y = 0; y < Hh; y++) {
        const d = Math.abs(y + 0.5 - Hh / 2); if (d > hh) continue;
        const k = d <= hh * 0.28 && q < 0.42 ? COLS[0] : d <= hh * 0.5 && q < 0.7 ? COLS[1] : d <= hh * 0.78 ? COLS[2] : COLS[3];
        R(x, y, f && style !== 'ray' && k === COLS[0] ? COLS[1] : k);        // frame 2 has no white core
      }
    }
    const t = new THREE.CanvasTexture(cv); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; out.push(t);
  }
  return out;
}
// tongue length / height per skin (skin space, before the holder scale); Jon: the AQUA PRO one must stay small
// (lengths are ~x1.6 what a side view would need: in first person the bore points mostly into the screen and the tongue
// foreshortens to about half; the plane spins round the bore every frame to face the camera, see anim())
const FLASH_SIZE = { guncon: { len: 0.44, h: 0.15 }, justifier: { len: 0.56, h: 0.17 }, zapper: { len: 0.38, h: 0.14 }, revolver: { len: 0.24, h: 0.09 } };   // 0.026: Jon 'barely anything' at 0.27 -> ~x1.65
// Pool of unit cubes (one InstancedMesh, unlit palette colours): shells, sparks, smoke puffs.
class Particles {
  constructor(THREE, n, parent) {
    this.T = THREE; this.n = n; this.next = 0; this.live = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), n);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.name = 'gun-particles';
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.c = new THREE.Color(); this.d = [];
    for (let i = 0; i < n; i++) {
      this.d.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), sc: new THREE.Vector3(), g: 1, drag: 0, grow: 0 });
      this.mesh.setMatrixAt(i, this.zero); this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
    parent.add(this.mesh);
  }
  spawn(p, v, sx, sy, sz, col, life, grav, drag, grow, spin) {
    const i = this.next; this.next = (this.next + 1) % this.n; const d = this.d[i];
    d.p.copy(p); d.v.copy(v); d.sc.set(sx, sy, sz); d.life = d.max = life; d.g = grav; d.drag = drag || 0; d.grow = grow || 0;
    const w = spin === undefined ? 14 : spin;
    d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); d.w.set((Math.random() - 0.5) * w, (Math.random() - 0.5) * w, (Math.random() - 0.5) * w);
    this.mesh.setColorAt(i, this.c.setHex(PAL[col])); this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      const d = this.d[i]; if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { this.mesh.setMatrixAt(i, this.zero); continue; }
      live++;
      d.v.y -= 9.8 * d.g * dt; if (d.drag) d.v.multiplyScalar(Math.max(0, 1 - d.drag * dt));
      d.p.addScaledVector(d.v, dt); d.r.addScaledVector(d.w, dt);
      const age = 1 - d.life / d.max, k = (1 + d.grow * age) * Math.min(1, d.life / 0.08);
      this.s.copy(d.sc).multiplyScalar(k);
      this.mesh.setMatrixAt(i, this.m.compose(d.p, this.q.setFromEuler(this.e.set(d.r.x, d.r.y, d.r.z)), this.s));
    }
    this.live = live; this.mesh.visible = live > 0; this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const d of this.d) d.life = 0; this.update(0); }
}
// Coiled cable: a Verlet rope (top two points pinned to the grip boot, last point below the frame) drawn as a helix of cubes.
class Cable {
  constructor(THREE, parent) {
    this.N = 14; this.SEG = 0.056; this.COILS = 230; this.R = 0.0105; this.TURN = 0.023; this.fresh = true;
    this.rope = []; this.old = []; for (let i = 0; i < this.N; i++) { this.rope.push(new THREE.Vector3()); this.old.push(new THREE.Vector3()); }
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), this.COILS);
    this.mesh.frustumCulled = false; this.mesh.name = 'gun-cable';
    this.cols = ['slate', 'navy', 'void']; this.c = new THREE.Color(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3(); this.t = new THREE.Vector3(); this.n1 = new THREE.Vector3(); this.n2 = new THREE.Vector3(); this.d = new THREE.Vector3();
    this.toCam = new THREE.Vector3(0, 0, 1); this.sc = new THREE.Vector3();
    for (let i = 0; i < this.COILS; i++) this.mesh.setColorAt(i, this.c.setHex(PAL.navy));
    parent.add(this.mesh);
  }
  update(dt, a, a2, b) {
    const R = this.rope, O = this.old, N = this.N;
    if (this.fresh) { for (let i = 0; i < N; i++) { R[i].lerpVectors(a, b, i / (N - 1)); O[i].copy(R[i]); } this.fresh = false; }
    const steps = Math.max(1, Math.min(4, Math.round(dt * 120))), h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const g = 9.8 * h * h;
      for (let i = 2; i < N - 1; i++) { this.d.subVectors(R[i], O[i]).multiplyScalar(0.982); O[i].copy(R[i]); R[i].add(this.d); R[i].y -= g; }
      for (let it = 0; it < 8; it++) {
        R[0].copy(a); R[1].copy(a2); R[N - 1].copy(b);
        for (let i = 0; i < N - 1; i++) {
          const p = R[i], q = R[i + 1]; this.d.subVectors(q, p);
          const len = this.d.length() || 1e-6, diff = (len - this.SEG) / len;
          const wp = i < 2 ? 0 : 0.5, wq = i + 1 >= N - 1 ? 0 : 0.5, sum = (wp + wq) || 1;
          p.addScaledVector(this.d, diff * wp / sum); q.addScaledVector(this.d, -diff * wq / sum);
        }
      }
    }
    const total = (N - 1) * this.SEG;
    for (let c = 0; c < this.COILS; c++) {
      const s = c / (this.COILS - 1) * total, seg = Math.min(N - 2, Math.floor(s / this.SEG)), f = s / this.SEG - seg;
      this.t.subVectors(R[seg + 1], R[seg]).normalize();
      this.n1.crossVectors(this.t, this.toCam).normalize(); this.n2.crossVectors(this.n1, this.t).normalize();
      const ph = s / this.TURN * Math.PI * 2, cs = Math.cos(ph), sn = Math.sin(ph);
      this.v.lerpVectors(R[seg], R[seg + 1], f).addScaledVector(this.n1, cs * this.R).addScaledVector(this.n2, sn * this.R);
      this.mesh.setMatrixAt(c, this.m.compose(this.v, this.q, this.sc.setScalar(0.0102)));
      this.mesh.setColorAt(c, this.c.setHex(PAL[sn > 0.35 ? this.cols[0] : sn < -0.35 ? this.cols[2] : this.cols[1]]));
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- 8. THE GUN OBJECT ----------
const SKINS = [   // order = the GUN sign cycle; index 0 is the default (AQUA PRO since 0.009, #63)
  { id: 'guncon', name: 'AQUA PRO', desc: 'Hefty two-tone pistol: aqua frame, navy slide with serrations, yellow racing stripe.' },
  { id: 'justifier', name: 'HOT ROD', desc: 'Long blue enforcer with a pump front grip, chrome muzzle, flame decals and a lucky 7.' },
  { id: 'zapper', name: 'RAY-85', desc: 'Retro ray gun in cream and orange: long ringed barrel, ribbed vent block, charge meter.' },
  { id: 'revolver', name: 'CANDY SIX', desc: 'Candy-green toy six-shooter with a swing-out cylinder and an orange safety tip.' }];
// #76 per-gun TRACERS (drawn by core/fx.js; the hit itself stays instant hitscan). px = 426x240 game pixels.
// T = flight time (s), fade = s after arrival (beams), wave = sine wiggle {amp px, wl px, speed rad/s},
// layers outer -> inner: { len px (Infinity = beam from the muzzle), w px, cols [flight, ..., fade] }, impact: null|'zap'|'puff'
const TRACERS = {
  guncon:    { T: 0.06, layers: [{ len: 16, w: 1, cols: ['sand', 'tan'] }, { len: 6, w: 3.5, cols: ['amber', 'tan'] }, { len: 3, w: 2, cols: ['lemon', 'yellow'] }] },  // brass slug
  justifier: { T: 0.055, layers: [{ len: 84, w: 3, cols: ['orange', 'orange', 'rust'] }, { len: 74, w: 1.5, cols: ['lemon', 'yellow', 'amber'] }, { len: 9, w: 2, cols: ['bone', 'lemon'] }] },  // hot rifle streak
  zapper:    { T: 0.07, fade: 0.09, wave: { amp: 3.2, wl: 22, speed: 46 }, impact: 'zap',                                       // wavy green laser
               layers: [{ len: Infinity, w: 5, cols: ['green', 'green', 'forest'] }, { len: Infinity, w: 3, cols: ['lime', 'lime', 'green'] }, { len: Infinity, w: 1, cols: ['bone', 'lime'] }] },
  revolver:  { T: 0.07, impact: 'puff', layers: [{ len: 10, w: 1, cols: ['mist', 'haze'] }] }                                     // toy cap gun: almost nothing
};
const BUILDERS = { justifier: buildHotRod, guncon: buildAquaPro, zapper: buildRay85, revolver: buildCandySix };
// Camera-space placement.  x/y/z = wrist position, s = scale, follow = slide with an aim left of centre, followR =
// slide with an aim right of centre (negative on purpose: the gun steps LEFT so a right-hand aim keeps some screen
// distance from it and the barrel can show its right profile instead of its back), lift = slide up with the aim,
// near / nearR = depth on the crosshair ray where the bore line converges for an aim left / right of the gun (see
// "aim" in update), roll = cant, rollX / rollY = extra cant when aiming right / up (small: readable silhouette).
// Check pass 0.002: both shrunk to ~60% of the first size (on the 426x240 grid the desktop gun is ~80x60 px at
// a centre aim; mobile ~57x58 px, bottom-middle) so it never covers the centre lane or the far targets.
// Phase 3 (#21): the desktop PLAY layout moved a third of the way in from the corner (wrist at x 0.5 instead of
// 0.74); its muzzle stays well right of the centre lane (x 213) at a centre aim.  '-low' parks it in the corner
// for menus (desktop: where the play layout used to be; mobile: bottom-right, clear of the low phone signs),
// '-away' slides it below the frame (briefing / results, where Deputy Duck stands bottom-right).
// The rig eases between layouts.
const LAYOUTS = {
  desktop: { x: 0.42, y: -0.36, z: -1.0, s: 0.8, near: 2.4, nearR: 1.5, roll: 0.06, follow: 0.07, followR: -0.2, lift: 0.03, rollX: 0.06, rollY: 0.03 },
  mobile:  { x: 0.12, y: -0.36, z: -1.0, s: 0.62, near: 2.2, nearR: 1.6, roll: 0.08, follow: 0.1, followR: -0.1, lift: 0.03, rollX: 0.06, rollY: 0.04 }
};
LAYOUTS['desktop-low'] = Object.assign({}, LAYOUTS.desktop, { x: 0.74, y: -0.38, follow: 0.035, followR: 0.06 });
LAYOUTS['mobile-low'] = Object.assign({}, LAYOUTS.mobile, { x: 0.74, y: -0.42, follow: 0.035, followR: 0.06 });
// 0.007 versus play (landscape): the right-hand HUD half holds P2's name, hit counter and ammo capsule, so the gun
// stands between the centre timer and P2's name label instead of on top of them (a touch smaller)
LAYOUTS['desktop-versus'] = Object.assign({}, LAYOUTS.desktop, { x: 0.29, y: -0.34, s: 0.6 });
LAYOUTS['desktop-away'] = Object.assign({}, LAYOUTS['desktop-low'], { y: LAYOUTS['desktop-low'].y - 0.62 });
LAYOUTS['mobile-away'] = Object.assign({}, LAYOUTS.mobile, { y: LAYOUTS.mobile.y - 0.62 });
const LKEYS = ['near', 'nearR', 'roll', 'follow', 'followR', 'lift', 'rollX', 'rollY'];
// Until main.js asks for 'desktop-low' on menus itself, the play layout on a menu screen means the corner park
// (the signs sit where the play gun now stands).  Harmless once main.js picks '-low' for desktop menus.
function menuPark(name) {
  const G = BLAM.G;
  return name === 'desktop' && G && G.screenName && G.screenName !== 'play' ? 'desktop-low' : name;
}
function create(THREE, opts) {
  opts = opts || {};
  const FOV = opts.fov || 50, ASPECT = opts.aspect || 426 / 240, TAN_H = Math.tan(FOV * Math.PI / 360);
  const mat = toonMaterial(THREE, opts.material), ledMat = new THREE.MeshBasicMaterial({ color: PAL.lime, fog: false });
  mat.uniforms.uFlush.value = 1; mat.uniforms.uFlushY.value = 4;                 // flush channel = lit meter segments / vent glow
  for (const k of ['uFB', 'uFL', 'uFH']) mat.uniforms[k].value.setHex(PAL.lime);
  const group = new THREE.Group(), rig = new THREE.Group(), kick = new THREE.Group(), holder = new THREE.Group();
  group.name = 'BLAM.gun'; group.add(rig); rig.add(kick); kick.add(holder);
  const tex = { fire: tongueFrames(THREE, 'fire'), ray: tongueFrames(THREE, 'ray'), cap: tongueFrames(THREE, 'cap') };
  // #96: two crossed planes along the bore (-z in skin space), base at the muzzle; DEPTH-TESTED so the gun occludes it
  const flashMat = new THREE.MeshBasicMaterial({ map: tex.fire[0], alphaTest: 0.5, transparent: false, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide });   // no depth test: it starts past the muzzle and points away, so nothing of the gun should hide it
  const tongueGeo = new THREE.PlaneGeometry(1, 1); tongueGeo.rotateY(Math.PI / 2); tongueGeo.translate(0, 0, -0.5);   // x (u) -> -z, from the origin
  const flash = new THREE.Group(); flash.name = 'gun-flash'; flash.visible = false;
  const flashA = new THREE.Mesh(tongueGeo, flashMat), flashB = new THREE.Mesh(tongueGeo, flashMat); flashB.rotation.z = Math.PI / 2;
  flashA.renderOrder = flashB.renderOrder = 10; flash.add(flashA); flash.add(flashB); holder.add(flash);
  const parts = new Particles(THREE, 80, group), cable = new Cable(THREE, group), skins = {};
  for (const m of [parts.mesh, cable.mesh]) m.geometry.boundingBox = new THREE.Box3();   // effects never count toward the gun's bounds
  let skin = null, skinIndex = 0, layoutName = LAYOUTS[menuPark(opts.layout)] ? menuPark(opts.layout) : (String(opts.layout || '').indexOf('mobile') === 0 ? 'mobile' : 'desktop');
  const L0 = LAYOUTS[layoutName], base = new THREE.Vector3(L0.x, L0.y, L0.z);
  let scale = L0.s;
  const P = {}; for (const k of LKEYS) P[k] = L0[k];                             // eased layout parameters
  let reloadT = 0, reloadDur = 0, flashRot = 0, flashScale = 1; const _fc = new THREE.Vector3();
  const aim = { x: 0, y: 0 };
  const S = { t: 0, frame: 0, trig: 0, kick: 0, kickV: 0, rp: -1, rpPrev: -1, empty: false, emptyFrame: -1, reloadFrame: -1, fireAge: 9, dryAge: 9, shots: 0 };
  S.cross = a => S.rp >= 0 && S.rpPrev < a && S.rp >= a;
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _aim = new THREE.Vector3(), _M = new THREE.Matrix4(),
    _bo = new THREE.Vector3(), _a = new THREE.Vector3(), _a2 = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
  const chain = () => { rig.updateMatrix(); kick.updateMatrix(); holder.updateMatrix(); return _M.multiplyMatrices(rig.matrix, kick.matrix).multiply(holder.matrix); };
  const toGroup = (p, out) => out.copy(p).applyMatrix4(_M);                          // skin space -> group space (after chain())
  const dirGroup = (d, out) => out.set(d[0], d[1], d[2]).transformDirection(_M);
  const fx = {
    shell() {                                                                      // brass case out of the port
      chain(); toGroup(skin.portV, _p); dirGroup(skin.portDir, _d);
      _v.copy(_d).multiplyScalar(1.5 + Math.random() * 0.6); _v.x += (Math.random() - 0.5) * 0.3;
      parts.spawn(_p, _v, 0.0085, 0.0085, 0.017, 'amber', 1.1, 0.55, 0.3, 0, 18);
    },
    sparks(n, cols) {
      chain(); toGroup(skin.muzzleV, _p); dirGroup([0, 0, -1], _d);
      for (let i = 0; i < n; i++) { _v.copy(_d).multiplyScalar(0.7 + Math.random() * 1.3); _v.x += (Math.random() - 0.5) * 1.2; _v.y += (Math.random() - 0.3) * 1.2;
        parts.spawn(_p, _v, 0.0055, 0.0055, 0.0055, cols[i % cols.length], 0.1 + Math.random() * 0.14, 0.4, 3); }
    },
    smoke(n, at, cols, life) {                                                    // cols / life: optional (#76 per-gun puffs)
      chain(); toGroup(at || skin.muzzleV, _p); cols = cols || ['haze', 'mist']; life = life || 0.45;
      for (let i = 0; i < n; i++) { _v.set((Math.random() - 0.5) * 0.12, 0.1 + Math.random() * 0.16, -0.05 - Math.random() * 0.12);
        parts.spawn(_p, _v, 0.011, 0.011, 0.011, cols[i % cols.length], life + Math.random() * life * 0.66, -0.02, 1.5, 1.8, 0); }
    },
    dropFrom(obj, pts, col) {                                                     // fall straight out of a moving part (revolver shells)
      obj.updateWorldMatrix(true, false); group.updateWorldMatrix(true, false);
      for (const q of pts) { _p.set(q[0], q[1], q[2]); obj.localToWorld(_p); group.worldToLocal(_p);
        _v.set((Math.random() - 0.5) * 0.3, -0.2 - Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
        parts.spawn(_p, _v, 0.0085, 0.0085, 0.017, col || 'amber', 1.2, 0.6, 0.2, 0, 10); }
    }
  };
  function getSkin(id) {
    if (skins[id]) return skins[id];
    const def = (BUILDERS[id] || buildHotRod)(THREE, mat), root = new THREE.Group(); root.name = 'gun-skin-' + id;
    for (const k in def.meshes) { const m = def.meshes[k]; m.userData.p0 = m.position.clone(); m.userData.z0 = m.position.z; if (k === 'led') m.material = ledMat; root.add(m); }
    if (def.setup) def.setup(root, def.meshes, THREE);
    def.root = root; def.st = {}; def.muzzleV = V3(THREE, def.muzzle); def.portV = V3(THREE, def.port);
    def.cableV = V3(THREE, def.cable); def.wristV = V3(THREE, def.wrist);
    def.boreV = def.muzzleV.clone().sub(def.wristV).multiplyScalar(def.size || 1); def.boreV.z = 0;   // bore line point, rig space
    return (skins[id] = def);
  }
  function setSkin(x) {
    let idx = typeof x === 'number' ? Math.floor(x) : SKINS.findIndex(s => s.id === x);
    if (!(idx >= 0 && idx < SKINS.length)) idx = 0;
    const sk = getSkin(SKINS[idx].id);
    if (skin && skin !== sk) holder.remove(skin.root);
    skin = sk; skinIndex = idx; holder.add(sk.root);
    holder.scale.setScalar(sk.size || 1); holder.position.copy(sk.wristV).multiplyScalar(-(sk.size || 1));
    flash.position.copy(sk.muzzleV); flash.position.z -= 0.02; cable.cols = sk.coil; cable.fresh = true; sk.st = {};   // #96: a hair past the muzzle (bore = -z)
  }
  function settle() {                                                             // jump to the rest pose, let the cable hang
    const L = LAYOUTS[layoutName]; base.set(L.x, L.y, L.z); scale = L.s; for (const k of LKEYS) P[k] = L[k];
    for (let i = 0; i < 40; i++) update(0.05, S.t);
    cable.fresh = true; for (let i = 0; i < 60; i++) update(1 / 60, S.t);
  }
  function update(dt, t) {
    dt = Math.min(0.05, Math.max(0, +dt || 0)); S.t = t !== undefined ? +t : S.t + dt;
    if (!skin) return;
    S.frame++;
    const L = LAYOUTS[layoutName], kL = 1 - Math.exp(-6 * dt);
    base.x += (L.x - base.x) * kL; base.y += (L.y - base.y) * kL; base.z += (L.z - base.z) * kL; scale += (L.s - scale) * kL;
    for (const k of LKEYS) P[k] += (L[k] - P[k]) * kL;
    S.fireAge += dt; S.dryAge += dt; S.trig = Math.max(0, S.trig - dt * 6); S.rpPrev = S.rp;
    if (reloadDur > 0) { reloadT += dt; if (reloadT >= reloadDur) { reloadDur = 0; S.rp = -1; S.rpPrev = -1; } else S.rp = reloadT / reloadDur; }
    S.kickV += (-260 * S.kick - 19 * S.kickV) * dt; S.kick += S.kickV * dt;              // recoil spring
    // rig: layout base + slide toward the aim + breathing
    const T = S.t, br = Math.sin(T * 1.9), sw = Math.sin(T * 0.95);
    _p.set(base.x + aim.x * (aim.x > 0 ? P.followR : P.follow) + sw * 0.0035, base.y + aim.y * P.lift + br * 0.003, base.z);
    rig.position.lerp(_p, 1 - Math.exp(-10 * dt)); rig.scale.setScalar(scale);
    // aim (#20): the bore line (through the muzzle, along the barrel) is turned to pass through a point ON the
    // crosshair ray, so on screen the barrel always points exactly at the crosshair.  Which point on the ray is a
    // free choice, and it is the readability knob: a close point turns the barrel across the view (long, side-on
    // silhouette), a far one turns it into the screen (you see the back of the gun).  Left of the gun P.near shows
    // the whole left flank; right of it P.nearR (closer still) shows a right-hand profile.  Blended smoothly on the
    // screen-space gap between gun and aim.
    _bo.copy(skin.boreV).multiplyScalar(scale).applyQuaternion(rig.quaternion).add(rig.position);   // bore origin, camera space
    const gx = _bo.x / (-_bo.z * TAN_H * ASPECT), wl = smooth01(-0.05, 0.4, gx - aim.x);
    const D = P.nearR + (Math.max(1.6, P.near - (skin.view || 0) * 2) - P.nearR) * wl;
    _aim.set(aim.x * TAN_H * ASPECT * D, aim.y * TAN_H * D, -D);
    const dx = _aim.x - _bo.x, dy = _aim.y - _bo.y, dz = _aim.z - _bo.z;
    const yaw = Math.atan2(dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const up = Math.max(0, aim.y), rt = Math.max(0, aim.x);                    // a small cant toward the player up / right
    // roll turns about the barrel axis, so it never moves the aim; kept small so the up-right silhouette stays a gun
    _e.set(pitch + br * 0.006, -yaw, P.roll + P.rollX * rt + P.rollY * up * (0.5 + rt) + sw * 0.012, 'YXZ');
    rig.quaternion.slerp(_q.setFromEuler(_e), 1 - Math.exp(-12 * dt));          // a little lag behind the crosshair
    // kick: recoil, then the reload pose (dip, tilt, show the side)
    kick.position.set(0, S.kick * 0.012, S.kick * 0.11); kick.rotation.set(S.kick * 0.62, 0, 0);
    if (S.rp >= 0) {
      const e = smooth01(0, 0.18, S.rp) * (1 - smooth01(0.8, 1, S.rp)), R = skin.reload || {};
      kick.position.y -= e * (R.dip || 0.05); kick.position.z += e * 0.02;
      kick.rotation.x += e * (R.pitch !== undefined ? R.pitch : 0.3);
      kick.rotation.y += e * (R.yaw !== undefined ? R.yaw : 0.25);
      kick.rotation.z += e * (R.roll !== undefined ? R.roll : 0.55);
    }
    skin.anim(S, skin.meshes, fx, skin.st, dt);
    ledMat.color.setHex(PAL[S.rp >= 0 ? ((T * 8 | 0) % 2 ? 'amber' : 'rust') : S.empty ? ((T * 3 | 0) % 2 ? 'red' : 'oxblood') : (skin.led || 'lime')]);
    if (S.fireAge < 0.09) {                                                          // #96: tongue along the bore, ~5 frames at 60 Hz
      const f = S.fireAge < 0.05 ? 0 : 1, FS = FLASH_SIZE[SKINS[skinIndex].id] || FLASH_SIZE.guncon;
      const dk = (window.BLAM && window.BLAM.FX && window.BLAM.FX.dark) ? 1.35 : 1;   // dark scenes (#92): a bigger lick
      flash.visible = true; flashMat.map = tex[skin.flash][f];
      const len = FS.len * (f ? 0.62 : 1) * flashScale * dk, h = FS.h * (f ? 0.8 : 1) * flashScale * dk;
      flash.scale.set(h, h, len);
      // axial billboard: spin the cross round the bore so plane A's face points at the camera (the gun group is a camera
      // child, so the camera sits at the group's origin); flashRot only flips which way the jagged edge points
      flash.rotation.z = 0; flash.updateWorldMatrix(true, false); _fc.set(0, 0, 0); flash.worldToLocal(group.localToWorld(_fc));
      flash.rotation.z = Math.atan2(_fc.y, _fc.x) + (flashRot >= Math.PI ? Math.PI : 0);
    } else flash.visible = false;
    parts.update(dt);
    chain(); toGroup(skin.cableV, _a); dirGroup(skin.cableDir, _d); _a2.copy(_a).addScaledVector(_d, cable.SEG);
    _b.set(base.x + 0.06, -0.98, base.z + 0.08);
    cable.update(dt, _a, _a2, _b);
  }
  function fire() {
    // The engine may start the reload / set empty for the LAST round just before calling fire() in the same frame:
    // that shot still gets its flash and recoil.  A real dry trigger only clicks.
    // Build 0.005 (#44): reload is instant, the rack animation is cosmetic: firing mid-rack snaps it to the end.
    if (!skin) return;
    if (reloadDur > 0 && S.reloadFrame !== S.frame) { reloadDur = 0; S.rp = -1; S.rpPrev = -1; }
    S.trig = 1;
    if (S.empty && S.emptyFrame !== S.frame) { S.dryAge = 0; S.kickV += 2.5; if (skin.dry) skin.dry(S, skin.meshes, fx, skin.st); return; }
    S.fireAge = 0; S.shots++; S.kickV += 10;
    flashRot = (Math.random() * 4 | 0) * Math.PI / 2; flashScale = (0.9 + Math.random() * 0.25) * (skin.flashScale || 1);
    if (skin.onFire) skin.onFire(S, skin.meshes, fx, skin.st);
    if (skin.shells) fx.shell();
    fx.sparks(skin.sparkN || 5, skin.sparkCols || (skin.flash === 'ray' ? ['cyan', 'ice', 'lime'] : ['lemon', 'orange', 'yellow']));
  }
  const gun = {
    group,
    get skinId() { return SKINS[skinIndex].id; }, get skinIndex() { return skinIndex; }, get skin() { return SKINS[skinIndex]; },
    get layout() { return layoutName; }, get reloading() { return reloadDur > 0; }, get empty() { return S.empty; },
    get flashAmount() { return Math.max(0, 1 - S.fireAge / 0.08); },
    setSkin(x) { setSkin(x); },
    nextSkin() { setSkin((skinIndex + 1) % SKINS.length); },
    setLayout(name) { name = menuPark(name); layoutName = LAYOUTS[name] ? name : (String(name).indexOf('mobile') === 0 ? 'mobile' : 'desktop'); },
    setAim(x, y) { aim.x = Math.max(-1.3, Math.min(1.3, +x || 0)); aim.y = Math.max(-1.3, Math.min(1.3, +y || 0)); },
    fire,
    reload(seconds) { if (!skin) return; reloadDur = Math.max(0.08, +seconds || 0.12); reloadT = 0; S.rp = 0; S.rpPrev = 0; S.reloadFrame = S.frame; },
    setEmpty(b) { if (b && !S.empty) S.emptyFrame = S.frame; S.empty = !!b; },
    update,
    // #76: the current skin's tracer look (BLAM.Guns.TRACERS) and the muzzle tip in world space (null when hidden)
    tracerLook() { return TRACERS[SKINS[skinIndex].id] || null; },
    muzzlePoint(out) { if (!skin || !group.visible) return null; return gun.muzzleWorldPos(out); },
    muzzleWorldPos(out) { out = out || new THREE.Vector3(); skin.root.updateWorldMatrix(true, false); return skin.root.localToWorld(out.copy(skin.muzzleV)); },
    // #72: the ejection port (world space) + its eject direction (world, unit) for the HUD casings; kind = skin id
    ejectPoint() {
      if (!skin) return null; skin.root.updateWorldMatrix(true, false);
      const pos = skin.root.localToWorld(new THREE.Vector3().copy(skin.portV));
      const dir = new THREE.Vector3(skin.portDir[0], skin.portDir[1], skin.portDir[2]).transformDirection(skin.root.matrixWorld);
      return { pos, dir, kind: SKINS[skinIndex].id };
    },
    dispose() {
      if (group.parent) group.parent.remove(group);
      for (const id in skins) for (const k in skins[id].meshes) skins[id].meshes[k].geometry.dispose();
      mat.dispose(); ledMat.dispose(); flash.material.dispose(); tex.fire.concat(tex.ray, tex.cap).forEach(t => t.dispose());
      for (const m of [parts.mesh, cable.mesh]) { m.geometry.dispose(); m.material.dispose(); }
    }
  };
  setSkin(opts.skin !== undefined ? opts.skin : 0); settle();
  return gun;
}
BLAM.Guns = { SKINS, create, LAYOUTS, TRACERS };
})();
