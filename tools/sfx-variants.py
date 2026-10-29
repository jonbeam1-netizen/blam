#!/usr/bin/env python
"""Make round-robin variants of one picked sound (offline, ffmpeg + numpy).
  python tools/sfx-variants.py review/sfx-picks/aquapro-shot.mp3 gun-aquapro-rr 5 [subtle|wide] [max length seconds, e.g. 0.5]
Writes <outname>-1..N.wav into review/sfx-gen/ (peak -1 dBFS, tail-trimmed). Variants differ in pitch/speed
(a few percent), spectral tilt (a touch darker or brighter), a tiny start offset, and level (+-0.5 dB)."""
import sys, subprocess, pathlib, json
import numpy as np

SR = 44100
src = pathlib.Path(sys.argv[1]); outname = sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 5
spread = sys.argv[4] if len(sys.argv) > 4 else 'subtle'   # subtle | wide
maxlen = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0  # seconds; >0 caps every variant's length with a 30 ms fade
outdir = pathlib.Path('review/sfx-gen'); outdir.mkdir(parents=True, exist_ok=True)

raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(src), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                     capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
x = x / (np.max(np.abs(x)) + 1e-9)

def resample(a, rate):  # rate > 1 = higher pitch, shorter
    idx = np.arange(0, len(a) - 1, rate)
    i0 = idx.astype(int); fr = idx - i0
    return a[i0] * (1 - fr) + a[i0 + 1] * fr

def tilt(a, k):  # k > 0 brighter (adds a touch of high-passed signal), k < 0 darker (one-pole lowpass blend)
    if k == 0: return a
    y = np.empty_like(a); acc = 0.0; c = 0.15
    for i in range(len(a)):
        acc += c * (a[i] - acc); y[i] = acc
    lp = y
    return a + k * (a - lp) if k > 0 else a + (-k) * (lp - a)

def trim(a, floor_db=-60.0, pad=0.02):
    thr = 10 ** (floor_db / 20)
    nz = np.where(np.abs(a) > thr)[0]
    if len(nz) == 0: return a
    end = min(len(a), nz[-1] + int(pad * SR))
    out = a[:end].copy()
    fade = min(len(out), int(0.01 * SR)); out[-fade:] *= np.linspace(1, 0, fade)
    return out

def saturate(a, drive):
    if drive <= 0: return a
    return np.tanh(a * (1 + drive)) / np.tanh(1 + drive)

def punch(a, amt):  # boost the first ~25 ms (the crack) relative to the rest
    if amt == 0: return a
    env = np.ones_like(a); k = int(0.025 * SR); env[:k] *= 1 + amt; env[k:k * 3] *= np.linspace(1 + amt, 1, min(2 * k, len(a) - k) if len(a) > k else 0) if len(a) > k else 1
    return a * env

def tail(a, mult):  # mult < 1 shortens the decay, > 1 leaves it; applies an exponential after the first 40 ms
    if mult >= 1: return a
    k = int(0.04 * SR); t = np.arange(max(0, len(a) - k)) / SR
    env = np.concatenate([np.ones(min(k, len(a))), np.exp(-t / (0.12 * mult))])
    return a * env[:len(a)]

# (pitch rate, tilt, start offset ms, gain dB, punch, saturation drive, tail mult)
SUBTLE = [(1.00, 0.0, 0, 0.0, 0.0, 0.0, 1.0), (0.965, -0.25, 3, -0.4, 0.0, 0.0, 1.0), (1.035, 0.25, 0, 0.3, 0.0, 0.0, 1.0),
          (0.98, 0.15, 5, 0.0, 0.0, 0.0, 1.0), (1.02, -0.15, 2, -0.2, 0.0, 0.0, 1.0)]
WIDE = [(1.00,  0.0, 0,  0.0, 0.0, 0.0, 1.0),
           (0.92, -0.6, 4, -0.3, 0.3, 0.0, 1.0),   # lower, darker, punchier
           (1.08,  0.6, 0,  0.3, 0.0, 0.0, 0.6),   # higher, brighter, shorter
           (0.96,  0.2, 6,  0.0, 0.5, 1.5, 1.0),   # a bit low, saturated, hard crack
           (1.04, -0.3, 2, -0.2, 0.2, 0.0, 0.75),  # a bit high, warm, tighter
           (0.88,  0.0, 1,  0.2, 0.4, 0.8, 1.0),
           (1.12,  0.3, 3, -0.3, 0.0, 0.0, 0.5)]
recipes = WIDE if spread == 'wide' else SUBTLE
meta = []
for i in range(n):
    rate, tl, off, gdb, pn, drv, tm = recipes[i % len(recipes)]
    y = resample(x, rate); y = tilt(y, tl); y = punch(y, pn); y = saturate(y, drv); y = tail(y, tm)
    if maxlen > 0 and len(y) > int(maxlen * SR):
        y = y[:int(maxlen * SR)].copy(); f = int(0.03 * SR); y[-f:] *= np.linspace(1, 0, f)
    y = np.concatenate([np.zeros(int(off * SR / 1000)), y]); y = trim(y)
    y = y / (np.max(np.abs(y)) + 1e-9) * 10 ** ((-1.0 + gdb) / 20)
    p = outdir / f'{outname}-{i + 1}.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', str(p)],
                   input=y.astype(np.float32).tobytes(), check=True)
    (outdir / f'{outname}-{i + 1}.json').write_text(json.dumps({'name': outname, 'prompt': f'variant of {src.name}: pitch x{rate}, tilt {tl:+}, punch {pn}, drive {drv}, tail x{tm}, {gdb:+} dB', 'model': 'variant', 'dur': round(len(y) / SR, 2)}), encoding='utf-8')
    print('wrote', p, round(len(y) / SR, 2), 's')
