
export const calculateNextInspectionDate = (start?: number, frequency?: string, lastInspected?: number): Date | null => {
    if (!start) return null;

    const startDate = new Date(start);
    const baseDate = lastInspected ? new Date(lastInspected) : startDate;

    // Using the original Start Date as the anchor for "Day of Month" consistency would be ideal for monthly/yearly,
    // but the user requirement implies a simple increment from the last state or start.
    // "Start 1/9 -> Next 2/9. After record -> Next 3/9"
    // This implies we want to find the next scheduled slot relative to the *Last Inspection* (or Start if none),
    // but aligned to the Start Date's cycle?

    // Let's implement robust logic:
    // Generate a sequence from Start Date. Find the first one > LastInspected (or > Now? User said "After record ... becomes 3/9")
    // If Start is 1/9. Last Record is NONE. Next is 2/9?
    // Wait, if I start on 1/9, usually 1/9 is the first check? Or 1/9 is the baseline and 2/9 is the first check?
    // User: "Start is 1/9, next is 2/9". This implies 1/9 is a past baseline, or the cycle starts +1 period.
    // Let's assume Next = (Last Valid Date) + 1 Period.
    // If LastInspected exists, Next = LastInspected + 1 Period?
    // User: "Start 1/9 -> Next 2/9". (Implies initial state).
    // "After record... Next 3/9". (Implies record was done around 2/9, so next is 3/9).
    // What if I check early on 1/20? Next should still be 3/9, not 2/20.
    // So we must align to the Start Date anchor.

    let targetDate = new Date(startDate);

    // Function to add periods
    const addPeriod = (d: Date, freq: string, count: number) => {
        const newDate = new Date(d);
        switch (freq) {
            case 'weekly': newDate.setDate(newDate.getDate() + (7 * count)); break;
            case 'monthly': newDate.setMonth(newDate.getMonth() + count); break;
            case 'quarterly': newDate.setMonth(newDate.getMonth() + (3 * count)); break;
            case 'yearly': newDate.setFullYear(newDate.getFullYear() + count); break;
            case '2years': newDate.setFullYear(newDate.getFullYear() + (2 * count)); break;
            case '3years': newDate.setFullYear(newDate.getFullYear() + (3 * count)); break;
            default: break; // custom not handled well here
        }
        return newDate;
    };

    if (!frequency || frequency === 'custom') return null; // Logic for custom is ambiguous

    // If no inspection yet, next is Start + 1 period?
    // User said "Start 1/9 -> Next 2/9".
    // If I interpret Start Date as "The date of the FIRST check", then Next should be Start + Frequency?
    // Or Start Date is "The commissioning date".
    // Let's assume Next = Start + Frequency for the very first time.

    let periodsToAdd = 1;
    let nextDate = addPeriod(targetDate, frequency, periodsToAdd);

    if (lastInspected) {
        // If we have inspected, we want the next slot AFTER the last inspection.
        // We keep adding periods to StartDate until > LastInspected.
        while (nextDate.getTime() <= lastInspected) {
            periodsToAdd++;
            nextDate = addPeriod(targetDate, frequency, periodsToAdd);
        }
    }

    return nextDate;
};
