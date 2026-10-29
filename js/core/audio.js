'use strict';
/* B.L.A.M. core/audio.js -- STUB. The engine already emits every sound event through
   BLAM.SFX.play(name, opts). A sound agent replaces play() (keep the signature) and adds the sounds.
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
*/
window.BLAM = window.BLAM || {};
(function (B) {
const EVENTS = ['shot', 'hit', 'miss', 'reload', 'reloadDone', 'empty', 'bomb', 'bystander', 'lifeLost', 'stageStart',
  'stageClear', 'stageFail', 'quota', 'tick', 'countdown', 'go', 'menuShoot', 'menuHover', 'duckHit', 'duckHappy', 'duckAngry',
  'targetIn', 'targetStep', 'gameOver', 'continue', 'courseClear', 'newRecord', 'vsJoin', 'vsLeave', 'vsWin', 'vsLose', 'vsTaken', 'skin'];
const log = [];
B.SFX = B.SFX || {
  EVENTS,
  log,                                   // last 40 events, for debugging: BLAM.SFX.log
  play(name, opts) { log.push([Math.round(performance.now()), name, opts || null]); if (log.length > 40) log.shift(); }
};
if (!B.SFX.EVENTS) B.SFX.EVENTS = EVENTS;
})(window.BLAM);
