<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Ping Pong Remote</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            height: 100%;
            overflow: hidden;
            font-family: 'Inter', sans-serif;
            background: #0f172a;
            color: white;
            touch-action: manipulation;
            -webkit-user-select: none;
            user-select: none;
        }

        .remote-container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .score-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 8px 16px;
            flex-shrink: 0;
            border-bottom: 2px solid;
        }

        .score-bar.left-side {
            border-color: #fb7185;
            background: rgba(244, 63, 94, 0.1);
        }

        .score-bar.right-side {
            border-color: #22d3ee;
            background: rgba(6, 182, 212, 0.1);
        }

        .score-bar .names {
            font-weight: 700;
            font-size: 1rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .score-bar .score {
            font-size: 1.5rem;
            font-weight: 900;
            font-family: monospace;
            letter-spacing: 2px;
        }

        .score-bar .side-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            opacity: 0.6;
        }

        .button-area {
            display: flex;
            flex: 1;
            min-height: 0;
        }

        .action-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 4rem;
            font-weight: 900;
            cursor: pointer;
            border: none;
            transition: transform 0.1s ease, filter 0.1s ease, opacity 0.1s;
            position: relative;
            overflow: hidden;
        }

        .action-btn:active {
            transform: scale(0.95);
            filter: brightness(1.3);
            opacity: 0.9;
        }

        .action-btn.tapped {
            transform: scale(0.95);
            filter: brightness(1.3);
        }

        .action-btn.tapped::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 120%;
            height: 120%;
            background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.4s ease-out forwards;
            pointer-events: none;
        }

        @keyframes ripple {
            0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }

        .action-btn.plus {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
            border-right: 1px solid rgba(255,255,255,0.1);
        }

        .action-btn.minus {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }

        .action-btn.disabled {
            opacity: 0.3;
            pointer-events: none;
        }

        .gameover-display {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 16px;
            text-align: center;
            overflow-y: auto;
        }

        .gameover-display .result {
            font-size: 1.6rem;
            font-weight: 900;
        }

        .gameover-display .final-score {
            font-size: 2.4rem;
            font-weight: 800;
        }

        .elo-section {
            width: 100%;
            max-width: 500px;
            margin-top: 8px;
        }

        .elo-section-title {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            opacity: 0.5;
            margin-bottom: 8px;
        }

        .elo-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-radius: 10px;
            background: rgba(255,255,255,0.05);
            margin-bottom: 6px;
        }

        .elo-row .elo-name {
            font-weight: 700;
            font-size: 0.9rem;
            flex: 1;
        }

        .elo-row .elo-rating {
            font-size: 0.85rem;
            opacity: 0.6;
            margin-right: 10px;
        }

        .elo-row .elo-change {
            font-weight: 900;
            font-size: 1rem;
            min-width: 50px;
            text-align: right;
        }

        .elo-positive { color: #22c55e; }
        .elo-negative { color: #ef4444; }

        /* Landscape lock: rotate when in portrait (only during play) */
        @media (orientation: portrait) {
            html:not(.portrait-mode) {
                transform: rotate(90deg);
                transform-origin: top left;
                width: 100vh;
                height: 100vw;
                position: absolute;
                top: 0;
                left: 100%;
                overflow: hidden;
            }
        }

        /* Portrait game-over styles */
        html.portrait-mode, html.portrait-mode body {
            height: auto;
            min-height: 100%;
            overflow: auto;
        }

        .gameover-portrait {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 24px 16px;
            text-align: center;
            overflow-y: auto;
            min-height: 100vh;
        }

        .gameover-portrait .result {
            font-size: 2.4rem;
            font-weight: 900;
            background: linear-gradient(135deg, #3b82f6, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .gameover-portrait .final-score {
            font-size: 4rem;
            font-weight: 800;
        }

        .gameover-portrait .elo-section-title {
            font-size: 0.9rem;
        }

        .gameover-portrait .elo-row .elo-name {
            font-size: 1.05rem;
        }

        .gameover-portrait .elo-row .elo-rating {
            font-size: 1rem;
        }

        .gameover-portrait .elo-row .elo-change {
            font-size: 1.2rem;
        }

        .leaderboard-section {
            width: 100%;
            max-width: 400px;
            margin-top: 8px;
        }

        .leaderboard-section-title {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            opacity: 0.5;
            margin-bottom: 10px;
        }

        .leaderboard-row {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            border-radius: 10px;
            background: rgba(255,255,255,0.05);
            margin-bottom: 6px;
            gap: 10px;
        }

        .leaderboard-row .lb-rank {
            font-weight: 900;
            font-size: 1rem;
            color: rgba(255,255,255,0.4);
            min-width: 28px;
            text-align: center;
        }

        .leaderboard-row .lb-name {
            font-weight: 700;
            font-size: 1.05rem;
            flex: 1;
        }

        .leaderboard-row .lb-elo {
            font-weight: 700;
            font-size: 1rem;
            color: rgba(255,255,255,0.7);
        }

        .leaderboard-row .lb-record {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.4);
        }

        .leaderboard-row .lb-elo-change {
            font-weight: 800;
            font-size: 0.85rem;
            min-width: 40px;
            text-align: right;
        }

        .leaderboard-row.highlight {
            background: rgba(59, 130, 246, 0.15);
            border: 1px solid rgba(59, 130, 246, 0.3);
            box-shadow: 0 0 12px rgba(59, 130, 246, 0.1);
        }

        .leaderboard-row .streak-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 999px;
            font-weight: 700;
            font-size: 0.85rem;
            margin-left: 6px;
        }

        .leaderboard-row .streak-badge.W {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
        }

        .leaderboard-row .streak-badge.L {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }
    </style>
</head>
<body>
    <div class="remote-container" id="app">
        <!-- Score bar -->
        <div class="score-bar" id="scoreBar">
            <span class="names" id="playerNames">Loading...</span>
            <span class="score" id="scoreDisplay">0 - 0</span>
            <span class="side-label" id="sideLabel"></span>
        </div>

        <!-- Buttons (shown during play) -->
        <div class="button-area" id="buttonArea">
            <button class="action-btn plus" id="btnPlus">+1</button>
            <button class="action-btn minus" id="btnMinus">-1</button>
        </div>

        <!-- Game over (hidden initially) -->
        <div class="gameover-display" id="gameoverArea" style="display: none;">
            <div class="result" id="resultText"></div>
            <div class="final-score" id="finalScore"></div>
            <div class="elo-section" id="eloSection" style="display: none;"></div>
        </div>

        <!-- Portrait game over (hidden initially) -->
        <div class="gameover-portrait" id="gameoverPortrait" style="display: none;">
            <div class="result" id="resultTextPortrait"></div>
            <div class="final-score" id="finalScorePortrait"></div>
            <div class="elo-section" id="eloSectionPortrait" style="display: none;"></div>
            <div class="leaderboard-section" id="leaderboardSection" style="display: none;"></div>
        </div>
    </div>

    <script>
        const MATCH_ID = {{ $matchId }};
        const SIDE = '{{ $side }}';
        const API = '/games/ping-pong/api';
        const CSRF = document.querySelector('meta[name="csrf-token"]').content;

        let isUpdating = false;
        let isComplete = false;
        let pollTimer = null;
        let currentLeftScore = 0;
        let currentRightScore = 0;

        // DOM elements
        const scoreBar = document.getElementById('scoreBar');
        const playerNames = document.getElementById('playerNames');
        const scoreDisplay = document.getElementById('scoreDisplay');
        const sideLabel = document.getElementById('sideLabel');
        const buttonArea = document.getElementById('buttonArea');
        const gameoverArea = document.getElementById('gameoverArea');
        const resultText = document.getElementById('resultText');
        const finalScore = document.getElementById('finalScore');
        const btnPlus = document.getElementById('btnPlus');
        const btnMinus = document.getElementById('btnMinus');

        // Setup side styling
        scoreBar.classList.add(SIDE === 'left' ? 'left-side' : 'right-side');
        sideLabel.textContent = SIDE === 'left' ? 'LEFT' : 'RIGHT';

        // Touch events for faster response
        function addTapFeedback(el) {
            el.classList.add('tapped');
            setTimeout(() => el.classList.remove('tapped'), 300);
        }

        function addTouchHandler(el, handler) {
            el.addEventListener('touchstart', function(e) {
                e.preventDefault();
                addTapFeedback(el);
                handler();
            }, { passive: false });
            el.addEventListener('click', function(e) {
                // Fallback for non-touch devices
                if (e.pointerType !== 'touch') {
                    addTapFeedback(el);
                    handler();
                }
            });
        }

        addTouchHandler(btnPlus, () => updateScore('increment'));
        addTouchHandler(btnMinus, () => updateScore('decrement'));

        async function updateScore(action) {
            if (isUpdating || isComplete) return;
            isUpdating = true;

            if (navigator.vibrate) navigator.vibrate(50);

            try {
                const res = await fetch(`${API}/matches/${MATCH_ID}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': CSRF
                    },
                    body: JSON.stringify({ side: SIDE, action: action }),
                });
                const data = await res.json();

                if (res.ok) {
                    renderMatch(data);
                }
            } catch (err) {
                // Silently ignore
            }
            isUpdating = false;
        }

        function renderMatch(data) {
            currentLeftScore = data.player_left_score;
            currentRightScore = data.player_right_score;
            scoreDisplay.textContent = `${currentLeftScore} - ${currentRightScore}`;

            // Player names
            let names = '';
            if (data.mode === '2v2') {
                const leftNames = (data.player_left?.name || '?') + ' & ' + (data.team_left_player2?.name || '?');
                const rightNames = (data.player_right?.name || '?') + ' & ' + (data.team_right_player2?.name || '?');
                names = leftNames + '  vs  ' + rightNames;
            } else {
                names = (data.player_left?.name || '?') + '  vs  ' + (data.player_right?.name || '?');
            }
            playerNames.textContent = names;

            if (data.is_complete) {
                handleGameOver(data);
            }
        }

        function handleGameOver(data) {
            isComplete = true;
            stopPolling();

            // Switch to portrait mode
            document.documentElement.classList.add('portrait-mode');

            buttonArea.style.display = 'none';
            scoreBar.style.display = 'none';
            gameoverArea.style.display = 'none';

            const gameoverPortrait = document.getElementById('gameoverPortrait');
            gameoverPortrait.style.display = 'flex';

            const leftWon = data.winner_id === data.player_left_id;
            let winnerName;
            if (data.mode === '2v2') {
                winnerName = leftWon
                    ? (data.player_left?.name || '?') + ' & ' + (data.team_left_player2?.name || '?')
                    : (data.player_right?.name || '?') + ' & ' + (data.team_right_player2?.name || '?');
            } else {
                winnerName = leftWon
                    ? (data.player_left?.name || '?')
                    : (data.player_right?.name || '?');
            }

            // Populate portrait elements
            document.getElementById('resultTextPortrait').textContent = winnerName + ' Wins!';
            document.getElementById('finalScorePortrait').innerHTML =
                '<span style="color:#fb7185">' + data.player_left_score + '</span>' +
                '<span style="color:rgba(255,255,255,0.3)"> - </span>' +
                '<span style="color:#22d3ee">' + data.player_right_score + '</span>';

            // Render elo changes in portrait section
            renderEloChangesPortrait(data);

            // Fetch and render leaderboard
            fetchLeaderboard(data);
        }

        function renderEloChanges(data) {
            const elo = data.elo_changes;
            if (!elo) return;

            const eloSection = document.getElementById('eloSection');
            let html = '<div class="elo-section-title">Elo Changes</div>';

            if (data.mode === '2v2') {
                // Left team
                const leftTeamLabel = (data.player_left?.name || '?') + ' & ' + (data.team_left_player2?.name || '?');
                const lc = elo.left;
                html += eloTeamRow(leftTeamLabel, lc.team_avg_before, lc.team_avg_after, lc.change, '#fb7185');
                html += eloPlayerRow(data.player_left?.name || '?', lc.player1.before, lc.player1.after);
                html += eloPlayerRow(data.team_left_player2?.name || '?', lc.player2.before, lc.player2.after);

                // Right team
                const rightTeamLabel = (data.player_right?.name || '?') + ' & ' + (data.team_right_player2?.name || '?');
                const rc = elo.right;
                html += '<div style="height:6px"></div>';
                html += eloTeamRow(rightTeamLabel, rc.team_avg_before, rc.team_avg_after, rc.change, '#22d3ee');
                html += eloPlayerRow(data.player_right?.name || '?', rc.player1.before, rc.player1.after);
                html += eloPlayerRow(data.team_right_player2?.name || '?', rc.player2.before, rc.player2.after);
            } else {
                // 1v1
                const lc = elo.left;
                const rc = elo.right;
                html += eloPlayerRow(data.player_left?.name || '?', lc.before, lc.after, '#fb7185');
                html += eloPlayerRow(data.player_right?.name || '?', rc.before, rc.after, '#22d3ee');
            }

            eloSection.innerHTML = html;
            eloSection.style.display = 'block';
        }

        function eloTeamRow(name, before, after, change, color) {
            const sign = change >= 0 ? '+' : '';
            const cls = change >= 0 ? 'elo-positive' : 'elo-negative';
            return '<div class="elo-row" style="border-left: 3px solid ' + color + ';">' +
                '<span class="elo-name">' + name + '</span>' +
                '<span class="elo-rating">' + before + ' → ' + after + '</span>' +
                '<span class="elo-change ' + cls + '">' + sign + change + '</span>' +
                '</div>';
        }

        function eloPlayerRow(name, before, after, color) {
            const change = after - before;
            const sign = change >= 0 ? '+' : '';
            const cls = change >= 0 ? 'elo-positive' : 'elo-negative';
            const borderStyle = color ? 'border-left: 3px solid ' + color + ';' : 'margin-left: 16px; border-left: 2px solid rgba(255,255,255,0.1);';
            return '<div class="elo-row" style="' + borderStyle + '">' +
                '<span class="elo-name">' + name + '</span>' +
                '<span class="elo-rating">' + before + ' → ' + after + '</span>' +
                '<span class="elo-change ' + cls + '">' + sign + change + '</span>' +
                '</div>';
        }

        function renderEloChangesPortrait(data) {
            const elo = data.elo_changes;
            if (!elo) return;

            const eloSection = document.getElementById('eloSectionPortrait');
            let html = '<div class="elo-section-title">Elo Changes</div>';

            if (data.mode === '2v2') {
                const leftTeamLabel = (data.player_left?.name || '?') + ' & ' + (data.team_left_player2?.name || '?');
                const lc = elo.left;
                html += eloTeamRow(leftTeamLabel, lc.team_avg_before, lc.team_avg_after, lc.change, '#fb7185');
                html += eloPlayerRow(data.player_left?.name || '?', lc.player1.before, lc.player1.after);
                html += eloPlayerRow(data.team_left_player2?.name || '?', lc.player2.before, lc.player2.after);

                const rightTeamLabel = (data.player_right?.name || '?') + ' & ' + (data.team_right_player2?.name || '?');
                const rc = elo.right;
                html += '<div style="height:6px"></div>';
                html += eloTeamRow(rightTeamLabel, rc.team_avg_before, rc.team_avg_after, rc.change, '#22d3ee');
                html += eloPlayerRow(data.player_right?.name || '?', rc.player1.before, rc.player1.after);
                html += eloPlayerRow(data.team_right_player2?.name || '?', rc.player2.before, rc.player2.after);
            } else {
                const lc = elo.left;
                const rc = elo.right;
                html += eloPlayerRow(data.player_left?.name || '?', lc.before, lc.after, '#fb7185');
                html += eloPlayerRow(data.player_right?.name || '?', rc.before, rc.after, '#22d3ee');
            }

            eloSection.innerHTML = html;
            eloSection.style.display = 'block';
        }

        function getMatchPlayerIds(data) {
            const ids = new Set();
            if (data.player_left_id) ids.add(data.player_left_id);
            if (data.player_right_id) ids.add(data.player_right_id);
            if (data.team_left_player2_id) ids.add(data.team_left_player2_id);
            if (data.team_right_player2_id) ids.add(data.team_right_player2_id);
            return ids;
        }

        function getEloChangeForPlayer(data, playerId) {
            const elo = data.elo_changes;
            if (!elo) return null;

            if (data.mode === '2v2') {
                if (playerId === data.player_left_id) return elo.left.player1.after - elo.left.player1.before;
                if (playerId === data.team_left_player2_id) return elo.left.player2.after - elo.left.player2.before;
                if (playerId === data.player_right_id) return elo.right.player1.after - elo.right.player1.before;
                if (playerId === data.team_right_player2_id) return elo.right.player2.after - elo.right.player2.before;
            } else {
                if (playerId === data.player_left_id) return elo.left.after - elo.left.before;
                if (playerId === data.player_right_id) return elo.right.after - elo.right.before;
            }
            return null;
        }

        async function fetchLeaderboard(data) {
            const leaderboardSection = document.getElementById('leaderboardSection');
            const mode = data.mode === '2v2' ? '2v2' : '1v1';
            const matchPlayerIds = getMatchPlayerIds(data);

            try {
                const res = await fetch(`${API}/leaderboard?mode=${mode}`);
                const entries = await res.json();

                let html = '<div class="leaderboard-section-title">Leaderboard</div>';

                entries.forEach((entry, index) => {
                    const isMatchPlayer = matchPlayerIds.has(entry.player_id);
                    const highlightClass = isMatchPlayer ? ' highlight' : '';
                    const eloChange = isMatchPlayer ? getEloChangeForPlayer(data, entry.player_id) : null;

                    html += '<div class="leaderboard-row' + highlightClass + '">';
                    html += '<span class="lb-rank">#' + (index + 1) + '</span>';
                    html += '<span class="lb-name">' + entry.player_name + '</span>';
                    let recordHtml = entry.wins + 'W ' + entry.losses + 'L (' + entry.win_rate + '%)';
                    if (entry.win_streak > 0) {
                        recordHtml += ' <span class="streak-badge W">W' + entry.win_streak + '</span>';
                    } else if (entry.losing_streak > 0) {
                        recordHtml += ' <span class="streak-badge L">L' + entry.losing_streak + '</span>';
                    }
                    html += '<span class="lb-record">' + recordHtml + '</span>';
                    html += '<span class="lb-elo">' + entry.elo_rating + '</span>';

                    if (eloChange !== null) {
                        const sign = eloChange >= 0 ? '+' : '';
                        const cls = eloChange >= 0 ? 'elo-positive' : 'elo-negative';
                        html += '<span class="lb-elo-change ' + cls + '">' + sign + eloChange + '</span>';
                    }

                    html += '</div>';
                });

                leaderboardSection.innerHTML = html;
                leaderboardSection.style.display = 'block';
            } catch (err) {
                // Silently ignore leaderboard fetch errors
            }
        }

        let echoInstance = null;

        function subscribeToMatch() {
            echoInstance = new Echo({
                broadcaster: 'pusher',
                key: 'games-hub-key',
                wsHost: window.location.hostname,
                wsPort: window.location.port || 80,
                forceTLS: false,
                disableStats: true,
                enabledTransports: ['ws', 'wss'],
                cluster: 'mt1',
            });

            echoInstance.channel('ping-pong.match.' + MATCH_ID)
                .listen('.match.score-updated', function(e) {
                    const data = e.match;
                    if (data.player_left_score !== currentLeftScore ||
                        data.player_right_score !== currentRightScore ||
                        data.is_complete) {
                        renderMatch(data);
                    }
                });
        }

        function stopPolling() {
            // Kept for compatibility - now a no-op since we use WebSocket
        }

        // Register remote connection
        async function registerConnection() {
            try {
                await fetch(`${API}/matches/${MATCH_ID}/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': CSRF
                    },
                    body: JSON.stringify({ side: SIDE }),
                });
            } catch (err) {
                // Silently ignore
            }
        }

        // Initial load
        async function init() {
            await registerConnection();
            try {
                const res = await fetch(`${API}/matches/${MATCH_ID}`);
                const data = await res.json();
                renderMatch(data);
            } catch (err) {
                playerNames.textContent = 'Error loading match';
            }
            subscribeToMatch();
        }

        init();
    </script>
</body>
</html>
