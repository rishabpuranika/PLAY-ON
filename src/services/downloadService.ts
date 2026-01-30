/**
 * Download Service
 * 
 * Handles downloading manga chapters to local storage.
 * Uses Tauri's HTTP plugin to fetch images and stores them in the configured download folder.
 */

import { invoke } from '@tauri-apps/api/core';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { markChapterDownloaded } from '../lib/localMangaDb';
import { ExtensionManager, Page } from './ExtensionManager';

// Download progress callback type
type ProgressCallback = (chapterId: string | null, current: number, total: number, status: string) => void;

// Download state
interface DownloadState {
    isDownloading: boolean;
    queue: DownloadTask[];
    currentTask: DownloadTask | null;
}

interface DownloadTask {
    sourceId: string;
    mangaId: string;
    mangaTitle: string;
    chapterId: string;
    chapterNumber: number;
    entryId: string;
}

// Singleton state
const downloadState: DownloadState = {
    isDownloading: false,
    queue: [],
    currentTask: null,
};

// Bulk download tracking
let bulkDownloadMode = false;
let bulkDownloadTotal = 0;
let bulkDownloadSuccess = 0;
let bulkDownloadFailed = 0;

// Progress listeners
const progressListeners: ProgressCallback[] = [];

/**
 * Check if a download folder is configured in settings
 */
export function isDownloadFolderConfigured(): boolean {
    const settingsJson = localStorage.getItem('app-settings');
    if (!settingsJson) return false;

    try {
        const settings = JSON.parse(settingsJson);
        return !!settings.mangaDownloadPath && settings.mangaDownloadPath.trim() !== '';
    } catch {
        return false;
    }
}

/**
 * Subscribe to download progress updates
 */
export function onDownloadProgress(callback: ProgressCallback): () => void {
    progressListeners.push(callback);
    return () => {
        const index = progressListeners.indexOf(callback);
        if (index > -1) progressListeners.splice(index, 1);
    };
}

/**
 * Get the current download queue
 */
export function getQueue(): DownloadTask[] {
    return [...downloadState.queue];
}

/**
 * Notify all listeners of progress
 */
async function notifyProgress(chapterId: string | null, current: number, total: number, status: string): Promise<void> {
    progressListeners.forEach(cb => cb(chapterId, current, total, status));

    // System Notification Logic
    // User wants notifications for "each and every chapter"
    const shouldNotify =
        status.includes('Starting download') || // Single chapter start
        status.includes('Download complete') || // Single chapter end
        status.includes('Starting bulk') ||
        status.includes('Bulk download complete') ||
        status.startsWith('Error');

    if (shouldNotify) {
        try {
            let permissionGranted = await isPermissionGranted();
            if (!permissionGranted) {
                const permission = await requestPermission();
                permissionGranted = permission === 'granted';
            }

            if (permissionGranted) {
                sendNotification({
                    title: 'Manga Download',
                    body: status,
                });
            }
        } catch (e) {
            console.error('Failed to send notification:', e);
        }
    }
}

/**
 * Get chapter pages from source
 */
async function getChapterPages(sourceId: string, chapterId: string): Promise<Page[]> {
    const source = ExtensionManager.getSource(sourceId);
    if (!source) {
        throw new Error(`Source not found: ${sourceId}`);
    }
    return source.getPages(chapterId);
}

/**
 * Download a single chapter
 */
export async function downloadChapter(
    sourceId: string,
    _mangaId: string,
    mangaTitle: string,
    chapterId: string,
    chapterNumber: number,
    entryId: string,
    onProgress?: (current: number, total: number) => void
): Promise<boolean> {
    try {
        console.log('[DownloadService] Starting download for chapter:', chapterNumber);

        // Get download path from settings
        const settingsJson = localStorage.getItem('app-settings');
        let downloadDir = '';
        if (settingsJson) {
            try {
                const settings = JSON.parse(settingsJson);
                downloadDir = settings.mangaDownloadPath;
            } catch (e) {
                console.error('Failed to parse settings for download path');
            }
        }

        // Fix for mobile where asset:// paths are sometimes stored
        if (downloadDir && downloadDir.startsWith('asset://')) {
            console.warn('[DownloadService] Invalid asset:// path detected, ignoring');
            downloadDir = '';
        }

        if (!downloadDir) {
            console.error('[DownloadService] No download directory configured');
            notifyProgress(chapterId, 0, 0, 'Error: No download folder set');
            return false;
        }

        // Get pages
        const pages = await getChapterPages(sourceId, chapterId);

        if (pages.length === 0) {
            console.warn('[DownloadService] No pages found for chapter:', chapterId);
            return false;
        }

        // Extract URLs
        const urls = pages.map(p => p.imageUrl);

        // Notify start
        if (onProgress) onProgress(0, pages.length);
        notifyProgress(chapterId, 0, pages.length, `Downloading ${pages.length} pages...`);

        // Invoke Rust Backend
        const chapterTitle = `Chapter ${chapterNumber}`; // Simple title for file name

        await invoke('download_chapter_command', {
            chapterTitle,
            mangaTitle,
            urls,
            downloadDir
        });

        // Mark chapter as downloaded in local DB
        // We also store the path potentially? 
        // For now, markChapterDownloaded just adds ID to list
        markChapterDownloaded(entryId, chapterId);

        console.log('[DownloadService] Chapter download complete:', chapterNumber);

        if (onProgress) onProgress(pages.length, pages.length);
        notifyProgress(chapterId, pages.length, pages.length, 'Complete');

        return true;
    } catch (error) {
        console.error('[DownloadService] Error downloading chapter:', error);
        notifyProgress(chapterId, 0, 0, `Error: ${error}`);
        return false;
    }
}

/**
 * Add chapter to download queue
 */
export function queueChapterDownload(task: DownloadTask): void {
    downloadState.queue.push(task);
    console.log('[DownloadService] Added to queue:', task.chapterNumber, 'Queue size:', downloadState.queue.length);

    // Start processing if not already running
    if (!downloadState.isDownloading) {
        processQueue();
    }
}

/**
 * Add multiple chapters to download queue (bulk download)
 * Sends only one notification at start and one at completion
 */
export function queueMultipleChapters(tasks: DownloadTask[]): void {
    // Enable bulk mode
    bulkDownloadMode = true;
    bulkDownloadTotal = tasks.length;
    bulkDownloadSuccess = 0;
    bulkDownloadFailed = 0;

    downloadState.queue.push(...tasks);
    console.log('[DownloadService] Bulk download: Added', tasks.length, 'chapters to queue. Total:', downloadState.queue.length);

    // Notify UI about bulk download start (single notification will be sent from MangaSourceDetails)
    notifyProgress(null, 0, tasks.length, `Starting bulk download of ${tasks.length} chapters...`);

    if (!downloadState.isDownloading) {
        processQueue();
    }
}

/**
 * Process the download queue
 */
async function processQueue(): Promise<void> {
    if (downloadState.isDownloading || downloadState.queue.length === 0) {
        return;
    }

    downloadState.isDownloading = true;
    const isBulk = bulkDownloadMode;

    while (downloadState.queue.length > 0) {
        const task = downloadState.queue.shift()!;
        downloadState.currentTask = task;

        // In bulk mode, only send progress updates (not per-chapter "complete" notifications)
        if (isBulk) {
            const remaining = downloadState.queue.length + 1;
            const completed = bulkDownloadTotal - remaining;
            notifyProgress(task.chapterId, completed, bulkDownloadTotal, `Downloading ${remaining} remaining...`);
        } else {
            notifyProgress(task.chapterId, 0, 1, `Starting Chapter ${task.chapterNumber}`);
        }

        const success = await downloadChapter(
            task.sourceId,
            task.mangaId,
            task.mangaTitle,
            task.chapterId,
            task.chapterNumber,
            task.entryId
        );

        // Track bulk download results
        if (isBulk) {
            if (success) {
                bulkDownloadSuccess++;
            } else {
                bulkDownloadFailed++;
            }
        }
    }

    downloadState.isDownloading = false;
    downloadState.currentTask = null;

    // Send completion notification
    if (isBulk) {
        const statusMessage = bulkDownloadFailed > 0
            ? `Downloaded ${bulkDownloadSuccess}/${bulkDownloadTotal} chapters (${bulkDownloadFailed} failed)`
            : `Downloaded all ${bulkDownloadSuccess} chapters successfully`;

        notifyProgress(null, bulkDownloadTotal, bulkDownloadTotal, statusMessage);
        console.log('[DownloadService] Bulk download complete:', statusMessage);

        // Reset bulk mode
        bulkDownloadMode = false;
        bulkDownloadTotal = 0;
        bulkDownloadSuccess = 0;
        bulkDownloadFailed = 0;
    } else {
        notifyProgress(null, 0, 0, 'Download complete');
        console.log('[DownloadService] Queue processing complete');
    }
}

/**
 * Check if currently downloading
 */
export function isDownloading(): boolean {
    return downloadState.isDownloading;
}

/**
 * Get queue length
 */
export function getQueueLength(): number {
    return downloadState.queue.length;
}

/**
 * Clear download queue
 */
export function clearQueue(): void {
    downloadState.queue = [];
    console.log('[DownloadService] Queue cleared');
}

/**
 * Get current download task
 */
export function getCurrentTask(): DownloadTask | null {
    return downloadState.currentTask;
}


/**
 * Delete a downloaded chapter
 */
export async function deleteDownloadedChapter(
    mangaTitle: string,
    chapterNumber: number,
    entryId: string,
    chapterId: string
): Promise<boolean> {
    try {
        const settingsJson = localStorage.getItem('app-settings');
        if (!settingsJson) return false;

        const settings = JSON.parse(settingsJson);
        const downloadDir = settings.mangaDownloadPath;

        if (!downloadDir) return false;

        // Construct path: downloadDir/Manga Title/Chapter X
        // We need to match the backend logic for naming
        // Ideally we should store the path, but for now we follow the convention
        // Call backend to delete
        // We assume standard naming "Chapter {number}" inside "Manga Title" or similar.
        // We send the raw inputs and let backend construct/sanitize.

        try {
            await invoke('delete_chapter_command', {
                chapterTitle: `Chapter ${chapterNumber}`,
                mangaTitle: mangaTitle,
                downloadDir: downloadDir
            });

            // If backend succeeds, update DB
            // (If it was already deleted, we still remove from DB)
            const { removeChapterDownloaded } = await import('../lib/localMangaDb');
            removeChapterDownloaded(entryId, chapterId);
            return true;
        } catch (backendError) {
            console.error('Backend delete failed:', backendError);
            // If backend fails (e.g. file not found), we might still want to clear from DB?
            // But for now, returning false is safer.
            // Or if error is "Path not found", we should clear DB.
            if (String(backendError).includes('Path not found')) {
                const { removeChapterDownloaded } = await import('../lib/localMangaDb');
                removeChapterDownloaded(entryId, chapterId);
                return true;
            }
            return false;
        }
    } catch (e) {
        console.error('Failed to delete chapter:', e);
        return false;
    }
}
