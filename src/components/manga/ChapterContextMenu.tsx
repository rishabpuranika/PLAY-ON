import { useState } from 'react';
import { CheckIcon } from '../ui/Icons';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ChapterContextMenuProps {
    children: React.ReactNode;
    isRead: boolean;
    chapterId: string;
    chapterNumber: number;
    onToggleRead: () => void;
    onMarkPreviousRead?: (chapterId: string) => void;
    onMarkBelowUnread?: (chapterId: string) => void;
}

export const ChapterContextMenu = ({
    children,
    isRead,
    chapterId,
    chapterNumber: _chapterNumber,
    onToggleRead,
    onMarkPreviousRead,
    onMarkBelowUnread,
}: ChapterContextMenuProps) => {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.pageX, y: e.pageY });
    };

    const handleClose = () => setContextMenu(null);

    return (
        <div onContextMenu={handleContextMenu}>
            {children}

            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={handleClose}
                    />
                    <div
                        className="fixed z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[180px]"
                        style={{
                            top: Math.min(contextMenu.y, window.innerHeight - 200),
                            left: Math.min(contextMenu.x, window.innerWidth - 200)
                        }}
                    >
                        {/* Mark as Read/Unread */}
                        <button
                            onClick={() => {
                                onToggleRead();
                                handleClose();
                            }}
                            className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors"
                        >
                            {isRead ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                    </svg>
                                    <span>Mark as Unread</span>
                                </>
                            ) : (
                                <>
                                    <CheckIcon size={16} />
                                    <span>Mark as Read</span>
                                </>
                            )}
                        </button>

                        {/* Divider */}
                        <div className="h-px bg-border my-1" />

                        {/* Mark Previous as Read (Mihon feature) */}
                        {onMarkPreviousRead && (
                            <button
                                onClick={() => {
                                    onMarkPreviousRead(chapterId);
                                    handleClose();
                                }}
                                className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors text-green-400"
                            >
                                <ChevronUp size={16} />
                                <span>Mark previous as read</span>
                            </button>
                        )}

                        {/* Mark All Below as Unread */}
                        {onMarkBelowUnread && (
                            <button
                                onClick={() => {
                                    onMarkBelowUnread(chapterId);
                                    handleClose();
                                }}
                                className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors text-orange-400"
                            >
                                <ChevronDown size={16} />
                                <span>Mark below as unread</span>
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
