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
  overlay.ts           glass layer on top: hover/selection boxes, handles, guides
  pointer.ts           mouse: select, drag (with snapping), resize, double-click
  transform.ts         how each kind of element moves and resizes
  textedit.ts          typing in place
src/doc/
  history.ts           undo/redo, recorded with a MutationObserver
  serialize.ts         document -> HTML file
  style.ts             read computed styles, write inline styles
  markers.ts           SVG arrowheads (copy-on-write for shared markers)
  actions.ts           delete, duplicate, hide, nudge, select parent/child/siblings
  similar.ts           "select all like this": same type, same colour
  kinds.ts, palette.ts helpers: what kind of element, page colours/fonts
src/panel/             properties panel (controls + per-element sections), layers
src/io/files.ts        File System Access API with input/download fallbacks
```

The page being edited is loaded into an `<iframe sandbox="allow-same-origin">` via `srcdoc`. Without `allow-scripts`, the page's scripts never run. `allow-same-origin` still lets the editor read and change its DOM directly.

## Rules that keep saved files clean

1. **Never draw editor UI inside the page.** Selection boxes, handles, labels and guides all live in the overlay, in the editor's own document. Serialising the page must give back the user's file plus their edits and nothing else.
2. **Every change goes through `editor.edit(label, fn, mergeKey?)`** (or `history.begin/end` for gestures). That is what makes it undoable. A change made outside a transaction won't be undone, and may silently end up in the saved file.
3. **Temporary attributes stay outside transactions.** Example: the `contenteditable` that text editing needs is added before `begin()` and removed after `end()`.
4. **Watch for cross-frame objects.** Page nodes come from the iframe's window, so `el instanceof HTMLElement` is false for them. Check `namespaceURI` or `localName` instead.
5. **Think in selections.** `editor.selection` is a list, and `editor.selected` is the main (last picked) element. The panel reads values from the main one and writes to all of them. Commands that move or delete use `editor.selectionRoots`, so a card and its heading selected together are only moved once.
6. **Offline only.** No CDN, fonts or network calls in the editor. The build must work opened from disk.

## Tests

- Browser tests live in `tests/e2e/` and run against the built `dist/tweakerr.html`.
- `helpers.ts` has `domDiff(before, after)`. It parses both files and lists every attribute, text and child-list difference. Most tests end with "save, then the diff must be exactly these lines". Please keep that habit for new features.
- `tests/fixtures/board.html` is a typical AI-written page: a `<style>` block, an `!important` rule, flex cards, an absolutely positioned badge, SVG arrows (two sharing one arrowhead), and a script that must not run.
- `tests/e2e/real-files.spec.ts` runs the same done-check against any files you point it at:

  ```sh
  TWEAKERR_FILES="/path/a.html:/path/b.html" npx playwright test real-files --output /tmp/tweakerr-out
  ```

  Keep `--output` outside the repo, because it holds edited copies of your files. Never commit real or private files as fixtures.

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
