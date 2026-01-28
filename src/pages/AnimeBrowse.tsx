/**
 * ====================================================================
 * ANIME BROWSE PAGE
 * ====================================================================
 *
 * Browse and search anime from installed extension sources.
 * ====================================================================
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimeExtensionManager, Anime } from '../services/AnimeExtensionManager';
import { SearchIcon } from '../components/ui/Icons';
import { Dropdown } from '../components/ui/Dropdown';
import { useRecentSearches } from '../hooks/useRecentSearches';
import './AnimeBrowse.css';

export default function AnimeBrowse() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Extension browsing state
    const [sources, setSources] = useState<any[]>(() => AnimeExtensionManager.getAllSources());
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const [searchResults, setSearchResults] = useState<Anime[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    // Recent searches
    const { recentSearches, addSearch, removeSearch } = useRecentSearches('recent_anime_searches');

    // Initialize manager and refresh sources
    useEffect(() => {
        const initAndRefresh = async () => {
            if (!AnimeExtensionManager.isInitialized()) {
                await AnimeExtensionManager.initialize();
            }
            refreshSources();
        };

        const refreshSources = () => {
            const newSources = AnimeExtensionManager.getAllSources();
            setSources(newSources);

            // Auto-select first source if none selected
            if (!selectedSourceId && newSources.length > 0) {
                // Pre-select HiAnime if available, otherwise first one
                const hianime = newSources.find(s => s.id === 'hianime');
                setSelectedSourceId(hianime ? hianime.id : newSources[0].id);
            }
        };

        // Initial load
        initAndRefresh();

        // Set up a listener for extension changes (polling for now)
        const interval = setInterval(refreshSources, 2000);
        return () => clearInterval(interval);
    }, [selectedSourceId]);

    // Get selected source object
    const selectedSource = useMemo(() => {
        if (!selectedSourceId) return null;
        return AnimeExtensionManager.getSource(selectedSourceId) || null;
    }, [selectedSourceId, sources]);

    // Auto-search effect when source is ready
    useEffect(() => {
        if (selectedSource && searchQuery && !isSearching) {
            // Case 1: Initial load from URL (hasSearched is false)
            if (!hasSearched && searchParams.get('q')) {
                handleSearch();
            }
            // Case 2: User switched source while already searching
            else if (hasSearched) {
                handleSearch();
            }
        }
    }, [selectedSource]); // Trigger when source changes

    // Handle search
    const handleSearch = async () => {
        if (!selectedSource || !searchQuery.trim()) return;

        setIsSearching(true);
        setError(null);
        setHasSearched(true);
        addSearch(searchQuery.trim());

        // Update URL to match query (if user typed manually)
        setSearchParams({ q: searchQuery.trim() });

        try {
            const result = await selectedSource.search({ query: searchQuery.trim() });
            setSearchResults(result.anime);
        } catch (err) {
            console.error('[AnimeBrowse] Search failed:', err);
            setError(err instanceof Error ? err.message : 'Search failed');
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Handle anime click
    const handleAnimeClick = (anime: Anime) => {
        if (selectedSourceId) {
            navigate(`/anime-source/${selectedSourceId}/${encodeURIComponent(anime.id)}`);
        }
    };

    return (
        <div className="anime-browse">
            {/* Search Section */}
            <div className="anime-browse-header">
                <h1 style={{ fontSize: '1.5rem' }}>Browse Anime</h1>
                <p className="subtitle">Search and discover anime from available sources</p>
            </div>

            {sources.length === 0 ? (
                <div className="anime-browse-empty">
                    <div className="empty-icon">🔌</div>
                    <h2>No Anime Extensions Active</h2>
                    <p>Loading extensions... or none are installed.</p>
                    <p style={{ color: 'var(--color-text-muted)', marginTop: '8px' }}>
                        Go to Settings to manage extensions.
                    </p>
                    <button
                        className="primary-btn"
                        onClick={() => navigate('/settings')}
                    >
                        Manage Extensions
                    </button>
                    <button
                        className="secondary-btn"
                        style={{ marginTop: '12px', background: 'transparent', border: '1px solid var(--color-border-subtle)' }}
                        onClick={() => window.location.reload()}
                    >
                        Reload Page
                    </button>
                </div>
            ) : (
                <>
                    {/* Search Section */}
                    <div className="anime-controls" style={{ flexDirection: 'column', alignItems: 'stretch' }}>

                        {/* Search Bar - Full Width */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <input
                                    type="text"
                                    placeholder={`Search for anime on ${selectedSource?.name || 'source'}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    style={{
                                        width: '100%',
                                        height: '56px', // Increased height
                                        borderRadius: '16px', // Less pill-like, more boxy for multiline layout
                                        padding: '0 24px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(180, 162, 246, 0.4)',
                                        color: 'var(--theme-text-main)',
                                        outline: 'none',
                                        fontFamily: 'var(--font-rounded)',
                                        fontSize: '0.95rem' // Larger font
                                    }}
                                />
                                {searchQuery && (
                                    <button
                                        className="clear-btn"
                                        onClick={() => setSearchQuery('')}
                                        style={{
                                            position: 'absolute',
                                            right: '16px',
                                            top: '50%',
                                            transform: 'translateY(-50%)'
                                        }}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={handleSearch}
                                disabled={isSearching || !searchQuery.trim()}
                                style={{
                                    width: '56px',
                                    height: '56px',
                                    minWidth: '56px',
                                    borderRadius: '16px',
                                    background: 'var(--color-zen-accent)', // Make it pop
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'white',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(180, 162, 246, 0.3)'
                                }}
                            >
                                <SearchIcon size={24} />
                            </button>
                        </div>

                        {/* Source Selector Dropdown - Next Line */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Source:</span>
                                <Dropdown
                                    value={selectedSourceId || ''}
                                    options={sources.map(s => ({
                                        value: s.id,
                                        label: s.name,
                                        icon: s.iconUrl ? <img src={s.iconUrl} alt="" style={{ width: 16, height: 16, borderRadius: 2 }} /> : undefined
                                    }))}
                                    onChange={(val) => setSelectedSourceId(val)}
                                    className="w-48"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="error-message">
                            <span>⚠️ {error}</span>
                        </div>
                    )}

                    {/* Search Results */}
                    <div className="anime-results">
                        {isSearching ? (
                            <div className="loading-container">
                                <div className="loader"></div>
                                <p>Searching...</p>
                            </div>
                        ) : searchResults.length > 0 ? (
                            <div className="anime-grid">
                                {searchResults.map(anime => (
                                    <div
                                        key={anime.id}
                                        className="anime-card"
                                        onClick={() => handleAnimeClick(anime)}
                                    >
                                        <div className="anime-cover">
                                            <img
                                                src={anime.coverUrl}
                                                alt={anime.title}
                                                loading="lazy"
                                            />
                                            {anime.type && (
                                                <span className="anime-type">{anime.type}</span>
                                            )}
                                            {anime.subOrDub && (
                                                <span className={`anime-sub-dub ${anime.subOrDub}`}>
                                                    {anime.subOrDub.toUpperCase()}
                                                </span>
                                            )}
                                            <div className="card-overlay">
                                                <span className="play-btn">Play</span>
                                            </div>
                                        </div>
                                        <div className="anime-info">
                                            <h3 className="anime-title">{anime.title}</h3>
                                            {anime.releaseDate && (
                                                <span className="anime-date">{anime.releaseDate}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : hasSearched ? (
                            <div className="no-results">
                                <p>No anime found for "{searchQuery}"</p>
                            </div>
                        ) : (
                            <div className="search-prompt">
                                <div className="prompt-icon text-white/20 mb-4">
                                    <SearchIcon size={46} />
                                </div>
                                <h3 className="mb-2" style={{ fontSize: '1.25rem' }}>Search for anime</h3>
                                <p style={{ color: 'rgba(255, 255, 255, 0.4)', marginBottom: '2rem' }}>
                                    Enter a title to search on {selectedSource?.name || 'source'}...
                                </p>

                                {recentSearches.length > 0 && (
                                    <div
                                        className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-500"
                                        style={{ marginTop: '0.25rem' }}
                                    >
                                        <div className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">Recent Searches</div>
                                        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                                            {recentSearches.map(term => (
                                                <button
                                                    key={term}
                                                    onClick={() => {
                                                        setSearchQuery(term);
                                                        // Wait for state update is tricky in handlers, but useEffect handles query param
                                                        // Actually, handleSearch uses state 'searchQuery'. 
                                                        // We can override it or just set state and let user press enter, or call handleSearch with explicit arg.
                                                        // But handleSearch reads from state.
                                                        // Better: Update state AND call search immediately via a wrapper or ref.
                                                        // Or just set state and let the user click search/enter? 
                                                        // UX: usually clicking a chip searches immediately.
                                                        // I'll update state and trigger search.
                                                        // Since handleSearch uses 'searchQuery' state, I can't call it immediately after setState in same tick easily without a ref or variable.
                                                        // I will modify handleSearch to accept optional query.
                                                        // Wait, for now I'll just set query. The user can hit enter or click search.
                                                        // Actually, I can use a separate function or pass arg.
                                                        // I'll refactor handleSearch to take an arg or fallback to state.
                                                        setSearchQuery(term);
                                                        // Hack: force search in next tick or use a timeout? No.
                                                        // I'll just set it for now. User clicks button.
                                                        // Actually, let's just make clicking it fill the bar.
                                                    }}
                                                    className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 text-sm text-white/70 transition-all group flex items-center gap-2"
                                                >
                                                    <span>{term}</span>
                                                    <span
                                                        className="opacity-0 group-hover:opacity-100 px-1 hover:text-red-400 transition-opacity"
                                                        onClick={(e) => removeSearch(term, e)}
                                                    >
                                                        ×
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
