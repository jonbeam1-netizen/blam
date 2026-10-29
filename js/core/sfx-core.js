'use strict';
/* B.L.A.M. core/sfx-core.js -- the core gameplay sounds: gun, hits, misses, reload, bombs, countdown, menus.
   Recipes only; primitives are in sfx-kit.js, routing / variance / voice limits in audio.js. Levels are tuned
   so every event sits at a similar loudness through the mixer (see review/phase4/sound/report.md). */
window.BLAM = window.BLAM || {};
(function (B) {
const K = B.SFXKit; if (!K) return;
const def = K.def, tone = K.tone, noise = K.noise, st = K.st;
// stage pools: map { stage: [variant indices], def: [...] } -> a picker that never repeats the last one when it can
K.pool = map => (v, n, last) => {
  const P = map[v.stage] || map.def, c = P.filter(i => i !== last && i < n), from = c.length ? c : P;
  return from[Math.floor(Math.random() * from.length)];
};
const skinP = () => { const s = (B.G && B.G.skin) | 0; return [1, 0.93, 1.08, 0.88, 1.04, 0.97][((s % 6) + 6) % 6]; };

// ---------- shot: noise crack + low thump + tiny click (4 recipes; the gun skin nudges the pitch) ----------
def('shot', { max: 4, gap: 0.03, pv: 0.9, dv: 0.15, verb: 0.07, pri: 3, gain: 0.95 },
  v => {                                   // pistol: bright crack, round body
    v.p *= skinP();
    noise(v, { ft: 'lowpass', ff: 9000, ff2: 1800, fft: 0.06, hp: 500, d: 0.07, g: 0.5, drive: 2 });
    tone(v, { f: 165, f2: 48, ft: 0.07, d: 0.12, g: 0.75 });
    tone(v, { type: 'square', f: 2600, a: 0.0003, d: 0.008, g: 0.1 });
    noise(v, { kind: 'pink', ft: 'bandpass', ff: 900, q: 0.8, at: 0.01, d: 0.12, g: 0.1 });
    return 0.2;
  },
  v => {                                   // snap: mid crack, tight
    v.p *= skinP();
    noise(v, { ft: 'bandpass', ff: 2300 * v.p, q: 0.9, d: 0.05, g: 0.75, drive: 1.5 });
    tone(v, { type: 'triangle', f: 135, f2: 42, ft: 0.06, d: 0.1, g: 0.8 });
    noise(v, { hp: 5000, d: 0.012, g: 0.28 });
    return 0.16;
  },
  v => {                                   // boom: darker, more chest
    v.p *= skinP();
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 2600, ff2: 600, fft: 0.1, d: 0.11, g: 0.9 });
    noise(v, { hp: 1500, d: 0.03, g: 0.35 });
    tone(v, { f: 98, f2: 38, ft: 0.09, d: 0.16, g: 0.8 });
    tone(v, { type: 'square', f: 1800, a: 0.0003, d: 0.006, g: 0.09 });
    return 0.24;
  },
  v => {                                   // slap: sharp top + a hint of slide ring
    v.p *= skinP();
    noise(v, { hp: 1200, ft: 'lowpass', ff: 7000, ff2: 2500, fft: 0.04, d: 0.045, g: 0.55, drive: 2 });
    tone(v, { f: 200, f2: 60, ft: 0.06, d: 0.09, g: 0.7 });
    K.fm(v, { f: 2400, ratio: 1.41, index: 1.5, at: 0.012, d: 0.06, g: 0.035 });
    return 0.16;
  });

// ---------- hit: a bright ding / crack with a short tail (3 recipes; far paddles ring a little higher) ----------
const hitPitch = v => { const s = v.o.step; if (s != null && isFinite(s)) v.p *= st(-Math.min(4, s) * 1.2); };
const sparkle = v => { if ((v.o.pts | 0) >= 400) K.pings(v, { n: 3, at: 0.05, span: 0.16, f: [3500, 6000], gmax: 0.05 }); };
def('hit', { max: 4, gap: 0.02, pv: 0.5, dv: 0.12, verb: 0.16, pri: 3, gain: 0.85 },
  v => {                                   // ding
    hitPitch(v);
    noise(v, { hp: 3500, d: 0.02, g: 0.35 });
    K.bell(v, { f: 1568, d: 0.34, g: 0.34, ratios: [1, 2.76, 5.4], amps: [1, 0.4, 0.15] });
    tone(v, { f: 430, f2: 220, ft: 0.04, d: 0.05, g: 0.3 });
    sparkle(v); return 0.38;
  },
  v => {                                   // plate tink
    hitPitch(v);
    K.fm(v, { f: 1320, ratio: 3.5, index: 3, id: 0.03, d: 0.28, g: 0.28 });
    noise(v, { ft: 'bandpass', ff: 4500, q: 1.2, d: 0.025, g: 0.45 });
    tone(v, { type: 'square', f: 1760, f2: 2637, ft: 0.04, d: 0.06, g: 0.05, lp: 5000 });
    sparkle(v); return 0.32;
  },
  v => {                                   // coin crack: two-step blip over a crack
    hitPitch(v);
    noise(v, { hp: 2500, d: 0.03, g: 0.4 });
    tone(v, { wave: K.pulse(v.ctx, 0.25), f: 1318, d: 0.045, hold: 0.015, g: 0.11, lp: 6000 });
    tone(v, { wave: K.pulse(v.ctx, 0.25), f: 1976, at: 0.045, d: 0.09, hold: 0.02, g: 0.11, lp: 6000 });
    K.bell(v, { f: 2093, at: 0.045, d: 0.22, g: 0.13, ratios: [1, 2.76], amps: [1, 0.3] });
    sparkle(v); return 0.32;
  });

// ---------- miss: a dull thunk in whatever the stage is made of (+ the odd ricochet zing) ----------
const zing = (v, at, f = 3200) => {
  tone(v, { f, f2: f * 0.42, ft: 0.24, at, a: 0.004, d: 0.26, g: 0.065, vib: [38, 0.012] });
  if (v.pan) { const t = v.t + at, p = v.pan.pan; p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(Math.max(-0.8, Math.min(0.8, p.value + v.r(-0.6, 0.6))), t + 0.25); }
};
def('miss', { max: 3, gap: 0.03, pv: 1.2, dv: 0.15, verb: 0.12, pri: 2, gain: 0.85,
  pick: K.pool({ range: [0, 1, 5], alley: [2, 2, 5], boneyard: [3, 3, 5], skyshow: [4, 4], def: [0, 1, 5] }) },
  v => {                                   // 0 wood backstop
    tone(v, { f: 190, f2: 80, ft: 0.06, d: 0.07, g: 0.6 });
    noise(v, { ft: 'lowpass', ff: 750, d: 0.05, g: 0.4 });
    K.grains(v, { n: 3, span: 0.07, f: [1500, 3000], g: [0.04, 0.08] });
    return 0.15;
  },
  v => {                                   // 1 wood, hollow knock
    tone(v, { type: 'triangle', f: 240, f2: 120, ft: 0.05, d: 0.06, g: 0.55 });
    noise(v, { ft: 'bandpass', ff: 600, q: 1.5, d: 0.06, g: 0.45 });
    return 0.12;
  },
  v => {                                   // 2 brick: grit + chips
    noise(v, { ft: 'bandpass', ff: 1100, q: 1.2, d: 0.06, g: 0.55 });
    tone(v, { f: 150, f2: 70, ft: 0.05, d: 0.06, g: 0.45 });
    K.grains(v, { n: 5, span: 0.15, curve: 2, f: [2500, 6000], g: [0.04, 0.1] });
    return 0.2;
  },
  v => {                                   // 3 dirt: soft thud + pebbles
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 900, d: 0.12, g: 0.75 });
    tone(v, { f: 110, f2: 50, ft: 0.08, d: 0.09, g: 0.5 });
    K.grains(v, { n: 4, span: 0.2, at: 0.03, curve: 1.5, f: [800, 2000], g: [0.04, 0.09] });
    return 0.25;
  },
  v => {                                   // 4 sky over the water: a far plop
    tone(v, { f: 380, f2: 950, ft: 0.05, d: 0.06, g: 0.22 });
    noise(v, { hp: 2000, ft: 'lowpass', ff: 6000, at: 0.02, d: 0.06, g: 0.12 });
    noise(v, { kind: 'pink', ft: 'lowpass', ff: 500, d: 0.05, g: 0.22 });
    return 0.14;
  },
  v => {                                   // 5 thunk + ricochet zing
    tone(v, { f: 170, f2: 75, ft: 0.06, d: 0.06, g: 0.5 });
    noise(v, { ft: 'bandpass', ff: 1400, q: 1, d: 0.03, g: 0.35 });
    zing(v, 0.015, v.r(2800, 3800));
    return 0.3;
  });

// ---------- reload: a mechanical rack-clack; reloadDone: an arcade "ready" blip after the rack ----------
def('reload', { max: 2, pv: 0.5, dv: 0.1, verb: 0.06, pri: 3, gain: 0.9 },
  v => {                                   // clack ... chk
    noise(v, { ft: 'bandpass', ff: 1600, q: 2.5, d: 0.03, g: 0.55 });
    tone(v, { type: 'square', f: 260, d: 0.012, g: 0.12, lp: 2000 });
    const b = v.r(0.08, 0.1);
    noise(v, { ft: 'bandpass', ff: 3200, q: 3, at: b, d: 0.025, g: 0.5 });
    tone(v, { f: 140, f2: 70, ft: 0.03, at: b, d: 0.04, g: 0.4 });
    K.fm(v, { f: 2800, ratio: 1.33, index: 1.2, at: b, d: 0.06, g: 0.035 });
    return 0.2;
  },
  v => {                                   // slide scrape back, snap forward
    noise(v, { ft: 'bandpass', ff: 2600, ff2: 1200, q: 2, a: 0.01, hold: 0.025, d: 0.04, g: 0.22 });
    const b = v.r(0.09, 0.11);
    noise(v, { hp: 2000, at: b, d: 0.02, g: 0.5 });
    tone(v, { f: 180, f2: 60, ft: 0.04, at: b, d: 0.05, g: 0.45 });
    tone(v, { type: 'square', f: 900, at: b, d: 0.006, g: 0.06 });
    return 0.2;
  });
def('reloadDone', { max: 1, pv: 0.3, dv: 0.08, verb: 0.1, pri: 2, delay: () => (B.Ammo && B.Ammo.RACK || 0.12) + 0.06 },
  v => {
    tone(v, { wave: K.pulse(v.ctx, 0.25), f: 1568, hold: 0.02, d: 0.03, g: 0.07, lp: 6000 });
    tone(v, { wave: K.pulse(v.ctx, 0.25), f: 2093, at: 0.045, hold: 0.02, d: 0.06, g: 0.07, lp: 6000 });
    return 0.15;
  },
  v => {
    tone(v, { type: 'triangle', f: 1760, d: 0.08, g: 0.12 });
    tone(v, { type: 'triangle', f: 2637, at: 0.035, d: 0.1, g: 0.09 });
    return 0.15;
  });
def('empty', { max: 2, gap: 0.06, pv: 0.8, dv: 0.1, verb: 0.02, pri: 2 },
  v => {                                   // dry click
    noise(v, { hp: 3000, d: 0.006, g: 0.4 });
    tone(v, { type: 'square', f: 1100, a: 0.0003, d: 0.005, g: 0.08 });
    tone(v, { f: 300, f2: 200, ft: 0.02, d: 0.02, g: 0.14 });
    return 0.05;
  },
  v => {                                   // tk-tk
    noise(v, { ft: 'bandpass', ff: 3800, q: 2, d: 0.007, g: 0.45 });
    noise(v, { ft: 'bandpass', ff: 2900, q: 2, at: v.r(0.03, 0.045), d: 0.006, g: 0.22 });
    tone(v, { f: 260, f2: 180, ft: 0.02, d: 0.02, g: 0.1 });
    return 0.08;
  });

// ---------- bomb: big low boom + rumble + sizzle (2 recipes) ----------
def('bomb', { max: 2, pv: 0.6, dv: 0.1, verb: 0.22, pri: 4, gain: 0.9 },
  v => {
    noise(v, { hp: 800, d: 0.05, g: 0.6, drive: 3 });
    tone(v, { f: 92, f2: 28, ft: 0.5, d: 0.9, g: 0.85, drive: 2 });
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 1600, ff2: 150, fft: 1.0, a: 0.004, d: 1.1, g: 0.85 });
    noise(v, { kind: 'pink', ft: 'bandpass', ff: 420, q: 0.7, d: 0.35, g: 0.4 });
    noise(v, { ft: 'bandpass', ff: 7000, ff2: 3800, fft: 1.0, q: 0.8, at: 0.06, a: 0.03, d: 0.9, g: 0.07 });
    noise(v, { kind: 'crackle', hp: 2500, at: 0.1, a: 0.05, d: 1.1, g: 0.4 });
    K.grains(v, { n: 8, at: 0.2, span: 0.8, curve: 1.5, f: [1500, 5000], g: [0.03, 0.08], fade: true });
    return 1.5;
  },
  v => {                                   // whump-BOOM: a pop, then the blast
    noise(v, { ft: 'bandpass', ff: 900, q: 1, d: 0.04, g: 0.4 });
    tone(v, { f: 220, f2: 120, ft: 0.04, d: 0.05, g: 0.4 });
    const b = 0.05;
    noise(v, { hp: 600, at: b, d: 0.06, g: 0.6, drive: 3 });
    tone(v, { f: 80, f2: 26, ft: 0.6, at: b, d: 1.0, g: 0.9, drive: 2.5 });
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 1300, ff2: 120, fft: 1.1, at: b, d: 1.2, g: 0.9 });
    noise(v, { kind: 'crackle', hp: 3000, at: b + 0.08, a: 0.08, d: 1.0, g: 0.45 });
    noise(v, { hp: 5500, at: b + 0.05, a: 0.05, d: 0.8, g: 0.05 });
    return 1.5;
  });

// ---------- bystander: a sad "oh no" sting (formant voice over a sour two-square wah) ----------
const OH = [[450, 5, 1], [820, 7, 0.7], [2830, 10, 0.12]], UH = [[620, 5, 1], [1050, 7, 0.5], [2400, 10, 0.15]];
def('bystander', { max: 1, pv: 0.4, dv: 0.08, verb: 0.2, pri: 4, gain: 0.95 },
  v => {                                   // "oh-no"
    K.voice(v, { f: 392, f2: 415, ft: 0.12, a: 0.02, hold: 0.1, d: 0.08, g: 0.45, formants: OH });
    K.voice(v, { f: 330, fs: [[0.2, 262]], at: 0.21, a: 0.02, hold: 0.16, d: 0.25, g: 0.45, vib: [6, 0.02], formants: OH });
    tone(v, { type: 'square', f: 622, d: 0.22, hold: 0.05, g: 0.04, lp: 2200 });
    tone(v, { type: 'square', f: 587, d: 0.22, hold: 0.05, g: 0.04, lp: 2200 });
    return 0.75;
  },
  v => {                                   // "uh-oh"
    K.voice(v, { f: 440, a: 0.015, hold: 0.08, d: 0.06, g: 0.45, formants: UH });
    K.voice(v, { f: 349, fs: [[0.25, 300]], at: 0.17, a: 0.02, hold: 0.15, d: 0.28, g: 0.45, vib: [5.5, 0.025], formants: OH });
    tone(v, { type: 'sawtooth', f: 233, f2: 196, at: 0.17, hold: 0.1, d: 0.25, g: 0.05, lp: 900 });
    return 0.75;
  });

// ---------- lifeLost: a descending two-note loss (waits for the bomb / oh-no to land first) ----------
def('lifeLost', { max: 1, pv: 0.2, dv: 0.06, verb: 0.15, pri: 4, gain: 0.9,
  delay: (o, since) => (since('bomb') < 0.1 ? 0.3 : since('bystander') < 0.1 ? 0.5 : 0) },
  v => {
    const w = K.pulse(v.ctx, 0.25);
    tone(v, { wave: w, f: 494, hold: 0.07, d: 0.06, g: 0.14, lp: 3500 });
    tone(v, { wave: w, f: 330, f2: 300, ft: 0.35, at: 0.15, hold: 0.12, d: 0.28, g: 0.14, lp: 3500 });
    tone(v, { type: 'triangle', f: 165, f2: 150, ft: 0.35, at: 0.15, hold: 0.12, d: 0.28, g: 0.2 });
    return 0.6;
  },
  v => {
    const w = K.pulse(v.ctx, 0.125);
    tone(v, { wave: w, f: 587, hold: 0.07, d: 0.06, g: 0.13, lp: 3500 });
    tone(v, { wave: w, f: 415, f2: 370, ft: 0.4, at: 0.15, hold: 0.12, d: 0.3, g: 0.13, lp: 3500 });
    tone(v, { type: 'triangle', f: 207, f2: 185, ft: 0.4, at: 0.15, hold: 0.12, d: 0.3, g: 0.2 });
    return 0.6;
  });

// ---------- countdown / go / stageStart / tick / quota ----------
def('countdown', { max: 2, pv: 0.05, dv: 0.05, verb: 0.12, pri: 4 },
  v => {
    tone(v, { wave: K.pulse(v.ctx, 0.5), f: 880, hold: 0.07, d: 0.06, g: 0.09, lp: 5000, np: true });
    tone(v, { type: 'triangle', f: 440, hold: 0.07, d: 0.08, g: 0.15, np: true });
    return 0.2;
  });
def('go', { max: 1, pv: 0.05, dv: 0.05, verb: 0.2, pri: 4 },
  v => {                                   // the higher "GO" blip pair + a burst
    const w = K.pulse(v.ctx, 0.25);
    tone(v, { wave: w, f: 1760, hold: 0.05, d: 0.04, g: 0.09, lp: 6000, np: true });
    tone(v, { wave: w, f: 1760, at: 0.09, hold: 0.16, d: 0.25, g: 0.1, lp: 6000, np: true });
    tone(v, { wave: K.pulse(v.ctx, 0.5), f: 1319, at: 0.09, hold: 0.16, d: 0.25, g: 0.05, lp: 5000, np: true });
    tone(v, { type: 'triangle', f: 880, at: 0.09, hold: 0.16, d: 0.25, g: 0.15, np: true });
    noise(v, { hp: 3000, at: 0.09, d: 0.12, g: 0.15 });
    return 0.55;
  });
def('stageStart', { max: 1, pv: 0.3, dv: 0.1, verb: 0.25, pri: 3, gain: 0.8 },
  v => {                                   // the low "BLAM" under the GO + a cymbal wash
    tone(v, { f: 72, f2: 38, ft: 0.35, at: 0.09, d: 0.45, g: 0.6, drive: 1.5 });
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 600, at: 0.09, d: 0.3, g: 0.4 });
    noise(v, { hp: 6000, at: 0.09, a: 0.01, d: 0.6, g: 0.05 });
    return 0.8;
  });
def('tick', { max: 2, pv: 0.05, dv: 0.05, verb: 0.08, pri: 3 },
  v => {                                   // a woodblock beep, rising as time runs out
    const n = Math.max(1, Math.min(9, (v.o.n | 0) || 5)), f = 1000 * st((5 - Math.min(5, n)) * 1.5), last = n === 1;
    tone(v, { type: 'square', f, hold: last ? 0.06 : 0.02, d: 0.05, g: 0.06, lp: 4000, np: true });
    tone(v, { f: f * 2, d: 0.03, g: 0.05, np: true });
    noise(v, { ft: 'bandpass', ff: 2500, q: 3, d: 0.01, g: 0.15 });
    return 0.15;
  });
def('quota', { max: 1, pv: 0.1, dv: 0.05, verb: 0.2, pri: 4 },
  v => {                                   // quota met: quick bright arpeggio + a bell
    const w = K.pulse(v.ctx, 0.25), N = ['C6', 'E6', 'G6', 'C7'];
    N.forEach((n, i) => {
      tone(v, { wave: w, f: K.nf(n), at: i * 0.055, hold: 0.02, d: 0.08, g: 0.07, lp: 7000 });
      tone(v, { type: 'triangle', f: K.nf(n) / 2, at: i * 0.055, hold: 0.02, d: 0.08, g: 0.1 });
    });
    K.bell(v, { f: K.nf('C7'), at: 0.22, d: 0.5, g: 0.12, ratios: [1, 2.76, 5.4], amps: [1, 0.3, 0.1] });
    return 0.8;
  });

// ---------- menus: sign shatter (glass crunch), hover blip, marquee ricochet ----------
def('menuShoot', { max: 2, pv: 0.5, dv: 0.15, verb: 0.2, pri: 4, gain: 0.85 },
  v => {
    noise(v, { hp: 2500, d: 0.03, g: 0.5 });
    tone(v, { f: 220, f2: 90, ft: 0.06, d: 0.08, g: 0.4 });
    noise(v, { ft: 'lowpass', ff: 800, d: 0.05, g: 0.3 });
    K.grains(v, { n: 18, span: 0.22, curve: 1.6, f: [2500, 9000], q: 6, d: [0.006, 0.025], g: [0.08, 0.25], fade: true });
    K.pings(v, { n: 7, at: 0.06, span: 0.45, curve: 1.3, f: [3500, 7500], dmax: 0.07, gmax: 0.05 });
    return 0.6;
  },
  v => {
    noise(v, { ft: 'bandpass', ff: 5000, q: 0.8, d: 0.04, g: 0.55 });
    tone(v, { type: 'triangle', f: 180, f2: 80, ft: 0.07, d: 0.09, g: 0.45 });
    K.grains(v, { n: 22, span: 0.3, curve: 2, f: [3000, 10000], q: 8, d: [0.005, 0.02], g: [0.06, 0.22], fade: true });
    K.pings(v, { n: 9, at: 0.04, span: 0.5, curve: 1.6, f: [4000, 8500], drop: 0.97, dmax: 0.06, gmax: 0.045 });
    return 0.65;
  });
def('menuHover', { max: 1, gap: 0.05, cool: 0.04, pv: 0.4, dv: 0.1, verb: 0, pri: 0 },
  v => { tone(v, { f: 1320, f2: 1480, ft: 0.02, d: 0.035, g: 0.05 }); tone(v, { type: 'triangle', f: 660, d: 0.03, g: 0.04 }); return 0.06; },
  v => { tone(v, { f: 1480, f2: 1320, ft: 0.02, d: 0.035, g: 0.05 }); tone(v, { type: 'triangle', f: 740, d: 0.03, g: 0.04 }); return 0.06; });
const sweep = (v, at, dur) => {
  if (!v.pan) return;
  const t = v.t + at, p = v.pan.pan, to = p.value > 0 ? -0.3 : 0.3;
  p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(to + v.r(-0.2, 0.2), t + dur);
};
def('ricochet', { max: 3, gap: 0.03, pv: 0.7, dv: 0.15, verb: 0.25, pri: 3, gain: 0.9 },
  v => {                                   // clang + long zing
    K.fm(v, { f: 900, ratio: 2.7, index: 4, d: 0.18, g: 0.12 });
    noise(v, { hp: 3000, d: 0.02, g: 0.35 });
    tone(v, { f: 4200, f2: 1800, ft: 0.35, at: 0.01, a: 0.005, hold: 0.02, d: 0.38, g: 0.085, vib: [45, 0.02] });
    K.grains(v, { n: 6, span: 0.15, f: [4000, 9000], g: [0.03, 0.08] });
    sweep(v, 0.01, 0.4); return 0.5;
  },
  v => {                                   // pee-yow
    K.fm(v, { f: 1150, ratio: 2.1, index: 3, d: 0.14, g: 0.1 });
    noise(v, { ft: 'bandpass', ff: 5000, q: 1, d: 0.025, g: 0.4 });
    tone(v, { f: 2600, fs: [[0.05, 3700], [0.42, 1400]], at: 0.01, a: 0.004, d: 0.44, g: 0.085, vib: [52, 0.015] });
    sweep(v, 0.01, 0.45); return 0.55;
  },
  v => {                                   // double ricochet
    noise(v, { hp: 3000, d: 0.02, g: 0.35 });
    K.fm(v, { f: 780, ratio: 3.1, index: 3, d: 0.12, g: 0.1 });
    tone(v, { f: 3600, f2: 2200, ft: 0.13, at: 0.01, a: 0.004, d: 0.13, g: 0.075, vib: [40, 0.02] });
    K.fm(v, { f: 1300, ratio: 2.3, index: 2, at: 0.14, d: 0.08, g: 0.05 });
    tone(v, { f: 3000, f2: 1300, ft: 0.3, at: 0.15, a: 0.004, d: 0.3, g: 0.06, vib: [44, 0.02] });
    sweep(v, 0.01, 0.45); return 0.5;
  });

// ---------- targets: swing-in cue per stage, range paddle step, versus "taken", gun skin swap ----------
def('targetIn', { max: 3, gap: 0.05, flamMax: 1, pv: 1.0, dv: 0.15, verb: 0.1, pri: 0, gain: 0.75,
  pick: K.pool({ range: [0, 1], alley: [2, 3], boneyard: [4, 5], def: [0, 1] }) },
  v => {                                   // 0 range paddle: whoosh + clack
    noise(v, { ft: 'bandpass', ff: 500, ff2: 1800, q: 1.5, a: 0.06, d: 0.06, g: 0.14 });
    noise(v, { ft: 'bandpass', ff: 1800, q: 3, at: 0.1, d: 0.02, g: 0.28 });
    tone(v, { f: 700, f2: 500, ft: 0.03, at: 0.1, d: 0.03, g: 0.14 });
    return 0.18;
  },
  v => {                                   // 1 range paddle, springier
    noise(v, { ft: 'bandpass', ff: 700, ff2: 2400, q: 2, a: 0.05, d: 0.05, g: 0.12 });
    tone(v, { type: 'triangle', f: 520, at: 0.09, d: 0.06, g: 0.16, vib: [28, 0.04] });
    noise(v, { ft: 'bandpass', ff: 2200, q: 3, at: 0.09, d: 0.015, g: 0.25 });
    return 0.18;
  },
  v => {                                   // 2 alley crook: scuff + cartoon pop
    noise(v, { ft: 'bandpass', ff: 900, q: 1, lp: 1500, d: 0.06, g: 0.2 });
    tone(v, { f: 280, f2: 560, ft: 0.05, at: 0.02, d: 0.06, g: 0.16 });
    tone(v, { type: 'sawtooth', f: 110, at: 0.02, d: 0.14, g: 0.06, lp: 600 });
    return 0.2;
  },
  v => {                                   // 3 alley crook: two steps + a low "dun"
    noise(v, { ft: 'bandpass', ff: 700, q: 1.2, d: 0.04, g: 0.18 });
    noise(v, { ft: 'bandpass', ff: 800, q: 1.2, at: 0.08, d: 0.04, g: 0.16 });
    tone(v, { type: 'sawtooth', f: 98, f2: 92, at: 0.06, hold: 0.04, d: 0.12, g: 0.07, lp: 700 });
    return 0.22;
  },
  v => {                                   // 4 boneyard: dirt crumble + bone clack
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 650, a: 0.03, d: 0.2, g: 0.32 });
    K.grains(v, { n: 5, span: 0.18, f: [600, 1800], q: 3, g: [0.04, 0.09] });
    tone(v, { f: 1100, at: 0.12, d: 0.025, g: 0.08 });
    return 0.28;
  },
  v => {                                   // 5 boneyard: gravel push + double knock
    noise(v, { kind: 'pink', ft: 'bandpass', ff: 500, q: 1, a: 0.05, d: 0.15, g: 0.25 });
    tone(v, { f: 950, at: 0.08, d: 0.02, g: 0.07 }); tone(v, { f: 1250, at: 0.13, d: 0.02, g: 0.06 });
    return 0.25;
  });
def('targetStep', { max: 2, gap: 0.05, flamMax: 1, pv: 0.8, dv: 0.1, verb: 0.05, pri: 0, gain: 0.7 },
  v => {                                   // ratchet tr-r-rk + motor
    for (let k = 0; k < 3; k++) noise(v, { ft: 'bandpass', ff: 2400 * v.p, q: 4, at: k * 0.035, d: 0.012, g: 0.16 });
    tone(v, { type: 'sawtooth', f: 90, f2: 120, ft: 0.1, d: 0.1, g: 0.05, lp: 400 });
    return 0.15;
  });
def('vsTaken', { max: 2, gap: 0.05, pv: 0.4, dv: 0.1, verb: 0.1, pri: 2 },
  v => {                                   // denied: a dull low blip + a distant crack
    noise(v, { hp: 2000, lp: 6000, d: 0.02, g: 0.15 });
    tone(v, { type: 'square', f: 196, f2: 165, ft: 0.1, hold: 0.04, d: 0.08, g: 0.08, lp: 1200 });
    return 0.18;
  });
def('skin', { max: 1, pv: 0.3, dv: 0.1, verb: 0.12, pri: 3 },
  v => {                                   // gun swap: chk-chunk + a shine
    noise(v, { ft: 'bandpass', ff: 2200, q: 2.5, d: 0.025, g: 0.4 });
    noise(v, { ft: 'bandpass', ff: 1300, q: 2.5, at: 0.09, d: 0.035, g: 0.45 });
    tone(v, { f: 150, f2: 70, ft: 0.04, at: 0.09, d: 0.05, g: 0.35 });
    tone(v, { type: 'triangle', f: 880, f2: 1760, ft: 0.12, at: 0.14, d: 0.14, g: 0.07 });
    K.pings(v, { n: 3, at: 0.2, span: 0.12, f: [3000, 5000], gmax: 0.04 });
    return 0.45;
  });
})(window.BLAM);
