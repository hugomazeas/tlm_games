<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The office FPS's maps: each match's map, picked by the host. Matches saved before this were all
 * played in the office.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('office_fps_matches', function (Blueprint $table) {
            $table->string('map', 20)->default('office');
        });
    }

    public function down(): void
    {
        Schema::table('office_fps_matches', function (Blueprint $table) {
            $table->dropColumn('map');
        });
    }
};
