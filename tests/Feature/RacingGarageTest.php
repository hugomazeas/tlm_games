<?php

namespace Tests\Feature;

use App\Games\Racing\Models\RacingKart;
use App\Games\Racing\Models\RacingTrack;
use App\Models\Player;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RacingGarageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateCsrfToken::class);
    }

    private function track(): RacingTrack
    {
        return RacingTrack::create([
            'name' => 'Parliament loop',
            'map' => 'quebec-plains',
            'laps' => 3,
            'gates' => [
                ['lat' => 46.8069, 'lon' => -71.2155, 'heading' => -50, 'width' => 11],
                ['lat' => 46.8087, 'lon' => -71.2124, 'heading' => -139, 'width' => 10],
                ['lat' => 46.8052, 'lon' => -71.2106, 'heading' => 163, 'width' => 10],
            ],
        ]);
    }

    public function test_the_track_list_lets_you_pick_who_is_driving(): void
    {
        Player::create(['name' => 'Alice']);

        $this->get('/games/racing')
            ->assertOk()
            ->assertSee('Driving as')
            ->assertSee('Alice')
            ->assertSee('/games/racing/garage');
    }

    public function test_the_garage_shows_a_new_player_the_default_kart(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->get("/games/racing/garage/{$player->id}")
            ->assertOk()
            ->assertSee('Alice’s kart', false)
            ->assertSee('/games/racing/live/garage.js')
            ->assertSee('"body":"'.RacingKart::DEFAULT_BODY.'"', false)
            ->assertSee('"accent":"'.RacingKart::DEFAULT_ACCENT.'"', false);
    }

    public function test_saving_colours_keeps_them_on_the_player(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->putJson("/games/racing/garage/{$player->id}", ['body' => '#22C55E', 'accent' => '#8b5cf6'])
            ->assertOk()
            ->assertJson(['name' => 'Alice', 'body' => '#22c55e', 'accent' => '#8b5cf6']);

        $this->putJson("/games/racing/garage/{$player->id}", ['body' => '#facc15', 'accent' => '#8b5cf6'])->assertOk();

        $this->assertSame(1, RacingKart::count());
        $this->assertSame('#facc15', RacingKart::sole()->body);
    }

    public function test_colours_must_be_hex(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->putJson("/games/racing/garage/{$player->id}", ['body' => 'red', 'accent' => '#12345'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['body', 'accent']);

        $this->assertSame(0, RacingKart::count());
    }

    public function test_racing_as_a_player_puts_their_name_and_colours_on_the_kart(): void
    {
        $player = Player::create(['name' => 'Alice']);
        RacingKart::create(['player_id' => $player->id, 'body' => '#22c55e', 'accent' => '#8b5cf6']);
        $track = $this->track();

        $this->get("/games/racing/tracks/{$track->id}/play?player={$player->id}")
            ->assertOk()
            ->assertSee('"driver":{"name":"Alice","body":"#22c55e","accent":"#8b5cf6"}', false);
    }

    public function test_without_a_player_you_race_as_a_guest(): void
    {
        $track = $this->track();
        $guest = '"driver":{"name":"Guest","body":"'.RacingKart::DEFAULT_BODY.'","accent":"'.RacingKart::DEFAULT_ACCENT.'"}';

        $this->get("/games/racing/tracks/{$track->id}/play")->assertOk()->assertSee($guest, false);
        $this->get("/games/racing/tracks/{$track->id}/play?player=999")->assertOk()->assertSee($guest, false);
    }

    public function test_deleting_a_player_takes_their_kart_with_them(): void
    {
        $player = Player::create(['name' => 'Alice']);
        RacingKart::create(['player_id' => $player->id, 'body' => '#22c55e', 'accent' => '#8b5cf6']);

        $player->delete();

        $this->assertSame(0, RacingKart::count());
    }
}
