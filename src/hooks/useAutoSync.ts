import { useEffect, useRef } from 'react';
import { useLibrarySettings } from '../context/LibrarySettingsContext';
import { checkForMangaUpdates } from '../services/NotificationService';

const LAST_AUTO_SYNC_KEY = 'playon_last_auto_sync';

export function useAutoSync() {
    const { settings } = useLibrarySettings();
    const { enabled, interval } = settings.autoUpdate;
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // Clear existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (!enabled) return;

        const checkAndSync = async () => {
            // Check last sync time
            const lastSyncStr = localStorage.getItem(LAST_AUTO_SYNC_KEY);
            const lastSync = lastSyncStr ? parseInt(lastSyncStr) : 0;
            const now = Date.now();

            // Interval is in minutes, convert to ms
            const intervalMs = interval * 60 * 1000;

            if (now - lastSync >= intervalMs) {
                console.log('[AutoSync] Starting auto-sync...');
                try {
                    await checkForMangaUpdates(true); // Notify users
                    localStorage.setItem(LAST_AUTO_SYNC_KEY, Date.now().toString());
                } catch (e) {
                    console.error('[AutoSync] Sync failed:', e);
                }
            } else {
                // console.log('[AutoSync] Skipping, too soon.');
            }
        };

        // Initial check on mount/settings change
        checkAndSync();

        // Set up interval to check periodically (e.g. every minute) if it's time to sync
        // We don't set the interval to 'intervalMs' directly because if the app is closed/reopened, 
        // we want to catch up immediately if overdue, not wait another full cycle.
        intervalRef.current = setInterval(checkAndSync, 60 * 1000); // Check every minute

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };

    }, [enabled, interval]);
}
