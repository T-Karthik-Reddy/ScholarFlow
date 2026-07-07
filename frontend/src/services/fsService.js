import { openDB } from 'idb';

const DB_NAME = 'scholarflow-fs-db';
const STORE_NAME = 'handles';
const PAPERS_DIR_KEY = 'papers-dir';

export function isFsAccessSupported() {
    return typeof window.showDirectoryPicker === 'function';
}

async function getDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            db.createObjectStore(STORE_NAME);
        },
    });
}

// Returns the stored handle plus its current permission state without
// prompting — requestPermission() only works inside a user gesture.
// status: 'granted' | 'needs-permission' | 'none'
export async function getStoredDirectory() {
    try {
        const db = await getDB();
        const handle = await db.get(STORE_NAME, PAPERS_DIR_KEY);
        if (!handle) return { handle: null, status: 'none' };
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        return { handle, status: permission === 'granted' ? 'granted' : 'needs-permission' };
    } catch (e) {
        console.error('Failed to read stored directory handle', e);
        return { handle: null, status: 'none' };
    }
}

// Must be called from a click handler (user gesture).
export async function requestDirectoryPermission(handle) {
    try {
        const permission = await handle.requestPermission({ mode: 'readwrite' });
        return permission === 'granted';
    } catch (e) {
        console.error('Permission request failed', e);
        return false;
    }
}

// Must be called from a click handler (user gesture).
export async function pickDirectory() {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const db = await getDB();
    await db.put(STORE_NAME, handle, PAPERS_DIR_KEY);
    return handle;
}

function base64ToBlob(base64Data, type = 'application/pdf') {
    const byteString = atob(base64Data);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
    }
    return new Blob([bytes], { type });
}

export async function savePdf(handle, filename, base64Data) {
    if (!handle) return false;
    try {
        const fileHandle = await handle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(base64ToBlob(base64Data));
        await writable.close();
        return true;
    } catch (e) {
        console.error('Failed to save PDF', e);
        return false;
    }
}

export async function getPdfUrl(handle, filename) {
    if (!handle) return null;
    try {
        const fileHandle = await handle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return URL.createObjectURL(file);
    } catch {
        return null; // not downloaded yet
    }
}

async function getDirectoryForPath(rootHandle, pathParts) {
    let dir = rootHandle;
    for (const part of pathParts) {
        dir = await dir.getDirectoryHandle(part, { create: true });
    }
    return dir;
}

// Writes generated project files (path may contain subdirectories) into a
// subfolder of the chosen directory. Reports progress via onProgress(i, path).
export async function writeProjectFiles(rootHandle, projectName, files, onProgress) {
    const projectDir = await rootHandle.getDirectoryHandle(projectName, { create: true });
    const written = [];
    for (let i = 0; i < files.length; i++) {
        const { path, content } = files[i];
        const parts = path.split('/').filter(p => p && p !== '.' && p !== '..');
        if (parts.length === 0) continue;
        const filename = parts.pop();
        const dir = await getDirectoryForPath(projectDir, parts);
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        written.push(parts.length ? `${parts.join('/')}/${filename}` : filename);
        onProgress?.(i + 1, path);
    }
    return written;
}
