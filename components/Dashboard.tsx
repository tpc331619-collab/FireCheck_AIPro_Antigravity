
import React, { useEffect, useState, useRef } from 'react';
import { InspectionReport, EquipmentDefinition, EquipmentHierarchy, DeclarationSettings, EquipmentMap, AbnormalRecord, InspectionStatus, EquipmentType, HealthIndicator, UserProfile } from '../types';
import { StorageService } from '../services/storageService';
// Fix: Use modular imports from firebase/auth
import { updateProfile, updatePassword } from 'firebase/auth';
import { Mail, Bell } from 'lucide-react';


import InspectionModeModal from './InspectionModeModal';
import MapViewInspection from "./MapViewInspection";
import AddEquipmentModeModal from './AddEquipmentModeModal';
import AbnormalRecheckList from './AbnormalRecheckList';
import HistoryTable from './HistoryTable';


import { RegulationFeed } from './RegulationFeed';
import { useTheme, ThemeType } from '../contexts/ThemeContext'; // Import Theme Hook
import {
    Plus,
    FileText,
    Calendar,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    AlertTriangle,
    CheckCircle,
    Search,
    Settings,
    ClipboardList,
    Ruler,
    Database,
    History,
    PlayCircle,
    Wrench,
    X,
    Trash2,
    LogOut,
    Shield,
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
    Info,
    Sun,
    Moon,
    Monitor,
    Palette,
    Eye,
    Leaf,
    Zap,
    Sparkles,
    Save,
    Edit2,
    Activity,
    Flame,
    BellRing,
    Droplets,
    BatteryCharging,
    Lightbulb,
    DoorOpen,
    Box,
    Filter,
    Heart
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
    const [activeModal, setActiveModal] = useState<{ type: 'INSPECTION' | 'RECHECK', item: any } | null>(null);
    const { user: userFromContext } = useTheme(); // Access user from context if needed for role checks
    const [reports, setReports] = useState<InspectionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'Pass' | 'Fail'>('ALL');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

    // Declaration State
    const [declarationSettings, setDeclarationSettings] = useState<DeclarationSettings | null>(null);
    const [isDeclarationModalOpen, setIsDeclarationModalOpen] = useState(false);



    // Light Settings State
    const [lightSettings, setLightSettings] = useState<any>(null);
    const [savingLights, setSavingLights] = useState(false);

    // Map State

    // Settings State
    const [settingsTab, setSettingsTab] = useState<'PROFILE' | 'LANGUAGE' | 'GENERAL' | 'LIGHTS' | 'DECLARATION'>('PROFILE');
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

    const [isInspectionModeOpen, setIsInspectionModeOpen] = useState(false);
    const [isAddEquipmentModeOpen, setIsAddEquipmentModeOpen] = useState(false);
    const [showAbnormalRecheck, setShowAbnormalRecheck] = useState(false);
    const [isMapViewInspectionOpen, setIsMapViewInspectionOpen] = useState(false);
    const [showArchived, setShowArchived] = useState(false); // Toggle for archived reports
    const [abnormalCount, setAbnormalCount] = useState(0); // Count of pending abnormal records
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set()); // Track expanded rows




    // Enhanced Filter States (Phase 2)
    const [dateRange, setDateRange] = useState({
        start: '', // 預設空白，顯示所有日期
        end: ''
    });
    const [locationFilter, setLocationFilter] = useState('');
    const [keywordSearch, setKeywordSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false); // Control filter panel visibility
    const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());

    // Health Indicator State
    const [healthIndicators, setHealthIndicators] = useState<HealthIndicator[]>([]);
    const [editingHealthIndicator, setEditingHealthIndicator] = useState<Partial<HealthIndicator> | null>(null);
    const [savingHealth, setSavingHealth] = useState(false);

    // Fetch Health Indicators
    useEffect(() => {
        if (user?.uid) {
            StorageService.getHealthIndicators(user.uid).then(setHealthIndicators);
        }
    }, [user?.uid]);

    const handleSaveHealthIndicator = async () => {
        if (!user?.uid || !editingHealthIndicator.startDate || !editingHealthIndicator.endDate) {
            alert('請填寫完整資料');
            return;
        }

        try {
            setSavingHealth(true);
            const indicatorData = {
                ...editingHealthIndicator,
                userId: user.uid,
                updatedAt: Date.now()
            };

            if (editingHealthIndicator.id) {
                // Update
                await StorageService.updateHealthIndicator(editingHealthIndicator.id, indicatorData, user.uid);
                setHealthIndicators(prev => prev.map(i => i.id === editingHealthIndicator.id ? { ...i, ...indicatorData } : i));
            } else {
                // Add
                const newId = await StorageService.addHealthIndicator(indicatorData, user.uid);
                setHealthIndicators(prev => [{ ...indicatorData, id: newId } as HealthIndicator, ...prev]);
            }

            setEditingHealthIndicator(null);
            alert('指標已儲存');
        } catch (error) {
            console.error('Failed to save health indicator:', error);
            alert('儲存失敗');
        } finally {
            setSavingHealth(false);
        }
    };

    const handleDeleteHealthIndicator = async (id: string) => {
        if (!user?.uid || !confirm('確定要刪除此指標嗎？')) return;

        try {
            await StorageService.deleteHealthIndicator(id, user.uid);
            setHealthIndicators(prev => prev.filter(i => i.id !== id));
        } catch (error) {
            console.error('Failed to delete health indicator:', error);
            alert('刪除失敗');
        }
    };

    // Column Visibility State (Lifted from HistoryTable)
    const [showColumns, setShowColumns] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState(() => {
        try {
            const saved = localStorage.getItem('history_visibleColumns');
            return saved ? JSON.parse(saved) : {
                index: true,
                date: true,
                building: true,
                equipment: true,
                barcode: true,
                result: true,
                notes: true,
                inspector: true,
                actions: true
            };
        } catch {
            return {
                index: true,
                date: true,
                building: true,
                equipment: true,
                barcode: true,
                result: true,
                notes: true,
                inspector: true,
                actions: true
            };
        }
    });

    const [columnOrder, setColumnOrder] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('history_columnOrder');
            return saved ? JSON.parse(saved) : [
                'index', 'date', 'building', 'equipment', 'barcode', 'result', 'notes', 'inspector', 'actions'
            ];
        } catch {
            return [
                'index', 'date', 'building', 'equipment', 'barcode', 'result', 'notes', 'inspector', 'actions'
            ];
        }
    });

    // Persist column settings
    useEffect(() => {
        localStorage.setItem('history_visibleColumns', JSON.stringify(visibleColumns));
    }, [visibleColumns]);

    useEffect(() => {
        localStorage.setItem('history_columnOrder', JSON.stringify(columnOrder));
    }, [columnOrder]);

    const toggleColumn = (key: keyof typeof visibleColumns) => {
        setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const moveColumn = (index: number, direction: 'left' | 'right') => {
        const newOrder = [...columnOrder];
        const targetIndex = direction === 'left' ? index - 1 : index + 1;

        if (targetIndex >= 0 && targetIndex < newOrder.length) {
            [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
            setColumnOrder(newOrder);
        }
    };

    const columnLabels: Record<keyof typeof visibleColumns, string> = {
        index: '序號',
        date: '檢查日期',
        building: '建築物',
        equipment: '設備名稱',
        barcode: '編號',
        result: '結果',
        notes: '備註',
        inspector: '檢查人員',
        actions: '檢查項目'
    };



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

        const fetchAbnormalCount = async () => {
            if (user?.uid) {
                try {
                    const records = await StorageService.getAbnormalRecords(user.uid);
                    const pendingCount = records.filter(r => r.status === 'pending').length;
                    setAbnormalCount(pendingCount);
                } catch (error) {
                    console.error("Failed to fetch abnormal records:", error);
                }
            }
        };
        fetchAbnormalCount();
    }, [user?.uid]);

    const handleInspectionModeSelect = (mode: 'CHECKLIST' | 'MAP_VIEW' | 'RECHECK') => {
        console.log('[Dashboard] handleInspectionModeSelect called with mode:', mode);
        setIsInspectionModeOpen(false);
        switch (mode) {
            case 'CHECKLIST':
                onCreateNew();
                break;
            case 'MAP_VIEW':
                setIsMapViewInspectionOpen(true);
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

    useEffect(() => {
        console.log('[Dashboard] initial render');
    }, []);

    // Orphaned calls fix - Wrap in Effect
    useEffect(() => {
        if (user?.uid) {
            fetchDeclarationSettings();
            fetchEquipmentStats();
            fetchLightSettings();
        }
    }, [user?.uid]);

    const fetchLightSettings = async () => {
        if (user?.uid) {
            const settings = await StorageService.getLightSettings(user.uid);
            setLightSettings(settings);
        }
    };

    const handleSaveLightSettings = async () => {
        if (!lightSettings) return;
        setSavingLights(true);
        try {
            await StorageService.saveLightSettings(lightSettings, user.uid);
            alert("燈號設定已儲存！");
        } catch (e) {
            console.error(e);
            alert("儲存失敗");
        } finally {
            setSavingLights(false);
        }
    };

    const fetchDeclarationSettings = async () => {
        if (user?.uid) {
            const settings = await StorageService.getDeclarationSettings(user.uid);
            setDeclarationSettings(settings);
        }
    };

    const handleSaveSettings = async (settings: DeclarationSettings) => {
        if (user?.uid) {
            try {
                await StorageService.saveDeclarationSettings(settings, user.uid);
                setDeclarationSettings(settings); // Update local state
            } catch (error) {
                console.error("Error saving settings:", error);
                alert("設定儲存失敗");
            }
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





    const calculateCountdown = () => {
        if (!declarationSettings?.nextDate) return null;

        const now = new Date();
        // Reset time part of now calculation to match date-only comparison
        now.setHours(0, 0, 0, 0);

        let target = new Date(declarationSettings.nextDate);

        // Check for invalid date
        if (isNaN(target.getTime())) return null;

        // Auto-recalculate: if date passed, assume next year (or keep adding years until future)
        if (target.getTime() < now.getTime()) {
            while (target.getTime() < now.getTime()) {
                target.setFullYear(target.getFullYear() + 1);
            }
        }

        const diff = target.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        return days;
    };

    const countdownDays = calculateCountdown();




    const fetchReports = async () => {
        setLoading(true);
        try {
            const data = await StorageService.getReports(user.uid, true);
            setReports(data);
        } catch (error) {
            console.error("Failed to load reports", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [user]);

    // Re-fetch reports when returning from Abnormal Recheck view to ensure updates are visible
    useEffect(() => {
        if (!showAbnormalRecheck) {
            fetchReports();
        }
    }, [showAbnormalRecheck]);

    // Update avatar state if user changes (e.g. after update)
    useEffect(() => {
        if (user.photoURL) {
            setSelectedAvatar(user.photoURL);
        }
    }, [user.photoURL]);

    // Extract unique locations from reports
    const uniqueLocations = React.useMemo(() => {
        const locations = new Set<string>();
        reports.forEach(r => {
            if (r.buildingName) locations.add(r.buildingName);
        });
        return Array.from(locations).sort();
    }, [reports]);

    const filteredReports = reports.filter(r => {
        // Status filter (Optional optimization: if report status exists, can check here)
        // But for exact item filtering, we do it at the item level below.

        // Date range filter
        if (dateRange.start && r.date < new Date(dateRange.start).getTime()) return false;
        if (dateRange.end) {
            // Set end date to end of day (23:59:59)
            const endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
            if (r.date > endDate.getTime()) return false;
        }

        return true;
    });



    const flattenedHistory = React.useMemo(() => {
        // 1. Flatten first
        const flattened: any[] = [];
        // Use reports directly (filteredReports is derived from reports)
        filteredReports.forEach(report => {
            if (!report.items || report.items.length === 0) return;

            report.items.forEach(item => {
                const itemSearchTerm = (searchTerm || '').trim().toLowerCase();
                const itemLocationFilter = (locationFilter || '').trim().toLowerCase();
                const itemKeywordSearch = (keywordSearch || '').trim().toLowerCase();

                const matchesHeaderSearch = !itemSearchTerm ||
                    (item.name?.toLowerCase() || '').includes(itemSearchTerm) ||
                    (item.barcode?.toLowerCase() || '').includes(itemSearchTerm);

                const matchesNameFilter = !itemLocationFilter ||
                    (item.name?.toLowerCase() || '').includes(itemLocationFilter);

                const matchesKeyword = !itemKeywordSearch ||
                    (item.name?.toLowerCase() || '').includes(itemKeywordSearch) ||
                    (item.barcode?.toLowerCase() || '').includes(itemKeywordSearch) ||
                    (item.notes?.toLowerCase() || '').includes(itemKeywordSearch);

                const matchesStatus = filterStatus === 'ALL' ||
                    (item.status === filterStatus) ||
                    (filterStatus === 'Pass' && (item.status === 'OK' || item.status === 'Normal' || item.status === '正常')) ||
                    (filterStatus === 'Fail' && (item.status === 'Abnormal' || item.status === '異常'));

                if (matchesHeaderSearch && matchesNameFilter && matchesKeyword && matchesStatus) {
                    flattened.push({
                        ...item,
                        reportId: report.id,
                        date: report.date,
                        buildingName: report.buildingName,
                        inspectorName: report.inspectorName,
                        overallStatus: report.overallStatus
                    });
                }
            });
        });

        // 2. Return flattened array (sorting handled by DataTables)
        return flattened;

    }, [filteredReports, searchTerm, locationFilter, keywordSearch, filterStatus]);

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
            case 'Fail': return (
                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-300" />
            );
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
        return <AbnormalRecheckList user={user} onBack={() => setShowAbnormalRecheck(false)} lightSettings={lightSettings} />;
    }



    return (
        <div className={`flex flex-col h-full ${styles.bg} ${styles.text} transition-colors duration-300`}>
            {/* Simplified Teal Header */}
            <div className="bg-teal-700 text-white py-3 px-4 shadow-lg flex-shrink-0">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        <span className="font-bold text-lg">無盡維護</span>
                    </div>
                    <div className="flex items-center gap-2">

                        <button onClick={() => setIsHealthModalOpen(true)} className="p-2 hover:bg-teal-600 rounded-lg transition-colors" title="健康指標">
                            <Activity className="w-5 h-5" />
                        </button>
                        <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-teal-600 rounded-lg transition-colors" title="設置">
                            <Settings className="w-5 h-5" />
                        </button>
                        <button onClick={onLogout} className="p-2 hover:bg-teal-600 rounded-lg transition-colors" title="登出">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto pb-24 custom-scrollbar bg-slate-50">
                <div className="max-w-7xl mx-auto w-full p-4 space-y-4">

                    {/* Hero Action Card - Start Inspection */}
                    <div className="bg-gradient-to-br from-rose-400 to-pink-400 rounded-2xl shadow-lg p-6 text-white">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-white/90 text-sm font-medium">{getTimeGreeting()}，{user.displayName || t('guest')}</p>
                                <p className="text-xs text-white/70 mt-1">{formatDateTime(currentDateTime)}</p>
                            </div>
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/30 bg-white/10">
                                <img src={user.photoURL || CARTOON_AVATARS[0]} alt="Avatar" className="w-full h-full object-cover" />
                            </div>
                        </div>

                        {/* Primary Action - Start Inspection */}
                        <button
                            onClick={() => setIsInspectionModeOpen(true)}
                            className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 mb-3 transition-all active:scale-95"
                        >
                            <div className="flex items-center justify-center gap-3 mb-2">
                                <PlayCircle className="w-10 h-10 text-white" />
                                <span className="text-2xl font-bold text-white">開始檢查</span>
                            </div>
                            <p className="text-sm text-white/80">點擊開始設備檢查流程</p>
                        </button>

                        {/* Secondary Info */}
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <Database className="w-4 h-4" />
                                <span className="text-white/90">設備總數: <span className="font-bold">{nameCount}</span></span>
                            </div>
                            {countdownDays !== null && (
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    <span className="text-white/90">申報倒數: <span className="font-bold">{countdownDays}</span> 天</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Unified Overview Widget */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-hidden">
                        <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

                            {/* Left Side: Equipment Overview (Grow to fill) */}
                            <div className="flex-1 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <div className="p-2 bg-indigo-50 rounded-lg">
                                            <ClipboardList className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        設備概覽
                                    </h3>
                                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                                        即時統計
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {Object.keys(equipmentStats).length === 0 ? (
                                        <div className="col-span-full py-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                                            尚無設備資料
                                        </div>
                                    ) : (
                                        Object.entries(equipmentStats)
                                            .sort(([, a], [, b]) => (b as number) - (a as number))
                                            .map(([name, count], idx) => {
                                                const total = Object.values(equipmentStats).reduce((a: number, b: number) => a + b, 0) as number;
                                                const percent = Math.round(((count as number) / total) * 100);

                                                return (
                                                    <div key={idx} className="group relative bg-slate-50 hover:bg-white border border-slate-100 p-3 rounded-xl transition-all hover:shadow-md hover:-translate-y-0.5">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 group-hover:scale-105 transition-transform">
                                                                {getEquipmentIcon(name)}
                                                            </div>
                                                            <span className="font-black text-xl text-slate-700">{count as number}</span>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs font-bold text-slate-600 truncate max-w-[4rem]">{name}</span>
                                                                <span className="text-[10px] font-bold text-slate-400">{percent}%</span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-indigo-500 rounded-full"
                                                                    style={{ width: `${percent}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </div>

                            {/* Right Side: Health Indicators (Fixed width on large screens) */}
                            <div className="lg:w-[320px] xl:w-[360px] p-5 bg-slate-50 flex flex-col shrink-0 border-l border-slate-100">
                                <div className="flex items-center justify-between mb-4 shrink-0">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <div className="p-1.5 bg-rose-100 rounded-lg">
                                            <Heart className="w-4 h-4 text-rose-600 fill-rose-600" />
                                        </div>
                                        健康指標
                                    </h3>
                                    <button
                                        onClick={() => setIsHealthModalOpen(true)}
                                        className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded shadow-sm transition-colors"
                                    >
                                        管理
                                    </button>
                                </div>

                                <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1 max-h-[160px]">
                                    {healthIndicators.length === 0 ? (
                                        <div className="py-8 text-center bg-white rounded-xl border border-slate-200 border-dashed flex flex-col items-center gap-2">
                                            <div className="p-2 bg-slate-50 rounded-full">
                                                <Heart className="w-5 h-5 text-slate-300" />
                                            </div>
                                            <span className="text-xs text-slate-400 font-medium">尚無健康指標</span>
                                        </div>
                                    ) : (
                                        healthIndicators
                                            .slice()
                                            .sort((a, b) => {
                                                const remA = new Date(a.endDate).getTime() - new Date().getTime();
                                                const remB = new Date(b.endDate).getTime() - new Date().getTime();
                                                return remA - remB;
                                            })
                                            .map(indicator => {
                                                const totalDays = Math.ceil((new Date(indicator.endDate).getTime() - new Date(indicator.startDate).getTime()) / (1000 * 60 * 60 * 24));
                                                const remainingDays = Math.ceil((new Date(indicator.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                // Visual percent: If > 60 days, show full. If < 60 days, scale linearly to 0. 
                                                // This ensures urgent items have visually distinct bar lengths.
                                                const percent = remainingDays > 60 ? 100 : Math.max(0, Math.round((remainingDays / 60) * 100));
                                                const isExpired = remainingDays < 0;
                                                const isUrgent = remainingDays < 30 && !isExpired;

                                                return (
                                                    <div key={indicator.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 relative overflow-hidden group hover:border-indigo-300 transition-all hover:shadow-md">
                                                        <div className="flex items-center gap-3">
                                                            {/* Big Icon Box */}
                                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${isExpired ? 'bg-red-50' : isUrgent ? 'bg-amber-50' : 'bg-emerald-50'
                                                                }`}>
                                                                <Heart className={`w-6 h-6 ${isExpired ? 'text-red-500 fill-red-500' : isUrgent ? 'text-amber-500 fill-amber-500 animate-pulse' : 'text-emerald-500 fill-emerald-500'
                                                                    }`} />
                                                            </div>

                                                            {/* Content */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <div className="font-bold text-slate-700 text-sm truncate leading-tight mb-0.5" title={indicator.equipmentName}>
                                                                            {indicator.equipmentName}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-400 font-medium truncate">
                                                                            剩餘天數
                                                                        </div>
                                                                    </div>

                                                                    {/* Big Number Display */}
                                                                    <div className={`text-right ${isExpired ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                        <span className="text-xl font-black tracking-tight">{remainingDays}</span>
                                                                        <span className="text-[10px] font-bold ml-0.5">天</span>
                                                                    </div>
                                                                </div>

                                                                {/* Progress Bar */}
                                                                <div className="mt-1.5 flex items-center gap-2">
                                                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full transition-all duration-500 ${isExpired ? 'bg-red-500' : isUrgent ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                                            style={{ width: `${percent}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

                        <button
                            onClick={() => setIsAddEquipmentModeOpen(true)}
                            className="bg-white rounded-xl shadow-md border border-slate-100 p-4 flex flex-col items-center justify-center gap-3 hover:shadow-lg transition-all active:scale-95"
                        >
                            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center">
                                <Database className="w-7 h-7 text-teal-600" />
                            </div>
                            <span className="font-bold text-slate-700">{t('addEquipment')}</span>
                        </button>

                        <button
                            onClick={onMyEquipment}
                            className="bg-white rounded-xl shadow-md border border-slate-100 p-4 flex flex-col items-center justify-center gap-3 hover:shadow-lg transition-all active:scale-95"
                        >
                            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center">
                                <LayoutGrid className="w-7 h-7 text-teal-600" />
                            </div>
                            <div className="text-center">
                                <span className="font-bold text-slate-700 block">{t('myEquipment')}</span>
                                <span className="text-xs text-teal-600 font-medium">
                                    {nameCount} 筆
                                </span>
                            </div>
                        </button>

                        <button
                            onClick={scrollToHistory}
                            className="bg-white rounded-xl shadow-md border border-slate-100 p-4 flex flex-col items-center justify-center gap-3 hover:shadow-lg transition-all active:scale-95"
                        >
                            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center">
                                <History className="w-7 h-7 text-teal-600" />
                            </div>
                            <div className="text-center">
                                <span className="font-bold text-slate-700 block">{t('history')}</span>
                                <span className="text-xs text-teal-600 font-medium">
                                    {reports.reduce((total, report) => total + (report.stats?.total || report.items?.length || 0), 0)} 筆
                                </span>
                            </div>
                        </button>

                        <button
                            onClick={() => setShowAbnormalRecheck(true)}
                            className="bg-white rounded-xl shadow-md border border-slate-100 p-4 flex flex-col items-center justify-center gap-3 hover:shadow-lg transition-all active:scale-95"
                        >
                            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center">
                                <AlertTriangle className="w-7 h-7 text-teal-600" />
                            </div>
                            <div className="text-center">
                                <span className="font-bold text-slate-700 block">異常複檢</span>
                                {abnormalCount > 0 && (
                                    <span className="text-xs font-bold text-teal-600">
                                        {abnormalCount} 筆
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
                    </div>

                    {/* Full Page Search Results / History Table */}
                    {/* Full Page Search Results / History Table */}
                    {(showArchived || searchTerm) && (
                        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto animate-in fade-in duration-200">
                            <div className="max-w-7xl mx-auto p-6 space-y-6">
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-4 rounded-2xl shadow-sm border-l-4 border-blue-500 sticky top-4 z-30 gap-4 sm:gap-0">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-100 p-2 rounded-xl">
                                            {searchTerm ? <Search className="w-6 h-6 text-blue-600" /> : <History className="w-6 h-6 text-blue-600" />}
                                        </div>
                                        <div>
                                            <h1 className="text-xl font-bold text-slate-800">{searchTerm ? '搜尋結果' : '歷史紀錄'}</h1>
                                            <p className="text-xs text-slate-500">{searchTerm ? `關鍵字: "${searchTerm}"` : '所有檢查紀錄'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                                        {/* Filter Toggle */}
                                        <button
                                            onClick={() => {
                                                setShowFilters(!showFilters);
                                                if (showColumns) setShowColumns(false); // Close columns if opening filters
                                            }}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all whitespace-nowrap text-sm border ${showFilters ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            <Filter className="w-4 h-4" />
                                            {showFilters ? '隱藏篩選' : '顯示篩選'}
                                        </button>

                                        {/* Column Toggle */}
                                        <button
                                            onClick={() => {
                                                setShowColumns(!showColumns);
                                                if (showFilters) setShowFilters(false); // Close filters if opening columns
                                            }}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all whitespace-nowrap text-sm border ${showColumns ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            <LayoutGrid className="w-4 h-4" />
                                            {showColumns ? '隱藏欄位' : '顯示欄位'}
                                        </button>

                                        <div className="w-px h-8 bg-slate-200 mx-1"></div>

                                        <button
                                            onClick={() => {
                                                setShowArchived(false);
                                                setSearchTerm('');
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors whitespace-nowrap text-sm shadow-md shadow-slate-200"
                                        >
                                            <ChevronRight className="w-4 h-4 rotate-180" />
                                            返回儀表板
                                        </button>
                                    </div>
                                </div>

                                {/* Filter Controls */}
                                {showFilters && (
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                            <Filter className="w-4 h-4" />
                                            篩選條件
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Date Range */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1.5 block">開始日期</label>
                                                <input
                                                    type="date"
                                                    value={dateRange.start}
                                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1.5 block">結束日期</label>
                                                <input
                                                    type="date"
                                                    value={dateRange.end}
                                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>

                                            {/* Equipment Name Filter */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1.5 block">設備名稱</label>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="搜尋設備名稱..."
                                                        value={locationFilter}
                                                        onChange={(e) => setLocationFilter(e.target.value)}
                                                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Keyword Search */}
                                        <div className="mt-4">
                                            <label className="text-xs font-bold text-slate-600 mb-1.5 block">關鍵字搜尋</label>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="搜尋條碼、備註..."
                                                    value={keywordSearch}
                                                    onChange={(e) => setKeywordSearch(e.target.value)}
                                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>

                                        {/* Clear Filters Button */}
                                        {(dateRange.start || dateRange.end || locationFilter || keywordSearch) && (
                                            <div className="mt-4 flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        setDateRange({ start: '', end: '' });
                                                        setLocationFilter('');
                                                        setKeywordSearch('');
                                                    }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                    清除篩選
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Column Visibility Panel */}
                                {showColumns && (
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                            <LayoutGrid className="w-4 h-4" />
                                            調整欄位顯示與順序
                                        </h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                            {columnOrder.map((key, index) => {
                                                const label = columnLabels[key as keyof typeof visibleColumns];
                                                const isVisible = visibleColumns[key as keyof typeof visibleColumns];

                                                return (
                                                    <div key={key} className={`flex items-center justify-between px-2 py-2 rounded-xl border transition-all text-sm font-bold ${isVisible
                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                                        }`}>

                                                        {/* Reorder Left */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); moveColumn(index, 'left'); }}
                                                            disabled={index === 0}
                                                            className="p-1 hover:bg-black/10 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                        >
                                                            <ChevronRight className="w-3 h-3 rotate-180" />
                                                        </button>

                                                        {/* Toggle Visibility */}
                                                        <button
                                                            onClick={() => toggleColumn(key as keyof typeof visibleColumns)}
                                                            className="flex-1 flex items-center justify-center gap-2 text-center truncate px-2"
                                                        >
                                                            <span>{label}</span>
                                                            {isVisible && <Check className="w-3 h-3" />}
                                                        </button>

                                                        {/* Reorder Right */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); moveColumn(index, 'right'); }}
                                                            disabled={index === columnOrder.length - 1}
                                                            className="p-1 hover:bg-black/10 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                        >
                                                            <ChevronRight className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Table */}
                                <div className="mt-4">
                                    <HistoryTable
                                        data={flattenedHistory}
                                        onViewDetails={(item) => setActiveModal({ type: 'INSPECTION', item })}
                                        onViewRecheck={(item) => setActiveModal({ type: 'RECHECK', item })}
                                        visibleColumns={visibleColumns}
                                        columnOrder={columnOrder}
                                    />
                                </div>

                            </div >
                        </div >
                    )}
                </div >
            </div >

            {/* Active Details Modal */}
            {
                activeModal && (
                    <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh]">
                            {/* Modal Header */}
                            <div className={`p-6 border-b flex justify-between items-center shrink-0 ${activeModal.type === 'INSPECTION' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                <h3 className={`font-bold text-lg flex items-center gap-2 ${activeModal.type === 'INSPECTION' ? 'text-blue-800' : 'text-red-800'}`}>
                                    {activeModal.type === 'INSPECTION' ? <ClipboardList className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                                    {activeModal.type === 'INSPECTION' ? '詳細查檢紀錄' : '異常複檢資訊'}
                                </h3>
                                <button
                                    onClick={() => setActiveModal(null)}
                                    className={`p-2 rounded-full transition-colors ${activeModal.type === 'INSPECTION' ? 'hover:bg-blue-100 text-blue-500' : 'hover:bg-red-100 text-red-500'}`}
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
                                {activeModal.type === 'INSPECTION' ? (
                                    <div className="p-0">
                                        {/* Inspection Table View */}
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                                                <tr>
                                                    <th className="px-4 py-3 text-left border-b border-slate-200 whitespace-nowrap bg-slate-50">查檢項目</th>
                                                    <th className="px-4 py-3 text-center border-b border-slate-200 whitespace-nowrap bg-slate-50">標準</th>
                                                    <th className="px-4 py-3 text-center border-b border-slate-200 whitespace-nowrap bg-slate-50">結果</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {activeModal.item.checkResults?.map((res: any, idx: number) => {
                                                    let displayValue = '';
                                                    if (res.value === 'true' || res.value === true) displayValue = '正常';
                                                    else if (res.value === 'false' || res.value === false) displayValue = '異常';
                                                    else if (res.threshold) displayValue = `${res.value}${res.unit || ''}`;
                                                    else displayValue = res.value === 'true' ? '正常' : res.value === 'false' ? '異常' : res.value;

                                                    if (displayValue === 'true') displayValue = '正常';
                                                    if (displayValue === 'false') displayValue = '異常';
                                                    if (!isNaN(Number(res.value)) && res.unit && !displayValue.includes(res.unit)) displayValue += res.unit;
                                                    if (res.status === 'Normal') {
                                                        displayValue = res.value ? '正常' : '異常';
                                                        if (res.value && !isNaN(Number(res.value))) displayValue = `${res.value}${res.unit || ''}`;
                                                    }

                                                    const isRed = res.value === false || res.status === 'Abnormal' || res.status === '異常';

                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-4 py-3 text-slate-700 font-medium">{res.name}</td>
                                                            <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs bg-slate-50/50">{res.threshold || '-'}</td>
                                                            <td className={`px-4 py-3 text-center font-bold flex justify-center items-center gap-2 ${isRed ? 'text-red-600' : 'text-green-600'}`}>
                                                                {isRed && <AlertTriangle className="w-4 h-4" />}
                                                                {displayValue}
                                                                {!isRed && <CheckCircle className="w-4 h-4 opacity-50" />}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-6 space-y-4">
                                        {/* Recheck Info View */}
                                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                                            <Info className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-red-800 mb-1">異常處理狀態</p>
                                                <p className="text-sm text-red-700">
                                                    {activeModal.item.status === 'Fixed' || activeModal.item.status === '已改善' ? '已完成改善' : '待處理'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {activeModal.item.repairDate && (
                                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">修復日期</label>
                                                    <div className="font-mono text-lg font-bold text-slate-700 flex items-center gap-2">
                                                        <Calendar className="w-5 h-5 text-slate-400" />
                                                        {new Date(activeModal.item.repairDate).toLocaleDateString(language)}
                                                    </div>
                                                </div>
                                            )}
                                            {activeModal.item.repairNotes && (
                                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">處置說明</label>
                                                    <div className="text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                        {activeModal.item.repairNotes}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                                <button
                                    onClick={() => setActiveModal(null)}
                                    className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 active:scale-95 transition-all shadow-lg shadow-slate-200"
                                >
                                    關閉視窗
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* FAB (Maintained for quick access) */}
            <button
                onClick={onCreateNew}
                className="fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-105 hover:rotate-90 active:scale-95 transition-all z-30 ring-4 ring-white/50"
                style={{ backgroundColor: THEME_COLORS.primary }}
                aria-label="新增檢查"
            >
                <Plus className="w-7 h-7" />
            </button>

            {/* Health Modal */}
            {
                isHealthModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh]">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                    <Activity className="w-5 h-5 mr-2 text-red-500" />
                                    健康指標設定
                                </h3>
                                <button onClick={() => setIsHealthModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-slate-700">指標列表</h4>
                                        <button
                                            onClick={() => setEditingHealthIndicator({} as HealthIndicator)}
                                            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors flex items-center gap-1 shadow-sm shadow-red-200"
                                        >
                                            <Plus className="w-4 h-4" /> 新增指標
                                        </button>
                                    </div>

                                    {/* Edit/Add Form */}
                                    {editingHealthIndicator && (
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6 animate-in fade-in slide-in-from-top-2">
                                            <h5 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                                <Edit2 className="w-4 h-4" />
                                                {editingHealthIndicator.id ? '編輯指標' : '新增指標'}
                                            </h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-slate-500">建築物名稱</label>
                                                    <input
                                                        type="text"
                                                        value={editingHealthIndicator.buildingName || ''}
                                                        onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, buildingName: e.target.value }))}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                        placeholder="例: A棟"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-slate-500">設備名稱</label>
                                                    <input
                                                        type="text"
                                                        value={editingHealthIndicator.equipmentName || ''}
                                                        onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, equipmentName: e.target.value }))}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                        placeholder="例: 滅火器"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-slate-500">起始日期</label>
                                                    <input
                                                        type="date"
                                                        value={editingHealthIndicator.startDate || ''}
                                                        onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, startDate: e.target.value }))}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-slate-500">到期日期</label>
                                                    <input
                                                        type="date"
                                                        value={editingHealthIndicator.endDate || ''}
                                                        onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, endDate: e.target.value }))}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                    />
                                                </div>
                                            </div>

                                            {/* Calculation Preview */}
                                            {editingHealthIndicator.startDate && editingHealthIndicator.endDate && (
                                                <div className="flex gap-4 mb-4 p-3 bg-white rounded-xl border border-slate-100">
                                                    <div className="flex-1">
                                                        <span className="text-xs text-slate-400 block mb-1">期間天數 (到期-起始)</span>
                                                        <span className="font-bold text-slate-700">
                                                            {Math.ceil((new Date(editingHealthIndicator.endDate).getTime() - new Date(editingHealthIndicator.startDate).getTime()) / (1000 * 60 * 60 * 24))} 天
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 border-l border-slate-100 pl-4">
                                                        <span className="text-xs text-slate-400 block mb-1">實際剩餘 (到期-今天)</span>
                                                        <span className={`font-bold ${Math.ceil((new Date(editingHealthIndicator.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                            {Math.ceil((new Date(editingHealthIndicator.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} 天
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => setEditingHealthIndicator(null)}
                                                    className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg font-bold transition-colors"
                                                >
                                                    取消
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (!editingHealthIndicator.buildingName || !editingHealthIndicator.equipmentName || !editingHealthIndicator.startDate || !editingHealthIndicator.endDate) {
                                                            alert('請填寫完整資訊');
                                                            return;
                                                        }
                                                        handleSaveHealthIndicator();
                                                    }}
                                                    className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 transition-colors shadow-lg shadow-slate-200"
                                                >
                                                    儲存設定
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* List View */}
                                    <div className="space-y-3">
                                        {healthIndicators.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                                                尚無健康指標設定
                                            </div>
                                        ) : (
                                            healthIndicators.map(indicator => {
                                                const totalDays = Math.ceil((new Date(indicator.endDate).getTime() - new Date(indicator.startDate).getTime()) / (1000 * 60 * 60 * 24));
                                                const remainingDays = Math.ceil((new Date(indicator.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                const isExpired = remainingDays < 0;

                                                return (
                                                    <div key={indicator.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                                                            <div>
                                                                <label className="text-xs text-slate-400 block">建築物</label>
                                                                <div className="font-bold text-slate-700 truncate">{indicator.buildingName}</div>
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-slate-400 block">設備名稱</label>
                                                                <div className="font-bold text-slate-700 truncate">{indicator.equipmentName}</div>
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-slate-400 block">期間天數</label>
                                                                <div className="font-mono font-medium text-slate-600">{totalDays} 天</div>
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-slate-400 block">實際剩餘</label>
                                                                <div className={`font-mono font-bold ${isExpired ? 'text-red-500' : 'text-green-600'}`}>
                                                                    {remainingDays} 天
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-slate-50">
                                                            <button
                                                                onClick={() => setEditingHealthIndicator(indicator)}
                                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteHealthIndicator(indicator.id)}
                                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                                <button
                                    onClick={() => setIsHealthModalOpen(false)}
                                    className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 active:scale-95 transition-all shadow-lg shadow-slate-200"
                                >
                                    關閉視窗
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
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
                                    onClick={() => setSettingsTab('LANGUAGE')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'LANGUAGE' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                >
                                    <Globe className="w-4 h-4 mr-2" /> {t('language')}
                                </button>
                                <button
                                    onClick={() => setSettingsTab('GENERAL')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'GENERAL' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                >
                                    <Palette className="w-4 h-4 mr-2" /> 背景
                                </button>
                                <button
                                    onClick={() => setSettingsTab('LIGHTS')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'LIGHTS' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                >
                                    <Zap className="w-4 h-4 mr-2" /> 燈號
                                </button>
                                <button
                                    onClick={() => setSettingsTab('DECLARATION')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'DECLARATION' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                >
                                    <Calendar className="w-4 h-4 mr-2" /> 申報
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

                                {/* NOTIFICATIONS TAB */}
                                {settingsTab === 'NOTIFICATIONS' && (
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg">
                                            <div className="flex items-start">
                                                <Info className="w-5 h-5 text-blue-600 mr-2 shrink-0 mt-0.5" />
                                                <p className="text-sm text-blue-700">
                                                    設定接收檢查報告和異常通知的電子郵件地址。
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                                                <div>
                                                    <h4 className="font-bold text-slate-800">啟用郵件通知</h4>
                                                    <p className="text-xs text-slate-500 mt-1">定時發送檢查報告與異常警報</p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={declarationSettings.emailNotificationsEnabled}
                                                        onChange={(e) => setDeclarationSettings(prev => ({
                                                            ...prev,
                                                            emailNotificationsEnabled: e.target.checked
                                                        }))}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                                                </label>
                                            </div>

                                            {declarationSettings.emailNotificationsEnabled && (
                                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <label className="text-xs font-bold text-slate-500 uppercase">接收者信箱 (用逗號分隔)</label>
                                                    <textarea
                                                        value={declarationSettings.emailRecipients.join(', ')}
                                                        onChange={(e) => setDeclarationSettings(prev => ({
                                                            ...prev,
                                                            emailRecipients: e.target.value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
                                                        }))}
                                                        placeholder="example@company.com, manager@company.com"
                                                        rows={3}
                                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                                                    />
                                                    <p className="text-xs text-slate-400">
                                                        * 系統將會寄送每日檢查摘要至這些信箱。
                                                    </p>
                                                </div>
                                            )}

                                            <button
                                                onClick={() => {
                                                    // Trigger existing save logic
                                                    handleSaveSettings(declarationSettings);
                                                    alert('通知設定已儲存');
                                                }}
                                                className="w-full py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                                            >
                                                <Save className="w-4 h-4" />
                                                儲存通知設定
                                            </button>
                                        </div>
                                    </div>
                                )}

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

                                {/* GENERAL TAB */}
                                {settingsTab === 'GENERAL' && (
                                    <div className="space-y-6">
                                        {/* Theme Settings */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase">背景顏色</label>
                                            <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                                                {[
                                                    { id: 'light', icon: <Sun className="w-4 h-4" />, label: 'Light+', color: 'bg-[#f3f3f3]' },
                                                    { id: 'dark', icon: <Moon className="w-4 h-4" />, label: 'Dark+', color: 'bg-[#1e1e1e]' },
                                                    { id: 'monokai', icon: <Palette className="w-4 h-4" />, label: 'Monokai', color: 'bg-[#272822]' },
                                                    { id: 'solarized', icon: <Droplets className="w-4 h-4" />, label: 'Solarized', color: 'bg-[#002b36]' },
                                                    { id: 'dracula', icon: <Sparkles className="w-4 h-4" />, label: 'Dracula', color: 'bg-[#282a36]' },
                                                    { id: 'nord', icon: <Leaf className="w-4 h-4" />, label: 'Nord', color: 'bg-[#2e3440]' },
                                                    { id: 'onedark', icon: <Zap className="w-4 h-4" />, label: 'One Dark', color: 'bg-[#282c34]' },
                                                    { id: 'system', icon: <Monitor className="w-4 h-4" />, label: '跟隨系統', color: 'bg-gradient-to-br from-white to-slate-900' }
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

                                {/* LIGHTS TAB */}
                                {settingsTab === 'LIGHTS' && (
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex gap-3">
                                            <Zap className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-blue-900">燈號規則設定</p>
                                                <p className="text-xs text-blue-700 leading-relaxed">
                                                    自訂檢查狀態的判定標準。系統將依照您設定的天數與顏色重新同步顯示。
                                                </p>
                                            </div>
                                        </div>

                                        {!lightSettings ? (
                                            <div className="py-10 text-center flex justify-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {/* Abnormal Recheck */}
                                                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-orange-700 flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lightSettings.abnormal?.color || '#f97316' }}></div>
                                                            異常複檢
                                                        </span>
                                                        <input
                                                            type="color"
                                                            value={lightSettings.abnormal?.color || '#f97316'}
                                                            onChange={e => setLightSettings({ ...lightSettings, abnormal: { color: e.target.value } })}
                                                            className="w-8 h-8 rounded cursor-pointer border-0 p-0 overflow-hidden"
                                                        />
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        設定「異常」狀態的顯示顏色 (預設為橘色)
                                                    </div>
                                                </div>

                                                {/* Red */}
                                                <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-red-700 flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lightSettings.red.color }}></div>
                                                            需檢查
                                                        </span>
                                                        <input type="color" value={lightSettings.red.color} onChange={e => setLightSettings({ ...lightSettings, red: { ...lightSettings.red, color: e.target.value } })} className="w-8 h-8 rounded cursor-pointer border-0 p-0 overflow-hidden" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-slate-600 font-bold">剩餘天數 &le;</span>
                                                        <input type="number" value={lightSettings.red.days} onChange={e => setLightSettings({ ...lightSettings, red: { ...lightSettings.red, days: parseInt(e.target.value) || 0 } })} className="w-20 p-2 bg-white border border-red-200 rounded-lg text-center font-bold text-red-700 focus:outline-none focus:border-red-500" />
                                                        <span className="text-sm text-slate-600 font-bold">天</span>
                                                    </div>
                                                </div>

                                                {/* Yellow */}
                                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-amber-700 flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lightSettings.yellow.color }}></div>
                                                            可以檢查
                                                        </span>
                                                        <input type="color" value={lightSettings.yellow.color} onChange={e => setLightSettings({ ...lightSettings, yellow: { ...lightSettings.yellow, color: e.target.value } })} className="w-8 h-8 rounded cursor-pointer border-0 p-0 overflow-hidden" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-slate-600 font-bold">剩餘天數 &le;</span>
                                                        <input type="number" value={lightSettings.yellow.days} onChange={e => setLightSettings({ ...lightSettings, yellow: { ...lightSettings.yellow, days: parseInt(e.target.value) || 0 } })} className="w-20 p-2 bg-white border border-amber-200 rounded-lg text-center font-bold text-amber-700 focus:outline-none focus:border-amber-500" />
                                                        <span className="text-sm text-slate-600 font-bold">天</span>
                                                        <span className="text-xs text-slate-400 ml-2">(且 &gt; {lightSettings.red.days} 天)</span>
                                                    </div>
                                                </div>

                                                {/* Green */}
                                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-emerald-700 flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lightSettings.green.color }}></div>
                                                            不需檢查
                                                        </span>
                                                        <input type="color" value={lightSettings.green.color} onChange={e => setLightSettings({ ...lightSettings, green: { ...lightSettings.green, color: e.target.value } })} className="w-8 h-8 rounded cursor-pointer border-0 p-0 overflow-hidden" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-slate-600 font-bold">剩餘天數 &ge;</span>
                                                        <input type="number" value={lightSettings.green.days} onChange={e => setLightSettings({ ...lightSettings, green: { ...lightSettings.green, days: parseInt(e.target.value) || 0 } })} className="w-20 p-2 bg-white border border-emerald-200 rounded-lg text-center font-bold text-emerald-700 focus:outline-none focus:border-emerald-500" />
                                                        <span className="text-sm text-slate-600 font-bold">天</span>
                                                        <span className="text-xs text-slate-400 ml-2">(系統判定 &gt; {lightSettings.yellow.days} 天)</span>
                                                    </div>
                                                </div>

                                                {/* Completed (Normal) */}
                                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-blue-700 flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lightSettings.completed?.color || '#10b981' }}></div>
                                                            已檢查
                                                        </span>
                                                        <input
                                                            type="color"
                                                            value={lightSettings.completed?.color || '#10b981'}
                                                            onChange={e => setLightSettings({ ...lightSettings, completed: { color: e.target.value } })}
                                                            className="w-8 h-8 rounded cursor-pointer border-0 p-0 overflow-hidden"
                                                        />
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        設定「正常且已完成」的檢查項目顯示顏色 (預設為綠色)
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={handleSaveLightSettings}
                                                    disabled={savingLights}
                                                    className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                                                >
                                                    {savingLights ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                                            儲存中...
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Save className="w-4 h-4" />
                                                            儲存設定
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* DECLARATION TAB */}
                                {settingsTab === 'DECLARATION' && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        <div className="bg-red-50 rounded-2xl p-4 border border-red-100 flex gap-3">
                                            <Calendar className="w-12 h-12 text-red-500 shrink-0 p-2 bg-white rounded-xl shadow-sm" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-red-900">消防安全設備檢修申報</p>
                                                <p className="text-xs text-red-700 leading-relaxed">
                                                    請設定下次申報日期，系統將自動倒數並提醒您。
                                                </p>


                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                    下次申報日期
                                                </label>
                                                <input
                                                    type="date"
                                                    value={declarationSettings?.nextDate || ''}
                                                    onChange={(e) => {
                                                        const newSettings: DeclarationSettings = {
                                                            ...declarationSettings || { lastModified: Date.now(), emailNotificationsEnabled: false, emailRecipients: [] },
                                                            nextDate: e.target.value,
                                                            lastModified: Date.now()
                                                        };
                                                        handleSaveSettings(newSettings);
                                                    }}
                                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-100 focus:border-red-400 transition-all outline-none font-medium text-slate-700 shadow-sm"
                                                />
                                                <p className="text-xs text-slate-400 pl-1">
                                                    設定後，儀表板將顯示倒數天數。
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm border border-slate-100">
                                                <History className="w-5 h-5 text-slate-400" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-slate-400">上次更新</div>
                                                <div className="text-sm font-bold text-slate-700">
                                                    {declarationSettings?.lastModified ? new Date(declarationSettings.lastModified).toLocaleString('zh-TW') : '尚未設定'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                                            <h5 className="font-bold text-yellow-800 text-sm mb-2 flex items-center gap-2">
                                                <Info className="w-4 h-4" />
                                                法規提醒
                                            </h5>
                                            <ul className="text-xs text-yellow-800/80 space-y-1 list-disc list-inside font-medium">
                                                <li>甲類場所：每半年申報一次</li>
                                                <li>甲類以外場所：每年申報一次</li>
                                                <li>請務必於期限前完成檢修與申報作業</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                {/* HEALTH TAB */}

                            </div>
                        </div>
                    </div>
                )
            }
            {

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



            <MapViewInspection
                user={user}
                isOpen={isMapViewInspectionOpen}
                onClose={() => {
                    setIsMapViewInspectionOpen(false);
                    fetchReports(); // Refresh data when map view closes
                }}
            />
        </div >
    );
};

export default Dashboard;
