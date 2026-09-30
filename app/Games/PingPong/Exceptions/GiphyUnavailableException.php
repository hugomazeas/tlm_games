<?php

namespace App\Games\PingPong\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * A /giphy search that can't be answered: no key, the hourly budget is spent,
 * or Giphy itself failed. Renders as a JSON error the chat composer shows.
 */
class GiphyUnavailableException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status)
    {
        parent::__construct($message);
    }

    public static function notConfigured(): self
    {
        return new self("GIFs aren't set up.", 503);
    }

    public static function limitReached(int $secondsLeft): self
    {
        $minutes = max(1, (int) ceil($secondsLeft / 60));

        return new self("GIF limit reached — try again in {$minutes} min.", 429);
    }

    public static function failed(): self
    {
        return new self('Giphy is not answering — try again.', 502);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], $this->status);
    }
}
