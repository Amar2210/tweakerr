import { describe, expect, it } from 'vitest';
import { captureCommentTarget, matchCommentTarget } from '../../src/doc/comment-targets';
import { readRevisionComments, RevisionComments, writeRevisionComments, type RevisionComment } from '../../src/doc/comments';
import { History } from '../../src/doc/history';
import { readChangeLog, writeChangeLog } from '../../src/doc/changelog';

const source = '<!DOCTYPE html><html><head></head><body><div id="board"><button>Contractors</button><button>Employee data</button></div><!-- original --></body></html>\n';
const parse = (html = source) => new DOMParser().parseFromString(html, 'text/html');
function setup(html = source, imported: RevisionComment[] = []) {
  const doc = parse(html);
  const history = new History(doc);
  const comments = new RevisionComments(doc, history, imported);
  return { doc, history, comments };
}
function example(): RevisionComment {
  return { id: 'C1', status: 'pending', text: 'Move this box', targets: [captureCommentTarget(parse().querySelector('button')!, 'target-1')] };
}

describe('revision comment metadata', () => {
  it('round-trips readable structured requests without changing the page or duplicating blocks', () => {
    const comment = example();
    const saved = writeRevisionComments(source, [comment]);
    expect(readRevisionComments(saved)).toEqual({ source, comments: [comment] });
    expect(readRevisionComments(saved.replace(/\n/g, '\r\n'))).toEqual({ source: source.replace(/\n/g, '\r\n'), comments: [comment] });
    expect(writeRevisionComments(saved, [comment])).toBe(saved);
    expect(writeRevisionComments(saved, [])).toBe(source);
    expect(writeRevisionComments(source, [])).toBe(source);
    expect(parse(saved).documentElement.outerHTML).toBe(parse(source).documentElement.outerHTML);
    expect(parse(saved).compatMode).toBe('CSS1Compat');
  });

  it('escapes HTML-comment termination, nested markup and unsafe request/summary text', () => {
    const comment = example();
    comment.text = '--> <script>window.pwned = true</script><!-- --!> <img src=x onerror=alert(1)>';
    comment.resolution = '<svg onload=alert(1)> & " --';
    const saved = writeRevisionComments(source, [comment]);
    expect(readRevisionComments(saved).comments).toEqual([comment]);
    expect(parse(saved).querySelector('script, img, svg')).toBeNull();
    expect(saved).toContain('\\u003cscript>');
    expect(saved.match(/-->/g)).toHaveLength(2); // managed block + original page comment
  });

  it('keeps unrelated, malformed, unknown-version and invalid records as file content', () => {
    const valid = example();
    const bodies = [
      'not JSON', 'null', JSON.stringify({ version: 2, comments: [valid] }),
      JSON.stringify({ version: 1, comments: [null] }),
      JSON.stringify({ version: 1, comments: [{ ...valid, status: 'deleted' }] }),
      JSON.stringify({ version: 1, comments: [{ ...valid, targets: [] }] }),
      JSON.stringify({ version: 1, comments: [valid, valid] }),
      JSON.stringify({ version: 1, comments: [{ ...valid, targets: [valid.targets[0], valid.targets[0]] }] }),
      JSON.stringify({ version: 1, comments: [{ ...valid, targets: [{ ...valid.targets[0], identity: { attribute: 'onclick', value: 'bad' } }] }] }),
    ];
    for (const body of bodies) {
      const html = `<!-- Tweakerr revision comments v1\n${body}\n-->\n${source}`;
      expect(readRevisionComments(html)).toEqual({ source: html, comments: [] });
      expect(writeRevisionComments(html, [])).toBe(html);
    }
    const unrelated = `<!-- user's own note -->\n${source}`;
    expect(readRevisionComments(unrelated)).toEqual({ source: unrelated, comments: [] });
  });

  it('retains resolved requests and summaries independently of target existence', () => {
    const comment = { ...example(), status: 'resolved' as const, resolution: 'Removed the requested box.' };
    const html = writeRevisionComments('<!DOCTYPE html><html><body>Replacement</body></html>', [comment]);
    const read = readRevisionComments(html);
    const { comments } = setup(read.source, read.comments);
    expect(comments.all[0]).toEqual(comment);
    expect(comments.targets(comments.all[0])).toEqual([null]);
    expect(comments.export()).toEqual([comment]);
  });
});

describe('revision comment state and undo', () => {
  it('uses one record for multiple targets and never injects anchors/UI into the page', () => {
    const { doc, comments, history } = setup();
    const before = doc.documentElement.outerHTML;
    const note = comments.add('Merge these', [...doc.querySelectorAll('button')])!;
    expect(note.id).toBe('C1');
    expect(note.targets).toHaveLength(2);
    expect(comments.targets(note)).toEqual([...doc.querySelectorAll('button')]);
    expect(doc.documentElement.outerHTML).toBe(before);
    expect(history.changes).toEqual([]);
    expect(history.dirty).toBe(true);
  });

  it('discards empty new drafts without making history dirty', () => {
    const { doc, comments, history } = setup();
    expect(comments.add(' \n ', [doc.querySelector('button')!])).toBeNull();
    expect(comments.add('Request', [])).toBeNull();
    expect(history.canUndo()).toBe(false);
    expect(history.dirty).toBe(false);
    expect(comments.export()).toEqual([]);
  });

  it('coalesces a typing session; save and refocus boundaries start separate undo entries', () => {
    const { doc, comments, history } = setup();
    const note = comments.add('M', [doc.querySelector('button')!], 'typing-1')!;
    comments.update(note.id, 'Move this box', 'typing-1');
    expect(history.peekUndo()?.label).toBe('Add comment');
    history.undo();
    expect(comments.all).toEqual([]);
    expect(history.dirty).toBe(false);
    history.redo();
    expect(comments.get(note.id)?.text).toBe('Move this box');
    history.markSaved();
    comments.update(note.id, 'Move to the left', 'typing-1');
    history.undo();
    expect(comments.get(note.id)?.text).toBe('Move this box');
    expect(history.dirty).toBe(false);
    history.redo();
    comments.update(note.id, 'Keep the label', 'typing-2');
    history.undo();
    expect(comments.get(note.id)?.text).toBe('Move to the left');
    expect(history.changes).toEqual([]);
  });

  it('keeps comment undo/redo in sequence with page edits, but never in the immutable journal', () => {
    const { doc, comments, history } = setup();
    const el = doc.querySelector('button')!;
    const note = comments.add('SECRET-NOTE-BODY', [el])!;
    history.transact('Change colour', () => el.setAttribute('style', 'color: red'));
    comments.delete(note.id);
    const saved = writeChangeLog(writeRevisionComments(source, comments.export()), history.changes);
    expect(saved).not.toContain('SECRET-NOTE-BODY');
    expect(saved).not.toContain('Tweakerr revision comments');
    expect(readChangeLog(saved).records).toHaveLength(1);
    history.undo();
    expect(comments.get(note.id)?.text).toBe('SECRET-NOTE-BODY');
    history.undo();
    expect(el.hasAttribute('style')).toBe(false);
    history.undo();
    expect(comments.all).toEqual([]);
    history.redo(); history.redo(); history.redo();
    expect(comments.all).toEqual([]);
    expect(JSON.stringify(history.changes)).not.toContain('SECRET-NOTE-BODY');
    expect(history.changes.map((change) => change.action)).toEqual(['edit', 'undo', 'redo']);
  });

  it('does not expose manual resolution/reopening and does not edit resolved requests', () => {
    const resolved = { ...example(), status: 'resolved' as const, resolution: 'Done' };
    const { comments, history } = setup(source, [resolved]);
    comments.update(resolved.id, 'This should not overwrite historical text');
    expect(comments.all).toEqual([resolved]);
    expect(history.canUndo()).toBe(false);
    comments.delete(resolved.id);
    expect(comments.export()).toEqual([]);
    history.undo();
    expect(comments.all).toEqual([resolved]);
  });

  it('looks up current targets without changing resolved metadata, binding caches or history', () => {
    const original = parse('<button id="stable">Original wording</button><div id="board"><p>Anonymous wording</p></div>');
    const targets = [original.querySelector('button')!, original.querySelector('p')!].map((el, index) => captureCommentTarget(el, `read-only-${index}`));
    const note: RevisionComment = { id: 'C1', status: 'resolved', text: 'Historical request', targets };
    const { doc, comments, history } = setup('<button id="stable">Changed by the LLM</button><div id="board"><p>Anonymous wording</p></div>', [note]);
    const before = writeRevisionComments(source, comments.export());
    for (const target of comments.all[0].targets) expect(comments.findTarget(target)).not.toBeNull();
    // A lookup must not capture a new position/fingerprint for later exports.
    doc.body.append(doc.querySelector('p')!);
    expect(comments.findTarget(targets[1])).toBe(doc.querySelector('p'));
    expect(writeRevisionComments(source, comments.export())).toBe(before);
    expect(comments.export()).toEqual([note]);
    expect(history.dirty).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(history.changes).toEqual([]);
    // No read-only binding was retained: replacing it with ambiguous twins is unavailable.
    doc.querySelector('p')!.outerHTML = '<p>Anonymous wording</p><p>Anonymous wording</p>';
    expect(comments.findTarget(targets[1])).toBeNull();
    expect(comments.export()).toEqual([note]);
  });

  it('rejects sidecar mutations inside an unfinished page transaction without changing state', () => {
    const { doc, comments, history } = setup();
    history.begin('Page edit');
    expect(() => comments.add('Request', [doc.querySelector('button')!])).toThrow(/Finish the page edit/);
    history.end();
    expect(comments.all).toEqual([]);
  });
});

describe('comment target identity', () => {
  it('follows stable IDs and data keys across movement, text changes and replacement tags', () => {
    const doc = parse('<div id="before"><p data-key="a weird \\ &quot; key">Original</p></div><div id="after"></div>');
    const el = doc.querySelector('p')!;
    const target = captureCommentTarget(el, 't1');
    doc.querySelector('#after')!.append(el);
    el.textContent = 'Changed';
    expect(matchCommentTarget(doc, target)).toBe(el);
    expect(target.identity?.attribute).toBe('data-key');
    const replacement = doc.createElement('section');
    replacement.setAttribute('data-key', el.getAttribute('data-key')!);
    el.replaceWith(replacement);
    expect(matchCommentTarget(doc, target)).toBe(replacement);
  });

  it('does not let a positional path attach a reordered anonymous note to its neighbour', () => {
    const doc = parse();
    const el = doc.querySelector('button')!;
    const target = captureCommentTarget(el, 't1');
    doc.querySelector('#board')!.append(el);
    expect(doc.querySelector(target.selector)).not.toBe(el);
    expect(matchCommentTarget(doc, target)).toBe(el);
    el.textContent = 'Entirely changed by external revision';
    expect(matchCommentTarget(doc, target)).toBeNull();
  });

  it('uses a stable ancestor to distinguish duplicated labels without guessing by order', () => {
    const doc = parse('<div id="left"><button>Same</button></div><div id="right"><button>Same</button></div>');
    const el = doc.querySelector('#left button')!;
    const target = captureCommentTarget(el, 't1');
    expect(target.unique).toBe(false);
    expect(target.scopeUnique).toBe(true);
    expect(matchCommentTarget(doc, target)).toBe(el);
    el.remove();
    expect(matchCommentTarget(doc, target)).toBeNull();
  });

  it('does not rebind an indistinguishable removed item to its surviving twin', () => {
    const doc = parse('<div id="board"><button>Same</button><button>Same</button></div>');
    const el = doc.querySelector('button')!;
    const target = captureCommentTarget(el, 't1');
    expect(target.unique).toBe(false);
    expect(target.scopeUnique).toBe(false);
    el.remove();
    expect(matchCommentTarget(doc, target)).toBeNull();
  });

  it('retains original descriptions while refreshing the references of known live elements', () => {
    const { doc, comments } = setup();
    const el = doc.querySelector('button')!;
    const note = comments.add('Move', [el])!;
    const label = note.targets[0].label;
    el.textContent = 'Renamed in Tweakerr';
    doc.querySelector('#board')!.append(el);
    const exported = comments.export();
    expect(exported[0].targets[0].label).toBe(label);
    expect(exported[0].targets[0].fingerprint.text).toBe('Renamed in Tweakerr');
    const reopened = new RevisionComments(parse(doc.documentElement.outerHTML), new History(doc), exported);
    expect(reopened.targets(reopened.all[0])[0]?.textContent).toBe('Renamed in Tweakerr');
  });

  it('follows generated no-ID elements through a redraw and retains a missing pending request', () => {
    const { doc, comments } = setup();
    const note = comments.add('Move', [doc.querySelector('button')!])!;
    const old = doc.querySelector('button');
    doc.querySelector('#board')!.innerHTML = '<button>Employee data</button><button>Contractors</button>';
    const target = comments.targets(note)[0];
    expect(target).not.toBe(old);
    expect(target?.textContent).toBe('Contractors');
    target?.remove();
    expect(comments.targets(note)).toEqual([null]);
    expect(comments.export()[0].status).toBe('pending');
  });

  it('keeps a missing explicit identity unavailable rather than choosing anonymous lookalike content', () => {
    const doc = parse('<button id="original">Approve</button>');
    const target = captureCommentTarget(doc.querySelector('button')!, 't1');
    doc.body.innerHTML = '<button>Approve</button>';
    expect(matchCommentTarget(doc, target)).toBeNull();
  });

  it('round-trips valid custom-element names with non-ASCII characters', () => {
    const { doc, comments } = setup('<team-😀>Team</team-😀>');
    const note = comments.add('Restyle this team', [doc.body.firstElementChild!])!;
    const saved = readRevisionComments(writeRevisionComments(doc.documentElement.outerHTML, comments.export()));
    expect(saved.comments[0].targets[0].fingerprint.tag).toBe('team-😀');
    expect(saved.comments[0].id).toBe(note.id);
    expect(matchCommentTarget(parse(saved.source), saved.comments[0].targets[0])?.localName).toBe('team-😀');
  });

  it('does not treat duplicated imported IDs as authoritative', () => {
    const doc = parse('<div id="item">One</div>');
    const target = captureCommentTarget(doc.querySelector('div')!, 't1');
    doc.body.insertAdjacentHTML('beforeend', '<div id="item">Other</div>');
    expect(matchCommentTarget(doc, target)).toBeNull();
  });
});
