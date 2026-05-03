# Upstream Issue Draft

## Title

Support configurable custom pet animation sequences and activity events

## Body

### Summary

Please consider extending Codex custom pet support so `pet.json` can optionally describe animation behavior, not only the spritesheet asset.

The current custom pet feature is already useful, especially with the Hatch Pet skill, but custom pets are limited by hardcoded renderer behavior: frame counts, timing, sequence chaining, and event triggers are fixed by the app rather than by the pet manifest.

### Proof Of Concept

I published a proof-of-concept mod here:

https://github.com/hlky/codex_app_pet_mod

Demo video:

https://github.com/hlky/codex_app_pet_mod/blob/main/assets/oVRedOdhq0.mp4

Example custom pet:

https://github.com/hlky/codex_app_pet_mod/tree/main/assets/datachan-extended

The proof of concept patches a copied desktop app package to explore the behavior. I am not asking upstream to adopt the patching approach; the repo is meant to demonstrate the requested runtime behavior and a possible backwards-compatible `pet.json` shape.

### Current Behavior

Custom pets can provide metadata and a spritesheet, but the app still owns the animation table and event mapping. That means a custom pet cannot reliably define:

- how many frames each row should play
- different timing per state
- longer idle or jumping sequences when the row has populated cells
- chained sequences like `running -> waving -> running-left`
- whether an active-state chain should loop or fall back to idle
- hover or drag-specific states
- richer activity states such as thinking, editing, edited, running a command, or command completed

This makes expressive custom pets difficult. The artwork can exist in the spritesheet, but the app may never play those cells or may return to the built-in idle behavior too quickly.

### Proposed Manifest Shape

A backwards-compatible optional `animation` field could look like this:

```json
{
  "displayName": "Datachan Extended",
  "description": "Custom pet with explicit animation behavior.",
  "spritesheetPath": "spritesheet.webp",
  "animation": {
    "autoDetectFrames": true,
    "idleSlowdown": 6,
    "states": {
      "idle": {
        "row": 8,
        "durationMs": 150,
        "lastFrameDurationMs": 280
      },
      "running": {
        "row": 7,
        "durationMs": 120,
        "lastFrameDurationMs": 220
      },
      "review": {
        "row": 0,
        "durationMs": 140,
        "lastFrameDurationMs": 320
      }
    },
    "chains": {
      "idle": ["idle", "waving", "review"],
      "running": {
        "mode": "loop",
        "sequence": ["waving", "idle", "running-left", "running-right", "running"]
      }
    },
    "events": {
      "hover": "jumping"
    }
  }
}
```

### Requested Features

1. Pass optional animation config through from custom pet manifests.
2. Support per-state row/frame/timing config:
   - `row` / `rowIndex`
   - `frames` / `frameCount`
   - `durationMs` / `frameDurationMs`
   - `lastFrameDurationMs`
   - `slowdown`
3. Use detected non-empty row cells when `frames` is omitted, within the existing atlas geometry.
4. Support sequence chains per state.
5. Support chain playback modes:
   - `idleFallback`: play the active chain once, then loop the configured idle chain
   - `loop`: loop the active chain until the app state changes
   - `once`: play once and hold the final frame
6. Support configurable event mappings, starting with hover and drag directions.
7. Expose richer pet animation states for agent activity where possible:
   - `thinking`
   - `editing`
   - `edited`
   - `running` / command running
   - `ran` / command completed
   - `review`

### Activity State Note

The current app appears to collapse active local/cloud work into a single `running` mascot state. The UI already has richer activity labels for file edits, commands, searches, and tool calls. It would be useful to keep the existing internal task status model, but derive a separate pet animation state from the latest activity item. That avoids changing notification semantics while still allowing pets to react to editing, command execution, and thinking.

### Compatibility

This can be additive:

- Existing pets without `animation` keep current behavior.
- Existing built-in pets can keep the hardcoded defaults.
- Custom pets can opt into configuration only where needed.
- The existing 8-column by 9-row atlas can remain the first supported format.

### Why This Matters

The Hatch Pet workflow can generate expressive custom spritesheets, but without manifest-controlled playback much of that work is lost. Allowing custom pets to describe their own animation behavior would make the feature more useful without requiring users to patch app bundles or ask upstream for every new pet-specific behavior.
