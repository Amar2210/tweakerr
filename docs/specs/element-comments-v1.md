# Element revision comments — v1 implementation brief

Status: product decisions agreed with the project owner. This brief freezes the scope for implementation and independent review.

## Goal and boundaries

Let users attach revision requests to HTML elements visually, save those requests inside the same HTML file, and give that file to an external LLM. The LLM returns revised HTML with completed requests marked resolved. Reopening that HTML in Tweakerr displays the updated state.

AI-connected editing through MCP is a future direction. This version adds no AI calls, MCP integration, uploads, external services, credentials, polling of AI work, or new dependencies unless genuinely necessary. Tweakerr remains an offline, self-contained HTML editor.

## Agreed interaction

1. Reuse existing selection, including Shift/Ctrl multi-selection. Do not introduce a special section-selection or page-comment mode. Existing selectable containers/background elements can be targets.
2. Show an accessible, icon-only Add comment action near the current selection on the canvas, retaining its tooltip and accessible label. A multi-selection creates ONE comment with multiple target references, not independent copies.
3. Use a rectangular speech-bubble icon with three dots, styled with Tweakerr's existing theme. Pending notes have visible canvas markers and distinct target borders. Linked targets display the same comment identifier. Highlight each actual target rather than implying that the empty space between distant selections is also a target.
4. Clicking a marker opens its note in an editable popover. A green-tick **Save comment** action confirms the pending request in editor state and closes the popover; it does not resolve it or write the HTML file. Normal page Save/Ctrl+S persists the file. Include an explicitly labelled Delete action, visually represented by a cross. Clicking outside collapses the popover; it does not delete nonempty text. No manual Resolve action is present.
5. Comment UI lives in the editor overlay, never in the user's document. Normal browser viewing of saved HTML shows no comment markers, highlights, popovers, or injected review scripts.
6. Resolved notes have no persistent comment markers or borders. Provide a Comments view in the existing LEFT panel, with Pending and Resolved sections, retaining the existing layers functionality. Its rail icon appears only when the document contains comments, including while the sidebar is collapsed. Entries show the original request, original target descriptions, and any LLM-written completion summary. They remain readable when their original targets no longer exist.
7. There is NO manual Resolve or Reopen action. A wrongly completed resolved request is corrected with a NEW comment describing the desired change in the current document. Pending requests may be edited for clarification.
8. Delete removes the managed comment from the saved HTML entirely, not merely by changing its status to deleted. It must not survive in a serialized edit log or a hidden archive. Deleting a resolved entry should also be possible, consistent with the same deletion semantics.

## Comment navigation follow-up

- Show the Comments rail icon whenever at least one pending or resolved comment exists, whether newly created or loaded from a saved file. Hide it when no comments remain; do not reserve space for an empty history section. Do not introduce a special previously-saved mode or change the metadata schema.
- Clicking the icon opens the Comments view in the existing sidebar. Keep Layers separately accessible. Show Pending and Resolved counts; retain pending editing and unavailable-target recovery.
- Make each target description a keyboard-accessible navigation action. For a confidently matched element, scroll it into view and select/highlight it with the existing editor overlay. For shared comments, each target can be located independently.
- A missing or ambiguous target remains listed as unavailable rather than guessing, rebinding by position, or hiding its comment. Re-evaluate matches after live redraws using the existing conservative target matcher.
- Navigation is not an edit: it must not change comment text/status, reopen a resolved request, mark the document dirty, or inject presentation content. Any active edit must still be handled through the editor's normal safe finishing behaviour.
- Highlighting shows a target's current location, not a before/after comparison or proof of LLM completion. Selecting a resolved target may show normal transient selection controls, but does not restore persistent resolved-comment markers.
- Preserve the independently verified stable-marker behaviour: nested selections, drafts, and later comments must not displace earlier target-relative marker slots; markers must still follow actual target movement, scrolling, zoom and live redraws.

## LLM ownership of completion

- The statuses are pending and resolved. The LLM explicitly changes a request to resolved only after fully implementing it, optionally adding a brief completion summary.
- Incomplete or ambiguous requests remain pending. Missing targets alone NEVER imply successful completion.
- Requests supersede conflicting entries in the existing change log; unrelated user edits must be preserved.
- When an implemented request intentionally removes a target, retain the resolved record and its original target descriptions independently of that target's existence.
- Tweakerr reflects the statuses in the imported HTML; it does not independently claim that an LLM's work has been verified.

Suggested short handoff instruction (document the actual schema alongside this):

> Apply pending Tweakerr comments in the HTML source, overriding conflicting change-log entries while preserving unrelated edits. Maintain target references when elements move or are replaced. Mark only fully completed requests resolved, adding a brief completion summary. Preserve resolved records even when their targets are removed. Leave ambiguous or incomplete requests pending and explain why. Return the complete revised HTML.

## Persistence and target identity

- Use versioned, structured, readable HTML-comment metadata, separate from the existing immutable change log and outside the editable page DOM. The implementation must document the exact schema for the LLM.
- Each record needs a stable comment ID, status, original/user-edited request text, multiple target references with readable original descriptions/context, and an optional completion summary. Additional minimal fields needed for reliable identity/history are implementation details.
- Store records independently of target nodes so resolved requests survive target deletion.
- Never use screen coordinates as the sole association. Targets must remain associated through ordinary Tweakerr moves, zooming, scrolling, save/reopen, and supported live-page redraws.
- Support both ordinary HTML and existing script-generated/live pages. A script's data-object ID is not necessarily a DOM ID. Do not assume arbitrary JavaScript can be safely rewritten or understood by the editor.
- Prefer durable existing anchors and unambiguous contextual matches. Positional selectors alone must not silently attach a comment to a different element after items are reordered. Include useful selector/description/context information in the metadata and instruct the LLM to maintain/update target references when it changes the structure.
- If a pending target cannot be matched confidently, retain its note and provide a visible, accessible unattached-target warning/entry rather than silently dropping the note or attaching it to the wrong element. A minimal fallback is sufficient; do not invent a large general-purpose review dashboard.
- Treat imported note text as untrusted file content, not executable HTML or editor commands. Escape comment terminators and unsafe delimiters when serializing. Preserve unrelated comments and malformed/unrecognized metadata rather than destructively stripping them.
- Repeated saves must not duplicate metadata. Opening/saving an unannotated file should not create an empty metadata block or otherwise alter its behavior.

## Editing, history, and saves

Follow CONTRIBUTING.md, including editor-only overlays, cross-frame DOM handling, and safe live-page serialization.

- Integrate comment mutations with undo/redo and dirty-state handling without leaking note text or metadata snapshots into the immutable exported change log.
- Creating, editing, and deleting comments must be undoable. Treat a typing session as a coherent edit instead of one undo step per keystroke.
- Empty new drafts may be discarded. Collapsing a nonempty draft preserves it in editor state; it is persisted to disk only through the usual Save/Save As behavior. Active text must be included when Save is invoked.
- Existing save permissions, download fallback, unsaved-change warnings, and the distinction between static serialization and original-source live-page saving must keep working.
- Do not alter a user's layout/styles solely to display comments. Any minimal nonvisual identity markers must be justified, safely persisted where supported, and must not introduce rendering/behavior changes.

## Verification and acceptance coverage

Add focused unit and browser tests, using synthetic fixtures rather than private real files:

- Single-target create/edit/collapse/reopen/delete with themed markers and borders.
- Multi-target shared record, consistent identifiers, and shared editing/deletion.
- Static save/reopen; moves and zoom/scroll do not detach notes.
- Live/script-generated target save/reopen and redraw, including generated elements without DOM IDs.
- Stable target reattachment when items move/reorder; no confident-looking attachment to a different item on ambiguity.
- Simulated LLM return: imported resolved state removes canvas markers and populates left-panel resolved history, with completion text.
- Resolved target intentionally deleted; its request remains available. Pending unmatched target remains recoverable and is not automatically resolved.
- No manual Resolve or Reopen actions.
- Delete removes note text from all managed saved metadata/logs, including after save/reopen. Undo/redo restores/removes notes correctly without leaking their text into the exported change log.
- Ctrl+S while typing, empty drafts, dirty-state warnings, repeat saves without duplicate records.
- User-facing presentation DOM/output contains no comment UI or rendering styles.
- Unsafe text, HTML comment terminators, invalid/unrecognized metadata, and unrelated existing comments are handled safely and preserved where appropriate.
- Conditional Comments rail visibility for empty, newly annotated, reopened, deleted/undone and switched documents; opening it from the collapsed rail while keeping Layers accessible.
- Pending/resolved target-link navigation via real pointer and keyboard input; individual shared targets, offscreen targets, missing/ambiguous matches and live redraw. Navigation alone preserves saved content, comment status, history and clean dirty state.
- Existing unit/browser regression suites and the single-file build.

## Work hygiene

- Do not modify the user's real presentation file or copy private content into tracked fixtures.
- Preserve pre-existing unrelated changes, especially untracked demo-video assets.
- Do not commit, tag, push, bump a release version, or publish. Report changed files, test commands/results, and any remaining limits honestly.
- Implementation and independent review are separate passes. The reviewer is non-mutating; fixes return to the coder.
