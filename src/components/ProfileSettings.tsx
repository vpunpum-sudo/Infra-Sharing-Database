import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, User as UserIcon, Camera, Key, Save, Loader2, AlertCircle, CheckCircle2, Moon, Sun, Monitor } from 'lucide-react';
import { db, auth, updateProfile, updatePassword } from '../firebase';
import { User as AppUser } from '../types';
import { logActivity } from '../services/logService';

interface ProfileSettingsProps {
  user: FirebaseUser;
  appUser: AppUser | null;
  onBack: () => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ user, appUser, onBack, theme, setTheme }) => {
  const [displayName, setDisplayName] = useState(appUser?.displayName || user.displayName || '');
  const [photoURL, setPhotoURL] = useState(appUser?.photoURL || user.photoURL || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // Update Firebase Auth Profile
      await updateProfile(user, {
        displayName,
        photoURL
      });

      // Update Firestore User Doc
      if (appUser) {
        const updatedUser: AppUser = {
          ...appUser,
          displayName,
          photoURL
        };
        await setDoc(doc(db, 'users', user.uid), updatedUser, { merge: true });
        await logActivity('update_profile', `Updated profile information`, { displayName, photoURL });
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await updatePassword(user, newPassword);
      await logActivity('update_password', `Updated account password`);
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Password updated successfully!' });
    } catch (error: any) {
      console.error("Error updating password:", error);
      setMessage({ type: 'error', text: error.message || 'Failed to update password. You may need to re-authenticate.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-12 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="max-w-3xl mx-auto relative z-10">
        <button 
          onClick={onBack}
          className="flex items-center gap-3 text-slate-500 hover:text-slate-100 font-black mb-10 transition-all hover:-translate-x-1 group"
        >
          <ArrowLeft size={22} className="group-hover:text-brand-400 transition-colors" /> 
          <span className="uppercase tracking-widest text-xs">Back to Dashboard</span>
        </button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel rounded-[2.5rem] shadow-2xl border border-slate-700 overflow-hidden"
        >
          <div className="bg-brand-600 p-10 text-slate-100 relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid-profile" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--color-slate-100)" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-profile)" />
              </svg>
            </div>
            
            <h1 className="text-4xl font-black tracking-tighter mb-3 relative z-10">Profile Settings</h1>
            <p className="text-brand-100 font-black text-xs uppercase tracking-[0.2em] opacity-80 relative z-10">Manage your personal information and security</p>
          </div>

          <div className="p-10 bg-slate-900/60 backdrop-blur-xl space-y-12">
            {message && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`p-5 rounded-2xl flex items-center gap-4 border-2 ${
                  message.type === 'success' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                <p className="text-sm font-black tracking-tight leading-relaxed">{message.text}</p>
              </motion.div>
            )}

            {/* Profile Info Section */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-brand-500/10 text-brand-400 rounded-2xl flex items-center justify-center border border-brand-500/20 shadow-lg shadow-brand-500/5">
                  <UserIcon size={24} />
                </div>
                <h2 className="text-2xl font-black text-slate-100 tracking-tight">Personal Information</h2>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-8">
                <div className="flex flex-col md:flex-row gap-10 items-start">
                  <div className="relative group shrink-0">
                    <div className="w-40 h-40 bg-slate-800 rounded-[2rem] overflow-hidden border-4 border-slate-800 shadow-2xl transition-transform group-hover:scale-[1.02] duration-500">
                      {photoURL ? (
                        <img src={photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700">
                          <UserIcon size={64} />
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-brand-600 text-slate-100 rounded-2xl flex items-center justify-center shadow-2xl border-4 border-slate-900 group-hover:bg-brand-500 transition-colors cursor-pointer">
                      <Camera size={20} />
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-6">
                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Display Name</label>
                      <input 
                        type="text" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all placeholder:text-slate-500"
                        placeholder="Your Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Profile Image URL</label>
                      <input 
                        type="text" 
                        value={photoURL}
                        onChange={(e) => setPhotoURL(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all placeholder:text-slate-500"
                        placeholder="https://example.com/photo.jpg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                      <div className="relative">
                        <input 
                          type="email" 
                          value={user.email || ''}
                          disabled
                          className="w-full bg-slate-800/30 border border-slate-800 p-4 rounded-2xl text-slate-500 font-bold cursor-not-allowed"
                        />
                        <p className="text-[10px] text-slate-500 mt-2 ml-1 font-black uppercase tracking-widest italic">Email cannot be changed</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="bg-brand-600 text-slate-100 px-10 py-4 rounded-2xl font-black hover:bg-brand-500 shadow-2xl shadow-brand-500/20 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50 uppercase tracking-widest text-sm"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Save Changes
                  </button>
                </div>
              </form>
            </section>

            {/* Appearance Section */}
            <section className="pt-12 border-t border-slate-800">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                  <Monitor size={24} />
                </div>
                <h2 className="text-2xl font-black text-slate-100 tracking-tight">Appearance</h2>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-md">
                <button
                  onClick={() => setTheme('dark')}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-4 transition-all ${theme === 'dark' ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300'}`}
                >
                  <Moon size={32} />
                  <span className="font-black uppercase tracking-widest text-xs">Dark Mode</span>
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-4 transition-all ${theme === 'light' ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300'}`}
                >
                  <Sun size={32} />
                  <span className="font-black uppercase tracking-widest text-xs">Light Mode</span>
                </button>
              </div>
            </section>

            {/* Password Section - Only for non-Google users */}
            {!isGoogleUser && (
              <section className="pt-12 border-t border-slate-800">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-lg shadow-amber-500/5">
                    <Key size={24} />
                  </div>
                  <h2 className="text-2xl font-black text-slate-100 tracking-tight">Security & Password</h2>
                </div>

                <form onSubmit={handleUpdatePassword} className="space-y-6 max-w-md">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">New Password</label>
                    <input 
                      type="password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all placeholder:text-slate-500"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Confirm New Password</label>
                    <input 
                      type="password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all placeholder:text-slate-500"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <div className="flex justify-end pt-4">
                    <button 
                      type="submit"
                      disabled={loading}
                      className="bg-slate-100 text-slate-950 px-10 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50 uppercase tracking-widest text-sm shadow-xl"
                    >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <Key size={20} />}
                      Update Password
                    </button>
                  </div>
                </form>
              </section>
            )}

            {isGoogleUser && (
              <div className="pt-12 border-t border-slate-800">
                <div className="bg-blue-500/10 p-8 rounded-[2rem] border-2 border-blue-500/20 flex items-start gap-6">
                  <div className="w-14 h-14 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center shadow-sm shrink-0 border border-blue-500/30">
                    <AlertCircle size={28} />
                  </div>
                  <div>
                    <p className="text-lg font-black text-blue-400 mb-2">Google Account Linked</p>
                    <p className="text-sm text-blue-300/80 leading-relaxed font-medium">
                      You are signed in with Google. Password management and some profile details are managed through your Google Account settings for enhanced security.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
