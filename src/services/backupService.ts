/**
 * Backup Service
 * 
 * Handles exporting and importing app data (library, categories, settings).
 * Backup format is a JSON file saved to the downloads folder.
 */

import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

// Storage keys to backup
const BACKUP_KEYS = [
    'playon_manga_db',
    'playon_manga_categories',
    'playon_manga_default_category',
    'playon_anime_db',
    'playon_anime_categories',
    'app-settings',
    'playon_stats',
    'playon_watch_history',
    'manga_mappings'
];

export interface BackupData {
    version: number;
    createdAt: string;
    appVersion: string;
    data: Record<string, unknown>;
}

/**
 * Create a backup of all app data
 */
export async function createBackup(): Promise<string> {
    const backupData: BackupData = {
        version: 1,
        createdAt: new Date().toISOString(),
        appVersion: '1.0.0',
        data: {}
    };

    // Collect all data from localStorage
    for (const key of BACKUP_KEYS) {
        const value = localStorage.getItem(key);
        if (value) {
            try {
                backupData.data[key] = JSON.parse(value);
            } catch {
                backupData.data[key] = value;
            }
        }
    }

    const jsonContent = JSON.stringify(backupData, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultFileName = `playon_backup_${timestamp}.json`;

    // Show save dialog
    const filePath = await save({
        defaultPath: defaultFileName,
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!filePath) {
        throw new Error('Backup cancelled');
    }

    // Write backup file
    await writeTextFile(filePath, jsonContent);

    return filePath;
}

/**
 * Restore data from a backup file
 */
export async function restoreBackup(): Promise<{ restored: number; skipped: number }> {
    // Show open dialog
    const filePath = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false
    });

    if (!filePath || Array.isArray(filePath)) {
        throw new Error('No file selected');
    }

    // Read backup file
    const content = await readTextFile(filePath);
    const backupData: BackupData = JSON.parse(content);

    // Validate backup format
    if (!backupData.version || !backupData.data) {
        throw new Error('Invalid backup file format');
    }

    let restored = 0;
    let skipped = 0;

    // Restore each key
    for (const [key, value] of Object.entries(backupData.data)) {
        if (BACKUP_KEYS.includes(key)) {
            try {
                const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
                localStorage.setItem(key, jsonValue);
                restored++;
            } catch (e) {
                console.error(`Failed to restore ${key}:`, e);
                skipped++;
            }
        } else {
            skipped++;
        }
    }

    return { restored, skipped };
}

/**
 * Get backup info without restoring
 */
export async function getBackupInfo(filePath: string): Promise<BackupData | null> {
    try {
        const content = await readTextFile(filePath);
        return JSON.parse(content);
    } catch {
        return null;
    }
}
