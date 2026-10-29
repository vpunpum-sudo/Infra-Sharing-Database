import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, User as UserIcon, Camera, Key, Save, Moon, Sun, Monitor } from 'lucide-react';
import { db, storage, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { AsyncActionButton } from './AsyncActionButton';
import { ConfirmModal } from './ConfirmModal';
import { useToast } from './Toast';
import { describeActionError } from '../utils/asyncAction';
import { passwordSectionMode, passwordProviderEmail } from '../utils/authProviders';
import { changePassword, PROFILE_PASSWORD_MESSAGES } from '../utils/profilePassword';
import { PHOTO_MESSAGES, validatePhotoFile, describePhotoError, makeAvatarObjectName } from '../utils/profilePhoto';
import { resizeToAvatar } from '../utils/profilePhotoBrowser';
import { runPhotoJob, type PhotoCheckpoint, type PhotoDependencies } from '../services/profilePhotoService';
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
  // An explicitly cleared Firestore photo must never fall back to an older Auth photo.
  const [savedPhotoUrl, setSavedPhotoUrl] = useState(appUser?.photoURL ?? user.photoURL ?? '');
  const [staged, setStaged] = useState<{ blob: Blob; url: string } | null>(null);
  const [job, setJob] = useState<{ checkpoint: PhotoCheckpoint; hasRetry: boolean } | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  type Message = { type: 'success' | 'error'; text: string } | null;
  const [profileMessage, setProfileMessage] = useState<Message>(null);
  const [photoMessage, setPhotoMessage] = useState<Message>(null);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);
  const notify = useToast();
  const mounted = useRef(true);
  const choiceGeneration = useRef(0);
  const previewUrl = useRef<string | null>(null);
  const profileBusy = useRef(false);
  const passwordBusy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mode = passwordSectionMode(user.providerData);
  const photoDisabled = photoPending || savePending;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      choiceGeneration.current += 1;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, []);

  const clearChoice = () => {
    choiceGeneration.current += 1;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setStaged(null);
    setJob(null);
    setDecoding(false);
    setPhotoMessage(null);
  };
  const pickPhoto = async (file: File) => {
    if (profileBusy.current) return;
    clearChoice();
    const generation = choiceGeneration.current;
    const isCurrent = () => mounted.current && generation === choiceGeneration.current;
    const validation = validatePhotoFile(file);
    if (validation) { setPhotoMessage({ type: 'error', text: validation }); notify(validation, 'error'); return; }
    setDecoding(true);
    try {
      const blob = await resizeToAvatar(file);
      if (!isCurrent()) return;
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setStaged({ blob, url });
    } catch (error) {
      if (!isCurrent()) return;
      const text = describePhotoError(error);
      setPhotoMessage({ type: 'error', text }); notify(text, 'error');
    } finally { if (isCurrent()) setDecoding(false); }
  };
  const photoDeps: PhotoDependencies = {
    uid: user.uid, bucket: storage.app.options.storageBucket || '',
    newObjectName: () => makeAvatarObjectName(Date.now(), Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('')),
    uploadBytes: (path, blob) => uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' }),
    getDownloadURL: path => getDownloadURL(ref(storage, path)),
    // The SDK sends null as JSON null, which the Auth backend rejects; an empty string clears the photo.
    updateAuthPhoto: photoURL => updateProfile(user, { photoURL: photoURL ?? '' }),
    writeUserPhoto: photoURL => setDoc(doc(db, 'users', user.uid), { photoURL }, { merge: true }),
    deleteObject: path => deleteObject(ref(storage, path)),
    logSuccess: () => logActivity('update_profile', 'Updated profile photo')
  };
  const executePhoto = async (checkpoint: PhotoCheckpoint) => {
    if (profileBusy.current) return;
    profileBusy.current = true;
    setPhotoPending(true); setPhotoMessage(null);
    setJob({ checkpoint, hasRetry: false });
    const generation = choiceGeneration.current;
    const isCurrent = () => mounted.current && generation === choiceGeneration.current;
    try {
      const result = await runPhotoJob(checkpoint, photoDeps, isCurrent);
      if (!isCurrent() || result.status === 'stale') return;
      if (result.status === 'done') {
        setSavedPhotoUrl(checkpoint.kind === 'remove' ? '' : checkpoint.uploadedUrl!);
        clearChoice();
      } else { setJob({ checkpoint, hasRetry: true }); }
      const type = result.status === 'done' ? 'success' : 'error';
      setPhotoMessage({ type, text: result.message }); notify(result.message, type);
      if (result.status === 'failed') throw new Error(PHOTO_MESSAGES.generic);
    } finally {
      profileBusy.current = false;
      if (mounted.current) setPhotoPending(false);
    }
  };
  const confirmPhoto = async () => {
    if (!staged || profileBusy.current) return;
    await executePhoto({ kind: 'upload', blob: staged.blob, previousUrl: savedPhotoUrl, authUpdated: false, firestoreUpdated: false });
  };
  const removePhoto = () => {
    if (profileBusy.current) return;
    setRemoveOpen(false);
    clearChoice();
    void executePhoto({ kind: 'remove', previousUrl: savedPhotoUrl, authUpdated: false, firestoreUpdated: false }).catch(() => undefined);
  };
  const handleUpdateProfile = async () => {
    if (profileBusy.current) return;
    profileBusy.current = true; setSavePending(true); setProfileMessage(null);
    try {
      await updateProfile(user, { displayName });
      if (appUser) {
        await setDoc(doc(db, 'users', user.uid), { ...appUser, displayName, photoURL: savedPhotoUrl }, { merge: true });
        try { await logActivity('update_profile', 'Updated profile information', { displayName }); } catch { /* Profile was saved. */ }
      }
      if (mounted.current) {
        const text = 'บันทึกข้อมูลโปรไฟล์สำเร็จ';
        setProfileMessage({ type: 'success', text }); notify(text, 'success');
      }
    } catch (error) {
      if (mounted.current) {
        const text = describeActionError(error, 'บันทึกข้อมูลโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
        setProfileMessage({ type: 'error', text }); notify(text, 'error');
      }
      throw new Error('บันทึกข้อมูลโปรไฟล์ไม่สำเร็จ');
    } finally { profileBusy.current = false; if (mounted.current) setSavePending(false); }
  };
  const handleUpdatePassword = async () => {
    if (passwordBusy.current) return;
    passwordBusy.current = true; setPasswordPending(true); setPasswordMessage(null);
    try {
      const result = await changePassword({ current: currentPassword, next: newPassword, confirm: confirmPassword, email: passwordProviderEmail(user.providerData) }, {
        buildCredential: (email, password) => EmailAuthProvider.credential(email, password),
        reauthenticate: credential => reauthenticateWithCredential(user, credential),
        updatePassword: next => updatePassword(user, next)
      });
      if (!mounted.current) return;
      if (result.status === 'done') { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
      const type = result.status === 'done' ? 'success' : 'error';
      setPasswordMessage({ type, text: result.message }); notify(result.message, type);
      if (result.status === 'failed') throw new Error('เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally { passwordBusy.current = false; if (mounted.current) setPasswordPending(false); }
  };
  const inlineMessage = (message: Message) => message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`text-sm leading-relaxed break-words ${message.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>{message.text}</p>;
  const inputClass = 'w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10';

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-12 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="max-w-3xl mx-auto relative z-10">
        <button type="button"
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
            {/* Profile Info Section */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-brand-500/10 text-brand-400 rounded-2xl flex items-center justify-center border border-brand-500/20 shadow-lg shadow-brand-500/5">
                  <UserIcon size={24} />
                </div>
                <h2 className="text-2xl font-black text-slate-100 tracking-tight">Personal Information</h2>
              </div>

              <div className="flex flex-col md:flex-row gap-10 items-start">
                <div className="w-full md:w-52 shrink-0 space-y-4" aria-busy={photoPending || decoding}>
                  <div className="relative w-40">
                    <div className="w-40 h-40 bg-slate-800 rounded-[2rem] overflow-hidden border-4 border-slate-800">
                      {staged?.url || savedPhotoUrl ? <img data-wi-pii="profile-avatar" src={staged?.url || savedPhotoUrl} alt={staged ? 'ตัวอย่างรูปโปรไฟล์ก่อนบันทึก' : 'Profile'} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserIcon size={64} className="m-auto h-full text-slate-500" />}
                    </div>
                    <button type="button" aria-label="เลือกรูปโปรไฟล์จากอุปกรณ์" disabled={photoDisabled} onClick={() => fileInput.current?.click()} className="absolute -bottom-2 -right-2 w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center text-slate-100 disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-brand-400"><Camera size={20} /></button>
                  </div>
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="ไฟล์รูปโปรไฟล์" className="hidden" disabled={photoDisabled} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void pickPhoto(file); }} />
                  <button type="button" disabled={photoDisabled} onClick={() => fileInput.current?.click()} className="btn-secondary min-h-[44px] px-3 py-2 w-full">เลือกรูปจากอุปกรณ์</button>
                  <p className="text-sm text-slate-400">JPEG, PNG หรือ WebP ไม่เกิน 10 MiB ระบบครอปกลางรูปเป็นสี่เหลี่ยมจัตุรัส</p>
                  {decoding && <p role="status" className="text-sm text-slate-300">กำลังเตรียมรูป…</p>}
                  {staged && !job?.hasRetry && <AsyncActionButton type="button" onAction={confirmPhoto} disabled={photoDisabled} pending={photoPending} pendingLabel="กำลังบันทึกรูป…" className="min-h-[44px] px-3 py-2 w-full">ใช้รูปนี้</AsyncActionButton>}
                  {job?.hasRetry && <AsyncActionButton type="button" onAction={() => executePhoto(job.checkpoint)} disabled={photoDisabled} pendingLabel="กำลังลองบันทึก…" className="min-h-[44px] px-3 py-2 w-full">ลองบันทึกอีกครั้ง</AsyncActionButton>}
                  {(staged || decoding || job?.hasRetry) && <button type="button" onClick={clearChoice} disabled={photoDisabled} className="btn-secondary min-h-[44px] px-3 py-2 w-full">ยกเลิก</button>}
                  {savedPhotoUrl && <button type="button" disabled={photoDisabled} onClick={() => setRemoveOpen(true)} className="min-h-[44px] px-3 py-2 text-rose-400 disabled:opacity-60">ลบรูปโปรไฟล์</button>}
                  {inlineMessage(photoMessage)}
                </div>
                <form noValidate onSubmit={event => event.preventDefault()} className="flex-1 min-w-0 w-full space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="profile-display-name" className="block text-sm font-bold text-slate-300">Display Name</label>
                    <input id="profile-display-name" data-wi-pii="profile-display-name" type="text" value={displayName} onChange={event => setDisplayName(event.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="profile-email" className="block text-sm font-bold text-slate-300">Email Address</label>
                    <input id="profile-email" data-wi-pii="profile-email" type="email" value={user.email || ''} disabled className={`${inputClass} text-slate-400 cursor-not-allowed`} />
                    <p className="text-sm text-slate-400">อีเมลเปลี่ยนเองไม่ได้ กรุณาติดต่อผู้ดูแลระบบ</p>
                  </div>
                  {inlineMessage(profileMessage)}
                  <div className="flex justify-end pt-4">
                    <AsyncActionButton type="submit" onAction={handleUpdateProfile} disabled={photoDisabled} pending={savePending} pendingLabel="กำลังบันทึก…" className="px-6 py-4 rounded-2xl"><Save size={20} />Save Changes</AsyncActionButton>
                  </div>
                </form>
              </div>
              <ConfirmModal isOpen={removeOpen} title="ลบรูปโปรไฟล์?" message="ต้องการลบรูปโปรไฟล์ปัจจุบันหรือไม่?" confirmText="ลบรูปโปรไฟล์" onConfirm={removePhoto} onCancel={() => setRemoveOpen(false)} />
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
                <button type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-4 transition-all ${theme === 'dark' ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300'}`}
                >
                  <Moon size={32} />
                  <span className="font-black uppercase tracking-widest text-xs">Dark Mode</span>
                </button>
                <button type="button"
                  onClick={() => setTheme('light')}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-4 transition-all ${theme === 'light' ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300'}`}
                >
                  <Sun size={32} />
                  <span className="font-black uppercase tracking-widest text-xs">Light Mode</span>
                </button>
              </div>
            </section>

            <section className="pt-12 border-t border-slate-800">
              <div className="flex items-center gap-4 mb-4">
                <Key size={24} className="text-amber-400" />
                <h2 className="text-2xl font-black text-slate-100 tracking-tight">Security & Password</h2>
              </div>
              {(mode === 'password' || mode === 'password+google') ? <>
                <p className="text-sm text-slate-400 mb-6">ยืนยันรหัสผ่านปัจจุบันก่อนเปลี่ยนรหัสผ่าน{mode === 'password+google' && ' รหัสผ่านนี้ใช้สำหรับเข้าสู่ระบบด้วยอีเมลเท่านั้น ไม่เปลี่ยนรหัสผ่านบัญชี Google'}</p>
                <form noValidate onSubmit={event => event.preventDefault()} className="space-y-6 max-w-md">
                  <div className="space-y-2"><label htmlFor="current-password" className="block text-sm text-slate-300">รหัสผ่านปัจจุบัน</label><input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className={inputClass} /></div>
                  <div className="space-y-2"><label htmlFor="new-password" className="block text-sm text-slate-300">รหัสผ่านใหม่</label><input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className={inputClass} /></div>
                  <div className="space-y-2"><label htmlFor="confirm-password" className="block text-sm text-slate-300">ยืนยันรหัสผ่านใหม่</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className={inputClass} /></div>
                  {inlineMessage(passwordMessage)}
                  <AsyncActionButton type="submit" onAction={handleUpdatePassword} pending={passwordPending} pendingLabel="กำลังเปลี่ยนรหัสผ่าน…" className="px-6 py-4 rounded-2xl">เปลี่ยนรหัสผ่าน</AsyncActionButton>
                </form>
              </> : <p className="text-sm text-slate-300 leading-relaxed">{mode === 'google-only' ? 'บัญชีนี้เข้าสู่ระบบด้วย Google รหัสผ่านจัดการผ่านบัญชี Google หากต้องการความช่วยเหลือ กรุณาติดต่อผู้ดูแลระบบ' : mode === 'password-no-email' ? PROFILE_PASSWORD_MESSAGES.noEmail : 'บัญชีนี้ไม่มีวิธีเข้าสู่ระบบด้วยรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบหากต้องการความช่วยเหลือ'}</p>}
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
