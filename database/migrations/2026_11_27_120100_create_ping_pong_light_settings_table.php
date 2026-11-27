<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One office's Home Assistant light over its ping pong table: where to reach it (the token is
 * encrypted by the model), each side's colour and the animations played on a point and a win.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_light_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->unique()->constrained('offices')->cascadeOnDelete();
            $table->boolean('enabled')->default(false);
            $table->string('ha_url')->nullable();
            $table->text('ha_token')->nullable();
            $table->string('entity_id')->nullable();
            $table->string('left_color', 7)->default('#ff5a4a');
            $table->string('right_color', 7)->default('#3ec8ff');
            $table->unsignedTinyInteger('brightness')->default(100);
            $table->json('animations')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_light_settings');
    }
};
