<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Games Hub')</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        'body': ['Outfit', 'sans-serif'],
                    },
                }
            }
        }
    </script>
    <style>
        [x-cloak] { display: none !important; }
        body { font-family: 'Outfit', sans-serif; }
        .gradient-bg {
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
        }
    </style>
</head>
<body class="gradient-bg text-white min-h-screen font-body">
    <nav class="border-b border-white/10 bg-white/5 backdrop-blur" x-data="{ mobileOpen: false }">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
            <a href="{{ url('/') }}" class="text-xl font-bold tracking-tight">
                🎮 <span class="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Games Hub</span>
            </a>

            {{-- Desktop nav --}}
            <div class="hidden sm:flex items-center gap-6 text-sm font-medium">
                <a href="{{ url('/') }}" class="text-white/70 hover:text-white transition {{ request()->is('/') ? 'text-white' : '' }}">Home</a>
                <a href="{{ url('/offices') }}" class="text-white/70 hover:text-white transition {{ request()->is('offices*') ? 'text-white' : '' }}">Offices</a>
                <a href="{{ url('/players') }}" class="text-white/70 hover:text-white transition {{ request()->is('players*') ? 'text-white' : '' }}">Players</a>
                <a href="{{ url('/leaderboards') }}" class="text-white/70 hover:text-white transition {{ request()->is('leaderboards*') ? 'text-white' : '' }}">Leaderboards</a>
            </div>

            {{-- Mobile hamburger --}}
            <button @click="mobileOpen = !mobileOpen" class="sm:hidden p-2 -mr-2 text-white/70 hover:text-white transition">
                <svg x-show="!mobileOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
                <svg x-show="mobileOpen" x-cloak class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>

        {{-- Mobile menu --}}
        <div x-show="mobileOpen" x-cloak
             x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="opacity-0 -translate-y-1"
             x-transition:enter-end="opacity-100 translate-y-0"
             x-transition:leave="transition ease-in duration-150"
             x-transition:leave-start="opacity-100 translate-y-0"
             x-transition:leave-end="opacity-0 -translate-y-1"
             class="sm:hidden border-t border-white/10 bg-white/5">
            <div class="px-4 py-3 space-y-1">
                <a href="{{ url('/') }}" class="block px-3 py-2.5 rounded-lg text-sm font-medium transition {{ request()->is('/') ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white' }}">Home</a>
                <a href="{{ url('/offices') }}" class="block px-3 py-2.5 rounded-lg text-sm font-medium transition {{ request()->is('offices*') ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white' }}">Offices</a>
                <a href="{{ url('/players') }}" class="block px-3 py-2.5 rounded-lg text-sm font-medium transition {{ request()->is('players*') ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white' }}">Players</a>
                <a href="{{ url('/leaderboards') }}" class="block px-3 py-2.5 rounded-lg text-sm font-medium transition {{ request()->is('leaderboards*') ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white' }}">Leaderboards</a>
            </div>
        </div>
    </nav>

    <main class="@yield('main-class', 'max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8')">
        @if(session('success'))
            <div class="mb-6 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-lg text-sm">
                {{ session('success') }}
            </div>
        @endif

        @if(session('error'))
            <div class="mb-6 bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm">
                {{ session('error') }}
            </div>
        @endif

        @yield('content')
    </main>
</body>
</html>
