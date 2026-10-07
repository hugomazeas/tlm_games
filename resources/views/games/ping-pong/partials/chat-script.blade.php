{{--
    Livestream chat state shared by /watch (viewers post) and the playing
    screen (read-only history + flash overlay). Spread into a component:
    `...pingPongChat()`. Each match is its own room: call `joinChat(matchId)`
    when a match is on screen and `leaveChat()` when it goes. The host
    component must provide `API` and `ensureEcho()`; it can pass
    `onChatMessage(message)` for live arrivals.
--}}
<script>
window.pingPongChat = () => ({
    chatMessages: [],
    chatMatchId: null,
    chatChannel: null,
    chatHistoryLimit: 50,

    /** Switches to a match's room: clears the old one, loads history, listens live. */
    async joinChat(matchId) {
        matchId = Number(matchId);
        if (!matchId || matchId === this.chatMatchId) return;
        this.leaveChat();
        this.chatMatchId = matchId;

        this.ensureEcho();
        this.chatChannel = 'ping-pong.match.' + matchId + '.chat';
        this.echo.channel(this.chatChannel)
            .listen('.chat.message-posted', (e) => {
                if (e.message && this.addChatMessage(e.message) && typeof this.onChatMessage === 'function') {
                    this.onChatMessage(e.message);
                }
            });

        await this.loadChatHistory();
    },

    leaveChat() {
        if (this.echo && this.chatChannel) {
            this.echo.leave(this.chatChannel);
        }
        this.chatChannel = null;
        this.chatMatchId = null;
        this.chatMessages = [];
    },

    async loadChatHistory() {
        const matchId = this.chatMatchId;
        if (!matchId) return;
        try {
            const res = await fetch(`${this.API}/chat/messages?match_id=${matchId}`);
            // Ignore a late response for a room we've already left.
            if (!res.ok || matchId !== this.chatMatchId) return;
            const history = await res.json();
            // Keep anything that arrived live while history was loading.
            const known = new Set(history.map(m => m.id));
            this.chatMessages = [...history, ...this.chatMessages.filter(m => !known.has(m.id))]
                .slice(-this.chatHistoryLimit);
            this.scrollChatToBottom();
        } catch (err) {
            console.warn('Failed to load chat history:', err);
        }
    },

    /** Returns false when the message is already listed or belongs to another room. */
    addChatMessage(message) {
        if (message.match_id !== this.chatMatchId) return false;
        if (this.chatMessages.some(m => m.id === message.id)) return false;
        this.chatMessages = [...this.chatMessages, message].slice(-this.chatHistoryLimit);
        this.scrollChatToBottom();
        return true;
    },

    /**
     * Adds a "<name> joined the chat" line, Minecraft style. It lives only in
     * this browser: it isn't stored, so later arrivals don't see past joins.
     */
    addChatJoin(name) {
        if (!this.chatMatchId || !name) return;
        const line = {
            id: 'join-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            type: 'join',
            match_id: this.chatMatchId,
            player: { name },
            created_at: new Date().toISOString(),
        };
        this.chatMessages = [...this.chatMessages, line].slice(-this.chatHistoryLimit);
        this.scrollChatToBottom();
    },

    /** Real messages only, leaving out join lines. */
    chatMessageCount() {
        return this.chatMessages.filter(m => m.type !== 'join').length;
    },

    scrollChatToBottom() {
        this.$nextTick(() => {
            // $root is undefined when this runs after an await (history, a post); a page has one chat.
            (this.$root ?? document).querySelectorAll('[data-chat-scroll]').forEach(el => {
                el.scrollTop = el.scrollHeight;
            });
        });
    },

    chatTime(iso) {
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
});
</script>
