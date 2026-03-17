<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongMatchPoint extends Model
{
    public $timestamps = false;

    protected $table = 'ping_pong_match_points';

    protected $fillable = [
        'match_id',
        'sequence',
        'scoring_side',
        'player_left_score',
        'player_right_score',
        'server_id',
        'scored_at',
    ];

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'player_left_score' => 'integer',
            'player_right_score' => 'integer',
            'scored_at' => 'datetime',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'server_id');
    }
}
