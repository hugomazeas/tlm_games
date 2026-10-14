<?php

namespace App\Services;

use App\Models\Player;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

/**
 * Stores a player's profile picture.
 *
 * The browser already crops to a square, but the upload is never stored as
 * sent: it is decoded and redrawn with GD into a small JPEG, which drops EXIF
 * (location, camera) and anything smuggled in after the image data.
 *
 * Animated GIFs are the exception, since GD keeps only the first frame: they
 * are rebuilt from their own blocks instead, keeping the frames, their timing
 * and the loop count, and dropping comments, other application extensions
 * (XMP lives there) and anything after the trailer. They are not resized, so
 * they are capped at 2 MB; the browser shows them centred and cropped.
 */
class PlayerAvatarService
{
    public const SIZE = 256;

    private const QUALITY = 85;

    public const MAX_ANIMATED_KB = 2048;

    public function store(Player $player, UploadedFile $file): void
    {
        $bytes = (string) file_get_contents($file->getRealPath());
        $animated = $this->rebuildAnimatedGif($bytes);

        if ($animated !== null) {
            if ($file->getSize() > self::MAX_ANIMATED_KB * 1024) {
                throw ValidationException::withMessages([
                    'avatar' => 'An animated GIF must be 2 MB or smaller.',
                ]);
            }

            $frame = @imagecreatefromstring($animated);

            if ($frame === false) {
                throw new InvalidArgumentException('The file is not an image GD can read.');
            }

            imagedestroy($frame);
            $this->put($player, $animated, 'gif');

            return;
        }

        $source = @imagecreatefromstring($bytes);

        if ($source === false) {
            throw new InvalidArgumentException('The file is not an image GD can read.');
        }

        // Centre square, in case the client sent something that isn't one.
        $width = imagesx($source);
        $height = imagesy($source);
        $side = min($width, $height);

        $avatar = imagecreatetruecolor(self::SIZE, self::SIZE);
        // Transparent PNGs land on white rather than JPEG's black.
        imagefill($avatar, 0, 0, imagecolorallocate($avatar, 255, 255, 255));
        imagecopyresampled(
            $avatar, $source,
            0, 0, intdiv($width - $side, 2), intdiv($height - $side, 2),
            self::SIZE, self::SIZE, $side, $side,
        );

        ob_start();
        imagejpeg($avatar, null, self::QUALITY);
        $jpeg = (string) ob_get_clean();

        imagedestroy($source);
        imagedestroy($avatar);

        $this->put($player, $jpeg, 'jpg');
    }

    private function put(Player $player, string $contents, string $extension): void
    {
        // A new name each time, so browsers never show a cached old photo.
        $path = 'avatars/'.$player->id.'-'.Str::lower(Str::random(10)).'.'.$extension;
        Storage::disk('public')->put($path, $contents);

        $previous = $player->avatar_path;
        $player->forceFill(['avatar_path' => $path])->save();

        if ($previous) {
            Storage::disk('public')->delete($previous);
        }
    }

    /**
     * The GIF rebuilt from the blocks worth keeping, or null when the bytes are
     * not a well-formed GIF with more than one frame (a still GIF is better
     * served by the JPEG path, which also squares and shrinks it).
     */
    private function rebuildAnimatedGif(string $bytes): ?string
    {
        $length = strlen($bytes);

        if ($length < 13 || ! in_array(substr($bytes, 0, 6), ['GIF87a', 'GIF89a'], true)) {
            return null;
        }

        // Header, logical screen descriptor and global colour table.
        $offset = 13 + $this->colourTableSize(ord($bytes[10]));
        $gif = substr($bytes, 0, $offset);
        $frames = 0;

        while ($offset < $length) {
            $block = $bytes[$offset];

            if ($block === "\x3B") {
                return $frames > 1 ? $gif."\x3B" : null;
            }

            if ($block === "\x2C") {
                if ($offset + 10 > $length) {
                    return null;
                }

                // Image descriptor, local colour table, LZW code size, then the data.
                $data = $offset + 10 + $this->colourTableSize(ord($bytes[$offset + 9])) + 1;
                $end = $this->endOfSubBlocks($bytes, $data);

                if ($end === null) {
                    return null;
                }

                $gif .= substr($bytes, $offset, $end - $offset);
                $frames++;
                $offset = $end;

                continue;
            }

            if ($block === "\x21" && $offset + 1 < $length) {
                $end = $this->endOfSubBlocks($bytes, $offset + 2);

                if ($end === null) {
                    return null;
                }

                // Frame timing, and the loop count frames are useless without.
                $label = $bytes[$offset + 1];
                $keep = $label === "\xF9"
                    || ($label === "\xFF" && in_array(substr($bytes, $offset + 3, 11), ['NETSCAPE2.0', 'ANIMEXTS1.0'], true));

                if ($keep) {
                    $gif .= substr($bytes, $offset, $end - $offset);
                }

                $offset = $end;

                continue;
            }

            return null;
        }

        return null;
    }

    private function colourTableSize(int $packed): int
    {
        return $packed & 0x80 ? 3 * (2 << ($packed & 0x07)) : 0;
    }

    /** The offset just past a run of data sub-blocks and its terminator. */
    private function endOfSubBlocks(string $bytes, int $offset): ?int
    {
        $length = strlen($bytes);

        while ($offset < $length) {
            $size = ord($bytes[$offset]);
            $offset += 1 + $size;

            if ($size === 0) {
                return $offset;
            }
        }

        return null;
    }

    public function remove(Player $player): void
    {
        if ($player->avatar_path) {
            Storage::disk('public')->delete($player->avatar_path);
        }

        $player->forceFill(['avatar_path' => null])->save();
    }
}
