@extends('layouts.app')

@section('title', 'Watch Live - Ping Pong')
@section('main-class', 'p-0')

@section('content')
@include('games.ping-pong.partials.chrome')

<div class="pph-stage w-full h-screen max-h-[calc(100dvh-60px)] flex flex-col md:flex-row !rounded-none !p-0" x-data="watchLive()" x-init="init()">
<div class="relative flex-1 min-w-0 min-h-0 flex items-center justify-center">

    {{-- ===== Match start alerts ===== --}}
    <div x-show="showMatchAlertsBanner()" x-cloak x-transition.opacity data-match-alerts-banner
         class="absolute z-30 top-14 inset-x-4 md:top-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[min(560px,calc(100%-2rem))] flex flex-col gap-1.5 px-4 py-3 rounded-xl bg-[#06081b]/90 border border-[#ffd166]/40 backdrop-blur-sm shadow-lg">
        <div class="flex items-center gap-3">
            <span class="text-xl leading-none">🔔</span>
            <p class="flex-1 min-w-0 text-[13px] leading-snug text-[#f5ecd6]">
                Get a notification when a match starts — no need to keep this page open.
            </p>
            <button type="button" @click="enableMatchAlerts()" :disabled="matchAlertsBusy"
                    class="flex-shrink-0 px-4 py-1.5 rounded-full bg-[#ffd166] text-[#06081b] pph-display text-sm tracking-[0.04em] uppercase hover:bg-white transition disabled:opacity-50">
                <span x-text="matchAlertsBusy ? '…' : 'Notify me'"></span>
            </button>
            <button type="button" @click="dismissMatchAlerts()" aria-label="Dismiss"
                    class="flex-shrink-0 w-7 h-7 rounded-full text-[#f5ecd6]/50 hover:text-[#f5ecd6] hover:bg-white/10 transition">✕</button>
        </div>
        <p x-show="matchAlertsMessage" class="pph-mono text-[11px] text-[#ff5a4a]" x-text="matchAlertsMessage"></p>
    </div>

    {{-- No live match --}}
    <template x-if="!matchActive">
        <div class="text-center text-[#f5ecd6]/70">
            <div class="text-5xl mb-4">🏓</div>
            <h2 class="pph-display text-[clamp(28px,3vw,40px)] tracking-[0.04em] uppercase text-[#f5ecd6] mb-2">No live match</h2>
            <p class="pph-mono text-[12px] tracking-[0.14em] uppercase text-[#f5ecd6]/45 mb-5">No match is being played right now.</p>
            <p class="pph-mono text-[10px] tracking-[0.2em] uppercase text-[#f5ecd6]/30" x-text="liveConnected ? 'Live — the stream will appear here as soon as a match starts' : 'Reconnecting…'" data-live-status></p>
            <p x-show="matchAlertsOn" x-cloak class="mt-4 pph-mono text-[11px] tracking-[0.14em] uppercase text-[#ffd166]/80" data-match-alerts-on>
                🔔 You'll get a notification when a match starts ·
                <button type="button" @click="disableMatchAlerts()" :disabled="matchAlertsBusy"
                        class="underline uppercase hover:text-[#ffd166]">Turn off</button>
            </p>
            <p x-show="!showMatchAlertsBanner() && matchAlertsMessage" class="mt-2 pph-mono text-[11px] text-[#ff5a4a]" x-text="matchAlertsMessage"></p>
            <a href="/games/ping-pong"
               class="inline-block mt-5 px-5 py-2 rounded-full bg-[#f5ecd6] text-[#06081b] no-underline pph-display text-base tracking-[0.04em] uppercase hover:bg-white transition">
                ← Back to Ping Pong
            </a>
        </div>
    </template>

    {{-- Match active --}}
    <template x-if="matchActive">
        <div class="relative w-full h-full flex items-center justify-center">
            {{-- Video --}}
            <video x-show="hasVideo" id="watchPlayer" muted autoplay playsinline
                   class="w-full h-full object-contain bg-black absolute inset-0 -scale-x-100"></video>

            {{-- Browsers only autoplay muted: one click turns the sound on for the rest of the visit. --}}
            <button type="button" x-show="hasVideo && !audioOn" @click="enableAudio()" data-audio-enable
                    class="absolute z-20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-3 px-7 py-4 rounded-full bg-[#ffd166] text-[#06081b] border-0 cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:bg-white hover:scale-105 transition">
                <span class="absolute inset-0 rounded-full bg-[#ffd166] animate-ping opacity-40 pointer-events-none"></span>
                <svg class="relative" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
                <span class="relative pph-display text-[clamp(18px,2.2vw,26px)] tracking-[0.04em] uppercase">Click to turn on sound</span>
            </button>

            {{-- Score-only mode --}}
            <template x-if="!hasVideo">
                <div class="flex flex-col items-center gap-6">
                    <div class="flex items-center gap-8">
                        <div class="text-center">
                            <div class="text-[#ff5a4a] text-[1.6rem] font-bold pph-glow-red" x-text="match?.player_left?.name || 'Left'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_left_player2">
                                <div class="text-[#ff5a4a]/70 text-base font-medium" x-text="match.team_left_player2.name"></div>
                            </template>
                        </div>
                        <div class="flex items-center gap-3 pph-mono tabular-nums">
                            <span class="text-white text-[5rem] font-extrabold" x-text="match?.player_left_score ?? 0"></span>
                            <span class="text-white/20 text-5xl">·</span>
                            <span class="text-white text-[5rem] font-extrabold" x-text="match?.player_right_score ?? 0"></span>
                        </div>
                        <div class="text-center">
                            <div class="text-[#3ec8ff] text-[1.6rem] font-bold pph-glow-blue" x-text="match?.player_right?.name || 'Right'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_right_player2">
                                <div class="text-[#3ec8ff]/70 text-base font-medium" x-text="match.team_right_player2.name"></div>
                            </template>
                        </div>
                    </div>
                    <div class="pph-mono text-[11px] tracking-[0.3em] uppercase text-[#f5ecd6]/30" x-text="match?.mode?.toUpperCase()"></div>
                    <div x-show="eloOpen" class="flex gap-6 items-start">
                        <div class="w-[320px]">@include('games.ping-pong.partials.elo-preview', ['side' => 'left'])</div>
                        <div class="w-[320px]">@include('games.ping-pong.partials.elo-preview', ['side' => 'right'])</div>
                    </div>
                </div>
            </template>

            {{-- LIVE badge, viewer count, and who just joined --}}
            <div class="absolute top-4 left-4 flex flex-col items-start gap-2">
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1.5 bg-black/70 px-3 py-1 rounded-md backdrop-blur-sm">
                        <span class="pph-flicker w-2 h-2 rounded-full bg-[#ff5a4a]"></span>
                        <span class="pph-mono text-white text-[11px] font-bold tracking-[0.18em]">LIVE</span>
                    </div>
                    <div x-show="viewerCount() > 0" data-viewer-count
                         class="flex items-center gap-1.5 bg-black/70 px-3 py-1 rounded-md backdrop-blur-sm pph-mono text-white text-[11px] font-bold tracking-[0.14em] uppercase"
                         :title="namedViewers().map(v => v.name).join(', ')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <span x-text="viewerCount() + ' watching'"></span>
                    </div>
                </div>
                <template x-for="join in viewerJoins" :key="join.key">
                    <div data-viewer-join
                         x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 -translate-x-2" x-transition:enter-end="opacity-100 translate-x-0"
                         class="bg-black/70 px-3 py-1 rounded-md backdrop-blur-sm pph-mono text-[11px] tracking-[0.12em] uppercase text-[#f5ecd6]/80">
                        <span class="text-[#ffd166] font-bold" x-text="join.name"></span> joined
                    </div>
                </template>
            </div>

            {{-- Corner scores over video --}}
            <template x-if="hasVideo && match">
                <div>
                    <div class="absolute bottom-6 left-6 flex flex-col items-center">
                        <div x-show="eloOpen" data-elo-card="left" class="w-[320px] mb-3">
                            @include('games.ping-pong.partials.elo-preview', ['side' => 'left'])
                        </div>
                        <span class="text-[#ff5a4a] text-[2.5rem] font-bold pph-glow-red [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]" x-text="match?.player_left?.name || 'Left'"></span>
                        <span x-show="isServingLeft()" class="pph-mono text-[#ffd166] text-[10px] tracking-[0.22em] font-bold [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">SERVING</span>
                        <span class="text-white text-[10rem] font-black leading-none pph-mono [text-shadow:0_4px_16px_rgba(0,0,0,0.8)]" x-text="match?.player_left_score ?? 0"></span>
                    </div>
                    <div class="absolute bottom-6 right-6 flex flex-col items-center">
                        <div x-show="eloOpen" data-elo-card="right" class="w-[320px] mb-3">
                            @include('games.ping-pong.partials.elo-preview', ['side' => 'right'])
                        </div>
                        <span class="text-[#3ec8ff] text-[2.5rem] font-bold pph-glow-blue [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]" x-text="match?.player_right?.name || 'Right'"></span>
                        <span x-show="isServingRight()" class="pph-mono text-[#ffd166] text-[10px] tracking-[0.22em] font-bold [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">SERVING</span>
                        <span class="text-white text-[10rem] font-black leading-none pph-mono [text-shadow:0_4px_16px_rgba(0,0,0,0.8)]" x-text="match?.player_right_score ?? 0"></span>
                    </div>
                </div>
            </template>

            {{-- Top-right chip cluster --}}
            <div class="absolute top-4 right-4 flex items-center gap-2">
                <button type="button" x-show="eloPreview" @click="toggleElo()" data-elo-toggle
                        class="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-black/70 text-white text-xs border-0 cursor-pointer backdrop-blur-sm pph-mono uppercase tracking-[0.12em]">
                    ELO <span x-text="eloOpen ? '▾' : '▸'"></span>
                </button>
                <button type="button" @click="shareEmbed()"
                        class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-black/70 text-white text-xs border-0 cursor-pointer backdrop-blur-sm pph-mono uppercase tracking-[0.12em]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    <span x-text="shareLabel"></span>
                </button>
                <a x-show="matchId" :href="'/games/ping-pong/matches/' + matchId + '/scoreboard'"
                   class="px-3 py-1 rounded-md bg-black/70 text-white no-underline text-xs backdrop-blur-sm pph-mono uppercase tracking-[0.12em]">Scoreboard →</a>
                <a href="/games/ping-pong"
                   class="px-3 py-1 rounded-md bg-black/70 text-white no-underline text-xs backdrop-blur-sm pph-mono uppercase tracking-[0.12em]">← Back</a>
            </div>
        </div>
    </template>
</div>

    {{-- ===== Viewer chat ===== --}}
    <button type="button" x-show="!chatOpen" @click="openChat()" data-chat-tab
            class="relative flex-shrink-0 md:w-11 h-11 md:h-full flex md:flex-col items-center justify-center gap-2 bg-[#06081b]/85 border-t md:border-t-0 md:border-l border-[#f5ecd6]/10 text-[#f5ecd6]/70 hover:text-[#f5ecd6] cursor-pointer">
        <span class="pph-mono text-[11px] font-bold tracking-[0.2em] uppercase md:[writing-mode:vertical-rl]">Chat</span>
        <span x-show="chatUnread > 0" class="min-w-5 h-5 px-1.5 rounded-full bg-[#ff5a4a] text-white pph-mono text-[10px] font-bold flex items-center justify-center" x-text="chatUnread"></span>
    </button>
    <aside x-show="chatOpen" data-chat-sidebar
           class="flex-shrink-0 w-full md:w-[340px] h-[45dvh] md:h-full flex flex-col gap-3 p-4 bg-[#06081b]/85 border-t md:border-t-0 md:border-l border-[#f5ecd6]/10">
        <header class="flex items-center justify-between flex-shrink-0">
            <span class="pph-mono text-[12px] font-bold tracking-[0.2em] uppercase text-[#f5ecd6]/80">Live chat</span>
            <button type="button" @click="closeChat()" class="bg-transparent border-0 text-[#f5ecd6]/50 hover:text-[#f5ecd6] cursor-pointer pph-mono text-[11px] uppercase tracking-[0.14em]">Hide →</button>
        </header>

        <template x-if="chatMatchId">
            @include('games.ping-pong.partials.viewers-list')
        </template>

        {{-- Who am I --}}
        <template x-if="chatPlayer">
            <p class="m-0 flex-shrink-0 pph-mono text-[11px] tracking-[0.1em] uppercase text-[#f5ecd6]/50">
                Chatting as <span class="text-[#ffd166] font-bold" x-text="chatPlayer.name"></span>
                · <button type="button" @click="changeChatPlayer()" class="bg-transparent border-0 p-0 text-[#f5ecd6]/70 underline cursor-pointer pph-mono text-[11px] uppercase tracking-[0.1em]">change</button>
            </p>
        </template>
        <template x-if="!chatPlayer">
            <form @submit.prevent="identifyChatPlayer()" class="flex-shrink-0 flex flex-col gap-2" data-chat-identify>
                <label for="chatName" class="pph-mono text-[11px] tracking-[0.14em] uppercase text-[#f5ecd6]/55">Pick your name to chat</label>
                <div class="flex gap-2">
                    <input id="chatName" type="text" list="chatPlayerOptions" x-model="chatNameInput" maxlength="255" autocomplete="off" placeholder="Your name"
                           class="flex-1 min-w-0 rounded-md bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 px-3 py-2 text-[#f5ecd6] text-sm placeholder:text-[#f5ecd6]/30 focus:outline-none focus:border-[#ffd166]/60">
                    <button type="submit" :disabled="!chatNameInput.trim() || chatBusy"
                            class="px-3 py-2 rounded-md bg-[#f5ecd6] text-[#06081b] border-0 cursor-pointer pph-mono text-[11px] font-bold uppercase tracking-[0.12em] disabled:opacity-40 disabled:cursor-default">Join</button>
                </div>
                <datalist id="chatPlayerOptions">
                    <template x-for="player in chatPlayerOptions" :key="'opt-' + player.id">
                        <option :value="player.name"></option>
                    </template>
                </datalist>
                <p class="m-0 pph-mono text-[10px] tracking-[0.1em] uppercase text-[#f5ecd6]/35">New name? We'll add you as a player.</p>
            </form>
        </template>

        @include('games.ping-pong.partials.chat-messages')

        {{-- /giphy preview: Slack style, one GIF at a time from the search results. --}}
        <template x-if="gifPicker">
            <div data-gif-picker class="flex-shrink-0 rounded-lg border border-[#ffd166]/30 bg-[#f5ecd6]/[0.04] p-2.5 flex flex-col gap-2">
                <div class="flex items-baseline justify-between gap-2 pph-mono text-[10px] tracking-[0.1em] uppercase">
                    <span class="text-[#f5ecd6]/60 truncate">/giphy <span class="text-[#ffd166] normal-case" x-text="gifPicker.query"></span></span>
                    <span class="text-[#f5ecd6]/35 flex-shrink-0" x-text="(gifPicker.index + 1) + ' / ' + gifPicker.results.length"></span>
                </div>
                <img :src="currentGif().preview_url" :alt="currentGif().title"
                     :style="`aspect-ratio: ${currentGif().width || 4} / ${currentGif().height || 3}`"
                     class="block w-full max-h-[180px] object-contain rounded-md bg-[#06081b]/60">
                <div class="flex items-center gap-2">
                    <span class="mr-auto pph-mono text-[9px] tracking-[0.14em] uppercase text-[#f5ecd6]/35">Powered by GIPHY</span>
                    <button type="button" @click="shuffleGif()" :disabled="gifPicker.results.length < 2"
                            class="px-2.5 py-1.5 rounded-md bg-[#f5ecd6]/[0.08] text-[#f5ecd6] border border-[#f5ecd6]/15 cursor-pointer pph-mono text-[10px] font-bold uppercase tracking-[0.12em] disabled:opacity-40 disabled:cursor-default">Shuffle</button>
                    <button type="button" @click="cancelGif()"
                            class="px-2.5 py-1.5 rounded-md bg-transparent text-[#f5ecd6]/70 border border-[#f5ecd6]/15 cursor-pointer pph-mono text-[10px] font-bold uppercase tracking-[0.12em]">Cancel</button>
                    <button type="button" @click="sendGif()" :disabled="chatBusy"
                            class="px-2.5 py-1.5 rounded-md bg-[#ffd166] text-[#06081b] border-0 cursor-pointer pph-mono text-[10px] font-bold uppercase tracking-[0.12em] disabled:opacity-40 disabled:cursor-default">Send</button>
                </div>
            </div>
        </template>

        <form @submit.prevent="sendChatMessage()" class="flex-shrink-0 flex flex-col gap-1.5" data-chat-composer>
            <div class="flex gap-2">
                <input type="text" x-model="chatDraft" maxlength="200" autocomplete="off"
                       :disabled="!chatPlayer || !chatMatchId" :placeholder="!chatMatchId ? 'Chat opens when a match starts' : (chatPlayer ? 'Say something… or /giphy cats' : 'Pick a name first')"
                       class="flex-1 min-w-0 rounded-md bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 px-3 py-2 text-[#f5ecd6] text-sm placeholder:text-[#f5ecd6]/30 focus:outline-none focus:border-[#ffd166]/60 disabled:opacity-50">
                <button type="submit" :disabled="!chatPlayer || !chatMatchId || !chatDraft.trim() || chatBusy"
                        class="px-3 py-2 rounded-md bg-[#ffd166] text-[#06081b] border-0 cursor-pointer pph-mono text-[11px] font-bold uppercase tracking-[0.12em] disabled:opacity-40 disabled:cursor-default">Send</button>
            </div>
            <div class="flex justify-between pph-mono text-[10px] tracking-[0.08em]">
                <span class="text-[#ff5a4a]" x-text="chatError"></span>
                <span class="text-[#f5ecd6]/30" x-text="chatDraft.length + '/200'"></span>
            </div>
        </form>
    </aside>

</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
@include('games.ping-pong.partials.elo-preview-script')
@include('games.ping-pong.partials.chat-script')
@include('games.ping-pong.partials.match-alerts-script')
@include('games.ping-pong.partials.viewers-script')
<script>
// Give up waiting for the stream to play out after the tail plus ~10s of stream latency and some slack.
const MATCH_END_FALLBACK_MS = ({{ (int) config('pingpong.recording_tail_seconds') }} + 25) * 1000;

function watchLive() {
    return {
        ...pingPongEloPreview(),
        ...pingPongChat(),
        ...pingPongMatchAlerts(),
        ...pingPongViewers(),

        API: '/games/ping-pong/api',
        csrf: document.querySelector('meta[name="csrf-token"]').content,
        matchActive: false,
        hasVideo: false,
        hlsInstance: null,
        audioOn: false,
        match: null,
        matchId: null,
        liveConnected: false,
        endingTimer: null,
        hlsNetworkErrorCount: 0,
        streamUrl: null,
        streamRetryTimer: null,
        checkingLiveMatch: false,
        echo: null,
        matchChannel: null,
        shareLabel: 'Share embed',

        eloOpen: localStorage.getItem('ping_pong_watch_elo_open') !== '0',

        chatOpen: localStorage.getItem('ping_pong_watch_chat_open') !== '0',
        chatUnread: 0,
        chatPlayer: JSON.parse(localStorage.getItem('ping_pong_chat_player') || 'null'),
        chatPlayerOptions: [],
        chatNameInput: '',
        chatDraft: '',
        chatError: '',
        chatBusy: false,
        gifPicker: null,

        // The ELO partial reads `mode`; on this page it follows the live match.
        get mode() {
            return this.match?.mode || '1v1';
        },

        toggleElo() {
            this.eloOpen = !this.eloOpen;
            localStorage.setItem('ping_pong_watch_elo_open', this.eloOpen ? '1' : '0');
        },

        openChat() {
            this.chatOpen = true;
            this.chatUnread = 0;
            localStorage.setItem('ping_pong_watch_chat_open', '1');
            this.scrollChatToBottom();
        },

        closeChat() {
            this.chatOpen = false;
            localStorage.setItem('ping_pong_watch_chat_open', '0');
        },

        onChatMessage() {
            if (!this.chatOpen) this.chatUnread++;
        },

        async loadChatPlayerOptions() {
            try {
                const res = await fetch(`${this.API}/players`);
                if (res.ok) this.chatPlayerOptions = await res.json();
            } catch (e) {
                // Autocomplete is a nicety; typing a name still works.
            }
        },

        setChatPlayer(player) {
            this.chatPlayer = player;
            if (player) {
                localStorage.setItem('ping_pong_chat_player', JSON.stringify(player));
            } else {
                localStorage.removeItem('ping_pong_chat_player');
            }
            // Clearing the name to pick another keeps the old one on the viewer list until then.
            if (player && player.id !== this.viewersPlayerId) this.rejoinViewers();
        },

        changeChatPlayer() {
            this.chatNameInput = this.chatPlayer?.name || '';
            this.setChatPlayer(null);
            if (!this.chatPlayerOptions.length) this.loadChatPlayerOptions();
        },

        async identifyChatPlayer() {
            const name = this.chatNameInput.trim();
            if (!name || this.chatBusy) return;
            this.chatBusy = true;
            this.chatError = '';
            try {
                const res = await fetch(`${this.API}/chat/identify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ name }),
                });
                const data = await res.json();
                if (!res.ok) {
                    this.chatError = data.errors?.name?.[0] || 'Could not use that name.';
                    return;
                }
                this.setChatPlayer({ id: data.id, name: data.name });
                this.chatNameInput = '';
            } catch (e) {
                this.chatError = 'Network error — try again.';
            } finally {
                this.chatBusy = false;
            }
        },

        async sendChatMessage() {
            const body = this.chatDraft.trim();
            if (!body || !this.chatPlayer || !this.chatMatchId || this.chatBusy) return;
            const giphy = body.match(/^\/giphy(?:\s+(.*))?$/i);
            if (giphy) {
                await this.searchGif((giphy[1] || '').trim());
                return;
            }
            await this.postChatMessage({ body });
        },

        /** Runs a /giphy search and opens the preview on its first result. */
        async searchGif(query) {
            if (!query) {
                this.chatError = 'Type something after /giphy.';
                return;
            }
            this.chatBusy = true;
            this.chatError = '';
            try {
                const params = new URLSearchParams({ q: query, player_id: this.chatPlayer.id });
                const res = await fetch(`${this.API}/chat/giphy?${params}`, { headers: { 'Accept': 'application/json' } });
                const data = await res.json().catch(() => ({}));
                if (res.status === 422 && data.errors?.player_id) {
                    this.setChatPlayer(null);
                    this.chatError = 'Pick your name again.';
                    this.loadChatPlayerOptions();
                    return;
                }
                if (!res.ok) {
                    this.chatError = data.errors?.q?.[0] || data.message || 'GIF search failed.';
                    return;
                }
                if (!data.length) {
                    this.chatError = `No GIFs for “${query}”.`;
                    return;
                }
                this.gifPicker = { query, results: data, index: 0 };
            } catch (e) {
                this.chatError = 'Network error — try again.';
            } finally {
                this.chatBusy = false;
            }
        },

        currentGif() {
            return this.gifPicker?.results[this.gifPicker.index] ?? null;
        },

        shuffleGif() {
            if (!this.gifPicker || this.gifPicker.results.length < 2) return;
            this.gifPicker = { ...this.gifPicker, index: (this.gifPicker.index + 1) % this.gifPicker.results.length };
        },

        cancelGif() {
            this.gifPicker = null;
        },

        async sendGif() {
            const gif = this.currentGif();
            if (!gif || this.chatBusy) return;
            const sent = await this.postChatMessage({ body: this.gifPicker.query, gif_id: gif.id });
            if (sent) this.gifPicker = null;
        },

        /** Posts a text or /giphy message; returns true once it's in the chat. */
        async postChatMessage(fields) {
            if (!this.chatPlayer || !this.chatMatchId || this.chatBusy) return false;
            this.chatBusy = true;
            this.chatError = '';
            try {
                const res = await fetch(`${this.API}/chat/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ match_id: this.chatMatchId, player_id: this.chatPlayer.id, ...fields }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.status === 429) {
                    this.chatError = 'Slow down — wait a few seconds.';
                    return false;
                }
                if (res.status === 422 && data.errors?.match_id) {
                    this.chatError = 'This match has ended.';
                    return false;
                }
                if (res.status === 422 && data.errors?.gif_id) {
                    this.gifPicker = null;
                    this.chatError = data.errors.gif_id[0];
                    return false;
                }
                if (res.status === 422 && data.errors?.player_id) {
                    // The saved player was deleted; ask for a name again.
                    this.setChatPlayer(null);
                    this.chatError = 'Pick your name again.';
                    this.loadChatPlayerOptions();
                    return false;
                }
                if (!res.ok) {
                    this.chatError = data.errors?.body?.[0] || 'Message not sent.';
                    return false;
                }
                this.addChatMessage(data);
                this.chatDraft = '';
                return true;
            } catch (e) {
                this.chatError = 'Network error — try again.';
                return false;
            } finally {
                this.chatBusy = false;
            }
        },

        ensureEcho() {
            if (this.echo) return;
            this.echo = new Echo({
                broadcaster: 'pusher',
                key: 'games-hub-key',
                wsHost: window.location.hostname,
                wsPort: window.location.port || 80,
                forceTLS: false,
                disableStats: true,
                enabledTransports: ['ws', 'wss'],
                cluster: 'mt1',
                channelAuthorization: { customHandler: (params, callback) => this.authorizeViewers(params, callback) },
            });
        },

        viewerIdentity() {
            return { role: 'viewer', player_id: this.chatPlayer?.id ?? null };
        },
        shareResetTimer: null,

        async shareEmbed() {
            const url = window.location.origin + '/games/ping-pong/embed-live';
            try {
                if (navigator.share) {
                    await navigator.share({ title: 'Ping Pong Live', url });
                    return;
                }
            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
            try {
                await navigator.clipboard.writeText(url);
                this.flashShareLabel('Copied!');
            } catch (e) {
                window.prompt('Copy embed link:', url);
            }
        },

        flashShareLabel(text) {
            this.shareLabel = text;
            if (this.shareResetTimer) clearTimeout(this.shareResetTimer);
            this.shareResetTimer = setTimeout(() => {
                this.shareLabel = 'Share embed';
            }, 1500);
        },

        async init() {
            if (!this.chatPlayer) this.loadChatPlayerOptions();
            this.initMatchAlerts();
            this.subscribeToLiveMatches();
            await this.checkForLiveMatch();
        },

        /**
         * Everything that changes what's on air arrives over the websocket: a match
         * starting, its stream coming up, scores and the end. Nothing is polled.
         */
        subscribeToLiveMatches() {
            this.ensureEcho();

            const connection = this.echo.connector.pusher.connection;
            let wasConnected = false;
            connection.bind('state_change', ({ current }) => {
                this.liveConnected = current === 'connected';
                if (current !== 'connected') return;
                // Events sent while we were offline are gone, so catch up once on reconnect.
                if (wasConnected) this.resyncLiveState();
                wasConnected = true;
            });

            this.echo.channel('ping-pong.live')
                .listen('.match.started', (e) => this.onLiveMatchStarted(e.match))
                .listen('.stream.ready', (e) => this.onStreamReady(e));
        },

        async onLiveMatchStarted(match) {
            if (!match || match.id === this.matchId) return;

            // The new match took the camera, so whatever we were showing is over.
            if (this.matchActive) {
                await this.handleMatchEnd();
                return;
            }

            await this.checkForLiveMatch();
        },

        /** ffmpeg has written the playlist: attach the player without a reload. */
        async onStreamReady(e) {
            if (!e?.hls_url) return;

            if (e.match_id === this.matchId) {
                if (!this.hasVideo) this.attachStream(e.hls_url);
                return;
            }

            if (this.matchActive) {
                await this.handleMatchEnd();
                return;
            }

            await this.checkForLiveMatch();
        },

        attachStream(hlsUrl) {
            this.hasVideo = true;
            this.hlsNetworkErrorCount = 0;
            this.$nextTick(() => this.initPlayer(hlsUrl));
        },

        async checkForLiveMatch() {
            if (this.checkingLiveMatch) return;
            this.checkingLiveMatch = true;
            try {
                // First check for a recording with video stream
                const recRes = await fetch('/games/ping-pong/api/recordings/live');
                if (recRes.ok) {
                    const recData = await recRes.json();
                    if (recData.active && recData.hls_url) {
                        this.match = recData.match;
                        this.matchId = recData.match_id;
                        this.matchActive = true;
                        this.attachStream(recData.hls_url);
                        this.subscribeToScores();
                        this.joinChat(this.matchId);
                        this.joinViewers(this.matchId);
                        this.loadEloPreview();
                        return;
                    }
                }

                // Fall back to any live match (score-only until `stream.ready` arrives)
                const liveRes = await fetch('/games/ping-pong/api/matches/live');
                if (liveRes.ok) {
                    const matches = await liveRes.json();
                    if (matches.length > 0) {
                        this.match = matches[0];
                        this.matchId = matches[0].id;
                        this.matchActive = true;
                        this.hasVideo = false;
                        this.subscribeToScores();
                        this.joinChat(this.matchId);
                        this.joinViewers(this.matchId);
                        this.loadEloPreview();
                        return;
                    }
                }
            } catch (e) {
                console.error('Error checking for live match:', e);
            } finally {
                this.checkingLiveMatch = false;
            }
        },

        /**
         * One-off catch-up after the websocket reconnects, or when the stream keeps
         * failing: did the match end, did its video come up or go away?
         */
        async resyncLiveState() {
            if (!this.matchActive) {
                await this.checkForLiveMatch();
                return;
            }
            try {
                const res = await fetch('/games/ping-pong/api/matches/' + this.matchId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.is_complete) {
                        this.beginMatchEnd();
                        return;
                    }
                }
                await this.syncVideo();
            } catch (e) {
                // Ignore transient fetch errors
            }
        },

        /** Brings the video up if it went on air unseen, or drops to score-only if a failing stream is gone. */
        async syncVideo() {
            const res = await fetch('/games/ping-pong/api/recordings/live');
            if (!res.ok) return;
            const recData = await res.json();
            const onAir = recData.active && recData.hls_url && recData.match_id === this.matchId;

            if (onAir && !this.hasVideo) {
                this.attachStream(recData.hls_url);
            } else if (!onAir && this.hasVideo && this.hlsNetworkErrorCount > 0) {
                this.hasVideo = false;
                this.destroyPlayer();
            }
        },

        /**
         * The stream runs ~10s behind the table and the camera films a tail after
         * the winning point, so let the video play out (it ends once the recording
         * stops) rather than cutting on the final score.
         */
        beginMatchEnd() {
            if (this.endingTimer) return;

            const video = this.hasVideo ? document.getElementById('watchPlayer') : null;
            if (!video) {
                this.endingTimer = setTimeout(() => this.handleMatchEnd(), 3000);
                return;
            }

            video.addEventListener('ended', () => this.handleMatchEnd(), { once: true });
            this.endingTimer = setTimeout(() => this.handleMatchEnd(), MATCH_END_FALLBACK_MS);
        },

        async handleMatchEnd() {
            clearTimeout(this.endingTimer);
            this.endingTimer = null;
            if (!this.matchActive) return;

            this.matchActive = false;
            this.hasVideo = false;
            this.eloPreview = null;
            this.destroyPlayer();
            this.leaveMatchChannel();
            this.leaveChat();
            this.leaveViewers();
            this.chatUnread = 0;

            // A match may have started during the tail: jump straight to it.
            await this.checkForLiveMatch();
        },

        initPlayer(hlsUrl) {
            const video = document.getElementById('watchPlayer');
            if (!video) return;

            this.destroyPlayer();
            this.streamUrl = hlsUrl;

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                const hls = new Hls({
                    liveSyncDuration: 3,
                    liveMaxLatencyDuration: 6,
                    enableWorker: true,
                });
                this.hlsInstance = hls;
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    this.hlsNetworkErrorCount = 0;
                    this.startVideo(video);
                });
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (!data.fatal) return;
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        this.retryStream();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        this.hasVideo = false;
                        this.destroyPlayer();
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.onerror = () => this.retryStream();
                video.src = hlsUrl;
                this.startVideo(video);
            }
        },

        /**
         * Reconnects the player after a fatal network error. hls.startLoad() never
         * re-requests a manifest that failed, so rebuild the player from scratch.
         */
        retryStream() {
            if (this.streamRetryTimer || !this.hasVideo || !this.streamUrl) return;
            this.hlsNetworkErrorCount++;
            if (this.hlsNetworkErrorCount % 3 === 0) this.resyncLiveState();

            const delay = Math.min(1000 * this.hlsNetworkErrorCount, 5000);
            this.streamRetryTimer = setTimeout(() => {
                this.streamRetryTimer = null;
                if (this.hasVideo && this.streamUrl) this.initPlayer(this.streamUrl);
            }, delay);
        },

        /** Plays with sound if the viewer turned it on; falls back to muted if the browser refuses. */
        startVideo(video) {
            video.muted = !this.audioOn;
            video.play().catch(() => {
                if (video.muted) return;
                this.audioOn = false;
                video.muted = true;
                video.play().catch(() => {});
            });
        },

        enableAudio() {
            const video = document.getElementById('watchPlayer');
            if (!video) return;
            this.audioOn = true;
            video.muted = false;
            video.volume = 1;
            video.play().catch(() => {
                this.audioOn = false;
                video.muted = true;
            });
        },

        destroyPlayer() {
            clearTimeout(this.streamRetryTimer);
            this.streamRetryTimer = null;
            const video = document.getElementById('watchPlayer');
            if (video) video.onerror = null;
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },

        isServingLeft() {
            if (!this.match?.current_server) return false;
            return this.match.current_server.id === this.match.player_left_id
                || this.match.current_server.id === this.match.team_left_player2_id;
        },

        isServingRight() {
            if (!this.match?.current_server) return false;
            return this.match.current_server.id === this.match.player_right_id
                || this.match.current_server.id === this.match.team_right_player2_id;
        },

        leaveMatchChannel() {
            if (this.echo && this.matchChannel) {
                this.echo.leave(this.matchChannel);
            }
            this.matchChannel = null;
        },

        subscribeToScores() {
            if (!this.matchId) return;

            this.ensureEcho();
            this.leaveMatchChannel();

            this.matchChannel = 'ping-pong.match.' + this.matchId;
            this.echo.channel(this.matchChannel)
                .listen('.match.score-updated', (e) => {
                    if (e.match) {
                        this.match = { ...this.match, ...e.match };
                        if (e.match.is_complete) {
                            this.beginMatchEnd();
                        }
                    }
                })
                .listen('.match.abandoned', () => {
                    this.handleMatchEnd();
                });
        },
    };
}
</script>
@endsection
