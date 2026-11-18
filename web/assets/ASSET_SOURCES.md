# Asset sources (third-party)

More entries: `web/assets/real/CREDITS.md`.

| Asset | Files | Author | Licence | URL |
|---|---|---|---|---|
| Universal Base Characters [Standard] (Superhero male and female heads, eyes, brows; hair: simple parted, buzzed, long, buns, beard) | `web/assets/bodies/body_m.glb`, `body_f.glb` (heads, eyes, brows, hair) | Quaternius | CC0 1.0 | https://quaternius.com/packs/universalbasecharacters.html (download: https://quaternius.itch.io/universal-base-characters) |
| Modular Character Outfits - Fantasy [Standard] (male and female Ranger and Peasant outfits) | `web/assets/bodies/body_m.glb`, `body_f.glb` (outfits) | Quaternius | CC0 1.0 | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html (download: https://quaternius.itch.io/modular-character-outfits-fantasy) |

Built from the packs' glTF files with a Blender script that is not part of this repository (textures shrunk to 1024 px WebP, roughness maps and vertex colours dropped, normals and weights quantized, head cut from the full body). Downloaded 2026-11-12.

## First-person hand
- Files: `real/fp2_grip_skin.glb`, `real/fp2_grip_glove.glb`, `real/fp2_trigger_skin.glb`, `real/fp2_trigger_glove.glb`
- Source: Blender Studio "Human Base Meshes" bundle v1.4.1, object "Hand - Realistic" (https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip)
- Licence: CC0 1.0 (public domain). No credit required.
- Changes: rigged, posed, cut at the wrist, coloured and exported with Blender scripts that are not part of this repository.
- Six poses (`fp2_{grip,trigger,open,hook,pinch,cup}_{skin,glove}.glb`), same CC0 source. No other outside asset was added: every weapon is still the project's own code-built model, with a bevel pass.

## Foe bodies
- `web/assets/bodies/body_foe.glb`: the same Quaternius CC0 packs as the hero bodies (Universal Base Characters [Standard], Modular Character Outfits - Fantasy [Standard]), cut to about 6-8k triangles a figure with Blender Decimate, maps at 512 px. No new asset was downloaded.

## Weapon models
- No outside asset was added. Every weapon is the project's own code-built model (Blender scripts that are not part of this repository). The only image inside a weapon is a generated wood grain (numpy noise, 512 x 256, about 15 kB), so there is no source to credit.

## Music
All music is either the project's own work or CC0 1.0 (public domain, https://creativecommons.org/publicdomain/zero/1.0/). No credit is required; the authors are named here as thanks. Sources downloaded 2026-11-16 from OpenGameArt; each page lists CC0 as a licence. The md5 is of the downloaded source file.

| Files (`web/assets/`) | Track | Author | Licence | URL | Source md5 | Part used |
|---|---|---|---|---|---|---|
| `music/explore_dark.ogg`, `.mp3` | Dark Forest Theme | cynicmusic | CC0 1.0 | https://opengameart.org/content/dark-forest-theme | `5f0cf84ff49f9bb33f5e91a44a7f1d1d` | section 4.4 s to 48.7 s |
| `music/combat_dark.ogg`, `.mp3` | Battle Theme A | cynicmusic | CC0 1.0 | https://opengameart.org/content/battle-theme-a | `c4ef1d99d24712cbd452c788f61adc0f` | section 2.5 s to 42.1 s |
| `music/boss_dark.ogg`, `.mp3` | Determined Pursuit (epic orchestra loop) | Emma_MA | CC0 1.0 | https://opengameart.org/content/determined-pursuit-epic-orchestra-loop | `41e8aa90d31bf41ef136cd4d9a58baa9` | section 12.5 s to 55.2 s |
| `music/explore_storybook.ogg`, `.mp3` | Medieval: The Bard's Tale | RandomMind | CC0 1.0 | https://opengameart.org/content/medieval-the-bards-tale | `c0ccd638502a890d11b8bf30e4dfc5fd` | whole file |
| `music/combat_storybook.ogg`, `.mp3` | Medieval: Battle | RandomMind | CC0 1.0 | https://opengameart.org/content/medieval-battle | `0b8d1bc2e3af7d9205af3ba9f6b6adad` | section 2.0 s to 43.1 s |
| `music/boss_storybook.ogg`, `.mp3` | QaziJamJam (orchestral battle theme) | Emma_MA | CC0 1.0 | https://opengameart.org/content/qazijamjam-orchestral-battle-theme | `070e04eb16405b90783f71b0884d882e` | section 104.6 s to 151.3 s |
| `music/explore_neon.ogg`, `.mp3` | T & T Free Cyberpunk Pack 2 | tricksntraps | CC0 1.0 | https://opengameart.org/content/t-t-free-cyberpunk-pack-2 | `ffe305b2d7382e1b7c6eedae0e83abbc` | section 10.3 s to 48.7 s |
| `music/combat_neon.ogg`, `.mp3` | T & T Free Cyberpunk Pack 2 | tricksntraps | CC0 1.0 | https://opengameart.org/content/t-t-free-cyberpunk-pack-2 | `180f9b35b555dac787cd1538e4d2884d` | section 16.2 s to 56.2 s |
| `music/boss_neon.ogg`, `.mp3` | T & T Free Cyberpunk Pack 2 | tricksntraps | CC0 1.0 | https://opengameart.org/content/t-t-free-cyberpunk-pack-2 | `5a7223bf86afb59bb337098edee8d663` | section 18.6 s to 56.0 s |
| `music/explore_frontier.ogg`, `.mp3` | Spaghetti Western | Spring Spring | CC0 1.0 | https://opengameart.org/content/spaghetti-western | `7666f75b3c68c663600a0a44115e04c9` | section 3.2 s to 44.3 s |
| `music/combat_frontier.ogg`, `.mp3` | Electronic Outlaw | Zane Little Music | CC0 1.0 | https://opengameart.org/content/electronic-outlaw | `e8323f0d6e1c074fe3058522f4e43fd6` | section 64.8 s to 102.1 s |
| `music/boss_frontier.ogg`, `.mp3` | Generic trailer music | Emma_MA | CC0 1.0 | https://opengameart.org/content/generic-trailer-music | `c7ced73a9c57f2579a3bd342b55006ce` | section 62.4 s to 103.4 s |
| `music/combat_edo.ogg`, `.mp3` | Old Edo: drums (own work over "Cinematic percussion loop" by Marwan Antonios, CC0) | Sage Quest + Marwan Antonios | own work + CC0 1.0 | https://opengameart.org/content/cinematic-percussion-loop | `edcade5ddbbc72b6122f43719007a9fa` | whole file |
| `music/boss_edo.ogg`, `.mp3` | Old Edo: the Lord (own work over "Cinematic percussion loop" by Marwan Antonios, CC0) | Sage Quest + Marwan Antonios | own work + CC0 1.0 | https://opengameart.org/content/cinematic-percussion-loop | `195612917df19f5221056ff6e9333dab` | whole file |

- **Own work (no outside source):** `music/on_*.{ogg,mp3}`, `music/col_*.{ogg,mp3}`, `music/end_card.*`, `music/sting_*.*` (rendered by a script that is not part of this repository) and `music/explore_edo.*` (rendered the same way).
- **Own work over one CC0 loop:** `music/combat_edo.*` and `music/boss_edo.*` play the project's own koto, flute and drone parts over "Cinematic percussion loop" by Marwan Antonios (row above).
- **Changes to the sourced tracks:** A script that is not part of this repository cuts one section, folds the audio after the cut into the head so the section loops, sets the level, and encodes Ogg Opus (64 kbps) and MP3 (96 kbps).

## Title logo
- `web/assets/title/b/` ("sorcery", used by the cover and clean title variants): the pixel-art logo layers at 1x plus `order.json`. Drawn by hand as glyph tables, with no font file and no download. Own work. Loaded only by `web/src/title2.js` for `?title=clean` and the default cover title.
- The variants also load the Google Fonts "Press Start 2P" and "VT323" at run time (SIL Open Font License 1.1). No font file is in the repo.

## Code libraries (not assets)
- `web/src/meshopt-simplifier.js`: meshoptimizer 0.22.0 simplifier module (Arseny Kapoulkine, MIT, https://github.com/zeux/meshoptimizer), copied from the npm package unchanged. Used by `web/src/perf3.js` to thin geometry on weak GPUs and phones.

## Fonts (loaded at run time)
The game loads these fonts from Google Fonts. No font file is in the repository. All are licensed under the SIL Open Font License 1.1.

| Font | Designers | Used for |
|---|---|---|
| Geist, Geist Mono | Andrés Briganti, Mateo Zaragoza, Guillermo Rauch, Evil Rabbit, José Rago, Facundo Santana (Vercel) | interface text and numbers |
| Playfair Display | Claus Eggers Sørensen | the italic serif of the interface and the cover |
| Press Start 2P | CodeMan38 | pixel type on the title and the share picture |
| VT323 | Peter Hull | the clean title variant |
| Shippori Mincho | FONTDASU | the Old Edo world |
| Fraunces | Undercase Type, Phaedra Charles, Flavia Zimbardi | the Storybook world |
| Zilla Slab | Typotheque | the Frontier world |
| Chakra Petch | Cadson Demak | the Neon City world |
| Cinzel | Natanael Gama | the name carved in the camp stone |
