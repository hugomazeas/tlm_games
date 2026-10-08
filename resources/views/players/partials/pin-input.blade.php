<label class="block">
    <span class="block text-xs font-medium text-white/50 mb-1.5">{{ $label }}</span>
    <input type="password" name="{{ $name }}" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4"
           autocomplete="off" required placeholder="••••"
           class="w-28 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white text-center tracking-[0.5em] placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
</label>
