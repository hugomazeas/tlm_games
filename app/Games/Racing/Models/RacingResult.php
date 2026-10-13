<?php

namespace App\Games\Racing\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * How one Hub player did in one race, as the game server reports it when the
 * race ends: their place, their time (null when they didn't finish) and their
 * fastest lap. A track's records are the best of these.
 */
class RacingResult extends Model
{
    /** How many players a track's record table lists. */
    public const RECORDS_SHOWN = 10;

    protected $table = 'racing_results';

    protected $fillable = [
        'racing_track_id',
        'player_id',
        'race_id',
        'position',
        'racers',
        'time_ms',
        'best_lap_ms',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'racers' => 'integer',
            'time_ms' => 'integer',
            'best_lap_ms' => 'integer',
        ];
    }

    public function track(): BelongsTo
    {
        return $this->belongsTo(RacingTrack::class, 'racing_track_id');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /**
     * A track's records: each player's best race time, fastest first, and the
     * single fastest lap anyone has driven on it.
     *
     * @return array{times: Collection<int, array{player_id: int, name: string, time_ms: int}>, lap: array{player_id: int, name: string, time_ms: int}|null}
     */
    public static function recordsFor(RacingTrack $track): array
    {
        $times = self::query()
            ->join('players', 'players.id', '=', 'racing_results.player_id')
            ->where('racing_track_id', $track->id)
            ->whereNotNull('time_ms')
            ->groupBy('racing_results.player_id', 'players.name')
            ->orderBy('best')
            ->orderBy('players.name')
            ->limit(self::RECORDS_SHOWN)
            ->get(['racing_results.player_id', 'players.name', DB::raw('MIN(time_ms) as best')])
            ->map(fn (self $row) => [
                'player_id' => (int) $row->player_id,
                'name' => $row->name,
                'time_ms' => (int) $row->best,
            ]);

        $lap = self::query()
            ->join('players', 'players.id', '=', 'racing_results.player_id')
            ->where('racing_track_id', $track->id)
            ->whereNotNull('best_lap_ms')
            ->orderBy('best_lap_ms')
            ->orderBy('racing_results.id')
            ->first(['racing_results.player_id', 'players.name', 'best_lap_ms']);

        return [
            'times' => $times->values(),
            'lap' => $lap ? ['player_id' => $lap->player_id, 'name' => $lap->name, 'time_ms' => $lap->best_lap_ms] : null,
        ];
    }
}
