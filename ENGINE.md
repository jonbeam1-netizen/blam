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
| `js/core/ammo.js` | `BLAM.Ammo`: `'unlimited'` / `{mag, reloadTime?, autoReload?}` / `{cap}`; magazine reload is MANUAL and INSTANT (Build 0.005): `startReload()` fills the magazine at once, plays the cosmetic `gun.reload(0.3)`, never locks the trigger; `reloadTime` is ignored; `autoReload: true` refills instantly when the last round is spent |
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
The course deals every registered stage once (seeded shuffle) before repeating one (4+ stages: four different stages), never the same stage twice in a row; the variant is `min(slot, variants - 1)`, except that a repeated stage takes a variant it has not played in this course yet (else one different from its last), e.g. with 3 stages `range:0 alley:1 boneyard:2 alley:2`, with 2 stages `range:0 alley:1 range:2 alley:2`.
`free` (any stage variant at any tier; 6 stage signs per page, a blue `PAGE n/m  NEXT >` sign on the right cycles pages when there are more) -> `briefing` -> `play` -> `results` -> `free`.
`free` -> PRACTICE (first sign, top-left on every page; 5 stage signs per page now) -> `play` (no briefing) -> ESC -> `practiceresults` (AGAIN / BACK) -> `free`. See "Practice".
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

**Stage config fields** (`cfg`): `quota` (hits to clear), `time` (seconds), `ammo` (`'unlimited'` | `{mag, autoReload, reloadTime}` | `{cap}`), `title`, `subtitle`, plus stage-specific tuning. The range uses `hold, quick + mix (mixed hold times), swing, scoot, steps, live (max at once), gap [min,max], bomb (rate), bombCap (max bomb share), kinds (bomb slot weights plain/flip/hidden/decoy), turn + tel (turncoat chance, telegraph s), pat + patMix (pattern-row share, row mix), rel (reload s, ignored), slack (spare shots for a cap), share (quota share), autoReload` and the always-on flags `flipbomb, decoy, hiddenBomb, turncoat, patterns`.
The range derives `quota` from the REAL targets its timeline produced (share per tier 52/64/74/82 % + 2 % per variant, cap 90 %; turncoats count, flip and hidden bombs never) so a quota is always reachable (table in "Range rework 2026-10-29").

Determinism: `Run` seeds `mulberry32(hash(stage|tier|variant) ^ seed)`; `run.timelineHash` lets you compare two machines.

**Hit zones (scoring by the part that was hit).** Set `mesh.userData.zone = 'skull'` (any short word, `[a-z0-9_]{1,16}`) on a target's hittable meshes. `Targets.pick` returns it as `p.zone`; solo, `main.js` calls `run.applyHit(me, tid, run.t, point, zone)`; versus, the shot message carries `z`, the host stores it with the claim, the winning claim's zone goes to `applyHit` and out in `hit.z`, so both tabs score the same. `applyHit` calls `def.points(sp, lt, zone)`; `zone` is `undefined` when nothing was set (or a touch-slop pick), so a stage needs a fallback (Boneyard: flat 200).

**Briefing icons.** `ui.js` (landscape card) and `portrait.js` call `def.drawIcon(cx, cy, r, t)` instead of the bullseye and `def.drawDont(cx, cy, r, t)` instead of the bomb when the stage provides them (draw with `BLAM.HUD.sprite` / `pixImg`, centred on `cx, cy`, about `2r` across; r is 21 / 13 landscape, 8 / 7 portrait). With a custom `drawDont`, the red X shrinks and moves to the icon's lower-right corner so the face still reads. ALLEY: crook head / cook head; BONEYARD: bone skull / dark bomb skull with a lit candle.

**Blocking bullets.** `Targets.pick` raycasts only target meshes, so scenery does not stop a shot by itself. A stage can make cover solid by overriding a target mesh's `raycast(raycaster, intersects)`: call `THREE.Mesh.prototype.raycast.call(this, ...)` and drop the hits that lie behind an occluder (ALLEY `occRaycast`: a crook peeking behind a bystander or a dumpster can only be hit on his exposed part; BONEYARD `heapRaycast`: the part of a skeleton still under the bone heap can't be hit).

**Decoy targets (range, every tier).** `sp.decoy`: a bomb disguised as a target (`BLAM.Props.decoy`, which picks its own look from `Props.DECOY_VARIANTS` once the props pass lands; kind `'bomb'`). Its tell is a nervous wobble (`prop.wobble(lt)`, pure). Shooting it is a bomb hit (life -1) AFTER a 0.3 s build-up (see "Deferred penalty"); never counted toward the quota.

**Deferred penalty (build-up hook, `stage.js`).** A target may define `arm(point, st) -> stage time of its bang`. `Run.applyPenalty` calls it first: a time after now marks the spawn taken at once and queues `{at, by, kind, tid, point}` in `run.deferred`; the life, the points, the `'bomb'` event (shake, LIFE -1, the duck), the `bomb` / `lifeLost` sounds and `tg.explode()` all land at that time (`Run.penaltyNow`, fired before the targets update; `end()` fires anything still pending first, so a bang in the air still costs its life). A second shooter during the build-up gets the same bang time. Without `arm` (or `-1`) nothing changes. The range's decoys use it; versus: the shooter's tab and the host both defer, the other tab gets `pen` -> `tg.explode()`, which runs the same build-up by itself and bangs at the same delay.

### Props (`BLAM.Props`, `js/core/props.js`)

Shared toon-voxel props in the gallery look; full API in the file's top comment. `paddle({color, size, hang, slot})`, `bomb({size, hang, burn})`, `decoy({size, hang, variant})`, `flipbomb({size, hang, color})` return a prop `{ kind, group, pivot, base, arm, face, face2?, spark, fuse, register(target), show(), hide(), setFuse(f), sparkle(t, fast), setFlip(f), wobble(t), chips }`. Rotate `pivot` to swing; call `prop.register(this)` in the Target constructor (registers the face as the shatter part). `Props.warm()` builds every shared geometry at stage load; `Props.mat`, `Props.cspec`, `Props.SCHEMES`, `Props.Geo` / `Props.sdf` for new props in the same style. `Target.shatter()` honours a 5th chip element (size multiplier) and `Targets.burst(p, scale)` is the cartoon bomb explosion.

**Decoy variants (props.js, 2026-10-29).** `decoy()` builds one of six disguises: A sloppy paint (the old decoy), B paper lunch bag, C cardboard cutout, D paper plate mask, E plate held up by stick arms, F crayon drawing. `Props.DECOY_VARIANTS` (default `['a']`) lists the enabled letters, mixed at random (`Math.random`; pass `o.variant` for a seeded / versus-safe pick); `Props.DECOY_NAMES` names them. The prop adds `variant` and `unmask(k)` (0 disguised .. 1 bare bomb, disguise thrown clear; pure in k, resets at 0; no swell or spark flare, the stage does those). B-F carry a longer fuse and register the disguise as an extra hit part (empty chip list). Far pass = a clean plate, near pass = the real material with the rings cut out (skull shows). `Props.warm(which)` prebuilds the enabled variants (`'all'` for every one). Review page: `decoyviewer.html` (picks saved in localStorage `blam.decoyPicks`).

**Decoy round 2 (props.js, 2026-10-29).** Jon picked A, C, E from round 1; B, D, F are PARKED (code kept, off the viewer's main rows). Improved versions are new variant ids next to the old ones (round 1 unchanged): `'a2'` SLOPPY PAINT 2 (thick, complete hand-painted bands, skips / missed patch / drips, the black rings left bare), `'c2'` CARDBOARD RIM (a plate-size cardboard hex rim round an open middle, the bomb inside wears A's thin strokes, two strips of tape-y duct tape over the inner cut), `'e2'` HELD UP 2 (an almost full-size plate with the rings cut out, thicker coloured arms, big mittens, legs, red shoes). Rules for round 2: far away the decoy passes for a plate at a glance and the tell is the skull through ring gaps a bit wider than a real plate's (true holes at both LODs); non-plate parts keep their true colours far away (flat, a touch brighter). `DECOY_VARIANTS` takes any key of `DECOY_NAMES` (so `['c2']` ships C2); the default stays `['a']`. Draw calls: A2 4, C2 5, E2 6 (A2 / C2 + 6 flake meshes only while unmasking). Viewer: plate A1 A2 | plate C1 C2 | plate E1 E2 far, plate A1 A2 C1 C2 E1 E2 near; 1-6 / A C E spotlight, K parked view, V close-up, picks per version (`a1`..`e2`, round-1 letters read as `a1` / `c1` / `e1`).

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
Layouts (`BLAM.Guns.LAYOUTS`): `desktop` (bottom-right corner), `mobile` (bottom-middle, portrait phones), plus `<base>-low` and `<base>-away`, and `desktop-versus` (landscape versus play, between the centre timer and P2's HUD half); `setLayout` takes any of them and the rig eases between them. `G.gunLayout()` in `main.js` picks one per screen.
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

### Target mix (#24) (superseded by "Range rework 2026-10-29")

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
- `Ammo.startReload()` sets `count = max`, `kick = 0.3` (HUD capsule flash), emits `reload {time: 0}` + `reloadDone`, calls `gun.reload(0.3)` (RACK, Build 0.008: 0.3 s to match the 0.40 s reload sounds; a shot snaps it to the end). `reloading` is always `false`, `reloadFrac` 0, nothing ever locks the trigger.
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

## Build 0.007

Rough-spot bundle (owner items + #27). Proof captures: `review/phase3/rough/` (`*z_before_*` = the old look).

- **Course dealing** (`stage.js Course`): with four stages registered every course plays all four once (seeded shuffle). A repeated stage (pool < 4) takes a variant it has not played yet in that course (highest one at or below the slot cap first), else one other than its previous variant. Checked in the page over 2000 seeds each with the real registry (4 stages), and the registry cut to 3, 2 and 1 stages (plus 1 stage with 2 variants): 0 courses missing a stage, 0 back-to-back stages, 0 repeated stage+variant pairs where avoidable, 0 out-of-range variants.
- **Confetti / particles between screens** (`main.js G.go`): `Targets.clearChips()` on every transition out of `results`, `vsresults`, `gameover`, `final`, and on entering `title` / `briefing`. Play -> results keeps its debris (the results card shows the set behind it). Duck-owned particles (his cheer confetti on HIGH SCORES) are the duck's own and stay.
- **Versus results** (`ui.js`, `portrait.js`): banner (`WINNER!` / `LOSER...` / `DRAW!`, landscape scale 4 at y 5), then ONE centred verdict line under it (`UI.vsVerdict`): `YOU WIN` (gold), `<NAME> WINS` (winner's colour) or `EVEN MATCH`; the cards start at y 64, each card title says `(YOU)` on your side and the winner's card gets a yellow outline. Portrait: the verdict sits under the shout in the curtain. No label is drawn on or above a card any more.
- **Versus gun** (`guns.js` `LAYOUTS['desktop-versus']` = desktop with `x 0.29, y -0.34, s 0.6`; `main.js G.gunLayout` uses it for landscape versus PLAY): the gun stands between the centre timer and P2's name label, off P2's counter and ammo capsule. Aiming at the bottom-right corner (P2's own HUD) swings the muzzle over the timer ring; that is the gun's aim rig.
- **Duck shot gag in frame** (`main.js`, no `duck.js` change): measured from the duck's vertices over every frame of the gag at 7 aim directions: his arm / fuming shake and the spring back to idle (1.3-2.0 s) went up to 3 % past the game rect (title left, brief / results right, mini HUD duck left). While the gag plays and until he settles (`GAG_LEN` 2.3 s) the holder eases inward by `GAG_NUDGE` (title +0.05, brief -0.04, results -0.05, mini +0.013 of the rect width) and back. The flop now stays inside the rect as far as his resting pose does (results spot: his idle wing can still graze the right edge by < 1 % at extreme aims, not gag related).
- **Reload wording** (`ui.js`, `portrait.js`): one table `UI.reloadCard(autoReload)` for both briefing SHOTS cards (`SHOOT SIDE` ARCADE only, `RIGHT CLICK`, `SWIPE DOWN`, `TAP SIDES`, `AUTO RELOAD`), named like the settings sign. Stage tips that say `SHOOT THE FRAME (OR R) TO RELOAD!` (range / alley / skyshow `briefing().tip`) are rewritten per mode by `UI.reloadTip(tip, ammo)` (`RIGHT CLICK (OR R) TO RELOAD!`, `SWIPE DOWN TO RELOAD!`, `TAP THE FRAME TO RELOAD!`); stage files untouched.
- **Wood plates readable (#27)**: all dark text on `H.plate` (HIGH SCORES headers, labels, scores and dashes; results stats board) has a 1 px bone outline, landscape and portrait. HIGH SCORES landscape now shows up to 14 rows (four stages = 13 variants + COURSE; it cut off SKY 3 and COURSE).
- Console: screen-transition sweep (title, tiers, free, settings, scores, lobby, course briefing -> play -> gameover -> title, free play, two-tab versus to vsresults -> lobby) logs no errors.
- Files: `js/core/stage.js`, `js/core/ui.js`, `js/core/portrait.js`, `js/main.js`, `js/guns.js` (one layout), `index.html`, this file.


## Build 0.007 additions (props pass 3, Alley rework, sound, settings)
- Props: targets are now HEX PLATES (flat-top hexagonal tin plate, apothem 0.53; lime border, black ring, lime ring, black ring, yellow bull; thin chamfer; steel post + bracket). Paint scheme names: lime / cyan / amber / magenta. Bombs blend between the pass-1 skull up close and the pass-2 big skull far away, handing off between view depths 9.9 and 11.0. Decoys are a plain visible bomb with thin lime/yellow strokes painted on. Title decor plates, flip bombs and the range briefing icon use the plate. Pillar-frame medallions (hud.js buildOuter) match the plate.
- Range: HIDDEN BOMB behind a plate at Very Hard / Insane (`c.hiddenBomb`, `sp.hidden`, takes plain-bomb slots on scoot/pop): first shot scores the plate and reveals the bomb; 0.15 s grace (a shot is a miss), live until 0.6 s, then the usual drop; lane reserved 0.845 s longer. Emits `bombReveal`. Hashes change only for seeds that contain a hidden bomb. The optional crook-reveal was NOT built: the engine refuses a second award on the same spawn id (needs a stage.js hook if wanted).
- Alley: hostage pairs (A arm-round-neck gun-to-head, B crouched behind, C shoved ahead; shared t0; side switch at VH/Insane), the dog is its own bystander on a leash, a 4th bystander (waitress), 13 hiding spots with per-seed weights, no spot twice in a row, bursts and lulls.
- Sound: `audio.js` router + `sfx-kit.js`, `sfx-core.js`, `sfx-stage.js`, `sfx-music.js`. All events covered, duck voice set via a pose watcher, title chiptune, per-stage ambience beds, limiter chain, default volume 0.35, key M mutes. Settings: SOUND (0/15/35/60/100 %) and MUSIC (on/off) signs; keys `sfxVolume`, `musicVolume`, `muted`, `music` via `Save.set`.
- Sound samples: `js/core/sfx-samples.js` (loaded right after `audio.js`) fetches `assets/sfx/manifest.json` once, decodes the wavs on the first audio unlock and registers with `SFX.registerSampler()`; `audio.js`'s `ROUTE` table plays sets for `shot` (`shot.<skin>`), `reload` (`reload.<skin>`, `reloadDone` silent), `hit` (`hitBreak` + `hitDing` +1 semitone per consecutive hit, cap +7, reset on miss / stageStart), `miss` / `ricochet` (`ricochet`, random pan +-0.8, the synth miss stays), `bomb` (synth off, ducks the sfx bus ~4 dB / 0.3 s) and every `duck*` event whose set exists. A missing or undecoded set falls back to the synth recipe.
- Rules: the files are loudness-balanced against each other (`tools/sfx-balance.py`), so the per-event `MIX` trims skip them and one `SAMPLE_GAIN` (0.9) sets the layer; shuffle-bag round robin (never the same file twice running), pitch jitter +-3 % shots/hits, +-5 % duck; limits 4 shots / 4 hits / 1 reload / 2 bombs / 1 duck; a shot cuts a playing reload. `SFX.render()` stays synth-only. Debug: `BLAM.SFX.samples` = `{ ready, sets, missing }`.
- Regenerate `assets/sfx` (wavs + manifest) from `review/sfx-picks` with `tools/sfx-export.py`.
- Sound rules (fix list #56-#66):
  - Gun shots +3 dB: `SHOT_GAIN` (1.41) on top of `SAMPLE_GAIN`, shot sets only. Both are live getters/setters on `BLAM.SFX` for tuning by ear.
  - Every sample starts with a 4 ms gain ramp from 0 (`sfx-samples.js FADE_IN`); a new duck line cuts the last one with a 60 ms fade (other groups 15 ms).
  - Deputy Duck in play: a hit = silent happy hop (no `duckHappy` during play; the title-range hit hop is silent too); every 3rd miss of a run (`run.duckMisses`, a new Run per stage) = `duckReact('laugh', 1.3)` + the `duckHeckle` set (his LAUGH); other misses = nothing; a bomb = the `scared` face for 1.0 s then straight back to rest (forced through `setPose('scared')`, which skips `relief`), silent: `SFX.duckQuiet(1.3)` hushes the pose watcher's scared / relief quacks; a bystander = no duck reaction (the shake and LIFE -1 stay). Angry only follows shooting him (`duckShot`). No practice heckling; no `present` taunt during play.
  - Menus unchanged: the watcher still voices `present` (ta-da, `duckHeckle`), `cheer`, `sad`.
  - `targetIn` / `targetStep` are muted whenever `G.screenName !== 'play'` (the title-range paddles).
  - `SKIN_KEYS` (index fallback) follows the guns.js SKINS order: aquapro, hotrod, ray85, candysix.
  - `tools/sfx-clickcheck.py [glob]` measures sample onsets / tails for clicks (default `assets/sfx/duck-*.wav`); `--fix` fades the flagged sources in `review/sfx-picks` (3 ms in from the sound's start, 10 ms out, same length), then re-run `tools/sfx-export.py`.

## Practice (free play)

- **Mode.** `G.startPractice(tier)` builds `new Run({ stage: 'range', variant: 0, tier, practice: true })` and goes straight to `play` (3-2-1 countdown, no briefing). The tier is the FREE PLAY `TIER` sign, and four tier signs (BEGINNER / ADVANCED / VERY HARD / INSANE) stand in a row over Deputy Duck's head in the play scene: shooting one calls `G.practiceTier(i)` -> `Run.setTier(i)` (live switch; those sign shots are not shots: no ammo, no stats). ESC ends it (`run.end('done')`, shout DONE!), ESC on the results goes back to FREE PLAY.
- **Config.** `def.practiceConfig(tier)` (range: `config(tier, 0)`, so hold / scoot / quick mix / live / bomb share / decoys, flip bombs, turncoats, hidden bombs and pattern rows (all tiers) exactly as free play RANGE 1, plus a 12-round magazine with `autoReload: true`; R / frame / right click still reload) and `cfg.window = 40`. `Run.practiceCfg` sets `time = Infinity` (no countdown, no `tick`, no TIME UP) and `quota = Infinity` (no QUOTA!, no clear / fail).
- **Endless schedule.** `Run.extend(base)`: when every spawn so far has come out, the stage's `timeline()` builds the next 40 s chunk from a fresh seed (`stage|practice|tier|chunk ^ seed`), shifted to start now, ids continuing the timeline index. The spawns still running go in as `cfg.prior` (local times): range `timeline()` reserves their lanes and counts them toward `live`, so chunks join without lane overlaps. `setTier` drops the not-yet-spawned spawns and extends from now at the new tier (on-screen targets finish their motion). Sim over 200 s with a tier switch: no lane overlaps, max gap between spawns 1.45 s.
- **Penalties.** A bomb / bystander still explodes with its sound (a bomb: the duck's silent scared face; pop `BOMB!`) but costs no life and no points; it counts in `bombs`.
- **Deputy Duck** stands in the 3D scene (`placeDuck('practice')`: bottom centre, square to the player, small), plain idle (no heckling, #66; he laughs on every 3rd miss like in play). Shots pick targets first and only hit-test him after a miss (he never blocks a paddle); hitting him plays the usual gag and counts as a miss.
- **HUD** (`hs.practice`): shell (no hearts), a timer ball with an infinity glyph and a lime one-lap-a-minute sweep, `M:SS` above it, a HITS pill, `STREAK n` under the shell; the middle stays free for the duck.
- **Stats** (`Run.practiceResults()`): shots, hits, accuracy %, best streak (`player.streak` / `bestStreak`, reset by a miss, a duck shot or a bomb), bombs shot, time practised. Never saved, no high score, no NEW RECORD.

## Range rework 2026-10-29 (difficulty curve, bombs, patterns)

Jon: Insane had "waaay too many targets and no bombs". The curve now runs the other way: higher tiers = FEWER targets at once, bigger gaps, shorter holds, a higher bomb share, more pattern rows, a higher quota share and less spare ammo. NO TIER GATES: decoys, flip bombs, turncoats, hidden bombs and pattern rows come at every tier, just rarer and slower low down. All of it lives in `js/stages/range.js` (`TIER_P`, `config`, `timeline`, `Paddle`); `stage.js` got the deferred-penalty hook only (see "Deferred penalty"). Everything stays a pure function of (seed, tier, variant) and the clock.

`TIER_P` (variant 0; variants: hold x(1 - 0.06 v), scoot x(1 - 0.05 v), quick x(1 - 0.04 v), live +1 at v3, bomb roll +0.04 at v >= 2, share +0.02 v, cap 90 %):

| tier | time | hold | quick / mix | swing | scoot | steps | live | gap s | bomb roll / cap | kinds plain/flip/hidden/decoy | turn / tel | pat / patMix all/decoy/bomb | slack | share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BEGINNER | 42 | 1.10 | 0.40 / 0 | 0.62 | 0.27 | 4 | 4 | 0.95-1.6 | 0.30 / 18 % | .50/.18/.15/.17 | 6 % / 0.60 s | 15 % / .5/.25/.25 | 10 | 52 % |
| ADVANCED | 38 | 0.80 | 0.30 / 10 % | 0.50 | 0.20 | 5 | 4 | 1.1-1.75 | 0.44 / 26 % | .42/.20/.17/.21 | 10 % / 0.50 s | 22 % / .4/.3/.3 | 6 | 64 % |
| VERY HARD | 35 | 0.62 | 0.24 / 25 % | 0.40 | 0.15 | 5 | 3 | 1.25-1.95 | 0.60 / 35 % | .34/.24/.18/.24 | 18 % / 0.42 s | 32 % / .3/.35/.35 | 3 | 74 % |
| INSANE | 32 | 0.50 | 0.20 / 30 % | 0.32 | 0.12 | 5 | 3 | 1.4-2.2 | 0.80 / 48 % | .28/.26/.20/.26 | 30 % / 0.36 s | 40 % / .2/.4/.4 | 1 | 82 % |

Mix rules (`timeline`): bombs <= `bombCap` of all spawns so far (rows included); never two PLAIN bombs in a row, never three bombs of any kind in a row (a decoy / flip / hidden bomb may follow a bomb); a single bomb only while bombs up <= real targets up (a lone bomb on an empty range is allowed: hold fire). A bomb slot rolls its kind from `kinds` (a flip bomb needs room for its burn, a hidden bomb a floor plate; else it falls back to flip / decoy).
- **Turncoat** (`sp.turn`, `sp.tel`, single real targets): the flip bomb the other way round. A plate (flipbomb prop, plate side up) for the first half of its stay (>= tel + 0.15 s), then the TELEGRAPH for `tel` s (the plate wobbles harder and harder, a fuse spark ticks on its top corner, `bombReveal` + a spit of sparks at its start), then it flips (0.12 s) into a lit bomb for >= 0.25 s. Kind is a pure function of lt (target until half way through the flip). Counts as a real target for the quota; +50 if hit before the turn; shot after the turn it is a plain bomb (instant bang).
- **Pattern rows** (`sp.pat` = row index per timeline chunk, `sp.patKind`, `sp.pi`, `sp.patMix`; members share `t0`):
  - `V` COLUMN: 4-5 scooting paddles in one floor lane at successive stops of a 5-stop track (front `pi 0` at stop N-1, the back one at stop 0), all on one beat; each drops after holding at the near stop. `sp.aheadD` = id distance to the member in front (relative, so practice's id shift keeps it): a member stands tilted back 0.95 rad and is NOT shootable while the one in front is alive and not yet dropping; then it stands up in 0.16 s (shootable from 60 %). The front is always a real target. Column members score by their real stop (`pose().step = sp.k + k`).
  - `H` ROW: 3-5 across ADJACENT free lanes (floor, or the ceiling rail for `drop`), one motion, one side, one depth, in step.
  - Mix per row: all targets / 1-2 decoys / one plain bomb (never in front of a column). A row starts only when <= live - 2 spawns are up; its members count toward `live` (the stream waits for it to thin out) and toward the quota. Row share is held near `pat` (`rowSpawns + 4.5 <= pat * (spawns + 4.5) + 2.5`).
- **Hidden bombs** (#41) and **flip bombs** (#24): unchanged mechanics, now at every tier.
- **Decoy build-up** (`Paddle.arm` / `updateArm`, `DECOY_ARM` 0.3 s, `DECOY_UNMASK` 0.16 s): shot, the decoy freezes where it was hit, plays `bombReveal` + a spark spit, calls `prop.unmask(k)` (0 disguised .. 1 bare bomb, props pass; while that is missing it hides the decoy and swaps a plain `Props.bomb` in), settles square, swells 16 % with the spark flaring, then explodes: burst, shake, `bomb` boom, LIFE -1 at the bang (deferred penalty). Not shootable during the build-up. A rival's decoy (`explode()` without `arm`) runs the same build-up by itself (`autoBoom`).
- Briefing tip per tier: FAR AWAY = MORE POINTS / BURNT FUSE = BOMB FLIPS: SHOOT IT! / SPARKING PLATE = TURNING BOMB! / COLUMN? SHOOT THE FRONT ONE FIRST! (reload / hidden-bomb tips unchanged).

Measured in the page (`config(tier, v)` + `timeline(c, mulberry32(hashStr('range|' + tier + '|' + v) ^ seed))`), variants 0-3 x seeds 1-6 = 24 runs per tier. Before -> after:

| tier | spawns/run | real targets | bombs/run (plain / decoy / flip / hidden) | bomb share | turncoats | rows/run V / H (row share) | quota | cap slack (v2) | mean hold s | avg up / max up |
|---|---|---|---|---|---|---|---|---|---|---|
| BEGINNER | 28.8 -> 30.6 | 27.3 -> 26.0 | 1.5 (1.5/0/0/0) -> 4.5 (2.0/1.2/0.7/0.6) | 5 % -> 15 % | 0 -> 1.3 | 0 -> 0.6 / 0.4 (13 %) | 15.1 -> 14.4 | 10 -> 10 | 2.98 -> 2.95 | 2.9 / 8 |
| ADVANCED | 38.6 -> 26.8 | 32.8 -> 21.0 | 5.8 (5.8/0/0/0) -> 5.8 (2.0/1.8/1.3/0.7) | 15 % -> 22 % | 0 -> 1.9 | 0 -> 0.9 / 0.6 (21 %) | 19.3 -> 14.2 | 8 -> 6 | 2.22 -> 2.42 | 2.3 / 7 |
| VERY HARD | 64.0 -> 25.3 | 51.0 -> 18.0 | 13.0 (6.0/2.6/2.8/1.5) -> 7.3 (2.6/3.0/1.1/0.6) | 20 % -> 29 % | 0 -> 1.6 | 0 -> 1.2 / 0.8 (32 %) | 31.2 -> 13.9 | 6 -> 3 | 1.18 -> 1.70 | 1.8 / 6 |
| INSANE | 78.2 -> 23.1 | 60.7 -> 14.6 | 17.5 (8.1/3.8/4.3/1.4) -> 8.5 (1.9/4.2/1.6/0.8) | 22 % -> 37 % | 0 -> 0.7 | 0 -> 1.3 / 1.2 (41 %) | 38.2 -> 12.5 | 4 -> 1 | 1.02 -> 1.38 | 1.5 / 6 |

Mean hold = shootable stay per spawn (holds + scoots); it rises at the top tiers because the 6-7 live stationary spawns and half-quick mix are gone and columns ride 5 stops; the per-stop hold itself drops 1.1 / 0.8 / 0.62 / 0.5.
Clearability: a greedy earliest-deadline solver (one shot per 0.32 s, 0.22 s reaction, never a bomb, a column member only after the one in front is gone, a turncoat only before its turn) reaches the quota on every run, 240 runs per tier (60 seeds x 4 variants), worst margin 10 / 6 / 3 / 1 targets; a slower bot (0.5 s / 0.35 s) misses the Insane quota on 3 of 240. Hits from flipped flip bombs and hidden-bomb plates come on top. In-page bot runs (shoot every live target 0.2 s after it turns shootable): Insane v2 (cap = quota + 1) 16 shots, 16 hits, quota 15, cleared; Insane v0, Beginner v0, Advanced v2 cleared; no errors.
Practice: 6 chunks x 40 s per tier with `prior` and the id shift: no lane overlaps, every `aheadD` points into its own column, t0 order kept; a tier switch mid-run keeps spawning.
