<?php

namespace Tests\Feature;

use App\Games\Racing\Models\RacingTrack;
use Database\Seeders\RacingTrackSeeder;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RacingTrackTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateCsrfToken::class);
    }

    /**
     * A small loop near the Parliament, as the editor sends it.
     *
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return [
            'name' => 'Parliament loop',
            'laps' => 3,
            'length' => 1450,
            'gates' => [
                ['lat' => 46.8069, 'lon' => -71.2155, 'heading' => -50, 'width' => 11],
                ['lat' => 46.8087, 'lon' => -71.2124, 'heading' => -139, 'width' => 10],
                ['lat' => 46.8052, 'lon' => -71.2106, 'heading' => 163, 'width' => 10],
            ],
            ...$overrides,
        ];
    }

    private function track(array $overrides = []): RacingTrack
    {
        return RacingTrack::create([...$this->payload(), 'map' => 'quebec-plains', ...$overrides]);
    }

    public function test_the_track_list_shows_each_track_with_play_and_edit_links(): void
    {
        $track = $this->track();

        $this->get('/games/racing')
            ->assertOk()
            ->assertSee('Parliament loop')
            ->assertSee('3 laps')
            ->assertSee('1.45 km a lap')
            ->assertSee("/games/racing/tracks/{$track->id}/play")
            ->assertSee("/games/racing/tracks/{$track->id}/edit");
    }

    public function test_the_track_list_invites_making_one_when_there_are_none(): void
    {
        $this->get('/games/racing')->assertOk()->assertSee('No tracks yet');
    }

    public function test_the_editor_page_loads_the_editor_with_a_blank_track(): void
    {
        $this->get('/games/racing/tracks/create')
            ->assertOk()
            ->assertSee('/games/racing/live/editor.js')
            ->assertSee('"method":"POST"', false)
            ->assertSee('"track":null', false);
    }

    public function test_editing_hands_the_editor_the_track(): void
    {
        $track = $this->track();

        $this->get("/games/racing/tracks/{$track->id}/edit")
            ->assertOk()
            ->assertSee('"method":"PUT"', false)
            ->assertSee('"name":"Parliament loop"', false)
            ->assertSee('-71.2124');
    }

    public function test_the_play_page_hands_the_game_the_track(): void
    {
        $track = $this->track();

        $this->get("/games/racing/tracks/{$track->id}/play")
            ->assertOk()
            ->assertSee('/games/racing/live/play.js')
            ->assertSee('window.racingConfig', false)
            ->assertSee('"id":'.$track->id, false)
            ->assertSee('"laps":3', false);
    }

    public function test_saving_a_new_track_stores_it_and_says_where_to_go(): void
    {
        $response = $this->postJson('/games/racing/tracks', $this->payload())->assertCreated();

        $track = RacingTrack::sole();
        $this->assertSame('Parliament loop', $track->name);
        $this->assertSame('quebec-plains', $track->map);
        $this->assertSame(1450, $track->length);
        $this->assertCount(3, $track->gates);
        $this->assertSame(-71.2124, $track->gates[1]['lon']);
        $response->assertJson([
            'id' => $track->id,
            'play_url' => url("/games/racing/tracks/{$track->id}/play"),
            'index_url' => url('/games/racing'),
        ]);
    }

    public function test_a_track_needs_a_name_laps_and_at_least_three_checkpoints(): void
    {
        $this->postJson('/games/racing/tracks', $this->payload([
            'name' => '',
            'laps' => 0,
            'gates' => array_slice($this->payload()['gates'], 0, 2),
        ]))->assertUnprocessable()->assertJsonValidationErrors(['name', 'laps', 'gates']);

        $this->assertSame(0, RacingTrack::count());
    }

    public function test_every_checkpoint_must_be_on_the_map(): void
    {
        $gates = $this->payload()['gates'];
        $gates[2]['lat'] = 46.9;

        $this->postJson('/games/racing/tracks', $this->payload(['gates' => $gates]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['gates.2.lat' => 'Every checkpoint must be on the map.']);
    }

    public function test_a_checkpoint_has_only_the_known_fields(): void
    {
        $gates = $this->payload()['gates'];
        $gates[0]['colour'] = 'red';

        $this->postJson('/games/racing/tracks', $this->payload(['gates' => $gates]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['gates.0']);
    }

    public function test_two_tracks_cannot_share_a_name(): void
    {
        $this->track();

        $this->postJson('/games/racing/tracks', $this->payload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name' => 'There is already a track with that name.']);
    }

    public function test_updating_a_track_keeps_its_name_free_for_itself(): void
    {
        $track = $this->track();

        $this->putJson("/games/racing/tracks/{$track->id}", $this->payload(['laps' => 5]))
            ->assertOk()
            ->assertJson(['id' => $track->id]);

        $this->assertSame(5, $track->fresh()->laps);
        $this->assertSame(1, RacingTrack::count());
    }

    public function test_deleting_a_track(): void
    {
        $track = $this->track();

        $this->delete("/games/racing/tracks/{$track->id}")
            ->assertRedirect('/games/racing')
            ->assertSessionHas('success');

        $this->assertModelMissing($track);
    }

    public function test_the_outline_fits_the_track_in_a_square_box(): void
    {
        $path = $this->track()->outlinePath();

        $this->assertStringStartsWith('M ', $path);
        $this->assertStringEndsWith(' Z', $path);
        preg_match_all('/-?\d+\.\d/', $path, $numbers);
        $this->assertCount(6, $numbers[0]);
        foreach ($numbers[0] as $number) {
            $this->assertGreaterThanOrEqual(8, (float) $number);
            $this->assertLessThanOrEqual(92, (float) $number);
        }
    }

    public function test_the_default_tracks_are_seeded_once_and_edits_survive_reseeding(): void
    {
        $this->seed(RacingTrackSeeder::class);
        $track = RacingTrack::where('name', 'Tour de la Citadelle')->sole();
        $this->assertSame(3, $track->laps);
        $this->assertGreaterThanOrEqual(3, count($track->gates));

        $track->update(['laps' => 7]);
        $this->seed(RacingTrackSeeder::class);

        $this->assertSame(1, RacingTrack::where('name', 'Tour de la Citadelle')->count());
        $this->assertSame(7, $track->fresh()->laps);
    }
}
