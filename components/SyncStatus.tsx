import React from 'react';
import { CloudCheck, CloudUpload, WifiOff } from 'lucide-react';
import { useSyncStatus } from '../hooks/useSyncStatus';

export const SyncStatus: React.FC = () => {
    const { isOnline, pendingCount } = useSyncStatus();

    // Premium compact design
    // Using simple glassmorphism that fits the dark header
    const baseClasses = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-300 border backdrop-blur-md cursor-help select-none";

    if (!isOnline) {
        return (
            <div className={`${baseClasses} bg-rose-500/10 text-rose-300 border-rose-500/20 hover:bg-rose-500/20`} title="目前處於離線狀態，資料將暫存於本機">
                <WifiOff size={13} strokeWidth={2.5} />
                <span>離線</span>
            </div>
        );
    }

    if (pendingCount > 0) {
        return (
            <div className={`${baseClasses} bg-amber-500/10 text-amber-300 border-amber-500/20 animate-pulse`} title={`正在上傳 ${pendingCount} 筆資料`}>
                <CloudUpload size={13} strokeWidth={2.5} />
                <span>同步中 {pendingCount}</span>
            </div>
        );
    }

    return (
        <div className={`${baseClasses} bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20`} title="所有資料已同步至雲端">
            <CloudCheck size={13} strokeWidth={2.5} />
            <span className="opacity-90">已同步</span>
        </div>
    );
};
