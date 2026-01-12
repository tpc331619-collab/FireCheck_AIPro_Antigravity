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
  lifespan?: string;       // 新增設備壽命
  customLifespan?: string; // 自訂壽命 (當 lifespan='custom')
  equipmentCategory?: string; // 設備大類
  equipmentType?: string;     // 設備中類
  equipmentDetail?: string;   // 設備細項
  lastInspectedDate?: number; // 最後一次檢查日期
  notificationEmails?: string[]; // 通知信箱 (最多3組)
  checkItems: CustomCheckItem[]; // 檢查項目列表
  updatedAt: number;
  createdAt?: number;    // 建立時間
  photoUrl?: string;     // 設備照片
}

// 設備階層結構
export type EquipmentHierarchy = Record<string, Record<string, string[]>>;

// 消防申報設定
export interface DeclarationSettings {
  month: number; // 1-12
  day: number;   // 1-31
}

export interface NotificationSettings {
  emails: string[];
}

export interface EquipmentMarker {
  id: string; // Unique marker ID
  equipmentId: string; // Linked equipment ID (can be empty initially)
  x: number; // Percentage (0-100)
  y: number; // Percentage (0-100)
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  color?: string;
}

export interface EquipmentMap {
  id: string;
  userId: string;
  name: string;
  imageUrl: string; // Base64 or URL
  markers: EquipmentMarker[];
  rotation?: number; // 0, 90, 180, 270
  markerSize?: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  markerColor?: string; // e.g. 'red', 'blue', 'green'
  updatedAt: number;
  size?: number; // File size in bytes
}