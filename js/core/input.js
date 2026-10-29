'use strict';
/* B.L.A.M. core/input.js -- mouse crosshair + click, touch tap-to-fire (pointer events), keys.
   No page scroll / pinch zoom / double-tap zoom / long-press menu (except inside .blam-dom overlays). */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R;
const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
const I = {
  aim: { u: 0.5, v: 0.42 },          // aim point inside the 16:9 frame (0..1)
  mouseIn: false,                    // mouse is over the frame (crosshair shows)
  touch: IS_TOUCH,                   // last real input was touch (layout guess until then)
  down: false, lastShot: 0,
  fireHandlers: [], keyHandlers: [], layoutHandlers: [],
  onFire(fn) { this.fireHandlers.push(fn); }, onKey(fn) { this.keyHandlers.push(fn); }, onLayout(fn) { this.layoutHandlers.push(fn); }
};
function toFrame(e) {
  const f = R.frame, u = (e.clientX - f.cssX) / f.cssW, v = (e.clientY - f.cssY) / f.cssH;
  return { u, v, inside: u >= 0 && u < 1 && v >= 0 && v < 1 };
}
function setTouch(t) { if (I.touch !== t) { I.touch = t; I.layoutHandlers.forEach(f => f(t)); } }
const isDom = e => e.target && e.target.closest && e.target.closest('.blam-dom');
R.view.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const f = toFrame(e); I.mouseIn = f.inside; setTouch(false);
  if (f.inside) { I.aim.u = f.u; I.aim.v = f.v; }
});
R.view.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') I.mouseIn = false; });
R.view.addEventListener('pointerdown', e => {
  e.preventDefault();
  const f = toFrame(e), touch = e.pointerType !== 'mouse';
  setTouch(touch); if (touch) I.mouseIn = false;
  if (!touch && e.button !== 0) return;
  const now = performance.now(); if (now - I.lastShot < 45) return;   // multi-touch: each finger fires, but no double events
  I.lastShot = now;
  if (f.inside) { I.aim.u = f.u; I.aim.v = f.v; if (!touch) I.mouseIn = true; }
  for (const h of I.fireHandlers) h(f.u, f.v, f.inside, touch);
});
window.addEventListener('keydown', e => {
  if (isDom(e) || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
  for (const h of I.keyHandlers) h(e.key, e);
});
['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(ev =>
  document.addEventListener(ev, e => { if (!isDom(e)) e.preventDefault(); }, { passive: false }));
B.Input = I;
})(window.BLAM);
