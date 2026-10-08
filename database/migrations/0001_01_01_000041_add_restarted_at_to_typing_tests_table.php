<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('typing_tests', function (Blueprint $table) {
            // Set when a solo test was started, then abandoned for a new one.
            $table->timestamp('restarted_at')->nullable()->after('submitted_at');
        });
    }

    public function down(): void
    {
        Schema::table('typing_tests', function (Blueprint $table) {
            $table->dropColumn('restarted_at');
        });
    }
};
