'use strict';
/* =========================================================================================
   B.L.A.M. js/main.js -- boot, the game flow (G) and the main loop.
   Mounts BLAM.Guns / BLAM.Duck (from js/guns.js, js/duck.js) or the placeholders in core/fallback.js.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, I = B.Input, H = B.HUD, S = B.Stage, Tg = B.Targets, Save = B.Save, SFX = B.SFX, UI = B.UI, N = B.Net;
const BUILD = '0.002';                      // bump on every publish (shown on the title status line)
const Q = new URLSearchParams(location.search);
// ?slow=0.25 (dev/testing): single-player stage clock runs at that rate, so slow tools (screenshot -> click
// takes seconds) can still shoot a target that is really there. Versus always runs on the wall clock.
const SLOW = Q.has('slow') ? Math.max(0.05, Math.min(1, parseFloat(Q.get('slow')) || 1)) : 1;
const G = B.G = { BUILD, t: 0, screen: null, screenName: '', timers: [], fps: 60, shake: 0, crossHot: 0, run: null, course: null,
  mode: 'title', free: { tier: 0 }, skin: 0, touch: I.touch, toastMsg: null, statusText: '', stageLabel: '', lastStep: performance.now(), slow: SLOW };
const VS_BRIEF = 5.5;                        // seconds of versus briefing before the countdown (both sides)
const urlSeed = () => Q.has('seed') ? (parseInt(Q.get('seed'), 10) >>> 0) : null;
const newSeed = () => urlSeed() != null ? urlSeed() : ((Math.random() * 4294967296) >>> 0);

// ---------- gun + duck: the other agent's modules, or placeholders behind the same API ----------
const GunsAPI = B.Guns && typeof B.Guns.create === 'function' ? B.Guns : B.Fallback.Guns;
const DuckAPI = B.Duck && typeof B.Duck.create === 'function' ? B.Duck : B.Fallback.Duck;
G.placeholders = { gun: GunsAPI === B.Fallback.Guns, duck: DuckAPI === B.Fallback.Duck };
function makeGun() {
  const opts = { skin: Save.settings.skin | 0, layout: I.touch && R.frame.portrait ? 'mobile-low' : 'desktop' };   // = the title's G.gunLayout()
  try { return GunsAPI.create(THREE, opts); }
  catch (e) { console.warn('BLAM.Guns.create failed, using the placeholder gun', e); G.placeholders.gun = true; return B.Fallback.Guns.create(THREE, opts); }
}
function makeDuck() {
  try { return DuckAPI.create(THREE, {}); }
  catch (e) { console.warn('BLAM.Duck.create failed, using the placeholder duck', e); G.placeholders.duck = true; return B.Fallback.Duck.create(THREE, {}); }
}
G.gun = makeGun(); R.camera.add(G.gun.group);
G.duck = makeDuck();
const duckHolder = new THREE.Group(); duckHolder.add(G.duck.group); R.scene.add(duckHolder);
G.skins = (G.placeholders.gun ? B.Fallback.Guns.SKINS : GunsAPI.SKINS) || [];
G.skin = (Save.settings.skin | 0) % Math.max(1, G.skins.length);
G.skinName = () => {
  const s = G.skins[G.skin], n = typeof s === 'string' ? s : (s && (s.name || s.id)) || ('SKIN ' + (G.skin + 1));
  return String(n).toUpperCase().replace(/[^A-Z0-9 \-!.]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12);
};
G.setSkin = i => {
  const n = Math.max(1, G.skins.length); G.skin = ((i % n) + n) % n;
  try { G.gun.setSkin(G.skin); } catch (e) { console.warn(e); }
  Save.set('skin', G.skin); SFX.play('skin', { n: G.skin });
  G.toast('GUN: ' + G.skinName(), 1.2);
};
// build every skin now, behind the LOADING screen, so the first key-4 press never hitches mid-stage (a first
// build is ~8-14 ms on a desktop, more on a phone); then let the cable hang again (setSkin resets it)
try { for (let i = 0; i < G.skins.length; i++) if (i !== G.skin) G.gun.setSkin(i); G.gun.setSkin(G.skin); for (let k = 0; k < 60; k++) G.gun.update(1 / 60); } catch (e) {}
// gun placement per screen (layouts in js/guns.js): the bottom-right corner everywhere you can shoot; a phone in
// portrait plays with it bottom-middle (its HUD is under the game rect there; in landscape the HUD strip owns the
// bottom middle) and parks it in the corner on menus, where the signs sit low; both slide it out of frame on the
// briefing / results cards, where Deputy Duck stands bottom-right
const GUN_AWAY = { briefing: 1, results: 1, final: 1, vsresults: 1 };
G.gunLayout = () => {
  const base = G.touch && R.frame.portrait ? 'mobile' : 'desktop', n = G.screenName;
  try { G.gun.setLayout(GUN_AWAY[n] ? base + '-away' : (base === 'mobile' && n !== 'play') ? base + '-low' : base); } catch (e) {}
};
I.onLayout(touch => { G.touch = touch; G.gunLayout(); });
R.resizeHooks.push(() => G.gunLayout());     // rotating a phone swaps the layout

// ---------- Deputy Duck: placement + reactions ----------
// spots: [u, v (feet), plane z, scale, mirror]. Right-hand spots are mirrored (negative x scale) so he faces the
// card; check pass: 1.25 -> 1.0 / 0.95, so every pose stays inside the frame and clear of the panels
const DUCK_SPOTS = { title: [0.12, 0.93, 1.2, 1.3, false], brief: [0.885, 0.93, 2.0, 1.0, true], results: [0.9, 0.935, 2.0, 0.95, true] };
G.placeDuck = mode => {
  G.duckMode = mode; R.steadyCamera();
  if (mode === 'hidden') { duckHolder.visible = false; return; }
  duckHolder.visible = true;
  if (mode === 'mini') {                                                    // mini duck, bottom-left corner of the play HUD
    R.camera.add(duckHolder); R.screenToCam(0.054, 0.978, 1.4, duckHolder.position);
    duckHolder.scale.setScalar(0.19); duckHolder.rotation.set(0.05, 0.3, 0);
  } else {
    const s = DUCK_SPOTS[mode] || DUCK_SPOTS.title;
    R.scene.add(duckHolder); R.screenToWorld(s[0], s[1], s[2], duckHolder.position);
    duckHolder.scale.set(s[4] ? -s[3] : s[3], s[3], s[3]); duckHolder.rotation.set(0, s[4] ? -0.3 : 0.3, 0);
  }
};
// duckBack = this screen's resting pose; duckBackT = when to return to it after a reaction.
// Shooting him plays duck.hit(): flop on his back, stars, pop up fuming, back to idle (DUCK_GAG s). Nothing
// interrupts that gag except a screen change (duckPose); setPose('shot') would leave him fuming ('angry').
const DUCK_GAG = 1.6;
let duckBack = 'idle', duckBackT = 0, duckGag = 0;
G.duckPose = (pose, after, dur) => {
  try { G.duck.setPose(pose); } catch (e) {}
  duckGag = 0; duckBack = after || pose; duckBackT = after ? (dur || 1) : 0;
};
G.duckReact = (pose, dur = 0.7) => {
  if (duckGag > 0) return;                                                  // still flat on his back: let him finish
  try { G.duck.setPose(pose); } catch (e) {}
  if (pose === 'happy') SFX.play('duckHappy'); else if (pose === 'angry') SFX.play('duckAngry');
  duckBackT = dur;
};
const _dp = new THREE.Vector3();
G.duckShot = ray => {
  if (!duckHolder.visible) return false;
  let h = null; try { h = G.duck.hitTest(ray); } catch (e) { h = null; }
  if (!h) return false;
  // duck.js returns true and keeps the intersection in duck.lastHit; the placeholder returns the intersection
  const ix = h.point ? h : G.duck.lastHit, p = ix && ix.point ? _dp.copy(ix.point) : G.duck.group.getWorldPosition(_dp);
  try { G.duck.hit(); } catch (e) {}
  duckGag = DUCK_GAG; duckBackT = DUCK_GAG + 0.05; SFX.play('duckHit');
  Tg.sparks(p, 6, ['lemon', 'yellow', 'bone'], G.duckMode === 'mini' ? 0.25 : 1.4, G.duckMode === 'mini' ? 0.008 : 0.03);
  return true;
};
// bullet hole + chips in the surface colour on the current stage set
G.envShot = ray => {
  const env = Object.values(S.defs).map(d => S.env(d.id)).find(e => e.visible);
  if (!env) return null;
  const h = ray.intersectObjects(env.userData.shootables || [], false)[0];
  if (!h) return null;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld), col = Tg.surfaceColor(h);
  Tg.addDecal(h.point, n, new THREE.Color(col).multiplyScalar(1.5).getHex());
  for (let k = 0; k < 6; k++) Tg.spawnChip(h.point, new THREE.Vector3(n.x * R.rnd(1, 2.5) + R.rnd(-1, 1), n.y * R.rnd(1, 2.5) + R.rnd(0.5, 2), n.z * R.rnd(1, 2.5) + R.rnd(-1, 1)), R.rnd(0.03, 0.05), col, R.rnd(0.5, 0.9));
  return h;
};
// fire the gun (visuals + sound); returns the aim ray
G.shoot = (u, v) => {
  R.steadyCamera();
  try { G.gun.setAim(u * 2 - 1, 1 - v * 2); G.gun.fire(); } catch (e) {}
  R.postMat.uniforms.boost.value = 0.22; G.crossHot = 0.09;
  if (Save.settings.shake) G.shake = Math.max(G.shake, 0.14);
  SFX.play('shot', { u, v });
  return R.rayAt(u, v);
};
G.shakeIt = s => { if (Save.settings.shake) G.shake = Math.max(G.shake, s); };
// touch: the finger hides what it taps, so a near miss (within TOUCH_SLOP CSS px) on a GOOD target still counts.
// Bombs / bystanders only ever take a precise hit. Leaves the shared ray re-aimed at (u, v).
const TOUCH_SLOP = 12;
function touchPick(run, u, v) {
  const f = R.frame, du = TOUCH_SLOP / f.cssW, dv = TOUCH_SLOP / f.cssH, good = run.live.filter(t => t.kind === 'target');
  let p = null;
  for (const k of [0.5, 1]) {
    for (let a = 0; a < 8 && !p; a++) p = Tg.pick(R.rayAt(u + Math.cos(a * Math.PI / 4) * du * k, v + Math.sin(a * Math.PI / 4) * dv * k), good);
    if (p) break;
  }
  R.rayAt(u, v);
  return p;
}
// a shot during a stage
G.playFire = (run, u, v, inside, touch) => {
  if (!inside || !run.canShoot()) return;
  const ammo = run.ammo;
  // dry (reloading / spent): ammo emits 'empty' + the HUD flash; a spent gun plays its dry-trigger click
  // (mid-reload the reload animation already says it all). No muzzle flash, no shot.
  if (!ammo.canFire()) { ammo.use(); if (ammo.empty) try { G.gun.fire(); } catch (e) {} return; }
  // fire the gun BEFORE spending the round: the last round of a magazine / cap gets its flash and recoil,
  // then ammo.use() starts the reload (gun.reload) or sets the empty state (gun.setEmpty)
  const ray = G.shoot(u, v), me = run.local;
  ammo.use();
  if (!run.versus) run.me.shots++;
  const send = (k, tid) => { if (run.versus) N.sendShot({ st: +run.t.toFixed(3), k, tid, a: ammo.infinite ? -1 : ammo.count, ar: ammo.reloading ? 1 : 0 }); };
  if (G.duckShot(ray)) { send('duck', -1); return; }                        // shooting the deputy is just for fun
  const p = Tg.pick(ray, run.live) || (touch ? touchPick(run, u, v) : null);
  if (p) {
    const tg = p.target;
    if (tg.kind === 'bomb' || tg.kind === 'bystander') { run.applyPenalty(me, tg.kind, tg.id, p.point); send('bomb', tg.id); return; }
    if (run.versus) { tg.shatter(p.point, { tint: S.PCOLS[me] }); send('hit', tg.id); }   // optimistic; the host decides who gets it
    else run.applyHit(me, tg.id, run.t, p.point);
    return;
  }
  G.envShot(ray); SFX.play('miss'); G.duckReact('angry', 0.8); send('miss', -1);
};
G.hudState = run => ({
  versus: run.versus, portrait: R.frame.portrait, players: run.versus ? run.players : [run.me],
  timeFrac: run.state === 'count' ? 1 : run.timeLeft / run.cfg.time, secs: Math.ceil(run.timeLeft),
  quota: run.cfg.quota, score: run.me.score, best: run.versus ? 0 : Save.best(run.stage + ':' + run.variant, run.tier),
  label: G.stageLabel + (G.slow < 1 && !run.versus ? ' SLOW' : ''), status: G.statusText
});
G.toast = (text, secs = 2) => { G.toastMsg = { text, t: secs }; };
G.after = (secs, fn) => { G.timers.push({ t: secs, fn }); };
G.applySettings = () => {
  const st = Save.settings;
  R.setDither(st.dither);
  R.view.style.cursor = st.crosshair ? 'none' : 'crosshair';
};

// =========================================================================================
// Flow
// =========================================================================================
const KEEP_RUN = { play: 1, briefing: 1, results: 1, vsresults: 1, gameover: 1, final: 1 };
G.go = (name, arg) => {
  const scr = UI.screens[name]; if (!scr) { console.warn('no screen', name); return; }
  if (G.screen && G.screen.exit) G.screen.exit();
  if (!KEEP_RUN[name] && G.run) { G.run.dispose(); G.run = null; }
  if (name === 'title' || name === 'briefing') { Tg.clearDecals(); }
  if (name !== 'play') G.vsWait = null;
  G.screen = scr; G.screenName = name;
  scr.enter(arg || {});
  G.gunLayout();
};
const tierName = t => S.TIERS[t].name;
function setRun(run) { if (G.run && G.run !== run) G.run.dispose(); G.run = run; }   // never leak a previous run's targets
const stageName = (id, v) => (S.get(id).short || S.get(id).name) + ' ' + (v + 1);
// ---- course: tier select -> 4 stages (briefing -> stage -> results), hearts carry over ----
G.startCourse = tier => {
  G.mode = 'course'; G.course = new S.Course(tier, newSeed()); G.nextStage();
};
G.nextStage = () => {
  const c = G.course;
  if (c.done) { G.courseClear(); return; }
  const st = c.current;
  const run = new S.Run({ stage: st.id, tier: c.tier, variant: st.variant, seed: c.stageSeed(), lives: [c.lives], maxLives: [c.maxLives], gun: G.gun, names: [Save.settings.name] });
  setRun(run);
  G.statusText = tierName(c.tier) + '  STAGE ' + (c.index + 1) + '/4';
  G.stageLabel = tierName(c.tier) + ' ' + (c.index + 1) + '-4';
  G.go('briefing', { run, label: 'STAGE ' + (c.index + 1) + ' OF 4', status: G.statusText });
};
G.courseClear = () => {
  const c = G.course, newRecord = c.total > 0 && Save.submit('course', c.tier, c.total);
  G.go('final', { tier: c.tier, total: c.total, best: Save.best('course', c.tier), newRecord });
};
G.gameOver = () => {
  const c = G.course;
  G.go('gameover', { total: c.total, stage: c.index, status: G.statusText, onContinue: () => {
    c.lives = c.maxLives; c.total = 0; c.index = Math.max(0, c.index - 1);   // retry the stage that ended the run, score resets
    G.nextStage();
  } });
};
// ---- free play ----
G.startFree = (stage, variant, tier) => {
  G.mode = 'free'; G.free.tier = tier;
  const run = new S.Run({ stage, tier, variant, seed: newSeed(), gun: G.gun, names: [Save.settings.name] });
  setRun(run);
  G.statusText = 'FREE PLAY  ' + tierName(tier) + '  ' + stageName(stage, variant);
  G.stageLabel = 'FREE PLAY';
  G.go('briefing', { run, label: 'FREE PLAY: ' + stageName(stage, variant), status: G.statusText });
};
// ---- a stage finished (play screen calls this ~1.3 s after the end) ----
G.stageEnded = run => {
  run.dispose();
  if (run.versus) {
    if (N.isHost) { N.hostEnd(run); G.vsFinish(run); }
    else G.vsWait = { run, t: 5 };                                         // wait for the host's final tally
    return;
  }
  const res = run.results(), key = run.stage + ':' + run.variant;
  const newRecord = res.score > 0 && Save.submit(key, run.tier, res.score), best = Save.best(key, run.tier);
  if (G.mode === 'course') {
    const c = G.course; c.total += res.score; c.lives = run.me.lives;
    let lifeLost = false;
    if (!res.cleared && run.endReason !== 'lives' && c.lives > 0) { c.lives--; lifeLost = true; SFX.play('lifeLost'); }
    c.index++;
    G.go('results', { res, best, newRecord, total: c.total, lifeLost, status: G.statusText, next: () => { if (c.lives <= 0) G.gameOver(); else G.nextStage(); } });
  } else {
    G.go('results', { res, best, newRecord, status: G.statusText, next: () => G.go('free') });
  }
};
// ---- versus ----
G.startVersus = m => {
  G.mode = 'versus';
  const run = new S.Run({ stage: m.stage, tier: m.tier | 0, variant: m.variant | 0, seed: m.seed >>> 0, versus: true, local: m.local | 0, names: m.names, gun: G.gun, delay: VS_BRIEF });
  setRun(run);
  G.statusText = 'VERSUS  ' + tierName(run.tier) + '  ' + stageName(run.stage, run.variant);
  G.stageLabel = 'VERSUS';
  console.log('[BLAM] versus start seed', run.seed, 'timeline', run.timelineHash, 'targets', run.timeline.length);
  G.go('briefing', { run, versus: true, label: 'VERSUS', status: G.statusText });
};
G.vsFinish = run => { if (G.screenName !== 'vsresults') G.go('vsresults', { run }); };
G.vsAbort = reason => { if (G.run) { G.run.dispose(); G.run = null; } G.go('lobby', { toast: reason }); };

// =========================================================================================
// Keys: 4 = next gun skin (anywhere), F = fps, 1-3 = dither modes (dev), Esc = back / quit
// =========================================================================================
I.onKey((k, e) => {
  if (k === '4') G.setSkin(G.skin + 1);
  else if (k === 'f' || k === 'F') Save.set('fps', !Save.settings.fps);
  else if (k >= '1' && k <= '3') { R.setMode(+k); G.toast('DITHER MODE ' + k + ': ' + R.MODE_NAMES[+k], 1.2); }
  else if (k === 'Escape') {
    if (G.screenName === 'title') return;
    if (G.run && G.run.versus) { N.leave(); G.vsAbort('YOU LEFT THE MATCH'); return; }
    if (G.screenName === 'lobby') N.leave();
    G.go('title');
  }
});
I.onFire((u, v, inside, touch) => { if (G.screen && G.screen.fire) G.screen.fire(u, v, inside, touch); });

// =========================================================================================
// Main loop
// =========================================================================================
// a drawing bug must not freeze the game: log the first error of each kind, keep rendering
const guarded = {};
function guard(k, fn) { try { fn(); } catch (e) { if (!guarded[k]) { guarded[k] = 1; console.error('[BLAM] ' + k, e); } } }
function step(dt, draw) {
  G.t += dt; G.lastStep = performance.now();
  for (let i = G.timers.length - 1; i >= 0; i--) { const tm = G.timers[i]; tm.t -= dt; if (tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); } }
  const a = I.aim, ax = a.u * 2 - 1, ay = 1 - a.v * 2;
  try { G.gun.setAim(ax, ay); G.gun.update(dt, G.t); } catch (e) { if (!G.gunErr) { G.gunErr = 1; console.error(e); } }
  duckGag = Math.max(0, duckGag - dt);
  if (duckBackT > 0) { duckBackT -= dt; if (duckBackT <= 0) try { G.duck.setPose(duckBack); } catch (e) {} }
  try { G.duck.lookAt(ax, ay); G.duck.update(dt, G.t); } catch (e) { if (!G.duckErr) { G.duckErr = 1; console.error(e); } }
  if (G.screen) G.screen.update(dt, G.t);
  if (G.vsWait) { G.vsWait.t -= dt; if (G.vsWait.t <= 0) { const r = G.vsWait.run; G.vsWait = null; G.vsFinish(r); } }
  Tg.updateChips(dt);
  R.postMat.uniforms.boost.value = Math.max(0, R.postMat.uniforms.boost.value - dt * 4);
  if (!draw) return;
  // camera (with screen shake)
  R.steadyCamera();
  if (G.shake > 0) { G.shake -= dt; const k = Math.max(0, G.shake) * 0.25; R.camera.position.x += R.rnd(-k, k); R.camera.position.y += R.rnd(-k, k); }
  // HUD
  H.use(R.hx); R.hx.clearRect(0, 0, R.RW, R.RH);
  if (G.screen) guard('draw', () => G.screen.draw(G.t));
  const tall = UI.tall();                     // portrait phone: text lives on the outer canvas (core/portrait.js)
  if (G.toastMsg) {
    G.toastMsg.t -= dt;
    if (G.toastMsg.t <= 0) G.toastMsg = null;
    else if (!tall) H.text3c(G.toastMsg.text, R.RW / 2, 46, 'yellow', 1, 'void');
  }
  G.crossHot = Math.max(0, G.crossHot - dt);
  if (I.mouseIn && !I.touch && Save.settings.crosshair) H.crosshair(I.aim.u, I.aim.v, G.crossHot > 0);
  if (Save.settings.fps) H.text3r(G.fps + ' FPS', R.RW - 4, 12, 'lime', 1, 'void');
  // outer frame (+ portrait HUD strip)
  const hs = G.screenName === 'play' && G.run ? G.hudState(G.run) : { menuLine: 'B.L.A.M. BUILD ' + BUILD };
  if (tall && G.screen && G.screen.drawPortrait) { const scr = G.screen; hs.panel = L => scr.drawPortrait(G.t, L); }
  if (tall && G.toastMsg) hs.toast = G.toastMsg.text;
  guard('outer', () => H.drawOuter(R.frame, G.t, hs));
  H.use(R.hx);
  R.render();
}
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000)); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  step(dt, true);
}
// a background tab gets no animation frames (sometimes without reporting document.hidden): keep a versus
// match (briefing, clock, adjudication) ticking on a timer whenever the rAF loop has stalled
setInterval(() => {
  if (!G.run || !G.run.versus) return;
  const dt = Math.min(1, (performance.now() - G.lastStep) / 1000);
  if (dt > 0.25) step(dt, false);
}, 250);
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// ---------- boot ----------
G.applySettings();
S.showEnv(S.order[0]);                     // menus are set in the first stage's room
const boot = document.getElementById('boot'); if (boot) boot.remove();
G.go(Q.get('go') && UI.screens[Q.get('go')] && !KEEP_RUN[Q.get('go')] ? Q.get('go') : 'title');
requestAnimationFrame(t => { last = t; loop(t); });
})(window.BLAM);
