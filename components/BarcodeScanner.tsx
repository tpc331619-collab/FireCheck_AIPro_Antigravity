import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface BarcodeScannerProps {
    onScanSuccess: (decodedText: string) => void;
    onClose: () => void;
    onManualInput?: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScanSuccess, onClose, onManualInput }) => {
    const { t } = useLanguage();
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [error, setError] = useState<string>('');
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        const startScanner = async () => {
            try {
                const scanner = new Html5Qrcode('qr-reader');
                scannerRef.current = scanner;

                const config = {
                    fps: 10,
                    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                        // Increase to ~70% of the screen width for better visibility (Square for mixed usage)
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        return {
                            width: Math.floor(minEdge * 0.7),
                            height: Math.floor(minEdge * 0.7)
                        };
                    },
                    aspectRatio: 1.0
                };

                await scanner.start(
                    { facingMode: 'environment' }, // 使用後置攝影機
                    config,
                    (decodedText) => {
                        // 掃描成功
                        onScanSuccess(decodedText);
                        stopScanner();
                    },
                    (errorMessage) => {
                        // 掃描失敗 (持續掃描中,這是正常的)
                        // console.log('Scanning...', errorMessage);
                    }
                );

                setIsScanning(true);
            } catch (err: any) {
                console.error('Scanner error:', err);
                if (err.name === 'NotAllowedError') {
                    setError(t('cameraPermissionRequests'));
                } else if (err.name === 'NotFoundError') {
                    setError(t('cameraNotFound'));
                } else {
                    setError(t('scannerStartFailed') + ': ' + (err.message || 'Unknown error'));
                }
            }
        };

        startScanner();

        return () => {
            stopScanner();
        };
    }, []);

    const stopScanner = () => {
        if (scannerRef.current && isScanning) {
            scannerRef.current.stop().then(() => {
                scannerRef.current?.clear();
                setIsScanning(false);
            }).catch((err) => {
                console.error('Failed to stop scanner:', err);
            });
        }
    };

    const handleClose = () => {
        stopScanner();
        onClose();
    };

    const handleManualInput = () => {
        stopScanner();
        if (onManualInput) {
            onManualInput();
        } else {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-white">
                        <Camera className="w-5 h-5" />
                        <h3 className="font-bold text-lg">{t('scanBarcode')}</h3>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-white/80 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Scanner Area */}
                <div className="p-4">
                    {error ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                            <p className="text-red-700 font-medium">{error}</p>
                            <button
                                onClick={handleClose}
                                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                {t('close')}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div
                                id="qr-reader"
                                className="rounded-xl overflow-hidden border-2 border-slate-200 aspect-square"
                            ></div>
                            <p className="text-sm text-slate-500 text-center mt-4">
                                {t('alignBarcode')}
                            </p>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
                    <button
                        onClick={handleManualInput}
                        className="w-full py-3 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        {t('cancelOrManual')}
                    </button>
                    <p className="text-xs text-slate-400 text-center">
                        {t('returnToManual')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default BarcodeScanner;
