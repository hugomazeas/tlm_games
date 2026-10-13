<?php

namespace Tests\Feature;

use App\Games\Racing\Models\RacingKart;
use App\Games\Racing\Models\RacingResult;
use App\Games\Racing\Models\RacingTrack;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Hub's side of racing lobbies: the play page's lobby config, free roam,
 * the internal endpoints the game server uses, and each track's records.
 */
class RacingLobbyTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['games.hot_potato.internal_secret' => self::SECRET]);
    }

    private function track(string $name = 'Parliament loop'): RacingTrack
    {
        return RacingTrack::create([
            'name' => $name,
            'map' => 'quebec-plains',
            'laps' => 3,
            'gates' => [
                ['lat' => 46.8069, 'lon' => -71.2155, 'heading' => -50, 'width' => 11],
                ['lat' => 46.8087, 'lon' => -71.2124, 'heading' => -139, 'width' => 10],
                ['lat' => 46.8052, 'lon' => -71.2106, 'heading' => 163, 'width' => 10],
            ],
        ]);
    }

    /** @return array<string, string> */
    private function internal(): array
    {
        return ['X-Internal-Secret' => self::SECRET];
    }

    /**
     * @param  array<int, array<string, mixed>>  $results
     * @return array<string, mixed>
     */
    private function race(RacingTrack $track, array $results, string $raceId = 'r1'): array
    {
        return ['race_id' => $raceId, 'track_id' => $track->id, 'racers' => count($results), 'results' => $results];
    }

    public function test_the_play_page_joins_the_lobby_given_and_says_who_is_driving(): void
    {
        $track = $this->track();
        $player = Player::create(['name' => 'Alice']);

        $this->get("/games/racing/tracks/{$track->id}/play?player={$player->id}&lobby=ab12cd")
            ->assertOk()
            ->assertSee('"mode":"race"', false)
            ->assertSee('"playerId":'.$player->id, false)
            ->assertSee('"lobby":"ab12cd"', false)
            ->assertSee("\\/games\\/racing\\/tracks\\/{$track->id}\\/records", false);
    }

    public function test_without_a_lobby_or_with_a_malformed_one_the_driver_hosts_a_new_one(): void
    {
        $track = $this->track();

        $this->get("/games/racing/tracks/{$track->id}/play")->assertOk()->assertSee('"lobby":null', false);
        $this->get("/games/racing/tracks/{$track->id}/play?lobby=../x")->assertOk()->assertSee('"lobby":null', false);
    }

    public function test_free_roam_opens_the_map_with_no_track(): void
    {
        $this->get('/games/racing/roam')
            ->assertOk()
            ->assertSee('"mode":"roam"', false)
            ->assertSee('"track":null', false)
            ->assertSee('/games/racing/live/play.js');
    }

    public function test_the_track_list_links_free_roam_and_lists_lobbies_from_the_game_server(): void
    {
        $this->get('/games/racing')
            ->assertOk()
            ->assertSee('/games/racing/roam')
            ->assertSee('/games/racing/live/lobbies');
    }

    public function test_the_game_server_looks_a_driver_up_with_their_colours(): void
    {
        $player = Player::create(['name' => 'Alice']);
        RacingKart::create(['player_id' => $player->id, 'body' => '#112233', 'accent' => '#445566']);

        $this->getJson("/internal/racing/drivers/{$player->id}", $this->internal())
            ->assertOk()
            ->assertExactJson(['id' => $player->id, 'name' => 'Alice', 'body' => '#112233', 'accent' => '#445566']);

        $this->getJson('/internal/racing/drivers/999', $this->internal())->assertNotFound();
    }

    public function test_the_game_server_looks_a_track_up(): void
    {
        $track = $this->track();

        $this->getJson("/internal/racing/tracks/{$track->id}", $this->internal())
            ->assertOk()
            ->assertJsonPath('name', 'Parliament loop')
            ->assertJsonPath('laps', 3)
            ->assertJsonCount(3, 'gates');
    }

    public function test_internal_racing_endpoints_need_the_secret(): void
    {
        $track = $this->track();

        $this->getJson("/internal/racing/tracks/{$track->id}")->assertForbidden();
        $this->getJson("/internal/racing/tracks/{$track->id}", ['X-Internal-Secret' => 'nope'])->assertForbidden();

        config(['games.hot_potato.internal_secret' => null]);
        $this->getJson("/internal/racing/tracks/{$track->id}", $this->internal())->assertStatus(503);
    }

    public function test_race_results_are_saved_once_per_player_per_race(): void
    {
        $track = $this->track();
        $alice = Player::create(['name' => 'Alice']);
        $bob = Player::create(['name' => 'Bob']);
        $results = [
            ['player_id' => $alice->id, 'position' => 1, 'time_ms' => 95_000, 'best_lap_ms' => 30_500],
            ['player_id' => $bob->id, 'position' => 2, 'time_ms' => null, 'best_lap_ms' => 33_000],
        ];

        $this->postJson('/internal/racing/results', $this->race($track, $results), $this->internal())->assertCreated();
        // Sent twice (a retry, say): still one row each.
        $this->postJson('/internal/racing/results', $this->race($track, $results), $this->internal())->assertCreated();

        $this->assertSame(2, RacingResult::count());
        $this->assertNull(RacingResult::where('player_id', $bob->id)->value('time_ms'));
        $this->assertSame(2, RacingResult::where('player_id', $alice->id)->value('racers'));
    }

    public function test_results_must_name_real_players_on_a_real_track(): void
    {
        $track = $this->track();

        $this->postJson('/internal/racing/results', $this->race($track, [
            ['player_id' => 999, 'position' => 1, 'time_ms' => 95_000, 'best_lap_ms' => 30_000],
        ]), $this->internal())->assertUnprocessable()->assertJsonValidationErrors('results.0.player_id');

        $this->postJson('/internal/racing/results', ['race_id' => 'r1', 'track_id' => 999, 'racers' => 1, 'results' => []], $this->internal())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['track_id', 'results']);
    }

    public function test_records_list_each_players_best_time_and_the_fastest_lap(): void
    {
        $track = $this->track();
        $other = $this->track('Other loop');
        $alice = Player::create(['name' => 'Alice']);
        $bob = Player::create(['name' => 'Bob']);
        $carol = Player::create(['name' => 'Carol']);

        $this->postJson('/internal/racing/results', $this->race($track, [
            ['player_id' => $alice->id, 'position' => 1, 'time_ms' => 100_000, 'best_lap_ms' => 32_000],
            ['player_id' => $bob->id, 'position' => 2, 'time_ms' => 104_000, 'best_lap_ms' => 31_000],
            ['player_id' => $carol->id, 'position' => 3, 'time_ms' => null, 'best_lap_ms' => null],
        ], 'r1'), $this->internal());
        $this->postJson('/internal/racing/results', $this->race($track, [
            ['player_id' => $bob->id, 'position' => 1, 'time_ms' => 98_000, 'best_lap_ms' => 31_500],
        ], 'r2'), $this->internal());
        $this->postJson('/internal/racing/results', $this->race($other, [
            ['player_id' => $carol->id, 'position' => 1, 'time_ms' => 50_000, 'best_lap_ms' => 10_000],
        ], 'r3'), $this->internal());

        $this->getJson("/games/racing/tracks/{$track->id}/records")
            ->assertOk()
            ->assertExactJson([
                'times' => [
                    ['player_id' => $bob->id, 'name' => 'Bob', 'time_ms' => 98_000],
                    ['player_id' => $alice->id, 'name' => 'Alice', 'time_ms' => 100_000],
                ],
                'lap' => ['player_id' => $bob->id, 'name' => 'Bob', 'time_ms' => 31_000],
            ]);
    }

    public function test_a_track_nobody_has_finished_has_no_records(): void
    {
        $track = $this->track();

        $this->getJson("/games/racing/tracks/{$track->id}/records")
            ->assertOk()
            ->assertExactJson(['times' => [], 'lap' => null]);
    }
}
