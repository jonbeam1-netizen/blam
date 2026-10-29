'use strict';
/* B.L.A.M. core/ammo.js -- per-stage ammo rule.
   rule: 'unlimited' | { mag: N, autoReload: true, reloadTime: s } | { cap: N }
   Reload is AUTOMATIC when the magazine empties (no key): gun.reload(t) plays the animation and
   the trigger is locked for reloadTime. A hard cap simply runs dry (gun.setEmpty(true)). */
window.BLAM = window.BLAM || {};
(function (B) {
class Ammo {
  constructor(rule, gun) { this.gun = gun || null; this.set(rule); }
  set(rule) {
    this.rule = rule || 'unlimited'; this.reloadT = 0; this.reloadTime = 0; this.flash = 0;
    if (this.rule === 'unlimited' || (!this.rule.mag && !this.rule.cap)) { this.type = 'inf'; this.count = Infinity; this.max = Infinity; }
    else if (this.rule.mag) { this.type = 'mag'; this.max = this.count = this.rule.mag | 0; this.reloadTime = +this.rule.reloadTime || 1; }
    else { this.type = 'cap'; this.max = this.count = this.rule.cap | 0; }
    if (this.gun && this.gun.setEmpty) this.gun.setEmpty(false);
    return this;
  }
  get reloading() { return this.reloadT > 0; }
  get empty() { return this.type === 'cap' && this.count <= 0; }
  get infinite() { return this.type === 'inf'; }
  canFire() { return !this.reloading && this.count > 0; }
  // call when a shot is fired; returns false (and emits 'empty') if no shot was possible
  use() {
    if (!this.canFire()) { B.SFX.play('empty'); this.flash = 0.25; return false; }
    if (this.type === 'inf') return true;
    this.count--;
    if (this.count <= 0) {
      if (this.type === 'mag' && this.rule.autoReload !== false) this.startReload();
      else if (this.gun && this.gun.setEmpty) this.gun.setEmpty(true);
    }
    return true;
  }
  startReload() {
    if (this.type !== 'mag' || this.reloading) return;
    this.reloadT = this.reloadTime;
    if (this.gun && this.gun.reload) this.gun.reload(this.reloadTime);
    B.SFX.play('reload', { time: this.reloadTime });
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.count = this.max; B.SFX.play('reloadDone'); }
    }
  }
  // short text for the briefing pillar / HUD
  label() { return this.type === 'inf' ? 'INF' : String(this.count); }
  static describe(rule) {
    if (!rule || rule === 'unlimited' || (!rule.mag && !rule.cap)) return 'UNLIMITED';
    if (rule.mag) return rule.mag + ' PER MAG';
    return rule.cap + ' SHOTS';
  }
}
B.Ammo = Ammo;
})(window.BLAM);
