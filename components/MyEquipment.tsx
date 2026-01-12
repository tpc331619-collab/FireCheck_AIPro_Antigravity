import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building2, MapPin, QrCode, Calendar, Search, X, Database, Edit2, Copy, Trash2, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { EquipmentDefinition, UserProfile } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';
import { calculateNextInspectionDate, getInspectionStatus } from '../utils/dateUtils';
import QRCode from 'qrcode';

interface MyEquipmentProps {
  user: UserProfile;
  selectedSite: string | null;
  selectedBuilding: string | null;
  onFilterChange: (site: string | null, building: string | null) => void;
  onBack: () => void;
  onEdit: (item: EquipmentDefinition) => void;
}

const MyEquipment: React.FC<MyEquipmentProps> = ({
  user,
  selectedSite,
  selectedBuilding,
  onFilterChange,
  onBack,
  onEdit
}) => {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [allEquipment, setAllEquipment] = useState<EquipmentDefinition[]>([]);


  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // 基礎清單數據
  const [sites, setSites] = useState<string[]>([]);
  const [buildings, setBuildings] = useState<string[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<EquipmentDefinition[]>([]);

  // UI State for QR Popup
  const [viewQr, setViewQr] = useState<{ url: string, name: string, barcode: string } | null>(null);

  // UI State for Delete Confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);

  // UI State for Toast Notification
  const [toastMsg, setToastMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    // 自動消失
    setTimeout(() => setToastMsg(null), 3000);
  };

  const refreshData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await StorageService.getEquipmentDefinitions(user.uid);
      setAllEquipment(data);

      const uniqueSites = Array.from(new Set(data.map(item => item.siteName)));
      setSites(uniqueSites);
    } catch (error) {
      console.error("Failed to load equipment", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [user.uid]);

  // 當數據或篩選 site 改變時，更新可用建築物清單
  useEffect(() => {
    if (selectedSite) {
      const siteBuildings = allEquipment
        .filter(e => e.siteName === selectedSite)
        .map(e => e.buildingName);
      setBuildings(Array.from(new Set(siteBuildings)));
    } else {
      setBuildings([]);
    }
  }, [selectedSite, allEquipment]);

  // 當篩選條件或總表改變時，計算過濾後的列表
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const filtered = allEquipment.filter(e =>
        e.barcode.toLowerCase().includes(query) ||
        e.name.toLowerCase().includes(query)
      );
      setFilteredEquipment(filtered);
    } else if (selectedSite && selectedBuilding) {
      const filtered = allEquipment.filter(
        e => e.siteName === selectedSite && e.buildingName === selectedBuilding
      );
      setFilteredEquipment(filtered);
    } else {
      setFilteredEquipment([]);
    }

    // Sort by createdAt descending (newest first)
    if (searchQuery.trim() || (selectedSite && selectedBuilding)) {
      setFilteredEquipment(prev => [...prev].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }
  }, [selectedSite, selectedBuilding, allEquipment, searchQuery]);


  const handleShowQr = async (e: React.MouseEvent, item: EquipmentDefinition) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const url = await QRCode.toDataURL(item.barcode, { width: 400, margin: 2 });
      setViewQr({ url, name: item.name, barcode: item.barcode });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, item: EquipmentDefinition) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirm({ id: item.id, name: item.name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    const { id } = deleteConfirm;

    // 保存原始狀態以備「真的失敗」時還原
    const originalAll = [...allEquipment];

    // 樂觀 UI 更新
    setAllEquipment(prev => prev.filter(item => item.id !== id));

    // 關閉視窗
    setDeleteConfirm(null);

    try {
      console.log("Deleting item:", id);
      await StorageService.deleteEquipmentDefinition(id);

      refreshData(true);
      showToast(t('dataDeleted') || "資料已刪除", 'success');

    } catch (err: any) {
      console.error("Delete failed:", err);

      setAllEquipment(originalAll); // 還原

      const errorMsg = err.code === 'permission-denied'
        ? "權限不足，無法刪除。"
        : `刪除失敗：${err.message || '未知錯誤'}`;

      showToast(errorMsg, 'error');
    }
  };

  const handleCopy = async (e: React.MouseEvent, item: EquipmentDefinition) => {
    e.preventDefault();
    e.stopPropagation();

    const newItem: EquipmentDefinition = {
      ...item,
      id: Date.now().toString(),
      name: `${item.name}${t('copiedSuffix')}`,
      barcode: `${item.barcode}-COPY`,
      updatedAt: Date.now(),
      createdAt: Date.now()
    };
    try {
      await StorageService.saveEquipmentDefinition(newItem, user.uid);
      refreshData(true);
      showToast(t('copySuccess'));
    } catch (err) {
      showToast('複製失敗', 'error');
    }
  };

  const handleEdit = (e: React.MouseEvent, item: EquipmentDefinition) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit(item);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-bold text-lg text-slate-800">{t('myEquipment')}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-red-600"></div>
            </div>
          ) : allEquipment.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
              <Database className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-700 mb-2">{t('noEquipmentFound')}</h3>
              <p className="text-slate-500">尚未建立任何設備資料</p>
            </div>
          ) : (
            <>
              {/* 篩選控制器 */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 gap-6">
                {/* Search Bar */}
                <div className="mb-6 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="輸入設備編號或名稱搜尋..."
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-red-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <X className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center tracking-wider">
                      <MapPin className="w-3.5 h-3.5 mr-1.5" /> {t('selectSite')}
                    </label>
                    <select
                      value={selectedSite || ''}
                      onChange={(e) => onFilterChange(e.target.value || null, null)}
                      disabled={!!searchQuery}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:border-red-500 focus:outline-none transition-colors disabled:opacity-50"
                    >
                      <option value="">-- {t('all')} --</option>
                      {sites.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center tracking-wider">
                      <Building2 className="w-3.5 h-3.5 mr-1.5" /> {t('selectBuilding')}
                    </label>
                    <select
                      value={selectedBuilding || ''}
                      disabled={!selectedSite || !!searchQuery}
                      onChange={(e) => onFilterChange(selectedSite, e.target.value || null)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:border-red-500 focus:outline-none disabled:opacity-50 transition-colors"
                    >
                      <option value="">-- {t('all')} --</option>
                      {buildings.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* 設備清單 (條列式) */}
              {(selectedSite && selectedBuilding) || searchQuery ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {filteredEquipment.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50/50">
                      <p className="text-slate-400 font-medium">此路徑下目前無對應設備</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredEquipment.map(item => (
                        <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-4 group">

                          {/* Main Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-slate-800 text-lg group-hover:text-red-600 transition-colors truncate">
                                {item.name}
                              </h3>
                              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-500">
                                {item.barcode}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-xs">
                              <div className="flex items-center text-slate-500" title="新建日期">
                                <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                <span>新建: {new Date(item.createdAt || 0).toLocaleDateString(language)}</span>
                              </div>
                              <div className="flex items-center">
                                {(() => {
                                  const next = calculateNextInspectionDate(item.checkStartDate || 0, item.checkFrequency || '', item.lastInspectedDate);
                                  const status = getInspectionStatus(next);
                                  return (
                                    <div className="flex items-center gap-2">
                                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold border ${status.light === 'RED' ? 'bg-red-50 text-red-600 border-red-200' :
                                          status.light === 'YELLOW' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                            'bg-emerald-50 text-emerald-600 border-emerald-200'
                                        }`}>
                                        <div className={`w-2 h-2 rounded-full ${status.light === 'RED' ? 'bg-red-500 animate-pulse' :
                                            status.light === 'YELLOW' ? 'bg-amber-500' :
                                              'bg-emerald-500'
                                          }`}></div>
                                        {status.label}
                                      </div>
                                      <span className="text-slate-400">下一次檢查:</span>
                                      <span className="text-slate-700 font-bold">{next ? next.toLocaleDateString(language) : '-'}</span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleEdit(e, item)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title={t('edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleCopy(e, item)}
                              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                              title={t('copy')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleShowQr(e, item)}
                              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                              title={t('viewQr')}
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(e, item)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Mobile Actions (Always visible on mobile) */}
                          <div className="flex sm:hidden border-t border-slate-100 pt-3 mt-1 gap-2">
                            <button onClick={(e) => handleEdit(e, item)} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold center flex justify-center"><Edit2 className="w-3.5 h-3.5 mr-1" />編輯</button>
                            <button onClick={(e) => handleDeleteClick(e, item)} className="flex-1 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold center flex justify-center"><Trash2 className="w-3.5 h-3.5 mr-1" />刪除</button>
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-24 text-slate-400 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
                  <Search className="w-16 h-16 mx-auto mb-4 opacity-10" />
                  <p className="font-bold text-lg text-slate-400">請先選擇場所與建築物</p>
                  <p className="text-sm mt-1">系統將根據篩選條件為您列出對應設備清單</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast Notification (提示視窗) */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`${toastMsg.type === 'error' ? 'bg-red-600' : 'bg-slate-800'} text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-white/20 backdrop-blur-md`}>
            {toastMsg.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5 text-green-400" />}
            <span className="font-bold text-sm tracking-wide">{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* QR Code 彈出視窗 */}
      {viewQr && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setViewQr(null)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>

            <div className="text-center mb-6">
              <h3 className="font-bold text-xl text-slate-800">{viewQr.name}</h3>
              <p className="text-sm text-slate-400 font-mono mt-1 tracking-widest">{viewQr.barcode}</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border-8 border-slate-50 shadow-inner mb-8">
              <img src={viewQr.url} alt="QR Code" className="w-48 h-48" />
            </div>

            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = viewQr.url;
                link.download = `QR_${viewQr.barcode}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl active:scale-95"
            >
              <Download className="w-5 h-5" /> {t('downloadQrCode')}
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {
        deleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center relative animate-in zoom-in-95 duration-200 border-2 border-red-100">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-500">
                <Trash2 className="w-8 h-8" />
              </div>

              <h3 className="font-bold text-xl text-slate-800 mb-2">刪除設備</h3>
              <p className="text-slate-500 text-center text-sm mb-6">
                確定要刪除 <span className="font-bold text-slate-800">{deleteConfirm.name}</span> 嗎？
              </p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-200"
                >
                  我確定
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default MyEquipment;