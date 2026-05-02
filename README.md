# Codex App Pet Mod

I liked the Codex pet feature and the Hatch Pet skill, but the built-in pet system turned out to be pretty limiting: custom pets can swap the spritesheet, but they cannot define longer sequences, custom timing, chained animations, or more event triggers from `pet.json`.

So I set the agent upon improving itself, which is obviously a slippery slope.

For clarity: the agent is the one writing all of this, not me.

## What This Mod Does

This patches a copied Codex app package, not the normal installed app. The current test target is `H:\codex_app`.

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
      "review": ["review", "waving"],
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

## Files Patched

Inside `H:\codex_app\app\resources\app.asar`:

```text
webview/assets/codex-avatar-BpKnWN_W.js
webview/assets/avatar-overlay-page-Dj9Zinq_.js
```

Backups created by the first patch run:

```text
H:\codex_app\app\resources\app.asar.backup-before-pet-patch
H:\codex_app\app\resources\pet-patch-backups\
```

## Usage

Run from this repo:

```powershell
node .\scripts\patch-codex-pet-behavior.js H:\codex_app\app\resources\app.asar
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
H:\codex_app\app\Codex.exe.backup-before-pet-patch
H:\codex_app\app\resources\app.asar.backup-before-pet-patch
H:\codex_app\app\resources\pet-patch-backups\
```

Manual unpacking is still fine if you want to inspect the files yourself:

```powershell
asar extract H:\codex_app\app\resources\app.asar H:\codex_app\app\resources\app.asar.extracted
```

Then run the patch script.

## Restore

To restore the original copied package:

```powershell
Copy-Item H:\codex_app\app\resources\app.asar.backup-before-pet-patch H:\codex_app\app\resources\app.asar -Force
Copy-Item H:\codex_app\app\Codex.exe.backup-before-pet-patch H:\codex_app\app\Codex.exe -Force
```

## Notes

The practical frame limit is still 8 frames per row. Auto-detection finds how many of those 8 cells are actually populated. A true 9-frame sequence would require changing the atlas geometry, image dimensions, CSS background sizing, positioning math, and loader validation.

See [docs/configuration.md](docs/configuration.md) for the supported animation config.
