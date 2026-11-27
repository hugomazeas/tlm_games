<?php

namespace App\Games\PingPong\Lights;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

/**
 * The few Home Assistant REST calls the lights need. Short timeouts: a slow Home Assistant must
 * never hold up anything for long. Every failure is thrown as a HomeAssistantException whose
 * message never contains the token.
 */
class HomeAssistantClient
{
    public function __construct(private string $baseUrl, private string $token) {}

    /**
     * Checks the address and token (GET /api/).
     */
    public function ping(): void
    {
        $this->call(fn (PendingRequest $http) => $http->get('/api/'));
    }

    /**
     * Every light entity, for the settings page's dropdown.
     *
     * @return list<array{entity_id: string, name: string}>
     */
    public function lights(): array
    {
        $states = $this->call(fn (PendingRequest $http) => $http->get('/api/states'))->json() ?? [];

        return collect($states)
            ->filter(fn ($state) => is_array($state) && str_starts_with($state['entity_id'] ?? '', 'light.'))
            ->map(fn (array $state) => [
                'entity_id' => $state['entity_id'],
                'name' => $state['attributes']['friendly_name'] ?? $state['entity_id'],
            ])
            ->sortBy('name')
            ->values()
            ->all();
    }

    /**
     * What a light looks like now, enough to put it back: on/off, brightness and its colour.
     *
     * @return array{on: bool, brightness: ?int, rgb_color: ?array, color_temp_kelvin: ?int}
     */
    public function lightState(string $entityId): array
    {
        $state = $this->call(fn (PendingRequest $http) => $http->get('/api/states/'.$entityId))->json();
        $attributes = $state['attributes'] ?? [];
        $on = ($state['state'] ?? 'off') === 'on';
        $colorMode = $attributes['color_mode'] ?? null;

        return [
            'on' => $on,
            'brightness' => $on ? ($attributes['brightness'] ?? null) : null,
            'rgb_color' => $on && $colorMode !== 'color_temp' ? ($attributes['rgb_color'] ?? null) : null,
            'color_temp_kelvin' => $on && $colorMode === 'color_temp' ? ($attributes['color_temp_kelvin'] ?? null) : null,
        ];
    }

    /**
     * Saves the light exactly as it is (colour mode, effect, brightness, on/off) in a Home Assistant
     * scene, so restoreSnapshot() puts every setting back.
     */
    public function snapshot(string $sceneId, string $entityId): void
    {
        $this->call(fn (PendingRequest $http) => $http->post('/api/services/scene/create', [
            'scene_id' => $sceneId,
            'snapshot_entities' => [$entityId],
        ]));
    }

    public function restoreSnapshot(string $sceneId): void
    {
        $this->call(fn (PendingRequest $http) => $http->post('/api/services/scene/turn_on', [
            'entity_id' => 'scene.'.$sceneId,
        ]));
    }

    /**
     * @param  array{0: int, 1: int, 2: int}  $rgb
     */
    public function turnOnColor(string $entityId, array $rgb, int $brightnessPct): void
    {
        $this->service('turn_on', [
            'entity_id' => $entityId,
            'rgb_color' => $rgb,
            'brightness_pct' => $brightnessPct,
            'transition' => 0,
        ]);
    }

    public function turnOff(string $entityId): void
    {
        $this->service('turn_off', ['entity_id' => $entityId, 'transition' => 0]);
    }

    /**
     * Puts a light back as lightState() saw it.
     *
     * @param  array{on: bool, brightness: ?int, rgb_color: ?array, color_temp_kelvin: ?int}  $state
     */
    public function restore(string $entityId, array $state): void
    {
        if (! $state['on']) {
            $this->turnOff($entityId);

            return;
        }

        $this->service('turn_on', array_filter([
            'entity_id' => $entityId,
            'brightness' => $state['brightness'],
            'rgb_color' => $state['rgb_color'],
            'color_temp_kelvin' => $state['color_temp_kelvin'],
        ], fn ($value) => $value !== null));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function service(string $service, array $data): void
    {
        $this->call(fn (PendingRequest $http) => $http->post('/api/services/light/'.$service, $data));
    }

    /**
     * @param  callable(PendingRequest): \Illuminate\Http\Client\Response  $request
     */
    private function call(callable $request): \Illuminate\Http\Client\Response
    {
        $http = Http::baseUrl(rtrim($this->baseUrl, '/'))
            ->withToken($this->token)
            ->acceptJson()
            ->connectTimeout(3)
            ->timeout(4);

        try {
            return $request($http)->throw();
        } catch (RequestException $e) {
            throw new HomeAssistantException(match ($e->response->status()) {
                401, 403 => 'Home Assistant refused the token.',
                404 => 'Home Assistant has no such entity or endpoint.',
                default => 'Home Assistant answered with an error ('.$e->response->status().').',
            });
        } catch (\Throwable $e) {
            throw new HomeAssistantException('Home Assistant could not be reached.');
        }
    }
}
