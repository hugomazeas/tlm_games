@extends('layouts.app')

@section('title', 'Ping Pong Stats - Games Hub')
@section('main-class', 'px-4 py-4')

@section('content')
@include('games.ping-pong.partials.chrome', ['pageTitle' => 'Stats', 'pageBack' => '/games/ping-pong'])

<div class="pph-stage relative rounded-3xl p-4 md:p-7 overflow-x-hidden" x-data="ppStats()" x-init="init()">

    {{-- Hall of Fame — bragging-rights awards from point tags (1v1) --}}
    <section class="pph-panel p-5 md:p-6 mb-5" x-show="awardsLoaded" x-cloak>
        <div class="flex items-baseline justify-between flex-wrap gap-3 mb-4">
            <div class="flex items-baseline gap-2.5">
                <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6]">Hall of Fame</span>
                <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Singles · tagged points</span>
            </div>
            <div class="inline-flex rounded-full border border-[#f5ecd6]/15 bg-[#f5ecd6]/[0.03] p-0.5">
                <template x-for="opt in [{k:'month',l:'This month'},{k:'all',l:'All-time'}]" :key="opt.k">
                    <button type="button"
                            @click="setAwardsWindow(opt.k)"
                            class="pph-mono text-[10px] tracking-[0.16em] uppercase px-3 py-1.5 rounded-full transition"
                            :class="awardsWindow === opt.k ? 'bg-[#f5ecd6]/[0.12] text-[#f5ecd6]' : 'text-[#f5ecd6]/45 hover:text-[#f5ecd6]/70'"
                            x-text="opt.l"></button>
                </template>
            </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <template x-for="a in awards" :key="a.key">
                <a :href="'/games/ping-pong/awards/' + a.key + '?window=' + awardsWindow"
                   class="flex flex-col gap-1.5 px-4 py-3.5 rounded-[12px] border no-underline transition group"
                   :class="a.holder_player_id
                       ? 'border-[#f5ecd6]/15 bg-[#f5ecd6]/[0.03] hover:bg-[#f5ecd6]/[0.06] hover:border-[#f5ecd6]/30'
                       : 'border-dashed border-[#f5ecd6]/12 bg-transparent hover:border-[#f5ecd6]/25'">
                    <div class="flex items-center gap-2">
                        <span class="text-[20px] leading-none" x-text="a.emoji"></span>
                        <span class="pph-mono text-[10px] font-bold tracking-[0.16em] uppercase text-[#f5ecd6]/60" x-text="a.title"></span>
                        <span class="ml-auto text-[#3ec8ff]/0 group-hover:text-[#3ec8ff]/70 transition text-sm">›</span>
                    </div>

                    {{-- Claimed --}}
                    <template x-if="a.holder_player_id">
                        <div>
                            <div class="flex items-baseline gap-2 mt-0.5">
                                <span class="font-semibold text-[15px] text-[#f5ecd6] truncate" x-text="a.holder_name"></span>
                                <span class="pph-mono font-bold text-[13px] text-[#3ec8ff] tabular-nums shrink-0" x-text="a.value_label"></span>
                            </div>
                            <div class="pph-mono text-[10px] tracking-[0.06em] text-[#f5ecd6]/35 mt-1"
                                 x-show="a.runner_up_name"
                                 x-text="'chased by ' + a.runner_up_name + ' · ' + a.runner_up_value_label"></div>
                        </div>
                    </template>

                    {{-- Unclaimed --}}
                    <template x-if="!a.holder_player_id">
                        <div class="font-semibold text-[15px] text-[#f5ecd6]/35 mt-0.5">Unclaimed</div>
                    </template>

                    {{-- Compute transparency: how this award is calculated --}}
                    <div class="pph-mono text-[10px] tracking-[0.04em] text-[#f5ecd6]/30 mt-1 leading-snug" x-text="a.formula"></div>
                </a>
            </template>
        </div>
    </section>

    {{-- ELO Over Time — every leaderboard player's rating history overlaid --}}
    <section class="pph-panel p-5 md:p-6 mb-5" x-show="eloSeries.length > 0" x-cloak>
        <div class="flex items-baseline gap-2.5 mb-4">
            <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6]">ELO Over Time</span>
            <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Singles · leaderboard</span>
        </div>
        <div class="relative overflow-visible">
            <canvas id="eloOverlayCanvas" style="width: 100%; height: 560px;"></canvas>
        </div>
    </section>

    {{-- Recent games --}}
    <section class="pph-panel p-5 md:p-6 mb-5" x-show="recentGamesLoaded">
        <div class="flex items-baseline gap-2.5 mb-4">
            <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6]">Recent</span>
            <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Completed matches</span>
        </div>
        <p class="pph-mono text-[12px] tracking-[0.14em] uppercase text-[#f5ecd6]/45" x-show="recentGames.length === 0">No completed matches yet.</p>
        <div class="max-h-[min(70vh,720px)] overflow-y-auto" x-show="recentGames.length > 0">
            <div class="flex flex-col gap-2">
                <template x-for="g in recentGames" :key="g.id">
                    <a class="flex items-center flex-wrap gap-x-3.5 gap-y-2.5 px-4 py-3 rounded-[10px] border border-[#f5ecd6]/15 bg-[#f5ecd6]/[0.03] no-underline text-[#f5ecd6]/82 transition hover:bg-[#f5ecd6]/[0.06] hover:border-[#f5ecd6]/30"
                       :href="'/games/ping-pong/matches/' + g.id">
                        <span class="pph-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#f5ecd6]/55 bg-[#f5ecd6]/[0.06] px-2 py-0.5 rounded-md shrink-0" x-text="g.mode === '2v2' ? '2v2' : '1v1'"></span>
                        <div class="flex items-center flex-wrap gap-x-3 gap-y-1 flex-1 min-w-0 font-semibold text-sm">
                            <span :class="g.left_won ? 'text-[#9be7c4]' : 'text-[#ff5a4a]/70'" x-text="g.left_label"></span>
                            <span class="pph-mono font-bold text-[15px] text-[#f5ecd6] tracking-tight tabular-nums" x-text="g.player_left_score + ' · ' + g.player_right_score"></span>
                            <span :class="g.left_won ? 'text-[#ff5a4a]/70' : 'text-[#9be7c4]'" x-text="g.right_label"></span>
                        </div>
                        <span class="ml-auto pph-mono text-[11px] tracking-[0.06em] text-[#f5ecd6]/45 shrink-0" x-text="g.ended_at_human"></span>
                        <span class="text-[#3ec8ff]/70 text-lg shrink-0">›</span>
                    </a>
                </template>
            </div>
        </div>
    </section>

    {{-- ELO Distribution Chart --}}
    <section class="pph-panel p-5 md:p-6" x-show="leaderboard.length > 0">
        <div class="flex items-baseline gap-2.5 mb-4">
            <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6]">ELO Distribution</span>
            <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Singles · live</span>
        </div>
        <div class="relative overflow-visible">
            <canvas id="eloDistCanvas" style="width: 100%; height: 500px;"></canvas>
        </div>
    </section>
</div>

<script>
function ppStats() {
    return {
        API: '/games/ping-pong/api',
        leaderboard: [],
        eloSeries: [],
        recentGames: [],
        recentGamesLoaded: false,
        awards: [],
        awardsWindow: 'month',
        awardsLoaded: false,

        async init() {
            this.loadAwards();
            const [lbRes, recentRes] = await Promise.all([
                fetch(`${this.API}/leaderboard?mode=1v1`),
                fetch(`${this.API}/matches/recent`),
            ]);
            this.leaderboard = await lbRes.json();
            this.recentGames = await recentRes.json();
            this.recentGamesLoaded = true;
            this.$nextTick(() => this.renderEloDistribution());
            this.loadEloSeries();
        },

        async loadEloSeries() {
            const series = await Promise.all(
                this.leaderboard.map(e =>
                    fetch(`${this.API}/players/${e.player_id}/elo-history?mode=1v1`)
                        .then(r => r.json())
                        .then(d => ({ id: e.player_id, name: e.player_name, history: d.history || [] }))
                        .catch(() => ({ id: e.player_id, name: e.player_name, history: [] }))
                )
            );
            this.eloSeries = series.filter(s => s.history.length > 0);
            this.$nextTick(() => this.renderEloOverlay());
        },

        async loadAwards() {
            const res = await fetch(`${this.API}/awards?window=${this.awardsWindow}`);
            const data = await res.json();
            this.awards = data.awards || [];
            this.awardsLoaded = true;
        },

        setAwardsWindow(w) {
            if (this.awardsWindow === w) return;
            this.awardsWindow = w;
            this.loadAwards();
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

        renderEloOverlay() {
            const canvas = document.getElementById('eloOverlayCanvas');
            if (!canvas || !this.eloSeries.length) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const W = rect.width;
            const H = rect.height;

            // Calendar X axis: day 0 = earliest first-day across all series; all series run to today.
            const DAY = 86400000;
            const dayOf = (iso) => Math.floor(new Date(iso).getTime() / DAY);
            let minDay = Infinity;
            let maxDay = -Infinity;
            for (const s of this.eloSeries) {
                for (const p of s.history) {
                    const d = dayOf(p.created_at);
                    if (d < minDay) { minDay = d; }
                    if (d > maxDay) { maxDay = d; }
                }
            }
            const totalDays = Math.max(1, maxDay - minDay);

            // Y axis: min/max across every point and the 1200 baseline, rounded to 50 (matches profile chart).
            let rawMin = 1200;
            let rawMax = 1200;
            for (const s of this.eloSeries) {
                for (const p of s.history) {
                    if (p.rating_after < rawMin) { rawMin = p.rating_after; }
                    if (p.rating_after > rawMax) { rawMax = p.rating_after; }
                }
            }
            const minY = Math.floor((rawMin - 40) / 50) * 50;
            const maxY = Math.ceil((rawMax + 40) / 50) * 50;
            const yRange = (maxY - minY) || 100;
            const yStep = (maxY - minY) / 6 <= 50 ? 50 : ((maxY - minY) / 6 <= 100 ? 100 : 200);

            const pad = { left: 58, right: 130, top: 18, bottom: 36 };
            const chartL = pad.left;
            const chartR = W - pad.right;
            const chartT = pad.top;
            const chartB = H - pad.bottom;
            const chartW = chartR - chartL;
            const chartH = chartB - chartT;

            const toX = (iso) => chartL + ((dayOf(iso) - minDay) / totalDays) * chartW;
            const toY = (v) => chartT + chartH - ((v - minY) / yRange) * chartH;

            ctx.clearRect(0, 0, W, H);

            // Horizontal grid lines + ELO labels
            ctx.font = '500 16px "Outfit", system-ui, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'right';
            for (let v = Math.ceil(minY / yStep) * yStep; v <= maxY; v += yStep) {
                const y = toY(v);
                ctx.strokeStyle = v === 1200 ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.07)';
                ctx.lineWidth = v === 1200 ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(chartL, y);
                ctx.lineTo(chartR, y);
                ctx.stroke();
                ctx.fillStyle = 'rgba(245,236,214,0.8)';
                ctx.fillText(String(v), chartL - 8, y);
            }

            // X axis date labels
            ctx.font = '500 15px "Outfit", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const nTicks = 5;
            for (let i = 0; i <= nTicks; i++) {
                const day = minDay + Math.round((totalDays * i) / nTicks);
                const x = chartL + (chartW * i) / nTicks;
                const d = new Date(day * DAY);
                ctx.fillStyle = 'rgba(245,236,214,0.8)';
                ctx.fillText(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), x, chartB + 6);
            }

            // One polyline per player, color-matched.
            const n = this.eloSeries.length;
            const ends = [];
            for (let i = 0; i < n; i++) {
                const s = this.eloSeries[i];
                const color = `hsl(${Math.round((i * 360) / n)}, 70%, 60%)`;
                const pts = s.history;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(toX(pts[0].created_at), toY(pts[0].rating_after));
                for (let j = 1; j < pts.length; j++) {
                    ctx.lineTo(toX(pts[j].created_at), toY(pts[j].rating_after));
                }
                ctx.stroke();
                const last = pts[pts.length - 1];
                const ex = toX(last.created_at);
                const ey = toY(last.rating_after);
                // End dot
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(ex, ey, 5, 0, Math.PI * 2);
                ctx.fill();
                ends.push({ id: s.id, name: s.name, color, x: ex, y: ey });
            }

            // End-of-line name labels as clickable overlays. De-collide on Y only (X fixed at right edge).
            const container = canvas.parentElement;
            container.querySelectorAll('.elo-overlay-label').forEach(el => el.remove());
            const labelH = 24;
            ends.sort((a, b) => a.y - b.y);
            for (let i = 1; i < ends.length; i++) {
                if (ends[i].y - ends[i - 1].y < labelH) {
                    ends[i].y = ends[i - 1].y + labelH;
                }
            }
            for (const e of ends) {
                const lbl = document.createElement('a');
                lbl.className = 'elo-overlay-label';
                lbl.href = '/games/ping-pong/players/' + e.id;
                lbl.textContent = e.name;
                lbl.style.cssText = `position:absolute;left:${e.x + 12}px;top:${e.y}px;transform:translateY(-50%);font-family:"Outfit",system-ui,sans-serif;font-size:20px;font-weight:600;color:${e.color};white-space:nowrap;text-decoration:none;line-height:1;cursor:pointer;z-index:4;transition:filter 0.2s;`;
                lbl.addEventListener('mouseenter', () => { lbl.style.filter = 'brightness(1.4)'; });
                lbl.addEventListener('mouseleave', () => { lbl.style.filter = 'none'; });
                container.appendChild(lbl);
            }

            ctx.setTransform(1, 0, 0, 1, 0, 0);
        },
    };
}
</script>
@endsection
