import { InspectionReport, InspectionItem, EquipmentDefinition, EquipmentHierarchy } from '../types';
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';

const LOCAL_STORAGE_KEY = 'firecheck_reports';
const EQUIP_STORAGE_KEY = 'firecheck_equipments';

// 預設集合名稱
const DB_COLLECTION = 'equipments';

export const StorageService = {
  isGuest: false,

  setGuestMode(enabled: boolean) {
    this.isGuest = enabled;
  },

  async getReports(userId: string): Promise<InspectionReport[]> {
    if (this.isGuest || !db) {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!data) return [];
      const reports: InspectionReport[] = JSON.parse(data);
      return reports.sort((a, b) => b.date - a.date);
    } else {
      try {
        const q = query(collection(db, 'reports'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const reports = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as InspectionReport));
        return reports.sort((a, b) => b.date - a.date);
      } catch (e) {
        console.error("Firebase fetch error", e);
        return [];
      }
    }
  },

  async saveReport(report: Omit<InspectionReport, 'id'>, userId: string): Promise<string> {
    const newReport = { ...report, userId };

    if (this.isGuest || !db) {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      const reports: InspectionReport[] = data ? JSON.parse(data) : [];
      const id = 'local_' + Date.now().toString();
      const reportWithId = { ...newReport, id };
      reports.unshift(reportWithId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
      return id;
    } else {
      try {
        const docRef = await addDoc(collection(db, 'reports'), newReport);
        return docRef.id;
      } catch (e) {
        console.error("Firebase save error", e);
        throw e;
      }
    }
  },

  async updateReport(report: InspectionReport): Promise<void> {
    const { id, ...data } = report;
    if (this.isGuest || !db) {
      const dataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!dataStr) return;
      let reports: InspectionReport[] = JSON.parse(dataStr);
      reports = reports.map(r => r.id === report.id ? report : r);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
    } else {
      try {
        const reportRef = doc(db, 'reports', id);
        await updateDoc(reportRef, data);
      } catch (e) {
        console.error("Firebase update error", e);
        throw e;
      }
    }
  },

  // --- Equipment Definition Methods ---

  async saveEquipmentDefinition(def: EquipmentDefinition, userId: string): Promise<string> {
    const { id, ...dataToSave } = def;
    const newDef = { ...dataToSave, userId };

    if (this.isGuest || !db) {
      const data = localStorage.getItem(EQUIP_STORAGE_KEY);
      const defs: EquipmentDefinition[] = data ? JSON.parse(data) : [];
      const localId = 'local_' + Date.now().toString();
      const defWithId = { ...newDef, id: localId } as EquipmentDefinition;
      defs.push(defWithId);
      localStorage.setItem(EQUIP_STORAGE_KEY, JSON.stringify(defs));
      return localId;
    } else {
      try {
        const docRef = await addDoc(collection(db, DB_COLLECTION), newDef);
        return docRef.id;
      } catch (e) {
        console.error("Equipment save error", e);
        throw e;
      }
    }
  },

  async updateEquipmentDefinition(def: EquipmentDefinition): Promise<void> {
    const { id, ...dataToUpdate } = def;

    if (this.isGuest || !db) {
      const dataStr = localStorage.getItem(EQUIP_STORAGE_KEY);
      if (!dataStr) return;
      let defs: EquipmentDefinition[] = JSON.parse(dataStr);
      defs = defs.map(d => d.id === id ? def : d);
      localStorage.setItem(EQUIP_STORAGE_KEY, JSON.stringify(defs));
    } else {
      try {
        if (!db) throw new Error("Database not connected");
        const equipRef = doc(db, DB_COLLECTION, id);
        await setDoc(equipRef, dataToUpdate, { merge: true });
      } catch (e) {
        console.error("Equipment update error", e);
        throw e;
      }
    }
  },

  async deleteEquipmentDefinition(id: string): Promise<void> {
    const cleanId = id.trim();
    if (!cleanId) throw new Error("ID is required");

    if (this.isGuest || !db) {
      // Local Storage Logic
      const data = localStorage.getItem(EQUIP_STORAGE_KEY);
      if (!data) return;
      const defs: EquipmentDefinition[] = JSON.parse(data);
      const newDefs = defs.filter(d => d.id !== cleanId);
      localStorage.setItem(EQUIP_STORAGE_KEY, JSON.stringify(newDefs));
      return;
    }

    // Firestore Logic:
    try {
      console.log(`[StorageService] Delete operation for ${cleanId} from ${DB_COLLECTION}...`);

      if (!db) throw new Error("Firestore not initialized");

      const docRef = doc(db, DB_COLLECTION, cleanId);
      await deleteDoc(docRef);

      console.log(`[StorageService] Successfully deleted ${cleanId}.`);
    } catch (e) {
      console.error("Equipment delete error (Firebase)", e);
      throw e;
    }
  },

  async getEquipmentDefinitions(userId: string): Promise<EquipmentDefinition[]> {
    if (this.isGuest || !db) {
      const dataStr = localStorage.getItem(EQUIP_STORAGE_KEY);
      if (!dataStr) return [];
      const defs: EquipmentDefinition[] = JSON.parse(dataStr);
      return defs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } else {
      try {
        // 主要從 'equipments' 讀取
        const q = query(collection(db, DB_COLLECTION), where('userId', '==', userId));
        const snapshot = await getDocs(q);

        const results = snapshot.docs.map(snapshotDoc => {
          const data = snapshotDoc.data();
          // 剔除資料內部的 id，強制使用 document key
          const { id: _, ...cleanData } = data as any;
          return {
            ...cleanData,
            id: snapshotDoc.id
          } as EquipmentDefinition;
        });

        return results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      } catch (e) {
        console.error("Firebase fetch equipment error", e);
        return [];
      }
    }
  },

  // --- Hierarchy Methods ---

  async getEquipmentHierarchy(userId: string): Promise<EquipmentHierarchy | null> {
    const HIERARCHY_KEY = `hierarchy_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(HIERARCHY_KEY);
      return data ? JSON.parse(data) : null;
    } else {
      try {
        const docRef = doc(db, 'hierarchies', userId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          return snapshot.data() as EquipmentHierarchy;
        }
        return null;
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          const data = localStorage.getItem(HIERARCHY_KEY);
          return data ? JSON.parse(data) : null;
        }
        console.error("Fetch hierarchy error", e);
        return null;
      }
    }
  },

  async saveEquipmentHierarchy(hierarchy: EquipmentHierarchy, userId: string): Promise<void> {
    const HIERARCHY_KEY = `hierarchy_${userId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(HIERARCHY_KEY, JSON.stringify(hierarchy));
    } else {
      try {
        const docRef = doc(db, 'hierarchies', userId);
        await setDoc(docRef, hierarchy);
      } catch (e: any) {
        console.error("Save hierarchy error", e);

        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          localStorage.setItem(HIERARCHY_KEY, JSON.stringify(hierarchy));
          return; // Treated as success (local only)
        }

        if (e instanceof Error) {
          console.error("Error details:", e.message);
        }
        throw e;
      }
    }
  }
};