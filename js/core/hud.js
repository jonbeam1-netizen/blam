'use strict';
/* =========================================================================================
   B.L.A.M. core/hud.js -- everything 2D, on pixel grids, fillRect only, palette colours only.
   Draws onto the current context (H.use(ctx)): the 426x240 game HUD (B.R.hx), or the outer
   canvas (pillar frame + the portrait HUD strip). Text and sprites are cached as tiny canvases.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, CSS = R.CSS, RW = R.RW, RH = R.RH;
let ctx = R.hx;
const col = c => CSS[c] || c;
function rect(x, y, w, h, c) { ctx.fillStyle = col(c); ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
const prect = (g, x, y, w, h, c) => { g.fillStyle = col(c); g.fillRect(x, y, w, h); };

// ---------- image cache ----------
const cache = new Map();
function cached(key, w, h, draw) {
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 500) cache.clear();
    const [cv, g] = R.pixCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    draw(g); c = cv; cache.set(key, c);
  }
  return c;
}
const OUT8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const clean = s => String(s).toUpperCase();
// ---------- 3x5 text ----------
const text3w = (str, sc = 1) => { str = clean(str); return str.length ? str.length * 4 * sc - sc : 0; };
function text3(str, x, y, c, sc = 1, outline) {
  str = clean(str); if (!str.length) return 0;
  const o = outline ? 1 : 0, w = text3w(str, sc);
  const cv = cached('t3|' + str + '|' + c + '|' + sc + '|' + (outline || ''), w + 2 * o, 5 * sc + 2 * o, g => {
    const pass = (ox, oy, cc) => { let cx = o;
      for (const ch of str) { const gl = R.F3[ch] || R.F3[' '];
        for (let r = 0; r < 5; r++) { const row = +gl[r]; for (let k = 0; k < 3; k++) if ((row >> (2 - k)) & 1) prect(g, cx + k * sc + ox, o + r * sc + oy, sc, sc, cc); }
        cx += 4 * sc; } };
    if (outline) for (const [ox, oy] of OUT8) pass(ox, oy, outline);
    pass(0, 0, c);
  });
  ctx.drawImage(cv, Math.round(x) - o, Math.round(y) - o);
  return w;
}
function text3c(str, cx, y, c, sc = 1, outline) { return text3(str, Math.round(cx - text3w(str, sc) / 2), y, c, sc, outline); }
function text3r(str, rx, y, c, sc = 1, outline) { return text3(str, Math.round(rx - text3w(str, sc)), y, c, sc, outline); }
// ---------- bold 7-row text ----------
const ROWS = {
  gold: ['lemon', 'lemon', 'yellow', 'yellow', 'yellow', 'orange', 'orange'],
  hot:  ['lemon', 'yellow', 'yellow', 'amber', 'orange', 'orange', 'rust'],
  red:  ['coral', 'coral', 'red', 'red', 'red', 'crimson', 'crimson'],
  blue: ['ice', 'ice', 'cyan', 'cyan', 'blue', 'blue', 'deepblue'],
  bone: ['bone', 'bone', 'bone', 'mist', 'mist', 'haze', 'haze'],
  void: Array(7).fill('void'), lime: ['lime', 'lime', 'lime', 'lime', 'green', 'green', 'green']
};
const text7w = (str, sc = 1) => R.bold(clean(str)).w * sc;
function text7(str, x, y, sc = 1, rows = 'gold', outline = 'void', ow = 2) {
  str = clean(str);
  const rr = typeof rows === 'string' ? ROWS[rows] : rows, t = R.bold(str), w = t.w * sc;
  const cv = cached('t7|' + str + '|' + rr.join(',') + '|' + sc + '|' + outline + '|' + ow, w + 2 * ow, 7 * sc + 2 * ow, g => {
    if (outline && ow) for (let oy = -ow; oy <= ow; oy++) for (let ox = -ow; ox <= ow; ox++) if (ox || oy)
      for (const [px, py] of t.px) prect(g, ow + px * sc + ox, ow + py * sc + oy, sc, sc, outline);
    for (const [px, py] of t.px) prect(g, ow + px * sc, ow + py * sc, sc, sc, rr[py]);
  });
  ctx.drawImage(cv, Math.round(x) - ow, Math.round(y) - ow);
  return w;
}
function text7c(str, cx, y, sc, rows, outline, ow) { return text7(str, Math.round(cx - text7w(str, sc) / 2), y, sc, rows, outline, ow); }
// ---------- sprites (rows of chars + key) ----------
function sprite(rows, x, y, sc, key, id) {
  const w = rows[0].length, h = rows.length;
  const cv = cached('sp|' + (id || rows.join('/')) + '|' + sc + '|' + JSON.stringify(key), w * sc, h * sc, g => {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && key[ch]) prect(g, i * sc, j * sc, sc, sc, key[ch]); } });
  });
  ctx.drawImage(cv, Math.round(x), Math.round(y));
}
// generic pixel-function image: f(x, y) -> colour name or null
function pixImg(key, w, h, f) {
  return cached('px|' + key, w, h, g => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y); if (c) prect(g, x, y, 1, 1, c); } });
}
function draw(img, x, y) { ctx.drawImage(img, Math.round(x), Math.round(y)); }

const HEART = ['.XX...XX.', 'XHHX.XRRX', 'XHRRXRRRX', 'XRRRRRRCX', '.XRRRRCX.', '..XRRCX..', '...XRX...', '....X....'];
const HEART_KEY = { X: 'void', R: 'red', H: 'coral', C: 'crimson' };
const HEART_OFF = { X: 'void', R: 'navy', H: 'slate', C: 'midnight' };
const INF = ['.XX...XX.', 'X..X.X..X', 'X...X...X', 'X..X.X..X', '.XX...XX.'];
const SKULL = ['.XXXXX.', 'XXXXXXX', 'X..X..X', 'XXXXXXX', '.XX.XX.', '.X.X.X.'];

// rounded box with outline: fill, top highlight row, bottom shade row
function box(x, y, w, h, fill, hi, lo, outline = 'void') {
  x = Math.round(x); y = Math.round(y);
  if (outline) { rect(x + 1, y - 1, w - 2, h + 2, outline); rect(x - 1, y + 1, w + 2, h - 2, outline); rect(x, y, w, h, outline); }
  rect(x + 1, y, w - 2, h, fill); rect(x, y + 1, w, h - 2, fill);
  if (hi) rect(x + 1, y + 1, w - 2, 1, hi);
  if (lo) rect(x + 1, y + h - 2, w - 2, 1, lo);
}
// pill (fully rounded ends)
function pill(x, y, w, h, fill, hi, lo) {
  x = Math.round(x); y = Math.round(y);
  const img = cached('pill|' + w + 'x' + h + fill + hi + lo, w + 2, h + 2, g => {
    const r = h / 2;
    for (let yy = -1; yy <= h; yy++) for (let xx = -1; xx <= w; xx++) {
      const cx = xx < r ? r : xx > w - r ? w - r : xx + 0.5, d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - r);
      if (d > r + 0.9) continue;
      prect(g, xx + 1, yy + 1, 1, 1, d > r - 0.2 ? 'void' : yy === 1 ? (hi || fill) : yy === h - 2 ? (lo || fill) : fill);
    }
  });
  ctx.drawImage(img, x - 1, y - 1);
}
// 2x2 checker of void pixels: a 50% "dim" that survives the no-alpha HUD composite
let checker = null;
function dim(x = 0, y = 0, w = RW, h = RH) {
  if (!checker) { const [c, g] = R.pixCanvas(2, 2); prect(g, 0, 0, 1, 1, 'void'); prect(g, 1, 1, 1, 1, 'void'); checker = c; }
  const p = ctx.createPattern(checker, 'repeat'); ctx.fillStyle = p; ctx.fillRect(x, y, w, h);
}
const H = {
  use(c) { ctx = c; }, get ctx() { return ctx; },
  rect, box, pill, dim, text3, text3c, text3r, text3w, text7, text7c, text7w, sprite, pixImg, draw, cached, ROWS,
  HEART, HEART_KEY, HEART_OFF, INF, SKULL, prect
};
B.HUD = H;

// =========================================================================================
// Gameplay HUD pieces (shared by the landscape HUD and the portrait strip)
// =========================================================================================
const PCOL = [['coral', 'red', 'crimson'], ['ice', 'cyan', 'blue']];   // P1 red, P2 blue (hi, body, shade)
// ammo "shell": brass head + a hull in the player colour (our own take on an ammo badge), 48x17
function shellImg(p, mirror, flash) {
  const C = flash ? ['lemon', 'lemon', 'yellow'] : PCOL[p];
  return pixImg('shell' + p + (mirror ? 'm' : '') + (flash ? 'f' : ''), 48, 17, (x, y) => {
    const X = mirror ? 47 - x : x;
    if (X <= 2) return (y === 0 || y === 16 || X === 0) ? 'void' : y === 1 ? 'lemon' : y >= 14 ? 'rust' : 'amber';   // rim
    if (X === 47) return (y >= 3 && y <= 13) ? 'void' : null;
    if (X >= 45 && (y <= 1 || y >= 15)) return null;
    if (y === 0 || y === 16 || X === 46 || (X === 45 && (y === 2 || y === 14))) return 'void';
    if (X <= 11) return y === 1 ? 'lemon' : y === 2 ? 'yellow' : y >= 14 ? 'rust' : y >= 12 ? 'amber' : X === 7 ? 'amber' : 'yellow';
    if (X === 12) return 'void';
    if (X >= 41 && X <= 44 && !(X & 1)) return C[2];                      // crimp lines
    return y <= 2 ? C[0] : y >= 13 ? C[2] : C[1];
  });
}
// player p (0/1), ammo (B.Ammo), x,y = top-left; mirrored for P2 in versus
function shell(x, y, p, ammo, mirror, t) {
  // reload is instant (build 0.005): just a quick capsule flash (ammo.kick) + a yellow RELOAD tag, no progress bar
  const kick = !!(ammo && ammo.kick > 0), fl = kick;                       // one steady flash, no strobe
  draw(shellImg(p, mirror, fl), x, y);
  const cx = x + (mirror ? 18 : 29);
  if (!ammo || ammo.infinite) sprite(INF, cx - 9, y + 4, 2, { X: 'bone' }, 'inf');
  else text3c(String(ammo.count), cx, y + 4, fl ? 'void' : ammo.count === 0 ? 'oxblood' : 'bone', 2);
  if (kick) text3c('RELOAD', x + 24, y - 7, 'yellow', 1, 'void');
  else if (ammo && ammo.magEmpty) text3c('RELOAD', x + 24, y - 7, ((t * 4) | 0) % 2 ? 'bone' : 'red', 1, 'void');   // letters only, red <-> white 2 Hz
  else if (ammo && ammo.empty && ((t * 4) | 0) % 2 === 0) text3c('EMPTY', x + 24, y - 7, 'red', 1, 'void');
  else if (ammo && ammo.flash > 0) text3c('EMPTY', x + 24, y - 7, 'red', 1, 'void');
}
// ---------- MAGAZINE (#72, 2026-10-29): replaces the number-on-a-bullet shell in the play HUD ----------
// A vertical clip with one brass round per round left, readable at a glance. Rounds lie on their side (P1 points
// right, P2 mirrored), 12x4 px on a 5 px pitch; up to 8 per column, 9-16 rounds = two columns, caps up to 32 =
// three / four columns (a small count sits above the clip past 16). They go top-down as you shoot. The last 3 glow
// warm (a 1.4 Hz pulse through 4 palette steps + a halo, never on/off). Empty: hollow (just the navy spring) with
// the outline blinking red <-> bone at 2 Hz, plus the old RELOAD letters above it. Reload: the old clip drops out of
// the well and a full one rises in (MAG_REL s, easeOutBack), a lemon outline when it seats. Play is never held up
// (the reload itself is instant). Per-player state lives in a WeakMap keyed on the player object (a new Run = fresh
// state); count changes are read off the ammo each frame, so the rival's display-only ammo animates too.
// Casings: HUD.eject(player) (main.js playFire, every real shot) queues one; the next draw pops it from the gun's
// ejection port (desktop: gun.ejectPoint() projected to HUD px) or, on touch / portrait / for the rival, from the
// top of the clip. Max CAS_MAX alive, CAS_LIFE s, spin = 8 cached rotation frames per gun.
const RND_W = 12, RND_H = 4, RND_P = 5, MAG_REL = 0.34, MAG_SEAT = 0.14;
// round colours per heat level (0 = cold brass; 1-3 = the last-3 glow), rows top to bottom
const MAG_RND = [
  { rim: ['yellow', 'amber', 'amber', 'rust'], gr: 'rust', cs: ['lemon', 'yellow', 'yellow', 'amber'], tip: ['sand', 'orange', 'rust', 'chestnut'], halo: null },
  { rim: ['lemon', 'yellow', 'amber', 'rust'], gr: 'orange', cs: ['lemon', 'lemon', 'yellow', 'orange'], tip: ['lemon', 'orange', 'orange', 'rust'], halo: 'oxblood' },
  { rim: ['lemon', 'yellow', 'yellow', 'orange'], gr: 'orange', cs: ['bone', 'lemon', 'yellow', 'orange'], tip: ['lemon', 'yellow', 'orange', 'rust'], halo: 'rust' },
  { rim: ['bone', 'lemon', 'yellow', 'orange'], gr: 'amber', cs: ['bone', 'bone', 'lemon', 'yellow'], tip: ['bone', 'lemon', 'orange', 'red'], halo: 'orange' }];
const magGeoms = {};
function magGeom(cap) {
  cap = Math.max(1, Math.min(32, cap | 0));
  const g = magGeoms[cap]; if (g) return g;
  const cols = cap <= 8 ? 1 : cap <= 16 ? 2 : cap <= 24 ? 3 : 4, rows = Math.ceil(cap / cols);
  const iw = cols * (RND_W + 1) + 1, ih = rows * RND_P + 1;          // interior (1 px pad around the rounds)
  return (magGeoms[cap] = { cap, cols, rows, iw, ih, W: iw + 10, H: ih + 8 });
}
// clip body: cols 0-1 baseplate overhang, 2 outline, 3-4 wall, interior, wall, outline, overhang. Rows: 0 outline,
// 1-2 feed lips, interior, a dark seam, a 3-row baseplate in the player colour, outline. oc = outline colour.
function magBody(g, mirror, oc, p) {
  const { W, H, iw, ih } = g, py0 = 3 + ih, C = PCOL[p];
  return pixImg('magb' + g.cols + 'x' + g.rows + (mirror ? 'm' : '') + oc + p, W, H, (x, y) => {
    const X = mirror ? W - 1 - x : x;
    if (y >= py0) {
      if (y === H - 1 || X === 0 || X === W - 1) return oc;
      if (y === py0) return X <= 2 || X >= W - 3 ? oc : 'void';
      if (y === py0 + 2 && Math.abs(X - W / 2 + 0.5) < 1) return C[0];   // rivet
      return y === py0 + 1 ? C[0] : y === py0 + 2 ? C[1] : C[2];
    }
    if (X < 2 || X > W - 3) return null;
    if (X === 2 || X === W - 3 || y === 0) return oc;
    if (X === 3) return 'haze'; if (X === 4) return 'steel';
    if (X === W - 5) return 'slate'; if (X === W - 4) return 'navy';
    const ix = X - 5, iy = y - 3;
    if (y <= 2) return ix < 3 || ix >= iw - 3 ? (y === 1 ? 'haze' : 'slate') : 'void';   // feed lips over the top round
    if (ix === 0 || iy === 0) return 'void';
    return (ix + 2 * iy) % 9 === 0 ? 'navy' : 'midnight';                 // the spring shows where rounds are spent
  });
}
function rndImg(lvl, mirror) {
  const R0 = MAG_RND[lvl];
  return pixImg('rnd' + lvl + (mirror ? 'm' : ''), RND_W, RND_H, (x, y) => {
    const X = mirror ? RND_W - 1 - x : x;
    if (X === 0) return R0.rim[y]; if (X === 1) return R0.gr; if (X <= 7) return R0.cs[y];
    if ((y === 0 || y === 3) && X === RND_W - 1) return null;          // rounded nose
    return R0.tip[y];
  });
}
// one clip at (x, top) with n rounds
function magAt(g, x, top, n, mirror, oc, p, lvl) {
  draw(magBody(g, mirror, oc, p), x, top);
  n = Math.min(n, g.cols * g.rows);
  const halo = MAG_RND[lvl].halo, img = rndImg(lvl, mirror);
  for (let i = 0; i < n; i++) {
    const r = (i / g.cols) | 0, c = i % g.cols, ry = 2 + g.ih - RND_H - r * RND_P;
    const rx = mirror ? g.W - 6 - c * (RND_W + 1) - RND_W : 6 + c * (RND_W + 1);
    if (halo) rect(x + rx - 1, top + ry - 1, RND_W + 2, RND_H + 2, halo);
    draw(img, x + rx, top + ry);
  }
}
const MAGS = new WeakMap();
function magState(pl) {
  let s = MAGS.get(pl);
  if (!s) MAGS.set(pl, s = { last: null, max: 0, pend: 0, relAt: -9, old: 0, hooked: false });
  return s;
}
// read the player's ammo, spot shots / reloads, pick the clip size: { st, g, n, inf, am }
function magPrep(pl, t) {
  const am = pl && pl.ammo, st = magState(pl || {}), inf = !am || !!am.infinite;
  const n = inf ? 8 : Math.max(0, am.count | 0);
  if (!inf) {
    let mx = isFinite(am.max) ? am.max | 0 : 0;
    if (!mx) { const r = B.G && B.G.run, a = r && r.cfg && r.cfg.ammo; if (a && (a.mag || a.cap)) mx = (a.mag || a.cap) | 0; }   // the rival's display-only ammo has no max
    st.max = Math.max(st.max, mx, n);
    if (st.last != null && n > st.last) { st.relAt = t; st.old = Math.max(0, st.last - (st.hooked ? st.pend : 0)); }   // a reload
    else if (st.last != null && n < st.last && !st.hooked) st.pend += Math.min(3, st.last - n);                     // the rival fired
    st.last = n;
  }
  return { st, g: magGeom(inf ? 8 : st.max), n, inf, am };
}
const easeBack = q => { const k = 1.3, u = q - 1; return 1 + (k + 1) * u * u * u + k * u * u; };
// draw the clip with its bottom at yb (left edge x); p = player colour, mirror = P2's half; pops queued casings
function magDraw(m, x, yb, p, mirror, t, kind) {
  const { st, g, n, inf, am } = m, top = yb - g.H, cx = x + g.W / 2;
  const hot = !inf && n > 0 && n <= 3 && g.cap > 3;
  const lvl = hot ? Math.min(3, Math.floor((Math.sin(t * Math.PI * 2 * 1.4) * 0.5 + 0.5) * 4)) : 0;
  const empty = !inf && n === 0, blink = ((t * 4) | 0) % 2 ? 'bone' : 'red', e = t - st.relAt;
  if (e >= 0 && e < MAG_REL) {                                          // the swap: old clip drops out, a full one rises in
    const q = e / MAG_REL, d = g.H + 2;
    ctx.save(); ctx.beginPath(); ctx.rect(Math.round(x) - 1, Math.round(top) - 14, g.W + 2, g.H + 14); ctx.clip();
    if (q < 0.45) magAt(g, x, top + Math.pow(q / 0.45, 2) * d, st.old, mirror, 'void', p, 0);
    if (q > 0.38) magAt(g, x, top + (1 - easeBack(Math.min(1, (q - 0.38) / 0.62))) * d, n, mirror, 'void', p, lvl);
    ctx.restore();
  } else magAt(g, x, top, n, mirror, empty ? blink : e >= 0 && e < MAG_REL + MAG_SEAT ? 'lemon' : 'void', p, lvl);
  // labels above the clip (same words as the old shell)
  const ly = top - 7;
  if (inf) sprite(INF, cx - 9, top - 12, 2, { X: 'bone' }, 'inf');
  else if (am && am.kick > 0) text3c('RELOAD', cx, ly, 'yellow', 1, 'void');
  else if (am && am.magEmpty) text3c('RELOAD', cx, ly, blink, 1, 'void');
  else if (am && am.empty && ((t * 4) | 0) % 2 === 0) text3c('EMPTY', cx, ly, 'red', 1, 'void');
  else if (am && am.flash > 0) text3c('EMPTY', cx, ly, 'red', 1, 'void');
  else if (g.cap > 16) text3c(String(n), cx, ly, hot ? 'orange' : 'bone', 1, 'void');
  // casings queued by HUD.eject / the rival's count drops
  const layer = ctx === R.hx ? 'hx' : 'ox';
  for (; st.pend > 0; st.pend--) {
    const ep = am && am.gun && layer === 'hx' ? gunEject() : null;
    if (ep) spawnCasing('hx', ep.kind, ep.x, ep.y, ep.dx * (80 + Math.random() * 30), ep.dy * 60 - 120 - Math.random() * 40, RH - 3);
    else spawnCasing(layer, kind || 'guncon', mirror ? x + 4 : x + g.W - 5, top + 2, (mirror ? -1 : 1) * (45 + Math.random() * 30), -(120 + Math.random() * 40), yb - 3);
  }
  return g;
}
// ---------- casings ----------
const CAS_ART = {   // lying on their side, rim on the left (skin ids: guncon AQUA PRO, justifier HOT ROD, zapper RAY-85, revolver CANDY SIX)
  guncon: { rows: ['RLLLLLL', 'RYYYYYY', 'RAAAAAA', 'RTTTTTT'], key: { R: 'rust', L: 'lemon', Y: 'yellow', A: 'amber', T: 'orange' } },                 // brass pistol case 7x4
  justifier: { rows: ['RLLLLLLL...', 'RYYYYYYYYYY', 'RAAAAAAAAAA', 'RTTTTTTT...'], key: { R: 'rust', L: 'lemon', Y: 'yellow', A: 'amber', T: 'orange' } },   // longer bottlenecked rifle case 11x4
  zapper: { rows: ['hbbObbh', 'hblOlbh', 'hslOlsh', 'hssOssh', 'hrrOrrh'], key: { h: 'haze', b: 'bone', l: 'lemon', s: 'sand', O: 'orange', r: 'rust' }, glow: 1 },   // spent energy cell 7x5, cream + glowing band
  revolver: { rows: ['Mbggbgg', 'Mppbppb', 'Mpbppbp', 'MbPPbPP'], key: { M: 'plum', g: 'bubblegum', p: 'pink', P: 'magenta', b: 'bone' } }                    // candy-striped case 7x4
};
function casImg(kind, k) {
  const A = CAS_ART[kind] || CAS_ART.guncon, w = A.rows[0].length, h = A.rows.length, D = Math.ceil(Math.hypot(w, h)) + 2;
  return cached('cas|' + kind + '|' + k, D, D, g => {
    const an = k * Math.PI / 4, cs = Math.cos(an), sn = Math.sin(an), c = D / 2, grid = new Array(D * D).fill(null);
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, sx = Math.floor(cs * dx + sn * dy + w / 2), sy = Math.floor(-sn * dx + cs * dy + h / 2);
      const ch = sx >= 0 && sx < w && sy >= 0 && sy < h ? A.rows[sy][sx] : '.';
      if (ch !== '.') grid[y * D + x] = ch === 'O' && A.glow ? (k & 1 ? 'lemon' : 'orange') : A.key[ch];   // the cell's band flickers
    }
    const nb = (xx, yy) => xx >= 0 && yy >= 0 && xx < D && yy < D && grid[yy * D + xx];
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const v = grid[y * D + x];
      if (v) prect(g, x, y, 1, 1, v);
      else if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) prect(g, x, y, 1, 1, 'void');
    }
  });
}
const CAS = [], CAS_MAX = 8, CAS_LIFE = 0.8, casT = { hx: null, ox: null };
function spawnCasing(layer, kind, x, y, vx, vy, floor) {
  if (CAS.length >= CAS_MAX) CAS.shift();
  CAS.push({ layer, kind, x, y, vx, vy, a: Math.random() * 6.28, va: (vx >= 0 ? 1 : -1) * (18 + Math.random() * 12), age: 0, floor, b: 0 });
}
// step + draw one layer's casings ('hx' = the game HUD, 'ox' = the portrait strip); t = game clock
function drawCasings(layer, t) {
  const last = casT[layer]; casT[layer] = t;
  const dt = last == null ? 0 : Math.max(0, Math.min(0.05, t - last));
  for (let i = CAS.length - 1; i >= 0; i--) {
    const c = CAS[i]; if (c.layer !== layer) continue;
    c.age += dt; if (c.age > CAS_LIFE) { CAS.splice(i, 1); continue; }
    c.vy += 900 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt;
    if (c.y > c.floor && c.vy > 0) { c.y = c.floor; c.vy = c.b < 2 ? -c.vy * 0.35 : 0; c.vx *= 0.55; c.va *= 0.5; c.b++; }   // bounce on the frame bottom
    if (c.age > CAS_LIFE - 0.18 && ((c.age * 30) | 0) % 2) continue;    // fade = a quick flicker out (the HUD has no alpha)
    const img = casImg(c.kind, ((Math.round(c.a / (Math.PI / 4)) % 8) + 8) % 8);
    draw(img, c.x - img.width / 2, c.y - img.height / 2);
  }
}
// the on-screen gun's ejection port in HUD px + its screen direction (desktop landscape only), or null
let _ep = null;
function gunEject() {
  const G = B.G, gun = G && G.gun;
  if (!gun || typeof gun.ejectPoint !== 'function' || G.touch || R.frame.portrait || !R.camera) return null;
  const e = gun.ejectPoint(); if (!e) return null;
  _ep = _ep || e.pos.clone();
  _ep.copy(e.pos).project(R.camera); if (_ep.z > 1) return null;
  const x0 = (_ep.x + 1) / 2 * RW, y0 = (1 - _ep.y) / 2 * RH;
  _ep.copy(e.pos).addScaledVector(e.dir, 0.06).project(R.camera);
  let dx = (_ep.x + 1) / 2 * RW - x0, dy = (1 - _ep.y) / 2 * RH - y0; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  return { x: x0, y: y0, dx, dy, kind: e.kind };
}
// main.js playFire: a real shot by this player (one casing)
function eject(pl) { if (!pl) return; const st = magState(pl); st.hooked = true; st.pend = Math.min(st.pend + 1, CAS_MAX); }
const skinKind = () => { const G = B.G; return (G && G.gun && G.gun.skinId) || 'guncon'; };
const magKind = pl => pl && pl.ammo && pl.ammo.gun ? skinKind() : 'guncon';   // the rival's skin isn't synced: brass
function hearts(x, y, n, max, right) {
  for (let i = 0; i < max; i++) {
    const hx = right ? x - 9 - i * 10 : x + i * 10;
    sprite(HEART, hx, y, 1, i < n ? HEART_KEY : HEART_OFF, i < n ? 'heart' : 'heartoff');
  }
}
// HIT! badge: small and short (0.35 s), sits beside the ammo shell, never at the aim point
const HIT_LIFE = 0.35;
function hitBadge(x, y, age) {
  if (age < 0 || age > HIT_LIFE) return;
  if (age > HIT_LIFE - 0.08 && ((age * 40) | 0) % 2) return;
  const pop = age < 0.05 ? 1 : 0;
  box(x - pop, y - pop, 31 + 2 * pop, 13 + 2 * pop, pop ? 'lemon' : 'yellow', 'lemon', 'orange');
  text7('HIT!', x + 4, y + 3, 1, 'void', null, 0);
}
// timer ball: bone disc + draining ring (yellow, red blinking when low)
function ballBase() {
  return pixImg('ballbase', 35, 35, (x, y) => {
    const dx = x + 0.5 - 17.5, dy = y + 0.5 - 17.5, d = Math.hypot(dx, dy);
    if (d > 17) return null; if (d > 15.8) return 'void'; if (d > 12.4) return 'navy'; if (d > 11.6) return 'void';
    if (Math.hypot(dx + 5, dy + 5) < 2.2) return 'bone';
    return dx + dy > 9 ? 'mist' : 'bone';
  });
}
function ballRing(steps, c) {
  return pixImg('ring' + steps + c, 35, 35, (x, y) => {
    const dx = x + 0.5 - 17.5, dy = y + 0.5 - 17.5, d = Math.hypot(dx, dy);
    if (d > 15.4 || d <= 12.6) return null;
    let a = Math.atan2(dx, -dy) / (Math.PI * 2); if (a < 0) a += 1;
    return a <= steps / 64 ? c : null;
  });
}
function timerBall(cx, cy, frac, secs, t) {
  const x = cx - 17, y = cy - 17;
  draw(ballBase(), x, y);
  const steps = Math.max(0, Math.min(64, Math.ceil(frac * 64)));
  const warn = secs <= 5, c = warn ? (((t * 4) | 0) % 2 ? 'red' : 'orange') : secs <= 10 ? 'orange' : 'yellow';
  if (steps > 0) draw(ballRing(steps, c), x, y);
  const s = String(Math.max(0, secs)), sc = s.length > 2 ? 1 : 2;
  text3c(s, cx + 1, cy - (sc === 2 ? 5 : 2), warn ? 'crimson' : 'void', sc);
}
// practice clock: the timer ball with an infinity glyph (no countdown) and a lime stopwatch sweep (one lap a minute);
// the running time practised sits under it as M:SS
function practiceBall(cx, cy, secs, t) {
  const x = cx - 17, y = cy - 17;
  draw(ballBase(), x, y);
  const steps = Math.max(1, Math.ceil((secs % 60) / 60 * 64));
  draw(ballRing(steps, 'lime'), x, y);
  sprite(INF, cx - 8, cy - 5, 2, { X: 'void' }, 'infv');
}
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function quotaPill(x, y, hits, quota) {
  const ok = hits >= quota;
  pill(x, y, 46, 14, ok ? 'green' : 'blue', ok ? 'lime' : 'cyan', ok ? 'forest' : 'deepblue');
  text3c(ok ? 'CLEAR' : hits + '/' + quota, x + 23, y + 2, 'bone', 2);
  text3c('HITS', x + 23, y - 7, 'mist', 1, 'void');
}
function counter(x, y, n, p) {                 // versus hit counter in the player colour
  const C = PCOL[p];
  box(x, y, 28, 15, C[1], C[0], C[2]);
  text3c(String(n).padStart(2, '0'), x + 14, y + 3, 'bone', 2);
}
// small blinking RELOAD prompt next to the aim point (empty magazine). u,v in the game rect; below the point,
// above it near the bottom edge (the HUD strip lives there)
function reloadPrompt(u, v, t) {
  const x = Math.round(u * RW), y = Math.round(v * RH), below = y < RH - 60;   // letters only: red <-> white at 2 Hz
  text3c('RELOAD', Math.max(14, Math.min(RW - 14, x)), below ? y + 10 : y - 16, ((t * 4) | 0) % 2 ? 'bone' : 'red', 1, 'void');
}
// Frame RELOAD markers (#31, build 0.005 #38). Stacked items: vertical on a pillar (dir 'l' / 'r'), horizontal on
// a top / bottom bar (dir 'u' / 'd'). kind (from the RELOAD TYPE):
//   'arcade' (ARCADE / TAP SIDES): "< R E L O A D <", arrows pointing outward
//   'mouse'  (RIGHT CLICK): a pixel mouse with the right button lit + RELOAD
//   'swipe'  (SWIPE DOWN): SWIPE + a downward arrow
// st: 'dim' (quiet plaque, magazine not empty) | 'hotR' / 'hotW' (empty: ONLY the letters / arrows switch red <->
// white at 2 Hz, one size up and bold, with a thin dark outline; no box, nothing behind them flashes) |
// 'kick' (reload just triggered: steady lemon letters for ammo.kick, no box, no strobe)
const MK = { dim: ['midnight', 'slate', 'haze'], hotR: [null, null, 'red'], hotW: [null, null, 'bone'], kick: [null, null, 'lemon'] };
MK.on = MK.flash = MK.kick; MK.blink = MK.hotW; MK.rel = MK.kick;       // pre-0.005 names (old callers)
const HOT = { hotR: 1, hotW: 1 }, BARE = { hotR: 1, hotW: 1, kick: 1 };   // BARE: drawn without a plaque
function arrowGlyph(x, y, dir, c, sc) {         // 3x5 (or 5x3) solid arrow head pointing dir
  for (let i = 0; i < 3; i++) {                 // i = column (l / r) or row (u / d); the tip is 1 cell
    const grow = 1 + 2 * i, o = 2 - i;          // tip at i = 0 for l / u
    if (dir === 'l') rect(x + i * sc, y + o * sc, sc, grow * sc, c);
    else if (dir === 'r') rect(x + (2 - i) * sc, y + o * sc, sc, grow * sc, c);
    else if (dir === 'u') rect(x + o * sc, y + i * sc, grow * sc, sc, c);
    else rect(x + o * sc, y + (2 - i) * sc, grow * sc, sc, c);
  }
}
const MOUSE = ['.vvvvv.', 'vLLvRRv', 'vLLvRRv', 'vLLvRRv', 'vvvvvvv', 'vBBBBBv', 'vBBBBBv', 'vBBBBBv', '.vvvvv.'];
const SWIPE_L = ['..X..', '..X..', '..X..', '..X..', 'XXXXX', '.XXX.', '..X..'];   // pillars
const SWIPE_S = ['..X..', 'XXXXX', '.XXX.', '..X..'];                                // bars
const ALLVOID = { v: 'void', L: 'void', B: 'void', R: 'void', X: 'void' };
// items: { w, h, d(x, y, c, sil) }: c = ink colour; sil = draw the dark silhouette (outline pass) instead
function markerItems(dir, sc, kind, st) {
  const vert = dir === 'l' || dir === 'r', b = HOT[st] ? 1 : 0, out = [];
  const txt = (s, x, y, c) => { text3(s, x, y, c, sc); if (b) text3(s, x + 1, y, c, sc); };
  const glyph = ch => ({ w: 3 * sc + b, h: 5 * sc, d: (x, y, c) => txt(ch, x, y, c) });
  const word = w => vert ? w.split('').forEach(ch => out.push(glyph(ch)))
    : out.push({ w: w.length * 4 * sc - sc + b, h: 5 * sc, d: (x, y, c) => txt(w, x, y, c) });
  const arrow = () => out.push({ w: (vert ? 3 : 5) * sc, h: (vert ? 5 : 3) * sc, d: (x, y, c) => arrowGlyph(x, y, dir, c, sc) });
  const spr = (rows, u, key, id) => out.push({ w: rows[0].length * u, h: rows.length * u,
    d: (x, y, c, sil) => sil ? sprite(rows, x, y, u, ALLVOID, id + 'v') : sprite(rows, x, y, u, key(c), id) });
  if (kind === 'mouse') {
    const u = vert ? Math.max(1, sc - 1) : sc;                              // bars: about the word's height
    spr(MOUSE, u, c => ({ v: 'void', L: st === 'dim' ? 'slate' : 'mist', B: st === 'dim' ? 'haze' : 'bone',
      R: st === 'dim' ? 'crimson' : st === 'kick' ? 'lemon' : 'red' }), 'mouse');
    word('RELOAD');
  } else if (kind === 'swipe') {
    word('SWIPE');
    spr(vert ? SWIPE_L : SWIPE_S, vert ? sc : Math.max(1, sc - 1), c => ({ X: c }), vert ? 'swl' : 'sws');
  } else { arrow(); word('RELOAD'); arrow(); }
  return out;
}
function markerSize(dir, sc, kind, st) {
  const vert = dir === 'l' || dir === 'r', it = markerItems(dir, sc, kind, st), gap = 2 * sc;
  const along = it.reduce((a, i) => a + (vert ? i.h : i.w), 0) + gap * (it.length - 1) + 6;
  const across = Math.max(...it.map(i => vert ? i.w : i.h)) + 6;
  return vert ? { w: across, h: along, it, gap } : { w: along, h: across, it, gap };
}
function reloadMarker(cx, cy, dir, st, sc = 1, kind = 'arcade') {
  const C = MK[st] || MK.dim, vert = dir === 'l' || dir === 'r', m = markerSize(dir, sc, kind, st), bare = !!BARE[st];
  const x = Math.round(cx - m.w / 2), y = Math.round(cy - m.h / 2);
  if (!bare) box(x, y, m.w, m.h, C[0], C[1], null);
  const pos = [];
  let p = vert ? y + 3 : x + 3;
  for (const i of m.it) {
    if (vert) { pos.push([i, Math.round(x + (m.w - i.w) / 2), p]); p += i.h + m.gap; }
    else { pos.push([i, p, Math.round(y + (m.h - i.h) / 2)]); p += i.w + m.gap; }
  }
  // bare (no plaque): a 1 px dark outline keeps the letters readable on the striped pillar / bar
  if (bare) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (const [i, ix, iy] of pos) i.d(ix + ox, iy + oy, 'void', true);
  for (const [i, ix, iy] of pos) i.d(ix, iy, C[2], false);
  return m;
}
// marker state from the HUD state's reload block { empty, kick } at time t
function markerState(r, t) {
  if (!r) return '';
  if (r.kick > 0) return 'kick';
  if (r.empty) return ((t * 4) | 0) % 2 ? 'hotW' : 'hotR';                  // red <-> white, 2 Hz, letters only
  return 'dim';
}
const markerKind = mode => mode === 'rclick' ? 'mouse' : mode === 'swipe' ? 'swipe' : 'arcade';
function crosshair(u, v, hot) {
  const x = Math.round(u * RW - 0.5), y = Math.round(v * RH - 0.5), g = hot ? 4 : 2, c = hot ? 'yellow' : 'bone';
  const bars = [[x - g - 5, y, 5, 1], [x + g + 1, y, 5, 1], [x, y - g - 5, 1, 5], [x, y + g + 1, 1, 5]];
  for (const [a, b, w, h] of bars) rect(a - 1, b - 1, w + 2, h + 2, 'void');
  rect(x - 1, y - 1, 3, 3, 'void');
  for (const [a, b, w, h] of bars) rect(a, b, w, h, c);
  rect(x, y, 1, 1, 'red');
}
// the bottom strip. box = {x, y, w}; hs = HUD state from main.js (see ENGINE.md); compact = portrait strip.
// #72: the magazine stands at the strip's left edge (P2: right edge, mirrored), its bottom on the frame bottom
// (landscape) / by + 45 (portrait); everything that sat right of the old shell now starts 4 px right of the clip.
function strip(bx, by, w, hs, t, compact) {
  const P = hs.players, me = P[0], mb = compact ? by + 45 : by + 35;
  if (hs.practice) {
    // practice: magazine (no hearts, nothing to lose) | HIT badge ... the middle stays free for Deputy Duck ... | clock + HITS
    const m = magPrep(me, t), mx = bx + magDraw(m, bx, mb, 0, false, t, magKind(me)).W + 4;
    hitBadge(mx, by + 1, me.hitAge);
    const cx = compact ? bx + w / 2 + 6 : bx + 100;
    practiceBall(cx, by + 15, hs.practice.secs, t);
    text3c(mmss(hs.practice.secs), cx, by - 9, 'lime', 1, 'void');
    pill(cx + 20, by + 8, 30, 14, 'blue', 'cyan', 'deepblue'); text3c(String(me.hits), cx + 35, by + 10, 'bone', me.hits > 99 ? 1 : 2);
    text3c('HITS', cx + 35, by + 1, 'mist', 1, 'void');
    if (hs.practice.streak > 1) text3('STREAK ' + hs.practice.streak, mx, by + 21, 'yellow', 1, 'void');
    if (hs.status && compact) text3(hs.status, mx, by + 30, 'lime', 1, 'void');
  } else if (!hs.versus) {
    // solo: magazine | hearts + HIT badge | timer ball | quota pill
    const m = magPrep(me, t), mx = bx + magDraw(m, bx, mb, 0, false, t, magKind(me)).W + 4;
    hearts(mx, by + 19, me.lives, me.maxLives);
    hitBadge(mx, by + 1, me.hitAge);
    const cx = compact ? bx + w / 2 + 6 : RW / 2;
    timerBall(cx, by + 15, hs.timeFrac, hs.secs, t);
    quotaPill(cx + 22, by + 8, me.hits, hs.quota);
    if (hs.status) text3(hs.status, mx, by + 30, 'lime', 1, 'void');
    if (compact) text3('SCORE ' + String(hs.score).padStart(6, '0') + (hs.best ? '   BEST ' + hs.best : ''), mx, by + 38, 'bone', 1, 'void');
  } else {
    // versus: two mirrored halves (P1 red left, P2 blue right), timer in the middle; each clip in its own half
    const L = P[0], Rp = P[1], right = bx + w;
    const cx = compact ? bx + w / 2 : RW / 2;
    const ml = magPrep(L, t), lx = bx + magDraw(ml, bx, mb, 0, false, t, magKind(L)).W + 4;
    hearts(lx, by + 19, L.lives, L.maxLives);
    counter(lx, by + 1, L.hits, 0); hitBadge(lx, by - 15, L.hitAge);
    if (compact) text3(L.name, lx, by - 8, 'coral', 1, 'void'); else text3(L.name, lx + 32, by + 6, 'coral', 1, 'void');
    const mr = magPrep(Rp, t), rx = right - mr.g.W;
    magDraw(mr, rx, mb, 1, true, t, magKind(Rp));
    hearts(rx - 4, by + 19, Rp.lives, Rp.maxLives, true);
    counter(rx - 32, by + 1, Rp.hits, 1); hitBadge(rx - 35, by - 15, Rp.hitAge);
    if (compact) text3r(Rp.name, rx - 4, by - 8, 'ice', 1, 'void'); else text3r(Rp.name, rx - 36, by + 6, 'ice', 1, 'void');
    timerBall(cx, by + 15, hs.timeFrac, hs.secs, t);
    if (hs.status) text3c(hs.status, cx, by + 32, 'lime', 1, 'void');
  }
}
// landscape game HUD (on the 426x240 grid); the mini duck owns the bottom-left corner (x < 42)
function drawPlay(hs, t) {
  if (!hs.portrait) strip(44, RH - 37, RW - 48, hs, t, false);
  // score + best, top-left; stage label top-right
  if (!hs.versus && !hs.portrait) {
    text3('SCORE ' + String(hs.score).padStart(6, '0'), 4, 4, 'bone', 1, 'void');
    if (hs.best) text3('BEST  ' + String(hs.best).padStart(6, '0'), 4, 11, 'haze', 1, 'void');
  }
  if (hs.label) text3r(hs.label, RW - 4, 4, 'yellow', 1, 'void');
  drawCasings('hx', t);                                  // #72: casings fly over the gun and the strip
}
Object.assign(H, { shell, mag: magDraw, magPrep, magGeom, eject, drawCasings, gunEject, casImg, hearts, hitBadge, timerBall, quotaPill, counter, crosshair, reloadPrompt, reloadMarker, markerState, markerSize, markerKind, strip, drawPlay, HIT_LIFE, PCOL });

// =========================================================================================
// Panels and icons for the briefing card / results / menus
// =========================================================================================
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function stoneBanner(x, y, w, h) {
  draw(pixImg('stone' + w + 'x' + h, w, h, (px, py) => {
    if (px === 0 || py === 0 || px === w - 1 || py === h - 1) return ((px === 0 || px === w - 1) && (py === 0 || py === h - 1)) ? null : 'void';
    if (py === 1) return 'bone'; if (py >= h - 3) return py === h - 2 ? 'steel' : 'haze';
    if (px <= 2 || px >= w - 3) return 'haze';
    const n = hash(px >> 1, py >> 1), v = hash(px * 3 + 7, py * 5 + 1);
    if (v > 0.985) return 'steel';                                           // speckles + faint veins
    if (Math.abs(Math.sin(px * 0.045 + py * 0.11 + n * 0.8)) < 0.035) return 'haze';
    return n > 0.82 ? 'bone' : 'mist';
  }), x, y);
}
function redPanel(x, y, w, h) {
  draw(pixImg('redp' + w + 'x' + h, w, h, (px, py) => {
    const cx = Math.min(px, w - 1 - px), cy = Math.min(py, h - 1 - py);
    if (cx + cy < 3) return cx + cy === 2 ? 'void' : null;                   // cut corners
    if (cx === 0 || cy === 0) return 'void';
    if (cx < 6 || cy < 6) {
      const e = Math.min(cx, cy);
      if (e === 1) return py < h / 2 && cy === 1 ? 'coral' : 'red';
      if (e === 5) return 'oxblood';
      return (py > h - 7 || px > w - 7) ? 'crimson' : 'red';
    }
    if (cx === 6 || cy === 6) return 'void';
    return 'void';
  }), x, y);
}
function plate(x, y, w, h) {                     // brass plate with rivets (results)
  draw(pixImg('plate' + w + 'x' + h, w, h, (px, py) => {
    const cx = Math.min(px, w - 1 - px), cy = Math.min(py, h - 1 - py);
    if (cx + cy < 2) return null;
    if (cx === 0 || cy === 0) return 'void';
    if ((cx === 4 || cx === 5) && (cy === 4 || cy === 5) || (cy >= 4 && cy <= 5 && Math.abs(px - w / 2) < 1.5)) return (cx === 4 || cy === 4) ? 'lemon' : 'rust';
    if (cy === 1) return 'yellow'; if (cy === 2 && py < h / 2) return 'amber';
    if (py >= h - 3) return 'rust';
    return hash(px >> 2, py) > 0.93 ? 'tan' : 'amber';
  }), x, y);
}
function sticker(x, y, w, h) {
  box(x, y, w, h, 'yellow', 'lemon', 'amber');
  rect(x + 2, y + h - 1, w - 3, 1, 'orange');
}
function starburst(cx, cy, r, rot, c1 = 'yellow', c2 = 'orange', spikes = 12) {
  const st = ((rot % (Math.PI * 2 / spikes)) / (Math.PI * 2 / spikes) * 6) | 0;
  const img = pixImg('burst' + r + c1 + c2 + spikes + '|' + st, r * 2 + 2, r * 2 + 2, (x, y) => {
    const dx = x - r - 0.5, dy = y - r - 0.5, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) + st / 6 * (Math.PI * 2 / spikes);
    const k = Math.abs(((a / (Math.PI * 2) * spikes) % 1 + 1) % 1 - 0.5) * 2;   // 0 at spike centre .. 1 between
    const edge = r * (0.62 + 0.38 * (1 - k));
    if (d > edge + 1) return null; if (d > edge) return 'void';
    return d < r * 0.5 ? c1 : (k < 0.5 ? c1 : c2);
  });
  draw(img, cx - r - 1, cy - r - 1);
}
function bullseyeIcon(cx, cy, r) {
  draw(pixImg('bull' + r, r * 2 + 4, r * 2 + 4, (x, y) => {
    const d = Math.hypot(x - r - 1.5, y - r - 1.5) / r;
    if (d > 1.12) return null; if (d > 1) return 'void';
    return d <= 0.28 ? 'yellow' : d <= 0.48 ? 'red' : d <= 0.66 ? 'bone' : d <= 0.84 ? 'red' : 'bone';
  }), cx - r - 2, cy - r - 2);
}
function bombIcon(cx, cy, r, t = 0) {
  draw(pixImg('bomb' + r, r * 2 + 4, r * 2 + 4, (x, y) => {
    const dx = x - r - 1.5, dy = y - r - 1.5, d = Math.hypot(dx, dy) / r;
    if (d > 1.1) return null; if (d > 1) return 'void';
    if (dx < -r * 0.3 && dy < -r * 0.3 && d > 0.55 && d < 0.8) return 'slate';
    return d > 0.86 ? 'red' : 'void';
  }), cx - r - 2, cy - r - 2);
  const sc = Math.max(1, Math.round(r / 6));
  sprite(SKULL, cx - 3.5 * sc, cy - 3 * sc, sc, { X: 'bone' }, 'skull');
  rect(cx - 1, cy - r - 4, 2, 4, 'walnut');                                  // fuse
  const f = ((t * 10) | 0) % 2; rect(cx - 1 + f, cy - r - 6, 2, 2, f ? 'lemon' : 'orange');
}
function redX(cx, cy, s) {
  for (let i = -s; i <= s; i++) { rect(cx + i - 2, cy + i - 2, 4, 4, 'void'); rect(cx + i - 2, cy - i - 2, 4, 4, 'void'); }
  for (let i = -s; i <= s; i++) { rect(cx + i - 1, cy + i - 1, 2, 2, 'red'); rect(cx + i - 1, cy - i - 1, 2, 2, 'red'); }
}
// "SHOOT 10 TARGETS OR MORE." from parts [[text, colour], ...]
function ruleLine(parts, cx, y, sc) {
  const full = parts.map(p => p[0]).join(''); let x = Math.round(cx - text3w(full, sc) / 2);
  for (const [s, c] of parts) { text3(s, x, y, c, sc); x += String(s).length * 4 * sc; }
}

// =========================================================================================
// Outer canvas: our carnival pillar frame (+ the HUD strip in portrait)
// =========================================================================================
let outerBase = null, outerKey = '', bulbs = [], bulbStep = -1, mkSpots = [], mkLast = '';
function buildOuter(fr) {
  const o = fr.outer, OW = o.OW, OH = o.OH;
  const gx = Math.round(o.gx), gy = Math.round(o.gy), gw = Math.round(o.gw), gh = Math.round(o.gh);
  const [cv, g] = R.pixCanvas(OW, OH); bulbs = []; mkSpots = [];
  const P = (x, y, w, h, c) => prect(g, x, y, w, h, c);
  P(0, 0, OW, OH, '#05050c');
  for (let y = 0; y < OH; y += 4) for (let x = (y >> 2) & 1 ? 2 : 0; x < OW; x += 4) P(x, y, 1, 1, 'midnight');   // sparse dot grid
  const sideW = [gx, OW - gx - gw], vertH = [gy, OH - gy - gh];
  // side pillars (landscape bars)
  [0, 1].forEach(side => {
    const bw = sideW[side]; if (bw < 2) return;
    const edge = side ? gx + gw : gx - 1, dir = side ? 1 : -1;
    const col = (i, c) => P(edge + dir * i, gy, 1, gh, c);
    col(0, 'lemon'); if (bw > 1) col(1, 'amber'); if (bw > 2) col(2, 'rust');
    if (bw >= 10) {                                                          // bulb channel
      for (let i = 3; i < 9; i++) col(i, i === 3 || i === 8 ? 'void' : 'plum');
      for (let y = gy + 3; y < gy + gh - 3; y += 6) bulbs.push([edge + dir * 5 - (side ? 0 : 1), y]);
    }
    if (bw >= 22) {                                                          // candy-striped column with capitals
      const cw = Math.min(bw - 11, 36), x0 = side ? edge + 9 : edge - 8 - cw;
      for (let y = gy; y < gy + gh; y++) for (let x = 0; x < cw; x++) {
        const s = ((x + y) >> 2) & 1, ed = x === 0 || x === cw - 1;
        P(x0 + x, y, 1, 1, ed ? 'void' : s ? 'pink' : 'plum');
      }
      for (let k = 0; k < 2; k++) {                                          // stepped wooden capitals
        const y = k ? gy + gh - 10 : gy;
        P(x0 - 2, y, cw + 4, 10, 'void'); P(x0 - 1, y + 1, cw + 2, 8, 'chestnut'); P(x0 - 1, y + 1, cw + 2, 2, 'tan'); P(x0 - 1, y + 7, cw + 2, 2, 'walnut');
      }
      for (let y = gy + 26; y < gy + gh - 24; y += 44) {                     // hex-plate medallions (#50: match the range target)
        const cx = x0 + cw / 2, r = Math.min(7, (cw >> 1) - 2);
        for (let yy = -r - 1; yy <= r + 1; yy++) for (let xx = -r - 1; xx <= r + 1; xx++) {
          const d = Math.max(Math.abs(yy), Math.abs(xx) * 0.866 + Math.abs(yy) * 0.5) / r; if (d > 1.18) continue;
          P(Math.round(cx + xx), y + yy, 1, 1, d > 1 ? 'void' : d < 0.3 ? 'yellow' : d < 0.5 ? 'void' : d < 0.68 ? 'lime' : d < 0.84 ? 'void' : 'lime');
        }
      }
    }
  });
  // RELOAD markers (#31): vertical on the side pillars; on the top / bottom bars when there are no pillars
  // (portrait phones, windows taller than 16:9). None when the game rect fills the canvas (main.js falls back
  // to an edge zone drawn on the HUD).
  if (sideW[0] >= 9 && sideW[1] >= 9) {
    [0, 1].forEach(side => {
      const bw = sideW[side], edge = side ? gx + gw : gx - 1, cw = Math.min(bw - 11, 36);
      const cx = bw >= 22 ? (side ? edge + 9 + cw / 2 : edge - 8 - cw / 2) : (side ? gx + gw + bw / 2 : gx - bw / 2);
      // [cx, cy, dir, sc, room across, room along] (the room decides whether the empty-mag marker can go one size up)
      mkSpots.push([cx, gy + gh / 2, side ? 'r' : 'l', bw >= 30 && gh >= 150 ? 2 : 1, bw >= 22 ? cw + 2 : bw - 2, gh - 24]);
    });
  } else if (vertH[0] >= 9 && vertH[1] >= 9) {
    // bars: cy = the game rect edge; drawOuter centres the plaque in the bar, hugging the edge when the bar is tall
    mkSpots.push([gx + gw / 2, gy, 'u', 1, vertH[0], gw - 4], [gx + gw / 2, gy + gh, 'd', 1, vertH[1], gw - 4]);
  }
  // top / bottom bars (portrait): valance with bulbs on top, wooden HUD shelf below
  [0, 1].forEach(side => {
    const bh = vertH[side]; if (bh < 2) return;
    const edge = side ? gy + gh : gy - 1, dir = side ? 1 : -1;
    const row = (i, c) => P(gx, edge + dir * i, gw, 1, c);
    row(0, 'lemon'); if (bh > 1) row(1, 'amber'); if (bh > 2) row(2, 'rust');
    if (bh >= 10) {
      for (let i = 3; i < 9; i++) row(i, i === 3 || i === 8 ? 'void' : 'plum');
      for (let x = gx + 3; x < gx + gw - 3; x += 6) bulbs.push([x, edge + dir * 5 - (side ? 0 : 1)]);
    }
    if (side === 0 && bh >= 24) {                                            // curtain valance
      const y1 = edge - 9;
      for (let y = 0; y <= y1; y++) for (let x = 0; x < OW; x++) {
        const f = (x % 10), fold = f < 2 ? 'oxblood' : f < 4 ? 'crimson' : f < 8 ? 'red' : 'crimson';
        const sc = y1 - y < 3 - Math.abs(f - 5) * 0.6;                        // scalloped hem
        if (!sc) P(x, y, 1, 1, y1 - y < 5 ? (f < 2 ? 'rust' : 'amber') : fold);
      }
    }
    if (side === 1 && bh >= 24) {
      const y0 = edge + 9;
      P(0, y0, OW, OH - y0, 'navy');
      for (let y = y0; y < OH; y += 6) P(0, y, OW, 1, 'midnight');
      P(0, y0, OW, 1, 'void');
    }
  });
  outerBase = cv;
}
// draw the outer canvas; hs (optional) = play HUD state for the portrait strip; extra(ctx, layout) for menus
function drawOuter(fr, t, hs) {
  const o = fr.outer, key = [o.OW, o.OH, o.gx, o.gy, o.gw, o.gh].join(',');
  if (key !== outerKey) { outerKey = key; buildOuter(fr); bulbStep = -1; }
  const step = Math.floor(t * 9), portrait = fr.portrait, mk = markerState(hs && hs.reload, t);
  const kind = markerKind(hs && hs.reload && hs.reload.mode), mkKey = mk + '|' + kind;
  if (step === bulbStep && mkKey === mkLast && !portrait) return;
  bulbStep = step; mkLast = mkKey;
  const prev = ctx; ctx = R.ox;
  ctx.drawImage(outerBase, 0, 0);
  bulbs.forEach(([x, y], i) => rect(x, y, 2, 2, (i + step) % 3 === 0 ? 'lemon' : (i + step) % 3 === 1 ? 'amber' : 'rust'));
  if (mk) for (const [x, y, dir, sc, room, roomAlong] of mkSpots) {
    const vert = dir === 'l' || dir === 'r';
    let s = sc;
    if (HOT[mk]) { const m = markerSize(dir, sc + 1, kind, mk); if ((vert ? m.w : m.h) <= room && (vert ? m.h : m.w) <= roomAlong) s = sc + 1; }   // empty: one size up when it fits
    if (vert) reloadMarker(x, y, dir, mk, s, kind);
    else { const h = markerSize(dir, s, kind, mk).h, off = Math.min(room / 2, h / 2 + 2); reloadMarker(x, dir === 'u' ? y - off : y + off, dir, mk, s, kind); }
  }
  if (portrait) {
    const gy = Math.round(o.gy), gh = Math.round(o.gh), topH = gy;
    if (hs && hs.panel) hs.panel({ W: o.OW, H: o.OH, top: gy, bot: gy + gh, cx: Math.round(o.OW / 2) });   // tall phone: the screen's own layout
    else {
      if (topH >= 34) {                                                      // embossed logo in the valance
        const w = text7w('B.L.A.M.', 2);
        text7('B.L.A.M.', Math.round(o.OW / 2 - w / 2), Math.max(3, Math.round(topH / 2 - 16)), 2, 'gold', 'void', 2);
      }
      const sy = gy + gh + 22, sw = Math.min(o.OW - 8, 230), sx = Math.round((o.OW - sw) / 2);
      if (hs && hs.players && sy + 46 < o.OH) { strip(sx, sy, sw, Object.assign({}, hs, { status: hs.status }), t, true); drawCasings('ox', t); }
      else if (hs && hs.menuLine) text3c(hs.menuLine, o.OW / 2, sy, 'lime', 1, 'void');
    }
    if (hs && hs.toast) text3c(hs.toast, o.OW / 2, Math.max(2, gy - 20), 'yellow', 1, 'void');   // toasts sit just above the game rect
  }
  ctx = prev;
  R.outerDirty = true;
}
H.markerSpots = () => mkSpots;
Object.assign(H, { stoneBanner, redPanel, plate, sticker, starburst, bullseyeIcon, bombIcon, redX, ruleLine, drawOuter, hash });
})(window.BLAM);
