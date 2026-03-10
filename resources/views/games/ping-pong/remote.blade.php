<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Ping Pong Remote</title>
    <script src="https://cdn.tailwindcss.com"></script>
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
            transition: opacity 0.1s;
        }

        .action-btn:active {
            opacity: 0.7;
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
            gap: 16px;
            padding: 24px;
            text-align: center;
        }

        .gameover-display .result {
            font-size: 2rem;
            font-weight: 900;
        }

        .gameover-display .final-score {
            font-size: 3rem;
            font-weight: 800;
        }

        /* Landscape lock: rotate when in portrait */
        @media (orientation: portrait) {
            html {
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
        function addTouchHandler(el, handler) {
            el.addEventListener('touchstart', function(e) {
                e.preventDefault();
                handler();
            }, { passive: false });
            el.addEventListener('click', function(e) {
                // Fallback for non-touch devices
                if (e.pointerType !== 'touch') handler();
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

            buttonArea.style.display = 'none';
            gameoverArea.style.display = 'flex';

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

            resultText.textContent = winnerName + ' Wins!';
            finalScore.innerHTML =
                '<span style="color:#fb7185">' + data.player_left_score + '</span>' +
                '<span style="color:rgba(255,255,255,0.3)"> - </span>' +
                '<span style="color:#22d3ee">' + data.player_right_score + '</span>';
        }

        async function pollMatch() {
            if (isComplete) return;
            try {
                const res = await fetch(`${API}/matches/${MATCH_ID}`);
                const data = await res.json();

                if (data.player_left_score !== currentLeftScore ||
                    data.player_right_score !== currentRightScore ||
                    data.is_complete) {
                    renderMatch(data);
                }
            } catch (err) {
                // Silently ignore
            }
        }

        function startPolling() {
            stopPolling();
            pollTimer = setInterval(pollMatch, 2000);
        }

        function stopPolling() {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        }

        // Initial load
        async function init() {
            try {
                const res = await fetch(`${API}/matches/${MATCH_ID}`);
                const data = await res.json();
                renderMatch(data);
            } catch (err) {
                playerNames.textContent = 'Error loading match';
            }
            startPolling();
        }

        init();
    </script>
</body>
</html>
