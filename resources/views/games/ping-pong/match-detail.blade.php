@extends('layouts.app')

@section('title', 'Match Detail - Ping Pong')
@section('main-class', 'max-w-6xl mx-auto px-6 py-6')

@section('content')
<style>
    .md .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid rgba(255,255,255,0.1);
    }
    .md .header h1 { font-size: 1.6rem; font-weight: 800; color: #3b82f6; }
    .md .back-link {
        color: #3b82f6;
        text-decoration: none;
        font-weight: 600;
        padding: 8px 16px;
        border: 2px solid #3b82f6;
        border-radius: 8px;
        transition: all 0.2s;
    }
    .md .back-link:hover { background: #3b82f6; color: white; }

    /* Score Hero */
    .md .score-hero {
        text-align: center;
        padding: 32px 24px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        margin-bottom: 24px;
    }
    .md .players {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        margin-bottom: 12px;
    }
    .md .player-name { font-weight: 700; font-size: 1.2rem; }
    .md .player-name a { text-decoration: none; transition: opacity 0.15s; }
    .md .player-name a:hover { opacity: 0.8; }
    .md .player-name.left, .md .player-name.left a { color: #fb7185; }
    .md .player-name.right, .md .player-name.right a { color: #22d3ee; }
    .md .vs { color: rgba(255,255,255,0.3); font-weight: 600; }
    .md .big-score { font-size: 4rem; font-weight: 900; line-height: 1; margin-bottom: 10px; }
    .md .big-score .left { color: #fb7185; }
    .md .big-score .right { color: #22d3ee; }
    .md .big-score .sep { color: rgba(255,255,255,0.2); }
    .md .winner-badge {
        display: inline-block;
        padding: 4px 16px;
        border-radius: 999px;
        font-weight: 700;
        font-size: 0.9rem;
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
    }
    .md .meta-row {
        display: flex;
        justify-content: center;
        gap: 24px;
        margin-top: 12px;
        font-size: 0.9rem;
        color: rgba(255,255,255,0.4);
    }

    /* Sections */
    .md .section {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
    }
    .md .section h2 {
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 16px;
        color: #3b82f6;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    /* Chart */
    .md .chart-container { position: relative; width: 100%; height: 280px; }

    /* ELO cards */
    .md .elo-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    .md .elo-card {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 16px;
        text-align: center;
    }
    .md .elo-card .name { font-weight: 700; font-size: 1rem; margin-bottom: 8px; }
    .md .elo-card .name.left { color: #fb7185; }
    .md .elo-card .name.right { color: #22d3ee; }
    .md .elo-card .elo-flow {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 0.95rem;
        color: rgba(255,255,255,0.6);
    }
    .md .elo-card .elo-change { font-weight: 800; font-size: 1.3rem; margin-top: 6px; }
    .md .elo-card .elo-change.pos { color: #22c55e; }
    .md .elo-card .elo-change.neg { color: #ef4444; }

    /* 2v2 sub-players */
    .md .elo-sub {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.06);
        font-size: 0.85rem;
        color: rgba(255,255,255,0.4);
    }
    .md .elo-sub-row {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
    }

    /* Stats grid */
    .md .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
    }
    .md .stat-card {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 14px;
        text-align: center;
    }
    .md .stat-card .label {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.4);
        margin-bottom: 6px;
    }
    .md .stat-card .value { font-weight: 800; font-size: 1.4rem; }

    .md .loading {
        text-align: center;
        padding: 40px;
        color: rgba(255,255,255,0.4);
    }

    .md .countdown-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 10px 16px;
        margin-bottom: 20px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.25);
        border-radius: 10px;
        font-size: 0.9rem;
        color: rgba(255,255,255,0.7);
    }
    .md .countdown-bar .timer {
        font-weight: 700;
        color: #3b82f6;
        font-variant-numeric: tabular-nums;
    }
    .md .countdown-bar .go-now {
        padding: 4px 12px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        transition: background 0.15s;
    }
    .md .countdown-bar .go-now:hover { background: #2563eb; }

    /* Recording + Timeline layout */
    .md .recording-layout {
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 16px;
        align-items: start;
    }
    .md .video-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        background: #000;
        border-radius: 12px;
        overflow: hidden;
    }
    .md .video-wrap video {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    .md .timeline-panel {
        max-height: 450px;
        overflow-y: auto;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        background: rgba(255,255,255,0.03);
    }
    .md .timeline-panel::-webkit-scrollbar { width: 4px; }
    .md .timeline-panel::-webkit-scrollbar-track { background: transparent; }
    .md .timeline-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
    .md .timeline-header {
        position: sticky;
        top: 0;
        background: rgba(15,15,15,0.95);
        backdrop-filter: blur(8px);
        padding: 12px 14px;
        font-weight: 700;
        font-size: 0.85rem;
        color: rgba(255,255,255,0.5);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        z-index: 1;
    }
    .md .timeline-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        cursor: pointer;
        transition: background 0.15s;
        border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .md .timeline-item:hover { background: rgba(255,255,255,0.06); }
    .md .timeline-item.active { background: rgba(59, 130, 246, 0.15); }
    .md .timeline-item .pt-num {
        font-size: 0.75rem;
        font-weight: 700;
        color: rgba(255,255,255,0.3);
        min-width: 20px;
        text-align: right;
    }
    .md .timeline-item .pt-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .md .timeline-item .pt-dot.left { background: #fb7185; }
    .md .timeline-item .pt-dot.right { background: #22d3ee; }
    .md .timeline-item .pt-score {
        font-weight: 700;
        font-size: 0.9rem;
        color: rgba(255,255,255,0.8);
        flex: 1;
    }
    .md .timeline-item .pt-time {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.35);
        font-variant-numeric: tabular-nums;
    }

    @media (max-width: 900px) {
        .md .recording-layout { grid-template-columns: 1fr; }
        .md .timeline-panel { max-height: 300px; }
    }
    @media (max-width: 640px) {
        .md .stats-grid { grid-template-columns: repeat(2, 1fr); }
        .md .elo-grid { grid-template-columns: 1fr; }
        .md .big-score { font-size: 3rem; }
        .md .players { flex-direction: column; gap: 4px; }
    }
</style>

<div class="md" x-data="matchDetail()" x-init="init()">
    <div class="header">
        <h1>Match Detail</h1>
        <a :href="fromGame ? '/games/ping-pong' : 'javascript:history.back()'" class="back-link">&larr; Back</a>
    </div>

    <div class="countdown-bar" x-show="fromGame" x-cloak>
        Returning to lobby in <span class="timer" x-text="countdown + 's'"></span>
        <button class="go-now" @click="window.location.href='/games/ping-pong'">Go now</button>
    </div>

    <div class="loading" x-show="loading">Loading match data...</div>

    <template x-if="match">
        <div>
            <!-- Score Hero -->
            <div class="score-hero">
                <div class="players">
                    <span class="player-name left">
                        <template x-if="match.mode === '1v1'">
                            <a :href="'/games/ping-pong/players/' + match.player_left_id" x-text="leftName()"></a>
                        </template>
                        <template x-if="match.mode === '2v2'">
                            <span x-text="leftName()"></span>
                        </template>
                    </span>
                    <span class="vs">vs</span>
                    <span class="player-name right">
                        <template x-if="match.mode === '1v1'">
                            <a :href="'/games/ping-pong/players/' + match.player_right_id" x-text="rightName()"></a>
                        </template>
                        <template x-if="match.mode === '2v2'">
                            <span x-text="rightName()"></span>
                        </template>
                    </span>
                </div>
                <div class="big-score">
                    <span class="left" x-text="match.player_left_score"></span>
                    <span class="sep"> - </span>
                    <span class="right" x-text="match.player_right_score"></span>
                </div>
                <div class="winner-badge" x-text="winnerName() + ' wins'"></div>
                <div class="meta-row">
                    <span x-show="match.duration_formatted" x-text="match.duration_formatted"></span>
                    <span x-text="match.mode?.toUpperCase()"></span>
                    <span x-text="formattedDate()"></span>
                </div>
            </div>

            <!-- Match Recording + Point Timeline -->
            <template x-if="match.recording && match.recording.status === 'completed' && match.recording.video_url">
                <div class="section">
                    <h2>Match Recording</h2>
                    <div class="recording-layout">
                        <div class="video-wrap">
                            <video id="matchVideo" controls playsinline preload="metadata"
                                   :src="match.recording.video_url"></video>
                        </div>
                        <div class="timeline-panel" x-show="pointTimestamps().length > 0">
                            <div class="timeline-header">Points Timeline</div>
                            <template x-for="pt in pointTimestamps()" :key="pt.number">
                                <div class="timeline-item"
                                     :class="{ active: activePoint === pt.number }"
                                     @click="activePoint = pt.number; seekToPoint(pt.offset)">
                                    <span class="pt-num" x-text="pt.number"></span>
                                    <span class="pt-dot" :class="pt.side"></span>
                                    <span class="pt-score" x-text="pt.scoreLeft + ' - ' + pt.scoreRight"></span>
                                    <span class="pt-time" x-text="pt.label"></span>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>
            </template>

            <!-- Score Progression Chart -->
            <div class="section">
                <h2>Score Progression</h2>
                <div class="chart-container" x-init="requestAnimationFrame(() => renderScoreChart())">
                    <canvas id="scoreChart"></canvas>
                </div>
            </div>

            <!-- ELO Changes -->
            <template x-if="match.elo_changes">
                <div class="section">
                    <h2>ELO Changes</h2>
                    <div class="elo-grid">
                        <div class="elo-card">
                            <div class="name left" x-text="leftName()"></div>
                            <div class="elo-flow">
                                <span x-text="eloBefore('left')"></span>
                                <span>&rarr;</span>
                                <span x-text="eloAfter('left')"></span>
                            </div>
                            <div class="elo-change" :class="eloChange('left') >= 0 ? 'pos' : 'neg'"
                                 x-text="(eloChange('left') >= 0 ? '+' : '') + eloChange('left')"></div>
                            <template x-if="match.mode === '2v2' && match.elo_changes?.left?.player1">
                                <div class="elo-sub">
                                    <div class="elo-sub-row">
                                        <span x-text="match.player_left?.name"></span>
                                        <span x-text="match.elo_changes.left.player1.before + ' → ' + match.elo_changes.left.player1.after"></span>
                                    </div>
                                    <div class="elo-sub-row">
                                        <span x-text="match.team_left_player2?.name"></span>
                                        <span x-text="match.elo_changes.left.player2.before + ' → ' + match.elo_changes.left.player2.after"></span>
                                    </div>
                                </div>
                            </template>
                        </div>
                        <div class="elo-card">
                            <div class="name right" x-text="rightName()"></div>
                            <div class="elo-flow">
                                <span x-text="eloBefore('right')"></span>
                                <span>&rarr;</span>
                                <span x-text="eloAfter('right')"></span>
                            </div>
                            <div class="elo-change" :class="eloChange('right') >= 0 ? 'pos' : 'neg'"
                                 x-text="(eloChange('right') >= 0 ? '+' : '') + eloChange('right')"></div>
                            <template x-if="match.mode === '2v2' && match.elo_changes?.right?.player1">
                                <div class="elo-sub">
                                    <div class="elo-sub-row">
                                        <span x-text="match.player_right?.name"></span>
                                        <span x-text="match.elo_changes.right.player1.before + ' → ' + match.elo_changes.right.player1.after"></span>
                                    </div>
                                    <div class="elo-sub-row">
                                        <span x-text="match.team_right_player2?.name"></span>
                                        <span x-text="match.elo_changes.right.player2.before + ' → ' + match.elo_changes.right.player2.after"></span>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>
            </template>

            <!-- Key Stats -->
            <div class="section">
                <h2>Key Stats</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="label">Total Points</div>
                        <div class="value" x-text="(match.points || []).length"></div>
                    </div>
                    <div class="stat-card">
                        <div class="label">Lead Changes</div>
                        <div class="value" x-text="leadChanges()"></div>
                    </div>
                    <div class="stat-card">
                        <div class="label" x-text="'Best Run (' + shortLeftName() + ')'"></div>
                        <div class="value" style="color:#fb7185" x-text="runs().left"></div>
                    </div>
                    <div class="stat-card">
                        <div class="label" x-text="'Best Run (' + shortRightName() + ')'"></div>
                        <div class="value" style="color:#22d3ee" x-text="runs().right"></div>
                    </div>
                </div>
            </div>

            <!-- Score Difference Over Time Chart -->
            <div class="section">
                <h2>Score Difference Over Time</h2>
                <div class="chart-container" x-init="requestAnimationFrame(() => renderDiffChart())">
                    <canvas id="diffChart"></canvas>
                </div>
            </div>

        </div>
    </template>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
function matchDetail() {
    return {
        API: '/games/ping-pong/api',
        matchId: {{ $matchId }},
        match: null,
        loading: true,
        scoreChartInstance: null,
        diffChartInstance: null,
        fromGame: new URLSearchParams(window.location.search).has('from'),
        countdown: 30,
        countdownTimer: null,
        activePoint: null,

        async init() {
            try {
                const res = await fetch(`${this.API}/matches/${this.matchId}`);
                this.match = await res.json();
            } catch (err) {
                console.error('Error loading match:', err);
            }
            this.loading = false;

            if (this.fromGame) {
                this.countdownTimer = setInterval(() => {
                    this.countdown--;
                    if (this.countdown <= 0) {
                        clearInterval(this.countdownTimer);
                        window.location.href = '/games/ping-pong';
                    }
                }, 1000);
            }
        },

        leftName() {
            const m = this.match;
            if (!m) return '';
            if (m.mode === '2v2') return (m.player_left?.name || '?') + ' & ' + (m.team_left_player2?.name || '?');
            return m.player_left?.name || '?';
        },

        rightName() {
            const m = this.match;
            if (!m) return '';
            if (m.mode === '2v2') return (m.player_right?.name || '?') + ' & ' + (m.team_right_player2?.name || '?');
            return m.player_right?.name || '?';
        },

        shortLeftName() {
            return this.match?.player_left?.name || '?';
        },

        shortRightName() {
            return this.match?.player_right?.name || '?';
        },

        winnerName() {
            const m = this.match;
            if (!m) return '';
            return m.winner_id === m.player_left_id ? this.leftName() : this.rightName();
        },

        formattedDate() {
            if (!this.match?.ended_at) return '';
            return new Date(this.match.ended_at).toLocaleDateString(undefined, {
                weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        },

        eloBefore(side) {
            const elo = this.match?.elo_changes?.[side];
            if (!elo) return '-';
            return elo.team_avg_before ?? elo.before ?? '-';
        },

        eloAfter(side) {
            const elo = this.match?.elo_changes?.[side];
            if (!elo) return '-';
            return elo.team_avg_after ?? elo.after ?? '-';
        },

        eloChange(side) {
            const elo = this.match?.elo_changes?.[side];
            if (!elo) return 0;
            return elo.change ?? ((elo.after ?? 0) - (elo.before ?? 0));
        },

        runs() {
            const points = this.match?.points || [];
            let leftMax = 0, rightMax = 0, leftCur = 0, rightCur = 0;
            points.forEach(p => {
                if (p.scoring_side === 'left') { leftCur++; rightCur = 0; }
                else { rightCur++; leftCur = 0; }
                leftMax = Math.max(leftMax, leftCur);
                rightMax = Math.max(rightMax, rightCur);
            });
            return { left: leftMax, right: rightMax };
        },

        leadChanges() {
            const points = this.match?.points || [];
            let changes = 0, prevLeader = null;
            points.forEach(p => {
                let leader = null;
                if (p.left_score_after > p.right_score_after) leader = 'left';
                else if (p.right_score_after > p.left_score_after) leader = 'right';
                if (leader && prevLeader && leader !== prevLeader) changes++;
                if (leader) prevLeader = leader;
            });
            return changes;
        },

        pointTimestamps() {
            const points = this.match?.points || [];
            const recStart = this.match?.recording?.created_at;
            if (!recStart || points.length === 0) return [];
            const recTime = new Date(recStart).getTime();
            return points.map(p => {
                const ptTime = new Date(p.created_at).getTime();
                const offset = Math.max(0, (ptTime - recTime) / 1000);
                const mins = Math.floor(offset / 60);
                const secs = Math.floor(offset % 60);
                return {
                    number: p.point_number,
                    side: p.scoring_side,
                    scoreLeft: p.left_score_after,
                    scoreRight: p.right_score_after,
                    offset,
                    label: mins + ':' + String(secs).padStart(2, '0'),
                };
            });
        },

        seekToPoint(offset) {
            const video = document.getElementById('matchVideo');
            if (!video) return;
            video.currentTime = Math.max(0, offset - 10);
            video.play().catch(() => {});
        },

        renderScoreChart() {
            if (this.scoreChartInstance) { this.scoreChartInstance.destroy(); this.scoreChartInstance = null; }
            const canvas = document.getElementById('scoreChart');
            if (!canvas || !this.match) return;
            const points = this.match.points || [];
            if (points.length === 0) return;

            const labels = ['0'];
            const leftScores = [0];
            const rightScores = [0];
            points.forEach((p, i) => {
                labels.push(String(i + 1));
                leftScores.push(p.left_score_after);
                rightScores.push(p.right_score_after);
            });
            const maxScore = Math.max(leftScores[leftScores.length - 1], rightScores[rightScores.length - 1], 11);

            this.scoreChartInstance = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: this.leftName(),
                            data: leftScores,
                            borderColor: '#fb7185',
                            backgroundColor: 'rgba(251, 113, 133, 0.1)',
                            borderWidth: 3,
                            pointRadius: 3,
                            pointBackgroundColor: '#fb7185',
                            tension: 0.1,
                            fill: false,
                        },
                        {
                            label: this.rightName(),
                            data: rightScores,
                            borderColor: '#22d3ee',
                            backgroundColor: 'rgba(34, 211, 238, 0.1)',
                            borderWidth: 3,
                            pointRadius: 3,
                            pointBackgroundColor: '#22d3ee',
                            tension: 0.1,
                            fill: false,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            labels: {
                                color: 'rgba(255,255,255,0.8)',
                                font: { size: 13, weight: '600' },
                                usePointStyle: true,
                                pointStyle: 'circle',
                            },
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            titleColor: 'rgba(255,255,255,0.9)',
                            bodyColor: 'rgba(255,255,255,0.8)',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                                title: (items) => items[0].label === '0' ? 'Start' : 'Point ' + items[0].label,
                            },
                        },
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Point #', color: 'rgba(255,255,255,0.5)', font: { size: 12 } },
                            ticks: { color: 'rgba(255,255,255,0.4)' },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                        y: {
                            title: { display: true, text: 'Score', color: 'rgba(255,255,255,0.5)', font: { size: 12 } },
                            min: 0, max: maxScore + 1,
                            ticks: { stepSize: 1, color: 'rgba(255,255,255,0.4)' },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                    },
                },
            });
        },

        renderDiffChart() {
            if (this.diffChartInstance) { this.diffChartInstance.destroy(); this.diffChartInstance = null; }
            const canvas = document.getElementById('diffChart');
            if (!canvas || !this.match) return;
            const points = this.match.points || [];
            if (points.length === 0) return;

            const labels = ['0'];
            const diffs = [0];
            points.forEach((p, i) => {
                labels.push(String(i + 1));
                diffs.push(p.left_score_after - p.right_score_after);
            });

            const maxAbs = Math.max(1, ...diffs.map(Math.abs));

            this.diffChartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        data: diffs,
                        backgroundColor: diffs.map(d => d > 0 ? 'rgba(251, 113, 133, 0.6)' : d < 0 ? 'rgba(34, 211, 238, 0.6)' : 'rgba(255,255,255,0.15)'),
                        borderColor: diffs.map(d => d > 0 ? '#fb7185' : d < 0 ? '#22d3ee' : 'rgba(255,255,255,0.3)'),
                        borderWidth: 1,
                        borderRadius: 3,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            titleColor: 'rgba(255,255,255,0.9)',
                            bodyColor: 'rgba(255,255,255,0.8)',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                                title: (items) => items[0].label === '0' ? 'Start' : 'Point ' + items[0].label,
                                label: (item) => {
                                    const v = item.raw;
                                    if (v > 0) return this.shortLeftName() + ' leads by ' + v;
                                    if (v < 0) return this.shortRightName() + ' leads by ' + Math.abs(v);
                                    return 'Tied';
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Point #', color: 'rgba(255,255,255,0.5)', font: { size: 12 } },
                            ticks: { color: 'rgba(255,255,255,0.4)' },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                        y: {
                            title: { display: true, text: 'Lead', color: 'rgba(255,255,255,0.5)', font: { size: 12 } },
                            min: -(maxAbs + 1), max: maxAbs + 1,
                            ticks: {
                                stepSize: 1,
                                color: 'rgba(255,255,255,0.4)',
                                callback: (v) => v > 0 ? '+' + v : String(v),
                            },
                            grid: {
                                color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
                                lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1,
                            },
                        },
                    },
                },
            });
        },
    };
}
</script>
@endsection
