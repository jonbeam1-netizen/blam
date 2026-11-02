'use strict';
/* =========================================================================================
   B.L.A.M. core/cards.js -- LEVEL CARDS (#110): one little pixel picture per level for the FREE PLAY and
   HIGH SCORES level pickers (and the big card on a level's own screen).

   HOW TO ADD A LEVEL CARD
   - A card is a W x H = 56 x 32 picture on the HUD grid (426 x 240), drawn with BLAM.HUD helpers only
     (H.pixImg(key, w, h, f) for cached pixel functions, H.sprite(rows, x, y, 1, key, id), H.rect, H.draw),
     palette names only (R.PAL / R.CSS keys: void, midnight, navy ... lime). No fillText, no smoothing.
   - Add an entry to CARDS below, keyed by the stage id you pass to BLAM.Stage.register:
       CARDS.myid = (x, y, t) => { ... }   // x, y = top-left of the 56 x 32 picture, t = seconds (idle animation)
     The card is clipped to its 56 x 32 rect and gets its 1 px void outline from draw(), so draw edge to edge.
     Animate cheaply: pick a frame index from t (e.g. ((t * 4) | 0) % 4) and cache one image per frame
     (put the frame in the pixImg key: 'cd_myid_' + f); prefer moving a cached sprite over rebuilding images.
   - OR, inside the stage file, give the def a drawCard(cx, cy, t) (centred on cx, cy, same 56 x 32 size);
     it wins over the CARDS entry.
   - The name under the card comes from def.name, wrapped to two bold lines of <= 56 px; a name that can't
     wrap (one long word) uses LABELS[id] if set (e.g. DOPPEL / DUCKS), else def.short.
   - No entry at all: the FALLBACK card (a plain wood board with the level's briefing icon, def.drawIcon,
     or the HUD bullseye) is used, so a new level never breaks the menus.
   - Review: ?go=free (landscape + the mobile preset); the cards are 8 a page, two rows of four.
   API: Cards.W, Cards.H; Cards.draw(id, cx, cy, t, sc = 1) centred (sc 2 = the big card, nearest scaled);
   Cards.drawTL(id, x, y, t, sc) with x, y = top-left of the picture (the outline sits 1 px outside);
   Cards.label(id, maxW) -> [line1, line2?]; Cards.has(id). Extra ids: 'practice', 'course'.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, H = B.HUD;
const W = 56, HC = 32;

// ---------- helpers ----------
const BY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;                 // 4x4 Bayer threshold 0..1
const hsh = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const img = (key, w, h, f) => H.pixImg('cd_' + key, w, h, f);
// a sprite (rows of chars + key) with an optional 1 px void outline around everything drawn -> cached image (w+2, h+2)
function spr(id, rows, key, outline = true) {
  const w = rows[0].length, h = rows.length;
  const at = (x, y) => { const r = rows[y]; if (!r) return null; const ch = r[x]; return ch && ch !== '.' && key[ch] ? key[ch] : null; };
  return img('s_' + id, w + 2, h + 2, (x, y) => {
    const c = at(x - 1, y - 1); if (c) return c;
    if (!outline) return null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x - 1 + dx, y - 1 + dy)) return 'void';
    return null;
  });
}
const put = (im, x, y) => H.draw(im, x, y);
// the hex range plate (lime rings), r ~ radius, as in the range's briefing icon
function hexPlate(r) {
  const k = Math.ceil(r) + 1, a = r;
  return img('hex' + r, 2 * k + 1, 2 * k + 1, (x, y) => {
    const px = x - k, py = y - k, h = Math.max(Math.abs(py), 0.866 * Math.abs(px) + 0.5 * Math.abs(py));
    if (h > a + 1) return null; if (h > a) return 'void';
    if (h > a - 1.1) return py < -0.3 * a ? 'lemon' : py > 0.3 * a ? 'green' : 'lime';
    const d = Math.hypot(px, py) / a;
    return d < 0.24 ? 'yellow' : d < 0.42 ? 'void' : d < 0.6 ? 'lime' : d < 0.76 ? 'void' : 'lime';
  });
}

// ---------- shared backdrop: the range hall in one-point perspective (range + practice) ----------
const rangeBg = () => img('rangeBg', W, HC, (x, y) => {
  const L = 17, Rr = 38, T = 6, Bm = 17;
  if (y >= 29) return y === 29 ? 'red' : y === 30 ? 'crimson' : 'oxblood';                // the counter rail
  if (x >= L && x <= Rr && y >= T && y <= Bm) {                                           // back wall
    if (y === Bm) return 'tan';
    if (y >= Bm - 2) return 'slate';
    return y === T ? 'midnight' : bay(x, y) < 0.18 ? 'midnight' : 'navy';
  }
  const dx = x < L ? L - x : x > Rr ? x - Rr : 0;
  if (y < T && (T - y) / 6 >= dx / 17) {                                                  // ceiling + its light bars
    if (y === 1 && x >= 9 && x <= 46) return 'slate';
    if (y === 2 && x >= 10 && x <= 45) return 'lemon';
    if (y === 4 && x >= 18 && x <= 37) return 'yellow';
    return 'midnight';
  }
  if (y > Bm && (y - Bm) / 12 >= dx / 17) {                                               // floor + lanes
    const q = (x - 27.5) / (y - 12) * 2.4, d = Math.abs(q - Math.round(q)) * (y - 12) / 2.4;
    if (d < 0.5 && Math.abs(q) > 0.3) return y < 22 ? 'amber' : 'yellow';
    return (Math.floor(26 / (y - 11)) & 1) ? 'chestnut' : 'walnut';
  }
  // side walls with ribs, darker toward the front
  const rib = x < L ? (x % 5 === 0) : (x % 5 === 0);
  if (rib) return 'steel';
  return bay(x, y) < (x < 4 || x > 51 ? 0.6 : 0.15) ? 'navy' : 'slate';
});
const BOMB_S = ['..FO...', '...U...', '.XXXX..', 'XXHXXX.', 'XHXXXXX', 'XXBXBXX', 'XXXBXXX', '.XXXXX.'];
function rangeCard(x, y, t, practice) {
  put(rangeBg(), x, y);
  if (!practice) {
    const f = ((t * 8) | 0) & 1;                                                          // a bomb far back on the left lane
    put(spr('rbomb' + f, BOMB_S, { X: 'void', H: 'slate', B: 'bone', U: 'walnut', F: f ? 'lemon' : 'orange', O: f ? 'orange' : 'yellow' }, false), x + 13, y + 9);
    const p = hexPlate(3);                                                                 // a small plate far right
    put(p, x + 37, y + 9); H.rect(x + 41, y + 17, 1, 2, 'steel');
  }
  // the main plate on its post, scooting along the middle lane
  const off = practice ? -8 : Math.round(Math.sin(t * 1.6) * 7);
  H.rect(x + 27 + off, y + 18, 2, 7, 'steel'); H.rect(x + 27 + off, y + 25, 2, 1, 'void');
  put(hexPlate(6.5), x + 20 + off, y + 6);
}

// ---------- the cards ----------
const CARDS = {
  range(x, y, t) { rangeCard(x, y, t, false); },

  // PRACTICE: the range with a clock crossed out (its minute hand still ticks round)
  practice(x, y, t) {
    rangeCard(x, y, t, true);
    const f = ((t * 2) | 0) % 8, a = f / 8 * Math.PI * 2 - Math.PI / 2;
    put(img('clock' + f, 21, 21, (px, py) => {
      const dx = px - 10, dy = py - 10, d = Math.hypot(dx, dy);
      if (d > 10.2) return null; if (d > 9.3) return 'void';
      if (d > 7.2) return d > 8.6 ? 'crimson' : 'red';                                    // the no-sign ring
      if (Math.abs(dx - dy) / 1.414 < 1.25) return Math.abs(dx - dy) / 1.414 < 0.6 ? 'red' : 'crimson';   // the slash
      if (d > 6.3) return 'void';
      const along = dx * Math.cos(a) + dy * Math.sin(a), across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      if (along > -0.5 && along < 5 && across < 0.7) return 'void';                       // minute hand
      if (dy < 0.5 && dy > -3.8 && Math.abs(dx) < 0.7) return 'void';                    // hour hand (12)
      if (d < 1.2) return 'void';
      if ((Math.abs(dx) < 0.6 && Math.abs(dy) > 4.8) || (Math.abs(dy) < 0.6 && Math.abs(dx) > 4.8)) return 'haze';   // ticks
      return dx + dy > 4 ? 'mist' : 'bone';
    }), x + 30, y + 3);
  },

  // THE ALLEY: a crook peeking over a dumpster under a wall lamp
  alley(x, y, t) {
    put(img('alleyBg', W, HC, (px, py) => {
      if (py >= 26) {                                                                     // pavement + a puddle
        if (py === 26) return 'slate';
        const e = Math.hypot((px - 11) / 7, (py - 29) / 1.6);
        if (e < 1) return e < 0.4 && px < 12 ? 'amber' : (px + py) & 1 ? 'deepblue' : 'blue';
        return hsh(px >> 1, py) > 0.9 ? 'midnight' : 'navy';
      }
      if (px >= 50 && px <= 51) return px === 50 ? 'steel' : 'slate';                    // drainpipe
      if (py === 1 && px >= 3 && px <= 10) return 'slate';                                  // the wall lamp
      if (py === 2 && px >= 7 && px <= 10) return px === 7 || px === 10 ? 'void' : 'lemon';
      if (py === 3 && px >= 7 && px <= 10) return 'yellow';
      const row = Math.floor(py / 3), off = (row & 1) * 3, mortar = py % 3 === 2 || (px + off) % 6 === 5;
      const d = Math.hypot(px - 8.5, (py - 3) * 1.15);
      const lit = d < 8 ? 2 : d < 13 ? (bay(px, py) < (13 - d) / 5 ? 2 : 1) : px > 44 && bay(px, py) < 0.5 ? 0 : 1;
      if (mortar) return lit === 2 ? 'walnut' : 'umber';
      return lit === 2 ? 'red' : lit === 1 ? (hsh(row, (px + off) / 6 | 0) > 0.8 ? 'oxblood' : 'crimson') : 'oxblood';
    }), x, y);
    // crook: up, shifty eyes, down, hidden (cycle 3.2 s)
    const c = t % 3.2, up = c < 0.25 ? 0.25 + c * 3 : c < 2.3 ? 1 : c < 2.55 ? 1 - (c - 2.3) * 4 : 0;
    const hy = Math.round(11 - up * 7), look = ((t * 1.6) | 0) & 1;
    const CROOK = ['...HHHHHH...', '...HHHHHH...', '...BBBBBB...', '.HHHHHHHHHH.', '..SSSSSSSS..', '..MMMMMMMM..', '..MWPMMWPM..', '..SSSSSSSS..', '..SSSTTSSS..', '..SSXXXXSS..', '..SSSSSSSS..'];
    const rows = look ? CROOK : CROOK.map(r => r.replace(/WP/g, 'PW'));
    put(spr('crook' + look, rows, { H: 'slate', B: 'crimson', S: 'sand', M: 'void', W: 'bone', P: 'void', T: 'tan', X: 'walnut' }), x + 29, y + hy);
    // the dumpster in front of him
    put(img('dumpster', 30, 17, (px, py) => {
      const L = py <= 2 ? 0 : 1, R2 = py <= 2 ? 29 : 28;
      if (px < L || px > R2) return null;
      if (py === 16) return px === 3 || px === 4 || px === 24 || px === 25 ? 'void' : null;   // wheels
      if (py === 15) return px >= 2 && px <= 5 || px >= 23 && px <= 26 ? 'void' : null;
      if (px === L || px === R2 || py === 0 || py === 14) return 'void';
      if (py <= 2) return py === 1 ? 'green' : 'forest';                                    // the lid
      if (py === 3) return 'void';
      if (py === 4) return 'lime';
      if (px % 5 === 2) return 'forest';
      if (py >= 9 && py <= 11 && px >= 9 && px <= 19) return py === 10 && px > 9 && px < 19 ? 'bone' : 'forest';   // a label plate
      return py > 11 ? 'forest' : 'green';
    }), x + 23, y + 13);
    if (up > 0.9) { H.rect(x + 29, y + 12, 2, 2, 'sand'); H.rect(x + 41, y + 12, 2, 2, 'sand'); H.rect(x + 29, y + 14, 2, 1, 'void'); H.rect(x + 41, y + 14, 2, 1, 'void'); }
  },

  // BONEYARD: a skull on a bone pile under the moon, a bat flapping past
  boneyard(x, y, t) {
    put(img('boneBg', W, HC, (px, py) => {
      const hill = 21 + Math.round(1.5 * Math.sin(px * 0.21 + 1));
      // the bone pile (left of centre)
      const top = 31 - 13 * Math.max(0, 1 - Math.pow((px - 19) / 17, 2));
      if (py >= Math.round(top) && px > 2 && px < 36) {
        if (py === Math.round(top)) return 'void';
        const n = Math.sin(px * 1.35 + py * 0.7) * Math.sin(px * 0.45 - py * 1.8) + (hsh(px >> 1, py >> 1) - 0.5) * 0.7;
        return n > 0.2 ? 'bone' : n > -0.15 ? 'mist' : py > 28 ? 'slate' : 'haze';
      }
      if (py >= 27) return bay(px, py) < 0.4 ? 'umber' : 'walnut';
      // tombstone + cross on the hill
      if (px >= 41 && px <= 46 && py >= 15 && py <= 23) {
        if (py === 15 && (px === 41 || px === 46)) return null;
        if (px === 41 || px === 46 || py === 15) return 'void';
        return px === 42 ? 'steel' : py === 18 && px > 42 && px < 45 ? 'navy' : 'slate';
      }
      if ((px === 51 && py >= 16 && py <= 23) || (py === 18 && px >= 49 && px <= 53)) return 'chestnut';
      if (py >= hill) return py === hill ? 'void' : 'navy';
      // the moon
      const md = Math.hypot(px - 45, py - 7);
      if (md < 5.2) { if (Math.hypot(px - 43.5, py - 6) < 1.2 || Math.hypot(px - 46.5, py - 9) < 1) return 'mist'; return px + py > 54 ? 'mist' : 'bone'; }
      if (md < 6.2) return 'void';
      if (hsh(px, py) > 0.975 && py < 16) return 'mist';
      return bay(px, py) < py / 24 ? 'indigo' : 'midnight';
    }), x, y);
    const BONE = ['XX.....XX', 'XBBBBBBBX', 'XX.....XX'];
    put(spr('bone1', BONE, { X: 'bone', B: 'bone' }), x + 4, y + 22); put(spr('bone2', ['XX...XX', 'XBBBBBX', 'XX...XX'], { X: 'mist', B: 'mist' }), x + 26, y + 24);
    const glow = ((t * 1.3) | 0) % 3 === 0;
    const SK = ['...BBBB...', '.BBBBBBBB.', 'BBBBBBBBBM', 'BEEBBBBEEM', 'BEEBBBBEEM', 'BBBBXXBBBM', '.BBBBBBBM.', '..BXBXBXM.', '..BBBBBM..'];
    put(spr('skull' + glow, SK, { B: 'bone', M: 'mist', E: glow ? 'red' : 'void', X: 'void' }), x + 13, y + 9);
    // the bat
    const bx = Math.round(((t * 13) % 74) - 10), by = 4 + Math.round(Math.sin(t * 5) * 2), wf = ((t * 8) | 0) & 1;
    const BAT = wf ? ['X.......X', 'XX..X..XX', '.XXXRXXX.', '...X.X...'] : ['...XXX...', '.XXXRXXX.', 'XX.X.X.XX', 'X.......X'];
    put(spr('bat' + wf, BAT, { X: 'void', R: 'red' }, false), x + bx, y + by);
  },

  // SKY SHOW: a firework bursting over the town (and a smaller cyan one)
  skyshow(x, y, t) {
    put(img('skyBg', W, HC, (px, py) => {
      const ch = Math.floor(px / 5), bh = 3 + Math.floor(hsh(ch, 7) * 6);
      if (py >= 31 - bh) {                                                                // the skyline
        if ((px % 5) === 4 && py > 31 - bh + 1) return 'midnight';
        if ((px & 1) === 0 && (py & 1) === 1 && py < 30 && hsh(px, py) > 0.55) return hsh(px + 1, py) > 0.5 ? 'amber' : 'lemon';
        return 'void';
      }
      if (hsh(px, py) > 0.978) return 'mist';
      return bay(px, py) < (py - 12) / 14 ? 'indigo' : bay(px, py) < py / 18 ? 'navy' : 'midnight';
    }), x, y);
    const ph = Math.floor((t % 2.4) / 0.3);                                               // 8 phases
    put(img('skyFx' + ph, W, HC, (px, py) => burstPx(px, py, 22, 12, ph, ['lemon', 'pink', 'magenta', 'coral', 'crimson']) ||
      burstPx(px, py, 44, 7, (ph + 4) % 8, ['ice', 'cyan', 'blue', 'ice', 'deepblue'], 0.65)), x, y);
  },

  // BEE HIVE: honeycomb with a bee buzzing a figure eight
  beehive(x, y, t) {
    put(img('hiveBg', W, HC, (px, py) => {
      let d1 = 1e9, d2 = 1e9, best = null;
      const r0 = Math.round((py - 2) / 6);
      for (let r = r0 - 1; r <= r0 + 1; r++) {
        const sx = (r & 1) * 4, c0 = Math.round((px - sx) / 8);
        for (let c = c0 - 1; c <= c0 + 1; c++) {
          const cx = c * 8 + sx, cy = r * 6 + 2, d = Math.hypot(px - cx, (py - cy) * 1.3);
          if (d < d1) { d2 = d1; d1 = d; best = [c, r, cx, cy]; } else if (d < d2) d2 = d;
        }
      }
      if (d2 - d1 < 1.1) return py < best[3] ? 'yellow' : 'amber';                         // wax walls (lit on top)
      if (d2 - d1 < 2.0) return py < best[3] ? 'sand' : 'tan';
      const k = hsh(best[0] + 40, best[1] + 40);
      if (k < 0.34) return d1 < 1.6 && px < best[2] ? 'lemon' : d1 < 3 ? 'yellow' : 'amber';   // honey
      if (k < 0.44) return 'sand';                                                          // capped
      return d1 > 3.2 ? 'chestnut' : d1 > 2 ? 'walnut' : 'umber';
    }), x, y);
    const fx = Math.sin(t * 1.1), bx = Math.round(23 + fx * 16), by = Math.round(12 + Math.sin(t * 2.2) * 6);
    const right = Math.cos(t * 1.1) >= 0, wf = ((t * 14) | 0) & 1;
    put(img('bee' + (right ? 1 : 0) + wf, 13, 10, (px, py) => {
      const qx = right ? px : 12 - px;
      const wd = wf ? Math.hypot((qx - 5.5) / 2.6, (py - 2) / 1.6) : Math.hypot((qx - 5) / 3, (py - 3.4) / 1.1);
      const bd = Math.hypot((qx - 5.5) / 4.2, (py - 6) / 2.6);
      if (bd < 1) {
        if (qx >= 8.6) return bd > 0.75 ? 'void' : qx > 9.4 && py === 5 ? 'bone' : 'void';   // head
        return bd > 0.8 ? 'void' : (qx % 3 === 1) ? 'void' : py < 5 ? 'lemon' : 'yellow';
      }
      if (wd < 1) return wd > 0.72 ? 'mist' : 'ice';
      if (qx <= 1.2 && py === 6) return 'void';                                             // stinger
      return null;
    }), x + bx, y + by);
  },

  // INVASION: a saucer beaming down over the voxel Earth
  invasion(x, y, t) {
    put(img('invBg', W, HC, (px, py) => {
      const d = Math.hypot(px - 27.5, py - 52);
      if (d <= 26.6) {
        const bx = (px >> 1) * 2 + 1, by = (py >> 1) * 2 + 1, dd = Math.hypot(bx - 27.5, by - 52);
        if (d > 25.6) return 'cyan';
        const land = Math.sin(bx * 0.33 + 1.3) + Math.sin(by * 0.6 + bx * 0.17) + hsh(bx >> 2, by >> 2) * 0.9 > 1.05;
        const cloud = hsh(bx * 3 + 1, by * 5 + 2) > 0.86;
        const dark = bx - 27.5 > 9 || dd > 23;
        if (cloud) return dark ? 'mist' : 'bone';
        return land ? (dark ? 'forest' : 'green') : (dark ? 'deepblue' : 'blue');
      }
      if (d <= 27.8) return bay(px, py) < 0.5 ? 'deepblue' : 'midnight';
      const s = hsh(px, py);
      if (s > 0.972) return s > 0.99 ? 'ice' : s > 0.98 ? 'bone' : 'haze';
      return py < 6 && bay(px, py) < 0.25 ? 'midnight' : 'void';
    }), x, y);
    const sx = Math.round(19 + Math.sin(t * 0.9) * 6), sy = 3 + Math.round(Math.sin(t * 2.1)), f = ((t * 5) | 0) & 1;
    if ((t % 2.6) < 1.7) put(img('beam', 18, 20, (px, py) => {                              // the tractor beam
      const hw = 3 + py * 0.33; if (Math.abs(px - 8.5) > hw) return null;
      return bay(px, py) < (py < 3 ? 0.7 : 0.45) ? (Math.abs(px - 8.5) > hw - 1 ? 'yellow' : 'lemon') : null;
    }), x + sx, y + sy + 8);
    const UFO = ['......CCCC......', '.....CIICCC.....', '....CCCCCCCC....', '..SSSSSSSSSSSS..', 'HHHHHHHHHHHHHHHH', 'LHHKHHLHHKHHLHHK', '.SSSSSSSSSSSSSS.', '...NNNNNNNNNN...'];
    put(spr('ufo' + f, UFO, { C: 'cyan', I: 'ice', S: 'steel', H: 'haze', L: f ? 'lemon' : 'red', K: f ? 'red' : 'lemon', N: 'navy' }), x + sx - 1, y + sy);
  },

  // LASER TAG: a neon arena, a sensor target glowing between two barriers
  lasertag(x, y, t) {
    put(img('tagBg', W, HC, (px, py) => {
      // barriers
      if (px >= 2 && px <= 14 && py >= 15 && py <= 26) return py === 15 ? 'cyan' : px === 14 ? 'deepblue' : py === 16 ? 'blue' : 'navy';
      if (px >= 41 && px <= 53 && py >= 17 && py <= 27) return py === 17 ? 'cyan' : px === 41 ? 'deepblue' : py === 18 ? 'blue' : 'navy';
      if (py >= 19) {                                                                     // neon grid floor
        if (py === 19) return 'pink';
        const q = (px - 27.5) / (py - 12) * 1.6, dq = Math.abs(q - Math.round(q)) * (py - 12) / 1.6;
        if (dq < 0.5) return 'magenta';
        if ([21, 23, 26, 30].includes(py)) return 'magenta';
        return 'void';
      }
      if (py === 3 && px >= 3 && px <= 52) return 'pink';                                 // neon tubes
      if (py === 4 && px >= 3 && px <= 52) return 'magenta';
      if ((px === 5 || px === 50) && py >= 6 && py <= 18) return 'cyan';
      if (py <= 1) return 'midnight';
      return (px % 9 === 0) ? 'plum' : bay(px, py) < 0.3 ? 'midnight' : 'indigo';
    }), x, y);
    const f = ((t * 3) | 0) % 3, R0 = 6 + f;
    put(img('tagGlow' + f, 23, 23, (px, py) => {
      const d = Math.hypot(px - 11, py - 11);
      if (d < 1.6) return 'bone'; if (d < 3.1) return 'lime'; if (d < 4.3) return 'green'; if (d < 5.2) return 'void';
      if (d < R0) return bay(px, py) < (R0 - d) / (R0 - 5) * 0.8 ? (d < R0 - 1.5 ? 'lime' : 'green') : null;
      return null;
    }), x + 16, y);
    H.rect(x + 27, y + 15, 2, 5, 'steel'); H.rect(x + 27, y + 20, 2, 1, 'void');
    if (((t * 2.5) | 0) % 4 === 1) { H.rect(x + 25, y + 10, 2, 2, 'red'); H.rect(x + 26, y + 11, 1, 1, 'coral'); }   // their red aim dot
  },

  // SKEE BALL: a ball rolling up the lane to the ring board (the ring flashes as it drops in)
  skeeball(x, y, t) {
    put(img('skeeBg', W, HC, (px, py) => {
      // the lane (a trapezoid from the bottom up to the board)
      if (py >= 14) {
        const k = (py - 14) / 17, hw = 7.5 + k * 18, q = (px - 27.5) / hw;
        if (Math.abs(q) <= 1) {
          if (py <= 15) return py === 14 ? 'void' : 'chestnut';                            // the jump hump
          if (Math.abs(q) > 0.84) return Math.abs(q) > 0.95 ? 'void' : 'walnut';
          return (Math.floor((q + 1) * 4) & 1) ? 'tan' : 'sand';
        }
        return bay(px, py) < 0.35 ? 'plum' : 'indigo';
      }
      // the ring board
      if (px >= 15 && px <= 40 && py >= 0) {
        if (px === 15 || px === 40) return 'void';
        if (px <= 17 || px >= 38 || py <= 1) return py === 0 ? 'crimson' : 'red';
        const e = Math.hypot((px - 27.5) / 9.5, (py - 8) / 5.2);
        if (Math.hypot((px - 20) / 1.6, (py - 3.5) / 1.3) < 1) return 'red';                  // the 100 pockets
        if (Math.hypot((px - 35) / 1.6, (py - 3.5) / 1.3) < 1) return 'red';
        if (e < 0.26) return 'void';
        if (e < 0.4) return 'yellow';
        if (e < 0.58) return 'walnut';
        if (e < 0.72) return 'lime';
        if (e < 0.86) return 'umber';
        if (e < 1) return 'green';
        return 'void';
      }
      return bay(px, py) < 0.3 ? 'plum' : 'indigo';
    }), x, y);
    const c = (t % 1.8) / 1.8, ph = Math.floor(c * 9);
    if (ph >= 7) H.rect(x + 25, y + 7, 6, 2, ph === 7 ? 'lemon' : 'yellow');                // the ring lights up
    const bulbs = ((t * 4) | 0) & 1;
    for (let i = 0; i < 6; i++) H.rect(x + 17 + i * 4 + (bulbs ? 2 : 0), y, 1, 1, 'lemon');
    if (ph < 6) {
      const k = ph / 5, r = k < 0.75 ? 3 : 2, by = Math.round(28 - k * 12), bx = Math.round(28 - k * 1);
      put(ball(r), x + bx - r - 1, y + by - r - 1);
    } else if (ph === 6) put(ball(2), x + 25, y + 3);
  },

  // CONVEYOR: a plate riding the belt under the stamping press
  conveyor(x, y, t) {
    put(img('beltBg', W, HC, (px, py) => {
      if (py <= 2) return ((px - py) % 6 + 6) % 6 < 3 ? 'yellow' : 'void';                    // hazard beam
      if (py === 3) return 'void';
      if (py >= 27) {                                                                     // rollers + floor
        if (py === 31) return 'midnight';
        const rx = ((px - 3) % 7 + 7) % 7, d = Math.hypot(rx - 3, py - 28.5);
        if (d < 0.9) return 'void'; if (d < 2.1) return d < 1.5 && rx < 3 ? 'haze' : 'steel'; if (d < 2.7) return 'void';
        return 'navy';
      }
      if (py >= 21) return py === 21 || py === 26 ? 'void' : py === 22 ? 'steel' : 'navy';  // belt body (slats moving: overlay)
      if (px % 9 === 4) return 'navy';                                                     // wall panels
      if (py === 11) return 'navy';
      if ((px % 9 === 6 || px % 9 === 2) && (py === 6 || py === 16)) return 'steel';
      return bay(px, py) < 0.12 ? 'navy' : 'slate';
    }), x, y);
    const ph = Math.floor(t * 8) % 4;
    put(img('slats' + ph, W, 3, (px) => (((px + 64 - ph) >> 1) & 1) ? 'slate' : 'navy'), x, y + 23);
    // the plate on a little stand, riding left to right
    const px0 = Math.round(((t * 9) % 74) - 10);
    H.rect(x + px0 + 5, y + 18, 2, 3, 'steel'); H.rect(x + px0 + 3, y + 20, 6, 1, 'void');
    put(hexPlate(5), x + px0, y + 7);
    // the press: up, slam, back up (2 s)
    const c = t % 2, py0 = c < 1.2 ? 4 : c < 1.3 ? 9 : c < 1.55 ? 12 : c < 1.75 ? 8 : 5;
    H.rect(x + 25, y + 3, 6, py0 - 3, 'haze'); H.rect(x + 25, y + 3, 1, py0 - 3, 'mist'); H.rect(x + 30, y + 3, 1, py0 - 3, 'steel');
    put(img('pressHead', 18, 6, (px, py) => {
      if (px === 0 || px === 17 || py === 0 || py === 5) return 'void';
      if (py === 1) return 'haze';
      if (py === 4) return 'slate';
      return ((px + py) % 4 < 2) ? 'yellow' : 'void';
    }), x + 19, y + py0);
    if (c >= 1.3 && c < 1.4) { H.rect(x + 17, y + py0 + 5, 2, 1, 'lemon'); H.rect(x + 37, y + py0 + 5, 2, 1, 'lemon'); }
  },

  // DOPPELDUCKS: three ducks in a lineup, the middle one in a bowler (his eyes keep shifting)
  doppelducks(x, y, t) {
    put(img('lineupBg', W, HC, (px, py) => {
      if (py >= 28) return py === 28 ? 'tan' : (px % 9 === 0) ? 'walnut' : 'chestnut';
      if (py <= 1) return py === 0 ? 'slate' : 'steel';
      if (py % 4 === 0) return px < 3 || px > 52 || py % 8 === 0 ? 'haze' : 'mist';
      return 'mist';
    }), x, y);
    const DUCK = ['....YYYYYY....', '...YYYYYYYY...', '..YYYYYYYYYY..', '..YEEYYYYEEY..', '..YEPYYYYEPY..', '..YYYYYYYYYY..', '.YOOOOOOOOOOY.', '..YOOOOOOOOY..',
      '...YYYYYYYY...', '..AYYYYYYYYA..', '.AYYYYYYYYYYA.', '.AYYYYYYYYYYA.', '..AYYYYYYYYA..', '...AAAAAAAA...', '...OO....OO...'];
    const KEY = { Y: 'yellow', A: 'amber', O: 'orange', E: 'bone', P: 'void', H: 'void', h: 'slate' };
    for (let i = 0; i < 3; i++) {
      const blink = ((t + i * 1.13) % 3.1) < 0.14, shifty = i === 1 && ((t * 1.4) | 0) & 1;
      let rows = DUCK;
      if (blink) rows = rows.map((r, j) => j === 3 ? r.replace(/E/g, 'Y') : j === 4 ? r.replace(/[EP]/g, 'P') : r);
      else if (shifty) rows = rows.map((r, j) => j === 4 ? r.replace(/EP/g, 'PE') : r);
      if (i === 1) rows = ['.....hhhh.....', '....HHHHHH....', '.HHHHHHHHHHHH.'].concat(rows.slice(1));
      put(spr('duck' + i + (blink ? 'b' : shifty ? 's' : ''), rows, KEY), x + 1 + i * 18, y + (i === 1 ? 10 : 12));
    }
  },

  // GROCERY RUN: a cart with a bag of chips in it and a broccoli on the rim
  grocery(x, y, t) {
    put(img('martBg', W, HC, (px, py) => {
      if (py >= 27) return ((px >> 2) + (py >> 1)) & 1 ? 'haze' : 'mist';                    // floor tiles
      const shelves = [8, 17, 26];
      for (const sy of shelves) {
        if (py === sy) return (px % 11 === 5 || px % 11 === 6) ? 'bone' : 'tan';          // shelf edge + price tags
        if (py === sy - 1 && (px % 11 === 5 || px % 11 === 6)) return 'bone';
      }
      const sy = shelves.find(s => s > py) || 26, col = Math.floor(px / 4) + sy * 3, top = sy - 3 - Math.floor(hsh(col, sy) * 4);
      if (py > top && py < sy) {
        const C = [['crimson', 'oxblood'], ['deepblue', 'navy'], ['rust', 'chestnut'], ['forest', 'midnight'], ['plum', 'indigo'], ['chestnut', 'walnut'], ['blue', 'deepblue']];
        const c = C[Math.floor(hsh(col, 5) * C.length)];
        if (px % 4 === 3) return 'void';
        return py === top + 1 ? 'slate' : px % 4 === 2 ? c[1] : c[0];
      }
      return 'midnight';
    }), x, y);
    // cereal box + chip bag inside the basket
    put(img('cereal', 7, 11, (px, py) => px === 0 || py === 0 || px === 6 ? 'void' : py === 3 || py === 4 ? 'bone' : px === 5 ? 'blue' : 'cyan'), x + 15, y + 7);
    const bob = ((t * 1.5) | 0) & 1;
    put(img('chips', 11, 15, (px, py) => {
      if (py === 0) return px % 2 ? 'void' : null;                                          // crimp sawtooth
      if (py <= 2) return px === 0 || px === 10 ? 'void' : (px & 1) ? 'mist' : 'bone';
      if (px === 0 || px === 10 || py === 14) return 'void';
      const d = Math.hypot(px - 5, py - 7);
      if (d < 2.2) return 'red'; if (d < 3.3) return 'yellow'; if (d < 3.9) return 'orange';
      return px === 1 ? 'coral' : px === 9 ? 'crimson' : 'red';
    }), x + 21, y + 3 + bob);
    // the wire basket (front grid over the contents)
    put(img('basket', 32, 13, (px, py) => {
      const l = 1 + Math.round(py * 0.35), r = 30 - Math.round(py * 0.1);
      if (px < l || px > r) return null;
      if (py === 0) return 'mist';
      if (px === l || px === r || py === 12) return 'haze';
      return (px % 3 === 0 || py % 3 === 0) ? 'steel' : null;
    }), x + 13, y + 12);
    H.rect(x + 13, y + 11, 32, 1, 'void');
    // frame, handle, wheels
    H.rect(x + 18, y + 25, 26, 1, 'steel'); H.rect(x + 42, y + 12, 1, 14, 'steel');
    H.rect(x + 43, y + 9, 1, 3, 'steel'); H.rect(x + 44, y + 7, 1, 3, 'steel'); H.rect(x + 44, y + 6, 4, 2, 'red'); H.rect(x + 44, y + 6, 4, 1, 'coral');
    const wf = ((t * 6) | 0) & 1;
    for (const wx of [19, 39]) { put(img('wheel' + wf, 5, 5, (px, py) => { const d = Math.hypot(px - 2, py - 2); if (d > 2.5) return null; if (d < 0.8) return 'haze'; return (wf ? px === 2 : py === 2) && d < 2 ? 'steel' : 'void'; }), x + wx, y + 26); }
    // the broccoli on the rim, wobbling, with googly eyes
    const wob = ((t * 2.2) | 0) % 4 === 1 ? 1 : 0;
    put(img('broc' + wob, 14, 13, (px, py) => {
      const sx = px - (py < 9 ? wob : 0);
      if (py >= 9) { if (sx >= 5 && sx <= 8) return sx === 5 || sx === 8 ? 'green' : 'lime'; return null; }
      const blobs = [[3.5, 4.5, 3.4], [7, 3, 3.8], [10.2, 5, 3.2], [6.8, 6.4, 3]];
      let inside = false, edge = false;
      for (const [bx, by, br] of blobs) { const d = Math.hypot(sx - bx, py - by); if (d < br - 0.6) inside = true; else if (d < br + 0.3) edge = true; }
      if (inside) {
        if ((sx === 4 || sx === 5 || sx === 8 || sx === 9) && py === 4) return 'bone';
        if ((sx === 5 || sx === 9) && py === 5) return 'void';
        if ((sx === 4 || sx === 8) && py === 5) return 'bone';
        return hsh(sx, py) > 0.62 ? 'lime' : py > 6 ? 'forest' : 'green';
      }
      return edge ? 'void' : null;
    }), x + 31, y);
  }
};
// a firework burst at (cx, cy) in phase ph (0-2 rocket, 3-6 opening, 7 embers) -> colour or null
function burstPx(px, py, cx, cy, ph, C, scale = 1) {
  if (ph <= 2) {                                                                          // the rocket climbing
    const ry = Math.round(cy + (3 - ph) * 5 * scale);
    if (px === cx && py === ry) return 'bone';
    if (px === cx && py > ry && py <= ry + 3) return py === ry + 1 ? 'orange' : 'rust';
    return null;
  }
  const R0 = [0, 0, 0, 4, 7, 10, 12, 12][ph] * scale, dx = px - cx, dy = py - cy - (ph >= 6 ? 1 : 0) - (ph === 7 ? 1 : 0);
  const d = Math.hypot(dx, dy); if (d > R0 + 0.5) return null;
  if (ph === 3 && d < 1.5) return 'bone';
  const a = Math.atan2(dy, dx) / (Math.PI * 2) * 12, fr = Math.abs(a - Math.round(a));
  if (fr * d > 0.62) return null;
  if (ph === 7) return d > R0 - 2 && hsh(px, py) > 0.5 ? C[4] : null;
  if (d > R0 - 1.2) return C[0];
  if (d > R0 - 4) return C[1];
  return ph <= 4 ? C[2] : (d > R0 * 0.5 && hsh(px, py) > 0.6 ? C[3] : null);
}
function ball(r) {
  return img('ball' + r, 2 * r + 3, 2 * r + 3, (px, py) => {
    const d = Math.hypot(px - r - 1, py - r - 1); if (d > r + 0.6) return null;
    if (d > r - 0.4) return 'void';
    if (px < r && py < r && d > r * 0.3) return 'lemon';
    return d > r * 0.6 ? 'tan' : 'sand';
  });
}

// COURSE (high scores): a gold trophy on the stage under the bulbs, rays turning behind it
CARDS.course = (x, y, t) => {
  const f = ((t * 3) | 0) & 3;
  put(img('courseBg' + f, W, HC, (px, py) => {
    if (py <= 2) return py === 2 ? 'plum' : 'magenta';
    if (py === 3) return px % 4 === (f & 1) * 2 ? 'lemon' : 'amber';                        // chasing fringe bulbs
    if (py >= 28) return py === 28 ? 'tan' : (px % 7 === 0) ? 'walnut' : 'chestnut';
    const dx = px - 27.5, dy = py - 15, d = Math.hypot(dx, dy);
    if (d < 15) {
      const a = Math.atan2(dy, dx) / (Math.PI * 2) * 12 + f / 4, k = Math.abs(a - Math.round(a));
      if (k < 0.22 && (d < 11 || bay(px, py) < (15 - d) / 4)) return d < 11 ? 'yellow' : 'amber';
    }
    const fold = px % 7;
    return fold <= 1 ? 'oxblood' : fold === 2 ? 'crimson' : fold <= 4 ? 'red' : 'crimson';
  }), x, y);
  const CUP = ['GLLYYYYYYYYYYAG', 'GLYYYYYYYYYYYAG', '.LYYYYYYYYYYYA.', '.LYYYYYYYYYYAA.', '..LYYYYYYYYAA..', '...YYYYYYYAA...', '....YYYYYAA....', '......YYA......', '......YYA......', '.....AYYAA.....',
    '...WWWWWWWWW...', '...WCCCCCCCW...', '...WWWWWWWWW...'];
  put(spr('cup', CUP, { G: 'amber', L: 'lemon', Y: 'yellow', A: 'orange', W: 'walnut', C: 'chestnut' }), x + 20, y + 9);
  H.rect(x + 17, y + 11, 2, 4, 'amber'); H.rect(x + 37, y + 11, 2, 4, 'amber');            // handles
  H.rect(x + 18, y + 10, 1, 1, 'void'); H.rect(x + 37, y + 10, 1, 1, 'void');
  if (f & 1) { H.rect(x + 13, y + 7, 3, 1, 'bone'); H.rect(x + 14, y + 6, 1, 3, 'bone'); } else { H.rect(x + 41, y + 18, 3, 1, 'bone'); H.rect(x + 42, y + 17, 1, 3, 'bone'); }
};

// FALLBACK: a plain wood board with the level's briefing icon
function fallback(id, x, y, t) {
  put(img('fbBg', W, HC, (px, py) => {
    if (py === 0) return 'tan';
    if (py === HC - 1) return 'umber';
    return (py % 6 === 5) ? 'walnut' : hsh(px >> 3, py) > 0.85 ? 'walnut' : 'chestnut';
  }), x, y);
  const d = B.Stage && B.Stage.defs && B.Stage.defs[id];
  try { if (d && d.drawIcon) d.drawIcon(x + W / 2, y + HC / 2, 11, t); else H.bullseyeIcon(x + W / 2, y + HC / 2, 11); }
  catch (e) { H.bullseyeIcon(x + W / 2, y + HC / 2, 11); }
}

// ---------- drawing ----------
// picture at top-left (x, y) on the current HUD context, clipped, with its 1 px void outline outside the rect
function paint(id, x, y, t) {
  const c = H.ctx;
  H.rect(x - 1, y - 1, W + 2, HC + 2, 'void');
  c.save(); c.beginPath(); c.rect(x, y, W, HC); c.clip();
  const d = B.Stage && B.Stage.defs && B.Stage.defs[id];
  try {
    if (d && typeof d.drawCard === 'function') d.drawCard(x + W / 2, y + HC / 2, t);
    else if (CARDS[id]) CARDS[id](x, y, t);
    else fallback(id, x, y, t);
  } catch (e) {
    if (!paint.warned) { paint.warned = 1; console.error('[BLAM] card ' + id, e); }
    fallback(id, x, y, t);
  }
  c.restore();
}
let scratch = null;
function drawTL(id, x, y, t = 0, sc = 1) {
  x = Math.round(x); y = Math.round(y);
  if (sc <= 1) { paint(id, x, y, t); return; }
  if (!scratch) scratch = R.pixCanvas(W + 2, HC + 2);
  const [cv, g] = scratch, prev = H.ctx;
  g.clearRect(0, 0, W + 2, HC + 2);
  H.use(g); paint(id, 1, 1, t); H.use(prev);
  prev.imageSmoothingEnabled = false;
  prev.drawImage(cv, x - sc, y - sc, (W + 2) * sc, (HC + 2) * sc);
}
const draw = (id, cx, cy, t = 0, sc = 1) => drawTL(id, Math.round(cx - W * sc / 2), Math.round(cy - HC * sc / 2), t, sc);

// ---------- the name under a card ----------
// def.name wrapped to <= 2 bold lines of maxW px; LABELS[id] wins; a name that can't fit falls back to def.short
const LABELS = { doppelducks: ['DOPPEL', 'DUCKS'], practice: ['PRACTICE'], course: ['COURSE'] };
function label(id, maxW = W) {
  const d = B.Stage && B.Stage.defs && B.Stage.defs[id];
  if (d && d.cardLabel) return [].concat(d.cardLabel).slice(0, 2);
  if (LABELS[id]) return LABELS[id].slice();
  const name = String((d && (d.name || d.short)) || id).toUpperCase();
  const lines = B.UI && B.UI.wrapB ? B.UI.wrapB(name, maxW) : [name];
  if (lines.length <= 2 && lines.every(l => H.textBw(l) <= maxW)) return lines;
  return [String((d && d.short) || name).toUpperCase()];
}

B.Cards = { W, H: HC, draw, drawTL, label, has: id => !!CARDS[id] || !!(B.Stage && B.Stage.defs[id] && B.Stage.defs[id].drawCard), CARDS, LABELS };
})(window.BLAM);
