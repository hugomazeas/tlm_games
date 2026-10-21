# AI players

The hot potato AI players are steered by neural policies trained by self-play (PPO) on this game's
simulation. The training tools are not in this repository: they live in quiz-app
(`samuelloranger/quiz-app`, `tools/bot-training/`), which plays the same policies as its bot difficulties.
This code is a port of quiz-app's `packages/shared/src/hot-potato/ai`; keep the two in step.

## Levels and policies

The host picks a level when adding an AI (`addBot {level}`; no level means `easy`). Each level is a set of
three policies, built in `server.ts` and handed to `SessionManager` as `aiPolicies`:

| File | Easy | Hard | Used for |
| --- | --- | --- | --- |
| `easy-policy.json` | main, King | | survival and Killer prey; King of the potato |
| `hard-policy.json` | | main | survival and Killer prey (has a GRU memory, decides every 100 ms) |
| `hard-king-policy.json` | | King | King of the potato (GRU memory, every 100 ms) |
| `hunter-policy.json` | hunter | hunter | the Killer Potato hunter, both levels (every 200 ms) |

A seat's pilot is created with the policy of its level for the mode; an AI that takes the knife in
Killer Potato switches to its level's hunter policy (`TrainedPilot.usePolicy`, which keeps the seat's
motion memory). Infection seats people only. A file that does not load turns off the levels that use it.

## Files

- `observation.ts`, `nav.ts`: the 256 features the policy sees (obs spec 6: its own state, the seven nearest
  players and their effects, the nearest item of each kind, wall feelers, geodesic navigation, recent and
  ten-second motion memory, portals, the Killer Potato flag, its last actions). They must not change unless
  the policies are retrained.
- `policy.ts`: the policy format (`hot-potato-policy`; `decodePolicy` reads the compact `f32-base64`
  files), `checkPolicy`, the forward pass with the GRU state, and the 17-action steering table.
- `pilot.ts`: `TrainedPilot`, one per AI seat and game. It decides every `action_repeat` x 50 ms of game
  time (the policy's own cadence), holds its steering in between and samples positions every 50 ms.
- `*-policy.json`: the four policies above.
- `fixtures/`: games recorded in the training environment (`training-observations.json`, checked by
  `pilot.test.ts`) and each policy's reference logits (`<name>-policy-logits.json`, with `starts` marking
  where a GRU state resets), checked by `bundled-policies.test.ts`.

## Training and shipping a new policy

Follow quiz-app's `tools/bot-training/README.md` ("Shipping a policy to the games"). In short:

1. The training environment must run **this** game's rules. Its simulation is quiz-app's
   `packages/shared/src/hot-potato/sim`, the same code as `game-server/src/sim` here (formatting
   aside). Compare them first (item timing, physics, arena generation) and align the training copy.
2. Train, then export the best checkpoint with `trainer.export --compact`.
3. Record the parity fixtures with `env/record-parity.ts` and compute each policy's logits with
   `trainer.gamefixture`, both from the training tools.
4. Replace the policy file and its `fixtures/<name>-policy-logits.json` (and `training-observations.json`
   when the observation changed), then run `bun test src/ai src/sessions.test.ts`. The pilot must observe
   the recorded games exactly and every policy must reproduce its logits.
5. Play a game against a few AIs of each level before shipping.
