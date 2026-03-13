<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongRatingChange extends Model
{
    protected $table = 'ping_pong_rating_changes';

    protected $fillable = ['player_id', 'match_id', 'mode', 'rating_change'];

    protected function casts(): array
    {
        return [
            'rating_change' => 'integer',
        ];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }
}
