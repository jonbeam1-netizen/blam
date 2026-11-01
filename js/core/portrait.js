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
   #100: everything a player reads here is in the bold 7-row font (H.textB*, ~7 outer px a character, 7 rows tall)
   instead of the 3x5 one; lines are 10 px apart.
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const R = B.R, H = B.HUD, UI = B.UI, S = B.Stage, SC = UI.screens;
const G = () => B.G;
const blink = (t, hz = 2.2) => ((t * hz) | 0) % 2 === 0;
const tapWord = () => G().touch ? 'TAP' : 'CLICK';

// ---------- helpers ----------
// word wrap for the bold menu text, balanced: as many lines as a greedy wrap at maxW needs, but as even as possible
// ("SHOOT 7 TARGETS / OR MORE!" rather than "SHOOT 7 TARGETS OR / MORE!"). items: [[word, colour], ...]
function wrapItems(items, maxW, sc) {
  const width = ws => H.textBw(ws.map(w => w[0]).join(' '), sc);
  const greedy = mw => { const rows = []; let cur = []; for (const w of items) { if (cur.length && width(cur.concat([w])) > mw) { rows.push(cur); cur = [w]; } else cur.push(w); } if (cur.length) rows.push(cur); return rows; };
  let rows = greedy(maxW); const n = rows.length;
  if (n > 1) for (let mw = maxW - 4; mw > 8; mw -= 4) { const r = greedy(mw); if (r.length > n) break; rows = r; }
  return { rows, width };
}
const words = (str, c) => String(str).toUpperCase().split(' ').filter(Boolean).map(w => [w, c]);
function wrap(str, maxW, sc = 1) { return wrapItems(words(str), maxW, sc).rows.map(ws => ws.map(w => w[0]).join(' ')); }
// centred, wrapped, outlined bold text; returns the y under the last line
function lines(str, cx, y, maxW, col, sc = 1, gap = 3) {
  for (const s of wrap(str, maxW, sc)) { H.textBc(s, cx, y, col, sc, 'void'); y += 7 * sc + gap; }
  return y;
}
// one bold line that falls back to the 3x5 font only when it would not fit maxW (long player names)
function fit(str, cx, y, col, maxW, outline) {
  if (H.textBw(str) <= maxW) H.textBc(str, cx, y + 0, col, 1, outline); else H.text3c(str, cx, y + 1, col, 1, outline);
}
// a rule made of coloured parts ([[text, colour], ...]) wrapped word by word; returns the y under it
// a part that starts right after the previous one without a space (". DON'T", "!") glues its first word on (#100)
const partWords = parts => [].concat(...parts.map(([s, c], i) => words(s, c).map((w, k) => {
  if (!k && i && !/^\s/.test(s) && !/\s$/.test(parts[i - 1][0])) w.push(1); return w; })));
function ruleLines(parts, cx, y, maxW, sc) {
  const { rows, width } = wrapItems(partWords(parts), maxW, sc);
  const gap = H.textBw(' ', sc) + 2 * sc;
  for (const ws of rows) {
    const rw = width(ws) - ws.filter((w, i) => i && w[2]).length * (gap - sc);
    let x = Math.round(cx - rw / 2);
    ws.forEach(([s, c, glue], i) => { if (i && glue) x -= gap - sc; x += H.textB(s, x, y, c, sc) + gap; });
    y += 7 * sc + 3;
  }
  return y;
}
const ruleHeight = (parts, maxW, sc) => wrapItems(partWords(parts), maxW, sc).rows.length * (7 * sc + 3) - 3;
// headline in the curtain: a big bold title on a red sign board (+ optional sub line), centred in the space
function headline(L, title, sub, rows = 'gold', sc = 2) {
  const tw = H.text7w(title, sc), subL = sub ? wrap(sub, L.W - 24) : [];
  const w = Math.min(L.W - 6, Math.max(tw, ...subL.map(s => H.textBw(s))) + 26);
  const h = 7 * sc + 18 + subL.length * 10 + (subL.length ? 2 : 0);
  const y = Math.max(2, Math.round((L.top - 10 - h) / 2)), x = Math.round(L.cx - w / 2);
  H.redPanel(x, y, w, h);
  H.text7c(title, L.cx, y + 9, sc, rows, 'void', 2);
  let yy = y + 9 + 7 * sc + 5;
  for (const s of subL) { H.textBc(s, L.cx, yy, 'cyan', 1); yy += 10; }
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
  if (left) H.textB(left, 4, L.H - 11, 'lime', 1, 'void');
  if (right) H.textBr(right, L.W - 4, L.H - 11, 'lime', 1, 'void');
}
const shelf = L => L.bot + 14;                           // first free row on the shelf under the game rect
UI.portrait = { wrap, lines, fit, ruleLines, headline, shout, foot };

// =========================================================================================
// Menus (the shootable signs stay in the 3D; captions and help move here)
// =========================================================================================
SC.title.drawPortrait = function (t, L) {
  const y = Math.max(3, Math.round((L.top - 10) / 2 - 20));
  H.text7c('B.L.A.M.', L.cx, y, 2, 'gold', 'void', 2);
  H.textBc('BLAST LIKE A MANIAC!', L.cx, y + 23, 'cyan', 1, 'void');
  if (blink(t)) H.textBc(G().touch ? 'TAP A SIGN!' : 'SHOOT A SIGN!', L.cx, shelf(L) + 4, 'yellow', 2, 'void');
  lines('PLAY: A 4 STAGE COURSE.  VERSUS: A FRIEND ONLINE.  FREE PLAY: ANY STAGE.', L.cx, shelf(L) + 26, L.W - 16, 'mist');
  foot(L, 'BUILD ' + G().BUILD);
};
SC.settings.drawPortrait = function (t, L) {
  headline(L, 'SETTINGS', 'TAP A SIGN TO CHANGE IT');
  let y = lines('DITHER OFF = PALETTE SNAP ONLY', L.cx, shelf(L), L.W - 12, 'mist');
  y = lines('NAME = WHAT YOUR RIVAL SEES IN VERSUS', L.cx, y + 3, L.W - 12, 'mist');
  if (!G().touch) y = lines('KEY 4 CYCLES GUNS ANYWHERE', L.cx, y + 3, L.W - 12, 'mist');
  const rh = B.UI.reloadHelp();                                              // RELOAD TYPE (build 0.005)
  y = lines('RELOAD TYPE ' + rh.group, L.cx, y + 6, L.W - 12, 'yellow');
  lines(rh.help, L.cx, y + 3, L.W - 12, 'mist');
  foot(L, 'BUILD ' + G().BUILD, R.MODE_NAMES[R.mode]);
};
SC.tiers.drawPortrait = function (t, L) {
  headline(L, 'PICK A COURSE', '4 STAGES. MISS A QUOTA OR SHOOT A BOMB: LIFE -1');
  let y = shelf(L);
  H.textBc('BEST COURSE SCORES', L.cx, y, 'yellow', 1, 'void'); y += 13;
  S.TIERS.forEach((T, i) => {
    const b = B.Save.best('course', i);
    H.textB(T.name, L.cx - 98, y, 'bone', 1, 'void'); H.textB(T.lives + ' LIVES', L.cx - 30, y, 'haze', 1, 'void');
    H.textBr(b ? String(b) : '-', L.cx + 98, y, b ? 'lemon' : 'slate', 1, 'void'); y += 11;
  });
  foot(L, 'BUILD ' + G().BUILD);
};
SC.free.drawPortrait = function (t, L) {
  headline(L, 'FREE PLAY', 'TAP A STAGE TO PLAY IT');
  const tier = G().free.tier; let y = shelf(L);
  H.textBc('TIER: ' + S.TIERS[tier].name + '   PAGE ' + (G().free.page + 1) + '/' + (this.pages || 1), L.cx, y, 'yellow', 1, 'void'); y += 13;
  // #100: two bold lines a stage (name + variant, then best / ammo) so nothing has to shrink to fit the width
  for (const it of this.menu.items) if (it.stage) {
    const d = S.get(it.stage), b = B.Save.best(it.stage + ':' + it.variant, tier);
    H.textB((d.short || 'RANGE') + ' ' + (it.variant + 1) + '  ' + ((d.variantNames || [])[it.variant] || ''), 5, y, 'bone', 1, 'void');
    H.textBr(b ? 'BEST ' + b : B.Ammo.describe(d.config(tier, it.variant).ammo), L.W - 5, y + 9, b ? 'lemon' : 'haze', 1, 'void');
    y += 21;
  }
  foot(L, 'BUILD ' + G().BUILD);
};
SC.scores.drawPortrait = function (t, L) {
  headline(L, 'HIGH SCORES', 'LOCAL BESTS ON THIS DEVICE');
  // #100: bold rows, 11 px apart, paged to what the shelf holds (the NEXT > sign in the game rect turns the page)
  const rows = UI.scoreRows(), rh = 11, y0 = shelf(L) - 2, per = Math.max(4, Math.floor((L.H - 26 - y0 - 24) / rh));
  this.pages = Math.max(1, Math.ceil(rows.length / per)); this.page = Math.min(this.page || 0, this.pages - 1);
  const pr = rows.slice(this.page * per, this.page * per + per);
  const w = Math.min(L.W - 4, 209), x0 = Math.round(L.cx - w / 2), lw = 48, cw = (w - lw - 6) / 4, hx = [-1, -2, -4, 2];
  H.plate(x0, y0, w, 24 + pr.length * rh);
  ['BEG', 'ADV', 'V.HARD', 'INSANE'].forEach((a, i) => H.textBc(a, x0 + lw + cw * i + cw / 2 + hx[i], y0 + 7, 'oxblood', 1, 'bone'));
  pr.forEach(([label, key], r) => {
    const y = y0 + 20 + r * rh;
    H.rect(x0 + 4, y - 2, w - 8, 1, 'rust'); H.textB(label, x0 + 5, y + 1, 'umber', 1, 'bone');
    for (let i = 0; i < 4; i++) { const b = B.Save.best(key, i); H.textBc(b ? String(b) : '-', x0 + lw + cw * i + cw / 2, y + 1, b ? 'void' : 'chestnut', 1, 'bone'); }
  });
  if (this.pages > 1) H.textBc('PAGE ' + (this.page + 1) + '/' + this.pages + ': SHOOT NEXT >', L.cx, y0 + 28 + pr.length * rh, 'cyan', 1, 'void');
  foot(L, 'BUILD ' + G().BUILD);
};
SC.lobby.drawPortrait = function (t, L) {
  const N = B.Net, S2 = S.TIERS;
  headline(L, 'VERSUS', '2 PLAYERS ONLINE. FIRST HIT TAKES IT!');
  let y = shelf(L);
  if (N.state === 'idle') y = lines('HOST GAME: GET A CODE FOR A FRIEND.  JOIN GAME: TYPE THEIR CODE.  SAME STAGE, SAME TARGETS.', L.cx, y, L.W - 16, 'mist');
  if (N.code && (N.state === 'hosting' || N.state === 'joined')) {
    H.stoneBanner(L.cx - 76, y - 2, 152, 34);
    H.textBc(N.state === 'hosting' ? 'YOUR CODE' : 'JOINED', L.cx, y + 2, 'slate', 1);
    H.text7c(N.code, L.cx, y + 12, 2, 'red', 'void', 1); y += 38;
  }
  if (N.state === 'hosting' || N.state === 'joined') {
    const P = N.players, bw = 90;
    H.box(L.cx - bw - 8, y, bw, 15, 'red', 'coral', 'crimson'); fit(P[0] ? P[0].name : '...', L.cx - bw / 2 - 8, y + 4, 'bone', bw - 4);
    H.text7c('VS', L.cx, y + 4, 1, 'gold', 'void', 1);
    H.box(L.cx + 8, y, bw, 15, 'blue', 'cyan', 'deepblue'); fit(P[1] ? P[1].name : (blink(t) ? 'WAITING' : ''), L.cx + bw / 2 + 8, y + 4, 'bone', bw - 4);
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
  const total = rh + 14 + 4 + info.length * 10;
  let y = Math.max(2, Math.round((L.top - 10 - total) / 2));
  H.stoneBanner(4, y, bw, rh + 14);
  ruleLines(rule, L.cx, y + 7, bw - 16, sc);
  y += rh + 18;
  info.forEach((s, i) => { fit(s, L.cx, y, i ? 'mist' : 'yellow', L.W - 6, 'void'); y += 10; });
  // shelf: three cards
  const cw = Math.floor((L.W - 16) / 3), ch = 66, x0 = Math.round(L.cx - (cw * 3 + 8) / 2);
  y = shelf(L) - 4;
  card(x0, y, cw, ch, 'panel');
  H.text7c('SHOOT!', x0 + cw / 2, y + 8, 1, 'gold', 'void', 1);
  if (run.def.drawIcon) run.def.drawIcon(x0 + cw / 2, y + 29, 8, t); else H.bullseyeIcon(x0 + cw / 2, y + 29, 8);
  if (vs) { fit('MOST HITS', x0 + cw / 2, y + 43, 'bone', cw - 4); fit('WINS', x0 + cw / 2, y + 53, 'lemon', cw - 4); }
  else { H.text7c(String(c.quota), x0 + cw / 2, y + 39, 2, 'gold', 'void', 1); fit(b.unit || 'TARGETS', x0 + cw / 2, y + 56, 'bone', cw - 4); }
  const x1 = x0 + cw + 4, r = c.ammo || 'unlimited';
  card(x1, y, cw, ch, 'red');
  H.textBc('SHOTS', x1 + cw / 2, y + 5, 'bone', 1, 'void');
  if (r === 'unlimited' || (!r.mag && !r.cap)) { H.sprite(H.INF, x1 + cw / 2 - 9, y + 22, 2, { X: 'bone' }, 'inf'); fit('NO LIMIT', x1 + cw / 2, y + 43, 'lemon', cw - 4, 'void'); }
  else {
    H.text7c(String(r.mag || r.cap), x1 + cw / 2, y + 16, 2, 'bone', 'void', 1); fit(r.mag ? 'PER MAG' : 'IN TOTAL', x1 + cw / 2, y + 35, 'lemon', cw - 4, 'void');
    // the reload words wrap onto two bold lines (SHOOT / SIDE, RIGHT / CLICK, AUTO / RELOAD)
    B.UI.wrapB(r.mag ? (r.autoReload ? 'AUTO RELOAD' : B.UI.reloadCard(false)[0]) : 'COUNT!', cw - 4).slice(0, 2).forEach((l, i) => fit(l, x1 + cw / 2, y + 46 + i * 9, 'bone', cw - 2, 'void'));
  }
  const x2 = x1 + cw + 4;
  card(x2, y, cw, ch, 'magenta');
  H.textBc('TIME', x2 + cw / 2, y + 5, 'bone', 1, 'void');
  H.text7c(String(c.time), x2 + cw / 2, y + 19, 3, 'bone', 'void', 1);
  fit('SECONDS', x2 + cw / 2, y + 48, 'lemon', cw - 4, 'void');
  y += ch + 8;
  if (b.dont) {
    H.sticker(L.cx - 70, y, 140, 22);
    if (run.def.drawDont) { run.def.drawDont(L.cx - 56, y + 11, 7, t); H.redX(L.cx - 50, y + 16, 3); }
    else { H.bombIcon(L.cx - 56, y + 11, 7, t); H.redX(L.cx - 56, y + 11, 5); }
    H.textB("DON'T SHOOT!", L.cx - 42, y + 3, 'void', 1); H.textB('LIFE -1', L.cx - 42, y + 12, 'crimson', 1); y += 28;
  }
  if (b.tip && !vs) y = lines(B.UI.reloadTip(b.tip, c.ammo), L.cx, y, L.W - 10, 'lemon') + 1;
  if (vs) {
    const P = run.players, line = P[0].name + ' VS ' + P[1].name;
    if (H.textBw(line) <= L.W - 6) { let x = Math.round(L.cx - H.textBw(line) / 2); x += H.textB(P[0].name, x, y, 'coral', 1, 'void') + 5; x += H.textB('VS', x, y, 'bone', 1, 'void') + 5; H.textB(P[1].name, x, y, 'ice', 1, 'void'); }
    else { const x = Math.round(L.cx - H.text3w(line) / 2); H.text3(P[0].name, x, y, 'coral', 1, 'void'); H.text3('VS', x + H.text3w(P[0].name + ' ') + 1, y, 'bone', 1, 'void'); H.text3(P[1].name, x + H.text3w(P[0].name + ' VS ') + 1, y, 'ice', 1, 'void'); }
    H.textBc('GET READY... ' + Math.max(0, Math.ceil((run.wall0 - performance.now()) / 1000)), L.cx, y + 13, 'yellow', 2, 'void');
  } else if (blink(t)) H.textBc(tapWord() + ' TO SKIP', L.cx, Math.min(y + 4, L.H - 24), 'yellow', 1, 'void');
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
  H.textBc('STAGE SCORE', L.cx, y + 9, 'bone', 1);
  H.text7c(String(r.score), L.cx, y + 20, 2, 'gold', 'void', 1);
  // shelf: the stats plate
  const w = Math.min(L.W - 8, 200), x0 = Math.round(L.cx - w / 2), py = shelf(L) - 4, row = 13;
  H.plate(x0, py, w, 15 + row * 5);
  const rowF = (i, k, v, c = 'void') => { H.textB(k, x0 + 9, py + 10 + i * row, 'umber', 1, 'bone'); H.textBr(v, x0 + w - 9, py + 10 + i * row, c, 1, 'bone'); };
  rowF(0, 'HITS', r.hits + (this.a.versus ? '' : '/' + r.quota), r.hits >= r.quota ? 'forest' : 'crimson');
  rowF(1, 'HIT %', r.pct + '%');
  rowF(2, 'FASTEST', isFinite(r.fastest) ? r.fastest.toFixed(2) + 'S' : '-');
  rowF(3, 'POINTS', String(r.base));
  rowF(4, 'BONUS', r.bonus ? '+' + r.bonus : '-', r.bonus ? 'forest' : 'chestnut');
  y = py + 15 + row * 5 + 5;
  fit('BEST ' + this.a.best + (this.a.total != null ? '   TOTAL ' + this.a.total : ''), L.cx, y, 'mist', L.W - 6, 'void'); y += 11;
  if (this.a.newRecord && blink(t, 6)) H.text7c('NEW RECORD!', L.cx, y, 1, 'hot', 'void', 1);
  if (this.a.lifeLost) { const ly = y + (this.a.newRecord ? 11 : 0); H.sprite(H.HEART, L.cx - 30, ly, 1, H.HEART_OFF, 'heartoff'); H.textB('LIFE -1', L.cx - 18, ly + 1, 'red', 1, 'void'); }
  if (!this.menu && this.t > 1.0 && blink(t)) H.textBc(tapWord() + ' TO CONTINUE', L.cx, L.H - 24, 'yellow', 1, 'void');   // free play: AGAIN / BACK signs instead
  foot(L, this.a.status || '');
};
SC.gameover.drawPortrait = function (t, L) {
  let y = Math.max(4, Math.round((L.top - 10 - 40) / 2));
  y = shout(L, 'GAME OVER', 'red', 3, false, t, y);
  H.text7c('CONTINUE?', L.cx, y + 2, 2, 'bone', 'void', 1);
  const by = shelf(L) + 16;
  H.timerBall(L.cx, by, this.count / 10, Math.max(0, Math.ceil(this.count)), t);
  H.textBc('SCORE ' + (this.a.total || 0) + '   STAGE ' + (this.a.stage || 1) + '/4', L.cx, by + 24, 'yellow', 1, 'void');
  lines('SHOOT CONTINUE TO RETRY THE STAGE. HEARTS REFILL, THE SCORE RESETS.', L.cx, by + 36, L.W - 16, 'mist');
  foot(L, this.a.status || '');
};
SC.final.drawPortrait = function (t, L) {
  let y = Math.max(4, Math.round((L.top - 10 - 64) / 2));
  y = shout(L, 'COURSE CLEAR!', 'gold', 2, true, t, y);
  H.textBc(S.TIERS[this.a.tier].name, L.cx, y + 3, 'cyan', 2, 'void');
  const py = shelf(L) - 4;
  H.redPanel(L.cx - 80, py, 160, 56);
  H.textBc('TOTAL SCORE', L.cx, py + 9, 'bone', 1);
  H.text7c(String(this.a.total), L.cx, py + 22, 3, 'gold', 'void', 2);
  y = py + 62;
  H.textBc('BEST ' + this.a.best, L.cx, y, 'mist', 1, 'void'); y += 12;
  if (this.a.newRecord && blink(t, 6)) H.text7c('NEW RECORD!', L.cx, y, 2, 'hot', 'void', 2);
  if (this.t > 1.5 && blink(t)) H.textBc(tapWord() + ' TO CONTINUE', L.cx, L.H - 24, 'yellow', 1, 'void');
};
SC.vsresults.drawPortrait = function (t, L) {
  const run = this.a.run, me = run.local, P = run.players;
  const word = this.win < 0 ? 'DRAW!' : this.win === me ? 'WINNER!' : 'LOSER...';
  // 0.007: banner, then the verdict line (YOU WIN / <NAME> WINS) right under it in the curtain; never on the cards
  const vl = B.UI.vsVerdict(this.win, me, P), vsc = H.text7w(vl[0], 2) <= L.W - 12 && L.top >= 70 ? 2 : 1;
  const bh = 21, lh = 7 * vsc, y0 = Math.max(4, Math.round((L.top - 6 - bh - 6 - lh) / 2));
  const ly = shout(L, word, this.win < 0 ? 'bone' : this.win === me ? 'gold' : 'blue', 3, this.win === me, t, y0) + 2;
  H.text7c(vl[0], L.cx, ly, vsc, vl[1], 'void', vsc === 2 ? 2 : 1);
  const bw = Math.floor((L.W - 14) / 2), by = shelf(L) + 8;
  [0, 1].forEach(i => {
    const p = P[i], x = i ? L.cx + 3 : L.cx - 3 - bw, C = H.PCOL[i];
    H.box(x, by, bw, 70, C[2], C[1], 'void', this.win === i ? 'yellow' : 'void');
    fit(p.name + (i === me ? ' (YOU)' : ''), x + bw / 2, by + 4, 'bone', bw - 4);
    const shots = Math.max(p.shots, p.hits), pct = shots ? Math.round(p.hits / shots * 100) : 0;
    [['HITS', p.hits], ['HIT %', pct + '%'], ['FASTEST', isFinite(p.fastest) ? p.fastest.toFixed(2) + 'S' : '-'], ['SCORE', p.score], ['LIVES', p.lives]].forEach(([k, v], r) => {
      H.textB(k, x + 5, by + 16 + r * 10, C[0], 1); H.textBr(String(v), x + bw - 5, by + 16 + r * 10, 'bone', 1);
    });
  });
  if (this.t > 1.5 && blink(t)) H.textBc(tapWord() + ' FOR THE LOBBY', L.cx, L.H - 24, 'yellow', 1, 'void');
};
})(window.BLAM);
