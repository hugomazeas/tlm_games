<?php

namespace App\Games\Typing\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TypingRace extends Model
{
    public const CAP_SECONDS = 120;

    protected $table = 'typing_races';

    protected $fillable = [
        'language',
        'source',
        'text',
        'status',
        'starts_at',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
        ];
    }

    public function racers(): HasMany
    {
        return $this->hasMany(TypingRacePlayer::class)->orderBy('id');
    }

    public function results(): HasMany
    {
        return $this->hasMany(TypingTest::class);
    }

    /**
     * The player who may start the race: whoever joined first (the creator,
     * or the next in line if they left the lobby).
     */
    public function hostPlayerId(): ?int
    {
        return $this->racers()->value('player_id');
    }

    public function isOverdue(): bool
    {
        return $this->status === 'running' && $this->starts_at->copy()->addSeconds(self::CAP_SECONDS)->lte(now());
    }

    /**
     * @return array{id: int, language: string, source: string, text: string, status: string, starts_at: ?string, now: string, racers: list<array<string, mixed>>}
     */
    public function toBroadcast(): array
    {
        $this->loadMissing('racers.player');
        $results = $this->status === 'finished' ? $this->results()->get()->keyBy('player_id') : collect();

        return [
            'id' => $this->id,
            'language' => $this->language,
            'source' => $this->source,
            'text' => $this->text,
            'status' => $this->status,
            'starts_at' => $this->starts_at?->toISOString(),
            'now' => now()->toISOString(),
            'host_player_id' => $this->hostPlayerId(),
            'racers' => $this->racers->map(fn (TypingRacePlayer $racer) => [
                'player_id' => $racer->player_id,
                'player_name' => $racer->player->name,
                'progress_chars' => $racer->progress_chars,
                'finished' => $racer->finish_ms !== null,
                'finish_ms' => $racer->finish_ms,
                'place' => $racer->place,
                'wpm' => $results->get($racer->player_id)?->wpm,
                'accuracy' => $results->get($racer->player_id)?->accuracy,
            ])->values()->all(),
        ];
    }
}
