import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { loadReadStatus, saveReadStatus, ReadStatusMap } from '../utils/localReadStorage';

interface MangaContextType {
    localReadStatus: ReadStatusMap;
    toggleLocalReadStatus: (mangaId: string, chapterId: string, isRead: boolean) => void;
    isChapterLocallyRead: (mangaId: string, chapterId: string) => boolean;
}

const MangaContext = createContext<MangaContextType | undefined>(undefined);

export function MangaProvider({ children }: { children: React.ReactNode }) {
    const [localReadStatus, setLocalReadStatus] = useState<ReadStatusMap>({});
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initial Load
    useEffect(() => {
        loadReadStatus().then(setLocalReadStatus);
    }, []);

    const toggleLocalReadStatus = useCallback((mangaId: string, chapterId: string, isRead: boolean) => {
        setLocalReadStatus(prev => {
            const newStatus = { ...prev };
            // Ensure nested objects
            if (!newStatus[mangaId]) {
                newStatus[mangaId] = {};
            }

            // Only update if changed
            if (newStatus[mangaId][chapterId] === isRead) {
                return prev;
            }

            newStatus[mangaId][chapterId] = isRead;

            // Log for debugging
            // console.log(`[MangaContext] Toggled ${mangaId} ch ${chapterId} to ${isRead}`);

            // Debounce Save
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            saveTimeoutRef.current = setTimeout(() => {
                saveReadStatus(newStatus);
            }, 500);

            return newStatus;
        });
    }, []);

    const isChapterLocallyRead = useCallback((mangaId: string, chapterId: string) => {
        return localReadStatus[mangaId]?.[chapterId] ?? false;
    }, [localReadStatus]);

    return (
        <MangaContext.Provider value={{ localReadStatus, toggleLocalReadStatus, isChapterLocallyRead }}>
            {children}
        </MangaContext.Provider>
    );
}

export function useMangaContext() {
    const context = useContext(MangaContext);
    if (context === undefined) {
        throw new Error('useMangaContext must be used within a MangaProvider');
    }
    return context;
}
