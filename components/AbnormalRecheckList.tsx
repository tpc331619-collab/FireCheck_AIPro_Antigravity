import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Calendar, Search, ChevronRight } from 'lucide-react';
import { AbnormalRecord, UserProfile } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';

interface AbnormalRecheckListProps {
    user: UserProfile;
    onBack: () => void;
}

// 快選項目
const QUICK_FIX_OPTIONS = [
    '已排除',
    '已修復需觀察',
    '更換零件',
    '外部支援',
    '委外廠商處理',
    '更換新品',
    '重置系統',
    '更換耗材',
    '韌體更新',
    '線路調整',
    '清潔維護',
    '硬體損壞',
    '操作不當',
    '環境因素',
    '達到使用年限'
];

const AbnormalRecheckList: React.FC<AbnormalRecheckListProps> = ({ user, onBack }) => {
    const { t, language } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AbnormalRecord[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<AbnormalRecord | null>(null);

    // 修復表單狀態
    const [fixedDate, setFixedDate] = useState('');
    const [fixedTime, setFixedTime] = useState('');
    const [fixedNotes, setFixedNotes] = useState('');
    const [fixedCategory, setFixedCategory] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    // 初始化修復時間為當前時間
    useEffect(() => {
        if (selectedRecord) {
            const now = new Date();
            setFixedDate(now.toISOString().split('T')[0]);
            setFixedTime(now.toTimeString().slice(0, 5));
            setFixedNotes('');
            setFixedCategory('');
        }
    }, [selectedRecord]);

    const handleQuickSelect = (option: string) => {
        setFixedCategory(option);
        setFixedNotes(option);
    };

    const handleSubmit = async () => {
        if (!selectedRecord) return;

        if (!fixedDate || !fixedTime) {
            alert('請輸入修復時間');
            return;
        }

        if (!fixedNotes.trim()) {
            alert('請輸入修復情況或選擇快選項目');
            return;
        }

        setIsSubmitting(true);
        try {
            // 合併日期和時間
            const fixedDateTime = new Date(`${fixedDate}T${fixedTime}`).getTime();

            // 更新異常記錄
            await StorageService.updateAbnormalRecord({
                ...selectedRecord,
                status: 'fixed',
                fixedDate: fixedDateTime,
                fixedNotes: fixedNotes.trim(),
                fixedCategory: fixedCategory || undefined,
                updatedAt: Date.now()
            });

            // 更新設備的最後檢查日期
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

            alert('修復記錄已儲存');
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

    // 單一 return 語句,使用條件式渲染避免 Hooks 規則違反
    return (
        <>
            {selectedRecord ? (
                // 詳細複檢頁面
                <div className="flex flex-col h-full bg-slate-50">
                    <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
                        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
                            <button onClick={() => setSelectedRecord(null)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <h1 className="font-bold text-lg text-slate-800">異常複檢</h1>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        <div className="max-w-4xl mx-auto space-y-6">
                            {/* 設備資訊 */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                                    設備資訊
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">設備名稱</label>
                                        <p className="text-slate-800 font-bold mt-1">{selectedRecord.equipmentName}</p>
                                    </div>
                                    {selectedRecord.barcode && (
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">設備編號</label>
                                            <p className="text-slate-800 font-bold mt-1">{selectedRecord.barcode}</p>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">場所</label>
                                        <p className="text-slate-800 mt-1">{selectedRecord.siteName}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">建築物</label>
                                        <p className="text-slate-800 mt-1">{selectedRecord.buildingName}</p>
                                    </div>
                                </div>
                            </div>

                            {/* 異常資訊 */}
                            <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                    異常資訊
                                </h2>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">上次檢查時間</label>
                                        <p className="text-slate-800 mt-1 flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-slate-400" />
                                            {new Date(selectedRecord.inspectionDate).toLocaleString(language)}
                                        </p>
                                    </div>

                                    {selectedRecord.abnormalItems && selectedRecord.abnormalItems.length > 0 && (
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">異常項目</label>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedRecord.abnormalItems.map((item, idx) => (
                                                    <span key={idx} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
                                                        {item}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">異常內容</label>
                                        <div className="mt-2 p-4 bg-red-50 rounded-xl border border-red-100">
                                            <p className="text-slate-800">{selectedRecord.abnormalReason}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 修復資訊輸入 */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                    修復資訊
                                </h2>

                                <div className="space-y-6">
                                    {/* 修復時間 */}
                                    <div>
                                        <label className="text-sm font-bold text-slate-700 mb-2 block">修復時間 *</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input
                                                type="date"
                                                value={fixedDate}
                                                onChange={(e) => setFixedDate(e.target.value)}
                                                className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                                            />
                                            <input
                                                type="time"
                                                value={fixedTime}
                                                onChange={(e) => setFixedTime(e.target.value)}
                                                className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                                            />
                                        </div>
                                    </div>

                                    {/* 快選項目 */}
                                    <div>
                                        <label className="text-sm font-bold text-slate-700 mb-2 block">快選項目</label>
                                        <div className="flex flex-wrap gap-2">
                                            {QUICK_FIX_OPTIONS.map((option) => (
                                                <button
                                                    key={option}
                                                    onClick={() => handleQuickSelect(option)}
                                                    className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${fixedCategory === option
                                                            ? 'bg-blue-500 text-white shadow-md'
                                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                                        }`}
                                                >
                                                    {option}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 修復情況 */}
                                    <div>
                                        <label className="text-sm font-bold text-slate-700 mb-2 block">修復情況 *</label>
                                        <textarea
                                            value={fixedNotes}
                                            onChange={(e) => setFixedNotes(e.target.value)}
                                            placeholder="請輸入修復情況說明..."
                                            rows={4}
                                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 resize-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 操作按鈕 */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setSelectedRecord(null)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            處理中...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-5 h-5" />
                                            確定上傳
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                // 列表頁面
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

                                                    <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                                        <p className="text-xs font-bold text-red-400 mb-1 flex items-center">
                                                            <AlertTriangle className="w-3 h-3 mr-1" /> 異常原因
                                                        </p>
                                                        <p className="text-slate-700 font-medium line-clamp-2">{record.abnormalReason}</p>
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
