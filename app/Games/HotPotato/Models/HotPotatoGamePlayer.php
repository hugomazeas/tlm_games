<?php

namespace App\Games\HotPotato\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HotPotatoGamePlayer extends Model
{
    protected $table = 'hot_potato_game_players';

    protected $fillable = [
        'hot_potato_game_id',
        'player_id',
        'position',
        'survived',
        'eliminated_at_ms',
        'hold_ms',
        'passes',
    ];

    protected function casts(): array
    {
        return [
            'survived' => 'boolean',
        ];
    }

    /**
     * Only rows from games played in one mode, so a King of the Potato crown
     * never counts as a survival and the other way round.
     */
    public function scopeInMode(Builder $query, string $mode): void
    {
        $query->whereIn('hot_potato_game_id', HotPotatoGame::query()->select('id')->where('mode', $mode));
    }

    public function game(): BelongsTo
    {
        return $this->belongsTo(HotPotatoGame::class, 'hot_potato_game_id');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
