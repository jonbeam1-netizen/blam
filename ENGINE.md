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
| `js/core/hud.js` | `BLAM.HUD`: cached 3x5 / bold text, sprites, ammo magazine + casings (#72; the old ammo shell is kept but unused), hearts, HIT badge (0.35 s, beside the shell), timer ball, quota pill, versus counters, crosshair, briefing/results panels (stone banner, red panel, sticker, plate, starburst, icons), `drawPlay(hs)`, `drawOuter(frame, t, hs)` |
| `js/core/targets.js` | `BLAM.Targets`: chips (InstancedMesh), bullet-hole decals with a rim, sparks, bomb puff, `Target` base class, `pick(ray, targets)`, `Sign` (shootable menu board) |
| `js/core/stage.js` | `BLAM.Stage`: tiers, `mulberry32`, stage registry, env cache, `Run` (one stage being played, scoring, versus adjudication), `Course` |
| `js/core/fallback.js` | placeholder box gun + box duck behind the same API as `guns.js` / `duck.js` |
| `js/core/ui.js` | `BLAM.UI`: title marquee, `Menu` of shootable signs, DOM `prompt`, all screens, `UI.tall()` |
| `js/core/portrait.js` | tall-phone layouts: `drawPortrait(t, L)` for every text screen, drawn on the outer canvas (see "Check pass 0.002") |
| `js/core/props.js` | `BLAM.Props`: shared toon-voxel gallery props (bullseye paddle, iron bomb, decoy, flip bomb), one shared toon material; API at the top of the file (see "Props" below) |
| `js/stages/range.js` | Stage 1, the shooting range (plates, bombs, decoys, flip bombs from `BLAM.Props`; the difficulty director, tricks, lights out, see "Range difficulty spec build 2026-10-29") |
| `js/stages/alley.js` | Stage 2, THE ALLEY: cardboard crooks pop out of cover, bystanders (`kind 'bystander'`) walk through hands up; occluders block bullets |
| `js/stages/boneyard.js` | Stage 3, BONEYARD: skeletons rise from a bone heap, skull 300 / ribs 100 hit zones, bomb skulls, flip bombs, thrown skulls, bats |
| `js/stages/beehive.js` | Stage 5, BEE HIVE: a honeycomb of flip-in cells (plates / bombs / decoys from `BLAM.Props`), larvae that ripen and hatch, cosmetic bees with a frenzy; see "BEE HIVE (stage 5)" |
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

**Stage config fields** (`cfg`): `quota` (hits to clear), `time` (seconds), `ammo` (`'unlimited'` | `{mag, autoReload, reloadTime}` | `{cap}`), `title`, `subtitle`, plus stage-specific tuning. The range's own fields are the difficulty dials of `TIER_P` (see "Range difficulty spec build 2026-10-29": `win, swing, lv, steps, scoot, live, gap, burst, bgap, pause, hop, alt, adj, decep, kinds, bombCap, turn, tel, trick, beat, snake, pp, wall8, weave, ball, col4, lights, loWin, spare, share, rel`) and the always-on flags `flipbomb, decoy, hiddenBomb, turncoat, patterns`.
The range derives `quota` from the REAL targets its timeline produced (share per tier 55/60/64/68 % + 2 % per variant, cap 90 %; turncoats and column members count, flip / hidden bombs and the duck cameo never); the cap variant's ammo = quota + `spare`.

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
ALLEY: `bystanderIn {u, who}, pigeon {u}`; BONEYARD: `skullThrow {u}, skullBonk, boneRattle {u}, bombFlip {u}, batFlap {u}`; BEE HIVE: `beePass {u}, beeFrenzy {u}, beeHit {u}, larvaHatch {u, kind}, honeyDrip {u}` (+ the ambience bed `beehive`).
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

## Range rework 2026-10-29 (difficulty curve, bombs, patterns) -- SUPERSEDED by "Range difficulty spec build 2026-10-29" (kept for the record)

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

## Magazine HUD + casings (#72, 2026-10-29)

Jon: "how many shots you have left is hard to follow, a number on a bullet in the corner of your eye. Have a clip/magazine with bullets in it that casings fly out as you shoot." Look: STYLE.md section 8.
- **Widget** (`hud.js`): `HUD.magPrep(player, t)` reads `player.ammo` and returns `{ st, g, n, inf, am }`; `HUD.mag(prep, x, yBottom, p, mirror, t, kind)` draws it (returns the geometry, `g.W` / `g.H`). `HUD.magGeom(cap)`: <= 8 rounds 1 column, 9-16 2, <= 24 3, <= 32 4 (8 rows max), `W = 13 cols + 11`, `H = 5 rows + 9`. Body / rounds are `pixImg`-cached (a handful of variants: geometry x mirror x outline colour x player), rounds are drawn one `drawImage` each.
- **State** per player object (WeakMap, so a new `Run` starts clean): last count, max (the ammo's `max`, or `run.cfg.ammo.mag / cap` for the rival's display-only `remoteAmmo`), queued casings, reload start. A count that goes UP = a reload (the swap animation, `MAG_REL` 0.34 s, purely cosmetic: the reload itself stays instant, nothing waits on it). A count that goes DOWN on a player nobody called `eject` for (the versus rival) queues casings.
- **Layout** (`strip`): the clip sits at the strip's left edge (P2 right edge, mirrored), bottom on the frame bottom (landscape, `by + 35`) or `by + 45` (portrait strip). Hearts, HIT badge, versus counter / name, STREAK, status and portrait score now start 4 px right of the clip (P2: left of it). Timer ball, quota pill, practice clock unchanged. Labels over the clip: RELOAD (yellow during `ammo.kick`, red/bone when the mag is empty), EMPTY (cap), the infinity glyph (unlimited), the count (caps past 16).
- **Casings**: `HUD.eject(player)` is called by `main.js G.playFire` right after `ammo.use()` (real shots only: not frame reloads, dry clicks or practice tier signs). The next clip draw spawns it: on the desktop HUD (not touch, not portrait) from `HUD.gunEject()` = `gun.ejectPoint()` (guns.js: the skin's `port` in world space + `portDir`, kind = skin id) projected through `R.camera`; otherwise from the clip's top. `HUD.drawCasings(layer, t)` steps and draws them: `'hx'` at the end of `drawPlay`, `'ox'` after the portrait strip in `drawOuter`. Max 8 alive.
- The 3D gun still throws its own tiny voxel shell (`fx.shell`, AQUA PRO / HOT ROD) from the same port; the HUD casing rides on top of it.
- Files: `js/core/hud.js`, `js/guns.js` (`ejectPoint()` only), `js/main.js` (one `H.eject(run.me)` line in `playFire`), STYLE.md, this file.

## Range difficulty spec build 2026-10-29

Built against DESIGN-STAGES.md section 5 (Jon's spec): hard = PACE, PLACEMENT and DECEPTION, not count. Yesterday's "fewer targets per tier" curve is gone. All of it lives in `js/stages/range.js`; no other engine file changed (`stage.js`, `targets.js`, `render.js` untouched). Everything that decides a spawn is still a pure function of (seed, tier, variant) and the stage clock; `timeline()` burns three rng draws first (mulberry32's first draw barely mixes nearby seeds).

**Dials (`TIER_P`, variant 0; variants: `win` and `scoot` x(1 - 0.05 v), `live` +1 at v3, `decep` and `trick` +0.02 v, `share` +0.02 v, cap 90 %):**

| | BEGINNER | ADVANCED | VERY HARD | INSANE |
|---|---|---|---|---|
| time s | 45 | 40 | 36 | 32 |
| `win` pop window (s fully up) | 1.30 | 1.00 | 0.70 | 0.45 |
| `swing` / `lv` entrance / exit s | 0.50 / 0.32 | 0.40 / 0.28 | 0.30 / 0.24 | 0.22 / 0.20 |
| `live` (singles up at once) | 4 | 3 | 3 | 2 |
| `gap` s / `burst` chance / `bgap` s | 0.5-0.95 / 25 % / 0.3-0.45 | 0.55-0.95 / 28 % / 0.28-0.4 | 0.5-0.9 / 32 % / 0.25-0.35 | 0.45-0.8 / 35 % / 0.22-0.3 |
| `pause` after a burst / trick s | 0.6-1.0 | 0.75-1.2 | 0.9-1.4 | 1.0-1.5 |
| `hop` aim travel (x screen diagonal) / `alt` / `adj` | 0.08-0.26 / 0.25 / 0.12 | 0.22-0.42 / 0.45 / 0.15 | 0.38-0.6 / 0.65 / 0.17 | 0.52-0.85 / 0.85 / 0.2 |
| `decep` single = bomb / `bombCap` | 13 % / 20 % | 19 % / 27 % | 25 % / 33 % | 31 % / 38 % |
| `kinds` plain / flip / hidden / decoy | .42/.20/.16/.22 | .36/.22/.18/.24 | .30/.24/.20/.26 | .26/.26/.20/.28 |
| `turn` / `tel` (turncoat chance / telegraph s) | 5 % / 0.40 | 8 % / 0.35 | 11 % / 0.30 | 15 % / 0.25 |
| `trick` chance per beat | 24 % | 30 % | 35 % | 40 % |
| `beat` / `snake` / `pp` s between pops | 0.62 / 0.70 / 0.75 | 0.50 / 0.55 / 0.60 | 0.40 / 0.42 / 0.48 | 0.32 / 0.34 / 0.40 |
| `wall8` stay / `weave` speed / `ball` crossing s | 1.7 / 1.0 / 4.4 | 1.35 / 1.2 / 3.8 | 1.05 / 1.45 / 3.2 | 0.85 / 1.7 / 2.6 |
| `col4` (a later column hides a decoy 4th) | 45 % | 55 % | 65 % | 75 % |
| `lights` [one, a second] / `loWin` | [25 %, 0] / 1.4 | [50 %, 0] / 1.1 | [85 %, 35 %] / 0.85 | [100 %, 60 %] / 0.65 |
| `spare` shots over the quota | 8 | 5 | 3 | 2 |
| `share` quota share / `rel` reload allowance s | 55 % / 0.75 | 60 % / 0.70 | 64 % / 0.62 | 68 % / 0.55 |

Scoot singles take 2 stops (hold = (win - scoot) / 2 each); stationary motions stay `win`. The shootable span the player gets = 0.85 swing + win + 0.7 lv (`spanOf`). Singles' motion mix (`MOTIONS`): scoot 28 %, side 26 %, drop 23 %, pop 23 % (swing-ins = side + the scoot's swing-up, about 55 % of singles). `rel` is not the reload (that is instant since 0.005), it is the time the pacing allows the player to reach for it.

**The director (`timeline`).** The stream is a run of beats: a single, a burst of 2-3 singles, or a trick, with an anticipation pause after a burst or a trick, plus LIGHTS OUT at seeded times. Rules:
- *Aim travel*: a single (and a column, and each lights pop) takes the free (motion, lane, depth stop) slot whose screen point (`scr()`, a pure projection of the steady camera) is closest to the wanted hop from the last plate the player was made to aim at, preferring the other side (`0.35 alt`) and the other height (`0.2 alt`, split at a mid-range line), with a +2 penalty inside `adj` of any plate already up (so never right next to it unless a trick says so). No plate overlaps another on screen (screen circles, every stop of a scoot), no two carriages share a lane track.
- *Fair bombs*: the old mix rules (bombCap, never two plain bombs in a row, never three bombs in a row, bombs up <= real plates up); a bomb takes the slot the aim rule picks, i.e. where your next target should be.
- *Reload-aware* (magazine variants 1 and 3; practice auto-reloads, so off there): the director counts the shots a perfect player spends (real plates, hidden-bomb plates, the duck). The plate after a full magazine waits `rel` s after the last shot and stays up >= `rel + 0.45` s; in a column that member gets `revW >= rel + 0.45`; a sequenced trick (row, snake, ping-pong, lights pops) shifts that pop and every later one back by `rel + 0.1`; an all-at-once trick (wall, weave) stays `rel` longer. A lights-out starts only with >= 5 rounds left in the magazine.
- *Tricks* take the range to themselves: they start when it is empty (`clearAt`) and book it until they end (a column only until its front drops: its hidden members keep their lane booked as "ghosts", which do not count toward `live`).
- *Turncoats / flip bombs* are stationary with their own stay (turncoat: a plate for max(0.3, 0.75 win), then `tel` of telegraph, the 0.12 s flip, 0.35 s of bomb; flip bomb: max(0.5, 0.6 win) of bomb, the flip, max(0.45, 0.8 win) of plate).

**Tricks** (spawn fields `pat` = trick index, `patKind`, `pi`, `trick` = sub-kind; weights C 1.6, R 1.5, S 0.9, P 0.8, W 0.5, X 0.35, B 0.6, the last trick x0.15; caps W 2, X 1 (2 from Very Hard), B 2):
- `C` **COLUMN (#71)**: 4-5 plates in ONE slot (pop / drop / one-stop scoot, stops 1-3), all with the front's pose. Members behind are INVISIBLE and unshootable (`sp.aheadD`, `sp.col`); shot, the next one is just standing there, shootable at once, and stays `revW` (max(0.5, win)) from that moment (`Paddle.ext`, the extra stay, a pure function of the reveal time). A member checks the one in front: alive -> hidden; shot (dead, or gone and in `run.taken`) -> revealed; gone and NOT taken (it dropped unshot) -> it ends too, never seen. Members sit 0.05 world units behind each other along the view ray (no z fight with the front's folding carriage). First column of a round: a clean 4; later: clean 4-5 or (`col4`) a 4 whose 4th is a decoy. No telegraph. `t1` of member j = front end + the sum of (revW + 0.7 lv) (the latest it can stand).
- `R` **ROW on a beat**: 3-5 across adjacent lanes at one depth, one motion, popping in order every `beat` s (stay max(win, 1.2 beat)). First row of a round: clean (teaches the beat); later: clean 20 %, a DECOY on the beat (pop 3+) 40 %, OFF BEAT 40 % (the 4th comes at 0.45 beat or 1.9 beats).
- `S` **SNAKE**: 5-7 (+1 at Insane) pops along a path every `snake` s: `loop` = across the floor row and back along the ceiling rail (around the range), `zig` = across the lanes with the depth alternating (up one, down the next; flattened where two co-visible pops would touch). Stay = min(win, 2 snake - 0.05 - swing - lv). The last one a bomb 30 % + 8 % per tier (60 % of those decoys).
- `P` **PING-PONG**: two slots in adjacent lanes, 4-6 pops alternating every `pp` s (each gone before its slot is reused), then a bomb on the beat in the next slot (a decoy 20 % + 7 % per tier).
- `W` **WEAVING WALLS** (`mo 'wall'`, `sp.w`): two racks of 3 hanging plates (rods to the ceiling) swing down at the far end of lanes 1 and 5, travel down to about z -7.6, then cross to the other side; A goes 0.8 back and B 0.8 forward while crossing, the plates at offset heights, so they weave past each other. A decoy among them from Advanced (20 % + 15 % per tier).
- `X` **THE WALL**: 8 at once (5 popping on the floor + 3 hanging), stay `wall8`, 1-3 decoys.
- `B` **BALLOONS** (`mo 'balloon'`, `sp.b`): one, or a line of 3-4 (65 % + 5 % per tier), floating across near the front (z -2.9..-3.9) in `ball` s; payload a plate (200 pts), sometimes a bomb / decoy. The **DEPUTY DUCK CAMEO** (`sp.duck`: a voxel placeholder duck with a sheriff hat and a star, built in range.js; duck.js untouched) rides one in about 20 % of rounds (planned per round; forced late in the round if no balloon trick came), counts as a hit (bonus, +500, never in the quota's base). A shot payload's balloon floats off.
- **Turncoats, made fair**: telegraph `tel` s (the fuse spark lights and ticks on the plate's corner, the plate shakes and jitters harder and harder, `bombReveal` + `turnTick {n: 0..2}`), still a plate you may shoot (+50); during the 0.12 s flip NOT shootable at all (no hit, no bomb); then a plain lit bomb. Flip bombs are unshootable mid-flip too.
- Not range tricks: bomb swap, quick draw (dropped), count plates, shuffle (later level / stage ideas).

**LIGHTS OUT (#73)** (`patKind 'L'` pops + one event spawn `sp.fx 'lights'` -> `makeTarget` builds a `LightsFx`, kind `'fx'`, no hit parts). 2-4 pops (Beginner / Advanced 2-3, Very Hard / Insane 3-4) under a spotlight, `loWin` stay, max(0.55, 0.8 loWin) apart, 0.5 s of darkness first, the event 2-4 s, then the lights come back over 0.3 s. Never before 6.5 s, never back to back, only on an empty range, only with >= 5 rounds in the magazine; decoys among the pops (25 % + 10 % per tier, never the first). The spotlight per pop: arrival `glide` (0.22 s ease from the last spot) / `snap` (0.14 s dark, then on) / `empty` (lights the spot 0.35-0.6 s before the plate swings up into it; 30 % + 10 % per tier of those then CUT the light 0.2-0.35 s after it is up); after a hit `next` (jumps to the next pop at once) / `stay` (stays on the empty spot, the next plate pops unlit for 0.3 s) / `away` (wanders to an empty spot, the next plate pops unlit for 0.45 s); weights arrival .45/.30/.25 (Insane .40/.25/.35), after .70/.15/.15 (Insane .50/.20/.30). An unshot plate keeps the light at least `minLit` (0.75 / 0.6 / 0.5 / 0.4 s after it is up). The spot's path is a pure function of the event schedule + the pops' hits (`run.taken`, shared in versus); only the light, never a spawn, depends on play.
*Drawing*: one camera-child quad at 1.55 units (in front of the range, behind the gun at 1.0 and the mini duck at 1.4) that MULTIPLIES what is behind it (custom blending: rgb x the quad's colour, destination alpha kept, so the post pass's dither classes survive; no depth write; renderOrder 1000, after the env). Dark `uDark` 0.30 (Insane 0.24) everywhere, a hard disc of light (0.92 world units at the spot's depth, a 1.5 px rim at 0.7) and a dimmer beam (0.56) from the ceiling above the spot, all on the 426 x 240 grid. The HUD is composited after the post pass, so it stays bright; fuse sparks use a transparent clone of `MAT.glow` at renderOrder 1001, so bombs still spark in the dark. No `render.js` change. The quad hides itself when no event has updated it for 0.3 s (a run that went away).

**Briefing**: `briefing().tip` is now the room-for-error line, a line of its own on both cards: cap variant `ROOM FOR ERROR: 5 SHOTS` (spare shots over the quota), the other variants `ROOM FOR ERROR: 14 TARGETS` (real targets you may let go); `NO ROOM FOR ERROR!` at 0 (never in the main game). The tier's teaching tip moved to `briefing().hint` (not drawn: ui.js / portrait.js draw only rule + tip); `room`, `spare`, `spareUnit` are returned too, for a dedicated HUD line later.

**SFX events added** (only emitted; no recipe yet, the router ignores unknown names): `turnTick {u, n}` (turncoat telegraph ticks; `bombReveal` still plays at its start), `lightsOut`, `lightsOn`, `duckCameo {u}` (the cameo duck floats in), `duckCameoHit {u}` (it was shot; the normal `hit` plays too).

**Points**: stop points as before (+100 flipped flip bomb, +50 turncoat before its turn); balloons 200, weaving walls 150, the duck 500. (The old `quick` +50 went with the quick targets.)

**Measured** in the page with `review/tools/range-measure.js` (`rangeMeasure({ seeds: 30 })`), variants 0-3 x seeds 1-30 = 120 runs per tier. Travel = mean screen distance (426 x 240 px, diagonal 489) between consecutive required plates (all / singles only). Solver: a greedy earliest-deadline player (0.22 s reaction, 0.2 s between shots, aim 0.06 + 0.32 x distance / diagonal s, `rel` s per reload, never a bomb or decoy, column members only after the one in front, turncoats only before the turn), run perfect and with `spare` misses spread out (cap enforced in the cap variant).

| tier | spawns/run | real | bombs/run plain / decoy / flip / hidden | turncoats | quota | spare | window s / span s | travel px all / singles | swing-ins singles / all | lights/run (none / two) | duck rounds |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BEGINNER | 44.6 | 39.7 | 1.85 / 1.64 / 0.56 / 0.57 | 0.96 | 23.1 | 8 | 1.24 / 1.89 | 114 / 131 | 55 % / 37 % | 0.33 (68 % / 0) | 22 % |
| ADVANCED | 41.8 | 35.9 | 2.13 / 2.09 / 0.88 / 0.58 | 1.59 | 22.6 | 5 | 0.99 / 1.52 | 133 / 169 | 53 % / 36 % | 0.50 (50 % / 0) | 22 % |
| VERY HARD | 40.6 | 33.5 | 2.01 / 2.78 / 1.14 / 1.02 | 2.17 | 22.4 | 3 | 0.73 / 1.15 | 166 / 204 | 55 % / 41 % | 1.12 (17 % / 29 %) | 18 % |
| INSANE | 37.4 | 30.2 | 1.77 / 3.16 / 1.16 / 0.96 | 2.25 | 21.4 | 2 | 0.53 / 0.86 | 183 / 229 | 55 % / 42 % | 1.60 (0 % / 60 %) | 21 % |

(window = the mean single stay, incl. the longer turncoat / flip / post-reload stays; the dial itself is 1.3 / 1.0 / 0.7 / 0.45.)

Tricks per run (B / A / VH / I): column clean 0.68 / 0.79 / 0.63 / 0.52, column with a decoy 4th 0.05 / 0.10 / 0.12 / 0.06; row on the beat 0.73 / 0.67 / 0.63 / 0.47, decoy on the beat 0.10 / 0.13 / 0.03 / 0.04, off beat 0.11 / 0.07 / 0.07 / 0.03; snake 0.62 / 0.65 / 0.37 / 0.40 (a bomb last 0.16 / 0.25 / 0.21 / 0.25); ping-pong then a bomb 0.55 / 0.59 / 0.46 / 0.29 (a decoy 0.14 / 0.15 / 0.17 / 0.12); weave 0.40 / 0.22 / 0.22 / 0.20; the wall 0.23 / 0.18 / 0.14 / 0.07; balloons 0.52 / 0.50 / 0.38 / 0.45 (lines 0.22 / 0.24 / 0.18 / 0.25).
Solver: all 480 runs clear. Worst margin over the quota with the spare misses: cap variant exactly 0 (cap = quota + spare by construction, still cleared), other variants +10 / +11 / +8 / +5 targets; a slower bot (0.32 s reaction, 0.3 s between shots, aim 0.12 + 0.5) also clears all 480 with its spare misses. Reload rule audited on variants 1 / 3 (685 post-magazine plates): none with less than rel + 0.35 s to be shot, the tightest 0.35 s at Insane. Screen overlaps of co-visible plates (outside columns / walls / balloons): 0. Timeline hashes repeat (same seed -> same timeline); practice: 10 chunks with a tier switch, no lane overlaps, every column / lights link inside its chunk.
In-page play checks (stage clock stepped from a script, `?slow=0.25`): a Beginner column (front only visible; shot, the next stands there; four in a row), ping-pong L2-L1-L2-L1 then a bomb in L2, a loop snake, a fair turncoat (plate to 1.875 s, telegraph from 1.475 with ticks, unshootable 1.875-1.995, a bomb after), a Beginner lights-out with the `away` behaviour, an unshot Insane column dropping unseen, an Insane lights-out, a weave crossing, a balloon line with the duck (+500); a bot through `G.playFire` cleared Insane RELOAD DRILL (3 reloads, one deliberate decoy shot -> build-up -> LIFE -1); no console errors.

## BEE HIVE (stage 5, 2026-10-30)

Built against DESIGN-STAGES.md section 6 (and the section 5 range rules). All of it lives in `js/stages/beehive.js`; sounds in `js/core/sfx-stage.js`; one script tag in `index.html` (after `skyshow.js`, so the registry order is range, alley, boneyard, skyshow, beehive: stage 5, and FREE PLAY lists HIVE 1-3 on its own pages). No engine file changed.

**Set.** A giant honeycomb in a wooden hive frame fills the range at dusk. The comb's mouth plane is at z -6.6 (view depth ~11.6, past the props' LOD band 9.9-11.0, so bombs and decoys wear their FAR look: a decoy passes for a plate at a glance). 28 LIVE cells (7 columns x 4 rows, flat-top hexes, apothem 0.86, dark mouths, 1.35 deep tubes; Beginner uses the middle 5 columns) inside a ring of honey-filled cells (looks only), a sign "B.L.A.M. APIARY" on the left upright, a hive box front left, a smoker on a post right (smoke chips), grass, a dusk sky with a low sun, a tree line and a fence (fog-free basic material, env dither class), honey drips (one InstancedMesh, wall clock; a falling drop emits `honeyDrip`, at most every 7 s). Chips from hits fall to the yard (`GROUND_Y` -3.9): the stage spawns its own chips (`chipShatter`, `bombBurst`) because `Target.shatter` / `Targets.burst` bounce chips on y = 0, which is mid-comb here.

**Cells.** A cell item is a `BLAM.Props` prop at size 1.2 (plate apothem 0.64) with its base and post hidden, mounted on a HINGE at the cell mouth's bottom edge: `rx -pi/2` lies in the cell, 0 stands up (entrance easeOutBack, a settling wobble, exit inCubic; shootable from 15 % of the entrance to 70 % of the exit, like the range). Pose = `cellPose(sp, lt, o, ext)`, pure. Kinds: plate, plain bomb, decoy (`P.decoy({ variant })`, the variant a pure function of the spawn id from `Props.DECOY_VARIANTS`, i.e. Jon's a2 / c2 / e2), hidden bomb (the plate breaks, a bomb springs up in the same cell for 0.6 s, then flips back in), and the decoy BUILD-UP exactly as the range (`arm()` -> deferred penalty: freeze, `unmask` over 0.16 s, swell + flaring fuse, the bang and LIFE -1 at 0.3 s; `bombReveal` at the shot).

**Larvae.** `sp.larva = { ripen, hatch: 'bee' | 'target' | 'bomb' }`, `sp.at = ripen + 0.1` (the item starts there). While it ripens (Beginner 3.6 s .. Insane 2.2 s, +-10 %): a curled grub grows from 0.42 to 1.0 and wriggles faster, a glow hex at the back of the cell steps umber -> walnut -> chestnut -> rust -> orange -> amber -> yellow -> lemon, a dark ring round the mouth lights its six segments one by one clockwise from the top; in the last 0.5 s the grub shakes, the glow flickers lemon and the rim blinks. Then the hatch (wax / skin chips, `larvaHatch {kind}`) and 0.1 s later the item: a BEE flies out and off the comb (cosmetic, never shootable), a TARGET plate (stay max(win, 0.5), +150), or a BOMB (stay max(0.6, 1.2 win)). Nothing tells the kind before the hatch. Hatch weights [bee, target, bomb]: .30/.55/.15, .30/.50/.20, .28/.46/.26, .25/.45/.30 (ROYAL JELLY: bees x0.8, targets x1.15).

**Bees (cosmetic).** `BEES`: two InstancedMeshes (bodies, wings) for up to 14 swarm bees + 6 slots; each bee walks a precomputed leg list (crawl / pause on the comb face, hops: short flights up to 2.4 in front of it, past plates and bombs) on its own clock = wall time x `?slow` x the frenzy boost. They never block a shot. The swarm is a timeline spawn (`kind 'swarm'`, t0 0, a target of kind `'fx'`): its invisible proxy mesh's `raycast` is the bee hit test (a bee within 5.5 game px of the ray) and it NEVER reports an intersection, so the engine never scores it; when a bee is on the ray and no live cell target is (it ray-tests them itself), it plays `beeHit` and starts the FRENZY: 2 s, all bees x2.7 speed and jitter, wings flicker faster, `beeFrenzy` (a loud buzz swell); a shot during a frenzy restarts it, no stacking, no escalation, no other effect. For the stats such a shot is a plain miss (it counts toward the duck's every-3rd-miss laugh). SWARM also schedules a frenzy every 7-11 s (`kind 'frenzy'` spawns) and its bees are 25 % busier. `beePass {u}` on a close fly-by (throttled 1.6 s, 0.35 s in a frenzy). Bees: HONEYCOMB 6 / 7 / 7 / 8, ROYAL JELLY +1, SWARM 11 / 11 / 12 / 12.

**Dials (`TIER_P`, variant 0; variants: `win` x(1 - 0.05 v), `decep` and `trick` +0.02 v, `share` +0.02 v, -0.05 on the magazine variants):**

| | BEGINNER | ADVANCED | VERY HARD | INSANE |
|---|---|---|---|---|
| time s | 45 | 40 | 36 | 32 |
| `win` pop window / `swing` / `lv` s | 1.30 / 0.50 / 0.32 | 1.00 / 0.40 / 0.28 | 0.70 / 0.30 / 0.24 | 0.45 / 0.22 / 0.20 |
| `live` singles up at once | 4 | 3 | 3 | 2 |
| `gap` / `burst` / `bgap` / `pause` s | 0.5-0.95 / 25 % / 0.3-0.45 / 0.6-1.0 | 0.55-0.95 / 28 % / 0.28-0.4 / 0.75-1.2 | 0.5-0.9 / 32 % / 0.25-0.35 / 0.9-1.4 | 0.45-0.8 / 35 % / 0.22-0.3 / 1.0-1.5 |
| `hop` aim travel (x the comb diagonal, ~200-240 px) / `alt` / `adj` | 0.12-0.38 / 0.25 / 0.12 | 0.3-0.55 / 0.45 / 0.15 | 0.45-0.75 / 0.65 / 0.17 | 0.6-1.0 / 0.85 / 0.2 |
| `decep` single = bomb / `kinds` plain, hidden, decoy / `bombCap` | 18 % / .45 .20 .35 / 20 % | 25 % / .40 .22 .38 / 27 % | 32 % / .35 .23 .42 / 33 % | 38 % / .30 .24 .46 / 38 % |
| `trick` chance per beat / `beat` / `snake` / `pp` s | 15 % / 0.62 / 0.70 / 0.75 | 18 % / 0.50 / 0.55 / 0.60 | 21 % / 0.40 / 0.42 / 0.48 | 24 % / 0.32 / 0.34 / 0.40 |
| `wall` stay s / `col4` deep cell hides a decoy 4th | 1.7 / 45 % | 1.35 / 55 % | 1.05 / 65 % | 0.85 / 75 % |
| `larva` chance per beat / `ripen` s / `maxL` (ROYAL JELLY x1.9, +1) | 16 % / 3.6 / 2 | 18 % / 3.1 / 2 | 20 % / 2.6 / 2 | 22 % / 2.2 / 2 |
| `spare` (misses the clear must survive) / `share` / `rel` s | 8 / 55 % / 0.75 | 5 / 60 % / 0.70 | 3 / 64 % / 0.62 | 2 / 68 % / 0.55 |
| live columns | 1-5 | 0-6 | 0-6 | 0-6 |

Variants: 1 HONEYCOMB (unlimited), 2 ROYAL JELLY (8 per mag, more larvae), 3 SWARM (12 per mag, many bees, frenzies). No hard-cap variant, so the briefing's ROOM FOR ERROR line counts TARGETS you may let go (real targets - quota, never below `spare`).

**The director (`timeline`)** is the range's on the comb: beats (a single, a burst of 2-3, or a pattern) with anticipation pauses; a beat may also lay a LARVA (announced, it runs alongside the stream; at most `maxL` ripening). Aim travel picks the free cell closest to the wanted hop from the last plate you were made to aim at, preferring the other side / height, +2 penalty within `adj` of anything up. Fair bombs: bomb cap, never two plain bombs in a row, never three bombs in a row, a single bomb only while bombs up <= real items up (larva bombs count toward the cap). Patterns take the comb to themselves: ROW on a beat (3-5 along a comb row; the first of a round clean, later clean / a DECOY on the beat / OFF BEAT), COLUMN (3-4 up one comb column bottom to top; later ones may end in a bomb / decoy), SNAKE (5-7, +1 at Insane, through neighbouring cells, each pop stays ~2.6 intervals so 2-3 are lit at once; last one a bomb 30 % + 8 % per tier, 60 % of those decoys), PING-PONG (two neighbouring cells, 4-6 pops, then a bomb on the beat), DEEP CELL (the range's #71 column: 4-5 plates in one cell, the ones behind invisible; shoot the front and the next is standing there, stays `revW` = max(0.5, win); unshot, they go in unseen; first clean, later `col4` a decoy 4th), THE WALL (6-8 cells at once, 1-3 decoys). RELOAD-AWARE (magazine variants), a pass after the layout: a perfect player's shots in ready order (0.22 s reaction, 0.2 s between shots, aim 0.06 + 0.32 x distance / 489 px); the shot after a full magazine waits `rel` and that item gets >= 0.45 s past that (its stay or reveal window is extended; every cell is booked `rel + 0.8` s longer on these variants so an extension never collides). Spawn fields: see the comment above `timeline()`.

**Points:** by how early in its shootable window you hit it, 300 / 200 / 150 / 100 by quarters (a deep-cell member 200), a larva's plate +150. Bomb -300 + LIFE -1 (engine).

**Measured** in the page (`config(tier, v)` + `timeline(c, mulberry32(hashStr('beehive|' + tier + '|' + v) ^ seed))`), variants 0-2 x seeds 1-30 = 90 runs per tier. Travel = mean screen distance between consecutive required items (all / singles). Solver: the range's greedy earliest-deadline player (0.22 s reaction, 0.2 s between shots, aim 0.06 + 0.32 x d / 489, `rel` per magazine, never a bomb / decoy / larva before its hatch, deep-cell members only after the one in front), with `spare` misses spread out.

| tier | spawns / singles | real | bombs/run plain / decoy / hidden | larvae (bee / target / bomb) | bomb share | quota | room for error (min) | pop window / span s | travel px all / singles | patterns/run R / V / S / C / X |
|---|---|---|---|---|---|---|---|---|---|---|
| BEGINNER | 47.7 / 29.1 | 40.3 | 2.0 / 2.3 / 1.0 | 4.6 (1.3 / 2.6 / 0.7) | 10.5 % | 21.7 | 18.6 (12) | 1.24 / 1.89 | 68 / 72 | 0.86 / 0.72 / 0.53 / 0.80 / 0.28 |
| ADVANCED | 43.1 / 24.1 | 35.3 | 2.0 / 2.5 / 1.0 | 4.5 (1.3 / 2.2 / 1.0) | 12.6 % | 20.8 | 14.5 (11) | 0.95 / 1.49 | 90 / 107 | 0.84 / 0.79 / 0.52 / 0.83 / 0.26 |
| VERY HARD | 44.0 / 24.2 | 34.8 | 2.2 / 3.5 / 1.5 | 4.2 (1.1 / 2.2 / 0.9) | 15.0 % | 21.8 | 13.0 (10) | 0.67 / 1.09 | 111 / 140 | 0.94 / 0.71 / 0.61 / 0.94 / 0.23 |
| INSANE | 42.2 / 21.2 | 32.5 | 2.2 / 3.7 / 1.7 | 4.4 (0.9 / 2.2 / 1.2) | 16.8 % | 21.6 | 10.9 (8) | 0.43 / 0.76 | 125 / 171 | 1.02 / 0.78 / 0.63 / 0.92 / 0.22 |

(Every bomb kind incl. larva bombs: 6.1 / 6.5 / 8.1 / 8.8 per run; bomb share = plain + decoy + larva bombs over all cell spawns; pop window = the mean stay of singles, the dial being 1.3 / 1.0 / 0.7 / 0.45 x the variant shrink.)
Solver: all 360 runs clear with the spare misses, worst margin over the quota +13 / +7 / +7 / +6; a slower bot (0.32 s reaction, 0.3 s between shots, aim 0.12 + 0.5) also clears all 360 (worst +13 / +5 / +2 / 0). Reload rule audited on the magazine variants (779 post-magazine items): none with less than 0.45 s left after the reload. Timelines repeat (1800 / 1800 seed pairs identical). SWARM: 3-4.5 scheduled frenzies per run.
In-page checks (stage clock stepped from a script, since the Browser pane was hidden; `?slow=0.25` loaded too): Beginner HONEYCOMB seed 7: plates flip up and score 100 / 150 / 300 by timing, a hidden bomb springs up after its plate, a larva ripens (looked at 0.1 / 0.5 / 0.95 of its timer) and hatches into a bee that flies off, another hatches into a plate (+150 on top: 450), a decoy (A2) is shot: build-up, bare bomb, bang at +0.3 s with LIFE -1 only then, a bee shot = `beeHit` + `beeFrenzy`, a miss for the stats, no penalty. An autopilot through `G.playFire` cleared Insane SWARM (2 reloads), Insane ROYAL JELLY (4 reloads), Insane HONEYCOMB and Beginner HONEYCOMB; Insane THE WALL with three E2 decoys looked at; briefing card (ROOM FOR ERROR line, the cell icon), free play page 4/4 (HIVE 3), results; no console errors.
Draw calls (scene + post + HUD, `renderer.info` over one `R.render()`): an empty comb 29 (range 24: the bee stage adds the far set, the yard, the drips and the two bee meshes), busy moments 36-41 (the range's busiest 44); triangles 60-130k.

**Not done / open for Jon:** lights-out on the comb (optional in the brief, skipped); flip bombs and turncoats are not used here (the larva hatch is the comb's surprise); the cameo bee on the duck's hat (duck.js not touched); a frenzy does not raise the bed's volume (the `beeFrenzy` sound does the loudness). HIGH SCORES (ui.js, not touched) shows at most 14 rows: with five stages (16 variants + COURSE) HIVE 2, HIVE 3 and COURSE are cut off; fix in ui.js `UI.screens.scores.draw`: `const n = Math.min(rows.length, 17), rh = Math.max(7, Math.min(14, Math.floor(126 / n)));` (or two columns), and the same 14 cap in `portrait.js` (scores, `const n = Math.min(rows.length, 14)`).
