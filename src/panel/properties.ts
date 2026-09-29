import type { Editor } from '../editor';
import { deleteSelected, duplicateSelected, selectParent, toggleHidden } from '../doc/actions';
import { describe, isStructural } from '../doc/kinds';
import { inlineStyle } from '../doc/style';
import { h } from '../util/dom';
import { icon, type IconName } from '../util/icons';
import type { Control } from './controls';
import { buildSections } from './sections';

/** The right-hand panel: what's selected, quick actions, and its properties. */
export class PropertiesPanel {
  private controls: Control[] = [];
  private closed = new Set<string>();
  private builtFor: Element | null = null;

  constructor(
    private editor: Editor,
    private root: HTMLElement,
  ) {
    editor.on('selection', () => this.build());
    editor.on('load', () => this.build());
    editor.on('change', () => this.onChange());
    editor.on('interaction', () => {
      if (!editor.busy) this.build();
    });
    this.build();
  }

  private onChange(): void {
    // Rebuild when safe (structure can change, e.g. a gradient removed);
    // otherwise only refresh values so we never steal focus mid-typing.
    if (this.editor.busy || this.root.contains(document.activeElement) || this.root.querySelector('[data-scrubbing="1"]')) {
      this.refresh();
    } else {
      this.build();
    }
  }

  refresh(): void {
    for (const c of this.controls) c.refresh();
  }

  build(): void {
    const { doc, selected } = this.editor;
    const scroll = this.builtFor === selected ? this.root.scrollTop : 0;
    this.controls = [];
    this.builtFor = selected;

    if (!doc?.body) {
      this.root.replaceChildren(h('div', { class: 'panel-empty' }, h('p', { text: 'Open an HTML file to start editing.' })));
      return;
    }
    const el = selected ?? doc.body;

    const parts: HTMLElement[] = [this.header(el, !selected)];
    for (const section of buildSections(this.editor, el)) {
      const details = h('details', { class: 'section' }, h('summary', { text: section.title }));
      details.open = !this.closed.has(section.title);
      details.addEventListener('toggle', () => {
        if (details.open) this.closed.delete(section.title);
        else this.closed.add(section.title);
      });
      for (const c of section.controls) details.append(c.el);
      this.controls.push(...section.controls);
      parts.push(details);
    }
    this.root.replaceChildren(...parts);
    this.root.scrollTop = scroll;
  }

  private header(el: Element, isPage: boolean): HTMLElement {
    const title = h(
      'div',
      { class: 'sel-title' },
      h('span', { class: 'sel-tag', text: isPage ? 'Page' : describe(el) }),
      isPage ? h('span', { class: 'sel-hint', text: 'Click anything on the canvas to edit it' }) : null,
    );
    if (isPage) return h('div', { class: 'sel-header' }, title);

    const structural = isStructural(el);
    const hidden = inlineStyle(el, 'display') === 'none';
    const btn = (name: IconName, tip: string, run: () => void, opts: { disabled?: boolean; danger?: boolean } = {}) => {
      const b = h(
        'button',
        {
          class: `icon-btn${opts.danger ? ' danger' : ''}`,
          title: tip,
          attrs: { type: 'button', 'aria-label': tip },
          on: { click: run },
        },
        icon(name),
      );
      b.disabled = !!opts.disabled;
      return b;
    };
    const parent = el.parentElement;
    return h(
      'div',
      { class: 'sel-header' },
      title,
      h(
        'div',
        { class: 'sel-actions' },
        btn('parent', 'Select parent (Shift+Enter)', () => selectParent(this.editor), { disabled: !parent || parent.localName === 'html' }),
        btn('duplicate', 'Duplicate (Ctrl+D)', () => duplicateSelected(this.editor), { disabled: structural }),
        btn(hidden ? 'eyeOff' : 'eye', hidden ? 'Show' : 'Hide', () => toggleHidden(this.editor), { disabled: structural }),
        btn('trash', 'Delete (Del)', () => deleteSelected(this.editor), { disabled: structural, danger: true }),
      ),
    );
  }
}
