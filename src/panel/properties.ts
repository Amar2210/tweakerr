import type { Editor } from '../editor';
import { deleteSelected, duplicateSelected, elementKey, selectParent, toggleHidden } from '../doc/actions';
import { describe, isStructural } from '../doc/kinds';
import { inlineStyle } from '../doc/style';
import { h, isTypingTarget } from '../util/dom';
import { icon, type IconName } from '../util/icons';
import type { Control } from './controls';
import { buildSections } from './sections';

/** The right-hand panel: what's selected, quick actions, and its properties. */
export class PropertiesPanel {
  private controls: Control[] = [];
  private closed = new Set<string>();
  /** Which selection the panel was built for, to keep the scroll position across rebuilds. */
  private builtFor = '';

  constructor(
    private editor: Editor,
    private root: HTMLElement,
  ) {
    editor.on('selection', () => this.build());
    editor.on('load', () => this.build());
    editor.on('change', () => this.onChange());
    editor.on('redraw', () => this.refresh());
    editor.on('interaction', () => {
      if (!editor.busy) this.build();
    });
    this.build();
  }

  private onChange(): void {
    // Rebuild when safe (structure can change, e.g. a gradient colour added);
    // while typing in a field or scrubbing, only refresh values so focus stays put.
    const typing = this.root.contains(document.activeElement) && isTypingTarget(document.activeElement);
    if (this.editor.busy || typing || this.root.querySelector('[data-scrubbing="1"]')) {
      this.refresh();
    } else {
      this.build();
    }
  }

  refresh(): void {
    for (const c of this.controls) c.refresh();
  }

  build(): void {
    const { doc, selected, selection } = this.editor;
    const built = selection.map(elementKey).join('+');
    const scroll = this.builtFor === built ? this.root.scrollTop : 0;
    this.controls = [];
    this.builtFor = built;

    if (!doc?.body) {
      this.root.replaceChildren(h('div', { class: 'panel-empty' }, h('p', { text: 'Open an HTML file to start editing.' })));
      return;
    }
    const els = selection.length ? selection : [doc.body];
    const el = selected ?? doc.body;

    const parts: HTMLElement[] = [this.header(el, !selected)];
    const live = this.editor.live;
    if (live && selected && !isStructural(selected) && this.editor.selection.some((e) => live.isFragile(e))) {
      parts.push(h('p', {
        class: 'live-note',
        text: "No name (id) to find this by, so Tweakerr finds it by its position. If the page's code changes the order of its items, this change could land on a different one.",
      }));
    }
    for (const section of buildSections(this.editor, els)) {
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

    const count = this.editor.selection.length;
    const structural = isStructural(el);
    const hidden = this.editor.selectionRoots.some((e) => inlineStyle(e, 'display') === 'none');
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
    if (count > 1) {
      title.replaceChildren(
        h('span', { class: 'sel-tag', text: `${count} selected` }),
        h('span', { class: 'sel-hint', text: 'Changes apply to all of them' }),
      );
    }
    return h(
      'div',
      { class: 'sel-header' },
      title,
      h(
        'div',
        { class: 'sel-actions' },
        count > 1 ? null : btn('parent', 'Select parent (Shift+Enter)', () => selectParent(this.editor), { disabled: !parent || parent.localName === 'html' }),
        btn('duplicate', this.editor.live ? "Can't duplicate on a page drawn by code" : 'Duplicate (Ctrl+D)', () => duplicateSelected(this.editor), { disabled: structural || !!this.editor.live }),
        btn(hidden ? 'eyeOff' : 'eye', hidden ? 'Show' : 'Hide', () => toggleHidden(this.editor), { disabled: structural }),
        btn('trash', this.editor.live ? 'Delete (Del) · hides it on a page drawn by code' : 'Delete (Del)', () => deleteSelected(this.editor), { disabled: structural, danger: true }),
      ),
    );
  }
}
