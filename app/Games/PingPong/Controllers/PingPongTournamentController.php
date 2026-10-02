<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Events\LiveMatchStarted;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongTournament;
use App\Games\PingPong\Services\TournamentService;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Http\Controllers\Controller;
use App\Jobs\SendMatchStartedNotificationJob;
use App\Models\Player;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\View\View;

class PingPongTournamentController extends Controller
{
    public function __construct(private TournamentService $tournamentService) {}

    /**
     * Step 1: past tournaments + pick the players for a new one.
     */
    public function index(): View
    {
        return view('games.ping-pong.tournaments', [
            'tournaments' => PingPongTournament::with('winner')->latest()->get(),
            'players' => Player::orderBy('name')->get(),
        ]);
    }

    /**
     * Step 2: build the bracket and its match list.
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'player_ids' => 'required|array|min:2|max:64',
            'player_ids.*' => 'integer|distinct|exists:players,id',
        ]);

        $tournament = $this->tournamentService->create(
            $validated['name'],
            array_map('intval', $validated['player_ids']),
        );

        return redirect('/games/ping-pong/tournaments/'.$tournament->id);
    }

    public function show(int $id): View
    {
        $tournament = PingPongTournament::with(['winner', 'bracket.playerLeft', 'bracket.playerRight', 'bracket.winner', 'bracket.match'])
            ->findOrFail($id);

        return view('games.ping-pong.tournament', [
            'tournament' => $tournament,
            'rounds' => $tournament->bracket->groupBy('round'),
            'nextSlot' => $this->tournamentService->nextSlot($tournament),
        ]);
    }

    /**
     * Step 3: put the next bracket match on the table (or resume the one in progress).
     */
    public function playNext(int $id, VideoRecordingService $videoRecordingService): RedirectResponse
    {
        $tournament = PingPongTournament::findOrFail($id);
        $slot = $this->tournamentService->nextSlot($tournament);

        if (! $slot) {
            return redirect('/games/ping-pong/tournaments/'.$tournament->id);
        }

        if ($slot->match && ! $slot->match->is_complete) {
            return redirect('/games/ping-pong/matches/'.$slot->match->id.'/scoreboard');
        }

        $firstServerId = collect([$slot->player_left_id, $slot->player_right_id])->random();

        $match = PingPongMatch::create([
            'mode' => '1v1',
            'tournament_id' => $tournament->id,
            'player_left_id' => $slot->player_left_id,
            'player_right_id' => $slot->player_right_id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'first_server_id' => $firstServerId,
            'current_server_id' => $firstServerId,
            'serve_count' => 0,
            'started_at' => now(),
            'last_score_activity_at' => now(),
        ]);
        $slot->update(['match_id' => $match->id]);

        $match->load(['playerLeft', 'playerRight', 'currentServer']);

        try {
            $videoRecordingService->startRecording($match);
        } catch (\Throwable $e) {
            Log::warning('Failed to start recording', ['match_id' => $match->id, 'error' => $e->getMessage()]);
        }

        broadcast(new LiveMatchStarted($match));
        SendMatchStartedNotificationJob::dispatch($match->id);

        return redirect('/games/ping-pong/matches/'.$match->id.'/scoreboard');
    }
}
