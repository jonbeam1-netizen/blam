# B.L.A.M. style bible (phase one look test)

*"Blast like a maniac!"* An arcade light-gun gallery in a **pixel / dithered 3D voxel** style.
The reference implementation is `looktest.html` (one file: Three.js r128 from cdnjs, everything else inline).
To match the look, reuse its code. Don't eyeball it.

## 1. Golden rules
- Every final pixel comes from the **BLAM-34 palette** below. The scene is snapped by the post pass. The HUD is drawn with palette colours only.
- Everything shares **one pixel grid: 426x240**. Never draw UI at screen resolution, never use `fillText`, never smooth.
- Build everything from **boxes** (voxels): flat faces, no textures on 3D surfaces (only the muzzle-flash sprite), no PBR, no gloss.
- Original content only. No third-party characters, logos or names. Don't mention other light-gun games anywhere.
- Keep draw calls low. The look test uses 23 scene calls + 2 post passes, about 27k triangles.

## 2. Palette "BLAM-34"
| name | hex | used for |
|---|---|---|
| void | `#0b0b1a` | outlines, text outline, bullet holes, sights, pupils |
| midnight | `#1a1c3a` | fog/background, ceiling tiles, deepest shadow |
| navy | `#2b2f5c` | floor concrete, walls, cable mid-tone |
| slate | `#3f4880` | wall ribs, dividers, fixture housings, cable highlight |
| steel | `#5a6aa8` | target posts/rods, trolley rails |
| haze | `#8c9ccc` | badge centre, metal highlight |
| mist | `#c8d0e8` | sheriff badge, steam puffs, small HUD labels |
| bone | `#f4f4f0` | target white rings, plaque letters, badge number disc |
| indigo | `#3a1a6a` | back-wall skirting, stage curtain stripes |
| umber | `#2e1c1c` | darkest wood shadow (dither partner) |
| walnut | `#4e2e24` | wood planks, target backs, duck hat band, wainscot |
| chestnut | `#7a4a2c` | wood, duck hat, plinth |
| tan | `#a8703a` | barrier caps, counter planks, plinth top |
| sand | `#d4a060` | light wood (dither partner) |
| oxblood | `#5c0f24` | duck mouth, dark red shadow |
| crimson | `#a01830` | marquee board, counter rail, HIT label |
| red | `#e82838` | bullseye rings, hearts, duck angry brows, "!" |
| coral | `#ff6a5a` | heart highlight |
| plum | `#6a0f5a` | marquee frame, grip panels, stage stripes, HUD button |
| magenta | `#c0187a` | gun grip and back cap, HUD button edge |
| pink | `#ff3aa0` | **gun body (hero colour)**, back-wall neon |
| bubblegum | `#ff9ad0` | gun top rib |
| rust | `#c84a10` | unlit marquee bulbs |
| orange | `#ff7a1a` | duck bill, letter/HIT bottom rows, flash spikes |
| amber | `#ffb020` | duck shading/wing outline, shells, chasing bulbs |
| yellow | `#ffe040` | duck body, bullseye centre, title letters, lane caps |
| lemon | `#fff8a0` | light panels, lit bulbs, letter top rows, flash core |
| deepblue | `#0a2a8a` | muzzle band, ball shading |
| blue | `#1a5aff` | **gun muzzle block**, HIT counter ball |
| cyan | `#20d0ff` | gun accent band and trigger, neon, tagline |
| ice | `#a0f4ff` | gun lens, ball highlight |
| forest | `#0a4a2a` | reserved (greens for later stages) |
| green | `#1a9a3a` | reserved |
| lime | `#7ae830` | gun status LED, FPS readout |

## 3. Render pipeline
1. **Scene pass** into a 426x240 `WebGLRenderTarget` (Nearest filtering, no mipmaps, depth on). Clear colour midnight, clear **alpha 0.5**.
   Camera: `PerspectiveCamera(50, 426/240)` at (0, 1.9, 5) with pitch -0.08 rad. `Fog(midnight, 13, 32)`.
   Lights: Ambient 0.42, Directional 0.66 from (0.30, 0.35, 0.89), Directional 0.28 from straight up.
   These values are tuned so a face pointing at the camera lands on its **authored palette colour** (0.42 + 0.66 x 0.89 is about 1.0).
2. **Palette/dither pass** (426x240 to 426x240). For each pixel: `c += (bayer4 - 0.469) * spread`, then nearest palette entry using weighted RGB distance `(0.95, 1.25, 0.8)`. The HUD texture is composited after quantisation, so the HUD is never dithered.
   The **alpha channel is the dither class**: env materials write 0.5 (`transparent:true, opacity:0.5, blending:NoBlending`), objects write 1.0.
   | mode | key | env spread | object spread |
   |---|---|---|---|
   | 1 LIGHT DITHER (default) | `1` | 0.17 | 0.045 (flat colours stay clean) |
   | 2 FULL DITHER | `2` | 0.23 | 0.19 |
   | 3 FLAT SNAP | `3` | 0 | 0 |
   Muzzle flash: a `boost` uniform briefly multiplies scene colour by 1.22 before snapping.
3. **Blit** with Nearest filtering into a letterboxed 16:9 viewport of a full-window canvas sized in device pixels (DPR capped at 3). Use an integer scale when that keeps at least 80% of the size, otherwise fractional. Bars are `#05050c`.
- Gradients come from **baked vertex light** (`Vox.bake`, light pools under the ceiling bars) plus fog, never from textures. Keep env geometry tiled at about 1 unit so the gradients have vertices to live on.

## 4. Voxel modelling (`Vox` builder)
- `box/bx` push 6 faces (or a `mask`) with per-vertex colour into one merged geometry. `vox(list, size)` takes a voxel list and culls faces between neighbours.
- Optional `bake(x,y,z)` (positional light) and `shade[6]` (per-face multipliers +x,-x,+y,-y,+z,-z) are multiplied into the vertex colours.
- Materials: `MAT_ENV` (Lambert, env class), `MAT_OBJ` (Lambert, object class), `MAT_GLOW` (Basic, unlit: light panels, neon, bulbs, and the gun).
- Dark **outline trick**: extrude the silhouette, then add a one-voxel-dilated `void` layer one voxel behind it (duck, title letters).
- Particles are one `InstancedMesh` of unit cubes with `setColorAt` (chips, shells, sparks, steam). Bullet holes are a second instanced box mesh.

## 5. The gun (first-person, camera child)
- Voxel unit `GU = 0.016` camera-space units. The barrel points -z. Parts in voxel units: pink receiver 4x4x15 with a cyan middle band and a bubblegum top rib, void rear/front sights, chunky **blue muzzle** 6x6x4 with a deepblue band, ice lens and void bore, magenta back cap with a lime LED, void trigger guard, cyan trigger.
- Grip: magenta 4x9x4 with plum panels, void butt cap and slate cable boot, tilted back -0.3 rad about the grip top.
- **Unlit + baked face shade** `[0.62, 0.92, 1.0, 0.5, 0.8, 0.7]` so the hero pink never goes muddy.
- Placement: base (0.50, -0.11, -0.86) with mouse, x 0.20 on touch. It follows the aim point (fixed 9 units out) with a slerp lag (12/s), plus a yaw bias of `0.17 + 0.2 x baseX` so its left flank shows.
- Recoil: a spring (k 260, damping 19, impulse 10) gives z kick x0.14 and pitch x0.8. Flash: a 16x16 pixel-art sprite for 0.06 s at a random 90-degree turn. Each shot ejects an amber shell and lemon/orange sparks out of the right side. Screen shake 0.14 s.
- **Cable**: a 14-point Verlet rope. The top two points are pinned to the grip boot and grip direction, the bottom is pinned below the frame. It is drawn as a 230-cube helix (radius 0.011, pitch 0.024): front half slate, sides navy, back void.

## 6. Deputy Duck (mascot)
- A flat tin gallery duck facing right, made from a 22x23 pixel-art grid (`DUCK_ART`), voxel `DV = 0.05`, 2 voxels thick, with a void outline layer behind.
- Colours: yellow body with amber shading, orange bill, chestnut hat with a walnut band and a yellow star, mist plus-shaped sheriff badge, walnut stand. He stands on a chestnut plinth with a bone-lettered "DEPUTY" plaque.
- Separate parts with pivots: wing (shoulder), lower bill (hinge, oxblood mouth behind it), eyes open / blink line / happy `^`, red angry brows.
- Idle: bob, rock and random blink. **Hit**: hop with squash and stretch, wing flaps, happy eyes, a HUD heart. **Miss**: shakes, wing raised behind the head, bill open, red brows, mist steam cubes and a HUD "!" bubble.

## 7. Targets
- 11x11 voxel bullseye: yellow 3x3 bull, then red, bone, red, bone rings. Walnut back layer, steel post.
- Pop-ups rise out of slots under the floor or the stage while flipping upright (easeOutBack). Swingers ride a trolley in from the side walls and hang as a damped pendulum. All of them hold, drop and cycle forever.
- A hit shatters the face into chips (the face voxels plus about a quarter of the back) with gravity and floor bounce, shows "HIT!" and bumps the counter.

## 8. UI and type
- HUD canvas 426x240, `fillRect` only, palette names via `CSS[...]`, 1px void outline around any text that sits over the scene.
- **3x5 font** (`F3`, octal rows) for all small text. **Bold 7-row font** (`F7`) for display words ("B.L.A.M.", "HIT!"), 2-voxel strokes, row gradient lemon, lemon, yellow, yellow, yellow, amber/orange, 2px void outline.
- Title marquee: 3D voxel letters (2 deep, void outline ring) on a crimson board with a plum frame and about 40 chasing bulbs (lemon/amber/rust). Letters hop in a wave and the sign wobbles. On the first shot it springs to the top-left at 36% scale, and the tagline drops to 1x under it.
- **Magazine (#72)** replaces the number-on-a-bullet ammo shell: a vertical pixel clip at the bottom-left of the strip (P2: bottom-right, mirrored), bottom on the frame bottom. Rounds lie on their side, 12x4 px on a 5 px pitch (brass case lemon/yellow/amber, rust rim, copper tip sand/orange/rust/chestnut), one per round left, gone top-down as you shoot; <= 8 one column, 9-16 two, caps up to 32 three/four (+ a small count above past 16). Body: void outline, haze/steel left wall, slate/navy right wall, feed lips over the top round, midnight well with a navy spring hatch, a 3-row baseplate in the player colour (P1 coral/red/crimson, P2 ice/cyan/blue). Last 3 rounds: a 1.4 Hz warm pulse through 4 palette steps (brighter rounds + oxblood/rust/orange halo), never on/off. Empty: hollow, outline red <-> bone at 2 Hz, RELOAD letters above. Reload: the old clip drops out of the well, a full one rises in (0.34 s, easeOutBack), lemon outline as it seats. Unlimited: a full clip with the infinity glyph above. Sizes: 8-round clip 24x49, 12-round 37x39, 16-round 37x49.
- **Casings (#72)**: every shot pops one HUD casing (max 8 alive, 0.8 s, gravity 900 px/s2, two bounces on the frame bottom, flicker-out in the last 0.18 s, 8 cached 45-degree spin frames with a 1 px void outline). Desktop: from the gun's ejection port (`gun.ejectPoint()` projected) along the port direction; touch, portrait and the rival: from the top of the clip. Per gun: AQUA PRO brass pistol case 7x4, HOT ROD bottlenecked rifle case 11x4, RAY-85 spent energy cell 7x5 (bone/sand, orange <-> lemon band), CANDY SIX pink/bone candy-striped case 7x4 (rival: brass pistol case).
- HUD layout: hearts bottom-left (2x), billiard-ball HIT counter bottom-centre (blue ball, bone disc, void number), dither button and mode name top-right, FPS under it (F toggles it), crosshair (mouse only): 1px bone bars with void outline and a red centre, turning yellow and opening up on fire.
