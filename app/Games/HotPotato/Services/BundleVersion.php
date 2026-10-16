<?php

namespace App\Games\HotPotato\Services;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * A version for the sidecar's browser bundles, for their URLs (`client.js?v=…`): it changes
 * whenever a deploy changes the game server's sources, so a browser never runs an old bundle
 * from its cache (Cloudflare gives `.js` a 4-hour browser TTL whatever the sidecar says).
 */
class BundleVersion
{
    private ?string $version = null;

    public function __construct(private ?string $root = null) {}

    public function current(): string
    {
        return $this->version ??= $this->compute();
    }

    private function compute(): string
    {
        $root = $this->root ?? base_path('game-server/src');
        if (! is_dir($root)) {
            return 'none';
        }

        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
        $newest = 0;
        $count = 0;
        foreach ($files as $file) {
            $newest = max($newest, $file->getMTime());
            $count++;
        }

        return substr(md5("{$newest}:{$count}"), 0, 10);
    }
}
