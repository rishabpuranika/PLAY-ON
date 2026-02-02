import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ExtensionManager, Manga, Chapter } from '../services/ExtensionManager';
import { useMangaMappings } from '../hooks/useMangaMappings';
import { sortChaptersNumerically, parseChapterNumber } from '../utils/chapterUtils';
import { useSettings } from '../context/SettingsContext';
import {
    getMangaEntryByAnilistId,
    getMangaEntryBySourceId,
    getLibraryCategories,
    addMangaToLibrary,
    removeMangaFromLibrary,
    setMangaCategories,
    getDefaultCategory,
    linkMangaToAniList,
    toggleChapterBookmark,
    isChapterBookmarked,
    isChapterDownloaded,
    updateMangaCache,
    LibraryCategory
} from '../lib/localMangaDb';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { syncMangaFromAniList } from '../lib/syncService';
import { useAuth } from '../hooks/useAuth';
import { useMangaProgress } from '../hooks/useMangaProgress';


import { queueChapterDownload, queueMultipleChapters, onDownloadProgress, isDownloadFolderConfigured, deleteDownloadedChapter } from '../services/downloadService';
import AniListSearchDialog from '../components/ui/AniListSearchDialog';
import ChapterFilterModal, { FilterMode } from '../components/ui/ChapterFilterModal';
import { DownloadFolderDialog } from '../components/ui/DownloadFolderDialog';
import { PlayIcon, CheckIcon, PauseIcon, XIcon, ClipboardIcon, RotateCwIcon, DownloadIcon, TrashIcon } from '../components/ui/Icons';
import RefreshIcon from '../components/ui/refresh-icon';
import { StatusDropdown } from '../components/ui/StatusDropdown';
import { updateMediaStatus } from '../api/anilistClient';
import './MangaSourceDetails.css';

// Status options for AniList (Matching MangaDetails.tsx)
const STATUS_OPTIONS = [
    { value: 'CURRENT', label: 'Reading', icon: <PlayIcon size={16} /> },
    { value: 'COMPLETED', label: 'Completed', icon: <CheckIcon size={16} /> },
    { value: 'PAUSED', label: 'Paused', icon: <PauseIcon size={16} /> },
    { value: 'DROPPED', label: 'Dropped', icon: <XIcon size={16} /> },
    { value: 'PLANNING', label: 'Planning', icon: <ClipboardIcon size={16} /> },
    { value: 'REPEATING', label: 'Rereading', icon: <RotateCwIcon size={16} /> },
];

// ChapterRow component defined BEFORE main component
interface ChapterRowProps {
    chapter: Chapter;
    displayChapter?: Chapter;
    isSelected: boolean;
    isSelectionMode: boolean;
    isRead: boolean;
    isBookmarked: boolean;
    isDownloaded: boolean;
    isDownloading: boolean;
    onToggle: (id: string) => void;
    onPlay: (chapter: Chapter) => void;
    onDownload: (chapter: Chapter) => void;
    onBookmark: (id: string) => void;
    onLongPress: (id: string) => void;
    onCancelLongPress: () => void;
    onTouchEnd: () => void;
    onSwipeToggle: (chapter: Chapter, isRead: boolean) => void;
}

const ChapterRow = memo((props: ChapterRowProps) => {
    const {
        chapter,
        displayChapter,
        isSelected,
        isSelectionMode,
        isRead,
        isBookmarked,
        isDownloaded,
        isDownloading,
        onToggle,
        onPlay,
        onDownload,
        onBookmark,
        onLongPress,
        onCancelLongPress,
        onTouchEnd,
        onSwipeToggle
    } = props;

    // Use displayChapter for visuals if provided, otherwise fallback to actual chapter
    const visualChapter = displayChapter || chapter;

    // Swipe Logic
    const [dragX, setDragX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const hasSwipeActioned = useRef(false);
    const dragXRef = useRef(0); // Use ref for immediate value access

    const handleStart = (clientX: number) => {
        if (isSelectionMode) return; // Disable swipe in selection mode
        startX.current = clientX;
        dragXRef.current = 0;
        setIsDragging(true);
        hasSwipeActioned.current = false;
    };

    const handleMove = (clientX: number) => {
        if (!isDragging || isSelectionMode) return;
        const delta = clientX - startX.current;
        // Only allow right swipe (to read/unread)
        if (delta > 0) {
            // Cancel long press if movement detected (prevents selection during swipe)
            if (delta > 10) {
                onCancelLongPress();
            }
            dragXRef.current = delta; // Update ref immediately
            setDragX(delta);
        }
    };

    const handleEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);

        console.log(`[ChapterRow] handleEnd dragX=${dragXRef.current} threshold=75`);

        // Threshold for swipe action - use ref for immediate value
        if (dragXRef.current > 75) {
            console.log(`[ChapterRow] Swipe threshold met, toggling read status`);
            onSwipeToggle(chapter, !isRead);
            hasSwipeActioned.current = true;
        }
        dragXRef.current = 0;
        setDragX(0);
    };

    return (
        <div className="relative overflow-hidden rounded-xl mb-1">
            <div
                className={`absolute inset-0 flex items-center px-4 transition-colors duration-200 ${dragX > 0 ? (isRead ? 'bg-blue-500/20' : 'bg-green-500/20') : 'bg-transparent'
                    }`}
                style={{ opacity: Math.min(dragX / 75, 1) }}
            >
                {isRead ? (
                    <div className="text-blue-400 font-bold text-sm">Mark Unread</div>
                ) : (
                    <div className="text-green-400 font-bold text-sm">Mark Read</div>
                )}
            </div>

            <div
                className={`relative group flex items-center justify-between p-3 transition-transform duration-200 cursor-pointer border border-transparent 
                    ${isSelected ? 'bg-purple-500/10 border-purple-500/30' : 'bg-transparent hover:bg-white/5'}
                    ${isRead ? 'opacity-60' : 'opacity-100'} 
                `}
                style={{ transform: `translateX(${dragX}px)` }}
                onClick={(e) => {
                    if (hasSwipeActioned.current) {
                        e.stopPropagation();
                        hasSwipeActioned.current = false;
                        return;
                    }
                    if (isSelectionMode) {
                        onToggle(chapter.id);
                    } else {
                        onPlay(chapter);
                    }
                }}
                onTouchStart={(e) => {
                    e.stopPropagation(); // Prevent global gesture interference
                    handleStart(e.touches[0].clientX);
                    onLongPress(chapter.id);
                }}
                onTouchMove={(e) => {
                    e.stopPropagation(); // Prevent global gesture interference
                    handleMove(e.touches[0].clientX);
                }}
                onTouchEnd={(e) => {
                    e.stopPropagation(); // Prevent global gesture interference
                    handleEnd();
                    onTouchEnd();
                }}
                // Mouse Events (for testing/desktop)
                onMouseDown={(e) => {
                    if (e.button === 0) {
                        handleStart(e.clientX);
                        onLongPress(chapter.id);
                    }
                }}
                onMouseMove={(e) => {
                    if (e.buttons === 1) handleMove(e.clientX);
                }}
                onMouseUp={() => {
                    handleEnd();
                    onTouchEnd();
                }}
                onMouseLeave={() => {
                    handleEnd();
                    onTouchEnd();
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                }}
            >
                {/* Selection Checkbox */}
                {isSelectionMode && (
                    <div className="mr-3 shrink-0">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-white/30 bg-transparent'}`}>
                            {isSelected && <CheckIcon size={12} />}
                        </div>
                    </div>
                )}

                {/* Chapter Info */}
                <div className="flex-1 min-w-0 pr-4">
                    <div className={`font-medium text-sm truncate mb-0.5 ${isRead ? 'text-white/40' : 'text-white'}`}>
                        Chapter {visualChapter.number}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40 truncate">
                        {visualChapter.dateUpload && <span>{visualChapter.dateUpload.toLocaleDateString()}</span>}
                        {visualChapter.scanlator && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span className="truncate max-w-[120px]">{visualChapter.scanlator}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {isRead && !isSelected && <span className="text-white/20 mr-1" title="Read"><CheckIcon size={16} /></span>}

                    {!isDownloaded ? (
                        <button
                            className={`p-2 rounded-full transition-all active:scale-95 ${isDownloading ? 'text-blue-400' : 'text-white/30 hover:text-white hover:bg-white/10'}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDownload(chapter);
                            }}
                            title="Download"
                        >
                            {isDownloading ? (
                                <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            )}
                        </button>
                    ) : (
                        <span className="p-2 text-blue-400" title="Downloaded">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                            </svg>
                        </span>
                    )}

                    {/* Bookmark */}
                    <button
                        className={`p-2 rounded-full transition-all active:scale-95 ${isBookmarked ? 'text-purple-400' : 'text-white/30 hover:text-white hover:bg-white/10'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onBookmark(chapter.id);
                        }}
                        title="Bookmark"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
});

function MangaSourceDetails() {
    const { sourceId, mangaId } = useParams<{ sourceId: string; mangaId: string }>();
    const navigate = useNavigate();
    const { getMapping, addMapping, removeMapping } = useMangaMappings();
    const { settings } = useSettings();
    const { } = useAuth();

    const [manga, setManga] = useState<Manga | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [showLibraryDialog, setShowLibraryDialog] = useState(false);
    const [libraryCategories, setLibraryCategories] = useState<LibraryCategory[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    // AniList Status State
    const [currentStatus, setCurrentStatus] = useState<string | null>(null);
    const [statusUpdating, setStatusUpdating] = useState(false);

    // Filter Modal State
    const [showFilterModal, setShowFilterModal] = useState(false);

    // Sorting and filtering state
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(settings.defaultChapterSort);

    // Tri-State Filters
    const [downloadedFilter, setDownloadedFilter] = useState<FilterMode>('off');
    const [unreadFilter, setUnreadFilter] = useState<FilterMode>('off');
    const [bookmarkedFilter, setBookmarkedFilter] = useState<FilterMode>('off');

    // Track downloading chapters: chapterId -> boolean
    const [downloadingChapters, setDownloadingChapters] = useState<Record<string, boolean>>({});
    // Show download folder configuration dialog
    const [showDownloadFolderDialog, setShowDownloadFolderDialog] = useState(false);
    // Pending download action to execute after folder is configured
    const [pendingDownloadAction, setPendingDownloadAction] = useState<(() => void) | null>(null);

    // Multi-selection State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
    const longPressTimer = useRef<number | null>(null);

    // Refresh trigger for library status updates
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Auto-exit selection mode when empty
    useEffect(() => {
        if (isSelectionMode && selectedChapterIds.size === 0) {
            setIsSelectionMode(false);
        }
    }, [selectedChapterIds.size, isSelectionMode]);

    const source = useMemo(() => {
        return sourceId ? ExtensionManager.getSource(sourceId) : null;
    }, [sourceId]);

    // Get current AniList mapping
    const anilistMapping = sourceId && mangaId ? getMapping(sourceId, mangaId) : undefined;

    // Get local entry (Linked or Unlinked)
    const localEntry = useMemo(() => {
        // Priority to linked anilist entry
        if (anilistMapping?.anilistId) {
            return getMangaEntryByAnilistId(anilistMapping.anilistId);
        }
        // Fallback to source-based entry (unlinked reading or saved to library)
        if (sourceId && mangaId) {
            return getMangaEntryBySourceId(sourceId, mangaId);
        }
        return null;
    }, [anilistMapping, sourceId, mangaId, refreshTrigger]);

    // Initialize Hybrid Progress Hook AFTER localEntry is defined
    const {
        isChapterRead,
        toggleChapterRead
    } = useMangaProgress(mangaId || '', {
        autoInitialize: true,
        anilistProgress: localEntry?.chapter // Helper to init if entry exists
    });

    const inLibrary = localEntry?.inLibrary ?? false;

    // Listen for download progress to update UI
    useEffect(() => {
        const unsubscribe = onDownloadProgress((chapterId, current, total, status) => {
            if (chapterId) {
                // If starting or in progress
                if (current < total) {
                    setDownloadingChapters(prev => ({ ...prev, [chapterId]: true }));
                }
                // If complete (single chapter or individual update)
                else if (current === total && current > 0) {
                    setDownloadingChapters(prev => {
                        const next = { ...prev };
                        delete next[chapterId];
                        return next;
                    });
                    setRefreshTrigger(prev => prev + 1);
                }
            } else {
                // Bulk download completion (chapterId is null)
                if (status.includes('Downloaded') || status.includes('successfully')) {
                    // Clear all downloading states
                    setDownloadingChapters({});
                    setRefreshTrigger(prev => prev + 1);

                    // Send single summary notification for bulk download
                    sendNotification({
                        title: 'Bulk Download Complete',
                        body: status,
                    });
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // Load initial status (from DB/Mapping)
    useEffect(() => {
        if (localEntry?.anilistId && anilistMapping) {
            // In a perfect world, we'd have status in localEntry, but we might need to fetch it or rely on sync.
            // For now, let's try to sync it if missing, or use what we have.
            // Actually, getMangaEntryByAnilistId might not return AniList specific status (like CURRENT/PLANNING)
            // unless we store it. `localMangaDb` stores `anilistId` and `chapters` (read count) but maybe not `status`.
            // If we look at `syncMangaFromAniList` in `syncService.ts` it might update something.
            //
            // For quick win: We can fetch details from AniList purely for the status if linked.
            // Or better, let's just default to null until synced.
            // If we want to show current status, we might need a separate fetch or extend `localMangaDb` schema.
            //
            // Wait, `syncMangaFromAniList` fetches `MediaListCollection`.
            // Let's assume for now we might need to fetch it to show it correctly in the dropdown.
            // But to save time/complexity, let's leave as null (which shows "Add to List" usually) or try to fetch.
        }
    }, [localEntry, anilistMapping]);

    const handleStatusChange = async (newStatus: string) => {
        if (!anilistMapping?.anilistId || statusUpdating) return;

        setStatusUpdating(true);
        try {
            await updateMediaStatus(anilistMapping.anilistId, newStatus);
            setCurrentStatus(newStatus);
            // Don't strictly need to refresh local DB unless we store status there.
        } catch (err) {
            console.error('Failed to update status:', err);
        } finally {
            setStatusUpdating(false);
        }
    };

    // Load manga details and chapters
    useEffect(() => {
        if (!source || !mangaId) return;

        const loadData = async () => {
            setLoading(true);
            setError(null);

            // 1. Load from cache immediately if available
            if (localEntry) {
                if (localEntry.description || localEntry.chapters) {
                    console.log('[MangaDetails] Loading from cache');
                    setManga({
                        id: mangaId,
                        title: localEntry.title,
                        coverUrl: localEntry.coverImage || '',
                        description: localEntry.description || '',
                        author: localEntry.author || '',
                        genres: localEntry.genres || [],
                        status: 'unknown', // Status might be stale, but better than nothing
                        url: '',
                    });
                    if (localEntry.chapters) {
                        setChapters(localEntry.chapters);
                    }
                    // Don't unset loading yet if we want to try fetching fresh data
                    // But for UX, showing cached data immediately is better.
                    setLoading(false);
                }
            }

            try {
                const [mangaData, chaptersData] = await Promise.all([
                    source.getMangaDetails(mangaId),
                    source.getChapters(mangaId),
                ]);

                setManga(mangaData);
                // CRITICAL FIX: Ensure chapters are stored in ascending numerical order (1, 2, 3...)
                setChapters(sortChaptersNumerically(chaptersData, true));

                // 2. Update Cache
                if (localEntry) {
                    updateMangaCache(localEntry.id, {
                        description: mangaData.description,
                        genres: mangaData.genres,
                        author: mangaData.author,
                        chapters: chaptersData,
                        coverImage: mangaData.coverUrl
                    });
                }
            } catch (err) {
                console.error('Failed to load fresh data:', err);

                // If we have cached data, don't show error page, just show toast/log
                const hasCachedData = localEntry && (localEntry.description || localEntry.chapters);

                if (!hasCachedData) {
                    setError(err instanceof Error ? err.message : 'Failed to load manga');
                } else {
                    // Maybe show a "Offline Mode" toast here?
                    console.log('Using cached data due to error');
                }
            } finally {
                setLoading(false);
            }
        };


        loadData();
    }, [source, mangaId]);

    const filteredChapters = useMemo(() => {
        // Get the entry ID for bookmark/download checks
        const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');

        let result = [...chapters];

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(
                (ch) =>
                    ch.number.toString().includes(query) ||
                    ch.title?.toLowerCase().includes(query) ||
                    ch.scanlator?.toLowerCase().includes(query)
            );
        }

        // --- NEW TRI-STATE FILTERS ---

        // 1. Downloaded Filter
        if (downloadedFilter !== 'off') {
            if (entryId) {
                if (downloadedFilter === 'include') {
                    result = result.filter(ch => isChapterDownloaded(entryId, ch.id));
                } else { // exclude
                    result = result.filter(ch => !isChapterDownloaded(entryId, ch.id));
                }
            } else if (downloadedFilter === 'include') {
                // No entryId logic = no downloads logic = empty if include
                result = [];
            }
            // if exclude and no entryId, we keep all (as they are all not downloaded)
        }

        // 2. Unread Filter (__Read Status__)
        if (unreadFilter !== 'off') {
            if (unreadFilter === 'include') { // Show Unread
                result = result.filter(ch => !isChapterRead(ch.id, parseChapterNumber(ch.number)));
            } else { // Exclude Unread aka Show Read
                result = result.filter(ch => isChapterRead(ch.id, parseChapterNumber(ch.number)));
            }
        }

        // 3. Bookmarked Filter
        if (bookmarkedFilter !== 'off') {
            if (entryId) {
                if (bookmarkedFilter === 'include') {
                    result = result.filter(ch => isChapterBookmarked(entryId, ch.id));
                } else { // exclude
                    result = result.filter(ch => !isChapterBookmarked(entryId, ch.id));
                }
            } else if (bookmarkedFilter === 'include') {
                result = [];
            }
        }

        // Apply sorting (display order based on user preference)
        return sortChaptersNumerically(result, sortOrder === 'asc');
    }, [chapters, searchQuery, sortOrder, downloadedFilter, unreadFilter, bookmarkedFilter, localEntry, sourceId, mangaId, refreshTrigger, isChapterRead]);

    const handleToggleSelection = useCallback((chapterId: string) => {
        setSelectedChapterIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(chapterId)) newSet.delete(chapterId);
            else newSet.add(chapterId);
            return newSet;
        });
    }, []);

    const handleChapterPlay = useCallback((chapter: Chapter) => {
        navigate(
            `/read/${sourceId}/${chapter.id}?mangaId=${mangaId}&title=${encodeURIComponent(manga?.title || '')}`
        );
    }, [navigate, sourceId, mangaId, manga?.title]);

    const handleChapterClick = (chapter: Chapter) => {
        if (isSelectionMode) {
            handleToggleSelection(chapter.id);
            return;
        }
        handleChapterPlay(chapter);
    };

    const handleDownloadChapter = useCallback((chapter: Chapter) => {
        if (downloadingChapters[chapter.id]) return;

        if (sourceId && mangaId && manga) {
            const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');

            if (!isDownloadFolderConfigured()) {
                setPendingDownloadAction(() => () => {
                    setDownloadingChapters(prev => ({ ...prev, [chapter.id]: true }));
                    queueChapterDownload({
                        sourceId, mangaId, mangaTitle: manga.title,
                        chapterId: chapter.id,
                        // CRITICAL FIX: Use parseChapterNumber instead of passing raw string
                        chapterNumber: parseChapterNumber(chapter.number),
                        entryId,
                    });
                });
                setShowDownloadFolderDialog(true);
                return;
            }
            setDownloadingChapters(prev => ({ ...prev, [chapter.id]: true }));
            queueChapterDownload({
                sourceId, mangaId, mangaTitle: manga.title,
                chapterId: chapter.id,
                // CRITICAL FIX: Use parseChapterNumber instead of passing raw string
                chapterNumber: parseChapterNumber(chapter.number),
                entryId,
            });
        }
    }, [downloadingChapters, sourceId, mangaId, manga, localEntry, isDownloadFolderConfigured]);

    const handleToggleBookmark = useCallback((chapterId: string) => {
        const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');
        if (entryId) {
            toggleChapterBookmark(entryId, chapterId);
            setRefreshTrigger(prev => prev + 1);
        }
    }, [localEntry, sourceId, mangaId]);

    // Long Press Handlers
    const handleTouchStart = (chapterId: string) => {
        longPressTimer.current = setTimeout(() => {
            if (!isSelectionMode) {
                setIsSelectionMode(true);
                setSelectedChapterIds(new Set([chapterId]));
                // Vibrate if available
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, 500); // 500ms long press
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleDownloadSelected = () => {
        if (selectedChapterIds.size === 0 || !manga) return;

        if (!isDownloadFolderConfigured()) {
            setPendingDownloadAction(() => () => handleDownloadSelected());
            setShowDownloadFolderDialog(true);
            return;
        }

        const chaptersToDownload = chapters.filter(ch => selectedChapterIds.has(ch.id));
        const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');

        // Filter out already downloaded
        const newDownloads = chaptersToDownload.filter(ch => !isChapterDownloaded(entryId, ch.id));

        const tasks = newDownloads.map(ch => ({
            sourceId: sourceId!,
            mangaId: mangaId!,
            mangaTitle: manga.title,
            chapterId: ch.id,
            chapterNumber: parseChapterNumber(ch.number),
            entryId: entryId
        }));

        if (tasks.length > 0) {
            queueMultipleChapters(tasks);
            // Optimistic update
            const newDownloading = { ...downloadingChapters };
            tasks.forEach(t => newDownloading[t.chapterId] = true);
            setDownloadingChapters(newDownloading);
        }

        // Exit selection mode
        setIsSelectionMode(false);
        setSelectedChapterIds(new Set());
    };

    const handleDeleteSelected = async () => {
        if (selectedChapterIds.size === 0 || !manga) return;

        const confirmDelete = await confirm(`Delete ${selectedChapterIds.size} downloaded chapters?`);
        if (!confirmDelete) return;

        const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');
        const chaptersToDelete = chapters.filter(ch => selectedChapterIds.has(ch.id));

        for (const ch of chaptersToDelete) {
            await deleteDownloadedChapter(manga.title, ch.number, entryId, ch.id);
        }

        // Refresh UI
        setRefreshTrigger(prev => prev + 1);
        setIsSelectionMode(false);
        setSelectedChapterIds(new Set());
    };

    // Mark selected chapters as read
    const handleMarkSelectedRead = async () => {
        if (selectedChapterIds.size === 0) return;

        // Mark all selected as read
        const updates: { id: string, number: number, read: boolean }[] = [];
        chapters.forEach(ch => {
            if (selectedChapterIds.has(ch.id)) {
                updates.push({
                    id: ch.id,
                    number: parseChapterNumber(ch.number),
                    read: true
                });
            }
        });

        // Toggle each chapter (sequential to avoid overwhelming FS/store if parallel, but store is fast)
        for (const up of updates) {
            await toggleChapterRead(up.id, true, up.number);
        }

        setRefreshTrigger(prev => prev + 1);
        setIsSelectionMode(false);
        setSelectedChapterIds(new Set());
    };

    // Mark selected chapters as unread
    const handleMarkSelectedUnread = async () => {
        if (selectedChapterIds.size === 0) return;

        // Mark all selected as unread
        const updates: { id: string, number: number, read: boolean }[] = [];
        chapters.forEach(ch => {
            if (selectedChapterIds.has(ch.id)) {
                updates.push({
                    id: ch.id,
                    number: parseChapterNumber(ch.number),
                    read: false
                });
            }
        });

        for (const up of updates) {
            await toggleChapterRead(up.id, false, up.number);
        }

        setRefreshTrigger(prev => prev + 1);
        setIsSelectionMode(false);
        setSelectedChapterIds(new Set());
    };

    const handleSelectAll = () => {
        const ids = new Set(filteredChapters.map(c => c.id));
        setSelectedChapterIds(ids);
    };

    const handleDownloadAll = () => {
        if (!manga) return;
        // Select all filtered chapters that are not downloaded
        const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');
        const notDownloaded = filteredChapters.filter(ch => !isChapterDownloaded(entryId, ch.id));

        if (notDownloaded.length === 0) return;

        if (!isDownloadFolderConfigured()) {
            setPendingDownloadAction(() => () => handleDownloadAll());
            setShowDownloadFolderDialog(true);
            return;
        }

        const tasks = notDownloaded.map(ch => ({
            sourceId: sourceId!,
            mangaId: mangaId!,
            mangaTitle: manga.title,
            chapterId: ch.id,
            chapterNumber: parseChapterNumber(ch.number),
            entryId: entryId
        }));

        queueMultipleChapters(tasks);

        const newDownloading = { ...downloadingChapters };
        tasks.forEach(t => newDownloading[t.chapterId] = true);
        setDownloadingChapters(newDownloading);
    };

    const handleReadFirst = () => {
        if (chapters.length > 0) {
            // FIXED: Chapters stored ascending (1,2,3...), so first element is Chapter 1
            handleChapterClick(chapters[0]);
        }
    };

    const handleReadLatest = () => {
        if (chapters.length > 0) {
            // FIXED: Last element is the latest chapter
            handleChapterClick(chapters[chapters.length - 1]);
        }
    };

    const handleContinueReading = () => {
        if (!localEntry || chapters.length === 0) return;

        // Find the next chapter numerically (not by array index)
        const lastReadChapter = localEntry.chapter;
        // FIXED: Use parseChapterNumber for proper numeric comparison
        const nextChapter = chapters.find(ch => parseChapterNumber(ch.number) > lastReadChapter);

        if (nextChapter) {
            handleChapterClick(nextChapter);
        } else {
            handleReadLatest();
        }
    };

    const handleToggleLibrary = () => {
        if (!manga) return;
        const cats = getLibraryCategories();
        setLibraryCategories(cats);

        // Determine current selection
        let currentIds: string[] = [getDefaultCategory()];
        if (inLibrary && localEntry?.categoryIds) {
            currentIds = localEntry.categoryIds;
        }
        setSelectedCategories(currentIds);
        setShowLibraryDialog(true);
    };

    const handleLibrarySave = () => {
        if (!manga || !sourceId || !mangaId) return;
        const id = anilistMapping?.anilistId
            ? String(anilistMapping.anilistId)
            : (localEntry?.id ?? `${sourceId}:${mangaId}`);

        // Add to library (or update details)
        addMangaToLibrary(id, {
            title: manga.title,
            coverImage: manga.coverUrl,
            sourceId,
            sourceMangaId: mangaId,
            anilistId: anilistMapping?.anilistId,
            chapters: chapters // Make sure chapters are saved!
        });

        // Set categories
        let cats = selectedCategories;
        if (cats.length === 0) cats = ['default'];
        setMangaCategories(id, cats);

        setRefreshTrigger(prev => prev + 1);
        setShowLibraryDialog(false);
    };

    const handleLibraryRemove = () => {
        if (!localEntry) return;
        removeMangaFromLibrary(localEntry.id);
        setRefreshTrigger(prev => prev + 1);
        setShowLibraryDialog(false);
    };

    const handleAniListLink = async (media: {
        id: number;
        title: string;
        coverImage: string;
        chapters?: number | null;
        volumes?: number | null;
    }) => {
        if (!sourceId || !mangaId || !manga) return;

        addMapping({
            sourceId,
            sourceMangaId: mangaId,
            sourceTitle: manga.title,
            anilistId: media.id,
            anilistTitle: media.title,
            coverImage: media.coverImage,
            totalChapters: media.chapters ?? undefined,
            totalVolumes: media.volumes ?? undefined,
        });

        // Update local DB to link entry
        const linkedEntry = linkMangaToAniList(
            sourceId,
            mangaId,
            media.id,
            manga.title,
            manga.coverUrl,
            media.chapters ?? undefined
        );

        // Pull latest progress from AniList
        await syncMangaFromAniList(linkedEntry);

        setRefreshTrigger(prev => prev + 1);
    };

    const handleRemoveLink = () => {
        if (!sourceId || !mangaId) return;
        removeMapping(sourceId, mangaId);
    };

    if (loading) {
        return (
            <div className="manga-source-details-loading">
                <div className="loader"></div>
                <p>Loading manga...</p>
            </div>
        );
    }

    if (error || !manga) {
        return (
            <div className="manga-source-details-error">
                <h2>Error</h2>
                <p>{error || 'Manga not found'}</p>
                <button onClick={() => navigate(-1)}>Go Back</button>
            </div>
        );
    }

    return (
        <div className="manga-source-details">
            {/* Hero Section */}
            <div className="hero-section">
                <div className="hero-bg" style={{ backgroundImage: `url(${manga.coverUrl})` }} />
                <div className="hero-content">
                    <img src={manga.coverUrl} alt={manga.title} className="cover-image" />
                    <div className="manga-info">
                        <span className="source-badge">
                            {source?.name || 'Unknown Source'}
                        </span>
                        <h1 className="title">{manga.title}</h1>
                        <div className="meta">
                            {manga.author && <span className="author">By {manga.author}</span>}
                            {manga.status && (
                                <span className={`status ${manga.status}`}>
                                    {manga.status.charAt(0).toUpperCase() + manga.status.slice(1)}
                                </span>
                            )}
                        </div>
                        {manga.genres && manga.genres.length > 0 && (
                            <div className="genres">
                                {manga.genres.slice(0, 6).map((genre) => (
                                    <span key={genre} className="genre-tag">
                                        {genre}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* AniList Tracking Section (LocalFolder link style) */}
                        {anilistMapping ? (
                            // Linked state: show status and controls
                            <div className="flex flex-col gap-3 w-full">
                                {/* Link Info Badge */}
                                <div
                                    className="inline-flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 w-full"
                                    style={{ background: 'rgba(180, 162, 246, 0.1)' }}
                                >
                                    {anilistMapping.coverImage && (
                                        <img
                                            src={anilistMapping.coverImage}
                                            alt={anilistMapping.anilistTitle}
                                            className="w-10 h-14 object-cover rounded-lg cursor-pointer shrink-0"
                                            onClick={() => navigate(`/manga-details/${anilistMapping.anilistId}`)}
                                        />
                                    )}
                                    <div
                                        className="flex flex-col cursor-pointer overflow-hidden flex-1"
                                        onClick={() => navigate(`/manga-details/${anilistMapping.anilistId}`)}
                                    >
                                        <span
                                            className="text-xs text-white/40 uppercase tracking-wider truncate"
                                            style={{ fontFamily: 'var(--font-mono)' }}
                                        >
                                            Linked to AniList
                                        </span>
                                        <span
                                            className="text-sm font-semibold text-white truncate"
                                            style={{ fontFamily: 'var(--font-rounded)' }}
                                        >
                                            {anilistMapping.anilistTitle}
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleRemoveLink}
                                        className="px-2 py-1 rounded text-xs transition-all duration-200 hover:bg-red-500/20 text-red-400"
                                        title="Unlink"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                                    </button>
                                </div>

                                {/* Status Dropdown */}
                                <StatusDropdown
                                    currentStatus={currentStatus}
                                    onStatusChange={handleStatusChange}
                                    options={STATUS_OPTIONS}
                                    loading={statusUpdating}
                                />

                                {/* Control Buttons: Save & Sync */}
                                <div className="flex gap-2">
                                    <button
                                        className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${inLibrary ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/5'}`}
                                        onClick={handleToggleLibrary}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={inLibrary ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        {inLibrary ? "Saved" : "Save"}
                                    </button>

                                    <button
                                        className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 bg-white/5 text-white/70 hover:bg-white/10 border border-white/5 flex items-center justify-center gap-2"
                                        onClick={() => {
                                            if (anilistMapping) {
                                                // Trigger manual sync
                                                setRefreshTrigger(prev => prev + 1);
                                                // Optional: You might want to call syncMangaFromAniList explicitly here if needed,
                                                // but linking already does it. This is more for refresh.
                                                // For now, let's assuming linking state is enough or we re-fetch.
                                                // Actually, we should probably re-fetch AniList data.
                                                // But logic for that is tied to 'localEntry' update which happens in useEffect.
                                                // Let's simplified by just refreshing trigger which re-evaluates localEntry components.

                                                // If we want to force re-fetch from network:
                                                const entry = getMangaEntryByAnilistId(anilistMapping.anilistId);
                                                if (entry) syncMangaFromAniList(entry).then(() => setRefreshTrigger(prev => prev + 1));
                                            }
                                        }}
                                    >
                                        <RefreshIcon size={16} />
                                        Sync
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // Not linked: show track button & save button
                            <div className="flex gap-3 justify-center w-full">
                                <button
                                    onClick={() => setShowLinkDialog(true)}
                                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 hover:scale-105"
                                    style={{
                                        fontFamily: 'var(--font-rounded)',
                                        background: 'linear-gradient(135deg, var(--color-zen-accent), #9c7cf0)',
                                        color: 'white',
                                        boxShadow: '0 4px 15px rgba(180, 162, 246, 0.3)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        minWidth: '120px'
                                    }}
                                >
                                    <span>🔗</span>
                                    Track
                                </button>

                                {/* Save Button for unlinked */}
                                <button
                                    className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${inLibrary ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/5'}`}
                                    onClick={handleToggleLibrary}
                                    style={{ minWidth: '100px' }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={inLibrary ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                    {inLibrary ? "Saved" : "Save"}
                                </button>
                            </div>
                        )}

                        <div className="action-buttons">
                            {localEntry && localEntry.chapter > 0 ? (
                                <button className="primary-btn" onClick={handleContinueReading}>
                                    <PlayIcon size={20} fill="currentColor" />
                                    Continue Ch {localEntry.chapter + 1}
                                </button>
                            ) : (
                                <button className="primary-btn" onClick={handleReadFirst}>
                                    <PlayIcon size={20} fill="currentColor" />
                                    Start Reading
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Description */}
            {
                manga.description && (
                    <div className="description-section">
                        <h2>Synopsis</h2>
                        <p>{manga.description}</p>
                    </div>
                )
            }

            {/* Chapters Section */}
            <div className="chapters-section">
                <div className="flex flex-col gap-4 mb-4">
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-xl font-bold text-white">Chapters ({chapters.length})</h2>

                        {/* Standard Controls (When not in selection mode) */}
                        {!isSelectionMode && (
                            <div className="flex items-center gap-1">
                                <button
                                    className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                    onClick={handleDownloadAll}
                                    title="Download All"
                                >
                                    <DownloadIcon size={20} />
                                </button>

                                <button
                                    className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                                    title={sortOrder === 'desc' ? 'Sorted: Newest First' : 'Sorted: Oldest First'}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        {sortOrder === 'desc' ? (
                                            <><path d="M3 8L7 4L11 8" /><path d="M7 4V20" /><path d="M13 12H21" /><path d="M13 16H19" /><path d="M13 20H17" /><path d="M13 8H21" /></>
                                        ) : (
                                            <><path d="M3 16L7 20L11 16" /><path d="M7 20V4" /><path d="M13 8H21" /><path d="M13 12H19" /><path d="M13 16H17" /><path d="M13 20H21" /></>
                                        )}
                                    </svg>
                                </button>

                                <button
                                    className={`p-2 rounded-full transition-colors ${(downloadedFilter !== 'off' || unreadFilter !== 'off' || bookmarkedFilter !== 'off')
                                        ? 'text-purple-400 bg-purple-500/10'
                                        : 'text-white/70 hover:text-white hover:bg-white/10'
                                        }`}
                                    onClick={() => setShowFilterModal(true)}
                                    title="Filter Chapters"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Selection Controls */}
                        {isSelectionMode && (
                            <div className="flex flex-col gap-2 bg-white/5 rounded-xl px-3 py-2 w-full">
                                {/* Top row: Count and Cancel */}
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-white">
                                        {selectedChapterIds.size} Selected
                                    </span>
                                    <button className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10" onClick={() => { setIsSelectionMode(false); setSelectedChapterIds(new Set()); }} title="Cancel">
                                        <XIcon size={18} />
                                    </button>
                                </div>
                                {/* Bottom row: Action buttons */}
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <button className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10" onClick={handleSelectAll} title="Select All">
                                        <CheckIcon size={18} />
                                    </button>
                                    <button className="p-2 rounded-full text-green-400 hover:bg-green-500/10" onClick={handleMarkSelectedRead} title="Mark as Read">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    </button>
                                    <button className="p-2 rounded-full text-orange-400 hover:bg-orange-500/10" onClick={handleMarkSelectedUnread} title="Mark as Unread">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                                            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                                            <line x1="2" y1="2" x2="22" y2="22"></line>
                                        </svg>
                                    </button>
                                    <button className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10" onClick={handleDownloadSelected} title="Download">
                                        <DownloadIcon size={18} />
                                    </button>
                                    <button className="p-2 rounded-full text-red-400 hover:bg-red-500/10" onClick={handleDeleteSelected} title="Delete">
                                        <TrashIcon size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Search Bar - Clean & Simple */}

                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                            </div>
                            <input
                                type="text"
                                placeholder="       Search chapters..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all text-sm"
                            />
                        </div>

                        <button
                            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all shrink-0"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M6 12h12m-9 6h6" />
                            </svg>
                            {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        {filteredChapters.length === 0 ? (
                            <div className="py-12 text-center text-white/30 italic">No chapters found</div>
                        ) : (
                            filteredChapters.map((chapter) => {
                                const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');



                                return (
                                    <ChapterRow
                                        key={chapter.id}
                                        chapter={chapter}


                                        isSelected={selectedChapterIds.has(chapter.id)}
                                        isSelectionMode={isSelectionMode}
                                        isRead={isChapterRead(chapter.id, parseChapterNumber(chapter.number))}
                                        isBookmarked={isChapterBookmarked(entryId, chapter.id)}
                                        isDownloaded={isChapterDownloaded(entryId, chapter.id)}
                                        isDownloading={downloadingChapters[chapter.id] || false}
                                        onToggle={handleToggleSelection}
                                        onPlay={handleChapterClick}
                                        onDownload={handleDownloadChapter}
                                        onBookmark={handleToggleBookmark}
                                        onLongPress={handleTouchStart}
                                        onCancelLongPress={handleTouchEnd}
                                        onTouchEnd={handleTouchEnd}
                                        onSwipeToggle={(ch, newRead) => {
                                            toggleChapterRead(ch.id, newRead, parseChapterNumber(ch.number));
                                        }}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>

                {/* AniList Search Dialog */}
                <AniListSearchDialog
                    isOpen={showLinkDialog}
                    onClose={() => setShowLinkDialog(false)}
                    onSelect={handleAniListLink}
                    initialSearchTerm={manga.title}
                    mediaType="MANGA"
                />

                {/* Library Category Dialog */}
                {
                    showLibraryDialog && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={() => setShowLibraryDialog(false)}>
                            <div
                                className="bg-[#15151e] p-6 rounded-2xl border border-white/10 w-full max-w-[380px] shadow-2xl transform transition-all scale-100"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="text-center mb-6">
                                    <h3 className="text-xl font-bold text-white mb-1">
                                        {inLibrary ? 'Update Library Entry' : 'Add to Library'}
                                    </h3>
                                    <p className="text-sm text-white/40">Select categories for this manga</p>
                                </div>

                                <div className="flex flex-col gap-2 mb-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {libraryCategories.map(cat => {
                                        const isSelected = selectedCategories.includes(cat.id);
                                        return (
                                            <div
                                                key={cat.id}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedCategories(prev => prev.filter(id => id !== cat.id));
                                                    } else {
                                                        setSelectedCategories(prev => [...prev, cat.id]);
                                                    }
                                                }}
                                                className={`group flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-200
                                            ${isSelected
                                                        ? 'bg-[rgba(168,85,247,0.15)] border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                                                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-medium transition-colors ${isSelected ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>
                                                        {cat.name}
                                                    </span>
                                                </div>

                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-200
                                            ${isSelected
                                                        ? 'bg-purple-500 border-purple-500 scale-110'
                                                        : 'border-white/20 group-hover:border-white/40'
                                                    }`}
                                                >
                                                    {isSelected && (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex gap-2 items-center mt-4">
                                    {inLibrary && (
                                        <button
                                            onClick={() => {
                                                if (confirm("Remove from Library?")) {
                                                    handleLibraryRemove();
                                                }
                                            }}
                                            className="p-3 rounded-xl text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                                            title="Remove from Library"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowLibraryDialog(false)}
                                        className="px-4 py-3 rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleLibrarySave}
                                        className="flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 hover:brightness-110"
                                        style={{
                                            background: 'linear-gradient(135deg, var(--color-zen-accent), #9c7cf0)',
                                            boxShadow: '0 4px 15px rgba(168, 85, 247, 0.3)'
                                        }}
                                    >
                                        {inLibrary ? 'Save' : 'Add'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Download Folder Configuration Dialog */}
                <DownloadFolderDialog
                    isOpen={showDownloadFolderDialog}
                    onClose={() => {
                        setShowDownloadFolderDialog(false);
                        setPendingDownloadAction(null);
                    }}
                    onConfigured={() => {
                        // Execute pending action if any
                        if (pendingDownloadAction) {
                            pendingDownloadAction();
                            setPendingDownloadAction(null);
                        }
                    }}
                />

                {/* Filter Modal */}
                <ChapterFilterModal
                    isOpen={showFilterModal}
                    onClose={() => setShowFilterModal(false)}
                    downloadedFilter={downloadedFilter}
                    onDownloadedChange={setDownloadedFilter}
                    unreadFilter={unreadFilter}
                    onUnreadChange={setUnreadFilter}
                    bookmarkedFilter={bookmarkedFilter}
                    onBookmarkedChange={setBookmarkedFilter}
                />
            </div>

            {/* Continue Reading FAB (Mihon-style) */}
            {localEntry && localEntry.chapter > 0 && chapters.length > 0 && (() => {
                const lastReadChapter = localEntry.chapter;
                const nextChapter = chapters.find(ch => parseChapterNumber(ch.number) > lastReadChapter);
                const displayChapter = nextChapter ? parseChapterNumber(nextChapter.number) : chapters[chapters.length - 1] ? parseChapterNumber(chapters[chapters.length - 1].number) : null;

                if (displayChapter === null) return null;

                return (
                    <button
                        className="continue-reading-fab"
                        onClick={handleContinueReading}
                        title={nextChapter ? `Continue to Chapter ${displayChapter}` : 'Resume latest chapter'}
                    >
                        <span className="fab-icon">
                            <PlayIcon size={14} fill="currentColor" />
                        </span>
                        <span className="fab-text">
                            <span className="fab-label">Continue</span>
                            <span className="fab-chapter">Ch. {displayChapter}</span>
                        </span>
                    </button>
                );
            })()}
        </div>
    );
}

export default MangaSourceDetails;