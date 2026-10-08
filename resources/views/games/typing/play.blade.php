@extends('layouts.app')

@section('title', 'Typing - Games Hub')

@section('content')
    <style>
        .typing-words { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.5rem; line-height: 2.5rem; height: 7.5rem; overflow: hidden; position: relative; }
        .typing-word { display: inline-block; margin-right: 0.6em; }
        .typing-char { color: rgb(255 255 255 / 0.3); border-left: 2px solid transparent; }
        .typing-char.ok { color: rgb(255 255 255 / 0.95); }
        .typing-char.bad { color: rgb(248 113 113); }
        .typing-char.extra { color: rgb(185 28 28); }
        .typing-word.missed { text-decoration: underline rgb(248 113 113 / 0.6); }
        .typing-char.caret { border-left-color: rgb(234 179 8); animation: typing-blink 1s step-end infinite; }
        .typing-char.caret-after { border-right: 2px solid rgb(234 179 8); animation: typing-blink 1s step-end infinite; }
        @keyframes typing-blink { 50% { border-color: transparent; } }
    </style>

    @php
        $config = [
            'players' => $players->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])->values(),
            'soloSeconds' => $soloSeconds,
            'csrf' => csrf_token(),
            'urls' => [
                'tests' => url('/games/typing/tests'),
                'race' => url('/games/typing/race'),
            ],
        ];
    @endphp

    <div x-data="typingApp(@js($config))" x-cloak
         @keydown.window.tab="if (mode === 'solo' && playerId) { $event.preventDefault(); newSoloTest(); }"
         @keydown.window="captureTyping($event)">
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">⌨️ Typing</h1>
                <p class="text-white/50 text-sm">Solo 30-second tests, or race everyone on the same text.</p>
            </div>
            <a href="{{ url('/leaderboards/typing') }}" class="text-sm text-indigo-300 hover:text-indigo-200">Leaderboard →</a>
        </div>

        @if($players->isEmpty())
            <x-empty-state icon="👥" title="No players yet" message="Add a player before typing." />
        @else
            {{-- Settings --}}
            <div class="flex flex-wrap items-center gap-3 mb-6">
                <select x-model="playerId" :disabled="busy()"
                        class="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="" class="bg-slate-800">Select a player…</option>
                    <template x-for="p in players" :key="p.id">
                        <option :value="p.id" x-text="p.name" class="bg-slate-800"></option>
                    </template>
                </select>

                <div class="flex rounded-lg overflow-hidden border border-white/20 text-sm">
                    <template x-for="m in [['solo', 'Solo'], ['race', 'Race']]" :key="m[0]">
                        <button type="button" @click="setMode(m[0])" :disabled="busy()" x-text="m[1]"
                                :class="mode === m[0] ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/60 hover:text-white'"
                                class="px-4 py-2 font-semibold transition"></button>
                    </template>
                </div>

                <div class="flex rounded-lg overflow-hidden border border-white/20 text-sm">
                    <template x-for="l in [['fr', 'Français'], ['en', 'English']]" :key="l[0]">
                        <button type="button" @click="language = l[0]; settingsChanged()" :disabled="busy()" x-text="l[1]"
                                :class="language === l[0] ? 'bg-white/20 text-white' : 'bg-white/5 text-white/50 hover:text-white'"
                                class="px-3 py-2 transition"></button>
                    </template>
                </div>

                <div class="flex rounded-lg overflow-hidden border border-white/20 text-sm">
                    <template x-for="s in [['words', 'Words'], ['quote', 'Quote']]" :key="s[0]">
                        <button type="button" @click="source = s[0]; settingsChanged()" :disabled="busy()" x-text="s[1]"
                                :class="source === s[0] ? 'bg-white/20 text-white' : 'bg-white/5 text-white/50 hover:text-white'"
                                class="px-3 py-2 transition"></button>
                    </template>
                </div>
            </div>

            <template x-if="error">
                <div class="bg-red-500/15 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-4" x-text="error"></div>
            </template>

            <template x-if="!playerId">
                <p class="text-white/50 text-sm mb-8">Pick your player to start.</p>
            </template>

            {{-- Race lobby / standings --}}
            <template x-if="playerId && mode === 'race'">
                <div class="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
                    <template x-if="!race">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <p class="text-white/60 text-sm">No race open. Create one with the language and text above; others can join until it starts.</p>
                            <button type="button" @click="joinRace()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg">Create race</button>
                        </div>
                    </template>

                    <template x-if="race">
                        <div>
                            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <div class="text-sm text-white/60">
                                    <span x-text="race.language === 'fr' ? 'Français' : 'English'"></span> ·
                                    <span x-text="race.source === 'quote' ? 'Quote' : '40 words'"></span> ·
                                    <span class="font-semibold text-white" x-text="raceStatusLabel()"></span>
                                </div>
                                <div class="flex gap-2">
                                    <template x-if="race.status === 'lobby' && !inRace()">
                                        <button type="button" @click="joinRace()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg">Join</button>
                                    </template>
                                    <template x-if="race.status === 'lobby' && inRace()">
                                        <button type="button" @click="raceAction('leave')" class="bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2 rounded-lg">Leave</button>
                                    </template>
                                    <template x-if="race.status === 'lobby' && inRace() && !isHost()">
                                        <span class="text-sm text-white/50 self-center" x-text="`Waiting for ${hostName()} to start`"></span>
                                    </template>
                                    <template x-if="race.status === 'lobby' && isHost()">
                                        <button type="button" @click="raceAction('start')" :disabled="race.racers.length < 2"
                                                :class="race.racers.length < 2 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-500'"
                                                class="bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">Start</button>
                                    </template>
                                    <template x-if="race.status === 'finished'">
                                        <button type="button" @click="race = null; resetEngine(); loadRace()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg">New race</button>
                                    </template>
                                </div>
                            </div>

                            <template x-if="race.status === 'lobby'">
                                <div class="flex gap-2 mb-4">
                                    <input data-invite-url readonly :value="inviteUrl()" @focus="$el.select()"
                                           class="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white/70">
                                    <button type="button" @click="copyInvite()" x-text="copied ? 'Copied!' : 'Copy invite link'"
                                            class="bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap"></button>
                                </div>
                            </template>

                            <div class="space-y-2">
                                <template x-for="r in racersSorted()" :key="r.player_id">
                                    <div class="flex items-center gap-3">
                                        <div class="w-6 text-right text-sm font-bold" x-text="r.place ? '#' + r.place : ''"></div>
                                        <div class="w-28 truncate text-sm" :class="r.player_id == playerId ? 'text-yellow-300 font-semibold' : ''" x-text="r.player_name"></div>
                                        <div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div class="h-full rounded-full transition-all duration-300"
                                                 :class="r.finished ? 'bg-emerald-500' : 'bg-indigo-500'"
                                                 :style="`width: ${Math.round(r.progress_chars / race.text.length * 100)}%`"></div>
                                        </div>
                                        <div class="w-36 text-right text-xs text-white/60">
                                            <template x-if="race.status === 'finished'">
                                                <span>
                                                    <span class="font-bold text-white" x-text="Math.round(r.wpm ?? 0)"></span> wpm ·
                                                    <span x-text="Math.round(r.accuracy ?? 0) + '%'"></span>
                                                    <span x-show="!r.finished" class="text-red-300">DNF</span>
                                                </span>
                                            </template>
                                            <template x-if="race.status === 'running' && !countdown">
                                                <span><span class="font-bold text-white" x-text="liveWpm(r)"></span> wpm</span>
                                            </template>
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </template>
                </div>
            </template>

            {{-- Typing area, shared by solo and race --}}
            <template x-if="playerId && text">
                <div class="bg-white/5 border border-white/10 rounded-xl p-6 mb-8 relative">
                    <div class="flex items-center justify-between mb-4 text-sm">
                        <span class="text-yellow-400 text-2xl font-bold tabular-nums" x-text="mode === 'solo' ? remaining : (countdown ? countdown : '')"></span>
                        <span class="text-white/40" x-text="attribution ? '— ' + attribution : ''"></span>
                    </div>

                    <template x-if="mode === 'race' && countdown">
                        <div class="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded-xl z-10">
                            <span class="text-7xl font-extrabold text-yellow-400" x-text="countdown"></span>
                        </div>
                    </template>

                    <div class="typing-words select-none cursor-text" data-typing-words @click="focusInput()">
                        <template x-for="(word, wi) in words" :key="wi">
                            <span class="typing-word" :class="wordClass(wi)" :data-word="wi"><template x-for="(ch, ci) in wordChars(wi)" :key="ci"><span class="typing-char" :class="charClass(wi, ci)" x-text="ch"></span></template></span>
                        </template>
                    </div>

                    <input data-typing-input type="text" class="absolute opacity-0 pointer-events-none w-px h-px"
                           autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
                           :disabled="locked()"
                           @input="onInput($event)" @compositionend="onInput($event)"
                           @keydown.backspace="onBackspace($event)"
                           @paste.prevent @drop.prevent>


                    {{-- Solo results --}}
                    <template x-if="mode === 'solo' && result">
                        <div class="mt-6 grid grid-cols-3 gap-3 text-center">
                            <div class="bg-white/5 rounded-lg py-4"><div class="text-3xl font-extrabold text-yellow-400" x-text="Math.round(result.wpm)"></div><div class="text-xs text-white/50">wpm</div></div>
                            <div class="bg-white/5 rounded-lg py-4"><div class="text-3xl font-extrabold" x-text="Math.round(result.raw_wpm)"></div><div class="text-xs text-white/50">raw</div></div>
                            <div class="bg-white/5 rounded-lg py-4"><div class="text-3xl font-extrabold" x-text="Math.round(result.accuracy) + '%'"></div><div class="text-xs text-white/50">accuracy</div></div>
                        </div>
                    </template>

                    <template x-if="mode === 'solo'">
                        <div class="mt-6 text-center">
                            <button type="button" @click="newSoloTest()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-lg">
                                <span x-text="result ? 'Next test' : 'Restart'"></span> <span class="text-white/50 text-xs ml-1">(Tab)</span>
                            </button>
                        </div>
                    </template>
                </div>
            </template>

            @if($recent->isNotEmpty())
                <h2 class="text-sm font-semibold text-white/70 mb-3">Recent tests</h2>
                <div class="space-y-2">
                    @foreach($recent as $test)
                        <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                            <span class="font-semibold text-sm">{{ $test->player->name }}</span>
                            <div class="flex items-center gap-3">
                                <span class="text-xs text-white/40">{{ $test->typing_race_id ? 'Race' : 'Solo' }} · {{ strtoupper($test->language) }} · {{ $test->source === 'quote' ? 'Quote' : 'Words' }}</span>
                                <span class="text-sm font-bold">{{ round($test->wpm) }} wpm</span>
                                <span class="text-xs text-white/50">{{ round($test->accuracy) }}%</span>
                                <span class="text-xs text-white/40">{{ $test->submitted_at->diffForHumans() }}</span>
                            </div>
                        </div>
                    @endforeach
                </div>
            @endif
        @endif
    </div>

    <script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
    <script>
        function typingApp(config) {
            const remember = (key, fallback) => { try { return localStorage.getItem('typing_' + key) || fallback; } catch { return fallback; } };
            const store = (key, value) => { try { localStorage.setItem('typing_' + key, value); } catch {} };

            return {
                players: config.players,
                playerId: remember('player', ''),
                mode: remember('mode', 'solo'),
                language: remember('language', 'fr'),
                source: remember('source', 'words'),
                error: null,

                // Engine: the text, what was typed per word, and the counters the server caps.
                text: '',
                words: [],
                typed: [''],
                current: 0,
                keystrokes: 0,
                errors: 0,
                attribution: null,

                // Solo
                testId: null,
                startedAt: null,
                remaining: config.soloSeconds,
                timer: null,
                submitting: false,
                result: null,

                // Race
                race: null,
                raceTextFor: null,
                clockOffset: 0,
                countdown: 0,
                wasCounting: false,
                copied: false,
                raceDone: false,
                capChecked: false,
                // From an invite link (?race=ID): joined once a player is picked.
                inviteId: new URLSearchParams(location.search).get('race'),
                now: Date.now(),

                init() {
                    if (!this.players.some(p => String(p.id) === String(this.playerId))) this.playerId = '';
                    this.$watch('playerId', v => { store('player', v); this.settingsChanged(); });
                    this.subscribeRace();
                    setInterval(() => this.tickRace(), 100);
                    if (this.inviteId) this.mode = 'race';
                    this.settingsChanged();
                },

                // ---------- settings ----------

                busy() {
                    return (this.mode === 'solo' && this.startedAt && !this.result)
                        || (this.mode === 'race' && this.inRace() && this.race?.status === 'running');
                },

                setMode(mode) {
                    this.mode = mode;
                    this.settingsChanged();
                },

                settingsChanged() {
                    store('mode', this.mode);
                    store('language', this.language);
                    store('source', this.source);
                    this.error = null;
                    this.resetEngine();
                    if (!this.playerId) return;
                    if (this.mode === 'solo') this.newSoloTest();
                    else this.loadRace();
                },

                // ---------- engine ----------

                resetEngine() {
                    clearInterval(this.timer);
                    Object.assign(this, {
                        text: '', words: [], typed: [''], current: 0, keystrokes: 0, errors: 0, attribution: null,
                        testId: null, startedAt: null, remaining: config.soloSeconds, submitting: false, result: null,
                        raceTextFor: null, raceDone: false,
                    });
                    if (this.input()) this.input().value = '';
                },

                loadText(text, attribution = null) {
                    this.text = text;
                    this.words = text.split(' ');
                    this.attribution = attribution;
                    this.$nextTick(() => { this.wordsBox() && (this.wordsBox().scrollTop = 0); this.focusInput(); });
                },

                // Not $refs: Alpine caches $refs on first read, before this x-if content exists.
                input() {
                    return this.$root.querySelector('[data-typing-input]');
                },

                wordsBox() {
                    return this.$root.querySelector('[data-typing-words]');
                },

                // Any letter typed anywhere on the page goes to the test: focusing the
                // input during keydown lets the browser deliver the character to it.
                captureTyping(event) {
                    const input = this.input();
                    if (!input || event.target === input || this.locked() || event.ctrlKey || event.metaKey || event.altKey) return;
                    if (event.target.matches?.('select, textarea, input')) return;
                    if (event.key.length === 1 || event.key === 'Dead') input.focus();
                },

                focusInput() {
                    // The input lives in an x-if that renders after the text arrives.
                    this.$nextTick(() => setTimeout(() => this.input()?.focus()));
                },

                locked() {
                    if (this.mode === 'solo') return !this.testId || !!this.result || this.submitting;
                    return !this.inRace() || this.race?.status !== 'running' || this.countdown > 0 || this.raceDone;
                },

                typedText() {
                    return this.typed.join(' ');
                },

                onInput(event) {
                    if (event.isComposing || this.locked()) return;
                    const input = event.target;
                    let value = input.value;
                    const before = this.typed[this.current];

                    if (value.includes(' ')) {
                        const word = value.split(' ')[0];
                        const correct = word === this.words[this.current];
                        input.value = '';
                        if (word === '') return; // a space on an empty word does nothing
                        this.keystrokes++;
                        if (!correct) this.errors++;
                        // A race only moves on over correct words (it ends on the exact text),
                        // and the last word never takes a space.
                        if ((this.mode === 'race' && !correct) || this.current >= this.words.length - 1) {
                            input.value = word;
                            return;
                        }
                        this.typed[this.current] = word;
                        this.current++;
                        this.typed.push('');
                        this.onWordCommitted();
                        this.scrollToCurrent();
                        return;
                    }

                    if (value.length > before.length) {
                        if (this.mode === 'solo' && !this.startedAt) this.startSoloTimer();
                        const expected = this.words[this.current] ?? '';
                        for (let i = before.length; i < value.length; i++) {
                            this.keystrokes++;
                            if (value[i] !== expected[i]) this.errors++;
                        }
                    }
                    this.typed[this.current] = value;

                    // The last word needs no trailing space to finish.
                    if (this.current === this.words.length - 1 && value === this.words[this.current]) this.endOfText();
                },

                // Backspace on an empty word goes back into the previous one.
                onBackspace(event) {
                    const input = event.target;
                    if (input.value !== '' || this.current === 0 || this.locked()) return;
                    event.preventDefault();
                    this.typed.pop();
                    this.current--;
                    input.value = this.typed[this.current];
                    this.scrollToCurrent();
                },

                endOfText() {
                    if (this.mode === 'race') this.sendProgress(true);
                    else this.submitSolo();
                },

                onWordCommitted() {
                    if (this.mode === 'race') this.sendProgress(false);
                },

                scrollToCurrent() {
                    this.$nextTick(() => {
                        const box = this.wordsBox();
                        const el = box?.querySelector(`[data-word="${this.current}"]`);
                        if (!el) return;
                        const line = parseFloat(getComputedStyle(box).lineHeight);
                        box.scrollTop = Math.max(0, el.offsetTop - line);
                    });
                },

                wordChars(wi) {
                    const word = this.words[wi];
                    const typed = this.typed[wi] ?? '';
                    return typed.length > word.length ? (word + typed.slice(word.length)).split('') : word.split('');
                },

                wordClass(wi) {
                    return wi < this.current && this.typed[wi] !== this.words[wi] ? 'missed' : '';
                },

                charClass(wi, ci) {
                    const word = this.words[wi];
                    const typed = this.typed[wi];
                    const classes = [];
                    if (typed !== undefined && ci < typed.length) {
                        classes.push(ci >= word.length ? 'extra' : (typed[ci] === word[ci] ? 'ok' : 'bad'));
                    }
                    if (wi === this.current && !this.locked()) {
                        const len = (typed ?? '').length;
                        const shown = Math.max(word.length, len);
                        if (ci === len) classes.push('caret');
                        else if (len >= shown && ci === shown - 1) classes.push('caret-after');
                    }
                    return classes.join(' ');
                },

                async post(url, body) {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': config.csrf },
                        body: JSON.stringify(body),
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
                    return data;
                },

                // ---------- solo ----------

                async newSoloTest() {
                    if (this.mode !== 'solo' || !this.playerId) return;
                    // Typed in, then dropped before the end: counts as a restart.
                    const restarted = this.startedAt && !this.result && !this.submitting ? this.testId : null;
                    this.resetEngine();
                    try {
                        const data = await this.post(config.urls.tests, {
                            player_id: this.playerId, language: this.language, source: this.source, restarted_test_id: restarted,
                        });
                        this.testId = data.id;
                        this.loadText(data.text, data.attribution);
                    } catch (e) { this.error = e.message; }
                },

                startSoloTimer() {
                    this.startedAt = Date.now();
                    this.timer = setInterval(() => {
                        const left = config.soloSeconds - (Date.now() - this.startedAt) / 1000;
                        this.remaining = Math.max(0, Math.ceil(left));
                        if (left <= 0) this.submitSolo();
                    }, 100);
                },

                async submitSolo() {
                    if (this.submitting || this.result) return;
                    // A quote can be finished early; the server still needs the full 30s to pass.
                    const wait = this.startedAt ? config.soloSeconds * 1000 - (Date.now() - this.startedAt) : 0;
                    this.submitting = true;
                    if (wait > 0) { this.remaining = 0; await new Promise(r => setTimeout(r, wait)); }
                    clearInterval(this.timer);
                    this.remaining = 0;
                    try {
                        this.result = await this.post(`${config.urls.tests}/${this.testId}/submit`, {
                            typed: this.typedText(), keystrokes: this.keystrokes, errors: this.errors,
                        });
                    } catch (e) { this.error = e.message; }
                    this.submitting = false;
                },

                // ---------- race ----------

                subscribeRace() {
                    try {
                        const echo = new Echo({
                            broadcaster: 'pusher',
                            key: 'games-hub-key',
                            wsHost: window.location.hostname,
                            wsPort: window.location.port || 80,
                            forceTLS: false,
                            disableStats: true,
                            enabledTransports: ['ws', 'wss'],
                            cluster: 'mt1',
                        });
                        echo.channel('typing.race').listen('.race.updated', e => this.setRace(e.race));
                    } catch (e) { console.warn('[typing] realtime unavailable', e); }
                },

                async loadRace() {
                    const data = await fetch(config.urls.race, { headers: { Accept: 'application/json' } }).then(r => r.json());
                    this.setRace(data.race);
                    if (this.inviteId && this.playerId) this.acceptInvite();
                },

                acceptInvite() {
                    const invited = this.inviteId;
                    this.inviteId = null;
                    history.replaceState(null, '', location.pathname);
                    if (String(this.race?.id) !== String(invited)) {
                        this.error = 'That race has already ended.';
                    } else if (this.race.status === 'lobby' && !this.inRace()) {
                        this.joinRace();
                    } else if (this.race.status !== 'lobby' && !this.inRace()) {
                        this.error = 'That race has already started.';
                    }
                },

                inviteUrl() {
                    return `${location.origin}${location.pathname}?race=${this.race.id}`;
                },

                async copyInvite() {
                    try {
                        await navigator.clipboard.writeText(this.inviteUrl());
                        this.copied = true;
                        setTimeout(() => this.copied = false, 2000);
                    } catch { this.$root.querySelector('[data-invite-url]')?.select(); }
                },

                setRace(race) {
                    // Keep showing our finished race's standings rather than the next lobby.
                    if (!race && this.race?.status === 'finished') return;
                    if (race && this.race && race.id !== this.race.id && this.race.status === 'finished' && this.raceTextFor === this.race.id) return;
                    this.race = race;
                    if (race) this.clockOffset = Date.parse(race.now) - Date.now();
                    if (race?.status === 'finished' && this.raceTextFor === race.id) this.raceDone = true;
                    if (!race || (this.raceTextFor && this.raceTextFor !== race.id)) this.resetEngine();
                },

                inRace() {
                    return !!this.race?.racers.some(r => String(r.player_id) === String(this.playerId));
                },

                isHost() {
                    return String(this.race?.host_player_id) === String(this.playerId);
                },

                hostName() {
                    return this.race.racers.find(r => r.player_id === this.race.host_player_id)?.player_name ?? 'the host';
                },

                serverNow() {
                    return this.now + this.clockOffset;
                },

                tickRace() {
                    this.now = Date.now();
                    const race = this.race;
                    if (this.mode !== 'race' || !race || race.status !== 'running') { this.countdown = 0; return; }
                    const startsAt = Date.parse(race.starts_at);
                    const left = startsAt - this.serverNow();
                    this.countdown = left > 0 ? Math.ceil(left / 1000) : 0;
                    if (this.inRace() && this.raceTextFor !== race.id) {
                        this.resetEngine();
                        this.raceTextFor = race.id;
                        this.loadText(race.text);
                    }
                    if (this.wasCounting && !this.countdown) this.focusInput();
                    this.wasCounting = this.countdown > 0;
                    // Fallback if the cap job is late: asking for the race ends it server-side.
                    if (!this.capChecked && this.serverNow() > startsAt + 121000) { this.capChecked = true; this.loadRace(); }
                    if (this.serverNow() <= startsAt + 121000) this.capChecked = false;
                },

                liveWpm(r) {
                    // A finisher's wpm is final: the same formula the server stores.
                    if (r.finish_ms) return Math.round(this.race.text.length / 5 / (r.finish_ms / 60000));
                    const elapsed = (this.serverNow() - Date.parse(this.race.starts_at)) / 60000;
                    return elapsed > 0 ? Math.round(r.progress_chars / 5 / elapsed) : 0;
                },

                racersSorted() {
                    if (this.race.status !== 'finished') return this.race.racers;
                    return [...this.race.racers].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || (b.wpm ?? 0) - (a.wpm ?? 0));
                },

                raceStatusLabel() {
                    if (this.race.status === 'lobby') return `Lobby · ${this.race.racers.length} player(s)`;
                    if (this.race.status === 'finished') return 'Finished';
                    return this.countdown ? 'Starting…' : 'Racing';
                },

                async joinRace() {
                    this.error = null;
                    try {
                        const data = await this.post(config.urls.race, { player_id: this.playerId, language: this.language, source: this.source });
                        this.race = null;
                        this.setRace(data.race);
                    } catch (e) { this.error = e.message; }
                },

                async raceAction(action) {
                    this.error = null;
                    try {
                        const data = await this.post(`${config.urls.race}/${this.race.id}/${action}`, { player_id: this.playerId });
                        this.setRace(data.race);
                    } catch (e) { this.error = e.message; }
                },

                async sendProgress(done) {
                    if (done) this.raceDone = true;
                    try {
                        const data = await this.post(`${config.urls.race}/${this.race.id}/progress`, {
                            player_id: this.playerId, typed: this.typedText(),
                            keystrokes: this.keystrokes, errors: this.errors,
                        });
                        this.setRace(data.race);
                    } catch (e) { this.error = e.message; if (done) this.raceDone = false; }
                },
            };
        }
    </script>
@endsection
