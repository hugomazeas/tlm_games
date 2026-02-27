<?php

namespace App\Games\Archery\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArcheryGame extends Model
{
    protected $table = 'archery_games';

    protected $fillable = [
        'player_id',
        'arrow_data',
        'target_numbers',
        'base_score',
        'bonus_score',
        'total_score',
    ];

    protected function casts(): array
    {
        return [
            'arrow_data' => 'array',
            'target_numbers' => 'array',
        ];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
