'use strict';
/* B.L.A.M. core/sfx-samples.js -- the recorded-sample layer of BLAM.SFX (loaded right after audio.js).
   assets/sfx/manifest.json (written by tools/sfx-export.py from review/sfx-picks) lists the sets: { set: [{ file, dur }] }.
   The manifest is fetched once at load, the wav bytes after the page's 'load' event, and they are decoded on the first
   audio unlock (the AudioContext only exists after the first user gesture). Until a set is decoded, or if it is absent
   or fails, has(set) is false and audio.js plays the synthesized recipe instead (silent fallback).
   audio.js decides WHICH events use samples (its SAMPLES paragraph); this file only loads and plays them:
     has(set) -> bool             play(set, { gain, pan, rate, delay, out }) -> handle { g, end, stop(fade) } | null
   The files are loudness-balanced against each other: play them at unity, audio.js applies one SAMPLE_GAIN.
   Round robin: a shuffle bag per set, never the same file twice in a row (also across a bag refill).
   Debug: BLAM.SFX.samples = { ready, sets: { name: count }, missing: [sets that fall back to synth] }. */
window.BLAM = window.BLAM || {};
(function (B) {
const SFX = B.SFX; if (!SFX || !SFX.registerSampler) return;
const BASE = 'assets/sfx/';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const info = { ready: false, sets: {}, missing: [] };
SFX.samples = info;
let manifest = null, bytes = null, decoding = null;
const bufs = {}, bags = {};                       // set -> [AudioBuffer]; set -> { bag, last }
const expected = () => SFX.SAMPLE_SETS || [];
const fetchOpt = { cache: 'no-cache' };            // revalidate (the files change without a ?v= bump)

function decode(c, ab) {                           // promise form, with the old callback form as a fallback
  return new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
}
function refreshMissing() {
  info.missing = expected().filter(s => info.ready ? !(bufs[s] && bufs[s].length) : !info.sets[s]);
}
// the manifest, once
const loaded = fetch(BASE + 'manifest.json', fetchOpt).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(m => {
  manifest = m && m.sets ? m : { sets: {} };
  for (const s in manifest.sets) info.sets[s] = (manifest.sets[s] || []).length;
  refreshMissing();
  const n = Object.keys(info.sets).reduce((a, s) => a + info.sets[s], 0);
  console.info('SFX samples: ' + Object.keys(info.sets).length + ' sets, ' + n + ' files (' +
    Object.keys(info.sets).map(s => s + ' ' + info.sets[s]).join(', ') + '); synth fallback: ' + (info.missing.join(', ') || 'none'));
}).catch(e => {
  manifest = { sets: {} }; refreshMissing();
  console.info('SFX samples: no manifest (' + (e && e.message) + '); synth fallback: all');
});
// the wav bytes: fetched once the page has loaded (so they do not compete with the first frame), decoded on unlock
function fetchBytes() {
  if (bytes) return bytes;
  return (bytes = loaded.then(() => {
    const jobs = [];
    for (const s in manifest.sets) (manifest.sets[s] || []).forEach((f, i) => jobs.push(
      fetch(BASE + f.file, fetchOpt).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(ab => ({ s, i, ab }), e => ({ s, i, err: e }))));
    return Promise.all(jobs);
  }));
}
if (document.readyState === 'complete') fetchBytes(); else window.addEventListener('load', fetchBytes, { once: true });

function unlock(c) {
  if (decoding || !c) return;
  decoding = fetchBytes().then(list => Promise.all(list.map(j => j.err ? j : decode(c, j.ab).then(b => ({ s: j.s, i: j.i, b }), e => ({ s: j.s, i: j.i, err: e })))))
    .then(list => {
      const fail = [];
      list.sort((a, b) => a.i - b.i).forEach(j => { if (j.b) (bufs[j.s] = bufs[j.s] || []).push(j.b); else fail.push(j.s + '#' + (j.i + 1)); });
      info.ready = true; refreshMissing();
      if (fail.length) console.warn('SFX samples: ' + fail.length + ' files failed (' + fail.join(', ') + '); synth fallback: ' + (info.missing.join(', ') || 'none'));
    }).catch(e => { info.ready = true; refreshMissing(); console.warn('SFX samples: decode failed', e); });
}

// shuffle bag: every file once per round, never the same file twice in a row
function pick(set, n) {
  if (n < 2) return 0;
  const b = bags[set] || (bags[set] = { bag: [], last: -1 });
  if (!b.bag.length) {
    const a = []; for (let i = 0; i < n; i++) a.push(i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    if (a[n - 1] === b.last) { const t = a[0]; a[0] = a[n - 1]; a[n - 1] = t; }   // pop() takes the end first
    b.bag = a;
  }
  return (b.last = b.bag.pop());
}

function has(set) { return !!(bufs[set] && bufs[set].length); }
function play(set, o) {
  o = o || {};
  const c = SFX.ctx, M = SFX._mix, list = bufs[set];
  if (!c || !M || !list || !list.length) return null;
  const out = o.out || M.sfx, rate = o.rate > 0 ? o.rate : 1, buf = list[pick(set, list.length)];
  const t = c.currentTime + 0.004 + Math.max(0, +o.delay || 0);
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = buf; src.playbackRate.value = rate; g.gain.value = o.gain != null ? o.gain : 1;
  src.connect(g);
  let pan = null;
  if (c.createStereoPanner) { pan = c.createStereoPanner(); pan.pan.value = clamp(+o.pan || 0, -1, 1); g.connect(pan).connect(out); }
  else g.connect(out);
  src.start(t);
  const h = {
    set, g, src, end: t + buf.duration / rate,
    stop(fade) {
      const now = c.currentTime, f = Math.max(0.002, fade != null ? fade : 0.015);
      if (h.end <= now) return;
      try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + f); src.stop(now + f + 0.005); } catch (e) {}
      h.end = now;
    }
  };
  src.onended = () => { try { src.disconnect(); g.disconnect(); if (pan) pan.disconnect(); } catch (e) {} };
  return h;
}
SFX.registerSampler({ has, play, unlock });
})(window.BLAM);
