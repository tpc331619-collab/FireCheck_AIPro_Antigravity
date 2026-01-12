
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

        // 如果是預定義的月數選項 (6, 12, 24, 36, 120)
        if (['6', '12', '24', '36', '120'].includes(freq)) {
            return { value: parseInt(freq), unit: 'month' };
        }

        const num = parseInt(freq);
        if (isNaN(num)) return null;

        // 如果包含特定單位
        if (freq.includes('month')) return { value: num, unit: 'month' };
        if (freq.includes('year')) return { value: num * (freq.startsWith('2') ? 2 : freq.startsWith('3') ? 3 : 1), unit: 'year' }; // 處理 2years, 3years 等預設值

        // 額外處理常見 UI 選項
        if (freq === 'weekly') return { value: 7, unit: 'day' };
        if (freq === 'monthly') return { value: 1, unit: 'month' };
        if (freq === 'quarterly') return { value: 3, unit: 'month' };
        if (freq === 'yearly') return { value: 1, unit: 'year' };
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

    // 如果沒有檢查紀錄，下一次檢查日 = 起算日 + 頻率
    let nextDate = addPeriod(startDate, freqConfig);

    // 如果有檢查紀錄，則找尋下一個大於最近一次檢查日的排程日期
    if (lastInspected) {
        while (nextDate.getTime() <= lastInspected) {
            nextDate = addPeriod(nextDate, freqConfig);
        }
    }

    return nextDate;
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
    } else if (diffDays < 10) {
        return { light: 'YELLOW', label: '預警' };
    } else {
        return { light: 'GREEN', label: '正常' };
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
    let value = 0;
    let unit: 'day' | 'month' | 'year' = 'year';

    if (lifespan === 'custom' && customLifespan) {
        const num = parseInt(customLifespan);
        if (isNaN(num)) return null;
        value = num;
        // 簡單判斷自定義中的單位，預設為月 (符合 user: "設定壽命以「月」為單位統一計算")
        unit = customLifespan.includes('年') || customLifespan.includes('y') ? 'year' : 'month';
        if (customLifespan.includes('天') || customLifespan.includes('d')) unit = 'day';
    } else {
        const num = parseInt(lifespan);
        if (isNaN(num)) return null;
        value = num;
        unit = lifespan.includes('m') ? 'month' : 'year';
    }

    const expiryDate = new Date(startDate);
    if (unit === 'day') expiryDate.setDate(expiryDate.getDate() + value);
    else if (unit === 'month') expiryDate.setMonth(expiryDate.getMonth() + value);
    else if (unit === 'year') expiryDate.setFullYear(expiryDate.getFullYear() + value);

    return expiryDate;
};
