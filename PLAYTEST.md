# B.L.A.M. play-test list (builds 0.008 to 0.023, live 2026-10-30)

Everything that changed since you last played a build by ear, in one place. Tick what is good, gripe what is not.
Live link: https://jonbeam1-netizen.github.io/blam/ (hard refresh once: Ctrl+Shift+R).

## Build 0.023 (2026-10-30 morning): CONVEYOR (stage 9)
- [ ] CONVEYOR = BELT 1-3 in FREE PLAY (page 6) and in the course pool. A toy factory at night: three belts at different heights and depths with tunnel housings, the press over the middle belt, the sorter arm, racks of toy parts, the B.L.A.M. TOY WORKS sign.
- [ ] Plates, bombs, decoys and hidden-bomb pairs (back belt) ride the belts standing up; the ride IS the pop window (fast belt 1.4 s Beginner -> 0.6 s Insane). Shootable the whole ride?
- [ ] THE PRESS slams over the middle belt and hides a segment; a plate that ticks on its way in comes out a bomb (turncoat: still a plate while ticking, unshootable under the head). Fair?
- [ ] BELT REVERSE: klaxon + amber light, then one belt turns round. SORTER: the arm lifts an item to another belt (unshootable in the claw). Readable?
- [ ] Patterns: shot-driven rows, stacks across the belts, snakes via the sorter, ping-pong then a bomb, the wall. +50 for a plate shot in the press's shadow.
- [ ] Variants: BELT 1 ASSEMBLY free fire, BELT 2 OVERTIME faster belts + 8 per mag, BELT 3 NIGHT SHIFT dark factory lit by the belts (muzzle flash bigger) + 12 per mag. Finale: the press punches B.L.A.M. into a sheet; NIGHT SHIFT brings the lights back on for it (say if it should stay dark).
- [ ] Insane softened by Fable after the solver (fast ride 0.52 -> 0.60 s; a slow bot failed 42 of 90 at 0.52). Still insane enough?
- NOT VERIFIED: nothing by ear; no real mouse / touch play; portrait; two-browser versus; no real frame-rate number (42-48 draw calls in a busy round, the highest of any stage).
- Agent-reported rough spots: the sorter arm reads thin; turncoats about once a round.

## Build 0.022 (2026-10-30 morning): SKEE BALL (stage 8) + #93 #94 #96 #97
- [ ] SKEE BALL = SKEE 1-3 in FREE PLAY (page 5) and in the course pool. Boardwalk arcade, five fanned lanes, ring boards, prize wall, marquee. Balls roll up and drop into a pocket: GREEN pockets pop a plate (or a decoy / hidden-bomb plate), RED pockets pop a bomb, the 100s pop a gold plate (+500) or the duck cameo. Read the arc, be aimed before the pop.
- [ ] BALL SHOT: shoot a ball in the air (+50) and it kicks to the nearest other-colour pocket (a 50-bound ball goes into the 100). Fun or confusing?
- [ ] LIGHTS SHUFFLE: bell, blink, then green and red swap pockets. Mid-wave shuffles from Advanced up, every wave at Insane.
- [ ] Variants: SKEE 1 BOARDWALK free fire, SKEE 2 TICKET RUSH more balls + 8 per mag, SKEE 3 LIGHTS SHUFFLE constant shuffles + 12 per mag. Finale: tickets spray and the prize wall spells B.L.A.M.
- [ ] #97 lanes rebuilt after your screenshot: flat walnut alleys with low rails, a ramp hump, a dark walkway between lanes (no more slanted planks). Right now?
- [ ] #96 MUZZLE FLASH: a tongue of flame out of the barrel along the bore on every gun, depth-tested (never over the gun body), two frames. AQUA PRO small, HOT ROD longer, RAY-85 a green bolt, CANDY SIX a cap pop then a smoke wisp. Bigger in dark scenes (Laser Tag, lights out). The round glow disc is gone. Size and shape OK?
- [ ] #93 No more glow on the menu after a Laser Tag round (the dark claim now lives only during the run).
- [ ] #94 Free-play FAILED / CLEARED on Laser Tag: AGAIN and BACK signs now hang in front of the arena barrier (results signs sit nearer the camera on every stage).
- NOT DONE: #95 ESC-free screens (MENU sign during play, BACK on briefing and course results) = agent job for next session. #98 to check: Laser Tag HIT % read 137 % on a failed Insane round (hits counted above shots?).
- NOT VERIFIED: the new flash was checked by logic and frame images only (the pane would not render while hidden); nothing heard by ear; no real mouse / touch play of Skee Ball; portrait layouts; two-browser versus.
- Agent-reported rough spots (Skee Ball): ball hits count as HITS toward the quota; Insane is harsh for a player who does not read the arcs (slow bot fails 7 of 90); plates ~18 px and rings ~8 px apart at this distance; a kicked pop can land on a board where a pattern member is up.

## Build 0.021 (2026-10-30, 03:00): LASER TAG (stage 7) + muzzle glow #92
- [ ] LASER TAG = TAG 1-3 in FREE PLAY (pages 4-5) and in the course pool. 90s black-light arena: neon tape walls, splatter murals, barrels, confetti carpet, UV tubes, the B.L.A.M. LASER TAG neon sign, an LED scoreboard. Does the vibe land?
- [ ] THE MECHANIC: a red tagger pops, raises the phaser, and a RED DOT slides in from the screen edge to your crosshair; when it lands they fire = red beam, red flash, hearts buzz dark, LIFE -1. Tag them first and they go dark. Dot slide 1.6 s Beginner / 1.2 / 0.9 / 0.6 s Insane, up to 3 dots at once. Fair? Readable at full speed?
- [ ] INSANE IS HARSH (agent numbers): a slow bot loses all hearts in 39 of 90 Insane runs. If it feels unfair, the Insane slide goes 0.6 -> 0.7 s (one number in lasertag.js TIER table). Your call.
- [ ] Sensor hit = 300, body hit = 100, +50 QUICK DRAW stamp for a tag in the first 30 % of the slide. GREEN teammates (FRIENDLY FIRE!) and the striped REFEREE (FOUL!) cost a life. Fakes: a tagger who ducks back, a green in a tagger's old spot, a lean from the other side of the wall.
- [ ] FOG BURSTS 2-3 a round (silhouettes, vests glow, your tracers drag a halo). THE BASE opens 1-2 times a round with a siren: +500. FINALE: the scoreboard scrolls B.L.A.M. and a line-up of figures flashes each letter.
- [ ] Variants: TAG 1 TEAM GREEN free fire, TAG 2 QUICK DRAW dots 25 % faster + 8 per mag, TAG 3 BLACKOUT fog all round + 12 per mag. No shot cap anywhere.
- [ ] #92 MUZZLE GLOW: a 1-2 frame bloom at the barrel per gun colour, ONLY in the dark (Laser Tag always, range LIGHTS OUT). Normal lighting unchanged. Check all four guns in the arena.
- [ ] Sounds are SYNTH placeholders: phaser pew with the falling whistle, dot charge beeps, vest-down buzz, tag chirp, whistle, fog hiss, base siren, GAME ON sting, a quiet arena bed.
- [ ] HIGH SCORES is now two blocks side by side (23 rows). The duck's hat touches the left block's corner; readable?
- [ ] 0.021 also carries hud.js hooks (def.drawHud for the dot, HUD.heartsOff for the buzz) and two lines in range.js lights-out for the dark flag.
- NOT VERIFIED: nothing heard by ear (muted throughout), no real mouse / touch play, portrait layout of Laser Tag and the 23-row portrait high-score table, a real two-browser versus match.
- Agent-reported rough spots: the dot covers what you aim at in its last frames (crosshair stays on top); 2 of 90 Insane runs overlap two figures on screen; versus desyncs a life if a hit confirms more than 0.6 s after the dot lands; fog is a surface haze without light shafts; figures are ~2.3 m so far ones read; the near-left wall was moved and narrowed to expose the crates and a lean spot.

## Build 0.020 (2026-10-30 night): INVASION (stage 6) + range / hive fixes #87-#91
- [ ] INVASION = UFO 1-3 in FREE PLAY (page 4) and in the course pool. Orbit view: Earth below, saucers drop in from deep space. A saucer that LANDS costs a heart (your pick A). No shot cap (8 / 8 / 12 per mag). Three waves, the MOTHERSHIP closes the last (shields pop off like a column, then the core). Round is ~1.5x the others. Fair at Beginner? Survivable at Insane?
- [ ] Saucer looks: tin toys in 3 sizes, dome = full points, rim = half. Far saucers are 10-14 px: hittable enough?
- [ ] Abduction beam (~1 round in 4): a big saucer stops and lifts Deputy Duck; shoot it before he is aboard = +500; taken = nothing lost. Funny?
- [ ] Shooting stars (looks only), the B.L.A.M. satellite drifting past, city lights spelling B.L.A.M. on clear. The gun can cover the last letter when you aim far right.
- [ ] Bomb saucers (skull hull), decoy saucers (cardboard dome), turncoats (hull flips after the fuse tick). None of them ever lands.
- [ ] Sounds are SYNTH placeholders: theremin warble, tin clang, landing, beam, mothership hum, WAVE n sting, space-hum bed. duckCameo / duckCameoHit got a synth sound too (so the range cameo now makes a noise).
- [ ] #87 HIVE Insane / Very Hard: less waiting between pops? (Insane dead time 47 % -> 39 % of the round, more targets, quota follows.)
- [ ] #88 Ping-pong and beat rows (range AND hive) are SHOT-DRIVEN: hit one and the next pops 0.1 s later, the bomb takes the slot you are heading to. A passive player gets the old cadence. Does the rhythm feel like yours now?
- [ ] #89 Hanging rows and hanging ping-pongs hang from ONE wooden rail (bar swings in, plates spin in edge-on). Strings no longer cross.
- [ ] #90 Range Insane uses the middle lane again (6 % -> 24 % of singles); hive middle columns 20 % -> 43 %. Still tennis?
- [ ] #91 Tracers stay bright during LIGHTS OUT.
- [ ] HIGH SCORES now 20 rows at 7 px (6 stages). Readable?
- NOT DONE: #92 muzzle glow in the dark (weekly budget; Saturday). NOT VERIFIED: a real frame rate on INVASION, a two-browser versus match, touch / portrait on the new stage, any sound by ear (everything was tested muted).
- Agent-reported rough spots: the mothership can sway across a descending saucer in 1-2 % of rounds; an unshot mothership just leaves (no penalty, no finale, its quota hits are lost); escorts count as real saucers and CAN land; a versus landing costs BOTH players a heart; Insane deception is 16 % of saucers (range: 37 %); hanging loop-snakes still cross posts (not on a rail); hive ping-pongs never appear on the magazine variants (pre-existing); range lanes 2 and 4 are the least used at Insane; the FASTEST stat counts the wait before a shot-driven pop.

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

## Build 0.019 additions (2026-10-30, late)
- [ ] BEE HIVE round 2: BIG detailed bees (30-60, striped, veined wings, a quarter with pollen baskets) crawl and hop over the comb and over plates; tiny bees kept as decoration (NOT shootable). Shoot a big bee = frenzy. SWARM Insane is very crowded: too much?
- [ ] Larva cycle: wax cap -> cap turns translucent so the larva shows growing -> EXPLODES into target / bomb / decoy -> bees re-cap the cell. No loading ring. Ripen times vary per cell.
- [ ] Hive miss marks: wax dents / honey splashes instead of green squares. (Root cause of the green was a colour overflow in the bullet-hole decal; fixed for every stage.)
- [ ] APIARY sign removed; at round end the bees fly up and spell B.L.A.M., then scatter (clock +4 s for it).
- [ ] TRACERS per gun (#76): AQUA PRO brass slug + muzzle smoke, HOT ROD long hot rifle streak, RAY-85 wavy green laser + green zap, CANDY SIX toy cap gun (cap pop, smoke, faint tick). Hits are still instant.
- [ ] IN-GAME MISS RICOCHET (#86): the title-marquee white-hot spark burst now happens on every miss on the environment.
- [ ] AQUA PRO shots +2.5 dB (#85).

## BEE HIVE, stage 5 (0.018)
- [ ] A honeycomb wall (7x4 live cells, Beginner plays the middle 5 columns) in a wooden hive frame at dusk, APIARY sign, smoker, honey drips.
- [ ] Plates, bombs, your three decoys and hidden bombs flip UP out of the cells on a hinge, stay, flip back. Same pop windows / aim travel / spare shots as the range.
- [ ] LARVAE: a grub grows and wriggles, the cell glows umber -> lemon, a ring of six lights fills, then it shakes and hatches into a BEE (flies off), a TARGET (+150 bonus) or a BOMB. Readable? Fun to pre-aim?
- [ ] BEES crawl and hop over everything. They never block a shot. Shooting one = no penalty, 2 s FRENZY (faster, louder buzz). Annoying or fun?
- [ ] Patterns: row on a beat, column bottom to top, snake through cells, ping-pong then bomb, deep cell (hidden column in one cell), the wall (6-8 at once).
- [ ] Variants: HIVE 1 HONEYCOMB (unlimited), HIVE 2 ROYAL JELLY (8 per mag, more larvae), HIVE 3 SWARM (12 per mag, many bees, frenzies on their own).
- [ ] Sounds are synth placeholders: beePass, beeFrenzy, beeHit, larvaHatch, honeyDrip, a quiet hive buzz bed.
- [ ] Not built: lights-out on the comb, turncoats on the comb, a bee on the duck's hat.
- [ ] HIGH SCORES now fits 17 rows (five stages).

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
