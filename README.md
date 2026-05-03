# Codex App Pet Mod

I liked the Codex pet feature and the Hatch Pet skill, but the built-in pet system turned out to be pretty limiting: custom pets can swap the spritesheet, but they cannot define longer sequences, custom timing, chained animations, or more event triggers from `pet.json`.

So I set the agent upon improving itself, which is obviously a slippery slope.

For clarity: the agent is the one writing all of this, not me.

## Demo

Demo video:

[assets/oVRedOdhq0.mp4](assets/oVRedOdhq0.mp4)

The demo uses the bundled Datachan Extended pet in [assets/datachan-extended](assets/datachan-extended). It is a normal Codex custom pet folder plus an `animation` config that exercises longer row playback, custom timing, idle/running chains, and a hover override.

## What This Mod Does

The mod changes the bundled pet player so custom pets can get more expressive behavior without changing the existing pet folder format:

- Passes optional animation config through from `pet.json`.
- Auto-detects the number of non-empty frames in each spritesheet row.
- Extends `idle` to use all 8 available atlas columns.
- Extends `jumping` to use all 8 available atlas columns.
- Adds simple sequence chaining:
  - `review -> waving -> idle`
  - `failed -> waiting -> idle`
  - `waiting -> waving -> idle`
  - `jumping -> waving -> idle`
- Adds configurable chain playback modes:
  - `idleFallback`: play the active chain once, then loop the configured idle chain
  - `loop`: loop the active chain until the app state changes
  - `once`: play the active chain once and hold the final frame
- Adds more transient drag events:
  - drag right: `running-right`
  - drag left: `running-left`
  - drag up: `waving`
  - drag down: `jumping`
- Makes hover configurable with `animation.events.hover`.

## Current App Constraints

The copied app still expects the standard Codex pet atlas:

```text
1536 x 1872
8 columns x 9 rows
192 x 208 per frame
PNG or WebP
```

Custom pets are loaded from:

```text
%USERPROFILE%\.codex\pets\<pet-name>\pet.json
```

To install the included Datachan Extended example:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\pets" | Out-Null
Copy-Item .\assets\datachan-extended "$env:USERPROFILE\.codex\pets\datachan-extended" -Recurse -Force
```

The manifest remains simple:

```json
{
  "displayName": "Datachan",
  "description": "A custom Codex pet.",
  "spritesheetPath": "spritesheet.webp",
  "animation": {
    "autoDetectFrames": true,
    "idleSlowdown": 6,
    "states": {
      "idle": { "row": 0, "durationMs": 140, "lastFrameDurationMs": 320 },
      "jumping": { "row": 4, "frames": 8, "durationMs": 110 },
      "review": { "row": 8, "frames": 6, "durationMs": 150 }
    },
    "chains": {
      "idle": ["idle", "waving", "review"],
      "review": ["review", "waving"],
      "running": {
        "mode": "loop",
        "sequence": ["running", "waving"]
      },
      "jumping": ["jumping", "waving"]
    },
    "events": {
      "hover": "waving"
    }
  }
}
```

`animation` can also be named `sequences`; the patcher passes either field through.

If `autoDetectFrames` is not set to `false`, the renderer scans each row and uses the last non-transparent frame in that row. Explicit `frames` or `frameCount` values override detection.

`chains.idle` loops when the app state is actually idle. Active states such as `running`, `waiting`, `failed`, or `review` need their own chain entries. Non-idle chains default to `idleFallback`, which plays the active chain once and then loops `chains.idle` if configured, otherwise the plain idle row. Set a chain entry to `{ "mode": "loop", "sequence": [...] }` to loop that chain until the app state changes.

## Files Patched

Inside `app\resources\app.asar`:

```text
webview/assets/codex-avatar-BpKnWN_W.js
webview/assets/avatar-overlay-page-Dj9Zinq_.js
```

Backups created by the first patch run:

```text
app\resources\app.asar.backup-before-pet-patch
app\resources\pet-patch-backups\
```

## Usage

Run from this repo:

```powershell
node .\scripts\patch-codex-pet-behavior.js app\resources\app.asar
```

The script accepts the path to the copied app's `app.asar`. It expects or creates the extracted directory beside the provided archive:

```text
<path-to-app.asar>
<path-to-app.asar>.extracted
```

After repacking `app.asar`, Electron's ASAR integrity metadata in `Codex.exe` must also match the new archive header hash. If it does not, the copied app exits before startup with an error like:

```text
Integrity check failed for asar archive
```

The patch script updates the copied `Codex.exe` metadata automatically. The first run creates backups:

```text
app\Codex.exe.backup-before-pet-patch
app\resources\app.asar.backup-before-pet-patch
app\resources\pet-patch-backups\
```

Close the copied Codex app before running the patch. Windows locks `Codex.exe` while it is running, and the script must be able to update the embedded integrity metadata after repacking.

Manual unpacking is still fine if you want to inspect the files yourself:

```powershell
asar extract app\resources\app.asar app\resources\app.asar.extracted
```

Then run the patch script.

## Restore

To restore the original copied package:

```powershell
Copy-Item app\resources\app.asar.backup-before-pet-patch app\resources\app.asar -Force
Copy-Item app\Codex.exe.backup-before-pet-patch app\Codex.exe -Force
```

## Notes

The practical frame limit is still 8 frames per row. Auto-detection finds how many of those 8 cells are actually populated. A true 9-frame sequence would require changing the atlas geometry, image dimensions, CSS background sizing, positioning math, and loader validation.

See [docs/configuration.md](docs/configuration.md) for the supported animation config.

There is also an upstream issue draft in [docs/upstream-issue.md](docs/upstream-issue.md).
