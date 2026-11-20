# HANDOFF: B.L.A.M.

Read this first in a new session. `CLAUDE.md` one folder up holds the shared rules. The detail docs live in the repo: `DESIGN-STAGES.md` (level briefs and ideas), `ENGINE.md` (how each stage works, its numbers), `PLAYTEST.md` (checklists per build), `STYLE.md` (look).

## TL;DR

- **Live:** Build 0.041 on GitHub Pages (https://jonbeam1-netizen.github.io/blam/), 14 levels.
- **Waiting on Jon:** play 0.039 to 0.041 (MARSH HUNT, THE DOCK, MOLE HOLES) and answer their open questions (below).
- **Next level:** Jon picks SOCCER or SHUFFLE CUPS (briefs written), or a new idea. Nothing starts without "go".
- **Next free gripe number: #117.**

## Where we left off (2026-11-20)

- Last build: 0.041 MOLE HOLES, pushed 2026-11-15 on Jon's "Push it". Jon has not played it.
- 2026-11-20: added `STATUS.md` (for HQ) and this file; the test server path in `.claude/launch.json` now points at this folder instead of the old OneDrive copy. No game changes.
- How a new level gets made: discuss with Jon, write a brief in `DESIGN-STAGES.md`, Jon says go, ONE Opus-high agent builds `js/stages/<id>.js` only (sounds and bed inside that file), then the manager wires the script tag, `audio.js` list, `ENGINE.md` and `PLAYTEST.md` sections, bumps the build, checks it muted, commits, and pushes only when Jon says.
- Every new level needs a 56x32 level card (`js/core/cards.js` or `def.drawCard`); see `ENGINE.md` "Level cards (#110)".

## The 14 levels

| # | Level | File | Jon played it? |
|---|---|---|---|
| 1 | Range (the staple level, plus Practice) | range.js | yes |
| 2 | Alley | alley.js | yes |
| 3 | Boneyard | boneyard.js | yes |
| 4 | Sky Show | skyshow.js | yes |
| 5 | Bee Hive (his favourite, the quality bar) | beehive.js | yes |
| 6 | Invasion | invasion.js | not recorded |
| 7 | Laser Tag | lasertag.js | partly (one Insane fail) |
| 8 | Skee Ball | skeeball.js | a peek |
| 9 | Conveyor | conveyor.js | not recorded |
| 10 | Doppelducks | doppelducks.js | not recorded |
| 11 | Grocery Run | grocery.js | yes (round 3 build 0.038 not yet) |
| 12 | Marsh Hunt | marsh.js | no |
| 13 | The Dock | dock.js | no |
| 14 | Mole Holes | moles.js | no |

## Open list (numbered gripes and fixes)

Only items the notes show as still open. Nothing here is approved to start.

| # | What | State |
|---|---|---|
| #14 | Idea: the start menu is a shooting range (shoot a sign, it shatters, the action runs) | idea, no go |
| #52 | Sound rework, what is left: an inventory of every sound still synthesized vs. real picks; the new levels' sounds are all synth placeholders | not started |
| #79 | Lights Out tinkering on the Range | Jon: "later", no details yet |
| #96 | Muzzle flash: a 2D stopgap ships since 0.028. Proper fix = one Opus-high visual agent that can see its result, ref `review/refs/guns/muzzle-flash-ref.png`. Do not hand-tune it again | open, Jon: "fix this later, no cheap fixes" |
| #98 | Laser Tag shows HIT % of 137 % on a failed round | to check |

**Early list #1 to #50:** these became the requirements for the real engine and were built across builds 0.003 to 0.012. They have not been re-checked one by one.

## Open questions for Jon (from the level agents)

| Level | Question |
|---|---|
| Marsh Hunt | (2) Beginner/Advanced have only 2 rounds; add a 3rd? (3) the dog laughs on a double miss or an empty round; also on a 1-2 bird round? |
| The Dock | (1) cannonball volleys at every tier, or Very Hard and up only? (2) about 60 s at every tier OK? (3) the hit quota almost never fails (lives run out first); OK? |
| Mole Holes | (1) busier Insane (5-6 holes active, mostly 2-3 up)? (2) back row bigger, or keep it small and hard? (3) the row/column patterns bomb-free at every tier? |
| Grocery Run r3 | 14/22 live snacks OK? a veggie in an EMPTY cart keeps "throwing" (should stop); rope swingers from the top too? cart jolt strong enough? Insane quota (27) is lower than Very Hard (35) |
| Laser Tag | Insane may be too harsh (slow test bot dies 39 of 90 runs); soften the aiming-dot slide 0.6 to 0.7 s? |
| Doppelducks | runner points, Insane duck count, runner farming |
| Conveyor | Insane belt softened to 0.60 s; OK? |
| Free play cards | show the level's tip line on the level screen? one board colour per level? |
| Guns | stretch the reload rack animation from 0.12 s to ~0.3 s so it matches the 0.4 s reload sound? |

## Known loose ends (not numbered gripes)

- **By ear, never checked:** duck moods (Claude picked 6 of 8 by measurement; Jon to re-pick on the sfx review page), 5 new sound events (turntick, lightsout, lightson, duckcameo, duckcameohit) waiting for picks, glass ding volume (DING_GAIN), sample volume vs. synth, bomb duck depth, CANDY SIX reload is weak. Arcade "crunch" effect: Jon disliked the preview, undecided.
- **Never tested:** two-browser versus play, phone portrait on most new levels, real mouse play of levels 12 to 14.
- **Briefing hint line:** stages give a teaching tip (`briefing().hint`) that `ui.js` / `portrait.js` never draw.
- **AQUA PRO / HOT ROD** throw an old 3D shell and the new HUD casing (double); Jon to judge.
- **fal.ai key:** passed through chat and browser logs once; rotate it someday.
- **Grocery:** a single veggie left alone can throw 25-40 snacks; crowding on a tall pile.

## Ideas waiting (not approved)

- **Level briefs written:** SOCCER (`DESIGN-STAGES.md` s.15; needs a small `countHit` hook in `stage.js` first), SHUFFLE CUPS (s.16).
- **Candidates:** CAN SHOOT, SALOON, LIGHTSPEED, ELEVATORS, WINDOWS, PAPER RANGE. STOP! GO! is parked. Later level idea: count plates (shoot 1-4 in order). Cheeky results stamps: later, if they fit.
- **Big future plan:** B.L.A.M. grows into an arcade of light-gun cabinets (a Time Crisis / Area 51 / House of the Dead style, all original names) on one shared rail-shooter engine, co-op up to 4. Open: which cabinet first, cover input, a digitized-actor look test.
- **Separate projects, not BLAM tasks:** a hub page linking all Jon's web games (own repo and session); BLAM as a cabinet in Rage Quit Rumble's lobby (idea only).

## Decisions

- **Name:** B.L.A.M., tagline "Blast like a maniac!". Mascot: Deputy Duck (one mascot). Repo `blam`.
- **Originality:** inspired by Point Blank, never a copy; no Namco names, art or characters.
- **Tiers:** Beginner / Advanced / Very Hard / Insane. Hard = pace + placement + deception, not more targets. Never hide content behind a tier.
- **New levels:** simple, no extras unless Jon asks; variants differ by ammo only (free / 8 / 12) unless the brief says otherwise. Discuss first, one level at a time. Each level works the B.L.A.M. logo into its scene.
- **Rules of play:** reload is instant (the trip to the side is the cost). No self-detonating bombs. No heckling during play (laugh on every 3rd miss stays). Decoys show a short build-up before they explode.
- **Sound:** real foley, punchy and tight. All volumes balanced against the gun shots (`tools/sfx-balance.py`). Jon picks ONE take, variants come from processing it, not regenerating. Never delete sound candidates until Jon says; park them.
- **Menus:** all signs static (no idle bob); hover tilt and hit shake only.
- **Publishing:** bump the build stamp in `js/main.js` and the `?v=` in `index.html` together; push only on Jon's say-so. Tests muted, one tab.

## Hand-off history

Full session-by-session history (builds 0.001 to 0.041) lives in the Claude memory notes for this folder and in `git log`.
