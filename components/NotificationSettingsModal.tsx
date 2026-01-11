
import React, { useState, useEffect } from 'react';
import { X, Mail, Save, AlertCircle } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { UserProfile } from '../types';

interface NotificationSettingsModalProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
}

const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ user, isOpen, onClose }) => {
    const [emails, setEmails] = useState<string[]>(['', '', '']);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadSettings();
        }
    }, [isOpen, user.uid]);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const data = await StorageService.getNotificationSettings(user.uid);
            if (data) {
                // Ensure 3 slots
                const padded = [...data, '', '', ''].slice(0, 3);
                setEmails(padded);
            }
        } catch (error) {
            console.error("Failed to load notification settings", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const validEmails = emails.filter(e => e.trim() !== '');
            await StorageService.saveNotificationSettings(validEmails, user.uid);
            onClose();
            // Optional: Add a toast notification here if you have a toast system
            alert('通知設定已儲存');
        } catch (error) {
            console.error("Failed to save notification settings", error);
            alert('儲存失敗，請稍後再試');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center">
                        <span className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center mr-3 text-orange-600">
                            <Mail className="w-5 h-5" />
                        </span>
                        通知設定
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    <p className="text-sm text-slate-500 bg-orange-50 p-4 rounded-xl border border-orange-100 flex gap-3 leading-relaxed">
                        <AlertCircle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                        當檢查日期即將到期，或檢查結果為「異常」時，系統將自動寄送通知信至以下信箱。
                    </p>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {emails.map((email, idx) => (
                                <div key={idx} className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email {idx + 1}</label>
                                    <div className="relative group">
                                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 group-focus-within:text-orange-500 transition-colors" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => {
                                                const newEmails = [...emails];
                                                newEmails[idx] = e.target.value;
                                                setEmails(newEmails);
                                            }}
                                            placeholder={`name@example.com`}
                                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-orange-500 focus:outline-none focus:bg-white transition-all shadow-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 pt-0">
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                儲存中...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                儲存設定
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationSettingsModal;
