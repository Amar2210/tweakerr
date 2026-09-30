<p align="center">
  <img src="assets/logo.svg" width="112" alt="Tweakerr logo">
</p>

<h1 align="center">Tweakerr</h1>

**Click-to-edit for HTML files.** Open an `.html` page (the kind an AI assistant writes for you), click a box, and change it: border, colours, arrow colour, size, position, opacity, spacing, text. Select several things, or "all like this", and change them together. Save, and you get the same file back with just those changes.

No code editor, no asking the AI again for a one-pixel nudge.

- **One file, fully offline.** Tweakerr is a single `tweakerr.html`. Open it in Chrome or Edge. Your page never leaves your computer.
- **Clean output.** The saved file is your file plus your edits. Nothing else changes. Tweakerr's selection boxes and handles are drawn on a separate layer and never go into your page.
- **Works with pages drawn by code.** If your page builds its boxes and arrows with a script (a diagram made from a data list, say), Tweakerr runs it, lets you click and change what it draws, and saves your changes without touching the code. See [Pages drawn by code](#pages-drawn-by-code).

> Made with Claude.

## Get it

- **Use it in your browser:** open **https://amar2210.github.io/tweakerr/**. It is always the latest version.
- **Download it for offline use:** [**tweakerr.html**](https://github.com/Amar2210/tweakerr/releases/latest/download/tweakerr.html). This link always gives the newest release. Double-click the downloaded file to open it in Chrome or Edge. It needs no install and no internet. To update, download it again and replace the old file.

Either way, the pages you edit stay on your computer. Tweakerr opens and saves them inside your browser and never uploads them.

## Quick start

1. Open Tweakerr (see [Get it](#get-it)) in **Chrome or Edge**.
2. Click **Open**, or drop an `.html` file onto the window.
3. Click anything and edit it in the panel on the right.
4. Press **Ctrl+S**.

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
| **Gradients** | A gradient background gets its own editor: one colour per stop, the angle, and linear/radial/conic. Add or remove colours, remove the gradient, or turn a plain fill into one with **Make it a gradient**. |
| **Borders** | Width, style (solid, dashed, dotted…), colour and corner radius. |
| **Arrows** | Line colour, width, dashes and line ends, plus the **arrowhead colour**. When several arrows share one arrowhead, Tweakerr copies it for the arrows you change, so the others stay as they were. If you've selected every arrow that uses it, it's recoloured in place. |
| **Text** | Double-click to type in place. Also size, weight, alignment, bold, italic, underline and uppercase. |
| **Fonts** | The font field shows a single name. Its list offers the fonts your page uses, common fonts found on most computers, and CSS's basic kinds, each drawn in its own typeface. Tweakerr adds a matching fallback (e.g. `Georgia, serif`) so the text still looks right on machines without the font. |
| **Effects** | Opacity, shadow and layer order (z-index). |
| **Spacing** | Padding and margin. |
| **Page** | Background, text colour and font for the whole page. |
| **Other** | Duplicate (**Ctrl+D**), delete (**Del**), hide/show, link targets, image source and alt text, and a raw "Custom CSS" box for anything else. |
| **Undo** | **Ctrl+Z** / **Ctrl+Shift+Z**. A whole drag, or a whole typing session, is one step. |
| **Preview widths** | Desktop, tablet and phone widths, plus zoom (**Ctrl + wheel**). |

Press **?** in Tweakerr for all shortcuts.

## Pages drawn by code

Some pages keep their content in a script and draw it when the page opens, like a flow diagram built from a list of steps. Tweakerr notices this when you open the page and shows a **Live page** badge. The page's scripts run while you edit, so everything they draw is there to click.

Your changes are saved differently on these pages. Tweakerr can't save the drawn boxes into the file, because the script would then draw them a second time. So it leaves your file exactly as it was, and adds one block at the top of it:

```html
<style id="tweakerr-edits">
/* Changes made with Tweakerr. Delete this block to undo them all. */
#step-order { background-color: rgb(255, 243, 196) !important; }
#step-cash { left: 40px !important; top: 90px !important; }
</style>
```

When the page opens, the script draws everything as usual, and these rules restyle it. Open the file in Tweakerr again and you can keep editing the same rules.

| On a live page | |
|---|---|
| **Works** | Colours, gradients, borders, fonts, sizes, spacing, opacity, arrow colours. Moving and resizing boxes. If the page redraws its arrows when the window changes size, they follow the boxes you move. |
| **Text** | Double-click to change words. Tweakerr changes them where the code writes them (`title: 'Invoice'` becomes `title: 'Billing'`). When the same words are written for several items (`team: "HR"` on three cards), it changes the one written next to the clicked card's other words, such as its title. If it still can't tell, or the words are put together by the code, it says so. |
| **Delete** | Hides the item, because the code would just draw it again. |
| **Scrolling** | Boxes that scroll inside the page (a wide board, say) scroll with the wheel, Shift+wheel or a sideways swipe, and their scrollbars can be dragged. This works on every page. |
| **Not available** | Duplicating, dragging the two ends of a line separately, and link/image fields. |

A thing the code draws without an id is found by its position ("the 14th item in the grid"), and the panel tells you so. If you later change the code so that its items come in a different order, such a change can land on a different item.

A page whose script does something small, like filling in today's date, isn't a live page: it opens with scripts off and full editing, as before.

Scripts only run in pages that draw themselves. Opening such a page in Tweakerr is like opening it in your browser, so open only files you trust.

## How edits are saved

On an ordinary page, every change is saved as an inline `style` (or an SVG attribute) on the element you changed. A moved box gets `translate: 12px 4px`. A thicker border gets `border-width: 4px`. It stays readable and easy to undo by hand.

If your stylesheet uses `!important` for a property you change, Tweakerr adds `!important` to your edit too, so the change actually shows.

## Limits (v0.3)

- **Files that load other files.** Scripts, images or stylesheets referenced by relative paths (`app.js`, `styles/main.css`, `img/logo.png`) don't load, because Tweakerr sees only the file itself. Tweakerr warns you when a page's script is in another file. Single-file pages and links to the web (`https://…`) are fine.
- **Pages drawn by code** have the limits listed in [Pages drawn by code](#pages-drawn-by-code).
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
