import type { Editor } from '../editor';
import { toggleHidden } from '../doc/actions';
import { describe, textSnippet } from '../doc/kinds';
import { computed } from '../doc/style';
import { h } from '../util/dom';
import { icon } from '../util/icons';

const SKIP = new Set(['script', 'style', 'template', 'noscript', 'link', 'meta', 'title', 'base']);
const MAX_CHILDREN = 400;

/** Left panel: the page as a tree. Handy for hidden, tiny or overlapped elements. */
export class LayersPanel {
  private expanded = new WeakSet<Element>();
  private rows = new Map<Element, HTMLElement>();
  private timer = 0;

  constructor(
    private editor: Editor,
    private root: HTMLElement,
  ) {
    editor.on('load', () => {
      this.expanded = new WeakSet();
      if (editor.doc?.body) this.expanded.add(editor.doc.body);
      this.render();
    });
    editor.on('selection', () => {
      this.revealSelection();
      this.render();
      const row = editor.selected && this.rows.get(editor.selected);
      row?.scrollIntoView({ block: 'nearest' });
    });
    editor.on('hover', () => this.markHover());
    editor.on('change', () => this.queue());
    editor.on('interaction', () => this.queue());
    this.render();
  }

  private queue(): void {
    if (this.editor.busy) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 120);
  }

  private revealSelection(): void {
    for (let p = this.editor.selected?.parentElement; p; p = p.parentElement) this.expanded.add(p);
  }

  render(): void {
    this.rows.clear();
    const body = this.editor.doc?.body;
    if (!body) {
      this.root.replaceChildren(h('div', { class: 'panel-empty' }, h('p', { text: 'Layers appear here.' })));
      return;
    }
    const scroll = this.root.scrollTop;
    const list = h('div', { class: 'layers', attrs: { role: 'tree' } });
    this.addRow(list, body, 0);
    this.root.replaceChildren(list);
    this.root.scrollTop = scroll;
    this.markHover();
  }

  private addRow(list: HTMLElement, el: Element, depth: number): void {
    const kids = Array.from(el.children).filter((c) => !SKIP.has(c.localName));
    const open = this.expanded.has(el);
    const hidden = computed(el, 'display') === 'none';
    const isBody = el.localName === 'body';

    const caret = h('button', {
      class: `layer-caret${kids.length ? '' : ' empty'}`,
      text: kids.length ? (open ? '▾' : '▸') : '',
      attrs: { type: 'button', tabindex: '-1', 'aria-label': open ? 'Collapse' : 'Expand' },
      on: {
        click: (e) => {
          e.stopPropagation();
          if (open) this.expanded.delete(el);
          else this.expanded.add(el);
          this.render();
        },
      },
    });

    const eye = isBody
      ? null
      : h('button', {
          class: `layer-eye${hidden ? ' off' : ''}`,
          title: hidden ? 'Show' : 'Hide',
          attrs: { type: 'button', tabindex: '-1', 'aria-label': hidden ? 'Show' : 'Hide' },
          on: {
            click: (e) => {
              e.stopPropagation();
              toggleHidden(this.editor, el);
            },
          },
        }, icon(hidden ? 'eyeOff' : 'eye'));

    const snippet = textSnippet(el);
    const row = h(
      'div',
      {
        class: `layer-row${this.editor.isSelected(el) ? ' selected' : ''}${hidden ? ' hidden-el' : ''}`,
        attrs: { role: 'treeitem' },
        on: {
          click: (e) => {
            if (!isBody && (e.shiftKey || e.ctrlKey || e.metaKey)) this.editor.toggle(el);
            else this.editor.select(isBody ? null : el);
          },
          pointerenter: () => this.editor.hover(el),
          pointerleave: () => this.editor.hover(null),
        },
      },
      caret,
      h('span', { class: 'layer-name', text: isBody ? 'Page' : describe(el) }),
      snippet ? h('span', { class: 'layer-text', text: snippet }) : null,
      eye,
    );
    row.style.paddingLeft = `${4 + depth * 12}px`;
    this.rows.set(el, row);
    list.append(row);

    if (!open) return;
    for (const k of kids.slice(0, MAX_CHILDREN)) this.addRow(list, k, depth + 1);
    if (kids.length > MAX_CHILDREN) {
      const more = h('div', { class: 'layer-more', text: `… ${kids.length - MAX_CHILDREN} more` });
      more.style.paddingLeft = `${22 + (depth + 1) * 12}px`;
      list.append(more);
    }
  }

  private markHover(): void {
    for (const [el, row] of this.rows) row.classList.toggle('hovered', el === this.editor.hovered);
  }
}
