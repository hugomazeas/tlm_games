<?php

namespace Tests\Feature;

use App\Models\Player;
use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

    private function subscribePayload(int $playerId, string $endpoint = self::ENDPOINT): array
    {
        return [
            'player_id' => $playerId,
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'p256dh-key', 'auth' => 'auth-token'],
        ];
    }

    public function test_a_player_can_register_a_browser(): void
    {
        $player = Player::create(['name' => 'Ada']);

        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))
            ->assertCreated()
            ->assertJsonPath('player_id', $player->id);

        $this->assertDatabaseHas('push_subscriptions', [
            'player_id' => $player->id,
            'endpoint_hash' => PushSubscription::hashEndpoint(self::ENDPOINT),
        ]);
    }

    public function test_registering_the_same_browser_twice_does_not_duplicate_it(): void
    {
        $player = Player::create(['name' => 'Ada']);

        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))->assertCreated();
        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))->assertCreated();

        $this->assertDatabaseCount('push_subscriptions', 1);
    }

    public function test_a_shared_browser_moves_to_whoever_registered_last(): void
    {
        $ada = Player::create(['name' => 'Ada']);
        $bo = Player::create(['name' => 'Bo']);

        $this->postJson('/push/subscribe', $this->subscribePayload($ada->id))->assertCreated();
        $this->postJson('/push/subscribe', $this->subscribePayload($bo->id))->assertCreated();

        $this->assertDatabaseCount('push_subscriptions', 1);
        $this->assertDatabaseHas('push_subscriptions', ['player_id' => $bo->id]);
    }

    public function test_one_player_can_register_several_devices(): void
    {
        $player = Player::create(['name' => 'Ada']);

        $this->postJson('/push/subscribe', $this->subscribePayload($player->id, 'https://push.test/phone'))->assertCreated();
        $this->postJson('/push/subscribe', $this->subscribePayload($player->id, 'https://push.test/laptop'))->assertCreated();

        $this->assertEquals(2, $player->pushSubscriptions()->count());
    }

    public function test_it_rejects_an_unknown_player(): void
    {
        $this->postJson('/push/subscribe', $this->subscribePayload(9999))
            ->assertStatus(422)
            ->assertJsonValidationErrors('player_id');
    }

    public function test_it_rejects_a_payload_missing_its_keys(): void
    {
        $player = Player::create(['name' => 'Ada']);

        $this->postJson('/push/subscribe', [
            'player_id' => $player->id,
            'endpoint' => self::ENDPOINT,
        ])->assertStatus(422)->assertJsonValidationErrors(['keys.p256dh', 'keys.auth']);
    }

    public function test_a_browser_can_unregister(): void
    {
        $player = Player::create(['name' => 'Ada']);
        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))->assertCreated();

        $this->postJson('/push/unsubscribe', ['endpoint' => self::ENDPOINT])
            ->assertOk()
            ->assertJsonPath('deleted', 1);

        $this->assertDatabaseCount('push_subscriptions', 0);
    }

    public function test_deleting_a_player_takes_their_subscriptions_with_them(): void
    {
        $player = Player::create(['name' => 'Ada']);
        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))->assertCreated();

        $player->delete();

        $this->assertDatabaseCount('push_subscriptions', 0);
    }

    public function test_the_config_endpoint_reports_whether_push_is_set_up(): void
    {
        config(['pingpong.webpush.public_key' => null, 'pingpong.webpush.private_key' => null]);

        $this->getJson('/push/config')
            ->assertOk()
            ->assertJsonPath('configured', false);

        config(['pingpong.webpush.public_key' => 'pub', 'pingpong.webpush.private_key' => 'priv']);

        $this->getJson('/push/config')
            ->assertOk()
            ->assertJsonPath('configured', true)
            ->assertJsonPath('public_key', 'pub');
    }

    private function matchStartPayload(string $endpoint = self::ENDPOINT): array
    {
        return [
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'p256dh-key', 'auth' => 'auth-token'],
        ];
    }

    public function test_an_anonymous_viewer_can_opt_into_match_start_alerts(): void
    {
        $this->postJson('/push/match-starts/subscribe', $this->matchStartPayload())
            ->assertCreated()
            ->assertJsonPath('notify_match_starts', true);

        $this->assertDatabaseHas('push_subscriptions', [
            'player_id' => null,
            'endpoint_hash' => PushSubscription::hashEndpoint(self::ENDPOINT),
            'notify_match_starts' => true,
        ]);
    }

    public function test_opting_a_player_browser_into_match_alerts_keeps_its_player(): void
    {
        $player = Player::create(['name' => 'Ada']);
        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))->assertCreated();

        $this->postJson('/push/match-starts/subscribe', $this->matchStartPayload())->assertCreated();

        $this->assertDatabaseCount('push_subscriptions', 1);
        $this->assertDatabaseHas('push_subscriptions', [
            'player_id' => $player->id,
            'notify_match_starts' => true,
        ]);
    }

    public function test_registering_for_challenges_does_not_clear_match_alerts(): void
    {
        $player = Player::create(['name' => 'Ada']);
        $this->postJson('/push/match-starts/subscribe', $this->matchStartPayload())->assertCreated();

        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))->assertCreated();

        $this->assertDatabaseHas('push_subscriptions', [
            'player_id' => $player->id,
            'notify_match_starts' => true,
        ]);
    }

    public function test_match_alert_opt_in_rejects_a_payload_missing_its_keys(): void
    {
        $this->postJson('/push/match-starts/subscribe', ['endpoint' => self::ENDPOINT])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['keys.p256dh', 'keys.auth']);
    }

    public function test_an_anonymous_viewer_opting_out_drops_the_browser(): void
    {
        $this->postJson('/push/match-starts/subscribe', $this->matchStartPayload())->assertCreated();

        $this->postJson('/push/match-starts/unsubscribe', ['endpoint' => self::ENDPOINT])
            ->assertOk()
            ->assertJsonPath('deleted', true);

        $this->assertDatabaseCount('push_subscriptions', 0);
    }

    public function test_a_player_opting_out_of_match_alerts_keeps_their_challenge_pushes(): void
    {
        $player = Player::create(['name' => 'Ada']);
        $this->postJson('/push/subscribe', $this->subscribePayload($player->id))->assertCreated();
        $this->postJson('/push/match-starts/subscribe', $this->matchStartPayload())->assertCreated();

        $this->postJson('/push/match-starts/unsubscribe', ['endpoint' => self::ENDPOINT])
            ->assertOk()
            ->assertJsonPath('deleted', false);

        $this->assertDatabaseHas('push_subscriptions', [
            'player_id' => $player->id,
            'notify_match_starts' => false,
        ]);
    }

    public function test_the_notifications_page_renders(): void
    {
        Player::create(['name' => 'Ada']);

        $this->get('/notifications')
            ->assertOk()
            ->assertSee('Match notifications')
            ->assertSee('Ada');
    }
}
