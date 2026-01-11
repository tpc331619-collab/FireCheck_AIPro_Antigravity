import React, { useState } from 'react';
import { Newspaper, ChevronRight, ExternalLink, Scale, AlertCircle, FileText, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';

interface NewsItem {
    id: string;
    date: string;
    title: string;
    category: 'Law' | 'Standard' | 'Announcement';
    url?: string;
    summary: string;
}

const NEWS_DATA: NewsItem[] = [
    {
        id: '1',
        date: '2025-01-05',
        title: '預告修正「各類場所消防安全設備設置標準」',
        category: 'Announcement',
        summary: '內政部預告修正草案，針對鋰電池儲能系統之自動撒水設備、防火區劃及相關防護措施增設專章，提升儲能設施安全性。',
        url: 'https://law.nfa.gov.tw/'
    },
    {
        id: '2',
        date: '2024-11-20',
        title: '立法院三讀通過「消防法」部分條文修正案',
        category: 'Law',
        summary: '大幅提高工廠管理權人未落實消防計畫之罰則，若致人死傷最高可處 7 年有期徒刑；增訂吹哨者條款，鼓勵檢舉不法。',
        url: 'https://law.nfa.gov.tw/'
    },
    {
        id: '3',
        date: '2024-09-15',
        title: '發布「電動車充電樁消防安全指引」',
        category: 'Standard',
        summary: '針對社區大樓與公共場所設置電動車充電樁，明訂滅火毯配置數量、緊急斷電程序及防火區劃要求。',
    },
    {
        id: '4',
        date: '2024-06-01',
        title: '強化長照機構防火避難設施檢修申報作業',
        category: 'Announcement',
        summary: '配合長照服務法，明確規範住宿式長照機構之申報期限與檢修項目，並要求定期執行避難演練。',
    },
    {
        id: '5',
        date: '2024-03-05',
        title: '各類場所消防安全設備設置標準部分條文修正',
        category: 'Standard',
        summary: '針對長照機構及老人福利機構，增設水道連結型自動撒水設備之規定，以強化弱勢避難者場所之安全。',
    }
];

const NewsCard: React.FC<{ item: NewsItem; isExpanded: boolean; onToggle: () => void }> = ({ item, isExpanded, onToggle }) => {
    const getIcon = () => {
        switch (item.category) {
            case 'Law': return <Scale className="w-4 h-4 text-purple-500" />;
            case 'Standard': return <FileText className="w-4 h-4 text-blue-500" />;
            case 'Announcement': return <AlertCircle className="w-4 h-4 text-orange-500" />;
        }
    };

    const getBadgeStyle = () => {
        switch (item.category) {
            case 'Law': return 'bg-purple-50 text-purple-700 border-purple-100';
            case 'Standard': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'Announcement': return 'bg-orange-50 text-orange-700 border-orange-100';
        }
    };

    const getCategoryName = () => {
        switch (item.category) {
            case 'Law': return '法令';
            case 'Standard': return '標準';
            case 'Announcement': return '公告';
        }
    };

    return (
        <div
            onClick={onToggle}
            className={`group p-4 bg-white rounded-xl border transition-all cursor-pointer relative overflow-hidden ${isExpanded ? 'border-red-200 shadow-md ring-1 ring-red-50' : 'border-slate-100 hover:border-red-100 hover:shadow-md'}`}
        >
            <div className="flex items-start justify-between mb-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${getBadgeStyle()}`}>
                    {getIcon()}
                    <span className="ml-1.5">{getCategoryName()}</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">{item.date}</span>
                <div className={`text-slate-300 transition-transform duration-300 ml-auto pl-2 ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-4 h-4" />
                </div>
            </div>

            <h4 className={`text-slate-800 font-bold text-sm mb-2 transition-colors ${isExpanded || 'group-hover:text-red-700'} ${isExpanded ? '' : 'line-clamp-2'}`}>
                {item.title}
            </h4>

            <div className={`text-xs text-slate-600 leading-relaxed transition-all duration-300 ${isExpanded ? 'opacity-100' : 'opacity-80 line-clamp-2'}`}>
                {item.summary}
            </div>

            {isExpanded && item.url && (
                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end animate-in fade-in slide-in-from-top-2 duration-200">
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                    >
                        前往連結 <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                </div>
            )}
        </div>
    );
};

export const RegulationFeed: React.FC = () => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleToggle = (id: string) => {
        setExpandedId(current => current === id ? null : id);
    };

    const handleCheckUpdate = () => {
        setIsRefreshing(true);
        // Simulate network check
        setTimeout(() => {
            setIsRefreshing(false);
            const confirmed = window.confirm("系統資料庫目前已是最新版本。\n\n是否前往「內政部消防署」官方網頁查看即時公告？");
            if (confirmed) {
                window.open("https://law.nfa.gov.tw/", "_blank");
            }
        }, 1000);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                    <Newspaper className="w-6 h-6 mr-2 text-slate-500" />
                    最新法規異動
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCheckUpdate}
                        disabled={isRefreshing}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center transition-colors px-2 py-1 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                        title="檢查更新"
                    >
                        <RotateCw className={`w-3.5 h-3.5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                        {isRefreshing ? '檢查中...' : '檢查更新'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {NEWS_DATA.map(item => (
                    <NewsCard
                        key={item.id}
                        item={item}
                        isExpanded={expandedId === item.id}
                        onToggle={() => handleToggle(item.id)}
                    />
                ))}
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 flex items-start">
                <AlertCircle className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                <span>
                    本資訊僅供參考，最新法規請以 <a href="https://law.nfa.gov.tw/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">消防署法規查詢系統</a> 為準。
                </span>
            </div>
        </div>
    );
};
