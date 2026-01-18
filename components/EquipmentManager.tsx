import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Eye, Gauge, ClipboardCheck, LayoutList, Download, QrCode, CalendarClock, Calendar, CheckCircle, Bell, Mail, ChevronDown, ChevronUp, Image as ImageIcon, Upload, Database, AlertTriangle } from 'lucide-react';
import { THEME_COLORS, EQUIPMENT_HIERARCHY } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { EquipmentDefinition, CheckCategory, CheckInputType, CustomCheckItem, UserProfile, EquipmentHierarchy } from '../types';

const COMMON_UNITS = ['MPa', 'kgf/cm²', 'psi', 'bar', 'V', 'A', 'mA', 'kW', 'Hz', '°C', 'sec', 'min', 'm', 'cm', 'mm', 'kg', '%', 'ppm'];
import { StorageService } from '../services/storageService';
import { calculateNextInspectionDate, calculateExpiryDate } from '../utils/dateUtils';
import QRCode from 'qrcode';

interface EquipmentManagerProps {
  user: UserProfile;
  initialData?: EquipmentDefinition | null;
  onBack: () => void;
  onSaved?: () => void;
}

const EquipmentManager: React.FC<EquipmentManagerProps> = ({ user, initialData, onBack, onSaved }) => {
  const { t } = useLanguage();
  const [siteName, setSiteName] = useState(initialData?.siteName || '');
  const [buildingName, setBuildingName] = useState(initialData?.buildingName || '');
  const [name, setName] = useState(initialData?.name || '');
  const [barcode, setBarcode] = useState(initialData?.barcode || '');
  const [frequency, setFrequency] = useState(initialData?.checkFrequency || 'monthly');
  const [customFrequency, setCustomFrequency] = useState(initialData?.customFrequency || '');
  const [startDate, setStartDate] = useState(initialData?.checkStartDate ? new Date(initialData.checkStartDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [lifespan, setLifespan] = useState(initialData?.lifespan || '');
  const [customLifespan, setCustomLifespan] = useState(initialData?.customLifespan || '');
  const [checkItems, setCheckItems] = useState<CustomCheckItem[]>(initialData?.checkItems || []);
  const [photoUrl, setPhotoUrl] = useState(initialData?.photoUrl || '');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [eqCategory, setEqCategory] = useState(initialData?.equipmentCategory || '');
  const [eqType, setEqType] = useState(initialData?.equipmentType || '');
  const [eqDetail, setEqDetail] = useState(initialData?.equipmentDetail || '');
  const [hierarchy, setHierarchy] = useState<EquipmentHierarchy>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<CheckCategory>>(new Set());

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState<{
    siteName?: boolean;
    buildingName?: boolean;
    name?: boolean;
    barcode?: boolean;
    checkItems?: boolean;
  }>({});

  const [qrCodeUrl, setQrCodeUrl] = useState('');

  // Load Hierarchy on Mount
  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const data = await StorageService.getEquipmentHierarchy(user.uid);
        if (data) {
          setHierarchy(data);
        } else {
          // Seed from constants if empty (filtering out Custom if desired, or just use as is but ignore '自定義' keys logic if new logic replaces it)
          // Ideally we replicate the logic from HierarchyManager or just use constants directly but sanitized.
          // For simplicity and consistency, let's replicate the seed logic or just use constants but prefer user data.
          // If we use constants directly as fallback, we might get '自定義' options.
          // The user wants to remove '自定義' dropdown logic.
          // Let's seed same as HierarchyManager.
          const seed: EquipmentHierarchy = {};
          Object.entries(EQUIPMENT_HIERARCHY).forEach(([cat, types]) => {
            if (cat === '自定義') return;
            seed[cat] = {};
            Object.entries(types).forEach(([type, details]) => {
              if (type === '自定義') return;
              const validDetails = Array.isArray(details) ? details.filter(d => d !== '自定義') : [];
              seed[cat][type] = validDetails;
            });
          });
          setHierarchy(seed);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchHierarchy();
  }, [user.uid]);



  // Initialize form if editing, or reset if adding
  useEffect(() => {
    if (initialData) {
      // Edit Mode
      setSiteName(initialData.siteName);
      setBuildingName(initialData.buildingName);
      setName(initialData.name);
      setBarcode(initialData.barcode);

      const freq = initialData.checkFrequency || 'monthly';
      if (['monthly', 'quarterly', 'yearly'].includes(freq)) {
        setFrequency(freq);
        setCustomFrequency('');
      } else {
        // 判斷是自訂日期還是自訂天數
        if (freq.includes('-') && freq.length > 5) {
          setFrequency('custom_date');
          setCustomFrequency(freq);
        } else {
          // 假設是自訂天數 (純數字)
          setFrequency('custom_days');
          setCustomFrequency(freq);
        }
      }

      if (initialData.checkStartDate) {
        const d = new Date(initialData.checkStartDate);
        setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }

      if (initialData.lifespan) {
        setLifespan(initialData.lifespan);
        if (initialData.lifespan === 'custom') {
          setCustomLifespan(initialData.customLifespan || '');
        }
      }

      setEqCategory(initialData.equipmentCategory || '');
      setEqType(initialData.equipmentType || '');

      setEqDetail(initialData.equipmentDetail || '');
      setPhotoUrl(initialData.photoUrl || '');
      setCheckItems(initialData.checkItems || []);
    } else {
      // Add Mode - Reset all fields
      setSiteName('');
      setBuildingName('');
      setName('');
      setBarcode('');
      setFrequency('monthly');
      setCustomFrequency('');
      setCustomFrequency('');
      const d = new Date();
      setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      setLifespan('');
      setCustomLifespan('');
      setEqCategory('');
      setEqType('');
      setEqDetail('');
      setPhotoUrl('');
      setCheckItems([]);
    }
  }, [initialData]);

  // Generate QR Code when barcode changes
  useEffect(() => {
    if (barcode.trim()) {
      QRCode.toDataURL(barcode, { width: 300, margin: 2 })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.error("QR Generation Error", err));
    } else {
      setQrCodeUrl('');
    }
  }, [barcode]);

  const handleDownloadQr = () => {
    if (!qrCodeUrl) return;
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `QR_${barcode || 'equipment'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Format Validation
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('格式錯誤：僅支援 JPG 或 PNG 圖片');
      return;
    }

    // Size Validation (1MB)
    if (file.size > 1024 * 1024) {
      alert('檔案過大：圖片大小限制為 1MB 以下');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      // 1. Upload new photo
      const newUrl = await StorageService.uploadEquipmentPhoto(file, user.uid);

      // 2. Delete old photo if it exists
      if (photoUrl) {
        await StorageService.deleteEquipmentPhoto(photoUrl);
      }

      // 3. Sync to DB if editing (Partial update to avoid overwriting current form state)
      if (initialData) {
        await StorageService.updateEquipmentDefinition({
          id: initialData.id,
          photoUrl: newUrl,
          updatedAt: Date.now()
        });
      }

      setPhotoUrl(newUrl);
    } catch (err) {
      console.error("Photo upload failed", err);
      if (err instanceof Error && err.message.includes('1MB')) {
        alert('上傳失敗：圖片大小超過 1MB 限制');
      } else {
        alert('照片上傳失敗，請稍後再試');
      }
    } finally {
      setIsUploadingPhoto(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDeletePhoto = async () => {
    if (!photoUrl) return;

    if (!confirm('確定要刪除這張照片嗎？')) return;

    try {
      setIsUploadingPhoto(true);

      // 1. Delete from Storage
      await StorageService.deleteEquipmentPhoto(photoUrl);

      // 2. Sync to DB if editing (Partial update)
      if (initialData) {
        await StorageService.updateEquipmentDefinition({
          id: initialData.id,
          photoUrl: '', // Reset in DB
          updatedAt: Date.now()
        });
      }

      setPhotoUrl('');
    } catch (err) {
      console.error("Delete photo failed", err);
      alert('刪除照片失敗，請稍後再試');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Helper to add a check item
  const addCheckItem = (category: CheckCategory) => {
    const newItem: CustomCheckItem = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      name: '',
      category,
      inputType: 'boolean',
      thresholdMode: 'range', // 預設判定模式
      unit: '' // 預設空單位
    };
    setCheckItems([...checkItems, newItem]);
  };

  // Helper to update a check item
  const updateCheckItem = (id: string, updates: Partial<CustomCheckItem>) => {
    setCheckItems(items => items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  // Helper to delete a check item
  const deleteCheckItem = (id: string) => {
    setCheckItems(items => items.filter(item => item.id !== id));
  };

  const handleSave = async () => {
    // Reset validation errors
    setValidationErrors({});
    const errors: typeof validationErrors = {};
    const missingFields: string[] = [];

    // Validate required fields
    if (!siteName.trim()) {
      errors.siteName = true;
      missingFields.push('場所名稱');
    }
    if (!buildingName.trim()) {
      errors.buildingName = true;
      missingFields.push('建築物名稱');
    }
    if (!name.trim()) {
      errors.name = true;
      missingFields.push('設備名稱');
    }
    if (!barcode.trim()) {
      errors.barcode = true;
      missingFields.push('設備編號');
    }

    // Validate at least one check item
    if (checkItems.length === 0) {
      errors.checkItems = true;
      missingFields.push('檢查項目 (至少需要一項)');
    }

    // If there are missing fields, show error and return
    if (missingFields.length > 0) {
      setValidationErrors(errors);
      alert(`請填寫以下必填欄位：\n\n${missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);

      // Scroll to first error
      setTimeout(() => {
        const firstErrorElement = document.querySelector('.border-red-500');
        if (firstErrorElement) {
          firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    const finalFrequency = (frequency === 'custom_date' || frequency === 'custom_days') ? customFrequency : frequency;
    if ((frequency === 'custom_date' || frequency === 'custom_days') && !customFrequency.trim()) {
      alert(t('enterCustomFrequency'));
      return;
    }

    // Validate numeric check items have threshold values
    console.log('[EquipmentManager] Starting validation. Total checkItems:', checkItems.length);
    console.log('[EquipmentManager] CheckItems:', JSON.stringify(checkItems, null, 2));

    const invalidNumericItems = checkItems.filter(item => {
      if (item.inputType === 'number') {
        console.log('[Validation]', item.name, '- mode:', item.thresholdMode, 'val1:', item.val1, 'type:', typeof item.val1, 'val2:', item.val2, 'type:', typeof item.val2, 'unit:', item.unit);

        // Check if threshold mode is set
        if (!item.thresholdMode) {
          console.log('  -> FAIL: Missing thresholdMode');
          return true;
        }

        // Check if val1 is set (convert to number and check)
        if (item.val1 === undefined || item.val1 === null || isNaN(item.val1)) {
          console.log('  -> FAIL: Missing or invalid val1', item.val1);
          return true;
        }

        // For range mode, check if val2 is also set
        if (item.thresholdMode === 'range') {
          if (item.val2 === undefined || item.val2 === null || isNaN(item.val2)) {
            console.log('  -> FAIL: Missing or invalid val2 for range mode', item.val2);
            return true;
          }
        }

        // Check if unit is set
        if (!item.unit || item.unit.trim() === '') {
          console.log('  -> FAIL: Missing unit');
          return true;
        }

        console.log('  -> PASS');
      }
      return false;
    });

    console.log('[EquipmentManager] Validation complete. Invalid items:', invalidNumericItems.length);

    if (invalidNumericItems.length > 0) {
      const itemDetails = invalidNumericItems.map(item => {
        const issues = [];
        if (!item.thresholdMode) issues.push('缺少判定模式');
        if (item.val1 === undefined || item.val1 === null || isNaN(item.val1)) issues.push('缺少或無效的數值1');
        if (item.thresholdMode === 'range' && (item.val2 === undefined || item.val2 === null || isNaN(item.val2))) issues.push('缺少或無效的數值2 (Max)');
        if (!item.unit || item.unit.trim() === '') issues.push('缺少單位');
        return `「${item.name}」: ${issues.join('、')}`;
      }).join('\n');

      console.error('[EquipmentManager] Validation failed details:\n', itemDetails);
      alert(`以下數值檢查項目缺少完整的閾值設定：\n\n${itemDetails}\n\n請完整填寫後再儲存。`);
      return;
    }


    setIsSaving(true);
    const definition: EquipmentDefinition = {
      id: initialData?.id || Date.now().toString(),
      userId: user.uid,
      siteName,
      buildingName,
      name,
      barcode,
      checkFrequency: finalFrequency,
      checkStartDate: new Date(startDate).getTime(),
      lifespan,
      customLifespan: lifespan === 'custom' ? customLifespan : null,
      equipmentCategory: eqCategory,
      equipmentType: eqType,
      equipmentDetail: eqDetail,

      lastInspectedDate: initialData?.lastInspectedDate || null, // Preserve or null
      photoUrl,
      checkItems,
      updatedAt: Date.now(),
      createdAt: initialData?.createdAt || Date.now()
    };

    try {
      if (initialData) {
        // Update mode
        await StorageService.updateEquipmentDefinition(definition);

        // --- Rename Sync Logic ---
        const isBarcodeChanged = initialData.barcode !== barcode;
        const isNameChanged = initialData.name !== name;

        if (isBarcodeChanged || isNameChanged) {
          console.log('[EquipmentManager] Def changed. Syncing...', { isBarcodeChanged, isNameChanged });

          try {
            // 1. Sync Maps (Markers are linked by Barcode/EquipmentID)
            const maps = await StorageService.getMaps(user.uid);
            const mapsToUpdate = maps.filter(m => m.markers.some(mk => mk.equipmentId === initialData.barcode));

            if (mapsToUpdate.length > 0) {
              console.log(`[Sync] Updating ${mapsToUpdate.length} maps with new barcode/info...`);
              for (const map of mapsToUpdate) {
                const updatedMarkers = map.markers.map(mk => {
                  if (mk.equipmentId === initialData.barcode) {
                    return { ...mk, equipmentId: barcode }; // Update ID if barcode changed
                  }
                  return mk;
                });
                await StorageService.saveMap({ ...map, markers: updatedMarkers }, user.uid);
              }
            }

            // 2. Sync Abnormal Records (Pending only, or all? User said "Abnormal Recheck List" so likely Pending)
            // Ideally we should update history too if possible, but let's stick to active pending records first.
            const abnormalRecords = await StorageService.getAbnormalRecords(user.uid);
            const recordsToUpdate = abnormalRecords.filter(r => r.equipmentId === initialData.barcode || r.barcode === initialData.barcode);

            if (recordsToUpdate.length > 0) {
              console.log(`[Sync] Updating ${recordsToUpdate.length} abnormal records...`);
              for (const record of recordsToUpdate) {
                // Update fields if changed
                const updates: any = {};
                if (isBarcodeChanged) {
                  updates.equipmentId = barcode;
                  updates.barcode = barcode;
                }
                if (isNameChanged) {
                  updates.equipmentName = name;
                }

                // Only update if we actually have changes (which we should if we are here)
                await StorageService.updateAbnormalRecord({ ...record, ...updates });
              }
            }
          } catch (syncErr) {
            console.error("Sync Rename Failed:", syncErr);
            alert("設備資料已更新，但同步至地圖或異常清單時發生錯誤，請手動檢查。");
          }
        }
        // -------------------------

        setShowSuccessModal(true);
      } else {
        // Create mode
        await StorageService.saveEquipmentDefinition(definition, user.uid);
        setShowSuccessModal(true);
      }
    } catch (e) {
      console.error(e);
      alert('Save failed: ' + (e as any).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinue = () => {
    if (initialData) {
      // If editing, continue means go back
      if (onSaved) onSaved();
    } else {
      // If creating, reset for next
      setBarcode('');
      setQrCodeUrl('');
      setName('');
      setShowSuccessModal(false);
      const container = document.querySelector('.overflow-y-auto');
      if (container) container.scrollTop = 0;
    }
  };

  const getNextDatePreview = () => {
    const startTs = new Date(startDate).getTime();
    console.log('[EquipmentManager] getNextDatePreview - startDate:', startDate, 'startTs:', startTs);
    if (isNaN(startTs)) return '-';

    const finalFrequency = (frequency === 'custom_date' || frequency === 'custom_days') ? customFrequency : frequency;
    console.log('[EquipmentManager] frequency:', frequency, 'finalFrequency:', finalFrequency);
    if (!finalFrequency) return '-';

    // Direct calculation for new frequency options
    const baseDate = new Date(startTs);
    let nextDate: Date | null = null;

    if (finalFrequency === 'monthly') {
      nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else if (finalFrequency === 'quarterly') {
      nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + 3);
    } else if (finalFrequency === 'yearly') {
      nextDate = new Date(baseDate);
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    } else {
      // Fallback to original calculation for other cases
      nextDate = calculateNextInspectionDate(
        startTs,
        finalFrequency,
        initialData?.lastInspectedDate
      );
    }

    console.log('[EquipmentManager] calculated next date:', nextDate);
    return nextDate ? nextDate.toLocaleDateString() : '-';
  };

  const getExpiryDatePreview = () => {
    const startTs = new Date(startDate).getTime();
    if (isNaN(startTs)) return '-';

    const expiry = calculateExpiryDate(startTs, lifespan, customLifespan);
    return expiry ? expiry.toLocaleDateString() : '-';
  };

  const renderCategorySection = (category: CheckCategory, icon: React.ReactNode, title: string) => {
    const items = checkItems.filter(i => i.category === category);
    const isCollapsed = collapsedCategories[category];

    const toggleCollapse = () => {
      setCollapsedCategories(prev => ({
        ...prev,
        [category]: !prev[category]
      }));
    };

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-4 transition-all duration-300">
        <div
          className="bg-slate-50 p-4 flex justify-between items-center cursor-pointer hover:bg-slate-100/80 transition-colors"
          onClick={toggleCollapse}
        >
          <div className="flex items-center text-slate-800 font-bold">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 mr-3">
              {icon}
            </div>
            <div className="flex flex-col">
              <span className="text-sm">{title}</span>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                {items.length} 個項目
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                addCheckItem(category);
                if (isCollapsed) toggleCollapse();
              }}
              className="text-xs bg-white border border-slate-300 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 text-slate-700 px-3 py-1.5 rounded-lg flex items-center shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('addItem')}
            </button>
            <div className={`text-slate-400 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
            {items.length === 0 ? (
              <div className="text-center py-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                <LayoutList className="w-8 h-8 mx-auto mb-2 opacity-20" />
                尚未新增項目
              </div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 transition-all hover:bg-white hover:shadow-md hover:border-blue-100 group">
                  {/* Row 1: Name & Type */}
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full">
                    <div className="flex-1 w-full">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateCheckItem(item.id, { name: e.target.value })}
                        placeholder={t('itemName') + ` (${t('itemPlaceholder')})`}
                        className="w-full p-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
                      />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <select
                        value={item.inputType}
                        onChange={(e) => updateCheckItem(item.id, { inputType: e.target.value as CheckInputType })}
                        className="p-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                      >
                        <option value="boolean">{t('typeBoolean')}</option>
                        <option value="number">{t('typeNumber')}</option>
                      </select>
                      <button
                        onClick={() => deleteCheckItem(item.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Number Constraints (If Number) */}
                  {item.inputType === 'number' && (
                    <div className="bg-white p-3 rounded-lg border border-blue-50 mt-1 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4 animate-in slide-in-from-left-2 duration-300">
                      {/* Threshold Logic */}
                      <div className="flex items-center gap-2 flex-1 flex-wrap">
                        <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded tracking-tighter uppercase">閾值判定</span>
                        <select
                          value={item.thresholdMode || 'range'}
                          onChange={(e) => updateCheckItem(item.id, { thresholdMode: e.target.value as any })}
                          className="p-1.5 text-xs bg-slate-50 border border-slate-100 rounded text-slate-700 outline-none focus:border-blue-500 hover:border-blue-300 transition-colors"
                        >
                          <option value="range">介於 (Range)</option>
                          <option value="gt">大於 ({'>'})</option>
                          <option value="gte">不小於 ({'>='})</option>
                          <option value="lt">小於 ({'<'})</option>
                          <option value="lte">不大於 ({'<='})</option>
                        </select>

                        <input
                          type="number"
                          value={item.val1 ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCheckItem(item.id, { val1: val === '' ? undefined : parseFloat(val) });
                          }}
                          placeholder={item.thresholdMode === 'range' ? "Min" : "Value"}
                          className="w-20 p-1.5 text-xs bg-slate-50 border border-slate-100 rounded text-slate-900 outline-none focus:border-blue-500 transition-colors"
                        />

                        {(item.thresholdMode === 'range' || !item.thresholdMode) && (
                          <>
                            <span className="text-slate-400 text-[10px]">~</span>
                            <input
                              type="number"
                              value={item.val2 ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateCheckItem(item.id, { val2: val === '' ? undefined : parseFloat(val) });
                              }}
                              placeholder="Max"
                              className="w-20 p-1.5 text-xs bg-slate-50 border border-slate-100 rounded text-slate-900 outline-none focus:border-blue-500 transition-colors"
                            />
                          </>
                        )}
                      </div>

                      <div className="hidden sm:block w-px h-6 bg-slate-100"></div>

                      {/* Unit Selection */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded tracking-tighter uppercase">單位</span>
                        <div className="flex gap-1">
                          <select
                            value={COMMON_UNITS.includes(item.unit || '') ? item.unit : 'custom'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateCheckItem(item.id, { unit: val === 'custom' ? '' : val });
                            }}
                            className="p-1.5 w-24 text-xs bg-slate-50 border border-slate-100 rounded text-slate-700 outline-none focus:border-blue-500 hover:border-blue-300 transition-colors"
                          >
                            <option value="" disabled>選擇...</option>
                            {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            <option value="custom">自訂</option>
                          </select>
                          {(!COMMON_UNITS.includes(item.unit || '') || item.unit === '') && (
                            <input
                              type="text"
                              value={item.unit || ''}
                              onChange={(e) => updateCheckItem(item.id, { unit: e.target.value })}
                              placeholder="自訂"
                              className="w-16 p-1.5 text-xs bg-slate-50 border border-slate-100 rounded text-slate-900 outline-none focus:border-blue-500 transition-colors"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
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
            <div>
              <h1 className="font-bold text-lg text-slate-800 leading-tight">{initialData ? t('editEquipment') : t('equipmentManager')}</h1>
              <p className="text-xs text-slate-500 hidden sm:block">{initialData ? initialData.name : t('addEquipment')}</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center text-sm font-bold px-4 py-2 rounded-lg text-white shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: THEME_COLORS.primary }}
          >
            {isSaving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {initialData ? t('updateEquipment') : t('saveEquipment')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Card 1: Basic Information (Teal Theme) */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            {/* Teal Header */}
            <div className="bg-gradient-to-r from-teal-500 to-teal-600 p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">基本資料</h3>
                <p className="text-white/80 text-xs">設備基本信息</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Location Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                    場所名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={e => {
                      setSiteName(e.target.value);
                      if (validationErrors.siteName) {
                        setValidationErrors(prev => ({ ...prev, siteName: false }));
                      }
                    }}
                    placeholder="輸入場所名稱"
                    className={`w-full p-3 bg-white border-2 rounded-lg text-slate-900 focus:outline-none transition-all ${validationErrors.siteName
                      ? 'border-red-500 focus:border-red-600'
                      : 'border-slate-200 focus:border-teal-500'
                      }`}
                  />
                  {validationErrors.siteName && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      請填寫場所名稱
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                    建築物名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={buildingName}
                    onChange={e => {
                      setBuildingName(e.target.value);
                      if (validationErrors.buildingName) {
                        setValidationErrors(prev => ({ ...prev, buildingName: false }));
                      }
                    }}
                    placeholder="輸入建築物名稱"
                    className={`w-full p-3 bg-white border-2 rounded-lg text-slate-900 focus:outline-none transition-all ${validationErrors.buildingName
                      ? 'border-red-500 focus:border-red-600'
                      : 'border-slate-200 focus:border-teal-500'
                      }`}
                  />
                  {validationErrors.buildingName && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      請填寫建築物名稱
                    </p>
                  )}
                </div>
              </div>

              {/* Equipment Name Section */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                  設備名稱 <span className="text-red-500">*</span>
                </label>

                {/* Hierarchy Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <select
                    value={eqCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEqCategory(val);
                      setEqType('');
                      setEqDetail('');
                    }}
                    className="w-full p-2.5 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg outline-none focus:border-teal-500 transition-colors"
                  >
                    <option value="">選擇分類...</option>
                    {Object.keys(hierarchy).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <select
                    value={eqType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEqType(val);
                      setEqDetail('');
                    }}
                    disabled={!eqCategory}
                    className="w-full p-2.5 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg outline-none focus:border-teal-500 disabled:opacity-50 transition-colors"
                  >
                    <option value="">選擇種類...</option>
                    {eqCategory && hierarchy[eqCategory] &&
                      Object.keys(hierarchy[eqCategory]).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))
                    }
                  </select>

                  <select
                    value={eqDetail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEqDetail(val);
                      if (val) {
                        setName(`${eqType} - ${val}`);
                      }
                    }}
                    disabled={!eqType}
                    className="w-full p-2.5 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg outline-none focus:border-teal-500 disabled:opacity-50 transition-colors"
                  >
                    <option value="">選擇細項...</option>
                    {eqCategory && eqType && hierarchy[eqCategory] && hierarchy[eqCategory][eqType] &&
                      hierarchy[eqCategory][eqType].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))
                    }
                  </select>
                </div>

                <input
                  type="text"
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    if (validationErrors.name) {
                      setValidationErrors(prev => ({ ...prev, name: false }));
                    }
                  }}
                  placeholder="輸入設備名稱 (或由上方選單自動帶入)"
                  className={`w-full p-3 bg-white border-2 rounded-lg text-slate-900 focus:outline-none transition-all ${validationErrors.name
                    ? 'border-red-500 focus:border-red-600'
                    : 'border-slate-200 focus:border-teal-500'
                    }`}
                />
                {validationErrors.name && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    請填寫設備名稱
                  </p>
                )}
              </div>

              {/* Equipment ID and Photo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                    設備編號 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => {
                      setBarcode(e.target.value.toUpperCase());
                      if (validationErrors.barcode) {
                        setValidationErrors(prev => ({ ...prev, barcode: false }));
                      }
                    }}
                    placeholder="輸入設備編號"
                    className={`w-full p-3 bg-white border-2 rounded-lg text-slate-900 focus:outline-none transition-all ${validationErrors.barcode
                      ? 'border-red-500 focus:border-red-600'
                      : 'border-slate-200 focus:border-teal-500'
                      }`}
                  />
                  {validationErrors.barcode && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      請填寫設備編號
                    </p>
                  )}
                </div>

                {/* Photo Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    設備照片 <span className="text-xs text-slate-400 font-normal ml-2">Max 1MB</span>
                  </label>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 border-2 border-slate-200 rounded-lg">
                    <div className="w-14 h-14 bg-white border-2 border-slate-200 rounded-lg overflow-hidden flex-shrink-0 relative group">
                      {photoUrl ? (
                        <>
                          <img src={photoUrl} alt="Equipment" className="w-full h-full object-cover" />
                          <button
                            onClick={handleDeletePhoto}
                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-5 h-5 text-white" />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <label className={`flex-1 flex items-center justify-center px-4 py-2.5 bg-white border-2 border-teal-200 rounded-lg text-teal-600 text-sm font-bold hover:bg-teal-50 hover:border-teal-400 transition-all cursor-pointer ${isUploadingPhoto ? 'opacity-50' : ''}`}>
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploadingPhoto ? '上傳中...' : '選擇照片'}
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={isUploadingPhoto}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Schedule Settings (Blue Theme) */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            {/* Blue Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <CalendarClock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">排程設定</h3>
                <p className="text-white/80 text-xs">檢查頻率與日期設定</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Frequency and Start Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">檢查頻率</label>
                  <div className="flex gap-2">
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="flex-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="monthly">每月</option>
                      <option value="quarterly">每季</option>
                      <option value="yearly">每年</option>
                      <option value="custom_date">自訂日期</option>
                      <option value="custom_days">自訂天數</option>
                    </select>
                    {frequency === 'custom_date' && (
                      <input
                        type="date"
                        value={customFrequency}
                        onChange={(e) => setCustomFrequency(e.target.value)}
                        className="w-36 p-3 bg-white border-2 border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      />
                    )}
                    {frequency === 'custom_days' && (
                      <input
                        type="number"
                        value={customFrequency}
                        onChange={(e) => setCustomFrequency(e.target.value)}
                        placeholder="天數"
                        className="w-24 p-3 bg-white border-2 border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">檢查起始日期</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Next Date Preview */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-blue-600">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">下次檢查日期</p>
                    <p className="text-xl font-black text-slate-800 tracking-tight">{getNextDatePreview()}</p>
                  </div>
                </div>
                {initialData?.lastInspectedDate && (
                  <span className="px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full text-xs font-bold text-slate-600 border-2 border-white">
                    已有檢查紀錄
                  </span>
                )}
              </div>

              {/* Lifespan Settings */}
              <div className="space-y-2 pt-4 border-t-2 border-slate-100">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  設定壽命
                  <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded">將於到期時發送通知</span>
                </label>
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    value={lifespan}
                    onChange={(e) => setLifespan(e.target.value)}
                    className="p-3 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-blue-500 transition-colors min-w-[140px]"
                  >
                    <option value="">未設定</option>
                    <option value="1m">1 個月</option>
                    <option value="3m">1 季 (3個月)</option>
                    <option value="12m">1 年 (12個月)</option>
                    <option value="24m">2 年 (24個月)</option>
                    <option value="36m">3 年 (36個月)</option>
                    <option value="120m">10 年 (120個月)</option>
                    <option value="custom">自訂日期</option>
                  </select>

                  {lifespan === 'custom' && (
                    <input
                      type="date"
                      value={customLifespan}
                      onChange={(e) => setCustomLifespan(e.target.value)}
                      className="w-40 p-3 bg-white border-2 border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 animate-in fade-in slide-in-from-left-2"
                    />
                  )}

                  {lifespan && (
                    <div className="ml-auto text-sm font-medium bg-orange-50 px-4 py-2.5 rounded-lg border-2 border-orange-200 flex items-center gap-2">
                      <span className="text-orange-600 font-bold">預計到期日:</span>
                      <span className="text-slate-800 font-bold">{getExpiryDatePreview()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Checklist Configuration (Purple Theme) */}
          <div className={`bg-white rounded-2xl shadow-md border-2 overflow-hidden ${validationErrors.checkItems ? 'border-red-500' : 'border-slate-200'
            }`}>
            {/* Purple Header */}
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <ClipboardCheck className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-lg">檢查項目配置</h3>
                <p className="text-white/80 text-xs">設定檢查清單內容 <span className="text-red-200">(至少需要一項)*</span></p>
              </div>
            </div>

            {validationErrors.checkItems && (
              <div className="bg-red-50 border-b-2 border-red-200 p-3 flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5" />
                <p className="text-sm font-bold">請至少新增一個檢查項目</p>
              </div>
            )}

            <div className="p-6 space-y-4">
              {renderCategorySection('visual', <Eye className="w-5 h-5 text-blue-500" />, t('visualCheck'))}
              {renderCategorySection('performance', <Gauge className="w-5 h-5 text-orange-500" />, t('performanceCheck'))}
              {renderCategorySection('comprehensive', <ClipboardCheck className="w-5 h-5 text-purple-500" />, t('comprehensiveCheck'))}
            </div>
          </div>
        </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 transform scale-100 animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-2 animate-bounce">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">{initialData ? t('updateSuccess') : t('saveSuccess')}</h3>
                <p className="text-slate-500">{initialData ? '' : t('addNextConfirm')}</p>
                <div className="flex gap-3 w-full pt-2">
                  {!initialData && (
                    <button
                      onClick={onBack}
                      className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {t('noReturn')}
                    </button>
                  )}
                  <button
                    onClick={handleContinue}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                  >
                    {initialData ? t('yesContinue') : t('yesContinue')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EquipmentManager;