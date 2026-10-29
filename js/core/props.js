'use strict';
/* =========================================================================================
   B.L.A.M. core/props.js -- shared shooting-gallery props: bullseye paddles, cast-iron bombs,
   decoys (bombs painted like targets) and flip bombs. Every stage can use them.

   LOOK: voxels on the BLAM-34 palette, sampled from signed-distance shapes so they read ROUND
   (smooth per-voxel normals), lit by ONE shared toon material: three exact palette tones per
   colour (shadow / base / lit), a void outline (inverted hull whose width is constant in screen
   pixels, plus a rim test), NO plastic gloss band. Output alpha 1.0 = the "object" dither class.
   Each prop is 3-5 draw calls (static base, swinging arm, the face, optional fuse + spark);
   geometry is built ONCE per kind and shared by every instance.
   PAINTED WOOD (paddles, 2nd pass): the face's relief is baked into the voxel tones from a top-left
   light (lit bevel on the edges that face it, shadow bevel + cast shadow on the far side), the rim
   cells keep live toon light so the disc's thickness reads. Fine detail (wood grain, chipped paint,
   scuffs, the decoy's tells) is a 4th "accent" colour per voxel that only appears up close: each
   feature has a rank and a range, and the shader shows it once the view depth is inside that range
   (whole features fade in one by one, never per-pixel noise at the far lanes).
   IRON (bombs): shaded from the TRUE sphere normal (not the voxel one), so the terminator is a clean
   circle, the hard spot is one small round dot (>= ~1.5 game px at any distance) and a rim band of
   constant screen width (steel on the lit side, slate on the dark side) separates the ball from the
   dark room. The skull + crossbones is one big 9x11 icon on a 2-cell grid (fewer, bigger pixels).

   API  (BLAM.Props)
     paddle({ color:'red', size:1, hang:false, slot:false })   bullseye disc on a post (hang: ceiling hanger;
                                                    slot: a slim carriage that rides in a floor slot
                                                    instead of the wooden sled + base plate; any prop takes it)
     bomb({ size:1, hang:false, burn:false })       iron ball, skull + crossbones, cap, fuse, spark
                                                    (burn: the fuse is its own mesh so setFuse() can shorten it)
     decoy({ size:1, hang:false })                  a BOMB badly painted over to look like a target: the
                                                    paddle's own red / white / yellow, but sloppy rings,
                                                    brush gaps, drips and the skull ghosting through (the
                                                    tells show up close); round, cap + fuse + spark; call
                                                    wobble(t) every frame. kind 'bomb'
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
                            (iron: uSpotN.xy spot offset, uSpotPx / uRimPx sizes in game px)
     Props.cspec(spec)      'base' or 'base/shadow/lit/spot' palette names -> the toon colour record
     Props.CHIP_S           chip lattice size the chip lists use
     Props.FACE_Y, PIVOT_Y, PADDLE_R, BOMB_R, POST_Z   layout (world units)
     Props.SCHEMES          paddle paint schemes: red, blue, green, pink, amber
     Props.Geo, Props.sdf   the builder (SDF voxeliser + toon geometry) for new props in this style
   Hit feedback lives in core/targets.js: Target.shatter() honours a 5th chip element (size
   multiplier, rims fly as bigger pieces) and Targets.burst(p, scale) is the cartoon flower
   explosion for bombs.
   Budget: paddle face ~8.4k tris, ball ~14k (smooth round voxels + silhouette hull); arm/base ~0.2k each.
   Hit volumes: only colours / tones changed in the 2nd pass; every hittable shape (disc, ball + cap + fuse,
   battens) is the first pass's, so motions, hit windows and the timeline are untouched.
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
// per vertex: cBase / cLo (shadow) / cHi (lit) / cSp (iron: spot; else the accent colour) + aInfo (x: 1 iron, 2 paint on
// the ball (both shaded from the true sphere normal), y: hull, z: flat / baked tone, w: no rim outline) + aOff (hull: corner
// direction; any other vertex: the accent record [rank, range, mode]). The hull is pushed out by uOut screen pixels at any
// depth; hull fragments whose smooth normal faces the camera are discarded, so voxel stair-steps never streak the surface.
const VS = `
attribute vec3 cBase; attribute vec3 cLo; attribute vec3 cHi; attribute vec3 cSp; attribute vec4 aInfo; attribute vec3 aOff;
uniform float uOut;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP; varying vec3 vD; varying vec3 vSN; varying vec3 vC;
#include <fog_pars_vertex>
void main() {
  vB = cBase; vL = cLo; vH = cHi; vS = cSp; vI = aInfo; vD = aOff;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vC = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;             // the mesh origin = the ball's centre (view space)
  #ifdef USE_INSTANCING
  mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vC = (modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  if (aInfo.y > 0.5) mvPosition.xyz += mat3(modelViewMatrix) * aOff * (uOut * max(0.5, -mvPosition.z));
  vec3 nor = normal, sn = position;                                  // sn: the ball's true normal (ball meshes are centred)
  #ifdef USE_INSTANCING
  nor = mat3(instanceMatrix) * nor; sn = mat3(instanceMatrix) * sn;
  #endif
  vP = mvPosition.xyz; vN = normalize(normalMatrix * nor); vSN = normalMatrix * sn;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform vec3 uLight; uniform vec3 uSpotN; uniform float uTHi; uniform float uTLo; uniform float uRim;
uniform float uBallPx; uniform float uRimPx; uniform float uSpotPx; uniform vec3 uRimLit; uniform vec3 uRimDk;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP; varying vec3 vD; varying vec3 vSN; varying vec3 vC;
#include <fog_pars_fragment>
void main() {
  vec3 n = vI.x > 0.5 ? normalize(vSN) : normalize(vN);
  float d = dot(n, uLight), rv = dot(n, normalize(-vP)), depth = max(0.1, -vP.z);
  bool paint = vI.x > 1.5;                                           // paint on a ball: narrow lit + shadow sides (reads flatter)
  float t = d > (paint ? 0.9 : uTHi) ? 2.0 : (d > (paint ? 0.02 : uTLo) ? 1.0 : 0.0);
  vec3 c = t > 1.5 ? vH : (t > 0.5 ? vB : vL);
  if (vI.x > 0.5 && vI.x < 1.5) {                                    // cast iron: one small round spot (upper left, out by the rim,
                                                                     // clear of the skull; uSpotN.xy = its screen offset / radius)
                                                                     // + a constant-width rim band
    float rpx = uBallPx / max(0.1, -vC.z);                            // ball radius in game px
    float sp = max(uSpotPx / rpx, 0.075), s = 1.0 - clamp(uRimPx / rpx, 0.035, 0.45);
    vec3 w = normalize(-vC), u = normalize(cross(vec3(0.0, 1.0, 0.0), w)), v = cross(w, u);   // the ball as the camera sees it
    if (dot(n, w) > 0.0 && length(vec2(dot(n, u), dot(n, v)) - uSpotN.xy) < sp) c = vS;   // a round dot, even out by the limb
    else if (rv < sqrt(1.0 - s * s)) c = d > -0.05 ? uRimLit : uRimDk;
  }
  if (vI.z > 0.5) c = vB;                                            // flat / baked tone
  if (vD.y > 0.0 && vI.y < 0.5) {                                    // accent detail: only up close, whole features at a time
    float k = clamp((vD.y - depth) / (0.3 * vD.y), 0.0, 1.0);
    if (vD.x < k) c = vD.z > 0.5 ? (t > 0.5 ? vL : vS) : vS;          // mode 1: one shade darker (ghost), else the accent
  }
  if (vI.y > 0.5 && rv > 0.2) discard;                                // hull only at the silhouette and behind (no stair-step streaks)
  if ((rv < uRim && vI.w < 0.5) || vI.y > 0.5) c = vec3(0.0431, 0.0431, 0.1020);   // outline: rim + hull = void
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;
const L0 = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();
const mat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uLight: { value: L0 }, uSpotN: { value: new THREE.Vector3(-0.55, 0.65, 0) }, uTHi: { value: 0.8 }, uTLo: { value: 0.22 },
    uRim: { value: 0.1 }, uBallPx: { value: 0 }, uRimPx: { value: 1.35 }, uSpotPx: { value: 1.3 },
    uRimLit: { value: new THREE.Color(PAL.steel) }, uRimDk: { value: new THREE.Color(PAL.slate) }, uOut: { value: 0.0042 }
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
  // D (optional, not on hulls): accent record [rank 0..1, range (view depth where it is gone), mode 0 accent / 1 darker]
  face(x, y, z, hx, hy, hz, f, C, I, nrm, hull, D) {
    const F = FACES[f], q = F[3];
    let nx = F[0], ny = F[1], nz = F[2];
    if (nrm) { const k = hull ? 1 : this.k; nx = nx * (1 - k) + nrm[0] * k; ny = ny * (1 - k) + nrm[1] * k; nz = nz * (1 - k) + nrm[2] * k;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
    const c = hull ? HULL : C, inf = hull ? [0, 1, 0, 0] : I;
    for (let v = 0; v < 12; v += 3) {
      this.p.push(x + q[v] * hx, y + q[v + 1] * hy, z + q[v + 2] * hz); this.n.push(nx, ny, nz);
      this.cb.push(...c[0]); this.cl.push(...c[1]); this.ch.push(...c[2]); this.cs.push(...c[3]); this.inf.push(...inf);
      if (hull) this.off.push(q[v], q[v + 1], q[v + 2]); else if (D) this.off.push(D[0], D[1], D[2]); else this.off.push(0, 0, 0);
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
      const x = (v.i + 0.5 - cx) * s, y = (v.j + 0.5 - cy) * s, z = (v.k + 0.5 - cz) * s, C0 = cspec(v.col);
      // alt: accent colour (4th slot) shown up close; rank / range / mode: see the shader. ball: paint on a sphere
      const C = v.alt ? [C0[0], C0[1], C0[2], cspec(v.alt)[0]] : C0, D = v.alt ? [v.rank, v.range, v.mode || 0] : null;
      const I = [v.iron ? 1 : v.ball ? 2 : 0, 0, v.flat ? 1 : 0, v.nh ? 1 : 0];      // w: paint relief, no rim outline (tones only)
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        if (map.has(VK(v.i + F[0], v.j + F[1], v.k + F[2]))) continue;
        if (v.nh) {                                                   // paint relief: crisp flat paint, sides one shadow tone (emboss)
          const Cs = f === 4 ? C : [C[1], C[1], C[1], C[1]];
          this.face(x, y, z, h, h, h, f, Cs, [0, 0, 1, 1], null, false, f === 4 ? D : null); continue;
        }
        if (v.ff && f === 4) { const F0 = cspec(v.ff);                 // ff: baked front tone, the other faces stay live-lit
          this.face(x, y, z, h, h, h, f, v.alt ? [F0[0], F0[1], F0[2], C[3]] : F0, [I[0], 0, 1, I[3]], v.nrm, false, D);
        } else this.face(x, y, z, h, h, h, f, C, I, v.nrm, false, D);
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
// paint(x,y,z) -> 'colour' | { col, iron, flat, nh, ball, alt, rank, range, mode } | null.  Later calls overwrite earlier cells.
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
      map.set(VK(i, j, k), Object.assign({}, p, { i, j, k, nrm: [gx / gl, gy / gl, gz / gl] }));
    }
    return map;
  }
};

// ---------- layout (world units; matches the range's old paddles so motions and hit windows are unchanged) ----------
const PIVOT_Y = 0.13, FACE_Y = 1.4175, PADDLE_R = 0.51, BOMB_R = 0.49, POST_Z = -0.15;
const SP = 0.03, PR = PADDLE_R / SP;                  // paddle lattice (17 cells radius)
const SB = 0.033, BR = BOMB_R / SB;                   // bomb lattice (~14.85 cells radius)
mat.uniforms.uBallPx.value = BOMB_R * R.RH / 2 / R.TAN_H;   // ball radius in game px at view depth 1 (rim band, spot size)
const SCHEMES = {
  red:   { ring: 'red', light: 'bone', bull: 'yellow', lip: 'crimson', back: 'walnut' },
  blue:  { ring: 'blue', light: 'bone', bull: 'yellow', lip: 'deepblue', back: 'walnut' },
  green: { ring: 'green', light: 'bone', bull: 'yellow', lip: 'forest', back: 'walnut' },
  pink:  { ring: 'magenta', light: 'bone', bull: 'yellow', lip: 'plum', back: 'walnut' },
  amber: { ring: 'orange', light: 'bone', bull: 'lemon', lip: 'rust', back: 'walnut' }
};
const IRON = { col: 'midnight/void/navy/haze', iron: true };
// paint by radius (lattice units): bull, ring, light, ring, light, lip
const ringCol = (r, sc) => r < 4.6 ? sc.bull : r < 8.5 ? sc.ring : r < 10.9 ? sc.light : r < 14.5 ? sc.ring : r < 15.2 ? sc.light : sc.lip;

// ---------- wear + detail helpers ----------
function hash(a, b = 0, c = 0) {                      // stable integer hash -> [0, 1)
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const SHADE = p => (RAMP[p] || [p])[0], LIT = p => (RAMP[p] || [p, p])[1];
const tone = (p, t) => t === 0 ? SHADE(p) : t === 2 ? LIT(p) : p;
// accent ranges (view depth where a detail is fully gone; it is fully in at 70 % of it). Range stops: 7.3 (nearest
// scoot stop) .. 15.6 (far lane). Grain only reads at the near stops, chips a little further, nothing at the far lane.
const RG_GRAIN = 9.5, RG_SCUFF = 10.5, RG_CHIP = 12.5, RG_BEVEL = 14.5;
const LXY = [-0.56, 0.83];                            // the light projected on the face: top-left
// paint bands of a paddle face by radius (lattice units): [inner, outer, raised]; band 5 is the rim lip
const PAD_BANDS = [[0, 4.6, 1], [4.6, 8.5, 1], [8.5, 10.9, 0], [10.9, 14.5, 1], [14.5, 15.2, 0], [15.2, 99, 1]];
// paddle wear, lattice units: paint chips (bare wood) on the rim lip and the ring edges, a few light scuffs
const PAD_CHIPS = [], PAD_SCUFFS = [];
for (let n = 0; n < 5; n++) { const a = (n + hash(n, 1) * 0.6) * Math.PI * 2 / 5 + 0.4, r = 15.7 + hash(n, 2) * 0.8;
  PAD_CHIPS.push([Math.cos(a) * r, Math.sin(a) * r, 0.6 + hash(n, 3) * 0.45, hash(n, 4)]); }
[8.5, 14.5, 4.6].forEach((r, n) => { const a = hash(n, 5) * Math.PI * 2;
  PAD_CHIPS.push([Math.cos(a) * r, Math.sin(a) * r, 0.6 + hash(n, 6) * 0.3, hash(n, 7)]); });
for (let n = 0; n < 4; n++) { const a = hash(n, 8) * Math.PI * 2, r = 3 + hash(n, 9) * 10, d = -0.5 + (hash(n, 10) - 0.5) * 0.9, l = 1.0 + hash(n, 11);
  PAD_SCUFFS.push([Math.cos(a) * r, Math.sin(a) * r, Math.cos(d) * l, Math.sin(d) * l, hash(n, 12)]); }
const segD = (x, y, s) => { const px = x - s[0], py = y - s[1], h = Math.max(-1, Math.min(1, (px * s[2] + py * s[3]) / (s[2] * s[2] + s[3] * s[3])));
  return len2(px - s[2] * h, py - s[3] * h); };
// tone of one front cell: { t: baked tone (the lip: lit / shadow by its side), acc: [colour, rank, range] | null }
// accents: chips > bevel (a 1-cell lit / shadow arc on each raised edge + the cast shadow beside it) > scuffs > grain
function paddleCell(x, y, sc) {
  const r = len2(x, y), f = (x * LXY[0] + y * LXY[1]) / (r || 1), b = PAD_BANDS.findIndex(q => r < q[1]), [r0, r1, up] = PAD_BANDS[b];
  const p = ringCol(r, sc), side = f > 0.35 ? 1 : f < -0.35 ? -1 : 0;
  const o = { p, t: b === 5 ? 1 + side : 1, acc: null };
  for (const c of PAD_CHIPS) if (len2(x - c[0], y - c[1]) < c[2]) { o.acc = ['tan', 0.05 + 0.9 * c[3], RG_CHIP]; return o; }
  if (b === 5) return o;
  let bt = -1;
  if (up) { if (r1 - r < 1) bt = 1 + side; else if (b && r - r0 < 1) bt = 1 - side; }   // raised: lit edge toward the light
  else if ((r - r0 < 1 && side < 0) || (r1 - r < 1 && side > 0)) bt = 0;             // recessed: cast shadow of the ring beside it
  if (bt >= 0 && bt !== 1 && tone(p, bt) !== p) { o.acc = [tone(p, bt), 0.5, RG_BEVEL]; return o; }
  for (const s of PAD_SCUFFS) if (segD(x, y, s) < 0.5) { o.acc = [p === 'bone' ? 'mist' : LIT(p), 0.05 + 0.9 * s[4], RG_SCUFF]; return o; }
  if (p !== sc.bull) {                                          // wood grain under the paint: wavy vertical lines, in dashes
    const u = x + 1.5 * Math.sin(y * 0.17 + 0.6) + 0.7 * Math.sin(y * 0.41 + x * 0.12), ln = Math.floor(u / 6);
    if (u / 6 - ln < 0.17) { const seg = Math.floor((y + hash(ln, 3) * 17) / (4 + 5 * hash(ln, 5)));
      if (hash(ln, seg, 9) < 0.5) o.acc = [SHADE(p), 0.05 + 0.9 * hash(ln, seg, 11), RG_GRAIN]; }
  }
  return o;
}

// ---------- paddle face: a thick painted-wood disc, bevelled rim lip, raised ring paint, back battens ----------
function paddleFaceGeo(sc) {
  const shape = (x, y, z) => Math.min(
    sdf.ring(x, y, z, -PR, PR, -1.5, 1.5, 1.0),                                   // the wooden disc
    sdf.ring(x, y, z, -4.1, 4.1, 0, 2.6, 0.7),                                     // raised bull
    sdf.ring(x, y, z, 5.0, 8.0, 0, 2.6, 0.6), sdf.ring(x, y, z, 11.3, 14.1, 0, 2.6, 0.6),   // raised red rings
    sdf.ring(x, y, z, 15.2, PR, -1.9, 2.8, 0.8));                                  // bevelled rim lip
  const map = sdf.voxelise(new Map(), [-PR - 1, -PR - 1, -3, PR + 1, PR + 1, 4], shape, (x, y, z) => {
    const r = len2(x, y);
    if (z < -0.6) return r > 15.2 ? sc.lip : sc.back;
    return { col: ringCol(r, sc), nh: r < PR - 1 };          // the outermost cells keep their outline + live-lit sides
  });
  // bake the front: the top cell of every column gets its tone and accent (sides keep the paint / live light)
  const top = new Map(), CK = (i, j) => (i + 64) * 256 + (j + 64);
  for (const v of map.values()) { const c = CK(v.i, v.j), t = top.get(c); if (t === undefined || v.k > t) top.set(c, v.k); }
  for (const v of map.values()) {
    if (v.k !== top.get(CK(v.i, v.j)) || v.col === sc.back) continue;
    const o = paddleCell(v.i + 0.5, v.j + 0.5, sc), col = tone(o.p, o.t);
    if (v.nh) v.col = col; else v.ff = col;                    // ff: baked front face, live-lit sides (the disc's thickness)
    if (o.acc && o.acc[0] !== col) { v.alt = o.acc[0]; v.rank = o.acc[1]; v.range = o.acc[2]; }
  }
  const g = new Geo().voxels(map, SP);
  // back battens (painted wood) where the post bracket bites: each one is laid as grain strips (chestnut, a dark walnut
  // line, a pale tan line) filling exactly the old batten box (same hit volume); hull only on the strips' outer faces
  const STRIPS = [[-0.048, -0.03, 'chestnut'], [-0.03, -0.012, 'walnut'], [-0.012, 0.018, 'chestnut'], [0.018, 0.03, 'tan'], [0.03, 0.048, 'chestnut']];
  STRIPS.forEach(([a, b, col], n) => {
    const first = n === 0, last = n === STRIPS.length - 1;             // face bits: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
    g.bx(-0.39, a, -0.105, 0.39, b, -0.045, col, 0b110011 | (first ? 0b1000 : 0) | (last ? 0b100 : 0));   // horizontal batten
    g.bx(a, -0.39, -0.105, b, 0.39, -0.045, col, 0b111100 | (first ? 0b10 : 0) | (last ? 0b1 : 0));       // vertical batten
  });
  return g.geometry();
}
// ---------- bomb: a round cast-iron ball, steel cap at the top-right, fuse, ONE big skull + crossbones ----------
// (cap + fuse are part of the ball mesh, i.e. of its hit volume: their shapes are unchanged from the first pass)
const CAP_D = (() => { const v = [0.5, 0.82, 0.3], l = len3(...v); return v.map(a => a / l); })();
const CAP_C = CAP_D.map(a => a * (BR - 0.2));
const F0 = CAP_D.map(a => a * (BR + 1.2)), F1 = [F0[0] + 0.4, F0[1] + 3.2, F0[2] + 0.3], F2 = [F1[0] + 2.8, F1[1] + 1.6, F1[2] + 0.3];
// 9 x 11 icon on a 2-cell grid (each icon pixel = 2 x 2 voxels): about one game px per icon pixel from the back lanes
const SKULL = [
  '..XXXXX..',
  '.XXXXXXX.',
  '.XooXooX.',
  '.XooXooX.',
  '..XXoXX..',
  '..XXXXX..',
  'XX.....XX',
  '..XX.XX..',
  '...XXX...',
  '..XX.XX..',
  'XX.....XX'];
const SK_TOP = 11;                                     // lattice y of the icon's top edge (the cap sits above-right of it)
function skullAt(x, y) {                               // -> 'X' bone, 'o' socket, null (front projection, lattice units)
  const c = Math.floor((x + 9) / 2), r = Math.floor((SK_TOP - y) / 2);
  if (r < 0 || r >= SKULL.length || c < 0 || c >= 9) return null;
  const ch = SKULL[r][c]; return ch === '.' ? null : ch;
}
const capShape = (x, y, z) => Math.min(sdf.cyl(x, y, z, CAP_C, CAP_D, 1.9, 3.1), sdf.cyl(x, y, z, CAP_C.map((a, i) => a - CAP_D[i] * 0.9), CAP_D, 0.55, 3.9));
const fuseShape = (x, y, z) => Math.min(sdf.capsule(x, y, z, F0, F1, 1.0), sdf.capsule(x, y, z, F1, F2, 1.0));
function capPaint(x, y, z) {
  const px = x - CAP_C[0], py = y - CAP_C[1], pz = z - CAP_C[2], h = px * CAP_D[0] + py * CAP_D[1] + pz * CAP_D[2];
  const rr = len3(px - CAP_D[0] * h, py - CAP_D[1] * h, pz - CAP_D[2] * h);
  return h > 1.0 && rr < 1.4 ? 'void' : h > 1.0 ? 'slate' : 'steel';
}
const fusePaint = (x, y, z) => len3(x - F2[0], y - F2[1], z - F2[2]) < 1.3 ? 'rust' : (Math.floor((x + y + z) * 0.8) & 1) ? 'sand' : 'tan';
// paint(x,y,z) -> the ball's paint record (null = plain iron)
const skullPaint = (x, y, z) => { if (z < 2) return null; const s = skullAt(x, y);
  return s === 'X' ? { col: 'bone/mist/bone', ball: true } : s === 'o' ? { col: 'void', flat: true } : null; };
function ballGeo(paint, withFuse) {
  const ball = (x, y, z) => sdf.sphere(x, y, z, 0, 0, 0, BR), B0 = Math.ceil(BR) + 1;
  const map = sdf.voxelise(new Map(), [-B0, -B0, -B0, B0, B0, B0], ball, (x, y, z) => paint(x, y, z) || IRON);
  sdf.voxelise(map, [-B0, 6, -6, B0, B0 + 5, B0], capShape, capPaint);
  if (withFuse) sdf.voxelise(map, [0, 10, -2, B0 + 6, B0 + 10, B0 + 4], fuseShape, fusePaint);
  return new Geo(1).voxels(map, SB).geometry();     // no back cull on a ball: turned 90 deg its back cap is on the silhouette
}
function fuseGeo() {                                   // origin at the fuse root (F0) so scaling it burns it down
  const map = sdf.voxelise(new Map(), [0, 10, -2, BR + 8, BR + 12, BR + 4], (x, y, z) => Math.max(fuseShape(x, y, z), -capShape(x, y, z)), fusePaint);
  return new Geo(1).voxels(map, SB, F0[0], F0[1], F0[2], true).geometry();
}

// ---------- decoy: a bomb badly painted over to look like the red paddle ----------
// The paddle's own red / white / yellow (+ crimson lip), but a sloppy job: wobbly, off-centre ring edges (uneven widths),
// brush gaps down to the iron, drips, and the skull ghosting through the paint. The tells (ghost, gaps, drips) are
// accents that come in up close; from the back lanes it is a round red-and-white target with a fuse (and a wobble).
const DK = SCHEMES.red;
const DEDGE = [[3.9, 0.4, 1.3], [7.3, 0.6, 2.9], [9.8, 0.5, 4.1], [12.3, 0.55, 0.6], [13.3, 0.35, 5.3]];   // r, wobble, phase
const DCOL = [DK.bull, DK.ring, DK.light, DK.ring, DK.light, DK.lip];
const DGHOST = { bone: 'haze', red: 'oxblood' };   // the darkest ghost tone per paint (never the bull or the lip)
function decoyRing(x, y) {                              // base paint by the wobbly ring edges (paint centre a little off)
  const px = x - 0.5, py = y + 0.35, r = len2(px, py), a = Math.atan2(py, px);
  for (let e = 0; e < DEDGE.length; e++) { const [r0, w, ph] = DEDGE[e];
    if (r < r0 + w * Math.sin(a * 2 + ph) + w * 0.6 * Math.sin(a * 5 + ph * 2.3)) return DCOL[e]; }
  return DCOL[5];
}
// brush gaps [x, y, dx, dy] (short strokes along the ring, showing the iron) and drips [x, yTop, yEnd, colour]
const DGAPS = [[-6.3, 5.6, 1.1, 1.0], [8.4, -3.0, 0.4, 1.2], [-11.4, -4.2, 0.6, -1.3], [3.2, 12.5, 1.3, -0.3], [-1.5, -8.6, 1.2, 0.2]];
const DDRIPS = [[-2.5, -6.8, -9.0, 'red'], [4.5, -11.0, -13.2, 'red'], [-6.5, -7.0, -9.6, 'bone'], [8.5, -9.6, -12.0, 'bone']];
function decoyPaint(x, y, z) {
  if (z < -1) return null;                              // painted all over the front, out past the silhouette
  const col = decoyRing(x, y), o = { col, ball: true };
  const acc = (alt, rank, range, mode) => Object.assign(o, { alt, rank, range, mode });
  for (let n = 0; n < DDRIPS.length; n++) { const d = DDRIPS[n], dx = Math.abs(x - d[0]);
    if ((dx < 0.5 && y < d[1] && y > d[2]) || (dx < 1 && y <= d[2] + 0.5 && y > d[2] - 1.5)) return d[3] === col ? o : acc(d[3], 0.1 + 0.2 * n, 13, 0); }
  for (let n = 0; n < DGAPS.length; n++) { const g = DGAPS[n]; if (segD(x, y, g) < 0.55) return acc('midnight', 0.15 + 0.15 * n, 12, 0); }
  const s = skullAt(x, y);                              // the skull underneath, ghosting through at low contrast
  if (s === 'X' && DGHOST[col]) return acc(DGHOST[col], 0.3, 12, 1);     // one shade darker: white -> mist, red -> crimson
  if (s === 'o' && DGHOST[col]) return acc(DGHOST[col], 0.3, 12, 0);     // sockets: haze / oxblood
  return o;
}
function sparkGeo() {                                  // unlit twinkle star (MAT.glow): big enough to read from the back lanes
  const v = new R.Vox();
  v.bx(-0.048, -0.048, -0.048, 0.048, 0.048, 0.048, PAL.lemon);
  v.bx(-0.018, -0.15, -0.018, 0.018, 0.15, 0.018, PAL.yellow); v.bx(-0.15, -0.018, -0.018, 0.15, 0.018, 0.018, PAL.yellow);
  for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) v.bx(a * 0.068 - 0.022, b * 0.068 - 0.022, -0.022, a * 0.068 + 0.022, b * 0.068 + 0.022, 0.022, PAL.orange);
  v.bx(-0.02, -0.02, 0.048, 0.02, 0.02, 0.066, PAL.bone);
  return v.geo();
}
// ---------- post + bracket (pivot space) and base plate / ceiling hanger (group space) ----------
// a touch of wear: grime at the foot of the post, bright scratches, worn edges on the plates (thin skins, no hull)
function armGeo(ball, hang) {
  const g = new Geo(), Z = POST_Z, m = hang ? -1 : 1;
  const b = (x0, y0, z0, x1, y1, z1, col, hull = true) => g.bx(x0, Math.min(m * y0, m * y1), z0, x1, Math.max(m * y0, m * y1), z1, col, hull);
  b(-0.045, 0, Z - 0.045, 0.045, FACE_Y - 0.08, Z + 0.045, 'steel');            // the post
  b(-0.047, 0.1, Z - 0.047, 0.047, 0.24, Z + 0.047, 'slate', false);             // grime at its foot
  b(-0.047, 0.24, Z - 0.047, -0.02, 0.33, Z + 0.047, 'slate', false);
  b(-0.03, 0.62, Z + 0.045, -0.005, 0.7, Z + 0.048, 'haze', false);               // scratches
  b(0.008, 0.94, Z + 0.045, 0.032, 0.99, Z + 0.048, 'haze', false);
  b(-0.047, FACE_Y - 0.36, Z - 0.047, 0.047, FACE_Y - 0.3, Z + 0.047, 'slate', false);   // a dark band under the head
  b(-0.07, 0, Z - 0.07, 0.07, 0.1, Z + 0.07, 'slate');                           // collar over the hinge
  b(-0.072, 0.08, Z + 0.06, 0.072, 0.1, Z + 0.072, 'steel', false);              // worn top edge of the collar
  b(-0.13, -0.045, Z - 0.05, 0.13, 0.045, Z + 0.05, 'slate');                    // hinge knuckle
  if (ball) {                                                                    // cup the ball sits in
    b(-0.1, FACE_Y - 0.52, Z - 0.1, 0.1, FACE_Y - 0.43, Z + 0.1, 'slate');
    b(-0.102, FACE_Y - 0.45, Z + 0.09, 0.102, FACE_Y - 0.43, Z + 0.102, 'steel', false);
    b(-0.065, FACE_Y - 0.43, Z - 0.065, 0.065, FACE_Y - 0.36, Z + 0.065, 'steel');
  } else {                                                                       // clamp bracket on the back battens
    b(-0.1, FACE_Y - 0.19, -0.2, 0.1, FACE_Y + 0.08, -0.105, 'steel');
    b(-0.102, FACE_Y - 0.19, -0.202, 0.102, FACE_Y - 0.15, -0.103, 'slate', false);
    b(-0.07, FACE_Y - 0.15, -0.22, -0.03, FACE_Y - 0.11, -0.2, 'haze'); b(0.03, FACE_Y - 0.15, -0.22, 0.07, FACE_Y - 0.11, -0.2, 'haze');
  }
  return g.geometry();
}
function baseGeo(hang, slot) {
  const g = new Geo(), Z = POST_Z;
  if (slot) {                                                                    // slim carriage riding in a floor slot / hatch
    g.bx(-0.06, -0.35, Z - 0.08, 0.06, 0.09, Z + 0.08, 'slate');
    g.bx(-0.062, 0.06, Z + 0.07, 0.062, 0.09, Z + 0.082, 'steel', false);       // worn top edge
    for (const sx of [-1, 1]) g.bx(sx * 0.105 - 0.025, 0.04, Z - 0.055, sx * 0.105 + 0.025, 0.19, Z + 0.055, 'steel');
    g.bx(-0.1, -0.02, Z - 0.1, 0.1, 0.03, Z + 0.1, 'navy');
  } else if (!hang) {
    g.bx(-0.3, 0, Z - 0.2, 0.3, 0.07, Z + 0.2, 'chestnut');                     // wooden sled
    g.bx(-0.3, 0.0, Z + 0.2, 0.3, 0.022, Z + 0.203, 'walnut', false);           // its grain / scuffed foot
    g.bx(-0.16, 0.038, Z + 0.2, 0.22, 0.05, Z + 0.203, 'walnut', false);
    g.bx(-0.3, 0.058, Z + 0.2, 0.3, 0.07, Z + 0.203, 'tan', false);             // worn top edge
    g.bx(-0.27, 0.07, Z - 0.17, 0.27, 0.09, Z + 0.17, 'slate');                  // steel base plate
    g.bx(-0.272, 0.075, Z + 0.17, 0.08, 0.09, Z + 0.173, 'steel', false);       // worn front edge
    g.bx(0.06, 0.09, Z + 0.02, 0.2, 0.092, Z + 0.15, 'navy', false);            // grime patch
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.bx(sx * 0.21 - 0.022, 0.09, Z + sz * 0.11 - 0.022, sx * 0.21 + 0.022, 0.11, Z + sz * 0.11 + 0.022, 'haze', false);
    for (const sx of [-1, 1]) g.bx(sx * 0.125 - 0.025, 0.09, Z - 0.06, sx * 0.125 + 0.025, 0.19, Z + 0.06, 'steel');   // hinge cheeks
  } else {
    g.bx(-0.035, 0, Z - 0.035, 0.035, 0.95, Z + 0.035, 'steel');                 // hanger rod up into the ceiling rail
    g.bx(-0.037, 0.0, Z - 0.037, 0.037, 0.12, Z + 0.037, 'slate', false);       // grime at its foot
    g.bx(-0.15, 0.86, Z - 0.1, 0.15, 0.98, Z + 0.1, 'slate');                    // trolley
    for (const sx of [-1, 1]) g.bx(sx * 0.1 - 0.035, 0.95, Z - 0.06, sx * 0.1 + 0.035, 1.04, Z + 0.06, 'haze');
    g.bx(-0.2, -0.07, Z - 0.12, 0.2, 0, Z + 0.12, 'chestnut');                   // hanger block
    g.bx(-0.2, -0.07, Z + 0.12, 0.2, -0.058, Z + 0.123, 'tan', false);           // worn lower edge
    g.bx(-0.12, -0.04, Z + 0.12, 0.15, -0.03, Z + 0.123, 'walnut', false);      // grain
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
    const x = i * CS / SB, y = j * CS / SB, z = k * CS / SB, p = face(x, y, z);
    L.push([i, j, k, hexOf(p || IR[(i * 3 + j * 5 + k * 7 + 50) % 5]), p ? 1 : 1.25]);
  }
  L.push([2, 6, 1, PAL.steel, 1.6], [3, 6, 1, PAL.slate, 1.3]);   // the cap
  return L;
}
const skullChip = (x, y, z) => z > 2 && ({ X: 'bone', o: 'void' })[skullAt(x, y)];
const decoyChip = (x, y, z) => z > -1 && decoyRing(x, y);

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
    const f = ((t * (fast ? 26 : 14)) | 0) % 3;          // never blinks out: the spark is a bomb's tell from the back lanes
    this.spark.visible = true; this.spark.scale.setScalar(f === 0 ? 1.4 : f === 1 ? 1 : 0.75); this.spark.rotation.z = f * 0.785;
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
  p.face = p.addFace(shared(geo('bomb' + (burn ? '' : 'F'), () => ballGeo(skullPaint, !burn)), mat));
  p.chips = geo('chipsB', () => ballChips(skullChip));
  p.addFuse(burn);
  return p;
}
function decoy(o = {}) {
  const p = new Prop(o, 'bomb', true);
  p.face = p.addFace(shared(geo('decoyF', () => ballGeo(decoyPaint, true)), mat));
  p.chips = geo('chipsD', () => ballChips(decoyChip));
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
