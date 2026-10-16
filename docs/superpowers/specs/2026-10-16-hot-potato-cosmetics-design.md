# Hot potato cosmetics

Players dress up their avatar and their potato. Second of four hot potato sub-projects
(replays → **cosmetics** → challenges → sim content).

## Goals

- Five slots, all free, seen by everyone in live games and replays: colour, potato skin,
  hat, trail, boom.
- Customising needs a claimed (PIN set) and unlocked profile.
- Edit on a locker page per player, or pick a potato skin in the lobby.

## Non-goals

- No unlocks (challenges may add them later), no personal-only page looks, no sounds.
- No cosmetics in racing.

## Catalogue

`game-server/src/cosmetics.json`, one list per slot, each entry `{ id, label, value }`
(value: a hex colour or an emoji), exactly one entry per slot marked `default: true`.
TypeScript imports it (`src/cosmetics.ts`: types, `defaultLook`, `isValidLook`,
`randomLook`); Laravel reads the same file (`Cosmetics` service) to validate, so the two
never drift.

| Slot | Default | Others |
|---|---|---|
| colour | `auto` (the hashed colour) | 12 swatches |
| skin (drawn while you hold it) | 🥔 | gold 🥔 (gold glow), 🍠 🎃 🥚 🥑 🧀 💣 🍩 🌶️ |
| hat (above the avatar, name moves up) | none | 🎩 🧢 🎓 ⛑️ 🎀 🌼 🦄 🤠 |
| trail (speed, boost) | colour ghosts | ✨ 🔥 💖 🫧 ⭐ |
| boom (the splat) | 🥧 | 🎉 👻 💀 🎆 🧊 |

King keeps 👑 over the potato; the Killer Potato hunter keeps the default look.

## Laravel

- Table `hot_potato_looks`: `player_id` (unique, cascade), `colour`, `skin`, `hat`, `trail`,
  `boom` (strings). Model `HotPotatoLook`; `HotPotatoLook::of(Player)` gives the stored
  look or the defaults.
- Editing is allowed when the player has a PIN and `PlayerPinService::isUnlocked` (stricter
  than profiles, where unclaimed players are open).
- `GET /games/hot-potato/locker/{player}`: the locker. Swatches per slot and a CSS
  preview; locked → a PIN field posting to `/players/{player}/unlock`, which comes back to
  the locker (`redirect` field, same-site paths only); unclaimed → how to claim, linking
  to the profile.
- `PUT /games/hot-potato/locker/{player}`: JSON, each slot validated against the catalogue,
  403 `Claim or unlock this profile to customise` otherwise. Returns the look.
- `/internal/hot-potato/players/{id}` adds `look`.
- Links: "🎨 Locker" beside the "You are" picker on the hot potato page, and on the profile.

## Game server

- `PlayerInfo.look?: Look`; `LaravelClient.findPlayer` reads it (defaults when absent).
- AI seats get `randomLook(botNameRng)` when added: cosmetic only, never shifts a game.
- Client message `refreshLook`: from a lobby member during the lobby, the server re-fetches
  the player from Laravel and `SessionManager.updatePlayer` swaps their `PlayerInfo` and
  re-broadcasts the lobby. Anything else is ignored.
- Renderer: `RendererOptions.lookOf(id)`; colour (auto → `colourFor`), skin while holding,
  hat, emoji trail, boom emoji instead of 🥧.
- Lobby: chips in the player's colour with their hat; members get a skin row that PUTs to
  the locker endpoint, then sends `refreshLook`; a 403 shows a link to the locker.
- Replays carry looks: the roster stores `PlayerInfo`.

## Testing

- Laravel `HotPotatoLockerTest`: claim/unlock rules, catalogue validation, defaults, the
  internal endpoint's `look`, the page (locked, unclaimed, unlocked), the unlock redirect back.
- Bun: catalogue (one default per slot, unique ids), `isValidLook`, bots get valid looks,
  `refreshLook` only in the lobby and for members, replay roster carries looks.
