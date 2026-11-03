<?php

namespace Tests\Feature;

use App\Games\OfficeFps\Models\OfficeFpsMatch;
use App\Games\OfficeFps\Services\OfficeFpsStats;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The office FPS's history: what the game server posts when a match ends, and the stats,
 * leaderboard and pages built from it.
 */
class OfficeFpsStatsTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'office-fps-test-secret';

    private Player $ann;

    private Player $bob;

    private Player $cat;

    protected function setUp(): void
    {
        parent::setUp();
        config(['games.hot_potato.internal_secret' => self::SECRET]);
        $this->ann = Player::create(['name' => 'Ann']);
        $this->bob = Player::create(['name' => 'Bob']);
        $this->cat = Player::create(['name' => 'Cat']);
    }

    /** @return array<string, string> */
    private function secret(): array
    {
        return ['X-Internal-Secret' => self::SECRET, 'Accept' => 'application/json'];
    }

    /**
     * A match as the game server posts it. Ann wins 3–1 over Bob; Cat takes part.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function match(array $overrides = []): array
    {
        $line = fn (Player $player, int $place, array $numbers) => array_merge([
            'player_id' => $player->id,
            'place' => $place,
            'kills' => 0,
            'deaths' => 0,
            'headshots' => 0,
            'damage' => 0,
            'shots' => 0,
            'hits' => 0,
            'melee_kills' => 0,
            'backstabs' => 0,
            'best_streak' => 0,
            'played_ms' => 300_000,
            'left' => false,
        ], $numbers);
        $kill = fn (?Player $killer, ?Player $victim, string $weapon = 'blaster', bool $headshot = false, bool $backstab = false, int $at = 1000) => [
            'killer_id' => $killer?->id,
            'victim_id' => $victim?->id,
            'weapon' => $weapon,
            'headshot' => $headshot,
            'backstab' => $backstab,
            'at_ms' => $at,
        ];

        return array_merge([
            'started_at' => '2026-11-03T10:00:00Z',
            'ended_at' => '2026-11-03T10:05:00Z',
            'frag_limit' => 15,
            'minutes' => 5,
            'player_count' => 4,
            'players' => [
                $line($this->ann, 1, ['kills' => 3, 'deaths' => 1, 'headshots' => 1, 'damage' => 340, 'shots' => 40, 'hits' => 17, 'melee_kills' => 1, 'backstabs' => 1, 'best_streak' => 2]),
                $line($this->bob, 2, ['kills' => 1, 'deaths' => 2, 'damage' => 120, 'shots' => 20, 'hits' => 6]),
                $line($this->cat, 3, ['kills' => 0, 'deaths' => 1, 'played_ms' => 120_000, 'left' => true]),
            ],
            'kills' => [
                $kill($this->ann, $this->bob, 'blaster', true, false, 30_000),
                $kill($this->bob, $this->ann, at: 60_000),
                $kill($this->ann, $this->bob, at: 90_000),
                $kill($this->ann, $this->cat, 'stapler', false, true, 120_000),
                // A guest downed Bob: kept, the guest's side is null.
                $kill(null, $this->bob, at: 150_000),
            ],
        ], $overrides);
    }

    public function test_the_game_server_saves_a_match_with_its_players_and_kills(): void
    {
        $this->postJson('/internal/office-fps/results', $this->match(), $this->secret())
            ->assertCreated()
            ->assertJsonStructure(['id']);

        $match = OfficeFpsMatch::sole();
        $this->assertSame([15, 5, 4], [$match->frag_limit, $match->minutes, $match->player_count]);
        $this->assertCount(3, $match->results);
        $this->assertCount(5, $match->kills);
        $this->assertDatabaseHas('office_fps_results', ['player_id' => $this->cat->id, 'left' => true, 'played_ms' => 120_000]);
        $this->assertDatabaseHas('office_fps_kills', ['killer_id' => null, 'victim_id' => $this->bob->id]);
        $this->assertDatabaseHas('office_fps_kills', ['killer_id' => $this->ann->id, 'weapon' => 'stapler', 'backstab' => true]);
    }

    public function test_only_the_game_server_may_post_and_only_what_makes_sense(): void
    {
        $this->postJson('/internal/office-fps/results', $this->match(), ['X-Internal-Secret' => 'nope'])->assertForbidden();

        $bad = $this->match();
        $bad['players'][0]['hits'] = 41;
        $this->postJson('/internal/office-fps/results', $bad, $this->secret())->assertUnprocessable()->assertJsonValidationErrors('players.0.hits');

        $bad = $this->match();
        $bad['kills'][0]['weapon'] = 'chair';
        $this->postJson('/internal/office-fps/results', $bad, $this->secret())->assertJsonValidationErrors('kills.0.weapon');

        $bad = $this->match();
        $bad['players'][0]['player_id'] = 999;
        $this->postJson('/internal/office-fps/results', $bad, $this->secret())->assertJsonValidationErrors('players.0.player_id');

        $this->assertSame(0, OfficeFpsMatch::count());
    }

    public function test_kills_with_every_gun_are_kept_and_the_retired_blaster_shows_only_when_used(): void
    {
        $match = $this->match();
        $match['kills'] = collect(['rifle', 'sniper', 'shotgun', 'pistol', 'launcher'])
            ->map(fn (string $weapon, int $i) => ['killer_id' => $this->ann->id, 'victim_id' => $this->bob->id, 'weapon' => $weapon, 'headshot' => false, 'backstab' => false, 'at_ms' => 1000 * ($i + 1)])
            ->all();
        $this->postJson('/internal/office-fps/results', $match, $this->secret())->assertCreated();

        $response = $this->get('/games/office-fps/players/'.$this->ann->id)->assertOk();
        $weapons = $response->viewData('stats')['weapons'];
        $this->assertSame(['rifle', 'sniper', 'shotgun', 'pistol', 'launcher', 'stapler'], array_keys($weapons));
        $this->assertSame(['kills' => 1, 'deaths' => 0], $weapons['launcher']);
        $response->assertSee('Launcher')->assertSee('Sniper')->assertDontSee('Blaster');
    }

    public function test_a_players_page_adds_up_their_matches(): void
    {
        $this->postJson('/internal/office-fps/results', $this->match(), $this->secret())->assertCreated();
        // A second match Bob wins 5–0.
        $second = $this->match();
        $second['players'] = [
            array_merge($second['players'][1], ['place' => 1, 'kills' => 5, 'deaths' => 0, 'best_streak' => 5]),
            array_merge($second['players'][0], ['place' => 2, 'kills' => 0, 'deaths' => 5, 'shots' => 10, 'hits' => 3, 'damage' => 60, 'best_streak' => 0, 'melee_kills' => 0, 'backstabs' => 0, 'headshots' => 0]),
        ];
        $second['kills'] = array_fill(0, 5, ['killer_id' => $this->bob->id, 'victim_id' => $this->ann->id, 'weapon' => 'blaster', 'headshot' => false, 'backstab' => false, 'at_ms' => 1000]);
        $this->postJson('/internal/office-fps/results', $second, $this->secret())->assertCreated();

        $response = $this->get('/games/office-fps/players/'.$this->ann->id)->assertOk();
        $stats = $response->viewData('stats');
        $this->assertSame(2, $stats['totals']['matches']);
        $this->assertSame(1, $stats['totals']['wins']);
        $this->assertSame(3, $stats['totals']['kills']);
        $this->assertSame(6, $stats['totals']['deaths']);
        $this->assertSame(0.5, $stats['totals']['kd']);
        $this->assertSame(40.0, $stats['totals']['accuracy']); // 20 hits of 50 shots
        $this->assertSame(33.3, $stats['totals']['headshot_rate']);
        $this->assertSame(['kills' => 2, 'deaths' => 6], $stats['weapons']['blaster']);
        $this->assertSame(['kills' => 1, 'deaths' => 0], $stats['weapons']['stapler']);
        $this->assertSame(['most_kills' => 3, 'most_damage' => 340, 'best_streak' => 2], $stats['records']);
        $this->assertSame('Bob', $stats['nemeses'][0]['player']->name);
        $this->assertSame(6, $stats['nemeses'][0]['count']);
        $this->assertSame(['Bob', 'Cat'], $stats['victims']->map(fn ($row) => $row['player']->name)->all());
        $this->assertCount(2, $stats['recent']);

        $response->assertSee('Nemesis')->assertSee('Bob')->assertSee('Stapler');
    }

    /**
     * A team deathmatch: blue (Bob, Cat) beat red (Ann), though Ann topped the scoreboard.
     *
     * @return array<string, mixed>
     */
    private function teamMatch(): array
    {
        $match = $this->match(['mode' => 'tdm']);
        $match['players'][0] += ['team' => 'red', 'won' => false, 'zone_ms' => 0, 'pickups' => 4];
        $match['players'][1] += ['team' => 'blue', 'won' => true, 'zone_ms' => 0, 'pickups' => 2];
        $match['players'][2] += ['team' => 'blue', 'won' => true, 'zone_ms' => 0, 'pickups' => 0];

        return $match;
    }

    public function test_a_team_deathmatch_saves_its_mode_teams_and_winners(): void
    {
        $this->postJson('/internal/office-fps/results', $this->teamMatch(), $this->secret())->assertCreated();

        $this->assertSame('tdm', OfficeFpsMatch::sole()->mode);
        $this->assertDatabaseHas('office_fps_results', ['player_id' => $this->ann->id, 'team' => 'red', 'won' => false, 'pickups' => 4]);
        $this->assertDatabaseHas('office_fps_results', ['player_id' => $this->cat->id, 'team' => 'blue', 'won' => true]);
    }

    public function test_wins_come_from_the_won_flag_not_the_place(): void
    {
        $this->postJson('/internal/office-fps/results', $this->teamMatch(), $this->secret())->assertCreated();

        $ann = $this->get('/games/office-fps/players/'.$this->ann->id)->assertOk()->assertSee('Team deathmatch')->assertSee('Team red')->viewData('stats');
        $this->assertSame(0, $ann['totals']['wins']);
        $this->assertSame(0.0, $ann['totals']['win_rate']);

        $cat = $this->get('/games/office-fps/players/'.$this->cat->id)->viewData('stats');
        $this->assertSame(1, $cat['totals']['wins']);
        $this->assertSame(100.0, $cat['totals']['win_rate']);
        $this->assertSame(['matches' => 1, 'wins' => 1], $cat['modes']['tdm']);
        $this->assertSame(['matches' => 0, 'wins' => 0], $cat['modes']['ffa']);

        $board = app(OfficeFpsStats::class)->leaderboard()->keyBy('player_name');
        $this->assertSame([0, 1, 1], [$board['Ann']['wins'], $board['Bob']['wins'], $board['Cat']['wins']]);
    }

    public function test_zone_time_and_pickups_add_up_across_modes(): void
    {
        $this->postJson('/internal/office-fps/results', $this->teamMatch(), $this->secret())->assertCreated();
        $koth = $this->match(['mode' => 'koth']);
        $koth['players'][0] += ['zone_ms' => 90_000, 'pickups' => 3, 'won' => true];
        $this->postJson('/internal/office-fps/results', $koth, $this->secret())->assertCreated();
        $koth['players'][0]['zone_ms'] = 45_000;
        $this->postJson('/internal/office-fps/results', $koth, $this->secret())->assertCreated();

        $stats = $this->get('/games/office-fps/players/'.$this->ann->id)
            ->assertOk()
            ->assertSee('King of the meeting room')
            ->assertSee('Zone time')
            ->viewData('stats');
        $this->assertSame(135_000, $stats['totals']['zone_ms']);
        $this->assertSame(10, $stats['totals']['pickups']);
        $this->assertSame(2, $stats['totals']['wins']);
        $this->assertSame([
            'ffa' => ['matches' => 0, 'wins' => 0],
            'tdm' => ['matches' => 1, 'wins' => 0],
            'koth' => ['matches' => 2, 'wins' => 2],
        ], $stats['modes']);
    }

    public function test_a_post_without_modes_is_a_free_for_all_won_by_first_place(): void
    {
        $this->postJson('/internal/office-fps/results', $this->match(), $this->secret())->assertCreated();

        $this->assertSame('ffa', OfficeFpsMatch::sole()->mode);
        $this->assertDatabaseHas('office_fps_results', ['player_id' => $this->ann->id, 'team' => null, 'won' => true, 'zone_ms' => 0, 'pickups' => 0]);
        $this->assertDatabaseHas('office_fps_results', ['player_id' => $this->bob->id, 'won' => false]);
        $this->get('/games/office-fps/players/'.$this->ann->id)->assertOk()->assertSee('Free for all');
    }

    public function test_unknown_modes_and_teams_are_refused(): void
    {
        $this->postJson('/internal/office-fps/results', $this->match(['mode' => 'deathmatch']), $this->secret())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('mode');

        $bad = $this->teamMatch();
        $bad['players'][0]['team'] = 'green';
        $this->postJson('/internal/office-fps/results', $bad, $this->secret())->assertJsonValidationErrors('players.0.team');

        $bad = $this->teamMatch();
        $bad['players'][0]['zone_ms'] = -1;
        $bad['players'][1]['pickups'] = 10_001;
        $this->postJson('/internal/office-fps/results', $bad, $this->secret())->assertJsonValidationErrors(['players.0.zone_ms', 'players.1.pickups']);

        $this->assertSame(0, OfficeFpsMatch::count());
    }

    public function test_someone_who_never_played_has_an_empty_page(): void
    {
        $this->get('/games/office-fps/players/'.$this->cat->id)->assertOk()->assertSee('No matches yet');
    }

    public function test_the_leaderboard_home_card_and_player_profile_show_the_office_fps(): void
    {
        $this->postJson('/internal/office-fps/results', $this->match(), $this->secret())->assertCreated();

        $this->get('/leaderboards/office-fps')->assertOk()->assertSee('Kills');
        $this->get('/leaderboards/office-fps/kills')->assertOk()->assertSeeInOrder(['Ann', 'Bob', 'Cat'])->assertSee('K/D');
        // The podium (drawn 2nd, 1st, 3rd).
        $this->get('/')->assertOk()->assertSeeInOrder(['Office FPS', 'Bob', 'Ann', 'Cat']);
        $this->get('/players/'.$this->ann->id)->assertOk()->assertSee('Office FPS - Kills');
    }

    public function test_the_pick_page_links_each_players_stats_and_the_leaderboard(): void
    {
        $this->get('/games/office-fps')
            ->assertOk()
            ->assertSee(url('/games/office-fps/players/'.$this->ann->id), false)
            ->assertSee(url('/leaderboards/office-fps/kills'), false);
    }
}
