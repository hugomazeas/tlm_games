<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Free play: the match counts for stats but never moves ELO.
        Schema::table('ping_pong_lobbies', function (Blueprint $table) {
            $table->boolean('free_play')->default(false)->after('mode');
        });

        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->boolean('free_play')->default(false)->after('mode');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_lobbies', function (Blueprint $table) {
            $table->dropColumn('free_play');
        });

        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->dropColumn('free_play');
        });
    }
};
