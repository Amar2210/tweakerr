/**
 * Turn the edited document back into an HTML file.
 *
 * The editor never writes its own UI into the page (selection boxes and
 * handles live in a separate overlay), so serialising the document as-is
 * yields the original file plus only the user's edits. Scripts are kept
 * exactly as they were: they never ran, so they never touched the DOM.
 */
export function serializeDocument(doc: Document, opts: { trailingNewline?: boolean } = {}): string {
  const before: string[] = [];
  let after = '';
  let html = '';
  for (const node of Array.from(doc.childNodes)) {
    if (node.nodeType === Node.DOCUMENT_TYPE_NODE) before.push(doctypeToString(node as DocumentType));
    else if (node.nodeType === Node.ELEMENT_NODE) html = (node as Element).outerHTML;
    // Nothing may separate a trailing comment from </html>: a parser puts
    // any whitespace there into <body>, so the file would drift per save.
    else if (node.nodeType === Node.COMMENT_NODE) {
      if (html) after += `<!--${(node as Comment).data}-->`;
      else before.push(`<!--${(node as Comment).data}-->`);
    }
  }

  // Line breaks after </body> and </html> in a file end up at the end of
  // <body> when parsed. Write them back after the closing tags, where they
  // came from; the parsed page is identical and the file doesn't gain a
  // blank line on every save.
  let tail = '';
  const m = after ? null : /(\s+)<\/body><\/html>$/.exec(html);
  if (m) {
    let ws = m[1];
    let mid = '';
    if (opts.trailingNewline && ws.endsWith('\n')) {
      ws = ws.slice(0, -1);
      tail = '\n';
    }
    if (ws.endsWith('\n')) {
      ws = ws.slice(0, -1);
      mid = '\n';
    }
    html = `${html.slice(0, m.index)}${ws}</body>${mid}</html>`;
  }
  return [...before, html].join('\n') + after + tail;
}

export function doctypeToString(dt: DocumentType): string {
  let s = `<!DOCTYPE ${dt.name}`;
  if (dt.publicId) s += ` PUBLIC "${dt.publicId}"`;
  if (dt.systemId) s += dt.publicId ? ` "${dt.systemId}"` : ` SYSTEM "${dt.systemId}"`;
  return s + '>';
}
