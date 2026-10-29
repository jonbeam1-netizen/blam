#!/usr/bin/env python
"""Cut the blank space before a sound starts (used for every reload): keeps 3 ms before the first sample louder than peak-24 dB (3rd arg overrides),
trims trailing silence under -60 dBFS, writes mono 44.1 k 16-bit WAV.  python tools/sfx-trimstart.py in.mp3 out.wav"""
import sys, subprocess, numpy as np
SR=44100; src, dst = sys.argv[1], sys.argv[2]
x=np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',src,'-f','f32le','-ac','1','-ar',str(SR),'-'],capture_output=True,check=True).stdout,dtype=np.float32).astype(np.float64)
thr=float(sys.argv[3]) if len(sys.argv)>3 else -24.0
pk=np.abs(x).max()+1e-9
nz=np.where(np.abs(x)>pk*10**(thr/20))[0]; a=max(0,nz[0]-int(0.003*SR))  # threshold is relative to the file's own peak
tail=np.where(np.abs(x)>10**(-60/20))[0]; b=min(len(x),tail[-1]+int(0.02*SR))
y=x[a:b].copy(); f=min(len(y),int(0.01*SR)); y[-f:]*=np.linspace(1,0,f); y[:int(0.002*SR)]*=np.linspace(0,1,int(0.002*SR))
subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','-','-c:a','pcm_s16le',dst],input=y.astype(np.float32).tobytes(),check=True)
print(f'{dst}: cut {a/SR*1000:.0f} ms of lead-in, now {len(y)/SR:.2f} s')
