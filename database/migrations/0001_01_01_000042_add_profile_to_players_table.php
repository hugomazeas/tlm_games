<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('players', function (Blueprint $table) {
            // A 4-digit PIN "claims" a player: once set, the profile (photo,
            // name, office, delete) needs it. Four digits is only 10,000
            // guesses, so wrong attempts lock the profile for a while.
            $table->string('pin')->nullable()->after('name');
            $table->unsignedTinyInteger('pin_failed_attempts')->default(0)->after('pin');
            $table->timestamp('pin_locked_until')->nullable()->after('pin_failed_attempts');
            // Relative to the public disk, e.g. "avatars/12-a1b2c3.jpg".
            $table->string('avatar_path')->nullable()->after('pin_locked_until');
        });
    }

    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            $table->dropColumn(['pin', 'pin_failed_attempts', 'pin_locked_until', 'avatar_path']);
        });
    }
};
