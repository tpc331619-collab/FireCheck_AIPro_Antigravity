
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-red-600 rounded-full mix-blend-screen filter blur-[100px] opacity-20"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-orange-600 rounded-full mix-blend-screen filter blur-[100px] opacity-20"></div>
      </div>

      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-8 pb-10 text-center bg-gradient-to-br from-slate-50 to-slate-100 border-b border-slate-100">
          <div className="w-16 h-16 bg-red-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-red-200 mb-6 transform rotate-3">
            <ShieldCheck className="text-white w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">FireCheck AI Pro</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium italic">專業消防查檢 • AI 智能輔助</p>
        </div>

        {/* Action Buttons */}
        <div className="p-10 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center border border-red-100">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-red-100 hover:bg-red-50/30 transition-all text-slate-700 font-bold group shadow-sm active:scale-95 disabled:opacity-50"
            >
              <div className="bg-white p-1 rounded-md shadow-sm group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </div>
              {loading ? '連線中...' : '使用 Google 帳號登入'}
            </button>

            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-4 bg-slate-50 border-2 border-transparent rounded-2xl hover:bg-slate-100 transition-all text-slate-600 font-bold active:scale-95 disabled:opacity-50"
            >
              <User className="w-5 h-5 text-slate-400" />
              {t('guest')}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 p-5 text-center text-[10px] text-slate-400 border-t border-slate-100 flex items-center justify-center">
          <Zap className="w-3 h-3 mr-2 text-yellow-500 opacity-70" />
          <span className="tracking-tighter opacity-80 uppercase font-bold">{t('guestNote')}</span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
