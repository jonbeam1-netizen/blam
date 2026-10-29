'use strict';
/* =========================================================================================
   B.L.A.M. core/render.js  --  the pixel pipeline (lifted from looktest.html, see STYLE.md §3)
   3D scene -> 426x240 render target -> palette snap + Bayer dither (+ HUD composite)
   -> NEAREST blit into a letterboxed 16:9 rect.  Around it, an "outer" canvas (the pillar
   frame, and in portrait the HUD strip) is drawn on its own chunky pixel grid.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
if (!window.THREE) { const b = document.getElementById('boot'); if (b) b.textContent = 'COULD NOT LOAD THREE.JS'; throw new Error('three.js missing'); }

const RW = 426, RH = 240, FOV = 50, ASPECT = RW / RH, TAN_H = Math.tan(FOV * Math.PI / 360);
const CAM_POS = new THREE.Vector3(0, 1.9, 5), CAM_PITCH = -0.08;

// ---------- palette "BLAM-34" ----------
const PAL = {
  void:0x0b0b1a, midnight:0x1a1c3a, navy:0x2b2f5c, slate:0x3f4880, steel:0x5a6aa8, haze:0x8c9ccc, mist:0xc8d0e8, bone:0xf4f4f0,
  indigo:0x3a1a6a, umber:0x2e1c1c, walnut:0x4e2e24, chestnut:0x7a4a2c, tan:0xa8703a, sand:0xd4a060,
  oxblood:0x5c0f24, crimson:0xa01830, red:0xe82838, coral:0xff6a5a,
  plum:0x6a0f5a, magenta:0xc0187a, pink:0xff3aa0, bubblegum:0xff9ad0,
  rust:0xc84a10, orange:0xff7a1a, amber:0xffb020, yellow:0xffe040, lemon:0xfff8a0,
  deepblue:0x0a2a8a, blue:0x1a5aff, cyan:0x20d0ff, ice:0xa0f4ff,
  forest:0x0a4a2a, green:0x1a9a3a, lime:0x7ae830
};
const PAL_LIST = Object.values(PAL);
const CSS = {}; for (const k in PAL) CSS[k] = '#' + PAL[k].toString(16).padStart(6, '0');

// ---------- pixel fonts ----------
// 3x5: 5 rows, each one octal digit (4 = left pixel, 2 = middle, 1 = right)
const F3 = {A:'25755',B:'65656',C:'34443',D:'65556',E:'74647',F:'74644',G:'34553',H:'55755',I:'72227',J:'11152',
  K:'55655',L:'44447',M:'57755',N:'65555',O:'25552',P:'65644',Q:'25563',R:'65655',S:'34216',T:'72222',U:'55557',
  V:'55552',W:'55775',X:'55255',Y:'55222',Z:'71247','0':'75557','1':'26227','2':'61247','3':'61216','4':'55711',
  '5':'74616','6':'34652','7':'71222','8':'25252','9':'25316','!':'22202','.':'00002',':':'02020','-':'00700',
  '/':'11244','?':'61202','+':'02720',' ':'00000','<':'12421','>':'42124','(':'12221',')':'42224',',':'00012',
  '%':'51245',"'":'22000','=':'07070','*':'05250','#':'57575','_':'00007','"':'55000','[':'64446',']':'31113'};
// bold 7-row display font: hand-made glyphs from the look test, the rest generated from a 5x7 font
// by doubling every pixel to the right (2-pixel vertical strokes, same look)
const F7 = {B:{w:6,r:[62,51,51,62,51,51,62]}, L:{w:6,r:[48,48,48,48,48,63,63]}, A:{w:6,r:[30,51,51,63,51,51,51]},
  M:{w:7,r:[99,119,127,107,99,99,99]}, W:{w:7,r:[99,99,99,107,127,119,99]},   // W hand-made like M: the doubled 5x7 one read as V ("VINNER!")
  H:{w:6,r:[51,51,51,63,51,51,51]}, I:{w:6,r:[63,12,12,12,12,12,63]},
  T:{w:6,r:[63,63,12,12,12,12,12]}, '!':{w:2,r:[3,3,3,3,3,0,3]}, '.':{w:2,r:[0,0,0,0,0,3,3]},
  ':':{w:2,r:[0,3,3,0,3,3,0]}, "'":{w:2,r:[3,3,2,0,0,0,0]}, ',':{w:2,r:[0,0,0,0,3,3,2]}};
const F5 = {C:[14,17,16,16,16,17,14],D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],
  G:[14,17,16,23,17,17,15],J:[7,2,2,2,2,18,12],K:[17,18,20,24,20,18,17],N:[17,17,25,21,19,17,17],O:[14,17,17,17,17,17,14],
  P:[30,17,17,30,16,16,16],Q:[14,17,17,17,21,18,13],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],U:[17,17,17,17,17,17,14],
  V:[17,17,17,17,17,10,4],W:[17,17,17,21,21,21,10],X:[17,17,10,4,10,17,17],Y:[17,17,17,10,4,4,4],Z:[31,1,2,4,8,16,31],
  '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[31,2,4,2,1,17,14],'4':[2,6,10,18,31,2,2],
  '5':[31,16,30,1,1,17,14],'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],
  '?':[14,17,1,2,4,0,4],'-':[0,0,0,31,0,0,0],'/':[1,1,2,4,8,16,16],'%':[24,25,2,4,8,19,3],'+':[0,4,4,31,4,4,0]};
function g7(ch) {
  if (F7[ch]) return F7[ch];
  const r = F5[ch]; if (!r) return null;
  return (F7[ch] = { w: 6, r: r.map(v => ((v << 1) | v) & 63) });
}
function bold(str) {                           // -> { px: [[x, y, charIndex]...], w }
  const px = []; let cx = 0;
  [...str].forEach((ch, ci) => { const g = g7(ch); if (!g) { cx += 4; return; }
    for (let y = 0; y < 7; y++) for (let x = 0; x < g.w; x++) if ((g.r[y] >> (g.w - 1 - x)) & 1) px.push([cx + x, y, ci]);
    cx += g.w + 1; });
  return { px, w: Math.max(0, cx - 1) };
}
function small(str) {                          // 3x5 text as a pixel list (voxel lettering in the scene)
  const px = []; let cx = 0;
  for (const ch of str) { const g = F3[ch] || F3[' '];
    for (let y = 0; y < 5; y++) { const row = +g[y]; for (let x = 0; x < 3; x++) if ((row >> (2 - x)) & 1) px.push([cx + x, y]); }
    cx += 4; }
  return { px, w: Math.max(0, cx - 1) };
}

// ---------- voxel builder: many boxes -> ONE BufferGeometry with vertex colours ----------
const FACES = [
  [1,0,0, [1,-1,1, 1,-1,-1, 1,1,-1, 1,1,1]], [-1,0,0, [-1,-1,-1, -1,-1,1, -1,1,1, -1,1,-1]],
  [0,1,0, [-1,1,1, 1,1,1, 1,1,-1, -1,1,-1]], [0,-1,0, [-1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,1]],
  [0,0,1, [-1,-1,1, 1,-1,1, 1,1,1, -1,1,1]], [0,0,-1, [1,-1,-1, -1,-1,-1, -1,1,-1, 1,1,-1]]];
const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
class Vox {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.vc = 0; this.bake = null; this.shade = null; }
  box(x, y, z, w, h, d, col, m, mask = 63) {
    _c.set(col);
    for (let f = 0; f < 6; f++) {
      if (!((mask >> f) & 1)) continue;
      const F = FACES[f], q = F[3];
      _n.set(F[0], F[1], F[2]); if (m) _n.transformDirection(m);
      for (let k = 0; k < 12; k += 3) {
        _v.set(x + q[k] * w / 2, y + q[k + 1] * h / 2, z + q[k + 2] * d / 2); if (m) _v.applyMatrix4(m);
        const L = (this.bake ? this.bake(_v.x, _v.y, _v.z) : 1) * (this.shade ? this.shade[f] : 1);
        this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z); this.c.push(_c.r * L, _c.g * L, _c.b * L);
      }
      const v = this.vc; this.i.push(v, v + 1, v + 2, v, v + 2, v + 3); this.vc += 4;
    }
    return this;
  }
  bx(x0, y0, z0, x1, y1, z1, col, m, mask) { return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col, m, mask); }
  vox(list, s, ox = 0, oy = 0, oz = 0, m) {     // voxel list [[i,j,k,col]...]; faces between neighbours are culled
    const S = new Set(list.map(v => v[0] + ',' + v[1] + ',' + v[2]));
    for (const [i, j, k, col] of list) {
      let mask = 0;
      for (let f = 0; f < 6; f++) { const F = FACES[f]; if (!S.has((i + F[0]) + ',' + (j + F[1]) + ',' + (k + F[2]))) mask |= 1 << f; }
      if (mask) this.box(ox + i * s, oy + j * s, oz + k * s, s, s, s, col, m, mask);
    }
    return this;
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
  mesh(mat) { return new THREE.Mesh(this.geo(), mat); }
}
// Materials. Output ALPHA is the "dither class": 0.5 = environment, 1.0 = object (see STYLE.md §3)
const MAT = {
  env:  new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.NoBlending }),
  obj:  new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
  hot:  new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(1.4, 1.4, 1.4) })   // hover highlight
};
const E = {
  outBack: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outCubic: t => 1 - Math.pow(1 - t, 3), inCubic: t => t * t * t,
  clamp: (x, a, b) => x < a ? a : x > b ? b : x
};
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- renderer + passes ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);                    // we size the drawing buffer in device pixels ourselves
renderer.autoClear = false;
const RT_OPTS = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, generateMipmaps: false, stencilBuffer: false };
const rtScene = new THREE.WebGLRenderTarget(RW, RH, RT_OPTS);
const rtPost  = new THREE.WebGLRenderTarget(RW, RH, Object.assign({ depthBuffer: false }, RT_OPTS));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.midnight, 13, 32);
const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.05, 60);
camera.position.copy(CAM_POS); camera.rotation.x = CAM_PITCH;
scene.add(camera);                            // gun, marquee and the mini duck are camera children
scene.add(new THREE.AmbientLight(0xffffff, 0.42));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.66); keyLight.position.set(0.30, 0.35, 0.89); scene.add(keyLight);
const topLight = new THREE.DirectionalLight(0xffffff, 0.28); topLight.position.set(0, 1, 0); scene.add(topLight);

// HUD canvas on the 426x240 grid, composited AFTER quantisation (never dithered)
function pixCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
const [hud, hx] = pixCanvas(RW, RH);
function nearestTex(cv) { const t = new THREE.CanvasTexture(cv); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; }
const hudTex = nearestTex(hud);

const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const postMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: rtScene.texture }, tHud: { value: hudTex },
              pal: { value: PAL_LIST.map(h => new THREE.Color(h)) }, mode: { value: 1 }, boost: { value: 0 } },
  vertexShader: QUAD_VS,
  fragmentShader: `
    #define NP ${PAL_LIST.length}
    uniform sampler2D tScene; uniform sampler2D tHud; uniform vec3 pal[NP]; uniform int mode; uniform float boost;
    varying vec2 vUv;
    float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
    vec3 nearest(vec3 c){
      vec3 best = pal[0]; float bd = 1e9;
      for (int i = 0; i < NP; i++){
        vec3 d = (c - pal[i]) * vec3(0.95, 1.25, 0.8);
        float e = dot(d, d); if (e < bd){ bd = e; best = pal[i]; } }
      return best; }
    void main(){
      vec4 s = texture2D(tScene, vUv);
      float env = step(s.a, 0.75);
      float th = bayer4(gl_FragCoord.xy) - 0.46875;
      float spread = mode == 1 ? mix(0.045, 0.17, env) : (mode == 2 ? mix(0.19, 0.23, env) : 0.0);
      vec3 o = nearest(clamp(s.rgb * (1.0 + boost) + th * spread, 0.0, 1.0));
      vec4 h = texture2D(tHud, vUv);
      gl_FragColor = vec4(h.a > 0.5 ? h.rgb : o, 1.0);
    }`,
  depthTest: false, depthWrite: false
});
const BLIT_FS = 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }';
const blitMat = new THREE.ShaderMaterial({ uniforms: { t: { value: rtPost.texture } }, vertexShader: QUAD_VS, fragmentShader: BLIT_FS, depthTest: false, depthWrite: false });
const outerMat = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: QUAD_VS, fragmentShader: BLIT_FS, depthTest: false, depthWrite: false });
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postScene = new THREE.Scene(), blitScene = new THREE.Scene(), outerScene = new THREE.Scene();
[[postScene, postMat], [blitScene, blitMat], [outerScene, outerMat]].forEach(([s, m]) => {
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; s.add(q); });

// ---------- letterbox + outer grid ----------
// frame: game rect in device px (x/y bottom-left for GL, top = from the top), css rect for input,
// s = device px per game px; outer: the pillar-frame canvas grid (g device px per outer px)
const frame = { x: 0, y: 0, top: 0, w: RW, h: RH, W: RW, H: RH, dpr: 1, s: 1, cssX: 0, cssY: 0, cssW: RW, cssH: RH, portrait: false,
  outer: { g: 1, OW: 1, OH: 1, gx: 0, gy: 0, gw: RW, gh: RH, hudScale: 1 } };
let outerCv = null, outerX = null, outerTex = null;
const resizeHooks = [];
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = window.innerWidth, ch = window.innerHeight;
  const W = Math.max(1, Math.round(cw * dpr)), H = Math.max(1, Math.round(ch * dpr));
  view.style.width = cw + 'px'; view.style.height = ch + 'px';
  renderer.setSize(W, H, false);
  let s = Math.min(W / RW, H / RH);
  if (s >= 2 && Math.floor(s) / s > 0.8) s = Math.floor(s);
  const w = Math.round(RW * s), h = Math.round(RH * s);
  const portrait = ch > cw * 1.05;
  const x = Math.floor((W - w) / 2);
  const top = portrait ? Math.floor((H - h) * 0.42) : Math.floor((H - h) / 2);   // portrait: a bit high, more room for the HUD strip below
  Object.assign(frame, { W, H, dpr, s, w, h, x, top, y: H - top - h, portrait });
  frame.cssX = x / dpr; frame.cssY = top / dpr; frame.cssW = w / dpr; frame.cssH = h / dpr;
  // outer grid: same pixel size as the game, one notch chunkier in portrait if the game pixels are < 1.5 CSS px
  let k = 1; if (portrait) while (s * k / dpr < 1.5 && k < 4) k++;
  const g = s * k, OW = Math.ceil(W / g), OH = Math.ceil(H / g);
  Object.assign(frame.outer, { g, OW, OH, gx: x / g, gy: top / g, gw: w / g, gh: h / g, hudScale: k });
  if (!outerCv || outerCv.width !== OW || outerCv.height !== OH) {
    [outerCv, outerX] = pixCanvas(OW, OH);
    if (outerTex) outerTex.dispose();
    outerTex = nearestTex(outerCv); outerMat.uniforms.t.value = outerTex;
    B.R.outer = outerCv; B.R.ox = outerX;
  }
  B.R.outerDirty = true;
  resizeHooks.forEach(f => { try { f(frame); } catch (e) { console.error(e); } });
}

function render() {
  renderer.setRenderTarget(rtScene);
  renderer.setClearColor(PAL.midnight, 0.5); renderer.clear(); renderer.render(scene, camera);
  hudTex.needsUpdate = true;
  renderer.setRenderTarget(rtPost); renderer.render(postScene, orthoCam);
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, frame.W, frame.H); renderer.setClearColor(0x05050c, 1); renderer.clear();
  const o = frame.outer;
  if (B.R.outerDirty) { outerTex.needsUpdate = true; B.R.outerDirty = false; }
  renderer.setViewport(0, frame.H - o.OH * o.g, o.OW * o.g, o.OH * o.g); renderer.render(outerScene, orthoCam);
  renderer.setViewport(frame.x, frame.y, frame.w, frame.h); renderer.render(blitScene, orthoCam);
}

// ---------- helpers ----------
const MODE_NAMES = ['', 'LIGHT DITHER', 'FULL DITHER', 'FLAT SNAP'];
function setMode(m) { postMat.uniforms.mode.value = m; B.R.mode = m; }
function setDither(on) { setMode(on ? 1 : 3); }
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), _hp = new THREE.Vector3();
function steadyCamera() { camera.position.copy(CAM_POS); camera.rotation.set(CAM_PITCH, 0, 0); camera.updateMatrixWorld(true); }
function rayAt(u, v) { _ndc.set(u * 2 - 1, 1 - v * 2); _ray.setFromCamera(_ndc, camera); return _ray; }
// world point on the plane z = zPlane under the screen point (u, v)  (layout in screen terms)
function screenToWorld(u, v, zPlane, out) {
  const r = rayAt(u, v); _plane.constant = -zPlane;
  return r.ray.intersectPlane(_plane, out || new THREE.Vector3()) || (out || new THREE.Vector3()).set(0, 0, zPlane);
}
// camera-local point at depth d under the screen point (u, v)  (for camera children)
function screenToCam(u, v, d, out) {
  return (out || new THREE.Vector3()).set((u * 2 - 1) * TAN_H * ASPECT * d, (1 - v * 2) * TAN_H * d, -d);
}
function toPx(p) { _hp.copy(p).project(camera); return [Math.round((_hp.x + 1) / 2 * RW), Math.round((1 - _hp.y) / 2 * RH)]; }

B.R = { RW, RH, FOV, ASPECT, TAN_H, CAM_POS, CAM_PITCH, PAL, PAL_LIST, CSS, F3, F7, g7, bold, small, Vox, MAT, E, rnd,
  view, renderer, scene, camera, hud, hx, hudTex, postMat, frame, resize, render, resizeHooks, pixCanvas, nearestTex,
  setMode, setDither, MODE_NAMES, mode: 1, steadyCamera, rayAt, screenToWorld, screenToCam, toPx,
  outer: null, ox: null, outerDirty: true };
window.addEventListener('resize', resize);
if (window.visualViewport) visualViewport.addEventListener('resize', resize);
resize();
})(window.BLAM);
