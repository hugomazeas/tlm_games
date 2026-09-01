<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('offices', function (Blueprint $table) {
            // Buro's office id is a text UUID, so it cannot be a foreign key —
            // it links this row to an office in a separate service/database.
            $table->string('buro_office_id')->nullable()->unique()->after('name');
            $table->boolean('matchmaking_enabled')->default(false)->after('buro_office_id');
            $table->string('matchmaking_start', 5)->default('09:30')->after('matchmaking_enabled');
            $table->string('matchmaking_end', 5)->default('16:30')->after('matchmaking_start');
        });
    }

    public function down(): void
    {
        Schema::table('offices', function (Blueprint $table) {
            $table->dropColumn([
                'buro_office_id',
                'matchmaking_enabled',
                'matchmaking_start',
                'matchmaking_end',
            ]);
        });
    }
};
