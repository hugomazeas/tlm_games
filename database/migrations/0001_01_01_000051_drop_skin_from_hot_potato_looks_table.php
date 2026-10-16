<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The potato is always a potato: no more skins.
        Schema::table('hot_potato_looks', function (Blueprint $table) {
            $table->dropColumn('skin');
        });
    }

    public function down(): void
    {
        Schema::table('hot_potato_looks', function (Blueprint $table) {
            $table->string('skin', 32)->default('classic')->after('colour');
        });
    }
};
