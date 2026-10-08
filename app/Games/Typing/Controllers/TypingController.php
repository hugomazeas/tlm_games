<?php

namespace App\Games\Typing\Controllers;

use App\Games\Typing\Models\TypingTest;
use App\Games\Typing\Services\TypingContent;
use App\Games\Typing\Services\TypingScorer;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

class TypingController extends Controller
{
    public const SOLO_SECONDS = 30;

    public const SOLO_WORDS = 150;

    public function play(): View
    {
        return view('games.typing.play', [
            'players' => Player::orderBy('name')->get(),
            'recent' => TypingTest::submitted()->with('player')->latest('submitted_at')->limit(10)->get(),
            'soloSeconds' => self::SOLO_SECONDS,
        ]);
    }

    public function issue(Request $request, TypingContent $content): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|exists:players,id',
            'language' => ['required', Rule::in(TypingContent::LANGUAGES)],
            'source' => ['required', Rule::in(TypingContent::SOURCES)],
            'restarted_test_id' => 'nullable|integer',
        ]);

        // The client names the test it abandoned after typing in it; only a
        // pending solo test of the same player can be marked.
        if ($validated['restarted_test_id'] ?? null) {
            TypingTest::whereKey($validated['restarted_test_id'])
                ->where('player_id', $validated['player_id'])
                ->whereNull('typing_race_id')
                ->whereNull('submitted_at')
                ->whereNull('restarted_at')
                ->update(['restarted_at' => now()]);
        }
        unset($validated['restarted_test_id']);

        $text = $content->text($validated['language'], $validated['source'], self::SOLO_WORDS);

        $test = TypingTest::create([
            ...$validated,
            'text' => $text['text'],
            'issued_at' => now(),
        ]);

        return response()->json([
            'id' => $test->id,
            'text' => $test->text,
            'attribution' => $text['attribution'],
        ]);
    }

    public function submit(Request $request, TypingTest $test, TypingScorer $scorer): JsonResponse
    {
        $validated = $request->validate([
            'typed' => 'present|nullable|string|max:5000',
            'keystrokes' => 'required|integer|min:0',
            'errors' => 'required|integer|min:0|lte:keystrokes',
        ]);

        abort_if($test->typing_race_id !== null || $test->submitted_at !== null, 409, 'This test was already submitted.');
        abort_if($test->issued_at->diffInSeconds(now(), true) < self::SOLO_SECONDS, 422, 'Submitted before the test could have ended.');

        $typed = $validated['typed'] ?? '';
        $ms = self::SOLO_SECONDS * 1000;
        $wpm = $scorer->wpm($scorer->correctChars($test->text, $typed), $ms);

        abort_if($wpm > TypingScorer::MAX_WPM, 422, 'That is faster than humanly plausible.');

        $test->update([
            'typed' => $typed,
            'wpm' => $wpm,
            'raw_wpm' => $scorer->wpm(mb_strlen($typed), $ms),
            'accuracy' => $scorer->accuracy($validated['keystrokes'], $validated['errors'], $test->text, $typed),
            'duration_ms' => $ms,
            'submitted_at' => now(),
        ]);

        return response()->json($test->only('id', 'wpm', 'raw_wpm', 'accuracy'));
    }
}
