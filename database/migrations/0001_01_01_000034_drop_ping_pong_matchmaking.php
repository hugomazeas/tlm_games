<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Removes the hourly matchmaking draw and its Buro link.
     *
     * Push subscriptions are left alone: match-start alerts still use them.
     */
    public function up(): void
    {
        Schema::dropIfExists('ping_pong_challenges');

        // SQLite refuses to drop a column that still has an index on it.
        Schema::table('offices', function (Blueprint $table) {
            $table->dropUnique(['buro_office_id']);
        });

        Schema::table('offices', function (Blueprint $table) {
            $table->dropColumn([
                'buro_office_id',
                'matchmaking_enabled',
                'matchmaking_start',
                'matchmaking_end',
            ]);
        });

        Schema::table('players', function (Blueprint $table) {
            $table->dropUnique(['email']);
            $table->dropUnique(['buro_user_id']);
        });

        Schema::table('players', function (Blueprint $table) {
            $table->dropColumn(['email', 'buro_user_id', 'unavailable_until']);
        });
    }

    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            $table->string('email')->nullable()->unique()->after('name');
            $table->string('buro_user_id')->nullable()->unique()->after('email');
            $table->timestamp('unavailable_until')->nullable()->after('office_id');
        });

        Schema::table('offices', function (Blueprint $table) {
            $table->string('buro_office_id')->nullable()->unique()->after('name');
            $table->boolean('matchmaking_enabled')->default(false)->after('buro_office_id');
            $table->string('matchmaking_start', 5)->default('09:30')->after('matchmaking_enabled');
            $table->string('matchmaking_end', 5)->default('16:30')->after('matchmaking_start');
        });

        Schema::create('ping_pong_challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_one_id')->constrained('players')->cascadeOnDelete();
            $table->foreignId('player_two_id')->constrained('players')->cascadeOnDelete();
            $table->foreignId('lobby_id')->nullable()->constrained('ping_pong_lobbies')->nullOnDelete();
            $table->foreignId('match_id')->nullable()->constrained('ping_pong_matches')->nullOnDelete();
            $table->string('status', 20)->default('pending');
            $table->string('player_one_response', 20)->nullable();
            $table->string('player_two_response', 20)->nullable();
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
};
