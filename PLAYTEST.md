# B.L.A.M. play-test list (builds 0.008 to 0.013, live 2026-10-30)

Everything that changed since you last played a build by ear, in one place. Tick what is good, gripe what is not.
Live link: https://jonbeam1-netizen.github.io/blam/ (hard refresh once: Ctrl+Shift+R).

## Sound (0.008, 0.010)
- [ ] Real samples for every core event: gun shots and reloads per skin, target break + ding, ricochets, bombs, Deputy Duck.
- [ ] Gun shots are 3 dB louder than everything else (#56). Too loud / not enough? `BLAM.SFX.SHOT_GAIN` is 1.41.
- [ ] Quack blips gone? (#65: 8 duck files faded, 4 ms ramp on every sample, 60 ms cross-fade when one quack cuts another).
- [ ] Ricochets pan randomly left/right. Bombs dip the rest of the mix for a moment.
- [ ] Menu targets no longer make noise (#64).
- [ ] Still synth (no real sound yet): turncoat tick, lights out / on, duck cameo, fireworks, Alley, Boneyard events.

## Deputy Duck (0.009, 0.013)
- [ ] Laugh on every THIRD miss, with the laugh quack (#58). Does the laugh pose read? (bill stays small, belly bob, wing points at you)
- [ ] Hits: silent happy hop (#60). Bomb: silent scared face, no relief after (#61). Angry red ONLY when you shoot him (#59).
- [ ] Pointing at him: ONE scared quack, ONE relief quack when you leave (#57). 0.016: the scared and relief FILES were cut to a single quack each (they held 3-4 and 2-3 quacks). No spazzing / repeat quacks at his edge (#68-#70).
- [ ] Practice: he just stands there now, no random heckling (#66).
- [ ] Menu ta-da / cheer / sad quacks kept (#62).
- [ ] Rare DUCK CAMEO in a round: a little duck on a balloon/target, +500 when hit (about 1 round in 5). Funny or weird?

## Guns and HUD (0.009, 0.013)
- [ ] Gun order: AQUA PRO default, then HOT ROD, RAY-85, CANDY SIX (#63).
- [ ] Gun is bigger (80%) and nudged left on desktop (#75). In the way anywhere? Covering a lane?
- [ ] MAGAZINE: countable rounds in a clip by the hearts, last 3 pulse warm, empty = hollow blinking clip, clip swap on reload (#72).
- [ ] CASINGS fly out per shot, per gun (brass / rifle / energy cell / candy). AQUA PRO and HOT ROD ALSO still throw their old 3D shell: double? say if one should go.
- [ ] Portrait phone: clip in the strip under the game, casings from the clip.
- [ ] 0.015: in landscape the clip now stands at the RIGHT edge next to the gun (your ask); hearts and HIT badge stay left.
- [ ] 0.015: menu duck hover has the same hysteresis as in play; relief quack plays once per scare, so a sweep is scared + relief, nothing more for 2 s.

## Range difficulty (0.013, built from DESIGN-STAGES.md section 5)
- [ ] Pop windows: ~1.3 s Beginner -> 0.45 s Insane. Does Insane feel "actually insane"? Does Beginner feel busy but fair?
- [ ] Aim travel: next target far from the last; corner to corner at Insane. Ever two plates right next to each other when not a trick?
- [ ] Spare shots 8 / 5 / 3 / 2 over the quota; briefing card shows ROOM FOR ERROR for every round.
- [ ] Reload-aware pacing: after an empty mag, no must-have target vanishes before you can reload.
- [ ] Anticipation pauses after a burst or a trick.
- [ ] COLUMNS (#71): only the front plate visible, shoot it and the next is standing there. First column of a round is always a clean 4; sometimes a later one has a decoy 4th (rare, ~1 in 10 rounds; can raise).
- [ ] ROWS on a beat; sometimes a decoy on the beat or an off-beat pop (rare too, can raise).
- [ ] SNAKE chains (floor and back along the ceiling, or a zig-zag in depth), tail sometimes a bomb/decoy.
- [ ] PING-PONG left-right-left then a bomb.
- [ ] WEAVING WALLS: two walls down the lanes that cross.
- [ ] BALLOONS floating across, sometimes a line.
- [ ] Swing-ins from the side still about half of the single targets.
- [ ] TURNCOATS: fuse ticks + plate shakes, then a flip you cannot shoot through, then a plain bomb. Fair now? If still not, they go.
- [ ] LIGHTS OUT: short events (2-4 s). Beginner ~1 in 4 rounds, Insane every round up to twice. Spotlight glides, blinks to another target, lights an empty spot and waits, usually jumps to the next after a hit. Readable at real speed? Too dark? Too often?
- [ ] Decoys: A2 sloppy paint, C2 cardboard rim with duct tape, E2 held up (your picks), mixed at random. Shooting one: disguise falls off, fuse flares ~0.3 s, THEN the bang takes the life. Brief enough?
- [ ] Hidden bombs behind plates at every tier.
- [ ] Nothing hidden by tier: every trick exists at Beginner, slower and rarer.

## Practice mode (0.008)
- [ ] First sign in FREE PLAY; no timer/quota/lives; tier signs above the duck's head; ESC to finish (desktop).
- [ ] #77 MOBILE: a crimson FINISH sign left of the tier signs ends practice (touch only). (0.015)

## Known open
- [ ] #78 (0.016): balloons and the duck cameo now fly by WHILE targets are up (they start over a busy range and never pause the stream; measured ~90% cross with a plate up).
- #79 Lights out needs tinkering later (Jon), details to come.
- [x] #53 free-play results now have AGAIN / BACK signs and no auto-advance (0.015).
- Duck mood re-pick by ear: http://localhost:8790/review/sfx-fx/index.html (local only).
- Versus with two real players not tested since 0.010 (deferred decoy penalty, magazine for P2).
- New sound events: 6 takes each of turntick / lightsout / lightson / duckcameo / duckcameohit are on the effects review page (http://localhost:8790/review/sfx-fx/index.html, local only). Pick, then they get wired.

## Next
- Friday 2026-10-31 after the weekly reset: BEE HIVE stage (brief first).
- Then: another Point Blank stage or the rail-shooter engine talk. Hub = its own session (prompt on your Desktop).
