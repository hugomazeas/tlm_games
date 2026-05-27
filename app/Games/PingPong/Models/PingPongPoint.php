<?php

namespace App\Games\PingPong\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PingPongPoint extends Model
{
    public $timestamps = false;

    protected $table = 'ping_pong_points';

    protected $fillable = [
        'match_id',
        'scoring_side',
        'point_number',
        'left_score_after',
        'right_score_after',
        'shot_type',
        'net_edge',
        'table_edge',
        'clip_requested',
        'point_cause',
        'error_type',
        'serve_point',
        'body_hit',
    ];

    protected function casts(): array
    {
        return [
            'point_number' => 'integer',
            'left_score_after' => 'integer',
            'right_score_after' => 'integer',
            'net_edge' => 'boolean',
            'table_edge' => 'boolean',
            'clip_requested' => 'boolean',
            'serve_point' => 'boolean',
            'body_hit' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }

    /** Side that hit the point-ending shot. */
    public function decisiveSide(): string
    {
        $opposite = $this->scoring_side === 'left' ? 'right' : 'left';
        return $this->point_cause === 'opponent_error' ? $opposite : $this->scoring_side;
    }

    /**
     * Side that served this point. Singles (1v1) only — result is undefined for 2v2.
     * Derived from the match's first server and the score before this point.
     */
    public function serverSide(): string
    {
        $match = $this->match;
        if (!$match) {
            throw new \LogicException('serverSide() requires a loaded match relation.');
        }
        $beforeLeft = $this->left_score_after - ($this->scoring_side === 'left' ? 1 : 0);
        $beforeRight = $this->right_score_after - ($this->scoring_side === 'right' ? 1 : 0);

        $firstServerIsLeft = ($match->first_server_id ?? $match->player_left_id) === $match->player_left_id;
        $inDeuce = $beforeLeft >= 10 && $beforeRight >= 10;
        $interval = $inDeuce ? 1 : 2;
        $serverIndex = intdiv($beforeLeft + $beforeRight, $interval) % 2;

        if ($serverIndex === 0) {
            return $firstServerIsLeft ? 'left' : 'right';
        }
        return $firstServerIsLeft ? 'right' : 'left';
    }
}
