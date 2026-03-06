<?php

namespace Tests\Feature;

use Tests\TestCase;

class HomePageTest extends TestCase
{
    public function test_home_page_returns_successful_response(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
    }

    public function test_home_page_displays_title_with_large_text(): void
    {
        $response = $this->get('/');

        $response->assertSee('Games Hub');
        $response->assertSee('text-5xl', false);
    }
}
