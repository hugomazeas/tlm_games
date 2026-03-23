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

        /* ===== SCOREBOARD (top ~15%) ===== */
        .scoreboard {
            flex-shrink: 0;
            padding: 12px 16px 8px;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.03);
        }

        .scoreboard-scores {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .scoreboard-side {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 80px;
        }

        .scoreboard-side .score-value {
            font-size: 4rem;
            font-weight: 900;
            line-height: 1;
        }

        .scoreboard-side.left .score-value { color: #fb7185; }
        .scoreboard-side.right .score-value { color: #22d3ee; }

        .scoreboard-side .player-names {
            font-size: 0.8rem;
            font-weight: 700;
            color: rgba(255,255,255,0.6);
            margin-top: 2px;
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .scoreboard-side.my-side .player-names {
            color: rgba(255,255,255,0.9);
        }

        .scoreboard-side.my-side {
            position: relative;
        }

        .scoreboard-side.my-side::after {
            content: '';
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 3px;
            border-radius: 2px;
        }

        .scoreboard-side.my-side.left::after { background: #fb7185; }
        .scoreboard-side.my-side.right::after { background: #22d3ee; }

        .scoreboard-divider {
            font-size: 2rem;
            font-weight: 300;
            color: rgba(255,255,255,0.2);
            padding: 0 4px;
        }

        .serving-info {
            margin-top: 8px;
            font-size: 0.75rem;
            color: rgba(255,255,255,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: 20px;
        }

        .serving-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #fbbf24;
            animation: pulse-dot 1.5s ease-in-out infinite;
        }

        @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
        }

        .serving-name {
            font-weight: 700;
            color: #fbbf24;
        }

        /* ===== PLUS BUTTON (main ~65%) ===== */
        .plus-area {
            flex: 1;
            display: flex;
            min-height: 0;
        }

        .btn-plus {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 6rem;
            font-weight: 900;
            cursor: pointer;
            border: none;
            position: relative;
            overflow: hidden;
            transition: transform 0.1s ease, filter 0.1s ease;
        }

        .btn-plus.left-side {
            background: rgba(244, 63, 94, 0.12);
            color: #fb7185;
        }

        .btn-plus.right-side {
            background: rgba(6, 182, 212, 0.12);
            color: #22d3ee;
        }

        .btn-plus.left-side.my-serve {
            animation: pulse-serve-left 1.8s ease-in-out infinite;
        }

        .btn-plus.right-side.my-serve {
            animation: pulse-serve-right 1.8s ease-in-out infinite;
        }

        @keyframes pulse-serve-left {
            0%, 100% { background: rgba(244, 63, 94, 0.12); box-shadow: none; }
            50% { background: rgba(244, 63, 94, 0.28); box-shadow: inset 0 0 80px rgba(244, 63, 94, 0.15); }
        }

        @keyframes pulse-serve-right {
            0%, 100% { background: rgba(6, 182, 212, 0.12); box-shadow: none; }
            50% { background: rgba(6, 182, 212, 0.28); box-shadow: inset 0 0 80px rgba(6, 182, 212, 0.15); }
        }

        .btn-plus:active {
            transform: scale(0.97);
            filter: brightness(1.4);
        }

        .btn-plus.tapped {
            transform: scale(0.97);
            filter: brightness(1.4);
        }

        .btn-plus.tapped::after {
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

        /* ===== UNDO BUTTON (bottom ~20%) ===== */
        .undo-area {
            flex-shrink: 0;
            height: 18vh;
            min-height: 60px;
            display: flex;
        }

        .btn-undo {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 1.4rem;
            font-weight: 700;
            cursor: pointer;
            border: none;
            background: rgba(239, 68, 68, 0.08);
            color: rgba(239, 68, 68, 0.7);
            border-top: 1px solid rgba(239, 68, 68, 0.15);
            transition: transform 0.1s ease, filter 0.1s ease;
        }

        .btn-undo:active {
            transform: scale(0.97);
            filter: brightness(1.3);
            background: rgba(239, 68, 68, 0.15);
        }

        .btn-undo.tapped {
            transform: scale(0.97);
            filter: brightness(1.3);
            background: rgba(239, 68, 68, 0.15);
        }

    </style>
</head>
<body>
    <div class="remote-container" id="app">
        <!-- Scoreboard -->
        <div class="scoreboard" id="scoreboard">
            <div class="scoreboard-scores">
                <div class="scoreboard-side left" id="leftSide">
                    <div class="player-names" id="leftNames">...</div>
                    <div class="score-value" id="leftScore">0</div>
                </div>
                <div class="scoreboard-divider">-</div>
                <div class="scoreboard-side right" id="rightSide">
                    <div class="player-names" id="rightNames">...</div>
                    <div class="score-value" id="rightScore">0</div>
                </div>
            </div>
            <div class="serving-info" id="servingInfo"></div>
        </div>

        <!-- +1 Button -->
        <div class="plus-area" id="plusArea">
            <button class="btn-plus" id="btnPlus">+1</button>
        </div>

        <!-- Undo Button -->
        <div class="undo-area" id="undoArea">
            <button class="btn-undo" id="btnUndo">Undo (-1)</button>
        </div>

    </div>

    <script>
        const MATCH_ID = {{ $matchId }};
        const SIDE = '{{ $side }}';
        const API = '/games/ping-pong/api';
        const CSRF = document.querySelector('meta[name="csrf-token"]').content;

        let isUpdating = false;
        let isComplete = false;
        let currentLeftScore = 0;
        let currentRightScore = 0;
        let matchData = null;

        // DOM elements
        const scoreboard = document.getElementById('scoreboard');
        const leftNames = document.getElementById('leftNames');
        const rightNames = document.getElementById('rightNames');
        const leftScore = document.getElementById('leftScore');
        const rightScore = document.getElementById('rightScore');
        const leftSide = document.getElementById('leftSide');
        const rightSide = document.getElementById('rightSide');
        const servingInfo = document.getElementById('servingInfo');
        const plusArea = document.getElementById('plusArea');
        const undoArea = document.getElementById('undoArea');
        const btnPlus = document.getElementById('btnPlus');
        const btnUndo = document.getElementById('btnUndo');

        // Setup side styling for +1 button
        btnPlus.classList.add(SIDE === 'left' ? 'left-side' : 'right-side');

        // Mark user's side on scoreboard
        if (SIDE === 'left') {
            leftSide.classList.add('my-side');
        } else {
            rightSide.classList.add('my-side');
        }

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
                if (e.pointerType !== 'touch') {
                    addTapFeedback(el);
                    handler();
                }
            });
        }

        addTouchHandler(btnPlus, () => updateScore('increment'));
        addTouchHandler(btnUndo, () => updateScore('decrement'));

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
            matchData = data;
            currentLeftScore = data.player_left_score;
            currentRightScore = data.player_right_score;

            leftScore.textContent = currentLeftScore;
            rightScore.textContent = currentRightScore;

            // Player names
            if (data.mode === '2v2') {
                leftNames.textContent = (data.player_left?.name || '?') + ' & ' + (data.team_left_player2?.name || '?');
                rightNames.textContent = (data.player_right?.name || '?') + ' & ' + (data.team_right_player2?.name || '?');
            } else {
                leftNames.textContent = data.player_left?.name || '?';
                rightNames.textContent = data.player_right?.name || '?';
            }

            // Serving indicator
            renderServing(data);

            if (data.is_complete) {
                window.location.href = '/games/ping-pong/matches/' + MATCH_ID;
                return;
            }
        }

        function renderServing(data) {
            if (!data.current_server_id) {
                servingInfo.innerHTML = '';
                btnPlus.classList.remove('my-serve');
                return;
            }

            let serverName = null;
            let serverSide = null;

            if (data.current_server_id === data.player_left_id) {
                serverName = data.player_left?.name;
                serverSide = 'left';
            } else if (data.current_server_id === data.player_right_id) {
                serverName = data.player_right?.name;
                serverSide = 'right';
            } else if (data.current_server_id === data.team_left_player2_id) {
                serverName = data.team_left_player2?.name;
                serverSide = 'left';
            } else if (data.current_server_id === data.team_right_player2_id) {
                serverName = data.team_right_player2?.name;
                serverSide = 'right';
            }

            // Pulse the +1 button when it's our side's serve
            if (serverSide === SIDE) {
                btnPlus.classList.add('my-serve');
            } else {
                btnPlus.classList.remove('my-serve');
            }

            if (serverName) {
                servingInfo.innerHTML =
                    '<span class="serving-dot"></span>' +
                    '<span class="serving-name">' + serverName + '</span>' +
                    '<span>serving</span>';
            } else {
                servingInfo.innerHTML = '';
                btnPlus.classList.remove('my-serve');
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
                leftNames.textContent = 'Error loading match';
            }
            subscribeToMatch();
        }

        init();
    </script>
</body>
</html>
