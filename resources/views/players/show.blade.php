@extends('layouts.app')

@section('title', $player->name . ' - Games Hub')

@section('content')
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js"></script>
    <style>
        /* Round crop window: what you frame is what the avatar circle shows. */
        .avatar-cropper .cropper-view-box,
        .avatar-cropper .cropper-face { border-radius: 50%; }
        .avatar-cropper .cropper-view-box { outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: -1px; }
    </style>

    <div class="mb-6 sm:mb-8">
        <a href="{{ url('/players') }}" class="text-sm text-white/50 hover:text-white/70 transition">← Back to Players</a>
    </div>

    @php
        $canChangeProfile = $player->hasPin() && $isUnlocked;
    @endphp

    <div class="bg-white/5 border border-white/10 rounded-xl p-5 sm:p-8 mb-6 sm:mb-8"
         x-data="playerProfile({ uploadUrl: @js(url('/players/' . $player->id . '/avatar')), showPinForm: @js($errors->has('pin')) })">
        <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-4 sm:gap-6 min-w-0">
                <div class="relative shrink-0">
                    <x-player-avatar :player="$player" size="lg" />
                    @if($canChangeProfile)
                        <button type="button" @click="$refs.file.click()"
                                class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-500 border-2 border-[#0f172a] flex items-center justify-center text-xs transition"
                                title="{{ $player->avatarUrl() ? 'Change photo' : 'Add a photo' }}">
                            📷
                        </button>
                    @endif
                </div>
                <div class="min-w-0">
                    <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1.5 sm:mb-2 truncate">{{ $player->name }}</h1>
                    <p class="text-xs sm:text-sm text-white/40">
                        Member since {{ $player->created_at->format('M j, Y') }}
                        @if($player->hasPin())
                            · <span class="text-white/60">{{ $isUnlocked ? '🔓 Unlocked' : '🔒 Claimed' }}</span>
                        @endif
                    </p>
                </div>
            </div>
            {{-- Edit/Delete: hidden on mobile --}}
            @if($isUnlocked)
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
            @endif
        </div>

        {{-- Profile: claim with a PIN, unlock, or manage the photo --}}
        <div class="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-white/10">
            @if(! $player->hasPin())
                <div>
                    <p class="text-sm text-white/60">
                        Is this you? Set a 4-digit PIN to claim this profile and add a photo.
                        <button type="button" x-show="!showPinForm" @click="showPinForm = true" class="ml-1 font-semibold text-indigo-400 hover:text-indigo-300 transition">Claim profile</button>
                    </p>
                    <form x-show="showPinForm" x-cloak method="POST" action="{{ url('/players/' . $player->id . '/pin') }}" class="mt-4 flex flex-wrap items-end gap-3">
                        @csrf
                        @include('players.partials.pin-input', ['name' => 'pin', 'label' => 'New PIN'])
                        @include('players.partials.pin-input', ['name' => 'pin_confirmation', 'label' => 'Repeat PIN'])
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
                            Claim
                        </button>
                    </form>
                </div>
            @elseif(! $isUnlocked)
                <form method="POST" action="{{ url('/players/' . $player->id . '/unlock') }}" class="flex flex-wrap items-end gap-3">
                    @csrf
                    @include('players.partials.pin-input', ['name' => 'pin', 'label' => 'PIN to change this profile'])
                    <button type="submit" class="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
                        Unlock
                    </button>
                </form>
            @else
                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" @click="$refs.file.click()"
                            class="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition font-semibold">
                        {{ $player->avatarUrl() ? 'Change photo' : 'Add a photo' }}
                    </button>
                    @if($player->avatarUrl())
                        <form method="POST" action="{{ url('/players/' . $player->id . '/avatar') }}"
                              onsubmit="return confirm('Remove your photo?')">
                            @csrf
                            @method('DELETE')
                            <button type="submit" class="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition font-medium">
                                Remove photo
                            </button>
                        </form>
                    @endif
                    <button type="button" @click="showPinForm = !showPinForm"
                            class="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition font-medium">
                        Change PIN
                    </button>
                    <form method="POST" action="{{ url('/players/' . $player->id . '/lock') }}">
                        @csrf
                        <button type="submit" class="text-sm text-white/50 hover:text-white/80 px-3 py-2 transition font-medium">
                            🔒 Lock
                        </button>
                    </form>

                    <form x-show="showPinForm" x-cloak method="POST" action="{{ url('/players/' . $player->id . '/pin') }}"
                          class="basis-full mt-3 flex flex-wrap items-end gap-3">
                        @csrf
                        @include('players.partials.pin-input', ['name' => 'pin', 'label' => 'New PIN'])
                        @include('players.partials.pin-input', ['name' => 'pin_confirmation', 'label' => 'Repeat PIN'])
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
                            Save PIN
                        </button>
                    </form>
                </div>
            @endif

            @error('pin')
                <p class="text-red-400 text-xs mt-2">{{ $message }}</p>
            @enderror
        </div>

        @if($canChangeProfile)
            <input type="file" accept="image/*" class="hidden" x-ref="file" @change="pick($event)">

            {{-- Crop modal --}}
            <div x-show="cropping" x-cloak class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                 @keydown.escape.window="close()">
                <div class="w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl p-4 sm:p-5">
                    <h2 class="font-bold mb-3">Crop your photo</h2>
                    <div class="avatar-cropper aspect-square w-full bg-black/40 rounded-lg overflow-hidden">
                        <img x-ref="image" alt="" class="block max-w-full">
                    </div>
                    <p class="text-xs text-white/40 mt-2">Drag to move, pinch or scroll to zoom.</p>
                    <p x-show="error" x-text="error" class="text-red-400 text-xs mt-2"></p>
                    <div class="flex justify-end gap-2 mt-4">
                        <button type="button" @click="close()" class="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition font-medium">
                            Cancel
                        </button>
                        <button type="button" @click="save()" :disabled="saving"
                                class="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg transition font-semibold">
                            <span x-text="saving ? 'Saving…' : 'Save photo'"></span>
                        </button>
                    </div>
                </div>
            </div>
        @endif
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

    <script>
        function playerProfile({ uploadUrl, showPinForm }) {
            let cropper = null;
            let objectUrl = null;

            return {
                cropping: false,
                showPinForm,
                saving: false,
                error: '',

                pick(event) {
                    const file = event.target.files[0];
                    event.target.value = '';
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                        alert('Pick an image file.');
                        return;
                    }

                    this.error = '';
                    this.cropping = true;
                    objectUrl = URL.createObjectURL(file);
                    this.$refs.image.src = objectUrl;
                    this.$nextTick(() => {
                        cropper?.destroy();
                        cropper = new Cropper(this.$refs.image, {
                            aspectRatio: 1,
                            viewMode: 1,
                            dragMode: 'move',
                            autoCropArea: 1,
                            background: false,
                            guides: false,
                            center: false,
                            toggleDragModeOnDblclick: false,
                        });
                    });
                },

                close() {
                    if (this.saving) return;
                    this.cropping = false;
                    cropper?.destroy();
                    cropper = null;
                    if (objectUrl) URL.revokeObjectURL(objectUrl);
                    objectUrl = null;
                },

                save() {
                    if (!cropper) return;
                    this.saving = true;
                    this.error = '';

                    // The server shrinks it to 256px; 512 keeps it sharp through that.
                    const canvas = cropper.getCroppedCanvas({
                        width: 512,
                        height: 512,
                        fillColor: '#fff',
                        imageSmoothingQuality: 'high',
                    });

                    canvas.toBlob(async (blob) => {
                        const body = new FormData();
                        body.append('avatar', blob, 'avatar.jpg');

                        try {
                            const response = await fetch(uploadUrl, {
                                method: 'POST',
                                headers: {
                                    'Accept': 'application/json',
                                    'X-CSRF-TOKEN': document.querySelector('meta[name=csrf-token]').content,
                                },
                                body,
                            });

                            if (!response.ok) {
                                const data = await response.json().catch(() => ({}));
                                throw new Error(data.errors?.avatar?.[0] || data.message || 'Upload failed.');
                            }

                            window.location.reload();
                        } catch (e) {
                            this.error = e.message;
                            this.saving = false;
                        }
                    }, 'image/jpeg', 0.9);
                },
            };
        }
    </script>
@endsection
