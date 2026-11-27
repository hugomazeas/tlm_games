<?php

namespace App\Games\PingPong\Lights;

use App\Games\PingPong\Models\PingPongLightSettings;

/**
 * Tuya light strips' built-in scenes (data point 25, with data point 21 set to "scene"): the strip
 * plays them itself at full speed, which the cloud can't. A scene is "05" then units of 26 hex
 * digits: switch speed, change speed, mode (01 jump), hue 0-360, saturation and value 0-1000,
 * then brightness and temperature (unused in colour units).
 */
class TuyaScene
{
    public const MODE_DP = 21;

    public const SCENE_DP = 25;

    /**
     * A strobe: the colour, then black, jumping between them at $speed (1–100, 100 fastest).
     */
    public static function strobe(string $hexColor, int $brightnessPct, int $speed): string
    {
        [$hue, $saturation, $value] = self::hsv($hexColor);
        $value = (int) round($value * max(1, min(100, $brightnessPct)) / 100);
        $speed = max(1, min(100, $speed));

        return '05'
            .self::unit($speed, 1, $hue, $saturation, $value)
            .self::unit($speed, 1, $hue, $saturation, 0);
    }

    private static function unit(int $speed, int $mode, int $hue, int $saturation, int $value): string
    {
        return sprintf('%02x%02x%02x%04x%04x%04x%04x%04x', $speed, $speed, $mode, $hue, $saturation, $value, 0, 0);
    }

    /**
     * @return array{0: int, 1: int, 2: int} hue 0–360, saturation and value 0–1000
     */
    private static function hsv(string $hexColor): array
    {
        [$r, $g, $b] = array_map(fn (int $c) => $c / 255, PingPongLightSettings::hexToRgb($hexColor));
        $max = max($r, $g, $b);
        $delta = $max - min($r, $g, $b);

        $hue = match (true) {
            $delta == 0 => 0,
            $max === $r => 60 * fmod(($g - $b) / $delta, 6),
            $max === $g => 60 * (($b - $r) / $delta + 2),
            default => 60 * (($r - $g) / $delta + 4),
        };

        return [
            (int) round($hue < 0 ? $hue + 360 : $hue) % 360,
            (int) round($max == 0 ? 0 : $delta / $max * 1000),
            (int) round($max * 1000),
        ];
    }
}
