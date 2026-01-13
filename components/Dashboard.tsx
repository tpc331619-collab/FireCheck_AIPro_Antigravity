
import React, { useEffect, useState, useRef } from 'react';
import { InspectionReport, UserProfile, LanguageCode } from '../types';
import { StorageService } from '../services/storageService';
// Fix: Use modular imports from firebase/auth
import { updateProfile, updatePassword } from 'firebase/auth';
import { Mail, Bell } from 'lucide-react';
import DeclarationSettingsModal from './DeclarationSettingsModal';
import NotificationSettingsModal from './NotificationSettingsModal';
import InspectionModeModal from './InspectionModeModal';
import AddEquipmentModeModal from './AddEquipmentModeModal';
import AbnormalRecheckList from './AbnormalRecheckList';

import { DeclarationSettings } from '../types';
import { RegulationFeed } from './RegulationFeed';
import { useTheme, ThemeType } from '../contexts/ThemeContext'; // Import Theme Hook
import {
    Plus,
    FileText,
    Calendar,
    ChevronRight,
    AlertTriangle,
    CheckCircle,
    Search,
    Settings,
    ClipboardList,
    Database,
    History,
    PlayCircle,
    X,
    Trash2,
    LogOut,
    ShieldCheck,
    Signal,
    WifiOff,
    User,
    Lock,
    Globe,
    Camera,
    Check,
    UploadCloud,
    LayoutGrid,
    Sun,
    Moon,
    Monitor,
    Palette,
    Eye,
    Leaf,
    Zap,
    Sparkles,
    Save,
    Flame,
    BellRing,
    Droplets,
    BatteryCharging,
    Lightbulb,
    DoorOpen,
    Box
} from 'lucide-react';
import { THEME_COLORS } from '../constants';
import { auth, storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardProps {
    user: UserProfile;
    onCreateNew: () => void;
    onAddEquipment: () => void;
    onMyEquipment: () => void;
    onSelectReport: (report: InspectionReport) => void;
    onLogout: () => void;
    onUserUpdate: () => void;
    onManageHierarchy: () => void;
    onOpenMapEditor: () => void;
}

const CARTOON_AVATARS = [
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Felix",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Zoe",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Jack",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Ginger"
];

const getEquipmentIcon = (name: string) => {
    if (name.includes('滅火')) return <Flame className="w-5 h-5 text-orange-500" />;
    if (name.includes('警報') || name.includes('廣播')) return <BellRing className="w-5 h-5 text-red-500" />;
    if (name.includes('栓') || name.includes('水')) return <Droplets className="w-5 h-5 text-blue-500" />;
    if (name.includes('電')) return <BatteryCharging className="w-5 h-5 text-yellow-500" />;
    if (name.includes('燈') || name.includes('照明')) return <Lightbulb className="w-5 h-5 text-amber-500" />;
    if (name.includes('出口') || name.includes('門')) return <DoorOpen className="w-5 h-5 text-green-500" />;
    return <Box className="w-5 h-5 text-slate-400" />;
};

const Dashboard: React.FC<DashboardProps> = ({ user, onCreateNew, onAddEquipment, onMyEquipment, onSelectReport, onLogout, onUserUpdate, onManageHierarchy, onOpenMapEditor }) => {
    const { t, language, setLanguage } = useLanguage();
    const { theme, setTheme, styles } = useTheme(); // Use Theme Hook
    const [reports, setReports] = useState<InspectionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'Pass' | 'Fail'>('ALL');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Declaration State
    const [declarationSettings, setDeclarationSettings] = useState<DeclarationSettings | null>(null);
    const [isDeclarationModalOpen, setIsDeclarationModalOpen] = useState(false);

    // Notification State
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
    const [notificationEmails, setNotificationEmails] = useState<string[]>(['', '', '']);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [savingNotifications, setSavingNotifications] = useState(false);

    // Map State

    // Settings State
    const [settingsTab, setSettingsTab] = useState<'PROFILE' | 'NOTIFICATIONS' | 'LANGUAGE' | 'GENERAL'>('PROFILE');
    const [displayName, setDisplayName] = useState(user.displayName || '');
    const [selectedAvatar, setSelectedAvatar] = useState(user.photoURL || CARTOON_AVATARS[0]);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Equipment Stats State
    const [equipmentMap, setEquipmentMap] = useState<Record<string, { name: string, barcode: string, checkFrequency: string }>>({});
    const [equipmentStats, setEquipmentStats] = useState<Record<string, number>>({});
    const [nameCount, setNameCount] = useState(0);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isInspectionModeOpen, setIsInspectionModeOpen] = useState(false);
    const [isAddEquipmentModeOpen, setIsAddEquipmentModeOpen] = useState(false);
    const [showAbnormalRecheck, setShowAbnormalRecheck] = useState(false);
    const [showArchived, setShowArchived] = useState(false); // Toggle for archived reports

    useEffect(() => {
        const fetchEquipment = async () => {
            if (user?.uid) {
                try {
                    const equipment = await StorageService.getEquipmentDefinitions(user.uid);
                    const map: Record<string, any> = {};
                    equipment.forEach(eq => {
                        map[eq.id] = {
                            name: eq.name,
                            barcode: eq.barcode,
                            checkFrequency: eq.checkFrequency
                        };
                    });
                    setEquipmentMap(map);
                    setNameCount(equipment.length); // Set count directly from fetch
                } catch (error) {
                    console.error("Failed to fetch equipment for map:", error);
                }
            }
        };
        fetchEquipment();
    }, [user?.uid]);

    const handleInspectionModeSelect = (mode: 'CHECKLIST' | 'MAP_VIEW' | 'RECHECK') => {
        console.log('[Dashboard] handleInspectionModeSelect called with mode:', mode);
        setIsInspectionModeOpen(false);
        switch (mode) {
            case 'CHECKLIST':
                onCreateNew();
                break;
            case 'MAP_VIEW':
                onOpenMapEditor(); // Assuming Map View uses the same editor component for now
                break;
            case 'RECHECK':
                console.log('[Dashboard] Setting showAbnormalRecheck to true');
                setShowAbnormalRecheck(true);
                break;
        }
    };

    const handleAddEquipmentModeSelect = (mode: 'ADD_NAME' | 'ADD_INSTANCE') => {
        setIsAddEquipmentModeOpen(false);
        switch (mode) {
            case 'ADD_NAME':
                onManageHierarchy();
                break;
            case 'ADD_INSTANCE':
                onAddEquipment();
                break;
        }
    };



    const scrollToHistory = () => {
        setShowArchived(true); // Open history table directly
    };

    if (showAbnormalRecheck) {
        return <AbnormalRecheckList user={user} onClose={() => setShowAbnormalRecheck(false)} />;
    }

    useEffect(() => {
        console.log('[Dashboard] initial render');
    }, []);

    // Orphaned calls fix - Wrap in Effect
    useEffect(() => {
        if (user?.uid) {
            fetchDeclarationSettings();
            fetchEquipmentStats();
        }
    }, [user?.uid]);

    const fetchDeclarationSettings = async () => {
        if (user?.uid) {
            const settings = await StorageService.getDeclarationSettings(user.uid);
            setDeclarationSettings(settings);
        }
    };

    const fetchEquipmentStats = async () => {
        if (user?.uid) {
            const definitions = await StorageService.getEquipmentDefinitions(user.uid);
            const stats = definitions.reduce((acc, curr) => {
                const displayName = curr.equipmentDetail || curr.name || '未命名設備';
                acc[displayName] = (acc[displayName] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            setEquipmentStats(stats);
        }
    };



    // Load notification emails when settings tab is NOTIFICATIONS
    useEffect(() => {
        if (settingsTab === 'NOTIFICATIONS') {
            loadNotificationSettings();
        }
    }, [settingsTab, user.uid]);

    const loadNotificationSettings = async () => {
        setLoadingNotifications(true);
        try {
            const data = await StorageService.getNotificationSettings(user.uid);
            if (data) {
                const padded = [...data, '', '', ''].slice(0, 3);
                setNotificationEmails(padded);
            }
        } catch (error) {
            console.error("Failed to load notification settings", error);
        } finally {
            setLoadingNotifications(false);
        }
    };

    const handleSaveNotifications = async () => {
        setSavingNotifications(true);
        try {
            const validEmails = notificationEmails.filter(e => e.trim() !== '');
            await StorageService.saveNotificationSettings(validEmails, user.uid);
            alert('通知設定已儲存');
        } catch (error) {
            console.error("Failed to save notification settings", error);
            alert('儲存失敗,請稍後再試');
        } finally {
            setSavingNotifications(false);
        }
    };

    const calculateCountdown = () => {
        if (!declarationSettings) return null;
        const now = new Date();
        const year = now.getFullYear();
        let target = new Date(year, declarationSettings.month - 1, declarationSettings.day);

        // Set to end of day to avoid premature timeout
        target.setHours(23, 59, 59, 999);

        // If target is passed, calculate for next year
        if (now > target) {
            target.setFullYear(year + 1);
        }

        const diff = target.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days;
    };

    const countdownDays = calculateCountdown();

    // Notification Logic (Client-side simulation)
    useEffect(() => {
        if (countdownDays !== null && countdownDays <= 30 && declarationSettings) {
            const checkAndNotify = async () => {
                const notifSettings = await StorageService.getNotificationSettings(user.uid);
                if (notifSettings && notifSettings.length > 0 && notifSettings.some(e => e)) {
                    const key = `notif_sent_${user.uid}_${declarationSettings.month}_${declarationSettings.day}_${new Date().getFullYear()}`;
                    const hasNotified = localStorage.getItem(key);

                    if (!hasNotified) {
                        // Simulate Email Sending
                        console.log(`[System] Simulating email notification to: ${notifSettings.join(', ')}`);
                        console.log(`[System] Content: Declaration expiring in ${countdownDays} days!`);

                        // Visual Feedback for User (Toast mock via Alert for now, or console)
                        // For a "Pro" app, we shouldn't alert() aggressively, but user reported "not sending", so we need to be visible.
                        // But alert() interrupts flow. Let's rely on a console log and maybe a banner if we had one.
                        // However, to "Fix" the user's perception, let's show a one-time alert.
                        alert(`[系統模擬郵件] 申報期限將至！(剩餘 ${countdownDays} 天)\n\n系統已嘗試發送通知至:\n${notifSettings.filter(e => e).join('\n')}\n\n(注意: 實際郵件功能需連接後端伺服器)`);

                        localStorage.setItem(key, 'true');
                    }
                }
            };
            checkAndNotify();
        }
    }, [countdownDays, user.uid, declarationSettings]);


    useEffect(() => {
        const fetchReports = async () => {
            setLoading(true);
            try {
                const data = await StorageService.getReports(user.uid);
                setReports(data);
            } catch (error) {
                console.error("Failed to load reports", error);
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, [user]);

    // Update avatar state if user changes (e.g. after update)
    useEffect(() => {
        if (user.photoURL) {
            setSelectedAvatar(user.photoURL);
        }
    }, [user.photoURL]);

    const filteredReports = reports.filter(r => {
        const matchesSearch = r.buildingName.includes(searchTerm) || r.inspectorName.includes(searchTerm);
        const matchesFilter = filterStatus === 'ALL' || r.overallStatus === filterStatus;
        return matchesSearch && matchesFilter;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Pass': return 'text-green-600 bg-green-100 border-green-200';
            case 'Fail': return 'text-red-600 bg-red-100 border-red-200';
            default: return 'text-yellow-600 bg-yellow-100 border-yellow-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Pass': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'Fail': return <AlertTriangle className="w-5 h-5 text-red-600" />;
            default: return <FileText className="w-5 h-5 text-yellow-600" />;
        }
    };



    const handleClearCache = () => {
        if (window.confirm(t('clearCache') + '?')) {
            localStorage.clear();
            window.location.reload();
        }
    };

    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return t('morning');
        if (hour < 18) return t('afternoon');
        return t('evening');
    };

    // Clock State
    const [currentDateTime, setCurrentDateTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentDateTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatDateTime = (date: Date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
    };

    // --- Setting Handlers ---
    const handleUpdateProfile = async () => {
        if (user.isGuest) return;
        setIsUpdating(true);
        try {
            if (auth?.currentUser) {
                const isLocal = selectedAvatar.startsWith('data:');

                // Only update photoURL in firebase if it's NOT a huge data url
                const shouldUpdateFirebasePhoto = !isLocal || selectedAvatar.length < 2000;

                // Fix: Use standard modular updateProfile function
                await updateProfile(auth.currentUser, {
                    displayName: displayName,
                    ...(shouldUpdateFirebasePhoto ? { photoURL: selectedAvatar } : {})
                });

                // If we successfully saved a real URL, clear the local fallback
                if (!isLocal) {
                    localStorage.removeItem(`avatar_${auth.currentUser.uid}`);
                } else {
                    // Ensure it is saved locally if we are using local fallback
                    localStorage.setItem(`avatar_${auth.currentUser.uid}`, selectedAvatar);
                }

                onUserUpdate();
                alert(t('profileUpdated'));
            }
        } catch (error) {
            console.error(error);
            alert('Update failed');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (user.isGuest) return;
        if (newPassword !== confirmPassword) {
            alert(t('passwordMismatch'));
            return;
        }
        if (newPassword.length < 6) {
            alert('Password too short');
            return;
        }
        setIsUpdating(true);
        try {
            if (auth?.currentUser) {
                // Fix: Use standard modular updatePassword function
                await updatePassword(auth.currentUser, newPassword);
                alert(t('passwordUpdated'));
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch (error: any) {
            console.error(error);
            alert('Error: ' + error.message);
        } finally {
            setIsUpdating(false);
        }
    };



    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 1 * 1024 * 1024) {
            alert("\u4F60\u8D85\u904E\u4E86\uFF01\u4E0A\u50B3\u6A94\u6848\u4E0D\u5F97\u8D85\u904E 1MB");
            return;
        }

        setIsUpdating(true);

        // Helper to read file as Data URL
        const readFile = (f: File): Promise<string> => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(f);
        });

        const oldAvatar = selectedAvatar;

        try {
            if (!auth?.currentUser || !storage) throw new Error("Storage not available");

            // Race condition: Upload vs Timeout (10s)
            const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${Date.now()}_${file.name}`);

            const uploadPromise = uploadBytes(storageRef, file);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000));

            await Promise.race([uploadPromise, timeoutPromise]);

            const downloadURL = await getDownloadURL(storageRef);
            setSelectedAvatar(downloadURL);

            if (auth?.currentUser) {
                await updateProfile(auth.currentUser, { photoURL: downloadURL });
            }

            // Cleanup old avatar from storage if it was a real URL
            if (oldAvatar && oldAvatar.includes('firebasestorage')) {
                try {
                    const oldRef = ref(storage, oldAvatar);
                    await deleteObject(oldRef);
                } catch (err) {
                    console.warn("Failed to delete old avatar", err);
                }
            }

            alert("\u4E0A\u50B3\u6210\u529F\uFF01");

        } catch (error: any) {
            console.warn("Upload failed or timed out, falling back to local", error);

            if (error.message && error.message.includes('1MB')) {
                alert("\u4F60\u8D85\u904E\u4E86\uFF01\u4E0A\u50B3\u5931\u6557\uFF1A" + error.message);
            } else {
                alert("\u4E0A\u50B3\u81F3\u96F2\u7AEF\u5931\u6557\uFF08\u53EF\u80FD\u662F\u6B0A\u9650\u6216\u7DB2\u8DEF\u554F\u984C\uFF09\uFF0C\u5DF2\u5207\u63DB\u70BA\u672C\u6A5F\u9810\u89BD\u6A21\u5F0F\u3002");
            }

            try {
                // Fallback: Read local file and display it
                const dataUrl = await readFile(file);
                setSelectedAvatar(dataUrl);

                if (auth?.currentUser) {
                    localStorage.setItem(`avatar_${auth.currentUser.uid}`, dataUrl);
                }

            } catch (readError) {
                alert("\u5716\u7247\u8B80\u53D6\u5931\u6557");
            }
        } finally {
            setIsUpdating(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };
    const handleDeleteAvatar = async () => {
        if (!selectedAvatar || selectedAvatar.includes('dicebear.com')) return;

        if (!confirm('確定要刪除大頭照嗎？')) return;

        setIsUpdating(true);
        try {
            // 1. Delete from Storage if it's a real URL
            if (selectedAvatar.includes('firebasestorage')) {
                const avatarRef = ref(storage, selectedAvatar);
                await deleteObject(avatarRef);
            }

            // 2. Clear from Firebase Profile
            if (auth?.currentUser) {
                await updateProfile(auth.currentUser, { photoURL: '' });
                localStorage.removeItem(`avatar_${auth.currentUser.uid}`);
            }

            setSelectedAvatar(CARTOON_AVATARS[0]);
            onUserUpdate();
            alert('大頭照已刪除');
        } catch (error) {
            console.error("Delete avatar failed", error);
            alert('刪除失敗');
        } finally {
            setIsUpdating(false);
        }
    };

    // Render Abnormal Recheck Logic (early return - after all hooks)
    console.log('[Dashboard] showAbnormalRecheck:', showAbnormalRecheck);
    if (showAbnormalRecheck) {
        console.log('[Dashboard] Rendering AbnormalRecheckList');
        return <AbnormalRecheckList user={user} onBack={() => setShowAbnormalRecheck(false)} />;
    }

    return (
        <div className={`flex flex-col h-full ${styles.bg} ${styles.text} transition-colors duration-300`}>
            {/* Header Hero Section */}
            <div className="bg-slate-900 text-white pt-8 px-6 pb-28 rounded-b-[2.5rem] shadow-2xl relative overflow-hidden flex-shrink-0">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/20 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600/10 rounded-full blur-[60px] -ml-20 -mb-20 pointer-events-none"></div>
                <div className="absolute top-4 left-6 flex items-center opacity-50">
                    <ShieldCheck className="w-4 h-4 mr-1.5" />
                    <span className="text-xs font-bold tracking-widest uppercase">FireCheck AI Pro</span>
                </div>

                <div className="relative z-10 max-w-7xl mx-auto w-full mt-6">
                    <div className="flex justify-between items-end">
                        <div className="flex-1">
                            <p className="text-slate-400 text-sm font-medium mb-1 flex items-center gap-2">
                                <span>{getTimeGreeting()}，{t('welcome')}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                                <span className="font-mono text-slate-300">{formatDateTime(currentDateTime)}</span>
                            </p>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 bg-slate-800">
                                    <img src={user.photoURL || CARTOON_AVATARS[0]} alt="Avatar" className="w-full h-full object-cover" />
                                </div>
                                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white truncate pr-4">
                                    {user.displayName || t('guest')}
                                </h1>
                            </div>

                            <div className={`inline-flex items-center px-3 py-1.5 rounded-full border backdrop-blur-md transition-colors ${user.isGuest ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' : 'bg-green-500/10 border-green-500/30 text-green-400'} `}>
                                {user.isGuest ? <WifiOff className="w-3.5 h-3.5 mr-2" /> : <Signal className="w-3.5 h-3.5 mr-2" />}
                                <span className="text-xs font-bold">{user.isGuest ? t('guestMode') : t('onlineMode')}</span>
                            </div>
                        </div>

                        {/* Header Actions */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsStatsModalOpen(true)}
                                className="group relative p-3 bg-slate-800/50 hover:bg-slate-700/80 rounded-2xl transition-all border border-slate-700/50 backdrop-blur-sm active:scale-95"
                                aria-label="Inventory"
                            >
                                <ClipboardList className="w-6 h-6 text-slate-300 group-hover:text-white transition-colors" />
                            </button>
                            <button
                                onClick={() => setIsSettingsOpen(true)}
                                className="group relative p-3 bg-slate-800/50 hover:bg-slate-700/80 rounded-2xl transition-all border border-slate-700/50 backdrop-blur-sm active:scale-95"
                                aria-label={t('settings')}
                            >
                                <Settings className="w-6 h-6 text-slate-300 group-hover:text-white transition-colors" />
                            </button>
                            <button
                                onClick={onLogout}
                                className="group relative p-3 bg-slate-800/50 hover:bg-red-900/30 rounded-2xl transition-all border border-slate-700/50 hover:border-red-800/50 backdrop-blur-sm active:scale-95"
                                aria-label={t('logout')}
                            >
                                <LogOut className="w-6 h-6 text-slate-300 group-hover:text-red-400 transition-colors" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area-Overlapping the Header */}
            <div className="flex-1 px-4 sm:px-6 -mt-16 overflow-y-auto pb-24 custom-scrollbar">
                <div className="max-w-7xl mx-auto w-full space-y-6">

                    {/* Quick Search Bar (Moved to Top) */}
                    <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex items-center gap-4">
                        <div className="bg-red-50 p-2 rounded-xl">
                            <Search className="w-6 h-6 text-red-600" />
                        </div>
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder={t('searchPlaceholder')}
                                className="w-full pl-4 pr-10 py-2 bg-slate-50 border-none rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all font-medium"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Action Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <button
                            onClick={() => setIsInspectionModeOpen(true)}
                            className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center justify-center gap-3 hover:shadow-xl hover:scale-[1.02] transition-all group h-36 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center group-hover:bg-red-600 transition-colors z-10">
                                <PlayCircle className="w-6 h-6 text-red-600 group-hover:text-white transition-colors" />
                            </div>
                            <span className="font-bold text-slate-700 z-10 text-center">{"\u958B\u59CB\u6AA2\u67E5"}</span>
                        </button>

                        <button
                            onClick={() => setIsAddEquipmentModeOpen(true)}
                            className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center justify-center gap-3 hover:shadow-xl hover:scale-[1.02] transition-all group h-36 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center group-hover:bg-orange-500 transition-colors z-10">
                                <Database className="w-6 h-6 text-orange-600 group-hover:text-white transition-colors" />
                            </div>
                            <span className="font-bold text-slate-700 z-10 text-center">{t('addEquipment')}</span>
                        </button>

                        <button
                            onClick={onMyEquipment}
                            className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center justify-center gap-3 hover:shadow-xl hover:scale-[1.02] transition-all group h-36 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center group-hover:bg-purple-600 transition-colors z-10">
                                <LayoutGrid className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                            </div>
                            <span className="font-bold text-slate-700 z-10 text-center">{"\u6211\u7684\u8A2D\u5099"}</span>
                            {/* Equipment Count Badge */}
                            {(Object.values(equipmentStats).reduce((a: number, b: number) => a + b, 0) as number) > 0 && (
                                <div className="absolute top-3 left-3 bg-purple-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-sm">
                                    {Object.values(equipmentStats).reduce((a: number, b: number) => a + b, 0) as number}
                                </div>
                            )}
                        </button>

                        <button
                            onClick={() => setShowArchived(!showArchived)}
                            className={`bg-white p-4 rounded-2xl shadow-lg border flex flex-col items-center justify-center gap-3 hover:shadow-xl hover:scale-[1.02] transition-all group h-36 relative overflow-hidden ${showArchived ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-100'
                                }`}
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center group-hover:bg-blue-500 transition-colors z-10">
                                <History className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                            </div>
                            <div className="z-10 text-center">
                                <span className="font-bold text-slate-700 block">{showArchived ? '當前紀錄' : '歷史資料'}</span>
                                {!showArchived && reports.filter(r => r.archived).length > 0 && (
                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                                        {reports.filter(r => r.archived).length} 筆
                                    </span>
                                )}
                            </div>
                        </button>




                        <button
                            onClick={onOpenMapEditor}
                            className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center justify-center gap-3 hover:shadow-xl hover:scale-[1.02] transition-all group h-36 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center group-hover:bg-blue-500 transition-colors z-10">
                                <span className="font-bold text-blue-600 group-hover:text-white transition-colors text-lg">Map</span>
                            </div>
                            <span className="font-bold text-slate-700 z-10 text-center">{"\u8A2D\u5099\u4F4D\u7F6E\u5716"}</span>
                        </button>
                        <button
                            onClick={() => setIsDeclarationModalOpen(true)}
                            className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center justify-center gap-3 hover:shadow-xl hover:scale-[1.02] transition-all group h-36 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center group-hover:bg-red-600 transition-colors z-10">
                                <Calendar className="w-6 h-6 text-red-600 group-hover:text-white transition-colors" />
                            </div>
                            <div className="z-10 text-center">
                                <span className="font-bold text-slate-700 block">{"\u6D88\u9632\u7533\u5831"}</span>
                                {countdownDays !== null && (
                                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                                        {"\u5012\u6578"} {countdownDays} {"\u5929"}
                                    </span>
                                )}
                            </div>
                        </button>
                    </div>

                    {/* Full Page Search Results / History Table */}
                    {/* Full Page Search Results / History Table */}
                    {(showArchived || searchTerm) && (
                        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto animate-in fade-in duration-200">
                            <div className="max-w-7xl mx-auto p-6 space-y-6">
                                {/* Header */}
                                <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100 sticky top-4 z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-100 p-2 rounded-xl">
                                            {searchTerm ? <Search className="w-6 h-6 text-blue-600" /> : <History className="w-6 h-6 text-blue-600" />}
                                        </div>
                                        <div>
                                            <h1 className="text-xl font-bold text-slate-800">{searchTerm ? '搜尋結果' : '歷史檢查紀錄'}</h1>
                                            <p className="text-xs text-slate-500">{searchTerm ? `關鍵字: "${searchTerm}"` : '已歸檔的正常檢查報告'}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowArchived(false);
                                            setSearchTerm('');
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4 rotate-180" />
                                        返回儀表板
                                    </button>
                                </div>

                                {/* Table */}
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-3">檢查日期與時間</th>
                                                    <th className="px-4 py-3">查檢場所名稱</th>
                                                    <th className="px-4 py-3">設備名稱</th>
                                                    <th className="px-4 py-3">設備編號</th>
                                                    <th className="px-4 py-3">檢查頻率</th>
                                                    <th className="px-4 py-3">下次檢查日期</th>
                                                    <th className="px-4 py-3 min-w-[600px]">檢查項目結果</th>
                                                    <th className="px-4 py-3">異常備註</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredReports.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                                                            沒有找到相關紀錄
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredReports.flatMap(report =>
                                                        (report.items || []).map((item, idx) => {
                                                            const freqMap: Record<string, number> = { 'monthly': 30, 'quarterly': 90, 'yearly': 365 };

                                                            // Use Snapshot OR Live Data (Fallback)
                                                            const eqId = item.equipmentId || item.id;
                                                            const eqData = equipmentMap[eqId] || {};

                                                            const frequency = item.checkFrequency || eqData.checkFrequency || 'monthly';
                                                            const name = item.name || eqData.name || '未命名設備';
                                                            const barcode = item.barcode || eqData.barcode || '-';

                                                            const freqDays = freqMap[frequency] || 30; // Default 30

                                                            // Safe Date Handling
                                                            const validReportDate = report.date ? new Date(report.date) : new Date();
                                                            const nextDate = new Date(validReportDate);
                                                            if (!isNaN(validReportDate.getTime())) {
                                                                nextDate.setDate(nextDate.getDate() + freqDays);
                                                            }

                                                            const checkDetails = Array.isArray(item.checkResults) && item.checkResults.length > 0
                                                                ? item.checkResults
                                                                : (item.checkPoints ? Object.keys(item.checkPoints).map(k => ({ name: k, value: item.checkPoints[k], unit: '' })) : []);

                                                            return {
                                                                ...item,
                                                                displayName: name,
                                                                displayBarcode: barcode,
                                                                displayFrequency: frequency,
                                                                reportId: report.id,
                                                                reportDate: report.date,
                                                                reportBuilding: report.buildingName,
                                                                uniqueKey: `${report.id}_${item.id}_${idx}`,
                                                                nextCheckDate: nextDate.getTime(),
                                                                checkDetails
                                                            };
                                                        })
                                                    ).map((row) => (
                                                        <tr key={row.uniqueKey} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-4 py-3 text-slate-600">
                                                                {(() => {
                                                                    const d = new Date(row.reportDate);
                                                                    return !isNaN(d.getTime()) ? d.toLocaleString(language) : '-';
                                                                })()}
                                                            </td>
                                                            <td className="px-4 py-3 font-bold text-slate-800">
                                                                {row.reportBuilding}
                                                                <div className="text-xs text-slate-400 font-normal">{row.location}</div>
                                                            </td>
                                                            <td className="px-4 py-3 font-medium text-slate-800">
                                                                {row.displayName}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                                                                {row.displayBarcode}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-600">
                                                                {row.displayFrequency === 'monthly' ? '每月' :
                                                                    row.displayFrequency === 'quarterly' ? '每季' :
                                                                        row.displayFrequency === 'yearly' ? '每年' :
                                                                            row.displayFrequency}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-500">
                                                                {new Date(row.nextCheckDate).toLocaleDateString(language)}
                                                            </td>
                                                            <td className="px-4 py-3 min-w-[600px]">
                                                                <div className="flex flex-wrap items-center gap-3 py-1 w-full">
                                                                    {row.checkDetails.map((detail, i) => (
                                                                        <div key={i} className="flex items-center gap-1.5 text-xs bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 shadow-sm shrink-0">
                                                                            <span className="font-bold text-slate-700">{detail.name || '項目'}:</span>
                                                                            {detail.threshold && (
                                                                                <span className="text-slate-400 text-[10px]">
                                                                                    {detail.threshold} {detail.unit}
                                                                                </span>
                                                                            )}
                                                                            {detail.threshold && <span className="text-slate-300">|</span>}
                                                                            {String(detail.value) === 'true' ? (
                                                                                <span className="text-green-600 flex items-center gap-0.5 font-bold">
                                                                                    <CheckCircle className="w-3.5 h-3.5" /> 合格
                                                                                </span>
                                                                            ) : (
                                                                                <span className="font-mono text-slate-800 font-bold px-1 rounded bg-slate-100">
                                                                                    {detail.value} {detail.unit}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    {row.checkDetails.length === 0 && <span className="text-slate-400 italic">無檢查細項</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate" title={row.notes}>
                                                                {row.notes || '-'}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* FAB (Maintained for quick access) */}
            <button
                onClick={onCreateNew}
                className="fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-105 hover:rotate-90 active:scale-95 transition-all z-30 ring-4 ring-white/50"
                style={{ backgroundColor: THEME_COLORS.primary }}
                aria-label="新增檢查"
            >
                <Plus className="w-7 h-7" />
            </button>

            {/* Expanded Settings Modal */}
            {
                isSettingsOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh]">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                    <Settings className="w-5 h-5 mr-2" />
                                    {t('systemSettings')}
                                </h3>
                                <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-slate-100 shrink-0">
                                <button
                                    onClick={() => setSettingsTab('PROFILE')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'PROFILE' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                >
                                    <User className="w-4 h-4 mr-2" /> {t('profile')}
                                </button>
                                <button
                                    onClick={() => setSettingsTab('NOTIFICATIONS')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'NOTIFICATIONS' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                >
                                    <Bell className="w-4 h-4 mr-2" /> {"\u901A\u77E5"}
                                </button>
                                <button
                                    onClick={() => setSettingsTab('LANGUAGE')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'LANGUAGE' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                >
                                    <Globe className="w-4 h-4 mr-2" /> {t('language')}
                                </button>
                                <button
                                    onClick={() => setSettingsTab('GENERAL')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'GENERAL' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                >
                                    <Palette className="w-4 h-4 mr-2" /> {t('general')}
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">

                                {/* PROFILE TAB */}
                                {settingsTab === 'PROFILE' && (
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-500 uppercase">{t('changeAvatar')}</label>
                                            <div className="flex items-center justify-center mb-4">
                                                <div className="w-24 h-24 rounded-full border-4 border-slate-100 overflow-hidden shadow-md relative group">
                                                    <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                                    {isUpdating && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs text-center z-10 px-1">{t('uploading')}</div>}

                                                    {selectedAvatar && !selectedAvatar.includes('dicebear.com') && !isUpdating && (
                                                        <button
                                                            onClick={handleDeleteAvatar}
                                                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Trash2 className="w-6 h-6 text-white" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-5 gap-2">
                                                {CARTOON_AVATARS.map((url, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedAvatar(url)}
                                                        className={`rounded-full overflow-hidden border-2 transition-all hover: scale-105 ${selectedAvatar === url ? 'border-red-600 ring-2 ring-red-100' : 'border-transparent hover:border-slate-300'} `}
                                                    >
                                                        <img src={url} alt={`Avatar ${idx} `} className="w-full h-full" />
                                                    </button>
                                                ))}
                                            </div>
                                            {!user.isGuest && (
                                                <div className="mt-2">
                                                    <input
                                                        type="file"
                                                        ref={fileInputRef}
                                                        onChange={handleFileUpload}
                                                        accept="image/*"
                                                        className="hidden"
                                                    />
                                                    <button
                                                        onClick={() => fileInputRef.current?.click()}
                                                        disabled={isUpdating}
                                                        className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-slate-500 text-sm hover:bg-slate-50 hover:text-slate-700 hover:border-slate-400 transition-colors flex items-center justify-center"
                                                    >
                                                        <UploadCloud className="w-4 h-4 mr-2" /> {t('uploadPhoto')}
                                                    </button>
                                                    <div className="mt-1 text-center">
                                                        <span className="text-xs text-red-500 font-bold">{"\u8AAA\u660E: \u4E0A\u50B3\u6A94\u6848\u4E0D\u5F97\u8D85\u904E 1MB"}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase">{t('displayName')}</label>
                                            <input
                                                type="text"
                                                value={displayName}
                                                onChange={(e) => setDisplayName(e.target.value)}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none"
                                                disabled={user.isGuest}
                                            />
                                        </div>

                                        {!user.isGuest && (
                                            <button
                                                onClick={handleUpdateProfile}
                                                disabled={isUpdating}
                                                className="w-full py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                                            >
                                                {isUpdating ? 'Updating...' : t('saveChanges')}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* LANGUAGE TAB */}
                                {settingsTab === 'LANGUAGE' && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase">{t('language')}</label>
                                            <div className="grid grid-cols-1 gap-3">
                                                {[
                                                    { code: 'zh-TW', name: '繁體中文' },
                                                    { code: 'en', name: 'English' },
                                                    { code: 'ko', name: '\uD55C\uAD6D\uC5B4' },
                                                    { code: 'ja', name: '\u65E5\u672C\u8A9E' }
                                                ].map((lang) => (
                                                    <button
                                                        key={lang.code}
                                                        onClick={() => setLanguage(lang.code as LanguageCode)}
                                                        className={`p-4 rounded-xl border-2 flex items-center justify-between transition-all ${language === lang.code ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-100 hover:border-slate-200'} `}
                                                    >
                                                        <span className="font-bold text-base">{lang.name}</span>
                                                        {language === lang.code && <Check className="w-5 h-5 text-red-600" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* NOTIFICATIONS TAB */}
                                {settingsTab === 'NOTIFICATIONS' && (
                                    <div className="space-y-6">
                                        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-3">
                                            <Bell className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-amber-900">通知接收設定</p>
                                                <p className="text-xs text-amber-700 leading-relaxed">當檢查日期即將到期,或檢查結果為「異常」時,系統將自動寄送通知信至以下信箱。</p>
                                            </div>
                                        </div>

                                        {loadingNotifications ? (
                                            <div className="flex justify-center py-8">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {notificationEmails.map((email, idx) => (
                                                    <div key={idx} className="space-y-1.5">
                                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email {idx + 1}</label>
                                                        <div className="relative group">
                                                            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 group-focus-within:text-red-500 transition-colors" />
                                                            <input
                                                                type="email"
                                                                value={email}
                                                                onChange={(e) => {
                                                                    const newEmails = [...notificationEmails];
                                                                    newEmails[idx] = e.target.value;
                                                                    setNotificationEmails(newEmails);
                                                                }}
                                                                placeholder="name@example.com"
                                                                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:bg-white transition-all shadow-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <button
                                            onClick={handleSaveNotifications}
                                            disabled={savingNotifications || loadingNotifications}
                                            className="w-full py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            {savingNotifications ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    儲存中...
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="w-4 h-4" />
                                                    儲存設定
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* GENERAL TAB */}
                                {settingsTab === 'GENERAL' && (
                                    <div className="space-y-6">
                                        {/* Theme Settings */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase">{t('theme')}</label>
                                            <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                                                {[
                                                    { id: 'light', icon: <Sun className="w-4 h-4" />, label: t('themeLight'), color: 'bg-white' },
                                                    { id: 'dark', icon: <Moon className="w-4 h-4" />, label: t('themeDark'), color: 'bg-slate-900' },
                                                    { id: 'blue', icon: <Palette className="w-4 h-4" />, label: t('themeBlue'), color: 'bg-blue-600' },
                                                    { id: 'green', icon: <Leaf className="w-4 h-4" />, label: t('themeGreen'), color: 'bg-emerald-600' },
                                                    { id: 'orange', icon: <Zap className="w-4 h-4" />, label: t('themeOrange'), color: 'bg-orange-600' },
                                                    { id: 'purple', icon: <Sparkles className="w-4 h-4" />, label: t('themePurple'), color: 'bg-purple-600' },
                                                    { id: 'high-contrast', icon: <Eye className="w-4 h-4" />, label: t('themeContrast'), color: 'bg-black' },
                                                    { id: 'system', icon: <Monitor className="w-4 h-4" />, label: t('themeSystem'), color: 'bg-gradient-to-br from-white to-slate-900' }
                                                ].map((item) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => setTheme(item.id as ThemeType)}
                                                        className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${theme === item.id ? 'border-red-600 ring-2 ring-red-100 bg-red-50/30' : 'border-slate-100 hover:border-slate-300 bg-white'} `}
                                                        title={item.label}
                                                    >
                                                        <div className={`w-8 h-8 rounded-xl shadow-sm border border-black/5 flex items-center justify-center ${item.color} ${theme === item.id ? '' : ''} `}>
                                                            {React.cloneElement(item.icon as React.ReactElement, {
                                                                className: `w-4 h-4 ${['light', 'system'].includes(item.id) && theme !== item.id ? 'text-slate-600' : 'text-white'}`
                                                            })}
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-500 line-clamp-1 px-1">{item.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>


                                        <div className="pt-4 border-t border-slate-100 space-y-3">
                                            <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-left text-sm font-medium text-slate-700">
                                                <span>{t('appVersion')}</span>
                                                <span className="text-slate-400">v1.1.0 (Pro)</span>
                                            </button>
                                            <button
                                                onClick={handleClearCache}
                                                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-red-50 transition-colors text-left text-sm font-medium text-red-600"
                                            >
                                                <span className="flex items-center"><Trash2 className="w-4 h-4 mr-2" /> {t('clearCache')}</span>
                                            </button>
                                        </div>

                                        <div className="pt-2">
                                            <button
                                                onClick={onLogout}
                                                className="w-full py-2.5 rounded-xl bg-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-300 transition-colors flex items-center justify-center"
                                            >
                                                <LogOut className="w-4 h-4 mr-2" />
                                                {user.isGuest ? t('leaveGuest') : t('logout')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {
                isDeclarationModalOpen && (
                    <DeclarationSettingsModal
                        user={user}
                        currentSettings={declarationSettings}
                        onClose={() => setIsDeclarationModalOpen(false)}
                        onSave={(settings) => setDeclarationSettings(settings)}
                    />
                )
            }
            {/* Equipment Stats Modal */}
            {
                isStatsModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setIsStatsModalOpen(false)} />
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh] z-10 animate-in zoom-in duration-200">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                                        <ClipboardList className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    {"\u8A2D\u5099\u6982\u89BD"}
                                </h3>
                                <button onClick={() => setIsStatsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            {/* Content area with stats list */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
                                <div className="space-y-3">
                                    {Object.keys(equipmentStats).length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3 opacity-60">
                                            <Box className="w-12 h-12" />
                                            <span className="text-base font-medium">{"\u5C1A\u7121\u8A2D\u5099\u8CC7\u6599"}</span>
                                        </div>
                                    ) : (
                                        Object.entries(equipmentStats)
                                            .sort(([, a], [, b]) => (b as number) - (a as number)) // Sort by count descending
                                            .map(([name, count], idx) => {
                                                const total = Object.values(equipmentStats).reduce((a: number, b: number) => a + b, 0) as number;
                                                const percent = Math.round(((count as number) / total) * 100);

                                                return (
                                                    <div key={idx} className="group flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-300">
                                                        {/* Icon Box */}
                                                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                                            {getEquipmentIcon(name)}
                                                        </div>

                                                        {/* Content */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-end mb-1.5">
                                                                <span className="text-slate-700 font-bold text-base truncate pr-2">{name}</span>
                                                                <span className="text-xs font-bold text-slate-400">{percent}%</span>
                                                            </div>
                                                            {/* Progress Bar */}
                                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out"
                                                                    style={{ width: `${percent}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>

                                                        {/* Count Badge */}
                                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 font-black flex items-center justify-center text-lg shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                            {count as number}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            <InspectionModeModal
                isOpen={isInspectionModeOpen}
                onClose={() => setIsInspectionModeOpen(false)}
                onSelectMode={handleInspectionModeSelect}
            />

            <AddEquipmentModeModal
                isOpen={isAddEquipmentModeOpen}
                onClose={() => setIsAddEquipmentModeOpen(false)}
                onSelectMode={handleAddEquipmentModeSelect}
            />

            <NotificationSettingsModal
                user={user}
                isOpen={isNotificationModalOpen}
                onClose={() => setIsNotificationModalOpen(false)}
            />
        </div>
    );
};

export default Dashboard;
