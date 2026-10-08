<?php

namespace App\Games\Typing\Controllers;

use App\Games\Typing\Models\TypingRace;
use App\Games\Typing\Services\TypingContent;
use App\Games\Typing\Services\TypingRaceService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TypingRaceController extends Controller
{
    public function __construct(private TypingRaceService $races) {}

    public function show(): JsonResponse
    {
        return response()->json(['race' => $this->races->openRace()?->toBroadcast()]);
    }

    public function join(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|exists:players,id',
            'language' => ['required', Rule::in(TypingContent::LANGUAGES)],
            'source' => ['required', Rule::in(TypingContent::SOURCES)],
        ]);

        $race = $this->races->join((int) $validated['player_id'], $validated['language'], $validated['source']);

        return response()->json(['race' => $race->toBroadcast()]);
    }

    public function leave(Request $request, TypingRace $race): JsonResponse
    {
        $race = $this->races->leave($race, $this->playerId($request));

        return response()->json(['race' => $race?->toBroadcast()]);
    }

    public function start(Request $request, TypingRace $race): JsonResponse
    {
        $race = $this->races->start($race, $this->playerId($request));

        return response()->json(['race' => $race->toBroadcast()]);
    }

    public function progress(Request $request, TypingRace $race): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|integer',
            'typed' => 'present|nullable|string|max:2000',
            'keystrokes' => 'required|integer|min:0',
            'errors' => 'required|integer|min:0|lte:keystrokes',
        ]);

        $race = $this->races->progress(
            $race,
            (int) $validated['player_id'],
            $validated['typed'] ?? '',
            (int) $validated['keystrokes'],
            (int) $validated['errors'],
        );

        return response()->json(['race' => $race->toBroadcast()]);
    }

    private function playerId(Request $request): int
    {
        return (int) $request->validate(['player_id' => 'required|integer'])['player_id'];
    }
}
