'use strict';
/* B.L.A.M. core/ammo.js -- per-stage ammo rule.
   rule: 'unlimited' | { mag: N, reloadTime?: s, autoReload?: bool } | { cap: N }
   Magazine (build 0.005, #44): reload is INSTANT, Time Crisis / Area 51 style. The moment a reload trigger
   registers (frame shot / pillar hover / right click / swipe down / key R, see main.js G.sideReload) the
   magazine is full and the next shot can fire at once. The gun's rack animation (~0.3 s, RACK) is cosmetic and never
   blocks the trigger (guns.js snaps it when you fire). Works on a partial magazine too (tactical reload).
   `reloadTime` is IGNORED (kept harmless so stage configs may still pass it). `reloading` is always false now.
   An emptied magazine sits empty (gun.setEmpty(true)) until you reload; { autoReload: true } refills it
   instantly when the last round is spent. A hard cap simply runs dry (gun.setEmpty(true)). */
window.BLAM = window.BLAM || {};
(function (B) {
const RACK = 0.3;                                    // cosmetic gun rack animation (s); matches the 0.40 s reload sounds, a shot snaps it to the end
const KICK = 0.3;                                    // HUD capsule / frame marker flash after a reload (s)
class Ammo {
  constructor(rule, gun) { this.gun = gun || null; this.set(rule); }
  set(rule) {
    this.rule = rule || 'unlimited'; this.reloadT = 0; this.reloadTime = 0; this.flash = 0; this.kick = 0; this.reloads = 0;
    if (this.rule === 'unlimited' || (!this.rule.mag && !this.rule.cap)) { this.type = 'inf'; this.count = Infinity; this.max = Infinity; }
    else if (this.rule.mag) { this.type = 'mag'; this.max = this.count = this.rule.mag | 0; }
    else { this.type = 'cap'; this.max = this.count = this.rule.cap | 0; }
    if (this.gun && this.gun.setEmpty) this.gun.setEmpty(false);
    return this;
  }
  get reloading() { return false; }                                          // instant reload: never locked
  get empty() { return this.type === 'cap' && this.count <= 0; }            // hard cap spent (ends a solo stage)
  get magEmpty() { return this.type === 'mag' && this.count <= 0; }         // needs a reload
  get infinite() { return this.type === 'inf'; }
  get auto() { return this.type === 'mag' && this.rule.autoReload === true; }
  get canReload() { return this.type === 'mag' && this.count < this.max; }
  get reloadFrac() { return 0; }
  canFire() { return this.count > 0; }
  // call when a shot is fired; returns false (and emits 'empty') if no shot was possible
  use() {
    if (!this.canFire()) { B.SFX.play('empty'); this.flash = 0.25; return false; }
    if (this.type === 'inf') return true;
    this.count--;
    if (this.count <= 0) {
      if (this.auto) this.startReload();
      else if (this.gun && this.gun.setEmpty) this.gun.setEmpty(true);
    }
    return true;
  }
  // instant reload; returns true if it happened (magazine only, not already full)
  startReload() {
    if (!this.canReload) return false;
    this.count = this.max; this.kick = KICK; this.reloads++;
    if (this.gun && this.gun.setEmpty) this.gun.setEmpty(false);
    if (this.gun && this.gun.reload) this.gun.reload(RACK);
    B.SFX.play('reload', { time: 0 }); B.SFX.play('reloadDone');
    return true;
  }
  update(dt) { this.flash = Math.max(0, this.flash - dt); this.kick = Math.max(0, this.kick - dt); }
  // short text for the briefing pillar / HUD
  label() { return this.type === 'inf' ? 'INF' : String(this.count); }
  static describe(rule) {
    if (!rule || rule === 'unlimited' || (!rule.mag && !rule.cap)) return 'UNLIMITED';
    if (rule.mag) return rule.mag + ' PER MAG';
    return rule.cap + ' SHOTS';
  }
}
Ammo.RACK = RACK;
B.Ammo = Ammo;
})(window.BLAM);
