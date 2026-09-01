<?php

namespace App\Http\Controllers;

use App\Models\Player;
use App\Services\Push\WebPushSender;
use Illuminate\Contracts\View\View;

class NotificationController extends Controller
{
    public function index(WebPushSender $sender): View
    {
        return view('notifications.index', [
            'players' => Player::orderBy('name')->get(['id', 'name']),
            'vapidPublicKey' => $sender->publicKey(),
            'pushConfigured' => $sender->isConfigured(),
        ]);
    }
}
