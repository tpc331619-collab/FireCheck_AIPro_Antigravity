
import React, { useState } from 'react';
import { auth, googleProvider } from '../services/firebase';
import { signInWithPopup, signInAnonymously } from 'firebase/auth';
import { ShieldCheck, User, AlertCircle, Zap, Shield, ChevronRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AuthProps {
  onLogin: (user: any, isGuest: boolean) => void;
  showPendingMessage?: boolean;
  isChecking?: boolean;
  showUnregisteredMessage?: boolean;
  onRequestAccess?: () => void;
  currentUser?: any;
}

const Auth: React.FC<AuthProps> = ({ onLogin, showPendingMessage, isChecking, showUnregisteredMessage, onRequestAccess, currentUser }) => {
  const { t } = useLanguage();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuestLogin = async () => {
    try {
      setLoading(true);
      if (!auth) {
        // Fallback for no auth (should not happen in prod usually)
        onLogin({ uid: 'guest', email: null, displayName: t('guest') }, true);
        return;
      }
      const result = await signInAnonymously(auth);
      onLogin(result.user, true);
    } catch (err: any) {
      console.error("Guest Auth Error:", err);
      if (err.code === 'auth/admin-restricted-operation') {
        setError('請至 Firebase Console 啟用「匿名登入」功能 (Authentication > Sign-in method)，否則無法讀取資料。');
      } else {
        setError('訪客登入失敗: ' + (err.message || '未知錯誤'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth || !googleProvider) {
      setError('Firebase 配置缺失，無法使用 Google 登入。請確認已在 Firebase 控制台啟用此服務。');
      return;
    }

    setError('');
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      console.log(`[Auth] Google login success for ${result.user.email} (${result.user.uid})`);
      // Removed onLogin call to rely on onAuthStateChanged in App.tsx for whitelist enforcement
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-by-user') {
        // User voluntarily closed the popup, no need to show an error
        console.log('Login cancelled by user');
        setLoading(false); // Force stop spinner immediately
        return;
      } else if (err.code === 'auth/popup-blocked') {
        setError('登入視窗被瀏覽器攔截，請允許彈出視窗後再試一次。');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google 登入尚未在 Firebase Console 啟用。');
      } else {
        setError(`Google 登入失敗: ${err.message || '未知錯誤'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950 font-sans">

      {/* Checking/Verifying Overlay */}
      {isChecking && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-xl font-bold text-white tracking-widest">VERIFYING</h2>
          <p className="text-slate-400 text-sm mt-2 mb-6">正在驗證帳號權限...</p>
          <button
            onClick={() => auth?.signOut()}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-sm font-medium transition-colors border border-white/10"
          >
            取消 / 登出
          </button>
        </div>
      )}

      {/* Pending Message Overlay */}
      {showPendingMessage && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">帳號審核中</h2>
            <p className="text-slate-600 font-medium">
              這是新的帳號! <br />您的帳號已申請並等待審核，<br />審核通過後才使用
            </p>
            <button onClick={() => auth?.signOut()} className="w-full py-2.5 bg-slate-100 font-bold text-slate-600 rounded-xl hover:bg-slate-200 transition-colors">
              確認
            </button>
          </div>
        </div>
      )}

      {/* Unregistered Message Overlay (Manual Request) */}
      {showUnregisteredMessage && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">歡迎使用 FireCheck PRO</h2>
            <p className="text-slate-600 font-medium">
              您尚未註冊本系統。<br />
              <span className="text-sm text-slate-500">{currentUser?.email}</span>
            </p>
            <div className="pt-2 space-y-3">
              <button
                onClick={onRequestAccess}
                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              >
                申請存取權限
              </button>
              <button
                onClick={() => auth?.signOut()}
                className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                登出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Image with Tech Overlay */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none">
        <img
          src="/login-bg.png"
          alt="Fire Safety Background"
          className="w-full h-full object-cover opacity-60"
        />
        {/* Dark Tech Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-red-950/40 via-transparent to-blue-900/20 mix-blend-overlay" />

        {/* Tech Grid Patterns (Decorative) */}
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_100%,#000_70%,transparent_100%)]"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 z-10 overflow-hidden relative group">

        {/* Top Glow Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 opacity-80" />

        {/* Header */}
        <div className="pt-12 pb-8 px-8 flex flex-col items-center text-center relative">

          <div className="relative mb-8">
            <div className="absolute -inset-4 bg-red-500/20 rounded-full blur-xl animate-pulse"></div>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 shadow-[0_0_30px_rgba(220,38,38,0.5)] flex items-center justify-center relative border border-white/20">
              <ShieldCheck className="text-white w-10 h-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" strokeWidth={2} />
            </div>

            {/* Tech Accents around Icon */}
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-orange-400 rounded-tr-sm" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-orange-400 rounded-bl-sm" />
          </div>

          <h1 className="text-4xl font-black text-white tracking-widest uppercase mb-2 font-mono" style={{ textShadow: '0 0 20px rgba(0,0,0,0.5)' }}>
            FireCheck<span className="text-red-500">PRO</span>
          </h1>
          <div className="flex items-center gap-2 text-slate-300 font-medium text-sm tracking-wider bg-slate-800/50 px-3 py-1 rounded-full border border-white/5">
            <Zap className="w-3.5 h-3.5 text-orange-400" />
            <span>AI 智能消防安全檢查系統</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-10 pb-12">
          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 text-red-200 text-sm rounded-lg flex items-start animate-in fade-in slide-in-from-top-2 backdrop-blur-md">
              <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5 text-red-400" />
              <span className="font-medium leading-tight">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full relative flex items-center justify-center py-4 px-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-white font-bold transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 group/btn"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-red-600 rounded-full animate-spin" />
              ) : (
                <>
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full p-1">
                      <svg className="w-full h-full" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    </div>
                    <span className="tracking-wide text-gray-100">使用 Google 登入</span>
                  </div>
                  <ChevronRight className="absolute right-4 w-4 h-4 opacity-0 -translate-x-2 group-hover/btn:opacity-50 group-hover/btn:translate-x-0 transition-all text-slate-400" />
                </>
              )}
            </button>

            <div className="relative py-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-slate-900/50 backdrop-blur-xl text-[10px] font-bold text-slate-500 uppercase tracking-widest border border-white/5 py-1 rounded-full">System Access</span>
              </div>
            </div>

            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 border border-white/10 rounded-lg transition-all duration-300 hover:border-white/30 hover:text-white font-medium disabled:opacity-50 group/guest"
            >
              <User className="w-5 h-5 text-slate-400 group-hover/guest:text-white transition-colors" />
              <span className="tracking-wide">{t('guest')}</span>
            </button>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="py-4 bg-slate-950/40 backdrop-blur-md border-t border-white/5 text-center">
          <p className="flex items-center justify-center text-[10px] text-slate-500 font-medium tracking-[0.2em] gap-2 opacity-80 uppercase font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            System Operational
          </p>
        </div>
      </div>

      <div className="absolute bottom-4 text-center w-full z-10 opacity-40 hover:opacity-100 transition-opacity duration-500">
        <p className="text-[10px] text-slate-400 tracking-widest uppercase font-mono">Powered by Advanced AI Technlogy</p>
      </div>
    </div>
  );
};

export default Auth;
