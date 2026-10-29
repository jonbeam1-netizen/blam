'use strict';
/* =========================================================================================
   B.L.A.M. core/ui.js -- screens. Menus are diegetic: every button is a shootable hanging sign.
   Screen object: { enter(arg), exit(), update(dt, t), draw(t), fire(u, v, inside, touch) }.
   main.js owns the loop and the flow (G); screens call G.* to move on.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, PAL = R.PAL, H = B.HUD, Tg = B.Targets, S = B.Stage, SFX = B.SFX, RW = R.RW, RH = R.RH;
const G = () => B.G;
const UI = B.UI = { screens: {} };
// tall phone (portrait, game pixels < 1.5 CSS px): screens leave the game rect to the 3D and draw their text on
// the outer canvas instead (drawPortrait in core/portrait.js); each draw() below returns early when tall()
const tall = UI.tall = () => R.frame.portrait && R.frame.outer.hudScale >= 2;

// ---------- the title marquee (lifted from the look test): voxel letters on a bulb-lit board, camera child ----------
const MV = 0.075, TITLE = R.bold('B.L.A.M.');
const LETTER_ROWS = [PAL.lemon, PAL.lemon, PAL.yellow, PAL.yellow, PAL.yellow, PAL.amber, PAL.orange];
const marquee = new THREE.Group(); R.camera.add(marquee); marquee.visible = false;
const mqLetters = []; let mqBulbs = null, mqStep = -1;
{
  const X0 = -(TITLE.w - 1) / 2 * MV, groups = [[], [], [], []];
  for (const [x, y, ci] of TITLE.px) groups[ci >> 1].push([x, y]);
  groups.forEach(g => {
    const own = new Set(g.map(p => p[0] + ',' + p[1])), ring = new Set(), list = [];
    for (const [x, y] of g) {
      list.push([x, -y, 1, LETTER_ROWS[y]], [x, -y, 0, LETTER_ROWS[y]]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (x + dx) + ',' + (y + dy); if (!own.has(k)) ring.add(k); }
    }
    ring.forEach(k => { const [x, y] = k.split(',').map(Number); list.push([x, -y, 0, PAL.void]); });
    const m = new R.Vox().vox(list, MV, X0, 3 * MV, 0).mesh(R.MAT.obj); marquee.add(m); mqLetters.push(m);
  });
  const b = new R.Vox(), L = X0 - 4.5 * MV, Rr = X0 + (TITLE.w + 3.5) * MV, T = 7.5 * MV, Bt = -7.5 * MV;
  b.bx(L, Bt, -1.5 * MV, Rr, T, -0.5 * MV, PAL.crimson);
  b.bx(L, T - 2 * MV, -1.5 * MV, Rr, T, 0.5 * MV, PAL.plum); b.bx(L, Bt, -1.5 * MV, Rr, Bt + 2 * MV, 0.5 * MV, PAL.plum);
  b.bx(L, Bt + 2 * MV, -1.5 * MV, L + 2 * MV, T - 2 * MV, 0.5 * MV, PAL.plum); b.bx(Rr - 2 * MV, Bt + 2 * MV, -1.5 * MV, Rr, T - 2 * MV, 0.5 * MV, PAL.plum);
  b.bx(L + 0.5 * MV, Bt - 0.6 * MV, -1.2 * MV, Rr - 0.5 * MV, Bt, -0.2 * MV, PAL.void);
  marquee.add(b.mesh(R.MAT.obj)); marquee.userData.bottom = Bt;
  const pts = [], x0 = L + MV, x1 = Rr - MV, y0 = Bt + MV, y1 = T - MV, step = 3 * MV;
  for (let x = x0; x < x1 - 1e-6; x += step) pts.push([x, y1]);
  for (let y = y1; y > y0 + 1e-6; y -= step) pts.push([x1, y]);
  for (let x = x1; x > x0 + 1e-6; x -= step) pts.push([x, y0]);
  for (let y = y0; y < y1 - 1e-6; y += step) pts.push([x0, y]);
  mqBulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(MV * 0.95, MV * 0.95, MV * 0.6), new THREE.MeshBasicMaterial({ fog: false }), pts.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  pts.forEach(([x, y], i) => { mqBulbs.setMatrixAt(i, m4.makeTranslation(x, y, 0.7 * MV)); mqBulbs.setColorAt(i, c.set(PAL.rust)); });
  marquee.add(mqBulbs);
}
const MQ = { x: 0, y: 1.06, z: -3.4, s: 0.64 };
const _c = new THREE.Color(), _hp = new THREE.Vector3();
function updateMarquee(t) {
  marquee.position.set(MQ.x, MQ.y, MQ.z); marquee.scale.setScalar(MQ.s);
  marquee.rotation.set(-0.04 + Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.8) * 0.13, Math.sin(t * 1.1) * 0.012);
  mqLetters.forEach((m, i) => { const s = Math.max(0, Math.sin(t * 4.2 - i * 0.8)); m.position.y = s * s * s * 0.07; });
  const step = Math.floor(t * 9);
  if (step !== mqStep) {
    mqStep = step;
    for (let i = 0; i < mqBulbs.count; i++) mqBulbs.setColorAt(i, _c.set((i + step) % 3 === 0 ? PAL.lemon : (i + step) % 3 === 1 ? PAL.amber : PAL.rust));
    mqBulbs.instanceColor.needsUpdate = true;
  }
}
function marqueeBottomPx() {
  marquee.updateMatrixWorld(true); marquee.localToWorld(_hp.set(0, marquee.userData.bottom, 0));
  return R.toPx(_hp)[1];
}
UI.marquee = marquee; UI.updateMarquee = updateMarquee;

// ---------- Menu: a set of shootable signs placed in screen terms ----------
// items: [{ text, sub, color, u, v, s, z, act(sign), keep (don't shatter, e.g. toggles) }]
class Menu {
  constructor(items) {
    this.items = items.map(it => {
      // signs hang on the plane z (default 1.5); sizes are authored for z = 0 and scaled by distance so they keep their screen size
      const z = it.z == null ? 1.5 : it.z, k = (R.CAM_POS.z - z) / R.CAM_POS.z;
      const sign = new Tg.Sign({ text: it.text, sub: it.sub, color: it.color || 'crimson', s: (it.s || 0.05) * k, hang: it.hang == null ? 2.6 : it.hang, minW: it.minW || 0 });
      R.screenToWorld(it.u, it.v, z, sign.group.position);
      R.scene.add(sign.group); sign.group.updateMatrixWorld(true);   // shootable before the first render
      return Object.assign({ sign }, it);
    });
    this.busy = 0; this.hover = null;
  }
  update(dt, t) {
    this.busy = Math.max(0, this.busy - dt);
    let hov = null;
    if (B.Input.mouseIn && !B.Input.touch && this.busy <= 0) {
      const p = Tg.pick(R.rayAt(B.Input.aim.u, B.Input.aim.v), this.items.map(i => i.sign));
      hov = p ? p.target : null;
    }
    for (const it of this.items) { it.sign.setHover(it.sign === hov); it.sign.update(dt, t); }
    this.hover = hov;
  }
  // returns true if a sign was hit
  fire(ray) {
    if (this.busy > 0) return true;
    const p = Tg.pick(ray, this.items.map(i => i.sign));
    if (!p) return false;
    const it = this.items.find(i => i.sign === p.target);
    SFX.play('menuShoot');
    if (it.keep) { Tg.sparks(p.point, 6, ['lemon', 'bone', 'yellow'], 1.4); it.act && it.act(it.sign, it); return true; }
    it.sign.shatter(p.point, { max: 130 });
    this.busy = 0.35;
    G().after(0.3, () => it.act && it.act(it.sign, it));
    return true;
  }
  find(text) { return this.items.find(i => i.text === text || i.id === text); }
  dispose() { for (const it of this.items) it.sign.dispose(); this.items.length = 0; }
}
UI.Menu = Menu;

// ---------- DOM prompt (text entry for the player name / join code) ----------
function prompt(label, value, maxLen, cb) {
  const old = document.querySelector('.blam-prompt'); if (old) old.remove();
  const d = document.createElement('div'); d.className = 'blam-dom blam-prompt';
  d.innerHTML = '<div class="box"><div class="lbl"></div><input maxlength="' + maxLen + '" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
    '<div class="row"><button class="ok">OK</button><button class="no">CANCEL</button></div></div>';
  d.querySelector('.lbl').textContent = label;
  const inp = d.querySelector('input'); inp.value = value || '';
  const done = ok => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9 \-!?.]/g, '').trim().slice(0, maxLen); d.remove(); cb(ok ? v : null); };
  d.querySelector('.ok').onclick = () => done(true); d.querySelector('.no').onclick = () => done(false);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); e.stopPropagation(); });
  document.body.appendChild(d); setTimeout(() => { inp.focus(); inp.select(); }, 30);
}
UI.prompt = prompt;

// ---------- shared screen helpers ----------
// shoot with the gun at (u, v): sign menu first, then decor/duck/env. Returns the ray.
function menuFire(scr, u, v, inside) {
  if (!inside) return;
  const ray = G().shoot(u, v);
  if (scr.menu && scr.menu.fire(ray)) return;
  if (scr.extraFire && scr.extraFire(ray)) return;
  if (G().duckShot(ray)) return;
  G().envShot(ray);
}
function header(text, sub) {
  H.text7c(text, RW / 2, 8, 2, 'gold', 'void', 2);
  if (sub) H.text3c(sub, RW / 2, 27, 'cyan', 1, 'void');
}
function blink(t, hz = 2.2) { return ((t * hz) | 0) % 2 === 0; }
UI.menuFire = menuFire; UI.header = header; UI.blink = blink; UI.marqueeBottomPx = marqueeBottomPx;

// caption under a sign (HUD text projected from the sign's world position)
const _sp = new THREE.Vector3();
function caption(sign, text, col = 'mist', dy = 4) {
  if (!sign.alive) return;
  _sp.set(0, -sign.h / 2, 0); sign.group.localToWorld(_sp);
  const [x, y] = R.toPx(_sp); H.text3c(text, x, y + dy, col, 1, 'void');
}
function statusLine(left, right) {
  if (left) H.text3(left, 44, RH - 7, 'lime', 1, 'void');
  if (right) H.text3r(right, RW - 4, RH - 7, 'lime', 1, 'void');
}
UI.caption = caption; UI.statusLine = statusLine;

// =========================================================================================
// TITLE: an interactive shooting range. Marquee on top, Deputy Duck big, menu signs in the middle.
// =========================================================================================
UI.screens.title = {
  enter() {
    const g = G(); g.placeDuck('title'); g.duckPose('present', 'idle', 2.5); marquee.visible = true; S.showEnv('range');
    this.decor = S.get('range').decor(); this.decor.targets.forEach(t => R.scene.add(t.group));
    this.menu = new Menu([
      { text: 'PLAY', color: 'crimson', u: 0.47, v: 0.475, s: 0.075, act: () => g.go('tiers') },
      { text: 'VERSUS', color: 'blue', u: 0.33, v: 0.645, act: () => g.go('lobby') },
      { text: 'FREE PLAY', color: 'amber', u: 0.6, v: 0.645, act: () => g.go('free') },
      { text: 'SETTINGS', color: 'slate', u: 0.33, v: 0.8, act: () => g.go('settings') },
      { text: 'HIGH SCORES', color: 'plum', u: 0.6, v: 0.8, act: () => g.go('scores') }
    ]);
  },
  exit() { marquee.visible = false; this.menu.dispose(); this.decor.targets.forEach(t => t.dispose()); },
  update(dt, t) { updateMarquee(t); this.decor.update(t); this.menu.update(dt, t); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const by = marqueeBottomPx();
    H.text3c('BLAST LIKE A MANIAC!', RW / 2, by + 5, 'cyan', 2, 'void');
    if (blink(t)) H.text3c(G().touch ? 'TAP A SIGN!' : 'SHOOT A SIGN!', RW / 2, 216, 'yellow', 1, 'void');
    statusLine('BUILD ' + G().BUILD, G().touch ? '' : 'KEY 4: GUN SKIN');
  },
  extraFire(ray) {
    const p = Tg.pick(ray, this.decor.targets);
    if (!p) return false;
    p.target.shatter(p.point); SFX.play('hit', { pts: 0 }); G().duckReact('happy'); return true;
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// SETTINGS: toggles are signs you shoot (they flip, they don't shatter)
// =========================================================================================
const onOff = b => b ? 'ON' : 'OFF';
UI.screens.settings = {
  enter() {
    const g = G(), st = B.Save.settings; g.placeDuck('title'); g.duckPose('idle');
    const tog = (key, label, apply) => ({ text: label + ': ' + onOff(st[key]), keep: true, color: 'slate', s: 0.036, act: sign => {
      B.Save.set(key, !B.Save.settings[key]); apply && apply(); sign.setText(label + ': ' + onOff(B.Save.settings[key])); } });
    this.menu = new Menu([
      Object.assign(tog('dither', 'DITHER', () => g.applySettings()), { u: 0.31, v: 0.3 }),
      Object.assign(tog('crosshair', 'CROSSHAIR', () => g.applySettings()), { u: 0.31, v: 0.47 }),
      Object.assign(tog('shake', 'SCREEN SHAKE'), { u: 0.31, v: 0.64 }),
      { text: 'GUN: ' + g.skinName(), keep: true, color: 'plum', s: 0.036, u: 0.66, v: 0.3, act: sign => { g.setSkin(g.skin + 1); sign.setText('GUN: ' + g.skinName()); } },
      { text: 'NAME: ' + st.name, keep: true, color: 'blue', s: 0.036, u: 0.66, v: 0.47, act: sign => UI.prompt('PLAYER NAME (VERSUS)', B.Save.settings.name, 10, v => { if (v) { B.Save.set('name', v); sign.setText('NAME: ' + v); } }) },
      { text: 'BACK', color: 'crimson', s: 0.045, u: 0.66, v: 0.64, act: () => g.go('title') }
    ]);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) {
    this.menu.update(dt, t);
    const gs = this.menu.items[3].sign, want = 'GUN: ' + G().skinName();   // key 4 changes the skin anywhere
    if (gs.alive && gs.opts.text !== want) gs.setText(want);
  },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    header('SETTINGS', 'SHOOT A SIGN TO CHANGE IT');
    const m = this.menu.items;
    caption(m[0].sign, 'OFF = PALETTE SNAP ONLY');
    caption(m[3].sign, 'KEY 4 CYCLES GUNS ANYWHERE');
    statusLine('BUILD ' + G().BUILD, B.R.MODE_NAMES[B.R.mode]);
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// TIER SELECT (course)
// =========================================================================================
UI.screens.tiers = {
  enter() {
    const g = G(); g.placeDuck('title'); g.duckPose('present', 'idle', 1.5);
    const items = S.TIERS.map((T, i) => ({ text: T.name, sub: T.lives + ' LIVES', color: T.sign, s: 0.042, u: [0.33, 0.63][i % 2], v: [0.3, 0.55][i >> 1], act: () => g.startCourse(i) }));
    items.push({ text: 'BACK', color: 'slate', s: 0.045, u: 0.48, v: 0.8, act: () => g.go('title') });
    this.menu = new Menu(items);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    header('PICK A COURSE', '4 STAGES. MISS A QUOTA OR SHOOT A BOMB: LIFE -1');
    this.menu.items.slice(0, 4).forEach((it, i) => { const b = B.Save.best('course', i); if (b) caption(it.sign, 'BEST ' + b, 'yellow'); });
    statusLine('BUILD ' + G().BUILD);
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// FREE PLAY: any stage (and variant) at any tier
// =========================================================================================
UI.screens.free = {
  enter() {
    const g = G(); g.placeDuck('title'); g.duckPose('idle');
    const items = [];
    for (const id of S.order) { const d = S.get(id); for (let v = 0; v < d.variants; v++) items.push({ stage: id, variant: v }); }
    const menuItems = items.slice(0, 6).map((it, i) => ({ text: (S.get(it.stage).short || 'RANGE') + ' ' + (it.variant + 1), sub: (S.get(it.stage).variantNames || [])[it.variant] || '',
      color: 'wood', s: 0.034, u: [0.33, 0.63][i % 2], v: [0.27, 0.5, 0.73][i >> 1], stage: it.stage, variant: it.variant,
      act: () => g.startFree(it.stage, it.variant, g.free.tier) }));
    const T = S.TIERS[g.free.tier];
    const lastRow = Math.ceil(menuItems.length / 2) >= 3 ? 0.9 : 0.75;
    menuItems.push({ id: 'tier', text: 'TIER: ' + T.name, keep: true, color: T.sign, s: 0.04, u: 0.33, v: lastRow, act: sign => {
      g.free.tier = (g.free.tier + 1) % 4; const T2 = S.TIERS[g.free.tier]; sign.opts.color = T2.sign; sign.setText('TIER: ' + T2.name); } });
    menuItems.push({ text: 'BACK', color: 'slate', s: 0.04, u: 0.63, v: lastRow, act: () => g.go('title') });
    this.menu = new Menu(menuItems);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    header('FREE PLAY', 'SHOOT A STAGE TO PLAY IT');
    for (const it of this.menu.items) if (it.stage) {
      const b = B.Save.best(it.stage + ':' + it.variant, G().free.tier);
      caption(it.sign, b ? 'BEST ' + b : B.Ammo.describe(S.get(it.stage).config(G().free.tier, it.variant).ammo), b ? 'yellow' : 'mist', 3);
    }
    statusLine('BUILD ' + G().BUILD);
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// HIGH SCORES: local bests per stage / tier
// =========================================================================================
UI.screens.scores = {
  enter() {
    const g = G(); g.placeDuck('title'); g.duckPose('cheer', 'idle', 1.2);
    this.menu = new Menu([{ text: 'BACK', color: 'crimson', u: 0.6, v: 0.86, s: 0.045, act: () => g.go('title') }]);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    header('HIGH SCORES', 'LOCAL BESTS ON THIS DEVICE');
    const x0 = 112, y0 = 40, cw = 72;
    H.plate(x0 - 8, y0 - 4, 312, 152);
    const ab = ['BEGINNER', 'ADVANCED', 'VERY HARD', 'INSANE'];
    ab.forEach((n, i) => H.text3c(n, x0 + 92 + i * cw - 30, y0 + 6, 'oxblood', 1));
    const rows = [];
    for (const id of S.order) { const d = S.get(id); for (let v = 0; v < d.variants; v++) rows.push([(d.short || 'RANGE') + ' ' + (v + 1), id + ':' + v]); }
    rows.push(['COURSE', 'course']);
    rows.slice(0, 9).forEach(([label, key], r) => {
      const y = y0 + 20 + r * 14;
      H.rect(x0, y - 3, 296, 1, 'rust');
      H.text3(label, x0 + 4, y + 1, 'umber', 1);
      for (let i = 0; i < 4; i++) { const b = B.Save.best(key, i); H.text3c(b ? String(b) : '-', x0 + 92 + i * cw - 30, y + 1, b ? 'void' : 'chestnut', 1); }
    });
    statusLine('BUILD ' + G().BUILD);
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// BRIEFING CARD: stone banner with the rule, red panel with target + quota, don't-shoot sticker,
// SHOTS and TIME pillars. Deputy Duck presents it from the right.
// =========================================================================================
function shotsPillar(x, y, rule) {
  const w = 60, h = 132;
  H.box(x, y + 8, w, h - 8, 'red', 'coral', 'crimson');                        // hull
  H.rect(x + 4, y + 2, w - 8, 8, 'void'); H.rect(x + 5, y + 3, w - 10, 7, 'red'); H.rect(x + 6, y + 3, w - 12, 1, 'coral');   // rounded nose
  H.rect(x - 1, y + h - 22, w + 2, 22, 'void'); H.rect(x, y + h - 21, w, 20, 'amber'); H.rect(x, y + h - 21, w, 2, 'lemon');
  H.rect(x, y + h - 5, w, 4, 'rust'); H.rect(x + 22, y + h - 16, 16, 8, 'yellow');           // brass head + primer
  H.text3c('SHOTS', x + w / 2, y + 14, 'bone', 2, 'void');
  const r = rule || 'unlimited';
  if (r === 'unlimited' || (!r.mag && !r.cap)) { H.sprite(H.INF, x + w / 2 - 13, y + 52, 3, { X: 'bone' }, 'inf3'); H.text3c('NO LIMIT', x + w / 2, y + 80, 'lemon', 1, 'void'); }
  else if (r.mag) { H.text7c(String(r.mag), x + w / 2, y + 40, 4, 'bone', 'void', 2); H.text3c('PER MAG', x + w / 2, y + 76, 'lemon', 1, 'void'); H.text3c('AUTO', x + w / 2, y + 86, 'bone', 1, 'void'); H.text3c('RELOAD', x + w / 2, y + 93, 'bone', 1, 'void'); }
  else { H.text7c(String(r.cap), x + w / 2, y + 40, 4, 'bone', 'void', 2); H.text3c('IN TOTAL', x + w / 2, y + 76, 'lemon', 1, 'void'); H.text3c('MAKE THEM', x + w / 2, y + 86, 'bone', 1, 'void'); H.text3c('COUNT!', x + w / 2, y + 93, 'bone', 1, 'void'); }
}
function timePillar(x, y, secs) {
  const w = 60, h = 132, cx = x + w / 2, cy = y + 50;
  H.box(x, y, w, h, 'magenta', 'pink', 'plum');
  H.text3c('TIME', cx, y + 6, 'bone', 2, 'void');
  H.draw(H.pixImg('watch', 41, 41, (px, py) => {
    const d = Math.hypot(px - 20, py - 20);
    if (d > 20) return null; if (d > 18.4) return 'void'; if (d > 16.5) return 'amber'; if (d > 15.6) return 'void';
    const a = Math.atan2(py - 20, px - 20), tick = d > 12.5 && Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.42;
    return tick ? 'void' : 'bone';
  }), cx - 20, cy - 20);
  H.rect(cx - 3, cy - 25, 6, 4, 'void'); H.rect(cx - 2, cy - 24, 4, 3, 'amber');
  H.rect(cx, cy - 12, 1, 12, 'red'); H.rect(cx, cy, 8, 1, 'void');
  H.text7c(String(secs), cx, y + 78, 3, 'bone', 'void', 2);
  H.text3c('SECONDS', cx, y + 104, 'lemon', 1, 'void');
}
UI.screens.briefing = {
  enter(a) {
    this.a = a; this.t = 0; this.done = false;
    const g = G(); g.placeDuck('brief'); g.duckPose('present'); S.showEnv(a.run.stage);
  },
  exit() {},
  update(dt) { this.t += dt; if (this.a.versus ? performance.now() >= this.a.run.wall0 : this.t > 9) this.go(); },
  go() { if (this.done) return; this.done = true; G().go('play', { run: this.a.run, versus: this.a.versus }); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const run = this.a.run, c = run.cfg, b = run.def.briefing(c), vs = this.a.versus;
    H.dim(0, 0, 330, RH); H.dim(330, 0, RW - 330, 36);
    H.stoneBanner(12, 8, 402, 26);
    H.ruleLine(vs ? [['FIRST HIT ON A TARGET ', 'void'], ['TAKES IT!', 'red']] : b.rule, RW / 2, 16, 2);
    H.redPanel(12, 42, 172, 132);
    H.text7('SHOOT!', 26, 54, 2, 'gold', 'void', 2);
    H.bullseyeIcon(98, 104, 21);
    if (vs) { H.text3c('MOST HITS', 98, 136, 'bone', 2); H.text3c('WINS', 98, 150, 'lemon', 2); }
    else { H.text7c(String(c.quota), 98, 132, 3, 'gold', 'void', 2); H.text3c(b.unit + ' OR MORE', 98, 158, 'bone', 1); }
    if (b.dont) {
      H.sticker(12, 182, 108, 30);
      H.text3("DON'T SHOOT!", 18, 186, 'void', 2); H.text3('LIFE -1', 18, 199, 'crimson', 2);
      H.bombIcon(150, 196, 13, t); H.redX(150, 196, 9);
    } else if (b.tip) H.text3(b.tip, 14, 186, 'lemon', 1, 'void');
    shotsPillar(194, 42, c.ammo); timePillar(262, 42, c.time);
    H.text3(this.a.label || '', 194, 182, 'yellow', 1, 'void');
    H.text3((c.title || '') + (c.subtitle ? ': ' + c.subtitle : ''), 194, 190, 'mist', 1, 'void');
    if (b.dont && b.tip) H.text3(b.tip, 194, 198, 'lemon', 1, 'void');
    if (vs) { const P = run.players; H.text3(P[0].name, 194, 206, 'coral', 1, 'void'); H.text3('VS', 194 + H.text3w(P[0].name) + 5, 206, 'bone', 1, 'void'); H.text3(P[1].name, 194 + H.text3w(P[0].name + ' VS ') + 1, 206, 'ice', 1, 'void'); }
    if (!vs && blink(t)) H.text3c(G().touch ? 'TAP TO SKIP' : 'CLICK OR TAP TO SKIP', RW / 2, 222, 'yellow', 1, 'void');
    if (vs) H.text3c('GET READY... ' + Math.max(0, Math.ceil((run.wall0 - performance.now()) / 1000)), RW / 2, 222, 'yellow', 1, 'void');
    statusLine(this.a.status || '');
  },
  fire() { if (!this.a.versus && this.t > 0.35) this.go(); }
};

// =========================================================================================
// PLAY: the stage runs; HUD; countdown; shots go to G.playFire
// =========================================================================================
UI.screens.play = {
  enter(a) {
    this.run = a.run; this.versus = !!a.versus; this.left = false; this.pop = null;
    const g = G(); g.run = a.run; g.placeDuck('mini'); g.duckPose('idle');
  },
  exit() {},
  update(dt, t) {
    const run = this.run, g = G();
    run.update(run.versus ? dt : dt * (g.slow || 1));                       // ?slow= (testing) slows a solo stage
    for (const e of run.events) {
      if (e.type === 'hit' && e.by === run.local) g.duckReact('happy', 0.6);
      else if ((e.type === 'bomb' || e.type === 'bystander') && e.by === run.local) { g.duckReact('angry', 1.1); g.shakeIt(0.35); this.pop = { text: 'LIFE -1', t: 0, rows: 'red' }; }
      else if (e.type === 'quota') this.pop = { text: 'QUOTA!', t: 0, rows: 'lime' };
    }
    run.events.length = 0;
    if (this.pop) { this.pop.t += dt; if (this.pop.t > 1.0) this.pop = null; }
    if (run.state === 'end' && run.endT > 1.3 && !this.left) { this.left = true; g.stageEnded(run); }
  },
  draw(t) {
    const run = this.run, g = G();
    H.drawPlay(g.hudState(run), t);
    if (run.state === 'count') {
      const n = Math.ceil(-run.t - 0.2);
      if (n >= 1 && n <= 3) { H.text7c(String(n), RW / 2, 70, 7, 'gold', 'void', 2); H.text3c('READY?', RW / 2, 124, 'bone', 2, 'void'); }
      else H.text7c('BLAM!', RW / 2, 76, 6, 'hot', 'void', 2);
    } else if (run.state === 'play' && run.t < 0.5) H.text7c('BLAM!', RW / 2, 76, 6, 'hot', 'void', 2);
    if (run.state === 'end') {
      const w = { time: 'TIME UP!', done: 'FINISH!', ammo: 'OUT OF AMMO!', lives: 'OUCH!' }[run.endReason] || 'FINISH!';
      H.text7c(w, RW / 2, 80, 4, run.endReason === 'lives' ? 'red' : 'gold', 'void', 2);
    }
    if (this.pop && ((this.pop.t * 10) | 0) % 2 === 0) H.text7c(this.pop.text, RW / 2, 40, 2, this.pop.rows, 'void', 2);
    if (run.versus && run.me.lives <= 0 && run.state === 'play') H.text3c('OUT OF LIVES - WATCH THE REST!', RW / 2, 40, 'red', 1, 'void');
  },
  fire(u, v, inside, touch) { G().playFire(this.run, u, v, inside, touch); }
};

// =========================================================================================
// RESULTS: big shouty CLEARED / FAILED, stats, stage score box, NEW RECORD burst
// =========================================================================================
UI.screens.results = {
  enter(a) {
    this.a = a; this.t = 0; this.done = false; const g = G();
    g.placeDuck('results'); g.duckPose(a.res.cleared ? 'cheer' : 'sad');
    SFX.play(a.res.cleared ? 'stageClear' : 'stageFail'); if (a.newRecord) SFX.play('newRecord');
  },
  exit() {},
  update(dt) { this.t += dt; if (this.t > 14) this.go(); },
  go() { if (this.done) return; this.done = true; this.a.next(); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const r = this.a.res;
    H.dim(0, 0, 356, RH); H.dim(356, 0, RW - 356, 60);
    if (r.cleared) H.starburst(RW / 2, 30, 34, t * 0.8, 'yellow', 'orange', 14);
    H.text7c(r.cleared ? 'CLEARED!' : 'FAILED!', RW / 2, 14, 5, r.cleared ? 'gold' : 'red', 'void', 2);
    H.plate(18, 66, 196, 118);
    const row = (i, k, v, c = 'void') => { H.text3(k, 30, 78 + i * 20, 'umber', 2); H.text3r(v, 202, 78 + i * 20, c, 2); };
    row(0, 'HITS', r.hits + (this.a.versus ? '' : '/' + r.quota), r.hits >= r.quota ? 'forest' : 'crimson');
    row(1, 'HIT %', r.pct + '%');
    row(2, 'FASTEST', isFinite(r.fastest) ? r.fastest.toFixed(2) + 'S' : '-');
    row(3, 'POINTS', String(r.base));
    row(4, 'BONUS', r.bonus ? '+' + r.bonus : '-', r.bonus ? 'forest' : 'chestnut');
    H.redPanel(224, 66, 128, 70);
    H.text3c('STAGE SCORE', 288, 76, 'bone', 1);
    H.text7c(String(r.score), 288, 92, 3, 'gold', 'void', 2);
    H.text3c('BEST ' + this.a.best, 288, 142, 'mist', 1, 'void');
    if (this.a.total != null) H.text3c('TOTAL ' + this.a.total, 288, 151, 'yellow', 1, 'void');
    if (this.a.newRecord) {
      H.starburst(288, 172, 15, t * 2, 'lemon', 'red', 10);
      if (blink(t, 6)) H.text7c('NEW RECORD!', 288, 168, 1, 'hot', 'void', 2);
    }
    if (this.a.lifeLost) { H.sprite(H.HEART, 30, 192, 2, H.HEART_OFF, 'heartoff'); H.text3('LIFE -1', 52, 196, 'red', 2, 'void'); }
    if (this.t > 1.0 && blink(t)) H.text3c(G().touch ? 'TAP TO CONTINUE' : 'CLICK OR TAP TO CONTINUE', RW / 2, 224, 'yellow', 1, 'void');
    statusLine(this.a.status || '');
  },
  fire() { if (this.t > 1.0) this.go(); }
};

// =========================================================================================
// GAME OVER (with continue) and COURSE CLEAR
// =========================================================================================
UI.screens.gameover = {
  enter(a) {
    this.a = a; this.count = 10; const g = G();
    g.placeDuck('title'); g.duckPose('sad'); SFX.play('gameOver');
    this.menu = new Menu([
      { text: 'CONTINUE', color: 'green', u: 0.33, v: 0.66, s: 0.06, act: () => { SFX.play('continue'); a.onContinue(); } },
      { text: 'QUIT', color: 'slate', u: 0.62, v: 0.66, act: () => g.go('title') }
    ]);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); const p = Math.ceil(this.count); this.count -= dt; if (Math.ceil(this.count) !== p && this.count > 0) SFX.play('tick', { n: Math.ceil(this.count) }); if (this.count <= 0) G().go('title'); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    H.text7c('GAME OVER', RW / 2, 18, 5, 'red', 'void', 2);
    H.text3c('CONTINUE?', RW / 2, 62, 'bone', 2, 'void');
    H.timerBall(RW / 2, 96, this.count / 10, Math.max(0, Math.ceil(this.count)), t);
    H.text3c('SCORE ' + (this.a.total || 0) + '   STAGE ' + (this.a.stage || 1) + '/4', RW / 2, 120, 'yellow', 1, 'void');
    statusLine(this.a.status || '');
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};
UI.screens.final = {
  enter(a) { this.a = a; this.t = 0; this.done = false; const g = G(); g.placeDuck('results'); g.duckPose('cheer'); SFX.play('courseClear'); if (a.newRecord) SFX.play('newRecord'); this.conf = 0; },
  exit() {},
  update(dt) {
    this.t += dt; this.conf -= dt;
    if (this.conf <= 0) {                                                     // confetti from the ceiling
      this.conf = 0.06; const cols = ['pink', 'yellow', 'cyan', 'lime', 'orange', 'bone'];
      const p = R.screenToWorld(Math.random(), 0.05, 0.5);
      Tg.spawnChip(p, new THREE.Vector3(R.rnd(-0.6, 0.6), R.rnd(-0.5, 0.5), R.rnd(-0.3, 0.3)), 0.05, PAL[cols[(Math.random() * cols.length) | 0]], 2.6, 0.12);
    }
    if (this.t > 20) this.go();
  },
  go() { if (this.done) return; this.done = true; G().go('title'); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    H.starburst(RW / 2, 40, 44, t * 0.6, 'yellow', 'orange', 16);
    H.text7c('COURSE', RW / 2, 14, 4, 'gold', 'void', 2); H.text7c('CLEAR!', RW / 2, 48, 4, 'gold', 'void', 2);
    H.text3c(S.TIERS[this.a.tier].name, RW / 2, 88, 'cyan', 2, 'void');
    H.redPanel(RW / 2 - 80, 104, 160, 64);
    H.text3c('TOTAL SCORE', RW / 2, 114, 'bone', 1);
    H.text7c(String(this.a.total), RW / 2, 128, 3, 'gold', 'void', 2);
    H.text3c('BEST ' + this.a.best, RW / 2, 174, 'mist', 1, 'void');
    if (this.a.newRecord && blink(t, 6)) H.text7c('NEW RECORD!', RW / 2, 186, 2, 'hot', 'void', 2);
    if (this.t > 1.5 && blink(t)) H.text3c(G().touch ? 'TAP TO CONTINUE' : 'CLICK OR TAP TO CONTINUE', RW / 2, 224, 'yellow', 1, 'void');
  },
  fire() { if (this.t > 1.5) this.go(); }
};

// =========================================================================================
// VERSUS LOBBY: host gets BLAM-XXXX, friend joins by code; host picks tier + stage
// =========================================================================================
UI.screens.lobby = {
  enter(a) {
    const g = G(), N = B.Net; g.placeDuck('title'); g.duckPose('present', 'idle', 1.5);
    this.key = ''; this.menu = null; if (a && a.toast) g.toast(a.toast, 3);
    N.on.update = () => { this.key = ''; };
  },
  exit() { if (this.menu) this.menu.dispose(); this.menu = null; B.Net.on.update = null; },
  rebuild() {
    const g = G(), N = B.Net, name = B.Save.settings.name;
    if (this.menu) this.menu.dispose();
    let items;
    if (N.state === 'hosting' && N.players[1]) {
      const L = N.lobby, T = S.TIERS[L.tier], d = S.get(L.stage);
      items = [
        { text: 'TIER: ' + T.name, keep: true, color: T.sign, s: 0.036, u: 0.31, v: 0.6, act: () => N.setLobby({ tier: (L.tier + 1) % 4 }) },
        { text: 'STAGE: ' + (d.short || 'RANGE') + ' ' + (L.variant + 1), keep: true, color: 'wood', s: 0.036, u: 0.65, v: 0.6, act: () => {
          const ids = []; for (const id of S.order) for (let v = 0; v < S.get(id).variants; v++) ids.push([id, v]);
          const i = ids.findIndex(e => e[0] === L.stage && e[1] === L.variant), nx = ids[(i + 1) % ids.length];
          N.setLobby({ stage: nx[0], variant: nx[1] }); } },
        { text: 'START!', color: 'crimson', s: 0.055, u: 0.31, v: 0.8, act: () => N.start() },
        { text: 'LEAVE', color: 'slate', s: 0.045, u: 0.65, v: 0.8, act: () => { N.leave(); g.go('title'); } }
      ];
    } else if (N.state === 'hosting' || N.state === 'joining' || N.state === 'joined' || N.state === 'loading') {
      items = [{ text: N.state === 'joining' || N.state === 'loading' ? 'CANCEL' : 'LEAVE', color: 'slate', u: 0.475, v: 0.8, act: () => { N.leave(); this.key = ''; } }];
    } else if (N.state === 'offline') {
      items = [
        { text: 'PLAY SOLO', color: 'amber', u: 0.33, v: 0.62, act: () => { N.leave(); g.go('free'); } },
        { text: 'TRY AGAIN', color: 'blue', u: 0.62, v: 0.62, act: () => { N.state = 'idle'; N.status = ''; this.key = ''; } },
        { text: 'BACK', color: 'slate', u: 0.475, v: 0.8, act: () => { N.leave(); g.go('title'); } }
      ];
    } else {
      items = [
        { text: 'HOST GAME', color: 'crimson', s: 0.055, u: 0.33, v: 0.5, act: () => N.host(name) },
        { text: 'JOIN GAME', color: 'blue', s: 0.055, u: 0.62, v: 0.5, act: () => UI.prompt('ENTER THE CODE (BLAM-XXXX)', 'BLAM-', 9, c => { if (c) N.join(c, name); else this.key = ''; }) },
        { text: 'BACK', color: 'slate', u: 0.475, v: 0.75, act: () => g.go('title') }
      ];
    }
    this.menu = new Menu(items);
  },
  update(dt, t) {
    const N = B.Net, key = [N.state, !!N.players[1], N.lobby.tier, N.lobby.stage, N.lobby.variant].join('|');
    if (key !== this.key) { this.key = key; this.rebuild(); }
    this.menu.update(dt, t);
  },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const N = B.Net;
    header('VERSUS', 'ONLINE, 2 PLAYERS, SAME STAGE, FIRST HIT TAKES IT');
    if (N.code && (N.state === 'hosting' || N.state === 'joined')) {
      H.stoneBanner(RW / 2 - 90, 38, 180, 34);
      H.text3c(N.state === 'hosting' ? 'YOUR CODE' : 'JOINED', RW / 2, 42, 'slate', 1);
      H.text7c(N.code, RW / 2, 52, 2, 'red', 'void', 1);
    }
    if (N.state === 'hosting' || N.state === 'joined') {
      const P = N.players, y = 80;
      H.box(RW / 2 - 132, y, 120, 16, 'red', 'coral', 'crimson'); H.text3c(P[0] ? P[0].name : '...', RW / 2 - 72, y + 4, 'bone', 2);
      H.text7c('VS', RW / 2, y + 2, 2, 'gold', 'void', 2);
      H.box(RW / 2 + 12, y, 120, 16, 'blue', 'cyan', 'deepblue'); H.text3c(P[1] ? P[1].name : (blink(t) ? 'WAITING' : ''), RW / 2 + 72, y + 4, 'bone', 2);
      if (N.state === 'hosting' && !P[1]) H.text3c('TELL A FRIEND TO PICK VERSUS > JOIN GAME AND TYPE THIS CODE', RW / 2, 104, 'mist', 1, 'void');
      if (N.state === 'joined') H.text3c('THE HOST PICKS TIER + STAGE: ' + S.TIERS[N.lobby.tier].name + ', ' + (S.get(N.lobby.stage).short || 'RANGE') + ' ' + (N.lobby.variant + 1), RW / 2, 104, 'mist', 1, 'void');
    }
    if (N.status) H.text3c(N.status, RW / 2, 114, N.state === 'offline' ? 'red' : 'yellow', 1, 'void');
    statusLine('BUILD ' + G().BUILD, N.state.toUpperCase());
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// VERSUS RESULTS: WINNER / LOSER with the duck
// =========================================================================================
UI.screens.vsresults = {
  enter(a) {
    this.a = a; this.t = 0; this.done = false; const g = G(), run = a.run, P = run.players;
    const score = p => p.hits * 100000 + p.score;
    this.win = score(P[0]) === score(P[1]) ? -1 : score(P[0]) > score(P[1]) ? 0 : 1;
    const me = run.local, won = this.win === me;
    g.placeDuck('results'); g.duckPose(this.win < 0 ? 'happy' : won ? 'cheer' : 'sad');
    SFX.play(won ? 'vsWin' : 'vsLose');
  },
  exit() {},
  update(dt) { this.t += dt; if (this.t > 20) this.go(); },
  go() { if (this.done) return; this.done = true; G().go('lobby'); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const run = this.a.run, me = run.local, P = run.players;
    H.dim(0, 0, 356, RH); H.dim(356, 0, RW - 356, 60);                       // like the results card: Deputy Duck (bottom-right) stays bright
    const word = this.win < 0 ? 'DRAW!' : this.win === me ? 'WINNER!' : 'LOSER...';
    if (this.win === me) H.starburst(RW / 2, 30, 34, t * 0.8, 'yellow', 'orange', 14);
    H.text7c(word, RW / 2, 14, 5, this.win < 0 ? 'bone' : this.win === me ? 'gold' : 'blue', 'void', 2);
    [0, 1].forEach(i => {
      const p = P[i], x = i ? 214 : 30, C = H.PCOL[i];
      H.box(x, 64, 150, 120, C[2], C[1], 'void');
      H.text3c(p.name, x + 75, 70, 'bone', 2);
      if (this.win === i) H.text7c(i === me ? 'YOU WIN' : 'WINS', x + 75, 52, 1, 'gold', 'void', 2);
      const shots = Math.max(p.shots, p.hits), pct = shots ? Math.round(p.hits / shots * 100) : 0;
      [['HITS', p.hits], ['HIT %', pct + '%'], ['FASTEST', isFinite(p.fastest) ? p.fastest.toFixed(2) + 'S' : '-'], ['SCORE', p.score], ['LIVES', p.lives]].forEach(([k, v], r) => {
        H.text3(k, x + 10, 90 + r * 17, C[0], 2); H.text3r(String(v), x + 140, 90 + r * 17, 'bone', 2);
      });
    });
    if (this.t > 1.5 && blink(t)) H.text3c(G().touch ? 'TAP FOR THE LOBBY' : 'CLICK OR TAP FOR THE LOBBY', RW / 2, 224, 'yellow', 1, 'void');
  },
  fire() { if (this.t > 1.5) this.go(); }
};
})(window.BLAM);
