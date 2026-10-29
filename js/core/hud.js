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
  const rel = ammo && ammo.reloading, fl = rel && ((t * 12) | 0) % 2 === 0;
  draw(shellImg(p, mirror, fl), x, y);
  const cx = x + (mirror ? 18 : 29);
  if (!ammo || ammo.infinite) sprite(INF, cx - 9, y + 4, 2, { X: 'bone' }, 'inf');
  else if (rel) text3c('...', cx, y + 4, 'void', 2);
  else text3c(String(ammo.count), cx, y + 4, ammo.count === 0 ? 'oxblood' : 'bone', 2);
  if (rel) text3c('RELOAD', x + 24, y - 7, 'yellow', 1, 'void');
  else if (ammo && ammo.empty && ((t * 4) | 0) % 2 === 0) text3c('EMPTY', x + 24, y - 7, 'red', 1, 'void');
  else if (ammo && ammo.flash > 0) text3c('EMPTY', x + 24, y - 7, 'red', 1, 'void');
}
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
function crosshair(u, v, hot) {
  const x = Math.round(u * RW - 0.5), y = Math.round(v * RH - 0.5), g = hot ? 4 : 2, c = hot ? 'yellow' : 'bone';
  const bars = [[x - g - 5, y, 5, 1], [x + g + 1, y, 5, 1], [x, y - g - 5, 1, 5], [x, y + g + 1, 1, 5]];
  for (const [a, b, w, h] of bars) rect(a - 1, b - 1, w + 2, h + 2, 'void');
  rect(x - 1, y - 1, 3, 3, 'void');
  for (const [a, b, w, h] of bars) rect(a, b, w, h, c);
  rect(x, y, 1, 1, 'red');
}
// the bottom strip. box = {x, y, w}; hs = HUD state from main.js (see ENGINE.md); compact = portrait strip
function strip(bx, by, w, hs, t, compact) {
  const P = hs.players, me = P[0];
  if (!hs.versus) {
    // solo: shell + hearts | HIT badge | timer ball | quota pill
    shell(bx, by, 0, me.ammo, false, t);
    hearts(bx + 1, by + 19, me.lives, me.maxLives);
    hitBadge(bx + 51, by + 1, me.hitAge);
    const cx = compact ? bx + w / 2 + 6 : RW / 2;
    timerBall(cx, by + 15, hs.timeFrac, hs.secs, t);
    quotaPill(cx + 22, by + 8, me.hits, hs.quota);
    if (hs.status) text3(hs.status, bx, by + 30, 'lime', 1, 'void');
    if (compact) text3('SCORE ' + String(hs.score).padStart(6, '0') + (hs.best ? '   BEST ' + hs.best : ''), bx, by + 38, 'bone', 1, 'void');
  } else {
    // versus: two mirrored halves (P1 red left, P2 blue right), timer in the middle
    const L = P[0], Rp = P[1], right = bx + w;
    const cx = compact ? bx + w / 2 : RW / 2;
    shell(bx, by, 0, L.ammo, false, t); hearts(bx + 1, by + 19, L.lives, L.maxLives);
    counter(bx + 51, by + 1, L.hits, 0); hitBadge(bx + 51, by - 15, L.hitAge);
    if (compact) text3(L.name, bx + 1, by - 8, 'coral', 1, 'void'); else text3(L.name, bx + 83, by + 6, 'coral', 1, 'void');
    shell(right - 48, by, 1, Rp.ammo, true, t); hearts(right - 1, by + 19, Rp.lives, Rp.maxLives, true);
    counter(right - 79, by + 1, Rp.hits, 1); hitBadge(right - 82, by - 15, Rp.hitAge);
    if (compact) text3r(Rp.name, right - 1, by - 8, 'ice', 1, 'void'); else text3r(Rp.name, right - 83, by + 6, 'ice', 1, 'void');
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
}
Object.assign(H, { shell, hearts, hitBadge, timerBall, quotaPill, counter, crosshair, strip, drawPlay, HIT_LIFE, PCOL });

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
let outerBase = null, outerKey = '', bulbs = [], bulbStep = -1;
function buildOuter(fr) {
  const o = fr.outer, OW = o.OW, OH = o.OH;
  const gx = Math.round(o.gx), gy = Math.round(o.gy), gw = Math.round(o.gw), gh = Math.round(o.gh);
  const [cv, g] = R.pixCanvas(OW, OH); bulbs = [];
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
      for (let y = gy + 26; y < gy + gh - 24; y += 44) {                     // bullseye medallions
        const cx = x0 + cw / 2, r = Math.min(7, (cw >> 1) - 2);
        for (let yy = -r - 1; yy <= r + 1; yy++) for (let xx = -r - 1; xx <= r + 1; xx++) {
          const d = Math.hypot(xx, yy) / r; if (d > 1.15) continue;
          P(Math.round(cx + xx), y + yy, 1, 1, d > 1 ? 'void' : d < 0.3 ? 'yellow' : d < 0.55 ? 'red' : d < 0.78 ? 'bone' : 'red');
        }
      }
    }
  });
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
  const step = Math.floor(t * 9), portrait = fr.portrait;
  if (step === bulbStep && !portrait) return;
  bulbStep = step;
  const prev = ctx; ctx = R.ox;
  ctx.drawImage(outerBase, 0, 0);
  bulbs.forEach(([x, y], i) => rect(x, y, 2, 2, (i + step) % 3 === 0 ? 'lemon' : (i + step) % 3 === 1 ? 'amber' : 'rust'));
  if (portrait) {
    const gy = Math.round(o.gy), gh = Math.round(o.gh), topH = gy;
    if (hs && hs.panel) hs.panel({ W: o.OW, H: o.OH, top: gy, bot: gy + gh, cx: Math.round(o.OW / 2) });   // tall phone: the screen's own layout
    else {
      if (topH >= 34) {                                                      // embossed logo in the valance
        const w = text7w('B.L.A.M.', 2);
        text7('B.L.A.M.', Math.round(o.OW / 2 - w / 2), Math.max(3, Math.round(topH / 2 - 16)), 2, 'gold', 'void', 2);
      }
      const sy = gy + gh + 22, sw = Math.min(o.OW - 8, 230), sx = Math.round((o.OW - sw) / 2);
      if (hs && hs.players && sy + 46 < o.OH) strip(sx, sy, sw, Object.assign({}, hs, { status: hs.status }), t, true);
      else if (hs && hs.menuLine) text3c(hs.menuLine, o.OW / 2, sy, 'lime', 1, 'void');
    }
    if (hs && hs.toast) text3c(hs.toast, o.OW / 2, Math.max(2, gy - 20), 'yellow', 1, 'void');   // toasts sit just above the game rect
  }
  ctx = prev;
  R.outerDirty = true;
}
Object.assign(H, { stoneBanner, redPanel, plate, sticker, starburst, bullseyeIcon, bombIcon, redX, ruleLine, drawOuter, hash });
})(window.BLAM);
