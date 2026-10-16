<?php

namespace App\Games\HotPotato\Models;

use App\Models\Office;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class HotPotatoGame extends Model
{
    /** Pass the potato before it blows; the last ones standing win. */
    public const MODE_SURVIVAL = 'survival';

    /** King of the Potato: hold it as long as you can; the longest reign wins. */
    public const MODE_KING = 'king';

    /** Killer Potato: an AI hunter holds it all game and its touch knocks you out; the last one standing wins. */
    public const MODE_KILLER = 'killer';

    public const MODES = [self::MODE_SURVIVAL, self::MODE_KING, self::MODE_KILLER];

    /** As the game names them (game-server/src/client/strings.ts). */
    public const MODE_LABELS = [
        self::MODE_SURVIVAL => '🥔 Hot potato',
        self::MODE_KING => '👑 King of the Potato',
        self::MODE_KILLER => '🔪 Killer Potato',
    ];

    protected $table = 'hot_potato_games';

    protected $fillable = [
        'office_id',
        'mode',
        'seed',
        'theme',
        'duration_seconds',
        'started_at',
        'ended_at',
        'replay_path',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    /** Where a game's replay is stored on the local disk. */
    public static function replayPathFor(int $gameId): string
    {
        return "hot-potato/replays/{$gameId}.json.gz";
    }

    public function modeLabel(): string
    {
        return self::MODE_LABELS[$this->mode] ?? Str::headline($this->mode);
    }

    /** "open_space" → "Open Space". */
    public function arenaLabel(): string
    {
        return Str::headline($this->theme);
    }

    public function hasReplay(): bool
    {
        return $this->replay_path !== null;
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function players(): HasMany
    {
        return $this->hasMany(HotPotatoGamePlayer::class);
    }
}
