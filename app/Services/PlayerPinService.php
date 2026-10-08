<?php

namespace App\Services;

use App\Models\Player;
use Illuminate\Contracts\Session\Session;
use Illuminate\Support\Facades\Hash;

/**
 * The 4-digit PIN that guards a claimed player's profile.
 *
 * Entering it unlocks the profile in this browser session for a while, so a
 * crop, rename and upload in a row only ask once. Wrong guesses are counted on
 * the player, not the session, so a fresh browser doesn't buy more tries.
 */
class PlayerPinService
{
    public const UNLOCK_MINUTES = 30;

    public const MAX_ATTEMPTS = 5;

    public const LOCKOUT_MINUTES = 15;

    private const SESSION_KEY = 'unlocked_players';

    public function __construct(private Session $session) {}

    /**
     * Unclaimed players are open to everyone, like before PINs existed.
     */
    public function isUnlocked(Player $player): bool
    {
        if (! $player->hasPin()) {
            return true;
        }

        $expiresAt = $this->session->get(self::SESSION_KEY.'.'.$player->id);

        return $expiresAt !== null && $expiresAt > now()->getTimestamp();
    }

    public function isLockedOut(Player $player): bool
    {
        return $player->pin_locked_until !== null && $player->pin_locked_until->isFuture();
    }

    /**
     * Checks a PIN and unlocks the profile when it matches.
     */
    public function attempt(Player $player, string $pin): bool
    {
        if (! $player->hasPin() || $this->isLockedOut($player)) {
            return false;
        }

        if (! Hash::check($pin, $player->pin)) {
            $attempts = $player->pin_failed_attempts + 1;

            $player->forceFill($attempts >= self::MAX_ATTEMPTS
                ? ['pin_failed_attempts' => 0, 'pin_locked_until' => now()->addMinutes(self::LOCKOUT_MINUTES)]
                : ['pin_failed_attempts' => $attempts]
            )->save();

            return false;
        }

        $player->forceFill(['pin_failed_attempts' => 0, 'pin_locked_until' => null])->save();
        $this->unlock($player);

        return true;
    }

    /**
     * Sets (or changes) the PIN and unlocks the profile for whoever just set it.
     */
    public function setPin(Player $player, string $pin): void
    {
        $player->forceFill(['pin' => $pin, 'pin_failed_attempts' => 0, 'pin_locked_until' => null])->save();
        $this->unlock($player);
    }

    /**
     * Forgets the PIN so the player can be claimed again.
     */
    public function clearPin(Player $player): void
    {
        $player->forceFill(['pin' => null, 'pin_failed_attempts' => 0, 'pin_locked_until' => null])->save();
    }

    public function unlock(Player $player): void
    {
        $this->session->put(self::SESSION_KEY.'.'.$player->id, now()->addMinutes(self::UNLOCK_MINUTES)->getTimestamp());
    }

    public function lock(Player $player): void
    {
        $this->session->forget(self::SESSION_KEY.'.'.$player->id);
    }
}
