import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { History } from '../../src/doc/history';
import { LiveEdits } from '../../src/doc/live';

const source = `<!DOCTYPE html><html><head></head><body><div id="scroller"><div id="board"></div></div><script>
const cards = [{ title: 'Invoice', team: 'Finance' }, { title: 'Cash', team: 'Finance' }];
</script></body></html>`;
const cards = '<article id="invoice"><h2>Invoice</h2><div class="team"><i></i>Finance</div></article><article id="cash"><h2>Cash</h2><div class="team"><i></i>Finance</div></article>';
let live: LiveEdits;
const teams = () => [...document.querySelectorAll('.team')].map((el) => el.textContent);
const render = () => { document.querySelector('#board')!.innerHTML = cards; };

// jsdom has no CSS.escape; these synthetic selectors use only plain identifiers.
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="scroller"><div id="board"></div></div>';
  render();
  live = new LiveEdits(document, source);
});

describe('live text replay', () => {
  it('replays only on the edited sibling, including replacement DOM nodes', () => {
    const el = document.querySelector('#cash .team')!;
    const match = live.checkText(el);
    expect(match).toEqual({ anchor: 'Cash' });
    live.recordText(el, 'Finance', 'Treasury', (match as { anchor: string }).anchor);
    live.reapplySwaps();
    expect(teams()).toEqual(['Finance', 'Treasury']);
    expect(live.save()).toBe(source.replace("title: 'Cash', team: 'Finance'", "title: 'Cash', team: 'Treasury'"));
    render();
    expect(document.querySelector('#cash .team')).not.toBe(el);
    live.reapplySwaps();
    expect(teams()).toEqual(['Finance', 'Treasury']);
  });

  it('does not fall back to another card when the recorded target is missing', () => {
    live.recordText(document.querySelector('#cash .team')!, 'Finance', 'Treasury', 'Cash');
    document.querySelector('#cash .team')!.remove();
    live.reapplySwaps();
    expect(teams()).toEqual(['Finance']);
  });

  it('keeps the target with undo/redo and coalesced text edits, without exporting runtime metadata', () => {
    const history = new History(document);
    const el = document.querySelector('#cash .team')!;
    history.transact('Edit text', () => {
      live.recordText(el, 'Finance', 'Treasury', 'Cash');
      live.recordText(el, 'Treasury', 'Accounts', 'Cash');
    });
    history.undo();
    render();
    live.reapplySwaps();
    expect(teams()).toEqual(['Finance', 'Finance']);
    history.redo();
    live.reapplySwaps();
    expect(teams()).toEqual(['Finance', 'Accounts']);
    const saved = live.save();
    expect(saved).toBe(source.replace("title: 'Cash', team: 'Finance'", "title: 'Cash', team: 'Accounts'"));
    expect(saved).not.toContain('data-text-swaps');
  });

  it('replays legacy swaps only when their runtime text is unambiguous', () => {
    live.style.setAttribute('data-text-swaps', JSON.stringify([{ from: 'Finance', to: 'Treasury', anchor: 'Cash' }]));
    live.reapplySwaps();
    expect(teams()).toEqual(['Finance', 'Finance']);
    live.style.setAttribute('data-text-swaps', JSON.stringify([{ from: 'Invoice', to: 'Billing' }]));
    live.reapplySwaps();
    expect(document.querySelector('#invoice h2')!.textContent).toBe('Billing');
  });
});
