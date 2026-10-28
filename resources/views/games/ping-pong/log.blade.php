@extends('layouts.app')

@section('title', 'Log a Ping Pong Result - Games Hub')
@section('main-class', 'px-4 py-4')

@section('content')

@include('games.ping-pong.partials.chrome')

<style>
    .pplog ::selection { background: rgba(255, 209, 102, 0.35); color: #fffaf0; }
    .pplog input { caret-color: #ffd166; }
    .pplog input[type=time]::-webkit-calendar-picker-indicator { filter: invert(0.85) sepia(0.2); opacity: 0.6; }
    .pplog :focus-visible { outline: 2px solid #ffd166; outline-offset: 2px; }
    .pplog input:focus-visible { outline: none; }
    .pplog .pplog-num { font-variant-numeric: tabular-nums; }
    .pplog .pplog-chips { scrollbar-width: none; }
    .pplog .pplog-chips::-webkit-scrollbar { display: none; }
</style>

<div class="pplog" x-data="pingPongLog(@js($players), @js($offices), @js($undoMinutes))">
    <div class="pph-stage relative flex flex-col gap-6 rounded-3xl p-5 md:p-7 text-[#f5ecd6]/80">

        @include('games.ping-pong.partials.tournament-masthead', ['back' => '/games/ping-pong', 'label' => 'Final scores'])

        <div class="w-full max-w-[34rem] mx-auto flex flex-col gap-7">

            <div class="flex flex-col gap-1.5">
                <h1 class="m-0 pph-display uppercase text-[34px] leading-none tracking-[0.02em] text-[#f5ecd6]">Log a result</h1>
                <p class="m-0 text-[15px] leading-snug text-[#f5ecd6]/60">No scoring screen? Enter your final scores after you play. They count for ELO like any other game.</p>
            </div>

            {{-- ----- Who played ----- --}}
            <section class="flex flex-col gap-3" aria-labelledby="pplog-players">
                <div class="flex items-center justify-between gap-3">
                    <h2 id="pplog-players" class="m-0 text-sm font-semibold text-[#f5ecd6]">Who played</h2>
                    <div class="pplog-chips flex gap-1 overflow-x-auto -mr-1 pr-1">
                        <button type="button" @click="setOffice(null)" :aria-pressed="officeId === null"
                                class="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition"
                                :class="officeId === null ? 'bg-[#f5ecd6]/15 text-[#f5ecd6]' : 'text-[#f5ecd6]/50 hover:text-[#f5ecd6]'">All</button>
                        <template x-for="office in offices" :key="office.id">
                            <button type="button" @click="setOffice(office.id)" :aria-pressed="officeId === office.id"
                                    class="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition"
                                    :class="officeId === office.id ? 'bg-[#f5ecd6]/15 text-[#f5ecd6]' : 'text-[#f5ecd6]/50 hover:text-[#f5ecd6]'"
                                    x-text="office.name"></button>
                        </template>
                    </div>
                </div>

                {{-- Head to head: tap a side, then a player --}}
                <div class="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                    <template x-for="side in ['left', 'right']" :key="side">
                        <button type="button" @click="activeSide = side"
                                :style="side === 'right' ? 'order: 3' : ''"
                                :aria-label="(side === 'left' ? 'First player' : 'Second player') + (sides[side] ? ': ' + name(sides[side]) : ', not picked')"
                                class="group relative flex items-center gap-2.5 min-w-0 rounded-xl border px-3 py-3 text-left cursor-pointer transition"
                                :class="slotClass(side)">
                            <span class="grid place-items-center shrink-0 w-9 h-9 rounded-full overflow-hidden text-sm font-bold"
                                  :class="side === 'left' ? 'bg-[#ff5a4a]/20 text-[#ff8a7d]' : 'bg-[#3ec8ff]/20 text-[#7fdcff]'">
                                <template x-if="sides[side] && player(sides[side]).avatar_url">
                                    <img :src="player(sides[side]).avatar_url" alt="" class="w-full h-full object-cover">
                                </template>
                                <span x-show="!(sides[side] && player(sides[side]).avatar_url)" x-text="sides[side] ? initial(sides[side]) : ''"></span>
                            </span>
                            <span class="flex flex-col min-w-0">
                                <span class="truncate text-[15px] font-semibold"
                                      :class="sides[side] ? 'text-[#f5ecd6]' : 'text-[#f5ecd6]/40'"
                                      x-text="sides[side] ? name(sides[side]) : 'Pick a player'"></span>
                                <span class="pph-mono pplog-num text-[11px] text-[#f5ecd6]/45" x-show="sides[side]" x-text="sides[side] ? player(sides[side]).elo + ' ELO' : ''"></span>
                            </span>
                        </button>
                    </template>
                    <button type="button" @click="swap()" :disabled="!sides.left && !sides.right" title="Swap sides" aria-label="Swap sides"
                            style="order: 2"
                            class="self-center grid place-items-center w-9 h-9 rounded-full border border-[#f5ecd6]/15 bg-transparent text-[#f5ecd6]/55 cursor-pointer transition hover:enabled:text-[#f5ecd6] hover:enabled:border-[#f5ecd6]/35 disabled:opacity-30 disabled:cursor-default">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 16H3l4 4M3 16l4-4"/><path d="M21 16H8"/><path d="M17 8h4l-4-4M21 8l-4 4"/><path d="M3 8h13"/></svg>
                    </button>
                </div>

                <div class="flex flex-col gap-2">
                    <input type="search" x-show="officePlayers().length > 12" x-model="search" placeholder="Search players" aria-label="Search players"
                           class="w-full rounded-lg px-3 py-2 text-sm text-[#f5ecd6] bg-[#f5ecd6]/[0.04] border border-[#f5ecd6]/12 placeholder-[#f5ecd6]/35 focus:outline-none focus:border-[#ffd166]/60">
                    <div class="flex flex-wrap gap-1.5">
                        <template x-for="p in visiblePlayers()" :key="p.id">
                            <button type="button" @click="pick(p.id)" :aria-pressed="sides.left === p.id || sides.right === p.id"
                                    class="px-3 py-2 rounded-lg border text-[13px] font-semibold cursor-pointer transition"
                                    :class="chipClass(p.id)" x-text="p.name"></button>
                        </template>
                        <p x-show="visiblePlayers().length === 0" class="m-0 py-2 text-sm text-[#f5ecd6]/45">Nobody matches.</p>
                    </div>
                </div>
            </section>

            {{-- ----- Games ----- --}}
            <section class="flex flex-col gap-3" aria-labelledby="pplog-games">
                <div class="flex items-baseline justify-between gap-3">
                    <h2 id="pplog-games" class="m-0 text-sm font-semibold text-[#f5ecd6]">Games <span class="font-normal text-[#f5ecd6]/45">in the order you played them</span></h2>
                    <span class="pph-mono pplog-num text-[13px] font-bold text-[#f5ecd6]" x-show="series()" x-text="series()"></span>
                </div>

                <ol class="m-0 p-0 list-none flex flex-col rounded-xl border border-[#f5ecd6]/12 bg-[#f5ecd6]/[0.025]">
                    {{-- Column heads: whose score goes where --}}
                    <li aria-hidden="true" class="grid grid-cols-[18px_1fr_10px_1fr_32px] items-center gap-2 px-3 pt-3 pb-1">
                        <span></span>
                        <span class="truncate text-center text-[13px] font-semibold text-[#ff8a7d]" x-text="sideName('left')"></span>
                        <span></span>
                        <span class="truncate text-center text-[13px] font-semibold text-[#7fdcff]" x-text="sideName('right')"></span>
                        <span></span>
                    </li>
                    <template x-for="(game, index) in games" :key="game.key">
                        <li class="flex flex-col gap-1.5 px-3 py-1.5">
                            <div class="grid grid-cols-[18px_1fr_10px_1fr_32px] items-center gap-2">
                                <span class="pph-mono pplog-num text-[12px] text-[#f5ecd6]/35" x-text="index + 1"></span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="–"
                                       :value="game.left" @input="setScore(game, 'left', $event)"
                                       :aria-label="'Game ' + (index + 1) + ', ' + sideName('left') + ' score'"
                                       class="pph-mono pplog-num w-full min-w-0 h-16 rounded-xl text-center text-[30px] font-bold transition border placeholder-[#f5ecd6]/15 focus:outline-none"
                                       :class="scoreClass(game, 'left')">
                                <span class="text-center text-[#f5ecd6]/30" aria-hidden="true">–</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="–"
                                       :value="game.right" @input="setScore(game, 'right', $event)"
                                       :aria-label="'Game ' + (index + 1) + ', ' + sideName('right') + ' score'"
                                       class="pph-mono pplog-num w-full min-w-0 h-16 rounded-xl text-center text-[30px] font-bold transition border placeholder-[#f5ecd6]/15 focus:outline-none"
                                       :class="scoreClass(game, 'right')">
                                <button type="button" @click="removeGame(index)" x-show="games.length > 1" :aria-label="'Remove game ' + (index + 1)"
                                        class="grid place-items-center w-8 h-8 rounded-md bg-transparent border-0 text-[#f5ecd6]/35 cursor-pointer transition hover:text-[#ff8a7d] hover:bg-[#ff5a4a]/10">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                </button>
                            </div>
                            <p x-show="isComplete(game) && !isFinal(game)" class="m-0 pl-[26px] text-[12px] text-[#ffd166]">
                                A game ends at 11, or past 10–10 with a two-point lead.
                            </p>
                        </li>
                    </template>
                    <li class="mt-1.5 border-t border-[#f5ecd6]/[0.08]">
                        <button type="button" @click="addGame()"
                                class="w-full flex items-center justify-center gap-2 px-3 py-3.5 bg-transparent border-0 rounded-b-xl text-[13px] font-semibold text-[#f5ecd6]/60 cursor-pointer transition hover:text-[#f5ecd6] hover:bg-[#f5ecd6]/[0.03]">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                            Add a game
                        </button>
                    </li>
                </ol>
            </section>

            {{-- ----- When ----- --}}
            <section class="flex flex-col gap-3" aria-labelledby="pplog-when">
                <h2 id="pplog-when" class="m-0 text-sm font-semibold text-[#f5ecd6]">When</h2>
                <div class="flex flex-wrap items-center gap-3">
                    <div class="inline-flex rounded-lg border border-[#f5ecd6]/12 bg-[#f5ecd6]/[0.03] p-[3px]" role="group">
                        <button type="button" @click="earlier = false" :aria-pressed="!earlier"
                                class="px-3.5 py-1.5 rounded-md text-[13px] font-semibold cursor-pointer transition"
                                :class="!earlier ? 'bg-[#f5ecd6] text-[#06081b]' : 'text-[#f5ecd6]/55 hover:text-[#f5ecd6]'">Just now</button>
                        <button type="button" @click="earlier = true" :aria-pressed="earlier"
                                class="px-3.5 py-1.5 rounded-md text-[13px] font-semibold cursor-pointer transition"
                                :class="earlier ? 'bg-[#f5ecd6] text-[#06081b]' : 'text-[#f5ecd6]/55 hover:text-[#f5ecd6]'">Earlier today</button>
                    </div>
                    <label x-show="earlier" class="inline-flex items-center gap-2 text-[13px] text-[#f5ecd6]/55">
                        Last game ended at
                        <input type="time" x-model="time"
                               class="pph-mono pplog-num rounded-lg px-2.5 py-1.5 text-sm text-[#f5ecd6] bg-[#f5ecd6]/[0.04] border border-[#f5ecd6]/12 focus:outline-none focus:border-[#ffd166]/60 [color-scheme:dark]">
                    </label>
                </div>
            </section>

            {{-- ----- Submit ----- --}}
            <div class="flex flex-col gap-3">
                <div x-show="errors.length" role="alert" class="flex gap-2.5 rounded-lg px-3.5 py-3 text-sm text-[#ffb3aa] bg-[#ff5a4a]/10 border border-[#ff5a4a]/30">
                    <svg class="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                    <div class="flex flex-col gap-1"><template x-for="error in errors" :key="error"><span x-text="error"></span></template></div>
                </div>

                <button type="button" @click="submit()" :disabled="blocker() !== null || submitting"
                        class="w-full appearance-none rounded-xl px-5 py-4 pph-display uppercase text-[21px] tracking-[0.05em] cursor-pointer transition border
                               enabled:bg-[#f5ecd6] enabled:text-[#06081b] enabled:border-[#f5ecd6] enabled:shadow-[0_8px_24px_rgba(245,236,214,0.16)] hover:enabled:bg-[#fffaf0] hover:enabled:-translate-y-px
                               disabled:bg-transparent disabled:text-[#f5ecd6]/50 disabled:border-[#f5ecd6]/15 disabled:cursor-not-allowed"
                        x-text="submitting ? 'Logging…' : (blocker() ?? (games.length > 1 ? 'Log ' + games.length + ' games' : 'Log the game'))"></button>
                <p class="m-0 text-center text-[13px] text-[#f5ecd6]/45">Made a mistake? You can undo a result for <span x-text="undoMinutes"></span> minutes.</p>
            </div>

            {{-- ----- Just logged ----- --}}
            <section x-show="recent.length" class="flex flex-col gap-3" aria-labelledby="pplog-recent">
                <h2 id="pplog-recent" class="m-0 text-sm font-semibold text-[#f5ecd6]">Just logged</h2>
                <ul class="m-0 p-0 list-none flex flex-col rounded-xl border border-[#9be7c4]/25 bg-[#9be7c4]/[0.04] divide-y divide-[#9be7c4]/[0.12]">
                    <template x-for="entry in recent" :key="entry.id">
                        <li class="flex items-center gap-3 px-3.5 py-3">
                            <a :href="'/games/ping-pong/matches/' + entry.id" class="flex-1 min-w-0 flex flex-col gap-0.5 no-underline rounded-md">
                                <span class="flex items-baseline gap-2 min-w-0 text-[14px] font-semibold">
                                    <span class="truncate" :class="entry.left_won ? 'text-[#f5ecd6]' : 'text-[#f5ecd6]/55'" x-text="entry.left_name"></span>
                                    <span class="pph-mono pplog-num shrink-0 text-[#f5ecd6]" x-text="entry.score"></span>
                                    <span class="truncate" :class="entry.left_won ? 'text-[#f5ecd6]/55' : 'text-[#f5ecd6]'" x-text="entry.right_name"></span>
                                </span>
                                <span class="pph-mono pplog-num text-[12px]">
                                    <span :class="entry.left_delta >= 0 ? 'text-[#9be7c4]' : 'text-[#ff8a7d]'" x-text="signed(entry.left_delta)"></span>
                                    <span class="text-[#f5ecd6]/30 mx-1">/</span>
                                    <span :class="entry.right_delta >= 0 ? 'text-[#9be7c4]' : 'text-[#ff8a7d]'" x-text="signed(entry.right_delta)"></span>
                                    <span class="text-[#f5ecd6]/40"> ELO</span>
                                </span>
                            </a>
                            <button type="button" x-show="undoSecondsLeft(entry) > 0" @click="undo(entry)" :disabled="undoing === entry.id"
                                    class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#f5ecd6]/15 bg-transparent text-[13px] font-semibold text-[#f5ecd6]/75 cursor-pointer transition hover:enabled:text-[#ffb3aa] hover:enabled:border-[#ff5a4a]/40 disabled:opacity-40">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
                                Undo <span class="pph-mono pplog-num text-[12px] text-[#f5ecd6]/45" x-text="countdown(entry)"></span>
                            </button>
                        </li>
                    </template>
                </ul>
            </section>
        </div>
    </div>
</div>

<script>
    function pingPongLog(players, offices, undoMinutes) {
        const STORE = 'pingpong.log';

        // Sorted for people, not bytes: Émilie sits with the Es.
        const byName = new Intl.Collator('fr', { sensitivity: 'base' });
        players.sort((a, b) => byName.compare(a.name, b.name));

        return {
            players,
            offices,
            undoMinutes,
            officeId: null,
            search: '',
            sides: { left: null, right: null },
            activeSide: 'left',
            games: [],
            earlier: false,
            time: '',
            errors: [],
            submitting: false,
            undoing: null,
            recent: [],
            now: Date.now(),
            nextKey: 0,

            init() {
                const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
                this.officeId = saved.officeId ?? null;
                const known = (id) => (this.players.some((p) => p.id === id) ? id : null);
                this.sides = { left: known(saved.left ?? null), right: known(saved.right ?? null) };
                this.activeSide = this.sides.left && !this.sides.right ? 'right' : 'left';
                this.recent = (saved.recent || []).filter((entry) => this.undoSecondsLeft(entry) > 0);
                this.addGame();
                const d = new Date();
                this.time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
                setInterval(() => { this.now = Date.now(); }, 1000);
            },

            remember() {
                localStorage.setItem(STORE, JSON.stringify({
                    officeId: this.officeId, left: this.sides.left, right: this.sides.right, recent: this.recent,
                }));
            },

            setOffice(id) {
                this.officeId = id;
                this.search = '';
                this.remember();
            },

            player(id) {
                return this.players.find((p) => p.id === id) ?? { name: '?', elo: 1200 };
            },

            name(id) {
                return this.player(id).name;
            },

            initial(id) {
                return this.name(id).trim().charAt(0).toUpperCase();
            },

            sideName(side) {
                return this.sides[side] ? this.name(this.sides[side]) : (side === 'left' ? 'Red' : 'Blue');
            },

            officePlayers() {
                return this.players.filter((p) => this.officeId === null || p.office_id === this.officeId);
            },

            /** The office's players matching the search; whoever is picked always stays in view. */
            visiblePlayers() {
                const q = this.search.trim().toLowerCase();
                return this.players.filter((p) =>
                    p.id === this.sides.left || p.id === this.sides.right
                    || ((this.officeId === null || p.office_id === this.officeId) && (q === '' || p.name.toLowerCase().includes(q))));
            },

            /** Tapping a picked player clears their side; anyone else fills the side being picked. */
            pick(id) {
                const other = (side) => (side === 'left' ? 'right' : 'left');
                for (const side of ['left', 'right']) {
                    if (this.sides[side] === id) {
                        this.sides[side] = null;
                        this.activeSide = side;
                        this.remember();
                        return;
                    }
                }
                this.sides[this.activeSide] = id;
                if (!this.sides[other(this.activeSide)]) {
                    this.activeSide = other(this.activeSide);
                }
                this.remember();
            },

            swap() {
                this.sides = { left: this.sides.right, right: this.sides.left };
                this.games.forEach((g) => { [g.left, g.right] = [g.right, g.left]; });
                this.remember();
            },

            slotClass(side) {
                const active = this.activeSide === side;
                if (side === 'left') {
                    return active ? 'border-[#ff5a4a]/70 bg-[#ff5a4a]/[0.09] shadow-[0_6px_20px_rgba(255,90,74,0.12)]' : 'border-[#ff5a4a]/25 bg-[#ff5a4a]/[0.04] hover:border-[#ff5a4a]/45';
                }
                return active ? 'border-[#3ec8ff]/70 bg-[#3ec8ff]/[0.09] shadow-[0_6px_20px_rgba(62,200,255,0.12)]' : 'border-[#3ec8ff]/25 bg-[#3ec8ff]/[0.04] hover:border-[#3ec8ff]/45';
            },

            chipClass(id) {
                if (this.sides.left === id) return 'bg-[#ff5a4a]/20 border-[#ff5a4a]/60 text-[#ffd2cc]';
                if (this.sides.right === id) return 'bg-[#3ec8ff]/20 border-[#3ec8ff]/60 text-[#cdf2ff]';
                return 'bg-[#f5ecd6]/[0.03] border-[#f5ecd6]/12 text-[#f5ecd6]/75 hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30';
            },

            addGame() {
                this.games.push({ key: this.nextKey++, left: '', right: '' });
            },

            removeGame(index) {
                this.games.splice(index, 1);
            },

            setScore(game, side, event) {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 2);
                event.target.value = digits;
                game[side] = digits === '' ? '' : Number(digits);
            },

            isComplete(game) {
                return game.left !== '' && game.right !== '';
            },

            /** First to 11, win by 2: the same rule the server checks. */
            isFinal(game) {
                if (!this.isComplete(game)) return false;
                const winner = Math.max(game.left, game.right);
                const loser = Math.min(game.left, game.right);
                return winner === 11 ? loser <= 9 : winner > 11 && winner - loser === 2;
            },

            winnerSide(game) {
                if (!this.isFinal(game)) return null;
                return game.left > game.right ? 'left' : 'right';
            },

            scoreClass(game, side) {
                const winner = this.winnerSide(game);
                if (this.isComplete(game) && !winner) return 'bg-[#ffd166]/[0.06] border-[#ffd166]/50 text-[#f5ecd6]';
                if (winner === side) {
                    return side === 'left' ? 'bg-[#ff5a4a]/20 border-[#ff5a4a]/60 text-[#fff1ee]' : 'bg-[#3ec8ff]/20 border-[#3ec8ff]/60 text-[#effbff]';
                }
                const focus = side === 'left' ? 'focus:border-[#ff5a4a]/70' : 'focus:border-[#3ec8ff]/70';
                return 'bg-[#f5ecd6]/[0.04] border-[#f5ecd6]/12 text-[#f5ecd6]/80 ' + focus;
            },

            series() {
                const final = this.games.filter((g) => this.isFinal(g));
                if (final.length < 2) return '';
                const left = final.filter((g) => g.left > g.right).length;
                return left + '–' + (final.length - left);
            },

            /** Why the result can't be logged yet, said on the button; null once it can. */
            blocker() {
                if (!this.sides.left || !this.sides.right) return 'Pick both players';
                const bad = this.games.findIndex((g) => !this.isFinal(g));
                if (bad === -1) return null;
                if (!this.isComplete(this.games[bad])) return this.games.length > 1 ? 'Enter game ' + (bad + 1) : 'Enter the score';
                return 'Check game ' + (bad + 1);
            },

            playedAt() {
                if (!this.earlier || !this.time) return null;
                const [hours, minutes] = this.time.split(':').map(Number);
                const d = new Date();
                d.setHours(hours, minutes, 0, 0);
                return d.toISOString();
            },

            messages(data, fallback) {
                return data.errors ? [...new Set(Object.values(data.errors).flat())] : [data.message || fallback];
            },

            signed(n) {
                return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
            },

            async submit() {
                this.errors = [];
                this.submitting = true;
                try {
                    const res = await fetch('/games/ping-pong/api/logged-results', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({
                            left: this.sides.left,
                            right: this.sides.right,
                            games: this.games.map((g) => ({ left: g.left, right: g.right })),
                            played_at: this.playedAt(),
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        this.errors = this.messages(data, 'Something went wrong. Try again.');
                        return;
                    }
                    const leftName = this.name(this.sides.left);
                    const rightName = this.name(this.sides.right);
                    const entries = data.matches.map((m) => ({
                        id: m.id,
                        left_id: this.sides.left,
                        right_id: this.sides.right,
                        left_name: leftName,
                        right_name: rightName,
                        left_won: m.left_won,
                        score: m.player_left_score + '–' + m.player_right_score,
                        left_delta: m.elo.left.after - m.elo.left.before,
                        right_delta: m.elo.right.after - m.elo.right.before,
                        logged_at: m.logged_at,
                    }));
                    const last = data.matches[data.matches.length - 1];
                    this.player(this.sides.left).elo = last.elo.left.after;
                    this.player(this.sides.right).elo = last.elo.right.after;
                    this.recent = [...entries.reverse(), ...this.recent];
                    this.games = [];
                    this.addGame();
                    this.earlier = false;
                    this.remember();
                } catch (e) {
                    this.errors = ['Could not reach the server. Check your connection and try again.'];
                } finally {
                    this.submitting = false;
                }
            },

            undoSecondsLeft(entry) {
                return Math.floor((new Date(entry.logged_at).getTime() + this.undoMinutes * 60000 - this.now) / 1000);
            },

            countdown(entry) {
                const s = Math.max(0, this.undoSecondsLeft(entry));
                return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
            },

            async undo(entry) {
                this.errors = [];
                this.undoing = entry.id;
                try {
                    const res = await fetch('/games/ping-pong/api/logged-results/' + entry.id, {
                        method: 'DELETE',
                        headers: { 'Accept': 'application/json' },
                    });
                    if (res.ok) {
                        this.player(entry.left_id).elo -= entry.left_delta;
                        this.player(entry.right_id).elo -= entry.right_delta;
                    }
                    if (res.ok || res.status === 404) {
                        this.recent = this.recent.filter((e) => e.id !== entry.id);
                        this.remember();
                    } else {
                        this.errors = this.messages(await res.json(), 'Could not undo that result.');
                    }
                } catch (e) {
                    this.errors = ['Could not reach the server. Check your connection and try again.'];
                } finally {
                    this.undoing = null;
                }
            },
        };
    }
</script>
@endsection
