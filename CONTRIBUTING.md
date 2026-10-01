# Contributing to Tweakerr

Thanks for helping. This page covers the layout of the code, the few rules that keep saved files clean, and how to run the tests.

## Setup

```sh
npm install
npx playwright install chromium   # once, for the browser tests
npm run dev                        # http://localhost:5173/tweakerr.html
```

| Script | What it does |
|---|---|
| `npm run build` | Type-check, then build `dist/tweakerr.html` (one file, no external resources). |
| `npm test` | Unit tests (Vitest + jsdom): history, serialiser, colours, geometry. |
| `npm run test:e2e` | Build, then drive the real editor in Chromium (Playwright). |
| `npm run check` | All of the above. Run it before sending a change. |

The stack is TypeScript, Vite and `vite-plugin-singlefile`, with no UI framework.

## How it works

```
tweakerr.html          layout: toolbar · layers · canvas · properties · status bar
src/main.ts            wiring: toolbar, keyboard, open/save, drag-and-drop
src/editor.ts          shared state + events (load, selection, change, layout…); the selection is a list
src/canvas/
  stage.ts             the user's page in a sandboxed iframe; zoom; coordinates
  livepage.ts          is this a live page? keeping the editor in step when it redraws
  overlay.ts           glass layer on top: hover/selection boxes, handles, guides
  pointer.ts           mouse: select, drag (with snapping), resize, double-click
  transform.ts         how each kind of element moves and resizes
  arrow.ts             arrow dots: move an end, bend the middle (live pages: a `d` rule)
  magnet.ts            an arrow end snaps onto the nearest box edge
  textedit.ts          typing in place
src/doc/
  history.ts           undo/redo, recorded with a MutationObserver
  serialize.ts         document -> HTML file
  style.ts             read computed styles, write inline styles (or live rules)
  live.ts              live pages: edits as style rules keyed by selector, text swaps
  livefile.ts          saving a live page: original text + edits block + swaps
  markers.ts           SVG arrowheads (copy-on-write for shared markers)
  actions.ts           delete, duplicate, hide, nudge, select parent/child/siblings
  similar.ts           "select all like this": same type, same colour
  kinds.ts, palette.ts helpers: what kind of element, page colours/fonts
  keys.ts              a stable id per element (merges edits; kept across live redraws)
src/panel/             properties panel (controls + per-element sections), layers
src/io/files.ts        File System Access API with input/download fallbacks
src/util/path.ts       SVG path data: parse, move an end, bend, straighten
```

The page being edited is loaded into an `<iframe sandbox="allow-same-origin">` via `srcdoc`. Without `allow-scripts`, the page's scripts never run. `allow-same-origin` still lets the editor read and change its DOM directly. Clicks are matched to elements with `elementFromPoint`. So that SVG labels the page made click-through (`pointer-events: none`) can still be picked, `Stage` adds one adopted stylesheet. It isn't in the DOM, so it never reaches history or the saved file.

**Live pages.** If the page has scripts, `Stage.mount` first loads it with `allow-scripts`, waits for it to settle, and compares it with the page as written (`drawsItself`). If the scripts drew a real part of it, the page stays live: a `LiveEdits` (src/doc/live.ts) is attached. Otherwise it's reloaded with scripts off.

On a live page, `setStyle`/`setAttr` write into one `<style id="tweakerr-edits">` instead of inline styles. Each element gets a rule keyed by a selector: its id, else a `data-id`-like attribute, else an `:nth-child` path from the nearest ancestor with one. All rules are `!important`, because page code often sets inline styles. The rules live in the style element's single text node, and text swaps in one of its attributes, so history records them like any other DOM change. Saving (`livefile.ts`) writes the original file text plus that block, with swaps applied; the DOM is never serialised. HTML boxes move with `left`/`top` rather than `translate`, because connector code often measures with `offsetLeft`. After such a change, `watchPage` fires a `resize` so the page can redraw, then finds the selection again by selector. Code that redraws often replaces its elements, so anything holding an old copy goes through `LiveEdits.relocate` (`computed()` and the selection do this) to reach the one on the page. A reshaped arrow on a live page is a `d: path("…")` rule, which also applies to the copies the code draws later.

## Rules that keep saved files clean

1. **Never draw editor UI inside the page.** Selection boxes, handles, labels and guides all live in the overlay, in the editor's own document. Serialising the page must give back the user's file plus their edits and nothing else.
2. **Every change goes through `editor.edit(label, fn, mergeKey?)`** (or `history.begin/end` for gestures). That is what makes it undoable. A change made outside a transaction won't be undone, and may silently end up in the saved file.
3. **Temporary attributes stay outside transactions.** Example: the `contenteditable` that text editing needs is added before `begin()` and removed after `end()`.
4. **Watch for cross-frame objects.** Page nodes come from the iframe's window, so `el instanceof HTMLElement` is false for them. Check `namespaceURI` or `localName` instead.
5. **Think in selections.** `editor.selection` is a list, and `editor.selected` is the main (last picked) element. The panel reads values from the main one and writes to all of them. Commands that move or delete use `editor.selectionRoots`, so a card and its heading selected together are only moved once.
6. **Write styles through `setStyle`/`setAttr`** (src/doc/style.ts), never `el.style` or `setAttribute` directly, so live pages get rules for free. An attribute with no CSS twin (line ends, `href`) can't be saved on a live page, so its control is hidden there.
7. **Offline only.** No CDN, fonts or network calls in the editor. The build must work opened from disk.

## Tests

- Browser tests live in `tests/e2e/` and run against the built `dist/tweakerr.html`.
- `helpers.ts` has `domDiff(before, after)`. It parses both files and lists every attribute, text and child-list difference. Most tests end with "save, then the diff must be exactly these lines". Please keep that habit for new features.
- `tests/fixtures/board.html` is a typical AI-written page: a `<style>` block, an `!important` rule, flex cards, an absolutely positioned badge, SVG arrows (two sharing one arrowhead), and a script that must not run.
- `tests/e2e/real-files.spec.ts` runs the same done-check against any files you point it at:

  ```sh
  TWEAKERR_FILES="/path/a.html:/path/b.html" npx playwright test real-files --output /tmp/tweakerr-out
  ```

  Keep `--output` outside the repo, because it holds edited copies of your files. Never commit real or private files as fixtures.

## Releasing

GitHub Actions does the building and publishing (`.github/workflows/`):

- **Every push to `main`** updates the web version at https://amar2210.github.io/tweakerr/ (`pages.yml`).
- **Every pushed `v*` tag** builds `tweakerr.html` and publishes it as a GitHub Release (`release.yml`). The download link `releases/latest/download/tweakerr.html` then points at it.

To make a release:

1. Run `npm run check`.
2. Bump the version: `npm version 0.3.0 --no-git-tag-version`. This updates `package.json` and `package-lock.json`. Commit it.
3. Tag it. The tag's message becomes the release notes:

   ```sh
   git tag -a v0.3.0 -m "Tweakerr 0.3.0

   - What's new, one line each"
   ```

4. Push both: `git push origin main` and then `git push origin v0.3.0`.

The release job stops if the tag doesn't match `package.json`, so a forgotten bump is caught. Keep the attached file named `tweakerr.html`, or the "latest" download link breaks.

## Notes for WSL / machines without sudo

**Chromium won't start** (`libnspr4.so: cannot open shared object file`). If you can't `sudo npx playwright install-deps`, unpack the three missing libraries into your home folder:

```sh
mkdir -p ~/.local/pw-libs && cd ~/.local/pw-libs
apt-get download libnspr4 libnss3 libasound2t64
for f in *.deb; do dpkg -x "$f" root; done
```

`playwright.config.ts` adds `~/.local/pw-libs/root/usr/lib/x86_64-linux-gnu` to `LD_LIBRARY_PATH` automatically if that folder exists.

**Very slow tests** (`Timeout waiting for worker`) when the project is on a Windows drive (`/mnt/c/...`). Node reading `node_modules` over the Windows bridge is about 100 times slower. Keep `node_modules` on the Linux disk and link it:

```sh
mkdir -p ~/.local/share/tweakerr
cp package.json package-lock.json ~/.local/share/tweakerr/
(cd ~/.local/share/tweakerr && npm ci)
rm -rf node_modules && ln -s ~/.local/share/tweakerr/node_modules node_modules
```

`npm install <package>` run in the project replaces the link with a real folder. After adding a dependency, repeat the steps above.
