#!/usr/bin/env python
"""Build review/<folder>/index.html: every generated sound grouped by family, with prompt, play button and pick boxes.
Run after each falgen batch:  python tools/sfx-review.py            (guns page, review/sfx-gen)
                              python tools/sfx-review.py sfx-fx     (effects page: ricochets, bombs, targets, duck)
Picks are kept in the browser (localStorage) and shown as a list at the top you can copy to Fable."""
import json, pathlib, re, html, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
FOLDER = sys.argv[1] if len(sys.argv) > 1 else 'sfx-gen'
D = ROOT / 'review' / FOLDER
TITLE = 'B.L.A.M. sound review' + (' - ' + FOLDER if FOLDER != 'sfx-gen' else '')
FAMILY = [('gun-', 'GUNS (per skin)'), ('ricochet', 'RICOCHETS'), ('bomb', 'BOMBS'), ('target', 'TARGETS (hits / breaks / clangs)'), ('hit', 'TARGETS (hits / breaks / clangs)'), ('duck', 'DEPUTY DUCK'), ('bee', 'BEES'), ('rocket', 'SKY SHOW'), ('', 'CORE / misc')]
LABEL = {'duck-happy': 'DUCK HAPPY (Fable picks by measurement, re-pick by ear from A below)', 'duck-hit': 'DUCK HIT (Fable picks)', 'duck-scared': 'DUCK SCARED (Fable picks)', 'duck-relief': 'DUCK RELIEF (Fable picks)', 'duck-cheer': 'DUCK CHEER (Fable picks)', 'duck-sad': 'DUCK SAD (Fable picks)', 'duck-happy-a': 'DUCK HAPPY A: pleased after a hit (8 takes)', 'duck-hit-a': 'DUCK HIT A: you shot the duck, startled squawk (8 takes)', 'duck-scared-a': 'DUCK SCARED A: panicking, bombs / danger (8 takes)', 'duck-relief-a': 'DUCK RELIEF A: phew, settling down (8 takes)', 'duck-cheer-a': 'DUCK CHEER A: celebrating a clear (8 takes)', 'duck-sad-a': 'DUCK SAD A: disappointed, stage failed (8 takes)', 'duck-angry': 'DUCK ANGRY: round-robin of 3 subtle variants of pick A-3, balanced -16', 'duck-heckle': 'DUCK HECKLE: laughing at you after a miss, 2 picks (A-5, B-3), balanced -16', 'bomb': 'BOMB POOL: 3 explosions (A-10, A-2, A-3), mono, balanced -8 (the loudest thing in the game, 2 dB over the shots)', 'target-break': 'TARGET BREAK POOL: 10 ceramic breaks (E-HP 1 and 4, F 1-8; old 2 and 3 cut), mono, long tails, balanced -10 (same as the shots)', 'target-ding': 'TARGET DING POOL: 8 glass bowl dings, balanced 12 dB under the breaks', 'target-ceramic-ehp': 'TARGET CERAMIC E-HP: the four E takes with the low thuds filtered out (high-pass + early fade)', 'target-ceramic-f': 'TARGET CERAMIC F: sonilo again, thin shards only, nothing heavy lands (8 takes)', 'target-ceramic-e': 'TARGET CERAMIC E: same, other model sonilo (4 takes)', 'target-glassding-a': 'TARGET GLASS DING A: glass bowl struck once. SAVED as the ding pool (all 8, raw, balance later)', 'target-wood-a': 'TARGET WOOD A: painted paddle smashed, crack + splinters (the body of the hit)', 'target-plate-a': 'TARGET PLATE A: metal plate burst, knock + short ting + pieces (alt body)', 'target-ding-a': 'TARGET DING A: arcade gallery bell, the reward layer stacked on top of the break (pitch steps up on streaks)', 'ricochet': 'RICOCHET SET: 5 picks (A-2, A-3, A-5, A-6, A-7), mono, lead-in cut, balanced 4 dB under the shots; Play pans each one at random', 'gun-aquapro-rr': 'AQUA PRO SHOT SET: round-robin of 5 (1-3 from pick A, 4-5 from pick B)', 'gun-aquapro-reload': 'AQUA PRO RELOAD (pick: pump take 5, lead-in trimmed, stretched to 0.40 s, balanced)', 'gun-ray85-rr': 'RAY-85 SHOT SET: round-robin of 5 (1-3 from A-3, 4-5 from round-3 take 1)', 'gun-ray85-reload': 'RAY-85 RELOAD (pick: cell swap take 1, trimmed, stretched to 0.40 s, balanced)', 'gun-ray85-reload-a': 'RAY-85 RELOAD A: energy cell swap, clack + short power-up zap (10 takes)', 'gun-hotrod-rr': 'HOT ROD SHOT SET: round-robin of 4 (1-2 from B-8, 3-4 from E-3)', 'gun-hotrod-reload': 'HOT ROD RELOAD (pick: pump take 6, lead-in trimmed, stretched to 0.40 s, balanced)', 'gun-hotrod-reload-a': 'HOT ROD RELOAD A: pump-action rack, two clacks (10 takes)', 'gun-candysix-rr': 'CANDY SIX SHOT SET: round-robin of 4 (1-2 from AQUA PRO 4, 3-4 from AQUA PRO 5; pitched up 28%, shortened to 0.2 s)', 'gun-candysix-reload': 'CANDY SIX RELOAD (pick: cylinder take 3, trimmed, stretched to 0.40 s, balanced)'}

files = sorted(D.glob('*.mp3')) + sorted(D.glob('*.wav'))
groups = {}
for f in files:
    base = re.sub(r'-\d+$', '', f.stem)
    meta = {}
    mp = f.with_suffix('.json')
    if mp.exists():
        try: meta = json.loads(mp.read_text(encoding='utf-8'))
        except Exception: pass
    groups.setdefault(base, {'prompt': meta.get('prompt', ''), 'model': meta.get('model', ''), 'dur': meta.get('dur', ''), 'takes': []})
    groups[base]['takes'].append(f.name)

def fam(base):
    for pre, name in FAMILY:
        if base.startswith(pre): return name
    return FAMILY[-1][1]
byfam = {}
ORDER = list(LABEL)
for base, g in sorted(groups.items(), key=lambda kv: (ORDER.index(kv[0]) if kv[0] in ORDER else 99, kv[0])): byfam.setdefault(fam(base), []).append((base, g))

out = ['''<!doctype html><meta charset="utf-8"><title>''' + html.escape(TITLE) + '''</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;background:#14121a;color:#eee;margin:0;padding:16px;max-width:900px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;color:#ffd84d;margin:28px 0 8px;border-bottom:2px solid #333;padding-bottom:4px}
.s{background:#1f1c28;border-radius:10px;padding:10px 12px;margin:8px 0}
.n{font-weight:700;font-size:16px}.p{color:#aaa;font-size:13px;margin:2px 0 8px}
.t{display:flex;align-items:center;gap:10px;margin:4px 0;flex-wrap:wrap}
button{font:inherit;background:#ffd84d;color:#000;border:0;border-radius:6px;padding:6px 14px;cursor:pointer;min-width:84px}
button.on{background:#ff6a3d;color:#fff}
label{display:flex;align-items:center;gap:6px;color:#ccc;font-size:13px}
input[type=range]{width:110px}
#picks{color:#8c8;font-size:13px;margin:8px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}#picks button{min-width:0;padding:3px 10px;font-size:12px;background:#333;color:#ccc}
.vol{display:flex;gap:10px;align-items:center;color:#aaa;font-size:13px;margin:6px 0 0}
</style>
<h1>''' + html.escape(TITLE) + '''</h1>
<div class="vol">Volume <input type="range" id="vol" min="0" max="1" step="0.05" value="0.5"> <label id="normlab"><input type="checkbox" id="norm"> level all takes (candidates only; OFF to judge balance)</label> <label><input type="checkbox" id="crunch"> arcade crunch preview</label> <label><input type="checkbox" id="rr"> round-robin: Play cycles the takes</label></div>
<div id="picks">(no picks yet)</div>''']
seen_fam = set()
for pre, name in FAMILY:
    items = byfam.get(name)
    if not items or name in seen_fam: continue
    seen_fam.add(name)
    out.append(f'<h2>{html.escape(name)}</h2>')
    for base, g in items:
        label = LABEL.get(base, base)
        out.append(f'<div class="s"><div class="n">{html.escape(label)}</div><div class="p">{html.escape(g["prompt"])}'
                   f'{(" &middot; " + html.escape(str(g["model"])) + " &middot; " + html.escape(str(g["dur"])) + " s") if g["model"] else ""}</div>')
        for t in g['takes']:
            out.append(f'<div class="t"><button data-f="{html.escape(t)}?v={int((D/t).stat().st_mtime)}" data-base="{html.escape(base)}">&#9654; {html.escape(t[len(base)+1:-4] or "1")}</button>'
                       f'<label><input type="checkbox" class="pick" value="{html.escape(t)}"> pick</label><span style="color:#666;font-size:12px">{html.escape(t)}</span><span data-lvl="{html.escape(t)}" style="font-size:12px;color:#666">measuring</span></div>')
        out.append('</div>')
if 'target-break' in groups and 'target-ding' in groups:
    out.append('<h2>HIT COMBO</h2><div class="s"><div class="n">HIT = random break + random ding (ding 12 ms late), the way the game plays it</div>'
               '<div class="t"><button id="combo" style="min-width:200px">&#9654; HIT</button><span style="color:#888;font-size:12px" id="combo-last"></span></div></div>')
out.append('''<script>
const AC = new (window.AudioContext||window.webkitAudioContext)();
const master = AC.createGain(); master.gain.value = 0.5;
const shaper = AC.createWaveShaper(); const lp = AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 7000;
(function(){ const n=256, c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i*2/n-1; c[i]=Math.tanh(x*2.2)/Math.tanh(2.2); } shaper.curve=c; })();
let crunch=false; function wire(){ master.disconnect(); if(crunch){ master.connect(shaper); shaper.connect(lp); lp.connect(AC.destination);} else master.connect(AC.destination);} wire();
const bufs = {}, gains = {};
async function load(f){ if(bufs[f]) return bufs[f]; const r=await fetch(f); const b=await AC.decodeAudioData(await r.arrayBuffer()); bufs[f]=b;
  const d=b.getChannelData(0); let pk=1e-6; for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; }
  const db=20*Math.log10(pk); gains[f]=Math.min(100, 0.89/pk);
  const tag=document.querySelector('span[data-lvl="'+f+'"]'); if(tag){ tag.textContent='peak '+db.toFixed(0)+' dB'+(db<-30?'  WEAK, regen':''); tag.style.color=db<-30?'#ff6a3d':'#6a6'; }
  return b; }
async function play(f){ await AC.resume(); const b=await load(f); const s=AC.createBufferSource(); s.buffer=b; const g=AC.createGain(); g.gain.value=document.getElementById('norm').checked?gains[f]:1; const crush=crunch?AC.createScriptProcessor(256,1,1):null;
  const pan=f.split('/').pop().startsWith('ricochet')?AC.createStereoPanner():null; if(pan){ pan.pan.value=(Math.random()*2-1)*0.8; g.connect(pan); }  // ricochets fly off in a random direction (game does the same)
  s.connect(g); const gOut=pan||g; if(crush){ const bits=10, step=Math.pow(0.5,bits), hold=2; let last=0,k=0; crush.onaudioprocess=e=>{const i=e.inputBuffer.getChannelData(0),o=e.outputBuffer.getChannelData(0);for(let n=0;n<i.length;n++){ if(k++%hold===0) last=step*Math.floor(i[n]/step+0.5); o[n]=last; }}; gOut.connect(crush); crush.connect(master);} else gOut.connect(master); s.start(); }
const combo=document.getElementById('combo'); if(combo){ const pool=b=>[...document.querySelectorAll('button[data-base="'+b+'"]')].map(x=>x.dataset.f); const pick=a=>a[Math.floor(Math.random()*a.length)];
  combo.onclick=async()=>{ const br=pick(pool('target-break')), dg=pick(pool('target-ding')); play(br); setTimeout(()=>play(dg),12); document.getElementById('combo-last').textContent=br.split('?')[0]+' + '+dg.split('?')[0]; }; }
const normBox=document.getElementById('norm'), normLab=document.getElementById('normlab'); const normUI=()=>{ normLab.style.cssText=normBox.checked?'background:#ff6a3d;color:#fff;border-radius:6px;padding:2px 8px;font-weight:700':''; }; normBox.onchange=normUI; normUI();
document.getElementById('vol').oninput=e=>master.gain.value=+e.target.value;
document.getElementById('crunch').onchange=e=>{crunch=e.target.checked; wire();};
const rr={}; const rrOn=()=>document.getElementById('rr').checked;
document.querySelectorAll('button[data-f]').forEach(b=>b.onclick=()=>{ let f=b.dataset.f; if(rrOn()){ const base=b.dataset.base; const takes=[...document.querySelectorAll('button[data-base="'+base+'"]')].map(x=>x.dataset.f); rr[base]=((rr[base]??-1)+1)%takes.length; f=takes[rr[base]]; }
  play(f); b.classList.add('on'); setTimeout(()=>b.classList.remove('on'),250); });
const KEY='blam-sfx-picks-''' + FOLDER + ''''; const picks=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));
const onPage=new Set([...document.querySelectorAll('input.pick')].map(i=>i.value)); for(const f of [...picks]) if(!onPage.has(f)) picks.delete(f);  // forget picks whose files are gone
function render(){ const el=document.getElementById('picks'); const n=picks.size; el.innerHTML=(n?('<b>'+n+' picked</b> (tick boxes; Fable reads them from the page)'):'tick the takes you like, Fable reads the ticks from the page')+(n?' <button id="clr">clear</button>':''); const c=document.getElementById('clr'); if(c) c.onclick=()=>{ picks.clear(); document.querySelectorAll('input.pick').forEach(i=>i.checked=false); render(); }; localStorage.setItem(KEY, JSON.stringify([...picks])); }
document.querySelectorAll('.pick').forEach(c=>{ c.checked=picks.has(c.value); c.onchange=()=>{ c.checked?picks.add(c.value):picks.delete(c.value); render(); }; }); render();
(async()=>{ for(const b of document.querySelectorAll('button[data-f]')) { try { await load(b.dataset.f); } catch(e){} } })();
</script>''')
(D / 'index.html').write_text('\n'.join(out), encoding='utf-8')
print('wrote', D / 'index.html', 'with', len(files), 'files in', len(groups), 'sounds')
