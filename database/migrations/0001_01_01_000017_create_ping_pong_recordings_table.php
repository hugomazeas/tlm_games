<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_recordings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->unique()->constrained('ping_pong_matches')->cascadeOnDelete();
            $table->string('status', 20)->default('pending');
            $table->unsignedInteger('ffmpeg_pid')->nullable();
            $table->string('hls_path')->nullable();
            $table->string('video_path')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_recordings');
    }
};
