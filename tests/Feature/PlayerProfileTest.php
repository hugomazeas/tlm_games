<?php

namespace Tests\Feature;

use App\Models\Player;
use App\Services\PlayerPinService;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Claiming a player with a 4-digit PIN, unlocking it, and the profile photo
 * that only a claimed, unlocked profile can change.
 */
class PlayerProfileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(VerifyCsrfToken::class);
        Storage::fake('public');
    }

    private function claimedPlayer(string $pin = '1234'): Player
    {
        $player = Player::create(['name' => 'Ada Lovelace']);
        $player->forceFill(['pin' => $pin])->save();

        return $player->fresh();
    }

    public function test_an_unclaimed_player_can_be_claimed_with_a_pin(): void
    {
        $player = Player::create(['name' => 'Ada']);

        $this->post("/players/{$player->id}/pin", ['pin' => '4821', 'pin_confirmation' => '4821'])
            ->assertRedirect("/players/{$player->id}");

        $player->refresh();
        $this->assertTrue($player->hasPin());
        $this->assertTrue(Hash::check('4821', $player->pin));
        $this->assertNotSame('4821', $player->getRawOriginal('pin'));

        // Whoever just claimed it stays unlocked.
        $this->get("/players/{$player->id}/edit")->assertOk();
    }

    public function test_a_pin_must_be_four_digits_and_confirmed(): void
    {
        $player = Player::create(['name' => 'Ada']);

        $this->post("/players/{$player->id}/pin", ['pin' => '12a4', 'pin_confirmation' => '12a4'])
            ->assertSessionHasErrors('pin');
        $this->post("/players/{$player->id}/pin", ['pin' => '12345', 'pin_confirmation' => '12345'])
            ->assertSessionHasErrors('pin');
        $this->post("/players/{$player->id}/pin", ['pin' => '1234', 'pin_confirmation' => '4321'])
            ->assertSessionHasErrors('pin');

        $this->assertFalse($player->fresh()->hasPin());
    }

    public function test_someone_else_cannot_change_the_pin_of_a_claimed_player(): void
    {
        $player = $this->claimedPlayer();

        $this->post("/players/{$player->id}/pin", ['pin' => '0000', 'pin_confirmation' => '0000'])
            ->assertRedirect("/players/{$player->id}")
            ->assertSessionHas('error');

        $this->assertTrue(Hash::check('1234', $player->fresh()->pin));
    }

    public function test_a_claimed_profile_is_locked_until_the_pin_is_entered(): void
    {
        $player = $this->claimedPlayer();

        $this->get("/players/{$player->id}")->assertOk()->assertSee('Unlock')->assertDontSee('Add a photo');
        $this->get("/players/{$player->id}/edit")->assertRedirect("/players/{$player->id}");
        $this->put("/players/{$player->id}", ['name' => 'Hacked'])->assertRedirect("/players/{$player->id}");
        $this->delete("/players/{$player->id}")->assertRedirect("/players/{$player->id}");

        $this->assertSame('Ada Lovelace', $player->fresh()->name);

        $this->post("/players/{$player->id}/unlock", ['pin' => '1234'])
            ->assertRedirect("/players/{$player->id}");

        $this->get("/players/{$player->id}")->assertSee('Add a photo');
        $this->put("/players/{$player->id}", ['name' => 'Ada L.'])->assertRedirect("/players/{$player->id}");
        $this->assertSame('Ada L.', $player->fresh()->name);
    }

    public function test_an_unclaimed_player_stays_open_to_everyone(): void
    {
        $player = Player::create(['name' => 'Ada']);

        $this->get("/players/{$player->id}/edit")->assertOk();
        $this->delete("/players/{$player->id}")->assertRedirect('/players');
        $this->assertModelMissing($player);
    }

    public function test_a_wrong_pin_does_not_unlock(): void
    {
        $player = $this->claimedPlayer();

        $this->post("/players/{$player->id}/unlock", ['pin' => '9999'])
            ->assertSessionHasErrors(['pin' => 'Wrong PIN.']);

        $this->get("/players/{$player->id}/edit")->assertRedirect("/players/{$player->id}");
        $this->assertSame(1, $player->fresh()->pin_failed_attempts);
    }

    public function test_too_many_wrong_pins_lock_the_profile_even_against_the_right_one(): void
    {
        $player = $this->claimedPlayer();

        foreach (range(1, PlayerPinService::MAX_ATTEMPTS) as $attempt) {
            $this->post("/players/{$player->id}/unlock", ['pin' => '0000']);
        }

        $this->assertTrue($player->fresh()->pin_locked_until->isFuture());

        $this->post("/players/{$player->id}/unlock", ['pin' => '1234'])->assertSessionHasErrors('pin');
        $this->get("/players/{$player->id}/edit")->assertRedirect("/players/{$player->id}");

        $this->travel(PlayerPinService::LOCKOUT_MINUTES + 1)->minutes();

        $this->post("/players/{$player->id}/unlock", ['pin' => '1234'])->assertSessionHasNoErrors();
        $this->get("/players/{$player->id}/edit")->assertOk();
    }

    public function test_the_unlock_expires(): void
    {
        $player = $this->claimedPlayer();

        $this->post("/players/{$player->id}/unlock", ['pin' => '1234']);
        $this->get("/players/{$player->id}/edit")->assertOk();

        $this->travel(PlayerPinService::UNLOCK_MINUTES + 1)->minutes();

        $this->get("/players/{$player->id}/edit")->assertRedirect("/players/{$player->id}");
    }

    public function test_locking_ends_the_unlock(): void
    {
        $player = $this->claimedPlayer();

        $this->post("/players/{$player->id}/unlock", ['pin' => '1234']);
        $this->post("/players/{$player->id}/lock")->assertRedirect("/players/{$player->id}");

        $this->get("/players/{$player->id}/edit")->assertRedirect("/players/{$player->id}");
    }

    public function test_an_unlocked_player_can_upload_a_photo_that_is_re_encoded(): void
    {
        $player = $this->claimedPlayer();
        $this->post("/players/{$player->id}/unlock", ['pin' => '1234']);

        $this->postJson("/players/{$player->id}/avatar", [
            'avatar' => UploadedFile::fake()->image('me.png', 800, 600),
        ])->assertOk()->assertJsonPath('avatar_url', fn (string $url) => str_starts_with($url, '/storage/avatars/'));

        $path = $player->fresh()->avatar_path;
        Storage::disk('public')->assertExists($path);
        $this->assertStringEndsWith('.jpg', $path);

        [$width, $height, $type] = getimagesizefromstring(Storage::disk('public')->get($path));
        $this->assertSame([256, 256, IMAGETYPE_JPEG], [$width, $height, $type]);

        $this->get('/players')->assertSee('/storage/'.$path);
    }

    public function test_a_new_photo_replaces_the_old_file(): void
    {
        $player = $this->claimedPlayer();
        $this->post("/players/{$player->id}/unlock", ['pin' => '1234']);

        $this->postJson("/players/{$player->id}/avatar", ['avatar' => UploadedFile::fake()->image('a.jpg', 300, 300)]);
        $first = $player->fresh()->avatar_path;

        $this->postJson("/players/{$player->id}/avatar", ['avatar' => UploadedFile::fake()->image('b.jpg', 300, 300)]);
        $second = $player->fresh()->avatar_path;

        $this->assertNotSame($first, $second);
        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);
    }

    public function test_a_locked_or_unclaimed_player_cannot_get_a_photo(): void
    {
        $claimed = $this->claimedPlayer();
        $unclaimed = Player::create(['name' => 'Grace']);

        $this->postJson("/players/{$claimed->id}/avatar", ['avatar' => UploadedFile::fake()->image('me.jpg')])
            ->assertForbidden();
        $this->postJson("/players/{$unclaimed->id}/avatar", ['avatar' => UploadedFile::fake()->image('me.jpg')])
            ->assertForbidden();

        $this->assertNull($claimed->fresh()->avatar_path);
        $this->assertNull($unclaimed->fresh()->avatar_path);
        $this->assertEmpty(Storage::disk('public')->allFiles());
    }

    public function test_only_images_are_accepted(): void
    {
        $player = $this->claimedPlayer();
        $this->post("/players/{$player->id}/unlock", ['pin' => '1234']);

        $this->postJson("/players/{$player->id}/avatar", [
            'avatar' => UploadedFile::fake()->create('evil.php', 10, 'application/x-php'),
        ])->assertUnprocessable()->assertJsonValidationErrors('avatar');

        $this->postJson("/players/{$player->id}/avatar", [
            'avatar' => UploadedFile::fake()->image('huge.jpg', 300, 300)->size(6000),
        ])->assertUnprocessable()->assertJsonValidationErrors('avatar');

        $this->assertNull($player->fresh()->avatar_path);
    }

    public function test_the_photo_can_be_removed(): void
    {
        $player = $this->claimedPlayer();
        $this->post("/players/{$player->id}/unlock", ['pin' => '1234']);
        $this->postJson("/players/{$player->id}/avatar", ['avatar' => UploadedFile::fake()->image('me.jpg')]);
        $path = $player->fresh()->avatar_path;

        $this->delete("/players/{$player->id}/avatar")->assertRedirect("/players/{$player->id}");

        $this->assertNull($player->fresh()->avatar_path);
        Storage::disk('public')->assertMissing($path);
    }

    public function test_deleting_a_player_deletes_their_photo(): void
    {
        $player = $this->claimedPlayer();
        $this->post("/players/{$player->id}/unlock", ['pin' => '1234']);
        $this->postJson("/players/{$player->id}/avatar", ['avatar' => UploadedFile::fake()->image('me.jpg')]);
        $path = $player->fresh()->avatar_path;

        $this->delete("/players/{$player->id}")->assertRedirect('/players');

        Storage::disk('public')->assertMissing($path);
    }

    public function test_players_without_a_photo_show_initials(): void
    {
        Player::create(['name' => 'Ada Lovelace']);

        $this->get('/players')->assertOk()->assertSee('AL');
    }

    public function test_the_pin_never_leaves_the_model_but_the_avatar_url_does(): void
    {
        $player = $this->claimedPlayer();
        $player->forceFill(['avatar_path' => 'avatars/1-abc.jpg'])->save();

        $json = $player->fresh()->toArray();

        $this->assertArrayNotHasKey('pin', $json);
        $this->assertArrayNotHasKey('avatar_path', $json);
        $this->assertSame('/storage/avatars/1-abc.jpg', $json['avatar_url']);
    }

    public function test_reset_pin_command_clears_the_pin_and_keeps_the_photo(): void
    {
        $player = $this->claimedPlayer();
        $player->forceFill(['avatar_path' => 'avatars/1-abc.jpg'])->save();

        $this->artisan('players:reset-pin', ['player' => 'Ada Lovelace'])->assertSuccessful();

        $player->refresh();
        $this->assertFalse($player->hasPin());
        $this->assertSame('avatars/1-abc.jpg', $player->avatar_path);

        $this->artisan('players:reset-pin', ['player' => '999'])->assertFailed();
    }

    public function test_initials(): void
    {
        $this->assertSame('AL', Player::initialsFor('Ada Lovelace'));
        $this->assertSame('GH', Player::initialsFor('  grace  brewster  hopper '));
        $this->assertSame('É', Player::initialsFor('émile'));
        $this->assertSame('?', Player::initialsFor(''));
    }
}
