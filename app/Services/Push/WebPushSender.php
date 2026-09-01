<?php

namespace App\Services\Push;

use App\Models\PushSubscription;
use ErrorException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Sends Web Push notifications and keeps the subscription table honest.
 *
 * Browsers hand out endpoints that die silently — the PWA is uninstalled, the
 * profile is wiped, the push service rotates. The only signal is a 404/410 on
 * delivery, so every send prunes the rows that report one.
 */
class WebPushSender
{
    public function isConfigured(): bool
    {
        return filled(config('pingpong.webpush.public_key'))
            && filled(config('pingpong.webpush.private_key'));
    }

    public function publicKey(): ?string
    {
        return config('pingpong.webpush.public_key');
    }

    /**
     * Delivers one payload to every subscription given.
     *
     * @param  Collection<int, PushSubscription>  $subscriptions
     * @param  array<string, mixed>  $payload
     * @return int Number of endpoints that accepted the notification.
     */
    public function send(Collection $subscriptions, array $payload): int
    {
        if ($subscriptions->isEmpty()) {
            return 0;
        }

        if (! $this->isConfigured()) {
            Log::warning('Web push is not configured; no VAPID keys set.');

            return 0;
        }

        try {
            $webPush = $this->client();
        } catch (ErrorException $exception) {
            Log::error('Web push client could not be built.', ['error' => $exception->getMessage()]);

            return 0;
        }

        $encoded = json_encode($payload, JSON_THROW_ON_ERROR);

        /** @var array<string, PushSubscription> $byEndpoint */
        $byEndpoint = [];

        foreach ($subscriptions as $subscription) {
            try {
                $webPush->queueNotification($this->toSubscription($subscription), $encoded);
                $byEndpoint[$subscription->endpoint] = $subscription;
            } catch (ErrorException $exception) {
                // A malformed row can never succeed, so drop it rather than
                // retrying it every hour forever.
                Log::warning('Discarding an unusable push subscription.', [
                    'subscription_id' => $subscription->id,
                    'error' => $exception->getMessage(),
                ]);
                $subscription->delete();
            }
        }

        $delivered = 0;

        foreach ($webPush->flush() as $report) {
            $subscription = $byEndpoint[$report->getEndpoint()] ?? null;

            if ($report->isSuccess()) {
                $delivered++;
                $subscription?->forceFill(['last_notified_at' => Carbon::now()])->save();

                continue;
            }

            if ($report->isSubscriptionExpired()) {
                $subscription?->delete();

                continue;
            }

            Log::warning('Web push delivery failed.', [
                'endpoint' => $report->getEndpoint(),
                'reason' => $report->getReason(),
            ]);
        }

        return $delivered;
    }

    /**
     * @throws ErrorException
     */
    private function client(): WebPush
    {
        return new WebPush(
            [
                'VAPID' => [
                    'subject' => (string) config('pingpong.webpush.subject'),
                    'publicKey' => (string) config('pingpong.webpush.public_key'),
                    'privateKey' => (string) config('pingpong.webpush.private_key'),
                ],
            ],
            ['TTL' => (int) config('pingpong.webpush.ttl')],
        );
    }

    /**
     * @throws ErrorException
     */
    private function toSubscription(PushSubscription $subscription): Subscription
    {
        return Subscription::create([
            'endpoint' => $subscription->endpoint,
            'publicKey' => $subscription->public_key,
            'authToken' => $subscription->auth_token,
            'contentEncoding' => $subscription->content_encoding,
        ]);
    }
}
