<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hot_potato_games', function (Blueprint $table) {
            // The gzipped recording on the local disk; null when the game has none
            // or it was pruned (only the newest games per office keep theirs).
            $table->string('replay_path')->nullable()->after('ended_at');
        });
    }

    public function down(): void
    {
        Schema::table('hot_potato_games', function (Blueprint $table) {
            $table->dropColumn('replay_path');
        });
    }
};
