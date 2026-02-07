import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Calendar, Search, ChevronRight, Printer, FileText, Clock, CheckCircle2, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query'; // Import queryClient
import { AbnormalRecord, UserProfile, InspectionStatus, LightSettings, SystemSettings } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAbnormalRecords, useEquipment, ABNORMAL_KEYS, EQUIPMENT_KEYS } from '../hooks/useSystemData';

interface AbnormalRecheckListProps {
    user: UserProfile;
    onBack: () => void;
    lightSettings?: LightSettings;
    onRecordsUpdated?: () => void;
    systemSettings?: SystemSettings;
}

// 常用修復說明 (快選)
const QUICK_FIX_TEMPLATES = [
    '更換故障零件，功能恢復正常',
    '清潔感應器與周邊環境，測試後正常',
    '重新設定系統參數，異常已排除',
    '緊固鬆脫部件，確認穩固',
    '更換消耗品（電池/燈泡），測試正常',
    '線路重新接線與整理，訊號恢復',
    '韌體更新至最新版本，問題解決',
    '外部廠商協助維修，已驗收',
    '設備已達使用年限，更換新品',
    '誤報，現場確認無異常',
    '環境因素導致（如潮濕/灰塵），已排除環境問題'
];

const AbnormalRecheckList: React.FC<AbnormalRecheckListProps> = ({
    user,
    onBack,
    lightSettings,
    onRecordsUpdated,
    systemSettings
}) => {
    const { t, language } = useLanguage();
    const queryClient = useQueryClient(); // Initialize queryClient
    // const [loading, setLoading] = useState(true); // Removed manual loading
    // const [records, setRecords] = useState<AbnormalRecord[]>([]); // Removed manual records state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<AbnormalRecord | null>(null);
    // const [equipmentPhotoMap, setEquipmentPhotoMap] = useState<Record<string, string>>({}); // Derived from equipmentData
    // const [equipmentTagMap, setEquipmentTagMap] = useState<Record<string, string[]>>({}); // Derived from equipmentData
    const [viewMode, setViewMode] = useState<'pending' | 'fixed'>('pending');

    // 1. Fetch Abnormal Records using Hook
    const { data: allRecords = [], isLoading: isLoadingRecords } = useAbnormalRecords(user);

    // 2. Derive Effective Organization ID (Guest Mode Logic)
    const effectiveOrgId = useMemo(() => {
        if (user.currentOrganizationId) return user.currentOrganizationId;
        if (allRecords.length > 0) {
            return allRecords.find(r => r.organizationId)?.organizationId || null;
        }
        return null;
    }, [user.currentOrganizationId, allRecords]);

    // 3. Fetch Equipment using Hook
    const { data: equipmentData = [], isLoading: isLoadingEquipment } = useEquipment(user, effectiveOrgId, { enabled: !!effectiveOrgId || !!user.currentOrganizationId });

    // 4. Derive Maps from Equipment Data
    const { equipmentPhotoMap, equipmentTagMap } = useMemo(() => {
        const photoMap: Record<string, string> = {};
        const tagMap: Record<string, string[]> = {};
        equipmentData.forEach(e => {
            if (e.photoUrl) photoMap[e.id] = e.photoUrl;
            if (e.tags && e.tags.length > 0) tagMap[e.id] = e.tags;
        });
        return { equipmentPhotoMap: photoMap, equipmentTagMap: tagMap };
    }, [equipmentData]);

    const records = useMemo(() => {
        return allRecords.filter(r => r.status === viewMode);
    }, [allRecords, viewMode]);

    const loading = isLoadingRecords; // || isLoadingEquipment; // Optional: Wait for equipment? Records are primary.

    const ticketNo = useMemo(() => {
        if (!selectedRecord) return '00000';
        // 使用紀錄的 ID 作為種子，確保同一筆紀錄每次打開單號都一樣 (Pseudo-random)
        let hash = 0;
        for (let i = 0; i < selectedRecord.id.length; i++) {
            hash = (hash << 5) - hash + selectedRecord.id.charCodeAt(i);
            hash |= 0;
        }
        const numericHash = Math.abs(hash);
        const random5 = (numericHash % 90000) + 10000;
        return random5.toString();
    }, [selectedRecord]);

    // 修復表單狀態
    const [fixedDate, setFixedDate] = useState('');
    const [fixedNotes, setFixedNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const printRef = useRef<HTMLDivElement>(null);

    // 初始化修復表單
    useEffect(() => {
        if (selectedRecord) {
            if (selectedRecord.status === 'fixed') {
                // 已完成：顯示已儲存的資料
                setFixedDate(selectedRecord.fixedDate ? new Date(selectedRecord.fixedDate).toISOString().split('T')[0] : '');
                setFixedNotes(selectedRecord.fixedNotes || '');
            } else {
                // 待複檢：清空表單
                setFixedDate(''); // 預設空白，讓用戶自行選擇
                setFixedNotes('');
            }
        }
    }, [selectedRecord]);

    const handlePrint = () => {
        window.print();
    };

    const handleDelete = async (record: AbnormalRecord, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('確定要刪除此筆紀錄嗎?\n(此動作無法復原)')) {
            try {
                await StorageService.deleteAbnormalRecord(record.id);
                // Refresh records
                queryClient.invalidateQueries({ queryKey: ABNORMAL_KEYS.all(user.uid, user.currentOrganizationId) });
                onRecordsUpdated?.();
            } catch (err) {
                console.error('Delete error:', err);
                alert(t('saveFailed'));
            }
        }
    };

    const handleQuickTextSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val) {
            setFixedNotes(prev => {
                // 如果原本有內容，換行後加入；否則直接加入
                return prev ? `${prev}\n${val}` : val;
            });
            // 重置 select (為了能重複選同一個，雖然 controlled component 比較難完全重置，這裡主要用於觸發)
            e.target.value = '';
        }
    };

    const handleSubmit = async () => {
        if (!selectedRecord) return;

        if (!fixedDate) {
            alert(t('fillRequired'));
            return;
        }

        if (!fixedNotes.trim()) {
            alert(t('fillRequired'));
            return;
        }

        setIsSubmitting(true);
        try {
            // Determine timestamp: If today, use NOW; else use selected date's noon (to avoid timezone edge cases)
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;

            let fixedDateTime: number;

            if (fixedDate === todayStr) {
                fixedDateTime = Date.now();
            } else {
                // Set to noon to be safe from 00:00 shifting
                const d = new Date(fixedDate);
                d.setHours(12, 0, 0, 0);
                fixedDateTime = d.getTime();
            }

            // 1. 更新異常記錄
            await StorageService.updateAbnormalRecord({
                ...selectedRecord,
                status: 'fixed',
                fixedDate: fixedDateTime,
                fixedNotes: fixedNotes.trim(),
                updatedAt: Date.now()
            });

            // 2. 更新設備的最後檢查日期
            try {
                const equipment = await StorageService.getEquipmentById(selectedRecord.equipmentId, user.uid, user.currentOrganizationId);
                if (equipment) {
                    console.log(`[AbnormalRecheck] Updating equipment ${equipment.name} (${equipment.barcode}) lastInspectedDate to ${new Date(fixedDateTime).toLocaleString()}`);
                    await StorageService.updateEquipment({
                        ...equipment,
                        lastInspectedDate: fixedDateTime
                    });
                } else {
                    console.warn(`[AbnormalRecheck] Equipment not found for ID: ${selectedRecord.equipmentId}`);
                }
            } catch (e) {
                console.error('Failed to update equipment:', e);
            }

            // 3. 找到並更新原始的異常 InspectionReport
            try {
                // 獲取所有 reports
                // Note: getReports default does NOT fetch items for Firestore. We need items to find the equipment.
                // Improvement: Fetch with items = true, OR filtering by date to minimize reads.
                // For robustness, let's try matching by date first (since inspectionDate is recorded).
                let allReports = await StorageService.getReports(user.uid, undefined, true, user.currentOrganizationId);

                // Fallback: If no items loaded (legacy/error), we might need to load items for reports near the date.
                // For now, getReports(uid, true) should handle it for Firestore.

                // 找到包含此設備的異常 report
                const originalReport = allReports.find(r =>
                    r.items?.some(item =>
                        item.equipmentId === selectedRecord.equipmentId &&
                        (item.status === InspectionStatus.Abnormal || (item.status as any) === 'Abnormal')
                    )
                );

                if (originalReport) {
                    // 更新原始 report
                    const updatedItems = originalReport.items.map(item => {
                        // Fix lint: use type assertion or cleaner check
                        const isAbnormalItem = item.status === InspectionStatus.Abnormal || (item.status as any) === 'Abnormal';

                        if (item.equipmentId === selectedRecord.equipmentId && isAbnormalItem) {
                            // 更新為已改善狀態 (Fixed)，並加入修復資訊
                            return {
                                ...item,
                                status: InspectionStatus.Fixed,
                                notes: `${item.notes || ''} [異常複檢 - 已修復]`,
                                lastUpdated: fixedDateTime,
                                repairDate: fixedDateTime,
                                repairNotes: fixedNotes.trim(),
                                abnormalItems: selectedRecord.abnormalItems, // Preserve original abnormal items
                                inspectionDate: selectedRecord.inspectionDate, // Preserve original inspection date
                                checkResults: item.checkResults ? item.checkResults.map((result: any) => {
                                    if (selectedRecord.abnormalItems.includes(result.name)) {
                                        return {
                                            ...result,
                                            value: 'true', // 修復後合格
                                            status: 'Normal' // 顯式更新狀態
                                        };
                                    }
                                    return result;
                                }) : selectedRecord.abnormalItems.map(itemName => ({
                                    name: itemName,
                                    value: 'true',
                                    unit: '',
                                    threshold: ''
                                }))
                            };
                        }
                        return item;
                    });

                    // 重新計算 overallStatus
                    const hasAbnormal = updatedItems.some(item => item.status === InspectionStatus.Abnormal);
                    const newOverallStatus: 'Pass' | 'Fail' = hasAbnormal ? 'Fail' : 'Pass';
                    const updatedReport = {
                        ...originalReport,
                        items: updatedItems,
                        overallStatus: newOverallStatus,
                        updatedAt: Date.now()
                    };

                    await StorageService.updateReport(updatedReport);
                    console.log('[AbnormalRecheck] Updated original report:', originalReport.id);
                } else {
                    console.warn('[AbnormalRecheck] Original report not found, creating new one');
                    // 如果找不到原始 report，建立新的
                    const newReport = {
                        id: `REP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        userId: user.uid,
                        equipmentId: selectedRecord.equipmentId,
                        equipmentName: selectedRecord.equipmentName,
                        buildingName: selectedRecord.buildingName,
                        floor: '',
                        area: selectedRecord.siteName,
                        date: fixedDateTime,
                        inspectorName: user.displayName || 'User',
                        overallStatus: 'Pass' as const,
                        items: [{
                            id: selectedRecord.equipmentId,
                            equipmentId: selectedRecord.equipmentId,
                            type: '消防設備',
                            name: selectedRecord.equipmentName,
                            barcode: selectedRecord.barcode || '',
                            location: selectedRecord.siteName,
                            status: InspectionStatus.Normal,
                            checkPoints: {},
                            checkResults: selectedRecord.abnormalItems.map(itemName => ({
                                name: itemName,
                                value: 'true',
                                unit: '',
                                threshold: ''
                            })),
                            notes: `[異常複檢]\n原因: ${selectedRecord.abnormalReason}\n修復日期: ${new Date(fixedDateTime).toLocaleDateString('zh-TW')}\n修復說明: ${fixedNotes.trim()}`,
                            lastUpdated: fixedDateTime,
                            photoUrl: selectedRecord.photoUrl || undefined
                        }],
                        note: `[異常複檢修復] ${fixedNotes.trim()}`,
                        organizationId: user.currentOrganizationId,
                        signature: '',
                        updatedAt: Date.now(),
                        archived: true
                    };
                    await StorageService.saveReport(newReport, user.uid, user.currentOrganizationId);
                }
            } catch (e) {
                console.error('Failed to update history report:', e);
            }

            alert(t('saveSuccess'));
            setSelectedRecord(null);
            // fetchRecords(); // Handled by invalidation
            queryClient.invalidateQueries({ queryKey: ABNORMAL_KEYS.all(user.uid, user.currentOrganizationId) });
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all(user.uid, effectiveOrgId) }); // Equipment lastInspectedDate changed
            onRecordsUpdated?.(); // Notify parent to refresh count
        } catch (e) {
            console.error('Submit error:', e);
            alert(t('saveFailed') + ': ' + (e instanceof Error ? e.message : '未知錯誤'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredRecords = records.filter(r =>
        r.equipmentName.includes(searchQuery) ||
        (r.barcode && r.barcode.includes(searchQuery)) ||
        r.siteName.includes(searchQuery) ||
        r.buildingName.includes(searchQuery)
    );

    return (
        <>
            <style>{`
                @media print {
                    @page { margin: 0; size: A4; }
                    body { background: white; -webkit-print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-area {
                        position: static;
                        width: 100%;
                        padding: 12mm !important;
                        border: none !important;
                        box-shadow: none !important;
                    }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #1e293b !important; padding: 4px 8px; }
                }

                .strict-table {
                    border-collapse: collapse;
                    width: 100%;
                    border: 1.5px solid #1e293b;
                    table-layout: fixed;
                }
                .strict-table th, .strict-table td {
                    border: 1px solid #1e293b;
                    padding: 8px;
                    text-align: left;
                    vertical-align: middle;
                    font-size: 14px;
                }
                .label-cell {
                    background-color: #f8fafc;
                    width: 110px;
                    font-weight: bold;
                    color: #334155;
                }
                .section-header {
                    background-color: #1e293b;
                    color: white;
                    text-align: left;
                    font-weight: bold;
                    font-size: 15px;
                    padding: 6px 10px !important;
                }
                .photo-cell {
                    width: 140px;
                    text-align: center;
                    background-color: #fff;
                }
                .signature-line {
                    border-bottom: 1.5px solid #1e293b;
                    display: inline-block;
                    width: 140px;
                    margin: 0 5px;
                }
                .value-cell {
                    background-color: #fff;
                    color: #0f172a;
                }
            `}</style>

            {selectedRecord ? (
                // 詳細複檢頁面 (統一表單樣式)
                <div className="flex flex-col h-full bg-slate-50">
                    <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40 no-print">
                        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedRecord(null)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                    <ArrowLeft className="w-6 h-6" />
                                </button>
                                <h1 className="font-bold text-lg text-slate-800">{t('abnormalRecheckForm')}</h1>
                            </div>
                            <button
                                onClick={handlePrint}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-bold transition-colors shadow-sm"
                            >
                                <Printer className="w-4 h-4" />
                                {t('printExport')}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-8 flex justify-center custom-scrollbar bg-slate-200">
                        {/* Paper Container */}
                        <div ref={printRef} className="print-area w-full max-w-[210mm] min-h-[297mm] bg-white shadow-xl mx-auto p-6 sm:p-12 text-black font-sans border border-gray-200">

                            {/* Paper Title Section */}
                            <div className="text-center mb-6">
                                <h1 className="text-3xl font-bold border-b-2 border-black pb-2 inline-block px-10">
                                    {t('abnormalRecheckForm')}
                                </h1>
                                <div className="flex justify-between items-center mt-4 px-2 text-sm">
                                    <span>{t('recheckNo')}：{ticketNo}</span>
                                    <span>{t('inspector')}：{user.displayName}</span>
                                </div>
                                <div className="border-b border-black mt-1" />
                            </div>

                            {/* Section I: Basic Info */}
                            <table className="strict-table">
                                <thead>
                                    <tr>
                                        <td colSpan={3} className="section-header">
                                            一、{t('equipmentBasicInfo')}
                                        </td>
                                    </tr>
                                </thead>

                                <tbody>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('siteName')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Site Name</div>
                                        </td>
                                        <td className="value-cell text-base">{selectedRecord.siteName}</td>
                                        <td rowSpan={5} className="photo-cell">
                                            <div className="text-[10px] mb-1 font-bold">
                                                <div>{t('equipmentPhoto')}</div>
                                                <div className="text-[8px] text-gray-400 font-normal uppercase">Photo</div>
                                            </div>
                                            {equipmentPhotoMap[selectedRecord.equipmentId] ? (
                                                <img
                                                    src={equipmentPhotoMap[selectedRecord.equipmentId]}
                                                    className="w-full h-auto max-h-[160px] object-contain mx-auto border border-gray-100"
                                                    alt="Equip"
                                                />
                                            ) : (
                                                <div className="h-32 flex items-center justify-center text-gray-300 border border-dashed border-gray-200">
                                                    (NO PHOTO)
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('buildingName')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Building</div>
                                        </td>
                                        <td className="value-cell text-base">{selectedRecord.buildingName}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('equipmentName')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Equipment</div>
                                        </td>
                                        <td className="value-cell text-base">{selectedRecord.equipmentName}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('equipmentId')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">ID / Barcode</div>
                                        </td>
                                        <td className="value-cell font-mono text-base">{selectedRecord.barcode || '---'}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('tags')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Tags</div>
                                        </td>
                                        <td className="value-cell">
                                            <div className="flex flex-wrap gap-1">
                                                {(selectedRecord.tags || equipmentTagMap[selectedRecord.equipmentId] || []).map(tag => (
                                                    <span key={tag} className="px-1 border border-black text-[10px] font-bold">#{tag}</span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Section II: Abnormal record */}
                            <table className="strict-table border-t-0">
                                <thead>
                                    <tr>
                                        <td colSpan={4} className="section-header border-t-0">
                                            二、{t('abnormalInfo')}
                                        </td>
                                    </tr>
                                </thead>

                                <tbody>
                                    <tr>
                                        <td className="label-cell" style={{ width: '15%' }}>
                                            <div>{t('discoveryDate')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Dated</div>
                                        </td>
                                        <td className="value-cell" style={{ width: '35%' }}>{new Date(selectedRecord.inspectionDate).toLocaleDateString()}</td>
                                        <td className="label-cell" style={{ width: '15%' }}>
                                            <div>{t('abnormalCategory')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Category</div>
                                        </td>
                                        <td className="value-cell">{selectedRecord.abnormalItems?.join(', ') || 'General'}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('inspectionResult')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Result</div>
                                        </td>
                                        <td className="value-cell font-bold text-red-600" colSpan={3}>
                                            {selectedRecord.abnormalValue || 'FAIL'}
                                            {selectedRecord.thresholdMode && <span className="text-[10px] ml-1 font-normal text-gray-400">({selectedRecord.thresholdMode})</span>}
                                        </td>
                                    </tr>

                                    <tr>
                                        <td colSpan={4} className="label-cell">
                                            <div>{t('abnormalDescription')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Abnormal Description</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colSpan={4} className="h-12 align-top p-4 leading-relaxed whitespace-pre-wrap">
                                            {selectedRecord.abnormalReason}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Section III: Repair report */}
                            <table className="strict-table border-t-0">
                                <thead>
                                    <tr>
                                        <td colSpan={2} className="section-header border-t-0">
                                            三、{t('repairReport')}
                                        </td>
                                    </tr>
                                </thead>

                                <tbody>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('repairDate')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Repair Date</div>
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="date"
                                                value={fixedDate}
                                                onChange={(e) => setFixedDate(e.target.value)}
                                                disabled={selectedRecord.status === 'fixed'}
                                                className="px-3 py-1 border-2 border-gray-200 rounded focus:border-black outline-none font-bold disabled:bg-white print:border-none"
                                            />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell align-top py-4" style={{ verticalAlign: 'top' }}>
                                            <div>{t('repairNotes')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Repair Notes</div>
                                        </td>
                                        <td className="p-2">
                                            <textarea
                                                value={fixedNotes}
                                                onChange={(e) => setFixedNotes(e.target.value)}
                                                placeholder={t('repairNotesPlaceholder')}
                                                disabled={selectedRecord.status === 'fixed'}
                                                className="w-full h-16 p-2 bg-gray-50 border border-gray-200 rounded focus:border-black outline-none resize-none disabled:bg-white print:border-none print:p-0 leading-relaxed"
                                            />
                                            {selectedRecord.status === 'pending' && (
                                                <div className="flex justify-start mt-1 no-print">
                                                    <select
                                                        className="w-full text-[11px] border border-gray-300 rounded px-1 py-0.5 bg-gray-50 focus:border-black outline-none"
                                                        onChange={handleQuickTextSelect}
                                                        defaultValue=""
                                                    >
                                                        <option value="" disabled>{t('quickFixTemplate')}</option>
                                                        {QUICK_FIX_TEMPLATES.map((tpl, i) => (
                                                            <option key={i} value={tpl}>{tpl}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Footer Signatures */}
                            <div className="flex justify-between items-end mt-4 px-2">
                                <div className="text-center">
                                    <span className="font-bold text-sm">{t('technicianSig')}：</span>
                                    <div className="text-[9px] text-gray-400 font-normal uppercase">Technician Signature</div>
                                    <div className="signature-line mt-1" />
                                </div>
                                <div className="text-center">
                                    <span className="font-bold text-sm">{t('supervisorSig')}：</span>
                                    <div className="text-[9px] text-gray-400 font-normal uppercase">Supervisor Signature</div>
                                    <div className="signature-line mt-1" />
                                </div>
                            </div>

                            {/* Submit Button (Screen Only) */}
                            {selectedRecord.status === 'pending' && (
                                <div className="mt-4 mb-2 no-print flex justify-center">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                        className="px-8 py-2.5 bg-slate-800 text-white hover:bg-slate-900 font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        {t('confirmSubmit')}
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>


                </div>
            ) : (
                // 列表頁面 (保持不變)
                <div className="flex flex-col h-full bg-slate-50 relative">
                    <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
                        <div className="max-w-7xl mx-auto px-4 py-2 sm:py-3">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <div className="flex items-center gap-2">
                                    <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                        <ArrowLeft className="w-6 h-6" />
                                    </button>
                                    <h1 className="font-bold text-lg text-slate-800 whitespace-nowrap">{t('abnormalRecheckList')}</h1>
                                    <span className={`sm:hidden ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${viewMode === 'pending'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-green-100 text-green-700'
                                        }`}>
                                        {filteredRecords.length}{t('recordsCountSuffix')}
                                    </span>
                                </div>

                                {/* 切換按鈕 */}
                                <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto sm:ml-auto">
                                    <button
                                        onClick={() => setViewMode('pending')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm transition-all ${viewMode === 'pending'
                                            ? 'bg-white text-red-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                    >
                                        <Clock className="w-4 h-4" />
                                        {t('pending')}
                                    </button>
                                    {(user.role === 'admin' || systemSettings?.allowInspectorViewCompletedRechecks !== false) && (
                                        <button
                                            onClick={() => setViewMode('fixed')}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm transition-all ${viewMode === 'fixed'
                                                ? 'bg-white text-emerald-600 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                                }`}
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            {t('completed')}
                                        </button>
                                    )}
                                </div>

                                <span className={`hidden sm:inline-block px-3 py-1 rounded-full text-sm font-bold ${viewMode === 'pending'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-green-100 text-green-700'
                                    }`}>
                                    {filteredRecords.length}{t('recordsCountSuffix')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                        <div className="max-w-4xl mx-auto">
                            <div className="mb-6 relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                                    placeholder={t('searchAbnormalPlaceholder')}
                                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-all shadow-sm text-base"
                                    style={{ fontSize: '16px' }}
                                />
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-20">
                                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-orange-600"></div>
                                </div>
                            ) : filteredRecords.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
                                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                                    <h3 className="text-lg font-bold text-slate-700">
                                        {viewMode === 'pending' ? t('noPendingRecords') : t('noCompletedRecords')}
                                    </h3>
                                    <p className="text-slate-500 text-sm mt-1">
                                        {viewMode === 'pending' ? t('allAbnormalFixed') : t('noFixedYet')}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredRecords.map(record => {
                                        const photoUrl = equipmentPhotoMap[record.equipmentId];
                                        return (
                                            <div
                                                key={record.id}
                                                onClick={() => setSelectedRecord(record)}
                                                className="bg-white p-5 rounded-2xl border border-orange-200 hover:border-orange-400 hover:shadow-xl transition-all cursor-pointer group flex flex-col sm:flex-row overflow-hidden"
                                            >
                                                <div className="flex-1 flex flex-col">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${viewMode === 'pending'
                                                                    ? 'bg-orange-100 text-orange-700'
                                                                    : 'bg-green-100 text-green-700'
                                                                    }`}>
                                                                    {viewMode === 'pending' ? t('pendingRecheck') : t('completedRecheck')}
                                                                </span>
                                                                <h3 className={`font-bold text-slate-800 text-lg transition-colors ${viewMode === 'pending' ? 'group-hover:text-orange-600' : 'group-hover:text-green-600'
                                                                    }`}>
                                                                    {record.equipmentName}
                                                                </h3>
                                                                {record.barcode && (
                                                                    <span className="text-sm text-slate-500 font-mono bg-slate-100 px-1 rounded">
                                                                        {record.barcode}
                                                                    </span>
                                                                )}
                                                                {/* Tags in List */}
                                                                <div className="flex flex-wrap gap-1">
                                                                    {(record.tags || equipmentTagMap[record.equipmentId] || []).map(tag => (
                                                                        <span key={tag} className="px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded text-[10px] font-bold">
                                                                            #{tag}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            <div className="text-sm text-slate-500 space-y-1 mb-3">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="bg-slate-100 px-1.5 rounded text-xs">{t('siteName')}</span>
                                                                    {record.siteName} / {record.buildingName}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Calendar className="w-4 h-4" />
                                                                    {t('discoveryDate')}: {new Date(record.inspectionDate).toLocaleDateString(language)}
                                                                </div>
                                                            </div>

                                                            <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-3">
                                                                <div
                                                                    className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-300 shrink-0 mt-0.5"
                                                                    style={lightSettings?.abnormal?.color ? { backgroundColor: lightSettings.abnormal.color } : {}}
                                                                />
                                                                <div>
                                                                    <p className="text-xs font-bold text-red-500 mb-1">
                                                                        {t('abnormalReason')}
                                                                    </p>
                                                                    <p className="text-slate-700 font-medium line-clamp-2">{record.abnormalReason}</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-2 shrink-0 self-center items-center">
                                                            <ChevronRight className="w-6 h-6 text-slate-400 group-hover:text-orange-500 transition-colors" />
                                                            {(user.role === 'admin' || systemSettings?.allowInspectorDeleteAbnormal) && (
                                                                <button
                                                                    onClick={(e) => handleDelete(record, e)}
                                                                    className="p-2 -m-2 mt-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                                    title="刪除"
                                                                >
                                                                    <Trash2 className="w-5 h-5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div >
            )}
        </>
    );
};

export default AbnormalRecheckList;
