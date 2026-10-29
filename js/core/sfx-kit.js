'use strict';
/* =========================================================================================
   B.L.A.M. core/sfx-kit.js -- WebAudio synthesis primitives + the core gameplay sounds.
   No sound files: every sound is built from oscillators, noise buffers, filters and envelopes.

   A sound = BLAM.SFXKit.def(name, cfg, ...variants). Each variant is fn(v) that schedules nodes into v.out
   (the voice gain; the router in audio.js adds pan / reverb send / voice limit / volume) and returns its
   length in seconds. v = { ctx, out, t (start time), o (play opts), p (pitch mult, random), d (decay mult,
   random), r(lo, hi), pick(arr), chance(p), stage (current stage id or ''), i (variant index) }.
   cfg: max (voices, newest wins), gap (s: plays closer than this are flams: quieter, then dropped after
   flamMax), gain, pv (pitch variance in semitones), dv (decay variance, fraction), verb (reverb send),
   pan (stereo spread mult), pri (0 = first to drop when busy), delay(o) (s), cool (s between plays),
   chance(o) (probability to play at all), pick(v, n) (choose the variant yourself; default: round robin,
   never the same one twice in a row).
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const K = B.SFXKit = B.SFXKit || {};
K.lib = K.lib || {};
K.def = (name, cfg, ...variants) => { K.lib[name] = Object.assign({ max: 3, gap: 0.02, flamMax: 2, gain: 1, pv: 0.6, dv: 0.12, verb: 0.08, pan: 1, pri: 1 }, cfg, { v: variants }); };
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
K.clamp = clamp;
K.st = n => Math.pow(2, n / 12);                        // semitones -> ratio
K.hz = midi => 440 * Math.pow(2, (midi - 69) / 12);     // MIDI note -> Hz
// note name ('A4', 'C#5', 'Bb3') -> MIDI
const NN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
K.midi = s => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) return 60; return NN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12; };
K.nf = s => K.hz(K.midi(s));

// ---------- per-context caches (works for the live AudioContext and for OfflineAudioContext renders) ----------
const caches = new WeakMap();
const cache = ctx => { let m = caches.get(ctx); if (!m) caches.set(ctx, m = {}); return m; };
// 2 s noise buffers: white, pink (Kellet), brown (leaky integrator), crackle (sparse random impulses)
K.noiseBuf = (ctx, kind = 'white') => {
  const m = cache(ctx), key = 'n_' + kind;
  if (m[key]) return m[key];
  const n = Math.floor(ctx.sampleRate * 2), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, pk = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    } else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last; }
    else if (kind === 'crackle') d[i] = Math.random() < 0.0016 ? (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6) : 0;
    else d[i] = w;
    pk = Math.max(pk, Math.abs(d[i]));
  }
  if (pk > 0) for (let i = 0; i < n; i++) d[i] /= pk;
  return (m[key] = b);
};
// soft saturation curve tanh(k x) / tanh(k), cached per amount
K.shaper = (ctx, k = 2) => {
  const m = cache(ctx), key = 'sh_' + k;
  let curve = m[key];
  if (!curve) { curve = new Float32Array(1024); const nk = Math.tanh(k); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(k * x) / nk; } m[key] = curve; }
  const ws = ctx.createWaveShaper(); ws.curve = curve; ws.oversample = '2x';
  return ws;
};
// band-limited pulse wave (duty 0..1), for chiptune leads
K.pulse = (ctx, duty = 0.25) => {
  const m = cache(ctx), key = 'pw_' + duty;
  if (m[key]) return m[key];
  const N = 40, re = new Float32Array(N), im = new Float32Array(N);
  for (let h = 1; h < N; h++) im[h] = (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty);
  return (m[key] = ctx.createPeriodicWave(re, im));
};
// short exponentially decaying stereo noise impulse response (the shared reverb)
K.impulse = (ctx, secs = 1.3, decay = 3.2) => {
  const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) { const x = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, decay) * (i < 90 ? i / 90 : 1); }
  }
  return b;
};

// ---------- node helpers ----------
// envelope: 0 -> peak (linear, a s) -> hold -> exponential decay to silence over d s
K.env = (p, t, a, peak, d, hold = 0) => {
  peak = Math.max(peak, 1e-4);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) p.setValueAtTime(peak, t + a + hold);
  p.exponentialRampToValueAtTime(1e-4, t + a + hold + d);
  p.setValueAtTime(0, t + a + hold + d + 0.001);
};
K.filt = (ctx, type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = clamp(f, 10, 22000); b.Q.value = q; return b; };
K.gain = (ctx, g = 1) => { const n = ctx.createGain(); n.gain.value = g; return n; };
// frequency glide: exponential from f to f2 over ft s (starting at t)
const glide = (prm, t, f, f2, ft, lin) => {
  prm.setValueAtTime(clamp(f, 1, 22000), t);
  if (f2 != null) { if (lin) prm.linearRampToValueAtTime(clamp(f2, 1, 22000), t + ft); else prm.exponentialRampToValueAtTime(clamp(f2, 1, 22000), t + ft); }
};
// a filter chain on an output: o.ft / o.ff / o.q (+ o.ff2 sweep over o.fft), o.hp (extra high-pass), o.lp (extra low-pass)
function chain(ctx, o, t, d, dest) {
  let node = dest;
  if (o.lp) { const f = K.filt(ctx, 'lowpass', o.lp, 0.7); f.connect(node); node = f; }
  if (o.hp) { const f = K.filt(ctx, 'highpass', o.hp, 0.7); f.connect(node); node = f; }
  if (typeof o.ft === 'string') {               // (a number in o.ft is tone()'s glide time, not a filter)
    const f = K.filt(ctx, o.ft, o.ff || 1000, o.q != null ? o.q : 0.7);
    glide(f.frequency, t, o.ff || 1000, o.ff2, o.fft != null ? o.fft : d);
    f.connect(node); node = f;
  }
  if (o.drive) { const s = K.shaper(ctx, o.drive); s.connect(node); node = s; }
  return node;
}
/* tone(v, o): one oscillator voice.
   o: type | wave (PeriodicWave), f, f2 (glide to), ft (glide time, default d), lin, fs ([[dt, f], ...] extra points),
      at (offset s), a, d, hold, g (peak), np (no random pitch), vib [rate, depth (fraction)], detune (cents),
      filter opts (see chain), to (dest node). Returns the oscillator. */
K.tone = (v, o) => {
  const c = v.ctx, t = v.t + (o.at || 0), a = o.a != null ? o.a : 0.002, d = Math.max(0.005, (o.d || 0.2) * (o.nd ? 1 : v.d)), hold = o.hold || 0;
  const pm = o.np ? 1 : v.p, os = c.createOscillator();
  if (o.wave) os.setPeriodicWave(o.wave); else os.type = o.type || 'sine';
  glide(os.frequency, t, o.f * pm, o.f2 != null ? o.f2 * pm : null, typeof o.ft === 'number' ? o.ft : a + hold + d, o.lin);
  if (o.fs) for (const [dt, f] of o.fs) os.frequency.exponentialRampToValueAtTime(clamp(f * pm, 1, 22000), t + dt);
  if (o.detune) os.detune.value = o.detune;
  const end = t + a + hold + d + 0.03;
  if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.f * pm * o.vib[1]; l.connect(lg).connect(os.frequency); l.start(t); l.stop(end); }
  const g = c.createGain(); K.env(g.gain, t, a, o.g != null ? o.g : 0.4, d, hold);
  os.connect(chain(c, o, t, a + hold + d, g)); g.connect(o.to || v.out);
  os.start(t); os.stop(end);
  return os;
};
/* noise(v, o): one filtered noise burst. o: kind (white|pink|brown|crackle), rate (playback rate), at, a, d, hold, g,
   filter opts (ft/ff/ff2/fft/q, hp, lp, drive), to. */
K.noise = (v, o) => {
  const c = v.ctx, t = v.t + (o.at || 0), a = o.a != null ? o.a : 0.001, d = Math.max(0.005, (o.d || 0.1) * (o.nd ? 1 : v.d)), hold = o.hold || 0;
  const s = c.createBufferSource(); s.buffer = K.noiseBuf(c, o.kind || 'white'); s.playbackRate.value = o.rate || 1;
  if (o.loop) s.loop = true;
  const g = c.createGain(); K.env(g.gain, t, a, o.g != null ? o.g : 0.4, d, hold);
  s.connect(chain(c, o, t, a + hold + d, g)); g.connect(o.to || v.out);
  s.start(t, Math.random() * 1.2); s.stop(t + a + hold + d + 0.03);
  return s;
};
// bell / plate: inharmonic partials, the higher ones shorter. o: f, d, g, at, ratios, amps, type, to
K.bell = (v, o) => {
  const R = o.ratios || [1, 2.76, 5.4, 8.93], A = o.amps || [1, 0.5, 0.25, 0.12];
  for (let i = 0; i < R.length; i++) K.tone(v, { type: o.type || 'sine', f: o.f * R[i], at: o.at, a: o.a || 0.001, d: o.d / (1 + i * (o.damp != null ? o.damp : 0.7)), g: (o.g || 0.3) * A[i], to: o.to, np: o.np, nd: o.nd });
  return o.d + (o.at || 0);
};
// FM pair (metallic tink / clang / bonk). o: f, ratio, index (mod depth as a fraction of f), id (index decay s), d, g, at, f2, to
K.fm = (v, o) => {
  const c = v.ctx, t = v.t + (o.at || 0), pm = o.np ? 1 : v.p, f = o.f * pm, d = (o.d || 0.3) * (o.nd ? 1 : v.d);
  const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
  car.frequency.setValueAtTime(f, t); mod.frequency.setValueAtTime(f * (o.ratio || 1.4), t);
  if (o.f2) { car.frequency.exponentialRampToValueAtTime(o.f2 * pm, t + d); mod.frequency.exponentialRampToValueAtTime(o.f2 * pm * (o.ratio || 1.4), t + d); }
  mg.gain.setValueAtTime(f * (o.index || 2), t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.02), t + (o.id || d * 0.5));
  mod.connect(mg).connect(car.frequency);
  K.env(g.gain, t, o.a || 0.001, o.g || 0.3, d);
  car.connect(g).connect(o.to || v.out);
  car.start(t); mod.start(t); car.stop(t + d + 0.05); mod.stop(t + d + 0.05);
  return d + (o.at || 0);
};
// grains: n tiny filtered noise ticks spread over `span` s (glass, rattle, crackle). o: n, span, at, f [lo, hi], q, d [lo, hi],
//   g [lo, hi], kind, curve (>1 bunches them at the start), to
K.grains = (v, o) => {
  const n = o.n || 10, span = o.span || 0.3, F = o.f || [2000, 6000], D = o.d || [0.008, 0.03], G = o.g || [0.1, 0.3];
  for (let i = 0; i < n; i++) {
    const x = Math.pow(Math.random(), o.curve || 1);
    K.noise(v, { kind: o.kind || 'white', at: (o.at || 0) + x * span, d: v.r(D[0], D[1]), g: v.r(G[0], G[1]) * (o.fade ? 1 - x * 0.8 : 1),
      ft: 'bandpass', ff: v.r(F[0], F[1]), q: o.q || 4, to: o.to, nd: true });
  }
  return (o.at || 0) + span + D[1];
};
// pings: n short sine plinks at random pitch (glass shards, sparkles, water drips)
K.pings = (v, o) => {
  const n = o.n || 6, span = o.span || 0.4, F = o.f || [3000, 6000];
  for (let i = 0; i < n; i++) {
    const x = Math.pow(Math.random(), o.curve || 1), f = v.r(F[0], F[1]);
    K.tone(v, { type: o.type || 'sine', f, f2: o.drop ? f * o.drop : null, at: (o.at || 0) + x * span, d: v.r(0.03, o.dmax || 0.09), g: v.r(0.03, o.gmax || 0.08) * (1 - x * 0.6), np: true, to: o.to });
  }
  return (o.at || 0) + span + 0.1;
};
// a formant "voice" (quacks, oh-no, cheers): a buzzy source through 2-3 parallel band-passes.
// o: f, fs (pitch points [[dt, f]...]), at, a, d, hold, g, formants [[f, q, gain], ...], type, vib, to
K.voice = (v, o) => {
  const c = v.ctx, sum = c.createGain(); sum.gain.value = 1; sum.connect(o.to || v.out);
  const F = o.formants || [[700, 6, 1], [1200, 8, 0.6], [2600, 10, 0.3]], src = c.createGain(); src.gain.value = 1;
  for (const [f, q, g] of F) { const b = K.filt(c, 'bandpass', f, q), bg = K.gain(c, g * (o.fgain || 3)); src.connect(b).connect(bg).connect(sum); }
  K.tone(v, { type: o.type || 'sawtooth', wave: o.wave, f: o.f, f2: o.f2, ft: o.ft, fs: o.fs, at: o.at, a: o.a != null ? o.a : 0.01, d: o.d, hold: o.hold, g: o.g || 0.3, vib: o.vib, to: src, np: o.np });
  return (o.at || 0) + (o.hold || 0) + (o.d || 0.2) * v.d + 0.05;
};
})(window.BLAM);
