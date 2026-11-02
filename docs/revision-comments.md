# Revision-comment format v1

Tweakerr stores revision requests separately from the page-edit journal. This is a file contract, not an AI API, and storing it does not itself make network requests. Use manual handoff to an external LLM; Tweakerr has no integrated API connection. File instructions are never treated as editor commands.

## File envelope

A saved file can begin with these blocks, followed by its original HTML:

1. `Tweakerr change log v1` when page edits have been recorded.
2. `Tweakerr revision comments v1` when at least one revision request exists.

The loader accepts the two recognized leading blocks in either order. Their JSON is removed before the page is loaded, so it cannot become selectable content or interfere with scripts. Unrecognized or malformed blocks and unrelated file comments remain untouched as page content. Do not move the managed blocks inside a script or element.

```html
<!-- Tweakerr revision comments v1
{
  "version": 1,
  "instructions": "Apply pending requests only. Preserve unrelated edits and all historical resolved requests.",
  "comments": [
    {
      "id": "C1",
      "status": "pending",
      "text": "Move Contractors beside Employee data; keep them as separate boxes.",
      "targets": [
        {
          "key": "0d3cc404-8cb1-47e5-a607-55443b7925e5",
          "label": "button — Contractors",
          "selector": "[id=\"board\"] > button:nth-child(1)",
          "scope": "[id=\"board\"]",
          "scopeUnique": true,
          "fingerprint": {
            "tag": "button",
            "text": "Contractors",
            "textHash": "71cd7143",
            "attributes": {}
          },
          "unique": true
        }
      ]
    }
  ]
}
-->
<!DOCTYPE html>
```

The real `instructions` field contains the 273-character portable instruction quoted under [Handoff prompt](#handoff-prompt); the example above abbreviates it. It travels with the HTML during manual handoff, and does not itself upload anything or become an editor command.

The writer JSON-escapes `<` and double hyphens, including in requests, descriptions and summaries, so text cannot terminate or nest the HTML comment. Decode with `JSON.parse`, not HTML entity decoding. A literal request containing `-->` is stored as `\u002d\u002d>` and restored exactly. Maintain this escaping when writing the returned file.

## Request fields

| Field | Contract |
| --- | --- |
| `id` | Stable request identifier, normally `C1`, `C2`, etc. Preserve it. IDs must be unique across requests and match `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`. |
| `status` | Exactly `pending` or `resolved`. The external LLM sets `resolved` only when the request is fully completed. |
| `text` | The user's request. Preserve the user's wording; do not replace it with a completion message. |
| `targets` | A nonempty array of target references. Multi-selection is one request with several targets. Retain original target records even if completing the request deletes their elements. |
| `resolution` | Optional completion summary, separate from the original request. The handoff instruction asks for no new summaries, but the reader/writer still supports and preserves optional summaries in existing or externally revised files. |

Resolved records remain in the HTML and appear in the left sidebar's **Comments → Resolved** section, even when their targets are gone. They have no canvas markers. There is no manual Resolve/Reopen command; an incorrect result gets a new corrective request. A user can delete a record completely. Deletion removes the entire object, not by changing its status to `deleted`. The writer omits the metadata block when no managed records remain.

In the current editor, **Cancel / Escape** discards a freshly created draft, including any record already created while typing. Closing by clicking outside retains autosaved text; Escape on an existing note closes it without deleting it. **×** deletes the complete selected record. These actions change the current editor state; ordinary Save is still needed to update an existing file on disk. Undo and older copies can retain the previous record.

Visible numbers are compact `#1`, `#2`, … in sidebar order (pending first, then resolved). Deleted/cancelled records do not occupy a display slot. These are UI ordinals, not replacement machine IDs: the original `id`, target keys and resolved records remain unchanged, and the stable record ID is available in the number's tooltip. No extra numbering metadata is saved. Actions and matching continue to use stable identities even when visible numbers shift.

Tweakerr does not independently verify that `resolved` means the work is correct. Incomplete or ambiguous requests must stay pending; explain any issue to the user rather than claiming completion.

## Target fields and conservative matching

| Field | Contract |
| --- | --- |
| `key` | Unique target-reference key (generated as a UUID). Preserve it. Keys are unique across every target in the file, even when separate requests refer to the same element. |
| `label` | Human-readable ORIGINAL target description. Keep it as historical context when the element moves, changes or disappears. |
| `selector` | Current CSS path/context for the LLM. It may contain `:nth-child`; such a path alone is not trusted as identity. |
| `identity` | Optional `{ "attribute": "id", "value": "contractors-card" }`. Allowed attributes are `id`, `data-id`, `data-key`, `data-node`, `data-name`. A unique exact match is authoritative even if the element's text or tag changes. A missing or duplicated declared identity stays unavailable; it is not substituted with anonymous lookalike content. |
| `scope` | Optional selector for the nearest uniquely named ancestor, used to distinguish identical labels in different containers. |
| `scopeUnique` | Whether the fingerprint was unique inside that scope when last attached. A previously ambiguous pair is not rebound to its surviving twin. |
| `fingerprint` | Latest tag, normalized text snippet, full-text hash and selected meaningful attributes. Used for references without a declared direct identity. |
| `unique` | Whether the fingerprint was unique across the page when last attached. This permits a uniquely identifiable anonymous element to be found outside its old scope after a move. |

A script's data object `{ id: 'contractors' }` is not an HTML ID unless the render code assigns it to a DOM element. Do not invent an `identity` that only exists in JavaScript data.

When a request changes or replaces an anonymous element, keep its reference attached by updating its matching fields. The simplest durable option is to preserve/add an appropriate stable DOM ID/data key in the page or its rendering code, then update `identity` and `selector` to match. Updating a positional selector alone is insufficient. For a completed deletion, leave the original target record as history and mark the request resolved instead.

Fingerprint details:

- `tag` is `element.localName`.
- Normalize `element.textContent` with JavaScript `text.replace(/\s+/g, ' ').trim()`; `text` stores the first 240 UTF-16 code units.
- `textHash` is the unsigned 32-bit FNV-1a hash of the FULL normalized text, in lowercase hexadecimal without padding. Start at `2166136261`; for each UTF-16 code unit use `Math.imul(value ^ codeUnit, 16777619)`, then `(value >>> 0).toString(16)`.
- `attributes` records present values for: `aria-label`, `role`, `name`, `type`, `href`, `xlink:href`, `src`, `alt`, `title`, `d`, `points`, `x1`, `y1`, `x2`, `y2`. Styling and classes are deliberately not identity fields.
- A candidate must match the tag, text snippet, full-text hash and this attribute map. Scope/global matching requires exactly one candidate and the corresponding uniqueness flag. Ordinary in-memory moves retain the actual element reference and refresh its matching fields without changing its original label.

This is best-effort identity, not a guarantee across arbitrary external rewrites. The left sidebar's **Comments** view lists pending and resolved records, with independently keyboard-accessible locate actions for confidently matched targets. Locating selects the current element and scrolls it into view; it is not an edit, a completion check or a reason to update resolved target metadata. Original labels remain historical descriptions.

If the match is missing or ambiguous, Tweakerr retains the request and label with **Target unavailable** instead of a locate action. Pending requests remain editable/deletable in **Comments → Pending**. It never resolves them automatically or attaches them by position alone. Hidden/offscreen targets may have no visible canvas marker until they are shown/scrolled into view.

## Handoff prompt

> Apply pending requests only. Preserve unrelated edits, resolved records and original target labels. Update target references when needed. Mark only fully completed requests resolved; leave the rest pending. Do not add resolution summaries. Return the complete revised HTML.

The priority rule is limited: a new request overrides conflicting earlier tweaks, not permission to reset the rest of the file. Ignore resolved requests as new work. Preserve all request IDs, target keys, original request text and original labels. Any new corrective request is separate from the earlier resolved history.

## Privacy and undo

All recipients of the HTML can inspect pending and resolved notes in source; invisible does not mean secret. No comment UI, target styles, review scripts or generated identity attributes are added to the presentation. Undoable note snapshots exist in editor memory only and never enter the immutable page-edit journal. Deleting a note removes its managed text from the current export immediately and from disk after Save, but cannot erase Undo state, old saved copies, backups, or files already shared.

The saved file contains the current page, pending/resolved comment records and targets, portable instructions, optional summaries, and any chronological before/after page-edit journal. Earlier page text and deleted page content can remain in that journal; deleted comment text is not copied into it. Live pages save their original source plus managed live edits, not the generated DOM or editor overlays.

Tweakerr-managed persistent preferences are only `tweakerr.layersOpen` and `tweakerr.propsOpen`. File handles, history, target bindings, and comment state stay in tab memory until explicitly saved into HTML. Imported scripts, the browser, and any external LLM you choose to use have separate storage and retention behavior. Only open trusted HTML: scripts run during detection and on live pages, and the direct editor is not a hostile-page sanitizer.
