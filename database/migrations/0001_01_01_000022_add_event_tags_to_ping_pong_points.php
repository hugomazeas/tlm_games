<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->string('shot_type', 10)->nullable();
            $table->boolean('net_edge')->default(false);
            $table->boolean('clip_requested')->default(false);
        });

        Schema::table('ping_pong_clips', function (Blueprint $table) {
            $table->foreignId('ping_pong_point_id')
                ->nullable()
                ->after('match_id')
                ->constrained('ping_pong_points')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_clips', function (Blueprint $table) {
            $table->dropForeign(['ping_pong_point_id']);
            $table->dropColumn('ping_pong_point_id');
        });

        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->dropColumn(['shot_type', 'net_edge', 'clip_requested']);
        });
    }
};
