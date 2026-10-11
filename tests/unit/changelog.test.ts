import { describe, expect, it } from 'vitest';
import { readChangeLog, writeChangeLog, type ChangeRecord } from '../../src/doc/changelog';
import { History } from '../../src/doc/history';

describe('saved change log', () => {
  it('records immutable before/after values, coalesces a drag, and records undo/redo', () => {
    document.body.innerHTML = '<p id="title">Old text</p>';
    const el = document.querySelector('p')!;
    const history = new History(document.body);
    history.transact('Resize', () => {
      el.style.width = '10px';
      el.style.width = '20px';
    }, 'width');
    history.transact('Resize', () => { el.style.width = '30px'; }, 'width');
    expect(history.changes[0].changes).toEqual([{ target: 'p[id="title"]', property: '@style', before: null, after: 'width: 20px;' }]);
    history.undo();
    history.redo();
    expect(history.changes.map((entry) => entry.action)).toEqual(['edit', 'edit', 'undo', 'redo']);
    expect(history.changes[2].changes.map((change) => change.after)).toEqual(['width: 20px;', null]);
    expect(history.changes[0].changes[0].after).toBe('width: 20px;');
  });

  it('captures text, deleted and duplicated nodes without keeping mutable DOM references', () => {
    document.body.innerHTML = '<div id="card"><p>Hello</p></div>';
    const card = document.querySelector('#card')!;
    const p = card.firstElementChild!;
    const history = new History(document.body);
    history.transact('Edit text', () => { p.firstChild!.textContent = 'Updated'; });
    history.transact('Duplicate', () => { card.append(p.cloneNode(true)); });
    history.transact('Delete', () => p.remove());
    p.textContent = 'Later';
    expect(history.changes[0].changes[0]).toMatchObject({ property: 'text', before: 'Hello', after: 'Updated' });
    expect(history.changes[1].changes[0]).toMatchObject({ target: 'div[id="card"]', before: '', after: '<p>Updated</p>' });
    expect(history.changes[2].changes[0]).toMatchObject({ before: '<p>Updated</p>', after: '' });
  });

  it('round-trips unsafe comment text, preserves the page and never duplicates logs', () => {
    const source = '<!DOCTYPE html><html><head></head><body><!-- original --><p>Hi</p></body></html>\n';
    const records: ChangeRecord[] = [{ time: '2026-10-11T00:00:00.000Z', action: 'edit', label: 'Edit text', changes: [{ target: 'p', property: 'text', before: null, after: '--> <script>alert(1)</script><!-- &' }] }];
    const saved = writeChangeLog(source, records);
    const read = readChangeLog(saved);
    expect(read).toEqual({ source, records });
    expect(readChangeLog(saved.replace(/\n/g, '\r\n'))).toEqual({ source: source.replace(/\n/g, '\r\n'), records });
    expect(writeChangeLog(read.source, read.records)).toBe(saved);
    const parsed = new DOMParser().parseFromString(saved, 'text/html');
    expect(parsed.querySelector('script')).toBeNull();
    expect(parsed.body.innerHTML).toBe(new DOMParser().parseFromString(source, 'text/html').body.innerHTML);
    expect(parsed.compatMode).toBe('CSS1Compat');
    expect(writeChangeLog(source, [])).toBe(source);
  });

  it('preserves unknown or malformed log comments', () => {
    for (const value of ['not JSON', '{"version":1,"records":[null]}', '{"version":2,"records":[]}']) {
      const source = `<!-- Tweakerr change log v1\n${value}\n-->\n<html></html>`;
      expect(readChangeLog(source)).toEqual({ source, records: [] });
    }
  });
});
