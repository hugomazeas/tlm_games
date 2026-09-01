<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One browser's Web Push registration, owned by a Player.
 *
 * A person can hold several of these at once — phone, laptop, installed PWA —
 * and each is independently revocable by the push service, so
 * `WebPushSender` deletes rows the moment an endpoint reports 404/410.
 */
class PushSubscription extends Model
{
    protected $fillable = [
        'player_id',
        'endpoint',
        'endpoint_hash',
        'public_key',
        'auth_token',
        'content_encoding',
        'last_notified_at',
    ];

    protected function casts(): array
    {
        return [
            'last_notified_at' => 'datetime',
        ];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    /** Endpoints are too long to index, so uniqueness rides on this digest. */
    public static function hashEndpoint(string $endpoint): string
    {
        return hash('sha256', $endpoint);
    }
}
