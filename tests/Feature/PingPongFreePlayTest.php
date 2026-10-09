<?php

namespace Tests\Feature;

use App\Games\PingPong\Events\LobbyUpdated;
use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongLobbyParticipant;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Models\PingPongRatingChange;
use App\Games\PingPong\Services\EloService;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Free play: toggled in the lobby, the match plays out and counts as a
 * finished match, but never moves ELO or shows an ELO preview.
 */
class PingPongFreePlayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(VideoRecordingService::class)->shouldIgnoreMissing();
        Queue::fake();
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

    private function matchPoint(bool $freePlay): PingPongMatch
    {
        $a = Player::create(['name' => 'Ada']);
        $b = Player::create(['name' => 'Bo']);

        return PingPongMatch::create([
            'mode' => '1v1', 'free_play' => $freePlay, 'player_left_id' => $a->id, 'player_right_id' => $b->id,
            'first_server_id' => $a->id, 'player_left_score' => 10, 'started_at' => now(),
        ]);
    }

    public function test_a_lobby_member_can_toggle_free_play_and_everyone_is_told(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby();
        $bo = $this->participant($lobby, 'Bo', 'right');

        $this->patchJson("/games/ping-pong/api/lobbies/{$lobby->code}/free-play", [
            'free_play' => true,
            'session_token' => $bo->session_token,
        ])->assertOk()->assertJson(['free_play' => true]);

        $this->assertTrue($lobby->fresh()->free_play);
        Event::assertDispatched(LobbyUpdated::class, fn (LobbyUpdated $e) => $e->lobby['free_play'] === true);
        $this->getJson("/games/ping-pong/api/lobbies/{$lobby->code}")->assertJsonPath('free_play', true);
    }

    public function test_the_host_can_toggle_free_play(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby();

        $this->patchJson("/games/ping-pong/api/lobbies/{$lobby->code}/free-play", [
            'free_play' => true,
            'host_token' => $lobby->host_token,
        ])->assertOk();

        $this->assertTrue($lobby->fresh()->free_play);
    }

    public function test_strangers_cannot_toggle_free_play(): void
    {
        Event::fake([LobbyUpdated::class]);
        $lobby = $this->lobby();

        $this->patchJson("/games/ping-pong/api/lobbies/{$lobby->code}/free-play", [
            'free_play' => true,
            'session_token' => 'not-a-member',
        ])->assertForbidden();

        $this->assertFalse($lobby->fresh()->free_play);
        Event::assertNotDispatched(LobbyUpdated::class);
    }

    public function test_starting_a_free_play_lobby_starts_a_free_play_match(): void
    {
        Event::fake();
        $lobby = $this->lobby();
        $lobby->update(['free_play' => true]);
        $ada = $this->participant($lobby, 'Ada', 'left');
        $this->participant($lobby, 'Bo', 'right');

        $this->postJson("/games/ping-pong/api/lobbies/{$lobby->code}/start", ['session_token' => $ada->session_token])
            ->assertOk()
            ->assertJsonPath('match.free_play', true);

        $this->assertTrue(PingPongMatch::firstOrFail()->free_play);
    }

    public function test_winning_a_free_play_match_finishes_it_without_touching_elo(): void
    {
        $match = $this->matchPoint(freePlay: true);

        $this->patchJson("/games/ping-pong/api/matches/{$match->id}", ['side' => 'left', 'action' => 'increment'])
            ->assertOk()
            ->assertJsonPath('is_complete', true)
            ->assertJsonMissingPath('elo_changes');

        $match->refresh();
        $this->assertSame($match->player_left_id, $match->winner_id);
        $this->assertNull($match->player_left_elo_after);
        $this->assertSame(0, PingPongRatingChange::count());
        $this->assertSame(0, PingPongRating::count());
    }

    public function test_elo_preview_is_refused_for_free_play_matches(): void
    {
        $match = $this->matchPoint(freePlay: true);

        $this->getJson("/games/ping-pong/api/matches/{$match->id}/elo-preview")->assertStatus(422);
    }

    public function test_free_play_wins_do_not_extend_the_elo_win_streak(): void
    {
        $match = $this->matchPoint(freePlay: true);
        $match->update(['winner_id' => $match->player_left_id, 'ended_at' => now()]);

        $this->assertSame(0, app(EloService::class)->getCurrentWinStreak($match->player_left_id, '1v1'));
    }

    public function test_a_rematch_keeps_free_play(): void
    {
        Event::fake();
        $match = $this->matchPoint(freePlay: true);
        $match->update(['winner_id' => $match->player_left_id, 'ended_at' => now()]);

        $code = $this->postJson("/games/ping-pong/api/matches/{$match->id}/rematch")->assertCreated()->json('lobby_code');

        $this->assertTrue(PingPongLobby::where('code', $code)->firstOrFail()->free_play);
    }
}
