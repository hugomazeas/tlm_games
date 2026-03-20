<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Game Over - Ping Pong</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            min-height: 100%;
            font-family: 'Inter', sans-serif;
            background: #0f172a;
            color: white;
            -webkit-user-select: none;
            user-select: none;
        }

        .gameover-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            padding: 24px 16px 40px;
            min-height: 100vh;
        }

        .result {
            font-size: 2.4rem;
            font-weight: 900;
            background: linear-gradient(135deg, #3b82f6, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
        }

        .final-score {
            font-size: 4rem;
            font-weight: 800;
            text-align: center;
        }

        .duration {
            font-size: 1rem;
            color: rgba(255,255,255,0.4);
        }

        .chart-container {
            width: 100%;
            max-width: 600px;
            height: 250px;
            position: relative;
        }

        .elo-section {
            width: 100%;
            max-width: 500px;
        }

        .elo-section-title {
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            opacity: 0.5;
            margin-bottom: 8px;
        }

        .elo-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-radius: 10px;
            background: rgba(255,255,255,0.05);
            margin-bottom: 6px;
        }

        .elo-row .elo-name {
            font-weight: 700;
            font-size: 1.05rem;
            flex: 1;
        }

        .elo-row .elo-rating {
            font-size: 1rem;
            opacity: 0.6;
            margin-right: 10px;
        }

        .elo-row .elo-change {
            font-weight: 900;
            font-size: 1.2rem;
            min-width: 50px;
            text-align: right;
        }

        .elo-positive { color: #22c55e; }
        .elo-negative { color: #ef4444; }

        .leaderboard-section {
            width: 100%;
            max-width: 500px;
        }

        .leaderboard-section-title {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            opacity: 0.5;
            margin-bottom: 10px;
        }

        .leaderboard-row {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            border-radius: 10px;
            background: rgba(255,255,255,0.05);
            margin-bottom: 6px;
            gap: 10px;
        }

        .leaderboard-row .lb-rank {
            font-weight: 900;
            font-size: 1rem;
            color: rgba(255,255,255,0.4);
            min-width: 28px;
            text-align: center;
        }

        .leaderboard-row .lb-name {
            font-weight: 700;
            font-size: 1.05rem;
            flex: 1;
        }

        .leaderboard-row .lb-elo {
            font-weight: 700;
            font-size: 1rem;
            color: rgba(255,255,255,0.7);
        }

        .leaderboard-row .lb-record {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.4);
        }

        .leaderboard-row .lb-elo-change {
            font-weight: 800;
            font-size: 0.85rem;
            margin-left: 6px;
        }

        .leaderboard-row.highlight {
            background: rgba(59, 130, 246, 0.15);
            border: 1px solid rgba(59, 130, 246, 0.3);
            box-shadow: 0 0 12px rgba(59, 130, 246, 0.1);
        }

        .leaderboard-row .streak-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 999px;
            font-weight: 700;
            font-size: 0.85rem;
            margin-left: 6px;
        }

        .leaderboard-row .streak-badge.W {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
        }

        .leaderboard-row .streak-badge.L {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }

        .home-btn {
            display: block;
            width: 100%;
            max-width: 500px;
            padding: 14px;
            border-radius: 12px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: white;
            font-weight: 700;
            font-size: 1rem;
            text-align: center;
            text-decoration: none;
            transition: background 0.15s;
        }

        .home-btn:active {
            background: rgba(255,255,255,0.15);
        }
    </style>
</head>
<body>
    <div class="gameover-container" id="app">
        <div class="result" id="resultText">Loading...</div>
        <div class="final-score" id="finalScore"></div>
        <div class="duration" id="duration"></div>
        <div class="chart-container">
            <canvas id="pointsChart"></canvas>
        </div>
        <div class="elo-section" id="eloSection" style="display: none;"></div>
        <div class="leaderboard-section" id="leaderboardSection" style="display: none;"></div>
        <a href="/games/ping-pong" class="home-btn">Home</a>
    </div>

    <script>
        const MATCH_ID = {{ $matchId }};
        const API = '/games/ping-pong/api';

        async function init() {
            try {
                const res = await fetch(`${API}/matches/${MATCH_ID}`);
                const data = await res.json();
                render(data);
            } catch (err) {
                document.getElementById('resultText').textContent = 'Error loading match';
            }
        }

        function render(data) {
            // Winner
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
            document.getElementById('resultText').textContent = winnerName + ' Wins!';

            // Score
            document.getElementById('finalScore').innerHTML =
                '<span style="color:#fb7185">' + data.player_left_score + '</span>' +
                '<span style="color:rgba(255,255,255,0.3)"> - </span>' +
                '<span style="color:#22d3ee">' + data.player_right_score + '</span>';

            // Duration
            if (data.duration_formatted) {
                document.getElementById('duration').textContent = data.duration_formatted;
            }

            // Chart
            renderPointsChart(data);

            // ELO
            renderEloChanges(data);

            // Leaderboard
            fetchLeaderboard(data);
        }

        function renderPointsChart(data) {
            const canvas = document.getElementById('pointsChart');
            if (!canvas) return;

            const points = data.points || [];
            if (points.length === 0) return;

            const leftName = data.player_left?.name || 'Left';
            const rightName = data.player_right?.name || 'Right';

            const labels = ['0'];
            const leftScores = [0];
            const rightScores = [0];

            points.forEach((p, i) => {
                labels.push(String(i + 1));
                leftScores.push(p.left_score_after);
                rightScores.push(p.right_score_after);
            });

            const maxScore = Math.max(
                leftScores[leftScores.length - 1],
                rightScores[rightScores.length - 1],
                11
            );

            new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: leftName,
                            data: leftScores,
                            borderColor: '#fb7185',
                            backgroundColor: 'rgba(251, 113, 133, 0.1)',
                            borderWidth: 3,
                            pointRadius: 3,
                            pointBackgroundColor: '#fb7185',
                            pointBorderColor: '#fb7185',
                            tension: 0.1,
                            fill: false,
                        },
                        {
                            label: rightName,
                            data: rightScores,
                            borderColor: '#22d3ee',
                            backgroundColor: 'rgba(34, 211, 238, 0.1)',
                            borderWidth: 3,
                            pointRadius: 3,
                            pointBackgroundColor: '#22d3ee',
                            pointBorderColor: '#22d3ee',
                            tension: 0.1,
                            fill: false,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
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
                            titleFont: { size: 13 },
                            bodyFont: { size: 13 },
                            callbacks: {
                                title: (items) => items[0].label === '0' ? 'Start' : 'Point ' + items[0].label,
                            },
                        },
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Point #',
                                color: 'rgba(255,255,255,0.5)',
                                font: { size: 12 },
                            },
                            ticks: { color: 'rgba(255,255,255,0.4)' },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Score',
                                color: 'rgba(255,255,255,0.5)',
                                font: { size: 12 },
                            },
                            min: 0,
                            max: maxScore + 1,
                            ticks: {
                                stepSize: 1,
                                color: 'rgba(255,255,255,0.4)',
                            },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                    },
                },
            });
        }

        function eloTeamRow(name, before, after, change, color) {
            const sign = change >= 0 ? '+' : '';
            const cls = change >= 0 ? 'elo-positive' : 'elo-negative';
            return '<div class="elo-row" style="border-left: 3px solid ' + color + ';">' +
                '<span class="elo-name">' + name + '</span>' +
                '<span class="elo-rating">' + before + ' &rarr; ' + after + '</span>' +
                '<span class="elo-change ' + cls + '">' + sign + change + '</span>' +
                '</div>';
        }

        function eloPlayerRow(name, before, after, color) {
            const change = after - before;
            const sign = change >= 0 ? '+' : '';
            const cls = change >= 0 ? 'elo-positive' : 'elo-negative';
            const borderStyle = color ? 'border-left: 3px solid ' + color + ';' : 'margin-left: 16px; border-left: 2px solid rgba(255,255,255,0.1);';
            return '<div class="elo-row" style="' + borderStyle + '">' +
                '<span class="elo-name">' + name + '</span>' +
                '<span class="elo-rating">' + before + ' &rarr; ' + after + '</span>' +
                '<span class="elo-change ' + cls + '">' + sign + change + '</span>' +
                '</div>';
        }

        function renderEloChanges(data) {
            const elo = data.elo_changes;
            if (!elo) return;

            const eloSection = document.getElementById('eloSection');
            let html = '<div class="elo-section-title">Elo Changes</div>';

            if (data.mode === '2v2') {
                const leftTeamLabel = (data.player_left?.name || '?') + ' & ' + (data.team_left_player2?.name || '?');
                const lc = elo.left;
                html += eloTeamRow(leftTeamLabel, lc.team_avg_before, lc.team_avg_after, lc.change, '#fb7185');
                html += eloPlayerRow(data.player_left?.name || '?', lc.player1.before, lc.player1.after);
                html += eloPlayerRow(data.team_left_player2?.name || '?', lc.player2.before, lc.player2.after);

                const rightTeamLabel = (data.player_right?.name || '?') + ' & ' + (data.team_right_player2?.name || '?');
                const rc = elo.right;
                html += '<div style="height:6px"></div>';
                html += eloTeamRow(rightTeamLabel, rc.team_avg_before, rc.team_avg_after, rc.change, '#22d3ee');
                html += eloPlayerRow(data.player_right?.name || '?', rc.player1.before, rc.player1.after);
                html += eloPlayerRow(data.team_right_player2?.name || '?', rc.player2.before, rc.player2.after);
            } else {
                const lc = elo.left;
                const rc = elo.right;
                html += eloPlayerRow(data.player_left?.name || '?', lc.before, lc.after, '#fb7185');
                html += eloPlayerRow(data.player_right?.name || '?', rc.before, rc.after, '#22d3ee');
            }

            eloSection.innerHTML = html;
            eloSection.style.display = 'block';
        }

        function getMatchPlayerIds(data) {
            const ids = new Set();
            if (data.player_left_id) ids.add(data.player_left_id);
            if (data.player_right_id) ids.add(data.player_right_id);
            if (data.team_left_player2_id) ids.add(data.team_left_player2_id);
            if (data.team_right_player2_id) ids.add(data.team_right_player2_id);
            return ids;
        }

        function getEloChangeForPlayer(data, playerId) {
            const elo = data.elo_changes;
            if (!elo) return null;

            if (data.mode === '2v2') {
                if (playerId === data.player_left_id) return elo.left.player1.after - elo.left.player1.before;
                if (playerId === data.team_left_player2_id) return elo.left.player2.after - elo.left.player2.before;
                if (playerId === data.player_right_id) return elo.right.player1.after - elo.right.player1.before;
                if (playerId === data.team_right_player2_id) return elo.right.player2.after - elo.right.player2.before;
            } else {
                if (playerId === data.player_left_id) return elo.left.after - elo.left.before;
                if (playerId === data.player_right_id) return elo.right.after - elo.right.before;
            }
            return null;
        }

        async function fetchLeaderboard(data) {
            const leaderboardSection = document.getElementById('leaderboardSection');
            const mode = data.mode === '2v2' ? '2v2' : '1v1';
            const matchPlayerIds = getMatchPlayerIds(data);

            try {
                const res = await fetch(`${API}/leaderboard?mode=${mode}`);
                const entries = await res.json();

                let html = '<div class="leaderboard-section-title">Leaderboard</div>';

                entries.forEach((entry, index) => {
                    const isMatchPlayer = matchPlayerIds.has(entry.player_id);
                    const highlightClass = isMatchPlayer ? ' highlight' : '';
                    const eloChange = isMatchPlayer ? getEloChangeForPlayer(data, entry.player_id) : null;

                    html += '<div class="leaderboard-row' + highlightClass + '">';
                    html += '<span class="lb-rank">#' + (index + 1) + '</span>';
                    html += '<span class="lb-name">' + entry.player_name;
                    if (eloChange !== null) {
                        const sign = eloChange >= 0 ? '+' : '';
                        const cls = eloChange >= 0 ? 'elo-positive' : 'elo-negative';
                        html += ' <span class="lb-elo-change ' + cls + '">' + sign + eloChange + '</span>';
                    }
                    html += '</span>';
                    let recordHtml = entry.wins + 'W ' + entry.losses + 'L (' + entry.win_rate + '%)';
                    if (entry.win_streak > 0) {
                        recordHtml += ' <span class="streak-badge W">W' + entry.win_streak + '</span>';
                    } else if (entry.losing_streak > 0) {
                        recordHtml += ' <span class="streak-badge L">L' + entry.losing_streak + '</span>';
                    }
                    html += '<span class="lb-record">' + recordHtml + '</span>';
                    html += '<span class="lb-elo">' + entry.elo_rating + '</span>';

                    html += '</div>';
                });

                leaderboardSection.innerHTML = html;
                leaderboardSection.style.display = 'block';
            } catch (err) {
                // Silently ignore
            }
        }

        init();
    </script>
</body>
</html>
