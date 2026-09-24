{{--
    Alpine helpers behind partials/elo-preview.blade.php, shared by the playing
    screen and /watch. Spread into a component: `...pingPongEloPreview()`.
    The host component must provide `API`, `match` and `mode`.
--}}
<script>
window.pingPongEloPreview = () => ({
    eloPreview: null,

    async loadEloPreview() {
        if (!this.match?.id) return;
        try {
            const res = await fetch(`${this.API}/matches/${this.match.id}/elo-preview`);
            if (!res.ok) {
                this.eloPreview = null;
                return;
            }
            this.eloPreview = await res.json();
        } catch (err) {
            console.warn('Failed to load ELO preview:', err);
            this.eloPreview = null;
        }
    },

    eloPreviewFor(playerId, won) {
        if (!this.eloPreview || !playerId) return null;
        const onLeft = this.match.player_left_id === playerId
            || this.match.team_left_player2_id === playerId;
        const key = (onLeft === won) ? 'if_left_wins' : 'if_right_wins';
        return this.eloPreview[key]?.[playerId] ?? null;
    },

    formatDelta(n) {
        if (n === null || n === undefined) return '';
        if (n > 0) return '+' + n;
        return String(n);
    },

    currentRatingFor(playerId) {
        if (!this.eloPreview || !playerId) return null;
        return this.eloPreview.current_ratings?.[playerId] ?? null;
    },

    projectedEloFor(playerId, won) {
        const current = this.currentRatingFor(playerId);
        const delta = this.eloPreviewFor(playerId, won)?.total;
        if (current === null || delta === null || delta === undefined) return null;
        return current + delta;
    },

    eloSwingFor(playerId) {
        const ifWins = this.projectedEloFor(playerId, true);
        const ifLoses = this.projectedEloFor(playerId, false);
        if (ifWins === null || ifLoses === null) return null;
        return ifWins - ifLoses;
    },

    previewPlayerIdsForSide(side) {
        if (side === 'left') {
            return this.mode === '2v2'
                ? [this.match.player_left_id, this.match.team_left_player2_id].filter(Boolean)
                : (this.match.player_left_id ? [this.match.player_left_id] : []);
        }
        return this.mode === '2v2'
            ? [this.match.player_right_id, this.match.team_right_player2_id].filter(Boolean)
            : (this.match.player_right_id ? [this.match.player_right_id] : []);
    },

    playerNameById(id) {
        if (id === this.match.player_left_id) return this.match.player_left?.name;
        if (id === this.match.player_right_id) return this.match.player_right?.name;
        if (id === this.match.team_left_player2_id) return this.match.team_left_player2?.name;
        if (id === this.match.team_right_player2_id) return this.match.team_right_player2?.name;
        return '';
    },
});
</script>
