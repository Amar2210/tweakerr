import './styles/editor.css';
import demoHtml from './demo.html?raw';
import { DEVICE_WIDTH, Editor, type Device } from './editor';
import { Stage } from './canvas/stage';
import { Overlay } from './canvas/overlay';
import { TextEditor } from './canvas/textedit';
import { Pointer } from './canvas/pointer';
import { PropertiesPanel } from './panel/properties';
import { LayersPanel } from './panel/layers';
import { deleteSelected, duplicateSelected, nudgeSelected, selectFirstChild, selectParent, selectSiblings } from './doc/actions';
import { describe, isStructural, isTextEditable } from './doc/kinds';
import { serializeDocument } from './doc/serialize';
import { canSaveInPlace, download, fromDrop, pickFile, saveAs, saveToHandle, type PickedFile } from './io/files';
import { $, h, isTypingTarget } from './util/dom';
import { icon } from './util/icons';

const frame = $('#frame') as HTMLIFrameElement;
const canvas = $('#canvas');
const editor = new Editor(frame);
const stage = new Stage(editor, canvas, $('#stage'), frame);
const overlay = new Overlay(editor, stage, $('#overlay'));
const text = new TextEditor(editor, stage, (e) => onKey(e));
new Pointer(editor, stage, overlay, text);
new PropertiesPanel(editor, $('#props'));
new LayersPanel(editor, $('#layers'));

// ------------------------------------------------------------------ feedback

function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const t = h('div', { class: `toast ${kind}`, text: message, attrs: { role: kind === 'error' ? 'alert' : 'status' } });
  $('#toasts').append(t);
  // Long enough to read: longer messages stay up longer.
  const ms = Math.max(kind === 'error' ? 5000 : 2200, message.length * 50);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}
editor.notify = (message) => toast(message);

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------- open/save

async function openPicked(picked: PickedFile | null): Promise<void> {
  if (!picked) return;
  if (!/\.html?$/i.test(picked.name) && !/<html|<body|<!doctype/i.test(picked.text.slice(0, 2000))) {
    toast(`${picked.name} doesn't look like an HTML file.`, 'error');
    return;
  }
  if (editor.dirty && !confirm('You have unsaved changes. Open another file and lose them?')) return;
  try {
    const opened = await stage.mount(picked.text, picked.name, picked.handle);
    toast(opened.live ? `Opened ${picked.name} · its code draws it, so changes are saved as style rules` : `Opened ${picked.name}`);
    if (opened.missing.length) {
      toast(`This page loads ${opened.missing.join(', ')} from its own folder. Tweakerr can't reach ${opened.missing.length > 1 ? 'those files' : 'that file'}, so parts it draws may be missing.`, 'error');
    }
  } catch (err) {
    toast(`Couldn't open ${picked.name}: ${errorText(err)}`, 'error');
  }
}

async function openFile(): Promise<void> {
  await openPicked(await pickFile());
}

async function openDemo(): Promise<void> {
  await openPicked({ name: 'tweakerr-demo.html', text: demoHtml, handle: null });
}

function currentHtml(): string | null {
  text.commit();
  if (!editor.doc || !editor.file) return null;
  if (editor.live) return editor.live.save();
  return serializeDocument(editor.doc, { trailingNewline: editor.file.trailingNewline });
}

async function save(): Promise<void> {
  const html = currentHtml();
  const file = editor.file;
  if (html === null || !file) return;
  try {
    if (file.handle) {
      if (await saveToHandle(file.handle, html)) {
        editor.markSaved();
        toast(`Saved ${file.name}`);
      } else {
        toast('Permission to write the file was refused. Try “Save as…”.', 'error');
      }
      return;
    }
    await saveCopy(html);
  } catch (err) {
    toast(`Save failed: ${errorText(err)}`, 'error');
  }
}

async function saveCopy(html = currentHtml()): Promise<void> {
  const file = editor.file;
  if (html === null || !file) return;
  try {
    const handle = canSaveInPlace ? await saveAs(file.name, html) : 'unsupported';
    if (handle === null) return; // cancelled
    if (handle === 'unsupported') {
      download(file.name, html);
      editor.markSaved();
      toast(`Downloaded ${file.name}`);
      return;
    }
    const f = await handle.getFile();
    file.handle = handle;
    file.name = f.name;
    editor.markSaved();
    toast(`Saved ${f.name}`);
  } catch (err) {
    toast(`Save failed: ${errorText(err)}`, 'error');
  }
}

// ------------------------------------------------------------------ toolbar

const commands: Record<string, () => void> = {
  open: () => void openFile(),
  demo: () => void openDemo(),
  save: () => void save(),
  'save-as': () => void saveCopy(),
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  'zoom-in': () => stage.setZoom(editor.zoom * 1.25),
  'zoom-out': () => stage.setZoom(editor.zoom / 1.25),
  'zoom-reset': () => stage.setZoom(1),
  fit: () => stage.fitToWidth(),
  help: () => ($('#help') as HTMLDialogElement).showModal(),
  'toggle-layers': () => setLayersOpen($('#app').classList.contains('layers-collapsed')),
};

// ------------------------------------------------------------ layers panel

const LAYERS_KEY = 'tweakerr.layersOpen';

/** Show or collapse the layers panel; the canvas takes the freed width. */
function setLayersOpen(open: boolean): void {
  $('#app').classList.toggle('layers-collapsed', !open);
  const btn = $('#layers-toggle');
  const label = open ? 'Hide layers' : 'Show layers';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', String(open));
  btn.replaceChildren(icon(open ? 'panelClose' : 'panelOpen'));
  try {
    localStorage.setItem(LAYERS_KEY, open ? '1' : '0');
  } catch {
    // Storage blocked (private window, file:// policy): just don't remember it.
  }
}

setLayersOpen((() => {
  try {
    return localStorage.getItem(LAYERS_KEY) !== '0';
  } catch {
    return true;
  }
})());

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd], [data-device]');
  if (!btn || (btn as HTMLButtonElement).disabled) return;
  if (btn.dataset.cmd) commands[btn.dataset.cmd]?.();
  if (btn.dataset.device) setDevice(btn.dataset.device as Device);
});

function setDevice(d: Device): void {
  if (!(d in DEVICE_WIDTH)) return;
  editor.device = d;
  editor.fit = true;
  stage.layout(true);
  updateChrome();
}

function updateChrome(): void {
  const hasDoc = !!editor.doc;
  const hist = editor.history;
  const set = (cmd: string, enabled: boolean, title?: string) => {
    for (const b of document.querySelectorAll<HTMLButtonElement>(`.toolbar [data-cmd="${cmd}"]`)) {
      b.disabled = !enabled;
      if (title) b.title = title;
    }
  };
  set('save', hasDoc);
  set('save-as', hasDoc);
  const undoLabel = hist?.peekUndo()?.label;
  const redoLabel = hist?.peekRedo()?.label;
  set('undo', !!hist?.canUndo(), undoLabel ? `Undo ${undoLabel.toLowerCase()} (Ctrl+Z)` : 'Undo (Ctrl+Z)');
  set('redo', !!hist?.canRedo(), redoLabel ? `Redo ${redoLabel.toLowerCase()} (Ctrl+Shift+Z)` : 'Redo (Ctrl+Shift+Z)');
  for (const cmd of ['zoom-in', 'zoom-out', 'zoom-reset', 'fit']) set(cmd, hasDoc);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-device]')) {
    b.classList.toggle('active', b.dataset.device === editor.device);
    b.disabled = !hasDoc;
  }
  $('#zoom-label').textContent = `${Math.round(editor.zoom * 100)}%`;

  const name = editor.file?.name ?? '';
  const nameEl = $('#file-name');
  nameEl.textContent = name ? `${editor.dirty ? '• ' : ''}${name}` : '';
  nameEl.title = editor.file?.handle ? 'Ctrl+S saves straight back to this file' : name ? 'Ctrl+S downloads a copy' : '';
  nameEl.classList.toggle('dirty', editor.dirty);
  document.title = name ? `${editor.dirty ? '• ' : ''}${name} — Tweakerr` : 'Tweakerr';

  document.body.classList.toggle('has-doc', hasDoc);
  $('#live-badge').hidden = !editor.live;
}

function updateCrumbs(): void {
  const nav = $('#crumbs');
  const el = editor.selected;
  if (!el) {
    nav.replaceChildren(h('span', { class: 'crumb-hint', text: editor.doc ? 'Nothing selected — click an element on the page' : '' }));
    return;
  }
  const chain: Element[] = [];
  for (let p: Element | null = el; p && p.localName !== 'html'; p = p.parentElement) chain.unshift(p);
  const parts: HTMLElement[] = [];
  chain.forEach((node, i) => {
    if (i) parts.push(h('span', { class: 'crumb-sep', text: '›' }));
    const b = h('button', {
      class: `crumb${node === el ? ' current' : ''}`,
      text: node.localName === 'body' ? 'Page' : describe(node),
      attrs: { type: 'button' },
      on: {
        click: () => editor.select(node.localName === 'body' ? null : node),
        pointerenter: () => editor.hover(node),
        pointerleave: () => editor.hover(null),
      },
    });
    parts.push(b);
  });
  if (editor.multi) parts.push(h('span', { class: 'crumb-more', text: `+ ${editor.selection.length - 1} more selected` }));
  nav.replaceChildren(...parts);
  nav.scrollLeft = nav.scrollWidth;
}

editor.on('file', updateChrome);
editor.on('layout', updateChrome);
editor.on('change', updateChrome);
editor.on('load', updateChrome);
editor.on('selection', updateCrumbs);
editor.on('load', updateCrumbs);
editor.on('load', () => $('#empty').setAttribute('hidden', ''));

// ---------------------------------------------------------------- keyboard

function onKey(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  // File shortcuts work everywhere, even while typing in a panel field.
  if (mod && key === 's') {
    e.preventDefault();
    if (e.shiftKey) void saveCopy();
    else void save();
    return;
  }
  if (mod && key === 'o') {
    e.preventDefault();
    void openFile();
    return;
  }

  if (isTypingTarget(e.target) || text.active) return;
  if (($('#help') as HTMLDialogElement).open) return;

  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if (mod && key === 'y') {
    e.preventDefault();
    editor.redo();
    return;
  }
  if (mod && (key === '=' || key === '+')) {
    e.preventDefault();
    commands['zoom-in']();
    return;
  }
  if (mod && (key === '-' || key === '_')) {
    e.preventDefault();
    commands['zoom-out']();
    return;
  }
  if (mod && key === '0') {
    e.preventDefault();
    commands['zoom-reset']();
    return;
  }
  if (mod && key === 'd') {
    e.preventDefault();
    duplicateSelected(editor);
    return;
  }
  if (mod && key === 'a' && editor.selected) {
    e.preventDefault();
    selectSiblings(editor);
    return;
  }
  if (mod || e.altKey) return;

  const sel = editor.selected;
  switch (e.key) {
    case '?':
      e.preventDefault();
      commands.help();
      return;
    case 'Escape':
      if (sel) {
        e.preventDefault();
        editor.select(null);
      }
      return;
    case 'Delete':
    case 'Backspace':
      if (sel && !isStructural(sel)) {
        e.preventDefault();
        deleteSelected(editor);
      }
      return;
    case 'Enter':
      if (!sel) return;
      e.preventDefault();
      if (editor.multi) editor.select(sel);
      if (e.shiftKey) selectParent(editor);
      else if (isTextEditable(sel)) text.start(sel);
      else selectFirstChild(editor);
      return;
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!sel || isStructural(sel)) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      nudgeSelected(editor, dx, dy);
      return;
    }
  }
}

window.addEventListener('keydown', onKey);

// Ctrl+wheel on the grey canvas (outside the page) zooms too, instead of zooming the whole editor.
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.defaultPrevented || !editor.doc) return;
    e.preventDefault();
    stage.setZoom(editor.zoom * Math.exp(-e.deltaY * 0.002), e);
  },
  { passive: false },
);

// --------------------------------------------------------------- drag+drop

let dragDepth = 0;
const dropHint = $('#drop-hint');
const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropHint.classList.add('show');
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropHint.classList.remove('show');
});
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  dragDepth = 0;
  dropHint.classList.remove('show');
  fromDrop(e.dataTransfer)
    .then(openPicked)
    .catch((err) => toast(`Couldn't open the dropped file: ${errorText(err)}`, 'error'));
});

window.addEventListener('beforeunload', (e) => {
  if (!editor.dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

updateChrome();
updateCrumbs();

// Handy for debugging and for the end-to-end tests.
Object.assign(window, { tweakerr: { editor, stage, overlay, text, serialize: () => currentHtml() } });
