<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Player extends Model
{
    protected $fillable = ['name', 'office_id'];

    protected $hidden = ['pin', 'pin_failed_attempts', 'pin_locked_until', 'avatar_path'];

    protected $appends = ['avatar_url'];

    protected function casts(): array
    {
        return [
            'pin' => 'hashed',
            'pin_failed_attempts' => 'integer',
            'pin_locked_until' => 'datetime',
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

    /**
     * A player with a PIN has been claimed: their profile is locked behind it.
     */
    public function hasPin(): bool
    {
        return $this->pin !== null;
    }

    /**
     * Root-relative so it works on whatever host or port the page was served
     * from, including the hot potato sidecar's pages.
     */
    public function avatarUrl(): ?string
    {
        // Read raw so a query that selected only some columns gets null, not an error.
        $path = $this->attributes['avatar_path'] ?? null;

        return $path ? '/storage/'.$path : null;
    }

    /**
     * Appended so every serialized player (live match payloads, broadcasts)
     * carries its photo without each builder having to remember it.
     */
    public function getAvatarUrlAttribute(): ?string
    {
        // Old-style accessor: the new-style one would be named avatarUrl(), taken above.
        return $this->avatarUrl();
    }

    /**
     * What an avatar shows when there is no photo: "Ada Lovelace" is "AL".
     */
    public function initials(): string
    {
        return self::initialsFor($this->name);
    }

    public static function initialsFor(?string $name): string
    {
        $words = preg_split('/\s+/', trim((string) $name), -1, PREG_SPLIT_NO_EMPTY);

        if (! $words) {
            return '?';
        }

        $initials = Str::substr($words[0], 0, 1);

        if (count($words) > 1) {
            $initials .= Str::substr(end($words), 0, 1);
        }

        return Str::upper($initials);
    }
}
