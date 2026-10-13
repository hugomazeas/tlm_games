<?php

namespace App\Games\Racing\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A circuit for the racing game: checkpoints to drive through in order,
 * `laps` times round. Each checkpoint is a line across a street, as
 * latitude/longitude, the way through it (`heading`, degrees, 0 north and
 * 90 west) and how wide it is; the first is the start line. Made in the
 * track editor, which checks a track can be raced before saving it.
 *
 * @property array<int, array{lat: float, lon: float, heading: float, width: float}> $gates
 */
class RacingTrack extends Model
{
    /**
     * The maps the game server has, and the area each covers: checkpoints must
     * fall inside it. Kept in step with MAPS in game-server/src/race/map/pipeline.ts.
     *
     * @var array<string, array{south: float, west: float, north: float, east: float}>
     */
    public const MAPS = [
        'quebec-plains' => ['south' => 46.792, 'west' => -71.253, 'north' => 46.8175, 'east' => -71.199],
    ];

    public const MAX_LAPS = 10;

    public const MIN_GATES = 3;

    public const MAX_GATES = 100;

    protected $table = 'racing_tracks';

    protected $fillable = [
        'name',
        'map',
        'laps',
        'gates',
        'length',
    ];

    protected function casts(): array
    {
        return [
            'gates' => 'array',
            'laps' => 'integer',
            'length' => 'integer',
        ];
    }

    /**
     * The checkpoints as an SVG path in a 100 × 100 box, north up, for a
     * thumbnail of the track's shape.
     */
    public function outlinePath(): string
    {
        $gates = $this->gates;
        if (count($gates) < 2) {
            return '';
        }

        // Longitude degrees shrink with latitude; scale them to match before fitting the box.
        $squash = cos(deg2rad($gates[0]['lat']));
        $xs = array_map(fn (array $gate) => $gate['lon'] * $squash, $gates);
        $ys = array_map(fn (array $gate) => -$gate['lat'], $gates);
        $span = max(max($xs) - min($xs), max($ys) - min($ys)) ?: 1;
        $left = (min($xs) + max($xs)) / 2 - $span / 2;
        $top = (min($ys) + max($ys)) / 2 - $span / 2;

        $points = array_map(
            fn (float $x, float $y) => sprintf('%.1f %.1f', 8 + ($x - $left) / $span * 84, 8 + ($y - $top) / $span * 84),
            $xs,
            $ys,
        );

        return 'M '.implode(' L ', $points).' Z';
    }
}
