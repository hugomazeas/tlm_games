<?php

namespace App\Games\Typing\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TypingTest extends Model
{
    protected $table = 'typing_tests';

    protected $fillable = [
        'player_id',
        'typing_race_id',
        'language',
        'source',
        'text',
        'typed',
        'wpm',
        'raw_wpm',
        'accuracy',
        'duration_ms',
        'issued_at',
        'submitted_at',
        'restarted_at',
    ];

    protected function casts(): array
    {
        return [
            'wpm' => 'float',
            'raw_wpm' => 'float',
            'accuracy' => 'float',
            'issued_at' => 'datetime',
            'submitted_at' => 'datetime',
            'restarted_at' => 'datetime',
        ];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /**
     * @param  Builder<TypingTest>  $query
     */
    public function scopeSubmitted(Builder $query): void
    {
        $query->whereNotNull('submitted_at');
    }
}
