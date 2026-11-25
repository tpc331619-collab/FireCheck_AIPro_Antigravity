import React, { useState, useEffect, useRef } from 'react';
import { Bell, ChevronLeft, Trash2, CheckCheck } from 'lucide-react';
import { Notification, NotificationType, SystemSettings } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';

interface NotificationBellProps {
    userId: string;
    organizationId?: string | null;
    className?: string; // Container/Button class
    iconClassName?: string; // Icon class
    systemSettings?: SystemSettings;
    isAdmin?: boolean;
    pendingUsersCount?: number;
    onNotificationNavigate?: (type: NotificationType) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ userId, organizationId, className, iconClassName, systemSettings, isAdmin, pendingUsersCount = 0, onNotificationNavigate }) => {
    const { t } = useLanguage();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const deduplicateNotifications = (list: Notification[]): Notification[] => {
        const seen = new Set<string>();
        const result: Notification[] = [];
        // Assuming list is sorted newest-first; ensure sort just in case
        const sorted = [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        for (const item of sorted) {
            const key = `${item.type}_${item.title}_${item.message}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(item);
            }
        }
        return result;
    };

    // Subscribe to notifications
    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            return;
        }

        setLoading(true);
        const unsubscribe = StorageService.onNotificationsChange(userId, (updatedNotifications) => {
            setNotifications(deduplicateNotifications(updatedNotifications));
            setLoading(false);
        }, organizationId);

        return () => unsubscribe();
    }, [userId, organizationId]);

    // Legacy listener for backward compatibility or local-only updates
    useEffect(() => {
        const handleNewNotification = async () => {
            const data = await StorageService.getNotifications(userId, organizationId);
            setNotifications(deduplicateNotifications(data));
        };

        window.addEventListener('notification-added', handleNewNotification);
        return () => window.removeEventListener('notification-added', handleNewNotification);
    }, [userId, organizationId]);

    // Close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const unreadCount = notifications.filter(n => !n.read).length + (isAdmin ? pendingUsersCount : 0);

    const handleMarkAsRead = async (notificationId: string) => {
        try {
            await StorageService.markAsRead(notificationId, userId);
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
            );
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const handleClearAll = async () => {
        if (!confirm('確定要清除所有通知嗎?')) return;

        try {
            setLoading(true);
            await StorageService.clearAllNotifications(userId);
            setNotifications([]);
            setIsOpen(false);
        } catch (error) {
            console.error('Failed to clear notifications:', error);
            alert('清除失敗');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAllAsRead = async () => {
        const unread = notifications.filter(n => !n.read);
        if (unread.length === 0) return;
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        await Promise.all(unread.map(n => StorageService.markAsRead(n.id, userId).catch(() => {})));
    };

    const formatTime = (timestamp: number) => {
        const d = new Date(timestamp);
        if (isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
    };

    const canShow = isAdmin || systemSettings?.allowInspectorNotifications !== false;
    if (!canShow) return null;

    return (
        <div className="relative" ref={panelRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2 rounded-full transition-colors ${className || 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                aria-label="通知"
            >
                <Bell className={`w-6 h-6 ${iconClassName || 'text-slate-600 dark:text-slate-300'}`} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 text-[9px] font-bold text-white bg-red-600 rounded-full border border-white dark:border-slate-900 shadow-sm leading-none z-10">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* THSR-Style Full-Screen / Sheet Notification List */}
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center sm:p-4 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-150" onClick={() => setIsOpen(false)}>
                    <div
                        className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-lg bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right-4 sm:zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* THSR Dark Header */}
                        <div className="bg-[#3b3b3f] text-white px-3 py-3.5 flex items-center justify-between shrink-0 shadow-sm">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 -ml-1 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center"
                                aria-label="返回"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            <h3 className="font-bold text-base tracking-wide flex items-center gap-1.5">
                                <span>{t('notifications')}</span>
                                {unreadCount > 0 && (
                                    <span className="px-1.5 py-0.5 text-[11px] font-bold bg-[#d9531e] text-white rounded-full leading-none">
                                        {unreadCount}
                                    </span>
                                )}
                            </h3>
                            <div className="flex items-center gap-1">
                                {notifications.some(n => !n.read) && (
                                    <button
                                        onClick={handleMarkAllAsRead}
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white transition-colors"
                                        title="全部標為已讀"
                                    >
                                        <CheckCheck className="w-5 h-5" />
                                    </button>
                                )}
                                {notifications.length > 0 && (
                                    <button
                                        onClick={handleClearAll}
                                        disabled={loading}
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white transition-colors disabled:opacity-50"
                                        title="清除所有通知"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                {notifications.length === 0 && <div className="w-8" />}
                            </div>
                        </div>

                        {/* THSR Clean Divided List */}
                        <div className="flex-1 overflow-y-auto bg-white divide-y divide-slate-200 custom-scrollbar">
                            {isAdmin && pendingUsersCount > 0 && (
                                <div
                                    className="px-4 py-3.5 hover:bg-orange-50/50 transition-colors cursor-pointer flex items-center gap-3.5"
                                    onClick={() => {
                                        if ((window as any).openAdminDashboard) (window as any).openAdminDashboard();
                                        setIsOpen(false);
                                    }}
                                >
                                    {/* Solid orange 'i' = Unread */}
                                    <span className="w-6 h-6 rounded-full bg-[#d9531e] text-white flex items-center justify-center font-serif font-bold text-xs shrink-0">
                                        i
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[15px] font-semibold text-slate-900 leading-snug">
                                            {t('pendingAccessRequest') || '存取權限申請'}：有 {pendingUsersCount} 位新使用者申請加入系統，請前往審核。
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1 font-mono">
                                            {formatTime(Date.now())}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {notifications.length === 0 && (!isAdmin || pendingUsersCount === 0) ? (
                                <div className="py-24 text-center text-slate-400">
                                    <div className="w-12 h-12 rounded-full border-2 border-orange-200 text-orange-300 flex items-center justify-center font-serif font-bold text-xl mx-auto mb-3">
                                        i
                                    </div>
                                    <p className="text-sm font-medium">{t('noNotifications')}</p>
                                </div>
                            ) : (
                                notifications.map((notification) => {
                                    const isUnread = !notification.read;
                                    return (
                                        <div
                                            key={notification.id}
                                            className="px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer flex items-center gap-3.5"
                                            onClick={() => {
                                                if (isUnread) handleMarkAsRead(notification.id);
                                                if (onNotificationNavigate) {
                                                    onNotificationNavigate(notification.type);
                                                    setIsOpen(false);
                                                } else if (notification.type === 'profile' && (window as any).openAdminDashboard) {
                                                    (window as any).openAdminDashboard();
                                                    setIsOpen(false);
                                                }
                                            }}
                                        >
                                            {/* THSR style: Solid orange circle = Unread, Outlined orange circle = Read */}
                                            <span
                                                className={`w-6 h-6 rounded-full flex items-center justify-center font-serif font-bold text-xs shrink-0 transition-colors ${
                                                    isUnread
                                                        ? 'bg-[#d9531e] text-white'
                                                        : 'border-[1.5px] border-[#d9531e] text-[#d9531e] bg-white'
                                                }`}
                                            >
                                                i
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-[15px] leading-snug ${isUnread ? 'font-semibold text-slate-900' : 'font-normal text-slate-700'}`}>
                                                    {notification.title}
                                                    {notification.message ? `：${notification.message}` : ''}
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1 font-mono">
                                                    {formatTime(notification.timestamp)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
