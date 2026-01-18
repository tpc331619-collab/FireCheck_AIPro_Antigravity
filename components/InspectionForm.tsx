import React, { useState } from 'react';
import { EquipmentType, InspectionItem, InspectionReport, InspectionStatus, UserProfile } from '../types';
import { CHECKLIST_TEMPLATES, THEME_COLORS } from '../constants';
import { ArrowLeft, Save, Sparkles, AlertCircle, Check, Camera, Trash2, Cpu, Plus } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { StorageService } from '../services/storageService';
import { useLanguage } from '../contexts/LanguageContext';

interface InspectionFormProps {
  report?: InspectionReport;
  user: UserProfile;
  onBack: () => void;
  onSaved: () => void;
}

const InspectionForm: React.FC<InspectionFormProps> = ({ report: initialReport, user, onBack, onSaved }) => {
  const { t } = useLanguage();
  const [buildingName, setBuildingName] = useState(initialReport?.buildingName || '');
  const [items, setItems] = useState<InspectionItem[]>(initialReport?.items || []);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New Item State
  const [newItemType, setNewItemType] = useState<EquipmentType>(EquipmentType.Extinguisher);
  const [newItemLocation, setNewItemLocation] = useState('');

  // AI Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [currentItemForAI, setCurrentItemForAI] = useState<InspectionItem | null>(null);

  const addNewItem = () => {
    if (!newItemLocation) return alert(t('location'));

    const newItem: InspectionItem = {
      id: Date.now().toString(),
      type: newItemType,
      location: newItemLocation,
      status: InspectionStatus.Pending,
      checkPoints: CHECKLIST_TEMPLATES[newItemType].reduce((acc, curr) => ({ ...acc, [curr]: false }), {}),
      notes: '',
      lastUpdated: Date.now()
    };

    setItems([newItem, ...items]);
    setNewItemLocation('');
  };

  const updateItem = (id: string, updates: Partial<InspectionItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates, lastUpdated: Date.now() } : item));
  };

  const deleteItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleAIAnalysis = async (item: InspectionItem) => {
    setCurrentItemForAI(item);
    setAiModalOpen(true);
    setAiResult('正在連線至 FireCheck AI 分析中...');
    setIsAnalyzing(true);

    const result = await GeminiService.analyzeDeficiency(item);
    setAiResult(result);
    setIsAnalyzing(false);
  };

  const handleSaveReport = async () => {
    if (!buildingName) return alert(t('buildingName'));
    if (items.length === 0) return alert(t('addInspectionItem'));

    setIsSaving(true);

    const hasAbnormal = items.some(i => i.status === InspectionStatus.Abnormal);
    const overallStatus = hasAbnormal ? 'Fail' : 'Pass';

    // Auto-generate summary if fail
    let aiSummary = initialReport?.aiSummary;
    if (overallStatus === 'Fail' && !aiSummary && process.env.API_KEY) {
      aiSummary = await GeminiService.generateReportSummary(items);
    }

    const reportData: InspectionReport = {
      id: initialReport?.id || '', // Will be ignored on create
      buildingName,
      inspectorName: user.displayName || t('guest'),
      date: initialReport?.date || Date.now(),
      items,
      overallStatus,
      aiSummary
    };

    try {
      if (initialReport) {
        await StorageService.updateReport(reportData);
      } else {
        await StorageService.saveReport(reportData, user.uid);
      }
      onSaved();
    } catch (e) {
      console.error(e);
      alert('儲存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="font-bold text-lg text-slate-800 leading-tight">{initialReport ? t('editReport') : t('newReport')}</h1>
              <p className="text-xs text-slate-500 hidden sm:block">{user.displayName} • {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          <button
            onClick={handleSaveReport}
            disabled={isSaving}
            className="flex items-center text-sm font-bold px-4 py-2 rounded-lg text-white shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: THEME_COLORS.primary }}
          >
            {isSaving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {t('saveReport')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Top Section: Responsive Grid for Info and Add Action */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">{t('buildingName')}</label>
              <input
                type="text"
                value={buildingName}
                onChange={e => setBuildingName(e.target.value)}
                placeholder="例如：台北101大樓"
                className="w-full text-xl font-bold text-slate-900 border-b-2 border-slate-200 focus:border-red-600 focus:outline-none py-2 bg-transparent transition-colors placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* Add New Equipment */}
            <div className="bg-slate-800 text-white p-5 rounded-2xl shadow-lg flex flex-col justify-center">
              <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider flex items-center">
                <Plus className="w-4 h-4 mr-1" /> {t('addInspectionItem')}
              </h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value as EquipmentType)}
                  className="bg-slate-50 text-slate-900 rounded-lg p-2.5 flex-1 text-sm border border-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all cursor-pointer"
                >
                  {Object.values(EquipmentType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="text"
                  value={newItemLocation}
                  onChange={(e) => setNewItemLocation(e.target.value)}
                  placeholder={`${t('location')} (如: 1F大廳)`}
                  className="bg-slate-50 text-slate-900 rounded-lg p-2.5 flex-[1.5] text-sm border border-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                />
                <button
                  onClick={addNewItem}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap shadow-lg shadow-red-900/20"
                >
                  {t('add')}
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 my-2"></div>

          {/* List Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-lg">
              {t('inspectionList')} <span className="text-slate-400 text-sm font-normal ml-2">({items.length})</span>
            </h3>
          </div>

          {/* List - Responsive Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-300 flex flex-col">
                <div className="flex justify-between items-center p-3 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-800">{item.type}</span>
                    <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full text-nowrap shadow-sm">{item.location}</span>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-4 flex-1 flex flex-col">
                  {/* Status Toggle */}
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    {[InspectionStatus.Normal, InspectionStatus.Abnormal].map((status) => (
                      <button
                        key={status}
                        onClick={() => updateItem(item.id, { status })}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${item.status === status
                          ? (status === InspectionStatus.Normal ? 'bg-white text-green-700 shadow ring-1 ring-green-200' : 'bg-white text-red-700 shadow ring-1 ring-red-200')
                          : 'text-slate-500 hover:bg-slate-200'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  {/* Checklist */}
                  <div className="space-y-2 flex-1">
                    {Object.keys(item.checkPoints).map((point) => (
                      <label key={point} className="flex items-start space-x-3 cursor-pointer group">
                        <div className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${item.checkPoints[point] ? 'bg-green-500 border-green-500' : 'border-slate-300 group-hover:border-slate-400'}`}>
                          {!!item.checkPoints[point] && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={!!item.checkPoints[point]}
                          onChange={(e) => {
                            const newCheckPoints = { ...item.checkPoints, [point]: e.target.checked };
                            updateItem(item.id, { checkPoints: newCheckPoints });
                          }}
                        />
                        <span className={`text-sm transition-colors ${item.checkPoints[point] ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{point}</span>
                      </label>
                    ))}
                  </div>

                  {/* Notes & AI */}
                  <div>
                    <div className="relative group">
                      <textarea
                        value={item.notes}
                        onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                        placeholder="缺失備註說明..."
                        className="w-full text-sm text-slate-900 p-3 rounded-lg border border-slate-200 focus:border-red-500 focus:ring-1 focus:ring-red-200 outline-none min-h-[80px] bg-slate-50 focus:bg-white transition-all resize-none"
                      />
                      {item.notes.length > 5 && (
                        <button
                          onClick={() => handleAIAnalysis(item)}
                          className="absolute bottom-2 right-2 bg-indigo-600 text-white text-xs px-2.5 py-1.5 rounded-md flex items-center shadow-md hover:bg-indigo-500 transition-all opacity-90 hover:opacity-100 hover:scale-105"
                        >
                          <Sparkles className="w-3 h-3 mr-1.5" />
                          {t('aiAnalysis')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Photo Placeholder */}
                  <button className="w-full border-2 border-dashed border-slate-200 rounded-lg p-2.5 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-600 transition-all">
                    <Camera className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">{t('takePhoto')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm transition-all">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[85vh]">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center">
                <div className="p-2 bg-white/20 rounded-lg mr-3">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">AI 智能查檢助手</h3>
                  <p className="text-xs text-indigo-100 opacity-80">Powered by Google Gemini</p>
                </div>
              </div>
              <button onClick={() => setAiModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors">✕</button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-6">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-100 border-t-indigo-600"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-indigo-600" />
                    </div>
                  </div>
                  <p className="text-center text-slate-500 font-medium">正在分析消防法規與缺失風險...</p>
                </div>
              ) : (
                <div className="prose prose-sm prose-indigo max-w-none">
                  <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wide">查檢項目: {currentItemForAI?.type} - {currentItemForAI?.location}</p>
                      <p className="text-slate-800 font-medium">{currentItemForAI?.notes}</p>
                    </div>
                  </div>
                  <div className="whitespace-pre-line text-slate-700 leading-relaxed text-base">
                    {aiResult}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0 gap-3">
              <button
                onClick={() => setAiModalOpen(false)}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              >
                {t('close')}
              </button>
              {!isAnalyzing && (
                <button
                  onClick={() => {
                    if (currentItemForAI) {
                      const newNotes = currentItemForAI.notes + "\n\n[AI建議]: " + aiResult;
                      updateItem(currentItemForAI.id, { notes: newNotes });
                      setAiModalOpen(false);
                    }
                  }}
                  className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all active:scale-95"
                >
                  加入分析至備註
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionForm;