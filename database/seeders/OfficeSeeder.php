<?php

namespace Database\Seeders;

use App\Models\Office;
use Illuminate\Database\Seeder;

class OfficeSeeder extends Seeder
{
    /**
     * Add office names here (replace with your real locations).
     */
    private array $names = ['Québec', 'Chicoutimi'];

    public function run(): void
    {
        if ($this->names === []) {
            return;
        }

        $now = now();
        Office::query()->insert(
            collect($this->names)->map(fn (string $name) => [
                'name' => $name,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all()
        );
    }
}
