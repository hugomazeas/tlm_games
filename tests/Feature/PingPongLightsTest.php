<?php

namespace Tests\Feature;

use App\Games\PingPong\Lights\PlayLightAnimationJob;
use App\Games\PingPong\Models\PingPongLightSettings;
use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongLobbyParticipant;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongTournament;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Ping pong lights: each office's Home Assistant light flashing the scoring side's colour on a
 * point and playing the win animation on a match won, configured on /games/ping-pong/lights.
 */
class PingPongLightsTest extends TestCase
{
    use RefreshDatabase;

    private const HA = 'https://home.example.test';

    private const TOKEN = 'secret-ha-token';

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(VideoRecordingService::class)->shouldIgnoreMissing();
        Event::fake();
    }

    private function office(string $name = 'Québec'): Office
    {
        return Office::create(['name' => $name]);
    }

    private function settings(Office $office, array $overrides = []): PingPongLightSettings
    {
        return PingPongLightSettings::create([
            'office_id' => $office->id,
            'enabled' => true,
            'ha_url' => self::HA,
            'ha_token' => self::TOKEN,
            'entity_id' => 'light.ping_pong_strip',
            ...$overrides,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function form(array $overrides = []): array
    {
        return [
            'enabled' => true,
            'ha_url' => self::HA,
            'ha_token' => '',
            'entity_id' => 'light.ping_pong_strip',
            'left_color' => '#ff0000',
            'right_color' => '#0000ff',
            'brightness' => 80,
            'animations' => PingPongLightSettings::DEFAULT_ANIMATIONS,
            ...$overrides,
        ];
    }

    private function match(?Office $office, int $leftScore = 0, int $rightScore = 0): PingPongMatch
    {
        $a = Player::create(['name' => 'Ada '.Str::random(6)]);
        $b = Player::create(['name' => 'Bo '.Str::random(6)]);

        return PingPongMatch::create([
            'mode' => '1v1', 'office_id' => $office?->id, 'player_left_id' => $a->id, 'player_right_id' => $b->id,
            'first_server_id' => $a->id, 'player_left_score' => $leftScore, 'player_right_score' => $rightScore,
            'started_at' => now(),
        ]);
    }

    private function score(PingPongMatch $match, string $side, string $action = 'increment'): void
    {
        $this->patchJson("/games/ping-pong/api/matches/{$match->id}", ['side' => $side, 'action' => $action])->assertOk();
    }

    // --- Settings page ---

    public function test_the_page_lists_every_office_without_ever_showing_the_token(): void
    {
        $this->settings($this->office('Québec'));
        $this->office('Montréal');

        $this->get('/games/ping-pong/lights')
            ->assertOk()
            ->assertSee('Québec')
            ->assertSee('Montréal')
            ->assertDontSee(self::TOKEN);
    }

    public function test_saving_stores_the_token_encrypted_and_never_returns_it(): void
    {
        $office = $this->office();

        $this->putJson("/games/ping-pong/lights/{$office->id}", $this->form(['ha_token' => self::TOKEN, 'ha_url' => self::HA.'/']))
            ->assertOk()
            ->assertJsonPath('has_token', true)
            ->assertJsonPath('ha_url', self::HA)
            ->assertJsonMissingPath('ha_token');

        $settings = PingPongLightSettings::firstOrFail();
        $this->assertSame(self::TOKEN, $settings->ha_token);
        $this->assertNotSame(self::TOKEN, DB::table('ping_pong_light_settings')->value('ha_token'));
        $this->assertSame('#ff0000', $settings->left_color);
        $this->assertSame(80, $settings->brightness);
    }

    public function test_a_blank_token_keeps_the_saved_one_at_the_same_address(): void
    {
        $office = $this->office();
        $this->settings($office);

        $this->putJson("/games/ping-pong/lights/{$office->id}", $this->form(['brightness' => 40]))->assertOk();

        $this->assertSame(self::TOKEN, PingPongLightSettings::firstOrFail()->ha_token);
        $this->assertSame(40, PingPongLightSettings::firstOrFail()->brightness);
    }

    public function test_a_new_address_needs_the_token_again_so_it_cannot_be_sent_elsewhere(): void
    {
        $office = $this->office();
        $this->settings($office);
        Http::fake();

        $this->putJson("/games/ping-pong/lights/{$office->id}", $this->form(['ha_url' => 'https://evil.example']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ha_token');
        $this->postJson("/games/ping-pong/lights/{$office->id}/test-connection", $this->form(['ha_url' => 'https://evil.example']))
            ->assertUnprocessable();
        Queue::fake();
        $this->postJson("/games/ping-pong/lights/{$office->id}/test", $this->form(['ha_url' => 'https://evil.example', 'event' => 'point', 'side' => 'left']))
            ->assertUnprocessable();

        Http::assertNothingSent();
        Queue::assertNothingPushed();
        $this->assertSame(self::HA, PingPongLightSettings::firstOrFail()->ha_url);

        $this->putJson("/games/ping-pong/lights/{$office->id}", $this->form(['ha_url' => 'https://other.example', 'ha_token' => 'new-token']))
            ->assertOk();
        $this->assertSame('new-token', PingPongLightSettings::firstOrFail()->ha_token);
    }

    public function test_lights_cannot_be_turned_on_without_a_connection(): void
    {
        $office = $this->office();

        $this->putJson("/games/ping-pong/lights/{$office->id}", $this->form(['ha_token' => '']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('enabled');
    }

    public function test_settings_are_validated(): void
    {
        $office = $this->office();

        $this->putJson("/games/ping-pong/lights/{$office->id}", $this->form([
            'ha_token' => self::TOKEN,
            'entity_id' => 'switch.kettle',
            'left_color' => 'red',
            'brightness' => 0,
            'animations' => ['point' => ['enabled' => true, 'flashes' => 0, 'on_ms' => 50, 'off_ms' => 0], 'win' => PingPongLightSettings::DEFAULT_ANIMATIONS['win']],
        ]))->assertUnprocessable()->assertJsonValidationErrors([
            'entity_id', 'left_color', 'brightness', 'animations.point.flashes', 'animations.point.on_ms',
        ]);
    }

    public function test_test_connection_lists_the_lights_of_home_assistant(): void
    {
        $office = $this->office();
        $this->settings($office);
        Http::fake([
            self::HA.'/api/' => Http::response(['message' => 'API running.']),
            self::HA.'/api/states' => Http::response([
                ['entity_id' => 'light.ping_pong_strip', 'attributes' => ['friendly_name' => 'Ping pong strip']],
                ['entity_id' => 'switch.kettle', 'attributes' => ['friendly_name' => 'Kettle']],
            ]),
        ]);

        $this->postJson("/games/ping-pong/lights/{$office->id}/test-connection", $this->form())
            ->assertOk()
            ->assertExactJson(['lights' => [['entity_id' => 'light.ping_pong_strip', 'name' => 'Ping pong strip']]]);

        Http::assertSent(fn (HttpRequest $r) => $r->hasHeader('Authorization', 'Bearer '.self::TOKEN));
    }

    public function test_test_connection_reports_a_refused_token_without_leaking_it(): void
    {
        $office = $this->office();
        $this->settings($office);
        Http::fake([self::HA.'/*' => Http::response('Unauthorized', 401)]);

        $response = $this->postJson("/games/ping-pong/lights/{$office->id}/test-connection", $this->form())
            ->assertStatus(502)
            ->assertJsonPath('message', 'Home Assistant refused the token.');

        $this->assertStringNotContainsString(self::TOKEN, $response->getContent());
    }

    public function test_test_plays_the_forms_unsaved_values(): void
    {
        $office = $this->office();
        $this->settings($office, ['enabled' => false]);
        Queue::fake();

        $this->postJson("/games/ping-pong/lights/{$office->id}/test", $this->form([
            'enabled' => false, 'right_color' => '#00ff00', 'event' => 'win', 'side' => 'right',
        ]))->assertOk();

        Queue::assertPushedOn(PlayLightAnimationJob::QUEUE, PlayLightAnimationJob::class, fn (PlayLightAnimationJob $job) => $job->officeId === $office->id
            && $job->animation['color'] === '#00ff00'
            && $job->animation['flashes'] === 3
            && $job->animation['ha_token'] === self::TOKEN);
        $this->assertSame('#3ec8ff', PingPongLightSettings::firstOrFail()->right_color);
    }

    public function test_offices_api_gives_the_light_colours_only_when_lights_are_on(): void
    {
        $quebec = $this->office('Québec');
        $this->settings($quebec, ['left_color' => '#111111', 'right_color' => '#222222']);
        $montreal = $this->office('Montréal');
        $this->settings($montreal, ['enabled' => false]);

        $offices = collect($this->getJson('/games/ping-pong/api/offices')->assertOk()->json())->keyBy('name');

        $this->assertSame(['left' => '#111111', 'right' => '#222222'], $offices['Québec']['light_colors']);
        $this->assertNull($offices['Montréal']['light_colors']);
        $this->assertArrayNotHasKey('ha_token', $offices['Québec']);
    }

    // --- Triggering ---

    public function test_a_point_flashes_the_scoring_sides_colour(): void
    {
        Queue::fake();
        $office = $this->office();
        $this->settings($office, ['right_color' => '#00ff00']);
        $match = $this->match($office);

        $this->score($match, 'right');

        Queue::assertPushed(PlayLightAnimationJob::class, 1);
        Queue::assertPushed(PlayLightAnimationJob::class, fn (PlayLightAnimationJob $job) => $job->animation['color'] === '#00ff00'
            && $job->animation['flashes'] === 1
            && $job->animation['on_ms'] === 1500);
    }

    public function test_the_winning_point_plays_the_win_animation_in_the_winners_colour(): void
    {
        Queue::fake();
        $office = $this->office();
        $this->settings($office, ['left_color' => '#ff0000']);
        $match = $this->match($office, leftScore: 10, rightScore: 3);

        $this->score($match, 'left');

        Queue::assertPushed(PlayLightAnimationJob::class, 1);
        Queue::assertPushed(PlayLightAnimationJob::class, fn (PlayLightAnimationJob $job) => $job->animation['color'] === '#ff0000'
            && $job->animation['flashes'] === 3);
    }

    public function test_corrections_matches_without_an_office_and_lights_off_never_fire(): void
    {
        Queue::fake();
        $quebec = $this->office('Québec');
        $this->settings($quebec);
        $off = $this->office('Montréal');
        $this->settings($off, ['enabled' => false]);

        $this->score($this->match($quebec, leftScore: 4), 'left', 'decrement');
        $this->score($this->match(null), 'left');
        $this->score($this->match($off), 'left');

        Queue::assertNothingPushed();
    }

    public function test_a_disabled_event_does_not_fire(): void
    {
        Queue::fake();
        $office = $this->office();
        $this->settings($office, ['animations' => ['point' => ['enabled' => false, 'flashes' => 1, 'on_ms' => 1500, 'off_ms' => 0]]]);

        $this->score($this->match($office), 'left');

        Queue::assertNothingPushed();
    }

    public function test_home_assistant_being_down_never_breaks_scoring(): void
    {
        Sleep::fake();
        $office = $this->office();
        $this->settings($office);
        Http::fake([self::HA.'/*' => Http::failedConnection()]);
        $match = $this->match($office);

        $this->score($match, 'left');

        $this->assertSame(1, $match->fresh()->player_left_score);
    }

    // --- The animation ---

    public function test_an_animation_snapshots_the_light_flashes_then_puts_every_setting_back(): void
    {
        Sleep::fake();
        $office = $this->office();
        $this->settings($office, ['left_color' => '#ff0000', 'brightness' => 50, 'animations' => [
            'win' => ['enabled' => true, 'flashes' => 2, 'on_ms' => 1000, 'off_ms' => 500],
        ]]);
        Http::fake([self::HA.'/api/services/*' => Http::response([])]);

        $this->score($this->match($office, leftScore: 10), 'left');

        $calls = collect(Http::recorded())->map(fn (array $pair) => [
            str_replace(self::HA, '', $pair[0]->url()),
            $pair[0]->data(),
        ])->all();

        $scene = PlayLightAnimationJob::sceneId($office->id);
        $on = ['entity_id' => 'light.ping_pong_strip', 'rgb_color' => [255, 0, 0], 'brightness_pct' => 50, 'transition' => 0];
        $this->assertEquals([
            ['/api/services/scene/create', ['scene_id' => $scene, 'snapshot_entities' => ['light.ping_pong_strip']]],
            ['/api/services/light/turn_on', $on],
            ['/api/services/light/turn_off', ['entity_id' => 'light.ping_pong_strip', 'transition' => 0]],
            ['/api/services/light/turn_on', $on],
            ['/api/services/scene/turn_on', ['entity_id' => 'scene.'.$scene]],
        ], $calls);
        $this->assertNull(Cache::get(PlayLightAnimationJob::restingKey($office->id)));
    }

    public function test_without_a_snapshot_it_puts_back_the_state_it_read(): void
    {
        Sleep::fake();
        $office = $this->office();
        $this->settings($office);
        Http::fake([
            self::HA.'/api/services/scene/create' => Http::response('Forbidden', 403),
            self::HA.'/api/states/light.ping_pong_strip' => Http::response([
                'state' => 'on',
                'attributes' => ['brightness' => 200, 'color_mode' => 'color_temp', 'color_temp_kelvin' => 3000],
            ]),
            self::HA.'/api/services/*' => Http::response([]),
        ]);

        $this->score($this->match($office), 'right');

        $last = collect(Http::recorded())->last()[0];
        $this->assertSame(self::HA.'/api/services/light/turn_on', $last->url());
        $this->assertEquals(['entity_id' => 'light.ping_pong_strip', 'brightness' => 200, 'color_temp_kelvin' => 3000], $last->data());
    }

    public function test_without_a_snapshot_a_light_that_was_off_is_turned_off_again(): void
    {
        Sleep::fake();
        $office = $this->office();
        $this->settings($office);
        Http::fake([
            self::HA.'/api/services/scene/create' => Http::response('Forbidden', 403),
            self::HA.'/api/states/*' => Http::response(['state' => 'off', 'attributes' => []]),
            self::HA.'/api/services/*' => Http::response([]),
        ]);

        $this->score($this->match($office), 'right');

        $last = collect(Http::recorded())->last()[0];
        $this->assertSame(self::HA.'/api/services/light/turn_off', $last->url());
    }

    public function test_after_a_burst_of_points_the_light_ends_on_the_snapshot_taken_before_the_first(): void
    {
        Sleep::fake();
        $office = $this->office();
        Cache::put(PlayLightAnimationJob::sequenceKey($office->id), 3);
        Cache::put(PlayLightAnimationJob::restingKey($office->id), ['scene' => PlayLightAnimationJob::sceneId($office->id)]);
        Http::fake([self::HA.'/api/services/*' => Http::response([])]);

        (new PlayLightAnimationJob($office->id, 3, [
            'ha_url' => self::HA, 'ha_token' => self::TOKEN, 'entity_id' => 'light.ping_pong_strip',
            'color' => '#ff0000', 'brightness' => 100, 'flashes' => 1, 'on_ms' => 1000, 'off_ms' => 0,
        ]))->handle();

        // No new snapshot: the light is still showing the interrupted animation's colour.
        Http::assertNotSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/scene/create'));
        $this->assertSame(self::HA.'/api/services/scene/turn_on', collect(Http::recorded())->last()[0]->url());
    }

    public function test_a_newer_animation_cuts_an_older_one_short(): void
    {
        Sleep::fake();
        Http::fake();
        $office = $this->office();
        Cache::put(PlayLightAnimationJob::sequenceKey($office->id), 5);

        (new PlayLightAnimationJob($office->id, 4, [
            'ha_url' => self::HA, 'ha_token' => self::TOKEN, 'entity_id' => 'light.ping_pong_strip',
            'color' => '#ff0000', 'brightness' => 100, 'flashes' => 1, 'on_ms' => 1000, 'off_ms' => 0,
        ]))->handle();

        Http::assertNothingSent();
    }

    public function test_after_an_interrupted_animation_the_next_one_restores_the_original_state(): void
    {
        Sleep::fake();
        $office = $this->office();
        Cache::put(PlayLightAnimationJob::sequenceKey($office->id), 2);
        Cache::put(PlayLightAnimationJob::restingKey($office->id), ['on' => false, 'brightness' => null, 'rgb_color' => null, 'color_temp_kelvin' => null]);
        Http::fake([self::HA.'/api/services/*' => Http::response([])]);

        (new PlayLightAnimationJob($office->id, 2, [
            'ha_url' => self::HA, 'ha_token' => self::TOKEN, 'entity_id' => 'light.ping_pong_strip',
            'color' => '#ff0000', 'brightness' => 100, 'flashes' => 1, 'on_ms' => 1000, 'off_ms' => 0,
        ]))->handle();

        Http::assertNotSent(fn (HttpRequest $r) => str_contains($r->url(), '/api/states/'));
        $this->assertSame(self::HA.'/api/services/light/turn_off', collect(Http::recorded())->last()[0]->url());
    }

    public function test_the_queued_job_is_encrypted_so_the_token_is_not_stored_in_clear(): void
    {
        $this->assertContains(\Illuminate\Contracts\Queue\ShouldBeEncrypted::class, class_implements(PlayLightAnimationJob::class));
    }

    // --- The office on a match ---

    public function test_a_lobby_carries_its_office_into_the_match_and_the_rematch(): void
    {
        $office = $this->office();

        $code = $this->postJson('/games/ping-pong/api/lobbies', ['mode' => '1v1', 'office_id' => $office->id])->assertCreated()->json('code');
        $lobby = PingPongLobby::where('code', $code)->firstOrFail();
        $this->assertSame($office->id, $lobby->office_id);
        $this->getJson("/games/ping-pong/api/lobbies/{$code}")->assertJsonPath('office_id', $office->id);

        foreach (['left' => 'Ada', 'right' => 'Bo'] as $side => $name) {
            PingPongLobbyParticipant::create([
                'lobby_id' => $lobby->id, 'player_id' => Player::create(['name' => $name])->id, 'side' => $side,
                'session_token' => Str::random(64), 'last_seen_at' => now(),
            ]);
        }
        $this->postJson("/games/ping-pong/api/lobbies/{$code}/start", ['host_token' => $lobby->host_token])->assertOk();

        $match = PingPongMatch::firstOrFail();
        $this->assertSame($office->id, $match->office_id);

        $match->update(['player_left_score' => 11, 'winner_id' => $match->player_left_id, 'ended_at' => now()]);
        $rematchCode = $this->postJson("/games/ping-pong/api/matches/{$match->id}/rematch")->assertSuccessful()->json('lobby_code');
        $this->assertSame($office->id, PingPongLobby::where('code', $rematchCode)->value('office_id'));
    }

    public function test_only_the_host_changes_a_lobbys_office(): void
    {
        $office = $this->office();
        $lobby = PingPongLobby::create([
            'code' => PingPongLobby::generateCode(), 'mode' => '1v1', 'host_token' => Str::random(64),
            'status' => 'waiting', 'expires_at' => now()->addDay(),
        ]);

        $this->patchJson("/games/ping-pong/api/lobbies/{$lobby->code}/office", ['office_id' => $office->id, 'host_token' => 'nope'])
            ->assertForbidden();
        $this->assertNull($lobby->fresh()->office_id);

        $this->patchJson("/games/ping-pong/api/lobbies/{$lobby->code}/office", ['office_id' => $office->id, 'host_token' => $lobby->host_token])
            ->assertOk();
        $this->assertSame($office->id, $lobby->fresh()->office_id);
    }

    public function test_a_direct_match_takes_an_office(): void
    {
        $office = $this->office();
        $a = Player::create(['name' => 'Ada']);
        $b = Player::create(['name' => 'Bo']);

        $this->postJson('/games/ping-pong/api/matches', [
            'player_left_id' => $a->id, 'player_right_id' => $b->id, 'first_server_id' => $a->id, 'office_id' => $office->id,
        ])->assertCreated()->assertJsonPath('office_id', $office->id);
    }

    public function test_tournament_matches_take_the_tournaments_office(): void
    {
        $office = $this->office();
        $ids = collect(['Ada', 'Bo'])->map(fn (string $name) => Player::create(['name' => $name])->id)->all();

        $this->post('/games/ping-pong/tournaments', ['name' => 'Cup', 'player_ids' => $ids, 'office_id' => $office->id])->assertRedirect();
        $tournament = PingPongTournament::firstOrFail();
        $this->assertSame($office->id, $tournament->office_id);

        $this->post("/games/ping-pong/tournaments/{$tournament->id}/next", ['first_server_id' => $ids[0]])->assertRedirect();
        $this->assertSame($office->id, PingPongMatch::includingTournaments()->firstOrFail()->office_id);
    }
}
