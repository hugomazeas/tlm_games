<?php

namespace App\Http\Controllers;

use App\Models\Player;
use App\Services\PlayerAvatarService;
use App\Services\PlayerPinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * Claiming a player with a PIN, unlocking it, and its profile picture.
 */
class PlayerProfileController extends Controller
{
    public function __construct(private PlayerPinService $pins) {}

    /**
     * Claims an unclaimed player, or changes the PIN of an unlocked one (the
     * route's unlock guard covers the second case).
     */
    public function setPin(Request $request, Player $player): RedirectResponse
    {
        $validated = $request->validate([
            'pin' => ['required', 'digits:4', 'confirmed'],
        ], [
            'pin.digits' => 'The PIN must be exactly 4 digits.',
            'pin.confirmed' => 'The two PINs don\'t match.',
        ]);

        $wasClaimed = $player->hasPin();
        $this->pins->setPin($player, $validated['pin']);

        return redirect('/players/'.$player->id)
            ->with('success', $wasClaimed ? 'PIN changed.' : 'Profile claimed. You can add a photo now.');
    }

    public function unlock(Request $request, Player $player): RedirectResponse
    {
        $validated = $request->validate(['pin' => ['required', 'string']]);

        if ($this->pins->isLockedOut($player)) {
            return back()->withErrors([
                'pin' => 'Too many wrong PINs. Try again in '.$player->pin_locked_until->diffForHumans(syntax: true).'.',
            ]);
        }

        if (! $this->pins->attempt($player, $validated['pin'])) {
            return back()->withErrors(['pin' => $this->pins->isLockedOut($player->refresh())
                ? 'Too many wrong PINs. The profile is locked for '.PlayerPinService::LOCKOUT_MINUTES.' minutes.'
                : 'Wrong PIN.',
            ]);
        }

        return redirect('/players/'.$player->id)->with('success', 'Profile unlocked.');
    }

    public function lock(Player $player): RedirectResponse
    {
        $this->pins->lock($player);

        return redirect('/players/'.$player->id);
    }

    /**
     * A photo needs a claimed profile, so nobody can put a picture on a
     * player that isn't theirs and leave it there.
     */
    public function storeAvatar(Request $request, Player $player, PlayerAvatarService $avatars): JsonResponse
    {
        if (! $player->hasPin()) {
            return response()->json(['message' => 'Set a PIN before adding a photo.'], 403);
        }

        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpeg,jpg,png', 'max:5120', 'dimensions:max_width=4096,max_height=4096'],
        ]);

        try {
            $avatars->store($player, $request->file('avatar'));
        } catch (InvalidArgumentException) {
            return response()->json(['message' => 'That image could not be read.'], 422);
        }

        return response()->json(['avatar_url' => $player->avatarUrl()]);
    }

    public function destroyAvatar(Player $player, PlayerAvatarService $avatars): RedirectResponse
    {
        $avatars->remove($player);

        return redirect('/players/'.$player->id)->with('success', 'Photo removed.');
    }
}
