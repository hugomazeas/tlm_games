@extends('layouts.app')

@section('title', 'Recordings - Ping Pong')
@section('main-class', 'px-4 py-4')

@section('content')
@include('games.ping-pong.partials.chrome', ['pageTitle' => 'Recordings'])

<div class="pph-stage relative rounded-3xl p-4 md:p-7 overflow-x-hidden" x-data="recordingsPage()" x-init="init()">

    <div class="flex items-center justify-end gap-2 mb-5">
        <a href="/games/ping-pong/watch"
           class="px-3 py-1.5 rounded-full bg-[#ff5a4a]/15 border border-[#ff5a4a]/40 text-[#ff5a4a] no-underline text-xs font-semibold transition hover:bg-[#ff5a4a] hover:text-[#06081b]">Live stream</a>
    </div>

    {{-- Loading --}}
    <div x-show="loading" class="text-center py-16 pph-mono text-xs tracking-[0.2em] uppercase text-[#f5ecd6]/45">Loading recordings…</div>

    {{-- Empty --}}
    <template x-if="!loading && recordings.length === 0">
        <div class="text-center py-16 px-5">
            <div class="text-5xl mb-4">📼</div>
            <h2 class="pph-display text-[24px] tracking-[0.04em] uppercase text-[#f5ecd6] mb-2">No recordings yet</h2>
            <p class="pph-mono text-[12px] tracking-[0.14em] text-[#f5ecd6]/45">Match recordings will appear here once you start recording games.</p>
        </div>
    </template>

    {{-- List --}}
    <div class="flex flex-col gap-3" x-show="!loading && recordings.length > 0">
        <template x-for="rec in recordings" :key="rec.id">
            <div class="flex items-center flex-wrap gap-4 px-5 py-4 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.03] to-[#f5ecd6]/[0.01] transition hover:bg-[#f5ecd6]/[0.05] hover:border-[#f5ecd6]/25">
                {{-- Status dot --}}
                <span class="w-2.5 h-2.5 rounded-full shrink-0"
                      :class="{
                          'bg-[#9be7c4]': rec.status === 'completed',
                          'bg-[#ff5a4a] pph-flicker': rec.status === 'recording',
                          'bg-[#f5ecd6]/30': rec.status === 'failed',
                      }"></span>

                {{-- Info --}}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1.5 font-bold text-base text-[#f5ecd6]">
                        <span class="text-[#ff5a4a] truncate" x-text="rec.player_left || '?'"></span>
                        <span class="pph-mono text-[10px] uppercase tracking-[0.18em] text-[#f5ecd6]/30">vs</span>
                        <span class="text-[#3ec8ff] truncate" x-text="rec.player_right || '?'"></span>
                        <span class="pph-mono ml-2 font-bold text-[13px] text-[#f5ecd6]/55 tabular-nums" x-text="rec.player_left_score + ' · ' + rec.player_right_score"></span>
                    </div>
                    <div class="flex items-center flex-wrap gap-3 pph-mono text-[11px] tracking-[0.06em] text-[#f5ecd6]/45">
                        <span class="px-2 py-0.5 rounded font-bold text-[10px] uppercase tracking-[0.14em]"
                              :class="{
                                  'bg-[#9be7c4]/15 text-[#9be7c4]': rec.status === 'completed',
                                  'bg-[#ff5a4a]/15 text-[#ff5a4a]': rec.status === 'recording',
                                  'bg-[#f5ecd6]/10 text-[#f5ecd6]/55': rec.status === 'failed',
                              }"
                              x-text="rec.status"></span>
                        <span x-text="rec.file_size ? (rec.file_size / 1048576).toFixed(1) + ' MB' : ''"></span>
                        <span x-text="rec.duration_seconds ? formatDuration(rec.duration_seconds) : ''"></span>
                        <span x-text="formatDate(rec.created_at)"></span>
                    </div>
                </div>

                {{-- Actions --}}
                <div class="flex items-center gap-2 shrink-0">
                    <template x-if="rec.status === 'completed' && rec.video_url">
                        <button class="px-3.5 py-1.5 rounded-full bg-[#3ec8ff]/15 border border-[#3ec8ff]/40 text-[#3ec8ff] text-xs font-semibold cursor-pointer transition hover:bg-[#3ec8ff]/25"
                                @click="previewVideo(rec.video_url)">▶ Play</button>
                    </template>
                    <a :href="'/games/ping-pong/matches/' + rec.match_id"
                       class="px-3.5 py-1.5 rounded-full bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 text-[#f5ecd6]/70 text-xs font-semibold no-underline transition hover:bg-[#f5ecd6]/10 hover:text-[#f5ecd6]">Match</a>
                    <template x-if="confirmId !== rec.id">
                        <button class="px-3.5 py-1.5 rounded-full bg-[#ff5a4a]/10 border border-[#ff5a4a]/30 text-[#ff5a4a] text-xs font-semibold cursor-pointer transition hover:bg-[#ff5a4a]/20"
                                @click="confirmId = rec.id">Delete</button>
                    </template>
                    <template x-if="confirmId === rec.id">
                        <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#ff5a4a]/15 border border-[#ff5a4a]/40">
                            <span class="pph-mono text-[10px] uppercase tracking-[0.14em] text-[#f5ecd6]/70">Delete?</span>
                            <button class="px-2.5 py-0.5 rounded-full bg-[#ff5a4a] text-[#06081b] font-bold text-[10px] uppercase tracking-[0.1em] cursor-pointer hover:bg-[#ff7a6a]"
                                    @click="deleteRecording(rec.id)">Yes</button>
                            <button class="px-2.5 py-0.5 rounded-full bg-[#f5ecd6]/10 text-[#f5ecd6]/70 font-bold text-[10px] uppercase tracking-[0.1em] cursor-pointer hover:bg-[#f5ecd6]/15"
                                    @click="confirmId = null">No</button>
                        </div>
                    </template>
                </div>
            </div>
        </template>
    </div>

    {{-- Video preview overlay --}}
    <template x-if="previewUrl">
        <div class="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center" @click.self="previewUrl = null">
            <div class="relative w-[90%] max-w-[900px] aspect-video bg-black rounded-xl overflow-hidden">
                <button class="absolute -top-10 right-0 bg-transparent border-0 text-white text-2xl cursor-pointer px-3 py-1"
                        @click="previewUrl = null">×</button>
                <video class="w-full h-full object-contain" controls autoplay :src="previewUrl"></video>
            </div>
        </div>
    </template>
</div>

<script>
function recordingsPage() {
    return {
        recordings: [],
        loading: true,
        confirmId: null,
        previewUrl: null,
        csrf: document.querySelector('meta[name="csrf-token"]')?.content,

        async init() {
            await this.loadRecordings();
        },

        async loadRecordings() {
            this.loading = true;
            try {
                const res = await fetch('/games/ping-pong/api/recordings');
                if (res.ok) this.recordings = await res.json();
            } catch (e) {
                console.error('Failed to load recordings:', e);
            }
            this.loading = false;
        },

        async deleteRecording(id) {
            try {
                const res = await fetch('/games/ping-pong/api/recordings/' + id, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-TOKEN': this.csrf, 'Accept': 'application/json' },
                });
                if (res.ok) {
                    this.recordings = this.recordings.filter(r => r.id !== id);
                }
            } catch (e) {
                console.error('Failed to delete recording:', e);
            }
            this.confirmId = null;
        },

        previewVideo(url) {
            this.previewUrl = url;
        },

        formatDuration(seconds) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return m + ':' + String(s).padStart(2, '0');
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        },
    };
}
</script>
@endsection
