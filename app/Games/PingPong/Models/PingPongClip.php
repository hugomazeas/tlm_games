<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongClip extends Model
{
    protected $table = 'ping_pong_clips';

    protected $fillable = [
        'recording_id',
        'match_id',
        'player_id',
        'start_seconds',
        'end_seconds',
        'duration_seconds',
        'clip_path',
        'file_size',
        'status',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'start_seconds' => 'float',
            'end_seconds' => 'float',
            'duration_seconds' => 'float',
            'file_size' => 'integer',
        ];
    }

    public function recording(): BelongsTo
    {
        return $this->belongsTo(PingPongRecording::class, 'recording_id');
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_id');
    }

    public function getClipUrlAttribute(): ?string
    {
        if ($this->status !== 'ready' || !$this->clip_path) {
            return null;
        }

        return '/storage/' . $this->clip_path;
    }
}
