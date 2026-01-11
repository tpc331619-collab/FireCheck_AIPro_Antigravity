
import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import InspectionForm from './components/InspectionForm';
import EquipmentManager from './components/EquipmentManager';
import MyEquipment from './components/MyEquipment';
import ChecklistInspection from './components/ChecklistInspection';
import HierarchyManager from './components/HierarchyManager';
import EquipmentMapEditor from './components/EquipmentMapEditor'; // Import added
import { UserProfile, InspectionReport, EquipmentDefinition } from './types';
import { StorageService } from './services/storageService';
import { auth } from './services/firebase';
// Fix: Import onAuthStateChanged from firebase/auth explicitly
import { onAuthStateChanged } from 'firebase/auth';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'INSPECTION' | 'EQUIPMENT_MANAGER' | 'MY_EQUIPMENT' | 'CHECKLIST_INSPECTION' | 'HIERARCHY_MANAGER' | 'MAP_EDITOR'>('DASHBOARD');
  const [selectedReport, setSelectedReport] = useState<InspectionReport | undefined>(undefined);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentDefinition | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 保持篩選狀態的變數
  const [filterSite, setFilterSite] = useState<string | null>(null);
  const [filterBuilding, setFilterBuilding] = useState<string | null>(null);

  useEffect(() => {
    if (auth) {
      // Use standard modular onAuthStateChanged function
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          const localAvatar = localStorage.getItem(`avatar_${firebaseUser.uid}`);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            photoURL: localAvatar || firebaseUser.photoURL,
            isGuest: false
          });
          StorageService.setGuestMode(false);
        }
        setInitializing(false);
      });
      return () => unsubscribe();
    } else {
      setInitializing(false);
    }
  }, []);

  const handleLogin = (userData: any, isGuest: boolean) => {
    const profile: UserProfile = {
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName || '訪客',
      photoURL: userData.photoURL || null,
      isGuest: isGuest
    };
    setUser(profile);
    StorageService.setGuestMode(isGuest);
  };

  const handleLogout = () => {
    if (auth && !user?.isGuest) {
      auth.signOut();
    }
    setUser(null);
    setCurrentView('DASHBOARD');
    setSelectedReport(undefined);
    setFilterSite(null);
    setFilterBuilding(null);
  };

  const handleUserUpdate = () => {
    if (auth?.currentUser) {
      const localAvatar = localStorage.getItem(`avatar_${auth.currentUser.uid}`);
      setUser({
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User',
        photoURL: localAvatar || auth.currentUser.photoURL,
        isGuest: false
      });
    }
  };

  // Check for standalone mode (New Window)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'standalone') {
      // We wait for auth to check user
    }
  }, []);

  if (initializing) return <div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>;

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  // Standalone Editor Mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'standalone') {
    const initialMapId = urlParams.get('mapId') || undefined;
    return (
      <div className="h-screen w-full bg-slate-50">
        <EquipmentMapEditor
          user={user}
          isOpen={true}
          onClose={() => window.close()}
          initialMapId={initialMapId}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-50 relative overflow-hidden flex flex-col font-sans">
      {currentView === 'DASHBOARD' ? (
        <Dashboard
          user={user}
          onCreateNew={() => {
            setSelectedReport(undefined);
            setCurrentView('CHECKLIST_INSPECTION');
          }}
          onAddEquipment={() => {
            setEditingEquipment(null);
            setCurrentView('EQUIPMENT_MANAGER');
          }}
          onMyEquipment={() => setCurrentView('MY_EQUIPMENT')}
          onSelectReport={(report) => {
            setSelectedReport(report);
            setCurrentView('INSPECTION');
          }}
          onLogout={handleLogout}
          onUserUpdate={handleUserUpdate}
          onManageHierarchy={() => setCurrentView('HIERARCHY_MANAGER')}
          onOpenMapEditor={() => setCurrentView('MAP_EDITOR')}
        />
      ) : currentView === 'MAP_EDITOR' ? (
        <EquipmentMapEditor
          user={user}
          isOpen={true}
          onClose={() => setCurrentView('DASHBOARD')}
        />
      ) : currentView === 'HIERARCHY_MANAGER' ? (
        <HierarchyManager
          user={user}
          onBack={() => setCurrentView('DASHBOARD')}
        />
      ) : currentView === 'EQUIPMENT_MANAGER' ? (
        <EquipmentManager
          key={editingEquipment?.id || 'new'}
          user={user}
          initialData={editingEquipment}
          onBack={() => {
            setEditingEquipment(null);
            if (editingEquipment) {
              setCurrentView('MY_EQUIPMENT');
            } else {
              setCurrentView('DASHBOARD');
            }
          }}
          onSaved={() => {
            setEditingEquipment(null);
            setCurrentView('MY_EQUIPMENT');
          }}
        />
      ) : currentView === 'MY_EQUIPMENT' ? (
        <MyEquipment
          user={user}
          selectedSite={filterSite}
          selectedBuilding={filterBuilding}
          onFilterChange={(site, bld) => {
            setFilterSite(site);
            setFilterBuilding(bld);
          }}
          onBack={() => setCurrentView('DASHBOARD')}
          onEdit={(item) => {
            setEditingEquipment(item);
            setCurrentView('EQUIPMENT_MANAGER');
          }}
        />
      ) : currentView === 'CHECKLIST_INSPECTION' ? (
        <ChecklistInspection
          user={user}
          onBack={() => setCurrentView('DASHBOARD')}
        />
      ) : (
        <InspectionForm
          user={user}
          report={selectedReport}
          onBack={() => setCurrentView('DASHBOARD')}
          onSaved={() => setCurrentView('DASHBOARD')}
        />
      )}
    </div>
  );
};

export default App;
