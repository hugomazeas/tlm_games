<?php

namespace App\Games\PingPong\Models;

use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PingPongMatch extends Model
{
    protected $table = 'ping_pong_matches';

    protected $fillable = [
        'mode',
        'player_left_id',
        'team_left_player2_id',
        'player_right_id',
        'team_right_player2_id',
        'player_left_score',
        'player_right_score',
        'winner_id',
        'current_server_id',
        'serve_count',
        'started_at',
        'last_score_activity_at',
        'ended_at',
        'player_left_elo_before',
        'player_right_elo_before',
        'player_left_elo_after',
        'player_right_elo_after',
        'team_left_player2_elo_before',
        'team_left_player2_elo_after',
        'team_right_player2_elo_before',
        'team_right_player2_elo_after',
        'left_remote_connected_at',
        'right_remote_connected_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'last_score_activity_at' => 'datetime',
            'ended_at' => 'datetime',
            'left_remote_connected_at' => 'datetime',
            'right_remote_connected_at' => 'datetime',
            'player_left_score' => 'integer',
            'player_right_score' => 'integer',
            'serve_count' => 'integer',
            'player_left_elo_before' => 'integer',
            'player_right_elo_before' => 'integer',
            'player_left_elo_after' => 'integer',
            'player_right_elo_after' => 'integer',
            'team_left_player2_elo_before' => 'integer',
            'team_left_player2_elo_after' => 'integer',
            'team_right_player2_elo_before' => 'integer',
            'team_right_player2_elo_after' => 'integer',
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

    public function teamLeftPlayer2(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'team_left_player2_id');
    }

    public function teamRightPlayer2(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'team_right_player2_id');
    }

    public function points(): HasMany
    {
        return $this->hasMany(PingPongPoint::class, 'match_id')->orderBy('point_number');
    }

    public function isDoubles(): bool
    {
        return $this->mode === '2v2';
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

        if ($this->mode === '2v2') {
            // 2 serves per team, alternating players each point
            // Cycle: left1 → left2 → right1 → right2 → repeat
            // In deuce (both >= 10), 1 serve per team (still alternating players)
            $servesPerTeam = $inDeuce ? 1 : 2;
            $cycleLength = $servesPerTeam * 2; // full cycle = both teams
            $posInCycle = $totalScore % ($cycleLength * 2); // *2 for both pairs of players
            // Map: 0=left1, 1=left2, 2=right1, 3=right2 (when servesPerTeam=2)
            //       0=left1, 1=right1, 2=left2, 3=right2 (when servesPerTeam=1)
            $servers = $inDeuce
                ? [
                    $this->player_left_id,
                    $this->player_right_id,
                    $this->team_left_player2_id,
                    $this->team_right_player2_id,
                ]
                : [
                    $this->player_left_id,
                    $this->team_left_player2_id,
                    $this->player_right_id,
                    $this->team_right_player2_id,
                ];
            $serverIndex = $posInCycle % 4;
            $this->current_server_id = $servers[$serverIndex];
            $this->serve_count = 0;
        } else {
            $serveInterval = $inDeuce ? 1 : 2;
            $serverIndex = intval(floor($totalScore / $serveInterval)) % 2;
            $this->current_server_id = $serverIndex === 0 ? $this->player_left_id : $this->player_right_id;
            $this->serve_count = $totalScore % $serveInterval;
        }
    }
}
