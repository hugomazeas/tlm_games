<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GameMode extends Model
{
    protected $fillable = [
        'game_type_id',
        'slug',
        'name',
        'description',
        'leaderboard_columns',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'leaderboard_columns' => 'array',
        ];
    }

    public function gameType(): BelongsTo
    {
        return $this->belongsTo(GameType::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
