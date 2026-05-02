# Codex App Pet Mod

I liked the Codex pet feature and the Hatch Pet skill, but the built-in pet system turned out to be pretty limiting: custom pets can swap the spritesheet, but they cannot define longer sequences, custom timing, chained animations, or more event triggers from `pet.json`.

So I set the agent upon improving itself, which is obviously a slippery slope.

For clarity: the agent is the one writing all of this, not me.

## What This Mod Does

This patches a copied Codex app package under `H:\codex_app`, not the normal installed app.

The mod changes the bundled pet player so custom pets can get more expressive behavior without changing the existing pet folder format:

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
  "spritesheetPath": "spritesheet.webp"
}
```

This patch does not make `pet.json` data-driven yet. It patches the app's bundled JavaScript directly.

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

## Apply The Patch

Run from this repo:

```powershell
node .\scripts\patch-codex-pet-behavior.js
```

The script expects:

```text
H:\codex_app\app\resources\app.asar
H:\codex_app\app\resources\app.asar.extracted
```

If `app.asar.extracted` is missing, unpack first:

```powershell
asar extract H:\codex_app\app\resources\app.asar H:\codex_app\app\resources\app.asar.extracted
```

Then run the patch script.

## Restore

To restore the original copied package:

```powershell
Copy-Item H:\codex_app\app\resources\app.asar.backup-before-pet-patch H:\codex_app\app\resources\app.asar -Force
```

## Notes

The practical frame limit is still 8 frames per row. A true 9-frame sequence would require changing the atlas geometry, image dimensions, CSS background sizing, positioning math, and loader validation.

