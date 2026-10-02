<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PingPongTournament extends Model
{
    protected $table = 'ping_pong_tournaments';

    protected $fillable = [
        'name',
        'status',
        'winner_id',
    ];

    public function winner(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'winner_id');
    }

    /**
     * Bracket slots, in play order.
     */
    public function bracket(): HasMany
    {
        return $this->hasMany(PingPongTournamentMatch::class, 'tournament_id')
            ->orderBy('round')
            ->orderBy('position');
    }

    /**
     * The real matches played in this tournament.
     */
    public function matches(): HasMany
    {
        return $this->hasMany(PingPongMatch::class, 'tournament_id')->includingTournaments();
    }

    public function isComplete(): bool
    {
        return $this->status === 'completed';
    }
}
