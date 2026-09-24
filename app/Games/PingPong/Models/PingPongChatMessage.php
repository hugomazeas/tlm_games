<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongChatMessage extends Model
{
    protected $table = 'ping_pong_chat_messages';

    protected $fillable = ['player_id', 'body', 'created_at'];

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /**
     * Shape shared by the history endpoint and the broadcast event.
     *
     * @return array{id: int, body: string, created_at: string, player: array{id: int, name: string}}
     */
    public function toChatPayload(): array
    {
        $this->loadMissing('player');

        return [
            'id' => $this->id,
            'body' => $this->body,
            'created_at' => $this->created_at->toIso8601String(),
            'player' => [
                'id' => $this->player->id,
                'name' => $this->player->name,
            ],
        ];
    }
}
