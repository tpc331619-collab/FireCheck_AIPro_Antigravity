import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Eye, Gauge, ClipboardCheck, LayoutList, Download, QrCode, CalendarClock, Calendar, CheckCircle } from 'lucide-react';
import { THEME_COLORS } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { EquipmentDefinition, CheckCategory, CheckInputType, CustomCheckItem, UserProfile } from '../types';
import { StorageService } from '../services/storageService';
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
      const d = new Date();
      setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
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
              <div key={item.id} className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 items-start sm:items-center">
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
                    {item.inputType === 'number' && (
                       <input 
                        type="text" 
                        value={item.unit || ''}
                        onChange={(e) => updateCheckItem(item.id, { unit: e.target.value })}
                        placeholder={t('unit')}
                        className="w-20 p-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-red-500 focus:outline-none"
                      />
                    )}
                    <button 
                      onClick={() => deleteCheckItem(item.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
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
            {isSaving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"/> : <Save className="w-4 h-4 mr-2" />}
            {initialData ? t('updateEquipment') : t('saveEquipment')}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
         <div className="max-w-3xl mx-auto space-y-6">
            
            {/* Basic Info */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
               <h3 className="font-bold text-slate-800 flex items-center text-lg mb-2">
                 <LayoutList className="w-5 h-5 mr-2 text-slate-500" />
                 基本資料
               </h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">{t('siteName')} <span className="text-red-500">*</span></label>
                     <input 
                        type="text" 
                        value={siteName}
                        onChange={e => setSiteName(e.target.value)}
                        placeholder={t('enterSiteName')}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:bg-white transition-colors"
                     />
                  </div>
                   <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">{t('buildingName')} <span className="text-red-500">*</span></label>
                     <input 
                        type="text" 
                        value={buildingName}
                        onChange={e => setBuildingName(e.target.value)}
                        placeholder={t('enterBuildingName')}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:bg-white transition-colors"
                     />
                  </div>
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">{t('equipmentName')} <span className="text-red-500">*</span></label>
                     <input 
                        type="text" 
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={t('enterEquipmentName')}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:bg-white transition-colors"
                     />
                  </div>
                   <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">{t('equipmentId')} <span className="text-red-500">*</span></label>
                     
                     <div className="flex gap-4 items-start">
                         <div className="flex-1">
                            <input 
                                type="text" 
                                value={barcode}
                                onChange={e => setBarcode(e.target.value)}
                                placeholder={t('enterBarcode')}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:bg-white transition-colors"
                            />
                            {barcode && <div className="text-[10px] text-slate-400 mt-1.5 flex items-center pl-1"><QrCode className="w-3 h-3 mr-1"/> 系統已自動產生對應條碼</div>}
                         </div>
                         
                         {qrCodeUrl && (
                             <div className="relative group shrink-0 animate-in fade-in zoom-in duration-300">
                                 <div className="bg-white p-2 rounded-xl border-2 border-slate-100 shadow-sm group-hover:border-blue-200 transition-colors">
                                     <img src={qrCodeUrl} alt="QR Code" className="w-20 h-20 object-contain" />
                                 </div>
                                 <button 
                                    onClick={handleDownloadQr}
                                    className="absolute -bottom-3 -right-3 bg-slate-800 text-white p-2 rounded-full shadow-lg hover:bg-blue-600 hover:scale-110 transition-all flex items-center justify-center border-2 border-white"
                                    title={t('downloadQrCode')}
                                 >
                                     <Download className="w-4 h-4" />
                                 </button>
                             </div>
                         )}
                     </div>
                  </div>

                  {/* Frequency Selection */}
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                        <CalendarClock className="w-3.5 h-3.5 mr-1" />
                        {t('checkFrequency')}
                     </label>
                     <div className="flex flex-col sm:flex-row gap-3">
                         <select 
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value)}
                            className="w-full sm:w-1/2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:bg-white transition-colors cursor-pointer"
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
                                placeholder={t('enterCustomFrequency')}
                                className="w-full sm:w-1/2 p-3 bg-white border border-red-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none animate-in fade-in slide-in-from-left-2 duration-200"
                            />
                         )}
                     </div>
                  </div>

                  {/* Start Date Selection - New */}
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        {t('checkStartDate')}
                     </label>
                     <input 
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:outline-none focus:bg-white transition-colors"
                     />
                  </div>
               </div>
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
  );
};

export default EquipmentManager;