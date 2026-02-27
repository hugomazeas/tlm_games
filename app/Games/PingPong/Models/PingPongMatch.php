<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongMatch extends Model
{
    protected $table = 'ping_pong_matches';

    protected $fillable = [
        'player_left_id',
        'player_right_id',
        'player_left_score',
        'player_right_score',
        'winner_id',
        'current_server_id',
        'serve_count',
        'started_at',
        'ended_at',
        'player_left_elo_before',
        'player_right_elo_before',
        'player_left_elo_after',
        'player_right_elo_after',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'player_left_score' => 'integer',
            'player_right_score' => 'integer',
            'serve_count' => 'integer',
            'player_left_elo_before' => 'integer',
            'player_right_elo_before' => 'integer',
            'player_left_elo_after' => 'integer',
            'player_right_elo_after' => 'integer',
        ];
    }

    public function playerLeft(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_left_id');
    }

    public function playerRight(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_right_id');
    }

    public function winner(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'winner_id');
    }

    public function currentServer(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'current_server_id');
    }

    public function getDurationAttribute(): ?int
    {
        if (!$this->ended_at) {
            return null;
        }
        return $this->started_at->diffInSeconds($this->ended_at);
    }

    public function getDurationFormattedAttribute(): ?string
    {
        $duration = $this->duration;
        if ($duration === null) {
            return null;
        }
        $minutes = floor($duration / 60);
        $seconds = $duration % 60;
        return sprintf('%02d:%02d', $minutes, $seconds);
    }

    public function getIsCompleteAttribute(): bool
    {
        return $this->ended_at !== null;
    }

    public function getLoserAttribute(): ?Player
    {
        if (!$this->winner_id) {
            return null;
        }
        return $this->winner_id === $this->player_left_id ? $this->playerRight : $this->playerLeft;
    }

    public function checkWinCondition(): ?int
    {
        $left = $this->player_left_score;
        $right = $this->player_right_score;

        if ($left >= 11 || $right >= 11) {
            if (abs($left - $right) >= 2) {
                return $left > $right ? $this->player_left_id : $this->player_right_id;
            }
        }

        return null;
    }

    public function updateServer(): void
    {
        $totalScore = $this->player_left_score + $this->player_right_score;
        $inDeuce = $this->player_left_score >= 10 && $this->player_right_score >= 10;
        $serveInterval = $inDeuce ? 1 : 2;

        $serverIndex = intval(floor($totalScore / $serveInterval)) % 2;
        $this->current_server_id = $serverIndex === 0 ? $this->player_left_id : $this->player_right_id;
        $this->serve_count = $totalScore % $serveInterval;
    }
}
