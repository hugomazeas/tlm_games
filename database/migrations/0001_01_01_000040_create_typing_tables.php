<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('typing_races', function (Blueprint $table) {
            $table->id();
            $table->string('language', 2);
            $table->string('source', 10);
            $table->text('text');
            $table->string('status', 10)->default('lobby'); // lobby|running|finished
            $table->timestamp('starts_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });

        Schema::create('typing_race_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('typing_race_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->text('typed')->nullable();
            $table->integer('progress_chars')->default(0);
            $table->integer('keystrokes')->default(0);
            $table->integer('errors')->default(0);
            $table->integer('finish_ms')->nullable(); // server ms from starts_at to the last correct word
            $table->integer('place')->nullable();
            $table->timestamps();

            $table->unique(['typing_race_id', 'player_id']);
        });

        // Solo tests are inserted when issued (submitted_at null) and filled in on submit;
        // race results are inserted already submitted. Only submitted rows count.
        Schema::create('typing_tests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->foreignId('typing_race_id')->nullable()->constrained()->nullOnDelete();
            $table->string('language', 2);
            $table->string('source', 10);
            $table->text('text');
            $table->text('typed')->nullable();
            $table->decimal('wpm', 6, 2)->nullable();
            $table->decimal('raw_wpm', 6, 2)->nullable();
            $table->decimal('accuracy', 5, 2)->nullable();
            $table->integer('duration_ms')->nullable();
            $table->timestamp('issued_at');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->index(['player_id', 'submitted_at']);
            $table->index('submitted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('typing_tests');
        Schema::dropIfExists('typing_race_players');
        Schema::dropIfExists('typing_races');
    }
};
