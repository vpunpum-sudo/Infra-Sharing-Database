import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Key, Loader2, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { db, auth, updatePassword, logout } from '../firebase';
import { User as AppUser } from '../types';

interface ForceChangePasswordProps {
  user: FirebaseUser;
  appUser: AppUser;
}

export const ForceChangePassword: React.FC<ForceChangePasswordProps> = ({ user, appUser }) => {
  const [step, setStep] = useState<'notice' | 'form'>('notice');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'รหัสผ่านไม่ตรงกัน' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await updatePassword(user, newPassword);
      
      // Update Firestore IMMEDIATELY to clear the flag
      // Use a surgical update to avoid overwriting other fields with potentially stale data
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { requiresPasswordChange: false }, { merge: true });
      
      setMessage({ type: 'success', text: 'เปลี่ยนรหัสผ่านสำเร็จ! กำลังนำคุณเข้าสู่ระบบ...' });
      
      // The real-time listener in App.tsx will pick up the change and redirect the user automatically.
      // We don't need a timeout for the DB update anymore, but we can keep a small delay 
      // for the UI if we want, though the redirect will likely happen instantly.
    } catch (error: any) {
      console.error("Error updating password:", error);
      let errorText = 'ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาลองใหม่อีกครั้ง';
      if (error.code === 'auth/requires-recent-login') {
        errorText = 'เซสชันของคุณหมดอายุ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่อีกครั้งเพื่อเปลี่ยนรหัสผ่าน';
      }
      setMessage({ type: 'error', text: error.message || errorText });
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-10 text-slate-100 text-center relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid-modal" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--color-slate-100)" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-modal)" />
              </svg>
            </div>
            
            <motion.div 
              initial={{ scale: 0.5, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
              className="w-16 h-16 bg-slate-900/20 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-xl shadow-inner border border-slate-600"
            >
              <Key size={32} className="text-slate-100" />
            </motion.div>
            
            <h1 className="text-xl font-black tracking-tight mb-2">
              {step === 'notice' ? 'ความปลอดภัยของบัญชี' : 'เปลี่ยนรหัสผ่านใหม่'}
            </h1>
            <p className="text-brand-100 text-xs font-medium leading-relaxed">
              {step === 'notice' 
                ? 'บัญชีของคุณจำเป็นต้องเปลี่ยนรหัสผ่านก่อนเริ่มใช้งานเพื่อความปลอดภัย' 
                : 'กรุณากำหนดรหัสผ่านใหม่ที่คุณต้องการใช้งาน'}
            </p>
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              {step === 'notice' ? (
                <motion.div 
                  key="notice"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3.5">
                    <AlertCircle className="text-amber-600 shrink-0" size={20} />
                    <p className="text-xs text-amber-900 font-medium leading-relaxed">
                      นี่เป็นการเข้าสู่ระบบครั้งแรก หรือรหัสผ่านของคุณถูกรีเซ็ตโดยผู้ดูแลระบบ เพื่อความปลอดภัยสูงสุด กรุณาเปลี่ยนรหัสผ่านใหม่ทันที
                    </p>
                  </div>
                  
                  <button 
                    onClick={() => setStep('form')}
                    className="w-full bg-brand-600 text-slate-100 py-4 rounded-2xl font-black text-base hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-3 group"
                  >
                    <span>คลิกเพื่อเปลี่ยนรหัสผ่าน</span>
                    <motion.div
                      animate={{ x: [0, 5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      <Key size={18} />
                    </motion.div>
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key="form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {message && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-3.5 rounded-2xl flex items-center gap-3 mb-5 ${
                        message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                      }`}
                    >
                      {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                      <p className="text-xs font-bold">{message.text}</p>
                    </motion.div>
                  )}

                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">รหัสผ่านใหม่</label>
                      <input 
                        type="password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700 p-3 rounded-xl text-slate-100 font-bold outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-sm"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ยืนยันรหัสผ่านใหม่</label>
                      <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700 p-3 rounded-xl text-slate-100 font-bold outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-sm"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    
                    <div className="pt-3 space-y-2.5">
                      <button 
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-600 text-slate-100 py-4 rounded-xl font-black text-base hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                        ยืนยันและเริ่มใช้งาน
                      </button>
                      
                      <button 
                        type="button"
                        onClick={() => setStep('notice')}
                        className="w-full text-slate-400 hover:text-slate-300 font-bold text-xs py-1.5 transition-colors"
                      >
                        ย้อนกลับ
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 pt-5 border-t border-slate-800">
              <button 
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-500 font-bold text-xs transition-all group"
              >
                <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" /> 
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
