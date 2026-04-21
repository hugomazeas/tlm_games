<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_clips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('recording_id')->constrained('ping_pong_recordings')->cascadeOnDelete();
            $table->foreignId('match_id')->constrained('ping_pong_matches')->cascadeOnDelete();
            $table->foreignId('player_id')->constrained('players')->cascadeOnDelete();
            $table->decimal('start_seconds', 8, 2);
            $table->decimal('end_seconds', 8, 2);
            $table->decimal('duration_seconds', 8, 2);
            $table->string('clip_path')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('status', 20)->default('ready');
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index('match_id');
            $table->index('recording_id');
            $table->index('player_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_clips');
    }
};
