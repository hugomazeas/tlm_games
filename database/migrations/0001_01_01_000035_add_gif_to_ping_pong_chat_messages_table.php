<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A /giphy message keeps its search words in `body` and the GIF it
     * picked here; plain text messages leave it null.
     */
    public function up(): void
    {
        Schema::table('ping_pong_chat_messages', function (Blueprint $table) {
            $table->json('gif')->nullable()->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_chat_messages', function (Blueprint $table) {
            $table->dropColumn('gif');
        });
    }
};
