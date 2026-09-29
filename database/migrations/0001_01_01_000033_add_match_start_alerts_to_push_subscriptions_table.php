<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            // Livestream viewers opt into "a match just started" with one tap
            // and no name, so a browser no longer has to belong to a player.
            // Rows with a player still get challenge pushes as before.
            $table->foreignId('player_id')->nullable()->change();

            $table->boolean('notify_match_starts')->default(false)->after('content_encoding');
            $table->index('notify_match_starts');
        });
    }

    public function down(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            $table->dropIndex(['notify_match_starts']);
            $table->dropColumn('notify_match_starts');
        });
    }
};
