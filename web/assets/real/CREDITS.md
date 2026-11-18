# Asset credits

The models and textures in the first two tables are from Poly Haven (https://polyhaven.com), licence CC0 1.0 (public domain). The rig, animations and bodies from Quaternius (https://quaternius.com) are listed under "Models built in Blender" and in ASSET_SOURCES.md. Models built in Blender and procedural assets are original work. Credit is not required for CC0 material; it is given here.
Poly Haven models were decimated and re-encoded (1k JPEG, GLB) with gltf-transform. Textures were re-encoded to 1k JPEG.

## Models (web/assets/real/)

| File | Poly Haven id | Name | Authors |
|---|---|---|---|
| boulder_01.glb | boulder_01 | Boulder 01 | Rico Cilliers |
| dead_tree_trunk_02.glb | dead_tree_trunk_02 | Dead Tree Trunk 02 | Jenelle van Heerden, Rico Cilliers |
| dry_branches_medium_01.glb | dry_branches_medium_01 | Dry Branches Medium 01 | Rico Cilliers |
| fern_02.glb | fern_02 | Fern 02 | Rob Tuytel, Rico Cilliers |
| gothic_statue.glb | gothic_statue | Gothic Statue | Benny Weimer |
| moon_rock_01.glb | moon_rock_01 | Moon Rock 01 | Greg Zaal, Rico Cilliers, Jenelle van Heerden, Dario Barresi |
| namaqualand_boulder_02.glb | namaqualand_boulder_02 | Namaqualand Boulder 02 | Greg Zaal, Rico Cilliers |
| namaqualand_boulder_04.glb | namaqualand_boulder_04 | Namaqualand Boulder 04 | Jenelle van Heerden |
| namaqualand_cliff_01.glb | namaqualand_cliff_01 | Namaqualand Cliff 01 | Jenelle van Heerden, Rico Cilliers |
| namaqualand_cliff_02.glb | namaqualand_cliff_02 | Namaqualand Cliff 02 | Dario Barresi, Rico Cilliers |
| pine_roots.glb | pine_roots | Pine Roots | Rob Tuytel |
| rock_07.glb | rock_07 | Rock 07 | Jenelle van Heerden |
| rock_09.glb | rock_09 | Rock 09 | Jenelle van Heerden |
| rock_face_01.glb | rock_face_01 | Rock Face 01 | Dario Barresi |
| rock_moss_set_02.glb | rock_moss_set_02 | Rock Moss Set 02 | Kless Gyzen |
| root_cluster_01.glb | root_cluster_01 | Root Cluster 01 | Jenelle van Heerden, Rico Cilliers |
| shrub_03.glb | shrub_03 | Shrub 03 | Rico Cilliers |
| stone_fire_pit.glb | stone_fire_pit | Stone Fire Pit | Sebastian Platen |

## Ground and surface textures (web/assets/ground/, diffuse + normal (GL) + roughness)

| Files | Poly Haven id | Name | Authors |
|---|---|---|---|
| aerial_grass_rock_*.jpg | aerial_grass_rock | Aerial Grass Rock | Rob Tuytel |
| bark_brown_02_*.jpg | bark_brown_02 | Bark Brown 02 | Rob Tuytel |
| brown_mud_02_*.jpg | brown_mud_02 | Brown Mud 02 | Rob Tuytel |
| burned_ground_01_*.jpg | burned_ground_01 | Burned Ground 01 | Rob Tuytel |
| castle_wall_slates_*.jpg | castle_wall_slates | Castle Wall Slates | Rob Tuytel |
| forest_leaves_04_*.jpg | forest_leaves_04 | Forest Leaves 04 | Rob Tuytel |
| grass_path_2_*.jpg | grass_path_2 | Grass Path 2 | Rob Tuytel |
| rocky_terrain_02_*.jpg | rocky_terrain_02 | Rocky Terrain 02 | Amal Kumar |
| rock_diff.jpg, rock_nor_gl.jpg, rock_rough.jpg | rocky_terrain_02 | Rocky Terrain 02 | Amal Kumar (the same maps with a small tone adjustment; matched to the Poly Haven originals by pixel comparison, correlation 0.99) |
| seaside_rock_*.jpg | seaside_rock | Seaside Rock | Dimitrios Savva |
| snow_field_aerial_*.jpg | snow_field_aerial | Snow Field Aerial | Rob Tuytel |
| cliff_side_*.jpg | cliff_side | Cliff Side | James Ray Cock, Jenelle van Heerden, Dario Barresi (added 2026-11-11, 1k JPEG, layered strata on mesas, cliffs, volcano) |
| damp_beach_sand_*.jpg | damp_beach_sand | Damp Beach Sand | Dimitrios Savva (added 2026-11-11, 1k JPEG, Storm Coast wet sand) |
| leaves_forest_ground_*.jpg | leaves_forest_ground | Leaves Forest Ground | Dimitrios Savva, Dario Barresi (added 2026-11-11, 1k JPEG, Deepwood leaf litter) |
| asphalt_02_*.jpg (web/assets/real/neon/) | asphalt_02 | Asphalt 02 | Rob Tuytel |
| hangar_concrete_floor_*.jpg (web/assets/real/neon/) | hangar_concrete_floor | Hangar Concrete Floor | Dimitrios Savva |

web/assets/ground/s512/ holds 512 px copies of the normal and roughness maps of the ground textures above, with the same authors.

## Models built in Blender

| File | Source |
|---|---|
| knight.glb | The skeleton and the animation clips are from the Quaternius Universal Animation Library (https://quaternius.com/packs/universalanimationlibrary.html) and Universal Animation Library 2 (https://quaternius.com/packs/universalanimationlibrary2.html), 85 clips in total. Both pack pages list the licence as CC0 (checked 2026-11-18). The files were obtained from https://github.com/series-ai/jam-ready-assets. The armour, helms, cloth and other parts are original, modelled by script in Blender. Material: Poly Haven `metal_plate_02` (CC0 1.0), re-encoded to 1k JPEG. |
| wear_edo.glb, wear_frontier.glb, wear_neon.glb, wear_storybook.glb | The world wardrobes. Original parts, modelled by script in Blender and bound to the knight's skeleton (the Quaternius rig above). No textures. |
| gear_*.glb (all weapon and shield files, for example gear_sword.glb, gear_edo_katana.glb, gear_frontier_revolver.glb, gear_neon_baton.glb, gear_storybook_bow.glb) | Original, modelled by script in Blender (headless). No third-party model and no third-party texture. Some files embed a generated wood grain (numpy noise). The surface detail (ground edges, scratches, pitting, soot, rust, leather wrap, wood grain, shield paint) is procedural, in `gearShade` in web/src/world.js. |
| fp_hand*.glb, fp_forearm*.glb, fp_upper*.glb, fp_leg*.glb, fp_pose_*.glb | Original first-person hands, arms and legs, modelled by script in Blender. No third-party model. The embedded weave, grain, mail, brushed-metal and cloth textures are generated. `fp_leg.glb` uses the Poly Haven material `metal_plate_02` (CC0 1.0). |
| fp2_*.glb | First-person hands from the Blender Studio Human Base Meshes bundle (CC0 1.0). See web/assets/ASSET_SOURCES.md. |
| dragon.glb | The Hollow Dragon. Original, modelled by script in Blender. Its only texture is the Poly Haven material `metal_plate_02` (CC0 1.0), re-encoded to 1k JPEG. |
| bodies/body_m.glb, body_f.glb, body_foe.glb | Quaternius Universal Base Characters and Modular Character Outfits - Fantasy (CC0 1.0). See web/assets/ASSET_SOURCES.md. |
| (no file) | Couters, poleyns, gorget and spaulders on knight.glb: built at run time in web/src/world.js (`PLATES`) and merged into the knight's part meshes. No third-party source. |

## Images made by the game itself

The pictures in web/assets/reel/ and web/assets/og/ are renders of the game's own scenes. The pixel logo in web/assets/title/b/ is drawn by hand (see web/assets/ASSET_SOURCES.md).

## Sound (web/assets/sfx/, web/src/sfx.js)

All 114 sound files are cuts of real recordings from the CC0 packs below. Every source page was checked: the OpenGameArt pages list `License(s): CC0` as the only licence, and the Kenney page and its License.txt say Creative Commons Zero (CC0). CC-BY and OGA-BY packs were skipped. Credit is not required; it is given here.

Processing (ffmpeg and numpy, outside the repo): trimmed, DC and sub-sonic offset removed, high or low passed where noted, pitched or slowed by resampling where noted, level-matched per pool, and encoded as Ogg Vorbis at 128 kbps. The ffmpeg Vorbis encoder cannot write mono, so the files are dual-mono and the engine keeps one channel. The whoosh files (`wl_*`, `wh_*`, `st_*`, `chg_*`) mix a real swish or melee recording with real air-noise recordings that were band-shaped by a sweeping filter (STFT mask); they are not pure recordings.

### Packs

| Pack | Author | URL | Licence | Pools that use it |
|---|---|---|---|---|
| Impact Sounds | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | bell, clunk, drop, plate, punch, thump, tink |
| Swishes Sound Pack | artisticdude | https://opengameart.org/content/swishes-sound-pack | CC0 | st, wl |
| RPG Sound Pack | artisticdude | https://opengameart.org/content/rpg-sound-pack | CC0 | mail, shade, st, wh, zap |
| 3 Melee sounds | qubodup (edited by remaxim) | https://opengameart.org/content/3-melee-sounds | CC0 | wh |
| Medieval sound effects - Weapon impacts | Ben Jaszczak and Brian Nelson (submitted by MedicineStorm) | https://opengameart.org/content/medieval-sound-effects-weapon-impacts | CC0 | clang, mace |
| 10 Impact/Shield Blocks | StarNinjas | https://opengameart.org/content/10-impactshield-blocks | CC0 | shield |
| Fantasy Weapons and Apparel SFX Library | Vehicle (vehiclemusic.eu) | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | CC0 | boot, ring |
| Metal footsteps on concrete | Thimras | https://opengameart.org/content/metal-footsteps-on-concrete | CC0 | msteps |
| 37 hits/punches | Independent.nu (submitted by qubodup) | https://opengameart.org/content/37-hitspunches | CC0 | flesh |
| Impact | qubodup | https://opengameart.org/content/impact | CC0 | wet |
| Squish Sounds Effects | EZduzziteh | https://opengameart.org/content/squish-sounds-effects | CC0 | wet |
| Ripping Into Meat | Eldritch Grim | https://opengameart.org/content/ripping-into-meat | CC0 | gore |
| Dragon Flap | VishwaJai | https://opengameart.org/content/dragon-flap-0 | CC0 | wing |
| Catching fire | themightyglider | https://opengameart.org/content/catching-fire | CC0 | chg, flame, wh |
| Fire Crackling | AntumDeluge | https://opengameart.org/content/fire-crackling | CC0 | flame |
| Muffled Distant Explosion | NenadSimic | https://opengameart.org/content/muffled-distant-explosion | CC0 | quake, sub |
| 75 CC0 breaking / falling / hit sfx | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 | brk, drop, rocks |
| 100 CC0 metal and wood SFX | rubberduck | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | CC0 | anvil, brk |
| 80 CC0 creature SFX | rubberduck | https://opengameart.org/content/80-cc0-creature-sfx | CC0 | droar, growl, hurt |
| 80 CC0 creture SFX #2 | rubberduck | https://opengameart.org/content/80-cc0-creture-sfx-2 | CC0 | droar, growl, hurt, roar, sub |
| 80 CC0 RPG SFX | rubberduck | https://opengameart.org/content/80-cc0-rpg-sfx | CC0 | fire, growl, roar, spark, zap |
| 100 CC0 SFX #2 | rubberduck | https://opengameart.org/content/100-cc0-sfx-2 | CC0 | chg, quake, st, wh, wl |

### Pool contents (file = `<pool>_<n>.ogg`, n counts in the order listed)

| Pool | Sources (pack key: files) |
|---|---|
| wl | SW: swish-10, swish-11, swish-12, swish-13; S2: sfx100v2_air_01 / _02 |
| wh | MEL: melee sound, sword sound, animal melee sound; CF: flame; S2: sfx100v2_air_01 / _02; RP: swing2 |
| st | SW: 12, 13; S2: sfx100v2_air_01 / _02; RP: swing3 |
| chg | CF: flame; S2: sfx100v2_air_01 / _02 |
| clang | MED: Seax Norse Sword Blade on Blade, Norse Sword Katana Blade on Blade, Axe Norse Sword Blade on Blade, Sabre Norse Sword Blade on Blade, Spear Spear Blade on Blade |
| mace | MED: Mace Norse Sword Blade, Mace Axe Blade and Haft, Mace Spear Blade, Mace Sabre Blade |
| plate | K: impactPlate_heavy_000, impactPlate_heavy_001, impactPlate_heavy_003, impactPlate_heavy_004 |
| clunk | K: impactMetal_heavy_000, impactMetal_heavy_001, impactMetal_heavy_003, impactMetal_heavy_004 |
| ring | FW: sword-knife-clash-04, sword-knife-clash-06, sword-knife-clash-09 |
| tink | K: impactMetal_light_000, impactMetal_light_001, impactMetal_light_002, impactMetal_light_004 |
| shield | SH: impact.1, impact.3, impact.6, impact.8 |
| flesh | HP: hit01, hit05, hit09, hit13 |
| wet | IM: qubodupImpactMeat01, qubodupImpactMeat02; SQ: squish_03, squishsplat_impact |
| gore | RM: rippingintomeat |
| thump | K: impactSoft_heavy_000, impactSoft_heavy_002, impactSoft_heavy_003, impactSoft_heavy_004 |
| punch | K: impactPunch_heavy_000, impactPunch_heavy_002, impactPunch_heavy_004 |
| sub | EX: nenadsimic muffled distant explosion; C2: stomp_01 |
| drop | K: impactMetal_medium_000, impactMetal_medium_003; BF: bfh1_metal_falling_04, bfh1_metal_falling_05 |
| brk | MW: metal_falling_01, metal_sheet_03; BF: bfh1_metal_falling_01, bfh1_metal_falling_02 |
| boot | FW: boots-leather-step-01, boots-leather-step-02, boots-leather-step-03, boots-leather-step-04 |
| msteps | MS: metal_steps_01, metal_steps_05, metal_steps_09, metal_steps_12, metal_steps_15 |
| mail | RP: chainmail1, chainmail2, armor-light |
| hurt | C2: human_06, human_07, human_03; C1: hurt_05 |
| roar | R8: creature_roar_02; C2: roar_05, roar_06 |
| droar | C2: monster_20; C1: monster_04 |
| growl | C1: monster_07; R8: creature_monster_04; C2: grunt_09 |
| fire | R8: spell_fire_03, spell_fire_04, spell_fire_01 |
| flame | CF: flame; FC: fire-1 |
| wing | DF: dragonflap |
| quake | EX: nenadsimic muffled distant explosion; S2: sfx100v2_thunder_01 |
| rocks | BF: bfh1_rock_falling_01, bfh1_rock_breaking_01 |
| anvil | MW: hammer_01, hammer_03, hammer_04 |
| bell | K: impactBell_heavy_000, impactBell_heavy_001 |
| zap | R8: spell_02; RP: magic1 |
| shade | RP: shade2, shade12 |
| spark | R8: spell_01 |

Pack keys: K = Impact Sounds, SW = Swishes Sound Pack, RP = RPG Sound Pack, MEL = 3 Melee sounds, MED = Medieval sound effects - Weapon impacts, SH = 10 Impact/Shield Blocks, FW = Fantasy Weapons and Apparel SFX Library, MS = Metal footsteps on concrete, HP = 37 hits/punches, IM = Impact, SQ = Squish Sounds Effects, RM = Ripping Into Meat, DF = Dragon Flap, CF = Catching fire, FC = Fire Crackling, EX = Muffled Distant Explosion, BF = 75 CC0 breaking / falling / hit sfx, MW = 100 CC0 metal and wood SFX, C1 = 80 CC0 creature SFX, C2 = 80 CC0 creture SFX #2, R8 = 80 CC0 RPG SFX, S2 = 100 CC0 SFX #2.

### Procedural sounds (2026-11-12): no files

The hero's footsteps (8 surfaces: dust, wet concrete, earth, paddy plank, grass, snow, mud, stone; 8 variations each) and the ambience beds (frontier wind and a far train, neon rain and city hum, edo night insects and reed wind, storybook breeze and birds) are synthesized at run time in web/src/sfx.js from seeded noise and sines. No third-party source and no added file (0 bytes of audio). The per-world weapon timbres in web/src/worlds/sfx-pools.js re-use the CC0 pools above with other pitch, filter and layer choices. The Kenney footstep files in Impact Sounds were checked and not used: their decoded peaks are above full scale (clipped) and they carry a strong DC offset.
