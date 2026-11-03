<?php

namespace App\Games\OfficeFps\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One Hub player's match: their place and everything they did in it. */
class OfficeFpsResult extends Model
{
    /** The sides in team deathmatch (a result's team is null in the other modes). */
    public const TEAMS = ['red', 'blue'];

    protected $table = 'office_fps_results';

    protected $fillable = [
        'office_fps_match_id',
        'player_id',
        'place',
        'kills',
        'deaths',
        'headshots',
        'damage',
        'shots',
        'hits',
        'melee_kills',
        'backstabs',
        'best_streak',
        'played_ms',
        'left',
        'team',
        'won',
        'zone_ms',
        'pickups',
    ];

    protected function casts(): array
    {
        return [
            'left' => 'boolean',
            'won' => 'boolean',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(OfficeFpsMatch::class, 'office_fps_match_id');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
