export enum EquipmentType {
  Extinguisher = '滅火器',
  Hydrant = '室內消防栓',
  Alarm = '火警自動警報設備',
  Light = '緊急照明燈',
  ExitSign = '出口標示燈',
  Sprinkler = '自動撒水設備',
  Custom = '自定義設備'
}

export enum InspectionStatus {
  Pending = '待查檢',
  Normal = '正常',
  Abnormal = '異常',
  Fixed = '已改善'
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isGuest: boolean;
}

export interface InspectionItem {
  id: string;
  type: EquipmentType | string; // Allow custom strings
  location: string;
  status: InspectionStatus;
  checkPoints: { [key: string]: boolean | number }; // Support numbers
  notes: string;
  photoUrl?: string;
  lastUpdated: number;
}

export interface InspectionReport {
  id: string;
  buildingName: string;
  inspectorName: string;
  date: number;
  items: InspectionItem[];
  overallStatus: 'Pass' | 'Fail' | 'In Progress';
  aiSummary?: string;
}

export type AuthMode = 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD';

export type LanguageCode = 'zh-TW' | 'en' | 'ko' | 'ja';

// --- New Types for Equipment Manager ---

export type CheckCategory = 'visual' | 'performance' | 'comprehensive';
export type CheckInputType = 'boolean' | 'number';

export interface CustomCheckItem {
  id: string;
  name: string;
  category: CheckCategory;
  inputType: CheckInputType;
  unit?: string; // e.g., 'kg', 'Mpa' for numbers

  // Numeric Thresholds
  thresholdMode?: 'range' | 'gt' | 'gte' | 'lt' | 'lte';
  val1?: number; // Primary value (Min for range, or the threshold)
  val2?: number; // Secondary value (Max for range)
}

export interface EquipmentDefinition {
  id: string;
  userId?: string;       // 記錄建立者 ID
  siteName: string;      // 新增場所名稱
  buildingName: string;  // 新增建築物名稱
  name: string;          // 新增設備名稱
  barcode: string;       // 新增設備編號
  checkFrequency?: string; // 新增檢查頻率
  checkStartDate?: number; // 新增檢查起算日期
  lastInspectedDate?: number; // 最後一次檢查日期
  notificationEmails?: string[]; // 通知信箱 (最多3組)
  checkItems: CustomCheckItem[]; // 檢查項目列表
  updatedAt: number;
  createdAt?: number;    // 建立時間
}