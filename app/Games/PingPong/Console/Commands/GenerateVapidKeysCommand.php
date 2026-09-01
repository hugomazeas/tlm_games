<?php

namespace App\Games\PingPong\Console\Commands;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;

/**
 * Prints a fresh VAPID key pair for .env.
 *
 * Run once per environment. Rotating the keys invalidates every browser
 * subscription already stored, so everyone has to re-enable notifications —
 * the command refuses to look routine about it.
 */
class GenerateVapidKeysCommand extends Command
{
    protected $signature = 'pingpong:vapid-keys';

    protected $description = 'Generate a VAPID key pair for web push notifications';

    public function handle(): int
    {
        if (filled(config('pingpong.webpush.public_key'))) {
            $this->warn('VAPID keys are already configured.');
            $this->warn('Replacing them will invalidate every existing push subscription.');

            if (! $this->confirm('Generate a new pair anyway?', false)) {
                return self::SUCCESS;
            }
        }

        $keys = VAPID::createVapidKeys();

        $this->newLine();
        $this->line('Add these to your .env:');
        $this->newLine();
        $this->line('VAPID_PUBLIC_KEY='.$keys['publicKey']);
        $this->line('VAPID_PRIVATE_KEY='.$keys['privateKey']);
        $this->newLine();

        return self::SUCCESS;
    }
}
