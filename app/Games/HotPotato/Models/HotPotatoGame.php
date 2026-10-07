<?php

namespace App\Games\HotPotato\Models;

use App\Models\Office;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HotPotatoGame extends Model
{
    protected $table = 'hot_potato_games';

    protected $fillable = [
        'office_id',
        'seed',
        'theme',
        'duration_seconds',
        'started_at',
        'ended_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function players(): HasMany
    {
        return $this->hasMany(HotPotatoGamePlayer::class);
    }
}
