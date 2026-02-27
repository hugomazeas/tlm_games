@props(['icon' => '📭', 'title' => 'Nothing here yet', 'message' => ''])

<div class="text-center py-16">
    <div class="text-5xl mb-4">{{ $icon }}</div>
    <h3 class="text-lg font-semibold text-white/70 mb-2">{{ $title }}</h3>
    @if($message)
        <p class="text-sm text-white/40 max-w-md mx-auto">{{ $message }}</p>
    @endif
</div>
