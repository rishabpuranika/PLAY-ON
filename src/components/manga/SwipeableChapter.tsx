import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useState } from 'react';
import { CheckIcon, XIcon } from '../ui/Icons';

interface SwipeableChapterProps {
    mangaId: string;
    chapter: {
        id: string;
        number: number;
        title?: string;
    };
    isRead: boolean;
    onToggleRead: (mangaId: string, chapterId: string) => Promise<void>;
    onClick: () => void;
}

const SWIPE_THRESHOLD = 100;

export const SwipeableChapter = ({
    mangaId,
    chapter,
    isRead,
    onToggleRead,
    onClick
}: SwipeableChapterProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const x = useMotionValue(0);

    // Background color transform based on swipe direction (Mihon style)
    const background = useTransform(
        x,
        [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
        [
            isRead ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)', // Red if marking unread, Green if marking read
            'rgba(0, 0, 0, 0)',
            isRead ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'
        ]
    );

    const iconOpacity = useTransform(
        x,
        [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD / 2, 0, SWIPE_THRESHOLD / 2, SWIPE_THRESHOLD],
        [1, 0.5, 0, 0.5, 1]
    );

    const handleDragEnd = async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        setIsDragging(false);

        if (Math.abs(info.offset.x) > SWIPE_THRESHOLD) {
            // Trigger toggle on significant swipe (either direction for toggle)
            await onToggleRead(mangaId, chapter.id);
        }
    };

    return (
        <motion.div
            className="relative w-full overflow-hidden"
            style={{ background }}
        >
            {/* Background Icons (Mihon style indicators) */}
            <motion.div
                className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none"
                style={{ opacity: iconOpacity }}
            >
                <div className="flex items-center gap-2">
                    {isRead ? (
                        <>
                            <XIcon className="w-6 h-6 text-red-500" />
                            <span className="text-red-500 text-sm font-medium">Mark Unread</span>
                        </>
                    ) : (
                        <>
                            <CheckIcon className="w-6 h-6 text-green-500" />
                            <span className="text-green-500 text-sm font-medium">Mark Read</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isRead ? (
                        <>
                            <span className="text-red-500 text-sm font-medium">Mark Unread</span>
                            <XIcon className="w-6 h-6 text-red-500" />
                        </>
                    ) : (
                        <>
                            <span className="text-green-500 text-sm font-medium">Mark Read</span>
                            <CheckIcon className="w-6 h-6 text-green-500" />
                        </>
                    )}
                </div>
            </motion.div>

            {/* Swipeable Content */}
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.3}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={handleDragEnd}
                style={{ x }}
                className={`relative z-10 bg-card p-4 cursor-pointer transition-colors ${isRead ? 'opacity-60' : 'opacity-100'
                    }`}
                onClick={() => !isDragging && onClick()}
            >
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className={`text-lg font-medium ${isRead ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}>
                            Chapter {chapter.number}
                        </span>
                        {chapter.title && (
                            <span className="text-sm text-muted-foreground">{chapter.title}</span>
                        )}
                    </div>

                    {/* Visual indicator dot */}
                    <div className={`w-3 h-3 rounded-full ${isRead ? 'bg-muted' : 'bg-primary'
                        }`} />
                </div>
            </motion.div>
        </motion.div>
    );
};
