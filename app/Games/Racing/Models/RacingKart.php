<?php

namespace App\Games\Racing\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A player's kart from the garage: the body colour (chassis, nose, pods),
 * the accent (wings, suit, helmet stripe, the pattern), and the livery: a
 * race number on its sides, a pattern, and sponsor stickers. A player who
 * never visited the garage, or a guest, drives the default kart.
 */
class RacingKart extends Model
{
    public const DEFAULT_BODY = '#d23c3c';

    public const DEFAULT_ACCENT = '#2b5fa8';

    public const GUEST_NAME = 'Guest';

    /** Patterns painted over the body in the accent colour (client/kart.ts draws them). */
    public const PATTERNS = ['none', 'stripes', 'flames', 'maple', 'checker', 'lightning'];

    /** The sponsor on the rear wing is at most this many characters (livery.ts SPONSOR_LENGTH). */
    public const SPONSOR_LENGTH = 10;

    protected $table = 'racing_karts';

    protected $fillable = [
        'player_id',
        'body',
        'accent',
        'number',
        'pattern',
        'stickers',
        'sponsor',
    ];

    protected function casts(): array
    {
        return [
            'number' => 'integer',
            'stickers' => 'boolean',
        ];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /**
     * How a driver looks to the game: their name over a kart in their colours and livery.
     *
     * @return array{name: string, body: string, accent: string, number: int|null, pattern: string, stickers: bool, sponsor: string|null}
     */
    public static function lookOf(?Player $player): array
    {
        $kart = $player ? self::where('player_id', $player->id)->first() : null;

        return ['name' => $player->name ?? self::GUEST_NAME, ...self::liveryOf($kart)];
    }

    /**
     * Every player and their kart, by name: who a newcomer picks from in the game's welcome screen.
     *
     * @return list<array{id: int, name: string, body: string, accent: string, number: int|null, pattern: string, stickers: bool, sponsor: string|null}>
     */
    public static function drivers(): array
    {
        $karts = self::all()->keyBy('player_id');

        return Player::orderBy('name')->get(['id', 'name'])
            ->map(fn (Player $player) => [
                'id' => $player->id,
                'name' => $player->name,
                ...self::liveryOf($karts[$player->id] ?? null),
            ])
            ->values()
            ->all();
    }

    /**
     * A kart's colours and livery, or the default kart's.
     *
     * @return array{body: string, accent: string, number: int|null, pattern: string, stickers: bool, sponsor: string|null}
     */
    private static function liveryOf(?self $kart): array
    {
        return [
            'body' => $kart->body ?? self::DEFAULT_BODY,
            'accent' => $kart->accent ?? self::DEFAULT_ACCENT,
            'number' => $kart?->number,
            'pattern' => $kart->pattern ?? 'none',
            'stickers' => $kart->stickers ?? true,
            'sponsor' => $kart?->sponsor,
        ];
    }
}
