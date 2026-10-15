<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The video archive's debug run for this video (e.g. v6_1999), where the ball stats come from.
        Schema::table('ping_pong_recordings', function (Blueprint $table) {
            $table->string('stats_run')->nullable()->after('video_path');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_recordings', function (Blueprint $table) {
            $table->dropColumn('stats_run');
        });
    }
};
