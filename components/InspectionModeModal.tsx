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
            icon: <ClipboardList className="w-7 h-7 text-white" />,
            color: 'bg-gradient-to-br from-white via-blue-50/85 to-sky-100/80 border-blue-200/80 border-l-4 border-l-blue-500 hover:border-blue-400',
            bgIcon: 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-200',
            arrowBg: 'bg-blue-100/80 text-blue-600',
            visible: true // Base visibility, will be filtered below
        },
        {
            id: 'MAP_VIEW',
            title: t('mapViewTitle'),
            description: t('mapViewDesc'),
            icon: <Map className="w-7 h-7 text-white" />,
            color: 'bg-gradient-to-br from-white via-purple-50/85 to-fuchsia-100/80 border-purple-200/80 border-l-4 border-l-purple-500 hover:border-purple-400',
            bgIcon: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-200',
            arrowBg: 'bg-purple-100/80 text-purple-600',
            visible: true
        }
    ] as const;

    // Filter modes based on permissions if systemSettings are provided
    // Note: To avoid breaking current props, we'll assume they might be passed or we fetch them elsewhere.
    // However, the cleanest way is to pass them. Since I'm editing the component, I'll update the interface too.

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="bg-gradient-to-br from-slate-100/95 via-blue-50/90 to-indigo-100/85 backdrop-blur-xl border border-white/80 rounded-3xl w-full max-w-lg shadow-2xl relative z-10 overflow-hidden animate-in zoom-in duration-200">
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                <div className="p-5 sm:p-6 border-b border-slate-200/70 flex justify-between items-center bg-white/75 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
                            <ClipboardList className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-extrabold text-slate-800">{t('selectInspectionMode')}</h3>
                            <p className="text-xs sm:text-sm text-slate-500 font-medium">{t('selectInspectionModeDesc')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200/70 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-5 sm:p-6 space-y-4">
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
                                className={`w-full p-4 rounded-2xl border shadow-md transition-all flex items-center gap-4 text-left group ${mode.color} hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]`}
                            >
                                <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${mode.bgIcon} group-hover:scale-110 transition-transform`}>
                                    {mode.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-extrabold text-slate-800 text-lg group-hover:text-slate-900">{mode.title}</h4>
                                    <p className="text-sm text-slate-500 font-medium">{mode.description}</p>
                                </div>
                                <div className={`p-2 rounded-full ${mode.arrowBg} opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0`}>
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            </button>
                        ))}
                </div>
            </div>
        </div>
    );
};

export default InspectionModeModal;
