<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_lobbies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 6)->unique();
            $table->string('mode', 10)->default('1v1');
            $table->string('host_token', 64);
            $table->string('status', 20)->default('waiting');
            $table->foreignId('match_id')->nullable()->constrained('ping_pong_matches')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamps();
        });

        Schema::create('ping_pong_lobby_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lobby_id')->constrained('ping_pong_lobbies')->cascadeOnDelete();
            $table->foreignId('player_id')->constrained('players');
            $table->string('side', 10);
            $table->string('session_token', 64);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['lobby_id', 'player_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_lobby_participants');
        Schema::dropIfExists('ping_pong_lobbies');
    }
};
