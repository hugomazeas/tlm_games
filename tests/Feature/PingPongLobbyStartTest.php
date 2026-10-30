<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongLobbyParticipant;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Starting a lobby: the join page sends the starter to the remote from this
 * response's match id, without waiting for the WebSocket event.
 */
class PingPongLobbyStartTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(VideoRecordingService::class)->shouldIgnoreMissing();
        Queue::fake();
        Event::fake();
    }

    private function lobby(): PingPongLobby
    {
        return PingPongLobby::create([
            'code' => PingPongLobby::generateCode(),
            'mode' => '1v1',
            'host_token' => Str::random(64),
            'status' => 'waiting',
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

    public function test_the_left_player_starting_gets_the_match_id_back(): void
    {
        $lobby = $this->lobby();
        $ada = $this->participant($lobby, 'Ada', 'left');
        $this->participant($lobby, 'Bo', 'right');

        $response = $this->postJson("/games/ping-pong/api/lobbies/{$lobby->code}/start", ['session_token' => $ada->session_token])
            ->assertOk();

        $match = PingPongMatch::firstOrFail();
        $response->assertJsonPath('match.id', $match->id);
        $this->assertSame($match->id, $lobby->fresh()->match_id);
    }

    public function test_the_right_player_cannot_start(): void
    {
        $lobby = $this->lobby();
        $this->participant($lobby, 'Ada', 'left');
        $bo = $this->participant($lobby, 'Bo', 'right');

        $this->postJson("/games/ping-pong/api/lobbies/{$lobby->code}/start", ['session_token' => $bo->session_token])
            ->assertForbidden();

        $this->assertSame(0, PingPongMatch::count());
    }
}
