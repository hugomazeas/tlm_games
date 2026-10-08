<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongChatMessage extends Model
{
    protected $table = 'ping_pong_chat_messages';

    protected $fillable = ['match_id', 'player_id', 'body', 'gif', 'created_at'];

    protected function casts(): array
    {
        return [
            'gif' => 'array',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id')->includingTournaments();
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /**
     * Shape shared by the history endpoint and the broadcast event.
     *
     * @return array{id: int, match_id: int, body: string, gif: array{title: string, preview_url: string, url: string, width: int, height: int}|null, created_at: string, player: array{id: int, name: string, avatar_url: string|null}}
     */
    public function toChatPayload(): array
    {
        $this->loadMissing('player');

        return [
            'id' => $this->id,
            'match_id' => $this->match_id,
            'body' => $this->body,
            'gif' => $this->gif ? [
                'title' => $this->gif['title'],
                'preview_url' => $this->gif['preview_url'],
                'url' => $this->gif['url'],
                'width' => $this->gif['width'],
                'height' => $this->gif['height'],
            ] : null,
            'created_at' => $this->created_at->toIso8601String(),
            'player' => [
                'id' => $this->player->id,
                'name' => $this->player->name,
                'avatar_url' => $this->player->avatarUrl(),
            ],
        ];
    }
}
