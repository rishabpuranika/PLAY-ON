import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Define types for our settings
export type SortOption = 'Alphabetically' | 'Last Read' | 'Date Added' | 'Score';
export type DisplayMode = 'Compact Grid' | 'Comfortable Grid' | 'List' | 'Cover-only Grid';

export interface LibrarySettings {
    filter: {
        downloaded: boolean;
        unread: boolean;
        started: boolean;
        completed: boolean;
        tracked: boolean; // Just a placeholder for "is on list" maybe?
    };
    sort: {
        option: SortOption;
        direction: 'asc' | 'desc';
    };
    display: {
        mode: DisplayMode;
        itemsPerRow: number;
        showBadges: {
            downloaded: boolean;
            unread: boolean;
            local: boolean;
            continueReading: boolean; // Not used yet
        };
        showTabs: boolean;
        showCount: boolean;
    };
    autoUpdate: {
        enabled: boolean;
        interval: number; // in minutes
    };
}

const defaultSettings: LibrarySettings = {
    filter: {
        downloaded: false,
        unread: false,
        started: false,
        completed: false,
        tracked: false,
    },
    sort: {
        option: 'Alphabetically',
        direction: 'asc',
    },
    display: {
        mode: 'Comfortable Grid',
        itemsPerRow: 3,
        showBadges: {
            downloaded: false,
            unread: true,
            local: true,
            continueReading: false,
        },
        showTabs: true,
        showCount: true,
    },
    autoUpdate: {
        enabled: false,
        interval: 12, // Default 12 hours
    }
};

interface LibrarySettingsContextType {
    settings: LibrarySettings;
    updateSettings: (newSettings: Partial<LibrarySettings>) => void;
    updateFilter: (key: keyof LibrarySettings['filter'], value: boolean) => void;
    updateSort: (option: SortOption) => void;
    toggleSortDirection: () => void;
    updateDisplay: (key: keyof LibrarySettings['display'], value: any) => void;
    updateBadge: (key: keyof LibrarySettings['display']['showBadges'], value: boolean) => void;
    resetFilters: () => void;
    updateAutoSync: (key: keyof LibrarySettings['autoUpdate'], value: any) => void;
}

const LibrarySettingsContext = createContext<LibrarySettingsContextType | undefined>(undefined);

export function LibrarySettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<LibrarySettings>(() => {
        const saved = localStorage.getItem('library_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge defaults to handle new fields (like autoUpdate) missing from old saves
            return { ...defaultSettings, ...parsed, autoUpdate: { ...defaultSettings.autoUpdate, ...parsed.autoUpdate } };
        }
        return defaultSettings;
    });

    useEffect(() => {
        localStorage.setItem('library_settings', JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newSettings: Partial<LibrarySettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const updateFilter = (key: keyof LibrarySettings['filter'], value: boolean) => {
        setSettings(prev => ({
            ...prev,
            filter: { ...prev.filter, [key]: value }
        }));
    };

    const updateSort = (option: SortOption) => {
        setSettings(prev => ({
            ...prev,
            sort: { ...prev.sort, option }
        }));
    };

    const toggleSortDirection = () => {
        setSettings(prev => ({
            ...prev,
            sort: { ...prev.sort, direction: prev.sort.direction === 'asc' ? 'desc' : 'asc' }
        }));
    };

    const updateDisplay = (key: keyof LibrarySettings['display'], value: any) => {
        setSettings(prev => ({
            ...prev,
            display: { ...prev.display, [key]: value }
        }));
    };

    const updateBadge = (key: keyof LibrarySettings['display']['showBadges'], value: boolean) => {
        setSettings(prev => ({
            ...prev,
            display: {
                ...prev.display,
                showBadges: { ...prev.display.showBadges, [key]: value }
            }
        }));
    };

    const resetFilters = () => {
        setSettings(prev => ({
            ...prev,
            filter: defaultSettings.filter
        }));
    }

    const updateAutoSync = (key: keyof LibrarySettings['autoUpdate'], value: any) => {
        setSettings(prev => ({
            ...prev,
            autoUpdate: { ...prev.autoUpdate, [key]: value }
        }));
    };

    return (
        <LibrarySettingsContext.Provider value={{
            settings,
            updateSettings,
            updateFilter,
            updateSort,
            toggleSortDirection,
            updateDisplay,
            updateBadge,
            resetFilters,
            updateAutoSync
        }}>
            {children}
        </LibrarySettingsContext.Provider>
    );
}

export function useLibrarySettings() {
    const context = useContext(LibrarySettingsContext);
    if (context === undefined) {
        throw new Error('useLibrarySettings must be used within a LibrarySettingsProvider');
    }
    return context;
}
