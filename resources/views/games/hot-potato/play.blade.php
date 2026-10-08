@extends('layouts.app')

@section('title', 'Hot Potato - Games Hub')

@section('content')
    {{--
        The component comes from the hot potato sidecar, built from
        game-server/src/client at its startup. It is a classic, blocking script
        on purpose: it must define hotPotatoApp before Alpine (deferred) starts.
        If the sidecar is down, the stub below shows that instead of a broken page.
    --}}
    <script src="{{ url('/games/hot-potato/live/client.js') }}"></script>
    <script>
        window.hotPotatoApp = window.hotPotatoApp || (() => ({ unavailable: true }));
    </script>

    @php
        $config = [
            'offices' => $offices,
            'players' => $players,
            'csrf' => csrf_token(),
            'urls' => [
                'pushConfig' => url('/push/config'),
                'pushSubscribe' => url('/push/hot-potato/subscribe'),
                'pushUnsubscribe' => url('/push/hot-potato/unsubscribe'),
            ],
        ];
    @endphp

    <div x-data="hotPotatoApp(@js($config))" x-cloak>
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">🥔 Hot Potato</h1>
                <p class="text-white/50 text-sm">Bump someone to pass the potato. Whoever holds it when it blows is out.</p>
            </div>
            <a href="{{ url('/leaderboards/hot-potato') }}" class="text-sm text-indigo-300 hover:text-indigo-200">Leaderboard →</a>
        </div>

        <template x-if="unavailable">
            <div class="bg-red-500/15 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3">
                The hot potato server isn’t running right now. Try again in a minute.
            </div>
        </template>

        <template x-if="!unavailable">
            <div>
                {{-- Who and where --}}
                <div class="grid sm:grid-cols-2 gap-3 mb-6">
                    <label class="block">
                        <span class="block text-xs font-medium text-white/60 mb-1">Office</span>
                        <select x-model="officeId"
                                class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-orange-400">
                            <option value="" class="bg-slate-800">Pick your office…</option>
                            <template x-for="office in offices" :key="office.id">
                                <option :value="String(office.id)" x-text="office.name" class="bg-slate-800"></option>
                            </template>
                        </select>
                    </label>
                    <label class="block">
                        <span class="block text-xs font-medium text-white/60 mb-1">You are</span>
                        <select x-model="playerId" :disabled="!officeId"
                                class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-orange-400 disabled:opacity-40">
                            <option value="" class="bg-slate-800">Just watching</option>
                            <template x-for="player in officePlayers" :key="player.id">
                                <option :value="String(player.id)" x-text="player.name" class="bg-slate-800"></option>
                            </template>
                        </select>
                    </label>
                </div>

                <div x-show="status === 'connecting' || status === 'offline'"
                     class="mb-4 text-sm text-amber-300"
                     x-text="status === 'offline' ? 'Lost the connection — reconnecting…' : 'Connecting…'"></div>

                <div x-show="error" x-transition
                     class="mb-4 bg-red-500/15 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3"
                     x-text="error"></div>

                <template x-if="!officeId">
                    <x-empty-state icon="🏢" title="Pick your office" message="Each office has its own game." />
                </template>

                {{-- Nobody is hosting --}}
                <template x-if="officeId && status === 'online' && !session">
                    <div class="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
                        <div class="text-5xl mb-3">🥔</div>
                        <p class="text-white/70 mb-4">No game right now.</p>
                        <template x-if="me && canPlay">
                            <button @click="open()"
                                    class="bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg px-5 py-2.5 transition">
                                Open a hot potato
                            </button>
                        </template>
                        <p x-show="!me" class="text-sm text-white/50">Pick your name above to open a game.</p>
                        <p x-show="me && !canPlay" class="text-sm text-white/50">Play from a computer 💻 — it’s keyboard only.</p>
                    </div>
                </template>

                {{-- Lobby --}}
                <template x-if="session && phase === 'lobby'">
                    <div class="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h2 class="text-lg font-bold">
                                <span x-text="isHost ? 'You’re hosting' : hostName + ' is hosting'"></span>
                                <span class="text-white/50 font-normal text-sm" x-text="'· ' + session.players.length + ' / 12'"></span>
                            </h2>
                            <div class="flex gap-2">
                                <template x-if="me && !isMember && canPlay">
                                    <button @click="join()"
                                            class="bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg px-4 py-2 text-sm transition">Join</button>
                                </template>
                                <p x-show="me && !isMember && !canPlay" class="text-sm text-white/50 self-center">Play from a computer 💻</p>
                                <template x-if="isMember">
                                    <button @click="leave()"
                                            class="bg-white/10 hover:bg-white/20 rounded-lg px-4 py-2 text-sm transition">Leave</button>
                                </template>
                                <template x-if="isHost">
                                    <button @click="close()"
                                            class="bg-white/10 hover:bg-red-500/40 rounded-lg px-4 py-2 text-sm transition">Close game</button>
                                </template>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-2 mb-5">
                            <template x-for="player in session.players" :key="player.id">
                                <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm border"
                                      :class="player.away ? 'border-white/10 text-white/30' : 'border-white/20 bg-white/10'">
                                    <template x-if="player.avatarUrl">
                                        <img :src="player.avatarUrl" alt="" class="w-5 h-5 -ml-1.5 rounded-full object-cover"
                                             :style="'box-shadow: 0 0 0 2px ' + colourFor(player.id)">
                                    </template>
                                    <template x-if="!player.avatarUrl">
                                        <span class="w-2.5 h-2.5 rounded-full" :style="'background:' + colourFor(player.id)"></span>
                                    </template>
                                    <span x-text="player.name"></span>
                                    <span x-show="player.id === session.hostId" title="Host">👑</span>
                                    <span x-show="player.away" class="text-xs">(away)</span>
                                </span>
                            </template>
                        </div>

                        <template x-if="isHost">
                            <div class="mb-4" data-mode-picker>
                                <span class="block text-xs font-medium text-white/60 mb-1">Mode</span>
                                <div class="flex flex-wrap gap-2">
                                    <template x-for="option in modes" :key="option.id">
                                        <button @click="mode = option.id"
                                                :class="mode === option.id ? 'bg-orange-500 border-orange-400' : 'bg-white/5 border-white/15 text-white/60'"
                                                class="border rounded-lg px-4 py-2 text-sm font-semibold transition"
                                                x-text="option.label"></button>
                                    </template>
                                </div>
                            </div>
                        </template>
                        <p class="text-sm text-white/60 mb-4" data-mode-hint>
                            <span x-show="!isHost" class="font-semibold text-white/80" x-text="modes.find(m => m.id === gameMode)?.label + ' · '"></span>
                            <span x-text="modeHint"></span>
                        </p>

                        <template x-if="isHost">
                            <div class="flex flex-wrap items-end gap-4">
                                <div>
                                    <span class="block text-xs font-medium text-white/60 mb-1">Duration</span>
                                    <div class="flex gap-1">
                                        <template x-for="minutes in [1, 2, 3, 4, 5]" :key="minutes">
                                            <button @click="duration = minutes"
                                                    :class="duration === minutes ? 'bg-orange-500 border-orange-400' : 'bg-white/5 border-white/15 text-white/60'"
                                                    class="border rounded-lg w-11 py-2 text-sm font-semibold transition"
                                                    x-text="minutes + 'm'"></button>
                                        </template>
                                    </div>
                                </div>
                                <label>
                                    <span class="block text-xs font-medium text-white/60 mb-1">Arena</span>
                                    <select x-model="theme"
                                            class="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white">
                                        <option value="random" class="bg-slate-800">🎲 Surprise me</option>
                                        <template x-for="option in themes" :key="option.id">
                                            <option :value="option.id" x-text="option.label" class="bg-slate-800"></option>
                                        </template>
                                    </select>
                                </label>
                                <div>
                                    <button @click="start()" :disabled="!canStart"
                                            class="bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 text-white font-bold rounded-lg px-6 py-2 transition">
                                        Start
                                    </button>
                                    <p x-show="!canStart" class="text-xs text-white/40 mt-1">Needs at least 3 players.</p>
                                </div>
                            </div>
                        </template>
                        <p x-show="!isHost" class="text-sm text-white/50">Waiting for the host to start…</p>
                    </div>
                </template>

                {{-- The arena: countdown, play and results --}}
                <div x-show="session && phase !== 'lobby'">
                    <div class="flex items-center justify-between mb-2 text-sm">
                        <span class="font-mono text-lg font-bold" x-text="timerText"></span>
                        <span x-show="gameMode !== 'king'" class="text-white/60"><span x-text="aliveCount"></span> left</span>
                        {{-- King of the Potato: the live top three by time held --}}
                        <ol x-show="gameMode === 'king'" class="flex gap-3 text-white/70" data-king-board>
                            <template x-for="(entry, index) in kingBoard" :key="entry.id">
                                <li>
                                    <span x-text="index === 0 ? '👑' : '#' + (index + 1)"></span>
                                    <span class="font-semibold" :class="index === 0 && 'text-yellow-300'" x-text="entry.name"></span>
                                    <span class="font-mono" x-text="entry.seconds + 's'"></span>
                                </li>
                            </template>
                        </ol>
                    </div>
                    <div class="relative rounded-xl overflow-hidden border border-white/10 bg-black/30">
                        <canvas x-ref="canvas" class="block w-full"></canvas>

                        <div x-show="phase === 'countdown' && countdownLeft > 0"
                             class="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                            <span class="text-8xl font-extrabold" x-text="countdownLeft"></span>
                        </div>

                        <div x-show="banner" x-transition.opacity
                             class="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                            <span class="px-5 py-2 rounded-full text-xl font-extrabold shadow-lg"
                                  :class="bannerFlash ? 'bg-orange-500 animate-pulse' : 'bg-black/70'"
                                  x-text="banner"></span>
                        </div>

                        <template x-if="phase === 'results' && results">
                            <div class="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
                                <div class="bg-slate-900/95 border border-white/10 rounded-xl p-5 w-full max-w-md">
                                    <h2 class="text-xl font-extrabold mb-3 text-center" x-text="results.headline"></h2>
                                    <table class="w-full text-sm">
                                        <thead class="text-white/40 text-xs">
                                            <tr><th class="text-left py-1"></th><th class="text-left">Player</th><th class="text-right">Held</th><th class="text-right" x-text="results.mode === 'king' ? 'Steals' : 'Passes'"></th></tr>
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
                                    <p class="text-xs text-white/40 text-center mt-3">Back to the lobby in a few seconds…</p>
                                </div>
                            </div>
                        </template>
                    </div>
                    <p class="text-xs text-white/40 mt-2" x-show="isMember">Move with the arrow keys or WASD.</p>
                </div>

                {{-- Push opt-in --}}
                <div x-show="alerts.available && playerId" class="mt-8 flex flex-wrap items-center gap-3 text-sm text-white/60">
                    <button @click="toggleAlerts()" :disabled="alerts.busy"
                            class="bg-white/10 hover:bg-white/20 rounded-lg px-4 py-2 transition disabled:opacity-50"
                            x-text="alerts.on ? '🔕 Stop telling me when a game opens' : '🔔 Notify me when a game opens'"></button>
                    <span x-show="alerts.message" class="text-red-300" x-text="alerts.message"></span>
                </div>
            </div>
        </template>
    </div>
@endsection
