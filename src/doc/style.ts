/** Read and write styles on page elements. */

type Styled = Element & ElementCSSInlineStyle;

export function computed(el: Element, prop: string): string {
  const win = el.ownerDocument.defaultView;
  return win ? win.getComputedStyle(el).getPropertyValue(prop).trim() : '';
}

export function inlineStyle(el: Element, prop: string): string {
  return (el as Styled).style?.getPropertyValue(prop) ?? '';
}

/**
 * Set one CSS property as an inline style on this element only.
 * If a stylesheet rule marked `!important` wins over the inline value,
 * retry with `!important` so the user's edit actually shows up.
 * An empty value removes the inline property.
 */
export function setStyle(el: Element, prop: string, value: string): void {
  const style = (el as Styled).style;
  if (!style) return;
  if (value === '') {
    style.removeProperty(prop);
    if (!style.cssText.trim()) el.removeAttribute('style');
    return;
  }
  // Already had to be !important: keep it. (Re-setting it without the flag
  // drops `!important` from the attribute while Chrome keeps painting the
  // old cascade result, so the screen and the saved file would disagree.)
  if (style.getPropertyPriority(prop) === 'important') {
    style.setProperty(prop, value, 'important');
    return;
  }
  const before = computed(el, prop);
  style.setProperty(prop, value);
  if (computed(el, prop) !== before) return;
  style.setProperty(prop, value, 'important');
  if (computed(el, prop) === before) {
    // Nothing was blocking it — the new value simply equals the old one.
    style.setProperty(prop, value);
  }
}

/** Set or remove (null) an attribute. */
export function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}
