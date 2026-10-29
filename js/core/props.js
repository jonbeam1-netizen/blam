'use strict';
/* =========================================================================================
   B.L.A.M. core/props.js -- shared shooting-gallery props: hex target plates, cast-iron bombs,
   decoys (bombs sloppily painted to pass for a plate) and flip bombs. Every stage can use them.

   LOOK (3rd pass): hard, crisp toy hardware, lit by ONE shared toon material: exact palette tones,
   one hard lit side + one shadow side, and a void outline whose width is constant in screen pixels.
   TARGET PLATE: a flat-top HEXAGONAL tin plate (apothem 0.53: it contains the old 0.51 disc, so the hit
     volume only grew), painted flat LIME (no other prop or wall in the range uses lime: it owns "shoot me")
     with two black rings and a yellow bull's-eye. Straight-cut steel edge, a thin 45 deg chamfer that is the only
     bevel (lemon where it faces the light, green where it faces away), slate back with ONE plain brace,
     clamped to a clean steel post. Flat polygons, no voxel noise, no grain: ~0.5k tris (old disc 8.4k).
   IRON (bombs): shaded from the TRUE sphere normal with a level-of-detail handoff on the ball's view depth
     (uLod.xy, between the 9.4 and 11.45 range stops, so a stationary bomb never sits mid-blend):
       near = the 1st pass character: broad steel highlight + navy band, slate rim on the shadow side, and the
              cartoon skull (round cranium, eye sockets, nose, teeth, knobbed crossbones) on a 1-cell grid;
       far  = the 2nd pass clarity: one small hard spot, a constant-width rim band, ONE big 9x11 skull on a
              2-cell grid.
     Every ball cell carries a far + a near material and a rank (4x4 ordered): while a ball scoots through the
     band the cells switch rank by rank (a quick ordered dissolve) and the tones / rim / spot interpolate.
   DECOY: the same bomb (iron, skull, cap, fuse, spark plain to see) with THIN sloppy strokes in the plate's
     paint (the black rings come free on black iron): a wobbly lime hexagon, a lime ring, a little yellow circle for
     the bull, gaps, two drips. A stroke never gets thinner than uLod.w game px, so at the far lane they thicken into
     a lime-ringed, yellow-dotted target-ish thing; up close it is plainly a bomb someone scribbled on.

   API  (BLAM.Props)
     paddle({ color:'lime', size:1, hang:false, slot:false })   hex target plate on a post (hang: ceiling hanger;
                                                    slot: a slim carriage that rides in a floor slot
                                                    instead of the wooden sled + base plate; any prop takes it)
     bomb({ size:1, hang:false, burn:false })       iron ball, skull + crossbones, cap, fuse, spark
                                                    (burn: the fuse is its own mesh so setFuse() can shorten it)
     decoy({ size:1, hang:false })                  a BOMB with the plate's colours brushed on in thin sloppy
                                                    strokes; call wobble(t) every frame. kind 'bomb'
     flipbomb({ size:1, hang:false, color:'lime' }) a burning bomb that flips into a target plate
     -> prop {
       kind        'target' | 'bomb' (flipbomb: 'bomb'; the stage switches kind when it flips)
       group       THREE.Group: origin on the floor under the post (hang: at the ceiling rail clamp,
                   everything hangs DOWN from it). Position / scale it. Static base is in here.
       pivot       Group at the hinge (y = +PIVOT_Y, hang: -PIVOT_Y). Rotate it to swing / drop / fold.
       base, arm   meshes (not hittable): base plate or hanger, and the post + bracket on the pivot
       face        the hittable mesh (plate / ball), centre at pivot-space y = +-FACE_Y
       face2       flipbomb only: the plate it flips to (hidden until it flips)
       spark, fuse bombs: glow spark mesh, fuse mesh (burn / flipbomb only)
       register(target) -> [part, part2?]   calls target.part(face, chips...) (and returns the
                   flipbomb's second part record so a stage can swap target.parts[0])
       show() / hide()   face + fuse + spark on / off (hide on shatter: the arm stays to fold away)
       setFuse(f)  f = 1 full .. 0 burnt (spark rides the fuse; burn / flipbomb shorten it)
       sparkle(t, fast)  flicker the spark (call each frame while it is a live bomb)
       setFlip(f)  flipbomb: f 0 = bomb .. 1 = plate, 0.5 = edge-on; returns true once flipped
       wobble(t)   decoy tell: a nervous wobble of the face (pure function of t)
       chips       the shatter list [[i, j, k, colourHex, sizeMul]...] used by register()
     }
     Props.warm()           build every shared geometry now (call at stage load, not mid-play)
     Props.mat              the shared toon ShaderMaterial (uOut = outline width: world units per unit of view
                            depth, 0.0042 ~ 1 game px; uLight = view-space light, top-left like the duck;
                            iron: uSpotN.xy spot offset, uSpotPx / uRimPx sizes in game px; uLod: see LOOK)
     Props.cspec(spec)      'base' or 'base/shadow/lit/spot' palette names -> the toon colour record
     Props.CHIP_S           chip lattice size the chip lists use
     Props.FACE_Y, PIVOT_Y, PADDLE_R, PLATE_A, BOMB_R, POST_Z   layout (world units; PADDLE_R = the old disc radius,
                            PLATE_A = the plate's apothem)
     Props.SCHEMES          plate paint schemes { face, rings: [[outer radius, colour]...] from the bull out, edge, back }:
                            lime (the range's target), cyan, amber, magenta
     Props.Geo, Props.sdf   the builders (voxel SDF sampler, flat polygons + outline hull) for new props in this style
   Hit feedback lives in core/targets.js: Target.shatter() honours a 5th chip element (size
   multiplier, rims fly as bigger pieces) and Targets.burst(p, scale) is the cartoon flower
   explosion for bombs.
   Budget: plate face ~0.5k tris, ball ~14k (round voxels + silhouette hull); arm / base ~0.1-0.2k each.
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
const glc = n => 'vec3(' + rgb(PAL[n]).map(v => v.toFixed(4)).join(', ') + ')';   // a palette colour as a GLSL constant

// ---------- the toon material (shared by every prop) ----------
// per vertex: cBase / cLo (shadow) / cHi (lit) / cSp (accent colour) + aInfo (x: 1 iron, 2 paint on the ball (both shaded
// from the true sphere normal), y: hull, z: flat / baked tone, w: no rim outline) + aOff (hull: offset direction; any other
// vertex: the accent record [rank, range, mode]) + aLod (ball cells: [far material, near material, rank, stroke]; materials
// 1 iron, 2 bone paint, 3 socket; stroke = colour id * 64 + distance to the stroke's centre line in cells, scaled by the
// local brush width). The hull is pushed out by uOut screen pixels at any depth; hull fragments whose normal faces the
// camera are discarded, so voxel stair-steps never streak the surface.
const VS = `
attribute vec3 cBase; attribute vec3 cLo; attribute vec3 cHi; attribute vec3 cSp; attribute vec4 aInfo; attribute vec3 aOff; attribute vec4 aLod;
uniform float uOut;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP; varying vec3 vD; varying vec3 vSN; varying vec3 vC; varying vec4 vLd;
#include <fog_pars_vertex>
void main() {
  vB = cBase; vL = cLo; vH = cHi; vS = cSp; vI = aInfo; vD = aOff; vLd = aLod;
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
const STROKE_HW = '0.55';                                            // a decoy brush stroke's half width up close (cells)
const FS = `
uniform vec3 uLight; uniform vec3 uSpotN; uniform float uTHi; uniform float uTLo; uniform float uRim; uniform vec4 uLod;
uniform float uBallPx; uniform float uRimPx; uniform float uSpotPx; uniform vec3 uRimLit; uniform vec3 uRimDk;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying vec3 vS; varying vec4 vI; varying vec3 vN; varying vec3 vP; varying vec3 vD; varying vec3 vSN; varying vec3 vC; varying vec4 vLd;
#include <fog_pars_fragment>
void main() {
  vec3 n = vI.x > 0.5 ? normalize(vSN) : normalize(vN);
  float d = dot(n, uLight), rv = dot(n, normalize(-vP)), depth = max(0.1, -vP.z);
  float dc = max(0.1, -vC.z), lk = smoothstep(uLod.x, uLod.y, dc);  // ball LOD: 0 near (1st pass look) .. 1 far (2nd pass)
  float kind = vI.x, flt = vI.z;
  vec3 cb = vB, cl = vL, ch = vH, c;
  if (vLd.x + vLd.y > 0.5) {                                         // a ball cell: near / far material, a stroke on top
    float m = vLd.z >= lk ? vLd.y : vLd.x;
    if (vLd.w > 0.5) { float sc = floor(vLd.w / 64.0);
      if (vLd.w - sc * 64.0 < max(${STROKE_HW}, uLod.w * dc / uLod.z)) m = 3.0 + sc; }   // never thinner than uLod.w px
    kind = m < 1.5 ? 1.0 : 2.0; flt = (m > 2.5 && m < 3.5) ? 1.0 : 0.0;
    if (m > 3.5 && m < 4.5) { cb = ${glc('lime')}; cl = ${glc('green')}; ch = ${glc('lemon')}; }
    else if (m > 2.5 && m < 3.5) cb = ${glc('void')};
    else if (m > 4.5) { cb = ${glc('yellow')}; cl = ${glc('amber')}; ch = ${glc('lemon')}; }
    else { cb = ${glc('bone')}; cl = ${glc('mist')}; ch = ${glc('bone')}; }
  }
  float t = 1.0;
  if (kind > 0.5 && kind < 1.5) {                                    // cast iron, true sphere normal
    float rpx = uBallPx / dc;                                        // ball radius in game px
    c = d > mix(0.70, 9.0, lk) ? ${glc('steel')} : d > mix(0.47, uTHi, lk) ? ${glc('navy')} : d > mix(-0.02, uTLo, lk) ? ${glc('midnight')} : ${glc('void')};
    vec3 w = normalize(-vC), u = normalize(cross(vec3(0.0, 1.0, 0.0), w)), v = cross(w, u);   // the ball as the camera sees it
    float sFar = 1.0 - clamp(uRimPx / rpx, 0.035, 0.45), sp = lk * max(uSpotPx / rpx, 0.075);
    bool dk = d < mix(0.25, -0.05, lk);                              // near: a wide slate rim on the shadow side only
    float s = dk ? mix(0.905, sFar, lk) : mix(1.0, sFar, lk);        // far: a constant-width band all round
    if (dot(n, w) > 0.0 && length(vec2(dot(n, u), dot(n, v)) - uSpotN.xy) < sp) c = ${glc('haze')};   // far: one round hard spot
    else if (rv < sqrt(1.0 - s * s)) c = dk ? uRimDk : uRimLit;
  } else {
    bool paint = kind > 1.5;                                         // paint on a ball: narrow lit side, shadow side by LOD
    t = d > (paint ? 0.9 : uTHi) ? 2.0 : (d > (paint ? mix(0.25, 0.02, lk) : uTLo) ? 1.0 : 0.0);
    c = t > 1.5 ? ch : (t > 0.5 ? cb : cl);
  }
  if (flt > 0.5) c = cb;                                             // flat / baked tone
  if (vD.y > 0.0 && vI.y < 0.5) {                                    // accent detail by view depth, whole features at a time
    float k = clamp((vD.y - depth) / (0.3 * vD.y), 0.0, 1.0);
    if (vD.z > 1.5) { if (vD.x >= k) c = vB; }                       // mode 2: live tones up close, the flat base far away
    else if (vD.x < k) c = vD.z > 0.5 ? (t > 0.5 ? vL : vS) : vS;    // mode 1: one shade darker, mode 0: the accent
  }
  if (vI.y > 0.5 && rv > 0.2) discard;                               // hull only at the silhouette and behind
  if ((rv < uRim && vI.w < 0.5) || vI.y > 0.5) c = ${glc('void')};    // outline: rim + hull = void
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;
const L0 = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();
const mat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uLight: { value: L0 }, uSpotN: { value: new THREE.Vector3(-0.55, 0.65, 0) }, uTHi: { value: 0.8 }, uTLo: { value: 0.22 },
    uRim: { value: 0.1 }, uBallPx: { value: 0 }, uRimPx: { value: 1.35 }, uSpotPx: { value: 1.3 },
    uRimLit: { value: new THREE.Color(PAL.steel) }, uRimDk: { value: new THREE.Color(PAL.slate) }, uOut: { value: 0.0042 },
    uLod: { value: new THREE.Vector4(9.9, 11.0, 1, 0.8) }             // z (game px per ball cell at depth 1) is set below
  }]),
  vertexShader: VS, fragmentShader: FS, fog: true
});

// ---------- geometry: voxel faces / flat polygons + a screen-constant inverted hull (the outline) ----------
const FACES = [
  [1, 0, 0, [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1]], [-1, 0, 0, [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1]],
  [0, 1, 0, [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1]], [0, -1, 0, [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1]],
  [0, 0, 1, [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]], [0, 0, -1, [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1]]];
const VK = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
const HULL = cspec('void'), NOI = [0, 0, 0, 0], HULLI = [0, 1, 0, 0], Z3 = [0, 0, 0], NOL = [0, 0, 0, 0];
const hullZ = v => !v.nrm || Math.abs(v.nrm[2]) < 0.8;   // hull only the silhouette band (faces looking along +-z never outline)
class Geo {
  constructor(smooth = 0.75) { this.p = []; this.n = []; this.cb = []; this.cl = []; this.ch = []; this.cs = []; this.inf = []; this.off = []; this.ld = []; this.idx = []; this.vc = 0; this.k = smooth; }
  // one face f of an axis box centred (x,y,z) with half sizes (hx,hy,hz); C = cspec; I = aInfo; nrm = smooth normal; hull = void copy
  // D (optional, not on hulls): accent record [rank 0..1, range (view depth where it is gone), mode]; L: aLod record (ball cells)
  face(x, y, z, hx, hy, hz, f, C, I, nrm, hull, D, L) {
    const F = FACES[f], q = F[3];
    let nx = F[0], ny = F[1], nz = F[2];
    if (nrm) { const k = hull ? 1 : this.k; nx = nx * (1 - k) + nrm[0] * k; ny = ny * (1 - k) + nrm[1] * k; nz = nz * (1 - k) + nrm[2] * k;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
    const c = hull ? HULL : C, inf = hull ? HULLI : I, ld = hull || !L ? NOL : L;
    for (let v = 0; v < 12; v += 3) {
      this.p.push(x + q[v] * hx, y + q[v + 1] * hy, z + q[v + 2] * hz); this.n.push(nx, ny, nz);
      this.cb.push(...c[0]); this.cl.push(...c[1]); this.ch.push(...c[2]); this.cs.push(...c[3]); this.inf.push(...inf); this.ld.push(...ld);
      if (hull) this.off.push(q[v], q[v + 1], q[v + 2]); else if (D) this.off.push(D[0], D[1], D[2]); else this.off.push(0, 0, 0);
    }
    const b = this.vc; this.vc += 4;
    if (hull) this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2); else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // axis box in world units with flat normals (posts, plates, bolts). hull: true | false | mask of faces (bit f = face f)
  bx(x0, y0, z0, x1, y1, z1, col, hull = true, info = NOI) {
    const C = cspec(col), x = (x0 + x1) / 2, y = (y0 + y1) / 2, z = (z0 + z1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
    for (let f = 0; f < 6; f++) {
      this.face(x, y, z, hx, hy, hz, f, C, info, null, false);
      if (hull === true || (typeof hull === 'number' && (hull >> f) & 1)) this.face(x, y, z, hx, hy, hz, f, C, info, null, true);
    }
    return this;
  }
  // one vertex at any position / normal -> its index
  vert(p, n, C, I, off, L) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]);
    this.cb.push(...C[0]); this.cl.push(...C[1]); this.ch.push(...C[2]); this.cs.push(...C[3]);
    this.inf.push(...I); this.off.push(off[0], off[1], off[2]); this.ld.push(...(L || NOL));
    return this.vc++;
  }
  // a flat convex polygon (a fan), points counter-clockwise seen from the side its normal n points to
  poly(pts, n, col, I = NOI, D = Z3) {
    const C = typeof col === 'string' ? cspec(col) : col, b = this.vc;
    for (const p of pts) this.vert(p, n, C, I, D);
    for (let k = 1; k < pts.length - 1; k++) this.idx.push(b, b + k, b + k + 1);
    return this;
  }
  // outline hull copy of a polygon: vertex k is pushed out along offs[k] by uOut screen px; reversed winding, so only
  // its inside shows (behind the object, just past the silhouette); n = the polygon's outward normal (discard test)
  hullPoly(pts, offs, n) {
    const b = this.vc;
    pts.forEach((p, k) => this.vert(p, n, HULL, HULLI, offs[k]));
    for (let k = 1; k < pts.length - 1; k++) this.idx.push(b, b + k + 1, b + k);
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
      const I = [v.iron ? 1 : v.ball ? 2 : 0, 0, v.flat ? 1 : 0, v.nh ? 1 : 0];      // w: no rim outline (tones only)
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        if (map.has(VK(v.i + F[0], v.j + F[1], v.k + F[2]))) continue;
        this.face(x, y, z, h, h, h, f, C, I, v.nrm, false, D, v.lod);
        if ((hullFront || f !== 4) && hullZ(v)) this.face(x, y, z, h, h, h, f, C, I, v.nrm, true);
      }
    }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), F = (a, n) => new THREE.Float32BufferAttribute(a, n);
    g.setAttribute('position', F(this.p, 3)); g.setAttribute('normal', F(this.n, 3));
    g.setAttribute('cBase', F(this.cb, 3)); g.setAttribute('cLo', F(this.cl, 3)); g.setAttribute('cHi', F(this.ch, 3));
    g.setAttribute('cSp', F(this.cs, 3)); g.setAttribute('aInfo', F(this.inf, 4)); g.setAttribute('aOff', F(this.off, 3));
    g.setAttribute('aLod', F(this.ld, 4));
    g.setIndex(this.idx); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
// ---------- SDF voxeliser (lattice units): cells centred on (i+.5, j+.5, k+.5) inside box b = [x0,y0,z0,x1,y1,z1] ----------
// paint(x,y,z) -> 'colour' | { col, iron, flat, ball, nh (no rim outline), alt, rank, range, mode, lod } | null.
// Later calls overwrite earlier cells.
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
  // flat-top hexagon "radius" (the apothem metric): the largest projection on the six edge normals
  hex: (x, y) => Math.max(Math.abs(y), 0.8660254 * Math.abs(x) + 0.5 * Math.abs(y)),
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

// ---------- layout (world units; motions, hinge and face centre are the range's, unchanged) ----------
const PIVOT_Y = 0.13, FACE_Y = 1.4175, PADDLE_R = 0.51, PLATE_A = 0.53, BOMB_R = 0.49, POST_Z = -0.15;
const SB = 0.033, BR = BOMB_R / SB;                   // bomb lattice (~14.85 cells radius)
mat.uniforms.uBallPx.value = BOMB_R * R.RH / 2 / R.TAN_H;   // ball radius in game px at view depth 1 (rim band, spot size)
mat.uniforms.uLod.value.z = SB * R.RH / 2 / R.TAN_H;        // game px per ball cell at view depth 1 (stroke widths)
// plate paint: face (the border out to the edge), rings [outer radius, colour] from the bull's-eye out, cut edge, back.
// The range's plate: a yellow bull, a black ring, a lime ring, a black ring, the lime border (it reads as rings at the far
// lane: every band is >= ~1.5 game px there).
const ringsOf = c => [[0.11, 'yellow'], [0.20, 'void'], [0.30, c], [0.39, 'void']];
const SCHEMES = {
  lime:    { face: 'lime', rings: ringsOf('lime'), edge: 'steel', back: 'slate' },
  cyan:    { face: 'cyan', rings: ringsOf('cyan'), edge: 'steel', back: 'slate' },
  amber:   { face: 'amber', rings: ringsOf('amber'), edge: 'steel', back: 'slate' },
  magenta: { face: 'magenta', rings: ringsOf('magenta'), edge: 'steel', back: 'slate' }
};

// ---------- the target plate: a flat-top hexagonal tin plate, painted flat ----------
// a: apothem of the cut edge (contains the old 0.51 disc), ac: where the front chamfer starts; zf front face, zc chamfer
// foot, zb back face; r0 bull, r1 inner field, r2 ring (round, painted on the hex); n segments per circle (a multiple
// of 6, so the hex corners are vertices of the border fan and its edges stay perfectly straight)
const PL = { a: PLATE_A, ac: 0.505, zf: 0.03, zc: 0.005, zb: -0.03, r0: 0.16, r1: 0.29, r2: 0.40, n: 48 };
const hexAt = (a, th) => { const r = a / sdf.hex(Math.cos(th), Math.sin(th)); return [Math.cos(th) * r, Math.sin(th) * r]; };
const hexCorner = (a, k) => { const th = k * Math.PI / 3, r = a / 0.8660254; return [Math.cos(th) * r, Math.sin(th) * r]; };
const FRONT = [0, 0, 1], BACK = [0, 0, -1], FLAT = [0, 0, 1, 1];          // flat paint: authored tone, no rim
function plateGeo(sc) {
  const g = new Geo(), P = PL, N = P.n, ang = k => k * Math.PI * 2 / N;
  const circ = (r, k) => [Math.cos(ang(k)) * r, Math.sin(ang(k)) * r, P.zf];
  // front face: the bull's-eye disc, the rings around it, then the border out to the hexagon (all flat paint)
  const rings = sc.rings || [[P.r0, sc.bull], [P.r1, sc.face], [P.r2, sc.ring]], rEnd = rings[rings.length - 1][0];
  g.poly(Array.from({ length: N }, (_, k) => circ(rings[0][0], k)), FRONT, rings[0][1], FLAT);
  for (let k = 0; k < N; k++) {
    for (let q = 1; q < rings.length; q++) { const a = rings[q - 1][0], b = rings[q][0];
      g.poly([circ(a, k), circ(b, k), circ(b, k + 1), circ(a, k + 1)], FRONT, rings[q][1], FLAT); }
    const h0 = hexAt(P.ac, ang(k)), h1 = hexAt(P.ac, ang(k + 1));
    g.poly([circ(rEnd, k), [h0[0], h0[1], P.zf], [h1[0], h1[1], P.zf], circ(rEnd, k + 1)], FRONT, sc.face, FLAT);
  }
  // the chamfer (the only bevel: live toon, so it is lemon where it faces the light and green where it faces away;
  // far away it falls back to the flat face colour, mode-2 accent) and the straight-cut steel edge; flat normals
  const CH = cspec(sc.face), ED = cspec(sc.edge);
  for (let e = 0; e < 6; e++) {
    const i0 = hexCorner(P.ac, e), i1 = hexCorner(P.ac, e + 1), o0 = hexCorner(P.a, e), o1 = hexCorner(P.a, e + 1);
    const th = (e + 0.5) * Math.PI / 3, nx = Math.cos(th), ny = Math.sin(th), nc = [nx * 0.7071, ny * 0.7071, 0.7071];
    g.poly([[i0[0], i0[1], P.zf], [o0[0], o0[1], P.zc], [o1[0], o1[1], P.zc], [i1[0], i1[1], P.zf]], nc, CH, [0, 0, 0, 1], [0.5, 12.5, 2]);
    g.poly([[o0[0], o0[1], P.zc], [o0[0], o0[1], P.zb], [o1[0], o1[1], P.zb], [o1[0], o1[1], P.zc]], [nx, ny, 0], ED, [0, 0, 0, 1]);
    // outline hull of the edge band: pushed out 1 px perpendicular to the edge (corner direction / cos 30)
    const d0 = [o0[0] / P.a * 1.0, o0[1] / P.a * 1.0], d1 = [o1[0] / P.a * 1.0, o1[1] / P.a * 1.0];
    g.hullPoly([[o0[0], o0[1], P.zc], [o0[0], o0[1], P.zb], [o1[0], o1[1], P.zb], [o1[0], o1[1], P.zc]],
      [[d0[0], d0[1], 0.6], [d0[0], d0[1], -0.6], [d1[0], d1[1], -0.6], [d1[0], d1[1], 0.6]], [nx, ny, 0]);
  }
  // back face (painted slate) + the outline hulls that give the silhouette seen face-on (the back hex, pushed out) and
  // from behind (the front hex)
  const hb = [5, 4, 3, 2, 1, 0].map(k => hexCorner(P.a, k)), hf = [0, 1, 2, 3, 4, 5].map(k => hexCorner(P.ac, k));
  g.poly(hb.map(p => [p[0], p[1], P.zb]), BACK, sc.back);
  g.hullPoly(hb.map(p => [p[0], p[1], P.zb]), hb.map(p => [p[0] / P.a, p[1] / P.a, -1]), BACK);
  g.hullPoly(hf.map(p => [p[0], p[1], P.zf]), hf.map(p => [p[0] / P.ac, p[1] / P.ac, 1]), FRONT);
  // one plain back brace (the bracket on the post clamps it); hull on every face but the one against the plate
  g.bx(-0.36, -0.045, P.zb - 0.035, 0.36, 0.045, P.zb, 'steel', 0b101111);
  return g.geometry();
}
// ---------- post + bracket (pivot space) and base plate / ceiling hanger (group space): clean steel, no grime ----------
function armGeo(ball, hang) {
  const g = new Geo(), Z = POST_Z, m = hang ? -1 : 1;
  const b = (x0, y0, z0, x1, y1, z1, col, hull = true) => g.bx(x0, Math.min(m * y0, m * y1), z0, x1, Math.max(m * y0, m * y1), z1, col, hull);
  b(-0.045, 0, Z - 0.045, 0.045, FACE_Y - 0.08, Z + 0.045, 'steel');            // the post
  b(-0.07, 0, Z - 0.07, 0.07, 0.1, Z + 0.07, 'slate');                           // collar over the hinge
  b(-0.072, 0.085, Z + 0.06, 0.072, 0.1, Z + 0.072, 'steel', false);             // its lit top edge
  b(-0.13, -0.045, Z - 0.05, 0.13, 0.045, Z + 0.05, 'slate');                    // hinge knuckle
  if (ball) {                                                                    // cup the ball sits in
    b(-0.1, FACE_Y - 0.52, Z - 0.1, 0.1, FACE_Y - 0.43, Z + 0.1, 'slate');
    b(-0.102, FACE_Y - 0.45, Z + 0.09, 0.102, FACE_Y - 0.43, Z + 0.102, 'steel', false);
    b(-0.065, FACE_Y - 0.43, Z - 0.065, 0.065, FACE_Y - 0.36, Z + 0.065, 'steel');
  } else {                                                                       // a clean clamp bracket onto the back brace
    b(-0.08, FACE_Y - 0.15, Z - 0.05, 0.08, FACE_Y + 0.06, PL.zb - 0.035, 'steel');
    b(-0.05, FACE_Y - 0.11, Z - 0.062, -0.02, FACE_Y - 0.08, Z - 0.05, 'haze', false);   // two bolt heads on its back
    b(0.02, FACE_Y - 0.11, Z - 0.062, 0.05, FACE_Y - 0.08, Z - 0.05, 'haze', false);
  }
  return g.geometry();
}
function baseGeo(hang, slot) {
  const g = new Geo(), Z = POST_Z;
  if (slot) {                                                                    // slim carriage riding in a floor slot / hatch
    g.bx(-0.06, -0.35, Z - 0.08, 0.06, 0.09, Z + 0.08, 'slate');
    g.bx(-0.062, 0.075, Z + 0.07, 0.062, 0.09, Z + 0.082, 'steel', false);      // lit top edge
    for (const sx of [-1, 1]) g.bx(sx * 0.105 - 0.025, 0.04, Z - 0.055, sx * 0.105 + 0.025, 0.19, Z + 0.055, 'steel');
    g.bx(-0.1, -0.02, Z - 0.1, 0.1, 0.03, Z + 0.1, 'navy');
  } else if (!hang) {
    g.bx(-0.3, 0, Z - 0.2, 0.3, 0.07, Z + 0.2, 'chestnut');                     // wooden sled
    g.bx(-0.3, 0.058, Z + 0.2, 0.3, 0.07, Z + 0.203, 'tan', false);             // its lit top edge
    g.bx(-0.27, 0.07, Z - 0.17, 0.27, 0.09, Z + 0.17, 'slate');                  // steel base plate
    g.bx(-0.272, 0.078, Z + 0.17, 0.272, 0.09, Z + 0.173, 'steel', false);      // its lit front edge
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.bx(sx * 0.21 - 0.022, 0.09, Z + sz * 0.11 - 0.022, sx * 0.21 + 0.022, 0.11, Z + sz * 0.11 + 0.022, 'haze', false);
    for (const sx of [-1, 1]) g.bx(sx * 0.125 - 0.025, 0.09, Z - 0.06, sx * 0.125 + 0.025, 0.19, Z + 0.06, 'steel');   // hinge cheeks
  } else {
    g.bx(-0.035, 0, Z - 0.035, 0.035, 0.95, Z + 0.035, 'steel');                 // hanger rod up into the ceiling rail
    g.bx(-0.15, 0.86, Z - 0.1, 0.15, 0.98, Z + 0.1, 'slate');                    // trolley
    for (const sx of [-1, 1]) g.bx(sx * 0.1 - 0.035, 0.95, Z - 0.06, sx * 0.1 + 0.035, 1.04, Z + 0.06, 'haze');
    g.bx(-0.2, -0.07, Z - 0.12, 0.2, 0, Z + 0.12, 'chestnut');                   // hanger block
    g.bx(-0.2, -0.012, Z + 0.12, 0.2, 0, Z + 0.123, 'tan', false);              // its lit top edge
    for (const sx of [-1, 1]) g.bx(sx * 0.125 - 0.025, -0.19, Z - 0.06, sx * 0.125 + 0.025, -0.07, Z + 0.06, 'steel');
  }
  return g.geometry();
}
// ---------- shatter chips: coarse voxel lists in each prop's own colours; [i, j, k, colour, sizeMul] ----------
const CS = 0.0935;                                     // chip lattice (the old 11x11 disc)
function plateChips(sc) {                              // flat hex shards: the border flies as bigger chunks
  const L = [], rings = sc.rings || [[PL.r0, sc.bull], [PL.r1, sc.face], [PL.r2, sc.ring]];
  for (let j = -6; j <= 6; j++) for (let i = -7; i <= 7; i++) {
    const x = i * CS, y = j * CS, h = sdf.hex(x, y); if (h > PL.a) continue;
    const r = len2(x, y), rim = h > PL.a - CS * 0.9, ring = rings.find(q => r < q[0]);
    const col = rim || !ring ? sc.face : ring[1];
    L.push([i, j, 0, hexOf(col), rim ? 1.7 : 1]);
    if (((i * 7 + j * 3) & 3) === 0) L.push([i, j, -1, hexOf(rim ? sc.edge : sc.back), 0.8]);
  }
  return L;
}

// ---------- bomb: a round cast-iron ball, steel cap at the top-right, fuse, skull + crossbones at two levels of detail ----------
// (cap + fuse are part of the ball mesh, i.e. of its hit volume: their shapes are unchanged from the first pass)
const CAP_D = (() => { const v = [0.5, 0.82, 0.3], l = len3(...v); return v.map(a => a / l); })();
const CAP_C = CAP_D.map(a => a * (BR - 0.2));
const F0 = CAP_D.map(a => a * (BR + 1.2)), F1 = [F0[0] + 0.4, F0[1] + 3.2, F0[2] + 0.3], F2 = [F1[0] + 2.8, F1[1] + 1.6, F1[2] + 0.3];
// FAR (2nd pass): ONE big 9 x 11 icon on a 2-cell grid (each icon pixel = 2 x 2 cells), ~1 game px per icon pixel at the far lane
const SKULL2 = [
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
// NEAR (1st pass character): 1 cell per pixel, col c -> cell i = c - 8, row r -> cell j = 10 - r. Round cranium, eye
// sockets with rounded bottoms, a nose, four teeth, crossbones with knobbed ends. Its eyes, jaw and bones sit where
// the far icon's do, so the handoff reads as the same skull sharpening.
const SKULL1 = [
  '.....XXXXX.....',
  '...XXXXXXXXX...',
  '..XXXXXXXXXXX..',
  '..XXXXXXXXXXX..',
  '..XXoooXoooXX..',
  '..XXoooXoooXX..',
  '..XXXooXooXXX..',
  '...XXXXoXXXX...',
  '....XXoooXX....',
  '....XXXXXXX....',
  'X...X.X.X.X...X',
  'XX...........XX',
  'XXXX.......XXXX',
  '..XXXX...XXXX..',
  '....XXXXXXX....',
  '..XXXX...XXXX..',
  'XXXX.......XXXX',
  'XX...........XX',
  'X.............X'];
function skull2At(x, y) {                              // -> 'X' bone, 'o' socket, null (front projection, lattice units)
  const c = Math.floor((x + 9) / 2), r = Math.floor((11 - y) / 2);
  if (r < 0 || r >= SKULL2.length || c < 0 || c >= 9) return null;
  const ch = SKULL2[r][c]; return ch === '.' ? null : ch;
}
function skull1At(x, y) {
  const c = Math.floor(x) + 8, r = 10 - Math.floor(y);
  if (r < 0 || r >= SKULL1.length || c < 0 || c >= 15) return null;
  const ch = SKULL1[r][c]; return ch === '.' ? null : ch;
}
const capShape = (x, y, z) => Math.min(sdf.cyl(x, y, z, CAP_C, CAP_D, 1.9, 3.1), sdf.cyl(x, y, z, CAP_C.map((a, i) => a - CAP_D[i] * 0.9), CAP_D, 0.55, 3.9));
const fuseShape = (x, y, z) => Math.min(sdf.capsule(x, y, z, F0, F1, 1.0), sdf.capsule(x, y, z, F1, F2, 1.0));
function capPaint(x, y, z) {
  const px = x - CAP_C[0], py = y - CAP_C[1], pz = z - CAP_C[2], h = px * CAP_D[0] + py * CAP_D[1] + pz * CAP_D[2];
  const rr = len3(px - CAP_D[0] * h, py - CAP_D[1] * h, pz - CAP_D[2] * h);
  return h > 1.0 && rr < 1.4 ? 'void' : h > 1.0 ? 'slate' : 'steel';
}
const fusePaint = (x, y, z) => len3(x - F2[0], y - F2[1], z - F2[2]) < 1.3 ? 'rust' : (Math.floor((x + y + z) * 0.8) & 1) ? 'sand' : 'tan';
// a ball cell: far + near material (1 iron, 2 bone, 3 socket), its 4x4 ordered rank, and an optional stroke record
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const MAT_OF = { X: 2, o: 3 };
function ballCell(x, y, z, stroke) {
  const front = z >= 2, i = Math.floor(x), j = Math.floor(y);
  const far = front ? MAT_OF[skull2At(x, y)] || 1 : 1, near = front ? MAT_OF[skull1At(x, y)] || 1 : 1;
  return { col: 'midnight/void/navy/haze', iron: true, lod: [far, near, (B4[(j & 3) * 4 + (i & 3)] + 0.5) / 16, stroke ? stroke(x, y, z) : 0] };
}
function ballGeo(stroke, withFuse) {
  const ball = (x, y, z) => sdf.sphere(x, y, z, 0, 0, 0, BR), B0 = Math.ceil(BR) + 1;
  const map = sdf.voxelise(new Map(), [-B0, -B0, -B0, B0, B0, B0], ball, (x, y, z) => ballCell(x, y, z, stroke));
  sdf.voxelise(map, [-B0, 6, -6, B0, B0 + 5, B0], capShape, capPaint);
  if (withFuse) sdf.voxelise(map, [0, 10, -2, B0 + 6, B0 + 10, B0 + 4], fuseShape, fusePaint);
  return new Geo(1).voxels(map, SB).geometry();     // no back cull on a ball: turned 90 deg its back cap is on the silhouette
}
function fuseGeo() {                                   // origin at the fuse root (F0) so scaling it burns it down
  const map = sdf.voxelise(new Map(), [0, 10, -2, BR + 8, BR + 12, BR + 4], (x, y, z) => Math.max(fuseShape(x, y, z), -capShape(x, y, z)), fusePaint);
  return new Geo(1).voxels(map, SB, F0[0], F0[1], F0[2], true).geometry();
}

// ---------- decoy: the bomb with the plate's paint brushed on in thin, sloppy strokes ----------
// The plate is lime / black / lime / black / yellow; on a black ball the black rings come free, so the painter only
// brushed the lime and the yellow: a wobbly lime HEXAGON (the plate's border), a lime ring, a small yellow circle for the
// bull, each off-centre, uneven in width (w), with brush gaps (angle ranges, rad), plus two drips. Strokes are front
// projected (lattice units). Each cell stores its distance to the nearest stroke's centre line divided by the local width;
// the shader paints it while that is under the half width (0.55 cells up close, never under uLod.w game px far away, so
// at the far lane the yellow circle closes into a dot and the lime thickens into rings). Colour ids: 1 lime, 2 yellow.
const TAU = Math.PI * 2, angOf = (x, y) => (Math.atan2(y, x) + TAU) % TAU;
const STROKES = [
  { id: 1, cx: 0.4, cy: -0.4, hex: true, r: a => 10.9 + 0.45 * Math.sin(3 * a + 1.3) + 0.3 * Math.sin(7 * a + 0.4),
    w: a => 1 + 0.35 * Math.sin(2 * a + 0.7) + 0.2 * Math.sin(5 * a), gaps: [[0.55, 1.05], [3.9, 4.12]] },
  { id: 1, cx: -0.2, cy: 0.1, r: a => 7.3 + 0.4 * Math.sin(2 * a + 2.1) + 0.25 * Math.sin(5 * a + 0.3),
    w: a => 1 + 0.3 * Math.sin(3 * a + 1.1), gaps: [[3.55, 3.95]] },
  { id: 2, cx: 0.3, cy: 0.6, r: a => 2.1 + 0.25 * Math.sin(2 * a + 0.5), w: a => 0.9 + 0.2 * Math.sin(3 * a), gaps: [[2.1, 2.5]] }];
const DRIPS = [[1, -4.6, -10.6, -13.2], [2, 0.5, -1.1, -4.2]];    // [colour id, x, top, end]: a run down, a blob at the end
function decoyStroke(x, y, z) {
  if (z < -1) return 0;                                // painted all over the front, out past the silhouette
  let best = 9, id = 0;
  for (const s of STROKES) {
    const px = x - s.cx, py = y - s.cy, a = angOf(px, py);
    if (s.gaps.some(g => a >= g[0] && a <= g[1])) continue;
    const d = Math.abs((s.hex ? sdf.hex(px, py) : len2(px, py)) - s.r(a)) / s.w(a);
    if (d < best) { best = d; id = s.id; }
  }
  for (const [c, dx, y0, y1] of DRIPS) {
    const ex = Math.abs(x - dx), d = y > y0 ? 9 : y > y1 ? ex : len2(ex, y - y1) / 1.8;
    if (d < best) { best = d; id = c; }
  }
  return best < 2.4 ? id * 64 + best : 0;
}
function sparkGeo() {                                  // unlit twinkle star (MAT.glow): big enough to read from the back lanes
  const v = new R.Vox();
  v.bx(-0.048, -0.048, -0.048, 0.048, 0.048, 0.048, PAL.lemon);
  v.bx(-0.018, -0.15, -0.018, 0.018, 0.15, 0.018, PAL.yellow); v.bx(-0.15, -0.018, -0.018, 0.15, 0.018, 0.018, PAL.yellow);
  for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) v.bx(a * 0.068 - 0.022, b * 0.068 - 0.022, -0.022, a * 0.068 + 0.022, b * 0.068 + 0.022, 0.022, PAL.orange);
  v.bx(-0.02, -0.02, 0.048, 0.02, 0.02, 0.066, PAL.bone);
  return v.geo();
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
const skullChip = (x, y, z) => z > 2 && ({ X: 'bone', o: 'void' })[skull1At(x, y)];
const decoyChip = (x, y, z) => { const s = decoyStroke(x, y, z); return s && s % 64 < 0.8 ? (s >= 128 ? 'yellow' : 'lime') : skullChip(x, y, z); };

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
function plateFace(p, c) {
  const k = SCHEMES[c] ? c : 'lime';
  return [shared(geo('plate_' + k, () => plateGeo(SCHEMES[k])), mat), geo('chipsP_' + k, () => plateChips(SCHEMES[k]))];
}
function paddle(o = {}) {
  const p = new Prop(o, 'target', false), [face, chips] = plateFace(p, o.color);
  p.face = p.addFace(face); p.chips = chips;
  return p;
}
function bomb(o = {}) {
  const p = new Prop(o, 'bomb', true), burn = !!o.burn;
  p.face = p.addFace(shared(geo('bomb' + (burn ? '' : 'F'), () => ballGeo(null, !burn)), mat));
  p.chips = geo('chipsB', () => ballChips(skullChip));
  p.addFuse(burn);
  return p;
}
function decoy(o = {}) {
  const p = new Prop(o, 'bomb', true);
  p.face = p.addFace(shared(geo('decoyF', () => ballGeo(decoyStroke, true)), mat));
  p.chips = geo('chipsD', () => ballChips(decoyChip));
  p.addFuse(false); p.decoy = true;
  return p;
}
function flipbomb(o = {}) {
  const p = bomb(Object.assign({}, o, { burn: true })), [face2, chips2] = plateFace(p, o.color);
  p.face2 = p.addFace(face2); p.face2.visible = false; p.chips2 = chips2;
  return p;
}
// build every shared geometry now (a first bomb mid-stage must not cost a frame)
function warm() { [paddle(), bomb(), decoy(), flipbomb(), paddle({ hang: true }), bomb({ hang: true }), paddle({ slot: true })].forEach(() => {}); }
B.Props = { paddle, bomb, decoy, flipbomb, warm, mat, Geo, sdf, cspec, SCHEMES, FACE_Y, PIVOT_Y, PADDLE_R, PLATE_A, BOMB_R, POST_Z, CHIP_S: CS };
})(window.BLAM);
