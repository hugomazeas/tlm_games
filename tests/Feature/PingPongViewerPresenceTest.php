<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PingPongViewerPresenceTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/games/ping-pong/api/viewers/auth';

    private const SOCKET_ID = '1234.5678';

    private function liveMatch(): PingPongMatch
    {
        $left = Player::create(['name' => fake()->unique()->name()]);
        $right = Player::create(['name' => fake()->unique()->name()]);

        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
            'started_at' => now(),
        ]);
    }

    private function channelFor(PingPongMatch $match): string
    {
        return 'presence-ping-pong.match.'.$match->id.'.viewers';
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(PingPongMatch $match, array $overrides = []): array
    {
        return array_merge([
            'socket_id' => self::SOCKET_ID,
            'channel_name' => $this->channelFor($match),
            'role' => 'viewer',
            'viewer_id' => 'abc123',
        ], $overrides);
    }

    /**
     * @return array{user_id: string, user_info: array{id: string, role: string, player_id: int|null, name: string|null}}
     */
    private function assertSignedFor(PingPongMatch $match, array $response): array
    {
        $key = config('broadcasting.connections.reverb.key');
        $secret = config('broadcasting.connections.reverb.secret');
        $expected = $key.':'.hash_hmac(
            'sha256',
            self::SOCKET_ID.':'.$this->channelFor($match).':'.$response['channel_data'],
            $secret,
        );

        $this->assertSame($expected, $response['auth']);

        return json_decode($response['channel_data'], true);
    }

    public function test_a_named_viewer_is_signed_in_as_their_player(): void
    {
        $match = $this->liveMatch();
        $ann = Player::create(['name' => 'Ann']);

        $response = $this->postJson(self::URL, $this->payload($match, ['player_id' => $ann->id]));

        $response->assertOk();
        $member = $this->assertSignedFor($match, $response->json());
        $this->assertSame('player-'.$ann->id, $member['user_id']);
        $this->assertSame([
            'id' => 'player-'.$ann->id,
            'role' => 'viewer',
            'player_id' => $ann->id,
            'name' => 'Ann',
        ], $member['user_info']);
    }

    public function test_the_same_player_on_two_browsers_is_one_member(): void
    {
        $match = $this->liveMatch();
        $ann = Player::create(['name' => 'Ann']);

        $first = $this->postJson(self::URL, $this->payload($match, ['player_id' => $ann->id, 'viewer_id' => 'tab-one']));
        $second = $this->postJson(self::URL, $this->payload($match, ['player_id' => $ann->id, 'viewer_id' => 'tab-two']));

        $this->assertSame(
            json_decode($first->json('channel_data'), true)['user_id'],
            json_decode($second->json('channel_data'), true)['user_id'],
        );
    }

    public function test_a_viewer_without_a_name_is_a_guest(): void
    {
        $match = $this->liveMatch();

        $response = $this->postJson(self::URL, $this->payload($match));

        $response->assertOk();
        $member = $this->assertSignedFor($match, $response->json());
        $this->assertSame('guest-abc123', $member['user_id']);
        $this->assertNull($member['user_info']['name']);
        $this->assertNull($member['user_info']['player_id']);
    }

    public function test_the_playing_screen_joins_as_a_screen_and_carries_no_name(): void
    {
        $match = $this->liveMatch();
        $ann = Player::create(['name' => 'Ann']);

        $response = $this->postJson(self::URL, $this->payload($match, ['role' => 'screen', 'player_id' => $ann->id]));

        $response->assertOk();
        $member = $this->assertSignedFor($match, $response->json());
        $this->assertSame('screen-abc123', $member['user_id']);
        $this->assertSame('screen', $member['user_info']['role']);
        $this->assertNull($member['user_info']['name']);
    }

    public function test_an_ended_match_refuses_new_viewers(): void
    {
        $match = $this->liveMatch();
        $match->update(['ended_at' => now()]);

        $this->postJson(self::URL, $this->payload($match))->assertForbidden();
    }

    public function test_an_unknown_match_refuses_viewers(): void
    {
        $this->postJson(self::URL, [
            'socket_id' => self::SOCKET_ID,
            'channel_name' => 'presence-ping-pong.match.999999.viewers',
            'role' => 'viewer',
            'viewer_id' => 'abc123',
        ])->assertForbidden();
    }

    public function test_only_viewer_channels_can_be_signed(): void
    {
        $match = $this->liveMatch();

        $this->postJson(self::URL, $this->payload($match, ['channel_name' => 'presence-something-else']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('channel_name');

        $this->postJson(self::URL, $this->payload($match, ['channel_name' => 'private-ping-pong.match.'.$match->id.'.viewers']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('channel_name');
    }

    public function test_it_validates_the_rest_of_the_request(): void
    {
        $match = $this->liveMatch();

        $this->postJson(self::URL, $this->payload($match, [
            'socket_id' => 'not-a-socket',
            'role' => 'admin',
            'viewer_id' => 'has spaces',
            'player_id' => 999999,
        ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['socket_id', 'role', 'viewer_id', 'player_id']);
    }
}
