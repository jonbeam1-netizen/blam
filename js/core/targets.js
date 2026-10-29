'use strict';
/* =========================================================================================
   B.L.A.M. core/targets.js -- shootable things and their debris.
   - chips: one InstancedMesh of unit cubes (shatter debris, sparks, steam, explosion puffs)
   - decals: bullet holes = a void square inside a lighter rim square (two instanced meshes)
   - Target: base class. Register voxel parts with part(mesh, voxelList, size, ox, oy, oz) so a
     hit can shatter exactly those voxels into chips. kind: 'target' | 'bomb' | 'bystander' | 'sign'
   - Sign: a hanging voxel board with 3x5 lettering (menu buttons are shootable signs)
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, rnd = R.rnd;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(),
  _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------- chips ----------
const CHIP_N = 900;
const chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), CHIP_N);
chipMesh.frustumCulled = false; R.scene.add(chipMesh);
const chipD = [];
for (let i = 0; i < CHIP_N; i++) {
  chipD.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), s: 0, g: 1, floor: 0 });
  chipMesh.setMatrixAt(i, ZERO_M); chipMesh.setColorAt(i, _c.set(0xffffff));
}
let chipNext = 0;
function spawnChip(p, v, size, col, life, grav = 1, floor = 0) {   // grav < 0 = rising puff (steam)
  const i = chipNext; chipNext = (chipNext + 1) % CHIP_N; const d = chipD[i];
  d.p.copy(p); d.v.copy(v); d.s = size; d.life = d.max = life; d.g = grav; d.floor = floor;
  d.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); d.w.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
  if (grav <= 0) d.w.set(0, 0, 0), d.r.set(0, 0, 0);
  chipMesh.setColorAt(i, _c.set(col)); chipMesh.instanceColor.needsUpdate = true;
}
function updateChips(dt) {
  for (let i = 0; i < CHIP_N; i++) {
    const d = chipD[i]; if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) { chipMesh.setMatrixAt(i, ZERO_M); continue; }
    d.v.y -= 9.8 * d.g * dt; d.p.addScaledVector(d.v, dt);
    if (d.g > 0 && d.p.y < d.floor + d.s * 0.5) { d.p.y = d.floor + d.s * 0.5; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
    if (d.g <= 0) d.v.multiplyScalar(1 - 2.5 * dt);
    d.r.addScaledVector(d.w, dt);
    const k = Math.min(1, d.life / 0.35) * d.s;
    chipMesh.setMatrixAt(i, _m4.compose(d.p, _q.setFromEuler(_e.set(d.r.x, d.r.y, d.r.z)), _s3.set(k, k, k)));
  }
  chipMesh.instanceMatrix.needsUpdate = true;
}
function clearChips() { for (let i = 0; i < CHIP_N; i++) { chipD[i].life = 0; chipMesh.setMatrixAt(i, ZERO_M); } chipMesh.instanceMatrix.needsUpdate = true; }
function sparks(p, n = 5, cols = ['lemon', 'yellow'], speed = 1.5, size = 0.03) {
  for (let k = 0; k < n; k++) spawnChip(p, _s3.set(rnd(-speed, speed), rnd(0.6, 2.2) * speed * 0.8, rnd(-0.2, 1.2) * speed), size, PAL[cols[k % cols.length]], rnd(0.25, 0.5), 0.6);
}
// cartoon explosion puff (bombs): a ball of hot cubes that floats and fades
function puff(p, n = 40, scale = 1) {
  const cols = ['lemon', 'yellow', 'orange', 'amber', 'bone', 'rust'];
  for (let k = 0; k < n; k++) {
    _w.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.2, 3.4) * scale);
    spawnChip(p, _w, rnd(0.06, 0.13) * scale, PAL[cols[k % cols.length]], rnd(0.35, 0.8), -0.03);
  }
  for (let k = 0; k < 10; k++) spawnChip(p, _w.set(rnd(-2, 2), rnd(1, 4), rnd(-1, 2)), 0.05 * scale, PAL.void, rnd(0.8, 1.4));
}

// cartoon FLOWER burst (bomb explosion): a hot core, 7-9 petals that end in fat round lobes (yellow inside, an orange /
// rust rim), thinner lemon stems, a puffy mist smoke ring and soot specks. Mostly in the camera plane, floats, fades.
function burst(p, scale = 1) {
  const n = 7 + ((Math.random() * 3) | 0), a0 = Math.random() * 6.283, S = scale;
  for (let k = 0; k < 8; k++) spawnChip(p, _w.set(rnd(-0.5, 0.5), rnd(-0.4, 0.6), rnd(0.3, 0.9)), rnd(0.22, 0.32) * S, PAL[['lemon', 'bone', 'yellow'][k % 3]], rnd(0.22, 0.34), -0.02);
  for (let q = 0; q < n; q++) {
    const a = a0 + q * 6.283 / n + rnd(-0.1, 0.1), ca = Math.cos(a), sa = Math.sin(a);
    const pet = (f, side, size, col, life) => {
      const sp = 4.2 * S * f;
      _w.set((ca - sa * side) * sp, (sa + ca * side) * sp + 0.3 * S, rnd(0.2, 0.8) * S);
      spawnChip(p, _w, size * S, PAL[col], life, -0.03);
    };
    for (let k = 0; k < 9; k++) { const f = rnd(0.72, 1.0); pet(f, rnd(-0.24, 0.24), rnd(0.15, 0.21), f > 0.9 ? (k & 1 ? 'orange' : 'rust') : 'yellow', rnd(0.65, 0.85)); }
    for (let k = 0; k < 4; k++) pet(rnd(0.25, 0.6), rnd(-0.08, 0.08), rnd(0.1, 0.14), k & 1 ? 'lemon' : 'yellow', rnd(0.45, 0.65));
  }
  for (let k = 0; k < 10; k++) {                           // smoke ring puffs, a beat slower
    const a = k * 0.6283 + rnd(-0.2, 0.2);
    spawnChip(p, _w.set(Math.cos(a) * 2.6 * S, Math.sin(a) * 2.6 * S + 0.6, -0.4), rnd(0.14, 0.2) * S, PAL[k % 3 ? 'mist' : 'bone'], rnd(0.8, 1.0), -0.06);
  }
  for (let k = 0; k < 8; k++) spawnChip(p, _w.set(rnd(-2.2, 2.2), rnd(1, 4), rnd(-1, 2)), 0.05 * S, PAL.void, rnd(0.8, 1.4));
}

// ---------- bullet-hole decals (hole + rim) ----------
const DEC_N = 64;
const decMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: PAL.void, fog: false }), DEC_N);
const rimMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), DEC_N);
[decMesh, rimMesh].forEach(m => { m.frustumCulled = false; for (let i = 0; i < DEC_N; i++) { m.setMatrixAt(i, ZERO_M); if (m === rimMesh) m.setColorAt(i, _c.set(0xffffff)); } R.scene.add(m); });
let decNext = 0; const _zAxis = new THREE.Vector3(0, 0, 1);
function addDecal(p, n, rimCol) {                  // size grows with distance so a hole stays ~4-5 px
  const sz = 0.04 + p.distanceTo(R.CAM_POS) * 0.014;
  _q.setFromUnitVectors(_zAxis, n);
  decMesh.setMatrixAt(decNext, _m4.compose(_v.copy(p).addScaledVector(n, 0.014), _q, _s3.set(sz, sz, 0.02)));
  rimMesh.setMatrixAt(decNext, _m4.compose(_v.copy(p).addScaledVector(n, 0.008), _q, _s3.set(sz * 1.75, sz * 1.75, 0.02)));
  rimMesh.setColorAt(decNext, _c.set(rimCol == null ? PAL.haze : rimCol));
  decNext = (decNext + 1) % DEC_N;
  decMesh.instanceMatrix.needsUpdate = true; rimMesh.instanceMatrix.needsUpdate = true; rimMesh.instanceColor.needsUpdate = true;
}
function clearDecals() { for (let i = 0; i < DEC_N; i++) { decMesh.setMatrixAt(i, ZERO_M); rimMesh.setMatrixAt(i, ZERO_M); } decMesh.instanceMatrix.needsUpdate = rimMesh.instanceMatrix.needsUpdate = true; }
// rim colour for a hit on a vertex-coloured env mesh: the surface colour, lifted a notch (fresh splinters / chipped paint)
function surfaceColor(hit) {
  const ca = hit.object.geometry.attributes.color; if (!ca || !hit.face) return PAL.haze;
  const i = hit.face.a;
  _c.setRGB(Math.min(1, ca.getX(i)), Math.min(1, ca.getY(i)), Math.min(1, ca.getZ(i)));
  return _c.getHex();
}

// ---------- Target base class ----------
class Target {
  constructor(kind = 'target') {
    this.kind = kind; this.group = new THREE.Group(); this.parts = []; this.alive = true; this.shootable = false;
    this.taken = -1; this.id = -1; this.hover = false;
  }
  // register a mesh built from a voxel list (as passed to Vox.vox) so it can be hit and shattered
  part(mesh, list, s, ox = 0, oy = 0, oz = 0) { mesh.userData.target = this; this.parts.push({ mesh, list, s, ox, oy, oz }); return mesh; }
  meshes() { return this.parts.map(p => p.mesh); }
  // break into chips flying away from the hit point. opts: { tint: colour hex mixed in, max: chip budget, power }
  shatter(point, opts = {}) {
    const total = this.parts.reduce((a, p) => a + p.list.length, 0) || 1, keep = Math.min(1, (opts.max || 150) / total), pw = opts.power || 1;
    this.group.updateMatrixWorld(true);
    const hit = point ? point.clone() : this.group.getWorldPosition(new THREE.Vector3());
    for (const p of this.parts) {
      const sc = _s3.setFromMatrixScale(p.mesh.matrixWorld).x * p.s;
      for (const [i, j, k, col, mul] of p.list) {
        if (Math.random() > keep) continue;
        _v.set(p.ox + i * p.s, p.oy + j * p.s, p.oz + k * p.s).applyMatrix4(p.mesh.matrixWorld);
        _w.copy(_v).sub(hit); _w.z = 0; if (_w.lengthSq() < 1e-6) _w.set(rnd(-1, 1), 1, 0);
        _w.normalize().multiplyScalar(rnd(1.5, 4.2) * pw);
        _w.x += rnd(-0.5, 0.5); _w.y += rnd(1.2, 3.6); _w.z += rnd(0.6, 2.8);
        const c = opts.tint != null && Math.random() < 0.45 ? opts.tint : col;
        const big = mul || 1;                                   // 5th element: size multiplier (rims fly as bigger chunks, a bit slower)
        if (big > 1.2) _w.multiplyScalar(0.8);
        spawnChip(_v, _w, sc * rnd(0.75, 1.0) * big, c, rnd(1.0, 1.9));
      }
    }
    this.alive = false; this.shootable = false; this.group.visible = false;
  }
  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.traverse(o => { if (o.isMesh && o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); });
  }
}
// nearest shootable target under the ray. -> { target, point, distance, object } | null
function pick(ray, targets) {
  const meshes = [];
  for (const t of targets) if (t && t.alive && t.shootable && t.group.visible) for (const m of t.meshes()) if (m.visible) meshes.push(m);
  if (!meshes.length) return null;
  const h = ray.intersectObjects(meshes, false)[0];
  return h ? { target: h.object.userData.target, point: h.point, distance: h.distance, object: h.object, zone: h.object.userData.zone } : null;
}

// ---------- Sign: a hanging voxel board with 3x5 lettering (menu buttons) ----------
// opts: { text, sub, color, frame, textCol, subCol, s (voxel size), minW (voxels), hang (rope length) }
const SIGN_STYLES = {
  crimson: ['crimson', 'red', 'oxblood', 'plum'], blue: ['blue', 'cyan', 'deepblue', 'deepblue'],
  green: ['green', 'lime', 'forest', 'forest'], amber: ['amber', 'yellow', 'rust', 'chestnut'],
  plum: ['magenta', 'pink', 'plum', 'plum'], wood: ['chestnut', 'tan', 'walnut', 'umber'], slate: ['slate', 'steel', 'navy', 'midnight']
};
class Sign extends Target {
  constructor(opts) {
    super('sign');
    this.opts = Object.assign({ color: 'crimson', textCol: 'bone', subCol: 'yellow', s: 0.05, minW: 0, hang: 2.4 }, opts);
    this.phase = Math.random() * 6; this.wob = 0; this.hoverT = 0;
    this.pivot = new THREE.Group(); this.group.add(this.pivot);
    this.build();
  }
  build() {
    const o = this.opts, st = SIGN_STYLES[o.color] || SIGN_STYLES.crimson, s = o.s;
    if (this.mesh) { this.pivot.remove(this.mesh); this.mesh.geometry.dispose(); this.parts.length = 0; }
    if (this.rope) { this.group.remove(this.rope); this.rope.geometry.dispose(); }
    const t = R.small(o.text), sb = o.sub ? R.small(o.sub) : null;
    const W = Math.max(t.w, sb ? sb.w : 0, o.minW) + 8, Hh = sb ? 18 : 11;
    const list = [], has = new Set();
    for (let r = 0; r < Hh; r++) for (let i = 0; i < W; i++) {
      const cx = Math.min(i, W - 1 - i), cy = Math.min(r, Hh - 1 - r);
      if (cx + cy === 0) continue;                                             // cut corners
      const edge = cx === 0 || cy === 0, j = Hh - 1 - r;
      const c = edge ? PAL[st[3]] : r === 1 ? PAL[st[1]] : r === Hh - 2 ? PAL[st[2]] : PAL[st[0]];
      list.push([i, j, 0, c], [i, j, -1, edge ? PAL[st[3]] : PAL.walnut]);
      if (edge) list.push([i, j, 1, PAL[st[3]]]);                              // raised frame lip
    }
    const letters = (tt, x0, r0, col) => {
      for (const [x, y] of tt.px) { has.add((x0 + x) + ',' + (r0 + y)); }
      for (const [x, y] of tt.px) {
        list.push([x0 + x, Hh - 1 - (r0 + y), 1, PAL[col]]);
        const sx = x0 + x + 1, sy = r0 + y + 1;                                 // drop shadow down-right
        if (!has.has(sx + ',' + sy)) { has.add(sx + ',' + sy); list.push([sx, Hh - 1 - sy, 1, PAL.void]); }
      }
    };
    letters(t, Math.floor((W - t.w) / 2), 3, o.textCol);
    if (sb) letters(sb, Math.floor((W - sb.w) / 2), 11, o.subCol);
    const ox = -(W - 1) / 2 * s, oy = -(Hh - 1) / 2 * s;
    this.mesh = new R.Vox().vox(list, s, ox, oy, 0).mesh(MAT.obj);
    this.part(this.mesh, list, s, ox, oy, 0);
    this.pivot.add(this.mesh);
    this.w = W * s; this.h = Hh * s;
    // two ropes up out of frame (not shootable)
    if (o.hang > 0) {
      const v = new R.Vox(), top = this.h / 2, x = this.w / 2 - 3 * s;
      for (const sx of [-x, x]) { v.bx(sx - 0.012, top, -0.02, sx + 0.012, top + o.hang, 0.004, PAL.steel); v.bx(sx - 0.03, top - 0.01, -0.03, sx + 0.03, top + 0.03, 0.02, PAL.void); }
      this.rope = v.mesh(MAT.obj); this.pivot.add(this.rope);
    }
    this.alive = true; this.shootable = true; this.group.visible = true;
  }
  setText(text, sub) { this.opts.text = text; if (sub !== undefined) this.opts.sub = sub; this.build(); this.wob = 1; }
  setHover(on) {
    if (on === this.hover) return;
    this.hover = on; if (this.mesh) this.mesh.material = on ? MAT.hot : MAT.obj;
    if (on) { this.wob = Math.max(this.wob, 0.6); B.SFX.play('menuHover'); }
  }
  update(dt, t) {
    this.wob = Math.max(0, this.wob - dt * 1.8);
    this.hoverT += ((this.hover ? 1 : 0) - this.hoverT) * Math.min(1, dt * 12);
    const top = this.h / 2 + (this.opts.hang > 0 ? this.opts.hang : 0);
    // swing about the rope top: pivot offset so it rotates around the hanging point
    this.pivot.position.set(0, 0, 0);
    this.pivot.rotation.z = Math.sin(t * 1.3 + this.phase) * 0.025 + Math.sin(t * 14) * 0.08 * this.wob;
    this.pivot.rotation.x = Math.sin(t * 0.9 + this.phase) * 0.03;
    const sc = 1 + this.hoverT * 0.08; this.pivot.scale.set(sc, sc, sc); void top;
  }
}
Object.assign(B, { Targets: { Target, Sign, SIGN_STYLES, pick, spawnChip, updateChips, clearChips, sparks, puff, burst, addDecal, clearDecals, surfaceColor, chipMesh } });
})(window.BLAM);
