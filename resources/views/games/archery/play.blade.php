@extends('layouts.app')

@section('title', 'Archery - Games Hub')

@section('main-class', 'px-2 py-2')

@section('content')
<style>
    .archery-container {
        max-width: 100%;
        height: calc(100vh - 80px);
        display: flex;
        flex-direction: column;
    }

    .archery-content {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        flex: 1;
        overflow: hidden;
    }

    .archery-panel {
        background: #1e293b;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #334155;
    }

    .archery-panel h2 {
        font-size: 1.2rem;
        color: #f1f5f9;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 2px solid #334155;
        flex-shrink: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .archery-manage-link {
        font-size: 0.85rem;
        color: #2196F3;
        text-decoration: none;
        font-weight: normal;
    }

    .archery-manage-link:hover {
        text-decoration: underline;
    }

    .archery-info-row {
        display: flex;
        gap: 15px;
        margin: 10px 0;
        flex-shrink: 0;
    }

    .archery-info-row > div {
        flex: 1;
    }

    .archery-panel label {
        display: block;
        margin-bottom: 4px;
        font-weight: 600;
        color: #cbd5e1;
        font-size: 0.9rem;
    }

    .archery-panel select, .archery-panel input {
        width: 100%;
        padding: 8px;
        border: 2px solid #334155;
        border-radius: 4px;
        font-size: 0.9rem;
        transition: border-color 0.3s;
        background: #0f172a;
        color: #e2e8f0;
    }

    .archery-target-container {
        display: flex;
        justify-content: center;
        align-items: center;
        flex: 1;
        min-height: 0;
    }

    #target {
        cursor: crosshair;
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
    }

    .arrow-marker {
        fill: #ff0000;
        stroke: #8b0000;
        stroke-width: 2;
    }

    .archery-score-display {
        text-align: center;
        flex-shrink: 0;
    }

    .archery-score-value {
        font-size: 2rem;
        font-weight: bold;
        color: #4CAF50;
    }

    .archery-score-label {
        color: #94a3b8;
        margin-top: 2px;
        font-size: 0.85rem;
    }

    .archery-arrows-list {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin: 8px 0;
        flex-shrink: 0;
    }

    .archery-arrow-score {
        background: #0f172a;
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        font-weight: bold;
        font-size: 1rem;
        border: 1px solid #334155;
        color: #64748b;
    }

    .archery-arrow-score.hit {
        background: #064e3b;
        color: #6ee7b7;
        border-color: #10b981;
    }

    .archery-arrow-score.miss {
        background: #7f1d1d;
        color: #fca5a5;
        border-color: #dc2626;
    }

    .archery-targets-label {
        margin-top: 12px;
        margin-bottom: 4px;
        font-size: 0.85rem;
        color: #fbbf24;
        font-weight: 600;
        text-align: center;
        flex-shrink: 0;
    }

    .archery-targets-list {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin: 0 0 8px 0;
        flex-shrink: 0;
    }

    .archery-target-number {
        background: #422006;
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        font-weight: bold;
        font-size: 1rem;
        border: 2px solid #fbbf24;
        color: #fbbf24;
    }

    .archery-btn {
        width: 100%;
        padding: 10px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.3s;
        flex-shrink: 0;
    }

    .archery-btn:hover:not(:disabled) {
        background: #45a049;
    }

    .archery-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .archery-reset-btn {
        background: #f44336;
        margin-top: 6px;
    }

    .archery-reset-btn:hover:not(:disabled) {
        background: #da190b;
    }

    .archery-week-selector {
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
        align-items: center;
        flex-shrink: 0;
    }

    .archery-week-selector button {
        width: auto;
        padding: 6px 12px;
        background: #2196F3;
        font-size: 0.85rem;
    }

    .archery-week-selector button:hover {
        background: #0b7dda;
    }

    .archery-week-selector span {
        flex: 1;
        text-align: center;
        font-weight: 600;
        color: #e2e8f0;
        font-size: 0.85rem;
    }

    .archery-tabs {
        display: flex;
        gap: 0;
        margin-bottom: 15px;
        flex-shrink: 0;
        border-bottom: 2px solid #334155;
    }

    .archery-tab-button {
        flex: 1;
        padding: 10px;
        background: transparent;
        color: #94a3b8;
        border: none;
        border-bottom: 3px solid transparent;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        margin-bottom: -2px;
    }

    .archery-tab-button:hover {
        background: #334155;
        color: #e2e8f0;
    }

    .archery-tab-button.active {
        color: #4CAF50;
        border-bottom-color: #4CAF50;
        background: transparent;
    }

    .archery-week-selector.hidden {
        display: none;
    }

    .archery-leaderboard-wrapper {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }

    .archery-leaderboard-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
    }

    .archery-leaderboard-table th {
        background: #0f172a;
        padding: 8px 6px;
        text-align: left;
        font-weight: 600;
        color: #cbd5e1;
        border-bottom: 2px solid #334155;
        position: sticky;
        top: 0;
    }

    .archery-leaderboard-table td {
        padding: 8px 6px;
        border-bottom: 1px solid #334155;
        color: #e2e8f0;
    }

    .archery-leaderboard-table tr:hover {
        background: #334155;
    }

    .archery-leaderboard-table a {
        color: #2196F3;
        text-decoration: none;
    }

    .archery-leaderboard-table a:hover {
        color: #64b5f6;
        text-decoration: underline;
    }

    .archery-rank {
        font-weight: bold;
        color: #4CAF50;
    }

    .archery-bonuses-display {
        margin: 8px 0;
        padding: 10px;
        background: #422006;
        border-radius: 4px;
        border-left: 4px solid #fbbf24;
        flex-shrink: 0;
    }

    .archery-bonuses-display h3 {
        font-size: 0.95rem;
        margin-bottom: 6px;
        color: #fbbf24;
    }

    .archery-bonus-item {
        margin: 3px 0;
        color: #fde68a;
        font-weight: 600;
        font-size: 0.85rem;
    }

    .archery-bonuses-display p {
        color: #fde68a;
    }

    .archery-info-section {
        margin: 8px 0;
        padding: 10px;
        background: #0c4a6e;
        border-radius: 4px;
        border-left: 4px solid #38bdf8;
        flex-shrink: 0;
        max-height: 250px;
        overflow-y: auto;
    }

    .archery-info-section h3 {
        margin-bottom: 6px;
        color: #7dd3fc;
        font-size: 0.95rem;
    }

    .archery-info-section p {
        margin: 3px 0;
        color: #bae6fd;
        font-size: 1rem;
    }

    .archery-button-group {
        flex-shrink: 0;
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
    }

    .archery-button-group button {
        width: auto;
        flex: 1;
    }

    .archery-button-group .archery-reset-btn {
        margin-top: 0;
    }

    /* Modal */
    .archery-modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0, 0, 0, 0.8);
    }

    .archery-modal.active {
        display: block;
    }

    .archery-modal-content {
        background-color: #1e293b;
        margin: 5% auto;
        padding: 30px;
        border: 2px solid #334155;
        border-radius: 12px;
        width: 90%;
        max-width: 800px;
        max-height: 80vh;
        overflow-y: auto;
    }

    .archery-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 25px;
        padding-bottom: 15px;
        border-bottom: 2px solid #334155;
    }

    .archery-modal-header h2 {
        margin: 0;
        border: none;
        padding: 0;
    }

    .archery-close-modal {
        color: #94a3b8;
        font-size: 2rem;
        font-weight: bold;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        width: auto;
        line-height: 1;
    }

    .archery-close-modal:hover {
        color: #e2e8f0;
    }

    .archery-player-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 15px;
    }

    .archery-player-button {
        background: #0f172a;
        border: 2px solid #334155;
        padding: 20px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
        text-align: left;
        width: 100%;
        color: #e2e8f0;
    }

    .archery-player-button:hover {
        background: #334155;
        border-color: #4CAF50;
        transform: translateY(-2px);
    }

    .archery-player-name {
        font-size: 1.3rem;
        font-weight: bold;
        color: #f1f5f9;
        margin-bottom: 12px;
    }

    .archery-player-stats {
        display: flex;
        justify-content: space-between;
        gap: 15px;
    }

    .archery-player-stat { flex: 1; }

    .archery-stat-label {
        font-size: 0.75rem;
        color: #94a3b8;
        margin-bottom: 4px;
    }

    .archery-stat-value {
        font-size: 1.1rem;
        font-weight: bold;
        color: #4CAF50;
    }

    .archery-select-player-btn {
        background: #2196F3;
        margin-bottom: 10px;
    }

    .archery-select-player-btn:hover {
        background: #0b7dda;
    }

    .archery-current-player-display {
        padding: 10px;
        background: #064e3b;
        border: 2px solid #10b981;
        border-radius: 4px;
        text-align: center;
        font-weight: bold;
        color: #6ee7b7;
        margin-bottom: 5px;
    }
</style>

<div class="archery-container">
    <div class="archery-content">
        <!-- Game Panel -->
        <div class="archery-panel">
            <div class="archery-button-group">
                <button class="archery-btn" id="submitBtn" disabled>Submit Game</button>
                <button class="archery-btn archery-reset-btn" id="resetBtn">Reset</button>
            </div>

            <div class="archery-target-container">
                <svg id="target" width="500" height="500" viewBox="-250 -250 500 500">
                    <circle cx="0" cy="0" r="250" fill="#fafafa" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="200" fill="#1a1a1a" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="150" fill="#2563eb" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="100" fill="#dc2626" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="50" fill="#fbbf24" stroke="#666" stroke-width="2"/>
                    <line x1="-250" y1="0" x2="250" y2="0" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>
                    <line x1="0" y1="-250" x2="0" y2="250" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>
                    <text x="0" y="-230" text-anchor="middle" font-size="20" fill="#1a1a1a" font-weight="bold">6</text>
                    <text x="0" y="-180" text-anchor="middle" font-size="20" fill="#fafafa" font-weight="bold">7</text>
                    <text x="0" y="-130" text-anchor="middle" font-size="20" fill="#fafafa" font-weight="bold">8</text>
                    <text x="0" y="-80" text-anchor="middle" font-size="20" fill="#fafafa" font-weight="bold">9</text>
                    <text x="0" y="-30" text-anchor="middle" font-size="20" fill="#1a1a1a" font-weight="bold">10</text>
                    <g id="arrowMarkers"></g>
                </svg>
            </div>

            <div class="archery-info-row">
                <div>
                    <label>Player:</label>
                    <div id="currentPlayerDisplay" class="archery-current-player-display" style="display: none;">
                        <span id="selectedPlayerName">No player selected</span>
                    </div>
                    <button class="archery-btn archery-select-player-btn" id="selectPlayerBtn">Select Player</button>
                </div>
                <div class="archery-score-display">
                    <div class="archery-score-value" id="currentScore">0</div>
                    <div class="archery-score-label">Current Score (Arrow <span id="arrowCount">0</span>/4)</div>
                </div>
            </div>

            <div class="archery-arrows-list" id="arrowsList">
                <div class="archery-arrow-score">-</div>
                <div class="archery-arrow-score">-</div>
                <div class="archery-arrow-score">-</div>
                <div class="archery-arrow-score">-</div>
            </div>

            <div class="archery-targets-label" id="targetsLabel">
                Target Numbers (3 pts each, +3 bonus for all 4):
            </div>
            <div class="archery-targets-list" id="targetsList">
                <div class="archery-target-number">-</div>
                <div class="archery-target-number">-</div>
                <div class="archery-target-number">-</div>
                <div class="archery-target-number">-</div>
            </div>

            <div id="bonusesDisplay"></div>
        </div>

        <!-- Leaderboard Panel -->
        <div class="archery-panel">
            <div class="archery-tabs">
                <button class="archery-tab-button active" id="weeklyTab">Weekly</button>
                <button class="archery-tab-button" id="allTimeTab">All Time</button>
            </div>

            <div class="archery-info-section" id="bonusInfo">
                <h3>Available Bonuses</h3>
                <div id="bonusList"></div>
            </div>

            <h2>Leaderboard</h2>
            <div class="archery-week-selector" id="weekSelector">
                <button class="archery-btn" id="prevWeek">&larr; Previous</button>
                <span id="weekDisplay">Loading...</span>
                <button class="archery-btn" id="nextWeek">Next &rarr;</button>
            </div>
            <div class="archery-leaderboard-wrapper">
                <table class="archery-leaderboard-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Best</th>
                            <th>Games</th>
                            <th>Total</th>
                            <th>Avg</th>
                        </tr>
                    </thead>
                    <tbody id="leaderboardBody">
                        <tr>
                            <td colspan="6" style="text-align: center;">Loading...</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style="text-align: right; margin-top: 10px;">
                <a href="{{ url('/players') }}" class="archery-manage-link">Manage Players &rarr;</a>
            </div>
        </div>
    </div>
</div>

<!-- Player Selection Modal -->
<div id="playerModal" class="archery-modal">
    <div class="archery-modal-content">
        <div class="archery-modal-header">
            <h2>Select Player</h2>
            <button class="archery-close-modal" id="closeModal">&times;</button>
        </div>
        <div class="archery-player-grid" id="playerGrid">
            <p style="text-align: center; color: #94a3b8;">Loading players...</p>
        </div>
    </div>
</div>

<script>
    const API_BASE = '/games/archery/api';
    let currentArrows = [];
    let currentPlayer = null;
    let currentPlayerName = null;
    let currentWeek = null;
    let currentYear = null;
    let currentTab = 'weekly';
    let playersData = [];
    let targetNumbers = [];

    document.addEventListener('DOMContentLoaded', () => {
        loadPlayers();
        loadBonuses();
        initializeWeek();
        setupEventListeners();
    });

    function setupEventListeners() {
        document.getElementById('target').addEventListener('click', handleTargetClick);
        document.getElementById('selectPlayerBtn').addEventListener('click', openPlayerModal);
        document.getElementById('closeModal').addEventListener('click', closePlayerModal);
        document.getElementById('submitBtn').addEventListener('click', submitGame);
        document.getElementById('resetBtn').addEventListener('click', resetGame);
        document.getElementById('prevWeek').addEventListener('click', () => changeWeek(-1));
        document.getElementById('nextWeek').addEventListener('click', () => changeWeek(1));
        document.getElementById('weeklyTab').addEventListener('click', () => switchTab('weekly'));
        document.getElementById('allTimeTab').addEventListener('click', () => switchTab('alltime'));

        window.addEventListener('click', (e) => {
            const modal = document.getElementById('playerModal');
            if (e.target === modal) {
                closePlayerModal();
            }
        });
    }

    function switchTab(tab) {
        currentTab = tab;
        document.getElementById('weeklyTab').classList.toggle('active', tab === 'weekly');
        document.getElementById('allTimeTab').classList.toggle('active', tab === 'alltime');
        document.getElementById('weekSelector').classList.toggle('hidden', tab === 'alltime');

        if (tab === 'weekly') {
            loadLeaderboard();
        } else {
            loadAllTimeLeaderboard();
        }
    }

    async function loadPlayers() {
        try {
            const playersResponse = await fetch(`${API_BASE}/players`);
            const players = await playersResponse.json();

            const leaderboardResponse = await fetch(`${API_BASE}/leaderboard/weekly`);
            const leaderboardData = await leaderboardResponse.json();
            const leaderboard = leaderboardData.leaderboard || [];

            const statsMap = {};
            leaderboard.forEach(entry => {
                statsMap[entry.player_id] = {
                    avg_score: entry.avg_score,
                    best_game: entry.best_game,
                    games_played: entry.games_played
                };
            });

            playersData = await Promise.all(players.map(async player => {
                let lastScore = '-';
                try {
                    const gamesResponse = await fetch(`${API_BASE}/players/${player.id}/games`);
                    const gamesData = await gamesResponse.json();
                    if (gamesData.games && gamesData.games.length > 0) {
                        lastScore = gamesData.games[0].total_score;
                    }
                } catch (e) {
                    console.error('Error loading games for player:', player.id);
                }

                return {
                    id: player.id,
                    name: player.name,
                    last_score: lastScore,
                    avg_score: statsMap[player.id]?.avg_score || '-',
                    best_game: statsMap[player.id]?.best_game || '-',
                    games_played: statsMap[player.id]?.games_played || 0
                };
            }));

            playersData.sort((a, b) => a.name.localeCompare(b.name));
            renderPlayerModal();
        } catch (error) {
            console.error('Error loading players:', error);
        }
    }

    function renderPlayerModal() {
        const playerGrid = document.getElementById('playerGrid');

        if (playersData.length === 0) {
            playerGrid.innerHTML = '<p style="text-align: center; color: #94a3b8;">No players found. <a href="/players" style="color: #2196F3;">Add a player</a></p>';
            return;
        }

        playerGrid.innerHTML = playersData.map(player => `
            <button class="archery-player-button" onclick="selectPlayer(${player.id}, '${player.name.replace(/'/g, "\\'")}')">
                <div class="archery-player-name">${player.name}</div>
                <div class="archery-player-stats">
                    <div class="archery-player-stat">
                        <div class="archery-stat-label">Last Score</div>
                        <div class="archery-stat-value">${player.last_score}</div>
                    </div>
                    <div class="archery-player-stat">
                        <div class="archery-stat-label">Average</div>
                        <div class="archery-stat-value">${player.avg_score}</div>
                    </div>
                    <div class="archery-player-stat">
                        <div class="archery-stat-label">Best</div>
                        <div class="archery-stat-value">${player.best_game}</div>
                    </div>
                </div>
            </button>
        `).join('');
    }

    async function loadBonuses() {
        try {
            const response = await fetch(`${API_BASE}/bonuses`);
            const bonuses = await response.json();
            bonuses.sort((a, b) => b.points - a.points);

            const bonusList = document.getElementById('bonusList');
            bonusList.innerHTML = bonuses.map(bonus =>
                `<p><strong>[+${bonus.points} pts]</strong> ${bonus.name}: ${bonus.description}</p>`
            ).join('');
        } catch (error) {
            console.error('Error loading bonuses:', error);
        }
    }

    function initializeWeek() {
        const now = new Date();
        currentYear = now.getFullYear();
        currentWeek = getWeekNumber(now);
        loadLeaderboard();
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const options = { month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    async function loadLeaderboard() {
        try {
            const response = await fetch(`${API_BASE}/leaderboard/weekly?year=${currentYear}&week=${currentWeek}`);
            const data = await response.json();

            const startFormatted = formatDate(data.start_date);
            const endFormatted = formatDate(data.end_date);
            document.getElementById('weekDisplay').textContent = `${startFormatted} to ${endFormatted}`;

            const tbody = document.getElementById('leaderboardBody');
            if (data.leaderboard.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No games this week</td></tr>';
            } else {
                tbody.innerHTML = data.leaderboard.map((entry, index) => `
                    <tr>
                        <td class="archery-rank">#${index + 1}</td>
                        <td><a href="/games/archery/players/${entry.player_id}">${entry.player_name}</a></td>
                        <td><strong>${entry.best_game}</strong></td>
                        <td>${entry.games_played}</td>
                        <td>${entry.total_score}</td>
                        <td>${entry.avg_score}</td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
        }
    }

    async function loadAllTimeLeaderboard() {
        try {
            const response = await fetch(`${API_BASE}/leaderboard/weekly`);
            const data = await response.json();

            const tbody = document.getElementById('leaderboardBody');
            if (!data.leaderboard || data.leaderboard.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No games yet</td></tr>';
            } else {
                tbody.innerHTML = data.leaderboard.map((entry, index) => `
                    <tr>
                        <td class="archery-rank">#${index + 1}</td>
                        <td><a href="/games/archery/players/${entry.player_id}">${entry.player_name}</a></td>
                        <td><strong>${entry.best_game}</strong></td>
                        <td>${entry.games_played}</td>
                        <td>${entry.total_score}</td>
                        <td>${entry.avg_score}</td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading all-time leaderboard:', error);
        }
    }

    function changeWeek(delta) {
        currentWeek += delta;
        if (currentWeek < 1) {
            currentWeek = 52;
            currentYear--;
        } else if (currentWeek > 52) {
            currentWeek = 1;
            currentYear++;
        }
        loadLeaderboard();
    }

    function openPlayerModal() {
        document.getElementById('playerModal').classList.add('active');
    }

    function closePlayerModal() {
        document.getElementById('playerModal').classList.remove('active');
    }

    function generateTargetNumbers() {
        targetNumbers = [];
        for (let i = 0; i < 4; i++) {
            targetNumbers.push(Math.floor(Math.random() * 5) + 6);
        }
        displayTargetNumbers();
    }

    function displayTargetNumbers() {
        const targetsList = document.getElementById('targetsList');
        if (targetsList && targetNumbers.length > 0) {
            const children = targetsList.children;
            for (let i = 0; i < 4; i++) {
                children[i].textContent = targetNumbers[i];
            }
        }
    }

    function selectPlayer(playerId, playerName) {
        currentPlayer = playerId;
        currentPlayerName = playerName;
        document.getElementById('selectedPlayerName').textContent = playerName;
        document.getElementById('currentPlayerDisplay').style.display = 'block';
        generateTargetNumbers();
        closePlayerModal();
        updateSubmitButton();
    }

    function handleTargetClick(e) {
        if (!currentPlayer) {
            openPlayerModal();
            return;
        }

        if (currentArrows.length >= 4) return;

        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        const svgX = (x / rect.width) * 500;
        const svgY = (y / rect.height) * 500;

        addArrow(svgX, svgY);
    }

    function addArrow(x, y) {
        currentArrows.push({ x, y });

        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        marker.setAttribute('cx', x);
        marker.setAttribute('cy', y);
        marker.setAttribute('r', 16);
        marker.setAttribute('class', 'arrow-marker');
        document.getElementById('arrowMarkers').appendChild(marker);

        const distance = Math.sqrt(x * x + y * y);
        let score = 0;
        if (distance <= 50) score = 10;
        else if (distance <= 100) score = 9;
        else if (distance <= 150) score = 8;
        else if (distance <= 200) score = 7;
        else if (distance <= 250) score = 6;

        updateScoreDisplay(score);
        updateSubmitButton();
    }

    function updateScoreDisplay(arrowScore) {
        const arrowsList = document.getElementById('arrowsList').children;
        const index = currentArrows.length - 1;

        if (arrowScore === 0) {
            arrowsList[index].textContent = 'MISS';
            arrowsList[index].classList.add('miss');
        } else {
            arrowsList[index].textContent = arrowScore;
            arrowsList[index].classList.add('hit');
        }

        const total = Array.from(arrowsList)
            .slice(0, currentArrows.length)
            .reduce((sum, el) => {
                const text = el.textContent;
                return sum + (text === 'MISS' ? 0 : parseInt(text));
            }, 0);

        document.getElementById('currentScore').textContent = total;
        document.getElementById('arrowCount').textContent = currentArrows.length;
    }

    function updateSubmitButton() {
        document.getElementById('submitBtn').disabled = currentArrows.length !== 4 || !currentPlayer;
    }

    async function submitGame() {
        const playerId = currentPlayer;

        document.getElementById('submitBtn').disabled = true;
        currentPlayer = null;
        currentPlayerName = null;
        document.getElementById('currentPlayerDisplay').style.display = 'none';
        document.getElementById('selectedPlayerName').textContent = 'No player selected';

        try {
            const response = await fetch(`${API_BASE}/games`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
                },
                body: JSON.stringify({
                    player_id: playerId,
                    arrows: currentArrows,
                    target_numbers: targetNumbers
                })
            });

            const game = await response.json();

            const bonusesDisplay = document.getElementById('bonusesDisplay');
            if (game.bonuses_applied && game.bonuses_applied.length > 0) {
                bonusesDisplay.innerHTML = `
                    <div class="archery-bonuses-display">
                        <h3>Bonuses Earned!</h3>
                        ${game.bonuses_applied.map(b =>
                            `<div class="archery-bonus-item">+${b.points} pts: ${b.name}</div>`
                        ).join('')}
                        <p style="margin-top: 10px;"><strong>Final Score: ${game.total_score}</strong></p>
                    </div>
                `;
            } else {
                bonusesDisplay.innerHTML = `
                    <div class="archery-bonuses-display">
                        <h3>Game Submitted!</h3>
                        <p style="margin-top: 10px;"><strong>Final Score: ${game.total_score}</strong></p>
                    </div>
                `;
            }

            if (currentTab === 'weekly') {
                loadLeaderboard();
            } else {
                loadAllTimeLeaderboard();
            }
            setTimeout(resetGame, 15000);
        } catch (error) {
            console.error('Error submitting game:', error);
            alert('Error submitting game. Please try again.');
            document.getElementById('submitBtn').disabled = false;
        }
    }

    function resetGame() {
        currentArrows = [];
        currentPlayer = null;
        currentPlayerName = null;
        targetNumbers = [];
        document.getElementById('currentPlayerDisplay').style.display = 'none';
        document.getElementById('selectedPlayerName').textContent = 'No player selected';
        document.getElementById('arrowMarkers').innerHTML = '';
        document.getElementById('currentScore').textContent = '0';
        document.getElementById('arrowCount').textContent = '0';
        document.getElementById('bonusesDisplay').innerHTML = '';

        const arrowsList = document.getElementById('arrowsList').children;
        Array.from(arrowsList).forEach(el => {
            el.textContent = '-';
            el.classList.remove('hit', 'miss');
        });

        const targetsList = document.getElementById('targetsList').children;
        Array.from(targetsList).forEach(el => {
            el.textContent = '-';
        });

        updateSubmitButton();
    }
</script>
@endsection
