<?php

namespace App\Games\PingPong\Lights;

use App\Games\PingPong\Models\PingPongLightSettings;
use App\Games\PingPong\Models\PingPongMatch;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Turns match moments into light animations for the match's office. Never throws: lights must
 * never get in the way of scoring.
 */
class PingPongLights
{
    /**
     * A point (or the win) just happened in a match, scored by $side.
     */
    public function trigger(PingPongMatch $match, string $event, string $side): void
    {
        try {
            if (! $match->office_id) {
                return;
            }

            $settings = PingPongLightSettings::where('office_id', $match->office_id)->first();
            if (! $settings?->isActive() || ! $settings->animation($event)['enabled']) {
                return;
            }

            $this->play($settings, $event, $side);
        } catch (\Throwable $e) {
            Log::warning('Ping pong lights: could not trigger an animation', [
                'match_id' => $match->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Plays $event in $side's colour with these settings (saved or not: the settings page's Test
     * passes the form's values), cutting short whatever the office's light is playing.
     */
    public function play(PingPongLightSettings $settings, string $event, string $side): void
    {
        $key = PlayLightAnimationJob::sequenceKey($settings->office_id);
        Cache::add($key, 0);
        $sequence = (int) Cache::increment($key);
        $animation = $settings->animation($event);

        PlayLightAnimationJob::dispatch($settings->office_id, $sequence, [
            'ha_url' => $settings->ha_url,
            'ha_token' => $settings->ha_token,
            'entity_id' => $settings->entity_id,
            'color' => $settings->colorFor($side),
            'brightness' => $settings->brightness,
            'style' => $animation['style'],
            'duration_ms' => (int) $animation['duration_ms'],
            'speed' => (int) $animation['speed'],
            'flashes' => (int) $animation['flashes'],
            'on_ms' => (int) $animation['on_ms'],
            'off_ms' => (int) $animation['off_ms'],
        ]);
    }
}
