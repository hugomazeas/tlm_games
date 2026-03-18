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

    .pps .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 24px;
    }

    .pps .stat-card {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 20px;
        text-align: center;
    }

    .pps .stat-value {
        font-size: 2rem;
        font-weight: 800;
        color: #3b82f6;
    }

    .pps .stat-label {
        color: rgba(255,255,255,0.5);
        font-size: 0.85rem;
        margin-top: 4px;
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

</style>

<div class="pps" x-data="playerStats()" x-init="init()">
    <div class="header">
        <h1><span>{{ $player->name }}</span> - Ping Pong</h1>
        <a href="{{ url('/games/ping-pong') }}" class="back-link">&larr; Back to Game</a>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value" x-text="stats.elo_rating ?? '-'"></div>
            <div class="stat-label">ELO Rating</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" x-text="stats.games_played ?? '-'"></div>
            <div class="stat-label">Games Played</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">
                <span style="color: #22c55e;" x-text="stats.wins ?? 0"></span>
                <span style="color: rgba(255,255,255,0.3);">/</span>
                <span style="color: #ef4444;" x-text="stats.losses ?? 0"></span>
            </div>
            <div class="stat-label">Wins / Losses (<span x-text="stats.win_rate ?? 0"></span>%)</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">
                <template x-if="stats.streak > 0">
                    <span class="streak-badge" :class="stats.streak_type">
                        <span x-text="stats.streak_type"></span><span x-text="stats.streak"></span>
                    </span>
                </template>
                <template x-if="!stats.streak || stats.streak === 0">
                    <span style="color: rgba(255,255,255,0.3);">-</span>
                </template>
            </div>
            <div class="stat-label">Current Streak</div>
        </div>
    </div>

    <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr);">
        <div class="stat-card">
            <div class="stat-value" x-text="stats.avg_duration ?? '-'"></div>
            <div class="stat-label">Avg Game Duration</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" x-text="stats.win_rate ? stats.win_rate + '%' : '-'"></div>
            <div class="stat-label">Win Rate</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" x-text="stats.highest_elo ?? '-'"></div>
            <div class="stat-label">Highest ELO</div>
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

    <!-- ELO History -->
    <div class="section">
        <h2>ELO History</h2>
        <div class="elo-mode-tabs">
            <button class="elo-mode-tab" :class="{ active: eloMode === '1v1' }" @click="eloMode = '1v1'; loadEloHistory();">1v1</button>
            <button class="elo-mode-tab" :class="{ active: eloMode === '2v2' }" @click="eloMode = '2v2'; loadEloHistory();">2v2</button>
        </div>
        <div class="elo-chart-container" x-show="eloHistory.length > 0" x-ref="eloChartContainer"
             @mousemove="onEloChartMouseMove($event)"
             @mouseleave="eloTooltip.show = false">
            <canvas id="eloChart"></canvas>
            <div class="elo-tooltip" x-show="eloTooltip.show" x-cloak
                 :style="'left: ' + eloTooltip.x + 'px; top: ' + eloTooltip.y + 'px;'">
                <div class="tooltip-date" x-text="eloTooltip.date"></div>
                <div class="tooltip-rating" x-text="eloTooltip.rating ? 'ELO ' + eloTooltip.rating : ''"></div>
            </div>
        </div>
        <div class="empty" x-show="eloHistory.length === 0 && !loadingEloHistory">No ELO history yet</div>
        <div class="loading" x-show="loadingEloHistory">Loading...</div>
    </div>

    <!-- Head to Head -->
    <div class="section">
        <h2>Head-to-Head</h2>
        <div class="h2h-grid" x-show="h2h.length > 0">
            <template x-for="record in h2h" :key="record.opponent.id">
                <div class="h2h-card">
                    <div class="h2h-name" x-text="record.opponent.name"></div>
                    <div class="h2h-record">
                        <span class="h2h-wins" x-text="record.wins"></span>
                        <span class="h2h-sep">-</span>
                        <span class="h2h-losses" x-text="record.losses"></span>
                    </div>
                </div>
            </template>
        </div>
        <div class="empty" x-show="h2h.length === 0 && !loadingH2h">No matches yet</div>
        <div class="loading" x-show="loadingH2h">Loading...</div>
    </div>

    <!-- Match History -->
    <div class="section">
        <h2>Match History</h2>
        <div class="match-list" x-show="matches.length > 0">
            <template x-for="m in matches" :key="m.id">
                <div class="match-row">
                    <div class="match-result" :class="m.won ? 'win' : 'loss'" x-text="m.won ? 'W' : 'L'"></div>
                    <div class="match-opponent" x-text="'vs ' + m.opponent.name"></div>
                    <div class="match-score" x-text="m.player_score + ' - ' + m.opponent_score"></div>
                    <div class="match-duration" x-text="m.duration_formatted || '-'"></div>
                    <div class="match-time" x-text="m.ended_at_human"></div>
                </div>
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
        stats: {},
        h2h: [],
        matches: [],
        eloHistory: [],
        eloMode: '1v1',
        eloTooltip: { show: false, date: '', rating: '', x: 0, y: 0 },
        eloChartData: null,
        loadingH2h: true,
        loadingMatches: true,
        loadingEloHistory: true,

        async init() {
            await Promise.all([
                this.loadStats(),
                this.loadH2h(),
                this.loadMatches(),
                this.loadEloHistory(),
            ]);
            window.addEventListener('resize', () => { if (this.eloHistory.length > 0) this.renderEloChart(); });
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
            } catch (err) {
                console.error('Error loading h2h:', err);
            }
            this.loadingH2h = false;
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
                this.$nextTick(() => this.renderEloChart());
            } catch (err) {
                console.error('Error loading ELO history:', err);
                this.eloHistory = [];
            }
            this.loadingEloHistory = false;
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
            const values = pts.map(p => p.rating_after);
            const rawMin = Math.min(1200, ...values);
            const rawMax = Math.max(1200, ...values);
            const range = Math.max(rawMax - rawMin, 80);
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
            const toX = (i) => pad.left + (i / Math.max(1, values.length - 1)) * chartW;
            const yRange = chartMaxY - chartMinY || 100;
            const toY = (v) => pad.top + chartH - ((v - chartMinY) / yRange) * chartH;
            ctx.clearRect(0, 0, w, h);
            ctx.font = '11px Outfit, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
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
            xIndices.forEach((i) => {
                const x = toX(i);
                const d = pts[i]?.created_at ? new Date(pts[i].created_at) : null;
                const label = d ? (d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: pts.length > 30 ? '2-digit' : undefined })) : (i + 1);
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.textAlign = i === 0 ? 'left' : (i === pts.length - 1 ? 'right' : 'center');
                ctx.fillText(label, x, pad.top + chartH + 20);
            });
            ctx.beginPath();
            ctx.moveTo(toX(0), toY(values[0]));
            for (let i = 1; i < values.length; i++) ctx.lineTo(toX(i), toY(values[i]));
            ctx.lineTo(toX(values.length - 1), pad.top + chartH);
            ctx.lineTo(toX(0), pad.top + chartH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(toX(0), toY(values[0]));
            for (let i = 1; i < values.length; i++) ctx.lineTo(toX(i), toY(values[i]));
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.eloChartData = { pts, values, pad, chartW, chartH, n: values.length };
        },

        onEloChartMouseMove(e) {
            if (!this.eloChartData || this.eloHistory.length === 0) return;
            const { pts, pad, chartW, n } = this.eloChartData;
            const rect = this.$refs.eloChartContainer?.getBoundingClientRect();
            if (!rect) return;
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            if (mouseX < pad.left || mouseX > pad.left + chartW) {
                this.eloTooltip.show = false;
                return;
            }
            const toX = (i) => pad.left + (i / Math.max(1, n - 1)) * chartW;
            let best = 0;
            let bestDist = Infinity;
            for (let i = 0; i < n; i++) {
                const d = Math.abs(mouseX - toX(i));
                if (d < bestDist) { bestDist = d; best = i; }
            }
            const pt = pts[best];
            const d = pt?.created_at ? new Date(pt.created_at) : null;
            const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const ratingStr = pt ? String(pt.rating_after) : '';
            const offset = 12;
            let x = e.clientX + offset;
            let y = e.clientY + offset;
            if (x + 120 > window.innerWidth) x = e.clientX - 130;
            if (y + 60 > window.innerHeight) y = e.clientY - 55;
            this.eloTooltip = { show: true, date: dateStr, rating: ratingStr, x, y };
        },
    };
}
</script>
@endsection
