import { InspectionReport, InspectionItem, EquipmentDefinition, EquipmentHierarchy, DeclarationSettings, EquipmentMap, AbnormalRecord, InspectionStatus, HealthIndicator, HealthHistoryRecord, SystemSettings, Organization, OrganizationMember, OrganizationRole } from '../types';
import { db, auth, storage } from './firebase';
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

  async getReports(userId: string, year?: number, withItems: boolean = false, organizationId?: string | null): Promise<InspectionReport[]> {
    if (this.isGuest) {
      // First check if Guest View is allowed globally
      if (db) {
        try {
          const settingsRef = doc(db, 'settings', 'global_config');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const settings = settingsSnap.data() as SystemSettings;
            if (settings.allowGuestView && settings.publicDataUserId) {
              console.log("[StorageService] Guest Mode: Fetching public data for user", settings.publicDataUserId);
              // Recursively call getting data using the PUBLIC USER ID, but bypassing the isGuest check
              // We can temporarily set isGuest false locally or just copy logic?
              // Safer to just call logic directly
              return this._fetchFirestoreReports(settings.publicDataUserId, year, withItems);
            } else {
              console.log("[StorageService] Guest Mode: Guest View NOT allowed or Public ID missing", settings);
            }
          }
        } catch (e) {
          console.warn("[StorageService] Failed to check guest settings", e);
        }
      }

      // Default Guest behavior (Local Storage)
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!data) return [];
      const reports: InspectionReport[] = JSON.parse(data);
      const targetYear = year || new Date().getFullYear();
      return reports.filter(r => new Date(r.date).getFullYear() === targetYear)
        .sort((a, b) => b.date - a.date);

    } else {
      return this._fetchFirestoreReports(userId, year, withItems, organizationId);
    }
  },

  // Private helper for Firestore fetching
  async _fetchFirestoreReports(userId: string, year?: number, withItems: boolean = false, organizationId?: string | null): Promise<InspectionReport[]> {
    if (!db) return [];
    try {
      const targetYear = year || new Date().getFullYear();
      const collectionName = `reports_${targetYear}`;

      let q;
      // Prefer organization query if orgId is provided
      if (organizationId && organizationId !== '') {
        q = query(collection(db, collectionName), where('organizationId', '==', organizationId));
      } else {
        q = query(collection(db, collectionName), where('userId', '==', userId));
      }

      const snapshot = await getDocs(q);
      let reports = snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id } as InspectionReport));

      // Client-side filtering
      // Same logic as Abnormal Records: If Guest is viewing Public Data, show everything regardless of Org ID
      // We detect this by checking if userId (param) is different from current auth user, implying we are fetching someone else's data
      const currentAuthId = auth?.currentUser?.uid;
      const isGuestPublicAccess = !organizationId && userId !== currentAuthId;

      if (!isGuestPublicAccess) {
        if (!organizationId || organizationId === '') {
          reports = reports.filter(r => !r.organizationId);
        } else {
          reports = reports.filter(r => r.organizationId === organizationId);
        }
      }

      if (withItems) {
        await Promise.all(reports.map(async (report) => {
          const itemsSnap = await getDocs(collection(db, collectionName, report.id, 'items'));
          report.items = itemsSnap.docs.map(d => d.data() as InspectionItem);
        }));
      }

      return reports.sort((a, b) => b.date - a.date);
    } catch (e) {
      console.error("Firebase fetch error", e);
      return [];
    }
  },

  async saveReport(report: Omit<InspectionReport, 'id'>, userId: string, organizationId?: string | null): Promise<string> {
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
    const firestoreReport: any = { ...reportData, userId, stats };
    if (organizationId) {
      firestoreReport.organizationId = organizationId;
    }

    if (this.isGuest || !db) {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      const reports: InspectionReport[] = data ? JSON.parse(data) : [];
      const id = 'local_' + Date.now().toString();
      // For LocalStorage, we keep items embedded as there are no subcollections
      const reportWithId = { ...reportData, userId, stats, items, id, organizationId: organizationId || undefined };
      reports.unshift(reportWithId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
      return id;
    } else {
      try {
        const year = new Date(reportData.date).getFullYear();
        const collectionName = `reports_${year}`;

        // 1. Create Main Report Doc
        const reportRef = doc(collection(db, collectionName));
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
              const itemRef = doc(collection(db, collectionName, reportRef.id, 'items'));
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

  async migrateLegacyReports(userId: string): Promise<string> {
    if (this.isGuest || !db) return "Skipped (Guest Mode)";
    try {
      // Fetch specific user's legacy reports
      const q = query(collection(db, 'reports'), where('userId', '==', userId));
      const snapshot = await getDocs(q);

      if (snapshot.empty) return "No legacy reports found";

      let movedCount = 0;

      for (const reportDoc of snapshot.docs) {
        const reportData = reportDoc.data() as InspectionReport;
        const year = new Date(reportData.date).getFullYear();
        const targetCollection = `reports_${year}`;

        // 1. Fetch Items
        const itemsSnap = await getDocs(collection(db, 'reports', reportDoc.id, 'items'));
        const items = itemsSnap.docs.map(d => d.data());

        // 2. Write to New Collection
        const newReportRef = doc(collection(db, targetCollection), reportDoc.id); // Keep ID
        await setDoc(newReportRef, reportData);

        // Write items
        if (items.length > 0) {
          const batch = writeBatch(db);
          items.forEach(item => {
            // Re-generate ID? Or use same? Items usually don't have IDs in data, just doc IDs.
            // We can just add them.
            const newItemRef = doc(collection(db, targetCollection, reportDoc.id, 'items'));
            batch.set(newItemRef, item);
          });
          await batch.commit();
        }

        // 3. Delete Old (Optional: can comment out for safety first)
        // Ideally we delete AFTER confirming write.
        await deleteDoc(reportDoc.ref); // This deletes the document. Subcollections?
        // Firestore does not auto-delete subcollections. We must delete them manually.
        const deleteBatch = writeBatch(db);
        itemsSnap.docs.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();

        movedCount++;
      }

      return `Migrated ${movedCount} reports.`;
    } catch (e) {
      console.error("Migration failed", e);
      throw e;
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
    const { id, items, ...reportData } = report;

    // Calculate stats
    const stats = {
      total: items?.length || 0,
      passed: items?.filter(i => i.status === InspectionStatus.Normal).length || 0,
      failed: items?.filter(i => i.status === InspectionStatus.Abnormal).length || 0,
      fixed: items?.filter(i => i.status === InspectionStatus.Fixed).length || 0,
      others: items?.filter(i => i.status !== InspectionStatus.Normal && i.status !== InspectionStatus.Abnormal && i.status !== InspectionStatus.Fixed).length || 0
    };

    if (this.isGuest || !db) {
      const dataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!dataStr) return;
      let reports: InspectionReport[] = JSON.parse(dataStr);
      // For LocalStorage, keep items embedded
      const updatedReport = { ...reportData, id, items, stats };
      reports = reports.map(r => r.id === id ? updatedReport : r);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
    } else {
      try {
        // Determine the correct collection based on report date
        const year = new Date(report.date).getFullYear();
        const collectionName = `reports_${year}`;

        const reportRef = doc(db, collectionName, id);

        // Check if document exists first
        const docSnap = await getDoc(reportRef);
        if (!docSnap.exists()) {
          console.error(`[updateReport] Document ${id} not found in ${collectionName}, attempting to create it`);
          // If document doesn't exist, create it instead of updating
          await setDoc(reportRef, { ...reportData, stats });
        } else {
          // Do NOT store items in the main doc, only stats
          await updateDoc(reportRef, { ...reportData, stats });
        }

        // Update items in subcollection
        if (items && items.length > 0) {
          const batch = writeBatch(db);
          items.forEach(item => {
            // Use equipmentId as secondary ID or just let Firebase generate IDs
            // If we use equipmentId as ID, we only get one entry per equipment per report, which is correct.
            const itemRef = doc(collection(db, collectionName, id, 'items'), item.equipmentId);
            batch.set(itemRef, item, { merge: true });
          });
          await batch.commit();
        }
      } catch (e) {
        console.error("Firebase update error", e);
        throw e;
      }
    }
  },

  // --- Equipment Definition Methods ---

  async saveEquipmentDefinition(def: EquipmentDefinition, userId: string, organizationId?: string | null): Promise<string> {
    const { id, ...dataToSave } = def;
    const newDef: any = { ...dataToSave, userId };
    if (organizationId) {
      newDef.organizationId = organizationId;
    }

    if (this.isGuest || !db) {
      const data = localStorage.getItem(EQUIP_STORAGE_KEY);
      const defs: EquipmentDefinition[] = data ? JSON.parse(data) : [];
      const localId = 'local_' + Date.now().toString();
      const defWithId = { ...newDef, id: localId, organizationId: organizationId || undefined } as EquipmentDefinition;
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

  async getEquipmentDefinitions(userId: string, organizationId?: string | null): Promise<EquipmentDefinition[]> {
    let targetUserId = userId;
    let useCloud = !this.isGuest && !!db;
    let fetchedPublicData = false;

    // Check for Public Guest Access
    // If organizationId is present, we skip this guest check logic as we want explicitly org data
    console.log(`[StorageService] getEquipDefs: orgId=${organizationId}, isGuest=${this.isGuest}`);

    if (!organizationId && this.isGuest && db) {
      const settings = await this.getSystemSettings();
      console.log(`[StorageService] getEquipDefs Check: allowView=${settings?.allowGuestView}, allowRecheck=${settings?.allowGuestRecheck}, publicID=${settings?.publicDataUserId}`);

      if ((settings?.allowGuestView || settings?.allowGuestRecheck) && settings?.publicDataUserId) {
        console.log("[StorageService] Guest Access (EquipDefs): Switching to Public User ID", settings.publicDataUserId);
        targetUserId = settings.publicDataUserId;
        useCloud = true;
        fetchedPublicData = true;
      } else {
        console.log("[StorageService] Guest Access (EquipDefs): Conditions NOT met.");
      }
    }

    // If organizationId is provided, we force cloud usage (or specific handling)
    if (organizationId && db) {
      useCloud = true;
    }

    if (!useCloud) {
      const dataStr = localStorage.getItem(EQUIP_STORAGE_KEY);
      if (!dataStr) return [];
      const defs: EquipmentDefinition[] = JSON.parse(dataStr);
      return defs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } else {
      try {
        let q;
        if (organizationId && organizationId !== '') {
          q = query(collection(db, DB_COLLECTION), where('organizationId', '==', organizationId));
        } else {
          q = query(collection(db, DB_COLLECTION), where('userId', '==', targetUserId));
        }

        const snapshot = await getDocs(q);

        let results = snapshot.docs.map(snapshotDoc => {
          const data = snapshotDoc.data();
          // 剔除資料內部的 id，強制使用 document key
          const { id: _, ...cleanData } = data as any;
          return {
            ...cleanData,
            id: snapshotDoc.id
          } as EquipmentDefinition;
        });

        // Client-side filtering
        // Allow Guest Public Access
        const currentAuthId = auth?.currentUser?.uid;
        // Check if we are viewing data that is NOT our own (either via passed userId or switched targetUserId)
        const isGuestPublicAccess = !organizationId && this.isGuest && (targetUserId !== currentAuthId || userId !== currentAuthId);

        // Final robustness check: If we explicitly fetched public data, trust it.
        const shouldBypassFilter = isGuestPublicAccess || fetchedPublicData;

        console.log(`[StorageService] Filtering Check: bypass=${shouldBypassFilter} (public=${fetchedPublicData}, guestPublic=${isGuestPublicAccess})`);

        if (results.some(r => r.id === 'dWWNBUBNm1YW0pgxkX8E')) {
          console.log("[StorageService] FOUND target dWWNBUBNm1YW0pgxkX8E. Photo:", results.find(r => r.id === 'dWWNBUBNm1YW0pgxkX8E')?.photoUrl);
          console.log("[StorageService] Target item data:", results.find(r => r.id === 'dWWNBUBNm1YW0pgxkX8E'));
        } else {
          console.log("[StorageService] Target dWWNBUBNm1YW0pgxkX8E NOT FOUND in result set of size", results.length);
        }

        if (!shouldBypassFilter) {
          if (!organizationId || organizationId === '') {
            results = results.filter(e => !e.organizationId);
          } else {
            results = results.filter(e => e.organizationId === organizationId);
          }
        }
        const sortedResults = results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        // Sync to local storage for Guest Access (if viewing as Admin AND NOT in organization mode)
        if (!this.isGuest && !organizationId) {
          localStorage.setItem(EQUIP_STORAGE_KEY, JSON.stringify(sortedResults));
        }

        return sortedResults;
      } catch (e) {
        console.error("Firebase fetch equipment error", e);
        // Fallback to local only if NOT searching for specific organization (because local doesn't have org data usually)
        if (!organizationId) {
          const dataStr = localStorage.getItem(EQUIP_STORAGE_KEY);
          return dataStr ? JSON.parse(dataStr) : [];
        }
        return [];
      }
    }
  },

  async getEquipmentById(equipmentId: string, userId: string, organizationId?: string | null): Promise<EquipmentDefinition | null> {
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

  async getEquipmentHierarchy(userId: string, organizationId?: string | null): Promise<EquipmentHierarchy | null> {
    const HIERARCHY_KEY = `hierarchy_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(HIERARCHY_KEY);
      return data ? JSON.parse(data) : null;
    } else {
      try {
        const isPersonal = !organizationId || organizationId === '';
        const targetId = isPersonal ? userId : organizationId;
        const docRef = doc(db, 'hierarchies', targetId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          return snapshot.data() as EquipmentHierarchy;
        }
        return null;
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          // Only fallback if NOT organization view, as local storage doesn't have org data
          if (!organizationId) {
            const data = localStorage.getItem(HIERARCHY_KEY);
            return data ? JSON.parse(data) : null;
          }
        }
        console.error("Fetch hierarchy error", e);
        return null;
      }
    }
  },

  async saveEquipmentHierarchy(hierarchy: EquipmentHierarchy, userId: string, organizationId?: string | null): Promise<void> {
    const HIERARCHY_KEY = `hierarchy_${userId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(HIERARCHY_KEY, JSON.stringify(hierarchy));
    } else {
      try {
        const isPersonal = !organizationId || organizationId === '';
        const targetId = isPersonal ? userId : organizationId;
        const docRef = doc(db, 'hierarchies', targetId);
        await setDoc(docRef, hierarchy);
      } catch (e: any) {
        console.error("Save hierarchy error", e);

        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          // If trying to save org data and denied, we can't really fallback to local storage safely
          // but for user data we can.
          if (!organizationId) {
            localStorage.setItem(HIERARCHY_KEY, JSON.stringify(hierarchy));
          } else {
            throw e; // Org save failed
          }
          return;
        }

        if (e instanceof Error) {
          console.error("Error details:", e.message);
        }
        throw e;
      }
    }
  },

  async getDeclarationSettings(userId: string, organizationId?: string | null): Promise<DeclarationSettings | null> {
    const SETTINGS_KEY = `declaration_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : null;
    } else {
      try {
        const isPersonal = !organizationId || organizationId === '';
        const docId = isPersonal ? `declaration_${userId}` : `declaration_${organizationId}`;
        const docRef = doc(db, 'settings', docId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          return snapshot.data() as DeclarationSettings;
        }
        return null;
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          if (!organizationId) {
            const data = localStorage.getItem(SETTINGS_KEY);
            return data ? JSON.parse(data) : null;
          }
        }
        console.error("Fetch declaration settings error", e);
        return null;
      }
    }
  },

  async saveDeclarationSettings(settings: DeclarationSettings, userId: string, organizationId?: string | null): Promise<void> {
    const SETTINGS_KEY = `declaration_${userId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } else {
      try {
        const isPersonal = !organizationId || organizationId === '';
        const docId = isPersonal ? `declaration_${userId}` : `declaration_${organizationId}`;
        const docRef = doc(db, 'settings', docId);
        await setDoc(docRef, settings);
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          console.warn("Firestore permission denied, falling back to local storage");
          if (!organizationId) {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          } else {
            throw e;
          }
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

  async getEquipmentMaps(userId: string, organizationId?: string | null): Promise<EquipmentMap[]> {
    const KEY = `maps_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      return data ? JSON.parse(data) : [];
    } else {
      try {
        let q;
        if (organizationId && organizationId !== '') {
          q = query(collection(db, 'maps'), where('organizationId', '==', organizationId));
        } else {
          q = query(collection(db, 'maps'), where('userId', '==', userId));
        }

        const snapshot = await getDocs(q);
        let results = snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id } as EquipmentMap));

        // Client-side filtering to ensure strict separation
        if (!organizationId || organizationId === '') {
          results = results.filter(r => !r.organizationId);
        } else {
          results = results.filter(r => r.organizationId === organizationId);
        }
        return results;
      } catch (e) {
        console.error("Fetch maps error", e);
        const data = localStorage.getItem(KEY);
        return data ? JSON.parse(data) : [];
      }
    }
  },

  // Aliases for Map Sync Logic
  async getMaps(userId: string, organizationId?: string | null): Promise<EquipmentMap[]> {
    return this.getEquipmentMaps(userId, organizationId);
  },

  async saveMap(mapData: EquipmentMap | Omit<EquipmentMap, 'id'>, userId: string, organizationId?: string | null): Promise<string> {
    if ('id' in mapData) {
      await this.updateEquipmentMap(mapData);
      return mapData.id;
    }
    return this.saveEquipmentMap(mapData, userId, organizationId);
  },

  async saveEquipmentMap(mapData: Omit<EquipmentMap, 'id'>, userId: string, organizationId?: string | null): Promise<string> {
    const KEY = `maps_${userId}`;
    const newMap = { ...mapData, userId, organizationId: organizationId || null, updatedAt: Date.now() };

    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      const maps: EquipmentMap[] = data ? JSON.parse(data) : [];
      const id = 'local_map_' + Date.now();
      maps.push({ ...newMap, id } as EquipmentMap);
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

  async uploadMapImage(file: File, userId: string, organizationId?: string | null): Promise<string> {
    if (this.isGuest || !storage) {
      throw new Error("Guest mode cannot upload to Firebase Storage");
    }

    try {
      if (file.size > 1024 * 1024) {
        throw new Error("File size exceeds 1MB limit");
      }
      const timestamp = Date.now();
      const path = organizationId ? `maps/${organizationId}/${timestamp}_${file.name}` : `maps/${userId}/${timestamp}_${file.name}`;
      const storageRef = ref(storage, path);

      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (e) {
      console.error("Upload map image error", e);
      throw e;
    }
  },

  async uploadBlob(blob: Blob, filename: string, userId: string, organizationId?: string | null): Promise<string> {
    if (this.isGuest || !storage) throw new Error("Guest mode");
    try {
      if (blob.size > 1024 * 1024) {
        throw new Error("File size exceeds 1MB limit");
      }
      const timestamp = Date.now();
      const path = organizationId ? `maps/${organizationId}/${timestamp}_${filename}` : `maps/${userId}/${timestamp}_${filename}`;
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, blob);
      return await getDownloadURL(snapshot.ref);
    } catch (e) {
      console.error("Upload blob error", e);
      throw e;
    }
  },

  async uploadEquipmentPhoto(file: File, userId: string, organizationId?: string | null): Promise<string> {
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
      const path = organizationId ? `equipments/${organizationId}/${timestamp}_${cleanFileName}` : `equipments/${userId}/${timestamp}_${cleanFileName}`;
      const storageRef = ref(storage, path);

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

  async syncMapsFromStorage(userId: string, organizationId?: string | null): Promise<number> {
    if (this.isGuest || !storage || !db) return 0;

    try {
      // 1. Get all existing maps to avoid duplicates
      const existingMaps = await this.getEquipmentMaps(userId, organizationId);
      const existingUrls = new Set(existingMaps.map(m => m.imageUrl));

      // 2. List all files in storage
      const path = organizationId ? `maps/${organizationId}` : `maps/${userId}`;
      const listRef = ref(storage, path);
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

  async getStorageFiles(userId: string, organizationId?: string | null) {
    if (this.isGuest || !storage) return [];
    try {
      const path = organizationId ? `maps/${organizationId}` : `maps/${userId}`;
      const listRef = ref(storage, path);
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

  async saveAbnormalRecord(record: Omit<AbnormalRecord, 'id'>, userId: string, organizationId?: string | null): Promise<string> {
    console.log('[StorageService] saveAbnormalRecord called', { userId, organizationId, equipmentId: record.equipmentId });
    const newRecord = { ...record, userId, organizationId: organizationId || null };
    const ABNORMAL_STORAGE_KEY = 'firecheck_abnormal_records';

    if (this.isGuest || !db) {
      const data = localStorage.getItem(ABNORMAL_STORAGE_KEY);
      const records: AbnormalRecord[] = data ? JSON.parse(data) : [];

      // Check for existing pending record
      const existingIndex = records.findIndex(r => {
        const sameEquipment = r.equipmentId === record.equipmentId && r.status === 'pending';
        if (organizationId) {
          return sameEquipment && r.organizationId === organizationId;
        } else {
          return sameEquipment && r.userId === userId;
        }
      });

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
        records.unshift(recordWithId as AbnormalRecord);
        localStorage.setItem(ABNORMAL_STORAGE_KEY, JSON.stringify(records));
        return id;
      }
    } else {
      try {
        // Check for existing pending record in Firestore
        let q;
        if (organizationId) {
          q = query(
            collection(db, 'abnormalRecords'),
            where('organizationId', '==', organizationId),
            where('equipmentId', '==', record.equipmentId),
            where('status', '==', 'pending')
          );
        } else {
          q = query(
            collection(db, 'abnormalRecords'),
            where('userId', '==', userId),
            where('equipmentId', '==', record.equipmentId),
            where('status', '==', 'pending')
          );
        }

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          // Update existing
          const docId = snapshot.docs[0].id;
          const docRef = doc(db, 'abnormalRecords', docId);
          await updateDoc(docRef, { ...newRecord, updatedAt: Date.now() });
          return docId;
        } else {
          // Create new
          const docRef = await addDoc(collection(db, 'abnormalRecords'), {
            ...newRecord,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          return docRef.id;
        }
      } catch (e) {
        console.error("Save abnormal record error", e);
        throw e;
      }
    }
  },



  async addHealthIndicator(indicator: Omit<HealthIndicator, 'id' | 'updatedAt'>, userId: string, organizationId?: string | null): Promise<string> {
    const KEY = `health_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      const indicators: HealthIndicator[] = data ? JSON.parse(data) : [];
      const newId = Date.now().toString();
      indicators.push({ ...indicator, id: newId, userId, updatedAt: Date.now() });
      localStorage.setItem(KEY, JSON.stringify(indicators));
      return newId;
    } else {
      try {
        const docRef = await addDoc(collection(db, 'health'), {
          ...indicator,
          userId,
          organizationId: organizationId || null,
          updatedAt: Date.now()
        });
        return docRef.id;
      } catch (e: any) {
        console.error("Add health indicator error", e);
        if (e.code === 'permission-denied') {
          // Fallback to local storage logic if needed, or throw
          const data = localStorage.getItem(KEY);
          const indicators: HealthIndicator[] = data ? JSON.parse(data) : [];
          const newId = Date.now().toString();
          indicators.push({ ...indicator, id: newId, userId, updatedAt: Date.now() });
          localStorage.setItem(KEY, JSON.stringify(indicators));
          return newId;
        }
        throw e;
      }
    }
  },

  async updateHealthIndicator(id: string, updates: Partial<HealthIndicator>, userId: string, organizationId?: string | null): Promise<void> {
    const KEY = `health_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      let indicators: HealthIndicator[] = data ? JSON.parse(data) : [];
      const index = indicators.findIndex(i => i.id === id);
      if (index !== -1) {
        indicators[index] = { ...indicators[index], ...updates, updatedAt: Date.now() };
        localStorage.setItem(KEY, JSON.stringify(indicators));
      }
    } else {
      try {
        const docRef = doc(db, 'health', id);
        await updateDoc(docRef, { ...updates, updatedAt: Date.now(), organizationId: organizationId || null });
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          // Fallback local
          const data = localStorage.getItem(KEY);
          let indicators: HealthIndicator[] = data ? JSON.parse(data) : [];
          const index = indicators.findIndex(i => i.id === id);
          if (index !== -1) {
            indicators[index] = { ...indicators[index], ...updates, updatedAt: Date.now() };
            localStorage.setItem(KEY, JSON.stringify(indicators));
          }
          return;
        }
        console.error("Update health indicator error", e);
        throw e;
      }
    }
  },

  async deleteHealthIndicator(id: string, userId: string, organizationId?: string | null): Promise<void> {
    const KEY = `health_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      let indicators: HealthIndicator[] = data ? JSON.parse(data) : [];
      indicators = indicators.filter(i => i.id !== id);
      localStorage.setItem(KEY, JSON.stringify(indicators));
    } else {
      try {
        await deleteDoc(doc(db, 'health', id));
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          // Fallback local
          const data = localStorage.getItem(KEY);
          let indicators: HealthIndicator[] = data ? JSON.parse(data) : [];
          indicators = indicators.filter(i => i.id !== id);
          localStorage.setItem(KEY, JSON.stringify(indicators));
          return;
        }
        console.error("Delete health indicator error", e);
        throw e;
      }
    }
  },

  async addHealthHistory(record: Omit<HealthHistoryRecord, 'id' | 'updatedAt'>, userId: string, organizationId?: string | null): Promise<string> {
    const KEY = `health_history_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      const history: HealthHistoryRecord[] = data ? JSON.parse(data) : [];
      const newId = Date.now().toString();
      history.push({ ...record, id: newId, userId, updatedAt: Date.now() });
      localStorage.setItem(KEY, JSON.stringify(history));
      return newId;
    } else {
      try {
        const docRef = await addDoc(collection(db, 'healthHistory'), {
          ...record,
          userId,
          organizationId: organizationId || null,
          updatedAt: Date.now()
        });
        return docRef.id;
      } catch (e: any) {
        console.error("Add health history error", e);
        if (e.code === 'permission-denied') {
          // Fallback local
          const data = localStorage.getItem(KEY);
          const history: HealthHistoryRecord[] = data ? JSON.parse(data) : [];
          const newId = Date.now().toString();
          history.push({ ...record, id: newId, userId, updatedAt: Date.now() });
          localStorage.setItem(KEY, JSON.stringify(history));
          return newId;
        }
        throw e;
      }
    }
  },

  async getHealthHistory(indicatorId: string, userId: string, organizationId?: string | null): Promise<HealthHistoryRecord[]> {
    const KEY = `health_history_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      if (!data) return [];
      const history: HealthHistoryRecord[] = JSON.parse(data);
      return history.filter(h => h.indicatorId === indicatorId).sort((a, b) => b.updatedAt - a.updatedAt);
    } else {
      try {
        let q;
        if (organizationId) {
          q = query(
            collection(db, 'healthHistory'),
            where('organizationId', '==', organizationId),
            where('indicatorId', '==', indicatorId)
          );
        } else {
          q = query(
            collection(db, 'healthHistory'),
            where('userId', '==', userId),
            where('indicatorId', '==', indicatorId)
          );
        }
        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id } as HealthHistoryRecord));
        return records
          .sort((a, b) => b.updatedAt - a.updatedAt);
      } catch (e) {
        console.error("Fetch health history error", e);
        return [];
      }
    }
  },

  async getAllHealthHistory(userId: string, organizationId?: string | null): Promise<HealthHistoryRecord[]> {
    const KEY = organizationId ? `health_history_${organizationId}` : `health_history_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      return data ? JSON.parse(data) : [];
    } else {
      try {
        let q;
        if (organizationId) {
          q = query(
            collection(db, 'healthHistory'),
            where('organizationId', '==', organizationId)
          );
        } else {
          q = query(
            collection(db, 'healthHistory'),
            where('userId', '==', userId)
          );
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id } as HealthHistoryRecord));
      } catch (e) {
        console.error("Fetch all health history error", e);
        return [];
      }
    }
  },

  async getHealthIndicators(userId: string, organizationId?: string | null): Promise<HealthIndicator[]> {
    const KEY = `health_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      return data ? JSON.parse(data) : [];
    } else {
      try {
        let q;
        if (organizationId) {
          q = query(collection(db, 'health'), where('organizationId', '==', organizationId));
        } else {
          q = query(collection(db, 'health'), where('userId', '==', userId));
        }

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as HealthIndicator));
        }

        // --- MIGRATION CHECK (Only for User view) ---
        // If 'health' collection is empty, check old 'settings' document
        const settingsDocRef = doc(db, 'settings', `health_${userId}`);
        const settingsSnapshot = await getDoc(settingsDocRef);
        if (settingsSnapshot.exists()) {
          const data = settingsSnapshot.data() as { indicators?: HealthIndicator[] };
          const legacyData = data.indicators;
          if (legacyData && legacyData.length > 0) {
            return legacyData;
          }
        }

        return [];
      } catch (e: any) {
        console.error("Fetch health indicators error", e);
        if (!organizationId) {
          const data = localStorage.getItem(KEY);
          return data ? JSON.parse(data) : [];
        }
        return [];
      }
    }
  },

  // Deprecated: Use add/update/delete methods instead
  // Updated to support organizationId (saves to 'health' collection if orgId present)
  async saveHealthIndicators(indicators: HealthIndicator[], userId: string, organizationId?: string | null): Promise<void> {
    const KEY = `health_${userId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(KEY, JSON.stringify(indicators));
    } else {
      try {
        if (organizationId) {
          // For Organization: WE MUST USE 'health' COLLECTION
          // Strategy: Delete all existing org indicators and re-create (Save All)

          // 1. Get existing
          const q = query(collection(db, 'health'), where('organizationId', '==', organizationId));
          const snapshot = await getDocs(q);

          const batch = writeBatch(db);

          const existingIds = new Set(snapshot.docs.map(d => d.id));
          const newIds = new Set();

          indicators.forEach(ind => {
            // Use composite ID to ensure stability and uniqueness
            const docId = ind.id.includes(organizationId) ? ind.id : `${organizationId}_${ind.id}`;
            newIds.add(docId);
            const docRef = doc(db, 'health', docId);
            const data = { ...ind, organizationId, userId }; // Add userId too for reference
            batch.set(docRef, data);
          });

          // Delete ones that are no longer present
          existingIds.forEach(oldId => {
            if (!newIds.has(oldId)) {
              batch.delete(doc(db, 'health', oldId));
            }
          });

          await batch.commit();
          return;
        }

        // Default User Logic (Legacy Settings Doc)
        const docRef = doc(db, 'settings', `health_${userId}`);
        await setDoc(docRef, { indicators });
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          localStorage.setItem(KEY, JSON.stringify(indicators));
          return;
        }
        console.error("Save health indicators error", e);
        throw e;
      }
    }
  },

  async getAbnormalRecords(userId: string, organizationId?: string | null): Promise<AbnormalRecord[]> {
    console.log('[StorageService] getAbnormalRecords called', { userId, organizationId });
    let targetUserId = userId;
    let useCloud = !this.isGuest && !!db;

    // Check for Public Guest Access
    // Skip if organizationId is present
    if (!organizationId && this.isGuest && db) {
      const settings = await this.getSystemSettings();
      // Allow if either View OR Recheck is enabled
      // Just like abnormal records, we might want to allow seeing history if they are allowed to recheck?
      // Or at least, if allowGuestView is missing but allowGuestRecheck is on, maybe we should minimal access?
      // For now, let's allow it if either is true, to be safe and consistent with user request "Guest Mode Data Visibility".
      if ((settings?.allowGuestView || settings?.allowGuestRecheck) && settings?.publicDataUserId) {
        console.log('[StorageService] Guest Access (Reports): Using Public Data ID:', settings.publicDataUserId);
        targetUserId = settings.publicDataUserId;
        useCloud = true;
      }
    }

    // Force cloud if orgId provided
    if (organizationId && db) {
      useCloud = true;
    }

    if (!useCloud) {
      const dataStr = localStorage.getItem('firecheck_abnormal_records');
      if (!dataStr) return [];
      const records: AbnormalRecord[] = JSON.parse(dataStr);
      return records.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      try {
        let q;
        if (organizationId && organizationId !== '') {
          q = query(collection(db, 'abnormalRecords'), where('organizationId', '==', organizationId));
        } else {
          q = query(collection(db, 'abnormalRecords'), where('userId', '==', targetUserId));
        }

        const snapshot = await getDocs(q);
        let records = snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id } as AbnormalRecord));

        // Client-side filtering
        // If we are in Guest Mode using Public Data ID, we should SHOW parsed records even if they have Org ID
        // because the Guest doesn't belong to an Org, but wants to see the Admin's data.
        const isGuestPublicAccess = !organizationId && this.isGuest && targetUserId !== userId;

        if (!Boolean(isGuestPublicAccess)) {
          if (!organizationId || organizationId === '') {
            records = records.filter(r => !r.organizationId);
          } else {
            records = records.filter(r => r.organizationId === organizationId);
          }
        }

        const sorted = records.sort((a, b) => b.createdAt - a.createdAt);

        // Sync to local storage for Guest Access (if Admin AND not Org view)
        if (!this.isGuest && !organizationId) {
          localStorage.setItem('firecheck_abnormal_records', JSON.stringify(sorted));
        }

        return sorted;
      } catch (e) {
        console.error("Abnormal records fetch error", e);
        // Fallback
        if (!organizationId) {
          const dataStr = localStorage.getItem('firecheck_abnormal_records');
          return dataStr ? JSON.parse(dataStr) : [];
        }
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

  async getLightSettings(userId: string, organizationId?: string | null): Promise<any> {
    const isPersonal = !organizationId || organizationId === '';
    const KEY = isPersonal ? `lights_${userId}` : `lights_${organizationId}`;
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
        const docRef = doc(db, 'settings', KEY);
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

  async saveLightSettings(settings: any, userId: string, organizationId?: string | null): Promise<void> {
    const isPersonal = !organizationId || organizationId === '';
    const KEY = isPersonal ? `lights_${userId}` : `lights_${organizationId}`;
    if (this.isGuest || !db) {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } else {
      try {
        const docRef = doc(db, 'settings', KEY);
        await setDoc(docRef, { ...settings, organizationId: organizationId || null });
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          localStorage.setItem(KEY, JSON.stringify(settings));
          return;
        }
        console.error("Save light settings error", e);
        throw e;
      }
    }
  },

  // Notification methods
  async getNotifications(userId: string, organizationId?: string | null): Promise<any[]> {
    const KEY = `notifications_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      const notifications = data ? JSON.parse(data) : [];
      if (organizationId !== undefined) {
        return notifications.filter((n: any) => n.organizationId === organizationId);
      }
      return notifications;
    } else {
      try {
        let q;
        if (organizationId !== undefined) {
          q = query(
            collection(db, 'notifications'),
            where('userId', '==', userId),
            where('organizationId', '==', organizationId)
          );
        } else {
          q = query(collection(db, 'notifications'), where('userId', '==', userId));
        }

        const snapshot = await getDocs(q);
        return snapshot.docs
          .map(d => ({ ...(d.data() as any), id: d.id }))
          .sort((a: any, b: any) => b.timestamp - a.timestamp);
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          const data = localStorage.getItem(KEY);
          const notifications = data ? JSON.parse(data) : [];
          if (organizationId !== undefined) {
            return notifications.filter((n: any) => n.organizationId === organizationId);
          }
          return notifications;
        }
        console.error("Get notifications error", e);
        return [];
      }
    }
  },

  async addNotification(notification: any, userId: string, organizationId?: string | null): Promise<string> {
    const KEY = `notifications_${userId}`;
    const newNotification = {
      ...(notification as any),
      userId,
      organizationId: organizationId || null,
      id: notification.id || `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: notification.timestamp || Date.now(),
      read: notification.read || false
    };

    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      const notifications = data ? JSON.parse(data) : [];
      notifications.unshift(newNotification);
      localStorage.setItem(KEY, JSON.stringify(notifications));
      return newNotification.id;
    } else {
      try {
        const docRef = await addDoc(collection(db, 'notifications'), newNotification);
        return docRef.id;
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          const data = localStorage.getItem(KEY);
          const notifications = data ? JSON.parse(data) : [];
          notifications.unshift(newNotification);
          localStorage.setItem(KEY, JSON.stringify(notifications));
          return newNotification.id;
        }
        console.error("Add notification error", e);
        throw e;
      }
    }
  },

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const KEY = `notifications_${userId}`;
    if (this.isGuest || !db) {
      const data = localStorage.getItem(KEY);
      if (data) {
        const notifications = JSON.parse(data);
        const index = notifications.findIndex((n: any) => n.id === notificationId);
        if (index !== -1) {
          notifications[index].read = true;
          localStorage.setItem(KEY, JSON.stringify(notifications));
        }
      }
    } else {
      try {
        const docRef = doc(db, 'notifications', notificationId);
        await updateDoc(docRef, { read: true });
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          const data = localStorage.getItem(KEY);
          if (data) {
            const notifications = JSON.parse(data);
            const index = notifications.findIndex((n: any) => n.id === notificationId);
            if (index !== -1) {
              notifications[index].read = true;
              localStorage.setItem(KEY, JSON.stringify(notifications));
            }
          }
          return;
        }
        console.error("Mark as read error", e);
        throw e;
      }
    }
  },

  async clearAllNotifications(userId: string): Promise<void> {
    const KEY = `notifications_${userId}`;
    if (this.isGuest || !db) {
      localStorage.removeItem(KEY);
    } else {
      try {
        const q = query(collection(db, 'notifications'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } catch (e: any) {
        if (e.code === 'permission-denied') {
          localStorage.removeItem(KEY);
          return;
        }
        console.error("Clear notifications error", e);
        throw e;
      }
    }
  },

  async getSystemSettings(): Promise<SystemSettings | null> {
    const CACHE_KEY = 'system_settings_cache';
    // Try Cloud fetch even for guests (Anonymous Auth allows it if rules permit)
    if (db) {
      try {
        const docRef = doc(db, 'settings', 'global_config');
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data() as SystemSettings;
          localStorage.setItem(CACHE_KEY, JSON.stringify(data)); // Cache it
          return data;
        }
      } catch (e) {
        // Fallback to cache on error
      }
    }

    // Fallback to LocalStorage
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : { allowGuestView: false };
  },

  async saveSystemSettings(settings: SystemSettings): Promise<void> {
    const CACHE_KEY = 'system_settings_cache';
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); // Always save to cache

    if (this.isGuest || !db) return;
    try {
      const docRef = doc(db, 'settings', 'global_config');
      await setDoc(docRef, settings);
    } catch (e) {
      console.error("Save system settings error", e);
      throw e;
    }
  },
  // ==================== 組織管理 ====================

  async createOrganization(org: Omit<Organization, 'id'>): Promise<string> {
    if (!db) throw new Error('Database not initialized');
    try {
      const docRef = await addDoc(collection(db, 'organizations'), org);
      console.log('[StorageService] Created organization:', docRef.id);
      return docRef.id;
    } catch (e) {
      console.error('Create organization error', e);
      throw e;
    }
  },

  async getOrganization(orgId: string): Promise<Organization | null> {
    if (!db) return null;
    try {
      const docRef = doc(db, 'organizations', orgId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return { ...snapshot.data(), id: snapshot.id } as Organization;
      }
      return null;
    } catch (e) {
      console.error('Get organization error', e);
      return null;
    }
  },

  async updateOrganization(orgId: string, updates: Partial<Organization>): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    try {
      const docRef = doc(db, 'organizations', orgId);
      await updateDoc(docRef, {
        ...updates, updatedAt: Date.now()
      });
      console.log('[StorageService] Updated organization:', orgId);
    } catch (e) {
      console.error('Update organization error', e);
      throw e;
    }
  },

  async deleteOrganization(orgId: string): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    try {
      // 1. Delete all members
      const membersQuery = query(collection(db, 'organizationMembers'), where('organizationId', '==', orgId));
      const membersSnapshot = await getDocs(membersQuery);
      const batch = writeBatch(db);
      membersSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      // 2. Delete organization
      const docRef = doc(db, 'organizations', orgId);
      await deleteDoc(docRef);
      console.log('[StorageService] Deleted organization:', orgId);
    } catch (e) {
      console.error('Delete organization error', e);
      throw e;
    }
  },

  async addOrganizationMember(member: Omit<OrganizationMember, 'id'>): Promise<string> {
    if (!db) throw new Error('Database not initialized');
    try {
      // Use composite ID for easier querying: userId_organizationId
      const memberId = `${member.userId}_${member.organizationId}`;
      const docRef = doc(db, 'organizationMembers', memberId);
      await setDoc(docRef, { ...member, id: memberId });
      console.log('[StorageService] Added organization member:', memberId);
      return memberId;
    } catch (e) {
      console.error('Add organization member error', e);
      throw e;
    }
  },

  async updateOrganizationMemberUID(docId: string, newUserId: string): Promise<void> {
    if (!db) return;
    try {
      const docRef = doc(db, 'organizationMembers', docId);
      await updateDoc(docRef, { userId: newUserId });
    } catch (e) {
      console.error('Update member UID error', e);
    }
  },

  async getOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
    if (!db) return [];
    try {
      const q = query(collection(db, 'organizationMembers'), where('organizationId', '==', orgId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as OrganizationMember);
    } catch (e) {
      console.error('Get organization members error', e);
      return [];
    }
  },

  async getUserOrganizations(userId: string, email?: string | null): Promise<Organization[]> {
    if (!db) return [];
    try {
      // 1. Get all memberships for this user
      const qUID = query(collection(db, 'organizationMembers'), where('userId', '==', userId));
      const snapUID = await getDocs(qUID);
      let orgIds = snapUID.docs.map(doc => doc.data().organizationId);

      // 2. Also check by email to "claim" pending invitations
      if (email) {
        const qEmail = query(collection(db, 'organizationMembers'), where('userEmail', '==', email));
        const snapEmail = await getDocs(qEmail);

        for (const d of snapEmail.docs) {
          const data = d.data();
          if (!orgIds.includes(data.organizationId)) {
            orgIds.push(data.organizationId);
          }

          // If this was a placeholder membership (userId was the email), update it to the real UID
          if (data.userId === email || data.userId !== userId) {
            console.log(`[StorageService] Claiming invitation for ${email} -> ${userId}`);
            await this.updateOrganizationMemberUID(d.id, userId);
          }
        }
      }

      if (orgIds.length === 0) return [];

      // 2. Fetch all organizations (Firestore doesn't support 'in' with more than 10 items, but usually users won't have that many orgs)
      const orgs: Organization[] = [];
      for (const orgId of orgIds) {
        const org = await this.getOrganization(orgId);
        if (org) orgs.push(org);
      }

      return orgs.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Get user organizations error', e);
      return [];
    }
  },

  async removeOrganizationMember(memberId: string): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    try {
      const docRef = doc(db, 'organizationMembers', memberId);
      await deleteDoc(docRef);
      console.log('[StorageService] Removed organization member:', memberId);
    } catch (e) {
      console.error('Remove organization member error', e);
      throw e;
    }
  },

  async updateMemberRole(memberId: string, role: OrganizationRole): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    try {
      const docRef = doc(db, 'organizationMembers', memberId);
      await updateDoc(docRef, { role });
      console.log('[StorageService] Updated member role:', memberId, role);
    } catch (e) {
      console.error('Update member role error', e);
      throw e;
    }
  },

  async getMemberRole(userId: string, orgId: string): Promise<OrganizationRole | null> {
    if (!db) return null;
    try {
      const memberId = `${userId}_${orgId}`;
      const docRef = doc(db, 'organizationMembers', memberId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return snapshot.data().role as OrganizationRole;
      }
      return null;
    } catch (e) {
      console.error('Get member role error', e);
      return null;
    }
  },

  async migrateUserDataToOrganization(userId: string, orgId: string): Promise<void> {
    if (!db) throw new Error('Database not initialized');

    try {
      console.log(`[StorageService] Migrating user ${userId} data to organization ${orgId}`);

      const batch = writeBatch(db);
      let updateCount = 0;

      // 1. Migrate Equipment Definitions
      const equipQuery = query(collection(db, 'equipments'), where('userId', '==', userId));
      const equipSnapshot = await getDocs(equipQuery);
      equipSnapshot.docs.forEach(doc => {
        if (!doc.data().organizationId) {
          batch.update(doc.ref, { organizationId: orgId });
          updateCount++;
        }
      });

      // 2. Migrate Reports (current year and legacy)
      const currentYear = new Date().getFullYear();
      const reportCollections = ['reports', `reports_${currentYear}`];

      for (const collName of reportCollections) {
        try {
          const reportsQuery = query(collection(db, collName), where('userId', '==', userId));
          const reportsSnapshot = await getDocs(reportsQuery);
          reportsSnapshot.docs.forEach(doc => {
            if (!doc.data().organizationId) {
              batch.update(doc.ref, { organizationId: orgId });
              updateCount++;
            }
          });
        } catch (e) {
          // Collection might not exist, skip
        }
      }

      // 3. Migrate Abnormal Records
      const abnormalQuery = query(collection(db, 'abnormalRecords'), where('userId', '==', userId));
      const abnormalSnapshot = await getDocs(abnormalQuery);
      abnormalSnapshot.docs.forEach(doc => {
        if (!doc.data().organizationId) {
          batch.update(doc.ref, { organizationId: orgId });
          updateCount++;
        }
      });

      // 4. Migrate Health Indicators
      const healthQuery = query(collection(db, 'health'), where('userId', '==', userId));
      const healthSnapshot = await getDocs(healthQuery);
      healthSnapshot.docs.forEach(doc => {
        if (!doc.data().organizationId) {
          batch.update(doc.ref, { organizationId: orgId });
          updateCount++;
        }
      });

      // Commit all updates
      if (updateCount > 0) {
        await batch.commit();
        console.log(`[StorageService] Migrated ${updateCount} documents to organization ${orgId}`);
      } else {
        console.log(`[StorageService] No documents to migrate (already migrated or no data)`);
      }
    } catch (e) {
      console.error('Migration error', e);
      throw e;
    }
  },

  // --- Whitelist & User Management ---
  async checkWhitelist(email: string): Promise<WhitelistEntry | null> {
    if (!db || !email) return null;
    try {
      const docRef = doc(db, 'whitelist', email.toLowerCase());
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return snapshot.data() as WhitelistEntry;
      }
      return null;
    } catch (e) {
      console.error('Check whitelist error', e);
      return null;
    }
  },

  async requestAccess(user: { email: string; displayName: string; photoURL?: string }): Promise<void> {
    if (!db || !user.email) return;
    try {
      const email = user.email.toLowerCase();
      const docRef = doc(db, 'whitelist', email);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        // Only create if not exists
        const entry: WhitelistEntry = {
          email: email,
          status: 'pending',
          orgId: null,
          role: 'user', // Default role
          name: user.displayName,
          photoURL: user.photoURL || undefined,
          requestedAt: Date.now(),
          updatedAt: Date.now()
        };
        await setDoc(docRef, entry);
        console.log('[StorageService] Access requested for', email);
      }
    } catch (e) {
      console.error('Request access error', e);
      throw e;
    }
  },

  async getWhitelist(): Promise<WhitelistEntry[]> {
    if (!db) return [];
    try {
      const q = query(collection(db, 'whitelist'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as WhitelistEntry)
        .sort((a, b) => b.requestedAt - a.requestedAt);
    } catch (e) {
      console.error('Get whitelist error', e);
      return [];
    }
  },

  async updateWhitelistEntry(email: string, updates: Partial<WhitelistEntry>): Promise<void> {
    if (!db) return;
    try {
      const docRef = doc(db, 'whitelist', email.toLowerCase());
      await updateDoc(docRef, {
        ...updates, updatedAt: Date.now()
      });
      console.log('[StorageService] Updated whitelist entry for', email);
    } catch (e) {
      console.error('Update whitelist error', e);
      throw e;
    }
  },

  async deleteWhitelistEntry(email: string): Promise<void> {
    if (!db) return;
    try {
      const normalizedEmail = email.trim().toLowerCase();
      // Robust delete: Query by email field to find the correct document(s)
      const q = query(collection(db, 'whitelist'), where('email', '==', normalizedEmail));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Delete all matching documents (usually just one)
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        console.log('[StorageService] Deleted whitelist entry for', normalizedEmail);
      } else {
        // Fallback: Try deleting by ID if no field match (though unlikely if data is consistent)
        const docRef = doc(db, 'whitelist', normalizedEmail);
        await deleteDoc(docRef);
        console.log('[StorageService] Attempted ID-based delete for', normalizedEmail);
      }
    } catch (e) {
      console.error('Delete whitelist error', e);
      throw e;
    }
  }
};

// Start of local interface definition (Fallback if types.ts update failed)
export interface WhitelistEntry {
  email: string;
  status: 'approved' | 'pending' | 'blocked';
  orgId?: string | null;
  role: 'admin' | 'user';
  name?: string;
  photoURL?: string;
  requestedAt: number;
  updatedAt: number;
}