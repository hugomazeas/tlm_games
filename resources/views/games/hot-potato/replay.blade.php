@extends('layouts.app')

@section('title', 'Hot Potato replay - Games Hub')

@section('content')
    {{--
        Like the live page, the player comes from the hot potato sidecar, built
        from game-server/src/client at its startup: a blocking classic script, so
        hotPotatoReplay exists before Alpine starts. The stub covers a sidecar that's down.
    --}}
    <script src="{{ url('/games/hot-potato/live/replay.js') }}"></script>
    <script>
        window.hotPotatoReplay = window.hotPotatoReplay || (() => ({ status: 'missing' }));
    </script>

    <div x-data="hotPotatoReplay(@js(['dataUrl' => url("/games/hot-potato/replays/{$game->id}/data")]))" x-cloak>
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">🎬 Replay · {{ $game->modeLabel() }}</h1>
                <p class="text-white/50 text-sm">
                    {{ $game->arenaLabel() }}
                    @if($game->office) · {{ $game->office->name }} @endif
                    · <time datetime="{{ $game->ended_at->toIso8601String() }}">{{ $game->ended_at->toDayDateTimeString() }}</time>
                </p>
            </div>
            <a href="{{ url('/games/hot-potato') }}" class="text-sm text-indigo-300 hover:text-indigo-200">← Hot Potato</a>
        </div>

        <template x-if="status === 'loading'">
            <p class="text-sm text-white/50">Loading the replay…</p>
        </template>

        <template x-if="status === 'missing'">
            <div class="bg-red-500/15 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3" data-replay-missing>
                This replay is no longer available.
            </div>
        </template>

        <div x-show="status === 'ready'" class="grid lg:grid-cols-[1fr_16rem] gap-4">
            <div>
                <div class="flex items-center justify-between mb-2 text-sm">
                    <span class="font-mono text-lg font-bold" x-text="timerText"></span>
                    <span x-show="meta?.mode !== 'king'" class="text-white/60"><span x-text="aliveCount"></span><span x-text="meta?.mode === 'infection' ? ' clean' : ' left'"></span></span>
                </div>

                <div class="relative rounded-xl overflow-hidden border border-white/10 bg-black/30">
                    <canvas x-ref="canvas" class="block w-full mx-auto"></canvas>

                    <div x-show="countdownLeft > 0"
                         class="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <span class="text-8xl font-extrabold" x-text="countdownLeft"></span>
                    </div>

                    <div x-show="banner" x-transition.opacity
                         class="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                        <span class="px-5 py-2 rounded-full text-xl font-extrabold shadow-lg bg-black/70" x-text="banner"></span>
                    </div>

                    <template x-if="results">
                        <div class="absolute inset-0 flex items-center justify-center bg-black/35 p-4" data-replay-results>
                            <div class="bg-slate-900/95 border border-white/10 rounded-xl p-5 w-full max-w-md">
                                <h2 class="text-xl font-extrabold mb-3 text-center" x-text="results.headline"></h2>
                                <table class="w-full text-sm">
                                    <thead class="text-white/40 text-xs">
                                        <tr><th class="text-left py-1"></th><th class="text-left">Player</th><th class="text-right" x-text="results.mode === 'infection' ? 'Clean' : 'Held'"></th><th class="text-right" x-text="results.mode === 'king' ? 'Steals' : results.mode === 'killer' ? 'Catches' : results.mode === 'infection' ? 'Infected' : 'Passes'"></th></tr>
                                    </thead>
                                    <tbody>
                                        <template x-for="row in results.rows" :key="row.id">
                                            <tr :class="row.survived ? 'text-white' : 'text-white/60'">
                                                <td class="py-1 w-10" x-text="row.place"></td>
                                                <td>
                                                    <span class="inline-flex items-center gap-2">
                                                        <x-player-avatar-js name="row.name" url="avatarOf(row.id)" size="xs" class="!w-5 !h-5 !text-[9px]" />
                                                        <span x-text="row.name"></span>
                                                    </span>
                                                </td>
                                                <td class="text-right" x-text="row.holdSeconds + 's'"></td>
                                                <td class="text-right" x-text="row.passes"></td>
                                            </tr>
                                        </template>
                                    </tbody>
                                </table>
                                <div class="mt-4 text-center">
                                    <button type="button" @click="play()"
                                            class="bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg px-5 py-2 text-sm transition">
                                        ↻ Replay again
                                    </button>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>

                {{-- Controls: play/pause, ±5 s, speed, and the scrub bar with a tick per boom --}}
                <div class="mt-3 flex flex-wrap items-center gap-2" data-replay-controls>
                    <button type="button" @click="togglePlay()" title="Play / pause (Space)"
                            class="bg-orange-500 hover:bg-orange-400 rounded-lg w-10 h-9 font-bold transition"
                            x-text="playing ? '❚❚' : '▶'"></button>
                    <button type="button" @click="skip(-5000)" title="Back 5 s (←)"
                            class="bg-white/10 hover:bg-white/20 rounded-lg px-3 h-9 text-sm transition">−5s</button>
                    <button type="button" @click="skip(5000)" title="Forward 5 s (→)"
                            class="bg-white/10 hover:bg-white/20 rounded-lg px-3 h-9 text-sm transition">+5s</button>
                    <div class="flex gap-1 ml-1">
                        <template x-for="option in speeds" :key="option">
                            <button type="button" @click="setSpeed(option)"
                                    :class="speed === option ? 'bg-orange-500 border-orange-400' : 'bg-white/5 border-white/15 text-white/60'"
                                    class="border rounded-lg px-2.5 h-9 text-sm font-semibold transition"
                                    x-text="option + '×'"></button>
                        </template>
                    </div>
                </div>
                <div class="relative mt-3 h-6">
                    <input type="range" class="absolute inset-0 w-full accent-orange-500" aria-label="Replay position"
                           :min="startMs" :max="endMs" step="50" :value="currentMs"
                           @input="seek(Number($event.target.value))">
                    <template x-for="boom in booms" :key="boom.atMs + ':' + boom.playerId">
                        <span class="absolute top-0 w-0.5 h-1.5 bg-red-500 pointer-events-none"
                              :style="'left:' + ((boom.atMs - startMs) / Math.max(1, endMs - startMs) * 100) + '%'"></span>
                    </template>
                </div>
                <p class="text-xs text-white/40 mt-1">Space plays or pauses, ← → jump 5 seconds. Click a player to follow them.</p>
            </div>

            <aside class="space-y-4">
                <div>
                    <h2 class="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Players</h2>
                    <ul class="space-y-1" data-replay-roster>
                        <template x-for="p in players" :key="p.id">
                            <li>
                                <button type="button" @click="follow(p.id)"
                                        :class="followId === p.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-transparent hover:bg-white/10'"
                                        class="w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm text-left transition">
                                    <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background:' + colourOf(p)"></span>
                                    <span x-show="p.bot" title="AI">🤖</span>
                                    <span class="truncate" x-text="p.name"></span>
                                    <span x-show="followId === p.id" class="ml-auto text-xs text-white/50">following</span>
                                </button>
                            </li>
                        </template>
                    </ul>
                </div>
                <div x-show="booms.length > 0">
                    <h2 class="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2" x-text="meta?.mode === 'killer' ? 'Catches' : 'Booms'"></h2>
                    <ul class="space-y-1" data-replay-booms>
                        <template x-for="boom in booms" :key="boom.atMs + ':' + boom.playerId">
                            <li class="flex items-center gap-2 text-sm">
                                <span class="font-mono text-xs text-white/40 w-10" x-text="boom.clock"></span>
                                <span class="truncate" x-text="(meta?.mode === 'killer' ? '🔪 ' : '💥 ') + boom.label"></span>
                                <button type="button" @click="beforeBoom(boom.atMs)"
                                        class="ml-auto shrink-0 rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-xs transition">▶ 3 s before</button>
                            </li>
                        </template>
                    </ul>
                </div>
            </aside>
        </div>
    </div>
@endsection
