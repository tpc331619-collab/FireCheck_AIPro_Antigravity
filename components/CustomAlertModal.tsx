import React from 'react';
import { X, AlertCircle, HelpCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface CustomAlertModalProps {
    isOpen: boolean;
    title?: string;
    message: string;
    type?: 'alert' | 'confirm' | 'success';
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
}

const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
    isOpen,
    title,
    message,
    type = 'alert',
    onConfirm,
    onCancel,
    confirmText,
    cancelText
}) => {
    const { t } = useLanguage();

    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'confirm':
                return <HelpCircle className="w-12 h-12 text-blue-500 mx-auto" />;
            case 'success':
                return <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />;
            default:
                return <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />;
        }
    };

    const getHeaderBg = () => {
        switch (type) {
            case 'confirm':
                return 'from-blue-600 to-indigo-600';
            case 'success':
                return 'from-emerald-600 to-teal-600';
            default:
                return 'from-red-600 to-rose-600';
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden scale-in-center animate-in zoom-in-95 duration-200">
                {/* Header Decoration */}
                <div className={`h-2 bg-gradient-to-r ${getHeaderBg()}`} />
                
                <div className="p-8 text-center">
                    <div className="mb-4">
                        {getIcon()}
                    </div>
                    
                    {title && (
                        <h3 className="text-xl font-bold text-slate-800 mb-2">
                            {title}
                        </h3>
                    )}
                    
                    <div className="text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                        {message}
                    </div>
                </div>

                <div className="px-6 pb-8 flex flex-col gap-3">
                    <button
                        onClick={onConfirm}
                        className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 ${
                            type === 'confirm' ? 'bg-blue-600 hover:bg-blue-700' : 
                            type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : 
                            'bg-slate-800 hover:bg-slate-900'
                        }`}
                    >
                        {confirmText || (type === 'confirm' ? t('confirm') : t('close'))}
                    </button>
                    
                    {type === 'confirm' && (
                        <button
                            onClick={onCancel}
                            className="w-full py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                        >
                            {cancelText || t('cancel')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomAlertModal;
