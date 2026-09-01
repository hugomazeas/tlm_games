<?php

namespace App\Services\Buro;

/** A single Buro user booked into an office for the day. */
class BuroPresentUser
{
    /**
     * @param  list<string>  $flags
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly string $email,
        public readonly array $flags,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            id: (string) ($payload['id'] ?? ''),
            name: (string) ($payload['name'] ?? ''),
            email: strtolower(trim((string) ($payload['email'] ?? ''))),
            flags: array_values(array_map('strval', $payload['flags'] ?? [])),
        );
    }

    public function hasFlag(string $flag): bool
    {
        foreach ($this->flags as $candidate) {
            if (strcasecmp($candidate, $flag) === 0) {
                return true;
            }
        }

        return false;
    }
}
