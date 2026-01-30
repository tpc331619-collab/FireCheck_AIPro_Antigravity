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
  equipmentId?: string; // Link to original equipment
  type: EquipmentType | string; // Allow custom strings
  name?: string; // Snapshot of equipment name
  barcode?: string; // Snapshot of barcode
  checkFrequency?: string; // Snapshot of frequency
  location: string;
  status: InspectionStatus;
  checkPoints: { [key: string]: boolean | number }; // Support numbers
  checkResults?: { name: string; value: any; threshold?: string; unit?: string }[]; // Snapshot of detailed check results
  notes: string;
  photoUrl?: string;
  lastUpdated: number;
  repairDate?: number;
  repairNotes?: string;
  abnormalItems?: string[]; // List of original abnormal items (preserved even after repair)
  inspectionDate?: number; // Original inspection/discovery date
}

export interface InspectionStats {
  total: number;
  passed: number;
  failed: number;
  fixed: number;
  others: number;
}

export interface InspectionReport {
  id: string;
  buildingName: string;
  inspectorName: string;
  date: number;
  items?: InspectionItem[]; // Optional: Loaded on demand or if legacy data
  stats?: InspectionStats;  // New: Summary statistics for the report
  overallStatus: 'Pass' | 'Fail' | 'In Progress';
  aiSummary?: string;
  archived?: boolean; // Auto-archive normal inspections to history
  userId?: string;    // Added for clarity, though handled by service logic
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
// 設備階層結構: Category -> Type[] (2 levels)
export type EquipmentHierarchy = Record<string, string[]>;

// 消防申報設定
export interface DeclarationSettings {
  nextDate: string;
  cycle?: '6_MONTHS' | '1_YEAR'; // Removed 'CUSTOM'
  lastModified: number;
  emailNotificationsEnabled: boolean;
  emailRecipients: string[];
}

export interface NotificationSettings {
  emails: string[];
}

export interface EquipmentMarker {
  id: string; // Unique marker ID
  equipmentId: string; // Linked equipment ID (can be empty initially)
  x: number; // Percentage (0-100)
  y: number; // Percentage (0-100)
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | number;
  color?: string;
}

export interface EquipmentMap {
  id: string;
  userId: string;
  name: string;
  imageUrl: string; // Base64 or URL
  markers: EquipmentMarker[];
  rotation?: number; // 0, 90, 180, 270
  markerSize?: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | number;
  markerColor?: string; // e.g. 'red', 'blue', 'green'
  updatedAt: number;
  size?: number; // File size in bytes
}

// 異常複檢記錄
export interface AbnormalRecord {
  id: string;
  userId: string;
  equipmentId: string;
  equipmentName: string;
  barcode?: string; // 設備編號
  siteName: string;
  buildingName: string;
  inspectionDate: number; // 發現異常的檢查日期
  abnormalItems: string[]; // 異常的項目列表
  abnormalReason: string; // 異常原因/內容
  status: 'pending' | 'fixed'; // 待複檢 | 已改善
  fixedDate?: number; // 修復時間
  fixedNotes?: string; // 修復情況
  fixedCategory?: string; // 修復類別 (快選項目)
  createdAt: number;
  updatedAt: number;
}

export interface LightSettings {
  red: { days: number; color: string };    // <= days
  yellow: { days: number; color: string }; // <= days
  green: { days: number; color: string };  // >= days
  completed?: { color: string }; // Custom color for 'Completed (Normal)'
  abnormal?: { color: string }; // Custom color for 'Abnormal'
}

export interface HealthIndicator {
  id: string;
  userId: string;
  buildingName: string;
  equipmentName: string;
  updatedAt: number;
  replacementDate?: string;
  lastPromptDismissed?: number;
}

export interface HealthHistoryRecord {
  id: string;
  indicatorId: string;
  userId: string;
  previousStartDate: string;
  previousEndDate: string;
  newStartDate: string;
  newEndDate: string;
  replacementDate: string;
  updatedAt: number;
}

export type NotificationType = 'profile' | 'health' | 'declaration' | 'abnormal' | 'lights';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface SystemSettings {
  allowGuestView: boolean;
  allowGuestRecheck?: boolean;
  publicDataUserId?: string; // ID of the user whose public data is public
}