import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowLeft, ZoomIn, ZoomOut, RotateCw, CheckCircle, AlertTriangle, Save, Upload, Camera, Trash2 } from 'lucide-react';
import { UserProfile, EquipmentMap, EquipmentMarker, EquipmentDefinition, InspectionReport, InspectionItem, InspectionStatus, CustomCheckItem, LightSettings } from '../types';
import { StorageService } from '../services/storageService';
import BarcodeInputModal from './BarcodeInputModal';
import { getFrequencyStatus } from '../utils/inspectionUtils';
import { useLanguage } from '../contexts/LanguageContext';

interface MapViewInspectionProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
}

const MapViewInspection: React.FC<MapViewInspectionProps> = ({ user, isOpen, onClose }) => {
    const { t } = useLanguage();
    // Map Selection State
    const [maps, setMaps] = useState<EquipmentMap[]>([]);
    const [currentMap, setCurrentMap] = useState<EquipmentMap | null>(null);
    const [viewMode, setViewMode] = useState<'SELECT' | 'INSPECT'>('SELECT');

    // Inspection State
    const [selectedMarker, setSelectedMarker] = useState<EquipmentMarker | null>(null);
    const [isScanningBarcode, setIsScanningBarcode] = useState(false);
    const [allEquipment, setAllEquipment] = useState<EquipmentDefinition[]>([]);
    const [currentEquipment, setCurrentEquipment] = useState<EquipmentDefinition | null>(null);
    const [lightSettings, setLightSettings] = useState<LightSettings | null>(null);
    const [reports, setReports] = useState<InspectionReport[]>([]);

    // Check Items State
    const [checkResults, setCheckResults] = useState<Record<string, any>>({});
    const [notes, setNotes] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMsg({ text, type });
        setTimeout(() => setToastMsg(null), 3000);
    };

    const [inspectedOverrides, setInspectedOverrides] = useState<Record<string, number>>({});
    const [renderKey, setRenderKey] = useState(0);

    // Transform State
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    const imageContainerRef = useRef<HTMLDivElement>(null);

    // Load maps and equipment on mount
    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, user.uid]);

    const loadData = async () => {
        try {
            const [mapsData, equipmentData, settings, reportsData] = await Promise.all([
                StorageService.getEquipmentMaps(user.uid),
                StorageService.getEquipmentDefinitions(user.uid),
                StorageService.getLightSettings(user.uid),
                StorageService.getReports(user.uid, true)
            ]);
            setMaps(mapsData);
            setAllEquipment(equipmentData);
            setLightSettings(settings);
            setReports(reportsData);
        } catch (error) {
            console.error('Failed to load data:', error);
            alert('載入資料失敗，請重試');
        }
    };

    const handleMapSelect = (map: EquipmentMap) => {
        setCurrentMap(map);
        setViewMode('INSPECT');
        setRotation(map.rotation || 0);
    };

    const handleMarkerClick = (marker: EquipmentMarker) => {
        if (!marker.equipmentId) {
            alert('此標註點尚未綁定設備');
            return;
        }
        setSelectedMarker(marker);
        setIsScanningBarcode(true);
    };

    const handleBarcodeValidated = async (barcode: string) => {
        setIsScanningBarcode(false);

        // Find equipment by barcode
        const equipment = allEquipment.find(e => e.barcode === barcode);
        if (!equipment) {
            alert(`找不到設備編號 ${barcode}`);
            setSelectedMarker(null);
            return;
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

        const status = determineStatus();

        // Validate abnormal notes
        if (status === InspectionStatus.Abnormal && !notes.trim()) {
            alert('檢查結果異常，請務必填寫異常說明！');
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
                // Photo upload removed
                lastUpdated: now
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
                const existingReportIndex = prev.findIndex(r =>
                    r.buildingName === currentMap.name && r.date >= today
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
                        buildingName: currentMap.name,
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
            let report = reports.find(r => r.buildingName === currentMap.name && r.date >= new Date().setHours(0, 0, 0, 0));
            if (!report) {
                report = {
                    id: `report_${now}`,
                    userId: user.uid,
                    buildingName: currentMap.name,
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

            // Save report to Firebase
            if (report.id.startsWith('report_')) {
                const newId = await StorageService.saveReport(report, user.uid);
                // Update local ID if needed, but optimistic update covers specific usage
            } else {
                await StorageService.updateReport(report);
            }

            // Update equipment definition in Firebase
            await StorageService.updateEquipmentDefinition({
                id: currentEquipment.id,
                lastInspectedDate: now,
                updatedAt: now
            });

            // Handle Abnormal Records
            if (status === InspectionStatus.Abnormal) {
                const abnormalItems = currentEquipment.checkItems
                    .filter(item => {
                        const value = checkResults[item.id];
                        if (item.inputType === 'boolean') return value === false;
                        if (item.inputType === 'number') {
                            const num = parseFloat(String(value));
                            if (!isNaN(num) && item.thresholdMode) {
                                if (item.thresholdMode === 'range') return num < (item.val1 || 0) || num > (item.val2 || 0);
                                if (item.thresholdMode === 'gt') return num <= (item.val1 || 0);
                                if (item.thresholdMode === 'gte') return num < (item.val1 || 0);
                                if (item.thresholdMode === 'lt') return num >= (item.val1 || 0);
                                if (item.thresholdMode === 'lte') return num > (item.val1 || 0);
                            }
                        }
                        return false;
                    })
                    .map(item => item.name);

                await StorageService.saveAbnormalRecord({
                    userId: user.uid,
                    equipmentId: currentEquipment.id,
                    equipmentName: currentEquipment.name,
                    barcode: currentEquipment.barcode,
                    siteName: currentEquipment.siteName,
                    buildingName: currentEquipment.buildingName,
                    inspectionDate: now,
                    abnormalItems: abnormalItems.length > 0 ? abnormalItems : ['未指定項目'],
                    abnormalReason: notes,
                    status: 'pending',
                    createdAt: now,
                    updatedAt: now
                }, user.uid);
            }

            console.log('[handleSubmit] Save Complete');

            // Refresh reports to get the latest status (including items)
            const updatedReports = await StorageService.getReports(user.uid, true);
            setReports(updatedReports);

            showToast('✅ 提交成功！');

        } catch (error) {
            console.error('[handleSubmit] Error:', error);
            alert(`提交失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
            // Note: We deliberately do NOT revert optimistic updates here to avoid UI flickering, 
            // unless users manually refresh, assuming retry might be possible or it's a transient network issue.
            // But realistically, user will just try again.
        } finally {
            setTimeout(() => {
                setCurrentEquipment(null);
                setSelectedMarker(null);
                setCheckResults({});
                setNotes('');
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
                            <p>尚無地圖</p>
                            <p className="text-sm mt-2">請先在地圖編輯器中創建地圖</p>
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
                                            {map.markers.length} 個標註點
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
                    <span className="text-sm">返回列表</span>
                </button>
                <h2 className="text-lg font-bold truncate max-w-[200px] text-slate-900">{currentMap?.name}</h2>
                <div className="w-10"></div> {/* Spacer for center alignment balance */}
            </div>

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
                                className="max-w-full max-h-full pointer-events-auto"
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                            />
                            {/* Markers */}
                            {currentMap.markers.map(marker => {
                                // Determine status for interaction logic
                                let isInteractable = true;
                                const equipment = allEquipment.find(e => e.barcode === marker.equipmentId);

                                if (equipment) {
                                    // 1. Check Override (Optimistic Completed)
                                    const overrideTime = inspectedOverrides[marker.equipmentId] || inspectedOverrides[equipment.id];
                                    const isOverridden = overrideTime && (Date.now() - overrideTime < 24 * 60 * 60 * 1000);

                                    // 2. Check Real Status
                                    const freqStatus = getFrequencyStatus(equipment, lightSettings);

                                    // Disable if Completed (Real or Optimistic) or Unnecessary
                                    // Exception: If it is Abnormal, we might still want to allow clicking? 
                                    // User said "Completed" or "Unnecessary" cannot be clicked.
                                    // Usually "Abnormal" shows as Orange/Red, distinct from Completed/Unnecessary (Green).
                                    // We assume Abnormal should still be clickable if needed, but if the status *category* is Completed, it overrides.
                                    // Actually, let's stick to the color logic: Green = No Click.

                                    if (isOverridden || freqStatus === 'COMPLETED' || freqStatus === 'UNNECESSARY') {
                                        isInteractable = false;
                                    }
                                }

                                return (
                                    <button
                                        key={`${marker.id}-${renderKey}`}
                                        onClick={() => isInteractable && handleMarkerClick(marker)}
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
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Controls Toolbar (RWD Optimized) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-0.5 sm:gap-2 bg-white/90 backdrop-blur shadow-xl rounded-full px-1.5 py-1 sm:px-4 sm:py-2 border border-slate-200 z-40 max-w-[98vw] overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden">
                <button
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                    className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors active:scale-90"
                    title="縮小"
                >
                    <ZoomOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="w-px h-3 sm:h-4 bg-slate-300 mx-0.5 shrink-0"></div>
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 min-w-[2.5rem] sm:min-w-[3rem] text-center select-none shrink-0">
                    {Math.round(zoom * 100)}%
                </span>
                <div className="w-px h-3 sm:h-4 bg-slate-300 mx-0.5 shrink-0"></div>
                <button
                    onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                    className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors active:scale-90"
                    title="放大"
                >
                    <ZoomIn className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="w-px h-3 sm:h-4 bg-slate-300 mx-0.5 shrink-0"></div>
                <button
                    onClick={() => setRotation(r => (r + 90) % 360)}
                    className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors active:scale-90"
                    title="旋轉"
                >
                    <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="w-px h-3 sm:h-4 bg-slate-300 mx-0.5 shrink-0"></div>
                <button
                    onClick={handleResetView}
                    className="px-1.5 py-1 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-[10px] sm:text-xs font-bold text-slate-600 transition-colors shrink-0"
                >
                    重置
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
                                            標準: {item.thresholdMode === 'range' ? `${item.val1} ~ ${item.val2}` : `${item.thresholdMode} ${item.val1}`}
                                        </p>
                                    )}
                                </div>
                            ))}

                            {/* Notes */}
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">備註</label>
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
                                disabled={isSubmitting}
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
        </div>
    );
};

export default MapViewInspection;
