<?php

namespace App\Games\HotPotato\Models;

use App\Games\HotPotato\Services\Cosmetics;
use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A player's hot potato look from the locker: colour, hat, trail
 * and boom, as catalogue ids. A player who never visited the locker has the defaults.
 */
class HotPotatoLook extends Model
{
    protected $table = 'hot_potato_looks';

    protected $fillable = [
        'player_id',
        'colour',
        'hat',
        'trail',
        'boom',
    ];

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /**
     * The look the game draws for this player. A choice the catalogue dropped since falls back to its default.
     *
     * @return array{colour: string, hat: string, trail: string, boom: string}
     */
    public static function of(Player $player): array
    {
        $cosmetics = app(Cosmetics::class);
        $stored = self::where('player_id', $player->id)->first();
        $look = $cosmetics->defaults();

        foreach (Cosmetics::SLOTS as $slot) {
            if ($stored && in_array($stored->{$slot}, $cosmetics->ids($slot), true)) {
                $look[$slot] = $stored->{$slot};
            }
        }

        return $look;
    }
}
