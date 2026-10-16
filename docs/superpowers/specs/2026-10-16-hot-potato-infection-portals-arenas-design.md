# Hot potato: Infection, teleport portals, four new arenas

Last of the four hot potato sub-projects. Changes the simulation, so the AI policy is
retrained later (by the user, in quiz-app). Until then: AIs never play Infection, and they
don't observe portals (the observation's item list is fixed, so nothing breaks).

## 🦠 Infection (`mode: 'infection'`)

- People only, 3 or more; added AIs sit out (like Killer Potato). `NOT_ENOUGH_PLAYERS` otherwise.
- A random patient zero starts infected and frozen 3 s (`HUNTER_HEAD_START_MS`). No potato,
  no fuse (`holderId` null, `shake` 0).
- An infected, unfrozen player touching a clean, unshielded one infects them; the newly
  infected freeze 1 s (`INFECTED_FREEZE_MS`). Infected move 10% faster (`INFECTED_BOOST`).
  `SimPlayer.infectedAtMs` (null = clean); nobody is `out` for being infected.
- Each catch goes off like a blast: everyone within `INFECTION_BLAST_RADIUS` (6) but the one
  caught, the carrier too, is thrown clear (`INFECTION_BLAST_SPEED`, no steering for
  `INFECTION_BLAST_MS`), and a carrier still flying can't catch. One catch per step: one
  person at a time. Drawn as a green shockwave the blast's size.
- The infected are hard to miss: a toxic green wash over the avatar, a thick pulsing aura,
  two germs circling.
- Ends at the timer, when one clean player is left (none, if the game somehow started with
  one). If the last infected player leaves while three or more remain (two clean to chase), one becomes
  patient zero, frozen `HUNTER_HEAD_START_MS` (event `patientZero`, banner for the room);
  with fewer, the game ends. Winners: the clean players; if none, those
  infected last (same instant).
- Event `{ kind: 'infected', playerId, by }`; server message `infected` (recorded in replays).
- Results: clean first (position 1); then by infection time, later is better; leavers after
  everyone who stayed. `passes` = people you infected, `holdMs` = time spent clean.
  Laravel: `HotPotatoGame::MODE_INFECTION`, `InfectionProvider` ("Infection — survivals":
  survivals, then survival rate), seeded as a game mode.
- Always a big arena: `generateArena(…, { big: true })` is 80 × 50, furniture, walls and movers
  at the 12-player count scaled by the extra floor.

## 🌀 Teleport portals (every mode)

- `GameState.portals`: at most one pair at a time; the first at 20 s, then every 25–40 s
  (`nextPortalAtMs`); each lasts 12 s. The two ends are open floor (`findItemSpot`), at least
  40% of the arena's width apart.
- An alive, unfrozen player within `PORTAL_RADIUS` of an end comes out of the other with the
  same velocity, then ignores portals for 1 s (`portalCooldownMs`). Ghosts too.
- Event `{ kind: 'teleport', playerId, portalId }`; server message `teleport` (recorded).
- Snapshot `portals: [{ id, ax, ay, bx, by, expiresInMs }]`; drawn as two swirling rings in
  one colour, blinking for their last 3 s, with a burst at both ends on use.

## 🗺️ Arenas

`boardroom`, `server_room`, `library`, `gym` in `sim/themes.ts` (palette, shapes, density,
walls, movers, physics), part of "Surprise me".

## Page and chat

Mode picker, intro and hints for Infection; banners ("🦠 You're infected — go get them!",
"🦠 Hugo got infected"); infected avatars green with 🦠; the results card's headline
("🦠 Everyone got infected" when nobody stayed clean). The chat narrates start and results only.

## Testing

Sim: infection spread, freeze, shield, boost, end conditions, winners, leavers; portals spawn,
carry, cool down, expire; the new themes generate valid arenas at every size and big.
Sessions: Infection seats people only and needs 3; ranking; `infected`/`teleport` broadcast.
Laravel: results in the new mode, the Infection leaderboard.
