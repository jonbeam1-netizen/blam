'use strict';
/* B.L.A.M. core/sfx-stage.js -- Deputy Duck's voice set and the stage-specific sounds (alley, boneyard, sky show, bee hive, invasion, laser tag, skee ball).
   Recipes only (see sfx-kit.js for the recipe contract). */
window.BLAM = window.BLAM || {};
(function (B) {
const K = B.SFXKit; if (!K) return;
const def = K.def, tone = K.tone, noise = K.noise, st = K.st;
const inPlay = () => !!(B.G && B.G.screenName === 'play');

// ---------- Deputy Duck ----------
// a quack: buzzy pulse through nasal formants, pitch flicks up then drops
const QF = [[1100, 4, 1], [1750, 6, 0.6], [3000, 8, 0.25]];
const quack = (v, at, f, o = {}) => K.voice(v, { wave: K.pulse(v.ctx, 0.18), f, fs: [[0.025, f * (o.up || 1.15)], [o.len || 0.13, f * (o.down || 0.72)]],
  at, a: 0.008, d: o.len || 0.13, hold: o.hold || 0, g: o.g || 0.32, formants: o.formants || QF, vib: o.vib || [32, 0.04] });
def('duckHeckle', { max: 1, cool: 0.8, pv: 1.2, dv: 0.12, verb: 0.1, pri: 1, gain: 0.8 },
  v => { quack(v, 0, 430); quack(v, 0.16, 470); return 0.35; },                        // quack-quack!
  v => { quack(v, 0, 450, { len: 0.09 }); quack(v, 0.1, 450, { len: 0.09 }); quack(v, 0.2, 520, { len: 0.16 }); return 0.42; },
  v => { quack(v, 0, 380, { up: 1.3, hold: 0.1, len: 0.2, down: 0.6 }); return 0.36; }); // quaaack
def('duckScared', { max: 1, cool: 0.6, pv: 1.0, dv: 0.1, verb: 0.1, pri: 1, gain: 0.75 },
  v => {                                   // eek!
    K.voice(v, { type: 'triangle', f: 900, fs: [[0.04, 1450], [0.24, 1250]], a: 0.005, d: 0.24, g: 0.4, vib: [14, 0.05], formants: [[1800, 4, 1], [3000, 6, 0.5]] });
    return 0.3;
  },
  v => {                                   // eep-eep
    K.voice(v, { type: 'triangle', f: 1100, fs: [[0.03, 1500]], a: 0.004, d: 0.09, g: 0.35, formants: [[1900, 4, 1], [3100, 6, 0.5]] });
    K.voice(v, { type: 'triangle', f: 1200, fs: [[0.03, 1650], [0.15, 1400]], at: 0.11, a: 0.004, d: 0.15, g: 0.35, vib: [16, 0.05], formants: [[1900, 4, 1], [3100, 6, 0.5]] });
    return 0.3;
  });
def('duckRelief', { max: 1, cool: 0.8, pv: 0.8, dv: 0.1, verb: 0.15, pri: 1, gain: 0.8 },
  v => {                                   // phe-e-ew + a little quack
    noise(v, { kind: 'pink', ft: 'bandpass', ff: 1500, ff2: 500, q: 2.5, a: 0.06, hold: 0.15, d: 0.4, g: 0.35 });
    noise(v, { ft: 'bandpass', ff: 2800, ff2: 1200, q: 3, a: 0.06, hold: 0.1, d: 0.3, g: 0.08 });
    quack(v, 0.5, 300, { len: 0.12, down: 0.8, g: 0.18 });
    return 0.7;
  });
def('duckAngry', { max: 1, cool: 1.4, pv: 1.0, dv: 0.15, verb: 0.08, pri: 1, gain: 0.75, chance: () => (inPlay() ? 0.4 : 1) },
  v => {                                   // grumble
    K.voice(v, { type: 'sawtooth', f: 165, fs: [[0.1, 190], [0.2, 150], [0.32, 175], [0.45, 130]], a: 0.02, hold: 0.25, d: 0.2, g: 0.4, vib: [9, 0.07], formants: [[700, 5, 1], [1200, 7, 0.6], [2500, 9, 0.2]] });
    noise(v, { kind: 'pink', ft: 'lowpass', ff: 900, d: 0.06, g: 0.2 });
    return 0.5;
  },
  v => {                                   // hmph! QUACK
    noise(v, { kind: 'pink', ft: 'bandpass', ff: 900, q: 2, d: 0.08, g: 0.3 });
    quack(v, 0.1, 300, { up: 1.05, down: 0.55, len: 0.18, vib: [45, 0.08], formants: [[900, 4, 1], [1500, 6, 0.6], [2600, 8, 0.25]] });
    return 0.35;
  });
def('duckHappy', { max: 1, cool: 1.0, pv: 1.0, dv: 0.12, verb: 0.1, pri: 1, gain: 0.7, chance: () => (inPlay() ? 0.45 : 1) },
  v => { quack(v, 0, 520, { up: 1.25, down: 1.0, len: 0.08 }); quack(v, 0.1, 620, { up: 1.25, down: 1.05, len: 0.1 }); return 0.25; },
  v => { quack(v, 0, 560, { up: 1.35, down: 1.1, len: 0.12 }); tone(v, { f: 1800, f2: 2600, ft: 0.08, at: 0.1, d: 0.1, g: 0.04 }); return 0.25; });
def('duckCheer', { max: 1, cool: 0.8, pv: 0.8, dv: 0.1, verb: 0.15, pri: 2, gain: 0.85 },
  v => {
    quack(v, 0, 500, { up: 1.25, down: 1.0, len: 0.08 }); quack(v, 0.1, 560, { up: 1.25, down: 1.0, len: 0.08 });
    quack(v, 0.2, 660, { up: 1.3, down: 1.1, len: 0.18 });
    tone(v, { f: 1500, f2: 3000, ft: 0.2, at: 0.25, d: 0.2, g: 0.035 });
    return 0.5;
  });
def('duckSad', { max: 1, cool: 0.8, pv: 0.6, dv: 0.1, verb: 0.15, pri: 2, gain: 0.85 },
  v => { quack(v, 0, 420, { up: 1.05, down: 0.55, hold: 0.25, len: 0.35, vib: [6, 0.03] }); return 0.7; },   // waaah
  v => { quack(v, 0, 380, { len: 0.12 }); quack(v, 0.2, 330, { up: 1.05, down: 0.6, hold: 0.15, len: 0.3, vib: [6, 0.03] }); return 0.7; });
const bonk = (v, at) => {
  K.fm(v, { f: 520, ratio: 1.5, index: 2, at, d: 0.12, g: 0.25 });
  tone(v, { f: 300, at: at + 0.03, a: 0.005, d: 0.4, g: 0.1, vib: [11, 0.12] });      // boi-oi-oing
  K.pings(v, { n: 4, at: at + 0.25, span: 0.35, f: [2500, 4200], gmax: 0.04 });     // stars
};
def('duckHit', { max: 1, pv: 0.8, dv: 0.1, verb: 0.15, pri: 3, gain: 0.9 },
  v => { K.voice(v, { wave: K.pulse(v.ctx, 0.18), f: 600, fs: [[0.04, 1100], [0.25, 450]], a: 0.005, d: 0.25, g: 0.38, vib: [25, 0.06], formants: QF }); bonk(v, 0.12); return 0.8; },
  v => { quack(v, 0, 700, { up: 1.5, down: 0.5, len: 0.2, vib: [40, 0.1] }); quack(v, 0.18, 500, { len: 0.1, g: 0.2 }); bonk(v, 0.08); return 0.8; });

// ---------- ALLEY ----------
const innocent = (v, at) => {                     // a soft "don't shoot me" chime under every bystander entrance
  tone(v, { type: 'triangle', f: 1047, at, d: 0.25, g: 0.05 }); tone(v, { type: 'triangle', f: 1319, at: at + 0.06, d: 0.3, g: 0.05 });
};
def('bystanderIn', { max: 2, gap: 0.05, pv: 0.6, dv: 0.1, verb: 0.15, pri: 1, gain: 0.8,
  pick: v => ({ cook: 0, kid: 1, lady: 2 })[v.o.who] != null ? ({ cook: 0, kid: 1, lady: 2 })[v.o.who] : 3 },
  v => {                                   // cook: a two-note whistle
    tone(v, { f: 1250, f2: 1500, ft: 0.08, a: 0.02, hold: 0.06, d: 0.08, g: 0.06, vib: [6, 0.01] });
    tone(v, { f: 1330, at: 0.2, a: 0.02, hold: 0.08, d: 0.12, g: 0.06, vib: [6, 0.015] });
    noise(v, { ft: 'bandpass', ff: 1400, q: 3, a: 0.02, d: 0.3, g: 0.03 });
    innocent(v, 0.05); return 0.45;
  },
  v => {                                   // kid: boing-boing
    tone(v, { type: 'triangle', f: 400, f2: 800, ft: 0.08, d: 0.1, g: 0.12 });
    tone(v, { type: 'triangle', f: 450, f2: 900, ft: 0.08, at: 0.13, d: 0.1, g: 0.11 });
    innocent(v, 0.08); return 0.4;
  },
  v => {                                   // lady: heels clack-clack + "hm?"
    noise(v, { ft: 'bandpass', ff: 3000, q: 4, d: 0.015, g: 0.3 }); tone(v, { f: 1600, d: 0.02, g: 0.06 });
    noise(v, { ft: 'bandpass', ff: 3200, q: 4, at: 0.14, d: 0.015, g: 0.28 }); tone(v, { f: 1700, at: 0.14, d: 0.02, g: 0.06 });
    K.voice(v, { type: 'triangle', f: 330, fs: [[0.15, 400]], at: 0.24, a: 0.02, d: 0.15, g: 0.2, formants: [[400, 5, 1], [2200, 8, 0.2]] });
    innocent(v, 0.02); return 0.45;
  },
  v => { innocent(v, 0); return 0.35; });
const flaps = (v, n, period, g, at = 0, f = 900) => {
  for (let k = 0; k < n; k++) noise(v, { kind: 'pink', ft: 'bandpass', ff: f * v.r(0.8, 1.2), q: 0.9, at: at + k * period * v.r(0.85, 1.15), a: 0.008, d: 0.035, g: g * (1 - k / (n + 2)) });
  return at + n * period;
};
def('pigeon', { max: 3, gap: 0.05, pv: 0.8, dv: 0.1, verb: 0.1, pri: 1, gain: 0.8 },
  v => {                                   // flap-flap-flap + a startled coo
    flaps(v, 9, 0.06, 0.35);
    K.voice(v, { type: 'sine', f: 420, fs: [[0.08, 520], [0.2, 380]], a: 0.02, d: 0.2, g: 0.2, vib: [18, 0.05], formants: [[400, 4, 1], [800, 6, 0.4]] });
    return 0.6;
  },
  v => { flaps(v, 12, 0.045, 0.3, 0, 1100); return 0.6; });

// ---------- BONEYARD ----------
const EH = [[550, 6, 1], [1800, 8, 0.5], [2600, 10, 0.2]];
def('skullThrow', { max: 3, gap: 0.05, pv: 0.9, dv: 0.12, verb: 0.15, pri: 2, gain: 0.85 },
  v => {                                   // whoosh at you + "heh-heh-heh"
    noise(v, { ft: 'bandpass', ff: 400, ff2: 2400, fft: 0.35, q: 1.5, a: 0.3, d: 0.12, g: 0.22 });
    for (let k = 0; k < 4; k++) K.voice(v, { type: 'sawtooth', f: 290 - k * 15, at: k * 0.075, a: 0.006, d: 0.05, g: 0.22, formants: EH });
    if (v.pan) { const p = v.pan.pan; p.setValueAtTime(p.value, v.t); p.linearRampToValueAtTime(0, v.t + 0.4); }
    return 0.5;
  },
  v => {                                   // spinning whirr
    noise(v, { ft: 'bandpass', ff: 600, ff2: 3000, fft: 0.4, q: 2, a: 0.3, d: 0.15, g: 0.18 });
    tone(v, { type: 'triangle', f: 500, f2: 900, ft: 0.4, a: 0.2, d: 0.2, g: 0.07, vib: [22, 0.12] });
    K.voice(v, { type: 'sawtooth', f: 330, fs: [[0.12, 260]], at: 0.05, a: 0.01, d: 0.12, g: 0.2, formants: EH });
    if (v.pan) { const p = v.pan.pan; p.setValueAtTime(p.value, v.t); p.linearRampToValueAtTime(0, v.t + 0.4); }
    return 0.5;
  });
def('skullBonk', { max: 2, gap: 0.05, pv: 0.7, dv: 0.12, verb: 0.15, pri: 3, gain: 0.9 },
  v => {                                   // hollow bonk on the glass + spring + teeth
    tone(v, { f: 120, f2: 60, ft: 0.08, d: 0.12, g: 0.6 });
    K.fm(v, { f: 300, ratio: 1.47, index: 2.5, d: 0.25, g: 0.3 });
    noise(v, { ft: 'lowpass', ff: 1500, d: 0.05, g: 0.35 });
    tone(v, { f: 220, at: 0.04, a: 0.005, d: 0.5, g: 0.09, vib: [9, 0.15] });
    K.grains(v, { n: 6, at: 0.05, span: 0.2, f: [2000, 4000], q: 6, g: [0.04, 0.1] });
    return 0.6;
  },
  v => {                                   // thock + skull-xylophone wobble
    tone(v, { f: 140, f2: 55, ft: 0.07, d: 0.1, g: 0.6 });
    noise(v, { ft: 'bandpass', ff: 700, q: 1.5, d: 0.06, g: 0.4 });
    K.fm(v, { f: 410, ratio: 2.01, index: 1.5, d: 0.3, g: 0.2, vib: null });
    tone(v, { type: 'triangle', f: 600, f2: 400, ft: 0.4, at: 0.05, d: 0.4, g: 0.07, vib: [13, 0.06] });
    return 0.55;
  });
def('boneRattle', { max: 3, gap: 0.05, flamMax: 1, pv: 1.0, dv: 0.12, verb: 0.12, pri: 1, gain: 0.8 },
  v => {                                   // clatter + bony knocks
    K.grains(v, { n: 14, span: 0.45, f: [1500, 4000], q: 5, d: [0.005, 0.015], g: [0.08, 0.22] });
    for (let k = 0; k < 5; k++) tone(v, { f: v.r(800, 1500), at: v.r(0, 0.4), d: v.r(0.03, 0.05), g: 0.06, np: true });
    return 0.5;
  },
  v => {                                   // chattering teeth
    const n = 12;
    for (let k = 0; k < n; k++) noise(v, { ft: 'bandpass', ff: v.r(2200, 3200), q: 6, at: k * 0.028, d: 0.01, g: v.r(0.1, 0.25) * (k % 2 ? 0.7 : 1) });
    tone(v, { f: 1050, at: 0.36, d: 0.04, g: 0.07 });
    return 0.45;
  });
def('bombFlip', { max: 2, gap: 0.05, pv: 0.5, dv: 0.1, verb: 0.15, pri: 3, gain: 0.85 },
  v => {                                   // candle out "pff" -> flip whip -> bullseye ding-ding
    noise(v, { ft: 'bandpass', ff: 1200, q: 1, a: 0.01, d: 0.12, g: 0.25 });
    noise(v, { ft: 'bandpass', ff: 800, ff2: 3000, fft: 0.08, q: 2, at: 0.1, d: 0.08, g: 0.2 });
    tone(v, { type: 'triangle', f: 1568, at: 0.16, d: 0.12, g: 0.12 });
    tone(v, { type: 'triangle', f: 2093, at: 0.22, d: 0.2, g: 0.12 });
    return 0.45;
  });
def('batFlap', { max: 2, gap: 0.08, pv: 0.8, dv: 0.1, verb: 0.15, pri: 1, gain: 0.8 },
  v => {                                   // leathery flaps flying across + squeaks
    const end = flaps(v, 14, 0.075, 0.28, 0, 650);
    for (let k = 0; k < 3; k++) { const f = v.r(5000, 7000), at = v.r(0.1, 0.9); tone(v, { f, f2: f * 0.8, ft: 0.04, at, d: 0.04, g: 0.035, np: true }); }
    if (v.pan) { const p = v.pan.pan, a = (v.o.u || 0) < 0.5 ? -0.8 : 0.8; p.setValueAtTime(a, v.t); p.linearRampToValueAtTime(-a, v.t + end); }
    return end + 0.1;
  });

// ---------- SKY SHOW ----------
const shellWhistle = (v, f, len, g = 0.04) => tone(v, { f, fs: [[len * 0.5, f * 1.15], [len, f * 0.65]], a: 0.04, d: len, g, vib: [8, 0.01] });
def('rocketLaunch', { max: 5, gap: 0.03, pv: 1.0, dv: 0.12, verb: 0.15, pri: 1, gain: 0.7,
  pick: (v, n, last) => (v.o.bomb ? 3 : [0, 1, 2].filter(i => i !== last)[Math.floor(Math.random() * 2)]) },
  v => {                                   // thump + whoosh up + a falling (doppler) whistle
    tone(v, { f: 120, f2: 60, ft: 0.06, d: 0.08, g: 0.4 });
    noise(v, { ft: 'bandpass', ff: 400, ff2: 3000, fft: 0.6, q: 1.2, a: 0.05, hold: 0.2, d: 0.5, g: 0.18 });
    shellWhistle(v, 2200, 1.0); return 1.1;
  },
  v => {                                   // crackly hiss rising
    tone(v, { f: 110, f2: 55, ft: 0.06, d: 0.08, g: 0.4 });
    noise(v, { ft: 'bandpass', ff: 600, ff2: 3500, fft: 0.7, q: 1, a: 0.04, hold: 0.25, d: 0.45, g: 0.16 });
    noise(v, { kind: 'crackle', hp: 2000, a: 0.05, hold: 0.3, d: 0.4, g: 0.25 });
    return 0.9;
  },
  v => {                                   // screamer
    tone(v, { f: 130, f2: 60, ft: 0.06, d: 0.08, g: 0.35 });
    noise(v, { ft: 'bandpass', ff: 500, ff2: 2500, fft: 0.5, q: 1.2, a: 0.04, hold: 0.15, d: 0.45, g: 0.14 });
    shellWhistle(v, 3000, 1.2, 0.035); return 1.3;
  },
  v => {                                   // 3 bomb rocket: sputtering putt-putt + a sinister low tone + fuse hiss
    for (let k = 0; k < 10; k++) noise(v, { kind: 'brown', ft: 'lowpass', ff: 700, at: k * 0.075, d: 0.04, g: 0.35 * (1 - k / 14) });
    tone(v, { type: 'sawtooth', f: 110, f2: 82, ft: 0.8, a: 0.05, hold: 0.3, d: 0.5, g: 0.06, lp: 500 });
    noise(v, { hp: 4000, a: 0.05, hold: 0.4, d: 0.3, g: 0.04 });
    return 0.9;
  });
// burst: the higher it pops, the farther away it sounds (later, softer, darker)
const boom = (v, h) => {
  const at = 0.03 + h * 0.08, k = 1 - h * 0.3;
  noise(v, { hp: 1500, lp: 9000 - h * 4000, at, d: 0.03, g: 0.3 * k });
  tone(v, { f: 75 - h * 15, f2: 34, ft: 0.4, at, d: 0.5, g: 0.65 * k, drive: 1.5 });
  noise(v, { kind: 'brown', ft: 'lowpass', ff: 1400 - h * 600, ff2: 200, fft: 0.6, at, d: 0.6, g: 0.55 * k });
  return at;
};
const hOf = v => Math.max(0, Math.min(1, v.o.height != null && isFinite(v.o.height) ? v.o.height : 0.6));
const TYPE_I = { peony: 0, ring: 1, willow: 2, crackle: 3, letter: 4 };
def('rocketBurst', { max: 5, gap: 0.02, pv: 0.8, dv: 0.12, verb: 0.3, pri: 2, gain: 0.8,
  pick: v => (TYPE_I[v.o.type] != null ? TYPE_I[v.o.type] : 0) },
  v => { const a = boom(v, hOf(v)); noise(v, { hp: 4000, at: a + 0.05, a: 0.1, d: 0.6, g: 0.05 }); return 1.0; },              // peony
  v => {                                   // ring: + a shimmering chord
    const a = boom(v, hOf(v));
    [2093, 2637, 3136].forEach((f, i) => tone(v, { f, at: a + 0.03 + i * 0.02, a: 0.05, d: 0.8, g: 0.03, vib: [5 + i * 1.7, 0.006] }));
    return 1.1;
  },
  v => {                                   // willow: + a long falling hiss
    const a = boom(v, hOf(v));
    noise(v, { ft: 'bandpass', ff: 6000, ff2: 2500, q: 0.8, at: a + 0.1, a: 0.2, hold: 0.3, d: 1.2, g: 0.08 });
    noise(v, { kind: 'crackle', hp: 3000, at: a + 0.3, a: 0.2, hold: 0.2, d: 0.9, g: 0.12 });
    return 2.0;
  },
  v => {                                   // crackle: + a shower of pops
    const a = boom(v, hOf(v));
    K.grains(v, { n: 30, at: a + 0.25, span: 1.0, f: [1500, 5000], q: 2, d: [0.005, 0.015], g: [0.1, 0.3] });
    noise(v, { kind: 'crackle', hp: 1500, at: a + 0.25, a: 0.1, hold: 0.4, d: 0.5, g: 0.3 });
    return 1.5;
  },
  v => {                                   // letter (finale): + a bell chord
    const a = boom(v, 0.4);
    [1047, 1319, 1568].forEach((f, i) => K.bell(v, { f, at: a + 0.05 + i * 0.04, d: 1.0, g: 0.07, ratios: [1, 2.76, 5.4], amps: [1, 0.3, 0.1] }));
    return 1.3;
  });
def('rocketFizzle', { max: 3, gap: 0.05, pv: 0.8, dv: 0.12, verb: 0.15, pri: 1, gain: 0.8 },
  v => {                                   // sputter + sad falling whistle
    noise(v, { kind: 'crackle', hp: 3000, d: 0.6, g: 0.3 });
    noise(v, { ft: 'lowpass', ff: 1200, d: 0.08, g: 0.2 });
    tone(v, { f: 1100, f2: 300, ft: 0.6, a: 0.02, d: 0.6, g: 0.05 });
    return 0.7;
  },
  v => {                                   // pfft ... pew-wah
    noise(v, { ft: 'bandpass', ff: 1500, q: 1, a: 0.01, d: 0.15, g: 0.25 });
    tone(v, { type: 'square', f: 600, fs: [[0.1, 650], [0.5, 220]], at: 0.08, a: 0.02, d: 0.5, g: 0.035, lp: 1800 });
    return 0.65;
  });
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
def('chain', { max: 6, gap: 0.015, flamMax: 3, pv: 0.15, dv: 0.08, verb: 0.25, pri: 3, gain: 0.85 },
  v => {                                   // rising pings: link n climbs the pentatonic scale
    const n = Math.max(1, v.o.n | 0 || 1), f = 784 * st(PENTA[Math.min(PENTA.length - 1, n - 1)]);
    K.bell(v, { f, d: 0.35, g: 0.18, ratios: [1, 2.76, 5.4], amps: [1, 0.35, 0.12] });
    tone(v, { wave: K.pulse(v.ctx, 0.25), f: f / 2, d: 0.08, hold: 0.02, g: 0.05, lp: 5000 });
    K.pings(v, { n: 2 + Math.min(4, n), at: 0.03, span: 0.2, f: [f * 2, f * 3], gmax: 0.04 });
    return 0.45;
  });
def('finale', { max: 1, pv: 0.2, dv: 0.05, verb: 0.3, pri: 4, gain: 0.9 },
  v => {                                   // riser -> big layered boom + chime arpeggio + crowd cheer
    noise(v, { ft: 'bandpass', ff: 300, ff2: 4000, fft: 1.1, q: 1.5, a: 1.05, d: 0.15, g: 0.18 });
    tone(v, { f: 200, f2: 1600, ft: 1.1, a: 1.0, d: 0.15, g: 0.04 });
    const b = 1.15;
    tone(v, { f: 55, f2: 25, ft: 1.2, at: b, d: 1.5, g: 0.8, drive: 2 });
    noise(v, { hp: 1000, at: b, d: 0.06, g: 0.5, drive: 2 });
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 1500, ff2: 150, fft: 1.6, at: b, d: 1.8, g: 0.8 });
    noise(v, { kind: 'crackle', hp: 2000, at: b + 0.2, a: 0.2, hold: 0.4, d: 1.4, g: 0.35 });
    ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, i) => K.bell(v, { f: K.nf(n), at: b + 0.1 + i * 0.08, d: 1.1, g: 0.08, ratios: [1, 2.76, 5.4], amps: [1, 0.3, 0.1] }));
    [[500, 1], [1500, 0.6], [2600, 0.35]].forEach(([f, g]) => noise(v, { kind: 'pink', ft: 'bandpass', ff: f, q: 1.5, at: b + 0.2, a: 0.4, hold: 0.8, d: 1.5, g: 0.09 * g }));
    return 4.2;
  });
// ---------- BEE HIVE ----------
// a buzz: detuned saws through a nasal band-pass, the pitch wobbling like wings (vib) and a tremolo from the band sweep
const buzz = (v, o) => {
  const f = o.f || 220, n = o.n || 2;
  for (let k = 0; k < n; k++) tone(v, { type: 'sawtooth', f: f * (1 + (k - (n - 1) / 2) * 0.025), fs: o.fs ? o.fs.map(([dt, ff]) => [dt, ff * (1 + (k - (n - 1) / 2) * 0.025)]) : null,
    at: o.at, a: o.a || 0.03, hold: o.hold || 0, d: o.d || 0.2, g: (o.g || 0.05) / n, vib: o.vib || [38 + k * 7, 0.03], ft: 'bandpass', ff: o.ff || 700, ff2: o.ff2, q: o.q || 1.4, lp: 3200 });
};
def('beePass', { max: 2, gap: 0.1, pv: 1.2, dv: 0.15, verb: 0.08, pri: 0, gain: 0.7 },
  v => {                                   // a bee zips past: the buzz swells and drops in pitch (doppler), panned across
    buzz(v, { f: 250, fs: [[0.22, 270], [0.5, 180]], a: 0.16, hold: 0.12, d: 0.28, g: 0.07, ff: 900, ff2: 500 });
    if (v.pan) { const p = v.pan.pan, a = (v.o.u || 0.5) < 0.5 ? -0.7 : 0.7; p.setValueAtTime(a, v.t); p.linearRampToValueAtTime(-a * 0.6, v.t + 0.55); }
    return 0.6;
  },
  v => { buzz(v, { f: 310, fs: [[0.15, 330], [0.4, 230]], a: 0.1, hold: 0.08, d: 0.22, g: 0.06, ff: 1100, ff2: 650 }); return 0.45; });
def('beeFrenzy', { max: 1, cool: 0.5, pv: 0.4, dv: 0.08, verb: 0.12, pri: 2, gain: 0.85 },
  v => {                                   // the swarm goes wild for ~2 s: a loud, rising, wobbling cloud of buzz
    buzz(v, { f: 205, fs: [[0.25, 250], [1.6, 262], [2.1, 200]], a: 0.18, hold: 1.4, d: 0.45, g: 0.16, n: 4, ff: 650, ff2: 1300, q: 1.1, vib: [44, 0.045] });
    buzz(v, { f: 410, fs: [[0.3, 500], [2.0, 420]], a: 0.25, hold: 1.2, d: 0.5, g: 0.05, n: 2, ff: 1600, q: 2 });
    noise(v, { kind: 'pink', ft: 'bandpass', ff: 1800, ff2: 2600, q: 1.5, a: 0.3, hold: 1.1, d: 0.5, g: 0.05 });
    return 2.2;
  });
def('beeHit', { max: 2, gap: 0.05, pv: 0.8, dv: 0.1, verb: 0.1, pri: 2, gain: 0.85 },
  v => {                                   // pok! + an angry little bzzt that climbs
    noise(v, { ft: 'bandpass', ff: 2500, q: 2, d: 0.03, g: 0.3 });
    tone(v, { type: 'triangle', f: 900, f2: 500, ft: 0.05, d: 0.06, g: 0.12 });
    buzz(v, { f: 300, fs: [[0.18, 520]], at: 0.03, a: 0.01, hold: 0.08, d: 0.12, g: 0.09, ff: 1400 });
    return 0.35;
  },
  v => {
    noise(v, { ft: 'bandpass', ff: 3000, q: 2.5, d: 0.025, g: 0.28 });
    buzz(v, { f: 340, fs: [[0.06, 280], [0.22, 560]], at: 0.02, a: 0.01, hold: 0.06, d: 0.14, g: 0.09, ff: 1500 });
    return 0.35;
  });
def('larvaHatch', { max: 2, gap: 0.05, pv: 0.7, dv: 0.1, verb: 0.15, pri: 2, gain: 0.85 },
  v => {                                   // a wet pop out of the cell + wax crackle (+ a tiny buzz if a bee came out)
    tone(v, { f: 260, f2: 980, ft: 0.06, d: 0.09, g: 0.3 });
    noise(v, { ft: 'lowpass', ff: 1800, d: 0.05, g: 0.25 });
    K.grains(v, { n: 7, at: 0.03, span: 0.18, f: [1800, 4200], q: 5, g: [0.05, 0.12] });
    if (v.o.kind === 'bee') buzz(v, { f: 280, fs: [[0.3, 320]], at: 0.1, a: 0.05, hold: 0.1, d: 0.2, g: 0.05 });
    else tone(v, { type: 'triangle', f: 1320, at: 0.08, d: 0.12, g: 0.05 });
    return 0.5;
  });
def('honeyDrip', { max: 1, cool: 4, pv: 1.5, dv: 0.1, verb: 0.25, pri: 0, gain: 0.6 },
  v => {                                   // gloop ... plip
    tone(v, { f: 820, f2: 300, ft: 0.09, a: 0.004, d: 0.1, g: 0.09 });
    tone(v, { f: 1500, f2: 900, ft: 0.05, at: 0.55, d: 0.06, g: 0.05 });
    return 0.7;
  });
// the hive's ambience bed (a quiet hum of the comb, a breeze, the odd bee nearby). sfx-music.js owns K.beds and loads
// after this file, so the bed waits in K.stageBeds and stages/beehive.js adds it to K.beds (id 'beehive').
K.stageBeds = K.stageBeds || {};
K.stageBeds.beehive = (ctx, bus) => {
  const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
  out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 2.5); out.connect(bus);
  const hum = ctx.createGain(); hum.gain.value = 1; const bp = K.filt(ctx, 'bandpass', 520, 1.1); bp.connect(hum).connect(out);
  [[214, 0.0042], [219.5, 0.0036], [437, 0.0014]].forEach(([f, g]) => { const o = ctx.createOscillator(), gn = K.gain(ctx, g); o.type = 'sawtooth'; o.frequency.value = f; o.connect(gn).connect(bp); o.start(now); srcs.push(o); });
  const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; param.value = base; o.connect(gn).connect(param); o.start(now); srcs.push(o); };
  lfo(0.17, 0.35, hum.gain, 1); lfo(0.07, 160, bp.frequency, 520);
  const s = ctx.createBufferSource(), fl = K.filt(ctx, 'lowpass', 650, 0.7), gn = K.gain(ctx, 0.035);
  s.buffer = K.noiseBuf(ctx, 'pink'); s.loop = true; s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s);
  lfo(0.09, 0.018, gn.gain, 0.035);
  let stopped = false;
  return {
    tick() {},
    stop(fade = 1.5) {
      if (stopped) return; stopped = true;
      const t = ctx.currentTime, gp = out.gain;
      gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
      for (const x of srcs) { try { x.stop(t + fade + 0.1); } catch (e) {} }
      setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    }
  };
};
// ---------- INVASION ----------
// a theremin-ish warble: a sine with a wide slow vibrato gliding, through a soft band (the classic flying-saucer whine)
const warble = (v, o) => tone(v, { type: o.type || 'sine', f: o.f, fs: o.fs, at: o.at, a: o.a || 0.06, hold: o.hold || 0, d: o.d || 0.3, g: o.g || 0.05, vib: o.vib || [6.5, 0.06], lp: o.lp || 3800 });
def('saucerIn', { max: 3, gap: 0.08, pv: 1.5, dv: 0.12, verb: 0.25, pri: 0, gain: 2.2 },
  v => { const f = [1250, 1000, 820][v.o.size | 0] || 1000; warble(v, { f: f * 1.3, fs: [[0.18, f], [0.5, f * 1.1]], a: 0.05, hold: 0.15, d: 0.35, g: 0.045 }); return 0.6; },
  v => { const f = [1150, 920, 760][v.o.size | 0] || 920; warble(v, { f: f * 0.8, fs: [[0.25, f * 1.2], [0.55, f]], a: 0.08, hold: 0.12, d: 0.35, g: 0.04, vib: [8, 0.05] }); return 0.65; });
def('saucerHit', { max: 4, gap: 0.03, pv: 0.8, dv: 0.12, verb: 0.15, pri: 2, gain: 6.5 },
  v => {                                   // a tin clang + the glass dome tinkling + a small pop
    const f = [900, 700, 540][v.o.size | 0] || 700;
    K.fm(v, { f, ratio: 2.7, index: 3, d: 0.25, g: 0.18 });
    noise(v, { ft: 'bandpass', ff: 1800, q: 1.2, d: 0.08, g: 0.25 });
    K.pings(v, { n: 5, at: 0.02, span: 0.25, f: [3500, 7000], gmax: 0.05 });
    tone(v, { f: 260, f2: 80, ft: 0.15, d: 0.16, g: 0.2 });
    return 0.45;
  },
  v => {
    const f = [820, 640, 500][v.o.size | 0] || 640;
    K.fm(v, { f, ratio: 3.1, index: 2.5, d: 0.3, g: 0.16 });
    warble(v, { f: 1400, fs: [[0.25, 300]], a: 0.005, d: 0.25, g: 0.04, vib: [18, 0.08] });   // the saucer's whine dying
    K.pings(v, { n: 4, at: 0.03, span: 0.22, f: [4000, 8000], gmax: 0.045 });
    noise(v, { ft: 'lowpass', ff: 1500, d: 0.1, g: 0.25 });
    return 0.45;
  });
def('landing', { max: 2, gap: 0.1, pv: 0.5, dv: 0.1, verb: 0.3, pri: 3, gain: 0.85 },
  v => {                                   // a whoosh down into the air, a muffled boom, the fizz of the fireball
    noise(v, { ft: 'bandpass', ff: 2600, ff2: 400, fft: 0.3, q: 1.4, a: 0.08, d: 0.25, g: 0.2 });
    tone(v, { f: 70, f2: 32, ft: 0.5, at: 0.22, d: 0.55, g: 0.55, drive: 1.5 });
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 900, ff2: 150, fft: 0.6, at: 0.22, d: 0.6, g: 0.5 });
    noise(v, { kind: 'crackle', hp: 2500, at: 0.3, a: 0.05, hold: 0.2, d: 0.5, g: 0.2 });
    return 1.1;
  });
def('beamOn', { max: 1, cool: 0.5, pv: 0.3, dv: 0.08, verb: 0.3, pri: 2, gain: 3.5 },
  v => {                                   // the tractor beam powers up: a rising shimmering pulse chord
    [0, 7, 12].forEach((n, i) => tone(v, { wave: K.pulse(v.ctx, 0.3), f: 330 * st(n), fs: [[0.6, 330 * st(n) * 1.5]], at: i * 0.04, a: 0.25, hold: 0.5, d: 0.4, g: 0.025, vib: [11 + i * 3, 0.02], lp: 2600 }));
    noise(v, { ft: 'bandpass', ff: 1500, ff2: 5000, fft: 0.9, q: 3, a: 0.3, hold: 0.4, d: 0.3, g: 0.04 });
    return 1.2;
  });
def('beamOff', { max: 1, cool: 0.3, pv: 0.3, dv: 0.08, verb: 0.2, pri: 2, gain: 2.5 },
  v => { tone(v, { wave: K.pulse(v.ctx, 0.3), f: 900, f2: 160, ft: 0.35, a: 0.005, d: 0.35, g: 0.25, lp: 2400 }); noise(v, { ft: 'bandpass', ff: 3000, ff2: 600, fft: 0.3, q: 2, d: 0.3, g: 0.2 }); return 0.45; });
def('mothershipIn', { max: 1, cool: 2, pv: 0.2, dv: 0.05, verb: 0.35, pri: 4, gain: 1.9 },
  v => {                                   // a deep wobbling drone swells in under a two-tone alarm
    [55, 55.6, 82.5].forEach(f => tone(v, { type: 'sawtooth', f, a: 0.6, hold: 1.0, d: 0.9, g: 0.06, vib: [3.2, 0.015], lp: 420 }));
    for (let k = 0; k < 4; k++) tone(v, { type: 'square', f: k & 1 ? 660 : 880, at: 0.1 + k * 0.28, a: 0.01, hold: 0.16, d: 0.06, g: 0.03, lp: 2400 });
    warble(v, { f: 300, fs: [[1.2, 520], [2.2, 420]], at: 0.3, a: 0.4, hold: 0.8, d: 0.7, g: 0.04, vib: [5, 0.08] });
    return 2.4;
  });
def('shieldPop', { max: 3, gap: 0.04, pv: 0.2, dv: 0.08, verb: 0.15, pri: 2, gain: 4 },
  v => {                                   // a heavy clunk, then a ping that climbs as fewer plates are left
    const n = Math.max(0, v.o.n | 0), f = 523 * st(Math.max(0, 10 - n * 2));
    K.fm(v, { f: 180, ratio: 1.4, index: 2.5, d: 0.18, g: 0.25 });
    noise(v, { ft: 'lowpass', ff: 1200, d: 0.08, g: 0.3 });
    K.bell(v, { f, at: 0.04, d: 0.35, g: 0.09, ratios: [1, 2.76, 5.4], amps: [1, 0.35, 0.1] });
    return 0.45;
  });
def('coreHit', { max: 1, pv: 0.2, dv: 0.05, verb: 0.35, pri: 4, gain: 0.95 },
  v => {                                   // a zap up the scale, the reactor goes: a long layered boom with crackle
    tone(v, { type: 'square', f: 300, f2: 2400, ft: 0.18, a: 0.005, d: 0.2, g: 0.05, lp: 4000 });
    tone(v, { f: 60, f2: 24, ft: 1.2, at: 0.15, d: 1.3, g: 0.75, drive: 2 });
    noise(v, { hp: 900, at: 0.15, d: 0.06, g: 0.45, drive: 2 });
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 1400, ff2: 120, fft: 1.4, at: 0.15, d: 1.5, g: 0.75 });
    noise(v, { kind: 'crackle', hp: 1800, at: 0.35, a: 0.15, hold: 0.5, d: 1.0, g: 0.3 });
    return 2.0;
  });
def('shootingStar', { max: 1, cool: 4, pv: 1.0, dv: 0.1, verb: 0.4, pri: 0, gain: 1.6 },
  v => { tone(v, { f: 5200, f2: 2600, ft: 0.4, a: 0.02, d: 0.4, g: 0.012 }); K.pings(v, { n: 3, at: 0.05, span: 0.3, f: [5000, 8000], gmax: 0.01 }); return 0.6; });
def('waveStart', { max: 1, cool: 1, pv: 0, dv: 0.02, verb: 0.2, pri: 3, gain: 6 },
  v => {                                   // a retro four-blip fanfare, a step higher every wave
    const b = 523 * st(((v.o.n | 0) - 1) * 2);
    [0, 4, 7, 12].forEach((n, i) => tone(v, { wave: K.pulse(v.ctx, 0.25), f: b * st(n), at: i * 0.09, a: 0.004, hold: i === 3 ? 0.14 : 0.04, d: 0.08, g: 0.045, lp: 4200, np: true }));
    return 0.6;
  });
// the range's duck cameo events had no voice yet; the beam cameo needs one (kept if another file defines them first)
if (!K.lib.duckCameo) def('duckCameo', { max: 1, cool: 1, pv: 0.6, dv: 0.1, verb: 0.15, pri: 2, gain: 4.5 },
  v => { quack(v, 0, 470, { up: 1.3, len: 0.1 }); tone(v, { type: 'triangle', f: 700, f2: 1500, ft: 0.5, at: 0.12, a: 0.03, d: 0.5, g: 0.04, vib: [9, 0.03] }); return 0.7; });   // quack + wheee
if (!K.lib.duckCameoHit) def('duckCameoHit', { max: 1, cool: 0.5, pv: 0.4, dv: 0.1, verb: 0.15, pri: 3, gain: 2 },
  v => { quack(v, 0, 560, { up: 1.3, down: 1.05, len: 0.09 }); quack(v, 0.11, 660, { up: 1.3, down: 1.1, len: 0.12 }); K.pings(v, { n: 4, at: 0.05, span: 0.3, f: [2500, 4500], gmax: 0.04 }); return 0.5; });
// the orbit ambience bed (a quiet space hum: low drones, a filtered solar wind, a far radio blip now and then).
// Like the hive's: it waits in K.stageBeds and stages/invasion.js adds it to K.beds (id 'invasion').
K.stageBeds.invasion = (ctx, bus) => {
  const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
  out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 3); out.connect(bus);
  const lp = K.filt(ctx, 'lowpass', 260, 0.8); lp.connect(out);
  [[55, 0.012], [82.6, 0.006], [110.3, 0.003]].forEach(([f, g]) => { const o = ctx.createOscillator(), gn = K.gain(ctx, g); o.type = 'triangle'; o.frequency.value = f; o.connect(gn).connect(lp); o.start(now); srcs.push(o); });
  const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; param.value = base; o.connect(gn).connect(param); o.start(now); srcs.push(o); };
  lfo(0.05, 90, lp.frequency, 260);
  const s = ctx.createBufferSource(), fl = K.filt(ctx, 'bandpass', 700, 0.6), gn = K.gain(ctx, 0.02);
  s.buffer = K.noiseBuf(ctx, 'pink'); s.loop = true; s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s);
  lfo(0.031, 300, fl.frequency, 700); lfo(0.07, 0.01, gn.gain, 0.02);
  let stopped = false, next = now + 4 + Math.random() * 6;
  const blip = t => {                      // a far satellite's beep-boop
    const n = 2 + ((Math.random() * 3) | 0), f0 = 900 + Math.random() * 900;
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), a = t + k * 0.13; o.type = 'sine'; o.frequency.value = f0 * (k & 1 ? 0.75 : 1);
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.006, a + 0.01); g.gain.linearRampToValueAtTime(0, a + 0.09);
      o.connect(g).connect(out); o.start(a); o.stop(a + 0.12);
    }
  };
  return {
    tick(until) { if (stopped) return; if (next < ctx.currentTime - 0.5) next = ctx.currentTime + 2; while (next < until) { try { blip(next); } catch (e) {} next += 6 + Math.random() * 9; } },
    stop(fade = 1.5) {
      if (stopped) return; stopped = true;
      const t = ctx.currentTime, gp = out.gain;
      gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
      for (const x of srcs) { try { x.stop(t + fade + 0.1); } catch (e) {} }
      setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    }
  };
};
// ---------- LASER TAG ----------
// 90s laser tag: square-wave vest chirps, phaser pews with a falling whistle, the vest buzzer, a siren, a robot announcer
const pls = (v, d = 0.25) => K.pulse(v.ctx, d);
def('taggerIn', { max: 3, gap: 0.06, pv: 0.7, dv: 0.1, verb: 0.15, pri: 1, gain: 4.8, pick: v => (v.o.team === 'green' ? 1 : 0) },
  v => {                                   // a red vest arms: a hard two-step power-up chirp
    tone(v, { wave: pls(v), f: 520, fs: [[0.05, 1040]], a: 0.003, hold: 0.03, d: 0.05, g: 0.05, lp: 4000 });
    tone(v, { wave: pls(v), f: 780, fs: [[0.04, 1560]], at: 0.07, a: 0.003, hold: 0.02, d: 0.06, g: 0.045, lp: 4000 });
    return 0.2;
  },
  v => { tone(v, { type: 'triangle', f: 660, f2: 990, ft: 0.08, a: 0.005, d: 0.12, g: 0.07 }); tone(v, { type: 'triangle', f: 990, at: 0.09, a: 0.005, d: 0.1, g: 0.05 }); return 0.22; });   // green: a friendly bloop
def('dotCharge', { max: 4, gap: 0.03, pv: 0, dv: 0.02, verb: 0.05, pri: 2, gain: 5 },
  v => {                                   // the aiming dot closing: a beep a step higher every sixth of the slide
    const k = K.clamp(v.o.k | 0, 0, 5), f = 880 * st(k * 2);
    tone(v, { type: 'square', f, a: 0.002, hold: 0.022 + 0.005 * k, d: 0.02, g: 0.02 + 0.005 * k, lp: 3600, np: true });
    return 0.08;
  });
def('taggerFire', { max: 3, gap: 0.03, pv: 0.5, dv: 0.1, verb: 0.2, pri: 3, gain: 7.5 },
  v => {                                   // PEW: a sawtooth dive, a descending whistle, a zap of noise
    tone(v, { type: 'sawtooth', f: 2600, fs: [[0.22, 320]], a: 0.002, d: 0.24, g: 0.08, lp: 5000 });
    tone(v, { type: 'sine', f: 3400, fs: [[0.35, 900]], a: 0.004, d: 0.35, g: 0.04 });
    noise(v, { ft: 'bandpass', ff: 3000, ff2: 800, fft: 0.08, q: 2, d: 0.08, g: 0.12 });
    return 0.42;
  });
def('vestDown', { max: 1, cool: 0.2, pv: 0, dv: 0.05, verb: 0.1, pri: 4, gain: 2.4 },
  v => {                                   // YOUR vest is hit: a harsh low buzzer stuttering off + a power-down sweep
    for (let k = 0; k < 5; k++) tone(v, { type: 'square', f: 110, at: k * 0.075, a: 0.003, hold: 0.045, d: 0.01, g: 0.1, lp: 1400, np: true });
    tone(v, { type: 'square', f: 660, f2: 90, ft: 0.45, a: 0.004, d: 0.45, g: 0.045, lp: 2500 });
    return 0.55;
  });
def('tagHit', { max: 3, gap: 0.04, pv: 0.3, dv: 0.08, verb: 0.15, pri: 2, gain: 4.8 },
  v => {                                   // their vest chirps off: three falling notes (a sensor: brighter, quicker) + a low thunk
    const s = v.o.zone === 'sensor', b = s ? 1760 : 1320;
    [0, -5, -12].forEach((n, i) => tone(v, { wave: pls(v), f: b * st(n), at: i * (s ? 0.05 : 0.07), a: 0.002, hold: 0.03, d: 0.03, g: 0.045, lp: 5000 }));
    tone(v, { type: 'square', f: 140, at: s ? 0.15 : 0.2, a: 0.003, hold: 0.1, d: 0.08, g: 0.035, lp: 900 });
    return 0.42;
  });
def('friendlyFire', { max: 1, cool: 0.3, pv: 0, dv: 0.05, verb: 0.12, pri: 4, gain: 2.2 },
  v => { for (let k = 0; k < 2; k++) [196, 207].forEach(f => tone(v, { type: 'sawtooth', f, at: k * 0.2, a: 0.005, hold: 0.12, d: 0.04, g: 0.05, lp: 1800, np: true })); return 0.45; });   // the wrong-team buzzer
def('refWhistle', { max: 1, cool: 0.4, pv: 0.2, dv: 0.05, verb: 0.2, pri: 3, gain: 3.2 },
  v => {                                   // a pea whistle: shrill, with the pea's fast trill (two blasts on a foul)
    const n = v.o.foul ? 2 : 1;
    for (let k = 0; k < n; k++) tone(v, { type: 'sine', f: 2900, at: k * 0.28, a: 0.01, hold: v.o.foul ? 0.14 : 0.24, d: 0.05, g: 0.05, vib: [42, 0.035] });
    noise(v, { ft: 'bandpass', ff: 3000, q: 4, a: 0.01, hold: 0.15, d: 0.05, g: 0.02 });
    return 0.62;
  });
def('fogBurst', { max: 1, cool: 1, pv: 0.3, dv: 0.1, verb: 0.25, pri: 2, gain: 1.3 },
  v => {                                   // the fog machine: a pneumatic PSSHHH that rolls off
    noise(v, { ft: 'bandpass', ff: 5000, ff2: 1800, fft: 1.2, q: 0.7, a: 0.04, hold: 0.5, d: 0.9, g: 0.12 });
    noise(v, { kind: 'pink', ft: 'lowpass', ff: 600, a: 0.02, hold: 0.3, d: 0.6, g: 0.09 });
    return 1.5;
  });
def('baseOpen', { max: 1, cool: 1, pv: 0, dv: 0.02, verb: 0.3, pri: 3, gain: 5 },
  v => {                                   // the enemy base: a square siren wailing up and down twice over the shutter's servo
    tone(v, { type: 'square', f: 520, fs: [[0.4, 980], [0.8, 520], [1.2, 980], [1.6, 520]], a: 0.05, hold: 1.4, d: 0.2, g: 0.028, lp: 2400, np: true });
    tone(v, { type: 'sawtooth', f: 90, f2: 180, ft: 0.3, a: 0.02, d: 0.3, g: 0.05, lp: 700 });
    return 1.7;
  });
def('baseHit', { max: 1, pv: 0.2, dv: 0.05, verb: 0.3, pri: 4, gain: 0.9 },
  v => {                                   // the base goes: a zap up, an electronic boom, a falling alarm chime
    tone(v, { type: 'square', f: 300, f2: 2400, ft: 0.15, a: 0.003, d: 0.16, g: 0.05, lp: 4000 });
    tone(v, { f: 70, f2: 30, ft: 0.8, at: 0.12, d: 0.9, g: 0.5, drive: 1.6 });
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 1600, ff2: 150, fft: 0.9, at: 0.12, d: 1.0, g: 0.42 });
    [0, -3, -7, -12].forEach((n, i) => K.bell(v, { f: 1568 * st(n), at: 0.3 + i * 0.1, d: 0.4, g: 0.05, ratios: [1, 2.76], amps: [1, 0.3] }));
    return 1.3;
  });
def('gameOn', { max: 1, pv: 0, dv: 0.02, verb: 0.25, pri: 4, gain: 1.8 },
  v => {                                   // the arena announcer: a robot "GAME ON!" (formant voice) + a laser sweep
    const w = pls(v, 0.3);
    noise(v, { ft: 'bandpass', ff: 2200, q: 2, d: 0.03, g: 0.08 });                                                       // "g"
    K.voice(v, { wave: w, f: 150, fs: [[0.2, 140]], at: 0.02, a: 0.01, hold: 0.14, d: 0.04, g: 0.28, formants: [[530, 6, 1], [1840, 8, 0.6], [2480, 10, 0.3]] });    // "GAY"
    tone(v, { type: 'sine', f: 140, at: 0.2, a: 0.01, hold: 0.05, d: 0.05, g: 0.12, lp: 400, np: true });                   // "m"
    K.voice(v, { wave: w, f: 145, fs: [[0.3, 118]], at: 0.3, a: 0.01, hold: 0.2, d: 0.1, g: 0.3, formants: [[620, 6, 1], [940, 8, 0.7], [2400, 10, 0.2]] });   // "ON"
    tone(v, { type: 'sine', f: 120, at: 0.6, a: 0.01, hold: 0.05, d: 0.08, g: 0.1, lp: 380, np: true });                   // "n"
    tone(v, { type: 'sawtooth', f: 200, f2: 2400, ft: 0.25, at: 0.7, a: 0.004, d: 0.25, g: 0.035, lp: 5000 });
    return 1.0;
  });
// the arena bed: the UV tubes' 120 Hz hum, a muffled 90s beat through the walls, far-off pews now and then. Waits in
// K.stageBeds; stages/lasertag.js adds it to K.beds (id 'lasertag').
K.stageBeds.lasertag = (ctx, bus) => {
  const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
  out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 2.5); out.connect(bus);
  const hb = K.filt(ctx, 'bandpass', 240, 1.4); hb.connect(out);
  [[120, 0.0035], [240, 0.0016], [360, 0.0008]].forEach(([f, g]) => { const o = ctx.createOscillator(), gn = K.gain(ctx, g); o.type = 'sawtooth'; o.frequency.value = f; o.connect(gn).connect(hb); o.start(now); srcs.push(o); });
  const lfo = ctx.createOscillator(), lg = K.gain(ctx, 60); lfo.frequency.value = 0.13; lfo.connect(lg).connect(hb.frequency); lfo.start(now); srcs.push(lfo);
  const lp = K.filt(ctx, 'lowpass', 300, 0.8); lp.connect(out);
  const STEP = 60 / 118 / 2;                                    // eighth notes at 118 BPM
  const kick = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.2); o.connect(g).connect(lp); o.start(t); o.stop(t + 0.22); };
  const snare = t => { const s = ctx.createBufferSource(), f = K.filt(ctx, 'bandpass', 900, 0.8), g = ctx.createGain(); s.buffer = K.noiseBuf(ctx, 'white');
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.12); s.connect(f).connect(g).connect(lp); s.start(t, Math.random()); s.stop(t + 0.14); };
  const pew = t => { const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, f0 = 1500 + Math.random() * 900;
    o.type = 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.25, t + 0.16);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.0025, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    const lf = K.filt(ctx, 'lowpass', 2200, 0.7); o.connect(lf).connect(g); if (p) { p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p).connect(out); } else g.connect(out); o.start(t); o.stop(t + 0.18); };
  let stopped = false, beatT = now + 0.6, step = 0, next = now + 1.5;
  return {
    tick(until) {
      if (stopped) return;
      if (beatT < ctx.currentTime - 0.5) beatT = ctx.currentTime + 0.1;
      while (beatT < until) { try { const s = step % 8; if (s === 0 || s === 3 || s === 4) kick(beatT); if (s === 2 || s === 6) snare(beatT); } catch (e) {} beatT += STEP; step++; }
      if (next < ctx.currentTime - 0.5) next = ctx.currentTime + 1;
      while (next < until) { try { pew(next); if (Math.random() < 0.4) pew(next + 0.12); } catch (e) {} next += 1.4 + Math.random() * 3.6; }
    },
    stop(fade = 1.5) {
      if (stopped) return; stopped = true;
      const t = ctx.currentTime, gp = out.gain;
      gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
      for (const x of srcs) { try { x.stop(t + fade + 0.1); } catch (e) {} }
      setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    }
  };
};
// ---------- SKEE BALL ----------
// a boardwalk arcade: wooden balls rumbling up the lanes, the ramp thunk, a ding per ring, the carnival bell, tickets
const wood = (v, f, at, g, d = 0.06) => {                     // a hollow wood-block knock: a resonant noise burst + a short sine body
  noise(v, { ft: 'bandpass', ff: f, q: 9, at, a: 0.001, d, g });
  tone(v, { f: f * 0.5, f2: f * 0.42, ft: d, at, a: 0.001, d: d * 1.2, g: g * 0.5 });
};
def('ballRoll', { max: 3, gap: 0.05, pv: 0.6, dv: 0.1, verb: 0.08, pri: 1, gain: 1 },
  v => {                                   // the clack of the release, then the low rumble of the roll (opts.d = its roll time)
    const d = K.clamp(+v.o.d || 1.2, 0.4, 2);
    wood(v, 1500, 0, 0.12, 0.04); wood(v, 1100, 0.035, 0.06, 0.04);
    noise(v, { kind: 'brown', ft: 'lowpass', ff: 520, ff2: 260, fft: d, at: 0.03, a: 0.06, hold: d * 0.55, d: d * 0.4, g: 0.16, nd: true });
    tone(v, { type: 'triangle', f: 70, f2: 52, ft: d, at: 0.03, a: 0.06, hold: d * 0.5, d: d * 0.4, g: 0.035, vib: [9, 0.06], nd: true });
    return d + 0.1;
  });
def('ballJump', { max: 3, gap: 0.05, pv: 0.8, dv: 0.1, verb: 0.1, pri: 1, gain: 4.5 },
  v => {                                   // the ramp lip: a thunk and a little airborne whoop
    tone(v, { f: 160, f2: 70, ft: 0.08, a: 0.002, d: 0.1, g: 0.18 });
    wood(v, 700, 0, 0.08, 0.05);
    noise(v, { ft: 'bandpass', ff: 900, ff2: 2600, fft: 0.2, q: 2, at: 0.03, a: 0.04, d: 0.18, g: 0.025 });
    return 0.3;
  });
def('pocket', { max: 3, gap: 0.04, pv: 0, dv: 0.05, verb: 0.25, pri: 2, gain: 3 },
  v => {                                   // into the hole: a hollow plunk + a bell ding, higher by ring (the 100: a double ding with sparkle)
    const ring = +v.o.ring || 10, n = ring >= 100 ? 9 : [10, 20, 30, 40, 50].indexOf(ring), f = 784 * st(Math.max(0, n) * 2);
    tone(v, { f: 220, f2: 110, ft: 0.07, a: 0.002, d: 0.09, g: 0.12 });
    K.bell(v, { f, at: 0.02, d: 0.5, g: 0.045, ratios: [1, 2.76, 5.4], amps: [1, 0.35, 0.12] });
    if (ring >= 100) { K.bell(v, { f: f * 1.5, at: 0.12, d: 0.6, g: 0.04, ratios: [1, 2.76], amps: [1, 0.3] }); K.pings(v, { n: 5, span: 0.3, at: 0.1, f: [3500, 6000], gmax: 0.03 }); }
    return 0.8;
  });
def('ballKick', { max: 2, gap: 0.04, pv: 0.6, dv: 0.08, verb: 0.15, pri: 3, gain: 11 },
  v => {                                   // a ball shot in the air: a fat wooden CLONK, a ricochet whizz up
    wood(v, 1250, 0, 0.2, 0.07); wood(v, 1850, 0.012, 0.12, 0.05);
    tone(v, { f: 300, f2: 150, ft: 0.06, a: 0.001, d: 0.08, g: 0.12 });
    tone(v, { type: 'triangle', f: 900, f2: 2400, ft: 0.18, at: 0.04, a: 0.01, d: 0.16, g: 0.03 });
    return 0.35;
  });
def('shuffleBell', { max: 1, cool: 0.8, pv: 0, dv: 0.03, verb: 0.3, pri: 3, gain: 2.5 },
  v => {                                   // the carnival bell: ding-ding-ding (opts.wave: a longer ring) + a relay whirr as the lights change
    const n = v.o.wave ? 4 : 3;
    for (let k = 0; k < n; k++) K.bell(v, { f: 1318, at: k * 0.11, d: 0.35, g: 0.05, ratios: [1, 2.4, 3.9, 5.6], amps: [1, 0.5, 0.25, 0.1] });
    for (let k = 0; k < 6; k++) noise(v, { ft: 'bandpass', ff: 2400, q: 5, at: 0.05 + k * 0.07, d: 0.02, g: 0.03, nd: true });
    return 0.9;
  });
def('ticketSpray', { max: 1, pv: 0, dv: 0.05, verb: 0.2, pri: 3, gain: 2.5 },
  v => {                                   // the dispensers run wild: a motor whirr under a flutter of paper ticks for ~2 s
    tone(v, { type: 'sawtooth', f: 95, f2: 120, ft: 0.4, a: 0.1, hold: 1.6, d: 0.4, g: 0.02, lp: 700, np: true });
    K.grains(v, { n: 70, span: 2.1, f: [2500, 6500], q: 3, d: [0.004, 0.012], g: [0.04, 0.12], kind: 'white' });
    return 2.3;
  });
def('jackpot', { max: 1, cool: 0.6, pv: 0, dv: 0.03, verb: 0.3, pri: 4, gain: 2.5 },
  v => {                                   // JACKPOT: a rising chiptune arpeggio, a bell on top
    const w = K.pulse(v.ctx, 0.25);
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(v, { wave: w, f: 523 * st(n), at: i * 0.055, a: 0.003, hold: 0.03, d: 0.08, g: 0.035, lp: 5000, np: true }));
    K.bell(v, { f: 2093, at: 0.38, d: 0.7, g: 0.05, ratios: [1, 2.76, 5.4], amps: [1, 0.3, 0.1] });
    return 1.1;
  });
// the boardwalk bed: an arcade murmur, the bulbs' buzz, the surf outside, a far skee ball now and then. Waits in
// K.stageBeds; stages/skeeball.js adds it to K.beds (id 'skeeball').
K.stageBeds.skeeball = (ctx, bus) => {
  const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
  out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 2.5); out.connect(bus);
  const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; param.value = base; o.connect(gn).connect(param); o.start(now); srcs.push(o); };
  const loop = (kind, type, f, q, g) => { const s = ctx.createBufferSource(), fl = K.filt(ctx, type, f, q), gn = K.gain(ctx, g); s.buffer = K.noiseBuf(ctx, kind); s.loop = true; s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s); return { f: fl, g: gn }; };
  const crowd = loop('pink', 'bandpass', 700, 1.6, 0.012); lfo(0.21, 0.004, crowd.g.gain, 0.012);
  const surf = loop('brown', 'lowpass', 420, 0.7, 0.022); lfo(0.085, 0.016, surf.g.gain, 0.022); lfo(0.085, 160, surf.f.frequency, 420);
  const bz = K.filt(ctx, 'bandpass', 360, 2); bz.connect(out);
  [[120, 0.0022], [240, 0.0012]].forEach(([f, g]) => { const o = ctx.createOscillator(), gn = K.gain(ctx, g); o.type = 'sawtooth'; o.frequency.value = f; o.connect(gn).connect(bz); o.start(now); srcs.push(o); });
  const far = t => {                       // a far lane: a rumble, a plunk, sometimes a ding
    const s = ctx.createBufferSource(), f = K.filt(ctx, 'lowpass', 380, 0.7), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    g.gain.value = 0; s.buffer = K.noiseBuf(ctx, 'brown'); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02, t + 0.15); g.gain.linearRampToValueAtTime(0, t + 1.1);
    s.connect(f).connect(g); if (p) { p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p).connect(out); } else g.connect(out); s.start(t, Math.random()); s.stop(t + 1.2);
    if (Math.random() < 0.6) { const o = ctx.createOscillator(), og = ctx.createGain(); og.gain.value = 0; o.frequency.value = 784 * Math.pow(2, (Math.floor(Math.random() * 5) * 2) / 12);
      og.gain.setValueAtTime(0, t + 1.15); og.gain.linearRampToValueAtTime(0.004, t + 1.152); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(og).connect(p || out); o.start(t + 1.15); o.stop(t + 1.65); }
  };
  let stopped = false, next = now + 2;
  return {
    tick(until) { if (stopped) return; if (next < ctx.currentTime - 0.5) next = ctx.currentTime + 1; while (next < until) { try { far(next); } catch (e) {} next += 2.5 + Math.random() * 5; } },
    stop(fade = 1.5) {
      if (stopped) return; stopped = true;
      const t = ctx.currentTime, gp = out.gain;
      gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
      for (const x of srcs) { try { x.stop(t + fade + 0.1); } catch (e) {} }
      setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    }
  };
};
})(window.BLAM);
