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

    <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
        <div class="stat-card">
            <div class="stat-value" x-text="stats.avg_duration ?? '-'"></div>
            <div class="stat-label">Avg Game Duration</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" x-text="stats.win_rate ? stats.win_rate + '%' : '-'"></div>
            <div class="stat-label">Win Rate</div>
        </div>
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
        loadingH2h: true,
        loadingMatches: true,

        async init() {
            await Promise.all([
                this.loadStats(),
                this.loadH2h(),
                this.loadMatches(),
            ]);
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
    };
}
</script>
@endsection
