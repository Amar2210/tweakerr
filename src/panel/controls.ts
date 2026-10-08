import { formatColor, parseColor, resolveColor, toHex } from '../util/color';
import { quoteFamily } from '../doc/fonts';
import { h } from '../util/dom';
import { icon } from '../util/icons';

/**
 * Reusable property controls. Each reads its value through `get()` and
 * writes through `set()`; `refresh()` re-reads unless the user is busy
 * with it (focused or scrubbing), so live updates never fight typing.
 */
export interface Control {
  el: HTMLElement;
  refresh(): void;
}

export interface Binding<T> {
  get(): T;
  /** `final` is false while scrubbing/sliding, true on commit. */
  set(value: T, final: boolean): void;
}

function row(label: string | HTMLElement, ...body: HTMLElement[]): HTMLElement {
  const l = typeof label === 'string' ? h('label', { class: 'ctl-label', text: label }) : label;
  return h('div', { class: 'ctl-row' }, l, h('div', { class: 'ctl-body' }, ...body));
}

function busy(el: HTMLElement): boolean {
  return el.contains(document.activeElement) || el.dataset.scrubbing === '1';
}

// -------------------------------------------------------------- checkbox

let checkboxId = 0;

export function checkboxControl(label: string, bind: Binding<boolean>): Control {
  const id = `ctl-checkbox-${++checkboxId}`;
  const input = h('input', { class: 'ctl-checkbox', attrs: { type: 'checkbox', id } });
  const lab = h('label', { class: 'ctl-label', text: label, attrs: { for: id } });
  const wrap = row(lab, input);
  input.addEventListener('change', () => bind.set(input.checked, true));
  const refresh = () => { input.checked = bind.get(); };
  refresh();
  return { el: wrap, refresh };
}

// ---------------------------------------------------------------- number

export interface NumberOpts {
  /** Unit appended to bare numbers ('px' by default, '' for unitless). */
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Short label right next to the field instead of a row label (e.g. "W"). */
  inline?: boolean;
  /** Label tooltip, e.g. the full name of a short label. */
  title?: string;
  /** Where the arrows start when the field holds a word ("normal", "auto"). */
  start?: () => number;
  /** Use wide minus/plus buttons on either side of the value. */
  stepper?: 'arrows' | 'plus-minus';
}

/**
 * A number field with a scrubbable label: drag the label left/right to
 * change the value, or use the small up/down buttons or ↑/↓ (Shift = ×10;
 * hold a button to repeat). Accepts any CSS value ("auto", "2em", "50%"):
 * bare numbers get the default unit.
 */
export function numberControl(label: string, bind: Binding<string>, opts: NumberOpts = {}): Control {
  const unit = opts.unit ?? 'px';
  const step = opts.step ?? 1;
  const horizontal = opts.stepper === 'plus-minus';
  const input = h('input', { class: 'ctl-input ctl-number', attrs: { type: 'text', spellcheck: 'false', placeholder: opts.placeholder ?? '', 'aria-label': opts.title ?? label } });
  const lab = h('label', { class: 'ctl-label scrub', text: label, title: `${opts.title ? `${opts.title} · ` : ''}Drag to adjust` });

  const display = (v: string) => {
    if (!v) return '';
    const m = /^(-?[\d.]+)px$/.exec(v);
    if (m && unit === 'px') return String(round(parseFloat(m[1])));
    if (/^-?[\d.]+$/.test(v)) return String(round(parseFloat(v)));
    return v;
  };
  const normalize = (raw: string): string => {
    const t = raw.trim();
    if (t === '') return '';
    if (/^-?\d*\.?\d+$/.test(t)) return clampNum(parseFloat(t)) + unit;
    return t;
  };
  const clampNum = (n: number) => {
    if (opts.min !== undefined) n = Math.max(opts.min, n);
    if (opts.max !== undefined) n = Math.min(opts.max, n);
    return round(n);
  };
  const current = () => {
    if (horizontal && !/^-?\d*\.?\d+$/.test(input.value.trim())) {
      // Step from the rendered size after a CSS value such as 2em was entered.
      const resolved = parseFloat(bind.get());
      if (Number.isFinite(resolved)) return resolved;
    }
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : (opts.start?.() ?? 0);
  };

  const commit = () => bind.set(normalize(input.value), true);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      input.select();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
      input.value = String(clampNum(current() + d));
      bind.set(normalize(input.value), false);
    } else if (e.key === 'Escape') {
      input.value = display(bind.get());
      input.blur();
    }
  });
  input.addEventListener('change', commit);
  input.addEventListener('focus', () => input.select());

  // Scrub on the label.
  lab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    lab.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const start = current();
    wrap.dataset.scrubbing = '1';
    const onMove = (ev: PointerEvent) => {
      const d = Math.round((ev.clientX - startX) / 2) * step * (ev.shiftKey ? 10 : 1);
      input.value = String(clampNum(start + d));
      bind.set(normalize(input.value), false);
    };
    const onUp = () => {
      lab.removeEventListener('pointermove', onMove);
      lab.removeEventListener('pointerup', onUp);
      delete wrap.dataset.scrubbing;
      bind.set(normalize(input.value), true);
    };
    lab.addEventListener('pointermove', onMove);
    lab.addEventListener('pointerup', onUp);
  });

  // Step buttons: one step per click, repeating while held; one undo step.
  const stepper = (dir: 1 | -1) => {
    const b = h('button', {
      class: 'ctl-step',
      attrs: { type: 'button', ...(horizontal ? {} : { tabindex: '-1' }), 'aria-label': `${dir > 0 ? 'Increase' : 'Decrease'} ${opts.title ?? label}` },
    }, icon(horizontal ? (dir > 0 ? 'plus' : 'minus') : (dir > 0 ? 'caretUp' : 'caretDown')));
    // Pointer presses already step below; native keyboard activation fires a zero-detail click.
    if (horizontal) b.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      input.value = String(clampNum(current() + dir * step * (e.shiftKey ? 10 : 1)));
      bind.set(normalize(input.value), true);
    });
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); // keep focus where it was
      b.setPointerCapture(e.pointerId);
      wrap.dataset.scrubbing = '1';
      const bump = () => {
        input.value = String(clampNum(current() + dir * step * (e.shiftKey ? 10 : 1)));
        bind.set(normalize(input.value), false);
      };
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('pointerup', end, true);
        window.removeEventListener('pointercancel', end, true);
        delete wrap.dataset.scrubbing;
        bind.set(normalize(input.value), true);
      };
      bump();
      // Stops on release anywhere, and if the panel is rebuilt under the button
      // (it would never hear the release, and keep stepping).
      let timer = window.setTimeout(function repeat() {
        if (!b.isConnected) return end();
        bump();
        timer = window.setTimeout(repeat, 60);
      }, 400);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
      b.addEventListener('lostpointercapture', end, { once: true });
    });
    return b;
  };
  const box = horizontal
    ? h('div', { class: 'ctl-num ctl-num-horizontal' }, stepper(-1), input, stepper(1))
    : h('div', { class: 'ctl-num' }, input, h('div', { class: 'ctl-steps' }, stepper(1), stepper(-1)));

  const wrap = opts.inline ? h('div', { class: 'ctl-inline' }, lab, box) : row(lab, box);
  const refresh = () => {
    if (!busy(wrap)) input.value = display(bind.get());
  };
  refresh();
  return { el: wrap, refresh };
}

// ---------------------------------------------------------------- colour

export interface ColorOpts {
  /** Offer a "none" choice (SVG fill/stroke) or "transparent" (backgrounds). */
  none?: 'none' | 'transparent';
  palette?: () => string[];
}

/** Swatch + text field; the swatch opens a picker with the page's own colours. */
export function colorControl(label: string, bind: Binding<string>, opts: ColorOpts = {}): Control {
  const chip = h('span', { class: 'swatch-chip' });
  const swatch = h('button', { class: 'swatch', attrs: { type: 'button', 'aria-label': `${label} colour` } }, chip);
  const input = h('input', { class: 'ctl-input ctl-color-text', attrs: { type: 'text', spellcheck: 'false' } });
  const wrap = row(label, h('div', { class: 'ctl-color' }, swatch, input));

  const show = (v: string) => {
    const c = v && v !== 'none' ? resolveColor(v) : null;
    chip.style.background = c ? formatColor(c) : '';
    chip.classList.toggle('is-none', !c || c.a === 0);
    if (document.activeElement !== input) input.value = displayColor(v);
  };
  const commitText = () => {
    const v = input.value.trim();
    if (v === '' || v === 'none' || CSS.supports('color', v)) bind.set(v, true);
    else input.value = displayColor(bind.get());
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitText();
    if (e.key === 'Escape') {
      input.value = displayColor(bind.get());
      input.blur();
    }
  });
  input.addEventListener('change', commitText);
  swatch.addEventListener('click', () =>
    openColorPopover(swatch, bind.get(), opts, (v, final) => {
      bind.set(v, final);
      show(v);
    }),
  );

  // Always repaint the swatch; show() itself leaves the text alone while it's being typed in.
  const refresh = () => show(bind.get());
  refresh();
  return { el: wrap, refresh };
}

function displayColor(v: string): string {
  if (!v || v === 'none') return v;
  const c = resolveColor(v);
  return c ? formatColor(c) : v;
}

let popover: HTMLElement | null = null;
let popoverCleanup: (() => void) | null = null;
let colorPopoverId = 0;

function closePopover(): void {
  popover?.remove();
  popover = null;
  popoverCleanup?.();
  popoverCleanup = null;
}

/** Show `el` as a floating panel under (or above) `anchor`; closes on outside click or Escape. */
function showPopover(anchor: HTMLElement, el: HTMLElement, width: number, height: number): void {
  closePopover();
  popover = el;
  el.style.width = `${width}px`;
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))}px`;
  const below = r.bottom + 6;
  el.style.top = `${below + height > window.innerHeight ? Math.max(8, r.top - height - 6) : below}px`;

  const away = (e: PointerEvent) => {
    if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node)) closePopover();
  };
  const esc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopover();
  };
  setTimeout(() => document.addEventListener('pointerdown', away, true));
  el.addEventListener('keydown', esc);
  popoverCleanup = () => document.removeEventListener('pointerdown', away, true);
}

function openColorPopover(
  anchor: HTMLElement,
  value: string,
  opts: ColorOpts,
  onPick: (v: string, final: boolean) => void,
): void {
  const start = (value && value !== 'none' && resolveColor(value)) || { r: 0, g: 0, b: 0, a: 1 };
  let rgba = { ...start };
  const picker = h('input', { class: 'pop-picker', attrs: { type: 'color', value: toHex(rgba), 'aria-label': 'Choose colour' } });
  const hexId = `colour-hex-${++colorPopoverId}`;
  const hex = h('input', { class: 'ctl-input pop-hex', attrs: {
    type: 'text', id: hexId, spellcheck: 'false', autocomplete: 'off',
    'aria-label': 'HEX colour', placeholder: '#rrggbb',
  } });
  const error = h('span', { class: 'pop-hex-error', text: 'Enter a valid HEX colour, such as #16a34a.', attrs: { role: 'status' } });
  error.hidden = true;

  const sync = () => {
    picker.value = toHex(rgba);
    // Preserve and show transparency already present in an imported colour.
    hex.value = toHex(rgba) + (rgba.a < 1 ? Math.round(rgba.a * 255).toString(16).padStart(2, '0') : '');
    hex.removeAttribute('aria-invalid');
    error.hidden = true;
  };
  const commitHex = () => {
    const raw = hex.value.trim();
    const value = raw.startsWith('#') ? raw : `#${raw}`;
    const c = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? parseColor(value) : null;
    if (!c) {
      hex.setAttribute('aria-invalid', 'true');
      error.hidden = false;
      return;
    }
    rgba = c;
    sync();
    emit(true);
  };
  hex.addEventListener('change', commitHex);
  hex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitHex();
    }
  });
  hex.addEventListener('input', () => {
    hex.removeAttribute('aria-invalid');
    error.hidden = true;
  });

  const emit = (final: boolean) => onPick(formatColor(rgba), final);
  picker.addEventListener('input', () => {
    const c = resolveColor(picker.value)!;
    rgba = { ...c, a: rgba.a || 1 };
    sync();
    emit(false);
  });
  picker.addEventListener('change', () => emit(true));

  const swatches = (opts.palette?.() ?? []).map((c) =>
    h('button', {
      class: 'pop-swatch',
      title: c,
      attrs: { type: 'button', style: `background:${c}` },
      on: {
        click: () => {
          rgba = resolveColor(c) ?? rgba;
          sync();
          emit(true);
        },
      },
    }),
  );

  const noneBtn = opts.none
    ? h('button', {
        class: 'pop-none',
        text: opts.none === 'none' ? 'None' : 'Transparent',
        attrs: { type: 'button' },
        on: {
          click: () => {
            onPick(opts.none!, true);
            closePopover();
          },
        },
      })
    : null;

  const pop = h(
    'div',
    { class: 'popover', attrs: { role: 'dialog', 'aria-label': 'Colour picker' } },
    h('div', { class: 'pop-row' }, picker, noneBtn),
    h('div', { class: 'pop-row' }, h('label', { class: 'pop-caption', text: 'HEX', attrs: { for: hexId } }), hex),
    error,
    swatches.length ? h('div', { class: 'pop-caption', text: 'Colours in this page' }) : null,
    swatches.length ? h('div', { class: 'pop-swatches' }, ...swatches) : null,
  );
  sync();
  showPopover(anchor, pop, 244, 260);
  hex.focus();
  hex.select();
}

// ---------------------------------------------------------------- select

export function selectControl(
  label: string,
  options: { value: string; label: string }[],
  bind: Binding<string>,
): Control {
  const sel = h('select', { class: 'ctl-input ctl-select' });
  for (const o of options) sel.append(h('option', { text: o.label, attrs: { value: o.value } }));
  sel.addEventListener('change', () => bind.set(sel.value, true));
  const wrap = row(label, sel);
  const refresh = () => {
    if (busy(wrap)) return;
    const v = bind.get();
    // A value that isn't in the list (the page's own shadow, say) shows as blank.
    sel.value = options.some((o) => o.value === v) ? v : '';
  };
  refresh();
  return { el: wrap, refresh };
}

// ---------------------------------------------------------------- slider

export function sliderControl(
  label: string,
  range: { min: number; max: number; step?: number; suffix?: string },
  bind: Binding<number>,
): Control {
  const slider = h('input', {
    class: 'ctl-slider',
    attrs: { type: 'range', min: String(range.min), max: String(range.max), step: String(range.step ?? 1) },
  });
  const out = h('input', { class: 'ctl-input ctl-slider-out', attrs: { type: 'text' } });
  const suffix = range.suffix ?? '';
  const clamp = (n: number) => Math.min(range.max, Math.max(range.min, n));
  slider.addEventListener('input', () => {
    out.value = slider.value + suffix;
    bind.set(+slider.value, false);
  });
  slider.addEventListener('change', () => bind.set(+slider.value, true));
  out.addEventListener('change', () => {
    const n = clamp(parseFloat(out.value));
    if (!Number.isNaN(n)) bind.set(n, true);
    refreshNow();
  });
  out.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') out.dispatchEvent(new Event('change'));
  });
  const wrap = row(label, h('div', { class: 'ctl-slider-wrap' }, slider, out));
  const refreshNow = () => {
    const v = Math.round(bind.get());
    slider.value = String(v);
    out.value = v + suffix;
  };
  const refresh = () => {
    if (!busy(wrap)) refreshNow();
  };
  refresh();
  return { el: wrap, refresh };
}

// ---------------------------------------------------------------- segmented

export function segmentedControl(
  label: string,
  options: { value: string; label: string; title?: string }[],
  bind: Binding<string>,
): Control {
  const btns = options.map((o) =>
    h('button', {
      class: 'seg-btn',
      text: o.label,
      title: o.title ?? o.label,
      attrs: { type: 'button', 'data-value': o.value },
      on: { click: () => bind.set(o.value, true) },
    }),
  );
  const wrap = row(label, h('div', { class: 'seg' }, ...btns));
  const refresh = () => {
    const v = bind.get();
    for (const b of btns) b.classList.toggle('on', b.dataset.value === v);
  };
  refresh();
  return { el: wrap, refresh };
}

/** A row of on/off toggles (bold/italic/underline style). */
export function togglesControl(
  label: string,
  toggles: { label: string; title: string; bind: Binding<boolean>; className?: string }[],
): Control {
  const btns = toggles.map((t) => {
    const b = h('button', {
      class: `seg-btn ${t.className ?? ''}`,
      text: t.label,
      title: t.title,
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
    b.addEventListener('click', () => t.bind.set(!t.bind.get(), true));
    return b;
  });
  const wrap = row(label, h('div', { class: 'seg' }, ...btns));
  const refresh = () =>
    toggles.forEach((t, i) => {
      const on = t.bind.get();
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-pressed', String(on));
    });
  refresh();
  return { el: wrap, refresh };
}

// ---------------------------------------------------------------- text

export function textControl(
  label: string,
  bind: Binding<string>,
  opts: { multiline?: boolean; placeholder?: string; list?: string[]; mono?: boolean } = {},
): Control {
  const input = opts.multiline
    ? h('textarea', { class: `ctl-input ctl-textarea${opts.mono ? ' mono' : ''}`, attrs: { spellcheck: 'false', rows: '4', placeholder: opts.placeholder ?? '' } })
    : h('input', { class: `ctl-input${opts.mono ? ' mono' : ''}`, attrs: { type: 'text', spellcheck: 'false', placeholder: opts.placeholder ?? '' } });
  let listEl: HTMLDataListElement | null = null;
  if (opts.list?.length && input instanceof HTMLInputElement) {
    const id = `dl-${Math.random().toString(36).slice(2, 8)}`;
    listEl = h('datalist', { attrs: { id } }, ...opts.list.map((v) => h('option', { attrs: { value: v } })));
    input.setAttribute('list', id);
  }
  const commit = () => bind.set(input.value, true);
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' && (!opts.multiline || ke.ctrlKey || ke.metaKey)) {
      ke.preventDefault();
      commit();
    }
    if (ke.key === 'Escape') {
      input.value = bind.get();
      input.blur();
    }
  });
  const wrap = opts.multiline ? h('div', { class: 'ctl-block' }, h('label', { class: 'ctl-label', text: label }), input) : row(label, input);
  if (listEl) wrap.append(listEl);
  const refresh = () => {
    if (!busy(wrap)) input.value = bind.get();
  };
  refresh();
  return { el: wrap, refresh };
}

// ---------------------------------------------------------------- font

export interface FontGroup {
  title: string;
  fonts: string[];
}

/**
 * A font name field plus a list of fonts, each shown in its own typeface.
 * The field shows one name; `toValue` turns a name into the full CSS
 * font list that gets written.
 */
export function fontControl(
  label: string,
  bind: Binding<string>,
  opts: { groups: () => FontGroup[]; display: (value: string) => string; toValue: (name: string) => string },
): Control {
  const input = h('input', { class: 'ctl-input ctl-font', attrs: { type: 'text', spellcheck: 'false', placeholder: 'Font name' } });
  const open = h('button', { class: 'ctl-font-open', text: '▾', attrs: { type: 'button', 'aria-label': `Choose ${label.toLowerCase()}` } });
  const wrap = row(label, h('div', { class: 'ctl-font-wrap' }, input, open));

  const pick = (name: string) => {
    const v = name.trim();
    if (v) bind.set(opts.toValue(v), true);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pick(input.value);
    if (e.key === 'Escape') {
      input.value = opts.display(bind.get());
      input.blur();
    }
  });
  input.addEventListener('change', () => pick(input.value));

  open.addEventListener('click', () => {
    const current = opts.display(bind.get()).toLowerCase();
    let selected: HTMLElement | null = null;
    const list = h('div', { class: 'popover font-pop', attrs: { role: 'listbox', 'aria-label': label } });
    for (const group of opts.groups()) {
      list.append(h('div', { class: 'pop-caption font-group', text: group.title }));
      for (const name of group.fonts) {
        const item = h('button', {
          class: `font-opt${name.toLowerCase() === current ? ' on' : ''}`,
          text: name,
          title: name,
          attrs: { type: 'button', role: 'option', style: `font-family: ${quoteFamily(name)}, sans-serif` },
          on: {
            click: () => {
              pick(name);
              input.value = name;
              closePopover();
            },
          },
        });
        if (name.toLowerCase() === current) selected = item;
        list.append(item);
      }
    }
    showPopover(open, list, 240, 340);
    selected?.scrollIntoView({ block: 'center' });
  });

  const refresh = () => {
    const v = bind.get();
    wrap.title = v; // the full fallback list, on hover
    if (!busy(wrap)) input.value = opts.display(v);
  };
  refresh();
  return { el: wrap, refresh };
}

/** Several compact controls side by side (e.g. W/H or the four paddings). */
export function gridControl(label: string, controls: Control[], cols = controls.length): Control {
  const grid = h('div', { class: 'ctl-grid' }, ...controls.map((c) => c.el));
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  const wrap = label ? row(label, grid) : h('div', { class: 'ctl-row ctl-row-full' }, grid);
  return { el: wrap, refresh: () => controls.forEach((c) => c.refresh()) };
}

export function noteControl(text: string, action?: { label: string; run: () => void }): Control {
  const el = h(
    'div',
    { class: 'ctl-note' },
    h('span', { text }),
    action ? h('button', { class: 'link-btn', text: action.label, attrs: { type: 'button' }, on: { click: action.run } }) : null,
  );
  return { el, refresh() {} };
}

export function buttonsControl(buttons: { label: string; title?: string; run: () => void; danger?: boolean; disabled?: boolean }[]): Control {
  const el = h(
    'div',
    { class: 'ctl-buttons' },
    ...buttons.map((b) => {
      const btn = h('button', {
        class: `btn btn-small${b.danger ? ' btn-danger' : ''}`,
        text: b.label,
        title: b.title ?? b.label,
        attrs: { type: 'button' },
        on: { click: b.run },
      });
      btn.disabled = !!b.disabled;
      return btn;
    }),
  );
  return { el, refresh() {} };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
