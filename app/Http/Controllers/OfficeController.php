<?php

namespace App\Http\Controllers;

use App\Models\Office;
use App\Services\Buro\BuroClient;
use Illuminate\Http\Request;

class OfficeController extends Controller
{
    public function index()
    {
        return view('offices.index', [
            'offices' => Office::withCount('players')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:offices,name',
        ]);

        Office::create($validated);

        return redirect('/offices')->with('success', 'Office created.');
    }

    public function edit(Office $office, BuroClient $buro)
    {
        return view('offices.edit', [
            'office' => $office,
            // Null when Buro is unreachable or unconfigured; the view then
            // falls back to a free-text id so the page still works.
            'buroOffices' => $buro->offices(),
        ]);
    }

    public function update(Request $request, Office $office)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:offices,name,'.$office->id,
            'buro_office_id' => 'nullable|string|max:255|unique:offices,buro_office_id,'.$office->id,
            'matchmaking_enabled' => 'nullable|boolean',
            'matchmaking_start' => ['required', 'date_format:H:i'],
            'matchmaking_end' => ['required', 'date_format:H:i', 'after:matchmaking_start'],
        ]);

        $validated['matchmaking_enabled'] = $request->boolean('matchmaking_enabled');

        if ($validated['matchmaking_enabled'] && blank($validated['buro_office_id'])) {
            return back()
                ->withInput()
                ->withErrors(['buro_office_id' => 'Link a Buro office before enabling matchmaking.']);
        }

        $office->update($validated);

        return redirect('/offices')->with('success', 'Office updated.');
    }
}
