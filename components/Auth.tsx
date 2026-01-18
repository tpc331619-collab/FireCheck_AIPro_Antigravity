
import React, { useState } from 'react';
import { auth, googleProvider } from '../services/firebase';
import { signInWithPopup } from 'firebase/auth';
import { ShieldCheck, User, AlertCircle, Zap } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AuthProps {
  onLogin: (user: any, isGuest: boolean) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const { t } = useLanguage();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuestLogin = () => {
    onLogin({ uid: 'guest', email: null, displayName: t('guest') }, true);
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
      onLogin(result.user, false);
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('登入視窗已被關閉，請再試一次。');
      } else if (err.code === 'auth/cancelled-by-user') {
        setError('登入已被取消。');
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-900">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/login-bg.png"
          alt="Fire Safety Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/80 to-slate-800/80 backdrop-blur-[2px]" />
      </div>

      <div className="w-full max-w-md bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 z-10 overflow-hidden relative">
        {/* Header */}
        <div className="pt-12 pb-8 px-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-red-600 to-orange-500 shadow-lg shadow-orange-500/20 flex items-center justify-center mb-6">
            <ShieldCheck className="text-white w-8 h-8" strokeWidth={2.5} />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
            FireCheck <span className="text-red-600">Pro</span>
          </h1>
          <p className="text-slate-500 font-medium text-sm">
            AI 智能消防安全檢查系統
          </p>
        </div>

        {/* Content */}
        <div className="px-10 pb-12">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-start animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
              <span className="font-medium leading-tight">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full relative flex items-center justify-center gap-3 py-4 px-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-md text-slate-700 font-bold transition-all duration-200 disabled:opacity-50 group"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-200 border-t-red-600 rounded-full animate-spin" />
              ) : (
                <>
                  <div className="absolute left-4">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  </div>
                  <span>使用 Google 登入</span>
                </>
              )}
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-white/50 backdrop-blur-sm text-[10px] font-bold text-slate-400 uppercase tracking-widest">or continue as</span>
              </div>
            </div>

            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-100 rounded-xl transition-all duration-200 font-semibold disabled:opacity-50 group"
            >
              <User className="w-5 h-5 text-slate-400 group-hover:text-slate-500 transition-colors" />
              {t('guest')}
            </button>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="py-4 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100 text-center">
          <p className="flex items-center justify-center text-[10px] sm:text-xs text-slate-400 font-medium tracking-wide gap-1.5 opacity-70">
            <Zap className="w-3.5 h-3.5 text-amber-500" fill="currentColor" />
            <span>POWERED BY ADVANCED AI</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
