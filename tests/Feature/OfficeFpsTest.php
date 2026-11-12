<?php

namespace Tests\Feature;

use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The office FPS's page: one game, always open. It asks who you are, then loads the game
 * from the game server with who's playing.
 */
class OfficeFpsTest extends TestCase
{
    use RefreshDatabase;

    public function test_without_a_player_the_page_asks_who_is_playing(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        Player::create(['name' => 'Bob']);

        $this->get('/games/office-fps')
            ->assertOk()
            ->assertSeeInOrder(['Ann', 'Bob'])
            ->assertSee(url('/games/office-fps?player='.$ann->id), false)
            ->assertSee(url('/games/office-fps?guest=1'), false)
            ->assertSee(url('/games/office-fps/live/state'), false)
            ->assertDontSee('/games/office-fps/live/play.js', false);
    }

    public function test_a_player_gets_the_game_with_their_id_and_the_versioned_bundle(): void
    {
        $ann = Player::create(['name' => 'Ann']);

        $this->get('/games/office-fps?player='.$ann->id)
            ->assertOk()
            ->assertSee('"playerId":'.$ann->id, false)
            ->assertSee('"name":"Ann"', false)
            ->assertSee('/games/office-fps/live/play.js?v=', false);
    }

    public function test_a_guest_plays_without_an_id(): void
    {
        $this->get('/games/office-fps?guest=1')
            ->assertOk()
            ->assertSee('"playerId":null', false)
            ->assertSee('/games/office-fps/live/play.js?v=', false);
    }

    public function test_the_home_page_has_its_card_from_the_migration(): void
    {
        $this->assertDatabaseHas('game_types', ['slug' => 'office-fps', 'is_active' => true]);

        $this->get('/')
            ->assertOk()
            ->assertSee('Office FPS')
            ->assertSee(url('/games/office-fps'), false);
    }

    public function test_an_unknown_player_is_asked_to_pick_again(): void
    {
        $this->get('/games/office-fps?player=999')
            ->assertOk()
            ->assertSee("That player doesn't exist", false)
            ->assertDontSee('/games/office-fps/live/play.js', false);
    }
}
