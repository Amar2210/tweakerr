# Tweakerr demo — file edits + element comments

Canonical outputs: [`../tweakerr-demo.mp4`](../tweakerr-demo.mp4) and [`../tweakerr-demo-poster.jpg`](../tweakerr-demo-poster.jpg).

**24.4 seconds · 1920 × 1080 · 30 fps · 732 frames.** H.264 High, 8-bit 4:2:0, limited-range BT.709; AAC LC stereo at 48 kHz. Fast-start MP4, 6,193,787 bytes. Poster: decoded Comments sidebar/located-target frame at 19.4s, 1920 × 1080, 146,806 bytes.

- MP4 SHA-256: `8c5440e75082884b8a81635bd5f60cb547ba71d822eb564c765610cbdade9de0`
- Poster SHA-256: `14361fd2ffd729f97198c8da584f11aac5e00201376203b9638a25132850c753`

## Film and sources

The original instrumental product-film treatment is retained: moving editor crops, restrained one-word edit labels, no voice, tutorial captions, subtitles or progress bars. All featured editor shots were freshly captured from the comments-only standalone build (SHA-256 `8f2e963e33e2d1982ca18e6bee9dbc0e4cca2305dca2896b5fb4178d4fbad70b`). No integrated AI, Connect, API, Revise, AI Undo or recovery footage is used. No provider requests or credentials are involved.

| Time | Picture |
| --- | --- |
| 0–1.8s | Orbit HTML / Tweakerr reveal |
| 1.8–4s | Real opened file and canvas selection |
| 4–6.6s | Edit the headline to “Make it yours.” |
| 6.6–10.1s | Georgia font and lime HEX colour |
| 10.1–12.2s | Lime/teal button gradient |
| 12.2–17s | Attach comment #1 to the headline, type “Keep this headline short and bold.”, Save comment |
| 17–20.6s | Enlarged actual left Comments sidebar: Pending (1), request, target link; Locate selects the attached headline |
| 20.6–21.9s | Actual toolbar Save and saved page (real HTML download containing the comment and edits) |
| 21.9–24.4s | Logo / “Make it yours.” end card |

`orbit-dashboard.html` is the only capture input: a synthetic, self-contained fixture. `orbit-dashboard-edited.html` is the actual downloaded result, including the pending `C1` comment targeting `hero-title`. `shots/` contains 19 meaningful real UI stills, not exported animation frames. `capture.mjs` drives Open, selection, editing, controls, comment Add/input/Save, the real Comments view/Locate action, and file Save; `capture-validation.json` records the checks and crop geometry.

**Media-only icon timing:** the capture helper temporarily injects root-page CSS `.comment-add, .comment-marker { visibility: hidden !important; }` for all 11 Open/Edit/Restyle/Refine stills. Every early snap asserts these controls are invisible. The style is removed immediately before `comment-target`; all eight final-segment snaps assert normal Add controls are visible. Floating comment controls first appear at the 12.2s comments transition, not during earlier editing. The CSS never changes app/source code, enters the imported fixture, or appears in saved HTML.

The sidebar occupies its own 600px-wide close-up alongside the canvas for 3.6s (3.32s after the transition finishes), not a tiny full-app flash. Actual Locate changes selection from `launch-button` to `hero-title` without reopening the popover. The crop includes the real Comments heading/tab and complete Pending entry/target, rather than unrelated lower sidebar content.

`motion.js` is the deterministic composition/storyboard, shared by the browser preview and export. Open `motion.html` and press **Play** to preview with music. `soundtrack.wav` is the unchanged original 15s instrumental and whooshes (no external samples). `export.py` reproducibly creates `soundtrack-film.wav`: a twenty-beat, 9.375s insert (source 1.875–11.25s) from that music before source 11.25s, a 40ms time-preserving crossfade, the original ending, and 0.025s tail silence. No pitch/tempo change or new speech.

## Render again — existing local tools only

The following are the exact WSL commands/tool paths used for this export, run from the repository root. They use installed **Windows Node and Chrome**, installed Playwright and FFmpeg, and standard-library Python 3. Do not install or download packages/browsers. On another machine, substitute equivalent already-installed paths. The JS helpers accept an optional `TWEAKERR_CHROME` environment variable when launched natively.

```bash
NODE='/mnt/c/Program Files/nodejs/node.exe'
PW='file://wsl.localhost/Ubuntu/home/amarbirajdar/.local/share/tweakerr/node_modules/@playwright/test/index.mjs'
FFMPEG='/mnt/c/Users/amarbir/AppData/Local/Temp/bruno-ui-research/deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
WORK="$(mktemp -d /mnt/c/Users/amarbir/AppData/Local/Temp/tweakerr-demo-sidebar-XXXXXX)"

# Optional: replace the source stills using an existing comments-only dist build.
# This does NOT build the app or run the regression suite.
# "$NODE" assets/demo-video/capture.mjs "$PW"

python3 assets/demo-video/export.py --prepare-audio
"$NODE" assets/demo-video/render.mjs "$PW" "--work=$(wslpath -w "$WORK")"
python3 assets/demo-video/export.py --work "$WORK" --ffmpeg "$FFMPEG"
"$NODE" assets/demo-video/check.mjs "$PW"
```

Use `render.mjs ... --preview` for four targeted composition stills (11.8s before comments, 15s comment entry, 18s sidebar, 19.4s located target); this is not a complete frame set for export. A full render writes 732 JPEG frames and render facts **only to the unique Temp directory**, never into the repository. Export writes the canonical MP4/poster and `validation.json`, and leaves its full final A/V decode log and nine-frame **decoded** contact sheet in that Temp directory. Chrome's final playback/seek results are appended by `check.mjs`. Re-encoding with different browser/font/FFmpeg versions can change bytes and hashes.

## Verification and original preservation

Completed: native Chrome capture assertions (19 shots, 11 early shots with floating controls hidden, normal controls restored for comments, actual sidebar request/target and Locate linkage, correct text/font/colour/gradient, saved pending element comment, clean saved state), zero page errors/external requests/provider calls; inspected four targeted previews; complete final FFmpeg video+audio decode (732 frames), codec/duration/fast-start checks; inspected decoded nine-frame contact sheet and full-size sidebar poster; native Chrome playback through the end at 2× plus four timestamp-matched seeks to distinct pictures. AAC peak −3.0 dBFS, mean −18.7 dBFS. Detailed facts are in `validation.json`.

This is a media check, **not** an app regression, accessibility or cross-browser certification. Audio was decoded/measured but not human-auditioned. No app build/unit/E2E suite was rerun, and no subjective owner approval is implied.

Before this sidebar/icon-timing revision, the **complete previous 18.8s cut**, poster and `assets/demo-video/` were copied to the new durable sibling backup:

`C:\Users\amarbir\self_learning\tweakerr-demo-18p8-backup-6rc_uu89`

All **32 source/copy files** were SHA-256 verified before editing. Its `manifest-sha256.json` SHA-256 is `45f1da044a481973fb2495923f418e22e7961aaca08f8b0ea0c1b01c5acc86fe`. The earlier original backup also remains untouched:

`C:\Users\amarbir\self_learning\tweakerr-demo-original-backup-qrk43_2m`

That original backup contains 23 verified files; its manifest SHA-256 is `6ad073f309d9da85076b5db9a838a97f956691fce2e09d680db5050d45cfa4ba`. Both manifests record source/copy hashes and relative paths. To restore either cut, copy its three media paths back from the chosen backup; remove newer added helper/shot files if an exact prior-only directory is required. No backup/archival files are changed. No staging, commit or push is performed by these helpers.
