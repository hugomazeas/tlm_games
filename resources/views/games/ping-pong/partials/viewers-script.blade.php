{{--
    Who is watching a match, shared by /watch (joins as a viewer) and the
    playing screen (joins as a screen, only to read the list). Spread into a
    component: `...pingPongViewers()`. Call `joinViewers(matchId)` when a
    match is on screen and `leaveViewers()` when it goes.

    The host component must provide `API`, `csrf`, `ensureEcho()` and
    `viewerIdentity()` returning `{ role: 'viewer'|'screen', player_id }`,
    and pass `channelAuthorization: { customHandler: (params, cb) =>
    this.authorizeViewers(params, cb) }` to its Echo so Reverb can sign it
    into the presence channel.
--}}
<script>
window.pingPongViewers = () => ({
    viewers: [],
    viewerJoins: [],
    viewersMatchId: null,
    viewersChannel: null,
    viewersPlayerId: null,
    viewerJoinSeconds: 5,

    /** Stable per-browser id so a guest is one member across reloads. */
    viewerBrowserId() {
        let id = localStorage.getItem('ping_pong_viewer_id');
        if (!id) {
            id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('ping_pong_viewer_id', id);
        }
        return id;
    },

    joinViewers(matchId) {
        matchId = Number(matchId);
        if (!matchId || matchId === this.viewersMatchId) return;
        this.leaveViewers();
        this.viewersMatchId = matchId;
        this.viewersPlayerId = this.viewerIdentity().player_id ?? null;

        this.ensureEcho();
        this.viewersChannel = 'ping-pong.match.' + matchId + '.viewers';
        this.echo.join(this.viewersChannel)
            .here((members) => {
                this.viewers = members.filter(m => m.role === 'viewer');
            })
            .joining((member) => {
                if (member.role !== 'viewer' || this.viewers.some(v => v.id === member.id)) return;
                this.viewers = [...this.viewers, member];
                if (member.name) this.announceViewerJoin(member);
            })
            .leaving((member) => {
                this.viewers = this.viewers.filter(v => v.id !== member.id);
            });
    },

    leaveViewers() {
        if (this.echo && this.viewersChannel) {
            this.echo.leave(this.viewersChannel);
        }
        this.viewersChannel = null;
        this.viewersMatchId = null;
        this.viewersPlayerId = null;
        this.viewers = [];
        this.viewerJoins = [];
    },

    /** Re-signs into the room, e.g. after a guest picks a chat name. */
    rejoinViewers() {
        const matchId = this.viewersMatchId;
        if (!matchId) return;
        this.leaveViewers();
        this.joinViewers(matchId);
    },

    announceViewerJoin(member) {
        if (typeof this.addChatJoin === 'function') this.addChatJoin(member.name);
        const key = member.id + '-' + Date.now();
        this.viewerJoins = [...this.viewerJoins, { key, name: member.name }].slice(-3);
        setTimeout(() => {
            this.viewerJoins = this.viewerJoins.filter(j => j.key !== key);
        }, this.viewerJoinSeconds * 1000);
    },

    viewerCount() {
        return this.viewers.length;
    },

    namedViewers() {
        return this.viewers.filter(v => v.name).sort((a, b) => a.name.localeCompare(b.name));
    },

    guestViewerCount() {
        return this.viewers.filter(v => !v.name).length;
    },

    async authorizeViewers({ socketId, channelName }, callback) {
        try {
            const res = await fetch(`${this.API}/viewers/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                body: JSON.stringify({
                    socket_id: socketId,
                    channel_name: channelName,
                    viewer_id: this.viewerBrowserId(),
                    ...this.viewerIdentity(),
                }),
            });
            if (!res.ok) {
                callback(new Error('Viewer auth failed: ' + res.status), null);
                return;
            }
            callback(null, await res.json());
        } catch (err) {
            callback(err, null);
        }
    },
});
</script>
