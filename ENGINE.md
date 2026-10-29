# B.L.A.M. engine

## Engine notes

Static, multi-file, no build step (GitHub Pages ready: `.nojekyll`, `.gitignore` excludes `review/` and `node_modules/`).
Three.js r128 from cdnjs; PeerJS 1.5.4 from unpkg is loaded **on demand** when someone opens Versus.
Every module is a plain script that hangs its API off `window.BLAM`. Load order matters and is fixed in `index.html`.
The render pipeline, palette, fonts and the voxel builder are lifted from `looktest.html` (see `STYLE.md`).

### File map

| file | what it owns |
|---|---|
| `index.html`, `style.css` | shell: canvas, script tags (in order), viewport meta, the DOM text prompt style |
| `js/core/render.js` | `BLAM.R`: palette `PAL`/`CSS`, fonts `F3`/`F7` (+ generated bold glyphs), `Vox` builder, materials `MAT.env/obj/glow/hot`, renderer, 426x240 scene target, palette+Bayer post pass (`setDither(on)`, dev `setMode(1..3)`), HUD canvas `hx`, letterbox + **outer canvas** (pillar frame / portrait HUD strip on its own pixel grid), `rayAt(u,v)`, `screenToWorld(u,v,z)`, `screenToCam(u,v,d)`, `toPx(v3)` |
| `js/core/input.js` | `BLAM.Input`: mouse crosshair + left click, right button (`onAlt`), raw pointer `ptr {u,v,inside,over}` (also over the frame), touch tap fires where tapped + swipe down (`onSwipe`, `SWIPE_PX` 40), keys, no page scroll/zoom / context menu; `aim {u,v}`, `onFire`, `onKey`, `onLayout(touch)` |
| `js/core/save.js` | `BLAM.Save`: localStorage `blam.save.v1` (settings incl. `reloadPC` / `reloadTouch`, best per `stageKey|tier`, gun skin) |
| `js/core/audio.js` | `BLAM.SFX` **stub**: `play(name, opts)` logs to `BLAM.SFX.log`; the event list is documented at the top of the file |
| `js/core/ammo.js` | `BLAM.Ammo`: `'unlimited'` / `{mag, reloadTime?, autoReload?}` / `{cap}`; magazine reload is MANUAL and INSTANT (Build 0.005): `startReload()` fills the magazine at once, plays the cosmetic `gun.reload(0.12)`, never locks the trigger; `reloadTime` is ignored; `autoReload: true` refills instantly when the last round is spent |
| `js/core/hud.js` | `BLAM.HUD`: cached 3x5 / bold text, sprites, ammo shell, hearts, HIT badge (0.35 s, beside the shell), timer ball, quota pill, versus counters, crosshair, briefing/results panels (stone banner, red panel, sticker, plate, starburst, icons), `drawPlay(hs)`, `drawOuter(frame, t, hs)` |
| `js/core/targets.js` | `BLAM.Targets`: chips (InstancedMesh), bullet-hole decals with a rim, sparks, bomb puff, `Target` base class, `pick(ray, targets)`, `Sign` (shootable menu board) |
| `js/core/stage.js` | `BLAM.Stage`: tiers, `mulberry32`, stage registry, env cache, `Run` (one stage being played, scoring, versus adjudication), `Course` |
| `js/core/fallback.js` | placeholder box gun + box duck behind the same API as `guns.js` / `duck.js` |
| `js/core/ui.js` | `BLAM.UI`: title marquee, `Menu` of shootable signs, DOM `prompt`, all screens, `UI.tall()` |
| `js/core/portrait.js` | tall-phone layouts: `drawPortrait(t, L)` for every text screen, drawn on the outer canvas (see "Check pass 0.002") |
| `js/core/props.js` | `BLAM.Props`: shared toon-voxel gallery props (bullseye paddle, iron bomb, decoy, flip bomb), one shared toon material; API at the top of the file (see "Props" below) |
| `js/stages/range.js` | Stage 1, the shooting range (paddles, bombs, decoys, flip bombs from `BLAM.Props`) |
| `js/stages/alley.js` | Stage 2, THE ALLEY: cardboard crooks pop out of cover, bystanders (`kind 'bystander'`) walk through hands up; occluders block bullets |
| `js/stages/boneyard.js` | Stage 3, BONEYARD: skeletons rise from a bone heap, skull 300 / ribs 100 hit zones, bomb skulls, flip bombs, thrown skulls, bats |
| `js/net.js` | `BLAM.Net`: versus (lobby, join code, adjudication messages, timeouts, offline fallback) |
| `js/main.js` | `BLAM.G`: boot, mounting gun + duck, game flow (course / free play / versus), the loop, keys, **build stamp** |
| `js/guns.js`, `js/duck.js` | owned by the art agent; used through `BLAM.Guns` / `BLAM.Duck` if present |

Keys: **R** reload (every RELOAD TYPE, during a stage), **4** next gun skin (anywhere), **F** FPS readout, **1/2/3** dither modes (dev, not saved), **Esc** back / leave.
URL params: `?seed=N` fixes every stage seed (repeatable runs), `?go=free|settings|scores|lobby|tiers` jumps to a menu,
`?slow=0.25` (testing) runs a solo stage clock at that rate (HUD label shows SLOW; versus ignores it).

### Screens and flow

`title` (shootable signs PLAY / VERSUS / FREE PLAY / SETTINGS / HIGH SCORES, background paddles you can shoot)
-> `tiers` -> course of 4 stages: `briefing` -> `play` -> `results` -> ... -> `final`; zero hearts -> `gameover` (CONTINUE refills hearts, retries the stage that ended the run, score resets).
The course deals every registered stage once (seeded shuffle) before repeating one; slot 4 is never the stage of slot 3 (with 3 stages: e.g. `range:0 alley:1 boneyard:2 alley:2`; the variant is `min(slot, variants - 1)`).
`free` (any stage variant at any tier; 6 stage signs per page, a blue `PAGE n/m  NEXT >` sign on the right cycles pages when there are more) -> `briefing` -> `play` -> `results` -> `free`.
`lobby` -> `briefing` (versus, timed) -> `play` -> `vsresults` -> `lobby`.
Hearts: Beginner 5, Advanced 4, Very Hard 3, Insane 3. A failed quota (time out / timeline done / ammo spent) or a bomb/bystander costs one.

### How to add a stage (the stage interface)

Create `js/stages/<id>.js`, add its script tag after `range.js`, and call `BLAM.Stage.register(def)`:

```js
BLAM.Stage.register({
  id: 'pots', name: 'POT SHOTS', short: 'POTS',   // short = label on menus ("POTS 2")
  variants: 4, variantNames: ['...', ...],        // a course uses variant 0..3 for stages 1..4 (escalation)
  penalty: -300,                                  // score change for a bomb / bystander
  buildEnv() -> THREE.Group,                      // static set, built once; group.userData.shootables = [meshes that take bullet holes]
  config(tier, variant) -> cfg,                   // rules (fields below); pure
  timeline(cfg, rng) -> spawns[],                 // every spawn, sorted by t0, from the seeded rng ONLY (may finalise cfg.quota/ammo)
  makeTarget(spawn, run) -> Target,               // a BLAM.Targets.Target subclass
  points(spawn, lt, zone) -> int,                 // score for hitting this spawn at local time lt (zone: see "Hit zones"); pure
  briefing(cfg) -> { rule: [[text, colour]...], icon: 'bullseye', unit: 'TARGETS', dont: 'bomb'|null, tip },
  drawIcon?(cx, cy, r, t),                        // optional: briefing "SHOOT!" card icon (default HUD.bullseyeIcon)
  drawDont?(cx, cy, r, t),                        // optional: don't-shoot sticker icon (default HUD.bombIcon)
  decor?() -> { targets, update(t) }              // optional: title-screen background toys
});
```

Spawn objects need `id` (= index), `t0`, `t1` (stage-clock start/end) and optionally `readyAt` (local time from which it counts for "fastest shot"); anything else is yours.
A target's `update(lt, run)` is called every frame with **local time** `lt = run.t - spawn.t0`; it must set `group` pose and `shootable` as a **pure function of lt** (that is what keeps versus in sync) and return `true` when finished.
Set `kind` to `'target'` (scores), `'bomb'` or `'bystander'` (life -1). Register shatterable voxel parts with `this.part(mesh, voxelList, size, ox, oy, oz)`; optional `explode(point)` for bombs. The run removes it after `update` returns true.

**Stage config fields** (`cfg`): `quota` (hits to clear), `time` (seconds), `ammo` (`'unlimited'` | `{mag, autoReload, reloadTime}` | `{cap}`), `title`, `subtitle`, plus stage-specific tuning. The range uses `hold, quick + mix (mixed hold times), swing, scoot, steps, live (max at once), bomb (rate), bombCap (max bomb share), gap [min,max], rel (reload s), slack (spare shots for a cap), share (quota share), autoReload, flipbomb`.
The range derives `quota` from the REAL targets its timeline produced (share per tier 52/56/58/60% + 2% per variant, flip bombs never counted) so a quota is always reachable (table in "Build 0.003").

Determinism: `Run` seeds `mulberry32(hash(stage|tier|variant) ^ seed)`; `run.timelineHash` lets you compare two machines.

**Hit zones (scoring by the part that was hit).** Set `mesh.userData.zone = 'skull'` (any short word, `[a-z0-9_]{1,16}`) on a target's hittable meshes. `Targets.pick` returns it as `p.zone`; solo, `main.js` calls `run.applyHit(me, tid, run.t, point, zone)`; versus, the shot message carries `z`, the host stores it with the claim, the winning claim's zone goes to `applyHit` and out in `hit.z`, so both tabs score the same. `applyHit` calls `def.points(sp, lt, zone)`; `zone` is `undefined` when nothing was set (or a touch-slop pick), so a stage needs a fallback (Boneyard: flat 200).

**Briefing icons.** `ui.js` (landscape card) and `portrait.js` call `def.drawIcon(cx, cy, r, t)` instead of the bullseye and `def.drawDont(cx, cy, r, t)` instead of the bomb when the stage provides them (draw with `BLAM.HUD.sprite` / `pixImg`, centred on `cx, cy`, about `2r` across; r is 21 / 13 landscape, 8 / 7 portrait). With a custom `drawDont`, the red X shrinks and moves to the icon's lower-right corner so the face still reads. ALLEY: crook head / cook head; BONEYARD: bone skull / dark bomb skull with a lit candle.

**Blocking bullets.** `Targets.pick` raycasts only target meshes, so scenery does not stop a shot by itself. A stage can make cover solid by overriding a target mesh's `raycast(raycaster, intersects)`: call `THREE.Mesh.prototype.raycast.call(this, ...)` and drop the hits that lie behind an occluder (ALLEY `occRaycast`: a crook peeking behind a bystander or a dumpster can only be hit on his exposed part; BONEYARD `heapRaycast`: the part of a skeleton still under the bone heap can't be hit).

**Decoy targets (range, Very Hard / Insane).** `sp.decoy`: a bomb painted like a target (`BLAM.Props.decoy`, kind `'bomb'`, ~1 in 5 bombs). Its tell is a nervous wobble (`prop.wobble(lt)`, pure). Shooting it is a bomb hit (life -1); never counted toward the quota.

### Props (`BLAM.Props`, `js/core/props.js`)

Shared toon-voxel props in the gallery look; full API in the file's top comment. `paddle({color, size, hang, slot})`, `bomb({size, hang, burn})`, `decoy({size, hang})`, `flipbomb({size, hang, color})` return a prop `{ kind, group, pivot, base, arm, face, face2?, spark, fuse, register(target), show(), hide(), setFuse(f), sparkle(t, fast), setFlip(f), wobble(t), chips }`. Rotate `pivot` to swing; call `prop.register(this)` in the Target constructor (registers the face as the shatter part). `Props.warm()` builds every shared geometry at stage load; `Props.mat`, `Props.cspec`, `Props.SCHEMES`, `Props.Geo` / `Props.sdf` for new props in the same style. `Target.shatter()` honours a 5th chip element (size multiplier) and `Targets.burst(p, scale)` is the cartoon bomb explosion.

### Events emitted to BLAM.SFX

`shot, hit {pts, step}, miss, reload {time}, reloadDone, empty, bomb, bystander, lifeLost, stageStart, stageClear, stageFail, quota, tick {n}, countdown {n}, go, menuShoot, menuHover, duckHit, duckHappy, duckAngry, targetIn {u}, targetStep {step}, gameOver, continue, courseClear, newRecord, vsJoin, vsLeave, vsWin, vsLose, vsTaken, skin, ricochet {u}`;
ALLEY: `bystanderIn {u, who}, pigeon {u}`; BONEYARD: `skullThrow {u}, skullBonk, boneRattle {u}, bombFlip {u}, batFlap {u}`.
Full descriptions at the top of `js/core/audio.js`. A sound agent replaces `BLAM.SFX.play` (same signature).

### Versus message protocol (PeerJS, JSON, host-relay star with one guest)

Code `BLAM-XXXX` (alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`), peer id `blam-xxxx`; `unavailable-id` rolls a new code. P1 = host = red, P2 = guest = blue.

| dir | message | meaning |
|---|---|---|
| G->H | `{t:'hello', name}` | guest joins |
| H->G | `{t:'welcome', you:1, players, lobby}` | accepted (`{t:'full'}` if a guest is already in) |
| H->G | `{t:'lobby', lobby:{stage, variant, tier}, players}` | host changed tier/stage |
| H->G | `{t:'start', seed, stage, variant, tier, names}` | both build the same `Run`; versus briefing lasts 5.5 s from receipt, then 3.2 s countdown |
| both->H | `{t:'shot', st, k:'hit'/'miss'/'bomb'/'duck', tid, z (hit zone or absent), a (ammo, -1 = inf), ar (reloading)}` | every local shot (host feeds its own through the same path) |
| G->H | `{t:'am', a, ar}` | ammo / reload status only (a reload started or finished). NOT a shot: no stats, no adjudication; host updates the guest's display ammo and sends `sc` (the host's own reload just sends `sc`) |
| H->G | `{t:'hit', tid, by, st, z}` | target `tid` awarded to player `by` (`z` = the winning claim's hit zone, scored on both sides) |
| H->G | `{t:'miss', by, st}` / `{t:'pen', by, tid}` | a miss / a bomb hit (explode it, hearts come with `sc`) |
| H->G | `{t:'sc', p:[[hits, shots, score, lives, fastest, ammo, reloading] x2]}` | authoritative tallies after every shot |
| H->G | `{t:'end', p}` | final tallies; guest shows results (or after 5 s with its own copy) |
| both | `{t:'ka'}` every 1 s, `{t:'bye'}` on leave | 8 s of silence = dropped |

Adjudication: the shooter shatters the target locally at once (optimistic, tinted with its colour) and sends the claim with its **stage-clock time**. The host collects claims for 0.12 s, awards the earliest `st` (ties to P1), rejects claims outside the spawn's on-screen window, and broadcasts `hit` + `sc`. The stage clock in versus follows the wall clock from the agreed start, so a slow tab can't fall behind; a tab without animation frames keeps the match ticking on a timer.
Host leaves: guest goes to the lobby ("THE HOST LEFT"). Guest leaves mid-match: host returns to the lobby. No PeerJS / no server: lobby shows the reason with PLAY SOLO (free play) / TRY AGAIN.

### Gun + duck contract (implemented by `guns.js` / `duck.js`)

`BLAM.Guns.SKINS; create(THREE,{skin,layout}) -> gun` with `group, setSkin, nextSkin, setLayout, setAim(ndcX, ndcY), fire, reload(s), setEmpty(b), update(dt,t), muzzleWorldPos(v3)`.
`BLAM.Duck.create(THREE,{}) -> duck` with `group, setPose('idle'|'happy'|'angry'|'shot'|'present'|'cheer'|'sad'), hit, update(dt,t), lookAt(ndcX, ndcY), hitTest(raycaster)` (truthy = hit; duck.js returns `true` and keeps the intersection in `duck.lastHit`, whose `.point` is used for sparks).
Layouts (`BLAM.Guns.LAYOUTS`): `desktop` (bottom-right corner), `mobile` (bottom-middle, portrait phones), plus `<base>-low` and `<base>-away`; `setLayout` takes any of them and the rig eases between them. `G.gunLayout()` in `main.js` picks one per screen.
`duck.hit()` = the 1.6 s flop-and-pop-up gag that ends in idle; `setPose('shot')` = the same gag but he stays fuming (`angry`). `main.js` uses `hit()` and lets it finish (`DUCK_GAG`), then returns to the screen's resting pose.
`main.js` wraps `duck.group` in its own holder (it positions/scales/mirrors the holder: big on the title, mini in the bottom-left HUD corner as a camera child, right side on briefing/results), so the duck may animate `duck.group` freely. Missing modules or a throwing `create()` fall back to `core/fallback.js`.

### Build stamp rule

`BUILD` in `js/main.js` is shown on the title status line (`BUILD 0.002`). Bump it (0.003, 0.004, ...) on **every** publish,
together with the `?v=` cache-buster on every local script / stylesheet tag in `index.html` (browsers and Pages cache them).

## Check pass 0.002

Integration pass over the engine + the real `guns.js` / `duck.js`, tested with real mouse clicks in the browser pane. Proof captures: `review/phase2/check/`.

- **Hits from real clicks.** The pointer -> frame -> ray mapping and `Targets.pick` were already right (real clicks hit at full speed, any lane). What made visible paddles eat a MISS: a paddle was unshootable for the first 45 % of its swing-in and the last 70 % of its drop. Now `readyAt` = 15 % of the swing (decor 0.12 s) and a dropping paddle stays shootable to 70 % (~30 deg back). Touch taps get a 12 CSS px slop ring (good targets only, never bombs / bystanders): a far paddle is ~7 CSS px wide on a portrait phone. Testing note: a hidden Browser pane only renders a frame when a screenshot is taken, and a screenshot -> click round trip takes seconds; use `?slow=` (and keep the pane visible) to shoot a real paddle by hand.
- **Gun size + place.** `LAYOUTS` shrunk to ~60 % (desktop ~80x60 game px at a centre aim, bottom-right corner; mobile ~57x58, bottom-middle), new `-low` / `-away` variants, `setLayout` accepts them. `G.gunLayout()`: corner while you can shoot; portrait phones play bottom-middle (their HUD is under the game rect) and park the gun in the corner on menus; landscape phones use the corner (the HUD strip owns the bottom middle); briefing / results slide it out of frame (the duck stands there). Re-picked on every screen change, input-type change and resize.
- **Fire timing.** `playFire` calls `gun.fire()` before `ammo.use()`, so the last round of a magazine / cap flashes and recoils before the reload / empty state starts. A dry trigger calls only `ammo.use()` (EMPTY click + HUD flash) and, when the cap is spent, `gun.fire()` (the gun's dry-trigger click; not called mid-reload): no muzzle flash, no shot, no ray.
- **Duck.** Shooting him plays `duck.hit()` for the full 1.6 s (was cut at 1.1 s by `duckReact('shot', 1.1)`), reactions are ignored during the gag, then the screen's resting pose returns; sparks come from `duck.lastHit.point`. Right-hand spots are smaller (brief 1.0, results 0.95, was 1.25) so every pose stays in frame and off the panels; mirrored `lookAt` checked (he looks toward the crosshair on both sides). Mini HUD duck nudged 2 px in.
- **Portrait phones.** `UI.tall()` (portrait and `hudScale >= 2`): every text screen's `draw()` leaves the game rect to the 3D and `core/portrait.js` draws its text on the outer canvas (headline on a sign board in the curtain, the panel on the shelf), like the play HUD strip. Toasts move above the game rect. Tablets in portrait keep the normal layouts.
- **Other.** All gun skins are built at boot (first key-4 press used to cost 8-14 ms mid-stage). Bold font: hand-made `W` (the doubled one read as V: "VINNER!"). Versus results no longer dim Deputy Duck. `index.html` scripts carry `?v=BUILD`.
- Files: `js/main.js`, `js/guns.js` (LAYOUTS + setLayout only), `js/stages/range.js` (shootable windows), `js/core/ui.js`, `js/core/hud.js` (drawOuter panel hook), `js/core/render.js` (W glyph), new `js/core/portrait.js`, `index.html`, this file.

## Build 0.003

Reload, difficulty, target mix and target motion rework (engine side; `guns.js` / `ui.js` / `duck.js` belong to other agents). Proof captures: `review/phase3/B/`.

### Shoot-to-reload (#23, #31)

- **Default magazine rule is manual.** Shoot the frame around the 16:9 game rect (side pillars; on windows taller than 16:9 and on portrait phones, the top / bottom bars; on touch, a tap there) to reload. Works on a partial magazine (tactical reload). **R** is the PC fallback. Full magazine / already reloading / unlimited / cap: a frame shot does nothing.
- A frame shot is **not a shot**: no stats (shots / accuracy), no ammo from a cap, no miss, never sent to the versus host as `shot`. `main.js`: `G.isSideShot`, `G.sideReload(run)`; `Ammo.startReload()` returns whether a reload started.
- An emptied magazine stays empty (`gun.setEmpty(true)`) until you reload; a dry trigger plays the gun's dry click. `startReload` clears the empty state and calls `gun.reload(reloadTime)`; the trigger is locked for `reloadTime`.
- `autoReload: true` in a stage's `ammo` rule brings back the old automatic reload (per-stage option, `cfg.autoReload`, default `false` in the range).
- No frame at all (window exactly 16:9): a 2.8 % edge zone on the left / right of the game rect stands in for the frame (magazine stages only) and its markers are drawn on the HUD.
- **HUD:** shell shows `RELOAD` (red, blinking) when the magazine is empty, `RELOAD` + `...` + a lemon progress bar while reloading. A small blinking red `RELOAD` sits under the crosshair (above it near the bottom); on touch it sits at the last tap point (lower centre before any tap).
- **Frame markers:** `HUD.reloadMarker(cx, cy, dir, state, sc)`; plaque with `< R E L O A D <` stacked vertically, arrows pointing outward (pillars), or horizontal `^ RELOAD ^` / `v RELOAD v` on the top / bottom bars. States: dim (normal), lit + blinking (empty), yellow flash for 0.35 s (reload triggered, `ammo.kick`), amber (reloading). Only on magazine stages. Spots are computed in `buildOuter` (`HUD.markerSpots()`); `drawOuter` also redraws when the marker state changes.
- **Versus:** reload state is local. A reload start / finish sends `{t:'am', a, ar}` (guest) or a `sc` snapshot (host) so the other side's shell is right; hits are adjudicated exactly as before. `Run.remoteAmmo(a, ar)` builds the display-only ammo of the other player.
- **Numbers:** magazines 6 (variant 1 RELOAD DRILL) and 8 (variant 3 FINAL ROUND); reload time 0.75 / 0.70 / 0.62 / 0.55 s by tier (variant 3: x0.9 = 0.68 / 0.63 / 0.56 / 0.50 s). Hard cap (variant 2) = quota + slack (10 / 8 / 6 / 4).

### Difficulty curve (#22): shifted up two notches

Base values (variant 0). Variants: hold x(1 - 0.06 v), scoot x(1 - 0.05 v), quick x(1 - 0.04 v), live +1 at v3, bomb rate +0.04 at v >= 2, quota share +0.02 v.

| tier | time | hold (linger) | quick hold / mix | swing | scoot | steps | live | bomb rate | bomb cap | gap s | quota share |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BEGINNER (~ old Adv/VH midpoint) | 42 | 1.10 | - | 0.62 | 0.27 | 4 | 4 | 0.12 | 10 % | 0.95-1.6 | 52 % |
| ADVANCED (~ old Insane) | 38 | 0.72 | - | 0.50 | 0.20 | 5 | 5 | 0.22 | 20 % | 0.6-1.15 | 56 % |
| VERY HARD | 35 | 0.70 | 0.26 / 50 % | 0.40 | 0.15 | 5 | 6 | 0.34 | 30 % | 0.3-0.68 | 58 % |
| INSANE | 32 | 0.60 | 0.20 / 50 % | 0.32 | 0.12 | 5 | 7 | 0.42 | 35 % | 0.22-0.52 | 60 % |

Old table for reference (0.002): hold 1.7 / 1.25 / 0.95 / 0.7, swing 0.85 / 0.7 / 0.6 / 0.5, scoot 0.38 / 0.3 / 0.24 / 0.2, live 3 / 4 / 5 / 5, bomb 0 / 0.14 / 0.2 / 0.26.
**Mixed holds** (Very Hard, Insane): per target from the seeded rng, about half linger (`hold`; stationary motions stay `1.8 x hold`), half are *quick*: hold `quick` and a scooting paddle only makes 2 stops, so it drops almost at once. Quick targets score +50.
Sweep over 300 seeds per tier (variant 0 / 3): spawns 28 / 38 / 63 / 77, real targets 26 / 33 / 50 / 60, quota avg 14-16 / 18-21 / 29-33 / 36-41.

### Target mix (#24)

The generator (`range.js timeline`) enforces, as it lays out spawns: bombs <= `bombCap` share of the spawns so far (10 / 20 / 30 / 35 %), never two bombs in a row, a bomb only while at least as many real targets are up (staying >= 0.6 s) as bombs; so "two bombs up and no real target" cannot happen (0 cases in 2400 seeds, old generator: up to 25 per 300 seeds) and the worst seed is at the cap (old: 53 % bombs, e.g. Insane seed 187 had 15 bombs of 29 spawns; now 23 of 79 with 56 real targets). The quota is a share of the real targets only.
**Flip bombs** (`cfg.flipbomb`, default ON at Very Hard / Insane only): ~45 % of bombs; the fuse spark burns down the fuse and blinks faster, then in the last ~0.4 s on screen (+ the exit) the disc flips (0.12 s) to a bullseye worth step points +100. Kind is a pure function of local time (`sp.flip`); shooting it before the flip is a normal bomb. Never counted toward the quota.

### Target motion (#34)

`sp.mo` per spawn from the seeded rng (weights scoot 40 %, drop 20 %, pop 20 %, side 20 %), all pure functions of local time, all voxel paddles:
- `scoot`: the classic (swing up from the side, scoot forward in steps, drop back).
- `drop`: hangs from a ceiling hanger rod (group upside down at y 4.3, disc art kept upright), swings DOWN from above with an overshoot, pendulum settle, swings back up. Uses its own lane slot (ceiling), so a lane can hold a floor paddle and a hanging one.
- `pop`: rises out of the floor slot (the floor hides it), sinks back.
- `side`: swings in on a vertical hinge (edge-on to face-on) while sliding in from the side wall, then falls back.
Stationary motions sit at a random depth stop `k` (points by stop as before). Shootable windows keep the 0.002 rule: from 15 % of the entrance to 70 % of the exit.

### Other

- Mini HUD duck hover hook: each PLAY frame, `duck.setHover(duck.hitTest(ray at the aim))` (mouse only; guarded by `typeof duck.setHover === 'function'`; switched off when leaving PLAY).
- `G.gunLayout`: every non-play screen uses the `-low` layout on desktop too (`desktop-low` = the old corner spot; the PLAY layout moved inward in `guns.js`).
- Portrait briefing SHOTS card: magazine reads `SHOOT SIDE` (or `AUTO RELOAD` when `autoReload`). The landscape briefing card in `ui.js` still says `AUTO RELOAD` (ui.js owner).
- Testing: the browser pane may serve stale scripts; bump the `?v=` or re-fetch with `cache: 'reload'`.
- Files: `js/core/ammo.js`, `js/core/hud.js`, `js/core/stage.js`, `js/core/portrait.js`, `js/stages/range.js`, `js/net.js`, `js/main.js`, `index.html`, this file.

## Duck contract additions (build 0.003)
- `BLAM.Duck.POSES` now: idle, happy, angry, shot, present, cheer, sad, scared, relief.
- `duck.setHover(bool)`: call every frame with the crosshair hit test; edge-triggered inside. Hover on -> `scared` (unless `shot` is playing); hover off after >= 0.25 s -> `relief` (1.5 s) then the resting pose. ALWAYS call `setHover(false)` when the duck is hidden or the screen changes. `duck.hovered` getter.
- `duck.hit()` = fall straight back (1.6 s) then back to resting pose. `setPose('shot')` stays fuming.

## New files (stubs, build 0.003)
- `js/core/props.js`: shared prop builders (paddle, bomb, decoy, flipbomb, posts) for the props art pass; stages should use `BLAM.Props` once it exists. (Filled in 0.004, see "Props".)
- `js/stages/alley.js`, `js/stages/boneyard.js`: next stages. Stages self-register with `BLAM.Stage.register`; the course picks from the registry and free play lists every registered stage/variant (paged since 0.004).

## Build 0.004

Stage 2 ALLEY, stage 3 BONEYARD and the props art pass (`props.js`, `targets.js`, `range.js`), then an integration pass. Proof captures: `review/phase3/int/` (stage agents: `review/phase3/alley/`, `boneyard/`, `props/`).

- **Hit-zone scoring through the engine** ("Hit zones" above): `Targets.pick` returns `zone`; `Run.applyHit(by, tid, st, point, zone)` -> `def.points(sp, lt, zone)`; `hostClaim(by, tid, st, zone)` keeps the zone per claim and the winner's zone is applied and broadcast; `net.js` carries `z` in `shot` / `hit` (sanitised to a short word). Boneyard's `zoneProxy` / `LAST_ZONE` workaround and its versus flat-200 rule are gone: versus scores skull 300 / ribs 100 on both tabs.
- **Briefing icon hooks** `def.drawIcon` / `def.drawDont` in `ui.js` and `portrait.js`; Alley's `H.bullseyeIcon` / `H.bombIcon` monkey-patch (`wrapIcons`) became hooks; Boneyard draws a bone skull / a dark bomb skull with a flickering candle. A custom don't-shoot icon gets a small corner X.
- **Course** with 3 stages: the old picker took `order[0]` (range) for every slot once the pool was down to one stage, so a course could play RANGE twice and skip a stage. Now every stage plays once before any repeat and never twice in a row (2000 seeds: all three stages in slots 1-3, 0 back-to-back repeats).
- **High scores**: the table showed only the first 9 rows (BONES 3 and COURSE were cut off). Rows now squeeze from 14 to 11 px to fit up to 12 (landscape); portrait shows up to 14.
- **SFX events** added to `audio.js` (`ricochet`, Alley `bystanderIn` / `pigeon`, Boneyard `skullThrow` / `skullBonk` / `boneRattle` / `bombFlip` / `batFlap`).
- **"Unexpected end of input" x6** seen by the props agent: not from the game. The browser pane's console log is kept per tab across reloads, so six old `Uncaught SyntaxError` entries from one earlier page load kept showing in that tab; every game script parses (all 19 checked) and fresh loads log no errors. Testing tip: a tab's console history survives navigation; use a fresh tab (or a marker log) before judging errors.
- Files: `js/core/targets.js`, `js/core/stage.js`, `js/core/ui.js`, `js/core/portrait.js`, `js/core/audio.js`, `js/net.js`, `js/main.js`, `js/stages/alley.js`, `js/stages/boneyard.js`, `index.html`, this file.

## Build 0.005

RELOAD rework (owner items #44, #40, #38). Proof captures: `review/phase3/reload/`.

### Instant reload (#44)

- Time Crisis / Area 51 rule: the moment a reload trigger registers, the magazine is full and the next shot fires. Every method, tier, variant and stage.
- `Ammo.startReload()` sets `count = max`, `kick = 0.3` (HUD capsule flash), emits `reload {time: 0}` + `reloadDone`, calls `gun.reload(0.12)`. `reloading` is always `false`, `reloadFrac` 0, nothing ever locks the trigger.
- `reloadTime` in a stage's `ammo` rule (range / alley / boneyard / skyshow still pass `b.rel`) is **ignored**; keep it or drop it, it is harmless. The per-tier reload times in "Build 0.003 / Numbers" are dead values.
- `autoReload: true`: the magazine refills instantly when the last round is spent (it then plays like an unlimited gun with a rack every N shots).
- Gun (`guns.js`): `reload(s)` accepts down to 0.08 s (was clamped to >= 0.3); `fire()` during the rack animation snaps it to the end and fires (it used to swallow the shot).
- HUD shell: no progress bar, no `...`; a single lemon capsule flash + yellow `RELOAD` for `kick` (no strobe). The empty-mag `RELOAD` over the shell and the crosshair `RELOAD` prompt alternate red / white letters at 2 Hz (no on/off blink, no box).
- Versus: unchanged protocol. `G.sideReload` sends `{t:'am', a, ar:0}` (guest) / a `sc` snapshot (host) after every reload, so the rival's shell shows the full magazine; `ar` is always 0 now. Reloads and frame shots are never `shot` messages.

### RELOAD TYPE setting (#40)

`Save.settings.reloadPC` (`'arcade'` default | `'rclick'`) and `reloadTouch` (`'swipe'` default | `'tap'`); `G.reloadMode()` returns the one for the current input type (`Input.touch`). Settings screen: an amber `RELOAD: ...` sign (centre, bottom row) cycles the options of the CURRENT input type; captions name the group (`PC: ARCADE / RIGHT CLICK` or `PHONE: SWIPE DOWN / TAP SIDES`) and what the current one does. Portrait settings text and the portrait briefing SHOTS card follow the mode.

| mode | reload by | frame shot / tap | edge zone (exact 16:9) |
|---|---|---|---|
| ARCADE (PC default) | shoot the frame, or rest the mouse on it for 0.1 s (wall clock, only while the mag is not full; leaving the frame resets the timer, so a flick across the edge never reloads) | reloads | yes |
| RIGHT CLICK | right mouse button anywhere (context menu suppressed; chorded presses work) | nothing (not a shot) | no (normal shots) |
| TAP SIDES | tap the frame | reloads | yes |
| SWIPE DOWN (touch default) | a touch that travels >= 40 CSS px mostly downward (dy > 1.2 |dx|), recognised on pointermove, once per touch | nothing (not a shot) | no |

Key **R** works in every mode. A frame shot is never a shot (no stats, no cap round, never sent to the host) in every mode.
**Swipe vs tap:** a tap fires on `pointerdown` exactly as before; swipe detection never delays it. So the touch that starts a swipe is itself a tap: on an empty magazine it is only a dry click (no shot, no stats), but a tactical swipe on a partial magazine spends that first round before the swipe reloads.
Hooks: `Input.onAlt(fn(u, v, inside))`, `Input.onSwipe(fn(u, v))`, `Input.ptr`; main.js `G.reloadMode()`, `G.frameReloads()`, the dwell runs in `playExtras`.

### Markers (#38)

`H.reloadMarker(cx, cy, dir, st, sc, kind)`, `kind = H.markerKind(mode)`: `'arcade'` (ARCADE / TAP SIDES: `< R E L O A D <`), `'mouse'` (RIGHT CLICK: pixel mouse, right button lit, + RELOAD), `'swipe'` (SWIPE DOWN: `SWIPE` + a down arrow). Pillars stack vertically, top / bottom bars horizontally. `hs.reload = { empty, kick, mode }`.
States: `dim` (quiet slate plaque, mag not empty), `hotR` / `hotW` (mag empty: ONLY the letters and arrows switch red <-> white at 2 Hz, bold and one size up when the pillar / bar has room, a 1 px dark outline for legibility; no plaque, nothing behind them changes), `kick` (steady lemon letters while `ammo.kick` runs). The HUD edge-zone markers (no frame) are drawn only in ARCADE / TAP SIDES. `buildOuter` spots are now `[cx, cy, dir, sc, room across, room along]` (bars: `cy` = the game rect edge, the plaque is centred in the bar or hugs the edge).

### Rough edges / not done

- The landscape briefing card in `ui.js` (not this pass's area) still reads `SHOOT SIDE TO RELOAD` in every mode; the portrait card is mode-aware.
- Files: `js/core/ammo.js`, `js/core/input.js`, `js/core/save.js`, `js/core/hud.js`, `js/core/ui.js` (settings screen), `js/core/portrait.js`, `js/net.js` (comment), `js/guns.js` (reload timing), `js/main.js`, `index.html`, this file.
