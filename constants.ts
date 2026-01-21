import { EquipmentType } from './types';

export const THEME_COLORS = {
  // 主要漸層色系
  primary: '#8B5CF6', // Violet 500
  secondary: '#A855F7', // Purple 500
  accent: '#D946EF', // Fuchsia 500
  headerBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Purple gradient
  
  // 基礎色
  dark: '#1e293b', // Slate 800
  light: '#f8fafc',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  
  // 設備專屬漸層
  gradients: {
    hero: 'from-violet-500 via-purple-500 to-fuchsia-500',
    extinguisher: 'from-red-500 to-rose-600',
    hydrant: 'from-blue-500 to-cyan-600',
    alarm: 'from-orange-500 to-amber-600',
    light: 'from-yellow-400 to-amber-500',
    exit: 'from-green-500 to-emerald-600',
    sprinkler: 'from-cyan-500 to-blue-600',
    action1: 'from-violet-500 to-purple-600',
    action2: 'from-blue-500 to-indigo-600',
    action3: 'from-rose-500 to-pink-600',
    action4: 'from-amber-500 to-orange-600',
    action5: 'from-teal-500 to-cyan-600',
    action6: 'from-slate-600 to-slate-700',
  }
};

export const CHECKLIST_TEMPLATES: Record<EquipmentType, string[]> = {
  [EquipmentType.Extinguisher]: ['外觀無鏽蝕', '壓力指針在綠色範圍', '皮管無龜裂', '掛鉤/箱體固定良好'],
  [EquipmentType.Hydrant]: ['箱門開關正常', '水帶無發霉破損', '瞄子存在', '指示燈亮起'],
  [EquipmentType.Alarm]: ['探測器無遮蔽', '手動報警機功能正常', '受信總機燈號正常'],
  [EquipmentType.Light]: ['外觀無破損', '充電燈號正常', '測試按鈕功能正常'],
  [EquipmentType.ExitSign]: ['燈具常亮', '面板清晰無破損', '方向指示正確'],
  [EquipmentType.Sprinkler]: ['撒水頭無油漆/遮蔽', '末端查驗管壓力正常', '幫浦功能正常'],
  [EquipmentType.Custom]: []
};

export const EQUIPMENT_HIERARCHY = {
  '滅火設備': {
    '滅火器': ['乾粉滅火器', '強化液滅火器', '二氧化碳滅火器', '機械泡沫滅火器', '潔淨滅火器 (海龍替代品)', '自定義'],
    '消防砂': ['乾燥砂', '膨脹蛭石', '膨脹珍珠岩', '自定義'],
    '室內消防栓': ['第一種消防栓', '第二種消防栓', '自定義'],
    '室外消防栓': ['地上式', '地下式', '單口消防栓', '雙口消防栓', '抗凍型消防栓', '不鏽鋼消防栓', '自定義'],
    '自動撒水設備': ['密閉式自動撒水設備', '開放式自動撒水設備', '濕式自動撒水設備', '乾式自動撒水設備', '預動式自動撒水設備', '水道連結型自動撒水設備', '放水型自動撒水設備', '細水霧滅火設備', '自定義'],
    '氣體/化學系統': ['泡沫滅火設備', '二氧化碳滅火設備', '乾粉滅火設備', '鹵化烴滅火設備', '惰性氣體滅火設備', '自定義'],
    '特殊設備': ['水霧滅火設備', '簡易自動滅火設備', '自定義'],
    '自定義': []
  },
  '警報設備': {
    '偵測系統': ['火警自動警報設備', '瓦斯漏氣火警自動警報設備', '自定義'],
    '通報工具': ['手動報警設備', '緊急廣播設備(主機)', '緊急廣播設備(副機)', '119火災通報裝置', '自定義'],
    '自定義': []
  },
  '避難逃生設備': {
    '標示設備': ['出口標示燈', '避難方向指示燈', '避難指標', '觀眾席引導燈', '自定義'],
    '避難器具': ['緩降機', '避難梯', '救助袋', '避難繩索', '滑台', '避難橋', '滑桿', '自定義'],
    '照明設備': ['壁掛', '吸頂式', '崁頂式 (嵌入式)', '手提', '便攜式', '自定義'],
    '自定義': []
  },
  '消防搶救必要設備': {
    '供水系統': ['連結送水管', '消防專用蓄水池', '撒水口', '自定義'],
    '排煙系統': ['自然排煙', '機械排煙', '自定義'],
    '電源與通訊': ['緊急電源設備 (發電機)', '緊急供電插座', '蓄電池設備', '自定義'],
    '自定義': []
  },
  '自定義': { '自定義': [] }
};