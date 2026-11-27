<?php

namespace App\Games\PingPong\Models;

use App\Games\PingPong\Lights\EncryptedOrNull;
use App\Models\Office;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An office's Home Assistant light over its ping pong table. The token is encrypted at rest and
 * hidden from arrays/JSON: it only ever leaves the Hub towards the saved `ha_url`.
 */
class PingPongLightSettings extends Model
{
    public const EVENTS = ['point', 'win'];

    /**
     * How an animation plays: `flash` (the colour on, off between, step by step) or `strobe` (fast
     * flashes of the colour for `duration_ms`, quicker with `speed`: for a local light).
     */
    public const STYLES = ['flash', 'strobe'];

    /** @var array<string, array{enabled: bool, style: string, flashes: int, on_ms: int, off_ms: int, duration_ms: int, speed: int}> */
    public const DEFAULT_ANIMATIONS = [
        'point' => ['enabled' => true, 'style' => 'flash', 'flashes' => 1, 'on_ms' => 1500, 'off_ms' => 0, 'duration_ms' => 2000, 'speed' => 100],
        'win' => ['enabled' => true, 'style' => 'flash', 'flashes' => 3, 'on_ms' => 1200, 'off_ms' => 800, 'duration_ms' => 5000, 'speed' => 100],
    ];

    protected $table = 'ping_pong_light_settings';

    protected $fillable = [
        'office_id',
        'enabled',
        'ha_url',
        'ha_token',
        'entity_id',
        'left_color',
        'right_color',
        'brightness',
        'animations',
    ];

    protected $hidden = ['ha_token'];

    protected $attributes = [
        'enabled' => false,
        'left_color' => '#ff5a4a',
        'right_color' => '#3ec8ff',
        'brightness' => 100,
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'ha_token' => EncryptedOrNull::class,
            'brightness' => 'integer',
            'animations' => 'array',
        ];
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    /**
     * @return array{enabled: bool, style: string, flashes: int, on_ms: int, off_ms: int, duration_ms: int, speed: int}
     */
    public function animation(string $event): array
    {
        return array_merge(self::DEFAULT_ANIMATIONS[$event], $this->animations[$event] ?? []);
    }

    /**
     * @return array<string, array{enabled: bool, style: string, flashes: int, on_ms: int, off_ms: int, duration_ms: int, speed: int}>
     */
    public function allAnimations(): array
    {
        return collect(self::EVENTS)->mapWithKeys(fn (string $event) => [$event => $this->animation($event)])->all();
    }

    public function colorFor(string $side): string
    {
        return $side === 'left' ? $this->left_color : $this->right_color;
    }

    public function isConnected(): bool
    {
        return filled($this->ha_url) && filled($this->ha_token) && filled($this->entity_id);
    }

    public function isActive(): bool
    {
        return $this->enabled && $this->isConnected();
    }

    /**
     * @return array{0: int, 1: int, 2: int}
     */
    public static function hexToRgb(string $hex): array
    {
        $hex = ltrim($hex, '#');

        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }
}
