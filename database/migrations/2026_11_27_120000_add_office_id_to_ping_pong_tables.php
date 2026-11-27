<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The office a match is played in (picked in the lobby, or the tournament's), so the right
 * office's lights react to it. Existing rows stay null: they never fire lights.
 */
return new class extends Migration
{
    private const TABLES = ['ping_pong_matches', 'ping_pong_lobbies', 'ping_pong_tournaments'];

    public function up(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->foreignId('office_id')->nullable()->constrained('offices')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropConstrainedForeignId('office_id');
            });
        }
    }
};
