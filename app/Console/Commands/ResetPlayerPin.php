<?php

namespace App\Console\Commands;

use App\Models\Player;
use App\Services\PlayerPinService;
use Illuminate\Console\Command;

/**
 * The only way back in when someone forgets their PIN: clear it, and they
 * claim their profile again from its page. The photo is kept.
 */
class ResetPlayerPin extends Command
{
    protected $signature = 'players:reset-pin {player : Player id or exact name}';

    protected $description = 'Clear a player\'s profile PIN so they can set a new one';

    public function handle(PlayerPinService $pins): int
    {
        $search = (string) $this->argument('player');

        $player = ctype_digit($search)
            ? Player::find((int) $search)
            : Player::where('name', $search)->first();

        if (! $player) {
            $this->error("No player matches \"{$search}\".");

            return self::FAILURE;
        }

        if (! $player->hasPin()) {
            $this->info("{$player->name} has no PIN.");

            return self::SUCCESS;
        }

        $pins->clearPin($player);
        $this->info("Cleared {$player->name}'s PIN. They can claim the profile again from /players/{$player->id}.");

        return self::SUCCESS;
    }
}
