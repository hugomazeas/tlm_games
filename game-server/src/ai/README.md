# AI players

The hot potato AI players are steered by a neural policy trained by self-play (PPO) on this game's
simulation. The training tools are not in this repository: they live in quiz-app
(`samuelloranger/quiz-app`, `tools/bot-training/` on the branch `feat/hot-potato-rl-nav`), which plays
the same policy as its « IA entraînée » bot difficulty.

## Files

- `observation.ts`, `nav.ts`: the 137 features the policy sees (its own state, the seven nearest
  players, the nearest item of each kind, wall feelers, geodesic navigation, recent motion). Copied
  from the training environment; they must not change unless the policy is retrained.
- `policy.ts`: the exported policy format (`hot-potato-policy`), `checkPolicy`, the forward pass and
  the 17-action steering table.
- `pilot.ts`: `TrainedPilot`, one per AI seat and game. It decides every `action_repeat` × 50 ms of game
  time (200 ms), holds its steering in between and samples its position every 50 ms, as in training.
- `trained-policy.json`: the policy, loaded by `server.ts` and handed to `SessionManager` as `botPolicy`.
- `fixtures/`: games recorded in the training environment (`training-observations.json`) and the
  policy's reference logits (`trained-policy-logits.json`), used by `pilot.test.ts`.

## Training and shipping a new policy

Follow quiz-app's `tools/bot-training/README.md` ("Shipping a policy to the games"). In short:

1. The training environment must run **this** game's rules. Its simulation is quiz-app's
   `packages/shared/src/hot-potato/sim`, the same code as `game-server/src/sim` here (formatting
   aside). Compare them first (item timing, physics, arena generation) and align the training copy.
2. Train (`--preset league` is the current recipe), then export the best checkpoint with
   `trainer.export --float32`.
3. Record the parity fixtures with `env/record-parity.ts` and compute the logits with
   `trainer.gamefixture`, both from the training tools.
4. Replace `trained-policy.json` and the two files in `fixtures/`, then run `bun test src/ai src/sessions.test.ts`.
   The pilot must observe the recorded games exactly and reproduce the logits.
5. Play a game against a few AIs before shipping.
