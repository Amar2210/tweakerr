import { describe, it, expect, beforeEach } from 'vitest';
import { History } from '../../src/doc/history';

let root: HTMLElement;
let clock = 0;
const mk = () => new History(root, () => {}, () => clock);

beforeEach(() => {
  document.body.innerHTML = '<div id="root"><p id="a" style="color: red;">Hello <b>world</b></p><p id="b">Two</p></div>';
  root = document.getElementById('root')!;
  clock = 0;
});

describe('History', () => {
  it('undoes and redoes attribute changes', () => {
    const h = mk();
    const a = document.getElementById('a')!;
    h.transact('border', () => a.style.setProperty('border', '2px solid blue'));
    expect(a.style.border).toBe('2px solid blue');
    h.undo();
    expect(a.getAttribute('style')).toBe('color: red;');
    h.redo();
    expect(a.style.border).toBe('2px solid blue');
  });

  it('removes attributes that did not exist before', () => {
    const h = mk();
    const b = document.getElementById('b')!;
    h.transact('x', () => b.setAttribute('data-x', '1'));
    h.undo();
    expect(b.hasAttribute('data-x')).toBe(false);
  });

  it('undoes text edits, keeping node identity', () => {
    const h = mk();
    const bold = root.querySelector('b')!;
    const text = bold.firstChild as Text;
    h.transact('text', () => { text.data = 'there'; });
    h.undo();
    expect(bold.textContent).toBe('world');
    expect(bold.firstChild).toBe(text);
    h.redo();
    expect(bold.textContent).toBe('there');
  });

  it('restores deleted elements in place and re-deletes on redo', () => {
    const h = mk();
    const a = document.getElementById('a')!;
    h.transact('delete', () => a.remove());
    expect(root.children.length).toBe(1);
    h.undo();
    expect(root.firstElementChild).toBe(a);
    h.redo();
    expect(document.getElementById('a')).toBeNull();
  });

  it('handles duplicate then edit then undo all', () => {
    const h = mk();
    const a = document.getElementById('a')!;
    const before = root.innerHTML;
    let clone!: HTMLElement;
    h.transact('dup', () => { clone = a.cloneNode(true) as HTMLElement; clone.id = 'a2'; a.after(clone); });
    h.transact('style', () => clone.style.setProperty('opacity', '0.5'));
    h.transact('del', () => a.remove());
    h.undo(); h.undo(); h.undo();
    expect(root.innerHTML).toBe(before);
    h.redo(); h.redo(); h.redo();
    expect(root.querySelector('#a2')!.getAttribute('style')).toContain('opacity: 0.5');
    expect(root.querySelector('#a')).toBeNull();
  });

  it('merges edits with the same key inside the window', () => {
    const h = mk();
    const a = document.getElementById('a')!;
    for (let i = 1; i <= 5; i++) { clock += 100; h.transact('op', () => a.style.setProperty('opacity', String(i / 10)), 'opacity'); }
    clock += 5000;
    h.transact('op', () => a.style.setProperty('opacity', '0.9'), 'opacity');
    h.undo();
    expect(a.style.opacity).toBe('0.5');
    h.undo();
    expect(a.style.opacity).toBe('');
    expect(h.canUndo()).toBe(false);
  });

  it('records nothing for no-op transactions and nests begin/end', () => {
    const h = mk();
    h.transact('noop', () => {});
    expect(h.canUndo()).toBe(false);
    const a = document.getElementById('a')!;
    h.begin('outer');
    h.transact('inner', () => a.setAttribute('title', 't'));
    a.setAttribute('lang', 'en');
    h.end();
    h.undo();
    expect(a.hasAttribute('title')).toBe(false);
    expect(a.hasAttribute('lang')).toBe(false);
  });

  it('tracks dirty state against the saved point', () => {
    const h = mk();
    const a = document.getElementById('a')!;
    expect(h.dirty).toBe(false);
    h.transact('x', () => a.setAttribute('title', '1'));
    expect(h.dirty).toBe(true);
    h.markSaved();
    expect(h.dirty).toBe(false);
    h.undo();
    expect(h.dirty).toBe(true);
    h.redo();
    expect(h.dirty).toBe(false);
  });

  it('does not merge into the saved entry', () => {
    const h = mk();
    const a = document.getElementById('a')!;
    h.transact('o', () => a.style.setProperty('opacity', '0.2'), 'k');
    h.markSaved();
    clock += 10;
    h.transact('o', () => a.style.setProperty('opacity', '0.3'), 'k');
    expect(h.dirty).toBe(true);
  });
  it('keeps changes the browser delivered during a long transaction', async () => {
    const h = mk();
    const a = document.getElementById('a')!;
    const text = a.firstChild as Text;
    h.begin('Edit text');
    text.data = 'Hi ';
    await new Promise((r) => setTimeout(r)); // observer callback runs here
    text.data = 'Hi there ';
    h.end();
    expect(h.canUndo()).toBe(true);
    h.undo();
    expect(text.data).toBe('Hello ');
    h.redo();
    expect(text.data).toBe('Hi there ');
  });
});
