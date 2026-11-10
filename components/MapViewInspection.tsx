import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, ArrowLeft, ZoomIn, ZoomOut, RotateCw, CheckCircle, AlertTriangle, Save, Upload, Camera, Trash2, Tag, Plus, ClipboardCheck, Gauge, Eye, Image as ImageIcon, Navigation, Compass, Crosshair, MapPin, Sliders, RotateCcw, ArrowUp, ArrowRight, ArrowDown, Footprints, Activity, ChevronUp, ChevronDown } from 'lucide-react';
import { UserProfile, EquipmentMap, EquipmentMarker, EquipmentDefinition, InspectionReport, InspectionItem, InspectionStatus, CustomCheckItem, LightSettings } from '../types';
import { StorageService } from '../services/storageService';
import BarcodeInputModal from './BarcodeInputModal';
import { getFrequencyStatus, getNextInspectionDate } from '../utils/inspectionUtils';
import { useLanguage } from '../contexts/LanguageContext';
import { useLightSettings, HISTORY_KEYS, EQUIPMENT_KEYS } from '../hooks/useSystemData';
import CustomAlertModal from './CustomAlertModal';
import { useQueryClient } from '@tanstack/react-query';

interface MapViewInspectionProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
}

const MapViewInspection: React.FC<MapViewInspectionProps> = ({ user, isOpen, onClose }) => {
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const isAdmin = user.role === 'admin' || user.email?.toLowerCase() === 'b28803078@gmail.com';
    // Map Selection State
    const [maps, setMaps] = useState<EquipmentMap[]>([]);
    const [currentMap, setCurrentMap] = useState<EquipmentMap | null>(null);
    const [viewMode, setViewMode] = useState<'SELECT' | 'INSPECT'>('SELECT');

    // Inspection State
    const [selectedMarker, setSelectedMarker] = useState<EquipmentMarker | null>(null);
    const [isScanningBarcode, setIsScanningBarcode] = useState(false);
    const [allEquipment, setAllEquipment] = useState<EquipmentDefinition[]>([]);
    const [currentEquipment, setCurrentEquipment] = useState<EquipmentDefinition | null>(null);
    const { data: lightSettings } = useLightSettings(user);
    const [reports, setReports] = useState<InspectionReport[]>([]);

    // Check Items State
    const [checkResults, setCheckResults] = useState<Record<string, any>>({});
    const [notes, setNotes] = useState('');
    const [inspectingTags, setInspectingTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [showTagInput, setShowTagInput] = useState(false);
    const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

    const handleAddTag = (inputVal?: string) => {
        const val = (inputVal || tagInput).trim();
        if (val) {
            const newTags = val.split(/[,，;\s]+/).map(t => t.trim()).filter(t => t !== '' && !inspectingTags.includes(t));
            if (newTags.length > 0) {
                setInspectingTags(prev => [...prev, ...newTags]);
            }
            setTagInput('');
        }
    };

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMsg({ text, type });
        setTimeout(() => setToastMsg(null), 3000);
    };

    // Modal State
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title?: string;
        message: string;
        type?: 'alert' | 'confirm' | 'success';
        onConfirm: () => void;
        onCancel?: () => void;
        secondaryText?: string;
        onSecondary?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({
        isOpen: false,
        message: '',
        onConfirm: () => { }
    });

    // 未到期提前強制檢查：記錄當下原本的到期日 (null = 一般檢查)
    const [forcedDueDate, setForcedDueDate] = useState<number | null>(null);

    const showAlert = (message: string, title?: string, type: 'alert' | 'success' = 'alert') => {
        setAlertConfig({
            isOpen: true,
            title,
            message,
            type,
            onConfirm: () => setAlertConfig(prev => ({ ...prev, isOpen: false }))
        });
    };

    const [inspectedOverrides, setInspectedOverrides] = useState<Record<string, number>>({});
    const [renderKey, setRenderKey] = useState(0);

    // 方案 C: 導航模式狀態與手機實體羅盤 + PDR 行走推算
    const [isNavActive, setIsNavActive] = useState(true);
    const [isHudCollapsed, setIsHudCollapsed] = useState(false);
    const [navHeadingMode, setNavHeadingMode] = useState<'COMPASS' | 'TARGET'>('TARGET'); // 預設 TARGET (鎖定路線首選，防室內鋼筋磁場干擾)
    const [userLocation, setUserLocation] = useState<{
        x: number;
        y: number;
        markerId?: string;
        name: string;
        barcode: string;
    } | null>(null);
    const [compassHeading, setCompassHeading] = useState<number | null>(null);

    // PDR (Pedestrian Dead Reckoning) 狀態
    const [isPdrActive, setIsPdrActive] = useState<boolean>(true);
    const [stepCount, setStepCount] = useState<number>(0);
    const [sessionSteps, setSessionSteps] = useState<number>(0);
    const [isStepPulsing, setIsStepPulsing] = useState<boolean>(false);
    const [lastCalibrationMsg, setLastCalibrationMsg] = useState<string>('');

    // 每步前進距離 (圖面百分比，預設 0.85%，儲存於 localStorage)
    const [stepSizePercent, setStepSizePercent] = useState<number>(() => {
        try {
            return Number(localStorage.getItem('pdr_step_size_percent') || 0.85);
        } catch {
            return 0.85;
        }
    });

    // 邁步感測靈敏度 (加速度閾值，預設 1.8 m/s²)
    const [stepSensitivity, setStepSensitivity] = useState<number>(() => {
        try {
            return Number(localStorage.getItem('pdr_step_sensitivity') || 1.8);
        } catch {
            return 1.8;
        }
    });

    // 羅盤圖面方位偏差校準角 (Compass Calibration Offset)
    const [compassOffset, setCompassOffset] = useState<number>(() => {
        try {
            return Number(localStorage.getItem('compass_calibration_offset') || 0);
        } catch {
            return 0;
        }
    });
    const [showCalibrationModal, setShowCalibrationModal] = useState(false);

    // Refs 同步確保事件監聽閉包內始終取得最新值
    const isPdrActiveRef = useRef(isPdrActive);
    const navHeadingModeRef = useRef(navHeadingMode);
    const userLocationRef = useRef(userLocation);
    const compassHeadingRef = useRef(compassHeading);
    const compassOffsetRef = useRef(compassOffset);
    const rotationRef = useRef(0);
    const stepSizePercentRef = useRef(stepSizePercent);
    const stepSensitivityRef = useRef(stepSensitivity);
    const sessionStepsRef = useRef(sessionSteps);
    const nextTargetRef = useRef<any>(null);
    const lastStepTimeRef = useRef(0);
    const isPeakRef = useRef(false);
    const smoothedHeadingRef = useRef<number | null>(null);
    const lastCompassUpdateRef = useRef<number>(0);

    useEffect(() => { isPdrActiveRef.current = isPdrActive; }, [isPdrActive]);
    useEffect(() => { navHeadingModeRef.current = navHeadingMode; }, [navHeadingMode]);
    useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
    useEffect(() => { compassHeadingRef.current = compassHeading; }, [compassHeading]);
    useEffect(() => { compassOffsetRef.current = compassOffset; }, [compassOffset]);
    useEffect(() => { stepSizePercentRef.current = stepSizePercent; }, [stepSizePercent]);
    useEffect(() => { stepSensitivityRef.current = stepSensitivity; }, [stepSensitivity]);
    useEffect(() => { sessionStepsRef.current = sessionSteps; }, [sessionSteps]);

    const updateCompassOffset = (newOffset: number) => {
        const normalized = ((newOffset % 360) + 360) % 360;
        setCompassOffset(normalized);
        try {
            localStorage.setItem('compass_calibration_offset', String(normalized));
        } catch (e) {
            console.error(e);
        }
    };

    // 方案 B: 一鍵將「手機朝向」直接校準為「下一站設備方位」
    const alignCompassToNextTarget = () => {
        if (!nextTargetRef.current || !userLocationRef.current) {
            showAlert('目前沒有下一個推薦目標設備');
            return;
        }
        if (compassHeadingRef.current === null) {
            requestSensors();
            return;
        }

        const dx = nextTargetRef.current.marker.x - userLocationRef.current.x;
        const dy = nextTargetRef.current.marker.y - userLocationRef.current.y;
        const angleToTarget = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;

        const calculatedOffset = angleToTarget - compassHeadingRef.current + rotationRef.current;
        updateCompassOffset(calculatedOffset);

        setLastCalibrationMsg(`🎯 已成功對齊！手機朝向已與【${nextTargetRef.current.eq.name}】精準同步！`);
        setTimeout(() => {
            setShowCalibrationModal(false);
        }, 500);
    };

    // 步伐推算：每走一步把紅點依當前朝向往前推進
    const triggerStep = (customStepSize?: number) => {
        if (!userLocationRef.current) return;

        // 計算目前前進角度 (若為 TARGET 鎖定模式直接往下一站走，若為 COMPASS 模式則依羅盤方向)
        let screenAngle = 0;
        if (navHeadingModeRef.current === 'TARGET' && nextTargetRef.current && userLocationRef.current) {
            const dxTarget = nextTargetRef.current.marker.x - userLocationRef.current.x;
            const dyTarget = nextTargetRef.current.marker.y - userLocationRef.current.y;
            screenAngle = ((Math.atan2(dxTarget, -dyTarget) * 180 / Math.PI) + 360) % 360;
        } else if (compassHeadingRef.current !== null) {
            screenAngle = ((compassHeadingRef.current + compassOffsetRef.current - rotationRef.current) % 360 + 360) % 360;
        }

        const rad = (screenAngle * Math.PI) / 180;
        const stride = customStepSize || stepSizePercentRef.current;
        const dx = Math.sin(rad) * stride;
        const dy = -Math.cos(rad) * stride;

        setUserLocation(prev => {
            if (!prev) return null;
            const newX = Math.max(1, Math.min(99, prev.x + dx));
            const newY = Math.max(1, Math.min(99, prev.y + dy));
            return {
                ...prev,
                x: Number(newX.toFixed(2)),
                y: Number(newY.toFixed(2))
            };
        });

        setStepCount(s => s + 1);
        setSessionSteps(s => s + 1);
        setIsStepPulsing(true);
        setTimeout(() => setIsStepPulsing(false), 300);
    };

    // 啟動實體陀螺儀 / 指南針監聽 (加入 EMA 低通濾波與 2° 死區防手震，徹底消除指針飄移)
    const startCompassListener = () => {
        const handleOrientation = (e: any) => {
            let rawHeading: number | null = null;
            if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
                rawHeading = e.webkitCompassHeading;
            } else if (e.alpha !== null && e.alpha !== undefined) {
                rawHeading = (360 - e.alpha) % 360;
            }

            if (rawHeading === null || isNaN(rawHeading)) return;

            const now = Date.now();
            if (smoothedHeadingRef.current === null) {
                smoothedHeadingRef.current = rawHeading;
                setCompassHeading(Math.round(rawHeading));
                return;
            }

            // 最短旋轉差值 (-180 ~ +180) 防止 0°/360° 跨越時反轉
            let diff = rawHeading - smoothedHeadingRef.current;
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;

            // 死區防手震：若轉動幅度小於 2 度，直接忽視，消除微小手抖造成指針抖動
            if (Math.abs(diff) < 2) return;

            // EMA 低通平滑濾波 (平滑係數 0.22)
            smoothedHeadingRef.current = ((smoothedHeadingRef.current + diff * 0.22) % 360 + 360) % 360;

            // 節流更新 state（每 45ms 最多更新一次，避免 React 重繪卡頓）
            if (now - lastCompassUpdateRef.current > 45) {
                lastCompassUpdateRef.current = now;
                setCompassHeading(Math.round(smoothedHeadingRef.current));
            }
        };

        window.addEventListener('deviceorientation', handleOrientation, true);
        window.addEventListener('deviceorientationabsolute' as any, handleOrientation, true);
    };

    // 啟動加速度計邁步感應監聽 (PDR Step Detection)
    const startMotionListener = () => {
        const handleMotion = (e: DeviceMotionEvent) => {
            if (!isPdrActiveRef.current) return;

            let dynamicMagnitude = 0;
            if (e.acceleration && e.acceleration.x !== null && e.acceleration.y !== null && e.acceleration.z !== null) {
                dynamicMagnitude = Math.hypot(e.acceleration.x, e.acceleration.y, e.acceleration.z);
            } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x !== null && e.accelerationIncludingGravity.y !== null && e.accelerationIncludingGravity.z !== null) {
                const rawMag = Math.hypot(
                    e.accelerationIncludingGravity.x,
                    e.accelerationIncludingGravity.y,
                    e.accelerationIncludingGravity.z
                );
                dynamicMagnitude = Math.abs(rawMag - 9.80665);
            }

            const now = Date.now();
            // 步伐波峰判定 (閾值 1.8m/s²，間隔 > 320ms 防止連發)
            if (dynamicMagnitude > stepSensitivityRef.current && !isPeakRef.current && (now - lastStepTimeRef.current > 320)) {
                isPeakRef.current = true;
                lastStepTimeRef.current = now;
                triggerStep();
            } else if (dynamicMagnitude < 0.8) {
                isPeakRef.current = false;
            }
        };

        window.addEventListener('devicemotion', handleMotion, true);
    };

    // 請求手機羅盤與動作感應權限 (iOS 13+ 必須由使用者點擊按鈕主動請求授權)
    const requestSensors = async () => {
        if (typeof window === 'undefined') return;

        let hasError = false;

        // 1. 羅盤方向
        if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
            try {
                const response = await (DeviceOrientationEvent as any).requestPermission();
                if (response === 'granted') {
                    startCompassListener();
                } else {
                    hasError = true;
                }
            } catch (err: any) {
                console.error('Compass permission error:', err);
                hasError = true;
            }
        } else {
            startCompassListener();
        }

        // 2. 加速度計 (PDR 步伐推算)
        if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
            try {
                const response = await (DeviceMotionEvent as any).requestPermission();
                if (response === 'granted') {
                    startMotionListener();
                }
            } catch (err: any) {
                console.error('Motion permission error:', err);
            }
        } else {
            startMotionListener();
        }

        if (hasError) {
            showAlert('未取得手機動作與方向感應權限。\n\n請至 iPhone【設定】>【Safari】> 開啟【動作與方向取用權限】後重試。', '感應器未啟用');
        }
    };

    // 掛載時非 iOS 自動嘗試啟動監聽
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (typeof (DeviceOrientationEvent as any)?.requestPermission !== 'function') {
                startCompassListener();
            }
            if (typeof (DeviceMotionEvent as any)?.requestPermission !== 'function') {
                startMotionListener();
            }
        }
    }, []);

    // 到達設備時執行校準歸零 (Snap to Checkpoint & Dynamic Stride Learning)
    const snapToCheckpoint = (marker: EquipmentMarker, equipment: EquipmentDefinition) => {
        if (userLocationRef.current && sessionStepsRef.current >= 4) {
            // 動態步長微調學習：計算起訖真實距離與步數
            const dx = marker.x - userLocationRef.current.x;
            const dy = marker.y - userLocationRef.current.y;
            const dist = Math.hypot(dx, dy);
            const learned = dist / sessionStepsRef.current;
            if (learned >= 0.3 && learned <= 3.0) {
                const blended = Number((stepSizePercentRef.current * 0.7 + learned * 0.3).toFixed(2));
                setStepSizePercent(blended);
                try {
                    localStorage.setItem('pdr_step_size_percent', String(blended));
                } catch (e) { }
            }
        }

        setSessionSteps(0);
        setUserLocation({
            x: marker.x,
            y: marker.y,
            markerId: marker.id,
            name: equipment.name,
            barcode: equipment.barcode
        });
        setLastCalibrationMsg(`🎯 已於【${equipment.name}】精準歸零！`);
        setTimeout(() => setLastCalibrationMsg(''), 4500);
    };

    // Transform State
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        rotationRef.current = rotation;
    }, [rotation]);

    const imageContainerRef = useRef<HTMLDivElement>(null);

    // Load maps and equipment on mount
    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, user.uid, user.currentOrganizationId]);

    const loadData = async () => {
        try {
            const [mapsData, equipmentData, reportsData] = await Promise.all([
                StorageService.getEquipmentMaps(user.uid, user.currentOrganizationId),
                StorageService.getEquipmentDefinitions(user.uid, user.currentOrganizationId),
                StorageService.getReports(user.uid, undefined, true, user.currentOrganizationId)
            ]);
            setMaps(mapsData);
            setAllEquipment(equipmentData);
            setReports(reportsData);
        } catch (error) {
            console.error('Failed to load data:', error);
            showAlert('載入資料失敗，請重試');
        }
    };

    const handleMapSelect = (map: EquipmentMap) => {
        setCurrentMap(map);
        setViewMode('INSPECT');
        setRotation(map.rotation || 0);

        // 初始化導航定位：若地圖有標註點，設定預設所在位置
        if (map.markers && map.markers.length > 0) {
            const firstMarker = map.markers.find(m => m.equipmentId) || map.markers[0];
            if (firstMarker) {
                const eq = allEquipment.find(e => e.barcode === firstMarker.equipmentId || e.id === firstMarker.equipmentId);
                setUserLocation({
                    x: firstMarker.x,
                    y: firstMarker.y,
                    markerId: firstMarker.id,
                    name: eq?.name || firstMarker.equipmentId || '初始起點',
                    barcode: eq?.barcode || firstMarker.equipmentId || ''
                });
            }
        }
    };

    // 智能推薦：從當前所在位置計算「下一個最接近的待檢查設備」
    const nextTarget = useMemo(() => {
        if (!userLocation || !currentMap?.markers || currentMap.markers.length === 0) return null;

        const candidates = currentMap.markers.filter(m => m.id !== userLocation.markerId && m.equipmentId);
        if (candidates.length === 0) return null;

        const pending: { marker: EquipmentMarker; dist: number; eq: EquipmentDefinition }[] = [];
        const canInspect: { marker: EquipmentMarker; dist: number; eq: EquipmentDefinition }[] = [];
        const others: { marker: EquipmentMarker; dist: number; eq: EquipmentDefinition }[] = [];

        const today = new Date().setHours(0, 0, 0, 0);

        candidates.forEach(m => {
            const eq = allEquipment.find(e => e.barcode === m.equipmentId || e.id === m.equipmentId);
            if (!eq) return;

            // 跨所有今日報表精準檢查是否今日已檢查過
            const isDoneToday = reports.some(r =>
                r.date >= today && (r.items || []).some((i: any) => i.equipmentId === eq.id)
            ) || !!inspectedOverrides[m.equipmentId] || !!inspectedOverrides[eq.id];

            if (isDoneToday) return; // 今日已完成的設備不重複推薦

            const status = getFrequencyStatus(eq, lightSettings);
            const dist = Math.hypot(m.x - userLocation.x, m.y - userLocation.y);

            if (status === 'PENDING') {
                pending.push({ marker: m, dist, eq });
            } else if (status === 'CAN_INSPECT') {
                canInspect.push({ marker: m, dist, eq });
            } else {
                others.push({ marker: m, dist, eq });
            }
        });

        // 優先度：紅燈（需檢查） > 黃燈（可檢查） > 其他未檢
        const pool = pending.length > 0 ? pending : canInspect.length > 0 ? canInspect : others;
        if (pool.length === 0) return null;

        // 依幾何直線距離由近到遠排序
        pool.sort((a, b) => a.dist - b.dist);
        return pool[0];
    }, [userLocation, currentMap, allEquipment, lightSettings, reports, inspectedOverrides]);

    useEffect(() => {
        nextTargetRef.current = nextTarget;
    }, [nextTarget]);

    // 當前光錐指向角度：若為 TARGET 鎖定模式自動精準指向下一站目標，若為 COMPASS 模式跟隨手機羅盤
    const activeVisionAngle = useMemo(() => {
        if (navHeadingMode === 'TARGET' && nextTarget && userLocation) {
            const dx = nextTarget.marker.x - userLocation.x;
            const dy = nextTarget.marker.y - userLocation.y;
            return ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
        }
        return (((compassHeading || 0) + compassOffset - rotation) % 360 + 360) % 360;
    }, [navHeadingMode, nextTarget, userLocation, compassHeading, compassOffset, rotation]);

    const focusMarker = (targetX: number, targetY: number) => {
        const dx = (50 - targetX) * 4;
        const dy = (50 - targetY) * 4;
        setPosition({ x: dx, y: dy });
        setZoom(1.5);
    };

    const handleMarkerClick = (marker: EquipmentMarker) => {
        if (!marker.equipmentId) {
            showAlert('此標註點尚未綁定設備');
            return;
        }

        const equipment = allEquipment.find(e => e.barcode === marker.equipmentId || e.id === marker.equipmentId);
        if (!equipment) {
            showAlert(`找不到設備編號或代碼 ${marker.equipmentId}`);
            return;
        }

        // 點擊標註點時自動校準歸零導航定位
        snapToCheckpoint(marker, equipment);

        // 1. 檢查是否已檢查過 (Override、報表中已存在或 COMPLETED)
        const overrideTime = inspectedOverrides[marker.equipmentId] || inspectedOverrides[equipment.id];
        const isOverridden = overrideTime && (Date.now() - overrideTime < 24 * 60 * 60 * 1000);
        const freqStatus = getFrequencyStatus(equipment, lightSettings);

        const today = new Date().setHours(0, 0, 0, 0);
        const targetBuildingName = equipment.buildingName || currentMap?.name;
        const todayReport = reports.find(r => r.buildingName === targetBuildingName && r.date >= today);
        const inspectionItem = (todayReport?.items || []).find((i: any) => i.equipmentId === equipment.id);

        if (isOverridden || freqStatus === 'COMPLETED' || inspectionItem) {
            const timeStr = inspectionItem?.timestamp
                ? new Date(inspectionItem.timestamp).toLocaleString()
                : overrideTime
                    ? new Date(overrideTime).toLocaleString()
                    : (equipment.lastInspectedDate ? new Date(equipment.lastInspectedDate).toLocaleString() : '已完成');

            if (isAdmin) {
                setAlertConfig({
                    isOpen: true,
                    title: '修改今日檢查紀錄',
                    message: `設備「${equipment.name}」今日已完成檢查\n\n檢查時間: ${timeStr}\n\n您具有【管理員權限】，可重新開啟填寫表單並覆蓋修正今日紀錄。`,
                    type: 'confirm',
                    confirmText: '✏️ 重新填寫並覆蓋',
                    cancelText: '取消',
                    onConfirm: () => {
                        setAlertConfig(prev => ({ ...prev, isOpen: false }));
                        setForcedDueDate(inspectionItem?.forcedFromDueDate || null);
                        setSelectedMarker(marker);
                        setIsScanningBarcode(true);
                    },
                    onCancel: () => setAlertConfig(prev => ({ ...prev, isOpen: false }))
                });
                return;
            }

            showAlert(
                `設備「${equipment.name}」今日已完成檢查\n\n檢查時間: ${timeStr}\n\n今日巡檢已建檔完成，不需重複檢查。`,
                '無法檢查'
            );
            return;
        }

        // 2. 檢查是否不需檢查 (未到期綠燈 -> 提供強制檢查按鈕)
        if (freqStatus === 'UNNECESSARY') {
            const dueDate = getNextInspectionDate(equipment);
            setAlertConfig({
                isOpen: true,
                title: '不需檢查',
                message: `設備「${equipment.name}」目前不需要檢查\n\n下次檢查日期: ${new Date(dueDate).toLocaleDateString()}\n\n⚠️ 強制檢查後，下次到期日將從今天重新起算。`,
                type: 'alert',
                secondaryText: '⚡ 強制檢查此設備',
                onSecondary: () => {
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                    setForcedDueDate(dueDate);
                    setSelectedMarker(marker);
                    setIsScanningBarcode(true);
                },
                onConfirm: () => setAlertConfig(prev => ({ ...prev, isOpen: false }))
            });
            return;
        }

        // 3. 正常需檢查 / 可檢查
        setForcedDueDate(null);
        setSelectedMarker(marker);
        setIsScanningBarcode(true);
    };

    const handleBarcodeValidated = async (barcode: string) => {
        setIsScanningBarcode(false);

        // Find equipment by barcode
        const equipment = allEquipment.find(e => e.barcode === barcode);
        if (!equipment) {
            showAlert(`找不到設備編號 ${barcode}`);
            setSelectedMarker(null);
            return;
        }

        // 掃描條碼成功，立即校準歸零當前導航位置到該設備
        const targetMarker = selectedMarker || currentMap?.markers.find(m => m.equipmentId === equipment.barcode || m.equipmentId === equipment.id);
        if (targetMarker) {
            snapToCheckpoint(targetMarker, equipment);
        }

        // Load check items
        setCurrentEquipment(equipment);

        // Initialize check results
        const initialResults: Record<string, any> = {};
        equipment.checkItems.forEach(item => {
            if (item.inputType === 'boolean') {
                initialResults[item.id] = true; // Default to normal
            }
        });
        setCheckResults(initialResults);
        setNotes('');
        setInspectingTags(equipment.tags || []);
        setTagInput('');
        setShowTagInput(false);
    };

    const handleCheckItemChange = (itemId: string, value: any) => {
        setCheckResults(prev => ({ ...prev, [itemId]: value }));
    };

    // --- Drag & Pan Handlers ---
    const handlePointerDown = (e: React.PointerEvent) => {
        // Only start drag if dragging on the container or image, not markers
        // (Markers stop propagation in their own click handler if needs be, but pointer events usually bubble)
        if ((e.target as HTMLElement).tagName.toLowerCase() === 'button') return;

        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const handleResetView = () => {
        setZoom(1);
        setPosition({ x: 0, y: 0 });
        setRotation(0);
    };



    const determineStatus = (): InspectionStatus => {
        if (!currentEquipment) return InspectionStatus.Normal;

        let hasAbnormal = false;

        currentEquipment.checkItems.forEach(item => {
            const value = checkResults[item.id];

            if (item.inputType === 'boolean') {
                if (value === false) hasAbnormal = true;
            } else if (item.inputType === 'number') {
                const num = parseFloat(String(value));
                if (!isNaN(num) && item.thresholdMode) {
                    if (item.thresholdMode === 'range') {
                        if (num < (item.val1 || 0) || num > (item.val2 || 0)) hasAbnormal = true;
                    } else if (item.thresholdMode === 'gt' && num <= (item.val1 || 0)) hasAbnormal = true;
                    else if (item.thresholdMode === 'gte' && num < (item.val1 || 0)) hasAbnormal = true;
                    else if (item.thresholdMode === 'lt' && num >= (item.val1 || 0)) hasAbnormal = true;
                    else if (item.thresholdMode === 'lte' && num > (item.val1 || 0)) hasAbnormal = true;
                }
            }
        });

        return hasAbnormal ? InspectionStatus.Abnormal : InspectionStatus.Normal;
    };

    const handleSubmit = async () => {
        if (!currentEquipment || !selectedMarker || !currentMap) return;

        // Validate numeric items
        const missingNumeric = currentEquipment.checkItems.find(item =>
            item.inputType === 'number' &&
            (checkResults[item.id] === undefined || checkResults[item.id] === '')
        );

        if (missingNumeric) {
            showAlert(`請填寫「${missingNumeric.name}」的數值！`);
            return;
        }

        const status = determineStatus();

        // Validate abnormal notes
        if (status === InspectionStatus.Abnormal && !notes.trim()) {
            showAlert('檢查結果異常，請務必填寫異常說明！');
            return;
        }

        setIsSubmitting(true);

        try {
            const now = Date.now();

            // 1. Prepare Snapshot Data
            // Build check results snapshot
            const checkResultsSnapshot = currentEquipment.checkItems.map(item => {
                const result: any = {
                    name: item.name || '',
                    value: checkResults[item.id] ?? ''
                };

                if (item.inputType === 'number') {
                    if (item.thresholdMode === 'range') {
                        result.threshold = `${item.val1}~${item.val2}`;
                    } else if (item.thresholdMode) {
                        result.threshold = `${item.thresholdMode} ${item.val1}`;
                    }
                    if (item.unit) {
                        result.unit = item.unit;
                    }
                }
                return result;
            });

            // 2. Prepare Inspection Item (Raw)
            const rawInspectionItem: InspectionItem = {
                id: `item_${now}`,
                equipmentId: currentEquipment.id,
                type: currentEquipment.equipmentType || 'Custom',
                name: currentEquipment.name || '',
                barcode: currentEquipment.barcode || '',
                checkFrequency: currentEquipment.checkFrequency || '',
                location: `${currentEquipment.siteName || ''} - ${currentEquipment.buildingName || ''}`,
                status: status,
                checkPoints: JSON.parse(JSON.stringify(checkResults)), // Remove undefineds
                checkResults: JSON.parse(JSON.stringify(checkResultsSnapshot)), // Remove undefineds
                notes: notes || '',
                tags: inspectingTags, // Snapshot tags
                // Photo upload removed
                lastUpdated: now,
                ...(forcedDueDate ? { isForced: true, forcedFromDueDate: forcedDueDate } : {})
            };

            // 3. Deep Sanitation (Crucial for Firebase)
            const inspectionItem = JSON.parse(JSON.stringify(rawInspectionItem));

            console.log('[handleSubmit] Sanitized Item:', inspectionItem);

            // 4. OPTIMISTIC UI UPDATE (The "Different Method")
            // A. Force Override State (Guaranteed Update - Multi-Key)
            const barcodeKey = (currentEquipment.barcode || 'UNKNOWN').trim();
            const idKey = currentEquipment.id;
            console.log('[handleSubmit] Setting Override for:', barcodeKey, idKey, 'Time:', now);
            setInspectedOverrides(prev => ({
                ...prev,
                [barcodeKey]: now,
                [idKey]: now
            }));

            // B. Update local equipment state (Standard)
            setAllEquipment(prev => prev.map(e =>
                e.id === currentEquipment.id
                    ? { ...e, lastInspectedDate: now, updatedAt: now }
                    : e
            ));

            // Immediately update reports state locally
            setReports(prev => {
                const today = new Date().setHours(0, 0, 0, 0);
                // Use equipment's building name, fallback to map name
                const targetBuildingName = currentEquipment?.buildingName || currentMap.name;

                const existingReportIndex = prev.findIndex(r =>
                    r.buildingName === targetBuildingName && r.date >= today
                );

                if (existingReportIndex >= 0) {
                    const newReports = [...prev];
                    const report = { ...newReports[existingReportIndex] };
                    const items = [...(report.items || [])];
                    const itemIndex = items.findIndex(i => i.equipmentId === currentEquipment.id);

                    if (itemIndex >= 0) {
                        items[itemIndex] = inspectionItem;
                    } else {
                        items.push(inspectionItem);
                    }

                    report.items = items;
                    newReports[existingReportIndex] = report;
                    return newReports;
                } else {
                    return [...prev, {
                        id: `temp_report_${now}`,
                        buildingName: targetBuildingName,
                        inspectorName: user.displayName || 'Guest',
                        date: now,
                        items: [inspectionItem],
                        overallStatus: 'In Progress'
                    } as InspectionReport];
                }
            });

            // Force Re-render Immediately
            // This ensures the green light appears instantly
            setTimeout(() => {
                setRenderKey(prev => prev + 1);
                console.log('[handleSubmit] Optimistic Render Triggered');
            }, 0);


            // 5. ASYNC SAVING (Firebase)
            // Find or create actual report for storage
            const targetBuildingName = currentEquipment?.buildingName || currentMap.name;
            let report = reports.find(r => r.buildingName === targetBuildingName && r.date >= new Date().setHours(0, 0, 0, 0));
            if (!report) {
                report = {
                    id: `report_${now}`,
                    userId: user.uid,
                    buildingName: targetBuildingName,
                    inspectorName: user.displayName || 'Guest',
                    date: now,
                    items: [],
                    overallStatus: 'In Progress'
                };
            }

            // Sync item to target report object (Ensure items array exists)
            if (!report.items) report.items = [];
            const itemIndex = report.items.findIndex(i => i.equipmentId === currentEquipment.id);
            if (itemIndex >= 0) {
                report.items[itemIndex] = inspectionItem;
            } else {
                report.items.push(inspectionItem);
            }

            // 6. ASYNC SAVING (Firebase)
            if (report.id.startsWith('temp_report_') || report.id.startsWith('report_')) {
                // If it's a temp ID or a new report ID, use saveReport
                const newId = await StorageService.saveReport(report, user.uid, user.currentOrganizationId);
                report.id = newId;
                // Invalidate history queries to update Dashboard stats
                queryClient.invalidateQueries({ queryKey: HISTORY_KEYS.all(user.uid, user.currentOrganizationId, new Date().getFullYear()) });
            } else {
                await StorageService.updateReport(report);
                // Invalidate history queries to update Dashboard stats
                queryClient.invalidateQueries({ queryKey: HISTORY_KEYS.all(user.uid, user.currentOrganizationId, new Date().getFullYear()) });
            }

            // Final tag check: Capture what is in the input box if not empty
            let finalTags = [...inspectingTags];
            const currentTagInput = tagInput.trim();
            if (currentTagInput) {
                const newTags = currentTagInput.split(/[,，;\s]+/).map(t => t.trim()).filter(t => t !== '' && !finalTags.includes(t));
                if (newTags.length > 0) {
                    finalTags = [...finalTags, ...newTags];
                }
            }

            // Update equipment definition in Firebase (Do this first for reliability)
            await StorageService.updateEquipmentDefinition({
                id: currentEquipment.id,
                tags: finalTags, // Persist tags
                lastInspectedDate: now,
                updatedAt: now
            });
            // Invalidate equipment query to ensure consistency
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all(user.uid, user.currentOrganizationId) });

            // Handle Abnormal Records
            if (status === InspectionStatus.Abnormal) {
                const abnormalItems: string[] = [];
                const abnormalValues: string[] = [];
                const thresholdModes: string[] = [];

                currentEquipment.checkItems.forEach(item => {
                    const value = checkResults[item.id];
                    if (item.inputType === 'boolean' && value === false) {
                        abnormalItems.push(item.name);
                        abnormalValues.push(t('abnormal'));
                    } else if (item.inputType === 'number') {
                        const num = parseFloat(String(value));
                        if (!isNaN(num) && item.thresholdMode) {
                            let f = false;
                            if (item.thresholdMode === 'range') f = (num < (item.val1 || 0) || num > (item.val2 || 0));
                            else if (item.thresholdMode === 'gt') f = (num <= (item.val1 || 0));
                            else if (item.thresholdMode === 'gte') f = (num < (item.val1 || 0));
                            else if (item.thresholdMode === 'lt') f = (num >= (item.val1 || 0));
                            else if (item.thresholdMode === 'lte') f = (num > (item.val1 || 0));

                            if (f) {
                                abnormalItems.push(item.name);
                                abnormalValues.push(`${num} ${item.unit || ''}`);
                                thresholdModes.push(item.thresholdMode);
                            }
                        }
                    }
                });

                await StorageService.saveAbnormalRecord({
                    userId: user.uid,
                    equipmentId: currentEquipment.id,
                    equipmentName: currentEquipment.name,
                    barcode: currentEquipment.barcode,
                    siteName: currentEquipment.siteName,
                    buildingName: currentEquipment.buildingName,
                    inspectionDate: now,
                    abnormalItems: abnormalItems.length > 0 ? abnormalItems : ['未指定項目'],
                    abnormalValue: abnormalValues.length > 0 ? abnormalValues.join(', ') : null,
                    thresholdMode: thresholdModes.length > 0 ? thresholdModes.join(', ') : null,
                    abnormalReason: notes,
                    status: 'pending',
                    tags: finalTags,
                    createdAt: now,
                    updatedAt: now
                }, user.uid, user.currentOrganizationId);
            }

            console.log('[handleSubmit] Save Complete');

            // Refresh reports to get the latest status (including items)
            const updatedReports = await StorageService.getReports(user.uid, undefined, true, user.currentOrganizationId);
            setReports(updatedReports);

            // Sync local equipment data
            setAllEquipment(prev => prev.map(e =>
                e.id === currentEquipment.id ? { ...e, tags: finalTags, lastInspectedDate: now } : e
            ));

            showToast('✅ 提交成功！');

        } catch (error) {
            console.error('[handleSubmit] Error:', error);
            showAlert(`提交失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
            // Note: We deliberately do NOT revert optimistic updates here to avoid UI flickering, 
            // unless users manually refresh, assuming retry might be possible or it's a transient network issue.
            // But realistically, user will just try again.
        } finally {
            setTimeout(() => {
                setForcedDueDate(null);
                setCurrentEquipment(null);
                setSelectedMarker(null);
                setCheckResults({});
                setNotes('');
                setInspectingTags([]);
                setTagInput('');
                setIsSubmitting(false);
            }, 100);
        }
    };

    const getMarkerColor = (marker: EquipmentMarker): string => {
        console.log('[getMarkerColor] Marker:', marker.id, 'equipmentId:', marker.equipmentId);

        if (!marker.equipmentId) {
            console.log('[getMarkerColor] No equipmentId, returning gray');
            return 'bg-slate-400';
        }

        const equipment = allEquipment.find(e => e.barcode === marker.equipmentId);
        console.log('[getMarkerColor] Looking for barcode:', marker.equipmentId, 'Found:', equipment?.name || 'NOT FOUND');

        if (!equipment) {
            console.log('[getMarkerColor] Equipment not found, returning gray. Available barcodes:', allEquipment.map(e => e.barcode).join(', '));
            return 'bg-slate-400';
        }

        // Check if abnormal in LATEST report only
        const relevantReports = reports
            .filter(r => r.items?.some(i => i.equipmentId === equipment.id))
            .sort((a, b) => b.date - a.date);

        if (relevantReports.length > 0) {
            const latestItem = relevantReports[0].items?.find(i => i.equipmentId === equipment.id);
            if (latestItem?.status === InspectionStatus.Abnormal) {
                return lightSettings?.abnormal?.color ? '' : 'bg-orange-500';
            }
        }

        // Check frequency status
        // 1. Check Override first (Robust Multi-Key)
        const overrideTime = inspectedOverrides[marker.equipmentId] || (equipment && inspectedOverrides[equipment.id]);

        if (overrideTime) {
            // If overridden within last 24 hours, show GREEN
            if (Date.now() - overrideTime < 24 * 60 * 60 * 1000) {
                console.log('[getMarkerColor] OVERRIDE HIT for:', marker.equipmentId);
                return 'bg-emerald-500';
            }
        }

        const status = getFrequencyStatus(equipment, lightSettings);
        console.log('[getMarkerColor]', equipment.name, '- lastInspectedDate:', equipment.lastInspectedDate, 'status:', status, 'renderKey:', renderKey);

        switch (status) {
            case 'PENDING': return 'bg-red-500';
            case 'CAN_INSPECT': return 'bg-yellow-400';
            case 'UNNECESSARY': return 'bg-emerald-500'; // Default Green (matches Editor)
            case 'COMPLETED': return 'bg-emerald-500'; // Green for Completed
            default: return 'bg-slate-400';
        }
    };

    const getMarkerStyle = (marker: EquipmentMarker): React.CSSProperties => {
        if (!marker.equipmentId) return {};

        const equipment = allEquipment.find(e => e.barcode === marker.equipmentId);

        // Check Override first (Robust Multi-Key)
        const overrideTime = inspectedOverrides[marker.equipmentId] || (equipment && inspectedOverrides[equipment.id]);
        if (overrideTime && Date.now() - overrideTime < 24 * 60 * 60 * 1000) {
            // Force Green/Completed Color
            // DEBUG: Add Yellow Border to Confirm Logic Hit
            return {
                backgroundColor: lightSettings?.green?.color || '#10b981'
            };
        }

        if (!equipment) return {};

        // Check abnormal first (LATEST Only)
        const relevantReports = reports
            .filter(r => (r.items || []).some(i => i.equipmentId === equipment.id))
            .sort((a, b) => b.date - a.date);

        if (relevantReports.length > 0) {
            const latestItem = (relevantReports[0].items || []).find(i => i.equipmentId === equipment.id);
            if (latestItem?.status === InspectionStatus.Abnormal) {
                if (lightSettings?.abnormal?.color) return { backgroundColor: lightSettings.abnormal.color };
                // else fallback to class
            }
        }

        const status = getFrequencyStatus(equipment, lightSettings);
        if (status === 'PENDING' && lightSettings?.red?.color) return { backgroundColor: lightSettings.red.color };
        if (status === 'CAN_INSPECT' && lightSettings?.yellow?.color) return { backgroundColor: lightSettings.yellow.color };
        if (status === 'UNNECESSARY' && lightSettings?.green?.color) return { backgroundColor: lightSettings.green.color };
        if (status === 'COMPLETED' && lightSettings?.green?.color) return { backgroundColor: lightSettings.green.color };

        return {};
    };

    if (!isOpen) return null;

    // Map Selection View
    if (viewMode === 'SELECT') {
        return (
            <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
                {/* Header */}
                <div className="bg-white border-b p-4 flex items-center justify-between">
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-900">{t('selectMap')}</h2>
                    <div className="w-10" /> {/* Spacer */}
                </div>

                {/* Maps Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {maps.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <p>{t('noMapsAvailable')}</p>
                            <p className="text-sm mt-2">{t('createMapInEditorFirst')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                            {maps.map(map => (
                                <button
                                    key={map.id}
                                    onClick={() => handleMapSelect(map)}
                                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all active:scale-95"
                                >
                                    <div className="aspect-video bg-slate-100 relative">
                                        <img
                                            src={map.imageUrl}
                                            alt={map.name}
                                            className="w-full h-full object-contain"
                                        />
                                        <div className="absolute top-2 right-2 bg-slate-700 text-white px-2 py-1 rounded-full text-xs font-bold">
                                            {map.markers.length}{t('markersCountSuffix')}
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-bold text-slate-800">{map.name}</h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {t('updated')}: {new Date(map.updatedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Inspection View
    return (
        <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b p-4 flex items-center justify-between z-10 relative shadow-sm">
                <button onClick={() => setViewMode('SELECT')} className="p-2 hover:bg-slate-100 rounded-full transition-colors font-bold text-slate-600 flex items-center gap-2">
                    <ArrowLeft className="w-6 h-6" />
                    <span className="text-sm">{t('backToList')}</span>
                </button>
                <h2 className="text-lg font-bold truncate max-w-[200px] text-slate-900">{currentMap?.name}</h2>
                <div className="w-10"></div> {/* Spacer for center alignment balance */}
            </div>

            <CustomAlertModal
                isOpen={alertConfig.isOpen}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onConfirm={alertConfig.onConfirm}
                secondaryText={alertConfig.secondaryText}
                onSecondary={alertConfig.onSecondary}
                onCancel={alertConfig.onCancel || (() => setAlertConfig(prev => ({ ...prev, isOpen: false })))}
            />

            {/* 羅盤方位校準彈窗 (方案 B：極簡一鍵對齊，完全不用看角度) */}
            {showCalibrationModal && (
                <div
                    className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setShowCalibrationModal(false)}
                >
                    <div
                        className="bg-slate-900 text-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border-2 border-slate-700 animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                            <div className="flex items-center gap-2">
                                <Compass className="w-5 h-5 text-amber-400" />
                                <h3 className="font-extrabold text-base text-white">一鍵對齊手機方位</h3>
                            </div>
                            <button
                                onClick={() => setShowCalibrationModal(false)}
                                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* 方案 B：核心超大單鍵對齊 */}
                        <div className="mb-5">
                            <p className="text-xs text-slate-300 leading-relaxed mb-3">
                                {nextTarget ? (
                                    <>人拿著手機，將<strong>手機頂端對準前方的【{nextTarget.eq.name}】</strong>，點擊下方大按鈕即可：</>
                                ) : (
                                    <>人拿著手機正對前方走廊，點擊下方大按鈕即可：</>
                                )}
                            </p>

                            <button
                                onClick={alignCompassToNextTarget}
                                className="w-full py-4 px-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-400 active:scale-95 text-white font-black rounded-2xl shadow-xl shadow-blue-500/30 border border-blue-400/40 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all"
                            >
                                <div className="flex items-center gap-2 text-base">
                                    <Crosshair className="w-5 h-5 text-amber-300 animate-pulse" />
                                    <span>🎯 朝向下一站，按我一鍵對齊！</span>
                                </div>
                                {nextTarget && (
                                    <span className="text-[11px] text-blue-200 font-normal">
                                        目標：{nextTarget.eq.name} ({nextTarget.eq.barcode})
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* 步長微調 */}
                        <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/60 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-300">每步前進距離：</span>
                                <span className="font-mono font-bold text-emerald-400 text-xs">{stepSizePercent}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        const next = Math.max(0.2, Number((stepSizePercent - 0.15).toFixed(2)));
                                        setStepSizePercent(next);
                                        try { localStorage.setItem('pdr_step_size_percent', String(next)); } catch (e) { }
                                    }}
                                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-xs font-bold text-slate-200 rounded-xl cursor-pointer"
                                >
                                    - 步子小點
                                </button>
                                <button
                                    onClick={() => {
                                        setStepSizePercent(0.85);
                                        try { localStorage.setItem('pdr_step_size_percent', '0.85'); } catch (e) { }
                                    }}
                                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-[11px] font-bold text-slate-400 rounded-xl cursor-pointer"
                                >
                                    預設
                                </button>
                                <button
                                    onClick={() => {
                                        const next = Math.min(3.0, Number((stepSizePercent + 0.15).toFixed(2)));
                                        setStepSizePercent(next);
                                        try { localStorage.setItem('pdr_step_size_percent', String(next)); } catch (e) { }
                                    }}
                                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-xs font-bold text-slate-200 rounded-xl cursor-pointer"
                                >
                                    + 步子大點
                                </button>
                            </div>
                        </div>

                        {/* 恢復預設角度 */}
                        <button
                            onClick={() => {
                                updateCompassOffset(0);
                                setLastCalibrationMsg('已重設為原始羅盤朝向');
                                setTimeout(() => setShowCalibrationModal(false), 500);
                            }}
                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-700/60"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            恢復預設方位角 (歸零)
                        </button>
                    </div>
                </div>
            )}

            {/* Map Container */}
            <div className="flex-1 overflow-hidden relative bg-slate-800 touch-none cursor-move select-none">
                <div
                    ref={imageContainerRef}
                    className="absolute inset-0 flex items-center justify-center transform-gpu will-change-transform"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp} // Stop dragging if cursor leaves
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                >
                    {currentMap && (
                        <div className="relative shadow-2xl inline-block pointer-events-none">
                            {/* Re-enable pointer events for markers so they can be clicked */}
                            <img
                                src={currentMap.imageUrl}
                                alt={currentMap.name}
                                className="max-w-[95vw] max-h-[80vh] w-auto h-auto object-contain pointer-events-auto"
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                            />

                            {/* 方案 C: 導航動態虛線路線 (連接當前所在位置與下一個推薦目標) */}
                            {isNavActive && userLocation && nextTarget && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                                    <defs>
                                        <linearGradient id="navLineGrad" x1={`${userLocation.x}%`} y1={`${userLocation.y}%`} x2={`${nextTarget.marker.x}%`} y2={`${nextTarget.marker.y}%`} gradientUnits="userSpaceOnUse">
                                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.9" />
                                        </linearGradient>
                                    </defs>
                                    <line
                                        x1={`${userLocation.x}%`}
                                        y1={`${userLocation.y}%`}
                                        x2={`${nextTarget.marker.x}%`}
                                        y2={`${nextTarget.marker.y}%`}
                                        stroke="url(#navLineGrad)"
                                        strokeWidth="3.5"
                                        strokeDasharray="6 4"
                                        strokeLinecap="round"
                                    >
                                        <animate attributeName="stroke-dashoffset" from="40" to="0" dur="1s" repeatCount="indefinite" />
                                    </line>
                                </svg>
                            )}
                            {/* Markers */}
                            {currentMap.markers.map(marker => {
                                // 所有標註點均可點擊（由 handleMarkerClick 統一處理未到期強制檢查、已完成提醒或一般檢查）
                                const equipment = allEquipment.find(e => e.barcode === marker.equipmentId || e.id === marker.equipmentId);
                                const isInteractable = !!marker.equipmentId;

                                return (
                                    <button
                                        key={`${marker.id}-${renderKey}`}
                                        onClick={() => handleMarkerClick(marker)}
                                        disabled={!isInteractable}
                                        // Optimized Sizes for RWD (Matches Editor)
                                        // Mobile: w-3 h-3 (12px), text-[6px]
                                        // Tablet: w-4 h-4 (16px), text-[8px]
                                        // Desktop: w-6 h-6 (24px), text-[10px]
                                        className={`absolute w-3 h-3 sm:w-4 sm:h-4 md:w-6 md:h-6 rounded-full flex items-center justify-center text-white font-bold text-[6px] sm:text-[8px] md:text-[10px] shadow-sm transition-transform pointer-events-auto 
                                            ${getMarkerColor(marker)}
                                            ${isInteractable ? 'hover:scale-125 hover:z-50 cursor-pointer' : 'cursor-default opacity-80'}
                                        `}
                                        style={{
                                            left: `${marker.x}%`,
                                            top: `${marker.y}%`,
                                            // CRITICAL: Inverse Scale Logic (1 / zoom)
                                            // This cancels out the parent's zoom scale, keeping marker constant physics size
                                            transform: `translate(-50%, -50%) scale(${1 / zoom}) rotate(${-rotation}deg)`,
                                            ...getMarkerStyle(marker)
                                        }}
                                    >
                                        {marker.equipmentId}
                                    </button>
                                );
                            })}

                            {/* 方案 C: 當前巡檢位置紅點 + 手機實體羅盤視角光錐 */}
                            {isNavActive && userLocation && (
                                <div
                                    className="absolute pointer-events-none z-30 transition-all duration-300"
                                    style={{
                                        left: `${userLocation.x}%`,
                                        top: `${userLocation.y}%`,
                                        transform: `translate(-50%, -50%) scale(${1 / zoom})`
                                    }}
                                >
                                    {/* 朝向光錐（支援低通平滑濾波與目標鎖定模式，徹底防抖） */}
                                    <div
                                        className="absolute -inset-12 flex items-center justify-center transition-transform duration-200 ease-out pointer-events-none"
                                        style={{
                                            transform: `rotate(${activeVisionAngle}deg)`
                                        }}
                                    >
                                        {/* 扇形探索光錐 */}
                                        <div
                                            className="w-20 h-24 -top-12 absolute opacity-70 pointer-events-none"
                                            style={{
                                                background: 'radial-gradient(ellipse at 50% 100%, rgba(239, 68, 68, 0.45) 0%, rgba(239, 68, 68, 0) 70%)',
                                                clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)'
                                            }}
                                        />
                                        {/* 頂端方向導引箭頭 */}
                                        <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-red-600 -top-4 absolute drop-shadow-md" />
                                    </div>

                                    {/* 雷達波紋動畫 (Radar Ping) */}
                                    <div className="absolute -inset-3.5 rounded-full bg-red-500/40 animate-ping pointer-events-none" />
                                    <div className="absolute -inset-2 rounded-full bg-red-500/25 animate-pulse pointer-events-none" />

                                    {/* 實體中心紅點 (Google Maps 風格 - 已移除遮擋路徑的下方黑色標籤) */}
                                    <div className="relative w-5 h-5 rounded-full bg-red-600 border-2 border-white shadow-xl flex items-center justify-center ring-2 ring-red-400">
                                        <div className="w-2 h-2 rounded-full bg-white shadow-inner" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 方案 C: 頂部導航資訊卡 (HUD) - 手機板 RWD 響應式與一鍵收合優化 */}
            {isNavActive && userLocation && (
                isHudCollapsed ? (
                    /* 手機收合狀態：僅佔用極小頂部單行空間，讓手機巡檢能完整看清圖面 */
                    <div
                        onClick={() => setIsHudCollapsed(false)}
                        className="absolute top-2 left-2 right-2 sm:left-auto sm:right-4 sm:w-[380px] z-40 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl p-2 px-3 shadow-xl border border-slate-700/80 flex items-center justify-between gap-2 cursor-pointer active:scale-95 transition-all animate-in fade-in select-none"
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                            <span className="text-xs font-bold text-white truncate max-w-[90px] sm:max-w-[110px]">{userLocation.name}</span>
                            {nextTarget && (
                                <>
                                    <span className="text-slate-500 text-xs shrink-0">➔</span>
                                    <span className="text-xs font-bold text-amber-300 truncate max-w-[100px] sm:max-w-[120px]">{nextTarget.eq.name}</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {isPdrActive && (
                                <span className="text-[10px] font-mono text-emerald-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-700">
                                    👣 {stepCount}步
                                </span>
                            )}
                            <span className="text-[11px] text-blue-400 font-bold flex items-center gap-0.5 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/30">
                                展開 <ChevronDown className="w-3 h-3" />
                            </span>
                        </div>
                    </div>
                ) : (
                    /* 手機展開狀態：完全相容 360px+ 手機螢幕不溢出不擠壓 */
                    <div className="absolute top-2 left-2 right-2 sm:top-4 sm:left-auto sm:right-4 sm:w-[400px] z-40 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 shadow-2xl border border-slate-700/80 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Header 頂部列 */}
                        <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-800 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center shrink-0">
                                    <Navigation className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                                </div>
                                <span className="font-extrabold text-xs sm:text-sm text-white truncate">實時導航</span>
                                <button
                                    onClick={() => setNavHeadingMode(prev => prev === 'COMPASS' ? 'TARGET' : 'COMPASS')}
                                    className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                                        navHeadingMode === 'TARGET'
                                            ? 'bg-blue-600/30 text-blue-300 border-blue-400/60 shadow-sm'
                                            : 'bg-emerald-600/30 text-emerald-300 border-emerald-400/60 shadow-sm'
                                    }`}
                                    title={navHeadingMode === 'TARGET' ? '目前為【鎖定下一站目標】(不飄移)，點擊切換為【實體羅盤隨身轉向】' : '目前為【實體羅盤隨身轉向】，點擊切換為【鎖定下一站目標】'}
                                >
                                    {navHeadingMode === 'TARGET' ? (
                                        <>
                                            <Crosshair className="w-3 h-3 text-blue-400" />
                                            <span>鎖定目標</span>
                                        </>
                                    ) : (
                                        <>
                                            <Compass className="w-3 h-3 text-emerald-400" />
                                            <span>羅盤轉向 {compassHeading !== null ? `${((compassHeading + compassOffset - rotation + 360) % 360)}°` : ''}</span>
                                        </>
                                    )}
                                </button>
                                {navHeadingMode === 'COMPASS' && compassHeading === null && (
                                    <button
                                        onClick={requestSensors}
                                        className="text-[10px] sm:text-xs bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1 shrink-0 animate-pulse cursor-pointer"
                                        title="點擊啟用手機羅盤與計步感應"
                                    >
                                        <Compass className="w-3 h-3" />
                                        啟用感應
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => setShowCalibrationModal(true)}
                                    className="text-[10px] sm:text-xs bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-300 border border-amber-400/50 font-bold px-2 py-0.5 rounded-lg shadow-sm flex items-center gap-0.5 cursor-pointer"
                                    title="開啟方位校準與步長設定面板"
                                >
                                    <Sliders className="w-3 h-3 text-amber-400" />
                                    校準
                                </button>
                                <button
                                    onClick={() => setIsHudCollapsed(true)}
                                    className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                    title="收合為精簡頂部條"
                                >
                                    <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setIsNavActive(false)}
                                    className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                    title="關閉導航卡"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* PDR 行走計步與即時前進狀態列 */}
                        {isPdrActive && (
                            <div className="flex items-center justify-between gap-2 mb-2 p-1.5 bg-slate-800/80 rounded-xl border border-slate-700/70">
                                <div className={`flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-lg transition-all ${
                                    isStepPulsing
                                        ? 'bg-emerald-500/30 text-emerald-300 font-bold ring-2 ring-emerald-400 scale-105'
                                        : 'text-slate-200'
                                }`}>
                                    <Footprints className={`w-3.5 h-3.5 shrink-0 ${isStepPulsing ? 'text-emerald-400 animate-bounce' : 'text-emerald-400'}`} />
                                    <span className="text-[11px] font-bold text-slate-300 shrink-0">步伐推算：</span>
                                    <span className="text-sm sm:text-base font-black text-white font-mono">{stepCount}</span>
                                    <span className="text-[10px] text-slate-400">步</span>
                                </div>

                                <button
                                    onClick={() => triggerStep()}
                                    className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 active:scale-95 text-white font-bold rounded-lg text-[10px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer shadow shrink-0"
                                    title="點擊模擬前進一步 (亦可拿手機實體走路測試)"
                                >
                                    <Activity className="w-3 h-3" />
                                    模擬走1步
                                </button>
                            </div>
                        )}

                        {/* 抵達設備校準歸零提示 */}
                        {lastCalibrationMsg && (
                            <div className="mb-2 p-1.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in duration-150 shadow-sm">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="truncate">{lastCalibrationMsg}</span>
                            </div>
                        )}

                        {/* 當前位置與下一推薦目標卡片 */}
                        <div className="space-y-1.5">
                            {/* 當前所在卡片 */}
                            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ring-2 ring-red-400/50 shrink-0" />
                                    <span className="text-[11px] sm:text-xs font-bold text-slate-300">目前所在：</span>
                                </div>
                                <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[190px] sm:max-w-[240px] drop-shadow-sm">{userLocation.name}</span>
                            </div>

                            {/* 下一個目標推薦卡片 */}
                            {nextTarget ? (
                                <div className="p-2 sm:p-2.5 bg-gradient-to-r from-blue-950/70 via-slate-800/90 to-blue-900/50 border border-blue-500/40 rounded-xl flex items-center justify-between gap-2 shadow-md">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[10px] font-bold text-blue-300 flex items-center gap-1 mb-0.5">
                                            <span>👉 下一站推薦：</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-black text-amber-300 text-xs sm:text-sm drop-shadow-sm truncate max-w-[130px] sm:max-w-[180px]">
                                                {nextTarget.eq.name}
                                            </span>
                                            <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                                                {nextTarget.eq.barcode}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => focusMarker(nextTarget.marker.x, nextTarget.marker.y)}
                                        className="px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl text-[11px] sm:text-xs flex items-center gap-1 shadow-md shadow-blue-500/30 transition-all shrink-0 cursor-pointer"
                                        title="在畫面中聚焦此設備標籤"
                                    >
                                        <Crosshair className="w-3.5 h-3.5 shrink-0" />
                                        <span>聚焦</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="p-2 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-400 font-bold flex items-center gap-1.5 text-xs">
                                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>地圖上所有設備皆已巡檢完成！</span>
                                </div>
                            )}
                        </div>
                    </div>
                )
            )}

            {/* Floating Controls Toolbar (RWD Optimized) */}
            <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-2 bg-white/90 backdrop-blur shadow-2xl rounded-full px-4 py-2 sm:px-4 sm:py-2 border border-slate-200 z-40 max-w-[98vw] overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden">
                <button
                    onClick={() => {
                        setIsNavActive(prev => !prev);
                        if (!isNavActive && userLocation) {
                            focusMarker(userLocation.x, userLocation.y);
                        }
                        if (compassHeading === null) {
                            requestSensors();
                        }
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-90 flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        isNavActive
                            ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                    title="切換巡檢導航模式"
                >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>導航</span>
                </button>
                <div className="w-px h-5 sm:h-4 bg-slate-300 mx-1 shrink-0"></div>
                <button
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                    className="p-2 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors active:scale-90"
                    title={t('zoomOut')}
                >
                    <ZoomOut className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <div className="w-px h-5 sm:h-4 bg-slate-300 mx-1 shrink-0"></div>
                <span className="text-sm sm:text-xs font-bold text-slate-500 min-w-[3.5rem] sm:min-w-[3rem] text-center select-none shrink-0">
                    {Math.round(zoom * 100)}%
                </span>
                <div className="w-px h-5 sm:h-4 bg-slate-300 mx-1 shrink-0"></div>
                <button
                    onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                    className="p-2 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors active:scale-90"
                    title={t('zoomIn')}
                >
                    <ZoomIn className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <div className="w-px h-5 sm:h-4 bg-slate-300 mx-1 shrink-0"></div>
                <button
                    onClick={() => setRotation(r => (r + 90) % 360)}
                    className="p-2 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors active:scale-90"
                    title={t('rotate')}
                >
                    <RotateCw className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <div className="w-px h-5 sm:h-4 bg-slate-300 mx-1 shrink-0"></div>
                <button
                    onClick={handleResetView}
                    className="px-4 py-2 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-sm sm:text-xs font-bold text-slate-600 transition-colors shrink-0"
                >
                    {t('resetView')}
                </button>
            </div>

            {/* Barcode Input Modal */}
            <BarcodeInputModal
                isOpen={isScanningBarcode}
                expectedBarcode={selectedMarker?.equipmentId || ''}
                onScan={handleBarcodeValidated}
                onCancel={() => {
                    setIsScanningBarcode(false);
                    setSelectedMarker(null);
                }}
            />

            {/* Check Items Modal */}
            {currentEquipment && (
                <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">檢查: {currentEquipment.name}</h3>
                                <p className="text-xs text-slate-500">{currentEquipment.barcode}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setCurrentEquipment(null);
                                    setSelectedMarker(null);
                                }}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Check Items */}
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-bold text-slate-700 flex items-center">
                                    <ClipboardCheck className="w-4 h-4 mr-1.5" /> {t('checkItemsList')}
                                </label>
                            </div>
                            {currentEquipment.checkItems.map(item => (
                                <div key={item.id} className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700">{item.name}</label>
                                    {item.inputType === 'boolean' ? (
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleCheckItemChange(item.id, true)}
                                                className={`flex-1 py-3 rounded-xl font-bold transition-all ${checkResults[item.id] === true
                                                    ? 'bg-green-600 text-white shadow-lg'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    }`}
                                            >
                                                <CheckCircle className="w-5 h-5 inline mr-2" />
                                                正常
                                            </button>
                                            <button
                                                onClick={() => handleCheckItemChange(item.id, false)}
                                                className={`flex-1 py-3 rounded-xl font-bold transition-all ${checkResults[item.id] === false
                                                    ? 'bg-red-600 text-white shadow-lg'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    }`}
                                            >
                                                <AlertTriangle className="w-5 h-5 inline mr-2" />
                                                異常
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={checkResults[item.id] || ''}
                                                onChange={(e) => handleCheckItemChange(item.id, parseFloat(e.target.value))}
                                                className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900"
                                                placeholder="輸入數值"
                                            />
                                            {item.unit && <span className="text-slate-600 font-medium">{item.unit}</span>}
                                        </div>
                                    )}
                                    {item.inputType === 'number' && item.thresholdMode && (
                                        <p className="text-xs text-slate-500">
                                            <span className="font-bold">{t('specRange')}</span>: {item.thresholdMode === 'range' ? `${item.val1} ~ ${item.val2}` : `${item.thresholdMode} ${item.val1}`}
                                        </p>
                                    )}
                                </div>
                            ))}

                            {/* Tag Management & Equipment Photo Row */}
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-slate-700 flex items-center">
                                        <Tag className="w-4 h-4 mr-2" /> 設備標籤
                                    </label>
                                    <button
                                        onClick={() => setShowTagInput(!showTagInput)}
                                        className={`p-1 rounded-lg transition-all ${showTagInput ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 hover:text-blue-500 hover:bg-blue-50'}`}
                                        title="新增標籤"
                                    >
                                        <Plus className={`w-4 h-4 transition-transform duration-300 ${showTagInput ? 'rotate-45' : ''}`} />
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2 min-h-[32px]">
                                    {inspectingTags.map((tag, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100 group/tag transition-all hover:bg-blue-100"
                                        >
                                            #{tag}
                                            <button
                                                onClick={() => setInspectingTags(prev => prev.filter((_, i) => i !== idx))}
                                                className="ml-1.5 p-0.5 rounded-full hover:bg-blue-200 text-blue-400 hover:text-blue-600 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                    {inspectingTags.length === 0 && !showTagInput && (
                                        <span className="text-xs text-slate-400 italic">{t('noTags')}</span>
                                    )}
                                </div>
                                {showTagInput && (
                                    <div className="relative animate-in slide-in-from-top-2 duration-200">
                                        <input
                                            type="text"
                                            value={tagInput}
                                            autoFocus
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const val = tagInput.trim();
                                                    if (val) {
                                                        const newTags = val.split(/[,，;\s]+/).map(t => t.trim()).filter(t => t !== '' && !inspectingTags.includes(t));
                                                        if (newTags.length > 0) {
                                                            setInspectingTags(prev => [...prev, ...newTags]);
                                                        }
                                                        setTagInput('');
                                                    }
                                                }
                                                if (e.key === 'Escape') {
                                                    setShowTagInput(false);
                                                }
                                            }}
                                            onBlur={() => {
                                                if (tagInput.trim()) {
                                                    const val = tagInput.trim();
                                                    const newTags = val.split(/[,，;\s]+/).map(t => t.trim()).filter(t => t !== '' && !inspectingTags.includes(t));
                                                    if (newTags.length > 0) {
                                                        setInspectingTags(prev => [...prev, ...newTags]);
                                                    }
                                                    setTagInput('');
                                                }
                                            }}
                                            placeholder={t('addTagPlaceholder')}
                                            className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-slate-300 mr-1">{t('enterToSubmit')}</span>
                                        </div>
                                    </div>
                                )}
                                </div>

                                {/* 設備照片縮圖（點選可放大） */}
                                {currentEquipment?.photoUrl && (
                                    <div className="shrink-0 flex flex-col items-center">
                                        <div
                                            onClick={() => setPreviewPhotoUrl(currentEquipment.photoUrl!)}
                                            className="relative group cursor-pointer w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-200 hover:border-purple-500 shadow-sm transition-all bg-slate-100"
                                            title="點擊放大查看設備照片"
                                        >
                                            <img
                                                src={currentEquipment.photoUrl}
                                                alt={currentEquipment.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                            />
                                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold gap-1">
                                                <Eye className="w-4 h-4 text-white" />
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-slate-400 mt-1 font-medium">點選放大</span>
                                    </div>
                                )}
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">{t('notes')}</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-slate-900"
                                    placeholder="填寫檢查備註..."
                                />
                            </div>

                            {/* Photos */}
                            {/* Photos section removed as per user request */}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                            <button
                                onClick={handleSubmit}
                                disabled={
                                    isSubmitting ||
                                    currentEquipment.checkItems.some(item =>
                                        item.inputType === 'number' &&
                                        (checkResults[item.id] === undefined || checkResults[item.id] === '')
                                    )
                                }
                                className="w-full py-3 bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        提交中...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        完成檢查
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Toast Notification */}
            {toastMsg && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-5 duration-300 w-max">
                    <div className={`${toastMsg.type === 'error' ? 'bg-red-600' : 'bg-slate-800'} text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-white/20 backdrop-blur-md`}>
                        {toastMsg.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5 text-emerald-400" />}
                        <span className="font-bold text-sm tracking-wide">{toastMsg.text}</span>
                    </div>
                </div>
            )}

            {/* 設備照片放大預覽燈箱 (Lightbox) */}
            {previewPhotoUrl && (
                <div
                    onClick={() => setPreviewPhotoUrl(null)}
                    className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
                    >
                        <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                            <span className="text-sm font-bold flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-purple-400" />
                                {currentEquipment?.name} ({currentEquipment?.barcode}) - 設備實體照片
                            </span>
                            <button
                                onClick={() => setPreviewPhotoUrl(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-3 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
                            <img
                                src={previewPhotoUrl}
                                alt="設備照片放大"
                                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
                            />
                        </div>
                        <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                            <span>點擊背景或右上角 ✕ 關閉</span>
                            <button
                                onClick={() => setPreviewPhotoUrl(null)}
                                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors"
                            >
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapViewInspection;
