<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Player extends Model
{
    protected $fillable = ['name', 'email', 'buro_user_id', 'office_id'];

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(PushSubscription::class);
    }

    public function hasPushSubscription(): bool
    {
        return $this->pushSubscriptions()->exists();
    }
}
