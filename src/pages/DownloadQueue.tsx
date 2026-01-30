import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getQueue,
    clearQueue,
    getCurrentTask,
    onDownloadProgress
} from '../services/downloadService';
import { TrashIcon, ArrowRightIcon, DownloadIcon } from '../components/ui/Icons';
import './DownloadQueue.css';

interface DownloadTask {
    sourceId: string;
    mangaId: string;
    mangaTitle: string;
    chapterId: string;
    chapterNumber: number;
    entryId: string;
}

interface DownloadQueueProps {
    embedded?: boolean;
}

function DownloadQueue({ embedded = false }: DownloadQueueProps) {
    const navigate = useNavigate();
    const [queue, setQueue] = useState<DownloadTask[]>([]);
    const [currentTask, setCurrentTask] = useState<DownloadTask | null>(null);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });

    useEffect(() => {
        const updateState = () => {
            setCurrentTask(getCurrentTask());
            // Now we can get the full queue!
            setQueue(getQueue());
        };

        // Initial update
        updateState();

        // Check periodically for queue changes
        const interval = setInterval(updateState, 1000);

        const unsubscribe = onDownloadProgress((_cid, current, total, status) => {
            setProgress({ current, total, status });
            updateState();
        });

        return () => {
            clearInterval(interval);
            unsubscribe();
        };
    }, []);

    const handleClearQueue = () => {
        if (confirm('Are you sure you want to clear the download queue?')) {
            clearQueue();
            setQueue([]);
        }
    };

    return (
        <div className={`download-queue-page ${embedded ? 'embedded' : ''}`}>
            {!embedded && (
                <div className="header">
                    <button onClick={() => navigate(-1)} className="back-button">
                        <ArrowRightIcon size={24} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                    <h1>Download Queue</h1>
                    <button
                        onClick={handleClearQueue}
                        className="clear-button"
                        disabled={queue.length === 0 && !currentTask}
                    >
                        <TrashIcon size={20} />
                        Clear
                    </button>
                </div>
            )}


            {/* Active Download Section */}
            {currentTask && (
                <div className="current-download">
                    <h2>Downloading Now</h2>
                    <div className="task-card active">
                        <div className="task-icon">
                            <DownloadIcon size={20} />
                        </div>
                        <div className="task-info">
                            <span className="manga-title">{currentTask.mangaTitle}</span>
                            <span className="chapter-title">Chapter {currentTask.chapterNumber}</span>
                            <div className="progress-bar-container">
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${(progress.current / Math.max(progress.total || 1, 1)) * 100}%` }}
                                    />
                                </div>
                                <span className="status-text">{progress.status}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Queue List Section */}
            <div className="queue-list-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0 }}>Pending ({queue.length})</h2>
                    {embedded && (
                        <button
                            onClick={handleClearQueue}
                            className="setting-button danger"
                            disabled={queue.length === 0 && !currentTask}
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                        >
                            <TrashIcon size={16} style={{ marginRight: '6px' }} />
                            Clear Queue
                        </button>
                    )}
                </div>
                {queue.length === 0 && !currentTask ? (
                    <div className="empty-state">
                        <DownloadIcon size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <p>No downloads pending</p>
                    </div>
                ) : (
                    <div className="queue-list">
                        {queue.map((task, index) => (
                            <div key={`${task.chapterId}-${index}`} className="task-card pending">
                                <div className="task-info">
                                    <span className="manga-title">{task.mangaTitle}</span>
                                    <span className="chapter-title">Chapter {task.chapterNumber}</span>
                                    <span className="status-text">Pending</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default DownloadQueue;
