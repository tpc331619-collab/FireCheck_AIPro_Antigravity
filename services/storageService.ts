import { InspectionReport, InspectionItem, EquipmentDefinition, EquipmentHierarchy, DeclarationSettings, EquipmentMap, AbnormalRecord, InspectionStatus } from '../types';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
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
    // Separate items from report data
    const { items, ...reportData } = report;

    // Calculate stats
    const stats = {
      total: items?.length || 0,
      passed: items?.filter(i => i.status === InspectionStatus.Normal).length || 0,
      failed: items?.filter(i => i.status === InspectionStatus.Abnormal).length || 0,
      fixed: items?.filter(i => i.status === InspectionStatus.Fixed).length || 0,
      others: items?.filter(i => i.status !== InspectionStatus.Normal && i.status !== InspectionStatus.Abnormal && i.status !== InspectionStatus.Fixed).length || 0
    };

    // Prepare new report object (without items for Firestore main doc)
    const newReport = { ...reportData, userId, stats, items: [] }; // Explicitly set items to empty for main doc to avoid confusion, or omission
    // Actually, if we omit it, it's cleaner.
    const firestoreReport = { ...reportData, userId, stats };

    if (this.isGuest || !db) {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      const reports: InspectionReport[] = data ? JSON.parse(data) : [];
      const id = 'local_' + Date.now().toString();
      // For LocalStorage, we keep items embedded as there are no subcollections
      const reportWithId = { ...reportData, userId, stats, items, id };
      reports.unshift(reportWithId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
      return id;
    } else {
      try {
        // 1. Create Main Report Doc
        const reportRef = doc(collection(db, 'reports'));
        await setDoc(reportRef, firestoreReport);

        // 2. Add Items to Subcollection (Batch Write)
        if (items && items.length > 0) {
          const BATCH_SIZE = 450; // Firestore limit is 500, keep safety margin
          const chunks = [];
          for (let i = 0; i < items.length; i += BATCH_SIZE) {
            chunks.push(items.slice(i, i + BATCH_SIZE));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(item => {
              const itemRef = doc(collection(db, 'reports', reportRef.id, 'items'));
              batch.set(itemRef, item);
            });
            await batch.commit();
          }
        }

        return reportRef.id;
      } catch (e) {
        console.error("Firebase save error", e);
        throw e;
      }
    }
  },

  async getReportItems(reportId: string, userId: string): Promise<InspectionItem[]> {
    if (this.isGuest || !db) {
      const reports = await this.getReports(userId);
      const report = reports.find(r => r.id === reportId);
      return report?.items || [];
    } else {
      try {
        // 1. Try to fetch from subcollection
        const q = collection(db, 'reports', reportId, 'items');
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          return snapshot.docs.map(d => d.data() as InspectionItem);
        }

        // 2. Fallback: Check if main doc has items (Legacy Data)
        const reportRef = doc(db, 'reports', reportId);
        const reportSnap = await getDoc(reportRef);
        if (reportSnap.exists()) {
          const data = reportSnap.data() as InspectionReport;
          return data.items || [];
        }

        return [];
      } catch (e) {
        console.error("Fetch report items error", e);
        return [];
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

  async getEquipmentById(equipmentId: string, userId: string): Promise<EquipmentDefinition | null> {
    if (this.isGuest || !db) {
      const dataStr = localStorage.getItem(EQUIP_STORAGE_KEY);
      if (!dataStr) return null;
      const defs: EquipmentDefinition[] = JSON.parse(dataStr);
      return defs.find(d => d.id === equipmentId) || null;
    } else {
      try {
        const docRef = doc(db, DB_COLLECTION, equipmentId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          const { id: _, ...cleanData } = data as any;
          return {
            ...cleanData,
            id: snapshot.id
          } as EquipmentDefinition;
        }
        return null;
      } catch (e) {
        console.error("Firebase fetch equipment by ID error", e);
        return null;
      }
    }
  },

  // Alias for updateEquipmentDefinition
  async updateEquipment(def: Partial<EquipmentDefinition> & { id: string }): Promise<void> {
    return this.updateEquipmentDefinition(def);
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

  // Aliases for Map Sync Logic
  async getMaps(userId: string): Promise<EquipmentMap[]> {
    return this.getEquipmentMaps(userId);
  },

  async saveMap(mapData: EquipmentMap | Omit<EquipmentMap, 'id'>, userId: string): Promise<string> {
    if ('id' in mapData) {
      await this.updateEquipmentMap(mapData);
      return mapData.id;
    }
    return this.saveEquipmentMap(mapData, userId);
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
        throw e;
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

        // Only delete the Firestore document (marker data)
        // Keep the original image in Storage so user can re-select and re-annotate
        await deleteDoc(mapRef);
        console.log(`[Firestore] Deleted map document ${mapId}, image preserved in Storage`);
      } catch (e) {
        console.error("Delete map error", e);
        throw e;
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
  },

  // --- Abnormal Record Methods ---

  async saveAbnormalRecord(record: Omit<AbnormalRecord, 'id'>, userId: string): Promise<string> {
    const newRecord = { ...record, userId };
    const ABNORMAL_STORAGE_KEY = 'firecheck_abnormal_records';

    if (this.isGuest || !db) {
      const data = localStorage.getItem(ABNORMAL_STORAGE_KEY);
      const records: AbnormalRecord[] = data ? JSON.parse(data) : [];

      // Check for existing pending record
      const existingIndex = records.findIndex(r => r.equipmentId === record.equipmentId && r.status === 'pending');

      if (existingIndex >= 0) {
        // Update existing
        const existingId = records[existingIndex].id;
        const updatedRecord = { ...newRecord, id: existingId, updatedAt: Date.now() };
        records[existingIndex] = updatedRecord;
        localStorage.setItem(ABNORMAL_STORAGE_KEY, JSON.stringify(records));
        return existingId;
      } else {
        // Create new
        const id = 'local_abnormal_' + Date.now().toString();
        const recordWithId = { ...newRecord, id };
        records.unshift(recordWithId);
        localStorage.setItem(ABNORMAL_STORAGE_KEY, JSON.stringify(records));
        return id;
      }
    } else {
      try {
        // Check for existing pending record in Firestore
        const q = query(
          collection(db, 'abnormalRecords'),
          where('userId', '==', userId),
          where('equipmentId', '==', record.equipmentId),
          where('status', '==', 'pending')
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          // Update existing
          const docId = snapshot.docs[0].id;
          const docRef = doc(db, 'abnormalRecords', docId);
          await updateDoc(docRef, { ...newRecord, updatedAt: Date.now() });
          return docId;
        } else {
          // Create new
          const docRef = await addDoc(collection(db, 'abnormalRecords'), newRecord);
          return docRef.id;
        }
      } catch (e) {
        console.error("Abnormal record save error", e);
        throw e;
      }
    }
  },

  async getAbnormalRecords(userId: string): Promise<AbnormalRecord[]> {
    const ABNORMAL_STORAGE_KEY = 'firecheck_abnormal_records';

    if (this.isGuest || !db) {
      const data = localStorage.getItem(ABNORMAL_STORAGE_KEY);
      if (!data) return [];
      const records: AbnormalRecord[] = JSON.parse(data);
      return records.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      try {
        const q = query(collection(db, 'abnormalRecords'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as AbnormalRecord));
        return records.sort((a, b) => b.createdAt - a.createdAt);
      } catch (e) {
        console.error("Abnormal records fetch error", e);
        return [];
      }
    }
  },

  async updateAbnormalRecord(record: AbnormalRecord): Promise<void> {
    const { id, ...data } = record;
    const ABNORMAL_STORAGE_KEY = 'firecheck_abnormal_records';

    if (this.isGuest || !db) {
      const dataStr = localStorage.getItem(ABNORMAL_STORAGE_KEY);
      if (!dataStr) return;
      let records: AbnormalRecord[] = JSON.parse(dataStr);
      records = records.map(r => r.id === id ? record : r);
      localStorage.setItem(ABNORMAL_STORAGE_KEY, JSON.stringify(records));
    } else {
      try {
        const recordRef = doc(db, 'abnormalRecords', id);
        await updateDoc(recordRef, data);
      } catch (e) {
        console.error("Abnormal record update error", e);
        throw e;
      }
    }
  },

  async deleteAbnormalRecord(id: string): Promise<void> {
    const ABNORMAL_STORAGE_KEY = 'firecheck_abnormal_records';

    if (this.isGuest || !db) {
      const data = localStorage.getItem(ABNORMAL_STORAGE_KEY);
      if (!data) return;
      const records: AbnormalRecord[] = JSON.parse(data);
      const newRecords = records.filter(r => r.id !== id);
      localStorage.setItem(ABNORMAL_STORAGE_KEY, JSON.stringify(newRecords));
    } else {
      try {
        const recordRef = doc(db, 'abnormalRecords', id);
        await deleteDoc(recordRef);
      } catch (e) {
        console.error("Abnormal record delete error", e);
        throw e;
      }
    }
  },

  // --- Light Settings Methods ---

  async getLightSettings(userId: string): Promise<any> {
    const KEY = `lights_${userId}`;
    const defaults = {
      red: { days: 2, color: '#ef4444' },
      yellow: { days: 5, color: '#facc15' },
      green: { days: 7, color: '#10b981' }
    };

    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      return data ? JSON.parse(data) : defaults;
    } else {
      try {
        const docRef = doc(db, 'settings', `lights_${userId}`);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          return { ...defaults, ...snapshot.data() };
        }
        return defaults;
      } catch (e) {
        console.error("Fetch light settings error", e);
        const data = localStorage.getItem(KEY);
        return data ? JSON.parse(data) : defaults;
      }
    }
  },

  async saveLightSettings(settings: any, userId: string): Promise<void> {
    const KEY = `lights_${userId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } else {
      try {
        const docRef = doc(db, 'settings', `lights_${userId}`);
        await setDoc(docRef, settings);
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          localStorage.setItem(KEY, JSON.stringify(settings));
          return;
        }
        console.error("Save light settings error", e);
        throw e;
      }
    }
  }
};