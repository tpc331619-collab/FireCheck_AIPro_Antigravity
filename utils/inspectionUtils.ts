import { EquipmentDefinition } from '../types';

export const getCycleDays = (freq?: string): number => {
    if (!freq) return 30; // Default

    // Handle new simplified frequency options
    if (freq === 'monthly') return 30;
    if (freq === 'quarterly') return 90;
    if (freq === 'yearly') return 365;

    // Legacy support for old values
    if (freq === 'weekly') return 7;
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
        return 'COMPLETED'; // 已完成 (今日已檢查)
    }

    // 2. Calculate remaining days until next inspection
    const nextDateTs = getNextInspectionDate(item);
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const remainingDays = Math.ceil((nextDateTs - now) / msPerDay);

    // 3. Determine status based on remaining days
    if (remainingDays <= 2) {
        return 'PENDING'; // 🔴 紅色「需檢查」: 剩餘 <= 2 天
    } else if (remainingDays < 14) {
        return 'CAN_INSPECT'; // 🔵 藍色「可以檢查」: 剩餘 3-13 天
    } else {
        return 'UNNECESSARY'; // 🟢 綠色「不需檢查」: 剩餘 >= 14 天
    }
};
