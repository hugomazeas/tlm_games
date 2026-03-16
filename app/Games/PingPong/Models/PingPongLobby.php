<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class PingPongLobby extends Model
{
    protected $table = 'ping_pong_lobbies';

    protected $fillable = [
        'code',
        'mode',
        'host_token',
        'status',
        'match_id',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
        ];
    }

    public function participants(): HasMany
    {
        return $this->hasMany(PingPongLobbyParticipant::class, 'lobby_id');
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }

    public function leftPlayers()
    {
        return $this->participants()->where('side', 'left')->with('player');
    }

    public function rightPlayers()
    {
        return $this->participants()->where('side', 'right')->with('player');
    }

    public function isReadyToStart(): bool
    {
        $leftCount = $this->participants()->where('side', 'left')->count();
        $rightCount = $this->participants()->where('side', 'right')->count();

        if ($this->mode === '1v1') {
            return $leftCount === 1 && $rightCount === 1;
        }

        return $leftCount === 2 && $rightCount === 2;
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public static function generateCode(): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $code = '';
            for ($i = 0; $i < 4; $i++) {
                $code .= $chars[random_int(0, strlen($chars) - 1)];
            }
        } while (static::where('code', $code)->where('status', 'waiting')->exists());

        return $code;
    }
}
