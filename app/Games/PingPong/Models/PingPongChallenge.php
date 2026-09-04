<?php

namespace App\Games\PingPong\Models;

use App\Models\Office;
use App\Models\Player;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * An hourly "you two, play a game" draw.
 *
 * The row is created before anyone is notified so the pair is reserved even if
 * push delivery fails; `status` then tracks what the two players did with it.
 */
class PingPongChallenge extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_DECLINED = 'declined';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_PLAYED = 'played';

    /** Replaced by a re-roll, because someone drawn was not actually around. */
    public const STATUS_SUPERSEDED = 'superseded';

    public const RESPONSE_ACCEPTED = 'accepted';

    public const RESPONSE_DECLINED = 'declined';

    protected $table = 'ping_pong_challenges';

    protected $fillable = [
        'office_id',
        'player_one_id',
        'player_two_id',
        'lobby_id',
        'match_id',
        'status',
        'player_one_response',
        'player_two_response',
        'audience_player_ids',
        'scheduled_for',
        'expires_at',
        'notified_at',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_for' => 'datetime',
            'expires_at' => 'datetime',
            'notified_at' => 'datetime',
            'audience_player_ids' => 'array',
        ];
    }

    /**
     * Colleagues to announce the match to — everyone else in the office who
     * had push turned on when the draw ran, minus the two who are playing.
     *
     * @return Collection<int, Player>
     */
    public function audience(): Collection
    {
        $ids = array_diff($this->audience_player_ids ?? [], $this->playerIds());

        if ($ids === []) {
            return collect();
        }

        return Player::with('pushSubscriptions')->whereIn('id', $ids)->get();
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function playerOne(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_one_id');
    }

    public function playerTwo(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_two_id');
    }

    public function lobby(): BelongsTo
    {
        return $this->belongsTo(PingPongLobby::class, 'lobby_id');
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    /**
     * Challenges that still count against a player's cooldown.
     *
     * A declined challenge still counts: someone who said no should not be
     * asked again an hour later.
     */
    public function scopeInvolvingPlayer(Builder $query, int $playerId): Builder
    {
        return $query->where(function (Builder $inner) use ($playerId) {
            $inner->where('player_one_id', $playerId)->orWhere('player_two_id', $playerId);
        });
    }

    /** Still pending, and its window has not closed yet. */
    public function scopeLive(Builder $query): Builder
    {
        return $query->pending()->where('expires_at', '>', Carbon::now());
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    /**
     * The shape every consumer gets: the API, and the broadcast payload.
     *
     * Kept on the model rather than in a controller because the panel on the
     * home screen reads it over HTTP once and then over the websocket, and the
     * two have to agree.
     *
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status,
            'office' => $this->office?->name,
            'lobby_code' => $this->lobby?->code,
            'scheduled_for' => $this->scheduled_for?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'players' => [
                [
                    'id' => $this->player_one_id,
                    'name' => $this->playerOne?->name,
                    'response' => $this->player_one_response,
                ],
                [
                    'id' => $this->player_two_id,
                    'name' => $this->playerTwo?->name,
                    'response' => $this->player_two_response,
                ],
            ],
        ];
    }

    /**
     * @return array<int, int>
     */
    public function playerIds(): array
    {
        return [$this->player_one_id, $this->player_two_id];
    }

    /** Which response column belongs to this player, or null if uninvolved. */
    public function responseColumnFor(int $playerId): ?string
    {
        return match ($playerId) {
            $this->player_one_id => 'player_one_response',
            $this->player_two_id => 'player_two_response',
            default => null,
        };
    }

    /**
     * Records one player's answer and rolls the challenge status forward.
     *
     * One decline kills the challenge outright; it takes both acceptances to
     * mark it accepted.
     */
    public function recordResponse(int $playerId, string $response): bool
    {
        $column = $this->responseColumnFor($playerId);

        if ($column === null || ! in_array($response, [self::RESPONSE_ACCEPTED, self::RESPONSE_DECLINED], true)) {
            return false;
        }

        if ($this->status !== self::STATUS_PENDING) {
            return false;
        }

        $this->{$column} = $response;

        if ($response === self::RESPONSE_DECLINED) {
            $this->status = self::STATUS_DECLINED;
        } elseif ($this->player_one_response === self::RESPONSE_ACCEPTED
            && $this->player_two_response === self::RESPONSE_ACCEPTED) {
            $this->status = self::STATUS_ACCEPTED;
        }

        $this->save();

        return true;
    }

    /**
     * An unguessable token binding one player to this challenge.
     *
     * The service worker answers a notification from a background context
     * where it cannot read the CSRF meta tag, so the respond endpoint is CSRF
     * exempt and gated on this instead. Derived from APP_KEY rather than
     * stored, so it needs no column and dies with the challenge id.
     */
    public function responseTokenFor(int $playerId): string
    {
        return substr(
            hash_hmac('sha256', "challenge:{$this->id}:{$playerId}", (string) config('app.key')),
            0,
            32
        );
    }

    public function matchesResponseToken(int $playerId, ?string $token): bool
    {
        return is_string($token) && hash_equals($this->responseTokenFor($playerId), $token);
    }

    /** Retires pending challenges whose window has closed. */
    public static function expireStale(?Carbon $now = null): int
    {
        return static::query()
            ->pending()
            ->where('expires_at', '<=', $now ?? Carbon::now())
            ->update(['status' => self::STATUS_EXPIRED]);
    }
}
