<?php

namespace App\Games\PingPong\Lights;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

/**
 * Encrypted like Laravel's `encrypted` cast, but a value the app can no longer decrypt (the app
 * key changed) reads as null instead of throwing: the office's token then shows as missing and
 * is pasted again, rather than the lights page failing.
 *
 * @implements CastsAttributes<string|null, string|null>
 */
class EncryptedOrNull implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        try {
            return Crypt::decryptString($value);
        } catch (DecryptException) {
            return null;
        }
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value === null ? null : Crypt::encryptString($value);
    }
}
