<?php

namespace App\Http\Controllers;

use App\Models\Office;
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

    public function edit(Office $office)
    {
        return view('offices.edit', ['office' => $office]);
    }

    public function update(Request $request, Office $office)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:offices,name,' . $office->id,
        ]);

        $office->update($validated);

        return redirect('/offices')->with('success', 'Office updated.');
    }
}
