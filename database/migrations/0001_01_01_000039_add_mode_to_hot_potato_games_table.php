<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hot_potato_games', function (Blueprint $table) {
            // "survival" (the classic game) or "king" (King of the Potato). Every
            // game stored before modes existed was a survival game.
            $table->string('mode', 20)->default('survival')->after('office_id');
            $table->index('mode');
        });
    }

    public function down(): void
    {
        Schema::table('hot_potato_games', function (Blueprint $table) {
            $table->dropIndex(['mode']);
            $table->dropColumn('mode');
        });
    }
};
