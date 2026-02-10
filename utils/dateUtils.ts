
export const calculateNextInspectionDate = (start: number, frequency: string, lastInspected?: number | null): Date | null => {
    if (!start) return null;

    const startDate = new Date(start);
    // 頻率解析：預設選項為月數，若為 custom 則解析為天數 或 日期字串
    const parseFrequency = (freq: string): { value: number; unit: 'day' | 'month' | 'year' | 'date' } | null => {
        if (!freq) return null;

        // 如果是日期格式 (YYYY-MM-DD)，視為指定日期
        if (freq.includes('-') && freq.length > 5) {
            return { value: 0, unit: 'date' };
        }

        // 優先處理常見 UI 文字選項
        if (freq === 'weekly') return { value: 7, unit: 'day' };
        if (freq === 'monthly') return { value: 1, unit: 'month' };
        if (freq === 'quarterly') return { value: 3, unit: 'month' };
        if (freq === 'yearly') return { value: 1, unit: 'year' };

        // 處理特殊文字格式 (e.g. "2years")
        const num = parseInt(freq);
        if (isNaN(num)) return null;

        // 如果包含特定單位
        if (freq.includes('month')) return { value: num, unit: 'month' };
        if (freq.includes('year')) return { value: num * (freq.startsWith('2') ? 2 : freq.startsWith('3') ? 3 : 1), unit: 'year' }; // 處理 2years, 3years 等預設值

        // 額外處理常見 UI 選項 (legacy checks for 2years etc if they fall through)
        if (freq === '2years') return { value: 2, unit: 'year' };
        if (freq === '3years') return { value: 3, unit: 'year' };
        if (freq === '10years') return { value: 10, unit: 'year' };

        return { value: num, unit: 'day' }; // 預設為天
    };

    const freqConfig = parseFrequency(frequency);
    if (!freqConfig) return null;

    // 若頻率為指定日期 (自訂日期)
    if (freqConfig.unit === 'date') {
        const d = new Date(frequency);
        return isNaN(d.getTime()) ? null : d;
    }

    const addPeriod = (d: Date, config: { value: number; unit: 'day' | 'month' | 'year' | 'date' }) => {
        const newDate = new Date(d);
        if (config.unit === 'day') {
            newDate.setDate(newDate.getDate() + config.value);
        } else if (config.unit === 'month') {
            newDate.setMonth(newDate.getMonth() + config.value);
        } else if (config.unit === 'year') {
            newDate.setFullYear(newDate.getFullYear() + config.value);
        }
        return newDate;
    };

    // 如果有檢查紀錄，則下次檢查日 = 上次檢查日 + 頻率 (動態週期)
    if (lastInspected) {
        return addPeriod(new Date(lastInspected), freqConfig);
    }

    // 如果沒有檢查紀錄，下一次檢查日 = 起算日 + 頻率
    return addPeriod(startDate, freqConfig);
};

export type InspectionStatusLight = 'RED' | 'YELLOW' | 'GREEN';

export const getInspectionStatus = (nextDate: Date | null): { light: InspectionStatusLight; label: string } => {
    if (!nextDate) return { light: 'GREEN', label: '正常' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = new Date(nextDate);
    next.setHours(0, 0, 0, 0);

    const diffTime = next.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { light: 'RED', label: '逾期' };
    } else if (diffDays <= 2) {
        return { light: 'RED', label: '需檢查' };
    } else if (diffDays <= 6) {
        return { light: 'YELLOW', label: '可以檢查' };
    } else {
        return { light: 'GREEN', label: '不需檢查' };
    }
};

export const calculateExpiryDate = (start: number, lifespan: string, customLifespan?: string | null): Date | null => {
    if (!start || !lifespan) return null;

    // 自訂日期直接回傳 (若 customLifespan 是 YYYY-MM-DD 格式)
    if (lifespan === 'custom' && customLifespan && customLifespan.includes('-') && customLifespan.length > 5) {
        const d = new Date(customLifespan);
        return isNaN(d.getTime()) ? null : d;
    }

    const startDate = new Date(start);
    const parseLifespan = (life: string): { value: number; unit: 'year' | 'month' } | null => {
        if (!life) return null;
        if (life === '10years') return { value: 10, unit: 'year' };
        if (life === '20years') return { value: 20, unit: 'year' };
        if (life === '3years') return { value: 3, unit: 'year' }; // Common for fire equipment

        // Try parsing number
        const num = parseInt(life);
        if (!isNaN(num)) {
            if (life.includes('month')) return { value: num, unit: 'month' };
            if (life.includes('year')) return { value: num, unit: 'year' };
            // Default to year if just number (safest assumption for lifespan)
            return { value: num, unit: 'year' };
        }
        return null;
    };

    const config = parseLifespan(lifespan);
    if (!config) return null;

    const expiry = new Date(startDate);
    if (config.unit === 'year') {
        expiry.setFullYear(expiry.getFullYear() + config.value);
    } else {
        expiry.setMonth(expiry.getMonth() + config.value);
    }
    return expiry;
};

// New Helper: Format Remaining Time in Y M D
export const formatLifespan = (endDateStr: string, t: (key: string) => string, fromDateStr?: string): string => {
    if (!endDateStr) return '-';

    let now = new Date();
    if (fromDateStr) {
        now = new Date(fromDateStr);
    }
    // Reset time to start of day for accurate day calculation
    now.setHours(0, 0, 0, 0);

    const end = new Date(endDateStr);
    // Reset time to start of day
    end.setHours(0, 0, 0, 0);

    // If using current date (Remaining) and expired, return "Expired"
    // If using custom start date (Total), we show the duration even if passed, unless end < start
    if (!fromDateStr && end < now) {
        return t('expired'); // "已過期"
    }

    let years = end.getFullYear() - now.getFullYear();
    let months = end.getMonth() - now.getMonth();
    let days = end.getDate() - now.getDate();

    // Adjust for negative days
    if (days < 0) {
        months--;
        // Get days in previous month
        const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
        days += prevMonth.getDate();
    }

    // Adjust for negative months
    if (months < 0) {
        years--;
        months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years}${t('yearShort') || '年'}`);
    if (months > 0 || (years > 0 && days > 0)) parts.push(`${months}${t('monthShort') || '個月'}`);
    if (days > 0 || (years === 0 && months === 0)) parts.push(`${days}${t('dayShort') || '天'}`);

    // Fallback for 0 days
    if (parts.length === 0) return `0${t('dayShort') || '天'}`;

    return parts.join(' ');
};
