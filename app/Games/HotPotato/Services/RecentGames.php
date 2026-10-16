<?php

namespace App\Games\HotPotato\Services;

use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Support\Collection;

/**
 * The recent games lists: on the hot potato page (per office) and on a
 * player's profile. Each game links to its replay while it still has one.
 */
class RecentGames
{
    public const PER_OFFICE = 20;

    public const PER_PLAYER = 10;

    /**
     * The newest games of every office, keyed by office id.
     *
     * @return Collection<int, Collection<int, array{id: int, mode: string, arena: string, ended_at: \Illuminate\Support\Carbon, winners: string, replay_url: ?string}>>
     */
    public function byOffice(): Collection
    {
        return Office::query()->pluck('id')->mapWithKeys(fn (int $officeId) => [
            $officeId => HotPotatoGame::query()
                ->where('office_id', $officeId)
                ->with('players.player:id,name')
                ->latest('id')
                ->limit(self::PER_OFFICE)
                ->get()
                ->map(fn (HotPotatoGame $game) => $this->summary($game)),
        ])->filter(fn (Collection $games) => $games->isNotEmpty());
    }

    /**
     * One office's newest games, for the page to refresh its list after a game.
     *
     * @return Collection<int, array{id: int, mode: string, arena: string, ended_at: \Illuminate\Support\Carbon, winners: string, replay_url: ?string}>
     */
    public function forOffice(Office $office): Collection
    {
        return HotPotatoGame::query()
            ->where('office_id', $office->id)
            ->with('players.player:id,name')
            ->latest('id')
            ->limit(self::PER_OFFICE)
            ->get()
            ->map(fn (HotPotatoGame $game) => $this->summary($game));
    }

    /**
     * The player's newest games, with where they finished.
     *
     * @return Collection<int, array{id: int, mode: string, arena: string, ended_at: \Illuminate\Support\Carbon, winners: string, replay_url: ?string, position: int, survived: bool}>
     */
    public function forPlayer(Player $player): Collection
    {
        return HotPotatoGamePlayer::query()
            ->where('player_id', $player->id)
            ->with('game.players.player:id,name')
            ->latest('id')
            ->limit(self::PER_PLAYER)
            ->get()
            ->map(fn (HotPotatoGamePlayer $row) => [
                ...$this->summary($row->game),
                'position' => $row->position,
                'survived' => $row->survived,
            ]);
    }

    /**
     * @return array{id: int, mode: string, arena: string, ended_at: \Illuminate\Support\Carbon, winners: string, replay_url: ?string}
     */
    private function summary(HotPotatoGame $game): array
    {
        $winners = $game->players->where('survived', true)->map(fn (HotPotatoGamePlayer $row) => $row->player?->name)->filter();

        return [
            'id' => $game->id,
            'mode' => $game->modeLabel(),
            'arena' => $game->arenaLabel(),
            'ended_at' => $game->ended_at,
            'winners' => $winners->isNotEmpty()
                ? $winners->join(', ')
                : ($game->mode === HotPotatoGame::MODE_KILLER ? 'The Killer Potato' : 'Nobody'),
            'replay_url' => $game->hasReplay() ? url("/games/hot-potato/replays/{$game->id}") : null,
        ];
    }
}
