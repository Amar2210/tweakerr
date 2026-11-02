# Tweakerr demo — file edits + element comments

Canonical outputs: [`../tweakerr-demo.mp4`](../tweakerr-demo.mp4) and [`../tweakerr-demo-poster.jpg`](../tweakerr-demo-poster.jpg).

**18.8 seconds · 1920 × 1080 · 30 fps · 564 frames.** H.264 High, 8-bit 4:2:0, limited-range BT.709; AAC LC stereo at 48 kHz. Fast-start MP4, 5,390,908 bytes. Poster: decoded frame at 13.8s, 1920 × 1080, 156,298 bytes.

- MP4 SHA-256: `905dba0254a26bbd825ea4c7cbc784f055d2bac331ca1482fff81d7b6a1affd1`
- Poster SHA-256: `09f6a2508341561e69a2e5f68fbd246003b44103aa28e1147acf5602486005b3`

## Film and sources

The original instrumental product-film treatment is retained: moving editor crops, restrained one-word edit labels, no voice, tutorial captions, subtitles or progress bars. All featured editor shots were freshly captured from the comments-only standalone build (SHA-256 `8f2e963e33e2d1982ca18e6bee9dbc0e4cca2305dca2896b5fb4178d4fbad70b`). No integrated AI, Connect, API, Revise, AI Undo or recovery footage is used. No provider requests or credentials are involved.

| Time | Picture |
| --- | --- |
| 0–1.8s | Orbit HTML / Tweakerr reveal |
| 1.8–4s | Real opened file and canvas selection |
| 4–6.6s | Edit the headline to “Make it yours.” |
| 6.6–10.1s | Georgia font and lime HEX colour |
| 10.1–12.2s | Lime/teal button gradient |
| 12.2–15.4s | Attach comment #1 to the headline, type “Keep this headline short and bold.”, Save comment |
| 15.4–16.3s | Toolbar Save (real HTML download containing the comment and edits) |
| 16.3–18.8s | Logo / “Make it yours.” end card |

`orbit-dashboard.html` is the only capture input: a synthetic, self-contained fixture. `orbit-dashboard-edited.html` is the actual downloaded result, including the pending `C1` comment targeting `hero-title`. `shots/` contains 17 meaningful real UI stills, not exported animation frames. `capture.mjs` drives Open, selection, editing, controls, comment Add/input/Save and file Save; `capture-validation.json` records the checks and crop geometry.

`motion.js` is the deterministic composition/storyboard, shared by the browser preview and export. Open `motion.html` and press **Play** to preview with music. `soundtrack.wav` is the unchanged original 15s instrumental and whooshes (no external samples). `export.py` reproducibly creates `soundtrack-film.wav`: an eight-beat, 3.75s insert from that music, a 40ms time-preserving crossfade, the original ending, and 0.05s tail silence. No pitch/tempo change or new speech.

## Render again — existing local tools only

The following are the exact WSL commands/tool paths used for this export, run from the repository root. They use installed **Windows Node and Chrome**, installed Playwright and FFmpeg, and standard-library Python 3. Do not install or download packages/browsers. On another machine, substitute equivalent already-installed paths. The JS helpers accept an optional `TWEAKERR_CHROME` environment variable when launched natively.

```bash
NODE='/mnt/c/Program Files/nodejs/node.exe'
PW='file://wsl.localhost/Ubuntu/home/amarbirajdar/.local/share/tweakerr/node_modules/@playwright/test/index.mjs'
FFMPEG='/mnt/c/Users/amarbir/AppData/Local/Temp/bruno-ui-research/deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
WORK="$(mktemp -d /mnt/c/Users/amarbir/AppData/Local/Temp/tweakerr-demo-comments-XXXXXX)"

# Optional: replace the source stills using an existing comments-only dist build.
# This does NOT build the app or run the regression suite.
# "$NODE" assets/demo-video/capture.mjs "$PW"

python3 assets/demo-video/export.py --prepare-audio
"$NODE" assets/demo-video/render.mjs "$PW" "--work=$(wslpath -w "$WORK")"
python3 assets/demo-video/export.py --work "$WORK" --ffmpeg "$FFMPEG"
"$NODE" assets/demo-video/check.mjs "$PW"
```

Use `render.mjs ... --preview` for eight composition stills only; this is not a complete frame set for export. A full render writes 564 JPEG frames and render facts **only to the unique Temp directory**, never into the repository. Export writes the canonical MP4/poster and `validation.json`, and leaves its full final A/V decode log and eight-frame **decoded** contact sheet in that Temp directory. Chrome's final playback/seek results are appended by `check.mjs`. Re-encoding with different browser/font/FFmpeg versions can change bytes and hashes.

## Verification and original preservation

Completed: native Chrome capture assertions (17 shots, correct text/font/colour/gradient, saved pending element comment, clean saved state), zero page errors/external requests/provider calls; complete final FFmpeg video+audio decode (564 frames), codec/duration/fast-start checks; inspected decoded eight-frame contact sheet and full-size poster; native Chrome playback through the end at 2× plus three timestamp-matched seeks to distinct pictures. AAC peak −3.0 dBFS, mean −18.7 dBFS. Detailed facts are in `validation.json`.

This is a media check, **not** an app regression, accessibility or cross-browser certification. Audio was decoded/measured but not human-auditioned. No app build/unit/E2E suite was rerun, and no subjective owner approval is implied.

Before any change, the complete original `assets/demo-video/`, MP4 and poster were copied to the durable sibling backup:

`C:\Users\amarbir\self_learning\tweakerr-demo-original-backup-qrk43_2m`

All **23 source/copy files** were SHA-256 verified before editing. Its `manifest-sha256.json` (SHA-256 `6ad073f309d9da85076b5db9a838a97f956691fce2e09d680db5050d45cfa4ba`) records both hashes and paths. The backup/archival files remain unchanged. To restore, copy those three original paths back from that backup; remove newly added media helper/source files if an exact original-only directory is required. No staging, commit or push is performed by these helpers.
