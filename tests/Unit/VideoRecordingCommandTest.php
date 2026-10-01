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

        $this->assertStringContainsString("-f alsa -thread_queue_size 1024 -isync 0 -i 'plughw:CARD=C920,DEV=0'", $cmd);
        $this->assertStringContainsString('-c:a aac', $cmd);
    }

    public function test_command_downmixes_the_audio_to_mono(): void
    {
        config(['pingpong.recording_audio_device' => 'plughw:CARD=C920,DEV=0']);

        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8', withAudio: true);

        $this->assertStringContainsString('-c:a aac -ac 1 ', $cmd);
    }

    public function test_command_keeps_the_microphone_in_sync_with_the_camera(): void
    {
        config(['pingpong.recording_audio_device' => 'plughw:CARD=C920,DEV=0']);

        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8', withAudio: true);

        // Camera frames on the wall clock, like ALSA's, so the two can be lined up
        $this->assertStringContainsString('-f v4l2 -thread_queue_size 512 -ts mono2abs ', $cmd);
        // The mic input keeps its start offset relative to the camera (input 0)
        $this->assertMatchesRegularExpression('/-isync 0 -i \'plughw:[^\']+\'/', $cmd);
        $this->assertStringContainsString('-af aresample=async=1000 ', $cmd);
    }

    public function test_command_without_audio_has_no_audio_input(): void
    {
        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8', withAudio: false);

        $this->assertStringNotContainsString('alsa', $cmd);
        $this->assertStringNotContainsString('-c:a', $cmd);
        $this->assertStringNotContainsString('-ac 1', $cmd);
        $this->assertStringNotContainsString('-isync', $cmd);
        $this->assertStringNotContainsString('aresample', $cmd);
        $this->assertStringContainsString("-i '/dev/video0'", $cmd);
    }
}
