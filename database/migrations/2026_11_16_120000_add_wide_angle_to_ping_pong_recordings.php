<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The second camera (the wide angle): filmed by the same ffmpeg as the main one, so a recording
 * is still one row per match. `wide_hls_path` is set while the wide angle is live or still being
 * finalized; `wide_offset_ms` is how much later the wide video starts than the main one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_recordings', function (Blueprint $table) {
            $table->string('wide_hls_path')->nullable();
            $table->string('wide_video_path')->nullable();
            $table->unsignedBigInteger('wide_file_size')->nullable();
            $table->integer('wide_offset_ms')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_recordings', function (Blueprint $table) {
            $table->dropColumn(['wide_hls_path', 'wide_video_path', 'wide_file_size', 'wide_offset_ms']);
        });
    }
};
