'use strict';
/* =========================================================================================
   B.L.A.M. core/portrait.js -- tall-phone layouts for every text screen.
   In portrait the 16:9 game rect spans the phone's width (~375 CSS px), so one game pixel is < 1 CSS px and
   the 426x240 menu / briefing / results text is unreadable. The outer canvas there runs on a chunkier grid
   (frame.outer.hudScale >= 2: one outer px = 2+ game px, >= 1.5 CSS px), exactly like the play HUD strip.
   So when UI.tall() is true each screen's draw() leaves the game rect to the 3D (signs, Deputy Duck) and its
   drawPortrait(t, L) lays the text out on the outer canvas: a headline in the curtain above the game rect,
   the panel on the shelf below it. L = { W, H, top, bot, cx } in outer px (W is ~213 on a phone).
   main.js passes it to HUD.drawOuter as hs.panel. Tablets in portrait (hudScale 1) keep the normal layouts.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, H = B.HUD, UI = B.UI, S = B.Stage, SC = UI.screens;
const G = () => B.G;
const blink = (t, hz = 2.2) => ((t * hz) | 0) % 2 === 0;
const tapWord = () => G().touch ? 'TAP' : 'CLICK';

// ---------- helpers ----------
// word wrap for 3x5 text, balanced: as many lines as a greedy wrap at maxW needs, but as even as possible
// ("SHOOT 7 TARGETS / OR MORE!" rather than "SHOOT 7 TARGETS OR / MORE!"). items: [[word, colour], ...]
function wrapItems(items, maxW, sc) {
  const width = ws => H.text3w(ws.map(w => w[0]).join(' '), sc);
  const greedy = mw => { const rows = []; let cur = []; for (const w of items) { if (cur.length && width(cur.concat([w])) > mw) { rows.push(cur); cur = [w]; } else cur.push(w); } if (cur.length) rows.push(cur); return rows; };
  let rows = greedy(maxW); const n = rows.length;
  if (n > 1) for (let mw = maxW - 4; mw > 8; mw -= 4) { const r = greedy(mw); if (r.length > n) break; rows = r; }
  return { rows, width };
}
const words = (str, c) => String(str).toUpperCase().split(' ').filter(Boolean).map(w => [w, c]);
function wrap(str, maxW, sc = 1) { return wrapItems(words(str), maxW, sc).rows.map(ws => ws.map(w => w[0]).join(' ')); }
// centred, wrapped, outlined 3x5 text; returns the y under the last line
function lines(str, cx, y, maxW, col, sc = 1, gap = 3) {
  for (const s of wrap(str, maxW, sc)) { H.text3c(s, cx, y, col, sc, 'void'); y += 5 * sc + gap; }
  return y;
}
// a rule made of coloured parts ([[text, colour], ...]) wrapped word by word; returns the y under it
const partWords = parts => [].concat(...parts.map(([s, c]) => words(s, c)));
function ruleLines(parts, cx, y, maxW, sc) {
  const { rows, width } = wrapItems(partWords(parts), maxW, sc);
  for (const ws of rows) { let x = Math.round(cx - width(ws) / 2); for (const [s, c] of ws) { H.text3(s, x, y, c, sc); x += (s.length + 1) * 4 * sc; } y += 5 * sc + 3; }
  return y;
}
const ruleHeight = (parts, maxW, sc) => wrapItems(partWords(parts), maxW, sc).rows.length * (5 * sc + 3) - 3;
// headline in the curtain: a big bold title on a red sign board (+ optional sub line), centred in the space
function headline(L, title, sub, rows = 'gold', sc = 2) {
  const tw = H.text7w(title, sc), subL = sub ? wrap(sub, L.W - 24) : [];
  const w = Math.min(L.W - 6, Math.max(tw, ...subL.map(s => H.text3w(s))) + 26);
  const h = 7 * sc + 18 + subL.length * 8 + (subL.length ? 2 : 0);
  const y = Math.max(2, Math.round((L.top - 10 - h) / 2)), x = Math.round(L.cx - w / 2);
  H.redPanel(x, y, w, h);
  H.text7c(title, L.cx, y + 9, sc, rows, 'void', 2);
  let yy = y + 9 + 7 * sc + 5;
  for (const s of subL) { H.text3c(s, L.cx, yy, 'cyan', 1); yy += 8; }
  return y + h;
}
// big shouty word straight on the curtain (results / game over), with an optional starburst behind it
function shout(L, word, rows, sc, burst, t, y) {
  const w = H.text7w(word, sc); if (w > L.W - 8) sc = Math.max(1, Math.floor((L.W - 8) / (w / sc)));
  if (burst) H.starburst(L.cx, y + 3.5 * sc, Math.min(46, 9 * sc + 12), t * 0.8, 'yellow', 'orange', 14);
  H.text7c(word, L.cx, y, sc, rows, 'void', 2);
  return y + 7 * sc + 4;
}
function foot(L, left, right) {
  if (left) H.text3(left, 4, L.H - 9, 'lime', 1, 'void');
  if (right) H.text3r(right, L.W - 4, L.H - 9, 'lime', 1, 'void');
}
const shelf = L => L.bot + 14;                           // first free row on the shelf under the game rect
UI.portrait = { wrap, lines, ruleLines, headline, shout, foot };

// =========================================================================================
// Menus (the shootable signs stay in the 3D; captions and help move here)
// =========================================================================================
SC.title.drawPortrait = function (t, L) {
  const y = Math.max(3, Math.round((L.top - 10) / 2 - 20));
  H.text7c('B.L.A.M.', L.cx, y, 2, 'gold', 'void', 2);
  H.text3c('BLAST LIKE A MANIAC!', L.cx, y + 24, 'cyan', 1, 'void');
  if (blink(t)) H.text3c(G().touch ? 'TAP A SIGN!' : 'SHOOT A SIGN!', L.cx, shelf(L) + 6, 'yellow', 2, 'void');
  lines('PLAY: A 4 STAGE COURSE.  VERSUS: A FRIEND ONLINE.  FREE PLAY: ANY STAGE.', L.cx, shelf(L) + 26, L.W - 16, 'mist');
  foot(L, 'BUILD ' + G().BUILD);
};
SC.settings.drawPortrait = function (t, L) {
  headline(L, 'SETTINGS', 'TAP A SIGN TO CHANGE IT');
  let y = lines('DITHER OFF = PALETTE SNAP ONLY', L.cx, shelf(L), L.W - 12, 'mist');
  y = lines('NAME = WHAT YOUR RIVAL SEES IN VERSUS', L.cx, y + 3, L.W - 12, 'mist');
  if (!G().touch) lines('KEY 4 CYCLES GUNS ANYWHERE', L.cx, y + 3, L.W - 12, 'mist');
  foot(L, 'BUILD ' + G().BUILD, R.MODE_NAMES[R.mode]);
};
SC.tiers.drawPortrait = function (t, L) {
  headline(L, 'PICK A COURSE', '4 STAGES. MISS A QUOTA OR SHOOT A BOMB: LIFE -1');
  let y = shelf(L);
  H.text3c('BEST COURSE SCORES', L.cx, y, 'yellow', 1, 'void'); y += 11;
  S.TIERS.forEach((T, i) => {
    const b = B.Save.best('course', i);
    H.text3(T.name, L.cx - 72, y, 'bone', 1, 'void'); H.text3(T.lives + ' LIVES', L.cx - 18, y, 'haze', 1, 'void');
    H.text3r(b ? String(b) : '-', L.cx + 72, y, b ? 'lemon' : 'slate', 1, 'void'); y += 9;
  });
  foot(L, 'BUILD ' + G().BUILD);
};
SC.free.drawPortrait = function (t, L) {
  headline(L, 'FREE PLAY', 'TAP A STAGE TO PLAY IT');
  const tier = G().free.tier; let y = shelf(L);
  H.text3c('TIER: ' + S.TIERS[tier].name, L.cx, y, 'yellow', 1, 'void'); y += 11;
  for (const it of this.menu.items) if (it.stage) {
    const d = S.get(it.stage), b = B.Save.best(it.stage + ':' + it.variant, tier);
    H.text3((d.short || 'RANGE') + ' ' + (it.variant + 1) + ' ' + ((d.variantNames || [])[it.variant] || ''), 5, y, 'bone', 1, 'void');
    H.text3r(b ? 'BEST ' + b : B.Ammo.describe(d.config(tier, it.variant).ammo), L.W - 5, y, b ? 'lemon' : 'haze', 1, 'void');
    y += 9;
  }
  foot(L, 'BUILD ' + G().BUILD);
};
SC.scores.drawPortrait = function (t, L) {
  headline(L, 'HIGH SCORES', 'LOCAL BESTS ON THIS DEVICE');
  const rows = [];
  for (const id of S.order) { const d = S.get(id); for (let v = 0; v < d.variants; v++) rows.push([(d.short || 'RANGE') + ' ' + (v + 1), id + ':' + v]); }
  rows.push(['COURSE', 'course']);
  const n = Math.min(rows.length, 14), w = Math.min(L.W - 6, 206), x0 = Math.round(L.cx - w / 2), y0 = shelf(L) - 2, cw = (w - 50) / 4;
  H.plate(x0, y0, w, 22 + n * 10);
  ['BEG', 'ADV', 'V.HARD', 'INSANE'].forEach((a, i) => H.text3c(a, x0 + 46 + cw * i + cw / 2, y0 + 7, 'oxblood', 1));
  rows.slice(0, n).forEach(([label, key], r) => {
    const y = y0 + 18 + r * 10;
    H.rect(x0 + 4, y - 2, w - 8, 1, 'rust'); H.text3(label, x0 + 6, y + 1, 'umber', 1);
    for (let i = 0; i < 4; i++) { const b = B.Save.best(key, i); H.text3c(b ? String(b) : '-', x0 + 46 + cw * i + cw / 2, y + 1, b ? 'void' : 'chestnut', 1); }
  });
  foot(L, 'BUILD ' + G().BUILD);
};
SC.lobby.drawPortrait = function (t, L) {
  const N = B.Net, S2 = S.TIERS;
  headline(L, 'VERSUS', '2 PLAYERS ONLINE. FIRST HIT TAKES IT!');
  let y = shelf(L);
  if (N.state === 'idle') y = lines('HOST GAME: GET A CODE FOR A FRIEND.  JOIN GAME: TYPE THEIR CODE.  SAME STAGE, SAME TARGETS.', L.cx, y, L.W - 16, 'mist');
  if (N.code && (N.state === 'hosting' || N.state === 'joined')) {
    H.stoneBanner(L.cx - 76, y - 2, 152, 34);
    H.text3c(N.state === 'hosting' ? 'YOUR CODE' : 'JOINED', L.cx, y + 2, 'slate', 1);
    H.text7c(N.code, L.cx, y + 12, 2, 'red', 'void', 1); y += 38;
  }
  if (N.state === 'hosting' || N.state === 'joined') {
    const P = N.players, bw = 90;
    H.box(L.cx - bw - 8, y, bw, 15, 'red', 'coral', 'crimson'); H.text3c(P[0] ? P[0].name : '...', L.cx - bw / 2 - 8, y + 5, 'bone', 1);
    H.text7c('VS', L.cx, y + 4, 1, 'gold', 'void', 1);
    H.box(L.cx + 8, y, bw, 15, 'blue', 'cyan', 'deepblue'); H.text3c(P[1] ? P[1].name : (blink(t) ? 'WAITING' : ''), L.cx + bw / 2 + 8, y + 5, 'bone', 1);
    y += 22;
    if (N.state === 'hosting' && !P[1]) y = lines('TELL A FRIEND TO PICK VERSUS > JOIN GAME AND TYPE THIS CODE', L.cx, y, L.W - 12, 'mist');
    if (N.state === 'joined') y = lines('THE HOST PICKS TIER + STAGE: ' + S2[N.lobby.tier].name + ', ' + (S.get(N.lobby.stage).short || 'RANGE') + ' ' + (N.lobby.variant + 1), L.cx, y, L.W - 12, 'mist');
  }
  if (N.status) lines(N.status, L.cx, y + 3, L.W - 12, N.state === 'offline' ? 'red' : 'yellow');
  foot(L, 'BUILD ' + G().BUILD, N.state.toUpperCase());
};

// =========================================================================================
// Briefing card: rule on a stone banner in the curtain, then three cards (quota / shots / time) on the shelf
// =========================================================================================
function card(x, y, w, h, kind) {                        // kind 'red' | 'magenta' | 'panel'
  if (kind === 'panel') { H.redPanel(x, y, w, h); return; }
  if (kind === 'magenta') H.box(x, y, w, h, 'magenta', 'pink', 'plum'); else H.box(x, y, w, h, 'red', 'coral', 'crimson');
}
SC.briefing.drawPortrait = function (t, L) {
  const a = this.a, run = a.run, c = run.cfg, b = run.def.briefing(c), vs = a.versus;
  const rule = vs ? [['FIRST HIT ON A TARGET ', 'void'], ['TAKES IT!', 'red']] : b.rule;
  const bw = L.W - 8, sc = ruleHeight(rule, bw - 16, 2) <= 23 ? 2 : 1, rh = ruleHeight(rule, bw - 16, sc);
  const info = [a.label || '', (c.title || '') + (c.subtitle ? ': ' + c.subtitle : '')].filter(Boolean);
  const total = rh + 14 + 4 + info.length * 8;
  let y = Math.max(2, Math.round((L.top - 10 - total) / 2));
  H.stoneBanner(4, y, bw, rh + 14);
  ruleLines(rule, L.cx, y + 7, bw - 16, sc);
  y += rh + 18;
  info.forEach((s, i) => { H.text3c(s, L.cx, y, i ? 'mist' : 'yellow', 1, 'void'); y += 8; });
  // shelf: three cards
  const cw = Math.floor((L.W - 16) / 3), ch = 66, x0 = Math.round(L.cx - (cw * 3 + 8) / 2);
  y = shelf(L) - 4;
  card(x0, y, cw, ch, 'panel');
  H.text7c('SHOOT!', x0 + cw / 2, y + 8, 1, 'gold', 'void', 1);
  if (run.def.drawIcon) run.def.drawIcon(x0 + cw / 2, y + 29, 8, t); else H.bullseyeIcon(x0 + cw / 2, y + 29, 8);
  if (vs) { H.text3c('MOST HITS', x0 + cw / 2, y + 44, 'bone', 1); H.text3c('WINS', x0 + cw / 2, y + 52, 'lemon', 1); }
  else { H.text7c(String(c.quota), x0 + cw / 2, y + 41, 2, 'gold', 'void', 1); H.text3c(b.unit || 'TARGETS', x0 + cw / 2, y + 57, 'bone', 1); }
  const x1 = x0 + cw + 4, r = c.ammo || 'unlimited';
  card(x1, y, cw, ch, 'red');
  H.text3c('SHOTS', x1 + cw / 2, y + 6, 'bone', 1, 'void');
  if (r === 'unlimited' || (!r.mag && !r.cap)) { H.sprite(H.INF, x1 + cw / 2 - 9, y + 22, 2, { X: 'bone' }, 'inf'); H.text3c('NO LIMIT', x1 + cw / 2, y + 44, 'lemon', 1, 'void'); }
  else { H.text7c(String(r.mag || r.cap), x1 + cw / 2, y + 18, 2, 'bone', 'void', 1); H.text3c(r.mag ? 'PER MAG' : 'IN TOTAL', x1 + cw / 2, y + 38, 'lemon', 1, 'void'); H.text3c(r.mag ? (r.autoReload ? 'AUTO RELOAD' : 'SHOOT SIDE') : 'COUNT!', x1 + cw / 2, y + 48, 'bone', 1, 'void'); }
  const x2 = x1 + cw + 4;
  card(x2, y, cw, ch, 'magenta');
  H.text3c('TIME', x2 + cw / 2, y + 6, 'bone', 1, 'void');
  H.text7c(String(c.time), x2 + cw / 2, y + 20, 3, 'bone', 'void', 1);
  H.text3c('SECONDS', x2 + cw / 2, y + 48, 'lemon', 1, 'void');
  y += ch + 8;
  if (b.dont) {
    H.sticker(L.cx - 70, y, 140, 22);
    if (run.def.drawDont) { run.def.drawDont(L.cx - 56, y + 11, 7, t); H.redX(L.cx - 50, y + 16, 3); }
    else { H.bombIcon(L.cx - 56, y + 11, 7, t); H.redX(L.cx - 56, y + 11, 5); }
    H.text3("DON'T SHOOT!", L.cx - 42, y + 4, 'void', 1); H.text3('LIFE -1', L.cx - 42, y + 12, 'crimson', 1); y += 28;
  }
  if (b.tip && !vs) { H.text3c(b.tip, L.cx, y, 'lemon', 1, 'void'); y += 10; }
  if (vs) {
    const P = run.players, line = P[0].name + ' VS ' + P[1].name, x = Math.round(L.cx - H.text3w(line) / 2);
    H.text3(P[0].name, x, y, 'coral', 1, 'void'); H.text3('VS', x + H.text3w(P[0].name + ' ') + 1, y, 'bone', 1, 'void'); H.text3(P[1].name, x + H.text3w(P[0].name + ' VS ') + 1, y, 'ice', 1, 'void');
    H.text3c('GET READY... ' + Math.max(0, Math.ceil((run.wall0 - performance.now()) / 1000)), L.cx, y + 12, 'yellow', 2, 'void');
  } else if (blink(t)) H.text3c(tapWord() + ' TO SKIP', L.cx, Math.min(y + 4, L.H - 22), 'yellow', 1, 'void');
  foot(L, a.status || '');
};

// =========================================================================================
// Results / game over / course clear / versus results: the shout in the curtain, the numbers on the shelf
// =========================================================================================
SC.results.drawPortrait = function (t, L) {
  const r = this.a.res;
  let y = Math.max(4, Math.round((L.top - 10 - 70) / 2));
  y = shout(L, r.cleared ? 'CLEARED!' : 'FAILED!', r.cleared ? 'gold' : 'red', 3, r.cleared, t, y);
  H.redPanel(L.cx - 62, y + 2, 124, 40);
  H.text3c('STAGE SCORE', L.cx, y + 10, 'bone', 1);
  H.text7c(String(r.score), L.cx, y + 20, 2, 'gold', 'void', 1);
  // shelf: the stats plate
  const w = Math.min(L.W - 8, 200), x0 = Math.round(L.cx - w / 2), py = shelf(L) - 4, row = 13;
  H.plate(x0, py, w, 15 + row * 5);
  const rowF = (i, k, v, c = 'void') => { H.text3(k, x0 + 9, py + 9 + i * row, 'umber', 2); H.text3r(v, x0 + w - 9, py + 9 + i * row, c, 2); };
  rowF(0, 'HITS', r.hits + (this.a.versus ? '' : '/' + r.quota), r.hits >= r.quota ? 'forest' : 'crimson');
  rowF(1, 'HIT %', r.pct + '%');
  rowF(2, 'FASTEST', isFinite(r.fastest) ? r.fastest.toFixed(2) + 'S' : '-');
  rowF(3, 'POINTS', String(r.base));
  rowF(4, 'BONUS', r.bonus ? '+' + r.bonus : '-', r.bonus ? 'forest' : 'chestnut');
  y = py + 15 + row * 5 + 5;
  H.text3c('BEST ' + this.a.best + (this.a.total != null ? '    TOTAL ' + this.a.total : ''), L.cx, y, 'mist', 1, 'void'); y += 10;
  if (this.a.newRecord && blink(t, 6)) H.text7c('NEW RECORD!', L.cx, y, 1, 'hot', 'void', 1);
  if (this.a.lifeLost) { const ly = y + (this.a.newRecord ? 11 : 0); H.sprite(H.HEART, L.cx - 30, ly, 1, H.HEART_OFF, 'heartoff'); H.text3('LIFE -1', L.cx - 18, ly + 2, 'red', 1, 'void'); }
  if (this.t > 1.0 && blink(t)) H.text3c(tapWord() + ' TO CONTINUE', L.cx, L.H - 20, 'yellow', 1, 'void');
  foot(L, this.a.status || '');
};
SC.gameover.drawPortrait = function (t, L) {
  let y = Math.max(4, Math.round((L.top - 10 - 40) / 2));
  y = shout(L, 'GAME OVER', 'red', 3, false, t, y);
  H.text3c('CONTINUE?', L.cx, y + 2, 'bone', 2, 'void');
  const by = shelf(L) + 16;
  H.timerBall(L.cx, by, this.count / 10, Math.max(0, Math.ceil(this.count)), t);
  H.text3c('SCORE ' + (this.a.total || 0) + '   STAGE ' + (this.a.stage || 1) + '/4', L.cx, by + 24, 'yellow', 1, 'void');
  lines('SHOOT CONTINUE TO RETRY THE STAGE. HEARTS REFILL, THE SCORE RESETS.', L.cx, by + 36, L.W - 16, 'mist');
  foot(L, this.a.status || '');
};
SC.final.drawPortrait = function (t, L) {
  let y = Math.max(4, Math.round((L.top - 10 - 64) / 2));
  y = shout(L, 'COURSE CLEAR!', 'gold', 2, true, t, y);
  H.text3c(S.TIERS[this.a.tier].name, L.cx, y + 4, 'cyan', 2, 'void');
  const py = shelf(L) - 4;
  H.redPanel(L.cx - 80, py, 160, 56);
  H.text3c('TOTAL SCORE', L.cx, py + 10, 'bone', 1);
  H.text7c(String(this.a.total), L.cx, py + 22, 3, 'gold', 'void', 2);
  y = py + 62;
  H.text3c('BEST ' + this.a.best, L.cx, y, 'mist', 1, 'void'); y += 10;
  if (this.a.newRecord && blink(t, 6)) H.text7c('NEW RECORD!', L.cx, y, 2, 'hot', 'void', 2);
  if (this.t > 1.5 && blink(t)) H.text3c(tapWord() + ' TO CONTINUE', L.cx, L.H - 20, 'yellow', 1, 'void');
};
SC.vsresults.drawPortrait = function (t, L) {
  const run = this.a.run, me = run.local, P = run.players;
  const word = this.win < 0 ? 'DRAW!' : this.win === me ? 'WINNER!' : 'LOSER...';
  const y0 = Math.max(4, Math.round((L.top - 10 - 26) / 2));
  shout(L, word, this.win < 0 ? 'bone' : this.win === me ? 'gold' : 'blue', 3, this.win === me, t, y0);
  const bw = Math.floor((L.W - 14) / 2), by = shelf(L) + 8;
  [0, 1].forEach(i => {
    const p = P[i], x = i ? L.cx + 3 : L.cx - 3 - bw, C = H.PCOL[i];
    H.box(x, by, bw, 66, C[2], C[1], 'void');
    H.text3c(p.name + (i === me ? ' (YOU)' : ''), x + bw / 2, by + 4, 'bone', 1);
    if (this.win === i) H.text7c(i === me ? 'YOU WIN' : 'WINS', x + bw / 2, by - 12, 1, 'gold', 'void', 1);
    const shots = Math.max(p.shots, p.hits), pct = shots ? Math.round(p.hits / shots * 100) : 0;
    [['HITS', p.hits], ['HIT %', pct + '%'], ['FASTEST', isFinite(p.fastest) ? p.fastest.toFixed(2) + 'S' : '-'], ['SCORE', p.score], ['LIVES', p.lives]].forEach(([k, v], r) => {
      H.text3(k, x + 5, by + 15 + r * 10, C[0], 1); H.text3r(String(v), x + bw - 5, by + 15 + r * 10, 'bone', 1);
    });
  });
  if (this.t > 1.5 && blink(t)) H.text3c(tapWord() + ' FOR THE LOBBY', L.cx, L.H - 20, 'yellow', 1, 'void');
};
})(window.BLAM);
