import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useEquipment } from '../../hooks/useSystemData';
import { UserProfile, SystemSettings } from '../../types';
import { Building2, Package, Layers, ChevronDown, ChevronRight } from 'lucide-react';

interface EquipmentStatsExpandedProps {
    user: UserProfile;
    systemSettings?: SystemSettings;
    onMyEquipment: (filter?: string) => void;
    isOpen: boolean;
}

export const EquipmentStatsExpanded: React.FC<EquipmentStatsExpandedProps> = ({ user, systemSettings, onMyEquipment, isOpen }) => {
    const { t } = useLanguage();
    const { data: equipment = [] } = useEquipment(user);
    const [viewMode, setViewMode] = useState<'byBuilding' | 'byType'>('byBuilding');
    // 預設為空物件：一開始全數收合 (Collapsed by default)
    const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

    // 1. 全場域設備種類總體匯總（一眼看清有什麼設備與全廠總數）
    const typeSummaries = useMemo(() => {
        if (!isOpen) return [];
        const typeMap: Record<string, number> = {};
        equipment.forEach(eq => {
            const name = eq.name || t('unnamed');
            typeMap[name] = (typeMap[name] || 0) + 1;
        });
        return Object.entries(typeMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [equipment, isOpen, t]);

    // 2. 依建築物/樓層分組（含各建築小計）
    const buildingGroups = useMemo(() => {
        if (!isOpen) return [];
        const bMap: Record<string, {
            siteName: string;
            buildingName: string;
            totalCount: number;
            items: { equipmentName: string; count: number }[];
        }> = {};

        equipment.forEach(eq => {
            const sName = eq.siteName || t('unnamed');
            const bName = eq.buildingName || t('unnamed');
            const eName = eq.name || t('unnamed');
            const bKey = `${sName}__${bName}`;

            if (!bMap[bKey]) {
                bMap[bKey] = {
                    siteName: sName,
                    buildingName: bName,
                    totalCount: 0,
                    items: []
                };
            }

            bMap[bKey].totalCount++;
            const existingItem = bMap[bKey].items.find(i => i.equipmentName === eName);
            if (existingItem) {
                existingItem.count++;
            } else {
                bMap[bKey].items.push({ equipmentName: eName, count: 1 });
            }
        });

        return Object.values(bMap).sort((a, b) => {
            if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName);
            return a.buildingName.localeCompare(b.buildingName);
        });
    }, [equipment, isOpen, t]);

    // 3. 依設備類型分組（看特定設備分佈在哪些建築）
    const typeGroups = useMemo(() => {
        if (!isOpen) return [];
        const tMap: Record<string, {
            equipmentName: string;
            totalCount: number;
            buildings: { siteName: string; buildingName: string; count: number }[];
        }> = {};

        equipment.forEach(eq => {
            const sName = eq.siteName || t('unnamed');
            const bName = eq.buildingName || t('unnamed');
            const eName = eq.name || t('unnamed');

            if (!tMap[eName]) {
                tMap[eName] = {
                    equipmentName: eName,
                    totalCount: 0,
                    buildings: []
                };
            }

            tMap[eName].totalCount++;
            const existingB = tMap[eName].buildings.find(b => b.siteName === sName && b.buildingName === bName);
            if (existingB) {
                existingB.count++;
            } else {
                tMap[eName].buildings.push({ siteName: sName, buildingName: bName, count: 1 });
            }
        });

        return Object.values(tMap).sort((a, b) => b.totalCount - a.totalCount);
    }, [equipment, isOpen, t]);

    if (!isOpen) return null;
    if (user.isGuest && !systemSettings?.allowGuestEquipmentOverview) return null;

    const totalCount = equipment.length;

    const toggleExpand = (key: string) => {
        setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleExpandAll = (expand: boolean) => {
        if (!expand) {
            setExpandedKeys({});
            return;
        }
        const allKeys: Record<string, boolean> = {};
        if (viewMode === 'byBuilding') {
            buildingGroups.forEach(g => {
                allKeys[`${g.siteName}__${g.buildingName}`] = true;
            });
        } else {
            typeGroups.forEach(t => {
                allKeys[`type__${t.equipmentName}`] = true;
            });
        }
        setExpandedKeys(allKeys);
    };

    return (
        <div className="mt-4 p-5 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
            {totalCount === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                    {t('noEquipmentData')}
                </div>
            ) : (
                <div className="space-y-5">
                    {/* 頂部全廠設備種類彙總面板（一眼看清有什麼設備與數量） */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Package className="w-4 h-4 text-indigo-500" />
                                全廠設備種類彙總
                            </span>
                            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                                全區總計：<strong className="text-indigo-600 font-black">{totalCount}</strong> 具
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                            {typeSummaries.map((item, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onMyEquipment(item.name)}
                                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-indigo-50/60 border border-slate-200/80 hover:border-indigo-200 rounded-xl transition-all text-left group"
                                    title={`點擊查看 ${item.name} 清單`}
                                >
                                    <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-700 truncate mr-2">
                                        {item.name}
                                    </span>
                                    <span className="text-xs font-bold px-2 py-0.5 bg-white group-hover:bg-indigo-600 group-hover:text-white text-slate-700 border border-slate-200 group-hover:border-indigo-600 rounded-lg shadow-2xs transition-colors shrink-0">
                                        {item.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 切換檢視維度與展開/收合控制 */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60">
                            <button
                                onClick={() => {
                                    setViewMode('byBuilding');
                                    setExpandedKeys({});
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'byBuilding'
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Building2 className="w-3.5 h-3.5" />
                                依建築分組與小計
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('byType');
                                    setExpandedKeys({});
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'byType'
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Layers className="w-3.5 h-3.5" />
                                依設備種類透視
                            </button>
                        </div>

                        {/* 全部展開 / 全部收合 捷徑按鈕 */}
                        <div className="flex items-center gap-3 text-xs">
                            <button
                                onClick={() => handleExpandAll(true)}
                                className="font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
                            >
                                全部展開
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                                onClick={() => handleExpandAll(false)}
                                className="font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
                            >
                                全部收合
                            </button>
                        </div>
                    </div>

                    {/* 檢視模式 1：依建築物分組與自動小計（一開始全數收合） */}
                    {viewMode === 'byBuilding' && (
                        <div className="space-y-2.5">
                            {buildingGroups.map((group, gIdx) => {
                                const bKey = `${group.siteName}__${group.buildingName}`;
                                const isExpanded = !!expandedKeys[bKey];

                                return (
                                    <div
                                        key={gIdx}
                                        className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs transition-all"
                                    >
                                        {/* 建築物標題列：點擊展開/收合 */}
                                        <div
                                            onClick={() => toggleExpand(bKey)}
                                            className={`flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/70 cursor-pointer select-none transition-colors ${
                                                isExpanded ? 'border-b border-slate-100' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <button className="text-slate-400 hover:text-slate-600 transition-colors">
                                                    {isExpanded ? (
                                                        <ChevronDown className="w-4 h-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-slate-400" />
                                                    )}
                                                </button>
                                                <Building2 className={`w-4 h-4 transition-colors ${isExpanded ? 'text-indigo-600' : 'text-slate-500'}`} />
                                                <span className="font-bold text-slate-800 text-sm">
                                                    {group.buildingName}
                                                </span>
                                                <span className="text-xs text-slate-400 font-normal">
                                                    ({group.siteName})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500">合計：</span>
                                                <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-black rounded-lg text-xs">
                                                    {group.totalCount} 具
                                                </span>
                                            </div>
                                        </div>

                                        {/* 建築物內的設備明細清單（展開時才顯示） */}
                                        {isExpanded && (
                                            <div className="divide-y divide-slate-100 animate-in fade-in duration-200">
                                                {group.items.map((item, iIdx) => (
                                                    <div
                                                        key={iIdx}
                                                        onClick={() => onMyEquipment(item.equipmentName)}
                                                        className="flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                                                    >
                                                        <div className="flex items-center gap-2 pl-6">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-indigo-500 transition-colors" />
                                                            <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                                                                {item.equipmentName}
                                                            </span>
                                                        </div>
                                                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 bg-slate-100 group-hover:bg-indigo-100 text-slate-700 group-hover:text-indigo-700 font-bold rounded-lg text-xs transition-colors">
                                                            {item.count} 具
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 檢視模式 2：依設備種類透視（一開始全數收合） */}
                    {viewMode === 'byType' && (
                        <div className="space-y-2.5">
                            {typeGroups.map((group, tIdx) => {
                                const tKey = `type__${group.equipmentName}`;
                                const isExpanded = !!expandedKeys[tKey];

                                return (
                                    <div
                                        key={tIdx}
                                        className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs transition-all"
                                    >
                                        <div
                                            onClick={() => toggleExpand(tKey)}
                                            className={`flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/70 cursor-pointer select-none transition-colors ${
                                                isExpanded ? 'border-b border-slate-100' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <button className="text-slate-400 hover:text-slate-600 transition-colors">
                                                    {isExpanded ? (
                                                        <ChevronDown className="w-4 h-4 text-emerald-600" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-slate-400" />
                                                    )}
                                                </button>
                                                <Package className={`w-4 h-4 transition-colors ${isExpanded ? 'text-emerald-600' : 'text-slate-500'}`} />
                                                <span className="font-bold text-slate-800 text-sm">
                                                    {group.equipmentName}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500">全區共有：</span>
                                                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200/80 text-emerald-700 font-black rounded-lg text-xs">
                                                    {group.totalCount} 具
                                                </span>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="divide-y divide-slate-100 animate-in fade-in duration-200">
                                                {group.buildings.map((b, bIdx) => (
                                                    <div
                                                        key={bIdx}
                                                        onClick={() => onMyEquipment(group.equipmentName)}
                                                        className="flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50/40 cursor-pointer transition-colors group"
                                                    >
                                                        <div className="flex items-center gap-2 pl-6">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-emerald-500 transition-colors" />
                                                            <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-700 transition-colors">
                                                                {b.buildingName}
                                                                <span className="text-xs text-slate-400 ml-2 font-normal">
                                                                    ({b.siteName})
                                                                </span>
                                                            </span>
                                                        </div>
                                                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 bg-slate-100 group-hover:bg-emerald-100 text-slate-700 group-hover:text-emerald-700 font-bold rounded-lg text-xs transition-colors">
                                                            {b.count} 具
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
