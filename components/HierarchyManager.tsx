
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Save, FolderTree, ChevronRight, AlertCircle, CheckCircle, Pencil, RefreshCw } from 'lucide-react';
import { EquipmentHierarchy, UserProfile, SystemSettings } from '../types';
import { StorageService } from '../services/storageService';
import { EQUIPMENT_HIERARCHY } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';

interface HierarchyManagerProps {
    user: UserProfile;
    onBack: () => void;
}

const HierarchyManager: React.FC<HierarchyManagerProps> = ({ user, onBack }) => {
    const { t } = useLanguage();
    const [hierarchy, setHierarchy] = useState<EquipmentHierarchy>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

    const isAdmin = user.role === 'admin' || user.email?.toLowerCase() === 'b28803078@gmail.com';

    // Permission Checks
    const canEditCategory = isAdmin || systemSettings?.allowInspectorEditHierarchy !== false;
    const canDeleteCategory = isAdmin || systemSettings?.allowInspectorDeleteHierarchy !== false;
    const canReset = isAdmin || systemSettings?.allowInspectorResetHierarchy !== false;

    // Type/MainClass Permissions
    const canEditType = isAdmin || systemSettings?.allowInspectorEditHierarchy !== false;
    const canDeleteType = isAdmin || systemSettings?.allowInspectorDeleteHierarchy !== false;

    // Selection state
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);

    // Input state
    const [newCategory, setNewCategory] = useState('');
    const [newType, setNewType] = useState('');
    const [newDetail, setNewDetail] = useState('');

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMsg({ text, type });
        setTimeout(() => setToastMsg(null), 3000);
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const data = await StorageService.getEquipmentHierarchy(user.uid, user.currentOrganizationId);
                if (data) {
                    setHierarchy(data);
                } else {
                    // Seed from constants, but remove '自定義'
                    const seed: EquipmentHierarchy = {};
                    Object.entries(EQUIPMENT_HIERARCHY).forEach(([cat, types]) => {
                        if (cat === '自定義') return;
                        // types is string[] (list of types)
                        // Filter '自定義' from types array
                        const validTypes = Array.isArray(types) ? types.filter(t => t !== '自定義') : [];
                        seed[cat] = validTypes;
                    });
                    setHierarchy(seed);
                }

                // Load Settings
                const settings = await StorageService.getSystemSettings();
                setSystemSettings(settings);
            } catch (err) {
                console.error(err);
                showToast(t('loadFailed') || 'Load Failed', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [user.uid, user.currentOrganizationId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await StorageService.saveEquipmentHierarchy(hierarchy, user.uid, user.currentOrganizationId);
            showToast(t('saveSuccess'), 'success');
        } catch (err) {
            console.error(err);
            showToast(t('saveFailed') || 'Save Failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    // --- Category Actions ---
    const addCategory = () => {
        if (!newCategory.trim()) return;
        if (hierarchy[newCategory.trim()]) {
            showToast(t('categoryExists'), 'error');
            return;
        }
        setHierarchy(prev => ({ ...prev, [newCategory.trim()]: [] }));
        setNewCategory('');
        showToast(t('saveSuccess'), 'success');
    };

    const deleteCategory = (cat: string) => {
        if (confirm(`${t('confirmDeleteCategory')} "${cat}"?`)) {
            const newHierarchy = { ...hierarchy };
            delete newHierarchy[cat];
            setHierarchy(newHierarchy);
            showToast('刪除分類成功', 'success');
            if (selectedCategory === cat) {
                setSelectedCategory(null);
                setSelectedType(null);
            }
        }
    };

    const editCategory = (oldCat: string) => {
        const newCat = prompt('請輸入新的分類名稱', oldCat);
        if (!newCat || newCat === oldCat) return;
        if (hierarchy[newCat.trim()]) {
            showToast('分類名稱已存在', 'error');
            return;
        }
        const newHierarchy: EquipmentHierarchy = {};
        Object.keys(hierarchy).forEach(key => {
            if (key === oldCat) {
                newHierarchy[newCat.trim()] = hierarchy[oldCat];
            } else {
                newHierarchy[key] = hierarchy[key];
            }
        });
        setHierarchy(newHierarchy);
        if (selectedCategory === oldCat) setSelectedCategory(newCat.trim());
        showToast('修改分類成功', 'success');
    };

    // --- Type Actions ---
    const addType = () => {
        if (!selectedCategory || !newType.trim()) return;
        if (hierarchy[selectedCategory].includes(newType.trim())) {
            showToast('設備種類已存在', 'error');
            return;
        }
        setHierarchy(prev => ({
            ...prev,
            [selectedCategory]: [...prev[selectedCategory], newType.trim()]
        }));
        setNewType('');
        showToast('新增種類成功', 'success');
    };

    const editType = (oldType: string) => {
        if (!selectedCategory) return;
        const newType = prompt('請輸入新的種類名稱', oldType);
        if (!newType || newType === oldType) return;
        if (hierarchy[selectedCategory].includes(newType.trim())) {
            showToast('種類名稱已存在', 'error');
            return;
        }
        setHierarchy(prev => {
            const currentTypes = prev[selectedCategory];
            const newTypes = currentTypes.map(t => t === oldType ? newType.trim() : t);
            return { ...prev, [selectedCategory]: newTypes };
        });
        if (selectedType === oldType) setSelectedType(newType.trim());
        showToast('修改種類成功', 'success');
    };

    const deleteType = (type: string) => {
        if (!selectedCategory) return;
        if (confirm(`確定要刪除「${type}」嗎？`)) {
            setHierarchy(prev => ({
                ...prev,
                [selectedCategory]: prev[selectedCategory].filter(t => t !== type)
            }));
            showToast('刪除種類成功', 'success');
            if (selectedType === type) setSelectedType(null);
        }
    };

    // --- Detail Actions ---
    const addDetail = () => {
        if (!selectedCategory || !selectedType || !newDetail.trim()) return;
        const currentDetails = hierarchy[selectedCategory][selectedType];
        if (currentDetails.includes(newDetail.trim())) {
            showToast('細項已存在', 'error');
            return;
        }
        setHierarchy(prev => ({
            ...prev,
            [selectedCategory]: {
                ...prev[selectedCategory],
                [selectedType]: [...currentDetails, newDetail.trim()]
            }
        }));
        setNewDetail('');
        showToast('新增細項成功', 'success');
    };

    const deleteDetail = (detail: string) => {
        if (!selectedCategory || !selectedType) return;
        setHierarchy(prev => ({
            ...prev,
            [selectedCategory]: {
                ...prev[selectedCategory],
                [selectedType]: prev[selectedCategory][selectedType].filter(d => d !== detail)
            }
        }));
        showToast('刪除細項成功', 'success');
    };

    const editDetail = (oldDetail: string) => {
        if (!selectedCategory || !selectedType) return;
        const newDetail = prompt('請輸入新的細項名稱', oldDetail);
        if (!newDetail || newDetail === oldDetail) return;
        const currentDetails = hierarchy[selectedCategory][selectedType];
        if (currentDetails.includes(newDetail.trim())) {
            showToast('細項名稱已存在', 'error');
            return;
        }
        setHierarchy(prev => ({
            ...prev,
            [selectedCategory]: {
                ...prev[selectedCategory],
                [selectedType]: prev[selectedCategory][selectedType].map(d => d === oldDetail ? newDetail.trim() : d)
            }
        }));
        showToast('修改細項成功', 'success');
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <h1 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            <FolderTree className="w-5 h-5 text-slate-500" />
                            {t('equipmentNameManager')}
                        </h1>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-black transition-colors disabled:opacity-50"
                    >
                        {saving ? t('saving') : <><Save className="w-4 h-4" /> {t('saveChanges')}</>}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto md:overflow-hidden p-4 sm:p-6">
                <div className="max-w-7xl mx-auto h-auto md:h-full grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Column 1: Category */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px] md:h-full overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="font-bold text-slate-700 mb-2">1. {t('category')}</h3>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newCategory}
                                    onChange={e => setNewCategory(e.target.value)}
                                    placeholder={t('addCategory') + "..."}
                                    className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-red-500"
                                />
                                <button onClick={addCategory} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Plus className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {/* Reset Button */}
                            {canReset && (
                                <div className="px-2 pt-2 pb-1">
                                    <button
                                        onClick={() => {
                                            if (confirm('確定要回復成預設清單嗎？\n\n警告：目前所有自訂的分類與種類都將被清除，並還原為系統預設值。')) {
                                                const seed: EquipmentHierarchy = {};
                                                Object.entries(EQUIPMENT_HIERARCHY).forEach(([cat, types]) => {
                                                    if (cat === '自定義') return;
                                                    const validTypes = Array.isArray(types) ? types.filter(t => t !== '自定義') : [];
                                                    seed[cat] = validTypes;
                                                });
                                                setHierarchy(seed);
                                                StorageService.saveEquipmentHierarchy(seed, user.uid, user.currentOrganizationId)
                                                    .then(() => showToast('已回復預設清單', 'success'))
                                                    .catch(() => showToast('重置失敗', 'error'));
                                            }
                                        }}
                                        className="w-full py-2 text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 border border-dashed border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-1"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        {t('resetDefaults') || '重置為預設值'}
                                    </button>
                                </div>
                            )}

                            {loading ? <div className="p-4 text-center text-slate-400 text-sm">載入中...</div> :
                                Object.keys(hierarchy).map(cat => (
                                    <div
                                        key={cat}
                                        onClick={() => { setSelectedCategory(cat); setSelectedType(null); }}
                                        className={`flex items-center justify-between p-4 mb-2 rounded-xl cursor-pointer transition-colors border ${selectedCategory === cat ? 'bg-red-50 text-red-700 border-red-200 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}
                                    >
                                        <span className="font-bold text-base">{cat}</span>
                                        <div className="flex items-center gap-2">
                                            {selectedCategory === cat && <ChevronRight className="w-5 h-5 text-red-400" />}
                                            {canEditCategory && <button onClick={(e) => { e.stopPropagation(); editCategory(cat); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>}
                                            {canDeleteCategory && <button onClick={(e) => { e.stopPropagation(); deleteCategory(cat); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    {/* Column 2: Type */}
                    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px] md:h-full overflow-hidden transition-opacity ${!selectedCategory ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="font-bold text-slate-700 mb-2">2. {t('type')}</h3>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newType}
                                    onChange={e => setNewType(e.target.value)}
                                    placeholder={selectedCategory ? `${t('addType')}...` : t('selectCategoryFirst')}
                                    className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-red-500"
                                />
                                <button onClick={addType} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Plus className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {selectedCategory && hierarchy[selectedCategory] && hierarchy[selectedCategory].map(type => (
                                <div
                                    key={type}
                                    className={`flex items-center justify-between p-4 mb-2 rounded-xl border bg-white border-transparent hover:bg-slate-50 text-slate-700`}
                                >
                                    <span className="font-bold text-base">{type}</span>
                                    <div className="flex items-center gap-2">
                                        {canEditType && <button onClick={() => editType(type)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>}
                                        {canDeleteType && <button onClick={() => deleteType(type)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                                    </div>
                                </div>
                            ))}
                            {!selectedCategory && <div className="p-10 text-center text-slate-300">{t('selectLeftCategory')}</div>}
                        </div>
                    </div>

                </div>
            </div>

            {/* Toast */}
            {toastMsg && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className={`${toastMsg.type === 'error' ? 'bg-red-600' : 'bg-slate-800'} text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-white/20 backdrop-blur-md`}>
                        {toastMsg.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5 text-green-400" />}
                        <span className="font-bold text-sm tracking-wide">{toastMsg.text}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HierarchyManager;
