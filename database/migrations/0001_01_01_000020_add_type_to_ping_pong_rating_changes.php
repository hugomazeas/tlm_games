<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_rating_changes', function (Blueprint $table) {
            $table->dropUnique(['player_id', 'match_id']);
            $table->string('type', 20)->default('elo')->after('mode');
            $table->unique(['player_id', 'match_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_rating_changes', function (Blueprint $table) {
            $table->dropUnique(['player_id', 'match_id', 'type']);
            $table->dropColumn('type');
            $table->unique(['player_id', 'match_id']);
        });
    }
};
