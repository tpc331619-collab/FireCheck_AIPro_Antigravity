import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building2, MapPin, QrCode, Calendar, Search, X, Database, Edit2, Copy, Trash2, Download, CheckCircle, AlertCircle, Image, Globe, CalendarClock } from 'lucide-react';
import { EquipmentDefinition, UserProfile, LightSettings, SystemSettings } from '../types';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';
// import { calculateNextInspectionDate, getInspectionStatus } from '../utils/dateUtils'; // Deprecated for this view
import { getFrequencyStatus, getNextInspectionDate } from '../utils/inspectionUtils';
import QRCode from 'qrcode';

interface MyEquipmentProps {
  user: UserProfile;
  selectedSite: string | null;
  selectedBuilding: string | null;
  onFilterChange: (site: string | null, building: string | null) => void;
  onBack: () => void;
  onEdit: (item: EquipmentDefinition) => void;
  initialQuery?: string;
  systemSettings?: SystemSettings; // Avoiding circular dependency or strict type for now, used for permissions
}

const MyEquipment: React.FC<MyEquipmentProps> = ({
  user,
  selectedSite,
  selectedBuilding,
  onFilterChange,
  onBack,
  onEdit,
  initialQuery,
  systemSettings,
}) => {
  const { t, language } = useLanguage();
  const isAdmin = user.role === 'admin' || user.email?.toLowerCase() === 'b28803078@gmail.com';

  const [fetchedSettings, setFetchedSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    if (!systemSettings) {
      StorageService.getSystemSettings().then(setFetchedSettings);
    }
  }, [systemSettings]);

  const activeSettings = systemSettings || fetchedSettings;

  // Permission Checks
  const canEdit = isAdmin || activeSettings?.allowInspectorEditEquipment !== false;
  const canCopy = isAdmin || activeSettings?.allowInspectorCopyEquipment !== false;
  const canDelete = isAdmin || activeSettings?.allowInspectorDeleteEquipment !== false;
  const canViewBarcode = isAdmin || activeSettings?.allowInspectorShowBarcode !== false;
  const canViewImage = isAdmin || activeSettings?.allowInspectorShowImage !== false;
  const [loading, setLoading] = useState(true);
  const [allEquipment, setAllEquipment] = useState<EquipmentDefinition[]>([]);
  const [lightSettings, setLightSettings] = useState<LightSettings | null>(null);


  // Search State
  const [searchQuery, setSearchQuery] = useState(initialQuery || '');

  // 基礎清單數據
  const [sites, setSites] = useState<string[]>([]);
  const [buildings, setBuildings] = useState<string[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<EquipmentDefinition[]>([]);

  // UI State for QR Popup
  const [viewQr, setViewQr] = useState<{ url: string, name: string, barcode: string } | null>(null);

  // UI State for Photo Popup
  const [viewPhoto, setViewPhoto] = useState<{ url: string, name: string } | null>(null);

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
      const data = await StorageService.getEquipmentDefinitions(user.uid, user.currentOrganizationId);
      setAllEquipment(data);

      const uniqueSites = Array.from(new Set(data.map(item => item.siteName)));
      setSites(uniqueSites);

      // Auto-select first site if none selected
      if (!selectedSite && uniqueSites.length > 0) {
        onFilterChange(uniqueSites[0], null);
      }

      // Load Settings
      const settings = await StorageService.getLightSettings(user.uid, user.currentOrganizationId);
      setLightSettings(settings);
    } catch (error) {
      console.error("Failed to load equipment", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [user.uid, user.currentOrganizationId]);

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
    // Safety check: ensure searchQuery is a string
    const queryStr = typeof searchQuery === 'string' ? searchQuery : '';

    if (queryStr.trim()) {
      const query = queryStr.toLowerCase().trim();
      const filtered = allEquipment.filter(e =>
        e.barcode.toLowerCase().includes(query) ||
        e.name.toLowerCase().includes(query)
      );
      setFilteredEquipment(filtered);
    } else if (selectedSite) {
      const filtered = allEquipment.filter(
        e => e.siteName === selectedSite && (!selectedBuilding || e.buildingName === selectedBuilding)
      );
      setFilteredEquipment(filtered);
    } else {
      setFilteredEquipment([]);
    }

    // Sort by createdAt descending (newest first)
    if (queryStr.trim() || selectedSite) {
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

  const handleShowPhoto = (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    e.stopPropagation();
    const url = item.photoUrl || item.photoURL;
    if (url) {
      setViewPhoto({ url, name: item.name });
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

      // --- Sync Map Markers Fix ---
      // We need to remove any map markers associated with this equipment ID (barcode)
      try {
        const itemToDelete = allEquipment.find(e => e.id === id);
        if (itemToDelete) {
          const barcode = itemToDelete.barcode;
          if (id && user?.uid) {
            const maps = await StorageService.getMaps(user.uid, user.currentOrganizationId);

            const mapsToUpdate = maps.filter(m => m.markers.some(mk => mk.equipmentId === barcode));

            if (mapsToUpdate.length > 0) {
              console.log(`Syncing map markers: Removing equipment ${barcode} from ${mapsToUpdate.length} maps`);
              for (const map of mapsToUpdate) {
                const updatedMarkers = map.markers.filter(mk => mk.equipmentId !== barcode);
                await StorageService.saveMap({ ...map, markers: updatedMarkers }, user.uid, user.currentOrganizationId);
              }
            }
          }
        }
      } catch (mapErr) {
        console.error("Failed to sync delete with maps:", mapErr);
        // Delete was successful, just map sync failed. Non-critical but logged.
      }

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
      createdAt: Date.now(),
      // Fix: Reset inspection status for copied items
      lastInspectedDate: 0,
      checkItems: (item.checkItems || []).map(ci => ({
        ...ci,
      })),
      photoUrl: undefined, // Reset photo for copy
      notificationEmails: undefined, // Reset notification emails for copy
    };

    // Remove undefined fields to prevent Firestore errors
    const cleanItem = Object.fromEntries(
      Object.entries(newItem).filter(([_, v]) => v !== undefined)
    ) as EquipmentDefinition;

    try {
      console.log('[MyEquipment] Copying item:', item.barcode, '-> New:', cleanItem.barcode);
      // Save either creates or updates based on presence of id in handleEditSubmit
      await StorageService.saveEquipmentDefinition(cleanItem, user.uid, user.currentOrganizationId);
      refreshData(true);
      showToast(t('copySuccess'));
    } catch (err) {
      console.error('[MyEquipment] Copy failed:', err);
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
          <button onClick={onBack} className="relative z-50 p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
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
                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                    placeholder={t('searchEquipmentPlaceholder')}
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
              {selectedSite || searchQuery ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {filteredEquipment.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50/50">
                      <p className="text-slate-400 font-medium">此路徑下目前無對應設備</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredEquipment.map((item, index) => {
                        // Logic to determine status color shared with the indicator logic below
                        const status = getFrequencyStatus(item, lightSettings);
                        let borderColorClass = 'border-l-slate-200'; // Fallback

                        if (status === 'COMPLETED') borderColorClass = 'border-l-green-500';
                        else if (status === 'CAN_INSPECT') borderColorClass = 'border-l-blue-500';
                        else if (status === 'PENDING') borderColorClass = 'border-l-red-500';
                        else if (status === 'UNNECESSARY') borderColorClass = 'border-l-slate-300';

                        // Check for custom colors from lightSettings if needed, but standard classes are safer for now unless we do inline styles.
                        // For simplicity and performance, mapping to Tailwind classes is preferred here.

                        return (
                          <div key={item.id} className={`p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-4 group border-l-4 ${borderColorClass} shadow-sm mb-2 rounded-r-xl`}>

                            {/* Main Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="flex-shrink-0 text-slate-400 font-bold text-sm mr-1">
                                  {index + 1}.
                                </span>
                                <h3 className="font-bold text-slate-800 text-lg group-hover:text-red-600 transition-colors truncate">
                                  {item.name}
                                </h3>
                                <span className="px-3 py-1 rounded-full text-sm font-bold font-mono bg-slate-100 text-slate-600">
                                  {item.barcode}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-4 text-xs">
                                <div className="flex items-center text-slate-500" title="新建日期">
                                  <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                  <span>新建: {new Date(item.createdAt || 0).toLocaleDateString(language)}</span>
                                </div>
                                <div className="flex items-center text-slate-500" title="最新檢查日期">
                                  <CalendarClock className="w-3.5 h-3.5 mr-1 text-teal-500" />
                                  <span>最新檢查: {item.lastInspectedDate ? new Date(item.lastInspectedDate).toLocaleDateString(language) : '尚未檢查'}</span>
                                </div>
                                <div className="flex items-center">
                                  {(() => {
                                    // Use shared logic
                                    const nextTs = getNextInspectionDate(item);
                                    // status is already calculated above for the border

                                    let label = '';
                                    let colorClass = '';
                                    let defaultDotColor = '';

                                    // Determine Lable and Default Colors
                                    if (status === 'COMPLETED') {
                                      label = '已檢查';
                                      colorClass = 'bg-green-50 text-green-600 border-green-200';
                                      defaultDotColor = '#22c55e'; // green-500
                                    } else if (status === 'CAN_INSPECT') {
                                      label = '可以檢查';
                                      colorClass = 'bg-blue-50 text-blue-600 border-blue-200';
                                      defaultDotColor = '#3b82f6'; // blue-500
                                    } else if (status === 'PENDING') {
                                      label = '需檢查';
                                      colorClass = 'bg-red-50 text-red-600 border-red-200';
                                      defaultDotColor = '#ef4444'; // red-500
                                    } else if (status === 'UNNECESSARY') {
                                      label = '不須檢查';
                                      colorClass = 'bg-slate-50 text-slate-500 border-slate-200';
                                      defaultDotColor = '#94a3b8'; // slate-400
                                    }

                                    // Check for Custom Colors from Settings
                                    let customColor = '';
                                    if (status === 'COMPLETED' && lightSettings?.completed?.color) customColor = lightSettings.completed.color;
                                    if (status === 'CAN_INSPECT' && lightSettings?.yellow?.color) customColor = lightSettings.yellow.color;
                                    if (status === 'PENDING' && lightSettings?.red?.color) customColor = lightSettings.red.color;
                                    if (status === 'UNNECESSARY' && lightSettings?.green?.color) customColor = lightSettings.green.color;

                                    // Styles
                                    const dotStyle: React.CSSProperties = { backgroundColor: customColor || defaultDotColor };
                                    const textStyle: React.CSSProperties = customColor ? { color: customColor } : {};
                                    const containerStyle: React.CSSProperties = customColor ? {
                                      borderColor: customColor + '40', // 25% opacity
                                      backgroundColor: customColor + '10' // ~6% opacity
                                    } : {};

                                    // Classes
                                    // If custom color is used, we strip the default color classes but keep layout classes
                                    const containerClass = `flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold border ${customColor ? '' : colorClass}`;
                                    // Pulse for pending
                                    const dotClass = `w-2 h-2 rounded-full`;

                                    return (
                                      <div className="flex items-center gap-2">
                                        <div className={containerClass} style={containerStyle}>
                                          <div className={dotClass} style={dotStyle}></div>
                                          <span style={textStyle}>{label}</span>
                                        </div>
                                        <span className="text-slate-400">下一次檢查:</span>
                                        <span className="text-slate-700 font-bold">{nextTs ? new Date(nextTs).toLocaleDateString(language) : '-'}</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 transition-all">
                              {canViewImage && (
                                <button
                                  onClick={(e) => handleShowPhoto(e, item)}
                                  className={`p-1.5 rounded-lg border transition-all ${item.photoUrl || (item as any).photoURL ? 'bg-orange-500 border-orange-600 text-white shadow-sm hover:shadow-md active:scale-95' : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'}`}
                                  title={item.photoUrl || (item as any).photoURL ? '查看照片' : '無照片資料'}
                                  disabled={!(item.photoUrl || (item as any).photoURL)}
                                >
                                  <Image className="w-4 h-4" />
                                </button>
                              )}
                              {canViewBarcode && (
                                <button
                                  onClick={(e) => handleShowQr(e, item)}
                                  className="p-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                                  title={t('viewQr')}
                                >
                                  <QrCode className="w-4 h-4" />
                                </button>
                              )}
                              <div className="w-px h-5 bg-slate-100 mx-1 hidden sm:block"></div>
                              {canEdit && (
                                <button
                                  onClick={(e) => handleEdit(e, item)}
                                  className="p-1.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-lg shadow-sm hover:bg-blue-100 transition-all active:scale-95"
                                  title={t('edit')}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {canCopy && (
                                <button
                                  onClick={(e) => handleCopy(e, item)}
                                  className="p-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-100 transition-all active:scale-95"
                                  title={t('copy')}
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={(e) => handleDeleteClick(e, item)}
                                  className="p-1.5 bg-red-50 border border-red-100 text-red-600 rounded-lg shadow-sm hover:bg-red-100 transition-all active:scale-95"
                                  title={t('delete')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>


                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-24 text-slate-400 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
                  <Search className="w-16 h-16 mx-auto mb-4 opacity-10" />
                  <p className="font-bold text-lg text-slate-400">{t('selectSiteAndBuildingHint')}</p>
                  <p className="text-sm mt-1">{t('selectSiteAndBuildingDesc')}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div >

      {/* Toast Notification (提示視窗) */}
      {
        toastMsg && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className={`${toastMsg.type === 'error' ? 'bg-red-600' : 'bg-slate-800'} text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-white/20 backdrop-blur-md`}>
              {toastMsg.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5 text-green-400" />}
              <span className="font-bold text-sm tracking-wide">{toastMsg.text}</span>
            </div>
          </div>
        )
      }

      {/* QR Code 彈出視窗 */}
      {
        viewQr && (
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
        )
      }

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
      {/* Photo View Modal */}
      {
        viewPhoto && (
          <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative max-w-2xl w-full flex flex-col items-center animate-in zoom-in-95 duration-300">
              <button
                onClick={() => setViewPhoto(null)}
                className="absolute -top-12 right-0 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-8 h-8" />
              </button>

              <div className="bg-white p-2 rounded-3xl shadow-2xl overflow-hidden mb-6 w-full aspect-square sm:aspect-auto sm:min-h-[400px] sm:max-h-[70vh] flex items-center justify-center relative bg-slate-50">
                {/* Fallback & Loading Indicator */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-2">
                  <Image className="w-12 h-12" />
                  <span className="text-xs font-bold text-slate-400">正在努力讀取照片...</span>
                </div>

                <img
                  src={viewPhoto.url}
                  alt={viewPhoto.name}
                  className="relative z-10 max-w-full max-h-full object-contain rounded-2xl shadow-sm"
                  onLoad={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.previousElementSibling) {
                      (target.previousElementSibling as HTMLElement).style.display = 'none';
                    }
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    if (target.previousElementSibling) {
                      const fallback = target.previousElementSibling as HTMLElement;
                      fallback.innerHTML = `<div class="text-center p-8"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-4 text-red-300"><path d="m21 21-18-18"/><path d="M10.45 4.45 12 3l12 12-1.45 1.45"/><path d="M14.91 14.91 21 21"/><path d="M16.5 16.5 12 21 0 9l1.45-1.45"/></svg><p class="text-red-400 font-bold">照片讀取失敗</p><p class="text-slate-400 text-xs mt-1">請確認圖片連結是否有效</p></div>`;
                    }
                  }}
                />
              </div>

              <div className="text-center px-4 mb-6">
                <h3 className="font-bold text-xl text-white mb-1">{viewPhoto.name}</h3>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={() => {
                    window.open(viewPhoto.url, '_blank');
                  }}
                  className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-2 border border-slate-700 hover:bg-slate-700 transition-all active:scale-95"
                >
                  <Globe className="w-5 h-5" /> 在瀏覽器開啟連結
                </button>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = viewPhoto.url;
                    link.download = `Photo_${viewPhoto.name}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="flex-1 py-4 bg-white text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all shadow-xl active:scale-95 border border-transparent"
                >
                  <Download className="w-5 h-5" /> 下載照片
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