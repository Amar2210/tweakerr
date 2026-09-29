type Child = Node | string | null | undefined | false;

export interface HProps {
  class?: string;
  title?: string;
  text?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[K]) => void };
}

/** Tiny element factory for the editor UI. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: HProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.title) el.title = props.title;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.dataset) Object.assign(el.dataset, props.dataset);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.on) {
    for (const [ev, fn] of Object.entries(props.on)) el.addEventListener(ev, fn as EventListener);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

/** Is focus in a text field of the editor UI (so shortcuts should stand down)? */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'color', 'file'].includes(t.type);
  }
  return false;
}

export function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
