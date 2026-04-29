<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_lobbies', function (Blueprint $table) {
            $table->foreignId('rematch_of_match_id')
                ->nullable()
                ->after('match_id')
                ->constrained('ping_pong_matches')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_lobbies', function (Blueprint $table) {
            $table->dropConstrainedForeignId('rematch_of_match_id');
        });
    }
};
