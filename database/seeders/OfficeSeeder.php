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

        foreach ($this->names as $name) {
            Office::firstOrCreate(['name' => $name]);
        }
    }
}
