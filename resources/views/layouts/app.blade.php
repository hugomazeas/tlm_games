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
    <nav class="border-b border-white/10 bg-white/5 backdrop-blur">
        <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="{{ url('/') }}" class="text-xl font-bold tracking-tight">
                🎮 <span class="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Games Hub</span>
            </a>
            <div class="flex items-center gap-6 text-sm font-medium">
                <a href="{{ url('/') }}" class="text-white/70 hover:text-white transition {{ request()->is('/') ? 'text-white' : '' }}">Home</a>
                <a href="{{ url('/players') }}" class="text-white/70 hover:text-white transition {{ request()->is('players*') ? 'text-white' : '' }}">Players</a>
                <a href="{{ url('/leaderboards') }}" class="text-white/70 hover:text-white transition {{ request()->is('leaderboards*') ? 'text-white' : '' }}">Leaderboards</a>
            </div>
        </div>
    </nav>

    <main class="@yield('main-class', 'max-w-6xl mx-auto px-6 py-8')">
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
