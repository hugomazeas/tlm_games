<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A logged match was typed in after it was played (final score only, no points):
        // it moves ELO like any other, and can be undone for a few minutes after.
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->timestamp('logged_at')->nullable()->after('ended_at');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->dropColumn('logged_at');
        });
    }
};
