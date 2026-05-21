<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->string('point_cause', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->dropColumn('point_cause');
        });
    }
};
