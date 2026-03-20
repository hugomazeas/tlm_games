@php
    $gamesHubEchoConfig = [
        'key' => config('broadcasting.connections.reverb.key', env('REVERB_APP_KEY', 'games-hub-key')),
        'wsHost' => request()->getHost(),
        'wsPort' => request()->getPort(),
        'wssPort' => request()->getPort(),
        'forceTLS' => request()->secure(),
        'cluster' => 'mt1',
    ];
@endphp
<script>
window.__gamesHubEchoConfig = @json($gamesHubEchoConfig);
function gamesHubEcho() {
    const c = window.__gamesHubEchoConfig;
    return new Echo({
        broadcaster: 'pusher',
        key: c.key,
        wsHost: c.wsHost,
        wsPort: c.wsPort,
        wssPort: c.wssPort,
        forceTLS: c.forceTLS,
        cluster: c.cluster,
        disableStats: true,
        enabledTransports: ['ws', 'wss'],
    });
}
</script>
