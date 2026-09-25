{{--
    Install metadata for the Games Hub PWA. Every full-page view needs it, not
    just the main layout: iOS builds the home-screen icon from whatever page
    "Add to Home Screen" is tapped on, and people mostly land on the lobby
    join page from a QR code.
--}}
<link rel="manifest" href="{{ url('/manifest.webmanifest') }}">
<meta name="theme-color" content="#070b27">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Games">
<link rel="icon" type="image/x-icon" href="{{ url('/favicon.ico') }}">
<link rel="icon" type="image/svg+xml" href="{{ url('/favicon.svg') }}">
<link rel="icon" type="image/png" sizes="96x96" href="{{ url('/favicon-96x96.png') }}">
<link rel="apple-touch-icon" sizes="180x180" href="{{ url('/apple-touch-icon.png') }}">
<link rel="apple-touch-icon-precomposed" sizes="180x180" href="{{ url('/apple-touch-icon.png') }}">
