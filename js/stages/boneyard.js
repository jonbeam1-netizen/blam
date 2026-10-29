'use strict';
/* =========================================================================================
   B.L.A.M. stages/boneyard.js -- Stage 3: BONEYARD.
   A crypt floor heaped with bones under a stone arch (B.L.A.M. carved in the keystone), moonlight
   through a barred grate, candles, cobwebs, a cracked sarcophagus at the back.
   SKELETONS lurch up out of the bone pile at seeded spots, sway / shake their skull / rattle, and drop
   back. Skull hit > rib hit. A BOMB SKULL (black skull, red candle) hides among them; on Very Hard /
   Insane some are FLIP-BOMBS (the candle burns out, the skull flips to a real one for ~0.4 s).
   Twist: some skeletons THROW THEIR SKULL at the camera: shoot it mid-air for a bonus, or it bonks the
   screen (small shake, no penalty). Distraction: a bat flutters through (never shootable).
   Every pose is a pure function of (spawn, local time): versus-safe.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, MAT = R.MAT, E = R.E, Vox = R.Vox, T = B.Targets;
const clamp = E.clamp, sstep = (a, b, v) => { const s = clamp((v - a) / (b - a), 0, 1); return s * s * (3 - 2 * s); };

// ---------- layout: spots on the bone pile, three rows (front row big, back row high up the heap) ----------
function pileH(x, z) {                                   // the heap: a heightfield rising toward the back
  let h = 0.12 + 1.6 * sstep(-1.3, -8.3, z);
  if (z < -8.8) h *= Math.max(0.2, 1 - (-8.8 - z) / 1.5);   // falls away behind the ridge (sarcophagus shows)
  h *= 1 - 0.75 * sstep(6.4, 7.9, Math.abs(x));
  h += 0.1 * Math.sin(x * 1.7 + z * 0.9) + 0.07 * Math.sin(x * 3.1 - z * 2.3);
  if (z > -1.3) h *= clamp(1 - (z + 1.3) / 0.6, 0, 1);
  return Math.max(0, h);
}
const ROWS = [[-2.5, [-4.7, -2.4, 0, 2.4, 4.7]], [-5.1, [-6.0, -3.6, -1.2, 1.2, 3.6, 6.0]], [-7.8, [-5.0, -2.5, 2.5, 5.0]]];
const SPOTS = [];
ROWS.forEach(([z, xs], row) => xs.forEach(x => SPOTS.push({ x, z, row, y: +(pileH(x, z) - 0.08).toFixed(3) })));
// spots in other rows that would hide / be hidden by this one
SPOTS.forEach(s => { s.block = []; SPOTS.forEach((o, j) => { if (o !== s && o.row !== s.row && Math.abs(o.x - s.x) < 1.65) s.block.push(j); }); });

// ---------- baked light: moonbeam from the grate, candle pools, a dark alcove inside the arch ----------
const MOON_A = [6.6, 5.5, -11.8], MOON_B = [1.2, 0, -4.4];
// candles: [x, base y, z, stick height]; the flame sits on top (and lights the bake)
const SARC_Y = 1.15;                                     // the sarcophagus plinth height (it shows over the heap)
const CANDLES = [[-1.25, SARC_Y + 1.77, -10.35, 0.34], [1.55, SARC_Y + 1.77, -11.25, 0.22], [-4.85, 0.45, -10.25, 0.42], [4.85, 0.45, -10.25, 0.3],
  [-7.0, pileH(-7.0, -6.9), -6.9, 0.3], [6.9, pileH(6.9, -4.2), -4.2, 0.36], [-6.5, pileH(-6.5, -2.0), -2.0, 0.24],
  [0.25, pileH(0.25, -9.4), -9.4, 0.28], [-3.4, 0.36, 0.7, 0.3], [3.7, 0.36, 0.65, 0.42]];
const ARCH = { cy: 3.3, ai: 4.3, bi: 2.55, ao: 5.35, bo: 3.6, z0: -11.4, z1: -10.6 };
function inArch(x, y) { const dy = Math.max(0, y - ARCH.cy); return Math.abs(x) < ARCH.ai && (x * x) / (ARCH.ai * ARCH.ai) + (dy * dy) / (ARCH.bi * ARCH.bi) < 1; }
function bakeLight(x, y, z) {
  let L = 0.52;
  const ax = MOON_B[0] - MOON_A[0], ay = MOON_B[1] - MOON_A[1], az = MOON_B[2] - MOON_A[2], ll = ax * ax + ay * ay + az * az;
  const t = clamp(((x - MOON_A[0]) * ax + (y - MOON_A[1]) * ay + (z - MOON_A[2]) * az) / ll, 0, 1.15);
  const dx = x - MOON_A[0] - ax * t, dy = y - MOON_A[1] - ay * t, dz = z - MOON_A[2] - az * t;
  L += 0.5 * Math.exp(-(dx * dx + dy * dy + dz * dz) * 0.32) * (0.55 + 0.45 * t);
  for (const c of CANDLES) { const ex = x - c[0], ey = y - c[1] - c[3] - 0.1, ez = z - c[2]; L += 0.3 * Math.exp(-(ex * ex + ey * ey * 1.4 + ez * ez) * 0.8); }
  if (z < -11.35 && inArch(x, y)) L *= 0.62;
  L *= 1 - 0.035 * Math.max(0, y - 3.5);
  return Math.min(L, 1.3);
}

// ---------- the crypt (static set: one baked env mesh + one unlit glow mesh) ----------
function buildEnv() {
  const group = new THREE.Group(), rng = B.Stage.mulberry32(0xb0ae5);
  const room = new Vox(); room.bake = bakeLight;
  const glow = new Vox();
  const pick = a => a[Math.floor(rng() * a.length)];
  // floor: big flagstones (navy / indigo / slate), tiled at 1 unit so the bake has vertices
  for (let x = -8; x < 8; x++) for (let z = -12.5; z < 5; z++) {
    const k = ((Math.floor(x / 2) * 7 + Math.floor(z / 2) * 13) % 3 + 3) % 3;
    room.bx(x, -0.2, z, x + 1, 0, z + 1, [PAL.navy, PAL.indigo, PAL.slate][k], null, 4);
  }
  for (let z = -12; z < 5; z += 2) room.bx(-8, -0.02, z - 0.03, 8, 0.004, z + 0.03, PAL.midnight, null, 4);
  for (let x = -8; x <= 8; x += 2) room.bx(x - 0.03, -0.02, -12.5, x + 0.03, 0.004, 5, PAL.midnight, null, 4);
  // walls: indigo mortar with stone blocks proud of it (back wall + both side walls)
  const BRICK = [PAL.navy, PAL.navy, PAL.slate, PAL.indigo];
  for (let x = -8; x < 8; x++) for (let y = 0; y < 8; y++) room.bx(x, y, -12.2, x + 1, y + 1, -12, PAL.indigo, null, 16);
  for (let r = 0; r < 16; r++) {
    const y = r * 0.5, off = (r & 1) * 0.5;
    for (let x = -8 - off; x < 8; x += 1) {
      const x0 = Math.max(-8, x) + 0.04, x1 = Math.min(8, x + 1) - 0.04;
      if (x1 - x0 > 0.1) room.bx(x0, y + 0.04, -12, x1, y + 0.46, -11.93, pick(BRICK), null, 31);
    }
  }
  for (const sx of [-1, 1]) {
    const wx = sx * 8, face = sx < 0 ? 1 : 2;
    for (let z = -12; z < 5; z++) for (let y = 0; y < 8; y++) room.bx(sx < 0 ? wx - 0.2 : wx, y, z, sx < 0 ? wx : wx + 0.2, y + 1, z + 1, PAL.indigo, null, face);
    for (let r = 0; r < 16; r++) {
      const y = r * 0.5, off = (r & 1) * 0.5;
      for (let z = -12 - off; z < 5; z += 1) {
        const z0 = Math.max(-12, z) + 0.04, z1 = Math.min(5, z + 1) - 0.04;
        if (z1 - z0 > 0.1) room.bx(sx < 0 ? wx : wx - 0.07, y + 0.04, z0, sx < 0 ? wx + 0.07 : wx, y + 0.46, z1, pick(BRICK), null, 63 ^ (sx < 0 ? 2 : 1));
      }
    }
  }
  // vaulted ceiling: midnight slabs + stone ribs
  for (let x = -8; x < 8; x++) for (let z = -12; z < 5; z++) room.bx(x, 7.6, z, x + 1, 7.8, z + 1, PAL.midnight, null, 8);
  for (let z = -11.5; z < 5; z += 2.5) room.bx(-8, 7.35, z - 0.18, 8, 7.6, z + 0.18, PAL.navy);
  // ---- the arch: voussoirs on an elliptical arch + two pillars (0.25 voxels, culled faces) ----
  {
    const s = 0.25, list = [], A = ARCH;
    for (let i = -24; i < 24; i++) for (let j = 0; j < 30; j++) {
      const x = (i + 0.5) * s, y = (j + 0.5) * s, dy = y - A.cy, ax = Math.abs(x);
      let col = null;
      if (y < A.cy) { if (ax >= A.ai && ax < A.ao) col = (j % 4 === 3) ? PAL.navy : (Math.floor(j / 4) & 1) ? PAL.slate : PAL.steel; }
      else {
        const ri = (x * x) / (A.ai * A.ai) + (dy * dy) / (A.bi * A.bi), ro = (x * x) / (A.ao * A.ao) + (dy * dy) / (A.bo * A.bo);
        if (ri >= 1 && ro < 1) {
          const a = Math.atan2(dy / A.bi, x / A.ai), q = a / (Math.PI / 11), seg = Math.floor(q + 0.0001);
          col = Math.abs(q - Math.round(q)) < 0.07 ? PAL.navy : (seg & 1) ? PAL.slate : PAL.steel;
        }
      }
      if (!col) continue;
      for (let k = 0; k < 3; k++) list.push([i, j, k, k === 2 && col !== PAL.navy && ((i * 7 + j * 3) % 5 === 0) ? PAL.haze : col]);
    }
    room.vox(list, s, 0.5 * s, 0.5 * s, A.z0 + 0.5 * s);
    for (const sx of [-1, 1]) {                                            // pillar bases + capitals
      const xa = sx * (A.ai - 0.15), xb = sx * (A.ao + 0.15);
      room.bx(Math.min(xa, xb), 0, A.z0 - 0.1, Math.max(xa, xb), 0.45, A.z1 + 0.2, PAL.slate);
      room.bx(Math.min(xa, xb), A.cy - 0.05, A.z0 - 0.05, Math.max(xa, xb), A.cy + 0.2, A.z1 + 0.12, PAL.haze);
    }
  }
  // ---- keystone with B.L.A.M. carved in relief (raised letters on a sunk panel) ----
  {
    const t = R.bold('B.L.A.M.'), s = 0.085, w = t.w * s, x0 = -w / 2, top = ARCH.cy + ARCH.bo + 0.42, z = ARCH.z1 + 0.12;
    room.bx(-2.0, ARCH.cy + ARCH.bi - 0.25, ARCH.z0, 2.0, top, z, PAL.steel);                  // the keystone block
    room.bx(-2.25, top - 0.04, ARCH.z0, 2.25, top + 0.2, z + 0.08, PAL.haze);                  // cap moulding
    room.bx(-1.6, ARCH.cy + ARCH.bi - 0.45, ARCH.z0, 1.6, ARCH.cy + ARCH.bi - 0.25, z, PAL.slate);   // drop under it
    const y0 = top - 0.3;
    room.bx(x0 - 0.22, y0 - 7 * s - 0.2, z, x0 + w + 0.22, y0 + 0.2, z + 0.02, PAL.navy);           // sunk panel
    for (const [px, py] of t.px) {
      const c = py === 0 ? PAL.mist : py >= 5 ? PAL.steel : PAL.haze;
      room.bx(x0 + px * s, y0 - (py + 1) * s, z + 0.02, x0 + (px + 1) * s, y0 - py * s, z + 0.02 + s * 1.3, c);
    }
  }
  // ---- the grate: a barred window high on the back wall, night sky + moon behind it (unlit) ----
  {
    const gx0 = 5.75, gx1 = 7.55, gy0 = 4.55, gy1 = 6.35, z = -11.93;
    glow.bx(gx0, gy0, z - 0.06, gx1, gy1, z - 0.04, PAL.deepblue);
    for (let j = 0; j < 18; j++) for (let i = 0; i < 18; i++) {                       // moon disc, upper left, with a dark crater or two
      const px = gx0 + 0.25 + i * 0.05, py = gy0 + 0.8 + j * 0.05, d = Math.hypot(i - 8.5, j - 8.5);
      if (d > 8.6) continue;
      const crater = Math.hypot(i - 5, j - 11) < 2.2 || Math.hypot(i - 11, j - 6) < 1.5;
      glow.bx(px, py, z - 0.04, px + 0.05, py + 0.05, z - 0.03, crater ? PAL.mist : d > 7.4 ? PAL.lemon : PAL.bone);
    }
    [[6.9, 6.1], [7.35, 5.0], [6.3, 4.8], [7.1, 5.6]].forEach(([sx, sy]) => glow.bx(sx, sy, z - 0.04, sx + 0.05, sy + 0.05, z - 0.03, PAL.lemon));
    room.bx(gx0 - 0.22, gy0 - 0.22, z, gx1 + 0.22, gy0, z + 0.14, PAL.steel);           // stone frame
    room.bx(gx0 - 0.22, gy1, z, gx1 + 0.22, gy1 + 0.22, z + 0.14, PAL.steel);
    room.bx(gx0 - 0.22, gy0, z, gx0, gy1, z + 0.14, PAL.slate); room.bx(gx1, gy0, z, gx1 + 0.22, gy1, z + 0.14, PAL.slate);
    for (let x = gx0 + 0.3; x < gx1 - 0.1; x += 0.36) room.bx(x - 0.04, gy0, z + 0.04, x + 0.04, gy1, z + 0.1, PAL.void);
    for (const y of [gy0 + 0.6, gy0 + 1.2]) room.bx(gx0, y - 0.04, z + 0.06, gx1, y + 0.04, z + 0.12, PAL.void);
  }
  // ---- the sarcophagus up on a stepped plinth, lid knocked askew with a crack, a bony hand peeking out ----
  {
    const Y = SARC_Y;
    room.bx(-2.7, 0, -12, 2.7, Y * 0.5, -9.6, PAL.slate); room.bx(-2.4, Y * 0.5, -11.95, 2.4, Y, -9.85, PAL.navy);
    room.bx(-2.45, Y - 0.06, -11.95, 2.45, Y, -9.82, PAL.steel);
    room.bx(-1.7, Y, -11.6, 1.7, Y + 1.45, -10.2, PAL.steel);                             // the box
    room.bx(-1.78, Y, -11.65, 1.78, Y + 0.18, -10.14, PAL.haze); room.bx(-1.78, Y + 1.3, -11.65, 1.78, Y + 1.45, -10.14, PAL.haze);
    room.bx(-1.3, Y + 0.35, -10.2, 1.3, Y + 1.15, -10.16, PAL.slate);                     // front panel with a goofy carved face
    for (const ex of [-0.55, 0.45]) room.bx(ex - 0.16, Y + 0.78, -10.16, ex + 0.16, Y + 1.0, -10.14, PAL.void);
    for (let i = 0; i < 6; i++) room.bx(-0.6 + i * 0.22, Y + 0.48, -10.16, -0.6 + i * 0.22 + 0.15, Y + 0.62, -10.13, i & 1 ? PAL.mist : PAL.bone);
    const m = new THREE.Matrix4().makeRotationY(0.16).setPosition(0.3, Y + 1.6, -10.85);
    room.box(0, 0, 0, 3.7, 0.3, 1.55, PAL.steel, m); room.box(0, 0.17, 0, 3.3, 0.06, 1.25, PAL.haze, m);
    [[-1.2, 0.1], [-0.9, -0.25], [-0.55, 0.05], [-0.2, -0.3], [0.1, 0.0]].forEach(([cx, cz], i, a) => {   // zig-zag crack across the lid
      if (i < a.length - 1) { const [nx, nz] = a[i + 1]; room.box((cx + nx) / 2, 0.205, (cz + nz) / 2, Math.hypot(nx - cx, nz - cz) + 0.06, 0.02, 0.07, PAL.void,
        new THREE.Matrix4().makeRotationY(-Math.atan2(nz - cz, nx - cx)).premultiply(m)); }
    });
    room.bx(-1.62, Y + 1.45, -10.3, 1.0, Y + 1.49, -10.22, PAL.void);                     // the dark gap under the shoved lid
    for (let f = 0; f < 4; f++) room.bx(-1.45 + f * 0.13, Y + 1.42, -10.24, -1.38 + f * 0.13, Y + 1.5, -10.05 + (f & 1) * 0.04, PAL.bone);   // fingers
    room.bx(-1.5, Y + 1.43, -10.3, -0.95, Y + 1.5, -10.2, PAL.mist);
    const rip = R.small('RIP'), s = 0.06;
    for (const [px, py] of rip.px) room.bx(-0.33 + px * s, Y + 0.32 - (py + 1) * s, -10.16, -0.33 + (px + 1) * s, Y + 0.32 - py * s, -10.12, PAL.navy);
  }
  // ---- the bone heap: a heightfield of 0.5 columns, scattered long bones and little skulls on top ----
  {
    const TOP = [PAL.slate, PAL.steel, PAL.slate, PAL.navy, PAL.steel];
    for (let x = -7.75; x < 7.75; x += 0.5) for (let z = -10.5; z < -1.0; z += 0.5) {
      const h = pileH(x + 0.25, z + 0.25); if (h < 0.04) continue;
      room.bx(x, 0, z, x + 0.5, h, z + 0.5, pick(TOP), null, 63 ^ 8);
    }
    const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
    const bone = (x, z, len, yaw, tilt, col) => {
      const y = pileH(x, z) + 0.05;
      _m.makeRotationY(yaw); _r.makeRotationZ(tilt); _m.multiply(_r); _m.setPosition(x, y, z);
      room.box(0, 0, 0, len, 0.1, 0.1, col, _m, 63 ^ 8);
      for (const e of [-1, 1]) room.box(e * len / 2, 0, 0, 0.13, 0.15, 0.25, col, _m, 63 ^ 8);
    };
    for (let n = 0; n < 300; n++) {
      const x = -7.4 + rng() * 14.8, z = -10.2 + rng() * 8.9;
      bone(x, z, 0.4 + rng() * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.5, rng() < 0.6 ? PAL.bone : PAL.mist);
    }
    for (let n = 0; n < 7; n++) bone(-6 + n * 2 + rng(), -0.6 - rng() * 0.6, 0.4, rng() * Math.PI, 0, PAL.mist);   // a few spilled toward us
    for (let n = 0; n < 34; n++) {                                                       // little skulls in the heap, staring at us
      const x = -7.2 + rng() * 14.4, z = -10 + rng() * 8.5, y = pileH(x, z) + 0.08;
      _m.makeRotationY((rng() - 0.5) * 1.2); _r.makeRotationX(-0.25); _m.multiply(_r); _m.setPosition(x, y, z);
      room.box(0, 0.02, 0, 0.26, 0.2, 0.24, PAL.bone, _m); room.box(0, -0.08, 0.04, 0.18, 0.06, 0.18, PAL.mist, _m);
      room.box(-0.065, 0.03, 0.121, 0.07, 0.07, 0.01, PAL.void, _m); room.box(0.065, 0.03, 0.121, 0.07, 0.07, 0.01, PAL.void, _m);
    }
  }
  // ---- candles (stick + drip + wick on the env, flame on the glow mesh) ----
  for (const [x, y, z, h] of CANDLES) {
    room.bx(x - 0.15, y, z - 0.15, x + 0.15, y + 0.03, z + 0.15, PAL.sand);
    room.bx(x - 0.07, y, z - 0.07, x + 0.07, y + h, z + 0.07, PAL.bone);
    room.bx(x + 0.04, y + h * 0.45, z + 0.06, x + 0.08, y + h, z + 0.09, PAL.mist);
    room.bx(x - 0.01, y + h, z - 0.01, x + 0.01, y + h + 0.04, z + 0.01, PAL.void);
    glow.bx(x - 0.05, y + h + 0.03, z - 0.05, x + 0.05, y + h + 0.09, z + 0.05, PAL.orange);
    glow.bx(x - 0.035, y + h + 0.09, z - 0.035, x + 0.035, y + h + 0.2, z + 0.035, PAL.lemon);
    glow.bx(x - 0.015, y + h + 0.2, z - 0.015, x + 0.015, y + h + 0.26, z + 0.015, PAL.yellow);
  }
  // ---- cobwebs: radial strands + sagging rings in the corners ----
  const strand = (ax, ay, bx, by, z) => {
    const l = Math.hypot(bx - ax, by - ay), m = new THREE.Matrix4().makeRotationZ(Math.atan2(by - ay, bx - ax)).setPosition((ax + bx) / 2, (ay + by) / 2, z);
    room.box(0, 0, 0, l + 0.03, 0.04, 0.02, PAL.mist, m);
  };
  const web = (cx, cy, z, a0, a1, r) => {
    const N = 5, pts = [];
    for (let k = 0; k < N; k++) { const a = a0 + (a1 - a0) * k / (N - 1); pts.push(a); strand(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z); }
    for (const f of [0.35, 0.62, 0.88]) for (let k = 0; k < N - 1; k++) {
      const ra = r * f;
      strand(cx + Math.cos(pts[k]) * ra, cy + Math.sin(pts[k]) * ra, cx + Math.cos(pts[k + 1]) * ra, cy + Math.sin(pts[k + 1]) * ra, z);
    }
  };
  web(-7.95, 7.55, -11.85, -Math.PI / 2, 0, 1.7);
  web(7.95, 7.55, -11.85, Math.PI, Math.PI * 1.5, 1.5);
  web(-ARCH.ai + 0.05, ARCH.cy + 0.25, ARCH.z1 + 0.05, 0.05, Math.PI / 2 - 0.15, 1.0);
  web(1.95, 6.0, ARCH.z1 + 0.2, Math.PI * 1.05, Math.PI * 1.45, 0.8);
  // ---- foreground: a low crypt ledge with bones and two candles (sits in the HUD band, nothing to shoot there) ----
  for (let x = -8; x < 8; x += 1) {
    room.bx(x + 0.03, 0, 0.35, x + 0.97, 0.3, 1.15, (x & 1) ? PAL.slate : PAL.navy);
    room.bx(x, 0.3, 0.3, x + 1, 0.36, 1.2, PAL.steel);
  }
  {
    const _m = new THREE.Matrix4();
    [[-1.6, 0.6, 0.3], [0.9, 0.85, -0.5], [5.4, 0.75, 1.2], [-5.6, 0.8, 2.2]].forEach(([x, z, yaw]) => {
      _m.makeRotationY(yaw).setPosition(x, 0.4, z); room.box(0, 0, 0, 0.5, 0.07, 0.07, PAL.bone, _m);
      for (const e of [-1, 1]) { room.box(e * 0.25, 0, -0.04, 0.1, 0.1, 0.08, PAL.bone, _m); room.box(e * 0.25, 0, 0.04, 0.1, 0.1, 0.08, PAL.bone, _m); }
    });
  }
  const roomMesh = room.mesh(MAT.env); roomMesh.userData.env = true;
  group.add(roomMesh, glow.mesh(MAT.glow));
  group.userData.shootables = [roomMesh];
  return group;
}

// =========================================================================================
// Characters: SDF shapes sampled on a voxel lattice (like duck.js), smooth-ish normals, drawn with a
// palette toon material: shadow / base / lit tone (all palette colours) + a void rim outline.
// No gloss band (props and characters are bone and felt, not plastic). Output alpha 1 = object class.
// =========================================================================================
const TOON_VS = `
attribute vec3 cB; attribute vec3 cL; attribute vec3 cH; attribute float aE; attribute float aJ;
uniform float uJaw; uniform vec2 uJawP;               // the jaw is part of the skull mesh: hinged here (no extra draw call)
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying float vE; varying vec3 vN; varying vec3 vP;
#include <fog_pars_vertex>
void main() {
  vB = cB; vL = cL; vH = cH; vE = aE;
  vec3 pos = position, nor = normal;
  if (aJ > 0.5) { float c = cos(uJaw), s = sin(uJaw); vec2 q = pos.yz - uJawP;
    pos.yz = uJawP + vec2(q.x * c - q.y * s, q.x * s + q.y * c); nor.yz = vec2(nor.y * c - nor.z * s, nor.y * s + nor.z * c); }
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vP = mvPosition.xyz; vN = normalize(normalMatrix * nor);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TOON_FS = `
uniform vec3 uLight; uniform float uHi; uniform float uLo; uniform float uRim;
varying vec3 vB; varying vec3 vL; varying vec3 vH; varying float vE; varying vec3 vN; varying vec3 vP;
#include <fog_pars_fragment>
void main() {
  vec3 n = normalize(vN);
  float d = dot(n, uLight);
  vec3 c = d > uHi ? vH : (d > uLo ? vB : vL);
  if (vE > 0.5) c = vB;
  if (dot(n, normalize(-vP)) < uRim) c = vec3(0.0431, 0.0431, 0.1020);
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;
let TOON = null;
function toon() {
  if (TOON) return TOON;
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uLight: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() }, uHi: { value: 0.7 }, uLo: { value: 0.1 }, uRim: { value: 0.2 },
    uJaw: { value: 0 }, uJawP: { value: new THREE.Vector2(JAW_P[1] * DV, JAW_P[2] * DV) } }]);
  return (TOON = new THREE.ShaderMaterial({ uniforms: u, vertexShader: TOON_VS, fragmentShader: TOON_FS, fog: true }));
}
// colour spec 'base' or 'base/shadow/lit' (palette names) -> rgb triples
const TONES = { bone: ['mist', 'bone'], mist: ['haze', 'bone'], haze: ['steel', 'mist'], steel: ['slate', 'haze'], slate: ['navy', 'steel'],
  navy: ['midnight', 'slate'], midnight: ['void', 'navy'], void: ['void', 'midnight'], indigo: ['midnight', 'plum'], plum: ['indigo', 'magenta'],
  magenta: ['plum', 'pink'], pink: ['magenta', 'bubblegum'], red: ['crimson', 'coral'], crimson: ['oxblood', 'red'], coral: ['red', 'bubblegum'],
  yellow: ['amber', 'lemon'], lemon: ['yellow', 'bone'], amber: ['orange', 'yellow'], orange: ['rust', 'amber'], sand: ['tan', 'lemon'],
  cyan: ['blue', 'ice'], lime: ['green', 'lemon'], green: ['forest', 'lime'], oxblood: ['umber', 'crimson'] };
const _tc = {};
function tone(s) {
  if (_tc[s]) return _tc[s];
  const p = s.split('/'), t = TONES[p[0]] || [p[0], p[0]], rgb = n => { const h = PAL[n]; return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; };
  return (_tc[s] = { b: rgb(p[0]), l: rgb(p[1] || t[0]), h: rgb(p[2] || t[1]), hex: PAL[p[0]] });
}
const DV = 0.05;                                         // character voxel (world units)
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz, k0 = len3(x, y, z), k1 = len3(x / rx, y / ry, z / rz);
  return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
function sdCap(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const FACES = [[1, 0, 0, [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1]], [-1, 0, 0, [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1]],
  [0, 1, 0, [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1]], [0, -1, 0, [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1]],
  [0, 0, 1, [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]], [0, 0, -1, [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1]]];
// voxelise shape (cells centred on i+.5) in bounds b (voxel units) -> { geo, list (surface voxels, for chips), ox, oy, oz }
// paint(x,y,z) -> 'spec' | { c: 'spec', e: 1 (unlit) } | null; pivot = model origin in voxel units
function build(b, shape, paint, pivot) {
  const [px, py, pz] = pivot || [0, 0, 0], map = new Map(), key = (i, j, k) => ((i + 256) * 512 + (j + 256)) * 512 + (k + 256);
  for (let i = Math.floor(b[0]); i < Math.ceil(b[3]); i++) for (let j = Math.floor(b[1]); j < Math.ceil(b[4]); j++) for (let k = Math.floor(b[2]); k < Math.ceil(b[5]); k++) {
    const x = i + 0.5, y = j + 0.5, z = k + 0.5;
    if (shape(x, y, z) >= 0) continue;
    let p = paint(x, y, z); if (!p) continue; if (typeof p === 'string') p = { c: p };
    map.set(key(i, j, k), { i, j, k, p });
  }
  const P = [], N = [], CB = [], CL = [], CH = [], AE = [], AJ = [], I = [], list = [], e = 1.1; let vc = 0;
  for (const v of map.values()) {
    const x = v.i + 0.5, y = v.j + 0.5, z = v.k + 0.5;
    let gx = shape(x + e, y, z) - shape(x - e, y, z), gy = shape(x, y + e, z) - shape(x, y - e, z), gz = shape(x, y, z + e) - shape(x, y, z - e);
    const gl = len3(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    const C = tone(v.p.c); let exposed = false;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f]; if (map.has(key(v.i + F[0], v.j + F[1], v.k + F[2]))) continue;
      exposed = true;
      let nx = F[0] * 0.3 + gx * 0.7, ny = F[1] * 0.3 + gy * 0.7, nz = F[2] * 0.3 + gz * 0.7; const nl = len3(nx, ny, nz) || 1;
      const q = F[3];
      for (let w = 0; w < 12; w += 3) {
        P.push((x + q[w] * 0.5 - px) * DV, (y + q[w + 1] * 0.5 - py) * DV, (z + q[w + 2] * 0.5 - pz) * DV); N.push(nx / nl, ny / nl, nz / nl);
        CB.push(...C.b); CL.push(...C.l); CH.push(...C.h); AE.push(v.p.e ? 1 : 0); AJ.push(0);
      }
      I.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3); vc += 4;
    }
    if (exposed) list.push([v.i, v.j, v.k, C.hex]);
  }
  const g = new THREE.BufferGeometry(), A = (a, n) => new THREE.Float32BufferAttribute(a, n);
  g.setAttribute('position', A(P, 3)); g.setAttribute('normal', A(N, 3)); g.setAttribute('cB', A(CB, 3)); g.setAttribute('cL', A(CL, 3));
  g.setAttribute('cH', A(CH, 3)); g.setAttribute('aE', A(AE, 1)); g.setAttribute('aJ', A(AJ, 1)); g.setIndex(I); g.computeBoundingBox(); g.computeBoundingSphere();
  return { geo: g, list, ox: (0.5 - px) * DV, oy: (0.5 - py) * DV, oz: (0.5 - pz) * DV };
}

// ---- skeleton body (origin = pelvis base; the pile hides the legs). frame 0: arms up "BOO!", 1: arms flung out ----
const NECK_Y = 20.6;                                     // neck top (voxels): the skull pivot
const RIB = (y) => ((y - 7.2) % 2.6 + 2.6) % 2.6 < 1.6;
function bodyShape(frame) {
  return (x, y, z) => {
    let d = sdEll(x, y, z, 0, 2.6, 0, 5.2, 2.6, 3.2);
    d = Math.min(d, sdCap(x, y, z, 0, 2, -0.4, 0, 12, -0.6, 1.4), sdEll(x, y, z, 0, 12.6, 0.6, 6.4, 5.8, 4.4));
    d = Math.min(d, sdCap(x, y, z, -6.6, 17.6, 0, 6.6, 17.6, 0, 1.35), sdCap(x, y, z, 0, 16, 0, 0, NECK_Y, 0, 1.15));
    for (const s of [-1, 1]) {
      d = Math.min(d, sdCap(x, y, z, s * 2.6, 1.5, 0, s * 3.0, -9, 0.6, 1.3));
      const el = frame ? [s * 10.8, 19.4, 1.6] : [s * 9.4, 22.6, 2.6], ha = frame ? [s * 14.2, 23.4, 2.8] : [s * 9.2, 27.4, 4.6];
      d = Math.min(d, sdCap(x, y, z, s * 6.8, 17.6, 0, el[0], el[1], el[2], 1.15), sdCap(x, y, z, el[0], el[1], el[2], ha[0], ha[1], ha[2], 1.05));
      d = Math.min(d, sdEll(x, y, z, ha[0], ha[1] + 0.6, ha[2], 1.9, 1.6, 1.3));
      for (const fx of [-1.1, 0, 1.1]) {
        const dir = frame ? [s * 0.8, 1, 0] : [0, 1, 0.3];
        d = Math.min(d, sdCap(x, y, z, ha[0] + fx * (frame ? 0.4 : 1), ha[1] + 1.2 + (frame ? -fx * s * 0.9 : 0), ha[2], ha[0] + fx * (frame ? 0.4 : 1) + dir[0] * 2.2, ha[1] + 1.2 + (frame ? -fx * s * 0.9 : 0) + dir[1] * 2.2, ha[2] + dir[2] * 2.2, 0.5));
      }
    }
    return d;
  };
}
function bodyPaint(bone, gap) {
  return (x, y, z) => {
    if (y > 6.8 && y < 18.2 && Math.abs(x) > 1.3 && sdEll(x, y, z, 0, 12.6, 0.6, 6.4, 5.8, 4.4) < 0.8) return RIB(y) ? bone : gap;
    if (Math.abs(x) < 1.6 && y > 3 && y < 7.2) return (Math.floor(y) & 1) ? bone : gap;   // vertebrae
    return bone;
  };
}
// ---- skull (origin = neck top). hat: 0 none, 1 top hat, 2 party hat, 3 bow. bomb: black skull, red eyes, wax on top ----
const EYE = [3.4, 7.3, 6.9], PUP = [3.1, 7.0, 5.3];
const sockets = (x, y, z) => Math.min(sdEll(x, y, z, -EYE[0], EYE[1], EYE[2], 2.7, 3.0, 2.6), sdEll(x, y, z, EYE[0], EYE[1], EYE[2], 2.7, 3.0, 2.6));
const pupils = (x, y, z) => Math.min(sdEll(x, y, z, -PUP[0], PUP[1], PUP[2], 1.35, 1.5, 1.2), sdEll(x, y, z, PUP[0], PUP[1], PUP[2], 1.35, 1.5, 1.2));
const nose = (x, y, z) => sdEll(x, y, z, 0, 4.4, 7.5, 1.15, 1.35, 2.2);
function rotZ(x, y, a, cx, cy) { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c + dy * s, cy - dx * s + dy * c]; }
function hatSd(hat, x, y, z) {
  if (hat === 1) { const [hx, hy] = rotZ(x, y, -0.2, 0, 15.5); const r = Math.hypot(hx - 0.8, z);
    return Math.min(Math.max(r - 7.0, Math.abs(hy - 15.9) - 0.6), Math.max(r - 4.4, hy - 24.5, 15.5 - hy)); }
  if (hat === 2) { const [hx, hy] = rotZ(x, y, 0.28, 0, 14.5); const r = Math.hypot(hx + 0.5, z), rr = 4.5 * (27 - hy) / 12.5;
    return Math.min(Math.max(r - rr, 14.5 - hy, hy - 27), sdEll(hx, hy, z, -0.5, 27.4, 0, 1.9, 1.9, 1.9)); }
  if (hat === 3) return Math.min(sdEll(x, y, z, -6.2, 14.6, 1.5, 2.3, 1.7, 1.2), sdEll(x, y, z, -2.4, 15.6, 1.5, 2.3, 1.7, 1.2), sdEll(x, y, z, -4.3, 15.1, 2.0, 1.1, 1.1, 1.1));
  if (hat === 9) return Math.min(sdEll(x, y, z, 0, 15.8, 0, 4.3, 1.5, 4.3), sdCap(x, y, z, 3.2, 15.5, 1.6, 4.2, 11.5, 2.6, 0.75), sdCap(x, y, z, -2.6, 15.5, 2.6, -3.4, 12.6, 3.8, 0.7));   // bomb: wax
  return 1e3;
}
function hatPaint(hat, x, y, z) {
  if (hat === 1) { const [, hy] = rotZ(x, y, -0.2, 0, 15.5); return hy > 16.8 && hy < 18.4 ? 'crimson' : 'midnight/void/navy'; }
  if (hat === 2) { const [hx, hy] = rotZ(x, y, 0.28, 0, 14.5); if (hy > 25.6) return 'lemon';
    return (Math.floor((hy + Math.atan2(z, hx + 0.5) * 1.6) / 2.2) & 1) ? 'magenta' : 'yellow'; }
  if (hat === 3) return Math.abs(x + 4.3) < 1.2 ? 'crimson' : 'red';
  return 'bone/mist/bone';
}
function skullShape(hat) {
  return (x, y, z) => {
    let d = smin(sdEll(x, y, z, 0, 8.6, 0, 8.4, 7.6, 7.6), sdEll(x, y, z, 0, 3.6, 2.4, 6.4, 3.8, 5.6), 2.5);
    d = smin(d, Math.min(sdEll(x, y, z, -5.2, 4.6, 4.0, 2.2, 1.8, 2.4), sdEll(x, y, z, 5.2, 4.6, 4.0, 2.2, 1.8, 2.4)), 1.2);
    d = Math.max(d, -sockets(x, y, z), -nose(x, y, z));
    return Math.min(d, pupils(x, y, z), hatSd(hat, x, y, z));
  };
}
function skullPaint(hat, bomb) {
  const SK = bomb ? 'midnight/void/slate' : 'bone', TG = bomb ? 'bone' : 'bone';
  return (x, y, z) => {
    if (hatSd(hat, x, y, z) < 0.5) return hatPaint(hat, x, y, z);
    if (pupils(x, y, z) < 0.4) return bomb ? { c: 'red', e: 1 } : 'bone';
    if (sockets(x, y, z) < 0.9 || nose(x, y, z) < 0.9) return bomb ? 'oxblood/void/crimson' : 'void';
    if (y < 2.7 && y > 0.2 && z > 3.8 && Math.abs(x) < 5.4) { if (y < 0.95) return 'void'; return (((Math.floor(x) % 3) + 3) % 3 === 0) ? (bomb ? 'void' : 'haze') : TG; }
    if (!bomb && x < -2 && y > 11 && y < 15.5 && Math.abs(x + 3.4 - (y - 11) * 0.45 * ((Math.floor(y) & 1) ? 1 : -0.3)) < 0.55 && z > 1) return 'steel';   // a little crack
    return SK;
  };
}
// jaw (origin = hinge at skull (0, 1.6, -1.5)); teeth along the top front
const JAW_P = [0, 1.6, -1.5];
const jawShape = (x, y, z) => Math.max(sdEll(x, y, z, 0, -0.4, 2.6, 5.6, 2.1, 4.9), y - 1.0);
const jawPaint = bomb => (x, y, z) => (y > 0 && z > 3.6 && Math.abs(x) < 5) ? ((((Math.floor(x) % 3) + 3) % 3 === 0) ? (bomb ? 'void' : 'haze') : 'bone') : (bomb ? 'midnight/void/slate' : 'bone');
// bomb candle (origin = its base on the wax) and flame (glow, origin = wick top)
const CANDLE_H = 9;
const candleShape = (x, y, z) => Math.min(Math.max(Math.hypot(x, z) - 1.9, -y, y - CANDLE_H), sdCap(x, y, z, 1.6, CANDLE_H - 0.5, 1.0, 2.0, CANDLE_H - 4, 1.4, 0.6), sdCap(x, y, z, 0, CANDLE_H, 0, 0, CANDLE_H + 1.4, 0, 0.45));
const candlePaint = (x, y) => y > CANDLE_H + 0.3 ? 'void' : (y > CANDLE_H - 1.2 ? 'coral' : 'red');
// bat (origin = body centre). frame 0 wings up, 1 wings down
function batShape(frame) {
  return (x, y, z) => {
    let d = Math.min(sdEll(x, y, z, 0, 0, 0, 2.6, 3.0, 2.4), sdCap(x, y, z, -1.4, 2, 0, -2.2, 4.6, 0, 0.8), sdCap(x, y, z, 1.4, 2, 0, 2.2, 4.6, 0, 0.8));
    for (const s of [-1, 1]) {
      const wy = frame ? -2.0 : 2.6, w = sdEll(x, y, z, s * 6.6, wy, -0.3, 5.0, 2.6, 0.6);
      let cut = 1e3; for (const k of [0, 1, 2]) cut = Math.min(cut, sdEll(x, y, z, s * (3.6 + k * 2.8), wy - 2.9, -0.3, 1.5, 1.4, 2));
      d = Math.min(d, Math.max(w, -cut));
    }
    return Math.min(d, sdEll(x, y, z, -1.1, 0.7, 2.0, 0.8, 0.8, 0.6), sdEll(x, y, z, 1.1, 0.7, 2.0, 0.8, 0.8, 0.6));
  };
}
const batPaint = (x, y, z) => (z > 1.6 && y > 0 && y < 1.6 && Math.abs(Math.abs(x) - 1.1) < 0.9) ? { c: 'lemon', e: 1 } : (Math.abs(x) > 3 ? (Math.abs(((x % 2.8) + 2.8) % 2.8 - 1.4) < 0.25 ? 'void' : 'magenta/plum/pink') : 'indigo/midnight/plum');
// skull + jaw in one geometry: jaw vertices moved from hinge space to skull space and flagged aJ = 1
function withJaw(sk, jw) {
  const g = new THREE.BufferGeometry(), a = sk.geo, b = jw.geo, nA = a.attributes.position.count;
  for (const k of ['position', 'normal', 'cB', 'cL', 'cH', 'aE', 'aJ']) {
    const A = a.attributes[k].array, Bv = b.attributes[k].array.slice(), n = a.attributes[k].itemSize;
    if (k === 'position') for (let i = 0; i < Bv.length; i += 3) { Bv[i + 1] += JAW_P[1] * DV; Bv[i + 2] += JAW_P[2] * DV; }
    if (k === 'aJ') Bv.fill(1);
    const m = new Float32Array(A.length + Bv.length); m.set(A); m.set(Bv, A.length); g.setAttribute(k, new THREE.BufferAttribute(m, n));
  }
  const ia = a.index.array, ib = b.index.array, idx = new Uint32Array(ia.length + ib.length); idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + nA;
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingBox(); g.computeBoundingSphere();
  return { geo: g, list: sk.list.concat(jw.list), ox: sk.ox, oy: sk.oy, oz: sk.oz };
}
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const BB = [-17, -10, -7, 17, 32, 9], SB = [-12, -1, -8, 12, 30, 10];
  GEO = { body: [0, 1].map(f => build(BB, bodyShape(f), bodyPaint('bone', 'navy'))),
    bombBody: [0, 1].map(f => build(BB, bodyShape(f), bodyPaint('slate/navy/steel', 'void'))),
    skull: [0, 1, 2, 3].map(h => withJaw(build(SB, skullShape(h), skullPaint(h, false)), build([-7, -4, -4, 7, 2, 9], jawShape, jawPaint(false), JAW_P))),
    bombSkull: withJaw(build(SB, skullShape(9), skullPaint(9, true)), build([-7, -4, -4, 7, 2, 9], jawShape, jawPaint(true), JAW_P)),
    candle: build([-3, -1, -3, 3, CANDLE_H + 2, 3], candleShape, candlePaint),
    bat: [0, 1].map(f => build([-12, -7, -3, 12, 7, 4], batShape(f), batPaint)) };
  const fl = new Vox();                                  // candle flame, unlit (origin = wick top, world units)
  fl.bx(-0.07, 0, -0.07, 0.07, 0.08, 0.07, PAL.orange); fl.bx(-0.05, 0.08, -0.05, 0.05, 0.22, 0.05, PAL.lemon); fl.bx(-0.02, 0.22, -0.02, 0.02, 0.3, 0.02, PAL.yellow);
  GEO.flame = fl.geo();
  return GEO;
}

// =========================================================================================
// Motion: every pose is a pure function of (spawn, local time lt).
//  rise   lurch up out of the heap (easeOutBack, leaning), shootable from 15 % of the rise
//  hold   'sway' (lurch side to side) | 'shake' (skull shakes NO-NO, jaw chatters) | 'rattle' (whole rig jitters)
//  sink   back into the heap; shootable until 70 % of the way down
//  throw  rise, sway a bit, wind up (lean back), THROW the skull at the camera: it arcs in, tumbling twice so it
//         arrives face first, and BONKS the screen (a small shake, nothing else). The headless body flails and sinks.
// =========================================================================================
const SC = 1.25;                                         // skeletons are drawn 1.25x (big goofy skulls)
const RISE_D = 2.65, LEAVE = 0.36, WIND = 0.42, HEADLESS = 0.5, BONK = 0.62, FLIP_T = 0.12;
const SKC = 8.6 * DV;                                    // skull centre above the neck pivot
const NECK = NECK_Y * DV, LEAN = -0.38;
function flightPos(sp, s, out) {                         // skull centre in root space at flight fraction s (0..1)
  const r = (NECK + SKC) * SC, x0 = 0, y0 = r * Math.cos(LEAN), z0 = r * Math.sin(LEAN);
  const x1 = sp.bx - sp.x, y1 = 1.82 - sp.y, z1 = 3.0 - sp.z, arc = 0.25 + 0.035 * (z1 - z0);
  out.hx = x0 + (x1 - x0) * s; out.hy = y0 + (y1 - y0) * s + arc * 4 * s * (1 - s); out.hz = z0 + (z1 - z0) * s;
  return out;
}
function lifeOf(sp) {
  if (sp.act === 'throw') return Math.max(sp.throwAt + sp.fly + BONK, sp.throwAt + HEADLESS + LEAVE);
  return sp.rise + sp.stay + LEAVE;
}
const win = (tau, a, b) => (tau > a && tau < b) ? Math.sin(Math.PI * (tau - a) / (b - a)) : 0;
function hold(sp, tau, o, len) {
  const ph = sp.ph, w = Math.exp(-6 * tau);
  o.rz = 0.07 * Math.sin(2.4 * tau + ph) + sp.side * -0.16 * w * Math.sin(14 * tau);
  o.frame = ((tau * 3 + ph) | 0) & 1; o.jaw = 0.12 + 0.12 * Math.sin(6 * tau + ph);
  if (sp.act === 'sway' || sp.act === 'throw') {
    const s = Math.sin(3.1 * tau + ph);
    o.rz += 0.15 * s; o.dx = 0.12 * s; o.hrz = -0.16 * Math.sin(3.1 * tau + ph + 0.7); o.frame = ((tau * 4 + ph) | 0) & 1;
  } else if (sp.act === 'shake') {
    const e = win(tau, 0.12 * len, 0.82 * len);
    o.hry = 0.55 * e * Math.sin(19 * tau); o.jaw += 0.32 * e * (((tau * 16) | 0) & 1); o.hrx = -0.08 * e;
  } else if (sp.act === 'rattle') {
    const e = win(tau, 0.1 * len, 0.85 * len);
    o.dx = 0.05 * e * Math.sin(57 * tau); o.rz += 0.07 * e * Math.sin(43 * tau); o.hrz = 0.12 * e * Math.sin(37 * tau);
    o.jaw += 0.4 * e * (((tau * 20) | 0) & 1); o.y = 0.05 * e * Math.abs(Math.sin(30 * tau)); if (e > 0) o.frame = ((tau * 14) | 0) & 1;
    o.rattle = e > 0;
  }
}
function pose(sp, lt, out) {
  const o = out || {};
  o.visible = lt >= 0; o.y = 0; o.dx = 0; o.rx = 0; o.rz = 0; o.frame = 0; o.hrx = 0; o.hry = 0; o.hrz = 0; o.jaw = 0.1;
  o.fly = false; o.skullOnly = false; o.headGone = false; o.bodyGone = false; o.skullGone = false; o.bonkT = -1; o.rattle = false;
  o.shootable = false; o.done = false; o.phase = 'rise';
  if (lt < 0) return o;
  if (lt < sp.rise) {                                                        // lurch up out of the heap
    const p = lt / sp.rise;
    o.y = -RISE_D * (1 - E.outBack(p)); o.rz = sp.side * 0.3 * (1 - p); o.frame = ((lt * 9) | 0) & 1; o.jaw = 0.45;
    o.shootable = lt >= sp.readyAt; return o;
  }
  const tau = lt - sp.rise;
  if (sp.act === 'throw') {
    if (tau < sp.hold1) { o.phase = 'hold'; hold(sp, tau, o, sp.hold1); o.shootable = true; return o; }
    if (tau < sp.hold1 + WIND) {                                             // wind-up: lean back, skull tips back, jaw drops
      const q = (tau - sp.hold1) / WIND;
      o.phase = 'wind'; o.rx = LEAN * E.outCubic(q); o.hrx = -0.3 * q; o.jaw = 0.5 * q; o.frame = 0; o.shootable = true; return o;
    }
    const f = lt - sp.throwAt;
    o.phase = 'thrown'; o.headGone = true;
    o.rx = 0.32 * Math.exp(-5 * f); o.rz = 0.14 * Math.sin(f * 20) * Math.exp(-2 * f); o.frame = ((f * 12) | 0) & 1;   // headless flailing
    if (f > HEADLESS) { const q = (f - HEADLESS) / LEAVE; if (q < 1) o.y = -RISE_D * E.inCubic(q); else o.bodyGone = true; }
    if (f < sp.fly) {                                                        // in the air: the ONLY shootable part
      const s = f / sp.fly; flightPos(sp, s, o);
      o.fly = true; o.skullOnly = true; o.shootable = true;
      o.hrx = -4 * Math.PI * s; o.hry = 0.3 * Math.sin(s * 9); o.jaw = 0.4 * (((f * 14) | 0) & 1);
    } else if (f < sp.fly + BONK) {                                          // BONK: bounce off the screen and drop away
      const q = (f - sp.fly) / BONK; flightPos(sp, 1, o);
      o.fly = true; o.bonkT = q; o.hx += sp.side * 1.4 * q; o.hy += 0.45 * Math.sin(Math.PI * q) - 3.4 * q * q; o.hz -= 0.6 * q;
      o.hrz = sp.side * 5 * q; o.hrx = 0.5 * q; o.jaw = 0.55;
    } else o.skullGone = true;
    o.done = o.bodyGone && o.skullGone; o.visible = !o.done;
    return o;
  }
  if (tau < sp.stay) { o.phase = 'hold'; hold(sp, tau, o, sp.stay); o.shootable = true; return o; }
  const q = (tau - sp.stay) / LEAVE;
  if (q < 1) { o.phase = 'sink'; o.y = -RISE_D * E.inCubic(q); o.jaw = 0.3; o.shootable = q < 0.7; return o; }
  o.visible = false; o.done = true; return o;
}

// hit zones (#skull vs ribs): each zone's meshes carry mesh.userData.zone; the engine passes it along
// Targets.pick -> Run.applyHit -> points(sp, lt, zone) (versus: shot.z -> hostClaim -> hit.z, see ENGINE.md).
// a ray that meets the heap first must not hit the part of a skeleton still buried in it
function heapRaycast(rc, out) {
  const n = out.length; THREE.Mesh.prototype.raycast.call(this, rc, out);
  for (let i = out.length - 1; i >= n; i--) { const p = out[i].point; if (p.z < -1 && p.y < pileH(p.x, p.z) - 0.1) out.splice(i, 1); }
}
const _wp = new THREE.Vector3();
class Skeleton extends T.Target {
  constructor(sp) {
    super(sp.bomb ? 'bomb' : 'target');
    const G = geos(), M = toon(); this.sp = sp; this.P = {}; this.lastLt = 0; this.flipped = false;
    const mk = g => { const m = new THREE.Mesh(g.geo, M); m.userData.sharedGeo = true; m.raycast = heapRaycast; return m; };
    this.group.position.set(sp.x, sp.y, sp.z);
    this.rig = new THREE.Group(); this.rig.scale.setScalar(SC); this.group.add(this.rig);
    this.bodyG = sp.bomb ? G.bombBody : G.body;
    this.body = mk(this.bodyG[0]); this.rig.add(this.body);
    this.head = new THREE.Group(); this.head.position.y = NECK; this.rig.add(this.head);
    this.skc = new THREE.Group(); this.skc.position.y = SKC; this.head.add(this.skc);
    const sk = sp.bomb ? G.bombSkull : G.skull[sp.hat || 0];
    this.skull = mk(sk); this.skull.position.y = -SKC; this.skc.add(this.skull);
    this.jawA = 0.1;                                                          // the jaw angle, set on the shared material per draw
    this.skull.onBeforeRender = (r, s, c, g, m) => { m.uniforms.uJaw.value = this.jawA; m.uniformsNeedUpdate = true; };
    const reg = (mesh, g, zone) => { this.part(mesh, g.list, DV, g.ox, g.oy, g.oz); this.parts[this.parts.length - 1].zone = zone; mesh.userData.zone = zone; };
    reg(this.skull, sk, 'skull'); reg(this.body, this.bodyG[0], 'ribs');
    if (sp.bomb) {                                                            // the red candle + its flame (unlit)
      this.candle = mk(G.candle); this.candle.position.y = 15.4 * DV - SKC; this.skc.add(this.candle);
      reg(this.candle, G.candle, 'skull');
      this.flame = new THREE.Mesh(G.flame, MAT.glow); this.flame.userData.sharedGeo = true; this.skc.add(this.flame);
    }
    this.announced = false; this.bonked = false; this.thrown = false; this.rattled = false; this.headOnly = false;
  }
  meshes() {
    if (this.P.skullOnly) return [this.skull];
    return this.candle ? [this.skull, this.body, this.candle] : [this.skull, this.body];
  }
  applyBody(P) {
    this.rig.position.set(P.dx, P.y, 0); this.rig.rotation.set(P.rx, 0, P.rz);
    this.body.visible = !P.bodyGone;
    const g = (this.flipped ? geos().body : this.bodyG)[P.frame];
    if (this.body.geometry !== g.geo) this.body.geometry = g.geo;
  }
  update(lt) {
    const sp = this.sp, P = pose(sp, lt, this.P); this.lastLt = lt;
    if (!this.alive) {                                                       // skull shot mid-air: the body keeps flailing, then sinks
      if (!this.headOnly) return true;
      this.group.visible = true; this.applyBody(P); this.head.visible = false;
      return P.bodyGone || P.done;
    }
    this.group.visible = P.visible;
    // flip bomb: the candle burns down, then the skull flips round to a real one (kind is a pure function of lt)
    if (sp.bomb) {
      let burn = sp.flip ? clamp(lt / sp.flip, 0, 1) : clamp(lt / (lifeOf(sp) + 1.5), 0, 1);
      const f = sp.flip ? lt - sp.flip : -1, flipped = sp.flip ? f >= FLIP_T / 2 : false;
      if (flipped !== this.flipped) {
        this.flipped = flipped; const G = geos(), sk = flipped ? G.skull[0] : G.bombSkull;
        this.skull.geometry = sk.geo; this.parts[0].list = sk.list; this.parts[1].list = (flipped ? G.body : this.bodyG)[0].list;
        if (flipped) B.SFX.play('bombFlip', { u: this.u() });
      }
      this.kind = flipped ? 'target' : 'bomb';
      this.candle.visible = !flipped; this.candle.scale.y = Math.max(0.1, 1 - 0.9 * burn);
      const fast = sp.flip && burn > 0.65, fl = ((lt * (fast ? 24 : 12)) | 0) % 3;
      this.flame.visible = !flipped && fl !== 2;
      this.flame.position.y = this.candle.position.y + (CANDLE_H + 1.4) * DV * this.candle.scale.y;
      this.flame.scale.set(1, fl ? 1 : 1.35, 1);
      const sx = !sp.flip || f < 0 ? 1 : f < FLIP_T / 2 ? 1 - f / (FLIP_T / 2) : f < FLIP_T ? (f - FLIP_T / 2) / (FLIP_T / 2) : 1;
      this.skc.scale.x = Math.max(0.06, sx);
    }
    this.applyBody(P);
    if (P.fly) {
      if (this.head.parent !== this.group) this.group.add(this.head);
      this.head.position.set(P.hx, P.hy - SKC * SC, P.hz); this.head.scale.setScalar(SC); this.head.rotation.set(0, 0, 0); this.head.visible = true;
    } else {
      if (this.head.parent !== this.rig) this.rig.add(this.head);
      this.head.position.set(0, NECK, 0); this.head.scale.setScalar(1); this.head.visible = !P.headGone;
    }
    this.skc.rotation.set(P.hrx, P.hry, P.hrz); this.jawA = P.jaw;
    this.shootable = P.shootable;
    // sound + feel hooks (edge-triggered; the pose itself never depends on them)
    if (!this.announced && P.visible) { this.announced = true; B.SFX.play('targetIn', { u: this.u() }); this.burst(); }
    if (P.rattle && !this.rattled) { this.rattled = true; B.SFX.play('boneRattle', { u: this.u() }); }
    if (P.phase === 'thrown' && !this.thrown) { this.thrown = true; B.SFX.play('skullThrow', { u: this.u() }); }
    if (P.bonkT >= 0 && !this.bonked) {
      this.bonked = true; B.SFX.play('skullBonk');
      if (B.G && B.G.shakeIt) B.G.shakeIt(0.22);
      this.skc.getWorldPosition(_wp); T.sparks(_wp, 10, ['lemon', 'yellow', 'bone'], 1.2, 0.03);
    }
    return P.done;
  }
  u() { this.group.updateMatrixWorld(true); return R.toPx(this.group.position)[0] / R.RW; }
  burst() {                                                                  // bone chips kicked up where it breaks out of the heap
    const p = _wp.set(this.sp.x, this.sp.y + 0.15, this.sp.z), cols = [PAL.bone, PAL.mist, PAL.haze];
    for (let k = 0; k < 9; k++) T.spawnChip(p, new THREE.Vector3(R.rnd(-1.4, 1.4), R.rnd(1.6, 3.4), R.rnd(-0.4, 1.2)), R.rnd(0.04, 0.08), cols[k % 3], R.rnd(0.5, 0.9), 1, this.sp.y);
  }
  shatter(point, opts) {
    if (this.P.skullOnly) {                                                  // the thrown skull: only it breaks
      const keep = this.parts; this.parts = keep.filter(p => p.zone === 'skull');
      super.shatter(point, opts); this.parts = keep;
      this.group.visible = true; this.head.visible = false; this.headOnly = true; return;
    }
    super.shatter(point, opts);
  }
  explode(point) {
    this.skc.getWorldPosition(_wp);
    T.puff(_wp.clone(), 46, 1.1);
    this.shatter(point || _wp.clone(), { power: 1.7, max: 110 });
  }
}
// the bat: flutters across the crypt. A distraction only: never shootable, never scored.
class Bat extends T.Target {
  constructor(sp) {
    super('decor'); const G = geos();
    this.sp = sp; this.mesh = new THREE.Mesh(G.bat[0].geo, toon()); this.mesh.userData.sharedGeo = true; this.mesh.scale.setScalar(1.7); this.group.add(this.mesh);
    this.shootable = false; this.announced = false;
  }
  meshes() { return []; }
  update(lt) {
    const sp = this.sp, G = geos();
    if (lt > sp.life) { this.group.visible = false; return true; }
    this.group.visible = lt >= 0;
    const x = sp.x0 + sp.dir * sp.v * lt, y = sp.y0 + 0.35 * Math.sin(lt * 4 + sp.ph) + 0.18 * Math.sin(lt * 9.5);
    this.group.position.set(x, y, sp.z + 0.4 * Math.sin(lt * 1.7 + sp.ph));
    this.group.rotation.set(0.15 * Math.sin(lt * 9.5), sp.dir * 0.45, 0.2 * Math.sin(lt * 4 + sp.ph));
    const g = G.bat[((lt * 9) | 0) & 1].geo; if (this.mesh.geometry !== g) this.mesh.geometry = g;
    this.shootable = false;
    if (!this.announced && lt >= 0) { this.announced = true; B.SFX.play('batFlap', { u: sp.dir > 0 ? 0 : 1 }); }
    return false;
  }
}

// =========================================================================================
// Rules per tier (the build 0.003 curve, see ENGINE.md) and variant.
//  rise = lurch-up time; hold = how long a skeleton stays up; quick + mix = top two tiers: about half snap back
//  (hold `quick`, +50 pts); live = max skeletons up at once; g2 / g3 = chance a spawn is a group of 2 / 3 rising
//  together; bomb / bombCap = bomb roll + hard bomb share; thr = skull-thrower share; fly = skull flight time;
//  bats = bat fly-bys (distraction); share = quota share of the real skeletons; rel = magazine reload seconds.
// =========================================================================================
const TIER_P = [
  { time: 42, rise: 0.62, hold: 2.0,  quick: 0,    mix: 0,   live: 4, g2: 0,    g3: 0,    bomb: 0.12, bombCap: 0.10, gap: [0.95, 1.6],  rel: 0.75, share: 0.52, thr: 0.10, fly: 1.3,  bats: 1 },
  { time: 38, rise: 0.5,  hold: 1.35, quick: 0,    mix: 0,   live: 5, g2: 0.15, g3: 0,    bomb: 0.22, bombCap: 0.20, gap: [0.6, 1.15],  rel: 0.7,  share: 0.56, thr: 0.12, fly: 1.15, bats: 2 },
  { time: 35, rise: 0.4,  hold: 1.25, quick: 0.42, mix: 0.5, live: 6, g2: 0.35, g3: 0.12, bomb: 0.34, bombCap: 0.30, gap: [0.45, 0.9],  rel: 0.62, share: 0.58, thr: 0.14, fly: 1.0,  bats: 2 },
  { time: 32, rise: 0.32, hold: 1.05, quick: 0.34, mix: 0.5, live: 7, g2: 0.35, g3: 0.25, bomb: 0.42, bombCap: 0.35, gap: [0.35, 0.75], rel: 0.55, share: 0.6,  thr: 0.16, fly: 0.9,  bats: 3 }
];
const VARIANT_NAMES = ['RISE AND SHINE', 'HEADS UP!', 'GRAVE DANGER'];
function config(tier, v) {
  tier = clamp(tier | 0, 0, 3); v = clamp(v | 0, 0, 2);
  const b = TIER_P[tier], c = Object.assign({}, b);
  c.hold = +(b.hold * (1 - 0.06 * v)).toFixed(3); c.quick = +(b.quick * (1 - 0.04 * v)).toFixed(3);
  c.live = b.live + (v >= 2 ? 1 : 0);
  c.bomb = v >= 2 ? b.bomb + 0.04 : b.bomb;
  c.thr = +(b.thr * [1, 2, 1.5][v]).toFixed(3);
  c.share = Math.min(0.75, b.share + 0.02 * v);
  c.flipbomb = tier >= 2;                            // flip bombs: Very Hard / Insane only
  c.autoReload = false;
  c.ammo = tier === 0 ? 'unlimited' : { mag: v >= 2 ? 8 : 6, reloadTime: b.rel, autoReload: false };
  c.tier = tier; c.variant = v; c.title = 'BONEYARD'; c.subtitle = VARIANT_NAMES[v];
  c.quota = 8;                                       // timeline() derives the real quota; a fixed-seed estimate for menus:
  const est = Object.assign({}, c); timeline(est, B.Stage.mulberry32(0x5eed)); c.quota = est.quota;
  return c;
}
// timeline: every spawn from the seeded rng only. Mix rules copied from the range (#24): bombs <= bombCap share of
// the skeletons so far, never two bombs in a row, a bomb only while at least as many real skeletons are up (and
// staying >= 0.6 s) as bombs. One skull in the air at a time, and throws at least 3.2 s apart.
function timeline(c, rng) {
  const out = [], spotFree = SPOTS.map(() => 0);
  let t = 0.5, guard = 0, bombs = 0, skels = 0, lastThrow = -99, prevBomb = false;
  while (guard++ < 1500) {
    const up = out.filter(s => s.t1 > t);
    if (up.length >= c.live) { t = up.map(s => s.t1).sort((a, b) => a - b)[up.length - c.live] + 0.05; continue; }
    const gr = rng(), n = Math.min(gr < c.g3 ? 3 : gr < c.g3 + c.g2 ? 2 : 1, c.live - up.length);
    let placed = 0, stop = false;
    for (let g = 0; g < n; g++) {
      const tt = +(t + g * 0.07).toFixed(3), live = out.filter(s => s.t1 > tt);
      const free = [];
      SPOTS.forEach((s, i) => { if (spotFree[i] <= tt && !s.block.some(j => live.some(o => o.spot === j))) free.push(i); });
      if (!free.length) break;
      const spot = rng.pick(free), S = SPOTS[spot];
      const quick = c.mix > 0 && rng() < c.mix, r1 = rng(), r2 = rng(), r3 = rng(), hat = rng.int(0, 3), ph = +(rng() * 6.283).toFixed(3);
      const side = S.x < -0.5 ? 1 : S.x > 0.5 ? -1 : (r3 < 0.5 ? -1 : 1);
      const sp = { id: 0, t0: tt, t1: 0, kind: 'skel', spot, x: S.x, y: S.y, z: S.z, row: S.row, rise: c.rise, readyAt: +(c.rise * 0.15).toFixed(3),
        stay: +(quick ? c.quick : c.hold).toFixed(3), quick, act: 'sway', ph, side, hat, bomb: false };
      const goodUp = live.filter(s => !s.bomb && s.t1 > tt + 0.6).length, bombsUp = live.filter(s => s.bomb).length;
      if (skels > 1 && r1 < c.bomb && !prevBomb && (bombs + 1) <= c.bombCap * (skels + 1) && goodUp >= 1 && bombsUp + 1 <= goodUp) { sp.bomb = true; sp.hat = 0; }
      else if (!quick && r2 < c.thr && tt - lastThrow > 3.2 && !live.some(s => s.act === 'throw')) {
        sp.act = 'throw'; sp.hold1 = +Math.max(0.45, c.hold * 0.55).toFixed(3);
        sp.throwAt = +(sp.rise + sp.hold1 + WIND).toFixed(3); sp.fly = c.fly;
        sp.bx = +((S.x >= 0 ? 1 : -1) * (0.2 + r3 * 0.3)).toFixed(3);
      } else if (!quick) sp.act = ['sway', 'sway', 'shake', 'rattle'][Math.floor(r3 * 4)];
      const life = lifeOf(sp);
      if (tt + life > c.time - 0.2) { stop = true; break; }
      sp.t1 = +(tt + life).toFixed(3);
      if (sp.bomb) {
        bombs++;
        const flipAt = life - LEAVE - 0.4;                // a real skull for its last ~0.4 s on screen
        if (c.flipbomb && rng() < 0.45 && flipAt > sp.rise + 0.25) sp.flip = +flipAt.toFixed(3);
      }
      if (sp.act === 'throw') lastThrow = tt;
      prevBomb = sp.bomb; skels++;
      out.push(sp); spotFree[spot] = tt + life + 0.3; placed++;
    }
    if (stop) break;
    if (!placed) { t += 0.1; continue; }
    t += rng.range(c.gap[0], c.gap[1]) * (1 + 0.45 * (placed - 1));
  }
  // bats (distraction): fly across the crypt over the heads, never shootable, never counted
  for (let k = 0; k < (c.bats || 0); k++) {
    const dir = rng() < 0.5 ? 1 : -1, v = +rng.range(3.6, 5).toFixed(3), life = +(22 / v).toFixed(3);
    const t0 = +rng.range(2, Math.max(3, c.time - life - 3)).toFixed(3);
    out.push({ id: 0, t0, t1: +(t0 + life).toFixed(3), kind: 'bat', dir, v, life, x0: -dir * 11, y0: +rng.range(3.0, 4.3).toFixed(3),
      z: +rng.range(-5.8, -4.0).toFixed(3), ph: +(rng() * 6.283).toFixed(3) });
  }
  out.sort((a, b) => a.t0 - b.t0); out.forEach((s, i) => { s.id = i; });
  // quota = a share of the REAL skeletons (bombs and flip bombs never count; throwers do)
  const good = out.filter(s => s.kind === 'skel' && !s.bomb).length;
  c.goodCount = good; c.bombCount = out.filter(s => s.bomb).length; c.throwCount = out.filter(s => s.act === 'throw').length;
  c.quota = Math.max(4, Math.round(good * c.share));
  return out;
}
// scoring: skull 300, ribs 100 (no zone, e.g. a touch-slop pick: a flat 200), a skull knocked out of the air 500,
// flipped bomb +100, a snap-back (quick) skeleton +50. Pure in (spawn, local time, zone); versus scores zones too.
const PTS = { skull: 300, ribs: 100, flat: 200, thrown: 500 };
function points(sp, lt, zone) {
  if (sp.kind !== 'skel') return 0;
  const z = zone || null;
  if (sp.act === 'throw' && lt >= sp.throwAt) return PTS.thrown;
  return (z === 'skull' ? PTS.skull : z === 'ribs' ? PTS.ribs : PTS.flat) + (sp.flip ? 100 : 0) + (sp.quick ? 50 : 0);
}
function briefing(c) {
  const tip = c.flipbomb ? 'CANDLE OUT = SKULL FLIPS: SHOOT!' : 'SKULL 300 / RIBS 100 / FLYING 500';   // short: the duck stands right of it
  return { rule: [['SHOOT ', 'void'], [c.quota + ' SKELETONS', 'red'], [' IN ' + c.time + ' SECONDS!', 'void']], icon: 'skull', unit: 'SKELETONS',
    dont: c.bomb > 0 ? 'bomb' : null, tip };
}
// briefing card icons (stage hooks, see ENGINE.md): a bone skull to shoot; the bomb skull (dark, red candle) not to
const SKULL_ICON = ['....XXXXXX....', '..XXBBBBBBXX..', '.XBBBBBBBBBBX.', '.XBBBBBBBBBMX.', 'XBBXXXBBXXXBMX', 'XBBXXXBBXXXBMX',
  'XBBXXXBBXXXBMX', '.XBBBBXXBBBMX.', '.XBBBXXXXBBMX.', '..XBBBBBBBMX..', '..XBXBXBXBXX..', '..XBBBBBBBMX..', '...XXXXXXXX...', '..............'];
const CANDLE = [['......F.......', '......OF......', '.....XRRX.....', '.....XRRX.....'],
  ['.......F......', '......FO......', '.....XRRX.....', '.....XRRX.....']];
function drawIcon(cx, cy, r) {
  const sc = Math.max(1, Math.round(2 * r / 14));
  B.HUD.sprite(SKULL_ICON, cx - 7 * sc, cy - 7 * sc, sc, { X: 'void', B: 'bone', M: 'mist' }, 'boneSkull');
}
function drawDont(cx, cy, r, t = 0) {
  const sc = Math.max(1, Math.round(2 * r / 14)), f = ((t * 8) | 0) % 2;
  B.HUD.sprite(CANDLE[f].concat(SKULL_ICON), cx - 7 * sc, cy - 10 * sc, sc,
    { X: 'void', B: 'steel', M: 'slate', R: 'red', F: 'lemon', O: 'orange' }, 'boneBomb' + f);
}
function makeTarget(sp) { return sp.kind === 'bat' ? new Bat(sp) : new Skeleton(sp); }
B.Stage.register({ id: 'boneyard', name: 'BONEYARD', short: 'BONES', variants: 3, variantNames: VARIANT_NAMES, penalty: -300,
  buildEnv() { geos(); return buildEnv(); }, config, timeline, makeTarget, points, briefing, drawIcon, drawDont, pose, SPOTS, PTS });
})(window.BLAM);
