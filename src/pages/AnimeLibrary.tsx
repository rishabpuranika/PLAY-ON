import { useState, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { motion } from 'motion/react';
import { USER_ANIME_COLLECTION_QUERY } from '../api/anilistClient';
import { useAuth } from '../hooks/useAuth';
import { SearchIcon } from '../components/ui/Icons';
import { useNavigate } from 'react-router-dom';
import { useLibrarySettings } from '../context/LibrarySettingsContext';
import LibraryFilterSheet from '../components/library/LibraryFilterSheet';

interface AnimeLibraryEntry {
    id: number;
    status: string;
    progress: number;
    updatedAt?: number;
    createdAt?: number;
    media: {
        id: number;
        title: {
            english: string;
            romaji: string;
        };
        coverImage: {
            large: string;
            medium: string;
        };
        format: string;
        episodes: number;
        averageScore?: number;
        startDate?: {
            year: number;
            month: number;
            day: number;
        };
    };
}

interface AnimeLibraryList {
    name: string;
    entries: AnimeLibraryEntry[];
}

export default function AnimeLibrary() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { settings } = useLibrarySettings();
    const [activeTab, setActiveTab] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

    const { data, loading, error, refetch } = useQuery(USER_ANIME_COLLECTION_QUERY, {
        variables: { userId: user?.id },
        skip: !user?.id,
        fetchPolicy: 'cache-first',
    });

    // Process lists and default active tab
    const lists: AnimeLibraryList[] = useMemo(() => {
        if (!data?.MediaListCollection?.lists) return [];
        return data.MediaListCollection.lists;
    }, [data]);

    // Set default active tab once data loads
    useMemo(() => {
        if (lists.length > 0 && !activeTab) {
            // Prefer "Watching" or first available
            const watching = lists.find(l => l.name === 'Watching' || l.name === 'Current');
            setActiveTab(watching ? watching.name : lists[0].name);
        }
    }, [lists, activeTab]);

    const filteredAndSortedEntries = useMemo(() => {
        const list = lists.find(l => l.name === activeTab);
        if (!list) return [];

        let entries = [...list.entries];

        // 1. Filter by Search Query
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            entries = entries.filter(e =>
                (e.media.title.english?.toLowerCase().includes(lowerQuery)) ||
                (e.media.title.romaji?.toLowerCase().includes(lowerQuery))
            );
        }

        // 2. Apply Library Filters
        if (settings.filter.unread) {
            entries = entries.filter(e => {
                const total = e.media.episodes || 0;
                return total > 0 && e.progress < total;
            });
        }
        if (settings.filter.started) {
            entries = entries.filter(e => e.progress > 0);
        }
        if (settings.filter.completed) {
            entries = entries.filter(e => e.status === 'COMPLETED');
        }

        // 3. Apply Sorting
        entries.sort((a, b) => {
            let valA, valB;

            switch (settings.sort.option) {
                case 'Alphabetically':
                    valA = a.media.title.english || a.media.title.romaji;
                    valB = b.media.title.english || b.media.title.romaji;
                    // String comparison
                    return settings.sort.direction === 'asc'
                        ? String(valA).localeCompare(String(valB))
                        : String(valB).localeCompare(String(valA));

                case 'Last Read':
                    valA = a.updatedAt || 0;
                    valB = b.updatedAt || 0;
                    break;

                case 'Date Added':
                    valA = a.createdAt || 0;
                    valB = b.createdAt || 0;
                    break;

                case 'Score':
                    valA = a.media.averageScore || 0;
                    valB = b.media.averageScore || 0;
                    break;

                default:
                    valA = 0; valB = 0;
            }

            // Numeric comparison for rest
            if (valA < valB) return settings.sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return settings.sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return entries;

    }, [lists, activeTab, searchQuery, settings.filter, settings.sort]);

    const totalCount = useMemo(() => lists.reduce((acc, l) => acc + l.entries.length, 0), [lists]);

    // Grid Columns Calculation based on settings
    const gridColsClass = useMemo(() => {
        return `grid gap-3`;
    }, []);

    if (!user) return <div className="p-10 text-center text-white/50">Please login to view library.</div>;
    if (loading && !data) return <div className="p-10 text-center text-white/50">Loading library...</div>;
    if (error) return (
        <div className="flex flex-col items-center justify-center p-10 h-full text-center">
            <div className="text-red-400 mb-4">Error loading library</div>
            <div className="text-xs text-white/50 mb-6 max-w-xs break-words">{error.message}</div>
            <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm transition-colors"
            >
                Retry
            </button>
        </div>
    );

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
                                onClick={() => setIsSearchOpen(true)}
                                className="text-white/70 hover:text-white transition-colors"
                            >
                                <SearchIcon size={22} />
                            </button>

                            <button
                                onClick={() => setIsFilterSheetOpen(true)}
                                className={`transition-colors ${'text-white/70 hover:text-white'
                                    }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                            </button>


                        </div>
                    </>
                )}
            </header>

            {/* Tabs */}
            {settings.display.showTabs && (
                <div className="bg-[#1a1a1a] border-b border-white/5">
                    <div className="flex overflow-x-auto scrollbar-hide px-2">
                        {lists.map(list => (
                            <button
                                key={list.name}
                                onClick={() => setActiveTab(list.name)}
                                className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === list.name ? 'text-[#9213ec]' : 'text-white/60 hover:text-white/90'
                                    }`}
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    {list.name}
                                    <span className={`text-xs ${activeTab === list.name ? 'opacity-100' : 'opacity-50'}`}>
                                        {list.entries.length}
                                    </span>
                                </span>
                                {activeTab === list.name && (
                                    <motion.div
                                        layoutId="activeTabIndicatorAnime"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9213ec]"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Content Grid */}
            <div className="flex-1 overflow-y-auto p-3">
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
                            onClick={() => navigate(`/anime/${entry.media.id}`)}
                        >
                            <div className={`${settings.display.mode === 'List' ? 'w-16 h-24' : 'aspect-[2/3]'} rounded overflow-hidden bg-white/5 relative flex-shrink-0`}>
                                <img
                                    src={entry.media.coverImage.large}
                                    alt={entry.media.title.english || entry.media.title.romaji}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    loading="lazy"
                                />
                                {settings.display.mode !== 'List' && (
                                    <>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                        {settings.display.showBadges.local && (
                                            <div className="absolute bottom-1 right-1 bg-[#000000]/80 text-[#9213ec] text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                                                {entry.media.format || 'TV'}
                                            </div>
                                        )}
                                        {settings.display.showBadges.unread && entry.progress > 0 && (
                                            <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                                Ep. {entry.progress}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Title/Details */}
                            <div className={`${settings.display.mode === 'List' ? 'flex flex-col justify-center' : 'mt-1.5'}`}>
                                <h3 className={`text-xs font-medium leading-tight text-white/90 ${settings.display.mode === 'List' ? 'text-sm' : 'line-clamp-2'}`}>
                                    {entry.media.title.english || entry.media.title.romaji}
                                </h3>
                                {settings.display.mode === 'List' && (
                                    <div className="text-xs text-white/50 mt-1">
                                        {entry.media.format} • Ep. {entry.progress}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <LibraryFilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
            />
        </div>
    );
}
