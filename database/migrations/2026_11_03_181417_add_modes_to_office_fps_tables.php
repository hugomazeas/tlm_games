<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The office FPS's modes and pickups: each match's mode (free for all, team deathmatch, king of
 * the meeting room), and per player their team, whether they won (a whole team wins in team
 * deathmatch), their time holding the zone and the pickups they collected. Matches saved before
 * this were all free for all, won by whoever placed first.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('office_fps_matches', function (Blueprint $table) {
            $table->string('mode', 10)->default('ffa');
        });

        Schema::table('office_fps_results', function (Blueprint $table) {
            $table->string('team', 10)->nullable();
            $table->boolean('won')->default(false);
            $table->unsignedInteger('zone_ms')->default(0);
            $table->unsignedSmallInteger('pickups')->default(0);
        });

        DB::table('office_fps_results')->where('place', 1)->update(['won' => true]);
    }

    public function down(): void
    {
        Schema::table('office_fps_results', function (Blueprint $table) {
            $table->dropColumn(['team', 'won', 'zone_ms', 'pickups']);
        });

        Schema::table('office_fps_matches', function (Blueprint $table) {
            $table->dropColumn('mode');
        });
    }
};
