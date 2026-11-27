<?php

namespace App\Games\PingPong\Lights;

use App\Games\PingPong\Models\PingPongLightSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;

/**
 * Plays one animation on an office's light: flashes of a colour, then the light put back as it
 * was. Newest wins: every trigger bumps the office's counter, and a job that is no longer the
 * newest stops at once without restoring, leaving that to the newer one. The light's resting
 * state is kept in the cache until a job restores it, so a burst of points still ends on the
 * real resting state rather than on a flash colour.
 *
 * Encrypted on the queue: the payload carries the Home Assistant token.
 */
class PlayLightAnimationJob implements ShouldBeEncrypted, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public const QUEUE = 'lights';

    /** How often a running animation checks whether a newer one took over. */
    private const POLL_MS = 100;

    /** When the resting state can't be read, the light ends on a neutral white. */
    private const FALLBACK_STATE = ['on' => true, 'brightness' => 255, 'rgb_color' => [255, 255, 255], 'color_temp_kelvin' => null];

    public int $tries = 1;

    public int $timeout = 60;

    /**
     * @param  array{ha_url: string, ha_token: string, entity_id: string, color: string, brightness: int, flashes: int, on_ms: int, off_ms: int}  $animation
     */
    public function __construct(public int $officeId, public int $sequence, public array $animation)
    {
        $this->onQueue(self::QUEUE);
    }

    public static function sequenceKey(int $officeId): string
    {
        return "ping-pong-lights:{$officeId}:seq";
    }

    public static function restingKey(int $officeId): string
    {
        return "ping-pong-lights:{$officeId}:resting";
    }

    public function handle(): void
    {
        if (! $this->isNewest()) {
            return;
        }

        $client = new HomeAssistantClient($this->animation['ha_url'], $this->animation['ha_token']);
        $entity = $this->animation['entity_id'];
        $resting = null;

        try {
            $resting = $this->restingState($client, $entity);
            $rgb = PingPongLightSettings::hexToRgb($this->animation['color']);
            $flashes = max(1, $this->animation['flashes']);

            for ($flash = 1; $flash <= $flashes; $flash++) {
                $client->turnOnColor($entity, $rgb, $this->animation['brightness']);
                if (! $this->wait($this->animation['on_ms'])) {
                    return;
                }

                if ($flash < $flashes && $this->animation['off_ms'] > 0) {
                    $client->turnOff($entity);
                    if (! $this->wait($this->animation['off_ms'])) {
                        return;
                    }
                }
            }

            $this->putBack($client, $entity, $resting);
            Cache::forget(self::restingKey($this->officeId));
        } catch (HomeAssistantException $e) {
            Log::warning('Ping pong lights: '.$e->getMessage(), ['office_id' => $this->officeId]);

            if ($resting !== null && $this->isNewest()) {
                try {
                    $this->putBack($client, $entity, $resting);
                } catch (HomeAssistantException) {
                    // Already logged the first failure; Home Assistant is likely down.
                }
                Cache::forget(self::restingKey($this->officeId));
            }
        }
    }

    /**
     * The Home Assistant scene holding the office's light as it was before the animation.
     */
    public static function sceneId(int $officeId): string
    {
        return "ping_pong_lights_office_{$officeId}";
    }

    /**
     * What to end on: the one an interrupted animation saved, else the light as it is now. Saved
     * as a Home Assistant scene snapshot (every setting: colour mode, effect, brightness), or,
     * when Home Assistant can't make one, as the state read from it.
     *
     * @return array{scene: string}|array{on: bool, brightness: ?int, rgb_color: ?array, color_temp_kelvin: ?int}
     */
    private function restingState(HomeAssistantClient $client, string $entity): array
    {
        $saved = Cache::get(self::restingKey($this->officeId));
        if (is_array($saved)) {
            return $saved;
        }

        try {
            $client->snapshot(self::sceneId($this->officeId), $entity);
            $state = ['scene' => self::sceneId($this->officeId)];
        } catch (HomeAssistantException $e) {
            Log::warning('Ping pong lights: no snapshot, '.$e->getMessage(), ['office_id' => $this->officeId]);

            try {
                $state = $client->lightState($entity);
            } catch (HomeAssistantException $e) {
                Log::warning('Ping pong lights: '.$e->getMessage(), ['office_id' => $this->officeId]);
                $state = self::FALLBACK_STATE;
            }
        }

        Cache::put(self::restingKey($this->officeId), $state, now()->addMinutes(10));

        return $state;
    }

    /**
     * Puts the light back as restingState() saved it.
     *
     * @param  array{scene: string}|array{on: bool, brightness: ?int, rgb_color: ?array, color_temp_kelvin: ?int}  $resting
     */
    private function putBack(HomeAssistantClient $client, string $entity, array $resting): void
    {
        if (isset($resting['scene'])) {
            $client->restoreSnapshot($resting['scene']);

            return;
        }

        $client->restore($entity, $resting);
    }

    /**
     * Sleeps, in short steps; false as soon as a newer animation took over.
     */
    private function wait(int $milliseconds): bool
    {
        for ($left = $milliseconds; $left > 0; $left -= self::POLL_MS) {
            Sleep::for(min(self::POLL_MS, $left))->milliseconds();
            if (! $this->isNewest()) {
                return false;
            }
        }

        return $this->isNewest();
    }

    private function isNewest(): bool
    {
        return (int) Cache::get(self::sequenceKey($this->officeId)) === $this->sequence;
    }
}
