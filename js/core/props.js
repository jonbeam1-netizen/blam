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
   DECOY: a bomb disguised as a plate, six variants (B.Props.DECOY_VARIANTS picks which ship, mixed at random):
     A SLOPPY PAINT  the same bomb with THIN sloppy strokes in the plate's paint (the black rings come free on black
                     iron): a wobbly lime hexagon, a lime ring, a little yellow circle for the bull, gaps, two drips. A
                     stroke never gets thinner than uLod.w game px, so at the far lane they thicken into a target-ish
                     thing; up close it is plainly a bomb someone scribbled on. Unmask: the paint flakes off.
     B LUNCH BAG     a crinkled kraft paper bag pulled over it, top folded over (zig-zag edge), a crayon plate on the
                     front, the open bottom stops short so the iron shows. Unmask: it puffs up and blows off upward.
     C CARDBOARD     a hex cut from a box (corrugated cut edges, bare rim, an upside-down box print), two strips of
                     duct tape. Unmask: the tape rips, it flips off and lands flat.
     D PAPER PLATE   a fluted paper plate, the target painted on, a red elastic round the back, askew. Unmask: drops.
     E HELD UP       a small real plate held up by stick arms with mittens; too small, the iron shows; legs and red
                     shoes dangle. Unmask: it drops the plate, hands up.
     F CRAYON        a torn cardboard scrap: a lopsided crayon hex, THREE rings, 'TARGET' in blue crayon, one strip
                     of masking tape. Unmask: it flutters away.
     B-F: ONE extra mesh each (E two), with two looks picked by the ball's own LOD (uLod.xy, the skull's dissolve):
     FAR = the real plate's flat paint (scaled), everything else sunk to a dark tone; NEAR = paper / cardboard /
     crayon, the plate's black rings cut out (tabs hold the middle) so the skull shows through. Shared tells: a
     longer fuse + spark over the top, the skull through the rings, a slight tilt / off size, the wobble.

   API  (BLAM.Props)
     paddle({ color:'lime', size:1, hang:false, slot:false })   hex target plate on a post (hang: ceiling hanger;
                                                    slot: a slim carriage that rides in a floor slot
                                                    instead of the wooden sled + base plate; any prop takes it)
     bomb({ size:1, hang:false, burn:false })       iron ball, skull + crossbones, cap, fuse, spark
                                                    (burn: the fuse is its own mesh so setFuse() can shorten it)
     decoy({ size:1, hang:false, variant })         a BOMB disguised as a plate (see DECOY); variant 'a'..'f', or a
                                                    random letter of Props.DECOY_VARIANTS (Math.random: pass variant
                                                    for versus-safe play). Call wobble(t) every frame. kind 'bomb'
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
       variant     decoys: the letter 'a'..'f'
       unmask(k)   decoys: k 0 = disguised .. 1 = the bare bomb, the disguise thrown clear (bag blown off, cardboard
                   flipped off, mask / plate dropped, drawing fluttered away, A: paint flaked off). Pure in k, cheap,
                   can go back to 0 (pool reuse). Reads well over ~0.15-0.3 s. It does NOT swell the ball or flare
                   the spark (the stage does: pivot.scale, sparkle + spark.scale). Thrown-off bits land on the floor
                   at prop.floor (face-space y; default the standing / hanging floor) and stop being hit parts.
                   B-F register their disguise as an extra hit part (empty chip list): shooting the paper = the bomb.
       chips       the shatter list [[i, j, k, colourHex, sizeMul]...] used by register()
     }
     Props.warm(which)      build every shared geometry now (call at stage load, not mid-play); which: omitted = the
                            decoy variants in DECOY_VARIANTS, 'all', or an array of letters (call again after changing them)
     Props.DECOY_VARIANTS   enabled decoy letters (default ['a']); Props.DECOY_NAMES { a: 'SLOPPY PAINT', ... }
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
   Budget: plate face ~0.5k tris, ball ~14k (round voxels + silhouette hull); arm / base ~0.1-0.2k each. Decoy draw
   calls: A 4 (like a bomb; + 6 flake meshes only while it unmasks), B / C / D / F 5, E 6. Tris: A 15k, B 37k, C-F 22-24k.
   Review page: decoyviewer.html (all six next to real plates at the far and near stops, unmask, picks).
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
  if (vD.z > 2.5 && vI.y < 0.5) {                                    // decoy disguise cell: near / far by the BALL's LOD (lk)
    if (vD.x >= lk) { if (vD.z > 4.5) discard; }                     // near: its own toon material (mode 5: a hole up close)
    else { if (vD.z > 3.5 && vD.z < 4.5) discard; c = vS; }          // far: the flat plate colour (mode 4: gone far away)
  } else if (vD.y > 0.0 && vI.y < 0.5) {                             // accent detail by view depth, whole features at a time
    float k = clamp((vD.y - depth) / (0.3 * vD.y), 0.0, 1.0);
    if (vD.z > 1.5) { if (vD.x >= k) c = vB; }                       // mode 2: live tones up close, the flat base far away
    else if (vD.x < k) c = vD.z > 0.5 ? (t > 0.5 ? vL : vS) : vS;    // mode 1: one shade darker, mode 0: the accent
  }
  if (vI.y > 0.5 && rv > 0.2) discard;                               // hull only at the silhouette and behind
  if (vI.y > 0.5 && vI.w > 1.5 && vLd.z < lk) discard;               // the hull of a near-only disguise cell goes with it
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
  // HI (hulls only, optional): [aInfo, aLod] for the hull copy (decoy disguises: a near-only cell's hull, see voxels())
  face(x, y, z, hx, hy, hz, f, C, I, nrm, hull, D, L, HI) {
    const F = FACES[f], q = F[3];
    let nx = F[0], ny = F[1], nz = F[2];
    if (nrm) { const k = hull ? 1 : this.k; nx = nx * (1 - k) + nrm[0] * k; ny = ny * (1 - k) + nrm[1] * k; nz = nz * (1 - k) + nrm[2] * k;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
    const c = hull ? HULL : C, inf = hull ? (HI ? HI[0] : HULLI) : I, ld = hull ? (HI ? HI[1] : NOL) : (L || NOL);
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
      // decoy disguise cells: hullNear = the cell's rank (its hull vanishes with it far away), noHull = no hull at all
      const HI = v.hullNear != null ? [[0, 1, 0, 2], [0, 0, v.hullNear, 0]] : null;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        if (map.has(VK(v.i + F[0], v.j + F[1], v.k + F[2]))) continue;
        this.face(x, y, z, h, h, h, f, C, I, v.nrm, false, D, v.lod);
        if (!v.noHull && (hullFront || f !== 4) && hullZ(v)) this.face(x, y, z, h, h, h, f, C, I, v.nrm, true, null, null, HI);
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
// the disguised decoys (B-F) carry a LONGER, kinked fuse so it always pokes out over the top of the disguise
const FL = [F0, [F0[0] + 0.8, F0[1] + 4.2, F0[2] + 0.2], [F0[0] + 0.2, F0[1] + 7.8, F0[2] + 0.4], [F0[0] + 2.6, F0[1] + 10.6, F0[2] + 0.6]];
const FLT = FL[3];
const fuseLShape = (x, y, z) => Math.min(sdf.capsule(x, y, z, FL[0], FL[1], 1.0), sdf.capsule(x, y, z, FL[1], FL[2], 1.0), sdf.capsule(x, y, z, FL[2], FL[3], 1.0));
const fuseLPaint = (x, y, z) => len3(x - FLT[0], y - FLT[1], z - FLT[2]) < 1.3 ? 'rust' : (Math.floor((x + y + z) * 0.8) & 1) ? 'sand' : 'tan';
function ballGeo(stroke, withFuse, longFuse) {
  const ball = (x, y, z) => sdf.sphere(x, y, z, 0, 0, 0, BR), B0 = Math.ceil(BR) + 1;
  const map = sdf.voxelise(new Map(), [-B0, -B0, -B0, B0, B0, B0], ball, (x, y, z) => ballCell(x, y, z, stroke));
  sdf.voxelise(map, [-B0, 6, -6, B0, B0 + 5, B0], capShape, capPaint);
  if (longFuse) sdf.voxelise(map, [0, 10, -2, B0 + 6, B0 + 12, B0 + 4], fuseLShape, fuseLPaint);
  else if (withFuse) sdf.voxelise(map, [0, 10, -2, B0 + 6, B0 + 10, B0 + 4], fuseShape, fusePaint);
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
const FUSE_TIP_L = [FLT[0] - F0[0], FLT[1] - F0[1], FLT[2] - F0[2]];

// ---------- decoy disguises (variants B-F) and variant A's paint flakes ----------
// A decoy must pass for a plate at a glance and be plainly a bomb once you look. Each disguise is ONE extra mesh (E: two)
// in the shared toon material, voxelised on the ball's own lattice (SB), with TWO looks picked by the BALL's LOD (uLod.xy,
// the same 4x4 ordered dissolve the skull uses, shader modes 3-5):
//   FAR  = the real plate's flat paint (lime border, black ring, lime ring, black ring, yellow bull, scaled to the
//          disguise), everything that is not "plate" sunk to a dark tone that melts into the range;
//   NEAR = what it really is: paper, cardboard, crayon, tape, string, stick arms, and the plate's black rings CUT OUT (little
//          tabs hold the middle in) so the skull shows through. Far away the holes are filled black.
// Tells on every variant: a longer fuse + spark over the top, the skull through the rings, a slight tilt / off size, wobble.
const hash3 = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const tri = v => { const f = ((v % 2) + 2) % 2; return f < 1 ? f : 2 - f; };       // triangle wave 0..1 (period 2): facets
const angD = (a, b) => { const d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };
const rankAt = (x, y) => (B4[(Math.floor(y) & 3) * 4 + (Math.floor(x) & 3)] + 0.5) / 16;
const PLATE_C = PL.a / SB;                                            // a real plate's apothem in ball cells (~16)
const FAR_PAPER = 'navy', FAR_RIM = 'slate', FAR_LIMB = 'void';       // far tones of what is not plate (melts into the walls)
const FLATO = { flat: true };
// a disguise cell. near: palette spec drawn up close (toon); far: flat colour once the ball LOD hands off (null: the cell
// only exists up close, mode 4). near null: a HOLE up close, only there (flat far colour) far away (mode 5). o: extra fields
function dcell(x, y, near, far, o) {
  const rank = rankAt(x, y);
  if (!near) return { col: far, alt: far, rank, range: 1, mode: 5, flat: true, nh: 1, noHull: true };
  const c = { col: near, alt: far || near.split('/')[0], rank, range: 1, mode: far ? 3 : 4 };
  if (!far) c.hullNear = rank;
  return o ? Object.assign(c, o) : c;
}
// the real plate's flat paint at a plate-local point (cells) for a plate of apothem a (cells); null off the plate
function plateCol(u, v, a) {
  const q = PLATE_C / a; if (sdf.hex(u, v) * q > PLATE_C) return null;
  const r = len2(u, v) * q * SB; for (const [rr, c] of SCHEMES.lime.rings) if (r < rr) return c;
  return 'lime';
}
// the plate's bands as painted / cut by hand -> 'out' | 'border' | 'lime' | 'bull' | 'hole' | 'tab'. o.hw(angle): wobble of
// the hex edge, o.rw(angle): of the rings, o.tabs: angle of the first tab; tabs (3 per ring, ~2 cells) bridge a hole
const BANDS = [[0.11, 'bull'], [0.20, 'hole'], [0.30, 'lime'], [0.39, 'hole']];
function tabAt(ang, rc, n, o) {
  const t0 = (o.tabs || 0.5) + n * 1.05;
  for (let m = 0; m < 3; m++) if (angD(ang, t0 + m * TAU / 3) * rc < (o.tabW || 1.1)) return true;
  return false;
}
function bandAt(u, v, a, o = {}) {
  const ang = angOf(u, v), q = PLATE_C / a;
  if (sdf.hex(u, v) * q > PLATE_C * (o.hw ? 1 + o.hw(ang) : 1)) return 'out';
  const rc = len2(u, v), r = rc * q * SB / (o.rw ? 1 + o.rw(ang) : 1);
  for (let n = 0; n < BANDS.length; n++) if (r < BANDS[n][0]) {
    const b = BANDS[n][1]; return b !== 'hole' ? b : tabAt(ang, rc, n, o) ? 'tab' : 'hole';
  }
  return 'border';
}
// 2D helpers: distance to a polyline, signed distance to a polygon (negative inside)
function lineD(px, py, pts) {
  let d = 1e9;
  for (let n = 1; n < pts.length; n++) {
    const [ax, ay] = pts[n - 1], ex = pts[n][0] - ax, ey = pts[n][1] - ay, wx = px - ax, wy = py - ay;
    const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, len2(wx - ex * h, wy - ey * h));
  }
  return d;
}
function polyD(px, py, pts) {
  let d = 1e9, s = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], ex = pts[i][0] - ax, ey = pts[i][1] - ay, wx = px - ax, wy = py - ay;
    const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, len2(wx - ex * h, wy - ey * h));
    const c1 = py >= ay, c2 = py < pts[i][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * d;
}
const seg3 = (p, a, b) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], wx = p[0] - a[0], wy = p[1] - a[1], wz = p[2] - a[2];
  const h = Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / (ex * ex + ey * ey + ez * ez)));
  return len3(wx - ex * h, wy - ey * h, wz - ez * h);
};
// a strip of tape: a flat ribbon (half width hw) along the polyline pts in the (rho, z) plane at angle th (piece frame)
function tapeShape(th, hw, pts, r0) {
  const c = Math.cos(th), s = Math.sin(th);
  return (x, y, z) => {
    const rho = x * c + y * s, tau = -x * s + y * c;
    if (Math.abs(tau) > hw || rho < r0 + 1.3 * hash3(Math.floor(tau + 20), 3, 1)) return 1;        // torn end
    return lineD(rho, z, pts) - 0.7;
  };
}
// voxelise a disguise piece in its own frame (origin = its pivot, so it can fly off and tumble); rest = [[x, y, z] ball
// cells, [rx, ry, rz]]: its pose on the ball. passes(tb) -> [[box, shape, paint, nshape?]...], tb(x, y, z) = the same point
// in ball cells. Hole fills (mode 5) go in a map of their own, so they never cull the faces of the hole's walls.
function pieceGeo(rest, passes) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rest[1][0], rest[1][1], rest[1][2])).setPosition(rest[0][0], rest[0][1], rest[0][2]);
  const w = new THREE.Vector3(), tb = (x, y, z) => { w.set(x, y, z).applyMatrix4(m); return [w.x, w.y, w.z]; };
  const all = new Map();
  const wr = f => f && ((x, y, z) => f(x, y, z, tb));
  for (const [box, shape, paint, nshape] of passes(tb)) sdf.voxelise(all, box, wr(shape), wr(paint), wr(nshape));
  const main = new Map(), fill = new Map();
  for (const [key, c] of all) (c.mode === 5 ? fill : main).set(key, c);
  return new Geo(1).voxels(main, SB).voxels(fill, SB).geometry();
}
// rest poses (ball cells, rad)
const REST = {
  b: [[0, 4, 0], [0, 0, 0]],                      // the bag (its frame is the ball's, lifted)
  c: [[-0.3, 0.6, 16.9], [0, 0.05, -0.07]],       // cardboard hex, a touch big, tilted
  d: [[-2.4, 3.4, 17.4], [0.06, 0.22, 0.26]],      // paper plate mask, askew
  e: [[0.3, 1.6, 17.6], [0, 0, 0.07]],            // the small plate held up
  l: [[0, 0, 0], [0, 0, 0]],                      // E's limbs (ball frame)
  f: [[0.9, -1.0, 16.8], [0.03, -0.06, -0.11]]    // the crayon scrap
};

// B. PAPER LUNCH BAG pulled over the bomb: crinkled kraft paper, the top folded shut round the fuse, a crayon plate on the
// front (wonky, hatched, black rings cut out), the open bottom stops short so the iron shows under it
function bagGeo() {
  const W = 15.8, YT = 21, ZF = 16.4, ZB = -16.4, TH = 0.8, FL0 = 15.2;      // half width, top fold, front / back, flap edge
  const P = { cx: 0.4, cy: 3.0, a: 11.2, af: 13.2, rot: 0.06 }, cr = Math.cos(P.rot), sr = Math.sin(P.rot);   // drawn a, far plate af
  const O = { hw: a => 0.035 * Math.sin(3 * a + 1.2) + 0.025 * Math.sin(5 * a + 0.3), rw: a => 0.05 * Math.sin(2 * a + 0.4) + 0.03 * Math.sin(3 * a + 2), tabs: 1.2 };
  const c1 = (X, Y) => tri(X * 0.19 + Y * 0.12 + 0.3);
  const crk = (X, Y, Z) => c1(X, Y) + tri(-X * 0.1 + Y * 0.21 + Z * 0.07 + 1.1) + tri(X * 0.15 - Y * 0.06 + Z * 0.17 + 0.6) - 1.5;   // crumpled facets
  const zig = X => FL0 + 1.9 * tri(X * 0.42 + 0.5);                                            // the flap's pinked (zig-zag) edge
  const box = (X, Y, Z) => Math.max(Math.abs(X) - W + 1.6 * Math.max(0, 1 - Math.abs(Z) / 9), Y - YT, Z - ZF, ZB - Z);   // side gussets fold in
  const flap = (X, Y, Z) => Math.max(Math.abs(X) - W - 0.2, Y - YT - 0.5, zig(X) - Y, Math.abs(Z - ZF - 1.1) - 0.75);   // the top, folded over the front
  const bot = X => -10 + 0.9 * tri(X * 0.37 + 0.2) + 0.6 * tri(X * 0.91);                     // open bottom, torn uneven
  const shape = (x, y, z, tb) => {
    const [X, Y, Z] = tb(x, y, z);
    if (Y < bot(X) || Z < -3 || fuseLShape(X, Y, Z) < 1.4) return 1;                          // (the back half never shows)
    return Math.min(Math.abs(box(X, Y, Z) + 0.3 * crk(X, Y, Z)) - TH, flap(X, Y, Z));
  };
  const nshape = (x, y, z, tb) => { const [X, Y, Z] = tb(x, y, z), c = crk(X, Y, Z);
    return flap(X, Y, Z) < 0.3 ? (Z - ZF - 1.85) * 0.8 + (Y - YT) * 0.6 + 0.4 * c : box(X, Y, Z) + 1.0 * c; };   // the flap faces up a bit: lit
  const paint = (x, y, z, tb) => {
    const [X, Y, Z] = tb(x, y, z), onFlap = flap(X, Y, Z) < 0.3 && Z > ZF + 0.2, zg = zig(X);
    const shade = !onFlap && Z > ZF - 2.4 && Y < zg && Y > zg - 1.7;                           // the flap's shadow on the bag
    const side = !onFlap && Z > ZF - 2.4 && Math.abs(X) > W - 1.6;                               // the side folds at the front edges
    let near = onFlap && Y > YT - 0.6 ? 'sand' : shade || side ? 'chestnut' : c1(X, Y) > 0.95 ? 'chestnut' : 'tan', far = FAR_PAPER;
    if (Z > ZF - 2.4 && Y < YT - 0.3) {                                                         // the front: the crayon plate
      const dx = X - P.cx, dy = Y - P.cy, u = dx * cr + dy * sr, v = -dx * sr + dy * cr, pc = plateCol(u, v, P.af), b = bandAt(u, v, P.a, O);
      if (pc) far = pc;
      if (b === 'hole') return dcell(x, y, null, pc || 'void');
      const skip = hash3(Math.floor(X), Math.floor(Y), 7) < 0.12;                               // wax skips: paper shows through
      const edge = P.a * (1 + O.hw(angOf(u, v))) - sdf.hex(u, v);
      if (b === 'bull' && !skip) near = shade ? 'amber' : 'yellow';
      else if ((b === 'border' || b === 'lime') && !skip && (edge < 2 || tri((u * 0.55 + v * 0.83) / 2.1) < 0.6)) near = shade ? 'green' : 'lime';
    }
    return dcell(x, y, near, far, ['lime', 'yellow', 'green', 'amber'].includes(near) ? FLATO : null);
  };
  return pieceGeo(REST.b, () => [[[-19, -16, -4, 19, 20, 20], shape, paint, nshape]]);
}

// C. CARDBOARD CUTOUT: a hex cut from a box (3 cells: liner, flutes, liner: corrugation on every cut edge), sloppily painted
// (bare edges, a box print the paint ran out on), rings cut out, two strips of silver duct tape over the edge onto the bomb
const PRINT_PX = (() => {                                             // an upside-down box print: up-arrow + "UP" (13 x 5)
  const s = new Set(), arrow = ['..X..', '.XXX.', 'X.X.X', '..X..', '..X..'];
  arrow.forEach((row, gy) => [...row].forEach((ch, gx) => { if (ch === 'X') s.add(gx + ',' + gy); }));
  for (const [gx, gy] of R.small('UP').px) s.add((gx + 6) + ',' + gy);
  return s;
})();
function boxGeo() {
  const a = 16.6, cd = [Math.cos(4 * Math.PI / 3), Math.sin(4 * Math.PI / 3)], O = { tabs: 0.25, tabW: 1.3 };
  const d2 = (u, v) => { const an = angOf(u, v);                                              // scissor-jagged, one corner snipped
    return Math.max(sdf.hex(u, v) - a + 0.25 * tri(an * 9.5) + 0.12 * tri(an * 23 + 0.4), u * cd[0] + v * cd[1] - (a / 0.866 - 3.4)); };
  const shape = (x, y, z) => Math.max(d2(x, y), Math.abs(z - 0.5) - 1.5);
  const print = (x, y) => {                                           // bare patch on the bottom border, print upside down
    if (x < -1.5 || x >= 11.5 || y < -16.2 || y >= -11.2) return null;
    const gx = 12 - Math.floor(x + 1.5), gy = 4 - Math.floor(-11.2 - y);
    return PRINT_PX.has(gx + ',' + gy) ? 'walnut' : 'tan';
  };
  const paint = (x, y, z) => {
    const d = d2(x, y), b = bandAt(x, y, a, O), pc = plateCol(x, y, a), rim = d > -1.2;
    if (b === 'hole') return z > 1 ? dcell(x, y, null, pc || 'void') : null;
    if (z < 0) return dcell(x, y, 'tan', rim ? 'steel' : 'slate');                                       // back liner
    if (z < 1) return dcell(x, y, (Math.floor(x / 1.6 + 100) & 1) ? 'sand' : 'chestnut', rim ? 'steel' : 'slate');   // flutes
    const far = pc || 'lime', pr = print(x, y);
    if (pr) return dcell(x, y, pr, far);
    const an = angOf(x, y), bare = d > -(1.0 + 0.6 * tri(an * 5.3 + 0.4) + 0.4 * tri(an * 13.1));    // the paint stops short of the cut
    if (b === 'tab' || bare) return dcell(x, y, 'tan', far);                                            // tabs, a bare cardboard rim
    if (b === 'bull') return dcell(x, y, 'yellow', far, FLATO);
    return dcell(x, y, 'lime', far, FLATO);
  };
  const tape = (th) => {
    const sh = tapeShape(th, 2.3, [[11.2, 2.4], [a + 0.9, 2.4], [a + 0.9, -1.9], [13.2, -8.6]], 11.2);
    return [[-22, -22, -11, 22, 22, 4], sh, (x, y) => {
      const rho = x * Math.cos(th) + y * Math.sin(th);
      return dcell(x, y, 'haze', rho < a ? plateCol(x, y, a) || 'lime' : 'steel');
    }, (x, y, z) => z - 2.4];
  };
  return pieceGeo(REST.c, () => [[[-21, -21, -2, 21, 21, 3], shape, paint], tape(2.55), tape(5.85)]);
}

// D. PAPER PLATE MASK: a fluted paper plate with the target painted on (rings cut out), stapled to a red elastic that
// runs round the back of the bomb, sitting askew like a party mask
function maskGeo() {
  const RP = 14.4, A = 10.4, AF = 12.6, O = { hw: a => 0.03 * Math.sin(4 * a + 0.5), rw: a => 0.04 * Math.sin(3 * a + 1.7), tabs: 2.1 };
  const w = r => (r < 10 ? 0 : (r - 10) * 0.45) - (r > 13.6 ? (r - 13.6) * 1.5 : 0);              // the dish: flat middle, rim up
  const shape = (x, y, z) => { const r = len2(x, y); return Math.max(r - RP, Math.abs(z - w(r)) - 0.75); };
  const nshape = (x, y, z) => { const r = len2(x, y); return z - w(r) - (r > 10.3 && r < 13.8 ? 0.55 * Math.sin(angOf(x, y) * 26) : 0); };
  const paint = (x, y, z) => {
    const r = len2(x, y), b = bandAt(x, y, A, O), pc = plateCol(x, y, AF);
    if (b === 'hole') return dcell(x, y, null, pc || 'void');
    if (z > w(r) && Math.abs(y - 0.3) < 1.4 && Math.abs(Math.abs(x) - 13.4) < 0.6) return dcell(x, y, 'haze', FAR_RIM);   // staples
    if (b === 'out' || b === 'tab') return dcell(x, y, 'bone', pc || FAR_RIM);
    return dcell(x, y, b === 'bull' ? 'yellow' : 'lime', pc || 'lime', FLATO);
  };
  return pieceGeo(REST.d, tb => {
    // the elastic (ball cells): from the two staples round the back of the bomb, just off the iron
    const SL = tb(-13.4, 0.3, w(13.4) + 0.3), SR = tb(13.4, 0.3, w(13.4) + 0.3), RE = 15.9;
    const nz = v => { const l = len3(v[0], v[1], v[2]) || 1; return v.map(a => a / l); };
    const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const e1 = nz([SR[0] - SL[0], SR[1] - SL[1], SR[2] - SL[2]]), n = nz(cross(SL, SR));
    let e2 = cross(n, e1); if (e2[2] > 0) e2 = e2.map(a => -a);
    const C0 = e1.map(a => a * RE), C1 = e1.map(a => -a * RE), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const band = (x, y, z) => {
      const p = tb(x, y, z), dn = dot(p, n), qx = dot(p, e1), qy = dot(p, e2);
      const arc = qy >= 0 ? len2(dn, len2(qx, qy) - RE) : 1e9;
      return Math.min(arc, seg3(p, SR, C0), seg3(p, SL, C1)) - 1.2;
    };
    return [[[-21, -21, -2, 21, 21, 5], shape, paint, nshape],
      [[-26, -26, -36, 26, 26, 5], band, (x, y) => dcell(x, y, 'red', FAR_LIMB)]];
  });
}

// E. PLATE HELD UP: a real (small) tin plate held in front of the bomb by two stick arms with mittens; too small to cover
// it, the iron shows all round; little legs and shoes dangle under the ball. Unmasked: it drops it, hands up.
function heldPlateGeo() {
  const a = 11.0, O = { tabs: 0.9, tabW: 1.2 };
  const shape = (x, y, z) => Math.max(sdf.hex(x, y) - a, Math.abs(z) - 1);
  const paint = (x, y, z) => {
    const b = bandAt(x, y, a, O), pc = plateCol(x, y, a), rim = sdf.hex(x, y) > a - 1;
    if (z < 0) return b === 'hole' ? null : dcell(x, y, rim ? 'steel' : 'slate', rim ? 'steel' : 'slate', FLATO);
    if (b === 'hole') return dcell(x, y, null, pc || 'void');
    if (b === 'tab') return dcell(x, y, 'void', 'void', FLATO);
    return dcell(x, y, b === 'bull' ? 'yellow' : 'lime', pc || 'lime', FLATO);
  };
  return pieceGeo(REST.e, () => [[[-16, -16, -2, 16, 16, 2], shape, paint]]);
}
// limbs, right side (mirrored): capsules [a, b, r], spheres [c, r], ellipsoid shoes [c, radii]; colour
const LIMBS = {
  hold: [{ a: [13.2, -3.5, 3], b: [19.6, -6.4, 9.5], r: 0.95, col: 'walnut' }, { a: [19.6, -6.4, 9.5], b: [15.4, 0.4, 16.8], r: 0.95, col: 'walnut' },
    { a: [14.0, 1.6, 18.8], r: 2.3, col: 'bone' }, { a: [12.6, 3.3, 20.2], r: 1.05, col: 'bone' },
    { a: [4.6, -13.6, 3.5], b: [6.3, -18.2, 7.4], r: 0.95, col: 'walnut' }, { a: [6.3, -18.2, 7.4], b: [6.7, -22, 6.8], r: 0.95, col: 'walnut' },
    { a: [7.3, -23.3, 8.6], e: [2.4, 1.6, 3.4], col: 'crimson' }],
  up: [{ a: [13.2, -1.5, 2], b: [19.8, 5, 4], r: 0.95, col: 'walnut' }, { a: [19.8, 5, 4], b: [18.8, 13.2, 4.6], r: 0.95, col: 'walnut' },
    { a: [18.6, 15.6, 5], r: 2.5, col: 'bone' }, { a: [16.6, 17.9, 5.2], r: 1.0, col: 'bone' }, { a: [18.8, 18.7, 5.2], r: 1.0, col: 'bone' },
    { a: [20.9, 17.3, 5.2], r: 1.0, col: 'bone' },
    { a: [4.6, -13.6, 3.5], b: [9.2, -17.8, 6.6], r: 0.95, col: 'walnut' }, { a: [9.2, -17.8, 6.6], b: [12.2, -20.4, 6.2], r: 0.95, col: 'walnut' },
    { a: [13.6, -21.4, 7.6], e: [2.4, 1.6, 3.4], col: 'crimson' }]
};
function limbsGeo(pose) {
  const L = LIMBS[pose];
  const dist = (q, x, y, z) => q.e ? (len3((x - q.a[0]) / q.e[0], (y - q.a[1]) / q.e[1], (z - q.a[2]) / q.e[2]) - 1) * 1.6
    : q.b ? sdf.capsule(x, y, z, q.a, q.b, q.r) : sdf.sphere(x, y, z, q.a[0], q.a[1], q.a[2], q.r);
  const near = (x, y, z) => { let d = 1e9, best = null; for (const q of L) { const e = dist(q, Math.abs(x), y, z); if (e < d) { d = e; best = q; } } return [d, best]; };
  const shape = (x, y, z) => near(x, y, z)[0];
  const paint = (x, y, z) => { const q = near(x, y, z)[1];
    return dcell(x, y, q.e && y < q.a[1] - 0.7 ? 'oxblood' : q.col, FAR_LIMB); };        // shoes: oxblood soles
  return pieceGeo(REST.l, () => [[[-26, -27, -2, 26, 22, 24], shape, paint]]);
}

// F. CRAYON DRAWING on a scrap of torn cardboard: a lopsided hex, THREE rings (cut out), 'TARGET' scrawled under it in
// blue crayon, stuck on with one strip of masking tape over the top
const SCRAP = [[-17.2, -15.4], [-9, -17.6], [-3.5, -16.4], [4, -18.4], [11, -16.9], [18.2, -17.6], [17.4, -8], [18.8, 3.5],
  [17.2, 12], [16.4, 18.2], [6, 17.4], [-2, 18.9], [-10.5, 17.2], [-18.4, 16.1], [-17, 6.5], [-18.6, -4]].reverse();   // ccw
function scrapGeo() {
  const HC = [0.4, 3.0], A = 12, MUL = [1.1, 0.9, 1.04, 0.86, 1.12, 0.95], JIT = [0.08, -0.05, 0.1, -0.07, 0.03, -0.1];
  const HX = MUL.map((m, k) => { const th = k * Math.PI / 3 + JIT[k], r = A / 0.866 * m; return [HC[0] + Math.cos(th) * r, HC[1] + Math.sin(th) * r]; });
  const FR = [[2.6, 'bull'], [4.1, 'hole'], [5.7, 'lime'], [7.2, 'hole'], [8.6, 'lime'], [9.9, 'hole']];   // 3 rings: wrong
  const txt = new Set(), DY = [0, -1, 1, 0, 1, 0];
  for (const [gx, gy] of R.small('TARGET').px) txt.add(Math.floor(-11.6 + gx) + ',' + Math.floor(-10.9 - gy + DY[(gx / 4) | 0]));
  const sd = (x, y) => polyD(x, y, SCRAP) + 0.5 * tri(x * 0.7 + y * 0.45) - 0.25;           // torn, fluffy edge
  const shape = (x, y, z) => Math.max(sd(x, y), Math.abs(z) - 1);
  const paint = (x, y, z) => {
    const u = x - HC[0], v = y - HC[1], pc = plateCol(u, v, A), far = pc || FAR_PAPER, s = sd(x, y);
    if (z < 0) return dcell(x, y, 'chestnut', far);
    if (s > -1.1) return dcell(x, y, 'sand', far);                                              // torn edge: the fluffy layer
    const inHex = polyD(x, y, HX), ang = angOf(u, v), rc = len2(u, v);
    if (inHex > 0) return dcell(x, y, txt.has(Math.floor(x) + ',' + Math.floor(y)) ? 'blue' : 'tan', far, txt.has(Math.floor(x) + ',' + Math.floor(y)) ? FLATO : null);
    const r = rc / (1 + 0.07 * Math.sin(2 * ang + 1) + 0.05 * Math.sin(3 * ang));
    let b = 'border';
    for (let n = 0; n < FR.length; n++) if (r < FR[n][0]) { b = FR[n][1]; if (b === 'hole' && tabAt(ang, rc, n, { tabs: 0.3, tabW: 1.2 })) b = 'tab'; break; }
    if (b === 'hole') return dcell(x, y, null, pc || 'void');
    const skip = hash3(Math.floor(x), Math.floor(y), 3) < 0.18;
    if (b === 'tab' || skip) return dcell(x, y, 'tan', far);
    if (b === 'bull') return dcell(x, y, r > 1.8 ? 'orange' : 'yellow', far, FLATO);
    if (-inHex < 1.3 || tri((u * 0.8 + v * 0.6) / 1.4 + 0.4 * tri(v * 0.21 + u * 0.05)) < 0.5) return dcell(x, y, 'lime', far, FLATO);
    return dcell(x, y, 'tan', far);
  };
  const tape = [[-22, -22, -11, 22, 22, 4], (x, y, z) => {
    if (Math.abs(x - 1) > 2.4 || y < 13.6 + 1.3 * hash3(Math.floor(x + 20), 5, 1)) return 1;
    return lineD(y, z, [[13.6, 1.6], [19.8, 1.6], [19.8, -1.6], [14.8, -8.2]]) - 0.7;
  }, (x, y) => dcell(x, y, 'mist', y < 17 ? plateCol(x - HC[0], y - HC[1], A) || FAR_PAPER : FAR_PAPER), (x, y, z) => z - 1.6];
  return pieceGeo(REST.f, () => [[[-21, -21, -2, 21, 21, 2], shape, paint], tape]);
}

// A. the sloppy-paint decoy unmasking: its strokes come off the ball as FLAKES, 6 curved shell pieces (own meshes, only
// shown while it unmasks), the ball swaps to the plain bomb under them
function flakeGeos() {
  const B0 = Math.ceil(BR) + 1, maps = Array.from({ length: 6 }, () => new Map()), cen = maps.map(() => [0, 0, 0, 0]);
  for (let i = -B0; i < B0; i++) for (let j = -B0; j < B0; j++) for (let k = -1; k < B0; k++) {
    const x = i + 0.5, y = j + 0.5, z = k + 0.5, r = len3(x, y, z);
    if (r > BR || r < BR - 1.3) continue;
    const s = decoyStroke(x, y, z); if (!s || s % 64 >= 0.62) continue;
    const n = Math.floor(angOf(x, y) / (TAU / 6)) % 6;
    maps[n].set(VK(i, j, k), { i, j, k, col: s >= 128 ? 'yellow' : 'lime', flat: true });
    cen[n][0] += x; cen[n][1] += y; cen[n][2] += z; cen[n][3]++;
  }
  return maps.map((m, n) => {
    const c = cen[n].slice(0, 3).map(v => v / Math.max(1, cen[n][3])), l = len3(c[0], c[1], c[2]) || 1;
    return { g: new Geo(1).voxels(m, SB, c[0], c[1], c[2]).geometry(), p: c.map(v => v * SB * 1.035), dir: [c[0] / l, c[1] / l, c[2] / l] };
  });
}

// ---------- unmask(k): k 0 = disguised .. 1 = the bare bomb, the disguise thrown clear. Pure in k (idempotent, can go back) ----------
// A piece's pose = its rest pose + offsets (world units / rad, face space). fl = the floor in face space.
function place(m, dx, dy, dz, rx, ry, rz) {
  const p = m.userData.p0, r = m.userData.r0;
  m.position.set(p.x + dx, p.y + dy, p.z + dz); m.rotation.set(r.x + rx, r.y + ry, r.z + rz);
}
const UNMASK = {
  a(p, k) {                                                           // the paint flakes off
    p.face.geometry = k > 0 ? geo('bombF', () => ballGeo(null, true)) : geo('decoyF', () => ballGeo(decoyStroke, true));
    p.flakes.forEach((m, n) => {
      m.visible = k > 0;
      const d = m.userData.dir, q = m.userData.p0;
      m.position.set(q.x + d[0] * 0.7 * k, q.y + d[1] * 0.7 * k + 0.35 * k - 1.6 * k * k, q.z + 0.5 * k);
      m.rotation.set(k * (3 + n), k * (2.5 - n * 0.8), k * (n - 2.5) * 1.6); m.scale.setScalar(1 - 0.3 * k);
    });
  },
  b(p, k) {                                                           // the bag puffs up and blows off upward, spinning
    const m = p.dsg[0], puff = 1 + 0.2 * Math.sin(Math.PI * Math.min(1, k / 0.35));
    place(m, 0.7 * k, 2.6 * k, 0.25 * k, 0.5 * k, 0.4 * k, -1.4 * k); m.scale.set(puff, 1 - (puff - 1) * 0.5, puff);
  },
  c(p, k, fl) {                                                       // the tape rips, the cardboard flips off and lands flat
    const m = p.dsg[0], y0 = m.userData.p0.y;
    place(m, 1.05 * k, 1.4 * k * (1 - k) + (fl + 0.05 - y0) * k * k, 0.2 * k, -(Math.PI / 2 + TAU) * k, -0.9 * Math.min(1, k / 0.3), 0.6 * k);
  },
  d(p, k, fl) {                                                       // the elastic snaps: the mask drops, spinning, lands flat
    const m = p.dsg[0], y0 = m.userData.p0.y;
    place(m, -0.35 * k, (fl + 0.05 - y0) * Math.pow(k, 1.6), 0.3 * k, -Math.PI / 2 * k, -0.2 * k, 1.8 * k);
  },
  e(p, k, fl) {                                                       // it drops the plate and throws its hands up
    const m = p.dsg[0], y0 = m.userData.p0.y;
    place(m, 0.1 * k, (fl + 0.05 - y0) * Math.pow(k, 1.5), 0.35 * k, -Math.PI / 2 * k, 0, 0.5 * k);
    p.dsg[1].geometry = geo(k > 0.2 ? 'dsgEup' : 'dsgEhold', () => limbsGeo(k > 0.2 ? 'up' : 'hold'));
  },
  f(p, k, fl) {                                                       // the drawing flutters away to the side
    const m = p.dsg[0], y0 = m.userData.p0.y;
    place(m, 1.3 * k + 0.18 * Math.sin(k * 10), 0.5 * Math.sin(Math.PI * k) + (fl + 0.05 - y0) * k * k, 0.25 * k,
      -Math.PI / 2 * k * k, 5 * k, 0.5 * Math.sin(k * 12));
  }
};
// variant table: name, disguise pieces [geometry key, builder, rest, hittable]
const DECOY_NAMES = { a: 'SLOPPY PAINT', b: 'LUNCH BAG', c: 'CARDBOARD', d: 'PAPER PLATE', e: 'HELD UP', f: 'CRAYON' };
const DSG = {
  b: [['dsgB', bagGeo, REST.b, true]],
  c: [['dsgC', boxGeo, REST.c, true]],
  d: [['dsgD', maskGeo, REST.d, true]],
  e: [['dsgE', heldPlateGeo, REST.e, true], ['dsgEhold', () => limbsGeo('hold'), REST.l, false]],
  f: [['dsgF', scrapGeo, REST.f, true]]
};
const DECOY_VARIANTS = ['a'];                                         // enabled variants (B.Props.DECOY_VARIANTS; the game sets it)
function rayUnlessOff(r, i) { if (!this.userData.off) THREE.Mesh.prototype.raycast.call(this, r, i); }
function decoyVariant(o) {
  const v = String(o.variant || '').toLowerCase();
  if (v.length === 1 && DECOY_NAMES[v]) return v;
  const L = ((B.Props && B.Props.DECOY_VARIANTS) || DECOY_VARIANTS).map(s => String(s).toLowerCase()).filter(s => s.length === 1 && DECOY_NAMES[s]);
  return L.length ? L[(Math.random() * L.length) | 0] : 'a';
}

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
    if (this.dsgHit) for (const m of this.dsgHit) t.part(m, [], CS);    // decoy disguise: shooting it = shooting the bomb
    if (!this.face2) return [a];
    this.face2.userData.target = t;
    return [a, { mesh: this.face2, list: this.chips2, s: CS, ox: 0, oy: 0, oz: 0 }];
  }
  show() { this.face.visible = true; if (this.face2) this.face2.visible = false; if (this.spark) this.spark.visible = true; }
  hide() { this.face.visible = false; if (this.face2) this.face2.visible = false; }
  setFuse(f) {
    if (!this.spark) return; f = Math.max(0, Math.min(1, f)); this.fuseF = f;
    const k = this.fuse ? Math.max(0.08, f) : 1, T = this.tip || FUSE_TIP;
    if (this.fuse) this.fuse.scale.setScalar(k);
    this.spark.position.set((F0[0] + T[0] * k) * SB, (F0[1] + T[1] * k) * SB, (F0[2] + T[2] * k) * SB);
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
  // decoys: k 0 = disguised .. 1 = the bare bomb, its disguise thrown clear (see UNMASK). Cheap, pure in k, can go back to 0
  unmask(k) {
    if (!this.variant) return;
    k = k > 0 ? Math.min(1, k) : 0;
    if (k === this.mk) return; this.mk = k;
    UNMASK[this.variant](this, k, this.floor != null ? this.floor : this.hang ? -2.75 : -(FACE_Y + PIVOT_Y));   // floor: face space
    if (this.dsg) for (const m of this.dsg) m.userData.off = k > 0;   // a thrown-off disguise is not a hit part any more
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
  const v = decoyVariant(o), p = new Prop(o, 'bomb', true);
  p.decoy = true; p.variant = v; p.mk = 0;
  if (v === 'a') {                                     // A: the sloppy-paint bomb (unchanged), + its flakes for unmask()
    p.face = p.addFace(shared(geo('decoyF', () => ballGeo(decoyStroke, true)), mat));
    p.chips = geo('chipsD', () => ballChips(decoyChip));
    p.addFuse(false);
    p.flakes = geo('flakesA', flakeGeos).map(f => {
      const m = noRay(shared(f.g, mat)); m.position.set(f.p[0], f.p[1], f.p[2]);
      m.userData.p0 = m.position.clone(); m.userData.dir = f.dir; m.visible = false; p.face.add(m); return m;
    });
    return p;
  }
  p.face = p.addFace(shared(geo('bombL', () => ballGeo(null, true, true)), mat));   // B-F: a plain bomb, long fuse
  p.chips = geo('chipsB', () => ballChips(skullChip));
  p.tip = FUSE_TIP_L; p.addFuse(false);
  p.dsg = DSG[v].map(([key, build, rest, hit]) => {   // the disguise rides on the ball (wobbles / flips / hides with it)
    const m = shared(geo(key, build), mat);
    m.position.set(rest[0][0] * SB, rest[0][1] * SB, rest[0][2] * SB); m.rotation.set(rest[1][0], rest[1][1], rest[1][2]);
    m.userData.p0 = m.position.clone(); m.userData.r0 = m.rotation.clone();
    if (hit) m.raycast = rayUnlessOff; else noRay(m);
    p.face.add(m); return m;
  });
  p.dsgHit = p.dsg.filter((m, n) => DSG[v][n][3]);
  return p;
}
function flipbomb(o = {}) {
  const p = bomb(Object.assign({}, o, { burn: true })), [face2, chips2] = plateFace(p, o.color);
  p.face2 = p.addFace(face2); p.face2.visible = false; p.chips2 = chips2;
  return p;
}
// build every shared geometry now (a first bomb mid-stage must not cost a frame)
// which: omitted = the decoy variants in DECOY_VARIANTS, 'all' = all six, or an array of letters. Call it again after
// changing DECOY_VARIANTS (a variant's first build is ~10-40 ms of voxelising)
function warm(which) {
  [paddle(), bomb(), decoy({ variant: 'a' }), flipbomb(), paddle({ hang: true }), bomb({ hang: true }), paddle({ slot: true })].forEach(() => {});
  const L = which === 'all' || which === true ? Object.keys(DECOY_NAMES) : Array.isArray(which) ? which : (B.Props.DECOY_VARIANTS || []);
  for (const v of L) { const p = decoy({ variant: v }); p.unmask(1); p.unmask(0); }   // also every geometry unmask() swaps to
}
B.Props = { paddle, bomb, decoy, flipbomb, warm, mat, Geo, sdf, cspec, SCHEMES, FACE_Y, PIVOT_Y, PADDLE_R, PLATE_A, BOMB_R, POST_Z, CHIP_S: CS,
  DECOY_VARIANTS, DECOY_NAMES };
})(window.BLAM);
