<?php

namespace App\Games\Typing\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\Typing\Models\TypingTest;
use App\Models\Player;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AverageWpmProvider implements LeaderboardProviderInterface
{
    private const LANGUAGE_LABELS = ['fr' => 'Français', 'en' => 'English'];

    public function getGameTypeSlug(): string
    {
        return 'typing';
    }

    public function getGameModeSlug(): string
    {
        return 'average-wpm';
    }

    public function getLeaderboard(): Collection
    {
        $rows = TypingTest::submitted()
            ->select(
                'player_id',
                DB::raw('COUNT(*) as tests_count'),
                DB::raw('AVG(wpm) as avg_wpm'),
                DB::raw('AVG(accuracy) as avg_accuracy')
            )
            ->groupBy('player_id')
            ->orderByDesc('avg_wpm')
            ->orderByDesc('avg_accuracy')
            ->get();

        $names = Player::whereIn('id', $rows->pluck('player_id'))->pluck('name', 'id');
        $languages = $this->favouriteLanguages($rows->pluck('player_id')->all());
        $restarts = $this->restarts($rows->pluck('player_id')->all());

        return $rows->map(fn ($row) => [
            'player_id' => $row->player_id,
            'player_name' => $names[$row->player_id] ?? '?',
            'avg_wpm' => round((float) $row->avg_wpm, 1),
            'avg_accuracy' => round((float) $row->avg_accuracy, 1),
            'language' => self::LANGUAGE_LABELS[$languages[$row->player_id]] ?? null,
            'tests_count' => (int) $row->tests_count,
            'restarts' => $restarts[$row->player_id] ?? 0,
        ])->values();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $stats = TypingTest::submitted()
            ->where('player_id', $playerId)
            ->select(
                DB::raw('COUNT(*) as tests_count'),
                DB::raw('AVG(wpm) as avg_wpm'),
                DB::raw('AVG(accuracy) as avg_accuracy'),
                DB::raw('MAX(wpm) as best_wpm')
            )
            ->first();

        if (! $stats || (int) $stats->tests_count === 0) {
            return null;
        }

        return [
            'Avg WPM' => round((float) $stats->avg_wpm, 1),
            'Accuracy' => round((float) $stats->avg_accuracy, 1),
            'Best WPM' => round((float) $stats->best_wpm, 1),
            'Tests' => (int) $stats->tests_count,
            'Language' => self::LANGUAGE_LABELS[$this->favouriteLanguages([$playerId])[$playerId]],
            'Restarts' => $this->restarts([$playerId])[$playerId] ?? 0,
        ];
    }

    /**
     * Solo tests each player started typing and then abandoned.
     *
     * @param  list<int>  $playerIds
     * @return array<int, int>
     */
    private function restarts(array $playerIds): array
    {
        return TypingTest::whereNotNull('restarted_at')
            ->whereIn('player_id', $playerIds)
            ->groupBy('player_id')
            ->selectRaw('player_id, COUNT(*) as restarts')
            ->pluck('restarts', 'player_id')
            ->map(fn ($count) => (int) $count)
            ->all();
    }

    /**
     * The language each player has the most results in; ties go to the
     * language of their most recent result.
     *
     * @param  list<int>  $playerIds
     * @return array<int, string>
     */
    private function favouriteLanguages(array $playerIds): array
    {
        return TypingTest::submitted()
            ->whereIn('player_id', $playerIds)
            ->select('player_id', 'language', DB::raw('COUNT(*) as tests_count'), DB::raw('MAX(submitted_at) as last_at'))
            ->groupBy('player_id', 'language')
            ->get()
            ->groupBy('player_id')
            ->map(fn (Collection $perLanguage) => $perLanguage->sortByDesc(fn ($row) => [(int) $row->tests_count, $row->last_at])->first()->language)
            ->all();
    }
}
