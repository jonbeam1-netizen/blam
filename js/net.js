'use strict';
/* =========================================================================================
   B.L.A.M. js/net.js -- online versus (PeerJS 1.5.4 from unpkg, loaded on demand).
   Pattern: host-relay star (here: exactly one guest). The host gets a code BLAM-XXXX (peer id
   'blam-xxxx'), the friend joins by code. Both run the SAME seeded stage locally; shots go to
   the host, the host adjudicates who hit each target first and broadcasts the result.
   Protocol summary: see ENGINE.md ("Versus message protocol").
   ========================================================================================= */
window.BLAM = window.BLAM || {};
(function (B) {
const SFX = B.SFX;
const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TIMEOUT = 8000;
const G = () => B.G;
const N = {
  state: 'idle',            // idle | loading | hosting | joining | joined | offline
  isHost: false, online: false, peer: null, conn: null, code: '', me: 0,
  players: [null, null], lobby: { stage: 'range', variant: 0, tier: 0 }, status: '', heard: 0, on: {}
};
const newCode = () => { let c = ''; for (let i = 0; i < 4; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return 'BLAM-' + c; };
const peerId = code => 'blam-' + code.toLowerCase().replace(/^blam-/, '').replace(/[^a-z0-9]/g, '');
const cleanName = (n, d) => String(n || '').toUpperCase().replace(/[^A-Z0-9 \-!?.]/g, '').trim().slice(0, 10) || d;
function sendTo(c, m) { try { if (c && c.open) c.send(m); } catch (e) {} }
function touch() { if (N.on.update) N.on.update(); }
function setStatus(s) { N.status = s; touch(); }
function loadPeer(cb) {
  if (window.Peer) { cb(true); return; }
  let done = false; const fin = ok => { if (done) return; done = true; cb(ok && !!window.Peer); };
  const s = document.createElement('script'); s.src = PEER_SRC; s.async = true;
  s.onload = () => fin(true); s.onerror = () => fin(false); setTimeout(() => fin(false), 10000);
  document.head.appendChild(s);
}
function cleanup() {
  try { if (N.peer) N.peer.destroy(); } catch (e) {}
  N.peer = null; N.conn = null; N.online = false; N.isHost = false; N.code = ''; N.players = [null, null]; N.me = 0;
}
function offline(reason) { cleanup(); N.state = 'offline'; setStatus(reason || 'ONLINE PLAY UNAVAILABLE. PLAY SOLO?'); }
const inMatch = () => { const g = G(), r = g && g.run; return !!(r && r.versus && (g.screenName === 'play' || g.screenName === 'briefing')); };

// ---------- host ----------
N.host = function (name) {
  N.state = 'loading'; setStatus('LOADING ONLINE PLAY...');
  loadPeer(ok => {
    if (N.state !== 'loading') return;                                        // cancelled meanwhile
    if (!ok) { offline('COULD NOT LOAD ONLINE PLAY. PLAY SOLO?'); return; }
    hostOpen(cleanName(name, 'P1'));
  });
};
function hostOpen(name) {
  cleanup();
  const code = newCode(), peer = new Peer(peerId(code), { debug: 0 });
  N.peer = peer; N.isHost = true; N.code = code; N.me = 0; N.state = 'hosting'; N.players = [{ name }, null]; setStatus('STARTING...');
  peer.on('open', () => { N.online = true; setStatus('WAITING FOR A FRIEND...'); });
  peer.on('connection', conn => {
    if (N.conn && N.conn.open) { conn.on('open', () => { sendTo(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch (e) {} }, 300); }); return; }
    N.conn = conn;
    conn.on('open', () => { N.heard = performance.now(); });
    conn.on('data', m => { N.heard = performance.now(); hostRecv(1, m); });
    conn.on('close', () => { if (N.conn === conn) dropGuest('YOUR FRIEND LEFT'); });
    conn.on('error', () => {});
  });
  peer.on('error', err => {
    const ty = (err && err.type) || 'error';
    if (ty === 'unavailable-id') { hostOpen(name); return; }               // code taken: roll a new one
    if (!N.online) offline('NO MATCHMAKING SERVER (' + String(ty).toUpperCase() + '). PLAY SOLO?');
    else setStatus('NETWORK: ' + String(ty).toUpperCase());
  });
  peer.on('disconnected', () => { try { if (N.peer === peer) peer.reconnect(); } catch (e) {} });
}
function dropGuest(reason) {
  try { if (N.conn) N.conn.close(); } catch (e) {}
  N.conn = null; N.players[1] = null; SFX.play('vsLeave');
  if (inMatch()) G().vsAbort(reason); else setStatus(reason);
  touch();
}
function bcast(m) { sendTo(N.conn, m); }
function bcastSnap(run) { bcast({ t: 'sc', p: run.snapshot() }); }
function hostRecv(from, m) {
  if (!m || typeof m !== 'object') return;
  const run = G().run, live = run && run.versus && run.state !== 'end';
  switch (m.t) {
    case 'bye': if (from !== N.me) dropGuest('YOUR FRIEND LEFT'); break;
    case 'hello': {
      let n = cleanName(m.name, 'P2'); if (N.players[0] && n === N.players[0].name) n = (n.slice(0, 9) + '2');
      N.players[1] = { name: n };
      sendTo(N.conn, { t: 'welcome', you: 1, players: N.players, lobby: N.lobby });
      SFX.play('vsJoin'); setStatus(n + ' JOINED! PICK A TIER + STAGE, THEN START');
      break;
    }
    case 'shot': {
      if (!live) return;
      const P = run.players[from]; if (!P) return;
      P.shots++;
      if (from !== run.local) P.ammo = { infinite: m.a < 0, count: Math.max(0, m.a | 0), reloading: !!m.ar, empty: false, flash: 0 };
      const tid = m.tid | 0, st = +m.st || 0;
      if (m.k === 'hit') run.hostClaim(from, tid, st);
      else if (m.k === 'bomb') { if (from !== run.local) run.applyPenalty(from, 'bomb', tid); bcast({ t: 'pen', by: from, tid }); }
      else bcast({ t: 'miss', by: from, st });
      bcastSnap(run);
      break;
    }
  }
}
N.broadcastHit = (tid, by, st) => { bcast({ t: 'hit', tid, by, st }); const r = G().run; if (r) bcastSnap(r); };
N.setLobby = patch => { Object.assign(N.lobby, patch); bcast({ t: 'lobby', lobby: N.lobby, players: N.players }); touch(); };
N.start = () => {
  if (!N.isHost || !N.players[1] || !N.conn || !N.conn.open) { setStatus('WAITING FOR A FRIEND...'); return; }
  const m = { t: 'start', seed: (Math.random() * 4294967296) >>> 0, stage: N.lobby.stage, variant: N.lobby.variant, tier: N.lobby.tier, names: [N.players[0].name, N.players[1].name] };
  bcast(m); G().startVersus(Object.assign({ local: 0 }, m));
};
N.hostEnd = run => { run.resolveClaims(true); bcast({ t: 'end', p: run.snapshot() }); };

// ---------- guest ----------
N.join = function (raw, name) {
  let code = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z0-9]{4}$/.test(code)) code = 'BLAM-' + code;
  if (/^BLAM[A-Z0-9]{4}$/.test(code)) code = 'BLAM-' + code.slice(4);
  if (!/^BLAM-[A-Z0-9]{4}$/.test(code)) { setStatus('CODES LOOK LIKE BLAM-7K2F'); return; }
  N.state = 'loading'; setStatus('LOADING ONLINE PLAY...');
  loadPeer(ok => {
    if (N.state !== 'loading') return;
    if (!ok) { offline('COULD NOT LOAD ONLINE PLAY. PLAY SOLO?'); return; }
    cleanup();
    const peer = new Peer({ debug: 0 }); N.peer = peer; N.state = 'joining'; N.code = code; setStatus('CONNECTING TO ' + code + '...');
    const to = setTimeout(() => { if (!N.online && N.state === 'joining') { cleanup(); N.state = 'idle'; setStatus('NO ANSWER FROM ' + code + '. CHECK THE CODE.'); } }, 12000);
    peer.on('open', () => {
      const conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' }); N.conn = conn;
      conn.on('open', () => { clearTimeout(to); N.online = true; N.state = 'joined'; N.me = 1; N.heard = performance.now(); sendTo(conn, { t: 'hello', name: cleanName(name, 'P2') }); setStatus('CONNECTED! WAITING FOR THE HOST TO START'); });
      conn.on('data', m => { N.heard = performance.now(); clientRecv(m); });
      conn.on('close', () => { if (N.online) hostLeft('THE HOST LEFT'); });
      conn.on('error', () => {});
    });
    peer.on('error', err => {
      clearTimeout(to); const ty = (err && err.type) || 'error';
      if (ty === 'peer-unavailable') { cleanup(); N.state = 'idle'; setStatus('NO GAME FOUND FOR ' + code); }
      else if (!N.online) offline('NETWORK ERROR (' + String(ty).toUpperCase() + '). PLAY SOLO?');
      else setStatus('NETWORK: ' + String(ty).toUpperCase());
    });
  });
};
function hostLeft(reason) {
  const was = inMatch(); cleanup(); N.state = 'idle'; SFX.play('vsLeave');
  if (was) G().vsAbort(reason); else setStatus(reason);
  touch();
}
function clientRecv(m) {
  if (!m || typeof m !== 'object') return;
  const run = G().run, vs = run && run.versus;
  switch (m.t) {
    case 'welcome': N.me = 1; N.players = m.players || N.players; if (m.lobby) N.lobby = m.lobby; SFX.play('vsJoin'); touch(); break;
    case 'lobby': if (m.lobby) N.lobby = m.lobby; if (m.players) N.players = m.players; touch(); break;
    case 'full': setStatus('THAT GAME IS FULL'); cleanup(); N.state = 'idle'; touch(); break;
    case 'start': G().startVersus(Object.assign({ local: 1 }, m)); break;
    case 'hit': if (vs) run.applyHit(m.by | 0, m.tid | 0, +m.st || 0, null); break;
    case 'pen': if (vs && m.by !== run.local) { run.taken.set(m.tid | 0, -1); const tg = run.byId(m.tid | 0); if (tg && tg.alive) { if (tg.explode) tg.explode(); else tg.shatter(); } } break;
    case 'sc': if (vs) run.applySnapshot(m.p); break;
    case 'end': if (vs) { run.applySnapshot(m.p); run.end('time'); G().vsFinish(run); } break;
    case 'bye': hostLeft('THE HOST LEFT'); break;
  }
}
// ---------- both ----------
// a local shot in a versus match: { st, k: 'hit'|'miss'|'bomb'|'duck', tid, a: ammo (-1 = infinite), ar: reloading }
N.sendShot = m => { m.t = 'shot'; if (N.isHost) hostRecv(N.me, m); else sendTo(N.conn, m); };
N.leave = () => {
  if (N.isHost) bcast({ t: 'bye' }); else sendTo(N.conn, { t: 'bye' });
  cleanup(); N.state = 'idle'; N.status = ''; touch();
};
Object.defineProperty(N, 'connected', { get: () => !!(N.online && N.conn && N.conn.open) });
// keepalive on a timer (rendering stops in a hidden tab, timers still tick about once a second)
setInterval(() => {
  if (!N.online) return;
  if (N.isHost) { if (N.conn && N.conn.open) { bcast({ t: 'ka' }); if (performance.now() - N.heard > TIMEOUT) dropGuest('YOUR FRIEND TIMED OUT'); } }
  else { sendTo(N.conn, { t: 'ka' }); if (performance.now() - N.heard > TIMEOUT) hostLeft('LOST THE HOST (TIMED OUT)'); }
}, 1000);
window.addEventListener('pagehide', () => { try { if (N.peer) N.peer.destroy(); } catch (e) {} });
B.Net = N;
})(window.BLAM);
