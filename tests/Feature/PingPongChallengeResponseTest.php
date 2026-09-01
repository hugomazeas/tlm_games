<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongLobby;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class PingPongChallengeResponseTest extends TestCase
{
    use RefreshDatabase;

    private function challenge(): PingPongChallenge
    {
        $office = Office::create(['name' => 'Quebec']);
        $lobby = PingPongLobby::create([
            'code' => 'AB12',
            'mode' => '1v1',
            'host_token' => str_repeat('h', 64),
            'status' => 'waiting',
            'expires_at' => Carbon::now()->addMinutes(50),
        ]);

        return PingPongChallenge::create([
            'office_id' => $office->id,
            'player_one_id' => Player::create(['name' => 'Ada'])->id,
            'player_two_id' => Player::create(['name' => 'Bo'])->id,
            'lobby_id' => $lobby->id,
            'status' => PingPongChallenge::STATUS_PENDING,
            'scheduled_for' => Carbon::now(),
            'expires_at' => Carbon::now()->addMinutes(50),
        ]);
    }

    public function test_a_player_can_accept_with_a_valid_token(): void
    {
        $challenge = $this->challenge();

        $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/respond", [
            'player_id' => $challenge->player_one_id,
            'response' => 'accepted',
            'token' => $challenge->responseTokenFor($challenge->player_one_id),
        ])->assertOk()->assertJsonPath('recorded', true);

        $this->assertEquals('accepted', $challenge->fresh()->player_one_response);
    }

    public function test_it_takes_both_acceptances_to_mark_the_challenge_accepted(): void
    {
        $challenge = $this->challenge();

        foreach ($challenge->playerIds() as $playerId) {
            $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/respond", [
                'player_id' => $playerId,
                'response' => 'accepted',
                'token' => $challenge->responseTokenFor($playerId),
            ])->assertOk();
        }

        $this->assertEquals(PingPongChallenge::STATUS_ACCEPTED, $challenge->fresh()->status);
    }

    public function test_one_decline_kills_the_challenge(): void
    {
        $challenge = $this->challenge();

        $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/respond", [
            'player_id' => $challenge->player_two_id,
            'response' => 'declined',
            'token' => $challenge->responseTokenFor($challenge->player_two_id),
        ])->assertOk();

        $this->assertEquals(PingPongChallenge::STATUS_DECLINED, $challenge->fresh()->status);
    }

    public function test_it_rejects_a_forged_token(): void
    {
        $challenge = $this->challenge();

        $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/respond", [
            'player_id' => $challenge->player_one_id,
            'response' => 'declined',
            'token' => 'not-the-token',
        ])->assertForbidden();

        $this->assertEquals(PingPongChallenge::STATUS_PENDING, $challenge->fresh()->status);
    }

    public function test_it_rejects_a_player_who_is_not_in_the_challenge(): void
    {
        $challenge = $this->challenge();
        $outsider = Player::create(['name' => 'Cy']);

        $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/respond", [
            'player_id' => $outsider->id,
            'response' => 'accepted',
            'token' => $challenge->responseTokenFor($outsider->id),
        ])->assertForbidden();
    }

    public function test_responding_late_marks_the_challenge_expired_rather_than_erroring(): void
    {
        $challenge = $this->challenge();
        $challenge->forceFill(['expires_at' => Carbon::now()->subMinute()])->save();

        $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/respond", [
            'player_id' => $challenge->player_one_id,
            'response' => 'accepted',
            'token' => $challenge->responseTokenFor($challenge->player_one_id),
        ])->assertOk()->assertJsonPath('recorded', false);

        $this->assertEquals(PingPongChallenge::STATUS_EXPIRED, $challenge->fresh()->status);
    }

    public function test_the_respond_route_is_exempt_from_csrf_verification(): void
    {
        // Laravel skips CSRF verification inside tests, so posting a form
        // would prove nothing -- assert the route definition itself. The
        // service worker answers notifications with no access to the token.
        $route = collect(Route::getRoutes()->getRoutes())->first(
            fn ($candidate) => $candidate->uri() === 'games/ping-pong/api/challenges/{id}/respond'
        );

        $this->assertNotNull($route);
        $this->assertContains(
            VerifyCsrfToken::class,
            $route->excludedMiddleware() ?? []
        );
    }
}
