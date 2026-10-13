<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Deploys only pull and restart (no image rebuild), so the app container must
 * run supervisord from the mounted repo for program changes to take effect.
 */
class SupervisorConfigTest extends TestCase
{
    public function test_app_container_runs_supervisord_from_the_mounted_repo_config(): void
    {
        $compose = file_get_contents(dirname(__DIR__, 2).'/docker-compose.yml');

        $this->assertStringContainsString('supervisord -c /var/www/docker/supervisor/supervisord.conf', $compose);
        $this->assertStringNotContainsString('supervisord -c /etc/supervisord.conf', $compose);
    }

    public function test_nginx_takes_its_site_config_from_the_mounted_repo(): void
    {
        $config = file_get_contents(dirname(__DIR__, 2).'/docker/supervisor/supervisord.conf');

        $this->assertStringContainsString('cp /var/www/docker/nginx/default.conf /etc/nginx/http.d/default.conf', $config);
    }

    public function test_the_hot_potato_server_runs_from_the_mounted_repo(): void
    {
        $compose = file_get_contents(dirname(__DIR__, 2).'/docker-compose.yml');
        $nginx = file_get_contents(dirname(__DIR__, 2).'/docker/nginx/default.conf');

        $this->assertStringContainsString('container_name: games-hub-hot-potato', $compose);
        // Packages first (node_modules isn't in git; the racing bundles need three.js), then the server.
        $this->assertStringContainsString('bun install --frozen-lockfile && cd .. && exec bun game-server/src/server.ts', $compose);
        $this->assertStringContainsString('location /games/hot-potato/live/', $nginx);
        $this->assertStringContainsString('games-hub-hot-potato:8090', $nginx);
    }

    public function test_the_racing_pages_get_their_bundles_from_the_game_server(): void
    {
        $nginx = file_get_contents(dirname(__DIR__, 2).'/docker/nginx/default.conf');

        $this->assertStringContainsString('location /games/racing/live/', $nginx);
        $this->assertMatchesRegularExpression('#location /games/racing/live/ \{[^}]*games-hub-hot-potato:8090#', $nginx);
    }

    public function test_supervisor_works_the_camera_queue_that_stops_recordings(): void
    {
        $config = file_get_contents(dirname(__DIR__, 2).'/docker/supervisor/supervisord.conf');

        $this->assertStringContainsString('[program:camera-queue]', $config);
        $this->assertStringContainsString('queue:work --queue=camera', $config);
    }
}
