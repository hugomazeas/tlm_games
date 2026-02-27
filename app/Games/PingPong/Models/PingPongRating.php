<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongRating extends Model
{
    protected $table = 'ping_pong_ratings';

    protected $fillable = ['player_id', 'elo_rating'];

    protected function casts(): array
    {
        return [
            'elo_rating' => 'integer',
        ];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
