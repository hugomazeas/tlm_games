{{--
    Livestream chat state shared by /watch (viewers post) and the playing
    screen (read-only history + flash overlay). Spread into a component:
    `...pingPongChat()`. The host component must provide `API` and
    `ensureEcho()`; it can pass `onChatMessage(message)` for live arrivals.
--}}
<script>
window.pingPongChat = () => ({
    chatMessages: [],
    chatChannel: null,
    chatHistoryLimit: 50,

    async loadChatHistory() {
        try {
            const res = await fetch(`${this.API}/chat/messages`);
            if (!res.ok) return;
            this.chatMessages = await res.json();
            this.scrollChatToBottom();
        } catch (err) {
            console.warn('Failed to load chat history:', err);
        }
    },

    subscribeChat() {
        if (this.chatChannel) return;
        this.ensureEcho();
        this.chatChannel = this.echo.channel('ping-pong.chat')
            .listen('.chat.message-posted', (e) => {
                if (e.message && this.addChatMessage(e.message) && typeof this.onChatMessage === 'function') {
                    this.onChatMessage(e.message);
                }
            });
    },

    leaveChat() {
        if (this.echo && this.chatChannel) {
            this.echo.leave('ping-pong.chat');
        }
        this.chatChannel = null;
    },

    /** Returns false when the message is already listed (e.g. our own post echoing back). */
    addChatMessage(message) {
        if (this.chatMessages.some(m => m.id === message.id)) return false;
        this.chatMessages = [...this.chatMessages, message].slice(-this.chatHistoryLimit);
        this.scrollChatToBottom();
        return true;
    },

    scrollChatToBottom() {
        this.$nextTick(() => {
            this.$root.querySelectorAll('[data-chat-scroll]').forEach(el => {
                el.scrollTop = el.scrollHeight;
            });
        });
    },

    chatTime(iso) {
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
});
</script>
