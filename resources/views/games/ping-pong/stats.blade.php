@extends('layouts.app')

@section('title', 'Ping Pong Stats - Games Hub')
@section('main-class', 'max-w-6xl mx-auto px-6 py-6')

@section('content')
<style>
    .ppst .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 28px;
        padding-bottom: 16px;
        border-bottom: 2px solid rgba(255,255,255,0.08);
    }

    .ppst h1 {
        font-size: 2rem;
        font-weight: 800;
    }

    .ppst h1 span { color: #3b82f6; }

    .ppst .back-link {
        color: #3b82f6;
        text-decoration: none;
        font-weight: 600;
        padding: 8px 16px;
        border: 2px solid #3b82f6;
        border-radius: 8px;
        transition: all 0.2s;
    }

    .ppst .back-link:hover {
        background: #3b82f6;
        color: white;
    }

    .ppst .section {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        padding: 22px;
        margin-bottom: 20px;
    }

    .ppst .section-title {
        font-size: 1.15rem;
        font-weight: 700;
        color: #3b82f6;
        margin-bottom: 16px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .ppst .chart-wrap {
        position: relative;
        overflow: visible;
    }
</style>

<div class="ppst" x-data="ppStats()" x-init="init()">

    <div class="header">
        <h1><span>Ping Pong</span> Stats</h1>
        <a href="/games/ping-pong" class="back-link">&larr; Back to Play</a>
    </div>

    <!-- ELO Distribution Chart -->
    <div class="section" x-show="leaderboard.length > 0">
        <div class="section-title">ELO Distribution</div>
        <div class="chart-wrap">
            <canvas id="eloDistCanvas" style="width: 100%; height: 500px;"></canvas>
        </div>
    </div>
</div>

<script>
function ppStats() {
    return {
        API: '/games/ping-pong/api',
        leaderboard: [],

        async init() {
            const res = await fetch(`${this.API}/leaderboard?mode=1v1`);
            this.leaderboard = await res.json();
            this.$nextTick(() => this.renderEloDistribution());
        },

        renderEloDistribution() {
            const canvas = document.getElementById('eloDistCanvas');
            if (!canvas || !this.leaderboard.length) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            const W = rect.width;
            const H = rect.height;

            const players = this.leaderboard.map(e => ({
                name: e.player_name, elo: e.elo_rating, id: e.player_id,
                streak: e.win_streak > 0 ? e.win_streak : -(e.losing_streak || 0)
            }));
            const elos = players.map(p => p.elo);
            const streaks = players.map(p => p.streak);
            const minElo = Math.min(...elos);
            const maxElo = Math.max(...elos);
            const eloRange = maxElo - minElo || 100;
            const maxStreak = Math.max(1, Math.max(...streaks));
            const minStreak = Math.min(-1, Math.min(...streaks));

            const padL = 50;
            const padR = 36;
            const padTop = 14;
            const padBot = 24;
            const dotR = 14;
            const nameLabelOffsetY = dotR + 4;

            const chartL = padL;
            const chartR = W - padR;
            const chartT = padTop;
            const chartB = H - padBot;
            const chartH = chartB - chartT;
            const chartW = chartR - chartL;

            const totalStreakRange = maxStreak - minStreak;
            const zeroY = chartT + (maxStreak / totalStreakRange) * chartH;

            ctx.clearRect(0, 0, W, H);

            // Horizontal grid lines for streak values
            ctx.font = '500 20px "Outfit", system-ui, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'right';
            for (let v = minStreak; v <= maxStreak; v++) {
                const y = chartT + ((maxStreak - v) / totalStreakRange) * chartH;
                ctx.strokeStyle = v === 0 ? 'rgba(59,130,246,0.2)' : 'rgba(148,163,184,0.06)';
                ctx.lineWidth = v === 0 ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(chartL, y);
                ctx.lineTo(chartR, y);
                ctx.stroke();
                if (v === 0) continue;
                const label = v > 0 ? `W${v}` : `L${Math.abs(v)}`;
                ctx.fillStyle = v > 0 ? 'rgba(52,211,153,0.45)' : 'rgba(248,113,113,0.45)';
                ctx.fillText(label, chartL - 8, y);
            }

            // X axis gradient line at Y=0
            const axisGrad = ctx.createLinearGradient(chartL, 0, chartR, 0);
            axisGrad.addColorStop(0, 'rgba(59,130,246,0.0)');
            axisGrad.addColorStop(0.15, 'rgba(59,130,246,0.22)');
            axisGrad.addColorStop(0.5, 'rgba(59,130,246,0.3)');
            axisGrad.addColorStop(0.85, 'rgba(59,130,246,0.22)');
            axisGrad.addColorStop(1, 'rgba(59,130,246,0.0)');
            ctx.strokeStyle = axisGrad;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(chartL, zeroY);
            ctx.lineTo(chartR, zeroY);
            ctx.stroke();

            // X axis tick marks & ELO labels
            const nTicks = 5;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let i = 0; i <= nTicks; i++) {
                const val = Math.round(minElo - eloRange * 0.1 + (eloRange * 1.2) * i / nTicks);
                const x = chartL + chartW * i / nTicks;
                ctx.fillStyle = 'rgba(148,163,184,0.35)';
                ctx.font = '500 20px "Outfit", system-ui, sans-serif';
                ctx.fillText(val, x, chartB + 2);
                ctx.strokeStyle = 'rgba(148,163,184,0.12)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, zeroY - 3);
                ctx.lineTo(x, zeroY + 3);
                ctx.stroke();
            }

            // Vertical line at ELO 1200 (starting point)
            const startElo = 1200;
            const startX = chartL + (startElo - (minElo - eloRange * 0.1)) / (eloRange * 1.2) * chartW;
            if (startX >= chartL && startX <= chartR) {
                const startLineGrad = ctx.createLinearGradient(0, chartT, 0, chartB);
                startLineGrad.addColorStop(0, 'rgba(148,163,184,0)');
                startLineGrad.addColorStop(0.2, 'rgba(148,163,184,0.18)');
                startLineGrad.addColorStop(0.5, 'rgba(148,163,184,0.25)');
                startLineGrad.addColorStop(0.8, 'rgba(148,163,184,0.18)');
                startLineGrad.addColorStop(1, 'rgba(148,163,184,0)');
                ctx.strokeStyle = startLineGrad;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(startX, chartT);
                ctx.lineTo(startX, chartB);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(148,163,184,0.5)';
                ctx.font = '500 10px "Outfit", system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('1200', startX, chartT - 2);
            }

            // Position dots
            const xScale = (elo) => chartL + (elo - (minElo - eloRange * 0.1)) / (eloRange * 1.2) * chartW;
            const yScale = (streak) => chartT + ((maxStreak - streak) / totalStreakRange) * chartH;
            const sorted = [...players].sort((a, b) => a.elo - b.elo);
            const positions = sorted.map(p => ({ ...p, x: xScale(p.elo), y: yScale(p.streak) }));

            // Name label placement: try above, then randomly pick right/below/left if overlapping
            const nameLabelFontSize = 22;
            ctx.font = `600 ${nameLabelFontSize}px "Outfit", system-ui, sans-serif`;
            const nameLabelPad = 3;
            const nameLabelLineH = nameLabelFontSize * 1.2;
            const makeLabelRect = (pos, side) => {
                const w = ctx.measureText(pos.name).width;
                if (side === 'above') {
                    const bottom = pos.y - nameLabelOffsetY;
                    return { left: pos.x - w/2 - nameLabelPad, right: pos.x + w/2 + nameLabelPad, top: bottom - nameLabelLineH - nameLabelPad, bottom: bottom + nameLabelPad };
                } else if (side === 'right') {
                    const cx = pos.x + dotR + 6;
                    return { left: cx - nameLabelPad, right: cx + w + nameLabelPad, top: pos.y - nameLabelLineH/2 - nameLabelPad, bottom: pos.y + nameLabelLineH/2 + nameLabelPad };
                } else if (side === 'below') {
                    const top = pos.y + nameLabelOffsetY;
                    return { left: pos.x - w/2 - nameLabelPad, right: pos.x + w/2 + nameLabelPad, top: top - nameLabelPad, bottom: top + nameLabelLineH + nameLabelPad };
                } else { // left
                    const cx = pos.x - dotR - 6 - w;
                    return { left: cx - nameLabelPad, right: cx + w + nameLabelPad, top: pos.y - nameLabelLineH/2 - nameLabelPad, bottom: pos.y + nameLabelLineH/2 + nameLabelPad };
                }
            };
            const rectsOverlap = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
            const placedRects = [];
            const labelPlacement = new Map();
            const altSides = ['right', 'below', 'left'];
            for (const entry of this.leaderboard) {
                const pos = positions.find(pp => pp.id === entry.player_id);
                if (!pos) continue;
                // Try above first
                const rAbove = makeLabelRect(pos, 'above');
                if (!placedRects.some(k => rectsOverlap(rAbove, k))) {
                    placedRects.push(rAbove);
                    labelPlacement.set(pos.id, 'above');
                    continue;
                }
                // Deterministic order based on player_id
                const offset = pos.id % altSides.length;
                const ordered = [...altSides.slice(offset), ...altSides.slice(0, offset)];
                let placed = false;
                for (const side of ordered) {
                    const r = makeLabelRect(pos, side);
                    if (!placedRects.some(k => rectsOverlap(r, k))) {
                        placedRects.push(r);
                        labelPlacement.set(pos.id, side);
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    const fallback = ordered[0];
                    placedRects.push(makeLabelRect(pos, fallback));
                    labelPlacement.set(pos.id, fallback);
                }
            }

            // Drop lines
            for (const p of positions) {
                if (p.streak === 0) continue;
                const grad = ctx.createLinearGradient(0, p.y, 0, zeroY);
                if (p.streak > 0) { grad.addColorStop(0, 'rgba(52,211,153,0.25)'); grad.addColorStop(1, 'rgba(52,211,153,0.0)'); }
                else { grad.addColorStop(0, 'rgba(248,113,113,0.25)'); grad.addColorStop(1, 'rgba(248,113,113,0.0)'); }
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x, zeroY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Draw dots with glow
            for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                const rank = players.findIndex(pl => pl.id === p.id);
                const t = players.length > 1 ? rank / (players.length - 1) : 0.5;
                const brightness = 0.5 + t * 0.5;
                let baseR, baseG, baseB;
                if (p.streak > 0) { baseR = 52; baseG = 211; baseB = 153; }
                else if (p.streak < 0) { baseR = 248; baseG = 113; baseB = 113; }
                else { baseR = 59; baseG = 130; baseB = 246; }
                p.color = [baseR, baseG, baseB];
                const glow = ctx.createRadialGradient(p.x, p.y, dotR * 0.3, p.x, p.y, dotR * 2.2);
                glow.addColorStop(0, `rgba(${baseR},${baseG},${baseB},${0.25 * brightness})`);
                glow.addColorStop(1, `rgba(${baseR},${baseG},${baseB},0)`);
                ctx.fillStyle = glow;
                ctx.beginPath(); ctx.arc(p.x, p.y, dotR * 2.2, 0, Math.PI * 2); ctx.fill();
                const dotGrad = ctx.createRadialGradient(p.x - dotR * 0.25, p.y - dotR * 0.25, 0, p.x, p.y, dotR);
                const alpha = 0.65 + brightness * 0.35;
                const lighter = [Math.min(255, baseR + 40), Math.min(255, baseG + 40), Math.min(255, baseB + 40)];
                dotGrad.addColorStop(0, `rgba(${lighter[0]},${lighter[1]},${lighter[2]},${alpha})`);
                dotGrad.addColorStop(1, `rgba(${baseR},${baseG},${baseB},${alpha})`);
                ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2); ctx.fillStyle = dotGrad; ctx.fill();
                ctx.strokeStyle = `rgba(${lighter[0]},${lighter[1]},${lighter[2]},${0.25 + brightness * 0.3})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(p.x - dotR * 0.28, p.y - dotR * 0.28, dotR * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.12 + brightness * 0.13})`; ctx.fill();
            }

            // Interactive overlays
            const container = canvas.parentElement;
            container.querySelectorAll('.elo-name-label, .elo-dot-hit, .elo-dist-player').forEach(el => el.remove());
            const fontSize = nameLabelFontSize;
            ctx.font = `600 ${fontSize}px "Outfit", system-ui, sans-serif`;

            for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                const rank = players.findIndex(pl => pl.id === p.id);
                const t = players.length > 1 ? rank / (players.length - 1) : 0.5;
                const brightness = 0.5 + t * 0.5;
                const labelAlpha = 0.55 + brightness * 0.45;
                const url = '/games/ping-pong/players/' + p.id;
                const placement = labelPlacement.get(p.id) || 'above';
                const [cR, cG, cB] = p.color;
                const dotSize = dotR * 2;
                const labelColor = `rgba(191,219,254,${labelAlpha})`;

                // Dot overlay
                const dot = document.createElement('a');
                dot.className = 'elo-dot-hit';
                dot.href = url;
                dot.style.cssText = `position:absolute;left:${p.x - dotSize/2}px;top:${p.y - dotSize/2}px;width:${dotSize}px;height:${dotSize}px;border-radius:50%;cursor:pointer;z-index:3;background:rgba(${cR},${cG},${cB},0.85);border:1.5px solid rgba(${Math.min(255,cR+40)},${Math.min(255,cG+40)},${Math.min(255,cB+40)},0.4);transition:transform 0.2s,box-shadow 0.2s;`;
                container.appendChild(dot);

                // Name label
                const lbl = document.createElement('a');
                lbl.className = 'elo-name-label';
                lbl.href = url;
                lbl.textContent = p.name;
                const lblBase = `font-family:"Outfit",system-ui,sans-serif;font-size:${fontSize}px;font-weight:600;color:${labelColor};white-space:nowrap;text-decoration:none;line-height:1;letter-spacing:-0.01em;cursor:pointer;z-index:4;transition:color 0.2s,transform 0.2s;`;
                if (placement === 'above') {
                    lbl.style.cssText = `position:absolute;left:${p.x}px;top:${p.y - nameLabelOffsetY}px;transform:translateX(-50%) translateY(-100%);${lblBase}`;
                } else if (placement === 'below') {
                    lbl.style.cssText = `position:absolute;left:${p.x}px;top:${p.y + nameLabelOffsetY}px;transform:translateX(-50%);${lblBase}`;
                } else if (placement === 'left') {
                    lbl.style.cssText = `position:absolute;left:${p.x - dotR - 6}px;top:${p.y}px;transform:translateX(-100%) translateY(-50%);${lblBase}`;
                } else {
                    lbl.style.cssText = `position:absolute;left:${p.x + dotR + 6}px;top:${p.y}px;transform:translateY(-50%);${lblBase}`;
                }
                container.appendChild(lbl);

                const hoverIn = () => {
                    dot.style.transform = 'scale(1.45)';
                    dot.style.boxShadow = `0 0 18px 6px rgba(${cR},${cG},${cB},0.55)`;
                    dot.style.zIndex = '50';
                    lbl.style.color = 'rgba(96,165,250,1)';
                    lbl.style.zIndex = '50';
                };
                const hoverOut = () => {
                    dot.style.transform = 'scale(1)';
                    dot.style.boxShadow = 'none';
                    dot.style.zIndex = '3';
                    lbl.style.color = labelColor;
                    lbl.style.zIndex = '4';
                };
                dot.addEventListener('mouseenter', hoverIn);
                dot.addEventListener('mouseleave', hoverOut);
                lbl.addEventListener('mouseenter', hoverIn);
                lbl.addEventListener('mouseleave', hoverOut);
            }
        },
    };
}
</script>
@endsection
