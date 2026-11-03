<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The office FPS's history, posted by the game server when a match ends: the match and its
 * rules, one row per Hub player who played it (guests play but aren't recorded), and every kill
 * (a guest's side is null), for the who-killed-whom stats.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('office_fps_matches', function (Blueprint $table) {
            $table->id();
            $table->timestamp('started_at');
            $table->timestamp('ended_at');
            $table->unsignedSmallInteger('frag_limit');
            $table->unsignedSmallInteger('minutes');
            $table->unsignedTinyInteger('player_count');
            $table->timestamps();

            $table->index('ended_at');
        });

        Schema::create('office_fps_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_fps_match_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('place');
            $table->unsignedSmallInteger('kills');
            $table->unsignedSmallInteger('deaths');
            $table->unsignedSmallInteger('headshots');
            $table->unsignedInteger('damage');
            $table->unsignedInteger('shots');
            $table->unsignedInteger('hits');
            $table->unsignedSmallInteger('melee_kills');
            $table->unsignedSmallInteger('backstabs');
            $table->unsignedSmallInteger('best_streak');
            $table->unsignedInteger('played_ms');
            $table->boolean('left');
            $table->timestamps();

            $table->unique(['office_fps_match_id', 'player_id']);
            $table->index('player_id');
        });

        Schema::create('office_fps_kills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_fps_match_id')->constrained()->cascadeOnDelete();
            $table->foreignId('killer_id')->nullable()->constrained('players')->nullOnDelete();
            $table->foreignId('victim_id')->nullable()->constrained('players')->nullOnDelete();
            $table->string('weapon', 20);
            $table->boolean('headshot');
            $table->boolean('backstab');
            $table->unsignedInteger('at_ms');
            $table->timestamps();

            $table->index('killer_id');
            $table->index('victim_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('office_fps_kills');
        Schema::dropIfExists('office_fps_results');
        Schema::dropIfExists('office_fps_matches');
    }
};
