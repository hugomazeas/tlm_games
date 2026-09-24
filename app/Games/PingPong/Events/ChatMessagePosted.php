<?php

namespace App\Games\PingPong\Events;

use App\Games\PingPong\Models\PingPongChatMessage;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class ChatMessagePosted implements ShouldBroadcastNow
{
    /** @var array{id: int, body: string, created_at: string, player: array{id: int, name: string}} */
    public array $message;

    public function __construct(PingPongChatMessage $message)
    {
        $this->message = $message->toChatPayload();
    }

    public function broadcastOn(): array
    {
        return [new Channel('ping-pong.chat')];
    }

    public function broadcastAs(): string
    {
        return 'chat.message-posted';
    }
}
