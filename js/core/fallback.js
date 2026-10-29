'use strict';
/* B.L.A.M. core/fallback.js -- placeholder gun + duck behind the SAME API as js/guns.js / js/duck.js.
   main.js uses BLAM.Guns / BLAM.Duck when they exist, otherwise these boxes, so the engine can be
   tested on its own. Nothing here is final art. */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL;
const SKINS = [{ id: 'box-pink', name: 'BOX PINK', body: PAL.pink, muzzle: PAL.blue }, { id: 'box-blue', name: 'BOX BLUE', body: PAL.cyan, muzzle: PAL.crimson }];
function boxGun(THREE, opts = {}) {
  const group = new THREE.Group(), kick = new THREE.Group(); group.add(kick);
  const body = new THREE.MeshBasicMaterial({ color: SKINS[0].body }), muz = new THREE.MeshBasicMaterial({ color: SKINS[0].muzzle }), dark = new THREE.MeshBasicMaterial({ color: PAL.void });
  const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); kick.add(b); return b; };
  add(0.064, 0.064, 0.24, 0, 0, -0.12, body); add(0.096, 0.096, 0.064, 0, 0, -0.27, muz); add(0.064, 0.15, 0.064, 0, -0.1, -0.02, dark);
  const g = { group, skin: 0, layout: opts.layout || 'desktop', aim: new THREE.Vector2(), k: 0, kv: 0, rel: 0, relMax: 1, empty: false,
    base: new THREE.Vector3(0.5, -0.11, -0.86) };
  g.setSkin = i => { if (typeof i === 'string') i = Math.max(0, SKINS.findIndex(s => s.id === i)); g.skin = ((i | 0) % SKINS.length + SKINS.length) % SKINS.length; body.color.setHex(SKINS[g.skin].body); muz.color.setHex(SKINS[g.skin].muzzle); };
  g.nextSkin = () => g.setSkin(g.skin + 1);
  g.setLayout = l => { g.layout = l; };
  g.setAim = (x, y) => g.aim.set(x, y);
  g.fire = () => { g.kv += 10; };
  g.reload = s => { g.rel = g.relMax = Math.max(0.05, s || 1); };
  g.setEmpty = e => { g.empty = !!e; };
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), tgt = new THREE.Vector3(), pos = new THREE.Vector3();
  g.update = (dt) => {
    const bx = g.layout === 'mobile' ? 0.2 : 0.5;
    g.base.x += (bx - g.base.x) * Math.min(1, dt * 6);
    pos.set(g.base.x + g.aim.x * 0.05, g.base.y + g.aim.y * 0.035, g.base.z);
    group.position.lerp(pos, Math.min(1, dt * 10));
    tgt.set(g.aim.x * R.TAN_H * R.ASPECT, g.aim.y * R.TAN_H, -1).multiplyScalar(9);
    m.lookAt(group.position, tgt, up); q.setFromRotationMatrix(m); group.quaternion.slerp(q, Math.min(1, dt * 12));
    g.kv += (-260 * g.k - 19 * g.kv) * dt; g.k += g.kv * dt;
    kick.position.z = g.k * 0.14;
    let rx = g.k * 0.8;
    if (g.rel > 0) { g.rel -= dt; const p = 1 - Math.max(0, g.rel) / g.relMax; rx += -Math.sin(p * Math.PI) * 0.9; kick.rotation.z = p * Math.PI * 2; } else kick.rotation.z = 0;
    kick.rotation.x = rx;
  };
  g.muzzleWorldPos = v => { kick.updateMatrixWorld(true); return v.set(0, 0, -0.31).applyMatrix4(kick.matrixWorld); };
  g.setSkin(opts.skin || 0); g.setLayout(g.layout);
  return g;
}
function boxDuck(THREE) {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const mats = {}; const M = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  const parts = [];
  const add = (w, h, d, x, y, z, c, p = body) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); b.position.set(x, y, z); p.add(b); parts.push(b); return b; };
  add(0.7, 0.45, 0.3, 0, 0.3, 0, PAL.yellow); add(0.36, 0.34, 0.3, 0.2, 0.68, 0, PAL.yellow);
  const bill = add(0.2, 0.09, 0.2, 0.46, 0.64, 0, PAL.orange);
  add(0.42, 0.06, 0.36, 0.2, 0.87, 0, PAL.chestnut); add(0.24, 0.14, 0.26, 0.2, 0.96, 0, PAL.chestnut);
  const eye = add(0.06, 0.06, 0.32, 0.27, 0.73, 0, PAL.void);
  const brow = add(0.12, 0.03, 0.33, 0.27, 0.8, 0, PAL.red); brow.visible = false;
  add(0.3, 0.06, 0.24, 0, 0.03, 0, PAL.walnut);
  const d = { group, pose: 'idle', t: 0, hop: 0, shake: 0 };
  d.setPose = p => { d.pose = p; brow.visible = p === 'angry' || p === 'shot'; if (p === 'happy' || p === 'cheer') d.hop = 0.6; if (p === 'angry' || p === 'shot') d.shake = 0.6; };
  d.hit = () => { d.setPose('shot'); };
  d.lookAt = (x) => { eye.position.x = 0.27 + Math.max(-1, Math.min(1, x)) * 0.02; };
  d.hitTest = ray => ray.intersectObjects(parts, false)[0] || null;
  d.update = (dt, t) => {
    d.t += dt; d.hop = Math.max(0, d.hop - dt); d.shake = Math.max(0, d.shake - dt);
    const cheer = d.pose === 'cheer' ? Math.abs(Math.sin(t * 6)) * 0.2 : 0;
    body.position.y = Math.sin(Math.PI * Math.min(1, (0.6 - d.hop) / 0.6)) * (d.hop > 0 ? 0.3 : 0) + Math.sin(t * 2.4) * 0.02 + cheer;
    body.position.x = d.shake > 0 ? Math.sin(t * 70) * 0.03 : 0;
    body.rotation.z = d.pose === 'sad' ? -0.25 : d.pose === 'present' ? 0.12 + Math.sin(t * 2) * 0.05 : Math.sin(t * 1.2) * 0.04;
    bill.position.y = 0.64 - (d.pose === 'angry' || d.pose === 'present' || d.pose === 'cheer' ? 0.03 : 0);
  };
  return d;
}
B.Fallback = { Guns: { SKINS, create: boxGun, placeholder: true }, Duck: { create: boxDuck, placeholder: true } };
})(window.BLAM);
