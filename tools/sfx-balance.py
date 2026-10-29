#!/usr/bin/env python
"""Balance loudness across the shipped shot sets (review/sfx-picks/gun-*-rr-*.wav) and reloads (gun-*-reload-*.wav, 3 dB lower).
  python tools/sfx-balance.py            # measure only
  python tools/sfx-balance.py --apply --glob=ricochet-*.wav --target=-14   # any other family against its own target
  python tools/sfx-balance.py --apply    # rewrite files so the loudest 50 ms of every shot sits at TARGET dBFS RMS
Loudness = max RMS over a 50 ms sliding window (perceived punch of a short shot), not whole-file RMS.
Gain is applied with ffmpeg; a lookahead limiter catches peaks over -0.5 dBFS. Files are copied to review/sfx-gen too."""
import sys, subprocess, pathlib, shutil, numpy as np
SR = 44100; WIN = int(0.05 * SR); TARGET = -10.0; RELOAD_TARGET = -13.0  # reloads sit 3 dB under the shots
P = pathlib.Path('review/sfx-picks'); G = pathlib.Path('review/sfx-gen')
files = sorted(P.glob('gun-*-rr-*.wav')) + sorted(P.glob('gun-*-reload-*.wav'))
def target(f): return targets[0] if targets else (RELOAD_TARGET if '-reload-' in f.name else TARGET)
globs = [a.split('=',1)[1] for a in sys.argv if a.startswith('--glob=')]
if globs: files = sorted(P.glob(globs[0]))
targets = [float(a.split('=',1)[1]) for a in sys.argv if a.startswith('--target=')]
only = [a.split('=',1)[1] for a in sys.argv if a.startswith('--only=')]
if only: files = [f for f in files if only[0] in f.name]
def load(f):
    raw = subprocess.run(['ffmpeg','-v','error','-i',str(f),'-f','f32le','-ac','1','-ar',str(SR),'-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)
def punch_db(x):
    c = np.cumsum(np.concatenate([[0.0], x*x]))
    if len(x) <= WIN: return 10*np.log10(np.mean(x*x)+1e-12)
    rms = (c[WIN:]-c[:-WIN])/WIN
    return 10*np.log10(rms.max()+1e-12)
rows = []
for f in files:
    x = load(f); rows.append((f, punch_db(x), 20*np.log10(np.max(np.abs(x))+1e-12), len(x)/SR))
for f,p,pk,d in rows: print(f'{f.name:22s} punch {p:6.1f} dB  peak {pk:5.1f} dB  {d:.2f} s  gain {target(f)-p:+.1f}')
if '--apply' in sys.argv:
    for f,p,pk,d in rows:
        g = target(f) - p
        tmp = f.with_suffix('.tmp.wav')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(f),'-af',f'volume={g:.2f}dB,alimiter=limit=0.944:attack=1:release=40:level=false','-ar',str(SR),'-ac','1','-c:a','pcm_s16le',str(tmp)],check=True)
        shutil.move(tmp, f); shutil.copy(f, G/f.name)
    print('applied; re-measure:')
    for f in files:
        x = load(f); print(f'{f.name:22s} punch {punch_db(x):6.1f} dB  peak {20*np.log10(np.max(np.abs(x))+1e-12):5.1f} dB')
