<?php

namespace App\Games\OfficeFps\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One office FPS match, as the game server reported it when it ended. */
class OfficeFpsMatch extends Model
{
    /** Free for all, team deathmatch, king of the meeting room. */
    public const MODES = ['ffa', 'tdm', 'koth'];

    /** How the pages name each mode. */
    public const MODE_LABELS = [
        'ffa' => 'Free for all',
        'tdm' => 'Team deathmatch',
        'koth' => 'King of the meeting room',
    ];

    protected $table = 'office_fps_matches';

    protected $fillable = ['started_at', 'ended_at', 'frag_limit', 'minutes', 'player_count', 'mode'];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function results(): HasMany
    {
        return $this->hasMany(OfficeFpsResult::class);
    }

    public function kills(): HasMany
    {
        return $this->hasMany(OfficeFpsKill::class);
    }
}
