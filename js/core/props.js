'use strict';
/* =========================================================================================
   B.L.A.M. core/props.js -- shared shooting-gallery props: bullseye paddles, cast-iron bombs,
   decoys (bombs painted like targets) and flip bombs. Every stage can use them.

   LOOK: voxels on the BLAM-34 palette, sampled from signed-distance shapes so they read ROUND
   (smooth per-voxel normals), lit by ONE shared toon material: three exact palette tones per
   colour (shadow / base / lit), a void outline (inverted hull whose width is constant in screen
   pixels, plus a rim test), NO plastic gloss band (paddles read as painted wood, bombs as iron:
   iron gets a small hard top-left spot and a dark slate rim crescent instead). Output alpha 1.0
   = the "object" dither class. Each prop is 3-5 draw calls (static base, swinging arm, the
   face, optional fuse + spark); geometry is built ONCE per kind and shared by every instance.

   API  (BLAM.Props)
     paddle({ color:'red', size:1, hang:false, slot:false })   bullseye disc on a post (hang: ceiling hanger;
                                                    slot: a slim carriage that rides in a floor slot
                                                    instead of the wooden sled + base plate; any prop takes it)
     bomb({ size:1, hang:false, burn:false })       iron ball, skull + crossbones, cap, fuse, spark
                                                    (burn: the fuse is its own mesh so setFuse() can shorten it)
     decoy({ size:1, hang:false })                  a BOMB painted like a target: round, red rings with
                                                    off-white (mist) bands and an orange bull, cap + fuse
                                                    + spark; call wobble(t) every frame. kind 'bomb'
     flipbomb({ size:1, hang:false, color:'red' })  a burning bomb that flips into a paddle face
     -> prop {
       kind        'target' | 'bomb' (flipbomb: 'bomb'; the stage switches kind when it flips)
       group       THREE.Group: origin on the floor under the post (hang: at the ceiling rail clamp,
                   everything hangs DOWN from it). Position / scale it. Static base is in here.
       pivot       Group at the hinge (y = +PIVOT_Y, hang: -PIVOT_Y). Rotate it to swing / drop / fold.
       base, arm   meshes (not hittable): base plate or hanger, and the post + bracket on the pivot
       face        the hittable mesh (disc / ball), centre at pivot-space y = +-FACE_Y
       face2       flipbomb only: the paddle face it flips to (hidden until it flips)
       spark, fuse bombs: glow spark mesh, fuse mesh (burn / flipbomb only)
       register(target) -> [part, part2?]   calls target.part(face, chips...) (and returns the
                   flipbomb's second part record so a stage can swap target.parts[0])
       show() / hide()   face + fuse + spark on / off (hide on shatter: the arm stays to fold away)
       setFuse(f)  f = 1 full .. 0 burnt (spark rides the fuse; burn / flipbomb shorten it)
       sparkle(t, fast)  flicker the spark (call each frame while it is a live bomb)
       setFlip(f)  flipbomb: f 0 = bomb .. 1 = paddle, 0.5 = edge-on; returns true once flipped
       wobble(t)   decoy tell: a nervous wobble of the face (pure function of t)
       chips       the shatter list [[i, j, k, colourHex, sizeMul]...] used by register()
     }
     Props.warm()           build every shared geometry now (call at stage load, not mid-play)
     Props.mat              the shared toon ShaderMaterial (uOut = outline width: world units per unit of view
                            depth, 0.0042 ~ 1 game px; uLight = view-space light, top-left like the duck)
     Props.cspec(spec)      'base' or 'base/shadow/lit/spot' palette names -> the toon colour record
     Props.CHIP_S           chip lattice size the chip lists use
     Props.FACE_Y, PIVOT_Y, PADDLE_R, BOMB_R, POST_Z   layout (world units)
     Props.SCHEMES          paddle paint schemes: red, blue, green, pink, amber
     Props.Geo, Props.sdf   the builder (SDF voxeliser + toon geometry) for new props in this style
   Hit feedback lives in core/targets.js: Target.shatter() honours a 5th chip element (size
   multiplier, rims fly as bigger pieces) and Targets.burst(p, scale) is the cartoon flower
   explosion for bombs.
   Budget: paddle face ~8.5k tris, ball ~14k (smooth round voxels + silhouette hull); arm/base ~0.3k.
   Many of one prop at once (crowds of 20+): share prop.face.geometry in an InstancedMesh with
   Props.mat (it is instancing-safe) instead of calling paddle() 20 times.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT;

// ---------- palette ramps: [shadow, lit, spot] for every BLAM-34 colour (all palette entries) ----------
const RAMP = {
  void: ['void', 'midnight', 'navy'], midnight: ['void', 'navy', 'slate'], navy: ['midnight', 'slate', 'steel'], slate: ['navy', 'steel', 'haze'],
  steel: ['slate', 'haze', 'mist'], haze: ['steel', 'mist', 'bone'], mist: ['haze', 'bone', 'bone'], bone: ['mist', 'bone', 'bone'],
  indigo: ['midnight', 'plum', 'magenta'], umber: ['void', 'walnut', 'chestnut'], walnut: ['umber', 'chestnut', 'tan'],
  chestnut: ['walnut', 'tan', 'sand'], tan: ['chestnut', 'sand', 'lemon'], sand: ['tan', 'lemon', 'bone'],
  oxblood: ['umber', 'crimson', 'red'], crimson: ['oxblood', 'red', 'coral'], red: ['crimson', 'coral', 'bone'], coral: ['red', 'bubblegum', 'bone'],
  plum: ['oxblood', 'magenta', 'pink'], magenta: ['plum', 'pink', 'bubblegum'], pink: ['magenta', 'bubblegum', 'bone'], bubblegum: ['pink', 'bone', 'bone'],
  rust: ['oxblood', 'orange', 'amber'], orange: ['rust', 'amber', 'lemon'], amber: ['orange', 'yellow', 'lemon'], yellow: ['amber', 'lemon', 'bone'],
  lemon: ['yellow', 'bone', 'bone'], deepblue: ['midnight', 'blue', 'cyan'], blue: ['deepblue', 'cyan', 'ice'], cyan: ['blue', 'ice', 'bone'],
  ice: ['cyan', 'bone', 'bone'], forest: ['void', 'green', 'lime'], green: ['forest', 'lime', 'lemon'], lime: ['green', 'lemon', 'bone']
};
// colour spec 'base' or 'base/shadow/lit/spot' -> [base, shadow, lit, spot] as [r,g,b] (cached)
const _spec = new Map();
const rgb = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
function cspec(s) {
  let c = _spec.get(s); if (c) return c;
  const p = s.split('/'), b = p[0], r = RAMP[b] || [b, b, b], names = [b, p[1] || r[0], p[2] || r[1], p[3] || r[2]];
  for (const n of names) if (PAL[n] === undefined) throw new Error('BLAM.Props: unknown palette colour ' + n);
  c = names.map(n => rgb(PAL[n])); _spec.set(s, c); return c;
}
const hexOf = s => PAL[s.split('/')[0]];

// ---------- the toon material (shared by every prop) ----------
// per vertex: cBase / cLo (shadow) / cHi (lit) / cSp (spot) + aInfo (x: iron = spot + rim crescent, y: hull, z: flat/emissive)
// + aOff (hull corner direction). The hull is pushed out by uOut screen pixels at any depth; hull fragments whose
// smooth normal faces the camera are discarded, so voxel stair-steps never streak the surface.
const VS = `
attribute vec3 cBase; attribute vec3 cLo; attribute vec3 cHi; attribute vec3 cSp; attribute vec4 aInfo; attribute vec3 aOff;
uniform float uOut;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP;
#include <fog_pars_vertex>
void main() {
  vB = cBase; vL = cLo; vH = cHi; vS = cSp; vI = aInfo;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  #ifdef USE_INSTANCING
  mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #endif
  if (aInfo.y > 0.5) mvPosition.xyz += mat3(modelViewMatrix) * aOff * (uOut * max(0.5, -mvPosition.z));
  vec3 nor = normal;
  #ifdef USE_INSTANCING
  nor = mat3(instanceMatrix) * nor;
  #endif
  vP = mvPosition.xyz; vN = normalize(normalMatrix * nor);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform vec3 uLight; uniform float uTHi; uniform float uTLo; uniform float uTSp; uniform float uRim; uniform float uCres; uniform vec3 uCresC;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP;
#include <fog_pars_fragment>
void main() {
  vec3 n = normalize(vN);
  float d = dot(n, uLight), rv = dot(n, normalize(-vP));
  vec3 c = d > uTHi ? vH : (d > uTLo ? vB : vL);
  if (vI.x > 0.5) {                                                  // cast iron: hard spot + dark rim crescent, no band
    if (d > uTSp) c = vS;
    else if (rv < uCres && d < uTLo + 0.12) c = uCresC;
  }
  if (vI.z > 0.5) c = vB;                                            // flat / emissive
  if (vI.y > 0.5 && rv > 0.2) discard;                                // hull only at the silhouette and behind (no stair-step streaks)
  if ((rv < uRim && vI.w < 0.5) || vI.y > 0.5) c = vec3(0.0431, 0.0431, 0.1020);   // outline: rim + hull = void
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;
const L0 = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();
const mat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uLight: { value: L0 }, uTHi: { value: 0.8 }, uTLo: { value: 0.22 }, uTSp: { value: 0.92 },
    uRim: { value: 0.1 }, uCres: { value: 0.5 }, uCresC: { value: new THREE.Color(PAL.slate) }, uOut: { value: 0.0042 }
  }]),
  vertexShader: VS, fragmentShader: FS, fog: true
});

// ---------- geometry: voxel faces with smooth normals + screen-constant inverted hull ----------
const FACES = [
  [1, 0, 0, [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1]], [-1, 0, 0, [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1]],
  [0, 1, 0, [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1]], [0, -1, 0, [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1]],
  [0, 0, 1, [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]], [0, 0, -1, [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1]]];
const VK = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
const HULL = cspec('void'), NOI = [0, 0, 0, 0];
const hullZ = v => !v.nrm || Math.abs(v.nrm[2]) < 0.8;   // hull only the silhouette band (faces looking along +-z never outline)
class Geo {
  constructor(smooth = 0.75) { this.p = []; this.n = []; this.cb = []; this.cl = []; this.ch = []; this.cs = []; this.inf = []; this.off = []; this.idx = []; this.vc = 0; this.k = smooth; }
  // one face f of an axis box centred (x,y,z) with half sizes (hx,hy,hz); C = cspec; I = aInfo; nrm = smooth normal; hull = void copy
  face(x, y, z, hx, hy, hz, f, C, I, nrm, hull) {
    const F = FACES[f], q = F[3];
    let nx = F[0], ny = F[1], nz = F[2];
    if (nrm) { const k = hull ? 1 : this.k; nx = nx * (1 - k) + nrm[0] * k; ny = ny * (1 - k) + nrm[1] * k; nz = nz * (1 - k) + nrm[2] * k;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
    const c = hull ? HULL : C, inf = hull ? [0, 1, 0, 0] : I;
    for (let v = 0; v < 12; v += 3) {
      this.p.push(x + q[v] * hx, y + q[v + 1] * hy, z + q[v + 2] * hz); this.n.push(nx, ny, nz);
      this.cb.push(...c[0]); this.cl.push(...c[1]); this.ch.push(...c[2]); this.cs.push(...c[3]); this.inf.push(...inf);
      if (hull) this.off.push(q[v], q[v + 1], q[v + 2]); else this.off.push(0, 0, 0);
    }
    const b = this.vc; this.vc += 4;
    if (hull) this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2); else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // axis box in world units with flat normals (posts, plates, bolts). hull: true | false | mask of faces
  bx(x0, y0, z0, x1, y1, z1, col, hull = true, info = NOI) {
    const C = cspec(col), x = (x0 + x1) / 2, y = (y0 + y1) / 2, z = (z0 + z1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
    for (let f = 0; f < 6; f++) {
      this.face(x, y, z, hx, hy, hz, f, C, info, null, false);
      if (hull === true || (typeof hull === 'number' && (hull >> f) & 1)) this.face(x, y, z, hx, hy, hz, f, C, info, null, true);
    }
    return this;
  }
  // voxel map from sdf() on lattice size s; (cx, cy, cz) = lattice point that lands on the origin.
  // hullFront: also hull the +z faces (off for faces that always look at the camera: their hull is never seen)
  // backCull (optional, off by default): drop voxels whose smooth normal z < backCull, for props that never turn their back
  voxels(map, s, cx = 0, cy = 0, cz = 0, hullFront = false, backCull = -2) {
    const h = s / 2;
    for (const v of map.values()) {
      if (v.nrm && v.nrm[2] < backCull) continue;
      const x = (v.i + 0.5 - cx) * s, y = (v.j + 0.5 - cy) * s, z = (v.k + 0.5 - cz) * s, C = cspec(v.col);
      const I = [v.iron ? 1 : 0, 0, v.flat ? 1 : 0, v.nh ? 1 : 0];      // w: paint relief, no rim outline (tones only)
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        if (map.has(VK(v.i + F[0], v.j + F[1], v.k + F[2]))) continue;
        if (v.nh) {                                                   // paint relief: crisp flat paint, sides one shadow tone (emboss)
          const Cs = f === 4 ? C : [C[1], C[1], C[1], C[1]];
          this.face(x, y, z, h, h, h, f, Cs, [0, 0, 1, 1], null, false); continue;
        }
        this.face(x, y, z, h, h, h, f, C, I, v.nrm, false);
        if (!v.nh && (hullFront || f !== 4) && hullZ(v)) this.face(x, y, z, h, h, h, f, C, I, v.nrm, true);
      }
    }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), F = (a, n) => new THREE.Float32BufferAttribute(a, n);
    g.setAttribute('position', F(this.p, 3)); g.setAttribute('normal', F(this.n, 3));
    g.setAttribute('cBase', F(this.cb, 3)); g.setAttribute('cLo', F(this.cl, 3)); g.setAttribute('cHi', F(this.ch, 3));
    g.setAttribute('cSp', F(this.cs, 3)); g.setAttribute('aInfo', F(this.inf, 4)); g.setAttribute('aOff', F(this.off, 3));
    g.setIndex(this.idx); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
// ---------- SDF voxeliser (lattice units): cells centred on (i+.5, j+.5, k+.5) inside box b = [x0,y0,z0,x1,y1,z1] ----------
// paint(x,y,z) -> 'colour' | { col, iron, flat, nh } | null.  Later calls overwrite earlier cells (paint over).
const len2 = (x, y) => Math.sqrt(x * x + y * y), len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const sdf = {
  // rounded annulus around the z axis: radius a..b (a < 0 = solid disc), z0..z1, edge rounding r
  ring(x, y, z, a, b, z0, z1, r) {
    const q1 = Math.abs(len2(x, y) - (a + b) / 2) - (b - a) / 2 + r, q2 = Math.abs(z - (z0 + z1) / 2) - (z1 - z0) / 2 + r;
    return len2(Math.max(q1, 0), Math.max(q2, 0)) + Math.min(Math.max(q1, q2), 0) - r;
  },
  sphere: (x, y, z, cx, cy, cz, r) => len3(x - cx, y - cy, z - cz) - r,
  // capped cylinder along unit axis d from point c, half length hl, radius r
  cyl(x, y, z, c, d, hl, r) {
    const px = x - c[0], py = y - c[1], pz = z - c[2], h = px * d[0] + py * d[1] + pz * d[2];
    const rr = len3(px - d[0] * h, py - d[1] * h, pz - d[2] * h), q1 = rr - r, q2 = Math.abs(h) - hl;
    return len2(Math.max(q1, 0), Math.max(q2, 0)) + Math.min(Math.max(q1, q2), 0);
  },
  capsule(x, y, z, a, b, r) {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2], bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  },
  voxelise(map, b, shape, paint, nshape) {
    const e = 1.1, ns = nshape || shape;
    for (let i = Math.floor(b[0]); i < Math.ceil(b[3]); i++) for (let j = Math.floor(b[1]); j < Math.ceil(b[4]); j++) for (let k = Math.floor(b[2]); k < Math.ceil(b[5]); k++) {
      const x = i + 0.5, y = j + 0.5, z = k + 0.5;
      if (shape(x, y, z) >= 0) continue;
      let p = paint(x, y, z); if (!p) continue; if (typeof p === 'string') p = { col: p };
      const gx = ns(x + e, y, z) - ns(x - e, y, z), gy = ns(x, y + e, z) - ns(x, y - e, z), gz = ns(x, y, z + e) - ns(x, y, z - e), gl = len3(gx, gy, gz) || 1;
      map.set(VK(i, j, k), { i, j, k, col: p.col, iron: p.iron, flat: p.flat, nh: p.nh, nrm: [gx / gl, gy / gl, gz / gl] });
    }
    return map;
  }
};

// ---------- layout (world units; matches the range's old paddles so motions and hit windows are unchanged) ----------
const PIVOT_Y = 0.13, FACE_Y = 1.4175, PADDLE_R = 0.51, BOMB_R = 0.49, POST_Z = -0.15;
const SP = 0.03, PR = PADDLE_R / SP;                  // paddle lattice (17 cells radius)
const SB = 0.033, BR = BOMB_R / SB;                   // bomb lattice (~14.85 cells radius)
const SCHEMES = {
  red:   { ring: 'red', light: 'bone', bull: 'yellow', lip: 'crimson', back: 'walnut' },
  blue:  { ring: 'blue', light: 'bone', bull: 'yellow', lip: 'deepblue', back: 'walnut' },
  green: { ring: 'green', light: 'bone', bull: 'yellow', lip: 'forest', back: 'walnut' },
  pink:  { ring: 'magenta', light: 'bone', bull: 'yellow', lip: 'plum', back: 'walnut' },
  amber: { ring: 'orange', light: 'bone', bull: 'lemon', lip: 'rust', back: 'walnut' }
};
const DECOY = { ring: 'red', light: 'mist', bull: 'orange' };   // the tell: off-white rings, orange bull (+ round, fuse, wobble)
const IRON = { col: 'midnight/void/navy/steel', iron: true };
// paint by radius (lattice units): bull, ring, light, ring, light, lip
const ringCol = (r, sc) => r < 4.6 ? sc.bull : r < 8.5 ? sc.ring : r < 10.9 ? sc.light : r < 14.5 ? sc.ring : r < 15.2 ? sc.light : sc.lip;

// ---------- paddle face: a thick disc, bevelled rim lip, raised ring paint, back battens ----------
function paddleFaceGeo(sc) {
  const shape = (x, y, z) => Math.min(
    sdf.ring(x, y, z, -PR, PR, -1.5, 1.5, 1.0),                                   // the wooden disc
    sdf.ring(x, y, z, -4.1, 4.1, 0, 2.6, 0.7),                                     // raised bull
    sdf.ring(x, y, z, 5.0, 8.0, 0, 2.6, 0.6), sdf.ring(x, y, z, 11.3, 14.1, 0, 2.6, 0.6),   // raised red rings
    sdf.ring(x, y, z, 15.2, PR, -1.9, 2.8, 0.8));                                  // bevelled rim lip
  const map = sdf.voxelise(new Map(), [-PR - 1, -PR - 1, -3, PR + 1, PR + 1, 4], shape, (x, y, z) => {
    const r = len2(x, y);
    if (z < -0.6) return r > 15.2 ? sc.lip : sc.back;
    return { col: ringCol(r, sc), nh: z > 1.0 && r < 15 };
  });
  const g = new Geo().voxels(map, SP);
  // back battens (painted wood) where the post bracket bites
  g.bx(-0.39, -0.048, -0.105, 0.39, 0.048, -0.045, 'chestnut');
  g.bx(-0.048, -0.39, -0.105, 0.048, 0.39, -0.045, 'chestnut');
  return g.geometry();
}
// ---------- bomb: a round cast-iron ball, steel cap at the top-right, fuse, skull + crossbones decal ----------
const CAP_D = (() => { const v = [0.5, 0.82, 0.3], l = len3(...v); return v.map(a => a / l); })();
const CAP_C = CAP_D.map(a => a * (BR - 0.2));
const F0 = CAP_D.map(a => a * (BR + 1.2)), F1 = [F0[0] + 0.4, F0[1] + 3.2, F0[2] + 0.3], F2 = [F1[0] + 2.8, F1[1] + 1.6, F1[2] + 0.3];
const SKULL = [
  '.....XXXXX.....', '...XXXXXXXXX...', '..XXXXXXXXXXX..', '..XXXXXXXXXXX..', '..XXoooXoooXX..', '..XXoooXoooXX..',
  '..XXXooXooXXX..', '...XXXXoXXXX...', '....XXoooXX....', '....XXXXXXX....', '....X.X.X.X....', 'XX...........XX',
  'XXXX.......XXXX', '..XXXX...XXXX..', '....XXXXXXX....', '..XXXX...XXXX..', 'XXXX.......XXXX', 'XX...........XX'];
function skullAt(x, y) {
  const c = Math.floor(x + 7.5), r = Math.floor(10.5 - y);
  if (r < 0 || r >= SKULL.length || c < 0 || c >= 15) return null;
  const ch = SKULL[r][c]; return ch === 'X' ? 'bone' : ch === 'o' ? 'void/void/midnight' : null;
}
const capShape = (x, y, z) => Math.min(sdf.cyl(x, y, z, CAP_C, CAP_D, 1.9, 3.1), sdf.cyl(x, y, z, CAP_C.map((a, i) => a - CAP_D[i] * 0.9), CAP_D, 0.55, 3.9));
const fuseShape = (x, y, z) => Math.min(sdf.capsule(x, y, z, F0, F1, 1.0), sdf.capsule(x, y, z, F1, F2, 1.0));
function capPaint(x, y, z) {
  const px = x - CAP_C[0], py = y - CAP_C[1], pz = z - CAP_C[2], h = px * CAP_D[0] + py * CAP_D[1] + pz * CAP_D[2];
  const rr = len3(px - CAP_D[0] * h, py - CAP_D[1] * h, pz - CAP_D[2] * h);
  return h > 1.0 && rr < 1.4 ? 'void' : h > 1.0 ? 'slate' : 'steel';
}
const fusePaint = (x, y, z) => len3(x - F2[0], y - F2[1], z - F2[2]) < 1.3 ? 'void' : (Math.floor((x + y + z) * 0.8) & 1) ? 'sand' : 'tan';
// face(x,y,z) -> paint for the front of the ball (skull / rings), null = plain iron
function ballGeo(face, withFuse) {
  const ball = (x, y, z) => sdf.sphere(x, y, z, 0, 0, 0, BR), B0 = Math.ceil(BR) + 1;
  const map = sdf.voxelise(new Map(), [-B0, -B0, -B0, B0, B0, B0], ball, (x, y, z) => (z > 2 && face(x, y, z)) || IRON);
  sdf.voxelise(map, [-B0, 6, -6, B0, B0 + 5, B0], capShape, capPaint);
  if (withFuse) sdf.voxelise(map, [0, 10, -2, B0 + 6, B0 + 10, B0 + 4], fuseShape, fusePaint);
  return new Geo(1).voxels(map, SB).geometry();     // no back cull on a ball: turned 90 deg its back cap is on the silhouette
}
function fuseGeo() {                                   // origin at the fuse root (F0) so scaling it burns it down
  const map = sdf.voxelise(new Map(), [0, 10, -2, BR + 8, BR + 12, BR + 4], (x, y, z) => Math.max(fuseShape(x, y, z), -capShape(x, y, z)), fusePaint);
  return new Geo(1).voxels(map, SB, F0[0], F0[1], F0[2], true).geometry();
}
function sparkGeo() {                                  // unlit twinkle star (MAT.glow)
  const v = new R.Vox();
  v.bx(-0.035, -0.035, -0.035, 0.035, 0.035, 0.035, PAL.lemon);
  v.bx(-0.012, -0.11, -0.012, 0.012, 0.11, 0.012, PAL.yellow); v.bx(-0.11, -0.012, -0.012, 0.11, 0.012, 0.012, PAL.yellow);
  for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) v.bx(a * 0.05 - 0.016, b * 0.05 - 0.016, -0.016, a * 0.05 + 0.016, b * 0.05 + 0.016, 0.016, PAL.orange);
  v.bx(-0.014, -0.014, 0.035, 0.014, 0.014, 0.05, PAL.bone);
  return v.geo();
}
// ---------- post + bracket (pivot space) and base plate / ceiling hanger (group space) ----------
function armGeo(ball, hang) {
  const g = new Geo(), Z = POST_Z, m = hang ? -1 : 1;
  const b = (x0, y0, z0, x1, y1, z1, col) => g.bx(x0, Math.min(m * y0, m * y1), z0, x1, Math.max(m * y0, m * y1), z1, col);
  b(-0.045, 0, Z - 0.045, 0.045, FACE_Y - 0.08, Z + 0.045, 'steel');            // the post
  b(-0.07, 0, Z - 0.07, 0.07, 0.1, Z + 0.07, 'slate');                           // collar over the hinge
  b(-0.13, -0.045, Z - 0.05, 0.13, 0.045, Z + 0.05, 'slate');                    // hinge knuckle
  if (ball) {                                                                    // cup the ball sits in
    b(-0.1, FACE_Y - 0.52, Z - 0.1, 0.1, FACE_Y - 0.43, Z + 0.1, 'slate');
    b(-0.065, FACE_Y - 0.43, Z - 0.065, 0.065, FACE_Y - 0.36, Z + 0.065, 'steel');
  } else {                                                                       // clamp bracket on the back battens
    b(-0.1, FACE_Y - 0.19, -0.2, 0.1, FACE_Y + 0.08, -0.105, 'steel');
    b(-0.07, FACE_Y - 0.15, -0.22, -0.03, FACE_Y - 0.11, -0.2, 'haze'); b(0.03, FACE_Y - 0.15, -0.22, 0.07, FACE_Y - 0.11, -0.2, 'haze');
  }
  return g.geometry();
}
function baseGeo(hang, slot) {
  const g = new Geo(), Z = POST_Z;
  if (slot) {                                                                    // slim carriage riding in a floor slot / hatch
    g.bx(-0.06, -0.35, Z - 0.08, 0.06, 0.09, Z + 0.08, 'slate');
    for (const sx of [-1, 1]) g.bx(sx * 0.105 - 0.025, 0.04, Z - 0.055, sx * 0.105 + 0.025, 0.19, Z + 0.055, 'steel');
    g.bx(-0.1, -0.02, Z - 0.1, 0.1, 0.03, Z + 0.1, 'navy');
  } else if (!hang) {
    g.bx(-0.3, 0, Z - 0.2, 0.3, 0.07, Z + 0.2, 'chestnut');                     // wooden sled
    g.bx(-0.27, 0.07, Z - 0.17, 0.27, 0.09, Z + 0.17, 'slate');                  // steel base plate
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.bx(sx * 0.21 - 0.022, 0.09, Z + sz * 0.11 - 0.022, sx * 0.21 + 0.022, 0.11, Z + sz * 0.11 + 0.022, 'haze', false);
    for (const sx of [-1, 1]) g.bx(sx * 0.125 - 0.025, 0.09, Z - 0.06, sx * 0.125 + 0.025, 0.19, Z + 0.06, 'steel');   // hinge cheeks
  } else {
    g.bx(-0.035, 0, Z - 0.035, 0.035, 0.95, Z + 0.035, 'steel');                 // hanger rod up into the ceiling rail
    g.bx(-0.15, 0.86, Z - 0.1, 0.15, 0.98, Z + 0.1, 'slate');                    // trolley
    for (const sx of [-1, 1]) g.bx(sx * 0.1 - 0.035, 0.95, Z - 0.06, sx * 0.1 + 0.035, 1.04, Z + 0.06, 'haze');
    g.bx(-0.2, -0.07, Z - 0.12, 0.2, 0, Z + 0.12, 'chestnut');                   // hanger block
    for (const sx of [-1, 1]) g.bx(sx * 0.125 - 0.025, -0.19, Z - 0.06, sx * 0.125 + 0.025, -0.07, Z + 0.06, 'steel');
  }
  return g.geometry();
}
// ---------- shatter chips: coarse voxel lists in each prop's own colours; [i, j, k, colour, sizeMul] ----------
const CS = 0.0935;                                     // chip lattice (the old 11x11 disc)
function paddleChips(sc) {
  const L = [];
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const d = Math.hypot(i, j); if (d > 5.45) continue;
    const r = d * CS / SP;                               // same ring layout as the face
    if (d > 4.6) L.push([i, j, 0, hexOf((i + j) & 1 ? sc.lip : ringCol(r - 1.5, sc)), 1.7]);   // rim: big chunks
    else L.push([i, j, 0, hexOf(ringCol(r, sc)), 1]);
    if (((i * 7 + j * 3) & 3) === 0) L.push([i, j, -1, hexOf(sc.back), 0.8]);
  }
  return L;
}
function ballChips(face) {
  const L = [], IR = ['midnight', 'void', 'navy', 'midnight', 'slate'];
  for (let k = -5; k <= 5; k++) for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const d = Math.hypot(i, j, k); if (d > 5.3 || d < 4.0) continue;
    const x = i * CS / SB, y = j * CS / SB, z = k * CS / SB, p = z > 2 && face(x, y, z);
    L.push([i, j, k, hexOf(p || IR[(i * 3 + j * 5 + k * 7 + 50) % 5]), p ? 1 : 1.25]);
  }
  L.push([2, 6, 1, PAL.steel, 1.6], [3, 6, 1, PAL.slate, 1.3]);   // the cap
  return L;
}
const skullFace = (x, y) => skullAt(x, y);
const decoyFace = (x, y) => { const r = len2(x, y); return r < 12 ? ringCol(r < 3.4 ? 0 : r < 6.4 ? 6 : r < 9.4 ? 9.5 : 12, DECOY) : null; };

// ---------- shared geometry cache (built on first use) ----------
const G = {};
const geo = (key, fn) => G[key] || (G[key] = fn());
const shared = (g, m) => { const x = new THREE.Mesh(g, m); x.userData.sharedGeo = true; return x; };
const noRay = m => { m.raycast = () => {}; return m; };
const FUSE_TIP = [F2[0] - F0[0], F2[1] - F0[1], F2[2] - F0[2]];   // lattice, from the fuse root

// ---------- the prop object ----------
class Prop {
  constructor(o, kind, ball) {
    this.kind = kind; this.hang = !!o.hang; const m = this.hang ? -1 : 1;
    this.group = new THREE.Group(); this.pivot = new THREE.Group(); this.pivot.position.y = m * PIVOT_Y;
    const slot = !this.hang && !!o.slot;
    this.base = noRay(shared(geo('base' + this.hang + slot, () => baseGeo(this.hang, slot)), mat));
    this.arm = noRay(shared(geo('arm' + (ball ? 'B' : 'P') + this.hang, () => armGeo(ball, this.hang)), mat));
    this.group.add(this.base, this.pivot); this.pivot.add(this.arm);
    this.faceY = m * FACE_Y; this.fuseF = 1;
    if (o.size && o.size !== 1) this.group.scale.setScalar(o.size);
  }
  addFace(mesh) { mesh.position.y = this.faceY; this.pivot.add(mesh); return mesh; }
  // fuse + spark ride on the ball (children of the face: they follow its flips / wobbles and hide with it)
  addFuse(burn) {
    if (burn) { this.fuse = noRay(shared(geo('fuse', fuseGeo), mat)); this.fuse.position.set(F0[0] * SB, F0[1] * SB, F0[2] * SB); this.face.add(this.fuse); }
    this.spark = noRay(shared(geo('spark', sparkGeo), MAT.glow)); this.face.add(this.spark); this.setFuse(1);
  }
  register(t) {
    t.part(this.face, this.chips, CS); const a = t.parts[t.parts.length - 1];
    if (!this.face2) return [a];
    this.face2.userData.target = t;
    return [a, { mesh: this.face2, list: this.chips2, s: CS, ox: 0, oy: 0, oz: 0 }];
  }
  show() { this.face.visible = true; if (this.face2) this.face2.visible = false; if (this.spark) this.spark.visible = true; }
  hide() { this.face.visible = false; if (this.face2) this.face2.visible = false; }
  setFuse(f) {
    if (!this.spark) return; f = Math.max(0, Math.min(1, f)); this.fuseF = f;
    const k = this.fuse ? Math.max(0.08, f) : 1;
    if (this.fuse) this.fuse.scale.setScalar(k);
    this.spark.position.set((F0[0] + FUSE_TIP[0] * k) * SB, (F0[1] + FUSE_TIP[1] * k) * SB, (F0[2] + FUSE_TIP[2] * k) * SB);
  }
  sparkle(t, fast) {
    if (!this.spark) return;
    const f = ((t * (fast ? 26 : 14)) | 0) % 3;
    this.spark.visible = f !== 2; this.spark.scale.setScalar(f ? 1 : 1.5); this.spark.rotation.z = f * 0.785;
  }
  setFlip(f) {
    if (!this.face2) return false;
    const flipped = f >= 0.5;
    this.face.visible = !flipped; this.face2.visible = flipped;
    if (!flipped) { this.face.rotation.y = Math.PI * f; this.face.scale.x = Math.max(0.35, 1 - f); }
    else { this.face2.rotation.y = -Math.PI * (1 - f); this.face2.scale.x = Math.max(0.06, 2 * f - 1); }
    return flipped;
  }
  wobble(t) {
    this.face.rotation.z = 0.1 * Math.sin(t * 8.5) + 0.04 * Math.sin(t * 23);
    this.face.position.x = 0.02 * Math.sin(t * 11);
  }
}
function paddle(o = {}) {
  const c = SCHEMES[o.color] ? o.color : 'red', p = new Prop(o, 'target', false);
  p.face = p.addFace(shared(geo('paddle_' + c, () => paddleFaceGeo(SCHEMES[c])), mat));
  p.chips = geo('chipsP_' + c, () => paddleChips(SCHEMES[c]));
  return p;
}
function bomb(o = {}) {
  const p = new Prop(o, 'bomb', true), burn = !!o.burn;
  p.face = p.addFace(shared(geo('bomb' + (burn ? '' : 'F'), () => ballGeo(skullFace, !burn)), mat));
  p.chips = geo('chipsB', () => ballChips(skullFace));
  p.addFuse(burn);
  return p;
}
function decoy(o = {}) {
  const p = new Prop(o, 'bomb', true);
  p.face = p.addFace(shared(geo('decoyF', () => ballGeo(decoyFace, true)), mat));
  p.chips = geo('chipsD', () => ballChips(decoyFace));
  p.addFuse(false); p.decoy = true;
  return p;
}
function flipbomb(o = {}) {
  const p = bomb(Object.assign({}, o, { burn: true })), c = SCHEMES[o.color] ? o.color : 'red';
  p.face2 = p.addFace(shared(geo('paddle_' + c, () => paddleFaceGeo(SCHEMES[c])), mat)); p.face2.visible = false;
  p.chips2 = geo('chipsP_' + c, () => paddleChips(SCHEMES[c]));
  return p;
}
// build every shared geometry now (a first bomb mid-stage must not cost a frame)
function warm() { [paddle(), bomb(), decoy(), flipbomb()].forEach(() => {}); }
B.Props = { paddle, bomb, decoy, flipbomb, warm, mat, Geo, sdf, cspec, SCHEMES, FACE_Y, PIVOT_Y, PADDLE_R, BOMB_R, POST_Z, CHIP_S: CS };
})(window.BLAM);
