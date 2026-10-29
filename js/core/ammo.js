'use strict';
/* B.L.A.M. core/ammo.js -- per-stage ammo rule.
   rule: 'unlimited' | { mag: N, reloadTime: s, autoReload?: bool } | { cap: N }
   Magazine (build 0.003): reload is MANUAL by default, light-gun style: shoot the frame beside the game rect
   (main.js G.sideReload -> startReload), or press R. Works on a partial magazine too (tactical reload).
   An emptied magazine just sits empty (gun.setEmpty(true)) until you reload. { autoReload: true } brings
   back the automatic reload (per-stage option). A hard cap simply runs dry (gun.setEmpty(true)). */
window.BLAM = window.BLAM || {};
(function (B) {
class Ammo {
  constructor(rule, gun) { this.gun = gun || null; this.set(rule); }
  set(rule) {
    this.rule = rule || 'unlimited'; this.reloadT = 0; this.reloadTime = 0; this.flash = 0; this.kick = 0; this.reloads = 0;
    if (this.rule === 'unlimited' || (!this.rule.mag && !this.rule.cap)) { this.type = 'inf'; this.count = Infinity; this.max = Infinity; }
    else if (this.rule.mag) { this.type = 'mag'; this.max = this.count = this.rule.mag | 0; this.reloadTime = +this.rule.reloadTime || 0.7; }
    else { this.type = 'cap'; this.max = this.count = this.rule.cap | 0; }
    if (this.gun && this.gun.setEmpty) this.gun.setEmpty(false);
    return this;
  }
  get reloading() { return this.reloadT > 0; }
  get empty() { return this.type === 'cap' && this.count <= 0; }            // hard cap spent (ends a solo stage)
  get magEmpty() { return this.type === 'mag' && this.count <= 0 && !this.reloading; }   // needs a reload
  get infinite() { return this.type === 'inf'; }
  get auto() { return this.type === 'mag' && this.rule.autoReload === true; }
  get canReload() { return this.type === 'mag' && !this.reloading && this.count < this.max; }
  get reloadFrac() { return this.reloading && this.reloadTime ? 1 - this.reloadT / this.reloadTime : 0; }
  canFire() { return !this.reloading && this.count > 0; }
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
  // returns true if a reload started (magazine only, not full, not already reloading)
  startReload() {
    if (!this.canReload) return false;
    this.reloadT = this.reloadTime; this.kick = 0.35; this.reloads++;
    if (this.gun && this.gun.setEmpty) this.gun.setEmpty(false);
    if (this.gun && this.gun.reload) this.gun.reload(this.reloadTime);
    B.SFX.play('reload', { time: this.reloadTime });
    return true;
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt); this.kick = Math.max(0, this.kick - dt);
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
