@extends('layouts.app')

@section('title', $player->name . '’s locker - Hot Potato - Games Hub')

@section('content')
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">🎨 {{ $player->name }}’s locker</h1>
            <p class="text-white/50 text-sm">How you look in hot potato: everyone sees it, in games and in replays.</p>
        </div>
        <a href="{{ url('/games/hot-potato') }}" class="text-sm text-indigo-300 hover:text-indigo-200">← Hot Potato</a>
    </div>

    @if(! $claimed)
        <div class="mb-6 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm rounded-xl px-4 py-3" data-locker-unclaimed>
            Only the player can dress up their avatar: claim this profile with a PIN first.
            <a href="{{ url('/players/' . $player->id) }}" class="font-semibold underline">Claim {{ $player->name }}’s profile</a>
        </div>
    @elseif(! $canEdit)
        <form method="POST" action="{{ url('/players/' . $player->id . '/unlock') }}"
              class="mb-6 flex flex-wrap items-end gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3" data-locker-unlock>
            @csrf
            <input type="hidden" name="redirect" value="/games/hot-potato/locker/{{ $player->id }}">
            @include('players.partials.pin-input', ['name' => 'pin', 'label' => 'Enter your PIN to change your look'])
            <button type="submit" class="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
                Unlock
            </button>
        </form>
    @endif

    @php
        $config = [
            'playerId' => $player->id,
            'look' => $look,
            'catalogue' => $catalogue,
            'canEdit' => $canEdit,
            'saveUrl' => url('/games/hot-potato/locker/' . $player->id),
            'csrf' => csrf_token(),
        ];
    @endphp

    <div x-data="hotPotatoLocker(@js($config))" class="grid md:grid-cols-[14rem_1fr] gap-6">
        {{-- Preview: the avatar in its colour and hat, holding its potato --}}
        <div class="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center gap-3 self-start" data-locker-preview>
            <div class="relative mt-10">
                <span class="absolute left-1/2 -translate-x-1/2 -top-14 text-4xl" :style="skin === 'gold' ? 'text-shadow: 0 0 12px #facc15' : ''" x-text="optionValue('skin', skin)"></span>
                <span x-show="optionValue('hat', hat)" class="absolute left-1/2 -translate-x-1/2 -top-5 text-2xl z-10" x-text="optionValue('hat', hat)"></span>
                <div class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                     :style="'background:' + previewColour()" x-text="@js(mb_strtoupper(mb_substr($player->name, 0, 1)))"></div>
            </div>
            <p class="font-semibold">{{ $player->name }}</p>
            <p class="text-sm text-white/60">
                Trail <span x-text="optionValue('trail', trail) ?? '◌◌◌'"></span> ·
                Boom <span x-text="optionValue('boom', boom)"></span>
            </p>
        </div>

        <div class="space-y-5">
            <template x-for="slot in slots" :key="slot.id">
                <section>
                    <h2 class="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2" x-text="slot.label"></h2>
                    <div class="flex flex-wrap gap-1.5">
                        <template x-for="option in catalogue[slot.id]" :key="option.id">
                            <button type="button" @click="pick(slot.id, option.id)" :disabled="!canEdit" :title="option.label"
                                    :class="$data[slot.id] === option.id ? 'border-orange-400 bg-orange-500/20' : 'border-white/15 bg-white/5 hover:bg-white/10'"
                                    class="min-w-10 h-10 px-2 rounded-lg border text-xl transition disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center">
                                <template x-if="slot.id === 'colour'">
                                    <span class="w-6 h-6 rounded-full" :style="'background:' + (option.value ?? autoColour)"></span>
                                </template>
                                <template x-if="slot.id !== 'colour'">
                                    <span :style="option.id === 'gold' ? 'text-shadow: 0 0 8px #facc15' : ''"
                                          x-text="option.value ?? (slot.id === 'trail' ? '◌' : '∅')"></span>
                                </template>
                            </button>
                        </template>
                    </div>
                </section>
            </template>

            <div class="flex items-center gap-3">
                <button type="button" @click="save()" :disabled="!canEdit || busy || !dirty" data-locker-save
                        class="bg-orange-500 hover:bg-orange-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-lg px-5 py-2 text-sm transition">
                    <span x-text="busy ? 'Saving…' : 'Save'"></span>
                </button>
                <span x-show="message" class="text-sm" :class="failed ? 'text-red-300' : 'text-emerald-300'" x-text="message"></span>
            </div>
            <p class="text-xs text-white/40">In a lobby already? It picks up your new look when you go back to its tab.</p>
        </div>
    </div>

    <script>
        function hotPotatoLocker(config) {
            return {
                ...config.look,
                saved: { ...config.look },
                catalogue: config.catalogue,
                canEdit: config.canEdit,
                busy: false,
                failed: false,
                message: '',
                slots: [
                    { id: 'colour', label: 'Colour' },
                    { id: 'skin', label: 'Potato (while you hold it)' },
                    { id: 'hat', label: 'Hat' },
                    { id: 'trail', label: 'Trail (speed and boost)' },
                    { id: 'boom', label: 'Boom' },
                ],
                // Same as the game's colourFor (game-server/src/client/renderer.ts).
                autoColour: `hsl(${(config.playerId * 137.508) % 360} 70% 50%)`,

                get dirty() {
                    return this.slots.some(slot => this[slot.id] !== this.saved[slot.id]);
                },
                optionValue(slot, id) {
                    return this.catalogue[slot].find(option => option.id === id)?.value ?? null;
                },
                previewColour() {
                    return this.optionValue('colour', this.colour) ?? this.autoColour;
                },
                pick(slot, id) {
                    if (!this.canEdit) return;
                    this[slot] = id;
                    this.message = '';
                },
                async save() {
                    this.busy = true;
                    this.message = '';
                    try {
                        const look = Object.fromEntries(this.slots.map(slot => [slot.id, this[slot.id]]));
                        const response = await fetch(config.saveUrl, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': config.csrf },
                            body: JSON.stringify(look),
                        });
                        const body = await response.json().catch(() => ({}));
                        if (!response.ok) throw new Error(body.message || 'Could not save.');
                        this.saved = body;
                        this.failed = false;
                        this.message = 'Saved.';
                    } catch (error) {
                        this.failed = true;
                        this.message = error.message;
                    } finally {
                        this.busy = false;
                    }
                },
            };
        }
    </script>
@endsection
