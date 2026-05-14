<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->foreignId('first_server_id')->nullable()->after('current_server_id')->constrained('players')->nullOnDelete();
        });

        DB::table('ping_pong_matches')
            ->whereNull('first_server_id')
            ->update(['first_server_id' => DB::raw('player_left_id')]);
    }

    public function down(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->dropForeign(['first_server_id']);
            $table->dropColumn('first_server_id');
        });
    }
};
