@extends('layouts.app')

@section('title', $player->name . ' - Games Hub')

@section('content')
    <div class="mb-6 sm:mb-8">
        <a href="{{ url('/players') }}" class="text-sm text-white/50 hover:text-white/70 transition">← Back to Players</a>
    </div>

    <div class="bg-white/5 border border-white/10 rounded-xl p-5 sm:p-8 mb-6 sm:mb-8">
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1.5 sm:mb-2 truncate">{{ $player->name }}</h1>
                <p class="text-xs sm:text-sm text-white/40">Member since {{ $player->created_at->format('M j, Y') }}</p>
            </div>
            {{-- Edit/Delete: hidden on mobile --}}
            <div class="hidden sm:flex gap-2 flex-shrink-0">
                <a href="{{ url('/players/' . $player->id . '/edit') }}"
                   class="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition font-medium">
                    Edit
                </a>
                <form method="POST" action="{{ url('/players/' . $player->id) }}"
                      onsubmit="return confirm('Delete this player?')">
                    @csrf
                    @method('DELETE')
                    <button type="submit" class="text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg transition font-medium">
                        Delete
                    </button>
                </form>
            </div>
        </div>
    </div>

    <h2 class="text-base sm:text-lg font-bold mb-3 sm:mb-4">Game Stats</h2>
    @if(empty($gameStats))
        <x-empty-state icon="🎮" title="No game stats yet" message="This player hasn't participated in any games." />
    @else
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            @foreach($gameStats as $stat)
                <div class="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-5">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-xl sm:text-2xl">{{ $stat['icon'] }}</span>
                        <h3 class="font-bold text-sm sm:text-base" style="color: {{ $stat['color'] }}">{{ $stat['name'] }}</h3>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        @foreach($stat['stats'] as $key => $value)
                            <div class="text-xs">
                                <span class="text-white/40">{{ $key }}</span>
                                <span class="block text-white font-semibold">{{ $value }}</span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endforeach
        </div>
    @endif
@endsection
