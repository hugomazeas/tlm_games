@extends('layouts.app')

@section('title', 'Offices - Games Hub')

@section('content')
    <div class="flex items-center justify-between mb-6 sm:mb-8">
        <div>
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Offices</h1>
            <p class="text-white/50 text-sm">{{ $offices->count() }} {{ Str::plural('office', $offices->count()) }}</p>
        </div>
    </div>

    <div class="hidden sm:block bg-white/5 border border-white/10 rounded-xl p-6 mb-8" x-data="{ open: false }">
        <button @click="open = !open" class="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition">
            <span x-show="!open">+ Add Office</span>
            <span x-show="open" x-cloak>− Cancel</span>
        </button>
        <form x-show="open" x-cloak method="POST" action="{{ url('/offices') }}" class="mt-4 flex gap-3">
            @csrf
            <input type="text" name="name" placeholder="Office name" required
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

    {{-- Mobile: simple create always visible --}}
    <div class="sm:hidden bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
        <h2 class="text-sm font-semibold text-white/80 mb-3">New office</h2>
        <form method="POST" action="{{ url('/offices') }}" class="flex flex-col gap-3">
            @csrf
            <input type="text" name="name" placeholder="Office name" required
                   class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                   value="{{ old('name') }}">
            <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2 rounded-lg transition w-full">
                Add office
            </button>
        </form>
        @error('name')
            <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
        @enderror
    </div>

    @if($offices->isEmpty())
        <x-empty-state icon="🏢" title="No offices yet" message="Add an office to assign players and use ping-pong office leaderboards." />
    @else
        <div class="space-y-2">
            @foreach($offices as $office)
                <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 sm:px-5 py-3 gap-3">
                    <div class="min-w-0">
                        <span class="font-semibold text-sm sm:text-base">{{ $office->name }}</span>
                        <span class="text-xs text-white/40 ml-2 sm:ml-3 hidden sm:inline">{{ $office->players_count }} {{ Str::plural('player', $office->players_count) }}</span>
                    </div>
                    <a href="{{ url('/offices/' . $office->id . '/edit') }}"
                       class="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition font-medium flex-shrink-0">
                        Edit
                    </a>
                </div>
            @endforeach
        </div>
    @endif
@endsection
