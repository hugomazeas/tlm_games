<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\PointAwardsService;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\Request;

class PingPongController extends Controller
{
    public function play()
    {
        return view('games.ping-pong.play');
    }

    public function awardDetail(Request $request, string $key, PointAwardsService $service)
    {
        $window = $request->query('window') === 'all' ? 'all' : 'month';
        $detail = $service->getAwardDetail($key, $window);

        abort_if($detail === null, 404);

        return view('games.ping-pong.award-detail', compact('detail', 'window'));
    }

    public function lobbyJoin(string $code)
    {
        $lobby = PingPongLobby::where('code', $code)->firstOrFail();

        return view('games.ping-pong.join', [
            'lobbyCode' => $lobby->code,
            'lobbyMode' => $lobby->mode,
            'remoteUrl' => config('games.remote_url'),
        ]);
    }

    public function challenges()
    {
        // Far enough back to cover a working day without dragging yesterday
        // afternoon's draws onto this morning's page.
        $earliest = now()->subHours(12);

        return view('games.ping-pong.challenges', [
            'challenges' => PingPongChallenge::with(['office', 'playerOne', 'playerTwo', 'lobby'])
                ->live()
                ->orderBy('scheduled_for')
                ->get(),
            'recent' => PingPongChallenge::with(['playerOne', 'playerTwo'])
                ->where('scheduled_for', '>=', $earliest)
                ->whereIn('status', ['played', 'declined', 'expired', 'superseded'])
                ->latest('scheduled_for')
                ->take(8)
                ->get(),
        ]);
    }

    public function playerStats(int $id)
    {
        $player = Player::findOrFail($id);

        return view('games.ping-pong.player', compact('player'));
    }

    public function matchup(int $playerA, int $playerB)
    {
        abort_if($playerA === $playerB, 404);

        return view('games.ping-pong.matchup', [
            'playerA' => Player::findOrFail($playerA),
            'playerB' => Player::findOrFail($playerB),
        ]);
    }

    public function stats()
    {
        return view('games.ping-pong.stats');
    }

    public function watch()
    {
        return view('games.ping-pong.watch');
    }

    public function recordings()
    {
        return view('games.ping-pong.recordings');
    }

    public function matchDetail(int $id)
    {
        $match = PingPongMatch::findOrFail($id);

        return view('games.ping-pong.match-detail', [
            'matchId' => $match->id,
        ]);
    }

    public function scoreboard(int $id)
    {
        $match = PingPongMatch::findOrFail($id);

        if ($match->is_complete) {
            return redirect('/games/ping-pong/matches/'.$match->id);
        }

        return view('games.ping-pong.play', [
            'preloadedMatchId' => $match->id,
        ]);
    }

    /**
     * The chrome-less live view, for embedding in Slack, YouTube or any iframe.
     *
     * Framing is opt-in here and nowhere else, so it says so explicitly rather
     * than relying on the absence of a header. `frame-ancestors` is the
     * directive browsers actually honour; `ALLOWALL` is not a real
     * X-Frame-Options value, but it is what older embedders look for and an
     * unrecognised value is ignored rather than treated as DENY.
     */
    public function embedLive()
    {
        return response()
            ->view('games.ping-pong.embed-live')
            ->header('X-Frame-Options', 'ALLOWALL')
            ->header('Content-Security-Policy', 'frame-ancestors *');
    }

    public function remote(int $id, string $side)
    {
        abort_unless(in_array($side, ['left', 'right']), 404);

        $match = PingPongMatch::findOrFail($id);

        return view('games.ping-pong.remote', [
            'matchId' => $match->id,
            'side' => $side,
            'remoteUrl' => config('games.remote_url'),
        ]);
    }
}
