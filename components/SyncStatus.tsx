import React from 'react';
import { CloudCheck, CloudUpload, WifiOff } from 'lucide-react';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useLanguage } from '../contexts/LanguageContext';

export const SyncStatus: React.FC = () => {
    const { isOnline, pendingCount } = useSyncStatus();
    const { t } = useLanguage();

    // Premium compact design
    // Using simple glassmorphism that fits the dark header
    const baseClasses = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-300 border backdrop-blur-md cursor-help select-none";

    if (!isOnline) {
        return (
            <div className={`${baseClasses} bg-rose-500/10 text-rose-300 border-rose-500/20 hover:bg-rose-500/20`} title={t('offline')}>
                <WifiOff size={13} strokeWidth={2.5} />
                <span>{t('offline')}</span>
            </div>
        );
    }

    if (pendingCount > 0) {
        return (
            <div className={`${baseClasses} bg-amber-500/10 text-amber-300 border-amber-500/20 animate-pulse`} title={`${t('syncing')} ${pendingCount}`}>
                <CloudUpload size={13} strokeWidth={2.5} />
                <span>{t('syncing')} {pendingCount}</span>
            </div>
        );
    }

    return (
        <div className={`${baseClasses} bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20`} title={t('synced')}>
            <CloudCheck size={13} strokeWidth={2.5} />
            <span className="opacity-90">{t('synced')}</span>
        </div>
    );
};

export const SyncStatusBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { isOnline, pendingCount } = useSyncStatus();
    const { t } = useLanguage();

    if (!isOnline) {
        return (
            <div className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center border-2 border-slate-50 shadow-sm ${className}`} title={t('offline')}>
                <WifiOff size={8} strokeWidth={3} />
            </div>
        );
    }

    if (pendingCount > 0) {
        return (
            <div className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center border-2 border-slate-50 shadow-sm animate-pulse ${className}`} title={`${t('syncing')} ${pendingCount}`}>
                <CloudUpload size={8} strokeWidth={3} />
            </div>
        );
    }

    // Optional: Show green dot for online, or nothing to reduce clutter
    // User asked to see status, so a small green dot might be reassuring
    return (
        <div className={`absolute top-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-50 shadow-sm ${className}`} title={t('synced')}></div>
    );
};
