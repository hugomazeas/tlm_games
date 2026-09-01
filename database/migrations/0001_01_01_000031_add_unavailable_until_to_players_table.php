<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('players', function (Blueprint $table) {
            // Buro only knows someone booked a desk today, not that they went
            // home at three. When a draw names somebody who has already left,
            // anyone can mark them away and this keeps them out of the rest of
            // the day's draws rather than letting them be picked again at the
            // top of the next hour.
            $table->timestamp('unavailable_until')->nullable()->after('office_id');
        });
    }

    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            $table->dropColumn('unavailable_until');
        });
    }
};
