import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Eye, Gauge, ClipboardCheck, LayoutList, Download, QrCode, CalendarClock, Calendar, CheckCircle, Bell, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { THEME_COLORS } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { EquipmentDefinition, CheckCategory, CheckInputType, CustomCheckItem, UserProfile } from '../types';

const COMMON_UNITS = ['MPa', 'kgf/cm²', 'psi', 'bar', 'V', 'A', 'mA', 'kW', 'Hz', '°C', 'sec', 'min', 'm', 'cm', 'mm', 'kg', '%', 'ppm'];
import { StorageService } from '../services/storageService';
import { calculateNextInspectionDate } from '../utils/dateUtils';
import QRCode from 'qrcode';

interface EquipmentManagerProps {
  user: UserProfile;
  initialData?: EquipmentDefinition | null;
  onBack: () => void;
  onSaved?: () => void;
}

const EquipmentManager: React.FC<EquipmentManagerProps> = ({ user, initialData, onBack, onSaved }) => {
  const { t } = useLanguage();
  const [siteName, setSiteName] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [customFrequency, setCustomFrequency] = useState('');
  const [startDate, setStartDate] = useState(() => {
    // Default to today in local time format YYYY-MM-DD
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Notification Emails
  const [email1, setEmail1] = useState('');
  const [email2, setEmail2] = useState('');
  const [email3, setEmail3] = useState('');
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const [checkItems, setCheckItems] = useState<CustomCheckItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  // Initialize form if editing, or reset if adding
  useEffect(() => {
    if (initialData) {
      // Edit Mode
      setSiteName(initialData.siteName);
      setBuildingName(initialData.buildingName);
      setName(initialData.name);
      setBarcode(initialData.barcode);

      const freq = initialData.checkFrequency || 'monthly';
      if (['weekly', 'monthly', 'quarterly', 'yearly', '2years', '3years'].includes(freq)) {
        setFrequency(freq);
        setCustomFrequency('');
      } else {
        setFrequency('custom');
        setCustomFrequency(freq);
      }

      if (initialData.checkStartDate) {
        const d = new Date(initialData.checkStartDate);
        setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }

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
      setEmail1('');
      setEmail2('');
      setEmail3('');
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

  // Helper to add a check item
  const addCheckItem = (category: CheckCategory) => {
    const newItem: CustomCheckItem = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      name: '',
      category,
      inputType: 'boolean'
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
    if (!siteName || !buildingName || !name || !barcode) {
      alert(t('fillRequired'));
      return;
    }

    const finalFrequency = frequency === 'custom' ? customFrequency : frequency;
    if (frequency === 'custom' && !customFrequency.trim()) {
      alert(t('enterCustomFrequency'));
      return;
    }

    // Combine emails
    const emails = [email1, email2, email3].filter(e => e.trim() !== '').map(e => e.trim());

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
      lastInspectedDate: initialData?.lastInspectedDate, // Preserve
      notificationEmails: emails,
      checkItems,
      updatedAt: Date.now(),
      createdAt: initialData?.createdAt || Date.now()
    };

    try {
      if (initialData) {
        // Update mode
        await StorageService.updateEquipmentDefinition(definition);
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
    if (frequency === 'custom') return '依自訂頻率';
    // Calculate based on start date and assuming no inspection (or using current object's last inspection)
    const next = calculateNextInspectionDate(
      new Date(startDate).getTime(),
      frequency,
      initialData?.lastInspectedDate
    );
    return next ? next.toLocaleDateString() : '-';
  };

  const renderCategorySection = (category: CheckCategory, icon: React.ReactNode, title: string) => {
    const items = checkItems.filter(i => i.category === category);

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center text-slate-800 font-bold">
            {icon}
            <span className="ml-2">{title}</span>
          </div>
          <button
            onClick={() => addCheckItem(category)}
            className="text-sm bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg flex items-center shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t('addItem')}
          </button>
        </div>

        <div className="p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-sm italic">
              尚未新增項目
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 transition-all hover:border-blue-200">
                {/* Row 1: Name & Type */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full">
                  <div className="flex-1 w-full">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateCheckItem(item.id, { name: e.target.value })}
                      placeholder={t('itemName') + ` (${t('itemPlaceholder')})`}
                      className="w-full p-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <select
                      value={item.inputType}
                      onChange={(e) => updateCheckItem(item.id, { inputType: e.target.value as CheckInputType })}
                      className="p-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-red-500 focus:outline-none"
                    >
                      <option value="boolean">{t('typeBoolean')}</option>
                      <option value="number">{t('typeNumber')}</option>
                    </select>
                    <button
                      onClick={() => deleteCheckItem(item.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Number Constraints (If Number) */}
                {item.inputType === 'number' && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4 animate-in slide-in-from-top-1">

                    {/* Threshold Logic */}
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <span className="text-xs font-bold text-white bg-slate-400 px-2 py-1 rounded shadow-sm">判斷</span>
                      <select
                        value={item.thresholdMode || 'range'}
                        onChange={(e) => updateCheckItem(item.id, { thresholdMode: e.target.value as any })}
                        className="p-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:border-blue-500 hover:border-blue-300 transition-colors"
                      >
                        <option value="range">介於 (Range)</option>
                        <option value="gt">大於 ({'>'})</option>
                        <option value="gte">不小於 ({'>='})</option>
                        <option value="lt">小於 ({'<'})</option>
                        <option value="lte">不大於 ({'<='})</option>
                      </select>

                      <input
                        type="number"
                        value={item.val1 || ''}
                        onChange={(e) => updateCheckItem(item.id, { val1: parseFloat(e.target.value) })}
                        placeholder={item.thresholdMode === 'range' ? "Min" : "Value"}
                        className="w-20 p-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-blue-500 transition-colors"
                      />

                      {(item.thresholdMode === 'range' || !item.thresholdMode) && (
                        <>
                          <span className="text-slate-400 text-xs">~</span>
                          <input
                            type="number"
                            value={item.val2 || ''}
                            onChange={(e) => updateCheckItem(item.id, { val2: parseFloat(e.target.value) })}
                            placeholder="Max"
                            className="w-20 p-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-blue-500 transition-colors"
                          />
                        </>
                      )}
                    </div>

                    <div className="hidden sm:block w-px h-8 bg-slate-200"></div>
                    <div className="block sm:hidden w-full h-px bg-slate-200"></div>

                    {/* Unit Selection */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-white bg-slate-400 px-2 py-1 rounded shadow-sm">單位</span>
                      <div className="flex gap-1">
                        <select
                          value={COMMON_UNITS.includes(item.unit || '') ? item.unit : 'custom'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCheckItem(item.id, { unit: val === 'custom' ? '' : val });
                          }}
                          className="p-1.5 w-24 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:border-blue-500 hover:border-blue-300 transition-colors"
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
                            placeholder="輸入單位"
                            className="w-20 p-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-blue-500 transition-colors"
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

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Basic Info */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50/80 p-4 border-b border-slate-200 flex items-center">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mr-3 text-blue-600">
                <LayoutList className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">基本資料</h3>
            </div>

            <div className="p-6 space-y-6">
              {/* Location Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                    <span className="w-1 h-3 bg-red-500 rounded-full mr-1.5"></span>
                    {t('siteName')} <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={e => setSiteName(e.target.value)}
                    placeholder={t('enterSiteName')}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 focus:outline-none transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                    <span className="w-1 h-3 bg-red-500 rounded-full mr-1.5"></span>
                    建築物名稱 <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={buildingName}
                    onChange={e => setBuildingName(e.target.value)}
                    placeholder={t('enterBuildingName')}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 focus:outline-none transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* Equipment Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                    {t('equipmentName')} <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('enterEquipmentName')}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-red-500 focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                    {t('equipmentId')} <span className="text-red-500 ml-1">*</span>
                  </label>

                  <div className="flex gap-3 items-start">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={barcode}
                        onChange={e => setBarcode(e.target.value)}
                        placeholder={t('enterBarcode')}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-red-500 focus:outline-none transition-all group-hover:border-slate-400"
                      />
                      {barcode && <div className="text-[10px] text-slate-400 mt-1.5 flex items-center pl-1 font-medium"><QrCode className="w-3 h-3 mr-1" /> 系統已自動產生對應條碼</div>}
                    </div>

                    {qrCodeUrl && (
                      <div className="relative group shrink-0">
                        <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                          <img src={qrCodeUrl} alt="QR Code" className="w-12 h-12 object-contain" />
                        </div>
                        <button
                          onClick={handleDownloadQr}
                          className="absolute -bottom-2 -right-2 bg-slate-800 text-white p-1.5 rounded-full shadow hover:bg-black transition-colors"
                          title={t('downloadQrCode')}
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Schedule Section */}
              <div className="border-t border-slate-100 pt-4 mt-2">
                <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center">
                  <CalendarClock className="w-4 h-4 mr-2 text-slate-400" />
                  排程設定
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Frequency and Start Date */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">{t('checkFrequency')}</label>
                    <div className="flex gap-2">
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value)}
                        className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-blue-500 transition-colors"
                      >
                        <option value="weekly">{t('freqWeekly')}</option>
                        <option value="monthly">{t('freqMonthly')}</option>
                        <option value="quarterly">{t('freqQuarterly')}</option>
                        <option value="yearly">{t('freqYearly')}</option>
                        <option value="2years">{t('freq2Years')}</option>
                        <option value="3years">{t('freq3Years')}</option>
                        <option value="custom">{t('freqCustom')}</option>
                      </select>
                      {frequency === 'custom' && (
                        <input
                          type="text"
                          value={customFrequency}
                          onChange={(e) => setCustomFrequency(e.target.value)}
                          placeholder="自訂"
                          className="w-24 p-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">{t('checkStartDate')}</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Next Date Preview Banner */}
                <div className="mt-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-blue-500">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-500 font-bold uppercase tracking-wider">下次檢查日期</p>
                      <p className="text-lg font-black text-slate-800 tracking-tight">{getNextDatePreview()}</p>
                    </div>
                  </div>
                  {initialData?.lastInspectedDate && (
                    <span className="px-3 py-1 bg-white/60 backdrop-blur-sm rounded-full text-xs font-medium text-slate-600 border border-white/50">
                      已有檢查紀錄
                    </span>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* Notification Settings (Collapsible) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="w-full bg-white p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-colors ${isNotifOpen ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                  <Bell className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className={`font-bold text-lg ${isNotifOpen ? 'text-slate-800' : 'text-slate-600'}`}>自動通知設定</h3>
                  {!isNotifOpen && <p className="text-xs text-slate-400">設定異常通知信箱 ({[email1, email2, email3].filter(Boolean).length} 已設定)</p>}
                </div>
              </div>
              {isNotifOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {isNotifOpen && (
              <div className="p-6 pt-0 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                <p className="text-sm text-slate-500 mb-4 mt-4 bg-orange-50 p-3 rounded-lg border border-orange-100 flex gap-2">
                  <Mail className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  當檢查日期即將到期，或檢查結果為「異常」時，系統將自動寄送通知信至以下信箱。
                </p>

                <div className="space-y-3">
                  {[
                    { val: email1, set: setEmail1, idx: 1 },
                    { val: email2, set: setEmail2, idx: 2 },
                    { val: email3, set: setEmail3, idx: 3 }
                  ].map((field) => (
                    <div key={field.idx} className="relative group">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 group-focus-within:text-blue-500 transition-colors" />
                      <input
                        type="email"
                        value={field.val}
                        onChange={(e) => field.set(e.target.value)}
                        placeholder={`輸入 Email (${field.idx})`}
                        className="w-full pl-10 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none focus:bg-white transition-all"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Checklist Configuration */}
          <div>
            <h3 className="font-bold text-slate-800 flex items-center text-lg mb-4 px-1">
              <ClipboardCheck className="w-5 h-5 mr-2 text-slate-500" />
              {t('checkItemsConfig')}
            </h3>

            {renderCategorySection('visual', <Eye className="w-5 h-5 text-blue-500" />, t('visualCheck'))}
            {renderCategorySection('performance', <Gauge className="w-5 h-5 text-orange-500" />, t('performanceCheck'))}
            {renderCategorySection('comprehensive', <ClipboardCheck className="w-5 h-5 text-purple-500" />, t('comprehensiveCheck'))}
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