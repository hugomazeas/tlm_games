@props([
    'player' => null,
    'name' => null,
    'url' => null,
    'size' => 'md',
])

@php
    $name ??= $player?->name;
    $url ??= $player?->avatarUrl();

    // Same hash as playerAvatarHue() in player-avatar-script, so a player's
    // initials circle is the same colour whether Blade or Alpine drew it.
    $hue = 0;
    foreach (mb_str_split((string) $name) as $character) {
        $hue = ($hue * 31 + mb_ord($character)) % 360;
    }

    $sizeClasses = [
        'xs' => 'w-4 h-4 text-[7px]',
        'sm' => 'w-6 h-6 text-[10px]',
        'md' => 'w-8 h-8 text-xs',
        'lg' => 'w-16 h-16 sm:w-20 sm:h-20 text-xl sm:text-2xl',
        'scoreboard' => 'w-8 h-8 md:w-12 md:h-12 text-xs md:text-base',
    ][$size] ?? 'w-8 h-8 text-xs';
@endphp

<span {{ $attributes->class(['player-avatar inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden font-bold text-white/90 select-none ring-1 ring-white/15', $sizeClasses]) }}
      @unless($url) style="background: hsl({{ $hue }} 45% 32%)" @endunless
      aria-hidden="true">
    @if($url)
        <img src="{{ $url }}" alt="" class="w-full h-full object-cover" loading="lazy" decoding="async">
    @else
        <span class="leading-none">{{ \App\Models\Player::initialsFor($name) }}</span>
    @endif
</span>
