@extends('layouts.app')

@section('title', 'Ping Pong Lights - Games Hub')

@section('content')
    <div class="mb-8">
        <a href="{{ url('/games/ping-pong') }}" class="text-sm text-white/50 hover:text-white/70 transition">← Back to Ping Pong</a>
    </div>

    <div class="max-w-3xl">
        <h1 class="text-2xl font-extrabold tracking-tight mb-2">Ping pong lights</h1>
        <p class="text-sm text-white/55 mb-8">
            Each office can connect the light over its table through Home Assistant. When a point is scored it
            flashes the scoring side's colour; when a match is won it plays the win animation in the winner's colour.
            The office is picked on the table's screen, in the lobby. Afterwards the light goes back to how it was.
        </p>

        {{-- The office this device's table screen remembers (the lobby asks once, then hides the picker). --}}
        <div x-data="{ id: (() => { try { return localStorage.getItem('pingPong.officeId') || ''; } catch (e) { return ''; } })(), offices: @js($offices->pluck('name', 'id')) }"
             x-show="id && offices[id]" x-cloak
             class="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm">
            <span class="text-white/70">This device's table is in <strong class="text-white" x-text="offices[id]"></strong>.</span>
            <button type="button" @click="try { localStorage.removeItem('pingPong.officeId'); } catch (e) {} id = ''"
                    class="bg-white/10 hover:bg-white/20 text-sm font-medium px-4 py-1.5 rounded-lg transition">
                Forget it
            </button>
        </div>

        @if ($offices->isEmpty())
            <p class="text-white/60">No offices yet. <a href="{{ url('/offices') }}" class="underline">Add one</a> first.</p>
        @endif

        <div class="flex flex-col gap-6">
            @foreach ($offices as $office)
                <section x-data="lightCard(@js($office))" class="rounded-2xl border border-white/15 bg-white/[0.04] p-5 md:p-6">
                    <header class="flex items-center justify-between gap-4 mb-5">
                        <h2 class="text-lg font-bold">{{ $office['name'] }}</h2>
                        <button type="button" role="switch" :aria-checked="form.enabled" @click="form.enabled = !form.enabled"
                                class="flex items-center gap-2 text-sm font-semibold">
                            <span x-text="form.enabled ? 'On' : 'Off'" :class="form.enabled ? 'text-emerald-300' : 'text-white/50'"></span>
                            <span class="relative w-10 h-6 rounded-full transition" :class="form.enabled ? 'bg-emerald-400' : 'bg-white/20'">
                                <span class="absolute top-1 left-1 w-4 h-4 rounded-full bg-[#06081b] transition-transform" :class="form.enabled && 'translate-x-4'"></span>
                            </span>
                        </button>
                    </header>

                    {{-- Connection --}}
                    <div class="grid gap-4 md:grid-cols-2">
                        <label class="block md:col-span-2">
                            <span class="block text-sm font-medium text-white/70 mb-1.5">Home Assistant address</span>
                            <input type="url" x-model="form.ha_url" placeholder="https://home.example.com"
                                   class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500">
                        </label>
                        <label class="block md:col-span-2">
                            <span class="block text-sm font-medium text-white/70 mb-1.5">
                                Long-lived access token
                                <span x-show="hasToken" class="ml-2 text-xs font-semibold text-emerald-300">saved</span>
                            </span>
                            <input type="password" x-model="form.ha_token" autocomplete="new-password"
                                   :placeholder="hasToken ? 'Leave empty to keep the saved token' : 'Paste a token from your Home Assistant profile → Security'"
                                   class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500">
                            <span class="block text-xs text-white/40 mt-1">Never shown again once saved. Changing the address needs the token pasted again.</span>
                        </label>
                        <label class="block md:col-span-2">
                            <span class="block text-sm font-medium text-white/70 mb-1.5">Light</span>
                            <div class="flex gap-2">
                                <template x-if="lights.length">
                                    <select x-model="form.entity_id" class="flex-1 min-w-0 bg-[#0d1026] border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500">
                                        <option value="">Pick a light…</option>
                                        <template x-for="light in lights" :key="light.entity_id">
                                            <option :value="light.entity_id" x-text="`${light.name} (${light.entity_id})`" :selected="light.entity_id === form.entity_id"></option>
                                        </template>
                                    </select>
                                </template>
                                <template x-if="!lights.length">
                                    <input type="text" x-model="form.entity_id" placeholder="light.ping_pong_strip"
                                           class="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500">
                                </template>
                                <button type="button" @click="testConnection()" :disabled="busy"
                                        class="shrink-0 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition">
                                    Test connection
                                </button>
                            </div>
                        </label>
                    </div>

                    {{-- Look --}}
                    <div class="grid gap-4 grid-cols-2 md:grid-cols-3 mt-6">
                        <label class="block">
                            <span class="block text-sm font-medium text-white/70 mb-1.5">Left side colour</span>
                            <input type="color" x-model="form.left_color" class="w-full h-10 rounded-lg bg-transparent border border-white/20 cursor-pointer">
                        </label>
                        <label class="block">
                            <span class="block text-sm font-medium text-white/70 mb-1.5">Right side colour</span>
                            <input type="color" x-model="form.right_color" class="w-full h-10 rounded-lg bg-transparent border border-white/20 cursor-pointer">
                        </label>
                        <label class="block col-span-2 md:col-span-1">
                            <span class="block text-sm font-medium text-white/70 mb-1.5">Brightness <span class="text-white/45" x-text="form.brightness + '%'"></span></span>
                            <input type="range" min="1" max="100" x-model.number="form.brightness" class="w-full mt-3 accent-indigo-500">
                        </label>
                    </div>

                    {{-- Animations --}}
                    <div class="mt-6 flex flex-col gap-3">
                        <template x-for="event in events" :key="event.key">
                            <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                <div class="flex flex-wrap items-center justify-between gap-3">
                                    <label class="flex items-center gap-2 font-semibold">
                                        <input type="checkbox" x-model="form.animations[event.key].enabled" class="accent-indigo-500 w-4 h-4">
                                        <span x-text="event.label"></span>
                                    </label>
                                    <div class="flex gap-2">
                                        <button type="button" @click="preview(event.key, 'left')"
                                                class="text-xs font-semibold px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition">
                                            Preview only
                                        </button>
                                        <button type="button" @click="test(event.key, 'left')" :disabled="busy"
                                                class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 disabled:opacity-50 transition flex items-center gap-1.5">
                                            <span class="w-2.5 h-2.5 rounded-full" :style="`background:${form.left_color}`"></span> Test left
                                        </button>
                                        <button type="button" @click="test(event.key, 'right')" :disabled="busy"
                                                class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 disabled:opacity-50 transition flex items-center gap-1.5">
                                            <span class="w-2.5 h-2.5 rounded-full" :style="`background:${form.right_color}`"></span> Test right
                                        </button>
                                    </div>
                                </div>
                                <div class="flex flex-wrap items-center gap-3 mt-3">
                                    <span class="text-xs text-white/55">Style</span>
                                    <div class="inline-flex rounded-lg border border-white/20 overflow-hidden text-xs font-semibold">
                                        <button type="button" @click="form.animations[event.key].style = 'flash'"
                                                class="px-3 py-1.5 transition" :class="form.animations[event.key].style === 'flash' ? 'bg-indigo-600 text-white' : 'text-white/60 hover:bg-white/10'">Flash</button>
                                        <button type="button" @click="form.animations[event.key].style = 'strobe'"
                                                class="px-3 py-1.5 transition" :class="form.animations[event.key].style === 'strobe' ? 'bg-indigo-600 text-white' : 'text-white/60 hover:bg-white/10'">Strobe</button>
                                    </div>
                                    <span class="text-xs text-white/40" x-text="form.animations[event.key].style === 'strobe'
                                        ? 'The strip strobes by itself, fast. Needs the light through rustuya (local Tuya).'
                                        : 'The Hub turns the colour on and off, step by step.'"></span>
                                </div>
                                <div x-show="form.animations[event.key].style === 'strobe'" class="grid grid-cols-2 gap-3 mt-3">
                                    <label class="block">
                                        <span class="block text-xs text-white/55 mb-1">Duration (ms)</span>
                                        <input type="number" min="1000" max="15000" step="500" x-model.number="form.animations[event.key].duration_ms"
                                               class="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500">
                                    </label>
                                    <label class="block">
                                        <span class="block text-xs text-white/55 mb-1">Speed <span class="text-white/40" x-text="form.animations[event.key].speed"></span></span>
                                        <input type="range" min="1" max="100" x-model.number="form.animations[event.key].speed" class="w-full mt-2 accent-indigo-500">
                                    </label>
                                </div>
                                <div x-show="form.animations[event.key].style !== 'strobe'" class="grid grid-cols-3 gap-3 mt-3">
                                    <label class="block">
                                        <span class="block text-xs text-white/55 mb-1">Flashes</span>
                                        <input type="number" min="1" max="10" x-model.number="form.animations[event.key].flashes"
                                               class="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500">
                                    </label>
                                    <label class="block">
                                        <span class="block text-xs text-white/55 mb-1">On (ms)</span>
                                        <input type="number" min="200" max="10000" step="100" x-model.number="form.animations[event.key].on_ms"
                                               class="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500">
                                    </label>
                                    <label class="block">
                                        <span class="block text-xs text-white/55 mb-1">Off between (ms)</span>
                                        <input type="number" min="0" max="10000" step="100" x-model.number="form.animations[event.key].off_ms"
                                               class="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500">
                                    </label>
                                </div>
                            </div>
                        </template>
                        <p class="text-xs text-white/40">
                            Cloud lights (Tuya and the like) take about half a second to a second to change, so keep each step at 700 ms or more.
                        </p>
                    </div>

                    {{-- Preview: the same animation, drawn here from the form's values --}}
                    <div class="mt-6">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-white/70">Preview</span>
                            <span class="text-xs text-white/45" x-text="previewLabel"></span>
                        </div>
                        <div class="h-4 rounded-full border border-white/15 transition-[background-color,box-shadow] duration-150"
                             :style="previewColor ? `background:${previewColor};box-shadow:0 0 24px ${previewColor}` : 'background:rgba(255,255,255,0.08)'"></div>
                    </div>

                    {{-- Save --}}
                    <div class="mt-6 flex flex-wrap items-center gap-3">
                        <button type="button" @click="save()" :disabled="busy"
                                class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2 rounded-lg transition">
                            Save
                        </button>
                        <span x-show="message" x-text="message" class="text-sm" :class="error ? 'text-red-400' : 'text-emerald-300'"></span>
                    </div>
                </section>
            @endforeach
        </div>
    </div>

    <script>
        function lightCard(office) {
            const s = office.settings;
            return {
                officeId: office.id,
                name: office.name,
                hasToken: s.has_token,
                lights: [],
                busy: false,
                message: '',
                error: false,
                previewColor: null,
                previewLabel: '',
                previewTimers: [],
                events: [
                    { key: 'point', label: 'Point scored' },
                    { key: 'win', label: 'Match won' },
                ],
                form: {
                    enabled: s.enabled,
                    ha_url: s.ha_url,
                    ha_token: '',
                    entity_id: s.entity_id,
                    left_color: s.left_color,
                    right_color: s.right_color,
                    brightness: s.brightness,
                    animations: JSON.parse(JSON.stringify(s.animations)),
                },

                async request(method, path, extra = {}) {
                    this.busy = true;
                    this.message = '';
                    this.error = false;
                    try {
                        const res = await fetch(`/games/ping-pong/lights/${this.officeId}${path}`, {
                            method,
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
                            },
                            body: JSON.stringify({ ...this.form, ...extra }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            const first = data.errors ? Object.values(data.errors)[0][0] : null;
                            throw new Error(first || data.message || 'Something went wrong.');
                        }
                        return data;
                    } catch (err) {
                        this.error = true;
                        this.message = err.message;
                        return null;
                    } finally {
                        this.busy = false;
                    }
                },

                async save() {
                    const data = await this.request('PUT', '');
                    if (!data) return;
                    this.hasToken = data.has_token;
                    this.form.ha_url = data.ha_url;
                    this.form.ha_token = '';
                    this.message = 'Saved.';
                },

                async testConnection() {
                    const data = await this.request('POST', '/test-connection');
                    if (!data) return;
                    this.lights = data.lights;
                    this.message = data.lights.length
                        ? `Connected: ${data.lights.length} light${data.lights.length > 1 ? 's' : ''} found.`
                        : 'Connected, but Home Assistant has no lights.';
                },

                async test(event, side) {
                    this.preview(event, side);
                    const data = await this.request('POST', '/test', { event, side });
                    if (data) this.message = 'Playing on the light…';
                },

                // Plays the animation on the page's strip, step for step as the job does.
                preview(event, side) {
                    this.previewTimers.forEach(clearTimeout);
                    this.previewTimers = [];
                    const a = this.form.animations[event];
                    const color = side === 'left' ? this.form.left_color : this.form.right_color;
                    const flashes = Math.max(1, Number(a.flashes) || 1);
                    let at = 0;
                    const step = (fn) => this.previewTimers.push(setTimeout(fn, at));
                    this.previewLabel = `${event === 'win' ? 'Match won' : 'Point'}, ${side}`;
                    if (a.style === 'strobe') {
                        // Roughly the strip's pace: 100 ≈ 10 changes a second, slower as speed drops.
                        const half = Math.round(100 + (100 - (Number(a.speed) || 100)) * 9);
                        for (let t = 0, on = true; t < (Number(a.duration_ms) || 0); t += half, on = !on) {
                            const lit = on;
                            step(() => (this.previewColor = lit ? color : null));
                            at += half;
                        }
                        step(() => { this.previewColor = null; this.previewLabel = ''; });
                        return;
                    }
                    for (let i = 1; i <= flashes; i++) {
                        step(() => (this.previewColor = color));
                        at += Number(a.on_ms) || 0;
                        if (i < flashes && Number(a.off_ms) > 0) {
                            step(() => (this.previewColor = null));
                            at += Number(a.off_ms);
                        }
                    }
                    step(() => { this.previewColor = null; this.previewLabel = ''; });
                },
            };
        }
    </script>
@endsection
