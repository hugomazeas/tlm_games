<?php

namespace App\Games\Putter\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PutterGame extends Model
{
    protected $table = 'putter_games';

    protected $fillable = [
        'player_id',
        'results',
        'makes',
        'balls',
    ];

    protected function casts(): array
    {
        return [
            'results' => 'array',
        ];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
