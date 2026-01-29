import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Calendar, User, Heart, AlertTriangle, Check, Zap } from 'lucide-react';
import { Notification, NotificationType } from '../types';
import { StorageService } from '../services/storageService';

interface NotificationBellProps {
    userId: string;
    className?: string; // Container/Button class
    iconClassName?: string; // Icon class
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ userId, className, iconClassName }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Fetch notifications
    useEffect(() => {
        if (userId) {
            loadNotifications();
        }
    }, [userId]);

    // Listen for new notifications
    useEffect(() => {
        const handleNewNotification = () => {
            loadNotifications();
        };

        window.addEventListener('notification-added', handleNewNotification);
        return () => {
            window.removeEventListener('notification-added', handleNewNotification);
        };
    }, [userId]);

    const loadNotifications = async () => {
        try {
            const data = await StorageService.getNotifications(userId);
            setNotifications(data);
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    };

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

    const unreadCount = notifications.filter(n => !n.read).length;

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

    const getIcon = (type: NotificationType) => {
        switch (type) {
            case 'profile':
                return <User className="w-4 h-4 text-blue-500" />;
            case 'health':
                return <Heart className="w-4 h-4 text-rose-500" />;
            case 'declaration':
                return <Calendar className="w-4 h-4 text-orange-500" />;
            case 'abnormal':
                return <AlertTriangle className="w-4 h-4 text-red-500" />;
            case 'lights':
                return <Zap className="w-4 h-4 text-amber-500" />;
            default:
                return <Bell className="w-4 h-4 text-slate-500" />;
        }
    };

    const formatTime = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '剛剛';
        if (minutes < 60) return `${minutes} 分鐘前`;
        if (hours < 24) return `${hours} 小時前`;
        if (days < 7) return `${days} 天前`;
        return new Date(timestamp).toLocaleDateString('zh-TW');
    };

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

            {/* Notification Panel */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Bell className="w-5 h-5" />
                            通知
                            {unreadCount > 0 && (
                                <span className="text-xs font-bold text-red-500">({unreadCount})</span>
                            )}
                        </h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                                <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="text-sm">目前沒有通知</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`p-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                                        }`}
                                    onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="shrink-0 mt-0.5">{getIcon(notification.type)}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
                                                    {notification.title}
                                                </h4>
                                                {!notification.read && (
                                                    <span className="shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1"></span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                                {formatTime(notification.timestamp)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            <button
                                onClick={handleClearAll}
                                disabled={loading}
                                className="w-full py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
                            >
                                {loading ? '清除中...' : '清除所有通知'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
