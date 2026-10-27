import type { Editor } from '../editor';
import type { RevisionComment } from '../doc/comments';
import type { CommentTarget } from '../doc/comment-targets';
import { h } from '../util/dom';

/** The existing left sidebar's Comments view; matching here never refreshes metadata. */
export class CommentSidebar {
  private queued = false;

  constructor(
    private editor: Editor,
    private root: HTMLElement,
    private open: (id: string) => void,
    private remove: (id: string) => void,
    private locate: (target: CommentTarget) => void,
  ) {
    for (const event of ['load', 'change', 'redraw'] as const) editor.on(event, () => this.queue());
    this.render();
  }

  private queue(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.render(); });
  }

  render(): void {
    const comments = this.editor.comments?.all ?? [];
    if (!comments.length) { this.root.replaceChildren(); return; }
    const pending = comments.filter((comment) => comment.status === 'pending');
    const resolved = comments.filter((comment) => comment.status === 'resolved');
    const active = this.root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusKey = active?.dataset.commentAction;
    const scroll = this.root.scrollTop;
    this.root.replaceChildren(
      h('section', { class: 'comment-section', attrs: { 'aria-label': 'Pending comments' } },
        h('h2', { text: `Pending (${pending.length})` }),
        ...(pending.length ? pending.map((comment) => this.entry(comment)) : [h('p', { class: 'comment-help', text: 'No pending requests.' })]),
      ),
      h('section', { class: 'comment-section', attrs: { 'aria-label': 'Resolved comments' } },
        h('h2', { text: `Resolved (${resolved.length})` }),
        ...(resolved.length ? resolved.map((comment) => this.entry(comment)) : [h('p', { class: 'comment-help', text: 'No resolved comments yet. Completed requests returned by the LLM appear here.' })]),
      ),
    );
    this.root.scrollTop = scroll;
    if (focusKey && !this.root.hidden) {
      const next = [...this.root.querySelectorAll<HTMLElement>('[data-comment-action]')].find((el) => el.dataset.commentAction === focusKey);
      (next ?? this.root).focus({ preventScroll: true });
    }
  }

  private entry(comment: RevisionComment): HTMLElement {
    const pending = comment.status === 'pending';
    return h('article', { class: 'comment-history-item', dataset: { commentId: comment.id } },
      h('div', { class: 'comment-history-heading' }, h('strong', { text: comment.id }),
        pending ? h('button', {
          class: 'comment-edit', text: 'Edit',
          dataset: { commentAction: `edit:${comment.id}` },
          attrs: { type: 'button', 'aria-label': `Edit pending comment ${comment.id}` },
          on: { click: () => this.open(comment.id) },
        }) : h('button', {
          class: 'comment-delete', text: '×', title: 'Delete this comment completely',
          dataset: { commentAction: `delete:${comment.id}` },
          attrs: { type: 'button', 'aria-label': `Delete resolved comment ${comment.id}` },
          on: { click: () => this.remove(comment.id) },
        }),
      ),
      h('p', { class: 'comment-request', text: comment.text || 'Empty request' }),
      h('ul', { class: 'comment-target-list' }, ...comment.targets.map((target) => this.target(target))),
      comment.resolution ? h('p', { class: 'comment-resolution' }, h('strong', { text: 'LLM completion: ' }), comment.resolution) : null,
    );
  }

  private target(target: CommentTarget): HTMLElement {
    const available = !!this.editor.comments?.findTarget(target);
    return h('li', {}, available ? h('button', {
      class: 'comment-locate', text: target.label, title: 'Select and scroll to the current target',
      dataset: { commentAction: `locate:${target.key}` },
      attrs: { type: 'button', 'aria-label': `Locate ${target.label}` },
      // Re-match on activation: live code may have replaced the rendered node.
      on: { click: () => { this.locate(target); this.queue(); } },
    }) : h('span', {}, target.label,
      h('span', { class: 'comment-target-unavailable', text: 'Target unavailable' }),
    ));
  }
}
