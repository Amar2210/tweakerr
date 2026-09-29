/**
 * Opening and saving files. Chrome/Edge get the File System Access API, so
 * Ctrl+S writes straight back to the opened file. Other browsers (or
 * file:// pages where the API is unavailable) fall back to a plain file
 * input and a download.
 */

export interface PickedFile {
  name: string;
  text: string;
  handle: FileSystemFileHandle | null;
}

type PickerType = { description: string; accept: Record<string, string[]> };
type Permission = 'granted' | 'denied' | 'prompt';

interface PickerWindow {
  showOpenFilePicker?: (opts: { types?: PickerType[]; multiple?: boolean; excludeAcceptAllOption?: boolean }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (opts: { suggestedName?: string; types?: PickerType[] }) => Promise<FileSystemFileHandle>;
}

interface PermissionHandle {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<Permission>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<Permission>;
}

const HTML_TYPES: PickerType[] = [{ description: 'HTML page', accept: { 'text/html': ['.html', '.htm'] } }];

const pickerWindow = window as unknown as PickerWindow;

export const canSaveInPlace = typeof pickerWindow.showSaveFilePicker === 'function';

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Ask the user for an HTML file. Resolves null if they cancel. */
export async function pickFile(): Promise<PickedFile | null> {
  if (pickerWindow.showOpenFilePicker) {
    try {
      const [handle] = await pickerWindow.showOpenFilePicker({ types: HTML_TYPES, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (err) {
      if (isAbort(err)) return null;
      // Some environments expose the API but refuse it; fall through to the input.
    }
  }
  return pickWithInput();
}

function pickWithInput(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,text/html';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.append(input);
    input.click();
  });
}

/** Read a dropped file, keeping a writable handle when the browser offers one. */
export async function fromDrop(dt: DataTransfer): Promise<PickedFile | null> {
  const item = Array.from(dt.items).find((i) => i.kind === 'file');
  if (!item) return null;
  const getHandle = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }).getAsFileSystemHandle;
  // Must be called synchronously inside the drop event, before any await.
  const handlePromise = getHandle ? getHandle.call(item).catch(() => null) : Promise.resolve(null);
  const file = item.getAsFile();
  const handle = await handlePromise;
  if (handle && handle.kind === 'file') {
    const fh = handle as FileSystemFileHandle;
    const f = await fh.getFile();
    return { name: f.name, text: await f.text(), handle: fh };
  }
  if (!file) return null;
  return { name: file.name, text: await file.text(), handle: null };
}

async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as FileSystemFileHandle & PermissionHandle;
  if (!h.queryPermission || !h.requestPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Overwrite the opened file. Returns false if permission was refused. */
export async function saveToHandle(handle: FileSystemFileHandle, text: string): Promise<boolean> {
  if (!(await ensureWritable(handle))) return false;
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

/** Ask where to save. Returns the new handle, or null if cancelled / unsupported. */
export async function saveAs(suggestedName: string, text: string): Promise<FileSystemFileHandle | null | 'unsupported'> {
  if (!pickerWindow.showSaveFilePicker) return 'unsupported';
  try {
    const handle = await pickerWindow.showSaveFilePicker({ suggestedName, types: HTML_TYPES });
    await saveToHandle(handle, text);
    return handle;
  } catch (err) {
    if (isAbort(err)) return null;
    throw err;
  }
}

/** Save through the browser's download bar. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
