import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState, useRef } from 'react';

// Types matching Rust structs
interface ChapterOverride {
    is_read: boolean;
    toggled_at: number;
    synced_to_anilist: boolean;
}

interface MangaProgressEntry {
    anilist_synced_chapter: number;
    anilist_last_sync: number | null;
    local_overrides: Record<string, ChapterOverride>;
}

interface ChapterStatus {
    is_read: boolean;
    is_local_override: boolean;
}

interface UseMangaProgressOptions {
    anilistProgress?: number;  // Current AniList progress to sync from
    autoInitialize?: boolean;  // Auto-init from AniList on mount
}

/**
 * Hook for managing hybrid manga progress (AniList + local storage)
 * Local status takes priority and can override AniList sync
 */
export function useMangaProgress(mangaId: string, options: UseMangaProgressOptions = {}) {
    const [entry, setEntry] = useState<MangaProgressEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const initRef = useRef(false);

    // Load entry on mount
    const loadEntry = useCallback(async () => {
        try {
            const result = await invoke<string>('get_manga_progress', { mangaId });
            setEntry(JSON.parse(result));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [mangaId]);

    // Initialize from AniList (set sync point, clear local overrides)
    const initializeFromAnilist = useCallback(async (progress: number) => {
        try {
            setLoading(true);
            await invoke('init_manga_from_anilist', { mangaId, progress });
            await loadEntry();
            console.log(`[MangaProgress] Initialized ${mangaId} from AniList with progress ${progress}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        } finally {
            setLoading(false);
        }
    }, [mangaId, loadEntry]);

    // Toggle a single chapter's read status
    const toggleChapterRead = useCallback(async (
        chapterId: string,
        isRead: boolean,
        chapterNumber?: number,
        updateAnilist?: boolean,
        accessToken?: string
    ) => {
        try {
            // Update local storage
            await invoke<string>('toggle_local_chapter', { mangaId, chapterId, isRead });

            // If marking read and chapter is beyond current sync point, optionally update AniList
            if (isRead && updateAnilist && chapterNumber && accessToken && entry) {
                if (chapterNumber > entry.anilist_synced_chapter) {
                    // Update AniList progress (handled externally via AniList API)
                    // Then update our sync point
                    await invoke('update_manga_sync_point', { mangaId, chapterNumber });
                }
            }

            // Reload entry to reflect changes
            await loadEntry();
            console.log(`[MangaProgress] Toggled ${mangaId}/${chapterId} to ${isRead}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    }, [mangaId, entry, loadEntry]);

    // Get chapter status (local override > AniList fallback)
    const getChapterStatus = useCallback(async (
        chapterId: string,
        chapterNumber: number
    ): Promise<ChapterStatus> => {
        try {
            const result = await invoke<string>('get_chapter_read_status', {
                mangaId,
                chapterId,
                chapterNumber
            });
            return JSON.parse(result);
        } catch (err) {
            console.error('[MangaProgress] getChapterStatus error:', err);
            return { is_read: false, is_local_override: false };
        }
    }, [mangaId]);

    // Synchronous check using cached entry (for performance in lists)
    const isChapterRead = useCallback((chapterId: string, chapterNumber: number): boolean => {
        if (!entry) return false;

        // Check local override first
        const override = entry.local_overrides[chapterId];
        if (override !== undefined) {
            return override.is_read;
        }

        // Fall back to AniList sync point
        return chapterNumber <= entry.anilist_synced_chapter;
    }, [entry]);

    // Check if chapter has local override
    const hasLocalOverride = useCallback((chapterId: string): boolean => {
        if (!entry) return false;
        return chapterId in entry.local_overrides;
    }, [entry]);

    // Bulk update chapters
    const bulkUpdateChapters = useCallback(async (
        chapterIds: string[],
        isRead: boolean
    ): Promise<number> => {
        try {
            const count = await invoke<number>('bulk_update_chapters', {
                mangaId,
                chapterIds,
                isRead
            });
            await loadEntry();
            console.log(`[MangaProgress] Bulk updated ${count} chapters to ${isRead}`);
            return count;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    }, [mangaId, loadEntry]);

    // Mark all chapters as read
    const markAllRead = useCallback(async (
        chapterIds: string[],
        maxChapterNumber?: number,
        updateAnilist?: boolean,
        accessToken?: string
    ) => {
        await bulkUpdateChapters(chapterIds, true);

        // If updating AniList and we have a max chapter
        if (updateAnilist && maxChapterNumber && accessToken && entry) {
            if (maxChapterNumber > entry.anilist_synced_chapter) {
                await invoke('update_manga_sync_point', { mangaId, chapterNumber: maxChapterNumber });
            }
        }
    }, [bulkUpdateChapters, mangaId, entry]);

    // Mark all chapters as unread (clear local overrides)
    const markAllUnread = useCallback(async () => {
        try {
            await invoke('clear_manga_overrides', { mangaId });
            await loadEntry();
            console.log(`[MangaProgress] Cleared all overrides for ${mangaId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    }, [mangaId, loadEntry]);

    // Update sync point (after external AniList update)
    const updateSyncPoint = useCallback(async (chapterNumber: number) => {
        try {
            await invoke('update_manga_sync_point', { mangaId, chapterNumber });
            await loadEntry();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    }, [mangaId, loadEntry]);

    // Initial load
    useEffect(() => {
        loadEntry();
    }, [loadEntry]);

    // Auto-initialize from AniList if requested
    useEffect(() => {
        if (
            options.autoInitialize &&
            options.anilistProgress !== undefined &&
            !initRef.current &&
            entry &&
            entry.anilist_synced_chapter === 0
        ) {
            initRef.current = true;
            initializeFromAnilist(options.anilistProgress);
        }
    }, [options.autoInitialize, options.anilistProgress, entry, initializeFromAnilist]);

    return {
        // State
        entry,
        loading,
        error,
        syncPoint: entry?.anilist_synced_chapter ?? 0,
        localOverrides: entry?.local_overrides ?? {},

        // Actions
        initializeFromAnilist,
        toggleChapterRead,
        getChapterStatus,
        isChapterRead,
        hasLocalOverride,
        bulkUpdateChapters,
        markAllRead,
        markAllUnread,
        updateSyncPoint,
        reload: loadEntry,
    };
}

export type { ChapterOverride, MangaProgressEntry, ChapterStatus };
