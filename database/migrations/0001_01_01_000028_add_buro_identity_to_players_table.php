<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('players', function (Blueprint $table) {
            // Email is how a Player is matched to a Buro user; buro_user_id is
            // cached once matched so a later rename or email change can't break
            // the link. Both stay nullable: plenty of players never use Buro.
            $table->string('email')->nullable()->unique()->after('name');
            $table->string('buro_user_id')->nullable()->unique()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            $table->dropColumn(['email', 'buro_user_id']);
        });
    }
};
