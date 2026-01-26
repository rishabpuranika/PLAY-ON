import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type FilterMode = 'include' | 'exclude' | 'off';

interface ChapterFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    downloadedFilter: FilterMode;
    onDownloadedChange: (mode: FilterMode) => void;
    unreadFilter: FilterMode;
    onUnreadChange: (mode: FilterMode) => void;
    bookmarkedFilter: FilterMode;
    onBookmarkedChange: (mode: FilterMode) => void;
}

const ChapterFilterModal: React.FC<ChapterFilterModalProps> = ({
    isOpen,
    onClose,
    downloadedFilter,
    onDownloadedChange,
    unreadFilter,
    onUnreadChange,
    bookmarkedFilter,
    onBookmarkedChange,
}) => {
    console.log('ChapterFilterModal rendering, isOpen:', isOpen);
    // Debug log
    useEffect(() => {
        if (isOpen) console.log('ChapterFilterModal is OPEN');
    }, [isOpen]);

    // Helper to cycle states: off -> include -> exclude -> off
    const cycleState = (current: FilterMode): FilterMode => {
        if (current === 'off') return 'include';
        if (current === 'include') return 'exclude';
        return 'off';
    };

    if (!isOpen) return null;

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="fixed inset-0 z-[9998] bg-black/10"
            />

            {/* Modal Content */}
            <div
                className="fixed inset-x-0 bottom-0 z-[9999] bg-[#15151e] border-t border-white/10 rounded-t-3xl shadow-2xl overflow-hidden md:inset-x-auto md:w-[400px] md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-2xl animate-in slide-in-from-bottom duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                    <h3 className="text-lg font-bold text-white">Filter Chapters</h3>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-white/40 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Filter Options */}
                <div className="p-2">
                    <FilterItem
                        label="Downloaded"
                        mode={downloadedFilter}
                        onChange={() => onDownloadedChange(cycleState(downloadedFilter))}
                    />
                    <FilterItem
                        label="Unread"
                        mode={unreadFilter}
                        onChange={() => onUnreadChange(cycleState(unreadFilter))}
                    />
                    <FilterItem
                        label="Bookmarked"
                        mode={bookmarkedFilter}
                        onChange={() => onBookmarkedChange(cycleState(bookmarkedFilter))}
                    />
                </div>

                {/* Footer (Reset) */}
                <div className="p-4 border-t border-white/5 bg-white/5 flex justify-end">
                    <button
                        onClick={() => {
                            onDownloadedChange('off');
                            onUnreadChange('off');
                            onBookmarkedChange('off');
                        }}
                        className="text-xs font-bold text-white/40 hover:text-[var(--color-zen-accent)] tracking-wider uppercase transition-colors"
                    >
                        Reset Filters
                    </button>
                </div>

            </div>
        </>,
        document.body
    );
};

const FilterItem = ({ label, mode, onChange }: { label: string, mode: FilterMode, onChange: () => void }) => {
    return (
        <div
            onClick={onChange}
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 active:bg-white/10 rounded-xl transition-colors select-none"
        >
            <span className={`font-medium ${mode !== 'off' ? 'text-[var(--color-zen-accent)]' : 'text-white/80'}`}>
                {label}
            </span>

            <div className={`
                flex items-center justify-center w-6 h-6 rounded-md border transition-all duration-200
                ${mode === 'include' ? 'bg-[var(--color-zen-accent)] border-[var(--color-zen-accent)]' : ''}
                ${mode === 'exclude' ? 'bg-transparent border-red-500' : ''}
                ${mode === 'off' ? 'bg-transparent border-white/20' : ''}
            `}>
                {mode === 'include' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                )}
                {mode === 'exclude' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                )}
            </div>
        </div>
    );
}

export default ChapterFilterModal;
