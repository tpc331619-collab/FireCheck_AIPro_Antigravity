import { InspectionReport, InspectionItem, EquipmentDefinition, EquipmentHierarchy, DeclarationSettings, EquipmentMap } from '../types';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from 'firebase/storage';

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

  async updateEquipmentDefinition(def: Partial<EquipmentDefinition> & { id: string }): Promise<void> {
    const { id, ...dataToUpdate } = def;

    if (this.isGuest || !db) {
      const dataStr = localStorage.getItem(EQUIP_STORAGE_KEY);
      if (!dataStr) return;
      let defs: EquipmentDefinition[] = JSON.parse(dataStr);
      defs = defs.map(d => d.id === id ? { ...d, ...def } : d);
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

      // 1. Get the definition first to check for photoUrl
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as EquipmentDefinition;
        if (data.photoUrl) {
          try {
            await this.deleteEquipmentPhoto(data.photoUrl);
          } catch (err) {
            console.warn("[StorageService] Failed to cleanup photo during delete:", err);
          }
        }
      }

      // 2. Delete the document
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
  },

  async getDeclarationSettings(userId: string): Promise<DeclarationSettings | null> {
    const SETTINGS_KEY = `declaration_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : null;
    } else {
      try {
        const docRef = doc(db, 'settings', `declaration_${userId}`);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          return snapshot.data() as DeclarationSettings;
        }
        return null;
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          const data = localStorage.getItem(SETTINGS_KEY);
          return data ? JSON.parse(data) : null;
        }
        console.error("Fetch declaration settings error", e);
        return null;
      }
    }
  },

  async saveDeclarationSettings(settings: DeclarationSettings, userId: string): Promise<void> {
    const SETTINGS_KEY = `declaration_${userId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } else {
      try {
        const docRef = doc(db, 'settings', `declaration_${userId}`);
        await setDoc(docRef, settings);
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          return;
        }
        console.error("Save declaration settings error", e);
        throw e;
      }
    }
  },

  async getNotificationSettings(userId: string): Promise<string[] | null> {
    const KEY = `notifications_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      return data ? JSON.parse(data) : [];
    } else {
      try {
        const docRef = doc(db, 'settings', `notifications_${userId}`);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          return snapshot.data().emails as string[];
        }
        return [];
      } catch (e: any) {
        console.error("Fetch notification settings error", e);
        const data = localStorage.getItem(KEY);
        return data ? JSON.parse(data) : [];
      }
    }
  },

  async saveNotificationSettings(emails: string[], userId: string): Promise<void> {
    const KEY = `notifications_${userId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(KEY, JSON.stringify(emails));
    } else {
      try {
        const docRef = doc(db, 'settings', `notifications_${userId}`);
        await setDoc(docRef, { emails });
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          localStorage.setItem(KEY, JSON.stringify(emails));
          return;
        }
        console.error("Save notification settings error", e);
        throw e;
      }
    }
  },

  // --- Equipment Map Methods ---

  async getEquipmentMaps(userId: string): Promise<EquipmentMap[]> {
    const KEY = `maps_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      return data ? JSON.parse(data) : [];
    } else {
      try {
        const q = query(collection(db, 'maps'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as EquipmentMap));
      } catch (e) {
        console.error("Fetch maps error", e);
        const data = localStorage.getItem(KEY);
        return data ? JSON.parse(data) : [];
      }
    }
  },

  async saveEquipmentMap(mapData: Omit<EquipmentMap, 'id'>, userId: string): Promise<string> {
    const KEY = `maps_${userId}`;
    const newMap = { ...mapData, userId, updatedAt: Date.now() };

    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      const maps: EquipmentMap[] = data ? JSON.parse(data) : [];
      const id = 'local_map_' + Date.now();
      maps.push({ ...newMap, id });
      localStorage.setItem(KEY, JSON.stringify(maps));
      return id;
    } else {
      try {
        const docRef = await addDoc(collection(db, 'maps'), newMap);
        return docRef.id;
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          const data = localStorage.getItem(KEY);
          const maps: EquipmentMap[] = data ? JSON.parse(data) : [];
          const id = 'local_map_' + Date.now();
          maps.push({ ...newMap, id });
          localStorage.setItem(KEY, JSON.stringify(maps));
          return id;
        }
        console.error("Save map error", e);
        throw e;
      }
    }
  },

  async updateEquipmentMap(map: EquipmentMap): Promise<void> {
    const KEY = `maps_${map.userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      if (!data) return;
      const maps: EquipmentMap[] = JSON.parse(data);
      const updatedMaps = maps.map(m => m.id === map.id ? map : m);
      localStorage.setItem(KEY, JSON.stringify(updatedMaps));
    } else {
      try {
        if (map.id.startsWith('local_')) {
          const data = localStorage.getItem(KEY);
          if (data) {
            const maps: EquipmentMap[] = JSON.parse(data);
            const updatedMaps = maps.map(m => m.id === map.id ? map : m);
            localStorage.setItem(KEY, JSON.stringify(updatedMaps));
          }
          return;
        }

        const docRef = doc(db, 'maps', map.id);
        await setDoc(docRef, map, { merge: true });
      } catch (e: any) {
        console.error("Update map error", e);
        const data = localStorage.getItem(KEY);
        if (data) {
          const maps: EquipmentMap[] = JSON.parse(data);
          const existsLocally = maps.find(m => m.id === map.id);
          if (existsLocally) {
            const updatedMaps = maps.map(m => m.id === map.id ? map : m);
            localStorage.setItem(KEY, JSON.stringify(updatedMaps));
          }
        }
      }
    }
  },

  async deleteEquipmentMap(mapId: string, userId: string): Promise<void> {
    const KEY = `maps_${userId}`;
    const data = localStorage.getItem(KEY);
    if (data) {
      const maps: EquipmentMap[] = JSON.parse(data);
      const newMaps = maps.filter(m => m.id !== mapId);
      localStorage.setItem(KEY, JSON.stringify(newMaps));
    }

    if (!this.isGuest && db && !mapId.startsWith('local_')) {
      try {
        const mapRef = doc(db, 'maps', mapId);

        // 1. Get the map data first to find the image URL
        const mapSnap = await getDoc(mapRef);
        if (mapSnap.exists()) {
          const mapData = mapSnap.data() as EquipmentMap;

          if (mapData.imageUrl && mapData.imageUrl.includes('firebasestorage')) {
            try {
              // 2. Delete the image from Storage
              const imageRef = ref(storage, mapData.imageUrl);
              await deleteObject(imageRef);
              console.log(`[Storage] Deleted image for map ${mapId}`);
            } catch (err) {
              console.warn("[Storage] Failed to delete image file:", err);
              // Continue to delete document even if image delete fails
            }
          }
        }

        // 3. Delete the document
        await deleteDoc(mapRef);
      } catch (e) {
        console.error("Delete map error", e);
      }
    }
  },

  async uploadMapImage(file: File, userId: string): Promise<string> {
    if (this.isGuest || !storage) {
      throw new Error("Guest mode cannot upload to Firebase Storage");
    }

    try {
      if (file.size > 1024 * 1024) {
        throw new Error("File size exceeds 1MB limit");
      }
      const timestamp = Date.now();
      const storageRef = ref(storage, `maps/${userId}/${timestamp}_${file.name}`);

      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (e) {
      console.error("Upload map image error", e);
      throw e;
    }
  },

  async uploadBlob(blob: Blob, filename: string, userId: string): Promise<string> {
    if (this.isGuest || !storage) throw new Error("Guest mode");
    try {
      if (blob.size > 1024 * 1024) {
        throw new Error("File size exceeds 1MB limit");
      }
      const timestamp = Date.now();
      const storageRef = ref(storage, `maps/${userId}/${timestamp}_${filename}`);
      const snapshot = await uploadBytes(storageRef, blob);
      return await getDownloadURL(snapshot.ref);
    } catch (e) {
      console.error("Upload blob error", e);
      throw e;
    }
  },

  async uploadEquipmentPhoto(file: File, userId: string): Promise<string> {
    if (this.isGuest || !storage) {
      throw new Error("Guest mode cannot upload to Firebase Storage");
    }

    try {
      if (file.size > 1024 * 1024) {
        throw new Error("File size exceeds 1MB limit");
      }
      const timestamp = Date.now();
      // Generate unique name to avoid collisions
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const storageRef = ref(storage, `equipments/${userId}/${timestamp}_${cleanFileName}`);

      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (e) {
      console.error("Upload equipment photo error", e);
      throw e;
    }
  },

  async deleteEquipmentPhoto(url: string): Promise<void> {
    if (this.isGuest || !storage || !url || !url.includes('firebasestorage')) return;
    try {
      const photoRef = ref(storage, url);
      await deleteObject(photoRef);
      console.log("[StorageService] Deleted storage object:", url);
    } catch (e) {
      console.error("[StorageService] Error deleting photo:", e);
      // Don't throw if file already gone
    }
  },

  async syncMapsFromStorage(userId: string): Promise<number> {
    if (this.isGuest || !storage || !db) return 0;

    try {
      // 1. Get all existing maps to avoid duplicates
      const existingMaps = await this.getEquipmentMaps(userId);
      const existingUrls = new Set(existingMaps.map(m => m.imageUrl));

      // 2. List all files in storage
      const listRef = ref(storage, `maps/${userId}`);
      const res = await listAll(listRef);

      let addedCount = 0;

      // 3. Check each file
      for (const itemRef of res.items) {
        const downloadURL = await getDownloadURL(itemRef);

        // Simple check: if URL already known, skip
        if (existingUrls.has(downloadURL)) continue;

        // 4. Create missing map
        const fullName = itemRef.name;
        const nameMatch = fullName.match(/^\d+_(.+)$/);
        const displayName = nameMatch ? nameMatch[1].split('.')[0] : fullName.split('.')[0];

        // Fetch metadata for size
        let fileSize = 0;
        try {
          const metadata = await getMetadata(itemRef);
          fileSize = metadata.size;
        } catch (err) {
          console.warn("Failed to get metadata for", fullName);
        }

        const newMap: Omit<EquipmentMap, 'id'> = {
          userId,
          name: displayName,
          imageUrl: downloadURL,
          markers: [],
          updatedAt: Date.now(),
          markerSize: 'medium',
          markerColor: 'red',
          size: fileSize
        };

        await addDoc(collection(db, 'maps'), newMap);
        addedCount++;
      }

      return addedCount;
    } catch (e) {
      console.error("Sync maps error", e);
      throw e;
    }
  },

  async getStorageFiles(userId: string) {
    if (this.isGuest || !storage) return [];
    try {
      const listRef = ref(storage, `maps/${userId}`);
      const res = await listAll(listRef);

      const filesPromise = res.items.map(async (itemRef) => {
        const metadata = await getMetadata(itemRef);
        const url = await getDownloadURL(itemRef);
        return {
          name: itemRef.name,
          fullPath: itemRef.fullPath,
          size: metadata.size,
          timeCreated: metadata.timeCreated,
          url: url
        };
      });

      return Promise.all(filesPromise);
    } catch (e) {
      console.error("Get storage files error", e);
      return [];
    }
  },

  async deleteStorageFile(fullPath: string) {
    if (this.isGuest || !storage) return;
    try {
      const fileRef = ref(storage, fullPath);
      await deleteObject(fileRef);
    } catch (e) {
      console.error("Delete storage file error", e);
      throw e;
    }
  }
};