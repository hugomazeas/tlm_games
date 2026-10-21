<?php

namespace App\Games\Racing\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A player's kart colours from the garage: the body (chassis and nose) and
 * the accent (rear wing and the driver's suit). A player who never visited
 * the garage, or a guest, drives the default kart.
 */
class RacingKart extends Model
{
    public const DEFAULT_BODY = '#d23c3c';

    public const DEFAULT_ACCENT = '#2b5fa8';

    public const GUEST_NAME = 'Guest';

    protected $table = 'racing_karts';

    protected $fillable = [
        'player_id',
        'body',
        'accent',
    ];

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /**
     * How a driver looks to the game: their name over a kart in their colours.
     *
     * @return array{name: string, body: string, accent: string}
     */
    public static function lookOf(?Player $player): array
    {
        $kart = $player ? self::where('player_id', $player->id)->first() : null;

        return [
            'name' => $player->name ?? self::GUEST_NAME,
            'body' => $kart->body ?? self::DEFAULT_BODY,
            'accent' => $kart->accent ?? self::DEFAULT_ACCENT,
        ];
    }

    /**
     * Every player and their kart, by name: who a newcomer picks from in the game's welcome screen.
     *
     * @return list<array{id: int, name: string, body: string, accent: string}>
     */
    public static function drivers(): array
    {
        $karts = self::all()->keyBy('player_id');

        return Player::orderBy('name')->get(['id', 'name'])
            ->map(fn (Player $player) => [
                'id' => $player->id,
                'name' => $player->name,
                'body' => $karts[$player->id]->body ?? self::DEFAULT_BODY,
                'accent' => $karts[$player->id]->accent ?? self::DEFAULT_ACCENT,
            ])
            ->values()
            ->all();
    }
}
