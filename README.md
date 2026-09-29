<p align="center">
  <img src="assets/logo.svg" width="112" alt="Tweakerr logo">
</p>

<h1 align="center">Tweakerr</h1>

**Click-to-edit for HTML files.** Open an `.html` page (the kind an AI assistant writes for you), click a box, and change it: border, colours, arrow colour, size, position, opacity, spacing, text. Select several things, or "all like this", and change them together. Save, and you get the same file back with just those changes.

No code editor, no asking the AI again for a one-pixel nudge.

- **One file, fully offline.** Tweakerr is a single `tweakerr.html`. Open it in Chrome or Edge. Your page never leaves your computer.
- **Clean output.** The saved file is your file plus your edits. Nothing else changes. Tweakerr's selection boxes and handles are drawn on a separate layer and never go into your page.
- **Safe with scripts.** Scripts in your page don't run while you edit, and they are saved back exactly as they were.

> Made with Claude.

## Quick start

1. Get `tweakerr.html`: download it from a release, or build it yourself (see [Build it](#build-it)).
2. Open it in **Chrome or Edge** by double-clicking it.
3. Click **Open**, or drop an `.html` file onto the window.
4. Click anything and edit it in the panel on the right.
5. Press **Ctrl+S**.

In Chrome and Edge, Ctrl+S writes straight back to the file you opened (the browser asks for permission the first time). In other browsers, or with a dropped file that the browser won't let Tweakerr write to, Save downloads the edited copy.

## What you can do

| | |
|---|---|
| **Select** | Click an element. Click again inside it to go deeper. **Shift+Enter** selects the parent. The layers list on the left shows the whole page, and its **‹** arrow folds it away when you want a bigger canvas. |
| **Select several** | **Shift+click** (or **Ctrl+click**) adds an element or takes it out, on the page or in the layers list. Clicking a card's text adds the whole card, matching what's already selected. **Ctrl+A** adds everything next to the selected element. **Esc** clears. |
| **Select all like this** | With something selected, the panel offers **Same type** (every `div.card`, including `card done` and `card risk`, or every arrow) and **Same colour** (everything with this fill, border, stroke or text colour). One click selects them all. |
| **Edit them together** | With several selected, every change in the panel applies to all of them, and dragging, arrow keys, delete, duplicate and hide act on the whole group. It's still one undo step. |
| **Move** | Drag it. It snaps into line with its neighbours (pink guides). **Shift** keeps it in a straight line, **Alt** turns snapping off, and **arrow keys** nudge by 1px (**Shift** for 10px). |
| **Resize** | Drag the handles. **Shift** keeps the proportions. Works on boxes, SVG rectangles, circles and ellipses, and on the two ends of SVG lines. |
| **Colours** | Text, background, border, SVG fill and stroke. The picker offers the colours your page already uses. |
| **Borders** | Width, style (solid, dashed, dotted…), colour and corner radius. |
| **Arrows** | Line colour, width, dashes and line ends, plus the **arrowhead colour**. When several arrows share one arrowhead, Tweakerr copies it for the arrows you change, so the others stay as they were. If you've selected every arrow that uses it, it's recoloured in place. |
| **Text** | Double-click to type in place. Also font, size, weight, alignment, bold, italic, underline and uppercase. |
| **Effects** | Opacity, shadow and layer order (z-index). |
| **Spacing** | Padding and margin. |
| **Page** | Background, text colour and font for the whole page. |
| **Other** | Duplicate (**Ctrl+D**), delete (**Del**), hide/show, link targets, image source and alt text, and a raw "Custom CSS" box for anything else. |
| **Undo** | **Ctrl+Z** / **Ctrl+Shift+Z**. A whole drag, or a whole typing session, is one step. |
| **Preview widths** | Desktop, tablet and phone widths, plus zoom (**Ctrl + wheel**). |

Press **?** in Tweakerr for all shortcuts.

## How edits are saved

Every change is saved as an inline `style` (or an SVG attribute) on the element you changed. A moved box gets `translate: 12px 4px`. A thicker border gets `border-width: 4px`. It stays readable and easy to undo by hand.

If your stylesheet uses `!important` for a property you change, Tweakerr adds `!important` to your edit too, so the change actually shows.

## Limits (v0.2)

- **Pages built by scripts.** Some pages keep their content in JavaScript and draw it when the page runs (an interactive diagram, a slideshow player). Scripts don't run in Tweakerr, so that content won't appear and can't be edited. Pages whose HTML is written out directly work fully.
- **Files that load other files.** Images or stylesheets referenced by relative paths (`styles/main.css`, `img/logo.png`) don't load, because Tweakerr sees only the file itself. Single-file pages and links to the web (`https://…`) are fine.
- **Chrome or Edge** is needed to save straight back to the file. Other browsers fall back to downloading a copy.
- **With several selected**, resize handles, exact SVG coordinates, link/image fields and the raw CSS box are hidden (they only make sense one element at a time). Boxes and SVG shapes selected together share only opacity.
- **Not yet supported:** adding new shapes, drag-to-select with a rectangle, editing several files at once.

## Build it

Needs Node.js 20 or newer.

```sh
npm install
npm run build        # -> dist/tweakerr.html (one self-contained file)
npm run dev          # live-reloading dev server
npm run check        # type-check + unit tests + browser tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is organised and how to run the tests.

## Licence

MIT. See [LICENSE](LICENSE).

Tweakerr was built with [Claude Code](https://claude.com/claude-code).
