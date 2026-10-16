<?php

namespace App\Games\HotPotato\Models;

use App\Models\Office;
use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of an office's hot potato chat, written by the game server: a
 * message (player and body) or an event (data the page words, names captured then).
 */
class HotPotatoChatLine extends Model
{
    public const KIND_MESSAGE = 'message';

    public const KIND_EVENT = 'event';

    /** Lines kept per office; older ones are pruned as new ones arrive. */
    public const KEEP_PER_OFFICE = 1000;

    /** Lines the game server loads for an office's history. */
    public const HISTORY = 100;

    protected $table = 'hot_potato_chat_lines';

    /** Milliseconds kept: the game server tells a line it already has by its exact time. */
    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $fillable = [
        'office_id',
        'player_id',
        'kind',
        'body',
        'event',
        'posted_at',
    ];

    protected function casts(): array
    {
        return [
            'event' => 'array',
            'posted_at' => 'datetime',
        ];
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
