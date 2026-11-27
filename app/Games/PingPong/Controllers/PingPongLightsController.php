<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Lights\HomeAssistantClient;
use App\Games\PingPong\Lights\HomeAssistantException;
use App\Games\PingPong\Lights\PingPongLights;
use App\Games\PingPong\Models\PingPongLightSettings;
use App\Http\Controllers\Controller;
use App\Models\Office;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * Each office's Home Assistant light over its ping pong table: settings, a connection check and
 * Test buttons playing an animation with the form's (unsaved) values.
 *
 * The page has no login, so the stored token is write-only and only ever sent to the saved
 * address: a request with another address must bring its own token.
 */
class PingPongLightsController extends Controller
{
    public function __construct(private PingPongLights $lights) {}

    public function index(): View
    {
        $settings = PingPongLightSettings::all()->keyBy('office_id');

        return view('games.ping-pong.lights', [
            'offices' => Office::orderBy('name')->get()->map(fn (Office $office) => [
                'id' => $office->id,
                'name' => $office->name,
                'settings' => $this->present($settings->get($office->id) ?? new PingPongLightSettings(['office_id' => $office->id])),
            ])->values(),
        ]);
    }

    public function update(Request $request, Office $office): JsonResponse
    {
        $settings = $this->settingsFrom($request, $office);

        if ($settings->enabled && ! $settings->isConnected()) {
            throw ValidationException::withMessages([
                'enabled' => 'Fill in the address, the token and the light before turning the lights on.',
            ]);
        }

        $settings->save();

        return response()->json($this->present($settings));
    }

    public function testConnection(Request $request, Office $office): JsonResponse
    {
        $settings = $this->settingsFrom($request, $office);

        if (blank($settings->ha_url) || blank($settings->ha_token)) {
            return response()->json(['message' => 'Fill in the address and the token first.'], 422);
        }

        try {
            $client = new HomeAssistantClient($settings->ha_url, $settings->ha_token);
            $client->ping();

            return response()->json(['lights' => $client->lights()]);
        } catch (HomeAssistantException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }
    }

    public function test(Request $request, Office $office): JsonResponse
    {
        $request->validate([
            'event' => 'required|in:'.implode(',', PingPongLightSettings::EVENTS),
            'side' => 'required|in:left,right',
        ]);

        $settings = $this->settingsFrom($request, $office);

        if (! $settings->isConnected()) {
            return response()->json(['message' => 'Fill in the address, the token and the light first.'], 422);
        }

        $this->lights->play($settings, $request->input('event'), $request->input('side'));

        return response()->json(['playing' => true]);
    }

    /**
     * The office's settings with the request's values on top, not saved. A blank token keeps
     * the stored one, but only while the address stays the saved one.
     */
    private function settingsFrom(Request $request, Office $office): PingPongLightSettings
    {
        $animationRules = collect(PingPongLightSettings::EVENTS)->flatMap(fn (string $event) => [
            "animations.$event.enabled" => 'required|boolean',
            "animations.$event.flashes" => 'required|integer|min:1|max:10',
            "animations.$event.on_ms" => 'required|integer|min:200|max:10000',
            "animations.$event.off_ms" => 'required|integer|min:0|max:10000',
        ])->all();

        $validated = $request->validate([
            'enabled' => 'required|boolean',
            'ha_url' => 'nullable|url:http,https|max:255',
            'ha_token' => 'nullable|string|max:2000',
            'entity_id' => ['nullable', 'string', 'max:255', 'regex:/^light\.[a-z0-9_]+$/'],
            'left_color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'right_color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'brightness' => 'required|integer|min:1|max:100',
            ...$animationRules,
        ], [
            'entity_id.regex' => 'The light must be a light entity, like light.ping_pong_strip.',
        ]);

        $settings = PingPongLightSettings::firstOrNew(['office_id' => $office->id]);
        $url = filled($validated['ha_url'] ?? null) ? rtrim($validated['ha_url'], '/') : null;
        $sameAddress = $url !== null && $url === $settings->ha_url;

        if (filled($validated['ha_token'] ?? null)) {
            $token = $validated['ha_token'];
        } elseif ($sameAddress || $url === null) {
            $token = $url === null ? null : $settings->ha_token;
        } else {
            if (filled($settings->ha_token)) {
                throw ValidationException::withMessages([
                    'ha_token' => 'The address changed: paste the token again.',
                ]);
            }
            $token = null;
        }

        $settings->fill([
            'enabled' => $validated['enabled'],
            'ha_url' => $url,
            'ha_token' => $token,
            'entity_id' => $validated['entity_id'] ?? null,
            'left_color' => strtolower($validated['left_color']),
            'right_color' => strtolower($validated['right_color']),
            'brightness' => $validated['brightness'],
            'animations' => collect($validated['animations'])->only(PingPongLightSettings::EVENTS)->map(fn (array $animation) => [
                'enabled' => (bool) $animation['enabled'],
                'flashes' => (int) $animation['flashes'],
                'on_ms' => (int) $animation['on_ms'],
                'off_ms' => (int) $animation['off_ms'],
            ])->all(),
        ]);

        return $settings;
    }

    /**
     * What the page gets: everything but the token, which only shows as saved or not.
     *
     * @return array<string, mixed>
     */
    private function present(PingPongLightSettings $settings): array
    {
        return [
            'enabled' => (bool) $settings->enabled,
            'ha_url' => $settings->ha_url ?? '',
            'has_token' => filled($settings->ha_token),
            'entity_id' => $settings->entity_id ?? '',
            'left_color' => $settings->left_color,
            'right_color' => $settings->right_color,
            'brightness' => $settings->brightness,
            'animations' => $settings->allAnimations(),
        ];
    }
}
