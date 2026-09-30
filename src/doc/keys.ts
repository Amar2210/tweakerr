const keys = new WeakMap<Element, number>();
let nextKey = 1;

/** A stable per-element id used to merge repeated edits into one undo step. */
export function elementKey(el: Element): number {
  let k = keys.get(el);
  if (!k) keys.set(el, (k = nextKey++));
  return k;
}

/** A live page drew `to` in place of `from`: it's the same item, so it keeps the id. */
export function adoptKey(from: Element, to: Element): void {
  const k = keys.get(from);
  if (k && !keys.has(to)) keys.set(to, k);
}
