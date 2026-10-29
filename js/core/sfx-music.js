'use strict';
/* B.L.A.M. core/sfx-music.js -- jingles (clear / fail / game over / records / versus), the title-menu chiptune loop
   and the quiet ambience bed per stage. Recipes only; audio.js starts / stops the loop and the beds. */
window.BLAM = window.BLAM || {};
(function (B) {
const K = B.SFXKit; if (!K) return;
const def = K.def, tone = K.tone, noise = K.noise, nf = K.nf;
// seq: play a note list [['C5', beats], ['r', beats], ...] at bpm; o: at, wave | type, g, lp, hold (fraction), vib, oct
const seq = (v, notes, o) => {
  const beat = 60 / (o.bpm || 150); let t = o.at || 0;
  for (const [n, b] of notes) {
    const len = b * beat;
    if (n !== 'r') tone(v, { wave: o.wave, type: o.type, f: nf(n) * (o.oct || 1), at: t, a: o.a || 0.005, hold: len * (o.hold || 0.7), d: o.d || 0.06, g: o.g || 0.08, lp: o.lp, vib: o.vib, np: true, nd: true });
    t += len;
  }
  return t;
};
const splash = (v, at, g = 0.06, d = 0.9) => noise(v, { hp: 5000, at, a: 0.005, d, g, nd: true });
const J = { pv: 0, dv: 0, verb: 0.22, pri: 4, max: 1 };

def('stageClear', J,
  v => {                                   // ta-da-da-DAAA (major arpeggio, held top with vibrato)
    const w = K.pulse(v.ctx, 0.25);
    const e = seq(v, [['G5', 0.5], ['C6', 0.5], ['E6', 0.5], ['G6', 0.5]], { bpm: 220, wave: w, g: 0.08, lp: 7000 });
    tone(v, { wave: w, f: nf('C7'), at: e, a: 0.01, hold: 0.45, d: 0.3, g: 0.08, vib: [6, 0.008], lp: 7000, np: true, nd: true });
    seq(v, [['C4', 0.5], ['G4', 0.5], ['C5', 0.5], ['E5', 0.5]], { bpm: 220, type: 'triangle', g: 0.16 });
    tone(v, { type: 'triangle', f: nf('C5'), at: e, a: 0.01, hold: 0.45, d: 0.3, g: 0.16, np: true, nd: true });
    splash(v, e); K.bell(v, { f: nf('G6'), at: e, d: 0.8, g: 0.06, np: true, nd: true });
    return e + 1.0;
  },
  v => {                                   // run up the scale, then a two-chord "ta-DAA"
    const w = K.pulse(v.ctx, 0.25);
    let e = seq(v, [['C6', 0.25], ['D6', 0.25], ['E6', 0.25], ['F6', 0.25], ['G6', 0.5], ['r', 0.25], ['E6', 0.25]], { bpm: 200, wave: w, g: 0.075, lp: 7000 });
    tone(v, { wave: w, f: nf('G6'), at: e, a: 0.01, hold: 0.5, d: 0.3, g: 0.08, vib: [6, 0.008], lp: 7000, np: true, nd: true });
    tone(v, { wave: K.pulse(v.ctx, 0.5), f: nf('C6'), at: e, a: 0.01, hold: 0.5, d: 0.3, g: 0.04, lp: 5000, np: true, nd: true });
    seq(v, [['C4', 1], ['G3', 1], ['F3', 0.5]], { bpm: 200, type: 'triangle', g: 0.16 });
    tone(v, { type: 'triangle', f: nf('C4'), at: e, a: 0.01, hold: 0.5, d: 0.3, g: 0.16, np: true, nd: true });
    splash(v, e); return e + 1.0;
  });
def('stageFail', J,
  v => {                                   // sad trombone: wah wah wah waaah
    const N = ['G3', 'F#3', 'F3', 'E3'];
    N.forEach((n, i) => {
      const last = i === 3, at = i * 0.34, len = last ? 0.9 : 0.26;
      tone(v, { type: 'sawtooth', f: nf(n), at, a: 0.03, hold: len, d: last ? 0.3 : 0.06, g: 0.12, ft: 'lowpass', ff: 350, ff2: 1500, fft: len * 0.6, q: 4, vib: last ? [5, 0.02] : null, np: true, nd: true });
    });
    return 1.02 + 1.3;
  },
  v => {                                   // chiptune: down the scale, sagging at the end
    const w = K.pulse(v.ctx, 0.125);
    const e = seq(v, [['E5', 1], ['D5', 1], ['C5', 1]], { bpm: 170, wave: w, g: 0.08, lp: 5000 });
    tone(v, { wave: w, f: nf('B4'), f2: nf('A4'), ft: 0.8, at: e, a: 0.01, hold: 0.5, d: 0.35, g: 0.08, vib: [5, 0.015], lp: 5000, np: true, nd: true });
    seq(v, [['A3', 1], ['G3', 1], ['F3', 1]], { bpm: 170, type: 'triangle', g: 0.16 });
    tone(v, { type: 'triangle', f: nf('E3'), at: e, a: 0.01, hold: 0.5, d: 0.35, g: 0.16, np: true, nd: true });
    return e + 1.0;
  });
def('gameOver', J,
  v => {                                   // slow minor descent
    const w = K.pulse(v.ctx, 0.25);
    const e = seq(v, [['A4', 1], ['E4', 1], ['C4', 1], ['B3', 0.5], ['r', 0.5]], { bpm: 110, wave: w, g: 0.075, lp: 4000, hold: 0.8, d: 0.15, vib: [5, 0.01] });
    tone(v, { wave: w, f: nf('A3'), at: e, a: 0.02, hold: 0.6, d: 0.6, g: 0.075, lp: 3000, vib: [4, 0.015], np: true, nd: true });
    seq(v, [['A2', 2], ['F2', 2]], { bpm: 110, type: 'triangle', g: 0.18, hold: 0.85, d: 0.2 });
    tone(v, { type: 'triangle', f: nf('A2'), at: e, a: 0.02, hold: 0.6, d: 0.6, g: 0.18, np: true, nd: true });
    return e + 1.4;
  });
def('continue', { ...J, verb: 0.15 },
  v => {                                   // coin: ka-ching
    const w = K.pulse(v.ctx, 0.5);
    tone(v, { wave: w, f: nf('B5'), hold: 0.06, d: 0.02, g: 0.07, lp: 8000, np: true, nd: true });
    tone(v, { wave: w, f: nf('E6'), at: 0.08, hold: 0.25, d: 0.25, g: 0.07, lp: 8000, np: true, nd: true });
    K.bell(v, { f: nf('E7'), at: 0.08, d: 0.5, g: 0.05, np: true, nd: true });
    return 0.7;
  });
def('courseClear', J,
  v => {                                   // the big one: ta-ta-ta-TAAA, ta-ta-TAAAA
    const w = K.pulse(v.ctx, 0.25), w2 = K.pulse(v.ctx, 0.5);
    let e = seq(v, [['G5', 0.5], ['G5', 0.5], ['G5', 0.5], ['C6', 1.5], ['A5', 0.5], ['B5', 0.5], ['C6', 0.5]], { bpm: 190, wave: w, g: 0.075, lp: 7000 });
    seq(v, [['E5', 0.5], ['E5', 0.5], ['E5', 0.5], ['G5', 1.5], ['F5', 0.5], ['G5', 0.5], ['A5', 0.5]], { bpm: 190, wave: w2, g: 0.04, lp: 5000 });
    tone(v, { wave: w, f: nf('E6'), at: e, a: 0.01, hold: 0.8, d: 0.45, g: 0.08, vib: [6, 0.008], lp: 7000, np: true, nd: true });
    tone(v, { wave: w2, f: nf('C6'), at: e, a: 0.01, hold: 0.8, d: 0.45, g: 0.04, lp: 5000, np: true, nd: true });
    seq(v, [['C3', 1.5], ['C4', 1.5], ['F3', 0.5], ['G3', 0.5], ['A3', 0.5]], { bpm: 190, type: 'triangle', g: 0.17 });
    tone(v, { type: 'triangle', f: nf('C4'), at: e, a: 0.01, hold: 0.8, d: 0.45, g: 0.17, np: true, nd: true });
    splash(v, 0.95, 0.05); splash(v, e, 0.07, 1.4);
    [nf('C7'), nf('E7'), nf('G7')].forEach((f, i) => K.bell(v, { f, at: e + i * 0.07, d: 1.0, g: 0.045, np: true, nd: true }));
    return e + 1.6;
  });
def('newRecord', { ...J, delay: (o, since) => (since('courseClear') < 0.1 ? 2.6 : since('stageClear') < 0.1 ? 1.5 : 0) },
  v => {                                   // sparkly climbing arpeggio + bells
    const w = K.pulse(v.ctx, 0.125), N = ['C6', 'E6', 'G6', 'C7', 'E7', 'G7'];
    N.forEach((n, i) => {
      tone(v, { wave: w, f: nf(n), at: i * 0.06, hold: 0.03, d: 0.1, g: 0.06, lp: 9000, np: true, nd: true });
      K.bell(v, { f: nf(n), at: i * 0.06 + 0.12, d: 0.3, g: 0.03, ratios: [1, 2.76], amps: [1, 0.3], np: true, nd: true });
    });
    K.pings(v, { n: 8, at: 0.3, span: 0.6, f: [4000, 8000], gmax: 0.035 });
    return 1.1;
  });
def('vsJoin', { ...J, verb: 0.12 },
  v => { const w = K.pulse(v.ctx, 0.25); tone(v, { wave: w, f: nf('C6'), hold: 0.05, d: 0.05, g: 0.07, lp: 7000, np: true }); tone(v, { wave: w, f: nf('G6'), at: 0.09, hold: 0.08, d: 0.12, g: 0.07, lp: 7000, np: true }); return 0.35; });
def('vsLeave', { ...J, verb: 0.12 },
  v => { const w = K.pulse(v.ctx, 0.25); tone(v, { wave: w, f: nf('G5'), hold: 0.05, d: 0.05, g: 0.07, lp: 6000, np: true }); tone(v, { wave: w, f: nf('C5'), at: 0.09, hold: 0.08, d: 0.15, g: 0.07, lp: 6000, np: true }); return 0.4; });
def('vsWin', J,
  v => {                                   // winner: quick triumphant "da-da-da-DAAA" with a cymbal
    const w = K.pulse(v.ctx, 0.25);
    const e = seq(v, [['C6', 0.33], ['C6', 0.33], ['C6', 0.34], ['G6', 1]], { bpm: 160, wave: w, g: 0.075, lp: 7000 });
    seq(v, [['E5', 0.33], ['E5', 0.33], ['E5', 0.34], ['B5', 1]], { bpm: 160, wave: K.pulse(v.ctx, 0.5), g: 0.04, lp: 5000 });
    tone(v, { wave: w, f: nf('C7'), at: e, a: 0.01, hold: 0.5, d: 0.35, g: 0.08, vib: [6, 0.008], lp: 7000, np: true, nd: true });
    seq(v, [['C4', 1], ['G3', 1]], { bpm: 160, type: 'triangle', g: 0.17 });
    tone(v, { type: 'triangle', f: nf('C4'), at: e, a: 0.01, hold: 0.5, d: 0.35, g: 0.17, np: true, nd: true });
    splash(v, e); return e + 1.0;
  });
def('vsLose', J,
  v => {                                   // loser: wobbly descending pair
    const w = K.pulse(v.ctx, 0.125);
    const e = seq(v, [['D5', 1], ['C#5', 1]], { bpm: 150, wave: w, g: 0.075, lp: 4500 });
    tone(v, { wave: w, f: nf('C5'), f2: nf('A4'), ft: 0.9, at: e, a: 0.01, hold: 0.5, d: 0.4, g: 0.075, vib: [5, 0.02], lp: 4500, np: true, nd: true });
    seq(v, [['G3', 1], ['F#3', 1]], { bpm: 150, type: 'triangle', g: 0.16 });
    tone(v, { type: 'triangle', f: nf('F3'), at: e, a: 0.01, hold: 0.5, d: 0.4, g: 0.16, np: true, nd: true });
    return e + 1.0;
  });

// ---------- a note-player voice for the loop and the beds (no random pitch / decay) ----------
const R = (a, b) => a + Math.random() * (b - a);
const pvoice = (ctx, out, t) => ({ ctx, out, t, p: 1, d: 1, r: R, pick: a => a[Math.floor(Math.random() * a.length)], chance: p => Math.random() < p, o: {} });

// ---------- title-menu chiptune: 16 bars, A minor, 128 bpm, pulse lead + triangle bass (+ a soft echo on the lead) ----------
const LEAD = [
  'E5 - A5 - C6 - B5 A5', 'C6 - A5 - F5 - A5 C6', 'E6 - D6 - C6 - G5 -', 'D6 - B5 - G5 - - .',
  'A5 C6 E6 - D6 C6 B5 C6', 'A5 - - F5 A5 C6 F6 -', 'E6 - D6 - C6 - G5 E5', 'G5 - B5 - D6 - B5 .',
  'A5 - C6 - F6 - E6 -', 'D6 - B5 - G5 - D6 -', 'E6 - B5 - G5 - B5 E6', 'C6 - - - A5 - . .',
  'F5 A5 C6 F6 E6 - C6 -', 'D6 - G6 - F6 - D6 -', 'E6 - G#5 - B5 - E6 -', 'G#5 - B5 - D6 - E6 .'
].join(' ').split(' ');
const BASS = ['A2', 'F2', 'C3', 'G2', 'A2', 'F2', 'C3', 'G2', 'F2', 'G2', 'E2', 'A2', 'F2', 'G2', 'E2', 'E2'];
const BPAT = [[1, 2, 1, 2, 1, 2, 1, 2], [1, 1, 2, 1, 1, 2, 1, 2]];
K.music = {
  bpm: 128, bars: 16,
  start(ctx, bus) {
    const now = ctx.currentTime, E = 60 / K.music.bpm / 2, out = ctx.createGain(), lead = ctx.createGain(), echo = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 0.8); out.connect(bus);
    lead.connect(out); lead.connect(echo); echo.delayTime.value = E * 3; fb.gain.value = 0.28; wet.gain.value = 0.22;
    echo.connect(fb).connect(echo); echo.connect(wet).connect(out);
    const pw = K.pulse(ctx, 0.25), pw2 = K.pulse(ctx, 0.125);
    let step = 0, next = now + 0.12, stopped = false;
    function schedule(i, t) {
      const tok = LEAD[i], bar = i >> 3, k = i & 7;
      if (tok !== '-' && tok !== '.') {
        let j = i + 1; while (j < LEAD.length && LEAD[j] === '-') j++;
        const len = (j - i) * E;
        tone(pvoice(ctx, lead, t), { wave: bar >= 8 ? pw2 : pw, f: nf(tok), a: 0.004, hold: Math.max(0.02, len - 0.07), d: 0.06, g: 0.06, lp: 5000, vib: len > 0.4 ? [5.5, 0.006] : null });
      }
      const m = BPAT[bar >= 8 ? 1 : 0][k];
      tone(pvoice(ctx, out, t), { type: 'triangle', f: nf(BASS[bar]) * m, a: 0.004, hold: E * 0.5, d: 0.04, g: 0.17 });
    }
    return {
      tick(until) {
        if (stopped) return;
        if (next < ctx.currentTime - 0.1) next = ctx.currentTime + 0.05;          // the clock jumped (tab came back): no burst of catch-up notes
        while (next < until) { schedule(step, next); step = (step + 1) % LEAD.length; next += E; }
      },
      stop(fade = 0.5) {
        if (stopped) return; stopped = true;
        const t = ctx.currentTime, gp = out.gain;
        gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
        setTimeout(() => { try { out.disconnect(); fb.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
      }
    };
  }
};

// ---------- ambience beds: looping filtered noise + slow LFOs + sparse random events; very quiet ----------
function bed(ctx, bus, level, build) {
  const now = ctx.currentTime, out = ctx.createGain(), srcs = [];
  out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(level, now + 2.5); out.connect(bus);
  const loop = (kind, type, f, q, g, rate = 1) => {
    const s = ctx.createBufferSource(), fl = K.filt(ctx, type, f, q), gn = K.gain(ctx, g);
    s.buffer = K.noiseBuf(ctx, kind); s.loop = true; s.playbackRate.value = rate;
    s.connect(fl).connect(gn).connect(out); s.start(now, Math.random() * 1.5); srcs.push(s);
    return { f: fl, g: gn };
  };
  const hum = (f, g, type = 'sine') => { const o = ctx.createOscillator(), gn = K.gain(ctx, g); o.type = type; o.frequency.value = f; o.connect(gn).connect(out); o.start(now); srcs.push(o); return gn; };
  const lfo = (rate, depth, param, base) => {
    const o = ctx.createOscillator(), gn = K.gain(ctx, depth); o.frequency.value = rate; if (base != null) param.value = base;
    o.connect(gn).connect(param); o.start(now, 0); srcs.push(o); return o;
  };
  const events = build({ loop, hum, lfo, out });
  const next = events.map(e => now + R(e.every[0] * 0.3, e.every[1]));
  let stopped = false;
  return {
    tick(until) {
      if (stopped) return;
      const t0 = ctx.currentTime;
      events.forEach((e, i) => {
        if (next[i] < t0 - 0.5) next[i] = t0 + R(0.2, e.every[0]);
        while (next[i] < until) { try { e.fn(pvoice(ctx, out, next[i])); } catch (er) {} next[i] += R(e.every[0], e.every[1]); }
      });
    },
    stop(fade = 1.5) {
      if (stopped) return; stopped = true;
      const t = ctx.currentTime, gp = out.gain;
      gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0, t + fade);
      for (const s of srcs) { try { s.stop(t + fade + 0.1); } catch (e) {} }
      setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    }
  };
}
K.beds = {
  range: (ctx, bus) => bed(ctx, bus, 1, ({ loop, hum, lfo }) => {     // indoor range: room hum, air handling, a far lane popping off
    hum(60, 0.006); hum(120, 0.004); hum(180, 0.0015, 'triangle');
    const air = loop('brown', 'lowpass', 320, 0.7, 0.07);
    lfo(0.11, 0.015, air.g.gain, 0.07);
    return [{ every: [2.5, 7], fn: v => {
      const n = v.chance(0.3) ? 3 : 1;
      for (let k = 0; k < n; k++) { const at = k * R(0.18, 0.3); noise(v, { ft: 'lowpass', ff: 1300, at, d: 0.08, g: 0.035 }); tone(v, { f: 120, f2: 50, ft: 0.06, at, d: 0.07, g: 0.025 }); }
    } }];
  }),
  alley: (ctx, bus) => bed(ctx, bus, 1, ({ loop, lfo }) => {          // city night: traffic rumble, distant hiss, horns, a siren, a dog
    const traffic = loop('brown', 'lowpass', 380, 0.8, 0.09);
    lfo(0.07, 160, traffic.f.frequency, 380); lfo(0.05, 0.03, traffic.g.gain, 0.09);
    loop('pink', 'highpass', 2500, 0.7, 0.004);
    return [
      { every: [9, 20], fn: v => { const f = v.pick([370, 415, 330]); tone(v, { type: 'square', f, hold: R(0.15, 0.4), d: 0.08, g: 0.01, lp: 900, np: true }); tone(v, { type: 'square', f: f * 1.19, hold: R(0.15, 0.4), d: 0.08, g: 0.008, lp: 900, np: true }); } },
      { every: [25, 50], fn: v => { tone(v, { f: 650, fs: [[0.6, 900], [1.2, 650], [1.8, 900], [2.4, 650]], a: 0.5, hold: 1.2, d: 0.8, g: 0.009, lp: 1500, np: true }); } },
      { every: [14, 30], fn: v => { for (let k = 0; k < (v.chance(0.5) ? 2 : 1); k++) K.voice(v, { type: 'sawtooth', f: 330, fs: [[0.06, 260]], at: k * 0.22, a: 0.01, d: 0.08, g: 0.03, formants: [[600, 4, 1], [1300, 6, 0.4]], lp: 1200 }); } }
    ];
  }),
  boneyard: (ctx, bus) => bed(ctx, bus, 2, ({ loop, lfo }) => {       // wind through the graves, drips, an owl
    const wind = loop('pink', 'bandpass', 600, 1.4, 0.07);
    lfo(0.06, 300, wind.f.frequency, 600); lfo(0.09, 0.03, wind.g.gain, 0.07);
    const whistle = loop('white', 'bandpass', 1700, 9, 0.012);
    lfo(0.045, 400, whistle.f.frequency, 1700); lfo(0.13, 0.008, whistle.g.gain, 0.012);
    return [
      { every: [1.2, 4], fn: v => { const f = R(1300, 2200); tone(v, { f, f2: f * 1.8, ft: 0.03, d: 0.04, g: 0.022, np: true }); tone(v, { f, f2: f * 1.8, ft: 0.03, at: 0.19, d: 0.04, g: 0.007, np: true }); } },
      { every: [15, 30], fn: v => { [0, 0.35, 0.55].forEach((at, k) => tone(v, { f: k ? 380 : 420, f2: k ? 350 : 400, at, a: 0.03, d: k === 2 ? 0.4 : 0.18, g: 0.018, lp: 800, np: true })); } }
    ];
  }),
  skyshow: (ctx, bus) => bed(ctx, bus, 1, ({ loop, lfo }) => {        // a crowd murmuring by the water
    [[320, 0.035, 0.31], [700, 0.022, 0.47], [1150, 0.012, 0.73]].forEach(([f, g, r]) => { const c = loop('pink', 'bandpass', f, 2.5, g); lfo(r, g * 0.5, c.g.gain, g); });
    const water = loop('brown', 'lowpass', 520, 0.8, 0.06);
    lfo(0.23, 0.04, water.g.gain, 0.06); lfo(0.17, 150, water.f.frequency, 520);
    return [
      { every: [8, 18], fn: v => { [[500, 1], [1200, 0.5]].forEach(([f, g]) => noise(v, { kind: 'pink', ft: 'bandpass', ff: f, ff2: f * 1.3, q: 3, a: 0.4, hold: 0.3, d: 0.8, g: 0.035 * g })); } },   // "ooooh"
      { every: [20, 45], fn: v => { tone(v, { type: 'sawtooth', f: 98, a: 0.2, hold: 1.2, d: 0.6, g: 0.012, lp: 320, np: true }); } }                                                            // far boat horn
    ];
  })
};
})(window.BLAM);
