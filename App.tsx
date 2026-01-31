
import React, { useState, useEffect, Suspense, lazy } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
// Lazy load non-critical components
const InspectionForm = lazy(() => import('./components/InspectionForm'));
const EquipmentManager = lazy(() => import('./components/EquipmentManager'));
const MyEquipment = lazy(() => import('./components/MyEquipment'));
const ChecklistInspection = lazy(() => import('./components/ChecklistInspection'));
const HierarchyManager = lazy(() => import('./components/HierarchyManager'));
const EquipmentMapEditor = lazy(() => import('./components/EquipmentMapEditor'));
import { UserProfile, InspectionReport, EquipmentDefinition, EquipmentHierarchy, DeclarationSettings, EquipmentMap, AbnormalRecord, InspectionStatus, HealthIndicator, HealthHistoryRecord, SystemSettings } from './types';

import { StorageService } from './services/storageService';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const GUEST_SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'INSPECTION' | 'EQUIPMENT_MANAGER' | 'MY_EQUIPMENT' | 'CHECKLIST_INSPECTION' | 'HIERARCHY_MANAGER' | 'MAP_EDITOR'>('DASHBOARD');
  const [selectedReport, setSelectedReport] = useState<InspectionReport | undefined>(undefined);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentDefinition | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [guestExpiry, setGuestExpiry] = useState<number | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | undefined>(undefined);

  // 保持篩選狀態的變數
  const [filterSite, setFilterSite] = useState<string | null>(null);
  const [filterBuilding, setFilterBuilding] = useState<string | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState('');

  const [accessStatus, setAccessStatus] = useState<'approved' | 'pending' | 'blocked' | 'checking' | 'idle' | 'unregistered'>('idle');

  useEffect(() => {
    if (auth) {
      // Use standard modular onAuthStateChanged function
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const isGuest = firebaseUser.isAnonymous;

          let userRole: 'admin' | 'user' = 'user';

          // Whitelist Check Logic
          if (!isGuest) {
            try {
              if (firebaseUser.email?.toLowerCase() === 'b28803078@gmail.com') {
                // Super Admin Bypass
                setAccessStatus('approved');
                userRole = 'admin';
              } else {
                setAccessStatus('checking');

                // Add timeout to prevent infinite hanging
                const checkPromise = StorageService.checkWhitelist(firebaseUser.email || '');
                const timeoutPromise = new Promise<null>((_, reject) =>
                  setTimeout(() => reject(new Error('Network timeout checking whitelist')), 8000)
                );

                // Use Promise.race
                let whitelistEntry = null;
                try {
                  whitelistEntry = await Promise.race([checkPromise, timeoutPromise]);
                } catch (timeoutErr) {
                  console.error(timeoutErr);
                  throw timeoutErr;
                }

                if (!whitelistEntry) {
                  // Wait for user to request access manually
                  setAccessStatus('unregistered');
                } else if (whitelistEntry.status !== 'approved') {
                  setAccessStatus(whitelistEntry.status);
                } else {
                  setAccessStatus('approved');
                  // Set role from whitelist
                  if (whitelistEntry.role === 'admin') {
                    userRole = 'admin';
                  }
                }
              }
            } catch (error: any) {
              console.error('Whitelist check failed:', error);
              setAccessStatus('blocked');
              if (error.code === 'permission-denied') {
                alert('權限不足：請確認 Firestore Rules 是否已部署。');
              }
            }
          } else {
            setAccessStatus('approved');
          }

          const localAvatar = localStorage.getItem(`avatar_${firebaseUser.uid}`);
          const userProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || (isGuest ? '訪客' : (firebaseUser.email?.split('@')[0] || 'User')),
            photoURL: localAvatar || firebaseUser.photoURL,
            isGuest: isGuest,
            role: userRole
          };

          // Auto-create personal organization for non-guest users
          if (!isGuest) {
            try {
              const orgs = await StorageService.getUserOrganizations(firebaseUser.uid, firebaseUser.email);

              if (orgs.length > 0) {
                // Load last used org
                const lastOrgId = localStorage.getItem(`lastOrgId_${firebaseUser.uid}`);
                if (lastOrgId && orgs.some(o => o.id === lastOrgId)) {
                  userProfile.currentOrganizationId = lastOrgId;
                } else if (orgs.length > 0) {
                  userProfile.currentOrganizationId = orgs[0].id; // Default to first
                }
              }
            } catch (e) {
              console.error('[App] Organization init failed', e);
            }
          }

          setUser(userProfile); // This line is crucial for rendering the app
          StorageService.setGuestMode(isGuest);

          // Handle Guest Session Timer
          if (isGuest) {
            const storedExpiry = localStorage.getItem('guest_expiry');
            const now = Date.now();
            let expiry = storedExpiry ? parseInt(storedExpiry, 10) : 0;

            if (!expiry || expiry <= now) {
              // New session or expired previous session
              // Since this block runs on auth state change (login), we assume new session if expired logic falls through
              // But handleLogout usually clears it. If we are here, we are logged in.
              expiry = now + GUEST_SESSION_DURATION;
              localStorage.setItem('guest_expiry', expiry.toString());
            }
            setGuestExpiry(expiry);
          } else {
            localStorage.removeItem('guest_expiry');
            setGuestExpiry(null);
          }

        } else {
          setUser(null);
          setAccessStatus('idle'); // Reset status to idle so login screen handles interaction
          StorageService.setGuestMode(false);
          setGuestExpiry(null);
        }
        setInitializing(false);
      });

      // Fetch system settings
      StorageService.getSystemSettings().then(setSystemSettings);

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
    if (isGuest) setAccessStatus('approved');
    setUser(profile);
    StorageService.setGuestMode(isGuest);
  };

  const handleLogout = async () => {
    if (auth?.currentUser) {
      if (auth.currentUser.isAnonymous) {
        try {
          await auth.currentUser.delete();
          console.log('Anonymous account deleted');
        } catch (error) {
          console.error('Error deleting anonymous account:', error);
          await auth.signOut();
        }
      } else {
        await auth.signOut();
      }
    }
    localStorage.removeItem('guest_expiry'); // Clear timer
    setGuestExpiry(null);
    setUser(null);
    setAccessStatus('idle'); // Ensure IDLE on logout
    setCurrentView('DASHBOARD');
    setSelectedReport(undefined);
    setFilterSite(null);
    setFilterBuilding(null);
  };

  const handleUserUpdate = () => {
    if (auth?.currentUser) {
      const localAvatar = localStorage.getItem(`avatar_${auth.currentUser.uid}`);
      const lastOrgId = localStorage.getItem(`lastOrgId_${auth.currentUser.uid}`);

      setUser(prev => ({
        uid: auth.currentUser!.uid,
        email: auth.currentUser!.email,
        displayName: auth.currentUser!.displayName || auth.currentUser!.email?.split('@')[0] || 'User',
        photoURL: localAvatar || auth.currentUser!.photoURL,
        isGuest: false,
        currentOrganizationId: lastOrgId !== null ? lastOrgId : (prev?.currentOrganizationId || '')
      }));
    }
  };

  const handleOrgSwitch = (orgId: string) => {
    if (!user) return;

    // Persist selection locally
    localStorage.setItem(`lastOrgId_${user.uid}`, orgId);

    // Update user state to trigger re-renders in child components
    setUser(prev => prev ? {
      ...prev,
      currentOrganizationId: orgId
    } : null);
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
    return <Auth onLogin={handleLogin} isChecking={accessStatus === 'checking'} />;
  }

  // Access Denied / Pending UI
  if (accessStatus === 'pending') {
    return <Auth onLogin={handleLogin} showPendingMessage={true} />;
  }

  if (accessStatus === 'unregistered') {
    const handleRequestAccess = () => {
      if (auth?.currentUser) {
        setAccessStatus('pending');
        StorageService.requestAccess({
          email: auth.currentUser.email || '',
          displayName: auth.currentUser.displayName || 'User',
          photoURL: auth.currentUser.photoURL || undefined
        }).catch(e => console.error(e));
      }
    };
    return <Auth onLogin={handleLogin} showUnregisteredMessage={true} onRequestAccess={handleRequestAccess} currentUser={auth?.currentUser} />;
  }

  if (accessStatus === 'blocked') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center bg-red-100 text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">存取被拒絕</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              您的帳號已被停用或拒絕存取。如有疑問，請聯繫系統管理員。
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
          >
            登出
          </button>
        </div>
      </div>
    );
  }

  // Standalone Editor Mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'standalone') {
    const initialMapId = urlParams.get('mapId') || undefined;
    return (
      <div className="h-screen w-full bg-slate-50">
        <Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>}>
          <EquipmentMapEditor
            user={user}
            isOpen={true}
            onClose={() => window.close()}
            initialMapId={initialMapId}
          />
        </Suspense>
      </div>
    );
  }

  const LoadingFallback = () => (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mb-4"></div>
      <p className="text-slate-600 font-medium">載入中...</p>
    </div>
  );

  const isAdmin = user?.role === 'admin' || user?.email?.toLowerCase() === 'b28803078@gmail.com';

  return (
    <div className="h-screen w-full bg-slate-50 relative overflow-hidden flex flex-col font-sans">
      <Suspense fallback={<LoadingFallback />}>
        {currentView === 'DASHBOARD' ? (
          <Dashboard
            user={user}
            isAdmin={isAdmin}
            guestExpiry={guestExpiry}
            onCreateNew={() => {
              setSelectedReport(undefined);
              setCurrentView('CHECKLIST_INSPECTION');
            }}
            onAddEquipment={() => {
              setEditingEquipment(null);
              setCurrentView('EQUIPMENT_MANAGER');
            }}
            onMyEquipment={(filter) => {
              setEquipmentFilter(filter || '');
              setCurrentView('MY_EQUIPMENT');
            }}
            onSelectReport={(report) => {
              setSelectedReport(report);
              setCurrentView('INSPECTION');
            }}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
            onManageHierarchy={() => setCurrentView('HIERARCHY_MANAGER')}
            onOpenMapEditor={() => setCurrentView('MAP_EDITOR')}
            onOrgSwitch={handleOrgSwitch}
            systemSettings={systemSettings}
          />
        ) : currentView === 'MAP_EDITOR' ? (
          <EquipmentMapEditor
            user={user}
            isAdmin={isAdmin}
            isOpen={true}
            onClose={() => setCurrentView('DASHBOARD')}
          />
        ) : currentView === 'HIERARCHY_MANAGER' ? (
          <HierarchyManager
            user={user}
            onBack={() => setCurrentView('DASHBOARD')}
            systemSettings={systemSettings}
          />
        ) : currentView === 'EQUIPMENT_MANAGER' ? (
          <EquipmentManager
            key={editingEquipment?.id || 'new'}
            user={user}
            isAdmin={isAdmin}
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
            systemSettings={systemSettings}
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
            initialQuery={equipmentFilter}
            systemSettings={systemSettings}
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
      </Suspense>
    </div>
  );
};

export default App;
