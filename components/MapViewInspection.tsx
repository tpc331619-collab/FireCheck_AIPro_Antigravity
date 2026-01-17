import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowLeft, ZoomIn, ZoomOut, RotateCw, CheckCircle, AlertTriangle, Save, Upload, Camera, Trash2 } from 'lucide-react';
import { UserProfile, EquipmentMap, EquipmentMarker, EquipmentDefinition, InspectionReport, InspectionItem, InspectionStatus, CustomCheckItem, LightSettings } from '../types';
import { StorageService } from '../services/storageService';
import BarcodeInputModal from './BarcodeInputModal';
import { getFrequencyStatus } from '../utils/inspectionUtils';

interface MapViewInspectionProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
}

const MapViewInspection: React.FC<MapViewInspectionProps> = ({ user, isOpen, onClose }) => {
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
    const [photos, setPhotos] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Transform State
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

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
                StorageService.getReports(user.uid)
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
        setPhotos([]);
    };

    const handleCheckItemChange = (itemId: string, value: any) => {
        setCheckResults(prev => ({ ...prev, [itemId]: value }));
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (file.size > 5 * 1024 * 1024) {
            alert('照片大小不可超過 5MB');
            return;
        }

        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            setPhotos(prev => [...prev, base64]);
        } catch (error) {
            console.error('Photo upload failed:', error);
            alert('照片上傳失敗');
        }
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

            // Build check results snapshot
            const checkResultsSnapshot = currentEquipment.checkItems.map(item => {
                const result: any = {
                    name: item.name,
                    value: checkResults[item.id]
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

            // Create inspection item
            const inspectionItem: InspectionItem = {
                id: `item_${now}`,
                equipmentId: currentEquipment.id,
                type: currentEquipment.equipmentType || 'Custom',
                name: currentEquipment.name,
                barcode: currentEquipment.barcode,
                checkFrequency: currentEquipment.checkFrequency,
                location: `${currentEquipment.siteName} - ${currentEquipment.buildingName}`,
                status: status,
                checkPoints: checkResults,
                checkResults: checkResultsSnapshot,
                notes: notes,
                photoUrl: photos[0], // Use first photo
                lastUpdated: now
            };

            // Find or create report for this map/building
            let report = reports.find(r => r.buildingName === currentMap.name && r.date >= new Date().setHours(0, 0, 0, 0));

            if (!report) {
                report = {
                    id: `report_${now}`,
                    buildingName: currentMap.name,
                    inspectorName: user.displayName || 'Guest',
                    date: now,
                    items: [],
                    overallStatus: 'In Progress'
                };
            }

            // Add or update item in report
            const existingIndex = report.items.findIndex(i => i.equipmentId === currentEquipment.id);
            if (existingIndex >= 0) {
                report.items[existingIndex] = inspectionItem;
            } else {
                report.items.push(inspectionItem);
            }

            // Save report
            if (report.id.startsWith('report_')) {
                const newId = await StorageService.saveReport(report, user.uid);
                report.id = newId;
            } else {
                await StorageService.updateReport(report);
            }

            // Update equipment last inspected date
            await StorageService.updateEquipmentDefinition({
                id: currentEquipment.id,
                lastInspectedDate: now,
                updatedAt: now
            });

            // Update local equipment state immediately for instant marker update
            setAllEquipment(prev => prev.map(e =>
                e.id === currentEquipment.id
                    ? { ...e, lastInspectedDate: now, updatedAt: now }
                    : e
            ));

            // Update local reports state immediately for instant marker update
            setReports(prev => {
                const existingIndex = prev.findIndex(r => r.id === report!.id);
                if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = report!;
                    return updated;
                } else {
                    return [...prev, report!];
                }
            });

            // If abnormal, save to abnormal records
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

            // Reload data to refresh marker status
            await loadData();

            // Reset state
            setCurrentEquipment(null);
            setSelectedMarker(null);
            setCheckResults({});
            setNotes('');
            setPhotos([]);

            alert(`✅ 檢查完成！\n\n設備：${currentEquipment.name}\n狀態：${status === InspectionStatus.Normal ? '正常' : '異常'}`);

        } catch (error) {
            console.error('Submit failed:', error);
            alert('提交失敗，請重試');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getMarkerColor = (marker: EquipmentMarker): string => {
        if (!marker.equipmentId) return 'bg-slate-400';

        const equipment = allEquipment.find(e => e.barcode === marker.equipmentId);
        if (!equipment) return 'bg-slate-400';

        // Check if abnormal in recent reports
        const isAbnormal = reports.some(r =>
            r.items.some(i => i.equipmentId === equipment.id && i.status === InspectionStatus.Abnormal)
        );
        if (isAbnormal) return 'bg-orange-500 animate-pulse';

        // Check frequency status
        const status = getFrequencyStatus(equipment, lightSettings);
        switch (status) {
            case 'PENDING': return 'bg-red-500 animate-pulse';
            case 'CAN_INSPECT': return 'bg-yellow-400 animate-pulse';
            case 'UNNECESSARY': return 'bg-emerald-500 animate-pulse';
            case 'COMPLETED': return 'bg-emerald-500';
            default: return 'bg-slate-400';
        }
    };

    const getMarkerStyle = (marker: EquipmentMarker): React.CSSProperties => {
        if (!marker.equipmentId) return {};

        const equipment = allEquipment.find(e => e.barcode === marker.equipmentId);
        if (!equipment) return {};

        const status = getFrequencyStatus(equipment, lightSettings);
        if (status === 'PENDING' && lightSettings?.red?.color) return { backgroundColor: lightSettings.red.color };
        if (status === 'CAN_INSPECT' && lightSettings?.yellow?.color) return { backgroundColor: lightSettings.yellow.color };
        if ((status === 'UNNECESSARY' || status === 'COMPLETED') && lightSettings?.green?.color) return { backgroundColor: lightSettings.green.color };

        return {};
    };

    if (!isOpen) return null;

    // Map Selection View
    if (viewMode === 'SELECT') {
        return (
            <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
                {/* Header */}
                <div className="bg-white border-b p-4 flex items-center justify-between">
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h2 className="text-lg font-bold">選擇地圖</h2>
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
                                        <div className="absolute top-2 right-2 bg-purple-600 text-white px-2 py-1 rounded-full text-xs font-bold">
                                            {map.markers.length} 個標註點
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-bold text-slate-800">{map.name}</h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            更新: {new Date(map.updatedAt).toLocaleDateString()}
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
            <div className="bg-white border-b p-4 flex items-center justify-between">
                <button onClick={() => setViewMode('SELECT')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-lg font-bold">{currentMap?.name}</h2>
                <div className="flex items-center gap-2">
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-2 hover:bg-slate-100 rounded-full">
                        <ZoomOut className="w-5 h-5" />
                    </button>
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-2 hover:bg-slate-100 rounded-full">
                        <ZoomIn className="w-5 h-5" />
                    </button>
                    <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-2 hover:bg-slate-100 rounded-full">
                        <RotateCw className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 overflow-hidden relative bg-slate-800">
                <div
                    ref={imageContainerRef}
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        transition: 'transform 0.3s ease'
                    }}
                >
                    {currentMap && (
                        <div className="relative">
                            <img
                                src={currentMap.imageUrl}
                                alt={currentMap.name}
                                className="max-w-full max-h-full"
                            />
                            {/* Markers */}
                            {currentMap.markers.map(marker => (
                                <button
                                    key={marker.id}
                                    onClick={() => handleMarkerClick(marker)}
                                    className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg hover:scale-110 transition-transform ${getMarkerColor(marker)}`}
                                    style={{
                                        left: `${marker.x}%`,
                                        top: `${marker.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                        ...getMarkerStyle(marker)
                                    }}
                                >
                                    {marker.equipmentId}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
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
                                                className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                    placeholder="填寫檢查備註..."
                                />
                            </div>

                            {/* Photos */}
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">照片</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {photos.map((photo, idx) => (
                                        <div key={idx} className="relative aspect-square">
                                            <img src={photo} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover rounded-lg" />
                                            <button
                                                onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {photos.length < 3 && (
                                        <label className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-colors">
                                            <Camera className="w-6 h-6 text-slate-400 mb-1" />
                                            <span className="text-xs text-slate-500">上傳照片</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handlePhotoUpload}
                                                className="hidden"
                                            />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        </div>
    );
};

export default MapViewInspection;
