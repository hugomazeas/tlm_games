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

    public function test_one_camera_command_is_unchanged_by_the_wide_camera_settings(): void
    {
        $service = new VideoRecordingService;
        $before = $service->buildFfmpegCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8', withAudio: true);

        config(['pingpong.wide_camera.filter' => 'hflip']);

        $this->assertSame($before, $service->buildFfmpegCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8', withAudio: true, withWide: false));
        $this->assertStringNotContainsString('-map', $before);
        $this->assertStringNotContainsString('wide', $before);
    }

    public function test_two_camera_command_films_both_angles_on_one_clock(): void
    {
        config([
            'pingpong.recording_audio_device' => 'plughw:CARD=C200,DEV=0',
            'pingpong.wide_camera' => ['device' => '/dev/video-wide', 'video_size' => '2560x1440', 'filter' => ''],
        ]);

        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/live/7/segment%03d.ts', '/live/7/stream.m3u8', withAudio: true, withWide: true);

        // The wide camera at its own size, its timestamps kept relative to the main camera's
        $this->assertStringContainsString("-video_size '2560x1440' -framerate 30 -input_format mjpeg -isync 0 -i '/dev/video-wide'", $cmd);
        $this->assertSame(2, substr_count($cmd, '-ts mono2abs'));
        // The mic is the third input, in both angles
        $this->assertStringContainsString("-isync 0 -i 'plughw:CARD=C200,DEV=0'", $cmd);
        $this->assertStringContainsString('-map 0:v -map 2:a -vf "hflip,vflip"', $cmd);
        $this->assertStringContainsString('-map 1:v -map 2:a -c:v libx264', $cmd);
        $this->assertSame(2, substr_count($cmd, '-c:a aac -ac 1 '));
        // The main stream where it always was, the wide one next to it, both stamped with the wall clock
        $this->assertStringContainsString("-hls_segment_filename '/live/7/segment%03d.ts' '/live/7/stream.m3u8'", $cmd);
        $this->assertStringContainsString("-hls_segment_filename '/live/7/wide/segment%03d.ts' '/live/7/wide/stream.m3u8'", $cmd);
        $this->assertSame(2, substr_count($cmd, 'append_list+program_date_time'));
    }

    public function test_two_camera_command_without_audio_maps_video_only(): void
    {
        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/live/7/segment%03d.ts', '/live/7/stream.m3u8', withAudio: false, withWide: true);

        $this->assertStringNotContainsString('alsa', $cmd);
        $this->assertStringNotContainsString(':a', $cmd);
        $this->assertStringContainsString('-map 0:v -vf "hflip,vflip"', $cmd);
        $this->assertStringContainsString('-map 1:v -c:v libx264', $cmd);
    }

    public function test_the_wide_camera_gets_its_own_mounting_filter(): void
    {
        config(['pingpong.wide_camera.filter' => 'hflip']);

        $cmd = (new VideoRecordingService)->buildFfmpegCommand('/live/7/segment%03d.ts', '/live/7/stream.m3u8', withAudio: false, withWide: true);

        $this->assertStringContainsString("-map 1:v -vf 'hflip' -c:v libx264", $cmd);
        // The main camera keeps its own
        $this->assertStringContainsString('-map 0:v -vf "hflip,vflip"', $cmd);
    }
}
