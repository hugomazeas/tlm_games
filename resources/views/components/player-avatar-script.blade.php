@once
<script>
    /* Shared by the player-avatar-js component and plain-DOM pages. Mirrors
       Player::initialsFor() and the hue hash in the player-avatar component. */
    window.playerInitials = function (name) {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        const first = Array.from(words[0])[0];
        const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
        return (first + last).toUpperCase();
    };
    window.playerAvatarHue = function (name) {
        let hue = 0;
        for (const character of String(name || '')) hue = (hue * 31 + character.codePointAt(0)) % 360;
        return hue;
    };
    /* For pages that build DOM by hand rather than with Alpine. */
    window.playerAvatarElement = function (name, url, className) {
        const avatar = document.createElement('span');
        avatar.className = 'player-avatar inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden font-bold text-white/90 select-none ' + (className || '');
        avatar.setAttribute('aria-hidden', 'true');
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            avatar.appendChild(img);
        } else {
            avatar.style.background = 'hsl(' + playerAvatarHue(name) + ' 45% 32%)';
            avatar.textContent = playerInitials(name);
        }
        return avatar;
    };
</script>
@endonce
