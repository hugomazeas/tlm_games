<?php

namespace Tests\Feature;

use App\Games\HotPotato\Models\HotPotatoLook;
use App\Models\Player;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The hot potato locker: a player's colour, potato skin, hat, trail and boom,
 * changeable only with the profile claimed and unlocked.
 */
class HotPotatoLockerTest extends TestCase
{
    use RefreshDatabase;

    private const DEFAULTS = ['colour' => 'auto', 'skin' => 'classic', 'hat' => 'none', 'trail' => 'ghosts', 'boom' => 'pie'];

    private const PUMPKIN = ['colour' => 'grape', 'skin' => 'pumpkin', 'hat' => 'top', 'trail' => 'fire', 'boom' => 'confetti'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateCsrfToken::class);
        config(['games.hot_potato.internal_secret' => 'test-secret']);
    }

    public function test_a_player_who_never_visited_has_the_default_look(): void
    {
        $this->assertSame(self::DEFAULTS, HotPotatoLook::of(Player::create(['name' => 'Alice'])));
    }

    public function test_an_unlocked_player_saves_their_look(): void
    {
        $player = $this->claimed('Alice');
        $this->unlock($player);

        $this->putJson("/games/hot-potato/locker/{$player->id}", self::PUMPKIN)
            ->assertOk()
            ->assertExactJson(self::PUMPKIN);

        $this->assertSame(self::PUMPKIN, HotPotatoLook::of($player));
    }

    public function test_an_unclaimed_or_locked_profile_cannot_be_changed(): void
    {
        $unclaimed = Player::create(['name' => 'Alice']);
        $locked = $this->claimed('Bob');

        $this->putJson("/games/hot-potato/locker/{$unclaimed->id}", self::PUMPKIN)->assertForbidden();
        $this->putJson("/games/hot-potato/locker/{$locked->id}", self::PUMPKIN)->assertForbidden();
        $this->assertDatabaseCount('hot_potato_looks', 0);
    }

    public function test_only_catalogue_choices_are_accepted(): void
    {
        $player = $this->claimed('Alice');
        $this->unlock($player);

        $this->putJson("/games/hot-potato/locker/{$player->id}", [...self::PUMPKIN, 'hat' => 'crown'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('hat');
        $this->putJson("/games/hot-potato/locker/{$player->id}", ['skin' => 'pumpkin'])
            ->assertJsonValidationErrors(['colour', 'hat', 'trail', 'boom']);
    }

    public function test_a_choice_dropped_from_the_catalogue_falls_back_to_its_default(): void
    {
        $player = Player::create(['name' => 'Alice']);
        HotPotatoLook::create(['player_id' => $player->id, ...self::PUMPKIN, 'hat' => 'retired-hat']);

        $this->assertSame([...self::PUMPKIN, 'hat' => 'none'], HotPotatoLook::of($player));
    }

    public function test_the_game_server_gets_the_look_with_the_player(): void
    {
        $player = Player::create(['name' => 'Alice']);
        HotPotatoLook::create(['player_id' => $player->id, ...self::PUMPKIN]);

        $this->getJson("/internal/hot-potato/players/{$player->id}", ['X-Internal-Secret' => 'test-secret'])
            ->assertOk()
            ->assertJsonPath('look', self::PUMPKIN);
    }

    public function test_the_locker_page_offers_the_right_next_step(): void
    {
        $unclaimed = Player::create(['name' => 'Alice']);
        $this->get("/games/hot-potato/locker/{$unclaimed->id}")
            ->assertOk()
            ->assertSee('data-locker-unclaimed', false)
            ->assertDontSee('data-locker-unlock', false);

        $player = $this->claimed('Bob');
        $this->get("/games/hot-potato/locker/{$player->id}")
            ->assertOk()
            ->assertSee('data-locker-unlock', false)
            ->assertSee('value="/games/hot-potato/locker/'.$player->id.'"', false);

        $this->unlock($player);
        $this->get("/games/hot-potato/locker/{$player->id}")
            ->assertOk()
            ->assertDontSee('data-locker-unlock', false)
            ->assertDontSee('data-locker-unclaimed', false)
            ->assertSee('Pumpkin')
            ->assertViewHas('canEdit', true);
    }

    public function test_unlocking_from_the_locker_comes_back_to_it_but_never_off_site(): void
    {
        $player = $this->claimed('Alice');
        $locker = "/games/hot-potato/locker/{$player->id}";

        $this->post("/players/{$player->id}/unlock", ['pin' => '4821', 'redirect' => $locker])->assertRedirect($locker);
        foreach (['//evil.example', '/\\evil.example', 'https://evil.example'] as $offSite) {
            $this->post("/players/{$player->id}/unlock", ['pin' => '4821', 'redirect' => $offSite])
                ->assertRedirect("/players/{$player->id}");
        }
    }

    public function test_the_hot_potato_page_and_the_profile_link_to_the_locker(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->get('/games/hot-potato')->assertOk()->assertSee('data-locker-link', false)->assertSee('data-skin-picker', false);
        $this->get("/players/{$player->id}")->assertOk()->assertSee("/games/hot-potato/locker/{$player->id}", false);
    }

    private function claimed(string $name): Player
    {
        $player = Player::create(['name' => $name]);
        $player->forceFill(['pin' => '4821'])->save();

        return $player;
    }

    private function unlock(Player $player): void
    {
        $this->post("/players/{$player->id}/unlock", ['pin' => '4821'])->assertSessionHasNoErrors();
    }
}
