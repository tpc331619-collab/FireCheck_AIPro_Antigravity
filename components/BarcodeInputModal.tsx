import React, { useState } from 'react';
import { X, Camera, Keyboard, AlertCircle, CheckCircle } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import { useLanguage } from '../contexts/LanguageContext';

interface BarcodeInputModalProps {
    isOpen: boolean;
    expectedBarcode?: string;
    onScan: (barcode: string) => void;
    onCancel: () => void;
}

const BarcodeInputModal: React.FC<BarcodeInputModalProps> = ({
    isOpen,
    expectedBarcode,
    onScan,
    onCancel
}) => {
    const { t } = useLanguage();
    const [inputMode, setInputMode] = useState<'SCAN' | 'MANUAL'>('SCAN');
    const [manualInput, setManualInput] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(false);

    if (!isOpen) return null;

    const handleScanSuccess = (barcode: string) => {
        validateAndSubmit(barcode);
    };

    const handleManualSubmit = () => {
        if (!manualInput.trim()) {
            setValidationError(t('pleaseInputBarcode'));
            return;
        }
        validateAndSubmit(manualInput.trim());
    };

    const validateAndSubmit = (barcode: string) => {
        // Prevent multiple submissions
        if (isValidating) return;

        setIsValidating(true);
        setValidationError(null);

        // 如果沒有預期編號，直接通過 (用於搜尋模式)
        if (!expectedBarcode) {
            onScan(barcode);
            // reset isValidating will be handled by unmount or next open
            return;
        }

        // 驗證邏輯：標註點編號 === 掃描/輸入的編號
        if (barcode !== expectedBarcode) {
            setValidationError(t('barcodeMismatch').replace('{expected}', expectedBarcode).replace('{actual}', barcode));
            setIsValidating(false);
            return;
        }

        // 驗證成功
        onScan(barcode);
        // Note: Modal will be closed by parent, no need to reset isValidating manually usually,
        // but if parent doesn't close immediately, this prevents double tap.
    };

    const handleClose = () => {
        setManualInput('');
        setValidationError(null);
        setInputMode('SCAN'); // Reset to default SCAN
        setIsValidating(false);
        onCancel();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 flex justify-between items-center">
                    <div className="text-white">
                        <h3 className="font-bold text-lg">{expectedBarcode ? t('deviceVerification') : t('quickSearch')}</h3>
                        {expectedBarcode && <p className="text-sm text-purple-100">{t('expectedBarcode')}: <strong>{expectedBarcode}</strong></p>}
                        {!expectedBarcode && <p className="text-sm text-purple-100">{t('scanOrInput')}</p>}
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-white/80 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Mode Selector */}
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setInputMode('SCAN')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${inputMode === 'SCAN'
                                ? 'bg-purple-600 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            <Camera className="w-4 h-4" />
                            {t('scanBarcode')}
                        </button>
                        <button
                            onClick={() => setInputMode('MANUAL')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${inputMode === 'MANUAL'
                                ? 'bg-purple-600 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            <Keyboard className="w-4 h-4" />
                            {t('manualInput')}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 min-h-[200px]">
                    {inputMode === 'MANUAL' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    {expectedBarcode ? t('equipmentId') : t('keywordOrBarcode')}
                                </label>
                                <input
                                    type="text"
                                    value={manualInput}
                                    onChange={(e) => {
                                        const val = e.target.value.toUpperCase();
                                        setManualInput(val);
                                        setValidationError(null);

                                        // Auto-submit if strictly matches expected barcode
                                        if (val.trim() === expectedBarcode) {
                                            validateAndSubmit(val.trim());
                                        }
                                    }}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleManualSubmit();
                                        }
                                    }}
                                    placeholder=""
                                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg font-mono text-slate-900"
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleManualSubmit}
                                disabled={isValidating}
                                className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isValidating ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        {t('verifying')}
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        {t('confirm')}
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Validation Error */}
                    {validationError && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-red-900">{t('validationFailed')}</p>
                                <p className="text-sm text-red-700 mt-1">{validationError}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {inputMode === 'MANUAL' && (
                    <div className="p-4 bg-slate-50 border-t border-slate-200">
                        <button
                            onClick={handleClose}
                            className="w-full py-2.5 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            {t('close')}
                        </button>
                    </div>
                )}
            </div>

            {/* Barcode Scanner as separate modal */}
            {inputMode === 'SCAN' && (
                <div className="fixed inset-0 z-[60]">
                    <BarcodeScanner
                        onScanSuccess={handleScanSuccess}
                        onClose={handleClose}
                        onManualInput={() => setInputMode('MANUAL')}
                    />
                </div>
            )}
        </div>
    );
};

export default BarcodeInputModal;
