<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Each office's hot potato chat: what people said (`message`, with a body) and
        // what the game narrated (`event`, data the page words). The newest 1 000 per office.
        Schema::create('hot_potato_chat_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind', 10);
            $table->string('body', 200)->nullable();
            $table->json('event')->nullable();
            $table->timestamp('posted_at', 3);
            $table->timestamps();
            $table->index(['office_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hot_potato_chat_lines');
    }
};
