@extends('layouts.app')

@section('title', $player->name . ' - Archery Stats')
@section('main-class', 'max-w-6xl mx-auto px-6 py-6')

@section('content')
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
    .archery-stats .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 2px solid #334155;
    }

    .archery-stats h1 {
        color: #f1f5f9;
        font-size: 2rem;
    }

    .archery-stats .back-link {
        color: #2196F3;
        text-decoration: none;
        font-weight: 600;
        padding: 8px 16px;
        border: 2px solid #2196F3;
        border-radius: 4px;
        transition: all 0.3s;
    }

    .archery-stats .back-link:hover {
        background: #2196F3;
        color: white;
    }

    .archery-stats .overview-section {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 20px;
        margin-bottom: 20px;
        align-items: start;
    }

    .archery-stats .all-arrows-target {
        background: #1e293b;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #334155;
        text-align: center;
    }

    .archery-stats .all-arrows-target h3 {
        color: #f1f5f9;
        margin-bottom: 10px;
        font-size: 1rem;
    }

    .archery-stats .all-arrows-svg {
        width: 300px;
        height: 300px;
    }

    .archery-stats .score-breakdown {
        background: #1e293b;
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #334155;
        margin-top: 15px;
    }

    .archery-stats .score-breakdown h3 {
        color: #f1f5f9;
        margin-bottom: 10px;
        font-size: 0.95rem;
        text-align: center;
    }

    .archery-stats .breakdown-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
    }

    .archery-stats .breakdown-table th,
    .archery-stats .breakdown-table td {
        padding: 6px 8px;
        text-align: center;
        border-bottom: 1px solid #334155;
    }

    .archery-stats .breakdown-table th {
        color: #cbd5e1;
        font-weight: 600;
        background: #0f172a;
    }

    .archery-stats .breakdown-table td {
        color: #e2e8f0;
    }

    .archery-stats .breakdown-table tr:last-child td {
        border-bottom: none;
    }

    .archery-stats .score-10 { color: #fbbf24; }
    .archery-stats .score-9 { color: #dc2626; }
    .archery-stats .score-8 { color: #2563eb; }
    .archery-stats .score-7 { color: #1a1a1a; background: #94a3b8; }
    .archery-stats .score-6 { color: #fafafa; }
    .archery-stats .score-miss { color: #fca5a5; }

    .archery-stats .stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
    }

    .archery-stats .stat-card {
        background: #1e293b;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #334155;
        text-align: center;
    }

    .archery-stats .stat-value {
        font-size: 2rem;
        font-weight: bold;
        color: #4CAF50;
    }

    .archery-stats .stat-label {
        color: #94a3b8;
        margin-top: 5px;
        font-size: 0.9rem;
    }

    .archery-stats .tabs {
        display: flex;
        gap: 0;
        margin-bottom: 20px;
        border-bottom: 2px solid #334155;
    }

    .archery-stats .tab-button {
        flex: 1;
        padding: 12px;
        background: transparent;
        color: #94a3b8;
        border: none;
        border-bottom: 3px solid transparent;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        margin-bottom: -2px;
    }

    .archery-stats .tab-button:hover {
        background: #334155;
        color: #e2e8f0;
    }

    .archery-stats .tab-button.active {
        color: #4CAF50;
        border-bottom-color: #4CAF50;
        background: transparent;
    }

    .archery-stats .week-selector {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        align-items: center;
    }

    .archery-stats .week-selector button {
        padding: 8px 16px;
        background: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.3s;
    }

    .archery-stats .week-selector button:hover {
        background: #0b7dda;
    }

    .archery-stats .week-selector span {
        flex: 1;
        text-align: center;
        font-weight: 600;
        color: #e2e8f0;
    }

    .archery-stats .week-selector.hidden {
        display: none;
    }

    .archery-stats .games-grid {
        display: grid;
        gap: 8px;
    }

    .archery-stats .game-card {
        background: #1e293b;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid #334155;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .archery-stats .game-card:hover {
        border-color: #4CAF50;
        background: #253447;
    }

    .archery-stats .game-target {
        flex-shrink: 0;
    }

    .archery-stats .game-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .archery-stats .game-info-row {
        display: flex;
        align-items: center;
        gap: 15px;
    }

    .archery-stats .game-score {
        font-size: 1.8rem;
        font-weight: bold;
        color: #4CAF50;
        min-width: 60px;
    }

    .archery-stats .game-date {
        color: #94a3b8;
        font-size: 0.8rem;
        min-width: 130px;
    }

    .archery-stats .game-details {
        display: flex;
        gap: 20px;
        flex: 1;
    }

    .archery-stats .detail-item {
        text-align: center;
    }

    .archery-stats .detail-label {
        color: #94a3b8;
        font-size: 0.75rem;
        margin-bottom: 2px;
    }

    .archery-stats .detail-value {
        font-size: 1rem;
        font-weight: bold;
        color: #e2e8f0;
    }

    .archery-stats .arrows-display {
        display: flex;
        gap: 6px;
        justify-content: center;
    }

    .archery-stats .arrow-score {
        background: #0f172a;
        padding: 6px 10px;
        border-radius: 4px;
        text-align: center;
        font-weight: bold;
        font-size: 0.95rem;
        border: 1px solid #334155;
        color: #64748b;
        min-width: 45px;
    }

    .archery-stats .arrow-score.hit {
        background: #064e3b;
        color: #6ee7b7;
        border-color: #10b981;
    }

    .archery-stats .arrow-score.miss {
        background: #7f1d1d;
        color: #fca5a5;
        border-color: #dc2626;
    }

    .archery-stats .target-svg {
        width: 120px;
        height: 120px;
    }

    .archery-stats .arrow-marker {
        fill: #ff0000;
        stroke: #8b0000;
        stroke-width: 3;
    }

    .archery-stats .bonuses-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        justify-content: center;
    }

    .archery-stats .bonus-tag {
        background: #422006;
        color: #fbbf24;
        padding: 3px 8px;
        border-radius: 3px;
        font-size: 0.75rem;
        font-weight: 600;
        border: 1px solid #fbbf24;
        white-space: nowrap;
    }

    .archery-stats .no-bonuses {
        color: #64748b;
        font-size: 0.75rem;
        font-style: italic;
        text-align: center;
    }

    .archery-stats .targets-display {
        display: flex;
        gap: 4px;
        justify-content: center;
        margin-top: 6px;
    }

    .archery-stats .target-number {
        background: #422006;
        padding: 4px 8px;
        border-radius: 3px;
        text-align: center;
        font-weight: bold;
        font-size: 0.75rem;
        border: 1px solid #fbbf24;
        color: #fbbf24;
        min-width: 30px;
    }

    .archery-stats .no-targets {
        color: #64748b;
        font-size: 0.7rem;
        font-style: italic;
        text-align: center;
    }

    .archery-stats .no-games {
        text-align: center;
        padding: 40px;
        background: #1e293b;
        border-radius: 8px;
        color: #94a3b8;
        border: 1px solid #334155;
    }

    .archery-stats .loading {
        text-align: center;
        padding: 40px;
        color: #94a3b8;
    }

    .archery-stats .podium-section {
        background: #1e293b;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #334155;
        margin-bottom: 20px;
    }

    .archery-stats .podium-section h3 {
        color: #f1f5f9;
        margin-bottom: 20px;
        font-size: 1.2rem;
        text-align: center;
    }

    .archery-stats .podium-container {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 15px;
        padding: 20px;
    }

    .archery-stats .podium-place {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        max-width: 200px;
    }

    .archery-stats .podium-block {
        width: 100%;
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        border: 2px solid;
        border-radius: 8px 8px 0 0;
        padding: 15px 10px;
        text-align: center;
        transition: transform 0.3s;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    }

    .archery-stats .podium-block:hover {
        transform: translateY(-5px);
    }

    .archery-stats .podium-place.first .podium-block {
        border-color: #fbbf24;
        background: linear-gradient(135deg, #422006 0%, #1e293b 100%);
        min-height: 180px;
    }

    .archery-stats .podium-place.second .podium-block {
        border-color: #94a3b8;
        min-height: 140px;
    }

    .archery-stats .podium-place.third .podium-block {
        border-color: #cd7f32;
        min-height: 120px;
    }

    .archery-stats .podium-rank {
        font-size: 2rem;
        margin-bottom: 10px;
    }

    .archery-stats .podium-place.first .podium-rank { color: #fbbf24; }
    .archery-stats .podium-place.second .podium-rank { color: #94a3b8; }
    .archery-stats .podium-place.third .podium-rank { color: #cd7f32; }

    .archery-stats .podium-bonus-name {
        font-size: 0.9rem;
        font-weight: bold;
        color: #f1f5f9;
        margin-bottom: 8px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        max-width: 100%;
        line-height: 1.2;
    }

    .archery-stats .podium-count {
        font-size: 1.5rem;
        font-weight: bold;
        color: #4CAF50;
        margin-bottom: 3px;
    }

    .archery-stats .podium-label {
        font-size: 0.75rem;
        color: #94a3b8;
    }

    .archery-stats .no-bonuses-podium {
        text-align: center;
        color: #94a3b8;
        padding: 40px;
    }

    .archery-stats .charts-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        margin-bottom: 20px;
    }

    .archery-stats .chart-section {
        background: #1e293b;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #334155;
    }

    .archery-stats .chart-section h3 {
        color: #f1f5f9;
        margin-bottom: 15px;
        font-size: 1.2rem;
        text-align: center;
    }

    .archery-stats .chart-container {
        position: relative;
        height: 300px;
    }
</style>

<div class="archery-stats">
    <div class="header">
        <h1>{{ $player->name }} - Game History</h1>
        <a href="{{ url('/games/archery') }}" class="back-link">&larr; Back to Game</a>
    </div>

    <div class="overview-section">
        <div>
            <div class="all-arrows-target">
                <h3>All Arrows Ever Thrown</h3>
                <svg class="all-arrows-svg" id="allArrowsTarget" viewBox="-250 -250 500 500">
                    <circle cx="0" cy="0" r="250" fill="#fafafa" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="200" fill="#1a1a1a" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="150" fill="#2563eb" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="100" fill="#dc2626" stroke="#666" stroke-width="2"/>
                    <circle cx="0" cy="0" r="50" fill="#fbbf24" stroke="#666" stroke-width="2"/>
                    <line x1="-250" y1="0" x2="250" y2="0" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>
                    <line x1="0" y1="-250" x2="0" y2="250" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>
                    <g id="allArrowsMarkers"></g>
                </svg>
                <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 10px;">
                    <span id="totalArrowsCount">0</span> arrows total
                </div>
            </div>

            <div class="score-breakdown">
                <h3>Score Distribution</h3>
                <table class="breakdown-table">
                    <thead>
                        <tr>
                            <th>Score</th>
                            <th>Count</th>
                            <th>%</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td class="score-label score-10" style="font-weight:bold">10</td><td id="count-10">0</td><td id="percent-10">0%</td></tr>
                        <tr><td class="score-label score-9" style="font-weight:bold">9</td><td id="count-9">0</td><td id="percent-9">0%</td></tr>
                        <tr><td class="score-label score-8" style="font-weight:bold">8</td><td id="count-8">0</td><td id="percent-8">0%</td></tr>
                        <tr><td class="score-label score-7" style="font-weight:bold">7</td><td id="count-7">0</td><td id="percent-7">0%</td></tr>
                        <tr><td class="score-label score-6" style="font-weight:bold">6</td><td id="count-6">0</td><td id="percent-6">0%</td></tr>
                        <tr><td class="score-label score-miss" style="font-weight:bold">Miss</td><td id="count-miss">0</td><td id="percent-miss">0%</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div>
            <div class="podium-section" id="podiumSection">
                <h3>Top Bonuses</h3>
                <div id="podiumContainer">
                    <div class="loading" style="padding: 20px;">Loading bonuses...</div>
                </div>
            </div>

            <div class="stats-grid" id="statsGrid">
                <div class="stat-card">
                    <div class="stat-value" id="totalGames">-</div>
                    <div class="stat-label">Total Games</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="bestScore">-</div>
                    <div class="stat-label">Best Score</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="avgScore">-</div>
                    <div class="stat-label">Average Score</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="totalScore">-</div>
                    <div class="stat-label">Total Score</div>
                </div>
            </div>
        </div>
    </div>

    <div class="charts-grid">
        <div class="chart-section">
            <h3>Average Score by Week</h3>
            <div class="chart-container">
                <canvas id="weeklyAverageChart"></canvas>
            </div>
        </div>
        <div class="chart-section">
            <h3>Precision per Week (%)</h3>
            <div class="chart-container">
                <canvas id="weeklyPrecisionChart"></canvas>
            </div>
        </div>
    </div>

    <div class="tabs">
        <button class="tab-button active" id="allTimeTab">All Time</button>
        <button class="tab-button" id="weeklyTab">Weekly</button>
    </div>

    <div class="week-selector hidden" id="weekSelector">
        <button id="prevWeek">&larr; Previous</button>
        <span id="weekDisplay">Loading...</span>
        <button id="nextWeek">Next &rarr;</button>
    </div>

    <div id="gamesContainer" class="games-grid">
        <div class="loading">Loading games...</div>
    </div>
</div>

<script>
    const API_BASE = '/games/archery/api';
    const playerId = {{ $player->id }};
    let currentTab = 'alltime';
    let currentWeek = null;
    let currentYear = null;
    let allTimeGames = [];
    let weeklyGames = [];
    let weeklyChart = null;
    let precisionChart = null;

    document.addEventListener('DOMContentLoaded', () => {
        initializeWeek();
        setupEventListeners();
        loadAllTimeGames();
        loadTopBonuses();
        loadWeeklyAverages();
        loadWeeklyPrecision();
    });

    function setupEventListeners() {
        document.getElementById('allTimeTab').addEventListener('click', () => switchTab('alltime'));
        document.getElementById('weeklyTab').addEventListener('click', () => switchTab('weekly'));
        document.getElementById('prevWeek').addEventListener('click', () => changeWeek(-1));
        document.getElementById('nextWeek').addEventListener('click', () => changeWeek(1));
    }

    function initializeWeek() {
        const now = new Date();
        currentYear = now.getFullYear();
        currentWeek = getWeekNumber(now);
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function switchTab(tab) {
        currentTab = tab;
        document.getElementById('allTimeTab').classList.toggle('active', tab === 'alltime');
        document.getElementById('weeklyTab').classList.toggle('active', tab === 'weekly');
        document.getElementById('weekSelector').classList.toggle('hidden', tab === 'alltime');

        if (tab === 'alltime') {
            if (allTimeGames.length === 0) {
                loadAllTimeGames();
            } else {
                renderGames(allTimeGames);
            }
        } else {
            loadWeeklyGames();
        }
    }

    async function loadAllTimeGames() {
        try {
            const response = await fetch(`${API_BASE}/players/${playerId}/games`);
            const data = await response.json();
            allTimeGames = data.games;
            updateStats(allTimeGames);
            renderGames(allTimeGames);
        } catch (error) {
            console.error('Error loading all-time games:', error);
            document.getElementById('gamesContainer').innerHTML = '<div class="no-games">Error loading games</div>';
        }
    }

    async function loadWeeklyGames() {
        try {
            const response = await fetch(`${API_BASE}/players/${playerId}/games?year=${currentYear}&week=${currentWeek}`);
            const data = await response.json();
            weeklyGames = data.games;

            const startDate = getDateOfISOWeek(currentWeek, currentYear);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            const startFormatted = formatDate(startDate);
            const endFormatted = formatDate(endDate);
            document.getElementById('weekDisplay').textContent = `${startFormatted} to ${endFormatted}`;

            renderGames(weeklyGames);
        } catch (error) {
            console.error('Error loading weekly games:', error);
            document.getElementById('gamesContainer').innerHTML = '<div class="no-games">Error loading games</div>';
        }
    }

    function getDateOfISOWeek(week, year) {
        const simple = new Date(year, 0, 1 + (week - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = simple;
        if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        return ISOweekStart;
    }

    function changeWeek(delta) {
        currentWeek += delta;
        if (currentWeek < 1) { currentWeek = 52; currentYear--; }
        else if (currentWeek > 52) { currentWeek = 1; currentYear++; }
        loadWeeklyGames();
    }

    function updateStats(games) {
        if (games.length === 0) {
            document.getElementById('totalGames').textContent = '0';
            document.getElementById('bestScore').textContent = '-';
            document.getElementById('avgScore').textContent = '-';
            document.getElementById('totalScore').textContent = '0';
            document.getElementById('totalArrowsCount').textContent = '0';
            return;
        }

        const totalGames = games.length;
        const bestScore = Math.max(...games.map(g => g.total_score));
        const totalScore = games.reduce((sum, g) => sum + g.total_score, 0);
        const avgScore = (totalScore / totalGames).toFixed(2);

        document.getElementById('totalGames').textContent = totalGames;
        document.getElementById('bestScore').textContent = bestScore;
        document.getElementById('avgScore').textContent = avgScore;
        document.getElementById('totalScore').textContent = totalScore;

        renderAllArrows(games);
    }

    function renderAllArrows(games) {
        const allArrows = [];
        games.forEach(game => { allArrows.push(...(game.arrow_data || [])); });

        document.getElementById('totalArrowsCount').textContent = allArrows.length;

        const scoreCount = { 10: 0, 9: 0, 8: 0, 7: 0, 6: 0, miss: 0 };
        allArrows.forEach(arrow => {
            const score = calculateArrowScore(arrow);
            if (score === 0) scoreCount.miss++;
            else scoreCount[score]++;
        });

        const totalArrows = allArrows.length;
        if (totalArrows > 0) {
            for (const score of [10, 9, 8, 7, 6]) {
                const count = scoreCount[score];
                document.getElementById(`count-${score}`).textContent = count;
                document.getElementById(`percent-${score}`).textContent = `${((count / totalArrows) * 100).toFixed(1)}%`;
            }
            document.getElementById('count-miss').textContent = scoreCount.miss;
            document.getElementById('percent-miss').textContent = `${((scoreCount.miss / totalArrows) * 100).toFixed(1)}%`;
        }

        const markersContainer = document.getElementById('allArrowsMarkers');
        markersContainer.innerHTML = '';
        allArrows.forEach(arrow => {
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            marker.setAttribute('cx', arrow.x);
            marker.setAttribute('cy', arrow.y);
            marker.setAttribute('r', '6');
            marker.setAttribute('class', 'arrow-marker');
            marker.setAttribute('opacity', '0.7');
            markersContainer.appendChild(marker);
        });
    }

    function renderGames(games) {
        const container = document.getElementById('gamesContainer');

        if (games.length === 0) {
            container.innerHTML = '<div class="no-games">No games found</div>';
            return;
        }

        container.innerHTML = games.map(game => {
            const arrows = game.arrow_data || [];
            const arrowScores = arrows.map(arrow => calculateArrowScore(arrow));
            const targetSVG = generateTargetSVG(arrows);
            const bonuses = game.bonuses_applied || [];
            const targetNumbers = game.target_numbers || [];

            const targetBonus = bonuses.find(b => b.name === 'Target Numbers');

            const bonusesHTML = bonuses.length > 0
                ? `<div class="bonuses-list">${bonuses.map(bonus => {
                    if (bonus.name === 'Target Numbers' && targetBonus) {
                        return `<span class="bonus-tag">+${bonus.points} ${bonus.name} - ${bonus.description}</span>`;
                    }
                    return `<span class="bonus-tag">+${bonus.points} ${bonus.name}</span>`;
                  }).join('')}</div>`
                : '<div class="no-bonuses">No bonuses</div>';

            const targetsHTML = targetNumbers.length > 0
                ? `<div class="targets-display">${targetNumbers.map(num =>
                    `<div class="target-number">${num}</div>`
                  ).join('')}</div>`
                : '<div class="no-targets">No targets</div>';

            return `
                <div class="game-card">
                    <div class="game-target">${targetSVG}</div>
                    <div class="game-info">
                        <div class="game-info-row">
                            <div class="game-score">${game.total_score}</div>
                            <div class="game-date">${game.created_at_formatted}</div>
                            <div class="game-details">
                                <div class="detail-item">
                                    <div class="detail-label">Base</div>
                                    <div class="detail-value">${game.base_score}</div>
                                </div>
                                <div class="detail-item">
                                    <div class="detail-label">Bonus</div>
                                    <div class="detail-value">${game.bonus_score}</div>
                                </div>
                            </div>
                        </div>
                        <div class="arrows-display">
                            ${arrowScores.map(score => {
                                if (score === 0) return '<div class="arrow-score miss">MISS</div>';
                                return `<div class="arrow-score hit">${score}</div>`;
                            }).join('')}
                        </div>
                        ${targetsHTML}
                        ${bonusesHTML}
                    </div>
                </div>
            `;
        }).join('');
    }

    function generateTargetSVG(arrows) {
        const arrowMarkers = arrows.map(arrow =>
            `<circle cx="${arrow.x}" cy="${arrow.y}" r="8" class="arrow-marker"/>`
        ).join('');

        return `
            <svg class="target-svg" viewBox="-250 -250 500 500">
                <circle cx="0" cy="0" r="250" fill="#fafafa" stroke="#666" stroke-width="2"/>
                <circle cx="0" cy="0" r="200" fill="#1a1a1a" stroke="#666" stroke-width="2"/>
                <circle cx="0" cy="0" r="150" fill="#2563eb" stroke="#666" stroke-width="2"/>
                <circle cx="0" cy="0" r="100" fill="#dc2626" stroke="#666" stroke-width="2"/>
                <circle cx="0" cy="0" r="50" fill="#fbbf24" stroke="#666" stroke-width="2"/>
                <line x1="-250" y1="0" x2="250" y2="0" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>
                <line x1="0" y1="-250" x2="0" y2="250" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>
                ${arrowMarkers}
            </svg>
        `;
    }

    function calculateArrowScore(arrow) {
        const distance = Math.sqrt(arrow.x * arrow.x + arrow.y * arrow.y);
        if (distance <= 50) return 10;
        if (distance <= 100) return 9;
        if (distance <= 150) return 8;
        if (distance <= 200) return 7;
        if (distance <= 250) return 6;
        return 0;
    }

    async function loadTopBonuses() {
        try {
            const response = await fetch(`${API_BASE}/players/${playerId}/top-bonuses`);
            const data = await response.json();
            renderPodium(data.top_bonuses);
        } catch (error) {
            console.error('Error loading top bonuses:', error);
            document.getElementById('podiumContainer').innerHTML = '<div class="no-bonuses-podium">Error loading bonuses</div>';
        }
    }

    function renderPodium(bonuses) {
        const container = document.getElementById('podiumContainer');

        if (!bonuses || bonuses.length === 0) {
            container.innerHTML = '<div class="no-bonuses-podium">No bonuses earned yet</div>';
            return;
        }

        const emojis = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
        let podiumHTML = '<div class="podium-container">';

        if (bonuses.length >= 2) {
            podiumHTML += `
                <div class="podium-place second">
                    <div class="podium-block">
                        <div class="podium-rank">${emojis[1]}</div>
                        <div class="podium-bonus-name">${bonuses[1].name}</div>
                        <div class="podium-count">${bonuses[1].count}</div>
                        <div class="podium-label">times</div>
                    </div>
                </div>`;
        }

        if (bonuses.length >= 1) {
            podiumHTML += `
                <div class="podium-place first">
                    <div class="podium-block">
                        <div class="podium-rank">${emojis[0]}</div>
                        <div class="podium-bonus-name">${bonuses[0].name}</div>
                        <div class="podium-count">${bonuses[0].count}</div>
                        <div class="podium-label">times</div>
                    </div>
                </div>`;
        }

        if (bonuses.length >= 3) {
            podiumHTML += `
                <div class="podium-place third">
                    <div class="podium-block">
                        <div class="podium-rank">${emojis[2]}</div>
                        <div class="podium-bonus-name">${bonuses[2].name}</div>
                        <div class="podium-count">${bonuses[2].count}</div>
                        <div class="podium-label">times</div>
                    </div>
                </div>`;
        }

        podiumHTML += '</div>';
        container.innerHTML = podiumHTML;
    }

    async function loadWeeklyAverages() {
        try {
            const response = await fetch(`${API_BASE}/players/${playerId}/weekly-averages`);
            const data = await response.json();
            renderWeeklyChart(data.weekly_averages);
        } catch (error) {
            console.error('Error loading weekly averages:', error);
        }
    }

    function renderWeeklyChart(weeklyData) {
        const ctx = document.getElementById('weeklyAverageChart').getContext('2d');
        if (weeklyChart) weeklyChart.destroy();

        const labels = weeklyData.map(week => week.week_label);
        const averages = weeklyData.map(week => week.average);

        weeklyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Score',
                    data: averages,
                    backgroundColor: 'rgba(76, 175, 80, 0.6)',
                    borderColor: 'rgba(76, 175, 80, 1)',
                    borderWidth: 2,
                    borderRadius: 5,
                    hoverBackgroundColor: 'rgba(76, 175, 80, 0.8)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#e2e8f0',
                        borderColor: '#334155', borderWidth: 1, padding: 12, displayColors: false,
                        callbacks: {
                            label: function(context) {
                                const weekData = weeklyData[context.dataIndex];
                                return [`Average: ${context.parsed.y.toFixed(2)}`, `Games: ${weekData.game_count}`];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#334155', drawBorder: false },
                        ticks: { color: '#94a3b8', font: { size: 12 } },
                        title: { display: true, text: 'Average Score', color: '#f1f5f9', font: { size: 14, weight: 'bold' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 45, minRotation: 45 },
                        title: { display: true, text: 'Week', color: '#f1f5f9', font: { size: 14, weight: 'bold' } }
                    }
                }
            }
        });
    }

    async function loadWeeklyPrecision() {
        try {
            const response = await fetch(`${API_BASE}/players/${playerId}/weekly-precision`);
            const data = await response.json();
            renderPrecisionChart(data.weekly_precision);
        } catch (error) {
            console.error('Error loading weekly precision:', error);
        }
    }

    function renderPrecisionChart(weeklyData) {
        const ctx = document.getElementById('weeklyPrecisionChart').getContext('2d');
        if (precisionChart) precisionChart.destroy();

        const labels = weeklyData.map(week => week.week_label);
        const precisionValues = weeklyData.map(week => week.precision);

        precisionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Precision',
                    data: precisionValues,
                    backgroundColor: 'rgba(33, 150, 243, 0.6)',
                    borderColor: 'rgba(33, 150, 243, 1)',
                    borderWidth: 2,
                    borderRadius: 5,
                    hoverBackgroundColor: 'rgba(33, 150, 243, 0.8)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#e2e8f0',
                        borderColor: '#334155', borderWidth: 1, padding: 12, displayColors: false,
                        callbacks: {
                            label: function(context) {
                                const weekData = weeklyData[context.dataIndex];
                                return [`Precision: ${context.parsed.y.toFixed(2)}%`, `Arrows: ${weekData.arrow_count}`];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true, max: 100,
                        grid: { color: '#334155', drawBorder: false },
                        ticks: { color: '#94a3b8', font: { size: 12 }, callback: function(v) { return v + '%'; } },
                        title: { display: true, text: 'Precision (%)', color: '#f1f5f9', font: { size: 14, weight: 'bold' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 45, minRotation: 45 },
                        title: { display: true, text: 'Week', color: '#f1f5f9', font: { size: 14, weight: 'bold' } }
                    }
                }
            }
        });
    }
</script>
@endsection
