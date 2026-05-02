# Animation Configuration

Custom pet manifests can include an `animation` object. The same object may also be named `sequences`.

```json
{
  "displayName": "Datachan",
  "description": "A custom Codex pet.",
  "spritesheetPath": "spritesheet.webp",
  "animation": {
    "autoDetectFrames": true,
    "idleSlowdown": 6,
    "states": {
      "idle": {
        "row": 0,
        "durationMs": 140,
        "lastFrameDurationMs": 320
      },
      "review": {
        "row": 8,
        "frames": 6,
        "durationMs": 150,
        "lastFrameDurationMs": 280
      },
      "jumping": {
        "row": 4,
        "frameCount": 8,
        "durationMs": 110
      }
    },
    "chains": {
      "idle": ["idle", "waving", "review"],
      "review": ["review", "waving"],
      "jumping": ["jumping", "waving"]
    },
    "events": {
      "hover": "waving"
    }
  }
}
```

## `states`

Keys are Codex pet states:

```text
idle
running-right
running-left
waving
jumping
failed
waiting
running
review
```

Each state supports:

```text
row                  Row index in the 8x9 atlas.
rowIndex             Alias for row.
frames               Explicit frame count.
frameCount           Alias for frames.
durationMs           Per-frame duration.
frameDurationMs      Alias for durationMs.
lastFrameDurationMs  Duration for the final frame.
slowdown             Multiplies frame durations for that state.
```

If `frames` / `frameCount` is omitted, the renderer uses auto-detected row frame counts when available, then falls back to the built-in default for that state.

## `chains`

Chains define the lead-in sequence for a state. For example:

```json
{
  "chains": {
    "idle": ["idle", "waving", "review"],
    "review": ["review", "waving"],
    "running": ["running", "waving"],
    "failed": ["failed", "waiting"]
  }
}
```

There are two playback modes:

- `chains.idle` applies only when the app state is actually `idle`. It loops from the start of the configured idle chain. The player does not append an extra idle sequence to `chains.idle`; include `idle` in the array wherever you want the idle row to appear.
- Non-idle chains, such as `chains.running`, `chains.review`, or `chains.failed`, play once when that state starts. The player then appends the plain idle row and loops that idle row while the state remains active.

This means `chains.idle` will not automatically run while Codex is busy. If the pet is in `running`, configure `chains.running`; if it is waiting for input, configure `chains.waiting`; and so on. To make an active-state lead-in last longer, repeat states in that state-specific chain.

Default chains are:

```text
review -> waving
failed -> waiting
waiting -> waving
jumping -> waving
```

If a non-idle state has no chain, it repeats its own sequence three times before the idle-row fallback.

## `events`

Currently supported:

```text
hover  State used while the pointer hovers over the pet.
```

Drag events are patched globally:

```text
drag left   running-left
drag right  running-right
drag up     waving
drag down   jumping
```

## Limits

The app still uses the standard Codex pet atlas:

```text
8 columns x 9 rows
1536 x 1872 total
192 x 208 per frame
```

Auto-detection can only find up to 8 frames per row.
