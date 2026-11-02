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
  marquee.userData.box = [L, Bt - 0.6 * MV, Rr, T];                           // board extent in marquee units (rope routing)
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
let mqFlick = 0, mqFlickAt = 0;                                                // ricochet: bulb flicker timer + where it hit
function updateMarquee(t, dt) {
  marquee.position.set(MQ.x, MQ.y, MQ.z); marquee.scale.setScalar(MQ.s);
  marquee.rotation.set(-0.04 + Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.8) * 0.13, Math.sin(t * 1.1) * 0.012);
  mqLetters.forEach((m, i) => { const s = Math.max(0, Math.sin(t * 4.2 - i * 0.8)); m.position.y = s * s * s * 0.07; });
  const step = Math.floor(t * 9);
  if (mqFlick > 0) {                                                           // a shot rattled the board: bulbs near the hit stutter
    mqFlick -= dt || 1 / 60; mqStep = -1;
    const f = Math.floor(t * 30);
    for (let i = 0; i < mqBulbs.count; i++) {
      const near = Math.abs(i - mqFlickAt) < 9 || Math.abs(i - mqFlickAt) > mqBulbs.count - 9;
      const off = near ? ((i * 7 + f) % 3 === 0) : ((i * 13 + f) % 11 === 0);
      mqBulbs.setColorAt(i, _c.set(off ? PAL.oxblood : (i + f) % 2 ? PAL.lemon : PAL.bone));
    }
    mqBulbs.instanceColor.needsUpdate = true;
  } else if (step !== mqStep) {
    mqStep = step;
    for (let i = 0; i < mqBulbs.count; i++) mqBulbs.setColorAt(i, _c.set((i + step) % 3 === 0 ? PAL.lemon : (i + step) % 3 === 1 ? PAL.amber : PAL.rust));
    mqBulbs.instanceColor.needsUpdate = true;
  }
}
// shot at the marquee: ricochet spark burst + bulb flicker + 'ricochet' event. Returns true when the board was hit.
const _mqLocal = new THREE.Vector3();
function marqueeShot(ray) {
  if (!marquee.visible) return false;
  marquee.updateMatrixWorld(true);
  const h = ray.intersectObject(marquee, true)[0];
  if (!h) return false;
  Tg.sparks(h.point, 12, ['lemon', 'bone', 'yellow', 'amber'], 1.9, 0.034);  // hard white-hot ricochet
  Tg.sparks(h.point, 4, ['steel', 'haze'], 1.0, 0.042);                       // a few grey flakes of paint
  // nearest bulb to the hit, so the flicker starts where the bullet struck
  marquee.worldToLocal(_mqLocal.copy(h.point));
  let best = 0, bd = 1e9; const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < mqBulbs.count; i++) { mqBulbs.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); const d = p.distanceToSquared(_mqLocal); if (d < bd) { bd = d; best = i; } }
  mqFlick = 0.32; mqFlickAt = best;
  SFX.play('ricochet', { u: B.Input.aim.u });
  return true;
}
function marqueeBottomPx() {
  marquee.updateMatrixWorld(true); marquee.localToWorld(_hp.set(0, marquee.userData.bottom, 0));
  return R.toPx(_hp)[1];
}
UI.marquee = marquee; UI.updateMarquee = updateMarquee; UI.marqueeShot = marqueeShot;

// ---------- sign ropes (gripe #30): each rope runs up from the top edge of its own sign and stops at the bottom edge
// of the first thing above it (another sign or the marquee), so it never draws through a board; ropes with a clear
// sky run up out of frame as before.  The Sign's own ropes are switched off (hang 0) and these replace them.
const ROPE_GEO = (() => { const v = new R.Vox(); v.bx(-0.012, 0, -0.02, 0.012, 1, 0.004, PAL.steel); return v.mesh(R.MAT.obj).geometry; })();
const KNOT_GEO = (() => { const v = new R.Vox(); v.bx(-0.03, -0.01, -0.03, 0.03, 0.03, 0.02, PAL.void); return v.mesh(R.MAT.obj).geometry; })();
const _rp = new THREE.Vector3();
function projRect(pts) {                                                       // screen-px bounds of world points
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { const [x, y] = R.toPx(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
function signRect(sign) {
  const g = sign.group.position, w = sign.w / 2 * 1.08, h = sign.h / 2 * 1.08;   // 1.08 = hover scale
  return projRect([0, 1, 2, 3].map(i => new THREE.Vector3(g.x + (i & 1 ? w : -w), g.y + (i & 2 ? h : -h), g.z)));
}
function marqueeRect() {
  const [l, b, r, t] = marquee.userData.box, pts = [];
  R.camera.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) {
    // rest pose, widened for the yaw wobble; b is the bottom of the board's dark drop shadow, where the ropes tie on
    const v = new THREE.Vector3(MQ.x + (i & 1 ? r * 1.04 : l * 1.04) * MQ.s, MQ.y + (i & 2 ? t : b) * MQ.s, MQ.z);
    pts.push(R.camera.localToWorld(v));
  }
  return projRect(pts);
}
function routeRopes(items) {
  return;   // gripe #30 final: Jon wants NO strings on menu signs at all (signs float). Kept for reference.
  const obst = [];
  if (marquee.visible) obst.push({ r: marqueeRect(), mq: true });
  for (const it of items) if (it.sign.alive) obst.push({ r: signRect(it.sign), sign: it.sign });
  for (const it of items) {
    const sg = it.sign, hang = it.hang == null ? 2.6 : it.hang;
    if (!sg.ropes) sg.ropes = [];
    for (const m of sg.ropes) sg.pivot.remove(m);
    sg.ropes.length = 0; sg.ropeW = sg.w;
    if (hang <= 0) continue;
    const top = sg.h / 2, sx = sg.w / 2 - 3 * sg.opts.s, g = sg.group.position;
    for (const x of [-sx, sx]) {
      let len = hang;
      for (let y = 0; y < hang; y += 0.004) {
        const [px, py] = R.toPx(_rp.set(g.x + x, g.y + top + y, g.z));
        if (obst.some(o => o.sign !== sg && px >= o.r[0] && px <= o.r[2] && py >= o.r[1] && py <= o.r[3] + 1)) { len = Math.max(0, y); break; }
      }
      const rope = new THREE.Mesh(ROPE_GEO, R.MAT.obj), knot = new THREE.Mesh(KNOT_GEO, R.MAT.obj);
      rope.position.set(x, top, 0); rope.scale.y = Math.max(1e-4, len); rope.userData.cap = top + len;
      knot.position.set(x, top, 0);
      for (const m of [rope, knot]) { m.raycast = () => {}; m.userData.sharedGeo = true; sg.pivot.add(m); sg.ropes.push(m); }   // ropes are never shootable
    }
  }
}
// per frame: keep the rope tops fixed while the sign grows on hover (the pivot scales about the sign centre)
function holdRopes(sg) {
  if (!sg.ropes) return;
  const sc = sg.pivot.scale.y || 1;
  for (const m of sg.ropes) if (m.userData.cap !== undefined) m.scale.y = Math.max(1e-4, m.userData.cap / sc - sg.h / 2);
}

// ---------- Menu: a set of shootable signs placed in screen terms ----------
// items: [{ text, sub, color, u, v, s, z, act(sign), keep (don't shatter, e.g. toggles), font }]
// #100: s is the voxel size of the BOLD lettering (~0.6x the old 3x5 sizes): 0.03 ~ 1.5 game px per voxel
class Menu {
  constructor(items) {
    this.items = items.map(it => {
      // signs hang on the plane z (default 1.5); sizes are authored for z = 0 and scaled by distance so they keep their screen size
      const z = it.z == null ? 1.5 : it.z, k = (R.CAM_POS.z - z) / R.CAM_POS.z;
      const sign = new Tg.Sign({ text: it.text, sub: it.sub, color: it.color || 'crimson', s: (it.s || 0.03) * k, hang: 0, minW: it.minW || 0, font: it.font, still: it.still });   // ropes: routeRopes()
      R.screenToWorld(it.u, it.v, z, sign.group.position);
      R.scene.add(sign.group); sign.group.updateMatrixWorld(true);   // shootable before the first render
      return Object.assign({ sign }, it);
    });
    this.busy = 0; this.hover = null;
    routeRopes(this.items);
  }
  update(dt, t) {
    this.busy = Math.max(0, this.busy - dt);
    let hov = null;
    if (B.Input.mouseIn && !B.Input.touch && this.busy <= 0) {
      const p = Tg.pick(R.rayAt(B.Input.aim.u, B.Input.aim.v), this.items.map(i => i.sign));
      hov = p ? p.target : null;
    }
    if (this.items.some(it => it.sign.alive && it.sign.ropeW !== it.sign.w)) routeRopes(this.items);   // setText changed a width
    for (const it of this.items) { it.sign.setHover(it.sign === hov); it.sign.update(dt, t); holdRopes(it.sign); }
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
  if (sub) H.textBc(sub, RW / 2, 27, 'cyan', 1, 'void');
}
function blink(t, hz = 2.2) { return ((t * hz) | 0) % 2 === 0; }
// #100: word wrap for the bold menu text (H.textB): lines no wider than maxW, balanced (as few lines as a greedy
// wrap needs, but as even as possible: "SHOOTING RANGE: / RELOAD DRILL", not "SHOOTING RANGE: RELOAD / DRILL")
function wrapB(str, maxW, sc = 1) {
  const ws = String(str).toUpperCase().split(' ').filter(Boolean);
  const greedy = mw => { const out = []; let cur = '';
    for (const w of ws) { const nx = cur ? cur + ' ' + w : w; if (cur && H.textBw(nx, sc) > mw) { out.push(cur); cur = w; } else cur = nx; }
    if (cur) out.push(cur); return out; };
  let rows = greedy(maxW); const n = rows.length;
  if (n > 1) for (let mw = maxW - 4; mw > 8; mw -= 4) { const r = greedy(mw); if (r.length > n) break; rows = r; }
  return rows;
}
// wrapped, left-aligned (align 'l') or centred ('c') bold lines from y; returns the y under the last line
function linesB(str, x, y, maxW, col, align = 'c', outline = 'void', lh = 10) {
  for (const l of wrapB(str, maxW)) { if (align === 'c') H.textBc(l, x, y, col, 1, outline); else H.textB(l, x, y, col, 1, outline); y += lh; }
  return y;
}
UI.wrapB = wrapB; UI.linesB = linesB;
UI.menuFire = menuFire; UI.header = header; UI.blink = blink; UI.marqueeBottomPx = marqueeBottomPx;

// caption under a sign (HUD text projected from the sign's world position)
const _sp = new THREE.Vector3();
function caption(sign, text, col = 'mist', dy = 4) {
  if (!sign.alive) return;
  _sp.set(0, -sign.h / 2, 0); sign.group.localToWorld(_sp);
  const [x, y] = R.toPx(_sp); H.textBc(text, x, y + dy, col, 1, 'void');
}
function statusLine(left, right) {
  if (left) H.textB(left, 44, RH - 9, 'lime', 1, 'void');
  if (right) H.textBr(right, RW - 4, RH - 9, 'lime', 1, 'void');
}
UI.caption = caption; UI.statusLine = statusLine;
// #109: every menu screen is set in the range room. A free-play round leaves its own set showing (the Grocery
// aisle's shelves round the big duck), so each menu switches back on enter; the last set's bullet holes go with it
function rangeRoom() {
  const e = S.env('range');
  if (!e.visible) { S.showEnv('range'); Tg.clearDecals(); }
}
UI.rangeRoom = rangeRoom;

// =========================================================================================
// TITLE: an interactive shooting range. Marquee on top, Deputy Duck big, menu signs in the middle.
// =========================================================================================
UI.screens.title = {
  enter() {
    const g = G(); g.placeDuck('title'); g.duckPose('present', 'idle', 2.5); marquee.visible = true; rangeRoom();
    this.decor = S.get('range').decor(); this.decor.targets.forEach(t => R.scene.add(t.group));
    this.menu = new Menu([
      { text: 'PLAY', color: 'crimson', u: 0.47, v: 0.475, s: 0.046, act: () => g.go('tiers') },
      { text: 'VERSUS', color: 'blue', u: 0.33, v: 0.645, s: 0.029, act: () => g.go('lobby') },
      { text: 'FREE PLAY', color: 'amber', u: 0.6, v: 0.645, s: 0.029, act: () => g.go('free') },
      { text: 'SETTINGS', color: 'slate', u: 0.33, v: 0.8, s: 0.029, act: () => g.go('settings') },
      { text: 'HIGH SCORES', color: 'plum', u: 0.6, v: 0.8, s: 0.029, act: () => g.go('scores') }
    ]);
  },
  exit() { marquee.visible = false; this.menu.dispose(); this.decor.targets.forEach(t => t.dispose()); },
  update(dt, t) { updateMarquee(t, dt); this.decor.update(t); this.menu.update(dt, t); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const by = marqueeBottomPx();
    H.text3c('BLAST LIKE A MANIAC!', RW / 2, by + 5, 'cyan', 2, 'void');
    if (blink(t)) H.textBc(G().touch ? 'TAP A SIGN!' : 'SHOOT A SIGN!', RW / 2, 217, 'yellow', 1, 'void');
    statusLine('BUILD ' + G().BUILD, G().touch ? '' : 'KEY 4: GUN SKIN');
  },
  extraFire(ray) {
    const p = Tg.pick(ray, this.decor.targets);
    if (!p) return marqueeShot(ray);                                          // the marquee hangs in front of the paddles
    marquee.updateMatrixWorld(true);
    const mh = marquee.visible && ray.intersectObject(marquee, true)[0];
    if (mh && mh.distance < p.distance) return marqueeShot(ray);
    p.target.shatter(p.point); SFX.play('hit', { pts: 0 }); G().duckReact('happy'); return true;
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// SETTINGS: toggles are signs you shoot (they flip, they don't shatter)
// =========================================================================================
const onOff = b => b ? 'ON' : 'OFF';
// RELOAD TYPE (build 0.005, #40): one sign that cycles the options of the CURRENT input type (mouse / touch);
// each input type keeps its own saved choice (Save.settings.reloadPC / reloadTouch)
const RELOAD_TYPES = { pc: ['arcade', 'rclick'], touch: ['swipe', 'tap'] };
const RELOAD_NAMES = { arcade: 'ARCADE', rclick: 'RIGHT CLICK', swipe: 'SWIPE DOWN', tap: 'TAP SIDES' };
const RELOAD_HELP = { arcade: 'SHOOT OR AIM AT THE SIDE PILLARS', rclick: 'RIGHT MOUSE BUTTON, ANYWHERE',
  swipe: 'SWIPE DOWN ANYWHERE', tap: 'TAP THE SIDE OF THE SCREEN' };
const reloadSignText = () => 'RELOAD: ' + RELOAD_NAMES[G().reloadMode()];
const soundSignText = () => { const S = B.SFX || {}; const v = S.muted ? 0 : (S.volume == null ? 0.35 : S.volume); return 'SOUND: ' + Math.round(v * 100) + '%'; };
const musicSignText = () => 'MUSIC: ' + (B.Save.settings.music !== false ? 'ON' : 'OFF');
// briefing SHOTS card caption for a magazine (landscape: two lines; portrait: line 0 only). ONE table for both cards,
// named like the settings sign (0.007): SHOOT SIDE only in ARCADE, never in RIGHT CLICK / SWIPE DOWN / TAP SIDES
const RELOAD_CARD = { arcade: ['SHOOT SIDE', 'TO RELOAD'], rclick: ['RIGHT CLICK', 'TO RELOAD'], swipe: ['SWIPE DOWN', 'TO RELOAD'], tap: ['TAP SIDES', 'TO RELOAD'] };
UI.reloadCard = autoReload => autoReload ? ['AUTO', 'RELOAD'] : RELOAD_CARD[G().reloadMode()] || ['PRESS R', 'TO RELOAD'];
// a stage tip about reloading ('SHOOT THE FRAME (OR R) TO RELOAD!' in range / alley / skyshow) is rewritten for the
// current RELOAD TYPE so a RIGHT CLICK / SWIPE / TAP player is never told to shoot the frame (0.007)
const RELOAD_TIP = { arcade: 'SHOOT THE FRAME (OR R) TO RELOAD!', rclick: 'RIGHT CLICK (OR R) TO RELOAD!', swipe: 'SWIPE DOWN TO RELOAD!', tap: 'TAP THE FRAME TO RELOAD!' };
UI.reloadTip = (tip, ammo) => {
  if (!tip || !/RELOAD/.test(tip) || !/FRAME|SIDE|PILLAR/.test(tip)) return tip;
  if (ammo && ammo.autoReload) return 'AUTO RELOAD: JUST KEEP SHOOTING!';
  return RELOAD_TIP[G().reloadMode()] || tip;
};
UI.reloadHelp = () => { const touch = B.Input.touch, m = G().reloadMode();
  return { group: touch ? 'PHONE: SWIPE DOWN / TAP SIDES' : 'PC: ARCADE / RIGHT CLICK', help: RELOAD_HELP[m] + (touch ? '' : '. KEY R ALWAYS WORKS') }; };
// #114: the settings in four groups, one row each, evenly spaced: DISPLAY / CONTROLS / AUDIO / PLAYER, a bold group
// caption over each row, each option's helper line right under its own sign, BACK bottom centre. The big duck stands
// bottom-left and the gun bottom-right, so the lower rows keep to the middle. Rows are SET_ROWS (sign centres, v).
const SET_ROWS = [0.26, 0.425, 0.59, 0.755], SET_BACK = 0.888, SET_S = 0.022;
const SET_GROUPS = [['DISPLAY', 0.5], ['CONTROLS', 0.5], ['AUDIO', 0.47], ['PLAYER', 0.47]];   // [caption, u]
const RELOAD_SHORT = { arcade: 'SHOOT THE SIDE PILLARS', rclick: 'RIGHT MOUSE BUTTON', swipe: 'SWIPE DOWN ANYWHERE', tap: 'TAP THE SCREEN SIDES' };
UI.settingsHelp = {                                                          // shared with the portrait layout
  dither: 'OFF = FLAT PALETTE', crosshair: 'OFF = MOUSE ARROW', shake: 'KICK ON EVERY SHOT',
  reload: () => RELOAD_SHORT[G().reloadMode()] + (B.Input.touch ? '' : ' / KEY R'), gun: () => B.Input.touch ? 'TAP TO SWAP GUNS' : 'KEY 4 CYCLES GUNS',
  sound: 'OFF 15 35 60 100', music: 'ON OR OFF', name: 'YOUR NAME IN VERSUS'
};
UI.screens.settings = {
  enter() {
    const g = G(), st = B.Save.settings; g.placeDuck('title'); g.duckPose('idle'); rangeRoom();
    const R0 = SET_ROWS, s = SET_S;
    const tog = (key, label, apply) => ({ id: key, text: label + ': ' + onOff(st[key]), keep: true, color: 'slate', s, act: sign => {
      B.Save.set(key, !B.Save.settings[key]); apply && apply(); sign.setText(label + ': ' + onOff(B.Save.settings[key])); } });
    this.menu = new Menu([
      // DISPLAY
      Object.assign(tog('dither', 'DITHER', () => g.applySettings()), { u: 0.17, v: R0[0] }),
      Object.assign(tog('crosshair', 'CROSSHAIR', () => g.applySettings()), { u: 0.5, v: R0[0] }),
      Object.assign(tog('shake', 'SCREEN SHAKE'), { u: 0.83, v: R0[0] }),
      // CONTROLS
      { id: 'reload', text: reloadSignText(), keep: true, color: 'amber', s, u: 0.3, v: R0[1], act: sign => {
        const touch = B.Input.touch, key = touch ? 'reloadTouch' : 'reloadPC', list = RELOAD_TYPES[touch ? 'touch' : 'pc'];
        B.Save.set(key, list[(list.indexOf(g.reloadMode()) + 1) % list.length]); sign.setText(reloadSignText()); } },
      { id: 'gun', text: 'GUN: ' + g.skinName(), keep: true, color: 'plum', s, u: 0.72, v: R0[1], act: sign => { g.setSkin(g.skin + 1); sign.setText('GUN: ' + g.skinName()); } },
      // AUDIO
      { id: 'sound', text: soundSignText(), keep: true, color: 'green', s, u: 0.34, v: R0[2], act: sign => {
        const S = B.SFX, steps = [0, 0.15, 0.35, 0.6, 1], cur = S.muted ? 0 : (S.volume == null ? 0.35 : S.volume);
        let i = steps.findIndex(x => Math.abs(x - cur) < 0.02); i = (i + 1) % steps.length;
        if (S.setVolume) S.setVolume(steps[i]); S.muted = steps[i] === 0; sign.setText(soundSignText()); } },
      { id: 'music', text: musicSignText(), keep: true, color: 'green', s, u: 0.6, v: R0[2], act: sign => {
        const S = B.SFX, on = !(B.Save.settings.music !== false); B.Save.set('music', on); if (S.music) S.music(on); sign.setText(musicSignText()); } },
      // PLAYER
      { id: 'name', text: 'NAME: ' + st.name, keep: true, color: 'blue', s, u: 0.47, v: R0[3], act: sign => UI.prompt('PLAYER NAME (VERSUS)', B.Save.settings.name, 10, v => { if (v) { B.Save.set('name', v); sign.setText('NAME: ' + v); } }) },
      { id: 'back', text: 'BACK', color: 'crimson', s: 0.026, u: 0.47, v: SET_BACK, z: 3, act: () => g.go('title') }
    ]);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) {
    this.menu.update(dt, t);
    const gs = this.menu.find('gun').sign, want = 'GUN: ' + G().skinName();   // key 4 changes the skin anywhere
    if (gs.alive && gs.opts.text !== want) gs.setText(want);
    const rs = this.menu.find('reload').sign, rw = reloadSignText();         // mouse <-> touch swaps the option group
    if (rs.alive && rs.opts.text !== rw) rs.setText(rw);
  },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    header('SETTINGS', 'SHOOT A SIGN TO CHANGE IT');
    // group captions: gold, 10 px over the top edge of their row's signs
    SET_GROUPS.forEach(([cap, u], i) => H.textBc(cap, Math.round(u * RW), Math.round(SET_ROWS[i] * RH) - 19, 'gold', 1, 'void'));
    const hp = UI.settingsHelp;
    for (const it of this.menu.items) {
      const h = hp[it.id]; if (!h) continue;
      caption(it.sign, typeof h === 'function' ? h() : h, 'mist', 3);
    }
    statusLine('BUILD ' + G().BUILD, B.R.MODE_NAMES[B.R.mode]);
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// TIER SELECT (course)
// =========================================================================================
UI.screens.tiers = {
  enter() {
    const g = G(); g.placeDuck('title'); g.duckPose('present', 'idle', 1.5); rangeRoom();
    const items = S.TIERS.map((T, i) => ({ text: T.name, sub: T.lives + ' LIVES', color: T.sign, s: 0.029, u: [0.34, 0.63][i % 2], v: [0.3, 0.56][i >> 1], act: () => g.startCourse(i) }));
    items.push({ text: 'BACK', color: 'slate', s: 0.03, u: 0.485, v: 0.82, act: () => g.go('title') });
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
    const g = G(); g.placeDuck('title'); g.duckPose('idle'); rangeRoom();
    this.build();
  },
  // the 6-slot grid: PRACTICE always takes the top-left slot (every page), then 5 stage signs per page; with more
  // registered stage variants a PAGE sign (right side) cycles the pages
  build() {
    const g = G(), items = [], PER = 5;
    for (const id of S.order) { const d = S.get(id); for (let v = 0; v < d.variants; v++) items.push({ stage: id, variant: v }); }
    const pages = Math.max(1, Math.ceil(items.length / PER));
    g.free.page = Math.max(0, Math.min(pages - 1, g.free.page | 0));
    // #100 bold lettering: the stage signs carry long variant names (COUNT YOUR SHOTS), so they run at 0.022
    const slot = i => ({ u: [0.34, 0.655][i % 2], v: [0.27, 0.49, 0.71][i >> 1] });
    const menuItems = [Object.assign({ id: 'practice', text: 'PRACTICE', sub: 'RANGE, NO CLOCK', color: 'green', s: 0.022,
      act: () => g.startPractice(g.free.tier) }, slot(0))];
    items.slice(g.free.page * PER, g.free.page * PER + PER).forEach((it, i) => menuItems.push(Object.assign({ text: (S.get(it.stage).short || 'RANGE') + ' ' + (it.variant + 1), sub: (S.get(it.stage).variantNames || [])[it.variant] || '',
      color: 'wood', s: 0.022, stage: it.stage, variant: it.variant,
      act: () => g.startFree(it.stage, it.variant, g.free.tier) }, slot(i + 1))));
    const T = S.TIERS[g.free.tier];
    const lastRow = pages > 1 || Math.ceil(menuItems.length / 2) >= 3 ? 0.87 : 0.75;   // paged: the bottom row stays put
    menuItems.push({ id: 'tier', text: 'TIER: ' + T.name, keep: true, color: T.sign, s: 0.024, u: 0.37, v: lastRow, act: sign => {
      g.free.tier = (g.free.tier + 1) % 4; const T2 = S.TIERS[g.free.tier]; sign.opts.color = T2.sign; sign.setText('TIER: ' + T2.name); } });
    menuItems.push({ text: 'BACK', color: 'slate', s: 0.026, u: 0.64, v: lastRow, act: () => g.go('title') });
    // paging (#99): NEXT > above, < PREV below, both on the right side (the big duck stands bottom-left); both wrap.
    // #100: one-line signs (bold lettering is wider); the page number is a caption under NEXT (draw)
    const flip = d => { if (G().screen !== this) return; g.free.page = (g.free.page + d + pages) % pages; this.menu.dispose(); this.build(); };
    this.pages = pages;
    if (pages > 1) menuItems.push({ id: 'page', text: 'NEXT >', color: 'blue', s: 0.026, u: 0.9, v: 0.42, act: () => flip(1) });
    if (pages > 1) menuItems.push({ id: 'pageprev', text: '< PREV', color: 'blue', s: 0.026, u: 0.9, v: 0.6, act: () => flip(-1) });
    this.menu = new Menu(menuItems);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    header('FREE PLAY', 'SHOOT A STAGE TO PLAY IT');
    const pr = this.menu.find('practice'); if (pr) caption(pr.sign, 'NO TIMER, NO QUOTA', 'lime', 3);
    const pg = this.menu.find('page'); if (pg) caption(pg.sign, 'PAGE ' + (G().free.page + 1) + '/' + this.pages, 'cyan', 5);
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
// every stage variant + COURSE, as [label, save key] (shared with the portrait layout)
const scoreRows = UI.scoreRows = () => {
  const rows = [];
  for (const id of S.order) { const d = S.get(id); for (let v = 0; v < d.variants; v++) rows.push([(d.short || 'RANGE') + ' ' + (v + 1), id + ':' + v]); }
  rows.push(['COURSE', 'course']);
  return rows;
};
UI.screens.scores = {
  enter() {
    const g = G(); g.placeDuck('title'); g.duckPose('cheer', 'idle', 1.2); rangeRoom();
    this.page = 0; this.pages = 1;
    // #100: rows are in the bold menu font now, so the table is paged (22 rows a page here, the portrait strip
    // fits its own count); NEXT > cycles the pages and wraps (a keep sign: it sparks, it doesn't shatter)
    const items = [{ text: 'BACK', color: 'crimson', u: 0.6, v: 0.86, s: 0.03, act: () => g.go('title') }];
    if (scoreRows().length > 16) items.push({ id: 'next', text: 'NEXT >', color: 'blue', keep: true, u: 0.4, v: 0.86, s: 0.03,
      act: () => { this.page = (this.page + 1) % Math.max(1, this.pages); } });
    this.menu = new Menu(items);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    header('HIGH SCORES', 'LOCAL BESTS ON THIS DEVICE');
    // 0.021: TWO BLOCKS side by side. #100: bold rows, 11 per block, 22 a page; NEXT > pages through the rest
    const rows = scoreRows(), PB = 11, per = PB * 2;
    this.pages = Math.max(1, Math.ceil(rows.length / per)); this.page = Math.min(this.page, this.pages - 1);
    const pr = rows.slice(this.page * per, this.page * per + per), hb = Math.ceil(pr.length / 2), blocks = [pr.slice(0, hb), pr.slice(hb)];
    const lw = 48, cw = 38, bw = lw + 4 * cw, gapB = 10, totalW = bw * 2 + gapB, xL = Math.round((RW - totalW) / 2), y0 = 40, rh = 11;
    H.plate(xL - 7, y0 - 4, totalW + 14, 28 + PB * rh);
    const hx = [0, 0, -3, 3];                                                // V.HARD / INSANE are wide: nudge them apart
    const ab = ['BEG', 'ADV', 'V.HARD', 'INSANE'];
    blocks.forEach((blk, bi) => {
      const x0 = xL + bi * (bw + gapB);
      if (!blk.length) return;
      ab.forEach((n, i) => H.textBc(n, x0 + lw + i * cw + cw / 2 + hx[i], y0 + 5, 'oxblood', 1, 'bone'));
      blk.forEach(([label, key], r) => {
        const y = y0 + 20 + r * rh;
        H.rect(x0, y - 2, bw, 1, 'rust');
        H.textB(label, x0, y + 1, 'umber', 1, 'bone');
        for (let i = 0; i < 4; i++) { const b = B.Save.best(key, i); H.textBc(b ? String(b) : '-', x0 + lw + i * cw + cw / 2, y + 1, b ? 'void' : 'chestnut', 1, 'bone'); }
      });
    });
    const nx = this.menu.find('next'); if (nx) caption(nx.sign, 'PAGE ' + (this.page + 1) + '/' + this.pages, 'cyan', 3);
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
  H.textBc('SHOTS', x + w / 2, y + 15, 'bone', 1, 'void');
  const r = rule || 'unlimited', cx = x + w / 2;
  // #100: the small lines are bold now; the reload words wrap to the pillar (RIGHT / CLICK TO / RELOAD)
  const sm = (lines, y0) => lines.forEach((l, i) => H.textBc(l, cx, y0 + i * 10, 'bone', 1, 'void'));
  if (r === 'unlimited' || (!r.mag && !r.cap)) { H.sprite(H.INF, cx - 13, y + 52, 3, { X: 'bone' }, 'inf3'); H.textBc('NO LIMIT', cx, y + 80, 'lemon', 1, 'void'); }
  else if (r.mag) { H.text7c(String(r.mag), cx, y + 38, 4, 'bone', 'void', 2); H.textBc('PER MAG', cx, y + 72, 'lemon', 1, 'void'); sm(wrapB(UI.reloadCard(r.autoReload).join(' '), w - 4).slice(0, 3), y + 83); }
  else { H.text7c(String(r.cap), cx, y + 38, 4, 'bone', 'void', 2); H.textBc('IN TOTAL', cx, y + 72, 'lemon', 1, 'void'); sm(wrapB('MAKE THEM COUNT!', w - 4), y + 83); }
}
function timePillar(x, y, secs) {
  const w = 60, h = 132, cx = x + w / 2, cy = y + 50;
  H.box(x, y, w, h, 'magenta', 'pink', 'plum');
  H.textBc('TIME', cx, y + 7, 'bone', 1, 'void');
  H.draw(H.pixImg('watch', 41, 41, (px, py) => {
    const d = Math.hypot(px - 20, py - 20);
    if (d > 20) return null; if (d > 18.4) return 'void'; if (d > 16.5) return 'amber'; if (d > 15.6) return 'void';
    const a = Math.atan2(py - 20, px - 20), tick = d > 12.5 && Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.42;
    return tick ? 'void' : 'bone';
  }), cx - 20, cy - 20);
  H.rect(cx - 3, cy - 25, 6, 4, 'void'); H.rect(cx - 2, cy - 24, 4, 3, 'amber');
  H.rect(cx, cy - 12, 1, 12, 'red'); H.rect(cx, cy, 8, 1, 'void');
  H.text7c(String(secs), cx, y + 78, 3, 'bone', 'void', 2);
  H.textBc('SECONDS', cx, y + 106, 'lemon', 1, 'void');
}
UI.screens.briefing = {
  enter(a) {
    this.a = a; this.t = 0; this.done = false;
    const g = G(); g.placeDuck('brief'); g.duckPose('present'); S.showEnv(a.run.stage);
    // #95: free play gets a BACK sign (top-right, over Deputy Duck's head) back to the FREE PLAY menu; a click anywhere
    // else still skips the card. The course has no BACK (a click skips, ESC leaves)
    this.menu = g.mode === 'free' && !a.versus ? new Menu([{ id: 'back', text: 'BACK', color: 'slate', s: 0.026, u: 0.885, v: 0.215, z: 3.4,
      act: () => { if (G().screen === this) { this.done = true; g.go('free'); } } }]) : null;
  },
  exit() { if (this.menu) this.menu.dispose(); this.menu = null; },
  update(dt, t) {
    this.t += dt; if (this.menu) this.menu.update(dt, t);
    if (this.menu && this.menu.busy > 0) return;                              // BACK was shot: don't auto-start under it
    if (this.a.versus ? performance.now() >= this.a.run.wall0 : this.t > 9) this.go();
  },
  go() { if (this.done) return; this.done = true; G().go('play', { run: this.a.run, versus: this.a.versus }); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const run = this.a.run, c = run.cfg, b = run.def.briefing(c), vs = this.a.versus;
    H.dim(0, 0, 330, RH); H.dim(330, 0, RW - 330, 36);
    H.stoneBanner(12, 8, 402, 26);
    const rule = vs ? [['FIRST HIT ON A TARGET ', 'void'], ['TAKES IT!', 'red']] : b.rule, big = H.ruleLineBw(rule, 2) <= 390;   // #100 bold
    H.ruleLineB(rule, RW / 2, big ? 14 : 17, big ? 2 : 1);
    H.redPanel(12, 42, 172, 132);
    H.text7('SHOOT!', 26, 54, 2, 'gold', 'void', 2);
    const def = run.def;                                                      // stage icon hooks (ENGINE.md: briefing icons)
    if (def.drawIcon) def.drawIcon(98, 104, 21, t); else H.bullseyeIcon(98, 104, 21);
    if (vs) { H.textBc('MOST HITS', 98, 134, 'bone', 2); H.textBc('WINS', 98, 151, 'lemon', 2); }
    else { H.text7c(String(c.quota), 98, 130, 3, 'gold', 'void', 2); H.textBc(b.unit + ' OR MORE', 98, 157, 'bone', 1); }
    if (b.dont) {
      H.sticker(12, 182, 90, 30);                                             // #100: narrower (bold text), the info lines get the room
      H.textB("DON'T SHOOT!", 19, 187, 'void', 1); H.textB('LIFE -1', 19, 198, 'crimson', 1);
      // a stage's own don't-shoot icon (a face) keeps its read: the X moves to its lower-right corner
      if (def.drawDont) { def.drawDont(120, 196, 13, t); H.redX(131, 205, 5); } else { H.bombIcon(120, 196, 13, t); H.redX(120, 196, 9); }
    } else if (b.tip) linesB(UI.reloadTip(b.tip, c.ammo), 14, 186, 126, 'lemon', 'l');
    shotsPillar(194, 42, c.ammo); timePillar(262, 42, c.time);
    // #100: the info lines are bold and wrap inside x 144..336 (left of Deputy Duck); 10 px a line (9 when there are 5)
    const IX = 144, IW = 192, il = [];
    const info = (str, col, max = 2) => wrapB(str, IW).slice(0, max).forEach(l => il.push([l, col]));
    if (this.a.label) info(this.a.label, 'yellow', 1);
    info((c.title || '') + (c.subtitle ? ': ' + c.subtitle : ''), 'mist');
    if (b.dont && b.tip) info(UI.reloadTip(b.tip, c.ammo), 'lemon');
    const lh = il.length + (vs ? 1 : 0) > 4 ? 9 : 10; let iy = 179;
    for (const [l, col] of il.slice(0, 5)) { H.textB(l, IX, iy, col, 1, 'void'); iy += lh; }
    if (vs && iy <= 216) { const P = run.players; let x = IX; x += H.textB(P[0].name, x, iy, 'coral', 1, 'void') + 5; x += H.textB('VS', x, iy, 'bone', 1, 'void') + 5; H.textB(P[1].name, x, iy, 'ice', 1, 'void'); }
    if (!vs && blink(t)) H.textBr(G().touch ? 'TAP TO SKIP' : 'CLICK OR TAP TO SKIP', RW - 4, RH - 9, 'yellow', 1, 'void');
    if (vs) H.textBr('GET READY... ' + Math.max(0, Math.ceil((run.wall0 - performance.now()) / 1000)), RW - 4, RH - 9, 'yellow', 1, 'void');
    statusLine(this.a.status || '');
  },
  fire(u, v, inside) {
    if (this.menu && (this.menu.busy > 0 || (inside && Tg.pick(R.rayAt(u, v), this.menu.items.map(i => i.sign))))) { if (this.menu.busy <= 0) this.menu.fire(G().shoot(u, v)); return; }
    if (!this.a.versus && this.t > 0.35) this.go();
  }
};

// =========================================================================================
// PLAY: the stage runs; HUD; countdown; shots go to G.playFire
// =========================================================================================
UI.screens.play = {
  enter(a) {
    this.run = a.run; this.versus = !!a.versus; this.left = false; this.pop = null; this.paused = false; this.pmenu = null;
    const g = G(); g.run = a.run; g.placeDuck(a.run.practice ? 'practice' : 'mini'); g.duckPose('idle');
    g.practiceMenu = this.menu = a.run.practice ? practiceMenu(a.run) : null;
    // #95: a small MENU sign in a corner on every stage (not practice, not versus): shooting it pauses the run
    this.ctl = !this.versus && !a.run.practice ? new Menu([{ id: 'menu', text: 'MENU', keep: true, still: true, color: 'slate', s: MENU_SIGN.s, u: MENU_SIGN.u, v: MENU_SIGN.v, z: MENU_SIGN.z,
      act: () => this.pause() }]) : null;
  },
  exit() {
    if (this.menu) this.menu.dispose(); this.menu = null; G().practiceMenu = null;
    if (this.ctl) this.ctl.dispose(); this.ctl = null;
    if (this.pmenu) this.pmenu.dispose(); this.pmenu = null;
    this.paused = false; if (this.run) this.run.paused = false;
  },
  // #95 pause: the stage clock stops (run.update is skipped; Run.canShoot() is false, so R / frame reloads wait too).
  // QUIT leaves like ESC (free play -> FREE PLAY, course -> title), RESUME carries on
  pause() {
    const run = this.run, g = G();
    if (this.paused || run.state === 'end' || g.screen !== this) return;
    this.paused = true; run.paused = true;
    this.pmenu = new Menu([
      { id: 'quit', text: 'QUIT', color: 'crimson', s: 0.03, u: 0.37, v: 0.52, z: 3.4, act: () => { if (G().screen === this) g.go(g.mode === 'free' ? 'free' : 'title'); } },
      { id: 'resume', text: 'RESUME', color: 'green', s: 0.03, u: 0.62, v: 0.52, z: 3.4, act: () => this.resume() }
    ]);
  },
  resume() {
    if (!this.paused) return;
    this.paused = false; this.run.paused = false;
    if (this.pmenu) this.pmenu.dispose(); this.pmenu = null;
  },
  update(dt, t) {
    const run = this.run, g = G();
    if (this.ctl) { const sg = this.ctl.items[0].sign; sg.group.visible = run.state !== 'end' && !this.paused; this.ctl.update(dt, t); }
    if (this.paused) { if (this.pmenu) this.pmenu.update(dt, t); return; }   // frozen: no clock, no spawns, no events
    run.update(run.versus ? dt : dt * (g.slow || 1));                       // ?slow= (testing) slows a solo stage
    if (this.menu) { this.menu.paint(); this.menu.update(dt, t); }
    // Deputy Duck in play: a hit = a silent happy hop; a bomb = his scared face (hands up) for 1 s, silent, straight back
    // to rest (no relief); a bystander = nothing. Angry only ever follows shooting him (main.js duckShot); the laugh
    // on every 3rd miss is main.js playFire's.
    for (const e of run.events) {
      if (e.type === 'hit' && e.by === run.local) g.duckReact('happy', 0.6);
      else if ((e.type === 'bomb' || e.type === 'bystander') && e.by === run.local) {
        if (e.type === 'bomb') { SFX.duckQuiet(1.3); g.duckReact('scared', 1.0); }
        g.shakeIt(0.35); this.pop = { text: run.practice ? 'BOMB!' : 'LIFE -1', t: 0, rows: 'red' };
      }
      else if (e.type === 'quota') this.pop = { text: 'QUOTA!', t: 0, rows: 'lime' };
    }
    run.events.length = 0;
    if (this.pop) { this.pop.t += dt; if (this.pop.t > 1.0) this.pop = null; }
    if (run.state === 'end' && run.endT > 1.3 && !this.left) { this.left = true; g.stageEnded(run); }
  },
  draw(t) {
    const run = this.run, g = G();
    H.drawPlay(g.hudState(run), t);
    if (this.paused) {                                                        // dim round the QUIT / RESUME row (the signs stay bright)
      H.dim(0, 0, RW, 104); H.dim(0, 146, RW, RH - 146);
      H.text7c('PAUSED', RW / 2, 50, 4, 'gold', 'void', 2);
      H.textBc(g.mode === 'free' ? 'QUIT: BACK TO FREE PLAY' : 'QUIT: END THE COURSE', RW / 2, 152, 'mist', 1, 'void');
      return;
    }
    if (run.state === 'count') {
      const n = Math.ceil(-run.t - 0.2);
      if (n >= 1 && n <= 3) { H.text7c(String(n), RW / 2, 70, 7, 'gold', 'void', 2); H.text3c('READY?', RW / 2, 124, 'bone', 2, 'void'); }
      else H.text7c('BLAM!', RW / 2, 76, 6, 'hot', 'void', 2);
    } else if (run.state === 'play' && run.t < 0.5) H.text7c('BLAM!', RW / 2, 76, 6, 'hot', 'void', 2);
    if (run.state === 'end') {
      const w = run.practice ? 'DONE!' : { time: 'TIME UP!', done: 'FINISH!', ammo: 'OUT OF AMMO!', lives: 'OUCH!' }[run.endReason] || 'FINISH!';
      H.text7c(w, RW / 2, 80, 4, run.endReason === 'lives' ? 'red' : 'gold', 'void', 2);
    }
    if (this.pop && ((this.pop.t * 10) | 0) % 2 === 0) H.text7c(this.pop.text, RW / 2, 40, 2, this.pop.rows, 'void', 2);
    if (run.versus && run.me.lives <= 0 && run.state === 'play') H.text3c('OUT OF LIVES - WATCH THE REST!', RW / 2, 40, 'red', 1, 'void');
    if (run.practice && run.state === 'play' && !tall()) H.text3c(G().touch ? 'SHOOT FINISH TO END' : 'SHOOT FINISH (OR ESC) TO END', RW / 2, 4, 'mist', 1, 'void');
  },
  fire(u, v, inside, touch) {
    const g = G(), run = this.run;
    // #95: the pause signs / the MENU sign come before the stage (never shots: no ammo, no stats)
    if (this.paused) { if (inside && this.pmenu) this.pmenu.fire(g.shoot(u, v)); return; }
    if (inside && this.ctl && run.state !== 'end' && Tg.pick(R.rayAt(u, v), this.ctl.items.map(i => i.sign)) && !Tg.pick(R.rayAt(u, v), run.live)) { this.ctl.fire(g.shoot(u, v)); return; }
    // #112: the practice list (tiers + FINISH) likewise, even with an empty magazine
    if (inside && this.menu && run.state !== 'end' && Tg.pick(R.rayAt(u, v), this.menu.items.map(i => i.sign))) { this.menu.fire(g.shoot(u, v)); return; }
    g.playFire(run, u, v, inside, touch);
  }
};
// #95 the MENU sign: top-left right under the SCORE / BEST lines, on the near plane (z 3.4, in front of every stage's
// foreground). Scanned over every stage / variant (ENGINE.md "Build 0.031 UI batch"): only INVASION's saucers ever
// cross that corner (~0.3 s a round); a shot that also hits a live target goes to the target, never to MENU
const MENU_SIGN = { u: 0.058, v: 0.092, s: 0.02, z: 3.4 };

// PRACTICE list (#111, #112): a vertical list on the LEFT of the play rect, on the empty floor under lane 1 and above
// the HUD strip (Deputy Duck stands in the middle, the gun on the right): BEGINNER / ADVANCED / VERY HARD / INSANE, then
// the crimson FINISH sign (PC and touch), which ends the session like ESC (-> practice results). The current tier
// wears its colour, the others are slate; shooting one switches the practice rules live (Run.setTier). Bold font
// (#100) at 1 px a voxel; 'keep' signs: they spark, they don't shatter.
const PRACTICE_SIGNS = { u: 0.13, v0: 0.70, dv: 0.0465, s: 0.019 };   // #116: below the brown floor edge, above the HUD band, a tad smaller, still
function practiceMenu(run) {
  const P = PRACTICE_SIGNS, minW = Math.max(...S.TIERS.map(T => R.bold(T.name).w));   // one width for the whole list
  const items = S.TIERS.map((T, i) => ({ id: 'tier' + i, text: T.name, keep: true, color: i === run.tier ? T.sign : 'slate',
    s: P.s, u: P.u, v: P.v0 + i * P.dv, z: 1.5, minW, still: true, act: () => G().practiceTier(i) }));
  items.push({ id: 'finish', text: 'FINISH', keep: true, color: 'crimson', s: P.s, u: P.u, v: P.v0 + 4 * P.dv, z: 1.5, minW, still: true,
    act: () => { if (run.state !== 'end') run.end('done'); } });
  const menu = new Menu(items);
  for (const it of menu.items) it.sign.phase = 0;    // the whole list bobs together, so the gaps between the boards stay even
  function paint() {
    S.TIERS.forEach((T, i) => { const it = menu.items[i], c = i === run.tier ? T.sign : 'slate'; if (it.sign.opts.color !== c) { it.sign.opts.color = c; it.sign.setText(T.name); } });
  }
  menu.paint = paint;                                // play.update calls it every frame (a no-op unless the tier changed)
  return menu;
}

// =========================================================================================
// PRACTICE RESULTS: the session's numbers (never saved, no score), AGAIN / BACK signs (always both)
// =========================================================================================
UI.screens.practiceresults = {
  enter(a) {
    this.a = a; const g = G(); g.placeDuck('results'); g.duckPose('cheer', 'idle', 1.5); rangeRoom();
    this.menu = new Menu([
      { text: 'AGAIN', color: 'green', s: 0.03, u: 0.3, v: 0.86, z: 3.4, act: () => g.startPractice(g.free.tier) },
      { text: 'BACK', color: 'slate', s: 0.03, u: 0.56, v: 0.86, z: 3.4, act: () => g.go('free') }
    ]);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); },
  // no portrait panel: on a tall phone this card simply draws in the game rect
  draw(t) {
    const r = this.a.res, m = Math.floor(r.secs / 60), sec = Math.floor(r.secs % 60);
    H.dim(0, 0, 262, 190); H.dim(262, 0, RW - 262, 60);                     // the AGAIN / BACK signs below stay bright
    H.text7c('PRACTICE', RW / 2, 10, 4, 'gold', 'void', 2);
    H.textBc(S.TIERS[r.tier].name + '  -  NOTHING SAVED', RW / 2, 40, 'cyan', 1, 'void');
    H.plate(18, 50, 236, 132);
    const row = (i, k, v, c = 'void') => { H.textB(k, 30, 62 + i * 20, 'umber', 1, 'bone'); H.textBr(v, 242, 62 + i * 20, c, 1, 'bone'); };
    row(0, 'SHOTS', String(r.shots));
    row(1, 'HITS', String(r.hits), 'forest');
    row(2, 'ACCURACY', r.pct + '%');
    row(3, 'BEST STREAK', String(r.bestStreak));
    row(4, 'BOMBS SHOT', String(r.bombs), r.bombs ? 'crimson' : 'void');
    row(5, 'TIME', m + ':' + String(sec).padStart(2, '0'));
    statusLine(this.a.status || '');
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// RESULTS: big shouty CLEARED / FAILED, stats, stage score box, NEW RECORD burst
// =========================================================================================
UI.screens.results = {
  enter(a) {
    this.a = a; this.t = 0; this.done = false; const g = G();
    g.placeDuck('results'); g.duckPose(a.res.cleared ? 'cheer' : 'sad');
    SFX.play(a.res.cleared ? 'stageClear' : 'stageFail'); if (a.newRecord) SFX.play('newRecord');
    // #53 free play: AGAIN (same stage / variant / tier, new seed) and BACK (the free-play menu) signs, no auto-advance
    this.menu = a.free ? new Menu([
      { text: 'AGAIN', color: 'green', s: 0.03, u: 0.3, v: 0.86, z: 3.4, act: () => g.startFree(a.free.stage, a.free.variant, a.free.tier) },   // #94: z 3.4 = in front of every stage's foreground (Laser Tag's barrier sits at z 3)
      { text: 'BACK', color: 'slate', s: 0.03, u: 0.56, v: 0.86, z: 3.4, act: () => g.go('free') }
    ]) : null;
    // #95 course: a MENU sign (bottom, right of the plate) leaves to the title like ESC; a click anywhere else continues
    this.ctl = a.free || a.versus ? null : new Menu([{ id: 'menu', text: 'MENU', color: 'slate', s: 0.026, u: 0.68, v: 0.86, z: 3.4,
      act: () => { if (G().screen === this) { this.done = true; g.go('title'); } } }]);
  },
  exit() { if (this.menu) this.menu.dispose(); this.menu = null; if (this.ctl) this.ctl.dispose(); this.ctl = null; },
  update(dt, t) {
    this.t += dt; if (this.ctl) this.ctl.update(dt, t);
    if (this.menu) this.menu.update(dt, t); else if (this.t > 14 && !(this.ctl && this.ctl.busy > 0)) this.go();
  },
  go() { if (this.done) return; this.done = true; this.a.next(); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    const r = this.a.res;
    if (this.ctl) { H.dim(0, 0, 356, 188); H.dim(0, 188, 252, RH - 188); }   // course: the MENU sign stays bright
    else H.dim(0, 0, 356, this.menu ? 190 : RH);
    H.dim(356, 0, RW - 356, 60);                                              // free play: the signs below stay bright
    if (r.cleared) H.starburst(RW / 2, 30, 34, t * 0.8, 'yellow', 'orange', 14);
    H.text7c(r.cleared ? 'CLEARED!' : 'FAILED!', RW / 2, 14, 5, r.cleared ? 'gold' : 'red', 'void', 2);
    H.plate(18, 66, 196, 118);
    const row = (i, k, v, c = 'void') => { H.textB(k, 30, 80 + i * 20, 'umber', 1, 'bone'); H.textBr(v, 202, 80 + i * 20, c, 1, 'bone'); };
    row(0, 'HITS', r.hits + (this.a.versus ? '' : '/' + r.quota), r.hits >= r.quota ? 'forest' : 'crimson');
    row(1, 'HIT %', r.pct + '%');
    row(2, 'FASTEST', isFinite(r.fastest) ? r.fastest.toFixed(2) + 'S' : '-');
    row(3, 'POINTS', String(r.base));
    row(4, 'BONUS', r.bonus ? '+' + r.bonus : '-', r.bonus ? 'forest' : 'chestnut');
    H.redPanel(224, 66, 128, 70);
    H.textBc('STAGE SCORE', 288, 76, 'bone', 1);
    H.text7c(String(r.score), 288, 94, 3, 'gold', 'void', 2);
    H.textBc('BEST ' + this.a.best, 288, 141, 'mist', 1, 'void');
    if (this.a.total != null) H.textBc('TOTAL ' + this.a.total, 288, 151, 'yellow', 1, 'void');
    if (this.a.newRecord) {
      H.starburst(288, 172, 15, t * 2, 'lemon', 'red', 10);
      if (blink(t, 6)) H.text7c('NEW RECORD!', 288, 168, 1, 'hot', 'void', 2);
    }
    if (this.a.lifeLost) { H.sprite(H.HEART, 30, 192, 2, H.HEART_OFF, 'heartoff'); H.textB('LIFE -1', 52, 197, 'red', 2, 'void'); }
    if (!this.menu && this.t > 1.0 && blink(t)) H.textBc(G().touch ? 'TAP TO CONTINUE' : 'CLICK OR TAP TO CONTINUE', RW / 2, 222, 'yellow', 1, 'void');
    statusLine(this.a.status || '');
  },
  fire(u, v, inside) {
    if (this.menu) { if (this.t > 0.6) menuFire(this, u, v, inside); return; }
    if (this.ctl && (this.ctl.busy > 0 || (inside && this.t > 0.6 && Tg.pick(R.rayAt(u, v), this.ctl.items.map(i => i.sign))))) { if (this.ctl.busy <= 0) this.ctl.fire(G().shoot(u, v)); return; }
    if (this.t > 1.0) this.go();
  }
};

// =========================================================================================
// GAME OVER (with continue) and COURSE CLEAR
// =========================================================================================
UI.screens.gameover = {
  enter(a) {
    this.a = a; this.count = 10; const g = G();
    g.placeDuck('title'); g.duckPose('sad'); SFX.play('gameOver'); rangeRoom();
    this.menu = new Menu([
      { text: 'CONTINUE', color: 'green', u: 0.35, v: 0.66, s: 0.038, act: () => { SFX.play('continue'); a.onContinue(); } },
      { text: 'QUIT', color: 'slate', u: 0.63, v: 0.66, s: 0.032, act: () => g.go('title') }
    ]);
  },
  exit() { this.menu.dispose(); },
  update(dt, t) { this.menu.update(dt, t); const p = Math.ceil(this.count); this.count -= dt; if (Math.ceil(this.count) !== p && this.count > 0) SFX.play('tick', { n: Math.ceil(this.count) }); if (this.count <= 0) G().go('title'); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    H.text7c('GAME OVER', RW / 2, 18, 5, 'red', 'void', 2);
    H.text7c('CONTINUE?', RW / 2, 60, 2, 'bone', 'void', 1);
    H.timerBall(RW / 2, 96, this.count / 10, Math.max(0, Math.ceil(this.count)), t);
    H.textBc('SCORE ' + (this.a.total || 0) + '   STAGE ' + (this.a.stage || 1) + '/4', RW / 2, 120, 'yellow', 1, 'void');
    statusLine(this.a.status || '');
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};
UI.screens.final = {
  enter(a) {
    this.a = a; this.t = 0; this.done = false; const g = G(); g.placeDuck('results'); g.duckPose('cheer'); rangeRoom(); SFX.play('courseClear'); if (a.newRecord) SFX.play('newRecord'); this.conf = 0;
    // #95: a MENU sign (bottom-left) back to the title; a click anywhere else does the same, as before
    this.menu = new Menu([{ id: 'menu', text: 'MENU', color: 'slate', s: 0.026, u: 0.16, v: 0.86, z: 3.4, act: () => this.go() }]);
  },
  exit() { if (this.menu) this.menu.dispose(); this.menu = null; },
  update(dt, t) {
    this.t += dt; this.conf -= dt; if (this.menu) this.menu.update(dt, t);
    if (this.conf <= 0) {                                                     // confetti from the ceiling
      this.conf = 0.06; const cols = ['pink', 'yellow', 'cyan', 'lime', 'orange', 'bone'];
      const p = R.screenToWorld(Math.random(), 0.05, 0.5);
      Tg.spawnChip(p, new THREE.Vector3(R.rnd(-0.6, 0.6), R.rnd(-0.5, 0.5), R.rnd(-0.3, 0.3)), 0.05, PAL[cols[(Math.random() * cols.length) | 0]], 2.6, 0.12);
    }
    if (this.t > 20 && !(this.menu && this.menu.busy > 0)) this.go();
  },
  go() { if (this.done || G().screen !== this) return; this.done = true; G().go('title'); },
  draw(t) {
    if (tall()) return;                                                       // portrait: drawPortrait() has the text
    H.starburst(RW / 2, 40, 44, t * 0.6, 'yellow', 'orange', 16);
    H.text7c('COURSE', RW / 2, 14, 4, 'gold', 'void', 2); H.text7c('CLEAR!', RW / 2, 48, 4, 'gold', 'void', 2);
    H.textBc(S.TIERS[this.a.tier].name, RW / 2, 86, 'cyan', 2, 'void');
    H.redPanel(RW / 2 - 80, 104, 160, 64);
    H.textBc('TOTAL SCORE', RW / 2, 114, 'bone', 1);
    H.text7c(String(this.a.total), RW / 2, 128, 3, 'gold', 'void', 2);
    H.textBc('BEST ' + this.a.best, RW / 2, 174, 'mist', 1, 'void');
    if (this.a.newRecord && blink(t, 6)) H.text7c('NEW RECORD!', RW / 2, 188, 2, 'hot', 'void', 2);
    if (this.t > 1.5 && blink(t)) H.textBc(G().touch ? 'TAP TO CONTINUE' : 'CLICK OR TAP TO CONTINUE', RW / 2, 222, 'yellow', 1, 'void');
  },
  fire(u, v, inside) {
    if (this.menu && (this.menu.busy > 0 || (inside && this.t > 0.6 && Tg.pick(R.rayAt(u, v), this.menu.items.map(i => i.sign))))) { if (this.menu.busy <= 0) this.menu.fire(G().shoot(u, v)); return; }
    if (this.t > 1.5) this.go();
  }
};

// =========================================================================================
// VERSUS LOBBY: host gets BLAM-XXXX, friend joins by code; host picks tier + stage
// =========================================================================================
UI.screens.lobby = {
  enter(a) {
    const g = G(), N = B.Net; g.placeDuck('title'); g.duckPose('present', 'idle', 1.5); rangeRoom();
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
        { text: 'TIER: ' + T.name, keep: true, color: T.sign, s: 0.024, u: 0.36, v: 0.6, act: () => N.setLobby({ tier: (L.tier + 1) % 4 }) },
        { text: 'STAGE: ' + (d.short || 'RANGE') + ' ' + (L.variant + 1), keep: true, color: 'wood', s: 0.024, u: 0.68, v: 0.6, act: () => {
          const ids = []; for (const id of S.order) for (let v = 0; v < S.get(id).variants; v++) ids.push([id, v]);
          const i = ids.findIndex(e => e[0] === L.stage && e[1] === L.variant), nx = ids[(i + 1) % ids.length];
          N.setLobby({ stage: nx[0], variant: nx[1] }); } },
        { text: 'START!', color: 'crimson', s: 0.036, u: 0.36, v: 0.8, act: () => N.start() },
        { text: 'LEAVE', color: 'slate', s: 0.03, u: 0.66, v: 0.8, act: () => { N.leave(); g.go('title'); } }
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
        { text: 'HOST GAME', color: 'crimson', s: 0.032, u: 0.34, v: 0.5, act: () => N.host(name) },
        { text: 'JOIN GAME', color: 'blue', s: 0.032, u: 0.63, v: 0.5, act: () => UI.prompt('ENTER THE CODE (BLAM-XXXX)', 'BLAM-', 9, c => { if (c) N.join(c, name); else this.key = ''; }) },
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
      H.textBc(N.state === 'hosting' ? 'YOUR CODE' : 'JOINED', RW / 2, 41, 'slate', 1);
      H.text7c(N.code, RW / 2, 52, 2, 'red', 'void', 1);
    }
    if (N.state === 'hosting' || N.state === 'joined') {
      const P = N.players, y = 80;
      H.box(RW / 2 - 132, y, 120, 16, 'red', 'coral', 'crimson'); H.textBc(P[0] ? P[0].name : '...', RW / 2 - 72, y + 5, 'bone', 1);
      H.text7c('VS', RW / 2, y + 2, 2, 'gold', 'void', 2);
      H.box(RW / 2 + 12, y, 120, 16, 'blue', 'cyan', 'deepblue'); H.textBc(P[1] ? P[1].name : (blink(t) ? 'WAITING' : ''), RW / 2 + 72, y + 5, 'bone', 1);
      if (N.state === 'hosting' && !P[1]) H.textBc('TELL A FRIEND: VERSUS > JOIN GAME > THIS CODE', RW / 2, 102, 'mist', 1, 'void');
      if (N.state === 'joined') H.textBc('THE HOST PICKS TIER + STAGE: ' + S.TIERS[N.lobby.tier].name + ', ' + (S.get(N.lobby.stage).short || 'RANGE') + ' ' + (N.lobby.variant + 1), RW / 2, 102, 'mist', 1, 'void');
    }
    if (N.status) linesB(N.status, RW / 2, 113, RW - 16, N.state === 'offline' ? 'red' : 'yellow');
    statusLine('BUILD ' + G().BUILD, N.state.toUpperCase());
  },
  fire(u, v, inside) { menuFire(this, u, v, inside); }
};

// =========================================================================================
// VERSUS RESULTS: WINNER / LOSER with the duck
// =========================================================================================
// the verdict line under the WINNER! / LOSER... banner: [text, rows colour]; shared with portrait.js
const vsVerdict = UI.vsVerdict = (win, me, P) => win < 0 ? ['EVEN MATCH', 'bone']
  : win === me ? ['YOU WIN', 'gold'] : [String(P[win].name || ('P' + (win + 1))).toUpperCase() + ' WINS', win ? 'blue' : 'red'];
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
    // 0.007 layout: banner (y 5..33), then ONE centred verdict line (y 40..54: YOU WIN / <NAME> WINS), cards at 64
    if (this.win === me) H.starburst(RW / 2, 19, 30, t * 0.8, 'yellow', 'orange', 14);
    H.text7c(word, RW / 2, 5, 4, this.win < 0 ? 'bone' : this.win === me ? 'gold' : 'blue', 'void', 2);
    const vl = vsVerdict(this.win, me, P), vsc = H.text7w(vl[0], 2) > RW - 24 ? 1 : 2;
    H.text7c(vl[0], RW / 2, vsc === 2 ? 40 : 44, vsc, vl[1], 'void', 2);
    [0, 1].forEach(i => {
      const p = P[i], x = i ? 214 : 30, C = H.PCOL[i];
      H.box(x, 64, 150, 120, C[2], C[1], 'void', this.win === i ? 'yellow' : 'void');
      H.textBc(p.name + (i === me ? ' (YOU)' : ''), x + 75, 71, 'bone', 1);
      const shots = Math.max(p.shots, p.hits), pct = shots ? Math.round(p.hits / shots * 100) : 0;
      [['HITS', p.hits], ['HIT %', pct + '%'], ['FASTEST', isFinite(p.fastest) ? p.fastest.toFixed(2) + 'S' : '-'], ['SCORE', p.score], ['LIVES', p.lives]].forEach(([k, v], r) => {
        H.textB(k, x + 10, 91 + r * 17, C[0], 1); H.textBr(String(v), x + 140, 91 + r * 17, 'bone', 1);
      });
    });
    if (this.t > 1.5 && blink(t)) H.textBc(G().touch ? 'TAP FOR THE LOBBY' : 'CLICK OR TAP FOR THE LOBBY', RW / 2, 222, 'yellow', 1, 'void');
  },
  fire() { if (this.t > 1.5) this.go(); }
};

// ---------- duck hover hook: on every screen that shows the big Deputy Duck (all but play, where main.js does the
// mini HUD duck), he flinches while the crosshair is on him and relaxes when it leaves.  Mouse only (a touch has
// no hover).  Wraps each screen's update so the hook runs once per frame after the screen has moved things.
let hovOn = false, hovOffAt = 0;
const HOV_OFF = 0.22;                              // #68: the crosshair must be off him this long before hover drops (his hop can't toggle it)
function duckHover() {
  const g = G(), duck = g && g.duck;
  if (!duck || typeof duck.setHover !== 'function') return;
  let on = false;
  if (g.duckMode && g.duckMode !== 'mini' && g.duckMode !== 'hidden' && B.Input.mouseIn && !B.Input.touch) {
    try { on = !!duck.hitTest(R.rayAt(B.Input.aim.u, B.Input.aim.v)); } catch (e) { on = false; }
  }
  const now = performance.now() / 1000;
  if (on) hovOffAt = 0;
  else if (hovOn) { if (!hovOffAt) hovOffAt = now; if (now - hovOffAt < HOV_OFF) on = true; else hovOffAt = 0; }
  if (on !== hovOn) { try { duck.setHover(on); } catch (e) {} }
  hovOn = on;
}
for (const name in UI.screens) {
  if (name === 'play') continue;
  const scr = UI.screens[name], up = scr.update;
  scr.update = function (dt, t) { if (up) up.call(this, dt, t); duckHover(); };
}
})(window.BLAM);
