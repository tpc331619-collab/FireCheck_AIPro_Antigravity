import React, { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { EquipmentDefinition } from '../types';

interface BarcodePrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    equipment: EquipmentDefinition[];
}

const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({ isOpen, onClose, equipment }) => {
    const [qrCodes, setQrCodes] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!isOpen || equipment.length === 0) return;

        const generateCodes = async () => {
            const codes: Record<string, string> = {};
            for (const item of equipment) {
                try {
                    // Generate QR code for the barcode string
                    const url = await QRCode.toDataURL(item.barcode, {
                        width: 200,
                        margin: 1,
                        color: {
                            dark: '#000000',
                            light: '#ffffff'
                        }
                    });
                    codes[item.id] = url;
                } catch (err) {
                    console.error('Failed to generate QR for', item.barcode, err);
                }
            }
            setQrCodes(codes);
        };

        generateCodes();
    }, [isOpen, equipment]);

    if (!isOpen) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:p-0 print:static print:bg-white print:backdrop-blur-none">
            {/* Modal Container */}
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden print:shadow-none print:w-full print:max-w-none print:h-auto print:rounded-none">

                {/* Header (Hidden when printing) */}
                <div className="flex items-center justify-between p-4 border-b bg-slate-50 print:hidden">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">條碼列印預覽</h2>
                        <p className="text-sm text-slate-500">已選擇 {equipment.length} 項設備</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
                        >
                            <Printer size={18} />
                            <span>列印此頁</span>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Preview Content / Print Content */}
                <div className="p-8 overflow-y-auto bg-slate-100 print:bg-white print:p-0 print:overflow-visible">
                    <div className="grid grid-cols-3 gap-6 print:grid-cols-3 print:gap-4 print:w-full">
                        {equipment.map((item) => (
                            <div key={item.id} className="bg-white p-4 border rounded-xl shadow-sm flex flex-col items-center justify-center text-center gap-2 break-inside-avoid print:border print:shadow-none print:rounded-none print:break-inside-avoid print:p-2 page-break-avoid">
                                <div className="text-base font-bold text-slate-900 truncate w-full px-2 print:text-sm">
                                    {item.name}
                                </div>

                                {qrCodes[item.id] ? (
                                    <img src={qrCodes[item.id]} alt="QR Code" className="w-32 h-32 object-contain print:w-24 print:h-24" />
                                ) : (
                                    <div className="w-32 h-32 bg-slate-100 rounded flex items-center justify-center text-slate-400 print:w-24 print:h-24">
                                        Loading...
                                    </div>
                                )}

                                <div className="text-xs font-mono font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded w-full print:text-[10px] print:bg-transparent">
                                    {item.barcode}
                                </div>
                                <div className="text-xs text-slate-400 truncate w-full px-2 print:text-[10px]">
                                    {item.buildingName} {item.siteName ? `- ${item.siteName}` : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer instructions (Hidden when printing) */}
                <div className="p-4 bg-slate-50 border-t text-sm text-slate-500 text-center print:hidden">
                    提示：請使用瀏覽器的列印功能 (Ctrl+P)，並在設定中勾選「背景圖形」以獲得最佳效果。建議紙張設定為 A4。
                </div>
            </div>

            {/* Print Styles Injection */}
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    /* Specifically target the modal content for visibility */
                    .fixed.inset-0.z-50, 
                    .fixed.inset-0.z-50 * {
                        visibility: visible;
                    }
                    /* Reset body scroll/overflow to allow printing full content */
                    body, html {
                        overflow: visible !important;
                        height: auto !important;
                    }
                    /* Position the modal content at absolute top left for the print */
                    .bg-white.rounded-2xl {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        box-shadow: none;
                    }
                    /* Ensure page breaks don't cut items */
                    .page-break-avoid {
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                }
            `}</style>
        </div>
    );
};

export default BarcodePrintModal;
