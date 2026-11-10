import React, { useMemo, useState } from 'react';
import {
    X,
    Calendar,
    CalendarClock,
    MapPin,
    CheckCircle2,
    AlertTriangle,
    Wrench,
    User,
    Clock,
    ClipboardCheck,
    History,
    Edit2,
    Tag,
    Box,
    ChevronDown,
    ChevronUp,
    ShieldCheck
} from 'lucide-react';
import {
    EquipmentDefinition,
    UserProfile,
    LightSettings,
    InspectionStatus
} from '../types';
import { useHistoryReports, useAbnormalRecords } from '../hooks/useSystemData';
import { getFrequencyStatus, getNextInspectionDate } from '../utils/inspectionUtils';
import { useLanguage } from '../contexts/LanguageContext';

interface EquipmentPassportModalProps {
    isOpen: boolean;
    onClose: () => void;
    equipment: EquipmentDefinition | null;
    user: UserProfile;
    lightSettings?: LightSettings;
    onStartInspection?: (equipment: EquipmentDefinition) => void;
    onViewFullHistory?: (barcodeOrName: string) => void;
    onEditEquipment?: (equipment: EquipmentDefinition) => void;
    canEdit?: boolean;
}

interface TimelineEntry {
    id: string;
    date: number;
    status: 'NORMAL' | 'ABNORMAL' | 'FIXED';
    inspectorName: string;
    notes?: string;
    abnormalReason?: string;
    abnormalItems?: string[];
    abnormalValue?: string;
    fixedDate?: number;
    fixedNotes?: string;
    isForced?: boolean;
    forcedFromDueDate?: number;
    checkResults?: Array<{
        name: string;
        value: string;
        unit?: string;
        threshold?: string;
        status?: string;
    }>;
}

const formatFrequencyLabel = (freq?: string): string => {
    if (!freq) return '每月';
    switch (freq.toUpperCase()) {
        case 'DAILY':
        case '1_DAY':
            return '每日';
        case 'WEEKLY':
        case '1_WEEK':
            return '每週';
        case 'MONTHLY':
        case '1_MONTH':
            return '每月';
        case 'QUARTERLY':
        case '3_MONTHS':
            return '每季 (3個月)';
        case 'HALF_YEARLY':
        case '6_MONTHS':
            return '每半年 (6個月)';
        case 'YEARLY':
        case '1_YEAR':
            return '每年';
        case '2_YEARS':
            return '每2年';
        case '3_YEARS':
            return '每3年';
        default:
            if (/^\d+$/.test(freq)) return `每 ${freq} 天`;
            return freq;
    }
};

const EquipmentPassportModal: React.FC<EquipmentPassportModalProps> = ({
    isOpen,
    onClose,
    equipment,
    user,
    lightSettings,
    onStartInspection,
    onViewFullHistory,
    onEditEquipment,
    canEdit = false
}) => {
    const { language } = useLanguage();
    const [showAllRecords, setShowAllRecords] = useState(false);
    const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

    const currentYear = new Date().getFullYear();
    const { data: reports = [], isLoading: isLoadingReports } = useHistoryReports(user, currentYear, {
        enabled: isOpen && !!equipment && !!user.uid
    });
    const { data: abnormalRecords = [], isLoading: isLoadingAbnormal } = useAbnormalRecords(user);

    // Aggregate & deduplicate timeline entries for this specific equipment
    const { timeline, totalMatches, hasPendingAbnormal } = useMemo(() => {
        if (!equipment) return { timeline: [] as TimelineEntry[], totalMatches: 0, hasPendingAbnormal: false };

        const entries: TimelineEntry[] = [];
        const equipAbnormalList = abnormalRecords.filter(
            r => r.equipmentId === equipment.id || (equipment.barcode && r.barcode === equipment.barcode)
        );

        const pendingAbnormal = equipAbnormalList.some(r => r.status === 'pending' && !r.fixedDate);

        // Map from history reports
        reports.forEach(report => {
            if (!report.items || report.items.length === 0) return;
            report.items.forEach(item => {
                const isMatch =
                    item.equipmentId === equipment.id ||
                    item.id === equipment.id ||
                    (equipment.barcode && item.barcode === equipment.barcode);

                if (!isMatch) return;

                const rawStatus = String(item.status || report.overallStatus || 'Normal');
                let mappedStatus: 'NORMAL' | 'ABNORMAL' | 'FIXED' = 'NORMAL';
                if (rawStatus === InspectionStatus.Fixed || rawStatus === 'Fixed' || rawStatus === '已改善') {
                    mappedStatus = 'FIXED';
                } else if (
                    rawStatus === InspectionStatus.Abnormal ||
                    rawStatus === 'Abnormal' ||
                    rawStatus === 'Fail' ||
                    rawStatus === '異常'
                ) {
                    mappedStatus = 'ABNORMAL';
                }

                // Match corresponding abnormal record if any for richer details
                const itemDate = typeof report.date === 'number' ? report.date : new Date(report.date).getTime();
                const matchedAbnormal = equipAbnormalList.find(
                    ar => Math.abs((ar.inspectionDate || 0) - itemDate) < 86400000 * 2
                );

                entries.push({
                    id: `${report.id}_${item.id || item.barcode}`,
                    date: itemDate,
                    status: matchedAbnormal?.status === 'fixed' ? 'FIXED' : mappedStatus,
                    inspectorName: report.inspectorName || '檢查員',
                    notes: item.notes,
                    abnormalReason: matchedAbnormal?.abnormalReason || (mappedStatus !== 'NORMAL' ? item.notes : undefined),
                    abnormalItems: matchedAbnormal?.abnormalItems || (item as any).abnormalItems,
                    abnormalValue: matchedAbnormal?.abnormalValue,
                    fixedDate: matchedAbnormal?.fixedDate || (item as any).repairDate,
                    fixedNotes: matchedAbnormal?.fixedNotes || (item as any).repairNotes,
                    checkResults: item.checkResults,
                    isForced: item.isForced,
                    forcedFromDueDate: item.forcedFromDueDate
                });
            });
        });

        // Also include any standalone abnormal records that might not be in current year's reports
        equipAbnormalList.forEach(ar => {
            const alreadyIncluded = entries.some(
                e => Math.abs(e.date - ar.inspectionDate) < 60000
            );
            if (!alreadyIncluded) {
                entries.push({
                    id: `AB_${ar.id}`,
                    date: ar.inspectionDate,
                    status: ar.status === 'fixed' ? 'FIXED' : 'ABNORMAL',
                    inspectorName: (ar as any).inspectorName || '檢查員',
                    abnormalReason: ar.abnormalReason,
                    abnormalItems: ar.abnormalItems,
                    abnormalValue: ar.abnormalValue,
                    fixedDate: ar.fixedDate,
                    fixedNotes: ar.fixedNotes
                });
            }
        });

        entries.sort((a, b) => b.date - a.date);

        return {
            timeline: entries,
            totalMatches: entries.length,
            hasPendingAbnormal: pendingAbnormal
        };
    }, [equipment, reports, abnormalRecords]);

    if (!isOpen || !equipment) return null;

    const freqStatus = getFrequencyStatus(equipment, lightSettings);
    const nextInspectionTs = getNextInspectionDate(equipment);
    const photoSrc = equipment.photoUrl || (equipment as any).photoURL;
    const displayedTimeline = showAllRecords ? timeline.slice(0, 15) : timeline.slice(0, 5);

    const getStatusBadge = () => {
        if (hasPendingAbnormal) {
            return {
                label: '異常待複檢',
                bg: 'bg-orange-500/20 text-orange-200 border-orange-400/40',
                dot: 'bg-orange-400 animate-pulse'
            };
        }
        switch (freqStatus) {
            case 'COMPLETED':
                return {
                    label: '已檢查 (正常)',
                    bg: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
                    dot: 'bg-emerald-400'
                };
            case 'CAN_INSPECT':
                return {
                    label: '可以檢查',
                    bg: 'bg-blue-500/20 text-blue-200 border-blue-400/40',
                    dot: 'bg-blue-400'
                };
            case 'PENDING':
                return {
                    label: '需檢查 (到期)',
                    bg: 'bg-red-500/25 text-red-200 border-red-400/50',
                    dot: 'bg-red-400 animate-ping'
                };
            default:
                return {
                    label: '不須檢查 (未到期)',
                    bg: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
                    dot: 'bg-emerald-400'
                };
        }
    };

    const statusBadge = getStatusBadge();

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top Digital Equipment Passport Header */}
                <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-5 sm:p-6 relative overflow-hidden shrink-0">
                    {/* Decorative background watermark */}
                    <ShieldCheck className="w-36 h-36 text-white/[0.03] absolute -right-6 -bottom-6 pointer-events-none" />

                    <div className="flex items-start justify-between gap-3 mb-4 relative z-10">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold border bg-white/10 text-amber-300 border-amber-400/30">
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            <span>設備電子履歷快查卡</span>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                            title="關閉"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 relative z-10">
                        {/* Equipment Photo / Thumbnail */}
                        {photoSrc ? (
                            <div
                                onClick={() => setEnlargedPhoto(photoSrc)}
                                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-white/20 bg-slate-800 shrink-0 cursor-zoom-in group relative shadow-lg"
                                title="點擊放大照片"
                            >
                                <img
                                    src={photoSrc}
                                    alt={equipment.name}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                />
                            </div>
                        ) : (
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-white/15 bg-white/5 flex flex-col items-center justify-center text-slate-400 shrink-0">
                                <Box className="w-8 h-8 mb-1 opacity-60" />
                                <span className="text-[10px] font-bold">無照片</span>
                            </div>
                        )}

                        {/* Equipment Title & Badges */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge.bg}`}>
                                    <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
                                    {statusBadge.label}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-md bg-white/15 text-white font-mono text-xs font-bold tracking-wider">
                                    {equipment.barcode}
                                </span>
                            </div>

                            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white truncate">
                                {equipment.name}
                            </h2>

                            <div className="flex items-center gap-1.5 text-slate-300 text-xs mt-1 font-medium">
                                <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="truncate">{equipment.siteName} · {equipment.buildingName}</span>
                            </div>

                            {equipment.tags && equipment.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {equipment.tags.map(tag => (
                                        <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-teal-500/20 text-teal-200 border border-teal-400/30 rounded text-[10px] font-bold">
                                            <Tag className="w-2.5 h-2.5" />
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3-Column Quick Schedule Bar */}
                    <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/10 text-xs relative z-10">
                        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                            <div className="text-slate-400 text-[10px] font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3 text-blue-400" />
                                定檢週期
                            </div>
                            <div className="font-bold text-white mt-0.5 truncate">
                                {formatFrequencyLabel(equipment.checkFrequency)}
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                            <div className="text-slate-400 text-[10px] font-bold flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-emerald-400" />
                                最近檢查日
                            </div>
                            <div className="font-bold text-white mt-0.5 truncate">
                                {equipment.lastInspectedDate
                                    ? new Date(equipment.lastInspectedDate).toLocaleDateString(language)
                                    : '尚未檢查'}
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                            <div className="text-slate-400 text-[10px] font-bold flex items-center gap-1">
                                <CalendarClock className="w-3 h-3 text-amber-400" />
                                下次應檢日
                            </div>
                            <div className="font-bold text-amber-300 mt-0.5 truncate">
                                {nextInspectionTs
                                    ? new Date(nextInspectionTs).toLocaleDateString(language)
                                    : '---'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Middle Section: Recent Inspection & Repair Timeline */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50 custom-scrollbar">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <History className="w-4 h-4 text-blue-600" />
                            <span>近期巡檢與維修履歷時間軸</span>
                        </h3>
                        <span className="text-xs font-bold text-slate-500 bg-slate-200/70 px-2.5 py-0.5 rounded-full">
                            今年共 {totalMatches} 筆紀錄
                        </span>
                    </div>

                    {isLoadingReports || isLoadingAbnormal ? (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600 mb-2" />
                            <span className="text-xs font-bold">讀取設備履歷中...</span>
                        </div>
                    ) : displayedTimeline.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                            <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm font-bold text-slate-600">尚無本年度巡檢紀錄</p>
                            <p className="text-xs text-slate-400 mt-1">完成首次設備檢查後，這裡會自動生成時間軸履歷</p>
                        </div>
                    ) : (
                        <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                            {displayedTimeline.map((entry, idx) => {
                                const isNormal = entry.status === 'NORMAL';
                                const isFixed = entry.status === 'FIXED';

                                return (
                                    <div key={entry.id || idx} className="relative group">
                                        {/* Timeline Node Dot */}
                                        <div
                                            className={`absolute -left-6 top-1.5 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-slate-50 shadow-sm ${
                                                isNormal
                                                    ? 'bg-emerald-500 text-white'
                                                    : isFixed
                                                    ? 'bg-teal-600 text-white'
                                                    : 'bg-red-500 text-white'
                                            }`}
                                        >
                                            {isNormal ? (
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            ) : isFixed ? (
                                                <Wrench className="w-3.5 h-3.5" />
                                            ) : (
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                            )}
                                        </div>

                                        {/* Timeline Card */}
                                        <div
                                            className={`bg-white rounded-2xl p-3.5 border shadow-xs transition-all ${
                                                isNormal
                                                    ? 'border-slate-200/80'
                                                    : isFixed
                                                    ? 'border-teal-200 bg-teal-50/20'
                                                    : 'border-red-200 bg-red-50/20'
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                                                            isNormal
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : isFixed
                                                                ? 'bg-teal-100 text-teal-800'
                                                                : 'bg-red-100 text-red-700'
                                                        }`}
                                                    >
                                                        {isNormal
                                                            ? (entry.isForced ? '✓ 提前檢查正常' : '✓ 定期檢查正常')
                                                            : isFixed
                                                            ? '🔧 異常複檢已修復'
                                                            : (entry.isForced ? '⚠️ 提前檢查發現異常' : '⚠️ 檢查發現異常')}
                                                    </span>
                                                    {entry.isForced && (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-500/10 text-amber-700 border border-amber-300 rounded-md text-[11px] font-extrabold cursor-help"
                                                            title={entry.forcedFromDueDate ? `原定到期日: ${new Date(entry.forcedFromDueDate).toLocaleDateString(language)}` : '提前強制檢查'}
                                                        >
                                                            ⚡提前
                                                        </span>
                                                    )}
                                                    <span className="text-xs font-bold text-slate-700 font-mono">
                                                        {new Date(entry.date).toLocaleDateString(language)}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                                    <User className="w-3 h-3" />
                                                    <span>{entry.inspectorName}</span>
                                                </div>
                                            </div>

                                            {/* Check Results Pills (if numeric or specific items recorded) */}
                                            {entry.checkResults && entry.checkResults.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {entry.checkResults.map((cr, cIdx) => {
                                                        const valDisplay =
                                                            cr.value === 'true' || cr.value === 'Normal' || cr.value === 'Pass'
                                                                ? '合格'
                                                                : cr.value === 'false' || cr.value === 'Abnormal' || cr.value === 'Fail'
                                                                ? '異常'
                                                                : `${cr.value}${cr.unit ? ` ${cr.unit}` : ''}`;
                                                        return (
                                                            <span
                                                                key={cIdx}
                                                                className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-medium"
                                                            >
                                                                {cr.name}: <strong className="text-slate-800">{valDisplay}</strong>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Abnormal & Repair Details */}
                                            {!isNormal && (
                                                <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                                                    {(entry.abnormalReason || entry.notes) && (
                                                        <div className="text-red-600 font-semibold flex items-start gap-1.5">
                                                            <span className="shrink-0 bg-red-100 text-red-700 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                                                異常原因
                                                            </span>
                                                            <span className="break-all">
                                                                {entry.abnormalReason || entry.notes}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {isFixed && (
                                                        <div className="text-teal-700 font-semibold flex items-start gap-1.5">
                                                            <span className="shrink-0 bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                                                修復處置
                                                            </span>
                                                            <span className="break-all">
                                                                {entry.fixedNotes || '已完成修復'}
                                                                {entry.fixedDate && (
                                                                    <span className="text-slate-400 font-normal ml-1.5">
                                                                        ({new Date(entry.fixedDate).toLocaleDateString(language)} 結案)
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {isNormal && entry.notes && entry.notes !== '-' && (
                                                <p className="text-xs text-slate-500 mt-1.5">
                                                    備註：{entry.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {timeline.length > 5 && (
                                <button
                                    onClick={() => setShowAllRecords(!showAllRecords)}
                                    className="w-full py-2 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50/60 hover:bg-blue-100/60 rounded-xl flex items-center justify-center gap-1 transition-colors"
                                >
                                    {showAllRecords ? (
                                        <>
                                            <ChevronUp className="w-4 h-4" />
                                            收合紀錄（僅顯示近 5 筆）
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-4 h-4" />
                                            展開更多紀錄（共 {timeline.length} 筆）
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Action Buttons */}
                <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                        {onViewFullHistory && (
                            <button
                                onClick={() => {
                                    const code = equipment.barcode || equipment.name;
                                    onClose();
                                    onViewFullHistory(code);
                                }}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                            >
                                <History className="w-4 h-4" />
                                <span>查看完整歷史表格</span>
                            </button>
                        )}
                        {canEdit && onEditEquipment && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onEditEquipment(equipment);
                                }}
                                className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                            >
                                <Edit2 className="w-4 h-4" />
                                <span>編輯設備</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        {onStartInspection && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onStartInspection(equipment);
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-200 transition-all"
                            >
                                <ClipboardCheck className="w-4 h-4" />
                                <span>前往檢查此設備</span>
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors"
                        >
                            關閉
                        </button>
                    </div>
                </div>
            </div>

            {/* Enlarged Photo Lightbox */}
            {enlargedPhoto && (
                <div
                    className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setEnlargedPhoto(null)}
                >
                    <img
                        src={enlargedPhoto}
                        alt={equipment.name}
                        className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                    />
                </div>
            )}
        </div>
    );
};

export default EquipmentPassportModal;

