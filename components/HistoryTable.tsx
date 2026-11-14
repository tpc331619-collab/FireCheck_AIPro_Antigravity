import React, { useState, useMemo, useEffect } from 'react';
import { ClipboardList, AlertTriangle, CheckCircle, Calendar, MapPin, Box, Hash, User, FileText, ChevronsUpDown, ChevronUp, ChevronDown, Wrench, Trash2, CheckSquare, Square } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface HistoryItem {
    reportId: string;
    equipmentId: string;
    date: string; // ISO string
    buildingName: string;
    name: string;
    barcode: string;
    status: string;
    notes?: string;
    inspectorName?: string;
    checkResults?: any[];
    repairDate?: number; // Changed from string to number to match InspectionItem
    repairNotes?: string;
    isForced?: boolean;
    forcedFromDueDate?: number;
}

interface HistoryTableProps {
    data: HistoryItem[];
    onViewDetails: (item: HistoryItem) => void;
    onViewRecheck: (item: HistoryItem) => void;
    onDelete?: (item: HistoryItem) => void;
    onBatchDelete?: (items: HistoryItem[]) => void;
    visibleColumns: {
        index: boolean;
        date: boolean;
        building: boolean;
        equipment: boolean;
        barcode: boolean;
        result: boolean;
        notes: boolean;
        inspector: boolean;
        actions: boolean;
    };
    columnOrder?: string[];
    systemSettings?: any;
    isAdmin?: boolean;
}

const HistoryTable: React.FC<HistoryTableProps> = ({
    data,
    onViewDetails,
    onViewRecheck,
    onDelete,
    onBatchDelete,
    visibleColumns,
    columnOrder = ['index', 'date', 'building', 'equipment', 'barcode', 'result', 'notes', 'inspector', 'actions'],
    systemSettings,
    isAdmin
}) => {
    const { t } = useLanguage();

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // Selection State
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    // Sort Handler
    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Memoized Sorted Data
    const sortedData = useMemo(() => {
        if (!sortConfig) return data;

        return [...data].sort((a, b) => {
            const key = sortConfig.key;
            const direction = sortConfig.direction === 'asc' ? 1 : -1;

            switch (key) {
                case 'date':
                    return (new Date(a.date).getTime() - new Date(b.date).getTime()) * direction;
                case 'result': // Sort by severity: Abnormal > Fixed > Normal
                    const getSeverity = (s: string) => {
                        if (s === 'Abnormal' || s === '異常') return 3;
                        if (s === 'Fixed' || s === '已改善') return 2;
                        return 1;
                    };
                    return (getSeverity(a.status) - getSeverity(b.status)) * direction;
                case 'index':
                    return 0; // Index usually relates to the original list order or is just a counter. Preserving order for now.
                case 'actions': // Sort by "Has Issues" (needs attention)
                    const aHasAction = (a.repairDate || a.status === 'Fixed' || a.status === '已改善') ? 1 : 0;
                    const bHasAction = (b.repairDate || b.status === 'Fixed' || b.status === '已改善') ? 1 : 0;
                    return (aHasAction - bHasAction) * direction;
                default:
                    // Default string comparison
                    const valA = String((a as any)[key === 'equipment' ? 'name' : key === 'inspector' ? 'inspectorName' : key === 'building' ? 'buildingName' : key] || '');
                    const valB = String((b as any)[key === 'equipment' ? 'name' : key === 'inspector' ? 'inspectorName' : key === 'building' ? 'buildingName' : key] || '');
                    return valA.localeCompare(valB, 'zh-TW') * direction;
            }
        });
    }, [data, sortConfig]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Reset pagination when data changes
    useEffect(() => {
        setCurrentPage(1);
        setSelectedItems(new Set()); // Reset selection when data changes
    }, [data.length]);

    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, sortedData.length);

    // Batch Selection Handlers
    const toggleSelectAll = () => {
        if (selectedItems.size === paginatedData.length) {
            setSelectedItems(new Set());
        } else {
            const newSelected = new Set(paginatedData.map(item => item.equipmentId));
            setSelectedItems(newSelected);
        }
    };

    const toggleSelectItem = (id: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const handleBatchDeleteClick = () => {
        if (!onBatchDelete) return;

        const itemsToDelete = data.filter(item => selectedItems.has(item.equipmentId));

        if (window.confirm(`確定要刪除選取的 ${itemsToDelete.length} 筆紀錄嗎?\n(此動作無法復原)`)) {
            onBatchDelete(itemsToDelete);
            setSelectedItems(new Set());
        }
    };

    // Helper to render status badge
    const renderStatusBadge = (item: HistoryItem) => {
        const { status, repairDate, isForced, forcedFromDueDate } = item;
        const isFixed = repairDate || status === 'Fixed' || status === '已改善';

        let badge = null;
        if (isFixed) {
            badge = (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-300 rounded-full text-xs font-extrabold shadow-xs">
                    <CheckCircle className="w-3.5 h-3.5" /> 已改善
                </span>
            );
        } else if (status === 'Abnormal' || status === '異常') {
            badge = (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-300 rounded-full text-xs font-extrabold shadow-xs">
                    <AlertTriangle className="w-3.5 h-3.5" /> 異常
                </span>
            );
        } else {
            badge = (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full text-xs font-extrabold shadow-xs">
                    <CheckCircle className="w-3.5 h-3.5" /> 正常
                </span>
            );
        }

        if (isForced) {
            const tip = forcedFromDueDate ? `原定到期日: ${new Date(forcedFromDueDate).toLocaleDateString('zh-TW')}` : '提前強制檢查';
            return (
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                    {badge}
                    <span
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-600 rounded-full text-[11px] font-extrabold shadow-xs cursor-help"
                        title={tip}
                    >
                        ⚡提前
                    </span>
                </div>
            );
        }

        return badge;
    };

    // Helper to render date
    const renderDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime()) ? date.toLocaleDateString('zh-TW') : '-';
    };

    const renderHeader = (key: string) => {
        const labels: Record<string, string> = {
            index: t('index'),
            date: t('checkDate'),
            building: t('building'),
            equipment: t('equipmentName'),
            barcode: t('barcode'),
            result: t('result'),
            notes: t('notes'),
            inspector: t('inspector'),
            actions: t('checkItems')
        };

        const label = labels[key];
        if (!label) return null;

        const isSorted = sortConfig?.key === key;
        const Icon = isSorted
            ? (sortConfig.direction === 'asc' ? ChevronUp : ChevronDown)
            : ChevronsUpDown;

        if (key === 'index' && isAdmin && onBatchDelete) {
            return (
                <th key="select-all" className="px-4 py-3.5 w-16 text-center">
                    <button
                        onClick={toggleSelectAll}
                        className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-600"
                    >
                        {selectedItems.size > 0 && selectedItems.size === paginatedData.length ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                            <Square className="w-5 h-5" />
                        )}
                    </button>
                </th>
            );
        }

        return (
            <th
                key={key}
                onClick={() => handleSort(key)}
                className={`px-4 py-3.5 cursor-pointer select-none hover:bg-slate-200/70 transition-colors group ${key === 'index' || key === 'actions' ? 'text-center' : 'text-left'}`}
            >
                <div className={`flex items-center gap-1.5 ${key === 'index' || key === 'actions' ? 'justify-center' : ''}`}>
                    {label}
                    <Icon className={`w-3.5 h-3.5 transition-colors ${isSorted ? 'text-blue-600 stroke-[3px]' : 'text-slate-400 group-hover:text-slate-600'}`} />
                </div>
            </th>
        );
    };

    const renderCell = (key: string, row: HistoryItem, index: number) => {
        switch (key) {
            case 'index':
                if (isAdmin && onBatchDelete) {
                    return (
                        <td key={`select-${row.equipmentId}`} className="px-4 py-3.5 text-center">
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleSelectItem(row.equipmentId); }}
                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition-colors"
                            >
                                {selectedItems.has(row.equipmentId) ? (
                                    <CheckSquare className="w-5 h-5 text-blue-600" />
                                ) : (
                                    <Square className="w-5 h-5" />
                                )}
                            </button>
                        </td>
                    );
                }
                return (
                    <td key={key} className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-slate-100 text-slate-700 font-extrabold text-xs border border-slate-300/80 shadow-2xs">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                        </span>
                    </td>
                );
            case 'date': return <td key={key} className="px-4 py-3.5 text-slate-800 font-bold">{renderDate(row.date)}</td>;
            case 'building': return <td key={key} className="px-4 py-3.5 text-slate-800 font-semibold">{row.buildingName || '-'}</td>;
            case 'equipment': return <td key={key} className="px-4 py-3.5 text-slate-900 font-extrabold">{row.name || '未命名項目'}</td>;
            case 'barcode': return (
                <td key={key} className="px-4 py-3.5">
                    <span className="px-2.5 py-1 rounded-md font-mono text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300/80">
                        {row.barcode || '-'}
                    </span>
                </td>
            );
            case 'result': return <td key={key} className="px-4 py-3.5">{renderStatusBadge(row)}</td>;
            case 'notes': return <td key={key} className="px-4 py-3.5 text-xs text-slate-700 font-semibold">{(row.notes || '').replace('[異常複檢 - 已修復]', '').trim() || '-'}</td>;
            case 'inspector': return <td key={key} className="px-4 py-3.5 text-slate-800 font-semibold">{row.inspectorName || '未知'}</td>;
            case 'actions': return (
                <td key={key} className="px-4 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                        {row.checkResults && row.checkResults.length > 0 && (isAdmin || systemSettings?.allowInspectorViewHistoryDetail !== false) && (
                            <button
                                onClick={() => onViewDetails(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-extrabold hover:bg-blue-100 hover:border-blue-300 transition-all shadow-xs border border-blue-200 active:scale-95"
                                title="內容"
                            >
                                <ClipboardList className="w-3.5 h-3.5" />
                                內容
                            </button>
                        )}
                        {(row.repairDate || row.status === 'Fixed' || row.status === '已改善' || row.status === 'Abnormal' || row.status === '異常') && (isAdmin || systemSettings?.allowInspectorViewCompleted !== false) && (
                            <button
                                onClick={() => onViewRecheck(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-extrabold hover:bg-red-100 hover:border-red-300 transition-all shadow-xs border border-red-200 active:scale-95"
                                title="檢修"
                            >
                                <Wrench className="w-3.5 h-3.5" />
                                檢修
                            </button>
                        )}
                        {(isAdmin || systemSettings?.allowInspectorDeleteHistory) && onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('確定要刪除此筆紀錄嗎?\n(此動作無法復原)')) {
                                        onDelete(row);
                                    }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-extrabold hover:bg-red-100 hover:border-red-300 transition-all shadow-xs border border-red-200 active:scale-95"
                                title="刪除"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                刪除
                            </button>
                        )}
                    </div>
                </td>
            );
            default: return null;
        }
    };

    return (
        <div className="space-y-4">

            {/* Batch Actions Toolbar */}
            {selectedItems.size > 0 && isAdmin && onBatchDelete && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between mb-4 animate-in slide-in-from-top-2 shadow-sm">
                    <div className="flex items-center gap-2 text-red-700 font-extrabold px-2">
                        <CheckSquare className="w-5 h-5" />
                        <span>已選取 {selectedItems.size} 項目</span>
                    </div>
                    <button
                        onClick={handleBatchDeleteClick}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        刪除所選項目
                    </button>
                </div>
            )}

            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden md:block bg-white rounded-2xl shadow-md border border-slate-300 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-100/95 text-slate-800 font-extrabold border-b-2 border-slate-300 tracking-wide">
                            <tr>
                                {columnOrder.map(key =>
                                    visibleColumns[key as keyof typeof visibleColumns] ? renderHeader(key) : null
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/90">
                            {paginatedData.map((row, index) => (
                                <tr
                                    key={`${row.reportId}-${index}`}
                                    className={`transition-colors ${selectedItems.has(row.equipmentId)
                                            ? 'bg-blue-50/70'
                                            : index % 2 === 1
                                                ? 'bg-slate-50/80 hover:bg-blue-50/40'
                                                : 'bg-white hover:bg-blue-50/40'
                                        }`}
                                >
                                    {columnOrder.map(key =>
                                        visibleColumns[key as keyof typeof visibleColumns] ? renderCell(key, row, index) : null
                                    )}
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={columnOrder.filter(key => visibleColumns[key as keyof typeof visibleColumns]).length} className="px-4 py-12 text-center text-slate-500 font-bold">
                                        無相關資料
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile Card View (Visible on Mobile) */}
            <div className="md:hidden space-y-4">
                {paginatedData.map((row, index) => (
                    <div key={`${row.reportId}-${index}-mobile`} className={`bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden ${selectedItems.has(row.equipmentId) ? 'ring-2 ring-blue-500' : ''}`}>
                        {/* Selection Overlay for Mobile */}
                        {isAdmin && onBatchDelete && (
                            <div className="absolute top-4 right-4 z-10">
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleSelectItem(row.equipmentId); }}
                                    className="p-2 bg-white/80 backdrop-blur rounded-full shadow-sm"
                                >
                                    {selectedItems.has(row.equipmentId) ? (
                                        <CheckSquare className="w-6 h-6 text-blue-600" />
                                    ) : (
                                        <Square className="w-6 h-6 text-slate-400" />
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Card Header */}
                        <div className="p-4 bg-slate-100/80 border-b border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-white border border-slate-300 text-xs font-extrabold text-slate-700">#{(currentPage - 1) * itemsPerPage + index + 1}</span>
                                <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                                    <Calendar className="w-4 h-4 text-slate-500" />
                                    {renderDate(row.date)}
                                </div>
                            </div>
                            {renderStatusBadge(row)}
                        </div>

                        {/* Card Body */}
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                {visibleColumns.equipment && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-extrabold text-slate-500 flex items-center gap-1">
                                            <Box className="w-3 h-3 text-amber-600" /> 設備名稱
                                        </label>
                                        <p className="font-extrabold text-slate-900">{row.name || '未命名項目'}</p>
                                    </div>
                                )}
                                {visibleColumns.building && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-extrabold text-slate-500 flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-blue-600" /> 建築位置
                                        </label>
                                        <p className="text-sm font-semibold text-slate-800 truncate">{row.buildingName || '-'}</p>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {visibleColumns.barcode && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-extrabold text-slate-500 flex items-center gap-1">
                                            <Hash className="w-3 h-3 text-indigo-600" /> 編號
                                        </label>
                                        <p className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded px-2 py-0.5 inline-block">
                                            {row.barcode || '-'}
                                        </p>
                                    </div>
                                )}
                                {visibleColumns.inspector && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-extrabold text-slate-500 flex items-center gap-1">
                                            <User className="w-3 h-3 text-teal-600" /> 檢查員
                                        </label>
                                        <p className="text-sm font-semibold text-slate-800">{row.inspectorName || '-'}</p>
                                    </div>
                                )}
                            </div>

                            {visibleColumns.notes && row.notes && (
                                <div className="pt-2 border-t border-slate-200/80">
                                    <label className="text-xs font-extrabold text-slate-500 flex items-center gap-1 mb-1">
                                        <FileText className="w-3 h-3" /> 備註
                                    </label>
                                    <p className="text-xs text-slate-700 font-medium italic">
                                        {(row.notes || '').replace('[異常複檢 - 已修復]', '').trim() || '-'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Card Footer - Actions */}
                        {visibleColumns.actions && (
                            <div className="p-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => onViewDetails(row)}
                                    disabled={!row.checkResults || row.checkResults.length === 0}
                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-sm transition-all ${(!row.checkResults || row.checkResults.length === 0)
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-white text-blue-700 border border-blue-200 shadow-sm hover:bg-blue-50 active:scale-95'
                                        }`}
                                >
                                    <ClipboardList className="w-4 h-4" />
                                    內容
                                </button>

                                <button
                                    onClick={() => onViewRecheck(row)}
                                    disabled={!(row.repairDate || row.status === 'Fixed' || row.status === '已改善' || row.status === 'Abnormal' || row.status === '異常')}
                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-sm transition-all ${!(row.repairDate || row.status === 'Fixed' || row.status === '已改善' || row.status === 'Abnormal' || row.status === '異常')
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-white text-red-700 border border-red-200 shadow-sm hover:bg-red-50 active:scale-95'
                                        }`}
                                >
                                    <Wrench className="w-4 h-4" />
                                    檢修
                                </button>

                                {(isAdmin || systemSettings?.allowInspectorDeleteHistory) && onDelete && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm('確定要刪除此筆紀錄嗎?\n(此動作無法復原)')) {
                                                onDelete(row);
                                            }
                                        }}
                                        className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-sm bg-white text-red-600 border border-red-200 shadow-sm hover:bg-red-50 active:scale-95 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        刪除紀錄
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {paginatedData.length === 0 && (
                    <div className="text-center py-12 text-slate-500 font-bold bg-white rounded-2xl border border-slate-300 border-dashed">
                        <p>無相關資料</p>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {
                sortedData.length > 0 && (
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-2">
                        <div className="text-sm font-extrabold text-slate-700 bg-white px-4 py-2 rounded-xl border border-slate-300 shadow-sm">
                            顯示 {startItem} - {endItem} 項，共 {sortedData.length} 項
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 font-extrabold text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                            >
                                上一頁
                            </button>

                            <span className="text-sm font-extrabold text-slate-800 bg-white border border-slate-300 px-3.5 py-2 rounded-xl min-w-[5rem] text-center shadow-sm">
                                第 {currentPage} 頁 / 共 {totalPages} 頁
                            </span>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 font-extrabold text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                            >
                                下一頁
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default HistoryTable;
