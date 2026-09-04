<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongLobbyParticipant;
use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Office;
use App\Models\Player;
use App\Services\Buro\BuroClient;
use App\Services\Buro\BuroPresence;
use App\Services\Buro\BuroPresentUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Draws two colleagues who are actually in the office and pairs them up.
 *
 * Eligibility is deliberately conservative — three independent opt-outs have
 * to all say yes before someone is volunteered:
 *
 *  1. their office has matchmaking enabled and is mapped to a Buro office;
 *  2. they booked a seat in that office today (Buro `active` bookings only);
 *  3. they carry the opt-in flag on their Buro profile.
 *
 * A push registration is deliberately not among them. It is how someone is
 * told they were drawn, not permission to draw them, and gating on it quietly
 * shrank the hat to whoever had installed the PWA — enough, in a four-person
 * office, to lose a whole hour's draw.
 *
 * On top of that, whoever was drawn last time is stepped around so nobody is
 * volunteered twice on the trot, anyone mid-match is left alone, and an
 * optional cooldown and per-day cap can thin the field further.
 */
class MatchmakingService
{
    public function __construct(private readonly BuroClient $buro) {}

    /**
     * Runs one hourly draw for a single office.
     *
     * Creates the challenge and the lobby but sends nothing — notification is
     * the caller's job, so this stays testable without a push service.
     */
    public function drawForOffice(Office $office, bool $dryRun = false, array $excludePlayerIds = []): MatchmakingResult
    {
        if (! $office->participatesInMatchmaking()) {
            return MatchmakingResult::skipped(MatchmakingResult::OFFICE_DISABLED);
        }

        $presence = $this->buro->presence($office->buro_office_id);

        if ($presence === null) {
            return MatchmakingResult::skipped(MatchmakingResult::BURO_UNAVAILABLE);
        }

        if (! $presence->isWeekday()) {
            return MatchmakingResult::skipped(MatchmakingResult::WEEKEND);
        }

        if (! $presence->isWithinHours($office->matchmaking_start, $office->matchmaking_end)) {
            return MatchmakingResult::skipped(MatchmakingResult::OUTSIDE_HOURS);
        }

        $optedIn = $presence->usersWithFlag((string) config('pingpong.matchmaking.opt_in_flag'));

        if ($optedIn->isEmpty()) {
            return MatchmakingResult::skipped(MatchmakingResult::NO_OPT_INS);
        }

        $eligible = $this->eligiblePlayers($optedIn, $presence);

        // Who to step around: the pair a re-roll just rejected, or otherwise
        // whoever was drawn last time. Either way it is a preference, not a
        // rule -- in a three-person office, insisting on it would mean never
        // drawing anyone again.
        $avoid = $excludePlayerIds !== []
            ? $excludePlayerIds
            : $this->previouslyDrawnPlayerIds($office);

        if ($avoid !== []) {
            $narrowed = $eligible->reject(
                fn (Player $player) => in_array($player->id, $avoid, true)
            )->values();

            if ($narrowed->count() >= 2) {
                $eligible = $narrowed;
            }
        }

        if ($eligible->count() < 2) {
            return MatchmakingResult::skipped(
                MatchmakingResult::NOT_ENOUGH_PLAYERS,
                $eligible->count()
            );
        }

        $pair = $eligible->shuffle()->take(2)->values();

        if ($dryRun) {
            return MatchmakingResult::skipped(MatchmakingResult::DRY_RUN, $eligible->count());
        }

        $challenge = $this->createChallenge(
            $office,
            $pair->get(0),
            $pair->get(1),
            $presence,
            $this->audiencePlayerIds($presence)
        );

        return MatchmakingResult::created($challenge, $eligible->count());
    }

    /**
     * Replaces a challenge nobody can honour with a fresh pick.
     *
     * The hourly draw trusts Buro, and Buro only knows who booked a desk this
     * morning — not who slipped out at three. When it names someone who has
     * already gone, anyone can re-roll rather than waiting an hour for a draw
     * that will make the same mistake.
     *
     * Naming the absent player is the important half: it marks them away so
     * the next few draws skip them too. Without it this is just a re-shuffle.
     */
    public function redraw(PingPongChallenge $challenge, ?int $absentPlayerId = null): MatchmakingResult
    {
        if ($challenge->status !== PingPongChallenge::STATUS_PENDING) {
            return MatchmakingResult::skipped(MatchmakingResult::NOT_REDRAWABLE);
        }

        if ($absentPlayerId !== null && in_array($absentPlayerId, $challenge->playerIds(), true)) {
            Player::find($absentPlayerId)?->markAway();
        }

        // Retire the old one first, so its players stop counting as recently
        // challenged and the fresh draw sees an honest field.
        $challenge->forceFill(['status' => PingPongChallenge::STATUS_SUPERSEDED])->save();

        return $this->drawForOffice($challenge->office, false, $challenge->playerIds());
    }

    /**
     * The two people this office drew last time.
     *
     * Nobody wants to be volunteered twice on the trot, and with the cooldown
     * and the daily cap both switched off nothing else prevents it. One draw's
     * grace is enough: they are back in the hat the round after.
     *
     * Superseded rows are skipped — a re-rolled draw never happened, so the
     * pair to step around is the last one that actually stood.
     *
     * @return array<int, int>
     */
    private function previouslyDrawnPlayerIds(Office $office): array
    {
        $previous = PingPongChallenge::query()
            ->where('office_id', $office->id)
            ->where('status', '!=', PingPongChallenge::STATUS_SUPERSEDED)
            ->orderByDesc('scheduled_for')
            ->orderByDesc('id')
            ->first(['player_one_id', 'player_two_id']);

        return $previous?->playerIds() ?? [];
    }

    /**
     * Everyone in the office today who can be told a match is on.
     *
     * Cuts across the draw pool rather than sitting inside it. The opt-in flag
     * is ignored, because turning on notifications without wanting to be
     * volunteered is a reasonable position and the whole point of the
     * announcement is that the office knows who is playing. A push
     * registration is still required, though — unlike the draw, this list
     * exists purely to be delivered to.
     *
     * @return array<int, int>
     */
    public function audiencePlayerIds(BuroPresence $presence): array
    {
        return $this->resolvePlayers($presence->users)
            ->filter(fn (Player $player) => $player->hasPushSubscription())
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * Players who could be drawn right now.
     *
     * Note what is absent: nothing here asks whether the player can be
     * notified. Being in the office with the flag is the whole ask.
     *
     * @param  Collection<int, BuroPresentUser>  $optedIn
     * @return Collection<int, Player>
     */
    public function eligiblePlayers(Collection $optedIn, BuroPresence $presence): Collection
    {
        $players = $this->resolvePlayers($optedIn);

        if ($players->isEmpty()) {
            return $players;
        }

        $busy = $this->playersInLiveMatches($players->pluck('id')->all());
        $onCooldown = $this->playersOnCooldown($players->pluck('id')->all(), $presence);

        return $players
            ->reject(fn (Player $player) => $player->isUnavailable())
            ->reject(fn (Player $player) => in_array($player->id, $busy, true))
            ->reject(fn (Player $player) => in_array($player->id, $onCooldown, true))
            ->values();
    }

    /**
     * Maps Buro users onto local Player rows.
     *
     * `buro_user_id` wins when present; otherwise a case-insensitive email
     * match creates the link and caches the id so a later email change cannot
     * silently orphan the player. Buro users with no matching Player are
     * skipped — this never invents players.
     *
     * @param  Collection<int, BuroPresentUser>  $users
     * @return Collection<int, Player>
     */
    public function resolvePlayers(Collection $users): Collection
    {
        $buroIds = $users->pluck('id')->filter()->all();
        $emails = $users->pluck('email')->filter()->all();

        if ($buroIds === [] && $emails === []) {
            return collect();
        }

        $candidates = Player::query()
            ->where(function ($query) use ($buroIds, $emails) {
                if ($buroIds !== []) {
                    $query->whereIn('buro_user_id', $buroIds);
                }

                if ($emails !== []) {
                    $query->orWhereIn('email', $emails);
                }
            })
            ->get();

        $byBuroId = $candidates->keyBy('buro_user_id');
        $byEmail = $candidates->filter(fn (Player $player) => filled($player->email))
            ->keyBy(fn (Player $player) => strtolower($player->email));

        return $users
            ->map(function (BuroPresentUser $user) use ($byBuroId, $byEmail) {
                $player = $byBuroId->get($user->id) ?? $byEmail->get($user->email);

                if ($player === null) {
                    return null;
                }

                if ($player->buro_user_id !== $user->id) {
                    $player->forceFill(['buro_user_id' => $user->id])->save();
                }

                return $player;
            })
            ->filter()
            ->unique('id')
            ->values();
    }

    /**
     * Anyone already at the table.
     *
     * Mirrors the live-match definition used by the watch screen: started, not
     * ended, and scoring within the last hour — a match nobody ever finished
     * must not block its players forever.
     *
     * @param  array<int, int>  $playerIds
     * @return array<int, int>
     */
    private function playersInLiveMatches(array $playerIds): array
    {
        if ($playerIds === []) {
            return [];
        }

        $columns = ['player_left_id', 'team_left_player2_id', 'player_right_id', 'team_right_player2_id'];

        $matches = PingPongMatch::query()
            ->whereNotNull('started_at')
            ->whereNull('ended_at')
            ->where('started_at', '>=', Carbon::now()->subHour())
            ->where(function ($query) use ($columns, $playerIds) {
                foreach ($columns as $column) {
                    $query->orWhereIn($column, $playerIds);
                }
            })
            ->get($columns);

        return $matches
            ->flatMap(fn (PingPongMatch $match) => array_map(fn ($column) => $match->{$column}, $columns))
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Players who were drawn too recently, or already had their turn today.
     *
     * Declines count too — someone who said no should not be asked again an
     * hour later. The daily cap is measured against the office-local day, not
     * the server's, so an evening in Quebec doesn't roll over early.
     *
     * @param  array<int, int>  $playerIds
     * @return array<int, int>
     */
    private function playersOnCooldown(array $playerIds, BuroPresence $presence): array
    {
        if ($playerIds === []) {
            return [];
        }

        $cooldownHours = (int) config('pingpong.matchmaking.player_cooldown_hours');
        $maxPerDay = (int) config('pingpong.matchmaking.max_challenges_per_day');

        $localNow = $presence->localNow();
        $since = Carbon::now()->subHours(max($cooldownHours, 0));
        $dayStart = $localNow->copy()->startOfDay()->utc();

        // Superseded rows are the one status that must not count. A re-roll
        // retires the old challenge precisely because it never happened, so
        // letting it keep its players on cooldown would bench the person who
        // pressed the button for the rest of the day.
        $recent = PingPongChallenge::query()
            ->where('status', '!=', PingPongChallenge::STATUS_SUPERSEDED)
            ->where(function ($query) use ($since, $dayStart) {
                $query->where('scheduled_for', '>=', $since)
                    ->orWhere('scheduled_for', '>=', $dayStart);
            })
            ->get(['player_one_id', 'player_two_id', 'scheduled_for']);

        if ($recent->isEmpty()) {
            return [];
        }

        $blocked = [];
        $todayCounts = [];

        foreach ($recent as $challenge) {
            foreach ($challenge->playerIds() as $playerId) {
                if (! in_array($playerId, $playerIds, true)) {
                    continue;
                }

                if ($cooldownHours > 0 && $challenge->scheduled_for >= $since) {
                    $blocked[$playerId] = true;
                }

                if ($challenge->scheduled_for >= $dayStart) {
                    $todayCounts[$playerId] = ($todayCounts[$playerId] ?? 0) + 1;
                }
            }
        }

        foreach ($todayCounts as $playerId => $count) {
            if ($maxPerDay > 0 && $count >= $maxPerDay) {
                $blocked[$playerId] = true;
            }
        }

        return array_map('intval', array_keys($blocked));
    }

    /**
     * Persists the challenge plus a ready-to-play lobby.
     *
     * Both players are seated on opposite sides up front so the notification
     * can deep-link straight into the existing lobby screen — they only have
     * to press start. Wrapped in a transaction so a challenge never points at
     * a half-built lobby.
     */
    private function createChallenge(
        Office $office,
        Player $one,
        Player $two,
        BuroPresence $presence,
        array $audiencePlayerIds
    ): PingPongChallenge {
        $ttl = (int) config('pingpong.matchmaking.challenge_ttl_minutes');

        return DB::transaction(function () use ($office, $one, $two, $presence, $ttl, $audiencePlayerIds) {
            $lobby = PingPongLobby::create([
                'code' => PingPongLobby::generateCode(),
                'mode' => '1v1',
                'host_token' => Str::random(64),
                'status' => 'waiting',
                'expires_at' => Carbon::now()->addMinutes($ttl),
            ]);

            foreach ([[$one, 'left'], [$two, 'right']] as [$player, $side]) {
                PingPongLobbyParticipant::create([
                    'lobby_id' => $lobby->id,
                    'player_id' => $player->id,
                    'side' => $side,
                    'session_token' => Str::random(64),
                ]);
            }

            return PingPongChallenge::create([
                'office_id' => $office->id,
                'player_one_id' => $one->id,
                'player_two_id' => $two->id,
                'lobby_id' => $lobby->id,
                'status' => PingPongChallenge::STATUS_PENDING,
                'audience_player_ids' => array_values(
                    array_diff($audiencePlayerIds, [$one->id, $two->id])
                ),
                'scheduled_for' => $presence->localNow()->utc(),
                'expires_at' => Carbon::now()->addMinutes($ttl),
            ]);
        });
    }
}
