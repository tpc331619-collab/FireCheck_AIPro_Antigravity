import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Calendar, Search, ChevronRight, Printer, FileText } from 'lucide-react';
import { AbnormalRecord, UserProfile, InspectionStatus } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';

interface AbnormalRecheckListProps {
    user: UserProfile;
    onBack: () => void;
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

const AbnormalRecheckList: React.FC<AbnormalRecheckListProps> = ({ user, onBack }) => {
    const { t, language } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AbnormalRecord[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<AbnormalRecord | null>(null);

    // 修復表單狀態
    const [fixedDate, setFixedDate] = useState('');
    const [fixedNotes, setFixedNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const printRef = useRef<HTMLDivElement>(null);

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const data = await StorageService.getAbnormalRecords(user.uid);
            // 只顯示待複檢的記錄
            setRecords(data.filter(r => r.status === 'pending'));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, [user.uid]);

    // 初始化修復時間為當前日期
    useEffect(() => {
        if (selectedRecord) {
            const now = new Date();
            setFixedDate(now.toISOString().split('T')[0]);
            setFixedNotes('');
        }
    }, [selectedRecord]);

    const handlePrint = () => {
        window.print();
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
            alert('請選擇修復日期');
            return;
        }

        if (!fixedNotes.trim()) {
            alert('請輸入修復情況說明');
            return;
        }

        setIsSubmitting(true);
        try {
            // 設定為當天結束前或當前時間
            const fixedDateTime = new Date(fixedDate).getTime();

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
                const equipment = await StorageService.getEquipmentById(selectedRecord.equipmentId, user.uid);
                if (equipment) {
                    await StorageService.updateEquipment({
                        ...equipment,
                        lastInspectedDate: fixedDateTime
                    });
                }
            } catch (e) {
                console.error('Failed to update equipment:', e);
            }

            // 3. 找到並更新原始的異常 InspectionReport
            try {
                // 獲取所有 reports
                const allReports = await StorageService.getReports(user.uid);

                // 找到包含此設備的異常 report（不限制日期，因為可能很久以前的異常才修復）
                const originalReport = allReports.find(r =>
                    r.items?.some(item =>
                        item.equipmentId === selectedRecord.equipmentId &&
                        item.status === InspectionStatus.Abnormal
                    )
                );

                if (originalReport) {
                    // 更新原始 report
                    const updatedItems = originalReport.items.map(item => {
                        if (item.equipmentId === selectedRecord.equipmentId && item.status === InspectionStatus.Abnormal) {
                            // 更新為正常狀態，並加入修復資訊
                            return {
                                ...item,
                                status: InspectionStatus.Normal,
                                notes: `${item.notes || ''}\n\n[異常複檢 - 已修復]\n修復日期: ${new Date(fixedDateTime).toLocaleDateString('zh-TW')}\n修復說明: ${fixedNotes.trim()}`,
                                lastUpdated: fixedDateTime,
                                checkResults: selectedRecord.abnormalItems.map(itemName => ({
                                    name: itemName,
                                    value: 'true', // 修復後合格
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
                        signature: '',
                        updatedAt: Date.now(),
                        archived: true
                    };
                    await StorageService.saveReport(newReport, user.uid);
                }
            } catch (e) {
                console.error('Failed to update history report:', e);
            }

            alert('修復記錄已儲存並同步');
            setSelectedRecord(null);
            fetchRecords();
        } catch (e) {
            console.error('Submit error:', e);
            alert('儲存失敗: ' + (e instanceof Error ? e.message : '未知錯誤'));
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
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 210mm; /* A4 width */
                        min-height: 297mm; /* A4 height */
                        padding: 15mm;
                        background: white;
                        color: black;
                        font-family: "Times New Roman", "DFKai-SB", sans-serif; /* 標楷體更像正式文件 */
                    }
                    .no-print { display: none !important; }
                    
                    /* 強制表格式邊框 */
                    .form-border { border: 2px solid #000 !important; }
                    .cell-border { border: 1px solid #000 !important; }
                    .bg-print-gray { background-color: #f0f0f0 !important; }
                    
                    /* 調整輸入框列印樣式 - 去除邊框，只留文字 */
                    input, textarea, select { 
                        border: none !important; 
                        background: transparent !important; 
                        resize: none; 
                        box-shadow: none !important;
                        font-size: 11pt !important;
                    } 
                    /* 針對 textarea 讓它在列印時可以撐開高度 (雖然 CSS 無法完全做到，但盡量設定) */
                    textarea { min-height: 100px; }
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
                                <h1 className="font-bold text-lg text-slate-800">異常複檢處理單</h1>
                            </div>
                            <button
                                onClick={handlePrint}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-bold transition-colors shadow-sm"
                            >
                                <Printer className="w-4 h-4" />
                                列印 / 匯出 PDF
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center custom-scrollbar bg-slate-100">
                        {/* A4 模擬容器 */}
                        <div ref={printRef} className="print-area w-[210mm] min-h-[297mm] bg-white shadow-xl mx-auto p-[15mm] text-slate-900 border border-slate-200">

                            {/* 表頭 */}
                            <div className="text-center mb-8 pb-4 border-b-2 border-black">
                                <h1 className="text-3xl font-extrabold tracking-widest text-black mb-2 font-serif">消防安全設備異常複檢單</h1>
                                <div className="flex justify-between items-end mt-4 text-sm text-slate-600 font-medium">
                                    <span>單號：{selectedRecord.id.slice(-8).toUpperCase()}</span>
                                    <span>列印日期：{new Date().toLocaleDateString()}</span>
                                </div>
                            </div>

                            {/* 主要表格結構 */}
                            <div className="border-2 border-black">
                                {/* 1. 設備資訊 */}
                                <div className="bg-slate-100 border-b border-black p-2 font-bold text-center text-lg bg-print-gray">一、設備基本資料</div>
                                <div className="grid grid-cols-2">
                                    <div className="border-r border-black border-b border-black p-3">
                                        <div className="text-xs text-slate-500 font-bold mb-1">設備名稱</div>
                                        <div className="text-lg font-bold">{selectedRecord.equipmentName}</div>
                                    </div>
                                    <div className="border-b border-black p-3">
                                        <div className="text-xs text-slate-500 font-bold mb-1">設備編號</div>
                                        <div className="text-lg font-mono">{selectedRecord.barcode || '無編號'}</div>
                                    </div>
                                    <div className="border-r border-black border-b border-black p-3">
                                        <div className="text-xs text-slate-500 font-bold mb-1">設置場所</div>
                                        <div>{selectedRecord.siteName}</div>
                                    </div>
                                    <div className="border-b border-black p-3">
                                        <div className="text-xs text-slate-500 font-bold mb-1">區域/樓層</div>
                                        <div>{selectedRecord.buildingName}</div>
                                    </div>
                                </div>

                                {/* 2. 異常資訊 */}
                                <div className="bg-slate-100 border-b border-black p-2 font-bold text-center text-lg bg-print-gray">二、異常檢測記錄</div>
                                <div className="border-b border-black">
                                    <div className="grid grid-cols-2 border-b border-black">
                                        <div className="border-r border-black p-3">
                                            <div className="text-xs text-slate-500 font-bold mb-1">發現日期</div>
                                            <div className="font-medium">{new Date(selectedRecord.inspectionDate).toLocaleDateString()}</div>
                                        </div>
                                        <div className="p-3">
                                            <div className="text-xs text-slate-500 font-bold mb-1">異常項目歸類</div>
                                            <div className="flex flex-wrap gap-1">
                                                {selectedRecord.abnormalItems && selectedRecord.abnormalItems.length > 0 ? (
                                                    selectedRecord.abnormalItems.map((item, idx) => (
                                                        <span key={idx} className="after:content-[','] last:after:content-[''] font-medium">
                                                            {item}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-400 italic">無</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-3 min-h-[80px]">
                                        <div className="text-xs text-slate-500 font-bold mb-2">異常情況描述</div>
                                        <div className="text-slate-900 leading-relaxed font-medium">
                                            {selectedRecord.abnormalReason}
                                        </div>
                                    </div>
                                </div>

                                {/* 3. 修復資訊 */}
                                <div className="bg-slate-100 border-b border-black p-2 font-bold text-center text-lg bg-print-gray">三、修復處理報告</div>
                                <div>
                                    <div className="p-3 border-b border-black">
                                        <div className="flex items-center gap-4">
                                            <label className="text-sm font-bold text-slate-700 whitespace-nowrap">修復完成日期：</label>
                                            <input
                                                type="date"
                                                value={fixedDate}
                                                onChange={(e) => setFixedDate(e.target.value)}
                                                className="flex-1 px-2 py-1 bg-transparent border-b border-slate-300 focus:outline-none focus:border-black font-medium print:border-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-3 min-h-[200px]">
                                        <div className="flex justify-between items-center mb-2 no-print">
                                            <label className="text-sm font-bold text-slate-700">修復處置說明</label>
                                            <select
                                                className="text-sm border border-slate-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-slate-500"
                                                onChange={handleQuickTextSelect}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>✨ 快速帶入常用說明...</option>
                                                {QUICK_FIX_TEMPLATES.map((tpl, i) => (
                                                    <option key={i} value={tpl}>{tpl}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <label className="text-xs text-slate-500 font-bold mb-1 hidden print:block">修復處置說明</label>

                                        <textarea
                                            value={fixedNotes}
                                            onChange={(e) => setFixedNotes(e.target.value)}
                                            placeholder="請輸入詳細修復過程..."
                                            className="w-full h-full min-h-[160px] p-2 bg-slate-50 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none print:bg-transparent print:border-none print:p-0 print:min-h-0 text-slate-900 leading-relaxed"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 簽名欄 */}
                            <div className="mt-12 grid grid-cols-2 gap-12">
                                <div className="border-t border-black pt-2 text-center">
                                    <p className="font-bold text-black mb-12">維修人員簽章</p>
                                </div>
                                <div className="border-t border-black pt-2 text-center">
                                    <p className="font-bold text-black mb-12">管理人員簽章</p>
                                </div>
                            </div>

                            {/* 頁尾 */}
                            <div className="mt-auto pt-8 text-center text-xs text-slate-400 print:text-black">
                                <p>本表單由 FireCheck AI Pro 系統自動生成</p>
                            </div>
                        </div>
                    </div>

                    {/* 底部操作按鈕 (列印時隱藏) */}
                    <div className="p-4 bg-white border-t border-slate-200 z-40 no-print sticky bottom-0">
                        <div className="max-w-5xl mx-auto">
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        資料同步中...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-6 h-6" />
                                        確認送出 (完成複檢)
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                // 列表頁面 (保持不變)
                <div className="flex flex-col h-full bg-slate-50 relative">
                    <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
                        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
                            <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <h1 className="font-bold text-lg text-slate-800">異常複檢清單</h1>
                            <span className="ml-auto bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">
                                {filteredRecords.length} 筆待複檢
                            </span>
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
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="搜尋設備名稱、編號、場所..."
                                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-all shadow-sm"
                                />
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-20">
                                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-orange-600"></div>
                                </div>
                            ) : filteredRecords.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
                                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                                    <h3 className="text-lg font-bold text-slate-700">目前無待複檢記錄</h3>
                                    <p className="text-slate-500 text-sm mt-1">太棒了！所有異常設備都已處理完畢</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredRecords.map(record => (
                                        <div
                                            key={record.id}
                                            onClick={() => setSelectedRecord(record)}
                                            className="bg-white p-5 rounded-2xl border border-orange-200 hover:border-orange-300 hover:shadow-lg transition-all cursor-pointer group"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-orange-100 text-orange-700">
                                                            待複檢
                                                        </span>
                                                        <h3 className="font-bold text-slate-800 text-lg">{record.equipmentName}</h3>
                                                        {record.barcode && (
                                                            <span className="text-sm text-slate-500">#{record.barcode}</span>
                                                        )}
                                                    </div>

                                                    <div className="text-sm text-slate-500 space-y-1 mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="bg-slate-100 px-1.5 rounded text-xs">場所</span>
                                                            {record.siteName} / {record.buildingName}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-4 h-4" />
                                                            發現日期: {new Date(record.inspectionDate).toLocaleDateString(language)}
                                                        </div>
                                                    </div>

                                                    <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-3">
                                                        {/* Custom Abnormal Icon */}
                                                        <div className="w-6 h-6 rounded-full bg-orange-500 animate-pulse flex items-center justify-center shadow-lg shadow-orange-300 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-xs font-bold text-red-500 mb-1">
                                                                異常原因
                                                            </p>
                                                            <p className="text-slate-700 font-medium line-clamp-2">{record.abnormalReason}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-2 shrink-0">
                                                    <ChevronRight className="w-6 h-6 text-slate-400 group-hover:text-orange-500 transition-colors" />
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
        </>
    );
};

export default AbnormalRecheckList;
