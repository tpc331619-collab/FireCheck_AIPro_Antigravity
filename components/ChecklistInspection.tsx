
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building2, MapPin, Search, CheckCircle, AlertCircle, Play, FileText, Filter, LayoutGrid } from 'lucide-react';
import { EquipmentDefinition, UserProfile, InspectionReport, InspectionItem, InspectionStatus } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';
import { THEME_COLORS } from '../constants';
import InspectionForm from './InspectionForm'; // We might reuse or partial reuse, but for now let's build the list logic first

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

    // Filtered Data for current view
    const [filteredEquipment, setFilteredEquipment] = useState<EquipmentDefinition[]>([]);

    // Report State
    const [currentReport, setCurrentReport] = useState<InspectionReport | null>(null);

    // Inspection Modal State (To be implemented, maybe simplistic for now)
    const [inspectingItem, setInspectingItem] = useState<EquipmentDefinition | null>(null);
    const [activeInspectionItem, setActiveInspectionItem] = useState<InspectionItem | null>(null);

    // Load Initial Data (All Equipment)
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await StorageService.getEquipmentDefinitions(user.uid);
                setAllEquipment(data);
                const uniqueSites = Array.from(new Set(data.map(item => item.siteName))).filter(Boolean);
                setSites(uniqueSites);
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
            setBuildings(Array.from(new Set(siteBuildings)));
            setSelectedBuilding(''); // Reset building when site changes
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


    // Helper to check status
    const getInspectionStatus = (equipId: string) => {
        if (!currentReport) return 'PENDING';
        const item = currentReport.items.find(i => i.id === equipId); // Assuming we link by ID. 
        // PROBLEM: EquipmentDefinition ID is different from InspectionItem ID (which is usually random).
        // SOLUTION: When creating an InspectionItem from EquipmentDefinition, store the refId or use the same ID?
        // Better: Store `equipmentId` in InspectionItem or just match by name/barcode?
        // Let's assume we match by `id` if possible, or we add a property `equipmentId` to InspectionItem type.
        // For now, let's check if we can match by `barcode` or `name` + `location`?
        // Let's match by `equipmentId` (I will add this field to the inspection item logically, even if not in TS type strict yet, or add it to types).

        const found = currentReport.items.find((i: any) => i.equipmentId === equipId);
        if (found) return found.status;
        return 'PENDING';
    };

    const getInspectionItem = (equipId: string) => {
        if (!currentReport) return undefined;
        return currentReport.items.find((i: any) => i.equipmentId === equipId);
    }

    // Handle Start Inspection
    const handleInspect = (item: EquipmentDefinition) => {
        setInspectingItem(item);

        const existingItem = getInspectionItem(item.id);
        if (existingItem) {
            setActiveInspectionItem(existingItem);
        } else {
            // Initialize new inspection item
            const newItem: InspectionItem & { equipmentId: string } = {
                id: Date.now().toString(),
                type: item.name, // Using name as type for now
                location: item.siteName + " " + item.buildingName, // Or simplified
                status: InspectionStatus.Normal, // Default assumption
                checkPoints: {},
                notes: '',
                lastUpdated: Date.now(),
                equipmentId: item.id, // Linking back
                photoUrl: undefined
            };

            // Populate default checkpoints
            if (item.checkItems && item.checkItems.length > 0) {
                item.checkItems.forEach(ci => {
                    newItem.checkPoints[ci.name] = ci.inputType === 'number' ? 0 : false;
                });
            } else {
                // Fallback default checkpoints based on name?
                newItem.checkPoints = { '外觀檢查': true, '性能檢查': true };
            }

            setActiveInspectionItem(newItem);
        }
    };

    const saveInspectionItem = async () => {
        if (!activeInspectionItem || !currentReport || !inspectingItem) return;

        // Update the report items
        const updatedItems = [...currentReport.items];
        const index = updatedItems.findIndex((i: any) => i.equipmentId === inspectingItem.id);

        if (index >= 0) {
            updatedItems[index] = activeInspectionItem;
        } else {
            updatedItems.push(activeInspectionItem);
        }

        const updatedReport = {
            ...currentReport,
            items: updatedItems,
            overallStatus: updatedItems.some(i => i.status === InspectionStatus.Abnormal) ? 'Fail' : 'In Progress'
        };

        // Save entire report to storage
        try {
            // 1. Save Report
            if (updatedReport.id.startsWith('draft_')) {
                const { id, ...reportData } = updatedReport;
                const newId = await StorageService.saveReport(reportData, user.uid);
                setCurrentReport({ ...updatedReport, id: newId });
            } else {
                await StorageService.updateReport(updatedReport as InspectionReport);
                setCurrentReport(updatedReport as InspectionReport);
            }

            // 2. Update Equipment Definition (Last Inspected Date)
            const updatedEquipment: EquipmentDefinition = {
                ...inspectingItem,
                lastInspectedDate: Date.now(),
                updatedAt: Date.now()
            };
            await StorageService.updateEquipmentDefinition(updatedEquipment);

            // 3. Update Local Equipment State
            setAllEquipment(prev => prev.map(e => e.id === updatedEquipment.id ? updatedEquipment : e));

            // 4. Check for Abnormal Status & Notification
            if (activeInspectionItem.status === InspectionStatus.Abnormal) {
                const emails = inspectingItem.notificationEmails || [];
                if (emails.length > 0) {
                    // Simulate Email Sending
                    console.log(`[Mock Email] Sending abnormal alert for ${inspectingItem.name} to:`, emails.join(', '));
                    alert(`統已發送異常通知至: ${emails.join(', ')}`);
                }
            }

            setInspectingItem(null); // Close modal
            setActiveInspectionItem(null);
        } catch (e) {
            console.error("Save failed", e);
            alert("儲存失敗");
        }
    };

    // Calculate Counts
    const totalCount = filteredEquipment.length;
    const inspectedCount = currentReport ? currentReport.items.length : 0; // Approximate. Should filter by equipmentId matches in filteredEquipment
    // More accurate count:
    const actualInspectedCount = filteredEquipment.filter(e => getInspectionStatus(e.id) !== 'PENDING').length;
    const uninspectedCount = totalCount - actualInspectedCount;


    // Render
    return (
        <div className="flex flex-col h-full bg-slate-50">
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

                    {/* Stats Section */}
                    {selectedSite && selectedBuilding && (
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">應檢查</p>
                                <p className="text-2xl font-black text-blue-700">{totalCount}</p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                                <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1">已完成</p>
                                <p className="text-2xl font-black text-green-700">{actualInspectedCount}</p>
                            </div>
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                                <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">未檢查</p>
                                <p className="text-2xl font-black text-red-700">{uninspectedCount}</p>
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
                                filteredEquipment.map(item => {
                                    const status = getInspectionStatus(item.id);
                                    const isDone = status !== 'PENDING';

                                    return (
                                        <div key={item.id}
                                            onClick={() => handleInspect(item)}
                                            className={`bg-white p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between hover:shadow-md
                                          ${isDone ? 'border-green-200 bg-green-50/30' : 'border-slate-200 hover:border-red-300'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm
                                                ${isDone ? 'bg-green-500' : 'bg-slate-300'}`}>
                                                    {isDone ? <CheckCircle className="w-5 h-5" /> : (filteredEquipment.indexOf(item) + 1)}
                                                </div>
                                                <div>
                                                    <h4 className={`font-bold ${isDone ? 'text-green-800' : 'text-slate-800'}`}>{item.name}</h4>
                                                    <p className="text-xs text-slate-500 font-mono">{item.barcode}</p>
                                                </div>
                                            </div>

                                            <div>
                                                {isDone ? (
                                                    <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">已檢查</span>
                                                ) : (
                                                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold group-hover:bg-red-50 group-hover:text-red-500">待檢查</span>
                                                )}
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
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">檢查: {inspectingItem.name}</h3>
                                <p className="text-xs text-slate-500">{inspectingItem.barcode}</p>
                            </div>
                            <button onClick={() => setInspectingItem(null)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Status Selection */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">設備狀態</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    {[InspectionStatus.Normal, InspectionStatus.Abnormal].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => setActiveInspectionItem({ ...activeInspectionItem, status })}
                                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeInspectionItem.status === status
                                                ? (status === InspectionStatus.Normal ? 'bg-white text-green-700 shadow ring-1 ring-green-200' : 'bg-white text-red-700 shadow ring-1 ring-red-200')
                                                : 'text-slate-500 hover:bg-slate-200'}`}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Check Items */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-500 uppercase">檢查項目</label>
                                {inspectingItem.checkItems.map(ci => {
                                    const val = activeInspectionItem.checkPoints[ci.name];
                                    const isNum = ci.inputType === 'number';

                                    // Validation Helper (Display Only)
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
                                        <div key={ci.id} className="p-3 border border-slate-200 rounded-xl bg-white hover:border-blue-300 transition-colors">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-slate-700">{ci.name}</span>
                                                {hint && <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">標準: {hint}</span>}
                                            </div>

                                            {isNum ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={val as number || ''}
                                                        onChange={(e) => {
                                                            const num = parseFloat(e.target.value);
                                                            const newPoints = { ...activeInspectionItem.checkPoints, [ci.name]: num };

                                                            // Auto Validation
                                                            let isAbnormal = false;
                                                            if (!isNaN(num) && ci.thresholdMode) {
                                                                if (ci.thresholdMode === 'range' && (num < (ci.val1 || 0) || num > (ci.val2 || 0))) isAbnormal = true;
                                                                if (ci.thresholdMode === 'gt' && num <= (ci.val1 || 0)) isAbnormal = true;
                                                                if (ci.thresholdMode === 'gte' && num < (ci.val1 || 0)) isAbnormal = true;
                                                                if (ci.thresholdMode === 'lt' && num >= (ci.val1 || 0)) isAbnormal = true;
                                                                if (ci.thresholdMode === 'lte' && num > (ci.val1 || 0)) isAbnormal = true;
                                                            }

                                                            setActiveInspectionItem(prev => ({
                                                                ...prev!,
                                                                checkPoints: newPoints,
                                                                status: isAbnormal ? InspectionStatus.Abnormal : prev!.status // Only auto-set to Abnormal, don't auto-clear
                                                            }));
                                                        }}
                                                        placeholder="輸入數值"
                                                        className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:border-red-500 focus:outline-none"
                                                    />
                                                    {ci.unit && <span className="text-slate-500 text-sm font-bold">{ci.unit}</span>}
                                                </div>
                                            ) : (
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors
                                                    ${val ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                                                        {!!val && <CheckCircle className="w-4 h-4 text-white" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={!!val}
                                                        onChange={(e) => {
                                                            const newPoints = { ...activeInspectionItem.checkPoints, [ci.name]: e.target.checked };
                                                            setActiveInspectionItem({ ...activeInspectionItem, checkPoints: newPoints });
                                                        }}
                                                    />
                                                    <span className="text-sm text-slate-500">合格</span>
                                                </label>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">備註</label>
                                <textarea
                                    value={activeInspectionItem.notes}
                                    onChange={(e) => setActiveInspectionItem({ ...activeInspectionItem, notes: e.target.value })}
                                    placeholder="如有異常請填寫說明..."
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:border-red-500 focus:outline-none min-h-[80px]"
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 flex gap-3">
                            <button
                                onClick={() => setInspectingItem(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={saveInspectionItem}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                            >
                                完成檢查
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChecklistInspection;
