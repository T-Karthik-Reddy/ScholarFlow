import { openDB } from 'idb';

const DB_NAME = 'scholarflow-fs-db';
const STORE_NAME = 'handles';

async function getDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            db.createObjectStore(STORE_NAME);
        },
    });
}

export async function getDirectoryHandle() {
    const db = await getDB();
    let handle = await db.get(STORE_NAME, 'papers-dir');
    
    if (handle) {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            const request = await handle.requestPermission({ mode: 'readwrite' });
            if (request !== 'granted') {
                return null;
            }
        }
        return handle;
    }
    return null;
}

export async function pickDirectory() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const db = await getDB();
        await db.put(STORE_NAME, handle, 'papers-dir');
        return handle;
    } catch (e) {
        console.error(e);
        return null;
    }
}

export async function savePdf(handle, filename, base64Data) {
    if (!handle) return false;
    try {
        const fileHandle = await handle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        
        // Convert base64 to Blob
        const byteString = atob(base64Data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: 'application/pdf' });
        
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function getPdfUrl(handle, filename) {
    if (!handle) return null;
    try {
        const fileHandle = await handle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return URL.createObjectURL(file);
    } catch (e) {
        console.error("PDF not found locally", e);
        return null;
    }
}
