import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { ExtensionManager } from './ExtensionManager';
import { getLibraryEntries, updateMangaCache, LocalMangaEntry } from '../lib/localMangaDb';
import { AniListNotification } from '../api/anilistClient';

const LOCAL_NOTIFS_KEY = 'playon_local_notifications';

export interface LocalNotification extends AniListNotification {
    isRead: boolean;
}

export function getLocalNotifications(): LocalNotification[] {
    try {
        const data = localStorage.getItem(LOCAL_NOTIFS_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

export function saveLocalNotifications(notifications: LocalNotification[]) {
    localStorage.setItem(LOCAL_NOTIFS_KEY, JSON.stringify(notifications));
}

export function markLocalNotificationsAsRead() {
    const notifications = getLocalNotifications();
    notifications.forEach(n => n.isRead = true);
    saveLocalNotifications(notifications);
}

function createLocalNotification(entry: LocalMangaEntry, chapterNumber: number): LocalNotification {
    return {
        id: Date.now() + Math.random(), // Pseudo-unique ID
        type: 'MEDIA_DATA_CHANGE',
        createdAt: Math.floor(Date.now() / 1000),
        context: `Chapter ${chapterNumber} is now available!`,
        media: {
            type: 'MANGA',
            id: entry.anilistId || parseInt(entry.id) || 0, // Fallback to 0 if neither (shouldn't happen for valid entries)
            title: {
                english: entry.title,
                romaji: entry.title
            },
            coverImage: {
                medium: entry.coverImage
            }
        },
        user: {
            name: 'System'
        },
        isRead: false
    } as LocalNotification;
}

export const checkForMangaUpdates = async (notify = true): Promise<number> => {
    console.log('[UpdateService] Checking for updates...');

    // Ensure we have permission
    let granted = await isPermissionGranted();
    if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
        if (!granted) {
            console.warn('[UpdateService] Notification permission denied');
            // We can still check and update cache, just not notify
        }
    }

    const library = getLibraryEntries();
    // Filter for entries that have source info
    const sourceEntries = library.filter(e => e.sourceId && e.sourceMangaId);

    if (sourceEntries.length === 0) {
        console.log('[UpdateService] No source-linked manga in library');
        return 0;
    }

    let updatesFound = 0;
    const updates: string[] = [];
    const newLocalNotifications: LocalNotification[] = [];

    // Process in chunks to avoid overwhelming sources/network
    const processEntry = async (entry: LocalMangaEntry) => {
        if (!entry.sourceId || !entry.sourceMangaId) return;

        try {
            const source = ExtensionManager.getSource(entry.sourceId);
            if (!source) return;

            // Fetch latest chapters
            const chapters = await source.getChapters(entry.sourceMangaId);
            if (!chapters || chapters.length === 0) return;

            // Sort descending by number to find latest
            chapters.sort((a, b) => b.number - a.number);
            const latestChapter = chapters[0];

            // Get last known chapter from cache
            // Assuming entry.chapters is also sorted desc, or we rely on chapter number
            const knownChapters = entry.chapters || [];
            const lastKnownChapterNumber = knownChapters.length > 0
                ? Math.max(...knownChapters.map((c: any) => c.number))
                : (entry.chapter || 0);

            // Check if new
            if (latestChapter.number > lastKnownChapterNumber) {
                console.log(`[UpdateService] New chapter for ${entry.title}: Ch ${latestChapter.number}`);
                updatesFound++;
                updates.push(`${entry.title} - Ch. ${latestChapter.number}`);

                // Add to local notifications
                newLocalNotifications.push(createLocalNotification(entry, latestChapter.number));

                // Update cache
                updateMangaCache(entry.id, {
                    chapters: chapters
                });
            }
        } catch (err) {
            console.error(`[UpdateService] Error updating ${entry.title}:`, err);
        }
    };

    // Run in parallel (maybe limit this in future if too many)
    await Promise.all(sourceEntries.map(entry => processEntry(entry)));

    // Save local notifications
    if (newLocalNotifications.length > 0) {
        const currentLocal = getLocalNotifications();
        // Prepend new ones
        const combined = [...newLocalNotifications, ...currentLocal].slice(0, 100); // Keep last 100
        saveLocalNotifications(combined);
    }

    if (updatesFound > 0 && notify && granted) {
        if (updatesFound === 1) {
            sendNotification({
                title: 'New Chapter Available!',
                body: updates[0],
            });
        } else {
            sendNotification({
                title: 'Library Updates',
                body: `${updatesFound} manga have new chapters available.`,
            });
        }
    }

    console.log(`[UpdateService] Update check complete. Found ${updatesFound} updates.`);
    return updatesFound;
};
