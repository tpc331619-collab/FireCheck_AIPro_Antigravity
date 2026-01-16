import { EquipmentDefinition, LightSettings } from '../types';

export const getCycleDays = (freq?: string): number => {
    if (!freq) return 30; // Default

    // Handle new simplified frequency options
    if (freq === 'monthly') return 30;
    if (freq === 'quarterly') return 90;
    if (freq === 'yearly') return 365;

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

export const getFrequencyStatus = (item: EquipmentDefinition, settings?: LightSettings): 'COMPLETED' | 'PENDING' | 'UNNECESSARY' | 'CAN_INSPECT' => {
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
    const redThreshold = settings?.red?.days ?? 2;
    const yellowThreshold = settings?.yellow?.days ?? 5;

    if (remainingDays <= redThreshold) {
        return 'PENDING'; // 🔴 紅色「需檢查」
    } else if (remainingDays <= yellowThreshold) {
        return 'CAN_INSPECT'; // 🟠 橙色/黃色「可以檢查」
    } else {
        return 'UNNECESSARY'; // 🟢 綠色「不需檢查」
    }
};
