
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
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

// --- Route Wrappers ---

const EquipmentManagerRoute = ({ user, isAdmin, systemSettings }: { user: UserProfile, isAdmin: boolean, systemSettings?: SystemSettings }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<EquipmentDefinition | null | undefined>(undefined);

  useEffect(() => {
    if (id && id !== 'new' && user.uid) {
      StorageService.getEquipmentById(id, user.uid, user.currentOrganizationId)
        .then(setData)
        .catch((err) => {
          console.error(err);
          setData(null);
        });
    } else {
      setData(null); // New mode
    }
  }, [id, user.uid, user.currentOrganizationId]);

  if (id && id !== 'new' && data === undefined) {
    return <div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div></div>;
  }

  return (
    <EquipmentManager
      key={id || 'new'}
      user={user}
      isAdmin={isAdmin}
      initialData={data}
      onBack={() => navigate(-1)}
      onSaved={() => navigate('/equipment')}
      systemSettings={systemSettings}
    />
  );
};

const InspectionFormRoute = ({ user }: { user: UserProfile }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<InspectionReport | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id && user.uid) {
      // Since we don't have getReportById, we fetch latest reports or implement a find.
      // Ideally StorageService should have getReportById.
      // For now, we rely on the fact that if we came from list, we might have it in cache or just fetch all?
      // Fetching all is heavy. Let's try to assume we can just fetch recent ones or implement getReportById later.
      // Workaround: Fetch all for now (as getReports does).
      // Optimization TODO: Implement getReportById
      StorageService.getReports(user.uid, undefined, true, user.currentOrganizationId)
        .then(reports => {
          const found = reports.find(r => r.id === id);
          setReport(found);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id, user.uid, user.currentOrganizationId]);

  if (loading) return <div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div></div>;

  return (
    <InspectionForm
      user={user}
      report={report}
      onBack={() => navigate('/')}
      onSaved={() => navigate('/')}
    />
  );
}

const MyEquipmentRoute = ({ user, systemSettings }: { user: UserProfile, systemSettings?: SystemSettings }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  // Internal state for filter since URL approach is not fully ready yet
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);

  return (
    <MyEquipment
      user={user}
      selectedSite={selectedSite}
      selectedBuilding={selectedBuilding}
      onFilterChange={(site, bld) => {
        setSelectedSite(site);
        setSelectedBuilding(bld);
      }}
      onBack={() => navigate('/')}
      onEdit={(item) => navigate(`/equipment/edit/${item.id}`)}
      initialQuery={query}
      systemSettings={systemSettings}
    />
  );
}

// --- Main App Component ---

const App: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [guestExpiry, setGuestExpiry] = useState<number | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | undefined>(undefined);

  // 保持篩選狀態的變數 (Moved to MyEquipment internal state or URL params ideally, keeping here locally if needed to pass down, but URL is better.
  // For now, we will NOT pass these to MyEquipment via props if we want full Router capability,
  // BUT Dashboard calls onMyEquipment(filter). We should handle that.)
  // We can pass initialQuery via URL search params?
  const [searchParams] = useSearchParams(); // To listen to changes if needed, but MyEquipmentRoute handles it.

  const [accessStatus, setAccessStatus] = useState<'approved' | 'pending' | 'blocked' | 'checking' | 'idle' | 'unregistered'>('idle');

  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const isGuest = firebaseUser.isAnonymous;
          let userRole: 'admin' | 'user' = 'user';

          // Whitelist Check Logic
          if (!isGuest) {
            try {
              if (firebaseUser.email?.toLowerCase() === 'b28803078@gmail.com') {
                setAccessStatus('approved');
                userRole = 'admin';
              } else {
                setAccessStatus('checking');
                const checkPromise = StorageService.checkWhitelist(firebaseUser.email || '');
                const timeoutPromise = new Promise<null>((_, reject) =>
                  setTimeout(() => reject(new Error('Network timeout checking whitelist')), 8000)
                );

                let whitelistEntry = null;
                try {
                  whitelistEntry = await Promise.race([checkPromise, timeoutPromise]);
                } catch (timeoutErr) {
                  console.error(timeoutErr);
                  throw timeoutErr; // Pass to outer catch
                }

                if (!whitelistEntry) {
                  setAccessStatus('unregistered');
                } else if (whitelistEntry.status !== 'approved') {
                  setAccessStatus(whitelistEntry.status);
                } else {
                  setAccessStatus('approved');
                  if (whitelistEntry.role === 'admin') userRole = 'admin';
                }
              }
            } catch (error: any) {
              console.error(`[App] Whitelist check FAILED for ${firebaseUser.email}:`, error);
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

          if (!isGuest) {
            try {
              const orgs = await StorageService.getUserOrganizations(firebaseUser.uid, firebaseUser.email);
              if (orgs.length > 0) {
                const lastOrgId = localStorage.getItem(`lastOrgId_${firebaseUser.uid}`);
                if (lastOrgId && orgs.some(o => o.id === lastOrgId)) {
                  userProfile.currentOrganizationId = lastOrgId;
                } else if (orgs.length > 0) {
                  userProfile.currentOrganizationId = orgs[0].id;
                }
              }
            } catch (e) {
              console.error('[App] Organization init failed', e);
            }
          }

          setUser(userProfile);
          StorageService.setGuestMode(isGuest);

          if (isGuest) {
            const storedExpiry = localStorage.getItem('guest_expiry');
            const now = Date.now();
            let expiry = storedExpiry ? parseInt(storedExpiry, 10) : 0;
            if (!expiry || expiry <= now) {
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
          setAccessStatus('idle');
          StorageService.setGuestMode(false);
          setGuestExpiry(null);
        }
        setInitializing(false);
      });

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
        } catch (error) {
          console.error('Error deleting anonymous account:', error);
          await auth.signOut();
        }
      } else {
        await auth.signOut();
      }
    }
    localStorage.removeItem('guest_expiry');
    setGuestExpiry(null);
    setUser(null);
    setAccessStatus('idle');
    navigate('/'); // Route back to home (which will show Auth)
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
    localStorage.setItem(`lastOrgId_${user.uid}`, orgId);
    setUser(prev => prev ? { ...prev, currentOrganizationId: orgId } : null);
  };

  // Standalone Check
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

  if (initializing) return <div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>;

  if (!user) {
    return <Auth onLogin={handleLogin} isChecking={accessStatus === 'checking'} />;
  }

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

  const LoadingFallback = () => (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mb-4"></div>
      <p className="text-slate-600 font-medium">載入中...</p>
    </div>
  );

  const isAdmin = user.role === 'admin' || user.email?.toLowerCase() === 'b28803078@gmail.com';

  return (
    <div className="h-screen w-full bg-slate-50 relative overflow-hidden flex flex-col font-sans">
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={
            <Dashboard
              user={user}
              isAdmin={isAdmin}
              guestExpiry={guestExpiry}
              onCreateNew={() => navigate('/inspection/check')}
              onAddEquipment={() => navigate('/equipment/new')}
              onMyEquipment={(filter) => {
                if (filter) {
                  navigate(`/equipment?q=${encodeURIComponent(filter)}`)
                } else {
                  navigate('/equipment')
                }
              }}
              onSelectReport={(report) => navigate(`/inspection/report/${report.id}`)}
              onLogout={handleLogout}
              onUserUpdate={handleUserUpdate}
              onManageHierarchy={() => navigate('/hierarchy')}
              onOpenMapEditor={() => navigate('/map-editor')}
              onOrgSwitch={handleOrgSwitch}
              systemSettings={systemSettings}
              onSystemSettingsUpdate={setSystemSettings}
            />
          } />

          <Route path="/dashboard" element={<Navigate to="/" replace />} />

          <Route path="/equipment" element={<MyEquipmentRoute user={user} systemSettings={systemSettings} />} />

          <Route path="/equipment/new" element={<EquipmentManagerRoute user={user} isAdmin={isAdmin} systemSettings={systemSettings} />} />
          <Route path="/equipment/edit/:id" element={<EquipmentManagerRoute user={user} isAdmin={isAdmin} systemSettings={systemSettings} />} />

          <Route path="/inspection/check" element={
            <ChecklistInspection
              user={user}
              onBack={() => navigate('/')}
            />
          } />

          <Route path="/inspection/report/:id" element={<InspectionFormRoute user={user} />} />

          <Route path="/hierarchy" element={
            <HierarchyManager
              user={user}
              onBack={() => navigate('/')}
              systemSettings={systemSettings}
            />
          } />

          <Route path="/map-editor" element={
            <EquipmentMapEditor
              user={user}
              isAdmin={isAdmin}
              isOpen={true} // Map Editor works better as "open" when routed to
              onClose={() => navigate('/')}
            />
          } />

          {/* Catch all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
};

export default App;
