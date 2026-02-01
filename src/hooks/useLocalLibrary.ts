import { Store } from '@tauri-apps/plugin-store';
import { useEffect, useState, useCallback } from 'react';

interface MangaStatus {
    mangaId: string;
    chapterId: string;
    isRead: boolean;
    lastReadAt?: number;
}

const STORE_PATH = 'manga_library_status.json';

export const useLocalLibrary = () => {
    const [store, setStore] = useState<Store | null>(null);
    const [statusCache, setStatusCache] = useState<Map<string, MangaStatus>>(new Map());

    useEffect(() => {
        const initStore = async () => {
            const newStore = await Store.load(STORE_PATH);
            setStore(newStore);

            // Load existing data
            const entries = await newStore.entries<MangaStatus>();
            const cache = new Map<string, MangaStatus>();
            entries.forEach(([key, value]) => cache.set(key, value));
            setStatusCache(cache);
        };
        initStore();
    }, []);

    const getKey = (mangaId: string, chapterId: string) => `${mangaId}_${chapterId}`;

    const toggleReadStatus = useCallback(async (mangaId: string, chapterId: string) => {
        if (!store) return;

        const key = getKey(mangaId, chapterId);
        const current = statusCache.get(key);
        const newStatus: MangaStatus = {
            mangaId,
            chapterId,
            isRead: !current?.isRead,
            lastReadAt: Date.now()
        };

        await store.set(key, newStatus);
        await store.save();

        setStatusCache(prev => new Map(prev.set(key, newStatus)));
        return newStatus.isRead;
    }, [store, statusCache]);

    const isChapterRead = useCallback((mangaId: string, chapterId: string): boolean => {
        return statusCache.get(getKey(mangaId, chapterId))?.isRead || false;
    }, [statusCache]);

    const getUnreadCount = useCallback((mangaId: string, totalChapters: number): number => {
        let readCount = 0;
        statusCache.forEach((status) => {
            if (status.mangaId === mangaId && status.isRead) {
                readCount++;
            }
        });
        return Math.max(0, totalChapters - readCount);
    }, [statusCache]);

    return { toggleReadStatus, isChapterRead, getUnreadCount, statusCache };
};
