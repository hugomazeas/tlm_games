<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The kart's livery, from the garage: a race number on its sides, a pattern in the accent colour,
        // stickers, and the sponsor on the rear wing (null: the dépanneur's).
        Schema::table('racing_karts', function (Blueprint $table) {
            $table->unsignedTinyInteger('number')->nullable()->after('accent');
            $table->string('pattern', 16)->default('none')->after('number');
            $table->boolean('stickers')->default(true)->after('pattern');
            $table->string('sponsor', 10)->nullable()->after('stickers');
        });
    }

    public function down(): void
    {
        Schema::table('racing_karts', function (Blueprint $table) {
            $table->dropColumn(['number', 'pattern', 'stickers', 'sponsor']);
        });
    }
};
