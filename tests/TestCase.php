<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

// Pin the test database to in-memory SQLite before Laravel boots, so the suite
// can never touch the real dev database. The docker-compose env block injects a
// real DB_DATABASE env var which would otherwise shadow phpunit's :memory:
// setting (Laravel's env() reads $_SERVER/$_ENV, not putenv). This file is
// autoloaded by Composer the instant any test class extending Tests\TestCase is
// reflected — before any setUp() / createApplication() runs.
foreach (['DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => ':memory:'] as $key => $value) {
    putenv("{$key}={$value}");
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
}

abstract class TestCase extends BaseTestCase
{
    //
}
