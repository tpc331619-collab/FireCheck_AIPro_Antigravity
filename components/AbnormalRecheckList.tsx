import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Calendar, Search, Trash2, Edit } from 'lucide-react';
import { AbnormalRecord, UserProfile } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';
import { THEME_COLORS } from '../constants';

interface AbnormalRecheckListProps {
    user: UserProfile;
    onBack: () => void;
}

const AbnormalRecheckList: React.FC<AbnormalRecheckListProps> = ({ user, onBack }) => {
    const { t, language } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AbnormalRecord[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const data = await StorageService.getAbnormalRecords(user.uid);
            setRecords(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, [user.uid]);

    const handleMarkFixed = async (record: AbnormalRecord) => {
        if (!confirm('確定此設備已改善完畢？')) return;

        try {
            const now = Date.now();
            await StorageService.updateAbnormalRecord({
                ...record,
                status: 'fixed',
                fixedDate: now,
                updatedAt: now
            });

            // Also update the original equipment status?
            // Ideally yes, but maybe user wants to re-inspect properly via checklist.
            // For now just update the abnormal record list.

            fetchRecords();
        } catch (e) {
            alert('更新失敗');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('確定要刪除此異常記錄？')) return;
        try {
            await StorageService.deleteAbnormalRecord(id);
            fetchRecords();
        } catch (e) {
            alert('刪除失敗');
        }
    };

    const filteredRecords = records.filter(r =>
        r.equipmentName.includes(searchQuery) ||
        r.siteName.includes(searchQuery) ||
        r.buildingName.includes(searchQuery)
    );

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="font-bold text-lg text-slate-800">異常複檢清單</h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                <div className="max-w-4xl mx-auto">

                    {/* Search */}
                    <div className="mb-6 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜尋設備名稱、場所..."
                            className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-all shadow-sm"
                        />
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-orange-600"></div>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
                            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                            <h3 className="text-lg font-bold text-slate-700">目前無異常記錄</h3>
                            <p className="text-slate-500 text-sm mt-1">太棒了！所有設備運作正常</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredRecords.map(record => (
                                <div key={record.id} className={`bg-white p-5 rounded-2xl border transition-all hover:shadow-md ${record.status === 'fixed' ? 'border-green-200 bg-green-50/10' : 'border-orange-200 bg-orange-50/10'}`}>
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${record.status === 'fixed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {record.status === 'fixed' ? '已改善' : '待複檢'}
                                                </span>
                                                <h3 className="font-bold text-slate-800 text-lg">{record.equipmentName}</h3>
                                            </div>

                                            <div className="text-sm text-slate-500 space-y-1 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-slate-100 px-1.5 rounded text-xs">場所</span>
                                                    {record.siteName} / {record.buildingName}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-slate-100 px-1.5 rounded text-xs">發現日期</span>
                                                    {new Date(record.inspectionDate).toLocaleDateString(language)}
                                                </div>
                                            </div>

                                            <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                                <p className="text-xs font-bold text-red-400 mb-1 flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> 異常原因</p>
                                                <p className="text-slate-700 font-medium">{record.abnormalReason}</p>
                                            </div>
                                        </div>

                                        <div className="flex md:flex-col justify-end gap-2 shrink-0">
                                            {record.status === 'pending' && (
                                                <button
                                                    onClick={() => handleMarkFixed(record)}
                                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
                                                >
                                                    <CheckCircle className="w-4 h-4" /> 標記已改善
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(record.id)}
                                                className="px-4 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" /> 移除
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AbnormalRecheckList;
