<?php

namespace App\Services\Buro;

use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * One office's presence snapshot, as reported by Buro.
 *
 * Buro bookings are date-only, so "present" means "booked a seat for today".
 * The office-local clock travels with the payload because only Buro knows the
 * office's timezone — this app must never re-derive it from its own clock.
 */
class BuroPresence
{
    /**
     * @param  Collection<int, BuroPresentUser>  $users
     */
    public function __construct(
        public readonly string $date,
        public readonly string $localTime,
        public readonly int $weekday,
        public readonly string $officeId,
        public readonly string $officeName,
        public readonly string $timezone,
        public readonly Collection $users,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     */
    public static function fromArray(array $payload): self
    {
        $office = $payload['office'] ?? [];

        return new self(
            date: (string) ($payload['date'] ?? ''),
            localTime: (string) ($payload['localTime'] ?? ''),
            weekday: (int) ($payload['weekday'] ?? 0),
            officeId: (string) ($office['id'] ?? ''),
            officeName: (string) ($office['name'] ?? ''),
            timezone: (string) ($office['timezone'] ?? 'UTC'),
            users: collect($payload['users'] ?? [])
                ->map(fn (array $user) => BuroPresentUser::fromArray($user))
                ->values(),
        );
    }

    /** Monday through Friday in the office's own timezone. */
    public function isWeekday(): bool
    {
        return $this->weekday >= 1 && $this->weekday <= 5;
    }

    /**
     * Whether the office-local clock sits inside an inclusive `HH:MM` window.
     *
     * String comparison is deliberate: zero-padded 24-hour times sort
     * lexicographically, which sidesteps a timezone-aware date construction
     * that would only invite the server's clock back into the decision.
     */
    public function isWithinHours(string $start, string $end): bool
    {
        return $this->localTime >= $start && $this->localTime <= $end;
    }

    /** The office-local moment of this snapshot, for stamping challenge rows. */
    public function localNow(): Carbon
    {
        return Carbon::parse("{$this->date} {$this->localTime}", $this->timezone);
    }

    /**
     * @return Collection<int, BuroPresentUser>
     */
    public function usersWithFlag(string $flag): Collection
    {
        return $this->users->filter(fn (BuroPresentUser $user) => $user->hasFlag($flag))->values();
    }
}
