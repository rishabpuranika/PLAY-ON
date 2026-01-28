import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useLibrarySettings, SortOption, DisplayMode } from '../../context/LibrarySettingsContext';

interface FilterTabProps {
    settings: ReturnType<typeof useLibrarySettings>['settings'];
    updateFilter: ReturnType<typeof useLibrarySettings>['updateFilter'];
}

function FilterTab({ settings, updateFilter }: FilterTabProps) {
    const filters = [
        { key: 'downloaded', label: 'Downloaded' },
        { key: 'unread', label: 'Unread' },
        { key: 'started', label: 'Started' },
        { key: 'completed', label: 'Completed' },
        { key: 'tracked', label: 'Tracked' },
    ] as const;

    return (
        <div className="flex flex-col gap-1 p-4">
            {filters.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-3 cursor-pointer" onClick={() => updateFilter(key, !settings.filter[key])}>
                    <span className="text-white text-base font-medium">{label}</span>
                    <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${settings.filter[key] ? 'bg-[#9213ec] border-[#9213ec]' : 'border-white/30 bg-transparent'}`}>
                        {settings.filter[key] && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                </div>
            ))}
        </div>
    );
}

interface SortTabProps {
    settings: ReturnType<typeof useLibrarySettings>['settings'];
    updateSort: ReturnType<typeof useLibrarySettings>['updateSort'];
    toggleSortDirection: ReturnType<typeof useLibrarySettings>['toggleSortDirection'];
}

function SortTab({ settings, updateSort, toggleSortDirection }: SortTabProps) {
    const options: SortOption[] = [
        'Alphabetically',
        'Last Read',
        // 'Last Update Check',
        // 'Unread Count',
        'Date Added',
        'Score',
        // 'Random'
    ];

    return (
        <div className="flex flex-col gap-1 p-4">
            {options.map((option) => (
                <div key={option} className="flex items-center justify-between py-3 cursor-pointer" onClick={() => {
                    if (settings.sort.option === option) {
                        toggleSortDirection();
                    } else {
                        updateSort(option);
                    }
                }}>
                    <span className={`text-base font-medium ${settings.sort.option === option ? 'text-[#9213ec]' : 'text-white'}`}>{option}</span>
                    {settings.sort.option === option && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1, rotate: settings.sort.direction === 'asc' ? 180 : 0 }}
                            className="text-[#9213ec]"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                        </motion.div>
                    )}
                </div>
            ))}
        </div>
    );
}

interface DisplayTabProps {
    settings: ReturnType<typeof useLibrarySettings>['settings'];
    updateDisplay: ReturnType<typeof useLibrarySettings>['updateDisplay'];
    updateBadge: ReturnType<typeof useLibrarySettings>['updateBadge'];
}

function DisplayTab({ settings, updateDisplay, updateBadge }: DisplayTabProps) {
    const displayModes: DisplayMode[] = ['Compact Grid', 'Comfortable Grid', 'Cover-only Grid', 'List'];

    return (
        <div className="flex flex-col gap-6 p-4">
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Display Mode</h3>
                <div className="grid grid-cols-2 gap-2">
                    {displayModes.map(mode => (
                        <button
                            key={mode}
                            onClick={() => updateDisplay('mode', mode)}
                            className={`px-3 py-2 rounded text-sm font-medium border transition-all ${settings.display.mode === mode
                                ? 'bg-[#9213ec]/20 border-[#9213ec] text-[#9213ec]'
                                : 'bg-white/5 border-transparent text-white/80 hover:bg-white/10'
                                }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex justify-between">
                    <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Items per row</h3>
                    <span className="text-sm font-medium text-[#9213ec]">{settings.display.itemsPerRow}</span>
                </div>
                <input
                    type="range"
                    min="2"
                    max="8"
                    step="1"
                    value={settings.display.itemsPerRow}
                    onChange={(e) => updateDisplay('itemsPerRow', parseInt(e.target.value))}
                    className="w-full accent-[#9213ec] bg-white/10 h-1.5 rounded-full appearance-none cursor-pointer"
                />
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Badges</h3>
                <div className="space-y-1">
                    <div className="flex items-center justify-between py-2 cursor-pointer" onClick={() => updateBadge('downloaded', !settings.display.showBadges.downloaded)}>
                        <span className="text-white">Downloaded chapters</span>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.display.showBadges.downloaded ? 'bg-[#9213ec] border-[#9213ec]' : 'border-white/30 bg-transparent'}`}>
                            {settings.display.showBadges.downloaded && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-2 cursor-pointer" onClick={() => updateBadge('unread', !settings.display.showBadges.unread)}>
                        <span className="text-white">Unread count</span>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.display.showBadges.unread ? 'bg-[#9213ec] border-[#9213ec]' : 'border-white/30 bg-transparent'}`}>
                            {settings.display.showBadges.unread && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-2 cursor-pointer" onClick={() => updateBadge('local', !settings.display.showBadges.local)}>
                        <span className="text-white">Local source</span>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.display.showBadges.local ? 'bg-[#9213ec] border-[#9213ec]' : 'border-white/30 bg-transparent'}`}>
                            {settings.display.showBadges.local && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Tabs</h3>
                <div className="flex items-center justify-between py-2 cursor-pointer" onClick={() => updateDisplay('showTabs', !settings.display.showTabs)}>
                    <span className="text-white">Show category tabs</span>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.display.showTabs ? 'bg-[#9213ec] border-[#9213ec]' : 'border-white/30 bg-transparent'}`}>
                        {settings.display.showTabs && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                </div>
                <div className="flex items-center justify-between py-2 cursor-pointer" onClick={() => updateDisplay('showCount', !settings.display.showCount)}>
                    <span className="text-white">Show number of items</span>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.display.showCount ? 'bg-[#9213ec] border-[#9213ec]' : 'border-white/30 bg-transparent'}`}>
                        {settings.display.showCount && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface LibraryFilterSheetProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LibraryFilterSheet({ isOpen, onClose }: LibraryFilterSheetProps) {
    const { settings, updateFilter, updateSort, toggleSortDirection, updateDisplay, updateBadge, resetFilters, updateAutoSync } = useLibrarySettings();
    const [tab, setTab] = useState<'Filter' | 'Sort' | 'Display' | 'Auto-Sync'>('Filter');

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 bg-[#1e1e1e] rounded-t-2xl z-50 max-h-[85vh] flex flex-col shadow-2xl safe-area-bottom"
                    >
                        {/* Header/Tabs */}
                        <div className="flex items-center justify-between px-4 border-b border-white/5">
                            <div className="flex-1 flex justify-around">
                                {['Filter', 'Sort', 'Display', 'Auto-Sync'].map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setTab(t as any)}
                                        className={`py-4 px-2 relative font-medium transition-colors ${tab === t ? 'text-[#9213ec]' : 'text-white/60'}`}
                                    >
                                        {t}
                                        {tab === t && (
                                            <motion.div
                                                layoutId="activeFilterTab"
                                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9213ec]"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                            {/* Reset Button (only for Filter) */}
                            {tab === 'Filter' && (
                                <button onClick={resetFilters} className="text-xs text-[#9213ec] font-bold px-3 py-1 bg-[#9213ec]/10 rounded-full ml-2">
                                    RESET
                                </button>
                            )}
                        </div>

                        {/* Content */}
                        <div className="overflow-y-auto flex-1 pb-safe-bottom">
                            {tab === 'Filter' && <FilterTab settings={settings} updateFilter={updateFilter} />}
                            {tab === 'Sort' && <SortTab settings={settings} updateSort={updateSort} toggleSortDirection={toggleSortDirection} />}
                            {tab === 'Display' && <DisplayTab settings={settings} updateDisplay={updateDisplay} updateBadge={updateBadge} />}
                            {tab === 'Auto-Sync' && <AutoSyncTab settings={settings} updateAutoSync={updateAutoSync} />}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

interface AutoSyncTabProps {
    settings: ReturnType<typeof useLibrarySettings>['settings'];
    updateAutoSync: ReturnType<typeof useLibrarySettings>['updateAutoSync'];
}

function AutoSyncTab({ settings, updateAutoSync }: AutoSyncTabProps) {
    const intervals = [
        { label: 'Every 6 Hours', value: 6 * 60 },
        { label: 'Every 12 Hours', value: 12 * 60 },
        { label: 'Every 24 Hours', value: 24 * 60 },
        //{ label: 'Every Week', value: 7 * 24 * 60 },
    ];

    return (
        <div className="flex flex-col gap-6 p-4 pb-20">
            <div className="flex items-center justify-between py-3">
                <div className="flex flex-col">
                    <span className="text-white text-base font-medium">Enable Auto-Sync</span>
                    <span className="text-xs text-white/50 mt-1">Automatically check for manga updates</span>
                </div>
                <div
                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors flex-shrink-0 ${settings.autoUpdate?.enabled ? 'bg-[#9213ec]' : 'bg-white/20'}`}
                    onClick={() => updateAutoSync('enabled', !settings.autoUpdate?.enabled)}
                >
                    <motion.div
                        className="w-4 h-4 rounded-full bg-white shadow-sm"
                        animate={{ x: settings.autoUpdate?.enabled ? 24 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                </div>
            </div>

            {settings.autoUpdate?.enabled && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Update Frequency</h3>
                    <div className="flex flex-col gap-2">
                        {intervals.map((interval) => (
                            <div
                                key={interval.value}
                                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${settings.autoUpdate?.interval === interval.value
                                    ? 'bg-[#9213ec]/20 border-[#9213ec]'
                                    : 'bg-white/5 border-transparent hover:bg-white/10'
                                    }`}
                                onClick={() => updateAutoSync('interval', interval.value)}
                            >
                                <span className={settings.autoUpdate?.interval === interval.value ? 'text-[#9213ec] font-medium' : 'text-white/80'}>
                                    {interval.label}
                                </span>
                                {settings.autoUpdate?.interval === interval.value && (
                                    <div className="w-2 h-2 rounded-full bg-[#9213ec]" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

