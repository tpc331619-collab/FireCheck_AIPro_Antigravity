import React from 'react';
import { X, ClipboardList, Map, AlertTriangle, ArrowRight } from 'lucide-react';

interface InspectionModeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectMode: (mode: 'CHECKLIST' | 'MAP_VIEW' | 'RECHECK') => void;
}

const InspectionModeModal: React.FC<InspectionModeModalProps> = ({ isOpen, onClose, onSelectMode }) => {
    if (!isOpen) return null;

    const modes = [
        {
            id: 'CHECKLIST',
            title: '使用清單檢查',
            description: '標準條列式設備檢查',
            icon: <ClipboardList className="w-8 h-8 text-blue-500" />,
            color: 'bg-blue-50 border-blue-100 hover:border-blue-300',
            bgIcon: 'bg-blue-100'
        },
        {
            id: 'MAP_VIEW',
            title: 'Map View 檢查',
            description: '透過場域地圖進行直觀檢查',
            icon: <Map className="w-8 h-8 text-purple-500" />,
            color: 'bg-purple-50 border-purple-100 hover:border-purple-300',
            bgIcon: 'bg-purple-100'
        }
    ] as const;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative z-10 overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">選擇檢查方式</h3>
                        <p className="text-sm text-slate-500">請選擇最適合的作業模式</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {modes.map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => onSelectMode(mode.id)}
                            className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-4 text-left group ${mode.color} hover:shadow-md active:scale-[0.98]`}
                        >
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${mode.bgIcon} group-hover:scale-110 transition-transform`}>
                                {mode.icon}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-slate-800 text-lg group-hover:text-slate-900">{mode.title}</h4>
                                <p className="text-sm text-slate-500 font-medium">{mode.description}</p>
                            </div>
                            <div className="p-2 bg-white/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-5 h-5 text-slate-400" />
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default InspectionModeModal;
