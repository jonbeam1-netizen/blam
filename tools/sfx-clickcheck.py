#!/usr/bin/env python
"""Check sample files for a click at the start or an abrupt cut at the end (the "blips" on the duck quacks).
  python tools/sfx-clickcheck.py [glob]            measure (default: assets/sfx/duck-*.wav)
  python tools/sfx-clickcheck.py --fix [glob]      fade the SOURCE files in review/sfx-picks (3 ms in / 10 ms out,
                                                   same length), then re-run tools/sfx-export.py yourself
Reports per file (levels in dB relative to the file's own peak): where the sound starts (first sample above -80 dBFS,
after any digital-silence pad), the peak of the first 0.5 ms from there (onset) and of the first 5 ms of the file,
and the peak of the last 1 ms / last 5 ms.  START = the onset 0.5 ms is louder than -30 dB (the wave steps in from
silence: a click); END = the last 1 ms is louder than -60 dB (the file stops mid-sound).  The fix fades in over 3 ms
from the start point (a leading silence pad stays) and out over the last 10 ms.  Mono or stereo 16-bit PCM WAV."""
import sys, wave, pathlib, numpy as np
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'review' / 'sfx-picks'
ON_DB, END_DB, NZ = -30.0, -60.0, 10 ** (-80 / 20)

def read(p):
    with wave.open(str(p), 'rb') as w:
        assert w.getsampwidth() == 2, f'{p}: not 16-bit'
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64).reshape(-1, ch) / 32768.0
    return x, sr, ch

def write(p, x, sr, ch):
    y = np.clip(np.round(x * 32768.0), -32768, 32767).astype('<i2')
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(sr); w.writeframes(y.tobytes())

db = lambda a: 20 * np.log10(max(a, 1e-9))

def measure(p):
    x, sr, ch = read(p)
    a = np.abs(x).max(axis=1); pk = a.max(); w5, w1, w05 = int(0.005 * sr), int(0.001 * sr), max(1, int(0.0005 * sr))
    nz = int(np.argmax(a > NZ))
    r = dict(name=p.name, dur=len(a) / sr, peak=db(pk), nz=nz / sr * 1000, onset=db(a[nz:nz + w05].max()) - db(pk),
             head=db(a[:w5].max()) - db(pk), last1=db(a[-w1:].max()) - db(pk), tail=db(a[-w5:].max()) - db(pk), nzi=nz)
    r['start'] = r['onset'] > ON_DB; r['end'] = r['last1'] > END_DB
    return r

def report(rows):
    print(f'{"file":22s} {"dur":>6s} {"peak":>8s} | {"starts":>7s} {"onset":>7s} {"head5":>7s} | {"last1":>7s} {"tail5":>7s} | flags')
    for r in rows:
        fl = ' '.join(k.upper() for k in ('start', 'end') if r[k]) or 'ok'
        print(f'{r["name"]:22s} {r["dur"]:6.3f} {r["peak"]:6.1f}dB | {r["nz"]:5.2f}ms {r["onset"]:7.1f} {r["head"]:7.1f} | '
              f'{r["last1"]:7.1f} {r["tail"]:7.1f} | {fl}')

def fade(p, start, fin=0.003, fout=0.010):
    x, sr, ch = read(p)
    a, b = min(int(fin * sr), len(x) - start), int(fout * sr)
    x[start:start + a] *= np.linspace(0, 1, a, endpoint=False)[:, None]
    x[-b:] *= np.linspace(1, 0, b)[:, None]
    write(p, x, sr, ch)

args = [a for a in sys.argv[1:] if a != '--fix']
pat = args[0] if args else 'assets/sfx/duck-*.wav'
files = sorted(ROOT.glob(pat))
rows = [measure(f) for f in files]
report(rows)
if '--fix' in sys.argv:
    bad = [r for r in rows if r['start'] or r['end']]
    for r in bad:
        s = SRC / r['name']
        if not s.exists(): print('  no source for', r['name']); continue
        fade(s, measure(s)['nzi']); print('  faded source', s.relative_to(ROOT))
    print(f'{len(bad)} source files faded; now run: python tools/sfx-export.py')
