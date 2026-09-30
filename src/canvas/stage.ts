import { DEVICE_HEIGHT, DEVICE_WIDTH, type Editor, type OpenFile } from '../editor';
import { LiveEdits } from '../doc/live';
import type { Box } from '../util/geometry';
import { drawsItself, pageScripts, settle, watchPage } from './livepage';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const FIT_PADDING = 48;

/**
 * Hosts the user's page in a sandboxed iframe (the editor can still reach
 * in), scales it for zoom, and converts between screen coordinates and page
 * coordinates. Scripts are blocked, unless the page draws itself with them:
 * then it opens as a live page (see doc/live.ts).
 */
export class Stage {
  private height = 0;
  private relayoutQueued = false;
  private stopWatching: (() => void) | null = null;

  constructor(
    private editor: Editor,
    /** Scrollable canvas area. */
    readonly canvas: HTMLElement,
    /** Box sized to the scaled page; holds the iframe and the overlay. */
    readonly stage: HTMLElement,
    readonly frame: HTMLIFrameElement,
  ) {
    editor.on('change', () => this.queueRelayout());
    new ResizeObserver(() => {
      if (this.editor.fit) this.layout();
    }).observe(canvas);
  }

  get zoom(): number {
    return this.editor.zoom;
  }

  /** Load HTML text into the frame and hand the document to the editor. */
  async mount(html: string, name: string, handle: FileSystemFileHandle | null): Promise<{ live: boolean; missing: string[] }> {
    const text = html.replace(/^\uFEFF/, '');
    const file: OpenFile = { name, handle, trailingNewline: /\n\s*$/.test(text), source: text };
    this.stopWatching?.();
    this.stopWatching = null;

    const scripts = pageScripts(text);
    let doc: Document;
    let live: LiveEdits | null = null;
    if (scripts.count) {
      // Run it once to see whether its scripts draw the page.
      doc = await this.load(text, true);
      await settle(doc);
      if (drawsItself(scripts.written, doc)) live = new LiveEdits(doc, text);
      else doc = await this.load(text, false);
    } else {
      doc = await this.load(text, false);
    }

    // Re-measure when late content changes the page height.
    doc.addEventListener('load', () => this.queueRelayout(), true);
    doc.fonts?.ready.then(() => this.queueRelayout());

    this.editor.attach(doc, file, live);
    if (live) this.stopWatching = watchPage(this.editor, live);
    this.editor.fit = true;
    this.layout();
    return { live: !!live, missing: live ? scripts.local : [] };
  }

  private async load(text: string, runScripts: boolean): Promise<Document> {
    // Takes effect with the navigation that setting srcdoc starts.
    this.frame.setAttribute('sandbox', runScripts ? 'allow-same-origin allow-scripts' : 'allow-same-origin');
    const loaded = new Promise<void>((resolve) => this.frame.addEventListener('load', () => resolve(), { once: true }));
    this.frame.srcdoc = text;
    await loaded;
    const doc = this.frame.contentDocument;
    if (!doc) throw new Error('Could not open the page (frame document unavailable).');
    return doc;
  }

  /** Size the frame to its content and apply zoom. */
  layout(): void {
    const doc = this.editor.doc;
    const width = DEVICE_WIDTH[this.editor.device];
    const base = DEVICE_HEIGHT[this.editor.device];
    this.frame.style.width = `${width}px`;

    if (doc) {
      // Measure at the base height, then grow to fit. Doing it in one task
      // avoids feedback loops with `100vh` layouts and never paints the reset.
      this.frame.style.height = `${base}px`;
      const content = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0);
      this.height = Math.max(base, Math.ceil(content));
    } else {
      this.height = base;
    }
    this.frame.style.height = `${this.height}px`;

    if (this.editor.fit) {
      const avail = this.canvas.clientWidth - FIT_PADDING;
      this.editor.zoom = clampZoom(Math.min(1, avail / width));
    }
    const z = this.editor.zoom;
    this.frame.style.transform = `scale(${z})`;
    this.stage.style.width = `${width * z}px`;
    this.stage.style.height = `${this.height * z}px`;
    this.editor.emit('layout');
  }

  queueRelayout(): void {
    if (this.relayoutQueued) return;
    this.relayoutQueued = true;
    requestAnimationFrame(() => {
      this.relayoutQueued = false;
      this.layout();
    });
  }

  setZoom(z: number, anchor?: { clientX: number; clientY: number }): void {
    const old = this.editor.zoom;
    const next = clampZoom(z);
    if (next === old) return;
    // Keep the point under the cursor (or the canvas centre) still.
    const cr = this.canvas.getBoundingClientRect();
    const ax = anchor ? anchor.clientX - cr.left : cr.width / 2;
    const ay = anchor ? anchor.clientY - cr.top : cr.height / 2;
    const docX = (this.canvas.scrollLeft + ax - this.stage.offsetLeft) / old;
    const docY = (this.canvas.scrollTop + ay - this.stage.offsetTop) / old;
    this.editor.fit = false;
    this.editor.zoom = next;
    this.layout();
    this.canvas.scrollLeft = docX * next + this.stage.offsetLeft - ax;
    this.canvas.scrollTop = docY * next + this.stage.offsetTop - ay;
  }

  fitToWidth(): void {
    this.editor.fit = true;
    this.layout();
  }

  /** Screen point -> page (iframe viewport) coordinates. */
  toDoc(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.stage.getBoundingClientRect();
    return { x: (clientX - r.left) / this.zoom, y: (clientY - r.top) / this.zoom };
  }

  /** Element box in page coordinates. */
  docRect(el: Element): Box {
    const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  }

  /** Page coordinates -> overlay (stage) coordinates. */
  toStage(b: Box): Box {
    const z = this.zoom;
    return { left: b.left * z, top: b.top * z, width: b.width * z, height: b.height * z };
  }
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));
}
