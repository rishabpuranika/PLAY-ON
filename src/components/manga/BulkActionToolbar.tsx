import React, { useState } from 'react';
import { Check, X, RefreshCw, BookOpen } from 'lucide-react';

interface BulkActionToolbarProps {
    mangaId: string;
    totalChapters: number;
    readCount: number;
    syncPoint: number;
    onMarkAllRead: () => Promise<void>;
    onMarkAllUnread: () => Promise<void>;
    onSyncFromAnilist: () => Promise<void>;
    disabled?: boolean;
}

export const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
    totalChapters,
    readCount,
    syncPoint,
    onMarkAllRead,
    onMarkAllUnread,
    onSyncFromAnilist,
    disabled = false,
}) => {
    const [loading, setLoading] = useState<string | null>(null);
    const [showUnreadConfirm, setShowUnreadConfirm] = useState(false);

    const handleMarkAllRead = async () => {
        setLoading('read');
        try {
            await onMarkAllRead();
        } finally {
            setLoading(null);
        }
    };

    const handleMarkAllUnread = async () => {
        if (syncPoint > 0 && !showUnreadConfirm) {
            setShowUnreadConfirm(true);
            return;
        }
        setShowUnreadConfirm(false);
        setLoading('unread');
        try {
            await onMarkAllUnread();
        } finally {
            setLoading(null);
        }
    };

    const handleSync = async () => {
        setLoading('sync');
        try {
            await onSyncFromAnilist();
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="flex flex-col gap-2 p-3 bg-background/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
            {/* Progress Indicator */}
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-muted-foreground" />
                    <span className="text-foreground">
                        <span className="font-semibold">{readCount}</span>
                        <span className="text-muted-foreground"> / {totalChapters} chapters read</span>
                    </span>
                </div>
                {syncPoint > 0 && (
                    <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                        AniList: Ch. {syncPoint}
                    </span>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
                <button
                    onClick={handleMarkAllRead}
                    disabled={disabled || loading !== null}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading === 'read' ? (
                        <RefreshCw size={16} className="animate-spin" />
                    ) : (
                        <Check size={16} />
                    )}
                    <span className="text-sm font-medium">Mark All Read</span>
                </button>

                <button
                    onClick={handleMarkAllUnread}
                    disabled={disabled || loading !== null}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${showUnreadConfirm
                            ? 'bg-red-500/20 text-red-400 animate-pulse'
                            : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                        }`}
                >
                    {loading === 'unread' ? (
                        <RefreshCw size={16} className="animate-spin" />
                    ) : (
                        <X size={16} />
                    )}
                    <span className="text-sm font-medium">
                        {showUnreadConfirm ? 'Confirm?' : 'Mark All Unread'}
                    </span>
                </button>

                <button
                    onClick={handleSync}
                    disabled={disabled || loading !== null}
                    className="px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Sync from AniList"
                >
                    <RefreshCw size={16} className={loading === 'sync' ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Confirmation Message */}
            {showUnreadConfirm && (
                <div className="text-xs text-orange-400 text-center animate-pulse">
                    Tap again to confirm. This won't affect your AniList progress.
                </div>
            )}
        </div>
    );
};

export default BulkActionToolbar;
