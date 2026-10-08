{{--
    The Alpine twin of the player-avatar component, for names that arrive as JSON.
    Needs the player-avatar-script component on the page (layouts.app has it).
    `name` and `url` are Alpine expressions, e.g. name="p.player_name" url="p.avatar_url".
--}}
@props([
    'name' => 'null',
    'url' => 'null',
    'size' => 'md',
])

@php
    $sizeClasses = [
        'xs' => 'w-4 h-4 text-[7px]',
        'sm' => 'w-6 h-6 text-[10px]',
        'md' => 'w-8 h-8 text-xs',
        'lg' => 'w-16 h-16 sm:w-20 sm:h-20 text-xl sm:text-2xl',
        'scoreboard' => 'w-8 h-8 md:w-12 md:h-12 text-xs md:text-base',
    ][$size] ?? 'w-8 h-8 text-xs';
@endphp

<span {{ $attributes->class(['player-avatar inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden font-bold text-white/90 select-none ring-1 ring-white/15', $sizeClasses]) }}
      :style="({{ $url }}) ? '' : 'background: hsl(' + playerAvatarHue({{ $name }}) + ' 45% 32%)'"
      aria-hidden="true">
    <template x-if="{{ $url }}">
        <img :src="{{ $url }}" alt="" class="w-full h-full object-cover" loading="lazy" decoding="async">
    </template>
    <span x-show="!({{ $url }})" class="leading-none" x-text="playerInitials({{ $name }})"></span>
</span>
