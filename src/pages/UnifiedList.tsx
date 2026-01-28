import { useState, useEffect, useMemo, forwardRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import AnimeCard from '../components/ui/AnimeCard';
import RefreshButton from '../components/ui/RefreshButton';
import { FilmIcon, BookOpenIcon, SearchIcon } from '../components/ui/Icons';
import { GenreNetworkGraph } from '../components/ui/GenreNetworkGraph';
import { useAuth } from '../hooks/useAuth';
import { USER_ANIME_COLLECTION_QUERY, USER_MANGA_COLLECTION_QUERY } from '../api/anilistClient';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';

// Define status types
type ListStatus = 'All' | 'Current' | 'Completed' | 'Paused' | 'Dropped' | 'Planning';

// Combined Entry Type
interface ListEntry {
    id: number;
    status: string;
    score: number;
    progress: number;
    media: {
        id: number;
        title: {
            english: string;
            romaji: string;
        };
        coverImage: {
            extraLarge: string;
            large: string;
            medium: string;
        };
        episodes?: number;
        chapters?: number;
        status: string;
        genres?: string[];
        averageScore?: number;
        nextAiringEpisode?: {
            episode: number;
            timeUntilAiring: number;
        };
        format?: string;
    };
};


// Stable Virtuoso Components
const GridListContainer = forwardRef(({ style, children, ...props }: any, ref) => (
    <div
        ref={ref}
        {...props}
        style={style}
        // Mobile: 3 columns, tight packing.
        className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-6 pb-20"
    >
        {children}
    </div>
));

const GridItemContainer = forwardRef(({ children, ...props }: any, ref) => (
    <div ref={ref} {...props}>
        {children}
    </div>
));

const ListHeaderContainer = () => (
    <div className="grid grid-cols-[80px_1fr_100px_100px] gap-4 px-6 py-4 text-xs font-bold text-white/40 uppercase tracking-widest border-b border-white/5 mb-4 sticky top-[72px] bg-black/40 backdrop-blur-xl z-20 rounded-xl">
        <div>Image</div>
        <div>Title</div>
        <div>Score</div>
        <div>Progress</div>
    </div>
);

const ListItemContainer = forwardRef(({ style, children, ...props }: any, ref) => (
    <div ref={ref} {...props} style={style} className="flex flex-col gap-3 pb-20">{children}</div>
));

function UnifiedList() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, isAuthenticated } = useAuth();

    // State for list type (Anime vs Manga)
    const [listType, setListType] = useState<'anime' | 'manga'>('anime');

    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'graph'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<ListStatus>('All');

    // Initial load from URL
    useEffect(() => {
        const type = searchParams.get('type') as 'anime' | 'manga';
        if (type === 'anime' || type === 'manga') {
            setListType(type);
        }
    }, []);

    // Update URL when type changes
    useEffect(() => {
        const params = new URLSearchParams(searchParams);
        params.set('type', listType);
        setSearchParams(params, { replace: true });
    }, [listType]);


    // Queries
    const { data: animeData, loading: animeLoading, refetch: refetchAnime } = useQuery(USER_ANIME_COLLECTION_QUERY, {
        variables: { userId: user?.id },
        skip: !user?.id || listType !== 'anime',
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'cache-first',
    });

    const { data: mangaData, loading: mangaLoading, refetch: refetchManga } = useQuery(USER_MANGA_COLLECTION_QUERY, {
        variables: { userId: user?.id },
        skip: !user?.id || listType !== 'manga',
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'cache-first',
    });

    // Determine current data
    const currentData = listType === 'anime' ? animeData : mangaData;
    const currentLoading = listType === 'anime' ? animeLoading : mangaLoading;
    const currentRefetch = listType === 'anime' ? refetchAnime : refetchManga;


    const fullList = useMemo(() => {
        if (isAuthenticated && currentData?.MediaListCollection?.lists) {
            const lists = currentData.MediaListCollection.lists;
            const allEntries = lists.flatMap((list: any) => list.entries);

            const uniqueEntriesMap = new Map();
            allEntries.forEach((entry: any) => {
                if (!uniqueEntriesMap.has(entry.id)) {
                    uniqueEntriesMap.set(entry.id, entry);
                }
            });
            return Array.from(uniqueEntriesMap.values()) as ListEntry[];
        }
        return [];
    }, [isAuthenticated, currentData]);


    // Filter logic
    const filteredList = useMemo(() => {
        let result = fullList;

        // 1. Filter by Status
        if (selectedStatus !== 'All') {
            const statusMap: Record<string, string> = {
                'Current': 'CURRENT', // Watching/Reading
                'Completed': 'COMPLETED',
                'Paused': 'PAUSED',
                'Dropped': 'DROPPED',
                'Planning': 'PLANNING'
            };

            const target = statusMap[selectedStatus];

            if (selectedStatus === 'Current') {
                result = result.filter(entry => entry.status === 'CURRENT' || entry.status === 'REPEATING');
            } else {
                result = result.filter(entry => entry.status === target);
            }
        }

        // 2. Filter by Search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(entry =>
                (entry.media.title.english && entry.media.title.english.toLowerCase().includes(query)) ||
                (entry.media.title.romaji && entry.media.title.romaji.toLowerCase().includes(query))
            );
        }

        return result;
    }, [fullList, selectedStatus, searchQuery]);


    const handleItemClick = (id: string | number) => {
        const numericId = typeof id === 'string' ? parseInt(id) : id;
        if (isNaN(numericId)) return; // Ignore genre cluster clicks for now

        if (listType === 'anime') {
            navigate(`/anime/${numericId}`);
        } else {
            navigate(`/manga-details/${numericId}`);
        }
    };



    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary">
                <h2 className="text-2xl font-bold text-white mb-4">Please Login</h2>
                <p>Log in with your AniList account to view your list.</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto pb-10 px-2 sm:px-6 min-h-screen">
            {/* New Control Center Design */}
            <div className="mx-auto w-full max-w-[950px] mb-8">
                {/* Header Section */}
                <div className="space-y-5 mt-1">
                    {/* Glassmorphic Search Bar */}
                    <div className="relative w-full group">
                        <label className="flex flex-col w-full">
                            <div
                                className="flex w-full h-12 items-center rounded-full bg-[#1a1022]/60 backdrop-blur-xl px-4 gap-3 transition-all duration-300"
                            >
                                <SearchIcon size={20} className="text-white/50" />
                                <input
                                    className="flex w-full min-w-0 flex-1 bg-transparent border-none focus:ring-0 text-white placeholder:text-white/40 p-0 text-base font-medium outline-none"
                                    placeholder={`Search your ${listType} library...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </label>
                    </div>

                    <div className="relative">
                        <div className="flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mask-linear-fade">
                            {/* Active State: Defined by selectedStatus */}
                            {(['All', 'Current', 'Completed', 'Paused', 'Dropped', 'Planning'] as ListStatus[]).map((status) => {
                                let displayLabel: string = status;
                                if (status === 'Current') displayLabel = listType === 'anime' ? 'Watching' : 'Reading';
                                const isActive = selectedStatus === status;

                                return (
                                    <button
                                        key={status}
                                        onClick={() => setSelectedStatus(status)}
                                        className={`flex h-10 shrink-0 items-center justify-center px-6 rounded-full text-sm font-semibold transition-all duration-300 ${isActive
                                            ? 'bg-[#9213ec] text-white shadow-[0_0_15px_rgba(146,19,236,0.5)]'
                                            : 'bg-[#1a1022]/60 backdrop-blur-md text-white/70 hover:text-white border border-white/5 hover:bg-white/10'
                                            }`}
                                    >
                                        {displayLabel}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Integration of View Mode Toggles into the new design? 
                    The user design didn't explicitly show them, but we might want them. 
                    For now, I'll place them discreetly to the right or omit if following strict "replace" instructions.
                    I'll add them as a small row below or integrated. 
                    Let's keep them separate for now as the user didn't ask for them in the "above" HTML.
                */}
            </div>

            {/* Type Toggle - Sliding Pill */}
            <div className="flex justify-center mb-8">
                <div
                    onClick={() => setListType(prev => prev === 'anime' ? 'manga' : 'anime')}
                    className="relative w-52 h-12 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl cursor-pointer select-none group"
                >
                    {/* Background Labels */}
                    <div className="absolute inset-0 flex justify-between items-center px-6 text-xs font-bold text-white/20" style={{ fontFamily: 'var(--font-rounded)' }}>
                        <span className={`transition-opacity duration-300 ${listType === 'anime' ? 'opacity-0' : 'opacity-100'}`}>ANIME</span>
                        <span className={`transition-opacity duration-300 ${listType === 'manga' ? 'opacity-0' : 'opacity-100'}`}>MANGA</span>
                    </div>

                    {/* The Sliding Toggle - Translucent Fill & Colored Outline */}
                    <div
                        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full flex items-center justify-center gap-2 shadow-lg backdrop-blur-md transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) border ${listType === 'anime'
                            ? 'left-1 bg-[rgba(var(--theme-accent-primary-rgb),0.1)] border-[var(--theme-accent-primary)] text-[var(--theme-accent-primary)] shadow-[0_0_15px_rgba(var(--theme-accent-primary-rgb),0.3)]'
                            : 'left-[calc(50%+0px)] bg-[rgba(var(--theme-accent-success-rgb),0.1)] border-[var(--theme-accent-success)] text-[var(--theme-accent-success)] shadow-[0_0_15px_rgba(var(--theme-accent-success-rgb),0.3)]'
                            }`}
                    >
                        <div className={`transition-all duration-300 ${listType === 'anime' ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-90 absolute'}`}>
                            <FilmIcon size={20} className="currentColor" />
                        </div>
                        <div className={`transition-all duration-300 ${listType === 'manga' ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90 absolute'}`}>
                            <BookOpenIcon size={20} className="currentColor" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Content */}
            {currentLoading && !fullList.length ? (
                <div className="flex items-center justify-center h-40 text-text-secondary">
                    <div className="animate-pulse">Loading...</div>
                </div>
            ) : filteredList.length > 0 ? (
                viewMode === 'graph' ? (
                    // Graph View - Fills the content area
                    <div
                        className="w-full relative -mx-6"
                        style={{ height: 'calc(100vh - 200px)', minHeight: '400px' }}
                    >
                        <GenreNetworkGraph
                            entries={filteredList}
                            onNodeClick={handleItemClick}
                            type={listType}
                        />
                    </div>
                ) : viewMode === 'grid' ? (
                    <VirtuosoGrid
                        customScrollParent={document.getElementById('main-scroll-container') as HTMLElement}
                        data={filteredList}
                        totalCount={filteredList.length}
                        overscan={200}
                        components={{
                            List: GridListContainer,
                            Item: GridItemContainer
                        }}
                        itemContent={(_index, entry) => (
                            <AnimeCard
                                key={entry.id}
                                anime={{
                                    ...entry.media,
                                    episodes: listType === 'anime' ? entry.media.episodes : entry.media.chapters
                                } as any}
                                progress={entry.progress}
                                onClick={() => handleItemClick(entry.media.id)}
                            />
                        )}
                    />
                ) : (
                    // List View
                    <Virtuoso
                        customScrollParent={document.getElementById('main-scroll-container') as HTMLElement}
                        data={filteredList}
                        totalCount={filteredList.length}
                        overscan={200}
                        components={{
                            Header: ListHeaderContainer,
                            List: ListItemContainer
                        }}
                        itemContent={(_index, entry) => (
                            <div
                                onClick={() => handleItemClick(entry.media.id)}
                                className="glass-panel grid grid-cols-[80px_1fr_100px_100px] gap-4 items-center p-4 rounded-2xl hover:bg-white/10 cursor-pointer transition-all duration-300 group border border-white/5 hover:border-white/20 hover:shadow-lg hover:shadow-purple-500/10"
                                style={{
                                    background: 'rgba(20, 20, 25, 0.4)',
                                    backdropFilter: 'blur(8px)'
                                }}
                            >
                                <div className="w-12 h-16 rounded-lg overflow-hidden relative shadow-md">
                                    <img
                                        src={entry.media.coverImage.medium}
                                        alt={entry.media.title.english || entry.media.title.romaji}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                </div>
                                <div className="font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-2" style={{ fontFamily: 'var(--font-rounded)' }}>
                                    {entry.media.title.english || entry.media.title.romaji}
                                </div>
                                <div className="text-sm font-mono">
                                    <span className={`font-bold ${entry.score >= 80 ? 'text-green-400' : 'text-white/60'}`}>
                                        {entry.score > 0 ? `${entry.score}%` : '-'}
                                    </span>
                                </div>
                                <div className="text-sm text-white/60 font-medium">
                                    <span className="text-white">{entry.progress}</span>
                                    <span className="opacity-40"> / {listType === 'anime' ? (entry.media.episodes || '?') : (entry.media.chapters || '?')}</span>
                                </div>
                            </div>
                        )}
                    />
                )
            ) : (
                <div className="text-center text-text-secondary py-20">
                    No {listType} found in this category.
                </div>
            )}
        </div>
    );
}

export default UnifiedList;
