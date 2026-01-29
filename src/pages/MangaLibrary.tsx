import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';

import { SearchIcon, RotateCwIcon } from '../components/ui/Icons';
import { useNavigate } from 'react-router-dom';
import { useLibrarySettings } from '../context/LibrarySettingsContext';
import LibraryFilterSheet from '../components/library/LibraryFilterSheet';
import { checkForMangaUpdates } from '../services/NotificationService';
import {
    getLibraryEntries,
    LocalMangaEntry,
    getLibraryCategories,
    LibraryCategory,
    addLibraryCategory,
    deleteLibraryCategory,
    getDefaultCategory
} from '../lib/localMangaDb';

export default function MangaLibrary() {

    const navigate = useNavigate();
    const { settings } = useLibrarySettings();
    const [activeCategoryId, setActiveCategoryId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // Local Data State
    const [entries, setEntries] = useState<LocalMangaEntry[]>([]);
    const [categories, setCategories] = useState<LibraryCategory[]>([]);
    const [loading, setLoading] = useState(true);

    // Add Category State
    const [isAddCatOpen, setIsAddCatOpen] = useState(false);
    const [newCatName, setNewCatName] = useState('');

    const loadData = () => {
        const loadedEntries = getLibraryEntries();
        const loadedCats = getLibraryCategories();
        setEntries(loadedEntries);
        setCategories(loadedCats);
        setLoading(false);

        // Set default active category if not set or invalid
        if (!activeCategoryId || !loadedCats.find(c => c.id === activeCategoryId)) {
            setActiveCategoryId(getDefaultCategory());
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Filtered Entries
    const filteredAndSortedEntries = useMemo(() => {
        let currentEntries = entries.filter(e => {
            const catIds = e.categoryIds || ['default'];
            return catIds.includes(activeCategoryId);
        });

        // 1. Filter by Search Query
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            currentEntries = currentEntries.filter(e =>
                e.title.toLowerCase().includes(lowerQuery)
            );
        }

        // 2. Apply Library Filters
        if (settings.filter.unread) {
            currentEntries = currentEntries.filter(e => {
                const total = e.totalChapters || 0;
                return total > 0 && e.chapter < total;
            });
        }
        if (settings.filter.started) {
            currentEntries = currentEntries.filter(e => e.chapter > 0);
        }
        if (settings.filter.completed) {
            currentEntries = currentEntries.filter(e => e.status === 'completed');
        }

        // 3. Apply Sorting
        currentEntries.sort((a, b) => {
            let valA, valB;

            switch (settings.sort.option) {
                case 'Alphabetically':
                    valA = a.title;
                    valB = b.title;
                    return settings.sort.direction === 'asc'
                        ? String(valA).localeCompare(String(valB))
                        : String(valB).localeCompare(String(valA));

                case 'Last Read':
                    valA = a.lastRead || 0;
                    valB = b.lastRead || 0;
                    break;

                case 'Date Added':
                    // We might not have createdAt in local DB yet, preserve original order or use lastRead fallback?
                    // For now, let's use lastRead as proxy or 0
                    valA = 0;
                    valB = 0;
                    break;

                case 'Score':
                    // Score not currently stored locally
                    valA = 0;
                    valB = 0;
                    break;

                default:
                    valA = 0; valB = 0;
            }

            // Numeric comparison
            if (valA < valB) return settings.sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return settings.sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return currentEntries;

    }, [entries, categories, activeCategoryId, searchQuery, settings.filter, settings.sort]);

    const totalCount = useMemo(() => entries.length, [entries]);

    // Calculate count per category for tabs
    const getCategoryCount = (catId: string) => {
        return entries.filter(e => (e.categoryIds || ['default']).includes(catId)).length;
    };

    const handleAddCategory = () => {
        if (!newCatName.trim()) return;
        try {
            addLibraryCategory(newCatName.trim());
            loadData();
            setNewCatName('');
            setIsAddCatOpen(false);
        } catch (e) {
            alert('Category exists or invalid');
        }
    };

    const handleDeleteCategory = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (id === 'default') return;
        if (confirm('Delete this category? Items will be moved to Default.')) {
            deleteLibraryCategory(id);
            loadData();
        }
    }

    // Grid Columns
    const gridColsClass = `grid gap-3`;

    if (loading) return <div className="p-10 text-center text-white/50">Loading library...</div>;

    return (
        <div className="flex flex-col h-full bg-[#111111] text-white">
            {/* Header */}
            <header className="px-4 py-3 flex items-center justify-between bg-[#1a1a1a] shadow-md z-10 transition-all duration-300">
                {isSearchOpen ? (
                    <div className="flex items-center w-full gap-2">
                        <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-white/70 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <input
                            autoFocus
                            className="bg-transparent border-none outline-none text-white w-full placeholder:text-white/30"
                            placeholder="Search library..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-medium">Library</h1>
                            {settings.display.showCount && (
                                <span className="text-sm text-[#9213ec] font-bold bg-[#9213ec]/10 px-2 py-0.5 rounded-full">
                                    {totalCount}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={async () => {
                                    if (isUpdating) return;
                                    setIsUpdating(true);
                                    try {
                                        await checkForMangaUpdates();
                                        loadData(); // Reload after update check
                                    } finally {
                                        setIsUpdating(false);
                                    }
                                }}
                                disabled={isUpdating}
                                className={`text-white/70 hover:text-white transition-colors ${isUpdating ? 'animate-spin' : ''}`}
                                title="Check for updates"
                            >
                                <RotateCwIcon size={22} />
                            </button>

                            <button
                                onClick={() => setIsSearchOpen(true)}
                                className="text-white/70 hover:text-white transition-colors"
                            >
                                <SearchIcon size={22} />
                            </button>

                            <button
                                onClick={() => setIsFilterSheetOpen(true)}
                                className={`transition-colors text-white/70 hover:text-white`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                            </button>
                        </div>
                    </>
                )}
            </header>

            {/* Category Tabs */}
            {settings.display.showTabs && (
                <div className="bg-[#1a1a1a] border-b border-white/5 flex items-center">
                    <div className="flex overflow-x-auto scrollbar-hide px-2 flex-1">
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategoryId(cat.id)}
                                onContextMenu={(e) => handleDeleteCategory(cat.id, e)}
                                className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${activeCategoryId === cat.id ? 'text-[#9213ec]' : 'text-white/60 hover:text-white/90'
                                    }`}
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    {cat.name}
                                    <span className={`text-xs ${activeCategoryId === cat.id ? 'opacity-100' : 'opacity-50'}`}>
                                        {getCategoryCount(cat.id)}
                                    </span>
                                </span>
                                {activeCategoryId === cat.id && (
                                    <motion.div
                                        layoutId="activeTabIndicator"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9213ec]"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                    {/* Add Category Button using text input when open */}
                    <div className="px-2 border-l border-white/10 flex items-center">
                        {isAddCatOpen ? (
                            <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1">
                                <input
                                    autoFocus
                                    className="bg-transparent border-none outline-none text-white text-sm w-24"
                                    placeholder="New..."
                                    value={newCatName}
                                    onChange={e => setNewCatName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                                    onBlur={() => { if (!newCatName) setIsAddCatOpen(false); }}
                                />
                                <button onClick={handleAddCategory} className="text-[#9213ec] hover:text-[#b04af0]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </button>
                                <button onClick={() => setIsAddCatOpen(false)} className="text-white/40 hover:text-white">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setIsAddCatOpen(true)} className="p-2 text-white/40 hover:text-white" title="Add Category">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Content Grid */}
            <div className="flex-1 overflow-y-auto p-3">
                {filteredAndSortedEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-white/40">
                        <p>No items in this category.</p>
                    </div>
                ) : (
                    <div
                        className={gridColsClass}
                        style={{
                            display: settings.display.mode === 'List' ? 'flex' : 'grid',
                            flexDirection: 'column',
                            gridTemplateColumns: settings.display.mode === 'List'
                                ? '1fr'
                                : `repeat(${settings.display.itemsPerRow}, minmax(0, 1fr))`
                        }}
                    >
                        {filteredAndSortedEntries.map(entry => (
                            <div
                                key={entry.id}
                                className={`relative group cursor-pointer ${settings.display.mode === 'List' ? 'flex gap-3 mb-2' : ''}`}
                                onClick={() => {
                                    if (entry.sourceId && entry.sourceMangaId) {
                                        navigate(`/manga/${entry.sourceId}/${entry.sourceMangaId}`);
                                    } else if (entry.anilistId) {
                                        navigate(`/manga-details/${entry.anilistId}`);
                                    }
                                }}
                            >
                                <div className={`${settings.display.mode === 'List' ? 'w-16 h-24' : 'aspect-[2/3]'} rounded overflow-hidden bg-white/5 relative flex-shrink-0`}>
                                    <img
                                        src={entry.coverImage || ''}
                                        alt={entry.title}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        loading="lazy"
                                    />
                                    {settings.display.mode !== 'List' && (
                                        <>
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                            {settings.display.showBadges.unread && entry.chapter > 0 && (
                                                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                                    Ch. {entry.chapter}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Title/Details */}
                                <div className={`${settings.display.mode === 'List' ? 'flex flex-col justify-center' : 'mt-1.5'}`}>
                                    <h3 className={`text-xs font-medium leading-tight text-white/90 ${settings.display.mode === 'List' ? 'text-sm' : 'line-clamp-2'}`}>
                                        {entry.title}
                                    </h3>
                                    {settings.display.mode === 'List' && (
                                        <div className="text-xs text-white/50 mt-1">
                                            Ch. {entry.chapter}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <LibraryFilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
            />
        </div>
    );
}
