<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_one_id')->constrained('players')->cascadeOnDelete();
            $table->foreignId('player_two_id')->constrained('players')->cascadeOnDelete();
            $table->foreignId('lobby_id')->nullable()->constrained('ping_pong_lobbies')->nullOnDelete();
            $table->foreignId('match_id')->nullable()->constrained('ping_pong_matches')->nullOnDelete();
            $table->string('status', 20)->default('pending');
            // Per-player answers: null while unanswered, then accepted/declined.
            $table->string('player_one_response', 20)->nullable();
            $table->string('player_two_response', 20)->nullable();
            // Everyone else in the office who gets told the match is on. Frozen
            // at draw time so the announcement matches who was actually there,
            // even if the job runs a minute later.
            $table->json('audience_player_ids')->nullable();
            $table->timestamp('scheduled_for');
            $table->timestamp('expires_at');
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->index(['office_id', 'scheduled_for']);
            $table->index(['status', 'expires_at']);
            $table->index(['player_one_id', 'scheduled_for']);
            $table->index(['player_two_id', 'scheduled_for']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_challenges');
    }
};
