<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\Process\Process;

class DeployController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        if (! app()->environment('production')) {
            abort(404);
        }

        $expected = (string) config('deploy.token');

        if ($expected === '') {
            abort(503, 'Deploy token not configured');
        }

        $provided = (string) ($request->header('X-Deploy-Token') ?? $request->input('token', ''));

        if (! hash_equals($expected, $provided)) {
            abort(403);
        }

        $script = base_path('deploy.sh');

        if (! is_file($script)) {
            abort(500, 'deploy.sh not found');
        }

        $process = new Process([$script], base_path());
        $process->setTimeout(600);
        $process->run();

        return response()->json([
            'exit_code' => $process->getExitCode(),
            'output' => $process->getOutput(),
            'errors' => $process->getErrorOutput(),
        ], $process->isSuccessful() ? 200 : 500);
    }
}
