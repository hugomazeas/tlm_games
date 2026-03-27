@extends('layouts.app')

@section('title', 'Recordings - Ping Pong')
@section('main-class', 'max-w-5xl mx-auto px-6 py-6')

@section('content')
<style>
    .rec .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid rgba(255,255,255,0.1);
    }
    .rec .header h1 { font-size: 1.6rem; font-weight: 800; color: #3b82f6; }
    .rec .back-link {
        color: #3b82f6;
        text-decoration: none;
        font-weight: 600;
        padding: 8px 16px;
        border: 2px solid #3b82f6;
        border-radius: 8px;
        transition: all 0.2s;
    }
    .rec .back-link:hover { background: #3b82f6; color: white; }

    .rec .empty {
        text-align: center;
        padding: 60px 20px;
        color: rgba(255,255,255,0.4);
    }
    .rec .empty-icon { font-size: 3rem; margin-bottom: 12px; }
    .rec .empty h2 { color: rgba(255,255,255,0.6); font-size: 1.2rem; margin-bottom: 8px; }

    .rec .recordings-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .rec .recording-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 20px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        transition: all 0.2s;
    }
    .rec .recording-card:hover {
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.12);
    }

    .rec .rec-status {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .rec .rec-status.completed { background: #22c55e; }
    .rec .rec-status.recording { background: #ef4444; animation: pulse-rec 1.5s infinite; }
    .rec .rec-status.failed { background: #6b7280; }

    .rec .rec-info { flex: 1; min-width: 0; }
    .rec .rec-players {
        font-weight: 700;
        font-size: 1rem;
        color: rgba(255,255,255,0.9);
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .rec .rec-players .left { color: #fb7185; }
    .rec .rec-players .right { color: #22d3ee; }
    .rec .rec-players .vs { color: rgba(255,255,255,0.3); font-weight: 600; font-size: 0.85rem; }
    .rec .rec-score {
        font-weight: 800;
        font-size: 0.9rem;
        color: rgba(255,255,255,0.5);
    }
    .rec .rec-meta {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 0.8rem;
        color: rgba(255,255,255,0.35);
    }
    .rec .rec-meta .badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
        font-size: 0.7rem;
        text-transform: uppercase;
    }
    .rec .rec-meta .badge.completed { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .rec .rec-meta .badge.recording { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

    .rec .rec-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .rec .btn {
        padding: 6px 14px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .rec .btn-play {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
        border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .rec .btn-play:hover { background: rgba(59, 130, 246, 0.25); }
    .rec .btn-match {
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.6);
        border: 1px solid rgba(255,255,255,0.1);
    }
    .rec .btn-match:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
    .rec .btn-delete {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .rec .btn-delete:hover { background: rgba(239, 68, 68, 0.2); }

    .rec .confirm-delete {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 8px;
    }
    .rec .confirm-delete span { color: rgba(255,255,255,0.7); font-size: 0.75rem; }
    .rec .confirm-delete button {
        padding: 3px 10px;
        border: none;
        border-radius: 5px;
        font-weight: 600;
        font-size: 0.7rem;
        cursor: pointer;
    }
    .rec .confirm-yes { background: #ef4444; color: white; }
    .rec .confirm-yes:hover { background: #dc2626; }
    .rec .confirm-no { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
    .rec .confirm-no:hover { background: rgba(255,255,255,0.15); }

    .rec .video-preview {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.9);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .rec .video-preview-inner {
        position: relative;
        width: 90%;
        max-width: 900px;
        aspect-ratio: 16/9;
        background: #000;
        border-radius: 12px;
        overflow: hidden;
    }
    .rec .video-preview video {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    .rec .video-preview-close {
        position: absolute;
        top: -40px;
        right: 0;
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 4px 12px;
    }

    @keyframes pulse-rec {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    @media (max-width: 640px) {
        .rec .recording-card { flex-direction: column; align-items: flex-start; gap: 10px; }
        .rec .rec-actions { width: 100%; justify-content: flex-end; }
    }
</style>

<div class="rec" x-data="recordingsPage()" x-init="init()">
    <div class="header">
        <h1>Recordings</h1>
        <div style="display:flex;gap:8px;align-items:center;">
            <a href="/games/ping-pong/watch" class="back-link" style="background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.4);color:#ef4444;" onmouseenter="this.style.background='#ef4444';this.style.color='#fff'" onmouseleave="this.style.background='rgba(239,68,68,0.12)';this.style.color='#ef4444'">Live Stream</a>
            <a href="/games/ping-pong" class="back-link">&larr; Back to Play</a>
        </div>
    </div>

    <!-- Loading -->
    <div x-show="loading" style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);">Loading recordings...</div>

    <!-- Empty -->
    <template x-if="!loading && recordings.length === 0">
        <div class="empty">
            <div class="empty-icon">&#127909;</div>
            <h2>No Recordings Yet</h2>
            <p>Match recordings will appear here once you start recording games.</p>
        </div>
    </template>

    <!-- Recordings list -->
    <div class="recordings-list" x-show="!loading && recordings.length > 0">
        <template x-for="rec in recordings" :key="rec.id">
            <div class="recording-card">
                <div class="rec-status" :class="rec.status"></div>
                <div class="rec-info">
                    <div class="rec-players">
                        <span class="left" x-text="rec.player_left || '?'"></span>
                        <span class="vs">vs</span>
                        <span class="right" x-text="rec.player_right || '?'"></span>
                        <span class="rec-score" x-text="rec.player_left_score + ' - ' + rec.player_right_score"></span>
                    </div>
                    <div class="rec-meta">
                        <span class="badge" :class="rec.status" x-text="rec.status"></span>
                        <span x-text="rec.file_size ? (rec.file_size / 1048576).toFixed(1) + ' MB' : ''"></span>
                        <span x-text="rec.duration_seconds ? formatDuration(rec.duration_seconds) : ''"></span>
                        <span x-text="formatDate(rec.created_at)"></span>
                    </div>
                </div>
                <div class="rec-actions">
                    <template x-if="rec.status === 'completed' && rec.video_url">
                        <button class="btn btn-play" @click="previewVideo(rec.video_url)">Play</button>
                    </template>
                    <a :href="'/games/ping-pong/matches/' + rec.match_id" class="btn btn-match">Match</a>
                    <template x-if="confirmId !== rec.id">
                        <button class="btn btn-delete" @click="confirmId = rec.id">Delete</button>
                    </template>
                    <template x-if="confirmId === rec.id">
                        <div class="confirm-delete">
                            <span>Delete?</span>
                            <button class="confirm-yes" @click="deleteRecording(rec.id)">Yes</button>
                            <button class="confirm-no" @click="confirmId = null">No</button>
                        </div>
                    </template>
                </div>
            </div>
        </template>
    </div>

    <!-- Video preview overlay -->
    <template x-if="previewUrl">
        <div class="video-preview" @click.self="previewUrl = null">
            <div class="video-preview-inner">
                <button class="video-preview-close" @click="previewUrl = null">&times;</button>
                <video controls autoplay :src="previewUrl"></video>
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
