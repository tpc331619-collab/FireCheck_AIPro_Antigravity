import { EquipmentType } from './types';

export const THEME_COLORS = {
  primary: '#CE2029', // Fire Engine Red
  secondary: '#FF5F00', // Safety Orange
  dark: '#1e293b', // Slate 800
  light: '#f8fafc',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444'
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