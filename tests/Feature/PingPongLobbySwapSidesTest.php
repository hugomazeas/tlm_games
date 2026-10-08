<?php

namespace Tests\Feature;

use App\Games\PingPong\Events\LobbyUpdated;
use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongLobbyParticipant;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers the "⇄ Swap sides" button on the phone lobby, which flips every
 * participant to the other side even when both sides are full.
 */
class PingPongLobbySwapSidesTest extends TestCase
{
    use RefreshDatabase;

    private function lobby(string $mode, string $status = 'waiting'): PingPongLobby
    {
        return PingPongLobby::create([
            'code' => PingPongLobby::generateCode(),
            'mode' => $mode,
            'host_token' => Str::random(64),
            'status' => $status,
            'expires_at' => now()->addDay(),
        ]);
    }

    private function participant(PingPongLobby $lobby, string $name, string $side): PingPongLobbyParticipant
    {
        return PingPongLobbyParticipant::create([
            'lobby_id' => $lobby->id,
            'player_id' => Player::create(['name' => $name])->id,
            'side' => $side,
            'session_token' => Str::random(64),
            'last_seen_at' => now(),
        ]);
    }

    private function swapSides(PingPongLobby $lobby, string $sessionToken): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/games/ping-pong/api/lobbies/{$lobby->code}/swap", [
            'session_token' => $sessionToken,
        ]);
    }

    public function test_swapping_a_full_singles_lobby_trades_both_players(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby('1v1');
        $ada = $this->participant($lobby, 'Ada', 'left');
        $bo = $this->participant($lobby, 'Bo', 'right');

        $this->swapSides($lobby, $bo->session_token)
            ->assertOk()
            ->assertJson(['side' => 'left']);

        $this->assertSame('right', $ada->fresh()->side);
        $this->assertSame('left', $bo->fresh()->side);
        Event::assertDispatched(LobbyUpdated::class);
    }

    public function test_swapping_a_doubles_lobby_keeps_teams_together(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby('2v2');
        $ada = $this->participant($lobby, 'Ada', 'left');
        $cy = $this->participant($lobby, 'Cy', 'left');
        $bo = $this->participant($lobby, 'Bo', 'right');
        $di = $this->participant($lobby, 'Di', 'right');

        $this->swapSides($lobby, $ada->session_token)
            ->assertOk()
            ->assertJson(['side' => 'right']);

        $this->assertSame('right', $ada->fresh()->side);
        $this->assertSame('right', $cy->fresh()->side);
        $this->assertSame('left', $bo->fresh()->side);
        $this->assertSame('left', $di->fresh()->side);
    }

    public function test_swapping_a_half_full_lobby_moves_everyone_over(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby('2v2');
        $ada = $this->participant($lobby, 'Ada', 'left');
        $cy = $this->participant($lobby, 'Cy', 'left');
        $bo = $this->participant($lobby, 'Bo', 'right');

        $this->swapSides($lobby, $bo->session_token)->assertOk();

        $this->assertSame('right', $ada->fresh()->side);
        $this->assertSame('right', $cy->fresh()->side);
        $this->assertSame('left', $bo->fresh()->side);
    }

    public function test_an_unknown_session_token_cannot_swap(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby('1v1');
        $ada = $this->participant($lobby, 'Ada', 'left');
        $this->participant($lobby, 'Bo', 'right');

        $this->swapSides($lobby, 'not-a-real-token')->assertNotFound();

        $this->assertSame('left', $ada->fresh()->side);
        Event::assertNotDispatched(LobbyUpdated::class);
    }

    public function test_a_token_from_another_lobby_cannot_swap(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby('1v1');
        $ada = $this->participant($lobby, 'Ada', 'left');
        $outsider = $this->participant($this->lobby('1v1'), 'Eve', 'left');

        $this->swapSides($lobby, $outsider->session_token)->assertNotFound();

        $this->assertSame('left', $ada->fresh()->side);
    }

    public function test_a_started_lobby_cannot_swap(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby('1v1', 'started');
        $ada = $this->participant($lobby, 'Ada', 'left');
        $this->participant($lobby, 'Bo', 'right');

        $this->swapSides($lobby, $ada->session_token)->assertNotFound();

        $this->assertSame('left', $ada->fresh()->side);
        Event::assertNotDispatched(LobbyUpdated::class);
    }

    public function test_the_session_token_is_required(): void
    {
        $lobby = $this->lobby('1v1');

        $this->postJson("/games/ping-pong/api/lobbies/{$lobby->code}/swap", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('session_token');
    }
}
