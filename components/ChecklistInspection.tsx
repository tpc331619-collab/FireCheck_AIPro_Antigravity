
import React, { useState, useEffect } from 'react';
import { LayoutGrid, MapPin, Building2, Search, CheckCircle, AlertTriangle, X, Camera, Save, ClipboardCheck, ArrowLeft, Plus, Trash2, Edit2, RotateCw, Image as ImageIcon, Upload, Calendar, CalendarClock, Gauge, Eye, Play, Pause, FileText, ScanBarcode, Lock } from 'lucide-react';
import { EquipmentDefinition, UserProfile, InspectionReport, InspectionItem, InspectionStatus } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';
import { getFrequencyStatus, getNextInspectionDate, getCycleDays } from '../utils/inspectionUtils';
import { THEME_COLORS } from '../constants';
import InspectionForm from './InspectionForm'; // We might reuse or partial reuse, but for now let's build the list logic first
import BarcodeScanner from './BarcodeScanner';

interface ChecklistInspectionProps {
    user: UserProfile;
    onBack: () => void;
    // Callback when a report is fully finished or user wants to leave? 
    // Actually, we might just save to storage continuously.
}

const ChecklistInspection: React.FC<ChecklistInspectionProps> = ({ user, onBack }) => {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);

    // Selection State
    const [selectedSite, setSelectedSite] = useState<string>('');
    const [selectedBuilding, setSelectedBuilding] = useState<string>('');

    // Data State
    const [allEquipment, setAllEquipment] = useState<EquipmentDefinition[]>([]);
    const [sites, setSites] = useState<string[]>([]);
    const [buildings, setBuildings] = useState<string[]>([]);
    const [lightSettings, setLightSettings] = useState<any>(null); // Add this

    // Filtered Data for current view
    const [filteredEquipment, setFilteredEquipment] = useState<EquipmentDefinition[]>([]);

    // Report State
    const [currentReport, setCurrentReport] = useState<InspectionReport | null>(null);

    // Inspection Modal State (To be implemented, maybe simplistic for now)
    const [inspectingItem, setInspectingItem] = useState<EquipmentDefinition | null>(null);
    const [activeInspectionItem, setActiveInspectionItem] = useState<InspectionItem | null>(null);

    // Barcode Scanner State
    const [scannerOpen, setScannerOpen] = useState(false);
    const [manualInput, setManualInput] = useState('');

    const [toastMsg, setToastMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMsg({ text, type });
        setTimeout(() => setToastMsg(null), 3000);
    };

    // Load Initial Data (All Equipment & Settings)
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [data, settings] = await Promise.all([
                    StorageService.getEquipmentDefinitions(user.uid),
                    StorageService.getLightSettings(user.uid)
                ]);
                setAllEquipment(data);
                setLightSettings(settings); // Set settings
                const uniqueSites = Array.from(new Set(data.map(item => item.siteName))).filter(Boolean);
                setSites(uniqueSites);

                // Auto-select first site default
                if (uniqueSites.length > 0) {
                    setSelectedSite(uniqueSites[0]);
                }
            } catch (error) {
                console.error("Failed to load equipment", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user.uid]);

    // Update Buildings based on Site
    useEffect(() => {
        if (selectedSite) {
            const siteBuildings = allEquipment
                .filter(e => e.siteName === selectedSite)
                .map(e => e.buildingName)
                .filter(Boolean);
            const uniqueBuildings = Array.from(new Set(siteBuildings));
            setBuildings(uniqueBuildings);

            // Only reset if currently selected building is no longer in the list (or if site just changed)
            // We can detect site change by tracking previous site, or simply check existence.
            // BUT, this effect runs on selectedSite change too. 
            // If selectedSite changes, we DO want to reset.
            // If allEquipment changes (e.g. update status), we DO NOT want to reset if valid.

            if (selectedBuilding && !uniqueBuildings.includes(selectedBuilding)) {
                setSelectedBuilding('');
            } else if (!selectedBuilding && uniqueBuildings.length === 1) {
                // Optional: Auto-select if only one building
                // setSelectedBuilding(uniqueBuildings[0]);
            }

            // Note: If selectedSite changed, uniqueBuildings would likely not contain the old selectedBuilding 
            // (unless different sites have same building names).
            // To be safer, we can rely on React's state. But simpliest fix for "Update Status" is:
            // Don't clear if valid.

        } else {
            setBuildings([]);
            setSelectedBuilding('');
        }
    }, [selectedSite, allEquipment]);

    // Load Inspection Report if Building is selected
    useEffect(() => {
        const loadReportAndEquipment = async () => {
            if (selectedSite && selectedBuilding) {
                setLoading(true);
                try {
                    // 1. Filter Equipment List
                    const targetEquipment = allEquipment.filter(
                        e => e.siteName === selectedSite && e.buildingName === selectedBuilding
                    );
                    setFilteredEquipment(targetEquipment);

                    // 2. Find existing report for today (Simple Logic: Look for report with same building name and today's date?)
                    // Note: Real logic might need more robust "Session" tracking. 
                    // For now, let's fetch ALL reports and find the most recent one for this building that is "Today".
                    const reports = await StorageService.getReports(user.uid);

                    const today = new Date();
                    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

                    const existingReport = reports.find(r => {
                        return r.buildingName === selectedBuilding && r.date >= startOfDay;
                    });

                    if (existingReport) {
                        setCurrentReport(existingReport);
                    } else {
                        // Create a draft report object in memory (not saved yet)
                        setCurrentReport({
                            id: 'draft_' + Date.now(),
                            userId: user.uid,
                            buildingName: selectedBuilding,
                            inspectorName: user.displayName || 'Guest',
                            date: Date.now(),
                            items: [],
                            overallStatus: 'In Progress'
                        });
                    }

                } catch (err) {
                    console.error(err);
                } finally {
                    setLoading(false);
                }
            } else {
                setFilteredEquipment([]);
                setCurrentReport(null);
            }
        };

        loadReportAndEquipment();
    }, [selectedSite, selectedBuilding, allEquipment, user.uid]); // Re-run if selection changes


    // Local helpers removed, using imported utils


    const getInspectionStatus = (equipId: string) => {
        // This function was used for Report Items, but for the LIST view, we now use Frequency Logic primarily.
        // However, we still need to know if there's an active draft report item for it.
        if (!currentReport) return 'UseFrequency';
        const found = (currentReport.items || []).find((i: any) => i.equipmentId === equipId);
        if (found) return found.status;
        return 'UseFrequency';
    };

    const getInspectionItem = (equipId: string) => {
        if (!currentReport) return undefined;
        return (currentReport.items || []).find((i: any) => i.equipmentId === equipId);
    }

    const handleInspect = (item: EquipmentDefinition) => {
        setInspectingItem(item);

        // Find existing draft in current report
        const exist = (currentReport?.items || []).find(i => i.equipmentId === item.id);

        if (exist) {
            setActiveInspectionItem({ ...exist });
        } else {
            // Initialize Defaults: Assume all boolean checks are Normal (true)
            const defaultCheckPoints: Record<string, any> = {};
            item.checkItems.forEach(ci => {
                if (ci.inputType !== 'number') {
                    defaultCheckPoints[ci.name] = true; // Default to Normal
                } else {
                    // For numbers, maybe leave empty? Or 0? Empty is safer to force input.
                    // defaultCheckPoints[ci.name] = ''; 
                }
            });

            setActiveInspectionItem({
                equipmentId: item.id,
                equipmentName: item.name,
                checkPoints: defaultCheckPoints, // Pre-filled defaults
                status: InspectionStatus.Normal, // Default Status
                notes: '',
                photos: [],
                lastUpdated: Date.now()
            });
        }
    };

    const handleBarcodeScanned = (barcode: string) => {
        setScannerOpen(false);
        searchEquipmentByBarcode(barcode);
    };

    const handleManualSearch = () => {
        if (manualInput.trim()) {
            searchEquipmentByBarcode(manualInput.trim());
        }
    };

    const searchEquipmentByBarcode = (barcode: string) => {
        const found = filteredEquipment.find(e => e.barcode === barcode);
        if (found) {
            handleInspect(found);
            setManualInput(''); // 清空輸入
        } else {
            alert(`找不到設備編號「${barcode}」\n\n請確認:\n1. 設備編號是否正確\n2. 設備是否屬於目前選擇的場所和建築物`);
        }
    };

    const handleSaveInspection = async () => {
        if (!inspectingItem || !activeInspectionItem) return;

        // Ensure notes if abnormal
        if (activeInspectionItem.status === InspectionStatus.Abnormal && !activeInspectionItem.notes.trim()) {
            alert('檢查結果異常，請務必填寫異常說明！');
            return;
        }

        const now = Date.now();

        // Sanitize CheckPoints (Remove empty keys or undefined values)
        const sanitizedPoints: Record<string, any> = {};
        if (activeInspectionItem.checkPoints) {
            Object.entries(activeInspectionItem.checkPoints).forEach(([key, val]) => {
                if (key && key.trim() !== '' && val !== undefined) {
                    sanitizedPoints[key] = val;
                }
            });
        }

        // Generate Check Results Snapshot (移除 undefined 值)
        const checkResultsSnapshot = inspectingItem.checkItems?.map(ci => {
            const result: any = {
                name: ci.name,
                value: sanitizedPoints[ci.id] ?? sanitizedPoints[ci.name]
            };

            // 只在數值類型時添加 threshold 和 unit
            if (ci.inputType === 'number') {
                if (ci.thresholdMode === 'range') {
                    result.threshold = `${ci.val1}~${ci.val2}`;
                } else if (ci.thresholdMode) {
                    result.threshold = `${ci.thresholdMode} ${ci.val1}`;
                }
                if (ci.unit) {
                    result.unit = ci.unit;
                }
            }

            return result;
        }) || [];

        const updatedItem: InspectionItem = {
            ...activeInspectionItem,
            name: inspectingItem.name, // Snapshot
            barcode: inspectingItem.barcode, // Snapshot
            checkFrequency: inspectingItem.checkFrequency, // Snapshot
            checkPoints: sanitizedPoints,
            checkResults: checkResultsSnapshot, // Snapshot
            lastUpdated: now
        };

        try {
            console.log("Saving Report Details:", {
                userId: user?.uid,
                reportId: currentReport?.id,
                item: updatedItem
            });

            // Update Report (Create or Update Draft)
            let report = currentReport;
            if (!report) {
                // Initialize new report if not exists
                const newReport: InspectionReport = {
                    id: `report_${now}`,
                    buildingName: selectedBuilding || 'Unknown',
                    inspectorName: user?.displayName || 'Guest',
                    date: now,
                    items: [],
                    overallStatus: 'In Progress'
                };
                report = newReport;
            }

            // Upsert Item
            const newItems = [...(report.items || [])];
            const idx = newItems.findIndex((i: any) => i.equipmentId === inspectingItem.id);
            if (idx >= 0) {
                newItems[idx] = { ...updatedItem, equipmentId: inspectingItem.id } as any;
            } else {
                newItems.push({ ...updatedItem, equipmentId: inspectingItem.id } as any);
            }

            report.items = newItems;

            // Auto-archive if all items are normal
            const shouldArchive = updatedItem.status === InspectionStatus.Normal;
            report.archived = shouldArchive;

            // 清理函數:遞迴移除所有 undefined 值，但保留必要的空數組
            const removeUndefined = (obj: any): any => {
                if (obj === null || obj === undefined) return null;
                if (Array.isArray(obj)) {
                    return obj.map(removeUndefined);
                }
                if (typeof obj === 'object') {
                    const cleaned: any = {};
                    Object.keys(obj).forEach(key => {
                        const value = obj[key];
                        if (value !== undefined) {
                            cleaned[key] = removeUndefined(value);
                        }
                    });
                    // Ensure items exists for report objects
                    if (obj.buildingName || obj.inspectorName || obj.date) {
                        if (!cleaned.items) cleaned.items = [];
                    }
                    return cleaned;
                }
                return obj;
            };

            // 清理 report
            const cleanedReport = removeUndefined(report);

            // Save to Firestore
            // Check if this is a draft (never saved to Firestore)
            const isDraft = report.id.startsWith('draft_');

            if (isDraft) {
                // Create new report in Firestore
                if (user?.uid) {
                    const newId = await StorageService.saveReport(cleanedReport, user.uid);
                    // Update local state with real Firestore ID
                    report.id = newId;
                } else {
                    console.error("User ID missing, cannot create new report");
                    alert('儲存失敗：找不到使用者 ID，請重新登入');
                    return;
                }
            } else {
                // Update existing report
                await StorageService.updateReport(cleanedReport);
            }

            // Also Update Equipment's lastInspectedDate in DB
            await StorageService.updateEquipmentDefinition({
                id: inspectingItem.id,
                lastInspectedDate: now,
                updatedAt: now
            });

            // If Abnormal, add to abnormal re-inspection list
            if (updatedItem.status === InspectionStatus.Abnormal) {
                try {
                    // Collect abnormal items (failed checks)
                    const abnormalItems: string[] = [];
                    inspectingItem.checkItems.forEach(ci => {
                        const val = sanitizedPoints[ci.id] || sanitizedPoints[ci.name];
                        if (ci.inputType === 'number') {
                            const num = parseFloat(String(val));
                            if (!isNaN(num) && ci.thresholdMode) {
                                let failed = false;
                                if (ci.thresholdMode === 'range' && (num < (ci.val1 || 0) || num > (ci.val2 || 0))) failed = true;
                                else if (ci.thresholdMode === 'gt' && num <= (ci.val1 || 0)) failed = true;
                                else if (ci.thresholdMode === 'gte' && num < (ci.val1 || 0)) failed = true;
                                else if (ci.thresholdMode === 'lt' && num >= (ci.val1 || 0)) failed = true;
                                else if (ci.thresholdMode === 'lte' && num > (ci.val1 || 0)) failed = true;
                                if (failed) abnormalItems.push(ci.name);
                            }
                        } else {
                            // Boolean check: false = abnormal
                            if (val === false) abnormalItems.push(ci.name);
                        }
                    });

                    await StorageService.saveAbnormalRecord(removeUndefined({
                        userId: user.uid,
                        equipmentId: inspectingItem.id,
                        equipmentName: inspectingItem.name,
                        barcode: inspectingItem.barcode,
                        siteName: inspectingItem.siteName,
                        buildingName: inspectingItem.buildingName,
                        inspectionDate: now,
                        abnormalItems: abnormalItems.length > 0 ? abnormalItems : ['未指定項目'],
                        abnormalReason: updatedItem.notes || '未填寫原因',
                        status: 'pending',
                        createdAt: now,
                        updatedAt: now
                    }), user.uid);
                } catch (e) {
                    console.error("Failed to save abnormal record:", e);
                    // Don't block the main save flow
                }
            }

            // 更新本地狀態,確保統計數字和燈號即時更新
            const updatedReport = {
                ...cleanedReport,
                updatedAt: Date.now()
            };

            // Update Equipment Definition's lastInspectedDate to reflect current status
            await StorageService.updateEquipmentDefinition({
                id: inspectingItem.id,
                lastInspectedDate: now
            });
            // Update local state 'allEquipment' to reflect the new lastInspectedDate immediately
            // This ensures the list view shows 'Ready' or 'Completed' status correctly even if currentReport reasoning falls back.
            const updatedAllEquip = allEquipment.map(e =>
                e.id === inspectingItem.id ? { ...e, lastInspectedDate: now } : e
            );
            setAllEquipment(updatedAllEquip);

            // Also update filteredEquipment so the list re-renders with correct status
            setFilteredEquipment(prev => prev.map(e =>
                e.id === inspectingItem.id ? { ...e, lastInspectedDate: now } : e
            ));

            // Close Modal first
            setInspectingItem(null);

            // Then update report to trigger re-render
            setCurrentReport(updatedReport);

            // Show success notification
            const statusText = updatedItem.status === InspectionStatus.Normal ? '正常' : '異常';
            showToast(`✅ 檢查完成！\n設備：${inspectingItem.name}\n狀態：${statusText}`);

            // If Abnormal, show toast instead of alert (or combined message)
            if (updatedItem.status === InspectionStatus.Abnormal) {
                // We already have a toast, maybe append or show a slightly different one
                // showToast(`已記錄異常，將加入「異常複檢」清單。`, 'success');
            }

        } catch (e: any) {
            console.error("Save failed:", e);
            // Show more detailed error if possible
            const errorMsg = e.message || e.code || "未預期的錯誤";
            alert(`儲存失敗，請重試。\n錯誤代碼: ${errorMsg}`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="font-bold text-lg text-slate-800">開始查檢</h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                <div className="max-w-3xl mx-auto space-y-6">

                    {/* Filter Section */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center tracking-wider">
                                <MapPin className="w-3.5 h-3.5 mr-1.5" /> 請選擇場所
                            </label>
                            <select
                                value={selectedSite}
                                onChange={(e) => setSelectedSite(e.target.value)}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:border-red-500 focus:outline-none transition-colors"
                            >
                                <option value="">-- 請選擇 --</option>
                                {sites.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center tracking-wider">
                                <Building2 className="w-3.5 h-3.5 mr-1.5" /> 請選擇建築物名稱
                            </label>
                            <select
                                value={selectedBuilding}
                                onChange={(e) => setSelectedBuilding(e.target.value)}
                                disabled={!selectedSite}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:border-red-500 focus:outline-none disabled:opacity-50 transition-colors"
                            >
                                <option value="">-- 請選擇 --</option>
                                {buildings.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Stats Section - Site Scope */}
                    {selectedSite && (
                        <div className="space-y-6">
                            {(() => {
                                // Calculate Site-wide Stats based on Frequency
                                const siteEquipment = allEquipment.filter(e => e.siteName === selectedSite);

                                // 新的統計邏輯 - 區分正常和異常
                                let needInspectionCount = 0;  // 紅色燈號 (PENDING)
                                let completedNormalCount = 0; // 已檢查且正常 (COMPLETED + Normal)
                                let abnormalCount = 0;        // 已檢查但異常 (COMPLETED + Abnormal)
                                let notNeededCount = 0;       // 綠色 + 橙色 (UNNECESSARY + CAN_INSPECT)

                                siteEquipment.forEach(e => {
                                    const status = getFrequencyStatus(e);
                                    if (status === 'PENDING') {
                                        needInspectionCount++;  // 紅色: 需檢查
                                    } else if (status === 'COMPLETED') {
                                        // 檢查是否異常 - 從 currentReport 中查找
                                        const inspectionItem = (currentReport?.items || []).find((i: any) => i.equipmentId === e.id);
                                        if (inspectionItem?.status === InspectionStatus.Abnormal) {
                                            abnormalCount++;    // 異常
                                        } else {
                                            completedNormalCount++; // 正常完成
                                        }
                                    } else {
                                        notNeededCount++;       // 綠色 + 橙色: 不需檢查
                                    }
                                });

                                return (
                                    <>
                                        <div className="grid grid-cols-4 gap-4">
                                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                                                <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">需檢查</p>
                                                <p className="text-2xl font-black text-red-700">{needInspectionCount}</p>
                                            </div>
                                            <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                                                <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1">已完成</p>
                                                <p className="text-2xl font-black text-green-700">{completedNormalCount}</p>
                                            </div>
                                            <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-center">
                                                <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">異常</p>
                                                <p className="text-2xl font-black text-red-600">{abnormalCount}</p>
                                            </div>
                                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">不需檢查</p>
                                                <p className="text-2xl font-black text-slate-700">{notNeededCount}</p>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* Quick Search Section */}
                    {selectedSite && selectedBuilding && (
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                            <h3 className="font-bold text-slate-700 flex items-center">
                                <Search className="w-4 h-4 mr-2" /> 快速查找設備
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* Barcode Scanner Button */}
                                <button
                                    onClick={() => setScannerOpen(true)}
                                    className="flex items-center justify-center gap-2 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg active:scale-95"
                                >
                                    <ScanBarcode className="w-5 h-5" />
                                    <span className="font-bold">掃描條碼</span>
                                </button>

                                {/* Manual Input */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={manualInput}
                                        onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                                        onKeyPress={(e) => e.key === 'Enter' && handleManualSearch()}
                                        placeholder="輸入設備編號"
                                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none transition-colors"
                                    />
                                    <button
                                        onClick={handleManualSearch}
                                        disabled={!manualInput.trim()}
                                        className="px-4 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <Search className="w-4 h-4" />
                                        <span className="font-bold hidden sm:inline">搜尋</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Equipment List */}
                    {selectedSite && selectedBuilding ? (
                        <div className="space-y-3">
                            <h3 className="font-bold text-slate-700 ml-1 flex items-center">
                                <LayoutGrid className="w-4 h-4 mr-2" /> 設備清單
                            </h3>
                            {filteredEquipment.length === 0 ? (
                                <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
                                    無對應設備
                                </div>
                            ) : (
                                // 按燈號排序: 紅色 (PENDING) → 橙色 (CAN_INSPECT) → 綠色 (UNNECESSARY) → 已完成 (COMPLETED)
                                [...filteredEquipment].sort((a, b) => {
                                    const statusA = getFrequencyStatus(a, lightSettings);
                                    const statusB = getFrequencyStatus(b, lightSettings);

                                    const priority = {
                                        'PENDING': 1,      // 紅色最優先
                                        'CAN_INSPECT': 2,  // 橙色次之
                                        'UNNECESSARY': 3,  // 綠色再次
                                        'COMPLETED': 4     // 已完成最後
                                    };

                                    return priority[statusA] - priority[statusB];
                                }).map(item => {
                                    const freqStatusRaw = getFrequencyStatus(item, lightSettings);

                                    // Check if item is in current report (active session)
                                    // Use 'item.id' (UUID) to match
                                    const inspectionItem = (currentReport?.items || []).find((i: any) => i.equipmentId === item.id);

                                    // Effective Status: If in current report, treat as COMPLETED. Else use database status.
                                    const freqStatus = inspectionItem ? 'COMPLETED' : freqStatusRaw;

                                    // Visual Logic
                                    let statusLabel = '需檢查';
                                    let statusColor = 'bg-red-100 text-red-500';
                                    let rowBorder = 'border-slate-200 hover:border-red-300';
                                    let iconBg = 'bg-slate-300';
                                    let iconStyle: React.CSSProperties = {};
                                    let iconContent = null; // No number by default

                                    if (freqStatus === 'COMPLETED') {
                                        const isAbnormal = inspectionItem?.status === InspectionStatus.Abnormal;
                                        if (isAbnormal) {
                                            statusLabel = '已檢查+異常';
                                            statusColor = 'bg-red-100 text-red-600';
                                            rowBorder = 'border-red-200 bg-red-50/30';
                                            iconBg = 'bg-orange-500';
                                            iconContent = <span className="font-bold text-lg">!</span>;
                                        } else {
                                            statusLabel = '已檢查';
                                            statusColor = 'bg-green-100 text-green-700';
                                            rowBorder = 'border-green-200 bg-green-50/30';

                                            // Normal Completed: Use custom color if set, otherwise default emerald
                                            if (lightSettings?.completed?.color) {
                                                iconStyle = { backgroundColor: lightSettings.completed.color };
                                                iconBg = '';
                                            } else {
                                                iconBg = 'bg-emerald-500';
                                                iconStyle = {};
                                            }
                                            iconContent = <CheckCircle className="w-5 h-5 text-white" />;
                                        }
                                    } else if (freqStatus === 'CAN_INSPECT') {
                                        statusLabel = '可以檢查';
                                        statusColor = 'bg-yellow-100 text-yellow-700';
                                        rowBorder = 'border-yellow-200 hover:border-yellow-300';
                                        if (lightSettings?.yellow?.color) {
                                            iconStyle = { backgroundColor: lightSettings.yellow.color };
                                            iconBg = 'bg-yellow-400';
                                        }
                                    } else if (freqStatus === 'UNNECESSARY') {
                                        statusLabel = '不須檢查';
                                        statusColor = 'bg-slate-100 text-slate-500';
                                        rowBorder = 'border-slate-200 opacity-75';
                                        if (lightSettings?.green?.color) {
                                            iconStyle = { backgroundColor: lightSettings.green.color };
                                            iconBg = 'bg-emerald-500';
                                        }
                                    } else {
                                        // PENDING
                                        if (lightSettings?.red?.color) {
                                            iconStyle = { backgroundColor: lightSettings.red.color };
                                            iconBg = 'bg-red-500';
                                        }
                                    }

                                    // Lock Logic: Unnecessary or Completed items are locked
                                    const isLocked = freqStatus === 'UNNECESSARY' || freqStatus === 'COMPLETED';

                                    return (
                                        <div key={item.id}
                                            onClick={() => {
                                                if (isLocked) return;
                                                handleInspect(item);
                                            }}
                                            className={`bg-white p-4 rounded-xl border transition-all flex items-center justify-between shadow-sm relative overflow-hidden ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:shadow-md'} ${rowBorder}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 ${iconBg}`}
                                                    style={iconStyle}
                                                >
                                                    {iconContent}
                                                </div>
                                                <div>
                                                    <h4 className={`font-bold text-slate-800 flex items-center gap-2`}>
                                                        {item.name}
                                                        {isLocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                                                    </h4>
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                                                        <span>{item.barcode}</span>
                                                        <span>•</span>
                                                        {inspectionItem ? (
                                                            <span className="text-blue-600 font-bold">
                                                                已檢: {new Date(inspectionItem.timestamp || Date.now()).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        ) : (
                                                            <span>下次: {new Date(getNextInspectionDate(item)).toLocaleDateString()}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Status Light Indicator (Right Side) */}
                                                {freqStatus === 'PENDING' && (
                                                    <div className="w-3 h-3 rounded-full shadow-lg"
                                                        style={{ backgroundColor: lightSettings?.red?.color || '#ef4444', boxShadow: `0 0 10px ${lightSettings?.red?.color || '#ef4444'}66` }}></div>
                                                )}
                                                {freqStatus === 'CAN_INSPECT' && (
                                                    <div className="w-3 h-3 rounded-full shadow-lg"
                                                        style={{ backgroundColor: lightSettings?.yellow?.color || '#facc15', boxShadow: `0 0 10px ${lightSettings?.yellow?.color || '#facc15'}66` }}></div>
                                                )}
                                                {freqStatus === 'UNNECESSARY' && (
                                                    <div className="w-3 h-3 rounded-full shadow-lg"
                                                        style={{ backgroundColor: lightSettings?.green?.color || '#10b981', boxShadow: `0 0 10px ${lightSettings?.green?.color || '#10b981'}66` }}></div>
                                                )}
                                                {freqStatus === 'COMPLETED' && (() => {
                                                    const inspectionItem = (currentReport?.items || []).find((i: any) => i.equipmentId === item.id);
                                                    const isAbnormal = inspectionItem?.status === InspectionStatus.Abnormal;

                                                    if (isAbnormal) {
                                                        return <div className="w-3 h-3 rounded-full bg-orange-500 shadow-lg shadow-orange-300" />;
                                                    } else {
                                                        // Completed Normal - Custom color or default emerald
                                                        return <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lightSettings?.completed?.color || '#10b981' }}></div>;
                                                    }
                                                })()}

                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                                                    {statusLabel}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        !loading && (
                            <div className="text-center py-12 text-slate-400 bg-white/50 rounded-2xl border-2 border-dashed border-slate-200">
                                <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>請先選擇場所與查檢場所</p>
                            </div>
                        )
                    )}

                </div>
            </div>

            {/* Modal for Inspection */}
            {inspectingItem && activeInspectionItem && (
                <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">檢查: {inspectingItem.name}</h3>
                                <p className="text-xs text-slate-500">{inspectingItem.barcode}</p>
                            </div>
                            <button onClick={() => setInspectingItem(null)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Check Items */}
                            <div className="space-y-4">
                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                                    <ClipboardCheck className="w-4 h-4 mr-1.5" /> 檢查項目列表
                                </label>
                                {inspectingItem.checkItems.map(ci => {
                                    const val = activeInspectionItem.checkPoints[ci.name];
                                    const isNum = ci.inputType === 'number';

                                    // Display Threshold Hint
                                    let hint = '';
                                    if (isNum && ci.thresholdMode) {
                                        if (ci.thresholdMode === 'range') hint = `${ci.val1} ~ ${ci.val2}`;
                                        else if (ci.thresholdMode === 'gt') hint = `> ${ci.val1}`;
                                        else if (ci.thresholdMode === 'gte') hint = `>= ${ci.val1}`;
                                        else if (ci.thresholdMode === 'lt') hint = `< ${ci.val1}`;
                                        else if (ci.thresholdMode === 'lte') hint = `<= ${ci.val1}`;
                                        if (ci.unit) hint += ` ${ci.unit}`;
                                    }

                                    return (
                                        <div key={ci.id} className={`p-4 border rounded-xl bg-white transition-all 
                                            ${activeInspectionItem.status === InspectionStatus.Abnormal && (isNum ? ( // If numeric and failed
                                                (ci.thresholdMode === 'range' && (parseFloat(String(val)) < (ci.val1 || 0) || parseFloat(String(val)) > (ci.val2 || 0))) ||
                                                (ci.thresholdMode === 'gt' && parseFloat(String(val)) <= (ci.val1 || 0)) ||
                                                (ci.thresholdMode === 'gte' && parseFloat(String(val)) < (ci.val1 || 0)) ||
                                                (ci.thresholdMode === 'lt' && parseFloat(String(val)) >= (ci.val1 || 0)) ||
                                                (ci.thresholdMode === 'lte' && parseFloat(String(val)) > (ci.val1 || 0))
                                            ) : ( // If boolean and failed
                                                val === false
                                            )) ? 'border-red-300 bg-red-50/20 shadow-sm' : 'border-slate-200 hover:border-blue-300'}`}>

                                            <div className="flex items-center justify-between mb-3">
                                                <span className="font-bold text-slate-700">{ci.name}</span>
                                                {hint && <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{hint}</span>}
                                            </div>

                                            {isNum ? (
                                                <div className="space-y-2">
                                                    {/* Threshold Spec Display */}
                                                    {(() => {
                                                        console.log('[Threshold Debug]', ci.name, '- mode:', ci.thresholdMode, 'val1:', ci.val1, 'val2:', ci.val2, 'unit:', ci.unit);
                                                        return (ci.val1 !== undefined || ci.val2 !== undefined) ? (
                                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2">
                                                                <Gauge className="w-4 h-4 text-blue-600 shrink-0" />
                                                                <div className="text-xs text-blue-700 font-medium">
                                                                    <span className="font-bold">規格範圍：</span>
                                                                    {ci.thresholdMode === 'range' && ci.val1 !== undefined && ci.val2 !== undefined && (
                                                                        <span>{ci.val1} ~ {ci.val2} {ci.unit || ''}</span>
                                                                    )}
                                                                    {ci.thresholdMode === 'gte' && ci.val1 !== undefined && (
                                                                        <span>≥ {ci.val1} {ci.unit || ''}</span>
                                                                    )}
                                                                    {ci.thresholdMode === 'gt' && ci.val1 !== undefined && (
                                                                        <span>&gt; {ci.val1} {ci.unit || ''}</span>
                                                                    )}
                                                                    {ci.thresholdMode === 'lte' && ci.val1 !== undefined && (
                                                                        <span>≤ {ci.val1} {ci.unit || ''}</span>
                                                                    )}
                                                                    {ci.thresholdMode === 'lt' && ci.val1 !== undefined && (
                                                                        <span>&lt; {ci.val1} {ci.unit || ''}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : null;
                                                    })()}

                                                    <div className="flex items-center gap-3">
                                                        <div className="relative flex-1">
                                                            <input
                                                                type="number"
                                                                value={val === undefined ? '' : val as number}
                                                                onChange={(e) => {
                                                                    const numStr = e.target.value;
                                                                    const num = parseFloat(numStr);
                                                                    const newPoints = { ...activeInspectionItem.checkPoints, [ci.name]: numStr === '' ? '' : num };

                                                                    // Validation Logic
                                                                    let itemFailed = false;
                                                                    if (numStr !== '' && !isNaN(num) && ci.thresholdMode) {
                                                                        if (ci.thresholdMode === 'range' && (num < (ci.val1 || 0) || num > (ci.val2 || 0))) itemFailed = true;
                                                                        else if (ci.thresholdMode === 'gt' && num <= (ci.val1 || 0)) itemFailed = true;
                                                                        else if (ci.thresholdMode === 'gte' && num < (ci.val1 || 0)) itemFailed = true;
                                                                        else if (ci.thresholdMode === 'lt' && num >= (ci.val1 || 0)) itemFailed = true;
                                                                        else if (ci.thresholdMode === 'lte' && num > (ci.val1 || 0)) itemFailed = true;
                                                                    }

                                                                    // Recalculate Global Status
                                                                    // If this item failed, Status must be Abnormal.
                                                                    // If this item passed, we need to check OTHER items to see if overall status can be Normal.
                                                                    let overallAbnormal = itemFailed;
                                                                    if (!itemFailed) {
                                                                        // Check other items
                                                                        inspectingItem.checkItems.forEach(other => {
                                                                            if (other.name === ci.name) return; // Skip current
                                                                            const otherVal = newPoints[other.name];
                                                                            if (other.inputType === 'number') {
                                                                                const oNum = parseFloat(String(otherVal));
                                                                                if (!isNaN(oNum) && other.thresholdMode) {
                                                                                    if (other.thresholdMode === 'range' && (oNum < (other.val1 || 0) || oNum > (other.val2 || 0))) overallAbnormal = true;
                                                                                    // ... simplified check for others
                                                                                }
                                                                            } else {
                                                                                if (otherVal === false) overallAbnormal = true; // Boolean logic: true=Pass (Normal), false=Fail (Abnormal)
                                                                                // Wait, previous logic was val=true meant "Qualified" (checked). 
                                                                                // User wants "Normal/Abnormal".
                                                                                // Let's store boolean: true = Normal, false = Abnormal.
                                                                            }
                                                                        });
                                                                    }

                                                                    setActiveInspectionItem(prev => ({
                                                                        ...prev!,
                                                                        checkPoints: newPoints,
                                                                        status: overallAbnormal ? InspectionStatus.Abnormal : prev!.status // Auto-set Abnormal, do not auto-clear to Normal if user manually set it? User logic: "Status is not needed". So Status IS derived.
                                                                        // Let's force derived status for now, or default to Normal if all pass.
                                                                        // Actually, if user says "Remove Status Selection", then status IS purely derived.
                                                                    }));

                                                                    // Better Approach: Update status based on ALL checks every change.
                                                                    const isStatsAbnormal = itemFailed || inspectingItem.checkItems.some(other => {
                                                                        if (other.name === ci.name) return false;
                                                                        const oVal = newPoints[other.name];
                                                                        if (other.inputType === 'number') return false; // Basic skip for now, simplified
                                                                        return oVal === false; // If stored as false=Abnormal
                                                                    });

                                                                    setActiveInspectionItem(prev => ({
                                                                        ...prev!,
                                                                        checkPoints: newPoints,
                                                                        status: isStatsAbnormal ? InspectionStatus.Abnormal : InspectionStatus.Normal
                                                                    }));
                                                                }}
                                                                placeholder="輸入數值"
                                                                className={`w-full p-2.5 bg-slate-50 border rounded-lg text-slate-900 focus:outline-none transition-colors 
                                                                ${(activeInspectionItem.status === InspectionStatus.Abnormal && (!val || (val as number) < 0)) ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'}`}
                                                            // Note: Input border logic simplified for now
                                                            />
                                                            {ci.unit && <span className="absolute right-3 top-2.5 text-slate-400 text-sm font-bold pointer-events-none">{ci.unit}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                                    <button
                                                        onClick={() => {
                                                            const newPoints = { ...activeInspectionItem.checkPoints, [ci.name]: true }; // true = Normal

                                                            // Check Overall Status
                                                            const isAnyAbnormal = inspectingItem.checkItems.some(item => {
                                                                if (item.name === ci.name) return false; // current is Normal (true)
                                                                const v = newPoints[item.name];
                                                                if (item.inputType === 'number') { /* ... */ return false; } // simplified
                                                                return v === false;
                                                            });

                                                            setActiveInspectionItem(prev => ({
                                                                ...prev!,
                                                                checkPoints: newPoints,
                                                                status: isAnyAbnormal ? InspectionStatus.Abnormal : InspectionStatus.Normal
                                                            }));
                                                        }}
                                                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2
                                                        ${val !== false ? 'bg-white text-green-700 shadow ring-1 ring-green-200' : 'text-slate-500 hover:bg-slate-200'}`}
                                                    >
                                                        <CheckCircle className="w-4 h-4" /> 正常
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const newPoints = { ...activeInspectionItem.checkPoints, [ci.name]: false }; // false = Abnormal
                                                            setActiveInspectionItem(prev => ({
                                                                ...prev!,
                                                                checkPoints: newPoints,
                                                                status: InspectionStatus.Abnormal // Force Abnormal
                                                            }));
                                                        }}
                                                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2
                                                        ${val === false ? 'bg-white text-red-700 shadow ring-1 ring-red-200' : 'text-slate-500 hover:bg-slate-200'}`}
                                                    >
                                                        <AlertTriangle className="w-4 h-4" /> 異常
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Notes - Mandatory if Abnormal */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                                    <FileText className="w-4 h-4 mr-1.5" />
                                    異常說明
                                    {activeInspectionItem.status === InspectionStatus.Abnormal && <span className="text-red-500 ml-1">(必填)</span>}
                                </label>
                                <textarea
                                    value={activeInspectionItem.notes}
                                    onChange={(e) => setActiveInspectionItem({ ...activeInspectionItem, notes: e.target.value })}
                                    placeholder={activeInspectionItem.status === InspectionStatus.Abnormal ? "請詳細描述異常原因..." : "備註 (選填)"}
                                    className={`w-full p-3 border rounded-xl text-sm focus:outline-none min-h-[80px] transition-colors
                                    ${activeInspectionItem.status === InspectionStatus.Abnormal && !activeInspectionItem.notes.trim()
                                            ? 'border-red-300 bg-red-50 focus:border-red-500 placeholder:text-red-300'
                                            : 'border-slate-200 focus:border-blue-500'}`}
                                />
                                {activeInspectionItem.status === InspectionStatus.Abnormal && !activeInspectionItem.notes.trim() && (
                                    <p className="text-xs text-red-500 font-bold flex items-center">
                                        <AlertTriangle className="w-3 h-3 mr-1" /> 此欄位為必填
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 flex gap-3 bg-slate-50 rounded-b-2xl">
                            <button
                                onClick={() => setInspectingItem(null)}
                                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveInspection}
                                disabled={activeInspectionItem.status === InspectionStatus.Abnormal && !activeInspectionItem.notes.trim()}
                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-200 active:scale-95"
                            >
                                {activeInspectionItem.status === InspectionStatus.Abnormal ? '確認異常並送出' : '完成檢查'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Barcode Scanner Modal */}
            {scannerOpen && (
                <BarcodeScanner
                    onScanSuccess={handleBarcodeScanned}
                    onClose={() => setScannerOpen(false)}
                />
            )}

            {/* Toast Notification */}
            {toastMsg && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-300 w-max">
                    <div className={`${toastMsg.type === 'error' ? 'bg-red-600' : 'bg-slate-800'} text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-white/20 backdrop-blur-md`}>
                        {toastMsg.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5 text-emerald-400" />}
                        <span className="font-bold text-sm tracking-wide whitespace-pre-line">{toastMsg.text}</span>
                    </div>
                </div>
            )}
        </div>
    );
};


export default ChecklistInspection;
