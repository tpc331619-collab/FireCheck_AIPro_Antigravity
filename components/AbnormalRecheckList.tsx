import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Calendar, Search, ChevronRight, Printer, FileText, Clock, CheckCircle2, Trash2, Camera, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query'; // Import queryClient
import { AbnormalRecord, UserProfile, InspectionStatus, LightSettings, SystemSettings } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAbnormalRecords, useEquipment, ABNORMAL_KEYS, EQUIPMENT_KEYS, HISTORY_KEYS } from '../hooks/useSystemData';

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
    const [fixedPhotoUrl, setFixedPhotoUrl] = useState('');
    const [isUploadingFixedPhoto, setIsUploadingFixedPhoto] = useState(false);
    const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const printRef = useRef<HTMLDivElement>(null);

    const handleFixedPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingFixedPhoto(true);
        try {
            const url = await StorageService.uploadInspectionPhoto(file, user.uid, user.currentOrganizationId, 'repair');
            setFixedPhotoUrl(url);
        } catch (err) {
            console.error('Failed to upload repair photo:', err);
            alert('照片上傳失敗，請重試');
        } finally {
            setIsUploadingFixedPhoto(false);
            e.target.value = '';
        }
    };

    // 初始化修復表單
    useEffect(() => {
        if (selectedRecord) {
            if (selectedRecord.status === 'fixed') {
                // 已完成：顯示已儲存的資料
                setFixedDate(selectedRecord.fixedDate ? new Date(selectedRecord.fixedDate).toISOString().split('T')[0] : '');
                setFixedNotes(selectedRecord.fixedNotes || '');
                setFixedPhotoUrl(selectedRecord.fixedPhotoUrl || '');
            } else {
                // 待複檢：清空表單
                setFixedDate(''); // 預設空白，讓用戶自行選擇
                setFixedNotes('');
                setFixedPhotoUrl(selectedRecord.fixedPhotoUrl || '');
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
                ...(fixedPhotoUrl ? { fixedPhotoUrl } : {}),
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
                                abnormalPhotoUrl: selectedRecord.abnormalPhotoUrl || selectedRecord.photoUrl || item.abnormalPhotoUrl || item.photoUrl,
                                ...(fixedPhotoUrl ? { repairPhotoUrl: fixedPhotoUrl } : {}),
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
                    // Invalidate history query to update dashboard stats
                    queryClient.invalidateQueries({ queryKey: HISTORY_KEYS.all(user.uid, user.currentOrganizationId, new Date().getFullYear()) });
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
                            photoUrl: selectedRecord.abnormalPhotoUrl || selectedRecord.photoUrl || undefined,
                            abnormalPhotoUrl: selectedRecord.abnormalPhotoUrl || selectedRecord.photoUrl || undefined,
                            repairPhotoUrl: fixedPhotoUrl || undefined
                        }],
                        note: `[異常複檢修復] ${fixedNotes.trim()}`,
                        organizationId: user.currentOrganizationId,
                        signature: '',
                        updatedAt: Date.now(),
                        archived: true
                    };
                    await StorageService.saveReport(newReport, user.uid, user.currentOrganizationId);
                    // Invalidate history query to update dashboard stats
                    queryClient.invalidateQueries({ queryKey: HISTORY_KEYS.all(user.uid, user.currentOrganizationId, new Date().getFullYear()) });
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
                        <div ref={printRef} className="print-area relative overflow-hidden w-full max-w-[210mm] min-h-[297mm] bg-white shadow-xl mx-auto p-6 sm:p-12 text-black font-sans border border-gray-200">

                            {/* 已修復：紙張中央大型斜向防偽浮水印 + 右上工程驗收印鑑章 */}
                            {selectedRecord.status === 'fixed' && (
                                <>
                                    {/* 背景大型斜向浮水印 */}
                                    <div
                                        aria-hidden="true"
                                        className="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-20"
                                    >
                                        <div className="-rotate-[28deg] text-emerald-600/[0.08] font-black tracking-[0.25em] text-[64px] sm:text-[96px] whitespace-nowrap border-y-8 border-emerald-600/[0.08] py-2 px-10">
                                            已修復 RESOLVED
                                        </div>
                                    </div>

                                    {/* 右上角斜向雙框工程驗收印鑑章 */}
                                    <div
                                        aria-hidden="true"
                                        className="pointer-events-none select-none absolute top-5 right-5 sm:top-8 sm:right-12 z-20 -rotate-12"
                                    >
                                        <div className="border-[3px] border-emerald-600/85 rounded-lg p-1 text-emerald-600/90 shadow-sm bg-white/75">
                                            <div className="border border-emerald-600/75 rounded px-3 py-1.5 text-center leading-none">
                                                <div className="text-[9px] font-extrabold tracking-[0.2em] border-b border-emerald-600/50 pb-1 mb-1">
                                                    FSIPPRO VERIFIED
                                                </div>
                                                <div className="text-xl sm:text-2xl font-black tracking-[0.25em] pl-1 my-0.5">
                                                    已修復
                                                </div>
                                                <div className="text-[10px] font-mono font-bold border-t border-emerald-600/50 pt-1 mt-1 tracking-wider">
                                                    {selectedRecord.fixedDate
                                                        ? new Date(selectedRecord.fixedDate).toLocaleDateString('zh-TW')
                                                        : fixedDate.replace(/-/g, '/')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Paper Title Section */}
                            <div className="text-center mb-6 relative z-10">
                                <div className="inline-flex items-center gap-2 mb-2">
                                    <span className={`px-3 py-0.5 rounded-full text-xs font-bold border ${
                                        selectedRecord.status === 'fixed'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                            : 'bg-red-50 text-red-700 border-red-300'
                                    }`}>
                                        {selectedRecord.status === 'fixed' ? '✓ 已完成修復結案' : '● 待複檢處理'}
                                    </span>
                                </div>
                                <br />
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
                                <colgroup>
                                    <col style={{ width: '115px' }} />
                                    <col />
                                    <col style={{ width: '148px' }} />
                                </colgroup>
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
                                                    onClick={() => setPreviewPhotoUrl(equipmentPhotoMap[selectedRecord.equipmentId])}
                                                    className="w-full h-auto max-h-[150px] object-contain mx-auto border border-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                                                    title="點擊放大檢視"
                                                    alt="Equip"
                                                />
                                            ) : (
                                                <div className="h-32 flex items-center justify-center text-gray-300 border border-dashed border-gray-200 text-xs">
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
                                <colgroup>
                                    <col style={{ width: '115px' }} />
                                    <col />
                                    <col style={{ width: '115px' }} />
                                    <col />
                                    <col style={{ width: '148px' }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <td colSpan={5} className="section-header border-t-0">
                                            二、{t('abnormalInfo')}
                                        </td>
                                    </tr>
                                </thead>

                                <tbody>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('discoveryDate')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Dated</div>
                                        </td>
                                        <td className="value-cell text-red-600 font-bold">{new Date(selectedRecord.inspectionDate).toLocaleDateString()}</td>
                                        <td className="label-cell">
                                            <div>{t('abnormalCategory')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Category</div>
                                        </td>
                                        <td className="value-cell text-red-600 font-bold">{selectedRecord.abnormalItems?.join(', ') || 'General'}</td>
                                        <td rowSpan={4} className="photo-cell">
                                            <div className="text-[10px] mb-1 font-bold text-red-700">
                                                <div>異常現場照片</div>
                                                <div className="text-[8px] text-gray-400 font-normal uppercase">Abnormal Photo</div>
                                            </div>
                                            {(selectedRecord.abnormalPhotoUrl || selectedRecord.photoUrl) ? (
                                                <img
                                                    src={selectedRecord.abnormalPhotoUrl || selectedRecord.photoUrl}
                                                    onClick={() => setPreviewPhotoUrl((selectedRecord.abnormalPhotoUrl || selectedRecord.photoUrl)!)}
                                                    className="w-full h-auto max-h-[140px] object-contain mx-auto border border-red-100 cursor-pointer hover:opacity-90 transition-opacity"
                                                    title="點擊放大檢視異常照片"
                                                    alt="Abnormal"
                                                />
                                            ) : (
                                                <div className="h-28 flex items-center justify-center text-gray-300 border border-dashed border-gray-200 text-xs">
                                                    (NO PHOTO)
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">
                                            <div>{t('inspectionResult')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Result</div>
                                        </td>
                                        <td className="value-cell font-bold text-red-600" colSpan={3}>
                                            <div className="flex flex-col">
                                                <span className="text-red-600 font-bold">
                                                    {selectedRecord.abnormalValue || 'FAIL'}
                                                    {(() => {
                                                        const equipment = equipmentData.find(e => e.id === selectedRecord.equipmentId);
                                                        const checkItem = equipment?.checkItems?.find(item => selectedRecord.abnormalItems?.includes(item.name));
                                                        if (checkItem) {
                                                            let specText = '';
                                                            if (checkItem.inputType === 'number') {
                                                                const unit = checkItem.unit || '';
                                                                if (checkItem.thresholdMode === 'range') {
                                                                    specText = `(標準: ${checkItem.val1}~${checkItem.val2} ${unit})`;
                                                                } else if (checkItem.thresholdMode === 'gt') {
                                                                    specText = `(標準: > ${checkItem.val1} ${unit})`;
                                                                } else if (checkItem.thresholdMode === 'gte') {
                                                                    specText = `(標準: ≥ ${checkItem.val1} ${unit})`;
                                                                } else if (checkItem.thresholdMode === 'lt') {
                                                                    specText = `(標準: < ${checkItem.val1} ${unit})`;
                                                                } else if (checkItem.thresholdMode === 'lte') {
                                                                    specText = `(標準: ≤ ${checkItem.val1} ${unit})`;
                                                                }
                                                            }
                                                            return specText && <span className="ml-2 text-red-600 font-bold">{specText}</span>;
                                                        }
                                                        return selectedRecord.thresholdMode && <span className="text-[10px] ml-1 font-bold text-red-600">({selectedRecord.thresholdMode})</span>;
                                                    })()}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>

                                    <tr>
                                        <td colSpan={4} className="label-cell">
                                            <div>{t('abnormalDescription')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Abnormal Description</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colSpan={4} className="h-14 align-top p-3 leading-relaxed whitespace-pre-wrap text-red-600 font-bold">
                                            {selectedRecord.abnormalReason}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Section III: Repair report */}
                            <table className="strict-table border-t-0 relative z-10">
                                <colgroup>
                                    <col style={{ width: '115px' }} />
                                    <col />
                                    <col style={{ width: '148px' }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <td colSpan={3} className="section-header border-t-0">
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
                                            {selectedRecord.status === 'fixed' ? (
                                                <div className="flex items-center gap-3 px-2 py-1">
                                                    <span className="font-bold text-emerald-700 text-base">
                                                        {selectedRecord.fixedDate
                                                            ? new Date(selectedRecord.fixedDate).toLocaleDateString('zh-TW')
                                                            : fixedDate.replace(/-/g, '/')}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 text-xs font-bold">
                                                        ✓ 複檢合格 (PASS)
                                                    </span>
                                                </div>
                                            ) : (
                                                <input
                                                    type="date"
                                                    value={fixedDate}
                                                    onChange={(e) => setFixedDate(e.target.value)}
                                                    className="px-3 py-1 border-2 border-gray-200 rounded focus:border-black outline-none font-bold print:border-none"
                                                />
                                            )}
                                        </td>
                                        <td rowSpan={2} className="photo-cell">
                                            <div className="text-[10px] mb-1 font-bold text-emerald-800">
                                                <div>改善後照片</div>
                                                <div className="text-[8px] text-gray-400 font-normal uppercase">Repair Photo</div>
                                            </div>
                                            {(fixedPhotoUrl || selectedRecord.fixedPhotoUrl) ? (
                                                <div className="relative group">
                                                    <img
                                                        src={fixedPhotoUrl || selectedRecord.fixedPhotoUrl}
                                                        onClick={() => setPreviewPhotoUrl((fixedPhotoUrl || selectedRecord.fixedPhotoUrl)!)}
                                                        className="w-full h-auto max-h-[125px] object-contain mx-auto border border-emerald-100 cursor-pointer hover:opacity-90 transition-opacity"
                                                        title="點擊放大檢視改善後照片"
                                                        alt="Repair"
                                                    />
                                                    {selectedRecord.status === 'pending' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setFixedPhotoUrl('')}
                                                            className="no-print mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-[10px] font-bold transition-colors cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3 h-3" /> 移除重拍
                                                        </button>
                                                    )}
                                                </div>
                                            ) : selectedRecord.status === 'pending' ? (
                                                <>
                                                    <label className={`no-print h-28 flex flex-col items-center justify-center gap-1.5 px-2 text-emerald-700 bg-emerald-50/40 hover:bg-emerald-50 border border-dashed border-emerald-300 rounded cursor-pointer transition-colors ${isUploadingFixedPhoto ? 'opacity-60 pointer-events-none' : ''}`}>
                                                        {isUploadingFixedPhoto ? (
                                                            <>
                                                                <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                                                <span className="text-[10px] font-bold">上傳中...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Camera className="w-5 h-5 text-emerald-600" />
                                                                <span className="text-[10px] font-bold leading-tight">拍攝/上傳<br />改善後照片</span>
                                                            </>
                                                        )}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleFixedPhotoUpload}
                                                            className="hidden"
                                                            disabled={isUploadingFixedPhoto}
                                                        />
                                                    </label>
                                                    <div className="hidden print:flex h-28 items-center justify-center text-gray-300 border border-dashed border-gray-200 text-xs">
                                                        (NO PHOTO)
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="h-28 flex items-center justify-center text-gray-300 border border-dashed border-gray-200 text-xs">
                                                    (NO PHOTO)
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell align-top py-4" style={{ verticalAlign: 'top' }}>
                                            <div>{t('repairNotes')}</div>
                                            <div className="text-[9px] text-gray-400 font-normal uppercase leading-tight">Repair Notes</div>
                                        </td>
                                        <td className="p-2">
                                            {selectedRecord.status === 'fixed' ? (
                                                <div className="px-2 py-2 min-h-[4.5rem] text-emerald-800 font-bold whitespace-pre-wrap leading-relaxed">
                                                    {fixedNotes || selectedRecord.fixedNotes || '---'}
                                                </div>
                                            ) : (
                                                <>
                                                    <textarea
                                                        value={fixedNotes}
                                                        onChange={(e) => setFixedNotes(e.target.value)}
                                                        placeholder={t('repairNotesPlaceholder')}
                                                        className="w-full h-16 p-2 bg-gray-50 border border-gray-200 rounded focus:border-black outline-none resize-none print:border-none print:p-0 leading-relaxed"
                                                    />
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
                                                </>
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
                <div className="flex flex-col h-full bg-slate-100/80 relative">
                    <div className="bg-white shadow-sm border-b border-slate-200/80 sticky top-0 z-40">
                        <div className="max-w-7xl mx-auto px-4 py-2 sm:py-3">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <div className="flex items-center gap-2">
                                    <button onClick={onBack} className="p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer">
                                        <ArrowLeft className="w-6 h-6" />
                                    </button>
                                    <h1 className="font-extrabold text-lg text-slate-900 whitespace-nowrap">{t('abnormalRecheckList')}</h1>
                                    <span className={`sm:hidden ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${viewMode === 'pending'
                                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                                        : 'bg-green-100 text-green-700 border border-green-200'
                                        }`}>
                                        {filteredRecords.length}{t('recordsCountSuffix')}
                                    </span>
                                </div>

                                {/* 切換按鈕 */}
                                <div className="flex bg-slate-200/70 p-1 rounded-xl w-full sm:w-auto sm:ml-auto border border-slate-300/80">
                                    <button
                                        onClick={() => setViewMode('pending')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm transition-all cursor-pointer ${viewMode === 'pending'
                                            ? 'bg-white text-red-600 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                    >
                                        <Clock className="w-4 h-4" />
                                        {t('pending')}
                                    </button>
                                    {(user.role === 'admin' || systemSettings?.allowInspectorViewCompletedRechecks !== false) && (
                                        <button
                                            onClick={() => setViewMode('fixed')}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm transition-all cursor-pointer ${viewMode === 'fixed'
                                                ? 'bg-white text-emerald-600 shadow-sm'
                                                : 'text-slate-600 hover:text-slate-900'
                                                }`}
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            {t('completed')}
                                        </button>
                                    )}
                                </div>

                                <span className={`hidden sm:inline-block px-3 py-1 rounded-full text-sm font-bold border ${viewMode === 'pending'
                                    ? 'bg-orange-50 text-orange-800 border-orange-200 shadow-sm'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-sm'
                                    }`}>
                                    {filteredRecords.length}{t('recordsCountSuffix')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                        <div className="max-w-4xl mx-auto">
                            <div className="mb-6 relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-slate-500" />
                                </div>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                                    placeholder={t('searchAbnormalPlaceholder')}
                                    className="block w-full pl-11 pr-3 py-3 border border-slate-300 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all shadow-sm text-base text-slate-900 font-semibold"
                                    style={{ fontSize: '16px' }}
                                />
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-20">
                                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-orange-600"></div>
                                </div>
                            ) : filteredRecords.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.04)] border border-slate-300/80">
                                    <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4 shadow-inner">
                                        <CheckCircle className="w-12 h-12 text-emerald-500" />
                                    </div>
                                    <h3 className="text-xl font-extrabold text-slate-800">
                                        {viewMode === 'pending' ? t('noPendingRecords') : t('noCompletedRecords')}
                                    </h3>
                                    <p className="text-slate-500 text-sm mt-2 font-medium">
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
                                                className={`relative bg-white p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col sm:flex-row overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 ${
                                                    viewMode === 'pending'
                                                        ? 'border-orange-300 hover:border-orange-500 hover:shadow-xl'
                                                        : 'border-emerald-300 hover:border-emerald-500 hover:shadow-xl'
                                                }`}
                                            >
                                                {/* 已完成卡片右上斜向微浮水印章 */}
                                                {viewMode === 'fixed' && (
                                                    <div
                                                        aria-hidden="true"
                                                        className="pointer-events-none select-none absolute top-3 right-12 -rotate-12 border-2 border-emerald-500/30 rounded px-2 py-0.5 text-emerald-600/35 font-black text-xs tracking-widest"
                                                    >
                                                        已修復
                                                    </div>
                                                )}
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
                                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Calendar className="w-4 h-4" />
                                                                        {t('discoveryDate')}: {new Date(record.inspectionDate).toLocaleDateString(language)}
                                                                    </div>
                                                                    {viewMode === 'fixed' && record.fixedDate && (
                                                                        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                                                                            <CheckCircle2 className="w-4 h-4" />
                                                                            {t('repairDate')}: {new Date(record.fixedDate).toLocaleDateString(language)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className={`grid gap-2 ${viewMode === 'fixed' ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
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

                                                                {viewMode === 'fixed' && (
                                                                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 flex items-start gap-3">
                                                                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-200 shrink-0 mt-0.5">
                                                                            <CheckCircle className="w-4 h-4" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs font-bold text-emerald-700 mb-1">
                                                                                {t('repairNotes')}
                                                                            </p>
                                                                            <p className="text-slate-700 font-medium line-clamp-2">{record.fixedNotes || '已修復'}</p>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-2 shrink-0 self-center items-center">
                                                            <ChevronRight className={`w-6 h-6 text-slate-400 transition-colors ${viewMode === 'pending' ? 'group-hover:text-orange-500' : 'group-hover:text-emerald-500'}`} />
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

            {/* 照片放大檢視視窗 */}
            {previewPhotoUrl && (
                <div
                    className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in no-print"
                    onClick={() => setPreviewPhotoUrl(null)}
                >
                    <div
                        className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                            <span className="text-sm font-bold">照片檢視</span>
                            <button
                                onClick={() => setPreviewPhotoUrl(null)}
                                className="p-1 hover:bg-slate-700 rounded-full transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[80vh]">
                            <img
                                src={previewPhotoUrl}
                                alt="Preview"
                                className="max-w-full max-h-[72vh] object-contain rounded-lg shadow"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AbnormalRecheckList;
