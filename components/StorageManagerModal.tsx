import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, FileText, Check, AlertTriangle, RefreshCcw } from 'lucide-react';
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
    onSelect?: (file: StorageFile) => void;
}

const StorageManagerModal: React.FC<StorageManagerModalProps> = ({ user, isOpen, onClose, onSelect }) => {
    const [files, setFiles] = useState<StorageFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check for duplicates
        // Filename format: timestamp_filename.ext
        // We match if the END of any existing file matches "_filename.ext" or exact match
        const duplicateFiles = files.filter(f => {
            // Try to extract original name from storage file
            const match = f.name.match(/^\d+_(.+)$/);
            const originalName = match ? match[1] : f.name;
            return originalName === file.name;
        });

        if (duplicateFiles.length > 0) {
            if (!window.confirm(`檔案 "${file.name}" 已存在於雲端圖庫中（名稱重複）。\n是否要覆蓋舊檔案？（舊檔案將被刪除）`)) {
                // Clear input
                e.target.value = '';
                return;
            }

            // Delete old files
            setUploading(true); // Start loading state
            try {
                for (const dup of duplicateFiles) {
                    await StorageService.deleteStorageFile(dup.fullPath);
                }
            } catch (error) {
                console.error("Failed to delete old files", error);
                alert("刪除舊檔案失敗，無法覆蓋");
                setUploading(false);
                e.target.value = '';
                return;
            }
        }

        setUploading(true);
        try {
            await StorageService.uploadMapImage(file, user.uid);
            alert("上傳成功！");
            loadFiles();
        } catch (error) {
            console.error(error);
            alert("上傳失敗");
        } finally {
            setUploading(false);
            e.target.value = ''; // Clear input to allow re-upload same file if needed
        }
    };

    const handleDelete = async (file: StorageFile) => {
        if (!window.confirm(`確定要刪除 ${file.name} 嗎？此操作無法復原。`)) return;

        try {
            await StorageService.deleteStorageFile(file.fullPath);
            setFiles(files.filter(f => f.fullPath !== file.fullPath));
        } catch (error) {
            console.error(error);
            alert("刪除失敗");
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
        return new Date(dateString).toLocaleString('zh-TW');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-xl text-slate-800 flex items-center">
                            <FileText className="w-6 h-6 mr-2 text-blue-600" />
                            雲端圖庫管理
                        </h3>

                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-6 h-6 text-slate-500" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                    <button
                        onClick={loadFiles}
                        className="flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                        disabled={loading}
                    >
                        <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        重新整理
                    </button>

                    <label className={`flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-lg shadow-blue-200 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Upload className="w-4 h-4 mr-2" />
                        {uploading ? '上傳中...' : '上傳新圖片'}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={uploading}
                        />
                    </label>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-y-auto p-0 bg-slate-50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                            <p>Loading files...</p>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <FileText className="w-16 h-16 mb-4 opacity-20" />
                            <p>目前沒有任何檔案</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-20">預覽</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">檔案名稱</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">大小</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">上傳時間</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {files.map((file) => (
                                    <tr key={file.fullPath} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-3">
                                            <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:scale-110 transition-transform" onClick={() => window.open(file.url, '_blank')}>
                                                <img src={file.url} alt="thumbnail" className="w-full h-full object-cover" />
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <p className="font-bold text-slate-700 text-sm truncate max-w-[200px]" title={file.name}>{file.name}</p>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-600 font-mono">
                                            {formatBytes(file.size)}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-600">
                                            {formatDate(file.timeCreated)}
                                        </td>
                                        <td className="px-6 py-3 text-right flex items-center justify-end gap-2">
                                            {onSelect && (
                                                <button
                                                    onClick={() => onSelect(file)}
                                                    className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all font-bold text-xs flex items-center shrink-0"
                                                    title="使用此圖片"
                                                >
                                                    <Check className="w-4 h-4 mr-1" />
                                                    選擇
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(file)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                title="刪除檔案"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer Info */}
                <div className="p-4 border-t border-slate-200 bg-white text-xs text-slate-400 flex justify-between">
                    <span>總檔案數: {files.length}</span>
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 刪除原始檔案將導致相關聯的位置圖無法顯示</span>
                </div>
            </div>
        </div>
    );
};

export default StorageManagerModal;
