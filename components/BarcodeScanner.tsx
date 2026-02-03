import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, AlertCircle, Zap, ZapOff } from 'lucide-react';
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
    const [hasTorch, setHasTorch] = useState(false);
    const [isTorchOn, setIsTorchOn] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const startScanner = async () => {
            try {
                // Ensure DOM is ready
                await new Promise(resolve => setTimeout(resolve, 300));
                if (!isMounted) return;

                const scanner = new Html5Qrcode('qr-reader');
                scannerRef.current = scanner;

                // TRY to find back camera explicitly
                const devices = await Html5Qrcode.getCameras();
                let backCameraId = null;

                if (devices && devices.length > 0) {
                    // Look for back camera in label
                    const backDev = devices.find(d =>
                        d.label.toLowerCase().includes('back') ||
                        d.label.toLowerCase().includes('rear') ||
                        d.label.toLowerCase().includes('environment')
                    );
                    backCameraId = backDev ? backDev.id : devices[devices.length - 1].id;
                }

                const config = {
                    fps: 20, // 提升掃描頻率,更靈敏
                    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                        // 響應式掃描框,約 95% 大小
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const size = Math.floor(minEdge * 0.95);
                        return { width: size, height: size };
                    },
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.QR_CODE,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8
                    ],
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true // 啟用硬體加速
                    }
                };

                // 簡單選擇後置鏡頭
                const cameraSelector = backCameraId || { facingMode: 'environment' };

                await scanner.start(
                    cameraSelector,
                    config,
                    (decodedText) => {
                        if (isMounted) {
                            onScanSuccess(decodedText);
                            stopScanner();
                        }
                    },
                    () => { }
                );

                if (isMounted) {
                    setIsScanning(true);

                    // Torch check
                    try {
                        const track = scanner.getRunningTrackCapabilities();
                        if (track && 'torch' in track) setHasTorch(true);
                    } catch (e) { }
                }
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
            isMounted = false;
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
        <div
            className="fixed inset-0 bg-slate-900/90 z-[110] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={handleClose}
        >
            <div
                className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
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
                <div className="p-0 sm:p-4">
                    {error ? (
                        <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
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
                            <div className="relative w-full overflow-hidden bg-black sm:rounded-xl aspect-square">
                                <div id="qr-reader" className="w-full h-full"></div>

                                {/* Visual Scanning Guide / Red Line */}
                                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-500 z-10 animate-pulse pointer-events-none opacity-60"></div>

                                {/* Overlay Corners */}
                                <div className="absolute inset-0 border-[40px] border-black/30 pointer-events-none z-10"></div>

                                {/* Torch Button Overlay */}
                                {hasTorch && isScanning && (
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                const newTorchState = !isTorchOn;
                                                await scannerRef.current?.applyVideoConstraints({
                                                    advanced: [{ torch: newTorchState } as any]
                                                });
                                                setIsTorchOn(newTorchState);
                                            } catch (err) {
                                                console.error('Failed to toggle torch:', err);
                                            }
                                        }}
                                        className={`absolute bottom-6 right-6 p-4 rounded-full shadow-2xl z-20 transition-all active:scale-90 ${isTorchOn ? 'bg-yellow-400 text-slate-900 scale-110' : 'bg-white/20 text-white backdrop-blur-md border border-white/30'
                                            }`}
                                    >
                                        {isTorchOn ? <Zap className="w-6 h-6" /> : <ZapOff className="w-6 h-6" />}
                                    </button>
                                )}
                            </div>
                            <p className="text-sm text-slate-500 text-center py-4 px-6 font-medium">
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
