# Pet System Investigation

The copied Codex app package was unpacked from:

```text
H:\codex_app\app\resources\app.asar
```

Extracted app:

```text
H:\codex_app\app\resources\app.asar.extracted
```

## Custom Pet Loading

Implemented in:

```text
H:\codex_app\app\resources\app.asar.extracted\.vite\build\workspace-root-drop-handler-B4gQVO2J.js
```

The loader scans:

```text
~/.codex/pets/<folder>/pet.json
~/.codex/avatars/<folder>/avatar.json
```

Accepted manifest fields:

```text
id
displayName
description
spritesheetPath
```

The app returns custom pet IDs as:

```text
custom:<folder>
```

## Animation Playback

Implemented in:

```text
H:\codex_app\app\resources\app.asar.extracted\webview\assets\codex-avatar-BpKnWN_W.js
```

The stock animation table was hardcoded:

```text
failed: row 5, 8 frames
idle: row 0, 6 frames
jumping: row 4, 5 frames
review: row 8, 6 frames
running: row 7, 6 frames
running-left: row 2, 8 frames
running-right: row 1, 8 frames
waving: row 3, 4 frames
waiting: row 6, 6 frames
```

The mod extends `idle` and `jumping` to 8 frames and adds chain maps for several states.

## Event Mapping

Implemented in:

```text
H:\codex_app\app\resources\app.asar.extracted\webview\assets\avatar-overlay-page-Dj9Zinq_.js
```

Stock trigger map:

```text
idle: no active status
running: active local/cloud work
waiting: waiting for user input
failed: failed/cancelled/system error
review: unread completed output
jumping: pointer hover
running-left: horizontal drag left
running-right: horizontal drag right
```

The `waving` state existed but was not clearly triggered. The mod adds vertical drag triggers so `waving` is reachable.

