<?php

namespace App\Jobs;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Models\Player;
use App\Services\Push\WebPushSender;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Pushes "you've been drawn" to both players of a challenge.
 *
 * Each player gets their own payload naming their opponent, so the two
 * notifications are not interchangeable and are sent as two separate batches.
 */
class SendChallengeNotificationJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 60;

    public int $tries = 2;

    public function __construct(private readonly int $challengeId) {}

    public function handle(WebPushSender $sender): void
    {
        // Belt and braces. With challenges off nothing should be dispatching
        // this, but a job queued moments before the switch flipped must not
        // still go out.
        if (! config('pingpong.challenges_enabled')) {
            Log::info('SendChallengeNotificationJob: challenges are disabled; notifying nobody.', [
                'challenge_id' => $this->challengeId,
            ]);

            return;
        }

        $challenge = PingPongChallenge::with([
            'playerOne.pushSubscriptions',
            'playerTwo.pushSubscriptions',
            'lobby',
            'office',
        ])->find($this->challengeId);

        if (! $challenge) {
            Log::warning('SendChallengeNotificationJob: challenge not found', [
                'challenge_id' => $this->challengeId,
            ]);

            return;
        }

        // The window may have closed while the job sat in the queue; a
        // notification for a dead challenge is worse than none.
        if ($challenge->status !== PingPongChallenge::STATUS_PENDING || $challenge->isExpired()) {
            Log::info('SendChallengeNotificationJob: challenge no longer pending', [
                'challenge_id' => $challenge->id,
                'status' => $challenge->status,
            ]);

            return;
        }

        $delivered = 0;

        foreach ([[$challenge->playerOne, $challenge->playerTwo], [$challenge->playerTwo, $challenge->playerOne]] as [$player, $opponent]) {
            if (! $player instanceof Player || ! $opponent instanceof Player) {
                continue;
            }

            $delivered += $sender->send(
                $player->pushSubscriptions,
                $this->payload($challenge, $player, $opponent),
                ['TTL' => $this->remainingSeconds($challenge)]
            );
        }

        $announced = $this->announceToOffice($challenge, $sender);

        $challenge->forceFill(['notified_at' => Carbon::now()])->save();

        Log::info('Ping pong challenge notified.', [
            'challenge_id' => $challenge->id,
            'endpoints_delivered' => $delivered,
            'audience_endpoints_delivered' => $announced,
        ]);
    }

    /**
     * Tells the rest of the office who is up.
     *
     * Everyone present with push enabled gets a read-only announcement — no
     * action buttons, since they have nothing to accept — so the match has an
     * audience and the two players have a reason to actually show up.
     */
    private function announceToOffice(PingPongChallenge $challenge, WebPushSender $sender): int
    {
        $audience = $challenge->audience();

        if ($audience->isEmpty()) {
            return 0;
        }

        $one = $challenge->playerOne?->name ?? 'Someone';
        $two = $challenge->playerTwo?->name ?? 'someone';

        return $sender->send(
            $audience->flatMap(fn (Player $player) => $player->pushSubscriptions),
            [
                'title' => '🏓 '.$one.' vs '.$two,
                'body' => 'Drawn for this hour’s match at '.($challenge->office?->name ?? 'the office').'. Go watch.',
                'tag' => 'pingpong-challenge-'.$challenge->id.'-audience',
                // The watch screen, not the lobby: a 1v1 lobby is already full
                // with the two players, so a spectator tapping through to it
                // would only meet a "lobby is full" error.
                'url' => url('/games/ping-pong/watch'),
            ]
        );
    }

    /**
     * How long a push service may keep trying, in seconds.
     *
     * Tied to the challenge window rather than a fixed TTL: if a phone is off
     * for an hour, waking it to "table's free for the next 45 minutes" long
     * after the challenge died is worse than never telling it at all. The push
     * service drops the message instead.
     */
    private function remainingSeconds(PingPongChallenge $challenge): int
    {
        return max(0, (int) Carbon::now()->diffInSeconds($challenge->expires_at, false));
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PingPongChallenge $challenge, Player $player, Player $opponent): array
    {
        $code = $challenge->lobby?->code;

        return [
            'title' => '🏓 You’re up against '.$opponent->name,
            'body' => 'Table’s free for the next '
                // Carbon 3 returns a signed float, so read the gap forwards from
                // now and round it: a raw 49.6 would render as "49.6 minutes".
                .max(1, (int) round(Carbon::now()->diffInMinutes($challenge->expires_at)))
                .' minutes. Tap to open the lobby.',
            'tag' => 'pingpong-challenge-'.$challenge->id,
            'challengeId' => $challenge->id,
            'playerId' => $player->id,
            'responseToken' => $challenge->responseTokenFor($player->id),
            'respondUrl' => url('/games/ping-pong/api/challenges/'.$challenge->id.'/respond'),
            'url' => $code ? url('/games/ping-pong/lobby/'.$code) : url('/games/ping-pong'),
            'actions' => [
                ['action' => 'accept', 'title' => 'Let’s play'],
                ['action' => 'decline', 'title' => 'Not now'],
            ],
        ];
    }
}
