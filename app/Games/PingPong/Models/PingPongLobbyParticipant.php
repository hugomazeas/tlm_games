<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongLobbyParticipant extends Model
{
    protected $table = 'ping_pong_lobby_participants';

    protected $fillable = [
        'lobby_id',
        'player_id',
        'side',
        'session_token',
        'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
        ];
    }

    public function lobby(): BelongsTo
    {
        return $this->belongsTo(PingPongLobby::class, 'lobby_id');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_id');
    }
}
