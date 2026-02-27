# Games Hub

Office gaming dashboard — a unified Laravel app to host multiple game trackers (archery, ping pong, and future games).

## Quick Start

```bash
make build && make up    # Build & start (accessible at http://localhost:8080)
make down                # Stop
make fresh               # Reset DB (migrate:fresh --seed)
make shell               # Shell into container
make logs                # Tail container logs
```

## Tech Stack

- **Laravel 12** with **PHP 8.3**
- **SQLite** database (no external DB needed)
- **Blade + Tailwind CDN + Alpine.js CDN** (no frontend build step)
- **Docker**: PHP-FPM Alpine + Nginx + Supervisor (single container)

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make build` | Build Docker image |
| `make up` | Start container (detached) |
| `make down` | Stop container |
| `make restart` | Restart container |
| `make shell` | Open shell in container |
| `make logs` | Follow container logs |
| `make migrate` | Run migrations |
| `make seed` | Run seeders |
| `make fresh` | Fresh migration + seed |
| `make test` | Run tests |
| `make tinker` | Open Tinker REPL |
| `make status` | Show container status |

## Routes

```
GET  /                              Dashboard with game cards
GET  /players                       Player list + inline create form
POST /players                       Create player
GET  /players/{player}              Player detail + game stats
GET  /players/{player}/edit         Edit player form
PUT  /players/{player}              Update player
DELETE /players/{player}            Delete player
GET  /leaderboards                  All game types
GET  /leaderboards/{gameType:slug}  Per-game leaderboard (dynamic columns)
```

## Architecture

### Game Module Pattern

Each game lives under `app/Games/{GameName}/` with its own:
- `Controllers/`, `Models/`, `Services/`
- `Providers/{Game}ServiceProvider.php`
- `routes.php`
- Views in `resources/views/games/{slug}/`
- Migration in `database/migrations/`

### LeaderboardProviderInterface

Games expose leaderboard data by implementing `App\Contracts\LeaderboardProviderInterface`:

```php
interface LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string;
    public function getLeaderboard(): Collection;        // Returns ranked entries
    public function getPlayerStats(int $playerId): ?array; // Per-player stats
}
```

The game's ServiceProvider registers its provider with `LeaderboardService`:

```php
public function boot(): void
{
    $leaderboard = $this->app->make(LeaderboardService::class);
    $leaderboard->register(new ArcheryLeaderboardProvider());
}
```

### Adding a New Game Module

1. Create `app/Games/{Name}/` with Controllers, Models, Services, Providers
2. Implement `LeaderboardProviderInterface` in a provider class
3. Create a ServiceProvider that registers routes and the leaderboard provider
4. Add the ServiceProvider to `config/games.php` `modules` array
5. Set `is_active = true` on the corresponding `game_types` row
6. Add migration for game-specific tables in `database/migrations/`
7. Add views in `resources/views/games/{slug}/`

### Config

- `config/games.php` — lists game module ServiceProvider classes to auto-register
- `game_types` DB table — metadata for each game (icon, color, leaderboard column definitions)
- Leaderboard columns are defined as JSON on the `game_types` table and rendered dynamically

## Related Apps

- `../arc_tracker/` — Standalone archery tracker (to be migrated into this hub)
- `../ping_ping_app/` — Standalone ping pong tracker (to be migrated into this hub)
