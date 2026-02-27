<?php

namespace App\Games\Archery\Controllers;

use App\Games\Archery\Models\ArcheryGame;
use App\Games\Archery\Services\BonusCalculationService;
use App\Games\Archery\Services\PrecisionService;
use App\Games\Archery\Services\TargetScoringService;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ArcheryApiController extends Controller
{
    public function __construct(
        private TargetScoringService $scoringService,
        private BonusCalculationService $bonusService,
        private PrecisionService $precisionService
    ) {}

    public function submitGame(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|exists:players,id',
            'arrows' => 'required|array|size:4',
            'arrows.*.x' => 'required|numeric',
            'arrows.*.y' => 'required|numeric',
            'target_numbers' => 'required|array|size:4',
            'target_numbers.*' => 'required|integer|min:6|max:10',
        ]);

        $scoredArrows = $this->scoringService->scoreArrows($validated['arrows']);
        $baseScore = array_sum(array_column($scoredArrows, 'score'));
        $bonusResult = $this->bonusService->calculateBonuses($scoredArrows, $validated['target_numbers']);
        $bonusScore = $bonusResult['total'];

        $game = ArcheryGame::create([
            'player_id' => $validated['player_id'],
            'arrow_data' => $scoredArrows,
            'target_numbers' => $validated['target_numbers'],
            'base_score' => $baseScore,
            'bonus_score' => $bonusScore,
            'total_score' => $baseScore + $bonusScore,
        ]);

        $game->load('player');

        $gameArray = $game->toArray();
        $gameArray['bonuses_applied'] = $bonusResult['applied'];

        return response()->json($gameArray, 201);
    }

    public function weeklyLeaderboard(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year' => 'nullable|integer|min:2020|max:2100',
            'week' => 'nullable|integer|min:1|max:53',
        ]);

        $year = $validated['year'] ?? now()->year;
        $week = $validated['week'] ?? now()->weekOfYear;

        $startDate = now()->setISODate($year, $week)->startOfWeek();
        $endDate = now()->setISODate($year, $week)->endOfWeek();

        $leaderboard = ArcheryGame::query()
            ->select(
                'player_id',
                DB::raw('COUNT(*) as games_played'),
                DB::raw('SUM(total_score) as total_score'),
                DB::raw('ROUND(AVG(total_score), 2) as avg_score'),
                DB::raw('MAX(total_score) as best_game')
            )
            ->whereBetween('created_at', [$startDate, $endDate])
            ->groupBy('player_id')
            ->get()
            ->map(function ($item) {
                $player = Player::find($item->player_id);
                return [
                    'player_id' => $item->player_id,
                    'player_name' => $player->name,
                    'games_played' => $item->games_played,
                    'total_score' => $item->total_score,
                    'avg_score' => $item->avg_score,
                    'best_game' => $item->best_game,
                ];
            })
            ->sort(function ($a, $b) {
                if ($b['best_game'] !== $a['best_game']) {
                    return $b['best_game'] <=> $a['best_game'];
                }
                return $b['avg_score'] <=> $a['avg_score'];
            })
            ->values();

        return response()->json([
            'year' => $year,
            'week' => $week,
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'leaderboard' => $leaderboard,
        ]);
    }

    public function players(): JsonResponse
    {
        return response()->json(Player::orderBy('name')->get());
    }

    public function bonuses(): JsonResponse
    {
        return response()->json($this->bonusService->getAllBonuses());
    }

    public function playerGames(Request $request, int $id): JsonResponse
    {
        $player = Player::findOrFail($id);

        $validated = $request->validate([
            'year' => 'nullable|integer|min:2020|max:2100',
            'week' => 'nullable|integer|min:1|max:53',
        ]);

        $query = ArcheryGame::where('player_id', $id)
            ->orderBy('created_at', 'desc');

        if (isset($validated['year']) && isset($validated['week'])) {
            $startDate = now()->setISODate($validated['year'], $validated['week'])->startOfWeek();
            $endDate = now()->setISODate($validated['year'], $validated['week'])->endOfWeek();
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        $games = $query->get()->map(function ($game) {
            $bonusResult = $this->bonusService->calculateBonuses($game->arrow_data, $game->target_numbers ?? []);
            return [
                'id' => $game->id,
                'base_score' => $game->base_score,
                'bonus_score' => $game->bonus_score,
                'total_score' => $game->total_score,
                'arrow_data' => $game->arrow_data,
                'target_numbers' => $game->target_numbers,
                'bonuses_applied' => $bonusResult['applied'],
                'created_at' => $game->created_at->format('Y-m-d H:i:s'),
                'created_at_formatted' => $game->created_at->format('M j, Y g:i A'),
            ];
        });

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'games' => $games,
        ]);
    }

    public function playerTopBonuses(int $id): JsonResponse
    {
        $player = Player::findOrFail($id);
        $games = ArcheryGame::where('player_id', $id)->get();

        $bonusCounts = [];
        foreach ($games as $game) {
            $bonusResult = $this->bonusService->calculateBonuses($game->arrow_data, $game->target_numbers ?? []);
            foreach ($bonusResult['applied'] as $bonus) {
                $name = $bonus['name'];
                $bonusCounts[$name] = ($bonusCounts[$name] ?? 0) + 1;
            }
        }

        arsort($bonusCounts);
        $topBonuses = [];
        foreach (array_slice($bonusCounts, 0, 3, true) as $name => $count) {
            $topBonuses[] = ['name' => $name, 'count' => $count];
        }

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'top_bonuses' => $topBonuses,
        ]);
    }

    public function playerWeeklyAverages(int $id): JsonResponse
    {
        $player = Player::findOrFail($id);
        $games = ArcheryGame::where('player_id', $id)->orderBy('created_at', 'asc')->get();

        $currentYear = now()->year;
        $currentWeek = now()->weekOfYear;
        $weeklyData = [];

        foreach ($games as $game) {
            $year = $game->created_at->year;
            $week = $game->created_at->weekOfYear;

            if ($year === $currentYear && $week === $currentWeek) {
                continue;
            }

            $weekKey = "{$year}-W{$week}";
            if (!isset($weeklyData[$weekKey])) {
                $weeklyData[$weekKey] = ['year' => $year, 'week' => $week, 'total_score' => 0, 'game_count' => 0];
            }
            $weeklyData[$weekKey]['total_score'] += $game->total_score;
            $weeklyData[$weekKey]['game_count']++;
        }

        $result = [];
        foreach ($weeklyData as $data) {
            $average = $data['game_count'] > 0 ? round($data['total_score'] / $data['game_count'], 2) : 0;
            $startDate = now()->setISODate($data['year'], $data['week'])->startOfWeek();
            $endDate = now()->setISODate($data['year'], $data['week'])->endOfWeek();

            $result[] = [
                'week_label' => $startDate->format('M j') . ' - ' . $endDate->format('M j'),
                'year' => $data['year'],
                'week' => $data['week'],
                'average' => $average,
                'game_count' => $data['game_count'],
            ];
        }

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'weekly_averages' => $result,
        ]);
    }

    public function playerWeeklyPrecision(int $id): JsonResponse
    {
        $player = Player::findOrFail($id);
        $games = ArcheryGame::where('player_id', $id)->orderBy('created_at', 'asc')->get();

        $currentYear = now()->year;
        $currentWeek = now()->weekOfYear;
        $weeklyData = [];

        foreach ($games as $game) {
            $year = $game->created_at->year;
            $week = $game->created_at->weekOfYear;

            if ($year === $currentYear && $week === $currentWeek) {
                continue;
            }

            $weekKey = "{$year}-W{$week}";
            if (!isset($weeklyData[$weekKey])) {
                $weeklyData[$weekKey] = ['year' => $year, 'week' => $week, 'total_precision' => 0, 'arrow_count' => 0];
            }

            $arrows = $game->arrow_data ?? [];
            foreach ($arrows as $arrow) {
                $score = $arrow['score'] ?? 0;
                $weeklyData[$weekKey]['total_precision'] += $this->precisionService->calculateArrowPrecision($score);
                $weeklyData[$weekKey]['arrow_count']++;
            }
        }

        $result = [];
        foreach ($weeklyData as $data) {
            $rawPrecision = $data['arrow_count'] > 0 ? $data['total_precision'] / $data['arrow_count'] : 0;
            $precisionPercentage = round(($rawPrecision / 5) * 100, 2);

            $startDate = now()->setISODate($data['year'], $data['week'])->startOfWeek();
            $endDate = now()->setISODate($data['year'], $data['week'])->endOfWeek();

            $result[] = [
                'week_label' => $startDate->format('M j') . ' - ' . $endDate->format('M j'),
                'year' => $data['year'],
                'week' => $data['week'],
                'precision' => $precisionPercentage,
                'arrow_count' => $data['arrow_count'],
            ];
        }

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'weekly_precision' => $result,
        ]);
    }
}
