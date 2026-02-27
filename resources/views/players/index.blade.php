@extends('layouts.app')

@section('title', 'Players - Games Hub')

@section('content')
    <div class="flex items-center justify-between mb-8">
        <div>
            <h1 class="text-3xl font-extrabold tracking-tight mb-1">Players</h1>
            <p class="text-white/50 text-sm">{{ $players->count() }} registered {{ Str::plural('player', $players->count()) }}</p>
        </div>
    </div>

    {{-- Inline create form --}}
    <div class="bg-white/5 border border-white/10 rounded-xl p-6 mb-8" x-data="{ open: false }">
        <button @click="open = !open" class="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition">
            <span x-show="!open">+ Add Player</span>
            <span x-show="open" x-cloak>− Cancel</span>
        </button>
        <form x-show="open" x-cloak method="POST" action="{{ url('/players') }}" class="mt-4 flex gap-3">
            @csrf
            <input type="text" name="name" placeholder="Player name" required
                   class="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                   value="{{ old('name') }}">
            <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2 rounded-lg transition">
                Add
            </button>
        </form>
        @error('name')
            <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
        @enderror
    </div>

    {{-- Player list --}}
    @if($players->isEmpty())
        <x-empty-state icon="👥" title="No players yet" message="Add your first player to get started." />
    @else
        <div class="space-y-2">
            @foreach($players as $player)
                <a href="{{ url('/players/' . $player->id) }}"
                   class="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-5 py-3 hover:bg-white/10 transition group">
                    <div>
                        <span class="font-semibold">{{ $player->name }}</span>
                        <span class="text-xs text-white/40 ml-3">Joined {{ $player->created_at->diffForHumans() }}</span>
                    </div>
                    <span class="text-white/30 group-hover:text-white/60 transition text-sm">→</span>
                </a>
            @endforeach
        </div>
    @endif
@endsection
