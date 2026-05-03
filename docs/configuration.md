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
      "jumping": ["jumping", "waving"],
      "running": {
        "mode": "loop",
        "sequence": ["running", "waving"]
      }
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
chainMode            Optional playback mode for that state.
chainPlayback        Alias for chainMode.
```

If `frames` / `frameCount` is omitted, the renderer uses auto-detected row frame counts when available, then falls back to the built-in default for that state.

## `chains`

Chains define the lead-in sequence for a state. For example:

```json
{
  "chains": {
    "idle": ["idle", "waving", "review"],
    "review": ["review", "waving"],
    "running": {
      "mode": "loop",
      "sequence": ["running", "waving"]
    },
    "failed": ["failed", "waiting"]
  }
}
```

Chain entries can be either an array or an object with a playback mode:

```json
{
  "chains": {
    "running": {
      "mode": "loop",
      "sequence": ["running", "waving", "running-left", "running-right"]
    }
  }
}
```

Supported playback modes:

```text
idleFallback  Default. Play the active chain once, then loop the configured idle chain.
loop          Loop the active chain until the app state changes.
once          Play the active chain once and hold the final frame.
```

`mode` can be set on a chain object, on a state as `chainMode` / `chainPlayback`, or globally as `animation.chainMode` / `animation.chainPlayback`. The legacy boolean `loopActiveChains: true` also maps to `loop`.

`chains.idle` applies only when the app state is actually `idle`. It loops from the start of the configured idle chain. The player does not append an extra idle sequence to `chains.idle`; include `idle` in the array wherever you want the idle row to appear.

Non-idle chains, such as `chains.running`, `chains.review`, or `chains.failed`, default to `idleFallback`: the active chain plays once, then the player loops `chains.idle` if configured, otherwise the plain idle row. Use `loop` for states that should keep cycling their active chain while Codex remains in that state.

If the pet is in `running`, configure `chains.running`; if it is waiting for input, configure `chains.waiting`; and so on. In `idleFallback` mode, the active-state chain is still the lead-in, and the configured idle chain is only the loop that follows it.

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
