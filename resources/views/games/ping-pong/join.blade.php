<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Join Ping Pong Lobby</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            min-height: 100%;
            font-family: 'Inter', sans-serif;
            background: #0f172a;
            color: white;
            -webkit-user-select: none;
            user-select: none;
        }

        .join-container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .join-header {
            text-align: center;
            padding: 20px 16px 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .join-header h1 {
            font-size: 1.4rem;
            font-weight: 800;
            background: linear-gradient(135deg, #3b82f6, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .join-header .lobby-code {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.4);
            margin-top: 2px;
        }

        .search-input {
            width: 100%;
            padding: 12px 16px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 12px;
            color: white;
            font-size: 1rem;
            outline: none;
        }

        .search-input:focus {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.1);
        }

        .search-input::placeholder {
            color: rgba(255,255,255,0.3);
        }

        .player-list {
            flex: 1;
            overflow-y: auto;
            padding: 0 16px 16px;
        }

        .player-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 16px;
            border-radius: 12px;
            background: rgba(255,255,255,0.05);
            border: 2px solid rgba(255,255,255,0.08);
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.15s;
        }

        .player-item:active {
            transform: scale(0.98);
            background: rgba(59, 130, 246, 0.15);
            border-color: #3b82f6;
        }

        .player-item .name {
            font-weight: 700;
            font-size: 1.1rem;
        }

        .player-item .elo {
            color: rgba(255,255,255,0.4);
            font-size: 0.9rem;
        }

        .create-player-section {
            padding: 12px 16px;
            display: flex;
            gap: 8px;
        }

        .create-btn {
            padding: 12px 20px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 700;
            font-size: 0.95rem;
            cursor: pointer;
            white-space: nowrap;
        }

        .create-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        /* Side selection screen */
        .side-panels {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 8px 16px;
            flex-shrink: 0;
        }

        .side-panel {
            border-radius: 12px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            transition: all 0.2s;
            border: 3px solid;
        }

        .side-panel.left {
            background: rgba(244, 63, 94, 0.1);
            border-color: rgba(244, 63, 94, 0.3);
        }

        .side-panel.right {
            background: rgba(6, 182, 212, 0.1);
            border-color: rgba(6, 182, 212, 0.3);
        }

        .side-panel.left.selected {
            background: rgba(244, 63, 94, 0.25);
            border-color: #fb7185;
            box-shadow: 0 0 20px rgba(244, 63, 94, 0.2);
        }

        .side-panel.right.selected {
            background: rgba(6, 182, 212, 0.25);
            border-color: #22d3ee;
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.2);
        }

        .side-panel:active {
            transform: scale(0.97);
        }

        .side-label {
            font-size: 0.85rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 6px;
        }

        .side-panel.left .side-label { color: #fb7185; }
        .side-panel.right .side-label { color: #22d3ee; }

        .side-player {
            padding: 6px 12px;
            border-radius: 8px;
            background: rgba(255,255,255,0.08);
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 0.95rem;
            text-align: center;
            width: 100%;
        }

        .side-player.is-me {
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(59, 130, 246, 0.4);
        }

        .waiting-indicator {
            text-align: center;
            padding: 16px;
            color: rgba(255,255,255,0.4);
            font-size: 0.9rem;
        }

        .waiting-indicator .dots::after {
            content: '';
            animation: dots 1.5s steps(3) infinite;
        }

        @keyframes dots {
            0% { content: ''; }
            33% { content: '.'; }
            66% { content: '..'; }
            100% { content: '...'; }
        }

        .reselect-player {
            cursor: pointer;
            padding: 8px 12px;
            border-radius: 10px;
            transition: background 0.15s;
        }

        .reselect-player:active {
            background: rgba(59, 130, 246, 0.2);
        }

        .qr-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 16px;
        }

        .qr-container {
            background: white;
            border-radius: 12px;
            padding: 12px;
        }

        .qr-lobby-code {
            font-size: 2rem;
            font-weight: 900;
            letter-spacing: 0.15em;
            color: #3b82f6;
        }

        .qr-join-url {
            font-size: 0.75rem;
            color: rgba(255,255,255,0.3);
            word-break: break-all;
            text-align: center;
            max-width: 250px;
        }

        .qr-label {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.5);
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="join-container" x-data="lobbyJoin()" x-init="init()">
        <div class="join-header">
            <h1>Ping Pong</h1>
            <div class="lobby-code" x-text="'Lobby ' + lobbyCode + ' • ' + lobbyMode"></div>
        </div>

        <!-- Screen 1: Player Selection -->
        <template x-if="screen === 'select'">
            <div style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
                <div class="create-player-section">
                    <input type="text"
                           class="search-input"
                           placeholder="Search or type new name..."
                           x-model="searchQuery"
                           @keydown.enter="handleEnter()">
                    <button class="create-btn"
                            :disabled="!canCreate"
                            @click="createAndJoin()">
                        Join
                    </button>
                </div>

                <div class="player-list">
                    <template x-for="player in filteredPlayers" :key="player.id">
                        <div class="player-item" @click="joinAsPlayer(player)">
                            <span class="name" x-text="player.name"></span>
                            <span class="elo" x-text="'ELO ' + player.elo_rating"></span>
                        </div>
                    </template>
                    <div x-show="filteredPlayers.length === 0 && searchQuery.length > 0"
                         style="text-align: center; padding: 24px; color: rgba(255,255,255,0.3);">
                        No players found — press Join to create "<span x-text="searchQuery"></span>"
                    </div>
                </div>
            </div>
        </template>

        <!-- Screen 2: Side Selection + Waiting -->
        <template x-if="screen === 'waiting'">
            <div style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
                <div style="padding: 12px 16px; text-align: center;">
                    <div class="reselect-player"
                         style="font-weight: 700; font-size: 1.1rem; display: inline-block;"
                         x-text="'You: ' + myPlayerName"
                         @click="reselectPlayer()"></div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 2px;">Tap your name to change player · Tap a side to switch</div>
                </div>

                <div class="qr-section" x-init="$nextTick(() => generateQr())">
                    <div class="qr-label">Share with opponent</div>
                    <div class="qr-container" id="joinQrContainer"></div>
                    <div class="qr-lobby-code" x-text="lobbyCode"></div>
                    <div class="qr-join-url" x-text="joinUrl"></div>
                </div>

                <div class="side-panels">
                    <div class="side-panel left" :class="{ 'selected': mySide === 'left' }" @click="switchSide('left')">
                        <div class="side-label">Left</div>
                        <template x-for="p in leftPlayers" :key="p.player_id">
                            <div class="side-player" :class="{ 'is-me': p.player_id === myPlayerId }" x-text="p.player_name"></div>
                        </template>
                    </div>
                    <div class="side-panel right" :class="{ 'selected': mySide === 'right' }" @click="switchSide('right')">
                        <div class="side-label">Right</div>
                        <template x-for="p in rightPlayers" :key="p.player_id">
                            <div class="side-player" :class="{ 'is-me': p.player_id === myPlayerId }" x-text="p.player_name"></div>
                        </template>
                    </div>
                </div>

                <div style="padding: 12px 16px; text-align: center;">
                    <button class="create-btn"
                            style="width: 100%; padding: 14px; font-size: 1.1rem;"
                            :disabled="!lobbyReady || starting"
                            @click="startGame()">
                        <span x-show="!starting">Start Game</span>
                        <span x-show="starting">Starting...</span>
                    </button>
                </div>
                <div class="waiting-indicator" x-show="!lobbyReady">
                    Waiting for players<span class="dots"></span>
                </div>
            </div>
        </template>

        <!-- Expired / error state -->
        <template x-if="screen === 'error'">
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px;">
                <div>
                    <div style="font-size: 1.5rem; font-weight: 800; margin-bottom: 8px;" x-text="errorTitle"></div>
                    <div style="color: rgba(255,255,255,0.4);" x-text="errorMessage"></div>
                </div>
            </div>
        </template>
    </div>

    <script>
    function lobbyJoin() {
        return {
            lobbyCode: @json($lobbyCode),
            lobbyMode: @json($lobbyMode),
            remoteUrl: window.location.origin,
            joinUrl: window.location.origin + '/games/ping-pong/lobby/' + @json($lobbyCode),
            API: '/games/ping-pong/api',
            csrf: document.querySelector('meta[name="csrf-token"]').content,

            screen: 'select',
            searchQuery: '',
            players: [],
            participants: [],

            myPlayerId: null,
            myPlayerName: '',
            mySide: null,
            sessionToken: null,

            errorTitle: '',
            errorMessage: '',
            starting: false,

            echo: null,

            async init() {
                // Check for stored session
                const stored = localStorage.getItem('lobby_' + this.lobbyCode);
                if (stored) {
                    try {
                        const data = JSON.parse(stored);
                        this.sessionToken = data.session_token;
                        this.myPlayerId = data.player_id;
                        this.myPlayerName = data.player_name;
                        this.mySide = data.side;
                    } catch (e) {
                        localStorage.removeItem('lobby_' + this.lobbyCode);
                    }
                }

                // Load lobby state
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}`);
                    const lobby = await res.json();

                    if (lobby.status === 'started' && lobby.match_id) {
                        // Match already started, redirect
                        if (this.mySide) {
                            window.location.href = `${this.remoteUrl}/games/ping-pong/remote/${lobby.match_id}/${this.mySide}`;
                            return;
                        }
                    }

                    if (lobby.status === 'expired') {
                        this.showError('Lobby Expired', 'This lobby is no longer active.');
                        return;
                    }

                    this.participants = lobby.participants || [];

                    // If we have a session, verify it's still valid
                    if (this.sessionToken) {
                        const stillIn = this.participants.find(p => p.player_id === this.myPlayerId);
                        if (stillIn) {
                            this.mySide = stillIn.side;
                            this.screen = 'waiting';
                            this.subscribeToLobby();
                            return;
                        } else {
                            // Session invalid, clear it
                            this.clearSession();
                        }
                    }
                } catch (err) {
                    this.showError('Error', 'Could not load lobby.');
                    return;
                }

                await this.loadPlayers();
                this.subscribeToLobby();

                // Auto-join with last chosen player if available
                if (this.screen === 'select') {
                    const lastPlayer = this.getLastPlayer();
                    if (lastPlayer) {
                        const player = this.players.find(p => p.id === lastPlayer.player_id);
                        if (player) {
                            await this.joinAsPlayer(player);
                            return;
                        }
                    }
                }
            },

            async loadPlayers() {
                try {
                    const res = await fetch(`${this.API}/players?mode=${this.lobbyMode}`);
                    this.players = await res.json();
                } catch (err) {
                    // Silently ignore
                }
            },

            subscribeToLobby() {
                this.echo = new Echo({
                    broadcaster: 'pusher',
                    key: 'games-hub-key',
                    wsHost: window.location.hostname,
                    wsPort: window.location.port || 80,
                    forceTLS: false,
                    disableStats: true,
                    enabledTransports: ['ws', 'wss'],
                    cluster: 'mt1',
                });

                this.echo.channel('ping-pong.lobby.' + this.lobbyCode)
                    .listen('.lobby.updated', (e) => {
                        this.participants = e.lobby.participants || [];
                        // Update my side if changed
                        if (this.myPlayerId) {
                            const me = this.participants.find(p => p.player_id === this.myPlayerId);
                            if (me) this.mySide = me.side;
                        }
                    })
                    .listen('.lobby.match-started', (e) => {
                        if (this.mySide) {
                            window.location.href = `${this.remoteUrl}/games/ping-pong/remote/${e.matchId}/${this.mySide}`;
                        }
                    });
            },

            get filteredPlayers() {
                if (!this.searchQuery) return this.players;
                const q = this.searchQuery.toLowerCase();
                return this.players.filter(p => p.name.toLowerCase().includes(q));
            },

            get canCreate() {
                return this.searchQuery.trim().length > 0;
            },

            get leftPlayers() {
                return this.participants.filter(p => p.side === 'left');
            },

            get rightPlayers() {
                return this.participants.filter(p => p.side === 'right');
            },

            get lobbyReady() {
                const needed = this.lobbyMode === '2v2' ? 2 : 1;
                return this.leftPlayers.length === needed && this.rightPlayers.length === needed;
            },

            handleEnter() {
                if (this.filteredPlayers.length === 1) {
                    this.joinAsPlayer(this.filteredPlayers[0]);
                } else if (this.filteredPlayers.length === 0 && this.canCreate) {
                    this.createAndJoin();
                }
            },

            async joinAsPlayer(player) {
                await this.doJoin({ player_id: player.id }, player.name);
            },

            async createAndJoin() {
                const name = this.searchQuery.trim();
                if (!name) return;
                await this.doJoin({ player_name: name }, name);
            },

            async doJoin(params, playerName) {
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/join`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify(params),
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        alert(err.error || 'Could not join lobby');
                        return;
                    }

                    const data = await res.json();
                    this.sessionToken = data.session_token;
                    this.myPlayerId = data.player_id;
                    this.myPlayerName = playerName;
                    this.mySide = data.side;

                    this.saveSession();
                    this.saveLastPlayer(this.myPlayerId, playerName);

                    // Refresh lobby state
                    const lobbyRes = await fetch(`${this.API}/lobbies/${this.lobbyCode}`);
                    const lobby = await lobbyRes.json();
                    this.participants = lobby.participants || [];

                    this.screen = 'waiting';
                } catch (err) {
                    alert('Error joining lobby');
                }
            },

            async reselectPlayer() {
                if (!this.sessionToken) return;
                try {
                    await fetch(`${this.API}/lobbies/${this.lobbyCode}/leave`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify({ session_token: this.sessionToken }),
                    });
                } catch (err) {
                    // Continue anyway so user can try again
                }
                this.clearSession();
                this.screen = 'select';
                await this.loadPlayers();
            },

            async switchSide(side) {
                if (!this.sessionToken || side === this.mySide) return;
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/side`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify({
                            session_token: this.sessionToken,
                            side: side,
                        }),
                    });

                    if (res.ok) {
                        this.mySide = side;
                        this.saveSession();
                    } else {
                        const err = await res.json();
                        // Side full — silently ignore
                    }
                } catch (err) {
                    // Silently ignore
                }
            },

            async startGame() {
                if (this.starting || !this.lobbyReady || !this.sessionToken) return;
                this.starting = true;
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/start`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify({ session_token: this.sessionToken }),
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        alert(err.error || 'Could not start game');
                    }
                    // The LobbyMatchStarted WebSocket event will redirect us
                } catch (err) {
                    alert('Error starting game');
                }
                this.starting = false;
            },

            saveSession() {
                localStorage.setItem('lobby_' + this.lobbyCode, JSON.stringify({
                    session_token: this.sessionToken,
                    player_id: this.myPlayerId,
                    player_name: this.myPlayerName,
                    side: this.mySide,
                }));
            },

            getLastPlayer() {
                try {
                    const stored = localStorage.getItem('ping_pong_last_player');
                    if (!stored) return null;
                    const data = JSON.parse(stored);
                    return data.player_id && data.player_name ? data : null;
                } catch (e) {
                    return null;
                }
            },

            saveLastPlayer(playerId, playerName) {
                localStorage.setItem('ping_pong_last_player', JSON.stringify({
                    player_id: playerId,
                    player_name: playerName,
                }));
            },

            clearSession() {
                localStorage.removeItem('lobby_' + this.lobbyCode);
                this.sessionToken = null;
                this.myPlayerId = null;
                this.myPlayerName = '';
                this.mySide = null;
            },

            generateQr() {
                const el = document.getElementById('joinQrContainer');
                if (el) {
                    el.innerHTML = '';
                    new QRCode(el, { text: this.joinUrl, width: 180, height: 180 });
                }
            },

            showError(title, message) {
                this.errorTitle = title;
                this.errorMessage = message;
                this.screen = 'error';
            },
        };
    }
    </script>
</body>
</html>
