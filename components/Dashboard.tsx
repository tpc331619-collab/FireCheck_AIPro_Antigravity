
import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
    InspectionReport, EquipmentDefinition, EquipmentHierarchy, DeclarationSettings, DeclarationRecord, EquipmentMap, AbnormalRecord, InspectionStatus, EquipmentType, HealthIndicator,
    HealthHistoryRecord, UserProfile, LanguageCode, SystemSettings, DashboardCardId
} from '../types';
import { StorageService } from '../services/storageService';
// Fix: Use modular imports from firebase/auth
import { updateProfile, updatePassword } from 'firebase/auth';
import { Mail, Bell } from 'lucide-react';


import InspectionModeModal from './InspectionModeModal';
import AddEquipmentModeModal from './AddEquipmentModeModal';
import CustomAlertModal from './CustomAlertModal';
import { NotificationBell } from './NotificationBell';
import CardOrderModal from './CardOrderModal';
import { SyncStatus, SyncStatusBadge } from './SyncStatus';

// Lazy-loaded heavy sub-views & modals to shrink initial Dashboard bundle
const BarcodeInputModal = lazy(() => import('./BarcodeInputModal'));
const EquipmentPassportModal = lazy(() => import('./EquipmentPassportModal'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const GuestShareModal = lazy(() => import('./GuestShareModal'));
const MapViewInspection = lazy(() => import('./MapViewInspection'));
const AbnormalRecheckList = lazy(() => import('./AbnormalRecheckList'));
const HistoryTable = lazy(() => import('./HistoryTable'));
const EquipmentMapEditor = lazy(() => import('./EquipmentMapEditor'));
const OrganizationManager = lazy(() => import('./OrganizationManager').then(m => ({ default: m.OrganizationManager })));

import { useTheme, ThemeType } from '../contexts/ThemeContext'; // Import Theme Hook
import { exportToExcel, generateMonthlyReport } from '../utils/exportUtils';
import { formatLifespan } from '../utils/dateUtils';
import { getFrequencyStatus } from '../utils/inspectionUtils';
import {
    Plus,
    FileText,
    FileDown,
    FileSpreadsheet,
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
    Clock,
    RefreshCw,
    PlayCircle,
    Wrench,
    X,
    Trash2,
    AlertCircle,
    Loader2,
    LogOut,
    Shield,
    ShieldCheck,
    Signal,
    Wifi,
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
    Map,

    Activity,
    Palette,
    Eye,
    Leaf,
    Zap,
    Sparkles,
    Save,
    Edit2,

    Flame,
    BellRing,
    Droplets,
    BatteryCharging,
    Lightbulb,
    DoorOpen,
    Box,
    Filter,
    Heart,
    ScanLine,
    ClipboardCheck,
    AlertOctagon,
    Building,
    MapPinned,
    PlusCircle,
    ListPlus,
    PieChart,
    ScrollText,
    HeartPulse,
    QrCode
} from 'lucide-react';
import { THEME_COLORS } from '../constants';
import { auth, storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useLanguage } from '../contexts/LanguageContext';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateLightSettings, useLightSettings, useEquipment, useHistoryReports, HISTORY_KEYS, useAbnormalRecords } from '../hooks/useSystemData';
import { EquipmentStatsExpanded } from './dashboard/EquipmentStatsExpanded';

declare const __APP_UPDATE_TIME__: string;

interface DashboardProps {
    user: UserProfile;
    onCreateNew: () => void;
    onAddEquipment: () => void;
    onMyEquipment: (filter?: string) => void;
    onLogout: () => void;
    onUserUpdate: () => void;
    onManageHierarchy: () => void;
    onOpenMapEditor: () => void;
    onOrgSwitch: (orgId: string) => void;
    guestExpiry?: number | null;
    systemSettings?: SystemSettings;
    onSystemSettingsUpdate?: (settings: SystemSettings) => void;
}

const CARTOON_AVATARS = [
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Felix",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Zoe",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Jack",
    "https://api.dicebear.com/9.x/avataaars/svg?seed=Ginger"
];

const getEquipmentIcon = (name: string) => {
    if (!name) return <Box className="w-5 h-5 text-slate-400" />;
    if (name.includes('滅火')) return <Flame className="w-5 h-5 text-orange-500" />;
    if (name.includes('警報') || name.includes('廣播')) return <BellRing className="w-5 h-5 text-red-500" />;
    if (name.includes('栓') || name.includes('水')) return <Droplets className="w-5 h-5 text-blue-500" />;
    if (name.includes('電')) return <BatteryCharging className="w-5 h-5 text-yellow-500" />;
    if (name.includes('燈') || name.includes('照明')) return <Lightbulb className="w-5 h-5 text-amber-500" />;
    if (name.includes('出口') || name.includes('門')) return <DoorOpen className="w-5 h-5 text-green-500" />;
    return <Box className="w-5 h-5 text-slate-400" />;
};

const Dashboard: React.FC<DashboardProps> = ({ user, onCreateNew, onAddEquipment, onMyEquipment, onLogout, onUserUpdate, onManageHierarchy, onOpenMapEditor, onOrgSwitch, guestExpiry, systemSettings: systemSettingsFromProps, onSystemSettingsUpdate }) => {
    const { t, language, setLanguage } = useLanguage();
    const { theme, setTheme, styles } = useTheme(); // Use Theme Hook
    const [searchParams, setSearchParams] = useSearchParams();

    const [activeModal, setActiveModal] = useState<{ type: 'INSPECTION' | 'RECHECK', item: any } | null>(null);
    const { user: userFromContext } = useTheme(); // Access user from context if needed for role checks
    const queryClient = useQueryClient();



    // const [reports, setReports] = useState<InspectionReport[]>([]); // Removed: Handled by React Query
    // const [loading, setLoading] = useState(true); // Removed: Handled by React Query as isReportsLoading
    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
    const [isSearchActive, setIsSearchActive] = useState(!!searchParams.get('q'));
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number | ''>('');
    const [showArchived, setShowArchived] = useState(false); // Toggle for archived reports
    const [showAbnormalRecheck, setShowAbnormalRecheck] = useState(false);

    // Reports Fetching (React Query)
    const { data: reports = [], isLoading: isReportsLoading, refetch: refetchReports } = useHistoryReports(user, selectedYear, {
        enabled: !!user.uid
    });

    // Real-time Abnormal Records Hook
    const { data: abnormalRecords = [], isLoading: isAbnormalLoading, isFetched: isAbnormalFetched } = useAbnormalRecords(user);
    // Calculate count of pending records locally
    const abnormalCount = abnormalRecords.filter(r => r.status === 'pending' && !r.fixedDate).length;
    const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title?: string; message: string; type?: 'alert' | 'confirm' | 'success'; onConfirm?: () => void } | null>(null);

    // Sync isSearchActive with URL q parameter
    useEffect(() => {
        const q = searchParams.get('q');
        console.log('[useEffect] searchParams changed, q =', q);
        if (q) {
            setIsSearchActive(true);
            setSearchTerm(q);
            console.log('[useEffect] Set isSearchActive = true, searchTerm =', q);
        } else {
            setIsSearchActive(false);
            setSearchTerm('');
            console.log('[useEffect] Set isSearchActive = false, searchTerm = empty');
        }
    }, [searchParams]);

    const isAdmin = user.role === 'admin' || user.email?.toLowerCase() === 'b28803078@gmail.com';
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'Pass' | 'Fail'>('ALL');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
    const [isEquipmentMapOpen, setIsEquipmentMapOpen] = useState(false); // Added
    const [selectedMap, setSelectedMap] = useState<EquipmentMap | null>(null); // Added
    const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false); // Added for separate permissions modal
    const [passportEquipment, setPassportEquipment] = useState<EquipmentDefinition | null>(null);

    // Card Order State
    const [cardOrder, setCardOrder] = useState<DashboardCardId[]>([]);
    const [isCardOrderModalOpen, setIsCardOrderModalOpen] = useState(false);

    // Load Card Order
    useEffect(() => {
        const loadCardOrder = async () => {
            // 如果檢查員有權限,優先使用個人化順序
            if (!isAdmin && systemSettingsFromProps?.allowInspectorCustomizeCardOrder) {
                const personalOrder = await StorageService.getUserCardOrder(user.uid);
                if (personalOrder) {
                    setCardOrder(personalOrder);
                    return;
                }
            }

            // 使用全域預設順序
            if (systemSettingsFromProps?.defaultCardOrder && systemSettingsFromProps.defaultCardOrder.length > 0) {
                setCardOrder(systemSettingsFromProps.defaultCardOrder);
            } else {
                // 預設順序
                setCardOrder([
                    'startInspection',
                    'abnormalRecheck',
                    'history',
                    'myEquipment',
                    'mapEditor',
                    'addEquipment',
                    'healthIndicators',
                    'addNameList',
                    'equipmentOverview'
                ]);
            }
        };
        loadCardOrder();
    }, [systemSettingsFromProps, user.uid, isAdmin]);

    const handleSaveCardOrder = async (newOrder: DashboardCardId[]) => {
        if (isAdmin) {
            // Admin saves global default
            if (window.confirm('是否要將此順序設為系統預設值? (所有未自訂順序的使用者將套用此順序)')) {
                const newSettings = systemSettingsFromProps ? { ...systemSettingsFromProps, defaultCardOrder: newOrder } : { allowGuestView: false, defaultCardOrder: newOrder };
                await StorageService.saveSystemSettings(newSettings);
                // Assume parent updates props or we update local cache if needed, but props should update
            }
            // Admin also updates local view
            setCardOrder(newOrder);
            setIsCardOrderModalOpen(false);
        } else {
            // User saves personal order
            await StorageService.saveUserCardOrder(user.uid, newOrder);
            setCardOrder(newOrder);
            setIsCardOrderModalOpen(false);
        }
    };

    const handleResetCardOrder = async () => {
        if (window.confirm(t('confirmResetCardOrder') || '確定要重置為預設順序嗎?')) {
            if (isAdmin) {
                // Admin resets global default to hardcoded default? Or just clears it?
                // Let's just reset to the hardcoded list
                const defaultList: DashboardCardId[] = [
                    'startInspection',
                    'abnormalRecheck',
                    'history',
                    'myEquipment',
                    'mapEditor',
                    'addEquipment',
                    'healthIndicators',
                    'addNameList',
                    'equipmentOverview'
                ];
                setCardOrder(defaultList);
            } else {
                // User clears personal order
                await StorageService.saveUserCardOrder(user.uid, []);
                // Reload will fetch global default, or we can just set it to global default now
                if (systemSettingsFromProps?.defaultCardOrder && systemSettingsFromProps.defaultCardOrder.length > 0) {
                    setCardOrder(systemSettingsFromProps.defaultCardOrder);
                } else {
                    setCardOrder([
                        'startInspection',
                        'abnormalRecheck',
                        'history',
                        'myEquipment',
                        'mapEditor',
                        'addEquipment',
                        'healthIndicators',
                        'addNameList',
                        'equipmentOverview'
                    ]);
                }
            }
        }
    };

    // Guest Timer Logic
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [isExpiring, setIsExpiring] = useState(false);

    useEffect(() => {
        if (!guestExpiry) return;

        const timer = setInterval(() => {
            const now = Date.now();
            const diff = guestExpiry - now;

            if (diff <= 0) {
                // Time's up
                clearInterval(timer);
                onLogout(); // Trigger logout from parent App
                return;
            }

            // Format time left
            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);

            // Warn if last 1 minute
            if (diff <= 60000) setIsExpiring(true);
            else setIsExpiring(false);

        }, 1000);

        return () => clearInterval(timer);
    }, [guestExpiry, onLogout]);

    // Organization State
    const [showOrgManager, setShowOrgManager] = useState(false);
    const [currentOrgName, setCurrentOrgName] = useState('');

    useEffect(() => {
        const loadOrgName = async () => {
            if (user.currentOrganizationId) {
                const org = await StorageService.getOrganization(user.currentOrganizationId);
                if (org) {
                    setCurrentOrgName(org.name);
                }
            } else {
                setCurrentOrgName('');
            }
        };
        loadOrgName();
    }, [user.currentOrganizationId, user.uid]);

    // Declaration State
    const [declarationSettings, setDeclarationSettings] = useState<DeclarationSettings | null>(null);
    const [isDeclarationModalOpen, setIsDeclarationModalOpen] = useState(false);




    // Light Settings State
    const [pendingUsersCount, setPendingUsersCount] = useState(0);
    const [savingLights, setSavingLights] = useState(false);
    const { data: currentLightSettings } = useLightSettings(user);
    const [lightSettings, setLightSettings] = useState<any>(null);
    const updateLightSettingsMutation = useUpdateLightSettings(user);

    // Map State

    // Settings State
    const [settingsTab, setSettingsTab] = useState<'PROFILE' | 'LANGUAGE' | 'GENERAL' | 'LIGHTS' | 'DECLARATION' | 'ADMIN' | 'PERMISSIONS'>('PROFILE');
    const [settingsModalMode, setSettingsModalMode] = useState<'full' | 'focused'>('full');
    const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
    const [displayName, setDisplayName] = useState(user.displayName || '');
    const [selectedAvatar, setSelectedAvatar] = useState(() => {
        // Force cartoon version if it's one of the default paths or missing version query
        if (user.photoURL && user.photoURL.startsWith('/avatars/avatar_')) {
            return user.photoURL;
        }
        return user.photoURL || CARTOON_AVATARS[0];
    });
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Equipment Stats State
    const [isEquipmentExpanded, setIsEquipmentExpanded] = useState(false);
    const { data: equipment = [] } = useEquipment(user);
    const nameCount = equipment.length;
    const [isHealthExpanded, setIsHealthExpanded] = useState(false);

    // Dynamic Inspection Progress Stats for "開始檢查" card
    const inspectionProgress = React.useMemo(() => {
        if (equipment.length === 0) {
            return { pendingCount: 0, completedCount: 0, rate: 100 };
        }
        const pendingAbnormalIds = new Set(
            abnormalRecords
                .filter(r => r.status === 'pending' && !r.fixedDate)
                .map(r => r.equipmentId)
        );
        let pendingCount = 0;
        equipment.forEach(eq => {
            if (!pendingAbnormalIds.has(eq.id)) {
                const st = getFrequencyStatus(eq, currentLightSettings);
                if (st === 'PENDING') pendingCount++;
            }
        });
        const completedCount = equipment.length - pendingCount;
        const rate = Math.round((completedCount / equipment.length) * 100);
        return { pendingCount, completedCount, rate };
    }, [equipment, abnormalRecords, currentLightSettings]);

    // Expose Admin Dashboard open function to window for NotificationBell
    useEffect(() => {
        (window as any).openAdminDashboard = () => setIsAdminDashboardOpen(true);
        return () => {
            delete (window as any).openAdminDashboard;
        };
    }, []);

    // Health Renewal State

    // Health Renewal State
    const [renewalTarget, setRenewalTarget] = useState<HealthIndicator | null>(null);
    const [viewingHistory, setViewingHistory] = useState<HealthIndicator | null>(null);
    const [historyData, setHistoryData] = useState<HealthHistoryRecord[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyCounts, setHistoryCounts] = useState<Record<string, number>>({});






    const [isInspectionModeOpen, setIsInspectionModeOpen] = useState(false);
    const [isQuickScanOpen, setIsQuickScanOpen] = useState(false);
    const [isAddEquipmentModeOpen, setIsAddEquipmentModeOpen] = useState(false);
    // const [showAbnormalRecheck, setShowAbnormalRecheck] = useState(false); // Moved to top
    const [isMapViewInspectionOpen, setIsMapViewInspectionOpen] = useState(false);
    // const [showArchived, setShowArchived] = useState(false); // Moved to top
    // const [abnormalCount, setAbnormalCount] = useState(0); // Removed: Handled by Hook above
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set()); // Track expanded rows

    // Enhanced Filter States (Phase 2)
    const [dateRange, setDateRange] = useState({
        start: '', // 預設空白，顯示所有日期
        end: ''
    });
    const [locationFilter, setLocationFilter] = useState('');
    const [keywordSearch, setKeywordSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false); // Control filter panel visibility
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());

    const [healthIndicators, setHealthIndicators] = useState<HealthIndicator[]>([]);
    const [editingHealthIndicator, setEditingHealthIndicator] = useState<HealthIndicator | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isGuestShareModalOpen, setIsGuestShareModalOpen] = useState(false);
    const systemSettings = systemSettingsFromProps || { allowGuestView: false };

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        try {
            // Invalidate all queries to force refetch
            await queryClient.invalidateQueries();
            // Also manually refresh some local states that aren't managed by React Query yet
            if (user?.uid) {
                await fetchHistoryCounts();
                const indicators = await StorageService.getHealthIndicators(user.uid, user.currentOrganizationId);
                setHealthIndicators(indicators);
            }
            // Add a small delay for the animation to be visible
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (error) {
            console.error('[Dashboard] Manual refresh failed:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleSaveSystemSettings = async (newSettings: SystemSettings) => {
        if (!user.uid) return;
        const prevSettings = systemSettings;
        if (onSystemSettingsUpdate) onSystemSettingsUpdate(newSettings); // Optimistic Update

        try {
            await StorageService.saveSystemSettings({
                ...newSettings
            });
            // Optional: Success feedback could be a toast instead of an alert to avoid blocking
            console.log('[Dashboard] System settings saved successfully');
        } catch (e) {
            console.error('[Dashboard] Failed to save system settings:', e);
            if (onSystemSettingsUpdate) onSystemSettingsUpdate(prevSettings); // Rollback
            alert(t('saveFailed') || '儲存失敗');
        }
    };
    const [savingHealth, setSavingHealth] = useState(false);

    // Effect: Invalidate queries when Guest Organization changes (Real-time update)
    useEffect(() => {
        if (user.isGuest && systemSettings?.guestOrganizationId) {
            console.log('[Dashboard] Guest Organization changed, refreshing data...');
            queryClient.invalidateQueries({ queryKey: ['history'] });
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            queryClient.invalidateQueries({ queryKey: ['abnormal_records'] });
        }
    }, [systemSettings?.guestOrganizationId, user.isGuest, queryClient]);

    // Check for expired health indicators requiring renewal
    useEffect(() => {
        if (!healthIndicators.length) return;

        const checkExpired = () => {
            const now = Date.now();
            const twelveHours = 12 * 60 * 60 * 1000;

            // Find the first expired indicator that hasn't been dismissed recently
            const target = healthIndicators.find(indicator => {
                const remainingDays = Math.ceil((new Date(indicator.endDate).getTime() - now) / (1000 * 60 * 60 * 24));
                const isExpired = remainingDays <= 0;
                const isDismissedRecently = indicator.lastPromptDismissed && (now - indicator.lastPromptDismissed < twelveHours);

                return isExpired && !isDismissedRecently;
            });

            if (target && renewalTarget?.id !== target.id) {
                setRenewalTarget(target);
            }
        };

        checkExpired();
    }, [healthIndicators]);

    // Notification Helper Function
    const addNotification = async (type: 'profile' | 'health' | 'declaration' | 'abnormal' | 'lights', title: string, message: string) => {
        if (!user?.uid) return;

        try {
            await StorageService.addNotification({
                type,
                title,
                message,
                timestamp: Date.now(),
                read: false
            }, user.uid, user.currentOrganizationId);

            // Trigger a custom event to notify the NotificationBell to reload
            window.dispatchEvent(new CustomEvent('notification-added'));
        } catch (error) {
            console.error('Failed to add notification:', error);
        }
    };


    const handleSaveHealthIndicator = async () => {
        if (!user?.uid || !editingHealthIndicator.startDate || !editingHealthIndicator.endDate) {
            alert(t('fillAllFields'));
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
                // Check if replacement date is provided to record history
                if (editingHealthIndicator.replacementDate) {
                    const original = healthIndicators.find(i => i.id === editingHealthIndicator.id);
                    if (original) {
                        const historyRecord: Omit<HealthHistoryRecord, 'id' | 'updatedAt'> = {
                            indicatorId: editingHealthIndicator.id,
                            userId: user.uid,
                            previousStartDate: original.startDate || '',
                            previousEndDate: original.endDate,
                            newStartDate: editingHealthIndicator.startDate || '',
                            newEndDate: editingHealthIndicator.endDate,
                            replacementDate: editingHealthIndicator.replacementDate
                        };
                        await StorageService.addHealthHistory(historyRecord, user.uid, user.currentOrganizationId);
                        setHistoryCounts((prev) => ({
                            ...prev,
                            [editingHealthIndicator.id]: (prev[editingHealthIndicator.id] || 0) + 1
                        }));
                    }
                    // Clear replacement date after saving to avoid carrying it over
                    delete indicatorData.replacementDate;
                }

                await StorageService.updateHealthIndicator(editingHealthIndicator.id, indicatorData, user.uid, user.currentOrganizationId);
                setHealthIndicators(prev => prev.map(i => i.id === editingHealthIndicator.id ? { ...i, ...indicatorData } : i));
            } else {
                // Add
                const newId = await StorageService.addHealthIndicator(indicatorData, user.uid, user.currentOrganizationId);
                setHealthIndicators(prev => [{ ...indicatorData, id: newId } as HealthIndicator, ...prev]);
            }

            setEditingHealthIndicator(null);

            // Add notification
            await addNotification(
                'health',
                t('healthIndicatorUpdated'),
                `「${indicatorData.equipmentName || t('equipment')}」${t('healthIndicatorUpdatedDesc')}`
            );

            alert(t('saveSuccess'));
        } catch (error) {
            console.error('Failed to save health indicator:', error);
            alert(t('saveFailed'));
        } finally {
            setSavingHealth(false);
        }
    };

    const handleDeleteHealthIndicator = async (id: string) => {
        if (!user?.uid || !confirm('確定要刪除此指標嗎？')) return;

        try {
            await StorageService.deleteHealthIndicator(id, user.uid, user.currentOrganizationId);
            setHealthIndicators(prev => prev.filter(i => i.id !== id));
        } catch (error) {
            console.error('Failed to delete health indicator:', error);
            alert('刪除失敗');
        }
    };

    const handleRenewalSubmit = async (replacementDate: string, newEndDate: string) => {
        if (!user?.uid || !renewalTarget) return;

        try {
            const updatedIndicator: HealthIndicator = {
                ...renewalTarget,
                startDate: replacementDate, // New start date is replacement date
                replacementDate: replacementDate,
                endDate: newEndDate,
                updatedAt: Date.now()
            };

            const historyRecord: Omit<HealthHistoryRecord, 'id' | 'updatedAt'> = {
                indicatorId: renewalTarget.id,
                userId: user.uid,
                previousStartDate: renewalTarget.startDate,
                previousEndDate: renewalTarget.endDate,
                newStartDate: replacementDate,
                newEndDate: newEndDate,
                replacementDate: replacementDate
            };

            await StorageService.addHealthHistory(historyRecord, user.uid, user.currentOrganizationId);
            await StorageService.updateHealthIndicator(renewalTarget.id, updatedIndicator, user.uid, user.currentOrganizationId);
            setHealthIndicators(prev => prev.map(i => i.id === renewalTarget.id ? updatedIndicator : i));
            setHistoryCounts((prev) => ({
                ...prev,
                [renewalTarget.id]: (prev[renewalTarget.id] || 0) + 1
            }));
            setRenewalTarget(null);
            alert('設備狀態已更新');
        } catch (error) {
            console.error('Failed to renew indicator:', error);
            alert('更新失敗');
        }
    };

    const handleRenewalCancel = async () => {
        if (!user?.uid || !renewalTarget) return;

        // Set 12-hour dismissal
        try {
            const updatedIndicator: HealthIndicator = {
                ...renewalTarget,
                lastPromptDismissed: Date.now()
            };
            await StorageService.updateHealthIndicator(renewalTarget.id, updatedIndicator, user.uid, user.currentOrganizationId);
            setHealthIndicators(prev => prev.map(i => i.id === renewalTarget.id ? updatedIndicator : i));
            setRenewalTarget(null);
        } catch (error) {
            console.error('Failed to dismiss renewal:', error);
            setRenewalTarget(null); // Close anyway
        }
    };

    const handleViewHistory = async (indicator: HealthIndicator) => {
        if (!user?.uid) return;
        setViewingHistory(indicator);
        setHistoryData([]); // Reset first
        setIsHistoryLoading(true);
        try {
            const history = await StorageService.getHealthHistory(indicator.id, user.uid, user.currentOrganizationId);
            setHistoryData(history);
            if (history.length === 0) {
                // Optional: Helper log
                console.log(`No history found for indicator ${indicator.id}`);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
            alert('讀取歷史記錄失敗');
        } finally {
            setIsHistoryLoading(false);
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
        index: t('index'),
        date: t('checkDate'),
        building: t('buildingName'),
        equipment: t('equipmentName'),
        barcode: t('barcode'),
        result: t('result'),
        notes: t('notes'),
        inspector: t('inspector'),
        actions: t('checkItems')
    };






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

    const handleDeleteReport = async (item: any) => {
        if (!user.uid) return;

        try {
            // Delete specific item from storage/database
            const targetId = item.equipmentId || item.id;
            await StorageService.deleteInspectionItem(item.reportId, item.date, user.uid, targetId);

            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: HISTORY_KEYS.all(user.uid, user.currentOrganizationId, selectedYear) });
            // Also invalidate equipment overview if needed, though history table is primary concern here
            queryClient.invalidateQueries({ queryKey: ['equipment', user.uid] }); // Optional: refresh equipment if status changed

        } catch (error) {
            console.error('Failed to delete item:', error);
            alert(t('deleteFailed') || '刪除失敗');
        }
    };

    useEffect(() => {
        console.log('[Dashboard] initial render');
    }, []);

    // Orphaned calls fix - Wrap in Effect
    useEffect(() => {
        if (user?.uid) {
            // Reset states during switch to prevent stale data
            setDeclarationSettings(null);
            fetchDeclarationSettings();
            fetchHistoryCounts();
            StorageService.getHealthIndicators(user.uid, user.currentOrganizationId).then(setHealthIndicators);
        }
    }, [user?.uid, user?.currentOrganizationId]);

    useEffect(() => {
        if (isSettingsOpen && settingsTab === 'LIGHTS' && currentLightSettings && !lightSettings) {
            setLightSettings(JSON.parse(JSON.stringify(currentLightSettings)));
        }
    }, [isSettingsOpen, settingsTab, currentLightSettings, lightSettings]);

    const handleSaveLightSettings = async () => {
        if (!lightSettings) return;
        setSavingLights(true);
        try {
            await updateLightSettingsMutation.mutateAsync(lightSettings);
            await addNotification('lights', t('lightsUpdated'), t('lightsUpdatedDesc'));
            alert(t('settingsSaved'));
        } catch (e) {
            console.error(e);
            alert(t('saveFailed'));
        } finally {
            setSavingLights(false);
        }
    };

    const fetchDeclarationSettings = async () => {
        if (user?.uid) {
            const settings = await StorageService.getDeclarationSettings(user.uid, user.currentOrganizationId);
            setDeclarationSettings(settings);
        }
    };



    // Declaration Records State & Handlers
    const [isAddingRecord, setIsAddingRecord] = useState(false);
    const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
    const [recordForm, setRecordForm] = useState<{
        periodLabel: string;
        targetDeadline: string;
        actualDate: string;
        inspectorAgency: string;
        docNumber: string;
        notes: string;
    }>({
        periodLabel: '',
        targetDeadline: '',
        actualDate: new Date().toISOString().slice(0, 10),
        inspectorAgency: '',
        docNumber: '',
        notes: ''
    });

    const handleOpenAddRecord = (defaultPeriod?: string, defaultDeadline?: string) => {
        const currentYear = new Date().getFullYear();
        const isHalfYear = declarationSettings?.cycle === '6_MONTHS';
        const defaultLabel = defaultPeriod || (isHalfYear ? `${currentYear}年 下半年` : `${currentYear}年度`);
        setRecordForm({
            periodLabel: defaultLabel,
            targetDeadline: defaultDeadline || declarationSettings?.nextDate || `${currentYear}-10-31`,
            actualDate: new Date().toISOString().slice(0, 10),
            inspectorAgency: '',
            docNumber: '',
            notes: ''
        });
        setEditingRecordId(null);
        setIsAddingRecord(true);
    };

    const handleEditRecord = (record: DeclarationRecord) => {
        setRecordForm({
            periodLabel: record.periodLabel,
            targetDeadline: record.targetDeadline,
            actualDate: record.actualDate,
            inspectorAgency: record.inspectorAgency || '',
            docNumber: record.docNumber || '',
            notes: record.notes || ''
        });
        setEditingRecordId(record.id);
        setIsAddingRecord(true);
    };

    const handleSaveRecord = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!recordForm.actualDate) {
            alert('請輸入真正的申報完成日期！');
            return;
        }
        const currentRecords = declarationSettings?.records || [];
        let updatedRecords: DeclarationRecord[];
        if (editingRecordId) {
            updatedRecords = currentRecords.map(r => r.id === editingRecordId ? {
                ...r,
                periodLabel: recordForm.periodLabel || r.periodLabel,
                targetDeadline: recordForm.targetDeadline || r.targetDeadline,
                actualDate: recordForm.actualDate,
                inspectorAgency: recordForm.inspectorAgency,
                docNumber: recordForm.docNumber,
                notes: recordForm.notes,
                status: 'COMPLETED'
            } : r);
        } else {
            const newRecord: DeclarationRecord = {
                id: `dec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                periodLabel: recordForm.periodLabel || `${new Date(recordForm.actualDate).getFullYear()}年度`,
                targetDeadline: recordForm.targetDeadline || declarationSettings?.nextDate || recordForm.actualDate,
                actualDate: recordForm.actualDate,
                inspectorAgency: recordForm.inspectorAgency,
                docNumber: recordForm.docNumber,
                notes: recordForm.notes,
                status: 'COMPLETED',
                createdAt: Date.now()
            };
            updatedRecords = [newRecord, ...currentRecords];
        }
        updatedRecords.sort((a, b) => new Date(b.actualDate).getTime() - new Date(a.actualDate).getTime());

        const newSettings: DeclarationSettings = {
            ...declarationSettings || { nextDate: '', lastModified: Date.now(), emailNotificationsEnabled: false, emailRecipients: [] },
            records: updatedRecords,
            lastModified: Date.now()
        };
        handleSaveSettings(newSettings);
        setIsAddingRecord(false);
        setEditingRecordId(null);
    };

    const handleDeleteRecord = (recordId: string) => {
        if (!confirm('確定要刪除此筆申報紀錄嗎？')) return;
        const currentRecords = declarationSettings?.records || [];
        const updatedRecords = currentRecords.filter(r => r.id !== recordId);
        const newSettings: DeclarationSettings = {
            ...declarationSettings || { nextDate: '', lastModified: Date.now(), emailNotificationsEnabled: false, emailRecipients: [] },
            records: updatedRecords,
            lastModified: Date.now()
        };
        handleSaveSettings(newSettings);
    };

    const handleSaveSettings = async (settings: DeclarationSettings) => {
        if (user?.uid) {
            try {
                await StorageService.saveDeclarationSettings(settings, user.uid, user.currentOrganizationId);
                setDeclarationSettings(settings); // Update local state
            } catch (error) {
                console.error("Error saving settings:", error);
                alert("設定儲存失敗");
            }
        }
    };

    // Track pending users for Admin Notification Badge
    useEffect(() => {
        if (!isAdmin) return;

        console.log('[Dashboard] Subscribing to whitelist for pending count');
        const unsubscribe = StorageService.onWhitelistChange((entries) => {
            const pending = entries.filter(e => e.status === 'pending');
            console.log(`[Dashboard] Pending users updated: ${pending.length}`);
            setPendingUsersCount(pending.length);
        });

        return () => unsubscribe();
    }, [isAdmin]);




    // Calculate Declaration Deadline & Auto-Rollover
    const [declarationDeadline, setDeclarationDeadline] = useState<string>('');
    useEffect(() => {
        if (!declarationSettings?.nextDate || !declarationSettings?.cycle) {
            // Fallback: if no cycle, use nextDate as deadline (legacy behavior)
            if (declarationSettings?.nextDate) {
                setDeclarationDeadline(declarationSettings.nextDate);
            } else {
                setDeclarationDeadline(''); // Reset if no settings at all
            }
            return;
        }

        const baseDate = new Date(declarationSettings.nextDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let nextDeadline = new Date(baseDate);

        // Add cycle to base date
        if (declarationSettings.cycle === '6_MONTHS') {
            nextDeadline.setMonth(nextDeadline.getMonth() + 6);
        } else if (declarationSettings.cycle === '1_YEAR') {
            nextDeadline.setFullYear(nextDeadline.getFullYear() + 1);
        }

        // Auto-Rollover Logic: If deadline passed, move base date forward
        const originalBase = new Date(baseDate); // Clone to compare if changed
        let newBase = new Date(baseDate);

        if (nextDeadline <= today) {
            while (nextDeadline <= today) {
                // Move base forward by cycle
                if (declarationSettings.cycle === '6_MONTHS') {
                    newBase.setMonth(newBase.getMonth() + 6);
                } else if (declarationSettings.cycle === '1_YEAR') {
                    newBase.setFullYear(newBase.getFullYear() + 1);
                }

                // Recalculate deadline based on new base
                nextDeadline = new Date(newBase);
                if (declarationSettings.cycle === '6_MONTHS') {
                    nextDeadline.setMonth(nextDeadline.getMonth() + 6);
                } else if (declarationSettings.cycle === '1_YEAR') {
                    nextDeadline.setFullYear(nextDeadline.getFullYear() + 1);
                }
            }

            // Only update if base date actually changed (to prevent infinite loops)
            if (newBase.getTime() !== originalBase.getTime()) {
                const newSettings: DeclarationSettings = {
                    ...declarationSettings,
                    nextDate: newBase.toISOString().split('T')[0], // Format YYYY-MM-DD
                    lastModified: Date.now()
                };
                handleSaveSettings(newSettings);
            }
        } else {
            setDeclarationDeadline(nextDeadline.toISOString().split('T')[0]);
        }

    }, [declarationSettings, user?.uid, user?.currentOrganizationId]); // Added organizationId dependency

    const fetchHistoryCounts = async () => {
        if (user?.uid) {
            try {
                const history = await StorageService.getAllHealthHistory(user.uid, user.currentOrganizationId);
                // Group by indicatorId
                const counts: Record<string, number> = {};
                history.forEach(h => {
                    counts[h.indicatorId] = (counts[h.indicatorId] || 0) + 1;
                });
                setHistoryCounts(counts);
            } catch (e) {
                console.error("Failed to fetch history counts", e);
            }
        }
    };












    const calculateCountdown = () => {
        // Use the calculated deadline from state (which handles cycle logic)
        if (!declarationDeadline) return null;

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let target = new Date(declarationDeadline);
        if (isNaN(target.getTime())) return null;

        const diff = target.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        return days;
    };

    const countdownDays = calculateCountdown();

    // Declaration countdown notification
    useEffect(() => {
        if (countdownDays === null || !user?.uid) return;

        // Notify at 30, 7, and 1 days
        if (countdownDays === 30 || countdownDays === 7 || countdownDays === 1) {
            const notificationKey = `declaration_${countdownDays}_${declarationDeadline}`;
            const sent = localStorage.getItem(notificationKey);

            if (!sent) {
                addNotification(
                    'declaration',
                    '申報倒數提醒',
                    `距離下次申報還有 ${countdownDays} 天`
                );
                localStorage.setItem(notificationKey, 'true');
            }
        }
    }, [countdownDays, user?.uid, declarationDeadline]);


    // Loading state alias for backward compatibility logic (if any)
    const loading = isReportsLoading; // Use derived loading state

    useEffect(() => {
        // Re-fetch reports when returning from Abnormal Recheck view to ensure updates are visible
        if (!showAbnormalRecheck && (showArchived || searchTerm.trim())) {
            refetchReports();
        }
    }, [showAbnormalRecheck, showArchived, searchTerm, refetchReports]);



    // Real-time Notification for New Abnormal Records (Deduplicated by Record ID)
    useEffect(() => {
        if (!user?.uid || isAbnormalLoading || !isAbnormalFetched) return;

        const storageKey = `notified_abnormal_ids_${user.uid}_${user.currentOrganizationId || 'personal'}`;
        let notifiedIds: string[] = [];
        try {
            notifiedIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (!Array.isArray(notifiedIds)) notifiedIds = [];
        } catch {
            notifiedIds = [];
        }

        const pendingRecords = abnormalRecords.filter(r => r.status === 'pending' && !r.fixedDate);
        const pendingIds = pendingRecords.map(r => r.id);
        const newPendingIds = pendingIds.filter(id => !notifiedIds.includes(id));

        if (newPendingIds.length > 0) {
            addNotification(
                'abnormal',
                '新的異常複檢',
                `有 ${newPendingIds.length} 筆新的異常項目需要處理`
            );
        }

        // Keep only active pending IDs + newly notified IDs so resolved ones are cleaned up
        localStorage.setItem(storageKey, JSON.stringify(pendingIds));
    }, [abnormalRecords, isAbnormalLoading, isAbnormalFetched, user?.uid, user?.currentOrganizationId]);

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

        // Month filter
        if (selectedMonth !== '') {
            const reportDate = new Date(r.date);
            if (reportDate.getMonth() + 1 !== selectedMonth) return false;
        }

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
                    (item.notes?.toLowerCase() || '').includes(itemKeywordSearch) ||
                    (report.buildingName?.toLowerCase() || '').includes(itemKeywordSearch) ||
                    (report.inspectorName?.toLowerCase() || '').includes(itemKeywordSearch) ||
                    (item.tags && item.tags.some(tag => tag.toLowerCase().includes(itemKeywordSearch)));

                const matchesStatus = filterStatus === 'ALL' ||
                    ((item.status as any) === filterStatus) ||
                    (filterStatus === 'Pass' && ((item.status as string) === 'OK' || (item.status as string) === 'Normal' || item.status === InspectionStatus.Normal)) ||
                    (filterStatus === 'Fail' && ((item.status as string) === 'Abnormal' || item.status === InspectionStatus.Abnormal));

                if (matchesHeaderSearch && matchesNameFilter && matchesKeyword && matchesStatus) {
                    const flattenedItem = {
                        ...item,
                        reportId: report.id,
                        date: report.date,
                        buildingName: report.buildingName,
                        inspectorName: report.inspectorName,
                        overallStatus: report.overallStatus
                    };

                    // Debug logging for abnormal/fixed items
                    if ((item.status as string) === 'Abnormal' || item.status === InspectionStatus.Abnormal || (item.status as string) === 'Fixed' || item.status === InspectionStatus.Fixed) {
                        console.log(`[Dashboard flattenedHistory] Item: ${item.name}, Status: ${item.status}, RepairDate: ${item.repairDate}, RepairNotes: ${item.repairNotes ? 'Yes' : 'No'}`);
                    }

                    flattened.push(flattenedItem);
                }
            });
        });

        // Return flattened array directly since this is "History" and we want to see all records
        return flattened;

    }, [filteredReports, searchTerm, locationFilter, keywordSearch, filterStatus]);

    const handleExportFiltered = () => {
        if (!flattenedHistory || flattenedHistory.length === 0) {
            alert('目前篩選條件下無任何紀錄可供匯出！');
            return;
        }
        const filterParts: string[] = [];
        if (selectedYear) filterParts.push(`${selectedYear}年`);
        if (selectedMonth !== '') filterParts.push(`${selectedMonth}月`);
        if (locationFilter) filterParts.push(locationFilter);
        if (keywordSearch) filterParts.push(keywordSearch);
        if (dateRange.start || dateRange.end) {
            filterParts.push(`${dateRange.start || '起'}~${dateRange.end || '迄'}`);
        }
        const filterDesc = filterParts.length > 0 ? `_${filterParts.join('_')}` : '';
        const now = new Date();
        const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `歷史紀錄_篩選結果${filterDesc}_共${flattenedHistory.length}筆_${dateStamp}`;
        exportToExcel(flattenedHistory, fileName, visibleColumns, columnOrder);
        setShowExportMenu(false);
    };

    const handleExportAll = () => {
        const allReportsFlattened: any[] = [];
        reports.forEach(report => {
            if (!report.items || report.items.length === 0) return;
            report.items.forEach(item => {
                allReportsFlattened.push({
                    ...item,
                    reportId: report.id,
                    date: report.date,
                    buildingName: report.buildingName,
                    inspectorName: report.inspectorName,
                    overallStatus: report.overallStatus
                });
            });
        });
        if (allReportsFlattened.length === 0) {
            alert('目前年度無任何紀錄可供匯出！');
            return;
        }
        const now = new Date();
        const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `歷史紀錄_${selectedYear}年度全資料_共${allReportsFlattened.length}筆_${dateStamp}`;
        exportToExcel(allReportsFlattened, fileName, visibleColumns, columnOrder);
        setShowExportMenu(false);
    };

    const handleExportMonthly = () => {
        const allReportsFlattened: any[] = [];
        reports.forEach(report => {
            if (!report.items || report.items.length === 0) return;
            report.items.forEach(item => {
                allReportsFlattened.push({
                    ...item,
                    reportId: report.id,
                    date: report.date,
                    buildingName: report.buildingName,
                    inspectorName: report.inspectorName,
                    overallStatus: report.overallStatus
                });
            });
        });
        generateMonthlyReport(allReportsFlattened);
        setShowExportMenu(false);
    };

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

    // Clock State & GitHub Commit Update Timestamp
    const [currentDateTime, setCurrentDateTime] = useState(new Date());
    const [gitUpdateTime, setGitUpdateTime] = useState<string>(() =>
        typeof __APP_UPDATE_TIME__ !== 'undefined' ? __APP_UPDATE_TIME__ : '26/11/07 11:26'
    );

    useEffect(() => {
        const cached = sessionStorage.getItem('fsippro_github_update_time');
        if (cached) {
            setGitUpdateTime(cached);
            return;
        }
        fetch('https://api.github.com/repos/tpc331619-collab/FireCheck_AIPro_GoogleAIStudio/commits/main')
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                const iso = data?.commit?.committer?.date || data?.commit?.author?.date;
                if (iso) {
                    const d = new Date(iso);
                    if (!isNaN(d.getTime())) {
                        const yy = String(d.getFullYear()).slice(-2);
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        const hh = String(d.getHours()).padStart(2, '0');
                        const min = String(d.getMinutes()).padStart(2, '0');
                        const formatted = `${yy}/${mm}/${dd} ${hh}:${min}`;
                        setGitUpdateTime(formatted);
                        sessionStorage.setItem('fsippro_github_update_time', formatted);
                    }
                }
            })
            .catch(() => {});
    }, []);

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
        return `${yyyy}/${mm}/${dd}`;
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

    const handleRestoreGooglePhoto = () => {
        if (!auth?.currentUser) return;

        // Find Google provider data
        const googleProvider = auth.currentUser.providerData.find(p => p.providerId === 'google.com' || p.photoURL);

        if (googleProvider?.photoURL) {
            setSelectedAvatar(googleProvider.photoURL);
            alert(t('originalPhotoRestored'));
        } else {
            alert(t('originalPhotoNotFound'));
        }
    };

    // Render Abnormal Recheck Logic (early return - after all hooks)
    if (showAbnormalRecheck) {
        return (
            <Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div></div>}>
                <AbnormalRecheckList
                    user={user}
                    onBack={() => setShowAbnormalRecheck(false)}
                    lightSettings={currentLightSettings}
                    onRecordsUpdated={undefined}
                    systemSettings={systemSettings}
                />
            </Suspense>
        );
    }



    return (
        <div className={`flex flex-col h-full ${styles.bg} ${styles.text} transition-colors duration-300`}>
            {/* Modern Gradient Header */}
            <div className="bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 text-white py-3 sm:py-4 px-3 sm:px-4 shadow-xl flex-shrink-0">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 group sm:px-2 min-w-0 shrink-0">
                        <div className="relative flex items-center justify-center shrink-0">
                            {/* American Badge Styled Container */}
                            <div className="relative p-0.5 bg-gradient-to-b from-amber-200 via-amber-500 to-amber-700 rounded-lg border border-amber-300 transform group-hover:scale-105 transition-all duration-300">
                                <span className="sr-only">Badge Logo</span>
                                <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 fill-none stroke-slate-900 stroke-[1]" strokeLinecap="round" strokeLinejoin="round">
                                    {/* 7-Point Star (Classic Badge Component) */}
                                    <path d="M12 2l2.5 5.5 6 .5-4.5 4.5 1.5 6-5.5-3-5.5 3 1.5-6-4.5-4.5 6-.5z" className="fill-amber-400/90" />
                                    {/* Central Shield Seal */}
                                    <circle cx="12" cy="12" r="3.5" className="fill-slate-800" />
                                    {/* Protection Icon on Seal */}
                                    <path d="M12 10.5v3M10.5 12h3" className="stroke-amber-400 stroke-[1.5]" />
                                    {/* Outer Decorative Elements */}
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" className="stroke-slate-900/10 stroke-[0.2]" />
                                </svg>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-xl sm:text-2xl tracking-tight bg-gradient-to-r from-amber-100 via-white to-amber-300 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] uppercase italic leading-none pr-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                {t('appName')}
                            </span>
                            <span className="text-[7px] sm:text-[8px] font-semibold text-amber-400/80 tracking-[0.18em] sm:tracking-[0.2em] uppercase mt-0.5 ml-0.5 drop-shadow-sm whitespace-nowrap">
                                Professional Edition
                            </span>
                        </div>
                        {/* Guest Timer Display */}
                        {user?.isGuest && guestExpiry && (
                            <div className={`hidden sm:flex ml-4 px-3 py-1 rounded-full text-xs font-mono font-bold items-center gap-2 border animate-in fade-in ${isExpiring ? 'bg-red-500/20 text-red-200 border-red-500/30 animate-pulse' : 'bg-white/10 text-slate-200 border-white/10'}`}>
                                <Clock className="w-3.5 h-3.5" />
                                {t('guestTimer')}: {timeLeft}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <button
                            onClick={handleManualRefresh}
                            className={`p-2 hover:bg-white/20 rounded-xl transition-all backdrop-blur-sm ${isRefreshing ? 'opacity-50' : ''}`}
                            disabled={isRefreshing}
                            title={t('refresh') || '重新整理'}
                        >
                            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                        {!user.isGuest && (
                            <>

                                <button
                                    onClick={() => setShowOrgManager(true)}
                                    className="hidden sm:flex px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg items-center gap-2 transition-all mr-1"
                                    title={t('switchOrganization')}
                                >
                                    <span className="text-sm font-medium inline-block max-w-[100px] truncate">
                                        {user.currentOrganizationId ? currentOrgName : t('personalOrganization')}
                                    </span>
                                    <Building className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setIsGuestShareModalOpen(true)}
                                    className="p-2 sm:p-2.5 hover:bg-white/20 rounded-xl transition-all backdrop-blur-sm"
                                    title="消防稽查／訪客通行碼 (QR Code)"
                                >
                                    <QrCode className="w-5 h-5" />
                                </button>
                                {/* Management Button Removed */}
                                {(isAdmin || systemSettings?.allowInspectorProfile !== false) && (
                                    <button onClick={() => { setSettingsModalMode('full'); setSettingsTab('PROFILE'); setIsSettingsOpen(true); }} className="p-2 sm:p-2.5 hover:bg-white/20 rounded-xl transition-all backdrop-blur-sm" title={t('settings')}>
                                        <Settings className="w-5 h-5" />
                                    </button>
                                )}
                                <NotificationBell
                                    userId={user.uid}
                                    organizationId={user.currentOrganizationId}
                                    className="p-2 sm:p-2.5 hover:bg-white/20 rounded-xl transition-all backdrop-blur-sm"
                                    iconClassName="text-white w-5 h-5"
                                    systemSettings={systemSettings}
                                    isAdmin={isAdmin}
                                    pendingUsersCount={pendingUsersCount}
                                    onNotificationNavigate={(type) => {
                                        if (type === 'abnormal') {
                                            setShowAbnormalRecheck(true);
                                        } else if (type === 'health') {
                                            setIsHealthModalOpen(true);
                                        } else if (type === 'declaration') {
                                            setSettingsModalMode('declaration');
                                            setSettingsTab('DECLARATION');
                                            setIsSettingsOpen(true);
                                        } else if (type === 'lights') {
                                            setSettingsModalMode('lights');
                                            setSettingsTab('LIGHTS');
                                            setIsSettingsOpen(true);
                                        } else if (type === 'profile') {
                                            setIsAdminDashboardOpen(true);
                                        }
                                    }}
                                />
                            </>
                        )}
                        <button
                            onClick={onLogout}
                            className={`${!user.isGuest ? 'hidden sm:inline-flex' : 'inline-flex'} p-2 sm:p-2.5 hover:bg-white/20 rounded-xl transition-all backdrop-blur-sm`}
                            title="登出"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto pb-24 custom-scrollbar transition-colors duration-300" style={styles.patternStyle}>
                <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-4 sm:space-y-6">

                    {/* User Info & Quick Search Row */}
                    <div className="flex items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-4">
                            <div>
                                <p className={`text-sm font-bold transition-colors ${styles.isDark ? 'text-white drop-shadow-sm' : 'text-slate-800'}`}>{getTimeGreeting()}，{user.displayName || t('guest')}</p>
                                <p className={`text-xs mt-0.5 transition-colors ${styles.isDark ? 'text-slate-300' : 'text-slate-500'}`}>{formatDateTime(currentDateTime)}</p>
                            </div>
                            <div
                                className={`relative w-12 h-12 rounded-full p-[3px] shadow-md transition-all ${!user.isGuest ? 'hover:scale-105 cursor-pointer' : ''}`}
                                style={{
                                    background: user.isGuest ? `conic-gradient(
                                        ${systemSettings?.allowGuestView ? '#10b981' : '#e5e7eb'} 0deg 90deg,
                                        ${systemSettings?.allowGuestRecheck ? '#3b82f6' : '#e5e7eb'} 90deg 180deg,
                                        ${systemSettings?.allowGuestEquipmentOverview ? '#f59e0b' : '#e5e7eb'} 180deg 270deg,
                                        ${systemSettings?.allowGuestHistory ? '#8b5cf6' : '#e5e7eb'} 270deg 360deg
                                    )` : `linear-gradient(135deg, ${THEME_COLORS.primary}, ${THEME_COLORS.secondary})`,
                                    padding: '3px'
                                }}
                                title={user.isGuest ? `訪客權限狀態:\n1. 檢視: ${systemSettings?.allowGuestView ? '開啟' : '關閉'}\n2. 複檢: ${systemSettings?.allowGuestRecheck ? '開啟' : '關閉'}\n3. 概覽: ${systemSettings?.allowGuestEquipmentOverview ? '開啟' : '關閉'}\n4. 歷史: ${systemSettings?.allowGuestHistory ? '開啟' : '關閉'}` : t('sectionCardOrder')}
                                onClick={() => {
                                    if (!user.isGuest && (isAdmin || systemSettings?.allowInspectorCustomizeCardOrder)) {
                                        setIsCardOrderModalOpen(true);
                                    }
                                }}
                            >
                                <div className="w-full h-full rounded-full bg-white p-[2px] overflow-hidden">
                                    <img src={user.photoURL || CARTOON_AVATARS[0]} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                                </div>
                                <SyncStatusBadge className="sm:hidden" />
                            </div>
                        </div>

                        {/* Compact Quick Search */}
                        {((!user.isGuest && (isAdmin || systemSettings?.allowInspectorQuickSearch !== false)) || (user.isGuest && systemSettings?.allowGuestQuickSearch !== false)) && (
                            <div className="relative flex-1 max-w-md">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    className="block w-full pl-9 pr-10 py-2 border border-slate-200 bg-white rounded-lg text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-slate-300 focus:border-slate-300 text-base sm:text-sm font-medium transition-all shadow-sm uppercase"
                                    placeholder={t('quickSearchPlaceholder')}
                                    style={{ fontSize: '16px', textTransform: 'uppercase' }}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && searchTerm.trim()) {
                                            const code = searchTerm.trim();
                                            const definitions = await StorageService.getEquipmentDefinitions(user.uid, user.currentOrganizationId);
                                            const exactMatch = definitions.find(d => d.barcode?.toUpperCase() === code.toUpperCase());
                                            const matches = definitions.filter(d => d.barcode?.toUpperCase() === code.toUpperCase() || d.name.toUpperCase().includes(code.toUpperCase()));

                                            if (exactMatch || matches.length === 1) {
                                                setPassportEquipment(exactMatch || matches[0]);
                                            } else if (matches.length > 1) {
                                                setSearchParams({ q: code }, { replace: true });
                                            } else {
                                                // Ensure any potential overlays are considered if this was triggered in a way that might conflict
                                                setAlertConfig({
                                                    isOpen: true,
                                                    title: t('searchFailed') || '搜尋失敗',
                                                    message: `找不到設備編號「${code}」\n\n請確認:\n1. 設備編號是否正確\n2. 設備是否屬於目前選擇的場所和建築物`,
                                                    onConfirm: () => {
                                                        setIsSearchActive(false);
                                                        setSearchTerm('');
                                                        setAlertConfig(null);
                                                        setTimeout(() => {
                                                            setSearchParams({}, { replace: true });
                                                        }, 50);
                                                    }
                                                });
                                            }
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => setIsQuickScanOpen(true)}
                                    className="absolute inset-y-0 right-0 pr-2 flex items-center"
                                >
                                    <div className="p-1 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">
                                        <ScanLine className="h-4 w-4 text-slate-600" />
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>



                    {/* Stats Row (Option A: HUD Top Accent Pods - Left KPIs / Right System Controls) */}
                    {!user.isGuest && (
                        <div className={`grid grid-cols-2 gap-3 sm:gap-4 items-stretch ${isAdmin ? 'lg:grid-cols-6 md:grid-cols-3' : 'md:grid-cols-4'}`}>
                            {/* 1. Total Equipment (KPI) */}
                            <div className="relative overflow-hidden bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3.5 border border-slate-200/80 shadow-sm flex items-center justify-between min-h-[6.25rem] h-full transition-all duration-300 hover:shadow-md hover:border-blue-300 group">
                                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400" />
                                <div className="flex flex-col justify-between h-full min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                        <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                            {t('totalEquipment')}
                                        </p>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 shrink-0">
                                            列管
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-1 min-w-0 my-0.5">
                                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight truncate leading-none" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                            {nameCount}
                                        </p>
                                        <span className="text-[10px] font-bold text-slate-500 shrink-0">具</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate">
                                        全區列管消防設備
                                    </p>
                                </div>
                                <div className="p-2.5 bg-gradient-to-br from-blue-50 to-slate-50/80 border border-blue-100/80 rounded-xl shadow-inner shrink-0 group-hover:bg-blue-100/80 transition-colors">
                                    <Database className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
                                </div>
                            </div>

                            {/* 2. Abnormal Pending (KPI) */}
                            <div className={`relative overflow-hidden bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3.5 border shadow-sm flex items-center justify-between min-h-[6.25rem] h-full transition-all duration-300 hover:shadow-md group ${abnormalCount > 0 ? 'border-red-200/90 hover:border-red-300' : 'border-slate-200/80 hover:border-emerald-300'}`}>
                                <div className={`absolute inset-x-0 top-0 h-1 ${abnormalCount > 0 ? 'bg-gradient-to-r from-red-600 via-red-500 to-rose-400' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`} />
                                <div className="flex flex-col justify-between h-full min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                        <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                            {t('pendingAbnormal')}
                                        </p>
                                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md border shrink-0 ${abnormalCount > 0 ? 'bg-red-50 text-red-700 border-red-200/70' : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'}`}>
                                            {abnormalCount > 0 ? '待複檢' : '正常'}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-1 min-w-0 my-0.5">
                                        <p className={`text-2xl sm:text-3xl font-extrabold tracking-tight truncate leading-none ${abnormalCount > 0 ? 'text-red-600' : 'text-slate-800'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                                            {abnormalCount}
                                        </p>
                                        <span className="text-[10px] font-bold text-slate-500 shrink-0">件</span>
                                    </div>
                                    <p className={`text-[10px] truncate ${abnormalCount > 0 ? 'text-red-500/90 font-medium' : 'text-slate-400'}`}>
                                        {abnormalCount > 0 ? '尚有待改善異常項目' : '目前無待處理異常'}
                                    </p>
                                </div>
                                <div className={`p-2.5 rounded-xl border shadow-inner shrink-0 transition-all ${abnormalCount > 0 ? 'bg-gradient-to-br from-red-50 to-rose-50/50 border-red-100 group-hover:bg-red-100/80' : 'bg-gradient-to-br from-emerald-50/70 to-white border-emerald-100 group-hover:bg-emerald-100/60'}`}>
                                    <AlertOctagon className={`w-5 h-5 transition-transform group-hover:scale-110 ${abnormalCount > 0 ? 'text-red-500' : 'text-emerald-600'}`} />
                                </div>
                            </div>

                            {/* 3. Declaration Countdown & Cycle Quick Access (KPI) */}
                            <button
                                onClick={() => {
                                    if (!user.isGuest && (isAdmin || systemSettings?.allowInspectorDeclaration !== false)) {
                                        setSettingsTab('DECLARATION');
                                        setSettingsModalMode('focused');
                                        setIsSettingsOpen(true);
                                    }
                                }}
                                disabled={user.isGuest || (!isAdmin && systemSettings?.allowInspectorDeclaration === false)}
                                className="relative overflow-hidden bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3.5 border border-slate-200/80 shadow-sm flex items-center justify-between min-h-[6.25rem] h-full transition-all duration-300 hover:shadow-md hover:border-amber-300 hover:bg-white text-left group cursor-pointer disabled:cursor-default"
                                title={!user.isGuest && (isAdmin || systemSettings?.allowInspectorDeclaration !== false) ? "點擊設定申報週期與基準日" : undefined}
                            >
                                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400" />
                                <div className="flex flex-col justify-between h-full min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                        <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                            {t('declarationCountdown')}
                                        </p>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-amber-100/90 text-amber-800 border border-amber-200/60 shrink-0">
                                            {declarationSettings?.cycle === '6_MONTHS' ? '每半年' : '每年'}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-1 min-w-0 my-0.5">
                                        {countdownDays !== null ? (
                                            <>
                                                <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight truncate leading-none ${countdownDays <= 30 ? 'text-amber-500' : 'text-slate-800'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                    {countdownDays}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-500 shrink-0 uppercase tracking-wider">{t('days')}</span>
                                            </>
                                        ) : (
                                            <span className="text-2xl sm:text-3xl font-bold text-slate-200 tracking-tight italic" style={{ fontFamily: "'Outfit', sans-serif" }}>--</span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 group-hover:text-amber-600 transition-colors truncate">
                                        {declarationSettings?.records && declarationSettings.records.length > 0
                                            ? `上次申報: ${declarationSettings.records[0].actualDate.replace(/-/g, '/')} (${declarationSettings.records[0].periodLabel})`
                                            : (declarationDeadline ? `下次截止: ${declarationDeadline.replace(/-/g, '/')}` : '點此設定申報日')}
                                    </p>
                                </div>
                                <div className={`p-2.5 rounded-xl border shadow-inner shrink-0 transition-all ${countdownDays !== null && countdownDays <= 30 ? 'bg-gradient-to-br from-amber-50 to-white border-amber-200 group-hover:bg-amber-100' : 'bg-gradient-to-br from-amber-50/60 to-white border-amber-100/80 group-hover:bg-amber-100/70'}`}>
                                    <Calendar className={`w-5 h-5 transition-transform group-hover:scale-110 ${countdownDays !== null && countdownDays <= 30 ? 'text-amber-500' : 'text-amber-600'}`} />
                                </div>
                            </button>

                            {/* 4. Light Settings Card (System Control) */}
                            {!user.isGuest && (isAdmin || systemSettings?.allowInspectorLightSettings) && (
                                <button
                                    onClick={() => {
                                        setSettingsTab('LIGHTS');
                                        setSettingsModalMode('focused');
                                        setIsSettingsOpen(true);
                                    }}
                                    className="relative overflow-hidden bg-slate-50/95 hover:bg-white backdrop-blur-md rounded-2xl px-4 py-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between min-h-[6.25rem] h-full transition-all duration-300 hover:shadow-md hover:border-orange-300 group"
                                >
                                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500" />
                                    <div className="flex flex-col justify-between h-full text-left min-w-0 flex-1 pr-2">
                                        <div className="flex items-center gap-1 whitespace-nowrap">
                                            <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                {t('lightSettings')}
                                            </p>
                                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-orange-100/80 text-orange-700 border border-orange-200/60 shrink-0">
                                                規則
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 min-w-0 my-0.5">
                                            <p className="text-sm sm:text-base font-extrabold text-slate-800 group-hover:text-orange-600 transition-colors truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                {t('lights')}
                                            </p>
                                            <span className="flex items-center gap-0.5 shrink-0">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 group-hover:text-orange-600/80 transition-colors truncate">
                                            紅 · 黃 · 綠燈預警週期
                                        </p>
                                    </div>
                                    <div className="p-2.5 bg-gradient-to-br from-orange-50 via-amber-50/60 to-white border border-orange-200/70 rounded-xl shadow-inner shrink-0 transition-all group-hover:bg-orange-100/80">
                                        {/* Custom Traffic Signal Light Icon */}
                                        <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            {/* Side Visors */}
                                            <path d="M4.5 6.5H6.5M17.5 6.5H19.5M4.5 12H6.5M17.5 12H19.5M4.5 17.5H6.5M17.5 17.5H19.5" stroke="#EA580C" strokeWidth="1.75" strokeLinecap="round" />
                                            {/* Signal Housing */}
                                            <rect x="6.5" y="2" width="11" height="20" rx="4" fill="#FFF7ED" stroke="#EA580C" strokeWidth="1.75" />
                                            {/* Red / Amber / Green Lights */}
                                            <circle cx="12" cy="6.5" r="2.1" fill="#EF4444" />
                                            <circle cx="12" cy="12" r="2.1" fill="#F59E0B" />
                                            <circle cx="12" cy="17.5" r="2.1" fill="#10B981" />
                                        </svg>
                                    </div>
                                </button>
                            )}

                            {/* 5. Permissions Card (Admin Only - System Control) */}
                            {isAdmin && (
                                <button
                                    onClick={() => setIsPermissionsModalOpen(true)}
                                    className="relative overflow-hidden bg-slate-50/95 hover:bg-white backdrop-blur-md rounded-2xl px-4 py-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between min-h-[6.25rem] h-full transition-all duration-300 hover:shadow-md hover:border-indigo-300 group"
                                >
                                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" />
                                    <div className="flex flex-col justify-between h-full text-left min-w-0 flex-1 pr-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                {t('permissions')}
                                            </p>
                                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                                權限
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 my-0.5">
                                            <p className="text-sm sm:text-base font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                {t('onOff')}
                                            </p>
                                            <div className="flex gap-0.5 sm:gap-1 shrink-0">
                                                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shadow-sm transition-all ${systemSettings?.allowGuestView ? 'bg-green-500 scale-110' : 'bg-slate-300'}`} />
                                                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shadow-sm transition-all ${systemSettings?.allowCloudGallery ? 'bg-blue-500 scale-110' : 'bg-slate-300'}`} />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 group-hover:text-indigo-600/80 transition-colors truncate">
                                            檢查員權限與訪客模式
                                        </p>
                                    </div>
                                    <div className="p-2.5 bg-gradient-to-br from-indigo-50/80 to-white border border-indigo-100 rounded-xl shadow-inner shrink-0 transition-all group-hover:bg-indigo-100/80">
                                        <ShieldCheck className="w-5 h-5 text-indigo-600 transition-transform group-hover:scale-110" />
                                    </div>
                                </button>
                            )}

                            {/* 6. System Management Card (Admin Only - System Control) */}
                            {isAdmin && (
                                <button
                                    onClick={() => setIsAdminDashboardOpen(true)}
                                    className="relative overflow-hidden bg-slate-50/95 hover:bg-white backdrop-blur-md rounded-2xl px-4 py-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between min-h-[6.25rem] h-full transition-all duration-300 hover:shadow-md hover:border-rose-300 group"
                                >
                                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 via-red-500 to-orange-400" />
                                    <div className="flex flex-col justify-between h-full text-left min-w-0 flex-1 pr-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                {t('systemManagement')}
                                            </p>
                                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200/60">
                                                後台
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 min-w-0 my-0.5">
                                            <p className="text-sm sm:text-base font-extrabold text-slate-800 group-hover:text-rose-600 transition-colors truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                {t('coreAdmin')}
                                            </p>
                                        </div>
                                        <p className="text-[10px] text-slate-400 group-hover:text-rose-600/80 transition-colors truncate">
                                            白名單審核與組織管理
                                        </p>
                                    </div>
                                    <div className="p-2.5 bg-gradient-to-br from-rose-50 to-white border border-rose-100 rounded-xl shadow-inner shrink-0 transition-all group-hover:bg-rose-100/80 relative">
                                        <Settings className="w-5 h-5 text-rose-500 transition-transform group-hover:scale-110" />
                                        {pendingUsersCount > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 border-2 border-white shadow-sm flex items-center justify-center">
                                                    <span className="text-[8px] font-bold text-white leading-none">{pendingUsersCount}</span>
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Main Actions Grid (Dynamic Order) */}
                    <div className={`grid gap-3 ${user.isGuest
                        ? 'grid-cols-2'
                        : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                        }`}>
                        {cardOrder.map(cardId => {
                            switch (cardId) {
                                case 'startInspection':
                                    return (!user.isGuest ? (isAdmin || (systemSettings?.allowInspectorStartInspection !== false && (systemSettings?.allowInspectorListInspection !== false || systemSettings?.allowInspectorMapInspection !== false))) : systemSettings?.allowGuestStartInspection === true) && (
                                        <button
                                            key={cardId}
                                            onClick={() => setIsInspectionModeOpen(true)}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-blue-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <ClipboardCheck className="w-24 h-24 text-blue-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="relative p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl w-fit shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                                                    <ClipboardCheck className="w-5 h-5 text-white" />
                                                    {inspectionProgress.pendingCount > 0 && (
                                                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white shadow-sm"></span>
                                                        </span>
                                                    )}
                                                </div>
                                                {nameCount > 0 && (
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${inspectionProgress.pendingCount > 0
                                                            ? 'bg-red-50 text-red-600 border-red-200'
                                                            : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                        }`}>
                                                        達成率 {inspectionProgress.rate}%
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('startInspectionTitle')}</h3>
                                            {nameCount > 0 ? (
                                                <div className="space-y-1.5">
                                                    <p className={`text-[11px] font-bold leading-tight tracking-tight ${inspectionProgress.pendingCount > 0 ? 'text-red-600' : 'text-emerald-600'
                                                        }`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                        {inspectionProgress.pendingCount > 0
                                                            ? `尚有 ${inspectionProgress.pendingCount} 具設備需檢查`
                                                            : `✓ 本期 ${nameCount} 具設備皆已定檢`}
                                                    </p>
                                                    <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${inspectionProgress.pendingCount > 0 ? 'bg-blue-500' : 'bg-emerald-500'
                                                                }`}
                                                            style={{ width: `${inspectionProgress.rate}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('startInspectionDesc')}</p>
                                            )}
                                        </button>
                                    );

                                case 'abnormalRecheck':
                                    return (!user.isGuest || (user.isGuest && systemSettings?.allowGuestRecheck)) && (isAdmin || systemSettings?.allowInspectorAbnormalRecheck !== false) && (
                                        <button
                                            key={cardId}
                                            onClick={() => setShowAbnormalRecheck(true)}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-amber-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <AlertOctagon className="w-24 h-24 text-amber-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="relative p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl w-fit mb-3 shadow-lg shadow-amber-200 group-hover:scale-110 transition-transform">
                                                <AlertOctagon className="w-5 h-5 text-white" />
                                                {abnormalCount > 0 && (
                                                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white shadow-sm"></span>
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('abnormalRecheck')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                {abnormalCount > 0 ? `${abnormalCount}${t('pendingCountSuffix')}` : t('noAbnormalItems')}
                                            </p>
                                        </button>
                                    );

                                case 'history':
                                    return (!user.isGuest || (user.isGuest && systemSettings?.allowGuestHistory)) && (isAdmin || systemSettings?.allowInspectorHistory !== false) && (
                                        <button
                                            key={cardId}
                                            onClick={scrollToHistory}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-indigo-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <ScrollText className="w-24 h-24 text-indigo-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl w-fit mb-3 shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">
                                                <ScrollText className="w-5 h-5 text-white" />
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('history')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{flattenedHistory.length} {t('historyRecordsCount')}</p>
                                        </button>
                                    );

                                case 'myEquipment':
                                    return !user.isGuest && (isAdmin || systemSettings?.allowInspectorMyEquipment !== false) && (
                                        <button
                                            key={cardId}
                                            onClick={() => onMyEquipment()}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-cyan-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <Building className="w-24 h-24 text-cyan-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl w-fit mb-3 shadow-lg shadow-cyan-200 group-hover:scale-110 transition-transform">
                                                <Building className="w-5 h-5 text-white" />
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('myEquipment')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('myEquipmentDesc')}</p>
                                        </button>
                                    );

                                case 'mapEditor':
                                    return !user.isGuest && (isAdmin || systemSettings?.allowInspectorMyMap !== false) && (
                                        <button
                                            key={cardId}
                                            onClick={() => setIsEquipmentMapOpen(true)}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-purple-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <MapPinned className="w-24 h-24 text-purple-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="p-2.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl w-fit mb-3 shadow-lg shadow-purple-200 group-hover:scale-110 transition-transform">
                                                <MapPinned className="w-5 h-5 text-white" />
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('mapEditor')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('mapEditorDesc')}</p>
                                        </button>
                                    );

                                case 'addEquipment':
                                    return !user.isGuest && (isAdmin || systemSettings?.allowInspectorAddEquipment === true) && (
                                        <div
                                            key={cardId}
                                            onClick={onAddEquipment}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-emerald-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] cursor-pointer"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <PlusCircle className="w-24 h-24 text-emerald-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl w-fit mb-3 shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                                                <PlusCircle className="w-5 h-5 text-white" />
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('addEquipment')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('addEquipmentDesc')}</p>
                                        </div>
                                    );

                                case 'healthIndicators':
                                    return (!user.isGuest) && (isAdmin || systemSettings?.allowInspectorHealthIndicators !== false) && (
                                        <button
                                            key={cardId}
                                            onClick={() => setIsHealthModalOpen(true)}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-pink-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <Clock className="w-24 h-24 text-pink-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="p-2.5 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl w-fit mb-3 shadow-lg shadow-pink-200 group-hover:scale-110 transition-transform">
                                                <Clock className="w-5 h-5 text-white" />
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('healthIndicators')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{Object.keys(healthIndicators || {}).length} {t('indicatorCountSuffix')}</p>
                                        </button>
                                    );

                                case 'addNameList':
                                    return !user.isGuest && (isAdmin || systemSettings?.allowInspectorManageHierarchy === true) && (
                                        <button
                                            key={cardId}
                                            onClick={onManageHierarchy}
                                            className="group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border border-slate-200/60 transition-all duration-300 hover:border-orange-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <ListPlus className="w-24 h-24 text-orange-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="p-2.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl w-fit mb-3 shadow-lg shadow-orange-200 group-hover:scale-110 transition-transform">
                                                <ListPlus className="w-5 h-5 text-white" />
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('addNameList')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('addNameListDescShort')}</p>
                                        </button>
                                    );

                                case 'equipmentOverview':
                                    return (!user.isGuest || systemSettings?.allowGuestEquipmentOverview) && (isAdmin || systemSettings?.allowInspectorEquipmentOverview !== false) && (
                                        <button
                                            key={cardId}
                                            onClick={() => setIsEquipmentExpanded(!isEquipmentExpanded)}
                                            className={`group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-4 text-left border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] ${isEquipmentExpanded ? 'border-slate-400 ring-2 ring-slate-100 shadow-md' : 'border-slate-200/60 hover:border-slate-300'}`}
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                                                <PieChart className="w-24 h-24 text-slate-600 -mr-8 -mt-8 rotate-12" />
                                            </div>
                                            <div className="p-2.5 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl w-fit mb-3 shadow-lg shadow-slate-200 group-hover:scale-110 transition-transform">
                                                <PieChart className="w-5 h-5 text-white" />
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-base mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('equipmentOverview')}</h3>
                                            <p className="text-[11px] font-medium text-slate-500 leading-tight tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('equipmentOverviewDesc')}</p>
                                        </button>
                                    );

                                default:
                                    return null;
                            }
                        })}
                    </div>

                    {/* Equipment Overview Stats (Expanded) */}
                    <EquipmentStatsExpanded
                        user={user}
                        systemSettings={systemSettings}
                        onMyEquipment={onMyEquipment}
                        isOpen={isEquipmentExpanded}
                    />

                    {/* 底部版權與版本資訊 (Footer) */}
                    {(() => {
                        const isDarkBg = !!styles.isDark;
                        return (
                            <footer className={`mt-12 pt-6 pb-6 border-t flex items-center justify-center gap-2 text-xs select-none flex-wrap ${isDarkBg ? 'border-white/25 text-white/90' : 'border-slate-300 text-slate-600'
                                }`}>
                                <span className={`font-bold tracking-wide ${isDarkBg ? 'text-white' : 'text-slate-700'
                                    }`}>
                                    V 2.6.4
                                </span>
                                <span className={isDarkBg ? 'text-white/60' : 'text-slate-400'}>·</span>
                                <span className={`font-mono font-semibold tracking-tight ${isDarkBg ? 'text-white/90' : 'text-slate-600'}`}>
                                    更新日期{gitUpdateTime}
                                </span>
                                <span className={isDarkBg ? 'text-white/60' : 'text-slate-400'}>·</span>
                                <span className="font-medium tracking-wide">
                                    © 2026 FSIPPRO Team. All Rights Reserved.
                                </span>
                            </footer>
                        );
                    })()}

                    {(showArchived || (isSearchActive && searchTerm.trim())) && (
                        <div className="fixed inset-0 z-[60] bg-slate-50 dark:bg-slate-900 overflow-y-auto animate-in fade-in duration-200">
                            <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white dark:bg-slate-800 p-3 md:p-4 rounded-2xl shadow-sm border-l-4 border-blue-500 sticky top-4 z-30 gap-4 sm:gap-0">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-xl">
                                            {searchTerm ? <Search className="w-6 h-6 text-blue-600 dark:text-blue-400" /> : <History className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
                                        </div>
                                        <div>
                                            <h1 className="text-xl font-bold text-slate-800 dark:text-white">{searchTerm ? t('searchResults') : t('historyRecords')}</h1>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{searchTerm ? `${t('keywordPrefix')}: "${searchTerm}"` : t('allRecords')}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                                        {/* Year Selector */}
                                        <select
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-bold text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                                        >
                                            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                                <option key={year} value={year}>{year}年</option>
                                            ))}
                                        </select>

                                        {/* Month Selector */}
                                        <select
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(e.target.value === '' ? '' : Number(e.target.value))}
                                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-bold text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                                        >
                                            <option value="">{t('allMonths') || '全年'}</option>
                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                                                <option key={month} value={month}>{month}月</option>
                                            ))}
                                        </select>



                                        {/* Filter Toggle */}
                                        {(isAdmin || systemSettings?.allowInspectorHistoryFilter !== false) && (
                                            <button
                                                onClick={() => {
                                                    setShowFilters(!showFilters);
                                                    if (showColumns) setShowColumns(false); // Close columns if opening filters
                                                }}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all whitespace-nowrap text-sm border ${showFilters ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                                            >
                                                <Filter className="w-4 h-4" />
                                                {showFilters ? t('hideFilters') : t('showFilters')}
                                            </button>
                                        )}

                                        {/* Column Toggle */}
                                        {(isAdmin || systemSettings?.allowInspectorHistoryShowHideFields !== false) && (
                                            <button
                                                onClick={() => {
                                                    setShowColumns(!showColumns);
                                                    if (showFilters) setShowFilters(false); // Close filters if opening columns
                                                }}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all whitespace-nowrap text-sm border ${showColumns ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                                            >
                                                <LayoutGrid className="w-4 h-4" />
                                                {showColumns ? t('hideColumns') : t('showColumns')}
                                            </button>
                                        )}

                                        <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>

                                        {/* Export Buttons */}
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                                    className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold transition-all whitespace-nowrap text-sm shadow-md shadow-emerald-200"
                                                    title="點選展開匯出選項"
                                                >
                                                    <FileDown className="w-4 h-4" />
                                                    <span>{t('export')}</span>
                                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                                                </button>

                                                {/* Export Options Modal (Centered) */}
                                                {showExportMenu && (
                                                    <div
                                                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
                                                        onClick={() => setShowExportMenu(false)}
                                                    >
                                                        <div
                                                            className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden transform animate-in zoom-in-95 duration-150"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {/* Modal Header */}
                                                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70">
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl text-emerald-600 dark:text-emerald-400">
                                                                        <FileDown className="w-5 h-5" />
                                                                    </div>
                                                                    <div>
                                                                        <h3 className="font-bold text-base text-slate-800 dark:text-white">選擇匯出格式</h3>
                                                                        <p className="text-xs text-slate-500 dark:text-slate-400">請點選欲下載的資料範圍</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowExportMenu(false)}
                                                                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                                                                >
                                                                    <X className="w-5 h-5" />
                                                                </button>
                                                            </div>

                                                            {/* Options List */}
                                                            <div className="p-4 space-y-2.5">
                                                                {/* Option 1: Export Filtered (Highlighted) */}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleExportFiltered();
                                                                    }}
                                                                    className="flex flex-col w-full p-3.5 bg-emerald-50/80 hover:bg-emerald-100 active:scale-[0.98] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 rounded-2xl transition-all text-left border-2 border-emerald-300 dark:border-emerald-700/60 shadow-xs cursor-pointer"
                                                                >
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-300 text-sm">
                                                                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                                                            <span>匯出篩選結果</span>
                                                                        </div>
                                                                        <span className="px-2.5 py-0.5 text-xs font-black bg-emerald-600 text-white rounded-full">
                                                                            {flattenedHistory.length} 筆
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-emerald-700/90 dark:text-emerald-400/80 mt-1 pl-6">
                                                                        只匯出目前符合條件之資料（含自訂欄位）
                                                                    </p>
                                                                </button>

                                                                {/* Option 2: Export All in Year */}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleExportAll();
                                                                    }}
                                                                    className="flex flex-col w-full p-3.5 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] dark:bg-slate-700/50 dark:hover:bg-slate-700 rounded-2xl transition-all text-left border border-slate-200 dark:border-slate-600 cursor-pointer"
                                                                >
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-sm">
                                                                            <Database className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                                                                            <span>匯出全年度全部資料</span>
                                                                        </div>
                                                                        <span className="px-2.5 py-0.5 text-xs font-semibold bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-full">
                                                                            {reports.reduce((acc, r) => acc + (r.items?.length || 0), 0)} 筆
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 pl-6">
                                                                        {selectedYear} 年度所有巡檢資料（不限篩選）
                                                                    </p>
                                                                </button>

                                                                {/* Option 3: Official Monthly Report */}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleExportMonthly();
                                                                    }}
                                                                    className="flex flex-col w-full p-3.5 bg-blue-50/70 hover:bg-blue-100/80 active:scale-[0.98] dark:bg-blue-950/40 dark:hover:bg-blue-900/50 rounded-2xl transition-all text-left border border-blue-200 dark:border-blue-800 cursor-pointer"
                                                                >
                                                                    <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300 text-sm">
                                                                        <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                                                        <span>本月官方月報 (Excel)</span>
                                                                    </div>
                                                                    <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-1 pl-6">
                                                                        標準格式月度巡檢統計與報表
                                                                    </p>
                                                                </button>
                                                            </div>

                                                            {/* Cancel Button */}
                                                            <div className="p-4 pt-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowExportMenu(false)}
                                                                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-2xl text-sm font-bold transition-colors cursor-pointer"
                                                                >
                                                                    取消
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>

                                        <button
                                            onClick={() => {
                                                setShowArchived(false);
                                                setSearchParams({}, { replace: true });
                                                // useEffect will catch this and set isSearchActive(false) and searchTerm('')
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors whitespace-nowrap text-sm shadow-md shadow-slate-200"
                                        >
                                            <ChevronRight className="w-4 h-4 rotate-180" />
                                            {t('backToDashboard')}
                                        </button>
                                    </div>
                                </div>

                                {/* Filter Controls */}
                                {showFilters && (
                                    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                            <Filter className="w-4 h-4" />
                                            {t('filterCriteria')}
                                        </h3>

                                        <div className="flex flex-col gap-4">
                                            {/* Date Range Start */}
                                            <div className="w-full overflow-hidden">
                                                <label className="text-xs font-bold text-slate-700 mb-1 block">{t('startDate')}</label>
                                                <input
                                                    type="date"
                                                    value={dateRange.start}
                                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    style={{ fontSize: '16px', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                            {/* Date Range End */}
                                            <div className="w-full overflow-hidden">
                                                <label className="text-xs font-bold text-slate-700 mb-1 block">{t('endDate')}</label>
                                                <input
                                                    type="date"
                                                    value={dateRange.end}
                                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    style={{ fontSize: '16px', boxSizing: 'border-box' }}
                                                />
                                            </div>

                                            {/* Equipment Name Filter */}
                                            <div className="w-full overflow-hidden">
                                                <label className="text-xs font-bold text-slate-700 mb-1 block">{t('equipmentName')}</label>
                                                <input
                                                    type="text"
                                                    placeholder={t('searchEquipmentName')}
                                                    value={locationFilter}
                                                    onChange={(e) => setLocationFilter(e.target.value.toUpperCase())}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                                                    style={{ fontSize: '16px', boxSizing: 'border-box' }}
                                                />
                                            </div>

                                            {/* Keyword Search */}
                                            <div className="w-full overflow-hidden">
                                                <label className="text-xs font-bold text-slate-700 mb-1 block">{t('keywordSearch')}</label>
                                                <input
                                                    type="text"
                                                    placeholder="搜尋條碼、備註、建築物、檢查員、標籤..."
                                                    value={keywordSearch}
                                                    onChange={(e) => setKeywordSearch(e.target.value.toUpperCase())}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                                                    style={{ fontSize: '16px', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                        </div>

                                        {/* Bottom Action Bar: Filter Stats + Clear Button + Export Filtered Button */}
                                        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center gap-2">
                                                <span>當前篩選結果：</span>
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                                                    共 {flattenedHistory.length} 筆
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {(dateRange.start || dateRange.end || locationFilter || keywordSearch) && (
                                                    <button
                                                        onClick={() => {
                                                            setDateRange({ start: '', end: '' });
                                                            setLocationFilter('');
                                                            setKeywordSearch('');
                                                        }}
                                                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                        {t('clearFilters')}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={handleExportFiltered}
                                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-200 dark:shadow-none"
                                                    title="只匯出目前篩選之紀錄"
                                                >
                                                    <FileSpreadsheet className="w-4 h-4" />
                                                    <span>匯出篩選結果 (共 {flattenedHistory.length} 筆)</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Column Visibility Panel */}
                                {showColumns && (
                                    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                            <LayoutGrid className="w-4 h-4" />
                                            {t('adjustColumns')}
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
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <Suspense fallback={<div className="py-20 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
                                        <HistoryTable
                                            data={flattenedHistory}
                                            onViewDetails={(item) => setActiveModal({ type: 'INSPECTION', item })}
                                            onViewRecheck={(item) => setActiveModal({ type: 'RECHECK', item })}
                                            visibleColumns={visibleColumns}
                                            systemSettings={systemSettings}
                                            isAdmin={isAdmin}
                                            onDelete={handleDeleteReport}
                                        />
                                    </Suspense>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Details Modal */}
                    {
                        activeModal && (
                            <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className={`bg-white rounded-3xl w-full ${settingsTab === 'DECLARATION' ? 'max-w-2xl' : 'max-w-lg'} shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[88vh]`}>
                                    {/* Modal Header */}
                                    <div className={`p-6 border-b flex justify-between items-center shrink-0 ${activeModal.type === 'INSPECTION' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                        <h3 className={`font-bold text-lg flex items-center gap-2 flex-wrap ${activeModal.type === 'INSPECTION' ? 'text-blue-800' : 'text-red-800'}`}>
                                            {activeModal.type === 'INSPECTION' ? <ClipboardList className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                                            <span>{activeModal.type === 'INSPECTION' ? '詳細查檢紀錄' : '異常複檢資訊'}</span>
                                            {activeModal.item?.isForced && (
                                                <span
                                                    className="px-2.5 py-0.5 bg-amber-500/10 text-amber-700 border border-amber-300 rounded-full text-xs font-bold"
                                                    title={activeModal.item.forcedFromDueDate ? `原定到期日: ${new Date(activeModal.item.forcedFromDueDate).toLocaleDateString('zh-TW')}` : '提前強制檢查'}
                                                >
                                                    ⚡提前
                                                </span>
                                            )}
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
                                        {activeModal.item?.isForced && (
                                            <div className="m-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 font-medium flex items-center gap-2">
                                                <span>⚡ <strong>提前強制檢查紀錄</strong>：此設備在週期未到期前執行提前檢查{activeModal.item.forcedFromDueDate ? `（原定到期日：${new Date(activeModal.item.forcedFromDueDate).toLocaleDateString('zh-TW')}）` : ''}，下次檢查週期已依當天重算。</span>
                                            </div>
                                        )}
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
                                                        {activeModal.item.checkResults
                                                            ?.filter((res: any) => res.name && res.name.trim()) // Only show items with valid names
                                                            .map((res: any, idx: number) => {
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
                                                                        <td className="px-4 py-3 text-slate-800 font-medium">{res.name}</td>
                                                                        <td className="px-4 py-3 text-center text-slate-600 font-mono text-xs bg-slate-50/50 align-middle">
                                                                            {(() => {
                                                                                if (!res.threshold || res.threshold === '-') return '-';
                                                                                // Convert text operators to symbols
                                                                                let formatted = res.threshold
                                                                                    .replace(/\blt\b/gi, '<')
                                                                                    .replace(/\blte\b/gi, '≤')
                                                                                    .replace(/\bgt\b/gi, '>')
                                                                                    .replace(/\bgte\b/gi, '≥')
                                                                                    .replace(/&lt;/g, '<')
                                                                                    .replace(/&gt;/g, '>')
                                                                                    .replace(/&le;/g, '≤')
                                                                                    .replace(/&ge;/g, '≥');
                                                                                return formatted;
                                                                            })()}
                                                                        </td>
                                                                        <td className={`px-4 py-3 text-center font-bold align-middle ${isRed ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                            <div className="flex justify-center items-center gap-2">
                                                                                {isRed && <AlertTriangle className="w-4 h-4" />}
                                                                                {displayValue}
                                                                                {!isRed && <CheckCircle className="w-4 h-4 opacity-50" />}
                                                                            </div>
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
                                                {/* Recheck Info View */}
                                                {/* Recheck Info View */}
                                                {(() => {
                                                    const isFixed = activeModal.item.status === 'Fixed' || activeModal.item.status === '已改善' || !!activeModal.item.repairDate;

                                                    // Use preserved abnormalItems if available, otherwise try to detect from checkResults
                                                    const abnormalItems = activeModal.item.abnormalItems?.join('、') ||
                                                        activeModal.item.checkResults
                                                            ?.filter((res: any) => res.value === false || res.value === 'false' || res.status === 'Abnormal' || res.status === '異常')
                                                            .map((res: any) => res.name)
                                                            .join('、') || '未指定異常項目';

                                                    return (
                                                        <div className="space-y-4">
                                                            {/* Status Banner */}
                                                            <div className={`${isFixed ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'} p-4 rounded-xl border flex items-start gap-3`}>
                                                                <Info className={`w-5 h-5 ${isFixed ? 'text-emerald-500' : 'text-red-500'} shrink-0 mt-0.5`} />
                                                                <div>
                                                                    <p className={`font-bold ${isFixed ? 'text-emerald-800' : 'text-red-800'} mb-1`}>異常處理狀態</p>
                                                                    <p className={`text-sm ${isFixed ? 'text-emerald-700' : 'text-red-700'}`}>
                                                                        {isFixed ? '已完成改善' : '待處理'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Single Unified Card */}
                                                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                                                {/* Discovery Date */}
                                                                <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                                                                    <Calendar className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                                                                    <div className="flex-1">
                                                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">發現日期</label>
                                                                        <div className="font-mono text-sm font-bold text-slate-700">
                                                                            {activeModal.item.inspectionDate
                                                                                ? new Date(activeModal.item.inspectionDate).toLocaleDateString(language)
                                                                                : new Date(activeModal.item.date).toLocaleDateString(language)
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Abnormal Items */}
                                                                <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                                                                    <AlertTriangle className="w-4 h-4 text-red-500 mt-1 shrink-0" />
                                                                    <div className="flex-1">
                                                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">異常項目歸類</label>
                                                                        <div className="text-sm font-bold text-slate-700">{abnormalItems}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Abnormal Description */}
                                                                <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                                                                    <FileText className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                                                                    <div className="flex-1">
                                                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">異常情況描述</label>
                                                                        <div className="text-sm text-slate-700 leading-relaxed">{activeModal.item.notes || '-'}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Repair Date */}
                                                                <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                                                                    <Calendar className={`w-4 h-4 mt-1 shrink-0 ${activeModal.item.repairDate ? 'text-emerald-500' : 'text-slate-400'}`} />
                                                                    <div className="flex-1">
                                                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">修復完成日期</label>
                                                                        <div className={`font-mono text-sm font-bold ${activeModal.item.repairDate ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                                            {activeModal.item.repairDate
                                                                                ? new Date(activeModal.item.repairDate).toLocaleDateString(language)
                                                                                : '尚未修復'
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Repair Notes */}
                                                                <div className="flex items-start gap-3">
                                                                    <FileText className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                                                                    <div className="flex-1">
                                                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">修復處置說明</label>
                                                                        <div className="text-sm text-slate-700 leading-relaxed">{activeModal.item.repairNotes || '-'}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
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

                    {/* FAB (Quick Barcode Scan for Equipment Passport) */}
                    {(!user.isGuest ? (isAdmin || systemSettings?.allowInspectorQuickSearch !== false) : systemSettings?.allowGuestQuickSearch !== false) && (
                        <button
                            onClick={() => setIsQuickScanOpen(true)}
                            className="fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all z-30 ring-4 ring-white/50"
                            style={{ backgroundColor: THEME_COLORS.primary }}
                            title="掃描條碼查看設備履歷"
                            aria-label="掃描條碼查看設備履歷"
                        >
                            <ScanLine className="w-6 h-6" />
                        </button>
                    )}

                    {/* Health Modal */}
                    {
                        isHealthModalOpen && (
                            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh]">
                                    {/* Header */}
                                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                        <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                            <Clock className="w-5 h-5 mr-2 text-pink-500" />
                                            {t('healthIndicatorSettings')}
                                        </h3>
                                        <button onClick={() => setIsHealthModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                                            <X className="w-5 h-5 text-slate-500" />
                                        </button>
                                    </div>

                                    {/* Content */}
                                    <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                                        <div className="space-y-6">
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="font-bold text-slate-700">{t('indicatorList')}</h4>
                                                <button
                                                    onClick={() => setEditingHealthIndicator({} as HealthIndicator)}
                                                    className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors flex items-center gap-1 shadow-sm shadow-red-200"
                                                >
                                                    <Plus className="w-4 h-4" /> {t('addIndicator')}
                                                </button>
                                            </div>

                                            {editingHealthIndicator && (
                                                <div className="bg-white p-6 rounded-2xl border-l-4 border-l-indigo-500 shadow-lg shadow-indigo-100/50 mb-8 animate-in fade-in slide-in-from-top-2 relative">
                                                    <h5 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                                        <Edit2 className="w-4 h-4" />
                                                        {editingHealthIndicator.id ? t('editIndicator') : t('addIndicator')}
                                                    </h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-slate-500">{t('buildingName')}</label>
                                                            <input
                                                                type="text"
                                                                value={editingHealthIndicator.buildingName || ''}
                                                                onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, buildingName: e.target.value }))}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                                placeholder={t('enterBuildingName')}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-slate-500">{t('equipmentName')}</label>
                                                            <input
                                                                type="text"
                                                                value={editingHealthIndicator.equipmentName || ''}
                                                                onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, equipmentName: e.target.value }))}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                                placeholder={t('enterEquipmentName')}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-slate-500">{t('validityStartDate')}</label>
                                                            <input
                                                                type="date"
                                                                value={editingHealthIndicator.startDate || ''}
                                                                onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, startDate: e.target.value }))}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-slate-500">{t('validityEndDate')}</label>
                                                            <input
                                                                type="date"
                                                                value={editingHealthIndicator.endDate || ''}
                                                                onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, endDate: e.target.value }))}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-slate-700"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-slate-500">{t('replacementDate')} ({t('optional')})</label>
                                                            <input
                                                                type="date"
                                                                value={editingHealthIndicator.replacementDate || ''}
                                                                onChange={e => setEditingHealthIndicator(prev => ({ ...prev!, replacementDate: e.target.value }))}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-slate-700"
                                                                placeholder={t('leaveBlankIfNoReplacement')}
                                                            />
                                                        </div>

                                                    </div>



                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => setEditingHealthIndicator(null)}
                                                            className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg font-bold transition-colors"
                                                        >
                                                            {t('cancel')}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (!editingHealthIndicator.buildingName || !editingHealthIndicator.equipmentName || !editingHealthIndicator.startDate || !editingHealthIndicator.endDate) {
                                                                    alert(t('fillAllFields'));
                                                                    return;
                                                                }
                                                                handleSaveHealthIndicator();
                                                            }}
                                                            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                                                        >
                                                            {t('saveSettings')}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* List View */}
                                            <div className="space-y-3">
                                                {healthIndicators.length === 0 ? (
                                                    <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                                                        {t('noHealthIndicators')}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">

                                                        {healthIndicators.map((indicator, index) => {
                                                            const endDate = new Date(indicator.endDate);
                                                            const remainingDaysValue = endDate.getTime() - new Date().getTime();
                                                            const remainingDays = isNaN(remainingDaysValue) ? 0 : Math.ceil(remainingDaysValue / (1000 * 60 * 60 * 24));
                                                            const isExpired = remainingDays < 0;

                                                            const cycleFormatted = formatLifespan(indicator.endDate, t, indicator.startDate);
                                                            const remainingFormatted = formatLifespan(indicator.endDate, t);

                                                            return (
                                                                <div key={indicator.id} className="bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 p-4 rounded-2xl border border-blue-100 shadow-sm hover:shadow-lg flex items-center justify-between gap-3 group hover:border-blue-300 transition-all duration-300 hover:-translate-y-0.5">
                                                                    <div className="flex-1 flex flex-col gap-2.5 min-w-0 pr-2">
                                                                        {/* Line 1: Names */}
                                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0 text-white font-black text-xs shadow-sm">
                                                                                {index + 1}
                                                                            </div>
                                                                            <div className="flex items-baseline gap-2 min-w-0">
                                                                                <span className="font-black text-slate-800 text-base leading-tight truncate">
                                                                                    {indicator.buildingName}
                                                                                </span>
                                                                                <span className="text-slate-300 shrink-0 text-sm font-bold">/</span>
                                                                                <span className="truncate text-slate-600 text-sm font-bold">
                                                                                    {indicator.equipmentName}
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {/* Line 2: Stats */}
                                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 ml-8">
                                                                            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                                                                                <span className="text-[9px] text-blue-600 uppercase font-black tracking-wider leading-none">{t('lifespanCycle')}</span>
                                                                                <span className="text-xs font-bold text-blue-700">{cycleFormatted}</span>
                                                                            </div>
                                                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition-all ${isExpired ? 'bg-red-50 border border-red-300 text-red-600' : 'bg-amber-50 border border-amber-300 text-amber-700'}`}>
                                                                                <Clock className={`w-3.5 h-3.5 ${isExpired ? 'text-red-500' : 'text-amber-500'}`} />
                                                                                <span className="text-[9px] uppercase mr-0.5">{t('remainingDays')}</span>
                                                                                {remainingFormatted}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-1 border-l border-slate-200 pl-2 ml-1">
                                                                        {(isAdmin || systemSettings?.allowInspectorEditHealth !== false) && (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => handleViewHistory(indicator)}
                                                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all hover:scale-110 relative"
                                                                                    title={t('viewHistory')}
                                                                                >
                                                                                    <History className="w-4 h-4" />
                                                                                    {historyCounts[indicator.id] > 0 && (
                                                                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-red-500 to-orange-500 rounded-full text-[9px] text-white flex items-center justify-center border-2 border-white font-black shadow-md">
                                                                                            {historyCounts[indicator.id]}
                                                                                        </span>
                                                                                    )}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => setEditingHealthIndicator(indicator)}
                                                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all hover:scale-110"
                                                                                    title={t('edit')}
                                                                                >
                                                                                    <Edit2 className="w-4 h-4" />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                        {(isAdmin || systemSettings?.allowInspectorDeleteHealth !== false) && (
                                                                            <button
                                                                                onClick={() => handleDeleteHealthIndicator(indicator.id)}
                                                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all hover:scale-110"
                                                                                title={t('delete')}
                                                                            >
                                                                                <Trash2 className="w-4 h-4" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Modal Footer */}
                                    {!editingHealthIndicator && (
                                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                                            <button
                                                onClick={() => setIsHealthModalOpen(false)}
                                                className="px-6 py-2.5 bg-white text-slate-500 border border-slate-200 rounded-xl font-bold hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
                                            >
                                                {t('close')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    {/* History Modal */}
                    {viewingHistory && (
                        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh]">
                                {/* Header */}
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                    <div className="flex flex-col">
                                        <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                            <History className="w-5 h-5 mr-2 text-indigo-500" />
                                            {t('replacementHistory')}
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                            <span className="font-bold bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">{viewingHistory.buildingName}</span>
                                            <span className="text-slate-300">/</span>
                                            <span className="font-bold bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">{viewingHistory.equipmentName}</span>
                                        </p>
                                    </div>
                                    <button onClick={() => setViewingHistory(null)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                                        <X className="w-5 h-5 text-slate-500" />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
                                    {isHistoryLoading ? (
                                        <div className="flex flex-col items-center justify-center h-40">
                                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                                            <span className="text-sm text-slate-400">{t('loading')}</span>
                                        </div>
                                    ) : historyData.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                            <History className="w-12 h-12 mb-3 opacity-20" />
                                            <p>{t('noHistoryRecords')}</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {historyData.slice().sort((a, b) => new Date(b.replacementDate).getTime() - new Date(a.replacementDate).getTime()).map((record, index) => (
                                                <div key={record.id} className="p-4 hover:bg-slate-50 transition-colors group">
                                                    <div className="flex items-start gap-4">
                                                        <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                                                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs ring-4 ring-white shadow-sm border border-indigo-100">
                                                                {historyData.length - index}
                                                            </div>
                                                            <div className={`w-0.5 h-full bg-slate-100 ${index === historyData.length - 1 ? 'hidden' : ''}`}></div>
                                                        </div>
                                                        <div className="flex-1 space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-bold">
                                                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                                    {t('replacementDate')}: {record.replacementDate}
                                                                </span>
                                                                {(isAdmin || systemSettings?.allowInspectorDeleteHealth !== false) && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (confirm(t('confirmDelete'))) {
                                                                                await StorageService.deleteHealthHistory(record.id, user.uid, user.currentOrganizationId);
                                                                                setHistoryData(prev => prev.filter(r => r.id !== record.id));
                                                                                setHistoryCounts(prev => ({
                                                                                    ...prev,
                                                                                    [record.indicatorId]: Math.max(0, (prev[record.indicatorId] || 1) - 1)
                                                                                }));
                                                                            }
                                                                        }}
                                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                                        title={t('delete')}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{t('previousPeriod')}</div>
                                                                    <div className="font-mono text-slate-600 font-bold">
                                                                        {record.previousStartDate || '?'} <span className="text-slate-300 mx-1">→</span> {record.previousEndDate}
                                                                    </div>
                                                                </div>
                                                                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                                                    <div className="text-[10px] text-emerald-600/60 uppercase font-bold tracking-wider mb-1">{t('newPeriod')}</div>
                                                                    <div className="font-mono text-emerald-700 font-bold">
                                                                        {record.newStartDate} <span className="text-emerald-300 mx-1">→</span> {record.newEndDate}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {
                        isSettingsOpen && (
                            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh]">
                                    {/* Header */}
                                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                        <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                            {settingsModalMode === 'focused' && settingsTab === 'DECLARATION' ? (
                                                <>
                                                    <Calendar className="w-5 h-5 mr-2 text-amber-600" />
                                                    申報週期與基準日設定
                                                </>
                                            ) : settingsModalMode === 'focused' && settingsTab === 'LIGHTS' ? (
                                                <>
                                                    <svg className="w-5 h-5 mr-2 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M4.5 6.5H6.5M17.5 6.5H19.5M4.5 12H6.5M17.5 12H19.5M4.5 17.5H6.5M17.5 17.5H19.5" stroke="#EA580C" strokeWidth="1.75" strokeLinecap="round" />
                                                        <rect x="6.5" y="2" width="11" height="20" rx="4" fill="#FFF7ED" stroke="#EA580C" strokeWidth="1.75" />
                                                        <circle cx="12" cy="6.5" r="2.1" fill="#EF4444" />
                                                        <circle cx="12" cy="12" r="2.1" fill="#F59E0B" />
                                                        <circle cx="12" cy="17.5" r="2.1" fill="#10B981" />
                                                    </svg>
                                                    {t('lightSettings')}
                                                </>
                                            ) : (
                                                <>
                                                    <Settings className="w-5 h-5 mr-2" />
                                                    {t('systemSettings')}
                                                </>
                                            )}
                                        </h3>
                                        <button onClick={() => { setIsSettingsOpen(false); setSettingsModalMode('full'); }} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                                            <X className="w-5 h-5 text-slate-500" />
                                        </button>
                                    </div>

                                    {/* Tabs */}
                                    {settingsModalMode === 'full' && (
                                        <div className="flex border-b border-slate-100 shrink-0 overflow-x-auto no-scrollbar">
                                            {(isAdmin || systemSettings?.allowInspectorProfile !== false) && (
                                                <button
                                                    onClick={() => setSettingsTab('PROFILE')}
                                                    className={`flex-1 min-w-[100px] py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'PROFILE' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                                >
                                                    <User className="w-4 h-4 mr-2" /> {t('profile')}
                                                </button>
                                            )}

                                            {(isAdmin || systemSettings?.allowInspectorLanguage !== false) && (
                                                <button
                                                    onClick={() => setSettingsTab('LANGUAGE')}
                                                    className={`flex-1 min-w-[100px] py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'LANGUAGE' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                                >
                                                    <Globe className="w-4 h-4 mr-2" /> {t('language')}
                                                </button>
                                            )}

                                            {(isAdmin || systemSettings?.allowInspectorBackground !== false) && (
                                                <button
                                                    onClick={() => setSettingsTab('GENERAL')}
                                                    className={`flex-1 min-w-[100px] py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center ${settingsTab === 'GENERAL' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'} `}
                                                >
                                                    <Palette className="w-4 h-4 mr-2" /> {t('background')}
                                                </button>
                                            )}





                                        </div>
                                    )}

                                    {/* Content */}
                                    <div className="p-6 overflow-y-auto custom-scrollbar flex-1">

                                        {/* PROFILE TAB */}
                                        {settingsTab === 'PROFILE' && (
                                            <div className="space-y-3.5">
                                                <div className="flex items-center justify-center">
                                                    <div className="w-14 h-14 rounded-full border-2 border-slate-200 overflow-hidden shadow-sm relative group">
                                                        <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                                        {isUpdating && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[8px] text-center z-10 px-0.5">{t('uploading')}</div>}

                                                        {selectedAvatar && !selectedAvatar.includes('dicebear.com') && !isUpdating && (
                                                            <button
                                                                onClick={handleDeleteAvatar}
                                                                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <Trash2 className="w-4 h-4 text-white" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="space-y-2.5 px-1">
                                                    <div className="flex items-center justify-center gap-3">
                                                        {CARTOON_AVATARS.map((url, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => setSelectedAvatar(url)}
                                                                className={`w-11 h-11 rounded-full overflow-hidden border-2 transition-all shrink-0 ${selectedAvatar === url ? 'border-red-600 ring-2 ring-red-100 scale-105' : 'border-slate-100 hover:border-red-400 opacity-85 hover:opacity-100'}`}
                                                            >
                                                                <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {!user.isGuest && (
                                                        <div className="pt-0.5 flex gap-2">
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
                                                                className="flex-1 py-2 border border-dashed border-slate-300 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-all flex items-center justify-center gap-1.5 group"
                                                            >
                                                                <UploadCloud className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                                                                {t('uploadPhoto')}
                                                            </button>
                                                            <button
                                                                onClick={handleRestoreGooglePhoto}
                                                                disabled={isUpdating}
                                                                className="flex-1 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-1.5 group"
                                                                title={t('restoreOriginalPhoto')}
                                                            >
                                                                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                                                                {t('originalPhoto')}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                                    <label className="text-xs font-bold text-slate-500 uppercase">{t('displayName')}</label>
                                                    <input
                                                        type="text"
                                                        value={displayName}
                                                        onChange={(e) => setDisplayName(e.target.value)}
                                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none text-sm font-medium"
                                                        disabled={user.isGuest}
                                                    />
                                                </div>

                                                {!user.isGuest && (
                                                    <div className="space-y-3 pt-1">
                                                        <button
                                                            onClick={handleUpdateProfile}
                                                            disabled={isUpdating}
                                                            className="w-full py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 active:scale-[0.99] transition-all shadow-md shadow-red-200/80 text-sm sm:text-base"
                                                        >
                                                            {isUpdating ? 'Updating...' : t('saveChanges')}
                                                        </button>
                                                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setIsSettingsOpen(false);
                                                                    setShowOrgManager(true);
                                                                }}
                                                                className="w-full py-3.5 px-3 bg-blue-50 hover:bg-blue-100/90 active:scale-[0.99] text-blue-700 border border-blue-200 font-bold rounded-xl transition-all text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm truncate"
                                                            >
                                                                <Building className="w-5 h-5 shrink-0 text-blue-600" />
                                                                <span className="truncate">{user.currentOrganizationId ? currentOrgName : t('personalOrganization')}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setIsSettingsOpen(false);
                                                                    onLogout();
                                                                }}
                                                                className="w-full py-3.5 px-3 bg-slate-100 hover:bg-rose-50 active:scale-[0.99] text-slate-700 hover:text-rose-600 border border-slate-200/90 hover:border-rose-200 font-bold rounded-xl transition-all text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm"
                                                            >
                                                                <LogOut className="w-5 h-5 shrink-0" />
                                                                <span>登出帳號</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Permissions Content Removed */}

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
                                                            <h4 className="font-bold text-slate-800">{t('enableEmailNotifications')}</h4>
                                                            <p className="text-xs text-slate-500 mt-1">{t('emailNotificationsDesc')}</p>
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
                                                            <label className="text-xs font-bold text-slate-500 uppercase">{t('recipientEmails')}</label>
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
                                                                {t('emailNote')}
                                                            </p>
                                                        </div>
                                                    )}

                                                    <button
                                                        onClick={() => {
                                                            // Trigger existing save logic
                                                            handleSaveSettings(declarationSettings);
                                                            alert(t('notificationSettingsSaved'));
                                                        }}
                                                        className="w-full py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                                                    >
                                                        <Save className="w-4 h-4" />
                                                        {t('saveNotificationSettings')}
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
                                                                onClick={() => {
                                                                    const newLang = lang.code as LanguageCode;
                                                                    setLanguage(newLang);
                                                                }}
                                                                className={`p-4 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${language === lang.code ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-100 hover:border-slate-200 text-slate-700'} `}
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
                                                    <label className="text-xs font-bold text-slate-500 uppercase">{t('themeColor')}</label>
                                                    <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                                                        {[
                                                            { id: 'light', icon: <Sun className="w-4 h-4" />, label: '極簡點陣', color: 'bg-[#f8fafc] border border-slate-300', darkIcon: true },
                                                            { id: 'nord', icon: <LayoutGrid className="w-4 h-4" />, label: '工程方格', color: 'bg-[#e2e8f0] border border-slate-300', darkIcon: true },
                                                            { id: 'dracula', icon: <Ruler className="w-4 h-4" />, label: '暖白雙格', color: 'bg-[#f5f5f4] border border-stone-300', darkIcon: true },
                                                            { id: 'monokai', icon: <Leaf className="w-4 h-4" />, label: '環安綠陣', color: 'bg-[#dcfce7] border border-emerald-300', darkIcon: true },
                                                            { id: 'solarized', icon: <Droplets className="w-4 h-4" />, label: '建築藍圖', color: 'bg-[#0b213f]', darkIcon: false },
                                                            { id: 'dark', icon: <Moon className="w-4 h-4" />, label: '戰情暗格', color: 'bg-[#0f172a]', darkIcon: false },
                                                            { id: 'onedark', icon: <Zap className="w-4 h-4" />, label: '鈦金點陣', color: 'bg-[#18181b]', darkIcon: false },
                                                            { id: 'system', icon: <Monitor className="w-4 h-4" />, label: t('followSystemTheme'), color: 'bg-gradient-to-br from-slate-100 to-slate-800', darkIcon: false }
                                                        ].map((item) => (
                                                            <button
                                                                key={item.id}
                                                                onClick={() => {
                                                                    setTheme(item.id as ThemeType);
                                                                }}
                                                                className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${theme === item.id ? 'border-red-600 ring-2 ring-red-100 bg-red-50/30' : 'border-slate-100 hover:border-slate-300 bg-white'} `}
                                                                title={item.label}
                                                            >
                                                                <div className={`w-8 h-8 rounded-xl shadow-sm flex items-center justify-center ${item.color}`}>
                                                                    {React.cloneElement(item.icon as React.ReactElement, {
                                                                        className: `w-4 h-4 ${item.darkIcon ? 'text-slate-700' : 'text-white'}`
                                                                    })}
                                                                </div>
                                                                <span className="text-[10px] font-bold text-slate-600 line-clamp-1 px-1">{item.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* LIGHTS TAB */}
                                        {settingsTab === 'LIGHTS' && (
                                            <div className="space-y-6">
                                                <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex gap-3">
                                                    <Zap className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-bold text-blue-900">{t('lightSettings')}</p>
                                                        <p className="text-xs text-blue-700 leading-relaxed">
                                                            {t('lightSettingsDesc')}
                                                        </p>
                                                    </div>
                                                </div>

                                                {!lightSettings ? (
                                                    <div className="py-10 text-center flex justify-center">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {/* Grid Layout for Light Settings */}
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            {/* Abnormal Recheck */}
                                                            <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-bold text-orange-700 flex items-center gap-1.5">
                                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lightSettings.abnormal?.color || '#f97316' }}></div>
                                                                        {t('abnormalLight')}
                                                                    </span>
                                                                    <input
                                                                        type="color"
                                                                        value={lightSettings.abnormal?.color || '#f97316'}
                                                                        onChange={e => setLightSettings({ ...lightSettings, abnormal: { color: e.target.value } })}
                                                                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 overflow-hidden"
                                                                    />
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    {t('abnormalColorDesc')}
                                                                </div>
                                                            </div>

                                                            {/* Red */}
                                                            <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-bold text-red-700 flex items-center gap-1.5">
                                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lightSettings.red.color }}></div>
                                                                        {t('needCheck')}
                                                                    </span>
                                                                    <input type="color" value={lightSettings.red.color} onChange={e => setLightSettings({ ...lightSettings, red: { ...lightSettings.red, color: e.target.value } })} className="w-7 h-7 rounded cursor-pointer border-0 p-0 overflow-hidden" />
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-slate-600 font-medium">{t('remainingDaysLe')}</span>
                                                                    <input type="number" value={lightSettings.red.days} onChange={e => setLightSettings({ ...lightSettings, red: { ...lightSettings.red, days: parseInt(e.target.value) || 0 } })} className="w-16 px-2 py-1 text-sm bg-white border border-red-200 rounded text-center font-bold text-red-700 focus:outline-none focus:border-red-500" />
                                                                    <span className="text-xs text-slate-600 font-medium">{t('days')}</span>
                                                                </div>
                                                            </div>

                                                            {/* Yellow */}
                                                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-bold text-amber-700 flex items-center gap-1.5">
                                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lightSettings.yellow.color }}></div>
                                                                        {t('canCheck')}
                                                                    </span>
                                                                    <input type="color" value={lightSettings.yellow.color} onChange={e => setLightSettings({ ...lightSettings, yellow: { ...lightSettings.yellow, color: e.target.value } })} className="w-7 h-7 rounded cursor-pointer border-0 p-0 overflow-hidden" />
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-xs text-slate-600 font-medium">{t('remainingDaysLe')}</span>
                                                                    <input type="number" value={lightSettings.yellow.days} onChange={e => setLightSettings({ ...lightSettings, yellow: { ...lightSettings.yellow, days: parseInt(e.target.value) || 0 } })} className="w-16 px-2 py-1 text-sm bg-white border border-amber-200 rounded text-center font-bold text-amber-700 focus:outline-none focus:border-amber-500" />
                                                                    <span className="text-xs text-slate-600 font-medium">{t('days')}</span>
                                                                </div>
                                                            </div>

                                                            {/* Green */}
                                                            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lightSettings.green.color }}></div>
                                                                        {t('noNeedCheck')}
                                                                    </span>
                                                                    <input type="color" value={lightSettings.green.color} onChange={e => setLightSettings({ ...lightSettings, green: { ...lightSettings.green, color: e.target.value } })} className="w-7 h-7 rounded cursor-pointer border-0 p-0 overflow-hidden" />
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-xs text-slate-600 font-medium">{t('remainingDaysGe')}</span>
                                                                    <input type="number" value={lightSettings.green.days} onChange={e => setLightSettings({ ...lightSettings, green: { ...lightSettings.green, days: parseInt(e.target.value) || 0 } })} className="w-16 px-2 py-1 text-sm bg-white border border-emerald-200 rounded text-center font-bold text-emerald-700 focus:outline-none focus:border-emerald-500" />
                                                                    <span className="text-xs text-slate-600 font-medium">{t('days')}</span>
                                                                </div>
                                                            </div>

                                                            {/* Completed (Normal) */}
                                                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 md:col-span-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lightSettings.completed?.color || '#10b981' }}></div>
                                                                        <span className="text-sm font-bold text-blue-700">{t('completedCheck')}</span>
                                                                        <span className="text-xs text-slate-500">{t('completedCheckDesc')}</span>
                                                                    </div>
                                                                    <input
                                                                        type="color"
                                                                        value={lightSettings.completed?.color || '#10b981'}
                                                                        onChange={e => setLightSettings({ ...lightSettings, completed: { color: e.target.value } })}
                                                                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 overflow-hidden"
                                                                    />
                                                                </div>
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
                                                                    {t('saving')}
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <Save className="w-4 h-4" />
                                                                    {t('saveSettings')}
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
                                                        <p className="text-sm font-bold text-red-900">{t('declarationTitle')}</p>
                                                        <p className="text-xs text-red-700 leading-relaxed">
                                                            {t('declarationDesc')}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
                                                                <RefreshCw className="w-4 h-4 text-slate-400" />
                                                                {t('declarationCycle')}
                                                            </label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <button
                                                                    onClick={() => {
                                                                        const newSettings: DeclarationSettings = {
                                                                            ...declarationSettings || { nextDate: '', lastModified: Date.now(), emailNotificationsEnabled: false, emailRecipients: [] },
                                                                            cycle: '6_MONTHS',
                                                                            lastModified: Date.now()
                                                                        };
                                                                        handleSaveSettings(newSettings);
                                                                    }}
                                                                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${declarationSettings?.cycle === '6_MONTHS'
                                                                        ? 'bg-red-50 border-red-200 text-red-700 ring-2 ring-red-100 ring-offset-1'
                                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                                        }`}
                                                                >
                                                                    <span className="font-bold">{t('halfYear')}</span>
                                                                    {declarationSettings?.cycle === '6_MONTHS' && <Check className="w-4 h-4" />}
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        const newSettings: DeclarationSettings = {
                                                                            ...declarationSettings || { nextDate: '', lastModified: Date.now(), emailNotificationsEnabled: false, emailRecipients: [] },
                                                                            cycle: '1_YEAR',
                                                                            lastModified: Date.now()
                                                                        };
                                                                        handleSaveSettings(newSettings);
                                                                    }}
                                                                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${declarationSettings?.cycle === '1_YEAR'
                                                                        ? 'bg-red-50 border-red-200 text-red-700 ring-2 ring-red-100 ring-offset-1'
                                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                                        }`}
                                                                >
                                                                    <span className="font-bold">{t('oneYear')}</span>
                                                                    {declarationSettings?.cycle === '1_YEAR' && <Check className="w-4 h-4" />}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
                                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                                {t('declarationBaseDate')}
                                                            </label>
                                                            <div className="flex items-center gap-2">
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
                                                                    className="flex-1 p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-100 focus:border-red-400 transition-all outline-none font-medium text-slate-700 shadow-sm"
                                                                />
                                                                {declarationSettings?.nextDate && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const newSettings: DeclarationSettings = {
                                                                                ...declarationSettings || { lastModified: Date.now(), emailNotificationsEnabled: false, emailRecipients: [] },
                                                                                nextDate: '',
                                                                                lastModified: Date.now()
                                                                            };
                                                                            handleSaveSettings(newSettings);
                                                                        }}
                                                                        className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-red-500 rounded-xl transition-colors shrink-0"
                                                                        title={t('clear')}
                                                                    >
                                                                        <X className="w-5 h-5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-slate-400 mt-2 pl-1">
                                                                {t('declarationAutoCalc')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 歷次申報真正日期紀錄 */}
                                                <div className="pt-4 border-t border-slate-200/80 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                                <ClipboardList className="w-4 h-4 text-emerald-600" />
                                                                歷次申報真正日期紀錄
                                                            </h4>
                                                            <p className="text-[11px] text-slate-500">
                                                                留存每年度／每半年向消防機關申報備查之實際日期
                                                            </p>
                                                        </div>
                                                        {!isAddingRecord && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenAddRecord()}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-200"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                登記申報
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* 登記 / 編輯表單 */}
                                                    {isAddingRecord && (
                                                        <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/90 space-y-3 animate-in fade-in duration-200">
                                                            <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2">
                                                                <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                                                                    <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                                                                    {editingRecordId ? '編輯申報紀錄' : '登記真正申報完成紀錄'}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setIsAddingRecord(false); setEditingRecordId(null); }}
                                                                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                                <div>
                                                                    <label className="font-bold text-slate-700 mb-1 block">申報期別 / 梯次 *</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="例如：2026年度 或 2026年 下半年"
                                                                        value={recordForm.periodLabel}
                                                                        onChange={(e) => setRecordForm({ ...recordForm, periodLabel: e.target.value })}
                                                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-emerald-200 outline-none"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="font-bold text-emerald-800 mb-1 block">真正申報完成日期 *</label>
                                                                    <input
                                                                        type="date"
                                                                        value={recordForm.actualDate}
                                                                        onChange={(e) => setRecordForm({ ...recordForm, actualDate: e.target.value })}
                                                                        className="w-full p-2.5 bg-white border border-emerald-400 rounded-xl font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-200 outline-none"
                                                                        required
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="font-bold text-slate-700 mb-1 block">法定預定截止日</label>
                                                                    <input
                                                                        type="date"
                                                                        value={recordForm.targetDeadline}
                                                                        onChange={(e) => setRecordForm({ ...recordForm, targetDeadline: e.target.value })}
                                                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-emerald-200 outline-none"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="font-bold text-slate-700 mb-1 block">檢修專技機構 / 人員</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="例如：安消消防設備師事務所"
                                                                        value={recordForm.inspectorAgency}
                                                                        onChange={(e) => setRecordForm({ ...recordForm, inspectorAgency: e.target.value })}
                                                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-emerald-200 outline-none"
                                                                    />
                                                                </div>

                                                                <div className="sm:col-span-2">
                                                                    <label className="font-bold text-slate-700 mb-1 block">備註說明</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="選填備註事項..."
                                                                        value={recordForm.notes}
                                                                        onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })}
                                                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-emerald-200 outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-end gap-2 pt-2 border-t border-emerald-200/50">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setIsAddingRecord(false); setEditingRecordId(null); }}
                                                                    className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                                                                >
                                                                    取消
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleSaveRecord}
                                                                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                                                                >
                                                                    確認儲存紀錄
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* 歷次紀錄列表 */}
                                                    {declarationSettings?.records && declarationSettings.records.length > 0 ? (
                                                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                                            {declarationSettings.records.map((rec) => (
                                                                <div
                                                                    key={rec.id}
                                                                    className="p-3 bg-white hover:bg-slate-50/90 rounded-2xl border border-slate-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm group"
                                                                >
                                                                    <div className="space-y-1.5 min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="font-black text-slate-800 text-xs px-2 py-0.5 bg-slate-100 rounded-lg">
                                                                                {rec.periodLabel}
                                                                            </span>
                                                                            <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/70">
                                                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                                                                真正申報日：{rec.actualDate.replace(/-/g, '/')}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                                                                            <span>預定截止：{rec.targetDeadline ? rec.targetDeadline.replace(/-/g, '/') : '未定'}</span>
                                                                            {rec.inspectorAgency && <span>機構：{rec.inspectorAgency}</span>}

                                                                        </div>
                                                                        {rec.notes && <p className="text-[11px] text-slate-400 italic">備註：{rec.notes}</p>}
                                                                    </div>
                                                                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-center opacity-80 group-hover:opacity-100 transition-opacity">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleEditRecord(rec)}
                                                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                            title="編輯此紀錄"
                                                                        >
                                                                            <Edit2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteRecord(rec.id)}
                                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                            title="刪除"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="p-4 bg-slate-50/80 rounded-2xl border border-dashed border-slate-200 text-center space-y-2">
                                                            <p className="text-xs text-slate-500 font-medium">
                                                                目前尚未登錄歷史真正申報紀錄。
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenAddRecord()}
                                                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-sm"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                登記本次申報完成日期
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>



                                                <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                                                    <h5 className="font-bold text-yellow-800 text-sm mb-2 flex items-center gap-2">
                                                        <Info className="w-4 h-4" />
                                                        {t('regulationReminder')}
                                                    </h5>
                                                    <ul className="text-xs text-yellow-800/80 space-y-1 list-disc list-inside font-medium">
                                                        <li>{t('regulationItem1')}</li>
                                                        <li>{t('regulationItem2')}</li>
                                                        <li>{t('regulationNote')}</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        )}



                                    </div>
                                </div>
                            </div>
                        )
                    }


                    <InspectionModeModal
                        isOpen={isInspectionModeOpen}
                        onClose={() => setIsInspectionModeOpen(false)}
                        onSelectMode={handleInspectionModeSelect}
                        t={t}
                        systemSettings={systemSettings}
                        isAdmin={isAdmin}
                    />

                    <AddEquipmentModeModal
                        isOpen={isAddEquipmentModeOpen}
                        onClose={() => setIsAddEquipmentModeOpen(false)}
                        onSelectMode={handleAddEquipmentModeSelect}
                        t={t}
                    />

                    {/* Assuming EquipmentMapEditor is a new component to be added */}
                    {isEquipmentMapOpen && (
                        <Suspense fallback={null}>
                            <EquipmentMapEditor
                                user={user}
                                isOpen={isEquipmentMapOpen}
                                onClose={() => setIsEquipmentMapOpen(false)}
                                existingMap={selectedMap}
                                systemSettings={systemSettings}
                                isAdmin={isAdmin}
                            />
                        </Suspense>
                    )}

                    {/* Admin Dashboard Overlay */}
                    {isAdminDashboardOpen && (user.role === 'admin' || user.email?.toLowerCase() === 'b28803078@gmail.com') && (
                        <Suspense fallback={null}>
                            <AdminDashboard
                                currentUser={{ email: user.email!, uid: user.uid }}
                                onClose={() => {
                                    setIsAdminDashboardOpen(false);
                                    // Reset search state when returning from admin dashboard
                                    setIsSearchActive(false);
                                    setSearchTerm('');
                                    setSearchParams({}, { replace: true });
                                }}
                            />
                        </Suspense>
                    )}


                    {isQuickScanOpen && (
                        <Suspense fallback={null}>
                            <BarcodeInputModal
                                isOpen={isQuickScanOpen}
                                onScan={async (code) => {
                                    // Close the scanner modal FIRST to prevent backdrop conflicts
                                    setIsQuickScanOpen(false);

                                    // Check if equipment exists before activating search
                                    const definitions = await StorageService.getEquipmentDefinitions(user.uid, user.currentOrganizationId);
                                    const exactMatch = definitions.find(d => d.barcode?.toUpperCase() === code.toUpperCase());
                                    const matches = definitions.filter(d => d.barcode?.toUpperCase() === code.toUpperCase() || d.name.toUpperCase().includes(code.toUpperCase()));

                                    if (exactMatch || matches.length === 1) {
                                        setPassportEquipment(exactMatch || matches[0]);
                                    } else if (matches.length > 1) {
                                        setSearchParams({ q: code }, { replace: true });
                                    } else {
                                        // Small delay to let the scanner modal finish its closing animation/transition
                                        setTimeout(() => {
                                            setAlertConfig({
                                                isOpen: true,
                                                title: t('searchFailed') || '搜尋失敗',
                                                message: `找不到設備編號「${code}」\n\n請確認:\n1. 設備編號是否正確\n2. 設備是否屬於目前選擇的場所和建築物`,
                                                onConfirm: () => {
                                                    setIsSearchActive(false);
                                                    setSearchTerm('');
                                                    setAlertConfig(null);
                                                    setTimeout(() => {
                                                        setSearchParams({}, { replace: true });
                                                    }, 50);
                                                }
                                            });
                                        }, 100);
                                    }
                                }}
                                onCancel={() => setIsQuickScanOpen(false)}
                            // No expectedBarcode provided implies Search Mode
                            />
                        </Suspense>
                    )}



                    {isMapViewInspectionOpen && (
                        <Suspense fallback={null}>
                            <MapViewInspection
                                user={user}
                                isOpen={isMapViewInspectionOpen}
                                onClose={() => {
                                    setIsMapViewInspectionOpen(false);
                                    refetchReports(); // Refresh data when map view closes
                                }}
                            />
                        </Suspense>
                    )}

                    {/* Forced Renewal Modal */}
                    {
                        renewalTarget && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200 border-t-4 border-red-500">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="p-3 bg-red-100 rounded-full shrink-0">
                                            <AlertTriangle className="w-8 h-8 text-red-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-slate-800">{t('equipmentExpiredTitle')}</h3>
                                            <p className="text-sm text-slate-500 mt-1 font-bold">
                                                {t('equipmentPrefix')} <span className="text-slate-900 bg-slate-100 px-1 rounded">{renewalTarget.equipmentName || renewalTarget.name || 'Unknown'}</span> {t('needsReplacement')}
                                            </p>
                                        </div>
                                    </div>

                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        const formData = new FormData(e.currentTarget);
                                        const replacementDate = formData.get('replacementDate') as string;
                                        const newEndDate = formData.get('newEndDate') as string;
                                        handleRenewalSubmit(replacementDate, newEndDate);
                                    }} className="space-y-5">
                                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-emerald-500" />
                                                    {t('replacementDate')}
                                                </label>
                                                <input
                                                    type="date"
                                                    name="replacementDate"
                                                    required
                                                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none font-bold text-slate-700"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-rose-500" />
                                                    {t('newExpiryDate')}
                                                </label>
                                                <input
                                                    type="date"
                                                    name="newEndDate"
                                                    required
                                                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none font-bold text-slate-700"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                                            <button
                                                type="button"
                                                onClick={handleRenewalCancel}
                                                className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl font-bold transition-colors"
                                            >
                                                {t('remindLater')}
                                            </button>
                                            <button
                                                type="submit"
                                                className="px-5 py-2.5 bg-red-600 text-white hover:bg-red-700 rounded-xl font-bold shadow-lg shadow-red-200 transition-all hover:scale-105 active:scale-95"
                                            >
                                                {t('confirmUpdate')}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )
                    }

                    {/* History Modal */}
                    {
                        viewingHistory && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 animate-in zoom-in-95 duration-200">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                                <Clock className="w-6 h-6 text-slate-400" />
                                                {t('replacementHistory')}
                                            </h3>
                                            <p className="text-sm text-slate-500 mt-1 font-bold">
                                                {viewingHistory.equipmentName || viewingHistory.name}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setViewingHistory(null)}
                                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                                        >
                                            <X className="w-6 h-6 text-slate-400" />
                                        </button>
                                    </div>

                                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
                                        {isHistoryLoading ? (
                                            <div className="py-12 flex justify-center items-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400"></div>
                                            </div>
                                        ) : historyData.length === 0 ? (
                                            <div className="text-center py-12 text-slate-400 font-bold">
                                                {t('noReplacementRecords')}
                                            </div>
                                        ) : (
                                            <div className="relative border-l-2 border-slate-100 ml-4 space-y-8 py-2">
                                                {historyData.map((record, index) => (
                                                    <div key={record.id} className="relative pl-6">
                                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-emerald-500" />
                                                        <div className="space-y-2">
                                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                                                <span className="font-bold text-slate-900">
                                                                    {record.newStartDate.replace(/-/g, '/')}
                                                                </span>
                                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-bold">
                                                                    {t('replacementOperation')}
                                                                </span>
                                                            </div>
                                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-sm space-y-2">
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div>
                                                                        <div className="text-xs text-slate-400 mb-1">{t('newStartEndDate')}</div>
                                                                        <div className="font-bold text-slate-700">
                                                                            {record.newStartDate} ~ {record.newEndDate}
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-xs text-slate-400 mb-1">{t('oldStartEndDate')}</div>
                                                                        <div className="font-medium text-slate-500 line-through">
                                                                            {record.previousStartDate} ~ {record.previousEndDate}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    }
                </div>
            </div>


            {/* Permissions Modal */}
            {
                isPermissionsModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[85vh]">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                    <ShieldCheck className="w-5 h-5 mr-2" />
                                    {t('permissionsTitle')}
                                </h3>
                                <button onClick={() => setIsPermissionsModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                                <div className="space-y-4">
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex gap-3 mb-2">
                                        <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold text-slate-900">{t('permissionsTitle')}</p>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                {t('permissionsDesc')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {/* (0) 訪客權限 (Guest Access) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <div className="flex items-center justify-between gap-2 px-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                                    <User className="w-3.5 h-3.5" />
                                                    {t('sectionGuestAccess')}
                                                </label>
                                                <button
                                                    onClick={() => setIsGuestShareModalOpen(true)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200/80 rounded-lg text-xs font-bold transition-all active:scale-95"
                                                >
                                                    <QrCode className="w-3.5 h-3.5" />
                                                    訪客通行 QR 碼
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-slate-300">
                                                <div>
                                                    <div className="font-bold text-slate-700 text-sm">{t('allowGuestQuickSearch')}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{t('allowGuestQuickSearchDesc')}</div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={systemSettings?.allowGuestQuickSearch ?? true}
                                                        onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowGuestQuickSearch: e.target.checked })}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-600"></div>
                                                </label>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-slate-300">
                                                <div>
                                                    <div className="font-bold text-slate-700 text-sm">{t('allowGuestStartInspection')}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{t('allowGuestStartInspectionDesc')}</div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={systemSettings?.allowGuestStartInspection ?? false}
                                                        onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowGuestStartInspection: e.target.checked })}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-600"></div>
                                                </label>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-slate-300">
                                                <div>
                                                    <div className="font-bold text-slate-700 text-sm">{t('allowGuestRecheck')}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{t('allowGuestRecheckDesc')}</div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={systemSettings?.allowGuestRecheck ?? false}
                                                        onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowGuestRecheck: e.target.checked })}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-600"></div>
                                                </label>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-slate-300">
                                                <div>
                                                    <div className="font-bold text-slate-700 text-sm">{t('allowGuestEquipmentOverview')}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{t('allowGuestEquipmentOverviewDesc')}</div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={systemSettings?.allowGuestEquipmentOverview ?? false}
                                                        onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowGuestEquipmentOverview: e.target.checked })}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-600"></div>
                                                </label>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-slate-300">
                                                <div>
                                                    <div className="font-bold text-slate-700 text-sm">{t('allowGuestHistory')}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{t('allowGuestHistoryDesc')}</div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={systemSettings?.allowGuestHistory ?? true}
                                                        onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowGuestHistory: e.target.checked })}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-600"></div>
                                                </label>
                                            </div>
                                        </div>
                                        {/* (1) 系統設定 (System Settings) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <Settings className="w-3.5 h-3.5" />
                                                {t('sectionSystemSettings')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {['Profile', 'Language', 'Background', 'Declaration', 'Notifications', 'QuickSearch', 'LightSettings'].map((item) => (
                                                    <div key={item} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-blue-200">
                                                        <div>
                                                            <div className="font-bold text-slate-700 text-sm">{t(`allowInspector${item}`)}</div>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{t(`allowInspector${item}Desc`)}</div>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={systemSettings?.[`allowInspector${item}` as keyof typeof systemSettings] as boolean ?? true}
                                                                onChange={(e) => handleSaveSystemSettings({ ...systemSettings, [`allowInspector${item}`]: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* (1.5) 卡片順序設定 (Card Order Settings) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <LayoutGrid className="w-3.5 h-3.5" />
                                                {t('sectionCardOrder')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-indigo-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorCustomizeCardOrder')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorCustomizeCardOrderDesc')}</div>
                                                    </div>
                                                    {isAdmin && (
                                                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={systemSettings?.allowInspectorCustomizeCardOrder ?? false}
                                                                onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorCustomizeCardOrder: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                                        </label>
                                                    )}
                                                </div>

                                                {/* Button to open Card Order Modal */}
                                                {(isAdmin || systemSettings?.allowInspectorCustomizeCardOrder) && (
                                                    <button
                                                        onClick={() => setIsCardOrderModalOpen(true)}
                                                        className="w-full flex items-center justify-center gap-2 p-3 bg-white border border-dashed border-indigo-300 text-indigo-600 rounded-xl hover:bg-indigo-50 font-bold text-sm transition-all group"
                                                    >
                                                        <LayoutGrid className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                        {t('cardOrderDesc') || '設定顯示順序'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* (2) 開始檢查 (Start Inspection) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <PlayCircle className="w-3.5 h-3.5" />
                                                {t('sectionStartInspection')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {['StartInspection', 'ListInspection', 'MapInspection'].map((item) => (
                                                    <div key={item} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-red-200">
                                                        <div>
                                                            <div className="font-bold text-slate-700 text-sm">{t(`allowInspector${item}`)}</div>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{t(`allowInspector${item}Desc`)}</div>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={systemSettings?.[`allowInspector${item}` as keyof typeof systemSettings] as boolean ?? true}
                                                                onChange={(e) => handleSaveSystemSettings({ ...systemSettings, [`allowInspector${item}`]: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* (3) 異常複檢 (Abnormal Recheck) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-orange-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                {t('sectionAbnormalRecheck')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-orange-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorAbnormalRecheck')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorAbnormalRecheckDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorAbnormalRecheck ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorAbnormalRecheck: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-orange-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorViewCompletedRechecks')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorViewCompletedRechecksDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorViewCompletedRechecks ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorViewCompletedRechecks: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-orange-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorDeleteAbnormal')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorDeleteAbnormalDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorDeleteAbnormal ?? false}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorDeleteAbnormal: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* (4) 我的設備 (My Equipment) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <Database className="w-3.5 h-3.5" />
                                                {t('sectionMyEquipment')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-emerald-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorMyEquipment')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorMyEquipmentDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorMyEquipment ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorMyEquipment: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                                                    </label>
                                                </div>
                                                {['EditEquipment', 'CopyEquipment', 'DeleteEquipment', 'BatchOperations', 'ShowBarcode', 'ShowImage'].map((perm) => (
                                                    <div key={perm} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-emerald-200">
                                                        <div>
                                                            <div className="font-bold text-slate-700 text-sm">{t(`allowInspector${perm}`)}</div>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{t(`allowInspector${perm}Desc`)}</div>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={systemSettings?.[`allowInspector${perm}` as keyof typeof systemSettings] as boolean ?? (perm.includes('Show') ? true : false)}
                                                                onChange={(e) => handleSaveSystemSettings({ ...systemSettings, [`allowInspector${perm}`]: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* (5) 我的地圖 (My Map) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-sky-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <MapPinned className="w-3.5 h-3.5" />
                                                {t('sectionMyMap')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-sky-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorMyMap')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorMyMapDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorMyMap ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorMyMap: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-sky-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('cloudGallery')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('cloudGalleryDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowCloudGallery ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowCloudGallery: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* (6) 歷史資料 (History) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <History className="w-3.5 h-3.5" />
                                                {t('sectionHistory')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-indigo-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorHistory')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorHistoryDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorHistory ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorHistory: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-indigo-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorDeleteHistory')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorDeleteHistoryDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorDeleteHistory ?? false}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorDeleteHistory: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                                    </label>
                                                </div>
                                                {['HistoryFilter', 'HistoryShowHideFields'].map((item) => (
                                                    <div key={item} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-indigo-200">
                                                        <div>
                                                            <div className="font-bold text-slate-700 text-sm">{t(`allowInspector${item}`)}</div>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{t(`allowInspector${item}Desc`)}</div>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={systemSettings?.[`allowInspector${item}` as keyof typeof systemSettings] as boolean ?? true}
                                                                onChange={(e) => handleSaveSystemSettings({ ...systemSettings, [`allowInspector${item}`]: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* (7) 設備概覽 (Equipment Overview) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <PieChart className="w-3.5 h-3.5" />
                                                {t('sectionEquipmentOverview')}
                                            </label>
                                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-slate-200">
                                                <div>
                                                    <div className="font-bold text-slate-700 text-sm">{t('allowInspectorEquipmentOverview')}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorEquipmentOverviewDesc')}</div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={systemSettings?.allowInspectorEquipmentOverview ?? true}
                                                        onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorEquipmentOverview: e.target.checked })}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-600"></div>
                                                </label>
                                            </div>
                                        </div>

                                        {/* (8) 健康指標 (Health Indicators) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <HeartPulse className="w-3.5 h-3.5" />
                                                {t('sectionHealthIndicators')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-rose-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorHealthIndicators')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorHealthIndicatorsDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorHealthIndicators ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorHealthIndicators: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                                                    </label>
                                                </div>
                                                {['EditHealth', 'DeleteHealth'].map((item) => (
                                                    <div key={item} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-rose-200">
                                                        <div>
                                                            <div className="font-bold text-slate-700 text-sm">{t(`allowInspector${item}`)}</div>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{t(`allowInspector${item}Desc`)}</div>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={systemSettings?.[`allowInspector${item}` as keyof typeof systemSettings] as boolean ?? false}
                                                                onChange={(e) => handleSaveSystemSettings({ ...systemSettings, [`allowInspector${item}`]: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* (8) 新增設備 (Add Equipment) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-teal-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <PlusCircle className="w-3.5 h-3.5" />
                                                {t('sectionAddEquipment')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-teal-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorAddEquipment')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorAddEquipmentDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorAddEquipment ?? false}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorAddEquipment: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-teal-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorEquipmentPhoto')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorEquipmentPhotoDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorEquipmentPhoto ?? true}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorEquipmentPhoto: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* (9) 新增清單/階層 (Add List / Hierarchy) Block */}
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <label className="text-xs font-bold text-purple-600 uppercase tracking-wider flex items-center gap-2 px-1">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                {t('sectionAddList')}
                                            </label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-purple-200">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">{t('allowInspectorManageHierarchy')}</div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">{t('allowInspectorManageHierarchyDesc')}</div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={systemSettings?.allowInspectorManageHierarchy ?? false}
                                                            onChange={(e) => handleSaveSystemSettings({ ...systemSettings, allowInspectorManageHierarchy: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                                                    </label>
                                                </div>
                                                {['ResetDefaults', 'EditHierarchy', 'DeleteHierarchy'].map((perm) => (
                                                    <div key={perm} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 transition-colors hover:border-purple-200">
                                                        <div>
                                                            <div className="font-bold text-slate-700 text-sm">{t(`allowInspector${perm}`)}</div>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{t(`allowInspector${perm}Desc`)}</div>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={systemSettings?.[`allowInspector${perm}` as keyof typeof systemSettings] as boolean ?? false}
                                                                onChange={(e) => handleSaveSystemSettings({ ...systemSettings, [`allowInspector${perm}`]: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Organization Manager Modal */}
            {
                showOrgManager && (
                    <Suspense fallback={null}>
                        <OrganizationManager
                            user={user}
                            currentOrgId={user.currentOrganizationId || null}
                            onClose={() => setShowOrgManager(false)}
                            onOrgSwitch={(orgId) => {
                                onOrgSwitch(orgId);
                            }}
                            systemSettings={systemSettings}
                        />
                    </Suspense>
                )
            }

            {/* Custom Alert Modal for Dashboard */}
            {alertConfig && (
                <CustomAlertModal
                    isOpen={alertConfig.isOpen}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    type={alertConfig.type || 'alert'}
                    onConfirm={() => {
                        if (alertConfig.onConfirm) {
                            alertConfig.onConfirm();
                        } else {
                            setAlertConfig(null);
                        }
                    }}
                    onCancel={() => {
                        if (alertConfig.onCancel) {
                            alertConfig.onCancel();
                        } else {
                            setAlertConfig(null);
                        }
                    }}
                />
            )}

            {/* Equipment Passport Quick Card Modal */}
            {passportEquipment && (
                <Suspense fallback={null}>
                    <EquipmentPassportModal
                        isOpen={!!passportEquipment}
                        onClose={() => setPassportEquipment(null)}
                        equipment={passportEquipment}
                        user={user}
                        lightSettings={currentLightSettings}
                            onStartInspection = {(!user.isGuest ? (isAdmin || systemSettings?.allowInspectorStartInspection !== false) : systemSettings?.allowGuestStartInspection === true) ? () => onCreateNew() : undefined
                        }
                        onViewFullHistory={(!user.isGuest ? (isAdmin || systemSettings?.allowInspectorHistory !== false) : systemSettings?.allowGuestHistory !== false) ? (code) => {
                            setSearchTerm(code.toUpperCase());
                            setSearchParams({ q: code.toUpperCase() }, { replace: true });
                        } : undefined}
                    />
                </Suspense>
            )}

            {/* Card Order Modal */}
            <CardOrderModal
                isOpen={isCardOrderModalOpen}
                onClose={() => setIsCardOrderModalOpen(false)}
                currentOrder={cardOrder}
                onSave={handleSaveCardOrder}
                onReset={handleResetCardOrder}
            />

            {/* Guest Share Pass QR Code Modal */}
            {isGuestShareModalOpen && (
                <Suspense fallback={null}>
                    <GuestShareModal
                        isOpen={isGuestShareModalOpen}
                        onClose={() => setIsGuestShareModalOpen(false)}
                        organizationId={user.currentOrganizationId}
                        organizationName={user.currentOrganizationId ? currentOrgName : t('personalOrganization')}
                        systemSettings={systemSettings}
                        isAdmin={isAdmin}
                        onEnableGuestForCurrentOrg={async () => {
                            if (!user.currentOrganizationId) return;
                            await handleSaveSystemSettings({
                                ...systemSettings,
                                allowGuestView: true,
                                guestOrganizationId: user.currentOrganizationId,
                                guestOrganizationName: currentOrgName
                            });
                        }}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default Dashboard;
