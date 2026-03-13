<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->timestamp('left_remote_connected_at')->nullable()->after('ended_at');
            $table->timestamp('right_remote_connected_at')->nullable()->after('left_remote_connected_at');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->dropColumn(['left_remote_connected_at', 'right_remote_connected_at']);
        });
    }
};
