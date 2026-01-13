import { EquipmentDefinition } from '../types';

export const getCycleDays = (freq?: string): number => {
    if (!freq) return 30; // Default
    if (freq === 'weekly') return 7;
    if (freq === 'monthly') return 30;
    if (freq === 'quarterly') return 90;
    if (freq === 'yearly') return 365;
    if (['6', '12', '24', '36', '120'].includes(freq)) return parseInt(freq) * 30;
    const parsed = parseInt(freq);
    return isNaN(parsed) ? 30 : parsed;
};

export const getNextInspectionDate = (item: EquipmentDefinition): number => {
    const lastDate = item.lastInspectedDate || item.createdAt || 0;
    if (!lastDate) return 0; // Due immediately

    const daysToAdd = getCycleDays(item.checkFrequency);
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate.getTime();
};

export const getFrequencyStatus = (item: EquipmentDefinition): 'COMPLETED' | 'PENDING' | 'UNNECESSARY' | 'CAN_INSPECT' => {
    // 1. Check if inspected TODAY
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    if (item.lastInspectedDate && item.lastInspectedDate >= startOfDay) {
        return 'COMPLETED'; // 已完成
    }

    // 2. Frequency Logic
    const nextDateTs = getNextInspectionDate(item);
    const now = Date.now();

    if (now >= nextDateTs) {
        return 'PENDING'; // 需檢查 (Overdue or Due)
    } else {
        // Check for "Unnecessary" (Remaining > 2/3 of cycle)
        const cycleDays = getCycleDays(item.checkFrequency);
        const msPerDay = 24 * 60 * 60 * 1000;
        const remainingMs = nextDateTs - now;
        const remainingDays = remainingMs / msPerDay;

        // "若離下次檢查日期還有2/3的日期" -> Remaining > (Cycle * 2/3)
        if (remainingDays > (cycleDays * (2 / 3))) {
            return 'UNNECESSARY'; // 不須檢查
        }

        return 'CAN_INSPECT'; // 可以檢查 (Not Due Yet)
    }
};
