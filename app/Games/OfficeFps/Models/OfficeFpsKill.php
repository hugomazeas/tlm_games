<?php

namespace App\Games\OfficeFps\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One kill in a match. A guest's side (killer or victim) is null. */
class OfficeFpsKill extends Model
{
    /** What a kill can be made with: today's guns and the stapler, and the blaster of older matches. */
    public const WEAPONS = ['rifle', 'sniper', 'shotgun', 'pistol', 'launcher', 'stapler', 'blaster'];

    /** The blaster was replaced by the loadout's guns; its kills stay in the records. */
    public const RETIRED_WEAPONS = ['blaster'];

    public const WEAPON_LABELS = [
        'rifle' => '🔫 Assault rifle',
        'sniper' => '🎯 Sniper',
        'shotgun' => '💥 Shotgun',
        'pistol' => '🔫 Pistol',
        'launcher' => '🚀 Launcher',
        'stapler' => '📎 Stapler',
        'blaster' => '🔫 Blaster',
    ];

    protected $table = 'office_fps_kills';

    protected $fillable = ['office_fps_match_id', 'killer_id', 'victim_id', 'weapon', 'headshot', 'backstab', 'at_ms'];

    protected function casts(): array
    {
        return [
            'headshot' => 'boolean',
            'backstab' => 'boolean',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(OfficeFpsMatch::class, 'office_fps_match_id');
    }

    public function killer(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'killer_id');
    }

    public function victim(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'victim_id');
    }
}
