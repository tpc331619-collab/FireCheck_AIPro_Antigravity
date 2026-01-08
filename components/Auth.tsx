
import React, { useState } from 'react';
import { AuthMode } from '../types';
import { THEME_COLORS } from '../constants';
import { auth, googleProvider } from '../services/firebase';
// Fix: Use standard modular SDK function imports from firebase/auth
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { ShieldCheck, User, Lock, Mail, ChevronRight, Zap, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AuthProps {
  onLogin: (user: any, isGuest: boolean) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuestLogin = () => {
    onLogin({ uid: 'guest', email: null, displayName: t('guest') }, true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!auth) {
        setError('Firebase 未配置。請使用訪客模式。');
        setLoading(false);
        return;
    }

    try {
      if (mode === 'LOGIN') {
        const result = await signInWithEmailAndPassword(auth, email, password);
        onLogin(result.user, false);
      } else if (mode === 'REGISTER') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        onLogin(result.user, false);
      } else if (mode === 'FORGOT_PASSWORD') {
        await sendPasswordResetEmail(auth, email);
        alert('重設密碼信件已發送');
        setMode('LOGIN');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential') setError('帳號或密碼錯誤');
      else if (err.code === 'auth/email-already-in-use') setError('此 Email 已被註冊');
      else if (err.code === 'auth/weak-password') setError('密碼強度不足');
      else setError('發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth || !googleProvider) {
        setError('Firebase 配置缺失，無法使用 Google 登入。請使用訪客模式。');
        return;
    }
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      onLogin(result.user, false);
    } catch (err) {
      console.error(err);
      setError('Google 登入失敗');
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

      <div className="bg-white w-full max-md rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-8 pb-6 text-center bg-gradient-to-br from-slate-50 to-slate-100 border-b border-slate-100">
           <div className="w-16 h-16 bg-red-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-red-200 mb-4 transform rotate-3">
             <ShieldCheck className="text-white w-10 h-10" />
           </div>
           <h1 className="text-2xl font-bold text-slate-800 tracking-tight">FireCheck AI Pro</h1>
           <p className="text-slate-500 text-sm mt-1">專業消防查檢 • AI 智能輔助</p>
        </div>

        {/* Form */}
        <div className="p-8 pt-6">
           {error && (
             <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center">
               <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
               {error}
             </div>
           )}

           <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                 <label className="text-xs font-bold text-slate-500 uppercase ml-1">{t('email')}</label>
                 <div className="relative">
                   <Mail className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                   <input 
                     type="email" 
                     required
                     className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
                     placeholder="name@company.com"
                     value={email}
                     onChange={e => setEmail(e.target.value)}
                   />
                 </div>
              </div>

              {mode !== 'FORGOT_PASSWORD' && (
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">{t('password')}</label>
                   <div className="relative">
                     <Lock className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                     <input 
                       type="password" 
                       required
                       className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
                       placeholder="••••••••"
                       value={password}
                       onChange={e => setPassword(e.target.value)}
                     />
                   </div>
                 </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 rounded-xl text-white font-bold text-lg shadow-lg shadow-red-200 hover:shadow-red-300 transform active:scale-[0.98] transition-all flex justify-center items-center"
                style={{ backgroundColor: THEME_COLORS.primary }}
              >
                {loading ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"/> : (
                   mode === 'LOGIN' ? t('loginTitle') : mode === 'REGISTER' ? t('registerTitle') : '發送重設信'
                )}
              </button>
           </form>

           {mode === 'LOGIN' && (
             <>
               <div className="relative my-6">
                 <div className="absolute inset-0 flex items-center">
                   <div className="w-full border-t border-slate-200"></div>
                 </div>
                 <div className="relative flex justify-center text-sm">
                   <span className="px-2 bg-white text-slate-500">{t('quickLogin')}</span>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                 <button 
                   onClick={handleGoogleLogin}
                   className="flex items-center justify-center py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-700 font-medium"
                 >
                   <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                     <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                     <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                     <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                     <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                   </svg>
                   Google
                 </button>
                 <button 
                   onClick={handleGuestLogin}
                   className="flex items-center justify-center py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-700 font-medium"
                 >
                   <User className="w-5 h-5 mr-2 text-slate-400" />
                   {t('guest')}
                 </button>
               </div>
             </>
           )}

           <div className="mt-6 text-center text-sm">
             {mode === 'LOGIN' ? (
               <p className="text-slate-500">
                 {t('noAccount')} <button onClick={() => setMode('REGISTER')} className="text-red-600 font-bold hover:underline">{t('registerNow')}</button>
                 <span className="mx-2 text-slate-300">|</span>
                 <button onClick={() => setMode('FORGOT_PASSWORD')} className="text-slate-500 hover:text-slate-800">{t('forgotPassword')}</button>
               </p>
             ) : (
               <p className="text-slate-500">
                 {t('haveAccount')} <button onClick={() => setMode('LOGIN')} className="text-red-600 font-bold hover:underline">{t('backToLogin')}</button>
               </p>
             )}
           </div>
        </div>
        
        {/* Offline Indicator */}
        <div className="bg-slate-50 p-3 text-center text-xs text-slate-400 border-t border-slate-100 flex items-center justify-center">
            <Zap className="w-3 h-3 mr-1" />
            {t('guestNote')}
        </div>
      </div>
    </div>
  );
};

export default Auth;
