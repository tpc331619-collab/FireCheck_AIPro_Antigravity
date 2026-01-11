import React, { useState } from 'react';
import { X, Calendar, Save, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { StorageService } from '../services/storageService';
import { UserProfile, DeclarationSettings } from '../types';

interface DeclarationSettingsModalProps {
    user: UserProfile;
    currentSettings: DeclarationSettings | null;
    onClose: () => void;
    onSave: (settings: DeclarationSettings) => void;
}

const DeclarationSettingsModal: React.FC<DeclarationSettingsModalProps> = ({
    user,
    currentSettings,
    onClose,
    onSave
}) => {
    const { t } = useLanguage();
    const [month, setMonth] = useState<number>(currentSettings?.month || new Date().getMonth() + 1);
    const [day, setDay] = useState<number>(currentSettings?.day || new Date().getDate());
    const [loading, setLoading] = useState(false);

    // Simple days in month check (not accounting for leap year perfectly but good enough for settings)
    const getDaysInMonth = (m: number) => {
        return new Date(2024, m, 0).getDate();
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const settings: DeclarationSettings = { month, day };
            await StorageService.saveDeclarationSettings(settings, user.uid);
            onSave(settings);
            onClose();
        } catch (error) {
            console.error("Failed to save settings", error);
            alert('儲存失敗，請稍後再試');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X className="w-5 h-5 text-slate-400" />
                </button>

                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                        <Calendar className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-xl text-slate-800">設定消防申報日期</h3>
                    <p className="text-sm text-slate-500 mt-1">請設定每年的申報截止日期</p>
                </div>

                <div className="space-y-4 mb-8">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">月份</label>
                            <select
                                value={month}
                                onChange={(e) => {
                                    setMonth(Number(e.target.value));
                                    // Adjust day if needed
                                    const maxDay = getDaysInMonth(Number(e.target.value));
                                    if (day > maxDay) setDay(maxDay);
                                }}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{m}月</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">日期</label>
                            <select
                                value={day}
                                onChange={(e) => setDay(Number(e.target.value))}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500"
                            >
                                {Array.from({ length: getDaysInMonth(month) }, (_, i) => i + 1).map(d => (
                                    <option key={d} value={d}>{d}日</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl flex gap-3 items-start">
                        <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-700 leading-relaxed">
                            系統將會自動依照您設定的日期，計算每年的申報倒數天數。
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full py-3.5 bg-red-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-500 transition-all shadow-lg shadow-red-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            儲存設定
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default DeclarationSettingsModal;
