<?php

namespace App\Games\Typing\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TypingRacePlayer extends Model
{
    protected $table = 'typing_race_players';

    protected $fillable = [
        'typing_race_id',
        'player_id',
        'typed',
        'progress_chars',
        'keystrokes',
        'errors',
        'finish_ms',
        'place',
    ];


    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    public function race(): BelongsTo
    {
        return $this->belongsTo(TypingRace::class, 'typing_race_id');
    }
}
