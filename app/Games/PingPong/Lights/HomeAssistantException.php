<?php

namespace App\Games\PingPong\Lights;

use RuntimeException;

/**
 * A Home Assistant call failed. The message is safe to show and log: it never holds the token.
 */
class HomeAssistantException extends RuntimeException {}
