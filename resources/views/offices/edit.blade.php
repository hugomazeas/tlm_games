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
