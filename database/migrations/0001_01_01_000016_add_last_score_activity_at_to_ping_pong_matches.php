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
            $table->timestamp('last_score_activity_at')->nullable();
        });

        $matchIds = DB::table('ping_pong_matches')
            ->whereNull('ended_at')
            ->whereNotNull('started_at')
            ->pluck('id');

        foreach ($matchIds as $id) {
            $startedAt = DB::table('ping_pong_matches')->where('id', $id)->value('started_at');
            $maxPointAt = DB::table('ping_pong_points')->where('match_id', $id)->max('created_at');

            DB::table('ping_pong_matches')->where('id', $id)->update([
                'last_score_activity_at' => $maxPointAt ?? $startedAt,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->dropColumn('last_score_activity_at');
        });
    }
};
