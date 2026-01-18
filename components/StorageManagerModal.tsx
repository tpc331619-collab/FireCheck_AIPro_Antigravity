import React, { useState, useEffect } from 'react';
import { X, Trash2, FileText, Check, AlertTriangle, RefreshCcw, Image as ImageIcon, Calendar, HardDrive, Search, Filter, Upload } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { UserProfile } from '../types';

export interface StorageFile {
    name: string;
    fullPath: string;
    size: number;
    timeCreated: string;
    url: string;
}

interface StorageManagerModalProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
    onSelect?: (file: StorageFile) => Promise<void> | void;
    allowUpload?: boolean;
    allowDelete?: boolean;
}

const StorageManagerModal: React.FC<StorageManagerModalProps> = ({
    user,
    isOpen,
    onClose,
    onSelect,
    allowUpload = true,
    allowDelete = true
}) => {
    const [files, setFiles] = useState<StorageFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selectingId, setSelectingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadFiles();
        }
    }, [isOpen]);

    const loadFiles = async () => {
        setLoading(true);
        try {
            const data = await StorageService.getStorageFiles(user.uid);
            // Sort by time created desc
            data.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());
            setFiles(data);
        } catch (error) {
            console.error("Failed to load files", error);
            alert("讀取檔案列表失敗");
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset input value to allow selecting same file again
        event.target.value = '';

        if (file.size > 1024 * 1024) {
            alert("檔案大小超過 1MB 限制");
            return;
        }

        if (!file.type.startsWith('image/')) {
            alert("請選擇圖片檔案");
            return;
        }

        setLoading(true);
        try {
            await StorageService.uploadMapImage(file, user.uid);
            await loadFiles();
        } catch (error: any) {
            console.error(error);
            alert("上傳失敗: " + (error.message || '未知錯誤'));
            setLoading(false);
        }
    };

    const handleDelete = async (file: StorageFile, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`確定要刪除 ${file.name} 嗎？此操作無法復原。`)) return;

        setDeletingId(file.fullPath);
        try {
            await StorageService.deleteStorageFile(file.fullPath);
            setFiles(files.filter(f => f.fullPath !== file.fullPath));
        } catch (error: any) {
            console.error(error);
            alert("刪除失敗: " + (error.message || '未知錯誤'));
        } finally {
            setDeletingId(null);
        }
    };

    const handleSelect = async (file: StorageFile) => {
        if (!onSelect) return;
        setSelectingId(file.fullPath);
        try {
            await onSelect(file);
        } catch (error) {
            console.error("Selection failed", error);
        } finally {
            setSelectingId(null);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('zh-TW');
    };

    const filteredFiles = files.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 z-[90] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-white/20 ring-1 ring-black/5">

                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileUpload}
                />

                {/* Header with Professional Gradient */}
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
                    <div>
                        <h3 className="font-bold text-xl text-slate-800 flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                <ImageIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <span>雲端圖庫管理</span>
                                <span className="block text-xs text-slate-400 font-medium mt-0.5">Cloud Storage Manager</span>
                            </div>
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors group">
                        <X className="w-6 h-6 text-slate-400 group-hover:text-slate-600" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="px-6 py-4 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 backdrop-blur-sm sticky top-0 z-20">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="搜尋檔案名稱..."
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:font-medium"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2">
                            <HardDrive className="w-3 h-3" />
                            {files.length} 個檔案
                        </div>
                        {allowUpload && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 shadow-blue-200"
                                disabled={loading}
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                上傳圖片
                            </button>
                        )}
                        <button
                            onClick={loadFiles}
                            className="flex items-center px-3 py-2 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-xl font-bold text-sm transition-all shadow-sm active:scale-95"
                            disabled={loading}
                        >
                            <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            重新整理
                        </button>
                    </div>
                </div>

                {/* File List - Responsive List Layout */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                            <p className="font-bold">正在讀取雲端檔案...</p>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                                <Search className="w-8 h-8 opacity-20" />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-lg">沒有找到相關檔案</p>
                                <p className="text-sm opacity-60">試著更換關鍵字或上傳新圖片</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredFiles.map((file) => {
                                const displayName = file.name.replace(/^\d+_(.+)$/, '$1'); // clean timestamp
                                const isSelecting = selectingId === file.fullPath;
                                const isDeleting = deletingId === file.fullPath;

                                return (
                                    <div
                                        key={file.fullPath}
                                        onClick={() => handleSelect(file)}
                                        className={`group flex items-center gap-4 p-3 bg-white rounded-2xl border transition-all duration-200 cursor-pointer
                                            ${isSelecting ? 'border-blue-500 shadow-md ring-1 ring-blue-500 bg-blue-50/50' : 'border-slate-100 hover:border-blue-200 hover:shadow-md'}
                                        `}
                                    >
                                        {/* Thumbnail Area - Smaller & Fixed Size */}
                                        <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 bg-slate-100 rounded-xl overflow-hidden border border-slate-100 relative group-hover:scale-105 transition-transform duration-300">
                                            {/* Loading Skeleton */}
                                            <div className="absolute inset-0 bg-slate-200 z-0" />
                                            <img
                                                src={file.url}
                                                alt="preview"
                                                className="w-full h-full object-cover relative z-10"
                                                loading="lazy"
                                            />
                                        </div>

                                        {/* Content Area */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                                            <h4 className={`font-bold text-sm sm:text-base truncate transition-colors ${isSelecting ? 'text-blue-700' : 'text-slate-700 group-hover:text-blue-600'}`} title={displayName}>
                                                {displayName}
                                            </h4>

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-medium">
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-md">
                                                    <HardDrive className="w-3 h-3" />
                                                    {formatBytes(file.size)}
                                                </div>
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-md">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatDate(file.timeCreated)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 pl-2">
                                            {/* Delete Button */}
                                            {allowDelete && (
                                                <button
                                                    onClick={(e) => handleDelete(file, e)}
                                                    className="p-2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                                                    disabled={isDeleting || isSelecting}
                                                    title="刪除"
                                                >
                                                    {isDeleting ? (
                                                        <RefreshCcw className="w-5 h-5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-5 h-5" />
                                                    )}
                                                </button>
                                            )}

                                            {/* Select Button */}
                                            {onSelect && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSelect(file); }}
                                                    className={`px-4 py-2 h-10 flex items-center gap-2 rounded-xl font-bold text-sm shadow-sm transition-all
                                                        ${isSelecting
                                                            ? 'bg-blue-600 text-white shadow-blue-200'
                                                            : 'bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50'}
                                                    `}
                                                    title="選擇"
                                                >
                                                    {isSelecting ? (
                                                        <RefreshCcw className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Check className="w-4 h-4" />
                                                    )}
                                                    <span className="hidden sm:inline">選擇</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400 flex justify-between items-center font-bold">
                    <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        請謹慎管理檔案，刪除後將無法復原
                    </span>
                    {/* Removed branding as requested */}
                </div>
            </div>
        </div>
    );
};

export default StorageManagerModal;
