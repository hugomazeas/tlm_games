<?php

require __DIR__.'/../vendor/autoload.php';

// The Docker container injects DB_DATABASE (a real sqlite file) via its
// `environment:` block, which lands in $_SERVER/$_ENV. Laravel's env() reads
// those — not putenv — so phpunit.xml's <env> alone cannot redirect it, and
// RefreshDatabase would run migrate:fresh against the real dev database.
// Pin the test database to in-memory here, before the framework boots.
foreach (['DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => ':memory:'] as $key => $value) {
    putenv("{$key}={$value}");
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
}
