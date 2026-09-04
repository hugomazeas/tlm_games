@extends('layouts.app')

@section('title', 'Match of the hour - Games Hub')

@section('content')
    <div class="max-w-2xl" x-data="challengeBoard()">
        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Match of the hour</h1>
        <p class="text-white/50 text-sm mb-8">
            Drawn on the half hour from whoever booked a desk today. If someone's already gone home,
            anyone can re-roll it — no need to wait for the next hour.
        </p>

        @forelse($challenges as $challenge)
            <div class="bg-white/5 border border-white/10 rounded-xl p-5 sm:p-6 mb-4">
                <div class="flex items-center justify-between gap-3 mb-1">
                    <span class="text-xs uppercase tracking-wider text-white/40">{{ $challenge->office->name }}</span>
                    <span class="text-xs text-white/40">{{ $challenge->scheduled_for->timezone(config('app.timezone'))->format('H:i') }}</span>
                </div>

                <div class="text-lg font-bold mb-4">
                    🏓 {{ $challenge->playerOne->name }} <span class="text-white/40">vs</span> {{ $challenge->playerTwo->name }}
                </div>

                @if($challenge->lobby)
                    <a href="{{ url('/games/ping-pong/lobby/' . $challenge->lobby->code) }}"
                       class="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition mb-5">
                        Open lobby {{ $challenge->lobby->code }}
                    </a>
                @endif

                <div class="border-t border-white/10 pt-4">
                    <p class="text-xs font-semibold text-white/60 mb-3">Someone not here?</p>
                    <div class="flex flex-wrap gap-2">
                        <button type="button"
                                @click="redraw({{ $challenge->id }}, {{ $challenge->player_one_id }})"
                                :disabled="busy"
                                class="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
                            {{ $challenge->playerOne->name }} is gone
                        </button>
                        <button type="button"
                                @click="redraw({{ $challenge->id }}, {{ $challenge->player_two_id }})"
                                :disabled="busy"
                                class="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
                            {{ $challenge->playerTwo->name }} is gone
                        </button>
                        <button type="button"
                                @click="redraw({{ $challenge->id }}, null)"
                                :disabled="busy"
                                class="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white/70 text-sm font-medium px-4 py-2 rounded-lg transition">
                            Just re-roll
                        </button>
                    </div>
                    <p class="text-xs text-white/40 mt-3">
                        Marking someone gone also keeps them out of the next few draws.
                    </p>
                </div>
            </div>
        @empty
            <x-empty-state icon="🏓" title="No match drawn right now"
                           message="A new pair is drawn on the half hour, weekdays between 09:30 and 16:30." />
        @endforelse

        <p x-show="message" x-cloak x-text="message"
           class="text-sm mt-2" :class="error ? 'text-red-300' : 'text-emerald-300'"></p>

        @if($recent->isNotEmpty())
            <h2 class="text-sm font-semibold text-white/60 mt-10 mb-3">Earlier today</h2>
            <div class="space-y-2">
                @foreach($recent as $past)
                    <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm">
                        <span>{{ $past->playerOne->name }} <span class="text-white/40">vs</span> {{ $past->playerTwo->name }}</span>
                        <span class="text-xs px-2 py-0.5 rounded
                            @class([
                                'bg-emerald-500/20 text-emerald-300' => $past->status === 'played',
                                'bg-white/10 text-white/50' => $past->status !== 'played',
                            ])">{{ $past->status }}</span>
                    </div>
                @endforeach
            </div>
        @endif
    </div>

    <script>
        function challengeBoard() {
            return {
                busy: false,
                message: '',
                error: false,
                csrf: document.querySelector('meta[name="csrf-token"]').content,

                async redraw(challengeId, absentPlayerId) {
                    this.busy = true;
                    this.error = false;
                    this.message = 'Re-rolling…';

                    try {
                        const response = await fetch('/games/ping-pong/api/challenges/' + challengeId + '/redraw', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'X-CSRF-TOKEN': this.csrf,
                            },
                            body: JSON.stringify({ absent_player_id: absentPlayerId }),
                        });

                        const result = await response.json();

                        if (!response.ok) {
                            throw new Error(result.error || 'That did not work.');
                        }

                        if (!result.redrawn) {
                            this.error = true;
                            this.message = result.reason === 'not_enough_players'
                                ? 'Nobody else is available to play right now.'
                                : 'Could not re-roll (' + result.reason + ').';
                            return;
                        }

                        const players = result.challenge.players.map((p) => p.name).join(' vs ');
                        this.message = 'New match: ' + players + '. Reloading…';
                        setTimeout(() => window.location.reload(), 1200);
                    } catch (err) {
                        this.error = true;
                        this.message = err.message || 'Could not re-roll.';
                    } finally {
                        this.busy = false;
                    }
                },
            };
        }
    </script>
@endsection
