import * as XLSX from 'xlsx';

// Font support for Chinese in PDF is limited without loading a custom font.
// For now, we will use a basic setup. In a real production app, we would load a .ttf file.
// We prioritize Excel for full data fidelity with CJK characters.

export interface ExportItem {
    id?: string;
    date: number;
    buildingName: string;
    floor?: string; // Sometimes part of buildingName or separate
    name: string;   // Equipment name
    barcode: string;
    status: string; // 'Pass' | 'Fail' | ...
    notes?: string;
    inspectorName?: string;
    checkResults?: any[];
}

const formatStatus = (status: string) => {
    switch (status) {
        case 'Pass': return '正常';
        case 'OK': return '正常';
        case 'Normal': return '正常';
        case 'Fail': return '異常';
        case 'Abnormal': return '異常';
        case 'Fixed': return '已改善';
        default: return status;
    }
};

const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export const exportToExcel = (
    data: ExportItem[],
    fileName: string,
    visibleColumns?: {
        index?: boolean;
        date?: boolean;
        building?: boolean;
        equipment?: boolean;
        barcode?: boolean;
        result?: boolean;
        notes?: boolean;
        inspector?: boolean;
    },
    columnOrder?: string[]
) => {
    const columnMap: Record<string, { title: string; getValue: (item: ExportItem, idx: number) => any; defaultWidth: number }> = {
        index: { title: '序號', getValue: (_, idx) => idx + 1, defaultWidth: 8 },
        date: { title: '檢查日期', getValue: (item) => formatDate(item.date), defaultWidth: 14 },
        building: { title: '建築物', getValue: (item) => item.buildingName || '', defaultWidth: 18 },
        equipment: { title: '設備名稱', getValue: (item) => item.name, defaultWidth: 22 },
        barcode: { title: '條碼編號', getValue: (item) => item.barcode, defaultWidth: 16 },
        result: { title: '檢查結果', getValue: (item) => formatStatus(item.status), defaultWidth: 12 },
        notes: { title: '備註', getValue: (item) => item.notes || '', defaultWidth: 30 },
        inspector: { title: '檢查人員', getValue: (item) => item.inspectorName || '', defaultWidth: 14 }
    };

    const baseOrder = columnOrder && columnOrder.length > 0
        ? columnOrder.filter(k => k in columnMap)
        : ['index', 'date', 'building', 'equipment', 'barcode', 'result', 'notes', 'inspector'];

    const activeOrder = baseOrder.filter(k => !visibleColumns || (visibleColumns as any)[k] !== false);

    const wsData = data.map((item, index) => {
        const row: Record<string, any> = {};
        activeOrder.forEach(colKey => {
            const def = columnMap[colKey];
            if (def) {
                row[def.title] = def.getValue(item, index);
            }
        });
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(wsData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '檢查紀錄');

    worksheet['!cols'] = activeOrder.map(colKey => ({ wch: columnMap[colKey]?.defaultWidth || 15 }));

    XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

export const generateMonthlyReport = (allData: ExportItem[]) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();

    console.log(`[Export Debug] Generating Monthly Report for: ${now.toLocaleDateString()} (Start: ${new Date(startOfMonth).toLocaleString()}, End: ${new Date(endOfMonth).toLocaleString()})`);

    // Debug first few item dates
    if (allData.length > 0) {
        console.log(`[Export Debug] First item date: ${new Date(allData[0].date).toLocaleString()} (${allData[0].date})`);
    }

    const monthlyData = allData.filter(item => {
        return item.date >= startOfMonth && item.date <= endOfMonth;
    });

    console.log(`[Export Debug] Filtered ${monthlyData.length} items for this month out of ${allData.length} total.`);

    if (monthlyData.length === 0) {
        alert('注意：本月尚無資料可供匯出 (No data found for current month)');
        return;
    }

    const fileName = `月度報表_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

    exportToExcel(monthlyData, fileName);
};
