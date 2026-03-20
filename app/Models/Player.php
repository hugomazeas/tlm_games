<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Player extends Model
{
    protected $fillable = ['name', 'office_id'];

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }
}
