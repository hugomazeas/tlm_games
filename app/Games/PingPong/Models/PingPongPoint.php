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
    ];

    protected function casts(): array
    {
        return [
            'point_number' => 'integer',
            'left_score_after' => 'integer',
            'right_score_after' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PingPongMatch::class, 'match_id');
    }
}
