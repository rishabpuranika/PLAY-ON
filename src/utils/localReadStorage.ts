import { BaseDirectory, readTextFile, exists } from '@tauri-apps/plugin-fs';

const FILE_NAME = 'read-status.json';
const LOCAL_STORAGE_KEY = 'playon-local-read-status';

export type ReadStatusMap = {
    [mangaId: string]: {
        [chapterId: string]: boolean;
    };
};

export async function loadReadStatus(): Promise<ReadStatusMap> {
    try {
        // Try file system first
        const fileExists = await exists(FILE_NAME, { baseDir: BaseDirectory.AppLocalData });
        if (fileExists) {
            const content = await readTextFile(FILE_NAME, { baseDir: BaseDirectory.AppLocalData });
            return JSON.parse(content);
        }
    } catch (e) {
        console.warn('[ReadStatus] FS load failed, trying localStorage:', e);
    }

    try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) {
            return JSON.parse(local);
        }
    } catch (e) {
        console.error('[ReadStatus] localStorage load failed:', e);
    }

    return {};
}

export async function saveReadStatus(status: ReadStatusMap): Promise<void> {
    // Save to localStorage (sync fallback works reliably)
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(status));
    } catch (e) {
        console.error('[ReadStatus] localStorage save failed:', e);
    }
}
