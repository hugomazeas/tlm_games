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
        'stats_run',
        'file_size',
        'duration_seconds',
        'error_message',
        'wide_hls_path',
        'wide_video_path',
        'wide_file_size',
        'wide_offset_ms',
    ];

    protected function casts(): array
    {
        return [
            'ffmpeg_pid' => 'integer',
            'file_size' => 'integer',
            'duration_seconds' => 'integer',
            'wide_file_size' => 'integer',
            'wide_offset_ms' => 'integer',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id')->includingTournaments();
    }

    public function getVideoUrlAttribute(): ?string
    {
        if ($this->status !== 'completed' || ! $this->video_path) {
            return null;
        }

        return '/storage/'.$this->video_path;
    }

    public function getHlsUrlAttribute(): ?string
    {
        if ($this->status !== 'recording' || ! $this->hls_path) {
            return null;
        }

        return '/recordings/live/'.$this->match_id.'/stream.m3u8';
    }

    /**
     * The wide angle's finished video, once the main one is done and the wide one finalized.
     */
    public function getWideVideoUrlAttribute(): ?string
    {
        if ($this->status !== 'completed' || ! $this->wide_video_path) {
            return null;
        }

        return '/storage/'.$this->wide_video_path;
    }

    public function getWideHlsUrlAttribute(): ?string
    {
        if ($this->status !== 'recording' || ! $this->wide_hls_path) {
            return null;
        }

        return '/recordings/live/'.$this->match_id.'/wide/stream.m3u8';
    }
}
