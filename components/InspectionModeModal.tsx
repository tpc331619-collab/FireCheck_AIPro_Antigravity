import React from 'react';
import { X, ClipboardList, Map, AlertTriangle, ArrowRight } from 'lucide-react';

interface InspectionModeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectMode: (mode: 'CHECKLIST' | 'MAP_VIEW' | 'RECHECK') => void;
    t: (key: string) => string;
    systemSettings?: any;
    isAdmin?: boolean;
}

const InspectionModeModal: React.FC<InspectionModeModalProps> = ({ isOpen, onClose, onSelectMode, t, systemSettings, isAdmin }) => {
    if (!isOpen) return null;

    const modes = [
        {
            id: 'CHECKLIST',
            title: t('checklistInspection'),
            description: t('checklistInspectionDesc'),
            icon: <ClipboardList className="w-8 h-8 text-blue-500" />,
            color: 'bg-blue-50 border-blue-100 hover:border-blue-300',
            bgIcon: 'bg-blue-100',
            visible: true // Base visibility, will be filtered below
        },
        {
            id: 'MAP_VIEW',
            title: t('mapViewTitle'),
            description: t('mapViewDesc'),
            icon: <Map className="w-8 h-8 text-purple-500" />,
            color: 'bg-slate-50 border-slate-100 hover:border-slate-300',
            bgIcon: 'bg-slate-100',
            visible: true
        }
    ] as const;

    // Filter modes based on permissions if systemSettings are provided
    // Note: To avoid breaking current props, we'll assume they might be passed or we fetch them elsewhere.
    // However, the cleanest way is to pass them. Since I'm editing the component, I'll update the interface too.

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative z-10 overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">{t('selectInspectionMode')}</h3>
                        <p className="text-sm text-slate-500">{t('selectInspectionModeDesc')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {modes
                        .filter(m => {
                            if (isAdmin) return true;
                            if (m.id === 'CHECKLIST' && systemSettings?.allowInspectorListInspection === false) return false;
                            if (m.id === 'MAP_VIEW' && systemSettings?.allowInspectorMapInspection === false) return false;
                            return true;
                        })
                        .map((mode) => (
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
