import { useLocalLibrary } from '@/hooks/useLocalLibrary';
import { SwipeableChapter } from './SwipeableChapter';

interface ChapterListProps {
    mangaId: string;
    chapters: Array<{
        id: string;
        number: number;
        title?: string;
    }>;
    onChapterClick: (chapterId: string) => void;
}

export const ChapterList = ({ mangaId, chapters, onChapterClick }: ChapterListProps) => {
    const { isChapterRead, toggleReadStatus } = useLocalLibrary();

    const handleToggle = async (mangaId: string, chapterId: string) => {
        await toggleReadStatus(mangaId, chapterId);
        // Optional: Add toast notification
        // toast.success(`Marked as ${newStatus ? 'read' : 'unread'}`);
    };

    return (
        <div className="flex flex-col gap-1 w-full">
            {chapters.map((chapter) => (
                <SwipeableChapter
                    key={chapter.id}
                    mangaId={mangaId}
                    chapter={chapter}
                    isRead={isChapterRead(mangaId, chapter.id)}
                    onToggleRead={handleToggle}
                    onClick={() => onChapterClick(chapter.id)}
                />
            ))}
        </div>
    );
};
