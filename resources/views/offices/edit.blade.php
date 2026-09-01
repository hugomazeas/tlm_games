@extends('layouts.app')

@section('title', 'Edit ' . $office->name . ' - Games Hub')

@section('content')
    <div class="mb-8">
        <a href="{{ url('/offices') }}" class="text-sm text-white/50 hover:text-white/70 transition">← Back to Offices</a>
    </div>

    <div class="max-w-lg">
        <h1 class="text-2xl font-extrabold tracking-tight mb-6">Edit Office</h1>

        <form method="POST" action="{{ url('/offices/' . $office->id) }}">
            @csrf
            @method('PUT')

            <div class="mb-6">
                <label for="name" class="block text-sm font-medium text-white/70 mb-2">Name</label>
                <input type="text" id="name" name="name" value="{{ old('name', $office->name) }}" required
                       class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                @error('name')
                    <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
                @enderror
            </div>

            <div class="border-t border-white/10 pt-6 mb-6" x-data="{ enabled: {{ old('matchmaking_enabled', $office->matchmaking_enabled) ? 'true' : 'false' }} }">
                <h2 class="text-sm font-semibold text-white/80 mb-1">🏓 Hourly ping pong matchmaking</h2>
                <p class="text-xs text-white/40 mb-4">
                    Draws two people who booked a desk in Buro today and pushes them a challenge
                    at half past each hour. Off unless you switch it on here.
                </p>

                <div class="mb-5">
                    <label for="buro_office_id" class="block text-sm font-medium text-white/70 mb-2">Buro office</label>
                    @if(is_array($buroOffices) && count($buroOffices) > 0)
                        <select id="buro_office_id" name="buro_office_id"
                                class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                            <option value="">Not linked</option>
                            @foreach($buroOffices as $buroOffice)
                                <option value="{{ $buroOffice['id'] }}" @selected(old('buro_office_id', $office->buro_office_id) === $buroOffice['id'])>
                                    {{ $buroOffice['name'] }} ({{ $buroOffice['timezone'] }})
                                </option>
                            @endforeach
                        </select>
                    @else
                        <input type="text" id="buro_office_id" name="buro_office_id"
                               value="{{ old('buro_office_id', $office->buro_office_id) }}"
                               placeholder="Buro office id"
                               class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        <p class="text-xs text-amber-300/70 mt-2">
                            Couldn't reach Buro to list its offices — paste the id manually, or check
                            <code class="font-mono bg-black/30 px-1 py-0.5 rounded">BURO_INTEGRATION_TOKEN</code>.
                        </p>
                    @endif
                    @error('buro_office_id')
                        <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
                    @enderror
                </div>

                <label class="flex items-center gap-3 mb-5 cursor-pointer">
                    <input type="hidden" name="matchmaking_enabled" value="0">
                    <input type="checkbox" name="matchmaking_enabled" value="1" x-model="enabled"
                           class="w-4 h-4 rounded border-white/20 bg-white/10 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0">
                    <span class="text-sm text-white/70">Enable hourly matchmaking for this office</span>
                </label>

                <div class="grid grid-cols-2 gap-4" :class="enabled ? '' : 'opacity-50'">
                    <div>
                        <label for="matchmaking_start" class="block text-sm font-medium text-white/70 mb-2">First draw</label>
                        <input type="time" id="matchmaking_start" name="matchmaking_start"
                               value="{{ old('matchmaking_start', $office->matchmaking_start) }}" required
                               class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        @error('matchmaking_start')
                            <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
                        @enderror
                    </div>
                    <div>
                        <label for="matchmaking_end" class="block text-sm font-medium text-white/70 mb-2">Last draw</label>
                        <input type="time" id="matchmaking_end" name="matchmaking_end"
                               value="{{ old('matchmaking_end', $office->matchmaking_end) }}" required
                               class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        @error('matchmaking_end')
                            <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
                        @enderror
                    </div>
                </div>
                <p class="text-xs text-white/40 mt-2">
                    Times are the office's own local time, as reported by Buro. Draws fire on the half hour,
                    weekdays only.
                </p>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2 rounded-lg transition">
                    Save Changes
                </button>
                <a href="{{ url('/offices') }}" class="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-6 py-2 rounded-lg transition">
                    Cancel
                </a>
            </div>
        </form>
    </div>
@endsection
