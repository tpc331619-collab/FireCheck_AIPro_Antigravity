import { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';

export const useSyncStatus = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        // 1. Listen to Online/Offline status
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // 2. Listen to Pending Operations
        const unsubscribe = StorageService.subscribeToSyncStatus((count) => {
            setPendingCount(count);
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            unsubscribe();
        };
    }, []);

    return { isOnline, pendingCount };
};
