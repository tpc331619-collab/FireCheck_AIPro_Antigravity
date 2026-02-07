
import React, { useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useEquipment } from '../../hooks/useSystemData';
import { UserProfile, SystemSettings } from '../../types';
import { ArrowBigDownDash, Box, Flame, BellRing, Droplets, BatteryCharging, Lightbulb, DoorOpen } from 'lucide-react';

interface EquipmentStatsExpandedProps {
    user: UserProfile;
    systemSettings?: SystemSettings;
    onMyEquipment: (filter?: string) => void;
    isOpen: boolean;
}

const getEquipmentIcon = (name: string) => {
    if (!name) return <Box className="w-5 h-5 text-slate-400" />;
    if (name.includes('滅火')) return <Flame className="w-5 h-5 text-orange-500" />;
    if (name.includes('警報') || name.includes('廣播')) return <BellRing className="w-5 h-5 text-red-500" />;
    if (name.includes('栓') || name.includes('水')) return <Droplets className="w-5 h-5 text-blue-500" />;
    if (name.includes('電')) return <BatteryCharging className="w-5 h-5 text-yellow-500" />;
    if (name.includes('燈') || name.includes('照明')) return <Lightbulb className="w-5 h-5 text-amber-500" />;
    if (name.includes('出口') || name.includes('門')) return <DoorOpen className="w-5 h-5 text-green-500" />;
    return <Box className="w-5 h-5 text-slate-400" />;
};

export const EquipmentStatsExpanded: React.FC<EquipmentStatsExpandedProps> = ({ user, systemSettings, onMyEquipment, isOpen }) => {
    const { t } = useLanguage();
    const { data: equipment = [] } = useEquipment(user);

    const statsArray = useMemo(() => {
        if (!isOpen) return [];

        const statsMap: Record<string, { siteName: string; buildingName: string; equipmentName: string; count: number }> = {};

        equipment.forEach(eq => {
            const sName = eq.siteName || '預設場所';
            const bName = eq.buildingName || '預設建築';
            const eName = eq.name || '未命名設備';
            const key = `${sName}|${bName}|${eName}`;

            if (statsMap[key]) {
                statsMap[key].count++;
            } else {
                statsMap[key] = {
                    siteName: sName,
                    buildingName: bName,
                    equipmentName: eName,
                    count: 1
                };
            }
        });

        return Object.values(statsMap).sort((a, b) => {
            if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName);
            if (a.buildingName !== b.buildingName) return a.buildingName.localeCompare(b.buildingName);
            return a.equipmentName.localeCompare(b.equipmentName);
        });
    }, [equipment, isOpen]);

    if (!isOpen) return null;

    // Permission check: View rules
    if (user.isGuest && !systemSettings?.allowGuestEquipmentOverview) return null;

    return (
        <div className="mt-4 p-4 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200/60 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
            {statsArray.length === 0 ? (
                <div className="text-center py-4 text-slate-400 text-sm">
                    {t('noEquipmentData')}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-3 px-4 font-bold text-slate-700 bg-slate-50/50">場所</th>
                                <th className="text-left py-3 px-4 font-bold text-slate-700 bg-slate-50/50">建築物</th>
                                <th className="text-left py-3 px-4 font-bold text-slate-700 bg-slate-50/50">設備名稱</th>
                                <th className="text-right py-3 px-4 font-bold text-slate-700 bg-slate-50/50">數量</th>
                            </tr>
                        </thead>
                        <tbody>
                            {statsArray.map((stat, index) => (
                                <tr
                                    key={index}
                                    className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
                                    onClick={() => onMyEquipment(stat.equipmentName)}
                                >
                                    <td className="py-3 px-4 text-slate-600">{stat.siteName}</td>
                                    <td className="py-3 px-4 text-slate-600">{stat.buildingName}</td>
                                    <td className="py-3 px-4 font-medium text-slate-800 flex items-center gap-2">
                                        <div className="p-1.5 bg-slate-100 rounded-lg">
                                            {getEquipmentIcon(stat.equipmentName)}
                                        </div>
                                        {stat.equipmentName}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-sm">
                                            {stat.count}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
