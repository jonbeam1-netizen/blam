'use strict';
/* =========================================================================================
   B.L.A.M. core/fx.js -- cosmetic shot effects (no rules, no timing: every shot stays hitscan).
   - TRACERS (#76): a pooled ribbon strip (ONE mesh, one draw call, camera child) that flies from the gun's
     muzzle to the hit point in ~55-70 ms. The look per gun skin is data in js/guns.js (BLAM.Guns.TRACERS);
     DEFAULT_LOOK below is used for the placeholder gun and the versus rival (their skin isn't synced).
     Each look: { T (s of flight), fade (s after arrival, optional), wave {amp, wl, speed} (px, optional),
       layers: [{ len (px, Infinity = a beam from the muzzle), w (px), cols: [palette names, flight -> fade] }],
       impact: null | 'zap' | 'puff' }   (layers are drawn outer -> inner; px are 426x240 game pixels)
     The head moves linearly in SCREEN space (perspective-correct param), so every tracer reads the same speed.
   - RICOCHET (#86): a hard ricochet burst on an environment miss, oriented along the surface normal.
     Colour sets by stage id: B.FX.ricochetColors[stageId] (a stage may set its own), default = white-hot steel.
   API: FX.shot(ray) -> tracer (origin = projected muzzle, or the bottom edge when the gun is off screen)
        FX.land(tracer, worldPoint | null)   (null = nothing hit: fly to the far point)
        FX.rivalShot(by, worldPoint)   FX.ricochet(point, normal, inDir, stageId)   FX.update(dt) (from Tg.updateChips)
        FX.timeScale (dev: 0.02 freezes a tracer for a screenshot)
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, Tg = B.Targets, rnd = R.rnd, RW = R.RW, RH = R.RH, TAN_H = R.TAN_H, ASPECT = R.ASPECT;

// the steady camera's view matrix (shots are taken with the camera steady; the strip is a camera child)
const STEADY_INV = (() => { const o = new THREE.Object3D(); o.position.copy(R.CAM_POS); o.rotation.x = R.CAM_PITCH; o.updateMatrixWorld(true); return o.matrixWorld.clone().invert(); })();
const STEADY = STEADY_INV.clone().invert();
const toCam = (w, out) => out.copy(w).applyMatrix4(STEADY_INV);
const camUV = p => { const z = Math.max(1e-4, -p.z); return [0.5 + p.x / z / (TAN_H * ASPECT) / 2, 0.5 - p.y / z / TAN_H / 2]; };
const pxUnit = depth => 2 * TAN_H * Math.max(0.05, depth) / RH;      // camera units per game pixel at that depth

const DEFAULT_LOOK = { T: 0.06, layers: [{ len: 16, w: 1, cols: ['sand', 'tan'] }, { len: 6, w: 3.5, cols: ['amber'] }, { len: 3, w: 2, cols: ['lemon'] }] };

// ---------- the strip: MAXQ quads, rebuilt each frame while anything flies ----------
const MAXQ = 640;
const pos = new Float32Array(MAXQ * 12), col = new Float32Array(MAXQ * 12), idx = new Uint16Array(MAXQ * 6);
for (let q = 0; q < MAXQ; q++) { const v = q * 4; idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6); }
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
geo.setIndex(new THREE.BufferAttribute(idx, 1));
// unlit flat palette colours, object dither class (opacity 1 -> alpha 1): bright tracers stay clean through the post pass.
// transparent so it sorts into the transparent pass AFTER the env meshes (MAT.env is transparent with NoBlending and would
// paint over a non-depth-writing opaque strip); depthWrite off so the layers of one tracer stack without z-fighting
const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }));
mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false; mesh.name = 'fx-tracers';
R.camera.add(mesh);

const MAXT = 24, live = [];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3(),
  _w = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
let nq = 0;
function quad(p0, p1, s0, s1, h0, h1, hex) {             // p0/p1 centre points, s side unit vectors, h half widths (camera units)
  if (nq >= MAXQ) return;
  const o = nq * 12;
  pos[o] = p0.x - s0.x * h0; pos[o + 1] = p0.y - s0.y * h0; pos[o + 2] = p0.z - s0.z * h0;
  pos[o + 3] = p0.x + s0.x * h0; pos[o + 4] = p0.y + s0.y * h0; pos[o + 5] = p0.z + s0.z * h0;
  pos[o + 6] = p1.x + s1.x * h1; pos[o + 7] = p1.y + s1.y * h1; pos[o + 8] = p1.z + s1.z * h1;
  pos[o + 9] = p1.x - s1.x * h1; pos[o + 10] = p1.y - s1.y * h1; pos[o + 11] = p1.z - s1.z * h1;
  _c.setHex(hex); for (let k = 0; k < 12; k += 3) { col[o + k] = _c.r; col[o + k + 1] = _c.g; col[o + k + 2] = _c.b; }
  nq++;
}

// ---------- spawning ----------
function lookOf(gun) {
  try { if (gun && gun.tracerLook) return gun.tracerLook() || DEFAULT_LOOK; } catch (e) {}
  const T = B.Guns && B.Guns.TRACERS, id = gun && gun.skinId;
  return (T && id && T[id]) || DEFAULT_LOOK;
}
function make(aCam, look) {
  if (live.length >= MAXT) live.shift();
  const t = { a: aCam.clone(), b: null, bW: null, age: 0, look, landed: false, hit: false, impactDone: false, rayO: null, rayD: null };
  live.push(t); return t;
}
// cam-space origin for a local shot: the projected muzzle while it is on screen, else the bottom edge under the aim
function localOrigin(ray, out) {
  const g = B.G && B.G.gun;
  let ok = false;
  try {
    if (g && g.group && g.group.visible && g.muzzlePoint) { const m = g.muzzlePoint(_w); if (m) { toCam(m, out); ok = true; } }
    else if (g && g.muzzleWorldPos && g.group && g.group.visible) { toCam(g.muzzleWorldPos(_w), out); ok = true; }
  } catch (e) { ok = false; }
  if (ok) { const [u, v] = camUV(out); if (out.z > -0.05 || u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) ok = false; }
  if (!ok) {
    toCam(_w.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 10), _p);
    const [u] = camUV(_p);
    R.screenToCam(0.5 + (u - 0.5) * 0.5, 1.06, 1.0, out);
  }
  return out;
}
function shot(ray, opts) {
  opts = opts || {};
  const t = make(localOrigin(ray, _a), opts.look || lookOf(B.G && B.G.gun));
  t.rayO = ray.ray.origin.clone(); t.rayD = ray.ray.direction.clone();
  return t;
}
function land(t, point) {
  if (!t || t.landed) return;
  t.landed = true;
  if (point) { t.bW = point.clone(); t.b = toCam(point, new THREE.Vector3()); t.hit = true; }
  else { t.bW = t.rayO.clone().addScaledVector(t.rayD, 30); t.b = toCam(t.bW, new THREE.Vector3()); }
  setPath(t);
}
function setPath(t) {
  const [u0, v0] = camUV(t.a), [u1, v1] = camUV(t.b);
  t.pathPx = Math.max(2, Math.hypot((u1 - u0) * RW, (v1 - v0) * RH));
}
// not landed by the first update (menu shots: signs / the duck): the first environment surface on the ray, else far
function resolve(t) {
  let p = null;
  try {
    const S = B.Stage, env = S && Object.values(S.defs).map(d => S.env(d.id)).find(e => e && e.visible);
    if (env && t.rayO) { const rc = new THREE.Raycaster(t.rayO, t.rayD); const h = rc.intersectObjects(env.userData.shootables || [], false)[0]; if (h) p = h.point; }
  } catch (e) { p = null; }
  land(t, p);
}
// the rival's shot in versus: from the bottom corner on their side (P1 left, P2 right), to the target they hit
function rivalShot(by, point) {
  const t = make(R.screenToCam(by === 0 ? 0.06 : 0.94, 1.06, 1.0, _a), (B.FX.rivalLook) || DEFAULT_LOOK);
  t.landed = true; t.hit = true; t.bW = point.clone(); t.b = toCam(point, new THREE.Vector3()); setPath(t);
  return t;
}

// ---------- impacts ----------
const distK = p => Math.min(6, Math.max(1, p.distanceTo(R.CAM_POS) / 3.4));   // the marquee burst is tuned at 3.4 units
function impact(t) {
  const kind = t.look.impact; if (!kind || !t.hit) return;
  const p = t.bW, k = distK(p);
  _d.copy(t.b).sub(t.a).normalize().transformDirection(STEADY).negate();      // back toward the shooter
  if (kind === 'zap') {                                                       // small green zap spark
    for (let i = 0; i < 7; i++) {
      _w.set(rnd(-1, 1), rnd(-0.6, 1.2), rnd(-1, 1)).addScaledVector(_d, 0.8).normalize().multiplyScalar(rnd(0.8, 1.8) * k);
      Tg.spawnChip(p, _w, rnd(0.022, 0.032) * k, PAL[['lime', 'green', 'bone', 'lime'][i % 4]], rnd(0.12, 0.26), 0.3);
    }
  } else if (kind === 'puff') {                                               // cap gun: a little white puff
    for (let i = 0; i < 4; i++) {
      _w.set(rnd(-0.25, 0.25), rnd(0.1, 0.4), rnd(-0.25, 0.25)).addScaledVector(_d, 0.35).multiplyScalar(k);
      Tg.spawnChip(p, _w, rnd(0.03, 0.045) * k, PAL[i % 2 ? 'mist' : 'bone'], rnd(0.3, 0.45), -0.02);
    }
  }
}

// ---------- miss ricochet (#86) ----------
// { hot: white-hot sparks, flakes: chipped-surface flakes, pop: one-frame flash cube, speed, grav (sparks) }
const ricochetColors = {
  default: { hot: ['lemon', 'bone', 'yellow', 'amber'], flakes: ['steel', 'haze'], pop: 'bone', speed: 1, grav: 0.6 },
  // BEE HIVE: wax chips + a honey splash (beehive.js may replace this entry)
  beehive: { hot: ['yellow', 'amber', 'lemon', 'orange'], flakes: ['sand', 'tan', 'lemon'], pop: 'lemon', speed: 0.7, grav: 1.4 }
};
function ricochet(p, n, inDir, stageId) {
  const C = ricochetColors[stageId] || ricochetColors.default, k = distK(p), sp = (C.speed || 1) * 1.9 * k;
  _n.copy(n).normalize();
  _d.copy(inDir).normalize(); _d.addScaledVector(_n, -2 * _d.dot(_n));         // mirror bounce
  for (let i = 0; i < 12; i++) {
    _w.copy(_d).multiplyScalar(0.7).addScaledVector(_n, 0.6).add(_s.set(rnd(-0.55, 0.55), rnd(-0.3, 0.7), rnd(-0.55, 0.55))).normalize().multiplyScalar(sp * rnd(0.55, 1.35));
    Tg.spawnChip(p, _w, rnd(0.026, 0.036) * k, PAL[C.hot[i % C.hot.length]], rnd(0.22, 0.45), C.grav != null ? C.grav : 0.6);
  }
  for (let i = 0; i < 4; i++) {
    _w.copy(_n).multiplyScalar(rnd(0.6, 1.1)).add(_s.set(rnd(-0.6, 0.6), rnd(0.2, 0.9), rnd(-0.6, 0.6))).multiplyScalar(k);
    Tg.spawnChip(p, _w, rnd(0.036, 0.048) * k, PAL[C.flakes[i % C.flakes.length]], rnd(0.4, 0.7), 1);
  }
  if (C.pop) Tg.spawnChip(_p.copy(p).addScaledVector(_n, 0.03 * k), _w.set(0, 0, 0), 0.07 * k, PAL[C.pop], 0.06, 0);
}

// ---------- update + draw ----------
const _q0 = new THREE.Vector3(), _q1 = new THREE.Vector3(), _sd = new THREE.Vector3(), _o0 = new THREE.Vector3(), _o1 = new THREE.Vector3();
function pointAt(t, u, out) {                       // screen-linear param u in [0,1] -> camera-space point on a..b
  const zA = -t.a.z, zB = -t.b.z, den = (1 - u) * zB + u * zA, s = den > 1e-6 ? u * zA / den : u;
  return out.copy(t.a).lerp(t.b, s);
}
function sideAt(p, out) {                           // screen-plane side vector at p, perpendicular to the path
  out.crossVectors(_sd, p); const l = out.length();
  return l > 1e-6 ? out.multiplyScalar(1 / l) : out.set(1, 0, 0);
}
function drawLayer(t, L, uT, uH, f, wave) {
  if (uH - uT < 1e-4) return;
  const ci = Math.min(L.cols.length - 1, Math.floor(f * L.cols.length)), hex = PAL[L.cols[ci]] != null ? PAL[L.cols[ci]] : PAL.bone;
  const wpx = Math.max(1, L.w * (1 - 0.45 * f)), segs = wave ? Math.max(2, Math.min(48, Math.ceil((uH - uT) * t.pathPx / 3))) : 1;
  const amp = wave ? wave.amp : 0, wl = wave ? wave.wl : 1, ph = wave ? t.age * (wave.speed || 0) : 0;
  const at = (u, out, so) => {
    pointAt(t, u, out); const z = -out.z, unit = pxUnit(z);
    sideAt(out, so);
    if (amp) {
      const px = u * t.pathPx, taper = Math.min(1, px / 10) * Math.min(1, (1 - u) * t.pathPx / 6);
      out.addScaledVector(so, Math.sin(px / wl * 6.2832 - ph) * amp * taper * unit);
    }
    return unit * wpx / 2;
  };
  let h0 = at(uT, _q0, _o0);
  for (let i = 1; i <= segs; i++) {
    const h1 = at(uT + (uH - uT) * i / segs, _q1, _o1);
    quad(_q0, _q1, _o0, _o1, h0, h1, hex);
    _q0.copy(_q1); _o0.copy(_o1); h0 = h1;
  }
}
function update(dt) {
  if (!live.length) { if (mesh.visible) mesh.visible = false; return; }
  const G = B.G, ts = (G && G.slow < 1 && !(G.run && G.run.versus) ? G.slow : 1) * FX.timeScale;
  nq = 0;
  for (let i = 0; i < live.length; i++) {
    const t = live[i];
    if (!t.landed) resolve(t);
    t.age += dt * ts;
    const lk = t.look, T = lk.T || 0.06, uH = t.age / T;
    let maxLen = 0; for (const L of lk.layers) if (isFinite(L.len)) maxLen = Math.max(maxLen, L.len);
    const retract = maxLen / t.pathPx * T, fadeT = Math.max(lk.fade || 0, lk.layers.some(L => !isFinite(L.len)) ? (lk.fade || 0.08) : retract);
    const e = t.age - T, f = e > 0 ? Math.min(1, e / Math.max(1e-3, fadeT)) : 0;
    if (e >= 0 && !t.impactDone) { t.impactDone = true; impact(t); }
    if (e > fadeT) { live.splice(i--, 1); continue; }
    _sd.copy(t.b).sub(t.a);
    for (const L of lk.layers) {
      const hU = Math.min(1, uH), tU = isFinite(L.len) ? Math.max(0, uH - L.len / t.pathPx) : 0;
      if (tU < 1) drawLayer(t, L, tU, hU, f, lk.wave);
    }
  }
  geo.setDrawRange(0, nq * 6);
  geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  mesh.visible = nq > 0;
}

// ---------- versus: the rival's hits (hooked once every script has run; stage.js loads after this file) ----------
// Run.applyHit(by, tid, ...) is where a rival's hit lands on this screen (guest: the host's 'hit'; host: the guest's
// adjudicated claim). A thin wrapper reads the target's centre before it shatters and fires FX.rivalShot. The
// rival's misses carry no point over the wire, so they get no tracer.
function hookVersus() {
  const Run = B.Stage && B.Stage.Run;
  if (!Run || Run.prototype.__fxHooked) return;
  const orig = Run.prototype.applyHit;
  Run.prototype.applyHit = function (by, tid, st, point) {
    let at = null;
    try {
      if (this.versus && by !== this.local && !this.taken.has(tid)) {
        const tg = this.byId(tid), m = tg && tg.alive && tg.meshes()[0];
        if (point) at = point.clone();
        else if (m) { m.updateWorldMatrix(true, false); if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); at = m.geometry.boundingSphere.center.clone().applyMatrix4(m.matrixWorld); }
      }
    } catch (e) { at = null; }
    const ok = orig.apply(this, arguments);
    if (ok && at) rivalShot(by, at);
    return ok;
  };
  Run.prototype.__fxHooked = true;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookVersus); else setTimeout(hookVersus, 0);

const FX = B.FX = { shot, land, rivalShot, ricochet, ricochetColors, update, DEFAULT_LOOK, rivalLook: null, timeScale: 1, mesh, live, hookVersus };
})(window.BLAM);
