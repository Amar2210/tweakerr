<p align="center">
  <img src="assets/logo.svg" width="112" alt="Tweakerr logo">
</p>

<h1 align="center">Tweakerr</h1>

**Click-to-edit for HTML files.** Open an `.html` page (the kind an AI assistant writes for you), click a box, and change it: border, colours, arrow colour, size, position, opacity, spacing, text. Select several things, or "all like this", and change them together. Save, and you get the same file back with your edits and a change log in an HTML comment.

No code editor, no asking the AI again for a one-pixel nudge.

- **One file, fully offline.** Tweakerr is a single `tweakerr.html`. Open it in Chrome or Edge. Your page never leaves your computer.
- **Clean output.** The saved file is your file plus your edits, a change-log comment, and any revision comments you add. Tweakerr's selection boxes, handles and comment markers are drawn on a separate layer and never go into your page.
- **Works with pages drawn by code.** If your page builds its boxes and arrows with a script (a diagram made from a data list, say), Tweakerr runs it, lets you click and change what it draws, and saves your changes without touching the code. See [Pages drawn by code](#pages-drawn-by-code).

> Made with Claude.

## Get it

**Current version: v0.6.0.**

- **Use it in your browser:** open **https://amar2210.github.io/tweakerr/**. It is always the latest version.
- **Download it for offline use:** [**tweakerr.html**](https://github.com/Amar2210/tweakerr/releases/latest/download/tweakerr.html). This link always gives the newest release. Double-click the downloaded file to open it in Chrome or Edge. It needs no install and no internet. To update, download it again and replace the old file.

Either way, the pages you edit stay on your computer. Tweakerr opens and saves them inside your browser and never uploads them.

Releases use three-part versions: **MAJOR.MINOR.PATCH** (for example, `v0.6.0`). Bug fixes increase PATCH (`v0.6.1`), new features increase MINOR (`v0.7.0`), and breaking changes increase MAJOR (`v1.0.0`). See [release guidelines](CONTRIBUTING.md#releasing).

## What's new in v0.6.0

- **Element-attached revision comments.** Add a request to one element or share it across a multi-selection, with stable canvas markers and undo/redo support.
- **Explicit Save comment.** The green tick confirms and closes a pending request; the page's **Save / Ctrl+S** writes it into the HTML. It does not resolve the request.
- **Comments sidebar.** Browse pending requests and LLM-returned resolutions, and locate each confidently matched target without editing the page. Missing or ambiguous targets stay readable rather than being guessed.
- **Portable, offline handoff.** Requests live in a separate HTML-comment metadata block, not in the presentation or immutable edit log. Choose an external LLM yourself; Tweakerr makes no AI calls.
- **Safer save and undo.** Edits made during a pending file write stay unsaved, comment-only undo/redo does not redraw live pages, and undo grouping is insulated from system-clock changes.
- **Targeted live-text replay.** After a scripted redraw, a text change stays scoped to the selected item instead of changing a sibling with the same label.

## Quick start

1. Open Tweakerr (see [Get it](#get-it)) in **Chrome or Edge**.
2. Click **Open**, or drop an `.html` file onto the window.
3. Click anything and edit it in the panel on the right. Use **Style** for fills, borders and effects, **Text** for typography, and **Arrange** for size, position and spacing.
4. Press **Ctrl+S**.

In Chrome and Edge, Ctrl+S writes straight back to the file you opened (the browser asks for permission the first time). In other browsers, or with a dropped file that the browser won't let Tweakerr write to, Save downloads the edited copy.

Click the **Tweakerr logo** to return home. With a page open, Tweakerr asks you to confirm before leaving and warns if there are unsaved changes. Cancel keeps your page, selection and undo history. Refreshing the browser also warns about unsaved changes.

## What you can do

| | |
|---|---|
| **Select** | Click an element. Click again inside it to go deeper. **Shift+Enter** selects the parent. The layers list on the left shows the whole page. The arrow at the top of each side panel folds it into a thin strip when you want a bigger canvas; click the arrow again (or the layers icon) to bring it back. |
| **Select several** | **Shift+click** (or **Ctrl+click**) adds an element or takes it out, on the page or in the layers list. Clicking a card's text adds the whole card, matching what's already selected. **Ctrl+A** adds everything next to the selected element. **Esc** clears. |
| **Select all like this** | With something selected, the panel offers **Same type** (every `div.card`, including `card done` and `card risk`, or every arrow) and **Same colour** (everything with this fill, border, stroke or text colour). One click selects them all. |
| **Edit them together** | With several selected, every change in the panel applies to all of them, and dragging, arrow keys, delete, duplicate and hide act on the whole group. It's still one undo step. |
| **Move** | Drag it. It snaps into line with its neighbours (pink guides). **Shift** keeps it in a straight line, **Alt** turns snapping off, and **arrow keys** nudge by 1px (**Shift** for 10px). |
| **Resize** | Drag the handles. **Shift** keeps the proportions. Works on boxes, SVG rectangles, circles and ellipses. |
| **Colours** | Text, background, border, SVG fill and stroke. Click a swatch to open the picker: the **HEX** field is directly below the colour preview and ready to type or paste. Apply with **Enter** or by leaving the field. Codes work with or without `#`, including short forms such as `#abc`. The picker also offers the colours your page already uses. |
| **Gradients** | Tick **Gradient** in **Fill & border** to show a separate **Gradient** section. Choose **Linear**, **Radial** or **Conic**, edit each colour stop, and adjust the angle for linear gradients. Add or remove colours; untick the checkbox to remove the gradient while keeping other background image layers. Imported gradients are already checked. |
| **Borders** | Width, style (solid, dashed, dotted…), colour and corner radius. A box with lines on only some sides (a grid cell's right and bottom) becomes one even frame when you change its style. |
| **Arrows** | Line colour, width, dashes and line ends, plus the **arrowhead colour**. When several arrows share one arrowhead, Tweakerr copies it for the arrows you change, so the others stay as they were. If you've selected every arrow that uses it, it's recoloured in place. |
| **Reshape arrows** | A selected arrow (an SVG line or curve) shows three dots. Drag the **tail** or **head** dot to reconnect it: near a box it snaps onto the box's edge, most readily the middle of a side (**Alt** turns the magnet off). Drag the **middle** dot to bend it into a curve; drag it back near the straight line and it snaps straight. |
| **Text** | Double-click HTML text to type in place. For SVG labels, use the **Text** field in the right panel. Set a numeric **Size** with **− / +** buttons, then adjust alignment, bold, italic, underline and uppercase. HTML text also has numeric **Line spacing** with **− / +** buttons. The text fields share one alignment; separate weight and letter-gap controls have been removed. |
| **Fonts** | The font field shows a single name. Its list offers the fonts your page uses, common fonts found on most computers, and CSS's basic kinds, each drawn in its own typeface. Tweakerr adds a matching fallback (e.g. `Georgia, serif`) so the text still looks right on machines without the font. |
| **Links while editing** | Clicking a link selects it for editing. Links do not navigate, open tabs, jump to anchors or download files inside the editor, including while editing text. Their original targets remain functional in the saved page. |
| **Change log** | Saving includes an HTML comment at the top of the file with timestamps, edit labels, element paths, and before/after values. Undo and redo are recorded too. Earlier records survive reopening; saving again without changes adds no duplicate records. |
| **Revision comments** | Select one or several elements, then **Add comment** beside the selection. A shared request gets matching speech-bubble markers and dashed borders. Click a marker to edit; **Save comment** confirms and closes it while keeping it pending. Click outside or press **Esc** to collapse. **×** deletes the comment completely. Use page **Save** to write the HTML, then give it to an LLM. The left sidebar's **Comments** view lists pending and resolved requests with per-target navigation. No AI connection is made by Tweakerr. |
| **Properties tabs** | **Style**, **Text**, and **Arrange** group the controls in the right panel. The active tab stays selected as you pick other items; unavailable tabs are disabled. Custom CSS starts collapsed in Style. Use Left/Right or Home/End while a tab is focused to switch tabs. |
| **Effects** | **Opacity** for HTML elements and SVG shapes, plus shadows for HTML elements. Opacity lives here rather than in the colour picker. Layer order (z-index) is in **Size & position**. |
| **Spacing** | Padding and margin. |
| **Page** | Background, text colour and font for the whole page. |
| **Other** | Duplicate (**Ctrl+D**), delete (**Del**), hide/show, link targets, image source and alt text, and a raw "Custom CSS" box for anything else. |
| **Number fields** | Type a value, use **− / +** for text size and line spacing or the small up/down buttons for other properties, press **↑/↓**, or drag the field's name. Hold a button to repeat. **Shift** steps ×10. |
| **Undo** | **Ctrl+Z** / **Ctrl+Shift+Z**. A whole drag, or a whole typing session, is one step. |
| **Preview widths** | Desktop, tablet and phone widths, plus zoom (**Ctrl + wheel**). |

Press **?** in Tweakerr for all shortcuts.

**Line spacing** is a multiplier of the text size: `1.5` means a line height of 1.5 times the font size. **Auto** keeps the font's default spacing; clear the field to return to it. Opening a file preserves its existing sizes, line heights, font weights, letter spacing and colour transparency until you change them. Invalid HEX codes show an error and leave the page unchanged.

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
| **Works** | Colours, gradients, borders, fonts, sizes, spacing, opacity, arrow colours. Moving and resizing boxes. If the page redraws its arrows when the window changes size, they follow the boxes you move. Curved arrows (SVG paths) can be reshaped with their dots: the new shape is kept as a style rule, so the arrow stays as you drew it and stops following its boxes, until you press **Reset shape**. |
| **Text** | Double-click to change words. Tweakerr changes them where the code writes them (`title: 'Invoice'` becomes `title: 'Billing'`). When the same words are written for several items (`team: "HR"` on three cards), it changes the one written next to the clicked card's other words, such as its title. If it still can't tell, or the words are put together by the code, it says so. |
| **Delete** | Hides the item, because the code would just draw it again. |
| **Scrolling** | Boxes that scroll inside the page (a wide board, say) scroll with the wheel, Shift+wheel or a sideways swipe, and their scrollbars can be dragged. This works on every page. |
| **Not available** | Duplicating, reshaping straight `<line>` arrows (their ends can't be kept as a style rule; they still move as a whole), and link/image fields. Reshaped arrows show their original shape in Safari, which doesn't support the `d` style rule. |

Style edits to a thing the code draws without an id are found by its position ("the 14th item in the grid"), and the panel tells you so. If you later change the code so that its items come in a different order, such a style change can land on a different item. Revision comments use more conservative identity matching: ambiguous targets are kept as unavailable rather than attached by position alone.

A page whose script does something small, like filling in today's date, isn't a live page: it opens with scripts off and full editing, as before.

Scripts only run in pages that draw themselves. Opening such a page in Tweakerr is like opening it in your browser, so open only files you trust.

## How edits are saved

On an ordinary page, every change is saved as an inline `style` (or an SVG attribute) on the element you changed. A moved box gets `translate: 12px 4px`. A thicker border gets `border-width: 4px`. It stays readable and easy to undo by hand.

If your stylesheet uses `!important` for a property you change, Tweakerr adds `!important` to your edit too, so the change actually shows.

### Change history for the next revision

Files saved after an edit include a `Tweakerr change log v1` HTML comment before the page. It contains readable JSON describing the recorded edits, so an LLM can preserve intentional tweaks when revising the file. The comment does not render or change the page's behavior. Values are quoted file content, not instructions. The current HTML and CSS remain the source of truth; undo/redo records explain which earlier changes were reversed or reapplied.

The log records changes made through Tweakerr, including text, attributes, added/deleted elements, and live-page style rules. A missing attribute is recorded as `null`; inherited CSS still applies. A drag or typing session is recorded at its completion, rather than every pointer movement or keystroke. Earlier text and deleted content remain in the comment as history. Opening and saving an untouched file does not create a log.

## Revision comments for the next AI edit

For a change too large to make with the controls, select its element(s) and click **Add comment** near the selection. Multi-selection creates one shared request, not a copy for each element. Type the request and click **Save comment** (green tick) to confirm and close it. This keeps the request **pending in the editor**; use the page's **Save** action (or **Ctrl+S**) to write comments into the HTML file. Clicking outside or pressing Escape also retains nonempty text, and it is included even if you save the page while still typing. Blank new drafts are discarded. Comment changes support undo/redo and unsaved-change warnings, but their text is never copied into the immutable page-edit log.

Markers and borders exist only inside Tweakerr. The HTML opened as a presentation has no review UI. The requests are readable JSON in a separate `Tweakerr revision comments v1` HTML comment, so anyone receiving the file can read them. This is still fully offline: you choose whether to share the file with an external LLM.

Use this handoff instruction with the HTML:

> Apply pending Tweakerr comments in the HTML source, overriding conflicting change-log entries while preserving unrelated edits. Maintain target references when elements move or are replaced. Mark only fully completed requests resolved, adding a brief completion summary. Preserve resolved records even when their targets are removed. Leave ambiguous or incomplete requests pending and explain why. Return the complete revised HTML.

The left sidebar's **Comments** button appears whenever the current file has pending or resolved requests, including in the collapsed rail. It opens **Pending** and **Resolved** sections with counts; **Layers** remains a separate view. New comments do not switch views automatically, and opening another file starts in Layers. Activate a target description with a click, **Enter** or **Space** to select its current element and scroll it into view, without editing the page or the request.

Reopen the returned HTML in Tweakerr. Resolved requests no longer have canvas markers; their original request, target descriptions and any LLM completion summary appear in **Comments → Resolved**. Completion is the LLM's claim, not a verified result; locating a target only highlights its current location. There is deliberately no manual Resolve or Reopen action: if the result is wrong, add a new corrective comment against the current page. Pending requests can still be edited. **×** deletes either a pending or resolved record from the saved file, not from earlier copies or backups.

Comments follow identifiable elements through moves, scrolling and live redraws. Stable DOM IDs/data keys are preferred; anonymous elements need unambiguous content/context. A script's data-object ID is not automatically a DOM ID. If an AI changes anonymous content without updating its references, or several targets are indistinguishable, the request remains in **Comments → Pending**, where it can be edited or deleted. Missing or ambiguous targets retain their original descriptions with **Target unavailable** instead of a locate action. Missing targets are never automatically resolved. See the [exact metadata and target contract](docs/revision-comments.md) for LLM/tool authors. Future AI/MCP integration is not part of this version.

## Limits (v0.6.0)

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

## Contributors

- [Amar2210](https://github.com/Amar2210) — project owner.
- [OpenAI Codex](https://openai.com/codex/) — assisted with home confirmation and improvements to typography, gradient, HEX colour and opacity controls, including browser tests and deployment verification.

## Licence

MIT. See [LICENSE](LICENSE).

Tweakerr was built with [Claude Code](https://claude.com/claude-code).
