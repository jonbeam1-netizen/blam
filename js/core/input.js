'use strict';
/* B.L.A.M. core/input.js -- mouse crosshair + click (+ right button), touch tap-to-fire + swipe down (pointer events), keys.
   No page scroll / pinch zoom / double-tap zoom / long-press menu (except inside .blam-dom overlays). */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R;
const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
const I = {
  aim: { u: 0.5, v: 0.42 },          // aim point inside the 16:9 frame (0..1)
  mouseIn: false,                    // mouse is over the frame (crosshair shows)
  // raw mouse position (build 0.005): u / v may be outside 0..1 (over the pillars / bars); over = on the canvas
  ptr: { u: 0.5, v: 0.42, inside: true, over: false },
  touch: IS_TOUCH,                   // last real input was touch (layout guess until then)
  down: false, lastShot: 0,
  SWIPE_PX: 40,                      // a touch that travels >= 40 CSS px mostly downward is a SWIPE DOWN (reload)
  fireHandlers: [], keyHandlers: [], layoutHandlers: [], altHandlers: [], swipeHandlers: [],
  onFire(fn) { this.fireHandlers.push(fn); }, onKey(fn) { this.keyHandlers.push(fn); }, onLayout(fn) { this.layoutHandlers.push(fn); },
  onAlt(fn) { this.altHandlers.push(fn); },        // right mouse button (u, v, inside)
  onSwipe(fn) { this.swipeHandlers.push(fn); }     // touch swipe down (u, v of the start point)
};
function toFrame(e) {
  const f = R.frame, u = (e.clientX - f.cssX) / f.cssW, v = (e.clientY - f.cssY) / f.cssH;
  return { u, v, inside: u >= 0 && u < 1 && v >= 0 && v < 1 };
}
function setTouch(t) { if (I.touch !== t) { I.touch = t; I.layoutHandlers.forEach(f => f(t)); } }
const isDom = e => e.target && e.target.closest && e.target.closest('.blam-dom');
const swipes = new Map();            // touch pointerId -> { x, y, u, v, done }
R.view.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') {
    const s = swipes.get(e.pointerId);
    if (s && !s.done) {
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (dy >= I.SWIPE_PX && dy > Math.abs(dx) * 1.2) { s.done = true; for (const h of I.swipeHandlers) h(s.u, s.v); }
    }
    return;
  }
  const f = toFrame(e); I.mouseIn = f.inside; setTouch(false);
  I.ptr.u = f.u; I.ptr.v = f.v; I.ptr.inside = f.inside; I.ptr.over = true;
  if (f.inside) { I.aim.u = f.u; I.aim.v = f.v; }
  // chorded buttons (one already held) arrive as pointermove with e.button set, not as pointerdown
  // (only when ANOTHER button is also held: a plain move never reports a press, whatever e.button says)
  if (e.button === 2 && (e.buttons & 2) && (e.buttons & ~2)) press(e, f, false);
  else if (e.button === 0 && (e.buttons & 1) && (e.buttons & ~1)) press(e, f, false);
});
R.view.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { I.mouseIn = false; I.ptr.over = false; } });
const endSwipe = e => swipes.delete(e.pointerId);
R.view.addEventListener('pointerup', endSwipe); R.view.addEventListener('pointercancel', endSwipe);
R.view.addEventListener('pointerdown', e => {
  e.preventDefault();
  const touch = e.pointerType !== 'mouse';
  setTouch(touch); if (touch) I.mouseIn = false;
  press(e, toFrame(e), touch);
});
function press(e, f, touch) {
  if (!touch) { I.ptr.u = f.u; I.ptr.v = f.v; I.ptr.inside = f.inside; I.ptr.over = true; }
  if (!touch && e.button === 2) { for (const h of I.altHandlers) h(f.u, f.v, f.inside); return; }   // right button (context menu is suppressed below)
  if (!touch && e.button !== 0) return;
  if (touch) swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, u: f.u, v: f.v, done: false });
  // a tap fires at once: swipe detection never delays it (the swipe is recognised later, on pointermove)
  const now = performance.now(); if (now - I.lastShot < 45) return;   // multi-touch: each finger fires, but no double events
  I.lastShot = now;
  if (f.inside) { I.aim.u = f.u; I.aim.v = f.v; if (!touch) I.mouseIn = true; }
  for (const h of I.fireHandlers) h(f.u, f.v, f.inside, touch);
}
window.addEventListener('keydown', e => {
  if (isDom(e) || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
  for (const h of I.keyHandlers) h(e.key, e);
});
['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(ev =>
  document.addEventListener(ev, e => { if (!isDom(e)) e.preventDefault(); }, { passive: false }));
B.Input = I;
})(window.BLAM);
