import React, { useState, useMemo, useEffect } from 'react';
import { ClipboardList, AlertTriangle, CheckCircle, Calendar, MapPin, Box, Hash, User, FileText, ChevronsUpDown, ChevronUp, ChevronDown, Wrench } from 'lucide-react';
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
}

interface HistoryTableProps {
    data: HistoryItem[];
    onViewDetails: (item: HistoryItem) => void;
    onViewRecheck: (item: HistoryItem) => void;
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
}

const HistoryTable: React.FC<HistoryTableProps> = ({
    data,
    onViewDetails,
    onViewRecheck,
    visibleColumns,
    columnOrder = ['index', 'date', 'building', 'equipment', 'barcode', 'result', 'notes', 'inspector', 'actions']
}) => {
    const { t } = useLanguage();

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

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
    }, [data.length]);

    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, sortedData.length);

    // Helper to render status badge
    const renderStatusBadge = (item: HistoryItem) => {
        const { status, repairDate } = item;
        const isFixed = repairDate || status === 'Fixed' || status === '已改善';

        // Debug logging for abnormal/fixed items
        if (status === 'Abnormal' || status === '異常' || status === 'Fixed' || status === '已改善' || repairDate) {
            console.log(`[HistoryTable] Item: ${item.name}, Status: ${status}, RepairDate: ${repairDate}, IsFixed: ${isFixed}`);
        }

        if (isFixed) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                    <CheckCircle className="w-3.5 h-3.5" /> 已改善
                </span>
            );
        } else if (status === 'Abnormal' || status === '異常') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" /> 異常
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold">
                    <CheckCircle className="w-3.5 h-3.5" /> 正常
                </span>
            );
        }
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

        return (
            <th
                key={key}
                onClick={() => handleSort(key)}
                className={`px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors group ${key === 'index' || key === 'actions' ? 'text-center' : 'text-left'}`}
            >
                <div className={`flex items-center gap-1.5 ${key === 'index' || key === 'actions' ? 'justify-center' : ''}`}>
                    {label}
                    <Icon className={`w-3.5 h-3.5 transition-colors ${isSorted ? 'text-blue-600 stroke-[3px]' : 'text-slate-300 group-hover:text-slate-400'}`} />
                </div>
            </th>
        );
    };

    const renderCell = (key: string, row: HistoryItem, index: number) => {
        switch (key) {
            case 'index': return <td key={key} className="px-4 py-3 text-center text-slate-700 font-bold">{(currentPage - 1) * itemsPerPage + index + 1}</td>;
            case 'date': return <td key={key} className="px-4 py-3 text-slate-900 font-medium">{renderDate(row.date)}</td>;
            case 'building': return <td key={key} className="px-4 py-3 text-slate-900">{row.buildingName || '-'}</td>;
            case 'equipment': return <td key={key} className="px-4 py-3 text-slate-900 font-bold">{row.name || '未命名項目'}</td>;
            case 'barcode': return <td key={key} className="px-4 py-3 font-mono text-xs text-slate-600">{row.barcode || '-'}</td>;
            case 'result': return <td key={key} className="px-4 py-3">{renderStatusBadge(row)}</td>;
            case 'notes': return <td key={key} className="px-4 py-3 text-xs text-slate-700 font-medium">{(row.notes || '').replace('[異常複檢 - 已修復]', '').trim() || '-'}</td>;
            case 'inspector': return <td key={key} className="px-4 py-3 text-slate-900">{row.inspectorName || '未知'}</td>;
            case 'actions': return (
                <td key={key} className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                        {row.checkResults && row.checkResults.length > 0 && (
                            <button
                                onClick={() => onViewDetails(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors shadow-sm border border-blue-100"
                                title="內容"
                            >
                                <ClipboardList className="w-3.5 h-3.5" />
                                內容
                            </button>
                        )}
                        {(row.repairDate || row.status === 'Fixed' || row.status === '已改善' || row.status === 'Abnormal' || row.status === '異常') && (
                            <button
                                onClick={() => onViewRecheck(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors shadow-sm border border-red-100"
                                title="檢修"
                            >
                                <Wrench className="w-3.5 h-3.5" />
                                檢修
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

            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                                {columnOrder.map(key =>
                                    visibleColumns[key as keyof typeof visibleColumns] ? renderHeader(key) : null
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.map((row, index) => (
                                <tr key={`${row.reportId}-${index}`} className="hover:bg-slate-50 transition-colors">
                                    {columnOrder.map(key =>
                                        visibleColumns[key as keyof typeof visibleColumns] ? renderCell(key, row, index) : null
                                    )}
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={columnOrder.filter(key => visibleColumns[key as keyof typeof visibleColumns]).length} className="px-4 py-8 text-center text-slate-400">
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
                    <div key={`${row.reportId}-${index}-mobile`} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Card Header */}
                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">#{(currentPage - 1) * itemsPerPage + index + 1}</span>
                                <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                                    <Calendar className="w-4 h-4 text-slate-400" />
                                    {renderDate(row.date)}
                                </div>
                            </div>
                            {renderStatusBadge(row.status)}
                        </div>

                        {/* Card Body */}
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                {visibleColumns.equipment && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                            <Box className="w-3 h-3" /> 設備名稱
                                        </label>
                                        <p className="font-bold text-slate-800">{row.name || '未命名項目'}</p>
                                    </div>
                                )}
                                {visibleColumns.building && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> 建築位置
                                        </label>
                                        <p className="text-sm font-medium text-slate-700 truncate">{row.buildingName || '-'}</p>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {visibleColumns.barcode && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                            <Hash className="w-3 h-3" /> 編號
                                        </label>
                                        <p className="font-mono text-xs font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 inline-block">
                                            {row.barcode || '-'}
                                        </p>
                                    </div>
                                )}
                                {visibleColumns.inspector && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                            <User className="w-3 h-3" /> 檢查員
                                        </label>
                                        <p className="text-sm font-medium text-slate-700">{row.inspectorName || '-'}</p>
                                    </div>
                                )}
                            </div>

                            {visibleColumns.notes && row.notes && (
                                <div className="pt-2 border-t border-slate-50">
                                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1">
                                        <FileText className="w-3 h-3" /> 備註
                                    </label>
                                    <p className="text-xs text-slate-600 italic">
                                        {(row.notes || '').replace('[異常複檢 - 已修復]', '').trim() || '-'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Card Footer - Actions */}
                        {visibleColumns.actions && (
                            <div className="p-3 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => onViewDetails(row)}
                                    disabled={!row.checkResults || row.checkResults.length === 0}
                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${(!row.checkResults || row.checkResults.length === 0)
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-white text-blue-600 border border-blue-200 shadow-sm hover:bg-blue-50 active:scale-95'
                                        }`}
                                >
                                    <ClipboardList className="w-4 h-4" />
                                    內容
                                </button>

                                <button
                                    onClick={() => onViewRecheck(row)}
                                    disabled={!(row.repairDate || row.status === 'Fixed' || row.status === '已改善' || row.status === 'Abnormal' || row.status === '異常')}
                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${!(row.repairDate || row.status === 'Fixed' || row.status === '已改善' || row.status === 'Abnormal' || row.status === '異常')
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-white text-red-600 border border-red-200 shadow-sm hover:bg-red-50 active:scale-95'
                                        }`}
                                >
                                    <Wrench className="w-4 h-4" />
                                    檢修
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                {paginatedData.length === 0 && (
                    <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200 border-dashed">
                        <p>無相關資料</p>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {sortedData.length > 0 && (
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-2">
                    <div className="text-sm font-bold text-slate-500 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                        顯示 {startItem} - {endItem} 項，共 {sortedData.length} 項
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                        >
                            上一頁
                        </button>

                        <span className="text-sm font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-lg min-w-[5rem] text-center">
                            第 {currentPage} 頁 / 共 {totalPages} 頁
                        </span>

                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                        >
                            下一頁
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HistoryTable;
