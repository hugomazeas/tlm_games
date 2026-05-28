<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->string('error_type', 10)->nullable()->after('point_cause');
            $table->boolean('serve_point')->default(false)->after('error_type');
            $table->boolean('body_hit')->default(false)->after('serve_point');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->dropColumn(['error_type', 'serve_point', 'body_hit']);
        });
    }
};
