import * as XLSX from 'xlsx';

// Font support for Chinese in PDF is limited without loading a custom font.
// For now, we will use a basic setup. In a real production app, we would load a .ttf file.
// We prioritize Excel for full data fidelity with CJK characters.

interface ExportItem {
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

export const exportToExcel = (data: ExportItem[], fileName: string) => {
    const wsData = data.map((item, index) => ({
        '序號': index + 1,
        '檢查日期': formatDate(item.date),
        '建築物': item.buildingName || '',
        '設備名稱': item.name,
        '條碼編號': item.barcode,
        '檢查結果': formatStatus(item.status),
        '備註': item.notes || '',
        '檢查人員': item.inspectorName || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(wsData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inspection History");

    // Auto-width for columns
    const wscols = [
        { wch: 6 },  // Index
        { wch: 12 }, // Date
        { wch: 15 }, // Building
        { wch: 20 }, // Equipment
        { wch: 15 }, // Barcode
        { wch: 10 }, // Status
        { wch: 30 }, // Notes
        { wch: 12 }, // Inspector
    ];
    worksheet['!cols'] = wscols;

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

    const fileName = `Monthly_Report_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

    exportToExcel(monthlyData, fileName);
};
