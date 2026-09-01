<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Office extends Model
{
    protected $fillable = [
        'name',
        'buro_office_id',
        'matchmaking_enabled',
        'matchmaking_start',
        'matchmaking_end',
    ];

    protected function casts(): array
    {
        return [
            'matchmaking_enabled' => 'boolean',
        ];
    }

    public function players(): HasMany
    {
        return $this->hasMany(Player::class);
    }

    /**
     * Offices the hourly draw should consider.
     *
     * Enabling the toggle without mapping a Buro office would leave the
     * matchmaker with no way to learn who is in today, so both are required.
     */
    public function scopeMatchmaking(Builder $query): Builder
    {
        return $query->where('matchmaking_enabled', true)->whereNotNull('buro_office_id');
    }

    public function participatesInMatchmaking(): bool
    {
        return $this->matchmaking_enabled && filled($this->buro_office_id);
    }
}
