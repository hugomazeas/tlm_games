@extends('layouts.app')

@section('title', 'Edit ' . $player->name . ' - Games Hub')

@section('content')
    <div class="mb-8">
        <a href="{{ url('/players/' . $player->id) }}" class="text-sm text-white/50 hover:text-white/70 transition">← Back to {{ $player->name }}</a>
    </div>

    <div class="max-w-lg">
        <h1 class="text-2xl font-extrabold tracking-tight mb-6">Edit Player</h1>

        <form method="POST" action="{{ url('/players/' . $player->id) }}">
            @csrf
            @method('PUT')

            <div class="mb-6">
                <label for="name" class="block text-sm font-medium text-white/70 mb-2">Name</label>
                <input type="text" id="name" name="name" value="{{ old('name', $player->name) }}" required
                       class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                @error('name')
                    <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
                @enderror
            </div>

            <div class="mb-6">
                <label for="office_id" class="block text-sm font-medium text-white/70 mb-2">Office</label>
                <select id="office_id" name="office_id"
                        class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    <option value="">No office</option>
                    @foreach($offices as $office)
                        <option value="{{ $office->id }}" @selected((string) old('office_id', $player->office_id) === (string) $office->id)>
                            {{ $office->name }}
                        </option>
                    @endforeach
                </select>
                @error('office_id')
                    <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
                @enderror
            </div>

            <div class="flex gap-3">
                <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2 rounded-lg transition">
                    Save Changes
                </button>
                <a href="{{ url('/players/' . $player->id) }}" class="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-6 py-2 rounded-lg transition">
                    Cancel
                </a>
            </div>
        </form>
    </div>
@endsection
