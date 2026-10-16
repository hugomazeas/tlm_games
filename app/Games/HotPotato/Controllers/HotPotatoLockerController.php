<?php

namespace App\Games\HotPotato\Controllers;

use App\Games\HotPotato\Models\HotPotatoLook;
use App\Games\HotPotato\Services\Cosmetics;
use App\Http\Controllers\Controller;
use App\Models\Player;
use App\Services\PlayerPinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

/**
 * The locker: a player's hot potato look. Anyone can look; changing it needs
 * the profile claimed (a PIN set) and unlocked in this browser, stricter than
 * the profile itself, where unclaimed players are open to everyone.
 */
class HotPotatoLockerController extends Controller
{
    public function __construct(private PlayerPinService $pins, private Cosmetics $cosmetics) {}

    public function show(Player $player): View
    {
        return view('games.hot-potato.locker', [
            'player' => $player,
            'look' => HotPotatoLook::of($player),
            'catalogue' => $this->cosmetics->catalogue(),
            'claimed' => $player->hasPin(),
            'canEdit' => $this->canEdit($player),
        ]);
    }

    public function update(Request $request, Player $player): JsonResponse
    {
        if (! $this->canEdit($player)) {
            return response()->json(['message' => 'Claim or unlock this profile to customise.'], 403);
        }

        $rules = [];
        foreach (Cosmetics::SLOTS as $slot) {
            $rules[$slot] = ['required', 'string', Rule::in($this->cosmetics->ids($slot))];
        }
        $validated = $request->validate($rules);

        HotPotatoLook::updateOrCreate(['player_id' => $player->id], $validated);

        return response()->json(HotPotatoLook::of($player));
    }

    private function canEdit(Player $player): bool
    {
        return $player->hasPin() && $this->pins->isUnlocked($player);
    }
}
