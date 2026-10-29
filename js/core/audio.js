'use strict';
/* B.L.A.M. core/audio.js -- BLAM.SFX: the sound router. Sounds are synthesized (js/core/sfx-*.js, loaded right after
   this file) except the core events, which play recorded samples (see SAMPLES below). The engine emits every sound
   event through BLAM.SFX.play(name, opts).
   opts may carry: { u, v } (screen pos 0..1, for stereo pan), { by } (versus player 0/1), { n } (count),
   { pts } (score), { step } (range distance step, 0 = far), { tier }.

   Events emitted (name : when):
     shot        : the gun fires (any screen)
     hit         : a target is hit (opts.pts, opts.step)
     miss        : a shot hits nothing shootable during a stage
     reload      : an automatic magazine reload starts (opts.time = seconds)
     reloadDone  : the reload finished
     empty       : trigger pulled with no ammo (hard cap spent, or while reloading)
     bomb        : a bomb target was shot (life -1)
     bystander   : a bystander was shot (life -1)  [hook for later stages]
     lifeLost    : a heart was lost (stage failed, bomb, bystander)
     stageStart  : the countdown finished, targets start
     stageClear  : results: quota met
     stageFail   : results: quota missed
     quota       : the quota was just reached mid-stage
     tick        : last 5 seconds, once per second (opts.n = seconds left)
     countdown   : 3-2-1 beeps (opts.n), then 'go'
     go          : "BLAM!" at the start of a stage
     menuShoot   : a menu sign was shot
     menuHover   : the mouse moved onto a menu sign
     duckHit     : Deputy Duck was shot
     duckHappy / duckAngry : his reactions
     targetIn    : a target swings in (opts.u)
     targetStep  : a range paddle scoots forward
     gameOver, continue, courseClear, newRecord
     vsJoin, vsLeave, vsWin, vsLose, vsTaken (the other player took a target first)
     skin        : gun skin changed (key 4 / settings)
     ricochet    : the title marquee board was shot (spark burst + bulb flicker; opts.u)
   ALLEY (stage 2):
     bystanderIn : a bystander steps out (opts.u, opts.who = 'cook' | 'kid' | 'lady'); crooks send targetIn
     pigeon      : a pigeon takes off (opts.u)
   BONEYARD (stage 3):
     skullThrow  : a skeleton throws its skull at the camera (opts.u)
     skullBonk   : a thrown skull nobody shot bonks the screen (with a small camera shake)
     boneRattle  : a skeleton rattles as it climbs out of the heap (opts.u)
     bombFlip    : a bomb skull's candle went out and it flipped into a shootable skull (opts.u)
     batFlap     : a bat flies across (opts.u = 0 from the left, 1 from the right)
     rocketLaunch: SKY SHOW rocket leaves a barge (opts.u, opts.bomb)
     rocketBurst : a firework bursts (opts.u, opts.type peony|ring|willow|crackle|letter, opts.height)
     rocketFizzle: a rocket fizzles out unshot (opts.u)
     chain       : a chain burst (opts.n link number, opts.u)
     finale      : the B.L.A.M. finale launches
   Internal (the router plays these itself): duckScared, duckRelief, duckHeckle, duckCheer, duckSad (Deputy Duck's
   pose changes, watched on BLAM.G.duck.pose), the title-menu chiptune and a quiet ambience bed per stage.

   SAMPLES: js/core/sfx-samples.js loads assets/sfx/manifest.json + wavs (decoded on the first unlock) and registers
   itself via registerSampler(). The ROUTE table below sends these events to sample sets; any set that is absent or
   not decoded yet falls back to the synth recipe. The files are pre-balanced against each other, so the per-event MIX
   trims do not apply to them; one SAMPLE_GAIN sets the whole sample layer against the synth events.
     shot      -> shot.<skin> (skin = hotrod | aquapro | ray85 | candysix from the gun), +-3 % pitch; cuts a playing reload
     reload    -> reload.<skin> (reloadDone is then silent)
     hit       -> hitBreak (+-3 %) + hitDing 12 ms later, +1 semitone per consecutive hit (cap +7; reset on miss / stageStart)
     miss      -> synth miss + a ricochet sample at a random pan in [-0.8, 0.8]; ricochet (title marquee) -> the sample
     bomb      -> bomb (synth off), straight to the master bus while the sfx bus ducks ~4 dB for 0.3 s
     duck*     -> the set of the same name (+-5 %); one duck line at a time (a new one cuts the last, 30 ms fade)
   Voice limits for samples: 4 shots, 4 hits, 1 reload, 2 bombs, 1 duck. render() is offline and synth-only (no samples).

   API (all calls are safe before the first click: they no-op until the AudioContext exists):
     play(name, opts)          setVolume(0..1) / volume      setMusicVolume(0..1) / musicVolume
     muted (get/set), toggleMute()  (key M also toggles)     music(on)   duck(pose)   ready (bool)
     render(name, opts, secs) -> Promise<AudioBuffer> (offline, through the same mixer)   measure(buffer)
     samples (debug: { ready, sets, missing }, from sfx-samples.js)   registerSampler(s)   _mix (the live mixer)
   Settings live in BLAM.Save.settings: sfxVolume (0.35), musicVolume (0.35), muted (false), music (true).
*/
window.BLAM = window.BLAM || {};
(function (B) {
const EVENTS = ['shot', 'hit', 'miss', 'reload', 'reloadDone', 'empty', 'bomb', 'bystander', 'lifeLost', 'stageStart',
  'stageClear', 'stageFail', 'quota', 'tick', 'countdown', 'go', 'menuShoot', 'menuHover', 'duckHit', 'duckHappy', 'duckAngry',
  'targetIn', 'targetStep', 'gameOver', 'continue', 'courseClear', 'newRecord', 'vsJoin', 'vsLeave', 'vsWin', 'vsLose', 'vsTaken', 'skin',
  'ricochet', 'bystanderIn', 'pigeon', 'skullThrow', 'skullBonk', 'boneRattle', 'bombFlip', 'batFlap',
  'rocketLaunch', 'rocketBurst', 'rocketFizzle', 'chain', 'finale', 'bombReveal'];
const AC = window.AudioContext || window.webkitAudioContext;
const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
const kit = () => B.SFXKit || null;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const log = [];
const setting = (k, d) => { try { const s = B.Save && B.Save.settings; return s && s[k] != null ? s[k] : d; } catch (e) { return d; } };
const store = (k, v) => { try { if (B.Save) B.Save.set(k, v); } catch (e) {} };

// ---------- mixer: sfx / music / ambience buses -> master (volume) -> glue compressor -> limiter -> soft clip ----------
// per-event loudness trims, fitted with SFX.render so each event lands on its target short-term loudness (fitted at
// volume 0.5; the 0.35 default sits ~3 dB under that) (see review/phase4/sound/report.md): the one place to rebalance the mix
const MIX = {
  shot: 1.58, hit: 2.51, miss: 1.76, reload: 1.76, reloadDone: 3.16, empty: 3.05, bomb: 1, bystander: 1,
  lifeLost: 2.14, stageStart: 1.07, stageClear: 1.95, stageFail: 2.54, quota: 2.88, tick: 3.16, countdown: 1.84,
  go: 2.48, menuShoot: 2.48, menuHover: 3.43, duckHit: 2.85, duckHappy: 2.95, duckAngry: 1.35, targetIn: 3.76,
  targetStep: 5.82, gameOver: 1.91, continue: 4.03, courseClear: 2.14, newRecord: 7.76, vsJoin: 5.69, vsLeave: 5.69,
  vsWin: 2.26, vsLose: 2.16, vsTaken: 1.6, skin: 2.21, ricochet: 3.89, bystanderIn: 4.22, pigeon: 1.14,
  skullThrow: 4.37, skullBonk: 1.45, boneRattle: 7.08, bombFlip: 4.84, batFlap: 8, rocketLaunch: 1.66,
  rocketBurst: 1.4, rocketFizzle: 4.37, chain: 2.69, finale: 1, duckHeckle: 2.11, duckScared: 1.48, duckRelief: 4.95,
  duckCheer: 2.88, duckSad: 1.53
};
const DEF_VOL = 0.35, DEF_MUSIC = 0.35;   // defaults for Save.settings.sfxVolume / musicVolume (owner: ~0.35, lots of headroom)
const VOL_SCALE = 0.6;          // master gain = volume * VOL_SCALE (default 0.35 -> 0.21: single events stay under the limiter)
const MAX_VOICES = 32;          // all events together; low-priority events drop first when busy
const MENU_SCREENS = { title: 1, settings: 1, tiers: 1, free: 1, scores: 1, lobby: 1 };
function softClip() {             // identity below 0.6, then a smooth knee toward 0.95: the output can never reach full scale
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a <= 0.6 ? a : 0.6 + 0.35 * Math.tanh((a - 0.6) / 0.35)); }
  return c;
}
function buildMixer(c) {
  const K = kit(), m = {}, g = v => { const n = c.createGain(); n.gain.value = v; return n; };
  m.sfx = g(1); m.music = g(0); m.amb = g(1); m.master = g(0); m.verbIn = g(1);   // silent until applyVolume()
  m.comp = c.createDynamicsCompressor();          // gentle glue: only the dense moments (bomb + hit + shot) get touched
  m.comp.threshold.value = -16; m.comp.knee.value = 10; m.comp.ratio.value = 3; m.comp.attack.value = 0.004; m.comp.release.value = 0.2;
  m.lim = c.createDynamicsCompressor();           // brick-wall-ish limiter
  m.lim.threshold.value = -6; m.lim.knee.value = 0; m.lim.ratio.value = 20; m.lim.attack.value = 0.001; m.lim.release.value = 0.09;
  m.trim = g(0.8);                                // takes back the compressors' automatic make-up gain
  m.clip = c.createWaveShaper(); m.clip.curve = softClip();
  m.sfx.connect(m.master); m.music.connect(m.master); m.amb.connect(m.master);
  if (K) { m.verb = c.createConvolver(); m.verb.buffer = K.impulse(c, 1.3, 3.4); m.verbOut = g(0.55); m.verbIn.connect(m.verb).connect(m.verbOut).connect(m.master); }
  m.master.connect(m.comp).connect(m.lim).connect(m.trim).connect(m.clip).connect(c.destination);
  return m;
}
let ctx = null, M = null, unlocked = false, autoSuspended = false;
const state = {};               // per event: { last (variant), lastT, flam }
let active = [];                // live voices { name, g, end, pri }
function applyVolume() {
  if (!M) return;
  const now = ctx.currentTime, mute = SFX.muted ? 0 : 1;
  M.master.gain.setTargetAtTime(SFX.volume * VOL_SCALE * mute, now, 0.03);
  M.music.gain.setTargetAtTime(SFX.musicVolume * 0.9, now, 0.05);
}

// ---------- SAMPLES: recorded files for the core events (loaded by sfx-samples.js) ----------
const SAMPLE_GAIN = 0.9;        // the whole sample layer against the synth events (match by ear)
const SKIN_KEYS = ['hotrod', 'aquapro', 'ray85', 'candysix'];
const SKIN_IDS = { justifier: 'hotrod', guncon: 'aquapro', zapper: 'ray85', revolver: 'candysix' };   // guns.js SKINS ids
const DUCK_SETS = ['duckScared', 'duckRelief', 'duckHeckle', 'duckCheer', 'duckSad', 'duckHappy', 'duckAngry', 'duckHit'];
const SAMPLE_SETS = [].concat(SKIN_KEYS.map(k => 'shot.' + k), SKIN_KEYS.map(k => 'reload.' + k), ['hitBreak', 'hitDing', 'ricochet', 'bomb'], DUCK_SETS);
const SAMPLE_MAX = { shot: 4, hit: 4, ding: 4, reload: 1, bomb: 2, duck: 1, ricochet: 3 };
const DEF0 = { max: 3, gap: 0.02, flamMax: 2, gain: 1, pv: 0, dv: 0, verb: 0, pan: 1, pri: 3, v: [] };   // a routed event with no recipe
let sampler = null, hitStreak = 0, dingStep = 0;
const live = {};                // group -> sample handles (newest last)
const jit = p => 1 + (Math.random() * 2 - 1) * p;
const randPan = () => (Math.random() * 2 - 1) * 0.8;
const panOf = (o, def) => { const u = o.u != null && isFinite(o.u) ? o.u : 0.5; return clamp((u - 0.5) * 1.5 * (def.pan != null ? def.pan : 1), -0.85, 0.85); };
// the current gun skin: the gun's own id, else main.js's index, else the saved setting
function skinKey() {
  try { const g = B.G && B.G.gun, k = g && SKIN_IDS[g.skinId]; if (k) return k; } catch (e) {}
  const i = (B.G && B.G.skin != null ? B.G.skin : setting('skin', 0)) | 0;
  return SKIN_KEYS[((i % 4) + 4) % 4];
}
const hasSet = set => !!(sampler && sampler.has(set));
function sample(group, set, name, pri, o) {
  if (!hasSet(set)) return null;
  const now = ctx.currentTime, L = live[group] = (live[group] || []).filter(h => h.end > now);
  for (let i = 0; i <= L.length - SAMPLE_MAX[group]; i++) L[i].stop(group === 'duck' ? 0.03 : 0.015);   // newest wins
  const h = sampler.play(set, { gain: SAMPLE_GAIN * (o.gain != null ? o.gain : 1), pan: o.pan, rate: o.rate, delay: o.delay, out: o.out });
  if (!h) return null;
  h.name = name; h.pri = pri; L.push(h); active.push(h);   // counted in status / MAX_VOICES like a synth voice
  return h;
}
function stopGroup(group, fade) { (live[group] || []).forEach(h => h.stop(fade)); }
// event -> samples; f = flam gain (1 for a lone event), d = flam delay. Returns true when the synth recipe is replaced.
const ROUTE = {
  shot(o, def, f, d) {
    stopGroup('reload', 0.015);
    return !!sample('shot', 'shot.' + skinKey(), 'shot', def.pri, { gain: f, delay: d, pan: panOf(o, def), rate: jit(0.03) });
  },
  reload(o, def, f, d) { return !!sample('reload', 'reload.' + skinKey(), 'reload', def.pri, { gain: f, delay: d, pan: panOf(o, def) }); },
  reloadDone() { return hasSet('reload.' + skinKey()); },          // muted: the reload sample already has the clack
  hit(o, def, f, d) {
    const p = panOf(o, def);
    if (!sample('hit', 'hitBreak', 'hit', def.pri, { gain: f, delay: d, pan: p, rate: jit(0.03) })) return false;
    sample('ding', 'hitDing', 'hitDing', def.pri, { gain: f, delay: d + 0.012, pan: p, rate: Math.pow(2, dingStep / 12) });
    return true;
  },
  miss(o, def, f, d) { sample('ricochet', 'ricochet', 'ricochet', def.pri, { gain: f, delay: d, pan: randPan() }); return false; },
  ricochet(o, def, f, d) { return !!sample('ricochet', 'ricochet', 'ricochet', def.pri, { gain: f, delay: d, pan: randPan() }); },
  bomb(o, def, f, d) {
    const h = sample('bomb', 'bomb', 'bomb', def.pri, { gain: f, delay: d, pan: panOf(o, def), out: M.master });
    if (!h) return false;
    try {                         // duck the rest of the sfx bus ~4 dB for 0.3 s so the explosion reads
      const g = M.sfx.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
      g.setTargetAtTime(0.63, now, 0.012); g.setTargetAtTime(1, now + 0.3, 0.08);
    } catch (e) {}
    return true;
  }
};
DUCK_SETS.forEach(n => {
  ROUTE[n] = (o, def, f, d) => {
    if (!hasSet(n)) return false;
    const now = ctx.currentTime;  // one duck line at a time: cut any synth duck line too
    active.forEach(x => { if (!x.stop && x.end > now && /^duck/.test(x.name)) steal(x, now); });
    return !!sample('duck', n, n, def.pri, { gain: f, delay: d, pan: panOf(o, def), rate: jit(0.05) });
  };
});

// ---------- one voice ----------
function voice(name, o, c, mix, offline, pre = 0) {
  const K = kit(), route = !offline && ROUTE[name], def = (K && K.lib[name]) || (route ? DEF0 : null);
  if (!def || !c || !mix) return null;
  const now = c.currentTime, s = state[name] || (state[name] = { last: -1, lastT: -99, flam: 0, n: 0 });
  if (!offline) {
    if (def.cool && now - s.lastT < def.cool) return null;
    if (def.chance && Math.random() > def.chance(o)) return null;
    active = active.filter(x => x.end > now);
    if (active.length >= MAX_VOICES && def.pri < 2) return null;
    if (active.length >= MAX_VOICES + 12 && def.pri < 4) return null;   // hard ceiling: only the big moments get through
  }
  let g = def.gain * (MIX[name] != null ? MIX[name] : 1), delay = (def.delay ? def.delay(o, SFX.since) : 0) + pre;
  if (!offline && now - s.lastT < def.gap) {                // a flam: several in the same instant -> one strong + a few softer
    if (++s.flam > def.flamMax) return null;
    g *= Math.pow(0.6, s.flam); delay += 0.011 * s.flam;
  } else s.flam = 0;
  if (route) {                                              // samples first; the recipe is the fallback
    if (route(o, def, Math.pow(0.6, s.flam), 0.011 * s.flam)) { s.lastT = now; s.n++; return 1; }
    if (!def.v.length) return null;
  }
  if (!offline) {
    const mine = active.filter(x => x.name === name);       // voice limit per event: the newest wins
    for (let i = 0; i <= mine.length - def.max; i++) steal(mine[i], now);
  }
  s.lastT = now; s.n++;
  const vg = c.createGain(); vg.gain.value = g;
  let out = vg, pan = null;
  if (c.createStereoPanner) {
    pan = c.createStereoPanner();
    const u = o.u != null && isFinite(o.u) ? o.u : 0.5;
    pan.pan.value = clamp((u - 0.5) * 1.5 * def.pan, -0.85, 0.85);
    vg.connect(pan); out = pan;
  }
  out.connect(mix.sfx);
  if (def.verb > 0 && mix.verbIn) { const sg = c.createGain(); sg.gain.value = def.verb; out.connect(sg).connect(mix.verbIn); }
  // variant: round robin, never the same one twice in a row
  const nv = def.v.length;
  let i = 0;
  if (nv > 1) {
    const r = Math.random;
    const v0 = { o, stage: curStage(), r: (a, b) => a + r() * (b - a) };
    if (def.pick) i = def.pick(v0, nv, s.last) | 0;          // a custom picker avoids repeats itself (stage pools)
    else { i = Math.floor(r() * nv); if (i === s.last) i = (i + 1 + Math.floor(r() * (nv - 1))) % nv; }
  }
  s.last = i;
  const R = Math.random, v = {
    ctx: c, out: vg, pan, t: now + 0.004 + delay, o, i, stage: curStage(), n: s.n,
    p: Math.pow(2, (R() * 2 - 1) * def.pv / 12), d: 1 + (R() * 2 - 1) * def.dv,
    r: (a, b) => a + R() * (b - a), pick: arr => arr[Math.floor(R() * arr.length)], chance: p => R() < p
  };
  const len = (+def.v[i](v) || 1) + delay + 0.05;
  if (!offline) {
    const rec = { name, g: vg, end: now + len, pri: def.pri };
    active.push(rec);
    setTimeout(() => { try { vg.disconnect(); if (pan) pan.disconnect(); } catch (e) {} }, (len + 0.5) * 1000);
  }
  return len;
}
function steal(rec, now) {
  try { rec.g.gain.cancelScheduledValues(now); rec.g.gain.setTargetAtTime(0, now, 0.012); } catch (e) {}
  rec.end = now;                // drop it from the counts
}
function curStage() { try { return (B.G && B.G.run && B.G.run.stage) || ''; } catch (e) { return ''; } }

// ---------- the public object ----------
const SFX = {
  EVENTS, log, debug: false, mix: MIX, SAMPLE_SETS, SAMPLE_GAIN,
  get ready() { return !!(ctx && unlocked); },
  get ctx() { return ctx; },
  get _mix() { return M; },
  // sfx-samples.js hands over { has(set), play(set, opts) -> handle, unlock(ctx) }
  registerSampler(s) { sampler = s || null; if (sampler && ctx && sampler.unlock) sampler.unlock(ctx); },
  // debugging: what is running right now
  get status() { const now = ctx ? ctx.currentTime : 0; return { state: ctx ? ctx.state : 'none', voices: active.filter(x => x.end > now).length, music: !!music, bed: bedId, duckAuto }; },
  get volume() { return clamp(+setting('sfxVolume', DEF_VOL) || 0, 0, 1); },
  get musicVolume() { return clamp(+setting('musicVolume', DEF_MUSIC) || 0, 0, 1); },
  get muted() { return !!setting('muted', false); },
  set muted(on) { store('muted', !!on); applyVolume(); },
  setVolume(x) { store('sfxVolume', clamp(+x || 0, 0, 1)); applyVolume(); },
  setMusicVolume(x) { store('musicVolume', clamp(+x || 0, 0, 1)); applyVolume(); },
  toggleMute() { SFX.muted = !SFX.muted; return SFX.muted; },
  music(on) { store('music', !!on); },
  // seconds since an event last played (99 if never)
  since(name) { const s = state[name]; return ctx && s ? ctx.currentTime - s.lastT : 99; },
  play(name, opts) {
    log.push([Math.round(performance.now()), name, opts || null]); if (log.length > 40) log.shift();
    try {
      hooks(name, opts || {});
      if (!ctx || !unlocked || SFX.muted) return;
      voice(name, opts || {}, ctx, M, false);
    } catch (e) { if (SFX.debug) console.warn('SFX', name, e); }
  },
  // Deputy Duck's voice: 'scared' | 'relief' | 'present' (heckle) | 'cheer' | 'sad' | 'happy' | 'angry' | 'hit'.
  // Calling it from outside turns off the built-in pose watcher (so nothing plays twice).
  duck(pose, auto) {
    if (!auto) duckAuto = false;
    const n = DUCK_POSES[pose]; if (n) SFX.play(n);
  },
  // offline render through a fresh copy of the mixer at the current volume (for tests / the sound report)
  render(name, opts, secs = 2, sr = 44100, pre = 0) {
    if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
    const oc = new OAC(2, Math.ceil(secs * sr), sr), mix = buildMixer(oc);
    mix.master.gain.value = SFX.volume * VOL_SCALE; mix.music.gain.value = SFX.musicVolume * 0.9;
    if (name === '@music' || name.indexOf('@bed:') === 0) {
      const K = kit(), bed = name === '@music' ? K.music.start(oc, mix.music) : K.beds[name.slice(5)](oc, mix.amb);
      for (let t = 0; t < secs; t += 0.1) bed.tick(t + 0.25);   // schedule everything up front
    } else voice(name, opts || {}, oc, mix, true, pre);
    return oc.startRendering();
  },
  // { peak, rms (loudest 50 ms window), dur (s until the last sample above -50 dBFS), clip (samples >= 0.999) }
  measure(buf) {
    const L = buf.getChannelData(0), Rr = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, sr = buf.sampleRate, W = Math.round(sr * 0.05);
    let peak = 0, last = 0, clip = 0, best = 0, acc = 0;
    for (let i = 0; i < L.length; i++) {
      const a = Math.max(Math.abs(L[i]), Math.abs(Rr[i])); if (a > peak) peak = a; if (a > 0.00316) last = i; if (a >= 0.999) clip++;
      acc += (L[i] * L[i] + Rr[i] * Rr[i]) / 2; if (i >= W) { const j = i - W; acc -= (L[j] * L[j] + Rr[j] * Rr[j]) / 2; }
      if (acc > best) best = acc;
    }
    return { peak, rms: Math.sqrt(Math.max(0, best) / W), dur: last / sr, clip };
  }
};
B.SFX = SFX;

// ---------- event hooks: ambience beds follow the stage ----------
let bed = null, bedId = '', music = null, duckAuto = true, lastPose = '';
const DUCK_POSES = { scared: 'duckScared', relief: 'duckRelief', present: 'duckHeckle', cheer: 'duckCheer', sad: 'duckSad',
  happy: 'duckHappy', angry: 'duckAngry', hit: 'duckHit', shot: 'duckHit' };
const DUCK_WATCH = { scared: 1, relief: 1, present: 1, cheer: 1, sad: 1 };   // happy / angry / shot already arrive as events
function hooks(name) {
  if (name === 'hit') { dingStep = Math.min(hitStreak, 7); hitStreak++; }   // the ding's streak pitch (samples)
  else if (name === 'miss' || name === 'stageStart') hitStreak = 0;
  if (name === 'stageStart') startBed(curStage());
  else if (name === 'stageClear' || name === 'stageFail' || name === 'gameOver' || name === 'vsWin' || name === 'vsLose') stopBed(1.5);
}
function startBed(id) {
  const K = kit();
  if (!ctx || !unlocked || !K || !K.beds || !K.beds[id]) return;
  if (bed && bedId === id) return;
  stopBed(0.6);
  try { bed = K.beds[id](ctx, M.amb); bedId = id; } catch (e) { bed = null; bedId = ''; if (SFX.debug) console.warn('bed', e); }
}
function stopBed(fade) { if (bed) { try { bed.stop(fade); } catch (e) {} } bed = null; bedId = ''; }
function startMusic() { const K = kit(); if (!music && K && K.music) { try { music = K.music.start(ctx, M.music); } catch (e) { music = null; } } }
function stopMusic() { if (music) { try { music.stop(0.5); } catch (e) {} } music = null; }

// ---------- watcher: music on the menus, the stage bed during play, Deputy Duck's pose changes ----------
function watch() {
  if (!ctx || !unlocked || ctx.state !== 'running') return;
  try {
    const G = B.G, scr = (G && G.screenName) || '', now = ctx.currentTime;
    if (setting('music', true) && !SFX.muted && SFX.musicVolume > 0 && MENU_SCREENS[scr]) startMusic(); else stopMusic();
    if (music) music.tick(now + 0.3);
    const run = G && G.run;
    if (scr === 'play' && run && run.state === 'play') { if (bedId !== run.stage) startBed(run.stage); }
    else if (bed && scr !== 'play') stopBed(1.5);
    if (bed) bed.tick(now + 0.3);
    const d = G && G.duck, pose = d && d.pose;
    if (pose && pose !== lastPose) {
      const vis = !d.group || d.group.visible !== false;
      if (duckAuto && vis && lastPose && DUCK_WATCH[pose]) SFX.duck(pose, true);
      lastPose = pose;
    }
  } catch (e) { if (SFX.debug) console.warn('SFX watch', e); }
}
setInterval(watch, 60);

// ---------- autoplay: the context is created / resumed on the first real gesture; capture phase so the click's own shot sounds ----------
function unlock() {
  if (!AC) return;
  try {
    if (!ctx || ctx.state === 'closed') { ctx = new AC({ latencyHint: 'interactive' }); M = buildMixer(ctx); active = []; music = null; bed = null; bedId = ''; applyVolume(); }
    if (ctx.state !== 'running' && !document.hidden) { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    unlocked = true;
    if (sampler && sampler.unlock) sampler.unlock(ctx);    // decodes the sample files once
  } catch (e) { if (SFX.debug) console.warn('SFX unlock', e); }
}
['pointerdown', 'mousedown', 'touchstart', 'touchend', 'keydown', 'click'].forEach(ev =>
  window.addEventListener(ev, unlock, { capture: true, passive: true }));
// a hidden tab goes quiet (and its scheduler would stall anyway); it comes back on return
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  try {
    if (document.hidden && ctx.state === 'running') { autoSuspended = true; ctx.suspend().catch(() => {}); }
    else if (!document.hidden && autoSuspended) { autoSuspended = false; ctx.resume().catch(() => {}); }
  } catch (e) {}
});
// key M: mute / unmute (M is free in main.js's key map)
try {
  if (B.Input && B.Input.onKey) B.Input.onKey(k => {
    if (k !== 'm' && k !== 'M') return;
    const m = SFX.toggleMute();
    try { if (B.G && B.G.toast) B.G.toast(m ? 'SOUND OFF (M)' : 'SOUND ON (M)', 1.0); } catch (e) {}
  });
} catch (e) {}
})(window.BLAM);
