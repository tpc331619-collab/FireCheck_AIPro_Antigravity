import React, { useState, useEffect, useRef } from 'react';
import { X, GripVertical, RotateCcw, Save, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { DashboardCardId } from '../types';

interface CardOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentOrder: DashboardCardId[];
    onSave: (newOrder: DashboardCardId[]) => void;
    onReset: () => void;
}

const CardOrderModal: React.FC<CardOrderModalProps> = ({
    isOpen,
    onClose,
    currentOrder,
    onSave,
    onReset
}) => {
    const { t } = useLanguage();
    const [orderedCards, setOrderedCards] = useState<DashboardCardId[]>([]);
    const [draggedItem, setDraggedItem] = useState<number | null>(null);
    const [dragOverItem, setDragOverItem] = useState<number | null>(null);

    // Initialize state when modal opens
    useEffect(() => {
        if (isOpen) {
            setOrderedCards(currentOrder);
        }
    }, [isOpen, currentOrder]);

    const handleSort = () => {
        if (draggedItem === null || dragOverItem === null) return;

        const items = [...orderedCards];
        const draggedItemContent = items[draggedItem];

        items.splice(draggedItem, 1);
        items.splice(dragOverItem, 0, draggedItemContent);

        setDraggedItem(dragOverItem);
        setDragOverItem(null);
        setOrderedCards(items);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedItem(index);
        // Required for Firefox
        e.dataTransfer.effectAllowed = 'move';
        // Hide the default drag image or customize it if needed
        // e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        if (draggedItem === null) return;
        setDragOverItem(index);
        e.preventDefault(); // Necessary to allow dropping
    };

    const handleDragEnd = () => {
        handleSort();
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); // Necessary to allow dropping
    };

    const getCardLabel = (id: DashboardCardId): string => {
        switch (id) {
            case 'startInspection': return t('startInspectionTitle');
            case 'abnormalRecheck': return t('abnormalRecheck');
            case 'myEquipment': return t('myEquipment');
            case 'mapEditor': return t('mapEditor');
            case 'history': return t('history');
            case 'equipmentOverview': return t('equipmentOverview');
            case 'healthIndicators': return t('healthIndicators');
            case 'addEquipment': return t('addEquipment');
            case 'addNameList': return t('addNameList');
            default: return id;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-white/20 ring-1 ring-black/5">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="font-bold text-xl text-slate-800 flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                <GripVertical className="w-6 h-6" />
                            </div>
                            <div>
                                <span>{t('sectionCardOrder')}</span>
                                <span className="block text-xs text-slate-400 font-medium mt-0.5">{t('cardOrderDesc')}</span>
                            </div>
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors group">
                        <X className="w-6 h-6 text-slate-400 group-hover:text-slate-600" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-3">
                    {orderedCards.map((cardId, index) => {
                        const isDragging = draggedItem === index;
                        const isDragOver = dragOverItem === index;

                        return (
                            <div
                                key={cardId}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={handleDragOver}
                                className={`
                                    flex items-center gap-4 p-4 bg-white rounded-xl border transition-all duration-200 cursor-move select-none
                                    ${isDragging ? 'opacity-50 scale-95 border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300 hover:shadow-md'}
                                    ${isDragOver && !isDragging ? 'border-2 border-dashed border-indigo-400 bg-indigo-50 translate-y-1' : ''}
                                `}
                            >
                                <div className="text-slate-400 cursor-grab active:cursor-grabbing">
                                    <GripVertical className="w-5 h-5" />
                                </div>
                                <div className="flex-1 font-bold text-slate-700">
                                    {getCardLabel(cardId)}
                                </div>
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                    {index + 1}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center gap-4">
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl font-bold text-sm transition-all"
                    >
                        <RotateCcw className="w-4 h-4" />
                        {t('resetCardOrder')}
                    </button>
                    <button
                        onClick={() => onSave(orderedCards)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 shadow-indigo-200"
                    >
                        <Save className="w-4 h-4" />
                        {t('saveCardOrder')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CardOrderModal;
