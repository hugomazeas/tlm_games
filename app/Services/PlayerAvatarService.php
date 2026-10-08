<?php

namespace App\Services;

use App\Models\Player;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Stores a player's profile picture.
 *
 * The browser already crops to a square, but the upload is never stored as
 * sent: it is decoded and redrawn with GD into a small JPEG, which drops EXIF
 * (location, camera) and anything smuggled in after the image data.
 */
class PlayerAvatarService
{
    public const SIZE = 256;

    private const QUALITY = 85;

    public function store(Player $player, UploadedFile $file): void
    {
        $source = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));

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

        // A new name each time, so browsers never show a cached old photo.
        $path = 'avatars/'.$player->id.'-'.Str::lower(Str::random(10)).'.jpg';
        Storage::disk('public')->put($path, $jpeg);

        $previous = $player->avatar_path;
        $player->forceFill(['avatar_path' => $path])->save();

        if ($previous) {
            Storage::disk('public')->delete($previous);
        }
    }

    public function remove(Player $player): void
    {
        if ($player->avatar_path) {
            Storage::disk('public')->delete($player->avatar_path);
        }

        $player->forceFill(['avatar_path' => null])->save();
    }
}
