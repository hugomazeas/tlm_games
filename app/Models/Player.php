<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Player extends Model
{
    protected $fillable = ['name', 'email', 'buro_user_id', 'office_id', 'unavailable_until'];

    protected function casts(): array
    {
        return [
            'unavailable_until' => 'datetime',
        ];
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(PushSubscription::class);
    }

    public function hasPushSubscription(): bool
    {
        return $this->pushSubscriptions()->exists();
    }

    /**
     * Whether this player has been marked as gone for now.
     *
     * Buro can only say someone booked a desk today; it has no idea they left
     * at three. Marking someone away is how a human corrects that.
     */
    public function isUnavailable(?Carbon $now = null): bool
    {
        return $this->unavailable_until !== null
            && $this->unavailable_until->greaterThan($now ?? Carbon::now());
    }

    /** Keeps this player out of draws for the rest of the working day. */
    public function markAway(?int $hours = null): void
    {
        $hours ??= (int) config('pingpong.matchmaking.away_hours');

        $this->forceFill(['unavailable_until' => Carbon::now()->addHours(max($hours, 1))])->save();
    }

    public function markAvailable(): void
    {
        $this->forceFill(['unavailable_until' => null])->save();
    }
}
