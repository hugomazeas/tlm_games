<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Each player's kart colours, picked in the racing garage (#rrggbb).
        Schema::create('racing_karts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('body', 7);
            $table->string('accent', 7);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('racing_karts');
    }
};
