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
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        /* ============================================================
           Remote — Editorial mobile controller
           Cream + paddle-red + chalk-blue + amber on deep ink.
           ============================================================ */
        :root {
            --ink:    #06081b;
            --ink-2:  #0a0f24;
            --paper:  #f5ecd6;
            --paper-soft: rgba(245, 236, 214, 0.82);
            --paper-faint: rgba(245, 236, 214, 0.45);
            --paper-line: rgba(245, 236, 214, 0.14);
            --red:    #ff5a4a;
            --blue:   #3ec8ff;
            --amber:  #ffd166;
            --mint:   #9be7c4;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            height: 100%;
            overflow: hidden;
            font-family: 'Bricolage Grotesque', system-ui, sans-serif;
            color: var(--paper-soft);
            touch-action: manipulation;
            -webkit-user-select: none;
            user-select: none;
            background:
                radial-gradient(40% 50% at 6% 4%,   rgba(255, 90, 74, 0.13), transparent 70%),
                radial-gradient(55% 65% at 96% 96%, rgba(62, 200, 255, 0.13), transparent 72%),
                linear-gradient(180deg, var(--ink-2) 0%, var(--ink) 100%);
        }

        .pph-display { font-family: 'Anton', sans-serif; font-weight: 400; }
        .pph-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }

        @keyframes pph-flicker { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
        @keyframes pph-pulse-amber {
            0%,100% { box-shadow: 0 0 0 0 rgba(255, 209, 102, 0.55); opacity: 1; }
            50%     { box-shadow: 0 0 0 9px rgba(255, 209, 102, 0); opacity: 0.7; }
        }

        .remote-container {
            position: relative;
            display: flex;
            flex-direction: column;
            height: 100%;
            isolation: isolate;
        }
        .remote-container::before {
            content: '';
            position: absolute; inset: 0;
            background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.95 0 0 0 0 0.85 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
            opacity: 0.06;
            mix-blend-mode: overlay;
            pointer-events: none;
            z-index: 0;
        }
        .remote-container > * { position: relative; z-index: 1; }

        /* ===== SCOREBOARD ===== */
        .scoreboard {
            flex-shrink: 0;
            padding: calc(18px + env(safe-area-inset-top)) 18px 16px;
            text-align: center;
            border-bottom: 1px solid var(--paper-line);
            background: rgba(245, 236, 214, 0.025);
            position: relative;
        }
        /* Center-net dashed line */
        .scoreboard::after {
            content: '';
            position: absolute;
            left: 50%; transform: translateX(-50%);
            bottom: 0;
            width: 64%; height: 2px;
            background-image: repeating-linear-gradient(90deg, var(--paper) 0 8px, transparent 8px 16px);
            opacity: 0.2;
        }

        .scoreboard-scores {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 18px;
        }
        .scoreboard-side {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 88px;
            position: relative;
        }
        .scoreboard-side .player-names {
            font-family: 'Anton', sans-serif;
            font-size: 1rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--paper-faint);
            max-width: 130px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-bottom: 4px;
            padding-top: 14px;
        }
        .scoreboard-side .score-value {
            font-family: 'JetBrains Mono', monospace;
            font-size: 3.4rem;
            font-weight: 700;
            line-height: 1;
            font-variant-numeric: tabular-nums;
        }
        .scoreboard-side.left .score-value  { color: var(--red);  text-shadow: 0 0 22px rgba(255, 90, 74, 0.35); }
        .scoreboard-side.right .score-value { color: var(--blue); text-shadow: 0 0 22px rgba(62, 200, 255, 0.35); }
        .scoreboard-side.my-side .player-names { color: var(--paper); }
        .scoreboard-side.my-side.left  .player-names { color: var(--red); }
        .scoreboard-side.my-side.right .player-names { color: var(--blue); }
        .scoreboard-side { margin-top: 14px; }
        .scoreboard-side.my-side::after {
            content: 'YOU';
            position: absolute;
            top: -16px;
            left: 50%; transform: translateX(-50%);
            font-family: 'JetBrains Mono', monospace;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.22em;
            line-height: 1;
            padding: 3px 7px;
            border-radius: 999px;
            border: 1px solid currentColor;
            background: var(--ink);
            white-space: nowrap;
        }
        .scoreboard-side.my-side.left::after  { color: var(--red); }
        .scoreboard-side.my-side.right::after { color: var(--blue); }

        .scoreboard-divider {
            font-family: 'JetBrains Mono', monospace;
            font-size: 2rem;
            color: var(--paper-faint);
            opacity: 0.3;
        }

        .serving-info {
            margin-top: 12px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem;
            font-weight: 700;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--paper-faint);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 20px;
        }
        .serving-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--amber);
            animation: pph-pulse-amber 1.4s ease-in-out infinite;
        }
        .serving-name {
            color: var(--amber);
            font-weight: 700;
            letter-spacing: 0.12em;
        }

        /* ===== PLUS BUTTON ===== */
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
            font-family: 'Anton', sans-serif;
            font-size: 7rem;
            font-weight: 400;
            letter-spacing: 0.04em;
            cursor: pointer;
            border: none;
            position: relative;
            overflow: hidden;
            transition: transform 0.1s ease, filter 0.1s ease;
        }
        .btn-plus.left-side {
            background:
                radial-gradient(60% 70% at 50% 50%, rgba(255, 90, 74, 0.22), rgba(255, 90, 74, 0.08));
            color: var(--red);
            text-shadow: 0 0 40px rgba(255, 90, 74, 0.5);
        }
        .btn-plus.right-side {
            background:
                radial-gradient(60% 70% at 50% 50%, rgba(62, 200, 255, 0.22), rgba(62, 200, 255, 0.08));
            color: var(--blue);
            text-shadow: 0 0 40px rgba(62, 200, 255, 0.5);
        }
        .btn-plus.left-side.my-serve  { animation: pulse-serve-left  1.8s ease-in-out infinite; }
        .btn-plus.right-side.my-serve { animation: pulse-serve-right 1.8s ease-in-out infinite; }
        @keyframes pulse-serve-left {
            0%,100% { box-shadow: inset 0 0 0 0 rgba(255, 209, 102, 0); }
            50%     { box-shadow: inset 0 0 120px rgba(255, 209, 102, 0.22); }
        }
        @keyframes pulse-serve-right {
            0%,100% { box-shadow: inset 0 0 0 0 rgba(255, 209, 102, 0); }
            50%     { box-shadow: inset 0 0 120px rgba(255, 209, 102, 0.22); }
        }
        .btn-plus:active, .btn-plus.tapped {
            transform: scale(0.97);
            filter: brightness(1.4);
        }
        .btn-plus.tapped::after {
            content: '';
            position: absolute;
            top: 50%; left: 50%;
            width: 120%; height: 120%;
            background: radial-gradient(circle, rgba(245, 236, 214, 0.25) 0%, transparent 70%);
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.4s ease-out forwards;
            pointer-events: none;
        }
        @keyframes ripple {
            0%   { transform: translate(-50%, -50%) scale(0);   opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1);   opacity: 0; }
        }

        /* ===== UNDO BUTTON ===== */
        .undo-area {
            flex-shrink: 0;
            height: 16vh;
            min-height: 64px;
            display: flex;
        }
        .btn-undo {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Anton', sans-serif;
            font-size: 1.5rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            cursor: pointer;
            border: none;
            background: rgba(255, 90, 74, 0.08);
            color: rgba(255, 90, 74, 0.85);
            border-top: 1px solid rgba(255, 90, 74, 0.2);
            transition: transform 0.1s ease, filter 0.1s ease;
        }
        .btn-undo:active, .btn-undo.tapped {
            transform: scale(0.97);
            filter: brightness(1.25);
            background: rgba(255, 90, 74, 0.16);
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
            padding: 12px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            cursor: pointer;
            border: none;
            background: rgba(245, 236, 214, 0.02);
            color: var(--paper-faint);
            border-top: 1px solid var(--paper-line);
            transition: all 0.15s ease;
        }
        .btn-abandon:active {
            background: rgba(255, 90, 74, 0.15);
            color: var(--red);
        }

        /* ===== CONFIRM OVERLAY ===== */
        .confirm-overlay {
            position: fixed;
            inset: 0;
            background: rgba(6, 8, 27, 0.92);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
            padding: 24px;
        }

        .confirm-box {
            background: linear-gradient(180deg, rgba(245, 236, 214, 0.05), rgba(245, 236, 214, 0.015));
            border: 1px solid var(--paper-line);
            border-radius: 18px;
            padding: 26px 24px;
            text-align: center;
            max-width: 320px;
            width: 100%;
            position: relative;
        }
        .confirm-box::before, .confirm-box::after {
            content: '';
            position: absolute;
            width: 18px; height: 18px;
            border-radius: 50%;
            background: var(--ink);
            border: 1px solid var(--paper-line);
            left: 50%; transform: translateX(-50%);
        }
        .confirm-box::before { top: -9px; }
        .confirm-box::after  { bottom: -9px; }

        .confirm-box h3 {
            font-family: 'Anton', sans-serif;
            font-size: 1.5rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--paper);
            margin-bottom: 6px;
        }
        .confirm-box p {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem;
            letter-spacing: 0.06em;
            color: var(--paper-faint);
            margin-bottom: 22px;
        }

        .confirm-buttons {
            display: flex;
            gap: 12px;
        }
        .confirm-buttons button {
            flex: 1;
            padding: 14px;
            border: none;
            border-radius: 12px;
            font-family: 'Anton', sans-serif;
            font-size: 1.1rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            cursor: pointer;
        }
        .btn-confirm-cancel {
            background: rgba(245, 236, 214, 0.08);
            color: var(--paper);
            border: 1px solid var(--paper-line) !important;
        }
        .btn-confirm-abandon {
            background: var(--red);
            color: var(--ink);
        }

        /* ===== TAG SHEET ===== */
        .tag-sheet {
            position: fixed;
            left: 0; right: 0; bottom: 0;
            background:
                linear-gradient(180deg, rgba(10, 15, 36, 0.85), rgba(6, 8, 27, 0.97));
            backdrop-filter: blur(14px);
            border-top: 1px solid var(--paper-line);
            padding: 18px 18px calc(20px + env(safe-area-inset-bottom));
            transform: translateY(110%);
            transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
            z-index: 80;
            max-height: 65vh;
            overflow-y: auto;
        }
        .tag-sheet.visible { transform: translateY(0); }

        .tag-sheet-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 14px;
        }
        .tag-sheet-title {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.24em;
            color: var(--paper-faint);
        }
        .tag-sheet-close {
            background: none;
            border: 0;
            color: var(--paper-faint);
            font-size: 1.6rem;
            line-height: 1;
            cursor: pointer;
            padding: 4px 12px;
            min-width: 44px;
            min-height: 44px;
        }

        .tag-row {
            display: flex;
            gap: 12px;
            margin-bottom: 12px;
        }
        .tag-row:last-child { margin-bottom: 0; }

        .tag-chip {
            flex: 1;
            min-height: 132px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: rgba(245, 236, 214, 0.04);
            color: var(--paper-soft);
            border: 1px solid var(--paper-line);
            border-radius: 16px;
            font-family: 'Anton', sans-serif;
            font-size: 1.15rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
            padding: 14px;
        }
        .tag-chip:active { transform: scale(0.97); }
        .tag-chip.selected {
            background: rgba(255, 209, 102, 0.16);
            color: var(--amber);
            border-color: rgba(255, 209, 102, 0.55);
        }
        .tag-chip.tag-clip.selected {
            background: rgba(255, 90, 74, 0.18);
            color: var(--red);
            border-color: rgba(255, 90, 74, 0.6);
        }
        .tag-chip.tag-cause-earned.selected {
            background: rgba(155, 231, 196, 0.18);
            color: var(--mint);
            border-color: rgba(155, 231, 196, 0.6);
        }
        .tag-chip.tag-cause-error.selected {
            background: rgba(245, 236, 214, 0.12);
            color: var(--paper);
            border-color: rgba(245, 236, 214, 0.45);
        }
        .tag-shot-rows.dimmed {
            opacity: 0.25;
            pointer-events: none;
        }
        .tag-chip-icon {
            font-size: 2.2rem;
            line-height: 1;
        }

        .tag-confirm {
            position: fixed;
            top: 18vh;
            left: 50%;
            transform: translate(-50%, -20px);
            opacity: 0;
            pointer-events: none;
            background: var(--mint);
            color: var(--ink);
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            padding: 8px 14px;
            border-radius: 999px;
            z-index: 70;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .tag-confirm.visible {
            opacity: 1;
            transform: translate(-50%, 0);
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
            max-height: 65vh;
            overflow-y: auto;
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

        .tag-shot-rows.dimmed {
            opacity: 0.25;
            pointer-events: none;
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
            background:
                radial-gradient(60% 50% at 50% 30%, rgba(255, 209, 102, 0.08), transparent 70%),
                rgba(6, 8, 27, 0.96);
            backdrop-filter: blur(8px);
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
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            color: var(--paper-faint);
            text-transform: uppercase;
            letter-spacing: 0.28em;
            margin-bottom: 14px;
        }
        .endgame-winner {
            font-family: 'Anton', sans-serif;
            font-size: 2.4rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .endgame-winner.left  { color: var(--red);  text-shadow: 0 0 30px rgba(255, 90, 74, 0.45); }
        .endgame-winner.right { color: var(--blue); text-shadow: 0 0 30px rgba(62, 200, 255, 0.45); }

        .endgame-score {
            font-family: 'JetBrains Mono', monospace;
            font-size: 4rem;
            font-weight: 700;
            margin-bottom: 32px;
            color: var(--paper);
            line-height: 1;
            font-variant-numeric: tabular-nums;
        }
        .endgame-score .sep { color: rgba(245, 236, 214, 0.2); margin: 0 10px; }

        .endgame-buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .endgame-buttons button {
            padding: 16px;
            border: 0;
            border-radius: 12px;
            font-family: 'Anton', sans-serif;
            font-size: 1.2rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            cursor: pointer;
        }

        .btn-rematch {
            background: var(--paper);
            color: var(--ink);
            box-shadow: 0 8px 22px rgba(245, 236, 214, 0.22);
        }
        .btn-rematch:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
        .btn-rematch:active   { transform: scale(0.98); }
        .btn-done {
            background: rgba(245, 236, 214, 0.08);
            color: var(--paper-soft);
            border: 1px solid var(--paper-line) !important;
        }

        .endgame-hint {
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--paper-faint);
            margin-top: 16px;
        }

        /* Hide scrollbars everywhere */
        *::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }

        /* =====================================================
           Landscape orientation — phone held sideways.
           Layout: slim sidebar (scoreboard + undo + abandon) on one edge,
           massive +1 button taking the rest. The sidebar flips edges based
           on `data-orientation` set by JS so it sits on the user's dominant-
           hand side (home indicator points away from thumb).
           ===================================================== */
        @media (orientation: landscape) and (max-height: 540px) {
            .remote-container { flex-direction: row; }
            body[data-orientation="landscape-right"] .remote-container { flex-direction: row-reverse; }

            /* Scoreboard becomes vertical sidebar */
            .scoreboard {
                width: 36%;
                max-width: 240px;
                padding: 18px 14px calc(18px + env(safe-area-inset-bottom));
                border-bottom: none;
                border-right: 1px solid var(--paper-line);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            body[data-orientation="landscape-right"] .scoreboard {
                border-right: 0;
                border-left: 1px solid var(--paper-line);
            }
            .scoreboard::after { display: none; }

            .scoreboard-scores {
                flex-direction: column;
                gap: 14px;
                width: 100%;
            }
            .scoreboard-divider { display: none; }
            .scoreboard-side { margin-top: 0; }
            .scoreboard-side .player-names { font-size: 0.85rem; max-width: 180px; }
            .scoreboard-side .score-value { font-size: 2.6rem; }
            .scoreboard-side.my-side::after { top: -12px; }

            .serving-info {
                margin-top: 6px;
                font-size: 0.6rem;
                letter-spacing: 0.18em;
            }

            /* +1 takes the rest */
            .plus-area { flex: 1; min-width: 0; }
            .btn-plus { font-size: 6rem; }

            /* Undo + abandon move into the sidebar as slim bottom bars */
            .undo-area,
            .abandon-area {
                position: absolute;
                left: 0; right: auto;
                width: 36%;
                max-width: 240px;
            }
            body[data-orientation="landscape-right"] .undo-area,
            body[data-orientation="landscape-right"] .abandon-area {
                left: auto; right: 0;
            }
            .undo-area {
                bottom: 36px;
                height: auto;
                min-height: 0;
            }
            .btn-undo {
                padding: 12px;
                font-size: 1.1rem;
                border-top: 1px solid rgba(255, 90, 74, 0.2);
            }
            .abandon-area {
                bottom: 0;
            }
            .btn-abandon { padding: 8px; }

            /* Tag sheet slides from the +1 side (right in landscape-left, left in landscape-right) */
            .tag-sheet {
                left: auto;
                right: 0;
                top: 0; bottom: 0;
                width: 64%;
                max-width: 520px;
                max-height: none;
                border-top: 0;
                border-left: 1px solid var(--paper-line);
                padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
                transform: translateX(110%);
            }
            .tag-sheet.visible { transform: translateX(0); }

            body[data-orientation="landscape-right"] .tag-sheet {
                right: auto;
                left: 0;
                border-left: 0;
                border-right: 1px solid var(--paper-line);
                transform: translateX(-110%);
            }
            body[data-orientation="landscape-right"] .tag-sheet.visible { transform: translateX(0); }

            /* Tag sheet: cause row (2 chips) + shots row (4 chips) — all visible without scrolling */
            .tag-sheet-header { margin-bottom: 10px; }
            .tag-row {
                margin-bottom: 10px;
                gap: 10px;
            }
            .tag-shot-rows {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 10px;
            }
            .tag-shot-rows .tag-row {
                display: contents;
            }
            .tag-chip {
                min-height: 76px;
                font-size: 0.85rem;
                padding: 10px;
                gap: 6px;
                border-radius: 14px;
            }
            .tag-chip-icon { font-size: 1.4rem; }
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
        // ----- Orientation detection -----
        // Sets body[data-orientation] = portrait | landscape-left | landscape-right
        // landscape-left  → home indicator on the right (counterclockwise rotation)
        // landscape-right → home indicator on the left  (clockwise rotation)
        (function() {
            function updateOrientation() {
                const so = window.screen && window.screen.orientation;
                let value = 'portrait';
                if (so && so.type) {
                    if (so.type === 'landscape-primary')   value = 'landscape-left';
                    else if (so.type === 'landscape-secondary') value = 'landscape-right';
                    else value = 'portrait';
                } else {
                    // Fallback for older iOS Safari
                    const angle = (typeof window.orientation === 'number') ? window.orientation : 0;
                    if (angle === 90)  value = 'landscape-left';
                    else if (angle === -90 || angle === 270) value = 'landscape-right';
                    else value = 'portrait';
                }
                document.body.setAttribute('data-orientation', value);
            }
            updateOrientation();
            window.addEventListener('orientationchange', updateOrientation);
            if (window.screen && window.screen.orientation) {
                window.screen.orientation.addEventListener('change', updateOrientation);
            }
            // Also listen to resize as a redundancy
            window.addEventListener('resize', updateOrientation);
        })();

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
        let lastPointTags = { shot_type: null, net_edge: false, clip_requested: false, point_cause: null };
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
        const tagChipClip = document.getElementById('tagClip');
        const tagChipCauseEarned = document.getElementById('tagCauseEarned');
        const tagChipCauseError = document.getElementById('tagCauseError');
        const tagShotRows = document.getElementById('tagShotRows');

        function resetTagChipUI() {
            tagChipForehand.classList.remove('selected');
            tagChipBackhand.classList.remove('selected');
            tagChipNet.classList.remove('selected');
            tagChipClip.classList.remove('selected');
            tagChipCauseEarned.classList.remove('selected');
            tagChipCauseError.classList.remove('selected');
            tagShotRows.classList.remove('dimmed');
        }

        function showTagSheet() {
            resetTagChipUI();
            lastPointTags = { shot_type: null, net_edge: false, clip_requested: false, point_cause: null };
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
                clip_requested: lastPointTags.clip_requested,
                point_cause: lastPointTags.point_cause,
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
                    tagShotRows.classList.remove('dimmed');
                } else {
                    lastPointTags.point_cause = value;
                    tagChipCauseEarned.classList.toggle('selected', value === 'winner');
                    tagChipCauseError.classList.toggle('selected', value === 'opponent_error');
                    if (value === 'opponent_error') {
                        lastPointTags.shot_type = null;
                        lastPointTags.net_edge = false;
                        tagChipForehand.classList.remove('selected');
                        tagChipBackhand.classList.remove('selected');
                        tagChipNet.classList.remove('selected');
                        tagShotRows.classList.add('dimmed');
                    } else {
                        tagShotRows.classList.remove('dimmed');
                    }
                }
            } else if (lastPointTags.point_cause === 'opponent_error' && (tag === 'shot' || tag === 'net')) {
                return;
            } else if (tag === 'shot') {
                if (lastPointTags.shot_type === value) {
                    lastPointTags.shot_type = null;
                    (value === 'forehand' ? tagChipForehand : tagChipBackhand).classList.remove('selected');
                } else {
                    lastPointTags.shot_type = value;
                    tagChipForehand.classList.toggle('selected', value === 'forehand');
                    tagChipBackhand.classList.toggle('selected', value === 'backhand');
                }
            } else if (tag === 'net') {
                lastPointTags.net_edge = !lastPointTags.net_edge;
                tagChipNet.classList.toggle('selected', lastPointTags.net_edge);
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
        addTouchHandler(tagChipClip, () => handleTagChip('clip'));
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
