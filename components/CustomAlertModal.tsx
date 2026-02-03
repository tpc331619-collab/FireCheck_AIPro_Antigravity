import React from 'react';
import { createPortal } from 'react-dom';
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

    const handleClose = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
    };

    const handleCancelClick = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onCancel) onCancel();
    };

    const modalContent = (
        <div
            className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
            style={{
                zIndex: 1000000,
                pointerEvents: 'auto'
            }}
        >
            <div
                className="bg-white w-full max-w-sm rounded-[3xl] shadow-2xl overflow-hidden scale-in-center animate-in zoom-in-95 duration-200 relative"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* Close Button Top-Right */}
                <button
                    onClick={handleClose}
                    onPointerDown={handleClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-[10]"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header Decoration */}
                <div className={`h-2 bg-gradient-to-r ${getHeaderBg()}`} />

                <div className="p-8 text-center pt-10">
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
                        type="button"
                        onClick={handleClose}
                        onPointerDown={handleClose}
                        onTouchEnd={handleClose}
                        className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 cursor-pointer ${type === 'confirm' ? 'bg-blue-600 hover:bg-blue-700' :
                            type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                'bg-slate-800 hover:bg-slate-900'
                            }`}
                        style={{ isolation: 'isolate', touchAction: 'manipulation' }}
                    >
                        {confirmText || (type === 'confirm' ? t('confirm') : t('close'))}
                    </button>

                    {type === 'confirm' && (
                        <button
                            type="button"
                            onClick={handleCancelClick}
                            onPointerDown={handleCancelClick}
                            onTouchEnd={handleCancelClick}
                            className="w-full py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all cursor-pointer"
                            style={{ touchAction: 'manipulation' }}
                        >
                            {cancelText || t('cancel')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default CustomAlertModal;
