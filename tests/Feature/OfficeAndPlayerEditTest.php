<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The office and player forms after the hourly matchmaking draw and its Buro
 * link were removed: only the plain fields are left.
 */
class OfficeAndPlayerEditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(VerifyCsrfToken::class);
    }

    public function test_matchmaking_schema_is_gone(): void
    {
        $this->assertFalse(Schema::hasTable('ping_pong_challenges'));
        $this->assertFalse(Schema::hasColumns('offices', ['buro_office_id']));
        $this->assertFalse(Schema::hasColumns('offices', ['matchmaking_enabled']));
        $this->assertFalse(Schema::hasColumns('players', ['email']));
        $this->assertFalse(Schema::hasColumns('players', ['buro_user_id']));
        $this->assertFalse(Schema::hasColumns('players', ['unavailable_until']));
    }

    public function test_an_office_can_be_edited_and_renamed(): void
    {
        $office = Office::create(['name' => 'Montreal']);

        $this->get("/offices/{$office->id}/edit")
            ->assertOk()
            ->assertDontSee('Buro')
            ->assertDontSee('matchmaking');

        $this->put("/offices/{$office->id}", ['name' => 'Quebec'])
            ->assertRedirect('/offices');

        $this->assertSame('Quebec', $office->fresh()->name);
    }

    public function test_an_office_name_is_still_required(): void
    {
        $office = Office::create(['name' => 'Montreal']);

        $this->put("/offices/{$office->id}", ['name' => ''])
            ->assertSessionHasErrors('name');
    }

    public function test_a_player_can_be_edited_without_an_email(): void
    {
        $office = Office::create(['name' => 'Montreal']);
        $player = Player::create(['name' => 'Ada']);

        $this->get("/players/{$player->id}/edit")
            ->assertOk()
            ->assertDontSee('Buro')
            ->assertDontSee('Work email');

        $this->put("/players/{$player->id}", ['name' => 'Ada L.', 'office_id' => $office->id])
            ->assertRedirect("/players/{$player->id}");

        $player->refresh();
        $this->assertSame('Ada L.', $player->name);
        $this->assertSame($office->id, $player->office_id);
    }

    public function test_the_challenges_page_is_gone(): void
    {
        $this->get('/games/ping-pong/challenges')->assertNotFound();
        $this->getJson('/games/ping-pong/api/challenges/current')->assertNotFound();
    }
}
