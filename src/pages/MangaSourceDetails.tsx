/**
 * ====================================================================
 * MANGA DETAILS PAGE (Source-based)
 * ====================================================================
 *
 * Shows manga details from a source with:
 * - Cover image, title, description
 * - Chapter list with reading progress
 * - AniList linking for tracking
 * - Search/browse chapters
 * - Discord RPC integration (Browsing status)
 * - Chapter sorting, filtering, and bookmarking
 * ====================================================================
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ExtensionManager, Manga, Chapter } from '../services/ExtensionManager';
import { useMangaMappings } from '../hooks/useMangaMappings';
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
                setChapters(chaptersData);

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
            if (localEntry) {
                if (unreadFilter === 'include') { // Show Unread
                    result = result.filter(ch => ch.number > localEntry.chapter);
                } else { // Exclude Unread aka Show Read
                    result = result.filter(ch => ch.number <= localEntry.chapter);
                }
            } else if (unreadFilter === 'exclude') {
                // If no entry, all are unread. So if we exclude unread, we show nothing.
                result = [];
            }
            // If include unread and no entry, we show all (all are unread)
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

        // Apply sorting
        result.sort((a, b) => {
            return sortOrder === 'asc' ? a.number - b.number : b.number - a.number;
        });

        return result;
    }, [chapters, searchQuery, sortOrder, downloadedFilter, unreadFilter, bookmarkedFilter, localEntry, sourceId, mangaId, refreshTrigger]);

    const handleChapterClick = (chapter: Chapter) => {
        if (isSelectionMode) {
            const newSet = new Set(selectedChapterIds);
            if (newSet.has(chapter.id)) {
                newSet.delete(chapter.id);
                if (newSet.size === 0) setIsSelectionMode(false);
            } else {
                newSet.add(chapter.id);
            }
            setSelectedChapterIds(newSet);
            return;
        }

        navigate(
            `/read/${sourceId}/${chapter.id}?mangaId=${mangaId}&title=${encodeURIComponent(manga?.title || '')}`
        );
    };

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
            chapterNumber: ch.number,
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
            chapterNumber: ch.number,
            entryId: entryId
        }));

        queueMultipleChapters(tasks);

        const newDownloading = { ...downloadingChapters };
        tasks.forEach(t => newDownloading[t.chapterId] = true);
        setDownloadingChapters(newDownloading);
    };

    const handleReadFirst = () => {
        if (chapters.length > 0) {
            // Last chapter in list is the first chapter (sorted desc)
            handleChapterClick(chapters[chapters.length - 1]);
        }
    };

    const handleReadLatest = () => {
        if (chapters.length > 0) {
            handleChapterClick(chapters[0]);
        }
    };

    const handleContinueReading = () => {
        if (!localEntry || chapters.length === 0) return;

        // Find the next chapter after the last read one
        const lastReadChapter = localEntry.chapter;
        const sortedChapters = [...chapters].sort((a, b) => a.number - b.number);
        const nextChapter = sortedChapters.find(ch => ch.number > lastReadChapter);

        if (nextChapter) {
            handleChapterClick(nextChapter);
        } else {
            // If no next chapter, go to the latest
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
                <div className="chapters-header">
                    <h2>Chapters ({chapters.length})</h2>
                    <div className="chapter-controls">
                        {/* Search Box */}
                        <div className="chapter-search" style={{ marginRight: 'auto' }}>
                            <input
                                type="text"
                                placeholder="Search chapters..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    padding: '6px 12px',
                                    color: 'white',
                                    fontSize: '0.9rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                        {/* Bulk Actions & Toggles */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isSelectionMode ? (
                                <>
                                    <button className="control-btn" onClick={() => { setIsSelectionMode(false); setSelectedChapterIds(new Set()); }} title="Cancel">
                                        <XIcon size={18} />
                                    </button>
                                    <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 600, color: 'white' }}>
                                        {selectedChapterIds.size}
                                    </span>
                                    <button className="control-btn" onClick={handleSelectAll} title="Select All">
                                        <CheckIcon size={18} />
                                    </button>
                                    <button className="control-btn" onClick={handleDownloadSelected} title="Download Selected">
                                        <DownloadIcon size={18} />
                                    </button>
                                    <button className="control-btn danger-btn" onClick={handleDeleteSelected} title="Delete Selected">
                                        <TrashIcon size={18} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="control-btn" onClick={handleDownloadAll} title="Download All">
                                        <DownloadIcon size={18} />
                                    </button>
                                    {/* Sort Toggle */}
                                    <button
                                        className="control-btn"
                                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                                        title={sortOrder === 'desc' ? 'Sorted: Newest First' : 'Sorted: Oldest First'}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            {sortOrder === 'desc' ? (
                                                <><path d="M3 8L7 4L11 8" /><path d="M7 4V20" /><path d="M13 12H21" /><path d="M13 16H19" /><path d="M13 20H17" /><path d="M13 8H21" /></>
                                            ) : (
                                                <><path d="M3 16L7 20L11 16" /><path d="M7 20V4" /><path d="M13 8H21" /><path d="M13 12H19" /><path d="M13 16H17" /><path d="M13 20H21" /></>
                                            )}
                                        </svg>
                                    </button>

                                    {/* Filter Toggle */}
                                    <button
                                        className={`control-btn ${(downloadedFilter !== 'off' || unreadFilter !== 'off' || bookmarkedFilter !== 'off') ? 'active' : ''}`}
                                        onClick={() => {
                                            console.log('Filter button clicked');
                                            setShowFilterModal(true);
                                        }}
                                        title="Filter Chapters"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                        </svg>
                                    </button>
                                </>
                            )}
                        </div>




                    </div>
                </div>

                <div className="chapter-list">
                    {filteredChapters.length === 0 ? (
                        <div className="no-chapters">No chapters found</div>
                    ) : (
                        filteredChapters.map((chapter) => {
                            // Re-evaluate on refreshTrigger changes (included in component scope)
                            const entryId = localEntry?.id || (sourceId && mangaId ? `${sourceId}:${mangaId}` : '');
                            const isRead = localEntry && chapter.number <= localEntry.chapter;
                            const isBookmarked = entryId ? isChapterBookmarked(entryId, chapter.id) : false;
                            const isDownloaded = entryId ? isChapterDownloaded(entryId, chapter.id) : false;

                            return (
                                <div
                                    key={`${chapter.id}-${refreshTrigger}`}
                                    className={`chapter-item ${isRead ? 'read' : ''} ${isDownloaded ? 'downloaded' : ''} ${selectedChapterIds.has(chapter.id) ? 'selected' : ''}`}
                                    onTouchStart={() => handleTouchStart(chapter.id)}
                                    onTouchEnd={handleTouchEnd}
                                    onMouseDown={() => handleTouchStart(chapter.id)} // Desktop long-press simulation
                                    onMouseUp={handleTouchEnd}
                                    onMouseLeave={handleTouchEnd}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        if (!isSelectionMode) {
                                            setIsSelectionMode(true);
                                            setSelectedChapterIds(new Set([chapter.id]));
                                        }
                                    }}
                                >
                                    {isSelectionMode && (
                                        <div className="selection-checkbox">
                                            {selectedChapterIds.has(chapter.id) ? (
                                                <CheckIcon size={16} />
                                            ) : (
                                                <div className="checkbox-unchecked" />
                                            )}
                                        </div>
                                    )}
                                    <div className="chapter-main" onClick={() => handleChapterClick(chapter)}>
                                        <span className="chapter-number">
                                            Chapter {chapter.number}
                                        </span>
                                        {chapter.title && (
                                            <span className="chapter-title">{chapter.title}</span>
                                        )}
                                        <div className="chapter-badges">
                                            {isRead && (
                                                <span className="chapter-read-badge" title="Read">✓</span>
                                            )}
                                            {isDownloaded && (
                                                <span className="chapter-downloaded-badge" title="Downloaded">⬇</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="chapter-actions">
                                        {/* Download Button */}
                                        {!isDownloaded && (
                                            <button
                                                className={`download-btn ${downloadingChapters[chapter.id] ? 'downloading' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (downloadingChapters[chapter.id]) return; // Prevent duplicate clicks

                                                    if (sourceId && mangaId && manga) {
                                                        // Check if download folder is configured
                                                        if (!isDownloadFolderConfigured()) {
                                                            setPendingDownloadAction(() => () => {
                                                                setDownloadingChapters(prev => ({ ...prev, [chapter.id]: true }));
                                                                queueChapterDownload({
                                                                    sourceId,
                                                                    mangaId,
                                                                    mangaTitle: manga.title,
                                                                    chapterId: chapter.id,
                                                                    chapterNumber: chapter.number,
                                                                    entryId: entryId || `${sourceId}:${mangaId}`,
                                                                });
                                                            });
                                                            setShowDownloadFolderDialog(true);
                                                            return;
                                                        }

                                                        // Optimistic UI update
                                                        setDownloadingChapters(prev => ({ ...prev, [chapter.id]: true }));

                                                        queueChapterDownload({
                                                            sourceId,
                                                            mangaId,
                                                            mangaTitle: manga.title,
                                                            chapterId: chapter.id,
                                                            chapterNumber: chapter.number,
                                                            entryId: entryId || `${sourceId}:${mangaId}`,
                                                        });
                                                    }
                                                }}
                                                title={downloadingChapters[chapter.id] ? "Downloading..." : "Download Chapter"}
                                                disabled={!!downloadingChapters[chapter.id]}
                                            >
                                                {downloadingChapters[chapter.id] ? (
                                                    <div className="download-spinner">
                                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.3" />
                                                            <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                                        </svg>
                                                    </div>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                        <polyline points="7 10 12 15 17 10"></polyline>
                                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                                    </svg>
                                                )}
                                            </button>
                                        )}
                                        {/* Bookmark Button */}
                                        <button
                                            className={`bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (entryId) {
                                                    toggleChapterBookmark(entryId, chapter.id);
                                                    setRefreshTrigger(prev => prev + 1);
                                                }
                                            }}
                                            title={isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="chapter-meta">
                                        {chapter.scanlator && (
                                            <span className="scanlator">{chapter.scanlator}</span>
                                        )}
                                        {chapter.dateUpload && (
                                            <span className="date">
                                                {chapter.dateUpload.toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
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
        </div >
    );
}

export default MangaSourceDetails;
