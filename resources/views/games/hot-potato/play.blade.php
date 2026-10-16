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
                'locker' => url('/games/hot-potato/locker'),
            ],
        ];
    @endphp

    <style>
        /* The chat's scrollbar: thin and quiet, brighter under the pointer. */
        .chat-scroll { scrollbar-width: thin; scrollbar-color: rgb(255 255 255 / 0.18) transparent; }
        .chat-scroll::-webkit-scrollbar { width: 6px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: rgb(255 255 255 / 0.18); border-radius: 9999px; }
        .chat-scroll::-webkit-scrollbar-thumb:hover { background: rgb(251 146 60 / 0.6); }
    </style>

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
                        <select x-model="officeId" :disabled="pickersLocked"
                                :title="pickersLocked ? 'Locked until this game is over' : ''"
                                class="disabled:opacity-40 w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-orange-400">
                            <option value="" class="bg-slate-800">Pick your office…</option>
                            <template x-for="office in offices" :key="office.id">
                                <option :value="String(office.id)" x-text="office.name" class="bg-slate-800"></option>
                            </template>
                        </select>
                    </label>
                    <label class="block">
                        <span class="flex items-center justify-between text-xs font-medium text-white/60 mb-1">
                            You are
                            <a x-show="playerId" :href="'{{ url('/games/hot-potato/locker') }}/' + playerId"
                               class="text-indigo-300 hover:text-indigo-200" data-locker-link>🎨 Locker</a>
                        </span>
                        <select x-model="playerId" :disabled="!officeId || pickersLocked"
                                :title="pickersLocked ? 'Locked until this game is over' : ''"
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

                {{-- Lobby and arena: what goes full screen (F, or ⛶) --}}
                <div x-ref="stage" data-stage
                     :class="fullscreen && 'gradient-bg overflow-y-auto p-4 sm:p-6'">
                <div class="grid lg:grid-cols-[minmax(0,1fr)_19rem] gap-6 items-start">
                <div class="min-w-0">
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
                                    <button @click="addBot()" :disabled="!canAddBot" data-add-bot
                                            class="bg-white/10 hover:bg-white/20 disabled:text-white/30 rounded-lg px-4 py-2 text-sm transition">🤖 Add AI</button>
                                </template>
                                <template x-if="isHost">
                                    <button @click="close()"
                                            class="bg-white/10 hover:bg-red-500/40 rounded-lg px-4 py-2 text-sm transition">Close game</button>
                                </template>
                                <button @click="toggleFullscreen()" data-fullscreen
                                        :title="fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'"
                                        class="bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm transition"
                                        x-text="fullscreen ? '⤡' : '⛶'"></button>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-2 mb-5">
                            <template x-for="player in session.players" :key="player.id">
                                <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm border"
                                      :class="player.away ? 'border-white/10 text-white/30' : 'border-white/20 bg-white/10'">
                                    <template x-if="player.avatarUrl">
                                        <img :src="player.avatarUrl" alt="" class="w-5 h-5 -ml-1.5 rounded-full object-cover"
                                             :style="'box-shadow: 0 0 0 2px ' + colourOf(player)">
                                    </template>
                                    <template x-if="!player.avatarUrl">
                                        <span class="w-2.5 h-2.5 rounded-full" :style="'background:' + colourOf(player)"></span>
                                    </template>
                                    <span x-show="player.bot" title="AI">🤖</span>
                                    <span x-show="hatOf(player)" x-text="hatOf(player)"></span>
                                    <span x-text="player.name"></span>
                                    <span x-show="player.id === session.hostId" title="Host">👑</span>
                                    <span x-show="player.away" class="text-xs">(away)</span>
                                    <template x-if="player.bot && isHost">
                                        <button @click="removeBot(player.id)" title="Remove this AI" data-remove-bot
                                                class="-mr-1 text-white/40 hover:text-white transition">✕</button>
                                    </template>
                                </span>
                            </template>
                        </div>

                        {{-- Your potato, quick: the rest of your look is in the locker --}}
                        <template x-if="isMember">
                            <div class="mb-4" data-skin-picker>
                                <span class="block text-xs font-medium text-white/60 mb-1">Your potato</span>
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <template x-for="option in skins" :key="option.id">
                                        <button type="button" @click="pickSkin(option.id)" :disabled="look.busy" :title="option.label"
                                                :class="myLook.skin === option.id ? 'bg-orange-500/30 border-orange-400' : 'bg-white/5 border-white/15 hover:bg-white/10'"
                                                class="w-10 h-10 rounded-lg border text-xl transition disabled:opacity-50"
                                                :style="option.id === 'gold' ? 'text-shadow: 0 0 8px #facc15' : ''"
                                                x-text="option.value"></button>
                                    </template>
                                    <a :href="lockerUrl" class="ml-1 text-xs text-indigo-300 hover:text-indigo-200">Colour, hat & more →</a>
                                </div>
                                <p x-show="look.error === 'locked'" class="mt-1 text-xs text-amber-300">
                                    Claim or unlock your profile to change your look: <a :href="lockerUrl" class="underline">open your locker</a>.
                                </p>
                                <p x-show="look.error === 'failed'" class="mt-1 text-xs text-red-300">Couldn’t save that. Try again.</p>
                            </div>
                        </template>

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
                                    <p x-show="!canStart && mode !== 'killer' && mode !== 'infection'" class="text-xs text-white/40 mt-1">Needs at least 3 players. Alone? Add 2 AIs or more.</p>
                                    <p x-show="mode === 'infection'" class="text-xs text-white/40 mt-1">People only: 3 or more. Added AIs sit out, and the arena is extra big.</p>
                                    <p x-show="mode === 'killer'" class="text-xs text-white/40 mt-1">You against the AI hunter: one person is enough, added AIs sit out.</p>
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
                        <span class="flex items-center gap-3">
                            <span x-show="gameMode !== 'king'" class="text-white/60"><span x-text="aliveCount"></span><span x-text="gameMode === 'infection' ? ' clean' : ' left'"></span></span>
                            <span x-show="watcherCount > 0" class="text-white/60" :title="watcherCount + ' watching'">👀 <span x-text="watcherCount"></span></span>
                            <button @click="toggleFullscreen()" data-fullscreen
                                    :title="fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'"
                                    class="bg-white/10 hover:bg-white/20 rounded-lg px-2.5 py-1 text-sm transition"
                                    x-text="fullscreen ? '⤡' : '⛶'"></button>
                        </span>
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
                        <canvas x-ref="canvas" class="block w-full mx-auto"></canvas>

                        {{-- Countdown: first the reveal (mode, its rule, the arena), then 3 · 2 · 1 --}}
                        <div x-show="showIntro" x-transition.opacity data-countdown-intro
                             class="absolute inset-0 flex items-center justify-center bg-black/55 p-4 pointer-events-none">
                            <div class="text-center">
                                <p class="text-xs uppercase tracking-[0.3em] text-white/50 mb-2">Next up</p>
                                <p class="text-4xl sm:text-5xl font-extrabold mb-2 drop-shadow" x-text="intro?.mode"></p>
                                <p class="text-white/80 text-lg mb-4" x-text="intro?.hint"></p>
                                <span class="inline-block rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-sm font-semibold" x-text="intro?.arena"></span>
                            </div>
                        </div>
                        <div x-show="phase === 'countdown' && countdownLeft > 0 && !showIntro"
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
                            <div class="absolute inset-0 flex items-center justify-center bg-black/35 p-4">
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
                                                            <span x-show="lastEmotes[row.id]" x-text="lastEmotes[row.id]" class="text-base leading-none"></span>
                                                        </span>
                                                    </td>
                                                    <td class="text-right" x-text="row.holdSeconds + 's'"></td>
                                                    <td class="text-right" x-text="row.passes"></td>
                                                </tr>
                                            </template>
                                        </tbody>
                                    </table>
                                    {{-- End-of-game emotes: only the game's own players get the buttons --}}
                                    <div x-show="canEmote" class="mt-4 flex flex-wrap justify-center gap-1.5" data-emote-bar>
                                        <template x-for="option in emotes" :key="option">
                                            <button type="button" @click="emote(option)"
                                                    class="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 active:scale-90 text-xl transition"
                                                    :aria-label="'React ' + option" x-text="option"></button>
                                        </template>
                                    </div>
                                    <div x-show="replayUrl" class="mt-4 text-center" data-watch-replay>
                                        <a :href="replayUrl" target="_blank" rel="noopener"
                                           class="inline-block bg-white/10 hover:bg-white/20 rounded-lg px-4 py-2 text-sm font-semibold transition">▶ Watch replay</a>
                                    </div>
                                    <div class="mt-4 text-center" data-back-to-lobby>
                                        <template x-if="isHost">
                                            <button type="button" @click="backToLobby()"
                                                    class="bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg px-5 py-2 text-sm transition">
                                                Back to lobby <span class="font-normal text-white/70" x-show="countdownLeft > 0" x-text="'(' + countdownLeft + ')'"></span>
                                            </button>
                                        </template>
                                        <p x-show="!isHost" class="text-xs text-white/40"
                                           x-text="'Waiting for ' + hostName + '… back to the lobby in ' + countdownLeft + 's'"></p>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>
                    <p class="text-xs text-white/40 mt-2" x-show="isMember">Move with the arrow keys or WASD.</p>
                    {{-- What everything on the floor does --}}
                    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50" data-item-legend>
                        <template x-for="entry in itemLegend" :key="entry.kind">
                            <li><span class="mr-1" x-text="entry.icon"></span><span x-text="entry.label"></span></li>
                        </template>
                        <li><span class="mr-1 text-cyan-300">»</span><span x-text="padLegend"></span></li>
                    </ul>
                </div>
                </div>

                {{-- Who's watching, and the office's chat: messages and what the game narrates --}}
                {{-- Full screen: the column runs the screen's height and the chat takes all of it under Watching --}}
                <aside x-show="officeId && status === 'online'" class="space-y-4 lg:sticky lg:top-4" data-chat-column
                       :class="fullscreen && 'lg:h-[calc(100vh-3rem)] lg:flex lg:flex-col'">
                    <section class="bg-white/5 border border-white/10 rounded-xl p-4" data-watchers>
                        <h2 class="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
                            👀 Watching <span class="text-white/40 normal-case font-normal" x-text="'· ' + watcherCount"></span>
                        </h2>
                        <ul class="flex flex-wrap gap-1.5 text-sm">
                            <template x-for="watcher in watchers.named" :key="watcher.id">
                                <li class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5">
                                    <span class="w-2 h-2 rounded-full" :style="'background:' + colourOf(watcher)"></span>
                                    <span x-show="hatOf(watcher)" x-text="hatOf(watcher)"></span>
                                    <span x-text="watcher.name"></span>
                                </li>
                            </template>
                            <li x-show="watchers.guests > 0" class="rounded-full border border-white/15 px-2.5 py-0.5 text-white/60"
                                x-text="(watchers.named.length ? '+ ' : '') + watchers.guests + (watchers.guests === 1 ? ' guest' : ' guests')"></li>
                            <li x-show="watcherCount === 0" class="text-white/40 text-xs">Nobody else for now.</li>
                        </ul>
                    </section>

                    <section class="bg-white/5 border border-white/10 rounded-xl flex flex-col" data-chat
                             :class="fullscreen ? 'h-[28rem] lg:h-auto lg:flex-1 lg:min-h-0' : 'h-[28rem]'">
                        <h2 class="text-xs font-semibold uppercase tracking-wider text-white/50 px-4 pt-3 pb-2">💬 Chat</h2>
                        <ol x-ref="chat" class="chat-scroll flex-1 overflow-y-auto px-4 space-y-1.5 text-sm" aria-live="polite">
                            <template x-for="line in chatLines" :key="line.id">
                                <li x-show="line.kind === 'message' || chatText(line)" :class="line.kind === 'event' ? 'text-white/55 text-xs' : ''">
                                    <span class="text-[10px] text-white/30 font-mono mr-1" x-text="chatTime(line)"></span>
                                    <template x-if="line.kind === 'message'">
                                        <span>
                                            <span class="font-semibold" :style="'color:' + colourOf(line.author)" x-text="line.author.name"></span>
                                            <span class="text-white/90 break-words" x-text="line.body"></span>
                                        </span>
                                    </template>
                                    <template x-if="line.kind === 'event'">
                                        <span>
                                            <span x-text="chatText(line)"></span>
                                            <a x-show="replayLink(line)" :href="replayLink(line)" target="_blank" rel="noopener"
                                               class="ml-1 font-semibold text-indigo-300 hover:text-indigo-200" x-text="chatStrings.watchReplay"></a>
                                        </span>
                                    </template>
                                </li>
                            </template>
                        </ol>
                        <form @submit.prevent="sendChat()" class="p-3 border-t border-white/10" data-chat-form>
                            <template x-if="me">
                                <input x-model="chatDraft" :maxlength="chatMaxLength" :placeholder="chatStrings.placeholder"
                                       class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-400">
                            </template>
                            <p x-show="!me" class="text-xs text-white/50" x-text="chatStrings.pickName"></p>
                        </form>
                    </section>
                </aside>
                </div>
                </div>

                {{-- The office's recent games, each with its replay while it lasts --}}
                @foreach($recentGames as $officeId => $games)
                    <section x-show="officeId === '{{ $officeId }}'" class="mt-8">
                        <h2 class="text-base font-bold mb-3">Recent games</h2>
                        @include('games.hot-potato.partials.game-list', ['games' => $games])
                    </section>
                @endforeach

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
