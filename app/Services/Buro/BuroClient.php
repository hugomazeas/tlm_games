<?php

namespace App\Services\Buro;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Read-only client for Buro's `/api/integrations/*` endpoints.
 *
 * Every method returns null rather than throwing when Buro is unreachable or
 * unhappy: a seat-booking outage must never take the games hub down, and the
 * hourly matchmaker treats "no answer" as "skip this hour".
 */
class BuroClient
{
    public function isConfigured(): bool
    {
        return filled(config('pingpong.buro.token')) && filled(config('pingpong.buro.base_url'));
    }

    /**
     * Who is booked into a Buro office today, plus that office's local clock.
     */
    public function presence(string $buroOfficeId, ?string $date = null): ?BuroPresence
    {
        $payload = $this->get('/api/integrations/presence', array_filter([
            'officeId' => $buroOfficeId,
            'date' => $date,
        ]));

        return $payload === null ? null : BuroPresence::fromArray($payload);
    }

    /**
     * Every Buro office, so an admin can map one onto a local office row.
     *
     * @return list<array{id: string, name: string, timezone: string}>|null
     */
    public function offices(): ?array
    {
        $payload = $this->get('/api/integrations/offices');

        if ($payload === null) {
            return null;
        }

        return array_values(array_map(fn (array $office) => [
            'id' => (string) ($office['id'] ?? ''),
            'name' => (string) ($office['name'] ?? ''),
            'timezone' => (string) ($office['timezone'] ?? 'UTC'),
        ], $payload['offices'] ?? []));
    }

    /**
     * @param  array<string, string>  $query
     * @return array<string, mixed>|null
     */
    private function get(string $path, array $query = []): ?array
    {
        if (! $this->isConfigured()) {
            Log::warning('Buro integration is not configured; skipping request.', ['path' => $path]);

            return null;
        }

        $url = rtrim((string) config('pingpong.buro.base_url'), '/').$path;

        try {
            $response = Http::withToken((string) config('pingpong.buro.token'))
                ->timeout((int) config('pingpong.buro.timeout'))
                ->acceptJson()
                ->get($url, $query);
        } catch (ConnectionException $exception) {
            Log::warning('Buro is unreachable.', ['path' => $path, 'error' => $exception->getMessage()]);

            return null;
        }

        if ($response->failed()) {
            Log::warning('Buro returned an error.', [
                'path' => $path,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return null;
        }

        $payload = $response->json();

        return is_array($payload) ? $payload : null;
    }
}
