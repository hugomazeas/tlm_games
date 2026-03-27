<?php

namespace App\Games\PingPong\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongRecording extends Model
{
    protected $table = 'ping_pong_recordings';

    protected $fillable = [
        'match_id',
        'status',
        'ffmpeg_pid',
        'hls_path',
        'video_path',
        'file_size',
        'duration_seconds',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'ffmpeg_pid' => 'integer',
            'file_size' => 'integer',
            'duration_seconds' => 'integer',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }

    public function getVideoUrlAttribute(): ?string
    {
        if ($this->status !== 'completed' || !$this->video_path) {
            return null;
        }

        return '/storage/' . $this->video_path;
    }

    public function getHlsUrlAttribute(): ?string
    {
        if ($this->status !== 'recording' || !$this->hls_path) {
            return null;
        }

        return '/recordings/live/' . $this->match_id . '/stream.m3u8';
    }

    public function getIsRecordingAttribute(): bool
    {
        return $this->status === 'recording';
    }

    public function getIsCompletedAttribute(): bool
    {
        return $this->status === 'completed';
    }
}
