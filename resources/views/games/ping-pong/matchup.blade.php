@extends('layouts.app')

@section('title', $playerA->name . ' vs ' . $playerB->name . ' - Ping Pong')
@section('main-class', 'px-4 py-4')

@section('content')
@include('games.ping-pong.partials.chrome', ['pageTitle' => 'Matchup'])

<div class="pph-stage relative rounded-3xl p-4 md:p-7"
     x-data="matchupChart({{ $playerA->id }}, {{ $playerB->id }})"
     x-init="load()">

<style>
    .mu { color: #f5ecd6; }

    .mu .mu-head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 10px;
        padding-bottom: 14px;
        margin-bottom: 18px;
        border-bottom: 2px solid rgba(245, 236, 214, 0.1);
    }
    .mu .mu-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.01em; }
    .mu .mu-a { color: #fb7185; }
    .mu .mu-b { color: #22d3ee; }
    .mu .mu-vs { color: rgba(245, 236, 214, 0.35); font-weight: 600; }
    .mu .mu-record { margin-left: auto; font-size: 1.35rem; font-weight: 800; }

    .mu .mu-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 10px;
        margin-bottom: 20px;
    }
    .mu .mu-stat {
        background: linear-gradient(180deg, rgba(245, 236, 214, 0.045), rgba(245, 236, 214, 0.015));
        border: 1px solid rgba(245, 236, 214, 0.1);
        border-radius: 12px;
        padding: 10px 12px;
    }
    .mu .mu-stat-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        color: rgba(245, 236, 214, 0.45);
        margin-bottom: 4px;
    }
    .mu .mu-stat-value { font-size: 1.05rem; font-weight: 700; }
    .mu .mu-stat-sub { font-size: 11px; color: rgba(245, 236, 214, 0.4); margin-top: 2px; }

    .mu .mu-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 14px;
        margin-bottom: 12px;
    }
    .mu .mu-lens { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .mu .mu-lens-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        color: rgba(245, 236, 214, 0.45);
        margin-right: 2px;
    }
    .mu .mu-chip {
        font-size: 12px;
        font-weight: 600;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid rgba(245, 236, 214, 0.18);
        background: transparent;
        color: rgba(245, 236, 214, 0.65);
        cursor: pointer;
        transition: all 0.15s;
    }
    .mu .mu-chip:hover { border-color: rgba(245, 236, 214, 0.4); color: #f5ecd6; }
    .mu .mu-chip.active {
        background: rgba(245, 236, 214, 0.12);
        border-color: rgba(245, 236, 214, 0.5);
        color: #f5ecd6;
    }

    .mu .mu-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: center;
        font-size: 11px;
        color: rgba(245, 236, 214, 0.6);
    }
    .mu .mu-key { display: inline-flex; align-items: center; gap: 6px; }
    .mu .mu-swatch { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .mu .mu-zone-key {
        width: 16px;
        height: 11px;
        display: inline-block;
        background: rgba(255, 209, 102, 0.07);
        border-top: 1px solid rgba(255, 209, 102, 0.4);
        border-bottom: 1px solid rgba(255, 209, 102, 0.4);
        border-left: 1.5px solid rgba(255, 209, 102, 0.55);
        margin-right: 2px;
    }

    .mu .mu-chart-wrap {
        position: relative;
        overflow-x: auto;
        margin: 0 -4px;
        padding: 0 4px;
    }
    .mu .mu-chart-wrap svg { display: block; }
    .mu .mu-chart-wrap circle[data-tip] { cursor: pointer; }

    .mu .mu-tip {
        position: fixed;
        z-index: 60;
        pointer-events: none;
        background: rgba(6, 8, 27, 0.97);
        border: 1px solid rgba(245, 236, 214, 0.18);
        border-radius: 10px;
        padding: 9px 11px;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-line;
        max-width: 260px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
    }

    .mu .mu-pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 14px;
    }
    .mu .mu-page-btn {
        font-size: 12px;
        font-weight: 600;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid rgba(245, 236, 214, 0.2);
        color: rgba(245, 236, 214, 0.75);
        background: transparent;
        cursor: pointer;
    }
    .mu .mu-page-btn:hover:not(:disabled) { border-color: rgba(245, 236, 214, 0.45); color: #f5ecd6; }
    .mu .mu-page-btn:disabled { opacity: 0.3; cursor: default; }
    .mu .mu-page-info { font-size: 11px; color: rgba(245, 236, 214, 0.45); }

    .mu .mu-note {
        font-size: 11px;
        color: rgba(245, 236, 214, 0.4);
        margin-top: 10px;
    }
    .mu .mu-empty, .mu .mu-loading {
        text-align: center;
        padding: 48px 16px;
        color: rgba(245, 236, 214, 0.45);
    }
</style>

<div class="mu">
    <div class="mu-head">
        <div class="mu-title">
            <span class="mu-a">{{ $playerA->name }}</span>
            <span class="mu-vs">vs</span>
            <span class="mu-b">{{ $playerB->name }}</span>
        </div>
        <div class="mu-record" x-show="data">
            <span class="mu-a" x-text="data?.record.a_wins"></span><span class="mu-vs"> – </span><span class="mu-b" x-text="data?.record.b_wins"></span>
        </div>
    </div>

    <div class="mu-loading" x-show="loading">Loading matchup…</div>
    <div class="mu-empty" x-show="error" x-text="error"></div>

    <template x-if="data && data.lanes.length === 0 && !loading">
        <div class="mu-empty">
            No point-by-point data for this matchup yet.
            <template x-if="data.record.games_total > 0">
                <div style="margin-top:6px;font-size:12px;">
                    <span x-text="data.record.games_total"></span> game(s) played, but none were scored rally-by-rally.
                </div>
            </template>
        </div>
    </template>

    <template x-if="data && data.lanes.length > 0">
        <div>
            <div class="mu-stats">
                <div class="mu-stat">
                    <div class="mu-stat-label">Points won</div>
                    <div class="mu-stat-value">
                        <span class="mu-a" x-text="data.summary.points_won_a"></span><span class="mu-vs"> – </span><span class="mu-b" x-text="data.summary.points_won_b"></span>
                    </div>
                    <div class="mu-stat-sub" x-text="pointShare()"></div>
                </div>
                <div class="mu-stat">
                    <div class="mu-stat-label">Avg length</div>
                    <div class="mu-stat-value" x-text="formatDuration(data.summary.avg_duration_seconds)"></div>
                    <div class="mu-stat-sub">per charted game</div>
                </div>
                <div class="mu-stat">
                    <div class="mu-stat-label">Longest run</div>
                    <div class="mu-stat-value" x-text="data.summary.longest_run ? data.summary.longest_run.length + ' pts' : '—'"></div>
                    <div class="mu-stat-sub" x-text="data.summary.longest_run ? nameOf(data.summary.longest_run.player) : ''"></div>
                </div>
                <div class="mu-stat">
                    <div class="mu-stat-label">Biggest comeback</div>
                    <div class="mu-stat-value" x-text="data.summary.biggest_comeback ? data.summary.biggest_comeback.deficit + ' down' : '—'"></div>
                    <div class="mu-stat-sub" x-text="data.summary.biggest_comeback ? nameOf(data.summary.biggest_comeback.player) + ' still won' : 'nobody trailed and won'"></div>
                </div>
                <div class="mu-stat">
                    <div class="mu-stat-label">Deuce games</div>
                    <div class="mu-stat-value" x-text="data.summary.deuce_games"></div>
                    <div class="mu-stat-sub" x-show="data.summary.deuce_games > 0"
                         x-text="data.summary.deuce_wins_a + '–' + (data.summary.deuce_games - data.summary.deuce_wins_a) + ' to ' + data.player_a.name"></div>
                </div>
            </div>

            <div class="mu-controls">
                <div class="mu-lens">
                    <span class="mu-lens-label">Lens</span>
                    <template x-for="option in lensOptions" :key="option.key">
                        <button type="button" class="mu-chip" :class="{ active: lens === option.key }"
                                @click="lens = option.key" x-text="option.label"></button>
                    </template>
                </div>
                <div class="mu-legend" x-html="legendHtml()"></div>
            </div>

            <div class="mu-chart-wrap" x-ref="chart"
                 @mousemove="onMove($event)" @mouseleave="tip.show = false">
                <div x-html="svg"></div>
            </div>

            <div class="mu-pager">
                <button type="button" class="mu-page-btn" :disabled="!hasOlder()" @click="page(1)">← Older games</button>
                <span class="mu-page-info" x-text="rangeLabel()"></span>
                <button type="button" class="mu-page-btn" :disabled="offset === 0" @click="page(-1)">Newer games →</button>
            </div>

            <div class="mu-note" x-show="data.record.games_total > data.games_with_points">
                Point-by-point data exists for
                <span x-text="data.games_with_points"></span> of
                <span x-text="data.record.games_total"></span> games — older matches were logged as a final score only.
            </div>
        </div>
    </template>

    <div class="mu-tip" x-show="tip.show" :style="`left:${tip.x}px; top:${tip.y}px;`" x-text="tip.text"></div>
</div>

<script>
    const MU_COLOR = { a: '#fb7185', b: '#22d3ee' };
    const MU_SURFACE = '#0a0f24';
    const MU_INK = 'rgba(245,236,214,0.45)';
    const MU_GRID = 'rgba(245,236,214,0.09)';
    /** Margin at which a lane's dots hit the top or bottom of their band. Fixed
     *  across every lane so an 11-9 grind never looks like an 11-1 rout. Set to 4
     *  because that is where the interesting resolution is: telling a 1-point gap
     *  from a 3-point gap matters, while everything past 4 is simply "pulling away". */
    const MU_MARGIN_SCALE = 4;
    const MU_PAD_L = 98;
    const MU_PAD_R = 132;
    const MU_PAD_T = 38;
    const MU_AXIS_H = 36;
    const MU_LANE_H = 84;
    const MU_HALF = 32;
    /** Deuce/prolongation zone. Amber is an annotation colour here, never a series. */
    const MU_EXTRA = '255, 209, 102';

    function matchupChart(playerAId, playerBId) {
        return {
            playerAId,
            playerBId,
            data: null,
            loading: true,
            error: null,
            lens: 'none',
            offset: 0,
            limit: 30,
            width: 900,
            tip: { show: false, x: 0, y: 0, text: '' },
            // No "pace" lens: with time on the X axis the gap between dots already
            // shows how long each rally took, so sizing dots by it would say it twice.
            lensOptions: [
                { key: 'none', label: 'None' },
                { key: 'serve', label: 'Serve' },
                { key: 'earned', label: 'Earned vs error' },
            ],

            async load() {
                this.loading = true;
                this.error = null;
                try {
                    const url = `/games/ping-pong/api/matchup/${this.playerAId}/${this.playerBId}`
                        + `?limit=${this.limit}&offset=${this.offset}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error('Could not load this matchup.');
                    }
                    this.data = await response.json();
                } catch (e) {
                    this.error = e.message;
                }
                this.loading = false;
                this.$nextTick(() => {
                    this.measure();
                    window.addEventListener('resize', () => this.measure(), { once: true });
                });
            },

            measure() {
                const el = this.$refs.chart;
                if (el && el.clientWidth) {
                    this.width = Math.max(780, el.clientWidth);
                }
            },

            page(direction) {
                const next = this.offset + direction * this.limit;
                if (next < 0 || next >= this.data.window.total) return;
                this.offset = next;
                this.load();
            },

            hasOlder() {
                return this.data && this.offset + this.limit < this.data.window.total;
            },

            rangeLabel() {
                if (!this.data) return '';
                const total = this.data.window.total;
                const newest = Math.max(0, total - this.offset);
                const oldest = Math.max(1, newest - this.data.lanes.length + 1);
                return `games ${oldest}–${newest} of ${total} (oldest at top)`;
            },

            nameOf(letter) {
                return letter === 'a' ? this.data.player_a.name : this.data.player_b.name;
            },

            pointShare() {
                const a = this.data.summary.points_won_a;
                const b = this.data.summary.points_won_b;
                if (a + b === 0) return '';
                return Math.round((a / (a + b)) * 100) + '% to ' + this.data.player_a.name;
            },

            legendHtml() {
                const dot = (color) => `<span class="mu-swatch" style="background:${color}"></span>`;
                const parts = [
                    `<span class="mu-key">${dot(MU_COLOR.a)}${this.escape(this.data.player_a.name)} scored</span>`,
                    `<span class="mu-key">${dot(MU_COLOR.b)}${this.escape(this.data.player_b.name)} scored</span>`,
                    `<span class="mu-key">◎ final point</span>`,
                    `<span class="mu-key">↑ above the line = ${this.escape(this.data.player_a.name)} ahead</span>`,
                    `<span class="mu-key"><span class="mu-zone-key"></span>deuce — play past 10–10</span>`,
                ];
                parts.push('<span class="mu-key">wider gap = longer rally</span>');
                if (this.lens === 'serve') {
                    parts.push('<span class="mu-key">solid ring = serve held · dashed = broken</span>');
                } else if (this.lens === 'earned') {
                    parts.push('<span class="mu-key">filled = winner · hollow = opponent error</span>');
                }
                return parts.join('');
            },

            escape(text) {
                return String(text).replace(/[&<>"']/g, (c) => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
                }[c]));
            },

            /** Vertical offset within a lane, clamped so blowouts stay in their band. */
            marginOffset(margin) {
                const clamped = Math.max(-MU_MARGIN_SCALE, Math.min(MU_MARGIN_SCALE, margin));
                return (clamped / MU_MARGIN_SCALE) * MU_HALF;
            },

            dotRadius(dot) {
                return dot.is_final ? 8.5 : 6;
            },

            tipText(lane, dot) {
                const lines = [
                    `Point ${dot.n} · ${dot.score_a}–${dot.score_b} · ${this.formatDuration(dot.t_seconds)} in`,
                    `${this.nameOf(dot.scorer)} scored`
                        + (dot.cause === 'opponent_error' ? ' (opponent error)' : dot.cause === 'winner' ? ' (winner)' : ''),
                ];
                if (dot.shot_type) lines.push(`Shot: ${dot.shot_type}`);
                if (dot.error_type) lines.push(`Error: ${dot.error_type}`);
                lines.push(`Serve: ${this.nameOf(dot.server)} (${dot.held_serve ? 'held' : 'broken'})`);
                if (dot.pace_seconds !== null) lines.push(`${dot.pace_seconds}s rally (gap to previous point)`);
                const flags = [];
                if (dot.net_edge) flags.push('net edge');
                if (dot.table_edge) flags.push('table edge');
                if (dot.body_hit) flags.push('body hit');
                if (flags.length) lines.push(flags.join(' · '));
                if (dot.clip_id) lines.push('Clip available — click to watch');
                if (dot.is_final) lines.push('Match point');
                return lines.join('\n');
            },

            onMove(event) {
                const target = event.target.closest('[data-tip]');
                if (!target) {
                    this.tip.show = false;
                    return;
                }
                this.tip.text = target.getAttribute('data-tip');
                this.tip.x = Math.min(event.clientX + 14, window.innerWidth - 280);
                this.tip.y = Math.max(12, event.clientY - 12);
                this.tip.show = true;
            },

            get svg() {
                const lanes = this.data?.lanes ?? [];
                if (lanes.length === 0) return '';

                // X is elapsed time, shared across lanes: a lane's physical width is
                // the game's real duration, and the gap between two dots is the time
                // that rally took.
                const maxSeconds = Math.max(60, ...lanes.map((lane) => lane.duration_seconds));
                const plotWidth = this.width - MU_PAD_L - MU_PAD_R;
                const height = MU_PAD_T + lanes.length * MU_LANE_H + MU_AXIS_H;
                const x = (seconds) => MU_PAD_L + (seconds / maxSeconds) * plotWidth;

                const parts = [
                    `<svg width="${this.width}" height="${height}" role="img" `
                    + `aria-label="Point-by-point flow of every charted game in this matchup">`,
                ];

                // Tall charts scroll past the bottom axis, so label the scale at both ends.
                parts.push(this.axisMarkup(maxSeconds, plotWidth, 14, x, false));

                lanes.forEach((lane, index) => {
                    parts.push(this.laneMarkup(lane, index, x));
                });

                parts.push(this.axisMarkup(maxSeconds, plotWidth, height - MU_AXIS_H + 12, x, true));
                parts.push('</svg>');
                return parts.join('');
            },

            laneMarkup(lane, index, x) {
                const top = MU_PAD_T + index * MU_LANE_H;
                const mid = top + MU_LANE_H / 2;
                const endX = x(lane.duration_seconds);
                const out = [];

                // Deuce territory: from the first point where both players were on 10+.
                const deuceIndex = lane.dots.findIndex((dot) => dot.score_a >= 10 && dot.score_b >= 10);
                if (deuceIndex >= 0) {
                    const deuceX = x(lane.dots[deuceIndex].t_seconds);
                    const zoneTop = top + 6;
                    const zoneHeight = MU_LANE_H - 12;
                    const width = Math.max(0, endX - deuceX);

                    // A bracketed, tinted zone: the band shows how much of the game ran
                    // past 10-10, and the top/bottom rules make it read as a deliberate
                    // annotation rather than the stray grey rectangle this used to be.
                    out.push(`<rect x="${deuceX}" y="${zoneTop}" width="${width}" height="${zoneHeight}" `
                        + `fill="rgba(${MU_EXTRA},0.07)"></rect>`);
                    out.push(`<line x1="${deuceX}" y1="${zoneTop}" x2="${endX}" y2="${zoneTop}" `
                        + `stroke="rgba(${MU_EXTRA},0.4)" stroke-width="1"></line>`);
                    out.push(`<line x1="${deuceX}" y1="${zoneTop + zoneHeight}" x2="${endX}" `
                        + `y2="${zoneTop + zoneHeight}" stroke="rgba(${MU_EXTRA},0.4)" stroke-width="1"></line>`);
                    out.push(`<line x1="${deuceX}" y1="${zoneTop}" x2="${deuceX}" `
                        + `y2="${zoneTop + zoneHeight}" stroke="rgba(${MU_EXTRA},0.55)" stroke-width="1.5"></line>`);
                    // Both labels sit at the band's left edge and carry a surface-coloured
                    // halo, so a final-point dot landing on the band can't obscure them.
                    const halo = `paint-order="stroke" stroke="${MU_SURFACE}" stroke-width="3" `
                        + `stroke-linejoin="round"`;

                    out.push(`<text x="${deuceX + 6}" y="${zoneTop + 13}" font-size="9" font-weight="700" `
                        + `fill="rgba(${MU_EXTRA},0.9)" letter-spacing="0.12em" ${halo}>DEUCE</text>`);

                    // Counts the 10-10 point itself, so it matches the dots inside the band.
                    const extraPoints = lane.dots.length - deuceIndex;
                    out.push(`<text x="${deuceX + 6}" y="${zoneTop + zoneHeight - 5}" `
                        + `font-size="9" fill="rgba(${MU_EXTRA},0.7)" ${halo}>${extraPoints} pts · `
                        + `${this.formatDuration(lane.duration_seconds - lane.dots[deuceIndex].t_seconds)}</text>`);
                }

                out.push(`<line x1="${MU_PAD_L}" y1="${mid}" x2="${endX}" y2="${mid}" `
                    + `stroke="${MU_GRID}" stroke-width="2"></line>`);

                // Trajectory through the dots. Without it the lane reads as scattered
                // marks; with it the shape of the game is legible at a glance.
                const path = lane.dots
                    .map((dot) => `${x(dot.t_seconds).toFixed(1)},${(mid - this.marginOffset(dot.margin)).toFixed(1)}`)
                    .join(' ');
                out.push(`<polyline points="${path}" fill="none" `
                    + `stroke="rgba(245,236,214,0.24)" stroke-width="2" stroke-linejoin="round"></polyline>`);

                const date = lane.played_at ? new Date(lane.played_at) : null;
                const label = date
                    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : '—';
                out.push(`<text x="${MU_PAD_L - 14}" y="${mid + 5}" text-anchor="end" `
                    + `font-size="13" fill="${MU_INK}">${this.escape(label)}</text>`);

                lane.dots.forEach((dot) => {
                    out.push(this.dotMarkup(lane, dot, x(dot.t_seconds), mid - this.marginOffset(dot.margin)));
                });

                out.push(this.laneResultMarkup(lane, mid));
                return out.join('');
            },

            dotMarkup(lane, dot, cx, cy) {
                const color = MU_COLOR[dot.scorer];
                const radius = this.dotRadius(dot);
                const tip = this.escape(this.tipText(lane, dot));
                const out = [];

                if (dot.clip_id) {
                    out.push(`<circle cx="${cx}" cy="${cy}" r="${radius + 7}" fill="none" `
                        + `stroke="${color}" stroke-opacity="0.4" stroke-width="1.5"></circle>`);
                }

                if (dot.is_final) {
                    out.push(`<circle cx="${cx}" cy="${cy}" r="${radius + 2.5}" fill="none" `
                        + `stroke="${MU_COLOR[lane.winner]}" stroke-width="2"></circle>`);
                }

                // Serve rides on its own outer ring rather than the dot's stroke: a
                // dash pattern needs circumference to read as dashes and not spikes.
                if (this.lens === 'serve') {
                    const ringRadius = radius + (dot.is_final ? 6 : 5);
                    const dash = dot.held_serve ? '' : ' stroke-dasharray="4 4"';
                    out.push(`<circle cx="${cx}" cy="${cy}" r="${ringRadius}" fill="none" `
                        + `stroke="${MU_COLOR[dot.server]}" stroke-opacity="0.9" `
                        + `stroke-width="2"${dash}></circle>`);
                }

                let fill = color;
                let stroke = MU_SURFACE;
                // A surface-coloured ring keeps dots readable where fast rallies
                // cluster them together on the time axis.
                let strokeWidth = 2;

                if (this.lens === 'earned' && dot.cause === 'opponent_error') {
                    fill = MU_SURFACE;
                    stroke = color;
                    strokeWidth = 2.5;
                }

                const circle = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" `
                    + `stroke="${stroke}" stroke-width="${strokeWidth}" data-tip="${tip}"></circle>`;

                out.push(dot.clip_id
                    ? `<a href="/games/ping-pong/matches/${lane.match_id}">${circle}</a>`
                    : circle);

                return out.join('');
            },

            laneResultMarkup(lane, mid) {
                const right = this.width - MU_PAD_R;
                const winnerColor = MU_COLOR[lane.winner];
                const elo = lane.elo_delta_a === null
                    ? ''
                    : ` · ${lane.elo_delta_a >= 0 ? '+' : ''}${lane.elo_delta_a}`;

                return `<a href="/games/ping-pong/matches/${lane.match_id}">`
                    + `<text x="${right + 18}" y="${mid - 1}" font-size="16" font-weight="700" `
                    + `fill="${winnerColor}">${lane.score_a}–${lane.score_b}</text>`
                    + `<text x="${right + 18}" y="${mid + 15}" font-size="11" fill="${MU_INK}">`
                    + `${this.formatDuration(lane.duration_seconds)}${elo}</text>`
                    + `</a>`;
            },

            axisMarkup(maxSeconds, plotWidth, y, x, withRule) {
                const out = withRule
                    ? [`<line x1="${MU_PAD_L}" y1="${y - 8}" x2="${MU_PAD_L + plotWidth}" y2="${y - 8}" `
                        + `stroke="${MU_GRID}" stroke-width="1"></line>`]
                    : [];

                // Whole minutes while games are short, then coarser so labels never collide.
                const step = maxSeconds > 1500 ? 300 : maxSeconds > 600 ? 120 : 60;
                for (let t = step; t <= maxSeconds; t += step) {
                    out.push(`<text x="${x(t)}" y="${y + 7}" text-anchor="middle" font-size="12" `
                        + `fill="${MU_INK}">${t / 60}m</text>`);
                    out.push(`<line x1="${x(t)}" y1="${y - 5}" x2="${x(t)}" y2="${y - 1}" `
                        + `stroke="${MU_GRID}" stroke-width="1"></line>`);
                }
                out.push(`<text x="${MU_PAD_L}" y="${y + 7}" text-anchor="start" font-size="12" `
                    + `fill="${MU_INK}">elapsed →</text>`);
                return out.join('');
            },

            formatDuration(seconds) {
                if (seconds === null || seconds === undefined) return '—';
                const minutes = Math.floor(seconds / 60);
                return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
            },
        };
    }
</script>
</div>
@endsection
