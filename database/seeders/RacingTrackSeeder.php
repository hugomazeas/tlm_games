<?php

namespace Database\Seeders;

use App\Games\Racing\Models\RacingTrack;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

/**
 * The racing game's default tracks, from game-server/maps/<map>/courses/*.json
 * (where the game server's tests check they can still be raced on the map).
 * Only added when missing: a track someone has since edited is left alone.
 */
class RacingTrackSeeder extends Seeder
{
    public function run(): void
    {
        foreach (array_keys(RacingTrack::MAPS) as $map) {
            foreach (File::glob(base_path("game-server/maps/{$map}/courses/*.json")) as $path) {
                $course = json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR);

                RacingTrack::firstOrCreate(
                    ['name' => $course['name']],
                    ['map' => $map, 'laps' => $course['laps'], 'gates' => $course['gates']],
                );
            }
        }
    }
}
