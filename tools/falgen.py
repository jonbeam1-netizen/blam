#!/usr/bin/env python
"""B.L.A.M. sound generator: text -> sound effect through fal.ai (plain HTTP, needs only `requests`).

KEY: put your fal.ai key in a file named `.fal-key` at the repo root (gitignored) OR set env var FAL_KEY.
     Never paste the key into chat or commit it.

Single sound:
  python tools/falgen.py --prompt "arcade light gun shot, short punchy, cartoon" --dur 0.8 --out review/sfx-gen/shot.mp3
  python tools/falgen.py --model sonilo ...      (default model is eleven; also: stable)
  python tools/falgen.py --n 3 ...               (3 candidates: shot-1.mp3, shot-2.mp3, shot-3.mp3)
  python tools/falgen.py --loop ...              (eleven only: seamless loop, for ambience beds)

Batch from a manifest (JSON list of {"name","prompt","dur","model"?,"loop"?,"n"?}):
  python tools/falgen.py --manifest tools/sfx-manifest.json --outdir review/sfx-gen

Models (fal.ai ids, prices as of 2026-10-29):
  eleven  fal-ai/elevenlabs/sound-effects/v2        $0.002 / second of audio, 0.5-22 s, loop flag, mp3/wav(pcm)/opus
  sonilo  sonilo/v1.1/text-to-sound-effects         $0.0018 / second, 0.5-180 s, wav/mp3/aac/flac
  stable  fal-ai/stable-audio-3/small/sfx/text-to-audio  $0.0206 flat per clip, seed + negative prompt
"""
import argparse, json, os, sys, time, pathlib, subprocess, shutil
import requests

MIN_PEAK_DB = -30.0   # takes quieter than this are rerolled (ElevenLabs sometimes returns near-silence)
MAX_RETRY = 3

def peak_db(path):
    """Peak level in dBFS via ffmpeg (None if ffmpeg is missing)."""
    if not shutil.which('ffmpeg'): return None
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-'], capture_output=True)
    import array
    a = array.array('f'); a.frombytes(r.stdout[: len(r.stdout) // 4 * 4])
    pk = max((abs(x) for x in a), default=0.0)
    import math
    return 20 * math.log10(pk) if pk > 0 else -120.0

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUEUE = 'https://queue.fal.run'
MODELS = {
    'eleven': 'fal-ai/elevenlabs/sound-effects/v2',
    'sonilo': 'sonilo/v1.1/text-to-sound-effects',
    'stable': 'fal-ai/stable-audio-3/small/sfx/text-to-audio',
}

def load_key():
    k = os.environ.get('FAL_KEY', '').strip()
    if not k:
        f = ROOT / '.fal-key'
        if f.exists():
            k = f.read_text(encoding='utf-8').strip()
    if not k:
        sys.exit('No fal.ai key. Put it in .fal-key at the repo root (gitignored) or set FAL_KEY.')
    return k

def build_input(model, prompt, dur, loop, fmt):
    if model == 'eleven':
        d = {'text': prompt, 'output_format': 'mp3_44100_192' if fmt == 'mp3' else 'pcm_44100'}
        if dur: d['duration_seconds'] = max(0.5, min(22.0, dur))
        if loop: d['loop'] = True
        return d
    if model == 'sonilo':
        return {'prompt': prompt, 'duration': max(0.5, min(180.0, dur or 2.0)), 'audio_format': fmt}
    if model == 'stable':
        return {'prompt': prompt, 'duration': max(0.5, dur or 2.0), 'output_format': fmt}
    raise ValueError(model)

def submit(key, model_id, payload):
    h = {'Authorization': 'Key ' + key, 'Content-Type': 'application/json'}
    r = requests.post(f'{QUEUE}/{model_id}', headers=h, json=payload, timeout=60)
    if r.status_code >= 400:
        sys.exit(f'submit failed {r.status_code}: {r.text[:500]}')
    j = r.json()
    status_url, result_url = j['status_url'], j['response_url']
    t0 = time.time()
    while True:
        s = requests.get(status_url, headers=h, timeout=60).json()
        if s.get('status') == 'COMPLETED':
            break
        if time.time() - t0 > 300:
            sys.exit('timed out waiting for fal.ai')
        time.sleep(1.0)
    res = requests.get(result_url, headers=h, timeout=60).json()
    audio = res.get('audio') or (res.get('audios') or [None])[0]
    if not audio or not audio.get('url'):
        sys.exit('no audio in result: ' + json.dumps(res)[:500])
    return audio['url'], res

def generate(key, name, prompt, dur, model, loop, fmt, n, outdir):
    outdir = pathlib.Path(outdir); outdir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(1, n + 1):
        suffix = f'-{i}' if n > 1 else ''
        p = outdir / f'{name}{suffix}.{fmt}'
        for attempt in range(1, MAX_RETRY + 1):
            url, res = submit(key, MODELS[model], build_input(model, prompt, dur, loop, fmt))
            p.write_bytes(requests.get(url, timeout=120).content)
            db = peak_db(p)
            if db is None or db >= MIN_PEAK_DB: break
            print(f'  {p.name}: weak take ({db:.0f} dB), rerolling ({attempt}/{MAX_RETRY})')
        meta = {'name': name, 'prompt': prompt, 'dur': dur, 'model': model, 'loop': loop, 'seed': res.get('seed'), 'peak_db': None if db is None else round(db, 1)}
        (outdir / f'{name}{suffix}.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')
        print(f'  wrote {p}  ({p.stat().st_size} bytes' + (f', peak {db:.0f} dB)' if db is not None else ')'))
        paths.append(p)
    return paths

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--prompt'); ap.add_argument('--dur', type=float, default=0)
    ap.add_argument('--model', choices=MODELS, default='eleven'); ap.add_argument('--loop', action='store_true')
    ap.add_argument('--fmt', default='mp3', help='mp3 (default) or wav'); ap.add_argument('--n', type=int, default=1)
    ap.add_argument('--out', help='single sound: output file path (name and dir taken from it)')
    ap.add_argument('--manifest', help='batch: JSON list of {name,prompt,dur,model?,loop?,n?,fmt?}')
    ap.add_argument('--outdir', default='review/sfx-gen'); ap.add_argument('--only', help='manifest: comma list of names')
    a = ap.parse_args()
    key = load_key()
    if a.manifest:
        items = json.loads(pathlib.Path(a.manifest).read_text(encoding='utf-8'))
        only = set(a.only.split(',')) if a.only else None
        for it in items:
            if only and it['name'] not in only: continue
            print(it['name'] + ':')
            generate(key, it['name'], it['prompt'], float(it.get('dur', 0)), it.get('model', a.model),
                     bool(it.get('loop', False)), it.get('fmt', a.fmt), int(it.get('n', a.n)), a.outdir)
    elif a.prompt and a.out:
        out = pathlib.Path(a.out)
        generate(key, out.stem, a.prompt, a.dur, a.model, a.loop, out.suffix.lstrip('.') or a.fmt, a.n, out.parent)
    else:
        ap.error('give --prompt and --out, or --manifest')

if __name__ == '__main__':
    main()
