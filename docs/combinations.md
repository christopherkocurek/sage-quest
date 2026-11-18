# Patterns

One Sage2 call decides one thing. Sage Quest combines calls in eight patterns. Patterns 2, 3, 5 and 6 are chains: the output of one call becomes the input of the next. Terms are in [Architecture](../ARCHITECTURE.md#terms).

## 1. Stream, then batch

The same Choice runs twice. While the player speaks, a stream updates the pick as the text grows. The Sage2 panel shows the words and the read time, not the pick. When the player presses Enter, one batch call decides on the full answer, and the scene changes.

- Stream: the `live` questions in [`game/questions.mjs`](../game/questions.mjs), relayed by `onboardRelay` in [`server/server.mjs`](../server/server.mjs)
- Batch: `apiStep` in [`server/server.mjs`](../server/server.mjs)

## 2. A Choice sets the next options

The world that Sage2 chooses at the home step sets the options of later questions. In the `edo` world, the enemy options are Edo enemies and the weapon options include a yumi bow. In the `frontier` world, the weapon options include a revolver.

- `kitFor(world)` in [`game/worlds.mjs`](../game/worlds.mjs), used by the enemy step and by `forgeQuestions(world)`

## 3. Extracted words become options

At the loved-ones step, Extract returns each person or pet that the player names. At the weapon step, the names and the home place become the options of a new Choice. The Choice asks: "Which of these does this player hold most dear?" The weapon is named after the option that Sage2 picks.

- `namingQuestion(mentions)` in [`game/questions.mjs`](../game/questions.mjs)

## 4. One Choice decides how to read the others

At the weapon step, Sage2 reads the same answer with parallel calls. One Extract takes the weapon words. Three Choices pick the weapon, the material and the element. One Choice gives the kind of answer. The kind is one of four values:

- `weapon`: a weapon type
- `thing`: an object that is not a weapon
- `ready`: the player says they are ready to go
- `none`: no weapon and no object, such as "bare hands"

The kind decides how the game reads the other results. "Mozzarella" is a `thing`, so the game makes the closest weapon and names it for the player's word.

- `apiForge` in [`server/server.mjs`](../server/server.mjs), `readForge` in [`web/src/main.js`](../web/src/main.js)

## 5. A Choice selects the story

The motive (`protect`, `revenge`, `glory`, `freedom`, `wonder`) selects one of five quest shapes. Each shape has its own first chapter and its own question at the camp before the boss. Sage2 reads that answer with a Choice (`resolve`) and an Extract (`vow`). The resolve gives a bonus in the boss fight. The vow is returned as the player's own words.

- `SHAPES` in [`game/story.mjs`](../game/story.mjs), `vowQuestions` in [`game/questions.mjs`](../game/questions.mjs)

## 6. Decisions feed a stream

The game adds each tactic, kill, block and hit to the fight's event log as a line of plain text. The director stream reads that log. After the first wave, it chooses rest (a heal) or a reinforcement pack. Only the revenge quest uses the pack.

- `director.event(...)` in [`web/src/fight.js`](../web/src/fight.js), `directorRelay` in [`server/server.mjs`](../server/server.mjs)

## 7. Legal options only

The fight code lists the legal tactics for each group. A group of one cannot flank, and a brute (the heavy minion kind) cannot guard. Sage2 picks from that list. When the answer arrives, the code checks it again against the fight as it is now.

- `legalFor` and `runTick` in [`web/src/fight.js`](../web/src/fight.js)

## 8. A Scale sets a number

Scale returns a number on a defined scale. `build` (1 to 4) sets the hero's body and damage. `tone` sets the look of the world.

- `BUILD_LEVELS`, `TONE_LEVELS` in [`game/kit.mjs`](../game/kit.mjs)
