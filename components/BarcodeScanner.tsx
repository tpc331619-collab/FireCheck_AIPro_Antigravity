import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';

interface BarcodeScannerProps {
    onScanSuccess: (decodedText: string) => void;
    onClose: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScanSuccess, onClose }) => {
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
                    qrbox: { width: 300, height: 300 },
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
                    setError('請允許使用攝影機權限');
                } else if (err.name === 'NotFoundError') {
                    setError('找不到攝影機裝置');
                } else {
                    setError('無法啟動掃描器: ' + (err.message || '未知錯誤'));
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

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-white">
                        <Camera className="w-5 h-5" />
                        <h3 className="font-bold text-lg">掃描條碼</h3>
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
                                關閉
                            </button>
                        </div>
                    ) : (
                        <>
                            <div
                                id="qr-reader"
                                className="rounded-xl overflow-hidden border-2 border-slate-200 aspect-square"
                            ></div>
                            <p className="text-sm text-slate-500 text-center mt-4">
                                請將條碼對準框內進行掃描
                            </p>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
                    <button
                        onClick={handleClose}
                        className="w-full py-3 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        取消 / 改用手動輸入
                    </button>
                    <p className="text-xs text-slate-400 text-center">
                        點擊上方按鈕可返回手動輸入模式
                    </p>
                </div>
            </div>
        </div>
    );
};

export default BarcodeScanner;
