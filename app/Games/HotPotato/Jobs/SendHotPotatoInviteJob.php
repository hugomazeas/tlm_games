<?php

namespace App\Games\HotPotato\Jobs;

use App\Models\Player;
use App\Models\PushSubscription;
use App\Services\Push\WebPushSender;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * "Samuel opened a hot potato — join!" to the host's office.
 *
 * Only browsers that opted in from the hot potato page, whose player belongs
 * to that office, and never the host themselves.
 */
class SendHotPotatoInviteJob implements ShouldQueue
{
    use Queueable;

    /** An invite to a lobby that has long since started is just noise. */
    private const TTL_SECONDS = 300;

    public int $timeout = 60;

    public int $tries = 2;

    public function __construct(
        public readonly int $officeId,
        public readonly int $hostPlayerId,
    ) {}

    public function handle(WebPushSender $sender): void
    {
        $host = Player::find($this->hostPlayerId);

        $subscriptions = PushSubscription::where('notify_hot_potato', true)
            ->where('player_id', '!=', $this->hostPlayerId)
            ->whereHas('player', fn ($query) => $query->where('office_id', $this->officeId))
            ->get();

        $delivered = $sender->send($subscriptions, [
            'title' => '🥔 '.($host?->name ?? 'Someone').' opened a hot potato',
            'body' => 'Join now — tap to play.',
            'tag' => 'hot-potato-office-'.$this->officeId,
            'url' => url('/games/hot-potato'),
        ], ['TTL' => self::TTL_SECONDS]);

        Log::info('Hot potato invite sent.', [
            'office_id' => $this->officeId,
            'endpoints_delivered' => $delivered,
        ]);
    }
}
