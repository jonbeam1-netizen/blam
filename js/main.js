'use strict';
/* =========================================================================================
   B.L.A.M. js/main.js -- boot, the game flow (G) and the main loop.
   Mounts BLAM.Guns / BLAM.Duck (from js/guns.js, js/duck.js) or the placeholders in core/fallback.js.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, I = B.Input, H = B.HUD, S = B.Stage, Tg = B.Targets, Save = B.Save, SFX = B.SFX, UI = B.UI, N = B.Net;
const BUILD = '0.023';                      // bump on every publish (shown on the title status line)
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
const GUN_AWAY = { briefing: 1, results: 1, final: 1, vsresults: 1, practiceresults: 1 };
G.gunLayout = () => {
  const base = G.touch && R.frame.portrait ? 'mobile' : 'desktop', n = G.screenName;
  // versus play (landscape): 'desktop-versus' keeps the gun off P2's HUD half (name / counter / ammo capsule)
  const play = base === 'desktop' && G.run && G.run.versus && B.Guns && B.Guns.LAYOUTS && B.Guns.LAYOUTS['desktop-versus'] ? 'desktop-versus' : base;
  try { G.gun.setLayout(GUN_AWAY[n] ? base + '-away' : n !== 'play' ? base + '-low' : play); } catch (e) {}   // menus: '-low' (desktop-low = the corner spot)
};
I.onLayout(touch => { G.touch = touch; G.gunLayout(); });
R.resizeHooks.push(() => G.gunLayout());     // rotating a phone swaps the layout

// ---------- Deputy Duck: placement + reactions ----------
// spots: [u, v (feet), plane z, scale, mirror]. Right-hand spots are mirrored (negative x scale) so he faces the
// card; check pass: 1.25 -> 1.0 / 0.95, so every pose stays inside the frame and clear of the panels
// practice: bottom centre in front of the lanes, facing the player square on (6th value = yaw), small enough that the
// paddles and the tier signs read above his head; the HUD strip (shell left, clock right) leaves the middle free
const DUCK_SPOTS = { title: [0.12, 0.93, 1.2, 1.3, false], brief: [0.885, 0.93, 2.0, 1.0, true], results: [0.9, 0.935, 2.0, 0.95, true],
  practice: [0.5, 0.965, 2.0, 0.8, false, 0] };
// shot gag keep-in-frame (0.007): the flop (lying flat, the fuming arm shake and the overshoot when he springs back
// to idle, ~1.3-2.0 s) reached up to 3 % past the game rect edge (title: left, brief / results: right, mini HUD duck:
// left). From the shot until he has settled (GAG_LEN) the holder eases INWARD by GAG_NUDGE[mode] = [du, dv]
// (fractions of the game rect) and back. Vertex extents over every frame of the gag at 7 aim directions: the flop
// now stays inside the rect as far as his resting pose does (see ENGINE.md, Build 0.007).
const GAG_NUDGE = { title: [0.05, 0], brief: [-0.04, 0], results: [-0.05, 0], mini: [0.013, 0], practice: [0, 0] };
const GAG_LEN = 2.3, duckBase = new THREE.Vector3(), gagTo = new THREE.Vector3();
let gagT = 0;
function gagStart() {                                       // target spot, computed once (camera steady at the shot)
  const n = GAG_NUDGE[G.duckMode] || [0, 0], s = DUCK_SPOTS[G.duckMode];
  if (G.duckMode === 'mini') R.screenToCam(0.054 + n[0], 0.978 + n[1], 1.4, gagTo);
  else if (s) R.screenToWorld(s[0] + n[0], s[1] + n[1], s[2], gagTo); else gagTo.copy(duckBase);
  gagT = GAG_LEN;
}
function gagNudge(dt) {
  if (gagT <= 0) return;
  gagT = Math.max(0, gagT - dt);
  const g = GAG_LEN - gagT, sst = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const e = gagT > 0 ? sst(0, 0.18, g) * (1 - sst(GAG_LEN - 0.25, GAG_LEN, g)) : 0;
  duckHolder.position.lerpVectors(duckBase, gagTo, e);
}
G.placeDuck = mode => {
  gagT = 0;
  G.duckMode = mode; R.steadyCamera();
  if (mode === 'hidden') { duckHolder.visible = false; return; }
  duckHolder.visible = true;
  if (mode === 'mini') {                                                    // mini duck, bottom-left corner of the play HUD
    R.camera.add(duckHolder); R.screenToCam(0.054, 0.978, 1.4, duckHolder.position); duckBase.copy(duckHolder.position);
    duckHolder.scale.setScalar(0.19); duckHolder.rotation.set(0.05, 0.3, 0);
  } else {
    const s = DUCK_SPOTS[mode] || DUCK_SPOTS.title;
    R.scene.add(duckHolder); R.screenToWorld(s[0], s[1], s[2], duckHolder.position); duckBase.copy(duckHolder.position);
    duckHolder.scale.set(s[4] ? -s[3] : s[3], s[3], s[3]); duckHolder.rotation.set(0, s[5] != null ? s[5] : s[4] ? -0.3 : 0.3, 0);
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
// A reaction pose for dur s, then back to duckBack. Only the laugh has a voice (duckHeckle); a hit's happy hop and the
// bomb's scared face are silent (audio.js's pose watcher is hushed for that one: SFX.duckQuiet). An unknown pose
// name (an older duck.js without 'laugh') is ignored by setPose, so nothing breaks.
G.duckReact = (pose, dur = 0.7) => {
  if (duckGag > 0) return;                                                  // still flat on his back: let him finish
  try { G.duck.setPose(pose); } catch (e) {}
  if (pose === 'laugh') SFX.play('duckHeckle');
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
  duckGag = DUCK_GAG; duckBackT = DUCK_GAG + 0.05; gagStart(); SFX.play('duckHit');
  Tg.sparks(p, 6, ['lemon', 'yellow', 'bone'], G.duckMode === 'mini' ? 0.25 : 1.4, G.duckMode === 'mini' ? 0.008 : 0.03);
  return true;
};
// bullet hole + chips in the surface colour on the current stage set. Lands the shot's tracer (#76) on the wall.
// opts.ricochet (an in-game miss, #86): + a hard ricochet burst along the surface normal (B.FX.ricochetColors[stage id];
// the 'ricochet' sample already plays from SFX 'miss', see audio.js ROUTE.miss)
G.envShot = (ray, opts) => {
  const fx = B.FX, tr = G.lastTracer; G.lastTracer = null;
  const id = Object.keys(S.defs).find(k => { const e = S.env(k); return e && e.visible; }), env = id ? S.env(id) : null;
  const h = env ? ray.intersectObjects(env.userData.shootables || [], false)[0] : null;
  if (fx) fx.land(tr, h ? h.point : null);
  if (!h) return null;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld), col = Tg.surfaceColor(h);
  Tg.addDecal(h.point, n, new THREE.Color(col).multiplyScalar(1.5).setRGB(Math.min(1, new THREE.Color(col).r * 1.5), Math.min(1, new THREE.Color(col).g * 1.5), Math.min(1, new THREE.Color(col).b * 1.5)).getHex());
  for (let k = 0; k < 6; k++) Tg.spawnChip(h.point, new THREE.Vector3(n.x * R.rnd(1, 2.5) + R.rnd(-1, 1), n.y * R.rnd(1, 2.5) + R.rnd(0.5, 2), n.z * R.rnd(1, 2.5) + R.rnd(-1, 1)), R.rnd(0.03, 0.05), col, R.rnd(0.5, 0.9));
  if (opts && opts.ricochet && fx) fx.ricochet(h.point, n, ray.ray.direction, (G.run && G.run.stage) || id);
  return h;
};
// fire the gun (visuals + sound); returns the aim ray
G.shoot = (u, v) => {
  R.steadyCamera();
  try { G.gun.setAim(u * 2 - 1, 1 - v * 2); G.gun.fire(); } catch (e) {}
  R.postMat.uniforms.boost.value = 0.22; G.crossHot = 0.09;
  if (Save.settings.shake) G.shake = Math.max(G.shake, 0.14);
  SFX.play('shot', { u, v });
  const ray = R.rayAt(u, v);
  // #76 cosmetic tracer from the muzzle; whoever resolves the shot lands it (FX.land), else fx.js finds the wall
  try { G.lastTracer = B.FX ? B.FX.shot(ray) : null; } catch (e) { G.lastTracer = null; }
  return ray;
};
// land this shot's tracer (playFire): a target / duck point, or null = flew past everything
const landTracer = p => { const tr = G.lastTracer; G.lastTracer = null; if (tr && B.FX) B.FX.land(tr, p); };
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
// ---- RELOAD (build 0.005): instant (#44); the trigger depends on the RELOAD TYPE setting (#40):
//   PC    'arcade' (default): shoot the frame beside the game rect (pillars, or the top / bottom bars) OR rest the
//          crosshair on it for DWELL s (only when the magazine isn't full; a flick across the edge doesn't count)
//         'rclick': the right mouse button reloads anywhere; a frame click does nothing
//   touch 'swipe' (default): swipe down >= Input.SWIPE_PX CSS px anywhere; a frame tap does nothing
//         'tap': tap the frame
//   key R reloads in every mode. A frame shot is never a shot: no stats, no ammo from a cap, never sent to the
//   versus host. When the game rect fills the whole canvas (no frame), a thin edge zone of the rect stands in for
//   the frame (arcade / tap only).
const EDGE_ZONE = 0.028, DWELL = 0.1;
G.reloadMode = () => I.touch ? Save.settings.reloadTouch || 'swipe' : Save.settings.reloadPC || 'arcade';
G.frameReloads = () => { const m = G.reloadMode(); return m === 'arcade' || m === 'tap'; };
G.edgeZone = () => !R.frame.portrait && !H.markerSpots().length;
const inEdge = (run, u) => G.frameReloads() && run.ammo.type === 'mag' && G.edgeZone() && (u < EDGE_ZONE || u > 1 - EDGE_ZONE);
G.isSideShot = (run, u, v, inside) => !inside || inEdge(run, u);
G.sideReload = run => {
  if (!run || !run.canShoot()) return false;
  const ammo = run.ammo;
  if (!ammo.startReload()) return false;        // unlimited / cap / full / already reloading: nothing happens
  if (run.versus && N.sendAmmo) N.sendAmmo(run);
  return true;
};
// a shot during a stage
G.playFire = (run, u, v, inside, touch) => {
  if (G.isSideShot(run, u, v, inside)) { if (G.frameReloads()) G.sideReload(run); return; }   // never a shot
  if (!run.canShoot()) return;
  if (inside) G.lastTap = { u, v, t: G.t };
  const ammo = run.ammo;
  // dry (reloading / spent): ammo emits 'empty' + the HUD flash; a spent gun plays its dry-trigger click
  // (mid-reload the reload animation already says it all). No muzzle flash, no shot.
  if (!ammo.canFire()) { ammo.use(); if (ammo.empty || ammo.magEmpty) try { G.gun.fire(); } catch (e) {} return; }
  // fire the gun BEFORE spending the round: the last round of a magazine / cap gets its flash and recoil,
  // then ammo.use() starts the reload (gun.reload) or sets the empty state (gun.setEmpty)
  // practice: the tier signs over the duck's head are menu signs, not shots (no ammo, no stats)
  if (run.practice && G.practiceMenu && Tg.pick(R.rayAt(u, v), G.practiceMenu.items.map(i => i.sign))) { G.practiceMenu.fire(G.shoot(u, v)); return; }
  const ray = G.shoot(u, v), me = run.local;
  ammo.use();
  if (H.eject) H.eject(run.me);                   // #72: a brass casing out of the gun (HUD)
  if (!run.versus) run.me.shots++;
  const send = (k, tid, z) => { if (run.versus) N.sendShot({ st: +run.t.toFixed(3), k, tid, z, a: ammo.infinite ? -1 : ammo.count, ar: 0 }); };
  // shooting the deputy is just for fun (a miss). In practice he stands in the scene under the lanes, so the
  // targets are picked first and he is only hit-tested after a miss: he never blocks a shot at a paddle
  const duckPt = () => G.duck.lastHit && G.duck.lastHit.point ? G.duck.lastHit.point : null;
  if (!run.practice && G.duckShot(ray)) { landTracer(duckPt()); run.me.streak = 0; send('duck', -1); return; }
  const p = Tg.pick(ray, run.live) || (touch ? touchPick(run, u, v) : null);
  if (p) {
    const tg = p.target;
    landTracer(p.point);
    if (tg.kind === 'bomb' || tg.kind === 'bystander') { run.applyPenalty(me, tg.kind, tg.id, p.point); send('bomb', tg.id); return; }
    if (run.versus) { tg.shatter(p.point, { tint: S.PCOLS[me] }); send('hit', tg.id, p.zone); }   // optimistic; the host decides who gets it
    else run.applyHit(me, tg.id, run.t, p.point, p.zone);
    return;
  }
  run.me.streak = 0;
  if (run.practice && G.duckShot(ray)) { landTracer(duckPt()); return; }
  // every 3rd miss of the run (a new Run per stage resets it) Deputy Duck laughs at you; the other misses leave him be
  G.envShot(ray, { ricochet: true }); SFX.play('miss'); run.duckMisses = (run.duckMisses | 0) + 1;
  if (run.duckMisses % 3 === 0) G.duckReact('laugh', 1.3);
  send('miss', -1);
};
G.hudState = run => ({
  versus: run.versus, portrait: R.frame.portrait, players: run.versus ? run.players : [run.me],
  practice: run.practice ? { secs: run.practiceTime, streak: run.me.streak } : null,
  timeFrac: run.practice ? 1 : run.state === 'count' ? 1 : run.timeLeft / run.cfg.time, secs: run.practice ? 0 : Math.ceil(run.timeLeft),
  quota: run.cfg.quota, score: run.me.score, best: run.versus || run.practice ? 0 : Save.best(run.stage + ':' + run.variant, run.tier),
  label: G.stageLabel + (G.slow < 1 && !run.versus ? ' SLOW' : ''), status: G.statusText,
  // frame RELOAD markers (#31, #38): only on magazine stages; mode picks the art (plaque / mouse / swipe arrow)
  reload: run.ammo.type === 'mag' ? { empty: run.ammo.magEmpty, kick: run.ammo.kick, mode: G.reloadMode() } : null
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
const FX_SCREENS = { results: 1, vsresults: 1, gameover: 1, final: 1 };
const KEEP_RUN = { play: 1, briefing: 1, results: 1, vsresults: 1, gameover: 1, final: 1 };
G.go = (name, arg) => {
  const scr = UI.screens[name]; if (!scr) { console.warn('no screen', name); return; }
  const prev = G.screenName;
  if (G.screen && G.screen.exit) G.screen.exit();
  if (!KEEP_RUN[name] && G.run) { G.run.dispose(); G.run = null; }
  if (name === 'title' || name === 'briefing') { Tg.clearDecals(); }
  // 0.007: course-clear confetti (2.6 s chips) and a stage's last sparks / smoke must not drift into the next screen
  if (FX_SCREENS[prev] || name === 'title' || name === 'briefing') { try { Tg.clearChips(); } catch (e) {} }
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
// ---- practice (free play, first sign): the range at the free-play tier, no clock / quota / lives, never saved ----
// No briefing: straight into the 3-2-1 countdown. Deputy Duck stands in the scene (placeDuck('practice')); the
// tier signs over his head (play screen) call G.practiceTier. ESC ends it (key handler) -> practice results.
G.startPractice = tier => {
  G.mode = 'practice'; G.free.tier = tier;
  Tg.clearDecals(); try { Tg.clearChips(); } catch (e) {}
  const run = new S.Run({ stage: 'range', tier, variant: 0, seed: newSeed(), practice: true, gun: G.gun, names: [Save.settings.name] });
  setRun(run);
  G.statusText = 'PRACTICE  ' + tierName(tier) + '  ESC TO FINISH';
  G.stageLabel = 'PRACTICE';
  G.go('play', { run });
};
G.practiceTier = tier => {
  const run = G.run; if (!run || !run.practice) return;
  run.setTier(tier); G.free.tier = run.tier;
  G.statusText = 'PRACTICE  ' + tierName(run.tier) + '  ESC TO FINISH';
};
// ---- a stage finished (play screen calls this ~1.3 s after the end) ----
G.stageEnded = run => {
  run.dispose();
  if (run.versus) {
    if (N.isHost) { N.hostEnd(run); G.vsFinish(run); }
    else G.vsWait = { run, t: 5 };                                         // wait for the host's final tally
    return;
  }
  if (run.practice) { G.go('practiceresults', { res: run.practiceResults(), status: 'PRACTICE  ' + tierName(run.tier) }); return; }   // never saved
  const res = run.results(), key = run.stage + ':' + run.variant;
  const newRecord = res.score > 0 && Save.submit(key, run.tier, res.score), best = Save.best(key, run.tier);
  if (G.mode === 'course') {
    const c = G.course; c.total += res.score; c.lives = run.me.lives;
    let lifeLost = false;
    if (!res.cleared && run.endReason !== 'lives' && c.lives > 0) { c.lives--; lifeLost = true; SFX.play('lifeLost'); }
    c.index++;
    G.go('results', { res, best, newRecord, total: c.total, lifeLost, status: G.statusText, next: () => { if (c.lives <= 0) G.gameOver(); else G.nextStage(); } });
  } else {
    G.go('results', { res, best, newRecord, status: G.statusText, next: () => G.go('free'),
      free: { stage: run.stage, variant: run.variant, tier: run.tier } });   // #53: AGAIN / BACK signs instead of tap-to-continue
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
  else if (k === 'r' || k === 'R') { if (G.screenName === 'play' && G.run) G.sideReload(G.run); }   // works in every RELOAD TYPE
  else if (k === 'f' || k === 'F') Save.set('fps', !Save.settings.fps);
  else if (k >= '1' && k <= '3') { R.setMode(+k); G.toast('DITHER MODE ' + k + ': ' + R.MODE_NAMES[+k], 1.2); }
  else if (k === 'Escape') {
    if (G.screenName === 'title') return;
    // practice: ESC finishes the session (-> its results); on those results ESC goes back to FREE PLAY
    if (G.screenName === 'play' && G.run && G.run.practice) { if (G.run.state !== 'end') G.run.end('done'); return; }
    if (G.screenName === 'practiceresults') { G.go('free'); return; }
    if (G.run && G.run.versus) { N.leave(); G.vsAbort('YOU LEFT THE MATCH'); return; }
    if (G.screenName === 'lobby') N.leave();
    G.go('title');
  }
});
I.onFire((u, v, inside, touch) => { if (G.screen && G.screen.fire) G.screen.fire(u, v, inside, touch); });
// RIGHT CLICK mode: the right button reloads anywhere (the context menu is suppressed in input.js)
I.onAlt(() => { if (G.screenName === 'play' && G.run && G.reloadMode() === 'rclick') G.sideReload(G.run); });
// SWIPE DOWN mode: a downward swipe anywhere reloads (the tap that started it already fired, as every tap does)
I.onSwipe(() => { if (G.screenName === 'play' && G.run && G.reloadMode() === 'swipe') G.sideReload(G.run); });

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
  if (duckHolder.visible) gagNudge(dt);
  if (duckBackT > 0) { duckBackT -= dt; if (duckBackT <= 0) try { G.duck.setPose(duckBack); } catch (e) {} }
  try { G.duck.lookAt(ax, ay); G.duck.update(dt, G.t); } catch (e) { if (!G.duckErr) { G.duckErr = 1; console.error(e); } }
  if (G.screen) G.screen.update(dt, G.t);
  if (G.screenName === 'play' && G.run) playExtras(G.run);
  else if (duckHoverOn) { duckHoverOn = false; try { G.duck.setHover(false); } catch (e) {} }
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
  const crossOn = I.mouseIn && !I.touch && Save.settings.crosshair;
  if (crossOn) H.crosshair(I.aim.u, I.aim.v, G.crossHot > 0);
  if (G.screenName === 'play' && G.run) guard('reloadHud', () => drawReloadHud(G.run, crossOn));
  if (Save.settings.fps) H.text3r(G.fps + ' FPS', R.RW - 4, 12, 'lime', 1, 'void');
  // outer frame (+ portrait HUD strip)
  const hs = G.screenName === 'play' && G.run ? G.hudState(G.run) : { menuLine: 'B.L.A.M. BUILD ' + BUILD };
  if (tall && G.screen && G.screen.drawPortrait) { const scr = G.screen; hs.panel = L => scr.drawPortrait(G.t, L); }
  if (tall && G.toastMsg) hs.toast = G.toastMsg.text;
  guard('outer', () => H.drawOuter(R.frame, G.t, hs));
  H.use(R.hx);
  R.render();
}
// per-frame play extras: duck hover hook (the mini HUD duck under the crosshair) + ARCADE hover-to-reload
let duckHoverOn = false, dwellAt = 0, duckHoverOffAt = 0;
const DUCK_HOVER_OFF = 0.22;                     // #68: the crosshair must be off him this long before hover drops (his startle hop can't toggle it)
function onFrameNow(run) {                       // the mouse rests on the frame (or the edge zone)
  const p = I.ptr; return p.over && !I.touch && (!p.inside || inEdge(run, p.u));
}
function playExtras(run) {
  if (typeof G.duck.setHover === 'function') {
    let on = false;
    if ((G.duckMode === 'mini' || G.duckMode === 'practice') && I.mouseIn && !I.touch) { try { on = !!G.duck.hitTest(R.rayAt(I.aim.u, I.aim.v)); } catch (e) { on = false; } }
    const tNow = performance.now() / 1000;
    if (on) duckHoverOffAt = 0;
    else if (duckHoverOn) {                      // hysteresis: a miss only counts once it has lasted DUCK_HOVER_OFF s
      if (!duckHoverOffAt) duckHoverOffAt = tNow;
      if (tNow - duckHoverOffAt < DUCK_HOVER_OFF) on = true; else duckHoverOffAt = 0;
    }
    if (on !== duckHoverOn) { try { G.duck.setHover(on); } catch (e) {} }
    duckHoverOn = on;
  }
  // ARCADE hover reload: the pointer has to stay on the frame for DWELL s (wall clock, sampled per frame) while
  // the magazine isn't full; leaving the frame resets it, so a flick across the edge never reloads
  const now = performance.now();
  if (G.reloadMode() === 'arcade' && onFrameNow(run) && run.ammo.canReload && run.canShoot()) {
    if (!dwellAt) dwellAt = now;
    else if (now - dwellAt >= DWELL * 1000) { dwellAt = 0; G.sideReload(run); }
  } else dwellAt = 0;
}
// empty magazine: small blinking RELOAD under the crosshair (desktop) or at the last tap / lower centre (touch);
// no frame around the game rect: the edge zone + its markers are drawn on the HUD instead
function drawReloadHud(run, crossOn) {
  const am = run.ammo;
  if (am.type !== 'mag' || run.state !== 'play') return;
  if (am.magEmpty) {
    if (crossOn) H.reloadPrompt(I.aim.u, I.aim.v, G.t);
    else if (I.touch) { const lt = G.lastTap; H.reloadPrompt(lt ? lt.u : 0.5, lt ? lt.v : 0.72, G.t); }
  }
  if (G.edgeZone() && G.frameReloads()) {
    const st = H.markerState({ empty: am.magEmpty, kick: am.kick }, G.t);
    H.reloadMarker(6, R.RH * 0.42, 'l', st, 1); H.reloadMarker(R.RW - 6, R.RH * 0.42, 'r', st, 1);
  }
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
