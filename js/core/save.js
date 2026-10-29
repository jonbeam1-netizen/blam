'use strict';
/* B.L.A.M. core/save.js -- localStorage: settings, best score per (stage key, tier), gun skin. */
window.BLAM = window.BLAM || {};
(function (B) {
const KEY = 'blam.save.v1';
const DEF = { settings: { dither: true, crosshair: true, shake: true, skin: 0, name: 'PLAYER', fps: false, ditherMode: 1 }, best: {} };
let data = null;
function load() {
  try { const raw = localStorage.getItem(KEY); data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
  if (!data || typeof data !== 'object') data = {};
  data.settings = Object.assign({}, DEF.settings, data.settings || {});
  data.best = Object.assign({}, data.best || {});
  return data;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
const S = {
  get settings() { return data.settings; },
  set(k, v) { data.settings[k] = v; save(); },
  bestKey: (stage, tier) => stage + '|' + tier,
  best(stage, tier) { return data.best[S.bestKey(stage, tier)] || 0; },
  // returns true when it is a new record
  submit(stage, tier, score) {
    const k = S.bestKey(stage, tier), old = data.best[k] || 0;
    if (score > old) { data.best[k] = score; save(); return true; }
    return false;
  },
  allBest() { return Object.assign({}, data.best); },
  reset() { data = JSON.parse(JSON.stringify(DEF)); save(); }
};
load();
B.Save = S;
})(window.BLAM);
