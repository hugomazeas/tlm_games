<?php

namespace Tests\Unit;

use App\Games\PingPong\Services\VideoRecordingService;
use Tests\TestCase;

class VideoRecordingCommandTest extends TestCase
{
    public function test_command_captures_the_webcam_microphone(): void
    {
        config(['pingpong.recording_audio_device' => 'plughw:CARD=C920,DEV=0']);

        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8', withAudio: true);

        $this->assertStringContainsString("-f alsa -thread_queue_size 1024 -i 'plughw:CARD=C920,DEV=0'", $cmd);
        $this->assertStringContainsString('-c:a aac', $cmd);
    }

    public function test_command_without_audio_has_no_audio_input(): void
    {
        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8', withAudio: false);

        $this->assertStringNotContainsString('alsa', $cmd);
        $this->assertStringNotContainsString('-c:a', $cmd);
        $this->assertStringContainsString("-i '/dev/video0'", $cmd);
    }
}
