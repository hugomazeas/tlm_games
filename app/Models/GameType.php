<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameType extends Model
{
    protected $fillable = [
        'slug',
        'name',
        'description',
        'icon',
        'color',
        'is_active',
        'min_players',
        'max_players',
        'leaderboard_columns',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'leaderboard_columns' => 'array',
        ];
    }

    public function gameModes(): HasMany
    {
        return $this->hasMany(GameMode::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
