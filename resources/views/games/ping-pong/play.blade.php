@extends('layouts.app')

@section('title', 'Ping Pong - Games Hub')
@section('main-class', 'px-4 py-4')

@section('content')
<link rel="stylesheet" href="{{ asset('css/ping-pong-play.css') }}">

@include('games.ping-pong.partials.chrome')

<div class="pp-container" x-data="pingPong()" x-init="init()" @keydown.window="handleKeydown($event)">

    <!-- SCREEN: HOME (lobby + leaderboard) -->
    <template x-if="screen === 'home'">
        <div class="pph-stage relative flex flex-col gap-5 flex-1 min-h-0 overflow-hidden rounded-3xl p-6 md:p-7 text-[#f5ecd6]/80">

            {{-- ====== Masthead (slim) ============================== --}}
            <header class="pph-net relative flex items-center justify-between gap-6 pb-3 flex-shrink-0">
                <div class="flex items-center gap-2.5 leading-none select-none">
                    <span class="pph-display uppercase tracking-[0.015em] text-[clamp(24px,2.6vw,38px)] text-[#ff5a4a] pph-glow-red">PING</span>
                    <span aria-hidden="true" class="pph-ball block rounded-full w-[clamp(12px,1.1vw,16px)] h-[clamp(12px,1.1vw,16px)]"></span>
                    <span class="pph-display uppercase tracking-[0.015em] text-[clamp(24px,2.6vw,38px)] text-[#3ec8ff] pph-glow-blue">PONG</span>
                    <span class="hidden md:inline-block ml-3 pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/40">TLM Office League</span>
                </div>

                <div class="inline-flex items-center gap-2 pph-mono text-[11px] uppercase tracking-[0.12em] text-[#f5ecd6]/80">
                    <span class="w-2 h-2 rounded-full"
                          :class="{
                              'bg-[#9be7c4] shadow-[0_0_10px_#9be7c4]': wsStatus === 'connected',
                              'bg-[#ffd166] pph-flicker': wsStatus === 'connecting',
                              'bg-[#ff5a4a]': wsStatus === 'error' || wsStatus === 'disconnected',
                          }"></span>
                    <span x-show="wsStatus === 'connected'">Live</span>
                    <span x-show="wsStatus === 'connecting'">Syncing…</span>
                    <span x-show="wsStatus === 'error' || wsStatus === 'disconnected'">Offline</span>
                </div>
            </header>

            {{-- ====== Body grid ===================================== --}}
            <div class="grid grid-cols-1 lg:grid-cols-[minmax(330px,380px)_minmax(0,1fr)] gap-5 flex-1 min-h-0">

                {{-- ----- LEFT: ticket-style lobby ------------------- --}}
                <aside class="pph-ticket-notch relative flex flex-col gap-4 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.045] to-[#f5ecd6]/[0.015] p-5 md:p-6 overflow-y-auto overflow-x-hidden">
                    <div class="flex items-center justify-between gap-3">
                        <div class="pph-mono text-xs tracking-[0.18em] uppercase text-[#f5ecd6]/45">
                            Lobby <strong class="text-[#f5ecd6] font-bold tracking-[0.06em] ml-1" x-text="lobbyCode || '———'"></strong>
                        </div>
                        <div class="inline-flex bg-[#f5ecd6]/[0.05] border border-[#f5ecd6]/15 rounded-full p-[3px]">
                            <button @click="setMode('1v1')"
                                    class="px-3.5 py-1.5 rounded-full font-semibold text-xs uppercase tracking-[0.04em] transition cursor-pointer"
                                    :class="mode === '1v1'
                                        ? 'bg-[#f5ecd6] text-[#06081b] shadow-[0_4px_14px_rgba(245,236,214,0.22)]'
                                        : 'text-[#f5ecd6]/45 hover:text-[#f5ecd6]'">Singles</button>
                            <button @click="setMode('2v2')"
                                    class="px-3.5 py-1.5 rounded-full font-semibold text-xs uppercase tracking-[0.04em] transition cursor-pointer"
                                    :class="mode === '2v2'
                                        ? 'bg-[#f5ecd6] text-[#06081b] shadow-[0_4px_14px_rgba(245,236,214,0.22)]'
                                        : 'text-[#f5ecd6]/45 hover:text-[#f5ecd6]'">Doubles</button>
                        </div>
                    </div>

                    <template x-if="lobbyCode">
                        <div class="flex flex-col gap-4">
                            {{-- QR --}}
                            <div class="relative self-center w-[200px] aspect-square bg-[#ffff] rounded-[10px] p-3 mb-5">
                                <div class="pph-qr-corners absolute inset-[3px] pointer-events-none">
                                    <span></span><span></span><span></span><span></span>
                                </div>
                                <div id="lobbyQrContainer" class="w-full h-full"></div>
                                <div class="absolute left-0 right-0 top-[calc(100%+6px)] text-center pph-mono text-[10px] tracking-[0.3em] uppercase text-[#f5ecd6]/45">Scan to join</div>
                            </div>

                            {{-- Perforation --}}
                            <div class="h-[2px] [background-image:repeating-linear-gradient(90deg,rgba(245,236,214,0.14)_0_5px,transparent_5px_10px)]"></div>

                            {{-- Sides roster --}}
                            <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
                                <div class="flex flex-col gap-1.5 min-w-0">
                                    <span class="pph-mono text-[10px] tracking-[0.3em] uppercase text-[#ff5a4a]">Left</span>
                                    <div class="flex flex-col gap-1.5">
                                        <template x-for="p in lobbyLeftPlayers" :key="p.player_id">
                                            <div class="pph-slot-in pph-shadow-left rounded-lg px-3 py-2.5 font-semibold text-[13px] text-[#f5ecd6] bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 border-l-[3px] border-l-[#ff5a4a] truncate">
                                                <span x-text="p.player_name"></span>
                                            </div>
                                        </template>
                                        <template x-for="i in leftEmptySlots" :key="'left-empty-' + i">
                                            <div class="rounded-lg px-3 py-2.5 italic font-medium text-xs text-[#f5ecd6]/25 border border-dashed border-[#f5ecd6]/15">Empty seat</div>
                                        </template>
                                    </div>
                                </div>
                                <div class="relative self-center pt-4 pph-display text-[22px] tracking-[0.06em] text-[#f5ecd6]
                                            before:content-[''] before:absolute before:left-1/2 before:-translate-x-1/2 before:top-0.5 before:w-px before:h-2.5 before:bg-[#f5ecd6]/15
                                            after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-0.5 after:w-px after:h-2.5 after:bg-[#f5ecd6]/15">VS</div>
                                <div class="flex flex-col gap-1.5 min-w-0 text-right items-end">
                                    <span class="pph-mono text-[10px] tracking-[0.3em] uppercase text-[#3ec8ff]">Right</span>
                                    <div class="flex flex-col gap-1.5 w-full">
                                        <template x-for="p in lobbyRightPlayers" :key="p.player_id">
                                            <div class="pph-slot-in pph-shadow-right rounded-lg px-3 py-2.5 font-semibold text-[13px] text-[#f5ecd6] bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 border-r-[3px] border-r-[#3ec8ff] truncate text-right">
                                                <span x-text="p.player_name"></span>
                                            </div>
                                        </template>
                                        <template x-for="i in rightEmptySlots" :key="'right-empty-' + i">
                                            <div class="rounded-lg px-3 py-2.5 italic font-medium text-xs text-[#f5ecd6]/25 border border-dashed border-[#f5ecd6]/15 text-right">Empty seat</div>
                                        </template>
                                    </div>
                                </div>
                            </div>

                            {{-- Start --}}
                            <button class="appearance-none border-0 mt-0.5 bg-[#f5ecd6] text-[#06081b] px-5 py-3.5 rounded-xl pph-display text-[22px] tracking-[0.06em] uppercase cursor-pointer transition shadow-[0_8px_22px_rgba(245,236,214,0.18)] hover:enabled:-translate-y-px hover:enabled:bg-[#fffaf0] hover:enabled:shadow-[0_12px_30px_rgba(245,236,214,0.28)] disabled:opacity-[0.35] disabled:cursor-not-allowed disabled:shadow-none disabled:bg-[#f5ecd6]/40"
                                    :disabled="!lobbyReady || loading || !hostToken"
                                    @click="startLobbyMatch()"
                                    x-show="hostToken">
                                <span x-show="!loading">Start match →</span>
                                <span x-show="loading">Starting…</span>
                            </button>
                            <div class="pph-mono text-[11px] tracking-[0.18em] uppercase text-[#f5ecd6]/45 text-center"
                                 x-show="!hostToken && lobbyCode">
                                Waiting for host to start…
                            </div>
                            <div class="pph-mono text-[10px] text-[#f5ecd6]/25 break-all text-center tracking-wide"
                                 x-text="lobbyJoinUrl"></div>
                        </div>
                    </template>

                    <template x-if="!lobbyCode">
                        <div class="flex items-center justify-center gap-3 py-16 pph-mono text-xs tracking-[0.2em] uppercase text-[#f5ecd6]/45">
                            <span class="pph-spin w-3.5 h-3.5 rounded-full border-2 border-[#f5ecd6]/15 border-t-[#f5ecd6]"></span>
                            Building lobby…
                        </div>
                    </template>
                </aside>

                {{-- ----- RIGHT: feed -------------------------------- --}}
                <section class="flex flex-col gap-4 min-h-0 min-w-0">

                    {{-- ELO over time --}}
                    <div x-show="topEloSeries.length > 0"
                         class="flex-shrink-0 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.03] to-[#f5ecd6]/[0.01] px-4 md:px-5 pt-4 pb-3.5">
                        <div class="flex items-center gap-x-2.5 gap-y-1.5 mb-2.5 flex-wrap">
                            <span class="pph-display text-base tracking-[0.14em] uppercase text-[#f5ecd6]">ELO Over Time</span>
                            <span class="pph-mono text-[10px] tracking-[0.22em] uppercase text-[#f5ecd6]/45">Singles · Top <span x-text="topEloSeries.length"></span></span>
                            {{-- Legend --}}
                            <div class="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
                                <template x-for="(s, i) in topEloSeries" :key="s.player_id">
                                    <span class="inline-flex items-center gap-1.5 pph-mono text-[11px] text-[#f5ecd6]/70">
                                        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="'background:' + eloColor(i)"></span>
                                        <span class="truncate max-w-[90px]" x-text="s.player_name"></span>
                                    </span>
                                </template>
                            </div>
                        </div>
                        <div class="relative h-[190px] md:h-[220px]" x-ref="topEloContainer"
                             @mousemove="onTopEloMouseMove($event)" @mouseleave="topEloTooltip.show = false">
                            <canvas id="topEloChart"></canvas>
                            <div class="absolute pointer-events-none z-10 rounded-lg border border-[#f5ecd6]/15 bg-[#06081b]/95 px-3 py-2 shadow-xl min-w-[140px]"
                                 x-show="topEloTooltip.show" x-cloak
                                 :style="'left:' + topEloTooltip.x + 'px; top:' + topEloTooltip.y + 'px;'">
                                <div class="pph-mono text-[10px] tracking-[0.18em] uppercase text-[#f5ecd6]/50 mb-1.5" x-text="topEloTooltip.date"></div>
                                <template x-for="row in topEloTooltip.rows" :key="row.player_id">
                                    <div class="flex items-center gap-2 text-[12px] leading-snug">
                                        <span class="w-2 h-2 rounded-full flex-shrink-0" :style="'background:' + row.color"></span>
                                        <span class="text-[#f5ecd6]/75 mr-2 truncate" x-text="row.name"></span>
                                        <span class="ml-auto font-bold text-[#f5ecd6] pph-mono" x-text="row.value"></span>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>

                    {{-- Live --}}
                    <div x-show="liveMatches.length > 0" class="flex-shrink-0 rounded-2xl border border-[#ff5a4a]/30 bg-gradient-to-b from-[#ff5a4a]/[0.07] to-[#ff5a4a]/[0.02] p-3.5">
                        <div class="flex items-center gap-2.5 mb-2.5">
                            <span class="pph-pulse-dot w-2 h-2 rounded-full bg-[#ff5a4a]"></span>
                            <span class="pph-display text-base tracking-[0.14em] uppercase text-[#ff5a4a]">On Court Now</span>
                            <span class="ml-auto pph-mono text-[10px] tracking-[0.22em] uppercase text-[#f5ecd6]/45" x-text="liveMatches.length + ' active'"></span>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <template x-for="lm in liveMatches" :key="lm.id">
                                <div @click="window.location.href='/games/ping-pong/watch'"
                                     class="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3.5 py-2.5 rounded-[10px] border border-[#f5ecd6]/15 bg-[#f5ecd6]/[0.03] cursor-pointer transition hover:border-[#f5ecd6]/30 hover:bg-[#f5ecd6]/[0.05] hover:-translate-y-px"
                                     :class="{ '!border-[#ffd166]/60 !bg-[#ffd166]/[0.08]': lm._flash }">
                                    <template x-if="lm.recording && lm.recording.status === 'recording'">
                                        <div class="absolute top-1.5 right-2 flex items-center gap-1 bg-[#ff5a4a]/20 rounded px-1.5 py-0.5 pph-mono text-[9px] font-bold tracking-[0.14em] text-[#ff5a4a]">
                                            <span class="pph-flicker w-1.5 h-1.5 rounded-full bg-[#ff5a4a]"></span>REC
                                        </div>
                                    </template>

                                    <div class="flex flex-col gap-px text-right min-w-0">
                                        <span class="font-bold text-sm text-[#f5ecd6] truncate"
                                              :class="{ '!text-[#ffd166] pph-serving-left': lm.current_server_id === lm.player_left_id }"
                                              x-text="lm.player_left?.name || '?'"></span>
                                        <template x-if="lm.mode === '2v2' && lm.team_left_player2">
                                            <span class="font-bold text-sm text-[#f5ecd6] truncate"
                                                  :class="{ '!text-[#ffd166] pph-serving-left': lm.current_server_id === lm.team_left_player2_id }"
                                                  x-text="lm.team_left_player2?.name || '?'"></span>
                                        </template>
                                    </div>

                                    <div class="relative flex items-baseline gap-1.5 pph-mono leading-none pb-2.5">
                                        <span class="text-[22px] font-bold text-[#ff5a4a] min-w-[26px] text-center" x-text="lm.player_left_score ?? 0"></span>
                                        <span class="text-[#f5ecd6]/25">·</span>
                                        <span class="text-[22px] font-bold text-[#3ec8ff] min-w-[26px] text-center" x-text="lm.player_right_score ?? 0"></span>
                                        <span class="absolute -bottom-0.5 left-1/2 -translate-x-1/2 pph-mono text-[9px] tracking-[0.22em] uppercase text-[#f5ecd6]/25" x-text="lm.mode"></span>
                                    </div>

                                    <div class="flex flex-col gap-px text-left min-w-0">
                                        <span class="font-bold text-sm text-[#f5ecd6] truncate"
                                              :class="{ '!text-[#ffd166] pph-serving-right': lm.current_server_id === lm.player_right_id }"
                                              x-text="lm.player_right?.name || '?'"></span>
                                        <template x-if="lm.mode === '2v2' && lm.team_right_player2">
                                            <span class="font-bold text-sm text-[#f5ecd6] truncate"
                                                  :class="{ '!text-[#ffd166] pph-serving-right': lm.current_server_id === lm.team_right_player2_id }"
                                                  x-text="lm.team_right_player2?.name || '?'"></span>
                                        </template>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>

                    {{-- Leaderboard --}}
                    <div class="flex flex-col flex-1 min-h-0 min-w-0 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.03] to-[#f5ecd6]/[0.01] px-4 md:px-5 pt-4 pb-1">
                        <div class="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-3 mb-3 flex-shrink-0">
                            <h2 class="flex items-baseline gap-2.5 m-0 min-w-0">
                                <span class="pph-display text-[26px] tracking-[0.04em] uppercase text-[#f5ecd6]"
                                      x-text="mode === '2v2' ? 'Doubles' : 'Singles'"></span>
                                <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">ELO Standings</span>
                            </h2>
                            <div class="pph-tabs-row flex flex-nowrap gap-1 overflow-x-auto py-0.5 min-w-0 md:justify-self-start">
                                <button type="button"
                                        @click="leaderboardTab = 'all'"
                                        class="px-3 py-1 rounded-full border border-[#f5ecd6]/15 text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                                        :class="leaderboardTab === 'all'
                                            ? 'bg-[#f5ecd6] text-[#06081b] border-[#f5ecd6]'
                                            : 'bg-transparent text-[#f5ecd6]/45 hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30'">All</button>
                                <template x-for="block in officeLeaderboards" :key="'tab-' + block.id">
                                    <button type="button"
                                            @click="leaderboardTab = block.id"
                                            class="px-3 py-1 rounded-full border border-[#f5ecd6]/15 text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                                            :class="leaderboardTab === block.id
                                                ? 'bg-[#f5ecd6] text-[#06081b] border-[#f5ecd6]'
                                                : 'bg-transparent text-[#f5ecd6]/45 hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30'"
                                            x-text="block.name"></button>
                                </template>
                            </div>
                            <div class="flex gap-2 justify-self-end">
                                <a x-show="leaderboard.length > 0" href="/games/ping-pong/stats"
                                   class="px-3 py-1.5 rounded-full bg-[#ff5a4a] text-[#06081b] border border-[#ff5a4a] no-underline text-xs font-semibold transition hover:bg-[#ff7a6a] hover:border-[#ff7a6a]">Full stats →</a>
                                <a href="/games/ping-pong/recordings"
                                   class="px-3 py-1.5 rounded-full border border-[#f5ecd6]/15 text-[#f5ecd6]/80 no-underline text-xs font-semibold transition hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30 hover:bg-[#f5ecd6]/[0.04]">Recordings</a>
                            </div>
                        </div>

                        <div class="overflow-y-auto overflow-x-auto flex-1 min-h-0 pb-3 -mx-1 px-1">
                            {{-- All players --}}
                            <div x-show="leaderboardTab === 'all'">
                                <template x-if="leaderboard.length > 0">
                                    @include('games.ping-pong.partials.home-leaderboard-rows', ['entriesExpr' => 'leaderboard'])
                                </template>
                                <div x-show="leaderboard.length === 0"
                                     class="text-center py-14 px-5 pph-mono text-xs tracking-[0.14em] uppercase text-[#f5ecd6]/45">
                                    No matches played yet — be the first.
                                </div>
                            </div>
                            {{-- Per office --}}
                            <template x-for="block in officeLeaderboards" :key="'panel-' + block.id">
                                <div x-show="leaderboardTab === block.id">
                                    <template x-if="block.entries.length > 0">
                                        @include('games.ping-pong.partials.home-leaderboard-rows', ['entriesExpr' => 'block.entries'])
                                    </template>
                                    <div x-show="block.entries.length === 0"
                                         class="text-center py-14 px-5 pph-mono text-xs tracking-[0.14em] uppercase text-[#f5ecd6]/45">
                                        No players from this office yet.
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </template>

    <!-- SCREEN: PLAYING -->
    <template x-if="screen === 'playing'">
        <div class="pph-stage relative flex flex-col gap-4 flex-1 min-h-0 overflow-hidden rounded-3xl p-5 md:p-7">

            {{-- ===== Top bar: mode + clock + timer ===== --}}
            <header class="pph-net relative flex items-center justify-between gap-4 pb-3 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff5a4a]/15 border border-[#ff5a4a]/35 text-[#ff5a4a] pph-mono text-[10px] font-bold tracking-[0.18em] uppercase">
                        <span class="pph-flicker w-1.5 h-1.5 rounded-full bg-[#ff5a4a]"></span>
                        Live ·
                        <span x-text="mode === '2v2' ? '2v2 · First to 11' : 'First to 11'"></span>
                    </span>
                </div>
                <div class="flex items-baseline gap-5">
                    <span class="pph-mono font-bold text-[#f5ecd6] text-[clamp(28px,2.8vw,40px)] tracking-[0.06em] tabular-nums" x-text="clockDisplay"></span>
                    <span class="pph-mono text-[#f5ecd6]/50 text-[clamp(14px,1.4vw,18px)] tabular-nums tracking-[0.04em]" x-text="timerDisplay"></span>
                </div>
            </header>

            {{-- ===== Optional live video preview ===== --}}
            <div x-show="hlsInstance" class="flex justify-center mb-1">
                <div class="relative w-full max-w-[480px] aspect-video bg-black rounded-xl overflow-hidden border border-[#f5ecd6]/15">
                    <video id="livePlayer" muted autoplay playsinline class="w-full h-full object-cover"></video>
                    <div class="absolute top-2 left-2 inline-flex items-center gap-1.5 bg-black/60 px-2 py-0.5 rounded-md pph-mono text-[10px] font-bold tracking-[0.16em] uppercase text-white">
                        <span class="pph-flicker w-1.5 h-1.5 rounded-full bg-[#ff5a4a]"></span>
                        Live
                    </div>
                    <a :href="'/games/ping-pong/watch'" target="_blank"
                       class="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded-md text-white pph-mono text-[10px] uppercase tracking-[0.14em] no-underline">Full screen →</a>
                </div>
            </div>

            {{-- ===== Two-side scoreboard ===== --}}
            <div class="grid grid-cols-2 gap-4 md:gap-6 flex-1 min-h-0">

                {{-- LEFT team --}}
                <div class="relative rounded-2xl border-2 border-[#ff5a4a]/25 bg-gradient-to-b from-[#ff5a4a]/[0.08] to-[#ff5a4a]/[0.02] p-3 md:p-8 flex flex-col items-center justify-center transition-all duration-300"
                     :class="isServing('left') ? '!border-[#ff5a4a]/75 !bg-[#ff5a4a]/[0.18] shadow-[inset_0_0_80px_rgba(255,90,74,0.16),0_0_40px_rgba(255,90,74,0.18)]' : ''">

                    {{-- Player name(s) --}}
                    <template x-if="mode === '1v1'">
                        <div class="pph-display text-[clamp(20px,4vw,56px)] tracking-[0.02em] uppercase text-[#ff5a4a] pph-glow-red text-center leading-none truncate max-w-full"
                             x-text="match.player_left?.name || ''"></div>
                    </template>
                    <template x-if="mode === '2v2'">
                        <div class="flex flex-col items-center gap-0.5">
                            <div class="pph-display tracking-[0.02em] uppercase truncate max-w-full transition-all duration-300"
                                 :class="isPlayerServing(match.player_left_id)
                                    ? 'text-[clamp(32px,4.5vw,60px)] text-[#ff5a4a] pph-glow-red font-bold'
                                    : 'text-[clamp(22px,3vw,42px)] text-[#f5ecd6]/50'"
                                 x-text="match.player_left?.name || ''"></div>
                            <div class="pph-display tracking-[0.02em] uppercase truncate max-w-full transition-all duration-300"
                                 :class="isPlayerServing(match.team_left_player2_id)
                                    ? 'text-[clamp(32px,4.5vw,60px)] text-[#ff5a4a] pph-glow-red font-bold'
                                    : 'text-[clamp(22px,3vw,42px)] text-[#f5ecd6]/50'"
                                 x-text="match.team_left_player2?.name || ''"></div>
                        </div>
                    </template>

                    {{-- Serving badge --}}
                    <div class="mt-3 mb-3" :class="{ 'invisible': !isServing('left') }">
                        <span class="inline-flex items-center gap-1.5 pph-mono text-[11px] md:text-[13px] font-bold tracking-[0.22em] uppercase px-3 py-1 rounded-full bg-[#ffd166]/15 border border-[#ffd166]/40 text-[#ffd166] pph-flicker">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#ffd166] shadow-[0_0_10px_#ffd166]"></span>
                            Serving
                        </span>
                    </div>

                    {{-- Score --}}
                    <div class="pph-mono font-bold text-[#ff5a4a] pph-glow-red text-[clamp(80px,16vw,220px)] leading-none tabular-nums"
                         x-text="match.player_left_score ?? 0"></div>

                    {{-- Buttons --}}
                    <div class="flex gap-4 mt-5" x-show="!readOnly">
                        <button @click="updateScore('left', 'decrement')"
                                class="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-[#ff5a4a]/40 bg-[#06081b]/40 text-[#ff5a4a] text-3xl font-bold cursor-pointer transition hover:bg-[#ff5a4a]/20 hover:border-[#ff5a4a] hover:scale-105">−</button>
                        <button @click="updateScore('left', 'increment')"
                                class="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-[#9be7c4]/40 bg-[#06081b]/40 text-[#9be7c4] text-3xl font-bold cursor-pointer transition hover:bg-[#9be7c4]/20 hover:border-[#9be7c4] hover:scale-105">+</button>
                    </div>

                    @include('games.ping-pong.partials.elo-preview', ['side' => 'left'])
                </div>

                {{-- RIGHT team --}}
                <div class="relative rounded-2xl border-2 border-[#3ec8ff]/25 bg-gradient-to-b from-[#3ec8ff]/[0.08] to-[#3ec8ff]/[0.02] p-3 md:p-8 flex flex-col items-center justify-center transition-all duration-300"
                     :class="isServing('right') ? '!border-[#3ec8ff]/75 !bg-[#3ec8ff]/[0.18] shadow-[inset_0_0_80px_rgba(62,200,255,0.16),0_0_40px_rgba(62,200,255,0.18)]' : ''">

                    <template x-if="mode === '1v1'">
                        <div class="pph-display text-[clamp(20px,4vw,56px)] tracking-[0.02em] uppercase text-[#3ec8ff] pph-glow-blue text-center leading-none truncate max-w-full"
                             x-text="match.player_right?.name || ''"></div>
                    </template>
                    <template x-if="mode === '2v2'">
                        <div class="flex flex-col items-center gap-0.5">
                            <div class="pph-display tracking-[0.02em] uppercase truncate max-w-full transition-all duration-300"
                                 :class="isPlayerServing(match.player_right_id)
                                    ? 'text-[clamp(32px,4.5vw,60px)] text-[#3ec8ff] pph-glow-blue font-bold'
                                    : 'text-[clamp(22px,3vw,42px)] text-[#f5ecd6]/50'"
                                 x-text="match.player_right?.name || ''"></div>
                            <div class="pph-display tracking-[0.02em] uppercase truncate max-w-full transition-all duration-300"
                                 :class="isPlayerServing(match.team_right_player2_id)
                                    ? 'text-[clamp(32px,4.5vw,60px)] text-[#3ec8ff] pph-glow-blue font-bold'
                                    : 'text-[clamp(22px,3vw,42px)] text-[#f5ecd6]/50'"
                                 x-text="match.team_right_player2?.name || ''"></div>
                        </div>
                    </template>

                    <div class="mt-3 mb-3" :class="{ 'invisible': !isServing('right') }">
                        <span class="inline-flex items-center gap-1.5 pph-mono text-[11px] md:text-[13px] font-bold tracking-[0.22em] uppercase px-3 py-1 rounded-full bg-[#ffd166]/15 border border-[#ffd166]/40 text-[#ffd166] pph-flicker">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#ffd166] shadow-[0_0_10px_#ffd166]"></span>
                            Serving
                        </span>
                    </div>

                    <div class="pph-mono font-bold text-[#3ec8ff] pph-glow-blue text-[clamp(80px,16vw,220px)] leading-none tabular-nums"
                         x-text="match.player_right_score ?? 0"></div>

                    <div class="flex gap-4 mt-5" x-show="!readOnly">
                        <button @click="updateScore('right', 'decrement')"
                                class="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-[#ff5a4a]/40 bg-[#06081b]/40 text-[#ff5a4a] text-3xl font-bold cursor-pointer transition hover:bg-[#ff5a4a]/20 hover:border-[#ff5a4a] hover:scale-105">−</button>
                        <button @click="updateScore('right', 'increment')"
                                class="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-[#9be7c4]/40 bg-[#06081b]/40 text-[#9be7c4] text-3xl font-bold cursor-pointer transition hover:bg-[#9be7c4]/20 hover:border-[#9be7c4] hover:scale-105">+</button>
                    </div>

                    @include('games.ping-pong.partials.elo-preview', ['side' => 'right'])
                </div>
            </div>

            {{-- ===== Bottom hint ===== --}}
            <div class="text-center pph-mono text-[10px] tracking-[0.16em] uppercase text-[#f5ecd6]/35 flex-shrink-0" x-show="!readOnly">
                <span class="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    <span><kbd class="inline-block px-1.5 py-0.5 rounded bg-[#f5ecd6]/[0.08] border border-[#f5ecd6]/15 text-[#f5ecd6]/70 text-[10px]">↑</kbd> left +1</span>
                    <span><kbd class="inline-block px-1.5 py-0.5 rounded bg-[#f5ecd6]/[0.08] border border-[#f5ecd6]/15 text-[#f5ecd6]/70 text-[10px]">↓</kbd> left −1</span>
                    <span><kbd class="inline-block px-1.5 py-0.5 rounded bg-[#f5ecd6]/[0.08] border border-[#f5ecd6]/15 text-[#f5ecd6]/70 text-[10px]">→</kbd> right +1</span>
                    <span><kbd class="inline-block px-1.5 py-0.5 rounded bg-[#f5ecd6]/[0.08] border border-[#f5ecd6]/15 text-[#f5ecd6]/70 text-[10px]">←</kbd> right −1</span>
                    <span class="text-[#f5ecd6]/25">·</span>
                    <span><kbd class="inline-block px-1.5 py-0.5 rounded bg-[#f5ecd6]/[0.08] border border-[#f5ecd6]/15 text-[#f5ecd6]/70 text-[10px]">⌫</kbd> abandon</span>
                </span>
            </div>
            <div class="text-center flex-shrink-0" x-show="readOnly">
                <a href="/games/ping-pong/watch"
                   class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#f5ecd6]/15 text-[#f5ecd6]/65 no-underline pph-mono text-[11px] tracking-[0.16em] uppercase hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30 hover:bg-[#f5ecd6]/[0.04] transition">
                    ← Watch live stream
                </a>
            </div>
        </div>
    </template>

    <!-- Abandon Confirm -->
    <template x-if="showAbandonConfirm">
        <div class="pp-confirm-overlay" @click.self="showAbandonConfirm = false">
            <div class="pp-confirm-box">
                <h3>Abandon Match?</h3>
                <p>This match will be discarded.</p>
                <div class="pp-confirm-buttons">
                    <button class="pp-btn-cancel" @click="showAbandonConfirm = false">Cancel</button>
                    <button class="pp-btn-danger" @click="abandonMatch()">Abandon</button>
                </div>
            </div>
        </div>
    </template>
</div>

<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
<script>
function pingPong() {
    return {
        API: '/games/ping-pong/api',
        csrf: document.querySelector('meta[name="csrf-token"]').content,

        preloadedMatchId: @json($preloadedMatchId ?? null),
        readOnly: @json(!empty($preloadedMatchId)),

        screen: 'home',
        mode: '1v1',
        leaderboard: [],
        offices: [],
        officeLeaderboards: [],
        leaderboardTab: 'all',

        // ELO over time (league chart) — fixed to Singles, all offices
        topEloDates: [],
        topEloSeries: [],
        topEloColors: ['#ff5a4a', '#3ec8ff', '#ffd166', '#9be7c4', '#c792ea', '#f78fb3', '#7bd88f', '#f5ecd6'],
        topEloChartData: null,
        topEloTooltip: { show: false, x: 0, y: 0, date: '', rows: [] },

        // Lobby state
        lobbyCode: '',
        hostToken: '',
        lobbyParticipants: [],
        lobbyJoinUrl: '',

        // Live matches
        liveMatches: [],
        liveChannel: null,

        // Match state
        match: {},
        eloPreview: null,

        // Timer
        timerDisplay: '00:00',
        clockDisplay: '',
        timerInterval: null,
        clockInterval: null,
        matchStartTime: null,

        showAbandonConfirm: false,
        loading: false,
        hlsInstance: null,

        echo: null,
        lobbyChannel: null,
        matchChannel: null,
        wsStatus: 'connecting',

        async init() {
            this.startClock();

            if (this.preloadedMatchId) {
                await this.loadAndStartMatch(this.preloadedMatchId);
                return;
            }

            await this.loadLeaderboard();
            await this.loadLiveMatches();
            this.subscribeLive();
            this.loadTopEloHistory();
            window.addEventListener('resize', () => {
                if (this.topEloSeries.length > 0) this.renderTopEloChart();
            });

            const params = new URLSearchParams(window.location.search);
            const existingLobby = params.get('lobby');
            if (existingLobby) {
                const adopted = await this.adoptExistingLobby(existingLobby);
                if (adopted) return;
            }

            await this.createLobby();
        },

        async adoptExistingLobby(code) {
            try {
                const res = await fetch(`${this.API}/lobbies/${code}`);
                if (!res.ok) return false;
                const lobby = await res.json();
                if (lobby.status !== 'waiting') return false;

                this.lobbyCode = lobby.code;
                this.hostToken = '';
                this.mode = lobby.mode;
                this.lobbyParticipants = lobby.participants || [];
                this.lobbyJoinUrl = `${window.location.origin}/games/ping-pong/lobby/${this.lobbyCode}`;

                this.subscribeToLobby();
                this.$nextTick(() => setTimeout(() => this.generateLobbyQr(), 100));
                return true;
            } catch (err) {
                console.warn('Could not adopt lobby:', err);
                return false;
            }
        },

        async setMode(newMode) {
            this.mode = newMode;
            await this.loadLeaderboard();
            // Re-create lobby with new mode
            await this.createLobby();
        },

        startClock() {
            this.updateClock();
            this.clockInterval = setInterval(() => this.updateClock(), 1000);
        },

        updateClock() {
            const now = new Date();
            this.clockDisplay = now.toLocaleTimeString('en-US', { hour12: false });
            this.pruneStaleLiveMatches();
        },

        // Must match PingPongApiController::LIVE_MATCH_MAX_IDLE_SECONDS (120s)
        pruneStaleLiveMatches() {
            const staleMs = 120_000;
            const cutoff = Date.now() - staleMs;
            this.liveMatches = this.liveMatches.filter((m) => {
                const raw = m.last_score_activity_at || m.started_at;
                if (!raw) return true;
                return new Date(raw).getTime() >= cutoff;
            });
        },

        startTimer() {
            this.matchStartTime = Date.now();
            this.timerDisplay = '00:00';
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                const elapsed = Math.max(0, Math.floor((Date.now() - this.matchStartTime) / 1000));
                if (elapsed >= 24 * 3600) {
                    this.timerDisplay = '--:--';
                    return;
                }
                const h = Math.floor(elapsed / 3600);
                const m = Math.floor((elapsed % 3600) / 60);
                const s = elapsed % 60;
                this.timerDisplay = h > 0
                    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            }, 1000);
        },

        stopTimer() {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        },


        async loadOffices() {
            const res = await fetch(`${this.API}/offices`);
            this.offices = await res.json();
        },

        async loadLeaderboard() {
            if (!this.offices.length) {
                await this.loadOffices();
            }
            const mode = this.mode;
            const res = await fetch(`${this.API}/leaderboard?mode=${mode}`);
            this.leaderboard = await res.json();
            this.officeLeaderboards = await Promise.all(
                this.offices.map(async (office) => {
                    const r = await fetch(`${this.API}/leaderboard?mode=${mode}&office_id=${office.id}`);
                    const entries = await r.json();
                    return { id: office.id, name: office.name, entries };
                })
            );
            if (this.leaderboardTab !== 'all' && !this.officeLeaderboards.some((b) => b.id === this.leaderboardTab)) {
                this.leaderboardTab = 'all';
            }
        },

        // --- ELO OVER TIME (league chart) ---

        eloColor(i) {
            return this.topEloColors[i % this.topEloColors.length];
        },

        async loadTopEloHistory() {
            try {
                const res = await fetch(`${this.API}/elo-history/top?mode=1v1&limit=6`);
                const data = await res.json();
                this.topEloDates = data.dates || [];
                this.topEloSeries = data.series || [];
                this.$nextTick(() => this.renderTopEloChart());
            } catch (err) {
                console.error('Error loading ELO over time:', err);
                this.topEloDates = [];
                this.topEloSeries = [];
            }
        },

        renderTopEloChart() {
            if (this.topEloSeries.length === 0 || this.topEloDates.length === 0) return;
            const canvas = document.getElementById('topEloChart');
            const container = this.$refs.topEloContainer;
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
            const w = rect.width, h = rect.height;
            ctx.clearRect(0, 0, w, h);

            const dates = this.topEloDates;
            const series = this.topEloSeries;

            // Y range across every series, always anchored on the 1200 baseline.
            let rawMin = 1200, rawMax = 1200;
            series.forEach((s) => s.values.forEach((v) => {
                if (v !== null) { rawMin = Math.min(rawMin, v); rawMax = Math.max(rawMax, v); }
            }));
            const minY = Math.floor((rawMin - 40) / 50) * 50;
            const maxY = Math.ceil((rawMax + 40) / 50) * 50;
            const roughStep = (maxY - minY) / 5;
            const yStep = roughStep <= 25 ? 25 : (roughStep <= 50 ? 50 : (roughStep <= 100 ? 100 : 200));
            const yTicks = [];
            for (let v = Math.ceil(minY / yStep) * yStep; v <= maxY; v += yStep) yTicks.push(v);
            if (yTicks.length === 0) yTicks.push(1200);
            // Plot range must contain the full padded data range so no line clips,
            // even when the data ceiling sits between two round gridlines.
            const chartMinY = Math.min(yTicks[0], minY);
            const chartMaxY = Math.max(yTicks[yTicks.length - 1], maxY, chartMinY + 50);

            const pad = { left: 44, right: 16, top: 12, bottom: 26 };
            const chartW = w - pad.left - pad.right;
            const chartH = h - pad.top - pad.bottom;
            const yRange = chartMaxY - chartMinY || 100;
            const toY = (v) => pad.top + chartH - ((v - chartMinY) / yRange) * chartH;
            const toX = (i) => pad.left + (i / Math.max(1, dates.length - 1)) * chartW;

            ctx.font = '10px ui-monospace, monospace';
            yTicks.forEach((v) => {
                const y = toY(v);
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(pad.left + chartW, y);
                ctx.strokeStyle = 'rgba(245,236,214,0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = 'rgba(245,236,214,0.45)';
                ctx.textAlign = 'right';
                ctx.fillText(String(v), pad.left - 8, y + 3);
            });

            const xStep = Math.max(1, Math.floor(dates.length / 6));
            ctx.fillStyle = 'rgba(245,236,214,0.45)';
            for (let i = 0; i < dates.length; i += xStep) {
                const d = new Date(dates[i]);
                const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                ctx.textAlign = i === 0 ? 'left' : 'center';
                ctx.fillText(label, toX(i), pad.top + chartH + 16);
            }

            series.forEach((s, si) => {
                ctx.beginPath();
                let started = false;
                for (let i = 0; i < s.values.length; i++) {
                    const v = s.values[i];
                    if (v === null) { started = false; continue; }
                    const x = toX(i), y = toY(v);
                    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
                }
                ctx.strokeStyle = this.eloColor(si);
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                ctx.stroke();
            });

            this.topEloChartData = { pad, chartW, chartH, n: dates.length, toX };
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        },

        onTopEloMouseMove(e) {
            const cd = this.topEloChartData;
            if (!cd || this.topEloSeries.length === 0) return;
            const rect = this.$refs.topEloContainer.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const ratio = (mx - cd.pad.left) / (cd.chartW || 1);
            let idx = Math.round(ratio * (cd.n - 1));
            idx = Math.max(0, Math.min(cd.n - 1, idx));

            const rows = this.topEloSeries
                .map((s, si) => ({ player_id: s.player_id, name: s.player_name, value: s.values[idx], color: this.eloColor(si) }))
                .filter((r) => r.value !== null)
                .sort((a, b) => b.value - a.value);
            if (rows.length === 0) { this.topEloTooltip.show = false; return; }

            const d = new Date(this.topEloDates[idx]);
            const tipX = Math.max(8, Math.min(cd.toX(idx) + 12, rect.width - 150));
            this.topEloTooltip = {
                show: true,
                x: tipX,
                y: 8,
                date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }),
                rows,
            };
        },

        // --- LIVE MATCHES ---

        async loadLiveMatches() {
            try {
                const res = await fetch(`${this.API}/matches/live`);
                this.liveMatches = await res.json();
            } catch (err) {
                console.error('Error loading live matches:', err);
            }
        },

        ensureEcho() {
            if (!this.echo) {
                this.echo = new Echo({
                    broadcaster: 'pusher',
                    key: 'games-hub-key',
                    wsHost: window.location.hostname,
                    wsPort: window.location.port || 80,
                    forceTLS: false,
                    disableStats: true,
                    enabledTransports: ['ws', 'wss'],
                    cluster: 'mt1',
                });
                this.echo.connector.pusher.connection.bind('connected', () => {
                    console.log('[WS] Connected to Reverb');
                    this.wsStatus = 'connected';
                });
                this.echo.connector.pusher.connection.bind('error', (err) => {
                    console.error('[WS] Connection error:', err);
                    this.wsStatus = 'error';
                });
                this.echo.connector.pusher.connection.bind('disconnected', () => {
                    console.warn('[WS] Disconnected');
                    this.wsStatus = 'disconnected';
                });
            }
            return this.echo;
        },

        subscribeLive() {
            this.ensureEcho();

            if (this.liveChannel) {
                this.echo.leave(this.liveChannel.name);
            }
            this.liveChannel = this.echo.channel('ping-pong.live');
            this.liveChannel.listen('.match.started', (e) => {
                if (!this.liveMatches.find(m => m.id === e.match.id)) {
                    this.liveMatches = [e.match, ...this.liveMatches];
                }
            }).listen('.match.score-updated', (e) => {
                const data = e.match;
                const idx = this.liveMatches.findIndex(m => m.id === data.id);
                if (data.is_complete) {
                    if (idx !== -1) {
                        this.liveMatches = this.liveMatches.map((m, i) =>
                            i === idx ? { ...m, ...data, _flash: true } : m
                        );
                        setTimeout(() => {
                            this.liveMatches = this.liveMatches.filter(m => m.id !== data.id);
                            if (this.screen === 'home') this.loadLeaderboard();
                        }, 3000);
                    }
                    return;
                }
                // In-list update, or re-add after idle prune (new score = fresh last_score_activity_at)
                const entry = idx !== -1
                    ? { ...this.liveMatches[idx], ...data, _flash: true }
                    : { ...data, _flash: true };
                if (idx !== -1) {
                    this.liveMatches = this.liveMatches.map((m, i) => (i === idx ? entry : m));
                } else {
                    this.liveMatches = [entry, ...this.liveMatches.filter(m => m.id !== data.id)];
                }
                setTimeout(() => {
                    this.liveMatches = this.liveMatches.map((m) =>
                        m.id === data.id ? { ...m, _flash: false } : m
                    );
                }, 600);
            }).listen('.match.abandoned', (e) => {
                this.liveMatches = this.liveMatches.filter(m => m.id !== e.matchId);
            });
        },


        // --- LOBBY ---

        async createLobby() {
            if (this.loading) return;
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/lobbies`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ mode: this.mode }),
                });
                const data = await res.json();
                this.lobbyCode = data.code;
                this.hostToken = data.host_token;
                this.lobbyParticipants = [];

                this.lobbyJoinUrl = `${window.location.origin}/games/ping-pong/lobby/${this.lobbyCode}`;

                this.subscribeToLobby();
                // Wait for x-if to render the QR container
                this.$nextTick(() => setTimeout(() => this.generateLobbyQr(), 100));

                // On mobile, auto-join with cached player
                if (window.innerWidth < 768) {
                    this.autoJoinCachedPlayer();
                }
            } catch (err) {
                console.error('Error creating lobby:', err);
            }
            this.loading = false;
        },

        async autoJoinCachedPlayer() {
            try {
                const stored = localStorage.getItem('ping_pong_last_player');
                if (!stored) return;
                const last = JSON.parse(stored);
                if (!last?.player_id) return;

                const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ player_id: last.player_id }),
                });
                if (!res.ok) return;
            } catch (e) {
                console.warn('Auto-join failed:', e);
            }
        },

        generateLobbyQr() {
            const el = document.getElementById('lobbyQrContainer');
            if (el) {
                el.innerHTML = '';
                new QRCode(el, { text: this.lobbyJoinUrl, width: 220, height: 220 });
            }
        },

        subscribeToLobby() {
            // Leave old lobby/match channels but keep live channel
            if (this.echo && this.lobbyChannel) {
                this.echo.leave(this.lobbyChannel.name);
                this.lobbyChannel = null;
            }
            if (this.echo && this.matchChannel) {
                this.echo.leave(this.matchChannel.name);
                this.matchChannel = null;
            }

            this.ensureEcho();

            this.lobbyChannel = this.echo.channel('ping-pong.lobby.' + this.lobbyCode);
            this.lobbyChannel.listen('.lobby.updated', (e) => {
                console.log('[WS] Lobby updated:', e);
                this.lobbyParticipants = e.lobby.participants || [];
            }).listen('.lobby.match-started', (e) => {
                console.log('[WS] Match started:', e);
                this.loadAndStartMatch(e.matchId);
            });

            // Re-subscribe to live channel if it was lost
            if (!this.liveChannel) {
                this.subscribeLive();
            }
        },

        subscribeToMatch(matchId) {
            this.ensureEcho();

            if (this.matchChannel) {
                this.echo.leave(this.matchChannel.name);
            }

            this.matchChannel = this.echo.channel('ping-pong.match.' + matchId);
            this.matchChannel.listen('.match.score-updated', (e) => {
                const data = e.match;
                if (data.player_left_score !== this.match.player_left_score ||
                    data.player_right_score !== this.match.player_right_score ||
                    data.is_complete !== this.match.is_complete) {
                    // Preserve points data if WS event doesn't include it
                    if (!data.points && this.match.points) {
                        data.points = this.match.points;
                    }
                    this.match = data;

                    if (data.is_complete && this.screen === 'playing') {
                        this.stopTimer();
                        window.location.href = '/games/ping-pong/matches/' + data.id + '?from=game';
                    }
                }
            }).listen('.match.abandoned', () => {
                if (this.screen === 'playing') {
                    this.stopTimer();
                    this.destroyLivePlayer();
                    this.goToHome();
                }
            });
        },

        unsubscribeAll() {
            if (this.echo) {
                if (this.lobbyChannel) {
                    this.echo.leave(this.lobbyChannel.name);
                    this.lobbyChannel = null;
                }
                if (this.matchChannel) {
                    this.echo.leave(this.matchChannel.name);
                    this.matchChannel = null;
                }
                if (this.liveChannel) {
                    this.echo.leave(this.liveChannel.name);
                    this.liveChannel = null;
                }
            }
        },

        get lobbyLeftPlayers() {
            return this.lobbyParticipants.filter(p => p.side === 'left');
        },

        get lobbyRightPlayers() {
            return this.lobbyParticipants.filter(p => p.side === 'right');
        },

        get leftEmptySlots() {
            const needed = this.mode === '2v2' ? 2 : 1;
            return Math.max(0, needed - this.lobbyLeftPlayers.length);
        },

        get rightEmptySlots() {
            const needed = this.mode === '2v2' ? 2 : 1;
            return Math.max(0, needed - this.lobbyRightPlayers.length);
        },

        get lobbyReady() {
            const needed = this.mode === '2v2' ? 2 : 1;
            return this.lobbyLeftPlayers.length === needed && this.lobbyRightPlayers.length === needed;
        },

        async startLobbyMatch() {
            if (this.loading || !this.lobbyReady) return;
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ host_token: this.hostToken }),
                });
                const data = await res.json();
                this.match = data.match;


                // Subscribe to match channel for score updates
                this.subscribeToMatch(this.match.id);

                this.startTimer();
                this.screen = 'playing';
                this.loadEloPreview();

                // Start live player for recording
                this.initLivePlayer('/recordings/live/' + this.match.id + '/stream.m3u8');
            } catch (err) {
                console.error('Error starting match:', err);
            }
            this.loading = false;
        },

        async loadAndStartMatch(matchId) {
            try {
                const res = await fetch(`${this.API}/matches/${matchId}`);
                if (!res.ok) {
                    if (res.status === 404) window.location.href = '/games/ping-pong';
                    return;
                }
                const data = await res.json();

                if (data.is_complete) {
                    window.location.href = '/games/ping-pong/matches/' + data.id;
                    return;
                }

                this.match = data;
                this.mode = data.mode || '1v1';

                this.subscribeToMatch(matchId);
                this.startTimer();
                if (data.started_at) {
                    this.matchStartTime = new Date(data.started_at).getTime();
                }
                this.screen = 'playing';
                this.loadEloPreview();
            } catch (err) {
                console.error('Error loading match:', err);
            }
        },

        async loadEloPreview() {
            if (!this.match?.id) return;
            try {
                const res = await fetch(`${this.API}/matches/${this.match.id}/elo-preview`);
                if (!res.ok) {
                    this.eloPreview = null;
                    return;
                }
                this.eloPreview = await res.json();
            } catch (err) {
                console.warn('Failed to load ELO preview:', err);
                this.eloPreview = null;
            }
        },

        eloPreviewFor(playerId, won) {
            if (!this.eloPreview || !playerId) return null;
            const onLeft = this.match.player_left_id === playerId
                || this.match.team_left_player2_id === playerId;
            const key = (onLeft === won) ? 'if_left_wins' : 'if_right_wins';
            return this.eloPreview[key]?.[playerId] ?? null;
        },

        formatDelta(n) {
            if (n === null || n === undefined) return '';
            if (n > 0) return '+' + n;
            return String(n);
        },

        previewPlayerIdsForSide(side) {
            if (side === 'left') {
                return this.mode === '2v2'
                    ? [this.match.player_left_id, this.match.team_left_player2_id].filter(Boolean)
                    : (this.match.player_left_id ? [this.match.player_left_id] : []);
            }
            return this.mode === '2v2'
                ? [this.match.player_right_id, this.match.team_right_player2_id].filter(Boolean)
                : (this.match.player_right_id ? [this.match.player_right_id] : []);
        },

        playerNameById(id) {
            if (id === this.match.player_left_id) return this.match.player_left?.name;
            if (id === this.match.player_right_id) return this.match.player_right?.name;
            if (id === this.match.team_left_player2_id) return this.match.team_left_player2?.name;
            if (id === this.match.team_right_player2_id) return this.match.team_right_player2?.name;
            return '';
        },

        // --- PLAYING ---

        isServing(side) {
            if (!this.match || !this.match.current_server_id) return false;
            if (side === 'left') {
                return this.match.current_server_id === this.match.player_left_id
                    || this.match.current_server_id === this.match.team_left_player2_id;
            }
            return this.match.current_server_id === this.match.player_right_id
                || this.match.current_server_id === this.match.team_right_player2_id;
        },

        isPlayerServing(playerId) {
            if (!this.match || !this.match.current_server_id || !playerId) return false;
            return this.match.current_server_id === playerId;
        },

        async updateScore(side, action) {
            if (this.loading || !this.match.id) return;
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/matches/${this.match.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ side, action }),
                });
                const data = await res.json();
                this.match = data;

                if (data.is_complete) {
                    this.stopTimer();
                    window.location.href = '/games/ping-pong/matches/' + data.id + '?from=game';
                }
            } catch (err) {
                console.error('Error updating score:', err);
            }
            this.loading = false;
        },

        // --- NAVIGATION ---

        handleKeydown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (this.showAbandonConfirm) {
                if (e.key === 'Escape' || e.key === 'Backspace') {
                    e.preventDefault();
                    this.showAbandonConfirm = false;
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.abandonMatch();
                }
                return;
            }

            switch (this.screen) {
                case 'home':
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.startLobbyMatch();
                    } else if (e.key === 'Backspace') {
                        e.preventDefault();
                        window.location.href = '/';
                    }
                    break;
                case 'playing':
                    this.handlePlayingNav(e);
                    break;
            }
        },

        handlePlayingNav(e) {
            if (this.loading || this.readOnly) return;
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.updateScore('left', 'increment');
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.updateScore('left', 'decrement');
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.updateScore('right', 'increment');
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.updateScore('right', 'decrement');
                    break;
                case 'Backspace':
                    e.preventDefault();
                    this.showAbandonConfirm = true;
                    break;
            }
        },

        async cancelLobby() {
            if (this.lobbyCode && this.hostToken) {
                try {
                    await fetch(`${this.API}/lobbies/${this.lobbyCode}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                        body: JSON.stringify({ host_token: this.hostToken }),
                    });
                } catch (err) {
                    // Silently ignore
                }
            }
            this.goToHome();
        },

        async abandonMatch() {
            this.showAbandonConfirm = false;
            if (this.match?.id) {
                try {
                    await fetch(`${this.API}/matches/${this.match.id}`, {
                        method: 'DELETE',
                        headers: { 'X-CSRF-TOKEN': this.csrf },
                    });
                } catch (e) {
                    // Continue with local cleanup even if API fails
                }
            }
            this.stopTimer();
            this.destroyLivePlayer();
            this.goToHome();
        },

        async goToHome() {
            this.destroyLivePlayer();
            this.unsubscribeAll();
            this.match = {};
            this.eloPreview = null;
            this.lobbyCode = '';
            this.hostToken = '';
            this.lobbyParticipants = [];
            this.stopTimer();
            this.timerDisplay = '00:00';
            this.leaderboardTab = 'all';
            await this.loadLeaderboard();
            await this.loadLiveMatches();
            this.subscribeLive();
            this.screen = 'home';
            await this.createLobby();
        },

        initLivePlayer(hlsUrl) {
            this.$nextTick(() => {
                const video = document.getElementById('livePlayer');
                if (!video) return;
                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    this.hlsInstance = new Hls({
                        liveSyncDuration: 3,
                        liveMaxLatencyDuration: 6,
                        enableWorker: true,
                    });
                    this.hlsInstance.loadSource(hlsUrl);
                    this.hlsInstance.attachMedia(video);
                    this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play());
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = hlsUrl;
                    video.play();
                }
            });
        },

        destroyLivePlayer() {
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },
    };
}
</script>
@endsection
