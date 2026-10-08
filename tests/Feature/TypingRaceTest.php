<?php

namespace Tests\Feature;

use App\Games\Typing\Events\RaceUpdated;
use App\Games\Typing\Jobs\FinishTypingRaceJob;
use App\Games\Typing\Models\TypingRace;
use App\Games\Typing\Models\TypingTest;
use App\Games\Typing\Services\RaceFinisher;
use App\Games\Typing\Services\TypingContent;
use App\Models\Player;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TypingRaceTest extends TestCase
{
    use RefreshDatabase;

    private const TEXT = 'the quick brown fox jumps over the lazy dog';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateCsrfToken::class);
        Event::fake([RaceUpdated::class]);
    }

    public function test_creating_a_race_when_none_is_open(): void
    {
        $alice = Player::create(['name' => 'Alice']);

        $this->postJson('/games/typing/race', ['player_id' => $alice->id, 'language' => 'fr', 'source' => 'words'])
            ->assertOk()
            ->assertJsonPath('race.status', 'lobby')
            ->assertJsonPath('race.language', 'fr')
            ->assertJsonPath('race.racers.0.player_id', $alice->id);

        $this->assertCount(40, explode(' ', TypingRace::first()->text));
        Event::assertDispatched(RaceUpdated::class);
    }

    public function test_a_quote_race_uses_exactly_one_quote(): void
    {
        [$alice] = $this->players(1);

        $this->postJson('/games/typing/race', ['player_id' => $alice->id, 'language' => 'fr', 'source' => 'quote'])->assertOk();

        $quotes = array_map(fn ($quote) => TypingContent::normalize($quote['text']), (new TypingContent)->load('fr')['quotes']);
        $this->assertContains(TypingRace::first()->text, $quotes);
    }

    public function test_creating_while_one_is_open_joins_it(): void
    {
        [$alice, $bob] = $this->players(2);
        $this->join($alice, 'fr');

        $this->join($bob, 'en')->assertJsonPath('race.language', 'fr');

        $this->assertSame(1, TypingRace::count());
        $this->assertSame(2, TypingRace::first()->racers()->count());
    }

    public function test_joining_twice_does_not_duplicate_the_racer(): void
    {
        [$alice] = $this->players(1);
        $this->join($alice);
        $this->join($alice);

        $this->assertSame(1, TypingRace::first()->racers()->count());
    }

    public function test_an_expired_lobby_is_not_open(): void
    {
        [$alice, $bob] = $this->players(2);
        $this->join($alice);
        $this->travel(11)->minutes();

        $this->join($bob);

        $this->assertSame(2, TypingRace::count());
    }

    public function test_joining_a_started_race_is_rejected(): void
    {
        [$alice, $bob, $carol] = $this->players(3);
        $race = $this->startedRace($alice, $bob);

        $this->join($carol)->assertStatus(409);
        $this->assertSame(2, $race->racers()->count());
    }

    public function test_last_player_leaving_removes_the_race(): void
    {
        [$alice, $bob] = $this->players(2);
        $this->join($alice);
        $this->join($bob);
        $race = TypingRace::first();

        $this->postJson("/games/typing/race/{$race->id}/leave", ['player_id' => $alice->id])->assertJsonPath('race.racers.0.player_id', $bob->id);
        $this->postJson("/games/typing/race/{$race->id}/leave", ['player_id' => $bob->id])->assertJsonPath('race', null);

        $this->assertSame(0, TypingRace::count());
    }

    public function test_starting_alone_is_rejected(): void
    {
        [$alice] = $this->players(1);
        $this->join($alice);
        $race = TypingRace::first();

        $this->postJson("/games/typing/race/{$race->id}/start", ['player_id' => $alice->id])->assertStatus(422);
    }

    public function test_starting_sets_a_countdown_and_queues_the_cap(): void
    {
        Queue::fake();
        [$alice, $bob] = $this->players(2);
        $this->join($alice);
        $this->join($bob);
        $race = TypingRace::first();

        $this->postJson("/games/typing/race/{$race->id}/start", ['player_id' => $alice->id])
            ->assertOk()
            ->assertJsonPath('race.status', 'running');

        $race->refresh();
        $this->assertEqualsWithDelta(3, now()->diffInSeconds($race->starts_at), 1);
        Queue::assertPushed(FinishTypingRaceJob::class, fn ($job) => $job->raceId === $race->id);
    }

    public function test_only_the_creator_can_start(): void
    {
        [$alice, $bob] = $this->players(2);
        $this->join($alice);
        $this->join($bob)->assertJsonPath('race.host_player_id', $alice->id);
        $race = TypingRace::first();

        $this->postJson("/games/typing/race/{$race->id}/start", ['player_id' => $bob->id])->assertStatus(403);
        $this->assertSame('lobby', $race->fresh()->status);
    }

    public function test_next_player_becomes_host_when_the_creator_leaves(): void
    {
        [$alice, $bob, $carol] = $this->players(3);
        $this->join($alice);
        $this->join($bob);
        $this->join($carol);
        $race = TypingRace::first();

        $this->postJson("/games/typing/race/{$race->id}/leave", ['player_id' => $alice->id])
            ->assertJsonPath('race.host_player_id', $bob->id);
        $this->postJson("/games/typing/race/{$race->id}/start", ['player_id' => $bob->id])->assertOk();
    }

    public function test_progress_is_rejected_before_start_and_for_outsiders(): void
    {
        [$alice, $bob, $carol] = $this->players(3);
        $race = $this->startedRace($alice, $bob);

        $this->progress($race, $alice, 'the')->assertStatus(409);

        $this->travel(4)->seconds();
        $this->progress($race, $carol, 'the')->assertStatus(403);
    }

    public function test_progress_is_measured_by_the_server(): void
    {
        [$alice, $bob] = $this->players(2);
        $race = $this->startedRace($alice, $bob);
        $this->travel(5)->seconds();

        $this->progress($race, $alice, 'the quick brxwn')->assertOk();

        $this->assertSame(12, $race->racers()->where('player_id', $alice->id)->first()->progress_chars);
    }

    public function test_finishing_order_and_results_when_everyone_finishes(): void
    {
        [$alice, $bob] = $this->players(2);
        $race = $this->startedRace($alice, $bob);

        $this->travelTo($race->starts_at->copy()->addSeconds(30));
        $this->progress($race, $bob, self::TEXT)
            ->assertJsonPath('race.status', 'running')
            ->assertJsonPath('race.racers.1.finish_ms', 30000);
        $this->travelTo($race->starts_at->copy()->addSeconds(43));
        $this->progress($race, $alice, self::TEXT)->assertJsonPath('race.status', 'finished');

        $this->assertSame(1, $race->racers()->where('player_id', $bob->id)->first()->place);
        $this->assertSame(2, $race->racers()->where('player_id', $alice->id)->first()->place);

        // 43 chars in 30s = 17.2 wpm.
        $bobResult = TypingTest::where('player_id', $bob->id)->first();
        $this->assertSame(17.2, $bobResult->wpm);
        $this->assertSame(30000, $bobResult->duration_ms);
        $this->assertSame($race->id, $bobResult->typing_race_id);
        $this->assertNotNull($bobResult->submitted_at);
    }

    public function test_cap_writes_dnf_results_from_progress(): void
    {
        [$alice, $bob] = $this->players(2);
        $race = $this->startedRace($alice, $bob);

        $this->travelTo($race->starts_at->copy()->addSeconds(30));
        $this->progress($race, $alice, self::TEXT);
        // Bob types 20 correct chars, then closes the tab.
        $this->progress($race, $bob, 'the quick brown fox ', 22, 2);

        $this->travelTo($race->starts_at->copy()->addSeconds(121));
        (new FinishTypingRaceJob($race->id))->handle(app(RaceFinisher::class));

        $this->assertSame('finished', $race->fresh()->status);
        $bobResult = TypingTest::where('player_id', $bob->id)->first();
        // 20 chars over 2 minutes = 2 wpm.
        $this->assertSame(2.0, $bobResult->wpm);
        $this->assertSame(120000, $bobResult->duration_ms);
        $this->assertSame(90.91, $bobResult->accuracy);
    }

    public function test_cap_job_does_nothing_before_the_cap(): void
    {
        [$alice, $bob] = $this->players(2);
        $race = $this->startedRace($alice, $bob);

        (new FinishTypingRaceJob($race->id))->handle(app(RaceFinisher::class));

        $this->assertSame('running', $race->fresh()->status);
        $this->assertSame(0, TypingTest::count());
    }

    public function test_racer_who_never_typed_gets_zero(): void
    {
        [$alice, $bob] = $this->players(2);
        $race = $this->startedRace($alice, $bob);

        $this->travelTo($race->starts_at->copy()->addSeconds(121));
        $this->getJson('/games/typing/race')->assertJsonPath('race', null);

        $result = TypingTest::where('player_id', $alice->id)->first();
        $this->assertSame(0.0, $result->wpm);
        $this->assertSame(0.0, $result->accuracy);
    }

    public function test_finishing_twice_writes_results_once(): void
    {
        [$alice, $bob] = $this->players(2);
        $race = $this->startedRace($alice, $bob);
        $this->travelTo($race->starts_at->copy()->addSeconds(121));

        app(RaceFinisher::class)->finish($race->fresh());
        app(RaceFinisher::class)->finish($race->fresh());

        $this->assertSame(2, TypingTest::count());
    }

    public function test_implausibly_fast_finish_is_rejected(): void
    {
        [$alice, $bob] = $this->players(2);
        $race = $this->startedRace($alice, $bob);

        // 43 chars in 1s = 516 wpm.
        $this->travelTo($race->starts_at->copy()->addSecond());
        $this->progress($race, $alice, self::TEXT)->assertStatus(422);

        $this->assertNull($race->racers()->where('player_id', $alice->id)->first()->finish_ms);
    }

    /**
     * @return list<Player>
     */
    private function players(int $count): array
    {
        return array_map(fn ($i) => Player::create(['name' => "Player {$i}"]), range(1, $count));
    }

    private function join(Player $player, string $language = 'en'): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/games/typing/race', ['player_id' => $player->id, 'language' => $language, 'source' => 'words']);
    }

    private function startedRace(Player ...$players): TypingRace
    {
        foreach ($players as $player) {
            $this->join($player);
        }

        $race = TypingRace::first();
        $race->update(['text' => self::TEXT]);
        $this->postJson("/games/typing/race/{$race->id}/start", ['player_id' => $players[0]->id])->assertOk();

        return $race->fresh();
    }

    private function progress(TypingRace $race, Player $player, string $typed, ?int $keystrokes = null, int $errors = 0): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/games/typing/race/{$race->id}/progress", [
            'player_id' => $player->id,
            'typed' => $typed,
            'keystrokes' => $keystrokes ?? mb_strlen($typed),
            'errors' => $errors,
        ]);
    }
}
