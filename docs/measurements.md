# Measurements

Each measured number in this repo comes from a script in [`bench/`](../bench) and a raw file in [`bench/measurements/`](../bench/measurements). All runs took place on 2026-11-18, on the game code of this repo, against `https://sage.levanto.ai`. They ran from one consumer network in Europe. Each bench raw file records a hash of the game files at run time (`gameTreeMd5`). After the runs, the repo changed comments and a few display texts. No measured Sage2 question changed. Times are client wall clock unless the row says server time.

To run a script, put `SAGE_API_KEY` in `.env` and run it from the repo root. Set the same `BENCH_DATE` on each run, because `cost-summary` reads the `tactics`, `world` and `step-latency` files of that date. The `step-latency` file comes from `node bench/step-latency.mjs --base http://localhost:8790`. Scripts that say `--base` need the local server (`npm start`). New raw files go to `bench/measurements/`.

## Combat tactics

The test uses 256 fight states. They cover the 4 regular minion kinds, 1 or 2 minions left in the group, and two health states. They also cover two distances, four hero actions, and whether reinforcements are available. Each state gets the legal tactics that the game gives it. In 16 states, 1 tactic is legal, so the game uses it without a call. The other 240 states go to Sage2, each as one Choice.

| | Result | Command | Raw file |
|---|---|---|---|
| Median time per decision | 264 ms, the mean of two run medians (268 and 261 ms). Server time 113–116 ms | `node bench/probe-tactics.mjs --runs 2` | `tactics-2026-11-18.json` |
| Cost per decision | $0.0000162 (324 input tokens, 0 output) | `BENCH_DATE=2026-11-18 node bench/cost-summary.mjs --pricing bench/measurements/pricing-2026-11-18.json` | `cost-2026-11-18.json` |
| Tactics that Sage2 used | 6 of 6 | `node bench/probe-tactics.mjs --runs 2` | `tactics-2026-11-18.json` |
| Tactics that the fixed rules used, on all 256 states | 3 of 6 | `node bench/fixed-rules.mjs --sage bench/measurements/tactics-2026-11-18.json` | `fixed-rules-2026-11-18.json` |

## LLM alone

The same tactic questions and options went to two LLMs through the Claude Code CLI (`claude -p`). The instruction said to answer with one option id as JSON. The script sampled 48 fight states. Five of them have 1 legal tactic, so the script did not send them. That left 43 states, with 2 runs per model.

| | Sage2 | Haiku 5.5 | Fable 5.2 |
|---|---|---|---|
| Median time per decision | 264 ms | 1.6 s | 2.5 s |
| Mean cost per decision | $0.0000162 | $0.00017 | $0.0099 |
| Probability for each option | Returned | Not returned | Not returned |

The LLM time is the CLI value `duration_api_ms`: the model call, without CLI start-up. The LLM cost is the list-price figure that the CLI reports. Command: `node bench/llm-baseline.mjs --models claude-haiku-5-5,claude-fable-5-2 --runs 2 --sample 48 --concurrency 2`. Raw files: `llm-baseline-2026-11-18.json` and `llm-baseline-calls-2026-11-18.jsonl`.

## Character creation

| | Result | Command | Raw file |
|---|---|---|---|
| Sage2 cost of the six creation steps | $0.00114 | `BENCH_DATE=2026-11-18 node bench/cost-summary.mjs --pricing bench/measurements/pricing-2026-11-18.json` | `cost-2026-11-18.json` |
| Motive, on 15 answers that state a reason | 15 of 15, both runs | `node bench/heart-eval.mjs --base http://localhost:8790 --runs 2` | `heart-2026-11-18.json` |
| World, on 40 clear home answers | 40 of 40, both runs | `node bench/probe-world.mjs --runs 2 --rows` | `world-2026-11-18.json` |

## One full play

A headless browser typed the answers and fought to the end card, with the hero kept at full health. The calls went through the local copy of the Vercel functions.

| | Result | Command | Raw file |
|---|---|---|---|
| Sage2 cost of one play | $0.0021 | `node tools/build-vercel.mjs`, `PORT=8799 node tools/vercel-local.mjs`, then `node bench/play-cost.mjs --url http://localhost:8799 --drive` | `play-cost-2026-11-18.json` |

## Streaming

The test uses 57 answers: 40 home answers with the land Choice and 17 loved-ones answers with the motive Choice. The script sends one word every 400 ms through the game's relay.

| | Result | Command | Raw file |
|---|---|---|---|
| Pick final before the last word | 54 of 57 | `node bench/stream-latency.mjs --path relay --base http://localhost:8790 --concurrency 1` | `stream-relay-2026-11-18.json` |
| How early, median | 2.2 s | same | same |
| Share of the answer heard when the pick settled, median | 33% | same | same |
| Streamed pick equals the batch pick | 57 of 57 | same | same |
| Director: time from question to answer through the relay, one-wave logs (6 samples), median | 322 ms | `node bench/director-latency.mjs --base http://localhost:8790 --reps 3` | `director-2026-11-18.json` |
