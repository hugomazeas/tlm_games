<?php

namespace App\Jobs;

use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Player;
use App\Models\PushSubscription;
use App\Services\Push\WebPushSender;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Tells livestream viewers a match just started, so they don't have to keep
 * the watch page open to catch it.
 *
 * Goes to every browser that opted in from the watch page, player or not. It
 * is independent of `pingpong.challenges_enabled`: this is about watching,
 * not about being drawn to play.
 */
class SendMatchStartedNotificationJob implements ShouldQueue
{
    use Queueable;

    /**
     * How long a push service may keep trying, in seconds. A phone that was
     * off for longer than this would only learn about a match that's over.
     */
    private const TTL_SECONDS = 600;

    public int $timeout = 60;

    public int $tries = 2;

    public function __construct(public readonly int $matchId) {}

    public function handle(WebPushSender $sender): void
    {
        $match = PingPongMatch::with(['playerLeft', 'playerRight', 'teamLeftPlayer2', 'teamRightPlayer2'])
            ->find($this->matchId);

        if (! $match) {
            Log::warning('SendMatchStartedNotificationJob: match not found', ['match_id' => $this->matchId]);

            return;
        }

        $subscriptions = PushSubscription::where('notify_match_starts', true)->get();

        $delivered = $sender->send($subscriptions, [
            'title' => '🏓 '.$this->sideName($match->playerLeft, $match->teamLeftPlayer2)
                .' vs '.$this->sideName($match->playerRight, $match->teamRightPlayer2),
            'body' => 'A match just started — tap to watch live.',
            'tag' => 'pingpong-match-'.$match->id,
            'url' => url('/games/ping-pong/watch'),
        ], ['TTL' => self::TTL_SECONDS]);

        Log::info('Ping pong match start notified.', [
            'match_id' => $match->id,
            'endpoints_delivered' => $delivered,
        ]);
    }

    private function sideName(?Player $player, ?Player $partner): string
    {
        $name = $player?->name ?? 'Someone';

        return $partner ? $name.' & '.$partner->name : $name;
    }
}
