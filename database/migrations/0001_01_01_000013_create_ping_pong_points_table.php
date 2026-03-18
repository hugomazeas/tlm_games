<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_points', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('ping_pong_matches')->cascadeOnDelete();
            $table->string('scoring_side'); // 'left' or 'right'
            $table->unsignedSmallInteger('point_number');
            $table->unsignedSmallInteger('left_score_after');
            $table->unsignedSmallInteger('right_score_after');
            $table->timestamp('created_at')->useCurrent();

            $table->index('match_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_points');
    }
};
