<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongTournamentMatch extends Model
{
    protected $table = 'ping_pong_tournament_matches';

    protected $fillable = [
        'tournament_id',
        'round',
        'position',
        'player_left_id',
        'player_right_id',
        'winner_id',
        'match_id',
    ];

    protected function casts(): array
    {
        return [
            'round' => 'integer',
            'position' => 'integer',
        ];
    }

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(PingPongTournament::class, 'tournament_id');
    }

    public function playerLeft(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_left_id');
    }

    public function playerRight(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_right_id');
    }

    public function winner(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'winner_id');
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id')->includingTournaments();
    }

    public function isReady(): bool
    {
        return $this->player_left_id && $this->player_right_id && ! $this->winner_id;
    }
}
