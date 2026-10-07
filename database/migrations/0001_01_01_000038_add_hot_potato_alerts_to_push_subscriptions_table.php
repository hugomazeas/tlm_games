<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            // "Tell me when someone opens a hot potato in my office." Needs a
            // player, whose office decides which games they hear about.
            $table->boolean('notify_hot_potato')->default(false)->after('notify_match_starts');
            $table->index('notify_hot_potato');
        });
    }

    public function down(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            $table->dropIndex(['notify_hot_potato']);
            $table->dropColumn('notify_hot_potato');
        });
    }
};
