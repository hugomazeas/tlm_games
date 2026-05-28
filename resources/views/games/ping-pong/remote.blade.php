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

        /* ===== ABANDON BUTTON ===== */
        .abandon-area {
            flex-shrink: 0;
            display: flex;
        }

        .btn-abandon {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
            background: rgba(255, 255, 255, 0.03);
            color: rgba(255, 255, 255, 0.3);
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            transition: all 0.15s ease;
        }

        .btn-abandon:active {
            background: rgba(239, 68, 68, 0.15);
            color: rgba(239, 68, 68, 0.9);
        }

        /* ===== CONFIRM OVERLAY ===== */
        .confirm-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
        }

        .confirm-box {
            background: #1e293b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            max-width: 300px;
            width: 90%;
        }

        .confirm-box h3 {
            font-size: 1.2rem;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .confirm-box p {
            font-size: 0.85rem;
            color: rgba(255, 255, 255, 0.5);
            margin-bottom: 20px;
        }

        .confirm-buttons {
            display: flex;
            gap: 12px;
        }

        .confirm-buttons button {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
        }

        .btn-confirm-cancel {
            background: rgba(255, 255, 255, 0.1);
            color: white;
        }

        .btn-confirm-abandon {
            background: #ef4444;
            color: white;
        }

        /* ===== TAG SHEET ===== */
        .tag-sheet {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15, 23, 42, 0.97);
            backdrop-filter: blur(12px);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding: 16px 18px calc(20px + env(safe-area-inset-bottom));
            transform: translateY(110%);
            transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
            z-index: 80;
            max-height: none;
            overflow-y: visible;
        }

        .tag-sheet.visible {
            transform: translateY(0);
        }

        .tag-sheet-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .tag-sheet-title {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: rgba(255, 255, 255, 0.5);
        }

        .tag-sheet-close {
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.5);
            font-size: 1.8rem;
            line-height: 1;
            cursor: pointer;
            padding: 6px 14px;
            min-width: 44px;
            min-height: 44px;
        }

        .tag-row {
            display: flex;
            gap: 14px;
            margin-bottom: 14px;
        }

        .tag-row:last-child {
            margin-bottom: 0;
        }

        .tag-chip {
            flex: 1;
            min-height: 140px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 18px;
            font-size: 1.4rem;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
            padding: 16px;
        }

        .tag-chip:active {
            transform: scale(0.97);
        }

        .tag-chip.selected {
            background: rgba(251, 191, 36, 0.18);
            color: #fbbf24;
            border-color: rgba(251, 191, 36, 0.5);
        }

        .tag-chip.tag-clip.selected {
            background: rgba(239, 68, 68, 0.2);
            color: #fca5a5;
            border-color: rgba(239, 68, 68, 0.6);
        }

        .tag-chip.tag-cause-earned.selected {
            background: rgba(34, 197, 94, 0.2);
            color: #86efac;
            border-color: rgba(34, 197, 94, 0.6);
        }

        .tag-chip.tag-cause-error.selected {
            background: rgba(148, 163, 184, 0.18);
            color: #cbd5e1;
            border-color: rgba(148, 163, 184, 0.5);
        }

        .tag-chip-icon {
            font-size: 2.4rem;
            line-height: 1;
        }

        .tag-confirm {
            position: fixed;
            top: 16vh;
            left: 50%;
            transform: translate(-50%, -20px);
            opacity: 0;
            pointer-events: none;
            background: rgba(34, 197, 94, 0.92);
            color: white;
            font-size: 0.85rem;
            font-weight: 700;
            padding: 8px 14px;
            border-radius: 999px;
            z-index: 70;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .tag-confirm.visible {
            opacity: 1;
            transform: translate(-50%, 0);
        }

        /* ===== END-GAME OVERLAY ===== */
        .endgame-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.92);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 90;
            padding: 24px;
        }

        .endgame-box {
            text-align: center;
            max-width: 360px;
            width: 100%;
        }

        .endgame-result {
            font-size: 1rem;
            font-weight: 600;
            color: rgba(255,255,255,0.5);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            margin-bottom: 8px;
        }

        .endgame-winner {
            font-size: 2rem;
            font-weight: 900;
            margin-bottom: 8px;
        }

        .endgame-winner.left { color: #fb7185; }
        .endgame-winner.right { color: #22d3ee; }

        .endgame-score {
            font-size: 3.5rem;
            font-weight: 900;
            margin-bottom: 32px;
            color: white;
        }

        .endgame-score .sep {
            color: rgba(255,255,255,0.2);
            margin: 0 8px;
        }

        .endgame-buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .endgame-buttons button {
            padding: 16px;
            border: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
        }

        .btn-rematch {
            background: linear-gradient(135deg, #3b82f6, #06b6d4);
            color: white;
            box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
        }

        .btn-rematch:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .btn-rematch:active {
            transform: scale(0.98);
        }

        .btn-done {
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.7);
        }

        .endgame-hint {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.4);
            margin-top: 16px;
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

        <!-- Abandon Button -->
        <div class="abandon-area">
            <button class="btn-abandon" id="btnAbandon">Abandon Match</button>
        </div>

        <!-- Tag Sheet -->
        <div class="tag-sheet" id="tagSheet">
            <div class="tag-sheet-header">
                <div class="tag-sheet-title" id="tagSheetTitle">Tag point</div>
                <button class="tag-sheet-close" id="tagSheetClose" aria-label="Close">×</button>
            </div>
            <div class="tag-row">
                <button class="tag-chip tag-cause-earned" data-tag="cause" data-value="winner" id="tagCauseEarned">
                    <span class="tag-chip-icon">🏆</span>Earned
                </button>
                <button class="tag-chip tag-cause-error" data-tag="cause" data-value="opponent_error" id="tagCauseError">
                    <span class="tag-chip-icon">✕</span>Their error
                </button>
            </div>
            <div class="tag-row" id="errorTypeRow" style="display:none;">
                <button class="tag-chip" data-tag="error" data-value="net" id="tagErrNet">
                    <span class="tag-chip-icon">🥅</span>Net
                </button>
                <button class="tag-chip" data-tag="error" data-value="long_wide" id="tagErrLong">
                    <span class="tag-chip-icon">➡</span>Long/Wide
                </button>
            </div>
            <div class="tag-shot-rows" id="tagShotRows">
                <div class="tag-row">
                    <button class="tag-chip" data-tag="shot" data-value="forehand" id="tagForehand">
                        <span class="tag-chip-icon">↗</span>Forehand
                    </button>
                    <button class="tag-chip" data-tag="shot" data-value="backhand" id="tagBackhand">
                        <span class="tag-chip-icon">↖</span>Backhand
                    </button>
                </div>
                <div class="tag-row">
                    <button class="tag-chip" data-tag="net" id="tagNet">
                        <span class="tag-chip-icon">🍀</span>Net edge
                    </button>
                    <button class="tag-chip" data-tag="edge" id="tagEdge">
                        <span class="tag-chip-icon">📐</span>Table edge
                    </button>
                    <button class="tag-chip" data-tag="body" id="tagBody">
                        <span class="tag-chip-icon">🙆</span>Body hit
                    </button>
                </div>
                <div class="tag-row">
                    <button class="tag-chip" data-tag="serve" id="tagServe">
                        <span class="tag-chip-icon">🏓</span>On serve
                    </button>
                    <button class="tag-chip tag-clip" data-tag="clip" id="tagClip">
                        <span class="tag-chip-icon">🎬</span>Clip this
                    </button>
                </div>
            </div>
        </div>

        <div class="tag-confirm" id="tagConfirm">Tagged</div>

        <!-- End-Game Overlay -->
        <div class="endgame-overlay" id="endgameOverlay" style="display:none;">
            <div class="endgame-box">
                <div class="endgame-result">Match Complete</div>
                <div class="endgame-winner" id="endgameWinner">—</div>
                <div class="endgame-score">
                    <span id="endgameLeftScore">0</span><span class="sep">-</span><span id="endgameRightScore">0</span>
                </div>
                <div class="endgame-buttons">
                    @if($side === 'left')
                    <button class="btn-rematch" id="btnRematch">Rematch</button>
                    @else
                    <div class="endgame-hint" style="display:block;">Waiting for left player to start rematch...</div>
                    @endif
                    <button class="btn-done" id="btnDone">View Match Detail</button>
                </div>
                <div class="endgame-hint" id="endgameHint" style="display:none;"></div>
            </div>
        </div>

        <!-- Confirm Dialog -->
        <div class="confirm-overlay" id="confirmOverlay" style="display:none;">
            <div class="confirm-box">
                <h3>Abandon Match?</h3>
                <p>Scores will be annulled and the recording deleted.</p>
                <div class="confirm-buttons">
                    <button class="btn-confirm-cancel" id="btnConfirmCancel">Cancel</button>
                    <button class="btn-confirm-abandon" id="btnConfirmAbandon">Abandon</button>
                </div>
            </div>
        </div>

        <!-- Match-Point Confirm Dialog -->
        <div class="confirm-overlay" id="matchPointOverlay" style="display:none;">
            <div class="confirm-box">
                <h3>Match Point</h3>
                <p id="matchPointDetail">This point will end the match.</p>
                <div class="confirm-buttons">
                    <button class="btn-confirm-cancel" id="btnMatchPointCancel">Cancel</button>
                    <button class="btn-confirm-abandon" id="btnMatchPointConfirm" style="background: #22c55e;">Confirm Win</button>
                </div>
            </div>
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
        let lastPointId = null;
        let lastPointTags = { shot_type: null, net_edge: false, table_edge: false, clip_requested: false, point_cause: null, error_type: null, serve_point: false, body_hit: false };
        let tagSheetTimer = null;
        let pendingEndgameData = null;
        let deferEndgameForTagging = false;
        const TAG_SHEET_AUTO_DISMISS_MS = 6000;

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

        const confirmOverlay = document.getElementById('confirmOverlay');
        const btnAbandon = document.getElementById('btnAbandon');
        const btnConfirmCancel = document.getElementById('btnConfirmCancel');
        const btnConfirmAbandon = document.getElementById('btnConfirmAbandon');

        const endgameOverlay = document.getElementById('endgameOverlay');
        const endgameWinner = document.getElementById('endgameWinner');
        const endgameLeftScore = document.getElementById('endgameLeftScore');
        const endgameRightScore = document.getElementById('endgameRightScore');
        const endgameHint = document.getElementById('endgameHint');
        const btnRematch = document.getElementById('btnRematch');
        const btnDone = document.getElementById('btnDone');

        const matchPointOverlay = document.getElementById('matchPointOverlay');
        const matchPointDetail = document.getElementById('matchPointDetail');
        const btnMatchPointCancel = document.getElementById('btnMatchPointCancel');
        const btnMatchPointConfirm = document.getElementById('btnMatchPointConfirm');

        const tagSheet = document.getElementById('tagSheet');
        const tagSheetClose = document.getElementById('tagSheetClose');
        const tagConfirm = document.getElementById('tagConfirm');
        const tagChipForehand = document.getElementById('tagForehand');
        const tagChipBackhand = document.getElementById('tagBackhand');
        const tagChipNet = document.getElementById('tagNet');
        const tagChipEdge = document.getElementById('tagEdge');
        const tagChipClip = document.getElementById('tagClip');
        const tagChipCauseEarned = document.getElementById('tagCauseEarned');
        const tagChipCauseError = document.getElementById('tagCauseError');
        const tagChipErrNet = document.getElementById('tagErrNet');
        const tagChipErrLong = document.getElementById('tagErrLong');
        const tagChipServe = document.getElementById('tagServe');
        const tagChipBody = document.getElementById('tagBody');
        const errorTypeRow = document.getElementById('errorTypeRow');

        function resetTagChipUI() {
            tagChipForehand.classList.remove('selected');
            tagChipBackhand.classList.remove('selected');
            tagChipNet.classList.remove('selected');
            tagChipEdge.classList.remove('selected');
            tagChipClip.classList.remove('selected');
            tagChipCauseEarned.classList.remove('selected');
            tagChipCauseError.classList.remove('selected');
            tagChipErrNet.classList.remove('selected');
            tagChipErrLong.classList.remove('selected');
            tagChipServe.classList.remove('selected');
            tagChipBody.classList.remove('selected');
            errorTypeRow.style.display = 'none';
        }

        function showTagSheet() {
            resetTagChipUI();
            lastPointTags = { shot_type: null, net_edge: false, table_edge: false, clip_requested: false, point_cause: null, error_type: null, serve_point: false, body_hit: false };
            tagSheet.classList.add('visible');
            if (tagSheetTimer) clearTimeout(tagSheetTimer);
            tagSheetTimer = setTimeout(hideTagSheet, TAG_SHEET_AUTO_DISMISS_MS);
        }

        function hideTagSheet() {
            tagSheet.classList.remove('visible');
            deferEndgameForTagging = false;
            if (tagSheetTimer) {
                clearTimeout(tagSheetTimer);
                tagSheetTimer = null;
            }
            if (pendingEndgameData) {
                showEndgameOverlay(pendingEndgameData);
                pendingEndgameData = null;
            }
        }

        function bumpTagSheetTimer() {
            if (tagSheetTimer) clearTimeout(tagSheetTimer);
            tagSheetTimer = setTimeout(hideTagSheet, TAG_SHEET_AUTO_DISMISS_MS);
        }

        function flashTagConfirm() {
            tagConfirm.classList.add('visible');
            setTimeout(() => tagConfirm.classList.remove('visible'), 900);
        }

        async function sendTagUpdate() {
            if (!lastPointId) return;
            const payload = {
                shot_type: lastPointTags.shot_type,
                net_edge: lastPointTags.net_edge,
                table_edge: lastPointTags.table_edge,
                clip_requested: lastPointTags.clip_requested,
                point_cause: lastPointTags.point_cause,
                error_type: lastPointTags.error_type,
                serve_point: lastPointTags.serve_point,
                body_hit: lastPointTags.body_hit,
            };
            try {
                const res = await fetch(`${API}/points/${lastPointId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': CSRF,
                    },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    flashTagConfirm();
                }
            } catch (err) {
                // swallow — best-effort tagging
            }
        }

        function handleTagChip(tag, value) {
            if (!lastPointId) return;
            bumpTagSheetTimer();
            if (tag === 'cause') {
                if (lastPointTags.point_cause === value) {
                    lastPointTags.point_cause = null;
                    tagChipCauseEarned.classList.remove('selected');
                    tagChipCauseError.classList.remove('selected');
                    errorTypeRow.style.display = 'none';
                    lastPointTags.error_type = null;
                    tagChipErrNet.classList.remove('selected');
                    tagChipErrLong.classList.remove('selected');
                } else {
                    lastPointTags.point_cause = value;
                    tagChipCauseEarned.classList.toggle('selected', value === 'winner');
                    tagChipCauseError.classList.toggle('selected', value === 'opponent_error');
                    if (value === 'opponent_error') {
                        errorTypeRow.style.display = '';
                    } else {
                        errorTypeRow.style.display = 'none';
                        lastPointTags.error_type = null;
                        tagChipErrNet.classList.remove('selected');
                        tagChipErrLong.classList.remove('selected');
                    }
                }
            } else if (tag === 'shot') {
                if (lastPointTags.shot_type === value) {
                    lastPointTags.shot_type = null;
                    (value === 'forehand' ? tagChipForehand : tagChipBackhand).classList.remove('selected');
                } else {
                    lastPointTags.shot_type = value;
                    tagChipForehand.classList.toggle('selected', value === 'forehand');
                    tagChipBackhand.classList.toggle('selected', value === 'backhand');
                }
            } else if (tag === 'error') {
                if (lastPointTags.error_type === value) {
                    lastPointTags.error_type = null;
                    (value === 'net' ? tagChipErrNet : tagChipErrLong).classList.remove('selected');
                } else {
                    lastPointTags.error_type = value;
                    tagChipErrNet.classList.toggle('selected', value === 'net');
                    tagChipErrLong.classList.toggle('selected', value === 'long_wide');
                }
            } else if (tag === 'serve') {
                lastPointTags.serve_point = !lastPointTags.serve_point;
                tagChipServe.classList.toggle('selected', lastPointTags.serve_point);
            } else if (tag === 'net' || tag === 'edge' || tag === 'body') {
                // Net edge / Table edge / Body hit are mutually exclusive — at most one can be on.
                const map = {
                    net:  { key: 'net_edge',   chip: tagChipNet  },
                    edge: { key: 'table_edge', chip: tagChipEdge },
                    body: { key: 'body_hit',   chip: tagChipBody },
                };
                const cur = map[tag];
                const wasOn = lastPointTags[cur.key];
                lastPointTags.net_edge = false;   tagChipNet.classList.remove('selected');
                lastPointTags.table_edge = false; tagChipEdge.classList.remove('selected');
                lastPointTags.body_hit = false;   tagChipBody.classList.remove('selected');
                if (!wasOn) {
                    lastPointTags[cur.key] = true;
                    cur.chip.classList.add('selected');
                }
            } else if (tag === 'clip') {
                lastPointTags.clip_requested = !lastPointTags.clip_requested;
                tagChipClip.classList.toggle('selected', lastPointTags.clip_requested);
            }
            sendTagUpdate();
        }

        addTouchHandler(tagChipCauseEarned, () => handleTagChip('cause', 'winner'));
        addTouchHandler(tagChipCauseError, () => handleTagChip('cause', 'opponent_error'));
        addTouchHandler(tagChipForehand, () => handleTagChip('shot', 'forehand'));
        addTouchHandler(tagChipBackhand, () => handleTagChip('shot', 'backhand'));
        addTouchHandler(tagChipNet, () => handleTagChip('net'));
        addTouchHandler(tagChipEdge, () => handleTagChip('edge'));
        addTouchHandler(tagChipClip, () => handleTagChip('clip'));
        addTouchHandler(tagChipErrNet, () => handleTagChip('error', 'net'));
        addTouchHandler(tagChipErrLong, () => handleTagChip('error', 'long_wide'));
        addTouchHandler(tagChipServe, () => handleTagChip('serve'));
        addTouchHandler(tagChipBody, () => handleTagChip('body'));
        addTouchHandler(tagSheetClose, () => hideTagSheet());

        addTouchHandler(btnPlus, () => handlePlusTap());
        addTouchHandler(btnUndo, () => updateScore('decrement'));
        addTouchHandler(btnAbandon, () => { confirmOverlay.style.display = 'flex'; });
        addTouchHandler(btnConfirmCancel, () => { confirmOverlay.style.display = 'none'; });
        addTouchHandler(btnConfirmAbandon, () => abandonMatch());
        addTouchHandler(btnMatchPointCancel, () => { matchPointOverlay.style.display = 'none'; });
        addTouchHandler(btnMatchPointConfirm, () => {
            matchPointOverlay.style.display = 'none';
            deferEndgameForTagging = true;
            updateScore('increment');
        });
        if (btnRematch) addTouchHandler(btnRematch, () => requestRematch());
        addTouchHandler(btnDone, () => {
            window.location.href = '/games/ping-pong/matches/' + MATCH_ID;
        });

        function wouldWinMatch() {
            if (!matchData || isComplete) return false;
            const newLeft = matchData.player_left_score + (SIDE === 'left' ? 1 : 0);
            const newRight = matchData.player_right_score + (SIDE === 'right' ? 1 : 0);
            return (newLeft >= 11 || newRight >= 11) && Math.abs(newLeft - newRight) >= 2;
        }

        function handlePlusTap() {
            if (isUpdating || isComplete) return;
            if (wouldWinMatch()) {
                const newLeft = matchData.player_left_score + (SIDE === 'left' ? 1 : 0);
                const newRight = matchData.player_right_score + (SIDE === 'right' ? 1 : 0);
                matchPointDetail.textContent = 'This point will end the match at ' + newLeft + '–' + newRight + '.';
                matchPointOverlay.style.display = 'flex';
                return;
            }
            updateScore('increment');
        }

        async function updateScore(action) {
            if (isUpdating || isComplete) return;
            isUpdating = true;

            if (navigator.vibrate) navigator.vibrate(50);

            const deferEndgameAfterScore = deferEndgameForTagging;
            // Always hide the previous sheet before a new score action.
            hideTagSheet();
            deferEndgameForTagging = deferEndgameAfterScore;

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
                    if (action === 'increment' && data.last_point_id) {
                        lastPointId = data.last_point_id;
                        showTagSheet();
                    } else if (action === 'decrement') {
                        lastPointId = null;
                        deferEndgameForTagging = false;
                    } else {
                        deferEndgameForTagging = false;
                    }
                    renderMatch(data);
                } else {
                    deferEndgameForTagging = false;
                }
            } catch (err) {
                deferEndgameForTagging = false;
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
                isComplete = true;
                if (deferEndgameForTagging || tagSheet.classList.contains('visible')) {
                    pendingEndgameData = data;
                } else {
                    showEndgameOverlay(data);
                }
                return;
            }
        }

        function showEndgameOverlay(data) {
            const leftScoreVal = data.player_left_score ?? 0;
            const rightScoreVal = data.player_right_score ?? 0;
            endgameLeftScore.textContent = leftScoreVal;
            endgameRightScore.textContent = rightScoreVal;

            let winnerName = '';
            let winnerSide = '';
            if (leftScoreVal > rightScoreVal) {
                winnerSide = 'left';
                winnerName = data.mode === '2v2'
                    ? (data.player_left?.name || '?') + ' & ' + (data.team_left_player2?.name || '?')
                    : (data.player_left?.name || 'Left');
            } else if (rightScoreVal > leftScoreVal) {
                winnerSide = 'right';
                winnerName = data.mode === '2v2'
                    ? (data.player_right?.name || '?') + ' & ' + (data.team_right_player2?.name || '?')
                    : (data.player_right?.name || 'Right');
            } else {
                winnerName = 'Tie';
            }

            endgameWinner.className = 'endgame-winner' + (winnerSide ? ' ' + winnerSide : '');
            endgameWinner.textContent = winnerName + (winnerSide ? ' wins' : '');
            endgameOverlay.style.display = 'flex';
        }

        function getOwnPlayerInfo() {
            if (!matchData) return null;
            if (SIDE === 'left') {
                return {
                    player_id: matchData.player_left_id,
                    player_name: matchData.player_left?.name || '',
                };
            }
            return {
                player_id: matchData.player_right_id,
                player_name: matchData.player_right?.name || '',
            };
        }

        function redirectToRematchLobby(lobbyCode) {
            // Seed last-player cache so the lobby join page auto-joins us;
            // since rematch endpoint pre-joined this player, /join returns the
            // existing session_token.
            const me = getOwnPlayerInfo();
            if (me?.player_id) {
                try {
                    localStorage.setItem('ping_pong_last_player', JSON.stringify({
                        player_id: me.player_id,
                        player_name: me.player_name,
                    }));
                } catch (e) {}
            }
            window.location.href = '/games/ping-pong/lobby/' + lobbyCode;
        }

        async function requestRematch() {
            if (!isComplete) return;
            btnRematch.disabled = true;
            endgameHint.style.display = 'block';
            endgameHint.textContent = 'Creating new lobby...';
            try {
                const res = await fetch(`${API}/matches/${MATCH_ID}/rematch`, {
                    method: 'POST',
                    headers: { 'X-CSRF-TOKEN': CSRF },
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    endgameHint.textContent = err.error || 'Could not create rematch';
                    btnRematch.disabled = false;
                    return;
                }
                const data = await res.json();
                redirectToRematchLobby(data.lobby_code);
            } catch (err) {
                endgameHint.textContent = 'Network error — try again';
                btnRematch.disabled = false;
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

        async function abandonMatch() {
            if (isUpdating || isComplete) return;
            isUpdating = true;

            try {
                const res = await fetch(`${API}/matches/${MATCH_ID}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-TOKEN': CSRF },
                });
                if (res.ok) {
                    window.location.href = '/games/ping-pong';
                    return;
                }
            } catch (err) {
                // ignore
            }
            isUpdating = false;
            confirmOverlay.style.display = 'none';
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
                })
                .listen('.match.abandoned', function() {
                    window.location.href = '/games/ping-pong';
                })
                .listen('.match.rematched', function(e) {
                    if (!e?.lobbyCode) return;
                    redirectToRematchLobby(e.lobbyCode);
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
