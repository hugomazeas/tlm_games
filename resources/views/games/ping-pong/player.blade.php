@extends('layouts.app')

@section('title', $player->name . ' - Ping Pong Stats')
@section('main-class', 'max-w-6xl mx-auto px-6 py-6')

@section('content')
<style>
    .pps .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid rgba(255,255,255,0.1);
    }

    .pps h1 {
        font-size: 2rem;
        font-weight: 800;
    }

    .pps h1 span { color: #3b82f6; }

    .pps .back-link {
        color: #3b82f6;
        text-decoration: none;
        font-weight: 600;
        padding: 8px 16px;
        border: 2px solid #3b82f6;
        border-radius: 8px;
        transition: all 0.2s;
    }

    .pps .back-link:hover {
        background: #3b82f6;
        color: white;
    }

    .pps .stats-hero {
        display: grid;
        grid-template-columns: 1fr 2fr;
        gap: 16px;
        margin-bottom: 24px;
    }

    .pps .elo-hero {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05));
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 16px;
        padding: 32px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    .pps .elo-hero-value {
        font-size: 3.5rem;
        font-weight: 900;
        color: #3b82f6;
        line-height: 1;
    }

    .pps .elo-hero-label {
        color: rgba(255,255,255,0.5);
        font-size: 0.9rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-top: 6px;
    }

    .pps .elo-hero-peak {
        margin-top: 12px;
        padding: 4px 14px;
        background: rgba(255,255,255,0.06);
        border-radius: 999px;
        font-size: 0.85rem;
        color: rgba(255,255,255,0.5);
    }

    .pps .elo-hero-peak span {
        color: #3b82f6;
        font-weight: 700;
    }

    .pps .elo-hero-streak {
        margin-top: 14px;
        font-size: 0.9rem;
    }

    .pps .stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }

    .pps .stat-card {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 16px 20px;
        text-align: center;
    }

    .pps .stat-value {
        font-size: 1.6rem;
        font-weight: 800;
        color: #3b82f6;
    }

    .pps .stat-label {
        color: rgba(255,255,255,0.5);
        font-size: 0.8rem;
        margin-top: 2px;
    }

    .pps .stat-sub {
        font-size: 0.75rem;
        color: rgba(255,255,255,0.35);
        margin-top: 2px;
    }

    .pps .section {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
    }

    .pps .section h2 {
        font-size: 1.3rem;
        font-weight: 700;
        margin-bottom: 16px;
        color: #3b82f6;
    }

    .pps .h2h-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 10px;
    }

    .pps .h2h-card {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .pps .h2h-name {
        font-weight: 700;
        font-size: 1rem;
    }

    .pps .h2h-record {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
    }

    .pps .h2h-wins { color: #22c55e; }
    .pps .h2h-losses { color: #ef4444; }
    .pps .h2h-sep { color: rgba(255,255,255,0.3); }

    .pps .h2h-chart-wrap {
        display: flex;
        justify-content: center;
        position: relative;
    }

    .pps .h2h-chart-wrap canvas {
        display: block;
    }

    .pps .match-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .pps .match-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 8px;
    }

    .pps .match-result {
        font-weight: 800;
        font-size: 0.85rem;
        padding: 3px 10px;
        border-radius: 999px;
        min-width: 40px;
        text-align: center;
    }

    .pps .match-result.win {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
    }

    .pps .match-result.loss {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
    }

    .pps .match-opponent {
        font-weight: 600;
        min-width: 120px;
    }

    .pps .match-score {
        font-weight: 700;
        font-family: monospace;
        font-size: 1.1rem;
        min-width: 60px;
    }

    .pps .match-duration {
        color: rgba(255,255,255,0.4);
        font-size: 0.85rem;
        min-width: 60px;
    }

    .pps .match-time {
        color: rgba(255,255,255,0.3);
        font-size: 0.8rem;
        margin-left: auto;
    }

    .pps .loading {
        text-align: center;
        padding: 40px;
        color: rgba(255,255,255,0.4);
    }

    .pps .empty {
        text-align: center;
        padding: 24px;
        color: rgba(255,255,255,0.3);
    }

    .pps .streak-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-weight: 700;
        font-size: 0.85rem;
    }

    .pps .streak-badge.W {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
    }

    .pps .streak-badge.L {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
    }

    .pps .elo-chart-container {
        position: relative;
        width: 100%;
        height: 280px;
        margin-top: 12px;
    }

    .pps .elo-chart-container canvas {
        display: block;
        width: 100%;
        height: 100%;
    }

    .pps .elo-mode-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
    }

    .pps .elo-mode-tab {
        padding: 6px 14px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.6);
        transition: all 0.2s;
    }

    .pps .elo-mode-tab:hover {
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.9);
    }

    .pps .elo-mode-tab.active {
        background: rgba(59, 130, 246, 0.2);
        border-color: #3b82f6;
        color: #3b82f6;
    }

    .pps .elo-tooltip {
        position: fixed;
        z-index: 50;
        padding: 8px 12px;
        min-width: 90px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(59, 130, 246, 0.4);
        border-radius: 8px;
        font-size: 0.875rem;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }

    .pps .elo-tooltip .tooltip-date { color: rgba(255,255,255,0.7); font-size: 0.8rem; }
    .pps .elo-tooltip .tooltip-rating { color: #3b82f6; font-weight: 700; font-size: 1.1rem; }

    /* Match row clickable */
    .pps .match-row {
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
    }
    .pps .match-row:hover {
        background: rgba(59, 130, 246, 0.08);
        border-color: rgba(59, 130, 246, 0.2);
    }
    .pps .match-row .match-arrow {
        color: rgba(255,255,255,0.2);
        font-size: 1.1rem;
        transition: color 0.15s, transform 0.15s;
    }
    .pps .match-row:hover .match-arrow {
        color: #3b82f6;
        transform: translateX(2px);
    }

    /* Highlights */
    .pps .highlights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 14px;
    }
    .pps .highlight-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    .pps .highlight-card video {
        width: 100%;
        aspect-ratio: 16/9;
        background: #000;
        display: block;
    }
    .pps .highlight-card .hl-meta {
        padding: 10px 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .pps .highlight-card .hl-matchup {
        font-weight: 700;
        font-size: 0.92rem;
        color: rgba(255,255,255,0.9);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .pps .highlight-card .hl-score {
        font-variant-numeric: tabular-nums;
        color: rgba(255,255,255,0.5);
        font-size: 0.85rem;
    }
    .pps .highlight-card .hl-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 4px;
        font-size: 0.8rem;
        color: rgba(255,255,255,0.4);
    }
    .pps .highlight-card .hl-foot a {
        color: #3b82f6;
        text-decoration: none;
        font-weight: 600;
    }
    .pps .highlight-card .hl-foot a:hover { text-decoration: underline; }
    .pps .hl-duration-pill {
        display: inline-block;
        padding: 2px 8px;
        background: rgba(59,130,246,0.15);
        color: #93c5fd;
        border-radius: 999px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }

    .pps .weekly-chart-wrap {
        width: 100%;
        height: 620px;
        position: relative;
        user-select: none;
        touch-action: none;
        cursor: grab;
    }
    .pps .weekly-chart-wrap.dragging { cursor: grabbing; }
    .pps .weekly-chart-wrap canvas { display: block; }

    .pps .weekly-hint {
        text-align: center;
        font-size: 0.75rem;
        color: rgba(255,255,255,0.35);
        margin-top: 8px;
    }

    .pps .weekly-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 14px;
        flex-wrap: wrap;
    }
    .pps .weekly-tab {
        padding: 6px 14px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.6);
        transition: all 0.15s;
    }
    .pps .weekly-tab:hover {
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.9);
    }
    .pps .weekly-tab.active {
        background: rgba(59, 130, 246, 0.2);
        border-color: #3b82f6;
        color: #3b82f6;
    }

    .pps .weekly-tooltip {
        position: fixed;
        z-index: 50;
        padding: 8px 12px;
        min-width: 120px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(59, 130, 246, 0.4);
        border-radius: 8px;
        font-size: 0.875rem;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .pps .weekly-tooltip .tt-week { color: rgba(255,255,255,0.7); font-size: 0.78rem; }
    .pps .weekly-tooltip .tt-rate { font-weight: 800; font-size: 1.05rem; margin-top: 2px; }
    .pps .weekly-tooltip .tt-wl { color: rgba(255,255,255,0.55); font-size: 0.78rem; margin-top: 2px; }

</style>

<div class="pps" x-data="playerStats()" x-init="init()">
    <div class="header">
        <h1><span>{{ $player->name }}</span> - Ping Pong</h1>
        <a href="{{ url('/games/ping-pong') }}" class="back-link">&larr; Back to Game</a>
    </div>

    <!-- Stats -->
    <div class="stats-hero">
        <!-- ELO Hero Card -->
        <div class="elo-hero">
            <div class="elo-hero-value" x-text="stats.elo_rating ?? '-'"></div>
            <div class="elo-hero-label">ELO Rating</div>
            <div class="elo-hero-peak">
                Peak: <span x-text="stats.highest_elo ?? '-'"></span>
            </div>
            <div class="elo-hero-streak">
                <template x-if="stats.streak > 0">
                    <span :style="'color:' + (stats.streak_type === 'W' ? '#22c55e' : '#ef4444')">
                        Streak: <span x-text="stats.streak"></span>
                    </span>
                </template>
                <template x-if="!stats.streak || stats.streak === 0">
                    <span style="color: rgba(255,255,255,0.3);">No streak</span>
                </template>
            </div>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value" x-text="stats.games_played ?? '-'"></div>
                <div class="stat-label">Games Played</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" x-text="stats.avg_duration ?? '-'"></div>
                <div class="stat-label">Avg Duration</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">
                    <span style="color: #22c55e;" x-text="stats.wins ?? 0"></span>
                    <span style="color: rgba(255,255,255,0.3);"> / </span>
                    <span style="color: #ef4444;" x-text="stats.losses ?? 0"></span>
                </div>
                <div class="stat-label">W / L</div>
                <div class="stat-sub" x-text="(stats.win_rate ?? 0) + '% win rate'"></div>
            </div>
            <div class="stat-card">
                <div class="stat-value">
                    <span style="color: #22c55e;" x-text="stats.avg_duration_win ?? '-'"></span>
                    <span style="color: rgba(255,255,255,0.15);"> / </span>
                    <span style="color: #ef4444;" x-text="stats.avg_duration_loss ?? '-'"></span>
                </div>
                <div class="stat-label">Avg Time W / L</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">
                    <span style="color: #22c55e;" x-text="stats.highest_win_streak ?? 0"></span>
                    <span style="color: rgba(255,255,255,0.15);"> / </span>
                    <span style="color: #ef4444;" x-text="stats.highest_lose_streak ?? 0"></span>
                </div>
                <div class="stat-label">Best Winstreak / Worst Losestreak</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">
                    <span style="color: #22c55e;" x-text="stats.avg_points_win ?? '-'"></span>
                    <span style="color: rgba(255,255,255,0.15);"> / </span>
                    <span style="color: #ef4444;" x-text="stats.avg_points_loss ?? '-'"></span>
                </div>
                <div class="stat-label">Avg Points W / L</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">
                    <span style="color: #22c55e;" x-text="stats.biggest_diff_win ?? '-'"></span>
                    <span style="color: rgba(255,255,255,0.15);"> / </span>
                    <span style="color: #ef4444;" x-text="stats.biggest_diff_loss ?? '-'"></span>
                </div>
                <div class="stat-label">Biggest Diff W / L</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" x-text="getBestSideDisplay()"></div>
                <div class="stat-label">
                    Best Side
                    <template x-if="(stats.left_wins || 0) + (stats.right_wins || 0) > 0">
                        <span x-text="' (Left: ' + (stats.left_wins ?? 0) + ' · Right: ' + (stats.right_wins ?? 0) + ')'"></span>
                    </template>
                </div>
            </div>
        </div>
    </div>

    <!-- ELO History -->
    <div class="section">
        <h2>ELO History</h2>
        <div class="elo-mode-tabs">
            <button class="elo-mode-tab" :class="{ active: eloMode === '1v1' }" @click="eloMode = '1v1'; loadEloHistory();">1v1</button>
            <button class="elo-mode-tab" :class="{ active: eloMode === '2v2' }" @click="eloMode = '2v2'; loadEloHistory();">2v2</button>
        </div>
        <div class="elo-mode-tabs" style="margin-top: 4px;">
            <button type="button" class="elo-mode-tab" :class="{ active: eloChartView === 'line' }" @click="setEloChartView('line')">Line</button>
            <button type="button" class="elo-mode-tab" :class="{ active: eloChartView === 'candle' }" @click="setEloChartView('candle')">Candles</button>
        </div>
        <div class="elo-chart-container" x-show="eloHistory.length > 0" x-ref="eloChartContainer"
             @mousemove="onEloChartMouseMove($event)"
             @mouseleave="eloTooltip.show = false">
            <canvas id="eloChart"></canvas>
            <div class="elo-tooltip" x-show="eloTooltip.show" x-cloak
                 :style="'left: ' + eloTooltip.x + 'px; top: ' + eloTooltip.y + 'px;'">
                <div class="tooltip-date" x-text="eloTooltip.date"></div>
                <template x-if="eloChartView === 'line'">
                    <div class="tooltip-rating" x-text="eloTooltip.rating ? 'ELO ' + eloTooltip.rating : ''"></div>
                </template>
                <template x-if="eloChartView === 'candle'">
                    <div style="margin-top: 6px; font-size: 0.8rem; line-height: 1.45; color: rgba(255,255,255,0.85);">
                        <div x-text="'O ' + eloTooltip.o + ' · H ' + eloTooltip.h"></div>
                        <div x-text="'L ' + eloTooltip.l + ' · C ' + eloTooltip.c"></div>
                    </div>
                </template>
            </div>
        </div>
        <div class="empty" x-show="eloHistory.length === 0 && !loadingEloHistory">No ELO history yet</div>
        <div class="loading" x-show="loadingEloHistory">Loading...</div>
    </div>

    <!-- Weekly Win Rate (3D) -->
    <div class="section">
        <h2>Weekly Win Rate</h2>
        <div class="weekly-tabs" x-show="weekly.length > 0">
            <button class="weekly-tab" :class="{ active: weeklyPreset === '3d' }" @click="setWeeklyPreset('3d')">3D</button>
            <button class="weekly-tab" :class="{ active: weeklyPreset === 'front' }" @click="setWeeklyPreset('front')" title="Look along the opponent axis">Front (week × %)</button>
            <button class="weekly-tab" :class="{ active: weeklyPreset === 'side' }" @click="setWeeklyPreset('side')" title="Look along the week axis">Side (opponent × %)</button>
            <button class="weekly-tab" :class="{ active: weeklyPreset === 'top' }" @click="setWeeklyPreset('top')" title="Look straight down">Top-down</button>
        </div>
        <div class="weekly-chart-wrap"
             x-ref="weeklyContainer"
             :class="{ 'dragging': weeklyDrag.active }"
             x-show="weekly.length > 0"
             @pointerdown="onWeeklyDragStart($event)"
             @pointermove="onWeeklyDragMove($event)"
             @pointerup="onWeeklyDragEnd()"
             @pointerleave="onWeeklyDragEnd()"
             @wheel.prevent="onWeeklyWheel($event)">
            <canvas x-ref="weeklyCanvas"></canvas>
        </div>
        <div class="weekly-hint" x-show="weekly.length > 0">Drag to rotate · scroll to zoom</div>
        <div class="empty" x-show="weekly.length === 0 && !loadingWeekly">No matches yet</div>
        <div class="loading" x-show="loadingWeekly">Loading...</div>
        <div class="weekly-tooltip"
             x-show="weeklyTooltip.show"
             :style="`left:${weeklyTooltip.x}px; top:${weeklyTooltip.y}px;`">
            <div class="tt-week" x-text="weeklyTooltip.week"></div>
            <div class="tt-week" x-text="weeklyTooltip.opp"></div>
            <div class="tt-rate" :style="`color:${weeklyTooltip.color};`" x-text="weeklyTooltip.rate"></div>
            <div class="tt-wl" x-text="weeklyTooltip.wl"></div>
        </div>
    </div>

    <!-- Head to Head -->
    <div class="section">
        <h2>Head-to-Head</h2>
        <div class="h2h-chart-wrap" x-ref="h2hContainer" x-show="h2h.length > 0">
            <canvas x-ref="h2hCanvas"></canvas>
        </div>
        <div class="empty" x-show="h2h.length === 0 && !loadingH2h">No matches yet</div>
        <div class="loading" x-show="loadingH2h">Loading...</div>
    </div>

    <!-- Highlights -->
    <div class="section">
        <h2>Highlights</h2>
        <div class="highlights-grid" x-show="highlights.length > 0">
            <template x-for="clip in highlights" :key="clip.id">
                <div class="highlight-card">
                    <video :src="clip.url" controls preload="metadata" playsinline></video>
                    <div class="hl-meta">
                        <div class="hl-matchup" x-text="(clip.match?.left_label || '?') + ' vs ' + (clip.match?.right_label || '?')"></div>
                        <div class="hl-score">
                            <span x-text="(clip.match?.player_left_score ?? '-') + ' – ' + (clip.match?.player_right_score ?? '-')"></span>
                            <span style="margin-left:8px;" x-text="highlightDate(clip)"></span>
                        </div>
                        <div class="hl-foot">
                            <span class="hl-duration-pill" x-text="Number(clip.duration_seconds).toFixed(1) + 's'"></span>
                            <a :href="'/games/ping-pong/matches/' + clip.match_id">View match &rsaquo;</a>
                        </div>
                    </div>
                </div>
            </template>
        </div>
        <div class="empty" x-show="highlights.length === 0 && !loadingHighlights">No highlights yet</div>
        <div class="loading" x-show="loadingHighlights">Loading...</div>
    </div>

    <!-- Match History -->
    <div class="section">
        <h2>Match History</h2>
        <div class="match-list" x-show="matches.length > 0">
            <template x-for="m in matches" :key="m.id">
                <a class="match-row" :href="'/games/ping-pong/matches/' + m.id" style="text-decoration:none;color:inherit;">
                    <div class="match-result" :class="m.won ? 'win' : 'loss'" x-text="m.won ? 'W' : 'L'"></div>
                    <div class="match-opponent" x-text="'vs ' + m.opponent.name"></div>
                    <div class="match-score" x-text="m.player_score + ' - ' + m.opponent_score"></div>
                    <div class="match-duration" x-text="m.duration_formatted || '-'"></div>
                    <div class="match-time" x-text="m.ended_at_human"></div>
                    <div class="match-arrow">&rsaquo;</div>
                </a>
            </template>
        </div>
        <div class="empty" x-show="matches.length === 0 && !loadingMatches">No matches yet</div>
        <div class="loading" x-show="loadingMatches">Loading...</div>
    </div>

</div>
<script>
function playerStats() {
    return {
        API: '/games/ping-pong/api',
        playerId: {{ $player->id }},
        playerName: '{{ $player->name }}',
        stats: {},
        h2h: [],
        matches: [],
        eloHistory: [],
        eloCandles: [],
        eloMode: '1v1',
        eloChartView: 'line',
        eloTooltip: { show: false, date: '', rating: '', o: '', h: '', l: '', c: '', x: 0, y: 0 },
        eloChartData: null,
        loadingH2h: true,
        loadingMatches: true,
        loadingEloHistory: true,
        highlights: [],
        loadingHighlights: true,
        insights: null,
        weekly: [],            // cells
        weeklyWeeks: [],
        weeklyOpponents: [],
        loadingWeekly: true,
        weeklyPreset: '3d',
        weeklyView: { azimuth: -0.55 + Math.PI, elevation: 0.5, zoom: 1 },
        weeklyDrag: { active: false, x: 0, y: 0, pointerId: null },
        weeklyHit: [],
        weeklyTooltip: { show: false, x: 0, y: 0, week: '', opp: '', rate: '', wl: '', color: '#22c55e' },

        async init() {
            await Promise.all([
                this.loadStats(),
                this.loadH2h(),
                this.loadMatches(),
                this.loadEloHistory(),
                this.loadHighlights(),
                this.loadWeekly(),
                this.loadInsights(),
            ]);
            window.addEventListener('resize', () => {
                if (this.eloHistory.length > 0) this.renderEloChart();
                if (this.h2h.length > 0) this.renderH2hChart();
                if (this.weekly.length > 0) this.renderWeeklyChart();
            });
        },

        setEloChartView(view) {
            if (this.eloChartView === view) return;
            this.eloChartView = view;
            this.eloTooltip.show = false;
            this.$nextTick(() => this.renderEloChart());
        },

        getBestSideDisplay() {
            const side = this.stats?.best_side;
            if (side === 'left') return 'Left';
            if (side === 'right') return 'Right';
            if (side === 'tie') return 'Tie';
            return '-';
        },

        async loadStats() {
            try {
                const res = await fetch(`${this.API}/players/${this.playerId}/stats`);
                const data = await res.json();
                this.stats = data;
            } catch (err) {
                console.error('Error loading stats:', err);
            }
        },

        async loadH2h() {
            try {
                const res = await fetch(`${this.API}/players/${this.playerId}/head-to-head`);
                const data = await res.json();
                this.h2h = data.records;
                this.$nextTick(() => this.renderH2hChart());
            } catch (err) {
                console.error('Error loading h2h:', err);
            }
            this.loadingH2h = false;
        },

        async loadWeekly() {
            try {
                const res = await fetch(`${this.API}/players/${this.playerId}/weekly-stats`);
                const data = await res.json();
                this.weekly = data.cells || [];
                this.weeklyWeeks = data.weeks || [];
                this.weeklyOpponents = data.opponents || [];
                this.$nextTick(() => {
                    this.renderWeeklyChart();
                    // Some browsers report 0 width on the first paint when the section was
                    // hidden until x-show updated. Watch the container and retry on resize.
                    const wrap = this.$refs.weeklyContainer;
                    if (wrap && !this._weeklyObserver && 'ResizeObserver' in window) {
                        this._weeklyObserver = new ResizeObserver(() => this.renderWeeklyChart());
                        this._weeklyObserver.observe(wrap);
                    }
                });
            } catch (err) {
                console.error('Error loading weekly stats:', err);
            }
            this.loadingWeekly = false;
        },

        onWeeklyDragStart(e) {
            const wrap = this.$refs.weeklyContainer;
            if (!wrap) return;
            this.weeklyDrag.active = true;
            this.weeklyDrag.x = e.clientX;
            this.weeklyDrag.y = e.clientY;
            this.weeklyDrag.pointerId = e.pointerId;
            this.weeklyTooltip.show = false;
            try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
        },

        onWeeklyDragMove(e) {
            if (this.weeklyDrag.active) {
                const dx = e.clientX - this.weeklyDrag.x;
                const dy = e.clientY - this.weeklyDrag.y;
                this.weeklyDrag.x = e.clientX;
                this.weeklyDrag.y = e.clientY;
                this.weeklyView.azimuth += dx * 0.01;
                let el = this.weeklyView.elevation - dy * 0.01;
                if (el < 0) el = 0;
                if (el > Math.PI / 2) el = Math.PI / 2;
                this.weeklyView.elevation = el;
                // Any manual drag drops us out of axis-aligned presets
                this.weeklyPreset = '3d';
                this.renderWeeklyChart();
                return;
            }
            this.updateWeeklyTooltip(e);
        },

        setWeeklyPreset(name) {
            this.weeklyPreset = name;
            switch (name) {
                case 'front': // Look along opponent (+Z) axis — show week × win rate
                    this.weeklyView.azimuth = 0;
                    this.weeklyView.elevation = 0;
                    break;
                case 'side': // Look along week (+X) axis — show opponent × win rate
                    this.weeklyView.azimuth = -Math.PI / 2;
                    this.weeklyView.elevation = 0;
                    break;
                case 'top': // Look straight down — show week × opponent heatmap
                    this.weeklyView.azimuth = 0;
                    this.weeklyView.elevation = Math.PI / 2;
                    break;
                case '3d':
                default:
                    this.weeklyView.azimuth = -0.55 + Math.PI;
                    this.weeklyView.elevation = 0.5;
                    break;
            }
            this.weeklyView.zoom = 1;
            this.weeklyTooltip.show = false;
            this.renderWeeklyChart();
        },

        onWeeklyDragEnd() {
            this.weeklyDrag.active = false;
            this.weeklyDrag.pointerId = null;
        },

        onWeeklyWheel(e) {
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            let z = this.weeklyView.zoom * factor;
            if (z < 0.5) z = 0.5;
            if (z > 3) z = 3;
            this.weeklyView.zoom = z;
            this.renderWeeklyChart();
        },

        updateWeeklyTooltip(e) {
            if (this.weeklyHit.length === 0) { this.weeklyTooltip.show = false; return; }
            const wrap = this.$refs.weeklyContainer;
            if (!wrap) return;
            const rect = wrap.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            let best = null;
            let bestDist = Infinity;
            for (const hit of this.weeklyHit) {
                const dx = mx - hit.sx;
                const dy = my - hit.sy;
                const d = dx * dx + dy * dy;
                if (d < bestDist) { bestDist = d; best = hit; }
            }
            if (best && bestDist < 50 * 50) {
                const cell = best.cell;
                const wk = this.weeklyWeeks.find(w => w.week_start === cell.week);
                const opp = this.weeklyOpponents.find(o => o.id === cell.opponent_id);
                const ratePct = Math.round(cell.win_rate * 100);
                this.weeklyTooltip.show = true;
                this.weeklyTooltip.x = e.clientX + 14;
                this.weeklyTooltip.y = e.clientY + 14;
                this.weeklyTooltip.week = wk ? 'Week of ' + wk.week_label : '';
                this.weeklyTooltip.opp = opp ? 'vs ' + opp.name : '';
                this.weeklyTooltip.rate = ratePct + '% win rate';
                this.weeklyTooltip.wl = cell.wins + 'W – ' + cell.losses + 'L (' + cell.games + ' game' + (cell.games === 1 ? '' : 's') + ')';
                this.weeklyTooltip.color = cell.win_rate >= 0.5 ? '#22c55e' : '#ef4444';
            } else {
                this.weeklyTooltip.show = false;
            }
        },

        renderWeeklyChart() {
            const canvas = this.$refs.weeklyCanvas;
            const container = this.$refs.weeklyContainer;
            if (!canvas || !container || this.weekly.length === 0) return;
            const rect = container.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const dpr = window.devicePixelRatio || 1;
            const w = rect.width;
            const h = rect.height;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';

            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const weeks = this.weeklyWeeks;
            const opps = this.weeklyOpponents;
            const cells = this.weekly;
            if (weeks.length === 0 || opps.length === 0) return;

            // Index lookups
            const weekIdx = {};
            weeks.forEach((wk, i) => weekIdx[wk.week_start] = i);
            const oppIdx = {};
            opps.forEach((o, j) => oppIdx[o.id] = j);

            // World layout — floor is the (X, Z) plane; bars rise along Y by win_rate.
            const xSpacing = 1.4;            // weeks along X (floor)
            const zSpacing = 1.1;            // opponents along Z (floor depth)
            const yScale = 3.0;              // win_rate * yScale = bar height (up)
            const barHalfX = 0.35;
            const barHalfZ = 0.35;
            const xTotal = (weeks.length - 1) * xSpacing;
            const zTotal = (opps.length - 1) * zSpacing;
            const xOffset = -xTotal / 2;
            const zOffset = -zTotal / 2;

            // Camera
            const az = this.weeklyView.azimuth;
            const el = this.weeklyView.elevation;
            const sinA = Math.sin(az), cosA = Math.cos(az);
            const sinE = Math.sin(el), cosE = Math.cos(el);

            // ---- Floor (y=0 plane) ----
            const floorMinX = xOffset - 0.7;
            const floorMaxX = xOffset + xTotal + 0.7;
            const floorMinZ = zOffset - 0.6;
            const floorMaxZ = zOffset + zTotal + 0.6;

            // Unit (unscaled, uncentered) projection
            const unitProject = (x, y, z) => {
                const x1 = cosA * x + sinA * z;
                const z1 = -sinA * x + cosA * z;
                const y2 = cosE * y - sinE * z1;
                const z2 = sinE * y + cosE * z1;
                return { ux: x1, uy: -y2, depth: z2 };
            };

            // Auto-fit: project the 8 corners of the data volume, get bounds
            const fitPoints = [
                [floorMinX, 0, floorMinZ], [floorMaxX, 0, floorMinZ],
                [floorMinX, 0, floorMaxZ], [floorMaxX, 0, floorMaxZ],
                [floorMinX, yScale, floorMinZ], [floorMaxX, yScale, floorMinZ],
                [floorMinX, yScale, floorMaxZ], [floorMaxX, yScale, floorMaxZ],
            ];
            let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
            for (const p of fitPoints) {
                const u = unitProject(p[0], p[1], p[2]);
                if (u.ux < minU) minU = u.ux;
                if (u.ux > maxU) maxU = u.ux;
                if (u.uy < minV) minV = u.uy;
                if (u.uy > maxV) maxV = u.uy;
            }
            const marginL = 140, marginR = 60, marginT = 40, marginB = 50;
            const spanU = Math.max(0.001, maxU - minU);
            const spanV = Math.max(0.001, maxV - minV);
            const scale = Math.min(
                (w - marginL - marginR) / spanU,
                (h - marginT - marginB) / spanV
            ) * this.weeklyView.zoom;
            const cx = (w + marginL - marginR) / 2 - ((minU + maxU) / 2) * scale;
            const cy = (h + marginT - marginB) / 2 - ((minV + maxV) / 2) * scale;

            const project = (x, y, z) => {
                const u = unitProject(x, y, z);
                return { sx: cx + u.ux * scale, sy: cy + u.uy * scale, depth: u.depth };
            };

            // Floor fill (y=0)
            const f1 = project(floorMinX, 0, floorMinZ);
            const f2 = project(floorMaxX, 0, floorMinZ);
            const f3 = project(floorMaxX, 0, floorMaxZ);
            const f4 = project(floorMinX, 0, floorMaxZ);
            ctx.beginPath();
            ctx.moveTo(f1.sx, f1.sy);
            ctx.lineTo(f2.sx, f2.sy);
            ctx.lineTo(f3.sx, f3.sy);
            ctx.lineTo(f4.sx, f4.sy);
            ctx.closePath();
            ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Floor grid: lines per opponent (along X) and per week (along Z)
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            for (let j = 0; j < opps.length; j++) {
                const zj = zOffset + j * zSpacing;
                const a = project(floorMinX, 0, zj);
                const b = project(floorMaxX, 0, zj);
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
            }
            for (let i = 0; i < weeks.length; i++) {
                const xi = xOffset + i * xSpacing;
                const a = project(xi, 0, floorMinZ);
                const b = project(xi, 0, floorMaxZ);
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
            }

            // Horizontal reference rings at 50% and 100% win rate, projected along the back edge
            const yMarks = [0.5, 1.0];
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.setLineDash([3, 4]);
            for (const yr of yMarks) {
                const y = yr * yScale;
                const a = project(floorMinX, y, floorMaxZ);
                const b = project(floorMaxX, y, floorMaxZ);
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // ---- Axis labels ----
            // X (weeks) along the front edge of the floor (z = floorMinZ)
            const labelStep = Math.max(1, Math.ceil(weeks.length / 10));
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '600 14px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let i = 0; i < weeks.length; i++) {
                if (i % labelStep !== 0 && i !== weeks.length - 1) continue;
                const xi = xOffset + i * xSpacing;
                const p = project(xi, 0, floorMinZ);
                ctx.fillText(weeks[i].week_label, p.sx, p.sy + 8);
            }

            // Z (opponents) along the left edge of the floor (x = floorMinX)
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '700 15px Outfit, sans-serif';
            for (let j = 0; j < opps.length; j++) {
                const zj = zOffset + j * zSpacing;
                const p = project(floorMinX, 0, zj);
                ctx.fillText(opps[j].name, p.sx - 10, p.sy);
            }

            // Y (% win rate) labels at the back-left vertical edge
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '600 13px Outfit, sans-serif';
            for (const yr of yMarks) {
                const p = project(floorMinX, yr * yScale, floorMaxZ);
                ctx.fillText(Math.round(yr * 100) + '%', p.sx - 10, p.sy);
            }

            // ---- Bars ----
            const barColor = (wr, lightness) => {
                const hue = wr * 130; // 0 red → 65 yellow → 130 green
                return `hsl(${hue}, 70%, ${lightness}%)`;
            };

            // Build all bar cuboids, painter-sort by centroid depth (back→front).
            // Each bar sits on the floor and rises in Y by win_rate * yScale.
            // Corner index convention: aXYZ where X = ±X, Y = base(0)/top(1), Z = ±Z.
            const bars = [];
            for (const cell of cells) {
                const i = weekIdx[cell.week];
                const j = oppIdx[cell.opponent_id];
                if (i === undefined || j === undefined) continue;
                const wr = cell.win_rate;
                const xi = xOffset + i * xSpacing;
                const zj = zOffset + j * zSpacing;
                const yTop = Math.max(0.001, wr * yScale);

                const c = {
                    a000: project(xi - barHalfX, 0,    zj - barHalfZ),
                    a100: project(xi + barHalfX, 0,    zj - barHalfZ),
                    a001: project(xi - barHalfX, 0,    zj + barHalfZ),
                    a101: project(xi + barHalfX, 0,    zj + barHalfZ),
                    a010: project(xi - barHalfX, yTop, zj - barHalfZ),
                    a110: project(xi + barHalfX, yTop, zj - barHalfZ),
                    a011: project(xi - barHalfX, yTop, zj + barHalfZ),
                    a111: project(xi + barHalfX, yTop, zj + barHalfZ),
                };

                let centerDepth = 0;
                for (const k in c) centerDepth += c[k].depth;
                centerDepth /= 8;

                bars.push({ cell, wr, corners: c, centerDepth });
            }

            bars.sort((a, b) => a.centerDepth - b.centerDepth);

            const drawQuad = (p1, p2, p3, p4, fill, stroke) => {
                ctx.beginPath();
                ctx.moveTo(p1.sx, p1.sy);
                ctx.lineTo(p2.sx, p2.sy);
                ctx.lineTo(p3.sx, p3.sy);
                ctx.lineTo(p4.sx, p4.sy);
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
                if (stroke) {
                    ctx.strokeStyle = stroke;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            };

            const hitInfo = [];
            for (const bar of bars) {
                const c = bar.corners;
                const wr = bar.wr;
                const baseL = 28 + wr * 12;
                const topFill = barColor(wr, baseL + 20);     // bright cap (lit from above)
                const sideFill = barColor(wr, baseL + 2);     // side walls
                const sideDimFill = barColor(wr, baseL - 6);
                const bottomFill = barColor(wr, baseL - 14);
                const edge = 'rgba(0,0,0,0.4)';

                // Faces: top (y=top), bottom (y=0), and the 4 sides.
                const topDepth = (c.a010.depth + c.a110.depth + c.a011.depth + c.a111.depth) / 4;
                const botDepth = (c.a000.depth + c.a100.depth + c.a001.depth + c.a101.depth) / 4;
                const rightDepth = (c.a100.depth + c.a110.depth + c.a101.depth + c.a111.depth) / 4;
                const leftDepth  = (c.a000.depth + c.a010.depth + c.a001.depth + c.a011.depth) / 4;
                const frontDepth = (c.a001.depth + c.a101.depth + c.a011.depth + c.a111.depth) / 4;
                const backDepth  = (c.a000.depth + c.a100.depth + c.a010.depth + c.a110.depth) / 4;

                const visible = [];
                if (topDepth >= botDepth) {
                    visible.push({ d: topDepth, fill: topFill, pts: [c.a010, c.a110, c.a111, c.a011] });
                } else {
                    visible.push({ d: botDepth, fill: bottomFill, pts: [c.a000, c.a100, c.a101, c.a001] });
                }
                if (rightDepth >= leftDepth) {
                    visible.push({ d: rightDepth, fill: sideFill, pts: [c.a100, c.a110, c.a111, c.a101] });
                } else {
                    visible.push({ d: leftDepth, fill: sideFill, pts: [c.a000, c.a010, c.a011, c.a001] });
                }
                if (frontDepth >= backDepth) {
                    visible.push({ d: frontDepth, fill: sideDimFill, pts: [c.a001, c.a101, c.a111, c.a011] });
                } else {
                    visible.push({ d: backDepth, fill: sideDimFill, pts: [c.a000, c.a100, c.a110, c.a010] });
                }
                visible.sort((a, b) => a.d - b.d);
                for (const f of visible) drawQuad(f.pts[0], f.pts[1], f.pts[2], f.pts[3], f.fill, edge);

                // Glow accent on the cap for >=50% bars
                if (wr >= 0.5) {
                    ctx.save();
                    ctx.shadowColor = 'rgba(34, 197, 94, 0.35)';
                    ctx.shadowBlur = 6 + wr * 12;
                    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(c.a010.sx, c.a010.sy);
                    ctx.lineTo(c.a110.sx, c.a110.sy);
                    ctx.lineTo(c.a111.sx, c.a111.sy);
                    ctx.lineTo(c.a011.sx, c.a011.sy);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();
                }

                // Hit-test point: centroid of top face
                const hx = (c.a010.sx + c.a110.sx + c.a111.sx + c.a011.sx) / 4;
                const hy = (c.a010.sy + c.a110.sy + c.a111.sy + c.a011.sy) / 4;
                hitInfo.push({ cell: bar.cell, sx: hx, sy: hy });
            }
            this.weeklyHit = hitInfo;

            ctx.setTransform(1, 0, 0, 1, 0, 0);
        },

        async loadHighlights() {
            try {
                const res = await fetch(`${this.API}/players/${this.playerId}/highlights`);
                this.highlights = await res.json();
            } catch (err) {
                console.error('Error loading highlights:', err);
                this.highlights = [];
            }
            this.loadingHighlights = false;
        },

        async loadInsights() {
            try {
                const res = await fetch(`${this.API}/players/${this.playerId}/practice-insights`);
                this.insights = await res.json();
            } catch (err) {
                console.error('Error loading insights:', err);
                this.insights = null;
            }
        },

        hasInsights() {
            const i = this.insights;
            if (!i) return false;
            const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
            return sum(i.serve) + sum(i.wing) + sum(i.errors) > 0;
        },

        highlightDate(clip) {
            const iso = clip.match?.ended_at || clip.created_at;
            if (!iso) return '';
            const d = new Date(iso);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },

        async loadMatches() {
            try {
                const res = await fetch(`${this.API}/players/${this.playerId}/matches`);
                const data = await res.json();
                this.matches = data.matches;
            } catch (err) {
                console.error('Error loading matches:', err);
            }
            this.loadingMatches = false;
        },

        async loadEloHistory() {
            this.loadingEloHistory = true;
            try {
                const res = await fetch(`${this.API}/players/${this.playerId}/elo-history?mode=${this.eloMode}`);
                const data = await res.json();
                this.eloHistory = data.history || [];
                this.eloCandles = data.candles || [];
                this.$nextTick(() => this.renderEloChart());
            } catch (err) {
                console.error('Error loading ELO history:', err);
                this.eloHistory = [];
                this.eloCandles = [];
            }
            this.loadingEloHistory = false;
        },

        renderH2hChart() {
            const canvas = this.$refs.h2hCanvas;
            const container = this.$refs.h2hContainer;
            if (!canvas || !container || this.h2h.length === 0) return;
            const rect = container.getBoundingClientRect();
            if (rect.width <= 0) return;

            const dpr = window.devicePixelRatio || 1;
            const w = rect.width;
            const h = 480;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';

            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const cx = w / 2;
            const cy = h / 2;
            const records = this.h2h;
            const n = records.length;
            const maxGames = Math.max(...records.map(r => r.wins + r.losses));
            const centerR = 38;
            const outerR = Math.min(w / 2, h / 2) - 80;
            const nodeR = 26;

            // Background grid circles
            for (let r = 1; r <= 3; r++) {
                ctx.beginPath();
                ctx.arc(cx, cy, (outerR / 3) * r, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.04)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Background spoke lines
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * (centerR + 2), cy + Math.sin(a) * (centerR + 2));
                ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
                ctx.strokeStyle = 'rgba(255,255,255,0.03)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Outer polygon
            if (n > 2) {
                ctx.beginPath();
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                    const px = cx + Math.cos(a) * outerR;
                    const py = cy + Math.sin(a) * outerR;
                    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Dominance-filled polygon (win rate distance from center)
            if (n > 2) {
                ctx.beginPath();
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                    const total = records[i].wins + records[i].losses;
                    const wr = total > 0 ? records[i].wins / total : 0.5;
                    const dist = centerR + (outerR - centerR) * wr;
                    const px = cx + Math.cos(a) * dist;
                    const py = cy + Math.sin(a) * dist;
                    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // Each spoke + node
            records.forEach((record, i) => {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const total = record.wins + record.losses;
                const winRate = total > 0 ? record.wins / total : 0.5;
                const name = record.opponent?.name || String(record.opponent);

                const ox = cx + Math.cos(angle) * outerR;
                const oy = cy + Math.sin(angle) * outerR;

                // Spoke line
                const lineW = 2 + (total / maxGames) * 5;
                const sx = cx + Math.cos(angle) * (centerR + 4);
                const sy = cy + Math.sin(angle) * (centerR + 4);
                const ex = ox - Math.cos(angle) * (nodeR + 6);
                const ey = oy - Math.sin(angle) * (nodeR + 6);

                const grad = ctx.createLinearGradient(sx, sy, ex, ey);
                grad.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
                const endColor = winRate >= 0.5
                    ? `rgba(34, 197, 94, ${0.3 + winRate * 0.5})`
                    : `rgba(239, 68, 68, ${0.3 + (1 - winRate) * 0.5})`;
                grad.addColorStop(1, endColor);

                ctx.save();
                ctx.shadowColor = winRate >= 0.5 ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.strokeStyle = grad;
                ctx.lineWidth = lineW;
                ctx.stroke();
                ctx.restore();

                // Dominance ring
                const ringR = nodeR + 5;
                const startA = -Math.PI / 2;
                const winArc = winRate * Math.PI * 2;
                ctx.lineCap = 'round';
                if (record.wins > 0) {
                    ctx.beginPath();
                    ctx.arc(ox, oy, ringR, startA, startA + winArc);
                    ctx.strokeStyle = '#22c55e';
                    ctx.lineWidth = 3.5;
                    ctx.stroke();
                }
                if (record.losses > 0) {
                    ctx.beginPath();
                    ctx.arc(ox, oy, ringR, startA + winArc, startA + Math.PI * 2);
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 3.5;
                    ctx.stroke();
                }
                ctx.lineCap = 'butt';

                // Node circle
                ctx.beginPath();
                ctx.arc(ox, oy, nodeR, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Initial
                ctx.fillStyle = winRate >= 0.5 ? '#22c55e' : '#ef4444';
                ctx.font = 'bold 16px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name.charAt(0).toUpperCase(), ox, oy);

                // Labels — positioned on the outer side of the node
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                const labelOff = nodeR + 18;
                let lx, nameY, wlY, align;

                if (Math.abs(sinA) > Math.abs(cosA)) {
                    // Top or bottom
                    lx = ox;
                    align = 'center';
                    if (sinA < 0) { nameY = oy - labelOff - 14; wlY = oy - labelOff; }
                    else { nameY = oy + labelOff; wlY = nameY + 14; }
                } else {
                    // Left or right
                    lx = cosA > 0 ? ox + labelOff : ox - labelOff;
                    align = cosA > 0 ? 'left' : 'right';
                    nameY = oy - 7;
                    wlY = oy + 7;
                }

                ctx.textAlign = align;
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.font = '600 12px Outfit, sans-serif';
                ctx.fillText(name, lx, nameY);
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.font = '11px Outfit, sans-serif';
                ctx.fillText(record.wins + 'W \u2013 ' + record.losses + 'L', lx, wlY);
            });

            // Center glow
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerR * 2.8);
            glow.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
            glow.addColorStop(0.4, 'rgba(59, 130, 246, 0.08)');
            glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, centerR * 2.8, 0, Math.PI * 2);
            ctx.fill();

            // Center circle
            ctx.beginPath();
            ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Player name
            ctx.fillStyle = '#3b82f6';
            ctx.font = 'bold 15px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.playerName, cx, cy);

            ctx.setTransform(1, 0, 0, 1, 0, 0);
        },

        renderEloChart() {
            if (this.eloHistory.length === 0) return;
            const canvas = document.getElementById('eloChart');
            const container = this.$refs.eloChartContainer;
            if (!canvas || !container) return;
            const rect = container.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const pts = this.eloHistory;
            const candles = this.eloCandles.length === pts.length ? this.eloCandles : pts.map((p, i) => ({
                date: p.created_at,
                open: p.rating_after,
                high: p.rating_after,
                low: p.rating_after,
                close: p.rating_after,
                created_at: p.created_at,
            }));
            const values = pts.map(p => p.rating_after);
            let rawMin;
            let rawMax;
            if (this.eloChartView === 'line') {
                rawMin = Math.min(1200, ...values);
                rawMax = Math.max(1200, ...values);
            } else {
                rawMin = Math.min(1200, ...candles.map(c => c.low));
                rawMax = Math.max(1200, ...candles.map(c => c.high));
            }
            const minY = Math.floor((rawMin - 40) / 50) * 50;
            const maxY = Math.ceil((rawMax + 40) / 50) * 50;
            const targetTicks = 6;
            const roughStep = (maxY - minY) / targetTicks;
            const yStep = roughStep <= 25 ? 25 : (roughStep <= 50 ? 50 : (roughStep <= 100 ? 100 : 200));
            const yTicks = [];
            for (let v = Math.ceil(minY / yStep) * yStep; v <= maxY; v += yStep) yTicks.push(v);
            if (yTicks.length === 0) yTicks.push(1200);
            const chartMinY = yTicks[0];
            const chartMaxY = Math.max(yTicks[yTicks.length - 1] ?? chartMinY, chartMinY + 50);
            const w = rect.width;
            const h = rect.height;
            const pad = { left: 48, right: 24, top: 16, bottom: 44 };
            const chartW = w - pad.left - pad.right;
            const chartH = h - pad.top - pad.bottom;
            const yRange = chartMaxY - chartMinY || 100;
            const toY = (v) => pad.top + chartH - ((v - chartMinY) / yRange) * chartH;
            const toXLine = (i) => pad.left + (i / Math.max(1, values.length - 1)) * chartW;
            ctx.clearRect(0, 0, w, h);
            ctx.font = '11px Outfit, sans-serif';
            yTicks.forEach((v) => {
                const y = toY(v);
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(pad.left + chartW, y);
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.textAlign = 'right';
                ctx.fillText(String(v), pad.left - 8, y + 4);
            });
            const maxXLabels = 8;
            const xStep = Math.max(1, Math.floor(pts.length / maxXLabels));
            const xIndices = [];
            for (let i = 0; i < pts.length; i += xStep) xIndices.push(i);
            if (pts.length > 0 && xIndices[xIndices.length - 1] !== pts.length - 1) xIndices.push(pts.length - 1);
            const xAtIndex = (i) => this.eloChartView === 'line'
                ? toXLine(i)
                : pad.left + (i + 0.5) * (chartW / Math.max(1, candles.length));
            xIndices.forEach((i) => {
                const x = xAtIndex(i);
                const d = pts[i]?.created_at ? new Date(pts[i].created_at) : null;
                const label = d ? (d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: pts.length > 30 ? '2-digit' : undefined })) : (i + 1);
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.textAlign = i === 0 ? 'left' : (i === pts.length - 1 ? 'right' : 'center');
                ctx.fillText(label, x, pad.top + chartH + 20);
            });
            if (this.eloChartView === 'line') {
                ctx.beginPath();
                ctx.moveTo(toXLine(0), toY(values[0]));
                for (let i = 1; i < values.length; i++) ctx.lineTo(toXLine(i), toY(values[i]));
                ctx.lineTo(toXLine(values.length - 1), pad.top + chartH);
                ctx.lineTo(toXLine(0), pad.top + chartH);
                ctx.closePath();
                ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(toXLine(0), toY(values[0]));
                for (let i = 1; i < values.length; i++) ctx.lineTo(toXLine(i), toY(values[i]));
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
                ctx.lineWidth = 2;
                ctx.stroke();
                this.eloChartData = { view: 'line', pts, values, pad, chartW, chartH, n: values.length };
            } else {
                const n = candles.length;
                const slotW = chartW / Math.max(1, n);
                const bodyW = Math.min(slotW * 0.72, 12);
                for (let i = 0; i < n; i++) {
                    const c = candles[i];
                    const cx = pad.left + (i + 0.5) * slotW;
                    const yHi = toY(c.high);
                    const yLo = toY(c.low);
                    const yO = toY(c.open);
                    const yC = toY(c.close);
                    ctx.beginPath();
                    ctx.moveTo(cx, yHi);
                    ctx.lineTo(cx, yLo);
                    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    const bull = c.close >= c.open;
                    const top = Math.min(yO, yC);
                    const bodyH = Math.max(Math.abs(yC - yO), 1);
                    ctx.fillStyle = bull ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)';
                    ctx.strokeStyle = bull ? '#22c55e' : '#ef4444';
                    ctx.fillRect(cx - bodyW / 2, top, bodyW, bodyH);
                    ctx.strokeRect(cx - bodyW / 2, top, bodyW, bodyH);
                }
                this.eloChartData = { view: 'candle', candles, pts, pad, chartW, chartH, n };
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        },

        onEloChartMouseMove(e) {
            if (!this.eloChartData || this.eloHistory.length === 0) return;
            const { pad, chartW, n } = this.eloChartData;
            const rect = this.$refs.eloChartContainer?.getBoundingClientRect();
            if (!rect) return;
            const mouseX = e.clientX - rect.left;
            if (mouseX < pad.left || mouseX > pad.left + chartW) {
                this.eloTooltip.show = false;
                return;
            }
            const offset = 12;
            let tx = e.clientX + offset;
            let ty = e.clientY + offset;
            if (tx + 140 > window.innerWidth) tx = e.clientX - 150;
            if (ty + 72 > window.innerHeight) ty = e.clientY - 68;
            if (this.eloChartData.view === 'candle') {
                const { candles } = this.eloChartData;
                const slotW = chartW / Math.max(1, n);
                let best = 0;
                let bestDist = Infinity;
                for (let i = 0; i < n; i++) {
                    const cx = pad.left + (i + 0.5) * slotW;
                    const dist = Math.abs(mouseX - cx);
                    if (dist < bestDist) { bestDist = dist; best = i; }
                }
                const c = candles[best];
                const d = c?.created_at ? new Date(c.created_at) : null;
                const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                this.eloTooltip = {
                    show: true, date: dateStr, rating: '',
                    o: String(c.open), h: String(c.high), l: String(c.low), c: String(c.close),
                    x: tx, y: ty,
                };
                return;
            }
            const { pts, values } = this.eloChartData;
            const toX = (i) => pad.left + (i / Math.max(1, n - 1)) * chartW;
            let best = 0;
            let bestDist = Infinity;
            for (let i = 0; i < n; i++) {
                const dist = Math.abs(mouseX - toX(i));
                if (dist < bestDist) { bestDist = dist; best = i; }
            }
            const pt = pts[best];
            const d = pt?.created_at ? new Date(pt.created_at) : null;
            const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const ratingStr = pt ? String(pt.rating_after) : '';
            this.eloTooltip = {
                show: true, date: dateStr, rating: ratingStr,
                o: '', h: '', l: '', c: '',
                x: tx, y: ty,
            };
        },
    };
}
</script>
@endsection
