<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Chat becomes one room per match. Messages from the old single ongoing
     * room belong to no match and could never be shown again, so the table is
     * rebuilt rather than given a nullable match_id.
     */
    public function up(): void
    {
        Schema::dropIfExists('ping_pong_chat_messages');

        Schema::create('ping_pong_chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('ping_pong_matches')->cascadeOnDelete();
            $table->foreignId('player_id')->constrained('players')->cascadeOnDelete();
            $table->string('body', 200);
            $table->timestamps();

            $table->index(['match_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_chat_messages');

        Schema::create('ping_pong_chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained('players')->cascadeOnDelete();
            $table->string('body', 200);
            $table->timestamps();

            $table->index('created_at');
        });
    }
};
