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

    public function test_supervisor_works_the_camera_queue_that_stops_recordings(): void
    {
        $config = file_get_contents(dirname(__DIR__, 2).'/docker/supervisor/supervisord.conf');

        $this->assertStringContainsString('[program:camera-queue]', $config);
        $this->assertStringContainsString('queue:work --queue=camera', $config);
    }
}
